from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .errors import SafetyError
from .process import clean_environment
from .security import PROTECTED_NAMES, contained, safe_relative


@dataclass
class Snapshot:
    files: dict[str, bytes]
    digest: str

    @classmethod
    def capture(cls, root: Path) -> "Snapshot":
        root = root.resolve()
        result = subprocess.run(["git", "-c", "safe.directory=" + root.as_posix(), "-c", "core.fsmonitor=false", "-C", str(root), "ls-files", "-co", "--exclude-standard", "-z"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=clean_environment(), timeout=30, check=False)
        if result.returncode:
            raise SafetyError("Não foi possível listar os arquivos via Git. Execute dentro de um repositório Git.")
        files = {}
        for name in sorted(set(result.stdout.decode("utf-8").split("\0"))):
            if not name:
                continue
            try:
                safe_relative(name)
                if Path(name).name.casefold() in PROTECTED_NAMES:
                    continue
                path = contained(root, name)
            except SafetyError:
                continue
            limit = 2_000_000 if path.name in {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"} else 250000
            if not path.is_file() or path.stat().st_size > limit:
                continue
            data = path.read_bytes()
            try:
                data.decode("utf-8-sig")
            except UnicodeDecodeError:
                continue
            if b"\x00" in data:
                continue
            files[name] = data
        if not files:
            raise SafetyError("Snapshot sem arquivos de texto seguros.")
        if sum(len(x) for x in files.values()) > 20_000_000:
            raise SafetyError("Snapshot excedeu 20 MB; reduza o escopo.")
        digest = hashlib.sha256()
        for name, data in sorted(files.items()):
            digest.update(name.encode() + b"\0" + data + b"\0")
        return cls(files, digest.hexdigest())

    def write(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=False)
        for name, data in self.files.items():
            dest = contained(directory, name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)


def tree_files(root: Path) -> dict[str, bytes]:
    files = {}
    for path in root.rglob("*"):
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise SafetyError(f"Link criado pelo Coder: {path.relative_to(root)}")
        if path.is_file():
            if path.stat().st_size > 2_000_000:
                raise SafetyError("Arquivo do Coder excedeu o limite de 2 MB.")
            files[path.relative_to(root).as_posix()] = path.read_bytes()
            if len(files) > 5000:
                raise SafetyError("Limite de arquivos do workspace excedido.")
    return files


class Workspace:
    def __init__(self, run_dir: Path, snapshot: Snapshot):
        self.run_dir = run_dir
        self.path = run_dir / "workspace"
        self.baseline = run_dir / "baseline"
        snapshot.write(self.path)
        snapshot.write(self.baseline)
        # Uma fronteira Git própria impede descoberta do .git do projeto pai pelo OpenCode.
        result = subprocess.run(["git", "-c", "init.defaultBranch=agent-workspace", "init", "--quiet", "--template=", str(self.path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=clean_environment(), timeout=30, check=False)
        if result.returncode:
            raise SafetyError("Não foi possível criar a fronteira Git isolada, sem commits.")
        shutil.copytree(self.path / ".git", self.baseline / ".git")
        self.original = tree_files(self.baseline)
        self.snapshot_digest = snapshot.digest

    def install_plan(self, plan: dict) -> None:
        contents = ("# Plano desta execução (mantido pelo orquestrador)\n\n```json\n" + json.dumps(plan, ensure_ascii=False, indent=2) + "\n```\n").encode("utf-8")
        for directory in (self.path, self.baseline):
            (directory / "PLAN.md").write_bytes(contents)
        self.original["PLAN.md"] = contents

    def inspect_changes(self, allowed: set[str]) -> list[str]:
        for name in allowed:
            safe_relative(name, editable=True)
        current = tree_files(self.path)
        changes = sorted(name for name in self.original.keys() | current.keys() if self.original.get(name) != current.get(name))
        for name in changes:
            safe_relative(name, editable=True)
            if name not in allowed:
                raise SafetyError(f"Coder alterou arquivo fora do escopo: {name}. Workspace preservado para inspeção.")
        return changes

    def checkpoint(self) -> dict[str, bytes]:
        return tree_files(self.path)

    def verify_step(self, before: dict[str, bytes], allowed: set[str]) -> None:
        after = tree_files(self.path)
        for name in before.keys() | after.keys():
            if before.get(name) != after.get(name):
                safe_relative(name, editable=True)
                if name not in allowed:
                    raise SafetyError(f"Etapa alterou arquivo não atribuído: {name}.")

    def diff(self) -> str:
        result = subprocess.run(["git", "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--", "baseline", "workspace"], cwd=self.run_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=clean_environment(), timeout=30, check=False)
        if result.returncode not in {0, 1}:
            raise SafetyError("Falha ao registrar diff via Git.")
        return result.stdout.decode("utf-8", errors="replace").replace("a/baseline/", "a/").replace("b/workspace/", "b/")
