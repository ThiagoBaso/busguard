import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiFetch } from '@/services/apiClient';
import { useSession } from '@/services/session';

// Um sinal indica apenas que o app do motorista comunicou com a API.
export function TripCommunicationReporter() {
  const { user, status } = useSession();
  useEffect(() => {
    if (status !== 'signedIn' || user?.role !== 'driver') return;
    let active = true;
    let running = false;
    const controller = new AbortController();
    const report = async () => {
      if (!active || running || AppState.currentState !== 'active') return;
      running = true;
      try {
        await apiFetch('/driver/trips/current/heartbeat', { method: 'POST', signal: controller.signal });
      } catch {
        // O servidor mostrará a última comunicação recebida, sem presumir a causa.
      } finally {
        running = false;
      }
    };
    void report();
    const timer = setInterval(() => void report(), 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void report(); });
    return () => { active = false; controller.abort(); clearInterval(timer); listener.remove(); };
  }, [status, user?.id, user?.role]);
  return null;
}
