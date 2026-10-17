"""Numeric-only usage accounting; never persist prompts, credentials or reasoning text."""
from __future__ import annotations

import json
import sqlite3
from collections import Counter
from contextlib import closing
from pathlib import Path

FIELDS = ("input_tokens", "output_tokens", "cached_input_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens")


def normalized(metrics: dict) -> dict:
    result = dict(metrics)
    # Cloud output already includes reasoning; OpenCode records reasoning separately.
    names = ["input_tokens", "output_tokens"]
    if result.get("provider") == "opencode":
        names += ["reasoning_tokens", "cached_input_tokens", "cache_write_tokens"]
    values = [result.get(k) for k in names]
    known = [v for v in values if type(v) is int]
    result["recorded_total_tokens"] = sum(known) if known else None
    result["total_tokens"] = sum(values) if all(type(v) is int and v >= 0 for v in values) else None
    result.setdefault("usage_complete", result["total_tokens"] is not None)
    return result


def opencode_snapshot(directory: Path) -> dict | None:
    path = directory / "opencode/data/opencode/opencode.db"
    if not path.is_file():
        return None
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)) as db:
            db.execute("PRAGMA query_only=ON")
            sessions = {}
            for row in db.execute("SELECT id,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_idle FROM session_v2"):
                sessions[row[0]] = {"model": json.loads(row[1] or "{}"), "input_tokens": row[2], "output_tokens": row[3], "reasoning_tokens": row[4], "cached_input_tokens": row[5], "cache_write_tokens": row[6], "idle": row[7] is not None, "groups": {}}
            for sid, kind, data in db.execute("SELECT session_id,type,data FROM session_message WHERE type IN ('assistant','compaction')"):
                item = json.loads(data)
                tokens = item.get("tokens")
                if sid not in sessions or not tokens:
                    continue
                group = sessions[sid]["groups"].setdefault(kind, Counter())
                group.update({"calls": 1, "input_tokens": tokens.get("input", 0), "output_tokens": tokens.get("output", 0), "reasoning_tokens": tokens.get("reasoning", 0), "cached_input_tokens": (tokens.get("cache") or {}).get("read", 0), "cache_write_tokens": (tokens.get("cache") or {}).get("write", 0)})
            return sessions
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return None


def opencode_delta(before: dict | None, after: dict | None, elapsed: float) -> dict | None:
    if not after:
        return None
    fields = FIELDS[:-1]
    totals = Counter({k: 0 for k in fields})
    groups = {}
    ids, models, complete = [], [], True
    for sid, new in after.items():
        old = (before or {}).get(sid, {})
        delta = {k: new[k] - old.get(k, 0) for k in fields}
        if not any(delta.values()) and sid in (before or {}):
            continue
        ids.append(sid)
        models.append(new["model"])
        complete = complete and new["idle"]
        totals.update(delta)
        remainder = Counter(delta)
        for kind, values in new["groups"].items():
            previous = old.get("groups", {}).get(kind, {})
            diff = {k: v - previous.get(k, 0) for k, v in values.items()}
            groups.setdefault(kind, Counter()).update(diff)
            remainder.subtract({k: diff.get(k, 0) for k in fields})
        # Session totals also include title generation; no invented call count.
        groups.setdefault("auxiliary", Counter()).update(remainder)
    if not ids:
        return None
    return normalized({"provider": "opencode", "source": "opencode.session_v2", **totals, "elapsed_seconds": elapsed, "usage_complete": complete, "session_ids": ids, "models": models, "breakdown": {k: dict(v) for k, v in groups.items()}, "inference_seconds": None, "tokens_per_second": None})


def summarize(calls: list[dict]) -> dict:
    groups = {}
    for call in calls:
        key = call.get("role", "unknown") + ":" + call.get("environment", "unknown")
        groups.setdefault(key, []).append(normalized(call))
    result = {}
    for key, values in groups.items():
        row = {"attempts": len(values), "usage_complete": all(v["usage_complete"] for v in values)}
        for field in FIELDS:
            data = [v.get(field) for v in values]
            row[field] = sum(data) if all(type(v) is int for v in data) else None
            known = [v for v in data if type(v) is int]
            row["recorded_" + field] = sum(known) if known else None
        result[key] = row
    return result
