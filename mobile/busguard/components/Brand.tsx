import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useAppTheme } from '@/constants/theme';

const symbols = {
  bus: { ios: 'bus.fill', android: 'directions_bus', web: 'directions_bus' },
  person: { ios: 'person.fill', android: 'person', web: 'person' },
  route: { ios: 'map', android: 'map', web: 'map' },
  check: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  shield: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  list: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const;

export function AppIcon({ name, size = 22, color }: { name: keyof typeof symbols; size?: number; color?: ColorValue }) {
  const theme = useAppTheme();
  return <SymbolView name={symbols[name]} size={size} tintColor={color ?? theme.text}
    fallback={<Text style={{ color: color ?? theme.text, fontSize: size }} accessibilityElementsHidden>{name === 'bus' ? '▣' : name === 'arrow' ? '→' : name === 'check' ? '✓' : '◈'}</Text>} />;
}

export function Brand({ large = false }: { large?: boolean }) {
  const theme = useAppTheme();
  return <View style={styles.brand}>
    <View style={[styles.mark, large && styles.markLarge]}><AppIcon name="bus" size={large ? 31 : 21} color="#665000" /></View>
    <View><Text style={[styles.brandName, { color: theme.text }, large && { fontSize: 22 }]}>Rota Escolar</Text><Text style={[styles.brandCaption, { color: theme.text }]}>SEGURA <Text style={{ color: theme.muted }}>· BusGuard</Text></Text></View>
  </View>;
}

// Ilustração decorativa; não representa posição ou percurso real.
export function BusIllustration() {
  const theme = useAppTheme();
  return <View style={[styles.scene, { backgroundColor: theme.primarySoft }]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={styles.sun} /><View style={[styles.hill, { backgroundColor: theme.dark ? '#244a40' : '#cbe8db' }]} /><View style={styles.path} />
    <View style={styles.bus}><View style={styles.windows}>{[0, 1, 2, 3].map(key => <View key={key} style={styles.window} />)}</View><View style={styles.busLine} /><View style={[styles.wheel, { left: 24 }]} /><View style={[styles.wheel, { right: 24 }]} /></View>
    <View style={[styles.stopPole, { backgroundColor: theme.primary }]} /><View style={[styles.stopSign, { backgroundColor: theme.primary }]}><AppIcon name="bus" size={15} color={theme.dark ? '#10271f' : 'white'} /></View>
  </View>;
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mark: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#fff1bd', justifyContent: 'center', alignItems: 'center' },
  markLarge: { width: 55, height: 55, borderRadius: 18 }, brandName: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }, brandCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
  scene: { height: 164, borderRadius: 18, overflow: 'hidden', position: 'relative' }, sun: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ffe99b', position: 'absolute', right: 24, top: 19 },
  hill: { height: 120, width: '140%', position: 'absolute', left: -40, bottom: -55, borderRadius: 120, transform: [{ rotate: '-9deg' }] }, path: { position: 'absolute', height: 2, left: 20, right: 20, bottom: 26, backgroundColor: '#9ab5a7' },
  bus: { position: 'absolute', width: 168, height: 78, backgroundColor: '#f9b900', borderRadius: 15, bottom: 34, alignSelf: 'center', borderBottomWidth: 9, borderBottomColor: '#e89f00' },
  windows: { flexDirection: 'row', gap: 6, padding: 11 }, window: { flex: 1, height: 24, backgroundColor: '#27374b', borderRadius: 5 }, busLine: { height: 3, marginHorizontal: 10, backgroundColor: '#f5d46c' },
  wheel: { width: 24, height: 24, borderRadius: 12, borderWidth: 6, borderColor: '#263449', backgroundColor: '#acb6c3', position: 'absolute', bottom: -18 },
  stopPole: { width: 3, height: 52, position: 'absolute', left: 26, bottom: 26 }, stopSign: { width: 28, height: 28, borderRadius: 9, position: 'absolute', left: 14, bottom: 67, alignItems: 'center', justifyContent: 'center' },
});
