import type {
  PowerSourceTruth,
  PowerTelemetryProviderId,
  PowerTelemetryTruth,
} from "../../../power/types/PowerTelemetry";

export type {
  PowerSourceTruth,
  PowerTelemetryProviderId,
  PowerTelemetryTruth,
} from "../../../power/types/PowerTelemetry";

export type PowerAdapterProviderId = PowerTelemetryProviderId;

export type PowerAdapterCapabilityKey =
  | "supportsLiveTelemetry"
  | "supportsControl"
  | "supportsBle"
  | "supportsCloud"
  | "supportsBatteryPercent"
  | "supportsInputWatts"
  | "supportsOutputWatts"
  | "supportsRuntimeEstimate";

export type PowerAdapterCapabilities = Record<PowerAdapterCapabilityKey, boolean>;

export type PowerTelemetry = {
  batteryPercent?: number;
  capacityWh?: number;
  inputWatts?: number;
  outputWatts?: number;
  solarWatts?: number;
  acOutputEnabled?: boolean;
  dcOutputEnabled?: boolean;
  usbOutputEnabled?: boolean;
  temperatureC?: number;
  estimatedRuntimeMinutes?: number;
  truth: PowerTelemetryTruth;
};

export type PowerDiscoveredDevice = {
  id: string;
  providerId: PowerTelemetryProviderId;
  name: string;
  online?: boolean;
  model?: string;
  productType?: string;
  signalStrength?: number;
  source?: "cloud" | "ble" | "manual" | "cached";
  telemetry?: PowerTelemetry;
};

export type PowerAdapter = {
  providerId: PowerTelemetryProviderId;
  displayName: string;
  discover: () => Promise<PowerDiscoveredDevice[]>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: (deviceId?: string) => Promise<void>;
  readTelemetry: (deviceId?: string) => Promise<PowerTelemetry | null>;
  getCapabilities: () => PowerAdapterCapabilities;
};

export type PowerDeviceCatalogEntry = {
  id: string;
  name: string;
  online: boolean;
  model?: string;
  productType?: string;
  telemetry?: PowerTelemetry;
};
