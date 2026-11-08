const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relative, mocks, extra = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, console,
    require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; }, ...extra }, { filename });
  return module.exports;
}

function harness() {
  let listener, positionCallback, removed = 0, current, renderer;
  const sent = [], timers = new Set();
  class ApiError extends Error { constructor(status) { super('HTTP'); this.status = status; } }
  let getTrip = async () => ({ id: 51 });
  const AppState = { currentState: 'active', addEventListener: (_name, callback) => { listener = callback; return { remove() {} }; } };
  const Location = { Accuracy: { Balanced: 1 }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchPositionAsync: async (_options, callback) => { positionCallback = callback; return { remove() { removed++; } }; } };
  const sharing = load('services/locationSharing.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': { AppState }, 'expo-location': Location,
    '@/services/apiClient': { ApiError }, '@/services/tripService': {
      getDriverTrip: (...args) => getTrip(...args), updateVehicleLocation: async (...args) => { sent.push(args); },
    },
  }, { setInterval: callback => { timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback) });
  function Screen() { current = sharing.useLocationSharing(); return null; }
  const render = key => React.createElement(sharing.LocationSharingProvider, null, React.createElement(Screen, { key }));
  return { sharing, render, sent, timers, ApiError, Location, AppState,
    get current() { return current; }, get removed() { return removed; },
    set getTrip(fn) { getTrip = fn; }, emit(position) { positionCallback(position); }, background() { listener('background'); },
    async mount() { await act(async () => { renderer = create(render('inicio')); }); },
    async switchTab() { await act(async () => { renderer.update(render('chamada')); }); },
    async unmount() { await act(async () => renderer.unmount()); },
  };
}

test('localização continua enviando ao trocar de Início para Chamada', async () => {
  const h = harness();
  await h.mount();
  await act(async () => h.current.start(51));
  assert.equal(h.current.active, true);
  await h.switchTab();
  assert.equal(h.removed, 0);
  await act(async () => h.emit({ coords: { latitude: -22.21, longitude: -49.94, speed: 5 } }));
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0][0], 51);
  assert.equal(h.sent[0][1].speedKmh, 18);
  assert.equal(h.current.position.latitude, -22.21);
  await h.unmount();
  assert.equal(h.removed, 1);
});

test('encerramento da viagem ou saída do primeiro plano para o GPS', async () => {
  const h = harness();
  await h.mount();
  await act(async () => h.current.start(51));
  h.getTrip = async () => { throw new h.ApiError(404); };
  await act(async () => { for (const timer of h.timers) timer(); await Promise.resolve(); });
  assert.equal(h.current.active, false);
  assert.equal(h.removed, 1);
  await act(async () => h.current.start(51));
  await act(async () => h.background());
  assert.equal(h.current.active, false);
  assert.equal(h.removed, 2);
  await h.unmount();
});

test('resposta tardia de permissão não reinicia GPS já cancelado', async () => {
  const h = harness();
  let grant;
  h.Location.requestForegroundPermissionsAsync = () => new Promise(resolve => { grant = resolve; });
  await h.mount();
  let pending;
  await act(async () => { pending = h.current.start(51); });
  await act(async () => h.current.stop());
  await act(async () => { grant({ status: 'granted' }); await pending; });
  assert.equal(h.current.active, false);
  assert.equal(h.current.state, 'idle');
  await h.unmount();
});

test('trajeto externo só é elegível com todas as paradas fictícias e localizadas', () => {
  const model = load('components/tripMapTypes.ts', {});
  const stops = [{ id: 1, latitude: -22.2, longitude: -49.9, coordinate_source: 'demo' }, { id: 2, latitude: -22.21, longitude: -49.91, coordinate_source: 'demo' }];
  assert.equal(model.canRouteDemo(stops), true);
  assert.equal(model.canRouteDemo([{ ...stops[0], coordinate_source: 'manual' }, stops[1]]), false);
  assert.equal(model.canRouteDemo([stops[0], { ...stops[1], latitude: null }]), false);
});
