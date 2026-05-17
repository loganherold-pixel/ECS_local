import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

type Bbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type EsriFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
  };
};

type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

type GeoJsonMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

type DispersedRegion = {
  id: string;
  name?: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  landManager: 'BLM' | 'USFS' | 'NPS' | 'STATE' | 'PRIVATE' | 'TRIBAL' | 'MILITARY' | 'LOCAL' | 'UNKNOWN';
  confidence: 'high' | 'medium' | 'verify' | 'restricted';
  eligibilityLabel: 'Likely eligible' | 'Verify locally' | 'Restricted / unavailable';
  basis: string[];
  restrictions: string[];
  sourceNames: string[];
  source?: string;
  sourceProvider?: string;
  sourceUpdatedAt?: string;
  requiresVerification: boolean;
  permitRequired?: boolean;
  fireRestrictionKnown?: boolean;
  seasonalAccessKnown?: boolean;
  closureKnown?: boolean;
};

const DEFAULT_PAD_US_MANAGER_URL =
  'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name/FeatureServer/0/query';
const MAX_BBOX_AREA_DEGREES = 80;
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function logDispersedSearch(level: 'info' | 'warn' | 'error', event: string, details: Record<string, unknown>) {
  const payload = { event, ...details };
  if (level === 'error') console.error('[dispersed-camping-eligibility]', payload);
  else if (level === 'warn') console.warn('[dispersed-camping-eligibility]', payload);
  else console.info('[dispersed-camping-eligibility]', payload);
}

function getEnvOrNull(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim() ? value.trim() : null;
}

async function requestParams(req: Request): Promise<URLSearchParams | Record<string, unknown>> {
  const url = new URL(req.url);
  if (req.method === 'GET') return url.searchParams;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.bbox && url.searchParams.get('bbox')) body.bbox = url.searchParams.get('bbox');
  return body;
}

function parseNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function parseBbox(input: URLSearchParams | Record<string, unknown>): Bbox | null {
  const bboxValue = input instanceof URLSearchParams ? input.get('bbox') : input.bbox;
  const parts =
    typeof bboxValue === 'string'
      ? bboxValue.split(',').map((part) => parseNumber(part.trim()))
      : Array.isArray(bboxValue)
        ? bboxValue.map(parseNumber)
        : null;
  if (!parts || parts.length !== 4 || parts.some((part) => part == null)) return null;
  const [lngA, latA, lngB, latB] = parts as number[];
  const minLng = Math.max(-180, Math.min(lngA, lngB));
  const maxLng = Math.min(180, Math.max(lngA, lngB));
  const minLat = Math.max(-90, Math.min(latA, latB));
  const maxLat = Math.min(90, Math.max(latA, latB));
  if (maxLng <= minLng || maxLat <= minLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function parseLimit(input: URLSearchParams | Record<string, unknown>): number {
  const raw = input instanceof URLSearchParams ? input.get('limit') : input.limit;
  const parsed = parseNumber(raw);
  if (!parsed || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function bboxArea(bbox: Bbox): number {
  return Math.abs((bbox.maxLng - bbox.minLng) * (bbox.maxLat - bbox.minLat));
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : undefined;
}

function normalizeLandManager(value: unknown): DispersedRegion['landManager'] {
  const text = String(value ?? '').trim().toUpperCase();
  if (text.includes('BUREAU OF LAND MANAGEMENT') || text === 'BLM') return 'BLM';
  if (text.includes('FOREST SERVICE') || text === 'USFS') return 'USFS';
  if (text.includes('NATIONAL PARK') || text === 'NPS') return 'NPS';
  if (text.includes('STATE')) return 'STATE';
  if (text.includes('PRIVATE')) return 'PRIVATE';
  if (text.includes('TRIBAL') || text.includes('TRIBE')) return 'TRIBAL';
  if (text.includes('MILITARY') || text.includes('DOD')) return 'MILITARY';
  if (text.includes('COUNTY') || text.includes('CITY') || text.includes('LOCAL')) return 'LOCAL';
  return 'UNKNOWN';
}

function accessLabel(value: unknown): string | undefined {
  const access = String(value ?? '').trim().toUpperCase();
  if (access === 'OA') return 'Open public access in PAD-US';
  if (access === 'RA') return 'Restricted public access in PAD-US';
  if (access === 'XA') return 'No public access in PAD-US';
  if (access === 'UK') return 'Public access unknown in PAD-US';
  return cleanText(value);
}

function hasRestrictedDesignation(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase();
  return [
    'closed',
    'closure',
    'no public access',
    'restricted access',
    'military',
    'administrative',
    'research natural area',
    'critical habitat closure',
    'day use',
  ].some((token) => text.includes(token));
}

function hasVerifyDesignation(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase();
  return [
    'wilderness',
    'monument',
    'permit',
    'conservation area',
    'special management',
    'wildlife',
    'recreation area',
  ].some((token) => text.includes(token));
}

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    area += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return area / 2;
}

function closeRing(ring: number[][]): number[][] | null {
  const coordinates = ring
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (coordinates.length < 4) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([first[0], first[1]]);
  return coordinates;
}

function pointInRing(point: number[], ring: number[][]): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const xi = ring[index][0];
    const yi = ring[index][1];
    const xj = ring[previous][0];
    const yj = ring[previous][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function esriRingsToGeoJson(rings: number[][][] | undefined): GeoJsonPolygon | GeoJsonMultiPolygon | null {
  if (!Array.isArray(rings)) return null;
  const normalized = rings
    .map(closeRing)
    .filter((ring): ring is number[][] => !!ring && Math.abs(ringArea(ring)) > 0);
  if (!normalized.length) return null;

  const outers = normalized.filter((ring) => ringArea(ring) < 0);
  const holes = normalized.filter((ring) => ringArea(ring) >= 0);
  const shells = outers.length > 0 ? outers : normalized;
  const polygons = shells.map((outer) => [outer]);

  for (const hole of holes) {
    const point = hole[0];
    const container = polygons.find((polygon) => pointInRing(point, polygon[0]));
    if (container && !container.includes(hole)) container.push(hole);
  }

  if (polygons.length === 1) {
    return { type: 'Polygon', coordinates: polygons[0] };
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function classifyFeature(attributes: Record<string, unknown>, landManager: DispersedRegion['landManager']) {
  const pubAccess = String(attributes.Pub_Access ?? '').trim().toUpperCase();
  const designation = cleanText(attributes.Des_Tp) ?? cleanText(attributes.Loc_Ds);

  if (
    ['PRIVATE', 'TRIBAL', 'MILITARY', 'NPS'].includes(landManager) ||
    pubAccess === 'XA' ||
    hasRestrictedDesignation(designation)
  ) {
    return {
      confidence: 'restricted' as const,
      eligibilityLabel: 'Restricted / unavailable' as const,
    };
  }

  if (pubAccess === 'RA' || hasVerifyDesignation(designation)) {
    return {
      confidence: 'verify' as const,
      eligibilityLabel: 'Verify locally' as const,
    };
  }

  if (landManager === 'BLM' || landManager === 'USFS') {
    return {
      confidence: 'medium' as const,
      eligibilityLabel: 'Likely eligible' as const,
    };
  }

  return {
    confidence: 'verify' as const,
    eligibilityLabel: 'Verify locally' as const,
  };
}

function esriFeatureToRegion(feature: EsriFeature): DispersedRegion | null {
  const attributes = feature.attributes ?? {};
  const geometry = esriRingsToGeoJson(feature.geometry?.rings);
  if (!geometry) return null;

  const id = cleanText(attributes.GlobalID) ?? `padus:${cleanText(attributes.OBJECTID) ?? crypto.randomUUID()}`;
  const landManager = normalizeLandManager(attributes.Mang_Name);
  const classification = classifyFeature(attributes, landManager);
  const areaName =
    cleanText(attributes.Unit_Nm) ??
    cleanText(attributes.Loc_Nm) ??
    cleanText(attributes.Own_Name) ??
    `${landManager} public land`;
  const access = accessLabel(attributes.Pub_Access);
  const designation = cleanText(attributes.Des_Tp) ?? cleanText(attributes.Loc_Ds);
  const sourceDate = cleanText(attributes.Src_Date);
  const basis = [
    `${landManager} public-land boundary from PAD-US`,
    areaName ? `Area: ${areaName}` : null,
    designation ? `Designation: ${designation}` : null,
    access,
  ].filter((value): value is string => !!value);
  const restrictions = [
    'Eligibility is inferred from public land manager and public-access metadata, not a campsite permit.',
    'Verify current local camping rules, closures, road access, fire restrictions, and stay limits.',
    classification.confidence === 'verify' ? 'Source metadata requires local verification before use.' : null,
    classification.confidence === 'restricted' ? 'Source metadata indicates restricted or unavailable public access.' : null,
  ].filter((value): value is string => !!value);

  return {
    id,
    name: areaName,
    geometry,
    landManager,
    confidence: classification.confidence,
    eligibilityLabel: classification.eligibilityLabel,
    basis,
    restrictions,
    sourceNames: ['USGS PAD-US Manager Name FeatureServer'],
    source: 'pad_us_manager_name',
    sourceProvider: 'USGS PAD-US',
    sourceUpdatedAt: sourceDate,
    requiresVerification: true,
    closureKnown: false,
    fireRestrictionKnown: false,
    seasonalAccessKnown: false,
  };
}

function buildFeatureCollection(regions: DispersedRegion[]) {
  return {
    type: 'FeatureCollection' as const,
    features: regions.map((region) => ({
      type: 'Feature' as const,
      id: region.id,
      geometry: region.geometry,
      properties: {
        id: region.id,
        name: region.name,
        confidence: region.confidence,
        landManager: region.landManager,
        eligibilityLabel: region.eligibilityLabel,
        basis: region.basis,
        restrictions: region.restrictions,
        sourceNames: region.sourceNames,
        source: region.source,
        sourceProvider: region.sourceProvider,
        sourceUpdatedAt: region.sourceUpdatedAt,
        requiresVerification: region.requiresVerification,
        closureKnown: region.closureKnown,
        fireRestrictionKnown: region.fireRestrictionKnown,
        seasonalAccessKnown: region.seasonalAccessKnown,
      },
    })),
  };
}

async function fetchPadUsRegions(bbox: Bbox, limit: number): Promise<{ regions: DispersedRegion[]; truncated: boolean }> {
  const endpoint = getEnvOrNull('PAD_US_MANAGER_FEATURE_URL') ?? DEFAULT_PAD_US_MANAGER_URL;
  const params = new URLSearchParams({
    f: 'json',
    where: "Mang_Name in ('BLM','USFS')",
    outFields:
      'OBJECTID,GlobalID,Mang_Name,Mang_Type,Loc_Nm,Unit_Nm,Des_Tp,Loc_Ds,Own_Name,Own_Type,Pub_Access,GAP_Sts,GIS_Acres,Agg_Src,GIS_Src,Src_Date',
    returnGeometry: 'true',
    outSR: '4326',
    geometry: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: String(limit),
    geometryPrecision: '5',
    maxAllowableOffset: '0.01',
  });
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': getEnvOrNull('ECS_EDGE_USER_AGENT') ?? 'ECS dispersed camping eligibility',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    logDispersedSearch('warn', 'pad_us_fetch_failed', {
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    throw new Error('PAD-US public land source is unavailable.');
  }

  const body = (await response.json().catch(() => null)) as
    | { features?: EsriFeature[]; error?: { message?: string }; exceededTransferLimit?: boolean }
    | null;
  if (body?.error) {
    logDispersedSearch('warn', 'pad_us_response_error', {
      message: body.error.message ?? 'Unknown PAD-US error',
      durationMs: Date.now() - startedAt,
    });
    throw new Error('PAD-US public land source returned an error.');
  }

  const regions = Array.isArray(body?.features)
    ? body.features.map(esriFeatureToRegion).filter((region): region is DispersedRegion => !!region)
    : [];
  logDispersedSearch('info', 'pad_us_search_result', {
    sourceFeatureCount: Array.isArray(body?.features) ? body.features.length : 0,
    acceptedCount: regions.length,
    truncated: body?.exceededTransferLimit === true,
    durationMs: Date.now() - startedAt,
  });
  return { regions, truncated: body?.exceededTransferLimit === true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = await requestParams(req);
    const bbox = parseBbox(params);
    if (!bbox) {
      return jsonResponse({ ok: false, error: 'A valid bbox is required as minLng,minLat,maxLng,maxLat.' }, 400);
    }
    if (bboxArea(bbox) > MAX_BBOX_AREA_DEGREES) {
      return jsonResponse({
        ok: false,
        error: 'Zoom in to load dispersed camping eligibility for this map area.',
      }, 400);
    }

    const limit = parseLimit(params);
    const { regions, truncated } = await fetchPadUsRegions(bbox, limit);
    const geojson = buildFeatureCollection(regions);
    return jsonResponse({
      ok: true,
      regions,
      count: regions.length,
      geojson,
      meta: {
        bbox,
        source: 'pad_us_manager_name',
        featureCount: geojson.features.length,
        truncated,
        eligibilityAssumption:
          'Likely eligibility is inferred from BLM/USFS public-land manager and public-access metadata; it is not a camping permission guarantee.',
      },
    });
  } catch (error) {
    logDispersedSearch('error', 'search_failed', {
      message: error instanceof Error ? error.message : 'Unknown dispersed camping eligibility failure.',
    });
    return jsonResponse({
      ok: false,
      error: 'Dispersed camping eligibility is temporarily unavailable. Try again after refreshing the map.',
    }, 503);
  }
});
