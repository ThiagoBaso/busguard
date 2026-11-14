const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

test('câmera acompanha direção, refoca e mantém marcador orientado após girar mapa', async () => {
  const calls = [];
  let cameraHeading = 90;
  const Map = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      animateCamera: (camera) => calls.push(camera),
      getCamera: async () => ({ heading: cameraHeading }),
    }));
    return React.createElement('Map', props, props.children);
  });
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { StyleSheet: { create: value => value }, Text: 'Text', View: 'View' },
    'react-native-maps': { __esModule: true, default: Map, Marker: 'Marker', Polyline: 'Polyline' },
    '@/components/Brand': { AppIcon: 'AppIcon' },
  };
  const filename = path.resolve(__dirname, '../components/TripMapView.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } }, { filename });
  const Component = module.exports.default;
  const props = { stops: [], position: { latitude: -22, longitude: -49, heading: 90 }, positionLabel: 'Veículo', route: [], nextRoute: [], followVehicle: true, focusRequest: 1 };
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  await act(async () => renderer.root.findByType('Map').props.onMapReady());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].heading, 90);
  assert.equal(calls[0].pitch, 64);
  assert.ok(calls[0].center.longitude > props.position.longitude);
  assert.ok(Math.abs(calls[0].center.latitude - props.position.latitude) < 1e-9);
  await act(async () => renderer.update(React.createElement(Component, { ...props, focusRequest: 2 })));
  assert.equal(calls.length, 2);
  cameraHeading = 45;
  await act(async () => { renderer.root.findByType('Map').props.onRegionChangeComplete(); await Promise.resolve(); });
  const marker = renderer.root.findByType('Marker');
  assert.equal(marker.props.coordinate.longitude, props.position.longitude);
  assert.equal(marker.findByType('View').props.style[1].transform[0].rotate, '45deg');
  await act(async () => renderer.unmount());
});
