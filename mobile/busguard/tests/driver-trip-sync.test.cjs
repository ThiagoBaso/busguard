const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../services/driverTripSync.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText;
const listeners = new Set();
let notifications = 0;
const compiledModule = { exports: {} };
vm.runInNewContext(code, {
  module: compiledModule, exports: compiledModule.exports,
  require(name) {
    assert.equal(name, 'react');
    return {
      useEffect() {},
      useSyncExternalStore(subscribe, getSnapshot) { listeners.add(subscribe(() => { notifications += 1; })); return getSnapshot(); },
    };
  },
}, { filename });

test('chamada compartilha a viagem atualizada entre telas e separa usuarios', () => {
  const { useDriverTripSnapshot, publishDriverTripSnapshot, getDriverTripSnapshot, clearDriverTripSnapshot } = compiledModule.exports;
  clearDriverTripSnapshot();
  const trip = { id: 8, students: [{ id: '12', checkedIn: true }] };
  assert.equal(useDriverTripSnapshot(3, null, null), null);
  publishDriverTripSnapshot(3, trip);
  assert.equal(useDriverTripSnapshot(3, null, null), trip);
  assert.equal(getDriverTripSnapshot(4), null);
  assert.equal(notifications, 1);
  clearDriverTripSnapshot(3);
  assert.equal(getDriverTripSnapshot(3), null);
  listeners.forEach(dispose => dispose());
  listeners.clear();
});
