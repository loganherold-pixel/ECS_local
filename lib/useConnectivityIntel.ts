/**
 * ═══════════════════════════════════════════════════════════
 * ECS CONNECTIVITY INTELLIGENCE HOOK — Phase 3D
 * ═══════════════════════════════════════════════════════════
 *
 * React hook for consuming Connectivity Intelligence state
 * in dashboard widgets, settings screens, and expedition views.
 *
 * Subscribes to the connectivityIntelStore for reactive updates.
 * Returns the current summary, provider data, and helper values.
 *
 * Phase 3D additions:
 *   - freshness:        Current data freshness state (live/recovering/stale/offline)
 *   - freshnessDisplay: Display config for freshness (label, color, icon, etc.)
 *   - isRecovering:     Whether signal is in recovery window
 *   - isStaleData:      Whether data is stale (no recent updates)
 *   - isLiveData:       Whether data is confirmed live and fresh
 *   - persistedLastOnlineAt: Last online timestamp preserved across sessions
 *
 * Phase 3C additions:
 *   - operationalReadiness, operationalDisplay
 *   - isCacheReady, cachedRegionAvailable, cachedRouteAvailable
 *   - isOfflineReady, isUnprepared
 *
 * Phase 3B additions:
 *   - networkType, networkLabel, quality, qualityDisplay
 *   - latencyMs, latencyText, isDegraded, isOffline
 */

import { useState, useEffect, useMemo } from 'react';
import { connectivityIntelStore } from './connectivityIntelStore';
import type {
  ConnectivitySummary,
  ConnectivityIntelState,
  ConnectivityProviderData,
  ConnectivityProviderId,
  ConnectivityQuality,
  ConnectivityFreshness,
  OperationalReadinessState,
} from './connectivityIntelTypes';
import {
  CONNECTIVITY_STATE_DISPLAY,
  CONNECTIVITY_QUALITY_DISPLAY,
  CONNECTIVITY_FRESHNESS_DISPLAY,
  CONNECTIVITY_PROVIDERS,
  OPERATIONAL_READINESS_DISPLAY,
} from './connectivityIntelTypes';

// ── Network type labels ──────────────────────────────────

const NETWORK_TYPE_LABELS: Record<string, string> = {
  wifi: 'WiFi',
  cellular: 'Cellular',
  ethernet: 'Ethernet',
  none: 'No Network',
  unknown: 'Unknown',
};


export interface ConnectivityIntelHookResult {
  /** Current connectivity state */
  state: ConnectivityIntelState;

  /** Full connectivity summary object */
  summary: ConnectivitySummary;

  /** Whether internet is reachable */
  isOnline: boolean;

  /** Whether summary is based on live data */
  isLive: boolean;

  /** Whether the store has been initialized */
  isInitialized: boolean;

  /** Whether monitoring is active */
  isMonitoring: boolean;

  /** Whether current data is stale */
  isStale: boolean;

  /** Signal quality assessment */
  signalQuality: string;

  /** Whether offline cache is ready */
  offlineCacheReady: boolean;

  /** Last online timestamp (ISO) */
  lastOnlineAt: string | null;

  /** Active source provider ID */
  activeSource: ConnectivityProviderId | null;

  /** Number of active providers */
  activeProviderCount: number;

  /** Session recovery status */
  recoveryStatus: string;

  /** Human-readable freshness text */
  freshnessText: string;

  /** Display config for current state (label, color, icon) */
  stateDisplay: {
    label: string;
    color: string;
    icon: string;
    description: string;
  };

  /** All provider definitions (for settings UI) */
  providers: typeof CONNECTIVITY_PROVIDERS;

  /** Get data for a specific provider */
  getProviderData: (id: ConnectivityProviderId) => ConnectivityProviderData | null;

  // ── Phase 3B additions ──

  /** Current network type (wifi/cellular/ethernet/none/unknown) */
  networkType: ConnectivitySummary['network_type'];

  /** Human-readable network type label */
  networkLabel: string;

  /** Normalized connectivity quality */
  quality: ConnectivityQuality;

  /** Display config for quality (label, color, icon) */
  qualityDisplay: {
    label: string;
    color: string;
    icon: string;
  };

  /** Last measured latency in milliseconds */
  latencyMs: number | null;

  /** Human-readable latency text */
  latencyText: string;

  /** Whether connectivity is degraded (connected to network but no internet) */
  isDegraded: boolean;

  /** Whether the device is fully offline (no network at all) */
  isOffline: boolean;

  // ── Phase 3C additions ──

  /** Current operational readiness state */
  operationalReadiness: OperationalReadinessState;

  /** Display config for operational readiness */
  operationalDisplay: {
    label: string;
    shortLabel: string;
    color: string;
    icon: string;
    description: string;
    severity: 'info' | 'caution' | 'warning';
  };

