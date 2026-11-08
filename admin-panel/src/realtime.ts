import { openChanges } from './api';

export const DATA_CHANGED = 'busguard:data-changed';

// Uma conexão por aba autenticada. A reconexão faz uma sincronização completa.
export function startRealtime() {
  const controller = new AbortController();
  let retryTimer: number | undefined;
  let retryDelay = 1000;

  async function connect() {
    try {
      const response = await openChanges(controller.signal);
      if (!response.body) throw new Error('Streaming indisponível');
      retryDelay = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separator: RegExpMatchArray | null;
          while ((separator = buffer.match(/\r?\n\r?\n/)) !== null && separator.index !== undefined) {
            const frame = buffer.slice(0, separator.index);
            buffer = buffer.slice(separator.index + separator[0].length);
            const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
            if (!data) continue;
            try {
              const tables: unknown = JSON.parse(data);
              if (Array.isArray(tables) && tables.every(item => typeof item === 'string')) {
                window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: tables }));
              }
            } catch { /* Um quadro inválido não interrompe a conexão. */ }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch {
      // Falhas de rede são tratadas pela reconexão e pela atualização periódica.
    }
    if (!controller.signal.aborted) {
      retryTimer = window.setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    }
  }
  void connect();
  return () => { controller.abort(); window.clearTimeout(retryTimer); };
}
