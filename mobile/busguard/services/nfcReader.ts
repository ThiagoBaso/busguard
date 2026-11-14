export async function readNfcTag(_signal: AbortSignal): Promise<string> {
  throw new Error('A leitura NFC está disponível no aplicativo Android.');
}
