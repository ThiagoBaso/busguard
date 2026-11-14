const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

test('leitura identifica aluno e só registra após confirmação, com nova tentativa idempotente', async () => {
  const token = 'busguard:nfc:v1:0123456789abcdef0123456789abcdef';
  const sent = [];
  let recorded = 0;
  class ApiError extends Error {}
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'expo-crypto': { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Modal: 'Modal', View: 'View', StyleSheet: { create: styles => styles } },
    '@/components/ui': { AppText: 'AppText', Button: 'Button' },
    '@/constants/theme': { useAppTheme: () => ({ primary: '#070', surface: '#fff' }) },
    '@/services/apiClient': { ApiError, getApiErrorMessage: () => 'Erro de conexão' },
    '@/services/nfcReader': { readNfcTag: async () => token },
    '@/services/tripService': {
      resolveNfcStudent: async () => ({ id: '101', name: 'Aluno', checkedIn: false, pendingReview: false, status: 'waiting', nfcLastEventId: null }),
      submitNfcBoarding: async (...args) => { sent.push(args); if (sent.length === 1) throw new Error('timeout'); return { event: { review_status: 'accepted' } }; },
    },
  };
  const filename = path.resolve(__dirname, '../components/NfcBoardingModal.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout, Date, require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } }, { filename });
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.exports.default, { tripId: 51, onClose() {}, onRecorded: () => { recorded++; } })); });
  const button = label => renderer.root.findAllByType('Button').find(node => node.props.label === label);
  assert.ok(button('Confirmar embarque'));
  assert.equal(sent.length, 0);
  await act(async () => { button('Confirmar embarque').props.onPress(); });
  assert.equal(sent.length, 1);
  assert.equal(recorded, 0);
  await act(async () => { button('Tentar confirmar novamente').props.onPress(); });
  assert.equal(sent.length, 2);
  assert.equal(sent[0][3].eventUuid, sent[1][3].eventUuid);
  assert.equal(sent[0][3].occurredAt, sent[1][3].occurredAt);
  assert.equal(sent[1][2], false);
  assert.equal(recorded, 1);
  assert.ok(button('Concluir'));
  await act(async () => renderer.unmount());
});
