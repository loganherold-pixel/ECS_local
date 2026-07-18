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
  /** Every route-region represented by this package attempt. */
  regionIds?: string[];
  /** Every persisted sync job represented by this package attempt. */
  jobIds?: string[];
  requiredRegionCount?: number;
  completedRegionCount?: number;
  failedRegionCount?: number;
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

function preparationAttemptTimestamp(routeIntent: unknown): string | null {
  if (!routeIntent || typeof routeIntent !== 'object') return null;
  const readinessSnapshot = (routeIntent as Record<string, unknown>).readinessSnapshot;
  if (!readinessSnapshot || typeof readinessSnapshot !== 'object') return null;
  const manifest = (readinessSnapshot as Record<string, unknown>).offlinePrepManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const generatedAt = (manifest as Record<string, unknown>).generatedAt;
  return typeof generatedAt === 'string' && Number.isFinite(Date.parse(generatedAt))
    ? generatedAt
    : null;
}

function latestPreparationAttemptJobs(jobs: OfflineTileSyncJob[]): OfflineTileSyncJob[] {
  if (jobs.length <= 1) return jobs;
  const timestamps = jobs
    .map((job) => preparationAttemptTimestamp(job.routeIntent))
    .filter((value): value is string => !!value)
    .sort((a, b) => b.localeCompare(a));
  const latestTimestamp = timestamps[0] ?? null;
  if (!latestTimestamp) return jobs;
  return jobs.filter((job) => preparationAttemptTimestamp(job.routeIntent) === latestTimestamp);
}

function readinessMapRegionIds(manifest: OfflinePrepPackManifest): string[] {
  const asset = manifest.readinessManifest?.assets?.find((entry) => entry.kind === 'map_region');
  return Array.isArray(asset?.storageRefs)
    ? asset.storageRefs.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
}

