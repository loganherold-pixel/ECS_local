/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION RISK ENGINE — Phase 4E React Hook
 * ═══════════════════════════════════════════════════════════
 *
 * Provides reactive access to the Expedition Risk Engine state
 * for use in dashboard widgets, expedition panels, and other
 * UI components.
 *
 * Features:
 *   - Subscribes to risk store changes
 *   - Returns stable references (identity-stable when unchanged)
 *   - Provides derived convenience values
 *   - Safe for use in any component (returns defaults when no data)
 *   - Does not trigger unnecessary re-renders
 *
 * Phase 4D additions:
 *   - Resource details (fuel, water, power, BLU telemetry)
 *   - Route details (trail rating, challenge score, duration, capability delta)
 *   - Cross-factor details (resource-route balance)
 *
 * Phase 4E additions:
 *   - health_score as independent sub-score
 *   - routeDifficultyScore and resourceRouteBalance
 *   - Stabilized operational status
 *   - Resource and route convenience checks
 */

import { useState, useEffect, useRef } from 'react';
import { expeditionRiskStore } from './expeditionRiskStore';
import type {
  RiskEvaluation,
  RiskSummary,
  RiskInputSnapshot,
  RiskEngineState,
  OperationalStatus,
  PrimaryRiskFactor,
  VehicleWeightClass,
  VehicleCapabilityTier,
  WeightDistributionStability,
  OperationalConnectivityState,
} from './expeditionRiskTypes';
import {
  OPERATIONAL_STATUS_DISPLAY,
  RISK_FACTOR_LABELS,
} from './expeditionRiskTypes';


export interface UseExpeditionRiskResult {
  // ── Core Data ──────────────────────────────────────────
  /** Full risk evaluation (null if not yet computed) */
  evaluation: RiskEvaluation | null;
  /** Dashboard-ready risk summary (null if not yet computed) */
  summary: RiskSummary | null;
  /** Most recent input snapshot */
  inputSnapshot: RiskInputSnapshot | null;

  // ── Derived Values ─────────────────────────────────────
  /** Composite risk score (0–100, 0 if no data) */
  riskScore: number;
  /** Operational status (stabilized via hysteresis) */
  operationalStatus: OperationalStatus;
  /** Display config for current operational status */
  operationalDisplay: {
    label: string;
    shortLabel: string;
    color: string;
    icon: string;
    description: string;
  };
  /** Primary risk factor identifier */
  primaryRiskFactor: PrimaryRiskFactor;
  /** Human-readable primary risk factor label */
  primaryRiskLabel: string;
  /** Human-readable summary line */
  summaryLine: string;

  // ── Sub-Scores ─────────────────────────────────────────
  /** Vehicle capability score (0–100, higher = better) */
  capabilityScore: number;
  /** Phase 4E: Vehicle health score (0–100, higher = better) */
  healthScore: number;
  /** Resource readiness score (0–100, higher = better) */
  resourceReadiness: number;
  /** Connectivity risk score (0–100, higher = more risk) */
  connectivityRisk: number;
  /** Isolation risk score (0–100, higher = more risk) */
  isolationRisk: number;
  /** Phase 4D/4E: Route difficulty score (0–100, higher = harder) */
  routeDifficultyScore: number;
  /** Phase 4D/4E: Resource-to-route balance (0–100, higher = better) */
  resourceRouteBalance: number;

  // ── Data Quality ───────────────────────────────────────
  /** Number of available input categories */
  availableInputs: number;
  /** Total input categories */
  totalInputs: number;
  /** Whether evaluation is based on complete data */
  isComplete: boolean;
  /** Whether the engine has been initialized */
  isInitialized: boolean;
  /** Whether the engine is actively running */
  isRunning: boolean;
  /** Number of evaluations completed */
  evaluationCount: number;

  // ── Status Checks ──────────────────────────────────────
  /** Whether operational status is optimal */
  isOptimal: boolean;
  /** Whether operational status is caution or worse */
  isCaution: boolean;
  /** Whether operational status is elevated or worse */
  isElevated: boolean;
  /** Whether operational status is critical */
  isCritical: boolean;
  /** Whether any data is available */
  hasData: boolean;

  // ── Phase 4B: Vehicle Capability Details ───────────────
  vehicleWeightClass: VehicleWeightClass;
  vehicleCapabilityTier: VehicleCapabilityTier;
  vehicleDrivetrain: '4wd' | '2wd' | 'awd' | 'unknown';
  isOverweight: boolean;
  payloadMarginLb: number | null;
  tireSizeInches: number;
  suspensionLiftInches: number;

