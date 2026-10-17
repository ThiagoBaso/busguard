import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import AlunoItem from '@/components/AlunoItem';
import { AppText, Badge, Button, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { BoardingStudent, getDriverTrip, updateBoardingStatus } from '@/services/tripService';
import TripSummary from '@/components/TripSummary';

type Filter = 'all' | 'waiting' | 'boarded';
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'boarded', label: 'A bordo' },
];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export default function DriverHomeScreen() {
  return <DriverContent />;
}

export function DriverContent({ listOnly = false }: { listOnly?: boolean }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useSession();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const allowed = user?.role === 'driver' || user?.role === 'supervisor';
  const query = useTripQuery(getDriverTrip, allowed && pendingId === null);
  const trip = query.data;
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const focused = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Uma gravação continua até a confirmação/timeout, mesmo ao trocar de aba.
    return () => { focused.current = false; };
  }, []));

  const visibleStudents = useMemo(() => {
    const term = normalize(search.trim());
    return (trip?.students ?? []).filter((student) => (
      (!term || normalize(student.name).includes(term)) &&
      (filter === 'all' || (filter === 'boarded' ? student.checkedIn : !student.checkedIn && student.status !== 'absent'))
    ));
  }, [trip, search, filter]);

  async function refreshList() {
    if (pending.current || !allowed) return;
    const result = await query.refresh();
    if (result && mounted.current && focused.current) setFeedback(null);
  }

  async function handleBoardingChange(student: BoardingStudent, checkedIn: boolean) {
    if (!trip || pending.current || query.error || !focused.current) return;
    if (!Number.isSafeInteger(trip.id) || trip.id <= 0 || !Number.isSafeInteger(Number(student.id)) || Number(student.id) <= 0) {
      setFeedback({ tone: 'error', message: 'Não foi possível identificar a viagem ou o aluno. Atualize a consulta.' });
      return;
    }
    pending.current = true;
    query.cancel();
    setPendingId(student.id);
    setFeedback(null);
    const operation = new AbortController();
    controller.current = operation;
    let confirmed = false;
    try {
      await updateBoardingStatus(trip.id, student.id, checkedIn, operation.signal);
      confirmed = true;
      const refreshed = await query.refresh();
      if (mounted.current && focused.current) {
        setFeedback({
          tone: refreshed ? 'info' : 'error',
          message: refreshed
            ? `${checkedIn ? 'Embarque' : 'Desembarque'} de ${student.name} confirmado.`
            : 'O registro foi confirmado, mas a atualização da lista falhou. Consulte a viagem novamente antes de registrar outra alteração.',
        });
      }
    } catch {
      if (mounted.current && focused.current && !operation.signal.aborted) {
        setFeedback({ tone: 'error', message: confirmed
          ? 'O registro foi confirmado, mas a atualização falhou. Atualize a viagem.'
          : 'Não foi possível confirmar o registro. Atualize a viagem antes de tentar novamente.' });
        query.cancel();
      }
    } finally {
      pending.current = false;
      if (controller.current === operation) controller.current = null;
      if (mounted.current) setPendingId(null);
    }
  }

  const boarded = trip?.students.filter((student) => student.checkedIn).length ?? 0;
  const waiting = trip?.students.filter((student) => !student.checkedIn && student.status !== 'absent').length ?? 0;
  const failureMessage = query.errorStatus === 403
    ? 'Seu perfil não tem acesso a esta viagem. Confira sua conta ou procure a administração.'
    : query.errorStatus === 404
      ? 'Nenhuma viagem em andamento foi atribuída a você. A viagem aparecerá aqui quando estiver disponível.'
      : query.error ?? 'Não foi possível consultar a viagem. Tente novamente.';

  return (
    <Screen
      withTabBar
      eyebrow={user?.role === 'supervisor' ? 'PAINEL DO SUPERVISOR' : 'PAINEL DO MOTORISTA'}
      title={listOnly ? 'Chamada dos alunos' : 'Sua viagem de hoje'}
      subtitle={listOnly ? 'Cada embarque, uma confirmação.' : 'Tudo pronto para mais uma jornada segura.'}
      refreshing={query.refreshing}
      onRefresh={() => { void refreshList(); }}>
      {!trip ? (
        <StatePanel
          title={query.loading ? 'Buscando sua viagem' : query.errorStatus === 404 ? 'Sem viagem ativa' : 'Viagem indisponível'}
          message={query.loading ? 'Consultando os dados autorizados da sua conta.' : failureMessage}
          loading={query.loading}
          onRetry={() => void query.refresh()}
        />
      ) : (
        <>
          {query.error ? <Notice tone="error" message={`${failureMessage} A lista abaixo é da última consulta; novos registros estão bloqueados.`} /> : null}
          {feedback ? <Notice tone={feedback.tone} message={feedback.message} /> : null}
          <TripSummary routeName={trip.routeName} vehicleLabel={trip.vehicleLabel} status={trip.status} onDetails={() => router.push('/route')} disabled={pendingId !== null || Boolean(query.error)} />
          <View style={styles.metrics}>
            <Card style={[styles.metric, { backgroundColor: theme.primarySoft }]}><AppText variant="metric" style={{ color: theme.primary }}>{boarded}</AppText><AppText muted>A bordo</AppText></Card>
            <Card style={styles.metric}><AppText variant="metric">{waiting}</AppText><AppText muted>Aguardando</AppText></Card>
          </View>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><AppText style={{ fontWeight: '700' }}>Resumo da chamada</AppText><AppText muted>{boarded}/{trip.students.length}</AppText></View>
            <View accessibilityLabel={`${boarded} de ${trip.students.length} alunos a bordo`} style={[styles.progress, { backgroundColor: theme.surfaceAlt }]}><View style={{ width: `${trip.students.length ? Math.round(boarded / trip.students.length * 100) : 0}%`, height: 6, backgroundColor: theme.primary, borderRadius: 4 }} /></View>
            <AppText muted>{waiting ? `${waiting} ${waiting === 1 ? 'aluno aguardando' : 'alunos aguardando'} confirmação de embarque.` : 'Nenhum aluno aguardando embarque.'}</AppText>
            {!listOnly ? <Button label="Abrir chamada completa →" onPress={() => router.push('/(tabs)/students')} /> : null}
          </Card>
          <View style={styles.sectionHeading}><AppText variant="label" muted>{listOnly ? 'ALUNOS DA VIAGEM' : 'LISTA DE ALUNOS'}</AppText></View>
          <TextInput
            accessibilityLabel="Buscar aluno pelo nome"
            placeholder="Buscar aluno pelo nome"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          />
          <View style={styles.filters}>
            {filters.map((item) => (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item.value }}
                onPress={() => setFilter(item.value)}
                style={({ pressed }) => [styles.filter, { backgroundColor: filter === item.value ? theme.primarySoft : theme.surface, borderColor: filter === item.value ? theme.primary : theme.border, opacity: pressed ? 0.7 : 1 }]}>
                <AppText style={{ color: filter === item.value ? theme.primary : theme.muted, fontWeight: '700' }}>{item.label}</AppText>
              </Pressable>
            ))}
          </View>
          {(listOnly || search || filter !== 'all' ? visibleStudents : visibleStudents.slice(0, 3)).map((student) => (
            <AlunoItem
              key={`${trip.id}:${student.id}`}
              aluno={student}
              readOnly={!listOnly}
              disabled={pendingId !== null || Boolean(query.error) || query.refreshing || feedback?.tone === 'error'}
              pending={pendingId === student.id}
              onBoardingChange={handleBoardingChange}
            />
          ))}
          {visibleStudents.length === 0 ? <StatePanel title={trip.students.length ? 'Nenhum resultado' : 'Lista vazia'} message={trip.students.length ? 'Experimente outro nome ou selecione Todos.' : 'Nenhum aluno foi vinculado a esta rota.'} /> : null}
          {!listOnly && !search && filter === 'all' && visibleStudents.length > 3 ? <Button label={`Ver todos os ${trip.students.length} alunos`} variant="secondary" onPress={() => router.push('/(tabs)/students')} /> : null}
          <Button label={query.refreshing ? 'Atualizando lista…' : 'Atualizar lista'} variant="secondary" loading={query.refreshing} disabled={pendingId !== null} onPress={() => { void refreshList(); }} />
          <AppText muted>{query.updatedAt ? `Última consulta às ${query.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : ''}</AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progress: { height: 6, borderRadius: 4, overflow: 'hidden' },
  metric: { flex: 1, minWidth: 80 },
  sectionHeading: { gap: 4, marginTop: 8 },
  search: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, borderWidth: 1 },
});
