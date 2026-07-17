import { computeBounds } from './mapConfig';
import {
  buildSyntheticEcsGuidanceRouteFromGeometry,
  normalizeMapboxDirectionsRouteToEcsGuidanceRoute,
  type BuildSyntheticEcsGuidanceRouteOptions,
  type EcsGuidanceRoute,
  type EcsGuidanceRouteSource,
} from './navigation/ecsGuidanceModel';
import {
  buildRouteVersionFromParts,
  tagRouteGeometry,
} from './navigation/routeVersion';
import { buildHighlightedRouteInstruction } from './routeGuidanceCopy';
import {
  buildMapboxSearchRequestSignature,
  recordMapboxSearchBillingEvent,
  type MapboxSearchBillingContext,
} from './mapboxSearchBillingGuard';

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
  | 'saved_pin'
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

export type RoadNavGuidanceMode = 'turn_by_turn' | 'summary_only';

export interface RoadNavProviderMetadata extends Record<string, unknown> {
  provider: string;
  profile?: string | null;
  routeUuid?: string | null;
  routeIndex?: number | null;
  responseRouteIndex?: number | null;
  alternativesRequested?: boolean;
}

export interface RoadNavBannerInstruction {
  distanceAlongGeometryM: number | null;
  primaryText: string | null;
  primaryType: string | null;
  primaryModifier: string | null;
  secondaryText: string | null;
  subText: string | null;
}

export interface RoadNavVoiceInstruction {
  distanceAlongGeometryM: number | null;
  announcement: string | null;
  ssmlAnnouncement: string | null;
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
  bannerInstructions: RoadNavBannerInstruction[];
  voiceInstructions: RoadNavVoiceInstruction[];
}

export interface RoadNavLeg {
  id: string;
  summary: string | null;
  distanceM: number;
  durationS: number;
  stepStartIndex: number;
  stepEndIndex: number;
  stepCount: number;
}

export interface RoadNavRoute {
  id: string;
  routeVersion?: string;
  routeIndex?: number;
  mapboxRouteUuid: string | null;
  selectedRouteIndex?: number;
  providerMetadata?: RoadNavProviderMetadata;
  guidance: EcsGuidanceRoute;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
  geometry: RoadNavCoordinate[];
  distanceM: number;
  durationS: number;
  steps: RoadNavStep[];
  legs: RoadNavLeg[];
  guidanceMode: RoadNavGuidanceMode;
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
const DIRECTIONS_PROFILE = 'driving-traffic';
const DIRECTIONS_URL = `https://api.mapbox.com/directions/v5/mapbox/${DIRECTIONS_PROFILE}`;
const MAP_MATCHING_PROFILE = 'driving';
const MAP_MATCHING_URL = `https://api.mapbox.com/matching/v5/mapbox/${MAP_MATCHING_PROFILE}`;
const MAP_MATCHING_MAX_COORDINATES = 100;
const IMPORTED_TRACE_MATCH_RADIUS_M = 35;
const IMPORTED_TRACE_MIN_MATCH_CONFIDENCE = 0.45;
const IMPORTED_TRACE_ENDPOINT_TOLERANCE_M = 120;
const IMPORTED_TRACE_MIN_DISTANCE_RATIO = 0.5;
const IMPORTED_TRACE_MAX_DISTANCE_RATIO = 2.5;
const SEARCHBOX_SUGGEST_TIMEOUT_MS = 2000;
const FORWARD_GEOCODE_TIMEOUT_MS = 2500;
const SEARCHBOX_SUGGEST_LIMIT = 5;

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
  billingContext?: MapboxSearchBillingContext | null;
  proximity?: RoadNavCoordinate | null;
  bbox?: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  limit?: number;
  forwardGeocodeFallback?: boolean;
  throwOnSearchboxError?: boolean;
}): Promise<RoadNavSearchSuggestion[]> {
  const trimmed = params.query.trim();
  if (!trimmed) return [];

  const limit = Math.max(
    1,
    Math.min(params.limit ?? SEARCHBOX_SUGGEST_LIMIT, SEARCHBOX_SUGGEST_LIMIT),
  );
  const requestSignature = params.billingContext?.requestSignature ?? buildMapboxSearchRequestSignature({
    query: trimmed,
    proximity: params.proximity,
    bbox: params.bbox,
    limit,
  });
  const billingContext = {
    ...(params.billingContext ?? { flow: 'unlabeled_mapbox_search' }),
    requestSignature,
  };
  let fallbackReason = 'searchbox_empty';
  let searchboxFailed = false;

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
      SEARCHBOX_SUGGEST_TIMEOUT_MS,
    );
    const suggestions = (data?.suggestions ?? [])
      .map((item) => normalizeSuggestion(item))
      .filter((item): item is RoadNavSearchSuggestion => !!item);
    recordMapboxSearchBillingEvent({
      ...billingContext,
      operation: 'searchbox_suggest',
      outcome: suggestions.length > 0 ? 'success' : 'empty',
      sessionToken: params.sessionToken,
      resultCount: suggestions.length,
      reason: suggestions.length > 0 ? null : fallbackReason,
    });
    if (suggestions.length > 0) {
      return suggestions;
    }
  } catch (error) {
    searchboxFailed = true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    fallbackReason = /429|rate|quota|limit/i.test(message) ? 'quota_limited' : 'searchbox_suggest_error';
    recordMapboxSearchBillingEvent({
      ...billingContext,
      operation: 'searchbox_suggest',
      outcome: 'error',
      sessionToken: params.sessionToken,
      resultCount: 0,
      reason: fallbackReason,
    });
  }

  if (params.forwardGeocodeFallback === false) {
    if (searchboxFailed && params.throwOnSearchboxError) {
      throw new Error('Mapbox Search Box suggestion request failed.');
    }
    return [];
  }

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
    FORWARD_GEOCODE_TIMEOUT_MS,
  );

  const fallbackSuggestions = (geocodeData?.features ?? [])
    .map((item) => normalizeSuggestion(item))
    .filter((item): item is RoadNavSearchSuggestion => !!item);
  recordMapboxSearchBillingEvent({
    ...billingContext,
    operation: 'forward_geocode_fallback',
    outcome: fallbackSuggestions.length > 0 ? 'success' : 'empty',
    sessionToken: params.sessionToken,
    resultCount: fallbackSuggestions.length,
    reason: fallbackReason,
  });
  return fallbackSuggestions;
}

