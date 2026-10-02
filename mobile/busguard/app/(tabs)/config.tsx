import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import { logout } from '@/services/apiClient';

export default function ConfigScreen() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      await logout();
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <SymbolView
            name={{ android: 'settings', web: 'settings' }}
            size={24}
            tintColor="#0f766e"
            fallback={<Text style={styles.iconFallback}>Cfg</Text>}
          />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Configurações</Text>
          <Text style={styles.subtitle}>Sessão do aplicativo</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conta</Text>
        <Pressable
          style={[styles.logoutButton, loading && styles.logoutButtonDisabled]}
          onPress={handleLogout}
          disabled={loading}>
          <SymbolView
            name={{ android: 'power_settings_new', web: 'power_settings_new' }}
            size={22}
            tintColor="#ffffff"
            fallback={<Text style={styles.buttonFallback}>Sair</Text>}
          />
          <Text style={styles.logoutButtonText}>{loading ? 'Saindo...' : 'Sair'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 14,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
  },
  iconFallback: {
    color: '#0f766e',
    fontSize: 10,
    fontWeight: '900',
  },
  titleBlock: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: 'transparent',
  },
  title: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  section: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  logoutButton: {
    minHeight: 54,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
  },
  logoutButtonDisabled: {
    opacity: 0.75,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonFallback: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
});
