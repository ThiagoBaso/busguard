import type { AccessEvent, RoutePassenger, RouteStop } from './types';

export function completedMapStops(
  stops: RouteStop[], assignments: RoutePassenger[], events: AccessEvent[], vehicleId: number | null, startedAt: string | null,
) {
  const completed = new Set<number>();
  if (vehicleId == null) return completed;
  const boardedPassengers = new Set<number>();
  for (const event of events) {
    if (event.vehicle_id === vehicleId && (!startedAt || event.created_at >= startedAt) && event.action.toLowerCase() === 'entry') {
      boardedPassengers.add(event.passenger_id);
    }
  }
  for (const stop of stops) {
    const passengers = assignments.filter(link => link.active && link.stop_id === stop.id);
    if (passengers.length && passengers.every(link => boardedPassengers.has(link.passenger_id))) completed.add(stop.id);
  }
  return completed;
}
