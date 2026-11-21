import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/Brand';
import { AppText } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';

type BoardingMethodsProps = {
  onCall: () => void;
  disabled?: boolean;
  loading?: boolean;
  callLabel?: string;
  accessibilityLabel?: string;
  onNfc?: () => void;
  onQr?: () => void;
};

export default function BoardingMethods({ onCall, onNfc, onQr, disabled = false, loading = false, callLabel = 'Chamada', accessibilityLabel }: BoardingMethodsProps) {
  const theme = useAppTheme();
  const backgroundColor = theme.primary;
  const foregroundColor = theme.dark ? '#10271f' : '#ffffff';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? callLabel}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        disabled={disabled || loading}
        onPress={onCall}
        style={({ pressed }) => [styles.method, styles.callMethod, { backgroundColor, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 }]}>
        {loading ? <ActivityIndicator color={foregroundColor} /> : <AppIcon name="checklist" size={23} color={foregroundColor} />}
        <AppText style={[styles.label, { color: foregroundColor }]}>{callLabel}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ler tag NFC" accessibilityState={{ disabled: !onNfc || disabled || loading }} disabled={!onNfc || disabled || loading} onPress={onNfc} style={({ pressed }) => [styles.method, styles.futureMethod, { backgroundColor, opacity: !onNfc || disabled || loading ? 0.5 : pressed ? 0.8 : 1 }]}>
        <AppIcon name="nfc" size={23} color={foregroundColor} />
        <AppText style={[styles.label, { color: foregroundColor }]}>NFC</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ler QR Code" accessibilityState={{ disabled: !onQr || disabled || loading }} disabled={!onQr || disabled || loading} onPress={onQr} style={({ pressed }) => [styles.method, styles.futureMethod, { backgroundColor, opacity: !onQr || disabled || loading ? 0.5 : pressed ? 0.8 : 1 }]}>
        <AppIcon name="qr" size={23} color={foregroundColor} />
        <AppText style={[styles.label, { color: foregroundColor }]}>QR</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, width: '100%' },
  method: { minHeight: 59, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  callMethod: { flex: 2 },
  futureMethod: { flex: 0.85 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
