import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';

import {
  getMapStyleUrl,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
  HEALTH_COLORS,
  computeBounds,
  boundsToZoom,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../lib/mapConfig';
import { ecsLog } from '../../lib/ecsLogger';
import { TACTICAL } from '../../lib/theme';
import type { CampIntelMarkerPayload, CampIntelTone } from '../../lib/campIntel/campIntelTypes';
import { MAX_CAMPSITE_MARKERS } from '../../lib/campsites/campsiteThresholds';
import type {
  DispersedCampingEligibilityLayerState,
  DispersedCampingRegionSelectionPayload,
} from '../../lib/map/dispersedCampingTypes';
import type {
  EstablishedCampsiteLayerState,
  EstablishedCampsiteSelectionPayload,
} from '../../lib/map/establishedCampsiteTypes';
import {
  DISPERSED_CAMPING_REGION_SELECTED,
  ESTABLISHED_CAMPSITE_SELECTED,
  SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED,
  SET_DISPERSED_CAMPING_LAYER_ENABLED,
} from '../../lib/map/mapboxLayerMessages';
import type { RemoteMapOverlayPayload } from '../../lib/remote/mapOverlay';

const WEBVIEW_ORIGIN_WHITELIST = ['*'];
const WEBVIEW_FAILSAFE_TIMEOUT_MS = 15000;
const WEBVIEW_PROGRESS_FAILSAFE_TIMEOUT_MS = 20000;
const MAX_KNOWN_CAMPSITE_SOURCE_MARKERS = 40;
const WEBVIEW_AUTO_RECOVERY_LIMIT = 1;
const CAMERA_EPSILON = 0.00005;
const DEBUG_MAP_RENDERER =
  ((globalThis as typeof globalThis & { __ECS_DEBUG_MAP_RENDERER__?: boolean })
    .__ECS_DEBUG_MAP_RENDERER__ === true);
const DEBUG_CAMP_SCOUT_MAP =
  DEBUG_MAP_RENDERER ||
  ((globalThis as typeof globalThis & { __ECS_CAMP_DEBUG__?: boolean }).__ECS_CAMP_DEBUG__ === true) ||
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_CAMP_DEBUG === '1');
const DEBUG_CAMP_LAYERS =
  ((globalThis as typeof globalThis & { __ECS_CAMP_LAYER_DEBUG__?: boolean }).__ECS_CAMP_LAYER_DEBUG__ === true) ||
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_CAMP_LAYER_DEBUG === '1') ||
  DEBUG_CAMP_SCOUT_MAP;
export const CAMP_SCOUT_PIN_SOURCE_ID = 'ecs-camp-scout-pins-source';
export const CAMP_SCOUT_PIN_LAYER_ID = 'ecs-camp-scout-pins-layer';
export const DISPERSED_CAMPING_ELIGIBILITY_SOURCE_ID = 'ecs-dispersed-camping-eligibility';
export const DISPERSED_CAMPING_ELIGIBILITY_FILL_LAYER_ID = 'ecs-dispersed-camping-eligibility-fill';
export const DISPERSED_CAMPING_ELIGIBILITY_OUTLINE_LAYER_ID = 'ecs-dispersed-camping-eligibility-outline';
export const ESTABLISHED_CAMPSITES_SOURCE_ID = 'ecs-established-campsites';
export const ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID = 'ecs-established-campsites-backplate';
export const ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID = 'ecs-established-campsites-symbol';
const MAP_STYLE_FALLBACK_CHAIN = [
  'mapbox://styles/mapbox/streets-v12',
  'mapbox://styles/mapbox/dark-v11',
];

type LatLng = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
};

type RoutePoint = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
};

type Waypoint = {
  id?: string | number;
  latitude: number;
  longitude: number;
  title?: string;
  name?: string;
  description?: string;
};

type SegmentFeature = {
  id?: string | number;
  coordinates?: [number, number][] | { latitude: number; longitude: number }[];
  color?: string;
  health?: string;
  risk?: string;
  kind?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
};

export type SegmentSelectionPayload = {
  kind?: string | null;
  id?: string | number | null;
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  color?: string | null;
  latitude?: number;
  longitude?: number;
};

type MarkerLike = {
  id?: string | number;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  title?: string;
  subtitle?: string;
  type?: string;
  color?: string;
  category?: string;
  confidence?: string;
  confidenceScore?: number;
  rating?: string;
  score?: number;
  rank?: number;
  rankLabel?: string;
  ratingFactors?: { label: string; value?: string | number; impact?: string; description?: string }[];
  selected?: boolean;
  badges?: { label: string; tone: CampIntelTone }[];
};

export type CampScoutMapMarkerPayload = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  sourceType: 'ecs_inferred' | 'official_mapped' | 'community_suggested' | 'imported_route_context' | 'unknown';
  confidenceGrade: 'A' | 'B' | 'C' | 'D';
  confidenceScore: number;
  confidenceLabel?: string;
  rank?: number;
  rankLabel: string;
  selected?: boolean;
  legalityStatus?: 'verified_allowed' | 'likely_allowed_needs_verification' | 'unknown_needs_verification' | 'restricted_or_not_allowed';
  warnings?: string[];
  reasons?: string[];
  distanceFromRoadOrTrail?: number;
  slope?: number;
  accessNotes?: string;
  pinFamily?: 'camp_scout' | 'campops';
  campOpsRole?: 'candidate' | 'recommended' | 'backup' | 'emergency';
  campOpsCandidateId?: string;
  campOpsRoleLabel?: string;
  accessibilityLabel?: string;
};

type TrailSegment = {
  id?: string | number;
  coordinates?: [number, number][] | { latitude: number; longitude: number }[];
  color?: string;
};

type ReplayMarker = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
};

type SpeedSegment = {
  id?: string | number;
  coordinates?: [number, number][] | { latitude: number; longitude: number }[];
  color?: string;
};

export type RouteBuilderSegmentData = {
  id: string;
  coordinates: [number, number][] | { latitude: number; longitude: number }[];
  rawSegment?: [number, number][] | { latitude: number; longitude: number }[];
  snappedSegment?: [number, number][] | { latitude: number; longitude: number }[];
  snapConfidence?: 'high' | 'medium' | 'low' | null;
  snapSource?: string | null;
  snapStatus?: 'snapped' | 'raw_smoothed' | 'too_short' | 'ambiguous' | 'failed' | null;
  snapMessage?: string | null;
};

export type RouteBuilderUpdatePayload = {
  segments: RouteBuilderSegmentData[];
  pointCount: number;
  isDrawing: boolean;
  snapSource?: string | null;
  snapConfidence?: RouteBuilderSegmentData['snapConfidence'];
  snapStatus?: RouteBuilderSegmentData['snapStatus'];
  snapMessage?: string | null;
};

type MapBoundsReply = {
  north: number;
  south: number;
  east: number;
  west: number;
  center: {
    latitude: number;
    longitude: number;
  };
  zoom?: number;
};

type MapCenterReply = {
  latitude: number;
  longitude: number;
  zoom?: number;
};

type RoadClassificationReply = {
  classification: string;
  source?: string;
};

export type CameraMode = 'follow_user' | 'free_pan' | 'route_overview' | 'replay' | 'pin_focus';

export type CameraCommand = {
  mode?: CameraMode;
  center?: { latitude: number; longitude: number } | null;
  zoom?: number | null;
  pitch?: number | null;
  bearing?: number | null;
  offset?: [number, number] | null;
  fitBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
    padding?: number;
    maxZoom?: number;
  } | null;
  durationMs?: number;
  animate?: boolean;
  reason?: string;
};

export type MapRendererProps = {
  points?: RoutePoint[];
  progressPoints?: RoutePoint[];
  waypoints?: Waypoint[];
  healthLevel?: 'green' | 'yellow' | 'red' | string;
  routeColor?: string;
  progressColor?: string;
  routeRenderMode?: RouteRenderMode;
  mapStyle?: MapStyleKey;
  mapboxToken: string;
  showUserLocation?: boolean;
  followUser?: boolean;
  userLocation?: LatLng | null;
  interactive?: boolean;
  segments?: SegmentFeature[];
  bailoutMarkers?: MarkerLike[];
  pinMarkers?: MarkerLike[];
  showCrosshair?: boolean;
  onLongPress?: (coord: LatLng) => void;
  onPinTap?: (pin: any) => void;
  onSegmentTap?: (segment: SegmentSelectionPayload) => void;
  onMapTap?: (coord: { latitude: number; longitude: number }) => void;
  onMapCenterReply?: (center: MapCenterReply) => void;
  requestCenterTrigger?: number;
  onMapBoundsReply?: (bounds: MapBoundsReply) => void;
  requestBoundsTrigger?: number;
  trailSegments?: TrailSegment[];
  trailActive?: boolean;
  replayMarker?: ReplayMarker | null;
  followReplay?: boolean;
  speedSegments?: SpeedSegment[];
  trailStyle?: 'normal' | 'heat' | 'stealth' | string;
  onTiltAlertTap?: (payload: any) => void;
  onUserDrag?: () => void;
  onRoadClassification?: (payload: RoadClassificationReply) => void;
  vehicleHeading?: number | null;
  isLoading?: boolean;
  hasToken?: boolean;
  onRetry?: () => void | Promise<void>;
  onReadyStateChange?: (ready: boolean) => void;
  campsites?: MarkerLike[];
  tiltAlerts?: MarkerLike[];
  campsiteMarkers?: MarkerLike[];
  campIntelMarkers?: CampIntelMarkerPayload[];
  onCampIntelTap?: (camp: any) => void;
  campScoutMarkers?: CampScoutMapMarkerPayload[];
  onCampScoutTap?: (camp: any) => void;
  tiltAlertMarkers?: MarkerLike[];
  cameraMode?: CameraMode;
  cameraCommand?: CameraCommand | null;
  cameraCommandTrigger?: number;
  routeBuilderActive?: boolean;
  routeBuilderSegments?: RouteBuilderSegmentData[];
  routeBuilderColor?: string;
  onRouteBuilderUpdate?: (payload: RouteBuilderUpdatePayload) => void;
  onRouteBuilderGestureStateChange?: (payload: {
    isDrawing: boolean;
    snapSource?: string | null;
  }) => void;
  remoteOverlay?: RemoteMapOverlayPayload | null;
  dispersedCampingEligibility?: DispersedCampingEligibilityLayerState | null;
  onDispersedCampingRegionTap?: (payload: DispersedCampingRegionSelectionPayload) => void;
  establishedCampsites?: EstablishedCampsiteLayerState | null;
  onEstablishedCampsiteTap?: (payload: EstablishedCampsiteSelectionPayload) => void;
  campsiteSearchPolygon?: {
    coordinates: { latitude: number; longitude: number }[];
    closed: boolean;
  } | null;
  style?: any;
};

export type PinMarker = {
  id?: string | number;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  title?: string;
  subtitle?: string;
  type?: string;
  color?: string;
  category?: string;
  mapIcon?: string;
};

export type TrailSegmentData = TrailSegment;
export type SpeedSegmentData = SpeedSegment;

type WebMapPayload = {
  routeCoords: [number, number][];
  progressRouteCoords: [number, number][];
  routeColor: string;
  progressColor: string;
  routeRenderMode: RouteRenderMode;
  bounds: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
  zoom: number;
  center: [number, number];
  segments: {
    id: string;
    coordinates: [number, number][];
    color: string;
    kind?: string | null;
    name?: string | null;
    category?: string | null;
    categoryLabel?: string | null;
  }[];
  waypoints: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }[];
  bailouts: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    type: string;
  }[];
  pins: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    subtitle?: string;
    type?: string;
    color?: string;
  }[];
  trailSegments: {
    id: string;
    coordinates: [number, number][];
    color: string;
  }[];
  speedSegments: {
    id: string;
    coordinates: [number, number][];
    color: string;
  }[];
  trailStyle: string;
  trailActive: boolean;
  replayMarker: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number } | null;
  showUserLocation: boolean;
  vehicleHeading: number | null;
  showCrosshair: boolean;
  interactive: boolean;
  styleUrl: string;
  cameraMode: CameraMode | null;
  campsites: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    subtitle?: string;
    category?: string;
    confidence?: string;
    confidenceScore?: number;
    rating?: string;
    score?: number;
    rank?: number;
    rankLabel?: string;
    markerKind?: string;
    communityCampSiteId?: string;
    groupShareId?: string;
    reportId?: string | null;
    visibilityScope?: string;
    ratingFactors?: { label: string; value?: string | number; impact?: string; description?: string }[];
    selected?: boolean;
    badges?: { label: string; tone: CampIntelTone }[];
  }[];
  campScoutPins: CampScoutMapMarkerPayload[];
  tiltAlerts: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    type: string;
  }[];
  routeBuilderActive: boolean;
  routeBuilderColor: string;
  routeBuilderSegments: {
    id: string;
    coordinates: [number, number][];
    rawSegment?: [number, number][];
    snappedSegment?: [number, number][];
    snapConfidence?: 'high' | 'medium' | 'low' | null;
    snapSource?: string | null;
    snapStatus?: 'snapped' | 'raw_smoothed' | 'too_short' | 'ambiguous' | 'failed' | null;
    snapMessage?: string | null;
  }[];
  remoteOverlay: RemoteMapOverlayPayload;
  campsiteSearchPolygon: {
    coordinates: [number, number][];
    closed: boolean;
  } | null;
};

type WebMapDynamicPayload = {
  replayMarker: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number } | null;
  showUserLocation: boolean;
  vehicleHeading: number | null;
  cameraMode: CameraMode | null;
  interactive: boolean;
  routeBuilderActive: boolean;
};

type RouteRenderMode = 'idle' | 'preview' | 'active' | 'completed' | 'selected';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isValidCoord(lat?: number, lng?: number) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function coordinatesSame(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 0.000001 && Math.abs(left[1] - right[1]) < 0.000001;
}

function normalizeRouteLineCoordinates(input: [number, number][]): [number, number][] {
  if (input.length < 2) return [];
  const output: [number, number][] = [];
  for (const point of input) {
    const previous = output[output.length - 1];
    if (!previous || !coordinatesSame(previous, point)) {
      output.push(point);
    }
  }

  if (output.length < 2) return [];
  const first = output[0];
  const hasDistinctPoint = output.some((point) => !coordinatesSame(first, point));
  return hasDistinctPoint ? output : [];
}

function routeCoordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
}

function toLngLatPair(
  point:
    | [number, number]
    | { latitude?: number; longitude?: number; lat?: number; lng?: number }
    | null
    | undefined,
): [number, number] | null {
  if (!point) return null;

  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point;
    if (isValidCoord(lat, lng)) return [lng, lat];
    return null;
  }

  const lat =
    typeof (point as any).latitude === 'number'
      ? (point as any).latitude
      : typeof (point as any).lat === 'number'
        ? (point as any).lat
        : undefined;

  const lng =
    typeof (point as any).longitude === 'number'
      ? (point as any).longitude
      : typeof (point as any).lng === 'number'
        ? (point as any).lng
        : undefined;

  if (isValidCoord(lat, lng)) {
    return [lng as number, lat as number];
  }

  return null;
}

function normalizeLineCoordinates(
  input?: [number, number][] | { latitude: number; longitude: number }[],
): [number, number][] {
  if (!input?.length) return [];
  const out: [number, number][] = [];
  for (const item of input) {
    const pair = toLngLatPair(item as any);
    if (pair) out.push(pair);
  }
  return normalizeRouteLineCoordinates(out);
}

function normalizePointList(points?: RoutePoint[]): [number, number][] {
  if (!points?.length) return [];
  const out: [number, number][] = [];

  for (const p of points) {
    const lat =
      typeof (p as any).latitude === 'number'
        ? (p as any).latitude
        : typeof (p as any).lat === 'number'
          ? (p as any).lat
          : undefined;

    const lng =
      typeof (p as any).longitude === 'number'
        ? (p as any).longitude
        : typeof (p as any).lng === 'number'
          ? (p as any).lng
          : undefined;

    if (isValidCoord(lat, lng)) {
      out.push([lng as number, lat as number]);
    }
  }

  return normalizeRouteLineCoordinates(out);
}

function pickRouteColor(level?: string) {
  switch ((level || '').toLowerCase()) {
    case 'red':
      return HEALTH_COLORS.red;
    case 'yellow':
      return HEALTH_COLORS.yellow;
    case 'green':
    default:
      return HEALTH_COLORS.green;
  }
}

function stableStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function normalizeDebugDetails(details?: unknown): Record<string, any> | undefined {
  if (details == null) return undefined;
  if (typeof details === 'object' && !Array.isArray(details)) {
    return details as Record<string, any>;
  }
  return { value: details };
}

function debugLog(message: string, details?: unknown) {
  if (!DEBUG_MAP_RENDERER) return;
  ecsLog.debug('MAP', message, normalizeDebugDetails(details));
}

function campScoutDebugLog(message: string, details?: unknown) {
  if (!DEBUG_CAMP_SCOUT_MAP) return;
  ecsLog.debug('MAP', message, normalizeDebugDetails(details));
}

function campLayerDebugLog(message: string, details?: unknown) {
  if (!DEBUG_CAMP_LAYERS) return;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[CAMP_LAYER_DEBUG]', message, normalizeDebugDetails(details) ?? '');
    return;
  }
  ecsLog.debug('MAP', message, normalizeDebugDetails(details));
}

function toMarkerId(prefix: string, value: string | number | undefined, index: number) {
  return `${prefix}-${String(value ?? index)}`;
}

function readMarkerCoordinate(marker: any): { latitude: number; longitude: number } | null {
  const latitude =
    typeof marker?.latitude === 'number'
      ? marker.latitude
      : typeof marker?.lat === 'number'
        ? marker.lat
        : undefined;
  const longitude =
    typeof marker?.longitude === 'number'
      ? marker.longitude
      : typeof marker?.lng === 'number'
        ? marker.lng
        : undefined;

  if (!isValidCoord(latitude, longitude)) return null;
  return { latitude: latitude as number, longitude: longitude as number };
}

function pickCampsiteMarkerInput(props: MapRendererProps): readonly any[] {
  if (Array.isArray(props.campIntelMarkers) && props.campIntelMarkers.length > 0) {
    return props.campIntelMarkers;
  }
  if (Array.isArray(props.campsites) && props.campsites.length > 0) {
    return props.campsites;
  }
  return Array.isArray(props.campsiteMarkers) ? props.campsiteMarkers : [];
}

function normalizeRenderedRouteWaypoints(
  routeCoords: [number, number][],
  waypoints: Waypoint[] = [],
): WebMapPayload['waypoints'] {
  const rendered: WebMapPayload['waypoints'] = [];
  const seen = new Set<string>();
  const hasRoute = routeCoords.length > 1;
  const endCoord = hasRoute ? routeCoords[routeCoords.length - 1] : null;
  const addWaypoint = (
    id: string,
    latitude: number,
    longitude: number,
    title: string,
  ) => {
    if (!isValidCoord(latitude, longitude)) return;
    const coordinateKey = routeCoordinateKey(latitude, longitude);
    if (seen.has(coordinateKey)) return;
    seen.add(coordinateKey);
    rendered.push({ id, latitude, longitude, title });
  };

  if (hasRoute) {
    const [startLng, startLat] = routeCoords[0];
    addWaypoint('route-start', startLat, startLng, 'Start');
  }

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];
    if (
      endCoord &&
      coordinatesSame([waypoint.longitude, waypoint.latitude], endCoord)
    ) {
      continue;
    }
    addWaypoint(
      toMarkerId('wp', waypoint.id, index),
      waypoint.latitude,
      waypoint.longitude,
      waypoint.title || waypoint.name || `Waypoint ${index + 1}`,
    );
  }

  if (endCoord) {
    const [endLng, endLat] = endCoord;
    addWaypoint('route-end', endLat, endLng, 'End');
  }

  return rendered;
}

export function normalizeRenderedCampsiteMarkers(input: readonly any[]): WebMapPayload['campsites'] {
  const rendered: WebMapPayload['campsites'] = [];
  let renderedAiSuggestions = 0;

  for (const marker of input) {
    if (rendered.length >= MAX_KNOWN_CAMPSITE_SOURCE_MARKERS) break;
    const coordinate = readMarkerCoordinate(marker);
    if (!coordinate) continue;
    const isKnownSourceMarker = typeof marker?.markerKind === 'string' && marker.markerKind.length > 0;
    if (!isKnownSourceMarker && renderedAiSuggestions >= MAX_CAMPSITE_MARKERS) continue;
    const rawMarkerId =
      typeof marker?.id === 'string' || typeof marker?.id === 'number'
        ? String(marker.id)
        : null;

    rendered.push({
      id: rawMarkerId ?? toMarkerId('camp', undefined, rendered.length),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      title: marker?.title || `Campsite ${rendered.length + 1}`,
      subtitle: typeof marker?.subtitle === 'string' ? marker.subtitle : undefined,
      category: typeof marker?.category === 'string' ? marker.category : undefined,
      confidence: typeof marker?.confidence === 'string' ? marker.confidence : undefined,
      confidenceScore:
        typeof marker?.confidenceScore === 'number' && Number.isFinite(marker.confidenceScore)
          ? Number(marker.confidenceScore)
          : undefined,
      rating:
        typeof marker?.rating === 'string' && /^[ABCD]$/.test(marker.rating)
          ? marker.rating
          : undefined,
      score:
        typeof marker?.score === 'number' && Number.isFinite(marker.score)
          ? Number(marker.score)
          : undefined,
      rank:
        typeof marker?.rank === 'number' && Number.isFinite(marker.rank) && marker.rank > 0
          ? Math.floor(Number(marker.rank))
          : rendered.length + 1,
      rankLabel:
        typeof marker?.rankLabel === 'string' && marker.rankLabel.trim().length > 0
          ? marker.rankLabel.trim()
          : String(rendered.length + 1),
      markerKind: isKnownSourceMarker ? marker.markerKind : undefined,
      communityCampSiteId:
        typeof marker?.communityCampSiteId === 'string' ? marker.communityCampSiteId : undefined,
      groupShareId: typeof marker?.groupShareId === 'string' ? marker.groupShareId : undefined,
      reportId: typeof marker?.reportId === 'string' ? marker.reportId : undefined,
      visibilityScope: typeof marker?.visibilityScope === 'string' ? marker.visibilityScope : undefined,
      ratingFactors: Array.isArray(marker?.ratingFactors)
        ? marker.ratingFactors
            .filter((factor: any) => factor && typeof factor.label === 'string')
            .slice(0, 6)
            .map((factor: any) => ({
              label: String(factor.label),
              value:
                typeof factor.value === 'number' || typeof factor.value === 'string'
                  ? factor.value
                  : undefined,
              impact:
                factor.impact === 'positive' || factor.impact === 'negative' || factor.impact === 'neutral'
                  ? factor.impact
                  : undefined,
              description: typeof factor.description === 'string' ? factor.description : undefined,
            }))
        : [],
      selected: !!marker?.selected,
      badges: Array.isArray(marker?.badges)
        ? marker.badges
            .filter((badge: any) => badge && typeof badge.label === 'string')
            .slice(0, 2)
            .map((badge: any) => ({
              label: String(badge.label),
              tone: typeof badge.tone === 'string' ? badge.tone : 'neutral',
            }))
        : [],
    });
    if (!isKnownSourceMarker) renderedAiSuggestions += 1;
  }

  return rendered;
}

