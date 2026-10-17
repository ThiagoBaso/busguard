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
  onBoardingChange: (aluno: BoardingStudent, checkedIn: boolean) => void;
};

export default function AlunoItem({ aluno, disabled = false, pending = false, readOnly = false, onBoardingChange }: AlunoItemProps) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const absent = aluno.status === 'absent';
  const initials = aluno.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <Card>
      <View style={styles.heading}>
        <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
          <AppText style={{ color: theme.primary, fontWeight: '800' }}>{initials || 'A'}</AppText>
        </View>
        <View style={styles.identity}>
          <AppText style={styles.name}>{aluno.name}</AppText>
          <AppText muted style={{ fontSize: 12 }}>{aluno.age} anos{aluno.stopName ? ` · ${aluno.stopName}` : ''}</AppText>
        </View>
      </View>
      <View style={styles.status}>
        <Badge label={absent ? 'Ausente' : aluno.checkedIn ? 'A bordo' : 'Aguardando'} tone={aluno.checkedIn ? 'success' : 'neutral'} />
        {aluno.checkedIn && aluno.time ? <AppText muted>Embarque às {aluno.time}</AppText> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Ocultar' : 'Mostrar'} detalhes de ${aluno.name}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.detailsToggle, { borderColor: theme.border, opacity: pressed ? 0.65 : 1 }]}>
        <AppText style={{ color: theme.primary, fontWeight: '700' }}>{expanded ? 'Ocultar detalhes −' : 'Ver detalhes +'}</AppText>
      </Pressable>
      {expanded ? (
        <View style={[styles.details, { backgroundColor: theme.surfaceAlt }]}>
          <AppText variant="label" muted>Endereço cadastrado</AppText>
          <AppText>{aluno.address || 'Endereço não informado'}</AppText>
          {aluno.stopName ? <AppText muted>Local informado: {aluno.stopName}</AppText> : null}
        </View>
      ) : null}
      {readOnly ? null : absent ? <AppText muted>Embarque indisponível para aluno marcado como ausente.</AppText> : (
        <Button
          label={aluno.checkedIn ? 'Registrar desembarque' : 'Validar embarque'}
          accessibilityLabel={`${aluno.checkedIn ? 'Registrar desembarque de' : 'Validar embarque de'} ${aluno.name}`}
          variant={aluno.checkedIn ? 'secondary' : 'primary'}
          disabled={disabled || pending}
          loading={pending}
          onPress={() => { if (!disabled && !pending) onBoardingChange(aluno, !aluno.checkedIn); }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  identity: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontWeight: '700', fontSize: 15 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  detailsToggle: { minHeight: 44, paddingVertical: 10, borderTopWidth: 1, justifyContent: 'center' },
  details: { padding: 12, borderRadius: 12, gap: 5 },
});
