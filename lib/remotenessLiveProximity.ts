import { getMapboxToken, getMapboxTokenSync } from './mapConfig';
import { roadClassificationBridge } from './roadClassificationBridge';
import type { InfrastructureProximity, ProximityEstimate } from './remotenessTypes';

const REVERSE_GEOCODE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const FORWARD_GEOCODE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const REQUEST_TIMEOUT_MS = 6500;
const CACHE_MAX_AGE_MS = 3 * 60 * 1000;
const CACHE_MAX_DISTANCE_MI = 0.35;

export type RemotenessLiveProximitySnapshot = Pick<
  InfrastructureProximity,
  'nearestPavedRoad' | 'nearestTown' | 'nearestFuelStation'
>;

interface CachedLiveProximity {
  lat: number;
  lon: number;
  fetchedAt: number;
  proximity: RemotenessLiveProximitySnapshot;
}

interface MapboxFeature {
  text?: string;
  place_name?: string;
  center?: [number, number];
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
  place_type?: string[];
  properties?: {
    category?: string;
    maki?: string;
    coordinates?: {
      routable_points?: {
        coordinates?: [number, number];
      }[];
    };
  };
}

let _cachedLiveProximity: CachedLiveProximity | null = null;
let _inFlightKey: string | null = null;
let _inFlightRefresh: Promise<RemotenessLiveProximitySnapshot | null> | null = null;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMilesBetween(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): number {
  const earthRadiusMi = 3958.7613;
  const dLat = toRadians(endLat - startLat);
  const dLon = toRadians(endLon - startLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(startLat)) *
      Math.cos(toRadians(endLat)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMi * c;
}

function normalizeDistance(distanceMi: number): number {
  if (!Number.isFinite(distanceMi)) return 0;
  if (distanceMi < 1) return Math.round(distanceMi * 100) / 100;
  if (distanceMi < 10) return Math.round(distanceMi * 10) / 10;
  return Math.round(distanceMi);
}

function makeEstimate(
  distanceMi: number | null,
  confidence: ProximityEstimate['confidence'],
  source: string,
  metadata: Partial<Pick<ProximityEstimate, 'label' | 'latitude' | 'longitude' | 'sourceState' | 'updatedAt'>> = {},
): ProximityEstimate {
  return {
    distanceMi: distanceMi == null ? null : normalizeDistance(Math.max(0, distanceMi)),
    confidence,
    source,
    label: metadata.label ?? null,
    latitude: metadata.latitude ?? null,
    longitude: metadata.longitude ?? null,
    sourceState: metadata.sourceState ?? (distanceMi == null ? 'unavailable' : 'live'),
    updatedAt: metadata.updatedAt ?? new Date().toISOString(),
  };
}

function markEstimateCached(estimate: ProximityEstimate): ProximityEstimate {
  return {
    ...estimate,
    sourceState: estimate.sourceState === 'unavailable' ? 'unavailable' : 'cache',
  };
}

function getFeatureCoordinate(feature: MapboxFeature | null | undefined): { lat: number; lon: number } | null {
  if (!feature) return null;

  const routablePoint = feature.properties?.coordinates?.routable_points?.[0]?.coordinates;
  if (Array.isArray(routablePoint) && routablePoint.length >= 2) {
    return { lon: routablePoint[0], lat: routablePoint[1] };
  }

  const center = feature.center ?? feature.geometry?.coordinates;
  if (Array.isArray(center) && center.length >= 2) {
    return { lon: center[0], lat: center[1] };
  }

  return null;
}

function getFeatureLabel(feature: MapboxFeature | null | undefined, fallback: string): string {
  const text = feature?.text?.trim();
  if (text) return text;
  const placeName = feature?.place_name?.split(',')[0]?.trim();
  return placeName || fallback;
}

function getNearestFeature(
  features: MapboxFeature[],
  lat: number,
  lon: number,
  ranker?: (feature: MapboxFeature) => number,
): { feature: MapboxFeature; distanceMi: number; coordinate: { lat: number; lon: number } } | null {
  let best: { feature: MapboxFeature; distanceMi: number; coordinate: { lat: number; lon: number } } | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const feature of features) {
    const coordinate = getFeatureCoordinate(feature);
    if (!coordinate) continue;

    const rank = ranker ? ranker(feature) : 0;
    const candidateDistance = distanceMilesBetween(lat, lon, coordinate.lat, coordinate.lon);

    if (
      best == null ||
      rank < bestRank ||
      (rank === bestRank && candidateDistance < best.distanceMi)
    ) {
      best = { feature, distanceMi: candidateDistance, coordinate };
      bestRank = rank;
    }
  }

  return best;
}

