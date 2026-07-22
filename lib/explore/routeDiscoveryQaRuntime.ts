export const ROUTE_DISCOVERY_QA_REGION = Object.freeze({
  key: 'qa_synthetic_basin_v2',
  regionId: 'qa_synthetic_basin_v2',
  fixtureVersion: 'route-discovery-qa-v2',
  label: 'Synthetic Basin Test Grid',
  shortLabel: 'QA REGION',
  latitude: 38.5,
  longitude: -115.5,
  source: 'qa_synthetic_region',
  defaultRadiusMiles: 100,
  viewport: Object.freeze({
    north: 47.5,
    south: 29.5,
    east: -106.5,
    west: -124.5,
  }),
});

export function getRouteDiscoveryQaRuntime() {
  return {
    enabled: true as const,
    mode: 'route_discovery_qa' as const,
    region: ROUTE_DISCOVERY_QA_REGION,
    fixtureVersion: ROUTE_DISCOVERY_QA_REGION.fixtureVersion,
    accessPartition: `route_discovery_qa:${ROUTE_DISCOVERY_QA_REGION.regionId}:${ROUTE_DISCOVERY_QA_REGION.fixtureVersion}`,
    persistedFilterHydrationAllowed: false as const,
  };
}
