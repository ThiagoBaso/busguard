import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import AlunoItem from '@/components/AlunoItem';
import { Text, View } from '@/components/Themed';
import { ApiError } from '@/services/apiClient';
import { BoardingStudent, DriverTrip, getDriverTrip, updateBoardingStatus } from '@/services/tripService';

export default function DriverHomeScreen() {
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [message, setMessage] = useState('Carregando viagem...');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const active = useRef(true);
  const pending = useRef(false);
  const request = useRef<Promise<void> | null>(null);

  function loadTrip(force = false): Promise<void> {
    if (pending.current && !force) return Promise.resolve();
    if (request.current) return request.current;
    const task = (async () => {
      try {
        const currentTrip = await getDriverTrip();
        if (active.current) {
          setTrip(currentTrip);
          setMessage('');
        }
      } catch (error) {
        if (active.current) {
          setTrip(null);
          setMessage(error instanceof ApiError && error.status === 404
            ? 'Nenhuma viagem em andamento foi atribuída a você.'
            : 'Não foi possível consultar a viagem. Verifique a conexão e tente novamente.');
        }
      }
    })();
    request.current = task.finally(() => { request.current = null; });
    return request.current;
  }

  useEffect(() => {
    active.current = true;
    void loadTrip();
    const intervalId = setInterval(() => void loadTrip(), 15000);
    return () => {
      active.current = false;
      clearInterval(intervalId);
    };
  }, []);

  async function handleBoardingChange(student: BoardingStudent, checkedIn: boolean) {
    if (!trip?.id || pending.current) return;
    pending.current = true;
    setPendingId(student.id);
    try {
      await updateBoardingStatus(trip.id, student.id, checkedIn);
      if (request.current) await request.current;
      await loadTrip(true);
    } catch {
      if (active.current) {
        setTrip(null);
        setMessage('Não foi possível confirmar o embarque. Consulte a viagem novamente.');
      }
    } finally {
      pending.current = false;
      if (active.current) setPendingId(null);
    }
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{message}</Text>
        <Pressable onPress={() => void loadTrip()} accessibilityRole="button">
          <Text style={styles.retry}>Atualizar</Text>
        </Pressable>
      </View>
    );
  }

  const checkedCount = trip.students.filter((student) => student.checkedIn).length;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{trip.routeName}</Text>
      <Text>{trip.status} · {trip.vehicleLabel}</Text>
      <Text style={styles.summary}>{checkedCount} de {trip.students.length} alunos embarcados</Text>
      {trip.students.map((student) => (
        <AlunoItem
          key={student.id}
          aluno={student}
          disabled={pendingId !== null}
          onBoardingChange={handleBoardingChange}
        />
      ))}
      {trip.students.length === 0 ? <Text>Nenhum aluno vinculado a esta rota.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 28, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { textAlign: 'center' },
  retry: { color: '#0f766e', fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800' },
  summary: { marginVertical: 10, fontWeight: '700' },
});
