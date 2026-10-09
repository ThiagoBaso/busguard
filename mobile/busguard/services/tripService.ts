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
  time?: string;
};

export type DriverTrip = {
  id?: number;
  routeName: string;
  vehicleLabel: string;
  status: string;
  progressLabel: string;
  students: BoardingStudent[];
};

export type ResponsibleTrip = {
  id?: number;
  routeName: string;
  status: string;
  childName: string;
  childStatus: string;
  lastUpdate: string;
  driverName: string;
  vehicleLabel: string;
};

export async function getDriverTrip(): Promise<DriverTrip> {
  return apiFetch<DriverTrip>('/driver/trips/current');
}

export async function getResponsibleTrip(): Promise<ResponsibleTrip> {
  return apiFetch<ResponsibleTrip>('/responsible/children/current-trip');
}

export async function updateBoardingStatus(
  tripId: number,
  passengerId: string,
  checkedIn: boolean,
) {
  return apiFetch(`/driver/trips/${tripId}/boarding`, {
    method: 'POST',
    body: JSON.stringify({
      passenger_id: Number(passengerId),
      checked_in: checkedIn,
    }),
  });
}
