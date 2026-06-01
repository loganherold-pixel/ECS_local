import type { PowerAdapter, PowerAdapterCapabilities } from "../types/powerTypes";

const capabilities: PowerAdapterCapabilities = {
  supportsLiveTelemetry: false,
  supportsControl: false,
  supportsBle: false,
  supportsCloud: false,
  supportsBatteryPercent: false,
  supportsInputWatts: false,
  supportsOutputWatts: false,
  supportsRuntimeEstimate: false,
};

export const bluettiAdapter: PowerAdapter = {
  providerId: "bluetti",
  displayName: "BLUETTI",
  discover: async () => [],
  connect: async () => {
    throw new Error("BLUETTI Bluetooth must be connected through the unified scanner.");
  },
  disconnect: async () => {},
  readTelemetry: async () => null,
  getCapabilities: () => capabilities,
};
