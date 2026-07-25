import type { LiveTrailPackCatalogSearchCriteria } from './liveTrailPackCatalog';

export async function invokeRouteDiscoveryQaTransport(
  _body: Record<string, unknown>,
  _criteria: LiveTrailPackCatalogSearchCriteria,
): Promise<never> {
  throw new Error('Acceptance transport is not included in this build profile.');
}