  // ── Phase 4B: Vehicle Health Details ───────────────────
  hasLiveTelemetry: boolean;
  batteryHealth: string;
  batteryVoltage: number | null;
  coolantTempF: number | null;
  isCoolantHigh: boolean;
  hasAnomaly: boolean;
  anomalyFlags: string[];
  telemetryFreshness: string;

  // ── Phase 4B: Load Balance Details ─────────────────────
  weightDistribution: WeightDistributionStability;
  rearAxlePct: number | null;
  isLoadImbalanced: boolean;
  itemsWeightLb: number;

  // ── Phase 4C: Remoteness Details ───────────────────────
  remotenessScore: number | null;
  remotenessTier: string | null;
  remotenessTierColor: string | null;
  remotenessEngineRunning: boolean;
  remotenessRawScore: number | null;
  routeIsolationScore: number | null;
  distanceFromServicesMi: number | null;
  elevationSignalScore: number;
  connectivitySignalScore: number;
  speedSignalScore: number;
  sustainedSpeedMph: number | null;
  remotenessCacheReady: boolean;
  remotenessFreshness: string;

  // ── Phase 4C: Connectivity Details ─────────────────────
  connectivityState: string;
  internetReachable: boolean;
  offlineCacheReady: boolean;
  cachedRegionAvailable: boolean;
  cachedRouteAvailable: boolean;
  operationalReadiness: string;
  operationalConnectivityState: OperationalConnectivityState;
  connectivityFreshness: string;
  signalQuality: string;
  networkType: string;
  connectivityQuality: string;
  latencyMs: number | null;
  lastOnlineAt: string | null;
  hoursSinceOnline: number | null;
  isRecovering: boolean;

  // ── Phase 4C: Environmental Risk Convenience Checks ────
  isOfflineUnprepared: boolean;
  isDegradedUnprepared: boolean;
  isDeepIsolation: boolean;
  isHighRemoteness: boolean;
  isOfflineReady: boolean;
  isEnvironmentalRiskPrimary: boolean;

  // ── Phase 4D: Resource Details ─────────────────────────
  /** Whether BLU live telemetry is connected */
  hasBluTelemetry: boolean;
  /** BLU battery state of charge (null if unavailable) */
  bluBatteryPercent: number | null;
  /** BLU input watts (null if unavailable) */
  bluInputWatts: number | null;
  /** BLU output watts (null if unavailable) */
  bluOutputWatts: number | null;
  /** BLU runtime in minutes (null if unavailable) */
  bluRuntimeMinutes: number | null;
  /** Whether BLU power is sustainable */
  bluPowerSustainable: boolean;
  /** Resource data freshness */
  resourceFreshness: string;
  /** Whether fuel is low (<25%) */
  isFuelLow: boolean;
  /** Whether water is low (<2 gal) */
  isWaterLow: boolean;
  /** Whether power is limited (<2 hrs runtime) */
  isPowerLimited: boolean;

  // ── Phase 4D: Route Details ────────────────────────────
  /** Trail difficulty rating (1–5, null if unrated) */
  trailDifficultyRating: number | null;
  /** Route challenge score (0–100) */
  routeChallengeScore: number;
  /** Estimated route duration in hours */
  estimatedDurationHrs: number | null;
  /** Elevation gain per mile (ft/mi) */
  elevationGainPerMi: number | null;
  /** Difficulty vs capability delta (positive = route exceeds capability) */
  difficultyVsCapabilityDelta: number | null;
  /** Whether route exceeds vehicle capability */
  routeExceedsCapability: boolean;

  // ── Phase 4D/4E: Cross-Factor Convenience Checks ──────
  /** Whether resources are critically depleted */
  isResourceDepleted: boolean;
  /** Whether route exceeds capability by a significant margin */
  isRouteCapabilityMismatch: boolean;
  /** Whether BLU power is unsustainable with low battery */
  isPowerUnsustainable: boolean;
}


