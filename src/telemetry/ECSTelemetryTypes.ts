export type ECSTelemetrySourceType = 'power_device' | 'obd2' | 'utility_sensor';

export type ECSTelemetryQuality =
  | 'live'
  | 'stale'
  | 'error'
  | 'unavailable';

export type ECSTelemetryTransport =
  | 'ble'
  | 'classic_bluetooth'
  | 'cloud'
  | 'wifi'
  | 'gateway'
  | 'internal'
  | 'unknown';

export type ECSTelemetryValue = number | string | boolean | null;

export interface ECSTelemetryEvent {
  sourceDeviceId: string;
  sourceDeviceName?: string | null;
  sourceType: ECSTelemetrySourceType;
  provider: string;
  providerLabel?: string | null;
  metricKey: string;
  label?: string | null;
  value: ECSTelemetryValue;
  unit: string | null;
  timestamp: number;
  quality: ECSTelemetryQuality;
  transport: ECSTelemetryTransport;
  errorSource?: 'native_ble' | 'cloud_auth' | 'parser' | 'permission' | 'transport' | 'app_state' | null;
  errorMessage?: string | null;
}

export interface ECSTelemetryMetricSnapshot extends ECSTelemetryEvent {
  staleAt: number | null;
}

export interface ECSTelemetryDeviceSnapshot {
  sourceDeviceId: string;
  sourceDeviceName: string | null;
  sourceType: ECSTelemetrySourceType;
  provider: string;
  providerLabel: string | null;
  transport: ECSTelemetryTransport;
  latestTimestamp: number | null;
  quality: ECSTelemetryQuality;
  metrics: Record<string, ECSTelemetryMetricSnapshot>;
}

export interface ECSTelemetrySnapshot {
  devices: ECSTelemetryDeviceSnapshot[];
  updatedAt: number | null;
}

export interface ECSPowerTelemetryDeviceReading {
  deviceId: string;
  deviceName: string;
  provider: string;
  providerLabel: string;
  transport: ECSTelemetryTransport;
  quality: ECSTelemetryQuality;
  lastUpdated: number;
  batteryPercent: number | null;
  capacityWh: number | null;
  inputWatts: number | null;
  inputVolts: number | null;
  inputAmps: number | null;
  outputWatts: number | null;
  outputVolts: number | null;
  outputAmps: number | null;
  solarWatts: number | null;
  temperatureCelsius: number | null;
  estimatedRuntimeMinutes: number | null;
  batteryVolts: number | null;
  batteryAmps: number | null;
  batteryWatts: number | null;
  acOutputWatts: number | null;
  dcOutputWatts: number | null;
  signalStrength: number | null;
  isLive: boolean;
  isStale: boolean;
}

export interface ECSUtilitySensorTelemetryReading {
  deviceId: string;
  deviceName: string;
  provider: string;
  providerLabel: string;
  transport: ECSTelemetryTransport;
  quality: ECSTelemetryQuality;
  lastUpdated: number;
  category: string | null;
  profileId: string | null;
  linkState: string | null;
  levelPercent: number | null;
  signalStrength: number | null;
  parserStatus: string | null;
  isLive: boolean;
  isStale: boolean;
}

