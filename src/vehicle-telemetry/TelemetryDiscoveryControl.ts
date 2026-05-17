import type { OBD2AdapterState, OBD2ScanDiagnostics } from './OBD2Adapter';

export type TelemetrySourceStatus =
  | 'not_configured'
  | 'scanning'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'
  | 'permission_required'
  | 'error';

export type TelemetryScanTrigger =
  | 'user_open_tools'
  | 'manual_reconnect'
  | 'auto_connect_startup'
  | 'controlled_retry';

export const TELEMETRY_SCAN_THROTTLE_MS = 10_000;
export const TELEMETRY_SCAN_MIN_DURATION_MS = 5_000;
export const TELEMETRY_SCAN_MAX_DURATION_MS = 60_000;

export function normalizeTelemetryScanDurationMs(durationMs: number | undefined): number {
  if (!Number.isFinite(durationMs) || typeof durationMs !== 'number') {
    return 15_000;
  }
  return Math.max(
    TELEMETRY_SCAN_MIN_DURATION_MS,
    Math.min(durationMs, TELEMETRY_SCAN_MAX_DURATION_MS),
  );
}

export function isTelemetryScanThrottleActive(
  nowMs: number,
  lastScanFinishedAt: number | null,
  throttleMs: number = TELEMETRY_SCAN_THROTTLE_MS,
): boolean {
  return lastScanFinishedAt !== null && nowMs - lastScanFinishedAt < throttleMs;
}

export function mapObdStateToTelemetrySourceStatus(
  state: OBD2AdapterState,
  options: {
    autoReconnectEnabled: boolean;
    hasLastDevice: boolean;
    diagnostics?: Pick<OBD2ScanDiagnostics, 'readinessCode' | 'permissionStatus'> | null;
    error?: string | null;
  },
): TelemetrySourceStatus {
  if (state === 'connected') return 'connected';
  if (state === 'reconnecting') return 'reconnecting';
  if (state === 'scanning' || state === 'requesting_permissions') return 'scanning';

  if (state === 'error') {
    if (
      options.diagnostics?.readinessCode === 'permission_denied' ||
      options.diagnostics?.permissionStatus === 'denied'
    ) {
      return 'permission_required';
    }

    if (
      options.diagnostics?.readinessCode === 'adapter_unavailable' ||
      options.diagnostics?.readinessCode === 'platform_unsupported' ||
      options.diagnostics?.readinessCode === 'runtime_unsupported'
    ) {
      return 'unavailable';
    }

    return options.error ? 'error' : 'unavailable';
  }

  if (options.autoReconnectEnabled && options.hasLastDevice) {
    return 'unavailable';
  }

  return options.hasLastDevice ? 'unavailable' : 'not_configured';
}
