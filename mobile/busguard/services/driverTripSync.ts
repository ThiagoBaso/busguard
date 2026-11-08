import { useEffect, useSyncExternalStore } from 'react';
import type { DriverTrip } from './tripService';

const snapshots = new Map<number, DriverTrip>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach(listener => listener());
}

export function getDriverTripSnapshot(userId: number | null) {
  return userId === null ? null : snapshots.get(userId) ?? null;
}

export function publishDriverTripSnapshot(userId: number, trip: DriverTrip) {
  snapshots.set(userId, trip);
  notify();
}

export function clearDriverTripSnapshot(userId?: number) {
  if (userId === undefined) snapshots.clear();
  else snapshots.delete(userId);
  notify();
}

export function useDriverTripSnapshot(userId: number | null, fetchedTrip: DriverTrip | null, errorStatus: number | null) {
  const sharedTrip = useSyncExternalStore(subscribe, () => getDriverTripSnapshot(userId), () => null);

  useEffect(() => {
    if (userId === null) {
      clearDriverTripSnapshot();
    } else if (fetchedTrip) {
      publishDriverTripSnapshot(userId, fetchedTrip);
    } else if (errorStatus === 401 || errorStatus === 403 || errorStatus === 404) {
      clearDriverTripSnapshot(userId);
    }
  }, [userId, fetchedTrip, errorStatus]);

  return userId === null ? null : sharedTrip ?? fetchedTrip;
}
