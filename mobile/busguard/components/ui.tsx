import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';
import { Brand } from '@/components/Brand';

export function Screen({ title, subtitle, eyebrow, children, refreshing = false, onRefresh, withTabBar = false }: {
  title: string; subtitle?: string; eyebrow?: string; children: ReactNode;
  refreshing?: boolean; onRefresh?: () => void; withTabBar?: boolean;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingBottom: withTabBar ? 24 : Math.max(24, insets.bottom + 16) }]}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} /> : undefined}>
        <View style={styles.container}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}><Brand /><View style={[styles.miniBadge, { backgroundColor: theme.primarySoft }]}><Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>TRANSPORTE ESCOLAR</Text></View></View>
          <View style={styles.header}>
            {eyebrow ? <AppText variant="label" muted>{eyebrow}</AppText> : null}
            <AppText variant="title" accessibilityRole="header">{title}</AppText>
            {subtitle ? <AppText muted>{subtitle}</AppText> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppText({ children, muted = false, variant = 'body', style, accessibilityRole }: {
  children: ReactNode; muted?: boolean; variant?: 'body' | 'title' | 'label' | 'metric';
  style?: StyleProp<TextStyle>; accessibilityRole?: 'header' | 'text';
}) {
  const theme = useAppTheme();
  return <Text accessibilityRole={accessibilityRole} style={[styles.text, styles[variant], { color: muted ? theme.muted : theme.text }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function Button({ label, onPress, disabled = false, loading = false, variant = 'primary', accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; accessibilityLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}) {
  const theme = useAppTheme();
  const background = variant === 'primary' ? theme.accent : variant === 'success' ? theme.primary : variant === 'danger' ? theme.danger : theme.surfaceAlt;
  const foreground = variant === 'primary' ? '#352900' : variant === 'success' || variant === 'danger' ? (theme.dark ? '#10271f' : '#ffffff') : theme.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 }]}>
      {loading ? <ActivityIndicator color={foreground} /> : null}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'neutral' }) {
  const theme = useAppTheme();
  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.text : theme.muted;
  const backgroundColor = tone === 'success' ? theme.primarySoft : tone === 'warning' ? theme.accent : theme.surfaceAlt;
  return <View style={[styles.badge, { backgroundColor }]}><Text style={[styles.badgeLabel, { color: tone === 'warning' ? '#33290c' : color }]}>{label}</Text></View>;
}

export function Notice({ message, tone = 'info' }: { message: string; tone?: 'error' | 'info' }) {
  const theme = useAppTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.surfaceAlt, borderColor: tone === 'error' ? theme.danger : theme.border }]}><AppText style={{ color: tone === 'error' ? theme.danger : theme.text }}>{message}</AppText></View>;
}

export function StatePanel({ title, message, loading = false, onRetry }: { title: string; message: string; loading?: boolean; onRetry?: () => void }) {
  const theme = useAppTheme();
  return <Card style={styles.state}><View style={[styles.stateIcon, { backgroundColor: theme.primarySoft }]}>{loading ? <ActivityIndicator color={theme.primary} size="large" /> : <AppText variant="metric" style={{ color: theme.primary }}>—</AppText>}</View><AppText variant="title" style={{ fontSize: 22, textAlign: 'center' }}>{title}</AppText><AppText muted style={{ textAlign: 'center' }}>{message}</AppText>{onRetry ? <Button label="Tentar novamente" onPress={onRetry} variant="secondary" /> : null}</Card>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flexGrow: 1, paddingBottom: 24 },
  container: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 18, gap: 13 },
  topBar: { paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  miniBadge: { borderRadius: 7, padding: 6 },
  header: { paddingTop: 9, paddingBottom: 3, gap: 6 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 9, height: 9, borderRadius: 3 }, text: { flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21 }, title: { fontSize: 22, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5 },
  label: { fontSize: 11, lineHeight: 17, fontWeight: '700', letterSpacing: 0.7 }, metric: { fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  card: { borderWidth: 1, borderRadius: 15, padding: 16, gap: 10 },
  button: { minHeight: 48, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonLabel: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, maxWidth: '100%' },
  badgeLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' }, notice: { padding: 15, borderWidth: 1, borderRadius: 14 },
  state: { alignItems: 'center', paddingVertical: 36 }, stateIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
