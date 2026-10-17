from __future__ import annotations

import os
import shutil
import signal
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from .errors import ProviderError


@dataclass
class ProcessResult:
    stdout: str
    stderr: str
    returncode: int
    elapsed_seconds: float


def executable(name: str) -> str:
    """Evita cmd/batch; no Windows resolve diretamente o binário npm OpenCode."""
    resolved = shutil.which(name)
    if name == "opencode" and os.name == "nt":
        npm = Path(os.environ.get("APPDATA", "")) / "npm" / "node_modules"
        candidates = [npm / "@opencode/cli/bin/opencode.exe", npm / "opencode-ai/bin/opencode.exe"]
        if resolved:
            candidates.insert(0, Path(resolved).parent / "node_modules/@opencode/cli/bin/opencode.exe")
        resolved = next((str(p) for p in candidates if p.is_file()), resolved)
    if not resolved and Path(name).is_file():
        resolved = str(Path(name).resolve())
    if not resolved or Path(resolved).suffix.lower() in {".cmd", ".bat", ".ps1"}:
        raise ProviderError(f"Executável nativo não encontrado: {name}. Configure o caminho do .exe.")
    return resolved


def clean_environment() -> dict:
    # Não entrega credenciais da aplicação/processo pai aos testes ou Coder.
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "NUMBER_OF_PROCESSORS", "LANG", "LC_ALL"}
    env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
    return env


def terminate_tree(process: subprocess.Popen) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()


def run_process(args: list[str], *, cwd: Path, timeout: float, input_text: str | None = None, env: dict | None = None) -> ProcessResult:
    if not args or any(not isinstance(a, str) or "\x00" in a for a in args):
        raise ProviderError("Argumentos inválidos para subprocesso.")
    started = time.monotonic()
    try:
        process = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", errors="replace", env=env or clean_environment(), shell=False,
                                   start_new_session=os.name != "nt", creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            stdout, stderr = process.communicate(input_text, timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
            terminate_tree(process)
            stdout, stderr = process.communicate(timeout=10)
            if isinstance(exc, KeyboardInterrupt):
                raise
            partial = ProcessResult(stdout or "", stderr or "", process.returncode, time.monotonic() - started)
            raise ProviderError(f"Timeout após {timeout:g}s; árvore de processos encerrada.", process=partial) from exc
    except OSError as exc:
        raise ProviderError(f"Falha ao iniciar {Path(args[0]).name}: {exc}") from exc
    result = ProcessResult(stdout, stderr, process.returncode, time.monotonic() - started)
    if result.returncode:
        from .security import redact
        diagnostic = redact((stderr or stdout)[-2000:])
        if any(s in (stdout + stderr).lower() for s in ("out of memory", "cuda oom", "insufficient memory", "not enough memory", "failed to allocate")):
            raise ProviderError(f"Falta de memória no runtime: {diagnostic}", process=result)
        raise ProviderError(f"{Path(args[0]).name} falhou (código {result.returncode}): {diagnostic}", process=result)
    return result
