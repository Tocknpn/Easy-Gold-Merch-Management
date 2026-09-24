/// <reference types="vite/client" />

/** Injected by `vite.config.ts` (`define`) — git short SHA + build time. */
declare const __BUILD__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}