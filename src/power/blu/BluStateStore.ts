/**
 * BluStateStore — observable BLU state for dashboard widgets and ECS panels.
 *
 * Maintains the current BLU summary, per-device telemetry cache, and
 * notifies subscribers when the state changes.
 *
 * Dashboard widgets read from `getSummary()` for a stable, provider-agnostic
 * snapshot. The Sustainability widget and other power-aware components
 * subscribe to this store instead of directly querying provider APIs.
 *
 * Phase 1A — foundation with EcoFlow bridge.
 * Phase 1C — grace window, freshness tracking, stale detection.
 * Phase 1D — system status (live/reconnecting/stale/disconnected),
 *            offline safety, reconnect state tracking.
 * Phase 1E — production hardening: "updating" transitional state,
 *            connection success tracking, enhanced freshness labels.
 *
 * Grace Window:
 *   If the provider stops returning data temporarily, the last known
 *   telemetry remains visible for GRACE_WINDOW_MS (90 seconds).
 *   After the grace window expires, the summary reverts to placeholder.
 *
 * Updating State (Phase 1E):
 *   Between FRESHNESS_THRESHOLD_MS (20s) and GRACE_WINDOW_MS (90s),
 *   telemetry is in an "updating" transitional state — data is shown
 *   but marked as potentially stale. This prevents abrupt UI changes.
 *
 * Freshness:
 *   `last_updated` tracks when the most recent telemetry arrived.
 *   `telemetry_age_ms` is computed on each access for UI freshness display.
 *   `is_stale` is true when telemetry is older than the grace window.
 *
 * System Status (Phase 1D/1E):
 *   `getSystemStatus()` returns a high-level label: live | reconnecting | updating | stale | disconnected.
 *   This drives the BLU status badge in the UI.
 */

import type {
  BluSummary,
  BluTelemetry,
  BluProviderId,
  BluConnectionState,
  BluSystemStatus,
} from './BluTypes';
import { EMPTY_BLU_SUMMARY } from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';

// ── Configuration ───────────────────────────────────────────────────────

/** Grace window: keep last known telemetry visible for 90 seconds. */
const GRACE_WINDOW_MS = 90_000;

/** Freshness threshold: data older than 20s is "updating" (Phase 1E). */
const FRESHNESS_THRESHOLD_MS = 20_000;

/** Freshness check interval: re-evaluate staleness every 10 seconds. */
const FRESHNESS_CHECK_INTERVAL_MS = 10_000;

// ── Subscriber type ─────────────────────────────────────────────────────

type BluStateSubscriber = (summary: BluSummary) => void;

// ── Per-device telemetry cache ──────────────────────────────────────────

type DeviceKey = string; // `${provider}:${device_id}`

function makeKey(provider: BluProviderId, deviceId: string): DeviceKey {
  return `${provider}:${deviceId}`;
}

// ── Store Class ─────────────────────────────────────────────────────────

class BluStateStore {
  private summary: BluSummary = { ...EMPTY_BLU_SUMMARY };
  private telemetryCache = new Map<DeviceKey, BluTelemetry>();
  private subscribers = new Set<BluStateSubscriber>();
  private freshnessTimer: ReturnType<typeof setInterval> | null = null;
  private lastIngestAt: number | null = null;
  private pollSuccessCount = 0;
  private pollFailureCount = 0;
  private consecutiveFailures = 0;

  /** Phase 1D: Whether a reconnect attempt is in progress. */
  private isReconnecting = false;

  /** Phase 1E: Whether the last connection was successful (for success confirmation). */
  private connectionSuccessAt: number | null = null;

  // ── Subscriptions ──────────────────────────────────────────────────

  /**
   * Subscribe to BLU summary changes.
   * Callback is invoked immediately with the current summary.
   * Returns an unsubscribe function.
   */
  subscribe(cb: BluStateSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.summary);

    // Start freshness timer when first subscriber appears
    if (this.subscribers.size === 1 && !this.freshnessTimer) {
      this.startFreshnessTimer();
    }

