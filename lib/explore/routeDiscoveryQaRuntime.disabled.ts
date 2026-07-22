export function getRouteDiscoveryQaRuntime() {
  return {
    enabled: false as const,
    mode: null,
    region: null,
    fixtureVersion: null,
    accessPartition: null,
    persistedFilterHydrationAllowed: true as const,
  };
}
