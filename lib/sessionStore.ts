/**
 * Session Persistence Store
 *
 * Manages persistent login preferences:
 * - "Keep me signed in for 30 days" checkbox state
 * - Auth expiry timestamp enforcement
 * - Session validity checks for offline access
 * - Secure cleanup on logout
 *
 * Storage: localStorage (web) / in-memory fallback (native)
 * Supabase handles actual session tokens — this layer adds
 * the 30-day expiry policy and "keep signed in" behavior.
 */
import { Platform } from 'react-native';

// ── Storage keys ─────────────────────────────────────────────
const KEYS = {
  keepSignedIn: 'ecs_keep_signed_in',
  authExpiry: 'ecs_auth_expiry',
  lastUserId: 'ecs_last_user_id',
  lastUserEmail: 'ecs_last_user_email',
  sessionCreatedAt: 'ecs_session_created_at',
} as const;

// 30 days in milliseconds
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── Low-level storage helpers ────────────────────────────────
const memoryStore: Record<string, string> = {};

function getItem(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function setItem(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function removeItem(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
}

// ── Session Store API ────────────────────────────────────────

export interface SessionPreferences {
  keepSignedIn: boolean;
  authExpiry: number | null; // Unix timestamp (ms)
  lastUserId: string | null;
  lastUserEmail: string | null;
  sessionCreatedAt: string | null;
}

export const sessionStore = {
  /**
   * Get current session preferences
   */
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

  /**
   * Save session preferences after successful login
   * @param keepSignedIn Whether user checked "Keep me signed in"
   * @param userId The authenticated user's ID
   * @param email The authenticated user's email
   */
  saveLoginPreferences(keepSignedIn: boolean, userId: string, email: string): void {
    setItem(KEYS.keepSignedIn, keepSignedIn ? 'true' : 'false');
    setItem(KEYS.lastUserId, userId);
    setItem(KEYS.lastUserEmail, email);
    setItem(KEYS.sessionCreatedAt, new Date().toISOString());

    if (keepSignedIn) {
      // Set 30-day expiry
      const expiry = Date.now() + THIRTY_DAYS_MS;
      setItem(KEYS.authExpiry, String(expiry));
    } else {
      // No persistent expiry — session is for current run only
      // We still store a short-term marker so we know this was an intentional choice
      removeItem(KEYS.authExpiry);
    }
  },

  /**
   * Check if the stored session is still valid
   * Returns: 
   *   'valid' — session is within expiry, user can proceed
   *   'expired' — 30-day expiry has passed, force re-login
   *   'no_preference' — no "keep signed in" was set (session-only)
   *   'no_session' — no session data stored at all
   */
  checkSessionValidity(): 'valid' | 'expired' | 'no_preference' | 'no_session' {
    const prefs = this.getPreferences();

    // No user data stored at all
    if (!prefs.lastUserId) {
      return 'no_session';
    }

    // User chose "Keep me signed in"
    if (prefs.keepSignedIn) {
      if (prefs.authExpiry) {
        if (Date.now() > prefs.authExpiry) {
          return 'expired';
        }
        return 'valid';
      }
      // keepSignedIn but no expiry (shouldn't happen, but treat as valid)
      return 'valid';
    }

    // User did NOT check "Keep me signed in"
    // Supabase still has the session token — we allow it but don't enforce 30-day
    return 'no_preference';
  },

  /**
   * Check if we have a stored session that can be used offline
   * More permissive than checkSessionValidity — allows offline access
   * as long as the session hasn't explicitly expired
   */
  hasOfflineSession(): boolean {
    const validity = this.checkSessionValidity();
    // Allow offline access for valid sessions and no_preference (Supabase manages token)
    return validity === 'valid' || validity === 'no_preference';
  },

  /**
   * Get the remaining time on the 30-day session (in ms)
   * Returns null if no expiry is set
   */
  getRemainingTime(): number | null {
    const prefs = this.getPreferences();
    if (!prefs.authExpiry) return null;
    const remaining = prefs.authExpiry - Date.now();
    return remaining > 0 ? remaining : 0;
  },

  /**
   * Get human-readable remaining time
   */
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

  /**
   * Clear all session data (called on logout)
   */
  clearSession(): void {
    removeItem(KEYS.keepSignedIn);
    removeItem(KEYS.authExpiry);
    removeItem(KEYS.lastUserId);
    removeItem(KEYS.lastUserEmail);
    removeItem(KEYS.sessionCreatedAt);

    // Also clear Supabase's own session storage keys
    // Supabase stores tokens under keys like 'sb-<project>-auth-token'
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') && key.includes('-auth-token'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch {}
  },

  /**
   * Clear session if user didn't choose "Keep me signed in"
   * Called on app launch to enforce session-only behavior
   */
  clearIfNotPersistent(): boolean {
    const prefs = this.getPreferences();
    
    // If user explicitly chose NOT to keep signed in, clear everything
    if (prefs.lastUserId && !prefs.keepSignedIn) {
      // Check if keepSignedIn was explicitly set to false (vs never set)
      const raw = getItem(KEYS.keepSignedIn);
      if (raw === 'false') {
        this.clearSession();
        return true; // Session was cleared
      }
    }

    return false; // Session was not cleared
  },

  /**
   * Extend the session expiry by another 30 days
   * Called when user actively uses the app with a valid session
   */
  extendExpiry(): void {
    const prefs = this.getPreferences();
    if (prefs.keepSignedIn && prefs.authExpiry) {
      const newExpiry = Date.now() + THIRTY_DAYS_MS;
      setItem(KEYS.authExpiry, String(newExpiry));
    }
  },
};

