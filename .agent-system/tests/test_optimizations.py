from __future__ import annotations

import json
import sys
import tempfile
import unittest
import sqlite3
import runpy
from unittest.mock import Mock, patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent_system.config import load_config, select_model
from agent_system.errors import ProviderError
from agent_system.providers import OpenCodeCLI
from agent_system.providers import CloudCoder
from agent_system.providers import CodexCLI
from agent_system.benchmark import benchmark
from agent_system.ledger import TaskLedger
from agent_system.usage import normalized, opencode_snapshot, opencode_delta, summarize
from agent_system.errors import BudgetError
from agent_system.errors import SafetyError
from agent_system.workspace import Snapshot
from agent_system.checks import run_checks
from agent_system.process import ProcessResult, run_process
import test_system as fixtures


class CompactionTest(unittest.TestCase):
    def test_small_context_keeps_auto_compaction_with_positive_headroom(self):
        config = load_config()
        spec = select_model(config)
        adapter = OpenCodeCLI(config["opencode"], config["local_llm"])
        with tempfile.TemporaryDirectory() as tmp:
            env = adapter.environment(Path(tmp), spec, ["smoke.py"], [])
        for key in ["OPENCODE_CONFIG_CONTENT", "OPENCODE_CLI_CONFIG_CONTENT"]:
            policy = json.loads(env[key])["compaction"]
            self.assertTrue(policy["auto"])
            ceiling = spec.context_length - max(spec.output_tokens, policy["buffer"])
            self.assertGreater(ceiling, 4000)
            self.assertLess(policy["keep"]["tokens"], ceiling)

    def test_invalid_buffer_is_rejected_before_inference(self):
        config = load_config()
        config["local_llm"]["compaction"] = {"buffer": 20000}
        adapter = OpenCodeCLI(config["opencode"], config["local_llm"])
        with self.assertRaises(ProviderError):
            adapter.compaction_policy(select_model(config))


class AccountingTest(unittest.TestCase):
    def test_cloud_reasoning_and_cache_are_not_added_twice(self):
        m = normalized({"provider": "codex", "input_tokens": 100, "output_tokens": 30, "cached_input_tokens": 80, "reasoning_tokens": 20})
        self.assertEqual(m["total_tokens"], 130)

    def test_local_cache_and_reasoning_are_separate_provider_categories(self):
        m = normalized({"provider": "opencode", "input_tokens": 100, "output_tokens": 30, "cached_input_tokens": 80, "cache_write_tokens": 0, "reasoning_tokens": 20})
        self.assertEqual(m["total_tokens"], 230)

    def test_unknown_usage_stays_unknown(self):
        m = normalized({"provider": "codex", "input_tokens": None, "output_tokens": None})
        self.assertIsNone(m["total_tokens"])
        self.assertIsNone(m["recorded_total_tokens"])
        self.assertIsNone(summarize([m])["unknown:unknown"]["recorded_input_tokens"])

    def test_database_includes_compaction_and_auxiliary_without_recounting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp);p = root / 'opencode/data/opencode/opencode.db'
            p.parent.mkdir(parents=True)
            with sqlite3.connect(p) as c:
                c.executescript('CREATE TABLE session_v2(id,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_idle); CREATE TABLE session_message(session_id,type,data);')
                c.execute('INSERT INTO session_v2 VALUES (?,?,?,?,?,?,?,?)', ('s','{}',100,20,30,0,0,1))
                c.execute('INSERT INTO session_message VALUES (?,?,?)',('s','compaction',json.dumps({'tokens':{'input':40,'output':5,'reasoning':10}})))
            c.close()
            after = opencode_snapshot(root)
            m = opencode_delta(None, after, 1)
            self.assertEqual(m['total_tokens'],150)
            self.assertEqual(m['breakdown']['compaction']['calls'],1)
            self.assertEqual(m['breakdown']['auxiliary']['input_tokens'],60)
            self.assertIsNone(opencode_delta(after, after, 1))


