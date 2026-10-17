/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Uppdateringens adress, inläst från src-tauri/tauri.conf.json vid bygget. */
declare const __ELDA_UPDATE_ENDPOINT__: string;
