export type ExploreVisibleRouteProjection<T> = {
  items: T[];
  count: number;
};

export function selectVisibleExploreRouteProjection<T>(items: readonly T[]): ExploreVisibleRouteProjection<T> {
  const visibleItems = Array.from(items);
  return { items: visibleItems, count: visibleItems.length };
}
