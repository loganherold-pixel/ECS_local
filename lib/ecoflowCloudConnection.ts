import { EcoFlowCloudProvider } from '../src/power/cloud/providers/EcoFlowCloudProvider';
import type { PowerTelemetry } from '../src/power/types/PowerTelemetry';
import {
  bluLog,
  bluLogThrottled,
  buildBluConnectionAttemptLogDetails,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
} from './bluDiagnosticsLog';
import {
  recordEcoFlowConnectionPhase,
  recordEcoFlowFailure,
  recordEcoFlowTimeout,
} from './ecoflowConnectionDiagnostics';
import type { EcoFlowCloudClientState } from './ecoflowConnectionDiagnostics';
import { isEcoFlowUnauthorizedDeviceError } from './ecoflowUnauthorizedDevice';
import { normalizeEcoFlowTelemetryProductType } from './ecoflowBluTelemetryEligibility';
import {
  BluStreamLifecycle,
  DEFAULT_FIRST_PACKET_TIMEOUT_MS,
  DEFAULT_STALE_AFTER_MS,
  clearBluStreamHealthSnapshot,
  recordBluStreamHealthSnapshot,
} from './bluStreamLifecycle';
import {
  BLU_CLOUD_POLL_INTERVAL_MIN_MS,
  BLU_CLOUD_POLL_INTERVAL_MS,
} from './bluPerformanceConfig';

export const ECOFLOW_CLOUD_CONNECT_TOKEN = 'CLOUD';

export type EcoFlowCloudProductType =
  | 'refrigerator'
  | 'power_station'
  | 'charger'
  | 'portable_ac'
  | 'unknown'
  | string;

export interface EcoFlowCloudConnectionDevice {
  id?: string;
  rawId?: string;
  name?: string;
  model?: string | null;
  subtype?: string | null;
  category?: string | null;
  productType?: string | null;
  signalStrength?: number | null;
  raw?: Record<string, unknown> | null;
}

export interface EcoFlowPerDeviceTelemetry {
  deviceId: string;
  name?: string;
  model?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  ok: boolean;
  pendingApproval: boolean;
  unauthorized?: boolean;
  failureState?: EcoFlowCloudClientState | null;
  error: string | null;
  polledAt: number;
}

export interface EcoFlowCloudConnectionProvider {
  connect(deviceId: string, token: string): Promise<void>;
  pollOnce(): Promise<Partial<PowerTelemetry>>;
  getPerDeviceTelemetry(): EcoFlowPerDeviceTelemetry[];
  lastStatus?: string;
  lastCloudError?: string | null;
  lastCloudFailure?: EcoFlowCloudClientState | null;
}

export interface EcoFlowCloudTelemetryNormalization {
  productType: EcoFlowCloudProductType;
  telemetry: Partial<PowerTelemetry> | null;
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry | null;
  telemetryActive: boolean;
  batteryPct: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarWatts: number | null;
  fridgeTemperatureC: number | null;
  acTemperatureC: number | null;
  acMode: string | null;
  chargerStatus: string | null;
}

export interface EcoFlowCloudConnectionResult extends EcoFlowCloudTelemetryNormalization {
  connected: boolean;
  statusLabel: string;
  statusError: string | null;
  providerStatus: string | null;
  cloudState: EcoFlowCloudClientState | null;
}

export const ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS = BLU_CLOUD_POLL_INTERVAL_MS;

export interface EcoFlowCloudTelemetryPollingOptions {
  intervalMs?: number;
  provider?: EcoFlowCloudConnectionProvider;
}

export interface EcoFlowCloudTelemetryPollingSession {
  deviceId: string;
  stop: () => void;
  refreshNow: () => Promise<void>;
  isRunning: () => boolean;
}

type ActiveEcoFlowCloudPollingSession = EcoFlowCloudTelemetryPollingSession & {
  replaceHandler: (handler: EcoFlowCloudTelemetryHandler) => void;
};

export type EcoFlowCloudTelemetryHandler = (result: EcoFlowCloudConnectionResult) => void;

const activeEcoFlowCloudPollingSessions = new Map<string, ActiveEcoFlowCloudPollingSession>();

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readNestedValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readNumberFromSources(sources: unknown[], aliases: string[]): number | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const alias of aliases) {
      const parsed = readFiniteNumber(readNestedValue(source, alias));
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readStringFromSources(sources: unknown[], aliases: string[]): string | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const alias of aliases) {
      const value = readNestedValue(source, alias);
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return null;
}

