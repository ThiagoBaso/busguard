import { useState } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Checkbox } from 'expo-checkbox';

import { Text, View } from '@/components/Themed';
import type { BoardingStudent } from '@/services/tripService';

type AlunoItemProps = {
  aluno: BoardingStudent;
  onBoardingChange?: (aluno: BoardingStudent, checkedIn: boolean) => void;
};

export default function AlunoItem({ aluno, onBoardingChange }: AlunoItemProps) {
  const [embarcado, setEmbarcado] = useState(aluno.checkedIn);
  const isAbsent = aluno.status === 'absent';
  const toggleBoarding = (checkedIn: boolean) => {
    setEmbarcado(checkedIn);
    onBoardingChange?.(aluno, checkedIn);
  };

  return (
    <View style={styles.container}>
      <View style={styles.initials}>
        <Text style={styles.initialsText}>{aluno.name.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.nome}>{aluno.name}</Text>
        <Text style={styles.id}>
          {aluno.age} anos - Parada {String(aluno.stopOrder).padStart(2, '0')} ({aluno.stopName})
        </Text>
      </View>
      <Pressable
        style={[styles.status, embarcado && styles.statusChecked, isAbsent && styles.statusAbsent]}
        onPress={() => !isAbsent && toggleBoarding(!embarcado)}>
        <Checkbox
          value={embarcado}
          disabled={isAbsent}
          onValueChange={toggleBoarding}
          color={embarcado ? '#10b981' : undefined}
        />
        <Text style={[styles.statusText, embarcado && styles.statusTextChecked]}>
          {isAbsent ? 'Ausente' : embarcado ? `Presente ${aluno.time ? `(${aluno.time})` : ''}` : 'Aguardando'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  initials: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  initialsText: {
    color: '#0369a1',
    fontWeight: '800',
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  nome: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  id: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 122,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
  },
  statusChecked: {
    backgroundColor: '#dcfce7',
  },
  statusAbsent: {
    backgroundColor: '#f1f5f9',
  },
  statusText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextChecked: {
    color: '#059669',
  },
});
