from __future__ import annotations

from pathlib import Path

from .config import ModelSpec
from .errors import AgentError, ProviderError
from .process import executable


class ModelSession:
    """Troca nativa de modelos, usada SOMENTE após --manage-models explícito."""

    def __init__(self, client, timeout=600):
        self.client, self.timeout = client, timeout
        self.original = []
        self.owned = None
        self.model_keys = {}
        self.audit = {"authorized": True, "events": [], "restoration": "not_started", "limitations": "Restaura IDs, contexto e parallel quando informados; placement/offload e outros parâmetros não expostos pela CLI não podem ser reproduzidos integralmente."}

    def command(self, arguments):
        self.client.runner([executable("lms"), *arguments], cwd=Path.cwd(), timeout=self.timeout)
        self.audit["events"].append({"command": ["lms", *arguments]})

    def start(self):
        inventory = self.client.inventory()
        if not inventory.get("native_inventory") or any(m.get("loaded") is None for m in inventory["models"]):
            raise ProviderError("Troca gerenciada exige inventário nativo com estado dos modelos confirmado.")
        self.original = [m for m in inventory["models"] if m.get("loaded") and m.get("type") not in {"embedding", "embeddings"}]
        self.model_keys = {m["id"]: m["id"] for m in inventory["models"]}
        for model in inventory["models"]:
            for instance in model["instances"]:
                self.model_keys[instance["id"]] = model["id"]
        self.audit["original_models"] = self.original
        # Mantém a lista original antes de qualquer unload, para permitir recuperação.
        for model in self.original:
            for instance in model["instances"]:
                self.command(["unload", instance["id"]])

    def activate(self, spec: ModelSpec):
        if self.owned:
            loaded = {i["id"] for m in self.client.inventory()["models"] for i in m["instances"]}
            if self.owned in loaded:
                self.command(["unload", self.owned])
            self.owned = None
        self.timeout = spec.timeout_seconds
        args = ["load", self.model_keys.get(spec.id, spec.id), "--identifier", spec.id, "--context-length", str(spec.context_length), "--parallel", "1"]
        if not self.client.config.get("gpu", {}).get("use_available_gpus", True):
            args += ["--gpu", "off"]
        self.owned = spec.id
        self.command(args)
        self.client.ensure_model(spec, load=False)

    def restore(self):
        failures = []
        try:
            loaded = {i["id"] for m in self.client.inventory()["models"] for i in m["instances"]}
        except AgentError as exc:
            loaded = None
            failures.append("Estado do runtime desconhecido durante recuperação: " + str(exc))
        if self.owned:
            try:
                if loaded is None or self.owned in loaded:
                    self.command(["unload", self.owned])
                    if loaded is not None:
                        loaded.discard(self.owned)
                self.owned = None
            except AgentError as exc:
                failures.append(str(exc))
        for model in self.original:
            for instance in model["instances"]:
                if loaded is not None and instance["id"] in loaded:
                    continue
                settings = instance.get("config", {})
                args = ["load", model["id"], "--identifier", instance["id"]]
                if settings.get("context_length"):
                    args += ["--context-length", str(settings["context_length"])]
                if settings.get("parallel"):
                    args += ["--parallel", str(settings["parallel"])]
                try:
                    self.command(args)
                except AgentError as exc:
                    failures.append(str(exc))
        self.audit["restoration"] = "failed" if failures else "supported_settings_restored"
        self.audit["restore_errors"] = failures
        return self.audit
