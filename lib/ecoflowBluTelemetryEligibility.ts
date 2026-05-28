export const ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE = 'power_station';
export const ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES = [
  'power_station',
  'refrigerator',
  'portable_ac',
  'charger',
] as const;

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

export type EcoFlowCloudTelemetryProductType =
  typeof ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES[number];

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeToken(value: unknown): string {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function normalizeEcoFlowTelemetryProductType(
  productType: unknown,
  fallbackText: string = '',
): string {
  const rawProductType = normalizeString(productType);
  const normalizedProductType = normalizeToken(rawProductType);
  const searchable = normalizeToken(`${rawProductType} ${fallbackText}`);

  if (!searchable || searchable === 'unknown') return 'unknown';
  if (/glacier|fridge|refrigerator/.test(searchable)) return 'refrigerator';
  if (/wave|portable_ac|air_condition|aircon|ac_unit/.test(searchable)) return 'portable_ac';
  if (/alternator|charger|dc_dc/.test(searchable)) return 'charger';
  if (
    /delta|river|power_station|powerstation|portable_power|power_bank|solar_generator/.test(searchable)
  ) {
    return 'power_station';
  }

  return normalizedProductType || 'unknown';
}

export function normalizeEcoFlowBluCandidate(
  candidate: EcoFlowBluDeviceCandidate,
): EcoFlowBluEligibility {
  const deviceId = normalizeString(candidate.deviceId ?? candidate.id);
  const deviceName = normalizeString(candidate.deviceName ?? candidate.name) || deviceId || 'EcoFlow Device';
  const model = normalizeString(candidate.model) || deviceName || 'EcoFlow Device';
  const productType = normalizeEcoFlowTelemetryProductType(
    candidate.productType,
    `${deviceName} ${model}`,
  );
  const telemetryCapable = (ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES as readonly string[]).includes(productType);

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

export function isEcoFlowCloudTelemetryProductType(
  productType: string | null | undefined,
): productType is EcoFlowCloudTelemetryProductType {
  return (ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES as readonly string[])
    .includes(normalizeString(productType).toLowerCase());
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

