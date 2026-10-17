const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, module, require: name => {
    assert.ok(Object.hasOwn(mocks, name), name);
    return mocks[name];
  } }, { filename });
  return module.exports;
}

class ApiError extends Error { constructor(status) { super('HTTP'); this.status = status; } }
class ApiTransportError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
const { describeTripError } = load('hooks/useTripQuery.ts', {
  react: {}, 'react-native': {}, 'expo-router': {}, '@/services/apiClient': { ApiError, ApiTransportError },
});

test('HTTP 503 comunica indisponibilidade do serviço sem culpar conexão do usuário', () => {
  const failure = describeTripError(new ApiError(503));
  assert.equal(failure.kind, 'service');
  assert.equal(failure.status, 503);
  assert.match(failure.message, /serviço.*indisponível/i);
  assert.doesNotMatch(failure.message, /conexão|offline|internet/i);
});

test('falha de transporte orienta conexão sem afirmar diagnóstico offline', () => {
  const failure = describeTripError(new ApiTransportError('network'));
  assert.equal(failure.kind, 'network');
  assert.equal(failure.status, null);
  assert.match(failure.message, /estabelecer conexão/);
  assert.doesNotMatch(failure.message, /sem internet|você está offline/i);
});

test('timeout tem mensagem distinta de falha de rede e do servidor', () => {
  const failure = describeTripError(new ApiTransportError('timeout'));
  assert.equal(failure.kind, 'timeout');
  assert.match(failure.message, /demorou/i);
  assert.notEqual(failure.message, describeTripError(new ApiError(503)).message);
  assert.notEqual(failure.message, describeTripError(new ApiTransportError('network')).message);
});

test('viagem ausente e acesso proibido preservam status e orientação específica', () => {
  assert.match(describeTripError(new ApiError(404)).message, /Nenhuma viagem/);
  assert.equal(describeTripError(new ApiError(404)).status, 404);
  assert.match(describeTripError(new ApiError(403)).message, /não tem acesso/);
  assert.equal(describeTripError(new ApiError(403)).status, 403);
});

function screenWithInsets(bottom, withTabBar) {
  const element = (type, props) => ({ type, props });
  const { Screen } = load('components/ui.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { ScrollView: 'ScrollView', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom }) },
    '@/constants/theme': { useAppTheme: () => ({}) }, '@/components/Brand': { Brand: 'Brand' },
  });
  return Screen({ title: 'Detalhes', children: 'Último controle', withTabBar }).props.children;
}

test('detalhes fora das abas reservam inset inferior de 48 px e espaço de toque', () => {
  const scroll = screenWithInsets(48, false);
  assert.equal(scroll.type, 'ScrollView');
  assert.ok(scroll.props.contentContainerStyle.at(-1).paddingBottom >= 48 + 16);
});

test('telas nas abas deixam a barra tratar o inset sem duplicar margem inferior', () => {
  assert.equal(screenWithInsets(48, true).props.contentContainerStyle.at(-1).paddingBottom, 24);
});
