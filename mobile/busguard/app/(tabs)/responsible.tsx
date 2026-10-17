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
  const consultationTime = query.updatedAt?.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
              <AppText variant="label" muted>CRIANÇA VINCULADA</AppText>
              <Badge label={query.error ? 'Consulta anterior' : 'Viagem ativa'} tone={query.error ? 'warning' : 'success'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={[styles.avatar, { backgroundColor: theme.surfaceAlt }]}><AppIcon name="person" color={theme.primary} /></View><View style={{ flex: 1 }}><AppText variant="title">{trip.childName}</AppText><AppText muted>Transporte escolar</AppText></View></View>
            <View style={styles.statusLine}>
              <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.statusDot, { backgroundColor: trip.childStatus === 'A bordo' ? theme.success : theme.accent }]} />
              <AppText variant="title" style={styles.statusText}>{trip.childStatus}</AppText>
            </View>
            <View style={[styles.security, { backgroundColor: theme.primarySoft }]}><AppIcon name="shield" size={18} color={theme.primary} /><AppText style={{ color: theme.primary, fontSize: 12 }}>Acompanhamento pelos registros da viagem</AppText></View>
            <View style={[styles.event, { borderTopColor: theme.border }]}>
              <AppText variant="label">Último registro</AppText>
              <AppText>{trip.lastUpdate === '--:--' ? 'Nenhum registro disponível' : trip.lastUpdate}</AppText>
            </View>
          </Card>

          <View style={styles.cards}>
            <Card style={styles.summaryCard}>
              <AppText variant="label" muted>VIAGEM</AppText>
              <AppText style={{ fontSize: 18, fontWeight: '700' }}>{trip.routeName}</AppText>
              <Badge label={trip.status} tone="neutral" />
            </Card>
            <Card style={styles.summaryCard}>
              <AppText variant="label" muted>MOTORISTA</AppText>
              <AppText style={{ fontSize: 18, fontWeight: '700' }}>{trip.driverName}</AppText>
              <AppText muted>{trip.vehicleLabel}</AppText>
            </Card>
          </View>

          <Button label="Ver detalhes da viagem" disabled={Boolean(query.error)} onPress={() => router.push('/trip-details')} />
          <Card>
            <AppText variant="label">Atualização do acompanhamento</AppText>
            <AppText muted>{consultationTime ? `Última consulta bem-sucedida às ${consultationTime}.` : 'Aguardando confirmação da consulta.'}</AppText>
            <AppText muted>Os dados se atualizam enquanto você acompanha esta tela.</AppText>
            <Button label="Atualizar acompanhamento" variant="secondary" onPress={onRefresh} loading={query.refreshing} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 16, borderWidth: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  security: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { flex: 1, minWidth: 0 },
  event: { paddingTop: 16, borderTopWidth: 1, gap: 6 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  summaryCard: { flexBasis: 260, flexGrow: 1, minWidth: 0, gap: 10 },
});
