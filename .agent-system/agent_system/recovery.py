"""Validation/review-only attempts. Never invoke Planner or Coder, or integrate files."""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

from .config import SYSTEM_DIR
from .errors import AgentError, SafetyError
from .ledger import TaskLedger
from .providers import CodexCLI
from .references import attach, discover, preflight, prepare_visual
from .reports import write_json, write_report
from .security import redact, safe_relative
from .validation import validate_plan, validate_review
from .workspace import Snapshot, Workspace


def source_directory(root, path):
    path = Path(path).absolute()
    runs = root / ".agent-system/runs"
    if not path.resolve().is_relative_to(runs.resolve()) or path.resolve() == runs.resolve():
        raise SafetyError("Retome somente execuções dentro de .agent-system/runs.")
    for part in [runs.parent, runs, *path.parents, path]:
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            raise SafetyError("Execução de origem contém link.")
    return path


def read_tree(folder):
    result = {}
    for p in folder.rglob("*"):
        if p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()):
            raise SafetyError("Snapshot contém links.")
        relative = p.relative_to(folder)
        if relative.parts[0] == ".git":
            continue
        if p.is_file():
            name = relative.as_posix()
            safe_relative(name)
            if p.stat().st_size > 2_000_000 or len(result) >= 5000:
                raise SafetyError("Snapshot de recuperação excede limites de segurança.")
            result[name] = p.read_bytes()
    if sum(map(len, result.values())) > 20_000_000:
        raise SafetyError("Snapshot de recuperação excede 20 MB.")
    return result


