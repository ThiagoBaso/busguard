import type { TripCommunication } from './types';

export function communicationIsRecent(communication: TripCommunication | undefined, now: number, error: string) {
  if (error || !communication?.received_at || communication.status !== 'recent') return false;
  const age = now - Date.parse(communication.received_at);
  return Number.isFinite(age) && age >= -30_000 && age <= communication.stale_after_seconds * 1000;
}

export function communicationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'horário inválido' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
