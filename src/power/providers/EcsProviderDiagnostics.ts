/**
 * EcsProviderDiagnostics — health monitoring and telemetry quality tracking.
 *
 * Provides:
 *   - Per-provider health scoring
 *   - Telemetry freshness monitoring
 *   - Connection stability tracking
 *   - System-wide health dashboard data
 *   - Warning aggregation and deduplication
 *   - Offline tolerance and stale data management
 *
 * Phase 7A — Architecture Hardening: Diagnostics + Health Monitoring
 */

import type { BluProviderId } from '../blu/BluTypes';
import type {
  EcsProviderDiagnostics as DiagnosticsType,
  EcsProviderWarning,
  EcsNormalizedReading,
  EcsWarningState,
} from './IEcsPowerProvider';

// ── Freshness Thresholds ────────────────────────────────────────────────

/** Telemetry freshness thresholds in milliseconds */
export const TELEMETRY_FRESHNESS = {
  /** Reading is considered live */
  LIVE_THRESHOLD_MS: 30_000,
  /** Reading is aging but still usable */
  AGING_THRESHOLD_MS: 60_000,
  /** Reading is stale — show warning */
  STALE_THRESHOLD_MS: 120_000,
  /** Reading is expired — show disconnected */
  EXPIRED_THRESHOLD_MS: 300_000,
} as const;

/** Connection stability thresholds */
export const CONNECTION_STABILITY = {
  /** Max reconnect attempts before marking unstable */
  MAX_RECONNECT_ATTEMPTS: 5,
  /** Minimum uptime (ms) to consider connection stable */
  STABLE_UPTIME_MS: 60_000,
  /** Backoff ceiling in ms */
  MAX_BACKOFF_MS: 120_000,
  /** Initial backoff delay in ms */
  INITIAL_BACKOFF_MS: 2_000,
  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 1.5,
} as const;

/** Warning deduplication window in ms */
export const WARNING_DEDUP_WINDOW_MS = 60_000;

// ── Telemetry Freshness ─────────────────────────────────────────────────

export type TelemetryFreshness = 'live' | 'aging' | 'stale' | 'expired' | 'unknown';

/**
 * Determine the freshness of a telemetry reading.
 */
export function getTelemetryFreshness(lastUpdated: number | null): TelemetryFreshness {
  if (lastUpdated == null) return 'unknown';
  const age = Date.now() - lastUpdated;
  if (age <= TELEMETRY_FRESHNESS.LIVE_THRESHOLD_MS) return 'live';
  if (age <= TELEMETRY_FRESHNESS.AGING_THRESHOLD_MS) return 'aging';
  if (age <= TELEMETRY_FRESHNESS.STALE_THRESHOLD_MS) return 'stale';
  if (age <= TELEMETRY_FRESHNESS.EXPIRED_THRESHOLD_MS) return 'expired';
  return 'expired';
}

/**
 * Get a human-readable freshness label.
 */
export function getFreshnessLabel(freshness: TelemetryFreshness): string {
  switch (freshness) {
    case 'live': return 'Live';
    case 'aging': return 'Updating';
    case 'stale': return 'Stale';
    case 'expired': return 'Expired';
    case 'unknown': return 'No Data';
  }
}

/**
 * Get the color for a freshness state.
 */
export function getFreshnessColor(freshness: TelemetryFreshness): string {
  switch (freshness) {
    case 'live': return '#34C759';
    case 'aging': return '#5AC8FA';
    case 'stale': return '#FF9500';
    case 'expired': return '#FF3B30';
    case 'unknown': return '#8E8E93';
  }
}

// ── Provider Health Score ───────────────────────────────────────────────

export interface ProviderHealthScore {
  /** Provider identifier */
  providerId: BluProviderId;
  /** Overall health score (0–100) */
  score: number;
  /** Health grade */
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  /** Breakdown of score components */
  components: {
    /** Connection stability (0–100) */
    connectionStability: number;
    /** Telemetry freshness (0–100) */
    telemetryFreshness: number;
    /** Poll success rate (0–100) */
    pollSuccessRate: number;
    /** Warning severity penalty (0–100, 100 = no warnings) */
    warningPenalty: number;
  };
}

