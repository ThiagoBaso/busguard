import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Brand } from '@/components/Brand';
import { AppText, Button, Notice } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { ApiError, getApiErrorMessage } from '@/services/apiClient';
import { useSession } from '@/services/session';

export default function LoginScreen() {
  const { login } = useSession();
  const theme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ profile?: string | string[] }>();
  const selectedProfile = Array.isArray(params.profile) ? params.profile[0] : params.profile;
  const responsible = selectedProfile === 'responsible';
  const [email, setEmail] = useState(__DEV__ ? 'joao.pereira@transportescolar.com' : '');
  const [password, setPassword] = useState(__DEV__ ? 'Busguard@123' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const passwordInput = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function handleLogin() {
    if (busy.current) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError('Informe seu e-mail e sua senha para continuar.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Informe um e-mail válido.');
      return;
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await login(normalizedEmail, password);
    } catch (caught) {
      if (mounted.current) {
        setError(caught instanceof ApiError && caught.status === 401
          ? 'E-mail ou senha inválidos. Confira seus dados e tente novamente.'
          : getApiErrorMessage(caught, 'entrar na sua conta'));
      }
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.brand}><Brand large /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar e alterar perfil" disabled={loading}
              onPress={() => router.replace('/welcome')} style={({ pressed }) => [styles.back, { opacity: pressed || loading ? 0.6 : 1 }]}>
              <AppText muted>{'\u2190'} Alterar perfil</AppText>
            </Pressable>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><AppIcon name={responsible ? 'person' : 'bus'} size={26} color={theme.primary} /></View>
              <View style={styles.heading}>
                <AppText accessibilityRole="header" style={styles.title}>Bem-vindo de volta!</AppText>
                <AppText muted>{responsible ? 'Acesso do responsável' : 'Acesso do motorista'}</AppText>
              </View>
              <View style={styles.field}>
                <AppText variant="label">E-MAIL</AppText>
                <TextInput accessibilityLabel="E-mail" placeholder="Seu e-mail" placeholderTextColor={theme.muted}
                  autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" keyboardType="email-address"
                  value={email} onChangeText={(value) => { setEmail(value); setError(null); }} editable={!loading}
                  returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]} />
              </View>
              <View style={styles.field}>
                <AppText variant="label">SENHA</AppText>
                <View style={[styles.passwordField, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <TextInput ref={passwordInput} accessibilityLabel="Senha" placeholder="Sua senha" placeholderTextColor={theme.muted}
                    secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="password" textContentType="password"
                    value={password} onChangeText={(value) => { setPassword(value); setError(null); }} editable={!loading}
                    returnKeyType="go" onSubmitEditing={() => void handleLogin()} style={[styles.passwordInput, { color: theme.text }]} />
                  <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    accessibilityState={{ disabled: loading }} disabled={loading} onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}>
                    <AppText style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{showPassword ? 'Ocultar' : 'Mostrar'}</AppText>
                  </Pressable>
                </View>
              </View>
              {error ? <Notice tone="error" message={error} /> : null}
              <Button label={loading ? 'Entrando...' : 'Entrar na minha conta'} loading={loading} onPress={() => void handleLogin()} />
              <AppText muted style={styles.help}>Precisa de acesso ou esqueceu a senha? Procure a administração do transporte escolar.</AppText>
            </View>
            <View style={styles.footer}><AppIcon name="shield" size={17} color={theme.muted} /><AppText muted style={styles.footerText}>Seu acesso é pessoal. Não compartilhe sua senha.</AppText></View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, gap: 14 },
  brand: { alignItems: 'center', paddingBottom: 12 }, back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  card: { borderWidth: 1, borderRadius: 18, padding: 22, gap: 19 }, heading: { gap: 6 },
  icon: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7 }, field: { gap: 7 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  passwordField: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 11 },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 50, paddingLeft: 14, paddingRight: 7, paddingVertical: 12, fontSize: 15 },
  passwordToggle: { minHeight: 48, minWidth: 66, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  help: { fontSize: 12, lineHeight: 19, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, footerText: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
