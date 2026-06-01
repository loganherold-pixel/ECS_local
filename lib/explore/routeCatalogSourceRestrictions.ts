type RouteCatalogRestrictedSourceType = 'partner_restricted';
type RouteCatalogRestrictedSourceStatus = 'disabled' | 'needs_review';

export type RouteCatalogSourcePublishabilityInput = {
  providerId?: string;
  provider_id?: string;
  sourceType?: string;
  source_type?: string;
  label?: string;
  usePermission?: string;
  use_permission?: string;
};

export type RouteCatalogRestrictedSource = {
  providerId: string;
  aliases: string[];
  label: string;
  sourceType: RouteCatalogRestrictedSourceType;
  authority: 'partner_restricted';
  sourceUri: string;
  attribution: string;
  license: string;
  refreshFrequency: string;
  status: RouteCatalogRestrictedSourceStatus;
  usePermission: 'not_granted';
  publishable: false;
  blocker: string;
  requiredAction: string;
};

export type RouteCatalogRestrictedSourceUpsert = {
  provider_id: string;
  name: string;
  source_type: RouteCatalogRestrictedSourceType;
  authority: 'partner_restricted';
  source_uri: string;
  attribution: string;
  license: string;
  refresh_frequency: string;
  status: RouteCatalogRestrictedSourceStatus;
};

const GENERIC_PARTNER_RESTRICTED_BLOCKER = 'Partner/licensed route requires permission before publishing';

export const RESTRICTED_ROUTE_CATALOG_SOURCES: readonly RouteCatalogRestrictedSource[] = [
  {
    providerId: 'bdr_partner_restricted',
    aliases: ['bdr', 'ride_bdr', 'backcountry_discovery_routes'],
    label: 'Backcountry Discovery Routes Partner Restricted',
    sourceType: 'partner_restricted',
    authority: 'partner_restricted',
    sourceUri: 'https://ridebdr.com/download-tracks/',
    attribution: 'Backcountry Discovery Routes',
    license: 'restricted partner terms',
    refreshFrequency: 'license required before publishing',
    status: 'disabled',
    usePermission: 'not_granted',
    publishable: false,
    blocker: GENERIC_PARTNER_RESTRICTED_BLOCKER,
    requiredAction: 'Do not ingest, sync, rehost, or recommend BDR GPX geometry until ECS has written partner permission.',
  },
  {
    providerId: 'california_state_parks_roads_trails_restricted',
    aliases: [
      'california_state_parks_roads_trails',
      'california_state_parks',
      'ca_state_parks_roads_trails',
    ],
    label: 'California State Parks Roads and Trails Restricted',
    sourceType: 'partner_restricted',
    authority: 'partner_restricted',
    sourceUri: 'https://www.parks.ca.gov/?page_id=29682',
    attribution: 'California State Parks',
    license: 'commercial use requires advance approval',
    refreshFrequency: 'license required before ingestion',
    status: 'disabled',
    usePermission: 'not_granted',
    publishable: false,
    blocker: 'California State Parks route data commercial use requires advance approval before ECS can ingest, rehost, or recommend it.',
    requiredAction: 'Do not ingest, sync, rehost, or recommend California State Parks route geometry until commercial approval is documented.',
  },
];

function sourceKey(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function providerIdFor(source: string | RouteCatalogSourcePublishabilityInput): string {
  return typeof source === 'string'
    ? sourceKey(source)
    : sourceKey(source.providerId ?? source.provider_id);
}

function sourceTypeFor(source: string | RouteCatalogSourcePublishabilityInput): string {
  return typeof source === 'string'
    ? ''
    : sourceKey(source.sourceType ?? source.source_type);
}

function usePermissionFor(source: string | RouteCatalogSourcePublishabilityInput): string {
  return typeof source === 'string'
    ? ''
    : sourceKey(source.usePermission ?? source.use_permission);
}

export function getRouteCatalogSourceRestriction(
  source: string | RouteCatalogSourcePublishabilityInput,
): RouteCatalogRestrictedSource | undefined {
  const providerId = providerIdFor(source);
  if (!providerId) return undefined;
  return RESTRICTED_ROUTE_CATALOG_SOURCES.find(
    (candidate) =>
      sourceKey(candidate.providerId) === providerId ||
      candidate.aliases.some((alias) => sourceKey(alias) === providerId),
  );
}

export function getRouteCatalogSourcePublishingBlocker(
  source: string | RouteCatalogSourcePublishabilityInput,
): string | undefined {
  const restriction = getRouteCatalogSourceRestriction(source);
  if (restriction) return restriction.blocker;
  if (sourceTypeFor(source) === 'partner_restricted' && usePermissionFor(source) !== 'granted') {
    return GENERIC_PARTNER_RESTRICTED_BLOCKER;
  }
  return undefined;
}

export function isRouteCatalogSourcePublishable(
  source: string | RouteCatalogSourcePublishabilityInput,
): boolean {
  return !getRouteCatalogSourcePublishingBlocker(source);
}

export function assertRouteCatalogSourcePublishable(
  source: string | RouteCatalogSourcePublishabilityInput,
): void {
  const blocker = getRouteCatalogSourcePublishingBlocker(source);
  if (blocker) throw new Error(blocker);
}

export function routeCatalogRestrictedSourceUpserts(): RouteCatalogRestrictedSourceUpsert[] {
  return RESTRICTED_ROUTE_CATALOG_SOURCES.map((source) => ({
    provider_id: source.providerId,
    name: source.label,
    source_type: source.sourceType,
    authority: source.authority,
    source_uri: source.sourceUri,
    attribution: source.attribution,
    license: source.license,
    refresh_frequency: source.refreshFrequency,
    status: source.status,
  }));
}
