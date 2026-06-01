import type { PowerAdapter, PowerAdapterCapabilities, PowerTelemetry } from "../types/powerTypes";
import { normalizeFeaturePowerTelemetry } from "../services/powerTruthService";

export type ManualPowerEstimate = Omit<Partial<PowerTelemetry>, "truth"> & {
  deviceName?: string;
  deviceId?: string;
  lastUpdatedAt?: number;
  reason?: string;
};

const manualCapabilities: PowerAdapterCapabilities = {
  supportsLiveTelemetry: false,
  supportsControl: false,
  supportsBle: false,
  supportsCloud: false,
  supportsBatteryPercent: true,
  supportsInputWatts: true,
  supportsOutputWatts: true,
  supportsRuntimeEstimate: true,
};

let manualEstimate: ManualPowerEstimate | null = null;

export function setManualPowerEstimate(estimate: ManualPowerEstimate | null): void {
  manualEstimate = estimate;
}

export const manualPowerAdapter: PowerAdapter = {
  providerId: "generic",
  displayName: "Manual Power",
  discover: async () => [],
  connect: async () => {},
  disconnect: async () => {
    manualEstimate = null;
  },
  readTelemetry: async () => {
    if (!manualEstimate) return null;
    const lastUpdatedAt = manualEstimate.lastUpdatedAt ?? Date.now();
    return normalizeFeaturePowerTelemetry(manualEstimate, {
      sourceTruth: "manual",
      providerId: "generic",
      deviceId: manualEstimate.deviceId,
      deviceName: manualEstimate.deviceName,
      lastUpdatedAt,
      freshnessMs: Math.max(0, Date.now() - lastUpdatedAt),
      confidence: 0.55,
      isLive: false,
      isStale: false,
      isManual: true,
      isSimulated: false,
      reason: manualEstimate.reason ?? "User-entered power estimate.",
    });
  },
  getCapabilities: () => manualCapabilities,
};