function latestJobsByRegion(jobs: OfflineTileSyncJob[]): Map<string, OfflineTileSyncJob> {
  const result = new Map<string, OfflineTileSyncJob>();
  [...jobs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((job) => {
      if (!result.has(job.regionId)) result.set(job.regionId, job);
    });
  return result;
}

function regionIsVerifiedComplete(region: TileCacheRegion | null | undefined): boolean {
  return !!region &&
    region.status === 'complete' &&
    region.tileCount > 0 &&
    region.downloadedTiles >= region.tileCount;
}

/** Returns every incomplete required region for one bounded retry attempt. */
export function resolveOfflinePrepRetryRegionIds(
  state: OfflinePrepMapQueueState | null,
  regions: TileCacheRegion[],
): string[] {
  if (!state?.retryable) return [];
  const candidates = state.regionIds?.length
    ? state.regionIds
    : state.regionId
      ? [state.regionId]
      : [];
  return Array.from(new Set(candidates)).filter((regionId) => {
    const region = regions.find((candidate) => candidate.id === regionId);
    if (!region) return true;
    if (regionIsVerifiedComplete(region)) return false;
    return region.status !== 'pending' && region.status !== 'downloading';
  });
}

function jobIsVerifiedComplete(job: OfflineTileSyncJob | null | undefined): boolean {
  if (!job || job.status !== 'complete' || !job.progress) return false;
  return job.progress.totalTiles > 0 &&
    job.progress.downloadedTiles >= job.progress.totalTiles &&
    job.progress.failedTiles === 0;
}

function incompleteCompleteState(
  job: OfflineTileSyncJob | null,
  region: TileCacheRegion | null,
): OfflinePrepMapQueueState {
  const base = job ? stateFromJob(job) : stateFromRegion(region as TileCacheRegion);
  const totalTiles = region?.tileCount ?? job?.progress?.totalTiles ?? null;
  const downloadedTiles = region?.downloadedTiles ?? job?.progress?.downloadedTiles ?? null;
  const failedTiles = job?.progress?.failedTiles ?? null;
  const percent = totalTiles && downloadedTiles != null
    ? clampPercent((downloadedTiles / totalTiles) * 100)
    : base.percent;
  return {
    ...base,
    status: 'failed',
    label: 'MAP INCOMPLETE',
    message: 'The route-region download ended without every required tile. Cached tiles are retained for retry.',
    percent,
    totalTiles,
    downloadedTiles,
    failedTiles,
    errorMessage: 'Required offline map coverage is incomplete.',
    retryable: true,
    active: false,
  };
}

function stateForRequiredRegion(
  regionId: string,
  job: OfflineTileSyncJob | null,
  region: TileCacheRegion | null,
): OfflinePrepMapQueueState {
  const jobActive = job?.status === 'pending' || job?.status === 'running';
  if (jobActive) return stateFromJob(job as OfflineTileSyncJob);

  if (regionIsVerifiedComplete(region)) return stateFromRegion(region as TileCacheRegion);

  if (region?.status === 'error' || region?.status === 'partial') {
    const state = stateFromRegion(region);
    return {
      ...state,
      status: 'failed',
      label: region.status === 'partial' ? 'MAP INCOMPLETE' : state.label,
      retryable: true,
      active: false,
      errorMessage: region.errorMessage ?? 'Required offline map coverage is incomplete.',
    };
  }
  if (region?.status === 'cancelled') return stateFromRegion(region);
  if (region?.status === 'downloading' || region?.status === 'pending') return stateFromRegion(region);

  if (job?.status === 'error' || job?.status === 'cancelled') return stateFromJob(job);
  if (jobIsVerifiedComplete(job)) return stateFromJob(job as OfflineTileSyncJob);
  if (job?.status === 'complete' || region?.status === 'complete') {
    return incompleteCompleteState(job, region);
  }
  if (job) return stateFromJob(job);
  if (region) return stateFromRegion(region);
  return {
    status: 'failed',
    label: 'MAP MISSING',
    message: 'A required route map region is no longer present in the sync queue or local cache.',
    regionId,
    jobId: null,
    percent: 0,
    totalTiles: null,
    downloadedTiles: null,
    failedTiles: null,
    estimatedSizeMB: null,
    downloadedSizeMB: null,
    errorMessage: 'Required offline map region is missing.',
    retryable: true,
    active: false,
    source: 'tile_region',
    updatedAt: null,
  };
}

function aggregateRequiredRegionStates(states: OfflinePrepMapQueueState[]): OfflinePrepMapQueueState {
  const failed = states.filter((state) => state.status === 'failed');
  const cancelled = states.filter((state) => state.status === 'cancelled');
  const downloading = states.filter((state) => state.status === 'downloading');
  const queued = states.filter((state) => state.status === 'queued');
  const complete = states.filter((state) => state.status === 'complete');
  const status: OfflinePrepMapQueueStatus = downloading.length > 0
    ? 'downloading'
    : queued.length > 0
      ? 'queued'
      : failed.length > 0
        ? 'failed'
        : cancelled.length > 0
          ? 'cancelled'
          : complete.length === states.length
            ? 'complete'
            : 'failed';
  const totalTiles = states.every((state) => state.totalTiles != null)
    ? states.reduce((sum, state) => sum + (state.totalTiles ?? 0), 0)
    : null;
  const downloadedTiles = states.every((state) => state.downloadedTiles != null)
    ? states.reduce((sum, state) => sum + (state.downloadedTiles ?? 0), 0)
    : null;
  const failedTiles = states.some((state) => state.failedTiles != null)
    ? states.reduce((sum, state) => sum + (state.failedTiles ?? 0), 0)
    : null;
  const estimatedSizeMB = states.some((state) => state.estimatedSizeMB != null)
    ? Math.round(states.reduce((sum, state) => sum + (state.estimatedSizeMB ?? 0), 0) * 10) / 10
    : null;
  const downloadedSizeMB = states.some((state) => state.downloadedSizeMB != null)
    ? Math.round(states.reduce((sum, state) => sum + (state.downloadedSizeMB ?? 0), 0) * 10) / 10
    : null;
  const percent = totalTiles && downloadedTiles != null
    ? clampPercent((downloadedTiles / totalTiles) * 100)
    : clampPercent(states.reduce((sum, state) => sum + state.percent, 0) / states.length);
  const regionIds = Array.from(new Set(states.flatMap((state) => state.regionId ? [state.regionId] : [])));
  const jobIds = Array.from(new Set(states.flatMap((state) => state.jobId ? [state.jobId] : [])));
  const retryTarget = failed[0] ?? cancelled[0] ?? downloading[0] ?? queued[0] ?? states[0];
  const updatedAt = states
    .map((state) => state.updatedAt)
    .filter((value): value is string => !!value)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
  const label = status === 'complete'
    ? 'MAP READY'
    : status === 'failed'
      ? 'MAP INCOMPLETE'
      : status === 'cancelled'
        ? 'MAP CANCELLED'
        : status === 'queued'
          ? 'MAP QUEUED'
          : `MAP DOWNLOADING ${percent}%`;
  const message = status === 'complete'
    ? `All ${states.length} required route map region${states.length === 1 ? ' is' : 's are'} cached.`
    : status === 'failed'
      ? `${failed.length} of ${states.length} required route map region${states.length === 1 ? '' : 's'} failed or is incomplete. Completed regions remain cached.`
      : status === 'cancelled'
        ? `${cancelled.length} of ${states.length} required route map region${states.length === 1 ? '' : 's'} was cancelled.`
        : `${complete.length} of ${states.length} required route map region${states.length === 1 ? ' is' : 's are'} ready${failed.length > 0 ? `; ${failed.length} will be retryable after active downloads settle` : ''}.`;
  return {
    status,
    label,
    message,
    regionId: retryTarget?.regionId ?? null,
    jobId: retryTarget?.jobId ?? null,
    percent: status === 'complete' ? 100 : percent,
    totalTiles,
    downloadedTiles,
    failedTiles,
    estimatedSizeMB,
    downloadedSizeMB,
    errorMessage: failed[0]?.errorMessage ?? (status === 'failed' ? 'Required offline map coverage is incomplete.' : null),
    retryable: status === 'failed' || status === 'cancelled',
    active: status === 'queued' || status === 'downloading',
    source: states.some((state) => state.source === 'sync_job') ? 'sync_job' : 'tile_region',
    updatedAt,
    regionIds,
    jobIds,
    requiredRegionCount: states.length,
    completedRegionCount: complete.length,
    failedRegionCount: failed.length,
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
  const explicitRegionIds = Array.from(new Set([
    ...readinessMapRegionIds(manifest),
    ...(explicitRegionId ? [explicitRegionId] : []),
  ]));
  const candidateRouteJobs = jobs.filter((job) => (
    explicitRegionIds.length > 0
      ? explicitRegionIds.includes(job.regionId)
      : jobMatches(job, manifest, null)
  ));
  const routeJobs = explicitRegionIds.length > 0
    ? candidateRouteJobs
    : latestPreparationAttemptJobs(candidateRouteJobs);
  const jobsByRegion = latestJobsByRegion(routeJobs);
  const jobRegionIds = Array.from(jobsByRegion.keys());
  const routeRegions = regions.filter((region) => (
    explicitRegionIds.length > 0
      ? explicitRegionIds.includes(region.id)
      : jobRegionIds.length > 0
        ? jobRegionIds.includes(region.id)
        : regionMatches(region, manifest, item)
  ));
  const requiredRegionIds = Array.from(new Set([
    ...explicitRegionIds,
    ...jobRegionIds,
    ...routeRegions.map((region) => region.id),
  ]));
  const regionsById = new Map(routeRegions.map((region) => [region.id, region]));
  const requiredStates = requiredRegionIds
    .map((regionId) => stateForRequiredRegion(
      regionId,
      jobsByRegion.get(regionId) ?? null,
      regionsById.get(regionId) ?? regions.find((region) => region.id === regionId) ?? null,
    ));
  if (requiredStates.length > 0) {
    return requiredStates.length === 1
      ? {
          ...requiredStates[0],
          regionIds: requiredRegionIds,
          jobIds: Array.from(new Set(routeJobs.map((job) => job.jobId))),
          requiredRegionCount: 1,
          completedRegionCount: requiredStates[0].status === 'complete' ? 1 : 0,
          failedRegionCount: requiredStates[0].status === 'failed' ? 1 : 0,
        }
      : aggregateRequiredRegionStates(requiredStates);
  }

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
