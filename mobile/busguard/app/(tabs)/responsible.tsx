import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { getResponsiblePassengers, type ResponsiblePassenger, type ResponsibleTrip } from '@/services/tripService';
import { AppIcon } from '@/components/Brand';
import TripMapView from '@/components/TripMapView';

export default function ResponsibleHomeScreen() {
  const { status, user } = useSession();
  const allowed = status === 'signedIn' && user?.role === 'responsible';
  const query = useTripQuery(getResponsiblePassengers, allowed);
  const onRefresh = () => { void query.refresh(); };
  const groups = new Map<number, ResponsiblePassenger[]>();
  const withoutTrip: ResponsiblePassenger[] = [];
  for (const passenger of query.data ?? []) {
    if (!passenger.trip) { withoutTrip.push(passenger); continue; }
    const group = groups.get(passenger.trip.id) ?? [];
    group.push(passenger);
    groups.set(passenger.trip.id, group);
  }

  return (
    <Screen withTabBar hideHeader title="Acompanhe sua criança" refreshing={query.refreshing} onRefresh={allowed ? onRefresh : undefined}>
      {!allowed ? (
        <StatePanel title="Acompanhamento do responsável" message="Esta área está disponível para contas de responsável." />
      ) : !query.data ? (
        <StatePanel
          title={query.loading ? 'Consultando a viagem' : query.errorStatus === 404 ? 'Nenhuma viagem em andamento' : query.errorStatus === 403 ? 'Acesso não autorizado' : 'Não foi possível atualizar'}
          message={query.loading ? 'Buscando os registros da criança vinculada à sua conta.' : query.errorStatus === 404 ? 'Quando houver uma viagem ativa para a criança vinculada, os dados aparecerão aqui.' : query.errorStatus === 403 ? 'Sua conta não tem permissão para consultar este acompanhamento.' : query.error ?? 'Não foi possível atualizar os dados. Tente novamente.'}
          loading={query.loading}
          onRetry={query.loading || query.errorStatus === 403 ? undefined : onRefresh}
        />
      ) : (
        <>
          {query.error && <Notice tone="error" message={`${query.error} Os dados abaixo são da consulta anterior e podem ter mudado.`} />}
          {query.data.length === 0 ? <StatePanel title="Nenhum passageiro vinculado" message="Entre em contato com o transporte para conferir seu cadastro." /> : <>
            {Array.from(groups, ([tripId, passengers]) => <TripGroup key={tripId} passengers={passengers} hasError={Boolean(query.error)} />)}
            {withoutTrip.map(passenger => <Card key={passenger.id}><AppText variant="label" muted>ACOMPANHAMENTO DE PASSAGEIRO</AppText><AppText variant="title">{passenger.name}</AppText><AppText muted>Nenhuma viagem em andamento para este passageiro.</AppText></Card>)}
          </>}
        </>
      )}
    </Screen>
  );
}

function PassengerCard({ trip }: { trip: ResponsibleTrip }) {
  const theme = useAppTheme();
  const childIsBoarded = trip.childStatus.toLocaleLowerCase('pt-BR') === 'a bordo';
  const needsReview = trip.childStatus === 'Precisa de confirmação';
  return <View style={styles.passengerGroup}>
          <Card style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.heroTop}>
              <AppText variant="label" muted style={styles.heroLabel}>ACOMPANHAMENTO DE PASSAGEIRO</AppText>
            </View>
            <View style={styles.childHeader}>
              <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                <AppText style={{ color: theme.primary, fontWeight: '800' }}>{getInitials(trip.childName)}</AppText>
              </View>
              <View style={styles.childIdentity}>
                <AppText variant="title">{trip.childName}</AppText>
                <AppText muted>Transporte escolar</AppText>
              </View>
            </View>
            <View style={[styles.statusPanel, { backgroundColor: childIsBoarded ? theme.primarySoft : theme.surfaceAlt }]}>
              <View style={[styles.statusIcon, { backgroundColor: theme.surface }]}>
                <AppIcon name={childIsBoarded ? 'check' : 'clock'} size={21} color={childIsBoarded ? theme.success : theme.accent} />
              </View>
              <View style={styles.statusContent}>
                <AppText variant="label" muted>STATUS DO EMBARQUE</AppText>
                <AppText style={styles.statusTitle}>{trip.childStatus}</AppText>
                <AppText muted>{needsReview ? 'Há um registro aguardando revisão. Confirme com o transporte.' : childIsBoarded ? 'O último registro confirma o embarque.' : trip.childStatus === 'Desembarcou' ? 'O último registro confirma o desembarque.' : 'Nenhum embarque confirmado nesta viagem.'}</AppText>
              </View>
            </View>
            <View style={[styles.timeline, { borderTopColor: theme.border }]}>
              {[
                { label: 'Embarcado', time: trip.boardedAt, done: Boolean(trip.boardedAt) },
                { label: 'Em trânsito', time: null, done: childIsBoarded || Boolean(trip.alightedAt) },
                { label: 'Desembarcado', time: trip.alightedAt, done: Boolean(trip.alightedAt) },
              ].map((step, index) => <View key={step.label} style={styles.step}>
                <View style={styles.stepLine}>
                  {index > 0 ? <View style={[styles.line, { backgroundColor: step.done ? theme.primary : theme.border }]} /> : <View style={styles.line} />}
                  <View style={[styles.dot, { backgroundColor: step.done ? theme.primary : theme.surfaceAlt, borderColor: step.done ? theme.primary : theme.border }]}>
                    {step.done ? <AppIcon name="check" size={15} color="#ffffff" /> : null}
                  </View>
                  {index < 2 ? <View style={[styles.line, { backgroundColor: step.done ? theme.primary : theme.border }]} /> : <View style={styles.line} />}
                </View>
                <AppText style={styles.stepLabel}>{step.label}</AppText>
                {step.time ? <AppText muted style={styles.stepTime}>{formatEventTime(step.time)}</AppText> : null}
              </View>)}
            </View>
          </Card>
        </View>;
}

