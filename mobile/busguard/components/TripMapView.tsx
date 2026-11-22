import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { AppIcon } from '@/components/Brand';
import type { MapViewProps } from './tripMapTypes';

export default function TripMapView({ stops, position, positionLabel, route, routed, nextRoute, nextRouteRouted, followVehicle, focusRequest, fullScreen = false }: MapViewProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [cameraHeading, setCameraHeading] = useState(0);
  const cameraRead = useRef(0);
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.latitude, stop.longitude]));
  const hasStops = stops.length > 0;
  const positionAvailable = Boolean(position);
  const initial = position ?? (hasStops ? { latitude: stops[0].latitude!, longitude: stops[0].longitude! } : { latitude: -22.21, longitude: -49.94 });
  useEffect(() => {
    if (!ready || followVehicle) return;
    const points = stops.map(stop => ({ latitude: stop.latitude!, longitude: stop.longitude! }));
    if (position) points.push(position);
    if (points.length === 1) map.current?.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 });
    else if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: true });
  }, [ready, signature, hasStops, positionAvailable, followVehicle]);
  useEffect(() => {
    if (!ready || !followVehicle || !position) return;
    const heading = position.heading ?? 0;
    const headingRadians = heading * Math.PI / 180;
    const offset = 35 / 6371000;
    const latitude = position.latitude * Math.PI / 180;
    const center = {
      latitude: position.latitude + offset * Math.cos(headingRadians) * 180 / Math.PI,
      longitude: position.longitude + offset * Math.sin(headingRadians) / Math.cos(latitude) * 180 / Math.PI,
    };
    cameraRead.current += 1;
    setCameraHeading(heading);
    map.current?.animateCamera({ center, heading, pitch: 64, zoom: 19.5, altitude: 260 }, { duration: 700 });
  }, [ready, followVehicle, focusRequest, position?.latitude, position?.longitude, position?.heading]);
  return <MapView ref={map} style={fullScreen ? styles.fullScreenMap : styles.map} initialRegion={{ ...initial, latitudeDelta: 0.03, longitudeDelta: 0.03 }} onMapReady={() => setReady(true)} onRegionChangeComplete={() => {
    const request = ++cameraRead.current;
    void map.current?.getCamera().then(camera => { if (request === cameraRead.current && Number.isFinite(camera.heading)) setCameraHeading(camera.heading); }).catch(() => {});
  }}>
    {route.length > 1 ? <Polyline coordinates={route} strokeColor="#bb8a00" strokeWidth={4} lineDashPattern={routed ? undefined : [8, 8]} /> : null}
    {nextRoute.length > 1 ? <Polyline coordinates={nextRoute} strokeColor="#075fcd" strokeWidth={5} lineDashPattern={nextRouteRouted ? undefined : [8, 8]} zIndex={0} /> : null}
    {stops.map(stop => <Marker key={stop.id} coordinate={{ latitude: stop.latitude!, longitude: stop.longitude! }} anchor={{ x: 0.5, y: 0.5 }} title={`${stop.final ? 'Destino final' : 'Parada'} ${stop.sequence}${stop.completed ? ' · concluída' : ''}`} description={stop.address} zIndex={1000}><View style={[styles.stop, stop.completed && styles.completedStop]}><Text allowFontScaling={false} style={[styles.stopNumber, stop.sequence >= 100 && styles.stopNumberSmall, stop.completed && styles.completedStopNumber]}>{stop.final ? '⚑' : stop.sequence}</Text></View></Marker>)}
    {position ? <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} title={positionLabel} zIndex={1000}><View style={[styles.vehicleMarker, { transform: [{ rotate: `${(position.heading ?? 0) - cameraHeading}deg` }] }]}><View style={styles.vehicleIcon}><AppIcon name="navigation" size={28} color="#075fcd" /></View></View></Marker> : null}
  </MapView>;
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 300, borderRadius: 14, overflow: 'hidden' },
  fullScreenMap: { width: '100%', flex: 1 },
  stop: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffc629', borderColor: '#6b4d00', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  completedStop: { backgroundColor: '#22c55e', borderColor: '#15803d' },
  stopNumber: { color: '#302200', fontSize: 14, lineHeight: 18, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  completedStopNumber: { color: '#052e16' },
  stopNumberSmall: { fontSize: 11 },
  vehicleMarker: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  vehicleIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
});
