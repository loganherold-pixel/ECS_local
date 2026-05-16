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

export const ankerSolixAdapter: PowerAdapter = {
  providerId: "anker_solix",
  displayName: "Anker SOLIX",
  discover: async () => [],
  connect: async () => {
    throw new Error("Anker SOLIX Bluetooth must be connected through the unified scanner.");
  },
  disconnect: async () => {},
  readTelemetry: async () => null,
  getCapabilities: () => capabilities,
};
