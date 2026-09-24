// ── Crash log + stale-chunk recovery ─────────────────────────────────────
// The app had NO error boundary and no global handler, so any uncaught error
// (a failed lazy chunk, a render exception, a blocked-storage SecurityError)
// unmounted the whole React root and left the user on a blank page with no
// clue. Everything that goes wrong is recorded here so it shows up in
// Diagnostics → "Last app crash" and can be reported with one click.
import { safeGet, safeGetJson, safeRemove, safeSet, safeSetJson } from './safeStorage';

export type CrashSource = 'render' | 'page' | 'window' | 'promise' | 'preload';

export interface CrashEntry {
  at: string;
  message: string;
  stack?: string | null;
  url?: string;
  source?: CrashSource;
  build?: string;
  ua?: string;
}

const KEY = 'eg-last-error';
const MAX = 5;
const RELOAD_KEY = 'eg-chunk-reloads';
const MAX_AUTO_RELOADS = 2;

/** Injected by `vite.config.ts` (`define`) — git short SHA + build time. */
export const BUILD_STAMP: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

export const describeError = (err: unknown): { message: string; stack?: string } => {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
};

/** The classic "the deployed chunk is gone / the server answered HTML" failures. */
export const isChunkLoadError = (message?: string | null): boolean =>
  /dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to fetch module|expected a javascript module script|media type of ["']?text\/html|strict mime type|is missing \(stale build|loading chunk/i
    .test(String(message || ''));

export function recordCrash(entry: Partial<CrashEntry> & { message: string }): CrashEntry {
  const full: CrashEntry = {
    at: entry.at || new Date().toISOString(),
    message: entry.message,
    stack: entry.stack ?? null,
    source: entry.source ?? 'render',
    build: entry.build || BUILD_STAMP,
    ua: entry.ua || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    url: entry.url || (typeof location !== 'undefined' ? location.href : undefined),
  };
  try {
    const list = readCrashes();
    list.unshift(full);
    safeSetJson(KEY, list.slice(0, MAX));
  } catch {
    /* the logger itself must never throw */
  }
  // eslint-disable-next-line no-console
  console.error(`[crash:${full.source}] ${full.message}`, full.stack || '');
  return full;
}

export function readCrashes(): CrashEntry[] {
  const list = safeGetJson<CrashEntry[]>(KEY);
  return Array.isArray(list) ? list : [];
}

export function clearCrashes(): void {
  safeSetJson(KEY, []);
}

/**
 * Reload once when a code-split chunk cannot be fetched (published a new build
 * while a tab was open, or a flaky connection). Capped per session so a truly
 * broken deployment shows the error card instead of looping.
 */
export function reloadForStaleChunk(): boolean {
  try {
    const tries = Number(safeGet(RELOAD_KEY) || '0');
    if (!Number.isFinite(tries) || tries >= MAX_AUTO_RELOADS) return false;
    safeSet(RELOAD_KEY, String(tries + 1));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** The error card tags <html data-crash="1">; a clean boot re-arms the reload. */
export function markCrashed(flag: boolean): void {
  if (typeof document === 'undefined') return;
  if (flag) document.documentElement.dataset.crash = '1';
  else delete document.documentElement.dataset.crash;
}

/** Called once the app has booted; forgets the auto-reload budget if all is well. */
export function markHealthyBoot(): void {
  if (typeof window === 'undefined') return;
  const clear = () => {
    if (document.documentElement.dataset.crash !== '1') safeRemove(RELOAD_KEY);
  };
  if (document.readyState === 'complete') setTimeout(clear, 4000);
  else window.addEventListener('load', () => setTimeout(clear, 4000), { once: true });
}
