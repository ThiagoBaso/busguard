import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { ApiError } from '@/services/apiClient';
import { getDriverTrip, updateVehicleLocation } from '@/services/tripService';

type ShareState = 'idle' | 'requesting' | 'sharing' | 'denied' | 'error';
type Position = { latitude: number; longitude: number; heading: number | null };
type Sharing = { state: ShareState; active: boolean; tripId: number | null; position: Position | null; start: (tripId: number) => Promise<void>; stop: () => void };
const Context = createContext<Sharing | null>(null);

// O provedor vive acima das abas para não encerrar a localização ao abrir a chamada.
export function LocationSharingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShareState>('idle');
  const [activeTrip, setActiveTrip] = useState<number | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const previousPosition = useRef<(Position & { accuracy: number | null }) | null>(null);
  const lastHeading = useRef<number | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const sending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const starting = useRef(false);

  const stop = useCallback(() => {
    generation.current += 1;
    starting.current = false;
    subscription.current?.remove();
    subscription.current = null;
    sending.current?.abort();
    sending.current = null;
    previousPosition.current = null;
    lastHeading.current = null;
    if (mounted.current) { setActiveTrip(null); setPosition(null); setState('idle'); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', value => { if (value === 'background') stop(); });
    return () => { mounted.current = false; listener.remove(); stop(); };
  }, [stop]);

  const start = useCallback(async (tripId: number) => {
    if (starting.current || subscription.current || !Number.isSafeInteger(tripId) || tripId <= 0) return;
    const current = ++generation.current;
    starting.current = true;
    setState('requesting');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current || current !== generation.current) return;
      if (permission.status !== 'granted') { setState('denied'); return; }
      if (AppState.currentState === 'background') { stop(); return; }
      const watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 0 },
        location => {
          if (!mounted.current || current !== generation.current) return;
          const { latitude, longitude, speed, heading, accuracy } = location.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
          const previous = previousPosition.current;
          const moving = speed == null || speed < 0 || speed >= 1;
          const headingAvailable = moving && heading != null && Number.isFinite(heading) && heading >= 0 && heading < 360;
          let course = headingAvailable ? heading : lastHeading.current;
          let updateReference = !previous || headingAvailable;
          if (!headingAvailable && previous && moving) {
            const lat1 = previous.latitude * Math.PI / 180;
            const lat2 = latitude * Math.PI / 180;
            const dLon = (longitude - previous.longitude) * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            const distance = 2 * 6371000 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2));
            const accuracyMeters = accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0;
            const threshold = Math.max(8, accuracyMeters, previous.accuracy ?? 0);
            if (distance > threshold) { course = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; updateReference = true; }
          }
          const nextPosition = { latitude, longitude, heading: course };
          if (updateReference) previousPosition.current = { ...nextPosition, accuracy: accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null };
          lastHeading.current = course;
          setPosition(nextPosition);
          if (sending.current) return;
          const operation = new AbortController();
          sending.current = operation;
          const speedKmh = speed != null && speed >= 0 && speed * 3.6 <= 180 ? speed * 3.6 : null;
          void updateVehicleLocation(tripId, { latitude, longitude, speedKmh }, operation.signal).then(() => {
            if (mounted.current && current === generation.current) setState('sharing');
          }).catch(error => {
            if (!mounted.current || current !== generation.current || operation.signal.aborted) return;
            if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) stop();
            else setState('error');
          }).finally(() => { if (sending.current === operation) sending.current = null; });
        },
      );
      if (!mounted.current || current !== generation.current) { watcher.remove(); return; }
      subscription.current = watcher;
      setActiveTrip(tripId);
      setState('sharing');
    } catch {
      if (mounted.current && current === generation.current) setState('error');
    } finally {
      if (current === generation.current) starting.current = false;
    }
  }, [stop]);

  useEffect(() => {
    if (activeTrip === null) return;
    const controller = new AbortController();
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const trip = await getDriverTrip(controller.signal);
        if (!controller.signal.aborted && trip.id !== activeTrip) stop();
      } catch (error) {
        if (!controller.signal.aborted && error instanceof ApiError && [401, 403, 404].includes(error.status)) stop();
      } finally { running = false; }
    };
    const timer = setInterval(() => void check(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [activeTrip, stop]);

  return <Context.Provider value={{ state, active: activeTrip !== null, tripId: activeTrip, position, start, stop }}>{children}</Context.Provider>;
}

export function useLocationSharing() {
  const value = useContext(Context);
  if (!value) throw new Error('LocationSharingProvider ausente');
  return value;
}
