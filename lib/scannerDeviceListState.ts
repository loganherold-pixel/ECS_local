import { ecsLog } from './ecsLogger';

export type ScannerDeviceSource = string;

export interface ScannerDeviceListItem {
  id?: string | null;
  source?: ScannerDeviceSource | null;
  sources?: ScannerDeviceSource[] | null;
  name?: string | null;
  displayName?: string | null;
  brand?: string | null;
  model?: string | null;
  rssi?: number | null;
  lastSeenAt?: number | null;
  sourceIds?: Record<string, string | null | undefined> | null;
  raw?: unknown;
}

export interface ScannerDeviceListUpsertResult<T extends ScannerDeviceListItem> {
  devices: T[];
  upserted: number;
  deduped: number;
  dropped: number;
  dropReasons: string[];
}

export const POWER_SCAN_DEFAULT_MIN_RSSI = -85;
export const SCANNER_SCAN_WINDOW_DEBOUNCE_MS = 1_500;
export const SCANNER_DEVICE_DISMISS_COOLDOWN_MS = 10 * 60 * 1000;
export const SCANNER_DEVICE_STALE_TIMEOUT_MS = 90 * 1000;

export const POWER_SCANNER_BRAND_ALLOWLIST = [
  'ecoflow',
  'delta',
  'river',
  'glacier',
  'bluetti',
  'anker',
  'solix',
  'jackery',
  'goal zero',
  'goalzero',
  'yeti',
  'renogy',
  'renology',
  'redarc',
  'victron',
  'smart shunt',
  'smart solar',
  'dakota',
  'lithium',
  'battery',
  'power station',
  'solar generator',
  'power',
];

const dismissedScannerDevices = new Map<string, number>();

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKey(value: unknown): string | null {
  const text = clean(typeof value === 'string' ? value : value == null ? null : String(value));
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function readRawString(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== 'object') return null;
  return clean((raw as Record<string, unknown>)[key]);
}

function getSource(item: ScannerDeviceListItem): string {
  return clean(item.source) ?? clean(item.sources?.[0]) ?? 'unknown';
}

function getManufacturerHint(item: ScannerDeviceListItem): string | null {
  return (
    readRawString(item.raw, 'manufacturerData') ??
    readRawString(item.raw, 'manufacturer') ??
    readRawString(item.raw, 'manufacturerName')
  );
}

function getScannerDeviceSearchText(item: ScannerDeviceListItem): string {
  return [
    item.displayName,
    item.name,
    item.brand,
    item.model,
    getManufacturerHint(item),
    readRawString(item.raw, 'localName'),
    readRawString(item.raw, 'serviceUUIDs'),
    readRawString(item.raw, 'serviceUuids'),
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' ');
}

