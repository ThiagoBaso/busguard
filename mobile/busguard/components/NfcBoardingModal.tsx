import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { ActivityIndicator, AppState, Modal, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { ApiError, getApiErrorMessage } from '@/services/apiClient';
import { readNfcTag } from '@/services/nfcReader';
import { resolveNfcStudent, submitNfcBoarding, type NfcResolvedStudent, type BoardingSubmission } from '@/services/tripService';

type Step = 'reading' | 'resolving' | 'confirm' | 'submitting' | 'error' | 'done';

export default function NfcBoardingModal({ tripId, onClose, onRecorded }: { tripId: number; onClose: () => void; onRecorded: () => void }) {
  const theme = useAppTheme();
  const [step, setStep] = useState<Step>('reading');
  const [message, setMessage] = useState('Aproxime a tag do celular.');
  const [student, setStudent] = useState<NfcResolvedStudent | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const credential = useRef('');
  const submission = useRef<BoardingSubmission | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    let reading = true;
    credential.current = '';
    submission.current = null;
    setStudent(null); setRetryAllowed(false); setStep('reading'); setMessage('Aproxime a tag do celular.');
    const timer = setTimeout(() => { if (reading) { timedOut = true; controller.abort(); } }, 45000);
    const listener = AppState.addEventListener('change', state => { if (state !== 'active' && reading) controller.abort(); });
    void (async () => {
      try {
        const token = await readNfcTag(controller.signal);
        if (controller.signal.aborted) return;
        reading = false;
        clearTimeout(timer);
        credential.current = token;
        setStep('resolving'); setMessage('Identificando aluno…');
        const result = await resolveNfcStudent(tripId, token, controller.signal);
        if (controller.signal.aborted) return;
        if (result.pendingReview || result.status === 'absent') throw new Error('Este aluno não está disponível para registro. Consulte a chamada.');
        setStudent(result); setStep('confirm');
      } catch (error) {
        if (!mounted.current) return;
        if (controller.signal.aborted && !timedOut && AppState.currentState === 'active') return;
        const text = timedOut ? 'Tempo de leitura esgotado. Tente novamente.'
          : controller.signal.aborted ? 'Leitura interrompida. Tente novamente.'
          : error instanceof ApiError && error.status === 404 ? 'Tag não cadastrada, desativada ou viagem indisponível.'
          : error instanceof ApiError && error.status === 403 ? 'Esta tag não pertence a um aluno da sua viagem.'
          : error instanceof Error && !(error instanceof ApiError) && error.name !== 'AbortError' ? error.message
          : getApiErrorMessage(error, 'identificar o aluno');
        setMessage(text); setStep('error');
      }
    })();
    return () => { clearTimeout(timer); listener.remove(); controller.abort(); };
  }, [tripId, attempt]);

  async function confirm() {
    if (!student || !credential.current || submitting.current) return;
    submitting.current = true;
    const request = submission.current ?? { eventUuid: randomUUID(), occurredAt: new Date().toISOString() };
    submission.current = request;
    setStep('submitting'); setMessage('Registrando…');
    try {
      const result = await submitNfcBoarding(tripId, credential.current, student.checkedIn, request, student.nfcLastEventId);
      if (!mounted.current) return;
      const action = student.checkedIn ? 'Desembarque' : 'Embarque';
      setMessage(result.event.review_status === 'pending' ? `Registro de ${student.name} recebido e aguardando revisão.` : result.event.review_status === 'rejected' ? `O registro de ${student.name} foi rejeitado.` : `${action} de ${student.name} confirmado.`);
      setStep('done'); onRecorded();
    } catch (error) {
      if (!mounted.current) return;
      const changed = error instanceof ApiError && [403, 404, 409, 422].includes(error.status);
      setRetryAllowed(!changed);
      setMessage(changed ? 'A tag ou a situação do aluno mudou. Leia a tag novamente.' : 'Não foi possível confirmar o resultado. Tente novamente para consultar o mesmo registro.');
      setStep('error');
    } finally { submitting.current = false; }
  }

  const busy = step === 'submitting';
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: theme.surface }]}>
        <AppText variant="title" style={styles.title}>{step === 'reading' ? 'Aguardando leitura' : step === 'confirm' ? 'Confirmar aluno' : step === 'done' ? 'Registro recebido' : step === 'error' ? 'Leitura NFC' : 'Aguarde'}</AppText>
        {step === 'reading' || step === 'resolving' || step === 'submitting' ? <ActivityIndicator size="large" color={theme.primary} /> : null}
        {step === 'confirm' && student ? <>
          <AppText style={styles.student}>{student.name}</AppText>
          <AppText muted>{student.checkedIn ? 'Aluno a bordo. Confirmar desembarque?' : 'Aluno aguardando. Confirmar embarque?'}</AppText>
          <Button label={student.checkedIn ? 'Confirmar desembarque' : 'Confirmar embarque'} variant="success" onPress={() => { void confirm(); }} />
        </> : <AppText muted style={styles.message}>{message}</AppText>}
        {step === 'error' ? <Button label={retryAllowed ? 'Tentar confirmar novamente' : 'Ler outra vez'} variant="success" onPress={() => retryAllowed ? void confirm() : setAttempt(value => value + 1)} /> : null}
        <Button label={step === 'done' ? 'Concluir' : 'Cancelar'} variant="secondary" disabled={busy} onPress={onClose} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 22, gap: 16 },
  title: { textAlign: 'center', fontSize: 20 }, student: { fontWeight: '800', fontSize: 17, textAlign: 'center' }, message: { textAlign: 'center' },
});
