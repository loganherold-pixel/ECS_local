export const ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE = 'power_station';

export type EcoFlowBluDeviceCandidate = {
  deviceId?: string | null;
  id?: string | null;
  deviceName?: string | null;
  name?: string | null;
  model?: string | null;
  productType?: string | null;
  online?: boolean;
};

export type EcoFlowBluEligibilityReason =
  | 'telemetry_supported'
  | 'unsupported_product_type'
  | 'missing_device_id'
  | 'unauthorized';

export type EcoFlowBluEligibility = {
  deviceId: string;
  deviceName: string;
  model: string;
  productType: string;
  online?: boolean;
  telemetryCapable: boolean;
  reason: EcoFlowBluEligibilityReason;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeEcoFlowBluCandidate(
  candidate: EcoFlowBluDeviceCandidate,
): EcoFlowBluEligibility {
  const deviceId = normalizeString(candidate.deviceId ?? candidate.id);
  const deviceName = normalizeString(candidate.deviceName ?? candidate.name) || deviceId || 'EcoFlow Device';
  const model = normalizeString(candidate.model) || deviceName || 'EcoFlow Device';
  const productType = normalizeString(candidate.productType).toLowerCase() || 'unknown';
  const telemetryCapable = productType === ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE;

  return {
    deviceId,
    deviceName,
    model,
    productType,
    online: candidate.online,
    telemetryCapable,
    reason: deviceId.length === 0
      ? 'missing_device_id'
      : telemetryCapable
        ? 'telemetry_supported'
        : 'unsupported_product_type',
  };
}

export function isEcoFlowBluTelemetryCapable(
  candidate: EcoFlowBluDeviceCandidate,
): boolean {
  return normalizeEcoFlowBluCandidate(candidate).telemetryCapable;
}

export function describeEcoFlowBluEligibility(
  candidate: EcoFlowBluDeviceCandidate,
  unauthorized = false,
): EcoFlowBluEligibility {
  const normalized = normalizeEcoFlowBluCandidate(candidate);
  if (unauthorized && normalized.deviceId) {
    return {
      ...normalized,
      telemetryCapable: false,
      reason: 'unauthorized',
    };
  }
  return normalized;
}

