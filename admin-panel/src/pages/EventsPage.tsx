import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame } from '../components';
import { useApiData } from '../hooks';
import type { AccessAction, AccessEvent, EventHistoryItem, EventHistoryPage, Passenger, TripManifest, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

function eventDateTime(value: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Não informado' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
const pageSize = 10;
function historyQuery(page: number, search: string, action: string, reviewStatus: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const params = new URLSearchParams({ limit: String(pageSize), offset: String((page - 1) * pageSize), today_start: start.toISOString(), today_end: end.toISOString() });
  if (search.trim()) params.set('search', search.trim());
  if (action !== 'all') params.set('action', action);
  if (reviewStatus !== 'all') params.set('review_status', reviewStatus);
  return `/admin/event-history?${params}`;
}
const loadOptions = async () => {
  const [passengers, vehicles] = await Promise.all([apiFetch<Passenger[]>('/admin/passengers?limit=500'), apiFetch<Vehicle[]>('/admin/vehicles?limit=500')]);
  return { passengers, vehicles };
};

export function EventsPage({ notify, initialEventFilter }: ScreenProps) {
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<string>(initialEventFilter ?? 'all');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [passengerId, setPassengerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [action, setAction] = useState<AccessAction>('entry');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<EventHistoryItem | null>(null);
  const [timeline, setTimeline] = useState<EventHistoryPage | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineError, setTimelineError] = useState('');
  const [manifest, setManifest] = useState<TripManifest | null>(null);
  const [manifestStatus, setManifestStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted');
  const [reviewReason, setReviewReason] = useState('');
  const query = useApiData(() => apiFetch<EventHistoryPage>(historyQuery(page, searchTerm, actionFilter, reviewFilter)), ['access_events', 'access_event_reviews', 'passengers', 'vehicles', 'users']);
  const options = useApiData(loadOptions, ['passengers', 'vehicles']);
  const data = query.data;
  const initialQuery = useRef(true);
  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); setSearchTerm(search); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (initialQuery.current) { initialQuery.current = false; return; }
    void query.reload().catch(() => undefined);
  }, [page, searchTerm, actionFilter, reviewFilter, query.reload]);
  useEffect(() => {
    if (!reviewing?.trip_id) { setTimeline(null); setManifest(null); return; }
    const controller = new AbortController();
    setTimeline(null); setTimelineError('');
    setManifest(null); setManifestStatus('loading');
    const params = new URLSearchParams({ trip_id: String(reviewing.trip_id), passenger_id: String(reviewing.passenger_id), order: 'chronological', limit: '10', offset: String((timelinePage - 1) * 10) });
    void apiFetch<EventHistoryPage>(`/admin/event-history?${params}`, { signal: controller.signal }).then(setTimeline).catch((error) => { if (!controller.signal.aborted) setTimelineError(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.'); });
    void apiFetch<TripManifest>(`/admin/trips/${reviewing.trip_id}/manifest`, { signal: controller.signal }).then(value => { setManifest(value); setManifestStatus('ready'); }).catch(error => { if (!controller.signal.aborted) setManifestStatus(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error'); });
    return () => controller.abort();
  }, [reviewing, timelinePage]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  useEffect(() => { if (data && !query.loading && page > pages) setPage(pages); }, [data, query.loading, page, pages]);

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await apiFetch<AccessEvent>('/vehicles/access', { method: 'POST', body: JSON.stringify({ passenger_id: Number(passengerId), vehicle_id: Number(vehicleId), action }) });
      setModalOpen(false);
      setPassengerId('');
      await query.reload();
      notify(saved.review_status === 'pending' ? 'Evento registrado e aguardando revisão.' : action === 'entry' ? 'Embarque registrado.' : 'Desembarque registrado.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível registrar o evento.', 'error'); }
    finally { setBusy(false); }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing || reviewReason.trim().length < 10) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/access-events/${reviewing.id}/review`, { method: 'POST', body: JSON.stringify({ decision, reason: reviewReason.trim() }) });
      setReviewing(null);
      setReviewReason('');
      await query.reload();
      notify('Revisão registrada.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível registrar a revisão.', 'error'); }
    finally { setBusy(false); }
  }

  return <>
    <PageTitle title="Embarques e desembarques" description="Consulte os registros de acesso e registre eventos operacionais." action={<Button onClick={() => setModalOpen(true)}>＋ Registrar acesso</Button>} />
    {query.error && data ? <div className="inline-error">Não foi possível atualizar. Os dados exibidos são da consulta anterior.</div> : null}
    {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
      <div className="summary-grid summary-grid-three">
        <SummaryCard label="EVENTOS HOJE" value={data.summary.entries_today + data.summary.exits_today} detail="Registros confirmados" icon="☑" />
        <SummaryCard label="EMBARQUES HOJE" value={data.summary.entries_today} detail="Acessos registrados" icon="↗" />
        <SummaryCard label="PENDENTES DE REVISÃO" value={data.summary.pending} detail="Em todas as viagens" icon="!" />
      </div>
      <Panel className="table-panel">
        <div className="table-toolbar table-toolbar-wide"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar passageiro ou veículo..." /><div className="toolbar-filters"><SelectInput aria-label="Filtrar por evento" value={actionFilter} onChange={(event) => { setPage(1); setActionFilter(event.target.value); }}><option value="all">Todos os eventos</option><option value="entry">Embarques</option><option value="exit">Desembarques</option></SelectInput><SelectInput aria-label="Filtrar por revisão" value={reviewFilter} onChange={(event) => { setPage(1); setReviewFilter(event.target.value); }}><option value="all">Todas as situações</option><option value="pending">Aguardando revisão</option><option value="accepted">Confirmados</option><option value="rejected">Rejeitados</option></SelectInput></div></div>
        <p className="panel-hint" style={{ padding: '0 17px' }}>{query.loading ? 'Atualizando consulta…' : `${data.total} evento(s) encontrado(s).`}</p>
        {data.items.length ? <TableFrame><thead><tr><th>PASSAGEIRO</th><th>EVENTO</th><th>VEÍCULO</th><th>VIAGEM</th><th>HORÁRIOS</th><th>REVISÃO</th></tr></thead><tbody>{data.items.map((item) => (
          <tr key={item.id}><td><strong>{item.passenger_name}</strong></td><td><Pill tone={item.action === 'entry' ? 'success' : 'blue'}>{item.action === 'entry' ? 'Embarque' : 'Desembarque'}</Pill><small className="table-subline">{item.actor_name || 'Autor não registrado'}</small></td><td>{item.vehicle_model}<small className="table-subline">{item.vehicle_plate}</small></td><td>{item.trip_id ? `#${String(item.trip_id).padStart(3, '0')}` : 'Sem vínculo registrado'}</td><td>Recebido: {eventDateTime(item.created_at)}<small className="table-subline">Informado: {eventDateTime(item.occurred_at)}</small></td><td><Pill tone={item.review_status === 'pending' ? 'warning' : item.review_status === 'rejected' ? 'danger' : 'success'}>{item.review_status === 'pending' ? 'Aguardando revisão' : item.review_status === 'rejected' ? 'Rejeitado' : 'Confirmado'}</Pill>{item.review_reason ? <small className="table-subline">{item.review_reason}</small> : null}{item.review ? <small className="table-subline">{item.reviewer_name || `Usuário ${item.review.reviewer_id}`} · {eventDateTime(item.review.created_at)}: {item.review.reason}</small> : null}<Button variant="plain" onClick={() => { setDecision('accepted'); setReviewReason(''); setTimelinePage(1); setReviewing(item); }}>{item.review_status === 'pending' ? 'Revisar' : 'Histórico'}</Button></td></tr>
        ))}</tbody></TableFrame> : <EmptyState title="Nenhum evento encontrado" message="A busca ou os filtros não encontraram eventos." />}
        <Pagination page={page} pages={pages} onChange={setPage} count={data.items.length} noun="eventos" />
      </Panel>
    </> : null}
    {modalOpen ? <Modal title="Registrar embarque ou desembarque" eyebrow="NOVO EVENTO" onClose={() => setModalOpen(false)} onSubmit={(event) => void saveEvent(event)} submitLabel="Registrar evento" busy={busy}>
      {options.error ? <div className="inline-error">Não foi possível carregar passageiros e veículos.</div> : null}
      <div className="form-grid"><Field label="Passageiro"><SelectInput value={passengerId} onChange={(event) => setPassengerId(event.target.value)} required><option value="">Selecionar passageiro</option>{(options.data?.passengers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field><Field label="Veículo"><SelectInput value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required><option value="">Selecionar veículo</option>{(options.data?.vehicles ?? []).map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.model}</option>)}</SelectInput></Field><Field label="Tipo de evento"><SelectInput value={action} onChange={(event) => setAction(event.target.value as AccessAction)}><option value="entry">Embarque</option><option value="exit">Desembarque</option></SelectInput></Field></div>
      <p className="panel-hint">O passageiro deve estar vinculado à rota de uma viagem em andamento do veículo.</p>
    </Modal> : null}
    {reviewing ? <Modal title={reviewing.review_status === 'pending' ? 'Revisar evento' : 'Histórico do passageiro'} eyebrow={`VIAGEM #${reviewing.trip_id ?? '—'}`} onClose={() => setReviewing(null)} onSubmit={reviewing.review_status === 'pending' ? (event) => void submitReview(event) : undefined} submitLabel="Salvar revisão" busy={busy} wide>
      {reviewing.review_status === 'pending' ? <p className="panel-hint">{reviewing.review_reason} Confira os registros da viagem e confirme a situação com o motorista antes de decidir.</p> : null}
      <p className="panel-hint">Passageiro: {reviewing.passenger_name} · {reviewing.action === 'entry' ? 'Embarque' : 'Desembarque'} · Informado: {eventDateTime(reviewing.occurred_at)} · Recebido: {eventDateTime(reviewing.created_at)}.</p>
      <p className="panel-hint">Operador: {reviewing.actor_name || 'Não informado'} · Identificador: {reviewing.event_uuid || 'Não informado'}</p>
      {reviewing.trip_id ? manifestStatus === 'ready' && manifest ? <p className="panel-hint">Vínculos registrados no início: motorista {manifest.driver_name || `#${manifest.driver_user_id}`} · {manifest.passengers.some(item => item.passenger_id === reviewing.passenger_id) ? `passageiro vinculado${manifest.passengers.find(item => item.passenger_id === reviewing.passenger_id)?.stop_sequence ? ` à parada ${manifest.passengers.find(item => item.passenger_id === reviewing.passenger_id)?.stop_sequence}` : ''}` : 'passageiro não consta nos vínculos iniciais'} · {eventDateTime(manifest.captured_at)}.</p> : manifestStatus === 'unavailable' ? <p className="panel-hint">Vínculos do início indisponíveis para esta viagem anterior.</p> : manifestStatus === 'error' ? <p className="inline-error">Não foi possível carregar os vínculos da viagem.</p> : null : null}
      {!reviewing.trip_id ? <p className="panel-hint">Este registro antigo não possui vínculo de viagem para agrupar o histórico.</p> : timelineError ? <div className="inline-error">{timelineError}</div> : timeline ? <div><strong>Eventos nesta viagem</strong><div className="event-timeline">{timeline.items.map(item => <div key={item.id} className="event-timeline-item"><strong>{item.action === 'entry' ? 'Embarque' : 'Desembarque'} · {item.review_status === 'pending' ? 'Em revisão' : item.review_status === 'rejected' ? 'Rejeitado' : 'Confirmado'}</strong><small>Informado: {eventDateTime(item.occurred_at)} · Recebido: {eventDateTime(item.created_at)} · {item.actor_name || 'Autor não registrado'}</small>{item.review ? <small>Revisão: {item.reviewer_name || `Usuário ${item.review.reviewer_id}`} · {eventDateTime(item.review.created_at)} · {item.review.reason}</small> : null}</div>)}</div><Pagination page={timelinePage} pages={Math.max(1, Math.ceil(timeline.total / 10))} onChange={setTimelinePage} count={timeline.items.length} noun="eventos" /></div> : <LoadingState label="Carregando histórico…" />}
      {reviewing.review_status === 'pending' ? <div className="form-grid"><Field label="Decisão"><SelectInput value={decision} onChange={(event) => setDecision(event.target.value as 'accepted' | 'rejected')}><option value="accepted">Confirmar evento</option><option value="rejected">Rejeitar evento</option></SelectInput></Field><Field label="Motivo da decisão"><input className="input" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} maxLength={1000} required /></Field></div> : null}
    </Modal> : null}
  </>;
}
