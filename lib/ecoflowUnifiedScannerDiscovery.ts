import type { EcsDiscoveredDevice } from './IEcsPowerProvider';
import type { UnifiedDiscoverySource } from './unifiedDeviceDiscoveryAggregator';
import { ecsLog } from './ecsLogger';
import { EcoFlowCloudProvider } from '../src/power/cloud/providers/EcoFlowCloudProvider';
import type { PowerDevice as CatalogPowerDevice } from '../src/power/types/PowerDevice';
import { isEcoFlowUnauthorizedDeviceError } from './ecoflowUnauthorizedDevice';
import type { UnifiedScannerErrorSource } from './unifiedScannerContract';
import { normalizeEcoFlowTelemetryProductType } from './ecoflowBluTelemetryEligibility';

export type EcoFlowScannerDevice = EcsDiscoveredDevice & {
  providerId: 'ecoflow';
  source: UnifiedDiscoverySource;
  brand: 'EcoFlow';
  category: 'refrigerator' | 'power_station' | 'unknown' | string;
  displayName: string;
  productType?: string;
  connectionType: 'api' | 'cloud';
  requiresNativeBluetooth: false;
  connectableViaCloud: true;
  isOnline: boolean | null;
  available: boolean | null;
  sourceIds: {
    api: string;
  };
};

export interface EcoFlowScannerDiscoveryProvider {
  listDevices(): Promise<CatalogPowerDevice[]>;
}

export class EcoFlowCloudDiscoveryError extends Error {
  readonly errorSource: UnifiedScannerErrorSource;

  constructor(message: string, errorSource: UnifiedScannerErrorSource) {
    super(message);
    this.name = 'EcoFlowCloudDiscoveryError';
    this.errorSource = errorSource;
  }
}

export function classifyEcoFlowCloudErrorSource(error: unknown): UnifiedScannerErrorSource {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isEcoFlowUnauthorizedDeviceError(error) || /unauthori[sz]ed|not authorized|forbidden|pending_approval|approval|missing_ecoflow_credentials|keys not configured|auth required|authorization required/i.test(message)) {
    return 'cloud_auth';
  }
  if (/signature|access key|api key|secret|region|account binding|credential|configuration|config/i.test(message)) {
    return 'cloud_config';
  }
  if (/device status|device unavailable|device offline|cloud device|device failed/i.test(message)) {
    return 'cloud_device_status';
  }
  if (/cloud|edge function|api|access/i.test(message)) {
    return 'cloud_access';
  }
  return 'cloud_access';
}

function logEcoFlowScanDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('TELEMETRY', `[BT_SCAN:ECOFLOW] ${message}`, details);
}

function logEcoFlowScanWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('TELEMETRY', `[BT_SCAN:ECOFLOW] ${message}`, details);
}

function normalizeEcoFlowProductType(value: string | null | undefined): string {
  return normalizeEcoFlowTelemetryProductType(value);
}

function isEcoFlowGlacierDevice(device: CatalogPowerDevice): boolean {
  const searchable = [
    device.name,
    device.model,
    device.productType,
    device.deviceId,
  ].filter(Boolean).join(' ').toLowerCase();
  return /glacier|refrigerator|fridge/.test(searchable);
}

export function normalizeEcoFlowScannerDevice(
  device: CatalogPowerDevice,
  now: number = Date.now(),
): EcoFlowScannerDevice | null {
  const deviceId = String(device.deviceId ?? '').trim();
  if (!deviceId) {
    logEcoFlowScanWarn('normalize_failed', {
      reason: 'missing_device_id',
      provider: device.provider,
      name: device.name ?? null,
      model: device.model ?? null,
    });
    return null;
  }

  const isGlacier = isEcoFlowGlacierDevice(device);
  const rawModel = String(device.model ?? '').trim();
  const model =
    rawModel && rawModel.toLowerCase() !== 'unknown'
      ? rawModel
      : isGlacier
        ? 'GLACIER'
        : 'EcoFlow Device';
  const name = String(device.name ?? '').trim() || `EcoFlow ${model}`;
  const productType = normalizeEcoFlowProductType(
    isGlacier
      ? 'refrigerator'
      : `${device.productType ?? ''} ${device.model ?? ''} ${device.name ?? ''}`,
  );

  return {
    id: deviceId,
    name,
    displayName: name,
    model,
    provider: 'ecoflow',
    providerId: 'ecoflow',
    source: 'api',
    brand: 'EcoFlow',
    category: productType,
    rssi: -45,
    modelDisplayName: isGlacier ? 'EcoFlow Glacier Refrigerator' : model,
    discoveredAt: typeof device.lastSeenAt === 'number' ? device.lastSeenAt : now,
    productType,
    connectionType: 'api',
    requiresNativeBluetooth: false,
    connectableViaCloud: true,
    isOnline: typeof device.online === 'boolean' ? device.online : null,
    available: typeof device.online === 'boolean' ? device.online : null,
    sourceIds: {
      api: deviceId,
    },
    raw: {
      ...device,
      brand: 'EcoFlow',
      productType,
      providerId: 'ecoflow',
      connectionType: 'api',
      requiresNativeBluetooth: false,
      connectableViaCloud: true,
      isOnline: typeof device.online === 'boolean' ? device.online : null,
      sourceIds: {
        api: deviceId,
      },
      source: 'ecoflow_edge_function',
    },
  };
}

export async function discoverEcoFlowDevicesForUnifiedScanner(
  provider: EcoFlowScannerDiscoveryProvider = new EcoFlowCloudProvider(),
): Promise<EcoFlowScannerDevice[]> {
  logEcoFlowScanDebug('edge_function_start', {
    function: 'ecoflow',
    action: 'devices',
  });

  try {
    const catalogDevices = await provider.listDevices();
    logEcoFlowScanDebug('edge_function_success', {
      function: 'ecoflow',
      action: 'devices',
      rawCount: catalogDevices.length,
    });

    const now = Date.now();
    const normalized = catalogDevices
      .map((device) => normalizeEcoFlowScannerDevice(device, now))
      .filter((device): device is EcoFlowScannerDevice => device != null);

    logEcoFlowScanDebug('device_count', {
      count: normalized.length,
      rawCount: catalogDevices.length,
    });

    for (const device of normalized) {
      if (device.productType === 'refrigerator' || /glacier/i.test(`${device.name} ${device.model}`)) {
        logEcoFlowScanDebug('glacier_detected', {
          deviceId: device.id,
          name: device.name,
          model: device.model,
          productType: device.productType,
        });
      }
    }

    return normalized;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorSource = classifyEcoFlowCloudErrorSource(err);
    logEcoFlowScanWarn('edge_function_error', {
      error: error.message,
      errorSource,
    });
    throw new EcoFlowCloudDiscoveryError(error.message, errorSource);
  }
}
