export type ECSTelemetrySourceType =
  | 'obd_live'
  | 'ble_live'
  | 'device_sensor'
  | 'blu_power_live'
  | 'manual'
  | 'cached'
  | 'simulated'
  | 'unavailable';

export type ECSTelemetryFreshness =
  | 'live'
  | 'recent'
  | 'stale'
  | 'offline'
  | 'unknown';

export type ECSTelemetryConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unverified';

export type ECSTelemetryWarningSeverity =
  | 'info'
  | 'watch'
  | 'warning'
  | 'critical';

export type LegacyVehicleTelemetrySource =
  | 'bluetooth_obd_live'
  | 'native_vehicle_live'
  | 'manual'
  | 'cache'
  | 'unavailable'
  | 'mock_dev';

export type VehicleTelemetryWarning = {
  id: string;
  message: string;
  severity: ECSTelemetryWarningSeverity;
  source?: string;
};

export type VehicleTelemetrySnapshot = {
  /** Canonical ECS telemetry source truth. UI should key live badges from this plus freshness, not from raw numbers. */
  sourceType: ECSTelemetrySourceType;
  sourceLabel: string;
  freshness: ECSTelemetryFreshness;
  confidence: ECSTelemetryConfidence;
  updatedAt: string | null;

  /** Legacy source alias kept while existing widgets migrate to sourceType. */
  source: LegacyVehicleTelemetrySource;
  /** Legacy live alias. Prefer sourceType + freshness for new consumers. */
  isLive: boolean;
  deviceId?: string | null;

  speedMph: number | null;
  rpm: number | null;
  coolantTempF: number | null;
  intakeTempF: number | null;
  engineLoadPct: number | null;
  throttlePct: number | null;
  batteryVoltage: number | null;
  fuelLevelPct: number | null;
  rangeMiles: number | null;
  oilTempF: number | null;
  transmissionTempF: number | null;
  tirePressuresPsi?: [number | null, number | null, number | null, number | null] | null;
  tireTempsF?: [number | null, number | null, number | null, number | null] | null;

  pitchDeg: number | null;
  rollDeg: number | null;
  headingDeg: number | null;

  warnings: VehicleTelemetryWarning[];

  /** Legacy field aliases kept for existing dashboard/fleet/navigate surfaces. */
  fuelPercent?: number | null;
  engineLoadPercent?: number | null;
  throttlePercent?: number | null;
  diagnosticCodes?: string[];
  unsupportedReason?: string;
};

export type PowerTelemetrySourceType =
  | 'live_provider'
  | 'live_ble'
  | 'device_detected'
  | 'manual'
  | 'cached'
  | 'simulated'
  | 'unavailable';

export type PowerTelemetrySnapshot = {
  /** Canonical ECS power source truth. Power UI should never infer live state from wattage or battery values alone. */
  sourceType: PowerTelemetrySourceType;
  sourceLabel: string;
  freshness: ECSTelemetryFreshness;
  confidence: ECSTelemetryConfidence;
  updatedAt: string | null;
  providerId: string | null;
  deviceId: string | null;
  deviceName: string | null;

  batteryPercent: number | null;
  capacityWh: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarWatts: number | null;
  acOutputEnabled: boolean | null;
  dcOutputEnabled: boolean | null;
  usbOutputEnabled: boolean | null;
  temperatureC: number | null;
  estimatedRuntimeMinutes: number | null;

  isLive: boolean;
  isStale: boolean;
  isManual: boolean;
  isSimulated: boolean;
  warnings: VehicleTelemetryWarning[];
};

export const EMPTY_POWER_TELEMETRY_SNAPSHOT: PowerTelemetrySnapshot = {
  sourceType: 'unavailable',
  sourceLabel: 'Not connected',
  freshness: 'offline',
  confidence: 'unverified',
  updatedAt: null,
  providerId: null,
  deviceId: null,
  deviceName: null,
  batteryPercent: null,
  capacityWh: null,
  inputWatts: null,
  outputWatts: null,
  solarWatts: null,
  acOutputEnabled: null,
  dcOutputEnabled: null,
  usbOutputEnabled: null,
  temperatureC: null,
  estimatedRuntimeMinutes: null,
  isLive: false,
  isStale: false,
  isManual: false,
  isSimulated: false,
  warnings: [],
};
