from __future__ import annotations

import dataclasses
import json
import os
import hashlib
import re
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .config import ModelSpec
from .errors import ProviderError, SafetyError
from .process import clean_environment, executable, run_process
from .security import cloud_text, redact, safe_relative, contained
from .usage import normalized, opencode_delta, opencode_snapshot


def budget_timeout(provider, maximum):
    remaining = getattr(provider, "remaining", None)
    return min(maximum, remaining()) if callable(remaining) else maximum


def events(text: str) -> list[dict]:
    result = []
    for line in text.splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                result.append(value)
        except ValueError:
            continue
    return result


def usage_metrics(stream: list[dict], elapsed: float, provider: str) -> dict:
    usages, seen = [], set()
    tools, errors = set(), set()
    for event in stream:
        part = event.get("part") or {}
        kind = event.get("type")
        if provider == "codex" and kind == "turn.completed" and isinstance(event.get("usage"), dict):
            usages.append(event["usage"])
        if provider == "opencode" and kind == "step_finish" and isinstance(part.get("tokens"), dict):
            identity = part.get("id") or json.dumps(part, sort_keys=True)
            if identity not in seen:
                seen.add(identity)
                tokens = part["tokens"]
                usages.append({"input_tokens": tokens.get("input"), "output_tokens": tokens.get("output"), "reasoning_tokens": tokens.get("reasoning"), "cached_input_tokens": (tokens.get("cache") or {}).get("read"), "cache_write_tokens": (tokens.get("cache") or {}).get("write")})
        if kind == "tool_use":
            identity = part.get("callID") or part.get("id") or json.dumps(part, sort_keys=True)
            tools.add(identity)
            if (part.get("state") or {}).get("status") == "error":
                errors.add(identity)
        item = event.get("item") or {}
        if kind == "item.completed" and item.get("type") in {"command_execution", "mcp_tool_call", "web_search"}:
            tools.add(item.get("id") or json.dumps(item, sort_keys=True))
    def total(field):
        values = [u.get(field) for u in usages]
        return sum(values) if values and all(type(v) in {int, float} for v in values) else None
    return {"provider": provider, "elapsed_seconds": elapsed, "input_tokens": total("input_tokens"), "output_tokens": total("output_tokens"), "cached_input_tokens": total("cached_input_tokens"), "reasoning_tokens": total("reasoning_tokens"), "cache_write_tokens": total("cache_write_tokens"), "inference_seconds": None, "tokens_per_second": None, "tool_calls": len(tools) if stream else None, "tool_errors": len(errors) if stream else None}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ProviderError("Redirecionamento LM Studio bloqueado antes de conectar a outro host.")


