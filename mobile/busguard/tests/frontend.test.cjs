const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const mobileRoot = path.resolve(__dirname, '..');
const tokenKey = 'busguard.accessToken';

function loadModule(relativePath, mocks, globals = {}) {
  const filename = path.join(mobileRoot, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, AbortController, Error, TypeError, Headers,
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Import não previsto no teste: ${name}`);
      return mocks[name];
    },
    ...globals,
  }, { filename });
  return module.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('A operação esperada não ocorreu.');
}

function clientHarness(options = {}) {
  const queued = [];
  const calls = [];
  const writes = [];
  const timers = new Map();
  const legacyRemoved = [];
  let timerId = 0;
  let stored = options.stored ?? null;
  const secureStore = {
    async getItemAsync(key) { assert.equal(key, tokenKey); return stored; },
    async setItemAsync(key, token) {
      assert.equal(key, tokenKey);
      writes.push(['set:start', token]);
      await options.beforeSet?.(token);
      stored = token;
      writes.push(['set:done', token]);
    },
    async deleteItemAsync(key) {
      assert.equal(key, tokenKey);
      writes.push(['delete']);
      await options.beforeDelete?.();
      stored = null;
    },
  };
  const api = loadModule('services/apiClient.ts', {
    'react-native': { Platform: { OS: options.platform ?? 'android' } },
    'expo-secure-store': secureStore,
    'expo-constants': { expoConfig: { hostUri: '192.0.2.1:8081' } },
  }, {
    process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://api.test/' } },
    localStorage: { removeItem: key => legacyRemoved.push(key) },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      assert.ok(queued.length > 0, `Requisição não prevista: ${url}`);
      const next = queued.shift();
      return typeof next === 'function' ? next(url, init) : next;
    },
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
  });
  return {
    api, queued, calls, writes, timers, legacyRemoved,
    get stored() { return stored; },
    expireRequest() {
      assert.equal(timers.size, 1);
      const timer = [...timers.values()][0];
      assert.equal(timer.delay, 10000);
      timer.callback();
    },
  };
}

async function signIn(harness, token = 'test-token', role = 'driver') {
  harness.queued.push(response({ access_token: token, token_type: 'bearer' }), response({ id: 7, role }));
  return harness.api.login(' usuario@example.test ', 'senha fictícia');
}

test('login usa JSON, valida /auth/me e envia Bearer nos próximos pedidos', async () => {
  const h = clientHarness();
  assert.deepEqual(await signIn(h), { id: 7, role: 'driver' });
  assert.equal(h.calls[0].url, 'https://api.test/auth/login');
  assert.equal(h.calls[0].method, 'POST');
  assert.equal(h.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(h.calls[0].body), { email: 'usuario@example.test', password: 'senha fictícia' });
  assert.equal(h.calls[1].url, 'https://api.test/auth/me');
  assert.equal(h.calls[1].headers.Authorization, 'Bearer test-token');
  assert.equal(h.stored, 'test-token');
  assert.equal(h.timers.size, 0);
});

test('perfil não reconhecido invalida o login e descarta o token', async () => {
  const h = clientHarness();
  h.queued.push(response({ access_token: 'test-token' }), response({ id: 7, role: 'unknown-role' }));
  await assert.rejects(h.api.login('usuario@example.test', 'senha fictícia'), /Perfil de sessão inválido/);
  assert.equal(h.stored, null);
  assert.equal(await h.api.restoreSession(), null);
});

test('204 não tenta interpretar corpo JSON e limpa timer e listener externo', async () => {
  const h = clientHarness();
  const external = new AbortController();
  h.queued.push({ ok: true, status: 204, json() { assert.fail('204 não contém JSON'); } });
  assert.equal(await h.api.apiFetch('/empty', { signal: external.signal }), undefined);
  assert.equal(h.timers.size, 0);
  external.abort();
  assert.equal(h.calls[0].signal.aborted, false, 'O listener deve ser removido ao concluir.');
});

test('timeout cobre espera pelos headers', async () => {
  const h = clientHarness();
  h.queued.push(() => new Promise(() => {}));
  const pending = h.api.apiFetch('/slow-headers');
  const rejected = assert.rejects(pending, error => error instanceof h.api.ApiTransportError && error.kind === 'timeout');
  h.expireRequest();
  await rejected;
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test('timeout continua ativo após os headers enquanto JSON está pendente', async () => {
  const h = clientHarness();
  let reading = false;
  h.queued.push({ ok: true, status: 200, json() { reading = true; return new Promise(() => {}); } });
  const pending = h.api.apiFetch('/slow-body');
  const rejected = assert.rejects(pending, error => error instanceof h.api.ApiTransportError && error.kind === 'timeout');
  await until(() => reading);
  h.expireRequest();
  await rejected;
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test('sinal externo cancela JSON pendente e remove timer', async () => {
  const h = clientHarness();
  const external = new AbortController();
  let reading = false;
  h.queued.push({ ok: true, status: 200, json() { reading = true; return new Promise(() => {}); } });
  const rejected = assert.rejects(h.api.apiFetch('/body', { signal: external.signal }), error => error instanceof h.api.ApiTransportError && error.kind === 'cancelled');
  await until(() => reading);
  external.abort();
  await rejected;
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test('JSON concluído remove o listener externo e o timer', async () => {
  const h = clientHarness();
  const external = new AbortController();
  const body = deferred();
  let reading = false;
  h.queued.push({ ok: true, status: 200, json() { reading = true; return body.promise; } });
  const pending = h.api.apiFetch('/body', { signal: external.signal });
  await until(() => reading);
  assert.equal(h.timers.size, 1);
  body.resolve({ ready: true });
  assert.deepEqual(await pending, { ready: true });
  assert.equal(h.timers.size, 0);
  external.abort();
  assert.equal(h.calls[0].signal.aborted, false);
});

test('sinal previamente cancelado não inicia fetch', async () => {
  const h = clientHarness();
  const external = new AbortController();
  external.abort();
  await assert.rejects(h.api.apiFetch('/cancelled', { signal: external.signal }), { name: 'AbortError' });
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
});

test('falha de rede é classificada sem confundir resposta HTTP 503', async () => {
  const h = clientHarness();
  h.queued.push(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(h.api.apiFetch('/network'), error => {
    assert.ok(error instanceof h.api.ApiTransportError);
    assert.equal(error.kind, 'network');
    assert.match(h.api.getApiErrorMessage(error), /conexão/);
    return true;
  });
  h.queued.push(response(null, 503));
  await assert.rejects(h.api.apiFetch('/unavailable'), error => {
    assert.ok(error instanceof h.api.ApiError);
    assert.equal(error.status, 503);
    assert.match(h.api.getApiErrorMessage(error), /serviço está indisponível/);
    return true;
  });
  assert.equal(h.timers.size, 0);
});

test('erro de interpretação do corpo não é classificado como falha de conexão', async () => {
  const h = clientHarness();
  const invalidBody = new TypeError('Corpo inválido');
  h.queued.push({ ok: true, status: 200, json() { throw invalidBody; } });
  await assert.rejects(h.api.apiFetch('/invalid-body'), error => error === invalidBody);
  assert.doesNotMatch(h.api.getApiErrorMessage(invalidBody), /conexão|indisponível/);
  assert.equal(h.timers.size, 0);
});

test('mensagens distinguem tempo limite, cancelamento e erro desconhecido', () => {
  const h = clientHarness();
  assert.match(h.api.getApiErrorMessage(new h.api.ApiTransportError('timeout')), /tempo limite/);
  assert.equal(h.api.getApiErrorMessage(new h.api.ApiTransportError('cancelled')), 'Solicitação cancelada.');
  assert.doesNotMatch(h.api.getApiErrorMessage(new Error('Erro inesperado')), /conexão|indisponível/);
});

test('corpo do login também está coberto pelo timeout', async () => {
  const h = clientHarness();
  let reading = false;
  h.queued.push({ ok: true, status: 200, json() { reading = true; return new Promise(() => {}); } });
  const rejected = assert.rejects(h.api.login('usuario@example.test', 'senha fictícia'), { name: 'AbortError' });
  await until(() => reading);
  h.expireRequest();
  await rejected;
  assert.equal(await h.api.restoreSession(), null);
  assert.equal(h.timers.size, 0);
});

test('401 atual expira a sessão uma vez e preserva ApiError sem ler corpo', async () => {
  const h = clientHarness();
  await signIn(h);
  let expired = 0;
  h.api.onSessionExpired(() => { expired += 1; });
  h.queued.push({ ok: false, status: 401, json() { assert.fail('Erro HTTP não requer leitura do corpo'); } });
  await assert.rejects(h.api.apiFetch('/protected'), error => error instanceof h.api.ApiError && error.status === 401);
  assert.equal(expired, 1);
  assert.equal(await h.api.restoreSession(), null);
  assert.equal(h.stored, null);
});

test('401 antigo não expira novo login mesmo quando o texto do token é igual', async () => {
  const h = clientHarness();
  await signIn(h, 'same-token');
  const oldResponse = deferred();
  h.queued.push(() => oldResponse.promise);
  let expired = 0;
  h.api.onSessionExpired(() => { expired += 1; });
  const rejected = assert.rejects(h.api.apiFetch('/old-request'), error => error instanceof h.api.ApiError && error.status === 401);
  await signIn(h, 'same-token', 'responsible');
  oldResponse.resolve(response(null, 401));
  await rejected;
  assert.equal(expired, 0);
  h.queued.push(response({ id: 7, role: 'responsible' }));
  assert.equal((await h.api.restoreSession()).role, 'responsible');
  assert.equal(h.stored, 'same-token');
});

test('401 não aguarda SecureStore para notificar expiração e rejeitar com ApiError', async () => {
  const deletion = deferred();
  const h = clientHarness({ beforeDelete: () => deletion.promise });
  await signIn(h);
  let expired = 0;
  h.api.onSessionExpired(() => { expired += 1; });
  h.queued.push(response(null, 401));
  await assert.rejects(h.api.apiFetch('/protected'), error => error instanceof h.api.ApiError && error.status === 401);
  assert.equal(expired, 1);
  assert.equal(h.timers.size, 0);
  deletion.resolve();
  assert.equal(await h.api.restoreSession(), null);
});

test('logout durante login pendente não restaura token ao chegar a resposta', async () => {
  const h = clientHarness();
  const loginResponse = deferred();
  h.queued.push(() => loginResponse.promise);
  const rejected = assert.rejects(h.api.login('usuario@example.test', 'senha fictícia'), h.api.SessionCancelledError);
  await h.api.logout();
  loginResponse.resolve(response({ access_token: 'cancelled-token' }));
  await rejected;
  assert.equal(await h.api.restoreSession(), null);
  assert.equal(h.stored, null);
});

test('SecureStore serializa gravação pendente e logout mantém exclusão como estado final', async () => {
  const blocked = deferred();
  const h = clientHarness({ beforeSet: () => blocked.promise });
  h.queued.push(response({ access_token: 'cancelled-token' }));
  const rejected = assert.rejects(h.api.login('usuario@example.test', 'senha fictícia'), h.api.SessionCancelledError);
  await until(() => h.writes.length === 1);
  const logout = h.api.logout();
  await Promise.resolve();
  assert.deepEqual(h.writes, [['set:start', 'cancelled-token']], 'Exclusão precisa aguardar gravação anterior.');
  blocked.resolve();
  await Promise.all([rejected, logout]);
  assert.deepEqual(h.writes, [['set:start', 'cancelled-token'], ['set:done', 'cancelled-token'], ['delete']]);
  assert.equal(h.stored, null);
});

test('web mantém sessão apenas em memória e remove armazenamento legado', async () => {
  const h = clientHarness({ platform: 'web' });
  await signIn(h);
  assert.equal(h.writes.length, 0);
  assert.ok(h.legacyRemoved.includes(tokenKey));
  await h.api.logout();
  assert.equal(await h.api.restoreSession(), null);
});

test('loaders preservam caminhos e encaminham AbortSignal', async () => {
  const calls = [];
  const service = loadModule('services/tripService.ts', {
    '@/services/apiClient': { apiFetch: async (url, options) => { calls.push({ url, options }); return { id: 4 }; } },
  });
  const signal = new AbortController().signal;
  await service.getDriverTrip(signal);
  await service.getResponsibleTrip(signal);
  assert.deepEqual(calls.map(item => item.url), ['/driver/trips/current', '/responsible/children/current-trip']);
  assert.ok(calls.every(item => item.options.signal === signal));
});

test('embarque rejeita IDs inválidos sem chamada e preserva checked_in=false no JSON', async () => {
  const calls = [];
  const expected = { passenger_id: 8, checked_in: false, event_id: 99, duplicated: false };
  const service = loadModule('services/tripService.ts', {
    '@/services/apiClient': { apiFetch: async (url, options) => { calls.push({ url, options }); return expected; } },
  });
  for (const [trip, passenger] of [[0, '8'], [-1, '8'], [1.5, '8'], [1, '0'], [1, '-3'], [1, 'NaN'], [1, '2.5']]) {
    await assert.rejects(service.updateBoardingStatus(trip, passenger, false), /Identificador inválido/);
  }
  assert.equal(calls.length, 0);
  const signal = new AbortController().signal;
  assert.equal(await service.updateBoardingStatus(3, '8', false, signal), expected);
  assert.equal(calls[0].url, '/driver/trips/3/boarding');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.signal, signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), { passenger_id: 8, checked_in: false });
});
