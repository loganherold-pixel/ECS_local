import { computeBounds } from './mapConfig';

export type RoadNavStatus =
  | 'idle'
  | 'searching'
  | 'destination_selected'
  | 'route_preview'
  | 'navigation_active'
  | 'rerouting'
  | 'arrived'
  | 'cancelled'
  | 'error';

export type RoadNavSourceType =
  | 'searchbox_suggest'
  | 'searchbox_retrieve'
  | 'forward_geocode'
  | 'manual_selection'
  | 'explore_handoff'
  | 'offline_sync_open'
  | 'dispatch_recovery'
  | 'restored_session';

export interface RoadNavCoordinate {
  lat: number;
  lng: number;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
}

export interface RoadNavDestination {
  id: string;
  title: string;
  subtitle: string | null;
  coordinate: RoadNavCoordinate;
  sourceType: RoadNavSourceType;
  mapboxId?: string | null;
  raw?: unknown;
}

export interface RoadNavSearchSuggestion {
  id: string;
  title: string;
  subtitle: string | null;
  sourceType: RoadNavSourceType;
  mapboxId?: string | null;
  coordinate?: RoadNavCoordinate | null;
  raw?: unknown;
}

export interface RoadNavStep {
  id: string;
  instruction: string;
  distanceM: number;
  durationS: number;
  startDistanceM: number;
  endDistanceM: number;
  startDurationS: number;
  endDurationS: number;
  maneuverType: string;
  modifier: string | null;
  roadName: string | null;
  location: RoadNavCoordinate;
  geometry: RoadNavCoordinate[];
}

export interface RoadNavRoute {
  id: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
  geometry: RoadNavCoordinate[];
  distanceM: number;
  durationS: number;
  steps: RoadNavStep[];
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  createdAt: string;
}

const SEARCHBOX_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest';
const SEARCHBOX_RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve';
const FORWARD_GEOCODE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

function randomId(prefix: string): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

