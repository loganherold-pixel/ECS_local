/**
 * ═══════════════════════════════════════════════════════════
 * ECS CONNECTIVITY INTELLIGENCE STORE — Phase 3D
 * ═══════════════════════════════════════════════════════════
 *
 * Centralized state store for Connectivity Intelligence.
 * Accessible across ECS for dashboard widgets, the Remoteness
 * system, and expedition decision layers.
 *
 * Phase 3D changes:
 *   - Freshness tracking (live/recovering/stale/offline)
 *   - Grace window support for brief signal interruptions
 *   - Enhanced persistence with last_online_at preservation
 *   - Session migration v3 → v4
 *   - getFreshness() accessor
 *   - isRecovering() accessor
 *   - getLastUpdateAge() accessor
 *   - Debounce-aware change detection
 *
 * Phase 3C changes:
 *   - Change detection includes cached_region_available,
 *     cached_route_available, operational_readiness
 *   - getCacheReadiness() accessor
 *   - getOperationalReadiness() accessor
 *
 * Phase 3B changes:
 *   - Change detection includes network_type, quality, latency_ms
 *   - getNetworkType(), getQuality(), getLatencyMs() accessors
 *
 * Responsibilities:
 *   - Hold the current ConnectivitySummary
 *   - Hold per-provider data entries
 *   - Persist session metadata to user storage
 *   - Restore session on app launch
 *   - Notify subscribers when state changes
 *   - Provide last-known snapshot behavior
 */

import { Platform } from 'react-native';
import type {
  ConnectivitySummary,
  ConnectivityIntelState,
  ConnectivityProviderData,
  ConnectivityProviderId,
  ConnectivityIntelSession,
  ConnectivityQuality,
  ConnectivityFreshness,
  OperationalReadinessState,
} from './connectivityIntelTypes';
import {
  DEFAULT_CONNECTIVITY_SUMMARY,
  CONNECTIVITY_INTEL_SESSION_VERSION,
} from './connectivityIntelTypes';
import { ecsLog } from './ecsLogger';

// ── Storage helpers (same pattern as VehicleTelemetryStore) ──
const STORAGE_KEY = 'ecs_connectivity_intel_session';

const _memStore: Record<string, string> = {};
const _ls = {
  get: (k: string): string | null => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(k);
    }
    return _memStore[k] || null;
  },
  set: (k: string, v: string) => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(k, v);
    }
    _memStore[k] = v;
  },
  del: (k: string) => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(k);
    }
    delete _memStore[k];
  },
};


// ── Constants ────────────────────────────────────────────

/** How long a last-known snapshot is considered valid (24 hours) */
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Phase 3D: How long before live data is considered stale (90 seconds) */
const STALE_THRESHOLD_MS = 90_000;

/** Phase 3D: Grace window before dropping to offline/unknown (20 seconds) */
const GRACE_WINDOW_MS = 20_000;

/** Phase 3D: Recovery window — how long after reconnect before marking as 'live' (10 seconds) */
const RECOVERY_WINDOW_MS = 10_000;


// ── Internal State ───────────────────────────────────────

let _summary: ConnectivitySummary = { ...DEFAULT_CONNECTIVITY_SUMMARY };
let _providers: Map<ConnectivityProviderId, ConnectivityProviderData> = new Map();
let _initialized = false;
let _monitoring = false;
let _recoveryStatus: 'idle' | 'restoring' | 'restored' | 'failed' | 'no_session' = 'idle';

/** Cached output for identity stability */
let _cachedSummary: ConnectivitySummary | null = null;

/** Phase 3D: Timestamp of last successful update */
let _lastUpdateTimestamp = 0;

/** Phase 3D: Previous connectivity state (for grace window logic) */
let _previousState: ConnectivityIntelState | null = null;

/** Phase 3D: Timestamp when the state first changed (for grace window) */
let _stateChangeTimestamp = 0;

/** Phase 3D: Whether we're in the recovery window after reconnect */
let _inRecoveryWindow = false;
let _recoveryStartTimestamp = 0;

/** Phase 3D: Last persisted last_online_at (preserved across offline periods) */
let _persistedLastOnlineAt: string | null = null;

/** Listeners */
type Listener = () => void;
const _listeners = new Set<Listener>();

function logConnectivityDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('SYSTEM', `[ConnectivityIntel] ${message}`, details);
}

function logConnectivityWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('SYSTEM', `[ConnectivityIntel] ${message}`, details);
}

