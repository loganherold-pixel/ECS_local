import type { TileBounds } from '../tileCacheStore';
import { forecastSignalForLabel, remoteLabelForScore, type RemoteForecastSignal } from './mapOverlay';

export const REMOTE_CACHE_GROUP_ID = 'ecs-remote-v1' as const;

export type OfflineRemoteConnectivitySummary = {
  avgRemoteScore: number | null;
  maxRemoteScore: number | null;
  expectedSignalState: RemoteForecastSignal | 'unknown';
  summary: string;
};

export type OfflineRemoteCacheCoverage = {
  routeBounds: TileBounds | null;
  routePointCount: number;
  segmentCount: number;
  estimatedTileCount: number;
};

export type OfflineRemoteCacheManifest = {
  cacheGroupId: typeof REMOTE_CACHE_GROUP_ID;
  enabled: boolean;
  lastUpdated: string;
  estimatedBytes: number;
  tileCoverage: OfflineRemoteCacheCoverage;
  connectivitySummary: OfflineRemoteConnectivitySummary;
};

export type OfflineRemoteRoutePoint = {
  latitude: number;
  longitude: number;
};

type SegmentRiskLike = {
  remoteness_score?: number | null;
  risk_score?: number | null;
  remoteness_level?: string | null;
  risk_level?: string | null;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function getSegments(segmentRiskAnalysis: unknown): SegmentRiskLike[] {
  const segments = (segmentRiskAnalysis as { segments?: unknown })?.segments;
  return Array.isArray(segments) ? (segments as SegmentRiskLike[]) : [];
}

function scoreForSegment(segment: SegmentRiskLike): number | null {
  if (typeof segment.remoteness_score === 'number' && Number.isFinite(segment.remoteness_score)) {
    return clamp(segment.remoteness_score, 0, 100);
  }
  if (typeof segment.risk_score === 'number' && Number.isFinite(segment.risk_score)) {
    return clamp(segment.risk_score, 0, 100);
  }

  const level = String(segment.remoteness_level ?? segment.risk_level ?? '').toLowerCase();
  if (level === 'red' || level === 'extreme' || level === 'wilderness') return 82;
  if (level === 'yellow' || level === 'remote' || level === 'backcountry') return 62;
  if (level === 'moderate' || level === 'rural') return 38;
  if (level === 'green' || level === 'low' || level === 'urban' || level === 'suburban') return 18;
  return null;
}

function summarizeConnectivity(avgRemoteScore: number | null): OfflineRemoteConnectivitySummary {
  if (avgRemoteScore == null) {
    return {
      avgRemoteScore: null,
      maxRemoteScore: null,
      expectedSignalState: 'unknown',
      summary: 'Connectivity forecast cached with route coverage; signal detail unknown.',
    };
  }

  const label = remoteLabelForScore(avgRemoteScore);
  const expectedSignalState = forecastSignalForLabel(label);
  const readableSignal =
    expectedSignalState === 'dead'
      ? 'dead zones possible'
      : expectedSignalState === 'weak'
        ? 'weak signal likely'
        : 'signal likely available';

  return {
    avgRemoteScore: Math.round(avgRemoteScore),
    maxRemoteScore: null,
    expectedSignalState,
    summary: `Cached remoteness forecast indicates ${readableSignal}.`,
  };
}

export function estimateRemoteCacheBytes(input: {
  routePointCount: number;
  segmentCount?: number | null;
  estimatedTileCount?: number | null;
}): number {
  const routePointCount = Math.max(0, Math.round(input.routePointCount || 0));
  const segmentCount = Math.max(0, Math.round(input.segmentCount || 0));
  const estimatedTileCount = Math.max(
    1,
    Math.round(input.estimatedTileCount ?? Math.ceil(Math.max(routePointCount - 1, 1) / 16)),
  );

  return 96 * 1024 + routePointCount * 96 + segmentCount * 512 + estimatedTileCount * 1024;
}

export function estimateRemoteCacheSizeMB(input: {
  routePointCount: number;
  segmentCount?: number | null;
  estimatedTileCount?: number | null;
}): number {
  return estimateRemoteCacheBytes(input) / (1024 * 1024);
}

export function buildOfflineRemoteCacheManifest(input: {
  routeGeometry: OfflineRemoteRoutePoint[];
  routeBounds: TileBounds | null;
  segmentRiskAnalysis?: unknown;
  lastUpdated?: string;
}): OfflineRemoteCacheManifest {
  const segments = getSegments(input.segmentRiskAnalysis);
  const scores = segments
    .map(scoreForSegment)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  const avgRemoteScore =
    scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const maxRemoteScore = scores.length > 0 ? Math.max(...scores) : null;
  const routePointCount = input.routeGeometry.length;
  const estimatedTileCount = Math.max(1, Math.ceil(Math.max(routePointCount - 1, 1) / 16));
  const connectivitySummary = summarizeConnectivity(avgRemoteScore);

  return {
    cacheGroupId: REMOTE_CACHE_GROUP_ID,
    enabled: true,
    lastUpdated: input.lastUpdated ?? new Date().toISOString(),
    estimatedBytes: estimateRemoteCacheBytes({
      routePointCount,
      segmentCount: segments.length,
      estimatedTileCount,
    }),
    tileCoverage: {
      routeBounds: input.routeBounds,
      routePointCount,
      segmentCount: segments.length,
      estimatedTileCount,
    },
    connectivitySummary: {
      ...connectivitySummary,
      maxRemoteScore: maxRemoteScore == null ? connectivitySummary.maxRemoteScore : Math.round(maxRemoteScore),
    },
  };
}

export function getRemoteCacheFallbackScore(
  manifest: OfflineRemoteCacheManifest | null | undefined,
): number | null {
  const score = manifest?.connectivitySummary?.avgRemoteScore;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

export function formatRemoteCacheSize(bytes: number | null | undefined): string {
  const safeBytes = typeof bytes === 'number' && Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const mb = safeBytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(safeBytes / 1024))} KB`;
}

export function formatRemoteCacheLastVerified(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return 'Last verified unknown';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'Last verified unknown';
  const diffHours = Math.max(0, Math.floor((nowMs - timestamp) / (1000 * 60 * 60)));
  if (diffHours < 1) return 'Last verified <1 hr ago';
  if (diffHours === 1) return 'Last verified 1 hr ago';
  return `Last verified ${diffHours} hrs ago`;
}
