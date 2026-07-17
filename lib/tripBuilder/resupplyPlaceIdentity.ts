export function normalizeResupplyPlaceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || null;
}

function normalizeProviderNamespace(value: unknown): string | null {
  const normalized = normalizeResupplyPlaceId(value);
  if (normalized?.startsWith('mapbox')) return 'mapbox';
  return normalized;
}

export function providerResupplyPlaceIdentity(
  providerPlaceId: unknown,
  provider?: unknown,
): string | null {
  if (typeof providerPlaceId !== 'string') return null;
  const opaqueId = providerPlaceId.trim();
  if (!opaqueId) return null;
  const providerNamespace = normalizeProviderNamespace(provider);
  return `provider-place:${providerNamespace ? `${providerNamespace}:` : ''}${encodeURIComponent(opaqueId)}`;
}

export function normalizeResupplyPlaceIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex < 0) return providerResupplyPlaceIdentity(trimmed);
  const namespace = normalizeResupplyPlaceId(trimmed.slice(0, separatorIndex));
  const rawIdentity = trimmed.slice(separatorIndex + 1).trim();
  if (namespace === 'provider-place') return rawIdentity ? `provider-place:${rawIdentity}` : null;
  const identity = normalizeResupplyPlaceId(rawIdentity);
  return namespace && identity ? `${namespace}:${identity}` : null;
}

export function resupplyPlaceIdentityFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const providerMetadata = metadata.providerMetadata != null &&
    typeof metadata.providerMetadata === 'object' &&
    !Array.isArray(metadata.providerMetadata)
    ? metadata.providerMetadata as Record<string, unknown>
    : null;
  const provider = metadata.provider ??
    metadata.providerId ??
    providerMetadata?.providerId ??
    providerMetadata?.source ??
    metadata.source;
  return normalizeResupplyPlaceIdentity(metadata.placeIdentity) ??
    providerResupplyPlaceIdentity(metadata.providerPlaceId, provider) ??
    providerResupplyPlaceIdentity(metadata.mapboxId, 'mapbox') ??
    null;
}

export type ResupplyOptionRefreshEvidence = {
  stableKey: string;
  title: string;
  subtitle: string | null;
  coordinate: { latitude: number; longitude: number };
  distanceFromRouteStartMiles: number | null;
  distanceFromOriginMiles: number | null;
  distanceFromTrailheadMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  routeDeviationMiles: number | null;
  detourDurationMinutes: number | null;
  remainingApproachMilesToTrailhead: number | null;
  distanceBeforeRemoteEntryMiles: number | null;
  approachProgressRatio: number | null;
  approachScore: number | null;
  rank: number | null;
  beforeTrailEntry: boolean | null;
  beforeRemoteEntry: boolean | null;
  fallbackState: string;
  routeEvidenceState: string;
  routeAwareConfidence: string;
  remoteEntrySource: string;
  remoteEntryConfidence: string;
  remoteEntryEstimated: boolean;
  remoteEntryLabel: string;
  categoryCoverage: string[];
  operatingStatus: string;
  providerConfidence: string;
  coordinateConfidence: string | null;
  accessStatus: string;
  providerScore: number | null;
  providerId: string;
  providerResultState: string;
  warnings: string[];
  diesel: boolean;
  sourceType: string;
  suggestionId: string;
  mapboxId: string | null;
};

export function buildResupplyOptionRefreshSignature(
  evidence: ResupplyOptionRefreshEvidence,
): string {
  return JSON.stringify({
    ...evidence,
    categoryCoverage: [...evidence.categoryCoverage].sort(),
    warnings: [...evidence.warnings],
  });
}

export function retainEquivalentResupplyOptions<T>(
  previous: T[],
  incoming: T[],
  evidence: (option: T) => ResupplyOptionRefreshEvidence,
): T[] {
  if (previous.length !== incoming.length) return incoming;
  const equivalent = previous.every((option, index) => (
    buildResupplyOptionRefreshSignature(evidence(option)) ===
    buildResupplyOptionRefreshSignature(evidence(incoming[index]))
  ));
  return equivalent ? previous : incoming;
}
