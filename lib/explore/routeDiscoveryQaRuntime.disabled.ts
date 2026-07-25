import type { RouteDiscoveryQaRuntime } from './routeDiscoveryQaRuntimeContract';

export function getRouteDiscoveryQaRuntime(): RouteDiscoveryQaRuntime {
  return {
    enabled: false as const,
    mode: null,
    region: null,
    fixtureVersion: null,
    accessPartition: null,
    persistedFilterHydrationAllowed: true as const,
  };
}
