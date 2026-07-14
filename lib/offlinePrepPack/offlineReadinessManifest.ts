import * as CryptoJS from 'crypto-js';

export const OFFLINE_READINESS_MANIFEST_SCHEMA_VERSION = 1;

export type OfflineReadinessAssetKind =
  | 'route_geometry'
  | 'map_region'
  | 'navigation_assets'
  | 'camp_candidates'
  | 'weather_snapshot'
  | 'emergency_recovery_packet'
  | 'vehicle_loadout_snapshot'
  | 'waypoints_bailouts';

export type OfflineReadinessAssetStatus =
  | 'missing'
  | 'queued'
  | 'downloading'
  | 'partial'
  | 'ready'
  | 'stale'
  | 'expired'
  | 'failed'
  | 'corrupt'
  | 'unavailable';

export type OfflineReadinessManifestState =
  | 'planned'
  | 'preparing'
  | 'paused'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'expired';

export type OfflineAssetCoverage = 'complete' | 'partial' | 'missing' | 'unknown';
export type OfflineAssetCacheState = 'local' | 'cached' | 'last_good' | 'manual' | 'missing';
export type OfflineAssetIntegrityMechanism = 'sha256' | 'tile_region_completion' | 'unverified_legacy';
export type OfflineAssetIntegrityStatus = 'verified' | 'pending' | 'unverified' | 'corrupt';

export interface OfflineReadinessSourceStamp {
  source: string;
  provider: string | null;
  authority: string | null;
  observedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  retrievedAt: string | null;
  cacheState: OfflineAssetCacheState;
}

export interface OfflineProviderOfflinePolicy {
  mode: 'local_asset' | 'provider_managed_cache' | 'snapshot_only' | 'manual_only' | 'offline_unavailable';
  allowedOffline: boolean | null;
  restrictionLabel: string;
}

export interface OfflineAssetIntegrity {
  mechanism: OfflineAssetIntegrityMechanism;
  expectedChecksum: string | null;
  actualChecksum: string | null;
  status: OfflineAssetIntegrityStatus;
  verifiedAt: string | null;
}

export interface OfflineReadinessAsset {
  assetId: string;
  kind: OfflineReadinessAssetKind;
  label: string;
  required: boolean;
  status: OfflineReadinessAssetStatus;
  coverage: OfflineAssetCoverage;
  source: OfflineReadinessSourceStamp;
  offlinePolicy: OfflineProviderOfflinePolicy;
  integrity: OfflineAssetIntegrity;
  sizeBytes: number | null;
  downloadedBytes: number | null;
  expiresAt: string | null;
  storageRefs: string[];
  dependencyAssetIds: string[];
  summary: string;
  manualEditable: boolean;
}

export interface OfflineReadinessStorageState {
  estimatedRequiredBytes: number;
  reservedBytes: number;
  availableBytes: number | null;
  quotaBytes: number | null;
  lowSpace: boolean;
  shortfallBytes: number;
  evaluatedAt: string;
}

export interface OfflineReadinessPreparationState {
  attemptId: string | null;
  status: 'idle' | 'preparing' | 'paused' | 'complete' | 'failed';
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  interruptedAt: string | null;
  retryCount: number;
  lastErrorCode: string | null;
}

export interface OfflineReadinessManifest {
  schemaVersion: typeof OFFLINE_READINESS_MANIFEST_SCHEMA_VERSION;
  manifestId: string;
  packageId: string;
  routeId: string;
  routeAssetId: string | null;
  tripPlanId: string | null;
  expeditionId: string | null;
  generatedAt: string;
  updatedAt: string;
  state: OfflineReadinessManifestState;
  assets: OfflineReadinessAsset[];
  storage: OfflineReadinessStorageState;
  preparation: OfflineReadinessPreparationState;
  migratedFromSchemaVersion: number | null;
}

export type OfflineReadinessAuditSeverity = 'blocker' | 'warning';

export interface OfflineReadinessAuditIssue {
  issueId: string;
  assetId: string | null;
  kind: OfflineReadinessAssetKind | 'storage' | 'manifest';
  severity: OfflineReadinessAuditSeverity;
  code:
    | 'required_asset_missing'
    | 'required_asset_incomplete'
    | 'asset_corrupt'
    | 'asset_expired'
    | 'asset_stale'
    | 'optional_asset_missing'
    | 'integrity_unverified'
    | 'partial_coverage'
    | 'provider_offline_restricted'
    | 'provider_offline_unknown'
    | 'low_storage'
    | 'manifest_expired';
  title: string;
  explanation: string;
  recommendedAction: string;
}

