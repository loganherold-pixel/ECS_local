import type { ExpeditionOpportunity } from '../discoverEngine';

export type ExploreLiveConfidenceSource =
  | 'catalog_verification'
  | 'route_metadata'
  | 'recommendation'
  | 'legacy_label'
  | 'unavailable';

export type ExploreLiveConfidence = {
  score: number | null;
  label: string;
  source: ExploreLiveConfidenceSource;
  reasons: string[];
  state: 'live' | 'estimated' | 'stale' | 'missing';
};

type ConfidenceRoute = Partial<ExpeditionOpportunity> & {
  recommendationConfidence?: { score?: unknown; reasons?: unknown };
  aiConfidence?: unknown;
  confidence?: unknown;
  routeMetadata?: Record<string, unknown> | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed <= 1 ? parsed * 100 : parsed)));
    }
  }
  return null;
}

function uniqueLimited(values: unknown[], max = 5): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= max) break;
  }
  return output;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function labelForScore(score: number | null): string {
  if (score == null) return 'Confidence unavailable';
  if (score >= 85) return 'High confidence';
  if (score >= 60) return 'Medium confidence';
  return 'Low confidence';
}

function stateFromMetadata(metadata: Record<string, unknown>): ExploreLiveConfidence['state'] {
  const searchable = [
    metadata.dataState,
    metadata.trailPackDataState,
    metadata.sourceState,
    metadata.freshness,
    record(metadata.catalogVerification).dataState,
    record(metadata.catalogVerification).freshness,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/stale|aging|expired/.test(searchable)) return 'stale';
  if (/mock|fixture|estimated|manual|cached/.test(searchable)) return 'estimated';
  return 'live';
}

function legacyLabelScore(value: unknown): number | null {
  const label = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (label === 'high') return 88;
  if (label === 'good') return 76;
  if (label === 'explore') return 62;
  return null;
}

export function deriveExploreLiveConfidence(route: ConfidenceRoute | null | undefined): ExploreLiveConfidence {
  if (!route) {
    return {
      score: null,
      label: 'Confidence unavailable',
      source: 'unavailable',
      reasons: ['Route confidence source missing'],
      state: 'missing',
    };
  }

  const metadata = record(route.routeMetadata);
  const catalogVerification = record(metadata.catalogVerification);
  const recommendation = record(route.recommendationConfidence);
  const candidates: Array<{
    score: number | null;
    source: ExploreLiveConfidenceSource;
  }> = [
    {
      score: finiteScore(catalogVerification.confidenceScore ?? catalogVerification.confidence),
      source: 'catalog_verification',
    },
    {
      score: finiteScore(
        metadata.confidenceScore ??
          metadata.routeConfidenceScore ??
          metadata.sourceConfidenceScore ??
          metadata.confidence,
      ),
      source: 'route_metadata',
    },
    {
      score: finiteScore(recommendation.score),
      source: 'recommendation',
    },
    {
      score: legacyLabelScore(route.aiConfidence ?? (typeof route.confidence === 'string' ? route.confidence : null)),
      source: 'legacy_label',
    },
  ];
  const selected = candidates.find((candidate) => candidate.score != null) ?? null;
  const state = selected ? stateFromMetadata(metadata) : 'missing';
  const cappedScore =
    selected?.score != null && state === 'stale'
      ? Math.min(selected.score, 72)
      : selected?.score ?? null;
  const reasons = uniqueLimited([
    ...normalizeStringArray(catalogVerification.confidenceReasons),
    ...normalizeStringArray(metadata.confidenceReasons),
    ...normalizeStringArray(recommendation.reasons),
    catalogVerification.sourceLabel,
    selected?.source === 'route_metadata' ? 'Route metadata confidence' : null,
  ]);

  return {
    score: cappedScore,
    label: labelForScore(cappedScore),
    source: selected?.source ?? 'unavailable',
    reasons: reasons.length > 0 ? reasons : ['Confidence source unavailable'],
    state,
  };
}