function TripGroup({ passengers, hasError }: { passengers: ResponsiblePassenger[]; hasError: boolean }) {
  const router = useRouter();
  const theme = useAppTheme();
  const trip = passengers[0].trip!;
  const onboard = passengers.filter(passenger => passenger.trip?.childStatus.toLocaleLowerCase('pt-BR') === 'a bordo');
  const location = !hasError ? onboard.find(passenger => passenger.trip?.location)?.trip?.location : null;
  const locationDate = location ? new Date(location.recordedAt) : null;
  const locationValid = locationDate && Number.isFinite(locationDate.getTime());
  const locationStale = !locationValid || Date.now() - locationDate.getTime() > 60000 || locationDate.getTime() > Date.now() + 30000;
  const mapUnavailable = Platform.OS === 'android' && process.env.EXPO_PUBLIC_DISABLE_NATIVE_MAP === '1';
  const tripStatus = trip.status === 'Em transito' ? 'Em trânsito' : trip.status;
  return <View style={styles.passengerGroup}>
          {passengers.map(passenger => <PassengerCard key={passenger.id} trip={passenger.trip!} />)}
          {onboard.length > 0 ? <Card style={styles.location}>
            {hasError ? <AppText muted>Localização indisponível. Não foi possível atualizar os dados.</AppText>
              : !location ? <AppText muted>Aguardando o motorista compartilhar a localização.</AppText>
              : <>
                <AppText muted>{locationStale ? 'Última localização recebida' : 'Localização atualizada'}{locationValid ? ` às ${locationDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}{locationStale ? ' · pode estar desatualizada' : ''}.</AppText>
                <View style={[styles.locationDivider, { borderTopColor: theme.border }]} />
                {mapUnavailable ? <AppText muted>Mapa indisponível nesta versão de teste.</AppText> : <TripMapView stops={[]} position={location} positionLabel="Veículo" route={[]} routed={false} nextRoute={[]} nextRouteRouted={false} followVehicle focusRequest={0} />}
              </>}
          </Card> : null}
          <Card style={styles.tripCard}>
            <View style={styles.routeTop}>
              <AppText variant="label" muted>ROTA ATUAL</AppText>
              <Badge label={tripStatus ?? trip.status} tone="neutral" />
            </View>
            <AppText variant="title" style={{ fontSize: 19 }}>{trip.routeName}</AppText>
            <View style={[styles.divider, { borderTopColor: theme.border }]} />
            <View style={styles.driverRow}>
              <View style={[styles.driverAvatar, { backgroundColor: theme.surfaceAlt }]}>
                <AppText style={{ color: theme.primary, fontWeight: '800' }}>{getInitials(trip.driverName)}</AppText>
              </View>
              <View style={styles.driverIdentity}>
                <View style={styles.driverHeading}>
                  <AppText variant="label" muted>MOTORISTA</AppText>
                  {trip.driverUserId > 0 && <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar mensagem ao motorista ${trip.driverName}`}
                    hitSlop={6}
                    onPress={() => router.navigate({ pathname: '/(tabs)/messages', params: { driverUserId: String(trip.driverUserId) } })}
                    style={({ pressed }) => [styles.driverChat, { backgroundColor: pressed ? theme.surfaceAlt : theme.primarySoft }]}
                  >
                    <AppIcon name="message" size={19} color={theme.primary} />
                  </Pressable>}
                </View>
                <AppText style={{ fontWeight: '700' }}>{trip.driverName}</AppText>
                <AppText muted>{trip.vehicleLabel}</AppText>
              </View>
            </View>
          </Card>

        </View>;
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR') || '•';
}

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Horário indisponível';
}

const styles = StyleSheet.create({
  passengerGroup: { gap: 12 },
  hero: { gap: 15, borderWidth: 1 },
  avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  childIdentity: { flex: 1, minWidth: 0, gap: 3 },
  statusPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14 },
  statusIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusContent: { flex: 1, minWidth: 0, gap: 3 },
  statusTitle: { fontSize: 18, fontWeight: '800' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heroLabel: { flex: 1, minWidth: 0 },
  timeline: { flexDirection: 'row', paddingTop: 16, borderTopWidth: 1 },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  stepLine: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { height: 2, flex: 1 },
  dot: { width: 27, height: 27, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  stepTime: { fontSize: 11, textAlign: 'center' },
  location: { gap: 8 },
  locationDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
  tripCard: { gap: 12 },
  routeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  divider: { borderTopWidth: 1 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  driverIdentity: { flex: 1, minWidth: 0, gap: 2 },
  driverHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  driverChat: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
