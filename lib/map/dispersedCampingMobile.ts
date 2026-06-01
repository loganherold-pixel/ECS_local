import type {
  CampLayerFetchFailureDiagnostic,
} from './campLayerFetchDiagnostics';
import type {
  DispersedCampingEligibilityFeatureCollection,
  DispersedCampingEligibilityProperties,
  DispersedCampingRegion,
  GeoJSON,
} from './dispersedCampingTypes';
import { toDispersedCampingFeatureCollection } from './dispersedCampingGeojsonAdapter';

export type DispersedCampingSearchBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type DispersedCampingSearchRequest = {
  bbox: string;
  limit: number;
};

export type DispersedCampingSearchResponse = {
  ok: boolean;
  regions?: DispersedCampingRegion[];
  geojson?: DispersedCampingEligibilityFeatureCollection;
  count?: number;
  error?: string;
  diagnostic?: CampLayerFetchFailureDiagnostic;
  meta?: {
    bbox?: DispersedCampingSearchBbox;
    source?: string;
    featureCount?: number;
    truncated?: boolean;
    eligibilityAssumption?: string;
  };
};

export const DISPERSED_CAMPING_EDGE_FUNCTION = 'dispersed-camping-eligibility';
export const DISPERSED_CAMPING_SEARCH_LIMIT = 80;
export const DISPERSED_CAMPING_CACHE_TTL_MS = 5 * 60 * 1000;
export const EMPTY_DISPERSED_CAMPING_FEATURE_COLLECTION: DispersedCampingEligibilityFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
export const DISPERSED_CAMPING_UNAVAILABLE_ERROR =
  'Dispersed camping eligibility is temporarily unavailable. Try again after refreshing the map.';
export const DISPERSED_CAMPING_MALFORMED_RESPONSE_ERROR =
  'Malformed dispersed camping eligibility response.';

function finiteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function normalizeDispersedCampingSearchBbox(
  bbox: DispersedCampingSearchBbox | null | undefined,
): DispersedCampingSearchBbox | null {
  if (!bbox) return null;
  const { minLng, minLat, maxLng, maxLat } = bbox;
  if (![minLng, minLat, maxLng, maxLat].every(finiteNumber)) return null;
  const normalized = {
    minLng: Math.max(-180, Math.min(minLng, maxLng)),
    minLat: Math.max(-90, Math.min(minLat, maxLat)),
    maxLng: Math.min(180, Math.max(minLng, maxLng)),
    maxLat: Math.min(90, Math.max(minLat, maxLat)),
  };
  if (normalized.maxLng <= normalized.minLng || normalized.maxLat <= normalized.minLat) return null;
  return normalized;
}

export function buildDispersedCampingCacheKey(bbox: DispersedCampingSearchBbox): string {
  const normalized = normalizeDispersedCampingSearchBbox(bbox);
  if (!normalized) return 'invalid';
  return [
    normalized.minLng.toFixed(3),
    normalized.minLat.toFixed(3),
    normalized.maxLng.toFixed(3),
    normalized.maxLat.toFixed(3),
  ].join(',');
}

export function buildDispersedCampingSearchRequest(
  bbox: DispersedCampingSearchBbox,
): DispersedCampingSearchRequest {
  const normalized = normalizeDispersedCampingSearchBbox(bbox);
  const safeBbox = normalized ?? bbox;
  return {
    bbox: [safeBbox.minLng, safeBbox.minLat, safeBbox.maxLng, safeBbox.maxLat]
      .map((value) => Number(value).toFixed(6))
      .join(','),
    limit: DISPERSED_CAMPING_SEARCH_LIMIT,
  };
}

export function friendlyDispersedCampingError(message?: string | null): string {
  const text = String(message ?? '').trim();
  if (!text) {
    return DISPERSED_CAMPING_UNAVAILABLE_ERROR;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes('non-2xx') ||
    lower.includes('edge function') ||
    lower.includes('functionsfetcherror') ||
    lower.includes('failed to fetch')
  ) {
    return DISPERSED_CAMPING_UNAVAILABLE_ERROR;
  }
  if (lower.includes('bbox') || lower.includes('zoom')) {
    return 'Zoom in or move the map, then try loading dispersed camping eligibility again.';
  }
  return text;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
}

