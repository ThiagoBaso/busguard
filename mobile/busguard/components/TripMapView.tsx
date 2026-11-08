import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { MapViewProps } from './tripMapTypes';

export default function TripMapView({ stops, position, positionLabel, route, routed, nextRoute, nextRouteRouted }: MapViewProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.latitude, stop.longitude]));
  const hasStops = stops.length > 0;
  const positionAvailable = Boolean(position);
  const initial = position ?? (hasStops ? { latitude: stops[0].latitude!, longitude: stops[0].longitude! } : { latitude: -22.21, longitude: -49.94 });
  useEffect(() => {
    if (!ready) return;
    const points = stops.map(stop => ({ latitude: stop.latitude!, longitude: stop.longitude! }));
    if (position) points.push(position);
    if (points.length === 1) map.current?.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 });
    else if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: true });
  }, [ready, signature, hasStops, positionAvailable]);
  return <MapView ref={map} style={styles.map} initialRegion={{ ...initial, latitudeDelta: 0.03, longitudeDelta: 0.03 }} onMapReady={() => setReady(true)}>
    {route.length > 1 ? <Polyline coordinates={route} strokeColor="#bb8a00" strokeWidth={4} lineDashPattern={routed ? undefined : [8, 8]} /> : null}
    {nextRoute.length > 1 ? <Polyline coordinates={nextRoute} strokeColor="#075fcd" strokeWidth={5} lineDashPattern={nextRouteRouted ? undefined : [8, 8]} zIndex={0} /> : null}
    {stops.map(stop => <Marker key={stop.id} coordinate={{ latitude: stop.latitude!, longitude: stop.longitude! }} anchor={{ x: 0.5, y: 0.5 }} title={`Parada ${stop.sequence}${stop.completed ? ' · concluída' : ''}`} description={stop.address} zIndex={1000}><View style={[styles.stop, stop.completed && styles.completedStop]}><Text allowFontScaling={false} style={[styles.stopNumber, stop.sequence >= 100 && styles.stopNumberSmall, stop.completed && styles.completedStopNumber]}>{stop.sequence}</Text></View></Marker>)}
    {position ? <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }} title={positionLabel} zIndex={1000}><View style={styles.locationHalo}><View style={styles.locationDot} /></View></Marker> : null}
  </MapView>;
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 300, borderRadius: 14, overflow: 'hidden' },
  stop: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffc629', borderColor: '#6b4d00', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  completedStop: { backgroundColor: '#22c55e', borderColor: '#15803d' },
  stopNumber: { color: '#302200', fontSize: 14, lineHeight: 18, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  completedStopNumber: { color: '#052e16' },
  stopNumberSmall: { fontSize: 11 },
  locationHalo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(22, 105, 210, 0.28)', alignItems: 'center', justifyContent: 'center' },
  locationDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#fff', backgroundColor: '#075fcd' },
});
