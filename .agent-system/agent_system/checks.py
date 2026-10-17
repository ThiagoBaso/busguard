from __future__ import annotations

import ast
import sys
import json
import re
import shutil
import tempfile
import time
from pathlib import Path

from .errors import SafetyError
from .process import run_process
from .process import executable, clean_environment
from .security import contained, redact, safe_relative
from .validation import CHECKS


def validate_workspaces(specs):
    if not isinstance(specs, list):
        raise SafetyError("verification.workspaces deve ser uma lista.")
    seen = set()
    for spec in specs:
        if not isinstance(spec, dict) or set(spec) != {"path", "scripts"}:
            raise SafetyError("Workspace exige path e scripts.")
        if spec["path"] != ".":
            safe_relative(spec["path"])
        if spec["path"] in seen:
            raise SafetyError("Workspace duplicado na configuração.")
        seen.add(spec["path"])
        if not isinstance(spec["scripts"], list) or not spec["scripts"] or any(not isinstance(s, str) or not re.fullmatch(r"[A-Za-z0-9:_-]+", s) for s in spec["scripts"]):
            raise SafetyError("Selecione scripts nomeados do package.json; comandos livres não são permitidos.")
    return specs


def npm_command(script: str) -> list[str]:
    # Invoke the installed JS entrypoint through node, without building a cmd string.
    node = executable("node")
    npm = shutil.which("npm")
    candidates = [Path(node).parent / "node_modules/npm/bin/npm-cli.js"]
    if npm:
        candidates += [Path(npm).parent / "node_modules/npm/bin/npm-cli.js", Path(npm).resolve().parent / "npm-cli.js"]
    entry = next((p for p in candidates if p.is_file()), None)
    if entry is None:
        raise SafetyError("npm-cli.js não encontrado; configure a instalação Node/npm do ambiente.")
    return [node, str(entry), "run", script]


def workspace_checks(workspace, specs, contracts, authorized, remaining, dependency_sources):
    if not specs:
        return [{"name": "workspace-scripts", "status": "pending", "details": "Configure verification.workspaces com caminhos e scripts definidos no package.json.", "elapsed_seconds": None}]
    results = []
    # Build artifacts and test compilation stay outside the Coder workspace.
    with tempfile.TemporaryDirectory(prefix="verification-", dir=workspace.parent) as temp:
        copy = Path(temp) / "project"
        shutil.copytree(workspace, copy, ignore=shutil.ignore_patterns(".git"))
        original = {p.relative_to(copy): p.read_bytes() for p in copy.rglob("*") if p.is_file()}
        for spec in validate_workspaces(specs):
            folder = copy if spec["path"] == "." else contained(copy, spec["path"])
            source = dependency_sources.get(spec["path"])
            if source is not None and authorized:
                source = Path(source)
                if source.is_symlink() or (hasattr(source, "is_junction") and source.is_junction()):
                    raise SafetyError("Diretório de dependências contém link.")
                if source.is_dir():
                    for entry in source.rglob("*"):
                        remaining()
                        if entry.is_symlink() or (hasattr(entry, "is_junction") and entry.is_junction()):
                            raise SafetyError("Dependências contêm links; prepare uma instalação npm independente.")
                    target = folder / "node_modules"
                    # Preserve rather than follow a symlink introduced after the scan.
                    # The copied tree is rejected before scripts can observe any link.
                    shutil.copytree(source, target, symlinks=True)
                    for entry in target.rglob("*"):
                        remaining()
                        if entry.is_symlink() or (hasattr(entry, "is_junction") and entry.is_junction()):
                            raise SafetyError("Link detectado na cópia de dependências.")
            manifest = folder / "package.json"
            scripts = json.loads(manifest.read_text(encoding="utf-8-sig")).get("scripts", {}) if manifest.is_file() else {}
            expected = contracts.get(spec["path"], scripts) if contracts is not None else scripts
            for script in spec["scripts"]:
                row = {"name": spec["path"] + ":" + script, "status": "pending", "details": "", "elapsed_seconds": None}
                if script not in scripts:
                    row["details"] = "Script não definido no package.json; não foi substituído por comando presumido."
                elif scripts != expected:
                    row.update(status="failed", details="Coder modificou o comando de verificação; exige revisão antes de executar.")
                elif not authorized:
                    row["details"] = "Executar scripts requer --allow-test-execution."
                else:
                    try:
                        process = run_process(npm_command(script), cwd=folder, timeout=remaining(), env=clean_environment())
                        row.update(status="passed", details=redact((process.stdout + process.stderr)[-10000:]), elapsed_seconds=process.elapsed_seconds, command=["npm", "run", script])
                    except Exception as exc:
                        from .errors import AgentError
                        if not isinstance(exc, (AgentError, OSError, ValueError)):
                            raise
                        row.update(status="failed", details=redact(str(exc)))
                mutated = [str(p) for p, data in original.items() if not (copy / p).is_file() or (copy / p).read_bytes() != data]
                if mutated:
                    row.update(status="failed", details="Script alterou fontes da cópia de verificação: " + ", ".join(mutated[:10]))
                results.append(row)
                if mutated:
                    return results
    return results


