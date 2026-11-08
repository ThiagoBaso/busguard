import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, Pill, SearchBox, SelectInput, TableFrame, TextInput, formatAddress, formatDate } from '../components';
import { CoordinatesEditor, parseCoordinates } from '../CoordinatesEditor';
import { digits, includesText, useApiData, usePagination } from '../hooks';
import type { Address, Passenger, PassengerResponsible, Responsible, User } from '../types';
import type { ScreenProps } from '../pageTypes';

type PassengerData = { passengers: Passenger[]; addresses: Address[]; links: PassengerResponsible[]; responsibles: Responsible[]; users: User[] };
type PassengerForm = { name: string; birth_date: string; rg: string; cpf: string; addresses_id: string };
type AddressForm = { cep: string; rua: string; numero: string; bairro: string; cidade: string; estado: string; complemento: string; latitude: string; longitude: string };

const emptyPassenger: PassengerForm = { name: '', birth_date: '', rg: '', cpf: '', addresses_id: '' };
const emptyAddress: AddressForm = { cep: '', rua: '', numero: '', bairro: '', cidade: 'Marília', estado: 'SP', complemento: '', latitude: '', longitude: '' };
const loadPassengers = async (): Promise<PassengerData> => {
  const [passengers, addresses, links, responsibles, users] = await Promise.all([
    apiFetch<Passenger[]>('/admin/passengers?limit=500'),
    apiFetch<Address[]>('/admin/addresses?limit=500'),
    apiFetch<PassengerResponsible[]>('/admin/passenger-responsibles?limit=500'),
    apiFetch<Responsible[]>('/admin/responsibles?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
  ]);
  return { passengers, addresses, links, responsibles, users };
};

export function PassengersPage({ notify }: ScreenProps) {
  const query = useApiData(loadPassengers, ['passengers', 'addresses', 'passengers_responsibles', 'responsibles', 'users']);
  const { data } = query;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);
  const [form, setForm] = useState<PassengerForm>(emptyPassenger);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [formOpen, setFormOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [responsibleId, setResponsibleId] = useState('');

  const passengers = data?.passengers ?? [];
  const addresses = data?.addresses ?? [];
  const addressById = useMemo(() => new Map(addresses.map((address) => [address.id, address])), [addresses]);
  const responsibleById = useMemo(() => new Map((data?.responsibles ?? []).map((person) => [person.id, person])), [data]);
  const userById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);
  const links = data?.links ?? [];
  const filtered = passengers.filter((passenger) => {
    const link = links.find((item) => item.passengers_id === passenger.id);
    const responsible = link ? responsibleById.get(link.responsible_id) : undefined;
    const user = responsible ? userById.get(responsible.users_id) : undefined;
    return includesText([passenger.name, passenger.cpf, passenger.rg, addressById.get(passenger.addresses_id)?.rua, user?.name], search);
  });
  const pagination = usePagination(filtered);
  const selected = passengers.find((passenger) => passenger.id === selectedId) ?? null;
  const selectedLink = selected ? links.find((item) => item.passengers_id === selected.id) : undefined;
  const selectedResponsible = selectedLink ? responsibleById.get(selectedLink.responsible_id) : undefined;
  const selectedResponsibleUser = selectedResponsible ? userById.get(selectedResponsible.users_id) : undefined;

  function openForm(passenger?: Passenger) {
    setEditing(passenger ?? null);
    setResponsibleId('');
    setForm(passenger ? {
      name: passenger.name,
      birth_date: passenger.birth_date,
      rg: passenger.rg,
      cpf: passenger.cpf,
      addresses_id: String(passenger.addresses_id),
    } : emptyPassenger);
    setFormOpen(true);
  }

  async function savePassenger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      cpf: digits(form.cpf),
      rg: digits(form.rg),
      addresses_id: Number(form.addresses_id),
      facial: editing?.facial ?? null,
    };
    try {
      const saved = await apiFetch<Passenger>(editing ? `/admin/passengers/${editing.id}` : '/admin/passengers', {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      setFormOpen(false);
      setSelectedId(saved.id);
      await query.reload();
      notify(editing ? 'Passageiro atualizado.' : 'Passageiro cadastrado.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar o passageiro.', 'error');
    } finally { setBusy(false); }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const coordinates = parseCoordinates(addressForm.latitude, addressForm.longitude);
      const created = await apiFetch<Address>('/admin/addresses', { method: 'POST', body: JSON.stringify({ ...addressForm, ...coordinates, cep: digits(addressForm.cep), complemento: addressForm.complemento || null }) });
      setAddressOpen(false);
      setAddressForm(emptyAddress);
      setForm((current) => ({ ...current, addresses_id: String(created.id) }));
      await query.reload();
      notify('Endereço cadastrado.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar o endereço.', 'error');
    } finally { setBusy(false); }
  }

  async function removePassenger(passenger: Passenger) {
    if (!window.confirm(`Excluir o cadastro de ${passenger.name}?`)) return;
    try {
      await apiFetch<void>(`/admin/passengers/${passenger.id}`, { method: 'DELETE' });
      if (selectedId === passenger.id) setSelectedId(null);
      await query.reload();
      notify('Passageiro excluído.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível excluir o passageiro.', 'error'); }
  }

  async function saveResponsibleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !responsibleId) return;
    try {
      if (selectedLink) {
        await apiFetch(`/admin/passenger-responsibles/${selectedLink.id}`, { method: 'PUT', body: JSON.stringify({ responsible_id: Number(responsibleId) }) });
      } else {
        await apiFetch('/admin/passenger-responsibles', { method: 'POST', body: JSON.stringify({ passengers_id: selected.id, responsible_id: Number(responsibleId) }) });
      }
      await query.reload();
      notify('Responsável associado ao passageiro.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível associar o responsável.', 'error'); }
  }

  async function removeResponsibleLink() {
    if (!selectedLink || !window.confirm('Remover o vínculo deste responsável?')) return;
    try {
      await apiFetch<void>(`/admin/passenger-responsibles/${selectedLink.id}`, { method: 'DELETE' });
      await query.reload();
      notify('Vínculo removido.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível remover o vínculo.', 'error'); }
  }

  return (
    <>
      <PageTitle title="Passageiros" description="Cadastre, edite, exclua e consulte os alunos do transporte escolar." action={<Button onClick={() => openForm()}>＋ Cadastrar passageiro</Button>} />
      {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? (
        <>
          <Panel className="table-panel">
            <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar passageiro..." /><span>{filtered.length} passageiros cadastrados</span></div>
            {pagination.visible.length ? (
              <TableFrame>
                <thead><tr><th>NOME DO PASSAGEIRO</th><th>CPF</th><th>ENDEREÇO</th><th>RESPONSÁVEL</th><th>TELEFONE</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead>
                <tbody>{pagination.visible.map((passenger) => {
                  const link = links.find((item) => item.passengers_id === passenger.id);
                  const responsible = link ? responsibleById.get(link.responsible_id) : undefined;
                  const responsibleUser = responsible ? userById.get(responsible.users_id) : undefined;
                  return (
                    <tr className={selectedId === passenger.id ? 'row-selected' : ''} key={passenger.id} onClick={() => setSelectedId(passenger.id)}>
                      <td><strong>{passenger.name}</strong></td><td>{passenger.cpf}</td><td>{formatAddress(addressById.get(passenger.addresses_id))}</td>
                      <td>{responsibleUser?.name || '—'}</td><td>{responsibleUser?.phone || '—'}</td><td><Pill tone="neutral">Cadastrado</Pill></td>
                      <td className="action-cell"><Button variant="plain" onClick={(event) => { event.stopPropagation(); setSelectedId(passenger.id); }}>Consultar</Button><Button variant="quiet" onClick={(event) => { event.stopPropagation(); openForm(passenger); }}>Editar</Button><Button variant="danger" onClick={(event) => { event.stopPropagation(); void removePassenger(passenger); }}>Excluir</Button></td>
                    </tr>
                  );
                })}</tbody>
              </TableFrame>
            ) : <EmptyState title="Nenhum passageiro encontrado" message={search ? 'A busca não encontrou passageiros.' : 'Cadastre o primeiro passageiro para começar.'} action={!search ? <Button onClick={() => openForm()}>Cadastrar passageiro</Button> : undefined} />}
            <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="passageiros" />
          </Panel>

          <div className="split-grid">
            <Panel title="Informações individuais" action={selected ? <Pill tone="success">Consulta</Pill> : undefined}>
              {selected ? (
                <>
                  <div className="identity-row"><span className="avatar">{selected.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR')}</span><div><strong>{selected.name}</strong><small>Passageiro · cadastro #{selected.id}</small></div></div>
                  <div className="detail-list"><div><span>CPF</span><strong>{selected.cpf}</strong></div><div><span>Nascimento</span><strong>{formatDate(selected.birth_date)}</strong></div><div><span>Endereço</span><strong>{formatAddress(addressById.get(selected.addresses_id))}</strong></div><div><span>Responsável</span><strong>{selectedResponsibleUser?.name || 'Não associado'}</strong></div><div><span>Telefone</span><strong>{selectedResponsibleUser?.phone || '—'}</strong></div></div>
                  {(data.responsibles.length > 0) ? <form className="inline-association" onSubmit={(event) => void saveResponsibleLink(event)}><SelectInput value={responsibleId || String(selectedResponsible?.id || '')} onChange={(event) => setResponsibleId(event.target.value)} required><option value="">Selecionar responsável</option>{data.responsibles.map((person) => <option value={person.id} key={person.id}>{userById.get(person.users_id)?.name || `Responsável ${person.id}`}</option>)}</SelectInput><Button type="submit" variant="quiet">{selectedLink ? 'Alterar vínculo' : 'Associar'}</Button>{selectedLink ? <Button type="button" variant="danger" onClick={() => void removeResponsibleLink()}>Remover</Button> : null}</form> : <small className="muted-copy">Nenhum responsável cadastrado para associar.</small>}
                </>
              ) : <EmptyState title="Selecione um passageiro" message="As informações do cadastro serão exibidas aqui." />}
            </Panel>
            <Panel title="Cadastro de passageiro" subtitle="Use o formulário para adicionar ou atualizar um cadastro." action={<Button variant="plain" onClick={() => openForm()}>NOVO REGISTRO</Button>}>
              <p className="panel-hint">Nome, documentos, data de nascimento e endereço são enviados à API BusGuard.</p>
              <Button onClick={() => openForm()}>＋ Cadastrar passageiro</Button>
            </Panel>
          </div>
        </>
      ) : null}

      {formOpen ? <Modal title={editing ? 'Editar passageiro' : 'Cadastro de passageiro'} eyebrow={editing ? `REGISTRO #${editing.id}` : 'NOVO REGISTRO'} onClose={() => setFormOpen(false)} onSubmit={(event) => void savePassenger(event)} submitLabel="Salvar passageiro" busy={busy} wide>
        <div className="form-grid">
          <Field label="Nome completo" className="field-span-two"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} placeholder="Digite o nome do aluno" required /></Field>
          <Field label="CPF"><TextInput value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} maxLength={14} placeholder="000.000.000-00" required /></Field>
          <Field label="RG"><TextInput value={form.rg} onChange={(event) => setForm({ ...form, rg: event.target.value })} maxLength={20} required /></Field>
          <Field label="Data de nascimento"><TextInput type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} required /></Field>
          <Field label="Endereço" className="field-span-two"><SelectInput value={form.addresses_id} onChange={(event) => setForm({ ...form, addresses_id: event.target.value })} required><option value="">Selecione um endereço</option>{addresses.map((address) => <option value={address.id} key={address.id}>{formatAddress(address)}</option>)}</SelectInput><Button type="button" variant="plain" onClick={() => setAddressOpen(true)}>＋ Cadastrar endereço</Button></Field>
        </div>
      </Modal> : null}

      {addressOpen ? <Modal title="Cadastrar endereço" eyebrow="NOVO ENDEREÇO" onClose={() => setAddressOpen(false)} onSubmit={(event) => void saveAddress(event)} submitLabel="Salvar endereço" busy={busy} wide>
        <div className="form-grid">
          <Field label="CEP"><TextInput value={addressForm.cep} onChange={(event) => setAddressForm({ ...addressForm, cep: event.target.value })} maxLength={10} required /></Field>
          <Field label="Estado"><TextInput value={addressForm.estado} onChange={(event) => setAddressForm({ ...addressForm, estado: event.target.value.toUpperCase() })} maxLength={2} required /></Field>
          <Field label="Rua" className="field-span-two"><TextInput value={addressForm.rua} onChange={(event) => setAddressForm({ ...addressForm, rua: event.target.value })} maxLength={150} required /></Field>
          <Field label="Número"><TextInput value={addressForm.numero} onChange={(event) => setAddressForm({ ...addressForm, numero: event.target.value })} maxLength={20} required /></Field>
          <Field label="Bairro"><TextInput value={addressForm.bairro} onChange={(event) => setAddressForm({ ...addressForm, bairro: event.target.value })} maxLength={100} required /></Field>
          <Field label="Cidade"><TextInput value={addressForm.cidade} onChange={(event) => setAddressForm({ ...addressForm, cidade: event.target.value })} maxLength={100} required /></Field>
          <Field label="Complemento"><TextInput value={addressForm.complemento} onChange={(event) => setAddressForm({ ...addressForm, complemento: event.target.value })} maxLength={150} /></Field>
          <CoordinatesEditor latitude={addressForm.latitude} longitude={addressForm.longitude} onChange={(latitude, longitude) => setAddressForm({ ...addressForm, latitude, longitude })} />
        </div>
      </Modal> : null}
    </>
  );
}