async function fetchJsonWithTimeout<T>(
  input: string,
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function toCoordinate(input: any): RoadNavCoordinate | null {
  if (!input) return null;

  const lat = Number(
    input.lat ??
      input.latitude ??
      input.center?.[1] ??
      input.geometry?.coordinates?.[1] ??
      input.coordinates?.latitude,
  );
  const lng = Number(
    input.lng ??
      input.longitude ??
      input.lon ??
      input.center?.[0] ??
      input.geometry?.coordinates?.[0] ??
      input.coordinates?.longitude,
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const ele = Number(
    input.ele ??
      input.ele_m ??
      input.elevationM ??
      input.elevation_m ??
      input.altitudeM ??
      input.altitude_m ??
      input.center?.[2] ??
      input.geometry?.coordinates?.[2],
  );
  const elevationFeet = Number(
    input.elevationFeet ??
      input.elevation_ft ??
      input.altitudeFeet ??
      input.altitude_ft,
  );
  return {
    lat,
    lng,
    ...(Number.isFinite(ele) ? { ele, ele_m: ele } : null),
    ...(Number.isFinite(elevationFeet) ? { elevationFeet } : null),
  };
}

function toTitle(value: any): string {
  return String(
    value?.name ??
      value?.title ??
      value?.text ??
      value?.place_name ??
      value?.properties?.name ??
      'Selected destination',
  ).trim();
}

function toSubtitle(value: any): string | null {
  const subtitle = value?.subtitle ??
    value?.place_formatted ??
    value?.full_address ??
    value?.place_name ??
    value?.properties?.full_address ??
    value?.properties?.address ??
    null;

  if (!subtitle) return null;
  const normalized = String(subtitle).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSuggestion(item: any): RoadNavSearchSuggestion | null {
  const mapboxId = item?.mapbox_id ?? item?.id ?? null;
  const title = toTitle(item);
  const coordinate = toCoordinate(item);

  if (!title) return null;

  return {
    id: String(mapboxId ?? randomId('suggestion')),
    title,
    subtitle: toSubtitle(item),
    sourceType: item?.feature_type ? 'searchbox_suggest' : 'forward_geocode',
    mapboxId: mapboxId ? String(mapboxId) : null,
    coordinate,
    raw: item,
  };
}

function normalizeDestination(
  item: any,
  fallback: RoadNavSearchSuggestion,
  sourceType: RoadNavSourceType,
): RoadNavDestination | null {
  const coordinate = toCoordinate(item) ?? fallback.coordinate ?? null;
  if (!coordinate) return null;

  return {
    id: String(item?.mapbox_id ?? item?.id ?? fallback.id),
    title: toTitle(item) || fallback.title,
    subtitle: toSubtitle(item) ?? fallback.subtitle,
    coordinate,
    sourceType,
    mapboxId: String(item?.mapbox_id ?? fallback.mapboxId ?? ''),
    raw: item ?? fallback.raw,
  };
}

export function createRoadSearchSessionToken(): string {
  return randomId('road-search');
}

export async function searchRoadDestinations(params: {
  accessToken: string;
  query: string;
  sessionToken: string;
  proximity?: RoadNavCoordinate | null;
  bbox?: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  limit?: number;
}): Promise<RoadNavSearchSuggestion[]> {
  const trimmed = params.query.trim();
  if (!trimmed) return [];

  const limit = Math.max(1, Math.min(params.limit ?? 8, 10));

  const searchboxUrl = new URL(SEARCHBOX_URL);
  searchboxUrl.searchParams.set('q', trimmed);
  searchboxUrl.searchParams.set('access_token', params.accessToken);
  searchboxUrl.searchParams.set('session_token', params.sessionToken);
  searchboxUrl.searchParams.set('limit', String(limit));
  searchboxUrl.searchParams.set('language', 'en');
  searchboxUrl.searchParams.set('types', 'address,poi,place,locality,neighborhood');
  if (params.bbox) {
    searchboxUrl.searchParams.set(
      'bbox',
      `${params.bbox.west},${params.bbox.south},${params.bbox.east},${params.bbox.north}`,
    );
  }
  if (params.proximity) {
    searchboxUrl.searchParams.set(
      'proximity',
      `${params.proximity.lng},${params.proximity.lat}`,
    );
  }

  try {
    const data = await fetchJsonWithTimeout<{ suggestions?: any[] }>(
      searchboxUrl.toString(),
      7000,
    );
    const suggestions = (data?.suggestions ?? [])
      .map((item) => normalizeSuggestion(item))
      .filter((item): item is RoadNavSearchSuggestion => !!item);
    if (suggestions.length > 0) {
      return suggestions;
    }
  } catch {}

  const geocodeUrl = new URL(`${FORWARD_GEOCODE_URL}/${encodeURIComponent(trimmed)}.json`);
  geocodeUrl.searchParams.set('access_token', params.accessToken);
  geocodeUrl.searchParams.set('autocomplete', 'true');
  geocodeUrl.searchParams.set('limit', String(limit));
  geocodeUrl.searchParams.set('types', 'address,poi,place,locality,neighborhood');
  geocodeUrl.searchParams.set('language', 'en');
  if (params.bbox) {
    geocodeUrl.searchParams.set(
      'bbox',
      `${params.bbox.west},${params.bbox.south},${params.bbox.east},${params.bbox.north}`,
    );
  }
  if (params.proximity) {
    geocodeUrl.searchParams.set(
      'proximity',
      `${params.proximity.lng},${params.proximity.lat}`,
    );
  }

  const geocodeData = await fetchJsonWithTimeout<{ features?: any[] }>(
    geocodeUrl.toString(),
    7000,
  );

  return (geocodeData?.features ?? [])
    .map((item) => normalizeSuggestion(item))
    .filter((item): item is RoadNavSearchSuggestion => !!item);
}

export async function resolveRoadDestination(params: {
  accessToken: string;
  sessionToken: string;
  suggestion: RoadNavSearchSuggestion;
}): Promise<RoadNavDestination> {
  if (params.suggestion.coordinate && !params.suggestion.mapboxId) {
    return {
      id: params.suggestion.id,
      title: params.suggestion.title,
      subtitle: params.suggestion.subtitle,
      coordinate: params.suggestion.coordinate,
      sourceType: params.suggestion.sourceType,
      raw: params.suggestion.raw,
    };
  }

  if (params.suggestion.mapboxId) {
    try {
      const retrieveUrl = new URL(
        `${SEARCHBOX_RETRIEVE_URL}/${encodeURIComponent(params.suggestion.mapboxId)}`,
      );
      retrieveUrl.searchParams.set('access_token', params.accessToken);
      retrieveUrl.searchParams.set('session_token', params.sessionToken);

      const retrieved = await fetchJsonWithTimeout<{ features?: any[] }>(
        retrieveUrl.toString(),
        7000,
      );
      const destination = normalizeDestination(
        retrieved?.features?.[0],
        params.suggestion,
        'searchbox_retrieve',
      );
      if (destination) {
        return destination;
      }
    } catch {}
  }

  if (params.suggestion.coordinate) {
    return {
      id: params.suggestion.id,
      title: params.suggestion.title,
      subtitle: params.suggestion.subtitle,
      coordinate: params.suggestion.coordinate,
      sourceType: params.suggestion.sourceType,
      mapboxId: params.suggestion.mapboxId,
      raw: params.suggestion.raw,
    };
  }

  throw new Error('Selected destination could not be resolved');
}

function normalizeStepInstruction(step: any): string {
  const direct = String(step?.maneuver?.instruction ?? '').trim();
  if (direct) return direct;

  const type = String(step?.maneuver?.type ?? 'Continue').trim();
  const modifier = String(step?.maneuver?.modifier ?? '').trim();
  const roadName = String(step?.name ?? '').trim();
  return [type, modifier, roadName ? `onto ${roadName}` : ''].filter(Boolean).join(' ');
}

function normalizeStepLocation(step: any): RoadNavCoordinate | null {
  const coords = step?.maneuver?.location;
  if (Array.isArray(coords) && coords.length >= 2) {
    return toCoordinate({ center: coords });
  }
  const geometryCoordinate = step?.geometry?.coordinates?.[0];
  if (geometryCoordinate) {
    return toCoordinate({ center: geometryCoordinate });
  }
  return null;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const earthRadiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sumGeometryDistanceMeters(geometry: RoadNavCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    total += distanceMeters(geometry[index - 1], geometry[index]);
  }
  return total;
}

export function buildRoadRouteFromCachedGeometry(params: {
  id: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
  geometry: RoadNavCoordinate[];
  distanceM?: number | null;
  durationS?: number | null;
  createdAt?: string | null;
}): RoadNavRoute {
  const validGeometry = params.geometry.filter((point) => toCoordinate(point));
  const first = validGeometry[0];
  const startsAtOrigin =
    first && distanceMeters(params.origin, first) <= 30;
  const geometry = startsAtOrigin ? validGeometry : [params.origin, ...validGeometry];

  if (geometry.length < 2) {
    geometry.push(params.destination.coordinate);
  }

  const distanceM =
    typeof params.distanceM === 'number' && Number.isFinite(params.distanceM) && params.distanceM > 0
      ? params.distanceM
      : sumGeometryDistanceMeters(geometry);
  const durationS =
    typeof params.durationS === 'number' && Number.isFinite(params.durationS) && params.durationS > 0
      ? params.durationS
      : Math.max(60, distanceM / 13.4);
  const bounds =
    geometry.length > 1
      ? computeBounds(geometry.map((point, index) => ({
          idx: index,
          lat: point.lat,
          lng: point.lng,
          ele_m: 0,
          time: '',
          type: 'road_nav_cached',
        } as any)))
      : null;

  return {
    id: params.id,
    origin: params.origin,
    destination: params.destination,
    geometry,
    distanceM,
    durationS,
    steps: [
      {
        id: 'cached-offline-route',
        instruction: `Follow cached route toward ${params.destination.title}`,
        distanceM,
        durationS,
        startDistanceM: 0,
        endDistanceM: distanceM,
        startDurationS: 0,
        endDurationS: durationS,
        maneuverType: 'continue',
        modifier: null,
        roadName: null,
        location: geometry[0],
        geometry,
      },
    ],
    bounds: bounds
      ? {
          north: bounds.maxLat,
          south: bounds.minLat,
          east: bounds.maxLng,
          west: bounds.minLng,
        }
      : null,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export async function fetchRoadRoute(params: {
  accessToken: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
}): Promise<RoadNavRoute> {
  const coordinates = `${params.origin.lng},${params.origin.lat};${params.destination.coordinate.lng},${params.destination.coordinate.lat}`;
  const url = new URL(`${DIRECTIONS_URL}/${coordinates}`);
  url.searchParams.set('access_token', params.accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('banner_instructions', 'false');
  url.searchParams.set('voice_instructions', 'false');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('language', 'en');

  const data = await fetchJsonWithTimeout<{ routes?: any[] }>(url.toString(), 9000);
  const route = data?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) {
    throw new Error('No driving route found');
  }

  const geometry = (route.geometry.coordinates as [number, number][])
    .map((coord) => toCoordinate({ center: coord }))
    .filter((coord): coord is RoadNavCoordinate => !!coord);

  if (geometry.length < 2) {
    throw new Error('Route geometry was incomplete');
  }

  let cumulativeDistanceM = 0;
  let cumulativeDurationS = 0;
  const steps: RoadNavStep[] = [];

  (route.legs ?? []).forEach((leg: any, legIndex: number) => {
    (leg.steps ?? []).forEach((step: any, stepIndex: number) => {
      const stepDistanceM = Number(step?.distance ?? 0);
      const stepDurationS = Number(step?.duration ?? 0);
      const location = normalizeStepLocation(step);
      const instruction = normalizeStepInstruction(step);
      const stepGeometry = (step?.geometry?.coordinates ?? [])
        .map((coord: [number, number]) => toCoordinate({ center: coord }))
        .filter((coord: RoadNavCoordinate | null): coord is RoadNavCoordinate => !!coord);

      const nextStep: RoadNavStep = {
        id: `${legIndex}-${stepIndex}-${String(step?.maneuver?.type ?? 'step')}`,
        instruction: instruction || 'Continue',
        distanceM: Number.isFinite(stepDistanceM) ? stepDistanceM : 0,
        durationS: Number.isFinite(stepDurationS) ? stepDurationS : 0,
        startDistanceM: cumulativeDistanceM,
        endDistanceM: cumulativeDistanceM + (Number.isFinite(stepDistanceM) ? stepDistanceM : 0),
        startDurationS: cumulativeDurationS,
        endDurationS: cumulativeDurationS + (Number.isFinite(stepDurationS) ? stepDurationS : 0),
        maneuverType: String(step?.maneuver?.type ?? 'continue'),
        modifier: step?.maneuver?.modifier ? String(step.maneuver.modifier) : null,
        roadName: step?.name ? String(step.name) : null,
        location: location ?? geometry[Math.min(stepIndex, geometry.length - 1)],
        geometry: stepGeometry,
      };

      cumulativeDistanceM = nextStep.endDistanceM;
      cumulativeDurationS = nextStep.endDurationS;
      steps.push(nextStep);
    });
  });

  if (steps.length === 0) {
    steps.push({
      id: '0-0-direct',
      instruction: `Continue to ${params.destination.title}`,
      distanceM: Number(route.distance ?? 0),
      durationS: Number(route.duration ?? 0),
      startDistanceM: 0,
      endDistanceM: Number(route.distance ?? 0),
      startDurationS: 0,
      endDurationS: Number(route.duration ?? 0),
      maneuverType: 'arrive',
      modifier: null,
      roadName: params.destination.title,
      location: params.destination.coordinate,
      geometry,
    });
  }

  const bounds =
    geometry.length > 1
      ? computeBounds(geometry.map((point, index) => ({
          idx: index,
          lat: point.lat,
          lng: point.lng,
          ele_m: 0,
          time: '',
          type: 'road_nav',
        } as any)))
      : null;

  return {
    id: randomId('road-route'),
    origin: params.origin,
    destination: params.destination,
    geometry,
    distanceM: Number(route.distance ?? 0),
    durationS: Number(route.duration ?? 0),
    steps,
    bounds: bounds
      ? {
          north: bounds.maxLat,
          south: bounds.minLat,
          east: bounds.maxLng,
          west: bounds.minLng,
        }
      : null,
    createdAt: new Date().toISOString(),
  };
}
