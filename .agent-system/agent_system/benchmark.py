from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .config import SYSTEM_DIR, select_model
from .engine import CloudBudget, Engine
from .errors import AgentError, ConfigurationError, SafetyError
from .model_session import ModelSession
from .providers import LMStudio
from .reports import write_json
from .security import safe_relative
from .validation import validate_plan
from .workspace import Snapshot


def benchmark(config: dict, root: Path, aliases: list[str], *, cloud=False, confirmed=False, tasks_path=None, load_model=False, manage_models=False, allow_test_execution=False, engine_factory=Engine, model_session_factory=None) -> dict:
    if cloud and not confirmed:
        raise SafetyError("Benchmark Cloud exige confirmação explícita --confirm-cloud-benchmark; sem ela nenhuma chamada é feita.")
    if not aliases or len(aliases) != len(set(aliases)) or len(aliases) > 10:
        raise ConfigurationError("Selecione de 1 a 10 aliases distintos.")
    for alias in aliases:
        select_model(config, alias)
    path = tasks_path or SYSTEM_DIR / config["benchmark"]["tasks_file"]
    try:
        tasks = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (ValueError, OSError) as exc:
        raise ConfigurationError(f"Arquivo de tarefas benchmark inválido: {exc}") from exc
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= 50:
        raise ConfigurationError("Benchmark exige de 1 a 50 tarefas.")
    base = Snapshot.capture(root)
    budget = CloudBudget(config["limits"]["max_cloud_calls"])
    owner = engine_factory(config, root, budget=budget)
    directory = owner.new_directory()
    comparisons = []
    validated_tasks = []
    for task in tasks:
        if not isinstance(task, dict) or set(task) != {"name", "plan", "fixtures"} or not isinstance(task["name"], str) or not isinstance(task["fixtures"], dict):
            raise ConfigurationError("Cada benchmark exige name, plan e fixtures.")
        validate_plan(task["plan"], config["limits"]["max_steps"])
        files = dict(base.files)
        for name, contents in task["fixtures"].items():
            safe_relative(name, editable=True)
            if name in base.files:
                raise SafetyError(f"Fixture de benchmark não pode substituir arquivo real: {name}")
            if not isinstance(contents, str):
                raise ConfigurationError("Fixture deve ser texto.")
            files[name] = contents.encode("utf-8")
        digest = hashlib.sha256()
        for name, contents in sorted(files.items()):
            digest.update(name.encode() + b"\0" + contents + b"\0")
        snapshot = Snapshot(files, digest.hexdigest())
        validated_tasks.append((task, snapshot))
    session = None
    if manage_models:
        session = model_session_factory() if model_session_factory else ModelSession(LMStudio(config["local_llm"]))
    try:
        if session:
            session.start()
            write_json(directory / "model-session.json", session.audit)
        for task, snapshot in validated_tasks:
          for alias in aliases:
            activation_error = None
            if session:
                try:
                    session.activate(select_model(config, alias))
                except AgentError as exc:
                    activation_error = str(exc)
                write_json(directory / "model-session.json", session.audit)
            # O mesmo snapshot e o mesmo plano são reutilizados em cópias NOVAS.
            engine = engine_factory(config, root, budget=budget)
            result = engine.run(task["plan"]["task"], model_alias=alias, plan=json.loads(json.dumps(task["plan"])), snapshot=snapshot, local_only=not cloud, no_reviewer=not cloud, load_model=load_model and not manage_models, allow_test_execution=allow_test_execution, exclusive_model=config["benchmark"].get("require_exclusive_model", True), preflight_error=activation_error)
            comparisons.append({"task": task["name"], "model_alias": alias, "result": result})
            write_json(directory / "benchmark.json", {"cloud": cloud, "cloud_calls": budget.used, "comparisons": comparisons})
    finally:
        if session:
            session.restore()
            write_json(directory / "model-session.json", session.audit)
    summary = []
    for alias in aliases:
        runs = [row["result"] for row in comparisons if row["model_alias"] == alias]
        passed = sum(r["status"] in {"completed", "local_verified"} for r in runs)
        summary.append({"model_alias": alias, "tasks": len(runs), "passed": passed, "success_rate": passed / len(runs), "cloud_approvals": sum(r["cloud_approved"] is True for r in runs)})
    report = {"cloud": cloud, "cloud_calls": budget.used, "comparisons": comparisons, "summary": summary, "run_dir": str(directory), "conditions": "Mesmo snapshot, plano, checks e política de correções; contexto/timeout de cada alias registrado. GPU/RAM são uso total do sistema. Desempenho de inferência só é conhecido se fornecido pelo runtime."}
    if session:
        report["model_session"] = session.audit
    write_json(directory / "benchmark.json", report)
    lines = ["# Comparação de modelos locais", "", report["conditions"], "", "Sucesso local significa verificações configuradas aprovadas, sem aprovação Cloud.", "", "| Tarefa | Modelo | Estado | Tempo (s) | Correções | Checks | Reviewer Cloud | Tokens Cloud entrada/saída | Pico VRAM por GPU (MiB) |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in comparisons:
        result = row["result"]
        cloud_calls = [m for m in result["metrics"]["calls"] if m["provider"] == "codex"]
        def token_total(field):
            values = [m[field] for m in cloud_calls]
            return sum(values) if values and all(v is not None for v in values) else (0 if not values and not cloud else None)
        peaks = result["metrics"]["resources"]["gpu_peak_used_mib"]
        test_status = ", ".join(c["name"] + ":" + c["status"] for c in result["checks"]) or "não executados"
        lines.append(f"| {row['task'].replace('|', '/')} | {row['model_alias']} | {result['status']} | {result['elapsed_seconds']:.2f} | {result['corrections']} | {test_status} | {result['cloud_approved']} | {token_total('input_tokens')}/{token_total('output_tokens')} | {json.dumps(peaks)} |")
    lines += ["", "| Modelo | Tarefas | Sucessos | Taxa | Aprovações Cloud |", "| --- | --- | --- | --- | --- |"]
    lines += [f"| {s['model_alias']} | {s['tasks']} | {s['passed']} | {s['success_rate']:.0%} | {s['cloud_approvals']} |" for s in summary]
    lines += ["", "As amostras e métricas detalhadas de cada chamada estão no JSON. Campos desconhecidos são null; falhas por modelo descarregado ou orçamento esgotado também são resultados. Nenhuma alteração é aplicada ao projeto principal."]
    (directory / "benchmark.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report
