export type MichiganOrvGpxSource = {
  key: string;
  name: string;
  url: string;
  routeKind: 'route' | 'trail' | 'motorcycle' | 'mixed';
  region: 'eastern_up' | 'central_up' | 'western_up' | 'lower_peninsula' | 'statewide';
};

export type MichiganOrvGpxTrack = {
  source: MichiganOrvGpxSource;
  name: string;
  publishedDistanceMiles: number | null;
  segments: number[][][];
};

export type MichiganOrvRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const MICHIGAN_ORV_SOURCE = {
  providerId: 'michigan_dnr_orv_gpx',
  name: 'Michigan DNR ORV GPX Trail Data',
  sourceUri: 'https://www.michigan.gov/dnr/things-to-do/orv-riding/maps-list',
  attribution: 'Michigan Department of Natural Resources ORV trail maps and GPX files',
};

export const MICHIGAN_ORV_GPX_SOURCES: MichiganOrvGpxSource[] = [
  {
    key: 'alcona_orv_trail',
    name: 'Alcona ORV Trail',
    url: 'https://www2.dnr.state.mi.us/publications/pdfs/forestslandwater/ORV/Maps-Trail/alcona_orv_trail.gpx',
    routeKind: 'trail',
    region: 'lower_peninsula',
  },
  {
    key: 'atlanta_route',
    name: 'Atlanta ORV Route',
    url: 'https://www2.dnr.state.mi.us/publications/pdfs/forestslandwater/ORV/Maps-Trail/atlanta_route.gpx',
    routeKind: 'route',
    region: 'lower_peninsula',
  },
  {
    key: 'evart_motorcycle_trail',
    name: 'Evart Motorcycle Trail',
    url: 'https://www2.dnr.state.mi.us/publications/pdfs/forestslandwater/ORV/Maps-Trail/evart_motorcycle_trail.gpx',
    routeKind: 'motorcycle',
    region: 'lower_peninsula',
  },
  {
    key: 'statewide_orv_trail_gpx',
    name: 'Statewide ORV Trail GPX Data',
    url: 'https://www2.dnr.state.mi.us/publications/pdfs/forestslandwater/ORV/Maps-Trail/orv_statewide.gpx',
    routeKind: 'mixed',
    region: 'statewide',
  },
];