export interface OfflineReadinessAudit {
  manifestId: string;
  evaluatedAt: string;
  status: 'ready' | 'caution' | 'blocked';
  blockers: OfflineReadinessAuditIssue[];
  warnings: OfflineReadinessAuditIssue[];
  readyRequiredAssets: number;
  totalRequiredAssets: number;
  summary: string;
}

export interface LegacyOfflinePrepItemLike {
  id?: string;
  type?: string;
  label?: string;
  status?: string;
  availability?: string;
  required?: boolean;
  source?: string;
  summary?: string;
  count?: number | null;
  estimatedSizeMB?: number | null;
  cacheKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BuildOfflineReadinessManifestInput {
  packageId: string;
  routeId: string;
  routeAssetId?: string | null;
  tripPlanId?: string | null;
  expeditionId?: string | null;
  generatedAt: string;
  items: LegacyOfflinePrepItemLike[];
  contentFingerprints?: Partial<Record<OfflineReadinessAssetKind, unknown>>;
}

export interface OfflineStorageEvictionCandidate {
  manifestId: string;
  assetId: string;
  regionId: string | null;
  sizeBytes: number;
  lastAccessedAt: string;
  protected: boolean;
  protectionReason: string | null;
  priority: number;
}

export interface OfflineStorageEvictionPlan {
  requestedBytes: number;
  reclaimableBytes: number;
  selectedBytes: number;
  candidates: OfflineStorageEvictionCandidate[];
  selected: OfflineStorageEvictionCandidate[];
  protected: OfflineStorageEvictionCandidate[];
  shortfallBytes: number;
}

const KIND_LABELS: Record<OfflineReadinessAssetKind, string> = {
  route_geometry: 'Route geometry',
  map_region: 'Required map regions',
  navigation_assets: 'Navigation assets',
  camp_candidates: 'Camp candidates',
  weather_snapshot: 'Weather snapshot',
  emergency_recovery_packet: 'Emergency and recovery packet',
  vehicle_loadout_snapshot: 'Vehicle and loadout snapshot',
  waypoints_bailouts: 'Waypoints and bailouts',
};

const ITEM_TYPES_BY_KIND: Record<OfflineReadinessAssetKind, string[]> = {
  route_geometry: ['route_line', 'trail_route', 'approach_route', 'exit_route'],
  map_region: ['offline_map', 'critical_offline_segments'],
  navigation_assets: ['gpx_export', 'trip_sheet', 'trip_itinerary', 'trailhead', 'trail_end'],
  camp_candidates: ['campsites'],
  weather_snapshot: ['weather_snapshot'],
  emergency_recovery_packet: ['emergency_notes'],
  vehicle_loadout_snapshot: ['vehicle_readiness_summary'],
  waypoints_bailouts: ['waypoints', 'trail_waypoints', 'exit_points', 'bailout_points'],
};

const REQUIRED_DEFAULTS: Record<OfflineReadinessAssetKind, boolean> = {
  route_geometry: true,
  map_region: true,
  navigation_assets: true,
  camp_candidates: false,
  weather_snapshot: false,
  emergency_recovery_packet: false,
  vehicle_loadout_snapshot: false,
  waypoints_bailouts: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validIso(value: unknown): string | null {
  const normalized = cleanString(value);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;
  return new Date(normalized).toISOString();
}

function stableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  Object.keys(record).sort().forEach((key) => {
    if (/token|secret|password|authorization|cookie|endpoint|url/i.test(key)) return;
    normalized[key] = stableValue(record[key], seen);
  });
  return normalized;
}

export function stableOfflineAssetString(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256OfflineAsset(value: unknown): string {
  return CryptoJS.SHA256(stableOfflineAssetString(value)).toString(CryptoJS.enc.Hex);
}

export function estimateOfflineAssetBytes(value: unknown): number {
  const text = stableOfflineAssetString(value);
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff ? 4 : 3;
    if (code >= 0xd800 && code <= 0xdbff) index += 1;
  }
  return bytes;
}

function firstMetadataValue(items: LegacyOfflinePrepItemLike[], keys: string[]): unknown {
  for (const item of items) {
    const metadata = isRecord(item.metadata) ? item.metadata : null;
    if (!metadata) continue;
    for (const key of keys) {
      if (metadata[key] != null) return metadata[key];
    }
  }
  return null;
}

function mapLegacyStatus(items: LegacyOfflinePrepItemLike[]): OfflineReadinessAssetStatus {
  if (items.length === 0) return 'missing';
  const requiredItems = items.filter((item) => item.required === true);
  const evaluatedItems = requiredItems.length > 0 ? requiredItems : items;
  const statuses = new Set(evaluatedItems.map((item) => String(item.status ?? '').toLowerCase()));
  const availability = new Set(evaluatedItems.map((item) => String(item.availability ?? '').toLowerCase()));
  if (statuses.has('failed') || availability.has('failed')) return 'failed';
  if (statuses.has('downloading')) return 'downloading';
  if (statuses.has('preparing') || availability.has('pending_download')) return 'queued';
  if (statuses.has('partially_ready')) return 'partial';
  if (statuses.has('ready')) {
    return statuses.has('unavailable') ? 'partial' : 'ready';
  }
  if (statuses.has('unavailable') || availability.has('unavailable')) return 'unavailable';
  return 'missing';
}

function coverageFor(status: OfflineReadinessAssetStatus, items: LegacyOfflinePrepItemLike[]): OfflineAssetCoverage {
  if (status === 'ready' || status === 'stale' || status === 'expired') {
    const requiredItems = items.filter((item) => item.required === true);
    const evaluatedItems = requiredItems.length > 0 ? requiredItems : items;
    const hasEmptyRequired = evaluatedItems.some((item) => item.availability === 'not_set' || item.count === 0);
    return hasEmptyRequired ? 'partial' : 'complete';
  }
  if (status === 'partial' || status === 'downloading' || status === 'queued') return 'partial';
  if (status === 'missing' || status === 'unavailable' || status === 'failed' || status === 'corrupt') return 'missing';
  return 'unknown';
}

function cacheStateFor(items: LegacyOfflinePrepItemLike[], status: OfflineReadinessAssetStatus): OfflineAssetCacheState {
  if (items.some((item) => item.availability === 'already_cached')) return 'cached';
  if (items.some((item) => /manual|operator/i.test(item.source ?? ''))) return 'manual';
  if (status === 'missing' || status === 'unavailable') return 'missing';
  return 'local';
}

function offlinePolicyFor(kind: OfflineReadinessAssetKind): OfflineProviderOfflinePolicy {
  if (kind === 'map_region') {
    return {
      mode: 'provider_managed_cache',
      allowedOffline: true,
      restrictionLabel: 'Stored through the ECS map provider offline-cache mechanism; redistribution is not implied.',
    };
  }
  if (kind === 'weather_snapshot') {
    return {
      mode: 'snapshot_only',
      allowedOffline: true,
      restrictionLabel: 'Saved forecast snapshot only. Offline use does not refresh provider conditions.',
    };
  }
  if (kind === 'emergency_recovery_packet') {
    return {
      mode: 'manual_only',
      allowedOffline: true,
      restrictionLabel: 'Local editable packet. ECS does not transmit it automatically.',
    };
  }
  return {
    mode: 'local_asset',
    allowedOffline: true,
    restrictionLabel: 'Locally generated ECS expedition asset.',
  };
}

function sourceStamp(
  items: LegacyOfflinePrepItemLike[],
  generatedAt: string,
  status: OfflineReadinessAssetStatus,
): OfflineReadinessSourceStamp {
  return {
    source: items.map((item) => cleanString(item.source)).find(Boolean) ?? 'offline_prep_manifest',
    provider: cleanString(firstMetadataValue(items, ['provider', 'providerSource', 'sourceProvider'])),
    authority: cleanString(firstMetadataValue(items, ['authority', 'sourceAuthority'])),
    observedAt: validIso(firstMetadataValue(items, ['observedAt', 'observationTime', 'lastProviderRefreshAt'])),
    validFrom: validIso(firstMetadataValue(items, ['validFrom', 'forecastValidFrom'])),
    validUntil: validIso(firstMetadataValue(items, ['validUntil', 'expiresAt', 'forecastValidUntil'])),
    retrievedAt: validIso(firstMetadataValue(items, ['retrievedAt', 'fetchedAt', 'generatedAt'])) ?? generatedAt,
    cacheState: cacheStateFor(items, status),
  };
}

function sizeBytesFor(items: LegacyOfflinePrepItemLike[], payload: unknown): number | null {
  const itemSizeMB = items
    .map((item) => finiteNonNegative(item.estimatedSizeMB))
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);
  if (itemSizeMB > 0) return Math.round(itemSizeMB * 1024 * 1024);
  if (payload == null) return null;
  return estimateOfflineAssetBytes(payload);
}

