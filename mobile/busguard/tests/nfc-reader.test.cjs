const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Ndef = require('react-native-nfc-manager/dist/ndef-lib');

function load(manager) {
  const filename = path.resolve(__dirname, '../services/nfcReader.android.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Uint8Array, require(name) {
    assert.equal(name, 'react-native-nfc-manager');
    return { __esModule: true, default: manager, NfcEvents: { DiscoverTag: 'discover' }, NfcAdapter: { FLAG_READER_NFC_A: 1 }, Ndef };
  } }, { filename });
  return module.exports.readNfcTag;
}

test('leitura usa NFC-A, aceita credencial NDEF e encerra a sessão', async () => {
  const token = 'busguard:nfc:v1:0123456789abcdef0123456789abcdef';
  let options, cancelled = 0, listener;
  const manager = { start: async () => {}, isSupported: async () => true, isEnabled: async () => true,
    setEventListener: (_event, callback) => { listener = callback; },
    registerTagEvent: async value => { options = value; listener({ ndefMessage: [{ ...Ndef.textRecord(token), type: [84] }] }); },
    unregisterTagEvent: async () => { cancelled++; } };
  assert.equal(await load(manager)(new AbortController().signal), token);
  assert.equal(options.readerModeFlags, 1);
  assert.equal(options.isReaderModeEnabled, true);
  assert.equal(cancelled, 1);
});

test('cancelamento interrompe espera pela tag', async () => {
  let started, cancelled = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const manager = { start: async () => {}, isSupported: async () => true, isEnabled: async () => true,
    setEventListener: () => {}, registerTagEvent: async () => { started(); },
    unregisterTagEvent: async () => { cancelled++; } };
  const controller = new AbortController();
  const read = load(manager)(controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(read);
  assert.equal(cancelled, 1);
});
