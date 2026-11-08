import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, SummaryCard, TableFrame, TextInput, formatDate } from '../components';
import { digits, includesText, useApiData, usePagination } from '../hooks';
import type { Cnh, Driver, DriverVehicle, Trip, User, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type DriversData = { drivers: Driver[]; cnhs: Cnh[]; users: User[]; vehicles: Vehicle[]; assignments: DriverVehicle[]; trips: Trip[] };
type DriverForm = {
  name: string; email: string; password: string; phone: string; cpf: string; rg: string;
  numero_registro: string; numero_espelho: string; categoria: string; data_emissao: string;
  data_validade: string; data_primeira_habilitacao: string; uf_emissao: string; status_cnh: string;
  observacoes: string; vehicle_id: string;
};

const initialForm: DriverForm = {
  name: '', email: '', password: '', phone: '', cpf: '', rg: '', numero_registro: '', numero_espelho: '',
  categoria: 'D', data_emissao: '', data_validade: '', data_primeira_habilitacao: '', uf_emissao: '',
  status_cnh: 'Ativa', observacoes: '', vehicle_id: '',
};

const loadDrivers = async (): Promise<DriversData> => {
  const [drivers, cnhs, users, vehicles, assignments, trips] = await Promise.all([
    apiFetch<Driver[]>('/admin/drivers?limit=500'),
    apiFetch<Cnh[]>('/admin/cnh?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<DriverVehicle[]>('/admin/driver-vehicles?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
  ]);
  return { drivers, cnhs, users, vehicles, assignments, trips };
};

export function DriversPage({ notify }: ScreenProps) {
  const query = useApiData(loadDrivers, ['drivers', 'cnh', 'users', 'vehicles', 'driver_vehicles', 'trips']);
  const data = query.data;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverForm>(initialForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const userById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);
  const cnhById = useMemo(() => new Map((data?.cnhs ?? []).map((cnh) => [cnh.id_cnh, cnh])), [data]);
  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])), [data]);
  const activeAssignments = data?.assignments.filter((item) => item.active) ?? [];
  const inProgress = data?.trips.filter((trip) => trip.status === 'in_progress') ?? [];
  const drivers = data?.drivers ?? [];
  const filtered = drivers.filter((driver) => {
    const user = userById.get(driver.users_id);
    const cnh = cnhById.get(driver.cnh_id_cnh);
    const assignment = activeAssignments.find((item) => item.driver_id === driver.id);
    const vehicle = assignment ? vehicleById.get(assignment.vehicle_id) : undefined;
    return includesText([user?.name, user?.cpf, user?.phone, cnh?.categoria, vehicle?.model, vehicle?.plate], search);
  });
  const pagination = usePagination(filtered);
  const activeLicenseCount = drivers.filter((driver) => {
    const cnh = cnhById.get(driver.cnh_id_cnh);
    return cnh?.status_cnh === 'Ativa' && cnh.data_validade >= new Date().toISOString().slice(0, 10);
  }).length;

  function openForm(driver?: Driver) {
    setEditing(driver ?? null);
    if (!driver) { setForm(initialForm); setModalOpen(true); return; }
    const user = userById.get(driver.users_id);
    const cnh = cnhById.get(driver.cnh_id_cnh);
    const assignment = activeAssignments.find((item) => item.driver_id === driver.id);
    setForm({
      name: user?.name ?? '', email: user?.email ?? '', password: '', phone: user?.phone ?? '', cpf: user?.cpf ?? '', rg: user?.rg ?? '',
      numero_registro: cnh?.numero_registro ?? '', numero_espelho: cnh?.numero_espelho ?? '', categoria: cnh?.categoria ?? 'D',
      data_emissao: cnh?.data_emissao ?? '', data_validade: cnh?.data_validade ?? '',
      data_primeira_habilitacao: cnh?.data_primeira_habilitacao ?? '', uf_emissao: cnh?.uf_emissao ?? '',
      status_cnh: cnh?.status_cnh ?? 'Ativa', observacoes: cnh?.observacoes ?? '', vehicle_id: assignment ? String(assignment.vehicle_id) : '',
    });
    setModalOpen(true);
  }

  async function saveAssignment(driverId: number, vehicleId: number | null) {
    if (!data) return;
    const current = data.assignments.find((item) => item.driver_id === driverId && item.active);
    if (current && current.vehicle_id !== vehicleId) {
      await apiFetch(`/admin/driver-vehicles/${current.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
    }
    if (vehicleId == null) return;
    const existing = data.assignments.find((item) => item.driver_id === driverId && item.vehicle_id === vehicleId);
    if (existing) {
      if (!existing.active) await apiFetch(`/admin/driver-vehicles/${existing.id}`, { method: 'PUT', body: JSON.stringify({ active: true }) });
    } else {
      await apiFetch('/admin/driver-vehicles', { method: 'POST', body: JSON.stringify({ driver_id: driverId, vehicle_id: vehicleId, active: true }) });
    }
  }

  async function saveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const user: Record<string, string> = {
      name: form.name, email: form.email, phone: form.phone,
      cpf: digits(form.cpf), rg: digits(form.rg),
    };
    if (form.password) user.password = form.password;
    const cnh = {
      numero_registro: digits(form.numero_registro), numero_espelho: digits(form.numero_espelho), categoria: form.categoria,
      data_emissao: form.data_emissao, data_validade: form.data_validade,
      data_primeira_habilitacao: form.data_primeira_habilitacao, uf_emissao: form.uf_emissao.toUpperCase(),
      status_cnh: form.status_cnh, observacoes: form.observacoes || null,
    };
    try {
      const profile = await apiFetch<{ driver: Driver }>(editing ? `/admin/driver-profiles/${editing.id}` : '/admin/driver-profiles', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ user, cnh }),
      });
      await saveAssignment(profile.driver.id, form.vehicle_id ? Number(form.vehicle_id) : null);
      setModalOpen(false);
      await query.reload();
      notify(editing ? 'Motorista atualizado.' : 'Motorista cadastrado com CNH.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível salvar o motorista.', 'error'); }
    finally { setBusy(false); }
  }

  async function removeDriver(driver: Driver) {
    const user = userById.get(driver.users_id);
    if (!window.confirm(`Excluir o vínculo de motorista${user ? ` de ${user.name}` : ''}? Contas, CNH e viagens anteriores são preservadas.`)) return;
    try {
      await apiFetch<void>(`/admin/drivers/${driver.id}`, { method: 'DELETE' });
      await query.reload();
      notify('Vínculo de motorista excluído.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível excluir o motorista.', 'error'); }
  }

  return (
    <>
      <PageTitle title="Motoristas" description="Cadastre, edite e gerencie os motoristas, suas CNHs e associações." action={<Button onClick={() => openForm()}>＋ Cadastrar motorista</Button>} />
      {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? (
        <>
          <div className="summary-grid summary-grid-three">
            <SummaryCard label="TOTAL DE MOTORISTAS" value={drivers.length} detail="Perfis registrados" icon="♟" />
            <SummaryCard label="CNHs ATIVAS" value={activeLicenseCount} detail="Dentro da validade" icon="✓" />
            <SummaryCard label="EM VIAGEM" value={inProgress.length} detail="Viagens em operação" icon="🚌" />
          </div>
          <Panel className="table-panel">
            <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar motorista..." /><span>{filtered.length} motoristas cadastrados</span></div>
            {pagination.visible.length ? <TableFrame>
              <thead><tr><th>MOTORISTA</th><th>CPF</th><th>TELEFONE</th><th>CNH</th><th>VEÍCULO ASSOCIADO</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead>
              <tbody>{pagination.visible.map((driver) => {
                const user = userById.get(driver.users_id);
                const cnh = cnhById.get(driver.cnh_id_cnh);
                const assignment = activeAssignments.find((item) => item.driver_id === driver.id);
                const vehicle = assignment ? vehicleById.get(assignment.vehicle_id) : undefined;
                const valid = cnh?.status_cnh === 'Ativa' && Boolean(cnh.data_validade && cnh.data_validade >= new Date().toISOString().slice(0, 10));
                return <tr key={driver.id}>
                  <td><strong>{user?.name || `Motorista ${driver.id}`}</strong></td><td>{user?.cpf || '—'}</td><td>{user?.phone || '—'}</td>
                  <td><Pill tone={valid ? 'success' : 'warning'}>{cnh?.categoria || '—'} · vence {formatDate(cnh?.data_validade)}</Pill></td>
                  <td>{vehicle ? `${vehicle.model} · ${vehicle.plate}` : 'Não associado'}</td><td><Pill tone={valid ? 'success' : 'warning'}>{valid ? 'Ativo' : 'CNH pendente'}</Pill></td>
                  <td className="action-cell"><Button variant="plain" onClick={() => openForm(driver)}>Consultar</Button><Button variant="quiet" onClick={() => openForm(driver)}>Editar</Button><Button variant="danger" onClick={() => void removeDriver(driver)}>Excluir</Button></td>
                </tr>;
              })}</tbody>
            </TableFrame> : <EmptyState title="Nenhum motorista encontrado" message={search ? 'A busca não encontrou motoristas.' : 'Cadastre o primeiro motorista e informe a CNH.'} action={!search ? <Button onClick={() => openForm()}>Cadastrar motorista</Button> : undefined} />}
            <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="motoristas" />
          </Panel>
          <div className="split-grid">
            <Panel title="Associar motorista" subtitle="As associações ativas aparecem no cadastro do motorista.">
              <p className="panel-hint">Escolha um motorista e registre um veículo. A associação também é usada para preparar novas viagens.</p>
              <Button variant="quiet" onClick={() => openForm()}>Gerenciar motorista e veículo</Button>
            </Panel>
            <Panel title="Informações da CNH" subtitle="Dados e validade vêm do cadastro conectado à API.">
              <div className="detail-list"><div><span>Categoria permitida</span><strong>D ou superior</strong></div><div><span>Motoristas ativos</span><strong>{activeLicenseCount}</strong></div><div><span>CNH a vencer ou pendente</span><strong>{drivers.length - activeLicenseCount}</strong></div></div>
            </Panel>
          </div>
        </>
      ) : null}

      {modalOpen ? <Modal title={editing ? 'Editar motorista' : 'Cadastrar motorista'} eyebrow={editing ? `PERFIL #${editing.id}` : 'NOVO MOTORISTA'} onClose={() => setModalOpen(false)} onSubmit={(event) => void saveDriver(event)} submitLabel="Salvar motorista" busy={busy} wide>
        <div className="form-section-title">Dados pessoais e acesso</div>
        <div className="form-grid">
          <Field label="Nome completo" className="field-span-two"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} required /></Field>
          <Field label="E-mail"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={150} required /></Field>
          <Field label={editing ? 'Nova senha (opcional)' : 'Senha inicial'}><TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={editing ? 8 : 8} required={!editing} autoComplete="new-password" /></Field>
          <Field label="CPF"><TextInput value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} maxLength={14} placeholder="Somente números" required /></Field>
          <Field label="RG"><TextInput value={form.rg} onChange={(event) => setForm({ ...form, rg: event.target.value })} maxLength={9} required /></Field>
          <Field label="Telefone"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={19} required /></Field>
        </div>
        <div className="form-section-title">Carteira Nacional de Habilitação</div>
        <div className="form-grid">
          <Field label="Número de registro"><TextInput value={form.numero_registro} onChange={(event) => setForm({ ...form, numero_registro: event.target.value })} maxLength={11} required /></Field>
          <Field label="Número do espelho"><TextInput value={form.numero_espelho} onChange={(event) => setForm({ ...form, numero_espelho: event.target.value })} maxLength={10} required /></Field>
          <Field label="Categoria"><SelectInput value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} required><option value="D">D</option><option value="E">E</option><option value="D/E">D/E</option></SelectInput></Field>
          <Field label="UF emissora"><TextInput value={form.uf_emissao} onChange={(event) => setForm({ ...form, uf_emissao: event.target.value })} maxLength={2} required /></Field>
          <Field label="Data de emissão"><TextInput type="date" value={form.data_emissao} onChange={(event) => setForm({ ...form, data_emissao: event.target.value })} required /></Field>
          <Field label="Validade"><TextInput type="date" value={form.data_validade} onChange={(event) => setForm({ ...form, data_validade: event.target.value })} required /></Field>
          <Field label="1ª habilitação"><TextInput type="date" value={form.data_primeira_habilitacao} onChange={(event) => setForm({ ...form, data_primeira_habilitacao: event.target.value })} required /></Field>
          <Field label="Situação"><SelectInput value={form.status_cnh} onChange={(event) => setForm({ ...form, status_cnh: event.target.value })}><option>Ativa</option><option>Suspensa</option><option>Cassada</option><option>Vencida</option></SelectInput></Field>
          <Field label="Observações"><TextInput value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></Field>
          <Field label="Veículo associado"><SelectInput value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })}><option value="">Sem associação</option>{(data?.vehicles ?? []).map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.model} · {vehicle.plate}</option>)}</SelectInput></Field>
        </div>
      </Modal> : null}
    </>
  );
}
