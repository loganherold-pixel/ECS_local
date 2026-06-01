/**
 * useEcoFlowLive — hybrid EcoFlow live telemetry hook.
 *
 * Fixes:
 *   - Uses EcoFlowCloudProvider as the primary live telemetry path
 *   - Falls back to BLU authority when cloud telemetry is unavailable
 *   - Syncs device selection into powerDeviceStore so selected-device polling works
 *   - Keeps legacy hook shape for existing ECS widgets
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { bluPowerAuthority, type BluAuthoritySnapshot } from './BluPowerAuthority';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { ecoFlowBluAdapter } from './EcoFlowBluAdapter';
import { EcoFlowCloudProvider } from '../src/power/cloud/providers/EcoFlowCloudProvider';
import { powerDeviceStore } from '../src/power/devices/PowerDeviceStore';
import {
  getSelectedEcoFlowDevice as readSelectedEcoFlowDevice,
  getSelectedEcoFlowDeviceName as readSelectedEcoFlowDeviceName,
  setSelectedEcoFlowDevice as persistSelectedEcoFlowDevice,
} from './ecoFlowSelectionStore';

// ── Persistent storage ──────────────────────────────────────

const DEVICE_KEY = 'ecs_ecoflow_selected_device';
const DEVICE_NAME_KEY = 'ecs_ecoflow_selected_device_name';
const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      /* noop */
    }
  }
  return memoryStore[key] ?? null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* noop */
    }
  }
  memoryStore[key] = value;
}

function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
  delete memoryStore[key];
}

// ── Public helpers for device selection ──────────────────────

export function getSelectedEcoFlowDevice(): string | null {
  return readSelectedEcoFlowDevice();
}

export function getSelectedEcoFlowDeviceName(): string | null {
  return readSelectedEcoFlowDeviceName();
}

export function setSelectedEcoFlowDevice(
  deviceId: string | null,
  deviceName: string | null = null,
): void {
  persistSelectedEcoFlowDevice(deviceId, deviceName);
}

// ── Hook types ──────────────────────────────────────────────

export type EcoFlowStatus = 'standby' | 'live' | 'degraded' | 'offline';

export interface EcoFlowLiveData {
  status: EcoFlowStatus;
  batteryPct: number | null;
  solarWatts: number | null;
  outputWatts: number | null;
  inputWatts: number | null;
  deviceName: string | null;
  selectedDeviceId: string | null;
  lastUpdatedAt: number | null;
  updatedAgoText: string | null;
  error: string | null;
  errorCode: string | null;
  isBackoff: boolean;
  reconnect: () => void;
  refresh: () => void;
  version: number;
  netWatts: number | null;
  avgOutputWatts: number | null;
  avgSolarWatts: number | null;
  enduranceText: string | null;
  sampleCount: number;
}

type CloudTelemetryLike = {
  timestamp?: number;
  battery?: {
    socPct?: number;
    volts?: number;
    wattsIn?: number;
    wattsOut?: number;
    tempC?: number;
    estRuntimeMin?: number;
  };
  solar?: {
    watts?: number;
  };
  flags?: {
    stale?: boolean;
    charging?: boolean;
  };
  device?: {
    id?: string;
    vendor?: string;
    model?: string;
  };
} | null;

type PerDeviceTelemetry = {
  deviceId: string;
  name?: string;
  model?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  ok: boolean;
  pendingApproval: boolean;
  error: string | null;
  polledAt: number;
};

const CLOUD_CONNECT_TOKEN = 'CLOUD';
const CLOUD_POLL_INTERVAL_MS = 15000;
const CLOUD_CATALOG_REFRESH_MS = 60000;

