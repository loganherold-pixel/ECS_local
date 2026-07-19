export const ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT = 20;
export const ROUTE_GEOMETRY_CANDIDATE_INSPECTION_LIMIT = 500;

export type RouteGeometryRankedCandidate<T> = {
  value: T;
  routeIdentity: string;
  confidenceScore?: unknown;
  sourceLastUpdated?: unknown;
  routeName?: unknown;
  stableKey?: unknown;
};

export type RouteGeometryResultSelection<T> = {
  records: T[];
  resultLimit: number;
  qualifyingUniqueCount: number;
  deduplicatedCount: number;
  cappedCount: number;
  additionalMatchesAvailable: boolean;
};

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function timestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableDescending(left: number | null, right: number | null): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  return right - left;
}

export function normalizeRouteGeometryResultLimit(value: unknown): number {
  if (value == null || value === '') return ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT;
  const parsed = finiteNumber(value);
  if (parsed == null || parsed <= 0) return ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT;
  return Math.min(ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT, Math.max(1, Math.floor(parsed)));
}

export function compareRouteGeometryRankedCandidates<T>(
  left: RouteGeometryRankedCandidate<T>,
  right: RouteGeometryRankedCandidate<T>,
): number {
  const confidence = compareNullableDescending(
    finiteNumber(left.confidenceScore),
    finiteNumber(right.confidenceScore),
  );
  if (confidence !== 0) return confidence;

  const freshness = compareNullableDescending(
    timestamp(left.sourceLastUpdated),
    timestamp(right.sourceLastUpdated),
  );
  if (freshness !== 0) return freshness;

  const name = normalizedText(left.routeName).localeCompare(normalizedText(right.routeName));
  if (name !== 0) return name;

  const identity = normalizedText(left.routeIdentity).localeCompare(normalizedText(right.routeIdentity));
  if (identity !== 0) return identity;

  return normalizedText(left.stableKey).localeCompare(normalizedText(right.stableKey));
}

/**
 * Selects the consumer-facing result only after callers have applied public
 * eligibility and invalid-geometry filtering. The larger RPC window remains an
 * internal quality-inspection detail and never changes the total-search cap.
 */
export function selectRouteGeometrySearchResults<T>(
  candidates: readonly RouteGeometryRankedCandidate<T>[],
  requestedLimit: unknown,
): RouteGeometryResultSelection<T> {
  const resultLimit = normalizeRouteGeometryResultLimit(requestedLimit);
  const ranked = [...candidates].sort(compareRouteGeometryRankedCandidates);
  const uniqueRecords: T[] = [];
  const seen = new Set<string>();

  for (const candidate of ranked) {
    const identity = normalizedText(candidate.routeIdentity);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    uniqueRecords.push(candidate.value);
  }

  const qualifyingUniqueCount = uniqueRecords.length;
  const records = uniqueRecords.slice(0, resultLimit);
  return {
    records,
    resultLimit,
    qualifyingUniqueCount,
    deduplicatedCount: Math.max(0, candidates.length - qualifyingUniqueCount),
    cappedCount: Math.max(0, qualifyingUniqueCount - records.length),
    additionalMatchesAvailable: qualifyingUniqueCount > records.length,
  };
}
