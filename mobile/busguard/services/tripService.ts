import { apiFetch } from '@/services/apiClient';

export type BoardingStudent = {
  id: string;
  name: string;
  age: number;
  stopOrder: number;
  stopName: string;
  address: string;
  checkedIn: boolean;
  boarded?: boolean;
  pendingReview?: boolean;
  status: 'waiting' | 'present' | 'absent' | 'review';
  time?: string | null;
};

export type DriverTrip = {
  id: number;
  routeName: string;
  vehicleLabel: string;
  status: string;
  progressLabel: string;
  students: BoardingStudent[];
};

export type TripMapStop = { id: number; sequence: number; address: string; latitude: number | null; longitude: number | null; coordinate_source: string; completed?: boolean };
export type TripMapData = { trip_id: number; stops: TripMapStop[]; location: { latitude: number; longitude: number; source: string; recorded_at: string } | null };
export type TripGeometry = { coordinates: [number, number][]; distance_m: number; duration_s: number };

export async function getDriverTripMap(tripId: number, signal?: AbortSignal): Promise<TripMapData> {
  return apiFetch<TripMapData>(`/driver/trips/${tripId}/map`, { signal });
}

export async function getDriverTripGeometry(tripId: number, signal?: AbortSignal): Promise<TripGeometry> {
  return apiFetch<TripGeometry>(`/driver/trips/${tripId}/map/geometry`, { signal });
}

export async function getNextStopGeometry(tripId: number, stopId: number, position: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<TripGeometry> {
  return apiFetch<TripGeometry>(`/driver/trips/${tripId}/map/next-stop`, {
    method: 'POST', signal,
    body: JSON.stringify({ stop_id: stopId, latitude: position.latitude, longitude: position.longitude }),
  });
}

export type ResponsibleTrip = {
  id: number;
  routeName: string;
  status: string;
  childName: string;
  childStatus: string;
  lastUpdate: string;
  lastEventAt: string | null;
  lastCommunication: string | null;
  communicationStatus: 'recent' | 'stale' | 'unknown';
  driverName: string;
  vehicleLabel: string;
};

export async function getDriverTrip(signal?: AbortSignal): Promise<DriverTrip> {
  return apiFetch<DriverTrip>('/driver/trips/current', { signal });
}

export async function getResponsibleTrip(signal?: AbortSignal): Promise<ResponsibleTrip> {
  return apiFetch<ResponsibleTrip>('/responsible/children/current-trip', { signal });
}

export type BoardingResponse = {
  event: { id: number; review_status: 'accepted' | 'pending' | 'rejected' };
  duplicated: boolean;
};
export type BoardingSubmission = { eventUuid: string; occurredAt: string };

export async function updateBoardingStatus(
  tripId: number,
  passengerId: string,
  checkedIn: boolean,
  signal?: AbortSignal,
  submission?: BoardingSubmission,
) {
  const passenger = Number(passengerId);
  if (!Number.isInteger(passenger) || passenger <= 0 || !Number.isInteger(tripId) || tripId <= 0) throw new Error('Identificador inválido.');
  if (!submission) throw new Error('Identificador do evento ausente.');
  return apiFetch<BoardingResponse>(`/driver/trips/${tripId}/events`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      passenger_id: passenger,
      action: checkedIn ? 'entry' : 'exit',
      event_uuid: submission.eventUuid,
      occurred_at: submission.occurredAt,
    }),
  });
}

export async function updateVehicleLocation(
  tripId: number,
  location: { latitude: number; longitude: number; speedKmh?: number | null },
  signal?: AbortSignal,
): Promise<{ id: number; trip_id: number; latitude: number; longitude: number; speed_kmh: number | null; recorded_at: string }> {
  if (!Number.isInteger(tripId) || tripId <= 0) throw new Error('Identificador inválido.');
  return apiFetch<{ id: number; trip_id: number; latitude: number; longitude: number; speed_kmh: number | null; recorded_at: string }>(`/driver/trips/${tripId}/location`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      ...(location.speedKmh != null ? { speed_kmh: location.speedKmh } : {}),
    }),
  });
}
