import { EcoFlowCloudProvider } from "../../../power/cloud/providers/EcoFlowCloudProvider";
import { powerDeviceStore } from "../../../power/devices/PowerDeviceStore";
import type { PowerDevice as CatalogPowerDevice } from "../../../power/types/PowerDevice";
import type {
  PowerAdapter,
  PowerAdapterCapabilities,
  PowerDeviceCatalogEntry,
  PowerDiscoveredDevice,
  PowerTelemetry,
} from "../types/powerTypes";
import { normalizeFeaturePowerTelemetry } from "../services/powerTruthService";

type EcoFlowPerDeviceTelemetry = {
  deviceId: string;
  name?: string;
  model?: string;
  productType?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  tempC?: number;
  estRuntimeMin?: number;
  ok?: boolean;
  pendingApproval?: boolean;
  unauthorized?: boolean;
  error?: string | null;
  polledAt?: number;
};

const ecoFlowProvider = new EcoFlowCloudProvider();

const ecoFlowCapabilities: PowerAdapterCapabilities = {
  supportsLiveTelemetry: true,
  supportsControl: false,
  supportsBle: true,
  supportsCloud: true,
  supportsBatteryPercent: true,
  supportsInputWatts: true,
  supportsOutputWatts: true,
  supportsRuntimeEstimate: true,
};

function normalizeCatalogDevice(device: CatalogPowerDevice | Record<string, unknown>): PowerDeviceCatalogEntry | null {
  const record = device as Record<string, unknown>;
  const rawId = record.deviceId ?? record.id;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) return null;
  const rawName = record.name ?? record.deviceName;
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : id;
  const rawModel = record.model;
  const rawProductType = record.productType;
  return {
    id,
    name,
    online: Boolean(record.online),
    model: typeof rawModel === "string" ? rawModel : undefined,
    productType: typeof rawProductType === "string" ? rawProductType : undefined,
  };
}

function normalizePerDeviceTelemetry(reading: EcoFlowPerDeviceTelemetry): PowerTelemetry {
  const lastUpdatedAt = typeof reading.polledAt === "number" ? reading.polledAt : Date.now();
  const stale = reading.ok === false || reading.pendingApproval === true || reading.unauthorized === true;
  const sourceTruth = stale ? "cached" : "live_provider";
  return normalizeFeaturePowerTelemetry(
    {
      batteryPercent: reading.socPct,
      inputWatts: reading.wattsIn,
      outputWatts: reading.wattsOut,
      solarWatts: reading.solarWatts,
      temperatureC: reading.tempC,
      estimatedRuntimeMinutes: reading.estRuntimeMin,
    },
    {
      sourceTruth,
      providerId: "ecoflow",
      deviceId: reading.deviceId,
      deviceName: reading.name ?? reading.model,
      lastUpdatedAt,
      freshnessMs: Math.max(0, Date.now() - lastUpdatedAt),
      confidence: stale ? 0.55 : 0.95,
      isLive: !stale,
      isStale: stale,
      isManual: false,
      isSimulated: false,
      reason:
        reading.error ??
        (reading.pendingApproval
          ? "EcoFlow cloud access is pending approval."
          : reading.unauthorized
            ? "EcoFlow cloud access is not authorized for this device."
            : "EcoFlow provider telemetry."),
    },
  );
}

export async function listEcoFlowPowerDevices(): Promise<PowerDeviceCatalogEntry[]> {
  const devices = await ecoFlowProvider.listDevices();
  return devices.map(normalizeCatalogDevice).filter(Boolean) as PowerDeviceCatalogEntry[];
}

export function getEcoFlowPerDeviceTelemetry(): PowerDiscoveredDevice[] {
  return ecoFlowProvider.getPerDeviceTelemetry().map((reading: EcoFlowPerDeviceTelemetry) => ({
    id: reading.deviceId,
    providerId: "ecoflow",
    name: reading.name ?? reading.model ?? reading.deviceId,
    model: reading.model,
    productType: reading.productType,
    online: reading.ok !== false,
    source: "cloud",
    telemetry: normalizePerDeviceTelemetry(reading),
  }));
}

export async function getSelectedEcoFlowPowerDeviceIds(): Promise<string[]> {
  return powerDeviceStore.getSelected("EcoFlow");
}

export async function setSelectedEcoFlowPowerDevice(deviceId: string | null): Promise<void> {
  if (deviceId) {
    await powerDeviceStore.setSelected("EcoFlow", [deviceId]);
    return;
  }
  await powerDeviceStore.clearSelected("EcoFlow");
}

export const ecoflowAdapter: PowerAdapter = {
  providerId: "ecoflow",
  displayName: "EcoFlow",
  discover: async () =>
    (await listEcoFlowPowerDevices()).map((device) => ({
      id: device.id,
      providerId: "ecoflow",
      name: device.name,
      online: device.online,
      model: device.model,
      productType: device.productType,
      source: "cloud",
      telemetry: device.telemetry,
    })),
  connect: async (deviceId: string) => {
    await setSelectedEcoFlowPowerDevice(deviceId);
  },
  disconnect: async () => {
    await setSelectedEcoFlowPowerDevice(null);
  },
  readTelemetry: async (deviceId?: string) => {
    const readings = getEcoFlowPerDeviceTelemetry();
    const match = deviceId ? readings.find((reading) => reading.id === deviceId) : readings[0];
    return match?.telemetry ?? null;
  },
  getCapabilities: () => ecoFlowCapabilities,
};
