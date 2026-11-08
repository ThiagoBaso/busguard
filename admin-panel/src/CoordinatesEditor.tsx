import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Field, TextInput } from './components';

const marilia: [number, number] = [-22.2139, -49.9458];
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function parseCoordinates(latitude: string, longitude: string): { latitude: number | null; longitude: number | null } {
  if (!latitude.trim() && !longitude.trim()) return { latitude: null, longitude: null };
  if (!latitude.trim() || !longitude.trim()) throw new Error('Informe latitude e longitude juntas.');
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('Informe coordenadas válidas.');
  }
  return { latitude: lat, longitude: lon };
}

export function CoordinatesEditor({ latitude, longitude, onChange }: {
  latitude: string; longitude: string; onChange: (latitude: string, longitude: string) => void;
}) {
  let selected: [number, number] | null = null;
  try {
    const point = parseCoordinates(latitude, longitude);
    if (point.latitude !== null && point.longitude !== null) selected = [point.latitude, point.longitude];
  } catch { /* O formulário mostra o erro ao salvar. */ }
  return <div className="coordinate-editor field-span-two">
    <div className="coordinate-inputs">
      <Field label="Latitude"><TextInput type="number" step="any" min={-90} max={90} value={latitude} onChange={(event) => onChange(event.target.value, longitude)} placeholder="Ex.: -22.2139" /></Field>
      <Field label="Longitude"><TextInput type="number" step="any" min={-180} max={180} value={longitude} onChange={(event) => onChange(latitude, event.target.value)} placeholder="Ex.: -49.9458" /></Field>
    </div>
    <p className="panel-hint">Clique no mapa para escolher a posição ou preencha as coordenadas. O cálculo público pelas ruas aceita somente dados fictícios da demonstração.</p>
    <div className="coordinate-map"><MapContainer center={selected ?? marilia} zoom={14} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={tileUrl} />
      <PickPoint onPick={(lat, lon) => onChange(lat.toFixed(6), lon.toFixed(6))} />
      {selected ? <><CenterPoint point={selected} /><CircleMarker center={selected} radius={8} pathOptions={{ color: '#8a6400', fillColor: '#ffc629', fillOpacity: 1 }} /></> : null}
    </MapContainer></div>
  </div>;
}

function PickPoint({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

function CenterPoint({ point }: { point: [number, number] }) {
  const map = useMap();
  useEffect(() => { if (!map.getBounds().contains(point)) map.panTo(point); }, [map, point[0], point[1]]);
  return null;
}
