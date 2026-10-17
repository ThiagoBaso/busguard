from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .errors import ConfigurationError

SYSTEM_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = SYSTEM_DIR / "config.json"


@dataclass(frozen=True)
class ModelSpec:
    alias: str
    id: str
    context_length: int
    timeout_seconds: int
    output_tokens: int


def integer(value, name, minimum=1, maximum=86400):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} deve ser inteiro entre {minimum} e {maximum}.")
    return value


def load_config(path: Path | None = None) -> dict:
    try:
        config = json.loads((path or DEFAULT_CONFIG).read_text(encoding="utf-8-sig"))
        if not isinstance(config, dict):
            raise ConfigurationError("Configuração deve ser um objeto JSON.")
        local = config["local_llm"]
        url = urlparse(local["base_url"])
        if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"} or url.username or url.password or url.query or url.fragment or url.path.rstrip("/") != "/v1":
            raise ConfigurationError("LM Studio deve usar HTTP loopback com caminho /v1, sem credenciais na URL.")
        if local["provider"] != "lmstudio":
            raise ConfigurationError("Somente o provider local lmstudio é permitido.")
        for name in ("max_cloud_calls", "max_corrections"):
            integer(config["limits"][name], name, 0, 100)
        for name in ("max_cloud_tokens", "max_total_tokens"):
            if config["limits"].get(name) is not None:
                integer(config["limits"][name], name, 0, 10**12)
        if "max_reviews" in config["limits"]:
            integer(config["limits"]["max_reviews"], "max_reviews", 0, 100)
        integer(config["limits"]["max_steps"], "max_steps", 1, 100)
        integer(config["limits"]["max_context_chars"], "max_context_chars", 1000, 200000)
        integer(config["limits"]["total_timeout_seconds"], "total_timeout_seconds")
        integer(config["cloud"]["timeout_seconds"], "cloud.timeout_seconds")
        if not isinstance(local["models"], dict) or not local["models"]:
            raise ConfigurationError("Configure pelo menos um modelo local.")
        for alias in local["models"]:
            select_model(config, alias)
        select_model(config, local["default_model"])
        from .validation import CHECKS
        if not isinstance(config["checks"], list) or not all(c in CHECKS for c in config["checks"]):
            raise ConfigurationError("Checks permitidos: " + ", ".join(sorted(CHECKS)))
        if not config["checks"]:
            raise ConfigurationError("Configure pelo menos uma verificação.")
        integer(config["verification"]["timeout_seconds"], "verification.timeout_seconds")
        from .checks import validate_workspaces
        validate_workspaces(config["verification"].get("workspaces", []))
        if type(config["verification"].get("copy_dependencies", False)) is not bool:
            raise ConfigurationError("copy_dependencies deve ser booleano.")
        interval = config["monitoring"]["interval_seconds"]
        if type(interval) not in {int, float} or not 0.1 <= interval <= 60:
            raise ConfigurationError("Intervalo de monitoramento deve estar entre 0.1 e 60 segundos.")
        return copy.deepcopy(config)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ConfigurationError(f"Configuração inválida: {exc}") from exc


def select_model(config: dict, alias: str | None = None) -> ModelSpec:
    local = config["local_llm"]
    alias = alias or local["default_model"]
    try:
        entry = local["models"][alias]
    except KeyError as exc:
        raise ConfigurationError(f"Alias de modelo inexistente: {alias}. Opções: {', '.join(local['models'])}") from exc
    model_id = entry["id"]
    if not isinstance(model_id, str) or not model_id.strip() or any(c in model_id for c in "\r\n\x00#") or model_id.startswith("-"):
        raise ConfigurationError(f"ID inválido para o modelo {alias}.")
    context = integer(entry.get("context_length", local["context_length"]), "context_length", 1024, 1048576)
    timeout = integer(entry.get("timeout_seconds", local["timeout_seconds"]), "model.timeout_seconds")
    output = integer(entry.get("output_tokens", local.get("output_tokens", 2048)), "output_tokens", 128, context - 1)
    return ModelSpec(alias, model_id, context, timeout, output)