function isPolygonGeometry(value: unknown): value is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const geometry = toRecord(value);
  return (
    (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') &&
    Array.isArray(geometry.coordinates)
  );
}

function isDispersedCampingFeatureCollection(
  value: unknown,
): value is DispersedCampingEligibilityFeatureCollection {
  const collection = toRecord(value);
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return false;
  return collection.features.every((feature) => {
    const record = toRecord(feature);
    const properties = toRecord(record?.properties);
    return (
      record?.type === 'Feature' &&
      isPolygonGeometry(record.geometry) &&
      typeof properties?.id === 'string' &&
      typeof properties.landManager === 'string' &&
      typeof properties.confidence === 'string' &&
      typeof properties.eligibilityLabel === 'string'
    );
  });
}

function featureToRegion(feature: DispersedCampingEligibilityFeatureCollection['features'][number]): DispersedCampingRegion {
  const properties = feature.properties as DispersedCampingEligibilityProperties;
  return {
    id: properties.id,
    name: properties.name,
    geometry: feature.geometry,
    landManager: properties.landManager,
    confidence: properties.confidence,
    eligibilityLabel: properties.eligibilityLabel,
    basis: stringArray(properties.basis),
    restrictions: stringArray(properties.restrictions),
    sourceNames: stringArray(properties.sourceNames),
    source: properties.source,
    sourceProvider: properties.sourceProvider,
    sourceUpdatedAt: properties.sourceUpdatedAt,
    requiresVerification: properties.requiresVerification !== false,
    permitRequired: properties.permitRequired,
    fireRestrictionKnown: properties.fireRestrictionKnown,
    seasonalAccessKnown: properties.seasonalAccessKnown,
    closureKnown: properties.closureKnown,
  };
}

function normalizeRegions(value: unknown): DispersedCampingRegion[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const regions = value.filter((region): region is DispersedCampingRegion => {
    const record = toRecord(region);
    return (
      typeof record?.id === 'string' &&
      isPolygonGeometry(record.geometry) &&
      typeof record.landManager === 'string' &&
      typeof record.confidence === 'string' &&
      typeof record.eligibilityLabel === 'string'
    );
  });
  return regions.length === value.length ? regions : null;
}

export function normalizeDispersedCampingSearchResponse(raw: unknown): DispersedCampingSearchResponse {
  const record = toRecord(raw);
  if (!record) {
    return { ok: false, error: DISPERSED_CAMPING_MALFORMED_RESPONSE_ERROR, regions: [], count: 0 };
  }

  if (record.ok === false) {
    return {
      ok: false,
      error: typeof record.error === 'string' ? record.error : DISPERSED_CAMPING_UNAVAILABLE_ERROR,
      regions: [],
      count: 0,
    };
  }

  if (record.ok !== true) {
    return { ok: false, error: DISPERSED_CAMPING_MALFORMED_RESPONSE_ERROR, regions: [], count: 0 };
  }

  const geojson =
    record.geojson == null
      ? EMPTY_DISPERSED_CAMPING_FEATURE_COLLECTION
      : isDispersedCampingFeatureCollection(record.geojson)
        ? record.geojson
        : null;
  if (!geojson) {
    return { ok: false, error: DISPERSED_CAMPING_MALFORMED_RESPONSE_ERROR, regions: [], count: 0 };
  }

  const providedRegions = normalizeRegions(record.regions);
  if (record.regions != null && !providedRegions) {
    return { ok: false, error: DISPERSED_CAMPING_MALFORMED_RESPONSE_ERROR, regions: [], count: 0 };
  }

  const regions =
    providedRegions && providedRegions.length > 0
      ? providedRegions
      : geojson.features.map(featureToRegion);
  const featureCollection = geojson.features.length > 0 || !providedRegions
    ? geojson
    : toDispersedCampingFeatureCollection(regions);
  const meta = toRecord(record.meta);

  return {
    ok: true,
    regions,
    geojson: featureCollection,
    count:
      typeof record.count === 'number'
        ? record.count
        : featureCollection.features.length,
    ...(meta ? { meta: meta as DispersedCampingSearchResponse['meta'] } : {}),
  };
}
