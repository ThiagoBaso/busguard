from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .benchmark import benchmark
from .config import SYSTEM_DIR, load_config, select_model
from .engine import Engine
from .errors import AgentError
from .monitoring import gpu_snapshot, ram_snapshot
from .providers import CodexCLI, LMStudio, OpenCodeCLI
from .security import redact, safe_relative
from .validation import validate_plan


def parser():
    cli = argparse.ArgumentParser(description="Sistema multiagente BusGuard: Codex Planner/Reviewer + OpenCode/LM Studio local.")
    cli.add_argument("task", nargs="?", help="Tarefa em linguagem natural.")
    cli.add_argument("--config", type=Path, help="Configuração JSON (independente do backend).")
    cli.add_argument("--root", type=Path, default=SYSTEM_DIR.parent, help="Raiz do repositório Git.")
    cli.add_argument("--model", help="Alias configurado do modelo local.")
    mode = cli.add_mutually_exclusive_group()
    mode.add_argument("--hardware", action="store_true", help="Consultar GPUs/RAM sem inferência.")
    mode.add_argument("--status", action="store_true", help="Consultar CLIs, autenticação, modelos e execuções; sem inferência.")
    mode.add_argument("--dry-run", action="store_true", help="Validar configuração/escopo local; não chama nenhum modelo.")
    mode.add_argument("--plan-only", action="store_true", help="Planejamento Cloud: consome uma chamada; não executa Coder.")
    mode.add_argument("--benchmark", action="store_true", help="Comparar tarefas fixas em cópias isoladas; local por padrão.")
    cli.add_argument("--local-only", action="store_true", help="Sem Planner/Reviewer Cloud; exige --file ou --plan-file.")
    cli.add_argument("--no-reviewer", action="store_true", help="Planejamento Cloud e execução local sem revisão Cloud.")
    cli.add_argument("--plan-file", type=Path, help="Reutilizar plano JSON validado; não chama Planner.")
    cli.add_argument("--file", action="append", default=[], help="Arquivo exato permitido no modo local; repetir para vários.")
    cli.add_argument("--context-file", action="append", default=[], help="Arquivo de texto selecionado para o Planner Cloud (repetível).")
    cli.add_argument("--models", help="Aliases separados por vírgula para --benchmark.")
    cli.add_argument("--tasks-file", type=Path, help="Tarefas JSON de benchmark.")
    cli.add_argument("--cloud-benchmark", action="store_true", help="Usar Reviewer Cloud no benchmark; não repete planejamento.")
    cli.add_argument("--confirm-cloud-benchmark", action="store_true", help="Autorizar explicitamente consumo Cloud do benchmark.")
    cli.add_argument("--max-cloud-calls", type=int, help="Limite total de sessões Cloud, inclusive falhas.")
    cli.add_argument("--max-corrections", type=int, help="Máximo de tentativas locais de correção.")
    cli.add_argument("--load-model", action="store_true", help="Autorizar carregamento nativo lms; nunca descarrega modelos do usuário.")
    cli.add_argument("--manage-models", action="store_true", help="Benchmark: autorizar unload/load sequencial e restauração dos parâmetros suportados dos modelos iniciais.")
    cli.add_argument("--escalate-run", type=Path, help="Solicitar novo planejamento Cloud a partir de uma execução interrompida.")
    cli.add_argument("--confirm-cloud-escalation", action="store_true", help="Autorizar explicitamente consumo Cloud do escalonamento.")
    cli.add_argument("--allow-test-execution", action="store_true", help="Autorizar execução de código dos testes na cópia; não é sandbox de processos.")
    return cli


