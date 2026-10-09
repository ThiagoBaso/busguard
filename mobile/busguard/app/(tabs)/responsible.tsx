import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { ApiError } from '@/services/apiClient';
import { ResponsibleTrip, getResponsibleTrip } from '@/services/tripService';

export default function ResponsibleHomeScreen() {
  const [trip, setTrip] = useState<ResponsibleTrip | null>(null);
  const [message, setMessage] = useState('Carregando acompanhamento...');
  const active = useRef(true);
  const loading = useRef(false);

  async function loadTrip() {
    if (loading.current) return;
    loading.current = true;
    try {
      const currentTrip = await getResponsibleTrip();
      if (active.current) {
        setTrip(currentTrip);
        setMessage('');
      }
    } catch (error) {
      if (active.current) {
        setTrip(null);
        setMessage(error instanceof ApiError && error.status === 404
          ? 'Nenhuma viagem em andamento foi encontrada para a criança vinculada.'
          : 'Não foi possível consultar o acompanhamento. Verifique a conexão e tente novamente.');
      }
    } finally {
      loading.current = false;
    }
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{trip.routeName}</Text>
      <Text>{trip.status}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Criança</Text>
        <Text style={styles.value}>{trip.childName}</Text>
        <Text>{trip.childStatus}</Text>
        <Text>Último registro: {trip.lastUpdate === '--:--' ? 'Nenhum embarque registrado' : trip.lastUpdate}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Motorista</Text>
        <Text style={styles.value}>{trip.driverName}</Text>
        <Text>{trip.vehicleLabel}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 28, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { textAlign: 'center' },
  retry: { color: '#0f766e', fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, gap: 6 },
  label: { color: '#64748b' },
  value: { fontSize: 18, fontWeight: '700' },
});
