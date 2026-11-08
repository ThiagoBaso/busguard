import type { AccessEvent, RoutePassenger, RouteStop } from './types';

export function completedMapStops(
  stops: RouteStop[], assignments: RoutePassenger[], events: AccessEvent[], vehicleId: number | null, startedAt: string | null, tripId: number | null = null,
) {
  const completed = new Set<number>();
  if (vehicleId == null) return completed;
  const boardedPassengers = new Set<number>();
  const pendingPassengers = new Set(events.filter(event => event.review_status === 'pending' && event.trip_id === tripId).map(event => event.passenger_id));
  for (const event of events) {
    if (event.review_status !== 'pending' && event.review_status !== 'rejected' && event.vehicle_id === vehicleId && (tripId != null ? tripId === event.trip_id : event.trip_id == null && (!startedAt || event.created_at >= startedAt)) && event.action.toLowerCase() === 'entry' && !pendingPassengers.has(event.passenger_id)) {
      boardedPassengers.add(event.passenger_id);
    }
  }
  for (const stop of stops) {
    const passengers = assignments.filter(link => link.active && link.stop_id === stop.id);
    if (passengers.length && passengers.every(link => boardedPassengers.has(link.passenger_id))) completed.add(stop.id);
  }
  return completed;
}