function _notify() {
  _listeners.forEach(fn => { try { fn(); } catch {} });
}

/**
 * Check if two summaries are meaningfully different.
 * Phase 3D: Includes freshness in change detection.
 */
function _summaryChanged(a: ConnectivitySummary, b: ConnectivitySummary): boolean {
  return (
    a.connectivity_state !== b.connectivity_state ||
    a.signal_quality !== b.signal_quality ||
    a.internet_reachable !== b.internet_reachable ||
    a.offline_cache_ready !== b.offline_cache_ready ||
    a.active_source !== b.active_source ||
    a.active_provider_count !== b.active_provider_count ||
    a.is_live !== b.is_live ||
    // Phase 3B additions
    a.network_type !== b.network_type ||
    a.quality !== b.quality ||
    // Latency: only consider changed if difference > 50ms (avoid jitter)
    _latencyChanged(a.latency_ms, b.latency_ms) ||
    // Phase 3C additions
    a.cached_region_available !== b.cached_region_available ||
    a.cached_route_available !== b.cached_route_available ||
    a.operational_readiness !== b.operational_readiness ||
    // Phase 3D additions
    a.freshness !== b.freshness
  );
}

/**
 * Phase 3B: Latency change detection with jitter tolerance.
 * Only considers latency "changed" if the difference exceeds 50ms.
 */
function _latencyChanged(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) > 50;
}

/**
 * Phase 3B: Migrate a v1 summary to v2 format.
 */
function _migrateSummaryV1toV2(summary: any): any {
  return {
    ...summary,
    network_type: summary.network_type ?? 'unknown',
    quality: summary.quality ?? 'unknown',
    latency_ms: summary.latency_ms ?? null,
  };
}

/**
 * Phase 3C: Migrate a v2 summary to v3 format.
 */
function _migrateSummaryV2toV3(summary: any): any {
  return {
    ...summary,
    cached_region_available: summary.cached_region_available ?? false,
    cached_route_available: summary.cached_route_available ?? false,
    operational_readiness: summary.operational_readiness ?? 'offline_unprepared',
  };
}

/**
 * Phase 3D: Migrate a v3 summary to v4 format.
 * Adds default freshness value.
 */
