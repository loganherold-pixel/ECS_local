import type { ECSTrustFreshnessState } from './trustTypes';

export type ECSTrustFreshnessClass =
  | 'gps'
  | 'route'
  | 'weather'
  | 'telemetry'
  | 'provider'
  | 'expedition'
  | 'marker_scoring';

type FreshnessWindow = {
  freshMs: number;
  agingMs: number;
  staleMs: number;
};

export const ECS_TRUST_FRESHNESS_WINDOWS: Record<ECSTrustFreshnessClass, FreshnessWindow> = {
  gps: {
    freshMs: 5_000,
    agingMs: 20_000,
    staleMs: 120_000,
  },
  route: {
    freshMs: 15_000,
    agingMs: 90_000,
    staleMs: 15 * 60_000,
  },
  weather: {
    freshMs: 30 * 60_000,
    agingMs: 2 * 60 * 60_000,
    staleMs: 24 * 60 * 60_000,
  },
  telemetry: {
    freshMs: 30_000,
    agingMs: 90_000,
    staleMs: 10 * 60_000,
  },
  provider: {
    freshMs: 30_000,
    agingMs: 90_000,
    staleMs: 10 * 60_000,
  },
  expedition: {
    freshMs: 3 * 60_000,
    agingMs: 15 * 60_000,
    staleMs: 2 * 60 * 60_000,
  },
  marker_scoring: {
    freshMs: 2 * 60_000,
    agingMs: 15 * 60_000,
    staleMs: 6 * 60 * 60_000,
  },
};

export function evaluateTrustFreshnessFromAge(
  freshnessClass: ECSTrustFreshnessClass,
  ageMs: number | null | undefined,
): ECSTrustFreshnessState {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) {
    return 'unavailable';
  }

  const window = ECS_TRUST_FRESHNESS_WINDOWS[freshnessClass];
  if (ageMs <= window.freshMs) return 'fresh';
  if (ageMs <= window.agingMs) return 'aging';
  if (ageMs <= window.staleMs) return 'stale';
  return 'unavailable';
}

export function mapTrustFreshnessFromLiveFreshness(
  freshness: string | null | undefined,
): ECSTrustFreshnessState {
  switch (String(freshness ?? '').trim().toLowerCase()) {
    case 'current':
    case 'fresh':
      return 'fresh';
    case 'recent':
    case 'aging':
      return 'aging';
    case 'stale':
    case 'very_stale':
    case 'last_known':
      return 'stale';
    default:
      return 'unavailable';
  }
}

export function formatTrustFreshnessLabel(
  freshness: ECSTrustFreshnessState,
): string {
  switch (freshness) {
    case 'fresh':
      return 'Fresh';
    case 'aging':
      return 'Aging';
    case 'stale':
      return 'Stale';
    default:
      return 'Unavailable';
  }
}

export function formatTrustAgeLabel(
  timestamp: number | string | null | undefined,
): string | null {
  if (timestamp == null) return null;

  const millis =
    typeof timestamp === 'number'
      ? timestamp
      : typeof timestamp === 'string'
        ? new Date(timestamp).getTime()
        : Number.NaN;

  if (!Number.isFinite(millis)) return null;

  const ageMs = Date.now() - millis;
  if (ageMs < 0) return null;
  if (ageMs < 10_000) return 'Just now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s ago`;
  if (ageMs < 60 * 60_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 24 * 60 * 60_000) return `${Math.floor(ageMs / 60 / 60_000)}h ago`;
  return `${Math.floor(ageMs / 24 / 60 / 60_000)}d ago`;
}
