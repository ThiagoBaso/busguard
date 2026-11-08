const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function transpile(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout,
    require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } }, { filename });
  return module.exports;
}

test('mapa usa a parada aguardada e exibe trajeto atual sem textos removidos', async () => {
  const stops = [
    { id: 1, sequence: 1, latitude: -22.2, longitude: -49.9, coordinate_source: 'demo' },
    { id: 2, sequence: 2, latitude: -22.21, longitude: -49.91, coordinate_source: 'demo', completed: true },
  ];
  const position = { latitude: -22.22, longitude: -49.92 };
  let selected;
  const types = transpile('components/tripMapTypes.ts', {});
  const TripMap = transpile('components/TripMap.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { StyleSheet: { create: styles => styles } },
    '@/components/ui': { AppText: 'AppText', Card: 'Card' },
    '@/components/TripMapView': { __esModule: true, default: 'TripMapView' },
    '@/components/tripMapTypes': types,
    '@/hooks/useTripQuery': { useTripQuery: () => ({ data: { trip_id: 1, stops, location: null }, loading: false, error: null }) },
    '@/hooks/useNextStopRoute': { useNextStopRoute: (_trip, stop, origin) => { selected = { stop, origin }; return { points: [origin, { latitude: stop.latitude, longitude: stop.longitude }], failed: false, canRoute: true, stale: false }; } },
    '@/services/tripService': { getDriverTripMap: async () => ({}), getDriverTripGeometry: async () => ({ coordinates: [[-22.2, -49.9], [-22.21, -49.91]] }) },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(TripMap, { tripId: 1, position, nextStopSequence: 2 })); });
  assert.equal(selected.stop.id, 2);
  assert.equal(selected.origin, position);
  const map = renderer.root.findByType('TripMapView');
  assert.equal(map.props.stops[1].completed, true);
  assert.equal(map.props.nextRouteRouted, true);
  assert.equal(map.props.nextRoute.at(-1).latitude, -22.21);
  const text = JSON.stringify(renderer.toJSON());
  assert.doesNotMatch(text, /Localização deste dispositivo|Amarelo: paradas|Trajeto pelas ruas para as paradas fictícias/);
  await act(async () => renderer.unmount());
});

test('proxima parada avanca depois do primeiro embarque e nao volta no desembarque', () => {
  const mapTypes = transpile('components/tripMapTypes.ts', {});
  const sequence = mapTypes.nextBoardingStopSequence([
    { stopOrder: 1, checkedIn: false, boarded: true, status: 'waiting' },
    { stopOrder: 2, checkedIn: false, boarded: false, status: 'waiting' },
  ]);
  assert.equal(sequence, 2);
});
