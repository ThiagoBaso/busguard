import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import { ApiError } from '@/services/apiClient';
import { useSession } from '@/services/session';

export default function LoginScreen() {
  const { login } = useSession();
  // Contas de demonstração para testes locais:
  // admin: email admin@transportescolar.com | senha Busguard@123
  // driver: email joao.pereira@transportescolar.com | senha Busguard@123
  // responsible: email maria.fernandes@email.com | senha Busguard@123
  const [email, setEmail] = useState(__DEV__ ? 'joao.pereira@transportescolar.com' : '');
  const [password, setPassword] = useState(__DEV__ ? 'Busguard@123' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401
        ? 'E-mail ou senha inválidos.'
        : 'Não foi possível conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={24}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.logoCircle}>
            <SymbolView
              name={{ android: 'directions_bus', web: 'directions_bus' }}
              size={34}
              tintColor="#0f766e"
              fallback={<Text style={styles.logoFallback}>Bus</Text>}
            />
          </View>
          <Text style={styles.title}>BusGuard</Text>
          <Text style={styles.subtitle}>Acompanhe rotas escolares com seguranca.</Text>

          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.passwordField}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Senha"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={styles.passwordToggle}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onPress={() => setShowPassword((current) => !current)}>
              <SymbolView
                name={{ android: showPassword ? 'visibility_off' : 'visibility', web: showPassword ? 'visibility_off' : 'visibility' }}
                size={22}
                tintColor="#64748b"
                fallback={<Text style={styles.passwordToggleFallback}>{showPassword ? 'Ocultar' : 'Ver'}</Text>}
              />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.loginButton, loading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.loginButtonText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef6f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    marginBottom: 18,
  },
  logoFallback: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 15,
    marginTop: 6,
    marginBottom: 22,
  },
  input: {
    height: 52,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 12,
  },
  passwordField: {
    height: 52,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    height: 52,
    color: '#0f172a',
    paddingLeft: 16,
    paddingRight: 8,
    fontSize: 15,
  },
  passwordToggle: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordToggleFallback: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  loginButton: {
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8bd16',
    marginTop: 6,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  loginButtonText: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '800',
  },
});
