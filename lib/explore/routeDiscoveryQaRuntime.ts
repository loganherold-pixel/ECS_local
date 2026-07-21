export const ROUTE_DISCOVERY_QA_REGION = Object.freeze({
  key: 'qa_fixture_region',
  regionId: 'qa_fixture_region',
  label: 'Synthetic Pacific Test Lattice',
  shortLabel: 'QA REGION',
  latitude: 0,
  longitude: -140,
  source: 'qa_fixture_region',
  defaultRadiusMiles: 100,
  viewport: Object.freeze({
    north: 3,
    south: -3,
    east: -137,
    west: -143,
  }),
});

export function getRouteDiscoveryQaRuntime() {
  return {
    enabled: true as const,
    mode: 'route_discovery_qa' as const,
    region: ROUTE_DISCOVERY_QA_REGION,
    accessPartition: 'route_discovery_qa:qa_fixture_region',
  };
}
