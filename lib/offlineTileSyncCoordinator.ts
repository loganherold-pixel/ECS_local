import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  tileCacheStore,
  type DownloadProgress,
  type TileCacheRegion,
} from './tileCacheStore';

export type OfflineTileSyncJobStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'cancelled';

export type OfflineTileSyncSource = 'current-view' | 'route-corridor' | 'manual-region';
export type OfflineTileSyncType = 'route' | 'map-view' | 'manual';

export interface OfflineTileSyncJob {
  jobId: string;
  regionId: string;
  regionName: string;
  source: OfflineTileSyncSource;
  syncType: OfflineTileSyncType;
  routeIntent?: Record<string, unknown> | null;
  status: OfflineTileSyncJobStatus;
  progress: DownloadProgress | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  cleanupFreedMB?: number;
  appProcessBackgroundOnly: true;
}

export interface OfflineTileSyncSnapshot {
  jobs: OfflineTileSyncJob[];
  activeJobs: OfflineTileSyncJob[];
  latestJob: OfflineTileSyncJob | null;
  latestCompletedJob: OfflineTileSyncJob | null;
  backgroundSupport: 'app-process';
  resumeSupport: 'app-restart';
}

type Listener = () => void;

const STORAGE_KEY = 'offline_tile_sync_jobs_v1';
const persistence = createPersistedKeyValueCache('ecs_offline_tile_sync');
const listeners = new Set<Listener>();
const runningPromises = new Map<string, Promise<OfflineTileSyncJob>>();
let jobs: OfflineTileSyncJob[] = [];
let loaded = false;

function nowISO(): string {
  return new Date().toISOString();
}

function createJobId(regionId: string): string {
  return `offline-sync-${regionId}-${Date.now().toString(36)}`;
}

function isActiveStatus(status: OfflineTileSyncJobStatus): boolean {
  return status === 'pending' || status === 'running';
}

function normalizeStoredJob(value: any): OfflineTileSyncJob | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.jobId !== 'string' || typeof value.regionId !== 'string') return null;
  const wasInterruptedActiveJob = isActiveStatus(value.status);
  const status: OfflineTileSyncJobStatus = wasInterruptedActiveJob
    ? 'pending'
    : ['complete', 'error', 'cancelled'].includes(value.status)
      ? value.status
      : 'error';
  const progress =
    value.progress && typeof value.progress === 'object'
      ? {
          ...value.progress,
          status: wasInterruptedActiveJob ? 'calculating' : value.progress.status,
          message: wasInterruptedActiveJob
            ? 'Download was interrupted and is queued to resume when ECS is active.'
            : value.progress.message,
        }
      : null;
  return {
    jobId: value.jobId,
    regionId: value.regionId,
    regionName: typeof value.regionName === 'string' ? value.regionName : 'Offline region',
    source: value.source === 'route-corridor' || value.source === 'manual-region'
      ? value.source
      : 'current-view',
    syncType: value.syncType === 'route' || value.syncType === 'manual'
      ? value.syncType
      : value.source === 'route-corridor'
        ? 'route'
        : value.source === 'manual-region'
          ? 'manual'
          : 'map-view',
    routeIntent: value.routeIntent && typeof value.routeIntent === 'object' ? value.routeIntent : null,
    status,
    progress,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : nowISO(),
    updatedAt: nowISO(),
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    errorMessage:
      status === 'error'
        ? value.errorMessage || 'Offline sync failed.'
        : value.errorMessage ?? null,
    cleanupFreedMB:
      typeof value.cleanupFreedMB === 'number' && Number.isFinite(value.cleanupFreedMB)
        ? value.cleanupFreedMB
        : undefined,
    appProcessBackgroundOnly: true,
  };
}

function loadJobs(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = persistence.get(STORAGE_KEY);
    if (!raw) {
      jobs = [];
      return;
    }
    const parsed = JSON.parse(raw);
    jobs = Array.isArray(parsed)
      ? parsed.map(normalizeStoredJob).filter((job): job is OfflineTileSyncJob => !!job)
      : [];
    persistJobs();
  } catch {
    jobs = [];
  }
}

function persistJobs(): void {
  try {
    const sorted = [...jobs]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 25);
    jobs = sorted;
    persistence.set(STORAGE_KEY, JSON.stringify(sorted));
  } catch {}
}

function notify(): void {
  persistJobs();
  listeners.forEach((listener) => listener());
}

function upsertJob(job: OfflineTileSyncJob): OfflineTileSyncJob {
  loadJobs();
  const index = jobs.findIndex((item) => item.jobId === job.jobId);
  if (index >= 0) {
    jobs[index] = job;
  } else {
    jobs = [job, ...jobs];
  }
  return job;
}

function updateJob(
  jobId: string,
  updates: Partial<OfflineTileSyncJob>,
): OfflineTileSyncJob | null {
  loadJobs();
  const current = jobs.find((job) => job.jobId === jobId);
  if (!current) return null;
  const next: OfflineTileSyncJob = {
    ...current,
    ...updates,
    updatedAt: nowISO(),
    appProcessBackgroundOnly: true,
  };
  upsertJob(next);
  notify();
  return next;
}

function getRegionName(region: TileCacheRegion | null | undefined, fallback?: string): string {
  return region?.name || fallback || 'Offline map sync';
}