export async function resolveRoadDestination(params: {
  accessToken: string;
  sessionToken: string;
  suggestion: RoadNavSearchSuggestion;
  billingContext?: MapboxSearchBillingContext | null;
  retrieveTimeoutMs?: number;
}): Promise<RoadNavDestination> {
  const requestSignature = params.billingContext?.requestSignature ?? String(params.suggestion.mapboxId ?? params.suggestion.id);
  const billingContext = {
    ...(params.billingContext ?? { flow: 'unlabeled_mapbox_search' }),
    requestSignature,
  };
  if (
    params.suggestion.coordinate &&
    (!params.suggestion.mapboxId || params.suggestion.sourceType !== 'searchbox_suggest')
  ) {
    recordMapboxSearchBillingEvent({
      ...billingContext,
      operation: 'coordinate_reuse',
      outcome: 'success',
      sessionToken: params.sessionToken,
      suggestionId: params.suggestion.id,
      resultCount: 1,
      reason: params.suggestion.sourceType,
    });
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
        params.retrieveTimeoutMs ?? 7000,
      );
      const destination = normalizeDestination(
        retrieved?.features?.[0],
        params.suggestion,
        'searchbox_retrieve',
      );
      if (destination) {
        recordMapboxSearchBillingEvent({
          ...billingContext,
          operation: 'searchbox_retrieve',
          outcome: 'success',
          sessionToken: params.sessionToken,
          suggestionId: params.suggestion.mapboxId,
          resultCount: 1,
        });
        return destination;
      }
      recordMapboxSearchBillingEvent({
        ...billingContext,
        operation: 'searchbox_retrieve',
        outcome: 'empty',
        sessionToken: params.sessionToken,
        suggestionId: params.suggestion.mapboxId,
        resultCount: 0,
      });
    } catch (error) {
      recordMapboxSearchBillingEvent({
        ...billingContext,
        operation: 'searchbox_retrieve',
        outcome: 'error',
        sessionToken: params.sessionToken,
        suggestionId: params.suggestion.mapboxId,
        resultCount: 0,
        reason: error instanceof Error ? error.message : String(error ?? 'retrieve_error'),
      });
    }
  }

  if (params.suggestion.coordinate) {
    recordMapboxSearchBillingEvent({
      ...billingContext,
      operation: 'coordinate_reuse',
      outcome: 'success',
      sessionToken: params.sessionToken,
      suggestionId: params.suggestion.id,
      resultCount: 1,
      reason: 'retrieve_fallback_coordinate',
    });
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

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInstructionList(input: unknown): any[] {
  return Array.isArray(input) ? input : [];
}

function normalizeBannerInstructions(step: any): RoadNavBannerInstruction[] {
  return normalizeInstructionList(step?.bannerInstructions ?? step?.banner_instructions)
    .map((item: any): RoadNavBannerInstruction | null => {
      const primary = item?.primary ?? null;
      const secondary = item?.secondary ?? null;
      const sub = item?.sub ?? null;
      const instruction: RoadNavBannerInstruction = {
        distanceAlongGeometryM: finiteNumber(item?.distanceAlongGeometry),
        primaryText: nullableString(primary?.text),
        primaryType: nullableString(primary?.type),
        primaryModifier: nullableString(primary?.modifier),
        secondaryText: nullableString(secondary?.text),
        subText: nullableString(sub?.text),
      };
      const hasContent =
        instruction.distanceAlongGeometryM != null ||
        instruction.primaryText != null ||
        instruction.primaryType != null ||
        instruction.primaryModifier != null ||
        instruction.secondaryText != null ||
        instruction.subText != null;
      return hasContent ? instruction : null;
    })
    .filter((item): item is RoadNavBannerInstruction => !!item);
}

function normalizeVoiceInstructions(step: any): RoadNavVoiceInstruction[] {
  return normalizeInstructionList(step?.voiceInstructions ?? step?.voice_instructions)
    .map((item: any): RoadNavVoiceInstruction | null => {
      const instruction: RoadNavVoiceInstruction = {
        distanceAlongGeometryM: finiteNumber(item?.distanceAlongGeometry),
        announcement: nullableString(item?.announcement),
        ssmlAnnouncement: nullableString(item?.ssmlAnnouncement ?? item?.ssml_announcement),
      };
      const hasContent =
        instruction.distanceAlongGeometryM != null ||
        instruction.announcement != null ||
        instruction.ssmlAnnouncement != null;
      return hasContent ? instruction : null;
    })
    .filter((item): item is RoadNavVoiceInstruction => !!item);
}

function normalizeStepGeometry(step: any): RoadNavCoordinate[] {
  const coordinates = step?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((coord: [number, number]) => toCoordinate({ center: coord }))
    .filter((coord: RoadNavCoordinate | null): coord is RoadNavCoordinate => !!coord);
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

function normalizeMapboxRouteUuid(route: any): string | null {
  return nullableString(route?.uuid ?? route?.route_uuid ?? route?.routeUuid);
}

function isRoadNavigationDebugMode(): boolean {
  const globalScope = globalThis as typeof globalThis & {
    __DEV__?: boolean;
    __ECS_DEBUG_ROAD_NAVIGATION__?: boolean;
  };
  const envDebug =
    typeof process !== 'undefined' &&
    (
      process.env?.EXPO_PUBLIC_ECS_ROAD_NAV_DEBUG === '1' ||
      process.env?.ECS_ROAD_NAV_DEBUG === '1'
    );
  return globalScope.__DEV__ === true || globalScope.__ECS_DEBUG_ROAD_NAVIGATION__ === true || envDebug;
}

function logRoadNavigationRouteDebug(route: RoadNavRoute, totalStepCount: number): void {
  if (!isRoadNavigationDebugMode()) return;
  console.debug('[RoadNavigation] Mapbox route parsed', {
    routeUuid: route.mapboxRouteUuid,
    distanceM: route.distanceM,
    durationS: route.durationS,
    legCount: route.legs.length,
    totalStepCount,
    guidanceMode: route.guidanceMode,
    turnByTurnAvailable: route.guidanceMode === 'turn_by_turn',
  });
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
  source?: EcsGuidanceRouteSource | null;
  routeKind?: BuildSyntheticEcsGuidanceRouteOptions['routeKind'];
  segmentNames?: BuildSyntheticEcsGuidanceRouteOptions['segmentNames'];
  limitedTrailGuidance?: boolean;
  guidanceLimitationLabel?: string | null;
}): RoadNavRoute {
  const validGeometry = params.geometry.filter((point) => toCoordinate(point));
  const geometry = validGeometry;

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
  const createdAt = params.createdAt ?? new Date().toISOString();
  const guidanceSource = params.source ?? 'cached_geometry';
  const guidance: EcsGuidanceRoute = buildSyntheticEcsGuidanceRouteFromGeometry({
    id: params.id,
    source: guidanceSource,
    geometry,
    distanceMeters: distanceM,
    durationSeconds: durationS,
    createdAt,
    destinationName: params.destination.title,
    routeKind: params.routeKind ?? 'road',
    segmentNames: params.segmentNames,
    limitedTrailGuidance: params.limitedTrailGuidance,
    guidanceLimitationLabel: params.guidanceLimitationLabel,
  });
  const routeVersion = buildRouteVersionFromParts({
    routeId: params.id,
    routeUuid: null,
    rerouteGeneration: guidance.rerouteGeneration,
    routeIndex: 0,
    generatedAt: createdAt,
    geometry,
    steps: guidance.steps,
  });
  const providerMetadata: RoadNavProviderMetadata = {
    provider: guidanceSource,
    routeUuid: null,
    routeIndex: 0,
    alternativesRequested: false,
  };

  return {
    id: params.id,
    routeVersion,
    routeIndex: 0,
    mapboxRouteUuid: null,
    selectedRouteIndex: 0,
    providerMetadata,
    guidance: {
      ...guidance,
      routeVersion,
      routeIndex: 0,
      geometry: tagRouteGeometry(guidance.geometry, routeVersion),
      providerMetadata,
    },
    origin: params.origin,
    destination: params.destination,
    geometry: tagRouteGeometry(geometry, routeVersion),
    distanceM,
    durationS,
    steps: geometry.length >= 2
      ? [{
        id: 'cached-offline-route',
        instruction: buildHighlightedRouteInstruction(params.destination.title),
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
        bannerInstructions: [],
        voiceInstructions: [],
      }]
      : [],
    legs: geometry.length >= 2
      ? [{
        id: 'cached-offline-leg',
        summary: 'Cached route geometry',
        distanceM,
        durationS,
        stepStartIndex: 0,
        stepEndIndex: 0,
        stepCount: 0,
      }]
      : [],
    guidanceMode: guidance.guidanceMode === 'turn_by_turn' ? 'turn_by_turn' : 'summary_only',
    bounds: bounds
      ? {
          north: bounds.maxLat,
          south: bounds.minLat,
          east: bounds.maxLng,
          west: bounds.minLng,
        }
      : null,
    createdAt,
  };
}

function normalizeRoadNavGeometry(geometry: RoadNavCoordinate[]): RoadNavCoordinate[] {
  const normalized: RoadNavCoordinate[] = [];
  geometry.forEach((point) => {
    const next = toCoordinate(point);
    if (!next) return;
    const previous = normalized[normalized.length - 1];
    if (previous && distanceMeters(previous, next) <= 1) return;
    normalized.push(next);
  });
  return normalized;
}

export function sampleImportedTraceForMapMatching(
  geometry: RoadNavCoordinate[],
  maxCoordinates = MAP_MATCHING_MAX_COORDINATES,
): RoadNavCoordinate[] {
  const normalized = normalizeRoadNavGeometry(geometry);
  const limit = Math.max(2, Math.min(MAP_MATCHING_MAX_COORDINATES, Math.floor(maxCoordinates)));
  if (normalized.length <= limit) return normalized;

  const sampled: RoadNavCoordinate[] = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (normalized.length - 1)) / (limit - 1));
    const point = normalized[sourceIndex];
    const previous = sampled[sampled.length - 1];
    if (!previous || distanceMeters(previous, point) > 1) sampled.push(point);
  }

  const finalPoint = normalized[normalized.length - 1];
  if (sampled.length > 0 && distanceMeters(sampled[sampled.length - 1], finalPoint) > 1) {
    sampled[sampled.length - 1] = finalPoint;
  }
  return sampled;
}