function isNearbyCache(
  entry: CachedLiveProximity | null,
  lat: number,
  lon: number,
): entry is CachedLiveProximity {
  if (!entry) return false;
  if (Date.now() - entry.fetchedAt > CACHE_MAX_AGE_MS) return false;
  return distanceMilesBetween(lat, lon, entry.lat, entry.lon) <= CACHE_MAX_DISTANCE_MI;
}

async function fetchJsonWithTimeout<T>(input: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
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

async function resolveMapboxToken(): Promise<string> {
  const cached = getMapboxTokenSync();
  if (cached) return cached;
  return getMapboxToken();
}

async function fetchNearestRoadEstimate(
  accessToken: string,
  lat: number,
  lon: number,
): Promise<ProximityEstimate | null> {
  const resolvedAt = new Date().toISOString();
  const roadState = roadClassificationBridge.get();
  if (roadState.onRoad && roadState.confidence >= 1) {
    return makeEstimate(
      0,
      'high',
      roadState.roadName ? `live road classification (${roadState.roadName})` : 'live road classification',
      {
        label: 'Here',
        latitude: lat,
        longitude: lon,
        sourceState: 'live',
        updatedAt: resolvedAt,
      },
    );
  }

  const url = new URL(`${REVERSE_GEOCODE_URL}/${lon},${lat}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('types', 'address');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('routing', 'true');

  const data = await fetchJsonWithTimeout<{ features?: MapboxFeature[] }>(url.toString());
  const coordinate = getFeatureCoordinate(data.features?.[0]);
  if (!coordinate) return null;
  const feature = data.features?.[0];

  return makeEstimate(
    distanceMilesBetween(lat, lon, coordinate.lat, coordinate.lon),
    'medium',
    'Mapbox reverse geocode',
    {
      label: getFeatureLabel(feature, 'Nearest Paved Road'),
      latitude: coordinate.lat,
      longitude: coordinate.lon,
      sourceState: 'live',
      updatedAt: resolvedAt,
    },
  );
}

async function fetchNearestTownEstimate(
  accessToken: string,
  lat: number,
  lon: number,
): Promise<ProximityEstimate | null> {
  const resolvedAt = new Date().toISOString();
  const url = new URL(`${REVERSE_GEOCODE_URL}/${lon},${lat}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('types', 'place,locality,postcode');
  url.searchParams.set('limit', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('routing', 'true');

  const data = await fetchJsonWithTimeout<{ features?: MapboxFeature[] }>(url.toString());
  const features = data.features ?? [];
  const featurePriority: Record<string, number> = {
    place: 0,
    locality: 1,
    postcode: 2,
  };
  const best = getNearestFeature(features, lat, lon, (feature) => {
    const placeType = feature.place_type?.[0] ?? 'postcode';
    return featurePriority[placeType] ?? 3;
  });

  if (!best) return null;
  return makeEstimate(best.distanceMi, 'high', 'Mapbox locality/postal reverse geocode', {
    label: getFeatureLabel(best.feature, 'Nearest Town'),
    latitude: best.coordinate.lat,
    longitude: best.coordinate.lon,
    sourceState: 'live',
    updatedAt: resolvedAt,
  });
}

async function fetchNearestFuelEstimate(
  accessToken: string,
  lat: number,
  lon: number,
): Promise<ProximityEstimate | null> {
  const resolvedAt = new Date().toISOString();
  const queries = ['gas station', 'fuel station', 'truck stop'];
  const responses = await Promise.all(
    queries.map(async (query) => {
      const url = new URL(`${FORWARD_GEOCODE_URL}/${encodeURIComponent(query)}.json`);
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('types', 'poi');
      url.searchParams.set('limit', '8');
      url.searchParams.set('language', 'en');
      url.searchParams.set('proximity', `${lon},${lat}`);
      url.searchParams.set('autocomplete', 'false');
      const data = await fetchJsonWithTimeout<{ features?: MapboxFeature[] }>(url.toString());
      return data.features ?? [];
    }),
  );
  const features = responses.flat();
  const best = getNearestFeature(features, lat, lon);

  if (!best) return null;
  return makeEstimate(best.distanceMi, 'medium', 'Mapbox nearby fuel POI search', {
    label: getFeatureLabel(best.feature, 'Nearest Fuel'),
    latitude: best.coordinate.lat,
    longitude: best.coordinate.lon,
    sourceState: 'live',
    updatedAt: resolvedAt,
  });
}

function makeRequestKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function getCachedRemotenessLiveProximity(
  lat: number | null,
  lon: number | null,
): RemotenessLiveProximitySnapshot | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!isNearbyCache(_cachedLiveProximity, lat, lon)) return null;
  return {
    nearestPavedRoad: markEstimateCached(_cachedLiveProximity.proximity.nearestPavedRoad),
    nearestTown: markEstimateCached(_cachedLiveProximity.proximity.nearestTown),
    nearestFuelStation: markEstimateCached(_cachedLiveProximity.proximity.nearestFuelStation),
  };
}

export async function refreshRemotenessLiveProximity(
  lat: number | null,
  lon: number | null,
): Promise<RemotenessLiveProximitySnapshot | null> {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }

  if (isNearbyCache(_cachedLiveProximity, lat, lon)) {
    return _cachedLiveProximity.proximity;
  }

  const requestKey = makeRequestKey(lat, lon);
  if (_inFlightRefresh && _inFlightKey === requestKey) {
    return _inFlightRefresh;
  }

  _inFlightKey = requestKey;
  _inFlightRefresh = (async () => {
    const cachedSnapshot = getCachedRemotenessLiveProximity(lat, lon);

    try {
      const accessToken = await resolveMapboxToken();
      if (!accessToken) {
        return cachedSnapshot;
      }

      const [road, town, fuel] = await Promise.all([
        fetchNearestRoadEstimate(accessToken, lat, lon).catch(() => null),
        fetchNearestTownEstimate(accessToken, lat, lon).catch(() => null),
        fetchNearestFuelEstimate(accessToken, lat, lon).catch(() => null),
      ]);

      const liveSnapshot: RemotenessLiveProximitySnapshot = {
        nearestPavedRoad: road ?? makeEstimate(null, 'estimated', 'unavailable', { sourceState: 'unavailable' }),
        nearestTown: town ?? makeEstimate(null, 'estimated', 'unavailable', { sourceState: 'unavailable' }),
        nearestFuelStation: fuel ?? makeEstimate(null, 'estimated', 'unavailable', { sourceState: 'unavailable' }),
      };

      _cachedLiveProximity = {
        lat,
        lon,
        fetchedAt: Date.now(),
        proximity: liveSnapshot,
      };

      for (const [type, estimate] of [
        ['road', liveSnapshot.nearestPavedRoad],
        ['town', liveSnapshot.nearestTown],
        ['fuel', liveSnapshot.nearestFuelStation],
      ] as const) {
        if (estimate.sourceState === 'unavailable') {
          console.log(`[REMOTENESS] destination_unavailable type=${type} reason=${estimate.source}`);
        } else {
          console.log(`[REMOTENESS] destination_resolved type=${type} label=${estimate.label ?? '--'} distance=${estimate.distanceMi ?? '--'}`);
        }
      }

      return liveSnapshot;
    } catch {
      return cachedSnapshot;
    } finally {
      _inFlightRefresh = null;
      _inFlightKey = null;
    }
  })();

  return _inFlightRefresh;
}