function classifyEcoFlowCloudClientState(value: unknown): EcoFlowCloudClientState {
  const parts: string[] = [];
  const collect = (input: unknown, depth = 0): void => {
    if (input == null || depth > 3) return;
    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
      parts.push(String(input));
      return;
    }
    if (input instanceof Error) {
      parts.push(input.message);
      return;
    }
    if (Array.isArray(input)) {
      for (const item of input) collect(item, depth + 1);
      return;
    }
    if (typeof input === 'object') {
      for (const item of Object.values(input as Record<string, unknown>)) {
        collect(item, depth + 1);
      }
    }
  };
  collect(value);
  const haystack = parts.join(' ').toLowerCase();
  if (
    haystack.includes('deviceunauthorized') ||
    haystack.includes('device_not_authorized') ||
    haystack.includes('current device is not allowed') ||
    haystack.includes('not allowed to get device info') ||
    haystack.includes('device unauthorized') ||
    haystack.includes('not authorized for this device')
  ) {
    return 'deviceUnauthorized';
  }
  if (
    haystack.includes('authrequired') ||
    haystack.includes('missing_ecoflow_credentials') ||
    haystack.includes('ecoflow_auth_required') ||
    haystack.includes('authorization required') ||
    haystack.includes('invalid access') ||
    haystack.includes('access key') ||
    haystack.includes('api key') ||
    haystack.includes('signature') ||
    haystack.includes('wrong account') ||
    haystack.includes('wrong region') ||
    haystack.includes('pending_approval')
  ) {
    return 'authRequired';
  }
  if (
    haystack.includes('deviceoffline') ||
    haystack.includes('device_offline') ||
    haystack.includes('offline') ||
    haystack.includes('not online') ||
    haystack.includes('device unavailable')
  ) {
    return 'deviceOffline';
  }
  if (
    haystack.includes('cloudstale') ||
    haystack.includes('no decoded live telemetry') ||
    haystack.includes('first poll returned no') ||
    haystack.includes('stale')
  ) {
    return 'cloudStale';
  }
  if (haystack.includes('cloudpolling') || haystack.includes('cloud polling')) {
    return 'cloudPolling';
  }
  return 'cloudUnavailable';
}

function isEcoFlowCloudAuthState(state: EcoFlowCloudClientState | null): boolean {
  return state === 'authRequired' || state === 'deviceUnauthorized';
}

export function normalizeEcoFlowCloudProductType(
  value: string | null | undefined,
  fallbackText: string = '',
): EcoFlowCloudProductType {
  return normalizeEcoFlowTelemetryProductType(value, fallbackText);
}

function resolveDeviceId(device: EcoFlowCloudConnectionDevice): string {
  return normalizeText(device.rawId ?? device.id);
}