function buildAsset(
  kind: OfflineReadinessAssetKind,
  input: BuildOfflineReadinessManifestInput,
): OfflineReadinessAsset {
  const itemTypes = new Set(ITEM_TYPES_BY_KIND[kind]);
  const items = input.items.filter((item) => itemTypes.has(String(item.type ?? '')));
  const payload = input.contentFingerprints?.[kind] ?? items.map((item) => ({
    type: item.type,
    status: item.status,
    availability: item.availability,
    count: item.count,
    cacheKey: item.cacheKey,
    metadata: item.metadata,
  }));
  const status = mapLegacyStatus(items);
  const checksum = items.length > 0 && status !== 'missing' && status !== 'unavailable'
    ? sha256OfflineAsset(payload)
    : null;
  const isReady = status === 'ready' || status === 'stale' || status === 'expired';
  const cacheRefs = Array.from(new Set(items.map((item) => cleanString(item.cacheKey)).filter((value): value is string => !!value)));
  const source = sourceStamp(items, input.generatedAt, status);
  const expiresAt = source.validUntil;
  return {
    assetId: `${input.packageId}:${kind}`,
    kind,
    label: KIND_LABELS[kind],
    required: items.some((item) => item.required === true) || REQUIRED_DEFAULTS[kind],
    status,
    coverage: coverageFor(status, items),
    source,
    offlinePolicy: offlinePolicyFor(kind),
    integrity: {
      mechanism: kind === 'map_region' ? 'tile_region_completion' : 'sha256',
      expectedChecksum: checksum,
      actualChecksum: isReady ? checksum : null,
      status: isReady && checksum ? 'verified' : checksum ? 'pending' : 'unverified',
      verifiedAt: isReady && checksum ? input.generatedAt : null,
    },
    sizeBytes: sizeBytesFor(items, payload),
    downloadedBytes: isReady ? sizeBytesFor(items, payload) : null,
    expiresAt,
    storageRefs: cacheRefs,
    dependencyAssetIds: kind === 'map_region' || kind === 'navigation_assets'
      ? [`${input.packageId}:route_geometry`]
      : [],
    summary: items.map((item) => cleanString(item.summary)).find(Boolean) ?? `${KIND_LABELS[kind]} is not included.`,
    manualEditable: kind === 'emergency_recovery_packet',
  };
}

