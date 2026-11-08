import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame } from '../components';
import { dateIsToday, includesText, useApiData, usePagination } from '../hooks';
import type { AccessAction, AccessEvent, AccessEventReview, Passenger, Trip, User, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type EventsData = { events: AccessEvent[]; passengers: Passenger[]; vehicles: Vehicle[]; trips: Trip[]; users: User[]; reviews: AccessEventReview[] };
function eventDateTime(value: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Não informado' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
const loadEvents = async (): Promise<EventsData> => {
  const [events, pendingEvents, passengers, vehicles, trips, users, reviews] = await Promise.all([
    apiFetch<AccessEvent[]>('/admin/access-events?limit=500'),
    apiFetch<AccessEvent[]>('/admin/access-events?review_status=pending&limit=500'),
    apiFetch<Passenger[]>('/admin/passengers?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<AccessEventReview[]>('/admin/access-event-reviews?limit=500'),
  ]);
  return { events: [...new Map([...pendingEvents, ...events].map((event) => [event.id, event])).values()], passengers, vehicles, trips, users, reviews };
};

export function EventsPage({ notify }: ScreenProps) {
  const query = useApiData(loadEvents, ['access_events', 'access_event_reviews', 'passengers', 'vehicles', 'trips', 'users']);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [passengerId, setPassengerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [action, setAction] = useState<AccessAction>('entry');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<AccessEvent | null>(null);
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted');
  const [reviewReason, setReviewReason] = useState('');
  const passengerById = useMemo(() => new Map((data?.passengers ?? []).map((item) => [item.id, item])), [data]);
  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((item) => [item.id, item])), [data]);
  const events = data?.events ?? [];
  const filtered = events.filter((event) => {
    const passenger = passengerById.get(event.passenger_id);
    const vehicle = vehicleById.get(event.vehicle_id);
    return (actionFilter === 'all' || event.action === actionFilter) && (reviewFilter === 'all' || event.review_status === reviewFilter) && includesText([passenger?.name, passenger?.cpf, vehicle?.plate, vehicle?.model, event.action], search);
  });
  const pagination = usePagination(filtered);
  const today = events.filter((event) => event.review_status === 'accepted' && dateIsToday(event.created_at));
  const entries = today.filter((event) => event.action === 'entry').length;
  const exits = today.filter((event) => event.action === 'exit').length;

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
        <SummaryCard label="EVENTOS HOJE" value={today.length} detail="Embarques e desembarques" icon="☑" />
        <SummaryCard label="EMBARQUES HOJE" value={entries} detail="Acessos registrados" icon="↗" />
        <SummaryCard label="DESEMBARQUES HOJE" value={exits} detail="Saídas registradas" icon="↙" />
      </div>
      <Panel className="table-panel">
        <div className="table-toolbar table-toolbar-wide"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar passageiro ou veículo..." /><div className="toolbar-filters"><SelectInput aria-label="Filtrar por evento" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">Todos os eventos</option><option value="entry">Embarques</option><option value="exit">Desembarques</option></SelectInput><SelectInput aria-label="Filtrar por revisão" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}><option value="all">Todas as situações</option><option value="pending">Aguardando revisão</option><option value="accepted">Confirmados</option><option value="rejected">Rejeitados</option></SelectInput></div></div>
        <p className="panel-hint" style={{ padding: '0 17px' }}>Exibindo até 500 pendências mais antigas e 500 eventos recentes.</p>
        {pagination.visible.length ? <TableFrame><thead><tr><th>PASSAGEIRO</th><th>EVENTO</th><th>VEÍCULO</th><th>VIAGEM</th><th>HORÁRIOS</th><th>REVISÃO</th></tr></thead><tbody>{pagination.visible.map((item) => {
          const passenger = passengerById.get(item.passenger_id);
          const vehicle = vehicleById.get(item.vehicle_id);
          const trip = data.trips.find((current) => current.id === item.trip_id);
          const review = data.reviews.find((current) => current.event_id === item.id);
          const actor = data.users.find((current) => current.id === item.actor_id);
          const reviewer = data.users.find((current) => current.id === review?.reviewer_id);
          return <tr key={item.id}><td><strong>{passenger?.name || `Passageiro ${item.passenger_id}`}</strong></td><td><Pill tone={item.action === 'entry' ? 'success' : 'blue'}>{item.action === 'entry' ? 'Embarque' : 'Desembarque'}</Pill><small className="table-subline">{actor?.name || (item.actor_id ? `Usuário ${item.actor_id}` : 'Autor não registrado')}</small></td><td>{vehicle ? <>{vehicle.model}<small className="table-subline">{vehicle.plate}</small></> : `Veículo ${item.vehicle_id}`}</td><td>{trip ? `#${String(trip.id).padStart(3, '0')}` : 'Sem vínculo registrado'}</td><td>Recebido: {eventDateTime(item.created_at)}<small className="table-subline">Informado: {eventDateTime(item.occurred_at)}</small></td><td><Pill tone={item.review_status === 'pending' ? 'warning' : item.review_status === 'rejected' ? 'danger' : 'success'}>{item.review_status === 'pending' ? 'Aguardando revisão' : item.review_status === 'rejected' ? 'Rejeitado' : 'Confirmado'}</Pill>{item.review_reason ? <small className="table-subline">{item.review_reason}</small> : null}{review ? <small className="table-subline">{reviewer?.name || `Usuário ${review.reviewer_id}`} · {eventDateTime(review.created_at)}: {review.reason}</small> : null}{item.review_status === 'pending' ? <Button variant="plain" onClick={() => { setDecision('accepted'); setReviewReason(''); setReviewing(item); }}>Revisar</Button> : null}</td></tr>;
        })}</tbody></TableFrame> : <EmptyState title="Nenhum evento encontrado" message={search || actionFilter !== 'all' ? 'A busca ou os filtros não encontraram eventos.' : 'Os registros aparecerão aqui quando houver embarques ou desembarques.'} action={!events.length ? <Button onClick={() => setModalOpen(true)}>Registrar acesso</Button> : undefined} />}
        <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="eventos" />
      </Panel>
    </> : null}
    {modalOpen ? <Modal title="Registrar embarque ou desembarque" eyebrow="NOVO EVENTO" onClose={() => setModalOpen(false)} onSubmit={(event) => void saveEvent(event)} submitLabel="Registrar evento" busy={busy}>
      <div className="form-grid"><Field label="Passageiro"><SelectInput value={passengerId} onChange={(event) => setPassengerId(event.target.value)} required><option value="">Selecionar passageiro</option>{(data?.passengers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field><Field label="Veículo"><SelectInput value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required><option value="">Selecionar veículo</option>{(data?.vehicles ?? []).map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.model}</option>)}</SelectInput></Field><Field label="Tipo de evento"><SelectInput value={action} onChange={(event) => setAction(event.target.value as AccessAction)}><option value="entry">Embarque</option><option value="exit">Desembarque</option></SelectInput></Field></div>
      <p className="panel-hint">O passageiro deve estar vinculado à rota de uma viagem em andamento do veículo.</p>
    </Modal> : null}
    {reviewing ? <Modal title="Revisar evento" eyebrow={`VIAGEM #${reviewing.trip_id ?? '—'}`} onClose={() => setReviewing(null)} onSubmit={(event) => void submitReview(event)} submitLabel="Salvar revisão" busy={busy}>
      <p className="panel-hint">{reviewing.review_reason} Confira os registros da viagem e confirme a situação com o motorista antes de decidir.</p>
      <p className="panel-hint">Passageiro: {passengerById.get(reviewing.passenger_id)?.name || `#${reviewing.passenger_id}`} · {reviewing.action === 'entry' ? 'Embarque' : 'Desembarque'} · Informado: {eventDateTime(reviewing.occurred_at)} · Recebido: {eventDateTime(reviewing.created_at)}.</p>
      <p className="panel-hint">Operador: {data?.users.find((user) => user.id === reviewing.actor_id)?.name || 'Não informado'} · Identificador: {reviewing.event_uuid || 'Não informado'}</p>
      <div className="form-grid"><Field label="Decisão"><SelectInput value={decision} onChange={(event) => setDecision(event.target.value as 'accepted' | 'rejected')}><option value="accepted">Confirmar evento</option><option value="rejected">Rejeitar evento</option></SelectInput></Field><Field label="Motivo da decisão"><input className="input" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} maxLength={1000} required /></Field></div>
    </Modal> : null}
  </>;
}
