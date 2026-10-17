import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Uppdateringens adress står bara i tauri.conf.json. Den läses in här så att
// adminpanelen kan visa den publicerade versionen även i webbläsaren, utan att
// adressen dupliceras i källkoden.
const tauriConf = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const updateEndpoint: string =
  tauriConf?.plugins?.updater?.endpoints?.[0] ?? '';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __ELDA_UPDATE_ENDPOINT__: JSON.stringify(updateEndpoint),
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