class PersistentBudgetTest(unittest.TestCase):
    setUp = fixtures.SystemTest.setUp
    tearDown = fixtures.SystemTest.tearDown
    engine = fixtures.SystemTest.engine

    def test_cloud_call_budget_survives_new_engine(self):
        self.config['limits']['max_cloud_calls'] = 1
        first = self.engine([fixtures.sample_plan()]).run('same',task_id='persistent',plan_only=True)
        second_engine = self.engine([fixtures.sample_plan()])
        second = second_engine.run('same',task_id='persistent',plan_only=True)
        self.assertEqual(first['status'],'planned')
        self.assertEqual(second['status'],'failed')
        self.assertEqual(second_engine.cloud.calls,[])
        self.assertEqual(second['task_budget']['cloud_calls'],1)
        self.assertEqual(second['task_budget']['attempts'],2)

    def test_registered_token_budget_stops_next_cloud_call(self):
        self.config['limits']['max_cloud_tokens'] = 15
        self.engine([fixtures.sample_plan()]).run('same',task_id='tokens',plan_only=True)
        other = self.engine([fixtures.sample_plan()])
        r = other.run('same',task_id='tokens',plan_only=True)
        self.assertIn('tokens',r['error'])
        self.assertEqual(other.cloud.calls,[])

    def test_failed_call_is_recorded_as_unknown_and_blocks_token_limited_retry(self):
        r = self.engine([ProviderError('Timeout')]).run('same',task_id='failed')
        self.assertEqual(r['metrics']['calls'][0]['status'],'failed')
        self.assertIsNone(r['metrics']['calls'][0]['total_tokens'])
        other = self.engine([fixtures.sample_plan()])
        next_run = other.run('same',task_id='failed',plan_only=True)
        self.assertIn('desconhecido',next_run['error'])
        self.assertEqual(other.cloud.calls,[])

    def test_partial_failure_usage_is_preserved(self):
        e = ProviderError('bad response',metrics={'provider':'codex','input_tokens':20,'output_tokens':3,'usage_complete':False})
        r = self.engine([e]).run('same')
        self.assertEqual(r['metrics']['calls'][0]['total_tokens'],23)
        self.assertFalse(r['metrics']['calls'][0]['usage_complete'])

    def test_corrections_and_time_are_accumulated(self):
        limits = dict(self.config['limits'],max_corrections=1,total_timeout_seconds=1)
        ledger = TaskLedger(self.root,'durable','same',limits)
        ledger.correct();ledger.finish('failed');ledger.db.execute('UPDATE attempt SET elapsed=2');ledger.db.commit();ledger.db.close()
        other = TaskLedger(self.root,'durable','same',limits)
        try:
            with self.assertRaises(BudgetError):other.remaining()
        finally:other.finish('failed');other.db.close()

    def test_correction_budget_survives_retry(self):
        limits = dict(self.config['limits'],max_corrections=1)
        ledger = TaskLedger(self.root,'fixes','same',limits)
        ledger.correct();ledger.finish('failed');ledger.db.close()
        other = TaskLedger(self.root,'fixes','same',limits)
        try:
            with self.assertRaises(BudgetError):other.correct()
        finally:other.finish('failed');other.db.close()

    def test_task_id_cannot_escape_storage(self):
        with self.assertRaises(SafetyError):TaskLedger(self.root,'../escape','same',self.config['limits'])

    def test_ledger_usage_is_immutable_and_bound_to_reserved_environment(self):
        ledger = TaskLedger(self.root,'immutable','same',self.config['limits'])
        try:
            cid = ledger.reserve('planner','cloud')
            ledger.record(cid,{'provider':'codex','input_tokens':20,'output_tokens':2,'environment':'local'},'completed')
            self.assertEqual(ledger.calls()[0]['environment'],'cloud')
            with self.assertRaises(SafetyError):ledger.record(cid,{'input_tokens':0,'output_tokens':0},'completed')
            self.assertEqual(ledger.calls()[0]['total_tokens'],22)
        finally:ledger.finish('completed');ledger.db.close()

    def test_unrecorded_reservation_remains_unknown_and_prevents_token_budget_bypass(self):
        ledger=TaskLedger(self.root,'reservation','same',self.config['limits'])
        try:
            ledger.reserve('planner','cloud')
            self.assertEqual(len(ledger.calls()),1)
            self.assertIsNone(ledger.calls()[0]['total_tokens'])
            with self.assertRaises(BudgetError):ledger.reserve('reviewer','cloud')
        finally:ledger.finish('failed');ledger.db.close()
        retry=TaskLedger(self.root,'reservation','same',self.config['limits'])
        try:
            self.assertEqual(retry.calls()[0]['status'],'interrupted')
            with self.assertRaises(BudgetError):retry.reserve('planner','cloud')
        finally:retry.finish('failed');retry.db.close()

    def test_last_cloud_response_over_token_limit_is_reported(self):
        self.config['limits']['max_cloud_tokens']=1
        r=self.engine([fixtures.sample_plan()]).run('same',plan_only=True)
        self.assertEqual(r['status'],'budget_exceeded')
        self.assertIn('max_cloud_tokens',r['task_budget']['limits_exceeded'])

    def test_review_limit_stops_before_requesting_cloud(self):
        self.config['limits']['max_reviews']=0
        engine=self.engine([])
        r=engine.run('same',plan=fixtures.sample_plan())
        self.assertTrue(r['budget_blocked'])
        self.assertEqual(engine.cloud.calls,[])

    def test_active_attempt_and_other_objective_cannot_reset_budget(self):
        ledger = TaskLedger(self.root,'active','same',self.config['limits'])
        try:
            with self.assertRaises(BudgetError):TaskLedger(self.root,'active','same',self.config['limits'])
        finally:ledger.finish('interrupted');ledger.db.close()
        with self.assertRaises(SafetyError):TaskLedger(self.root,'active','different',self.config['limits'])

    def test_local_work_remains_available_after_cloud_budget_is_exhausted(self):
        limits = dict(self.config['limits'],max_cloud_tokens=1)
        ledger = TaskLedger(self.root,'local-fix','same',limits)
        try:
            cid=ledger.reserve('reviewer','cloud')
            ledger.record(cid,{'provider':'codex','input_tokens':10,'output_tokens':1},'completed')
            ledger.reserve('coder','local')
            with self.assertRaises(BudgetError):ledger.reserve('reviewer','cloud')
        finally:ledger.finish('completed');ledger.db.close()

    def test_snapshot_retains_lockfile_larger_than_regular_text_limit(self):
        (self.root/'package-lock.json').write_text(' '*260000)
        (self.root/'large.txt').write_text(' '*260000)
        files=Snapshot.capture(self.root).files
        self.assertIn('package-lock.json',files)
        self.assertNotIn('large.txt',files)

    def test_switching_default_coder_back_to_local_cannot_infer_cloud(self):
        engine=self.engine()
        engine.coder_override=False
        engine.coder=CloudCoder(self.config['cloud'],24000)
        with patch('agent_system.engine.OpenCodeCLI',side_effect=lambda *a:fixtures.FakeCoder()):
            r=engine.run('same',plan=fixtures.sample_plan(),local_only=True)
        self.assertEqual(r['status'],'local_verified')
        self.assertEqual(r['task_budget']['cloud_calls'],0)

    def test_no_progress_does_not_request_cloud_review(self):
        def edit(workspace, calls):
            (workspace/'sample.py').write_text('value = 1\n')
        engine = self.engine(coder=fixtures.FakeCoder(edit))
        engine.checker = lambda *a,**k:[{'name':'unit-tests','status':'failed','details':'wrong value'}]
        r = engine.run('same',plan=fixtures.sample_plan())
        self.assertEqual(r['status'],'no_progress')
        self.assertEqual(engine.cloud.calls,[])

    def test_repeated_workspace_stops_before_another_review(self):
        def edit(workspace, calls):
            (workspace/'sample.py').write_text('value = '+str(calls%2)+'\n')
        engine = self.engine(coder=fixtures.FakeCoder(edit))
        engine.checker = lambda *a,**k:[{'name':'unit-tests','status':'failed','details':'wrong value'}]
        r = engine.run('same',plan=fixtures.sample_plan())
        self.assertEqual(r['status'],'no_progress')
        self.assertEqual(engine.coder.calls,3)

    def test_cloud_coder_requires_authorization_before_any_call(self):
        engine = self.engine()
        with self.assertRaises(SafetyError):
            engine.run('same',plan=fixtures.sample_plan(),coder_backend='cloud')
        self.assertEqual(engine.coder.calls,0)

    def test_invalid_benchmark_plan_is_rejected_before_inference(self):
        plan=fixtures.sample_plan();plan['steps']=[]
        p=self.root/'invalid.json';p.write_text(json.dumps([{'name':'invalid','plan':plan,'fixtures':{}}]))
        with self.assertRaises(SafetyError):
            benchmark(self.config,self.root,['qwen14b'],tasks_path=p)

    def test_cloud_coder_does_not_load_local_model_and_is_budgeted(self):
        class KnownCoder(fixtures.FakeCoder):
            def invoke(self,*a,**k):
                super().invoke(*a,**k)
                return {'provider':'codex','input_tokens':10,'output_tokens':5}
        engine = self.engine(coder=KnownCoder())
        engine.lmstudio.ensure_model = Mock(side_effect=AssertionError('Local model must not load'))
        r = engine.run('same',plan=fixtures.sample_plan(),no_reviewer=True,coder_backend='cloud',confirm_cloud_coder=True)
        self.assertEqual(r['status'],'checks_verified')
        self.assertEqual(r['task_budget']['cloud_calls'],1)
        self.assertIn('coder:cloud',r['task_budget']['by_role'])
        self.assertIsNone(r['model'])

    def test_equivalent_local_and_cloud_candidates_are_isolated(self):
        path=self.root/'tasks.json';path.write_text(json.dumps([{'name':'small','plan':fixtures.sample_plan(),'fixtures':{}}]))
        class KnownCoder(fixtures.FakeCoder):
            def invoke(self,*a,**k):
                super().invoke(*a,**k)
                return {'provider':'codex','input_tokens':10,'output_tokens':5}
        def factory(config,root,**kwargs):
            from agent_system.engine import Engine
            return Engine(config,root,cloud=fixtures.FakeCloud([{'status':'approved','summary':'ok','findings':[]}]),coder=KnownCoder(),lmstudio=fixtures.FakeLM(),monitor_factory=fixtures.FakeMonitor,**kwargs)
        with self.assertRaises(Exception):benchmark(self.config,self.root,['qwen14b','cloud'],cloud=True,tasks_path=path)
        r=benchmark(self.config,self.root,['qwen14b','cloud'],cloud=True,confirmed=True,tasks_path=path,engine_factory=factory)
        a,b=[x['result'] for x in r['comparisons']]
        self.assertEqual(a['snapshot_digest'],b['snapshot_digest'])
        self.assertNotEqual(a['run_dir'],b['run_dir'])
        self.assertEqual(a['checks'],b['checks'])
        self.assertEqual(r['cloud_calls'],3)
        self.assertFalse((self.root/'sample.py').exists())


