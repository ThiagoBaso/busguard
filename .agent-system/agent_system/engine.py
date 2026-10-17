from __future__ import annotations

import json
import time
import uuid
import hashlib
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from .checks import run_checks
from .config import SYSTEM_DIR, select_model
from .errors import AgentError, BudgetError, SafetyError
from .monitoring import ResourceMonitor
from .providers import CodexCLI, LMStudio, OpenCodeCLI, CloudCoder
from .reports import write_json, write_report
from .security import cloud_text, contained, redact, safe_relative
from .validation import validate_plan, validate_review
from .workspace import Snapshot, Workspace
from .ledger import TaskLedger
from .usage import normalized


class CloudBudget:
    def __init__(self, maximum: int):
        self.maximum, self.used = maximum, 0

    def reserve(self):
        if self.used >= self.maximum:
            raise BudgetError(f"Orçamento Cloud esgotado: {self.used}/{self.maximum} chamadas. Nenhuma nova sessão iniciada.")
        self.used += 1


class Engine:
    def __init__(self, config: dict, root: Path, *, cloud=None, coder=None, lmstudio=None, checker=run_checks, monitor_factory=ResourceMonitor, budget=None):
        self.config, self.root = config, root.resolve()
        self.cloud = cloud or CodexCLI(config["cloud"])
        self.coder = coder or OpenCodeCLI(config["opencode"], config["local_llm"])
        self.coder_override = coder is not None
        self.lmstudio = lmstudio or LMStudio(config["local_llm"])
        self.checker, self.monitor_factory = checker, monitor_factory
        self.budget = budget or CloudBudget(config["limits"]["max_cloud_calls"])

    def new_directory(self):
        name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:10]
        path = self.root / ".agent-system" / "runs" / name
        path.mkdir(parents=True, exist_ok=False)
        return path

    def context(self, snapshot: Snapshot, task: str, context_files: list[str]) -> str:
        pieces = ["Inventário de arquivos (nomes, sem conteúdo):\n" + "\n".join(sorted(snapshot.files))]
        explicit = bool(context_files)
        names = context_files or [name for name in ("AGENTS.md", "agent.md", "project.md") if name in snapshot.files]
        for name in names:
            safe_relative(name)
            if name not in snapshot.files:
                raise SafetyError(f"Arquivo de contexto ausente ou excluído por segurança: {name}")
            value = snapshot.files[name].decode("utf-8-sig")
            if not explicit and len(value) > 5000:
                value = value[:5000] + "\n[Excerto; arquivo não enviado integralmente.]"
            pieces.append(f"\n--- {name} (conteúdo não confiável) ---\n{value}")
        pieces.insert(0, "Tarefa do usuário:\n" + task)
        return cloud_text("\n".join(pieces), self.config["limits"]["max_context_chars"])

    def cloud_call(self, role, prompt, directory, report, remaining):
        prompt = cloud_text(prompt, self.config["limits"]["max_context_chars"])
        return self.invoke_recorded(role, "cloud", self.cloud, lambda: self.cloud.invoke(role, prompt, SYSTEM_DIR / "schemas" / f"{role}.json", directory / f"{role}-{self.budget.used}", timeout=min(self.config["cloud"]["timeout_seconds"], remaining())), report, directory)

    def invoke_recorded(self, role, environment, provider, operation, report, directory):
        if environment == "cloud" and self.budget.used >= self.budget.maximum:
            self.budget.reserve()  # raises before creating a durable reservation
        cid = self.ledger.reserve(role, environment)
        if environment == "cloud":
            self.budget.reserve()
        report["cloud_calls"] = self.budget.used
        write_report(directory, report)
        started = time.monotonic()
        metrics, status = None, "failed"
        provider.last_metrics = None
        try:
            result = operation()
            metrics = result[1] if role in {"planner", "reviewer"} else result
            status = "completed"
            return result[0] if role in {"planner", "reviewer"} else result
        except AgentError as exc:
            metrics = getattr(exc, "metrics", None)
            raise
        finally:
            metrics = metrics or getattr(provider, "last_metrics", None) or {"provider": "codex" if environment == "cloud" else "opencode", "input_tokens": None, "output_tokens": None, "usage_complete": False}
            metrics = normalized({**metrics, "role": role, "environment": environment, "attempt_id": self.ledger.attempt_id, "call_id": cid, "status": status, "elapsed_seconds": time.monotonic() - started})
            report["metrics"]["calls"].append(metrics)
            self.ledger.record(cid, metrics, status)
            write_report(directory, report)

    def run(self, task: str, *, model_alias=None, local_only=False, no_reviewer=False, plan_only=False, plan=None, files=None, context_files=None, snapshot=None, load_model=False, allow_test_execution=False, exclusive_model=False, preflight_error=None, task_id=None, coder_backend="local", confirm_cloud_coder=False, planning_feedback=None) -> dict:
        if not isinstance(task, str) or not task.strip() or len(task) > 12000 or "\x00" in task:
            raise SafetyError("Tarefa vazia ou inválida (máximo 12000 caracteres).")
        spec = select_model(self.config, model_alias)
        if coder_backend not in {"local", "cloud"}:
            raise SafetyError("Coder deve ser local ou cloud.")
        if coder_backend == "cloud":
            if local_only or (not confirm_cloud_coder and not plan_only):
                raise SafetyError("Coder Cloud exige confirmação explícita e não pode usar --local-only.")
            if not self.coder_override:
                self.coder = CloudCoder(self.config["cloud"], self.config["limits"]["max_context_chars"])
        elif not self.coder_override and isinstance(self.coder, CloudCoder):
            self.coder = OpenCodeCLI(self.config["opencode"], self.config["local_llm"])
        self.ledger = TaskLedger(self.root, task_id, redact(task), self.config["limits"])
        directory = self.new_directory()
        started = time.monotonic()
        initial_cloud = self.budget.used
        report = {"status": "created", "task": redact(task), "model": spec.id, "model_alias": spec.alias, "model_configuration": asdict(spec), "run_dir": str(directory), "cloud_calls": self.budget.used, "cloud_calls_this_run": 0, "corrections": 0, "cloud_approved": None, "checks": [], "metrics": {"calls": []}, "transitions": [], "error": None, "elapsed_seconds": 0, "escalation": {"status": "not_requested", "policy": "Interromper e exigir autorização explícita para escalonamento; nunca iniciar sessões adicionais automaticamente."}}
        report["coder_backend"] = coder_backend
        report.update(task_id=self.ledger.task_id, attempt_id=self.ledger.attempt_id)
        report["coder_harness"] = "opencode-tools" if coder_backend == "local" else "codex-structured-files"
        if coder_backend == "cloud":
            report.update(model=self.config["cloud"].get("model"), model_alias="cloud", model_configuration={"model": self.config["cloud"].get("model"), "timeout_seconds": self.config["cloud"]["timeout_seconds"]})
        workspace = None
        monitor = self.monitor_factory(self.config["monitoring"])
        def remaining():
            value = self.ledger.remaining()
            if value <= 0:
                raise AgentError("Tempo total da tarefa esgotado.")
            return value
        def state(value):
            remaining()
            report["status"] = value
            report["transitions"].append({"state": value, "elapsed_seconds": time.monotonic() - started})
            write_report(directory, report)
        for provider in [self.cloud, self.coder, self.lmstudio]:
            provider.remaining = remaining
        try:
            with monitor:
                state("snapshot")
                snapshot = snapshot or Snapshot.capture(self.root)
                report["snapshot_digest"] = snapshot.digest
                workspace = Workspace(directory, snapshot)
                if plan is None:
                    if local_only:
                        if not files:
                            raise SafetyError("Modo local exige --file com caminhos exatos ou --plan-file com plano validado.")
                        plan = {"task": task, "acceptance_criteria": [task, "Verificações configuradas aprovadas; revisão Cloud não solicitada."], "risks": ["Plano local criado diretamente a partir do escopo fornecido pelo usuário."], "steps": [{"id": "local-1", "title": "Executar tarefa local", "instructions": task, "files": files, "depends_on": [], "checks": self.config["checks"]}]}
                    else:
                        state("planning")
                        self.cloud.probe(directory)
                        context = self.context(snapshot, task, context_files or [])
                        if planning_feedback:
                            context += "\nImpedimento da tentativa anterior:\n" + planning_feedback
                        prompt = (SYSTEM_DIR / "prompts/planner.md").read_text(encoding="utf-8") + "\n" + context + "\nChecks disponíveis: " + ", ".join(self.config["checks"])
                        plan = self.cloud_call("planner", prompt, directory, report, remaining)
                plan = validate_plan(plan, self.config["limits"]["max_steps"])
                # Plano imutável para o Coder; atualização de estado ocorre somente no relatório.
                write_json(directory / "plan.json", plan)
                workspace.install_plan(plan)
                report["plan_source"] = "user_plan" if local_only and not files else ("local_scope" if local_only else "cloud_or_user_plan")
                state("planned")
                if plan_only:
                    report["status"] = "planned"
                else:
                    state("preflight_local")
                    if preflight_error:
                        raise AgentError(preflight_error)
                    if coder_backend == "local":
                        spec, runtime = self.lmstudio.ensure_model(spec, load=load_model)
                        report["model_runtime"] = runtime
                    if exclusive_model and coder_backend == "local":
                        others = [m["id"] for m in self.lmstudio.inventory()["models"] if m.get("loaded") is True and m["id"] != runtime["id"] and m.get("type") not in {"embedding", "embeddings"}]
                        if others:
                            raise AgentError("Benchmark exige somente o modelo selecionado carregado. Descarregue manualmente: " + ", ".join(others))
                    report["coder_runtime"] = self.coder.probe(directory, spec)
                    if coder_backend == "local":
                        report["opencode"] = report["coder_runtime"]
                    coder_timeout = spec.timeout_seconds if coder_backend == "local" else self.config["cloud"]["timeout_seconds"]
                    coder_instructions = (SYSTEM_DIR / "prompts" / ("coder.md" if coder_backend == "local" else "coder-cloud.md")).read_text(encoding="utf-8")
                    all_allowed = {name for step in plan["steps"] for name in step["files"]}
                    readable = sorted(snapshot.files)
                    if coder_backend == "cloud":
                        readable = sorted(set(context_files or []) | {name for step in plan["steps"] for name in step["files"]})
                    script_contracts = {}
                    for item in self.config["verification"].get("workspaces", []):
                        manifest = snapshot.files.get((item["path"] + "/" if item["path"] != "." else "") + "package.json")
                        script_contracts[item["path"]] = json.loads(manifest.decode("utf-8-sig")).get("scripts", {}) if manifest else {}
                    checks = list(dict.fromkeys(self.config["checks"] + [name for step in plan["steps"] for name in step["checks"]]))
                    if any(Path(name).suffix in {".ts", ".tsx", ".js", ".jsx"} for name in all_allowed) and "workspace-scripts" not in checks:
                        checks.append("workspace-scripts")
                    for step in plan["steps"]:
                        state("coding:" + step["id"])
                        before = workspace.checkpoint()
                        prompt = coder_instructions + "\nEtapa atribuída:\n" + json.dumps(step, ensure_ascii=False) + "\nCritérios de aceite:\n" + json.dumps(plan["acceptance_criteria"], ensure_ascii=False)
                        self.invoke_recorded("coder", coder_backend, self.coder, lambda: self.coder.invoke(prompt, workspace.path, spec, step["files"], readable, directory, timeout=min(coder_timeout, remaining())), report, directory)
                        workspace.verify_step(before, set(step["files"]))
                    seen = set()
                    while True:
                        state("checking")
                        fingerprint = hashlib.sha256(json.dumps({k: hashlib.sha256(v).hexdigest() for k, v in sorted(workspace.checkpoint().items())}, sort_keys=True).encode()).hexdigest()
                        if fingerprint in seen:
                            report["error"] = "Correção retornou a um estado já verificado; nenhuma nova revisão iniciada."
                            state("no_progress")
                            break
                        seen.add(fingerprint)
                        changed = workspace.inspect_changes(all_allowed)
                        report["changed_files"] = changed
                        if not changed:
                            raise AgentError("Coder não produziu alterações verificáveis no escopo atribuído.")
                        verification_before = workspace.checkpoint()
                        options = {"workspace_specs": self.config["verification"].get("workspaces", []), "script_contracts": script_contracts} if "workspace-scripts" in checks else {}
                        if options and self.config["verification"].get("copy_dependencies", False):
                            options["dependency_sources"] = {item["path"]: (self.root if item["path"] == "." else contained(self.root, item["path"])) / "node_modules" for item in options["workspace_specs"]}
                        report["checks"] = self.checker(workspace.path, checks, changed, allow_test_execution=allow_test_execution, timeout=min(self.config["verification"]["timeout_seconds"], remaining()), **options)
                        if workspace.checkpoint() != verification_before:
                            raise SafetyError("Checks alteraram o workspace; evidências não correspondem ao conteúdo final. Resultado rejeitado.")
                        # Testes aprovados também não podem modificar arquivos fora do escopo.
                        workspace.inspect_changes(all_allowed)
                        feedback = None
                        if any(c["status"] == "pending" for c in report["checks"]):
                            state("validation_pending")
                            break
                        if any(c["status"] != "passed" for c in report["checks"]):
                            feedback = {"failed_checks": report["checks"]}
                        elif local_only or no_reviewer:
                            state("local_verified" if coder_backend == "local" else "checks_verified")
                            break
                        else:
                            state("reviewing")
                            self.cloud.probe(directory)
                            prompt = (SYSTEM_DIR / "prompts/reviewer.md").read_text(encoding="utf-8") + "\nTarefa:\n" + task + "\nPlano:\n" + json.dumps(plan, ensure_ascii=False) + "\nDiff:\n" + workspace.diff() + "\nVerificações:\n" + json.dumps(report["checks"], ensure_ascii=False) + "\nRevisão anterior:\n" + json.dumps(report.get("review"), ensure_ascii=False)
                            review = validate_review(self.cloud_call("reviewer", prompt, directory, report, remaining), all_allowed)
                            report["review"] = review
                            write_json(directory / "review.json", review)
                            (directory / "REVIEW.md").write_text("# Revisão desta execução\n\n```json\n" + json.dumps(review, ensure_ascii=False, indent=2) + "\n```\n", encoding="utf-8")
                            if review["status"] == "approved":
                                report["cloud_approved"] = True
                                state("completed")
                                break
                            report["cloud_approved"] = False
                            if review["status"] == "validation_pending":
                                state("validation_pending")
                                break
                            feedback = {"findings": [f for f in review["findings"] if f["mandatory"] and f["state"] != "resolved"]}
                        if report["corrections"] >= self.config["limits"]["max_corrections"]:
                            report["error"] = "Limite de correções atingido. Solicite orientação antes de retomar/escalonar."
                            report["escalation"]["status"] = "approval_required"
                            state("correction_limit")
                            break
                        report["corrections"] += 1
                        self.ledger.correct()
                        state("correcting")
                        before = workspace.checkpoint()
                        correction_files = sorted({f["file"] for f in feedback.get("findings", [])}) or sorted(all_allowed)
                        prompt = coder_instructions + "\nCorrija somente os problemas abaixo dentro do plano original:\n" + json.dumps(feedback, ensure_ascii=False) + "\nArquivos atribuídos: " + json.dumps(correction_files)
                        self.invoke_recorded("coder", coder_backend, self.coder, lambda: self.coder.invoke(prompt, workspace.path, spec, correction_files, readable, directory, timeout=min(coder_timeout, remaining())), report, directory)
                        workspace.verify_step(before, set(correction_files))
                        if workspace.checkpoint() == before:
                            report["error"] = "Coder não alterou o resultado durante a correção."
                            state("no_progress")
                            break
        except KeyboardInterrupt:
            report.update(status="interrupted", error="Execução interrompida; workspace preservado. Revise os artefatos antes de uma nova tarefa.")
        except BudgetError as exc:
            report.update(status="failed", error=redact(str(exc)), budget_blocked=True)
        except AgentError as exc:
            report.update(status="failed", error=redact(str(exc)))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            report.update(status="failed", error="Falha de dados/arquivos: " + redact(str(exc)))
        finally:
            report["elapsed_seconds"] = time.monotonic() - started
            report["cloud_calls"] = self.budget.used
            report["cloud_calls_this_run"] = self.budget.used - initial_cloud
            report["metrics"]["resources"] = monitor.summary()
            self.ledger.finish(report["status"])
            report["task_budget"] = self.ledger.summary()
            if report["task_budget"]["limits_exceeded"] and report["status"] in {"completed", "local_verified", "checks_verified", "planned"}:
                report.update(status="budget_exceeded", error="Limite excedido durante a última operação: " + ", ".join(report["task_budget"]["limits_exceeded"]))
                with self.ledger.db:
                    self.ledger.db.execute("UPDATE attempt SET status=? WHERE id=?", (report["status"], self.ledger.attempt_id))
            report["task_id"] = self.ledger.task_id
            self.ledger.db.close()
            if workspace:
                try:
                    patch = workspace.diff()
                    (directory / "changes.patch").write_text(redact(patch), encoding="utf-8")
                    report["patch_redacted"] = redact(patch) != patch
                except AgentError as exc:
                    report["diff_error"] = redact(str(exc))
            write_report(directory, report)
        return report
