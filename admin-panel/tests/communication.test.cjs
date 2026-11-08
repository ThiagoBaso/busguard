const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/communication.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports }, { filename });

test('comunicação deixa de ser recente após o limite ou falha da consulta', () => {
  const received = Date.parse('2026-11-08T10:00:00Z');
  const status = { received_at: '2026-11-08T10:00:00Z', status: 'recent', stale_after_seconds: 300 };
  const isRecent = compiledModule.exports.communicationIsRecent;
  assert.equal(isRecent(status, received + 60_000, ''), true);
  assert.equal(isRecent(status, received + 301_000, ''), false);
  assert.equal(isRecent(status, received + 60_000, 'API indisponível'), false);
  assert.equal(isRecent(undefined, received, ''), false);
});
