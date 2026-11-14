import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Switch, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/Brand';
import { AppText, Card } from '@/components/ui';
import { useAppTheme } from '@/constants/theme';
import TripMapView from '@/components/TripMapView';
import { canRouteDemo, locatedStops, selectNextStop, type MapPoint } from '@/components/tripMapTypes';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useNextStopRoute } from '@/hooks/useNextStopRoute';
import { getDriverTripGeometry, getDriverTripMap } from '@/services/tripService';

export default function TripMap({ tripId, position, nextStopSequence, sharing, onSharingChange }: { tripId: number; position: MapPoint | null; nextStopSequence: number | null; sharing: boolean; onSharingChange: (enabled: boolean) => void }) {
  const theme = useAppTheme();
  const mapUnavailable = Platform.OS === 'android' && process.env.EXPO_PUBLIC_DISABLE_NATIVE_MAP === '1';
  const insets = useSafeAreaInsets();
  const [fullScreen, setFullScreen] = useState(false);
  const [followVehicle, setFollowVehicle] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const loader = useCallback((signal?: AbortSignal) => getDriverTripMap(tripId, signal), [tripId]);
  const query = useTripQuery(loader);
  const data = query.data?.trip_id === tripId ? query.data : null;
  const stops = data?.stops ?? [];
  const located = locatedStops(stops);
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.sequence, stop.latitude, stop.longitude, stop.coordinate_source]));
  const canRoute = canRouteDemo(stops);
  const [geometry, setGeometry] = useState<{ key: string; points: MapPoint[] } | null>(null);
  const [fullRouteError, setFullRouteError] = useState('');
  const routeKey = `${tripId}:${signature}`;

  useEffect(() => {
    if (!canRoute) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const calculate = () => {
      void getDriverTripGeometry(tripId, controller.signal).then(result => {
        if (!controller.signal.aborted) { setGeometry({ key: routeKey, points: result.coordinates.map(([latitude, longitude]) => ({ latitude, longitude })) }); setFullRouteError(''); }
      }).catch(() => {
        if (!controller.signal.aborted) { setFullRouteError(routeKey); retry = setTimeout(calculate, 30000); }
      });
    };
    calculate();
    return () => { controller.abort(); if (retry !== undefined) clearTimeout(retry); };
  }, [tripId, routeKey, canRoute]);

  const routed = geometry?.key === routeKey && geometry.points.length >= 2;
  const route = useMemo(() => routed ? geometry!.points : located.length === stops.length ? located.map(({ latitude, longitude }) => ({ latitude, longitude })) : [], [routed, geometry, signature]);
  const shownPosition = position ?? (data?.location ? { latitude: data.location.latitude, longitude: data.location.longitude } : null);
  const positionLabel = data?.location?.source === 'demo' && !position ? 'Posição simulada' : 'Veículo';
  const nextStop = selectNextStop(stops, nextStopSequence);
  const locatedNextStop = located.find(stop => stop.id === nextStop?.id);
  const navigation = useNextStopRoute(tripId, locatedNextStop, shownPosition);
  const nextRoute = shownPosition && locatedNextStop
    ? navigation.points ? [shownPosition, ...navigation.points] : [shownPosition, { latitude: locatedNextStop.latitude, longitude: locatedNextStop.longitude }]
    : [];
  const headingTarget = shownPosition ? nextRoute.slice(1).find(point => {
    const lat = (point.latitude - shownPosition.latitude) * 111320;
    const lon = (point.longitude - shownPosition.longitude) * 111320 * Math.cos(shownPosition.latitude * Math.PI / 180);
    return Math.hypot(lat, lon) >= 5;
  }) : undefined;
  const targetPosition = useMemo(() => {
    const destination = headingTarget;
    if (!shownPosition || shownPosition.heading != null || !destination) return shownPosition;
    const lat1 = shownPosition.latitude * Math.PI / 180;
    const lat2 = destination.latitude * Math.PI / 180;
    const dLon = (destination.longitude - shownPosition.longitude) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return { ...shownPosition, heading: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 };
  }, [shownPosition?.latitude, shownPosition?.longitude, shownPosition?.heading, headingTarget?.latitude, headingTarget?.longitude]);

  const mapView = (expanded: boolean) => mapUnavailable
    ? <View style={[styles.mapUnavailable, expanded && styles.mapUnavailableFull, { backgroundColor: theme.surfaceAlt }]}><AppText muted>Mapa indisponível nesta versão de teste.</AppText></View>
    : <TripMapView stops={located} position={targetPosition} positionLabel={positionLabel} route={route} routed={routed} nextRoute={nextRoute} nextRouteRouted={Boolean(navigation.points)} followVehicle={followVehicle} focusRequest={focusRequest} fullScreen={expanded} />;
  const focusButton = (bottom: number) => <Pressable accessibilityRole="button" accessibilityLabel="Focar e acompanhar veículo" accessibilityState={{ disabled: !shownPosition, selected: followVehicle }} disabled={!shownPosition} onPress={() => { setFollowVehicle(true); setFocusRequest(value => value + 1); }} style={({ pressed }) => [styles.mapButton, styles.focusButton, { bottom, backgroundColor: theme.surface, borderColor: theme.border, opacity: !shownPosition ? 0.45 : pressed ? 0.75 : 1 }]}>
    <AppIcon name="locate" size={23} color={theme.primary} />
  </Pressable>;

  return <Card style={styles.card}>
    <View style={styles.heading}><AppText style={styles.title}>Localização e paradas</AppText><Switch accessibilityLabel="Compartilhar localização" value={sharing} onValueChange={onSharingChange} /></View>
    {query.loading && !data ? <AppText muted>Carregando mapa da viagem…</AppText> : query.error && !data ? <AppText muted>Não foi possível carregar o mapa. Atualize a viagem para tentar novamente.</AppText> :
      shownPosition || located.length ? <View style={styles.mapContainer}>
        {!fullScreen ? mapView(false) : <View style={styles.mapPlaceholder} />}
        {!mapUnavailable ? focusButton(12) : null}
        {!mapUnavailable ? <Pressable accessibilityRole="button" accessibilityLabel="Expandir mapa para tela cheia" onPress={() => setFullScreen(true)} style={({ pressed }) => [styles.mapButton, styles.expandButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.75 : 1 }]}>
          <AppIcon name="expand" size={23} color={theme.primary} />
        </Pressable> : null}
      </View> :
        <AppText muted>Nenhuma posição ou parada com coordenadas disponível.</AppText>}
    {!shownPosition ? <AppText muted>Aguardando localização do veículo.</AppText> : null}
    {shownPosition && nextStopSequence !== null && !locatedNextStop ? <AppText muted>Próxima parada sem coordenadas disponíveis.</AppText> : null}
    {stops.length > located.length ? <AppText muted>{stops.length - located.length} parada(s) sem coordenadas não aparecem no mapa.</AppText> : null}
    {(fullRouteError === routeKey && !routed) || (shownPosition && locatedNextStop && !navigation.points && (navigation.failed || navigation.stale || !navigation.canRoute)) ? <AppText muted>Trecho tracejado: linha reta de referência.</AppText> : null}
    {query.error && data ? <AppText muted>Mapa exibindo a última consulta; tentando atualizar.</AppText> : null}
    {fullScreen ? <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setFullScreen(false)}>
      <View style={[styles.fullScreen, { backgroundColor: theme.background }]}>
        {mapView(true)}
        <View style={[styles.fullScreenHeader, { top: Math.max(insets.top, 12) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar à tela Início" onPress={() => setFullScreen(false)} style={({ pressed }) => [styles.mapButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.75 : 1 }]}>
            <AppIcon name="back" size={23} color={theme.primary} />
          </Pressable>
          <View style={[styles.sharingControl, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <AppText style={styles.sharingLabel}>Localização</AppText>
            <Switch accessibilityLabel="Compartilhar localização" value={sharing} onValueChange={onSharingChange} />
          </View>
        </View>
        {focusButton(Math.max(insets.bottom + 12, 20))}
      </View>
    </Modal> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: 10, borderRadius: 18 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { fontSize: 17, fontWeight: '800', flex: 1 },
  mapContainer: { position: 'relative' }, mapPlaceholder: { height: 300 }, mapUnavailable: { height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 20 }, mapUnavailableFull: { flex: 1 },
  mapButton: { width: 46, height: 46, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 1000 },
  focusButton: { position: 'absolute', right: 12 }, expandButton: { position: 'absolute', right: 12, bottom: 66 },
  fullScreen: { flex: 1, position: 'relative' }, fullScreenHeader: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1000 },
  sharingControl: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 46, borderRadius: 13, borderWidth: 1, elevation: 4 }, sharingLabel: { fontWeight: '700', fontSize: 13 },
});
