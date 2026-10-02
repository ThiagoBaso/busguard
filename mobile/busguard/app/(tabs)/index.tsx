import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';

import AlunoItem from '@/components/AlunoItem';
import { Text, View } from '@/components/Themed';
import { BoardingStudent, DriverTrip, getDriverTrip, updateBoardingStatus } from '@/services/tripService';

export default function DriverHomeScreen() {
  const [trip, setTrip] = useState<DriverTrip | null>(null);

  useEffect(() => {
    let mounted = true;

    function loadTrip() {
      getDriverTrip().then((nextTrip) => {
        if (mounted) {
          setTrip(nextTrip);
        }
      });
    }

    loadTrip();
    const intervalId = setInterval(loadTrip, 15000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  function handleBoardingChange(student: BoardingStudent, checkedIn: boolean) {
    if (!trip?.id) {
      return;
    }

    setTrip({
      ...trip,
      students: trip.students.map((currentStudent) =>
        currentStudent.id === student.id
          ? { ...currentStudent, checkedIn, status: checkedIn ? 'present' : 'waiting' }
          : currentStudent,
      ),
    });

    updateBoardingStatus(trip.id, student.id, checkedIn).catch(() => {
      setTrip(trip);
    });
  }

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text>Carregando rota...</Text>
      </View>
    );
  }

  const checkedCount = trip.students.filter((student) => student.checkedIn).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBadge}>
            <SymbolView
              name={{ android: 'directions_bus', web: 'directions_bus' }}
              size={22}
              tintColor="#f59e0b"
              fallback={<Text style={styles.iconFallback}>Bus</Text>}
            />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{trip.routeName}</Text>
            <Text style={styles.subtitle}>Alunos / Chamada</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{trip.status}</Text>
          </View>
        </View>

        <View style={styles.routePill}>
          <Text style={styles.routeText}>Rota da manha - {trip.schoolName}</Text>
          <Text style={styles.routeStrong}>{trip.vehicleLabel}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCardGreen}>
          <Text style={styles.metricLabel}>Presentes</Text>
          <Text style={styles.metricValue}>{checkedCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Faltando</Text>
          <Text style={styles.metricValue}>{trip.students.length - checkedCount}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <SymbolView name={{ android: 'search', web: 'search' }} size={18} tintColor="#64748b" fallback={<Text style={styles.searchFallback}>?</Text>} />
        <Text style={styles.searchText}>Buscar por nome do aluno...</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ordem de paradas</Text>
        <Text style={styles.liveText}>Leitor ativo</Text>
      </View>

      <FlatList
        scrollEnabled={false}
        data={trip.students}
        renderItem={({ item }) => <AlunoItem aluno={item} onBoardingChange={handleBoardingChange} />}
        keyExtractor={(item) => item.id}
      />

      <View style={styles.nextStop}>
        <View style={{backgroundColor: 'transparent'}}>
          <Text style={styles.nextLabel}>Proxima parada</Text>
          <Text style={styles.nextName}>{trip.nextStop.name}</Text>
          <Text style={styles.nextAddress}>{trip.nextStop.address}</Text>
        </View>
        <Text style={styles.nextTime}>3 min</Text>
      </View>

      <Pressable style={styles.primaryButton}>
        <SymbolView name={{ android: 'checklist', web: 'checklist' }} size={18} tintColor="#ffffff" fallback={<Text style={styles.buttonFallback}>Ok</Text>} />
        <Text style={styles.primaryButtonText}>Validar chamada</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef3c7',
  },
  iconFallback: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
  },
  titleBlock: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: 'transparent',
  },
  title: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '800',
  },
  routePill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: '#eaf2ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  routeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  routeStrong: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  metricCardGreen: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#e8f8f0',
    padding: 16,
  },
  metricCard: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#eef2f7',
    padding: 16,
  },
  metricLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  metricValue: {
    color: '#0f766e',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  searchBox: {
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: '#e9eef8',
    marginBottom: 16,
  },
  searchText: {
    color: '#64748b',
    fontSize: 14,
  },
  searchFallback: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  liveText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  nextStop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    padding: 16,
    marginTop: 4,
  },
  nextLabel: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  nextName: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  nextAddress: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  nextTime: {
    color: '#d97706',
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    height: 56,
    borderRadius: 8,
    backgroundColor: '#047857',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonFallback: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
});
