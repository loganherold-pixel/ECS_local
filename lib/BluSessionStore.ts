/**
 * BluSessionStore — BLU session persistence layer.
 *
 * Persists BLU provider connection metadata, primary device selection,
 * and device registry snapshots so BLU survives app restarts.
 *
 * On app launch, the connection hook reads the stored session and
 * attempts to restore the previous provider connection automatically.
 *
 * Storage keys:
 *   ecs.blu.session.v1  — session snapshot (provider, primary, polling state)
 *   ecs.blu.devices.v1  — device registry (already managed by BluDeviceRegistry)
 *
 * Phase 1D — persistence, multi-device handling, error recovery.
 * Production pass — stale session validation + safer restore behavior.
 */

import { Platform } from 'react-native';
import type { BluSessionSnapshot, BluProviderId, BluConnectionState } from './BluTypes';
import { EMPTY_BLU_SESSION } from './BluTypes';

// ── Storage Keys ────────────────────────────────────────────────────────

const SESSION_KEY = 'ecs.blu.session.v1';

/**
 * Maximum age for a restorable "connected" session.
 * Older sessions are treated as stale and will not auto-restore.
 */
const MAX_RESTORABLE_SESSION_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

// ── Storage Helpers ─────────────────────────────────────────────────────

const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      /* quota / private browsing */
    }
  }
  return memoryStore[key] ?? null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* swallow */
    }
  }
  memoryStore[key] = value;
}

function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      /* swallow */
    }
  }
  delete memoryStore[key];
}

function isValidProvider(value: unknown): value is BluProviderId {
  return (
    value === 'ecoflow' ||
    value === 'anker_solix' ||
    value === 'jackery' ||
    value === 'bluetti' ||
    value === 'goal_zero' ||
    value === 'renogy' ||
    value === 'redarc' ||
    value === 'dakota_lithium' ||
    value === 'victron'
  );
}

function isValidConnectionState(value: unknown): value is BluConnectionState {
  return (
    value === 'disconnected' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'error' ||
    value === 'unsupported'
  );
}

// ── Session Store Class ─────────────────────────────────────────────────

class BluSessionStore {
  private cachedSession: BluSessionSnapshot | null = null;

  // ── Internal helpers ───────────────────────────────────────────────

  private sanitizeSession(input: unknown): BluSessionSnapshot {
    if (!input || typeof input !== 'object') {
      return { ...EMPTY_BLU_SESSION };
    }

    const candidate = input as Partial<BluSessionSnapshot> & { version?: unknown };

    if (candidate.version !== 1) {
      return { ...EMPTY_BLU_SESSION };
    }

    const provider = isValidProvider(candidate.provider) ? candidate.provider : null;
    const connectionState = isValidConnectionState(candidate.connectionState)
      ? candidate.connectionState
      : EMPTY_BLU_SESSION.connectionState;

    const primaryDeviceId =
      typeof candidate.primaryDeviceId === 'string' && candidate.primaryDeviceId.trim() !== ''
        ? candidate.primaryDeviceId
        : null;

    const timestamp =
      typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp) && candidate.timestamp > 0
        ? candidate.timestamp
        : 0;

    const wasPolling = candidate.wasPolling === true;
    const disconnectReason =
      typeof candidate.disconnectReason === 'string' && candidate.disconnectReason.trim() !== ''
        ? candidate.disconnectReason
        : undefined;