export function normalizeRenderedCampScoutMarkers(
  input: readonly CampScoutMapMarkerPayload[] = [],
): WebMapPayload['campScoutPins'] {
  const rendered: WebMapPayload['campScoutPins'] = [];
  const seen = new Set<string>();

  for (const marker of input) {
    if (rendered.length >= 10) break;
    if (!isValidCoord(marker.latitude, marker.longitude)) continue;
    const identity = marker.id || `${marker.latitude.toFixed(6)}:${marker.longitude.toFixed(6)}`;
    const coordinateKey = routeCoordinateKey(marker.latitude, marker.longitude);
    const key = `${identity}:${coordinateKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const index = rendered.length;
    rendered.push({
      id: toMarkerId('camp-scout', marker.id, index),
      latitude: marker.latitude,
      longitude: marker.longitude,
      title: marker.title || `Camp Scout ${index + 1}`,
      sourceType: marker.sourceType || 'unknown',
      confidenceGrade: /^[ABCD]$/.test(marker.confidenceGrade) ? marker.confidenceGrade : 'D',
      confidenceScore:
        typeof marker.confidenceScore === 'number' && Number.isFinite(marker.confidenceScore)
          ? Math.max(0, Math.min(100, Math.round(marker.confidenceScore)))
          : 0,
      rank:
        typeof marker.rank === 'number' && Number.isFinite(marker.rank) && marker.rank > 0
          ? Math.floor(marker.rank)
          : index + 1,
      rankLabel:
        typeof marker.rankLabel === 'string' && marker.rankLabel.trim().length > 0
          ? marker.rankLabel.trim().slice(0, 3)
          : String(index + 1),
      selected: !!marker.selected,
      pinFamily: marker.pinFamily === 'campops' ? 'campops' : 'camp_scout',
      confidenceLabel: typeof marker.confidenceLabel === 'string' ? marker.confidenceLabel : undefined,
      legalityStatus: marker.legalityStatus ?? 'unknown_needs_verification',
      warnings: Array.isArray(marker.warnings)
        ? marker.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 6)
        : [],
      reasons: Array.isArray(marker.reasons)
        ? marker.reasons.filter((reason): reason is string => typeof reason === 'string').slice(0, 6)
        : [],
      distanceFromRoadOrTrail:
        typeof marker.distanceFromRoadOrTrail === 'number' && Number.isFinite(marker.distanceFromRoadOrTrail)
          ? marker.distanceFromRoadOrTrail
          : undefined,
      slope:
        typeof marker.slope === 'number' && Number.isFinite(marker.slope)
          ? marker.slope
          : undefined,
      accessNotes: typeof marker.accessNotes === 'string' ? marker.accessNotes : undefined,
      campOpsRole: marker.campOpsRole,
      campOpsCandidateId: marker.campOpsCandidateId,
      campOpsRoleLabel: marker.campOpsRoleLabel,
      accessibilityLabel:
        typeof marker.accessibilityLabel === 'string' && marker.accessibilityLabel.trim().length > 0
          ? marker.accessibilityLabel.trim()
          : undefined,
    });
  }

  return rendered;
}

export function buildCampScoutPinFeatureCollection(
  input: readonly CampScoutMapMarkerPayload[] = [],
) {
  const pins = normalizeRenderedCampScoutMarkers(input);
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((pin) => ({
      type: 'Feature' as const,
      id: pin.id,
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.longitude, pin.latitude] as [number, number],
      },
      properties: {
        id: pin.id,
        title: pin.title,
        confidenceScore: pin.confidenceScore,
        confidence: pin.confidenceLabel ?? pin.confidenceGrade,
        confidenceLabel: pin.confidenceLabel ?? pin.confidenceGrade,
        source: pin.sourceType,
        sourceType: pin.sourceType,
        legalityStatus: pin.legalityStatus ?? 'unknown_needs_verification',
        warnings: pin.warnings ?? [],
        reasons: pin.reasons ?? [],
        distanceFromRoadOrTrail: pin.distanceFromRoadOrTrail ?? null,
        slope: pin.slope ?? null,
        accessNotes: pin.accessNotes ?? null,
      },
    })),
  };
}

export function buildMapOverlayPayloadHash(payload: WebMapPayload) {
  const {
    replayMarker: _replayMarker,
    userLocation: _userLocation,
    showUserLocation: _showUserLocation,
    vehicleHeading: _vehicleHeading,
    cameraMode: _cameraMode,
    interactive: _interactive,
    routeBuilderActive: _routeBuilderActive,
    ...staticPayload
  } = payload;

  return stableStringify(staticPayload);
}

function roundForHash(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(5));
}

function buildCameraCommandHash(command?: CameraCommand | null, trigger?: number) {
  return stableStringify({
    trigger: typeof trigger === 'number' ? trigger : null,
    mode: command?.mode ?? null,
    center: command?.center
      ? {
          latitude: roundForHash(command.center.latitude),
          longitude: roundForHash(command.center.longitude),
        }
      : null,
    zoom: roundForHash(command?.zoom ?? null),
    pitch: roundForHash(command?.pitch ?? null),
    bearing: roundForHash(command?.bearing ?? null),
    offset: Array.isArray(command?.offset)
      ? [
          roundForHash(command?.offset?.[0] ?? null),
          roundForHash(command?.offset?.[1] ?? null),
        ]
      : null,
    fitBounds: command?.fitBounds
      ? {
          north: roundForHash(command.fitBounds.north),
          south: roundForHash(command.fitBounds.south),
          east: roundForHash(command.fitBounds.east),
          west: roundForHash(command.fitBounds.west),
          padding: command.fitBounds.padding ?? null,
          maxZoom: command.fitBounds.maxZoom ?? null,
        }
      : null,
    durationMs: command?.durationMs ?? null,
    animate: command?.animate ?? null,
    reason: command?.reason ?? null,
  });
}

export function buildWebPayload(props: MapRendererProps): WebMapPayload {
  const routeCoordsRaw = normalizePointList(props.points);
  const progressCoordsRaw = normalizePointList(props.progressPoints);
  const routeCoords =
    routeCoordsRaw.length > 600
      ? routeCoordsRaw.filter(
          (_, index) =>
            index === 0 ||
            index === routeCoordsRaw.length - 1 ||
            index % Math.ceil(routeCoordsRaw.length / 600) === 0,
        )
      : routeCoordsRaw;
  const progressRouteCoords =
    progressCoordsRaw.length > 600
      ? progressCoordsRaw.filter(
          (_, index) =>
            index === 0 ||
            index === progressCoordsRaw.length - 1 ||
            index % Math.ceil(progressCoordsRaw.length / 600) === 0,
        )
      : progressCoordsRaw;

  const routePointsForBounds = routeCoords.map(([lng, lat]) => ({ lat, lng }));

  const bounds =
    routePointsForBounds.length > 1
      ? computeBounds(routePointsForBounds as any)
      : null;

  const userLat =
    props.userLocation && typeof props.userLocation.latitude === 'number'
      ? props.userLocation.latitude
      : props.userLocation && typeof props.userLocation.lat === 'number'
        ? props.userLocation.lat
        : undefined;

  const userLng =
    props.userLocation && typeof props.userLocation.longitude === 'number'
      ? props.userLocation.longitude
      : props.userLocation && typeof props.userLocation.lng === 'number'
        ? props.userLocation.lng
        : undefined;

  const center: [number, number] =
    routeCoords.length > 0
      ? routeCoords[Math.floor(routeCoords.length / 2)]
      : isValidCoord(userLat, userLng)
        ? [userLng as number, userLat as number]
        : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

  const zoom = bounds
    ? clamp(boundsToZoom(bounds, 1024, 768), 3, 17)
    : isValidCoord(userLat, userLng)
      ? 14
      : DEFAULT_ZOOM;

  const tiltAlertInput = props.tiltAlerts?.length
    ? props.tiltAlerts
    : props.tiltAlertMarkers || [];

  return {
    routeCoords,
    progressRouteCoords,
    routeColor:
      props.routeColor ||
      (props.routeRenderMode === 'preview'
        ? '#65D4FF'
        : props.routeRenderMode === 'completed'
          ? '#F2C24D'
          : pickRouteColor(props.healthLevel)),
    progressColor: props.progressColor || '#F2C24D',
    routeRenderMode: props.routeRenderMode ?? 'selected',
    bounds,
    zoom,
    center,
    segments: (props.segments || []).map((segment, index) => ({
      id: toMarkerId('seg', segment.id, index),
      coordinates: normalizeLineCoordinates(segment.coordinates),
      color:
        segment.color ||
        (segment.health === 'red'
          ? HEALTH_COLORS.red
          : segment.health === 'yellow'
            ? HEALTH_COLORS.yellow
            : HEALTH_COLORS.green),
      kind: segment.kind ?? null,
      name: segment.name ?? null,
      category: segment.category ?? null,
      categoryLabel: segment.categoryLabel ?? null,
    })),
    waypoints: normalizeRenderedRouteWaypoints(routeCoords, props.waypoints || []),
    bailouts: (props.bailoutMarkers || [])
      .filter((m) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : undefined;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : undefined;
        return isValidCoord(lat, lng);
      })
      .map((m, index) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : 0;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : 0;
        return {
          id: toMarkerId('bo', m.id, index),
          latitude: lat,
          longitude: lng,
          title: m.title || `Bailout ${index + 1}`,
          type: m.type || 'bailout',
        };
      }),
    pins: (props.pinMarkers || [])
      .filter((m) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : undefined;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : undefined;
        return isValidCoord(lat, lng);
      })
      .map((m, index) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : 0;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : 0;
        return {
          id: toMarkerId('pin', m.id, index),
          latitude: lat,
          longitude: lng,
          title: m.title || `Pin ${index + 1}`,
          subtitle: m.subtitle,
          type: m.type,
          color: m.color,
        };
      }),
    trailSegments: (props.trailSegments || []).map((segment, index) => ({
      id: toMarkerId('trail', (segment as any).id ?? (segment as any).segment_id, index),
      coordinates: normalizeLineCoordinates(segment.coordinates),
      color: segment.color || '#5FD1FF',
    })),
    speedSegments: (props.speedSegments || []).map((segment, index) => ({
      id: toMarkerId('speed', (segment as any).id ?? (segment as any).segment_id, index),
      coordinates: normalizeLineCoordinates(segment.coordinates),
      color: segment.color || '#FFFFFF',
    })),
    trailStyle: props.trailStyle || 'normal',
    trailActive: !!props.trailActive,
    replayMarker:
      props.replayMarker &&
      isValidCoord(
        (props.replayMarker as any).latitude ?? (props.replayMarker as any).lat,
        (props.replayMarker as any).longitude ?? (props.replayMarker as any).lng,
      )
        ? {
            latitude:
              (props.replayMarker as any).latitude ?? (props.replayMarker as any).lat,
            longitude:
              (props.replayMarker as any).longitude ?? (props.replayMarker as any).lng,
          }
        : null,
    userLocation: isValidCoord(userLat, userLng)
      ? {
          latitude: userLat as number,
          longitude: userLng as number,
        }
      : null,
    showUserLocation: !!props.showUserLocation && isValidCoord(userLat, userLng),
    vehicleHeading:
      typeof props.vehicleHeading === 'number' && Number.isFinite(props.vehicleHeading)
        ? props.vehicleHeading
        : null,
    showCrosshair: !!props.showCrosshair,
    interactive: props.interactive !== false,
    styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE),
    cameraMode: props.cameraMode ?? null,
    campsites: normalizeRenderedCampsiteMarkers(pickCampsiteMarkerInput(props)),
    campScoutPins: normalizeRenderedCampScoutMarkers(props.campScoutMarkers ?? []),
    tiltAlerts: tiltAlertInput
      .filter((m) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : undefined;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : undefined;
        return isValidCoord(lat, lng);
      })
      .map((m, index) => {
        const lat =
          typeof (m as any).latitude === 'number'
            ? (m as any).latitude
            : typeof (m as any).lat === 'number'
              ? (m as any).lat
              : 0;
        const lng =
          typeof (m as any).longitude === 'number'
            ? (m as any).longitude
            : typeof (m as any).lng === 'number'
              ? (m as any).lng
              : 0;
        return {
          id: toMarkerId('tilt', m.id, index),
          latitude: lat,
          longitude: lng,
          title: m.title || `Tilt Alert ${index + 1}`,
          type: m.type || 'tilt',
        };
      }),
    routeBuilderActive: !!props.routeBuilderActive,
    routeBuilderColor: props.routeBuilderColor || '#65F0D4',
    routeBuilderSegments: (props.routeBuilderSegments || []).map((segment, index) => ({
      id: toMarkerId('route-builder', segment.id, index),
      coordinates: normalizeLineCoordinates(segment.coordinates),
      rawSegment: normalizeLineCoordinates(segment.rawSegment),
      snappedSegment: normalizeLineCoordinates(segment.snappedSegment),
      snapConfidence: segment.snapConfidence ?? null,
      snapSource: segment.snapSource ?? null,
      snapStatus: segment.snapStatus ?? null,
      snapMessage: segment.snapMessage ?? null,
    })),
    remoteOverlay: props.remoteOverlay ?? { enabled: false, heatmapAreas: [], forecastSegments: [] },
    campsiteSearchPolygon: props.campsiteSearchPolygon
      ? {
          coordinates: normalizeLineCoordinates(props.campsiteSearchPolygon.coordinates),
          closed: !!props.campsiteSearchPolygon.closed,
        }
      : null,
  };
}

function buildDynamicPayload(props: Pick<
  MapRendererProps,
  | 'replayMarker'
  | 'userLocation'
  | 'showUserLocation'
  | 'vehicleHeading'
  | 'cameraMode'
  | 'interactive'
  | 'routeBuilderActive'
>): WebMapDynamicPayload {
  const replay = normalizeLatLng(props.replayMarker as LatLng | null);
  const user = normalizeLatLng(props.userLocation ?? null);

  return {
    replayMarker: replay,
    userLocation: user,
    showUserLocation: !!props.showUserLocation && !!user,
    vehicleHeading:
      typeof props.vehicleHeading === 'number' && Number.isFinite(props.vehicleHeading)
        ? props.vehicleHeading
        : null,
    cameraMode: props.cameraMode ?? null,
    interactive: props.interactive !== false,
    routeBuilderActive: !!props.routeBuilderActive,
  };
}

function makeMapHtml(
  token: string,
  initialStyleUrl: string,
  fallbackStyleUrls: string[],
  instanceKey: number,
) {
  const escapedToken = JSON.stringify(token);
  const escapedInitialStyleUrl = JSON.stringify(initialStyleUrl);
  const escapedFallbackStyleUrls = JSON.stringify(fallbackStyleUrls || []);
  const escapedInstanceKey = JSON.stringify(instanceKey);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width"
  />
  <link
    href="https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css"
    rel="stylesheet"
  />
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0A0D12;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 24px;
      height: 24px;
      margin-left: -12px;
      margin-top: -12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
      z-index: 20;
    }
    .crosshair::before,
    .crosshair::after {
      content: '';
      position: absolute;
      background: rgba(255, 215, 0, 0.95);
      box-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
    }
    .crosshair::before {
      left: 11px;
      top: 0;
      width: 2px;
      height: 24px;
    }
    .crosshair::after {
      top: 11px;
      left: 0;
      width: 24px;
      height: 2px;
    }
    .marker-dot {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.95);
      box-shadow: 0 0 10px rgba(0,0,0,0.35);
    }
    .marker-waypoint { background: #FFD700; }
    .marker-bailout { background: #E14B4B; }
    .marker-camp {
      width: 26px;
      height: 26px;
      border: none;
      border-radius: 999px;
      box-shadow: 0 8px 18px rgba(0,0,0,0.34);
      background: transparent;
    }
    .camp-intel-marker {
      position: relative;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      will-change: transform;
    }
    .camp-intel-selected {
      width: 42px;
      height: 42px;
      align-items: center;
      justify-content: center;
      padding-top: 0;
      z-index: 24;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.44));
    }
    .camp-intel-ripple {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 36px;
      height: 36px;
      border-radius: 999px;
      border: 1px solid rgba(255, 215, 107, 0.68);
      background: rgba(255, 215, 107, 0.10);
      box-shadow: 0 0 18px rgba(255, 215, 107, 0.30);
      pointer-events: none;
      animation: campIntelSelectedRipple 1800ms ease-out infinite;
    }
    .camp-intel-beacon {
      position: absolute;
      inset: -5px;
      border-radius: 999px;
      border: 1px solid rgba(102, 201, 122, 0.34);
      box-shadow:
        0 0 0 1px rgba(9, 16, 20, 0.34) inset,
        0 0 13px rgba(102, 201, 122, 0.22);
      pointer-events: none;
      opacity: 0.72;
      animation: campIntelBeaconEcho 2600ms ease-out infinite;
    }
    .camp-intel-beacon::after {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 999px;
      border: 1px solid rgba(255, 215, 107, 0.22);
    }
    .camp-intel-selected .camp-intel-beacon {
      border-color: rgba(226, 77, 77, 0.46);
      box-shadow:
        0 0 0 1px rgba(9, 16, 20, 0.38) inset,
        0 0 15px rgba(226, 77, 77, 0.28);
    }
    @keyframes campIntelBeaconEcho {
      0%, 100% {
        opacity: 0.64;
        transform: scale(0.96);
      }
      50% {
        opacity: 0.36;
        transform: scale(1.08);
      }
    }
    @keyframes campIntelSelectedRipple {
      0% {
        opacity: 0.58;
        transform: scale(0.70);
      }
      62% {
        opacity: 0.16;
        transform: scale(1.20);
      }
      100% {
        opacity: 0;
        transform: scale(1.34);
      }
    }
    .camp-intel-ring {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      border: 2px solid rgba(255, 193, 72, 0.55);
      background: rgba(10, 13, 18, 0.18);
      box-shadow: 0 0 0 1px rgba(8, 11, 14, 0.65) inset;
    }
    .camp-intel-core {
      position: absolute;
      inset: 4px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #091014;
      font-weight: 900;
      font-size: 10px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .camp-intel-selected .camp-intel-ring {
      top: 7px;
      left: 7px;
      width: 28px;
      height: 28px;
      inset: auto;
      transform: none;
      border-color: rgba(255, 248, 220, 0.95);
      background: rgba(255, 215, 107, 0.18);
      box-shadow:
        0 0 0 2px rgba(8, 11, 14, 0.78) inset,
        0 0 16px rgba(255, 215, 107, 0.52);
    }
    .camp-intel-selected .camp-intel-core {
      top: 12px;
      left: 12px;
      width: 18px;
      height: 18px;
      inset: auto;
      font-size: 9px;
      line-height: 18px;
      border-color: rgba(255,255,255,0.28);
    }
    .camp-intel-selected::after {
      content: none;
    }
    .camp-intel-conf-high .camp-intel-ring { border-color: rgba(102, 187, 106, 0.78); }
    .camp-intel-conf-medium .camp-intel-ring { border-color: rgba(255, 179, 0, 0.82); }
    .camp-intel-conf-low .camp-intel-ring { border-color: rgba(239, 83, 80, 0.82); }
    .camp-intel-cat-suggested .camp-intel-core { background: #65C97A; }
    .camp-intel-cat-backup .camp-intel-core { background: #D4A017; }
    .camp-intel-cat-emergency .camp-intel-core { background: #FF8A50; }
    .camp-intel-cat-saved .camp-intel-core { background: #5EA1FF; color: #0B1116; }
    .camp-intel-cat-established .camp-intel-core { background: #8FD694; color: #0B1116; }
    .camp-intel-cat-community .camp-intel-core { background: #65C97A; color: #0B1116; }
    .camp-intel-cat-private .camp-intel-core { background: #5EA1FF; color: #0B1116; }
    .camp-intel-cat-group .camp-intel-core { background: #B18CFF; color: #0B1116; }
    .camp-intel-cat-pending .camp-intel-core { background: #FFCA5A; color: #0B1116; }
    .camp-intel-cat-review .camp-intel-core { background: #66BB6A; color: #0B1116; }
    .camp-intel-cat-rejected .camp-intel-core { background: #EF5350; color: #FFF5EF; }
    .camp-intel-cat-previously_used .camp-intel-core { background: #9EC2B1; color: #0B1116; }
    .camp-intel-cat-caution .camp-intel-core { background: #C86E68; }
    .camp-scout-marker {
      position: relative;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 4;
      filter: drop-shadow(0 6px 12px rgba(0,0,0,0.34));
    }
    .camp-scout-marker::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 999px;
      border: 1px solid rgba(196,138,44,0.24);
      background: rgba(8, 11, 14, 0.36);
    }
    .camp-scout-core {
      position: relative;
      min-width: 22px;
      height: 22px;
      padding: 0 4px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(196,138,44,0.94);
      color: #091014;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      line-height: 22px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
      gap: 2px;
    }
    .camp-scout-tent {
      position: relative;
      width: 8px;
      height: 7px;
      display: inline-block;
      flex: 0 0 auto;
    }
    .camp-scout-tent::before {
      content: '';
      position: absolute;
      left: 0;
      top: 1px;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-bottom: 7px solid currentColor;
      opacity: 0.88;
    }
    .camp-scout-tent::after {
      content: '';
      position: absolute;
      left: 3px;
      top: 4px;
      width: 2px;
      height: 4px;
      background: rgba(9,16,20,0.72);
      border-radius: 1px 1px 0 0;
    }
    .camp-scout-rank {
      position: relative;
      z-index: 1;
    }
    .camp-scout-label {
      position: absolute;
      left: 50%;
      top: 24px;
      transform: translateX(-50%);
      padding: 1px 4px;
      border-radius: 999px;
      border: 1px solid rgba(242,194,77,0.22);
      background: rgba(8, 11, 14, 0.78);
      color: #F2C24D;
      font-size: 7px;
      line-height: 9px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
    }
    .camp-scout-grade-a { z-index: 12; }
    .camp-scout-grade-a .camp-scout-core { background: #F2C24D; }
    .camp-scout-grade-b .camp-scout-core { background: #D4A017; }
    .camp-scout-grade-c .camp-scout-core { background: #9EC2B1; color: #0B1116; }
    .camp-scout-source-ecs_inferred .camp-scout-core {
      background: #F2C24D;
      color: #091014;
      border-color: rgba(9,16,20,0.34);
      box-shadow: 0 0 0 2px rgba(242,194,77,0.14);
    }
    .camp-scout-source-ecs_inferred::before {
      border-color: rgba(242,194,77,0.42);
      background: rgba(242,194,77,0.10);
    }
    .camp-scout-source-official_mapped .camp-scout-core { background: #8FD694; color: #0B1116; }
    .camp-scout-source-community_suggested .camp-scout-core { background: #65C97A; color: #0B1116; }
    .camp-scout-source-imported_route_context .camp-scout-core { background: #86B8FF; color: #0B1116; }
    .camp-scout-selected {
      width: 36px;
      height: 36px;
      z-index: 28;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.44));
    }
    .camp-scout-selected::before {
      inset: 0;
      border-color: rgba(255,248,220,0.86);
      box-shadow: 0 0 18px rgba(242,194,77,0.36);
    }
    .camp-scout-selected .camp-scout-core {
      min-width: 26px;
      height: 26px;
      line-height: 26px;
      font-size: 10px;
    }
    .camp-intel-marker.camp-intel-selected .camp-intel-core {
      background: #D9433F;
      color: #FFF5EF;
      border-color: rgba(255, 245, 239, 0.44);
      text-shadow: 0 1px 2px rgba(0,0,0,0.32);
    }
    .camp-intel-badges {
      position: absolute;
      right: -8px;
      top: -8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      pointer-events: none;
    }
    .camp-intel-badge {
      min-width: 16px;
      height: 16px;
      padding: 0 2px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(8, 11, 14, 0.94);
      color: #F5F7F8;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: none;
    }
    .camp-intel-badge-positive { color: #86D39A; }
    .camp-intel-badge-caution { color: #FFCA5A; }
    .camp-intel-badge-warning { color: #FF8D7C; }
    .camp-intel-badge-info { color: #86B8FF; }
    .camp-intel-badge-neutral { color: #D9DEDF; }
    .marker-tilt { background: #FF9F43; }
    .marker-pin { background: #6EA8FF; }
    .marker-user {
      width: 34px;
      height: 34px;
      background: transparent;
      z-index: 1000;
      pointer-events: none;
    }
    .marker-user-shell {
      position: relative;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .marker-user-pulse {
      position: absolute;
      inset: 6px;
      border-radius: 999px;
      background: rgba(77,163,255,0.16);
      border: 1px solid rgba(255,215,107,0.16);
      box-shadow: 0 0 12px rgba(77,163,255,0.28);
    }
    .marker-user-rotor {
      position: relative;
      width: 28px;
      height: 28px;
      transform-origin: center center;
    }
    .marker-user-heading {
      position: absolute;
      top: 1px;
      left: 50%;
      margin-left: -5px;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 11px solid #F7C85C;
      filter: drop-shadow(0 0 4px rgba(247,200,92,0.5));
    }
    .marker-user-core {
      position: absolute;
      inset: 11px;
      border-radius: 999px;
      background: #4DA3FF;
      border: 2px solid rgba(255,255,255,0.95);
      box-shadow: 0 0 10px rgba(77,163,255,0.45);
    }
    .marker-replay {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #FFFFFF;
      border: 2px solid #111;
      box-shadow: 0 0 10px rgba(255,255,255,0.85);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="crosshair" class="crosshair"></div>

  <script src="https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js"></script>
  <script>
    (function() {
      var RNW = window.ReactNativeWebView;
      var mapInstanceKey = ${escapedInstanceKey};
      var campScoutDebugEnabled = ${DEBUG_CAMP_SCOUT_MAP ? 'true' : 'false'};
      var campLayerDebugEnabled = ${DEBUG_CAMP_LAYERS ? 'true' : 'false'};
      var CAMP_SCOUT_SOURCE_ID = ${JSON.stringify(CAMP_SCOUT_PIN_SOURCE_ID)};
      var CAMP_SCOUT_LAYER_ID = ${JSON.stringify(CAMP_SCOUT_PIN_LAYER_ID)};
      var DISPERSED_CAMPING_SOURCE_ID = ${JSON.stringify(DISPERSED_CAMPING_ELIGIBILITY_SOURCE_ID)};
      var DISPERSED_CAMPING_FILL_LAYER_ID = ${JSON.stringify(DISPERSED_CAMPING_ELIGIBILITY_FILL_LAYER_ID)};
      var DISPERSED_CAMPING_OUTLINE_LAYER_ID = ${JSON.stringify(DISPERSED_CAMPING_ELIGIBILITY_OUTLINE_LAYER_ID)};
      var DISPERSED_CAMPING_MESSAGE_TYPE = ${JSON.stringify(SET_DISPERSED_CAMPING_LAYER_ENABLED)};
      var DISPERSED_CAMPING_SELECTED_MESSAGE_TYPE = ${JSON.stringify(DISPERSED_CAMPING_REGION_SELECTED)};
      var ESTABLISHED_CAMPSITES_SOURCE_ID = ${JSON.stringify(ESTABLISHED_CAMPSITES_SOURCE_ID)};
      var ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID = ${JSON.stringify(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID)};
      var ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID = ${JSON.stringify(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID)};
      var ESTABLISHED_CAMPSITES_MESSAGE_TYPE = ${JSON.stringify(SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED)};
      var ESTABLISHED_CAMPSITE_SELECTED_MESSAGE_TYPE = ${JSON.stringify(ESTABLISHED_CAMPSITE_SELECTED)};
      var ESTABLISHED_CAMPSITE_ICON_ID = 'ecs-established-campsite-tent-icon';
      var ESTABLISHED_CAMPSITE_CLUSTER_ICON_ID = 'ecs-established-campsite-cluster-spacer';

      function send(type, payload) {
        try {
          if (RNW && RNW.postMessage) {
            RNW.postMessage(JSON.stringify({
              type: type,
              payload: payload || null,
              instanceKey: mapInstanceKey
            }));
          }
        } catch (e) {}
      }

      function sendLog(msg) {
        send('log', msg);
      }

      function sendCampScoutDebug(msg) {
        if (campScoutDebugEnabled) {
          sendLog(msg);
        }
      }

      function sendCampLayerDebug(eventName, details) {
        if (!campLayerDebugEnabled) return;
        try {
          sendLog('[CAMP_LAYER_DEBUG] ' + JSON.stringify({
            event: eventName,
            details: details || {}
          }));
        } catch (e) {
          sendLog('[CAMP_LAYER_DEBUG] ' + String(eventName || 'unknown_event'));
        }
      }

      function geoJsonFeatureCount(geojson) {
        return geojson && geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)
          ? geojson.features.length
          : 0;
      }

      function mapLayerExists(layerId) {
        try {
          return !!(map && map.getLayer(layerId));
        } catch (e) {
          return false;
        }
      }

      function mapSourceExists(sourceId) {
        try {
          return !!(map && map.getSource(sourceId));
        } catch (e) {
          return false;
        }
      }

      function mapLayerVisible(layerId) {
        try {
          if (!map || !map.getLayer(layerId)) return false;
          return map.getLayoutProperty(layerId, 'visibility') !== 'none';
        } catch (e) {
          return false;
        }
      }

      function nearlyEqual(a, b) {
        if (typeof a !== 'number' || typeof b !== 'number') return false;
        return Math.abs(a - b) <= ${CAMERA_EPSILON};
      }

      function sameCenter(a, b) {
        if (!a || !b) return false;
        return nearlyEqual(a.latitude, b.latitude) && nearlyEqual(a.longitude, b.longitude);
      }

      function normalizeCameraNumber(value, min, max) {
        if (typeof value !== 'number' || !isFinite(value)) return null;
        if (typeof min === 'number' && value < min) return min;
        if (typeof max === 'number' && value > max) return max;
        return value;
      }

      function normalizeCameraBearing(value) {
        if (typeof value !== 'number' || !isFinite(value)) return null;
        var wrapped = value % 360;
        if (wrapped < 0) wrapped += 360;
        return wrapped;
      }

      function normalizeCameraOffset(offset) {
        if (!Array.isArray(offset) || offset.length < 2) return null;
        var x = Number(offset[0]);
        var y = Number(offset[1]);
        if (!isFinite(x) || !isFinite(y)) return null;
        return [x, y];
      }

      function bearingDelta(a, b) {
        var delta = Math.abs(a - b) % 360;
        return delta > 180 ? 360 - delta : delta;
      }

      function normalizeCameraCommand(command) {
        if (!command) return null;
        return {
          mode: command.mode || null,
          center: command.center ? {
            latitude: Number(command.center.latitude),
            longitude: Number(command.center.longitude)
          } : null,
          zoom: typeof command.zoom === 'number' ? Number(command.zoom) : null,
          pitch: normalizeCameraNumber(command.pitch, 0, 80),
          bearing: normalizeCameraBearing(command.bearing),
          offset: normalizeCameraOffset(command.offset),
          fitBounds: command.fitBounds ? {
            north: Number(command.fitBounds.north),
            south: Number(command.fitBounds.south),
            east: Number(command.fitBounds.east),
            west: Number(command.fitBounds.west),
            padding: typeof command.fitBounds.padding === 'number' ? command.fitBounds.padding : 48,
            maxZoom: typeof command.fitBounds.maxZoom === 'number' ? command.fitBounds.maxZoom : 15,
          } : null,
          durationMs: typeof command.durationMs === 'number' ? command.durationMs : 500,
          animate: command.animate !== false,
          reason: command.reason || null,
        };
      }

      function buildCameraKey(command) {
        if (!command) return '';
        return JSON.stringify({
          mode: command.mode || null,
          center: command.center ? {
            latitude: Number((command.center.latitude || 0).toFixed(5)),
            longitude: Number((command.center.longitude || 0).toFixed(5)),
          } : null,
          zoom: typeof command.zoom === 'number' ? Number(command.zoom.toFixed(3)) : null,
          pitch: typeof command.pitch === 'number' ? Number(command.pitch.toFixed(2)) : null,
          bearing: typeof command.bearing === 'number' ? Number(command.bearing.toFixed(2)) : null,
          offset: Array.isArray(command.offset) ? [
            Number((command.offset[0] || 0).toFixed(1)),
            Number((command.offset[1] || 0).toFixed(1))
          ] : null,
          fitBounds: command.fitBounds ? {
            north: Number(command.fitBounds.north.toFixed(5)),
            south: Number(command.fitBounds.south.toFixed(5)),
            east: Number(command.fitBounds.east.toFixed(5)),
            west: Number(command.fitBounds.west.toFixed(5)),
            padding: command.fitBounds.padding || 48,
            maxZoom: command.fitBounds.maxZoom || 15,
          } : null,
          durationMs: command.durationMs || 500,
          animate: command.animate !== false,
          reason: command.reason || null,
        });
      }

      sendLog('HTML SCRIPT STARTED');

      if (typeof mapboxgl === 'undefined') {
        sendLog('mapboxgl NOT LOADED');
        send('mapReady', { ok: false, reason: 'mapboxgl_missing' });
        return;
      }

      mapboxgl.accessToken = ${escapedToken};

      var map = null;
      var initialized = false;
      var bootstrapDone = false;
      var pendingPayload = null;
      var bootstrapReadyTimer = null;
      var requestedStyleUrl = ${escapedInitialStyleUrl};
      var fallbackStyleUrls = ${escapedFallbackStyleUrls};
      var activeStyleUrl = ${escapedInitialStyleUrl};
      var attemptedStyles = Object.create(null);
      attemptedStyles[activeStyleUrl] = true;
      var lastAppliedStyleUrl = activeStyleUrl;
      var activeCameraMode = null;
      var lastCameraCommandKey = '';
      var campLayerStateVersion = 0;
      var dispersedCampingEligibilityState = { enabled: false, geojson: null, version: 0, appliedVersion: 0 };
      var dispersedCampingLayerHandlersAttached = false;
      var dispersedCampingMapTapSuppressUntil = 0;
      var establishedCampsitesState = { enabled: false, geojson: null, version: 0, appliedVersion: 0 };
      var establishedCampsitesLayerHandlersAttached = false;

      function isMapStyleReady() {
        try {
          return !!(map && map.isStyleLoaded && map.isStyleLoaded());
        } catch (e) {
          return false;
        }
      }

      function getNextFallbackStyle(failedStyleUrl) {
        var candidates = [requestedStyleUrl].concat(fallbackStyleUrls || []);
        for (var i = 0; i < candidates.length; i++) {
          var candidate = candidates[i];
          if (!candidate) continue;
          if (candidate === failedStyleUrl) continue;
          if (attemptedStyles[candidate]) continue;
          return candidate;
        }
        return null;
      }

      function applyFallbackStyle(failedStyleUrl) {
        var nextStyle = getNextFallbackStyle(failedStyleUrl);
        if (!nextStyle || !map) {
          send('styleFallbackExhausted', { failedStyleUrl: failedStyleUrl || null });
          return false;
        }

        attemptedStyles[nextStyle] = true;
        activeStyleUrl = nextStyle;
        lastAppliedStyleUrl = nextStyle;
        sendLog('style fallback → ' + nextStyle);

        try {
          map.setStyle(nextStyle);
          return true;
        } catch (e) {
          sendLog('style fallback setStyle failed: ' + String(e && e.message ? e.message : e));
          return false;
        }
      }

      function featureCollection(features) {
        return { type: 'FeatureCollection', features: features || [] };
      }

      function lineFeature(id, coordinates, props) {
        return {
          type: 'Feature',
          id: id,
          properties: props || {},
          geometry: { type: 'LineString', coordinates: coordinates || [] }
        };
      }

      function pointFeature(id, coordinate, props) {
        return {
          type: 'Feature',
          id: id,
          properties: props || {},
          geometry: { type: 'Point', coordinates: coordinate || [0, 0] }
        };
      }

      function polygonFeature(id, coordinates, props) {
        return {
          type: 'Feature',
          id: id,
          properties: props || {},
          geometry: { type: 'Polygon', coordinates: [coordinates || []] }
        };
      }

      function safeRemoveMarkers(list) {
        try {
          (list || []).forEach(function(m) {
            try { m.remove(); } catch (e) {}
          });
        } catch (e) {}
      }

      var waypointMarkers = [];
      var bailoutMarkers = [];
      var pinMarkers = [];
      var campsiteMarkers = [];
      var campScoutMarkers = [];
      var tiltMarkers = [];
      var userMarker = null;
      var replayMarker = null;
      var roadClassTimer = null;
      var dragTimeout = null;
      var crosshairEl = document.getElementById('crosshair');
      var routeBuilderActive = false;
      var routeBuilderColor = '#65F0D4';
      var routeBuilderDraftSegments = [];
      var routeBuilderRawTraceSegments = [];
      var routeBuilderPointerId = null;
      var routeBuilderIsDrawing = false;
      var routeBuilderActiveSegmentId = null;
      var routeBuilderActiveRawSegmentId = null;
      var routeBuilderTraceSessionId = null;
      var routeBuilderPreferredFeatureKey = null;
      var routeBuilderLastSentAt = 0;
      var routeBuilderLastSnapSource = null;
      var routeBuilderPointerCount = 0;
      var routeBuilderSuppressClickUntil = 0;
      var routeBuilderLastGoodTracePoint = null;
      var routeBuilderFreeDrawMode = false;
      var routeBuilderGestureStartedAt = 0;
      var routeBuilderGesturePointCount = 0;
      var routeBuilderGestureStartPoint = null;
      var routeBuilderFreeModeNoticeSent = false;

      var ROUTE_BUILDER_SNAP_PX = 38;
      var ROUTE_BUILDER_STABLE_SNAP_PX = 56;
      var ROUTE_BUILDER_FINAL_SNAP_PX = 64;
      var ROUTE_BUILDER_FINAL_HIGH_AVG_PX = 24;
      var ROUTE_BUILDER_FINAL_MEDIUM_AVG_PX = 34;
      var ROUTE_BUILDER_FINAL_MIN_MATCH_RATIO = 0.55;
      var ROUTE_BUILDER_FINAL_AMBIGUOUS_DOMINANCE = 0.45;
      var ROUTE_BUILDER_FINAL_MIN_LENGTH_PX = 16;
      var ROUTE_BUILDER_APPEND_MIN_PX = 4;
      var ROUTE_BUILDER_SEND_INTERVAL_MS = 64;
      var ROUTE_BUILDER_EXTREME_JUMP_PX = 180;
      var ROUTE_BUILDER_EXTREME_MIN_POINTS = 5;
      var ROUTE_BUILDER_EXTREME_DIRECTION_DOT = -0.2;
      var ROUTE_BUILDER_LOW_CONFIDENCE_SNAP_PX = 42;
      var ROUTE_BUILDER_FEATURE_SWITCH_JUMP_PX = 96;
      var ROUTE_BUILDER_SNAP_FEATURE_SWITCH_PENALTY = 18;
      var ROUTE_BUILDER_SNAP_BEARING_PENALTY = 22;
      var ROUTE_BUILDER_FREE_MODE_MIN_POINTS = 6;
      var ROUTE_BUILDER_FREE_MODE_GRACE_MS = 1200;
      var ROUTE_BUILDER_FREE_MODE_MIN_DRAG_PX = 72;
      var ROUTE_BUILDER_FREE_MODE_NOTICE =
        'Build route mode is continuing off network until snapping resumes.';

      function mkMarker(className, lng, lat, clickPayload, rotation) {
        var el = document.createElement('div');
        el.className = className;

        if (className === 'marker-user') {
          var shell = document.createElement('div');
          shell.className = 'marker-user-shell';

          var pulse = document.createElement('div');
          pulse.className = 'marker-user-pulse';
          shell.appendChild(pulse);

          var rotor = document.createElement('div');
          rotor.className = 'marker-user-rotor';

          var headingChevron = document.createElement('div');
          headingChevron.className = 'marker-user-heading';
          rotor.appendChild(headingChevron);

          var core = document.createElement('div');
          core.className = 'marker-user-core';

          shell.appendChild(rotor);
          shell.appendChild(core);
          el.appendChild(shell);

          if (typeof rotation === 'number') {
            rotor.style.transform = 'rotate(' + rotation + 'deg)';
            rotor.style.transformOrigin = 'center center';
          }
        } else if (typeof rotation === 'number') {
          el.style.transform = 'rotate(' + rotation + 'deg)';
          el.style.transformOrigin = 'center center';
        }

        if (clickPayload) {
          el.addEventListener('click', function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', clickPayload);
          });
        }

        return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]);
      }

      function ensureSource(id, source) {
        if (!map.getSource(id)) {
          map.addSource(id, source);
          return true;
        }
        return false;
      }

      function ensureLineLayer(id, sourceId, color, width, opacity, dasharray) {
        if (!map.getLayer(id)) {
          map.addLayer({
            id: id,
            type: 'line',
            source: sourceId,
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': color,
              'line-width': width,
              'line-opacity': opacity
            }
          });

          if (dasharray) {
            map.setPaintProperty(id, 'line-dasharray', dasharray);
          }
        }
      }

      function ensureCircleLayer(id, sourceId, color, radius, opacity, strokeColor, strokeWidth) {
        if (!map.getLayer(id)) {
          map.addLayer({
            id: id,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-color': color,
              'circle-radius': radius,
              'circle-opacity': opacity,
              'circle-stroke-color': strokeColor || 'rgba(8,14,18,0.96)',
              'circle-stroke-width': strokeWidth == null ? 2 : strokeWidth
            }
          });
        }
      }

      function ensureFillLayer(id, sourceId, color, opacity) {
        if (!map.getLayer(id)) {
          map.addLayer({
            id: id,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': color,
              'fill-opacity': opacity
            }
          });
        }
      }

      function setGeoJson(sourceId, data) {
        var src = map.getSource(sourceId);
        if (src && src.setData) {
          src.setData(data);
          return true;
        }
        return false;
      }

      function removeMapLayer(layerId) {
        try {
          if (map && map.getLayer(layerId)) {
            map.removeLayer(layerId);
            return true;
          }
        } catch (e) {}
        return false;
      }

      function removeMapSource(sourceId) {
        try {
          if (map && map.getSource(sourceId)) {
            map.removeSource(sourceId);
            return true;
          }
        } catch (e) {}
        return false;
      }

      function getFirstExistingLayerId(layerIds) {
        for (var i = 0; i < layerIds.length; i++) {
          if (map.getLayer(layerIds[i])) return layerIds[i];
        }
        return undefined;
      }

      function removeDispersedCampingEligibilityLayer() {
        var removedOutline = removeMapLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID);
        var removedFill = removeMapLayer(DISPERSED_CAMPING_FILL_LAYER_ID);
        var removedSource = removeMapSource(DISPERSED_CAMPING_SOURCE_ID);
        if (removedOutline || removedFill || removedSource) {
          sendCampLayerDebug('layer_removed', {
            layer: 'dispersed_camping',
            sourceRemoved: removedSource,
            fillLayerRemoved: removedFill,
            outlineLayerRemoved: removedOutline
          });
        }
        sendCampLayerDebug('map_layer_removed', {
          layer: 'dispersed_camping',
          sourceId: DISPERSED_CAMPING_SOURCE_ID,
          fillLayerId: DISPERSED_CAMPING_FILL_LAYER_ID,
          outlineLayerId: DISPERSED_CAMPING_OUTLINE_LAYER_ID
        });
      }

      function removeEstablishedCampsitesLayer() {
        var removedSymbol = removeMapLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID);
        var removedBackplate = removeMapLayer(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID);
        var removedSource = removeMapSource(ESTABLISHED_CAMPSITES_SOURCE_ID);
        if (removedSymbol || removedBackplate || removedSource) {
          sendCampLayerDebug('layer_removed', {
            layer: 'established_campgrounds',
            sourceRemoved: removedSource,
            backplateLayerRemoved: removedBackplate,
            symbolLayerRemoved: removedSymbol
          });
        }
        sendCampLayerDebug('map_layer_removed', {
          layer: 'established_campgrounds',
          sourceId: ESTABLISHED_CAMPSITES_SOURCE_ID,
          backplateLayerId: ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID,
          symbolLayerId: ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID
        });
      }

      function ensureEstablishedCampsiteImages() {
        if (!map || !map.addImage || !map.hasImage) return;
        try {
          if (!map.hasImage(ESTABLISHED_CAMPSITE_ICON_ID)) {
            var canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            var ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 48, 48);
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.fillStyle = '#F2C24D';
              ctx.strokeStyle = 'rgba(8,14,18,0.95)';
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.moveTo(24, 8);
              ctx.lineTo(40, 36);
              ctx.lineTo(8, 36);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(24, 8);
              ctx.lineTo(24, 36);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(24, 18);
              ctx.lineTo(31, 36);
              ctx.lineTo(17, 36);
              ctx.closePath();
              ctx.fillStyle = 'rgba(8,14,18,0.9)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(8,14,18,0.8)';
              ctx.stroke();
              map.addImage(ESTABLISHED_CAMPSITE_ICON_ID, ctx.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
            }
          }
          if (!map.hasImage(ESTABLISHED_CAMPSITE_CLUSTER_ICON_ID)) {
            var spacer = document.createElement('canvas');
            spacer.width = 2;
            spacer.height = 2;
            var spacerCtx = spacer.getContext('2d');
            if (spacerCtx) {
              spacerCtx.clearRect(0, 0, 2, 2);
              map.addImage(ESTABLISHED_CAMPSITE_CLUSTER_ICON_ID, spacerCtx.getImageData(0, 0, 2, 2), { pixelRatio: 1 });
            }
          }
        } catch (e) {
          sendLog('established campsite image registration failed: ' + String(e && e.message ? e.message : e));
        }
      }

      function normalizeDispersedCampingGeoJson(geojson) {
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          sendCampLayerDebug('invalid_geojson', {
            layer: 'dispersed_camping',
            reason: 'expected_feature_collection',
            receivedType: geojson && geojson.type ? String(geojson.type) : typeof geojson
          });
          return featureCollection([]);
        }
        var accepted = geojson.features.filter(function(feature) {
          var geometryType = feature && feature.geometry ? feature.geometry.type : null;
          return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
        });
        if (accepted.length !== geojson.features.length) {
          sendCampLayerDebug('invalid_geojson_filtered', {
            layer: 'dispersed_camping',
            expectedGeometry: 'Polygon|MultiPolygon',
            inputFeatureCount: geojson.features.length,
            acceptedFeatureCount: accepted.length
          });
        }
        return featureCollection(accepted);
      }

      function normalizeEstablishedCampsitesGeoJson(geojson) {
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          sendCampLayerDebug('invalid_geojson', {
            layer: 'established_campgrounds',
            reason: 'expected_feature_collection',
            receivedType: geojson && geojson.type ? String(geojson.type) : typeof geojson
          });
          return featureCollection([]);
        }
        var accepted = geojson.features.filter(function(feature) {
          var geometryType = feature && feature.geometry ? feature.geometry.type : null;
          return geometryType === 'Point';
        });
        if (accepted.length !== geojson.features.length) {
          sendCampLayerDebug('invalid_geojson_filtered', {
            layer: 'established_campgrounds',
            expectedGeometry: 'Point',
            inputFeatureCount: geojson.features.length,
            acceptedFeatureCount: accepted.length
          });
        }
        return featureCollection(accepted);
      }

      function normalizeStringArray(value) {
        if (typeof value === 'string') {
          try {
            var parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              return parsed
                .map(function(item) { return String(item || '').trim(); })
                .filter(function(item) { return item.length > 0; });
            }
          } catch (e) {}
          return value.split(',').map(function(item) { return item.trim(); }).filter(function(item) { return item.length > 0; });
        }
        if (!Array.isArray(value)) return [];
        return value
          .map(function(item) { return String(item || '').trim(); })
          .filter(function(item) { return item.length > 0; });
      }

      function buildDispersedCampingSelectionPayload(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var regionId = String(props.id || feature.id || '').trim();
        if (!regionId) return null;
        return {
          regionId: regionId,
          name: props.name ? String(props.name) : undefined,
          landManager: String(props.landManager || 'UNKNOWN'),
          confidence: String(props.confidence || 'verify'),
          eligibilityLabel: String(props.eligibilityLabel || 'Verify locally'),
          basis: normalizeStringArray(props.basis),
          restrictions: normalizeStringArray(props.restrictions),
          sourceNames: normalizeStringArray(props.sourceNames),
          source: props.source ? String(props.source) : undefined,
          sourceProvider: props.sourceProvider ? String(props.sourceProvider) : undefined,
          sourceUpdatedAt: props.sourceUpdatedAt ? String(props.sourceUpdatedAt) : undefined,
          requiresVerification: props.requiresVerification !== false
        };
      }

      function readEstablishedCampsiteNumber(value) {
        var numberValue = Number(value);
        return isFinite(numberValue) ? numberValue : undefined;
      }

      function readEstablishedCampsiteBoolean(value) {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return undefined;
      }

      function buildEstablishedCampsiteSelectionPayload(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var coordinates = feature && feature.geometry && Array.isArray(feature.geometry.coordinates)
          ? feature.geometry.coordinates
          : [];
        var campsiteId = String(props.id || feature.id || '').trim();
        var name = String(props.name || '').trim();
        var longitude = readEstablishedCampsiteNumber(coordinates[0]);
        var latitude = readEstablishedCampsiteNumber(coordinates[1]);
        if (!campsiteId || !name || typeof latitude !== 'number' || typeof longitude !== 'number') return null;
        return {
          id: campsiteId,
          name: name,
          latitude: latitude,
          longitude: longitude,
          campsiteType: String(props.campsiteType || 'unknown'),
          source: String(props.source || 'UNKNOWN'),
          feeStatus: String(props.feeStatus || 'unknown'),
          reservationStatus: String(props.reservationStatus || 'unknown'),
          amenities: normalizeStringArray(props.amenities),
          type: props.type ? String(props.type) : 'established_campground',
          category: props.category ? String(props.category) : 'campground',
          managingAgency: props.managingAgency ? String(props.managingAgency) : undefined,
          managingOrg: props.managingOrg ? String(props.managingOrg) : undefined,
          reservationUrl: props.reservationUrl ? String(props.reservationUrl) : undefined,
          detailUrl: props.detailUrl ? String(props.detailUrl) : undefined,
          status: props.status ? String(props.status) : 'unknown',
          availabilityStatus: props.availabilityStatus ? String(props.availabilityStatus) : 'unknown',
          siteCount: readEstablishedCampsiteNumber(props.siteCount),
          siteTypes: normalizeStringArray(props.siteTypes),
          sourceConfidence: readEstablishedCampsiteNumber(props.sourceConfidence),
          primaryProvider: props.primaryProvider ? String(props.primaryProvider) : undefined,
          attribution: props.attribution ? String(props.attribution) : undefined,
          lastSyncedAt: props.lastSyncedAt ? String(props.lastSyncedAt) : undefined,
          lastAvailabilityCheckedAt: props.lastAvailabilityCheckedAt ? String(props.lastAvailabilityCheckedAt) : undefined,
          lastVerifiedAt: props.lastVerifiedAt ? String(props.lastVerifiedAt) : undefined,
          operatorName: props.operatorName ? String(props.operatorName) : undefined,
          bookingUrl: props.bookingUrl ? String(props.bookingUrl) : undefined,
          phone: props.phone ? String(props.phone) : undefined,
          seasonDescription: props.seasonDescription ? String(props.seasonDescription) : undefined,
          openingHours: props.openingHours ? String(props.openingHours) : undefined,
          maxVehicleLengthFt: readEstablishedCampsiteNumber(props.maxVehicleLengthFt),
          tentAllowed: readEstablishedCampsiteBoolean(props.tentAllowed),
          rvAllowed: readEstablishedCampsiteBoolean(props.rvAllowed),
          trailersAllowed: readEstablishedCampsiteBoolean(props.trailersAllowed),
          sourceUpdatedAt: props.sourceUpdatedAt ? String(props.sourceUpdatedAt) : undefined,
          requiresVerification: true
        };
      }

      function handleEstablishedCampsiteLayerClick(event) {
        try {
          if (event && event.originalEvent && event.originalEvent.stopPropagation) {
            event.originalEvent.stopPropagation();
          }
          if (event && event.preventDefault) {
            event.preventDefault();
          }
        } catch (e) {}
        var feature = event && event.features && event.features.length ? event.features[0] : null;
        var payload = buildEstablishedCampsiteSelectionPayload(feature);
        if (payload) {
          send(ESTABLISHED_CAMPSITE_SELECTED_MESSAGE_TYPE, payload);
        }
      }

      function attachEstablishedCampsiteLayerHandlers() {
        if (establishedCampsitesLayerHandlersAttached || !map) return;
        establishedCampsitesLayerHandlersAttached = true;
        try {
          map.on('click', ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, handleEstablishedCampsiteLayerClick);
          map.on('click', ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID, handleEstablishedCampsiteLayerClick);
          map.on('mouseenter', ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, function() {
            try { map.getCanvas().style.cursor = 'pointer'; } catch (e) {}
          });
          map.on('mouseleave', ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, function() {
            try { map.getCanvas().style.cursor = ''; } catch (e) {}
          });
        } catch (e) {
          establishedCampsitesLayerHandlersAttached = false;
        }
      }

      function handleDispersedCampingLayerClick(event) {
        try {
          if (event && event.originalEvent && event.originalEvent.stopPropagation) {
            event.originalEvent.stopPropagation();
          }
          if (event && event.preventDefault) {
            event.preventDefault();
          }
        } catch (e) {}
        dispersedCampingMapTapSuppressUntil = Date.now() + 350;
        var feature = event && event.features && event.features.length ? event.features[0] : null;
        var payload = buildDispersedCampingSelectionPayload(feature);
        if (payload) {
          send(DISPERSED_CAMPING_SELECTED_MESSAGE_TYPE, payload);
        }
      }

      function attachDispersedCampingLayerHandlers() {
        if (dispersedCampingLayerHandlersAttached || !map) return;
        dispersedCampingLayerHandlersAttached = true;
        try {
          map.on('click', DISPERSED_CAMPING_FILL_LAYER_ID, handleDispersedCampingLayerClick);
          map.on('click', DISPERSED_CAMPING_OUTLINE_LAYER_ID, handleDispersedCampingLayerClick);
          map.on('mouseenter', DISPERSED_CAMPING_FILL_LAYER_ID, function() {
            try { map.getCanvas().style.cursor = 'pointer'; } catch (e) {}
          });
          map.on('mouseleave', DISPERSED_CAMPING_FILL_LAYER_ID, function() {
            try { map.getCanvas().style.cursor = ''; } catch (e) {}
          });
        } catch (e) {
          dispersedCampingLayerHandlersAttached = false;
        }
      }

      function ensureDispersedCampingEligibilityLayer(geojson) {
        if (!isMapStyleReady()) return false;
        var data = normalizeDispersedCampingGeoJson(geojson);
        var sourceCreated = ensureSource(DISPERSED_CAMPING_SOURCE_ID, { type: 'geojson', data: data });
        if (sourceCreated) {
          sendCampLayerDebug('source_created', {
            layer: 'dispersed_camping',
            sourceId: DISPERSED_CAMPING_SOURCE_ID,
            featureCount: geoJsonFeatureCount(data)
          });
        }
        var sourceDataSet = setGeoJson(DISPERSED_CAMPING_SOURCE_ID, data);
        if (sourceDataSet) {
          sendCampLayerDebug('source_set_data', {
            layer: 'dispersed_camping',
            sourceId: DISPERSED_CAMPING_SOURCE_ID,
            featureCount: geoJsonFeatureCount(data)
          });
        }

        var beforeRouteLayer = getFirstExistingLayerId([
          ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID,
          ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID,
          CAMP_SCOUT_LAYER_ID,
          'route-layer',
          'route-progress-layer',
          'segment-layer',
          'trail-layer',
        ]);

        if (!map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID)) {
          map.addLayer({
            id: DISPERSED_CAMPING_FILL_LAYER_ID,
            type: 'fill',
            source: DISPERSED_CAMPING_SOURCE_ID,
            paint: {
              'fill-color': [
                'match',
                ['get', 'confidence'],
                'high', '#A9B85F',
                'medium', '#D4A017',
                'verify', '#F2C24D',
                'restricted', '#C66A4A',
                '#D4A017'
              ],
              'fill-opacity': [
                'case',
                ['==', ['get', 'routeNearby'], true],
                [
                  'match',
                  ['get', 'confidence'],
                  'high', 0.42,
                  'medium', 0.31,
                  'verify', 0.16,
                  'restricted', 0.06,
                  0.2
                ],
                [
                  'match',
                  ['get', 'confidence'],
                  'high', 0.28,
                  'medium', 0.2,
                  'verify', 0.08,
                  'restricted', 0.06,
                  0.12
                ]
              ]
            }
          }, beforeRouteLayer);
        }

        if (!map.getLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID)) {
          map.addLayer({
            id: DISPERSED_CAMPING_OUTLINE_LAYER_ID,
            type: 'line',
            source: DISPERSED_CAMPING_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': [
                'case',
                ['==', ['get', 'routeNearby'], true],
                [
                  'match',
                  ['get', 'confidence'],
                  'high', '#E2D36A',
                  'medium', '#F2C24D',
                  'verify', '#F2C24D',
                  'restricted', '#E05E4F',
                  '#F2C24D'
                ],
                [
                  'match',
                  ['get', 'confidence'],
                  'high', '#D0C36A',
                  'medium', '#F2C24D',
                  'verify', '#F2C24D',
                  'restricted', '#E05E4F',
                  '#F2C24D'
                ]
              ],
              'line-width': [
                'case',
                ['==', ['get', 'routeNearby'], true],
                [
                  'match',
                  ['get', 'confidence'],
                  'verify', 3.1,
                  'restricted', 2.8,
                  2.6
                ],
                [
                  'match',
                  ['get', 'confidence'],
                  'verify', 2.6,
                  'restricted', 2.8,
                  1.7
                ]
              ],
              'line-opacity': [
                'match',
                ['get', 'confidence'],
                'restricted', 0.94,
                0.78
              ]
            }
          }, beforeRouteLayer);
        }

        attachDispersedCampingLayerHandlers();
        sendCampLayerDebug('map_source_update', {
          layer: 'dispersed_camping',
          sourceId: DISPERSED_CAMPING_SOURCE_ID,
          fillLayerId: DISPERSED_CAMPING_FILL_LAYER_ID,
          outlineLayerId: DISPERSED_CAMPING_OUTLINE_LAYER_ID,
          featureCount: geoJsonFeatureCount(data),
          sourcePresent: mapSourceExists(DISPERSED_CAMPING_SOURCE_ID),
          fillLayerPresent: mapLayerExists(DISPERSED_CAMPING_FILL_LAYER_ID),
          outlineLayerPresent: mapLayerExists(DISPERSED_CAMPING_OUTLINE_LAYER_ID),
          fillLayerVisible: mapLayerVisible(DISPERSED_CAMPING_FILL_LAYER_ID),
          outlineLayerVisible: mapLayerVisible(DISPERSED_CAMPING_OUTLINE_LAYER_ID),
          insertedBefore: beforeRouteLayer || null
        });
        return true;
      }

      function ensureEstablishedCampsitesLayer(geojson) {
        if (!isMapStyleReady()) return false;
        var data = normalizeEstablishedCampsitesGeoJson(geojson);
        ensureEstablishedCampsiteImages();
        if (!map.getSource(ESTABLISHED_CAMPSITES_SOURCE_ID)) {
          map.addSource(ESTABLISHED_CAMPSITES_SOURCE_ID, {
            type: 'geojson',
            data: data,
            cluster: true,
            clusterMaxZoom: 9,
            clusterRadius: 42
          });
          sendCampLayerDebug('source_created', {
            layer: 'established_campgrounds',
            sourceId: ESTABLISHED_CAMPSITES_SOURCE_ID,
            featureCount: geoJsonFeatureCount(data)
          });
          sendCampLayerDebug('source_set_data', {
            layer: 'established_campgrounds',
            sourceId: ESTABLISHED_CAMPSITES_SOURCE_ID,
            featureCount: geoJsonFeatureCount(data)
          });
        } else {
          if (setGeoJson(ESTABLISHED_CAMPSITES_SOURCE_ID, data)) {
            sendCampLayerDebug('source_set_data', {
              layer: 'established_campgrounds',
              sourceId: ESTABLISHED_CAMPSITES_SOURCE_ID,
              featureCount: geoJsonFeatureCount(data)
            });
          }
        }

        var beforePinnedLayer = getFirstExistingLayerId([
          'route-layer',
          'route-progress-layer',
          'segment-layer',
          'trail-layer',
          CAMP_SCOUT_LAYER_ID,
        ]);

        if (!map.getLayer(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID)) {
          map.addLayer({
            id: ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID,
            type: 'circle',
            source: ESTABLISHED_CAMPSITES_SOURCE_ID,
            paint: {
              'circle-color': [
                'case',
                ['has', 'point_count'],
                'rgba(8,14,18,0.92)',
                ['==', ['get', 'feeStatus'], 'paid'],
                'rgba(242,194,77,0.86)',
                'rgba(8,14,18,0.88)'
              ],
              'circle-radius': [
                'case',
                ['has', 'point_count'],
                15,
                10
              ],
              'circle-stroke-color': '#F2C24D',
              'circle-stroke-width': [
                'case',
                ['has', 'point_count'],
                2,
                1.6
              ],
              'circle-opacity': 0.94
            }
          }, beforePinnedLayer);
        }

        if (!map.getLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID)) {
          map.addLayer({
            id: ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID,
            type: 'symbol',
            source: ESTABLISHED_CAMPSITES_SOURCE_ID,
            layout: {
              'icon-image': [
                'case',
                ['has', 'point_count'],
                ESTABLISHED_CAMPSITE_CLUSTER_ICON_ID,
                ESTABLISHED_CAMPSITE_ICON_ID
              ],
              'icon-size': [
                'case',
                ['has', 'point_count'],
                1,
                0.72
              ],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'text-field': [
                'case',
                ['has', 'point_count'],
                ['to-string', ['get', 'point_count_abbreviated']],
                ['coalesce', ['get', 'name'], ['get', 'title'], 'Campground']
              ],
              'text-size': [
                'case',
                ['has', 'point_count'],
                10,
                10.5
              ],
              'text-offset': [
                'case',
                ['has', 'point_count'],
                ['literal', [0, 0]],
                ['literal', [0, 1.35]]
              ],
              'text-anchor': [
                'case',
                ['has', 'point_count'],
                'center',
                'top'
              ],
              'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
              'text-max-width': 12,
              'text-optional': true,
              'text-allow-overlap': false,
              'text-ignore-placement': false
            },
            paint: {
              'text-color': [
                'case',
                ['has', 'point_count'],
                '#F7E6A6',
                '#F7E6A6'
              ],
              'text-halo-color': 'rgba(8,14,18,0.72)',
              'text-halo-width': [
                'case',
                ['has', 'point_count'],
                0.8,
                1
              ]
            }
          }, beforePinnedLayer);
        }

        attachEstablishedCampsiteLayerHandlers();
        sendCampLayerDebug('map_source_update', {
          layer: 'established_campgrounds',
          sourceId: ESTABLISHED_CAMPSITES_SOURCE_ID,
          backplateLayerId: ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID,
          symbolLayerId: ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID,
          featureCount: geoJsonFeatureCount(data),
          sourcePresent: mapSourceExists(ESTABLISHED_CAMPSITES_SOURCE_ID),
          backplateLayerPresent: mapLayerExists(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID),
          symbolLayerPresent: mapLayerExists(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID),
          backplateLayerVisible: mapLayerVisible(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID),
          symbolLayerVisible: mapLayerVisible(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID),
          iconRegistered: !!(map && map.hasImage && map.hasImage(ESTABLISHED_CAMPSITE_ICON_ID)),
          insertedBefore: beforePinnedLayer || null
        });
        return true;
      }

      function setDispersedCampingEligibilityLayerEnabled(payload) {
        var enabled = !!(payload && payload.enabled);
        var geojson = payload && payload.geojson ? payload.geojson : null;
        campLayerStateVersion += 1;
        dispersedCampingEligibilityState = {
          enabled: enabled,
          geojson: geojson,
          version: campLayerStateVersion,
          appliedVersion: dispersedCampingEligibilityState.appliedVersion || 0
        };
        sendCampLayerDebug('layer_toggle_received', {
          layer: 'dispersed_camping',
          enabled: enabled,
          payloadFeatureCount: geoJsonFeatureCount(geojson),
          styleLoaded: isMapStyleReady(),
          version: dispersedCampingEligibilityState.version
        });

        applyDispersedCampingDesiredState('message');
      }

      function setEstablishedCampsitesLayerEnabled(payload) {
        var enabled = !!(payload && payload.enabled);
        var geojson = payload && payload.geojson ? payload.geojson : null;
        campLayerStateVersion += 1;
        establishedCampsitesState = {
          enabled: enabled,
          geojson: geojson,
          version: campLayerStateVersion,
          appliedVersion: establishedCampsitesState.appliedVersion || 0
        };
        sendCampLayerDebug('layer_toggle_received', {
          layer: 'established_campgrounds',
          enabled: enabled,
          payloadFeatureCount: geoJsonFeatureCount(geojson),
          styleLoaded: isMapStyleReady(),
          version: establishedCampsitesState.version
        });

        applyEstablishedCampsitesDesiredState('message');
      }

      function applyDispersedCampingDesiredState(reason) {
        var state = dispersedCampingEligibilityState;
        if (!state) {
          return false;
        }
        if (state.appliedVersion === state.version) {
          if (state.version > 0) {
            sendCampLayerDebug('skipped_stale_payload', {
              layer: 'dispersed_camping',
              reason: reason || null,
              version: state.version,
              appliedVersion: state.appliedVersion
            });
          }
          return false;
        }
        if (!isMapStyleReady()) {
          sendCampLayerDebug('queued_until_style_loaded', {
            layer: 'dispersed_camping',
            enabled: !!state.enabled,
            payloadFeatureCount: geoJsonFeatureCount(state.geojson),
            version: state.version,
            reason: reason || null
          });
          return false;
        }
        if (!state.enabled) {
          removeDispersedCampingEligibilityLayer();
          state.appliedVersion = state.version;
          if (reason === 'style_load') {
            sendCampLayerDebug('applied_after_style_load', {
              layer: 'dispersed_camping',
              enabled: false,
              payloadFeatureCount: geoJsonFeatureCount(state.geojson),
              version: state.version
            });
          }
          return true;
        }
        if (ensureDispersedCampingEligibilityLayer(state.geojson)) {
          state.appliedVersion = state.version;
          if (reason === 'style_load') {
            sendCampLayerDebug('applied_after_style_load', {
              layer: 'dispersed_camping',
              enabled: true,
              payloadFeatureCount: geoJsonFeatureCount(state.geojson),
              version: state.version
            });
          }
          return true;
        }
        return false;
      }

      function applyEstablishedCampsitesDesiredState(reason) {
        var state = establishedCampsitesState;
        if (!state) {
          return false;
        }
        if (state.appliedVersion === state.version) {
          if (state.version > 0) {
            sendCampLayerDebug('skipped_stale_payload', {
              layer: 'established_campgrounds',
              reason: reason || null,
              version: state.version,
              appliedVersion: state.appliedVersion
            });
          }
          return false;
        }
        if (!isMapStyleReady()) {
          sendCampLayerDebug('queued_until_style_loaded', {
            layer: 'established_campgrounds',
            enabled: !!state.enabled,
            payloadFeatureCount: geoJsonFeatureCount(state.geojson),
            version: state.version,
            reason: reason || null
          });
          return false;
        }
        if (!state.enabled) {
          removeEstablishedCampsitesLayer();
          state.appliedVersion = state.version;
          if (reason === 'style_load') {
            sendCampLayerDebug('applied_after_style_load', {
              layer: 'established_campgrounds',
              enabled: false,
              payloadFeatureCount: geoJsonFeatureCount(state.geojson),
              version: state.version
            });
          }
          return true;
        }
        if (ensureEstablishedCampsitesLayer(state.geojson)) {
          state.appliedVersion = state.version;
          if (reason === 'style_load') {
            sendCampLayerDebug('applied_after_style_load', {
              layer: 'established_campgrounds',
              enabled: true,
              payloadFeatureCount: geoJsonFeatureCount(state.geojson),
              version: state.version
            });
          }
          return true;
        }
        return false;
      }

      function getCampScoutSourceColorExpression() {
        return [
          'match',
          ['get', 'sourceType'],
          'official_mapped',
          '#8FD694',
          'community_suggested',
          '#65C97A',
          'imported_route_context',
          '#86B8FF',
          'ecs_inferred',
          '#D4A017',
          '#D4A017',
        ];
      }

      function ensureCampScoutPinLayer() {
        ensureSource(CAMP_SCOUT_SOURCE_ID, { type: 'geojson', data: featureCollection([]) });
        if (!map.getLayer(CAMP_SCOUT_LAYER_ID)) {
          map.addLayer({
            id: CAMP_SCOUT_LAYER_ID,
            type: 'circle',
            source: CAMP_SCOUT_SOURCE_ID,
            layout: {
              visibility: 'visible',
            },
            paint: {
              'circle-color': getCampScoutSourceColorExpression(),
              'circle-radius': ['case', ['==', ['get', 'selected'], true], 10, 7],
              'circle-opacity': 0.9,
              'circle-stroke-color': '#F2C24D',
              'circle-stroke-width': 2,
              'circle-stroke-opacity': 0.96,
            },
          });
        } else {
          try {
            map.setLayoutProperty(CAMP_SCOUT_LAYER_ID, 'visibility', 'visible');
          } catch (e) {}
        }
      }

      function campScoutPinFeature(item) {
        if (
          !item ||
          typeof item.latitude !== 'number' ||
          typeof item.longitude !== 'number' ||
          !Number.isFinite(item.latitude) ||
          !Number.isFinite(item.longitude)
        ) {
          return null;
        }

        var sourceType = item.sourceType || 'unknown';
        var confidence = item.confidenceLabel || item.confidenceGrade || 'D';
        var legalityStatus = item.legalityStatus || 'unknown_needs_verification';
        return pointFeature(item.id || ('camp-scout-' + String(item.latitude) + ':' + String(item.longitude)), [item.longitude, item.latitude], {
          id: item.id || null,
          title: item.title || 'Camp candidate',
          source: sourceType,
          sourceType: sourceType,
          confidence: confidence,
          confidenceScore: typeof item.confidenceScore === 'number' && Number.isFinite(item.confidenceScore) ? item.confidenceScore : 0,
          confidenceLabel: confidence,
          legalityStatus: legalityStatus,
          selected: !!item.selected,
          rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : null,
          rankLabel: item.rankLabel || null,
          warnings: Array.isArray(item.warnings) ? item.warnings : [],
          reasons: Array.isArray(item.reasons) ? item.reasons : [],
          distanceFromRoadOrTrail:
            typeof item.distanceFromRoadOrTrail === 'number' && Number.isFinite(item.distanceFromRoadOrTrail)
              ? item.distanceFromRoadOrTrail
              : null,
          slope: typeof item.slope === 'number' && Number.isFinite(item.slope) ? item.slope : null,
          accessNotes: typeof item.accessNotes === 'string' ? item.accessNotes : null,
        });
      }

      function updateCampScoutPinLayer(items) {
        ensureCampScoutPinLayer();
        var candidates = (items || []).slice(0, 10);
        var features = candidates
          .map(function(item) { return campScoutPinFeature(item); })
          .filter(function(feature) { return !!feature; });
        setGeoJson(CAMP_SCOUT_SOURCE_ID, featureCollection(features));

        var firstCoords = features.slice(0, 3).map(function(feature) {
          return feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : null;
        });
        var mapLoaded = false;
        var styleLoaded = false;
        try {
          mapLoaded = !!(map && map.loaded && map.loaded());
        } catch (e) {}
        try {
          styleLoaded = !!(map && map.isStyleLoaded && map.isStyleLoaded());
        } catch (e) {}
        sendCampScoutDebug(
          '[CAMP_SCOUT_DEBUG] mapbox_pin_layer candidateCount=' +
            candidates.length +
            ' featureCount=' +
            features.length +
            ' sourceId=' +
            CAMP_SCOUT_SOURCE_ID +
            ' layerId=' +
            CAMP_SCOUT_LAYER_ID +
            ' first3=' +
            JSON.stringify(firstCoords) +
            ' mapLoaded=' +
            String(mapLoaded) +
            ' styleLoaded=' +
            String(styleLoaded)
        );
      }

      function cloneBuilderSegments(segments) {
        function cloneLine(coordinates) {
          return (coordinates || [])
            .filter(function(coord) {
              return coord && coord.length >= 2 && isFinite(coord[0]) && isFinite(coord[1]);
            })
            .map(function(coord) { return [Number(coord[0]), Number(coord[1])]; });
        }
        return (segments || [])
          .map(function(segment, index) {
            return {
              id: String(segment.id || ('draft-' + index)),
              coordinates: cloneLine(segment.coordinates || []),
              rawSegment: cloneLine(segment.rawSegment || []),
              snappedSegment: cloneLine(segment.snappedSegment || []),
              snapConfidence: segment.snapConfidence || null,
              snapSource: segment.snapSource || null,
              snapStatus: segment.snapStatus || null,
              snapMessage: segment.snapMessage || null
            };
          })
          .filter(function(segment) { return segment.coordinates.length > 0; });
      }

      function builderPointCount() {
        return routeBuilderDraftSegments.reduce(function(total, segment) {
          return total + (segment.coordinates ? segment.coordinates.length : 0);
        }, 0);
      }

      function resetRouteBuilderTraceRecovery() {
        routeBuilderLastGoodTracePoint = null;
        routeBuilderFreeDrawMode = false;
        routeBuilderRawTraceSegments = [];
        routeBuilderActiveRawSegmentId = null;
        routeBuilderTraceSessionId = null;
        routeBuilderGestureStartedAt = 0;
        routeBuilderGesturePointCount = 0;
        routeBuilderGestureStartPoint = null;
        routeBuilderFreeModeNoticeSent = false;
      }

      function getLastGoodTracePoint() {
        return routeBuilderLastGoodTracePoint;
      }

      function updateLastGoodTracePoint(tracePoint) {
        if (!tracePoint || !tracePoint.coordinate || !routeBuilderActiveSegmentId) return;
        var segment = routeBuilderDraftSegments.find(function(item) {
          return item.id === routeBuilderActiveSegmentId;
        });
        if (!segment || !segment.coordinates || !segment.coordinates.length) return;
        routeBuilderLastGoodTracePoint = {
          coordinate: tracePoint.coordinate,
          segmentId: segment.id,
          pointIndex: segment.coordinates.length - 1,
          snapMode: tracePoint.snapMode || 'snapped',
          featureKey: tracePoint.featureKey || null,
          sourceLabel: tracePoint.sourceLabel || null
        };
      }

      function markLastGoodTracePoint(tracePoint) {
        updateLastGoodTracePoint(tracePoint);
      }

      function updateRouteBuilder(segments, color) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(segment) { return segment.coordinates && segment.coordinates.length > 1; })
            .map(function(segment) {
              return lineFeature(segment.id, segment.coordinates, { color: color || routeBuilderColor || '#65F0D4' });
            })
        );
        setGeoJson('route-builder-source', fc);

        var lastPoint = null;
        for (var i = (segments || []).length - 1; i >= 0; i--) {
          var segment = segments[i];
          if (segment && segment.coordinates && segment.coordinates.length > 0) {
            lastPoint = segment.coordinates[segment.coordinates.length - 1];
            break;
          }
        }
        setGeoJson(
          'route-builder-endpoint-source',
          featureCollection(lastPoint ? [pointFeature('route-builder-endpoint', lastPoint, { color: color || routeBuilderColor || '#65F0D4' })] : [])
        );
      }

      function lastRouteBuilderSnapMeta() {
        for (var i = routeBuilderDraftSegments.length - 1; i >= 0; i--) {
          var segment = routeBuilderDraftSegments[i];
          if (segment && segment.coordinates && segment.coordinates.length > 1) {
            return {
              snapConfidence: segment.snapConfidence || null,
              snapStatus: segment.snapStatus || null,
              snapMessage: segment.snapMessage || null
            };
          }
        }
        return { snapConfidence: null, snapStatus: null, snapMessage: null };
      }

      function updateCampsiteSearchPolygon(polygon) {
        var coordinates = polygon && polygon.coordinates ? polygon.coordinates : [];
        var closed = !!(polygon && polygon.closed);
        var lineCoords = coordinates || [];
        var fillCoords = [];
        if ((closed || coordinates.length >= 3) && coordinates.length >= 3) {
          fillCoords = coordinates.slice();
          var first = fillCoords[0];
          var last = fillCoords[fillCoords.length - 1];
          if (!last || first[0] !== last[0] || first[1] !== last[1]) {
            fillCoords.push(first);
          }
        }
        setGeoJson(
          'campsite-search-polygon-fill-source',
          featureCollection(fillCoords.length >= 4 ? [polygonFeature('campsite-search-polygon', fillCoords, {})] : [])
        );
        setGeoJson(
          'campsite-search-polygon-line-source',
          featureCollection(lineCoords.length > 1 ? [lineFeature('campsite-search-polygon-line', lineCoords, {})] : [])
        );
        setGeoJson(
          'campsite-search-polygon-point-source',
          featureCollection((coordinates || []).map(function(coord, index) {
            return pointFeature('campsite-search-polygon-point-' + index, coord, {});
          }))
        );
      }

      function sendRouteBuilderUpdate(force) {
        if (!routeBuilderActive) return;
        var now = Date.now();
        if (!force && now - routeBuilderLastSentAt < ROUTE_BUILDER_SEND_INTERVAL_MS) return;
        routeBuilderLastSentAt = now;
        send('routeBuilderUpdate', {
          segments: cloneBuilderSegments(routeBuilderDraftSegments),
          pointCount: builderPointCount(),
          isDrawing: routeBuilderIsDrawing,
          snapSource: routeBuilderLastSnapSource || null,
          snapConfidence: lastRouteBuilderSnapMeta().snapConfidence,
          snapStatus: lastRouteBuilderSnapMeta().snapStatus,
          snapMessage: lastRouteBuilderSnapMeta().snapMessage
        });
      }

      function setRouteBuilderDrawing(nextDrawing, snapSource) {
        if (routeBuilderIsDrawing === nextDrawing && routeBuilderLastSnapSource === (snapSource || null)) return;
        routeBuilderIsDrawing = nextDrawing;
        routeBuilderLastSnapSource = snapSource || null;
        send('routeBuilderGesture', {
          isDrawing: routeBuilderIsDrawing,
          snapSource: routeBuilderLastSnapSource
        });
      }

      function reinitializeStyleArtifacts() {
        ensureSource('route-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-progress-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('segment-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('trail-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('speed-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('ecs-remote-v1', { type: 'geojson', data: featureCollection([]) });
        ensureSource('ecs-remote-forecast-v1', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-builder-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-builder-endpoint-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-fill-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-line-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-point-source', { type: 'geojson', data: featureCollection([]) });

        ensureFillLayer(
          'ecs-remote-heatmap-fill',
          'ecs-remote-v1',
          ['match', ['get', 'label'], 'A', '#C66A4A', 'B', '#F2C24D', 'C', '#65C97A', 'D', '#5FD1FF', '#5FD1FF'],
          0.42
        );
        ensureLineLayer('route-layer', 'route-source', ['get', 'color'], 5, 0.95);
        ensureLineLayer('route-progress-layer', 'route-progress-source', ['get', 'color'], 6, 0.98);
        ensureLineLayer('segment-layer', 'segment-source', ['get', 'color'], 4, 0.92);
        ensureLineLayer('trail-layer', 'trail-source', ['get', 'color'], 3.5, 0.9);
        ensureLineLayer('speed-layer', 'speed-source', ['get', 'color'], 2.25, 0.85, [1, 1]);
        ensureLineLayer('ecs-remote-forecast-line', 'ecs-remote-forecast-v1', ['get', 'color'], 4, 0.96, [1.4, 1.2]);
        ensureLineLayer('route-builder-halo-layer', 'route-builder-source', ['get', 'color'], 12, 0.22);
        ensureLineLayer('route-builder-layer', 'route-builder-source', ['get', 'color'], 5.25, 0.98);
        ensureCircleLayer('route-builder-endpoint-halo-layer', 'route-builder-endpoint-source', ['get', 'color'], 9, 0.18, 'rgba(8,14,18,0.92)', 2);
        ensureCircleLayer('route-builder-endpoint-layer', 'route-builder-endpoint-source', ['get', 'color'], 4.75, 0.96, 'rgba(8,14,18,0.96)', 2);
        ensureFillLayer('campsite-search-polygon-fill-layer', 'campsite-search-polygon-fill-source', 'rgba(242,194,77,1)', 0.16);
        ensureLineLayer('campsite-search-polygon-line-layer', 'campsite-search-polygon-line-source', 'rgba(242,194,77,0.95)', 2.5, 0.86, [2, 1.4]);
        ensureCircleLayer('campsite-search-polygon-point-layer', 'campsite-search-polygon-point-source', 'rgba(242,194,77,0.92)', 4.2, 0.95, 'rgba(8,14,18,0.96)', 1.5);
        ensureCampScoutPinLayer();
        applyDispersedCampingDesiredState('style_load');
        applyEstablishedCampsitesDesiredState('style_load');
      }

      function applyRouteRenderMode(mode) {
        if (!map || !map.getLayer('route-layer')) return;
        var normalizedMode = mode || 'selected';
        try {
          map.setPaintProperty('route-layer', 'line-width', normalizedMode === 'preview' ? 4.25 : 5);
          map.setPaintProperty('route-layer', 'line-opacity', normalizedMode === 'preview' ? 0.72 : 0.95);
          map.setPaintProperty(
            'route-layer',
            'line-dasharray',
            normalizedMode === 'preview' ? [1.4, 1.2] : [1, 0]
          );
        } catch (e) {}
      }

      function updateRoute(coords, color, mode) {
        applyRouteRenderMode(mode);
        var fc = featureCollection(
          coords && coords.length > 1 ? [lineFeature('route', coords, { color: color || '#2ECC71' })] : []
        );
        setGeoJson('route-source', fc);
      }

      function updateRouteProgress(coords, color) {
        var fc = featureCollection(
          coords && coords.length > 1 ? [lineFeature('route-progress', coords, { color: color || '#F2C24D' })] : []
        );
        setGeoJson('route-progress-source', fc);
      }

      function updateSegments(segments) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(seg) { return seg.coordinates && seg.coordinates.length > 1; })
            .map(function(seg) {
              return lineFeature(seg.id, seg.coordinates, {
                color: seg.color || '#2ECC71',
                kind: seg.kind || null,
                name: seg.name || null,
                category: seg.category || null,
                categoryLabel: seg.categoryLabel || null
              });
            })
        );
        setGeoJson('segment-source', fc);
      }

      function updateTrail(segments) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(seg) { return seg.coordinates && seg.coordinates.length > 1; })
            .map(function(seg) {
              return lineFeature(seg.id, seg.coordinates, { color: seg.color || '#5FD1FF' });
            })
        );
        setGeoJson('trail-source', fc);
      }

      function updateSpeedTrail(segments) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(seg) { return seg.coordinates && seg.coordinates.length > 1; })
            .map(function(seg) {
              return lineFeature(seg.id, seg.coordinates, { color: seg.color || '#FFFFFF' });
            })
        );
        setGeoJson('speed-source', fc);
      }

      function updateRemoteOverlay(remoteOverlay) {
        var overlay = remoteOverlay || {};
        var enabled = !!overlay.enabled;
        var heatmapAreas = enabled ? (overlay.heatmapAreas || []) : [];
        var forecastSegments = enabled ? (overlay.forecastSegments || []) : [];

        setGeoJson(
          'ecs-remote-v1',
          featureCollection(
            heatmapAreas
              .filter(function(area) { return area.coordinates && area.coordinates.length >= 4; })
              .map(function(area) {
                return polygonFeature(area.id, area.coordinates, { label: area.label || 'D' });
              })
          )
        );

        setGeoJson(
          'ecs-remote-forecast-v1',
          featureCollection(
            forecastSegments
              .filter(function(segment) { return segment.coordinates && segment.coordinates.length > 1; })
              .map(function(segment) {
                return lineFeature(segment.id, segment.coordinates, {
                  signal: segment.signal || 'good',
                  color: segment.color || '#66BB6A'
                });
              })
          )
        );
      }

      function replaceMarkers(list, items, className, kind) {
        safeRemoveMarkers(list);
        list.length = 0;

        (items || []).forEach(function(item) {
          var marker = mkMarker(className, item.longitude, item.latitude, Object.assign({ kind: kind }, item));
          marker.addTo(map);
          list.push(marker);
        });
      }

      function getCampCategoryClass(category) {
        return 'camp-intel-cat-' + String(category || 'backup');
      }

      function getCampConfidenceClass(confidence) {
        var normalized = String(confidence || 'medium').toLowerCase();
        if (normalized !== 'high' && normalized !== 'low') normalized = 'medium';
        return 'camp-intel-conf-' + normalized;
      }

      function campGlyph(category) {
        switch (String(category || 'backup')) {
          case 'suggested':
            return 'S';
          case 'emergency':
            return 'E';
          case 'saved':
            return 'SV';
          case 'established':
            return 'ES';
          case 'community':
            return 'CM';
          case 'private':
            return 'PR';
          case 'group':
            return 'GR';
          case 'pending':
            return 'PN';
          case 'review':
            return 'RV';
          case 'rejected':
            return 'X';
          case 'previously_used':
            return 'U';
          case 'caution':
            return '!';
          case 'backup':
          default:
            return 'B';
        }
      }

      function campMarkerRankLabel(item) {
        if (item && typeof item.rankLabel === 'string' && item.rankLabel.trim().length > 0) {
          return item.rankLabel.trim();
        }
        if (item && typeof item.rank === 'number' && isFinite(item.rank) && item.rank > 0) {
          return String(Math.floor(item.rank));
        }
        return campGlyph(item && item.category);
      }

      function campMarkerDisplayLabel() {
        return '\\u26FA';
      }

      function createCampIntelMarkerElement(item) {
        var root = document.createElement('div');
        root.className =
          'camp-intel-marker ' +
          getCampCategoryClass(item.category) + ' ' +
          getCampConfidenceClass(item.confidence) +
          (item.selected ? ' camp-intel-selected' : '');

        if (item.selected) {
          var ripple = document.createElement('div');
          ripple.className = 'camp-intel-ripple';
          root.appendChild(ripple);
        }

        var beacon = document.createElement('div');
        beacon.className = 'camp-intel-beacon';
        root.appendChild(beacon);

        var ring = document.createElement('div');
        ring.className = 'camp-intel-ring';

        var core = document.createElement('div');
        core.className = 'camp-intel-core';
        core.textContent = campMarkerRankLabel(item);

        root.appendChild(ring);
        root.appendChild(core);

        var badgeWrap = document.createElement('div');
        badgeWrap.className = 'camp-intel-badges';
        var badgeEl = document.createElement('div');
        badgeEl.className = 'camp-intel-badge camp-intel-badge-neutral';
        badgeEl.textContent = campMarkerDisplayLabel();
        badgeWrap.appendChild(badgeEl);
        root.appendChild(badgeWrap);

        return root;
      }

      function replaceCampIntelMarkers(list, items) {
        safeRemoveMarkers(list);
        list.length = 0;
        var maxCampsiteMarkers = ${MAX_CAMPSITE_MARKERS};
        var maxKnownCampsiteSourceMarkers = ${MAX_KNOWN_CAMPSITE_SOURCE_MARKERS};
        var renderedCampsiteMarkers = 0;
        var renderedAiCampsiteMarkers = 0;

        sendLog('[CAMP_MARKER] render_geojson count=' + Math.min((items || []).length, maxKnownCampsiteSourceMarkers));
        sendLog('[CAMP_MARKER] overlay_projection_used false');

        (items || []).forEach(function(item) {
          if (renderedCampsiteMarkers >= maxKnownCampsiteSourceMarkers) return;
          if (
            !item ||
            typeof item.latitude !== 'number' ||
            typeof item.longitude !== 'number' ||
            !Number.isFinite(item.latitude) ||
            !Number.isFinite(item.longitude)
          ) {
            return;
          }
          var isKnownSourceMarker = !!(item && typeof item.markerKind === 'string' && item.markerKind.length > 0);
          if (!isKnownSourceMarker && renderedAiCampsiteMarkers >= maxCampsiteMarkers) return;
          sendLog(
            '[CAMP_MARKER] coordinate lat=' +
              item.latitude +
              ' lng=' +
              item.longitude +
              ' rank=' +
              (item.rankLabel || item.rank || renderedCampsiteMarkers + 1)
          );
          if (item.selected) {
            sendLog('[CAMP_MARKER] selected coordinate lat=' + item.latitude + ' lng=' + item.longitude);
          }
          var el = createCampIntelMarkerElement(item);
          el.addEventListener('click', function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', Object.assign({ kind: 'campIntel' }, item));
          });

          var marker = new mapboxgl.Marker({
            element: el,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);

          list.push(marker);
          renderedCampsiteMarkers += 1;
          if (!isKnownSourceMarker) renderedAiCampsiteMarkers += 1;
        });
      }

      function createCampScoutMarkerElement(item) {
        var root = document.createElement('div');
        root.className =
          'camp-scout-marker camp-scout-grade-' +
          String(item.confidenceGrade || 'D').toLowerCase() +
          ' camp-scout-source-' +
          String(item.sourceType || 'unknown') +
          (item.selected ? ' camp-scout-selected' : '');

        var core = document.createElement('div');
        core.className = 'camp-scout-core';
        var tent = document.createElement('span');
        tent.className = 'camp-scout-tent';
        var rank = document.createElement('span');
        rank.className = 'camp-scout-rank';
        rank.textContent = String(item.rankLabel || item.confidenceGrade || 'CS').slice(0, 3);
        var label = document.createElement('span');
        label.className = 'camp-scout-label';
        if (String(item.sourceType || '') === 'ecs_inferred') {
          label.textContent = 'ecs';
        } else {
          label.textContent = 'camp';
        }
        core.appendChild(tent);
        core.appendChild(rank);
        root.appendChild(core);
        root.appendChild(label);
        root.setAttribute('role', 'button');
        root.setAttribute('tabindex', '0');
        root.setAttribute(
          'aria-label',
          String(item.accessibilityLabel || ((item.campOpsRoleLabel || 'Camp Scout pin') + ': ' + (item.title || 'camp candidate')))
        );
        return root;
      }

      function replaceCampScoutMarkers(list, items) {
        safeRemoveMarkers(list);
        list.length = 0;
        sendCampScoutDebug('[CAMP_SCOUT_DEBUG] rendered_marker_count=' + ((items || []).length) + ' renderMode=dom_markers source=campScoutPins layer=campScoutMarkers visibility=' + ((items || []).length ? 'visible' : 'empty'));

        (items || []).slice(0, 10).forEach(function(item) {
          if (
            !item ||
            typeof item.latitude !== 'number' ||
            typeof item.longitude !== 'number' ||
            !Number.isFinite(item.latitude) ||
            !Number.isFinite(item.longitude)
          ) {
            return;
          }

          var el = createCampScoutMarkerElement(item);
          var activateCampScoutMarker = function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', Object.assign({ kind: 'campScout' }, item));
          };
          el.addEventListener('click', activateCampScoutMarker);
          el.addEventListener('keydown', function(ev) {
            if (!ev || (ev.key !== 'Enter' && ev.key !== ' ')) return;
            try {
              if (ev.preventDefault) ev.preventDefault();
            } catch (e) {}
            activateCampScoutMarker(ev);
          });

          var marker = new mapboxgl.Marker({
            element: el,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);

          list.push(marker);
          sendCampScoutDebug('[CAMP_SCOUT_DEBUG] marker_added id=' + String(item.id || '') + ' lng=' + String(item.longitude) + ' lat=' + String(item.latitude) + ' sourceType=' + String(item.sourceType || 'unknown') + ' legalityStatus=' + String(item.legalityStatus || 'unknown_needs_verification'));
        });
      }

      function setUserLocation(loc, show, heading) {
        if (
          !show ||
          !loc ||
          typeof loc.latitude !== 'number' ||
          typeof loc.longitude !== 'number' ||
          !Number.isFinite(loc.latitude) ||
          !Number.isFinite(loc.longitude)
        ) {
          if (userMarker) {
            try { userMarker.remove(); } catch (e) {}
            userMarker = null;
          }
          return;
        }

        if (!userMarker) {
          userMarker = mkMarker('marker-user', loc.longitude, loc.latitude, null, heading || 0);
          userMarker.addTo(map);
        } else {
          userMarker.setLngLat([loc.longitude, loc.latitude]);
          try {
            var el = userMarker.getElement();
            var rotor = el ? el.querySelector('.marker-user-rotor') : null;
            if (rotor && typeof heading === 'number') {
              rotor.style.transform = 'rotate(' + heading + 'deg)';
              rotor.style.transformOrigin = 'center center';
            }
          } catch (e) {}
        }
      }

      function setReplayMarker(loc) {
        if (!loc) {
          if (replayMarker) {
            try { replayMarker.remove(); } catch (e) {}
            replayMarker = null;
          }
          return;
        }

        if (!replayMarker) {
          replayMarker = mkMarker('marker-replay', loc.longitude, loc.latitude, { kind: 'replay' });
          replayMarker.addTo(map);
        } else {
          replayMarker.setLngLat([loc.longitude, loc.latitude]);
        }
      }

      function setMapInteractionEnabled(enabled) {
        if (!map) return;
        var methods = [
          'scrollZoom',
          'boxZoom',
          'dragRotate',
          'dragPan',
          'keyboard',
          'doubleClickZoom',
          'touchZoomRotate',
          'touchPitch'
        ];

        methods.forEach(function(method) {
          try {
            if (!map[method]) return;
            if (enabled && typeof map[method].enable === 'function') {
              map[method].enable();
            } else if (!enabled && typeof map[method].disable === 'function') {
              map[method].disable();
            }
          } catch (e) {}
        });
      }

      function setRouteBuilderDragPanEnabled(enabled) {
        if (!map || !map.dragPan) return;
        try {
          if (enabled && typeof map.dragPan.enable === 'function') map.dragPan.enable();
          if (!enabled && typeof map.dragPan.disable === 'function') map.dragPan.disable();
        } catch (e) {}
      }

      function getDistancePx(a, b) {
        if (!a || !b) return Infinity;
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
      }

      function getRouteBuilderEventPoint(event) {
        try {
          var rect = map.getCanvasContainer().getBoundingClientRect();
          return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          };
        } catch (e) {
          return { x: event.clientX, y: event.clientY };
        }
      }

      function routeBuilderRawCoordinateFromPoint(point) {
        if (!map || !point) return null;
        try {
          var lngLat = map.unproject(point);
          if (!lngLat || !isFinite(lngLat.lng) || !isFinite(lngLat.lat)) return null;
          return [lngLat.lng, lngLat.lat];
        } catch (e) {
          return null;
        }
      }

      function projectLngLat(coord) {
        if (!map || !coord || coord.length < 2) return null;
        try {
          return map.project({ lng: coord[0], lat: coord[1] });
        } catch (e) {
          return null;
        }
      }

      function nearestOnProjectedSegment(point, aCoord, bCoord) {
        var a = projectLngLat(aCoord);
        var b = projectLngLat(bCoord);
        if (!a || !b) return null;
        var abx = b.x - a.x;
        var aby = b.y - a.y;
        var abLenSq = abx * abx + aby * aby;
        if (abLenSq <= 0.0001) return null;
        var t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / abLenSq;
        t = Math.max(0, Math.min(1, t));
        var projected = { x: a.x + abx * t, y: a.y + aby * t };
        var lngLat = map.unproject(projected);
        return {
          coordinate: [lngLat.lng, lngLat.lat],
          distancePx: getDistancePx(point, projected),
          point: projected,
          t: t
        };
      }

      function scanLineForNearest(point, coordinates, featureKey, sourceLabel, maxDistancePx) {
        if (!coordinates || coordinates.length < 2) return null;
        var best = null;
        for (var i = 1; i < coordinates.length; i++) {
          var candidate = nearestOnProjectedSegment(point, coordinates[i - 1], coordinates[i]);
          if (!candidate) continue;
          if (candidate.distancePx > maxDistancePx) continue;
          if (!best || candidate.distancePx < best.distancePx) {
            best = {
              coordinate: candidate.coordinate,
              distancePx: candidate.distancePx,
              featureKey: featureKey,
              sourceLabel: sourceLabel,
              lineIndex: i,
              t: candidate.t
            };
          }
        }
        return best;
      }

      function collectPayloadSnapCandidates(point, maxDistancePx) {
        var candidates = [];
        var groups = [
          { label: 'route', segments: pendingPayload ? [{ id: 'route', coordinates: pendingPayload.routeCoords || [] }] : [] },
          { label: 'progress', segments: pendingPayload ? [{ id: 'progress', coordinates: pendingPayload.progressRouteCoords || [] }] : [] },
          { label: 'trail', segments: pendingPayload ? (pendingPayload.trailSegments || []) : [] },
          { label: 'segment', segments: pendingPayload ? (pendingPayload.segments || []) : [] }
        ];

        groups.forEach(function(group) {
          (group.segments || []).forEach(function(segment, index) {
            var key = group.label + ':' + String(segment.id || index);
            var candidate = scanLineForNearest(point, segment.coordinates || [], key, group.label, maxDistancePx);
            if (candidate) candidates.push(candidate);
          });
        });

        return candidates;
      }

      function extractFeatureLineCoordinates(feature) {
        if (!feature || !feature.geometry) return [];
        var geometry = feature.geometry;
        if (geometry.type === 'LineString') return [geometry.coordinates || []];
        if (geometry.type === 'MultiLineString') return geometry.coordinates || [];
        return [];
      }

      function isRouteBuilderRouteableFeature(feature) {
        if (!feature || !feature.geometry) return false;
        var layerId = feature.layer && feature.layer.id ? String(feature.layer.id).toLowerCase() : '';
        var sourceLayer = feature.sourceLayer ? String(feature.sourceLayer).toLowerCase() : '';
        var props = feature.properties || {};
        var className = String(props.class || props.type || props.kind || props.structure || '').toLowerCase();
        var subclass = String(props.subclass || props.maki || props.mode || '').toLowerCase();
        var surface = String(props.surface || '').toLowerCase();
        var access = String(props.access || props.access_type || props.accessType || props.status || props.condition || '').toLowerCase();
        var allTokens = [layerId, sourceLayer, className, subclass, surface, access].join(' ');
        var blocked =
          allTokens.indexOf('building') >= 0 ||
          allTokens.indexOf('water') >= 0 ||
          allTokens.indexOf('landuse') >= 0 ||
          allTokens.indexOf('contour') >= 0 ||
          allTokens.indexOf('admin') >= 0 ||
          allTokens.indexOf('boundary') >= 0 ||
          allTokens.indexOf('rail') >= 0 ||
          allTokens.indexOf('aerialway') >= 0 ||
          allTokens.indexOf('ferry') >= 0 ||
          allTokens.indexOf('label') >= 0 ||
          allTokens.indexOf('private') >= 0 ||
          allTokens.indexOf('no_access') >= 0 ||
          allTokens.indexOf('no access') >= 0 ||
          allTokens.indexOf('prohibited') >= 0 ||
          allTokens.indexOf('closed') >= 0;
        if (blocked) return false;

        var routeableClasses = {
          motorway: true,
          trunk: true,
          primary: true,
          secondary: true,
          tertiary: true,
          street: true,
          street_limited: true,
          service: true,
          track: true,
          path: true,
          trail: true,
          pedestrian: true,
          steps: true,
          cycleway: true,
          bridleway: true,
          road: true,
          unclassified: true,
          residential: true,
          living_street: true
        };

        if (routeableClasses[className] || routeableClasses[subclass]) return true;
        return (
          layerId.indexOf('road') >= 0 ||
          layerId.indexOf('trail') >= 0 ||
          layerId.indexOf('path') >= 0 ||
          layerId.indexOf('track') >= 0 ||
          layerId.indexOf('street') >= 0 ||
          sourceLayer.indexOf('road') >= 0 ||
          sourceLayer.indexOf('transport') >= 0 ||
          className.indexOf('path') >= 0 ||
          className.indexOf('track') >= 0 ||
          className.indexOf('trail') >= 0 ||
          className.indexOf('road') >= 0 ||
          className.indexOf('street') >= 0
        );
      }

      function collectRenderedSnapCandidates(point, maxDistancePx) {
        if (!map || !map.isStyleLoaded()) return [];
        var candidates = [];
        try {
          var radius = Math.max(18, maxDistancePx);
          var features = map.queryRenderedFeatures([
            [point.x - radius, point.y - radius],
            [point.x + radius, point.y + radius]
          ]) || [];

          features.slice(0, 90).forEach(function(feature, featureIndex) {
            var geometryLines = extractFeatureLineCoordinates(feature);
            if (!geometryLines.length) return;
            var layerId = feature.layer && feature.layer.id ? String(feature.layer.id).toLowerCase() : '';
            if (!isRouteBuilderRouteableFeature(feature)) return;
            var sourceLabel = classifyRouteBuilderSnapSource(feature);

            geometryLines.forEach(function(line, lineIndex) {
              var key = 'rendered:' + layerId + ':' + String(feature.id || featureIndex) + ':' + lineIndex;
              var candidate = scanLineForNearest(point, line, key, sourceLabel, maxDistancePx);
              if (candidate) candidates.push(candidate);
            });
          });
        } catch (e) {}
        return candidates;
      }

      function classifyRouteBuilderSnapSource(feature) {
        var layerId = feature && feature.layer && feature.layer.id ? String(feature.layer.id).toLowerCase() : '';
        var sourceLayer = feature && feature.sourceLayer ? String(feature.sourceLayer).toLowerCase() : '';
        var props = (feature && feature.properties) || {};
        var className = String(props.class || props.type || props.kind || '').toLowerCase();
        var tokens = [layerId, sourceLayer, className].join(' ');
        if (tokens.indexOf('trail') >= 0 || tokens.indexOf('path') >= 0 || tokens.indexOf('track') >= 0) {
          return 'trail';
        }
        if (tokens.indexOf('road') >= 0 || tokens.indexOf('street') >= 0 || tokens.indexOf('transport') >= 0) {
          return 'road';
        }
        return 'routeable';
      }

      function routeBuilderSnapContinuityPenalty(candidate, rawPoint) {
        var penalty = 0;
        if (
          routeBuilderPreferredFeatureKey &&
          candidate.featureKey &&
          candidate.featureKey !== routeBuilderPreferredFeatureKey
        ) {
          penalty += ROUTE_BUILDER_SNAP_FEATURE_SWITCH_PENALTY;
        }
        var lastGood = getLastGoodTracePoint();
        if (!lastGood || !lastGood.coordinate || !rawPoint || !candidate.point) return penalty;
        var lastProjected = projectLngLat(lastGood.coordinate);
        if (!lastProjected) return penalty;
        var rawVector = { x: rawPoint.x - lastProjected.x, y: rawPoint.y - lastProjected.y };
        var snapVector = { x: candidate.point.x - lastProjected.x, y: candidate.point.y - lastProjected.y };
        var rawLen = Math.sqrt(rawVector.x * rawVector.x + rawVector.y * rawVector.y);
        var snapLen = Math.sqrt(snapVector.x * snapVector.x + snapVector.y * snapVector.y);
        if (rawLen < 12 || snapLen < 12) return penalty;
        var dot = (rawVector.x * snapVector.x + rawVector.y * snapVector.y) / (rawLen * snapLen);
        if (dot < 0.32) penalty += ROUTE_BUILDER_SNAP_BEARING_PENALTY;
        return penalty;
      }

      function findNearestRouteableSegment(point, context) {
        var stableThreshold =
          context && context.preferredFeatureKey ? ROUTE_BUILDER_STABLE_SNAP_PX : ROUTE_BUILDER_SNAP_PX;
        var candidates = collectPayloadSnapCandidates(point, stableThreshold)
          .concat(collectRenderedSnapCandidates(point, stableThreshold));
        if (!candidates.length) return null;

        candidates.sort(function(a, b) {
          var preferredKey = context && context.preferredFeatureKey;
          var aPreferred = preferredKey && a.featureKey === preferredKey ? -18 : 0;
          var bPreferred = preferredKey && b.featureKey === preferredKey ? -18 : 0;
          var aScore = a.distancePx + aPreferred + routeBuilderSnapContinuityPenalty(a, point);
          var bScore = b.distancePx + bPreferred + routeBuilderSnapContinuityPenalty(b, point);
          return aScore - bScore;
        });

        var best = candidates[0];
        if (context && context.preferredFeatureKey && best.featureKey !== context.preferredFeatureKey) {
          var preferred = candidates.find(function(candidate) {
            return candidate.featureKey === context.preferredFeatureKey;
          });
          if (preferred && preferred.distancePx <= stableThreshold && best.distancePx > preferred.distancePx - 18) {
            best = preferred;
          }
        }
        if (!best || best.distancePx > stableThreshold) return null;
        return best;
      }

      function snapTracePoint(point, context) {
        var rawCoordinate = context && context.rawCoordinate ? context.rawCoordinate : routeBuilderRawCoordinateFromPoint(point);
        if (routeBuilderFreeDrawMode) {
          if (!rawCoordinate) return null;
          return {
            coordinate: rawCoordinate,
            rawCoordinate: rawCoordinate,
            distancePx: 0,
            featureKey: null,
            sourceLabel: 'free',
            snapMode: 'free'
          };
        }

        var snap = findNearestRouteableSegment(point, {
          preferredFeatureKey: routeBuilderPreferredFeatureKey,
          lastGoodPoint: getLastGoodTracePoint()
        });
        if (snap) {
          return Object.assign({}, snap, { rawCoordinate: rawCoordinate, snapMode: 'snapped' });
        }
        if (!rawCoordinate) return null;
        return {
          coordinate: rawCoordinate,
          rawCoordinate: rawCoordinate,
          distancePx: 0,
          featureKey: null,
          sourceLabel: 'free',
          snapMode: 'free'
        };
      }

      function pickRouteBuilderTracePoint(point) {
        return snapTracePoint(point, {});
      }

      function getPreviousAcceptedTraceCoordinate(lastGood) {
        if (!lastGood || !lastGood.segmentId) return null;
        var segmentIndex = routeBuilderDraftSegments.findIndex(function(segment) {
          return segment.id === lastGood.segmentId;
        });
        if (segmentIndex < 0) return null;
        var segment = routeBuilderDraftSegments[segmentIndex];
        if (segment && segment.coordinates && lastGood.pointIndex > 0) {
          return segment.coordinates[lastGood.pointIndex - 1] || null;
        }
        for (var i = segmentIndex - 1; i >= 0; i--) {
          var previousSegment = routeBuilderDraftSegments[i];
          if (previousSegment && previousSegment.coordinates && previousSegment.coordinates.length > 0) {
            return previousSegment.coordinates[previousSegment.coordinates.length - 1];
          }
        }
        return null;
      }

      function getTraceDirectionDot(lastGood, tracePoint) {
        var previous = getPreviousAcceptedTraceCoordinate(lastGood);
        if (!previous || !lastGood || !lastGood.coordinate || !tracePoint || !tracePoint.coordinate) return 1;
        var previousProjected = projectLngLat(previous);
        var lastProjected = projectLngLat(lastGood.coordinate);
        var nextProjected = projectLngLat(tracePoint.coordinate);
        if (!previousProjected || !lastProjected || !nextProjected) return 1;
        var priorVector = {
          x: lastProjected.x - previousProjected.x,
          y: lastProjected.y - previousProjected.y
        };
        var nextVector = {
          x: nextProjected.x - lastProjected.x,
          y: nextProjected.y - lastProjected.y
        };
        var priorLen = Math.sqrt(priorVector.x * priorVector.x + priorVector.y * priorVector.y);
        var nextLen = Math.sqrt(nextVector.x * nextVector.x + nextVector.y * nextVector.y);
        if (priorLen < 14 || nextLen < 14) return 1;
        return (priorVector.x * nextVector.x + priorVector.y * nextVector.y) / (priorLen * nextLen);
      }

      function hasExtremeTraceEvidence(tracePoint, jumpPx, directionDot) {
        var strongDirectionBreak = directionDot < ROUTE_BUILDER_EXTREME_DIRECTION_DOT;
        var lowConfidenceSnap =
          tracePoint.snapMode === 'snapped' &&
          tracePoint.distancePx > ROUTE_BUILDER_LOW_CONFIDENCE_SNAP_PX;
        var unrelatedFeatureSwitch =
          tracePoint.snapMode === 'snapped' &&
          tracePoint.featureKey &&
          getLastGoodTracePoint() &&
          getLastGoodTracePoint().featureKey &&
          tracePoint.featureKey !== getLastGoodTracePoint().featureKey &&
          tracePoint.distancePx > 30;

        return (
          (jumpPx > ROUTE_BUILDER_EXTREME_JUMP_PX && strongDirectionBreak) ||
          (jumpPx > ROUTE_BUILDER_EXTREME_JUMP_PX * 1.45 && (lowConfidenceSnap || tracePoint.snapMode === 'free')) ||
          (jumpPx > ROUTE_BUILDER_FEATURE_SWITCH_JUMP_PX && strongDirectionBreak && (lowConfidenceSnap || unrelatedFeatureSwitch))
        );
      }

      function isExtremeTraceError(tracePoint) {
        if (!tracePoint || !tracePoint.coordinate || routeBuilderFreeDrawMode) return false;
        if (routeBuilderGesturePointCount < ROUTE_BUILDER_EXTREME_MIN_POINTS) return false;
        if (builderPointCount() < ROUTE_BUILDER_EXTREME_MIN_POINTS) return false;
        var lastGood = getLastGoodTracePoint();
        if (!lastGood || !lastGood.coordinate) return false;
        var lastProjected = projectLngLat(lastGood.coordinate);
        var nextProjected = projectLngLat(tracePoint.coordinate);
        if (!lastProjected || !nextProjected) return false;
        var jumpPx = getDistancePx(lastProjected, nextProjected);
        if (jumpPx <= ROUTE_BUILDER_FEATURE_SWITCH_JUMP_PX) return false;
        return hasExtremeTraceEvidence(tracePoint, jumpPx, getTraceDirectionDot(lastGood, tracePoint));
      }

      function shouldContinueFreeModeAfterGrace(tracePoint) {
        return (
          !!tracePoint &&
          tracePoint.snapMode === 'free' &&
          !routeBuilderFreeDrawMode &&
          routeBuilderGesturePointCount >= ROUTE_BUILDER_FREE_MODE_MIN_POINTS &&
          routeBuilderGestureStartedAt > 0 &&
          Date.now() - routeBuilderGestureStartedAt >= ROUTE_BUILDER_FREE_MODE_GRACE_MS &&
          getDistancePx(routeBuilderGestureStartPoint, projectLngLat(tracePoint.coordinate)) >= ROUTE_BUILDER_FREE_MODE_MIN_DRAG_PX
        );
      }

      function rollbackTraceToLastGoodPoint() {
        var lastGood = getLastGoodTracePoint();
        if (!lastGood || !lastGood.segmentId) {
          if (routeBuilderActiveSegmentId) {
            routeBuilderDraftSegments = routeBuilderDraftSegments.filter(function(segment) {
              return segment.id !== routeBuilderActiveSegmentId;
            });
          }
          updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
          sendRouteBuilderUpdate(true);
          return;
        }

        var lastGoodSegmentIndex = routeBuilderDraftSegments.findIndex(function(segment) {
          return segment.id === lastGood.segmentId;
        });
        routeBuilderDraftSegments = routeBuilderDraftSegments
          .slice(0, lastGoodSegmentIndex >= 0 ? lastGoodSegmentIndex + 1 : routeBuilderDraftSegments.length)
          .map(function(segment) {
            if (segment.id !== lastGood.segmentId) return segment;
            return Object.assign({}, segment, {
              coordinates: (segment.coordinates || []).slice(0, lastGood.pointIndex + 1)
            });
          })
          .filter(function(segment) {
            if (segment.id === lastGood.segmentId) return segment.coordinates && segment.coordinates.length > 0;
            return segment.coordinates && segment.coordinates.length > 1;
          });
        routeBuilderActiveSegmentId = lastGood.segmentId;
        updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        sendRouteBuilderUpdate(true);
      }

      function enterFreeDrawMode() {
        routeBuilderFreeDrawMode = true;
        routeBuilderPreferredFeatureKey = null;
        routeBuilderLastSnapSource = 'free';
        setRouteBuilderDrawing(routeBuilderIsDrawing, 'free');
      }

      function noteRouteBuilderFreeMode() {
        if (routeBuilderFreeModeNoticeSent) return;
        routeBuilderFreeModeNoticeSent = true;
        sendLog('[ROUTE_BUILDER] free_mode_continued reason=off_network notice="' + ROUTE_BUILDER_FREE_MODE_NOTICE + '" trace_points=' + routeBuilderGesturePointCount);
      }

      function getLastBuilderPoint() {
        for (var i = routeBuilderDraftSegments.length - 1; i >= 0; i--) {
          var segment = routeBuilderDraftSegments[i];
          if (segment && segment.coordinates && segment.coordinates.length > 0) {
            return segment.coordinates[segment.coordinates.length - 1];
          }
        }
        return null;
      }

      function getLastBuilderPointInfo() {
        for (var i = routeBuilderDraftSegments.length - 1; i >= 0; i--) {
          var segment = routeBuilderDraftSegments[i];
          if (segment && segment.coordinates && segment.coordinates.length > 0) {
            return {
              coordinate: segment.coordinates[segment.coordinates.length - 1],
              segmentId: segment.id,
              pointIndex: segment.coordinates.length - 1
            };
          }
        }
        return null;
      }

      function syncRouteBuilderTraceAnchorFromDraft() {
        var lastPoint = getLastBuilderPointInfo();
        if (!lastPoint || !lastPoint.coordinate) {
          routeBuilderLastGoodTracePoint = null;
          return;
        }
        routeBuilderLastGoodTracePoint = {
          coordinate: lastPoint.coordinate,
          segmentId: lastPoint.segmentId,
          pointIndex: lastPoint.pointIndex,
          snapMode: 'snapped',
          featureKey: null,
          sourceLabel: routeBuilderLastSnapSource || null
        };
      }

      function ensureBuilderSegment(startCoordinate) {
        var previousEndpoint = getLastBuilderPoint();
        var segmentStart = previousEndpoint || startCoordinate;
        if (!segmentStart) return null;
        var segment = {
          id: 'draft-' + Date.now() + '-' + routeBuilderDraftSegments.length,
          coordinates: [segmentStart]
        };
        routeBuilderDraftSegments.push(segment);
        routeBuilderActiveSegmentId = segment.id;
        return segment;
      }

      function ensureRawTraceSegment(startCoordinate) {
        if (!startCoordinate) return null;
        var rawSegment = null;
        if (routeBuilderActiveRawSegmentId) {
          rawSegment = routeBuilderRawTraceSegments.find(function(item) {
            return item.id === routeBuilderActiveRawSegmentId;
          }) || null;
        }
        if (rawSegment) return rawSegment;

        rawSegment = {
          id: 'raw-' + (routeBuilderTraceSessionId || Date.now()) + '-' + routeBuilderRawTraceSegments.length,
          coordinates: [startCoordinate]
        };
        routeBuilderRawTraceSegments.push(rawSegment);
        routeBuilderActiveRawSegmentId = rawSegment.id;
        return rawSegment;
      }

      function appendRawTracePoint(rawCoordinate) {
        if (!rawCoordinate) return;
        var rawSegment = ensureRawTraceSegment(rawCoordinate);
        if (!rawSegment) return;
        var previous = rawSegment.coordinates[rawSegment.coordinates.length - 1];
        if (previous) {
          var previousProjected = projectLngLat(previous);
          var nextProjected = projectLngLat(rawCoordinate);
          if (getDistancePx(previousProjected, nextProjected) < ROUTE_BUILDER_APPEND_MIN_PX) return;
        }
        rawSegment.coordinates.push(rawCoordinate);
      }

      function appendBuilderCoordinate(coordinate) {
        if (!coordinate) return false;
        var segment = routeBuilderDraftSegments.find(function(item) {
          return item.id === routeBuilderActiveSegmentId;
        });
        if (!segment) {
          segment = ensureBuilderSegment(coordinate);
        }
        if (!segment) return false;

        var previous = segment.coordinates[segment.coordinates.length - 1];
        if (previous) {
          var previousProjected = projectLngLat(previous);
          var nextProjected = projectLngLat(coordinate);
          if (getDistancePx(previousProjected, nextProjected) < ROUTE_BUILDER_APPEND_MIN_PX) {
            return false;
          }
        }

        segment.coordinates.push(coordinate);
        updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        return true;
      }

      function getRawTraceSegmentById(rawSegmentId) {
        if (!rawSegmentId) return null;
        return routeBuilderRawTraceSegments.find(function(segment) {
          return segment.id === rawSegmentId;
        }) || null;
      }

      function routeBuilderLinePixelLength(coordinates) {
        var length = 0;
        for (var i = 1; i < (coordinates || []).length; i++) {
          length += getDistancePx(projectLngLat(coordinates[i - 1]), projectLngLat(coordinates[i]));
        }
        return length;
      }

      function simplifyRouteBuilderLine(coordinates, minDistancePx) {
        if (!coordinates || coordinates.length <= 2) return (coordinates || []).slice();
        var simplified = [coordinates[0]];
        for (var i = 1; i < coordinates.length - 1; i++) {
          var previous = simplified[simplified.length - 1];
          if (getDistancePx(projectLngLat(previous), projectLngLat(coordinates[i])) >= minDistancePx) {
            simplified.push(coordinates[i]);
          }
        }
        var last = coordinates[coordinates.length - 1];
        var currentLast = simplified[simplified.length - 1];
        if (!currentLast || currentLast[0] !== last[0] || currentLast[1] !== last[1]) {
          simplified.push(last);
        }
        return simplified;
      }

      function mergeSegmentStartWithRawTrace(segment, rawCoordinates) {
        var coordinates = (rawCoordinates || []).slice();
        var segmentStart = segment && segment.coordinates && segment.coordinates[0];
        if (!segmentStart) return coordinates;
        var first = coordinates[0];
        if (!first || getDistancePx(projectLngLat(segmentStart), projectLngLat(first)) >= ROUTE_BUILDER_APPEND_MIN_PX) {
          coordinates.unshift(segmentStart);
        } else {
          coordinates[0] = segmentStart;
        }
        return coordinates;
      }

      function countByKey(items, keyName) {
        return items.reduce(function(counts, item) {
          var key = String(item && item[keyName] ? item[keyName] : 'unknown');
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        }, {});
      }

      function dominantCount(counts) {
        return Object.keys(counts || {}).reduce(function(max, key) {
          return Math.max(max, counts[key] || 0);
        }, 0);
      }

      function finalizeRouteBuilderSegmentSnap(segmentId, rawSegmentId) {
        var segment = routeBuilderDraftSegments.find(function(item) {
          return item.id === segmentId;
        });
        if (!segment) return null;

        var rawSegment = getRawTraceSegmentById(rawSegmentId);
        var rawCoordinates = mergeSegmentStartWithRawTrace(segment, rawSegment ? rawSegment.coordinates : segment.coordinates);
        rawCoordinates = simplifyRouteBuilderLine(rawCoordinates, ROUTE_BUILDER_APPEND_MIN_PX);
        segment.rawSegment = rawCoordinates.slice();

        if (!rawCoordinates || rawCoordinates.length < 2 || routeBuilderLinePixelLength(rawCoordinates) < ROUTE_BUILDER_FINAL_MIN_LENGTH_PX) {
          segment.snapConfidence = 'low';
          segment.snapSource = 'raw';
          segment.snapStatus = 'too_short';
          segment.snapMessage = 'Segment too short. Draw a longer stroke or keep tracing.';
          return segment;
        }

        var matches = [];
        rawCoordinates.forEach(function(rawCoordinate) {
          var point = projectLngLat(rawCoordinate);
          if (!point) return;
          var snap = findNearestRouteableSegment(point, {
            preferredFeatureKey: routeBuilderPreferredFeatureKey,
            lastGoodPoint: getLastGoodTracePoint()
          });
          if (snap && snap.distancePx <= ROUTE_BUILDER_FINAL_SNAP_PX) {
            matches.push(snap);
          }
        });

        var matchRatio = matches.length / Math.max(rawCoordinates.length, 1);
        var avgDistance = matches.length
          ? matches.reduce(function(total, item) { return total + item.distancePx; }, 0) / matches.length
          : Infinity;
        var maxDistance = matches.length
          ? matches.reduce(function(max, item) { return Math.max(max, item.distancePx); }, 0)
          : Infinity;
        var featureCounts = countByKey(matches, 'featureKey');
        var sourceCounts = countByKey(matches, 'sourceLabel');
        var dominantFeatureShare = matches.length ? dominantCount(featureCounts) / matches.length : 0;
        var ambiguous =
          matches.length >= 4 &&
          dominantFeatureShare < ROUTE_BUILDER_FINAL_AMBIGUOUS_DOMINANCE &&
          Object.keys(featureCounts).length > 2;

        if (
          matches.length >= 2 &&
          !ambiguous &&
          matchRatio >= 0.75 &&
          avgDistance <= ROUTE_BUILDER_FINAL_HIGH_AVG_PX &&
          maxDistance <= ROUTE_BUILDER_FINAL_SNAP_PX
        ) {
          var highLine = simplifyRouteBuilderLine(matches.map(function(item) { return item.coordinate; }), ROUTE_BUILDER_APPEND_MIN_PX);
          segment.coordinates = highLine;
          segment.snappedSegment = highLine.slice();
          segment.snapConfidence = 'high';
          segment.snapSource = Object.keys(sourceCounts).sort(function(a, b) { return sourceCounts[b] - sourceCounts[a]; })[0] || 'local-routeable';
          segment.snapStatus = 'snapped';
          segment.snapMessage = 'Snapped to nearby routeable geometry.';
          routeBuilderLastSnapSource = segment.snapSource;
          return segment;
        }

        if (
          matches.length >= 2 &&
          !ambiguous &&
          matchRatio >= ROUTE_BUILDER_FINAL_MIN_MATCH_RATIO &&
          avgDistance <= ROUTE_BUILDER_FINAL_MEDIUM_AVG_PX &&
          maxDistance <= ROUTE_BUILDER_FINAL_SNAP_PX
        ) {
          var mediumLine = simplifyRouteBuilderLine(matches.map(function(item) { return item.coordinate; }), ROUTE_BUILDER_APPEND_MIN_PX);
          segment.coordinates = mediumLine;
          segment.snappedSegment = mediumLine.slice();
          segment.snapConfidence = 'medium';
          segment.snapSource = Object.keys(sourceCounts).sort(function(a, b) { return sourceCounts[b] - sourceCounts[a]; })[0] || 'local-routeable';
          segment.snapStatus = 'snapped';
          segment.snapMessage = 'Snapped with medium confidence.';
          routeBuilderLastSnapSource = segment.snapSource;
          return segment;
        }

        var rawLine = simplifyRouteBuilderLine(rawCoordinates, ROUTE_BUILDER_APPEND_MIN_PX * 2.5);
        segment.coordinates = rawLine;
        segment.snappedSegment = [];
        segment.snapConfidence = 'low';
        segment.snapSource = ambiguous ? 'ambiguous-local-routeable' : 'raw-smoothed';
        segment.snapStatus = ambiguous ? 'ambiguous' : 'raw_smoothed';
        segment.snapMessage = ambiguous
          ? 'Ambiguous route match. Kept raw line; undo and retry if needed.'
          : 'No reliable road or trail match. Kept smoothed raw line; undo and retry if needed.';
        routeBuilderLastSnapSource = segment.snapSource;
        return segment;
      }

      function startRouteBuilderDraw(event) {
        if (!routeBuilderActive || !map || routeBuilderPointerId !== null || routeBuilderPointerCount > 1) return false;
        var point = getRouteBuilderEventPoint(event);
        var rawCoordinate = routeBuilderRawCoordinateFromPoint(point);
        var tracePoint = snapTracePoint(point, { rawCoordinate: rawCoordinate });
        if (!tracePoint) return false;

        if (isExtremeTraceError(tracePoint)) {
          rollbackTraceToLastGoodPoint();
          try {
            event.preventDefault();
            event.stopPropagation();
          } catch (e) {}
          return false;
        }

        routeBuilderPointerId = event.pointerId;
        routeBuilderTraceSessionId = 'trace-' + Date.now() + '-' + String(event.pointerId || 'pointer');
        routeBuilderActiveRawSegmentId = null;
        routeBuilderGestureStartedAt = Date.now();
        routeBuilderGesturePointCount = 1;
        routeBuilderGestureStartPoint = point;
        routeBuilderFreeModeNoticeSent = false;
        routeBuilderSuppressClickUntil = Date.now() + 650;
        routeBuilderPreferredFeatureKey = tracePoint.snapMode === 'snapped' ? tracePoint.featureKey : null;
        routeBuilderLastSnapSource = tracePoint.sourceLabel;
        ensureRawTraceSegment(tracePoint.rawCoordinate || rawCoordinate || tracePoint.coordinate);
        ensureBuilderSegment(tracePoint.coordinate);
        if (!appendBuilderCoordinate(tracePoint.coordinate)) {
          updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        }
        markLastGoodTracePoint(tracePoint);
        setRouteBuilderDragPanEnabled(false);
        setRouteBuilderDrawing(true, tracePoint.sourceLabel);
        sendRouteBuilderUpdate(true);
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (e) {}
        return true;
      }

      function continueRouteBuilderDraw(event) {
        if (!routeBuilderActive || routeBuilderPointerId !== event.pointerId || !routeBuilderIsDrawing) return;
        var point = getRouteBuilderEventPoint(event);
        var rawCoordinate = routeBuilderRawCoordinateFromPoint(point);
        var tracePoint = snapTracePoint(point, { rawCoordinate: rawCoordinate });
        if (!tracePoint) return;
        appendRawTracePoint(tracePoint.rawCoordinate || rawCoordinate || tracePoint.coordinate);

        if (isExtremeTraceError(tracePoint)) {
          rollbackTraceToLastGoodPoint();
          try {
            event.preventDefault();
            event.stopPropagation();
          } catch (e) {}
          return;
        }

        routeBuilderGesturePointCount += 1;
        if (shouldContinueFreeModeAfterGrace(tracePoint)) {
          enterFreeDrawMode();
          noteRouteBuilderFreeMode();
          tracePoint.sourceLabel = 'free';
          tracePoint.snapMode = 'free';
          tracePoint.featureKey = null;
        }

        routeBuilderPreferredFeatureKey = tracePoint.snapMode === 'snapped' ? tracePoint.featureKey : null;
        routeBuilderLastSnapSource = tracePoint.sourceLabel;
        if (appendBuilderCoordinate(tracePoint.coordinate)) {
          markLastGoodTracePoint(tracePoint);
          sendRouteBuilderUpdate(false);
        }
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (e) {}
      }

      function endRouteBuilderDraw(event) {
        if (routeBuilderPointerId !== event.pointerId) return;
        var endedSegmentId = routeBuilderActiveSegmentId;
        var endedRawSegmentId = routeBuilderActiveRawSegmentId;
        setRouteBuilderDrawing(true, 'snapping');
        if (endedSegmentId) {
          finalizeRouteBuilderSegmentSnap(endedSegmentId, endedRawSegmentId);
        }
        routeBuilderPointerId = null;
        routeBuilderActiveRawSegmentId = null;
        routeBuilderTraceSessionId = null;
        routeBuilderSuppressClickUntil = Date.now() + 650;
        routeBuilderActiveSegmentId = null;
        routeBuilderPreferredFeatureKey = null;
        routeBuilderGestureStartedAt = 0;
        routeBuilderGesturePointCount = 0;
        routeBuilderGestureStartPoint = null;
        routeBuilderFreeModeNoticeSent = false;
        if (endedSegmentId) {
          routeBuilderDraftSegments = routeBuilderDraftSegments.filter(function(segment) {
            return segment.id !== endedSegmentId || (segment.coordinates && segment.coordinates.length > 1);
          });
          updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        }
        setRouteBuilderDragPanEnabled(true);
        setRouteBuilderDrawing(false, routeBuilderLastSnapSource);
        sendRouteBuilderUpdate(true);
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (e) {}
      }

      function cancelRouteBuilderDraw() {
        var cancelledSegmentId = routeBuilderActiveSegmentId;
        routeBuilderPointerId = null;
        routeBuilderActiveRawSegmentId = null;
        routeBuilderTraceSessionId = null;
        routeBuilderSuppressClickUntil = Date.now() + 650;
        routeBuilderActiveSegmentId = null;
        routeBuilderPreferredFeatureKey = null;
        if (cancelledSegmentId) {
          routeBuilderDraftSegments = routeBuilderDraftSegments.filter(function(segment) {
            return segment.id !== cancelledSegmentId || (segment.coordinates && segment.coordinates.length > 1);
          });
          updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        }
        setRouteBuilderDragPanEnabled(true);
        setRouteBuilderDrawing(false, routeBuilderLastSnapSource);
        sendRouteBuilderUpdate(true);
      }

      function clearRouteBuilderDraftRuntime() {
        routeBuilderDraftSegments = [];
        routeBuilderPointerId = null;
        routeBuilderSuppressClickUntil = Date.now() + 650;
        routeBuilderActiveSegmentId = null;
        routeBuilderPreferredFeatureKey = null;
        routeBuilderLastSnapSource = null;
        routeBuilderLastSentAt = 0;
        resetRouteBuilderTraceRecovery();
        updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        setRouteBuilderDragPanEnabled(true);
        setRouteBuilderDrawing(false, null);
      }

      function setRouteBuilderActive(nextActive) {
        var wasActive = routeBuilderActive;
        routeBuilderActive = !!nextActive;
        if (!wasActive && routeBuilderActive) {
          resetRouteBuilderTraceRecovery();
        }
        if (!routeBuilderActive) {
          clearRouteBuilderDraftRuntime();
        }
        if (map && map.getCanvasContainer()) {
          map.getCanvasContainer().style.cursor = routeBuilderActive ? 'crosshair' : '';
        }
      }

      function issueCameraCommand(command) {
        if (!map || !command) return;

        var normalized = normalizeCameraCommand(command);
        if (!normalized) return;

        var cameraKey = buildCameraKey(normalized);
        if (cameraKey && cameraKey === lastCameraCommandKey) return;
        lastCameraCommandKey = cameraKey;
        activeCameraMode = normalized.mode || activeCameraMode;

        try {
          if (normalized.fitBounds) {
            var bounds = new mapboxgl.LngLatBounds(
              [normalized.fitBounds.west, normalized.fitBounds.south],
              [normalized.fitBounds.east, normalized.fitBounds.north]
            );

            map.fitBounds(bounds, {
              padding: normalized.fitBounds.padding,
              maxZoom: normalized.fitBounds.maxZoom,
              duration: normalized.animate === false ? 0 : normalized.durationMs,
              essential: true,
            });
            return;
          }

          if (normalized.center) {
            var nextCenter = [normalized.center.longitude, normalized.center.latitude];
            var currentCenter = map.getCenter();
            var sameAsCurrent = sameCenter(
              { latitude: currentCenter.lat, longitude: currentCenter.lng },
              normalized.center
            );
            var sameZoom =
              typeof normalized.zoom !== 'number' || Math.abs(map.getZoom() - normalized.zoom) <= 0.01;
            var samePitch =
              typeof normalized.pitch !== 'number' || Math.abs(map.getPitch() - normalized.pitch) <= 0.1;
            var sameBearing =
              typeof normalized.bearing !== 'number' || bearingDelta(map.getBearing(), normalized.bearing) <= 0.5;

            if (sameAsCurrent && sameZoom && samePitch && sameBearing && !normalized.offset) return;

            var cameraOptions = { center: nextCenter, essential: true };
            if (typeof normalized.zoom === 'number') {
              cameraOptions.zoom = normalized.zoom;
            }
            if (typeof normalized.pitch === 'number') {
              cameraOptions.pitch = normalized.pitch;
            }
            if (typeof normalized.bearing === 'number') {
              cameraOptions.bearing = normalized.bearing;
            }
            if (normalized.offset) {
              cameraOptions.offset = normalized.offset;
            }

            if (normalized.animate === false) {
              map.jumpTo(cameraOptions);
            } else {
              cameraOptions.duration = normalized.durationMs;
              map.easeTo(cameraOptions);
            }
            return;
          }

          if (typeof normalized.zoom === 'number') {
            var zoomOnlyOptions = { zoom: normalized.zoom, essential: true };
            if (typeof normalized.pitch === 'number') {
              zoomOnlyOptions.pitch = normalized.pitch;
            }
            if (typeof normalized.bearing === 'number') {
              zoomOnlyOptions.bearing = normalized.bearing;
            }
            if (Math.abs(map.getZoom() - normalized.zoom) <= 0.01) {
              if (
                (typeof normalized.pitch !== 'number' || Math.abs(map.getPitch() - normalized.pitch) <= 0.1) &&
                (typeof normalized.bearing !== 'number' || bearingDelta(map.getBearing(), normalized.bearing) <= 0.5)
              ) {
                return;
              }
            }
            if (normalized.animate === false) {
              map.jumpTo(zoomOnlyOptions);
            } else {
              zoomOnlyOptions.duration = normalized.durationMs;
              map.easeTo(zoomOnlyOptions);
            }
          }
        } catch (e) {
          sendLog('camera command failed: ' + String(e && e.message ? e.message : e));
        }
      }

      function maybeApplyLegacyFallbackCamera(payload) {
        if (!map || !payload) return;

        if (payload.cameraMode === 'replay' && payload.replayMarker) {
          issueCameraCommand({
            mode: 'replay',
            center: payload.replayMarker,
            durationMs: 450,
            animate: true,
            reason: 'legacy_replay_follow'
          });
          return;
        }

        if (payload.cameraMode === 'follow_user' && payload.userLocation) {
          issueCameraCommand({
            mode: 'follow_user',
            center: payload.userLocation,
            durationMs: 500,
            animate: true,
            reason: 'legacy_follow_user'
          });
        }
      }

      function applyDynamicState(payload) {
        if (!map || !payload) return;

        setMapInteractionEnabled(payload.interactive !== false);
        setRouteBuilderActive(!!payload.routeBuilderActive);
        if (routeBuilderActive && routeBuilderIsDrawing) {
          setRouteBuilderDragPanEnabled(false);
        }
        setUserLocation(payload.userLocation || null, !!payload.showUserLocation, payload.vehicleHeading);
        setReplayMarker(payload.replayMarker || null);
        activeCameraMode = payload.cameraMode || activeCameraMode;
      }

      function fitInitialPayload(payload) {
        if (!payload || bootstrapDone) return;

        if (payload.bounds) {
          map.fitBounds(
            [
              [payload.bounds.minLng, payload.bounds.minLat],
              [payload.bounds.maxLng, payload.bounds.maxLat]
            ],
            { padding: 48, duration: 0, maxZoom: 15 }
          );
          bootstrapDone = true;
          return;
        }

        if (payload.userLocation) {
          map.jumpTo({ center: [payload.userLocation.longitude, payload.userLocation.latitude], zoom: 14 });
          bootstrapDone = true;
          return;
        }

        if (payload.center) {
          map.jumpTo({ center: payload.center, zoom: payload.zoom || 12 });
          bootstrapDone = true;
        }
      }

      function sendCenter() {
        try {
          var center = map.getCenter();
          send('mapCenterReply', {
            latitude: center.lat,
            longitude: center.lng,
            zoom: map.getZoom()
          });
        } catch (e) {}
      }

      function sendBounds() {
        try {
          var b = map.getBounds();
          var c = map.getCenter();
          send('mapBoundsReply', {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
            center: {
              latitude: c.lat,
              longitude: c.lng
            },
            zoom: map.getZoom()
          });
        } catch (e) {}
      }

      function reportRoadClass() {
        send('roadClassification', {
          classification: 'unknown',
          source: 'fallback'
        });
      }

      function applyPayload(payload) {
        if (!map || !payload || !map.isStyleLoaded()) return;

        if (payload.styleUrl && payload.styleUrl !== requestedStyleUrl) {
          requestedStyleUrl = payload.styleUrl;
          activeStyleUrl = payload.styleUrl;
          lastAppliedStyleUrl = payload.styleUrl;
          attemptedStyles = Object.create(null);
          attemptedStyles[payload.styleUrl] = true;
          map.setStyle(payload.styleUrl);
          return;
        }

        reinitializeStyleArtifacts();
        routeBuilderColor = payload.routeBuilderColor || routeBuilderColor || '#65F0D4';
        if (!routeBuilderIsDrawing) {
          routeBuilderRawTraceSegments = [];
          routeBuilderActiveRawSegmentId = null;
          routeBuilderTraceSessionId = null;
          routeBuilderDraftSegments = cloneBuilderSegments(payload.routeBuilderSegments || []);
          if (!routeBuilderDraftSegments.length) {
            resetRouteBuilderTraceRecovery();
          } else {
            syncRouteBuilderTraceAnchorFromDraft();
          }
        }
        updateRoute(payload.routeCoords || [], payload.routeColor, payload.routeRenderMode);
        updateRouteProgress(payload.progressRouteCoords || [], payload.progressColor);
        updateSegments(payload.segments || []);
        updateTrail(payload.trailSegments || []);
        updateSpeedTrail(payload.speedSegments || []);
        updateRemoteOverlay(payload.remoteOverlay || null);
        updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);
        updateCampsiteSearchPolygon(payload.campsiteSearchPolygon || null);

        replaceMarkers(waypointMarkers, payload.waypoints || [], 'marker-dot marker-waypoint', 'waypoint');
        replaceMarkers(bailoutMarkers, payload.bailouts || [], 'marker-dot marker-bailout', 'bailout');
        replaceCampIntelMarkers(campsiteMarkers, payload.campsites || []);
        updateCampScoutPinLayer(payload.campScoutPins || []);
        replaceCampScoutMarkers(campScoutMarkers, payload.campScoutPins || []);
        replaceMarkers(tiltMarkers, payload.tiltAlerts || [], 'marker-dot marker-tilt', 'tiltAlert');

        safeRemoveMarkers(pinMarkers);
        pinMarkers = [];
        (payload.pins || []).forEach(function(item) {
          var el = document.createElement('div');
          el.className = 'marker-dot marker-pin';
          if (item.color) el.style.background = item.color;

          el.addEventListener('click', function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', Object.assign({ kind: 'pin' }, item));
          });

          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);

          pinMarkers.push(marker);
        });

        applyDynamicState(payload);

        if (crosshairEl) {
          crosshairEl.style.opacity = payload.showCrosshair ? '1' : '0';
        }

        if (!bootstrapDone) {
          fitInitialPayload(payload);
        }

        maybeApplyLegacyFallbackCamera(payload);
      }

      function init() {
        if (initialized) return;
        initialized = true;

        try {
          map = new mapboxgl.Map({
            container: 'map',
            style: activeStyleUrl,
            center: [-121.0, 38.5],
            zoom: 7,
            attributionControl: false,
            interactive: true,
            dragRotate: false,
            touchZoomRotate: true,
            doubleClickZoom: true
          });
        } catch (err) {
          sendLog('Map constructor failed: ' + String(err && err.message ? err.message : err));
          send('mapReady', { ok: false, reason: 'constructor_failed' });
          return;
        }

        bootstrapReadyTimer = setTimeout(function() {
          send('mapReady', { ok: true, reason: 'bootstrap_timeout' });
        }, 1200);

        map.on('load', function() {
          sendLog('map load event fired');
          reinitializeStyleArtifacts();

          if (pendingPayload) {
            applyPayload(pendingPayload);
          }

          if (bootstrapReadyTimer) {
            clearTimeout(bootstrapReadyTimer);
            bootstrapReadyTimer = null;
          }

          send('mapReady', { ok: true });
          reportRoadClass();
        });

        map.on('style.load', function() {
          reinitializeStyleArtifacts();
          if (pendingPayload) {
            applyPayload(pendingPayload);
          }
        });

        map.on('error', function(e) {
          var msg = '';
          try {
            msg = e && e.error && e.error.message ? e.error.message : JSON.stringify(e);
            sendLog('map error: ' + msg);
          } catch (err) {
            sendLog('map error (unserializable)');
          }

          var failedStyleUrl = activeStyleUrl || requestedStyleUrl || null;
          var looksLikeStyleFetchFailure =
            typeof msg === 'string' &&
            (msg.indexOf('Failed to fetch https://api.mapbox.com/styles/v1/') >= 0 ||
             msg.indexOf('style') >= 0);

          if (looksLikeStyleFetchFailure) {
            applyFallbackStyle(failedStyleUrl);
          }
        });

        function notifyManualMapInteraction(eventName, event) {
          if (!event || !event.originalEvent) return;
          activeCameraMode = 'free_pan';
          send('userDrag', { ok: true, mode: activeCameraMode, event: eventName });
        }

        map.on('dragstart', function(event) {
          notifyManualMapInteraction('dragstart', event);
        });

        map.on('zoomstart', function(event) {
          notifyManualMapInteraction('zoomstart', event);
        });

        map.on('moveend', function() {
          try {
            sendLog('[CAMP_MARKER] camera_update zoom=' + map.getZoom().toFixed(2));
          } catch (e) {}
          if (dragTimeout) clearTimeout(dragTimeout);
          dragTimeout = setTimeout(function() {
            sendBounds();
            sendCenter();
            reportRoadClass();
          }, 90);
        });

        map.on('contextmenu', function(e) {
          send('longPress', {
            latitude: e.lngLat.lat,
            longitude: e.lngLat.lng
          });
        });

        map.on('click', function(e) {
          if (routeBuilderActive && Date.now() < routeBuilderSuppressClickUntil) return;
          if (Date.now() < dispersedCampingMapTapSuppressUntil) return;
          try {
            var segmentFeatures = map.queryRenderedFeatures(e.point, { layers: ['segment-layer'] }) || [];
            var exploreSegment = null;
            for (var i = 0; i < segmentFeatures.length; i += 1) {
              var props = segmentFeatures[i] && segmentFeatures[i].properties ? segmentFeatures[i].properties : {};
              if (props.kind === 'explore_route') {
                exploreSegment = segmentFeatures[i];
                break;
              }
            }
            if (exploreSegment) {
              var segmentProps = exploreSegment.properties || {};
              send('segmentTap', {
                kind: segmentProps.kind || null,
                id: exploreSegment.id || null,
                name: segmentProps.name || null,
                category: segmentProps.category || null,
                categoryLabel: segmentProps.categoryLabel || null,
                color: segmentProps.color || null,
                latitude: e.lngLat.lat,
                longitude: e.lngLat.lng
              });
              return;
            }
          } catch (err) {}
          send('mapTap', {
            latitude: e.lngLat.lat,
            longitude: e.lngLat.lng
          });
        });

        map.on('idle', function() {
          if (roadClassTimer) clearTimeout(roadClassTimer);
          roadClassTimer = setTimeout(reportRoadClass, 120);
        });

        try {
          var canvas = map.getCanvasContainer();
          canvas.addEventListener('pointerdown', function(event) {
            routeBuilderPointerCount += 1;
            if (!routeBuilderActive) return;
            if (routeBuilderPointerCount > 1) {
              cancelRouteBuilderDraw();
              return;
            }
            startRouteBuilderDraw(event);
          }, { passive: false });

          canvas.addEventListener('pointermove', function(event) {
            continueRouteBuilderDraw(event);
          }, { passive: false });

          canvas.addEventListener('pointerup', function(event) {
            routeBuilderPointerCount = Math.max(0, routeBuilderPointerCount - 1);
            endRouteBuilderDraw(event);
          }, { passive: false });

          canvas.addEventListener('pointercancel', function(event) {
            routeBuilderPointerCount = Math.max(0, routeBuilderPointerCount - 1);
            endRouteBuilderDraw(event);
          }, { passive: false });

          canvas.addEventListener('pointerleave', function(event) {
            if (routeBuilderPointerId === event.pointerId) {
              endRouteBuilderDraw(event);
            }
          }, { passive: false });
        } catch (e) {}
      }

      window.addEventListener('message', function(e) {
        var msg;
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          return;
        }

        if (!msg || !msg.type) return;

        if (msg.type === 'bootstrap' || msg.type === 'update') {
          pendingPayload = msg.payload || null;
          if (map && map.isStyleLoaded()) {
            applyPayload(pendingPayload);
          }
          return;
        }

        if (msg.type === 'cameraCommand') {
          issueCameraCommand(msg.payload || null);
          return;
        }

        if (msg.type === 'dynamicState') {
          applyDynamicState(msg.payload || null);
          return;
        }

        if (msg.type === DISPERSED_CAMPING_MESSAGE_TYPE) {
          setDispersedCampingEligibilityLayerEnabled(msg.payload || null);
          return;
        }

        if (msg.type === ESTABLISHED_CAMPSITES_MESSAGE_TYPE) {
          setEstablishedCampsitesLayerEnabled(msg.payload || null);
          return;
        }

        if (msg.type === 'requestCenter') {
          sendCenter();
          return;
        }

        if (msg.type === 'requestBounds') {
          sendBounds();
          return;
        }
      });

      init();
    })();
  </script>
</body>
</html>`;
}

function normalizeLatLng(value?: LatLng | null) {
  if (!value) return null;
  const latitude =
    typeof value.latitude === 'number'
      ? value.latitude
      : typeof value.lat === 'number'
        ? value.lat
        : null;
  const longitude =
    typeof value.longitude === 'number'
      ? value.longitude
      : typeof value.lng === 'number'
        ? value.lng
        : null;

  if (!isValidCoord(latitude ?? undefined, longitude ?? undefined)) return null;
  return { latitude: latitude as number, longitude: longitude as number };
}

function sameLatLng(a?: { latitude: number; longitude: number } | null, b?: { latitude: number; longitude: number } | null) {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) <= CAMERA_EPSILON &&
    Math.abs(a.longitude - b.longitude) <= CAMERA_EPSILON
  );
}

