from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from .checks import run_checks
from .config import SYSTEM_DIR, select_model
from .errors import AgentError, BudgetError, SafetyError
from .monitoring import ResourceMonitor
from .providers import CodexCLI, LMStudio, OpenCodeCLI
from .reports import write_json, write_report
from .security import cloud_text, contained, redact, safe_relative
from .validation import validate_plan, validate_review
from .workspace import Snapshot, Workspace


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
        self.budget.reserve()
        report["cloud_calls"] = self.budget.used
        write_report(directory, report)
        data, metrics = self.cloud.invoke(role, prompt, SYSTEM_DIR / "schemas" / f"{role}.json", directory / f"{role}-{self.budget.used}", timeout=min(self.config["cloud"]["timeout_seconds"], remaining()))
        report["metrics"]["calls"].append(metrics)
        return data

    def run(self, task: str, *, model_alias=None, local_only=False, no_reviewer=False, plan_only=False, plan=None, files=None, context_files=None, snapshot=None, load_model=False, allow_test_execution=False, exclusive_model=False, preflight_error=None) -> dict:
        if not isinstance(task, str) or not task.strip() or len(task) > 12000 or "\x00" in task:
            raise SafetyError("Tarefa vazia ou inválida (máximo 12000 caracteres).")
        spec = select_model(self.config, model_alias)
        directory = self.new_directory()
        started = time.monotonic()
        initial_cloud = self.budget.used
        report = {"status": "created", "task": redact(task), "model": spec.id, "model_alias": spec.alias, "model_configuration": asdict(spec), "run_dir": str(directory), "cloud_calls": self.budget.used, "cloud_calls_this_run": 0, "corrections": 0, "cloud_approved": None, "checks": [], "metrics": {"calls": []}, "transitions": [], "error": None, "elapsed_seconds": 0, "escalation": {"status": "not_requested", "policy": "Interromper e exigir autorização explícita para escalonamento; nunca iniciar sessões adicionais automaticamente."}}
        workspace = None
        monitor = self.monitor_factory(self.config["monitoring"])
        def remaining():
            value = self.config["limits"]["total_timeout_seconds"] - (time.monotonic() - started)
            if value <= 0:
                raise AgentError("Tempo total da tarefa esgotado.")
            return value
        def state(value):
            remaining()
            report["status"] = value
            report["transitions"].append({"state": value, "elapsed_seconds": time.monotonic() - started})
            write_report(directory, report)
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
                    spec, runtime = self.lmstudio.ensure_model(spec, load=load_model)
                    report["model_runtime"] = runtime
                    if exclusive_model:
                        others = [m["id"] for m in self.lmstudio.inventory()["models"] if m.get("loaded") is True and m["id"] != runtime["id"] and m.get("type") not in {"embedding", "embeddings"}]
                        if others:
                            raise AgentError("Benchmark exige somente o modelo selecionado carregado. Descarregue manualmente: " + ", ".join(others))
                    report["opencode"] = self.coder.probe(directory, spec)
                    all_allowed = {name for step in plan["steps"] for name in step["files"]}
                    readable = sorted(snapshot.files)
                    checks = list(dict.fromkeys(self.config["checks"] + [name for step in plan["steps"] for name in step["checks"]]))
                    for step in plan["steps"]:
                        state("coding:" + step["id"])
                        before = workspace.checkpoint()
                        prompt = (SYSTEM_DIR / "prompts/coder.md").read_text(encoding="utf-8") + "\nEtapa atribuída:\n" + json.dumps(step, ensure_ascii=False) + "\nCritérios de aceite:\n" + json.dumps(plan["acceptance_criteria"], ensure_ascii=False)
                        metrics = self.coder.invoke(prompt, workspace.path, spec, step["files"], readable, directory, timeout=min(spec.timeout_seconds, remaining()))
                        report["metrics"]["calls"].append(metrics)
                        workspace.verify_step(before, set(step["files"]))
                    while True:
                        state("checking")
                        changed = workspace.inspect_changes(all_allowed)
                        report["changed_files"] = changed
                        if not changed:
                            raise AgentError("Coder não produziu alterações verificáveis no escopo atribuído.")
                        verification_before = workspace.checkpoint()
                        report["checks"] = self.checker(workspace.path, checks, changed, allow_test_execution=allow_test_execution, timeout=min(self.config["verification"]["timeout_seconds"], remaining()))
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
                            state("local_verified")
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
                        state("correcting")
                        before = workspace.checkpoint()
                        correction_files = sorted({f["file"] for f in feedback.get("findings", [])}) or sorted(all_allowed)
                        prompt = (SYSTEM_DIR / "prompts/coder.md").read_text(encoding="utf-8") + "\nCorrija somente os problemas abaixo dentro do plano original:\n" + json.dumps(feedback, ensure_ascii=False) + "\nArquivos atribuídos: " + json.dumps(correction_files)
                        metrics = self.coder.invoke(prompt, workspace.path, spec, correction_files, readable, directory, timeout=min(spec.timeout_seconds, remaining()))
                        report["metrics"]["calls"].append(metrics)
                        workspace.verify_step(before, set(correction_files))
        except KeyboardInterrupt:
            report.update(status="interrupted", error="Execução interrompida; workspace preservado. Revise os artefatos antes de uma nova tarefa.")
        except AgentError as exc:
            report.update(status="failed", error=redact(str(exc)))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            report.update(status="failed", error="Falha de dados/arquivos: " + redact(str(exc)))
        finally:
            report["elapsed_seconds"] = time.monotonic() - started
            report["cloud_calls"] = self.budget.used
            report["cloud_calls_this_run"] = self.budget.used - initial_cloud
            report["metrics"]["resources"] = monitor.summary()
            if workspace:
                try:
                    patch = workspace.diff()
                    (directory / "changes.patch").write_text(redact(patch), encoding="utf-8")
                    report["patch_redacted"] = redact(patch) != patch
                except AgentError as exc:
                    report["diff_error"] = redact(str(exc))
            write_report(directory, report)
        return report