def status(config, root, spec):
    directory = root / ".agent-system" / "runs" / "probes"
    directory.mkdir(parents=True, exist_ok=True)
    result = {"model_selected": spec.id, "gpu": gpu_snapshot(), "ram": ram_snapshot(), "cloud_calls": 0}
    for name, probe in (("codex", lambda: CodexCLI(config["cloud"]).probe(directory)), ("opencode", lambda: OpenCodeCLI(config["opencode"], config["local_llm"]).probe(directory, spec)), ("lmstudio", lambda: LMStudio(config["local_llm"]).inventory())):
        try:
            result[name] = probe()
        except AgentError as exc:
            result[name] = {"available": False, "error": redact(str(exc))}
    reports = sorted((root / ".agent-system" / "runs").glob("*/report.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    result["recent_runs"] = []
    for path in reports[:5]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            result["recent_runs"].append({"path": str(path.parent), "status": data["status"], "model": data["model"], "cloud_calls": data["cloud_calls"]})
        except (OSError, ValueError, KeyError):
            continue
    return result


def main(argv=None):
    cli = parser()
    args = cli.parse_args(argv)
    try:
        config = load_config(args.config)
        from .config import integer
        for argument, name in ((args.max_cloud_calls, "max_cloud_calls"), (args.max_corrections, "max_corrections")):
            if argument is not None:
                config["limits"][name] = integer(argument, name, 0, 100)
        spec = select_model(config, args.model)
        root = args.root.resolve()
        if not root.is_dir():
            raise AgentError("Raiz do repositório não existe.")
        for name in args.file:
            safe_relative(name, editable=True)
        for name in args.context_file:
            safe_relative(name)
        if args.local_only and args.plan_only:
            raise AgentError("--plan-only é Cloud; use --dry-run para validação sem consumo.")
        if (args.cloud_benchmark or args.confirm_cloud_benchmark or args.models or args.tasks_file or args.manage_models) and not args.benchmark:
            raise AgentError("Opções de benchmark exigem --benchmark.")
        if args.confirm_cloud_escalation and not args.escalate_run:
            raise AgentError("--confirm-cloud-escalation exige --escalate-run.")
        if args.escalate_run:
            if not args.confirm_cloud_escalation:
                raise AgentError("Escalonamento exige --confirm-cloud-escalation; nenhuma chamada iniciada.")
            if args.local_only or args.benchmark or args.plan_file:
                raise AgentError("Escalonamento não pode ser combinado com modo local, benchmark ou plano reutilizado.")
            path = args.escalate_run.resolve()
            if not path.is_relative_to((root / ".agent-system/runs").resolve()) or not path.is_dir():
                raise AgentError("Escalone somente uma pasta de execução dentro de .agent-system/runs.")
            old = json.loads((path / "report.json").read_text(encoding="utf-8"))
            if old.get("status") not in {"failed", "correction_limit", "validation_pending", "interrupted"}:
                raise AgentError("Execução não possui impedimento que justifique escalonamento.")
            args.task = "Replaneje a tarefa após impedimento, sem ampliar seu objetivo. Tarefa: " + old["task"] + "\nMotivo: " + str(old.get("error")) + "\nVerificações: " + json.dumps(old.get("checks", []), ensure_ascii=False)
            args.plan_only = True
        if args.hardware:
            data = {"gpu": gpu_snapshot(), "ram": ram_snapshot()}
        elif args.status:
            data = status(config, root, spec)
        elif args.dry_run:
            plan = validate_plan(json.loads(args.plan_file.read_text(encoding="utf-8-sig"))) if args.plan_file else None
            data = {"mode": "dry-run", "models_called": 0, "cloud_calls": 0, "model": spec.id, "files": args.file, "plan_validated": plan is not None, "cloud_budget": config["limits"]["max_cloud_calls"], "correction_limit": config["limits"]["max_corrections"]}
        elif args.benchmark:
            aliases = args.models.split(",") if args.models else [spec.alias]
            data = benchmark(config, root, aliases, cloud=args.cloud_benchmark, confirmed=args.confirm_cloud_benchmark, tasks_path=args.tasks_file, load_model=args.load_model, manage_models=args.manage_models, allow_test_execution=args.allow_test_execution)
        else:
            if not args.task:
                cli.error("informe uma tarefa ou um modo como --status/--hardware/--dry-run")
            plan = json.loads(args.plan_file.read_text(encoding="utf-8-sig")) if args.plan_file else None
            data = Engine(config, root).run(args.task, model_alias=args.model, local_only=args.local_only, no_reviewer=args.no_reviewer, plan_only=args.plan_only, plan=plan, files=args.file, context_files=args.context_file, load_model=args.load_model, allow_test_execution=args.allow_test_execution)
        print(json.dumps(data, ensure_ascii=False, indent=2))
        if data.get("status") and data["status"] not in {"completed", "local_verified", "planned"}:
            return 2
        if args.benchmark and any(row["result"]["status"] not in {"completed", "local_verified"} for row in data["comparisons"]):
            return 2
        if args.benchmark and data.get("model_session", {}).get("restoration") == "failed":
            return 2
        return 0
    except (AgentError, OSError, ValueError) as exc:
        print(json.dumps({"status": "failed", "error": redact(str(exc))}, ensure_ascii=False), file=sys.stderr)
        return 2
