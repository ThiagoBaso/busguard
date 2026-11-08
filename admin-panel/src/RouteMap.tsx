import { useEffect, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Pane, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { apiFetch } from './api';
import { EmptyState, formatAddress } from './components';
import type { Address, NextStopRoute, Passenger, RouteGeometry, RoutePassenger, RouteStop } from './types';

const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export type LocatedStop = { stop: RouteStop; address: Address; position: [number, number] };

export function locateStops(stops: RouteStop[], addresses: Address[]): LocatedStop[] {
  const byId = new Map(addresses.map((address) => [address.id, address]));
  return stops.flatMap((stop) => {
    const address = byId.get(stop.address_id);
    if (!address || address.latitude == null || address.longitude == null) return [];
    return [{ stop, address, position: [address.latitude, address.longitude] as [number, number] }];
  });
}

export function usePlannedRoute(routeId: number | null, stops: RouteStop[], addresses: Address[]) {
  const [result, setResult] = useState<{ key: string; geometry: RouteGeometry } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const located = locateStops(stops, addresses);
  const signature = JSON.stringify(stops.map((stop) => {
    const address = addresses.find((item) => item.id === stop.address_id);
    return [stop.id, stop.sequence, address?.latitude, address?.longitude, address?.coordinate_source];
  }));
  const canCalculate = stops.length >= 2 && stops.length <= 100 && located.length === stops.length && located.every((item) => item.address.coordinate_source === 'demo');
  const key = JSON.stringify([routeId, signature]);
  const geometry = result?.key === key ? result.geometry : null;

  useEffect(() => {
    setError('');
    if (!routeId || !canCalculate) { setLoading(false); return; }
    const controller = new AbortController();
    let retry: number | undefined;
    const calculate = async () => {
      setLoading(true);
      try {
        const geometry = await apiFetch<RouteGeometry>(`/admin/routes/${routeId}/geometry`, { signal: controller.signal });
        if (!controller.signal.aborted) { setResult({ key, geometry }); setError(''); }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Não foi possível calcular o trajeto.');
          retry = window.setTimeout(() => void calculate(), 30000);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void calculate();
    return () => { controller.abort(); window.clearTimeout(retry); };
  }, [routeId, key, canCalculate]);
  return { located, geometry, loading, error, canCalculate };
}

export function RouteMap({ routeId, stops, addresses, assignments, passengers, completedStopIds = new Set(), activeTripId = null, locationUpdatedAt = null }: {
  routeId: number; stops: RouteStop[]; addresses: Address[]; assignments: RoutePassenger[]; passengers: Passenger[];
  completedStopIds?: Set<number>; activeTripId?: number | null; locationUpdatedAt?: string | null;
}) {
  const planned = usePlannedRoute(routeId, stops, addresses);
  const points = planned.located.map((item) => item.position);
  const missing = stops.length - points.length;
  const [nextRoute, setNextRoute] = useState<NextStopRoute | null>(null);
  const progressKey = JSON.stringify([...completedStopIds].sort((a, b) => a - b));
  useEffect(() => {
    setNextRoute(null);
    if (!activeTripId || !locationUpdatedAt) return;
    const controller = new AbortController();
    void apiFetch<NextStopRoute>(`/admin/trips/${activeTripId}/next-stop-geometry`, { signal: controller.signal })
      .then((geometry) => { if (!controller.signal.aborted) setNextRoute(geometry); })
      .catch(() => { if (!controller.signal.aborted) setNextRoute(null); });
    return () => controller.abort();
  }, [activeTripId, locationUpdatedAt, progressKey]);
  const livePosition: [number, number] | null = nextRoute?.coordinates[0] ?? null;
  return <>
    {points.length ? <div className="route-map"><MapContainer center={points[0]} zoom={14} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={tileUrl} />
      <FitStops points={livePosition ? [...points, livePosition] : points} />
      {points.length > 1 && missing === 0 ? <Polyline positions={planned.geometry?.coordinates ?? points} pathOptions={{ color: '#b78900', weight: 4, dashArray: planned.geometry ? undefined : '7 8' }} /> : null}
      {nextRoute ? <Pane name="navigation-route-pane" style={{ zIndex: 350 }}><Polyline positions={nextRoute.coordinates} pathOptions={{ color: '#1677d2', weight: 5, dashArray: nextRoute.routed ? undefined : '7 8' }} /></Pane> : null}
      {planned.located.map(({ stop, address, position }) => {
        const names = assignments.filter((link) => link.active && link.stop_id === stop.id).map((link) => passengers.find((passenger) => passenger.id === link.passenger_id)?.name).filter(Boolean);
        const completed = completedStopIds.has(stop.id);
        return <CircleMarker key={stop.id} center={position} radius={13} pathOptions={{ color: completed ? '#15803d' : '#795900', fillColor: completed ? '#22c55e' : '#ffc629', fillOpacity: 1 }}>
          <Tooltip permanent direction="center" className="route-marker-label">{stop.sequence}</Tooltip>
          <Popup><strong>Parada {stop.sequence}{completed ? ' · concluída' : ''}</strong><br />{formatAddress(address)}<br />{address.coordinate_source === 'demo' ? 'Coordenada simulada' : 'Coordenada informada'}{names.length ? <><br />{names.join(', ')}</> : null}</Popup>
        </CircleMarker>;
      })}
      {livePosition ? <CircleMarker center={livePosition} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1677d2', fillOpacity: 1 }}><Popup>Posição atual do veículo</Popup></CircleMarker> : null}
    </MapContainer></div> : <EmptyState title="Paradas sem coordenadas" message="Informe as coordenadas dos endereços para exibi-los no mapa." />}
    <div className="route-map-controls">
      <span>{planned.geometry ? `Trajeto pelas ruas · ${(planned.geometry.distance_m / 1000).toFixed(1)} km · cerca de ${Math.round(planned.geometry.duration_s / 60)} min, sem trânsito` : planned.loading ? 'Calculando trajeto pelas ruas…' : points.length > 1 && !missing ? 'Linha reta de referência; trajeto pelas ruas indisponível.' : `${points.length} parada(s) localizada(s).`}</span>
      {nextRoute ? <span>{nextRoute.routed ? `Trecho azul: veículo até a próxima parada ${nextRoute.stop_sequence} · ${(nextRoute.distance_m / 1000).toFixed(1)} km.` : `Trecho azul tracejado: referência até a próxima parada ${nextRoute.stop_sequence}.`}</span> : null}
    </div>
    {missing ? <p className="panel-hint">{missing} parada(s) ainda não possuem coordenadas.</p> : null}
    {!missing && stops.length > 100 ? <p className="panel-hint">O cálculo aceita no máximo 100 paradas por rota.</p> : null}
    {!missing && stops.length >= 2 && stops.length <= 100 && !planned.canCalculate ? <p className="panel-hint">O OSRM público está disponível apenas para coordenadas fictícias da demonstração.</p> : null}
    {planned.error ? <p className="inline-error">{planned.error} A linha reta permanece como referência.</p> : null}
  </>;
}

function FitStops({ points }: { points: [number, number][] }) {
  const map = useMap();
  const signature = JSON.stringify(points);
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 17 });
  }, [map, signature]);
  return null;
}