const MapRenderer = React.memo(function MapRenderer({
  points = [],
  progressPoints = [],
  waypoints = [],
  healthLevel = 'green',
  routeColor,
  progressColor,
  routeRenderMode = 'selected',
  mapStyle = DEFAULT_MAP_STYLE,
  mapboxToken,
  showUserLocation = false,
  followUser = false,
  userLocation = null,
  interactive = true,
  segments = [],
  bailoutMarkers = [],
  pinMarkers = [],
  showCrosshair = false,
  onLongPress,
  onPinTap,
  onSegmentTap,
  onMapTap,
  onMapCenterReply,
  requestCenterTrigger,
  onMapBoundsReply,
  requestBoundsTrigger,
  trailSegments = [],
  trailActive = false,
  replayMarker = null,
  followReplay = false,
  speedSegments = [],
  trailStyle = 'normal',
  onTiltAlertTap,
  onUserDrag,
  onRoadClassification,
  vehicleHeading = null,
  isLoading = false,
  hasToken = true,
  onRetry,
  onReadyStateChange,
  campsites = [],
  tiltAlerts = [],
  campsiteMarkers = [],
  campIntelMarkers = [],
  onCampIntelTap,
  campScoutMarkers = [],
  onCampScoutTap,
  tiltAlertMarkers = [],
  cameraMode,
  cameraCommand = null,
  cameraCommandTrigger,
  routeBuilderActive = false,
  routeBuilderSegments = [],
  routeBuilderColor = '#65F0D4',
  onRouteBuilderUpdate,
  onRouteBuilderGestureStateChange,
  remoteOverlay = null,
  dispersedCampingEligibility = null,
  onDispersedCampingRegionTap,
  establishedCampsites = null,
  onEstablishedCampsiteTap,
  campsiteSearchPolygon = null,
  style,
}: MapRendererProps) {
  const webViewRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);
  const [webBootTimedOut, setWebBootTimedOut] = useState(false);
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const bootstrapSentRef = useRef(false);
  const lastPayloadHashRef = useRef('');
  const lastDynamicPayloadHashRef = useRef('');
  const failSafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraCommandHashRef = useRef('');
  const lastLegacyFollowHashRef = useRef('');
  const previousHtmlHashRef = useRef<string>('');
  const autoRecoveryCountRef = useRef(0);
  const activeWebViewInstanceKeyRef = useRef(0);
  const activeFailSafeInstanceKeyRef = useRef<number | null>(null);
  const failSafeArmedInstanceKeyRef = useRef<number | null>(null);
  const bootstrapAcknowledgedInstanceKeyRef = useRef<number | null>(null);
  const loadStartedInstanceKeyRef = useRef<number | null>(null);
  const startupSettledRef = useRef(false);
  const definitiveReadyInstanceKeyRef = useRef<number | null>(null);

  const shouldLoadMap = !!hasToken && !!mapboxToken;

  useEffect(() => {
    onReadyStateChange?.(shouldLoadMap && webReady);
  }, [onReadyStateChange, shouldLoadMap, webReady]);

  const initialStyleUrl = useMemo(
    () => getMapStyleUrl(mapStyle || DEFAULT_MAP_STYLE),
    [mapStyle],
  );
  const latchedInitialStyleRef = useRef({
    instanceKey: 0,
    styleUrl: initialStyleUrl,
  });
  if (latchedInitialStyleRef.current.instanceKey !== webViewInstanceKey) {
    latchedInitialStyleRef.current = {
      instanceKey: webViewInstanceKey,
      styleUrl: initialStyleUrl,
    };
  }
  const bootStyleUrl = latchedInitialStyleRef.current.styleUrl;

  const html = useMemo(
    () =>
      shouldLoadMap
        ? makeMapHtml(mapboxToken, bootStyleUrl, MAP_STYLE_FALLBACK_CHAIN, webViewInstanceKey)
        : '',
    [shouldLoadMap, mapboxToken, bootStyleUrl, webViewInstanceKey],
  );
  const htmlHash = useMemo(() => stableStringify({
    shouldLoadMap,
    instanceKey: webViewInstanceKey,
    tokenPrefix: mapboxToken ? mapboxToken.slice(0, 8) : '',
    initialStyleUrl: bootStyleUrl,
  }), [shouldLoadMap, webViewInstanceKey, mapboxToken, bootStyleUrl]);

  const webViewKey = `ecs-map-webview-${webViewInstanceKey}`;
  const webViewSource = useMemo(() => ({ html }), [html]);
  const hasHandledInitialCenterTriggerRef = useRef(false);
  const hasHandledInitialBoundsTriggerRef = useRef(false);

  const clearFailSafeTimer = useCallback(() => {
    if (failSafeTimerRef.current) {
      clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
    activeFailSafeInstanceKeyRef.current = null;
  }, []);

  const resetRuntimeState = useCallback((options?: { clearRecoveryCount?: boolean }) => {
    setWebReady(false);
    setWebBootTimedOut(false);
    bootstrapSentRef.current = false;
    lastPayloadHashRef.current = '';
    lastDynamicPayloadHashRef.current = '';
    lastCameraCommandHashRef.current = '';
    lastLegacyFollowHashRef.current = '';
    hasHandledInitialCenterTriggerRef.current = false;
    hasHandledInitialBoundsTriggerRef.current = false;
    loadStartedInstanceKeyRef.current = null;
    failSafeArmedInstanceKeyRef.current = null;
    bootstrapAcknowledgedInstanceKeyRef.current = null;
    startupSettledRef.current = false;
    definitiveReadyInstanceKeyRef.current = null;
    if (options?.clearRecoveryCount) {
      autoRecoveryCountRef.current = 0;
    }
    clearFailSafeTimer();
  }, [clearFailSafeTimer]);

  const remountWebView = useCallback((reason: string) => {
    debugLog('[MapRenderer] Remounting WebView', {
      reason,
      instanceKey: activeWebViewInstanceKeyRef.current,
      recoveryCount: autoRecoveryCountRef.current,
    });
    resetRuntimeState();
    setWebViewInstanceKey((value) => value + 1);
  }, [resetRuntimeState]);

  const payload = useMemo<WebMapPayload>(
    () =>
      buildWebPayload({
        points,
        progressPoints,
        waypoints,
        healthLevel,
        routeColor,
        progressColor,
        routeRenderMode,
        mapStyle,
        mapboxToken,
        showUserLocation,
        userLocation,
        interactive,
        segments,
        bailoutMarkers,
        pinMarkers,
        showCrosshair,
        trailSegments,
        trailActive,
        speedSegments,
        trailStyle,
        campsites,
        tiltAlerts,
        campsiteMarkers,
        campIntelMarkers,
        campScoutMarkers,
        tiltAlertMarkers,
        routeBuilderActive,
        routeBuilderSegments,
        routeBuilderColor,
        remoteOverlay,
        campsiteSearchPolygon,
      }),
    [
      points,
      progressPoints,
      waypoints,
      healthLevel,
      routeColor,
      progressColor,
      routeRenderMode,
      mapStyle,
      mapboxToken,
      showUserLocation,
      userLocation,
      interactive,
      segments,
      bailoutMarkers,
      pinMarkers,
      showCrosshair,
      trailSegments,
      trailActive,
      speedSegments,
      trailStyle,
      campsites,
      tiltAlerts,
      campsiteMarkers,
      campIntelMarkers,
      campScoutMarkers,
      tiltAlertMarkers,
      routeBuilderActive,
      routeBuilderSegments,
      routeBuilderColor,
      remoteOverlay,
      campsiteSearchPolygon,
    ],
  );

  const dynamicPayload = useMemo(
    () =>
      buildDynamicPayload({
        replayMarker,
        userLocation,
        showUserLocation,
        vehicleHeading,
        cameraMode,
        interactive,
        routeBuilderActive,
      }),
    [replayMarker, userLocation, showUserLocation, vehicleHeading, cameraMode, interactive, routeBuilderActive],
  );

  const payloadHash = useMemo(() => buildMapOverlayPayloadHash(payload), [payload]);
  const dynamicPayloadHash = useMemo(() => stableStringify(dynamicPayload), [dynamicPayload]);
  const dispersedCampingEligibilityHash = useMemo(
    () => stableStringify(dispersedCampingEligibility ?? { enabled: false }),
    [dispersedCampingEligibility],
  );
  const establishedCampsitesHash = useMemo(
    () => stableStringify(establishedCampsites ?? { enabled: false }),
    [establishedCampsites],
  );

  useEffect(() => {
    if (!shouldLoadMap) {
      resetRuntimeState({ clearRecoveryCount: true });
    }
  }, [resetRuntimeState, shouldLoadMap]);

  useEffect(() => {
    activeWebViewInstanceKeyRef.current = webViewInstanceKey;
    loadStartedInstanceKeyRef.current = null;
    failSafeArmedInstanceKeyRef.current = null;
    bootstrapAcknowledgedInstanceKeyRef.current = null;
    startupSettledRef.current = false;
    definitiveReadyInstanceKeyRef.current = null;
  }, [webViewInstanceKey]);

  useEffect(() => {
    debugLog('[MapRenderer] mounted');
    return () => {
      debugLog('[MapRenderer] unmounted');
    };
  }, []);

  useEffect(() => {
    if (previousHtmlHashRef.current && previousHtmlHashRef.current !== htmlHash) {
      debugLog('[MapRenderer] html source changed', {
        prev: previousHtmlHashRef.current,
        next: htmlHash,
      });
    }
    previousHtmlHashRef.current = htmlHash;
  }, [htmlHash]);

  useEffect(() => {
    debugLog('[MapRenderer] render state', {
      shouldLoadMap,
      webReady,
      webBootTimedOut,
      webViewInstanceKey,
      mapStyle,
      hasToken,
      isLoading,
      points: points.length,
      waypoints: waypoints.length,
      segments: segments.length,
      pins: pinMarkers.length,
      trailSegments: trailSegments.length,
      routeBuilderActive,
      routeBuilderSegments: routeBuilderSegments.length,
    });
  }, [
    shouldLoadMap,
    webReady,
    webBootTimedOut,
    webViewInstanceKey,
    mapStyle,
    hasToken,
    isLoading,
    points.length,
    waypoints.length,
    segments.length,
    pinMarkers.length,
    trailSegments.length,
    routeBuilderActive,
    routeBuilderSegments.length,
  ]);

  useEffect(() => {
    if (!shouldLoadMap) return;
    if (!webBootTimedOut) return;
    if (webReady) return;
    if (startupSettledRef.current) return;
    if (definitiveReadyInstanceKeyRef.current === webViewInstanceKey) return;
    if (autoRecoveryCountRef.current >= WEBVIEW_AUTO_RECOVERY_LIMIT) return;

    autoRecoveryCountRef.current += 1;
    debugLog(
      `[MapRenderer] Auto-recovery remount after cold-start timeout (${autoRecoveryCountRef.current}/${WEBVIEW_AUTO_RECOVERY_LIMIT})`,
    );
    remountWebView('cold_start_timeout');
  }, [remountWebView, shouldLoadMap, webBootTimedOut, webReady, webViewInstanceKey]);

  const safeInject = useCallback((message: unknown) => {
    try {
      if (!webViewRef.current) return;

      const json = JSON.stringify(message);
      const escaped = json
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');

      webViewRef.current.injectJavaScript(`
        try {
          window.dispatchEvent(new MessageEvent('message', { data: \`${escaped}\` }));
        } catch (e) {}
        true;
      `);
    } catch (e) {
      console.warn('[MapRenderer] inject fail', e);
    }
  }, []);

  const postToMap = useCallback((message: unknown) => {
    safeInject(message);
  }, [safeInject]);

  const armFailSafeTimer = useCallback(
    (instanceKeyAtSchedule: number, timeoutMs: number, phase: 'initial' | 'bootstrap_progress') => {
      clearFailSafeTimer();
      failSafeArmedInstanceKeyRef.current = instanceKeyAtSchedule;
      activeFailSafeInstanceKeyRef.current = instanceKeyAtSchedule;

      failSafeTimerRef.current = setTimeout(() => {
        const isCurrentInstance =
          activeWebViewInstanceKeyRef.current === instanceKeyAtSchedule &&
          activeFailSafeInstanceKeyRef.current === instanceKeyAtSchedule &&
          failSafeArmedInstanceKeyRef.current === instanceKeyAtSchedule &&
          !startupSettledRef.current;

        if (!isCurrentInstance) {
          debugLog('[MapRenderer] Ignoring stale failsafe timer', {
            scheduledFor: instanceKeyAtSchedule,
            current: activeWebViewInstanceKeyRef.current,
            phase,
          });
          return;
        }

        debugLog('[MapRenderer] FAILSAFE TRIGGERED', {
          instanceKey: instanceKeyAtSchedule,
          phase,
        });
        setWebBootTimedOut(true);
      }, timeoutMs);
    },
    [clearFailSafeTimer],
  );

  useEffect(() => {
    if (!shouldLoadMap) return;
    if (startupSettledRef.current) return;
    if (definitiveReadyInstanceKeyRef.current === webViewInstanceKey) return;
    if (failSafeArmedInstanceKeyRef.current === webViewInstanceKey) return;

    setWebBootTimedOut(false);
    const instanceKeyAtSchedule = webViewInstanceKey;
    armFailSafeTimer(instanceKeyAtSchedule, WEBVIEW_FAILSAFE_TIMEOUT_MS, 'initial');

    return () => {
      if (failSafeArmedInstanceKeyRef.current === instanceKeyAtSchedule) {
        failSafeArmedInstanceKeyRef.current = null;
      }
      if (activeFailSafeInstanceKeyRef.current === instanceKeyAtSchedule) {
        activeFailSafeInstanceKeyRef.current = null;
      }
      clearFailSafeTimer();
    };
  }, [armFailSafeTimer, clearFailSafeTimer, shouldLoadMap, webViewInstanceKey]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const type = bootstrapSentRef.current ? 'update' : 'bootstrap';

    if (type === 'update' && payloadHash === lastPayloadHashRef.current) {
      return;
    }

    postToMap({ type, payload: { ...payload, ...dynamicPayload } });

    bootstrapSentRef.current = true;
    lastPayloadHashRef.current = payloadHash;
    lastDynamicPayloadHashRef.current = dynamicPayloadHash;
  }, [shouldLoadMap, webReady, payload, dynamicPayload, payloadHash, dynamicPayloadHash, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (!bootstrapSentRef.current) return;
    if (dynamicPayloadHash === lastDynamicPayloadHashRef.current) return;

    postToMap({ type: 'dynamicState', payload: dynamicPayload });
    lastDynamicPayloadHashRef.current = dynamicPayloadHash;
  }, [shouldLoadMap, webReady, dynamicPayload, dynamicPayloadHash, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const enabled = !!dispersedCampingEligibility?.enabled;
    postToMap({
      type: SET_DISPERSED_CAMPING_LAYER_ENABLED,
      payload: {
        enabled,
        geojson: enabled ? dispersedCampingEligibility?.geojson : undefined,
      },
    });
  }, [
    shouldLoadMap,
    webReady,
    postToMap,
    dispersedCampingEligibility,
    dispersedCampingEligibilityHash,
  ]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const enabled = !!establishedCampsites?.enabled;
    postToMap({
      type: SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED,
      payload: {
        enabled,
        geojson: enabled ? establishedCampsites?.geojson : undefined,
      },
    });
  }, [
    shouldLoadMap,
    webReady,
    postToMap,
    establishedCampsites,
    establishedCampsitesHash,
  ]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (!cameraCommand) return;

    const commandHash = buildCameraCommandHash(cameraCommand, cameraCommandTrigger);
    if (!commandHash || commandHash === lastCameraCommandHashRef.current) return;

    postToMap({ type: 'cameraCommand', payload: cameraCommand });
    lastCameraCommandHashRef.current = commandHash;
  }, [shouldLoadMap, webReady, cameraCommand, cameraCommandTrigger, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const user = normalizeLatLng(userLocation);
    const replay = normalizeLatLng(replayMarker as any);

    let fallbackCommand: CameraCommand | null = null;

    if (followReplay && replay) {
      fallbackCommand = {
        mode: 'replay',
        center: replay,
        durationMs: 450,
        animate: true,
        reason: 'legacy_follow_replay',
      };
    } else if (followUser && user) {
      fallbackCommand = {
        mode: 'follow_user',
        center: user,
        durationMs: 500,
        animate: true,
        reason: 'legacy_follow_user',
      };
    }

    if (!fallbackCommand) return;

    const fallbackHash = buildCameraCommandHash(fallbackCommand, undefined);
    if (fallbackHash === lastLegacyFollowHashRef.current) return;

    postToMap({ type: 'cameraCommand', payload: fallbackCommand });
    lastLegacyFollowHashRef.current = fallbackHash;
  }, [shouldLoadMap, webReady, cameraCommand, followReplay, replayMarker, followUser, userLocation, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (typeof requestCenterTrigger !== 'number') return;

    if (!hasHandledInitialCenterTriggerRef.current) {
      hasHandledInitialCenterTriggerRef.current = true;
      return;
    }

    postToMap({ type: 'requestCenter' });
  }, [requestCenterTrigger, shouldLoadMap, webReady, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (typeof requestBoundsTrigger !== 'number') return;

    if (!hasHandledInitialBoundsTriggerRef.current) {
      hasHandledInitialBoundsTriggerRef.current = true;
      return;
    }

    postToMap({ type: 'requestBounds' });
  }, [requestBoundsTrigger, shouldLoadMap, webReady, postToMap]);

  const handleMessage = useCallback((event: any) => {
    let message: any;

    try {
      message = JSON.parse(event?.nativeEvent?.data || '{}');
    } catch {
      debugLog('[MapRenderer] message parse fail');
      return;
    }

    const { type, payload } = message || {};
    const messageInstanceKey =
      typeof message?.instanceKey === 'number' ? message.instanceKey : null;

    if (
      messageInstanceKey !== null &&
      messageInstanceKey !== activeWebViewInstanceKeyRef.current
    ) {
      debugLog('[MapRenderer] Ignoring stale WebView message', {
        type,
        from: messageInstanceKey,
        current: activeWebViewInstanceKeyRef.current,
      });
      return;
    }

    switch (type) {
      case 'log':
        if (typeof payload === 'string' && payload.includes('[CAMP_LAYER_DEBUG]')) {
          campLayerDebugLog('[WEBVIEW]', payload);
          return;
        }
        if (typeof payload === 'string' && payload.includes('[CAMP_SCOUT_DEBUG]')) {
          campScoutDebugLog('[WEBVIEW]', payload);
          return;
        }
        debugLog('[WEBVIEW]', payload);
        return;

      case 'mapReady':
        debugLog('[MapRenderer] mapReady received', payload);
        if (payload?.ok === false) {
          if (definitiveReadyInstanceKeyRef.current === activeWebViewInstanceKeyRef.current) {
            debugLog('[MapRenderer] Ignoring late mapReady failure after definitive ready', payload);
            return;
          }

          clearFailSafeTimer();
          failSafeArmedInstanceKeyRef.current = null;
          startupSettledRef.current = true;
          setWebReady(false);
          setWebBootTimedOut(true);
          return;
        }

        if (payload?.reason === 'bootstrap_timeout') {
          debugLog('[MapRenderer] Provisional bootstrap timeout received; extending startup window');
          if (
            bootstrapAcknowledgedInstanceKeyRef.current !== activeWebViewInstanceKeyRef.current &&
            definitiveReadyInstanceKeyRef.current !== activeWebViewInstanceKeyRef.current
          ) {
            bootstrapAcknowledgedInstanceKeyRef.current = activeWebViewInstanceKeyRef.current;
            setWebBootTimedOut(false);
            armFailSafeTimer(
              activeWebViewInstanceKeyRef.current,
              WEBVIEW_PROGRESS_FAILSAFE_TIMEOUT_MS,
              'bootstrap_progress',
            );
          }
          return;
        }

        clearFailSafeTimer();
        failSafeArmedInstanceKeyRef.current = null;
        startupSettledRef.current = true;
        definitiveReadyInstanceKeyRef.current = activeWebViewInstanceKeyRef.current;
        setWebBootTimedOut(false);
        setWebReady(true);
        return;

      case 'longPress':
        onLongPress?.(payload);
        return;

      case 'mapTap':
        onMapTap?.(payload);
        return;

      case 'segmentTap':
        onSegmentTap?.(payload);
        return;

      case DISPERSED_CAMPING_REGION_SELECTED:
        onDispersedCampingRegionTap?.(payload);
        return;

      case ESTABLISHED_CAMPSITE_SELECTED:
        onEstablishedCampsiteTap?.(payload);
        return;

      case 'pinTap':
        if (payload?.kind === 'tiltAlert') {
          onTiltAlertTap?.(payload);
          return;
        }
        if (payload?.kind === 'campIntel') {
          onCampIntelTap?.(payload);
          return;
        }
        if (payload?.kind === 'campScout') {
          onCampScoutTap?.(payload);
          return;
        }
        onPinTap?.(payload);
        return;

      case 'mapCenterReply':
        onMapCenterReply?.(payload);
        return;

      case 'mapBoundsReply':
        onMapBoundsReply?.(payload);
        return;

      case 'userDrag':
        onUserDrag?.();
        return;

      case 'routeBuilderUpdate':
        onRouteBuilderUpdate?.(payload);
        return;

      case 'routeBuilderGesture':
        onRouteBuilderGestureStateChange?.(payload);
        return;

      case 'roadClassification':
        onRoadClassification?.(payload);
        return;

      case 'styleFallbackExhausted':
        debugLog('[MapRenderer] style fallback exhausted', payload);
        return;

      default:
        return;
    }
  }, [
    armFailSafeTimer,
    clearFailSafeTimer,
    onLongPress,
    onMapTap,
    onSegmentTap,
    onDispersedCampingRegionTap,
    onEstablishedCampsiteTap,
    onPinTap,
    onMapCenterReply,
    onMapBoundsReply,
    onTiltAlertTap,
    onCampIntelTap,
    onCampScoutTap,
    onUserDrag,
    onRouteBuilderUpdate,
    onRouteBuilderGestureStateChange,
    onRoadClassification,
  ]);

  return (
    <View style={[styles.container, style]}>
      {shouldLoadMap ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={webViewSource}
          originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          androidLayerType="hardware"
          cacheEnabled
          onLoadStart={() => {
            const isFirstLoadForInstance = loadStartedInstanceKeyRef.current !== webViewInstanceKey;
            const isDefinitivelyReady =
              definitiveReadyInstanceKeyRef.current === webViewInstanceKey;
            debugLog('[MapRenderer] WebView load start', {
              key: webViewKey,
              recoveryCount: autoRecoveryCountRef.current,
              firstLoadForInstance: isFirstLoadForInstance,
              startupSettled: startupSettledRef.current,
              definitivelyReady: isDefinitivelyReady,
            });
            loadStartedInstanceKeyRef.current = webViewInstanceKey;
            if (!startupSettledRef.current && !isDefinitivelyReady && isFirstLoadForInstance) {
              setWebReady(false);
              setWebBootTimedOut(false);
            }
            activeFailSafeInstanceKeyRef.current = webViewInstanceKey;
          }}
          onLoadEnd={() => {
            debugLog('[MapRenderer] WebView load end');
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (definitiveReadyInstanceKeyRef.current === webViewInstanceKey) {
              console.warn('[MapRenderer] Ignoring WebView error after definitive ready', nativeEvent);
              return;
            }
            console.warn('[MapRenderer] WebView error', nativeEvent);
            clearFailSafeTimer();
            failSafeArmedInstanceKeyRef.current = null;
            startupSettledRef.current = true;
            setWebReady(false);
            setWebBootTimedOut(true);
          }}
          onRenderProcessGone={() => {
            console.warn('[MapRenderer] WebView crashed → remount');
            remountWebView('render_process_gone');
          }}
          onContentProcessDidTerminate={() => {
            console.warn('[MapRenderer] iOS WebView terminated → remount');
            remountWebView('content_process_terminated');
          }}
          style={styles.webview}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Map unavailable</Text>
          <Text style={styles.placeholderText}>
            {!hasToken || !mapboxToken
              ? 'Map token unavailable. Cloud-backed map rendering is not ready in this session.'
              : 'Map is still loading.'}
          </Text>
          {!!onRetry && (
            <Text style={styles.placeholderHint}>Use your existing retry control to reinitialize the map surface.</Text>
          )}
        </View>
      )}

      {!webReady && shouldLoadMap && (
        <View style={styles.loadingOverlay}>
          {!webBootTimedOut ? (
            <>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingTitle}>Initializing tactical surface…</Text>
            </>
          ) : (
            <>
              <Text style={styles.loadingTitle}>Map initialization delayed</Text>
              <Text style={styles.loadingSubtitle}>
                Tactical surface is taking longer than expected to boot.
              </Text>
              {!!onRetry && (
                <Text style={styles.loadingHint}>
                  Use your existing retry control to reinitialize the map surface.
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
});

MapRenderer.displayName = 'MapRenderer';

export default MapRenderer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: TACTICAL.bg,
  },
  placeholderTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  placeholderText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  placeholderHint: {
    marginTop: 10,
    color: TACTICAL.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.88,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,13,18,0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingTitle: {
    marginTop: 12,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 8,
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingHint: {
    marginTop: 8,
    color: TACTICAL.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.9,
  },
});
