// Serializa a abertura e o encerramento do leitor ao trocar rapidamente de tela.
let previousSession: Promise<void> = Promise.resolve();

export async function readNfcTag(signal: AbortSignal): Promise<string> {
  const previous = previousSession;
  let release: () => void = () => {};
  previousSession = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    if (signal.aborted) throw new Error('Leitura cancelada.');
    let nfc: typeof import('react-native-nfc-manager');
    try { nfc = await import('react-native-nfc-manager'); }
    catch { throw new Error('Esta versão do aplicativo não inclui NFC. Instale uma versão de desenvolvimento com NFC.'); }
    const { default: manager, Ndef, NfcEvents, NfcAdapter } = nfc;
    let registered = false;
    let abortRead: (() => void) | undefined;
    const checkCancelled = () => { if (signal.aborted) throw new Error('Leitura cancelada.'); };
    try {
      checkCancelled();
      if (!await manager.isSupported()) throw new Error('Este celular não possui NFC compatível.');
      checkCancelled();
      if (!await manager.isEnabled()) throw new Error('Ative o NFC nas configurações do celular.');
      checkCancelled();
      await manager.start();
      checkCancelled();
      const discovered = new Promise<import('react-native-nfc-manager').TagEvent>((resolve, reject) => {
        abortRead = () => reject(new Error('Leitura cancelada.'));
        manager.setEventListener(NfcEvents.DiscoverTag, tag => resolve(tag));
        signal.addEventListener('abort', abortRead, { once: true });
      });
      void discovered.catch(() => {});
      checkCancelled();
      await manager.registerTagEvent({ isReaderModeEnabled: true, readerModeFlags: NfcAdapter.FLAG_READER_NFC_A });
      registered = true;
      checkCancelled();
      const tag = await discovered;
      checkCancelled();
      const record = tag.ndefMessage?.find(item => item.tnf === 1 && (Array.isArray(item.type) ? item.type.length === 1 && item.type[0] === 84 : item.type === '54' || item.type === 'T'));
      if (!record?.payload) throw new Error('A tag não contém uma credencial BusGuard.');
      let token: string;
      try { token = Ndef.text.decodePayload(Uint8Array.from(record.payload)); }
      catch { throw new Error('Não foi possível ler o conteúdo da tag.'); }
      if (!/^busguard:nfc:v1:[0-9a-f]{32}$/.test(token)) throw new Error('A tag não contém uma credencial BusGuard válida.');
      return token;
    } finally {
      if (abortRead) signal.removeEventListener('abort', abortRead);
      manager.setEventListener(NfcEvents.DiscoverTag, null);
      if (registered) await manager.unregisterTagEvent().catch(() => {});
    }
  } finally { release(); }
}