class CloudCoderTest(unittest.TestCase):
    def invoke(self, files, expected_error=False):
        config=load_config()
        cloud=fixtures.FakeCloud([{'files':files}])
        adapter=CloudCoder(config['cloud'],24000,cloud=cloud)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'sample.py').write_text('value = 0\n')
            if expected_error:
                with self.assertRaises(SafetyError):adapter.invoke('task',root,select_model(config),['sample.py'],[],root)
                self.assertEqual((root/'sample.py').read_text(),'value = 0\n')
            else:
                m=adapter.invoke('task',root,select_model(config),['sample.py'],[],root)
                self.assertEqual((root/'sample.py').read_text(),'value = 42\n')
                self.assertEqual(m['provider'],'codex')

    def test_structured_files_apply_only_in_workspace(self):
        self.invoke([{'path':'sample.py','content':'value = 42\n'}])

    def test_out_of_scope_response_is_validated_before_any_write(self):
        self.invoke([{'path':'sample.py','content':'bad'},{'path':'outside.py','content':'bad'}],True)

    def test_duplicate_file_is_rejected_before_writing(self):
        self.invoke([{'path':'sample.py','content':'a'},{'path':'sample.py','content':'b'}],True)

    def test_nul_text_and_unpaired_surrogate_are_rejected_before_write(self):
        for text in ['binary'+chr(0),chr(0xD800)]:
            with self.subTest(value=repr(text)):
                self.invoke([{'path':'sample.py','content':text}],True)