/**
 * Compute a health score for a provider based on its diagnostics.
 */
export function computeProviderHealthScore(
  diagnostics: DiagnosticsType,
  activeWarnings: EcsProviderWarning[],
): ProviderHealthScore {
  // Connection stability: penalize reconnect attempts and backoff
  let connectionStability = 100;
  if (diagnostics.reconnectAttemptsSinceStable > 0) {
    connectionStability -= Math.min(
      diagnostics.reconnectAttemptsSinceStable * 15,
      60,
    );
  }
  if (diagnostics.isInBackoff) {
    connectionStability -= 20;
  }
  if (diagnostics.lifecycleState === 'error') {
    connectionStability = 0;
  }
  connectionStability = Math.max(0, connectionStability);

  // Telemetry freshness
  let telemetryFreshness = 100;
  if (diagnostics.lastTelemetryAt) {
    const freshness = getTelemetryFreshness(diagnostics.lastTelemetryAt);
    switch (freshness) {
      case 'live': telemetryFreshness = 100; break;
      case 'aging': telemetryFreshness = 70; break;
      case 'stale': telemetryFreshness = 30; break;
      case 'expired': telemetryFreshness = 0; break;
      case 'unknown': telemetryFreshness = 0; break;
    }
  } else {
    telemetryFreshness = 0;
  }

  // Poll success rate
  let pollSuccessRate = 100;
  if (diagnostics.totalPollCount > 0) {
    pollSuccessRate = Math.round(
      (diagnostics.successfulPollCount / diagnostics.totalPollCount) * 100,
    );
  }

  // Warning penalty
  let warningPenalty = 100;
  for (const warning of activeWarnings) {
    switch (warning.severity) {
      case 'critical': warningPenalty -= 40; break;
      case 'caution': warningPenalty -= 15; break;
      case 'info': warningPenalty -= 5; break;
    }
  }
  warningPenalty = Math.max(0, warningPenalty);

  // Weighted average
  const score = Math.round(
    connectionStability * 0.3 +
    telemetryFreshness * 0.3 +
    pollSuccessRate * 0.25 +
    warningPenalty * 0.15,
  );

  const grade: ProviderHealthScore['grade'] =
    score >= 90 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'fair' :
    score >= 25 ? 'poor' :
    'critical';

  return {
    providerId: diagnostics.providerId,
    score,
    grade,
    components: {
      connectionStability,
      telemetryFreshness,
      pollSuccessRate,
      warningPenalty,
    },
  };
}

// ── Warning Deduplication ───────────────────────────────────────────────

/**
 * Deduplicate warnings within a time window.
 * Prevents alert spam when a condition flaps.
 */
export function deduplicateWarnings(
  warnings: EcsProviderWarning[],
  windowMs: number = WARNING_DEDUP_WINDOW_MS,
): EcsProviderWarning[] {
  const seen = new Map<string, EcsProviderWarning>();

  for (const warning of warnings) {
    const key = `${warning.code}:${warning.deviceId ?? 'provider'}`;
    const existing = seen.get(key);

    if (!existing || warning.timestamp - existing.timestamp > windowMs) {
      seen.set(key, warning);
    } else if (warning.severity === 'critical' && existing.severity !== 'critical') {
      // Upgrade severity
      seen.set(key, warning);
    }
  }

  return Array.from(seen.values());
}

// ── Reading Warning State Derivation ────────────────────────────────────

/**
 * Derive the warning state for a normalized reading.
 * Used when the provider doesn't explicitly set a warning state.
 */
export function deriveWarningState(reading: Partial<EcsNormalizedReading>): EcsWarningState {
  // Check for low battery
  if (reading.batteryPercent != null && reading.batteryPercent <= 10) {
    return 'low_battery';
  }

  // Check for high temperature
  if (reading.temperatureCelsius != null && reading.temperatureCelsius >= 55) {
    return 'high_temp';
  }

  // Check for stale data
  if (reading.isStale) {
    return 'comm_loss';
  }

  // Check for disconnected
  if (reading.isDisconnected) {
    return 'comm_loss';
  }

  return 'normal';
}

