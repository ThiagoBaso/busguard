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

function visualTheme(mode) {
  return load('constants/theme.ts', {
    '@/components/useColorScheme': { useColorScheme: () => mode },
  }).themes[mode];
}

function contrast(foreground, background) {
  const luminance = hex => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

for (const mode of ['light', 'dark']) {
  test(`paleta ${mode} mantém contraste de texto nas superfícies e badges`, () => {
    const theme = visualTheme(mode);
    for (const foreground of [theme.text, theme.muted]) {
      for (const background of [theme.background, theme.surface, theme.surfaceAlt]) {
        assert.ok(contrast(foreground, background) >= 4.5, `${foreground} sobre ${background}`);
      }
    }
    assert.ok(contrast(theme.success, theme.primarySoft) >= 4.5);
    assert.ok(contrast(theme.primary, theme.primarySoft) >= 4.5);
  });

  test(`ícones das abas ${mode} recebem a cor ativa e inativa do navegador`, () => {
    const element = (type, props) => ({ type, props });
    const Tabs = Object.assign(() => {}, { Protected: 'Protected', Screen: 'Tab' });
    const theme = visualTheme(mode);
    const { default: TabLayout } = load('app/(tabs)/_layout.tsx', {
      'react/jsx-runtime': { jsx: element, jsxs: element },
      'expo-router': { Tabs },
      '@/components/Brand': { AppIcon: 'Icon' },
      '@/constants/theme': { useAppTheme: () => theme },
      '@/services/session': { useSession: () => ({ user: { role: 'driver' } }) },
    });
    const tree = TabLayout();
    const screens = tree.props.children.flatMap(child => child.type === 'Protected'
      ? [child.props.children].flat() : [child]);
    for (const screen of screens) {
      const icon = screen.props.options.tabBarIcon;
      assert.equal(icon({ color: theme.primary }).props.color, theme.primary);
      assert.equal(icon({ color: theme.muted }).props.color, theme.muted);
    }
    assert.notEqual(theme.primary, theme.muted);
  });

  test(`página não encontrada ${mode} usa cor do tema sem variável indefinida`, () => {
    const element = (type, props) => ({ type, props });
    const theme = visualTheme(mode);
    const { default: NotFound } = load('app/+not-found.tsx', {
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
      'expo-router': { Link: 'Link', Stack: { Screen: 'Screen' } },
      'react-native': { StyleSheet: { create: styles => styles } },
      '@/components/Themed': { Text: 'Text', View: 'View' },
      '@/constants/theme': { useAppTheme: () => theme },
    });
    const link = NotFound().props.children[1].props.children[1];
    assert.equal(link.props.children.props.style.at(-1).color, theme.primary);
    assert.ok(contrast(theme.primary, theme.background) >= 4.5);
  });
}