class LMStudio:
    def __init__(self, config: dict, *, opener=None, runner=run_process):
        self.config, self.opener, self.runner = config, opener or build_opener(NoRedirect()).open, runner
        self.base_url = config["base_url"].rstrip("/")
        self.origin = self.base_url.removesuffix("/v1")

    def request(self, endpoint: str) -> dict:
        try:
            with self.opener(Request(endpoint, headers={"Accept": "application/json"}), timeout=budget_timeout(self, 5)) as response:
                if response.geturl().split("/", 3)[:3] != endpoint.split("/", 3)[:3]:
                    raise ProviderError("LM Studio redirecionou para um host externo; conexão bloqueada.")
                data = response.read(2_000_001)
                if len(data) > 2_000_000:
                    raise ProviderError("Resposta LM Studio excedeu limite.")
                value = json.loads(data)
                if not isinstance(value, dict):
                    raise ProviderError("LM Studio retornou JSON sem objeto na raiz.")
                return value
        except (URLError, OSError, ValueError) as exc:
            raise ProviderError(f"LM Studio indisponível em {self.base_url}: {exc}") from exc

    def inventory(self) -> dict:
        compatible = self.request(self.base_url + "/models")
        if not isinstance(compatible, dict) or not isinstance(compatible.get("data"), list) or any(not isinstance(m, dict) or not isinstance(m.get("id"), str) or not m["id"] for m in compatible["data"]):
            raise ProviderError("LM Studio retornou lista de modelos inválida.")
        models = []
        native = None
        try:
            native = self.request(self.origin + "/api/v1/models")
        except ProviderError:
            try:
                native = self.request(self.origin + "/api/v0/models")
            except ProviderError:
                pass
        if native and isinstance(native.get("models"), list):
            for model in native["models"]:
                if not isinstance(model, dict) or not isinstance(model.get("key"), str) or not model["key"] or not isinstance(model.get("loaded_instances", []), list):
                    raise ProviderError("Modelo nativo LM Studio malformado.")
                instances = model.get("loaded_instances", [])
                if any(not isinstance(i, dict) or not isinstance(i.get("id"), str) or not isinstance(i.get("config", {}), dict) for i in instances):
                    raise ProviderError("Instância LM Studio malformada.")
                for context in [model.get("max_context_length")] + [(i.get("config") or {}).get("context_length") for i in instances]:
                    if context is not None and (type(context) is not int or context <= 0):
                        raise ProviderError("Contexto LM Studio inválido.")
                models.append({"id": model["key"], "type": model.get("type"), "loaded": bool(instances), "instances": instances, "max_context_length": model.get("max_context_length"), "quantization": model.get("quantization"), "size_bytes": model.get("size_bytes")})
        elif native and isinstance(native.get("data"), list):
            for model in native["data"]:
                if not isinstance(model, dict) or not isinstance(model.get("id"), str) or model.get("state") not in {"loaded", "not-loaded"}:
                    raise ProviderError("Modelo LM Studio v0 malformado.")
                models.append({"id": model["id"], "type": model.get("type"), "loaded": model.get("state") == "loaded", "instances": [{"id": model["id"], "config": {"context_length": model.get("loaded_context_length")}}] if model.get("state") == "loaded" else [], "max_context_length": model.get("max_context_length"), "quantization": model.get("quantization")})
        else:
            models = [{"id": model["id"], "type": None, "loaded": None, "instances": []} for model in compatible["data"]]
        return {"base_url": self.base_url, "models": models, "native_inventory": native is not None, "model_gpu_distribution": None}

    def ensure_model(self, spec: ModelSpec, *, load=False) -> tuple[ModelSpec, dict]:
        inventory = self.inventory()
        model = next((m for m in inventory["models"] if m["id"] == spec.id or any(i.get("id") == spec.id for i in m["instances"])), None)
        if model is None:
            raise ProviderError(f"Modelo não encontrado: {spec.id}. Execute --status e configure um ID real.")
        if model.get("type") == "embedding" or model.get("type") == "embeddings":
            raise ProviderError("Modelo de embeddings não pode executar o Coder.")
        if model.get("max_context_length") and spec.context_length > model["max_context_length"]:
            raise ProviderError(f"Contexto solicitado excede o máximo informado pelo modelo {spec.id}.")
        if model["loaded"] is False:
            if not load:
                raise ProviderError(f"Modelo {spec.id} instalado, mas não carregado. Carregue no LM Studio ou use --load-model.")
            gpu = self.config.get("gpu", {})
            args = [executable("lms"), "load", model["id"], "--context-length", str(spec.context_length)]
            # Sem --yes: preserva decisões e prompts nativos do runtime.
            if not gpu.get("use_available_gpus", True):
                args += ["--gpu", "off"]
            elif gpu.get("load_mode") == "bionic-auto":
                args += ["--auto"]
            self.runner(args, cwd=Path.cwd(), timeout=budget_timeout(self, spec.timeout_seconds))
            return self.ensure_model(spec, load=False)
        instance = next((i for i in model["instances"] if i.get("id") == spec.id), None) or next(iter(model["instances"]), None)
        if instance:
            context = (instance.get("config") or {}).get("context_length")
            if context and context < spec.context_length:
                raise ProviderError(f"Modelo carregado com contexto {context}; configuração solicita {spec.context_length}. Recarregue pelo LM Studio.")
            spec = dataclasses.replace(spec, id=instance["id"])
        return spec, model


