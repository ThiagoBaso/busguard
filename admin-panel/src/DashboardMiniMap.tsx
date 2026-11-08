import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LiveVehicleLocation } from './types';

const marilia: [number, number] = [-22.2139, -49.9458];
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function DashboardMiniMap({ locations }: { locations: LiveVehicleLocation[] }) {
  const center: [number, number] = locations[0] ? [locations[0].latitude, locations[0].longitude] : marilia;

  return (
    <div className="dashboard-mini-map" aria-label="Mapa dos veículos em andamento">
      <MapContainer center={center} zoom={locations.length ? 13 : 12} scrollWheelZoom={false} className="leaflet-map" zoomControl={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={tileUrl} />
        <FitLocations locations={locations} />
        {locations.map((location) => <CircleMarker
          key={location.trip_id}
          center={[location.latitude, location.longitude]}
          radius={8}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#1677d2', fillOpacity: 1 }}
        >
          <Popup>
            <strong>{location.vehicle_label}</strong><br />
            {location.route_name}<br />
            {location.source === 'demo' ? 'Posição simulada' : 'Posição GPS'}
          </Popup>
        </CircleMarker>)}
      </MapContainer>
      {locations.length === 0 ? <div className="dashboard-mini-map-empty">Aguardando posição dos veículos</div> : null}
    </div>
  );
}

function FitLocations({ locations }: { locations: LiveVehicleLocation[] }) {
  const map = useMap();
  const locationKey = locations.map(({ trip_id, latitude, longitude }) => `${trip_id}:${latitude}:${longitude}`).join('|');

  useEffect(() => {
    if (!locations.length) {
      map.setView(marilia, 12);
    } else if (locations.length === 1) {
      map.setView([locations[0].latitude, locations[0].longitude], 14);
    } else {
      const bounds: [number, number][] = locations.map(({ latitude, longitude }) => [latitude, longitude]);
      map.fitBounds(bounds, { padding: [22, 22], maxZoom: 14 });
    }
  }, [locationKey, locations, map]);

  return null;
}
