// ── localStorage that can never take the app down ────────────────────────
// Some browser profiles (block-all-cookies, hardened Incognito, kiosk or
// embedded webviews, storage-partitioned frames) throw a SecurityError on ANY
// `localStorage` access. AuthContext used to re-throw from inside its own catch
// block, so the app went blank *before* the login form could paint.
//
// Everything now goes through here. When the real store is unusable we fall
// back to an in-memory map: the session and UI preferences keep working for the
// lifetime of the tab instead of crashing the render tree.
const mem = new Map<string, string>();

let usable = true;
try {
  const probe = '__eg_storage_probe__';
  localStorage.setItem(probe, '1');
  localStorage.removeItem(probe);
} catch {
  usable = false;
}

/** `false` on browsers/profiles that block site storage (shown in Diagnostics). */
export const storageAvailable = (): boolean => usable;

export function safeGet(key: string): string | null {
  if (usable) {
    try {
      return localStorage.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return mem.has(key) ? (mem.get(key) as string) : null;
}

export function safeSet(key: string, value: string): void {
  mem.set(key, value);
  if (usable) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota / blocked — memory copy is enough */
    }
  }
}

export function safeRemove(key: string): void {
  mem.delete(key);
  if (usable) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }
}

export function safeGetJson<T>(key: string): T | null {
  const raw = safeGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    safeRemove(key); // corrupted value — drop it instead of throwing
    return null;
  }
}

export function safeSetJson(key: string, value: unknown): void {
  try {
    safeSet(key, JSON.stringify(value));
  } catch {
    /* unserialisable — skip */
  }
}