export function buildImportedTraceMapMatchingRequest(params: {
  accessToken: string;
  geometry: RoadNavCoordinate[];
  radiusM?: number;
}): string | null {
  const geometry = sampleImportedTraceForMapMatching(params.geometry);
  if (geometry.length < 2) return null;

  const radiusM = Math.max(
    1,
    Math.min(50, Number(params.radiusM ?? IMPORTED_TRACE_MATCH_RADIUS_M)),
  );
  const coordinates = geometry.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`${MAP_MATCHING_URL}/${coordinates}.json`);
  url.searchParams.set('access_token', params.accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('banner_instructions', 'true');
  url.searchParams.set('voice_instructions', 'true');
  url.searchParams.set('voice_units', 'imperial');
  url.searchParams.set('roundabout_exits', 'true');
  url.searchParams.set('language', 'en');
  url.searchParams.set('tidy', 'true');
  url.searchParams.set('radiuses', geometry.map(() => String(radiusM)).join(';'));
  url.searchParams.set('waypoints', `0;${geometry.length - 1}`);
  return url.toString();
}

function normalizeMapboxRoadRoute(
  route: any,
  params: {
    origin: RoadNavCoordinate;
    destination: RoadNavDestination;
    rerouteGeneration?: number | null;
    provider?: string;
    profile?: string;
    guidanceSource?: EcsGuidanceRouteSource;
    alternativesRequested?: boolean;
    routeIdPrefix?: string;
    providerMetadata?: Record<string, unknown>;
  },
  routeIndex = 0,
): RoadNavRoute | null {
  const routeGeometryCoordinates = Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates
    : [];
  if (routeGeometryCoordinates.length === 0) {
    return null;
  }

  const geometry = (routeGeometryCoordinates as [number, number][])
    .map((coord) => toCoordinate({ center: coord }))
    .filter((coord): coord is RoadNavCoordinate => !!coord);

  if (geometry.length < 2) {
    return null;
  }

  let cumulativeDistanceM = 0;
  let cumulativeDurationS = 0;
  const steps: RoadNavStep[] = [];
  const legs: RoadNavLeg[] = [];
  let totalResponseStepCount = 0;

  const responseLegs = Array.isArray(route?.legs) ? route.legs : [];
  responseLegs.forEach((leg: any, legIndex: number) => {
    const legSteps = Array.isArray(leg?.steps) ? leg.steps : [];
    const stepStartIndex = steps.length;
    totalResponseStepCount += legSteps.length;

    legSteps.forEach((step: any, stepIndex: number) => {
      const stepDistanceM = Number(step?.distance ?? 0);
      const stepDurationS = Number(step?.duration ?? 0);
      const location = normalizeStepLocation(step);
      const instruction = normalizeStepInstruction(step).trim() || 'Continue';
      const stepGeometry = normalizeStepGeometry(step);
      const fallbackLocation =
        stepGeometry[0] ??
        geometry[Math.min(steps.length, geometry.length - 1)] ??
        params.origin;

      const nextStep: RoadNavStep = {
        id: `${routeIndex}-${legIndex}-${stepIndex}-${String(step?.maneuver?.type ?? 'step')}`,
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
        location: location ?? fallbackLocation,
        geometry: stepGeometry,
        bannerInstructions: normalizeBannerInstructions(step),
        voiceInstructions: normalizeVoiceInstructions(step),
      };

      cumulativeDistanceM = nextStep.endDistanceM;
      cumulativeDurationS = nextStep.endDurationS;
      steps.push(nextStep);
    });

    legs.push({
      id: `${routeIndex}-${legIndex}`,
      summary: nullableString(leg?.summary),
      distanceM: finiteNumber(leg?.distance) ?? 0,
      durationS: finiteNumber(leg?.duration) ?? 0,
      stepStartIndex,
      stepEndIndex: steps.length,
      stepCount: steps.length - stepStartIndex,
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
      maneuverType: 'summary',
      modifier: null,
      roadName: params.destination.title,
      location: params.destination.coordinate,
      geometry,
      bannerInstructions: [],
      voiceInstructions: [],
    });
  }

  const guidanceMode: RoadNavGuidanceMode =
    totalResponseStepCount > 0 ? 'turn_by_turn' : 'summary_only';

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

  const routeId = randomId(params.routeIdPrefix ?? 'road-route');
  const createdAt = new Date().toISOString();
  const routeUuid = normalizeMapboxRouteUuid(route);
  const providerMetadata: RoadNavProviderMetadata = {
    ...params.providerMetadata,
    provider: params.provider ?? 'mapbox_directions',
    profile: params.profile ?? DIRECTIONS_PROFILE,
    routeUuid: routeUuid ?? routeId,
    routeIndex,
    alternativesRequested: params.alternativesRequested ?? true,
  };
  const guidance = normalizeMapboxDirectionsRouteToEcsGuidanceRoute(route, {
    id: routeId,
    source: params.guidanceSource ?? 'mapbox_directions',
    destinationName: params.destination.title,
    createdAt,
    rerouteGeneration: params.rerouteGeneration ?? 0,
  });
  const routeVersion = buildRouteVersionFromParts({
    routeId,
    routeUuid,
    rerouteGeneration: params.rerouteGeneration ?? 0,
    routeIndex,
    generatedAt: createdAt,
    geometry,
    steps: guidance.steps,
  });

  const normalizedRoute: RoadNavRoute = {
    id: routeId,
    routeVersion,
    routeIndex,
    mapboxRouteUuid: routeUuid,
    selectedRouteIndex: routeIndex,
    providerMetadata,
    guidance: {
      ...guidance,
      routeVersion,
      routeIndex,
      geometry: tagRouteGeometry(guidance.geometry, routeVersion),
      providerMetadata,
    },
    origin: params.origin,
    destination: params.destination,
    geometry: tagRouteGeometry(geometry, routeVersion),
    distanceM: Number(route.distance ?? 0),
    durationS: Number(route.duration ?? 0),
    steps,
    legs,
    guidanceMode,
    bounds: bounds
      ? {
          north: bounds.maxLat,
          south: bounds.minLat,
          east: bounds.maxLng,
          west: bounds.minLng,
        }
      : null,
    createdAt,
  };

  logRoadNavigationRouteDebug(normalizedRoute, totalResponseStepCount);
  return normalizedRoute;
}

type MapboxMapMatchingResponse = {
  code?: string;
  message?: string;
  matchings?: Array<Record<string, any>>;
};

export async function fetchImportedTraceRoadRoute(params: {
  accessToken: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
  geometry: RoadNavCoordinate[];
  radiusM?: number;
  timeoutMs?: number;
}): Promise<RoadNavRoute | null> {
  const sampledGeometry = sampleImportedTraceForMapMatching(params.geometry);
  const request = buildImportedTraceMapMatchingRequest({
    accessToken: params.accessToken,
    geometry: sampledGeometry,
    radiusM: params.radiusM,
  });
  if (!request) return null;

  const data = await fetchJsonWithTimeout<MapboxMapMatchingResponse>(
    request,
    params.timeoutMs ?? 10000,
  );
  if (data?.code && data.code !== 'Ok') return null;

  const matchings = Array.isArray(data?.matchings) ? data.matchings : [];
  if (matchings.length !== 1) return null;
  const matching = matchings[0];
  const confidence = finiteNumber(matching?.confidence);
  if (confidence != null && confidence < IMPORTED_TRACE_MIN_MATCH_CONFIDENCE) return null;

  const route = normalizeMapboxRoadRoute(
    matching,
    {
      origin: params.origin,
      destination: params.destination,
      provider: 'mapbox_map_matching',
      profile: MAP_MATCHING_PROFILE,
      guidanceSource: 'imported_trace',
      alternativesRequested: false,
      routeIdPrefix: 'imported-trace-route',
      providerMetadata: {
        mapMatchingConfidence: confidence,
        sourceTracePointCount: params.geometry.length,
        sampledTracePointCount: sampledGeometry.length,
      },
    },
    0,
  );
  if (!route || route.guidanceMode !== 'turn_by_turn' || route.guidance.steps.length < 2) {
    return null;
  }

  const sampledStart = sampledGeometry[0];
  const sampledEnd = sampledGeometry[sampledGeometry.length - 1];
  const matchedStart = route.geometry[0];
  const matchedEnd = route.geometry[route.geometry.length - 1];
  if (
    !sampledStart ||
    !sampledEnd ||
    !matchedStart ||
    !matchedEnd ||
    distanceMeters(sampledStart, matchedStart) > IMPORTED_TRACE_ENDPOINT_TOLERANCE_M ||
    distanceMeters(sampledEnd, matchedEnd) > IMPORTED_TRACE_ENDPOINT_TOLERANCE_M
  ) {
    return null;
  }

  const sourceDistanceM = sumGeometryDistanceMeters(sampledGeometry);
  if (sourceDistanceM > 0 && route.distanceM > 0) {
    const distanceRatio = route.distanceM / sourceDistanceM;
    if (
      distanceRatio < IMPORTED_TRACE_MIN_DISTANCE_RATIO ||
      distanceRatio > IMPORTED_TRACE_MAX_DISTANCE_RATIO
    ) {
      return null;
    }
  }

  return route;
}

function reindexRoadRouteOption(route: RoadNavRoute, routeIndex: number): RoadNavRoute {
  const responseRouteIndex =
    typeof route.providerMetadata?.responseRouteIndex === 'number'
      ? route.providerMetadata.responseRouteIndex
      : route.providerMetadata?.routeIndex ?? route.selectedRouteIndex ?? route.routeIndex ?? routeIndex;
  const providerMetadata: RoadNavProviderMetadata = {
    ...route.providerMetadata,
    provider: route.providerMetadata?.provider ?? 'mapbox_directions',
    profile: route.providerMetadata?.profile ?? DIRECTIONS_PROFILE,
    routeUuid: route.providerMetadata?.routeUuid ?? route.mapboxRouteUuid ?? route.id,
    routeIndex,
    responseRouteIndex,
    alternativesRequested: route.providerMetadata?.alternativesRequested ?? true,
  };
  const routeVersion = buildRouteVersionFromParts({
    routeId: route.guidance.id ?? route.id,
    routeUuid: route.mapboxRouteUuid ?? route.guidance.routeUuid ?? null,
    rerouteGeneration: route.guidance.rerouteGeneration ?? 0,
    routeIndex,
    generatedAt: route.guidance.createdAt ?? route.createdAt,
    geometry: route.guidance.geometry?.length ? route.guidance.geometry : route.geometry,
    steps: route.guidance.steps,
  });

  return {
    ...route,
    routeVersion,
    routeIndex,
    selectedRouteIndex: routeIndex,
    providerMetadata,
    geometry: tagRouteGeometry(route.geometry, routeVersion),
    guidance: {
      ...route.guidance,
      routeVersion,
      routeIndex,
      providerMetadata,
      geometry: tagRouteGeometry(route.guidance.geometry, routeVersion),
    },
  };
}

export async function fetchRoadRouteAlternatives(params: {
  accessToken: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
  rerouteGeneration?: number | null;
}): Promise<RoadNavRoute[]> {
  const coordinates = `${params.origin.lng},${params.origin.lat};${params.destination.coordinate.lng},${params.destination.coordinate.lat}`;
  const url = new URL(`${DIRECTIONS_URL}/${coordinates}`);
  url.searchParams.set('access_token', params.accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('banner_instructions', 'true');
  url.searchParams.set('voice_instructions', 'true');
  url.searchParams.set('voice_units', 'imperial');
  url.searchParams.set('roundabout_exits', 'true');
  url.searchParams.set('annotations', 'distance,duration,speed');
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('language', 'en');

  const data = await fetchJsonWithTimeout<{ routes?: any[] }>(url.toString(), 9000);
  const routes = (data?.routes ?? [])
    .map((route, index) => normalizeMapboxRoadRoute(route, params, index))
    .filter((route): route is RoadNavRoute => !!route)
    .sort((a, b) => {
      const durationDelta = a.durationS - b.durationS;
      if (Math.abs(durationDelta) > 1) return durationDelta;
      return a.distanceM - b.distanceM;
    })
    .slice(0, 3)
    .map(reindexRoadRouteOption);

  if (routes.length === 0) {
    throw new Error('No driving route found');
  }

  return routes;
}

export async function fetchRoadRoute(params: {
  accessToken: string;
  origin: RoadNavCoordinate;
  destination: RoadNavDestination;
}): Promise<RoadNavRoute> {
  const routes = await fetchRoadRouteAlternatives(params);
  return routes[0];
}
