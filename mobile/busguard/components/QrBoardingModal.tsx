import { useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { ActivityIndicator, AppState, Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import { ApiError, getApiErrorMessage } from '@/services/apiClient';
import { resolveQrStudent, submitQrBoarding, type BoardingSubmission, type QrResolvedStudent } from '@/services/tripService';

type Step = 'reading' | 'resolving' | 'confirm' | 'submitting' | 'error' | 'done';

export default function QrBoardingModal({ tripId, onClose, onRecorded }: { tripId: number; onClose: () => void; onRecorded: () => void }) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('reading');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [message, setMessage] = useState('');
  const [student, setStudent] = useState<QrResolvedStudent | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const token = useRef('');
  const scanning = useRef(false);
  const submission = useRef<BoardingSubmission | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { mounted.current = false; controller.current?.abort(); listener.remove(); };
  }, []);

  async function scan(result: BarcodeScanningResult) {
    if (scanning.current || step !== 'reading') return;
    scanning.current = true;
    if (!/^busguard:qr:v1:[0-9a-f]{32}$/.test(result.data)) {
      setMessage('Este QR Code não é um código válido do BusGuard.'); setStep('error'); return;
    }
    token.current = result.data; submission.current = null;
    setStep('resolving'); setMessage('Identificando passageiro…');
    const request = new AbortController(); controller.current = request;
    try {
      const found = await resolveQrStudent(tripId, token.current, request.signal);
      if (!mounted.current) return;
      if (found.status === 'alighted') throw new Error('Este passageiro já desembarcou nesta viagem.');
      if (found.pendingReview || found.status === 'absent') throw new Error('Este passageiro não está disponível para registro. Consulte a chamada.');
      setStudent(found); setStep('confirm');
    } catch (error) {
      if (!mounted.current || request.signal.aborted) return;
      setMessage(error instanceof ApiError && error.status === 404 ? 'QR Code desativado, não cadastrado ou viagem indisponível.' : error instanceof ApiError && error.status === 403 ? 'Passageiro não pertence a esta viagem.' : error instanceof Error && !(error instanceof ApiError) ? error.message : getApiErrorMessage(error, 'identificar o passageiro'));
      setStep('error');
    }
  }

  async function confirm() {
    if (!student || !token.current || submitting.current) return;
    submitting.current = true;
    const request = submission.current ?? { eventUuid: randomUUID(), occurredAt: new Date().toISOString() };
    submission.current = request;
    setStep('submitting'); setMessage('Registrando…');
    try {
      const result = await submitQrBoarding(tripId, token.current, student.checkedIn, request, student.qrLastEventId);
      if (!mounted.current) return;
      setMessage(result.event.review_status === 'pending' ? `Registro de ${student.name} aguardando revisão.` : result.event.review_status === 'rejected' ? `Registro de ${student.name} rejeitado.` : `${student.checkedIn ? 'Desembarque' : 'Embarque'} de ${student.name} confirmado.`);
      setStep('done'); onRecorded();
    } catch (error) {
      if (!mounted.current) return;
      const changed = error instanceof ApiError && [403, 404, 409, 422].includes(error.status);
      setRetryAllowed(!changed);
      setMessage(changed ? 'O código ou a situação do passageiro mudou. Leia novamente.' : 'Não foi possível confirmar o resultado. Tente confirmar novamente.');
      setStep('error');
    } finally { submitting.current = false; }
  }

  function reset() { token.current = ''; submission.current = null; setStudent(null); setRetryAllowed(false); setMessage(''); scanning.current = false; setStep('reading'); }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (step !== 'submitting') onClose(); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: theme.surface }]}>
      <ScrollView contentContainerStyle={styles.dialogContent} keyboardShouldPersistTaps="handled">
      <AppText variant="title" style={styles.title}>{step === 'confirm' ? 'Confirmar passageiro' : step === 'done' ? 'Registro recebido' : step === 'resolving' || step === 'submitting' ? 'Aguarde' : 'Ler QR Code'}</AppText>
      {step === 'reading' ? !permission ? <ActivityIndicator /> : !permission.granted ? <>
        <AppText muted>Permita o acesso à câmera para ler o QR Code do passageiro.</AppText>
        <Button label={permission.canAskAgain ? 'Permitir câmera' : 'Abra as configurações do celular para permitir a câmera'} disabled={!permission.canAskAgain} onPress={() => { void requestPermission(); }} />
      </> : active ? <><AppText muted style={styles.message}>Aponte a câmera para o QR Code.</AppText><CameraView style={[styles.camera, { height: Math.min(260, Math.max(150, height * 0.32)) }]} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => { void scan(result); }} onMountError={() => { setMessage('Não foi possível abrir a câmera.'); setStep('error'); }} /></> : <AppText muted>Câmera pausada.</AppText> : null}
      {step === 'resolving' || step === 'submitting' ? <ActivityIndicator size="large" color={theme.primary} /> : null}
      {step === 'confirm' && student ? <>
        <AppText style={styles.student}>{student.name}</AppText>
        <AppText muted>{student.checkedIn ? 'Passageiro a bordo. Confirmar desembarque?' : 'Passageiro aguardando. Confirmar embarque?'}</AppText>
        <Button label={student.checkedIn ? 'Confirmar desembarque' : 'Confirmar embarque'} variant="success" onPress={() => { void confirm(); }} />
      </> : message ? <AppText muted style={styles.message}>{message}</AppText> : null}
      {step === 'error' ? <Button label={retryAllowed ? 'Tentar confirmar novamente' : 'Ler outra vez'} onPress={() => retryAllowed ? void confirm() : reset()} /> : null}
      <Button label={step === 'done' ? 'Concluir' : 'Cancelar'} variant="secondary" disabled={step === 'submitting'} onPress={onClose} />
      </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 20, overflow: 'hidden' },
  dialogContent: { padding: 22, gap: 16 },
  title: { textAlign: 'center', fontSize: 20 },
  student: { fontWeight: '800', fontSize: 17, textAlign: 'center' },
  message: { textAlign: 'center' },
  camera: { width: '100%', borderRadius: 16, overflow: 'hidden' },
});
