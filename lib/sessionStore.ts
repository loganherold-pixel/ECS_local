/**
 * Session Persistence Store
 *
 * Manages persistent login preferences:
 * - "Keep me signed in for 30 days" checkbox state
 * - Auth expiry timestamp enforcement
 * - Session validity checks for offline access
 * - Secure cleanup on logout
 *
 * Web uses localStorage. Native uses file-backed non-secure persistence.
 */
import { createPersistedKeyValueCache } from './keyValuePersistence';

const cache = createPersistedKeyValueCache('ecs_session_state');

const KEYS = {
  keepSignedIn: 'ecs_keep_signed_in',
  authExpiry: 'ecs_auth_expiry',
  lastUserId: 'ecs_last_user_id',
  lastUserEmail: 'ecs_last_user_email',
  sessionCreatedAt: 'ecs_session_created_at',
} as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TRANSIENT_RUNTIME_SESSION_GRACE_MS = 10 * 60 * 1000;

let transientRuntimeSessionUntil = 0;

function getItem(key: string): string | null {
  return cache.get(key);
}

function setItem(key: string, value: string): void {
  cache.set(key, value);
}

function removeItem(key: string): void {
  cache.delete(key);
}

export interface SessionPreferences {
  keepSignedIn: boolean;
  authExpiry: number | null;
  lastUserId: string | null;
  lastUserEmail: string | null;
  sessionCreatedAt: string | null;
}

export const sessionStore = {
  waitForHydration: (): Promise<void> => cache.waitForHydration(),
  isHydrated: (): boolean => cache.isHydrated(),

  getPreferences(): SessionPreferences {
    const keepSignedIn = getItem(KEYS.keepSignedIn) === 'true';
    const expiryRaw = getItem(KEYS.authExpiry);
    const authExpiry = expiryRaw ? parseInt(expiryRaw, 10) : null;
    const lastUserId = getItem(KEYS.lastUserId);
    const lastUserEmail = getItem(KEYS.lastUserEmail);
    const sessionCreatedAt = getItem(KEYS.sessionCreatedAt);

    return {
      keepSignedIn,
      authExpiry: authExpiry && !isNaN(authExpiry) ? authExpiry : null,
      lastUserId,
      lastUserEmail,
      sessionCreatedAt,
    };
  },

  saveLoginPreferences(keepSignedIn: boolean, userId: string, email: string): void {
    setItem(KEYS.keepSignedIn, keepSignedIn ? 'true' : 'false');
    setItem(KEYS.lastUserId, userId);
    setItem(KEYS.lastUserEmail, email);
    setItem(KEYS.sessionCreatedAt, new Date().toISOString());

    if (keepSignedIn) {
      transientRuntimeSessionUntil = 0;
      setItem(KEYS.authExpiry, String(Date.now() + THIRTY_DAYS_MS));
    } else {
      removeItem(KEYS.authExpiry);
      transientRuntimeSessionUntil = Date.now() + TRANSIENT_RUNTIME_SESSION_GRACE_MS;
    }
  },

  checkSessionValidity(): 'valid' | 'expired' | 'no_preference' | 'no_session' {
    const prefs = this.getPreferences();

    if (!prefs.lastUserId) {
      return 'no_session';
    }

    if (prefs.keepSignedIn) {
      if (prefs.authExpiry) {
        if (Date.now() > prefs.authExpiry) {
          return 'expired';
        }
        return 'valid';
      }
      return 'valid';
    }

    return 'no_preference';
  },

  hasOfflineSession(): boolean {
    const validity = this.checkSessionValidity();
    return validity === 'valid' || validity === 'no_preference';
  },

  getRemainingTime(): number | null {
    const prefs = this.getPreferences();
    if (!prefs.authExpiry) return null;
    const remaining = prefs.authExpiry - Date.now();
    return remaining > 0 ? remaining : 0;
  },

  getRemainingTimeLabel(): string | null {
    const remaining = this.getRemainingTime();
    if (remaining === null) return null;
    if (remaining <= 0) return 'Expired';

    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Less than 1h remaining';
  },

  clearSession(): void {
    transientRuntimeSessionUntil = 0;
    removeItem(KEYS.keepSignedIn);
    removeItem(KEYS.authExpiry);
    removeItem(KEYS.lastUserId);
    removeItem(KEYS.lastUserEmail);
    removeItem(KEYS.sessionCreatedAt);

    try {
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.includes('-auth-token')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }
    } catch {}
  },

  clearIfNotPersistent(): boolean {
    const prefs = this.getPreferences();

    if (prefs.lastUserId && !prefs.keepSignedIn) {
      const raw = getItem(KEYS.keepSignedIn);
      if (raw === 'false') {
        this.clearSession();
        return true;
      }
    }

    return false;
  },

  extendExpiry(): void {
    const prefs = this.getPreferences();
    if (prefs.keepSignedIn && prefs.authExpiry) {
      setItem(KEYS.authExpiry, String(Date.now() + THIRTY_DAYS_MS));
    }
  },

  hasTransientRuntimeSession(): boolean {
    return transientRuntimeSessionUntil > Date.now();
  },
};