function requiredBytes(assets: OfflineReadinessAsset[]): number {
  return assets
    .filter((asset) => asset.required)
    .reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0);
}

function initialManifestState(assets: OfflineReadinessAsset[]): OfflineReadinessManifestState {
  const required = assets.filter((asset) => asset.required);
  if (required.some((asset) => ['failed', 'corrupt'].includes(asset.status))) return 'failed';
  if (required.every((asset) => asset.status === 'ready')) return 'ready';
  if (required.some((asset) => asset.status === 'downloading')) return 'preparing';
  if (required.some((asset) => ['ready', 'queued', 'partial'].includes(asset.status))) return 'partial';
  return 'planned';
}

export function buildOfflineReadinessManifest(
  input: BuildOfflineReadinessManifestInput,
): OfflineReadinessManifest {
  const assets = (Object.keys(KIND_LABELS) as OfflineReadinessAssetKind[])
    .map((kind) => buildAsset(kind, input));
  const estimatedRequiredBytes = requiredBytes(assets);
  return {
    schemaVersion: OFFLINE_READINESS_MANIFEST_SCHEMA_VERSION,
    manifestId: `offline-readiness:${input.packageId}`,
    packageId: input.packageId,
    routeId: input.routeId,
    routeAssetId: cleanString(input.routeAssetId),
    tripPlanId: cleanString(input.tripPlanId),
    expeditionId: cleanString(input.expeditionId),
    generatedAt: validIso(input.generatedAt) ?? new Date(0).toISOString(),
    updatedAt: validIso(input.generatedAt) ?? new Date(0).toISOString(),
    state: initialManifestState(assets),
    assets,
    storage: {
      estimatedRequiredBytes,
      reservedBytes: 0,
      availableBytes: null,
      quotaBytes: null,
      lowSpace: false,
      shortfallBytes: 0,
      evaluatedAt: validIso(input.generatedAt) ?? new Date(0).toISOString(),
    },
    preparation: {
      attemptId: null,
      status: 'idle',
      startedAt: null,
      updatedAt: validIso(input.generatedAt) ?? new Date(0).toISOString(),
      completedAt: null,
      interruptedAt: null,
      retryCount: 0,
      lastErrorCode: null,
    },
    migratedFromSchemaVersion: null,
  };
}

