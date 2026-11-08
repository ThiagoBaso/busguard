const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relative, mocks, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController,
    require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; }, ...globals }, { filename });
  return module.exports;
}

const stop = { id: 7, sequence: 1, latitude: -22.2, longitude: -49.9, coordinate_source: 'demo' };
const firstPosition = { latitude: -22.21, longitude: -49.91 };

function harness(api) {
  const timers = new Set();
  const module = load('hooks/useNextStopRoute.ts', {
    react: React, 'expo-router': { useFocusEffect: callback => React.useEffect(callback, [callback]) },
    '@/services/tripService': { getNextStopGeometry: api },
  }, { setInterval: callback => { timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback) });
  let result, renderer;
  function Probe(props) { result = module.useNextStopRoute(props.trip, props.stop, props.position); return null; }
  return { timers, get result() { return result; },
    async mount(props) { await act(async () => { renderer = create(React.createElement(Probe, props)); }); },
    async update(props) { await act(async () => renderer.update(React.createElement(Probe, props))); },
    async tick() { await act(async () => { for (const timer of [...timers]) timer(); await Promise.resolve(); }); },
    async unmount() { await act(async () => renderer.unmount()); },
  };
}

test('calcula até a próxima parada e atualiza após deslocamento significativo', async () => {
  const calls = [];
  const h = harness(async (...args) => { calls.push(args); return { coordinates: [[-22.21, -49.91], [-22.2, -49.9]] }; });
  await h.mount({ trip: 1, stop, position: firstPosition });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 7);
  assert.equal(h.result.points.length, 2);
  await h.update({ trip: 1, stop, position: { ...firstPosition, latitude: -22.2101 } });
  await h.tick();
  assert.equal(calls.length, 1);
  const moved = { ...firstPosition, latitude: -22.211 };
  await h.update({ trip: 1, stop, position: moved });
  await h.tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2].latitude, moved.latitude);
  await h.unmount();
  assert.equal(h.timers.size, 0);
});

test('troca de parada cancela o cálculo anterior e ignora resposta tardia', async () => {
  const calls = [], resolvers = [];
  const h = harness((...args) => { calls.push(args); return new Promise(resolve => resolvers.push(resolve)); });
  await h.mount({ trip: 1, stop, position: firstPosition });
  await h.update({ trip: 1, stop: { ...stop, id: 8, sequence: 2 }, position: firstPosition });
  assert.equal(calls[0][3].aborted, true);
  assert.equal(calls[1][1], 8);
  await act(async () => { resolvers[0]({ coordinates: [[0, 0], [0, 1]] }); await Promise.resolve(); });
  assert.equal(h.result.points, null);
  await act(async () => { resolvers[1]({ coordinates: [[-22.21, -49.91], [-22.2, -49.9]] }); await Promise.resolve(); });
  assert.equal(h.result.points.length, 2);
  await h.unmount();
});

test('parada manual não é enviada ao serviço público', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { coordinates: [] }; });
  await h.mount({ trip: 1, stop: { ...stop, coordinate_source: 'manual' }, position: firstPosition });
  assert.equal(calls, 0);
  assert.equal(h.result.canRoute, false);
  await h.unmount();
});

test('não mantém trajeto antigo quando a atualização falha', async () => {
  let calls = 0;
  const h = harness(async () => {
    if (++calls > 1) throw new Error('indisponível');
    return { coordinates: [[-22.21, -49.91], [-22.2, -49.9]] };
  });
  await h.mount({ trip: 1, stop, position: firstPosition });
  assert.equal(h.result.points.length, 2);
  await h.update({ trip: 1, stop, position: { ...firstPosition, latitude: -22.212 } });
  assert.equal(h.result.points, null);
  assert.equal(h.result.stale, true);
  await h.tick();
  assert.equal(h.result.points, null);
  assert.equal(h.result.failed, true);
  await h.unmount();
});

test('seleciona parada pendente e usa o destino final depois dos embarques', () => {
  const { selectNextStop } = load('components/tripMapTypes.ts', {});
  const stops = [{ id: 3, sequence: 3 }, { id: 1, sequence: 1 }, { id: 2, sequence: 2 }];
  assert.equal(selectNextStop(stops, 2).id, 2);
  assert.equal(selectNextStop(stops, null).id, 3);
  assert.equal(selectNextStop(stops, 8), undefined);
});
