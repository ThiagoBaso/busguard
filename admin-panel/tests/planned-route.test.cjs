const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(apiFetch) {
  const filename = path.resolve(__dirname, '../src/RouteMap.tsx');
  const source = fs.readFileSync(filename, 'utf8').replace('import.meta.env.VITE_MAP_TILE_URL', 'undefined');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const effects = [], states = [], timers = [];
  const react = { useEffect: callback => effects.push(callback), useState: initial => {
    const index = states.length; states.push(initial);
    return [initial, value => { states[index] = value; }];
  } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController,
    window: { setTimeout: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cancelled = true; } },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return {};
      if (name === 'leaflet' || name === 'react-leaflet' || name === './components') return {};
      if (name === './api') return { apiFetch };
      throw new Error(`Import inesperado: ${name}`);
    },
  }, { filename });
  return { hook: module.exports.usePlannedRoute, effects, states, timers };
}

const stops = [{ id: 1, sequence: 1, address_id: 1 }, { id: 2, sequence: 2, address_id: 2 }];
const addresses = [{ id: 1, latitude: -22.2, longitude: -49.9, coordinate_source: 'demo' },
  { id: 2, latitude: -22.21, longitude: -49.91, coordinate_source: 'demo' }];

test('calcula automaticamente e cancela a requisição ao desmontar', async () => {
  const calls = [];
  let resolve;
  const h = harness((...args) => { calls.push(args); return new Promise(done => { resolve = done; }); });
  h.hook(5, stops, addresses);
  const cleanup = h.effects[0]();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/admin/routes/5/geometry');
  resolve({ coordinates: [[-22.2, -49.9], [-22.21, -49.91]], distance_m: 1000, duration_s: 120 });
  await new Promise(done => setImmediate(done));
  assert.equal(h.states[0].geometry.distance_m, 1000);
  cleanup();
  assert.equal(calls[0][1].signal.aborted, true);
});

test('aguarda coordenadas e não envia paradas manuais ao serviço público', () => {
  let calls = 0;
  const h = harness(() => { calls++; return Promise.resolve({}); });
  h.hook(5, stops, [addresses[0], { ...addresses[1], coordinate_source: 'manual' }]);
  h.effects[0]();
  assert.equal(calls, 0);
});

test('tenta novamente depois de falha temporária', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; if (calls === 1) throw new Error('indisponível'); return { distance_m: 1000 }; });
  h.hook(5, stops, addresses);
  const cleanup = h.effects[0]();
  await new Promise(done => setImmediate(done));
  assert.equal(h.timers[0].ms, 30000);
  h.timers[0].callback();
  await new Promise(done => setImmediate(done));
  assert.equal(calls, 2);
  assert.equal(h.states[0].geometry.distance_m, 1000);
  cleanup();
});