function normalizeEcoFlowIdentity(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function addIdentityCandidate(candidates: Set<string>, value: unknown): void {
  const normalized = normalizeEcoFlowIdentity(value);
  if (normalized) candidates.add(normalized);
}

function collectEcoFlowIdentityCandidates(device: EcoFlowCloudConnectionDevice): Set<string> {
  const candidates = new Set<string>();
  addIdentityCandidate(candidates, device.rawId);
  addIdentityCandidate(candidates, device.id);
  addIdentityCandidate(candidates, device.name);
  addIdentityCandidate(candidates, device.model);
  addIdentityCandidate(candidates, device.subtype);
  addIdentityCandidate(candidates, device.category);
  addIdentityCandidate(candidates, device.productType);

  const raw = device.raw;
  if (raw && typeof raw === 'object') {
    for (const alias of [
      'id',
      'deviceId',
      'device_id',
      'sn',
      'serial',
      'serialNumber',
      'deviceSn',
      'deviceName',
      'name',
      'model',
      'productName',
      'productType',
    ]) {
      addIdentityCandidate(candidates, raw[alias]);
    }
  }

  return candidates;
}

function selectPerDeviceTelemetry(
  device: EcoFlowCloudConnectionDevice,
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry[],
): EcoFlowPerDeviceTelemetry | null {
  if (perDeviceTelemetry.length === 0) return null;

  const candidates = collectEcoFlowIdentityCandidates(device);
  const byDeviceId = perDeviceTelemetry.find((entry) => {
    const entryId = normalizeEcoFlowIdentity(entry.deviceId);
    return entryId && candidates.has(entryId);
  });
  if (byDeviceId) return byDeviceId;

  const byNameOrModel = perDeviceTelemetry.find((entry) => {
    const entryName = normalizeEcoFlowIdentity(entry.name);
    const entryModel = normalizeEcoFlowIdentity(entry.model);
    return (entryName && candidates.has(entryName)) || (entryModel && candidates.has(entryModel));
  });
  if (byNameOrModel) return byNameOrModel;

  return perDeviceTelemetry.length === 1 ? perDeviceTelemetry[0] : null;
}

function hasPowerTelemetryValues(telemetry: Partial<PowerTelemetry> | null): boolean {
  if (!telemetry) return false;
  const battery = telemetry.battery;
  const solar = telemetry.solar;
  return [
    battery?.socPct,
    battery?.wattsIn,
    battery?.wattsOut,
    battery?.volts,
    battery?.amps,
    battery?.tempC,
    battery?.estRuntimeMin,
    solar?.watts,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function hasDecodedEcoFlowValues(values: Array<number | null | undefined>): boolean {
  return values.some((value) => typeof value === 'number' && Number.isFinite(value));
}

function isAggregateEcoFlowTelemetry(telemetry: Partial<PowerTelemetry> | null | undefined): boolean {
  const deviceId = normalizeEcoFlowIdentity(telemetry?.device?.id);
  return deviceId === 'aggregate' || deviceId === 'ecoflowaggregate' || deviceId.endsWith('aggregate');
}

function aggregateTelemetryRepresentsDevice(
  device: EcoFlowCloudConnectionDevice,
  telemetry: Partial<PowerTelemetry> | null | undefined,
): boolean {
  if (!telemetry || isAggregateEcoFlowTelemetry(telemetry)) return false;

  const candidates = collectEcoFlowIdentityCandidates(device);
  const telemetryId = normalizeEcoFlowIdentity(telemetry.device?.id);
  const telemetrySerial = normalizeEcoFlowIdentity(telemetry.device?.serial);

  return (
    (telemetryId.length > 0 && candidates.has(telemetryId)) ||
    (telemetrySerial.length > 0 && candidates.has(telemetrySerial))
  );
}

export function normalizeEcoFlowCloudTelemetry(
  device: EcoFlowCloudConnectionDevice,
  aggregateTelemetry: Partial<PowerTelemetry> | null,
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry[] = [],
  now: number = Date.now(),
): EcoFlowCloudTelemetryNormalization {
  const deviceId = resolveDeviceId(device);
  const selectedTelemetry = selectPerDeviceTelemetry(device, perDeviceTelemetry);
  const productType = normalizeEcoFlowCloudProductType(
    device.productType ?? device.category ?? null,
    `${device.name ?? ''} ${device.model ?? ''} ${device.subtype ?? ''}`,
  );
  const model = normalizeText(
    device.subtype ??
    device.model ??
    selectedTelemetry?.model ??
    aggregateTelemetry?.device?.model ??
    device.name ??
    'EcoFlow Device',
  );
  const aggregateDeviceTelemetry = aggregateTelemetryRepresentsDevice(device, aggregateTelemetry)
    ? aggregateTelemetry
    : null;
  const rawSources = [
    device.raw,
    aggregateDeviceTelemetry,
    aggregateDeviceTelemetry as Record<string, unknown> | null,
    (aggregateDeviceTelemetry as Record<string, unknown> | null)?.raw,
  ];

  const batteryPct =
    selectedTelemetry?.socPct ??
    aggregateDeviceTelemetry?.battery?.socPct ??
    readNumberFromSources(rawSources, ['batteryPct', 'battery.percent', 'battery.socPct', 'socPct']);
  const inputWatts =
    selectedTelemetry?.wattsIn ??
    aggregateDeviceTelemetry?.battery?.wattsIn ??
    readNumberFromSources(rawSources, ['inputWatts', 'battery.wattsIn', 'wattsIn']);
  const outputWatts =
    selectedTelemetry?.wattsOut ??
    aggregateDeviceTelemetry?.battery?.wattsOut ??
    readNumberFromSources(rawSources, ['outputWatts', 'battery.wattsOut', 'wattsOut']);
  const solarWatts =
    selectedTelemetry?.solarWatts ??
    aggregateDeviceTelemetry?.solar?.watts ??
    readNumberFromSources(rawSources, ['solarWatts', 'solar.watts', 'solar_input_watts']);
  const fridgeTemperatureC =
    productType === 'refrigerator'
      ? readNumberFromSources(rawSources, [
        'fridgeTemperatureC',
        'fridgeTempC',
        'refrigerator.temperatureC',
        'temperatureC',
        'battery.tempC',
      ]) ?? aggregateDeviceTelemetry?.battery?.tempC ?? null
      : null;
  const acTemperatureC =
    productType === 'portable_ac'
      ? readNumberFromSources(rawSources, ['acTemperatureC', 'ac.tempC', 'temperatureC', 'battery.tempC'])
      : null;
  const acMode =
    productType === 'portable_ac'
      ? readStringFromSources(rawSources, ['acMode', 'ac.mode', 'mode'])
      : null;
  const chargerStatus =
    productType === 'charger'
      ? readStringFromSources(rawSources, ['chargerStatus', 'charger.status', 'status'])
      : null;

  const hasDecodedValues = hasDecodedEcoFlowValues([
    batteryPct,
    inputWatts,
    outputWatts,
    solarWatts,
    fridgeTemperatureC,
    acTemperatureC,
  ]);
  const aggregateTelemetryActive = hasPowerTelemetryValues(aggregateDeviceTelemetry) || hasDecodedValues;
  const telemetry: Partial<PowerTelemetry> | null = aggregateDeviceTelemetry
    ? {
      ...aggregateDeviceTelemetry,
      timestamp: aggregateDeviceTelemetry.timestamp ?? selectedTelemetry?.polledAt ?? now,
      source: 'cloud',
      sourceLabel: 'EcoFlow Cloud',
      isLive: aggregateTelemetryActive,
      device: {
        ...aggregateDeviceTelemetry.device,
        id: deviceId,
        vendor: 'EcoFlow',
        model,
        serial: deviceId,
      },
      battery: {
        ...aggregateDeviceTelemetry.battery,
        socPct: batteryPct ?? aggregateDeviceTelemetry.battery?.socPct,
        wattsIn: inputWatts ?? aggregateDeviceTelemetry.battery?.wattsIn,
        wattsOut: outputWatts ?? aggregateDeviceTelemetry.battery?.wattsOut,
        tempC:
          aggregateDeviceTelemetry.battery?.tempC ??
          fridgeTemperatureC ??
          acTemperatureC ??
          undefined,
      },
      solar: {
        ...aggregateDeviceTelemetry.solar,
        watts: solarWatts ?? aggregateDeviceTelemetry.solar?.watts,
      },
      flags: {
        ...aggregateDeviceTelemetry.flags,
        stale: aggregateDeviceTelemetry.flags?.stale ?? false,
      },
      capabilities: {
        hasSOC: batteryPct != null,
        hasWattsIn: inputWatts != null,
        hasWattsOut: outputWatts != null,
        hasSolar: solarWatts != null,
        hasRuntimeEstimate: aggregateDeviceTelemetry.battery?.estRuntimeMin != null,
        controllable: false,
        ...aggregateDeviceTelemetry.capabilities,
      },
      quality: {
        ...aggregateDeviceTelemetry.quality,
        connection: aggregateTelemetryActive ? 'connected' : aggregateDeviceTelemetry.quality?.connection,
        lastPacketAt: selectedTelemetry?.polledAt ?? aggregateDeviceTelemetry.quality?.lastPacketAt ?? now,
        rssi: device.signalStrength ?? aggregateDeviceTelemetry.quality?.rssi,
      },
    }
    : hasDecodedValues
      ? {
        timestamp: selectedTelemetry?.polledAt ?? now,
        source: 'cloud',
        sourceLabel: 'EcoFlow Cloud',
        isLive: true,
        device: {
          id: deviceId || selectedTelemetry?.deviceId || 'ecoflow-cloud',
          vendor: 'EcoFlow',
          model,
          serial: deviceId || selectedTelemetry?.deviceId,
        },
        battery: {
          socPct: batteryPct ?? undefined,
          wattsIn: inputWatts ?? undefined,
          wattsOut: outputWatts ?? undefined,
          tempC: fridgeTemperatureC ?? acTemperatureC ?? undefined,
        },
        solar: {
          watts: solarWatts ?? undefined,
        },
        flags: {
          charging:
            inputWatts != null || solarWatts != null || outputWatts != null
              ? (inputWatts ?? 0) + (solarWatts ?? 0) > (outputWatts ?? 0)
              : undefined,
          stale: false,
        },
        capabilities: {
          hasSOC: batteryPct != null,
          hasWattsIn: inputWatts != null,
          hasWattsOut: outputWatts != null,
          hasSolar: solarWatts != null,
          hasRuntimeEstimate: false,
          controllable: false,
        },
        quality: {
          connection: 'connected',
          lastPacketAt: selectedTelemetry?.polledAt ?? now,
          rssi: device.signalStrength ?? undefined,
        },
      }
      : null;
  const telemetryActive = hasPowerTelemetryValues(telemetry);

  return {
    productType,
    telemetry,
    perDeviceTelemetry: selectedTelemetry,
    telemetryActive,
    batteryPct: batteryPct ?? null,
    inputWatts: inputWatts ?? null,
    outputWatts: outputWatts ?? null,
    solarWatts: solarWatts ?? null,
    fridgeTemperatureC,
    acTemperatureC,
    acMode,
    chargerStatus,
  };
}

export async function connectEcoFlowCloudDevice(
  device: EcoFlowCloudConnectionDevice,
  provider: EcoFlowCloudConnectionProvider = new EcoFlowCloudProvider(),
): Promise<EcoFlowCloudConnectionResult> {
  const deviceId = resolveDeviceId(device);
  if (!deviceId) {
    bluLog('[BLU_ECOFLOW]', 'cloud_connect_missing_device_id', {
      vendor: 'ecoflow',
      phase: 'cloud_connect',
      connectionMode: 'cloud',
      message: 'Missing EcoFlow cloud device id.',
    });
    recordEcoFlowFailure({
      deviceId: 'unknown',
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      source: 'unavailable',
      reason: 'Missing EcoFlow cloud device id.',
      canRetry: false,
      requiresCloudAuth: false,
      requiresNativeBle: false,
      lastSuccessfulPhase: null,
    });
    return {
      connected: false,
      statusLabel: 'Missing EcoFlow cloud device id.',
      statusError: 'missing_device_id',
      providerStatus: null,
      cloudState: 'cloudUnavailable',
      ...normalizeEcoFlowCloudTelemetry(device, null, []),
    };
  }

  bluLog('[BLU_CONNECT]', 'ecoflow_cloud_connect_attempt', buildBluConnectionAttemptLogDetails({
    deviceId,
    vendor: 'ecoflow',
    deviceType: device.productType ?? device.category ?? 'power_device',
    connectionMode: 'cloud',
    startedAt: Date.now(),
    timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
    attempt: 1,
    name: device.name,
  }));
  recordEcoFlowConnectionPhase({
    deviceId,
    deviceName: device.name,
    productType: device.productType ?? device.category ?? null,
    phase: 'connecting',
    source: 'ecoflow-cloud',
  });
  try {
    recordEcoFlowConnectionPhase({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      phase: 'handshaking',
      source: 'ecoflow-cloud',
      lastSuccessfulPhase: 'connecting',
    });
    await provider.connect(deviceId, ECOFLOW_CLOUD_CONNECT_TOKEN);
    bluLog('[BLU_HANDSHAKE]', 'ecoflow_cloud_provider_connect_succeeded', {
      deviceId,
      vendor: 'ecoflow',
      phase: 'provider_connect',
      connectionMode: 'cloud',
      providerStatus: provider.lastStatus ?? null,
    });
    recordEcoFlowConnectionPhase({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      phase: 'connected',
      source: 'ecoflow-cloud',
      lastSuccessfulPhase: 'handshaking',
    });
  } catch (error) {
    const statusError = error instanceof Error ? error.message : String(error ?? 'EcoFlow Cloud connection failed.');
    const cloudState = provider.lastCloudFailure ?? classifyEcoFlowCloudClientState(statusError);
    const authFailure = isEcoFlowCloudAuthState(cloudState) || isEcoFlowUnauthorizedDeviceError(error);
    bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_provider_connect_failed', buildBluTimeoutLogDetails({
      deviceId,
      vendor: 'ecoflow',
      phase: 'ecoflow_cloud_connect',
      timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
      lastSuccessfulPhase: null,
      lastPacketAt: null,
      errorCode: provider.lastStatus ?? null,
      message: statusError,
    }));
    recordEcoFlowFailure({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      source: 'ecoflow-cloud',
      reason: statusError,
      canRetry: !authFailure,
      requiresCloudAuth: authFailure,
      requiresNativeBle: false,
      cloudState,
      lastSuccessfulPhase: 'handshaking',
    });
    return {
      connected: false,
      statusLabel: 'EcoFlow Cloud connection failed.',
      statusError,
      providerStatus: provider.lastStatus ?? null,
      cloudState,
      ...normalizeEcoFlowCloudTelemetry(device, null, []),
    };
  }

  try {
    recordEcoFlowConnectionPhase({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      phase: 'awaitingTelemetry',
      source: 'ecoflow-cloud',
      lastSuccessfulPhase: 'connected',
    });
    recordBluStreamHealthSnapshot({
      deviceId,
      vendor: 'ecoflow',
      phase: 'awaitingFirstPacket',
      source: 'cloud-api',
      streamMode: 'cloud_poll',
      staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS * 2),
    });
    const telemetry = await provider.pollOnce();
    const perDeviceTelemetry = provider.getPerDeviceTelemetry();
    const normalized = normalizeEcoFlowCloudTelemetry(device, telemetry, perDeviceTelemetry);
    const cloudState: EcoFlowCloudClientState | null = normalized.telemetryActive
      ? null
      : provider.lastCloudFailure ?? 'cloudStale';
    bluLog(
      normalized.telemetryActive ? '[BLU_TELEMETRY]' : '[BLU_TIMEOUT]',
      normalized.telemetryActive ? 'ecoflow_cloud_first_poll_telemetry' : 'ecoflow_cloud_first_poll_no_live_telemetry',
      normalized.telemetryActive
        ? buildBluTelemetryLogDetails({
            deviceId,
            vendor: 'ecoflow',
            telemetry: normalized.telemetry,
            streamMode: 'cloud_poll',
            lastPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
            productType: normalized.productType,
          })
        : buildBluTimeoutLogDetails({
            deviceId,
            vendor: 'ecoflow',
            phase: 'ecoflow_cloud_first_poll',
            timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
            lastSuccessfulPhase: 'provider_connect',
            lastPacketAt: null,
            errorCode: provider.lastStatus ?? null,
            message: 'EcoFlow cloud first poll returned no decoded live telemetry.',
      }),
    );
    if (normalized.telemetryActive) {
      recordEcoFlowConnectionPhase({
        deviceId,
        deviceName: device.name,
        productType: normalized.productType,
        phase: 'streaming',
        source: 'ecoflow-cloud',
        lastSuccessfulPhase: 'awaitingTelemetry',
        lastPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
      });
      recordBluStreamHealthSnapshot({
        deviceId,
        vendor: 'ecoflow',
        phase: 'streaming',
        source: 'cloud-api',
        streamMode: 'cloud_poll',
        staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS * 2),
        firstPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
        lastPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
        packetCount: 1,
      });
    } else {
      const authFailure = isEcoFlowCloudAuthState(cloudState);
      recordEcoFlowTimeout({
        deviceId,
        deviceName: device.name,
        productType: normalized.productType,
        source: 'ecoflow-cloud',
        timeoutKind: 'firstTelemetryTimeout',
        reason: 'EcoFlow cloud first poll returned no decoded live telemetry.',
        canRetry: !authFailure,
        requiresCloudAuth: authFailure,
        requiresNativeBle: false,
        cloudState,
        lastSuccessfulPhase: 'connected',
        lastPacketAt: null,
      });
      recordBluStreamHealthSnapshot({
        deviceId,
        vendor: 'ecoflow',
        phase: 'failed',
        source: 'cloud-api',
        streamMode: 'cloud_poll',
        staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS * 2),
        error: {
          phase: 'awaitingFirstPacket',
          code: 'NO_DECODED_TELEMETRY',
          message: 'EcoFlow cloud first poll returned no decoded live telemetry.',
        },
      });
    }
    return {
      connected: true,
      statusLabel: normalized.telemetryActive
        ? 'EcoFlow Cloud telemetry active.'
        : 'EcoFlow Cloud device available.',
      statusError: null,
      providerStatus: provider.lastStatus ?? null,
      cloudState,
      ...normalized,
    };
  } catch (error) {
    const statusError = error instanceof Error ? error.message : String(error ?? 'EcoFlow status fetch failed.');
    const cloudState = provider.lastCloudFailure ?? classifyEcoFlowCloudClientState(statusError);
    const authFailure = isEcoFlowCloudAuthState(cloudState) || isEcoFlowUnauthorizedDeviceError(error);
    bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_first_poll_failed', buildBluTimeoutLogDetails({
      deviceId,
      vendor: 'ecoflow',
      phase: 'ecoflow_cloud_first_poll',
      timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
      lastSuccessfulPhase: 'provider_connect',
      lastPacketAt: null,
      errorCode: provider.lastStatus ?? null,
      message: statusError,
    }));
    if (authFailure) {
      recordEcoFlowFailure({
        deviceId,
        deviceName: device.name,
        productType: device.productType ?? device.category ?? null,
        source: 'ecoflow-cloud',
        reason: statusError,
        canRetry: false,
        requiresCloudAuth: true,
        requiresNativeBle: false,
        cloudState,
        lastSuccessfulPhase: 'connected',
      });
      return {
        connected: false,
        statusLabel: 'EcoFlow Cloud authorization required.',
        statusError,
        providerStatus: provider.lastStatus ?? null,
        cloudState,
        ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
      };
    }

    recordEcoFlowTimeout({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      source: 'ecoflow-cloud',
      timeoutKind: 'firstTelemetryTimeout',
      reason: statusError,
      canRetry: true,
      requiresCloudAuth: false,
      requiresNativeBle: false,
      cloudState,
      lastSuccessfulPhase: 'connected',
      lastPacketAt: null,
    });
    recordBluStreamHealthSnapshot({
      deviceId,
      vendor: 'ecoflow',
      phase: 'failed',
      source: 'cloud-api',
      streamMode: 'cloud_poll',
      staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS * 2),
      error: {
        phase: 'awaitingFirstPacket',
        code: provider.lastStatus ?? undefined,
        message: statusError,
      },
    });
    return {
      connected: true,
      statusLabel: 'EcoFlow Cloud device available. Status fetch will retry later.',
      statusError,
      providerStatus: provider.lastStatus ?? null,
      cloudState,
      ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
    };
  }
}

