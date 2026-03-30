/**
 * Sync Skip Alert Store
 *
 * Tracks sync actions that were auto-skipped or purged because they contained
 * an invalid user ID (e.g., the 'local' sentinel). Provides state for the
 * SyncSkipAlertBanner component.
 *
 * Persistence:
 * - Skipped count persists to localStorage so the banner survives app restart
 * - Dismiss state is session-only (banner reappears on next app launch if
 *   new skips occurred)
 * - "Don't show again" permanently suppresses the banner
 *
 * Integration points:
 * - syncActionQueue.ts calls recordSkippedActions() when actions are purged
 *   or auto-skipped during processQueue()
 * - AppContext.tsx calls recordSkippedActions() after startup purge
 * - SyncSkipAlertBanner.tsx subscribes for reactive UI updates
 */
import { Platform } from 'react-native';

// ── Storage Keys ──────────────────────────────────────────────
const SKIPPED_COUNT_KEY = 'ecs_sync_skip_count';
const SKIPPED_TYPES_KEY = 'ecs_sync_skip_types';
const PERMANENTLY_DISMISSED_KEY = 'ecs_sync_skip_dismissed_forever';
const LAST_SKIP_TIME_KEY = 'ecs_sync_skip_last_time';

// ── Types ─────────────────────────────────────────────────────

export interface SyncSkipAlertState {
  /** Total number of actions skipped/purged in the current session + persisted */
  skippedCount: number;
  /** Action types that were skipped (for the "Learn More" detail) */
  skippedTypes: string[];
  /** Whether the banner is currently visible */
  isVisible: boolean;
  /** Whether the user has dismissed the banner this session */
  isDismissed: boolean;
  /** Whether the user has permanently suppressed the banner */
  isPermanentlyDismissed: boolean;
  /** ISO timestamp of the most recent skip event */
  lastSkipTime: string | null;
}

type Listener = (state: SyncSkipAlertState) => void;

// ── Helpers ───────────────────────────────────────────────────

function readString(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function writeString(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function removeKey(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
}

// ── Store Class ───────────────────────────────────────────────

class SyncSkipAlertStore {
  private _skippedCount: number = 0;
  private _skippedTypes: string[] = [];
  private _isDismissed: boolean = false;
  private _isPermanentlyDismissed: boolean = false;
  private _lastSkipTime: string | null = null;
  private _listeners = new Set<Listener>();

  constructor() {
    this._hydrate();
  }

  // ── Public Getters ──────────────────────────────────────────

  getState(): SyncSkipAlertState {
    return {
      skippedCount: this._skippedCount,
      skippedTypes: [...this._skippedTypes],
      isVisible: this._skippedCount > 0 && !this._isDismissed && !this._isPermanentlyDismissed,
      isDismissed: this._isDismissed,
      isPermanentlyDismissed: this._isPermanentlyDismissed,
      lastSkipTime: this._lastSkipTime,
    };
  }

  // ── Record Skipped Actions ──────────────────────────────────

  /**
   * Record that one or more sync actions were skipped/purged.
   * Called by syncActionQueue when actions are auto-skipped or purged.
   *
   * @param count - Number of actions skipped
   * @param types - Optional array of action type strings for detail display
   */
  recordSkippedActions(count: number, types?: string[]): void {
    if (count <= 0) return;

    this._skippedCount += count;
    this._lastSkipTime = new Date().toISOString();

    if (types && types.length > 0) {
      for (const t of types) {
        if (!this._skippedTypes.includes(t)) {
          this._skippedTypes.push(t);
        }
      }
    }

    // Un-dismiss if new skips arrive (user should see the updated count)
    // But respect permanent dismissal
    if (!this._isPermanentlyDismissed) {
      this._isDismissed = false;
    }

    this._persist();
    this._notify();
  }

  // ── Dismiss Actions ─────────────────────────────────────────

  /** Dismiss the banner for this session only */
  dismiss(): void {
    this._isDismissed = true;
    this._notify();
  }

  /** Permanently suppress the banner (user chose "Don't show again") */
  dismissPermanently(): void {
    this._isPermanentlyDismissed = true;
    this._isDismissed = true;
    writeString(PERMANENTLY_DISMISSED_KEY, 'true');
    this._notify();
  }

  /** Reset all state (e.g., after user signs in and syncs successfully) */
  reset(): void {
    this._skippedCount = 0;
    this._skippedTypes = [];
    this._isDismissed = false;
    this._lastSkipTime = null;
    // Note: permanent dismissal is NOT reset — user explicitly chose it
    removeKey(SKIPPED_COUNT_KEY);
    removeKey(SKIPPED_TYPES_KEY);
    removeKey(LAST_SKIP_TIME_KEY);
    this._notify();
  }

  /** Full reset including permanent dismissal (for testing/debug) */
  hardReset(): void {
    this._skippedCount = 0;
    this._skippedTypes = [];
    this._isDismissed = false;
    this._isPermanentlyDismissed = false;
    this._lastSkipTime = null;
    removeKey(SKIPPED_COUNT_KEY);
    removeKey(SKIPPED_TYPES_KEY);
    removeKey(LAST_SKIP_TIME_KEY);
    removeKey(PERMANENTLY_DISMISSED_KEY);
    this._notify();
  }

  // ── Subscriptions ───────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Private ─────────────────────────────────────────────────

  private _hydrate(): void {
    const countStr = readString(SKIPPED_COUNT_KEY);
    if (countStr) {
      const parsed = parseInt(countStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this._skippedCount = parsed;
      }
    }

    const typesStr = readString(SKIPPED_TYPES_KEY);
    if (typesStr) {
      try {
        const parsed = JSON.parse(typesStr);
        if (Array.isArray(parsed)) {
          this._skippedTypes = parsed;
        }
      } catch {}
    }

    const lastTime = readString(LAST_SKIP_TIME_KEY);
    if (lastTime) {
      this._lastSkipTime = lastTime;
    }

    const permDismissed = readString(PERMANENTLY_DISMISSED_KEY);
    if (permDismissed === 'true') {
      this._isPermanentlyDismissed = true;
    }
  }

  private _persist(): void {
    writeString(SKIPPED_COUNT_KEY, String(this._skippedCount));
    writeString(SKIPPED_TYPES_KEY, JSON.stringify(this._skippedTypes));
    if (this._lastSkipTime) {
      writeString(LAST_SKIP_TIME_KEY, this._lastSkipTime);
    }
  }

  private _notify(): void {
    const state = this.getState();
    this._listeners.forEach(listener => {
      try {
        listener(state);
      } catch (e) {
        console.warn('[SyncSkipAlertStore] Listener error:', e);
      }
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────
export const syncSkipAlertStore = new SyncSkipAlertStore();

