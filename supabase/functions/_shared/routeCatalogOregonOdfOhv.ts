export type OregonOdfOhvVehicleClass = 'class_i' | 'class_ii_iv' | 'class_iii';

export type OregonOdfOhvGpxSource = {
  key: string;
  name: string;
  url: string;
  vehicleClass: OregonOdfOhvVehicleClass;
  area: 'tillamook_state_forest';
};

export type OregonOdfOhvGpxTrack = {
  source: OregonOdfOhvGpxSource;
  name: string;
  metadataTime: string | null;
  segments: number[][][];
};

export type OregonOdfOhvRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const OREGON_ODF_OHV_SOURCE = {
  providerId: 'oregon_odf_ohv_gpx',
  name: 'Oregon ODF OHV GPX Trail Data',
  sourceUri: 'https://www.oregon.gov/odf/recreation/pages/motorizedtrails.aspx',
  attribution: 'Oregon Department of Forestry OHV trail maps and GPX files',
};

export const OREGON_ODF_OHV_GPX_SOURCES: OregonOdfOhvGpxSource[] = [
  {
    key: 'tillamook_class_i',
    name: 'Tillamook State Forest OHV Class I GPX',
    url: 'https://www.oregon.gov/odf/recreation/guides/tsf-ohv-trails-class-i.gpx',
    vehicleClass: 'class_i',
    area: 'tillamook_state_forest',
  },
  {
    key: 'tillamook_class_ii_iv',
    name: 'Tillamook State Forest OHV Class II/IV GPX',
    url: 'https://www.oregon.gov/odf/recreation/guides/tsf-ohv-trails-class-ii-iv.gpx',
    vehicleClass: 'class_ii_iv',
    area: 'tillamook_state_forest',
  },
  {
    key: 'tillamook_class_iii',
    name: 'Tillamook State Forest OHV Class III GPX',
    url: 'https://www.oregon.gov/odf/recreation/guides/tsf-ohv-trails-class-iii.gpx',
    vehicleClass: 'class_iii',
    area: 'tillamook_state_forest',
  },
];

