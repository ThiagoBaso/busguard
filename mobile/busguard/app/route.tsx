import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { getDriverTrip } from '@/services/tripService';

export default function RouteDetailsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const allowed = user?.role === 'driver' || user?.role === 'supervisor';
  const query = useTripQuery(getDriverTrip, allowed);
  const trip = allowed ? query.data : null;
  const boarded = trip?.students.filter((student) => student.checkedIn).length ?? 0;

  return (
    <Screen
      eyebrow="VIAGEM ATUAL"
      title="Detalhes da rota"
      subtitle="Informações da viagem atribuída à sua conta."
      refreshing={query.refreshing}
      onRefresh={() => { if (allowed) void query.refresh(); }}>
      {!allowed ? <StatePanel title="Acesso restrito" message="Esta tela é destinada a motoristas e supervisores vinculados à viagem." /> : !trip ? (
        <StatePanel
          title={query.loading ? 'Consultando a rota' : query.errorStatus === 404 ? 'Sem viagem ativa' : 'Rota indisponível'}
          message={query.loading ? 'Buscando os dados da sua viagem.' : query.errorStatus === 404 ? 'Nenhuma viagem em andamento foi atribuída a você.' : query.errorStatus === 403 ? 'Sua conta não possui acesso a esta viagem.' : query.error ?? 'Não foi possível consultar os dados. Tente novamente.'}
          loading={query.loading}
          onRetry={() => void query.refresh()}
        />
      ) : (
        <>
          {query.error ? <Notice tone="error" message={`${query.error} Estas informações são da última consulta bem-sucedida.`} /> : null}
          <Card>
            <Badge label={trip.status} tone="success" />
            <AppText variant="title">{trip.routeName}</AppText>
            <AppText variant="label" muted>Veículo informado</AppText>
            <AppText>{trip.vehicleLabel}</AppText>
          </Card>
          <Card>
            <AppText variant="title">Resumo de embarque</AppText>
            <AppText variant="metric">{boarded} / {trip.students.length}</AppText>
            <AppText muted>Alunos a bordo / alunos vinculados à rota</AppText>
            <AppText muted>Este resumo registra embarques. Não indica a distância percorrida.</AppText>
          </Card>
          <Card>
            <AppText variant="title">Alunos vinculados</AppText>
            <AppText muted>A lista não representa a sequência de paradas.</AppText>
            {trip.students.map((student) => (
              <View key={student.id} style={styles.student}>
                <AppText style={{ fontWeight: '700' }}>{student.name}</AppText>
                <View style={styles.status}>
                  <Badge label={student.status === 'absent' ? 'Ausente' : student.checkedIn ? 'A bordo' : 'Aguardando'} tone={student.checkedIn ? 'success' : 'neutral'} />
                  {student.checkedIn && student.time ? <AppText muted>Registro às {student.time}</AppText> : null}
                </View>
              </View>
            ))}
            {!trip.students.length ? <AppText muted>Nenhum aluno vinculado a esta rota.</AppText> : null}
          </Card>
        </>
      )}
      <Button label="Voltar ao embarque" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  student: { gap: 8, paddingVertical: 8 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
