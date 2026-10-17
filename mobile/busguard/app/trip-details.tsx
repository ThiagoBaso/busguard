import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { getResponsibleTrip } from '@/services/tripService';

export default function TripDetailsScreen() {
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
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(allowed ? '/(tabs)/responsible' : '/(tabs)/config');
  };

  return (
    <Screen title="Detalhes da viagem" subtitle="Informações do transporte e do último registro disponível." eyebrow="ACOMPANHAMENTO" refreshing={query.refreshing} onRefresh={allowed ? onRefresh : undefined}>
      <Button label="Voltar" variant="secondary" onPress={goBack} />
      {!allowed ? (
        <StatePanel title="Acesso restrito" message="Os detalhes do acompanhamento estão disponíveis para contas de responsável." />
      ) : !trip ? (
        <StatePanel
          title={query.loading ? 'Consultando os detalhes' : query.errorStatus === 404 ? 'Nenhuma viagem em andamento' : query.errorStatus === 403 ? 'Acesso não autorizado' : 'Não foi possível consultar a viagem'}
          message={query.loading ? 'Buscando as informações autorizadas da sua conta.' : query.errorStatus === 404 ? 'Não há viagem ativa disponível para a criança vinculada. Volte ao acompanhamento ou tente novamente mais tarde.' : query.errorStatus === 403 ? 'Sua conta não tem permissão para consultar estes detalhes.' : query.error ?? 'Não foi possível atualizar os dados. Tente novamente.'}
          loading={query.loading}
          onRetry={query.loading || query.errorStatus === 403 ? undefined : onRefresh}
        />
      ) : (
        <>
          {query.error && <Notice tone="error" message={`${query.error} Estes são os dados da última consulta bem-sucedida e podem estar desatualizados.`} />}
          <Card style={[styles.hero, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
            <AppText variant="label" muted>CRIANÇA VINCULADA</AppText>
            <AppText variant="title">{trip.childName}</AppText>
            <Badge label={trip.childStatus} tone={trip.childStatus === 'A bordo' ? 'success' : 'warning'} />
            {query.error && <Badge label="Consulta anterior" tone="warning" />}
            <AppText muted>O estado é baseado nos registros de embarque e desembarque enviados pelo transporte.</AppText>
          </Card>

          <Card>
            <AppText variant="label" muted>INFORMAÇÕES DA VIAGEM</AppText>
            <Detail label="Rota" value={trip.routeName} />
            <Detail label="Estado da viagem" value={trip.status} />
            <Detail label="Motorista" value={trip.driverName} />
            <Detail label="Veículo" value={trip.vehicleLabel} />
          </Card>

          <View style={styles.cards}>
            <Card style={styles.timeCard}>
              <AppText variant="label">Último registro do transporte</AppText>
              <AppText variant="title">{trip.lastUpdate === '--:--' ? 'Sem registro' : trip.lastUpdate}</AppText>
              <AppText muted>{trip.lastUpdate === '--:--' ? 'Nenhum horário de embarque ou desembarque foi disponibilizado nesta viagem.' : 'Horário do último evento de embarque ou desembarque disponível na API.'}</AppText>
            </Card>
            <Card style={styles.timeCard}>
              <AppText variant="label">Última consulta bem-sucedida</AppText>
              <AppText variant="title">{consultationTime ?? 'Aguardando consulta'}</AppText>
              <AppText muted>Horário deste dispositivo ao receber os dados. Não indica um novo embarque ou desembarque.</AppText>
            </Card>
          </View>

          <Button label="Atualizar detalhes" variant="secondary" loading={query.refreshing} onPress={onRefresh} />
          <Notice message="A posição do veículo e a previsão de chegada não estão disponíveis. As informações desta tela são consultadas a cada 15 segundos enquanto ela estiver aberta." />
        </>
      )}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <AppText variant="label" muted>{label}</AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 14, borderWidth: 1 },
  detail: { gap: 5, paddingVertical: 8 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  timeCard: { flexBasis: 260, flexGrow: 1, minWidth: 0, gap: 10 },
});
