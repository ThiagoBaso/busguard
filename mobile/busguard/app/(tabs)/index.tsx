import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import AlunoItem from '@/components/AlunoItem';
import { AppText, Badge, Button, Card, Notice, Screen, StatePanel } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useSession } from '@/services/session';
import { getApiErrorMessage } from '@/services/apiClient';
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

  const studentsByStop = useMemo(() => {
    const groups = new Map<string, { stopOrder: number; stopName: string; students: BoardingStudent[] }>();
    [...visibleStudents].sort((a, b) => a.stopOrder - b.stopOrder).forEach((student) => {
      const stopName = student.stopName.trim() || 'Parada sem identificação';
      const key = `${student.stopOrder}:${normalize(stopName)}`;
      const group = groups.get(key);
      if (group) {
        group.students.push(student);
      } else {
        groups.set(key, { stopOrder: student.stopOrder, stopName, students: [student] });
      }
    });
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [visibleStudents]);

  const nextStop = useMemo(() => {
    const upcoming = (trip?.students ?? [])
      .filter((student) => !student.checkedIn && student.status !== 'absent')
      .sort((a, b) => a.stopOrder - b.stopOrder);
    const first = upcoming[0];
    if (!first) return null;
    const stopName = first.stopName.trim() || 'Parada sem identificação';
    return {
      stopOrder: first.stopOrder,
      stopName,
      students: upcoming.filter((student) => (
        student.stopOrder === first.stopOrder &&
        normalize(student.stopName.trim() || 'Parada sem identificação') === normalize(stopName)
      )),
    };
  }, [trip]);
  const nextStudent = nextStop?.students[0] ?? null;

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
    } catch (caught) {
      if (mounted.current && focused.current && !operation.signal.aborted) {
        setFeedback({ tone: 'error', message: confirmed
          ? 'O registro foi confirmado, mas a atualização falhou. Atualize a viagem.'
          : getApiErrorMessage(caught, checkedIn ? 'confirmar o embarque' : 'confirmar o desembarque') });
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
  const absent = trip?.students.filter((student) => student.status === 'absent').length ?? 0;
  const eligibleStudents = boarded + waiting;
  const boardingProgress = eligibleStudents ? Math.round(boarded / eligibleStudents * 100) : 0;
  const failureMessage = query.errorStatus === 403
    ? 'Seu perfil não tem acesso a esta viagem. Confira sua conta ou procure a administração.'
    : query.errorStatus === 404
      ? 'Nenhuma viagem em andamento foi atribuída a você. A viagem aparecerá aqui quando estiver disponível.'
      : query.error ?? 'Não foi possível consultar a viagem. Tente novamente.';

  return (
    <Screen
      withTabBar
      eyebrow={user?.role === 'supervisor' ? 'PAINEL DO SUPERVISOR' : 'PAINEL DO MOTORISTA'}
      title={listOnly ? 'Chamada dos alunos' : 'Sua viagem'}
      subtitle={listOnly ? 'Confira a lista e registre cada embarque.' : 'Rota, progresso e próxima parada.'}
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
          {query.error ? <Notice tone="error" message={listOnly ? `${failureMessage} A lista abaixo é da última consulta; novos registros estão bloqueados.` : `${failureMessage} Os dados exibidos são da última consulta.`} /> : null}
          {feedback ? <Notice tone={feedback.tone} message={feedback.message} /> : null}
          <TripSummary
            routeName={trip.routeName}
            vehicleLabel={trip.vehicleLabel}
            status={trip.status}
            onDetails={() => router.push('/route')}
            disabled={pendingId !== null || Boolean(query.error)}
            compact={listOnly}
          />
          <Card style={styles.progressCard}>
            <View style={styles.progressHeading}>
              <View style={styles.progressTitleGroup}>
                <AppText variant="label" muted>RESUMO DA CHAMADA</AppText>
                <AppText style={styles.progressTitle}>{boarded} de {eligibleStudents} embarcados</AppText>
              </View>
              <AppText style={styles.progressPercent}>{boardingProgress}%</AppText>
            </View>
            <View accessibilityLabel={`${boarded} de ${eligibleStudents} alunos elegíveis embarcados`} style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.progressFill, { width: `${boardingProgress}%`, backgroundColor: theme.primary }]} />
            </View>
            <View style={styles.callCounts}>
              <View style={[styles.callCount, { backgroundColor: theme.primarySoft }]}>
                <AppText style={[styles.callCountValue, { color: theme.primary }]}>{boarded}</AppText>
                <AppText muted style={styles.callCountLabel}>A bordo</AppText>
              </View>
              <View style={[styles.callCount, { backgroundColor: theme.surfaceAlt }]}>
                <AppText style={styles.callCountValue}>{waiting}</AppText>
                <AppText muted style={styles.callCountLabel}>Aguardando</AppText>
              </View>
              <View style={[styles.callCount, { backgroundColor: '#FFF7DE' }]}>
                <AppText style={[styles.callCountValue, { color: '#8A6500' }]}>{absent}</AppText>
                <AppText muted style={styles.callCountLabel}>Ausentes</AppText>
              </View>
            </View>
            <AppText muted>
              {waiting
                ? `${waiting} ${waiting === 1 ? 'aluno aguarda' : 'alunos aguardam'} confirmação de embarque.`
                : eligibleStudents
                  ? 'Todos os embarques foram confirmados.'
                  : 'Nenhum aluno disponível para embarque.'}
            </AppText>
          </Card>
          {!listOnly ? (
            <Card style={[styles.nextStopCard, { backgroundColor: '#FFF9E8', borderColor: '#F3D475' }]}>
              <View style={styles.nextStopHeader}>
                <Badge label={nextStop ? 'PRÓXIMA PARADA' : 'ROTA EM DIA'} tone={nextStop ? 'warning' : 'success'} />
                {nextStop && nextStop.stopOrder > 0 ? <AppText muted>Parada {String(nextStop.stopOrder).padStart(2, '0')}</AppText> : null}
              </View>
              <AppText variant="title" style={{ fontSize: 19 }}>
                {nextStop?.stopName ?? (trip.students.length ? 'Embarques em dia' : 'Rota sem alunos')}
              </AppText>
              <AppText muted>
                {nextStop
                  ? nextStop.students.length === 1
                    ? `${nextStudent?.name} aguarda confirmação de embarque nesta parada.`
                    : `${nextStop.students.length} alunos aguardam confirmação de embarque nesta parada.`
                  : trip.students.length
                    ? 'Não há alunos aguardando confirmação de embarque.'
                    : 'Nenhum aluno está vinculado a esta rota.'}
              </AppText>
              {nextStudent ? (
                <Button
                  label={pendingId === nextStudent.id ? `Confirmando embarque de ${nextStudent.name}…` : `Validar embarque de ${nextStudent.name}`}
                  accessibilityLabel={`${pendingId === nextStudent.id ? 'Confirmando embarque de' : 'Validar embarque de'} ${nextStudent.name}`}
                  variant="success"
                  loading={pendingId === nextStudent.id}
                  disabled={pendingId !== null || Boolean(query.error) || feedback?.tone === 'error'}
                  onPress={() => { void handleBoardingChange(nextStudent, true); }}
                />
              ) : null}
              <Button label="Ver chamada completa" variant="secondary" onPress={() => router.push('/(tabs)/students')} />
            </Card>
          ) : null}
          {listOnly ? <>
          <View style={styles.sectionHeading}>
            <AppText variant="label" muted>ALUNOS POR PARADA</AppText>
            <AppText muted>{visibleStudents.length} {visibleStudents.length === 1 ? 'aluno' : 'alunos'}</AppText>
          </View>
          <TextInput
            accessibilityLabel="Buscar aluno pelo nome"
            placeholder="Buscar aluno pelo nome"
            placeholderTextColor={theme.muted}
            clearButtonMode="while-editing"
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
          {studentsByStop.map((group) => (
            <View key={group.key} style={styles.stopGroup}>
              <View style={[styles.stopHeading, { borderBottomColor: theme.border }]}>
                <View style={[styles.stopNumber, { backgroundColor: theme.primarySoft }]}>
                  <AppText style={{ color: theme.primary, fontWeight: '800' }}>{group.stopOrder > 0 ? String(group.stopOrder).padStart(2, '0') : '•'}</AppText>
                </View>
                <View style={styles.stopIdentity}>
                  <AppText variant="label" muted>{group.stopOrder > 0 ? `PARADA ${String(group.stopOrder).padStart(2, '0')}` : 'PARADA'}</AppText>
                  <AppText style={{ fontWeight: '700' }}>{group.stopName}</AppText>
                </View>
                <Badge label={`${group.students.length} ${group.students.length === 1 ? 'aluno' : 'alunos'}`} />
              </View>
              {group.students.map((student) => (
                <AlunoItem
                  key={`${trip.id}:${student.id}`}
                  aluno={student}
                  showStop={false}
                  disabled={pendingId !== null || Boolean(query.error) || feedback?.tone === 'error'}
                  pending={pendingId === student.id}
                  onBoardingChange={handleBoardingChange}
                />
              ))}
            </View>
          ))}
          {visibleStudents.length === 0 ? <>
            <StatePanel
              title={trip.students.length ? 'Nenhum aluno encontrado' : 'Lista vazia'}
              message={trip.students.length
                ? 'A busca ou o filtro atual não encontrou alunos.'
                : 'Nenhum aluno foi vinculado a esta rota.'}
            />
            {trip.students.length > 0 && (search.trim() || filter !== 'all') ? (
              <Button label="Limpar busca e filtros" variant="secondary" onPress={() => { setSearch(''); setFilter('all'); }} />
            ) : null}
          </> : null}
          </> : null}
          <Button label={query.refreshing ? (listOnly ? 'Atualizando chamada…' : 'Atualizando viagem…') : listOnly ? 'Atualizar lista' : 'Atualizar viagem'} variant="secondary" loading={query.refreshing} disabled={pendingId !== null} onPress={() => { void refreshList(); }} />
          <AppText muted>{query.updatedAt ? `Última consulta às ${query.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : ''}</AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: { gap: 12, borderRadius: 18 },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  progressTitleGroup: { flex: 1, minWidth: 0, gap: 3 },
  progressTitle: { fontWeight: '800', fontSize: 17, lineHeight: 23 },
  progressPercent: { fontWeight: '800', fontSize: 20, color: '#047857' },
  progressTrack: { height: 9, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  callCounts: { flexDirection: 'row', gap: 8 },
  callCount: { flex: 1, minWidth: 0, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 9, gap: 1 },
  callCountValue: { fontSize: 19, lineHeight: 24, fontWeight: '800' },
  callCountLabel: { fontSize: 11, lineHeight: 16 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 },
  nextStopCard: { borderRadius: 18, gap: 11, padding: 17 },
  nextStopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  stopGroup: { gap: 8 },
  stopHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottomWidth: 1 },
  stopNumber: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stopIdentity: { flex: 1, gap: 2 },
  search: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, borderWidth: 1 },
});