    return {
      ...EMPTY_BLU_SESSION,
      version: 1,
      provider,
      connectionState,
      primaryDeviceId,
      wasPolling,
      disconnectReason,
      timestamp,
    };
  }

  private isSessionFreshEnough(session: BluSessionSnapshot): boolean {
    if (session.timestamp <= 0) return false;
    const ageMs = Date.now() - session.timestamp;
    return ageMs >= 0 && ageMs <= MAX_RESTORABLE_SESSION_AGE_MS;
  }

  private normalizeAndCache(session: unknown): BluSessionSnapshot {
    const normalized = this.sanitizeSession(session);
    this.cachedSession = normalized;
    return normalized;
  }

  // ── Read ─────────────────────────────────────────────────────────

  /**
   * Get the stored session snapshot.
   * Returns EMPTY_BLU_SESSION if no session is stored or data is corrupt.
   */
  getSession(): BluSessionSnapshot {
    if (this.cachedSession) return this.cachedSession;

    const raw = storageGet(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return this.normalizeAndCache(parsed);
      } catch {
        /* corrupted — return empty */
      }
    }

    return this.normalizeAndCache({ ...EMPTY_BLU_SESSION });
  }

  /**
   * Check if a previous session exists that can be restored.
   *
   * A restorable session must:
   *   - have a valid provider
   *   - have been in the connected state
   *   - have a recent timestamp
   */
  hasPreviousSession(): boolean {
    const session = this.getSession();
    return (
      session.provider !== null &&
      session.connectionState === 'connected' &&
      this.isSessionFreshEnough(session)
    );
  }

  /**
   * Get the previously selected primary device ID.
   */
  getPreviousPrimaryDeviceId(): string | null {
    return this.getSession().primaryDeviceId;
  }

  /**
   * Get the previously connected provider.
   */
  getPreviousProvider(): BluProviderId | null {
    return this.getSession().provider;
  }

  /**
   * Check if polling was active in the previous session.
   */
  wasPreviouslyPolling(): boolean {
    return this.getSession().wasPolling;
  }

  /**
   * Get the current session age in milliseconds.
   */
  getSessionAgeMs(): number | null {
    const session = this.getSession();
    if (session.timestamp <= 0) return null;
    return Math.max(0, Date.now() - session.timestamp);
  }

  /**
   * Whether the stored session is too old for trusted auto-restore.
   */
  isSessionStale(): boolean {
    const session = this.getSession();
    if (session.timestamp <= 0) return true;
    return !this.isSessionFreshEnough(session);
  }

  // ── Write ────────────────────────────────────────────────────────

  /**
   * Save a session snapshot.
   * Called whenever connection state, primary device, or polling state changes.
   */
  saveSession(snapshot: BluSessionSnapshot): void {
    const normalized = this.sanitizeSession({
      ...snapshot,
      version: 1,
    });

    this.cachedSession = { ...normalized };

    try {
      storageSet(SESSION_KEY, JSON.stringify(normalized));
      console.log(
        `[BluSessionStore] Session saved: provider=${normalized.provider}` +
        ` | state=${normalized.connectionState}` +
        ` | primary=${normalized.primaryDeviceId}` +
        ` | polling=${normalized.wasPolling}` +
        (normalized.disconnectReason ? ` | reason=${normalized.disconnectReason}` : ''),
      );
    } catch (err) {
      console.error('[BluSessionStore] Failed to save session:', err);
    }
  }

  /**
   * Update specific fields of the session without replacing the whole snapshot.
   */
  updateSession(partial: Partial<BluSessionSnapshot>): void {
    const current = this.getSession();
    const updated: BluSessionSnapshot = {
      ...current,
      ...partial,
      version: 1,
      timestamp: Date.now(),
    };
    this.saveSession(updated);
  }

  /**
   * Record a successful connection.
   */
  recordConnection(
    provider: BluProviderId,
    primaryDeviceId: string | null,
  ): void {
    this.updateSession({
      provider,
      connectionState: 'connected',
      primaryDeviceId,
      disconnectReason: undefined,
    });
  }

  /**
   * Record a provider-scoped degraded/disconnected state without losing provider identity.
   */
  recordProviderDegraded(
    provider: BluProviderId,
    reason: string,
  ): void {
    this.updateSession({
      provider,
      connectionState: 'disconnected',
      primaryDeviceId: null,
      wasPolling: false,
      disconnectReason: reason,
    });
  }

  /**
   * Record a disconnection.
   */
  recordDisconnection(): void {
    this.updateSession({
      connectionState: 'disconnected',
      wasPolling: false,
    });
  }

  /**
   * Record that polling has started.
   */
  recordPollingStarted(): void {
    this.updateSession({ wasPolling: true });
  }

  /**
   * Record that polling has stopped.
   */
  recordPollingStopped(): void {
    this.updateSession({ wasPolling: false });
  }

  /**
   * Record a primary device change.
   */
  recordPrimaryDeviceChange(deviceId: string): void {
    this.updateSession({ primaryDeviceId: deviceId });
    console.log(`[BluSessionStore] Primary device changed: ${deviceId}`);
  }

  /**
   * Mark the stored session as no longer trustworthy for auto-restore
   * without losing the historical provider/primary metadata.
   */
  invalidateRestoreEligibility(): void {
    const current = this.getSession();
    this.saveSession({
      ...current,
      connectionState: 'disconnected',
      wasPolling: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the stored session entirely.
   */
  clearSession(): void {
    this.cachedSession = null;
    storageRemove(SESSION_KEY);
    console.log('[BluSessionStore] Session cleared.');
  }

  /**
   * Invalidate the cached session (force re-read from storage).
   */
  invalidateCache(): void {
    this.cachedSession = null;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const bluSessionStore = new BluSessionStore();
