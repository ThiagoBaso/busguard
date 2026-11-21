import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch } from './api';
import { Button, Pill } from './components';

type Status = { active: boolean; pending: boolean };
type Prepared = { id: number; token: string };

export function QrManager({ passengerId }: { passengerId: number }) {
  const base = `/admin/passengers/${passengerId}/qr`;
  const [status, setStatus] = useState<Status | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null); setStatus(null); setMessage('');
    void apiFetch<Status>(base, { signal: controller.signal }).then(setStatus).catch(() => { if (!controller.signal.aborted) setMessage('Não foi possível consultar o QR Code.'); });
    return () => controller.abort();
  }, [base]);

  async function prepare() {
    setBusy(true); setMessage('');
    try {
      const result = await apiFetch<Prepared>(`${base}/prepare`, { method: 'POST' });
      setPrepared(result); setStatus(previous => ({ active: Boolean(previous?.active), pending: true }));
      setMessage('Baixe ou imprima o código e confirme a ativação.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code.'); }
    finally { setBusy(false); }
  }

  async function activate() {
    if (!prepared || !window.confirm('Você já salvou ou imprimiu este QR Code? Após fechar esta tela, ele não poderá ser recuperado.')) return;
    setBusy(true); setMessage('');
    try {
      await apiFetch(`${base}/${prepared.id}/activate`, { method: 'POST', body: JSON.stringify({ token: prepared.token }) });
      setStatus({ active: true, pending: false });
      setMessage('QR Code ativado. Guarde uma cópia: ele não poderá ser exibido novamente.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível ativar o QR Code.'); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!window.confirm('Desativar o QR Code deste passageiro?')) return;
    setBusy(true); setMessage('');
    try { await apiFetch(base, { method: 'DELETE' }); setPrepared(null); setStatus({ active: false, pending: false }); setMessage('QR Code desativado.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível desativar o QR Code.'); }
    finally { setBusy(false); }
  }

  function save() {
    if (!svg.current) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg.current)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `passageiro-${passengerId}-qr.svg`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print() {
    if (!svg.current) return;
    const page = window.open('', '_blank', 'width=500,height=500');
    if (!page) { setMessage('Permita pop-ups para imprimir o QR Code.'); return; }
    page.document.title = 'QR Code do passageiro';
    page.document.body.style.cssText = 'display:flex;justify-content:center;padding:32px';
    page.document.body.appendChild(page.document.importNode(svg.current, true));
    page.focus(); page.print();
  }

  return <section className="nfc-management" aria-label="Gerenciar QR Code">
    <div className="nfc-management-heading"><strong>QR Code</strong><Pill tone={status?.active ? 'success' : 'neutral'}>{status ? status.active ? 'Ativo' : 'Sem QR ativo' : 'Consultando…'}</Pill></div>
    <p className="panel-hint">Gere e salve o código antes de ativá-lo. Ao substituir, o QR anterior continua válido até a ativação do novo.</p>
    {status?.pending && !prepared ? <p className="panel-hint">Há um código pendente. Gere outro para recomeçar.</p> : null}
    {prepared ? <div className="qr-preview"><QRCodeSVG ref={svg} value={prepared.token} size={220} marginSize={4} title="QR Code do passageiro" /></div> : null}
    {message ? <p className="panel-hint" role="status">{message}</p> : null}
    <div className="nfc-actions">
      <Button type="button" variant="quiet" disabled={busy || !status} onClick={() => void prepare()}>{status?.active ? 'Gerar substituto' : 'Gerar QR Code'}</Button>
      {prepared ? <Button type="button" variant="quiet" disabled={busy} onClick={save}>Baixar QR Code</Button> : null}
      {prepared ? <Button type="button" variant="quiet" disabled={busy} onClick={print}>Imprimir QR Code</Button> : null}
      {prepared && status?.pending ? <Button type="button" disabled={busy} onClick={() => void activate()}>Confirmar e ativar</Button> : null}
      {status?.active || status?.pending ? <Button type="button" variant="danger" disabled={busy} onClick={() => void revoke()}>Desativar QR Code</Button> : null}
    </div>
  </section>;
}
