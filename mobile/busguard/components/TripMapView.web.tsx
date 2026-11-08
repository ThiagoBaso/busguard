import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './trip-map-markers.css';
import type { MapViewProps } from './tripMapTypes';

export default function TripMapView({ stops, position, positionLabel, route, routed, nextRoute, nextRouteRouted }: MapViewProps) {
  const element = useRef<HTMLDivElement>(null);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);
  const [mapError, setMapError] = useState(false);
  const map = useRef<Leaflet.Map | null>(null);
  const routeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const navigationLayer = useRef<Leaflet.LayerGroup | null>(null);
  const locationLayer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef('');
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.sequence, stop.latitude, stop.longitude, stop.address, stop.completed]));
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
      popup.textContent = `Parada ${stop.sequence}: ${stop.address}`;
      const label = document.createElement('span');
      label.textContent = String(stop.sequence);
      const icon = leaflet.divIcon({ className: stop.completed ? 'trip-map-stop-marker trip-map-stop-marker-completed' : 'trip-map-stop-marker', html: label, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18] });
      leaflet.marker([stop.latitude!, stop.longitude!], { icon, title: `Parada ${stop.sequence}`, zIndexOffset: 100 })
        .bindPopup(popup).addTo(layer);
    });
    if ((stops.length || position) && fitted.current !== fitSignature) {
      fitted.current = fitSignature;
      const points: Leaflet.LatLngTuple[] = stops.map(stop => [stop.latitude!, stop.longitude!]);
      if (position) points.push([position.latitude, position.longitude]);
      const bounds = leaflet.latLngBounds(points);
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [leaflet, signature, routeSignature, routed, fitSignature]);
  useEffect(() => {
    if (!navigationLayer.current || !leaflet) return;
    navigationLayer.current.clearLayers();
    if (nextRoute.length > 1) leaflet.polyline(nextRoute.map(point => [point.latitude, point.longitude]), { pane: 'trip-navigation-pane', color: '#075fcd', weight: 5, dashArray: nextRouteRouted ? undefined : '8 8' }).addTo(navigationLayer.current);
  }, [leaflet, nextRouteSignature, nextRouteRouted]);
  useEffect(() => {
    if (!locationLayer.current || !map.current || !leaflet) return;
    locationLayer.current.clearLayers();
    if (!position) return;
    const icon = leaflet.divIcon({ className: 'trip-map-location-marker', html: '', iconSize: [44, 44], iconAnchor: [22, 22] });
    leaflet.marker([position.latitude, position.longitude], { icon, title: positionLabel, zIndexOffset: 1000 }).bindTooltip(positionLabel).addTo(locationLayer.current);
  }, [leaflet, position?.latitude, position?.longitude, positionLabel, signature]);
  if (mapError) return <div role="alert">Não foi possível carregar o mapa. Recarregue a página para tentar novamente.</div>;
  return <div ref={element} aria-label="Mapa da viagem com localização e paradas" style={{ width: '100%', height: 300, borderRadius: 14, overflow: 'hidden' }} />;
}