export function isLikelyPowerScannerDevice(
  item: ScannerDeviceListItem,
  allowlist: readonly string[] = POWER_SCANNER_BRAND_ALLOWLIST,
): boolean {
  const haystack = getScannerDeviceSearchText(item);
  if (!haystack) return false;
  return allowlist.some((entry) => {
    const needle = normalizeSearchText(entry);
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function dismissScannerDeviceForCooldown(
  itemOrKey: ScannerDeviceListItem | string,
  options?: { now?: number; cooldownMs?: number },
): string | null {
  const now = options?.now ?? Date.now();
  const cooldownMs = options?.cooldownMs ?? SCANNER_DEVICE_DISMISS_COOLDOWN_MS;
  const key = typeof itemOrKey === 'string'
    ? itemOrKey
    : getScannerDeviceStableKey(itemOrKey, now);
  if (!key) return null;
  dismissedScannerDevices.set(key, now + cooldownMs);
  return key;
}

export function isScannerDeviceDismissed(
  itemOrKey: ScannerDeviceListItem | string,
  now: number = Date.now(),
): boolean {
  const key = typeof itemOrKey === 'string'
    ? itemOrKey
    : getScannerDeviceStableKey(itemOrKey, now);
  if (!key) return false;
  const dismissedUntil = dismissedScannerDevices.get(key);
  if (dismissedUntil == null) return false;
  if (dismissedUntil <= now) {
    dismissedScannerDevices.delete(key);
    return false;
  }
  return true;
}

export function clearScannerDeviceDismissalsForTests(): void {
  dismissedScannerDevices.clear();
}

function isLikelyUnknownBleAdvertisement(item: ScannerDeviceListItem): boolean {
  const source = getSource(item).toLowerCase();
  if (!source.includes('bluetooth') && !source.includes('ble')) return false;
  const label = clean(item.displayName) ?? clean(item.name) ?? clean(item.model) ?? clean(item.brand);
  const manufacturer = getManufacturerHint(item);
  const normalizedLabel = normalizeKey(label);
  return (
    !manufacturer &&
    (!normalizedLabel ||
      normalizedLabel === 'unknown' ||
      normalizedLabel === 'unknowndevice' ||
      normalizedLabel === 'bluetoothdevice' ||
      normalizedLabel === 'bledevice')
  );
}

export function getScannerDeviceStableKey(
  item: ScannerDeviceListItem,
  now: number = Date.now(),
): string | null {
  const source = getSource(item);
  const directId = clean(item.id);
  if (directId) return `${source}:${normalizeKey(directId) ?? directId}`;

  const sourceIds = item.sourceIds && typeof item.sourceIds === 'object'
    ? Object.entries(item.sourceIds)
    : [];
  for (const [sourceKey, sourceId] of sourceIds) {
    const cleanedSourceId = clean(sourceId);
    if (cleanedSourceId) {
      return `${sourceKey}:${normalizeKey(cleanedSourceId) ?? cleanedSourceId}`;
    }
  }

  const label =
    clean(item.displayName) ??
    clean(item.name) ??
    clean(item.model) ??
    clean(item.brand);
  const manufacturer = getManufacturerHint(item);
  if (!label && !manufacturer) return null;

  const rssiBucket = typeof item.rssi === 'number' && Number.isFinite(item.rssi)
    ? Math.round(item.rssi / 10) * 10
    : 'unknown';
  const timestampBucket = Math.floor(now / 30_000);
  const fingerprint = [
    source,
    normalizeKey(label) ?? 'unknown',
    normalizeKey(manufacturer) ?? 'no-manufacturer',
    rssiBucket,
    timestampBucket,
  ].join(':');
  return `temporary:${fingerprint}`;
}

function mergeScannerDevice<T extends ScannerDeviceListItem>(
  existing: T,
  incoming: T,
  stableKey: string,
  now: number,
): T {
  return {
    ...existing,
    ...incoming,
    id: clean(incoming.id) ?? clean(existing.id) ?? stableKey,
    sources: Array.from(new Set([...(existing.sources ?? []), ...(incoming.sources ?? []), incoming.source, existing.source].filter(Boolean) as string[])),
    lastSeenAt: Math.max(
      typeof existing.lastSeenAt === 'number' ? existing.lastSeenAt : 0,
      typeof incoming.lastSeenAt === 'number' ? incoming.lastSeenAt : 0,
      now,
    ),
  };
}

export function upsertScannerDeviceList<T extends ScannerDeviceListItem>(
  current: T[],
  incoming: T[],
  options: {
    reason: string;
    now?: number;
    logTag?: string;
    debug?: boolean;
    advancedScan?: boolean;
    minRssi?: number;
    hideUnknownBle?: boolean;
    brandAllowlist?: readonly string[];
    requireBrandAllowlistMatch?: boolean;
  },
): ScannerDeviceListUpsertResult<T> {
  const now = options.now ?? Date.now();
  const logTag = options.logTag ?? '[BT_SCAN]';
  const shouldDebug = options.debug === true;
  const minRssi = options.advancedScan ? null : options.minRssi ?? POWER_SCAN_DEFAULT_MIN_RSSI;
  const hideUnknownBle = options.hideUnknownBle ?? !options.advancedScan;
  const brandAllowlist = options.brandAllowlist ?? POWER_SCANNER_BRAND_ALLOWLIST;
  const byKey = new Map<string, T>();
  const orderedKeys: string[] = [];
  let upserted = 0;
  let deduped = 0;
  let dropped = 0;
  const dropReasons: string[] = [];

  const add = (item: T, phase: 'existing' | 'incoming') => {
    if (phase === 'incoming' && minRssi != null && typeof item.rssi === 'number' && item.rssi < minRssi) {
      dropped += 1;
      dropReasons.push('weak_rssi');
      if (shouldDebug) {
        ecsLog.debug('TELEMETRY', `${logTag} device_dropped`, {
          reason: 'weak_rssi',
          rssi: item.rssi,
          minRssi,
          source: item.source ?? item.sources?.[0] ?? null,
        });
      }
      return;
    }

    const key = getScannerDeviceStableKey(item, now);
    if (phase === 'incoming' && key && isScannerDeviceDismissed(key, now)) {
      dropped += 1;
      dropReasons.push('dismissed_cooldown');
      if (shouldDebug) {
        ecsLog.debug('TELEMETRY', `${logTag} device_dropped`, {
          reason: 'dismissed_cooldown',
          key,
          source: item.source ?? item.sources?.[0] ?? null,
        });
      }
      return;
    }

    if (phase === 'incoming' && hideUnknownBle && isLikelyUnknownBleAdvertisement(item)) {
      dropped += 1;
      dropReasons.push('unknown_ble_hidden');
      if (shouldDebug) {
        ecsLog.debug('TELEMETRY', `${logTag} device_dropped`, {
          reason: 'unknown_ble_hidden',
          source: item.source ?? item.sources?.[0] ?? null,
        });
      }
      return;
    }

    if (
      phase === 'incoming' &&
      !options.advancedScan &&
      options.requireBrandAllowlistMatch &&
      !isLikelyPowerScannerDevice(item, brandAllowlist)
    ) {
      dropped += 1;
      dropReasons.push('brand_allowlist_miss');
      if (shouldDebug) {
        ecsLog.debug('TELEMETRY', `${logTag} device_dropped`, {
          reason: 'brand_allowlist_miss',
          source: item.source ?? item.sources?.[0] ?? null,
          name: item.name ?? item.displayName ?? null,
        });
      }
      return;
    }

    if (!key) {
      dropped += 1;
      const reason = 'missing_stable_identifier';
      dropReasons.push(reason);
      if (shouldDebug) {
        ecsLog.warn('TELEMETRY', `${logTag} device_dropped`, {
          reason,
          phase,
          source: item.source ?? item.sources?.[0] ?? null,
          name: item.name ?? item.displayName ?? null,
        });
      }
      return;
    }

    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, mergeScannerDevice(existing, item, key, now));
      deduped += phase === 'incoming' ? 1 : 0;
      if (phase === 'incoming') {
        if (shouldDebug) {
          ecsLog.debug('TELEMETRY', `${logTag} device_deduped`, {
            key,
            reason: options.reason,
            source: item.source ?? item.sources?.[0] ?? null,
          });
        }
      }
      return;
    }

    byKey.set(key, item);
    orderedKeys.push(key);
    if (phase === 'incoming') {
      upserted += 1;
      if (shouldDebug) {
        ecsLog.debug('TELEMETRY', `${logTag} device_upserted`, {
          key,
          reason: options.reason,
          source: item.source ?? item.sources?.[0] ?? null,
        });
      }
    }
  };

  current.forEach((item) => add(item, 'existing'));
  incoming.forEach((item) => add(item, 'incoming'));

  return {
    devices: orderedKeys.map((key) => byKey.get(key)).filter((item): item is T => item != null),
    upserted,
    deduped,
    dropped,
    dropReasons: Array.from(new Set(dropReasons)),
  };
}

export function clearScannerDeviceList<T extends ScannerDeviceListItem>(
  current: T[],
  reason: string,
  logTag: string = '[BT_SCAN]',
): T[] {
  ecsLog.debug('TELEMETRY', `${logTag} list_cleared`, {
    reason,
    previousCount: current.length,
  });
  return [];
}

export function pruneStaleScannerDevices<T extends ScannerDeviceListItem>(
  current: T[],
  options?: {
    now?: number;
    staleAfterMs?: number;
    logTag?: string;
    debug?: boolean;
  },
): T[] {
  const now = options?.now ?? Date.now();
  const staleAfterMs = options?.staleAfterMs ?? SCANNER_DEVICE_STALE_TIMEOUT_MS;
  const next = current.filter((item) => {
    const lastSeenAt = typeof item.lastSeenAt === 'number' && Number.isFinite(item.lastSeenAt)
      ? item.lastSeenAt
      : null;
    return lastSeenAt != null && now - lastSeenAt <= staleAfterMs;
  });

  if (options?.debug === true && next.length !== current.length) {
    ecsLog.debug('TELEMETRY', `${options.logTag ?? '[BT_SCAN]'} stale_devices_pruned`, {
      previousCount: current.length,
      nextCount: next.length,
      staleAfterMs,
    });
  }

  return next;
}