function formatAgo(epochMs: number | null): string | null {
  if (epochMs == null) return null;
  const diffMs = Date.now() - epochMs;
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function deriveStatus(
  hasSelectedDevice: boolean,
  snapshot: BluAuthoritySnapshot,
  hasEcoFlowTelemetry: boolean,
  hasCloudTelemetry: boolean,
  cloudStale: boolean,
  cloudError: string | null,
): EcoFlowStatus {
  if (!hasSelectedDevice && !snapshot.providers.ecoflow.hasDevices && !hasCloudTelemetry) {
    return 'standby';
  }
  if (hasCloudTelemetry) {
    return cloudStale ? 'degraded' : 'live';
  }
  if (snapshot.activeProvider === 'ecoflow') {
    if (snapshot.freshness === 'live') return 'live';
    if (
      snapshot.freshness === 'reconnecting' ||
      snapshot.freshness === 'stale' ||
      snapshot.freshness === 'last_known'
    ) {
      return 'degraded';
    }
  }
  if (hasEcoFlowTelemetry) return 'degraded';
  if (cloudError) return 'offline';
  return 'offline';
}

function findSelectedEcoFlowDevice(selectedDeviceId: string | null) {
  const all = bluDeviceRegistry.getByProvider('ecoflow');
  const selected = selectedDeviceId
    ? all.find((device) => device.device_id === selectedDeviceId) ?? null
    : null;
  const primary = all.find((device) => device.is_primary) ?? null;
  return {
    all,
    selected,
    primary,
    resolved: selected ?? primary ?? all[0] ?? null,
  };
}

function computeEnduranceText(
  batteryPct: number | null,
  inputWatts: number | null,
  outputWatts: number | null,
  runtimeMinutes: number | null,
): string | null {
  const inW = inputWatts ?? 0;
  const outW = outputWatts ?? 0;
  if (batteryPct == null && runtimeMinutes == null) return null;
  if (inW > 0 && inW >= outW) return 'Charging';
  if (runtimeMinutes != null && runtimeMinutes > 0) {
    if (runtimeMinutes >= 60) {
      const h = Math.floor(runtimeMinutes / 60);
      const m = runtimeMinutes % 60;
      return m > 0 ? `~${h}h ${m}m remaining` : `~${h}h remaining`;
    }
    return `~${runtimeMinutes}m remaining`;
  }
  if (batteryPct != null && batteryPct <= 20) return 'Below reserve';
  return null;
}

function resolveSelectedPerDeviceTelemetry(
  selectedDeviceId: string | null,
  perDevice: PerDeviceTelemetry[],
): PerDeviceTelemetry | null {
  if (selectedDeviceId) {
    const exact = perDevice.find((entry) => entry.deviceId === selectedDeviceId);
    if (exact) return exact;
  }
  return perDevice.find((entry) => entry.ok) ?? perDevice[0] ?? null;
}

export function useEcoFlowLive(): EcoFlowLiveData {
  const cloudProviderRef = useRef(new EcoFlowCloudProvider());
  const cloudConnectDeviceIdRef = useRef<string | null>(null);
  const cloudCatalogRef = useRef<{
    fetchedAt: number;
    devices: Awaited<ReturnType<EcoFlowCloudProvider['listDevices']>>;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<BluAuthoritySnapshot>(() =>
    bluPowerAuthority.getSnapshot(),
  );
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(() =>
    getSelectedEcoFlowDevice(),
  );
  const [version, setVersion] = useState(0);
  const [agoTick, setAgoTick] = useState(0);

  const [cloudTelemetry, setCloudTelemetry] = useState<CloudTelemetryLike>(null);
  const [cloudPerDevice, setCloudPerDevice] = useState<PerDeviceTelemetry[]>([]);
  const [cloudDeviceName, setCloudDeviceName] = useState<string | null>(getSelectedEcoFlowDeviceName());
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudErrorCode, setCloudErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const offAuthority = bluPowerAuthority.subscribe((next) => {
      setSnapshot(next);
      setVersion((value) => value + 1);
    });

    const offRegistry = bluDeviceRegistry.subscribe(() => {
      const persisted = getSelectedEcoFlowDevice();
      setSelectedDeviceIdState(persisted);
      setVersion((value) => value + 1);
    });

    return () => {
      offAuthority();
      offRegistry();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setAgoTick((value) => value + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const refreshCloudTelemetry = useCallback(async () => {
    const provider = cloudProviderRef.current;

    let persistedId = getSelectedEcoFlowDevice();
    let persistedName = getSelectedEcoFlowDeviceName();
    let selectedFromStore: string[] = [];

    try {
      selectedFromStore = await powerDeviceStore.getSelected('EcoFlow');
      if ((!persistedId || selectedFromStore.includes(persistedId) === false) && selectedFromStore.length > 0) {
        persistedId = selectedFromStore[0];
      }
    } catch {
      /* noop */
    }

    // Only refresh the cloud catalog when selection metadata is missing. Live
    // telemetry polling should not re-list the full account catalog every tick.
    try {
      let catalog = cloudCatalogRef.current?.devices ?? [];
      const catalogIsFresh =
        !!cloudCatalogRef.current &&
        Date.now() - cloudCatalogRef.current.fetchedAt < CLOUD_CATALOG_REFRESH_MS;
      if ((!persistedId || !persistedName) && !catalogIsFresh) {
        catalog = await provider.listDevices();
        cloudCatalogRef.current = { fetchedAt: Date.now(), devices: catalog };
      }
      if (!persistedId && catalog.length > 0) {
        persistedId = catalog[0].deviceId;
        persistedName = catalog[0].name ?? catalog[0].model ?? 'EcoFlow';
        setSelectedEcoFlowDevice(persistedId, persistedName);
      } else if (persistedId && !persistedName) {
        const match = catalog.find((device) => device.deviceId === persistedId);
        if (match) {
          persistedName = match.name ?? match.model ?? persistedName ?? 'EcoFlow';
          setSelectedEcoFlowDevice(persistedId, persistedName);
        }
      }
    } catch {
      /* noop */
    }

    setSelectedDeviceIdState(persistedId ?? null);
    setCloudDeviceName(persistedName ?? null);

    if (!persistedId) {
      setCloudTelemetry(null);
      setCloudPerDevice([]);
      setCloudError(null);
      setCloudErrorCode(null);
      setVersion((value) => value + 1);
      return;
    }

    try {
      // Keep the cloud provider pinned to the selected EcoFlow device.
      if (selectedFromStore.length !== 1 || selectedFromStore[0] !== persistedId) {
        await powerDeviceStore.setSelected('EcoFlow', [persistedId]);
      }
      const activeDeviceIds = provider.getActiveDeviceIds();
      const needsConnect =
        !provider.isConnected() ||
        cloudConnectDeviceIdRef.current !== persistedId ||
        activeDeviceIds.length !== 1 ||
        activeDeviceIds[0] !== persistedId;
      if (needsConnect) {
        await provider.connect(persistedId, CLOUD_CONNECT_TOKEN);
        cloudConnectDeviceIdRef.current = persistedId;
      }
      const nextTelemetry = await provider.pollOnce();
      const perDevice = provider.getPerDeviceTelemetry();

      setCloudTelemetry((nextTelemetry ?? null) as CloudTelemetryLike);
      setCloudPerDevice(perDevice);

      const selectedEntry = resolveSelectedPerDeviceTelemetry(persistedId, perDevice);
      if (selectedEntry?.name || selectedEntry?.model) {
        const nextName = selectedEntry.name ?? selectedEntry.model ?? persistedName ?? 'EcoFlow';
        setCloudDeviceName(nextName);
        setSelectedEcoFlowDevice(persistedId, nextName);
      }

      setCloudError(null);
      setCloudErrorCode(null);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'EcoFlow cloud poll failed');
      setCloudErrorCode('ECOFLOW_CLOUD_POLL_FAILED');
      setCloudPerDevice(provider.getPerDeviceTelemetry());
    } finally {
      setVersion((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    void refreshCloudTelemetry();
  }, [refreshCloudTelemetry]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshCloudTelemetry();
    }, CLOUD_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCloudTelemetry]);

  const ecoDeviceState = useMemo(
    () => findSelectedEcoFlowDevice(selectedDeviceId),
    [selectedDeviceId, snapshot.providers.ecoflow.deviceCount, version],
  );

  const bluEcoTelemetry = useMemo(() => {
    const primary = snapshot.primaryTelemetry;
    if (snapshot.activeProvider === 'ecoflow' && primary?.provider === 'ecoflow') {
      return primary;
    }

    const adapterTelemetry = ecoFlowBluAdapter.getLastTelemetry?.() ?? null;
    if (adapterTelemetry?.provider === 'ecoflow') {
      return adapterTelemetry;
    }

    const latest = snapshot.latestTelemetry;
    if (latest?.provider === 'ecoflow') {
      return latest;
    }

    return null;
  }, [snapshot]);

  const selectedCloudTelemetry = useMemo(() => {
    const selectedEntry = resolveSelectedPerDeviceTelemetry(selectedDeviceId, cloudPerDevice);
    if (!selectedEntry) return null;
    return {
      batteryPct: selectedEntry.socPct ?? null,
      solarWatts: selectedEntry.solarWatts ?? null,
      outputWatts: selectedEntry.wattsOut ?? null,
      inputWatts: selectedEntry.wattsIn ?? null,
      lastUpdatedAt: selectedEntry.polledAt ?? null,
      deviceName: selectedEntry.name ?? selectedEntry.model ?? null,
    };
  }, [selectedDeviceId, cloudPerDevice]);

  const cloudStale = Boolean(cloudTelemetry?.flags?.stale);

  const status = useMemo(
    () =>
      deriveStatus(
        Boolean(selectedDeviceId),
        snapshot,
        Boolean(bluEcoTelemetry),
        Boolean(cloudTelemetry),
        cloudStale,
        cloudError,
      ),
    [selectedDeviceId, snapshot, bluEcoTelemetry, cloudTelemetry, cloudStale, cloudError],
  );

  const batteryPct =
    selectedCloudTelemetry?.batteryPct ??
    cloudTelemetry?.battery?.socPct ??
    bluEcoTelemetry?.battery_percent ??
    null;

  const solarWatts =
    selectedCloudTelemetry?.solarWatts ??
    cloudTelemetry?.solar?.watts ??
    bluEcoTelemetry?.solar_input_watts ??
    null;

  const outputWatts =
    selectedCloudTelemetry?.outputWatts ??
    cloudTelemetry?.battery?.wattsOut ??
    bluEcoTelemetry?.output_watts ??
    null;

  const inputWatts =
    selectedCloudTelemetry?.inputWatts ??
    cloudTelemetry?.battery?.wattsIn ??
    bluEcoTelemetry?.input_watts ??
    null;

  const lastUpdatedAt =
    selectedCloudTelemetry?.lastUpdatedAt ??
    cloudTelemetry?.timestamp ??
    bluEcoTelemetry?.timestamp ??
    null;

  const updatedAgoText = formatAgo(lastUpdatedAt);

  const netWatts = useMemo(() => {
    if (inputWatts == null || outputWatts == null) return null;
    return inputWatts - outputWatts;
  }, [inputWatts, outputWatts]);

  const avgOutputWatts = outputWatts;
  const avgSolarWatts = solarWatts;
  const enduranceText = computeEnduranceText(
    batteryPct,
    inputWatts,
    outputWatts,
    cloudTelemetry?.battery?.estRuntimeMin ??
      bluEcoTelemetry?.estimated_runtime_minutes ??
      null,
  );

  const reconnect = useCallback(async () => {
    try {
      await ecoFlowBluAdapter.connect();
    } catch {
      /* noop */
    }
    await refreshCloudTelemetry();
  }, [refreshCloudTelemetry]);

  const refresh = useCallback(async () => {
    const persisted = getSelectedEcoFlowDevice();
    setSelectedDeviceIdState(persisted);

    try {
      const selectedFromStore = await powerDeviceStore.getSelected('EcoFlow');
      if (!persisted && selectedFromStore.length > 0) {
        setSelectedEcoFlowDevice(selectedFromStore[0], getSelectedEcoFlowDeviceName());
        setSelectedDeviceIdState(selectedFromStore[0]);
      }
    } catch {
      /* noop */
    }

    const device = findSelectedEcoFlowDevice(persisted).resolved;
    if (device) {
      await bluDeviceRegistry.setPrimary('ecoflow', device.device_id);
    }

    try {
      if (snapshot.providers.ecoflow.connectionState === 'connected') {
        await ecoFlowBluAdapter.refreshDevices?.();
      }
    } catch {
      /* noop */
    }

    await refreshCloudTelemetry();
  }, [snapshot.providers.ecoflow.connectionState, refreshCloudTelemetry]);

  const persistedDeviceName = getSelectedEcoFlowDeviceName();

  const deviceName =
    selectedCloudTelemetry?.deviceName ??
    ecoDeviceState.resolved?.display_name ??
    cloudDeviceName ??
    snapshot.deviceLabel ??
    persistedDeviceName ??
    'EcoFlow';

  const error = (() => {
    if (status === 'standby') return null;
    if (cloudError) return cloudError;
    if (snapshot.activeProvider === 'ecoflow' && snapshot.connectionState === 'error') {
      return 'EcoFlow connection error';
    }
    if (status === 'offline') return 'EcoFlow unavailable';
    return null;
  })();

  const errorCode = (() => {
    if (cloudErrorCode) return cloudErrorCode;
    if (snapshot.activeProvider === 'ecoflow' && snapshot.connectionState === 'error') {
      return 'ECOFLOW_CONNECTION_ERROR';
    }
    return null;
  })();

  void agoTick;

  return {
    status,
    batteryPct,
    solarWatts,
    outputWatts,
    inputWatts,
    deviceName,
    selectedDeviceId: selectedDeviceId ?? ecoDeviceState.resolved?.device_id ?? null,
    lastUpdatedAt,
    updatedAgoText,
    error,
    errorCode,
    isBackoff: snapshot.providers.ecoflow.isReconnecting,
    reconnect,
    refresh,
    version,
    netWatts,
    avgOutputWatts,
    avgSolarWatts,
    enduranceText,
    sampleCount: cloudPerDevice.length > 0 ? cloudPerDevice.length : bluEcoTelemetry ? 1 : 0,
  };
}

export default useEcoFlowLive;
