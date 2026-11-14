import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import { Button, Pill } from './components';

type NdefRecord = { recordType: string; data?: DataView; encoding?: string };
type NdefEvent = Event & { message: { records: NdefRecord[] } };
type NdefReader = {
  write: (message: string, options: { signal: AbortSignal; overwrite: boolean }) => Promise<void>;
  scan: (options: { signal: AbortSignal }) => Promise<void>;
  onreading: ((event: NdefEvent) => void) | null;
  onreadingerror: (() => void) | null;
};
type NdefWindow = Window & { NDEFReader?: new () => NdefReader };
type Status = { active: boolean; pending: boolean };
type Prepared = { id: number; token: string };

export function NfcManager({ passengerId }: { passengerId: number }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [written, setWritten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const supported = window.isSecureContext && Boolean((window as NdefWindow).NDEFReader);
  const base = `/admin/passengers/${passengerId}/nfc`;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void apiFetch<Status>(base, { signal: controller.signal }).then(data => { if (mounted.current) setStatus(data); }).catch(() => { if (!controller.signal.aborted && mounted.current) setMessage('Não foi possível consultar a tag.'); });
    return () => { mounted.current = false; controller.abort(); current.current?.abort(); };
  }, [base]);

  async function refreshStatus() {
    const data = await apiFetch<Status>(base);
    if (mounted.current) setStatus(data);
  }

  async function prepare() {
    setBusy(true); setMessage(''); setPrepared(null); setWritten(false);
    try {
      const data = await apiFetch<Prepared>(`${base}/prepare`, { method: 'POST' });
      if (mounted.current) { setPrepared(data); setMessage('Código gerado. Grave-o em uma tag.'); await refreshStatus(); }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o código.'); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function write() {
    if (!prepared || !supported || !window.confirm('A gravação substitui o conteúdo da tag. Para substituir uma tag ativa, use outra tag. Continuar?')) return;
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setMessage('Aproxime a tag do celular para gravar.');
    const timer = window.setTimeout(() => controller.abort(), 45000);
    try {
      const reader = new (window as NdefWindow).NDEFReader!();
      await reader.write(prepared.token, { overwrite: true, signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) { setWritten(true); setMessage('Tag gravada. Confirme a leitura para ativá-la.'); }
    } catch (error) {
      if (mounted.current) setMessage(controller.signal.aborted ? 'Gravação cancelada ou tempo esgotado.' : error instanceof Error ? `Não foi possível gravar a tag: ${error.message}` : 'Não foi possível gravar a tag.');
    } finally { window.clearTimeout(timer); if (current.current === controller) current.current = null; if (mounted.current) setBusy(false); }
  }

  async function verify() {
    if (!prepared || !supported) return;
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setMessage('Aproxime novamente a tag gravada para confirmar.');
    const timer = window.setTimeout(() => controller.abort(), 45000);
    try {
      const reader = new (window as NdefWindow).NDEFReader!();
      const read = new Promise<string>((resolve, reject) => {
        reader.onreading = event => {
          const text = event.message.records.find(record => record.recordType === 'text');
          try { resolve(text?.data ? new TextDecoder(text.encoding || 'utf-8').decode(text.data) : ''); } catch { reject(new Error('Conteúdo NFC inválido.')); }
        };
        reader.onreadingerror = () => reject(new Error('Não foi possível ler a tag.'));
        controller.signal.addEventListener('abort', () => reject(new Error('Leitura cancelada ou tempo esgotado.')), { once: true });
      });
      void read.catch(() => {});
      await reader.scan({ signal: controller.signal });
      const value = await read;
      if (value !== prepared.token) throw new Error('Esta tag não contém o código gerado. Aproxime a tag correta.');
      await apiFetch(`${base}/${prepared.id}/activate`, { method: 'POST', body: JSON.stringify({ token: prepared.token }), signal: controller.signal });
      if (mounted.current) { setPrepared(null); setWritten(false); setMessage('Tag confirmada e ativada.'); await refreshStatus(); }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar a tag.'); }
    finally { window.clearTimeout(timer); controller.abort(); if (current.current === controller) current.current = null; if (mounted.current) setBusy(false); }
  }

  async function revoke() {
    if (!window.confirm('Desativar a tag deste passageiro? Ela não poderá mais ser usada.')) return;
    setBusy(true); setMessage('');
    try {
      await apiFetch(base, { method: 'DELETE' });
      if (mounted.current) { setPrepared(null); setWritten(false); setMessage('Credencial desativada.'); await refreshStatus(); }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Não foi possível desativar a tag.'); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <section className="nfc-management" aria-label="Gerenciar tag NFC">
    <div className="nfc-management-heading"><strong>Tag NFC</strong><Pill tone={status?.active ? 'success' : 'neutral'}>{status ? status.active ? 'Ativa' : 'Sem tag ativa' : 'Consultando…'}</Pill></div>
    <p className="panel-hint">Gere um código, grave na tag e confirme a leitura. Para substituir uma tag ativa, use outra tag: regravá-la apaga o código anterior.</p>
    {!supported ? <p className="panel-hint">Para gravar, abra o painel no Chrome de um Android com NFC, usando HTTPS ou localhost.</p> : null}
    {status?.pending && !prepared ? <p className="panel-hint">Existe uma gravação pendente. Gere um novo código para recomeçar.</p> : null}
    {message ? <p className="panel-hint" role="status">{message}</p> : null}
    <div className="nfc-actions">
      <Button type="button" variant="quiet" disabled={busy || !status} onClick={() => void prepare()}>{status?.active ? 'Gerar código para substituir' : 'Gerar código'}</Button>
      {prepared ? <Button type="button" disabled={busy || !supported} onClick={() => void write()}>{written ? 'Gravar novamente' : 'Gravar tag'}</Button> : null}
      {prepared && written ? <Button type="button" variant="quiet" disabled={busy || !supported} onClick={() => void verify()}>Confirmar leitura e ativar</Button> : null}
      {busy && current.current ? <Button type="button" variant="quiet" onClick={() => current.current?.abort()}>Cancelar leitura</Button> : null}
      {status?.active || status?.pending ? <Button type="button" variant="danger" disabled={busy} onClick={() => void revoke()}>Desativar tag</Button> : null}
    </div>
  </section>;
}
