import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Brand } from '@/components/Brand';
import { AppText, Badge, Button, Card, Notice } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useSession } from '@/services/session';

const roleLabels = { driver: 'Motorista', responsible: 'Responsável', supervisor: 'Supervisor', admin: 'Administrador' };

export default function ConfigScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user, logout } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function handleLogout() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await logout();
    } catch {
      if (mounted.current) setError('Não foi possível encerrar sua sessão. Tente novamente.');
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}><Brand /><View style={[styles.settingsIcon, { backgroundColor: theme.surfaceAlt }]}><AppIcon name="settings" size={21} color={theme.muted} /></View></View>
          <View style={styles.heading}><AppText accessibilityRole="header" variant="title">Minha conta</AppText><AppText muted>Seu acesso e as informações do aplicativo.</AppText></View>
          <Card>
            <View style={styles.account}>
              <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}><AppIcon name="person" size={28} color={theme.primary} /></View>
              <View style={styles.accountText}><AppText style={styles.accountTitle}>{user ? roleLabels[user.role] : 'Conta'}</AppText><AppText muted>{user ? `Identificação da conta: ${user.id}` : 'Informações da sessão indisponíveis'}</AppText></View>
            </View>
            {user ? <Badge label="Sessão ativa" tone="success" /> : null}
          </Card>
          <AppText variant="label" muted>INFORMAÇÕES E SUPORTE</AppText>
          <Card>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Ajuda e orientações de uso" disabled={loading}
              onPress={() => router.push({ pathname: '/modal', params: { section: 'help' } })}
              style={({ pressed }) => [styles.row, { opacity: pressed || loading ? 0.6 : 1 }]}>
              <View style={[styles.rowIcon, { backgroundColor: theme.surfaceAlt }]}><AppIcon name="shield" size={22} color={theme.primary} /></View>
              <View style={styles.rowText}><AppText style={styles.rowTitle}>Preciso de ajuda</AppText><AppText muted style={styles.rowCaption}>Acesso, embarques e acompanhamento</AppText></View>
              <AppIcon name="arrow" size={19} color={theme.muted} />
            </Pressable>
            <View style={{ borderTopWidth: 1, borderTopColor: theme.border }} />
            <Pressable
              accessibilityRole="button" accessibilityLabel="Sobre o aplicativo" disabled={loading}
              onPress={() => router.push({ pathname: '/modal', params: { section: 'about' } })}
              style={({ pressed }) => [styles.row, { opacity: pressed || loading ? 0.6 : 1 }]}>
              <View style={[styles.rowIcon, { backgroundColor: theme.surfaceAlt }]}><AppIcon name="info" size={22} color={theme.primary} /></View>
              <View style={styles.rowText}><AppText style={styles.rowTitle}>Sobre o aplicativo</AppText><AppText muted style={styles.rowCaption}>Conheça o Rota Escolar Segura</AppText></View>
              <AppIcon name="arrow" size={19} color={theme.muted} />
            </Pressable>
          </Card>
          <View style={[styles.advice, { backgroundColor: theme.primarySoft }]}><AppIcon name="info" size={20} color={theme.primary} /><AppText style={{ color: theme.primary, fontSize: 12, lineHeight: 19 }}>Para alterar seus dados de acesso, procure a administração do transporte escolar.</AppText></View>
          {error ? <Notice tone="error" message={error} /> : null}
          <Button label={loading ? 'Saindo...' : 'Sair da minha conta'} variant="danger" loading={loading} onPress={() => void handleLogout()} />
          <AppText muted style={styles.footer}>Ao sair, será necessário entrar novamente com seu e-mail e sua senha.</AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flexGrow: 1, paddingBottom: 28 },
  content: { width: '100%', maxWidth: 480, paddingHorizontal: 20, alignSelf: 'center', gap: 16 },
  topBar: { minHeight: 74, borderBottomWidth: 1, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  settingsIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, heading: { gap: 5, paddingTop: 6, paddingBottom: 3 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 13 }, avatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  accountText: { flex: 1, minWidth: 0, gap: 3 }, accountTitle: { fontSize: 18, fontWeight: '800' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '700' }, rowCaption: { fontSize: 12, lineHeight: 18 },
  advice: { padding: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center', paddingHorizontal: 15 },
});