const OREGON_ODF_OHV_CAVEAT =
  'Oregon ODF OHV GPX files are official state forest trail geometry. Current open/closed status, fire restrictions, vehicle class signage, permits, local rules, and seasonal conditions still require trip-date checks before travel.';

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
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
  const acronyms = new Set(['odf', 'ohv', 'gpx', 'atv', 'utv']);
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

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function elementBlocks(xml: string, tagName: string): string[] {
  const blocks = [];
  const expression = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${tagName}>`, 'gi');
  let match = expression.exec(xml);
  while (match) {
    blocks.push(match[1]);
    match = expression.exec(xml);
  }
  return blocks;
}

function elementText(xml: string, tagName: string): string {
  const text = elementBlocks(xml, tagName)[0] ?? '';
  return cleanString(decodeXmlText(text.replace(/<[^>]+>/g, '')));
}

function attributeText(attributes: string, name: string): string {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  return cleanString(decodeXmlText(expression.exec(attributes)?.[2] ?? ''));
}

function normalizePointAttributes(attributes: string): number[] | null {
  const latitude = Number(attributeText(attributes, 'lat'));
  const longitude = Number(attributeText(attributes, 'lon'));
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

function normalizeTrackSegment(segmentXml: string): number[][] {
  const points: number[][] = [];
  const pointExpression = /<(?:[A-Za-z0-9_]+:)?trkpt\b([^>]*)\/?>/gi;
  let match = pointExpression.exec(segmentXml);
  while (match) {
    const point = normalizePointAttributes(match[1]);
    if (point && !samePoint(points[points.length - 1], point)) points.push(point);
    match = pointExpression.exec(segmentXml);
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

function vehicleFitForClass(vehicleClass: OregonOdfOhvVehicleClass): string[] {
  if (vehicleClass === 'class_i') return ['atv'];
  if (vehicleClass === 'class_ii_iv') return ['full_size_4x4', 'utv'];
  return ['motorcycle'];
}

function coverageForClass(vehicleClass: OregonOdfOhvVehicleClass): number {
  if (vehicleClass === 'class_ii_iv') return 84;
  if (vehicleClass === 'class_i') return 82;
  return 80;
}

function confidenceForClass(vehicleClass: OregonOdfOhvVehicleClass): number {
  if (vehicleClass === 'class_ii_iv') return 83;
  if (vehicleClass === 'class_i') return 81;
  return 80;
}

function classLabel(vehicleClass: OregonOdfOhvVehicleClass): string {
  if (vehicleClass === 'class_i') return 'Class I';
  if (vehicleClass === 'class_ii_iv') return 'Class II/IV';
  return 'Class III';
}

function areaLabel(area: OregonOdfOhvGpxSource['area']): string {
  if (area === 'tillamook_state_forest') return 'Tillamook State Forest';
  return toTitleCase(area);
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(4.5 + Math.min(2.5, distanceMiles / 18), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.5));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function routeIntelligence(args: {
  vehicleClass: OregonOdfOhvVehicleClass;
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'oregon_odf_ohv_gpx',
    sourceLayerName: 'Oregon ODF OHV GPX',
    vehicleClass: args.vehicleClass,
    remotenessBasis: 'estimated_from_oregon_odf_ohv_distance_and_state_forest_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_oregon_odf_ohv_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: OREGON_ODF_OHV_CAVEAT,
  };
}

export function oregonOdfOhvSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: OREGON_ODF_OHV_SOURCE.providerId,
    name: OREGON_ODF_OHV_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: OREGON_ODF_OHV_SOURCE.sourceUri,
    attribution: OREGON_ODF_OHV_SOURCE.attribution,
    license: 'state agency published GPX files',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function selectOregonOdfOhvGpxSources(value: unknown): OregonOdfOhvGpxSource[] {
  const requested = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const keys = new Set(requested.map((item) => cleanString(item).toLowerCase()).filter(Boolean));
  if (keys.size === 0) return OREGON_ODF_OHV_GPX_SOURCES;
  return OREGON_ODF_OHV_GPX_SOURCES.filter(
    (source) => keys.has(source.key.toLowerCase()) || keys.has(source.url.toLowerCase()),
  );
}

export function parseOregonOdfOhvGpxTracks(
  gpxText: string,
  source: OregonOdfOhvGpxSource,
): OregonOdfOhvGpxTrack[] {
  const metadataTime = elementText(gpxText, 'time') || null;
  const tracks = elementBlocks(gpxText, 'trk');
  const groupedTracks = new Map<string, OregonOdfOhvGpxTrack>();

  tracks.forEach((trackXml, index) => {
    const trackName = elementText(trackXml, 'name') || `${source.key}_${index + 1}`;
    const segments = elementBlocks(trackXml, 'trkseg')
      .map(normalizeTrackSegment)
      .filter((segment) => segment.length >= 2);
    if (segments.length === 0) return;

    const existing = groupedTracks.get(trackName);
    if (existing) {
      existing.segments.push(...segments);
      return;
    }

    groupedTracks.set(trackName, {
      source,
      name: trackName,
      metadataTime,
      segments,
    });
  });

  return Array.from(groupedTracks.values());
}

export function gpxTrackToOregonOdfOhvRouteUpsert(
  track: OregonOdfOhvGpxTrack,
  context: OregonOdfOhvRouteContext,
) {
  const routeGeometry = routeGeometryFromSegments(track.segments);
  const center = centerFromSegments(track.segments);
  if (!routeGeometry || !center) return null;

  const distanceMiles = distanceMilesFromSegments(track.segments);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles < minMiles) return null;

  const vehicleFit = vehicleFitForClass(track.source.vehicleClass);
  const coverage = coverageForClass(track.source.vehicleClass);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 18));
  const publicId = slugify(['oregon-odf-ohv', track.source.key, track.name].join(' '));
  const providerId = `oregon-odf-ohv:${track.source.key}:${slugify(track.name || 'track')}`;
  const label = classLabel(track.source.vehicleClass);
  const area = areaLabel(track.source.area);

  const verifiedRoute = {
    public_id: publicId,
    name: `Oregon ODF OHV ${label} ${track.name} - ${area}`,
    description: 'Oregon Department of Forestry official OHV GPX geometry. ECS publishes this as an official source-backed route recommendation with visible current-condition caveats.',
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
    route_intelligence: routeIntelligence({
      vehicleClass: track.source.vehicleClass,
      distanceMiles,
      estimatedDurationMinutes,
    }),
    official_access_coverage_pct: coverage,
    unknown_access_coverage_pct: 100 - coverage,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: confidenceForClass(track.source.vehicleClass),
    confidence_reasons: [
      'Oregon ODF publishes this as official OHV GPX trail geometry.',
      `ODF GPX vehicle class: ${label}.`,
    ],
    warning_reasons: [
      OREGON_ODF_OHV_CAVEAT,
      'Check current Oregon ODF closures, fire restrictions, vehicle class signage, permits, and seasonal conditions before travel.',
    ],
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'oregon_odf_ohv_gpx',
      providerFeatureId: providerId,
      gpxSourceKey: track.source.key,
      vehicleClass: track.source.vehicleClass,
      area: track.source.area,
      gpxUrl: track.source.url,
      metadataTime: track.metadataTime,
      calculatedDistanceMiles: Number(distanceMiles.toFixed(3)),
    },
    tags: uniqueStrings([
      'Oregon ODF OHV',
      'state agency',
      label,
      area,
      track.source.name,
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 120),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: `Oregon ODF OHV GPX: ${track.source.name}`,
    source_uri: track.source.url,
    payload_hash: stablePayloadHash(track),
    geometry: null,
    properties: {
      source: track.source,
      trackName: track.name,
      metadataTime: track.metadataTime,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
      calculatedDistanceMiles: Number(distanceMiles.toFixed(3)),
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
      sourceLayer: `Oregon ODF OHV GPX: ${track.source.name}`,
      vehicleClass: track.source.vehicleClass,
      area: track.source.area,
      gpxSourceKey: track.source.key,
      gpxUrl: track.source.url,
      metadataTime: track.metadataTime,
      caveat: OREGON_ODF_OHV_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}