class FailureUsageTest(unittest.TestCase):
    def test_cli_rejects_unsupported_python_before_importing_the_application(self):
        script=Path(__file__).resolve().parents[1]/'orchestrator.py'
        with patch('sys.version_info',(3,11)):
            with self.assertRaisesRegex(SystemExit,'Python 3.12'):
                runpy.run_path(str(script),run_name='compatibility_probe')
    def test_codex_timeout_keeps_partial_numeric_usage(self):
        config=load_config()
        result=ProcessResult('{"type":"turn.completed","usage":{"input_tokens":20,"output_tokens":7}}\n','',1,2)
        adapter=CodexCLI(config['cloud'],runner=Mock(side_effect=ProviderError('timeout',process=result)))
        with tempfile.TemporaryDirectory() as tmp,patch('agent_system.providers.executable',return_value='codex'):
            with self.assertRaises(ProviderError) as error:
                adapter.invoke('planner','task',Path(tmp)/'schema.json',Path(tmp))
        self.assertEqual(error.exception.metrics['total_tokens'],27)
        self.assertFalse(error.exception.metrics['usage_complete'])

    def test_opencode_timeout_keeps_partial_usage_but_marks_incomplete(self):
        config=load_config()
        line=json.dumps({'type':'step_finish','part':{'id':'step','tokens':{'input':10,'output':5,'reasoning':2,'cache':{'read':0,'write':0}}}})
        adapter=OpenCodeCLI(config['opencode'],config['local_llm'],runner=Mock(side_effect=ProviderError('timeout',process=ProcessResult(line,'',1,1))))
        with tempfile.TemporaryDirectory() as tmp,patch('agent_system.providers.executable',return_value='opencode'):
            with self.assertRaises(ProviderError) as error:
                adapter.invoke('task',Path(tmp),select_model(config),['sample.py'],[],Path(tmp))
        self.assertEqual(error.exception.metrics['total_tokens'],17)
        self.assertFalse(error.exception.metrics['usage_complete'])

    def test_memory_error_preserves_process_output_for_accounting(self):
        process=Mock();process.returncode=1;process.communicate.return_value=('numeric-usage-events','CUDA out of memory')
        with patch('agent_system.process.subprocess.Popen',return_value=process):
            with self.assertRaises(ProviderError) as error:run_process(['test'],cwd=Path.cwd(),timeout=1)
        self.assertEqual(error.exception.process.stdout,'numeric-usage-events')


