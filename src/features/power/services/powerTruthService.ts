import {
  POWER_LIVE_MAX_AGE_MS,
  POWER_STALE_MAX_AGE_MS,
  getPowerTruthLabel,
  isPowerSimulationAllowed,
  normalizePowerTelemetryProviderId,
  normalizePowerTelemetryTruth,
  type PowerTelemetry as CanonicalPowerTelemetry,
  type PowerTelemetryProviderId,
  type PowerTelemetryTruth,
} from "../../../power/types/PowerTelemetry";
import type { PowerTelemetry } from "../types/powerTypes";
import {
  EMPTY_POWER_TELEMETRY_SNAPSHOT,
  type ECSTelemetryConfidence,
  type ECSTelemetryFreshness,
  type PowerTelemetrySnapshot,
} from "../../../types/telemetry";

export {
  POWER_LIVE_MAX_AGE_MS,
  POWER_STALE_MAX_AGE_MS,
  getPowerTruthLabel,
  isPowerSimulationAllowed,
  normalizePowerTelemetryProviderId,
  normalizePowerTelemetryTruth,
};

export function createUnavailablePowerTruth(
  providerId?: PowerTelemetryProviderId,
  reason = "No validated telemetry source is connected.",
): PowerTelemetryTruth {
  return {
    sourceTruth: "unavailable",
    providerId,
    confidence: 0,
    isLive: false,
    isStale: false,
    isManual: false,
    isSimulated: false,
    reason,
  };
}

export function normalizeFeaturePowerTelemetry(
  fields: Partial<PowerTelemetry>,
  truth: PowerTelemetryTruth,
): PowerTelemetry {
  return {
    batteryPercent: fields.batteryPercent,
    capacityWh: fields.capacityWh,
    inputWatts: fields.inputWatts,
    outputWatts: fields.outputWatts,
    solarWatts: fields.solarWatts,
    acOutputEnabled: fields.acOutputEnabled,
    dcOutputEnabled: fields.dcOutputEnabled,
    usbOutputEnabled: fields.usbOutputEnabled,
    temperatureC: fields.temperatureC,
    estimatedRuntimeMinutes: fields.estimatedRuntimeMinutes,
    truth,
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function confidenceBand(value: number | undefined): ECSTelemetryConfidence {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unverified";
  if (value >= 0.8) return "high";
  if (value >= 0.5) return "medium";
  if (value > 0) return "low";
  return "unverified";
}

function freshnessFromTruth(truth: PowerTelemetryTruth): ECSTelemetryFreshness {
  if (truth.isLive) return "live";
  if (truth.isStale) return "stale";
  if (truth.sourceTruth === "cached" || truth.sourceTruth === "manual") return "recent";
  if (truth.sourceTruth === "device_detected") return "unknown";
  if (truth.sourceTruth === "simulated") return "unknown";
  return "offline";
}

function isoTimestamp(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

export function normalizePowerTelemetrySnapshot(
  fields: Partial<PowerTelemetry>,
  truth: PowerTelemetryTruth = fields.truth ?? createUnavailablePowerTruth(),
): PowerTelemetrySnapshot {
  const simulatedBlocked = truth.isSimulated && !isPowerSimulationAllowed();
  if (simulatedBlocked) {
    return {
      ...EMPTY_POWER_TELEMETRY_SNAPSHOT,
      sourceType: "simulated",
      sourceLabel: getPowerTruthLabel(truth),
      freshness: "unknown",
      confidence: "unverified",
      providerId: truth.providerId ?? null,
      deviceId: truth.deviceId ?? null,
      deviceName: truth.deviceName ?? null,
      isSimulated: true,
      warnings: [{
        id: "power:simulated-blocked",
        message: "Simulated power telemetry is not enabled for this runtime.",
        severity: "watch",
        source: "power_telemetry",
      }],
    };
  }

  return {
    sourceType: truth.sourceTruth,
    sourceLabel: getPowerTruthLabel(truth),
    freshness: freshnessFromTruth(truth),
    confidence: confidenceBand(truth.confidence),
    updatedAt: isoTimestamp(truth.lastUpdatedAt),
    providerId: truth.providerId ?? null,
    deviceId: truth.deviceId ?? null,
    deviceName: truth.deviceName ?? null,
    batteryPercent: finiteNumber(fields.batteryPercent),
    capacityWh: finiteNumber(fields.capacityWh),
    inputWatts: finiteNumber(fields.inputWatts),
    outputWatts: finiteNumber(fields.outputWatts),
    solarWatts: finiteNumber(fields.solarWatts),
    acOutputEnabled: nullableBool(fields.acOutputEnabled),
    dcOutputEnabled: nullableBool(fields.dcOutputEnabled),
    usbOutputEnabled: nullableBool(fields.usbOutputEnabled),
    temperatureC: finiteNumber(fields.temperatureC),
    estimatedRuntimeMinutes: finiteNumber(fields.estimatedRuntimeMinutes),
    isLive: truth.isLive,
    isStale: truth.isStale,
    isManual: truth.isManual,
    isSimulated: truth.isSimulated,
    warnings: truth.reason
      ? [{
          id: "power:truth-reason",
          message: truth.reason,
          severity: truth.sourceTruth === "unavailable" ? "watch" : "info",
          source: "power_telemetry",
        }]
      : [],
  };
}

export function normalizeCanonicalPowerTelemetry(
  telemetry: Partial<CanonicalPowerTelemetry>,
): PowerTelemetry {
  const truth = normalizePowerTelemetryTruth(telemetry);
  return normalizeFeaturePowerTelemetry(
    {
      batteryPercent: telemetry.battery?.socPct,
      inputWatts: telemetry.battery?.wattsIn,
      outputWatts: telemetry.battery?.wattsOut,
      solarWatts: telemetry.solar?.watts,
      temperatureC: telemetry.battery?.tempC,
      estimatedRuntimeMinutes: telemetry.battery?.estRuntimeMin,
    },
    truth,
  );
}

export function normalizeCanonicalPowerTelemetrySnapshot(
  telemetry: Partial<CanonicalPowerTelemetry>,
): PowerTelemetrySnapshot {
  const normalized = normalizeCanonicalPowerTelemetry(telemetry);
  return normalizePowerTelemetrySnapshot(normalized, normalized.truth);
}
