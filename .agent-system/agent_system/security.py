from __future__ import annotations

import re
from pathlib import Path, PurePosixPath

from .errors import SafetyError

EXCLUDED_PARTS = {".git", ".agent-system", ".codex", ".agents", ".aws", ".ssh", ".opencode", "node_modules", ".venv", "venv", "__pycache__", ".expo", "dist", "build", "runs"}
PROTECTED_NAMES = {"plan.md", "review.md", "opencode.json", "opencode.jsonc", "auth.json", "credentials", "credentials.json"}
SECRET_PATTERNS = [
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{15,}|AKIA[A-Z0-9]{16})\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"),
    re.compile(r"(?i)(?:password|passwd|api_key|secret_key|access_token)\s*[:=]\s*[\"'][^\"'\r\n]{4,}[\"']"),
    re.compile(r"(?i)(?:mysql|postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@"),
]


def redact(text: str) -> str:
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


def cloud_text(text: str, limit: int) -> str:
    if len(text) > limit:
        raise SafetyError(f"Contexto Cloud excede {limit} caracteres; selecione menos arquivos ou uma tarefa menor.")
    if redact(text) != text:
        raise SafetyError("Conteúdo Cloud contém possível segredo ou dado pessoal. Revise o contexto antes de enviar.")
    return text


def safe_relative(value: str, *, editable: bool = False) -> str:
    if not isinstance(value, str) or not value or value != value.strip() or any(c in value for c in "\\:\x00\r\n*?<>|\""):
        raise SafetyError(f"Caminho inválido: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} or part.endswith((".", " ")) for part in value.split("/")):
        raise SafetyError(f"Caminho fora do escopo: {value!r}")
    parts = {part.casefold() for part in path.parts}
    names = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
    if any(part.split(".")[0].casefold() in names for part in path.parts):
        raise SafetyError(f"Nome reservado no Windows: {value}")
    if parts & EXCLUDED_PARTS or any(part.lower().startswith(".env") or part.lower().endswith(".env") for part in path.parts) or path.name.casefold() in {"id_rsa", "id_ed25519"} or path.suffix.casefold() in {".pem", ".key", ".pfx", ".p12", ".sql", ".db", ".sqlite", ".sqlite3", ".log"}:
        raise SafetyError(f"Arquivo protegido/sensível: {value}")
    if editable and path.name.casefold() in PROTECTED_NAMES:
        raise SafetyError(f"Arquivo reservado ao orquestrador: {value}")
    return path.as_posix()


def contained(root: Path, relative: str) -> Path:
    relative = safe_relative(relative)
    root = root.resolve()
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise SafetyError(f"Links não são permitidos: {relative}")
    if not current.resolve().is_relative_to(root):
        raise SafetyError(f"Caminho escapou do workspace: {relative}")
    return current
