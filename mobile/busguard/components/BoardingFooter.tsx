import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/Brand';
import { AppText } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';

export default function BoardingFooter({ onNfc, disabled = false }: { onNfc: () => void; disabled?: boolean }) {
  const theme = useAppTheme();
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel="Ler tag NFC" accessibilityState={{ disabled }} disabled={disabled} onPress={onNfc} style={({ pressed }) => [styles.button, { backgroundColor: theme.primary, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
      <AppIcon name="nfc" size={21} color="#fff" /><AppText style={styles.label}>NFC</AppText>
    </Pressable>
    <View accessibilityRole="button" accessibilityLabel="QR, disponível futuramente" accessibilityState={{ disabled: true }} style={[styles.button, { backgroundColor: theme.primary }]}>
      <AppIcon name="qr" size={21} color="#fff" /><AppText style={styles.label}>QR</AppText>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 54, borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  label: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
