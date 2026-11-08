import type { BoardingStudent, TripMapStop } from '@/services/tripService';

export type MapPoint = { latitude: number; longitude: number };
export type MapViewProps = { stops: TripMapStop[]; position: MapPoint | null; positionLabel: string; route: MapPoint[]; routed: boolean; nextRoute: MapPoint[]; nextRouteRouted: boolean };

export function locatedStops(stops: TripMapStop[]) {
  return stops.filter((stop): stop is TripMapStop & MapPoint =>
    stop.latitude !== null && stop.longitude !== null && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
    && Math.abs(stop.latitude) <= 90 && Math.abs(stop.longitude) <= 180);
}

export function canRouteDemo(stops: TripMapStop[]) {
  return stops.length >= 2 && stops.length <= 100 && locatedStops(stops).length === stops.length && stops.every(stop => stop.coordinate_source === 'demo');
}

export function selectNextStop(stops: TripMapStop[], sequence: number | null) {
  if (sequence !== null) return stops.find(stop => stop.sequence === sequence);
  return stops.reduce<TripMapStop | undefined>((last, stop) => !last || stop.sequence > last.sequence ? stop : last, undefined);
}

export function nextBoardingStopSequence(students: BoardingStudent[]) {
  return students.filter(student => !(student.boarded ?? student.checkedIn) && student.status !== 'absent')
    .reduce<number | null>((next, student) => next === null || student.stopOrder < next ? student.stopOrder : next, null);
}
