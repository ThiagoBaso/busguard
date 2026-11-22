import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './trip-map-markers.css';
import type { MapViewProps } from './tripMapTypes';

export default function TripMapView({ stops, position, positionLabel, route, routed, nextRoute, nextRouteRouted, followVehicle, focusRequest, fullScreen = false }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);
  const [mapError, setMapError] = useState(false);
  const map = useRef<Leaflet.Map | null>(null);
  const routeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const navigationLayer = useRef<Leaflet.LayerGroup | null>(null);
  const locationLayer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef('');
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.sequence, stop.latitude, stop.longitude, stop.address, stop.final, stop.completed]));
  const routeSignature = JSON.stringify(route);
  const nextRouteSignature = JSON.stringify(nextRoute);
  const fitSignature = `${signature}:${Boolean(position)}`;
  useEffect(() => {
    let active = true;
    // Leaflet acessa window durante a importação; o efeito só roda no navegador.
    void import('leaflet').then(module => {
      if (active) setLeaflet(module.default ?? module);
    }).catch(() => { if (active) setMapError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!element.current || !leaflet) return;
    const instance = leaflet.map(element.current).setView([-22.21, -49.94], 13);
    leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(instance);
    map.current = instance;
    routeLayer.current = leaflet.layerGroup().addTo(instance);
    navigationLayer.current = leaflet.layerGroup().addTo(instance);
    const pane = instance.createPane('trip-navigation-pane');
    pane.style.zIndex = '350';
    locationLayer.current = leaflet.layerGroup().addTo(instance);
    return () => { instance.remove(); map.current = null; routeLayer.current = null; navigationLayer.current = null; locationLayer.current = null; fitted.current = ''; };
  }, [leaflet]);
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer || !map.current || !leaflet) return;
    layer.clearLayers();
    if (route.length > 1) leaflet.polyline(route.map(point => [point.latitude, point.longitude]), { color: '#bb8a00', weight: 4, dashArray: routed ? undefined : '8 8' }).addTo(layer);
    stops.forEach(stop => {
      const popup = document.createElement('div');
      popup.textContent = `${stop.final ? 'Destino final' : 'Parada'} ${stop.sequence}: ${stop.address}`;
      const label = document.createElement('span');
      label.textContent = stop.final ? '⚑' : String(stop.sequence);
      const icon = leaflet.divIcon({ className: stop.completed ? 'trip-map-stop-marker trip-map-stop-marker-completed' : 'trip-map-stop-marker', html: label, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18] });
      leaflet.marker([stop.latitude!, stop.longitude!], { icon, title: `${stop.final ? 'Destino final' : 'Parada'} ${stop.sequence}`, zIndexOffset: 100 })
        .bindPopup(popup).addTo(layer);
    });
    if (!followVehicle && (stops.length || position) && fitted.current !== fitSignature) {
      fitted.current = fitSignature;
      const points: Leaflet.LatLngTuple[] = stops.map(stop => [stop.latitude!, stop.longitude!]);
      if (position) points.push([position.latitude, position.longitude]);
      const bounds = leaflet.latLngBounds(points);
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [leaflet, signature, routeSignature, routed, fitSignature, followVehicle]);
  useEffect(() => {
    if (!navigationLayer.current || !leaflet) return;
    navigationLayer.current.clearLayers();
    if (nextRoute.length > 1) leaflet.polyline(nextRoute.map(point => [point.latitude, point.longitude]), { pane: 'trip-navigation-pane', color: '#075fcd', weight: 5, dashArray: nextRouteRouted ? undefined : '8 8' }).addTo(navigationLayer.current);
  }, [leaflet, nextRouteSignature, nextRouteRouted]);
  useEffect(() => {
    if (!locationLayer.current || !map.current || !leaflet) return;
    locationLayer.current.clearLayers();
    if (!position) return;
    const heading = Number.isFinite(position.heading) ? position.heading : 0;
    const arrow = `<svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 20.29c-.2.51.34 1.05.85.83L12 18l6.65 3.12c.5.24 1.06-.32.84-.83L12 2Z" transform="rotate(${heading} 12 12)" fill="#075fcd" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" style="filter:drop-shadow(0 1px 2px #0008)"/></svg>`;
    const icon = leaflet.divIcon({ className: 'trip-map-location-marker', html: arrow, iconSize: [44, 44], iconAnchor: [22, 22] });
    leaflet.marker([position.latitude, position.longitude], { icon, title: positionLabel, zIndexOffset: 1000 }).bindTooltip(positionLabel).addTo(locationLayer.current);
  }, [leaflet, position?.latitude, position?.longitude, position?.heading, positionLabel, signature]);
  useEffect(() => {
    if (!map.current || !followVehicle || !position) return;
    map.current.setView([position.latitude, position.longitude], 19, { animate: true, duration: 0.6 });
  }, [leaflet, followVehicle, focusRequest, position?.latitude, position?.longitude]);
  if (mapError) return <div role="alert">Não foi possível carregar o mapa. Recarregue a página para tentar novamente.</div>;
  return <div ref={element} aria-label="Mapa da viagem com localização e paradas" style={{ width: '100%', height: fullScreen ? '100%' : 300, borderRadius: fullScreen ? 0 : 14, overflow: 'hidden' }} />;
}
