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
 */

import { Platform } from 'react-native';
import type { BluSessionSnapshot, BluProviderId, BluConnectionState } from './BluTypes';
import { EMPTY_BLU_SESSION } from './BluTypes';

// ── Storage Keys ────────────────────────────────────────────────────────

const SESSION_KEY = 'ecs.blu.session.v1';

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

// ── Session Store Class ─────────────────────────────────────────────────

class BluSessionStore {
  private cachedSession: BluSessionSnapshot | null = null;

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
        if (parsed && typeof parsed === 'object' && parsed.version === 1) {
          this.cachedSession = parsed as BluSessionSnapshot;
          return this.cachedSession;
        }
      } catch {
        /* corrupted — return empty */
      }
    }

    return { ...EMPTY_BLU_SESSION };
  }

  /**
   * Check if a previous session exists that can be restored.
   */
  hasPreviousSession(): boolean {
    const session = this.getSession();
    return (
      session.provider !== null &&
      session.connectionState === 'connected' &&
      session.timestamp > 0
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

  // ── Write ────────────────────────────────────────────────────────

  /**
   * Save a session snapshot.
   * Called whenever connection state, primary device, or polling state changes.
   */
  saveSession(snapshot: BluSessionSnapshot): void {
    this.cachedSession = { ...snapshot };
    try {
      storageSet(SESSION_KEY, JSON.stringify(snapshot));
      console.log(
        `[BluSessionStore] Session saved: provider=${snapshot.provider}` +
        ` | state=${snapshot.connectionState}` +
        ` | primary=${snapshot.primaryDeviceId}` +
        ` | polling=${snapshot.wasPolling}`,
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

