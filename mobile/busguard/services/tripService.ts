import { apiFetch } from '@/services/apiClient';

export type BoardingStudent = {
  id: string;
  name: string;
  age: number;
  stopOrder: number;
  stopName: string;
  address: string;
  checkedIn: boolean;
  status: 'waiting' | 'present' | 'absent';
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

export type ResponsibleTrip = {
  id: number;
  routeName: string;
  status: string;
  childName: string;
  childStatus: string;
  lastUpdate: string;
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
  passenger_id: number;
  checked_in: boolean;
  event_id: number;
  duplicated: boolean;
};

export async function updateBoardingStatus(
  tripId: number,
  passengerId: string,
  checkedIn: boolean,
  signal?: AbortSignal,
) {
  const passenger = Number(passengerId);
  if (!Number.isInteger(passenger) || passenger <= 0 || !Number.isInteger(tripId) || tripId <= 0) throw new Error('Identificador inválido.');
  return apiFetch<BoardingResponse>(`/driver/trips/${tripId}/boarding`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      passenger_id: passenger,
      checked_in: checkedIn,
    }),
  });
}