def run_checks(workspace: Path, names: list[str], changed: list[str], *, allow_test_execution=False, timeout=120, workspace_specs=None, script_contracts=None, dependency_sources=None) -> list[dict]:
    results = []
    started = time.monotonic()
    def remaining():
        left = timeout - (time.monotonic() - started)
        if left <= 0:
            from .errors import AgentError
            raise AgentError("Tempo total de verificações esgotado.")
        return left
    for name in dict.fromkeys(names):
        if name not in CHECKS:
            raise SafetyError(f"Comando/check proibido: {name}.")
        result = {"name": name, "status": "passed", "details": "", "elapsed_seconds": None}
        try:
            remaining()
            if name == "workspace-scripts":
                results.extend(workspace_checks(workspace, workspace_specs or [], script_contracts, allow_test_execution, remaining, dependency_sources or {}))
                continue
            if name == "python-syntax":
                count = 0
                for file in changed:
                    path = contained(workspace, file)
                    if path.suffix == ".py" and path.exists():
                        ast.parse(path.read_text(encoding="utf-8-sig"), filename=file, feature_version=(3, 12))
                        count += 1
                result["details"] = f"AST Python 3.12: {count} arquivo(s); não executa imports nem testes de negócio."
            elif name == "diff-check":
                issues = []
                for file in changed:
                    path = contained(workspace, file)
                    if path.exists():
                        for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
                            if line.rstrip() != line:
                                issues.append(f"{file}:{number}: whitespace final")
                            if line.startswith(("<<<<<<< ", "=======", ">>>>>>> ")):
                                issues.append(f"{file}:{number}: possível conflito de merge")
                if issues:
                    raise ValueError("; ".join(issues[:20]))
                result["details"] = "Sem whitespace final ou marcadores de conflito nos arquivos alterados."
            else:
                if not allow_test_execution:
                    result.update(status="pending", details="Executar testes usa código não confiável. Autorize com --allow-test-execution em ambiente adequado.")
                else:
                    tests = contained(workspace, "tests")
                    if not tests.is_dir() or not list(tests.rglob("test*.py")):
                        raise ValueError("Não há testes Python em tests/; configure/crie a suíte antes de concluir.")
                    worker = Path(__file__).resolve().parents[1] / "verification_worker.py"
                    process = run_process([sys.executable, "-I", "-B", str(worker), str(workspace.resolve())], cwd=workspace, timeout=remaining())
                    result.update(details=redact((process.stdout + process.stderr)[-10000:]), elapsed_seconds=process.elapsed_seconds)
        except (SyntaxError, UnicodeError, ValueError, OSError) as exc:
            result.update(status="failed", details=redact(str(exc)))
        except Exception as exc:
            from .errors import AgentError
            if not isinstance(exc, AgentError):
                raise
            result.update(status="failed", details=redact(str(exc)))
        results.append(result)
    return results
