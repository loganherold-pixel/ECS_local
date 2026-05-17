import type { CampsiteCandidateResult } from '../campsiteCandidateEngine';

export type CampOpsLifecycleSource = 'route' | 'polygon' | 'manual';

export type CampOpsLifecycleStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type CampOpsLifecycleState = {
  source: CampOpsLifecycleSource | null;
  requestKey: string | null;
  status: CampOpsLifecycleStatus;
  message: string | null;
};

export type CampOpsLifecycleCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
  keys(): string[];
};

export const CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE =
  'No high-confidence camp candidates found near this route.';
export const CAMPOPS_ROUTE_SCAN_ERROR_MESSAGE =
  'CampOps camp scan unavailable. Route remains usable.';
export const CAMPOPS_ROUTE_SCAN_LOADING_MESSAGE =
  'CampOps is checking camp candidates near this route.';

export const IDLE_CAMPOPS_LIFECYCLE_STATE: CampOpsLifecycleState = {
  source: null,
  requestKey: null,
  status: 'idle',
  message: null,
};

export function buildCampOpsLifecycleKey(
  source: CampOpsLifecycleSource,
  signature: string | null | undefined,
): string | null {
  const stableSignature = signature?.trim();
  return stableSignature ? `${source}:${stableSignature}` : null;
}

export function createCampOpsLifecycleCache<T>(
  limit: number = 6,
): CampOpsLifecycleCache<T> {
  const entries = new Map<string, T>();
  const maxEntries = Math.max(1, Math.floor(limit));
  return {
    get(key: string): T | null {
      if (!entries.has(key)) return null;
      const value = entries.get(key) as T;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: T): void {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        entries.delete(oldestKey);
      }
    },
    delete(key: string): void {
      entries.delete(key);
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
    keys(): string[] {
      return Array.from(entries.keys());
    },
  };
}

export function campOpsLifecycleStateFromResult(
  source: CampOpsLifecycleSource,
  requestKey: string,
  result: CampsiteCandidateResult,
): CampOpsLifecycleState {
  const rankedCount = result.campOps?.recommendationSet?.rankedCandidates?.length ?? 0;
  if (result.campOps?.enabled && rankedCount === 0) {
    return {
      source,
      requestKey,
      status: 'empty',
      message: source === 'route' ? CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE : 'No high-confidence camp candidates found in this area.',
    };
  }
  return {
    source,
    requestKey,
    status: 'ready',
    message: null,
  };
}
