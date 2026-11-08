import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { getResponsibleTrip } from '@/services/tripService';
import { AppIcon } from '@/components/Brand';

export default function ResponsibleHomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { status, user } = useSession();
  const allowed = status === 'signedIn' && user?.role === 'responsible';
  const query = useTripQuery(getResponsibleTrip, allowed);
  const trip = query.data;
  const childIsBoarded = trip?.childStatus.toLocaleLowerCase('pt-BR') === 'a bordo';
  const needsReview = trip?.childStatus === 'Precisa de confirmação';
  const communicationTime = trip?.lastCommunication ? new Date(trip.lastCommunication).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const eventTime = trip?.lastEventAt ? new Date(trip.lastEventAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const tripStatus = trip?.status === 'Em transito' ? 'Em trânsito' : trip?.status;
  const consultationTime = query.updatedAt?.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });
  const onRefresh = () => { void query.refresh(); };

  return (
    <Screen withTabBar title="Acompanhe sua criança" subtitle="Mais tranquilidade em cada jornada." eyebrow="ÁREA DA FAMÍLIA" refreshing={query.refreshing} onRefresh={allowed ? onRefresh : undefined}>
      {!allowed ? (
        <StatePanel title="Acompanhamento do responsável" message="Esta área está disponível para contas de responsável." />
      ) : !trip ? (
        <StatePanel
          title={query.loading ? 'Consultando a viagem' : query.errorStatus === 404 ? 'Nenhuma viagem em andamento' : query.errorStatus === 403 ? 'Acesso não autorizado' : 'Não foi possível atualizar'}
          message={query.loading ? 'Buscando os registros da criança vinculada à sua conta.' : query.errorStatus === 404 ? 'Quando houver uma viagem ativa para a criança vinculada, os dados aparecerão aqui.' : query.errorStatus === 403 ? 'Sua conta não tem permissão para consultar este acompanhamento.' : query.error ?? 'Não foi possível atualizar os dados. Tente novamente.'}
          loading={query.loading}
          onRetry={query.loading || query.errorStatus === 403 ? undefined : onRefresh}
        />
      ) : (
        <>
          {query.error && <Notice tone="error" message={`${query.error} Os dados abaixo são da consulta anterior e podem ter mudado.`} />}
          <Card style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.heroTop}>
              <AppText variant="label" muted>ACOMPANHAMENTO DA CRIANÇA</AppText>
              <Badge label={query.error ? 'Consulta anterior' : 'Consulta concluída'} tone={query.error ? 'warning' : 'success'} />
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
            <View style={[styles.security, { backgroundColor: theme.primarySoft }]}>
              <AppIcon name="shield" size={18} color={theme.primary} />
              <AppText style={{ color: theme.primary, fontSize: 12, flex: 1 }}>Acompanhamento baseado nos registros de embarque; sem localização em tempo real.</AppText>
            </View>
            <View style={[styles.event, { borderTopColor: theme.border }]}>
              <AppText variant="label" muted>ÚLTIMO REGISTRO CONFIRMADO</AppText>
              <AppText variant="metric" style={styles.eventTime}>{eventTime ?? '—'}</AppText>
              {eventTime ? <AppText muted>Horário informado no registro.</AppText> : null}
              {!eventTime ? <AppText muted>Nenhum registro de embarque disponível.</AppText> : null}
            </View>
          </Card>

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
                <AppText variant="label" muted>MOTORISTA</AppText>
                <AppText style={{ fontWeight: '700' }}>{trip.driverName}</AppText>
                <AppText muted>{trip.vehicleLabel}</AppText>
              </View>
            </View>
          </Card>

          <Button label="Ver detalhes da viagem" disabled={Boolean(query.error)} onPress={() => router.push('/trip-details')} />
          <Card>
            <AppText variant="label">Atualização do acompanhamento</AppText>
            <AppText muted>{consultationTime ? `Última consulta concluída às ${consultationTime}.` : 'Aguardando confirmação da consulta.'}</AppText>
            <AppText muted>{communicationTime ? `Última comunicação do app do motorista: ${communicationTime}.` : 'Nenhuma comunicação recente do app do motorista foi recebida.'}</AppText>
            {query.error || trip.communicationStatus !== 'recent' ? <AppText muted>As informações podem estar desatualizadas. Em caso de dúvida, entre em contato com o transporte.</AppText> : <AppText muted>A comunicação não garante que todos os registros foram recebidos.</AppText>}
            <Button label="Atualizar acompanhamento" variant="secondary" onPress={onRefresh} loading={query.refreshing} />
          </Card>
        </>
      )}
    </Screen>
  );
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR') || '•';
}

const styles = StyleSheet.create({
  hero: { gap: 15, borderWidth: 1 },
  avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  childIdentity: { flex: 1, minWidth: 0, gap: 3 },
  statusPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14 },
  statusIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusContent: { flex: 1, minWidth: 0, gap: 3 },
  statusTitle: { fontSize: 18, fontWeight: '800' },
  security: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  event: { paddingTop: 14, borderTopWidth: 1, gap: 2 },
  eventTime: { fontSize: 25 },
  tripCard: { gap: 12 },
  routeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  divider: { borderTopWidth: 1 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  driverIdentity: { flex: 1, minWidth: 0, gap: 2 },
});
