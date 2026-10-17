import { View } from 'react-native';
import { Card, AppText, Badge, Button } from '@/components/ui';

// Componente iniciado pelo Coder local; interfaces corrigidas na integração.
export default function TripSummary({ routeName, vehicleLabel, status, onDetails, disabled = false }: {
  routeName: string; vehicleLabel: string; status: string; onDetails: () => void; disabled?: boolean;
}) {
  return <Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      <AppText variant="label" muted>ROTA ATUAL</AppText>
      <Badge label={status} tone="success" />
    </View>
    <AppText variant="title" style={{ fontSize: 19 }}>{routeName}</AppText>
    <AppText muted>{vehicleLabel}</AppText>
    <Button label="Ver detalhes da viagem" variant="secondary" onPress={onDetails} disabled={disabled} />
  </Card>;
}