const MICHIGAN_ORV_CAVEAT =
  'Michigan DNR ORV GPX files are official state route/trail geometry, but current closures, permits, local rules, vehicle width/fit, and seasonal conditions must be checked before ECS can publicly recommend a route.';

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function toTitleCase(value: string): string {
  const acronyms = new Set(['dnr', 'orv', 'gpx', 'mccct', 'atv', 'utv']);
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => acronyms.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stablePayloadHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function elementText(element: Element, tagName: string): string {
  return cleanString(element.getElementsByTagName(tagName).item(0)?.textContent);
}

function normalizePoint(element: Element): number[] | null {
  const latitude = Number(element.getAttribute('lat'));
  const longitude = Number(element.getAttribute('lon'));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

function samePoint(a: number[] | null, b: number[] | null): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

function normalizeTrackSegment(segment: Element): number[][] {
  const points: number[][] = [];
  const pointNodes = Array.from(segment.getElementsByTagName('trkpt'));
  for (const pointNode of pointNodes) {
    const point = normalizePoint(pointNode);
    if (!point || samePoint(points[points.length - 1], point)) continue;
    points.push(point);
  }
  return points;
}

function routeGeometryFromSegments(segments: number[][][]): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (segments.length === 0) return null;
  if (segments.length === 1) return { type: 'LineString', coordinates: segments[0] };
  return { type: 'MultiLineString', coordinates: segments };
}

function centerFromSegments(segments: number[][][]): { latitude: number; longitude: number } | null {
  const points = segments.flat();
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, point) => ({
      longitude: acc.longitude + point[0],
      latitude: acc.latitude + point[1],
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: Number((totals.latitude / points.length).toFixed(6)),
    longitude: Number((totals.longitude / points.length).toFixed(6)),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(a: number[], b: number[]): number {
  const earthRadiusMiles = 3958.7613;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceMilesFromSegments(segments: number[][][]): number {
  return segments.reduce((total, segment) => {
    let segmentTotal = 0;
    for (let index = 1; index < segment.length; index += 1) {
      segmentTotal += haversineMiles(segment[index - 1], segment[index]);
    }
    return total + segmentTotal;
  }, 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['full_size_4x4', 'atv', 'utv', 'motorcycle'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function inferRouteKind(source: MichiganOrvGpxSource, trackName: string): MichiganOrvGpxSource['routeKind'] {
  if (source.routeKind !== 'mixed') return source.routeKind;
  const text = `${source.name} ${trackName}`.toLowerCase();
  if (text.includes('motorcycle') || text.includes('mccct')) return 'motorcycle';
  if (text.includes('route')) return 'route';
  if (text.includes('trail')) return 'trail';
  return 'mixed';
}

function vehicleFitForKind(kind: MichiganOrvGpxSource['routeKind']): string[] {
  if (kind === 'motorcycle') return ['motorcycle'];
  if (kind === 'route') return ['full_size_4x4', 'atv', 'utv', 'motorcycle'];
  return ['atv', 'utv', 'motorcycle'];
}

function coverageForKind(kind: MichiganOrvGpxSource['routeKind']): number {
  if (kind === 'route') return 85;
  if (kind === 'motorcycle') return 78;
  return 80;
}

function confidenceForKind(kind: MichiganOrvGpxSource['routeKind']): number {
  if (kind === 'route') return 84;
  if (kind === 'motorcycle') return 80;
  return 82;
}

function routeKindLabel(kind: MichiganOrvGpxSource['routeKind']): string {
  if (kind === 'route') return 'Route';
  if (kind === 'motorcycle') return 'Motorcycle Trail';
  return 'Trail';
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(4.5 + Math.min(2.5, distanceMiles / 20), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.4));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function routeIntelligence(args: {
  routeKind: MichiganOrvGpxSource['routeKind'];
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'michigan_dnr_orv_gpx',
    sourceLayerName: 'Michigan DNR ORV GPX',
    routeKind: args.routeKind,
    remotenessBasis: 'estimated_from_michigan_dnr_orv_distance_and_state_forest_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_michigan_dnr_orv_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: MICHIGAN_ORV_CAVEAT,
  };
}

export function michiganOrvSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: MICHIGAN_ORV_SOURCE.providerId,
    name: MICHIGAN_ORV_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: MICHIGAN_ORV_SOURCE.sourceUri,
    attribution: MICHIGAN_ORV_SOURCE.attribution,
    license: 'state agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function selectMichiganOrvGpxSources(value: unknown): MichiganOrvGpxSource[] {
  const requested = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const keys = new Set(requested.map((item) => cleanString(item).toLowerCase()).filter(Boolean));
  if (keys.size === 0) {
    return MICHIGAN_ORV_GPX_SOURCES.filter((source) => source.key !== 'statewide_orv_trail_gpx').slice(0, 3);
  }
  return MICHIGAN_ORV_GPX_SOURCES.filter((source) => keys.has(source.key.toLowerCase()) || keys.has(source.url.toLowerCase()));
}

export function parseMichiganOrvGpxTracks(gpxText: string, source: MichiganOrvGpxSource): MichiganOrvGpxTrack[] {
  const parser = new DOMParser();
  const document = parser.parseFromString(gpxText, 'application/xml');
  const tracks = Array.from(document.getElementsByTagName('trk'));
  return tracks
    .map((track, index) => {
      const trackName = elementText(track, 'name') || `${source.key}_${index + 1}`;
      const publishedDistanceMiles = cleanNumber(elementText(track, 'desc'));
      const segments = Array.from(track.getElementsByTagName('trkseg'))
        .map(normalizeTrackSegment)
        .filter((segment) => segment.length >= 2);
      return {
        source,
        name: trackName,
        publishedDistanceMiles,
        segments,
      };
    })
    .filter((track) => track.segments.length > 0);
}

export function gpxTrackToMichiganOrvRouteUpsert(
  track: MichiganOrvGpxTrack,
  context: MichiganOrvRouteContext,
) {
  const routeGeometry = routeGeometryFromSegments(track.segments);
  const center = centerFromSegments(track.segments);
  if (!routeGeometry || !center) return null;

  const calculatedDistanceMiles = distanceMilesFromSegments(track.segments);
  const distanceMiles = track.publishedDistanceMiles && track.publishedDistanceMiles > 0
    ? track.publishedDistanceMiles
    : calculatedDistanceMiles;
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles < minMiles) return null;

  const routeKind = inferRouteKind(track.source, track.name);
  const vehicleFit = vehicleFitForKind(routeKind);
  const coverage = coverageForKind(routeKind);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 14));
  const publicId = slugify(['michigan-dnr-orv', track.name || track.source.key].join(' '));
  const titleName = toTitleCase(track.source.name || track.name);
  const providerId = `michigan-dnr-orv:${track.source.key}`;

  const verifiedRoute = {
    public_id: publicId,
    name: `Michigan DNR ORV ${routeKindLabel(routeKind)} ${titleName}`,
    description: 'Michigan DNR official ORV GPX geometry. ECS stores this as state source-backed curation input, not as a finished expedition route recommendation.',
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: estimatedDurationMinutes,
    difficulty: 'unknown',
    vehicle_fit: orderedVehicleFit(vehicleFit),
    remoteness_score: estimateRemotenessScore(distanceMiles),
    campability_score: null,
    minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
    minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
    route_intelligence: routeIntelligence({ routeKind, distanceMiles, estimatedDurationMinutes }),
    official_access_coverage_pct: coverage,
    unknown_access_coverage_pct: 100 - coverage,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'partially_verified',
    recommendation_status: 'not_recommended',
    review_status: 'approved',
    confidence_score: confidenceForKind(routeKind),
    confidence_reasons: [
      'Michigan DNR publishes this as official ORV GPX route/trail geometry.',
      `DNR GPX route kind: ${routeKindLabel(routeKind)}.`,
    ],
    warning_reasons: [
      MICHIGAN_ORV_CAVEAT,
      'Michigan DNR ORV GPX source awaits ECS route curation before public recommendation.',
    ],
    blocker_reasons: ['Michigan DNR ORV GPX geometry is not yet reviewed with current Michigan DNR closures, local rules, seasonal conditions, and ECS route curation.'],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'michigan_dnr_orv_gpx',
      providerFeatureId: providerId,
      gpxSourceKey: track.source.key,
      routeKind,
      region: track.source.region,
      gpxUrl: track.source.url,
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles: track.publishedDistanceMiles,
    },
    tags: uniqueStrings([
      'Michigan DNR ORV',
      'state agency',
      routeKindLabel(routeKind),
      track.source.region,
      track.source.name,
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 120),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: `Michigan DNR ORV GPX: ${track.source.name}`,
    source_uri: track.source.url,
    payload_hash: stablePayloadHash(track),
    geometry: null,
    properties: {
      source: track.source,
      trackName: track.name,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles: track.publishedDistanceMiles,
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'primary',
    coverage_pct: coverage,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: `Michigan DNR ORV GPX: ${track.source.name}`,
      routeKind,
      region: track.source.region,
      gpxSourceKey: track.source.key,
      gpxUrl: track.source.url,
      caveat: MICHIGAN_ORV_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}