    return () => {
      this.subscribers.delete(cb);

      // Stop freshness timer when last subscriber leaves
      if (this.subscribers.size === 0) {
        this.stopFreshnessTimer();
      }
    };
  }

  private notify(): void {
    const snap = this.summary;
    for (const cb of this.subscribers) {
      try {
        cb(snap);
      } catch {
        /* subscriber errors must never crash the store */
      }
    }
  }

  // ── Read API ───────────────────────────────────────────────────────

  /**
   * Get the current BLU summary.
   * Returns a stable object reference — only changes when new telemetry arrives.
   */
  getSummary(): BluSummary {
    return this.summary;
  }

  /**
   * Get cached telemetry for a specific device.
   */
  getDeviceTelemetry(
    provider: BluProviderId,
    deviceId: string,
  ): BluTelemetry | undefined {
    return this.telemetryCache.get(makeKey(provider, deviceId));
  }

  /**
   * Get all cached telemetry entries.
   */
  getAllTelemetry(): BluTelemetry[] {
    return Array.from(this.telemetryCache.values());
  }

  /**
   * Get the age of the most recent telemetry in milliseconds.
   * Returns null if no telemetry has been received.
   */
  getTelemetryAgeMs(): number | null {
    if (this.lastIngestAt === null) return null;
    return Date.now() - this.lastIngestAt;
  }

  /**
   * Check if the current telemetry is stale (older than grace window).
   */
  isStale(): boolean {
    if (this.lastIngestAt === null) return true;
    return (Date.now() - this.lastIngestAt) > GRACE_WINDOW_MS;
  }

  /**
   * Phase 1E: Check if telemetry is in the "updating" transitional state.
   * Data is older than FRESHNESS_THRESHOLD_MS but within GRACE_WINDOW_MS.
   */
  isUpdating(): boolean {
    if (this.lastIngestAt === null) return false;
    const age = Date.now() - this.lastIngestAt;
    return age > FRESHNESS_THRESHOLD_MS && age <= GRACE_WINDOW_MS;
  }

  /**
   * Phase 1E: Check if telemetry is fresh (within freshness threshold).
   */
  isFresh(): boolean {
    if (this.lastIngestAt === null) return false;
    return (Date.now() - this.lastIngestAt) <= FRESHNESS_THRESHOLD_MS;
  }

  /**
   * Get a human-readable freshness string.
   * Phase 1E: Enhanced with "Updating..." state.
   */
  getFreshnessText(): string {
    const ageMs = this.getTelemetryAgeMs();
    if (ageMs === null) return 'No data';
    const ageSec = Math.floor(ageMs / 1000);
    if (ageSec < 5) return 'Just now';
    if (ageSec < 60) return `${ageSec}s ago`;
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `${ageMin}m ago`;
    const ageHr = Math.floor(ageMin / 60);
    return `${ageHr}h ago`;
  }

  /**
   * Get polling statistics.
   */
  getPollingStats(): {
    successCount: number;
    failureCount: number;
    consecutiveFailures: number;
    lastIngestAt: number | null;
  } {
    return {
      successCount: this.pollSuccessCount,
      failureCount: this.pollFailureCount,
      consecutiveFailures: this.consecutiveFailures,
      lastIngestAt: this.lastIngestAt,
    };
  }

  /**
   * Phase 1D/1E: Get the high-level BLU system status.
   *
   * - `live` — connected, fresh telemetry
   * - `reconnecting` — session dropped, attempting reconnect
   * - `updating` — connected but telemetry is aging (Phase 1E)
   * - `stale` — connected but telemetry is older than grace window
   * - `disconnected` — no active provider connection
   */
  getSystemStatus(): BluSystemStatus {
    if (this.isReconnecting) return 'reconnecting';
    if (!this.summary.available) return 'disconnected';
    if (this.isStale()) return 'stale';
    if (this.isUpdating()) return 'updating';
    if (this.summary.connection_state === 'connected') return 'live';
    if (this.summary.connection_state === 'error') return 'stale';
    return 'disconnected';
  }

  /**
   * Phase 1E: Get the timestamp of the last successful connection.
   */
  getConnectionSuccessAt(): number | null {
    return this.connectionSuccessAt;
  }

  /**
   * Phase 1E: Record a successful connection for UI confirmation.
   */
  recordConnectionSuccess(): void {
    this.connectionSuccessAt = Date.now();
    console.log('[BluStateStore] Connection success recorded.');
  }

  /**
   * Phase 1E: Check if connection success was recent (within 5 seconds).
   */
  isRecentConnectionSuccess(): boolean {
    if (!this.connectionSuccessAt) return false;
    return (Date.now() - this.connectionSuccessAt) < 5000;
  }

  // ── Write API ──────────────────────────────────────────────────────

  /**
   * Ingest a telemetry reading from a provider.
   * Updates the per-device cache and recomputes the summary.
   */
  ingestTelemetry(telemetry: BluTelemetry): void {
    const key = makeKey(telemetry.provider, telemetry.device_id);
    this.telemetryCache.set(key, telemetry);
    this.lastIngestAt = Date.now();
    this.pollSuccessCount++;
    this.consecutiveFailures = 0;

    // Phase 1D: Clear reconnecting state on successful ingest
    if (this.isReconnecting) {
      this.isReconnecting = false;
      console.log('[BluStateStore] Reconnect successful — telemetry resumed.');
    }

    console.log(
      `[BluStateStore] Telemetry ingested: ${telemetry.provider}:${telemetry.device_id}` +
      ` | SOC=${telemetry.battery_percent ?? '?'}%` +
      ` | IN=${telemetry.input_watts ?? '?'}W` +
      ` | OUT=${telemetry.output_watts ?? '?'}W` +
      ` | SOLAR=${telemetry.solar_input_watts ?? '?'}W` +
      ` | RT=${telemetry.estimated_runtime_minutes ?? '?'}min`,
    );

    this.recomputeSummary();
  }

  /**
   * Record a poll failure. Increments failure counters.
   * Does NOT clear telemetry — grace window keeps last known data visible.
   */
  recordPollFailure(error?: string): void {
    this.pollFailureCount++;
    this.consecutiveFailures++;

    console.log(
      `[BluStateStore] Poll failure #${this.consecutiveFailures}` +
      (error ? `: ${error}` : ''),
    );

    // After grace window, the freshness timer will handle stale detection
  }

  /**
   * Update connection state for a device in the summary.
   */
  updateConnectionState(
    provider: BluProviderId,
    deviceId: string,
    state: BluConnectionState,
  ): void {
    // Update device registry
    bluDeviceRegistry.updateConnectionState(provider, deviceId, state);

    // Recompute summary (primary device may have changed state)
    this.recomputeSummary();
  }

  /**
   * Phase 1D: Set reconnecting state.
   * Called when the adapter detects a stale session and starts reconnecting.
   */
  setReconnecting(reconnecting: boolean): void {
    if (this.isReconnecting !== reconnecting) {
      this.isReconnecting = reconnecting;
      console.log(
        `[BluStateStore] System status: ${reconnecting ? 'reconnecting' : 'resumed'}`,
      );
      // Recompute to update system status
      this.recomputeSummary();
    }
  }

  /**
   * Phase 1D: Check if a reconnect is in progress.
   */
  getIsReconnecting(): boolean {
    return this.isReconnecting;
  }

  /**
   * Clear all telemetry and reset to empty state.
   */
  reset(): void {
    this.telemetryCache.clear();
    this.summary = { ...EMPTY_BLU_SUMMARY };
    this.lastIngestAt = null;
    this.pollSuccessCount = 0;
    this.pollFailureCount = 0;
    this.consecutiveFailures = 0;
    this.isReconnecting = false;
    this.connectionSuccessAt = null;
    this.notify();
  }

  // ── Bridge: Ingest from EcoFlow Live ───────────────────────────────

  /**
   * Bridge method for ingesting EcoFlow telemetry from the existing
   * useEcoFlowLive hook. Converts EcoFlow-specific fields into the
   * normalised BLU telemetry schema.
   *
   * Called by the BLU integration layer when EcoFlow data is available.
   */
  ingestEcoFlowData(data: {
    deviceId: string;
    deviceName?: string;
    batteryPct: number | null;
    solarWatts: number | null;
    inputWatts: number | null;
    outputWatts: number | null;
    status: string;
  }): void {
    if (!data.deviceId) return;

    const telemetry: BluTelemetry = {
      timestamp: Date.now(),
      provider: 'ecoflow',
      device_id: data.deviceId,
      battery_percent: data.batteryPct ?? undefined,
      solar_input_watts: data.solarWatts ?? undefined,
      input_watts: data.inputWatts ?? undefined,
      output_watts: data.outputWatts ?? undefined,
      battery_watts:
        data.inputWatts != null && data.outputWatts != null
          ? data.inputWatts - data.outputWatts
          : undefined,
    };

    this.ingestTelemetry(telemetry);
  }

  // ── Freshness Timer ────────────────────────────────────────────────

  /**
   * Start the freshness check timer.
   * Periodically checks if telemetry has gone stale and reverts
   * the summary to placeholder state if the grace window has expired.
   */
  private startFreshnessTimer(): void {
    if (this.freshnessTimer) return;

    this.freshnessTimer = setInterval(() => {
      this.checkFreshness();
    }, FRESHNESS_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the freshness check timer.
   */
  private stopFreshnessTimer(): void {
    if (this.freshnessTimer) {
      clearInterval(this.freshnessTimer);
      this.freshnessTimer = null;
    }
  }

  /**
   * Check if telemetry has gone stale.
   * Phase 1E: Also detects "updating" transitional state.
   * If the grace window has expired, revert the summary to placeholder.
   */
  private checkFreshness(): void {
    if (!this.summary.available) return;
    if (this.lastIngestAt === null) return;

    const ageMs = Date.now() - this.lastIngestAt;

    if (ageMs > GRACE_WINDOW_MS) {
      console.log(
        `[BluStateStore] Telemetry stale (${Math.round(ageMs / 1000)}s > ${GRACE_WINDOW_MS / 1000}s grace window). Reverting to placeholder.`,
      );

      // Mark summary as stale but keep the last known values
      // so the widget can show "last known" with a stale indicator
      const staleSummary: BluSummary = {
        ...this.summary,
        connection_state: 'error',
        is_stale: true,
      };

      if (!this.summaryEquals(this.summary, staleSummary)) {
        this.summary = staleSummary;
        this.notify();
      }
    } else if (ageMs > FRESHNESS_THRESHOLD_MS) {
      // Phase 1E: Transitional "updating" state — notify subscribers
      // so UI can show subtle "Updating..." indicator
      this.notify();
    }
  }

  // ── Summary Recomputation ──────────────────────────────────────────

  /**
   * Recompute the BLU summary from the primary device's cached telemetry.
   * If no primary device is set, falls back to the first device with data.
   */
  private recomputeSummary(): void {
    const primary = bluDeviceRegistry.getPrimary();
    let targetKey: DeviceKey | null = null;

    if (primary) {
      targetKey = makeKey(primary.provider, primary.device_id);
    }

    // If no primary or primary has no telemetry, find any device with data
    if (!targetKey || !this.telemetryCache.has(targetKey)) {
      const firstEntry = this.telemetryCache.entries().next();
      if (!firstEntry.done) {
        targetKey = firstEntry.value[0];
      }
    }

    if (!targetKey || !this.telemetryCache.has(targetKey)) {
      // No telemetry available
      if (this.summary.available) {
        this.summary = { ...EMPTY_BLU_SUMMARY };
        this.notify();
      }
      return;
    }

    const t = this.telemetryCache.get(targetKey)!;
    const device = primary || bluDeviceRegistry.getAll().find(
      (d) => makeKey(d.provider, d.device_id) === targetKey,
    );

    const newSummary: BluSummary = {
      available: true,
      active_provider: t.provider,
      active_device_name: device?.display_name ?? null,
      active_device_model: device?.model ?? null,
      battery_percent: t.battery_percent ?? null,
      live_input: t.input_watts ?? null,
      live_output: t.output_watts ?? null,
      solar_input: t.solar_input_watts ?? null,
      runtime_remaining: t.estimated_runtime_minutes ?? null,
      connection_state: device?.connection_state ?? 'connected',
      last_updated: t.timestamp,
      is_stale: false,
      temperature_celsius: t.temperature_celsius ?? null,
      battery_watts: t.battery_watts ?? null,
      ac_output_watts: t.ac_output_watts ?? null,
      dc_output_watts: t.dc_output_watts ?? null,
    };

    // Only notify if values actually changed
    if (!this.summaryEquals(this.summary, newSummary)) {
      this.summary = newSummary;
      this.notify();
    }
  }

  /**
   * Shallow equality check for BLU summary to prevent unnecessary re-renders.
   */
  private summaryEquals(a: BluSummary, b: BluSummary): boolean {
    return (
      a.available === b.available &&
      a.active_provider === b.active_provider &&
      a.active_device_name === b.active_device_name &&
      a.active_device_model === b.active_device_model &&
      a.battery_percent === b.battery_percent &&
      a.live_input === b.live_input &&
      a.live_output === b.live_output &&
      a.solar_input === b.solar_input &&
      a.runtime_remaining === b.runtime_remaining &&
      a.connection_state === b.connection_state &&
      a.last_updated === b.last_updated &&
      a.is_stale === b.is_stale &&
      a.temperature_celsius === b.temperature_celsius &&
      a.battery_watts === b.battery_watts &&
      a.ac_output_watts === b.ac_output_watts &&
      a.dc_output_watts === b.dc_output_watts
    );
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const bluStateStore = new BluStateStore();

