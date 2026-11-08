import { useState, type FormEvent } from 'react';
import { apiFetch, errorMessage } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Pagination, Panel, SearchBox, SummaryCard, TableFrame, TextInput, formatDate } from '../components';
import { digits, includesText, useApiData, usePagination } from '../hooks';
import type { User } from '../types';
import type { ScreenProps } from '../pageTypes';

type AdminForm = { name: string; email: string; password: string; phone: string; cpf: string; rg: string };
const blankForm = (): AdminForm => ({ name: '', email: '', password: '', phone: '', cpf: '', rg: '' });
const loadAdmins = async () => apiFetch<User[]>('/admin/users?limit=500');

export function AdministratorsPage({ notify, currentUser }: ScreenProps) {
  const query = useApiData(loadAdmins, ['users']);
  const administrators = (query.data ?? []).filter((user) => user.role === 'admin');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<AdminForm>(blankForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const filtered = administrators.filter((user) => includesText([user.name, user.email, user.cpf, user.phone], search));
  const pagination = usePagination(filtered);

  function openForm(user?: User) {
    setEditing(user ?? null);
    setForm(user ? { name: user.name, email: user.email, password: '', phone: user.phone, cpf: user.cpf, rg: user.rg } : blankForm());
    setModalOpen(true);
  }

  async function saveAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const payload: Record<string, string> = { name: form.name.trim(), email: form.email.trim(), phone: form.phone, cpf: digits(form.cpf), rg: digits(form.rg) };
    if (form.password) payload.password = form.password;
    if (!editing) payload.role = 'admin';
    try {
      await apiFetch(editing ? `/admin/users/${editing.id}` : '/admin/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setModalOpen(false);
      await query.reload();
      notify(editing ? 'Administrador atualizado.' : 'Administrador cadastrado.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setBusy(false); }
  }

  async function removeAdmin(user: User) {
    if (user.id === currentUser.id) return;
    if (!window.confirm(`Excluir o acesso administrativo de ${user.name}?`)) return;
    try {
      await apiFetch<void>(`/admin/users/${user.id}`, { method: 'DELETE' });
      await query.reload();
      notify('Administrador removido.');
    } catch (error) { notify(errorMessage(error), 'error'); }
  }

  return <>
    <PageTitle title="Administradores" description="Gerencie os usuários com acesso ao painel administrativo." action={<Button onClick={() => openForm()}>＋ Novo administrador</Button>} />
    {query.loading && !query.data ? <LoadingState /> : query.error && !query.data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : <>
      <div className="summary-grid summary-grid-three"><SummaryCard label="ADMINISTRADORES" value={administrators.length} detail="Acessos administrativos ativos" icon="⚙" /><SummaryCard label="MEU ACESSO" value="Ativo" detail="Sessão autenticada" icon="✓" /><SummaryCard label="CONTAS DO SISTEMA" value={query.data?.length ?? 0} detail="Todos os perfis cadastrados" icon="♙" /></div>
      <Panel className="table-panel"><div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar administrador..." /></div>
        {pagination.visible.length ? <TableFrame><thead><tr><th>ADMINISTRADOR</th><th>E-MAIL</th><th>CPF</th><th>TELEFONE</th><th>CADASTRO</th><th>AÇÕES</th></tr></thead><tbody>{pagination.visible.map((user) => <tr key={user.id}><td><span className="person-cell"><span className="avatar avatar-table">{user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR')}</span><span><strong>{user.name}</strong>{user.id === currentUser.id ? <small className="table-subline">Sua conta</small> : null}</span></span></td><td>{user.email}</td><td>{user.cpf}</td><td>{user.phone}</td><td>{formatDate(user.created_at)}</td><td className="action-cell"><Button variant="quiet" onClick={() => openForm(user)}>Editar</Button><Button variant="danger" disabled={user.id === currentUser.id} title={user.id === currentUser.id ? 'Não é possível remover sua própria conta' : undefined} onClick={() => void removeAdmin(user)}>Excluir</Button></td></tr>)}</tbody></TableFrame> : <EmptyState title="Nenhum administrador encontrado" message={search ? 'A busca não encontrou contas administrativas.' : 'Cadastre um administrador para conceder acesso ao painel.'} action={!administrators.length ? <Button onClick={() => openForm()}>Cadastrar administrador</Button> : undefined} />}
        <Pagination page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} count={pagination.visible.length} noun="administradores" />
      </Panel>
    </>}
    {modalOpen ? <Modal title={editing ? 'Editar administrador' : 'Novo administrador'} eyebrow={editing ? `USUÁRIO #${editing.id}` : 'NOVO ACESSO'} onClose={() => setModalOpen(false)} onSubmit={(event) => void saveAdmin(event)} submitLabel={editing ? 'Salvar alterações' : 'Criar administrador'} busy={busy}>
      <div className="form-grid"><Field label="Nome"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={100} /></Field><Field label="E-mail"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field><Field label="CPF"><TextInput value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} required maxLength={14} /></Field><Field label="RG"><TextInput value={form.rg} onChange={(event) => setForm({ ...form, rg: event.target.value })} required maxLength={12} /></Field><Field label="Telefone"><TextInput type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required maxLength={19} /></Field><Field label={editing ? 'Nova senha (opcional)' : 'Senha'} hint={editing ? 'Deixe em branco para manter a senha atual.' : 'Mínimo de 8 caracteres.'}><TextInput type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} minLength={8} /></Field></div>
    </Modal> : null}
  </>;
}