// ── Offline Tolerance ───────────────────────────────────────────────────

/**
 * Configuration for offline tolerance behavior.
 * Controls how the system handles temporary telemetry drops.
 */
export interface OfflineToleranceConfig {
  /** How long to preserve last known values before marking as stale */
  preserveLastKnownMs: number;
  /** How long to wait before showing disconnected state */
  disconnectedThresholdMs: number;
  /** How long to attempt reconnect before giving up */
  reconnectTimeoutMs: number;
  /** Whether to suppress repeated warnings during reconnect */
  suppressWarningsDuringReconnect: boolean;
  /** Maximum number of reconnect attempts */
  maxReconnectAttempts: number;
}

export const DEFAULT_OFFLINE_TOLERANCE: OfflineToleranceConfig = {
  preserveLastKnownMs: TELEMETRY_FRESHNESS.STALE_THRESHOLD_MS,
  disconnectedThresholdMs: TELEMETRY_FRESHNESS.EXPIRED_THRESHOLD_MS,
  reconnectTimeoutMs: 300_000, // 5 minutes
  suppressWarningsDuringReconnect: true,
  maxReconnectAttempts: CONNECTION_STABILITY.MAX_RECONNECT_ATTEMPTS,
};

/**
 * Determine if a reading should be preserved or discarded based on offline tolerance.
 */
export function shouldPreserveReading(
  reading: EcsNormalizedReading,
  config: OfflineToleranceConfig = DEFAULT_OFFLINE_TOLERANCE,
): boolean {
  const age = Date.now() - reading.lastUpdated;
  return age < config.disconnectedThresholdMs;
}

// ── System Health Summary ───────────────────────────────────────────────

export interface SystemHealthSummary {
  /** Overall system health grade */
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'offline';
  /** Overall system health score (0–100) */
  score: number;
  /** Per-provider health scores */
  providerScores: ProviderHealthScore[];
  /** Total active warnings */
  totalWarnings: number;
  /** Critical warnings count */
  criticalWarnings: number;
  /** Whether the system is fully operational */
  isOperational: boolean;
  /** Human-readable status message */
  statusMessage: string;
}

/**
 * Compute a system-wide health summary.
 */
export function computeSystemHealthSummary(
  providerScores: ProviderHealthScore[],
  activeWarnings: EcsProviderWarning[],
): SystemHealthSummary {
  if (providerScores.length === 0) {
    return {
      grade: 'offline',
      score: 0,
      providerScores: [],
      totalWarnings: 0,
      criticalWarnings: 0,
      isOperational: false,
      statusMessage: 'No providers connected',
    };
  }

  const avgScore = Math.round(
    providerScores.reduce((sum, p) => sum + p.score, 0) / providerScores.length,
  );

  const criticalWarnings = activeWarnings.filter((w) => w.severity === 'critical').length;
  const totalWarnings = activeWarnings.length;

  const grade: SystemHealthSummary['grade'] =
    avgScore >= 90 ? 'excellent' :
    avgScore >= 70 ? 'good' :
    avgScore >= 50 ? 'fair' :
    avgScore >= 25 ? 'poor' :
    'critical';

  const isOperational = avgScore >= 25 && criticalWarnings === 0;

  let statusMessage: string;
  if (grade === 'excellent') statusMessage = 'All systems nominal';
  else if (grade === 'good') statusMessage = 'Systems operational with minor issues';
  else if (grade === 'fair') statusMessage = 'Some providers experiencing issues';
  else if (grade === 'poor') statusMessage = 'Multiple providers degraded';
  else statusMessage = 'System health critical — check connections';

  return {
    grade,
    score: avgScore,
    providerScores,
    totalWarnings,
    criticalWarnings,
    isOperational,
    statusMessage,
  };
}

