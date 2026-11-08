const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function loadMap(getLeaflet, document) {
  const filename = path.resolve(__dirname, '../components/TripMapView.web.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    document,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'leaflet/dist/leaflet.css') return {};
      if (name === './trip-map-markers.css') return {};
      if (name === 'leaflet') return getLeaflet();
      throw new Error(`Import inesperado: ${name}`);
    },
  }, { filename });
  return module.exports.default;
}

const props = {
  stops: [{ id: 1, sequence: 1, latitude: -22.21, longitude: -49.94, address: 'Rua A' }],
  position: { latitude: -22.22, longitude: -49.95 }, positionLabel: 'Localização atual', route: [], routed: false,
  nextRoute: [{ latitude: -22.22, longitude: -49.95 }, { latitude: -22.21, longitude: -49.94 }], nextRouteRouted: true,
};

test('mapa renderiza no servidor sem carregar Leaflet nem acessar window', () => {
  let loaded = false;
  const Map = loadMap(() => { loaded = true; throw new Error('Leaflet acessado no servidor'); });
  const html = renderToString(React.createElement(Map, props));
  assert.match(html, /Mapa da viagem/);
  assert.equal(loaded, false);
});

test('mapa carrega paradas numeradas e destaca a posição sobre os demais marcadores', async () => {
  let loaded = 0, markers = 0, removed = 0;
  const markerOptions = [], polylines = [];
  const fakeMap = { setView() { return this; }, fitBounds() {}, createPane() { return { style: {} }; }, remove() { removed++; } };
  const marker = () => ({ bindTooltip() { return this; }, bindPopup() { return this; }, addTo() { markers++; return this; } });
  const leaflet = { map: () => fakeMap, tileLayer: () => ({ addTo() {} }),
    layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    divIcon: options => options, marker: (_position, options) => { markerOptions.push(options); return marker(); },
    latLngBounds: points => points, polyline: (_points, options) => { polylines.push(options); return { addTo() {} }; } };
  const Map = loadMap(() => { loaded++; return leaflet; }, { createElement: () => ({ textContent: '' }) });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Map, props), { createNodeMock: () => ({}) }); });
  assert.equal(loaded, 1);
  assert.equal(markers, 2);
  assert.equal(markerOptions[0].icon.html.textContent, '1');
  assert.equal(markerOptions[0].icon.className, 'trip-map-stop-marker');
  assert.equal(markerOptions[1].icon.className, 'trip-map-location-marker');
  assert.ok(markerOptions[1].zIndexOffset > markerOptions[0].zIndexOffset);
  assert.equal(polylines[0].color, '#075fcd');
  assert.equal(polylines[0].pane, 'trip-navigation-pane');
  await act(async () => renderer.unmount());
  assert.equal(removed, 1);
});
