import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Byggs under /skola när webbplatsens release bäddar in appen (se release.yml).
  // Ingen sökväg skickas som argument, så att shells inte skriver om den.
  base: process.env.ELDA_SKOLA_BUILD === '1' ? '/skola/' : '/',
  // Samma .env som det befintliga Elda-projektet. Nycklarna kopieras inte in i
  // Elda Skola, så det finns fortfarande bara en Supabase-konfiguration.
  envDir: path.resolve(here, '..'),
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    port: 4175,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
