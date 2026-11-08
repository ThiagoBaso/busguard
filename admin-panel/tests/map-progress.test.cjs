const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/mapProgress.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports }, { filename });

test('para verde exige embarque de todos os alunos e permanece concluida apos desembarque', () => {
  const stops = [{ id: 10 }, { id: 11 }];
  const assignments = [
    { stop_id: 10, passenger_id: 1, active: true },
    { stop_id: 10, passenger_id: 2, active: true },
    { stop_id: 11, passenger_id: 3, active: true },
  ];
  const events = [
    { id: 1, vehicle_id: 7, passenger_id: 1, action: 'entry', created_at: '2026-10-08T08:01:00' },
    { id: 2, vehicle_id: 7, passenger_id: 1, action: 'exit', created_at: '2026-10-08T08:05:00' },
    { id: 3, vehicle_id: 7, passenger_id: 2, action: 'entry', created_at: '2026-10-08T08:06:00' },
    { id: 4, vehicle_id: 7, passenger_id: 3, action: 'entry', created_at: '2026-10-08T08:07:00' },
  ];
  const result = compiledModule.exports.completedMapStops(stops, assignments, events, 7, '2026-10-08T08:00:00');
  assert.deepEqual([...result], [10, 11]);
  assert.deepEqual([...compiledModule.exports.completedMapStops(stops, assignments, events, 8, '2026-10-08T08:00:00')], []);
});
