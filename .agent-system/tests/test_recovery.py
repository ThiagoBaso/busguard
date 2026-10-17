from __future__ import annotations

import base64
from contextlib import closing
import hashlib
import json
import os
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_system as fixtures
from agent_system.errors import SafetyError, ProviderError
from agent_system.providers import CodexCLI, OpenCodeCLI
from agent_system.process import ProcessResult
from agent_system.references import attach, discover, preflight
from agent_system.recovery import resume
from agent_system.workspace import Snapshot

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=")


class RecoveryTest(unittest.TestCase):
    setUp = fixtures.SystemTest.setUp
    tearDown = fixtures.SystemTest.tearDown
    engine = fixtures.SystemTest.engine

    def source(self):
        (self.root / "sample.py").write_text("value = 0\n", encoding="utf-8")
        result = self.engine().run("Criar função", local_only=True, plan=fixtures.sample_plan())
        return Path(result["run_dir"]), result

    def image(self):
        (self.root / "refs").mkdir(exist_ok=True)
        (self.root / "refs/image.png").write_bytes(PNG)

    def test_resume_without_confirmation_makes_no_inference_and_keeps_original(self):
        source, old = self.source()
        before = {p.relative_to(source): p.read_bytes() for p in source.rglob("*") if p.is_file()}
        engine = self.engine()
        result = resume(engine, source)
        self.assertEqual(result["status"], "checks_verified")
        self.assertEqual(engine.coder.calls, 0)
        self.assertEqual(engine.cloud.calls, [])
        self.assertEqual(result["task_id"], old["task_id"])
        self.assertNotEqual(result["attempt_id"], old["attempt_id"])
        self.assertEqual(result["task_budget"]["attempts"], 2)
        self.assertEqual(len(result["metrics"]["calls"]), 0)
        self.assertEqual((self.root / "sample.py").read_text(), "value = 0\n")
        for p, data in before.items():
            self.assertEqual((source / p).read_bytes(), data)
        self.assertNotIn(b"\r\n", (Path(result["run_dir"]) / "changes.patch").read_bytes())

    def test_explicit_review_only_calls_reviewer_once_without_corrections(self):
        source, old = self.source()
        engine = self.engine([fixtures.rejection()])
        result = resume(engine, source, confirm_cloud_review=True)
        self.assertEqual(result["status"], "validation_pending")
        self.assertEqual(engine.cloud.calls, ["reviewer"])
        self.assertEqual(engine.coder.calls, 0)
        self.assertEqual(result["task_budget"]["cloud_calls"], 1)
        self.assertEqual(result["task_budget"]["corrections"], 0)

    def test_pending_checks_block_even_explicit_review(self):
        source, _ = self.source()
        engine = self.engine(checker=lambda *a, **kw: [{"name": "test", "status": "pending", "details": "not authorized"}])
        result = resume(engine, source, confirm_cloud_review=True)
        self.assertEqual(result["status"], "validation_pending")
        self.assertEqual(engine.cloud.calls, [])

    def test_baseline_tampering_and_missing_ledger_are_rejected(self):
        source, _ = self.source()
        baseline = source / "baseline/sample.py"
        baseline.write_text("different baseline")
        with self.assertRaisesRegex(SafetyError, "digest"):
            resume(self.engine(), source)

    def test_missing_ledger_never_creates_fresh_consumption_counters(self):
        source, old = self.source()
        path = self.root / ".agent-system/runs/tasks" / (old["task_id"] + ".sqlite3")
        path.rename(path.with_suffix(".saved"))
        with self.assertRaisesRegex(SafetyError, "Ledger"):
            resume(self.engine(), source)
        self.assertFalse(path.exists())

    def test_cloud_limit_is_preserved_and_original_attempt_rows_are_immutable(self):
        source, old = self.source()
        path = self.root / ".agent-system/runs/tasks" / (old["task_id"] + ".sqlite3")
        with closing(sqlite3.connect(path)) as db:
            old_attempt = db.execute("SELECT * FROM attempt WHERE id=?", (old["attempt_id"],)).fetchone()
            old_calls = db.execute("SELECT * FROM call").fetchall()
        self.config["limits"]["max_cloud_calls"] = 0
        engine = self.engine()
        result = resume(engine, source, confirm_cloud_review=True)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(engine.cloud.calls, [])
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute("SELECT * FROM attempt WHERE id=?", (old["attempt_id"],)).fetchone(), old_attempt)
            self.assertEqual(db.execute("SELECT * FROM call").fetchall(), old_calls)

    def test_opencode_missing_or_blocked_completion_never_reports_success(self):
        for part in ["<error>Missing reference</error>", '<agent-result>{"status":"blocked","requirements_met":false}</agent-result>', '']:
            stream = json.dumps({"type": "text", "part": {"text": part}})
            adapter = OpenCodeCLI(self.config["opencode"], self.config["local_llm"], runner=Mock(return_value=ProcessResult(stream, "", 0, .1)))
            from agent_system.config import select_model
            with patch("agent_system.providers.executable", return_value=sys.executable):
                with self.assertRaisesRegex(ProviderError, "obrigatórios"):
                    adapter.invoke("Read", self.root, select_model(self.config), [], [], self.root)
            self.assertFalse(adapter.last_metrics["requirements_met"])

    def test_opencode_accepts_explicit_completed_requirements(self):
        stream = json.dumps({"type": "text", "part": {"text": '<agent-result>{"status":"completed","requirements_met":true}</agent-result>'}})
        adapter = OpenCodeCLI(self.config["opencode"], self.config["local_llm"], runner=Mock(return_value=ProcessResult(stream, "", 0, .1)))
        from agent_system.config import select_model
        with patch("agent_system.providers.executable", return_value=sys.executable):
            metrics = adapter.invoke("Read", self.root, select_model(self.config), [], [], self.root)
        self.assertTrue(metrics["requirements_met"])

    def test_missing_reference_blocks_before_cloud(self):
        engine = self.engine([fixtures.sample_plan()])
        result = engine.run("Use refs/image.png")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(engine.cloud.calls, [])
        self.assertEqual(engine.coder.calls, 0)

    def test_image_is_copied_exactly_and_text_only_coder_blocks_before_cloud(self):
        self.image()
        refs = preflight(self.root, discover("Use `refs/image.png`"))
        snapshot = Snapshot.capture(self.root)
        attach(snapshot, self.root, refs)
        self.assertEqual(snapshot.files["refs/image.png"], PNG)
        engine = self.engine([fixtures.sample_plan()])
        result = engine.run("Use refs/image.png")
        self.assertEqual(result["status"], "failed")
        self.assertIn("multimodal", result["error"])
        self.assertEqual(engine.cloud.calls, [])

    def test_invalid_oversized_and_traversal_references_fail_closed(self):
        self.image()
        with self.assertRaises(SafetyError):
            preflight(self.root, ["../image.png"])
        (self.root / "refs/image.png").write_bytes(b"not a png")
        with self.assertRaises(SafetyError):
            preflight(self.root, ["refs/image.png"])
        (self.root / "refs/image.png").write_bytes(b"x" * 2_000_001)
        with self.assertRaises(SafetyError):
            preflight(self.root, ["refs/image.png"])

    def test_missing_required_file_stops_before_first_coder(self):
        plan = fixtures.sample_plan()
        plan["steps"][0]["required_files"] = ["missing.md"]
        engine = self.engine()
        result = engine.run("Criar função", local_only=True, plan=plan)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(engine.coder.calls, 0)

    def test_failed_intermediate_step_never_advances(self):
        plan = fixtures.sample_plan()
        plan["steps"].append({**plan["steps"][0], "id": "two", "depends_on": ["one"]})
        coder = fixtures.FakeCoder(lambda p, n: (p / "sample.py").write_text("value =\n"))
        result = self.engine(coder=coder).run("Criar função", local_only=True, plan=plan)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(coder.calls, 1)

    def test_codex_requires_known_multimodal_model_and_passes_image_argument(self):
        self.image()
        catalog = self.root / "models_cache.json"
        catalog.write_text(json.dumps({"models": [{"slug": "vision-test", "input_modalities": ["text", "image"]}]}))
        runner = Mock(return_value=ProcessResult("--image", "", 0, .1))
        adapter = CodexCLI({"executable": sys.executable, "model": None, "timeout_seconds": 1}, runner=runner)
        with patch.dict(os.environ, {"CODEX_HOME": str(self.root)}):
            with self.assertRaises(SafetyError):
                adapter.prepare_visual([self.root / "refs/image.png"])
            adapter.config["model"] = "vision-test"
            evidence = adapter.prepare_visual([self.root / "refs/image.png"])
            self.assertEqual(evidence["attachments"], 1)
            def run(args, **kw):
                self.assertIn("--image", args)
                self.assertIn(str((self.root / "refs/image.png").resolve()), args)
                Path(args[args.index("--output-last-message") + 1]).write_text('{"status":"approved"}')
                return ProcessResult('{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}', "", 0, .1)
            adapter.runner = run
            adapter.invoke("reviewer", "Review", self.root / "schema.json", self.root / "review")
            self.assertEqual(len(adapter.last_metrics["image_attachments"]), 1)


if __name__ == "__main__":
    unittest.main()
