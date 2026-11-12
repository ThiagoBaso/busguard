import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'BUSGUARD_');
  return {
    plugins: [react()],
    cacheDir: env.BUSGUARD_VITE_CACHE_DIR || undefined,
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: env.BUSGUARD_WATCH_POLLING === 'true' ? { usePolling: true, interval: 1000 } : undefined,
    },
  };
});
