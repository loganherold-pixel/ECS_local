import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  auditOfflineReadinessManifest,
  getOfflineReadinessAsset,
  migrateOfflineReadinessManifest,
  sha256OfflineAsset,
  type OfflineReadinessAsset,
  type OfflineReadinessAssetKind,
  type OfflineReadinessAssetStatus,
  type OfflineReadinessAudit,
  type OfflineReadinessManifest,
} from './offlineReadinessManifest';

export const OFFLINE_READINESS_COORDINATOR_SCHEMA_VERSION = 1;
export const OFFLINE_READINESS_COORDINATOR_STORAGE_KEY = 'offline_readiness_manifest_state';
const MAX_MANIFESTS = 24;

export interface OfflineReadinessCoordinatorStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  flush(): Promise<void>;
  waitForHydration(): Promise<void>;
}

export interface OfflineTileJobLike {
  regionId: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled';
  progress?: {
    totalTiles?: number;
    downloadedTiles?: number;
    downloadedSizeMB?: number;
  } | null;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface OfflineTileRegionLike {
  id: string;
  status: 'pending' | 'downloading' | 'complete' | 'partial' | 'error' | 'cancelled';
  tileCount: number;
  downloadedTiles: number;
  estimatedSizeMB: number;
  actualSizeMB: number;
  completedAt?: string | null;
  bounds?: unknown;
  zoomMin?: number;
  zoomMax?: number;
  styleKey?: string;
}

interface PersistedOfflineReadinessState {
  schemaVersion: typeof OFFLINE_READINESS_COORDINATOR_SCHEMA_VERSION;
  manifests: OfflineReadinessManifest[];
  updatedAt: string;
}

export interface OfflineReadinessCoordinator {
  subscribe(listener: () => void): () => void;
  waitForHydration(): Promise<void>;
  flush(): Promise<void>;
  listManifests(): OfflineReadinessManifest[];
  getManifest(manifestId: string): OfflineReadinessManifest | null;
  getLatestForRoute(routeId: string | null | undefined): OfflineReadinessManifest | null;
  upsertManifest(manifest: OfflineReadinessManifest): OfflineReadinessManifest;
  beginPreparation(manifest: OfflineReadinessManifest, storage?: { availableBytes?: number | null; quotaBytes?: number | null }): OfflineReadinessManifest;
  attachMapRegions(manifestId: string, regions: OfflineTileRegionLike[]): OfflineReadinessManifest | null;
  updateAsset(manifestId: string, kind: OfflineReadinessAssetKind, update: Partial<OfflineReadinessAsset> & { actualPayload?: unknown }): OfflineReadinessManifest | null;
  failPreparation(manifestId: string, code: string): OfflineReadinessManifest | null;
  restoreInterruptedPreparations(): OfflineReadinessManifest[];
  reconcileTileState(jobs: OfflineTileJobLike[], regions: OfflineTileRegionLike[]): OfflineReadinessManifest[];
  audit(manifestId: string, now?: string | number | Date): OfflineReadinessAudit | null;
  getRegionProtectionReason(regionId: string, context?: { activeExpeditionId?: string | null; activeRouteId?: string | null }): string | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(now: () => string): string {
  const value = now();
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function manifestStateFromAudit(audit: OfflineReadinessAudit, preparationStatus: OfflineReadinessManifest['preparation']['status']): OfflineReadinessManifest['state'] {
  if (preparationStatus === 'preparing') return 'preparing';
  if (preparationStatus === 'paused') return 'paused';
  if (audit.status === 'ready') return 'ready';
  if (audit.status === 'caution') return 'partial';
  return audit.blockers.some((entry) => entry.code === 'asset_corrupt') ? 'failed' : 'partial';
}

function normalizeState(raw: string | null): PersistedOfflineReadinessState {
  if (!raw) {
    return { schemaVersion: OFFLINE_READINESS_COORDINATOR_SCHEMA_VERSION, manifests: [], updatedAt: new Date(0).toISOString() };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sourceManifests = Array.isArray(parsed?.manifests)
      ? parsed.manifests
      : Array.isArray(parsed)
        ? parsed
        : [];
    const manifests = sourceManifests
      .map(migrateOfflineReadinessManifest)
      .filter((manifest): manifest is OfflineReadinessManifest => !!manifest)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_MANIFESTS);
    return {
      schemaVersion: OFFLINE_READINESS_COORDINATOR_SCHEMA_VERSION,
      manifests,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : manifests[0]?.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return { schemaVersion: OFFLINE_READINESS_COORDINATOR_SCHEMA_VERSION, manifests: [], updatedAt: new Date(0).toISOString() };
  }
}

function mergeManifest(existing: OfflineReadinessManifest | null, incoming: OfflineReadinessManifest): OfflineReadinessManifest {
  if (!existing) return clone(incoming);
  const existingByKind = new Map(existing.assets.map((asset) => [asset.kind, asset]));
  const assets = incoming.assets.map((asset) => {
    const current = existingByKind.get(asset.kind);
    if (!current) return asset;
    const preserveRuntimeMap = asset.kind === 'map_region' && (
      current.storageRefs.length > 0 ||
      ['queued', 'downloading', 'ready', 'partial', 'failed', 'corrupt'].includes(current.status)
    );
    if (!preserveRuntimeMap) return asset;
    return {
      ...asset,
      status: current.status,
      coverage: current.coverage,
      integrity: current.integrity,
      downloadedBytes: current.downloadedBytes,
      storageRefs: current.storageRefs,
      summary: current.summary,
    };
  });
  return {
    ...incoming,
    generatedAt: existing.generatedAt,
    updatedAt: incoming.updatedAt,
    state: existing.state,
    assets,
    storage: existing.storage,
    preparation: existing.preparation,
    migratedFromSchemaVersion: existing.migratedFromSchemaVersion ?? incoming.migratedFromSchemaVersion,
  };
}

export function createOfflineReadinessCoordinator(input: {
  storage: OfflineReadinessCoordinatorStorage;
  now?: () => string;
}): OfflineReadinessCoordinator {
  const now = input.now ?? (() => new Date().toISOString());
  const listeners = new Set<() => void>();
  let state = normalizeState(input.storage.get(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY));
  let hydrated = false;

  function persist(notify = true): void {
    state = {
      ...state,
      manifests: [...state.manifests]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_MANIFESTS),
      updatedAt: nowIso(now),
    };
    input.storage.set(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY, JSON.stringify(state));
    if (notify) listeners.forEach((listener) => listener());
  }

  function replaceManifest(manifest: OfflineReadinessManifest): OfflineReadinessManifest {
    const index = state.manifests.findIndex((entry) => entry.manifestId === manifest.manifestId);
    if (index >= 0) state.manifests[index] = manifest;
    else state.manifests.push(manifest);
    persist();
    return clone(manifest);
  }

  function finalize(manifest: OfflineReadinessManifest, timestamp: string): OfflineReadinessManifest {
    const audit = auditOfflineReadinessManifest(manifest, timestamp);
    const allRequiredTerminal = manifest.assets
      .filter((asset) => asset.required)
      .every((asset) => !['queued', 'downloading'].includes(asset.status));
    return {
      ...manifest,
      state: manifestStateFromAudit(audit, manifest.preparation.status),
      updatedAt: timestamp,
      preparation: allRequiredTerminal && manifest.preparation.status === 'preparing'
        ? {
            ...manifest.preparation,
            status: audit.status === 'blocked' ? 'failed' : 'complete',
            completedAt: timestamp,
            updatedAt: timestamp,
            lastErrorCode: audit.status === 'blocked' ? audit.blockers[0]?.code ?? 'readiness_blocked' : null,
          }
        : manifest.preparation,
    };
  }

  function updateMapFromRuntime(
    manifest: OfflineReadinessManifest,
    jobs: OfflineTileJobLike[],
    regions: OfflineTileRegionLike[],
    timestamp: string,
  ): OfflineReadinessManifest {
    const mapAsset = getOfflineReadinessAsset(manifest, 'map_region');
    if (!mapAsset || mapAsset.storageRefs.length === 0) return manifest;
    const referencedRegions = mapAsset.storageRefs
      .map((regionId) => regions.find((region) => region.id === regionId))
      .filter((region): region is OfflineTileRegionLike => !!region);
    const referencedJobs = mapAsset.storageRefs
      .map((regionId) => jobs.find((job) => job.regionId === regionId))
      .filter((job): job is OfflineTileJobLike => !!job);
    if (referencedRegions.length === 0 && referencedJobs.length === 0) {
      const missingAsset: OfflineReadinessAsset = {
        ...mapAsset,
        status: 'missing',
        coverage: 'missing',
        downloadedBytes: null,
        integrity: {
          ...mapAsset.integrity,
          actualChecksum: null,
          status: mapAsset.integrity.expectedChecksum ? 'pending' : 'unverified',
          verifiedAt: null,
        },
        summary: 'The manifest references offline map regions that are no longer present in local storage.',
      };
      return {
        ...manifest,
        assets: manifest.assets.map((asset) => asset.kind === 'map_region' ? missingAsset : asset),
        updatedAt: timestamp,
      };
    }

    const allComplete = referencedRegions.length === mapAsset.storageRefs.length && referencedRegions.every((region) => (
      region.status === 'complete' && region.tileCount > 0 && region.downloadedTiles >= region.tileCount
    ));
    const anyActive = referencedJobs.some((job) => job.status === 'running' || job.status === 'pending') ||
      referencedRegions.some((region) => region.status === 'downloading' || region.status === 'pending');
    const anyFailure = referencedJobs.some((job) => job.status === 'error') ||
      referencedRegions.some((region) => region.status === 'error');
    const anyComplete = referencedRegions.some((region) => region.status === 'complete');
    const descriptor = referencedRegions.map((region) => ({
      id: region.id,
      tileCount: region.tileCount,
      bounds: region.bounds,
      zoomMin: region.zoomMin,
      zoomMax: region.zoomMax,
      styleKey: region.styleKey,
    }));
    const checksum = descriptor.length > 0 ? sha256OfflineAsset(descriptor) : mapAsset.integrity.expectedChecksum;
    const downloadedBytes = Math.round(referencedRegions.reduce((sum, region) => (
      sum + Math.max(0, region.actualSizeMB || 0) * 1024 * 1024
    ), 0));
    const status: OfflineReadinessAssetStatus = allComplete
      ? 'ready'
      : anyActive
        ? 'downloading'
        : anyFailure && anyComplete
          ? 'partial'
          : anyFailure
            ? 'failed'
            : anyComplete
              ? 'partial'
              : 'missing';
    const nextAsset: OfflineReadinessAsset = {
      ...mapAsset,
      status,
      coverage: allComplete ? 'complete' : anyComplete ? 'partial' : status === 'downloading' ? 'partial' : 'missing',
      downloadedBytes: downloadedBytes > 0 ? downloadedBytes : null,
      integrity: {
        ...mapAsset.integrity,
        mechanism: 'tile_region_completion',
        expectedChecksum: checksum,
        actualChecksum: allComplete ? checksum : null,
        status: allComplete && checksum ? 'verified' : checksum ? 'pending' : 'unverified',
        verifiedAt: allComplete ? timestamp : null,
      },
      summary: allComplete
        ? `${referencedRegions.length} required map region${referencedRegions.length === 1 ? '' : 's'} passed tile-count and region metadata verification.`
        : anyFailure
          ? 'One or more required map regions failed. Completed regions remain available while retry is pending.'
          : status === 'missing'
            ? 'Required map region storage is missing and must be prepared again.'
            : 'Required map region preparation is queued or downloading.',
    };
    return {
      ...manifest,
      assets: manifest.assets.map((asset) => asset.kind === 'map_region' ? nextAsset : asset),
      updatedAt: timestamp,
    };
  }

  const hydrationPromise = input.storage.waitForHydration().then(() => {
    state = normalizeState(input.storage.get(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY));
    hydrated = true;
    const interrupted = state.manifests.some((manifest) => (
      manifest.preparation.status === 'preparing' || manifest.assets.some((asset) => asset.status === 'downloading')
    ));
    if (interrupted) {
      const timestamp = nowIso(now);
      state.manifests = state.manifests.map((manifest) => {
        if (manifest.preparation.status !== 'preparing' && !manifest.assets.some((asset) => asset.status === 'downloading')) return manifest;
        return {
          ...manifest,
          state: 'paused',
          updatedAt: timestamp,
          assets: manifest.assets.map((asset) => asset.status === 'downloading' ? { ...asset, status: 'queued' as const } : asset),
          preparation: {
            ...manifest.preparation,
            status: 'paused',
            interruptedAt: timestamp,
            updatedAt: timestamp,
            retryCount: manifest.preparation.retryCount + 1,
            lastErrorCode: 'app_interrupted',
          },
        };
      });
      persist();
    } else {
      listeners.forEach((listener) => listener());
    }
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    waitForHydration() {
      return hydrationPromise;
    },
    flush() {
      return input.storage.flush();
    },
    listManifests() {
      return clone(state.manifests);
    },
    getManifest(manifestId) {
      const found = state.manifests.find((manifest) => manifest.manifestId === manifestId);
      return found ? clone(found) : null;
    },
    getLatestForRoute(routeId) {
      const normalized = String(routeId ?? '').trim();
      if (!normalized) return null;
      const found = state.manifests.find((manifest) => (
        manifest.routeId === normalized ||
        manifest.routeAssetId === normalized ||
        manifest.packageId === normalized
      ));
      return found ? clone(found) : null;
    },
    upsertManifest(manifest) {
      const migrated = migrateOfflineReadinessManifest(manifest);
      if (!migrated) throw new Error('Offline readiness manifest is invalid.');
      const existing = state.manifests.find((entry) => entry.manifestId === migrated.manifestId) ?? null;
      return replaceManifest(mergeManifest(existing, migrated));
    },
    beginPreparation(manifest, storage = {}) {
      const timestamp = nowIso(now);
      const current = mergeManifest(
        state.manifests.find((entry) => entry.manifestId === manifest.manifestId) ?? null,
        manifest,
      );
      const availableBytes = typeof storage.availableBytes === 'number' && Number.isFinite(storage.availableBytes)
        ? Math.max(0, Math.round(storage.availableBytes))
        : null;
      const requiredBytes = current.storage.estimatedRequiredBytes;
      const shortfallBytes = availableBytes == null ? 0 : Math.max(0, requiredBytes - availableBytes);
      const next: OfflineReadinessManifest = {
        ...current,
        state: shortfallBytes > 0 ? 'failed' : 'preparing',
        updatedAt: timestamp,
        storage: {
          ...current.storage,
          availableBytes,
          quotaBytes: typeof storage.quotaBytes === 'number' && Number.isFinite(storage.quotaBytes)
            ? Math.max(0, Math.round(storage.quotaBytes))
            : current.storage.quotaBytes,
          reservedBytes: shortfallBytes > 0 ? 0 : requiredBytes,
          lowSpace: shortfallBytes > 0,
          shortfallBytes,
          evaluatedAt: timestamp,
        },
        preparation: {
          attemptId: current.preparation.attemptId ?? `offline-preparation:${current.packageId}:${timestamp}`,
          status: shortfallBytes > 0 ? 'failed' : 'preparing',
          startedAt: current.preparation.startedAt ?? timestamp,
          updatedAt: timestamp,
          completedAt: null,
          interruptedAt: null,
          retryCount: current.preparation.retryCount,
          lastErrorCode: shortfallBytes > 0 ? 'low_storage' : null,
        },
      };
      return replaceManifest(next);
    },
    attachMapRegions(manifestId, regions) {
      const manifest = state.manifests.find((entry) => entry.manifestId === manifestId);
      const mapAsset = getOfflineReadinessAsset(manifest, 'map_region');
      if (!manifest || !mapAsset) return null;
      const timestamp = nowIso(now);
      const refs = Array.from(new Set(regions.map((region) => region.id).filter(Boolean)));
      const descriptor = regions.map((region) => ({
        id: region.id,
        tileCount: region.tileCount,
        bounds: region.bounds,
        zoomMin: region.zoomMin,
        zoomMax: region.zoomMax,
        styleKey: region.styleKey,
      }));
      const checksum = descriptor.length > 0 ? sha256OfflineAsset(descriptor) : null;
      const allComplete = regions.length > 0 && regions.every((region) => (
        region.status === 'complete' && region.tileCount > 0 && region.downloadedTiles >= region.tileCount
      ));
      const nextAsset: OfflineReadinessAsset = {
        ...mapAsset,
        status: allComplete ? 'ready' : 'queued',
        coverage: allComplete ? 'complete' : 'partial',
        storageRefs: refs,
        sizeBytes: Math.round(regions.reduce((sum, region) => sum + Math.max(0, region.estimatedSizeMB) * 1024 * 1024, 0)),
        integrity: {
          mechanism: 'tile_region_completion',
          expectedChecksum: checksum,
          actualChecksum: allComplete ? checksum : null,
          status: allComplete && checksum ? 'verified' : checksum ? 'pending' : 'unverified',
          verifiedAt: allComplete ? timestamp : null,
        },
      };
      return replaceManifest(finalize({
        ...manifest,
        updatedAt: timestamp,
        assets: manifest.assets.map((asset) => asset.kind === 'map_region' ? nextAsset : asset),
      }, timestamp));
    },
    updateAsset(manifestId, kind, update) {
      const manifest = state.manifests.find((entry) => entry.manifestId === manifestId);
      const asset = getOfflineReadinessAsset(manifest, kind);
      if (!manifest || !asset) return null;
      const timestamp = nowIso(now);
      const actualChecksum = update.actualPayload === undefined
        ? update.integrity?.actualChecksum ?? asset.integrity.actualChecksum
        : sha256OfflineAsset(update.actualPayload);
      const expectedChecksum = update.integrity?.expectedChecksum ?? asset.integrity.expectedChecksum;
      const corrupt = !!expectedChecksum && !!actualChecksum && expectedChecksum !== actualChecksum;
      const nextAsset: OfflineReadinessAsset = {
        ...asset,
        ...update,
        status: corrupt ? 'corrupt' : update.status ?? asset.status,
        integrity: {
          ...asset.integrity,
          ...update.integrity,
          expectedChecksum,
          actualChecksum,
          status: corrupt ? 'corrupt' : expectedChecksum && actualChecksum ? 'verified' : expectedChecksum ? 'pending' : 'unverified',
          verifiedAt: !corrupt && expectedChecksum && actualChecksum ? timestamp : update.integrity?.verifiedAt ?? asset.integrity.verifiedAt,
        },
      };
      delete (nextAsset as OfflineReadinessAsset & { actualPayload?: unknown }).actualPayload;
      return replaceManifest(finalize({
        ...manifest,
        assets: manifest.assets.map((entry) => entry.kind === kind ? nextAsset : entry),
        updatedAt: timestamp,
      }, timestamp));
    },
    failPreparation(manifestId, code) {
      const manifest = state.manifests.find((entry) => entry.manifestId === manifestId);
      if (!manifest) return null;
      const timestamp = nowIso(now);
      return replaceManifest({
        ...manifest,
        state: 'failed',
        updatedAt: timestamp,
        preparation: {
          ...manifest.preparation,
          status: 'failed',
          updatedAt: timestamp,
          completedAt: timestamp,
          lastErrorCode: code,
        },
      });
    },
    restoreInterruptedPreparations() {
      if (!hydrated) return [];
      const timestamp = nowIso(now);
      const restored: OfflineReadinessManifest[] = [];
      state.manifests = state.manifests.map((manifest) => {
        if (manifest.preparation.status !== 'preparing' && !manifest.assets.some((asset) => asset.status === 'downloading')) return manifest;
        const next: OfflineReadinessManifest = {
          ...manifest,
          state: 'paused',
          updatedAt: timestamp,
          assets: manifest.assets.map((asset) => asset.status === 'downloading' ? { ...asset, status: 'queued' } : asset),
          preparation: {
            ...manifest.preparation,
            status: 'paused',
            interruptedAt: timestamp,
            updatedAt: timestamp,
            retryCount: manifest.preparation.retryCount + 1,
            lastErrorCode: 'app_interrupted',
          },
        };
        restored.push(next);
        return next;
      });
      if (restored.length > 0) persist();
      return clone(restored);
    },
    reconcileTileState(jobs, regions) {
      const timestamp = nowIso(now);
      const changed: OfflineReadinessManifest[] = [];
      state.manifests = state.manifests.map((manifest) => {
        const next = finalize(updateMapFromRuntime(manifest, jobs, regions, timestamp), timestamp);
        if (JSON.stringify(next) !== JSON.stringify(manifest)) changed.push(next);
        return next;
      });
      if (changed.length > 0) persist();
      return clone(changed);
    },
    audit(manifestId, at = new Date()) {
      const manifest = state.manifests.find((entry) => entry.manifestId === manifestId);
      return manifest ? auditOfflineReadinessManifest(manifest, at) : null;
    },
    getRegionProtectionReason(regionId, context = {}) {
      const manifest = state.manifests.find((entry) => {
        const mapAsset = getOfflineReadinessAsset(entry, 'map_region');
        return mapAsset?.storageRefs.includes(regionId);
      });
      if (!manifest) return null;
      if (manifest.preparation.status === 'preparing') return 'Offline package preparation is in progress';
      if (context.activeExpeditionId && manifest.expeditionId === context.activeExpeditionId) return 'Required by active expedition';
      if (context.activeRouteId && (
        manifest.routeId === context.activeRouteId || manifest.routeAssetId === context.activeRouteId
      )) return 'Required by active route';
      return null;
    },
  };
}

const defaultPersistence = createPersistedKeyValueCache('ecs_offline_readiness_manifest');

export const offlineReadinessCoordinator = createOfflineReadinessCoordinator({
  storage: defaultPersistence,
});