function normalizeAsset(value: unknown, packageId: string, generatedAt: string): OfflineReadinessAsset | null {
  if (!isRecord(value)) return null;
  const kind = cleanString(value.kind) as OfflineReadinessAssetKind | null;
  if (!kind || !(kind in KIND_LABELS)) return null;
  const status = cleanString(value.status) as OfflineReadinessAssetStatus | null;
  const safeStatus: OfflineReadinessAssetStatus = status && [
    'missing', 'queued', 'downloading', 'partial', 'ready', 'stale', 'expired', 'failed', 'corrupt', 'unavailable',
  ].includes(status) ? status : 'missing';
  const source = isRecord(value.source) ? value.source : {};
  const policy = isRecord(value.offlinePolicy) ? value.offlinePolicy : {};
  const integrity = isRecord(value.integrity) ? value.integrity : {};
  const expectedChecksum = cleanString(integrity.expectedChecksum);
  const actualChecksum = cleanString(integrity.actualChecksum);
  const integrityStatus: OfflineAssetIntegrityStatus = expectedChecksum && actualChecksum
    ? expectedChecksum === actualChecksum ? 'verified' : 'corrupt'
    : expectedChecksum ? 'pending' : 'unverified';
  return {
    assetId: cleanString(value.assetId) ?? `${packageId}:${kind}`,
    kind,
    label: cleanString(value.label) ?? KIND_LABELS[kind],
    required: value.required === true,
    status: integrityStatus === 'corrupt' ? 'corrupt' : safeStatus,
    coverage: ['complete', 'partial', 'missing', 'unknown'].includes(String(value.coverage))
      ? value.coverage as OfflineAssetCoverage
      : coverageFor(safeStatus, []),
    source: {
      source: cleanString(source.source) ?? 'migrated_manifest',
      provider: cleanString(source.provider),
      authority: cleanString(source.authority),
      observedAt: validIso(source.observedAt),
      validFrom: validIso(source.validFrom),
      validUntil: validIso(source.validUntil),
      retrievedAt: validIso(source.retrievedAt) ?? generatedAt,
      cacheState: ['local', 'cached', 'last_good', 'manual', 'missing'].includes(String(source.cacheState))
        ? source.cacheState as OfflineAssetCacheState
        : 'cached',
    },
    offlinePolicy: {
      mode: ['local_asset', 'provider_managed_cache', 'snapshot_only', 'manual_only', 'offline_unavailable'].includes(String(policy.mode))
        ? policy.mode as OfflineProviderOfflinePolicy['mode']
        : offlinePolicyFor(kind).mode,
      allowedOffline: typeof policy.allowedOffline === 'boolean' ? policy.allowedOffline : null,
      restrictionLabel: cleanString(policy.restrictionLabel) ?? offlinePolicyFor(kind).restrictionLabel,
    },
    integrity: {
      mechanism: ['sha256', 'tile_region_completion', 'unverified_legacy'].includes(String(integrity.mechanism))
        ? integrity.mechanism as OfflineAssetIntegrityMechanism
        : 'unverified_legacy',
      expectedChecksum,
      actualChecksum,
      status: integrityStatus,
      verifiedAt: integrityStatus === 'verified' ? validIso(integrity.verifiedAt) ?? generatedAt : null,
    },
    sizeBytes: finiteNonNegative(value.sizeBytes),
    downloadedBytes: finiteNonNegative(value.downloadedBytes),
    expiresAt: validIso(value.expiresAt) ?? validIso(source.validUntil),
    storageRefs: Array.isArray(value.storageRefs)
      ? Array.from(new Set(value.storageRefs.map(cleanString).filter((entry): entry is string => !!entry)))
      : [],
    dependencyAssetIds: Array.isArray(value.dependencyAssetIds)
      ? Array.from(new Set(value.dependencyAssetIds.map(cleanString).filter((entry): entry is string => !!entry)))
      : [],
    summary: cleanString(value.summary) ?? `${KIND_LABELS[kind]} migrated from a saved manifest.`,
    manualEditable: value.manualEditable === true || kind === 'emergency_recovery_packet',
  };
}

