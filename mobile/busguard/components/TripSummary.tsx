import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/Brand';
import { AppText, Badge, Button, Card } from '@/components/ui';

const statusLabels: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  'in progress': 'Em andamento',
  'em transito': 'Em trânsito',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export default function TripSummary({ routeName, vehicleLabel, status, onDetails, disabled = false, compact = false }: {
  routeName: string;
  vehicleLabel: string;
  status: string;
  onDetails: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const normalizedStatus = status.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/_/g, ' ');
  const label = statusLabels[normalizedStatus] ?? status;
  const active = normalizedStatus === 'in progress' || normalizedStatus === 'em transito';

  return (
    <Card style={[styles.card, compact && styles.compact]}>
      <View style={styles.routeRow}>
        <View style={styles.iconWrap}>
          <AppIcon name="bus" size={21} color="#876700" />
        </View>
        <View style={styles.identity}>
          <AppText variant="label" muted>ROTA ATUAL</AppText>
          <AppText variant="title" style={styles.routeName}>{routeName}</AppText>
          <AppText muted>{vehicleLabel}</AppText>
        </View>
        <Badge label={label} tone={active ? 'success' : 'neutral'} />
      </View>
      {!compact ? <Button label="Ver detalhes da rota" variant="secondary" onPress={onDetails} disabled={disabled} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, borderRadius: 18 },
  compact: { gap: 0, paddingVertical: 12 },
  routeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 11 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFF2C4', alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 120, gap: 2 },
  routeName: { fontSize: 18, lineHeight: 24 },
});
