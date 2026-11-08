import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError, apiFetch, errorMessage, restoreSession, signIn, signOut } from './api';
import { Button, Field, Notice, TextInput } from './components';
import type { Navigate, Notify } from './pageTypes';
import type { CurrentUser, NoticeMessage, PageKey, User } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { PassengersPage } from './pages/PassengersPage';
import { DriversPage } from './pages/DriversPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { RoutesPage } from './pages/RoutesPage';
import { TripsPage } from './pages/TripsPage';
import { EventsPage } from './pages/EventsPage';
import { AdministratorsPage } from './pages/AdministratorsPage';
import { GpsPage } from './pages/GpsPage';
import { startRealtime } from './realtime';
import { useApiData } from './hooks';

const navigation: { section: string; items: { key: PageKey; label: string; icon: string }[] }[] = [
  { section: 'PRINCIPAL', items: [{ key: 'dashboard', label: 'Dashboard', icon: '▦' }] },
  { section: 'GERENCIAMENTO', items: [
    { key: 'passengers', label: 'Passageiros', icon: '♙' },
    { key: 'drivers', label: 'Motoristas', icon: '♟' },
    { key: 'vehicles', label: 'Veículos', icon: '🚌' },
    { key: 'routes', label: 'Rotas e Paradas', icon: '⌖' },
    { key: 'trips', label: 'Viagens', icon: '▤' },
  ] },
  { section: 'OPERAÇÃO', items: [
    { key: 'events', label: 'Embarques e Desembarques', icon: '☑' },
    { key: 'gps', label: 'Rastreamento GPS', icon: '⌖' },
  ] },
  { section: 'ADMINISTRAÇÃO', items: [{ key: 'administrators', label: 'Administradores', icon: '⚙' }] },
];

const pageNames: Record<PageKey, string> = {
  dashboard: 'Dashboard', passengers: 'Passageiros', drivers: 'Motoristas', vehicles: 'Veículos',
  routes: 'Rotas e Paradas', trips: 'Viagens', events: 'Embarques e Desembarques',
  administrators: 'Administradores', gps: 'Rastreamento GPS',
};
const loadShellUsers = () => apiFetch<User[]>('/admin/users?limit=500');

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  useEffect(() => {
    let active = true;
    void restoreSession().then((session) => {
      if (active) setUser(session);
    }).catch((error) => {
      if (active) setSessionError(errorMessage(error));
    }).finally(() => {
      if (active) setCheckingSession(false);
    });
    const onUnauthorized = () => {
      setUser(null);
      setActivePage('dashboard');
      setSessionError('Sua sessão terminou. Entre novamente.');
    };
    window.addEventListener('busguard:unauthorized', onUnauthorized);
    return () => {
      active = false;
      window.removeEventListener('busguard:unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (user) return startRealtime();
  }, [user]);

  const notify: Notify = (message, tone = 'success') => setNotice({ message, tone });
  const navigate: Navigate = (page, tripId) => {
    if (tripId !== undefined) setSelectedTripId(tripId);
    setActivePage(page);
  };

  async function handleLogin(identifier: string, password: string) {
    const signedIn = await signIn(identifier, password);
    setUser(signedIn);
    setSessionError('');
    setNotice(null);
    setActivePage('dashboard');
  }

  function handleLogout() {
    signOut();
    setUser(null);
    setSelectedTripId(null);
    setActivePage('dashboard');
    setNotice(null);
  }

  if (checkingSession) return <div className="startup-screen"><span className="spinner" />Conferindo sessão administrativa…</div>;
  if (!user) return <LoginPage onLogin={handleLogin} initialError={sessionError} />;

  const screenProps = { notify, navigate, currentUser: user, selectedTripId };
  const screens = {
    dashboard: <DashboardPage {...screenProps} />,
    passengers: <PassengersPage {...screenProps} />,
    drivers: <DriversPage {...screenProps} />,
    vehicles: <VehiclesPage {...screenProps} />,
    routes: <RoutesPage {...screenProps} />,
    trips: <TripsPage {...screenProps} />,
    events: <EventsPage {...screenProps} />,
    administrators: <AdministratorsPage {...screenProps} />,
    gps: <GpsPage {...screenProps} />,
  } satisfies Record<PageKey, ReactNode>;

  return (
    <AdminShell page={activePage} pageName={pageNames[activePage]} currentUserId={user.id} onNavigate={navigate} onLogout={handleLogout}>
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      {screens[activePage]}
    </AdminShell>
  );
}

function LoginPage({ onLogin, initialError }: { onLogin: (identifier: string, password: string) => Promise<void>; initialError: string }) {
  const [identifier, setIdentifier] = useState(() => import.meta.env.DEV ? 'admin@transportescolar.com' : '');
  const [password, setPassword] = useState(() => import.meta.env.DEV ? 'Busguard@123' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(identifier, password);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError('E-mail/CPF ou senha incorretos.');
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <img className="login-logo" src="/busguard-logo.svg" alt="" />
        <h1>Rota Escolar Seguro</h1>
        <span className="login-eyebrow">PAINEL ADMINISTRATIVO</span>
        {error || initialError ? <Notice notice={{ tone: 'error', message: error || initialError }} /> : null}
        <form onSubmit={submit} className="login-form">
          <Field label="E-mail ou CPF">
            <TextInput autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Digite seu e-mail ou CPF" required />
          </Field>
          <Field label="Senha">
            <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" required />
          </Field>
          <Button type="submit" loading={busy} className="login-submit">ENTRAR NO SISTEMA</Button>
        </form>
        <p className="login-footnote">Acesso exclusivo para administradores</p>
      </section>
    </main>
  );
}

function AdminShell({ page, pageName, currentUserId, onNavigate, onLogout, children }: {
  page: PageKey; pageName: string; currentUserId: number; onNavigate: Navigate; onLogout: () => void; children: ReactNode;
}) {
  const { data: users } = useApiData(loadShellUsers, ['users']);
  const adminName = users?.find((item) => item.id === currentUserId && item.role === 'admin')?.name || 'Administrador';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-layout">
      {sidebarOpen ? <button className="sidebar-scrim" type="button" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-logo-tile"><img src="/busguard-logo.svg" alt="" /></div>
          <div><strong>Rota Escolar<br />Seguro</strong><small>PAINEL ADMINISTRATIVO</small></div>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {navigation.map((group) => (
            <div className="nav-group" key={group.section}>
              <span className="nav-section-label">{group.section}</span>
              {group.items.map((item) => (
                <button
                  type="button"
                  className={`nav-item ${page === item.key ? 'nav-item-active' : ''}`}
                  key={item.key}
                  onClick={() => { onNavigate(item.key); setSidebarOpen(false); }}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="account-summary"><span className="avatar">{initials(adminName)}</span><span><strong>{adminName}</strong><small>Administrador geral</small></span></div>
          <Button variant="quiet" className="logout-button" onClick={onLogout}><span aria-hidden="true">↪</span> Sair do sistema</Button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">☰</button>
          <div className="breadcrumbs">Rota Escolar Seguro <span>/</span> <strong>{pageName}</strong></div>
          <div className="topbar-account"><span>{adminName}</span><span className="avatar avatar-small">{initials(adminName)}</span></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('pt-BR') || '').join('') || 'AD';
}