export function migrateOfflineReadinessManifest(value: unknown): OfflineReadinessManifest | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion === OFFLINE_READINESS_MANIFEST_SCHEMA_VERSION && Array.isArray(value.assets)) {
    const packageId = cleanString(value.packageId);
    const routeId = cleanString(value.routeId);
    const generatedAt = validIso(value.generatedAt) ?? new Date(0).toISOString();
    if (!packageId || !routeId) return null;
    const assets = value.assets
      .map((asset) => normalizeAsset(asset, packageId, generatedAt))
      .filter((asset): asset is OfflineReadinessAsset => !!asset);
    if (assets.length === 0) return null;
    const preparation = isRecord(value.preparation) ? value.preparation : {};
    const storage = isRecord(value.storage) ? value.storage : {};
    return {
      schemaVersion: OFFLINE_READINESS_MANIFEST_SCHEMA_VERSION,
      manifestId: cleanString(value.manifestId) ?? `offline-readiness:${packageId}`,
      packageId,
      routeId,
      routeAssetId: cleanString(value.routeAssetId),
      tripPlanId: cleanString(value.tripPlanId),
      expeditionId: cleanString(value.expeditionId),
      generatedAt,
      updatedAt: validIso(value.updatedAt) ?? generatedAt,
      state: ['planned', 'preparing', 'paused', 'ready', 'partial', 'failed', 'expired'].includes(String(value.state))
        ? value.state as OfflineReadinessManifestState
        : initialManifestState(assets),
      assets,
      storage: {
        estimatedRequiredBytes: finiteNonNegative(storage.estimatedRequiredBytes) ?? requiredBytes(assets),
        reservedBytes: finiteNonNegative(storage.reservedBytes) ?? 0,
        availableBytes: finiteNonNegative(storage.availableBytes),
        quotaBytes: finiteNonNegative(storage.quotaBytes),
        lowSpace: storage.lowSpace === true,
        shortfallBytes: finiteNonNegative(storage.shortfallBytes) ?? 0,
        evaluatedAt: validIso(storage.evaluatedAt) ?? generatedAt,
      },
      preparation: {
        attemptId: cleanString(preparation.attemptId),
        status: ['idle', 'preparing', 'paused', 'complete', 'failed'].includes(String(preparation.status))
          ? preparation.status as OfflineReadinessPreparationState['status']
          : 'idle',
        startedAt: validIso(preparation.startedAt),
        updatedAt: validIso(preparation.updatedAt) ?? generatedAt,
        completedAt: validIso(preparation.completedAt),
        interruptedAt: validIso(preparation.interruptedAt),
        retryCount: Math.max(0, Math.floor(finiteNonNegative(preparation.retryCount) ?? 0)),
        lastErrorCode: cleanString(preparation.lastErrorCode),
      },
      migratedFromSchemaVersion: finiteNonNegative(value.migratedFromSchemaVersion),
    };
  }

  if (Array.isArray(value.items) && cleanString(value.id) && cleanString(value.routeId)) {
    const legacyVersion = finiteNonNegative(value.schemaVersion);
    const migrated = buildOfflineReadinessManifest({
      packageId: cleanString(value.id) as string,
      routeId: cleanString(value.routeId) as string,
      routeAssetId: cleanString(value.routeAssetId),
      tripPlanId: cleanString(value.tripPlanId),
      expeditionId: isRecord(value.lifecycle) && isRecord(value.lifecycle.identity)
        ? cleanString(value.lifecycle.identity.expeditionId)
        : null,
      generatedAt: validIso(value.generatedAt) ?? new Date(0).toISOString(),
      items: value.items as LegacyOfflinePrepItemLike[],
    });
    return { ...migrated, migratedFromSchemaVersion: legacyVersion };
  }
  return null;
}

export function getOfflineReadinessAsset(
  manifest: OfflineReadinessManifest | null | undefined,
  kind: OfflineReadinessAssetKind,
): OfflineReadinessAsset | null {
  return manifest?.assets.find((asset) => asset.kind === kind) ?? null;
}

function issue(
  asset: OfflineReadinessAsset | null,
  severity: OfflineReadinessAuditSeverity,
  code: OfflineReadinessAuditIssue['code'],
  title: string,
  explanation: string,
  recommendedAction: string,
): OfflineReadinessAuditIssue {
  return {
    issueId: `${asset?.assetId ?? 'manifest'}:${code}`,
    assetId: asset?.assetId ?? null,
    kind: asset?.kind ?? (code === 'low_storage' ? 'storage' : 'manifest'),
    severity,
    code,
    title,
    explanation,
    recommendedAction,
  };
}

