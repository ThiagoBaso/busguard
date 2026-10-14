from __future__ import annotations

import ast
import sys
from pathlib import Path

from .errors import SafetyError
from .process import run_process
from .security import contained, redact
from .validation import CHECKS


def run_checks(workspace: Path, names: list[str], changed: list[str], *, allow_test_execution=False, timeout=120) -> list[dict]:
    results = []
    for name in dict.fromkeys(names):
        if name not in CHECKS:
            raise SafetyError(f"Comando/check proibido: {name}.")
        result = {"name": name, "status": "passed", "details": "", "elapsed_seconds": None}
        try:
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
                    process = run_process([sys.executable, "-I", "-B", str(worker), str(workspace.resolve())], cwd=workspace, timeout=timeout)
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
