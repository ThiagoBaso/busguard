import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import { CurrentUser, login, restoreSession } from '@/services/apiClient';
import type { AppProfile } from '@/services/tripService';

export default function LoginScreen() {
  const [profile, setProfile] = useState<AppProfile>('driver');
  const [email, setEmail] = useState('joao.pereira@transportescolar.com');
  const [password, setPassword] = useState('Busguard@123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    restoreSession().then((user) => {
      if (user) {
        navigateByRole(user);
      }
    });
  }, []);

  function selectProfile(nextProfile: AppProfile) {
    setProfile(nextProfile);
    setEmail(
      nextProfile === 'driver'
        ? 'joao.pereira@transportescolar.com'
        : 'maria.fernandes@email.com',
    );
  }

  async function handleLogin() {
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      navigateByRole(user);
    } catch {
      setError('Nao foi possivel entrar. Verifique e-mail e senha.');
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

          <View style={styles.roleGroup}>
            <Pressable
              style={[styles.roleButton, profile === 'driver' && styles.roleButtonActive]}
              onPress={() => selectProfile('driver')}>
              <Text style={[styles.roleText, profile === 'driver' && styles.roleTextActive]}>Motorista</Text>
              <Text style={styles.roleHint}>Supervisor</Text>
            </Pressable>
            <Pressable
              style={[styles.roleButton, profile === 'responsible' && styles.roleButtonActive]}
              onPress={() => selectProfile('responsible')}>
              <Text style={[styles.roleText, profile === 'responsible' && styles.roleTextActive]}>Responsavel</Text>
              <Text style={styles.roleHint}>Crianca</Text>
            </Pressable>
          </View>

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

function navigateByRole(user: CurrentUser) {
  if (user.role === 'responsible') {
    router.replace('/(tabs)/two');
    return;
  }

  router.replace('/(tabs)');
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
  roleGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    backgroundColor: 'transparent',
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#f8fafc',
  },
  roleButtonActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
  roleText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
  roleTextActive: {
    color: '#0f766e',
  },
  roleHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
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