function _migrateSummaryV3toV4(summary: any): ConnectivitySummary {
  return {
    ...summary,
    freshness: summary.freshness ?? 'offline',
  };
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const connectivityIntelStore = {

  // ── Read ──────────────────────────────────────────────

  /**
   * Get the current connectivity summary.
   * Returns a stable cached reference (only replaced on meaningful change).
   */
  getSummary(): ConnectivitySummary {
    if (_cachedSummary != null) return _cachedSummary;
    return { ...DEFAULT_CONNECTIVITY_SUMMARY };
  },

  /**
   * Get the current connectivity state shorthand.
   */
  getState(): ConnectivityIntelState {
    return _summary.connectivity_state;
  },

  /**
   * Whether internet is currently reachable.
   */
  isOnline(): boolean {
    return _summary.internet_reachable;
  },

  /**
   * Whether the summary is based on live data.
   */
  isLive(): boolean {
    return _summary.is_live;
  },

  /**
   * Whether the store has been initialized.
   */
  isInitialized(): boolean {
    return _initialized;
  },

  /**
   * Whether the service is actively monitoring.
   */
  isMonitoring(): boolean {
    return _monitoring;
  },

  /**
   * Get session recovery status.
   */
  getRecoveryStatus(): typeof _recoveryStatus {
    return _recoveryStatus;
  },

  /**
   * Get data for a specific provider.
   */
  getProviderData(providerId: ConnectivityProviderId): ConnectivityProviderData | null {
    return _providers.get(providerId) || null;
  },

  /**
   * Get all active provider data entries.
   */
  getActiveProviders(): ConnectivityProviderData[] {
    return Array.from(_providers.values()).filter(p => p.is_active);
  },

  /**
   * Get the number of active providers.
   */
  getActiveProviderCount(): number {
    return Array.from(_providers.values()).filter(p => p.is_active).length;
  },

  /**
   * Check if the current data is stale (beyond threshold).
   * Phase 3D: Uses the enhanced stale threshold.
   */
  isStale(): boolean {
    if (!_summary.updated_at) return true;
    if (_lastUpdateTimestamp === 0) return true;
    const age = Date.now() - _lastUpdateTimestamp;
    return age > STALE_THRESHOLD_MS;
  },

  /**
   * Get a human-readable freshness text.
   */
  getFreshnessText(): string {
    if (!_summary.updated_at) return '';
    const ageMs = Date.now() - new Date(_summary.updated_at).getTime();
    if (ageMs < 5000) return 'just now';
    if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
    if (ageMs < 3600_000) return `${Math.round(ageMs / 60_000)}m ago`;
    return new Date(_summary.updated_at).toLocaleTimeString();
  },

  // ── Phase 3B Accessors ────────────────────────────────

  getNetworkType(): ConnectivitySummary['network_type'] {
    return _summary.network_type;
  },

  getQuality(): ConnectivityQuality {
    return _summary.quality;
  },

  getLatencyMs(): number | null {
    return _summary.latency_ms;
  },

  // ── Phase 3C Accessors ────────────────────────────────

  isCacheReady(): boolean {
    return _summary.offline_cache_ready;
  },

  isCachedRegionAvailable(): boolean {
    return _summary.cached_region_available;
  },

  isCachedRouteAvailable(): boolean {
    return _summary.cached_route_available;
  },

  getOperationalReadiness(): OperationalReadinessState {
    return _summary.operational_readiness;
  },

  getCacheReadiness(): {
    offline_cache_ready: boolean;
    cached_region_available: boolean;
    cached_route_available: boolean;
  } {
    return {
      offline_cache_ready: _summary.offline_cache_ready,
      cached_region_available: _summary.cached_region_available,
      cached_route_available: _summary.cached_route_available,
    };
  },

  // ── Phase 3D Accessors ────────────────────────────────

  /**
   * Get the current data freshness state.
   * Phase 3D: Returns live, recovering, stale, or offline.
   */
  getFreshness(): ConnectivityFreshness {
    return _summary.freshness;
  },

  /**
   * Whether the system is in a recovery window after reconnect.
   * Phase 3D: True during the brief period after signal returns.
   */
  isRecovering(): boolean {
    return _inRecoveryWindow;
  },

  /**
   * Get the age of the last update in milliseconds.
   * Phase 3D: Used by the service for freshness computation.
   */
  getLastUpdateAge(): number {
    if (_lastUpdateTimestamp === 0) return Infinity;
    return Date.now() - _lastUpdateTimestamp;
  },

  /**
   * Get the persisted last_online_at timestamp.
   * Phase 3D: Preserved across offline periods and app restarts.
   */
  getPersistedLastOnlineAt(): string | null {
    return _persistedLastOnlineAt ?? _summary.last_online_at;
  },

  /**
   * Phase 3D: Get the previous connectivity state (before current).
   * Used by the service for grace window logic.
   */
  getPreviousState(): ConnectivityIntelState | null {
    return _previousState;
  },

  /**
   * Phase 3D: Get the timestamp when the state last changed.
   */
  getStateChangeTimestamp(): number {
    return _stateChangeTimestamp;
  },

  /**
   * Phase 3D: Check if we're within the grace window.
   * Returns true if a state change happened recently and we should
   * hold the previous state to prevent flicker.
   */
  isInGraceWindow(): boolean {
    if (_stateChangeTimestamp === 0) return false;
    return (Date.now() - _stateChangeTimestamp) < GRACE_WINDOW_MS;
  },

  /**
   * Phase 3D: Get grace window and recovery constants for service use.
   */
  getTimingConstants(): {
    graceWindowMs: number;
    recoveryWindowMs: number;
    staleThresholdMs: number;
  } {
    return {
      graceWindowMs: GRACE_WINDOW_MS,
      recoveryWindowMs: RECOVERY_WINDOW_MS,
      staleThresholdMs: STALE_THRESHOLD_MS,
    };
  },


  // ── Write ─────────────────────────────────────────────

  /**
   * Update the connectivity summary.
   * Only notifies subscribers if the summary meaningfully changed.
   * Phase 3D: Tracks state transitions and update timestamps.
   */
  updateSummary(summary: ConnectivitySummary): void {
    const prev = _summary;
    const now = Date.now();

    _summary = { ...summary, updated_at: new Date().toISOString() };
    _lastUpdateTimestamp = now;

    // Phase 3D: Track state transitions for grace window
    if (prev.connectivity_state !== _summary.connectivity_state) {
      _previousState = prev.connectivity_state;
      _stateChangeTimestamp = now;
    }

    // Phase 3D: Track recovery window
    if (prev.connectivity_state === 'offline' && _summary.connectivity_state === 'connected') {
      _inRecoveryWindow = true;
      _recoveryStartTimestamp = now;
      logConnectivityDebug('Recovery window started');
    }
    if (_inRecoveryWindow && (now - _recoveryStartTimestamp) > RECOVERY_WINDOW_MS) {
      _inRecoveryWindow = false;
      logConnectivityDebug('Recovery window ended — now live');
    }

    // Phase 3D: Preserve last_online_at across offline periods
    if (_summary.internet_reachable && _summary.last_online_at) {
      _persistedLastOnlineAt = _summary.last_online_at;
    }

    if (_cachedSummary == null || _summaryChanged(prev, _summary)) {
      _cachedSummary = { ..._summary };
      logConnectivityDebug('Summary updated', {
        state: _summary.connectivity_state,
        quality: _summary.quality,
        networkType: _summary.network_type,
        reachable: _summary.internet_reachable,
        cacheReady: _summary.offline_cache_ready,
        regionAvailable: _summary.cached_region_available,
        routeAvailable: _summary.cached_route_available,
        operationalReadiness: _summary.operational_readiness,
        freshness: _summary.freshness,
      });
      _notify();
    }
  },

  /**
   * Update data from a specific provider.
   */
  updateProviderData(data: ConnectivityProviderData): void {
    _providers.set(data.provider_id, data);
  },

  /**
   * Remove a provider's data.
   */
  removeProviderData(providerId: ConnectivityProviderId): void {
    _providers.delete(providerId);
  },

  /**
   * Mark the store as initialized.
   */
  setInitialized(value: boolean): void {
    _initialized = value;
  },

  /**
   * Set monitoring state.
   */
  setMonitoring(value: boolean): void {
    _monitoring = value;
    logConnectivityDebug('Monitoring changed', { value });
  },

  /**
   * Set recovery status.
   */
  setRecoveryStatus(status: typeof _recoveryStatus): void {
    _recoveryStatus = status;
    logConnectivityDebug('Recovery status changed', { status });
  },

  /**
   * Phase 3D: Mark the recovery window as ended.
   */
  endRecoveryWindow(): void {
    if (_inRecoveryWindow) {
      _inRecoveryWindow = false;
      logConnectivityDebug('Recovery window ended (forced)');
    }
  },


  // ── Persistence ───────────────────────────────────────

  /**
   * Persist current state to user storage.
   * Phase 3D: Ensures last_online_at is preserved.
   */
  persist(): void {
    try {
      const providerSnapshots: Record<string, ConnectivityProviderData> = {};
      _providers.forEach((data, id) => {
        providerSnapshots[id] = data;
      });

      // Phase 3D: Ensure last_online_at is preserved in the persisted summary
      const summaryToPersist = { ..._summary };
      if (!summaryToPersist.last_online_at && _persistedLastOnlineAt) {
        summaryToPersist.last_online_at = _persistedLastOnlineAt;
      }

      const session: ConnectivityIntelSession = {
        version: CONNECTIVITY_INTEL_SESSION_VERSION,
        last_summary: summaryToPersist,
        active_providers: Array.from(_providers.keys()).filter(
          id => _providers.get(id)?.is_active
        ),
        provider_snapshots: providerSnapshots,
        persisted_at: new Date().toISOString(),
      };

      _ls.set(STORAGE_KEY, JSON.stringify(session));
      logConnectivityDebug('Session persisted');
    } catch (e) {
      logConnectivityWarn('Failed to persist session', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  /**
   * Restore state from user storage.
   * Returns true if a valid session was restored.
   *
   * Phase 3D: Handles version migration from v1 → v2 → v3 → v4.
   * Preserves last_online_at across restarts.
   */
  restore(): boolean {
    try {
      _recoveryStatus = 'restoring';

      const raw = _ls.get(STORAGE_KEY);
      if (!raw) {
        _recoveryStatus = 'no_session';
        logConnectivityDebug('No persisted session found');
        return false;
      }

      const session: ConnectivityIntelSession = JSON.parse(raw);

      // Version check — reject sessions from future versions
      if (session.version > CONNECTIVITY_INTEL_SESSION_VERSION) {
        _recoveryStatus = 'failed';
        logConnectivityWarn('Session version too new, discarding', {
          sessionVersion: session.version,
          supportedVersion: CONNECTIVITY_INTEL_SESSION_VERSION,
        });
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Age check — don't restore sessions older than 24h
      const age = Date.now() - new Date(session.persisted_at).getTime();
      if (age > LAST_KNOWN_MAX_AGE_MS) {
        _recoveryStatus = 'failed';
        logConnectivityDebug('Session too old, discarding', {
          ageMs: age,
          maxAgeMs: LAST_KNOWN_MAX_AGE_MS,
        });
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Phase 3D: Progressive migration v1 → v2 → v3 → v4
      let restoredSummary = session.last_summary;
      if (session.version < 2) {
        logConnectivityDebug('Migrating v1 session to v2');
        restoredSummary = _migrateSummaryV1toV2(restoredSummary);
      }
      if (session.version < 3) {
        logConnectivityDebug('Migrating v2 session to v3');
        restoredSummary = _migrateSummaryV2toV3(restoredSummary);
      }
      if (session.version < 4) {
        logConnectivityDebug('Migrating v3 session to v4');
        restoredSummary = _migrateSummaryV3toV4(restoredSummary);
      }

      const restoredOfflineCacheReady = restoredSummary.offline_cache_ready ?? false;
      const restoredCachedRegionAvailable = restoredSummary.cached_region_available ?? false;
      const restoredCachedRouteAvailable = restoredSummary.cached_route_available ?? false;
      const restoredTransportNone = restoredSummary.network_type === 'none';
      const restoredCacheUseful =
        restoredOfflineCacheReady &&
        (restoredCachedRegionAvailable || restoredCachedRouteAvailable);

      // Phase 4: Restore persisted cache awareness and last-online context, but
      // never restore a prior session as the current authoritative connectivity
      // state. Launch must wait for fresh transport + reachability reconciliation.
      _summary = {
        ...restoredSummary,
        connectivity_state: restoredTransportNone ? 'offline' : 'unknown',
        internet_reachable: false,
        active_source: null,
        active_provider_count: 0,
        is_live: false,
        signal_quality: restoredTransportNone ? 'none' : 'unknown',
        network_type: restoredTransportNone ? 'none' : 'unknown',
        quality: restoredTransportNone ? 'unavailable' : 'unknown',
        latency_ms: null,
        operational_readiness: restoredTransportNone
          ? (restoredCacheUseful ? 'offline_ready' : 'offline_unprepared')
          : (restoredCacheUseful ? 'degraded_ready' : 'offline_unprepared'),
        freshness: restoredTransportNone ? 'offline' : 'stale',
        updated_at: session.persisted_at,
      };
      _cachedSummary = { ..._summary };

      // Phase 3D: Preserve last_online_at from the restored session
      if (restoredSummary.last_online_at) {
        _persistedLastOnlineAt = restoredSummary.last_online_at;
      }

      // Restore provider snapshots
      _providers.clear();
      if (session.provider_snapshots) {
        for (const [id, data] of Object.entries(session.provider_snapshots)) {
          // Mark all restored providers as inactive until they report fresh data
          _providers.set(id as ConnectivityProviderId, {
            ...data,
            is_active: false,
          });
        }
      }

      _recoveryStatus = 'restored';
      logConnectivityDebug('Session restored', {
        activeProviderCount: session.active_providers.length,
        state: _summary.connectivity_state,
        networkType: _summary.network_type,
        cacheReady: _summary.offline_cache_ready,
        operationalReadiness: _summary.operational_readiness,
        lastOnlineAt: _persistedLastOnlineAt,
      });
      _notify();
      return true;
    } catch (e) {
      _recoveryStatus = 'failed';
      logConnectivityWarn('Failed to restore session', {
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  },

  /**
   * Clear persisted session.
   */
  clearPersistedSession(): void {
    _ls.del(STORAGE_KEY);
    logConnectivityDebug('Persisted session cleared');
  },


  // ── Reset ─────────────────────────────────────────────

  /**
   * Reset all state to defaults.
   */
  reset(): void {
    _summary = { ...DEFAULT_CONNECTIVITY_SUMMARY };
    _cachedSummary = null;
    _providers.clear();
    _initialized = false;
    _monitoring = false;
    _recoveryStatus = 'idle';
    _lastUpdateTimestamp = 0;
    _previousState = null;
    _stateChangeTimestamp = 0;
    _inRecoveryWindow = false;
    _recoveryStartTimestamp = 0;
    _persistedLastOnlineAt = null;
    _notify();
    logConnectivityDebug('Store reset');
  },


  // ── Subscriptions ─────────────────────────────────────

  /**
   * Subscribe to connectivity intelligence changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

