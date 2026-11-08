const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRealtime(openChanges, events, timers) {
  const filename = path.resolve(__dirname, '../src/realtime.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const window = {
    dispatchEvent: event => events.push(event),
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; },
  };
  vm.runInNewContext(code, { module, exports: module.exports, window, AbortController, TextDecoder, CustomEvent,
    require: name => { assert.equal(name, './api'); return { openChanges }; } }, { filename });
  return module.exports;
}

test('quadros divididos são recebidos e reconexão é agendada', async () => {
  const encoder = new TextEncoder();
  const chunks = ['data: ["access_', 'events"]\r', '\n\r\ndata: ["trips"]\n\n', 'data: inválido\n\n'];
  const events = [], timers = [];
  let signal;
  const api = loadRealtime(async incoming => {
    signal = incoming;
    return { body: { getReader: () => ({
      read: async () => chunks.length ? { value: encoder.encode(chunks.shift()), done: false } : { done: true },
      releaseLock() {},
    }) } };
  }, events, timers);
  const stop = api.startRealtime();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events.map(event => Array.from(event.detail)), [['access_events'], ['trips']]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1000);
  stop();
  assert.equal(signal.aborted, true);
  assert.equal(timers[0].cancelled, true);
});

test('falhas de rede tentam novamente com espera crescente', async () => {
  const events = [], timers = [];
  let calls = 0;
  const api = loadRealtime(async () => { calls++; throw new Error('offline'); }, events, timers);
  const stop = api.startRealtime();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers[0].delay, 1000);
  timers[0].callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(timers[1].delay, 2000);
  stop();
});