async function pollConnectedEcoFlowCloudDevice(
  device: EcoFlowCloudConnectionDevice,
  provider: EcoFlowCloudConnectionProvider,
): Promise<EcoFlowCloudConnectionResult> {
  const deviceId = resolveDeviceId(device);
  try {
    const telemetry = await provider.pollOnce();
    const perDeviceTelemetry = provider.getPerDeviceTelemetry();
    const normalized = normalizeEcoFlowCloudTelemetry(device, telemetry, perDeviceTelemetry);
    const cloudState: EcoFlowCloudClientState | null = normalized.telemetryActive
      ? null
      : provider.lastCloudFailure ?? 'cloudStale';
    bluLogThrottled(
      normalized.telemetryActive ? '[BLU_TELEMETRY]' : '[BLU_STREAM]',
      `ecoflow-cloud-poll:${deviceId}:${normalized.telemetryActive ? 'active' : 'no-live'}`,
      normalized.telemetryActive ? 'ecoflow_cloud_poll_telemetry' : 'ecoflow_cloud_poll_no_live_telemetry',
      normalized.telemetryActive
        ? buildBluTelemetryLogDetails({
            deviceId,
            vendor: 'ecoflow',
            telemetry: normalized.telemetry,
            streamMode: 'cloud_poll',
            lastPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
            productType: normalized.productType,
          })
        : {
            deviceId,
            vendor: 'ecoflow',
            streamMode: 'cloud_poll',
            phase: 'cloud_poll',
            productType: normalized.productType,
            telemetryActive: false,
          },
      10_000,
    );
    if (normalized.telemetryActive) {
      recordEcoFlowConnectionPhase({
        deviceId,
        deviceName: device.name,
        productType: normalized.productType,
        phase: 'streaming',
        source: 'ecoflow-cloud',
        lastSuccessfulPhase: 'cloudPolling',
        lastPacketAt: normalized.telemetry?.quality?.lastPacketAt ?? normalized.telemetry?.timestamp ?? Date.now(),
      });
    } else {
      const authFailure = isEcoFlowCloudAuthState(cloudState);
      recordEcoFlowTimeout({
        deviceId,
        deviceName: device.name,
        productType: normalized.productType,
        source: 'ecoflow-cloud',
        timeoutKind: 'cloudPollTimeout',
        reason: 'EcoFlow Cloud poll completed, but no live telemetry fields were decoded.',
        canRetry: !authFailure,
        requiresCloudAuth: authFailure,
        requiresNativeBle: false,
        cloudState,
        lastSuccessfulPhase: 'cloudPolling',
        lastPacketAt: null,
      });
    }
    return {
      connected: true,
      statusLabel: normalized.telemetryActive
        ? 'EcoFlow Cloud telemetry active.'
        : 'EcoFlow Cloud device available.',
      statusError: null,
      providerStatus: provider.lastStatus ?? null,
      cloudState,
      ...normalized,
    };
  } catch (error) {
    const statusError = error instanceof Error ? error.message : String(error ?? 'EcoFlow status fetch failed.');
    const cloudState = provider.lastCloudFailure ?? classifyEcoFlowCloudClientState(statusError);
    const authFailure = isEcoFlowCloudAuthState(cloudState) || isEcoFlowUnauthorizedDeviceError(error);
    bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_poll_failed', buildBluTimeoutLogDetails({
      deviceId,
      vendor: 'ecoflow',
      phase: 'ecoflow_cloud_poll',
      timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
      lastSuccessfulPhase: 'provider_connect',
      lastPacketAt: null,
      errorCode: provider.lastStatus ?? null,
      message: statusError,
    }));
    if (authFailure) {
      recordEcoFlowFailure({
        deviceId,
        deviceName: device.name,
        productType: device.productType ?? device.category ?? null,
        source: 'ecoflow-cloud',
        reason: statusError,
        canRetry: false,
        requiresCloudAuth: true,
        requiresNativeBle: false,
        cloudState,
        lastSuccessfulPhase: 'connected',
      });
      return {
        connected: false,
        statusLabel: 'EcoFlow Cloud authorization required.',
        statusError,
        providerStatus: provider.lastStatus ?? null,
        cloudState,
        ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
      };
    }

    recordEcoFlowTimeout({
      deviceId,
      deviceName: device.name,
      productType: device.productType ?? device.category ?? null,
      source: 'ecoflow-cloud',
      timeoutKind: 'cloudPollTimeout',
      reason: statusError,
      canRetry: true,
      requiresCloudAuth: false,
      requiresNativeBle: false,
      cloudState,
      lastSuccessfulPhase: 'connected',
      lastPacketAt: null,
    });
    return {
      connected: true,
      statusLabel: 'EcoFlow Cloud device available. Status fetch will retry.',
      statusError,
      providerStatus: provider.lastStatus ?? null,
      cloudState,
      ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
    };
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | null): void {
  const maybeTimer = timer as unknown as { unref?: () => void } | null;
  if (typeof maybeTimer?.unref === 'function') {
    maybeTimer.unref();
  }
}