export function auditOfflineReadinessManifest(
  manifest: OfflineReadinessManifest,
  now: string | number | Date = new Date(),
): OfflineReadinessAudit {
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  const evaluatedAt = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : new Date().toISOString();
  const blockers: OfflineReadinessAuditIssue[] = [];
  const warnings: OfflineReadinessAuditIssue[] = [];

  for (const asset of manifest.assets) {
    const expiresAtMs = asset.expiresAt ? Date.parse(asset.expiresAt) : NaN;
    const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
    const integrityCorrupt = asset.integrity.status === 'corrupt' || (
      !!asset.integrity.expectedChecksum &&
      !!asset.integrity.actualChecksum &&
      asset.integrity.expectedChecksum !== asset.integrity.actualChecksum
    );

    if (integrityCorrupt || asset.status === 'corrupt') {
      const target = asset.required ? blockers : warnings;
      target.push(issue(asset, asset.required ? 'blocker' : 'warning', 'asset_corrupt', `${asset.label} failed integrity verification`, 'The saved asset does not match its expected checksum or supported integrity record.', 'Remove the corrupt copy and retry preparation.'));
      continue;
    }

    if (asset.offlinePolicy.allowedOffline === false || asset.offlinePolicy.mode === 'offline_unavailable') {
      const target = asset.required ? blockers : warnings;
      target.push(issue(asset, asset.required ? 'blocker' : 'warning', 'provider_offline_restricted', `${asset.label} is not permitted offline`, asset.offlinePolicy.restrictionLabel, 'Prepare an approved offline substitute or keep this asset unavailable.'));
      continue;
    }

    if (asset.offlinePolicy.allowedOffline == null) {
      warnings.push(issue(asset, 'warning', 'provider_offline_unknown', `${asset.label} offline policy is unknown`, asset.offlinePolicy.restrictionLabel, 'Verify the provider offline-use policy before relying on this asset.'));
    }

    if (expired || asset.status === 'expired') {
      const target = asset.required ? blockers : warnings;
      target.push(issue(asset, asset.required ? 'blocker' : 'warning', 'asset_expired', `${asset.label} is expired`, 'The saved asset remains available as last-known reference, but it is not current.', 'Refresh the asset when connectivity is available.'));
      continue;
    }

    if (asset.status === 'stale') {
      warnings.push(issue(asset, 'warning', 'asset_stale', `${asset.label} is stale`, 'The cached asset remains usable as last-known reference and must not be presented as live.', 'Refresh when connectivity is available.'));
    }

    if (asset.coverage === 'partial') {
      const target = asset.required ? blockers : warnings;
      target.push(issue(asset, asset.required ? 'blocker' : 'warning', 'partial_coverage', `${asset.label} has partial coverage`, 'Only part of the planned expedition asset is available offline.', 'Complete the missing coverage or explicitly accept the limitation before departure.'));
    }

    if (asset.required && ['missing', 'unavailable'].includes(asset.status)) {
      blockers.push(issue(asset, 'blocker', 'required_asset_missing', `${asset.label} is missing`, asset.summary, 'Prepare this required asset before departure.'));
      continue;
    }
    if (asset.required && ['queued', 'downloading', 'partial', 'failed'].includes(asset.status)) {
      blockers.push(issue(asset, 'blocker', 'required_asset_incomplete', `${asset.label} is incomplete`, asset.summary, asset.status === 'failed' ? 'Retry the failed preparation step.' : 'Allow preparation to finish before departure.'));
      continue;
    }
    if (!asset.required && ['missing', 'unavailable', 'failed'].includes(asset.status)) {
      warnings.push(issue(asset, 'warning', 'optional_asset_missing', `${asset.label} is unavailable`, asset.summary, 'Add or refresh this optional asset if it is operationally relevant.'));
    }
    if (asset.required && asset.integrity.status === 'unverified') {
      warnings.push(issue(asset, 'warning', 'integrity_unverified', `${asset.label} integrity is unverified`, 'This legacy or provider-managed asset has no verified checksum yet.', 'Re-prepare the asset to record integrity evidence.'));
    }
  }

  if (manifest.storage.lowSpace || manifest.storage.shortfallBytes > 0) {
    blockers.push(issue(null, 'blocker', 'low_storage', 'Insufficient offline storage', `The package is short ${manifest.storage.shortfallBytes} bytes of required storage.`, 'Free deliberate, unprotected offline storage or increase the cache quota.'));
  }

  const requiredAssets = manifest.assets.filter((asset) => asset.required);
  const readyRequiredAssets = requiredAssets.filter((asset) => (
    ['ready', 'stale'].includes(asset.status) &&
    asset.coverage === 'complete' &&
    asset.integrity.status !== 'corrupt'
  )).length;
  const status = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'caution' : 'ready';
  const summary = status === 'ready'
    ? `All ${requiredAssets.length} required offline assets are ready.`
    : status === 'caution'
      ? `Required offline assets are usable with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`
      : `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} must be resolved before this package is ready.`;
  return {
    manifestId: manifest.manifestId,
    evaluatedAt,
    status,
    blockers,
    warnings,
    readyRequiredAssets,
    totalRequiredAssets: requiredAssets.length,
    summary,
  };
}

