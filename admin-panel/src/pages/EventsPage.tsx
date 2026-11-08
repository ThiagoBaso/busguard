import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame, formatTime } from '../components';
import { dateIsToday, includesText, useApiData, usePagination } from '../hooks';
import type { AccessAction, AccessEvent, Passenger, Trip, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type EventsData = { events: AccessEvent[]; passengers: Passenger[]; vehicles: Vehicle[]; trips: Trip[] };
const loadEvents = async (): Promise<EventsData> => {
  const [events, passengers, vehicles, trips] = await Promise.all([
    apiFetch<AccessEvent[]>('/admin/access-events?limit=500'),
    apiFetch<Passenger[]>('/admin/passengers?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
  ]);
  return { events, passengers, vehicles, trips };
};

export function EventsPage({ notify }: ScreenProps) {
  const query = useApiData(loadEvents, ['access_events', 'passengers', 'vehicles', 'trips']);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [passengerId, setPassengerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [action, setAction] = useState<AccessAction>('entry');
  const [busy, setBusy] = useState(false);
  const passengerById = useMemo(() => new Map((data?.passengers ?? []).map((item) => [item.id, item])), [data]);
  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((item) => [item.id, item])), [data]);
  const events = data?.events ?? [];
  const filtered = events.filter((event) => {
    const passenger = passengerById.get(event.passenger_id);
    const vehicle = vehicleById.get(event.vehicle_id);
    return (actionFilter === 'all' || event.action === actionFilter) && includesText([passenger?.name, passenger?.cpf, vehicle?.plate, vehicle?.model, event.action], search);
  });
  const pagination = usePagination(filtered);
  const today = events.filter((event) => dateIsToday(event.created_at));
  const entries = today.filter((event) => event.action === 'entry').length;
  const exits = today.filter((event) => event.action === 'exit').length;

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch<AccessEvent>('/vehicles/access', { method: 'POST', body: JSON.stringify({ passenger_id: Number(passengerId), vehicle_id: Number(vehicleId), action }) });
      setModalOpen(false);
      setPassengerId('');
      await query.reload();
      notify(action === 'entry' ? 'Embarque registrado.' : 'Desembarque registrado.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível registrar o evento.', 'error'); }
    finally { setBusy(false); }
  }

  return <>
    <PageTitle title="Embarques e desembarques" description="Consulte os registros de acesso e registre eventos operacionais." action={<Button onClick={() => setModalOpen(true)}>＋ Registrar acesso</Button>} />
    {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
      <div className="summary-grid summary-grid-three">
        <SummaryCard label="EVENTOS HOJE" value={today.length} detail="Embarques e desembarques" icon="☑" />
        <SummaryCard label="EMBARQUES HOJE" value={entries} detail="Acessos registrados" icon="↗" />
        <SummaryCard label="DESEMBARQUES HOJE" value={exits} detail="Saídas registradas" icon="↙" />
      </div>
      <Panel className="table-panel">
        <div className="table-toolbar table-toolbar-wide"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar passageiro ou veículo..." /><div className="toolbar-filters"><SelectInput value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">Todos os eventos</option><option value="entry">Embarques</option><option value="exit">Desembarques</option></SelectInput></div></div>
        {pagination.visible.length ? <TableFrame><thead><tr><th>PASSAGEIRO</th><th>EVENTO</th><th>VEÍCULO</th><th>VIAGEM NO HORÁRIO</th><th>DATA E HORA</th></tr></thead><tbody>{pagination.visible.map((item) => {
          const passenger = passengerById.get(item.passenger_id);
          const vehicle = vehicleById.get(item.vehicle_id);
          const eventTime = new Date(item.created_at).getTime();
          const trip = (data.trips ?? []).find((current) => current.vehicle_id === item.vehicle_id && current.started_at != null && eventTime >= new Date(current.started_at).getTime() && (!current.finished_at || eventTime <= new Date(current.finished_at).getTime()));
          return <tr key={item.id}><td><strong>{passenger?.name || `Passageiro ${item.passenger_id}`}</strong><small className="table-subline">{passenger?.cpf || 'CPF não informado'}</small></td><td><Pill tone={item.action === 'entry' ? 'success' : 'blue'}>{item.action === 'entry' ? 'Embarque' : 'Desembarque'}</Pill></td><td>{vehicle ? <>{vehicle.model}<small className="table-subline">{vehicle.plate}</small></> : `Veículo ${item.vehicle_id}`}</td><td>{trip ? <>#{String(trip.id).padStart(3, '0')}<small className="table-subline">{trip.status === 'in_progress' ? 'Em andamento' : ''}</small></> : '—'}</td><td>{formatTime(item.created_at)}</td></tr>;
        })}</tbody></TableFrame> : <EmptyState title="Nenhum evento encontrado" message={search || actionFilter !== 'all' ? 'A busca ou os filtros não encontraram eventos.' : 'Os registros aparecerão aqui quando houver embarques ou desembarques.'} action={!events.length ? <Button onClick={() => setModalOpen(true)}>Registrar acesso</Button> : undefined} />}
        <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="eventos" />
      </Panel>
    </> : null}
    {modalOpen ? <Modal title="Registrar embarque ou desembarque" eyebrow="NOVO EVENTO" onClose={() => setModalOpen(false)} onSubmit={(event) => void saveEvent(event)} submitLabel="Registrar evento" busy={busy}>
      <div className="form-grid"><Field label="Passageiro"><SelectInput value={passengerId} onChange={(event) => setPassengerId(event.target.value)} required><option value="">Selecionar passageiro</option>{(data?.passengers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field><Field label="Veículo"><SelectInput value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required><option value="">Selecionar veículo</option>{(data?.vehicles ?? []).map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.model}</option>)}</SelectInput></Field><Field label="Tipo de evento"><SelectInput value={action} onChange={(event) => setAction(event.target.value as AccessAction)}><option value="entry">Embarque</option><option value="exit">Desembarque</option></SelectInput></Field></div>
      <p className="panel-hint">O registro é anexado ao histórico operacional com horário gerado pelo servidor.</p>
    </Modal> : null}
  </>;
}
