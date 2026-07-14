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
import { redactAuthUserId } from './auth/authLogRedaction';

const cache = createPersistedKeyValueCache('ecs_session_state');

export const ECS_SESSION_STORE_SCHEMA_VERSION = 2;

const KEYS = {
  schemaVersion: 'ecs_session_store_schema_version',
  keepSignedIn: 'ecs_keep_signed_in',
  authExpiry: 'ecs_auth_expiry',
  lastUserFingerprint: 'ecs_last_user_fingerprint',
  legacyLastUserId: 'ecs_last_user_id',
  legacyLastUserEmail: 'ecs_last_user_email',
  sessionCreatedAt: 'ecs_session_created_at',
} as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TRANSIENT_RUNTIME_SESSION_GRACE_MS = 10 * 60 * 1000;

let transientRuntimeSessionUntil = 0;
let migrationPromise: Promise<void> | null = null;

function getItem(key: string): string | null {
  return cache.get(key);
}

function setItem(key: string, value: string): void {
  cache.set(key, value);
}

function removeItem(key: string): void {
  cache.delete(key);
}

function migratePersistedSessionState(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = cache.waitForHydration().then(() => {
    const persistedVersion = Number(getItem(KEYS.schemaVersion)) || 1;
    const legacyUserId = getItem(KEYS.legacyLastUserId);
    const fingerprint = getItem(KEYS.lastUserFingerprint) ?? redactAuthUserId(legacyUserId);
    if (fingerprint) setItem(KEYS.lastUserFingerprint, fingerprint);
    removeItem(KEYS.legacyLastUserId);
    removeItem(KEYS.legacyLastUserEmail);
    if (persistedVersion < ECS_SESSION_STORE_SCHEMA_VERSION) {
      setItem(KEYS.schemaVersion, String(ECS_SESSION_STORE_SCHEMA_VERSION));
    }
  });
  return migrationPromise;
}

export interface SessionPreferences {
  keepSignedIn: boolean;
  authExpiry: number | null;
  lastUserId: string | null;
  lastUserEmail: string | null;
  sessionCreatedAt: string | null;
}

export const sessionStore = {
  waitForHydration: (): Promise<void> => migratePersistedSessionState(),
  isHydrated: (): boolean => cache.isHydrated(),
  getSchemaVersion: (): number => Number(getItem(KEYS.schemaVersion)) || 1,
  flush: (): Promise<void> => cache.flush(),

  getPreferences(): SessionPreferences {
    const keepSignedIn = getItem(KEYS.keepSignedIn) === 'true';
    const expiryRaw = getItem(KEYS.authExpiry);
    const authExpiry = expiryRaw ? parseInt(expiryRaw, 10) : null;
    const lastUserId = getItem(KEYS.lastUserFingerprint) ?? redactAuthUserId(getItem(KEYS.legacyLastUserId));
    const sessionCreatedAt = getItem(KEYS.sessionCreatedAt);

    return {
      keepSignedIn,
      authExpiry: authExpiry && !isNaN(authExpiry) ? authExpiry : null,
      lastUserId,
      lastUserEmail: null,
      sessionCreatedAt,
    };
  },

  saveLoginPreferences(keepSignedIn: boolean, userId: string, email: string): void {
    setItem(KEYS.keepSignedIn, keepSignedIn ? 'true' : 'false');
    const fingerprint = redactAuthUserId(userId);
    if (fingerprint) setItem(KEYS.lastUserFingerprint, fingerprint);
    removeItem(KEYS.legacyLastUserId);
    removeItem(KEYS.legacyLastUserEmail);
    setItem(KEYS.schemaVersion, String(ECS_SESSION_STORE_SCHEMA_VERSION));
    setItem(KEYS.sessionCreatedAt, new Date().toISOString());
    void email;

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
    removeItem(KEYS.lastUserFingerprint);
    removeItem(KEYS.legacyLastUserId);
    removeItem(KEYS.legacyLastUserEmail);
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
