from __future__ import annotations

from .errors import SafetyError
from .security import safe_relative

CHECKS = {"python-syntax", "diff-check", "unit-tests", "workspace-scripts"}


def obj(value, required: set[str], name: str):
    if not isinstance(value, dict) or set(value) != required:
        raise SafetyError(f"{name}: campos esperados: {', '.join(sorted(required))}.")


def strings(value, name, *, nonempty=True):
    if not isinstance(value, list) or (nonempty and not value) or any(not isinstance(x, str) or not x.strip() for x in value):
        raise SafetyError(f"{name} deve ser uma lista de textos válidos.")
    if len(set(value)) != len(value):
        raise SafetyError(f"{name} contém valores duplicados.")


def validate_plan(plan: dict, max_steps=12) -> dict:
    obj(plan, {"task", "acceptance_criteria", "risks", "steps"}, "Plano")
    if not isinstance(plan["task"], str) or not plan["task"].strip():
        raise SafetyError("Plano sem objetivo.")
    strings(plan["acceptance_criteria"], "acceptance_criteria")
    strings(plan["risks"], "risks", nonempty=False)
    if not isinstance(plan["steps"], list) or not 1 <= len(plan["steps"]) <= max_steps:
        raise SafetyError("Quantidade inválida de etapas.")
    ids = set()
    seen_files = {}
    for step in plan["steps"]:
        if not isinstance(step, dict):
            raise SafetyError("Etapa deve ser um objeto.")
        required = {"id", "title", "instructions", "files", "depends_on", "checks"}
        obj({k: v for k, v in step.items() if k != "required_files"}, required, "Etapa")
        if "required_files" in step:
            strings(step["required_files"], "required_files", nonempty=False)
            for name in step["required_files"]:
                safe_relative(name)
        for key in ("id", "title", "instructions"):
            if not isinstance(step[key], str) or not step[key].strip() or len(step[key]) > 12000:
                raise SafetyError(f"Etapa com {key} inválido.")
        if step["id"] in ids:
            raise SafetyError("IDs de etapas duplicados.")
        strings(step["files"], "files")
        strings(step["depends_on"], "depends_on", nonempty=False)
        if any(dep not in ids for dep in step["depends_on"]):
            raise SafetyError("Dependência ausente, futura ou cíclica; ordene as etapas topologicamente.")
        ids.add(step["id"])
        strings(step["checks"], "checks")
        if not set(step["checks"]) <= CHECKS:
            raise SafetyError("Plano solicitou comando/check não permitido.")
        for file in step["files"]:
            safe_relative(file, editable=True)
            if file.casefold() in seen_files and seen_files[file.casefold()] != file:
                raise SafetyError("Colisão de maiúsculas/minúsculas em nomes de arquivos.")
            seen_files[file.casefold()] = file
    return plan


def validate_review(review: dict, allowed_files: set[str]) -> dict:
    obj(review, {"status", "summary", "findings"}, "Revisão")
    if review["status"] not in {"approved", "changes_requested", "validation_pending"} or not isinstance(review["summary"], str) or not review["summary"].strip() or not isinstance(review["findings"], list):
        raise SafetyError("Revisão inválida.")
    ids = set()
    mandatory_open = False
    for finding in review["findings"]:
        obj(finding, {"id", "severity", "file", "evidence", "requested_change", "mandatory", "state"}, "Achado")
        if finding["id"] in ids or not isinstance(finding["id"], str) or not finding["id"].strip():
            raise SafetyError("ID de achado inválido/duplicado.")
        ids.add(finding["id"])
        if finding["file"] not in allowed_files or finding["severity"] not in {"critical", "high", "medium", "low"} or finding["state"] not in {"open", "awaiting_verification", "resolved"} or type(finding["mandatory"]) is not bool:
            raise SafetyError("Achado fora do escopo ou com estado/gravidade inválido.")
        if any(not isinstance(finding[k], str) or not finding[k].strip() for k in ("evidence", "requested_change")):
            raise SafetyError("Achado sem evidência ou critério de correção.")
        mandatory_open |= finding["mandatory"] and finding["state"] != "resolved"
    if review["status"] == "approved" and mandatory_open:
        raise SafetyError("Revisão contraditória: aprovação com correções obrigatórias pendentes.")
    if review["status"] == "changes_requested" and not mandatory_open:
        raise SafetyError("Rejeição sem achado obrigatório verificável.")
    return review
