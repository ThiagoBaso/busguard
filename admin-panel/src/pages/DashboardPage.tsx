import { useMemo } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, LoadingState, MapArtwork, PageTitle, Panel, Pill, SummaryCard, formatDate, formatTime } from '../components';
import { dateIsToday, useApiData } from '../hooks';
import type { AccessEvent, Driver, DriverVehicle, LiveVehicleLocation, Passenger, Route, Trip, User, Vehicle } from '../types';
import type { ScreenProps } from '../pageTypes';

type DashboardData = {
  passengers: Passenger[]; drivers: Driver[]; users: User[]; vehicles: Vehicle[];
  routes: Route[]; trips: Trip[]; events: AccessEvent[]; locations: LiveVehicleLocation[];
  assignments: DriverVehicle[];
};

const loadDashboard = async (): Promise<DashboardData> => {
  const [passengers, drivers, users, vehicles, routes, trips, events, locations, assignments] = await Promise.all([
    apiFetch<Passenger[]>('/admin/passengers?limit=500'),
    apiFetch<Driver[]>('/admin/drivers?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Route[]>('/admin/routes?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
    apiFetch<AccessEvent[]>('/admin/access-events?limit=500'),
    apiFetch<LiveVehicleLocation[]>('/admin/vehicle-locations?limit=100'),
    apiFetch<DriverVehicle[]>('/admin/driver-vehicles?limit=500'),
  ]);
  return { passengers, drivers, users, vehicles, routes, trips, events, locations, assignments };
};

export function DashboardPage({ notify, navigate }: ScreenProps) {
  const { data, loading, error, reload } = useApiData(loadDashboard, ['passengers', 'drivers', 'users', 'vehicles', 'routes', 'trips', 'access_events', 'vehicle_locations', 'driver_vehicles']);
  const todayEvents = useMemo(() => (data?.events ?? []).filter((event) => dateIsToday(event.created_at)), [data]);
  const activeTrips = useMemo(() => (data?.trips ?? []).filter((trip) => trip.status === 'in_progress'), [data]);
  const recentEvents = useMemo(() => [...(data?.events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4), [data]);

  const driverById = new Map((data?.drivers ?? []).map((driver) => [driver.id, driver]));
  const userById = new Map((data?.users ?? []).map((user) => [user.id, user]));
  const vehicleById = new Map((data?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const routeById = new Map((data?.routes ?? []).map((route) => [route.id, route]));

  async function refresh() {
    try { await reload(); notify('Painel atualizado.'); } catch { /* erro mostrado junto à área principal */ }
  }

  return (
    <>
      <PageTitle title="Dashboard" description="Visão geral do transporte escolar e acompanhamento das operações." action={<Button onClick={() => void refresh()}>↻ Atualizar painel</Button>} />
      {error ? <div className="inline-error">{error} <Button variant="plain" onClick={() => void refresh()}>Tentar novamente</Button></div> : null}
      {loading && !data ? <LoadingState /> : data ? (
        <>
          <div className="summary-grid summary-grid-four">
            <SummaryCard label="PASSAGEIROS CADASTRADOS" value={data.passengers.length} detail="Alunos registrados" icon="♙" />
            <SummaryCard label="TOTAL DE VEÍCULOS" value={data.vehicles.length} detail="Ônibus cadastrados" icon="🚌" />
            <SummaryCard label="VIAGENS EM ANDAMENTO" value={activeTrips.length} detail="Veículos em operação" icon="⇄" />
            <SummaryCard label="EMBARQUES DO DIA" value={todayEvents.filter((event) => event.action === 'entry').length} detail={`${todayEvents.length} movimentações hoje`} icon="☑" />
          </div>

          <div className="dashboard-grid">
            <Panel title="Veículos em andamento" subtitle="Acompanhe as viagens e abra a posição recebida do GPS." className="dashboard-live-panel" action={<Pill tone="success">{activeTrips.length} em operação</Pill>}>
              {activeTrips.length ? (
                <div className="live-trip-list">
                  {activeTrips.slice(0, 4).map((trip) => {
                    const vehicle = vehicleById.get(trip.vehicle_id);
                    const driver = driverById.get(trip.driver_id);
                    const driverName = driver ? userById.get(driver.users_id)?.name : undefined;
                    const route = routeById.get(trip.route_id);
                    const location = data.locations.find((item) => item.trip_id === trip.id);
                    return (
                      <div className="live-trip-row" key={trip.id}>
                        <div className="live-trip-icon">🚌</div>
                        <div className="live-trip-vehicle"><strong>{vehicle?.model || `Veículo ${trip.vehicle_id}`}</strong><small>{vehicle?.plate || 'Placa não cadastrada'}</small></div>
                        <div className="live-trip-meta"><small>MOTORISTA</small><strong>{driverName || 'Não associado'}</strong></div>
                        <div className="live-trip-meta"><small>ROTA</small><strong>{route?.name || `Rota ${trip.route_id}`}</strong></div>
                        <div className="live-trip-action">
                          {location ? location.source === 'demo' ? <Pill tone="warning">GPS simulado</Pill> : <Pill tone="success">GPS atualizado</Pill> : <Pill tone="warning">Aguardando GPS</Pill>}
                          <Button onClick={() => navigate('gps', trip.id)}>Ver GPS →</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="Nenhuma viagem em andamento" message="As viagens aparecem aqui depois que a operação é iniciada." action={<Button variant="quiet" onClick={() => navigate('trips')}>Abrir viagens</Button>} />}
            </Panel>

            <Panel title="Mapa geral das rotas" subtitle="A localização do GPS é consultada na tela de rastreamento." className="dashboard-map-panel" action={<Pill tone="warning">{data.locations.length ? `${data.locations.length} posições` : 'GPS'}</Pill>}>
              <MapArtwork markers={Math.min(3, Math.max(1, data.locations.length))} label="Prévia esquemática das rotas" />
              <div className="map-footnote">A prévia não representa coordenadas. <button type="button" onClick={() => navigate('gps')}>Abrir rastreamento →</button></div>
            </Panel>
          </div>

          <Panel title="Últimos embarques e desembarques" subtitle="Movimentações recentes registradas pela API." action={<Button variant="plain" onClick={() => navigate('events')}>Ver histórico completo →</Button>}>
            {recentEvents.length ? (
              <div className="recent-events">
                {recentEvents.map((event) => {
                  const passenger = data.passengers.find((item) => item.id === event.passenger_id);
                  const vehicle = vehicleById.get(event.vehicle_id);
                  const trip = data.trips.find((item) => item.vehicle_id === event.vehicle_id && item.status === 'in_progress');
                  const route = trip ? routeById.get(trip.route_id) : undefined;
                  return (
                    <div className="recent-event-row" key={event.id}>
                      <span className={`event-icon event-${event.action}`}>{event.action === 'entry' ? '↗' : '↙'}</span>
                      <div><strong>{passenger?.name || `Passageiro ${event.passenger_id}`} · {event.action === 'entry' ? 'Embarque' : 'Desembarque'}</strong><small>{vehicle?.model || `Veículo ${event.vehicle_id}`} · {route?.name || 'Viagem não vinculada'}</small></div>
                      <time>{formatTime(event.created_at)}</time>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState title="Sem movimentações recentes" message="Os registros de entrada e saída aparecerão aqui quando forem enviados." />}
          </Panel>
          {data.locations.length ? <div className="data-note">Posições recentes: {data.locations.map((location) => `${location.vehicle_label}${location.source === 'demo' ? ' (simulada)' : ''} · ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} · ${formatDate(location.recorded_at)}`).join(' | ')}</div> : null}
        </>
      ) : null}
    </>
  );
}
