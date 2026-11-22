import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import type { BoardingStudent } from '@/services/tripService';

type AlunoItemProps = {
  aluno: BoardingStudent;
  disabled?: boolean;
  pending?: boolean;
  readOnly?: boolean;
  showStop?: boolean;
  onBoardingChange: (aluno: BoardingStudent, checkedIn: boolean) => void;
};

export default function AlunoItem({ aluno, disabled = false, pending = false, readOnly = false, showStop = true, onBoardingChange }: AlunoItemProps) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const delivered = aluno.status === 'alighted';
  const absent = aluno.status === 'absent';
  const initials = aluno.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const actionLabel = aluno.checkedIn ? 'Desembarcar' : 'Embarcar';
  const pendingLabel = aluno.checkedIn ? 'Confirmando desembarque…' : 'Confirmando embarque…';

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.profile}>
          <View style={styles.profileTop}>
            <View style={[styles.avatar, { backgroundColor: (aluno.checkedIn || delivered) ? theme.primarySoft : '#FFF7DE' }]}>
              <AppText style={{ color: (aluno.checkedIn || delivered) ? theme.primary : '#8A6500', fontWeight: '800' }}>{initials || 'A'}</AppText>
            </View>
            <View style={styles.identity}>
              <AppText style={styles.name}>{aluno.name}</AppText>
              <AppText muted style={{ fontSize: 12 }}>{aluno.age} anos{showStop && aluno.stopName ? ` · ${aluno.stopName}` : ''}</AppText>
              {(aluno.checkedIn || delivered) && aluno.time ? <AppText muted style={styles.eventTime}>{delivered ? 'Desembarque' : 'Embarque'} às {aluno.time}</AppText> : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Ocultar' : 'Mostrar'} endereço e detalhes de ${aluno.name}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [styles.detailsToggle, { opacity: pressed ? 0.65 : 1 }]}>
            <AppText style={{ color: theme.primary, fontWeight: '700', fontSize: 12 }}>{expanded ? 'Ocultar endereço' : 'Ver endereço e parada'}</AppText>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <View style={styles.statusBadge}>
            <Badge
              label={aluno.pendingReview ? 'Precisa de revisão' : absent ? 'Ausente' : delivered ? 'Desembarcou' : aluno.checkedIn ? 'A bordo' : 'Aguardando'}
              tone={aluno.pendingReview || absent || (!aluno.checkedIn && !delivered) ? 'warning' : 'success'}
            />
          </View>
          {readOnly || delivered || absent ? null : !aluno.checkedIn ? (
            <Button label={pending ? 'Confirmando…' : 'Embarcar'} accessibilityLabel={`${pending ? 'Confirmando embarque de' : 'Validar embarque de'} ${aluno.name}`} variant="success" style={styles.actionButton} disabled={disabled || aluno.pendingReview} loading={pending} onPress={() => { if (!disabled && !pending && !aluno.pendingReview) onBoardingChange(aluno, true); }} />
          ) : (
            <Button label={pending ? pendingLabel : actionLabel} accessibilityLabel={`${pending ? pendingLabel : actionLabel} de ${aluno.name}`} variant="secondary" style={styles.actionButton} disabled={disabled || pending || aluno.pendingReview} loading={pending} onPress={() => { if (!disabled && !pending && !aluno.pendingReview) onBoardingChange(aluno, false); }} />
          )}
        </View>
      </View>
      {expanded ? (
        <View style={[styles.details, { backgroundColor: theme.surfaceAlt }]}>
          <AppText variant="label" muted>Embarque</AppText>
          <AppText>{aluno.address || 'Endereço não informado'}</AppText>
          {aluno.dropoffAddress ? <AppText muted>Desembarque: {aluno.dropoffAddress}</AppText> : null}
        </View>
      ) : null}
      {absent && !readOnly ? <AppText muted>Embarque indisponível para aluno marcado como ausente.</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profile: { flex: 1, minWidth: 0, gap: 7 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { width: 136, alignItems: 'flex-end', gap: 12 },
  statusBadge: { alignSelf: 'flex-end' },
  actionButton: { width: 136, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, flexWrap: 'nowrap', borderRadius: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  identity: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontWeight: '700', fontSize: 15 },
  eventTime: { fontSize: 12 },
  detailsToggle: { marginLeft: 52, minHeight: 24, justifyContent: 'center' },
  details: { padding: 12, borderRadius: 12, gap: 5 },
});
