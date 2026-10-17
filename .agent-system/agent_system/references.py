"""Explicit, bounded reference inputs; never silently drop a visual requirement."""
from __future__ import annotations

import hashlib
import re
import struct
from pathlib import Path

from .errors import SafetyError
from .security import contained, safe_relative

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}


def discover(task, explicit=()):
    # References in prose are requirements too, even when --reference-file is omitted.
    mentioned = re.findall(r"(?<![\w/])(?:[\w.\-]+/)*[\w.\-]+\.(?:png|jpe?g|webp|pdf)\b", task, re.I)
    return list(dict.fromkeys([*explicit, *mentioned]))


def image_size(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 33 and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 255:
                break
            marker = data[offset + 1]
            offset += 2
            if marker in {0xD8, 0xD9}:
                continue
            length = int.from_bytes(data[offset:offset + 2], "big")
            if length < 2 or offset + length > len(data):
                break
            if marker in {0xC0, 0xC1, 0xC2} and length >= 7:
                height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
                return width, height
            offset += length
    raise SafetyError("Referência de imagem inválida; formatos aceitos: PNG e JPEG.")


def preflight(root: Path, names):
    if len(names) > 16:
        raise SafetyError("Limite de 16 referências excedido.")
    result = []
    for name in names:
        safe_relative(name)
        path = contained(root, name)
        if not path.is_file() or path.stat().st_size > 2_000_000:
            raise SafetyError(f"Referência ausente/inacessível ou maior que 2 MB: {name}")
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise SafetyError(f"Referência inacessível: {name}") from exc
        is_image = path.suffix.lower() in IMAGE_SUFFIXES
        row = {"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "image": is_image}
        if is_image:
            width, height = image_size(data)
            if not 0 < width <= 8192 or not 0 < height <= 8192 or width * height > 16_000_000:
                raise SafetyError(f"Dimensões da referência excedem limites seguros: {name}")
            row.update(width=width, height=height)
        else:
            try:
                data.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise SafetyError(f"Referência binária sem adaptador: {name}") from exc
            if b"\0" in data:
                raise SafetyError(f"Referência binária sem adaptador: {name}")
        result.append(row)
    if sum(r["image"] for r in result) > 4 or sum(r["bytes"] for r in result) > 8_000_000:
        raise SafetyError("Referências excedem 4 imagens ou 8 MB combinados.")
    return result


def attach(snapshot, root, references):
    for row in references:
        data = contained(root, row["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != row["sha256"]:
            raise SafetyError("Referência mudou após preflight: " + row["path"])
        snapshot.files[row["path"]] = data
    if sum(map(len, snapshot.files.values())) > 20_000_000:
        raise SafetyError("Snapshot com referências excedeu 20 MB.")
    digest = hashlib.sha256()
    for name, data in sorted(snapshot.files.items()):
        digest.update(name.encode() + b"\0" + data + b"\0")
    snapshot.digest = digest.hexdigest()


def prepare_visual(provider, workspace, references):
    images = [contained(workspace, r["path"]) for r in references if r["image"]]
    if not images:
        raise SafetyError("Interpretação visual exige pelo menos uma imagem acessível.")
    prepare = getattr(provider, "prepare_visual", None)
    if not callable(prepare):
        raise SafetyError("Adaptador selecionado não comprova capacidade multimodal e envio da imagem.")
    evidence = prepare(images)
    if not isinstance(evidence, dict) or evidence.get("image_input") is not True or evidence.get("attachments") != len(images):
        raise SafetyError("Adaptador não confirmou transporte multimodal das referências.")
    return evidence