def resume(engine, source, *, allow_test_execution=False, confirm_cloud_review=False, reference_files=None):
    if isinstance(engine.cloud, CodexCLI):
        engine.cloud.visual_images = []
    source = source_directory(engine.root, source)
    old = json.loads((source / "report.json").read_text(encoding="utf-8"))
    if old.get("status") not in {"validation_pending", "failed", "interrupted", "local_verified", "checks_verified", "correction_limit", "no_progress", "budget_exceeded"}:
        raise SafetyError("Estado da origem não permite retomada de validação/revisão.")
    if not old.get("task_id"):
        raise SafetyError("Origem sem task_id persistente; não é seguro reiniciar contadores.")
    plan = validate_plan(json.loads((source / "plan.json").read_text(encoding="utf-8")), engine.config["limits"]["max_steps"])
    baseline, current = read_tree(source / "baseline"), read_tree(source / "workspace")
    digest = hashlib.sha256()
    for name, data in sorted(baseline.items()):
        if name != "PLAN.md":
            digest.update(name.encode() + b"\0" + data + b"\0")
    if digest.hexdigest() != old.get("snapshot_digest"):
        raise SafetyError("Baseline não corresponde ao digest da execução de origem.")
    allowed = {name for step in plan["steps"] for name in step["files"]}
    changed = sorted(n for n in baseline.keys() | current.keys() if baseline.get(n) != current.get(n))
    if any(n not in allowed for n in changed):
        raise SafetyError("Snapshot contém mudanças fora do plano original.")
    for name in changed:
        safe_relative(name, editable=True)
    # A resume must bind to the existing task, not silently create a fresh ledger.
    task_id = old["task_id"]
    if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", task_id):
        raise SafetyError("task_id de origem inválido.")
    ledger_path = engine.root / ".agent-system/runs/tasks" / (task_id + ".sqlite3")
    if not ledger_path.is_file():
        raise SafetyError("Ledger da origem ausente; retomada não pode zerar consumo.")
    engine.ledger = TaskLedger(engine.root, task_id, old["task"], engine.config["limits"])
    directory = engine.new_directory()
    started = time.monotonic()
    report = {"status": "validating", "task": old["task"], "task_id": task_id,
              "attempt_id": engine.ledger.attempt_id, "run_dir": str(directory),
              "resumed_from": str(source), "source_attempt_id": old.get("attempt_id"),
              "mode": "validation_review_only", "model": old.get("model"),
              "snapshot_digest": old.get("snapshot_digest"), "cloud_calls": 0,
              "cloud_calls_this_run": 0, "corrections": 0, "cloud_approved": None,
              "metrics": {"calls": []}, "checks": [], "transitions": [], "error": None,
              "inherited_metrics": old.get("metrics", {}).get("by_role", {}),
              "visual_validation": "pending", "integration": "awaiting_user_approval"}
    workspace = None
    try:
        engine.ledger.remaining()
        references = preflight(engine.root, reference_files or [])
        snapshot = Snapshot({n: b for n, b in baseline.items() if n != "PLAN.md"}, old.get("snapshot_digest", ""))
        if references:
            attach(snapshot, engine.root, references)
        workspace = Workspace(directory, snapshot)
        workspace.install_plan(plan)
        for name in baseline.keys() | current.keys():
            if baseline.get(name) != current.get(name):
                dest = workspace.path / name
                if name in current:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(current[name])
                else:
                    dest.unlink()
        if preflight(workspace.path, [r["path"] for r in references]) != references:
            raise SafetyError("Snapshot não preservou as referências declaradas.")
        write_json(directory / "plan.json", plan)
        report["snapshot_digest"] = snapshot.digest
        report["references"] = references
        report["source_files_sha256"] = {n: hashlib.sha256(b).hexdigest() for n, b in current.items()}
        report["changed_files"] = workspace.inspect_changes(allowed)
        report["main_matches_baseline"] = all(
            ((engine.root / n).is_file() and (engine.root / n).read_bytes() == baseline[n])
            if n in baseline else not (engine.root / n).exists()
            for n in report["changed_files"]
        )
        contracts = {}
        specs = engine.config["verification"].get("workspaces", [])
        for spec in specs:
            name = (spec["path"] + "/" if spec["path"] != "." else "") + "package.json"
            contracts[spec["path"]] = json.loads(baseline.get(name, b"{}").decode("utf-8-sig")).get("scripts", {})
        checks = list(dict.fromkeys(engine.config["checks"] + [c for s in plan["steps"] for c in s["checks"]]))
        if any(Path(n).suffix in {".ts", ".tsx", ".js", ".jsx"} for n in allowed):
            checks.append("workspace-scripts")
        before = workspace.checkpoint()
        options = {"workspace_specs": specs, "script_contracts": contracts}
        if engine.config["verification"].get("copy_dependencies"):
            options["dependency_sources"] = {s["path"]: engine.root / s["path"] / "node_modules" for s in specs}
        report["checks"] = engine.checker(workspace.path, checks, report["changed_files"], allow_test_execution=allow_test_execution, timeout=min(engine.config["verification"]["timeout_seconds"], engine.ledger.remaining()), **options)
        if workspace.checkpoint() != before:
            raise SafetyError("Validação modificou o snapshot; evidências rejeitadas.")
        if not report["checks"] or any(c["status"] == "pending" for c in report["checks"]):
            report["status"] = "validation_pending"
        elif any(c["status"] != "passed" for c in report["checks"]):
            report["status"] = "failed"
        elif not confirm_cloud_review:
            report["status"] = "checks_verified"
        else:
            visual = old.get("visual_required") or bool(discover(old["task"]))
            if visual:
                report["cloud_visual"] = prepare_visual(engine.cloud, workspace.path, references)
            engine.cloud.remaining = engine.ledger.remaining
            engine.cloud.probe(directory)
            prompt = (SYSTEM_DIR / "prompts/reviewer.md").read_text(encoding="utf-8") + "\nTarefa:\n" + old["task"] + "\nPlano:\n" + json.dumps(plan, ensure_ascii=False) + "\nDiff:\n" + workspace.diff() + "\nVerificações:\n" + json.dumps(report["checks"], ensure_ascii=False)
            review = validate_review(engine.cloud_call("reviewer", prompt, directory, report, engine.ledger.remaining), allowed)
            report["review"] = review
            write_json(directory / "review.json", review)
            report["cloud_approved"] = review["status"] == "approved"
            report["status"] = "completed" if report["cloud_approved"] else "validation_pending"
            # No correction loop: a rejected review leaves the copy intact for a human.
    except (AgentError, OSError, ValueError, KeyError, TypeError) as exc:
        report.update(status="failed", error=redact(str(exc)))
    except KeyboardInterrupt:
        report.update(status="interrupted", error="Retomada interrompida; cópia preservada.")
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        report["cloud_calls_this_run"] = len([c for c in report["metrics"]["calls"] if c["environment"] == "cloud"])
        engine.ledger.finish(report["status"])
        report["task_budget"] = engine.ledger.summary()
        report["cloud_calls"] = report["task_budget"]["cloud_calls"]
        if report["task_budget"]["limits_exceeded"]:
            report.update(status="budget_exceeded", error="Limites acumulados excedidos.")
            with engine.ledger.db:
                engine.ledger.db.execute("UPDATE attempt SET status=? WHERE id=?", (report["status"], engine.ledger.attempt_id))
        engine.ledger.db.close()
        if workspace:
            patch = workspace.diff()
            (directory / "changes.patch").write_bytes(redact(patch).encode("utf-8"))
            report["patch_redacted"] = redact(patch) != patch
        write_report(directory, report)
    return report