class WorkspaceChecksTest(unittest.TestCase):
    def test_dependencies_are_copied_without_modifying_the_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'workspace';root.mkdir()
            source=Path(tmp)/'dependencies';source.mkdir()
            (source/'fixture.js').write_text('original')
            scripts={'test':'node test.js'}
            (root/'package.json').write_text(json.dumps({'scripts':scripts}))
            def run(args,**kwargs):
                dep=kwargs['cwd']/'node_modules/fixture.js'
                self.assertEqual(dep.read_text(),'original')
                dep.write_text('temporary change')
                return ProcessResult('ok','',0,0.1)
            with patch('agent_system.checks.npm_command',return_value=['node','test.js']),patch('agent_system.checks.run_process',side_effect=run):
                r=run_checks(root,['workspace-scripts'],[],allow_test_execution=True,workspace_specs=[{'path':'.','scripts':['test']}],dependency_sources={'.':source})
            self.assertEqual(r[0]['status'],'passed')
            self.assertEqual((source/'fixture.js').read_text(),'original')
            self.assertFalse((root/'node_modules').exists())

    def check(self, scripts, requested, authorized=True, changed_scripts=None, runner=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)/'workspace';root.mkdir()
            (root/'package.json').write_text(json.dumps({'scripts':scripts}))
            (root/'code.ts').write_text('const a: number = 1;\n')
            def fake_run(args,**kwargs):
                (kwargs['cwd']/'dist').mkdir(exist_ok=True)
                (kwargs['cwd']/'dist/out.js').write_text('built')
                return ProcessResult('ok','',0,0.1)
            operation = runner or Mock(side_effect=fake_run)
            with patch('agent_system.checks.npm_command',side_effect=lambda script:['node','npm-cli.js','run',script]),patch('agent_system.checks.run_process',operation):
                result = run_checks(root,['workspace-scripts'],['code.ts'],allow_test_execution=authorized,workspace_specs=[{'path':'.','scripts':requested}],script_contracts={'.':changed_scripts if changed_scripts is not None else scripts})
            self.assertFalse((root/'dist').exists())
            return result,operation

    def test_existing_scripts_execute_in_disposable_copy(self):
        r,operation = self.check({'test':'node test.js','typecheck':'tsc --noEmit','build':'expo export'},['test','typecheck','build'])
        self.assertTrue(all(x['status']=='passed' for x in r))
        self.assertEqual(operation.call_count,3)

    def test_missing_lint_is_pending_not_invented(self):
        r,operation = self.check({'test':'node test.js'},['lint'])
        self.assertEqual(r[0]['status'],'pending');operation.assert_not_called()

    def test_scripts_require_authorization(self):
        r,operation = self.check({'test':'node test.js'},['test'],False)
        self.assertEqual(r[0]['status'],'pending');operation.assert_not_called()

    def test_changed_script_or_lifecycle_hook_is_rejected(self):
        r,operation = self.check({'test':'node test.js','pretest':'bad'},['test'],changed_scripts={'test':'node test.js'})
        self.assertEqual(r[0]['status'],'failed');operation.assert_not_called()

    def test_source_mutation_in_verification_copy_is_rejected(self):
        def mutate(args,**kwargs):
            (kwargs['cwd']/'code.ts').write_text('changed')
            return ProcessResult('ok','',0,1)
        r,_ = self.check({'test':'node test.js'},['test'],runner=mutate)
        self.assertEqual(r[0]['status'],'failed')
