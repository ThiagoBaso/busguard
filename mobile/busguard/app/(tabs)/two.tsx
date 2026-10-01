import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import { ResponsibleTrip, getResponsibleTrip } from '@/services/tripService';

export default function ResponsibleHomeScreen() {
  const [trip, setTrip] = useState<ResponsibleTrip | null>(null);

  useEffect(() => {
    getResponsibleTrip().then(setTrip);
  }, []);

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text>Carregando acompanhamento...</Text>
      </View>
    );
  }

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
            <Text style={styles.subtitle}>Notificacoes / Status</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Em andamento</Text>
          </View>
        </View>

        <View style={styles.routePill}>
          <Text style={styles.routeText}>Rota da manha - {trip.schoolName}</Text>
          <Text style={styles.routeStrong}>14/18 alunos</Text>
        </View>
      </View>

      <View style={styles.mapCard}>
        <View style={styles.routeLine} />
        <View style={[styles.routeDot, styles.dotStart]} />
        <View style={[styles.routeDot, styles.dotMiddle]} />
        <View style={[styles.routeDot, styles.dotEnd]} />
        <View style={styles.busMarker}>
          <SymbolView
            name={{ android: 'directions_bus', web: 'directions_bus' }}
            size={24}
            tintColor="#0f172a"
            fallback={<Text style={styles.busFallback}>Bus</Text>}
          />
        </View>
        <Text style={styles.childTag}>Lucas a bordo</Text>
        <Text style={styles.schoolTag}>Escola Vila Verde</Text>
        <Text style={styles.homeTag}>Casa (07:18)</Text>
      </View>

      <View style={styles.safeBanner}>
        <SymbolView name={{ android: 'verified_user', web: 'verified_user' }} size={18} tintColor="#059669" fallback={<Text style={styles.safeFallback}>Ok</Text>} />
        <Text style={styles.safeText}>Em transito com total seguranca</Text>
        <Text style={styles.safeAside}>Rota monitorada</Text>
      </View>

      <View style={styles.driverCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>CS</Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{trip.driverName}</Text>
          <Text style={styles.driverVehicle}>{trip.vehicleLabel}</Text>
        </View>
        <Pressable style={styles.iconButton}>
          <SymbolView name={{ android: 'call', web: 'call' }} size={18} tintColor="#334155" fallback={<Text style={styles.actionFallback}>Tel</Text>} />
        </Pressable>
      </View>

      <View style={styles.forecastCard}>
        <Text style={styles.forecastLabel}>Previsao na escola</Text>
        <View style={styles.forecastRow}>
          <Text style={styles.eta}>{trip.eta}</Text>
          <Text style={styles.time}>({trip.lastUpdate})</Text>
          <View style={styles.nextStop}>
            <Text style={styles.nextLabel}>Proxima parada</Text>
            <Text style={styles.nextAddress}>{trip.nextStop}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryAction}>
          <SymbolView name={{ android: 'timeline', web: 'timeline' }} size={18} tintColor="#111827" fallback={<Text style={styles.darkFallback}>St</Text>} />
          <Text style={styles.primaryActionText}>Status do embarque</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction}>
          <SymbolView name={{ android: 'message', web: 'message' }} size={18} tintColor="#334155" fallback={<Text style={styles.actionFallback}>Msg</Text>} />
          <Text style={styles.secondaryActionText}>Mensagem</Text>
        </Pressable>
      </View>

      <View style={styles.childCard}>
        <View style={styles.childIcon}>
          <SymbolView name={{ android: 'person', web: 'person' }} size={20} tintColor="#f59e0b" fallback={<Text style={styles.iconFallback}>P</Text>} />
        </View>
        <View style={styles.childInfo}>
          <Text style={styles.childName}>{trip.childName}</Text>
          <Text style={styles.childStatus}>Embarque as 07:18 - Assento 04</Text>
        </View>
        <Text style={styles.presentPill}>Presente</Text>
      </View>
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
  mapCard: {
    height: 260,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#d8e7ee',
    marginBottom: 10,
  },
  routeLine: {
    position: 'absolute',
    left: 55,
    top: 162,
    width: 230,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0ea5e9',
    transform: [{ rotate: '-22deg' }],
  },
  routeDot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  dotStart: {
    left: 38,
    top: 184,
  },
  dotMiddle: {
    left: 154,
    top: 137,
  },
  dotEnd: {
    right: 34,
    top: 92,
  },
  busMarker: {
    position: 'absolute',
    left: 122,
    top: 118,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8bd16',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  busFallback: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '900',
  },
  childTag: {
    position: 'absolute',
    left: 104,
    top: 174,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111827',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  schoolTag: {
    position: 'absolute',
    right: 18,
    top: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeTag: {
    position: 'absolute',
    left: 36,
    bottom: 22,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  safeBanner: {
    minHeight: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  safeText: {
    flex: 1,
    color: '#059669',
    fontSize: 13,
    fontWeight: '800',
  },
  safeFallback: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
  },
  safeAside: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  avatarText: {
    color: '#0369a1',
    fontWeight: '800',
  },
  driverInfo: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: 'transparent',
  },
  driverName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  driverVehicle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  actionFallback: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
  },
  forecastCard: {
    borderRadius: 8,
    backgroundColor: '#e9eef8',
    padding: 14,
    marginBottom: 10,
  },
  forecastLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  eta: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
  },
  time: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 4,
    marginBottom: 5,
  },
  nextStop: {
    flex: 1,
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  nextLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  nextAddress: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'transparent',
    marginBottom: 10,
  },
  primaryAction: {
    flex: 1,
    height: 54,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8bd16',
  },
  primaryActionText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  darkFallback: {
    color: '#111827',
    fontSize: 10,
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    height: 54,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dbeafe',
  },
  secondaryActionText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
  },
  childIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef3c7',
  },
  childInfo: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: 'transparent',
  },
  childName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  childStatus: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  presentPill: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#dcfce7',
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
