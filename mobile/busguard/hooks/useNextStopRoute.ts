import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { MapPoint } from '@/components/tripMapTypes';
import { getNextStopGeometry, type TripMapStop } from '@/services/tripService';

export function distanceMeters(a: MapPoint, b: MapPoint) {
  const radians = Math.PI / 180;
  const lat = (a.latitude - b.latitude) * radians;
  const lon = (a.longitude - b.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useNextStopRoute(tripId: number, stop: TripMapStop | undefined, position: MapPoint | null) {
  const latestPosition = useRef(position);
  latestPosition.current = position;
  const [result, setResult] = useState<{ key: string; origin: MapPoint; points: MapPoint[] } | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const key = `${tripId}:${stop?.id ?? ''}:${stop?.latitude ?? ''}:${stop?.longitude ?? ''}:${stop?.coordinate_source ?? ''}`;
  const canRoute = stop?.coordinate_source === 'demo' && stop.latitude != null && stop.longitude != null;
  const hasPosition = Boolean(position);

  useFocusEffect(useCallback(() => {
    if (!stop || !canRoute || !hasPosition) return;
    let active = true;
    let inFlight: AbortController | null = null;
    let lastSuccess: MapPoint | null = null;
    const calculate = async () => {
      const origin = latestPosition.current;
      if (!origin || inFlight || (lastSuccess && distanceMeters(lastSuccess, origin) < 50)) return;
      const controller = new AbortController();
      inFlight = controller;
      try {
        const route = await getNextStopGeometry(tripId, stop.id, origin, controller.signal);
        if (!active || controller.signal.aborted) return;
        const points = route.coordinates.map(([latitude, longitude]) => ({ latitude, longitude }));
        if (points.length < 2) throw new Error('Trajeto indisponível');
        lastSuccess = origin;
        setResult({ key, origin, points });
        setFailedKey('');
      } catch {
        if (active && !controller.signal.aborted) { lastSuccess = null; setFailedKey(key); setResult(current => current?.key === key ? null : current); }
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    };
    void calculate();
    const timer = setInterval(() => void calculate(), 15000);
    return () => { active = false; inFlight?.abort(); clearInterval(timer); };
  }, [tripId, key, canRoute, hasPosition]));

  const stale = Boolean(result?.key === key && position && distanceMeters(result.origin, position) >= 150);
  return { points: result?.key === key && position && !stale ? result.points : null, failed: failedKey === key, canRoute, stale };
}
