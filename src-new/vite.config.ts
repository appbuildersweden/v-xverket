import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Den nya appen läser samma .env som den befintliga appen (reporoten) i
  // stället för att kopiera nycklar till en ny fil. Inga hemligheter dupliceras.
  envDir: path.resolve(here, '..'),
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
