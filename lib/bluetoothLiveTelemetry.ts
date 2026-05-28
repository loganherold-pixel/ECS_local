export type BluetoothTelemetrySource =
  | 'ble_live'
  | 'provider_cloud'
  | 'cache'
  | 'unavailable'
  | 'mock_dev';

export interface BluetoothTelemetryEnvelope<T = unknown> {
  source: BluetoothTelemetrySource;
  updatedAt: number | null;
  isLive: boolean;
  deviceId: string | null;
  provider: string | null;
  telemetry: T | null;
}

export const BLUETOOTH_TELEMETRY_SOURCE_LABELS: Record<BluetoothTelemetrySource, string> = {
  ble_live: 'Live Bluetooth',
  provider_cloud: 'Provider Cloud',
  cache: 'Last Known',
  unavailable: 'Unavailable',
  mock_dev: 'Dev Mock',
};

const MOCK_FLAG_NAME = 'EXPO_PUBLIC_ECS_ENABLE_MOCK_BLUETOOTH';

function readEnvFlag(name: string): string | null {
  try {
    const value = typeof process !== 'undefined' ? process.env?.[name] : undefined;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function isDevMockTelemetryAllowed(): boolean {
  const envValue = readEnvFlag(MOCK_FLAG_NAME);
  if (envValue) {
    return /^(1|true|yes|on)$/i.test(envValue.trim());
  }

  try {
    return (globalThis as { __ECS_ENABLE_MOCK_BLUETOOTH__?: boolean }).__ECS_ENABLE_MOCK_BLUETOOTH__ === true;
  } catch {
    return false;
  }
}

export function normalizeBluetoothTelemetrySource(
  source: unknown,
  fallback: BluetoothTelemetrySource = 'unavailable',
): BluetoothTelemetrySource {
  if (
    source === 'ble_live' ||
    source === 'provider_cloud' ||
    source === 'cache' ||
    source === 'unavailable' ||
    source === 'mock_dev'
  ) {
    return source;
  }
  return fallback;
}

export function getBluetoothTelemetrySourceLabel(source: unknown): string {
  return BLUETOOTH_TELEMETRY_SOURCE_LABELS[normalizeBluetoothTelemetrySource(source)];
}

export function isBluetoothSourceLive(source: unknown): boolean {
  const normalized = normalizeBluetoothTelemetrySource(source);
  return normalized === 'ble_live' || normalized === 'provider_cloud';
}

export function shouldAcceptBluetoothTelemetry(source: unknown): boolean {
  return normalizeBluetoothTelemetrySource(source) !== 'mock_dev' || isDevMockTelemetryAllowed();
}

export function inferBluetoothTelemetrySource(
  telemetry: {
    source?: unknown;
    provider?: string | null;
    device_id?: string | null;
    deviceId?: string | null;
    raw?: Record<string, unknown> | null;
  },
  fallback: BluetoothTelemetrySource = 'ble_live',
): BluetoothTelemetrySource {
  const explicit = normalizeBluetoothTelemetrySource(telemetry.source, 'unavailable');
  if (explicit !== 'unavailable') return explicit;

  const deviceId = String(telemetry.device_id ?? telemetry.deviceId ?? '').toLowerCase();
  const raw = telemetry.raw ?? null;
  if (
    deviceId.includes('sim') ||
    raw?.simulated === true ||
    raw?.mock === true ||
    raw?.demo === true
  ) {
    return 'mock_dev';
  }

  if (telemetry.provider === 'ecoflow') {
    return 'provider_cloud';
  }

  return fallback;
}

export function hasDecodedBluetoothTelemetryMetrics(telemetry: Record<string, unknown>): boolean {
  const metricKeys = [
    'battery_percent',
    'input_watts',
    'output_watts',
    'battery_watts',
    'estimated_runtime_minutes',
    'solar_input_watts',
    'ac_output_watts',
    'dc_output_watts',
    'temperature_celsius',
    'battery_volts',
    'battery_amps',
    'charge_cycles',
    'health_percent',
    'ac_input_watts',
    'capacity_wh',
  ];

  return metricKeys.some((key) => {
    const value = telemetry[key];
    return typeof value === 'number' && Number.isFinite(value);
  });
}
