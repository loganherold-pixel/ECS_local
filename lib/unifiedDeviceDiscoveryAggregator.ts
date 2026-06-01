import { Platform } from 'react-native';
import { ecsLog } from './ecsLogger';

export type UnifiedDiscoverySource =
  | 'ble'
  | 'classic_bluetooth'
  | 'api'
  | 'cached';

export type UnifiedDiscoverySourceStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'unsupported'
  | 'disabled';

export interface UnifiedDiscoveredDevice {
  id: string;
  source: UnifiedDiscoverySource;
  sources: UnifiedDiscoverySource[];
  brand: string;
  model: string;
  displayName: string;
  category: string;
  connectionType: string;
  rssi: number | null;
  online: boolean | null;
  available: boolean | null;
  lastSeenAt: number;
  stableKeys: string[];
  sourceIds: Partial<Record<UnifiedDiscoverySource, string>>;
  raw: unknown;
}

export type UnifiedDiscoveryInput = Partial<Omit<UnifiedDiscoveredDevice, 'sources' | 'stableKeys' | 'sourceIds'>> & {
  source: UnifiedDiscoverySource;
  id?: string | null;
  apiDeviceId?: string | null;
  bleDeviceId?: string | null;
  classicDeviceId?: string | null;
  serial?: string | null;
  name?: string | null;
  displayName?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  connectionType?: string | null;
  rssi?: number | null;
  signal?: number | null;
  online?: boolean | null;
  available?: boolean | null;
  lastSeenAt?: number | null;
  raw?: unknown;
};

