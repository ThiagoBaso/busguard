import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, Card } from '@/components/ui';
import TripMapView from '@/components/TripMapView';
import { canRouteDemo, locatedStops, selectNextStop, type MapPoint } from '@/components/tripMapTypes';
import { useTripQuery } from '@/hooks/useTripQuery';
import { useNextStopRoute } from '@/hooks/useNextStopRoute';
import { getDriverTripGeometry, getDriverTripMap } from '@/services/tripService';

export default function TripMap({ tripId, position, nextStopSequence }: { tripId: number; position: MapPoint | null; nextStopSequence: number | null }) {
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

  return <Card style={styles.card}>
    <AppText variant="label" muted>MAPA DA VIAGEM</AppText>
    <AppText style={styles.title}>Localização e paradas</AppText>
    {query.loading && !data ? <AppText muted>Carregando mapa da viagem…</AppText> : query.error && !data ? <AppText muted>Não foi possível carregar o mapa. Atualize a viagem para tentar novamente.</AppText> :
      shownPosition || located.length ? <TripMapView stops={located} position={shownPosition} positionLabel={positionLabel} route={route} routed={routed} nextRoute={nextRoute} nextRouteRouted={Boolean(navigation.points)} /> :
        <AppText muted>Nenhuma posição ou parada com coordenadas disponível.</AppText>}
    {!shownPosition ? <AppText muted>Aguardando localização do veículo.</AppText> : null}
    {shownPosition && nextStopSequence !== null && !locatedNextStop ? <AppText muted>Próxima parada sem coordenadas disponíveis.</AppText> : null}
    {stops.length > located.length ? <AppText muted>{stops.length - located.length} parada(s) sem coordenadas não aparecem no mapa.</AppText> : null}
    {(fullRouteError === routeKey && !routed) || (shownPosition && locatedNextStop && !navigation.points && (navigation.failed || navigation.stale || !navigation.canRoute)) ? <AppText muted>Trecho tracejado: linha reta de referência.</AppText> : null}
    {query.error && data ? <AppText muted>Mapa exibindo a última consulta; tentando atualizar.</AppText> : null}
  </Card>;
}

const styles = StyleSheet.create({ card: { gap: 10, borderRadius: 18 }, title: { fontSize: 17, fontWeight: '800' } });
