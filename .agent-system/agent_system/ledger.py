"""Durable per-task attempts and reservations. A crashed active attempt fails closed."""
from __future__ import annotations

import json
import re
import sqlite3
import time
import uuid
from pathlib import Path

from .errors import BudgetError, SafetyError
from .usage import normalized, summarize


class TaskLedger:
    def __init__(self, root: Path, task_id: str | None, task: str, limits: dict):
        self.task_id = task_id or uuid.uuid4().hex
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", self.task_id):
            raise SafetyError("task-id inválido: use até 64 letras, dígitos, _ ou -.")
        folder = root.resolve() / ".agent-system/runs/tasks"
        self.path = folder / (self.task_id + ".sqlite3")
        if not self.path.resolve().is_relative_to(root.resolve()) or any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in [root / ".agent-system", root / ".agent-system/runs", folder, self.path]):
            raise SafetyError("Ledger fora da raiz ou contendo links.")
        folder.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=5)
        self.limits = limits
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS task (id TEXT PRIMARY KEY, objective TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempt (id TEXT PRIMARY KEY, started REAL NOT NULL, elapsed REAL, status TEXT);
            CREATE TABLE IF NOT EXISTS call (id TEXT PRIMARY KEY, attempt TEXT, role TEXT, environment TEXT, status TEXT, metrics TEXT);
            CREATE TABLE IF NOT EXISTS correction (id INTEGER PRIMARY KEY, attempt TEXT);
        """)
        self.attempt_id = uuid.uuid4().hex
        try:
            with self.db:
                self.db.execute("BEGIN IMMEDIATE")
                row = self.db.execute("SELECT objective FROM task").fetchone()
                if row and row[0] != task:
                    raise SafetyError("task-id já associado a outro objetivo; não reutilize para tarefa diferente.")
                if self.db.execute("SELECT 1 FROM attempt WHERE elapsed IS NULL").fetchone():
                    raise BudgetError("Tarefa possui tentativa ativa/interrompida sem fechamento; revise o ledger antes de retomar.")
                self.db.execute("INSERT OR IGNORE INTO task VALUES (?,?)", (self.task_id, task))
                self.db.execute("INSERT INTO attempt VALUES (?,?,NULL,'running')", (self.attempt_id, time.time()))
        except BaseException:
            self.db.close()
            raise
        self.started = time.monotonic()

    def remaining(self):
        elapsed = self.db.execute("SELECT COALESCE(SUM(elapsed),0) FROM attempt").fetchone()[0]
        left = self.limits["total_timeout_seconds"] - elapsed - (time.monotonic() - self.started)
        if left <= 0:
            raise BudgetError("Tempo acumulado da tarefa esgotado.")
        return left

    def calls(self):
        result = []
        for cid, attempt, role, environment, status, metrics in self.db.execute("SELECT id,attempt,role,environment,status,metrics FROM call ORDER BY rowid"):
            value = json.loads(metrics) if metrics is not None else {"provider": "codex" if environment == "cloud" else "opencode", "usage_complete": False}
            result.append(normalized({**value, "call_id": cid, "attempt_id": attempt, "role": role, "environment": environment, "status": status}))
        return result

    def reserve(self, role, environment):
        self.remaining()
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            calls = self.calls()
            for field, scope in [("max_cloud_tokens", "cloud"), ("max_total_tokens", None)]:
                if scope == "cloud" and environment != "cloud":
                    continue
                limit = self.limits.get(field)
                relevant = [v for v in calls if scope is None or v.get("environment") == scope]
                if limit is not None:
                    if any(v.get("total_tokens") is None or not v.get("usage_complete", False) for v in relevant):
                        raise BudgetError("Uso desconhecido impede nova inferência sob limite de tokens: " + field)
                    if sum(v["total_tokens"] for v in relevant) >= limit:
                        raise BudgetError("Limite de tokens registrados atingido: " + field)
            if environment == "cloud":
                count = self.db.execute("SELECT COUNT(*) FROM call WHERE environment='cloud'").fetchone()[0]
                if count >= self.limits["max_cloud_calls"]:
                    raise BudgetError("Orçamento Cloud acumulado esgotado.")
                if role == "reviewer":
                    reviews = self.db.execute("SELECT COUNT(*) FROM call WHERE role='reviewer' AND environment='cloud'").fetchone()[0]
                    if reviews >= self.limits.get("max_reviews", self.limits["max_cloud_calls"]):
                        raise BudgetError("Limite de revisões Cloud atingido.")
            cid = uuid.uuid4().hex
            unknown = normalized({"provider": "codex" if environment == "cloud" else "opencode", "usage_complete": False, "source": "reservation_pending_usage"})
            self.db.execute("INSERT INTO call VALUES (?,?,?,?,?,?)", (cid, self.attempt_id, role, environment, "reserved", json.dumps(unknown)))
            return cid

    def record(self, cid, metrics, status):
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            row = self.db.execute("SELECT role,environment FROM call WHERE id=? AND attempt=? AND status='reserved'", (cid, self.attempt_id)).fetchone()
            if row is None:
                raise SafetyError("Uso já registrado ou chamada de outra tentativa; histórico é imutável.")
            value = normalized({**metrics, "role": row[0], "environment": row[1], "call_id": cid, "attempt_id": self.attempt_id, "status": status})
            self.db.execute("UPDATE call SET status=?,metrics=? WHERE id=?", (status, json.dumps(value), cid))

    def correct(self):
        self.remaining()
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            n = self.db.execute("SELECT COUNT(*) FROM correction").fetchone()[0]
            if n >= self.limits["max_corrections"]:
                raise BudgetError("Limite acumulado de correções atingido.")
            self.db.execute("INSERT INTO correction(attempt) VALUES (?)", (self.attempt_id,))

    def finish(self, status):
        with self.db:
            self.db.execute("UPDATE call SET status='interrupted' WHERE attempt=? AND status='reserved'", (self.attempt_id,))
            self.db.execute("UPDATE attempt SET elapsed=?,status=? WHERE id=?", (time.monotonic() - self.started, status, self.attempt_id))

    def summary(self):
        calls = self.calls()
        exceeded = []
        for name, scope in [("max_cloud_tokens", "cloud"), ("max_total_tokens", None)]:
            limit = self.limits.get(name)
            recorded = sum(c["recorded_total_tokens"] for c in calls if (scope is None or c.get("environment") == scope) and c.get("recorded_total_tokens") is not None)
            if limit is not None and recorded > limit:
                exceeded.append(name)
        elapsed = self.db.execute("SELECT COALESCE(SUM(elapsed),0) FROM attempt").fetchone()[0]
        if elapsed > self.limits["total_timeout_seconds"]:
            exceeded.append("total_timeout_seconds")
        return {"task_id": self.task_id, "path": str(self.path), "attempts": self.db.execute("SELECT COUNT(*) FROM attempt").fetchone()[0], "cloud_calls": self.db.execute("SELECT COUNT(*) FROM call WHERE environment='cloud'").fetchone()[0], "corrections": self.db.execute("SELECT COUNT(*) FROM correction").fetchone()[0], "elapsed_seconds": elapsed, "by_role": summarize(calls), "limits": self.limits, "limits_exceeded": exceeded}
