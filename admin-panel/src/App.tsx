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

const navigation: { section: string; items: { key: PageKey; label: string }[] }[] = [
  { section: 'PRINCIPAL', items: [{ key: 'dashboard', label: 'Dashboard' }] },
  { section: 'GERENCIAMENTO', items: [
    { key: 'passengers', label: 'Passageiros' },
    { key: 'drivers', label: 'Motoristas' },
    { key: 'vehicles', label: 'Veículos' },
    { key: 'routes', label: 'Rotas e Paradas' },
    { key: 'trips', label: 'Viagens' },
  ] },
  { section: 'OPERAÇÃO', items: [
    { key: 'events', label: 'Embarques e Desembarques' },
    { key: 'gps', label: 'Rastreamento GPS' },
  ] },
  { section: 'ADMINISTRAÇÃO', items: [{ key: 'administrators', label: 'Administradores' }] },
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
  const [initialEventFilter, setInitialEventFilter] = useState<'pending' | 'all'>('all');
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
  const navigate: Navigate = (page, tripId, options) => {
    if (tripId !== undefined) setSelectedTripId(tripId);
    if (page === 'events') setInitialEventFilter(options?.reviewStatus ?? 'all');
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

  const screenProps = { notify, navigate, currentUser: user, selectedTripId, initialEventFilter };
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
        <h1>BusGuard</h1>
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
          <div><strong>BusGuard</strong><small>PAINEL ADMINISTRATIVO</small></div>
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
                  <span className="nav-icon" aria-hidden="true"><NavIcon name={item.key} /></span><span>{item.label}</span>
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
          <div className="breadcrumbs">BusGuard <span>/</span> <strong>{pageName}</strong></div>
          <div className="topbar-account"><span>{adminName}</span><span className="avatar avatar-small">{initials(adminName)}</span></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: PageKey }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shapes: Record<PageKey, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
    passengers: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19z" /><path d="M16 5.3a3 3 0 0 1 0 5.8M17 13.2a4.4 4.4 0 0 1 3.5 4.3V19h-3" /></>,
    drivers: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="m5.8 5.8 4.1 4.1m4.2 4.2 4.1 4.1m0-12.4-4.1 4.1m-4.2 4.2-4.1 4.1" /></>,
    vehicles: <><path d="M4 17V7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5V17" /><path d="M4 12h16M7 17v2m10-2v2M7 8h4m2 0h4" /><circle cx="7.5" cy="15" r=".8" /><circle cx="16.5" cy="15" r=".8" /></>,
    routes: <><path d="M6 5v14m12-14v14M6 8h12M6 16h12" /><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /></>,
    trips: <><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 4.5v-2h6v2M8.5 10h7m-7 4h7m-7 4h4" /></>,
    events: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="m8 10 2 2 4-4m-6 8h8" /></>,
    gps: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 1.8v3m0 14.4v3m10.2-10.2h-3M4.8 12h-3" /></>,
    administrators: <><path d="M12 21s7-3.5 7-9V5l-7-3-7 3v7c0 5.5 7 9 7 9z" /><path d="M9.2 11.8 11 13.6l3.8-4" /></>,
  };

  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...common}>{shapes[name]}</svg>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('pt-BR') || '').join('') || 'AD';
}