function resolveSyncType(
  source: OfflineTileSyncSource,
  explicit?: OfflineTileSyncType,
): OfflineTileSyncType {
  if (explicit) return explicit;
  if (source === 'route-corridor') return 'route';
  if (source === 'manual-region') return 'manual';
  return 'map-view';
}

function cancelJobById(jobId: string): void {
  loadJobs();
  const job = jobs.find((item) => item.jobId === jobId);
  if (!job || !isActiveStatus(job.status)) return;
  tileCacheStore.cancelDownload(job.regionId);
  updateJob(job.jobId, {
    status: 'cancelled',
    completedAt: nowISO(),
    errorMessage: null,
    progress: job.progress
      ? { ...job.progress, status: 'cancelled', message: 'Download cancelled' }
      : job.progress,
  });
}

function buildSnapshot(): OfflineTileSyncSnapshot {
  loadJobs();
  const sorted = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeJobs = sorted.filter((job) => isActiveStatus(job.status));
  return {
    jobs: sorted,
    activeJobs,
    latestJob: sorted[0] ?? null,
    latestCompletedJob: sorted.find((job) => job.status === 'complete') ?? null,
    backgroundSupport: 'app-process',
    resumeSupport: 'app-restart',
  };
}

function launchJob(job: OfflineTileSyncJob): Promise<OfflineTileSyncJob> {
  const existing = runningPromises.get(job.jobId);
  if (existing) return existing;

  const runPromise = (async () => {
    updateJob(job.jobId, { status: 'running', errorMessage: null });
    const result = await tileCacheStore.startDownloadWithQuota(job.regionId, (progress) => {
      updateJob(job.jobId, {
        status:
          progress.status === 'complete'
            ? 'complete'
            : progress.status === 'cancelled'
              ? 'cancelled'
              : progress.status === 'error'
                ? 'error'
                : 'running',
        progress,
        errorMessage: progress.status === 'error' ? progress.message : null,
        completedAt:
          progress.status === 'complete' || progress.status === 'cancelled' || progress.status === 'error'
            ? nowISO()
            : null,
      });
    });

    const cleanupFreedMB = result.cleanupResult?.freedMB;
    if (cleanupFreedMB && cleanupFreedMB > 0) {
      updateJob(job.jobId, { cleanupFreedMB });
    }

    const latest = jobs.find((item) => item.jobId === job.jobId) ?? job;
    const cancelled = latest.status === 'cancelled' || latest.progress?.status === 'cancelled';
    const terminal = updateJob(job.jobId, {
      status: cancelled ? 'cancelled' : result.success ? 'complete' : 'error',
      completedAt: nowISO(),
      errorMessage: cancelled
        ? null
        : result.success
          ? null
          : latest.errorMessage || latest.progress?.message || 'Offline sync failed.',
    });
    return terminal ?? latest;
  })()
    .catch((error: any) => {
      const failed = updateJob(job.jobId, {
        status: 'error',
        completedAt: nowISO(),
        errorMessage: error?.message || 'Offline sync failed.',
      });
      return failed ?? job;
    })
    .finally(() => {
      runningPromises.delete(job.jobId);
    });

  runningPromises.set(job.jobId, runPromise);
  return runPromise;
}

export const offlineTileSyncCoordinator = {
  getSnapshot(): OfflineTileSyncSnapshot {
    return buildSnapshot();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async startRegionSync(input: {
    regionId: string;
    source?: OfflineTileSyncSource;
    regionName?: string;
    syncType?: OfflineTileSyncType;
    routeIntent?: Record<string, unknown> | null;
  }): Promise<OfflineTileSyncJob> {
    loadJobs();
    const activeExisting = jobs.find(
      (job) => job.regionId === input.regionId && isActiveStatus(job.status),
    );
    if (activeExisting) {
      const running = runningPromises.get(activeExisting.jobId);
      if (running) return running;
      return launchJob(activeExisting);
    }

    const region = tileCacheStore.getRegion(input.regionId);
    const createdAt = nowISO();
    const job: OfflineTileSyncJob = {
      jobId: createJobId(input.regionId),
      regionId: input.regionId,
      regionName: getRegionName(region, input.regionName),
      source: input.source ?? 'current-view',
      syncType: resolveSyncType(input.source ?? 'current-view', input.syncType),
      routeIntent: input.routeIntent ?? null,
      status: 'pending',
      progress: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      errorMessage: null,
      appProcessBackgroundOnly: true,
    };

    upsertJob(job);
    notify();

    return launchJob(job);
  },

  resumePendingJobs(input: {
    source?: OfflineTileSyncSource;
    syncType?: OfflineTileSyncType;
  } = {}): OfflineTileSyncJob[] {
    loadJobs();
    const resumable = jobs.filter((job) => {
      if (job.status !== 'pending') return false;
      if (input.source && job.source !== input.source) return false;
      if (input.syncType && job.syncType !== input.syncType) return false;
      return !runningPromises.has(job.jobId);
    });
    resumable.forEach((job) => {
      void launchJob(job);
    });
    return resumable;
  },

  cancelJob(jobId: string): void {
    cancelJobById(jobId);
  },

  cancelRegion(regionId: string): void {
    loadJobs();
    jobs
      .filter((job) => job.regionId === regionId && isActiveStatus(job.status))
      .forEach((job) => cancelJobById(job.jobId));
  },

  async waitForPersistence(): Promise<void> {
    await persistence.flush();
  },
};