export function useExpeditionRisk(): UseExpeditionRiskResult {
  const [, setTick] = useState(0);
  const resultRef = useRef<UseExpeditionRiskResult | null>(null);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = expeditionRiskStore.subscribe(() => {
      setTick(t => t + 1);
    });
    return unsub;
  }, []);

  // Build result
  const evaluation = expeditionRiskStore.getEvaluation();
  const summary = expeditionRiskStore.getSummary();
  const inputSnapshot = expeditionRiskStore.getLastInputSnapshot();
  const state = expeditionRiskStore.getState();

  const riskScore = evaluation?.risk_score ?? 0;
  const operationalStatus = evaluation?.operational_status ?? 'optimal';
  const operationalDisplay = OPERATIONAL_STATUS_DISPLAY[operationalStatus];
  const primaryRiskFactor = evaluation?.primary_risk_factor ?? 'none';
  const primaryRiskLabel = RISK_FACTOR_LABELS[primaryRiskFactor] ?? 'Unknown';
  const summaryLine = evaluation?.summary_line ?? 'Awaiting data\u2026';

  const capabilityScore = evaluation?.capability_score ?? 0;
  const healthScore = evaluation?.health_score ?? 0;
  const resourceReadiness = evaluation?.resource_readiness ?? 0;
  const connectivityRisk = evaluation?.connectivity_risk ?? 0;
  const isolationRisk = evaluation?.isolation_risk ?? 0;
  const routeDifficultyScore = evaluation?.route_difficulty_score ?? 0;
  const resourceRouteBalance = evaluation?.resource_route_balance ?? 100;

  const availableInputs = evaluation?.available_inputs ?? 0;
  const totalInputs = evaluation?.total_inputs ?? 6;
  const isComplete = evaluation?.is_complete ?? false;

  // Extract input snapshot details
  const cap = inputSnapshot?.vehicle_capability;
  const health = inputSnapshot?.vehicle_health;
  const rem = inputSnapshot?.remoteness;
  const conn = inputSnapshot?.connectivity_status;
  const res = inputSnapshot?.expedition_resources;
  const route = inputSnapshot?.route_difficulty;

  // Phase 4C: Environmental risk convenience checks
  const opConnState = conn?.operational_connectivity_state ?? 'offline_unprepared';
  const isOfflineUnprepared = opConnState === 'offline_unprepared';
  const isDegradedUnprepared = opConnState === 'degraded_unprepared';
  const remTier = rem?.remoteness_tier ?? null;
  const isDeepIsolation = remTier === 'DEEP REMOTE' || remTier === 'EXTREME';
  const isHighRemoteness = (rem?.remoteness_score ?? 0) >= 60;
  const isOfflineReady = opConnState === 'offline_ready';
  const envFactors: PrimaryRiskFactor[] = [
    'offline_unprepared', 'degraded_unprepared', 'deep_isolation',
    'high_remoteness', 'no_connectivity',
  ];
  const isEnvironmentalRiskPrimary = envFactors.includes(primaryRiskFactor);

  // Phase 4D: Resource convenience checks
  const isFuelLow = res?.fuel_low ?? false;
  const isWaterLow = res?.water_low ?? false;
  const isPowerLimited = res?.power_limited ?? false;
  const critCount = [isFuelLow, isWaterLow, isPowerLimited].filter(Boolean).length;
  const isResourceDepleted = critCount >= 2;
  const isRouteCapabilityMismatch = (route?.route_exceeds_capability ?? false) &&
    (route?.difficulty_vs_capability_delta ?? 0) > 20;
  const isPowerUnsustainable = (res?.has_blu_telemetry ?? false) &&
    !(res?.blu_power_sustainable ?? true) &&
    (res?.blu_battery_percent ?? 100) < 20;

  const result: UseExpeditionRiskResult = {
    evaluation,
    summary,
    inputSnapshot,

    riskScore,
    operationalStatus,
    operationalDisplay,
    primaryRiskFactor,
    primaryRiskLabel,
    summaryLine,

    capabilityScore,
    healthScore,
    resourceReadiness,
    connectivityRisk,
    isolationRisk,
    routeDifficultyScore,
    resourceRouteBalance,

    availableInputs,
    totalInputs,
    isComplete,
    isInitialized: state.initialized,
    isRunning: state.running,
    evaluationCount: state.evaluation_count,

    isOptimal: operationalStatus === 'optimal',
    isCaution: operationalStatus === 'caution' || operationalStatus === 'elevated' || operationalStatus === 'critical',
    isElevated: operationalStatus === 'elevated' || operationalStatus === 'critical',
    isCritical: operationalStatus === 'critical',
    hasData: availableInputs > 0,

    // Phase 4B: Vehicle capability
    vehicleWeightClass: cap?.weight_class ?? 'unknown',
    vehicleCapabilityTier: cap?.capability_tier ?? 'unknown',
    vehicleDrivetrain: cap?.drivetrain ?? 'unknown',
    isOverweight: cap?.is_overweight ?? false,
    payloadMarginLb: cap?.payload_margin_lb ?? null,
    tireSizeInches: cap?.tire_size_inches ?? 0,
    suspensionLiftInches: cap?.suspension_lift_inches ?? 0,

    // Phase 4B: Vehicle health
    hasLiveTelemetry: health?.has_live_telemetry ?? false,
    batteryHealth: health?.battery_health ?? 'unknown',
    batteryVoltage: health?.battery_voltage ?? null,
    coolantTempF: health?.coolant_temp_f ?? null,
    isCoolantHigh: health?.coolant_high ?? false,
    hasAnomaly: health?.has_anomaly ?? false,
    anomalyFlags: health?.anomaly_flags ?? [],
    telemetryFreshness: health?.telemetry_freshness ?? 'disconnected',

    // Phase 4B: Load balance
    weightDistribution: cap?.weight_distribution ?? 'unknown',
    rearAxlePct: cap?.rear_axle_pct ?? null,
    isLoadImbalanced: cap?.load_imbalanced ?? false,
    itemsWeightLb: cap?.items_weight_lb ?? 0,

    // Phase 4C: Remoteness details
    remotenessScore: rem?.remoteness_score ?? null,
    remotenessTier: rem?.remoteness_tier ?? null,
    remotenessTierColor: rem?.tier_color ?? null,
    remotenessEngineRunning: rem?.engine_running ?? false,
    remotenessRawScore: rem?.raw_score ?? null,
    routeIsolationScore: rem?.route_isolation_score ?? null,
    distanceFromServicesMi: rem?.distance_from_services_mi ?? null,
    elevationSignalScore: rem?.elevation_signal_score ?? 0,
    connectivitySignalScore: rem?.connectivity_signal_score ?? 0,
    speedSignalScore: rem?.speed_signal_score ?? 0,
    sustainedSpeedMph: rem?.sustained_speed_mph ?? null,
    remotenessCacheReady: rem?.cache_ready ?? false,
    remotenessFreshness: rem?.remoteness_freshness ?? 'offline',

    // Phase 4C: Connectivity details
    connectivityState: conn?.connectivity_state ?? 'unknown',
    internetReachable: conn?.internet_reachable ?? false,
    offlineCacheReady: conn?.offline_cache_ready ?? false,
    cachedRegionAvailable: conn?.cached_region_available ?? false,
    cachedRouteAvailable: conn?.cached_route_available ?? false,
    operationalReadiness: conn?.operational_readiness ?? 'offline_unprepared',
    operationalConnectivityState: opConnState,
    connectivityFreshness: conn?.freshness ?? 'offline',
    signalQuality: conn?.signal_quality ?? 'unknown',
    networkType: conn?.network_type ?? 'unknown',
    connectivityQuality: conn?.quality ?? 'unknown',
    latencyMs: conn?.latency_ms ?? null,
    lastOnlineAt: conn?.last_online_at ?? null,
    hoursSinceOnline: conn?.hours_since_online ?? null,
    isRecovering: conn?.is_recovering ?? false,

    // Phase 4C: Environmental risk convenience checks
    isOfflineUnprepared,
    isDegradedUnprepared,
    isDeepIsolation,
    isHighRemoteness,
    isOfflineReady,
    isEnvironmentalRiskPrimary,

    // Phase 4D: Resource details
    hasBluTelemetry: res?.has_blu_telemetry ?? false,
    bluBatteryPercent: res?.blu_battery_percent ?? null,
    bluInputWatts: res?.blu_input_watts ?? null,
    bluOutputWatts: res?.blu_output_watts ?? null,
    bluRuntimeMinutes: res?.blu_runtime_minutes ?? null,
    bluPowerSustainable: res?.blu_power_sustainable ?? false,
    resourceFreshness: res?.resource_freshness ?? 'unavailable',
    isFuelLow,
    isWaterLow,
    isPowerLimited,

    // Phase 4D: Route details
    trailDifficultyRating: route?.trail_difficulty_rating ?? null,
    routeChallengeScore: route?.route_challenge_score ?? 0,
    estimatedDurationHrs: route?.estimated_duration_hrs ?? null,
    elevationGainPerMi: route?.elevation_gain_per_mi ?? null,
    difficultyVsCapabilityDelta: route?.difficulty_vs_capability_delta ?? null,
    routeExceedsCapability: route?.route_exceeds_capability ?? false,

    // Phase 4D/4E: Cross-factor convenience checks
    isResourceDepleted,
    isRouteCapabilityMismatch,
    isPowerUnsustainable,
  };

  resultRef.current = result;
  return result;
}

