import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// Uppdateringens adress står bara i tauri.conf.json. Den läses in här så att
// adminpanelen kan visa rätt adress även i webbläsaren, utan att adressen
// dupliceras i källkoden.
const tauriConf = JSON.parse(
  readFileSync(path.resolve(here, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
);
const updateEndpoint: string = tauriConf?.plugins?.updater?.endpoints?.[0] ?? '';

// Appens version bakas in i bygget. I den installerade appen läser Tauri
// versionen själv, men i en webbläsare finns ingen sådan läsning — och
// inställningssidan ska kunna visa vilken version som faktiskt körs även där.
const appVersion: string = JSON.parse(readFileSync(path.resolve(here, 'package.json'), 'utf8')).version ?? '';

export default defineConfig({
  plugins: [react()],
  // Den nya appen läser samma .env som den befintliga appen (reporoten) i
  // stället för att kopiera nycklar till en ny fil. Inga hemligheter dupliceras.
  envDir: path.resolve(here, '..'),
  define: {
    __ELDA_UPDATE_ENDPOINT__: JSON.stringify(updateEndpoint),
    __ELDA_APP_VERSION__: JSON.stringify(appVersion),
  },
  clearScreen: false,
  server: {
    // Egen port så att den nya appen kan köras parallellt med den befintliga.
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // .mjs används av testet som kör hemsidans registreringssida (vanlig
    // JavaScript som läses från site/ och saknar typdeklarationer).
    include: ['src/**/*.test.{ts,tsx,mjs}'],
    restoreMocks: true,
  },
});