class CodexCLI:
    DISABLED = ("shell_tool", "unified_exec", "code_mode", "code_mode_host", "code_mode_tool_search", "plugins", "apps", "multi_agent", "browser_use", "computer_use", "image_generation", "view_image", "skill_search", "workspace_dependencies", "unbounded_connection_retries", "hooks", "memories")

    def __init__(self, config: dict, *, runner=run_process):
        self.config, self.runner = config, runner
        self.visual_images = []

    def prepare_visual(self, images):
        # Do not infer capabilities from a model's name or the account default.
        model = self.config.get("model")
        cache = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "models_cache.json"
        try:
            catalog = json.loads(cache.read_text(encoding="utf-8"))
            entry = next(m for m in catalog["models"] if m.get("slug") == model)
        except (OSError, ValueError, KeyError, StopIteration, TypeError) as exc:
            raise SafetyError("Capacidade visual desconhecida: configure cloud.model explicitamente e atualize o catálogo local do Codex.") from exc
        if not model or "image" not in entry.get("input_modalities", []):
            raise SafetyError("O modelo Cloud selecionado não comprova suporte a imagens.")
        help_text = self.runner([executable(self.config["executable"]), "exec", "--help"], cwd=images[0].parent, timeout=budget_timeout(self, 20)).stdout
        if "--image" not in help_text:
            raise SafetyError("Codex CLI não oferece transporte de imagens neste adaptador.")
        self.visual_images = [(p.resolve(), hashlib.sha256(p.read_bytes()).hexdigest()) for p in images]
        return {"model": model, "image_input": True, "attachments": len(images), "capability_source": str(cache), "transport": "codex exec --image"}

    def probe(self, cwd: Path) -> dict:
        exe = executable(self.config["executable"])
        version = self.runner([exe, "--version"], cwd=cwd, timeout=budget_timeout(self, 20)).stdout.strip()
        help_text = self.runner([exe, "exec", "--help"], cwd=cwd, timeout=budget_timeout(self, 20)).stdout
        needed = ("--json", "--output-schema", "--output-last-message", "--sandbox", "--ignore-user-config", "--ephemeral")
        if any(flag not in help_text for flag in needed):
            raise ProviderError("Codex CLI incompatível: faltam flags de execução segura. Consulte exec --help.")
        features = self.runner([exe, "features", "list"], cwd=cwd, timeout=budget_timeout(self, 20)).stdout
        known = {line.split()[0] for line in features.splitlines() if line.split()}
        if not (set(self.DISABLED) | {"skip_host_skill_discovery"}) <= known:
            raise ProviderError("Codex CLI não expõe as opções necessárias para desativar ferramentas; atualize/revise o adaptador.")
        auth_env = clean_environment()
        if "CODEX_HOME" in os.environ:
            auth_env["CODEX_HOME"] = os.environ["CODEX_HOME"]
        try:
            auth = self.runner([exe, "login", "status"], cwd=cwd, timeout=budget_timeout(self, 20), env=auth_env)
        except ProviderError as exc:
            if "not logged" in str(exc).lower():
                raise ProviderError("Codex CLI sem login. Execute codex login no seu terminal; nenhuma chave de API adicional é exigida.") from exc
            raise
        if "not logged" in (auth.stdout + auth.stderr).lower():
            raise ProviderError("Codex CLI sem login. Execute codex login no seu terminal; nenhuma chave de API adicional é exigida.")
        return {"version": version, "authenticated": True}

    def invoke(self, role: str, prompt: str, schema: Path, directory: Path, *, timeout: float | None = None) -> tuple[dict, dict]:
        self.last_metrics = None
        directory.mkdir(parents=True, exist_ok=True)
        (directory / ".agent-context-root").touch()
        output = directory / "response.json"
        args = [executable(self.config["executable"]), "exec", "--ignore-user-config", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--json", "--output-schema", str(schema.resolve()), "--output-last-message", str(output.resolve()), "-c", 'web_search="disabled"', "-c", "mcp_servers={}", "-c", "project_doc_max_bytes=0", "-c", 'project_root_markers=[".agent-context-root"]', "--enable", "skip_host_skill_discovery"]
        for feature in self.DISABLED:
            args.extend(["--disable", feature])
        if self.config.get("model"):
            args += ["--model", self.config["model"]]
        for image, digest in self.visual_images:
            if hashlib.sha256(image.read_bytes()).hexdigest() != digest:
                raise SafetyError("Imagem alterada após confirmação do transporte multimodal.")
            args += ["--image", str(image)]
        args.append("-")
        env = clean_environment()
        if "CODEX_HOME" in os.environ:
            env["CODEX_HOME"] = os.environ["CODEX_HOME"]
        try:
            process = self.runner(args, cwd=directory, timeout=timeout or self.config["timeout_seconds"], input_text=prompt, env=env)
            stream = events(process.stdout)
            self.last_metrics = normalized({**usage_metrics(stream, process.elapsed_seconds, "codex"), "model": self.config.get("model"), "source": "codex.events"})
            if self.visual_images:
                self.last_metrics["image_attachments"] = [{"path": str(p), "sha256": digest} for p, digest in self.visual_images]
            if any(e.get("type") in {"error", "turn.failed"} for e in stream):
                self.last_metrics["usage_complete"] = False
                raise ProviderError("Codex informou falha na sessão. Nenhuma aprovação registrada.")
            if any((e.get("item") or {}).get("type") in {"command_execution", "mcp_tool_call", "web_search"} for e in stream):
                raise SafetyError("Codex usou ferramenta fora do contrato sem ferramentas; resultado rejeitado.")
            response = output.read_text(encoding="utf-8-sig")
            cloud_text(response, 200000)
            return json.loads(response), self.last_metrics
        except ProviderError as exc:
            if exc.process:
                self.last_metrics = normalized({**usage_metrics(events(exc.process.stdout), exc.process.elapsed_seconds, "codex"), "usage_complete": False, "model": self.config.get("model"), "source": "codex.partial_events"})
            exc.metrics = self.last_metrics
            raise
        except (OSError, ValueError) as exc:
            raise ProviderError(f"Resposta {role} inválida: {exc}") from exc
        finally:
            output.unlink(missing_ok=True)


class OpenCodeCLI:
    def __init__(self, config: dict, local_config: dict, *, runner=run_process):
        self.config, self.local_config, self.runner = config, local_config, runner

    def compaction_policy(self, spec: ModelSpec) -> dict:
        # OpenCode 2.0.16 uses buffer=20000 by default, larger than an 8K window.
        # Keep automatic overflow recovery, with a positive primary prompt budget.
        settings = self.local_config.get("compaction", {})
        buffer = settings.get("buffer", min(2048, spec.context_length // 8))
        keep = settings.get("keep_tokens", min(2048, spec.context_length // 8))
        if any(type(v) is not int or v < 0 for v in (buffer, keep)):
            raise ProviderError("Buffer e retenção de compactação devem ser inteiros não negativos.")
        ceiling = spec.context_length - max(spec.output_tokens, buffer)
        if ceiling < 512 or keep >= ceiling:
            raise ProviderError("Política de compactação incompatível com contexto/saída do modelo.")
        return {"auto": True, "buffer": buffer, "keep": {"tokens": keep}}

    def environment(self, directory: Path, spec: ModelSpec, allowed: list[str], readable: list[str]) -> dict:
        env = clean_environment()
        home = directory / "opencode"
        for key, child in (("XDG_DATA_HOME", "data"), ("XDG_STATE_HOME", "state"), ("XDG_CACHE_HOME", "cache"), ("XDG_CONFIG_HOME", "config"), ("OPENCODE_CONFIG_DIR", "config"), ("OPENCODE_TEST_HOME", "home")):
            target = home / child
            target.mkdir(parents=True, exist_ok=True)
            env[key] = str(target.resolve())
        for key in ("OPENCODE_CONFIG_PROJECT_DISABLE", "OPENCODE_DISABLE_PROJECT_CONFIG", "OPENCODE_DISABLE_MODELS_FETCH", "OPENCODE_DISABLE_FILEWATCHER"):
            env[key] = "true"
        read = {"*": "deny"}
        edit = {"*": "deny"}
        for name in readable + ["PLAN.md"]:
            safe_relative(name)
            read[name] = "allow"
        for name in allowed:
            safe_relative(name, editable=True)
            edit[name] = "allow"
            read[name] = "allow"
        permissions = {"*": "deny", "read": read, "edit": edit, "glob": "allow", "grep": "allow", "shell": "deny", "bash": "deny", "external_directory": "deny", "subagent": "deny", "task": "deny", "webfetch": "deny", "websearch": "deny", "question": "deny", "skill": "deny", "lsp": "deny"}
        configuration = {"model": "lmstudio/" + spec.id, "small_model": "lmstudio/" + spec.id, "default_agent": "busguard-coder", "enabled_providers": ["lmstudio"], "provider": {"lmstudio": {"npm": "@ai-sdk/openai-compatible", "options": {"baseURL": self.local_config["base_url"], "timeout": spec.timeout_seconds * 1000}, "models": {spec.id: {"name": spec.id, "limit": {"context": spec.context_length, "output": spec.output_tokens}}}}}, "permission": {"*": "deny"}, "agent": {"busguard-coder": {"mode": "primary", "steps": 12, "permission": permissions}}, "snapshot": False, "plugin": [], "mcp": {}, "formatter": False, "lsp": False, "autoupdate": False, "share": "disabled"}
        configuration["compaction"] = self.compaction_policy(spec)
        env["OPENCODE_CONFIG_CONTENT"] = json.dumps(configuration)
        env["OPENCODE_CLI_CONFIG_CONTENT"] = json.dumps({"plugins": [], "session": {"permissions": "prompt"}, "compaction": self.compaction_policy(spec)})
        return env

    def probe(self, directory: Path, spec: ModelSpec) -> dict:
        exe = executable(self.config["executable"])
        env = self.environment(directory, spec, [], [])
        version = self.runner([exe, "--version"], cwd=directory, timeout=budget_timeout(self, 20), env=env).stdout.strip()
        help_text = self.runner([exe, "run", "--help"], cwd=directory, timeout=budget_timeout(self, 20), env=env).stdout
        if any(flag not in help_text for flag in ("--standalone", "--format", "--model", "--agent")):
            raise ProviderError("OpenCode incompatível: este adaptador exige run --standalone --format json --model --agent.")
        version_match = re.fullmatch(r"(?:opencode\s+v?)?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?", version, re.IGNORECASE)
        if not version_match or version_match.group(1) != "2":
            raise ProviderError("Adaptador conferido para OpenCode 2.x. Revise configurações antes de usar outra versão.")
        return {"version": ".".join(version_match.groups()), "version_raw": version, "standalone": True}

    def invoke(self, prompt: str, workspace: Path, spec: ModelSpec, allowed: list[str], readable: list[str], directory: Path, *, timeout: float | None = None) -> dict:
        self.last_metrics = None
        before = opencode_snapshot(directory)
        unknown_baseline = before is None and (directory / "opencode/data/opencode/opencode.db").exists()
        env = self.environment(directory, spec, allowed, readable)
        args = [executable(self.config["executable"]), "run", "--standalone", "--format", "json", "--model", "lmstudio/" + spec.id, "--agent", "busguard-coder"]
        try:
            process = self.runner(args, cwd=workspace, timeout=timeout or spec.timeout_seconds, input_text=prompt, env=env)
        except ProviderError as exc:
            elapsed = exc.process.elapsed_seconds if exc.process else 0
            self.last_metrics = None if unknown_baseline else opencode_delta(before, opencode_snapshot(directory), elapsed)
            if self.last_metrics is None:
                self.last_metrics = normalized(usage_metrics(events(exc.process.stdout) if exc.process else [], elapsed, "opencode"))
            self.last_metrics["usage_complete"] = False
            exc.metrics = self.last_metrics
            raise
        stream = events(process.stdout)
        fallback = usage_metrics(stream, process.elapsed_seconds, "opencode")
        self.last_metrics = (None if unknown_baseline else opencode_delta(before, opencode_snapshot(directory), process.elapsed_seconds)) or normalized({**fallback, "usage_complete": False, "source": "opencode.step_finish_partial"})
        self.last_metrics.update({k: fallback[k] for k in ("tool_calls", "tool_errors")})
        if not stream:
            raise ProviderError("OpenCode não retornou eventos JSON; resultado não verificável.")
        if any(e.get("type") == "error" for e in stream):
            message = redact(json.dumps(next(e for e in stream if e.get("type") == "error"), ensure_ascii=False))
            if any(marker in message.lower() for marker in ("out of memory", "cuda oom", "not enough memory")):
                raise ProviderError("Falta de memória no OpenCode/LM Studio: " + message[:1500])
            raise ProviderError("OpenCode informou erro: " + message[:1500])
        completion = "\n".join(str(e.get("part", {}).get("text", "")) for e in stream if e.get("type") == "text")
        markers = re.findall(r"<agent-result>(.*?)</agent-result>", completion, re.S)
        try:
            outcome = json.loads(markers[-1]) if markers else None
        except ValueError:
            outcome = None
        if not isinstance(outcome, dict) or outcome.get("status") != "completed" or outcome.get("requirements_met") is not True:
            self.last_metrics["requirements_met"] = False
            raise ProviderError("Etapa não confirmou requisitos obrigatórios; implementação interrompida, sem avançar para a próxima etapa.")
        self.last_metrics["requirements_met"] = True
        return self.last_metrics


class CloudCoder:
    """Cloud inference proposes structured file contents; only the coordinator writes.

    Uses the existing tool-free Codex adapter, not unrestricted shell/write tools.
    This differs from OpenCode's interactive harness and is reported in benchmarks.
    """
    def __init__(self, config, max_context_chars, *, cloud=None):
        self.config = config
        self.cloud = cloud or CodexCLI(config)
        self.max_context_chars = max_context_chars
        self.last_metrics = None

    def probe(self, directory, spec):
        self.cloud.remaining = getattr(self, "remaining", None)
        return {**self.cloud.probe(directory), "harness": "codex-structured-files", "model": self.config.get("model")}

    def prepare_visual(self, images):
        return self.cloud.prepare_visual(images)

    def invoke(self, prompt, workspace, spec, allowed, readable, directory, *, timeout=None):
        self.last_metrics = None
        context = {}
        for name in sorted(set(allowed + readable + ["PLAN.md"])):
            safe_relative(name)
            path = contained(workspace, name)
            if path.is_file():
                if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                    continue  # Binary input travels as an attachment, never as UTF-8 text.
                context[name] = path.read_text(encoding="utf-8-sig")
        text = cloud_text(prompt + "\nReturn JSON files with exact paths and complete contents; null deletes a file. Only edit: " + json.dumps(allowed) + "\nRead-only context and current contents:\n" + json.dumps(context, ensure_ascii=False), self.max_context_chars)
        try:
            data, self.last_metrics = self.cloud.invoke("coder", text, Path(__file__).resolve().parents[1] / "schemas/coder.json", directory / ("coder-" + uuid.uuid4().hex), timeout=timeout)
        except ProviderError as exc:
            self.last_metrics = exc.metrics or getattr(self.cloud, "last_metrics", None)
            raise
        if not isinstance(data, dict) or set(data) != {"files"} or not isinstance(data["files"], list):
            raise ProviderError("Coder Cloud retornou contrato inválido.")
        changes, seen = [], set()
        for item in data["files"]:
            if not isinstance(item, dict) or set(item) != {"path", "content"}:
                raise ProviderError("Arquivo retornado pelo Coder Cloud inválido.")
            name, content = item["path"], item["content"]
            safe_relative(name, editable=True)
            if content is not None:
                if not isinstance(content, str) or "\x00" in content:
                    raise SafetyError("Coder Cloud deve retornar texto UTF-8 sem bytes nulos.")
                try:
                    encoded = content.encode("utf-8")
                except UnicodeError as exc:
                    raise SafetyError("Coder Cloud retornou texto Unicode inválido.") from exc
                if len(encoded) > 2_000_000:
                    raise SafetyError("Arquivo do Coder Cloud excedeu tamanho máximo.")
            if name not in allowed or name in seen:
                raise SafetyError("Coder Cloud alterou escopo/duplicou arquivo/excedeu tamanho.")
            seen.add(name)
            changes.append((contained(workspace, name), content))
        for path, content in changes:
            if content is None:
                path.unlink(missing_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
        return {**self.last_metrics, "harness": "codex-structured-files"}
