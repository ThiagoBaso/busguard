// Testa a interface com uma API fictícia interceptada; não acessa o banco do projeto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const browser = [process.env.BUSGUARD_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']
  .find(item => item && fs.existsSync(item));
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate, message, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await pause(150);
  }
  throw new Error(message);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } else if (message.method && listeners.has(message.method)) listeners.get(message.method)(message.params);
  };
  return {
    call(method, params = {}) { const id = ++next; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); },
    on(method, callback) { listeners.set(method, callback); },
    close() { socket.close(); },
  };
}

test('painel mostra alertas, revisão paginada e histórico sem acessar a API real', { skip: !browser, timeout: 90000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'busguard-browser-test-'));
  let vite; let chrome; let cdp;
  let reviewed = false;
  let sawPendingFilter = false;
  let sawTimeline = false;
  const now = new Date().toISOString();
  const item = () => ({ id: 91, passenger_id: 12, passenger_name: 'Aluno fictício', vehicle_id: 7,
    vehicle_model: 'Van fictícia', vehicle_plate: 'TESTE01', trip_id: 3, actor_id: 2, actor_name: 'Motorista fictício',
    action: 'entry', created_at: now, occurred_at: now, event_uuid: '123e4567-e89b-42d3-a456-426614174000',
    review_status: reviewed ? 'rejected' : 'pending', review_reason: 'Ação repetida',
    review: reviewed ? { id: 1, event_id: 91, reviewer_id: 1, decision: 'rejected', reason: 'Registro duplicado confirmado', created_at: now } : null,
    reviewer_name: reviewed ? 'Admin fictício' : null });
  const summary = () => ({ pending: reviewed ? 0 : 1, entries_today: 0, exits_today: 0 });
  const reply = (url, method) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    if (method === 'OPTIONS') return [204, null];
    if (pathname === '/auth/login') return [200, { access_token: 'token-ficticio', token_type: 'bearer' }];
    if (pathname === '/auth/me') return [200, { id: 1, role: 'admin' }];
    if (pathname === '/admin/users') return [200, [{ id: 1, role: 'admin', name: 'Admin fictício' }]];
    if (pathname === '/admin/passengers') return [200, [{ id: 12, name: 'Aluno fictício', cpf: '00000000000', addresses_id: 1 }]];
    if (pathname === '/admin/vehicles') return [200, [{ id: 7, model: 'Van fictícia', plate: 'TESTE01', capacity: 20 }]];
    if (pathname === '/admin/routes') return [200, [{ id: 4, name: 'Rota fictícia', shift: 'morning', active: true }]];
    if (pathname === '/admin/trips') return [200, [{ id: 3, route_id: 4, vehicle_id: 7, driver_id: 2, status: 'in_progress', started_at: now }]];
    if (pathname === '/admin/operation-alerts') return [200, { pending_events: reviewed ? 0 : 1, active_trips: 1, stale_communications: 1, trips: [] }];
    if (pathname === '/admin/event-history') {
      if (parsed.searchParams.get('review_status') === 'pending') sawPendingFilter = true;
      if (parsed.searchParams.get('trip_id') === '3' && parsed.searchParams.get('passenger_id') === '12') sawTimeline = true;
      const matches = parsed.searchParams.get('review_status') !== 'pending' || !reviewed;
      return [200, { items: matches ? [item()] : [], total: matches ? 1 : 0, offset: 0, limit: 10, summary: summary() }];
    }
    if (pathname === '/admin/access-events/91/review' && method === 'POST') { reviewed = true; return [200, item()]; }
    if (pathname === '/admin/trips/3/manifest') return [200, { trip_id: 3, route_id: 4, vehicle_id: 7, driver_user_id: 2, driver_name: 'Motorista fictício', supervisor_user_id: null, captured_at: now, passengers: [{ passenger_id: 12, name: 'Aluno fictício', stop_id: 1, stop_sequence: 1 }] }];
    if (pathname === '/admin/routes/4/changes') return [200, { total: 1, limit: 10, offset: 0, items: [{ id: 1, entity_type: 'passenger', entity_id: 5, operation: 'update', actor_id: 1, actor_name: 'Admin fictício', before: { route_id: 4, passenger_id: 12, stop_id: 1, active: true }, after: { route_id: 4, passenger_id: 12, stop_id: 1, active: false }, created_at: now }] }];
    if (pathname === '/admin/changes') return [200, 'data: ["*"]\n\n'];
    return [200, []];
  };
  try {
    vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '0', '--strictPort', '--configLoader', 'runner'], { cwd: root, env: { ...process.env, NO_COLOR: '1', BUSGUARD_VITE_CACHE_DIR: path.join(profile, 'vite-cache') }, windowsHide: true });
    let viteOutput = '';
    vite.stdout.on('data', chunk => { viteOutput += chunk.toString(); });
    vite.stderr.on('data', chunk => { viteOutput += chunk.toString(); });
    const origin = await waitFor(() => viteOutput.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], `Vite não iniciou: ${viteOutput}`);
    chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0], 'Navegador não iniciou');
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    cdp = await connect(tab.webSocketDebuggerUrl);
    cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
      try {
        if (request.url.startsWith(`${origin}/`)) return await cdp.call('Fetch.continueRequest', { requestId });
        const [status, body] = reply(request.url, request.method);
        const headers = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' }, { name: 'Content-Type', value: typeof body === 'string' ? 'text/event-stream' : 'application/json' }];
        await cdp.call('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
      } catch (error) { if (!String(error).includes('closed')) console.error('Interceptação falhou:', error.message); }
    });
    await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await cdp.call('Page.navigate', { url: origin });
    try {
      await waitFor(() => evaluate('Boolean(document.querySelector(".login-form"))'), 'Tela de login não apareceu', 12000);
    } catch (error) {
      const body = await evaluate('document.body?.innerText?.slice(0, 500) || ""');
      throw new Error(`${error.message}. Página: ${body}. Vite: ${viteOutput.slice(-800)}`);
    }
    await evaluate('document.querySelector(".login-form").requestSubmit()');
    await waitFor(() => evaluate('document.body.innerText.includes("Alertas operacionais")'), 'Alertas não apareceram');
    if (process.env.BUSGUARD_UI_SCREENSHOT) {
      const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(process.env.BUSGUARD_UI_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
    }
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("eventos aguardando revisão")).click()');
    await waitFor(() => evaluate('Boolean([...document.querySelectorAll("button")].find(b => b.textContent === "Revisar"))'), 'Evento pendente não apareceu');
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Revisar").click()');
    await waitFor(() => evaluate('document.body.innerText.includes("Eventos nesta viagem") && document.body.innerText.includes("Vínculos registrados no início")'), 'Linha do tempo e vínculos não apareceram');
    assert.equal(sawPendingFilter, true);
    assert.equal(sawTimeline, true);
    await evaluate(`(() => { const modal=document.querySelector('[role="dialog"]'); const field=[...modal.querySelectorAll('label')].find(x=>x.textContent.includes('Decisão')).querySelector('select'); field.value='rejected'; field.dispatchEvent(new Event('change',{bubbles:true})); const input=[...modal.querySelectorAll('input')][0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Registro duplicado confirmado'); input.dispatchEvent(new Event('input',{bubbles:true})); modal.querySelector('form').requestSubmit(); })()`);
    await waitFor(() => reviewed && evaluate('document.body.innerText.includes("Revisão registrada")'), 'Revisão não foi registrada');
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Rotas e Paradas")).click()');
    await waitFor(() => evaluate('Boolean([...document.querySelectorAll("button")].find(b => b.textContent.includes("Histórico de alterações")))'), 'Histórico da rota não apareceu');
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Histórico de alterações")).click()');
    await waitFor(() => evaluate('document.body.innerText.includes("Vínculo de passageiro")'), 'Alteração de rota não apareceu');
    assert.equal(reviewed, true);
  } finally {
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    if (vite) vite.kill();
    await pause(500);
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('busguard-browser-test-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* O sistema pode liberar o perfil após o encerramento. */ }
    }
  }
});
