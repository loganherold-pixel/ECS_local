export type PowerModuleRiveTelemetry = {
  hasEcsData: boolean;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
};

export type PowerModuleRiveTelemetrySource = {
  canDisplayTelemetryValues?: boolean | null;
  isStale?: boolean | null;
  snapshot?: {
    isStale?: boolean | null;
  } | null;
  sourceState?: {
    isStale?: boolean | null;
    isUnavailable?: boolean | null;
  } | null;
  batteryPercent?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
} | null | undefined;

function sanitizeRivePercent(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeRiveWatts(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function adaptPowerTelemetryForRive(
  telemetry: PowerModuleRiveTelemetrySource,
): PowerModuleRiveTelemetry {
  if (!telemetry) {
    return {
      hasEcsData: false,
      batteryPercent: null,
      inputWatts: null,
      outputWatts: null,
    };
  }

  const hasFreshTelemetry =
    telemetry.canDisplayTelemetryValues === true &&
    telemetry.isStale !== true &&
    telemetry.snapshot?.isStale !== true &&
    telemetry.sourceState?.isStale !== true &&
    telemetry.sourceState?.isUnavailable !== true;

  return {
    hasEcsData: hasFreshTelemetry,
    batteryPercent: hasFreshTelemetry ? sanitizeRivePercent(telemetry.batteryPercent) : null,
    inputWatts: hasFreshTelemetry ? sanitizeRiveWatts(telemetry.inputWatts) : 0,
    outputWatts: hasFreshTelemetry ? sanitizeRiveWatts(telemetry.outputWatts) : 0,
  };
}
