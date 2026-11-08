import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { apiFetch } from '../api';
import { communicationIsRecent, communicationTime } from '../communication';
import { Button, EmptyState, LoadingState, PageTitle, Panel, Pill, SelectInput, formatAddress, formatDate, formatTime, tripStatusLabel, tripStatusTone } from '../components';
import { usePlannedRoute } from '../RouteMap';
import { useApiData } from '../hooks';
import { completedMapStops } from '../mapProgress';
import type { AccessEvent, Address, Driver, LiveVehicleLocation, NextStopRoute, Route, RoutePassenger, RouteStop, Trip, TripCommunication, User, Vehicle, VehicleLocation } from '../types';
import type { ScreenProps } from '../pageTypes';

type GpsData = { trips: Trip[]; locations: LiveVehicleLocation[]; vehicles: Vehicle[]; routes: Route[]; drivers: Driver[]; users: User[]; stops: RouteStop[]; addresses: Address[]; assignments: RoutePassenger[]; events: AccessEvent[]; communications: TripCommunication[] };
const loadGps = async (): Promise<GpsData> => {
  const [trips, locations, vehicles, routes, drivers, users, stops, addresses, assignments, events, communications] = await Promise.all([
    apiFetch<Trip[]>('/admin/trips?limit=500'),
    apiFetch<LiveVehicleLocation[]>('/admin/vehicle-locations?limit=500'),
    apiFetch<Vehicle[]>('/admin/vehicles?limit=500'),
    apiFetch<Route[]>('/admin/routes?limit=500'),
    apiFetch<Driver[]>('/admin/drivers?limit=500'),
    apiFetch<User[]>('/admin/users?limit=500'),
    apiFetch<RouteStop[]>('/admin/route-stops?limit=500'),
    apiFetch<Address[]>('/admin/addresses?limit=500'),
    apiFetch<RoutePassenger[]>('/admin/route-passengers?limit=500'),
    apiFetch<AccessEvent[]>('/admin/access-events?limit=500'),
    apiFetch<TripCommunication[]>('/admin/trip-communications'),
  ]);
  return { trips, locations, vehicles, routes, drivers, users, stops, addresses, assignments, events, communications };
};
const busIcon = L.divIcon({ className: 'bus-location-marker', html: '<span aria-hidden="true">🚌</span>', iconSize: [42, 42], iconAnchor: [21, 21] });
const mapTileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function GpsPage({ selectedTripId }: ScreenProps) {
  const query = useApiData(loadGps, ['trips', 'vehicle_locations', 'vehicles', 'routes', 'drivers', 'users', 'route_stops', 'addresses', 'route_passengers', 'access_events', 'trip_communications']);
  const data = query.data;
  const [tripId, setTripId] = useState<number | null>(selectedTripId);
  const appliedSelection = useRef<number | null>(null);
  const [history, setHistory] = useState<VehicleLocation[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [passengerCount, setPassengerCount] = useState<number | null>(null);
  const [nextStopRoute, setNextStopRoute] = useState<NextStopRoute | null>(null);
  const [nextStopError, setNextStopError] = useState('');
  const [now, setNow] = useState(Date.now());
  const trips = data?.trips ?? [];
  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);
  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])), [data]);
  const routeById = useMemo(() => new Map((data?.routes ?? []).map((route) => [route.id, route])), [data]);
  const driverById = useMemo(() => new Map((data?.drivers ?? []).map((driver) => [driver.id, driver])), [data]);
  const userById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);

  useEffect(() => {
    if (!selectedTripId) appliedSelection.current = null;
    if (selectedTripId && tripById.has(selectedTripId) && appliedSelection.current !== selectedTripId) {
      appliedSelection.current = selectedTripId;
      setTripId(selectedTripId);
    }
    else if (!tripId || !tripById.has(tripId)) {
      const active = trips.find((trip) => trip.status === 'in_progress');
      setTripId(active?.id ?? trips[0]?.id ?? null);
    }
  }, [selectedTripId, tripById, tripId, trips]);

  const selectedTrip = tripId == null ? undefined : tripById.get(tripId);
  const communication = data?.communications.find((item) => item.trip_id === selectedTrip?.id);
  const communicationRecent = communicationIsRecent(communication, now, query.error);
  const selectedStops = (data?.stops ?? []).filter((stop) => stop.route_id === selectedTrip?.route_id).sort((a, b) => a.sequence - b.sequence);
  const selectedAssignments = (data?.assignments ?? []).filter((assignment) => assignment.route_id === selectedTrip?.route_id);
  const completedStopIds = completedMapStops(selectedStops, selectedAssignments, data?.events ?? [], selectedTrip?.vehicle_id ?? null, selectedTrip?.started_at ?? null, selectedTrip?.id ?? null);
  const planned = usePlannedRoute(selectedTrip?.route_id ?? null, selectedStops, data?.addresses ?? []);
  const liveLocation = data?.locations.find((location) => location.trip_id === selectedTrip?.id);
  const latestHistoryPoint = history.find((point) => point.trip_id === selectedTrip?.id);
  const currentLocation = selectedTrip?.status === 'in_progress' ? liveLocation ?? latestHistoryPoint : latestHistoryPoint;
  const chronologicalPoints = history.filter((point) => point.trip_id === selectedTrip?.id && point.source === currentLocation?.source).slice().reverse().map((point): [number, number] => [point.latitude, point.longitude]);
  const vehicle = selectedTrip ? vehicleById.get(selectedTrip.vehicle_id) : undefined;
  const driver = selectedTrip ? driverById.get(selectedTrip.driver_id) : undefined;
  const driverName = driver ? userById.get(driver.users_id)?.name : undefined;
  const route = selectedTrip ? routeById.get(selectedTrip.route_id) : undefined;
  const age = currentLocation ? Math.max(0, now - new Date(currentLocation.recorded_at).getTime()) : Infinity;
  const isStale = age > 120_000;
  const isDemo = currentLocation?.source === 'demo';

  useEffect(() => {
    setNextStopRoute(null);
    setNextStopError('');
    if (!selectedTrip || selectedTrip.status !== 'in_progress' || !currentLocation) return;
    const controller = new AbortController();
    void apiFetch<NextStopRoute>(`/admin/trips/${selectedTrip.id}/next-stop-geometry`, { signal: controller.signal })
      .then((geometry) => { if (!controller.signal.aborted) setNextStopRoute(geometry); })
      .catch((error) => {
        if (!controller.signal.aborted) setNextStopError(error instanceof Error ? error.message : 'Trajeto até a próxima parada indisponível.');
      });
    return () => controller.abort();
  }, [selectedTrip?.id, selectedTrip?.status, currentLocation?.recorded_at, data]);

  useEffect(() => {
    if (!selectedTrip) { setHistory([]); return; }
    let active = true;
    const refresh = async () => {
      try {
        const locations = await apiFetch<VehicleLocation[]>(`/admin/trips/${selectedTrip.id}/locations?limit=100`);
        if (active) { setHistory(locations); setHistoryError(''); }
      } catch (error) {
        if (active) setHistoryError(error instanceof Error ? error.message : 'Não foi possível carregar as posições.');
      }
    };
    void refresh();
    return () => { active = false; };
  }, [selectedTrip?.id, selectedTrip?.status, data]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!vehicle || selectedTrip?.status !== 'in_progress') { setPassengerCount(null); return; }
    let active = true;
    void apiFetch<{ vehicle_id: number; passengers: number[] }>(`/vehicles/${vehicle.id}/passengers`).then((result) => {
      if (active) setPassengerCount(result.passengers.length);
    }).catch(() => { if (active) setPassengerCount(null); });
    return () => { active = false; };
  }, [vehicle?.id, selectedTrip?.status, data]);

  const busPosition: [number, number] | undefined = currentLocation ? [currentLocation.latitude, currentLocation.longitude] : undefined;
  const center = busPosition ?? planned.located[0]?.position;

  return <>
    <PageTitle title="Rastreamento GPS" description="Acompanhe a última posição recebida dos veículos em viagem." action={<Button variant="quiet" onClick={() => void query.reload().catch(() => undefined)}>↻ Atualizar</Button>} />
    {query.error && data ? <div className="inline-error">Não foi possível atualizar. Os dados exibidos são da consulta anterior.</div> : null}
    {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
      <div className="gps-toolbar"><label className="gps-trip-picker"><span>VIAGEM</span><SelectInput value={tripId ?? ''} onChange={(event) => setTripId(event.target.value ? Number(event.target.value) : null)}><option value="">Selecionar viagem</option>{trips.map((item) => <option key={item.id} value={item.id}>#{String(item.id).padStart(3, '0')} · {routeById.get(item.route_id)?.name || `Rota ${item.route_id}`} · {tripStatusLabel(item.status)}</option>)}</SelectInput></label><span className="gps-auto-refresh"><span className="live-dot" />Atualização automática quando há alterações</span></div>
      {!selectedTrip ? <Panel><EmptyState title="Nenhuma viagem cadastrada" message="As viagens e as posições recebidas serão exibidas aqui." /></Panel> : <div className="gps-layout">
        <Panel title="Posição do veículo" subtitle={route?.name || `Rota ${selectedTrip.route_id}`} className="gps-map-panel">
          {center ? <div className="live-map"><MapContainer center={center} zoom={14} scrollWheelZoom className="leaflet-map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={mapTileUrl} /><RecenterMap center={center} />{planned.located.length > 1 && planned.located.length === selectedStops.length ? <Polyline positions={planned.geometry?.coordinates ?? planned.located.map((item) => item.position)} pathOptions={{ color: '#b78900', weight: 4, dashArray: planned.geometry ? undefined : '7 8' }} /> : null}{chronologicalPoints.length > 1 ? <Polyline positions={chronologicalPoints} pathOptions={{ color: '#64748b', weight: 4, opacity: 0.65 }} /> : null}{nextStopRoute ? <Pane name="navigation-route-pane" style={{ zIndex: 350 }}><Polyline positions={nextStopRoute.coordinates} pathOptions={{ color: '#1677d2', weight: 5, opacity: 0.95, dashArray: nextStopRoute.routed ? undefined : '7 8' }} /></Pane> : null}{planned.located.map(({ stop, address, position }) => { const completed = completedStopIds.has(stop.id); return <CircleMarker key={stop.id} center={position} radius={12} pathOptions={{ color: completed ? '#15803d' : '#795900', fillColor: completed ? '#22c55e' : '#ffc629', fillOpacity: 1 }}><Tooltip permanent direction="center" className="route-marker-label">{stop.sequence}</Tooltip><Popup><strong>Parada {stop.sequence}{completed ? ' · concluída' : ''}</strong><br />{formatAddress(address)}<br />{address.coordinate_source === 'demo' ? 'Coordenada simulada' : 'Coordenada informada'}</Popup></CircleMarker>; })}{busPosition ? <Marker position={busPosition} icon={busIcon} /> : null}</MapContainer>{currentLocation ? <div className="map-live-badge"><span className={`live-dot ${isStale || isDemo ? 'live-dot-muted' : ''}`} />{isDemo ? 'Posição simulada' : isStale ? 'Última posição recebida' : 'Posição atual'}</div> : null}</div> : <div className="gps-map-empty"><EmptyState title="Aguardando localização" message="Cadastre coordenadas nas paradas ou aguarde a posição do veículo." /></div>}
          <div className="gps-map-footer"><span>{currentLocation ? `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}` : 'Sem coordenadas disponíveis'}</span><span>{isDemo ? 'Posição simulada para demonstração' : currentLocation ? `Recebida às ${formatTime(currentLocation.recorded_at)}` : 'O mapa usa posições enviadas pelo aplicativo do motorista.'}</span></div>
          <div className="gps-route-controls"><span>{planned.geometry ? 'Amarelo: rota completa pelas ruas.' : planned.loading ? 'Calculando rota completa…' : planned.located.length === selectedStops.length && selectedStops.length > 1 ? 'Amarelo tracejado: referência da rota completa.' : 'Informe coordenadas nas paradas para traçar a rota completa.'} {nextStopRoute ? nextStopRoute.routed ? `Azul: rota pelas ruas até a próxima parada ${nextStopRoute.stop_sequence} - ${(nextStopRoute.distance_m / 1000).toFixed(1)} km, cerca de ${Math.round(nextStopRoute.duration_s / 60)} min sem trânsito.` : `Azul tracejado: referência em linha reta até a parada ${nextStopRoute.stop_sequence} (${(nextStopRoute.distance_m / 1000).toFixed(1)} km).` : selectedTrip.status === 'in_progress' ? 'Calculando trecho até a próxima parada…' : ''} {chronologicalPoints.length > 1 ? 'Cinza: histórico do GPS.' : ''}</span></div>
          {!planned.canCalculate && selectedStops.length >= 2 ? <p className="panel-hint gps-route-hint">O OSRM público aceita de 2 a 100 paradas com coordenadas fictícias da demonstração.</p> : null}
          {planned.error ? <p className="inline-error gps-error">{planned.error}</p> : null}
          {nextStopError ? <p className="panel-hint gps-route-hint">Trecho até a próxima parada indisponível: {nextStopError}</p> : null}
          {historyError ? <p className="inline-error gps-error">{historyError}</p> : null}
        </Panel>
        <Panel title="Informações da viagem" subtitle={`Viagem #${String(selectedTrip.id).padStart(3, '0')}`} className="gps-details-panel">
          <div className="gps-status-row"><span>Status da viagem</span><Pill tone={tripStatusTone(selectedTrip.status)}>{tripStatusLabel(selectedTrip.status)}</Pill></div>
          <div className="gps-status-row"><span>Última comunicação do app</span><Pill tone={communicationRecent ? 'success' : 'warning'}>{communication?.received_at ? `${communicationTime(communication.received_at)}${communicationRecent ? '' : ' · sem atualização recente'}` : 'Sem comunicação recebida'}</Pill></div>
          <dl className="gps-detail-list"><div><dt>Motorista</dt><dd>{driverName || `Motorista ${selectedTrip.driver_id}`}</dd></div><div><dt>Veículo</dt><dd>{vehicle ? `${vehicle.model} · ${vehicle.plate}` : `Veículo ${selectedTrip.vehicle_id}`}</dd></div><div><dt>Rota</dt><dd>{route?.name || `Rota ${selectedTrip.route_id}`}</dd></div><div><dt>Data e horário</dt><dd>{formatDate(selectedTrip.trip_date)} · {selectedTrip.scheduled_time?.slice(0, 5) || 'Sem horário previsto'}</dd></div><div><dt>Embarques confirmados a bordo</dt><dd>{passengerCount == null ? '—' : `${passengerCount}${vehicle ? ` / ${vehicle.capacity}` : ''}`}</dd></div><div><dt>Velocidade</dt><dd>{currentLocation?.speed_kmh == null ? '—' : `${Math.round(currentLocation.speed_kmh)} km/h`}</dd></div><div><dt>Última posição GPS</dt><dd>{currentLocation ? formatTime(currentLocation.recorded_at) : 'Aguardando sinal'}</dd></div></dl>
          <div className="gps-signal-note"><span className={`live-dot ${currentLocation && !isStale && !isDemo ? '' : 'live-dot-muted'}`} /><span>{!currentLocation ? 'Sem sinal GPS recebido' : isDemo ? 'GPS simulado para demonstração' : isStale ? 'Posição sem atualização recente' : 'Sinal GPS recebido'}</span></div>
          <small className="panel-hint">O ETA em tempo real não é calculado; o trajeto planejado não considera trânsito.</small>
        </Panel>
      </div>}
    </> : null}
  </>;
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom(), { animate: true }); }, [center[0], center[1], map]);
  return null;
}