export function stopEcoFlowCloudTelemetryPolling(deviceId?: string | null): void {
  const normalizedDeviceId = resolveDeviceId({ rawId: deviceId ?? undefined });
  const sessions = normalizedDeviceId
    ? [activeEcoFlowCloudPollingSessions.get(normalizedDeviceId)].filter(Boolean) as ActiveEcoFlowCloudPollingSession[]
    : Array.from(activeEcoFlowCloudPollingSessions.values());

  for (const session of sessions) {
    bluLog('[BLU_DISCONNECT]', 'ecoflow_cloud_polling_stop', {
      deviceId: session.deviceId,
      vendor: 'ecoflow',
      streamMode: 'cloud_poll',
      requestedDeviceId: deviceId ?? null,
    });
    recordEcoFlowConnectionPhase({
      deviceId: session.deviceId,
      phase: 'disconnected',
      source: 'ecoflow-cloud',
      lastSuccessfulPhase: 'disconnected',
    });
    session.stop();
  }
}

export function startEcoFlowCloudTelemetryPolling(
  device: EcoFlowCloudConnectionDevice,
  onTelemetry: EcoFlowCloudTelemetryHandler,
  options: EcoFlowCloudTelemetryPollingOptions = {},
): EcoFlowCloudTelemetryPollingSession {
  const deviceId = resolveDeviceId(device);
  if (!deviceId) {
    return {
      deviceId: '',
      stop: () => {},
      refreshNow: async () => {},
      isRunning: () => false,
    };
  }

  const existingSession = activeEcoFlowCloudPollingSessions.get(deviceId);
  if (existingSession) {
    existingSession.replaceHandler(onTelemetry);
    void existingSession.refreshNow();
    return existingSession;
  }

  const provider = options.provider ?? new EcoFlowCloudProvider();
  const intervalMs = Math.max(
    BLU_CLOUD_POLL_INTERVAL_MIN_MS,
    options.intervalMs ?? ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
  );
  bluLog('[BLU_STREAM]', 'ecoflow_cloud_polling_session_start', {
    deviceId,
    vendor: 'ecoflow',
    streamMode: 'cloud_poll',
    intervalMs,
  });
  recordEcoFlowConnectionPhase({
    deviceId,
    deviceName: device.name,
    productType: device.productType ?? device.category ?? null,
    phase: 'cloudPolling',
    source: 'ecoflow-cloud',
    lastSuccessfulPhase: 'connected',
  });
  let stopped = false;
  let connected = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let handler = onTelemetry;
  let refreshNow: () => Promise<void> = async () => {};
  const streamLifecycle = new BluStreamLifecycle({
    deviceId,
    vendor: 'ecoflow',
    deviceType: device.productType ?? device.category ?? 'power_device',
    source: 'cloud-api',
    streamMode: 'cloud_poll',
    staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, intervalMs * 2),
    firstPacketTimeoutMs: Math.max(DEFAULT_FIRST_PACKET_TIMEOUT_MS, intervalMs * 3),
    onRecover: async () => {
      if (!stopped) {
        await refreshNow();
      }
    },
  });

  const stop = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    streamLifecycle.stop('cloud_polling_stopped');
    clearBluStreamHealthSnapshot(deviceId, 'ecoflow');
    activeEcoFlowCloudPollingSessions.delete(deviceId);
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      void refreshNow();
    }, intervalMs);
    unrefTimer(timer);
  };

  refreshNow = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      if (!connected) {
        bluLog('[BLU_HANDSHAKE]', 'ecoflow_cloud_polling_provider_connect_start', {
          deviceId,
          vendor: 'ecoflow',
          phase: 'provider_connect',
          connectionMode: 'cloud',
        });
        recordEcoFlowConnectionPhase({
          deviceId,
          deviceName: device.name,
          productType: device.productType ?? device.category ?? null,
          phase: 'handshaking',
          source: 'ecoflow-cloud',
          lastSuccessfulPhase: 'cloudPolling',
        });
        await provider.connect(deviceId, ECOFLOW_CLOUD_CONNECT_TOKEN);
        connected = true;
        bluLog('[BLU_HANDSHAKE]', 'ecoflow_cloud_polling_provider_connect_succeeded', {
          deviceId,
          vendor: 'ecoflow',
          phase: 'provider_connect',
          connectionMode: 'cloud',
          providerStatus: provider.lastStatus ?? null,
        });
        recordEcoFlowConnectionPhase({
          deviceId,
          deviceName: device.name,
          productType: device.productType ?? device.category ?? null,
          phase: 'cloudPolling',
          source: 'ecoflow-cloud',
          lastSuccessfulPhase: 'connected',
        });
      }
      const result = await pollConnectedEcoFlowCloudDevice(device, provider);
      if (result.telemetryActive) {
        streamLifecycle.recordPacket(
          result.telemetry?.quality?.lastPacketAt ?? result.telemetry?.timestamp ?? Date.now(),
        );
      } else {
        streamLifecycle.recordError(
          'cloud_poll',
          'EcoFlow Cloud poll completed, but no live telemetry fields were decoded.',
          'NO_DECODED_TELEMETRY',
          { canRecover: true, timeoutMs: intervalMs },
        );
      }
      handler(result);
      if (!result.connected && (isEcoFlowCloudAuthState(result.cloudState) || /not authorized|authorization required/i.test(result.statusError ?? result.statusLabel))) {
        stop();
      }
    } catch (error) {
      const statusError = error instanceof Error ? error.message : String(error ?? 'EcoFlow status fetch failed.');
      const cloudState = provider.lastCloudFailure ?? classifyEcoFlowCloudClientState(statusError);
      const authFailure = isEcoFlowCloudAuthState(cloudState) || isEcoFlowUnauthorizedDeviceError(error);
      streamLifecycle.recordError(
        connected ? 'cloud_poll' : 'cloud_connect',
        statusError,
        provider.lastStatus ?? undefined,
        { canRecover: !authFailure, timeoutMs: intervalMs },
      );
      bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_polling_refresh_failed', buildBluTimeoutLogDetails({
        deviceId,
        vendor: 'ecoflow',
        phase: connected ? 'ecoflow_cloud_poll' : 'ecoflow_cloud_connect',
        timeoutMs: intervalMs,
        lastSuccessfulPhase: connected ? 'provider_connect' : null,
        lastPacketAt: null,
        errorCode: provider.lastStatus ?? null,
        message: statusError,
      }));
      if (connected) {
        recordEcoFlowTimeout({
          deviceId,
          deviceName: device.name,
          productType: device.productType ?? device.category ?? null,
          source: 'ecoflow-cloud',
          timeoutKind: 'cloudPollTimeout',
          reason: statusError,
          canRetry: !authFailure,
          requiresCloudAuth: authFailure,
          requiresNativeBle: false,
          cloudState,
          lastSuccessfulPhase: 'connected',
          lastPacketAt: null,
        });
      } else {
        recordEcoFlowFailure({
          deviceId,
          deviceName: device.name,
          productType: device.productType ?? device.category ?? null,
          source: 'ecoflow-cloud',
          reason: statusError,
          canRetry: !authFailure,
          requiresCloudAuth: authFailure,
          requiresNativeBle: false,
          cloudState,
          lastSuccessfulPhase: 'handshaking',
        });
      }
      handler({
        connected: true,
        statusLabel: 'EcoFlow Cloud device available. Status fetch will retry.',
        statusError,
        providerStatus: provider.lastStatus ?? null,
        cloudState,
        ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
      });
    } finally {
      inFlight = false;
      schedule();
    }
  };

  const session: ActiveEcoFlowCloudPollingSession = {
    deviceId,
    stop,
    refreshNow,
    isRunning: () => !stopped,
    replaceHandler: (nextHandler) => {
      handler = nextHandler;
    },
  };

  activeEcoFlowCloudPollingSessions.set(deviceId, session);
  streamLifecycle.start();
  void refreshNow();
  return session;
}
