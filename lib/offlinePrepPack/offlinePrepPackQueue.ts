import type { OfflineTileSyncJob, OfflineTileSyncSnapshot } from '../offlineTileSyncCoordinator';
import type { TileCacheRegion } from '../tileCacheStore';
import type { OfflinePrepPackItem, OfflinePrepPackManifest } from './offlinePrepPackTypes';

export type OfflinePrepMapQueueStatus =
  | 'not_requested'
  | 'queued'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'unavailable';

export type OfflinePrepMapQueueState = {
  status: OfflinePrepMapQueueStatus;
  label: string;
  message: string;
  regionId: string | null;
  jobId: string | null;
  percent: number;
  totalTiles: number | null;
  downloadedTiles: number | null;
  failedTiles: number | null;
  estimatedSizeMB: number | null;
  downloadedSizeMB: number | null;
  errorMessage: string | null;
  retryable: boolean;
  active: boolean;
  source: 'sync_job' | 'tile_region' | 'manifest';
  updatedAt: string | null;
};

function compactId(value: string): string {
  return String(value ?? 'route').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'route';
}

export function getOfflinePrepRouteCacheRunId(routeId: string): string {
  return `offline-prep-${compactId(routeId)}`;
}

function clampPercent(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function offlineMapItem(manifest: OfflinePrepPackManifest): OfflinePrepPackItem | null {
  return manifest.items.find((item) => item.type === 'offline_map') ?? null;
}

function metadataString(item: OfflinePrepPackItem | null, key: string): string | null {
  const value = item?.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function routeIdFromJob(job: OfflineTileSyncJob): string | null {
  const readinessSnapshot = job.routeIntent?.readinessSnapshot;
  if (!readinessSnapshot || typeof readinessSnapshot !== 'object') return null;
  const manifest = (readinessSnapshot as Record<string, unknown>).offlinePrepManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const routeId = (manifest as Record<string, unknown>).routeId;
  return typeof routeId === 'string' && routeId.trim().length > 0 ? routeId : null;
}

function jobMatches(job: OfflineTileSyncJob, manifest: OfflinePrepPackManifest, regionId: string | null): boolean {
  if (regionId && job.regionId === regionId) return true;
  return routeIdFromJob(job) === manifest.routeId;
}

function regionMatches(region: TileCacheRegion, manifest: OfflinePrepPackManifest, item: OfflinePrepPackItem | null): boolean {
  const regionId = item?.cacheKey ?? metadataString(item, 'regionId');
  if (regionId && region.id === regionId) return true;
  const routeIds = new Set([manifest.routeId, getOfflinePrepRouteCacheRunId(manifest.routeId)]);
  if (region.routeId && routeIds.has(region.routeId)) return true;
  const routeIntentManifest = region.routeIntent?.readinessSnapshot;
  if (routeIntentManifest && typeof routeIntentManifest === 'object') {
    const prepManifest = (routeIntentManifest as Record<string, unknown>).offlinePrepManifest;
    if (prepManifest && typeof prepManifest === 'object') {
      return (prepManifest as Record<string, unknown>).routeId === manifest.routeId;
    }
  }
  return false;
}

function stateFromJob(job: OfflineTileSyncJob): OfflinePrepMapQueueState {
  const progress = job.progress;
  const percent = job.status === 'complete' ? 100 : clampPercent(progress?.percent);
  const isActive = job.status === 'pending' || job.status === 'running';
  const status: OfflinePrepMapQueueStatus =
    job.status === 'complete'
      ? 'complete'
      : job.status === 'error'
        ? 'failed'
        : job.status === 'cancelled'
          ? 'cancelled'
          : job.status === 'pending'
            ? 'queued'
            : 'downloading';
  const label =
    status === 'complete'
      ? 'MAP READY'
      : status === 'failed'
        ? 'MAP FAILED'
        : status === 'cancelled'
          ? 'MAP CANCELLED'
          : status === 'queued'
            ? 'MAP QUEUED'
            : `MAP DOWNLOADING ${percent}%`;
  return {
    status,
    label,
    message:
      job.errorMessage ??
      progress?.message ??
      (status === 'queued'
        ? 'Offline map preparation is queued and will resume when ECS is active.'
        : status === 'complete'
          ? 'Offline map tiles are cached for this route.'
          : status === 'cancelled'
            ? 'Offline map preparation was cancelled. Retry when coverage is still needed.'
            : 'Offline map tiles are downloading through the shared route-cache queue.'),
    regionId: job.regionId,
    jobId: job.jobId,
    percent,
    totalTiles: progress?.totalTiles ?? null,
    downloadedTiles: progress?.downloadedTiles ?? null,
    failedTiles: progress?.failedTiles ?? null,
    estimatedSizeMB: progress?.estimatedSizeMB ?? null,
    downloadedSizeMB: progress?.downloadedSizeMB ?? null,
    errorMessage: job.errorMessage ?? (status === 'failed' ? progress?.message ?? 'Offline map preparation failed.' : null),
    retryable: status === 'failed' || status === 'cancelled',
    active: isActive,
    source: 'sync_job',
    updatedAt: job.updatedAt,
  };
}

function stateFromRegion(region: TileCacheRegion): OfflinePrepMapQueueState {
  const percent = region.tileCount > 0 ? clampPercent((region.downloadedTiles / region.tileCount) * 100) : 0;
  const status: OfflinePrepMapQueueStatus =
    region.status === 'complete'
      ? 'complete'
      : region.status === 'error'
        ? 'failed'
        : region.status === 'cancelled'
          ? 'cancelled'
          : region.status === 'downloading'
            ? 'downloading'
            : 'queued';
  return {
    status,
    label:
      status === 'complete'
        ? 'MAP READY'
        : status === 'failed'
          ? 'MAP FAILED'
          : status === 'cancelled'
            ? 'MAP CANCELLED'
            : status === 'queued'
              ? 'MAP QUEUED'
              : `MAP DOWNLOADING ${percent}%`,
    message:
      region.errorMessage ??
      (status === 'complete'
        ? 'Offline map tiles are cached for this route.'
        : status === 'failed'
          ? 'Offline map preparation failed. Retry keeps the same saved route region.'
          : status === 'cancelled'
            ? 'Offline map preparation was cancelled. Retry keeps the same saved route region.'
            : status === 'queued'
              ? 'Offline map preparation is saved and waiting for the route-cache queue.'
              : 'Offline map tiles are downloading through the shared route-cache queue.'),
    regionId: region.id,
    jobId: null,
    percent: status === 'complete' ? 100 : percent,
    totalTiles: region.tileCount,
    downloadedTiles: region.downloadedTiles,
    failedTiles: null,
    estimatedSizeMB: region.estimatedSizeMB,
    downloadedSizeMB: region.actualSizeMB,
    errorMessage: status === 'failed' ? region.errorMessage ?? 'Offline map preparation failed.' : null,
    retryable: status === 'failed' || status === 'cancelled',
    active: status === 'queued' || status === 'downloading',
    source: 'tile_region',
    updatedAt: region.completedAt ?? region.downloadedAt ?? null,
  };
}

export function resolveOfflinePrepMapQueueState(input: {
  manifest: OfflinePrepPackManifest | null;
  syncSnapshot: OfflineTileSyncSnapshot | null;
  regions: TileCacheRegion[];
}): OfflinePrepMapQueueState | null {
  const { manifest, syncSnapshot, regions } = input;
  if (!manifest) return null;
  const item = offlineMapItem(manifest);
  if (!item) return null;
  const explicitRegionId = item.cacheKey ?? metadataString(item, 'regionId');

  const jobs = syncSnapshot?.jobs ?? [];
  const matchingJob = jobs.find((job) => jobMatches(job, manifest, explicitRegionId));
  if (matchingJob) return stateFromJob(matchingJob);

  const matchingRegion =
    regions.find((region) => regionMatches(region, manifest, item)) ??
    (explicitRegionId ? regions.find((region) => region.id === explicitRegionId) : null);
  if (matchingRegion) return stateFromRegion(matchingRegion);

  if (item.status === 'ready' || item.availability === 'already_cached') {
    return {
      status: 'complete',
      label: 'MAP READY',
      message: item.summary,
      regionId: item.cacheKey ?? explicitRegionId ?? null,
      jobId: null,
      percent: 100,
      totalTiles: null,
      downloadedTiles: null,
      failedTiles: null,
      estimatedSizeMB: item.estimatedSizeMB ?? null,
      downloadedSizeMB: item.estimatedSizeMB ?? null,
      errorMessage: null,
      retryable: false,
      active: false,
      source: 'manifest',
      updatedAt: null,
    };
  }

  if (item.status === 'unavailable' || item.availability === 'unavailable') {
    return {
      status: 'unavailable',
      label: 'MAP UNAVAILABLE',
      message: item.error?.message ?? item.summary,
      regionId: null,
      jobId: null,
      percent: 0,
      totalTiles: null,
      downloadedTiles: null,
      failedTiles: null,
      estimatedSizeMB: item.estimatedSizeMB ?? null,
      downloadedSizeMB: null,
      errorMessage: item.error?.message ?? null,
      retryable: false,
      active: false,
      source: 'manifest',
      updatedAt: null,
    };
  }

  if (item.status === 'failed' || item.availability === 'failed') {
    return {
      status: 'failed',
      label: 'MAP FAILED',
      message: item.error?.message ?? item.summary,
      regionId: null,
      jobId: null,
      percent: 0,
      totalTiles: null,
      downloadedTiles: null,
      failedTiles: null,
      estimatedSizeMB: item.estimatedSizeMB ?? null,
      downloadedSizeMB: null,
      errorMessage: item.error?.message ?? item.summary,
      retryable: false,
      active: false,
      source: 'manifest',
      updatedAt: null,
    };
  }

  return {
    status: 'not_requested',
    label: 'MAP NOT STARTED',
    message: 'Offline map preparation has not been started from Explore yet.',
    regionId: null,
    jobId: null,
    percent: 0,
    totalTiles: null,
    downloadedTiles: null,
    failedTiles: null,
    estimatedSizeMB: item.estimatedSizeMB ?? null,
    downloadedSizeMB: null,
    errorMessage: null,
    retryable: false,
    active: false,
    source: 'manifest',
    updatedAt: null,
  };
}
