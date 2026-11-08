import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame, TextInput, formatDate, tripStatusLabel, tripStatusTone } from '../components';
import { includesText, localDateInputValue, useApiData, usePagination } from '../hooks';
import type { Driver, Route, Supervisor, Trip, TripStatus, User, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type TripsData = { trips: Trip[]; routes: Route[]; vehicles: Vehicle[]; drivers: Driver[]; users: User[]; supervisors: Supervisor[] };
type TripForm = { route_id: string; vehicle_id: string; driver_id: string; supervisor_id: string; trip_date: string; scheduled_time: string };
const emptyForm = (): TripForm => ({ route_id: '', vehicle_id: '', driver_id: '', supervisor_id: '', trip_date: localDateInputValue(), scheduled_time: '' });

const loadTrips = async (): Promise<TripsData> => {
  const [trips, routes, vehicles, drivers, users, supervisors] = await Promise.all([
    apiFetch<Trip[]>('/admin/trips?limit=500'),
    apiFetch<Route[]>('/admin/routes?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Driver[]>('/admin/drivers?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<Supervisor[]>('/admin/supervisors?limit=500'),
  ]);
  return { trips, routes, vehicles, drivers, users, supervisors };
};

export function TripsPage({ notify, navigate }: ScreenProps) {
  const query = useApiData(loadTrips, ['trips', 'routes', 'vehicles', 'drivers', 'users', 'supervisors']);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState<TripForm>(emptyForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const routeById = useMemo(() => new Map((data?.routes ?? []).map((route) => [route.id, route])), [data]);
  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])), [data]);
  const driverById = useMemo(() => new Map((data?.drivers ?? []).map((driver) => [driver.id, driver])), [data]);
  const userById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);
  const trips = data?.trips ?? [];
  const filtered = trips.filter((trip) => {
    const vehicle = vehicleById.get(trip.vehicle_id);
    const driver = driverById.get(trip.driver_id);
    const driverName = driver ? userById.get(driver.users_id)?.name : '';
    const route = routeById.get(trip.route_id);
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesDate = !dateFilter || trip.trip_date === dateFilter;
    return matchesStatus && matchesDate && includesText([trip.id, vehicle?.model, vehicle?.plate, driverName, route?.name, tripStatusLabel(trip.status)], search);
  });
  const pagination = usePagination(filtered);

  function openForm(trip?: Trip) {
    setEditing(trip ?? null);
    setForm(trip ? {
      route_id: String(trip.route_id), vehicle_id: String(trip.vehicle_id), driver_id: String(trip.driver_id),
      supervisor_id: trip.supervisor_id == null ? '' : String(trip.supervisor_id), trip_date: trip.trip_date,
      scheduled_time: trip.scheduled_time?.slice(0, 5) ?? '',
    } : emptyForm());
    setModalOpen(true);
  }

  async function saveTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const payload = {
      route_id: Number(form.route_id), vehicle_id: Number(form.vehicle_id), driver_id: Number(form.driver_id),
      supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
      trip_date: form.trip_date, scheduled_time: form.scheduled_time || null,
      ...(editing ? {} : { status: 'scheduled' as TripStatus }),
    };
    try {
      await apiFetch(editing ? `/admin/trips/${editing.id}` : '/admin/trips', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setModalOpen(false);
      await query.reload();
      notify(editing ? 'Viagem atualizada.' : 'Viagem criada.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível salvar a viagem.', 'error'); }
    finally { setBusy(false); }
  }

  async function tripAction(trip: Trip, action: 'start' | 'finish' | 'cancel') {
    const label = action === 'start' ? 'iniciar' : action === 'finish' ? 'concluir' : 'cancelar';
    if (action === 'cancel' && !window.confirm(`Cancelar a viagem #${trip.id}?`)) return;
    try {
      await apiFetch<Trip>(`/admin/trips/${trip.id}/${action}`, { method: 'POST' });
      await query.reload();
      notify(`Viagem #${trip.id} ${action === 'start' ? 'iniciada' : action === 'finish' ? 'concluída' : 'cancelada'}.`);
    } catch (error) { notify(error instanceof Error ? error.message : `Não foi possível ${label} a viagem.`, 'error'); }
  }

  const scheduled = trips.filter((trip) => trip.status === 'scheduled').length;
  const inProgress = trips.filter((trip) => trip.status === 'in_progress').length;
  const completed = trips.filter((trip) => trip.status === 'completed').length;

  return (
    <>
      <PageTitle title="Viagens" description="Crie, edite e acompanhe as viagens do transporte escolar." action={<Button onClick={() => openForm()}>＋ Criar viagem</Button>} />
      {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
        <div className="summary-grid summary-grid-three">
          <SummaryCard label="TOTAL DE VIAGENS" value={trips.length} detail={`${scheduled} programadas`} icon="▤" />
          <SummaryCard label="EM ANDAMENTO" value={inProgress} detail="Viagens em operação" icon="⇄" />
          <SummaryCard label="CONCLUÍDAS" value={completed} detail="Finalizadas" icon="✓" />
        </div>
        <Panel className="table-panel">
          <div className="table-toolbar table-toolbar-wide">
            <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar viagem..." />
            <div className="toolbar-filters"><SelectInput value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="scheduled">Programada</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></SelectInput><TextInput type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filtrar por data" /></div>
          </div>
          {pagination.visible.length ? <TableFrame>
            <thead><tr><th>VIAGEM</th><th>VEÍCULO</th><th>MOTORISTA</th><th>ROTA</th><th>DATA</th><th>HORÁRIO</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
            <tbody>{pagination.visible.map((trip) => {
              const vehicle = vehicleById.get(trip.vehicle_id);
              const driver = driverById.get(trip.driver_id);
              const driverName = driver ? userById.get(driver.users_id)?.name : undefined;
              const route = routeById.get(trip.route_id);
              return <tr key={trip.id}>
                <td><strong>#{String(trip.id).padStart(3, '0')}</strong></td><td>{vehicle?.model || `Veículo ${trip.vehicle_id}`}</td><td>{driverName || '—'}</td><td>{route?.name || '—'}</td>
                <td>{formatDate(trip.trip_date)}</td><td>{trip.scheduled_time?.slice(0, 5) || '—'}</td><td><Pill tone={tripStatusTone(trip.status)}>{tripStatusLabel(trip.status)}</Pill></td>
                <td className="action-cell">
                  {trip.status === 'scheduled' ? <><Button variant="plain" onClick={() => void tripAction(trip, 'start')}>Iniciar</Button><Button variant="quiet" onClick={() => openForm(trip)}>Editar</Button><Button variant="danger" onClick={() => void tripAction(trip, 'cancel')}>Cancelar</Button></> : null}
                  {trip.status === 'in_progress' ? <><Button variant="plain" onClick={() => navigate('gps', trip.id)}>GPS</Button><Button variant="quiet" onClick={() => void tripAction(trip, 'finish')}>Concluir</Button><Button variant="danger" onClick={() => void tripAction(trip, 'cancel')}>Cancelar</Button></> : null}
                  {trip.status === 'completed' || trip.status === 'cancelled' ? <Pill tone="neutral">Encerrada</Pill> : null}
                </td>
              </tr>;
            })}</tbody>
          </TableFrame> : <EmptyState title="Nenhuma viagem encontrada" message={search || dateFilter || statusFilter !== 'all' ? 'A busca ou os filtros não encontraram viagens.' : 'Crie uma viagem com rota, veículo, motorista e horário.'} action={!search && !dateFilter && statusFilter === 'all' ? <Button onClick={() => openForm()}>Criar viagem</Button> : undefined} />}
          <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="viagens" />
        </Panel>
      </> : null}

      {modalOpen ? <Modal title={editing ? 'Editar viagem' : 'Cadastro de viagem'} eyebrow={editing ? `VIAGEM #${editing.id}` : 'NOVA VIAGEM'} onClose={() => setModalOpen(false)} onSubmit={(event) => void saveTrip(event)} submitLabel={editing ? 'Salvar alterações' : 'Criar viagem'} busy={busy}>
        <div className="form-grid">
          <Field label="Rota"><SelectInput value={form.route_id} onChange={(event) => setForm({ ...form, route_id: event.target.value })} required><option value="">Selecionar rota</option>{(data?.routes ?? []).filter((route) => route.active).map((route) => <option value={route.id} key={route.id}>{route.name}</option>)}</SelectInput></Field>
          <Field label="Veículo"><SelectInput value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })} required><option value="">Selecionar veículo</option>{(data?.vehicles ?? []).map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.model} · {vehicle.plate}</option>)}</SelectInput></Field>
          <Field label="Motorista"><SelectInput value={form.driver_id} onChange={(event) => setForm({ ...form, driver_id: event.target.value })} required><option value="">Selecionar motorista</option>{(data?.drivers ?? []).map((driver) => <option value={driver.id} key={driver.id}>{userById.get(driver.users_id)?.name || `Motorista ${driver.id}`}</option>)}</SelectInput></Field>
          <Field label="Supervisor (opcional)"><SelectInput value={form.supervisor_id} onChange={(event) => setForm({ ...form, supervisor_id: event.target.value })}><option value="">Sem supervisor</option>{(data?.supervisors ?? []).map((supervisor) => <option value={supervisor.id} key={supervisor.id}>{userById.get(supervisor.user_id)?.name || `Supervisor ${supervisor.id}`}</option>)}</SelectInput></Field>
          <Field label="Data da viagem"><TextInput type="date" value={form.trip_date} onChange={(event) => setForm({ ...form, trip_date: event.target.value })} required /></Field>
          <Field label="Horário previsto"><TextInput type="time" value={form.scheduled_time} onChange={(event) => setForm({ ...form, scheduled_time: event.target.value })} /></Field>
        </div>
        {editing ? <p className="panel-hint">O estado da viagem é alterado pelos controles de iniciar, concluir ou cancelar.</p> : null}
      </Modal> : null}
    </>
  );
}