  /** Whether offline cache is ready (alias for offlineCacheReady) */
  isCacheReady: boolean;

  /** Whether a cached region covers the current/active area */
  cachedRegionAvailable: boolean;

  /** Whether a cached route covers the active route */
  cachedRouteAvailable: boolean;

  /** Whether the user is offline but prepared (has useful cache) */
  isOfflineReady: boolean;

  /** Whether the user is offline/degraded without useful cache */
  isUnprepared: boolean;

  // ── Phase 3D additions ──

  /** Current data freshness state (live/recovering/stale/offline) */
  freshness: ConnectivityFreshness;

  /** Display config for freshness (label, color, icon, etc.) */
  freshnessDisplay: {
    label: string;
    shortLabel: string;
    color: string;
    icon: string;
    description: string;
  };

  /** Whether signal is in recovery window after reconnect */
  isRecovering: boolean;

  /** Whether data is stale (no recent updates beyond threshold) */
  isStaleData: boolean;

  /** Whether data is confirmed live and fresh */
  isLiveData: boolean;

  /** Last online timestamp preserved across sessions */
  persistedLastOnlineAt: string | null;
}

export function useConnectivityIntel(): ConnectivityIntelHookResult {
  const [, setRev] = useState(0);

  useEffect(() => {
    const unsub = connectivityIntelStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  const summary = connectivityIntelStore.getSummary();
  const state = summary.connectivity_state;

  return useMemo(() => {
    // Phase 3B: Compute latency text
    let latencyText = '';
    if (summary.latency_ms != null) {
      if (summary.latency_ms < 1000) {
        latencyText = `${Math.round(summary.latency_ms)}ms`;
      } else {
        latencyText = `${(summary.latency_ms / 1000).toFixed(1)}s`;
      }
    }

    // Phase 3C: Derive operational readiness helpers
    const operationalReadiness = summary.operational_readiness;
    const isOfflineReady = operationalReadiness === 'offline_ready';
    const isUnprepared =
      operationalReadiness === 'degraded_unprepared' ||
      operationalReadiness === 'offline_unprepared';

    // Phase 3D: Freshness helpers
    const freshness = summary.freshness;
    const isRecovering = freshness === 'recovering';
    const isStaleData = freshness === 'stale';
    const isLiveData = freshness === 'live';

    return {
      state,
      summary,
      isOnline: summary.internet_reachable,
      isLive: summary.is_live,
      isInitialized: connectivityIntelStore.isInitialized(),
      isMonitoring: connectivityIntelStore.isMonitoring(),
      isStale: connectivityIntelStore.isStale(),
      signalQuality: summary.signal_quality,
      offlineCacheReady: summary.offline_cache_ready,
      lastOnlineAt: summary.last_online_at,
      activeSource: summary.active_source,
      activeProviderCount: summary.active_provider_count,
      recoveryStatus: connectivityIntelStore.getRecoveryStatus(),
      freshnessText: connectivityIntelStore.getFreshnessText(),
      stateDisplay: CONNECTIVITY_STATE_DISPLAY[state] || CONNECTIVITY_STATE_DISPLAY.unknown,
      providers: CONNECTIVITY_PROVIDERS,
      getProviderData: (id: ConnectivityProviderId) => connectivityIntelStore.getProviderData(id),

      // Phase 3B additions
      networkType: summary.network_type,
      networkLabel: NETWORK_TYPE_LABELS[summary.network_type] || 'Unknown',
      quality: summary.quality,
      qualityDisplay: CONNECTIVITY_QUALITY_DISPLAY[summary.quality] || CONNECTIVITY_QUALITY_DISPLAY.unknown,
      latencyMs: summary.latency_ms,
      latencyText,
      isDegraded: state === 'degraded',
      isOffline: state === 'offline',

      // Phase 3C additions
      operationalReadiness,
      operationalDisplay:
        OPERATIONAL_READINESS_DISPLAY[operationalReadiness] ||
        OPERATIONAL_READINESS_DISPLAY.offline_unprepared,
      isCacheReady: summary.offline_cache_ready,
      cachedRegionAvailable: summary.cached_region_available,
      cachedRouteAvailable: summary.cached_route_available,
      isOfflineReady,
      isUnprepared,

      // Phase 3D additions
      freshness,
      freshnessDisplay:
        CONNECTIVITY_FRESHNESS_DISPLAY[freshness] ||
        CONNECTIVITY_FRESHNESS_DISPLAY.offline,
      isRecovering,
      isStaleData,
      isLiveData,
      persistedLastOnlineAt: connectivityIntelStore.getPersistedLastOnlineAt(),
    };
  }, [state, summary]);
}

