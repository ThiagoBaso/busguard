import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame, TextInput } from '../components';
import { includesText, useApiData, usePagination } from '../hooks';
import type { Driver, DriverVehicle, Trip, User, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type VehiclesData = { vehicles: Vehicle[]; drivers: Driver[]; users: User[]; assignments: DriverVehicle[]; trips: Trip[] };
type VehicleForm = { model: string; plate: string; capacity: string; driver_id: string };
const blankForm: VehicleForm = { model: '', plate: '', capacity: '', driver_id: '' };

const loadVehicles = async (): Promise<VehiclesData> => {
  const [vehicles, drivers, users, assignments, trips] = await Promise.all([
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Driver[]>('/admin/drivers?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<DriverVehicle[]>('/admin/driver-vehicles?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
  ]);
  return { vehicles, drivers, users, assignments, trips };
};

export function VehiclesPage({ notify, navigate }: ScreenProps) {
  const query = useApiData(loadVehicles, ['vehicles', 'drivers', 'users', 'driver_vehicles', 'trips']);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm>(blankForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const drivers = data?.drivers ?? [];
  const vehicles = data?.vehicles ?? [];
  const usersById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);
  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const activeAssignments = data?.assignments.filter((item) => item.active) ?? [];
  const activeVehicleIds = new Set((data?.trips ?? []).filter((trip) => trip.status === 'in_progress').map((trip) => trip.vehicle_id));
  const filtered = vehicles.filter((vehicle) => {
    const assignment = activeAssignments.find((item) => item.vehicle_id === vehicle.id);
    const driver = assignment ? driverById.get(assignment.driver_id) : undefined;
    const user = driver ? usersById.get(driver.users_id) : undefined;
    return includesText([vehicle.model, vehicle.plate, vehicle.capacity, user?.name], search);
  });
  const pagination = usePagination(filtered);

  function openForm(vehicle?: Vehicle) {
    setEditing(vehicle ?? null);
    const association = vehicle ? activeAssignments.find((item) => item.vehicle_id === vehicle.id) : undefined;
    setForm(vehicle ? { model: vehicle.model, plate: vehicle.plate, capacity: String(vehicle.capacity), driver_id: association ? String(association.driver_id) : '' } : blankForm);
    setModalOpen(true);
  }

  async function saveAssociation(vehicleId: number, driverId: number | null) {
    if (!data) return;
    const current = data.assignments.find((item) => item.vehicle_id === vehicleId && item.active);
    if (current && current.driver_id !== driverId) {
      await apiFetch(`/admin/driver-vehicles/${current.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
    }
    if (driverId == null) return;
    const otherVehicle = data.assignments.find((item) => item.driver_id === driverId && item.active && item.vehicle_id !== vehicleId);
    if (otherVehicle) {
      await apiFetch(`/admin/driver-vehicles/${otherVehicle.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
    }
    const existing = data.assignments.find((item) => item.vehicle_id === vehicleId && item.driver_id === driverId);
    if (existing) {
      if (!existing.active) await apiFetch(`/admin/driver-vehicles/${existing.id}`, { method: 'PUT', body: JSON.stringify({ active: true }) });
    } else {
      await apiFetch('/admin/driver-vehicles', { method: 'POST', body: JSON.stringify({ driver_id: driverId, vehicle_id: vehicleId, active: true }) });
    }
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await apiFetch<Vehicle>(editing ? `/admin/vehicles/${editing.id}` : '/admin/vehicles', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ model: form.model, plate: form.plate.toUpperCase(), capacity: Number(form.capacity) }),
      });
      await saveAssociation(saved.id, form.driver_id ? Number(form.driver_id) : null);
      setModalOpen(false);
      await query.reload();
      notify(editing ? 'Veículo atualizado.' : 'Veículo cadastrado.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível salvar o veículo.', 'error'); }
    finally { setBusy(false); }
  }

  async function removeVehicle(vehicle: Vehicle) {
    if (!window.confirm(`Excluir ${vehicle.model} · ${vehicle.plate}?`)) return;
    try {
      await apiFetch<void>(`/admin/vehicles/${vehicle.id}`, { method: 'DELETE' });
      await query.reload();
      notify('Veículo excluído.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível excluir o veículo.', 'error'); }
  }

  const inOperation = activeVehicleIds.size;
  const available = Math.max(0, vehicles.length - inOperation);

  return (
    <>
      <PageTitle title="Veículos" description="Cadastro e gerenciamento dos ônibus do transporte escolar." action={<Button onClick={() => openForm()}>＋ Cadastrar veículo</Button>} />
      {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
        <div className="summary-grid summary-grid-three">
          <SummaryCard label="TOTAL DE VEÍCULOS" value={vehicles.length} detail="Ônibus cadastrados" icon="🚌" />
          <SummaryCard label="EM OPERAÇÃO" value={inOperation} detail="Veículos com viagem ativa" icon="⇄" />
          <SummaryCard label="DISPONÍVEIS" value={available} detail="Sem viagem em andamento" icon="✓" />
        </div>
        <Panel className="table-panel">
          <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar por placa ou identificação..." /><span>{filtered.length} veículos cadastrados</span></div>
          {pagination.visible.length ? <TableFrame>
            <thead><tr><th>IDENTIFICAÇÃO</th><th>PLACA</th><th>CAPACIDADE</th><th>MOTORISTA</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
            <tbody>{pagination.visible.map((vehicle) => {
              const assignment = activeAssignments.find((item) => item.vehicle_id === vehicle.id);
              const driver = assignment ? driverById.get(assignment.driver_id) : undefined;
              const user = driver ? usersById.get(driver.users_id) : undefined;
              const activeTrip = data.trips.find((trip) => trip.vehicle_id === vehicle.id && trip.status === 'in_progress');
              return <tr key={vehicle.id}>
                <td><strong>{vehicle.model}</strong></td><td>{vehicle.plate}</td><td>{vehicle.capacity} passageiros</td><td>{user?.name || 'Não associado'}</td>
                <td><Pill tone={activeTrip ? 'success' : 'warning'}>{activeTrip ? 'Em andamento' : 'Disponível'}</Pill></td>
                <td className="action-cell">{activeTrip ? <Button variant="plain" onClick={() => navigate('gps', activeTrip.id)}>GPS</Button> : null}<Button variant="quiet" onClick={() => openForm(vehicle)}>Editar</Button><Button variant="danger" onClick={() => void removeVehicle(vehicle)}>Excluir</Button></td>
              </tr>;
            })}</tbody>
          </TableFrame> : <EmptyState title="Nenhum veículo encontrado" message={search ? 'A busca não encontrou veículos.' : 'Cadastre o primeiro veículo da frota.'} action={!search ? <Button onClick={() => openForm()}>Cadastrar veículo</Button> : undefined} />}
          <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="veículos" />
        </Panel>
        <div className="split-grid">
          <Panel title="Cadastro de veículo" subtitle="A identificação usa o modelo informado pela administração."><Button variant="quiet" onClick={() => openForm()}>Adicionar veículo</Button></Panel>
          <Panel title="Associação do veículo" subtitle="Motoristas e veículos são vinculados pelo cadastro de motorista."><div className="detail-list"><div><span>Motoristas cadastrados</span><strong>{drivers.length}</strong></div><div><span>Veículos associados</span><strong>{activeAssignments.length}</strong></div></div></Panel>
        </div>
      </> : null}

      {modalOpen ? <Modal title={editing ? 'Editar veículo' : 'Cadastro de veículo'} eyebrow={editing ? `VEÍCULO #${editing.id}` : 'NOVA FROTA'} onClose={() => setModalOpen(false)} onSubmit={(event) => void saveVehicle(event)} submitLabel="Salvar veículo" busy={busy}>
        <div className="form-grid">
          <Field label="Identificação"><TextInput value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} maxLength={100} placeholder="Ex.: Ônibus 05" required /></Field>
          <Field label="Placa"><TextInput value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value.toUpperCase() })} maxLength={10} placeholder="ABC-1234" required /></Field>
          <Field label="Capacidade"><TextInput type="number" min="1" step="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} required /></Field>
          <Field label="Motorista responsável"><SelectInput value={form.driver_id} onChange={(event) => setForm({ ...form, driver_id: event.target.value })}><option value="">Sem associação</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{usersById.get(driver.users_id)?.name || `Motorista ${driver.id}`}</option>)}</SelectInput></Field>
        </div>
      </Modal> : null}
    </>
  );
}