function redactId(value: string | null): string | null {
  return value ? `redacted-${sha256OfflineAsset(value).slice(0, 12)}` : null;
}

export function redactOfflineReadinessManifestForSupport(manifest: OfflineReadinessManifest): Record<string, unknown> {
  return {
    schemaVersion: manifest.schemaVersion,
    manifestId: redactId(manifest.manifestId),
    packageId: redactId(manifest.packageId),
    routeId: redactId(manifest.routeId),
    routeAssetId: redactId(manifest.routeAssetId),
    tripPlanId: redactId(manifest.tripPlanId),
    expeditionId: redactId(manifest.expeditionId),
    generatedAt: manifest.generatedAt,
    updatedAt: manifest.updatedAt,
    state: manifest.state,
    storage: { ...manifest.storage },
    preparation: {
      ...manifest.preparation,
      attemptId: redactId(manifest.preparation.attemptId),
    },
    assets: manifest.assets.map((asset) => ({
      assetId: redactId(asset.assetId),
      kind: asset.kind,
      required: asset.required,
      status: asset.status,
      coverage: asset.coverage,
      sizeBytes: asset.sizeBytes,
      downloadedBytes: asset.downloadedBytes,
      expiresAt: asset.expiresAt,
      source: {
        source: asset.source.source,
        provider: asset.source.provider,
        authority: asset.source.authority,
        observedAt: asset.source.observedAt,
        validFrom: asset.source.validFrom,
        validUntil: asset.source.validUntil,
        retrievedAt: asset.source.retrievedAt,
        cacheState: asset.source.cacheState,
      },
      offlinePolicy: { ...asset.offlinePolicy },
      integrity: {
        mechanism: asset.integrity.mechanism,
        status: asset.integrity.status,
        verifiedAt: asset.integrity.verifiedAt,
      },
      storageRefCount: asset.storageRefs.length,
      manualEditable: asset.manualEditable,
    })),
  };
}

export function planOfflineStorageEviction(input: {
  manifests: OfflineReadinessManifest[];
  requestedBytes: number;
  activeExpeditionId?: string | null;
  activeRouteId?: string | null;
}): OfflineStorageEvictionPlan {
  const requestedBytes = Math.max(0, Math.round(input.requestedBytes));
  const candidates: OfflineStorageEvictionCandidate[] = [];
  for (const manifest of input.manifests) {
    for (const asset of manifest.assets) {
      if (asset.kind !== 'map_region' && asset.storageRefs.length === 0) continue;
      const activeExpedition = !!input.activeExpeditionId && manifest.expeditionId === input.activeExpeditionId;
      const activeRoute = !!input.activeRouteId && (
        manifest.routeId === input.activeRouteId || manifest.routeAssetId === input.activeRouteId
      );
      const preparing = manifest.preparation.status === 'preparing';
      const protectedAsset = activeExpedition || activeRoute || preparing;
      const protectionReason = activeExpedition
        ? 'Required by active expedition'
        : activeRoute
          ? 'Required by active route'
          : preparing
            ? 'Preparation is in progress'
            : null;
      const expired = asset.expiresAt != null && Date.parse(asset.expiresAt) <= Date.now();
      const priority = (asset.required ? 0 : 40) + (expired ? 30 : 0) + (asset.status === 'failed' || asset.status === 'corrupt' ? 50 : 0);
      const refs = asset.storageRefs.length > 0 ? asset.storageRefs : [null];
      refs.forEach((regionId, index) => {
        candidates.push({
          manifestId: manifest.manifestId,
          assetId: asset.assetId,
          regionId,
          sizeBytes: Math.round((asset.sizeBytes ?? 0) / Math.max(1, refs.length)),
          lastAccessedAt: asset.integrity.verifiedAt ?? asset.source.retrievedAt ?? manifest.updatedAt,
          protected: protectedAsset,
          protectionReason,
          priority: priority - index,
        });
      });
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || a.lastAccessedAt.localeCompare(b.lastAccessedAt));
  const available = candidates.filter((candidate) => !candidate.protected);
  const selected: OfflineStorageEvictionCandidate[] = [];
  let selectedBytes = 0;
  for (const candidate of available) {
    if (selectedBytes >= requestedBytes) break;
    selected.push(candidate);
    selectedBytes += candidate.sizeBytes;
  }
  const reclaimableBytes = available.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
  return {
    requestedBytes,
    reclaimableBytes,
    selectedBytes,
    candidates,
    selected,
    protected: candidates.filter((candidate) => candidate.protected),
    shortfallBytes: Math.max(0, requestedBytes - selectedBytes),
  };
}
