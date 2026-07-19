export const ECS_ROUTE_SEARCH_RESULT_LIMIT = 20;

export const ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE =
  'Showing the 20 best matches. Refine the search area or filters to narrow the results.';

/**
 * Normalizes every consumer-facing route-search limit to the safe ECS default.
 * Candidate-inspection limits used internally by providers are intentionally separate.
 */
export function normalizeRouteSearchResultLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return ECS_ROUTE_SEARCH_RESULT_LIMIT;
  }
  return Math.min(ECS_ROUTE_SEARCH_RESULT_LIMIT, Math.max(1, Math.floor(value)));
}

/**
 * Applies the total-search cap after callers have completed policy filtering and
 * deterministic ranking. Duplicate identities never consume a result position.
 */
export function capUniqueRankedRoutes<T>(
  items: readonly T[],
  getRouteId: (item: T) => string | null | undefined,
  requestedLimit: unknown = ECS_ROUTE_SEARCH_RESULT_LIMIT,
): T[] {
  const limit = normalizeRouteSearchResultLimit(requestedLimit);
  const seen = new Set<string>();
  const selected: T[] = [];

  for (const item of items) {
    const routeId = (getRouteId(item) ?? '').trim();
    if (!routeId || seen.has(routeId)) continue;
    seen.add(routeId);
    selected.push(item);
    if (selected.length >= limit) break;
  }

  return selected;
}
