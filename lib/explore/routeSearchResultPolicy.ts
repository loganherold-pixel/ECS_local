export const ECS_ROUTE_SEARCH_RESULT_LIMIT = 20;

export const ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE =
  'Showing the 20 best matches. Refine the search area or filters to narrow the results.';

export function normalizeRouteSearchResultLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return ECS_ROUTE_SEARCH_RESULT_LIMIT;
  }
  return Math.min(ECS_ROUTE_SEARCH_RESULT_LIMIT, Math.max(1, Math.floor(value)));
}

export function dedupeUniqueRankedRoutes<T>(
  items: readonly T[],
  getRouteId: (item: T) => string | null | undefined,
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const routeId = (getRouteId(item) ?? '').trim().toLowerCase();
    if (!routeId || seen.has(routeId)) return false;
    seen.add(routeId);
    return true;
  });
}

export function capUniqueRankedRoutes<T>(
  items: readonly T[],
  getRouteId: (item: T) => string | null | undefined,
  requestedLimit: unknown = ECS_ROUTE_SEARCH_RESULT_LIMIT,
): T[] {
  return dedupeUniqueRankedRoutes(items, getRouteId).slice(
    0,
    normalizeRouteSearchResultLimit(requestedLimit),
  );
}
