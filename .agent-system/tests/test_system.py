from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent_system.benchmark import benchmark
from agent_system.checks import run_checks
from agent_system.cli import main
from agent_system.config import SYSTEM_DIR, load_config, select_model
from agent_system.engine import CloudBudget, Engine
from agent_system.errors import BudgetError, ProviderError, SafetyError
from agent_system.monitoring import ResourceMonitor, gpu_snapshot
from agent_system.model_session import ModelSession
from agent_system.process import ProcessResult, clean_environment, run_process
from agent_system.providers import CodexCLI, LMStudio, OpenCodeCLI, usage_metrics
from agent_system.reports import write_report
from agent_system.security import cloud_text, contained, safe_relative
from agent_system.validation import validate_plan, validate_review
from agent_system.workspace import Snapshot, Workspace


def sample_plan():
    return {"task": "Criar função simples", "acceptance_criteria": ["Função válida"], "risks": [], "steps": [{"id": "one", "title": "Implementar", "instructions": "Crie value = 1", "files": ["sample.py"], "depends_on": [], "checks": ["python-syntax", "diff-check"]}]}


def rejection():
    return {"status": "changes_requested", "summary": "Corrigir resultado", "findings": [{"id": "R1", "severity": "high", "file": "sample.py", "evidence": "Valor incorreto", "requested_change": "Use 2", "mandatory": True, "state": "open"}]}


class FakeMonitor:
    def __init__(self, config):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def summary(self):
        return {"gpu_peak_used_mib": {}, "ram_peak_system_used_bytes": None, "samples": [], "model_gpu_distribution": None}


class FakeCloud:
    def __init__(self, replies):
        self.replies = replies
        self.calls = []

    def probe(self, path):
        return {"authenticated": True}

    def invoke(self, role, prompt, schema, directory, **kwargs):
        self.calls.append(role)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply, {"provider": "codex", "input_tokens": 10, "output_tokens": 5}


class FakeCoder:
    def __init__(self, edit=None):
        self.calls = 0
        self.models = []
        self.edit = edit

    def probe(self, path, spec):
        return {"version": "2.0.16"}

    def invoke(self, prompt, workspace, spec, allowed, readable, directory, **kwargs):
        self.calls += 1
        self.models.append(spec.id)
        if self.edit:
            self.edit(workspace, self.calls)
        else:
            (workspace / "sample.py").write_text(f"value = {self.calls}\n", encoding="utf-8")
        return {"provider": "opencode", "input_tokens": None, "output_tokens": None}


class FakeLM:
    def ensure_model(self, spec, **kwargs):
        return spec, {"id": spec.id, "loaded": True}

    def inventory(self):
        return {"models": []}


class SystemTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True, capture_output=True)
        (self.root / "README.md").write_text("Projeto de teste\n", encoding="utf-8")
        (self.root / ".gitignore").write_text(".env\n.agent-system/runs/\n", encoding="utf-8")
        self.config = load_config()
        self.config["monitoring"].update(gpu=False, ram=False)

    def tearDown(self):
        self.temp.cleanup()

    def engine(self, replies=None, coder=None, **kwargs):
        return Engine(self.config, self.root, cloud=FakeCloud(replies or []), coder=coder or FakeCoder(), lmstudio=FakeLM(), monitor_factory=FakeMonitor, **kwargs)

    def test_local_flow_has_no_cloud_and_preserves_source(self):
        (self.root / "sample.py").write_text("# alteração do usuário\n", encoding="utf-8")
        before = (self.root / "sample.py").read_bytes()
        engine = self.engine()
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "local_verified")
        self.assertIsNone(report["cloud_approved"])
        self.assertEqual(engine.cloud.calls, [])
        self.assertEqual((self.root / "sample.py").read_bytes(), before)
        self.assertTrue((Path(report["run_dir"]) / "changes.patch").exists())

    def test_cloud_plan_review_approved(self):
        engine = self.engine([sample_plan(), {"status": "approved", "summary": "Verificado", "findings": []}])
        report = engine.run("Criar função")
        self.assertEqual(report["status"], "completed")
        self.assertTrue(report["cloud_approved"])
        self.assertEqual(engine.cloud.calls, ["planner", "reviewer"])

    def test_failed_codex_call_counts_against_budget(self):
        engine = self.engine([ProviderError("Codex CLI falhou")])
        report = engine.run("Criar função")
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["cloud_calls"], 1)
        self.assertEqual(len(engine.cloud.calls), 1)

    def test_budget_exhausted_before_invocation(self):
        self.config["limits"]["max_cloud_calls"] = 0
        engine = self.engine([sample_plan()])
        report = engine.run("Criar função")
        self.assertEqual(report["status"], "failed")
        self.assertIn("Orçamento", report["error"])
        self.assertEqual(engine.cloud.calls, [])

    def test_reviewer_rejection_correction_re_review(self):
        engine = self.engine([rejection(), {"status": "approved", "summary": "Correção conferida", "findings": []}])
        report = engine.run("Criar função", plan=sample_plan())
        self.assertEqual(report["status"], "completed")
        self.assertEqual(report["corrections"], 1)
        self.assertEqual(engine.coder.calls, 2)

    def test_reviewer_rejection_stops_at_limit(self):
        self.config["limits"]["max_corrections"] = 1
        engine = self.engine([rejection(), rejection()])
        report = engine.run("Criar função", plan=sample_plan())
        self.assertEqual(report["status"], "correction_limit")
        self.assertEqual(report["corrections"], 1)
        self.assertFalse(report["cloud_approved"])

    def test_no_reviewer_mode_has_planning_only(self):
        engine = self.engine([sample_plan()])
        report = engine.run("Criar função", no_reviewer=True)
        self.assertEqual(report["status"], "local_verified")
        self.assertEqual(engine.cloud.calls, ["planner"])
        self.assertIsNone(report["cloud_approved"])

    def test_plan_only_does_not_invoke_local(self):
        engine = self.engine([sample_plan()])
        report = engine.run("Criar função", plan_only=True)
        self.assertEqual(report["status"], "planned")
        self.assertEqual(engine.coder.calls, 0)

    def test_lmstudio_failure_report(self):
        engine = self.engine()
        engine.lmstudio.ensure_model = Mock(side_effect=ProviderError("LM Studio indisponível"))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "failed")
        self.assertEqual(engine.coder.calls, 0)

    def test_opencode_failure_report(self):
        engine = self.engine()
        engine.coder.invoke = Mock(side_effect=ProviderError("OpenCode falhou"))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertIn("OpenCode falhou", report["error"])
        self.assertTrue((Path(report["run_dir"]) / "report.md").exists())

    def test_oom_classified_and_preserved(self):
        engine = self.engine()
        engine.coder.invoke = Mock(side_effect=ProviderError("Falta de memória no runtime"))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "failed")
        self.assertIn("memória", report["error"])

    def test_out_of_scope_change_blocked_before_checks(self):
        engine = self.engine(coder=FakeCoder(lambda work, n: (work / "other.py").write_text("value = 1\n")))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "failed")
        self.assertIn("não atribuído", report["error"])
        self.assertEqual(report["checks"], [])

    def test_coder_cannot_edit_plan(self):
        engine = self.engine(coder=FakeCoder(lambda work, n: (work / "PLAN.md").write_text("plano alterado")))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "failed")
        self.assertIn("reservado", report["error"])

    def test_failed_checks_are_corrected_locally(self):
        def edit(work, n):
            (work / "sample.py").write_text("invalid (\n" if n == 1 else "value = 1\n")
        engine = self.engine(coder=FakeCoder(edit))
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "local_verified")
        self.assertEqual(report["corrections"], 1)
        self.assertEqual(engine.cloud.calls, [])

    def test_missing_test_authorization_is_pending(self):
        plan = sample_plan()
        plan["steps"][0]["checks"].append("unit-tests")
        engine = self.engine()
        report = engine.run("Criar função", local_only=True, plan=plan)
        self.assertEqual(report["status"], "validation_pending")
        self.assertEqual(report["checks"][-1]["status"], "pending")

    def test_check_cannot_modify_verified_source(self):
        def checker(work, *args, **kwargs):
            (work / "sample.py").write_text("invalid (\n")
            return [{"name": "python-syntax", "status": "passed", "details": "passed"}]
        engine = self.engine(checker=checker)
        report = engine.run("Criar função", local_only=True, plan=sample_plan())
        self.assertEqual(report["status"], "failed")
        self.assertIn("Checks alteraram", report["error"])
        self.assertIsNone(report["cloud_approved"])

    def test_invalid_plan_blocks_coder(self):
        plan = sample_plan()
        plan["steps"][0]["depends_on"] = ["missing"]
        engine = self.engine()
        report = engine.run("Criar função", local_only=True, plan=plan)
        self.assertEqual(report["status"], "failed")
        self.assertEqual(engine.coder.calls, 0)

    def test_snapshot_excludes_credentials_and_preserves_untracked(self):
        (self.root / ".env").write_text("secret")
        (self.root / "auth.json").write_text("secret")
        (self.root / "opencode.json").write_text("untrusted plugin")
        (self.root / "new.py").write_text("value = 1\n")
        snapshot = Snapshot.capture(self.root)
        self.assertIn("new.py", snapshot.files)
        self.assertNotIn(".env", snapshot.files)
        self.assertNotIn("auth.json", snapshot.files)
        self.assertNotIn("opencode.json", snapshot.files)

    def test_tracked_user_changes_and_index_are_preserved(self):
        file = self.root / "tracked.py"
        file.write_text("value = 1\n")
        subprocess.run(["git", "-C", str(self.root), "add", "tracked.py"], check=True, capture_output=True)
        index_before = (self.root / ".git/index").read_bytes()
        file.write_text("# edição não adicionada pelo usuário\nvalue = 2\n", encoding="utf-8")
        snapshot = Snapshot.capture(self.root)
        self.assertEqual(snapshot.files["tracked.py"], file.read_bytes())
        self.assertEqual((self.root / ".git/index").read_bytes(), index_before)

    def test_workspace_has_its_own_git_boundary_without_hooks_or_commits(self):
        directory = self.root / "run"
        directory.mkdir()
        workspace = Workspace(directory, Snapshot.capture(self.root))
        result = subprocess.run(["git", "-C", str(workspace.path), "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True)
        self.assertEqual(Path(result.stdout.strip()).resolve(), workspace.path.resolve())
        self.assertFalse((workspace.path / ".git/hooks").exists())
        result = subprocess.run(["git", "-C", str(workspace.path), "rev-parse", "--verify", "HEAD"], capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    def test_benchmark_models_use_same_snapshot_and_shared_budget(self):
        engines = []
        def factory(config, root, budget):
            engine = self.engine(budget=budget)
            engines.append(engine)
            return engine
        tasks = [{"name": "fixture", "plan": sample_plan(), "fixtures": {}}]
        path = self.root / "tasks.json"
        path.write_text(json.dumps(tasks))
        report = benchmark(self.config, self.root, ["qwen14b", "qwen35b"], tasks_path=path, engine_factory=factory)
        first, second = [r["result"] for r in report["comparisons"]]
        self.assertEqual(first["snapshot_digest"], second["snapshot_digest"])
        self.assertNotEqual(first["run_dir"], second["run_dir"])
        self.assertNotEqual(first["model"], second["model"])
        self.assertEqual(report["cloud_calls"], 0)
        self.assertEqual(report["summary"][0]["success_rate"], 1)
        self.assertTrue((Path(report["run_dir"]) / "benchmark.md").exists())

    def test_cloud_benchmark_requires_explicit_confirmation(self):
        with self.assertRaises(SafetyError):
            benchmark(self.config, self.root, ["qwen14b"], cloud=True)

    def test_escalation_requires_cloud_confirmation(self):
        with patch("agent_system.cli.Engine") as engine, patch("builtins.print"):
            self.assertEqual(main(["--root", str(self.root), "--escalate-run", str(self.root / ".agent-system/runs/old")]), 2)
            engine.assert_not_called()

    def test_actual_test_runner_imports_fixture_without_application(self):
        work = self.root / "work"
        work.mkdir()
        (work / "tests").mkdir()
        (work / "helper.py").write_text("value = 2\n")
        (work / "tests/test_helper.py").write_text("import unittest\nimport helper\nclass TestHelper(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(helper.value, 2)\n")
        result = run_checks(work, ["unit-tests"], ["helper.py"], allow_test_execution=True)
        self.assertEqual(result[0]["status"], "passed", result)

    def test_reports_unknown_metrics_are_null(self):
        directory = self.root / "reports"
        write_report(directory, {"status": "failed", "metrics": {"inference_seconds": None}, "error": "sk-abcdefghijklmno123456"})
        content = json.loads((directory / "report.json").read_text())
        self.assertIsNone(content["metrics"]["inference_seconds"])
        self.assertNotIn("sk-", content["error"])

    def test_dry_run_makes_no_provider_calls(self):
        with patch("agent_system.cli.Engine") as engine, patch("builtins.print"):
            self.assertEqual(main(["--dry-run", "--root", str(self.root)]), 0)
            engine.assert_not_called()


class ValidationTest(unittest.TestCase):
    def test_windows_traversal_and_sensitive_paths(self):
        for name in ("../a.py", "/tmp/a.py", "C:/a.py", "\\\\host\\file", "a.py:secret", "a//b.py", "CON.py", "foo./a.py", "x/.ENV.local", "x/test.env", "PLAN.md", "REVIEW.md", ".git/config", "db.sql"):
            with self.subTest(name=name), self.assertRaises(SafetyError):
                safe_relative(name, editable=True)

    def test_case_collisions_rejected(self):
        plan = sample_plan()
        plan["steps"][0]["files"] = ["Foo.py", "foo.py"]
        with self.assertRaises(SafetyError):
            validate_plan(plan)

    def test_dangerous_checks_rejected(self):
        plan = sample_plan()
        for command in ("docker compose down -v", "git push", "Remove-Item", "python -c evil", "unit-tests; rm -rf"):
            plan["steps"][0]["checks"] = [command]
            with self.subTest(command=command), self.assertRaises(SafetyError):
                validate_plan(plan)

    def test_duplicate_and_cyclic_step_ids(self):
        plan = sample_plan()
        plan["steps"].append(copy.deepcopy(plan["steps"][0]))
        with self.assertRaises(SafetyError):
            validate_plan(plan)
        plan = sample_plan()
        plan["steps"][0]["depends_on"] = ["one"]
        with self.assertRaises(SafetyError):
            validate_plan(plan)

    def test_approval_cannot_include_pending_findings(self):
        review = rejection()
        review["status"] = "approved"
        for state in ("open", "awaiting_verification"):
            review["findings"][0]["state"] = state
            with self.assertRaises(SafetyError):
                validate_review(review, {"sample.py"})

    def test_cloud_context_credentials_pii_and_size(self):
        for text in ("token sk-abcdefghijklmno123456", "aluno@example.com", "123.456.789-10", "x" * 500):
            with self.subTest(text=text[:20]), self.assertRaises(SafetyError):
                cloud_text(text, 100)


class ProvidersTest(unittest.TestCase):
    def setUp(self):
        self.config = load_config()

    def test_lmstudio_unavailable(self):
        client = LMStudio(self.config["local_llm"], opener=Mock(side_effect=URLError("refused")))
        with self.assertRaises(ProviderError):
            client.inventory()

    def test_model_not_found(self):
        client = LMStudio(self.config["local_llm"])
        client.inventory = Mock(return_value={"models": []})
        with self.assertRaisesRegex(ProviderError, "não encontrado"):
            client.ensure_model(select_model(self.config))

    def test_malformed_lmstudio_inventory_is_a_provider_error(self):
        for value in ([], None, {"data": [None]}, {"data": [{"id": 1}]}):
            client = LMStudio(self.config["local_llm"])
            client.request = Mock(return_value=value)
            with self.subTest(value=value), self.assertRaises(ProviderError):
                client.inventory()

    def test_redirect_blocked_before_network(self):
        from agent_system.providers import NoRedirect
        with self.assertRaises(ProviderError):
            NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://remote.invalid")

    def test_model_session_switches_exclusively_and_restores(self):
        initial = {"id": "qwen3-14b", "type": "llm", "loaded": True, "instances": [{"id": "qwen3-14b", "config": {"context_length": 4096, "parallel": 4}}]}
        loaded = {"qwen3-14b": initial}
        client = Mock()
        client.config = self.config["local_llm"]
        client.inventory.side_effect = lambda: {"native_inventory": True, "models": list(loaded.values())}
        def run(args, **kwargs):
            if args[1] == "unload":
                del loaded[args[2]]
            else:
                self.assertEqual(len(loaded), 0)
                identity = args[args.index("--identifier") + 1]
                loaded[identity] = {"id": identity, "type": "llm", "loaded": True, "instances": [{"id": identity, "config": {}}]}
            return ProcessResult("", "", 0, 0)
        client.runner.side_effect = run
        with patch("agent_system.model_session.executable", return_value="lms"):
            session = ModelSession(client)
            session.start()
            session.activate(select_model(self.config, "qwen14b"))
            session.activate(select_model(self.config, "qwen35b"))
            self.assertEqual(set(loaded), {"qwen/qwen3.6-35b-a3b"})
            session.restore()
        self.assertEqual(set(loaded), {"qwen3-14b"})
        self.assertEqual(session.audit["restoration"], "supported_settings_restored")
        restored = client.runner.call_args.args[0]
        self.assertEqual(restored[restored.index("--context-length") + 1], "4096")
        self.assertEqual(restored[restored.index("--parallel") + 1], "4")

    def test_model_session_recovers_from_oom_then_handles_custom_instance(self):
        from dataclasses import replace
        client = Mock()
        client.config = self.config["local_llm"]
        model = {"id": "qwen3-14b", "type": "llm", "loaded": True, "instances": [{"id": "custom-slot", "config": {"context_length": 4096, "parallel": 2}}]}
        loaded = {"custom-slot": model}
        def inventory():
            return {"native_inventory": True, "models": list(loaded.values()) + [{"id": "qwen/qwen3.6-35b-a3b", "type": "llm", "loaded": False, "instances": []}]}
        client.inventory.side_effect = inventory
        def command(args, **kwargs):
            if args[1] == "unload":
                del loaded[args[2]]
            elif args[2] == "qwen/qwen3.6-35b-a3b":
                raise ProviderError("CUDA out of memory")
            else:
                self.assertEqual(args[2], "qwen3-14b")
                identity = args[args.index("--identifier") + 1]
                loaded[identity] = {"id": args[2], "loaded": True, "instances": [{"id": identity, "config": {}}]}
            return ProcessResult("", "", 0, 0)
        client.runner.side_effect = command
        with patch("agent_system.model_session.executable", return_value="lms"):
            session = ModelSession(client)
            session.start()
            with self.assertRaises(ProviderError):
                session.activate(select_model(self.config, "qwen35b"))
            session.activate(replace(select_model(self.config, "qwen14b"), id="custom-slot"))
            self.assertEqual(set(loaded), {"custom-slot"})
            audit = session.restore()
        self.assertEqual(set(loaded), {"custom-slot"})
        self.assertEqual(audit["restoration"], "supported_settings_restored")
        self.assertIn("--context-length", client.runner.call_args.args[0])

    def test_model_not_loaded_is_not_automatically_loaded(self):
        client = LMStudio(self.config["local_llm"], runner=Mock())
        client.inventory = Mock(return_value={"models": [{"id": "qwen3-14b", "type": "llm", "loaded": False, "instances": []}]})
        with self.assertRaisesRegex(ProviderError, "não carregado"):
            client.ensure_model(select_model(self.config))
        client.runner.assert_not_called()

    def test_gpu_not_detected(self):
        with patch("agent_system.monitoring.executable", side_effect=ProviderError("not found")):
            self.assertFalse(gpu_snapshot()["available"])

    def test_two_gpu_sample_uses_independent_memory(self):
        runner = Mock(return_value=ProcessResult("0, RTX 3070, 8192, 2000, 6192, 50\n1, RTX 3060 Ti, 8192, 3000, 5192, 10\n", "", 0, 0.1))
        with patch("agent_system.monitoring.executable", return_value="nvidia-smi"):
            sample = gpu_snapshot(runner)
        self.assertEqual(len(sample["devices"]), 2)
        self.assertEqual(sample["devices"][0]["total_mib"], 8192)

    def test_metrics_deduplicate_and_do_not_invent_speed(self):
        event = {"type": "step_finish", "part": {"id": "one", "tokens": {"input": 10, "output": 5, "reasoning": 2, "cache": {"read": 3, "write": 0}}}}
        metrics = usage_metrics([event, event], 2, "opencode")
        self.assertEqual(metrics["input_tokens"], 10)
        self.assertEqual(metrics["output_tokens"], 5)
        self.assertIsNone(metrics["tokens_per_second"])
        self.assertIsNone(metrics["inference_seconds"])

    def test_opencode_rejects_error_even_with_zero_exit(self):
        runner = Mock(return_value=ProcessResult('{"type":"error","error":"CUDA out of memory"}\n', "", 0, 1))
        with tempfile.TemporaryDirectory() as temp, patch("agent_system.providers.executable", return_value="opencode.exe"):
            provider = OpenCodeCLI(self.config["opencode"], self.config["local_llm"], runner=runner)
            with self.assertRaisesRegex(ProviderError, "memória"):
                provider.invoke("Task", Path(temp), select_model(self.config), ["sample.py"], [], Path(temp))

    def test_opencode_permissions_and_environment_are_restrictive(self):
        with tempfile.TemporaryDirectory() as temp:
            provider = OpenCodeCLI(self.config["opencode"], self.config["local_llm"])
            env = provider.environment(Path(temp), select_model(self.config), ["sample.py"], ["AGENTS.md"])
            config = json.loads(env["OPENCODE_CONFIG_CONTENT"])
            permissions = config["agent"]["busguard-coder"]["permission"]
            self.assertEqual(permissions["shell"], "deny")
            self.assertEqual(permissions["external_directory"], "deny")
            self.assertEqual(permissions["edit"], {"*": "deny", "sample.py": "allow"})
            self.assertEqual(config["enabled_providers"], ["lmstudio"])
            self.assertEqual(config["mcp"], {})
            self.assertEqual(env["OPENCODE_DISABLE_PROJECT_CONFIG"], "true")

    def test_opencode_installed_version_prefix_is_accepted(self):
        runner = Mock(side_effect=[ProcessResult("opencode v2.0.16\n", "", 0, 0.1), ProcessResult("--standalone --format --model --agent", "", 0, 0.1)])
        with tempfile.TemporaryDirectory() as temp, patch("agent_system.providers.executable", return_value="opencode.exe"):
            provider = OpenCodeCLI(self.config["opencode"], self.config["local_llm"], runner=runner)
            self.assertEqual(provider.probe(Path(temp), select_model(self.config))["version"], "2.0.16")

    def test_process_timeout_terminates_tree(self):
        process = Mock()
        process.communicate.side_effect = [subprocess.TimeoutExpired("test", 1), ("", "")]
        with patch("agent_system.process.subprocess.Popen", return_value=process), patch("agent_system.process.terminate_tree") as kill:
            with self.assertRaisesRegex(ProviderError, "Timeout"):
                run_process([sys.executable], cwd=Path.cwd(), timeout=1)
            kill.assert_called_once_with(process)

    def test_codex_contract_disables_tools_and_automatic_context(self):
        def runner(args, **kwargs):
            output = Path(args[args.index("--output-last-message") + 1])
            output.write_text(json.dumps(sample_plan()), encoding="utf-8")
            return ProcessResult('{"type":"turn.completed","usage":{"input_tokens":30,"output_tokens":10}}\n', "", 0, 0.1)
        provider = CodexCLI(self.config["cloud"], runner=Mock(side_effect=runner))
        with tempfile.TemporaryDirectory() as temp, patch("agent_system.providers.executable", return_value="codex.exe"):
            data, metrics = provider.invoke("planner", "Trusted prompt", SYSTEM_DIR / "schemas/planner.json", Path(temp))
            args = provider.runner.call_args.args[0]
            self.assertIn("--ignore-user-config", args)
            self.assertIn("project_doc_max_bytes=0", args)
            self.assertIn("skip_host_skill_discovery", args)
            self.assertIn("read-only", args)
            self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", args)
            self.assertFalse((Path(temp) / "response.json").exists())
            self.assertEqual(data, sample_plan())
            self.assertEqual(metrics["input_tokens"], 30)

    def test_clean_env_does_not_pass_secrets(self):
        with patch.dict(os.environ, {"JWT_SECRET_KEY": "private", "OPENAI_API_KEY": "private", "OPENCODE_CONFIG_CONTENT": "untrusted"}):
            env = clean_environment()
            for key in ("JWT_SECRET_KEY", "OPENAI_API_KEY", "OPENCODE_CONFIG_CONTENT"):
                self.assertNotIn(key, env)


if __name__ == "__main__":
    unittest.main()
