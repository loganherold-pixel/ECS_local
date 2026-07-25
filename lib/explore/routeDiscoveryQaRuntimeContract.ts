import type { DistanceRadius } from '../discoverEngine';
import type { ExploreFilterStateSnapshot } from '../exploreFilterStateStore';

export type RouteDiscoveryQaRegion = {
  key: string;
  regionId: string;
  fixtureVersion: string;
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
  source: string;
  defaultRadiusMiles: DistanceRadius;
  viewport: Readonly<{
    north: number;
    south: number;
    east: number;
    west: number;
  }>;
};

export type RouteDiscoveryQaEnabledRuntime = {
  enabled: true;
  mode: 'route_discovery_qa';
  region: Readonly<RouteDiscoveryQaRegion>;
  fixtureVersion: string;
  accessPartition: string;
  persistedFilterHydrationAllowed: false;
};

export type RouteDiscoveryQaDisabledRuntime = {
  enabled: false;
  mode: null;
  region: null;
  fixtureVersion: null;
  accessPartition: null;
  persistedFilterHydrationAllowed: true;
};

export type RouteDiscoveryQaRuntime =
  | RouteDiscoveryQaEnabledRuntime
  | RouteDiscoveryQaDisabledRuntime;

export function getRouteDiscoveryQaRegion(
  runtime: RouteDiscoveryQaRuntime,
): Readonly<RouteDiscoveryQaRegion> | null {
  return runtime.enabled ? runtime.region : null;
}

export function getRouteDiscoveryQaDefaultRadiusMiles(
  runtime: RouteDiscoveryQaRuntime,
): DistanceRadius | null {
  return runtime.enabled ? runtime.region.defaultRadiusMiles : null;
}

export function resolveRouteDiscoveryQaExploreFilterState(
  snapshot: ExploreFilterStateSnapshot,
  defaultRadiusMiles: DistanceRadius | null,
): ExploreFilterStateSnapshot {
  if (defaultRadiusMiles == null) return snapshot;
  return {
    ...snapshot,
    radiusMiles: defaultRadiusMiles,
    refinement: null,
  };
}
