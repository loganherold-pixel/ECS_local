/**
 * useBlu — React hook for BLU power telemetry.
 *
 * Subscribes to the bluStateStore singleton and re-renders the
 * consuming component whenever the BLU summary changes.
 *
 * Returns a BluSummary object plus freshness data and system status:
 *   - `available: false` while no BLU device is connected.
 *   - Full summary once at least one device is providing data.
 *   - `isStale` — true when telemetry is older than the grace window.
 *   - `isUpdating` — true when telemetry is aging but within grace window (Phase 1E).
 *   - `freshnessText` — human-readable "Xs ago" / "Xm ago" string.
 *   - `telemetryAgeMs` — raw age in milliseconds.
 *   - `systemStatus` — high-level status label (Phase 1D/1E).
 *
 * Automatically unsubscribes on unmount.
 *
 * Phase 1A — foundation hook.
 * Phase 1C — freshness tracking + stale detection.
 * Phase 1D — system status (live/reconnecting/stale/disconnected).
 * Phase 1E — "updating" transitional state, production hardening.
 */

import { useState, useEffect, useRef } from 'react';
import type { BluSummary, BluSystemStatus } from './BluTypes';
import { bluStateStore } from './BluStateStore';

// ── Return type ─────────────────────────────────────────────────────────

export interface BluHookResult {
  /** The current BLU summary (provider-agnostic snapshot) */
  summary: BluSummary;

  // ── Phase 1C/1E: Freshness data ───────────────────────────────────

  /** Whether telemetry is stale (older than grace window) */
  isStale: boolean;
  /** Phase 1E: Whether telemetry is in "updating" transitional state */
  isUpdating: boolean;
  /** Human-readable freshness string: "Just now", "15s ago", "3m ago" */
  freshnessText: string;
  /** Raw telemetry age in milliseconds (null if no data) */
  telemetryAgeMs: number | null;
  /** Whether BLU has any data available (shortcut for summary.available) */
  isAvailable: boolean;
  /** Whether BLU is connected and data is fresh */
  isLive: boolean;

  // ── Phase 1D/1E: System status ────────────────────────────────────

  /** High-level BLU system status: live | reconnecting | updating | stale | disconnected */
  systemStatus: BluSystemStatus;
}

// ── Freshness update interval ───────────────────────────────────────────

const FRESHNESS_UPDATE_MS = 5_000; // Update freshness text every 5 seconds

// ── Hook Implementation ─────────────────────────────────────────────────

export function useBlu(): BluHookResult {
  const [summary, setSummary] = useState<BluSummary>(
    () => bluStateStore.getSummary(),
  );

  // Freshness state (updated on a timer for smooth "Xs ago" display)
  const [freshnessText, setFreshnessText] = useState<string>(
    () => bluStateStore.getFreshnessText(),
  );
  const [telemetryAgeMs, setTelemetryAgeMs] = useState<number | null>(
    () => bluStateStore.getTelemetryAgeMs(),
  );
  const [isStale, setIsStale] = useState<boolean>(
    () => bluStateStore.isStale(),
  );
  const [isUpdating, setIsUpdating] = useState<boolean>(
    () => bluStateStore.isUpdating(),
  );

  // Phase 1D/1E: System status
  const [systemStatus, setSystemStatus] = useState<BluSystemStatus>(
    () => bluStateStore.getSystemStatus(),
  );

  const mountedRef = useRef(true);

  // ── Subscribe to summary changes ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const unsub = bluStateStore.subscribe((newSummary) => {
      if (mountedRef.current) {
        setSummary(newSummary);
        // Update freshness immediately on new data
        setFreshnessText(bluStateStore.getFreshnessText());
        setTelemetryAgeMs(bluStateStore.getTelemetryAgeMs());
        setIsStale(bluStateStore.isStale());
        setIsUpdating(bluStateStore.isUpdating());
        setSystemStatus(bluStateStore.getSystemStatus());
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, []);

  // ── Freshness timer (for smooth "Xs ago" updates) ─────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (mountedRef.current) {
        setFreshnessText(bluStateStore.getFreshnessText());
        setTelemetryAgeMs(bluStateStore.getTelemetryAgeMs());
        setIsStale(bluStateStore.isStale());
        setIsUpdating(bluStateStore.isUpdating());
        setSystemStatus(bluStateStore.getSystemStatus());
      }
    }, FRESHNESS_UPDATE_MS);

    return () => clearInterval(timer);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────
  const isAvailable = summary.available;
  const isLive = isAvailable && !isStale && !isUpdating && summary.connection_state === 'connected';

  return {
    summary,
    isStale,
    isUpdating,
    freshnessText,
    telemetryAgeMs,
    isAvailable,
    isLive,
    systemStatus,
  };
}