export interface UnifiedDiscoverySourceResult {
  source: UnifiedDiscoverySource;
  status: UnifiedDiscoverySourceStatus;
  devices: UnifiedDiscoveredDevice[];
  reason?: string;
  error?: string;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKey(value: unknown): string | null {
  const text = clean(typeof value === 'string' ? value : value == null ? null : String(value));
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isUnknownName(value: string): boolean {
  return /^unknown device(?:\s+[a-z0-9]+)?$/i.test(value.trim());
}

function addUniqueKey(keys: string[], key: string | null | undefined): void {
  if (!key || keys.includes(key)) return;
  keys.push(key);
}

function sourceIdKey(source: UnifiedDiscoverySource, id: string): string {
  return `${source}:${normalizeKey(id) ?? id}`;
}

function makeTemporaryDiscoveryId(input: UnifiedDiscoveryInput, now: number): string | null {
  const label =
    clean(input.displayName) ??
    clean(input.name) ??
    clean(input.model) ??
    clean(input.brand);
  const raw = input.raw && typeof input.raw === 'object'
    ? input.raw as Record<string, unknown>
    : null;
  const manufacturer =
    clean(raw?.manufacturerData) ??
    clean(raw?.manufacturer) ??
    clean(raw?.manufacturerName);
  if (!label && !manufacturer) return null;

  const rssi =
    typeof input.rssi === 'number' && Number.isFinite(input.rssi)
      ? input.rssi
      : typeof input.signal === 'number' && Number.isFinite(input.signal)
        ? input.signal
        : null;
  const rssiBucket = typeof rssi === 'number' ? Math.round(rssi / 10) * 10 : 'unknown';
  const timestampBucket = Math.floor(now / 30_000);
  const key = [
    input.source,
    normalizeKey(label) ?? 'unknown',
    normalizeKey(manufacturer) ?? 'no-manufacturer',
    rssiBucket,
    timestampBucket,
  ].join(':');
  return `temporary:${key}`;
}

function inferConnectionType(source: UnifiedDiscoverySource, value: string | null): string {
  if (value) return value;
  if (source === 'api') return 'api';
  if (source === 'classic_bluetooth') return 'classic_bluetooth';
  return 'ble';
}

function chooseText(primary: string, candidate: string): string {
  if (!primary || isUnknownName(primary)) return candidate;
  if (primary.length < candidate.length && !isUnknownName(candidate)) return candidate;
  return primary;
}

function chooseConnectionType(left: UnifiedDiscoveredDevice, right: UnifiedDiscoveredDevice): string {
  const values = new Set([...left.sources, ...right.sources]);
  if (values.has('api') && (values.has('ble') || values.has('classic_bluetooth'))) {
    return 'hybrid';
  }
  if (right.source === 'api') return right.connectionType;
  return left.connectionType || right.connectionType;
}

function choosePrimaryId(left: UnifiedDiscoveredDevice, right: UnifiedDiscoveredDevice): string {
  if (right.source === 'api') return right.id;
  if (left.source === 'api') return left.id;
  return left.id || right.id;
}

export function normalizeDiscoveredDevice(
  input: UnifiedDiscoveryInput,
  now: number = Date.now(),
): UnifiedDiscoveredDevice | null {
  const source = input.source;
  const id =
    clean(input.id) ??
    clean(input.apiDeviceId) ??
    clean(input.bleDeviceId) ??
    clean(input.classicDeviceId) ??
    makeTemporaryDiscoveryId(input, now);
  if (!id) return null;

  const displayName =
    clean(input.displayName) ??
    clean(input.name) ??
    `Unknown device ${id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`;
  const brand = clean(input.brand) ?? 'Unknown';
  const model = clean(input.model) ?? displayName;
  const category = clean(input.category) ?? 'unknown';
  const connectionType = inferConnectionType(source, clean(input.connectionType));
  const rssi =
    typeof input.rssi === 'number' && Number.isFinite(input.rssi)
      ? input.rssi
      : typeof input.signal === 'number' && Number.isFinite(input.signal)
        ? input.signal
        : null;
  const lastSeenAt =
    typeof input.lastSeenAt === 'number' && Number.isFinite(input.lastSeenAt)
      ? input.lastSeenAt
      : now;

  const sourceIds: Partial<Record<UnifiedDiscoverySource, string>> = {
    [source]: id,
  };
  const stableKeys: string[] = [];
  addUniqueKey(stableKeys, sourceIdKey(source, id));
  addUniqueKey(stableKeys, input.apiDeviceId ? sourceIdKey('api', input.apiDeviceId) : null);
  addUniqueKey(stableKeys, input.bleDeviceId ? sourceIdKey('ble', input.bleDeviceId) : null);
  addUniqueKey(stableKeys, input.classicDeviceId ? sourceIdKey('classic_bluetooth', input.classicDeviceId) : null);
  addUniqueKey(stableKeys, normalizeKey(input.serial) ? `serial:${normalizeKey(input.serial)}` : null);

  const fallbackParts = [
    normalizeKey(brand),
    normalizeKey(model),
    normalizeKey(isUnknownName(displayName) ? null : displayName),
  ].filter(Boolean);
  if (fallbackParts.length >= 3) {
    addUniqueKey(stableKeys, `fallback:${fallbackParts.join(':')}`);
  }

  return {
    id,
    source,
    sources: [source],
    brand,
    model,
    displayName,
    category,
    connectionType,
    rssi,
    online: typeof input.online === 'boolean' ? input.online : null,
    available: typeof input.available === 'boolean' ? input.available : null,
    lastSeenAt,
    stableKeys,
    sourceIds,
    raw: input.raw ?? input,
  };
}

export function mergeDiscoveredDevices(
  devices: Array<UnifiedDiscoveredDevice | null | undefined>,
): UnifiedDiscoveredDevice[] {
  const merged: UnifiedDiscoveredDevice[] = [];
  const indexByKey = new Map<string, number>();

  for (const device of devices) {
    if (!device) continue;

    const existingIndex = device.stableKeys
      .map((key) => indexByKey.get(key))
      .find((index): index is number => typeof index === 'number');

    if (typeof existingIndex !== 'number') {
      const nextIndex = merged.length;
      merged.push(device);
      for (const key of device.stableKeys) {
        indexByKey.set(key, nextIndex);
      }
      continue;
    }

    const existing = merged[existingIndex];
    const sources = Array.from(new Set([...existing.sources, ...device.sources]));
    const next: UnifiedDiscoveredDevice = {
      ...existing,
      id: choosePrimaryId(existing, device),
      source: existing.source === 'api' || device.source !== 'api' ? existing.source : device.source,
      sources,
      brand: existing.brand !== 'Unknown' ? existing.brand : device.brand,
      model: chooseText(existing.model, device.model),
      displayName: chooseText(existing.displayName, device.displayName),
      category: existing.category !== 'unknown' ? existing.category : device.category,
      connectionType: chooseConnectionType(existing, device),
      rssi:
        typeof existing.rssi === 'number' && typeof device.rssi === 'number'
          ? Math.max(existing.rssi, device.rssi)
          : existing.rssi ?? device.rssi,
      online: device.source === 'api' && device.online != null ? device.online : existing.online ?? device.online,
      available: device.source === 'api' && device.available != null ? device.available : existing.available ?? device.available,
      lastSeenAt: Math.max(existing.lastSeenAt, device.lastSeenAt),
      stableKeys: Array.from(new Set([...existing.stableKeys, ...device.stableKeys])),
      sourceIds: {
        ...existing.sourceIds,
        ...device.sourceIds,
      },
      raw: {
        merged: true,
        sources,
        entries: [existing.raw, device.raw],
      },
    };

    merged[existingIndex] = next;
    for (const key of next.stableKeys) {
      indexByKey.set(key, existingIndex);
    }
  }

  return merged.sort((left, right) => {
    const lastSeenDelta = right.lastSeenAt - left.lastSeenAt;
    if (lastSeenDelta !== 0) return lastSeenDelta;
    if (left.brand !== right.brand) return left.brand.localeCompare(right.brand);
    return left.displayName.localeCompare(right.displayName);
  });
}

export function buildUnifiedDiscoverySourceResult(
  source: UnifiedDiscoverySource,
  inputs: UnifiedDiscoveryInput[],
  now: number = Date.now(),
): UnifiedDiscoverySourceResult {
  const devices = inputs
    .map((input) => normalizeDiscoveredDevice(input, now))
    .filter((device): device is UnifiedDiscoveredDevice => device != null);
  return {
    source,
    status: 'success',
    devices,
  };
}

export function mergeDiscoverySourceResults(
  results: UnifiedDiscoverySourceResult[],
): UnifiedDiscoveredDevice[] {
  return mergeDiscoveredDevices(results.flatMap((result) => result.devices));
}

export async function discoverClassicBluetoothDevicesForUnifiedScanner(): Promise<UnifiedDiscoverySourceResult> {
  ecsLog.debug('TELEMETRY', '[BT_SCAN:CLASSIC] source_unsupported', {
    platform: Platform.OS,
    reason: 'classic_bluetooth_runtime_unavailable',
  });
  return {
    source: 'classic_bluetooth',
    status: 'unsupported',
    devices: [],
    reason: 'classic_bluetooth_runtime_unavailable',
  };
}
