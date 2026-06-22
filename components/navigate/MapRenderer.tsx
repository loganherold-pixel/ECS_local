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
  MAPBOX_3D_RENDER_BASE_STYLE_URL,
  type MapStyleKey,
  HEALTH_COLORS,
  computeBounds,
  boundsToZoom,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../lib/mapConfig';
import { ecsLog } from '../../lib/ecsLogger';
import { TACTICAL } from '../../lib/theme';
import MapFallbackSurface from './MapFallbackSurface';
import type { CampIntelMarkerPayload, CampIntelTone } from '../../lib/campIntel/campIntelTypes';
import { hasCampStructurePrivacyBufferConflict } from '../../lib/campsites/campStructurePrivacyBuffer';
import { MAX_CAMPSITE_MARKERS } from '../../lib/campsites/campsiteThresholds';
import type {
  DispersedCampingEligibilityLayerState,
  DispersedCampingRegionSelectionPayload,
} from '../../lib/map/dispersedCampingTypes';
import {
  DISPERSED_ROUTE_LEG_PLANNING_WARNING,
  type DispersedRouteLegSelectionPayload,
  type RouteSegmentSourceMetadata,
} from '../../lib/map/dispersedCampingSegmentBuild';
import type {
  EstablishedCampsiteLayerState,
  EstablishedCampsiteSelectionPayload,
} from '../../lib/map/establishedCampsiteTypes';
import {
  DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM,
  ESTABLISHED_CAMPSITES_MIN_ZOOM,
} from '../../lib/map/campLayerZoom';
import {
  DISPERSED_CAMPING_REGION_SELECTED,
  ESTABLISHED_CAMPSITE_SELECTED,
  SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED,
  SET_DISPERSED_CAMPING_LAYER_ENABLED,
  SET_DISPERSED_ROUTE_BUILD_ENABLED,
} from '../../lib/map/mapboxLayerMessages';
import type { RemoteMapOverlayPayload } from '../../lib/remote/mapOverlay';
import {
  resolveViewportMarkerHeadingDeg,
} from '../../lib/mapMotion';
import type { MapMotionPriority } from '../../lib/mapSurfaceCoordinator';

const WEBVIEW_ORIGIN_WHITELIST = ['*'];
const WEBVIEW_FAILSAFE_TIMEOUT_MS = 30000;
const WEBVIEW_PROGRESS_FAILSAFE_TIMEOUT_MS = 45000;
const WEBVIEW_HARD_FAILURE_TIMEOUT_MS = 90000;
const MAP_CONSTRUCTOR_RETRY_LIMIT = 3;
const MAP_CONSTRUCTOR_RETRY_BASE_MS = 650;
const MAPBOX_WEBVIEW_GL_JS_VERSION = 'v2.15.0';
const COMPACT_MAP_MAX_TILE_CACHE_SIZE = 48;
const MAX_KNOWN_CAMPSITE_SOURCE_MARKERS = 40;
const MAX_ROUTE_RENDER_POINTS = 2400;
const MAX_PROGRESS_ROUTE_RENDER_POINTS = 2400;
const ROUTE_RENDER_TURN_DELTA_DEGREES = 8;
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
const MAPBOX_3D_TERRAIN_SOURCE_ID = 'ecs-navigate-3d-terrain-dem';
export const CAMP_SCOUT_PIN_SOURCE_ID = 'ecs-camp-scout-pins-source';
export const CAMP_SCOUT_PIN_LAYER_ID = 'ecs-camp-scout-pins-layer';
export const DISPERSED_CAMPING_ELIGIBILITY_SOURCE_ID = 'ecs-dispersed-camping-eligibility';
export const DISPERSED_CAMPING_ELIGIBILITY_FILL_LAYER_ID = 'ecs-dispersed-camping-eligibility-fill';
export const DISPERSED_CAMPING_ELIGIBILITY_OUTLINE_LAYER_ID = 'ecs-dispersed-camping-eligibility-outline';
export const DISPERSED_ROUTE_BUILD_SOURCE_ID = 'ecs-dispersed-route-build-segments';
export const DISPERSED_ROUTE_BUILD_LAYER_ID = 'ecs-dispersed-route-build-segments-layer';
export const DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID = 'ecs-dispersed-route-build-selected-layer';
export const ESTABLISHED_CAMPSITES_SOURCE_ID = 'ecs-established-campsites';
export const ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID = 'ecs-established-campsites-backplate';
export const ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID = 'ecs-established-campsites-symbol';
const MAP_STYLE_FALLBACK_CHAIN = Array.from(new Set([
  MAPBOX_3D_RENDER_BASE_STYLE_URL,
  'mapbox://styles/mapbox/streets-v12',
  'mapbox://styles/mapbox/dark-v11',
]));

type LatLng = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
};

type RouteProfileFocusPayload = {
  coordinate?: LatLng | null;
  latitude?: number;
  longitude?: number;
  elevationFeet?: number | null;
  distanceMiles?: number | null;
  riskLevel?: string | null;
  label?: string | null;
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
  sourceKind?: string | null;
  dataState?: string | null;
  confidence?: string | null;
  warnings?: string[] | null;
  routeGeometrySelected?: boolean;
  routeGeometrySourceKind?: string | null;
  routeGeometryDataState?: string | null;
  routeGeometryConfidence?: string | null;
  routeGeometryWarningsJson?: string | null;
};

export type SegmentSelectionPayload = {
  kind?: string | null;
  id?: string | number | null;
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  color?: string | null;
  routeGeometrySourceKind?: string | null;
  routeGeometryDataState?: string | null;
  routeGeometryConfidence?: string | null;
  routeGeometryWarningsJson?: string | null;
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
  mapChar?: string;
  resolved?: boolean;
  confidence?: string;
  confidenceScore?: number;
  rating?: string;
  score?: number;
  rank?: number;
  rankLabel?: string;
  ratingFactors?: { label: string; value?: string | number; impact?: string; description?: string }[];
  selected?: boolean;
  badges?: { label: string; tone: CampIntelTone }[];
  markerKind?: string;
  routeCatalogRouteId?: string;
  geometryStatus?: string;
  guidanceReady?: boolean;
  sourceLabel?: string;
  distanceMiles?: number | null;
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
  rankLabel?: string;
  selected?: boolean;
  legalityStatus?: 'verified_allowed' | 'likely_allowed_needs_verification' | 'unknown_needs_verification' | 'restricted_or_not_allowed';
  warnings?: string[];
  reasons?: string[];
  distanceFromRoadOrTrail?: number;
  slope?: number;
  accessNotes?: string;
  nearBuildings?: boolean;
  nearStructure?: boolean;
  nearResidentialStructure?: boolean;
  nearestBuildingMiles?: number;
  nearestBuildingDistanceMiles?: number;
  buildingDistanceMiles?: number;
  distanceToBuildingMiles?: number;
  distanceFromBuildingMiles?: number;
  nearestStructureMiles?: number;
  nearestStructureDistanceMiles?: number;
  structureDistanceMiles?: number;
  distanceToStructureMiles?: number;
  distanceFromStructureMiles?: number;
  nearestResidentialStructureMiles?: number;
  nearestResidentialStructureDistanceMiles?: number;
  residentialStructureDistanceMiles?: number;
  distanceToResidentialStructureMiles?: number;
  distanceFromResidentialStructureMiles?: number;
  pinFamily?: 'camp_scout' | 'campops';
  campOpsRole?: 'candidate' | 'recommended' | 'backup' | 'emergency';
  campOpsCandidateId?: string;
  campOpsRoleLabel?: string;
  accessibilityLabel?: string;
};

export type CampOpsCampEndpointMapMarkerPayload = CampScoutMapMarkerPayload;

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
  snapStatus?: 'snapped' | 'raw_smoothed' | 'too_short' | 'ambiguous' | 'failed' | 'network_pending' | 'blocked' | null;
  snapProvider?: 'rendered_features' | 'mapbox_map_matching' | 'ecs_route_geometry' | null;
  snapProfile?: 'driving' | null;
  snapMessage?: string | null;
  sourceSegmentId?: string | null;
  buildSource?: RouteSegmentSourceMetadata | null;
};

export type RouteBuilderAnchorMarker = {
  id: string;
  label: string;
  coordinate: LatLng;
  role?: 'operator_drop' | 'active_guidance_end';
  hidden?: boolean;
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
  routeLineKey?: string | null;
  showTrailEntryEndpointMarker?: boolean;
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
  onLongPress?: (coord: LatLng & { routeableFeature?: any }) => void;
  onBailoutTap?: (pin: any) => void;
  onPinTap?: (pin: any) => void;
  onSegmentTap?: (segment: SegmentSelectionPayload) => void;
  onMapTap?: (coord: { latitude: number; longitude: number; routeableFeature?: any }) => void;
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
  motionPriority?: MapMotionPriority;
  isLoading?: boolean;
  hasToken?: boolean;
  onRetry?: () => void | Promise<void>;
  onReadyStateChange?: (ready: boolean) => void;
  campsites?: MarkerLike[];
  tiltAlerts?: MarkerLike[];
  campsiteMarkers?: MarkerLike[];
  campIntelMarkers?: CampIntelMarkerPayload[];
  onCampIntelTap?: (camp: any) => void;
  campEndpointMarkers?: CampOpsCampEndpointMapMarkerPayload[];
  onCampEndpointTap?: (camp: any) => void;
  campScoutMarkers?: CampScoutMapMarkerPayload[];
  onCampScoutTap?: (camp: any) => void;
  tiltAlertMarkers?: MarkerLike[];
  cameraMode?: CameraMode;
  cameraCommand?: CameraCommand | null;
  cameraCommandTrigger?: number;
  routeBuilderActive?: boolean;
  routeBuilderMode?: 'freehand' | 'anchor_trace';
  routeBuilderSegments?: RouteBuilderSegmentData[];
  routeBuilderAnchors?: RouteBuilderAnchorMarker[];
  selectedRouteGeometrySegmentIds?: string[];
  routeBuilderColor?: string;
  routeProfileFocus?: RouteProfileFocusPayload | null;
  onRouteBuilderUpdate?: (payload: RouteBuilderUpdatePayload) => void;
  onRouteBuilderGestureStateChange?: (payload: {
    isDrawing: boolean;
    snapSource?: string | null;
  }) => void;
  remoteOverlay?: RemoteMapOverlayPayload | null;
  dispersedCampingEligibility?: DispersedCampingEligibilityLayerState | null;
  dispersedRouteBuild?: {
    enabled: boolean;
    selectedSegmentIds: string[];
    renderKey?: string | number;
  } | null;
  onDispersedCampingRegionTap?: (payload: DispersedCampingRegionSelectionPayload) => void;
  onDispersedRouteLegTap?: (payload: DispersedRouteLegSelectionPayload) => void;
  establishedCampsites?: EstablishedCampsiteLayerState | null;
  onEstablishedCampsiteTap?: (payload: EstablishedCampsiteSelectionPayload) => void;
  campsiteSearchPolygon?: {
    coordinates: { latitude: number; longitude: number }[];
    closed: boolean;
  } | null;
  surfaceMode?: 'full' | 'compact';
  style?: any;
};

function isRouteBuilderSegmentProvisional(segment: RouteBuilderSegmentData): boolean {
  return (
    segment.buildSource?.kind === 'active_guidance_extension' &&
    segment.snapProvider !== 'ecs_route_geometry' &&
    segment.snapProvider !== 'mapbox_map_matching'
  );
}

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
  mapChar?: string;
  resolved?: boolean;
  markerKind?: string;
  routeCatalogRouteId?: string;
  geometryStatus?: string;
  guidanceReady?: boolean;
  sourceLabel?: string;
  distanceMiles?: number | null;
};

export type TrailSegmentData = TrailSegment;
export type SpeedSegmentData = SpeedSegment;

type WebMapPayload = {
  routeCoords: [number, number][];
  progressRouteCoords: [number, number][];
  routeColor: string;
  progressColor: string;
  routeRenderMode: RouteRenderMode;
  routeLineKey: string | null;
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
    routeGeometrySelected?: boolean;
    routeGeometrySourceKind?: string | null;
    routeGeometryDataState?: string | null;
    routeGeometryConfidence?: string | null;
    routeGeometryWarningsJson?: string | null;
  }[];
  selectedRouteGeometrySegmentIds: string[];
  waypoints: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    subtitle?: string;
    endpointRole?: 'trail_entry' | 'trail_end';
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
    mapChar?: string;
    resolved?: boolean;
    markerKind?: string;
    routeCatalogRouteId?: string;
    geometryStatus?: string;
    guidanceReady?: boolean;
    sourceLabel?: string;
    distanceMiles?: number | null;
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
  motionPriority: MapMotionPriority;
  showCrosshair: boolean;
  interactive: boolean;
  mapStyleKey: MapStyleKey;
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
  routeBuilderMode: 'freehand' | 'anchor_trace';
  routeBuilderColor: string;
  routeBuilderSegments: {
    id: string;
    coordinates: [number, number][];
    rawSegment?: [number, number][];
    snappedSegment?: [number, number][];
    snapConfidence?: 'high' | 'medium' | 'low' | null;
    snapSource?: string | null;
    snapStatus?: 'snapped' | 'raw_smoothed' | 'too_short' | 'ambiguous' | 'failed' | 'network_pending' | 'blocked' | null;
    snapProvider?: 'rendered_features' | 'mapbox_map_matching' | 'ecs_route_geometry' | null;
    snapProfile?: 'driving' | null;
    snapMessage?: string | null;
    sourceSegmentId?: string | null;
    buildSource?: RouteSegmentSourceMetadata | null;
    provisional?: boolean;
  }[];
  routeBuilderAnchors: RouteBuilderAnchorMarker[];
  routeProfileFocus: {
    latitude: number;
    longitude: number;
    elevationFeet: number | null;
    distanceMiles: number | null;
    riskLevel: string | null;
    label: string;
    bearing: number;
  } | null;
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
  motionPriority: MapMotionPriority;
  cameraMode: CameraMode | null;
  interactive: boolean;
  routeBuilderActive: boolean;
  routeBuilderMode: 'freehand' | 'anchor_trace';
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

function distanceMetersBetweenLngLat(left: [number, number], right: [number, number]) {
  const earthRadiusM = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(right[1] - left[1]);
  const dLng = toRad(right[0] - left[0]);
  const lat1 = toRad(left[1]);
  const lat2 = toRad(right[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

const ROUTE_ENDPOINT_WAYPOINT_DEDUPE_METERS = 150;

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

function bearingDegreesBetweenLngLat(start: [number, number], end: [number, number]) {
  if (coordinatesSame(start, end)) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const startLat = toRad(start[1]);
  const endLat = toRad(end[1]);
  const deltaLng = toRad(end[0] - start[0]);
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function resolveRouteProfileFocusBearing(
  routeCoords: [number, number][],
  coordinate: { latitude: number; longitude: number },
): number {
  if (!routeCoords.length) return 0;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routeCoords.length; index += 1) {
    const point = routeCoords[index];
    const distance =
      (point[0] - coordinate.longitude) ** 2 +
      (point[1] - coordinate.latitude) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  const before = routeCoords[Math.max(0, nearestIndex - 1)] ?? null;
  const after = routeCoords[Math.min(routeCoords.length - 1, nearestIndex + 1)] ?? null;
  const fallbackCurrent: [number, number] = [coordinate.longitude, coordinate.latitude];
  const bearing =
    before && after && !coordinatesSame(before, after)
      ? bearingDegreesBetweenLngLat(before, after)
      : after && !coordinatesSame(fallbackCurrent, after)
        ? bearingDegreesBetweenLngLat(fallbackCurrent, after)
        : before && !coordinatesSame(before, fallbackCurrent)
          ? bearingDegreesBetweenLngLat(before, fallbackCurrent)
          : null;

  return Number.isFinite(bearing ?? NaN) ? Number(bearing) : 0;
}

function normalizeRouteProfileFocusPayload(
  input: RouteProfileFocusPayload | null | undefined,
  routeCoords: [number, number][],
): WebMapPayload['routeProfileFocus'] {
  if (!input) return null;
  const coordinate = normalizeLatLng(input.coordinate ?? input);
  if (!coordinate) return null;

  const elevationFeet = Number.isFinite(input.elevationFeet ?? NaN)
    ? Math.round(Number(input.elevationFeet))
    : null;
  const distanceMiles = Number.isFinite(input.distanceMiles ?? NaN)
    ? Number(input.distanceMiles)
    : null;
  const label =
    typeof input.label === 'string' && input.label.trim().length > 0
      ? input.label.trim()
      : elevationFeet !== null
        ? `${elevationFeet.toLocaleString()} ft`
        : 'Elevation';

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    elevationFeet,
    distanceMiles,
    riskLevel:
      typeof input.riskLevel === 'string' && input.riskLevel.trim().length > 0
        ? input.riskLevel.trim()
        : null,
    label,
    bearing: resolveRouteProfileFocusBearing(routeCoords, coordinate),
  };
}

function bearingDeltaDegrees(
  before: [number, number],
  current: [number, number],
  after: [number, number],
) {
  const inbound = bearingDegreesBetweenLngLat(before, current);
  const outbound = bearingDegreesBetweenLngLat(current, after);
  if (inbound == null || outbound == null) return 0;
  const delta = Math.abs(inbound - outbound) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function selectEvenlyDistributedIndexes(indexes: number[], limit: number) {
  if (limit <= 0 || indexes.length === 0) return [];
  if (indexes.length <= limit) return indexes;
  if (limit === 1) return [indexes[Math.floor(indexes.length / 2)]];

  const selected: number[] = [];
  const lastPosition = indexes.length - 1;
  for (let slot = 0; slot < limit; slot += 1) {
    const position = Math.round((slot * lastPosition) / (limit - 1));
    const value = indexes[position];
    if (selected[selected.length - 1] !== value) {
      selected.push(value);
    }
  }
  return selected;
}

function preserveRouteGeometryForRendering(
  points: [number, number][],
  maxPoints: number,
): [number, number][] {
  if (points.length <= maxPoints) return points;
  if (maxPoints <= 1) return points.slice(0, Math.max(maxPoints, 0));

  const lastIndex = points.length - 1;
  const selected = new Set<number>([0, lastIndex]);
  const turnIndexes: number[] = [];
  const strideIndexes: number[] = [];
  const stride = Math.max(1, Math.ceil((points.length - 2) / Math.max(maxPoints - 2, 1)));

  for (let index = 1; index < lastIndex; index += 1) {
    const turnDelta = bearingDeltaDegrees(points[index - 1], points[index], points[index + 1]);
    if (turnDelta >= ROUTE_RENDER_TURN_DELTA_DEGREES) {
      turnIndexes.push(index);
    } else if (index % stride === 0) {
      strideIndexes.push(index);
    }
  }

  for (const index of selectEvenlyDistributedIndexes(turnIndexes, maxPoints - selected.size)) {
    selected.add(index);
  }

  const remainingBudget = maxPoints - selected.size;
  const fillIndexes = strideIndexes.filter((index) => !selected.has(index));
  for (const index of selectEvenlyDistributedIndexes(fillIndexes, remainingBudget)) {
    selected.add(index);
  }

  return Array.from(selected)
    .sort((left, right) => left - right)
    .map((index) => points[index]);
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
  options: { showTrailEntryEndpointMarker?: boolean } = {},
): WebMapPayload['waypoints'] {
  const rendered: WebMapPayload['waypoints'] = [];
  const seen = new Set<string>();
  const hasRoute = routeCoords.length > 1;
  const startCoord = hasRoute ? routeCoords[0] : null;
  const endCoord = hasRoute ? routeCoords[routeCoords.length - 1] : null;
  const addWaypoint = (
    id: string,
    latitude: number,
    longitude: number,
    title: string,
    options: { subtitle?: string; endpointRole?: 'trail_entry' | 'trail_end' } = {},
  ) => {
    if (!isValidCoord(latitude, longitude)) return;
    const coordinateKey = routeCoordinateKey(latitude, longitude);
    if (seen.has(coordinateKey)) return;
    seen.add(coordinateKey);
    rendered.push({ id, latitude, longitude, title, ...options });
  };

  if (hasRoute && options.showTrailEntryEndpointMarker) {
    const [startLng, startLat] = startCoord!;
    addWaypoint('route-start', startLat, startLng, 'Trail entry', {
      endpointRole: 'trail_entry',
      subtitle: 'The trail begins here.',
    });
  }

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];
    const waypointCoord: [number, number] = [waypoint.longitude, waypoint.latitude];
    const duplicatesRouteEndpoint =
      (startCoord &&
        distanceMetersBetweenLngLat(waypointCoord, startCoord) <=
          ROUTE_ENDPOINT_WAYPOINT_DEDUPE_METERS) ||
      (endCoord &&
        distanceMetersBetweenLngLat(waypointCoord, endCoord) <=
          ROUTE_ENDPOINT_WAYPOINT_DEDUPE_METERS);

    if (duplicatesRouteEndpoint) {
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
    addWaypoint('route-end', endLat, endLng, 'Trail end', {
      endpointRole: 'trail_end',
      subtitle: 'Route guidance end.',
    });
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
    if (hasCampStructurePrivacyBufferConflict(marker)) continue;
    const identity = marker.id || `${marker.latitude.toFixed(6)}:${marker.longitude.toFixed(6)}`;
    const coordinateKey = routeCoordinateKey(marker.latitude, marker.longitude);
    const key = `${identity}:${coordinateKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const index = rendered.length;
    const isCampOpsPin = marker.pinFamily === 'campops';
    rendered.push({
      id: toMarkerId('camp-scout', marker.id, index),
      latitude: marker.latitude,
      longitude: marker.longitude,
      title: marker.title || 'Camp Endpoint candidate',
      sourceType: marker.sourceType || 'unknown',
      confidenceGrade: /^[ABCD]$/.test(marker.confidenceGrade) ? marker.confidenceGrade : 'D',
      confidenceScore:
        typeof marker.confidenceScore === 'number' && Number.isFinite(marker.confidenceScore)
          ? Math.max(0, Math.min(100, Math.round(marker.confidenceScore)))
          : 0,
      rank:
        typeof marker.rank === 'number' && Number.isFinite(marker.rank) && marker.rank > 0
          ? Math.floor(marker.rank)
          : isCampOpsPin
            ? index + 1
            : undefined,
      rankLabel:
        isCampOpsPin && typeof marker.rankLabel === 'string' && marker.rankLabel.trim().length > 0
          ? marker.rankLabel.trim().slice(0, 3)
          : isCampOpsPin
            ? String(index + 1)
            : undefined,
      selected: !!marker.selected,
      pinFamily: isCampOpsPin ? 'campops' : 'camp_scout',
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

export const normalizeRenderedCampEndpointMarkers = normalizeRenderedCampScoutMarkers;
export const buildCampEndpointPinFeatureCollection = buildCampScoutPinFeatureCollection;

export function buildMapOverlayPayloadHash(payload: WebMapPayload) {
  const {
    replayMarker: _replayMarker,
    userLocation: _userLocation,
    showUserLocation: _showUserLocation,
    vehicleHeading: _vehicleHeading,
    motionPriority: _motionPriority,
    cameraMode: _cameraMode,
    interactive: _interactive,
    routeBuilderActive: _routeBuilderActive,
    ...staticPayload
  } = payload;

  return stableStringify(staticPayload);
}

function buildFeatureCollectionSummaryHash(value: unknown): string {
  const collection = value as {
    type?: string;
    features?: {
      id?: string | number;
      geometry?: { type?: string };
      properties?: Record<string, unknown>;
    }[];
  } | null | undefined;
  const features = Array.isArray(collection?.features) ? collection.features : [];
  const summary = features.map((feature, index) => {
    const props = feature?.properties ?? {};
    const id = feature?.id ?? props.id ?? index;
    return [
      id,
      feature?.geometry?.type ?? '',
      props.confidence ?? '',
      props.landManager ?? '',
      props.distanceFromRouteMiles ?? '',
      props.routeNearby ?? '',
      props.name ?? '',
      props.source ?? '',
    ].join(':');
  });
  return `${collection?.type ?? 'none'}:${features.length}:${summary.join('|')}`;
}

function buildCampLayerHash(state: {
  enabled?: boolean;
  status?: unknown;
  featureCount?: number;
  renderKey?: string;
  lastSuccessfulCacheKey?: string;
  lastAttemptedCacheKey?: string;
  geojson?: unknown;
} | null | undefined): string {
  if (!state?.enabled) return 'disabled';
  if (typeof state.renderKey === 'string' && state.renderKey.length > 0) {
    return state.renderKey;
  }
  return stableStringify({
    enabled: true,
    status: state.status ?? null,
    featureCount: state.featureCount ?? null,
    lastSuccessfulCacheKey: state.lastSuccessfulCacheKey ?? null,
    lastAttemptedCacheKey: state.lastAttemptedCacheKey ?? null,
    featureSummary: buildFeatureCollectionSummaryHash(state.geojson),
  });
}

function buildDispersedRouteBuildHash(state: MapRendererProps['dispersedRouteBuild']): string {
  if (!state?.enabled) return 'disabled';
  return stableStringify({
    enabled: true,
    selectedSegmentIds: state.selectedSegmentIds ?? [],
    renderKey: state.renderKey ?? null,
  });
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
  const routeCoords = preserveRouteGeometryForRendering(routeCoordsRaw, MAX_ROUTE_RENDER_POINTS);
  const progressRouteCoords = preserveRouteGeometryForRendering(progressCoordsRaw, MAX_PROGRESS_ROUTE_RENDER_POINTS);

  const routePointsForBounds = routeCoordsRaw.map(([lng, lat]) => ({ lat, lng }));

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
    routeLineKey: props.routeLineKey ?? null,
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
      routeGeometrySelected: !!segment.routeGeometrySelected,
      routeGeometrySourceKind: segment.routeGeometrySourceKind ?? segment.sourceKind ?? null,
      routeGeometryDataState: segment.routeGeometryDataState ?? segment.dataState ?? null,
      routeGeometryConfidence: segment.routeGeometryConfidence ?? segment.confidence ?? null,
      routeGeometryWarningsJson:
        segment.routeGeometryWarningsJson ??
        (Array.isArray(segment.warnings) ? JSON.stringify(segment.warnings) : null),
    })),
    selectedRouteGeometrySegmentIds: (props.selectedRouteGeometrySegmentIds ?? []).map(String),
    waypoints: normalizeRenderedRouteWaypoints(routeCoords, props.waypoints || [], {
      showTrailEntryEndpointMarker: props.showTrailEntryEndpointMarker === true,
    }),
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
          mapChar: typeof m.mapChar === 'string' ? m.mapChar.slice(0, 2) : undefined,
          resolved: !!m.resolved,
          markerKind: typeof m.markerKind === 'string' ? m.markerKind : undefined,
          routeCatalogRouteId:
            typeof m.routeCatalogRouteId === 'string' ? m.routeCatalogRouteId : undefined,
          geometryStatus: typeof m.geometryStatus === 'string' ? m.geometryStatus : undefined,
          guidanceReady: typeof m.guidanceReady === 'boolean' ? m.guidanceReady : undefined,
          sourceLabel: typeof m.sourceLabel === 'string' ? m.sourceLabel : undefined,
          distanceMiles:
            typeof m.distanceMiles === 'number' && Number.isFinite(m.distanceMiles)
              ? m.distanceMiles
              : null,
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
    motionPriority: props.motionPriority ?? 'hot',
    showCrosshair: !!props.showCrosshair,
    interactive: props.interactive !== false,
    mapStyleKey: props.mapStyle || DEFAULT_MAP_STYLE,
    styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE),
    cameraMode: props.cameraMode ?? null,
    campsites: normalizeRenderedCampsiteMarkers(pickCampsiteMarkerInput(props)),
    campScoutPins: normalizeRenderedCampEndpointMarkers([
      ...(props.campEndpointMarkers ?? []),
      ...(props.campScoutMarkers ?? []),
    ]),
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
    routeBuilderMode: props.routeBuilderMode ?? 'freehand',
    routeBuilderColor: props.routeBuilderColor || '#65F0D4',
    routeBuilderSegments: (props.routeBuilderSegments || []).map((segment, index) => ({
      id: toMarkerId('route-builder', segment.id, index),
      coordinates: normalizeLineCoordinates(segment.coordinates),
      rawSegment: normalizeLineCoordinates(segment.rawSegment),
      snappedSegment: normalizeLineCoordinates(segment.snappedSegment),
      snapConfidence: segment.snapConfidence ?? null,
      snapSource: segment.snapSource ?? null,
      snapStatus: segment.snapStatus ?? null,
      snapProvider: segment.snapProvider ?? null,
      snapProfile: segment.snapProfile ?? null,
      snapMessage: segment.snapMessage ?? null,
      sourceSegmentId: segment.sourceSegmentId ?? null,
      buildSource: segment.buildSource ?? null,
      provisional: isRouteBuilderSegmentProvisional(segment),
    })),
    routeBuilderAnchors: (props.routeBuilderAnchors || [])
      .filter((anchor) => isValidCoord(anchor.coordinate?.latitude, anchor.coordinate?.longitude))
      .map((anchor) => ({
        id: String(anchor.id),
        label: String(anchor.label || ''),
        coordinate: {
          latitude: Number(anchor.coordinate.latitude),
          longitude: Number(anchor.coordinate.longitude),
        },
        role: anchor.role,
        hidden: !!anchor.hidden,
      })),
    routeProfileFocus: props.routeProfileFocus
      ? normalizeRouteProfileFocusPayload(props.routeProfileFocus, routeCoordsRaw)
      : null,
    remoteOverlay: props.remoteOverlay ?? { enabled: false, heatmapAreas: [], forecastSegments: [] },
    campsiteSearchPolygon: props.campsiteSearchPolygon
      ? {
          coordinates: normalizeLineCoordinates(props.campsiteSearchPolygon.coordinates),
          closed: !!props.campsiteSearchPolygon.closed,
        }
      : null,
  };
}

export function buildDynamicPayload(props: Pick<
  MapRendererProps,
  | 'replayMarker'
  | 'userLocation'
  | 'showUserLocation'
  | 'vehicleHeading'
  | 'motionPriority'
  | 'cameraMode'
  | 'interactive'
  | 'routeBuilderActive'
  | 'routeBuilderMode'
>): WebMapDynamicPayload {
  const replay = normalizeLatLng(props.replayMarker as LatLng | null);
  const user = normalizeLatLng(props.userLocation ?? null);
  const motionPriority: MapMotionPriority = props.motionPriority ?? 'hot';
  const liveMotionEnabled = motionPriority !== 'cold';
  const vehicleHeading = resolveViewportMarkerHeadingDeg({
    headingDeg: props.vehicleHeading,
    mapBearingDeg: 0,
  });

  return {
    replayMarker: replay,
    userLocation: user,
    showUserLocation: liveMotionEnabled && !!props.showUserLocation && !!user,
    vehicleHeading:
      liveMotionEnabled && typeof vehicleHeading === 'number' && Number.isFinite(vehicleHeading)
        ? vehicleHeading
        : null,
    motionPriority,
    cameraMode: liveMotionEnabled ? props.cameraMode ?? null : null,
    interactive: props.interactive !== false,
    routeBuilderActive: !!props.routeBuilderActive,
    routeBuilderMode: props.routeBuilderMode ?? 'freehand',
  };
}

function makeMapHtml(
  token: string,
  initialStyleUrl: string,
  fallbackStyleUrls: string[],
  instanceKey: number,
  surfaceMode: MapRendererProps['surfaceMode'],
  initialInteractive: boolean,
) {
  const escapedToken = JSON.stringify(token);
  const escapedInitialStyleUrl = JSON.stringify(initialStyleUrl);
  const escapedFallbackStyleUrls = JSON.stringify(fallbackStyleUrls || []);
  const escapedInstanceKey = JSON.stringify(instanceKey);
  const escapedInitialInteractive = JSON.stringify(initialInteractive);
  const compactTileCacheSize = surfaceMode === 'compact' ? COMPACT_MAP_MAX_TILE_CACHE_SIZE : null;
  const escapedCompactTileCacheSize = JSON.stringify(compactTileCacheSize);
  const escapedTerrainSourceId = JSON.stringify(MAPBOX_3D_TERRAIN_SOURCE_ID);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width"
  />
  <link
    href="https://api.mapbox.com/mapbox-gl-js/${MAPBOX_WEBVIEW_GL_JS_VERSION}/mapbox-gl.css"
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
    .marker-waypoint-entry {
      background: rgba(242, 194, 77, 0.16);
      border-color: rgba(242, 194, 77, 0.92);
      box-shadow:
        0 0 0 2px rgba(7, 10, 12, 0.48),
        0 0 14px rgba(242, 194, 77, 0.42);
    }
    .marker-waypoint-entry::after {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: rgba(242, 194, 77, 0.34);
      box-shadow: 0 0 8px rgba(242, 194, 77, 0.46);
    }
    .marker-waypoint-end {
      background: #FFD700;
      border-color: rgba(255,255,255,0.96);
      box-shadow:
        0 0 0 2px rgba(7, 10, 12, 0.52),
        0 0 14px rgba(255, 215, 0, 0.55);
    }
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
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 4;
      filter: drop-shadow(0 6px 12px rgba(0,0,0,0.34));
    }
    .camp-scout-marker::before {
      content: none;
      position: absolute;
      inset: 1px;
      border-radius: 999px;
      border: 0;
      background: transparent;
    }
    .camp-scout-core {
      position: relative;
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 0;
      border: 0;
      background: transparent;
      color: #F2C24D;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 24px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
      gap: 2px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.62));
    }
    .camp-scout-tent {
      position: relative;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      color: currentColor;
      font-size: 20px;
      line-height: 1;
      font-weight: 900;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transform: translateY(-0.5px);
    }
    .camp-scout-tent::before {
      content: none;
    }
    .camp-scout-tent::after {
      content: none;
    }
    .camp-scout-rank {
      position: absolute;
      left: 50%;
      top: -14px;
      transform: translateX(-50%);
      z-index: 2;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 999px;
      border: 1px solid rgba(242,194,77,0.52);
      background: rgba(8, 11, 14, 0.94);
      color: #F2C24D;
      font-size: 9px;
      line-height: 15px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
      text-align: center;
    }
    .camp-scout-marker:not(.camp-scout-campops) .camp-scout-rank {
      display: none;
    }
    .camp-scout-grade-a { z-index: 12; }
    .camp-scout-grade-a .camp-scout-core { color: #F2C24D; }
    .camp-scout-grade-b .camp-scout-core { color: #D4A017; }
    .camp-scout-grade-c .camp-scout-core { color: #9EC2B1; }
    .camp-scout-source-ecs_inferred .camp-scout-core {
      color: #F2C24D;
      border-color: transparent;
      box-shadow: none;
    }
    .camp-scout-source-ecs_inferred::before {
      border-color: transparent;
      background: transparent;
    }
    .camp-scout-source-official_mapped .camp-scout-core { color: #8FD694; }
    .camp-scout-source-community_suggested .camp-scout-core { color: #65C97A; }
    .camp-scout-source-imported_route_context .camp-scout-core { color: #86B8FF; }
    .camp-scout-selected {
      width: 34px;
      height: 34px;
      z-index: 28;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.44));
    }
    .camp-scout-selected::before {
      inset: 1px;
      border-color: transparent;
      box-shadow: none;
    }
    .camp-scout-selected .camp-scout-core {
      width: 28px;
      height: 28px;
      line-height: 28px;
      font-size: 22px;
    }
    .camp-scout-selected .camp-scout-rank {
      top: -13px;
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
    .marker-pin {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #6EA8FF;
      box-shadow:
        0 0 0 1px rgba(8,14,18,0.48),
        0 0 12px rgba(0,0,0,0.38);
    }
    .marker-pin-resolved {
      opacity: 0.58;
      filter: saturate(0.72);
    }
    .pin-type-icon {
      position: relative;
      display: block;
      width: 12px;
      height: 12px;
      color: #091014;
      pointer-events: none;
    }
    .pin-type-water,
    .pin-type-poi {
      color: #F5F7F8;
    }
    .pin-type-camp::before {
      content: '';
      position: absolute;
      left: 1px;
      top: 2px;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 9px solid currentColor;
    }
    .pin-type-camp::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 7px;
      width: 2px;
      height: 4px;
      border-radius: 1px 1px 0 0;
      background: rgba(255,255,255,0.72);
    }
    .pin-type-fuel::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 6px;
      height: 9px;
      border-radius: 1px;
      background: currentColor;
    }
    .pin-type-fuel::after {
      content: '';
      position: absolute;
      right: 1px;
      top: 4px;
      width: 4px;
      height: 6px;
      border-top: 2px solid currentColor;
      border-right: 2px solid currentColor;
      border-radius: 0 4px 4px 0;
    }
    .pin-type-water::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 1px;
      width: 8px;
      height: 8px;
      border-radius: 8px 8px 8px 1px;
      background: currentColor;
      transform: rotate(-45deg);
      transform-origin: 50% 65%;
    }
    .pin-type-poi::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 0;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
    }
    .pin-type-poi::after {
      content: '';
      position: absolute;
      left: 4px;
      top: 6px;
      width: 0;
      height: 0;
      border-left: 2px solid transparent;
      border-right: 2px solid transparent;
      border-top: 6px solid currentColor;
    }
    .pin-type-fallback {
      width: auto;
      min-width: 10px;
      height: 12px;
      color: #091014;
      font-size: 8px;
      line-height: 12px;
      font-weight: 900;
      text-align: center;
    }
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

  <script src="https://api.mapbox.com/mapbox-gl-js/${MAPBOX_WEBVIEW_GL_JS_VERSION}/mapbox-gl.js"></script>
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
      var DISPERSED_ROUTE_BUILD_SOURCE_ID = ${JSON.stringify(DISPERSED_ROUTE_BUILD_SOURCE_ID)};
      var DISPERSED_ROUTE_BUILD_LAYER_ID = ${JSON.stringify(DISPERSED_ROUTE_BUILD_LAYER_ID)};
      var DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID = ${JSON.stringify(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID)};
      var DISPERSED_ROUTE_BUILD_MESSAGE_TYPE = ${JSON.stringify(SET_DISPERSED_ROUTE_BUILD_ENABLED)};
      var DISPERSED_ROUTE_LEG_PLANNING_WARNING = ${JSON.stringify(DISPERSED_ROUTE_LEG_PLANNING_WARNING)};
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

      window.onerror = function(message, source, lineno, colno, error) {
        try {
          sendLog('window error: ' + String(message || 'unknown') + ' @ ' + String(source || 'inline') + ':' + String(lineno || 0) + ':' + String(colno || 0));
          if (error && error.stack) sendLog('window error stack: ' + String(error.stack));
        } catch (e) {}
        return false;
      };

      window.addEventListener('unhandledrejection', function(event) {
        try {
          var reason = event && event.reason ? event.reason : 'unknown';
          sendLog('unhandled rejection: ' + String(reason && reason.message ? reason.message : reason));
        } catch (e) {}
      });

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

      try {
        mapboxgl.workerCount = 1;
      } catch (e) {
        sendLog('mapboxgl worker tuning skipped: ' + String(e && e.message ? e.message : e));
      }

      try {
        if (mapboxgl.supported && !mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
          sendLog('mapboxgl support check failed; attempting constructor so native WebView can report the concrete error');
        }
      } catch (e) {
        sendLog('mapboxgl support check threw: ' + String(e && e.message ? e.message : e));
      }

      mapboxgl.accessToken = ${escapedToken};

      var map = null;
      var initialized = false;
      var bootstrapDone = false;
      var pendingPayload = null;
      var styleReplayTimer = null;
      var bootstrapReadyTimer = null;
      var requestedStyleUrl = ${escapedInitialStyleUrl};
      var fallbackStyleUrls = ${escapedFallbackStyleUrls};
      var initialInteractive = ${escapedInitialInteractive};
      var compactTileCacheSize = ${escapedCompactTileCacheSize};
      var terrainSourceId = ${escapedTerrainSourceId};
      var activeStyleUrl = ${escapedInitialStyleUrl};
      var activeMapStyleKey = null;
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
      var REMOTE_FORECAST_VISIBLE_WIDTH = ['interpolate', ['linear'], ['zoom'], 5, 22, 8, 20, 11, 18, 14, 15, 17, 12];
      var REMOTE_FORECAST_HALO_WIDTH = ['interpolate', ['linear'], ['zoom'], 5, 32, 8, 29, 11, 25, 14, 21, 17, 17];
      var REMOTE_FORECAST_VISIBLE_OPACITY = ['interpolate', ['linear'], ['zoom'], 5, 0.76, 8, 0.7, 12, 0.62, 16, 0.54];
      var REMOTE_FORECAST_HALO_OPACITY = ['interpolate', ['linear'], ['zoom'], 5, 0.64, 8, 0.56, 12, 0.46, 16, 0.34];

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

      function resolvePayloadMapStyleKey(payload) {
        if (payload && payload.mapStyleKey === '3d') return '3d';
        if (payload && payload.mapStyleKey) return payload.mapStyleKey;
        return null;
      }

      function enableNavigate3dTerrain() {
        if (!map || !isMapStyleReady()) return;
        try {
          if (!map.getSource(terrainSourceId)) {
            map.addSource(terrainSourceId, {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14
            });
          }
          if (map.setTerrain) {
            map.setTerrain({ source: terrainSourceId, exaggeration: 1.14 });
          }
          if (map.setFog) {
            map.setFog({
              color: 'rgba(5, 9, 13, 0.9)',
              'high-color': 'rgba(62, 82, 94, 0.42)',
              'horizon-blend': 0.08,
              'space-color': '#020608',
              'star-intensity': 0
            });
          }
        } catch (e) {
          sendLog('3d terrain skipped: ' + String(e && e.message ? e.message : e));
        }
      }

      function clearNavigate3dTerrain() {
        if (!map || !map.setTerrain) return;
        try {
          map.setTerrain(null);
        } catch (e) {}
        try {
          if (map.setFog) map.setFog({});
        } catch (e) {}
      }

      function applyTerrainForMapStyle(styleKey) {
        if (styleKey === '3d') {
          enableNavigate3dTerrain();
          return;
        }
        clearNavigate3dTerrain();
      }

      function featureCollection(features) {
        return { type: 'FeatureCollection', features: features || [] };
      }

      function normalizeLngLatCoordinate(coord) {
        if (!coord) return null;
        if (Array.isArray(coord) && coord.length >= 2) {
          var lngFromArray = Number(coord[0]);
          var latFromArray = Number(coord[1]);
          if (isFinite(lngFromArray) && isFinite(latFromArray) && Math.abs(latFromArray) <= 90 && Math.abs(lngFromArray) <= 180) {
            return [lngFromArray, latFromArray];
          }
          return null;
        }

        var lat = Number(coord.latitude != null ? coord.latitude : coord.lat);
        var lng = Number(coord.longitude != null ? coord.longitude : coord.lng);
        if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          return [lng, lat];
        }
        return null;
      }

      function normalizeLngLatLine(coordinates) {
        return (coordinates || [])
          .map(function(coord) { return normalizeLngLatCoordinate(coord); })
          .filter(function(coord) { return coord && coord.length >= 2; });
      }

      function lineFeature(id, coordinates, props) {
        return {
          type: 'Feature',
          id: id,
          properties: props || {},
          geometry: { type: 'LineString', coordinates: normalizeLngLatLine(coordinates) }
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

      function stableMarkerHash(items) {
        try {
          return JSON.stringify((items || []).map(function(item) {
            return [
              item && item.id,
              item && item.latitude,
              item && item.longitude,
              item && item.title,
              item && item.subtitle,
              item && item.rank,
              item && item.rankLabel,
              item && item.selected,
              item && item.sourceType,
              item && item.confidenceScore,
              item && item.confidence,
              item && item.markerKind,
              item && item.pinFamily,
              item && item.campOpsRole,
              item && item.campOpsCandidateId,
              item && item.type,
              item && item.color
            ];
          }));
        } catch (e) {
          return String(Date.now());
        }
      }

      var markerPayloadHashes = {
        waypoints: '',
        bailouts: '',
        campsites: '',
        campScoutPins: '',
        tiltAlerts: '',
        pins: ''
      };

      function markerPayloadChanged(key, items) {
        var nextHash = stableMarkerHash(items);
        if (markerPayloadHashes[key] === nextHash) return false;
        markerPayloadHashes[key] = nextHash;
        return true;
      }

      var waypointMarkers = [];
      var bailoutMarkers = [];
      var pinMarkers = [];
      var campsiteMarkers = [];
      var campScoutMarkers = [];
      var tiltMarkers = [];
      var userMarker = null;
      var userMarkerAnimationFrame = null;
      var userMarkerLocation = null;
      var userMarkerHeading = null;
      var replayMarker = null;
      var roadClassTimer = null;
      var dragTimeout = null;
      var crosshairEl = document.getElementById('crosshair');
      var routeBuilderActive = false;
      var routeBuilderMode = 'freehand';
      var routeBuilderColor = '#65F0D4';
      var routeBuilderDraftSegments = [];
      var routeBuilderAnchors = [];
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
      var longPressSuppressClickUntil = 0;
      var longPressTouchTimer = null;
      var longPressTouchStartPoint = null;
      var longPressPointerTimer = null;
      var longPressPointerStartPoint = null;
      var longPressPointerId = null;
      var longPressLastSentAt = 0;
      var LONG_PRESS_TOUCH_DELAY_MS = 520;
      var LONG_PRESS_TOUCH_MOVE_CANCEL_PX = 12;
      var routeBuilderLastGoodTracePoint = null;
      var routeBuilderFreeDrawMode = false;
      var routeBuilderGestureStartedAt = 0;
      var routeBuilderGesturePointCount = 0;
      var routeBuilderGestureStartPoint = null;
      var routeBuilderFreeModeNoticeSent = false;
      var dispersedRouteBuildState = {
        enabled: false,
        selectedSegmentIds: [],
        selectedSegmentIdSet: {},
        renderKey: null,
        version: 0
      };
      var selectedRouteGeometrySegmentIds = {};
      var dispersedRouteBuildUpdateTimer = null;
      var maxDispersedRouteBuildCandidates = 180;

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

      function markerClickScreenCoordinate(ev, el) {
        try {
          var containerRect = map && map.getContainer ? map.getContainer().getBoundingClientRect() : null;
          var markerRect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          var clientX = ev && typeof ev.clientX === 'number'
            ? ev.clientX
            : markerRect
              ? markerRect.left + markerRect.width / 2
              : null;
          var clientY = ev && typeof ev.clientY === 'number'
            ? ev.clientY
            : markerRect
              ? markerRect.top + markerRect.height / 2
              : null;
          if (!containerRect || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
          return {
            x: clientX - containerRect.left,
            y: clientY - containerRect.top
          };
        } catch (e) {
          return null;
        }
      }

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
            send('pinTap', Object.assign({}, clickPayload, {
              screenCoordinate: markerClickScreenCoordinate(ev, el)
            }));
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
        } else {
          try {
            map.setPaintProperty(id, 'line-color', color);
            map.setPaintProperty(id, 'line-width', width);
            map.setPaintProperty(id, 'line-opacity', opacity);
            map.setPaintProperty(id, 'line-dasharray', dasharray || [1, 0]);
          } catch (e) {}
        }
      }

      function ensureExploreRouteHaloLayer() {
        if (!map.getLayer('explore-route-halo-layer')) {
          map.addLayer({
            id: 'explore-route-halo-layer',
            type: 'line',
            source: 'segment-source',
            filter: ['==', ['get', 'kind'], 'explore_route'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#65D4FF',
              'line-width': 9,
              'line-opacity': 0.24
            }
          }, 'segment-layer');
        }
      }

      function ensureRouteGeometryLayers() {
        if (!map.getLayer('route-geometry-halo-layer')) {
          map.addLayer({
            id: 'route-geometry-halo-layer',
            type: 'line',
            source: 'segment-source',
            filter: [
              'all',
              ['==', ['get', 'kind'], 'route_geometry_segment'],
              ['!=', ['get', 'routeGeometrySelected'], true]
            ],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#F2C24D',
              'line-width': 4.25,
              'line-opacity': 0.9
            }
          }, 'segment-layer');
        }

        if (!map.getLayer('route-geometry-selected-layer')) {
          map.addLayer({
            id: 'route-geometry-selected-layer',
            type: 'line',
            source: 'segment-source',
            filter: [
              'all',
              ['==', ['get', 'kind'], 'route_geometry_segment'],
              ['==', ['get', 'routeGeometrySelected'], true]
            ],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#F2C24D',
              'line-width': 6.25,
              'line-opacity': 0.98,
              'line-blur': 0.2
            }
          }, 'segment-layer');
        }
      }

      function ensureCampsiteFinalAccessLayer() {
        if (!map.getLayer('campsite-final-access-layer')) {
          map.addLayer({
            id: 'campsite-final-access-layer',
            type: 'line',
            source: 'segment-source',
            filter: ['==', ['get', 'kind'], 'campsite_final_access'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 4.25,
              'line-opacity': 0.92,
              'line-dasharray': [0.35, 1.25]
            }
          });
        }
      }

      function applySegmentLineStyle() {
        if (!map.getLayer('segment-layer')) return;
        try {
          map.setFilter('segment-layer', [
            'all',
            ['!=', ['get', 'kind'], 'campsite_final_access'],
            ['!=', ['get', 'kind'], 'route_geometry_segment']
          ]);
          map.setPaintProperty('segment-layer', 'line-color', ['get', 'color']);
          map.setPaintProperty('segment-layer', 'line-width', [
            'case',
            ['==', ['get', 'kind'], 'explore_route'],
            5.75,
            4
          ]);
          map.setPaintProperty('segment-layer', 'line-opacity', [
            'case',
            ['==', ['get', 'kind'], 'explore_route'],
            0.98,
            0.92
          ]);
        } catch (e) {}
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

      function moveExistingLayerToTop(layerId) {
        try {
          if (map && map.getLayer(layerId)) {
            map.moveLayer(layerId);
          }
        } catch (e) {}
      }

      function promoteRouteGuidanceLayers() {
        [
          'route-halo-layer',
          'route-layer',
          'segment-layer',
          'route-geometry-halo-layer',
          'route-geometry-selected-layer',
          'trail-layer',
          'speed-layer',
          'route-progress-glow-layer',
          'route-progress-layer',
          'route-builder-halo-layer',
          'route-builder-layer',
          'route-builder-endpoint-halo-layer',
          'route-builder-endpoint-layer',
          'route-profile-focus-halo-layer',
          'route-profile-focus-layer',
          'route-profile-focus-arrow-layer',
          'route-profile-focus-label-layer'
        ].forEach(moveExistingLayerToTop);
      }

      function removeDispersedCampingEligibilityLayer() {
        try {
          if (map && map.getLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_CAMPING_OUTLINE_LAYER_ID, 'visibility', 'none');
          }
          if (map && map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_CAMPING_FILL_LAYER_ID, 'visibility', 'none');
          }
        } catch (e) {}
        sendCampLayerDebug('map_layer_hidden', {
          layer: 'dispersed_camping',
          sourceId: DISPERSED_CAMPING_SOURCE_ID,
          fillLayerId: DISPERSED_CAMPING_FILL_LAYER_ID,
          outlineLayerId: DISPERSED_CAMPING_OUTLINE_LAYER_ID
        });
      }

      function removeDispersedRouteBuildLayer() {
        try {
          if (map && map.getLayer(DISPERSED_ROUTE_BUILD_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_ROUTE_BUILD_LAYER_ID, 'visibility', 'none');
          }
          if (map && map.getLayer(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID, 'visibility', 'none');
          }
          if (map && map.getSource(DISPERSED_ROUTE_BUILD_SOURCE_ID)) {
            setGeoJson(DISPERSED_ROUTE_BUILD_SOURCE_ID, featureCollection([]));
          }
        } catch (e) {}
      }

      function buildDispersedRouteSelectedSet(ids) {
        var selected = {};
        (ids || []).forEach(function(id) {
          if (id != null) selected[String(id)] = true;
        });
        return selected;
      }

      function ensureDispersedRouteBuildLayer() {
        if (!isMapStyleReady()) return false;
        ensureSource(DISPERSED_ROUTE_BUILD_SOURCE_ID, { type: 'geojson', data: featureCollection([]) });

        var beforeRouteLayer = getFirstExistingLayerId([
          'route-progress-glow-layer',
          'route-progress-layer',
          'route-halo-layer',
          'route-layer',
          'route-builder-halo-layer',
          'route-builder-layer',
          'segment-layer',
          'trail-layer'
        ]);

        if (!map.getLayer(DISPERSED_ROUTE_BUILD_LAYER_ID)) {
          map.addLayer({
            id: DISPERSED_ROUTE_BUILD_LAYER_ID,
            type: 'line',
            source: DISPERSED_ROUTE_BUILD_SOURCE_ID,
            minzoom: ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM},
            filter: ['!=', ['get', 'selected'], true],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#F2C24D',
              'line-width': 3.6,
              'line-opacity': 0.78
            }
          }, beforeRouteLayer);
        }

        if (!map.getLayer(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID)) {
          map.addLayer({
            id: DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID,
            type: 'line',
            source: DISPERSED_ROUTE_BUILD_SOURCE_ID,
            minzoom: ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM},
            filter: ['==', ['get', 'selected'], true],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#F2C24D',
              'line-width': 7.2,
              'line-opacity': 0.98,
              'line-blur': 0.25
            }
          }, beforeRouteLayer);
        }

        try {
          map.setLayoutProperty(DISPERSED_ROUTE_BUILD_LAYER_ID, 'visibility', 'visible');
          map.setLayoutProperty(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID, 'visibility', 'visible');
        } catch (e) {}

        return true;
      }

      function removeEstablishedCampsitesLayer() {
        try {
          if (map && map.getLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID)) {
            map.setLayoutProperty(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, 'visibility', 'none');
          }
          if (map && map.getLayer(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID)) {
            map.setLayoutProperty(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID, 'visibility', 'none');
          }
        } catch (e) {}
        sendCampLayerDebug('map_layer_hidden', {
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

      function buildDispersedCampingSelectionPayload(feature, eventLngLat) {
        var props = feature && feature.properties ? feature.properties : {};
        var regionId = String(props.id || feature.id || '').trim();
        if (!regionId) return null;
        var distanceFromRouteMiles = Number(props.distanceFromRouteMiles);
        var routeCorridorMiles = Number(props.routeCorridorMiles);
        var clickLatitude = eventLngLat && Number(eventLngLat.lat);
        var clickLongitude = eventLngLat && Number(eventLngLat.lng);
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
          requiresVerification: props.requiresVerification !== false,
          routeNearby: props.routeNearby === true || props.routeNearby === 'true',
          distanceFromRouteMiles: isFinite(distanceFromRouteMiles) ? distanceFromRouteMiles : undefined,
          routeCorridorMiles: isFinite(routeCorridorMiles) ? routeCorridorMiles : undefined,
          latitude: isFinite(clickLatitude) ? clickLatitude : undefined,
          longitude: isFinite(clickLongitude) ? clickLongitude : undefined
        };
      }

      function lineMidpointCoordinate(line) {
        if (!line || line.length < 2) return null;
        var totalLength = 0;
        var lengths = [];
        for (var i = 1; i < line.length; i += 1) {
          var a = projectLngLat(line[i - 1]);
          var b = projectLngLat(line[i]);
          if (!a || !b) {
            lengths.push(0);
            continue;
          }
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var length = Math.sqrt(dx * dx + dy * dy);
          lengths.push(length);
          totalLength += length;
        }
        if (totalLength <= 0) return line[Math.floor(line.length / 2)] || null;
        var target = totalLength / 2;
        var traveled = 0;
        for (var j = 1; j < line.length; j += 1) {
          var segmentLength = lengths[j - 1] || 0;
          if (traveled + segmentLength >= target) {
            var t = segmentLength > 0 ? (target - traveled) / segmentLength : 0;
            return [
              line[j - 1][0] + (line[j][0] - line[j - 1][0]) * t,
              line[j - 1][1] + (line[j][1] - line[j - 1][1]) * t
            ];
          }
          traveled += segmentLength;
        }
        return line[Math.floor(line.length / 2)] || null;
      }

      function routeLegCoordinateHash(coordinates) {
        var payload = (coordinates || []).map(function(coord) {
          return Number(coord[0]).toFixed(5) + ',' + Number(coord[1]).toFixed(5);
        }).join('|');
        var hash = 2166136261;
        for (var i = 0; i < payload.length; i += 1) {
          hash ^= payload.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return 'dispersed-leg-' + ((hash >>> 0).toString(36));
      }

      function sourceLabelForDispersedRouteFeature(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var label =
          props.name ||
          props.ref ||
          props.routeName ||
          props.route_name ||
          props.class ||
          props.subclass ||
          (feature && feature.sourceLayer) ||
          (feature && feature.layer && feature.layer.id);
        var normalized = String(label || '').trim();
        return normalized || 'Rendered routeable feature';
      }

      function queryEligibleDispersedCampingRegionsAtPoint(coordinate) {
        if (!map || !coordinate || !map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID)) return [];
        try {
          var projected = map.project({ lng: coordinate[0], lat: coordinate[1] });
          var regions = map.queryRenderedFeatures(projected, { layers: [DISPERSED_CAMPING_FILL_LAYER_ID] }) || [];
          return regions
            .map(function(regionFeature) {
              var props = regionFeature && regionFeature.properties ? regionFeature.properties : {};
              var confidence = String(props.confidence || 'verify').toLowerCase();
              if (confidence === 'restricted') return null;
              return {
                id: String(props.id || regionFeature.id || '').trim(),
                landManager: props.landManager ? String(props.landManager) : null,
                confidence: confidence || 'verify'
              };
            })
            .filter(function(region) { return !!(region && region.id); });
        } catch (e) {
          return [];
        }
      }

      function splitDispersedRouteBuildLine(line) {
        var normalized = normalizeLngLatLine(line || []);
        var deduped = [];
        normalized.forEach(function(coord) {
          var previous = deduped[deduped.length - 1];
          if (!previous || previous[0] !== coord[0] || previous[1] !== coord[1]) {
            deduped.push(coord);
          }
        });
        if (deduped.length < 2) return [];
        if (deduped.length <= 24) return [deduped];
        var chunks = [];
        var index = 0;
        while (index < deduped.length - 1) {
          var chunk = deduped.slice(index, index + 24);
          if (chunk.length > 1) chunks.push(chunk);
          index += 23;
        }
        return chunks;
      }

      function buildDispersedRouteBuildPayloadFromFeature(feature) {
        if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
        var props = feature.properties || {};
        var coordinates = normalizeLngLatLine(feature.geometry.coordinates || []);
        var id = String(props.sourceSegmentId || props.id || feature.id || '').trim();
        if (!id || coordinates.length < 2) return null;
        var regionIds = normalizeStringArray(props.regionIdsJson || props.regionIds);
        return {
          id: id,
          coordinates: coordinates,
          sourceLabel: String(props.sourceLabel || 'Rendered routeable feature'),
          confidence: 'planning_geometry',
          regionIds: regionIds,
          landManager: props.landManager ? String(props.landManager) : null,
          eligibilityConfidence: String(props.eligibilityConfidence || 'verify'),
          warnings: [DISPERSED_ROUTE_LEG_PLANNING_WARNING],
          selected: !dispersedRouteBuildState.selectedSegmentIdSet[id]
        };
      }

      function buildDispersedRouteBuildCandidateFeature(feature, line) {
        var midpoint = lineMidpointCoordinate(line);
        var regions = queryEligibleDispersedCampingRegionsAtPoint(midpoint);
        if (!regions.length) return null;
        var id = routeLegCoordinateHash(line);
        var selected = !!dispersedRouteBuildState.selectedSegmentIdSet[id];
        var regionIds = regions.map(function(region) { return region.id; });
        var landManager = regions[0] && regions[0].landManager ? regions[0].landManager : null;
        var eligibilityConfidence = regions[0] && regions[0].confidence ? regions[0].confidence : 'verify';
        return lineFeature(id, line, {
          id: id,
          sourceSegmentId: id,
          sourceLabel: sourceLabelForDispersedRouteFeature(feature),
          confidence: 'planning_geometry',
          regionIdsJson: JSON.stringify(regionIds),
          regionIds: JSON.stringify(regionIds),
          landManager: landManager,
          eligibilityConfidence: eligibilityConfidence,
          selected: selected,
          warning: DISPERSED_ROUTE_LEG_PLANNING_WARNING
        });
      }

      function updateDispersedRouteBuildCandidates(reason) {
        if (!dispersedRouteBuildState.enabled || !isMapStyleReady()) {
          removeDispersedRouteBuildLayer();
          return;
        }
        if (!ensureDispersedRouteBuildLayer()) return;
        var candidates = [];
        var seen = {};
        try {
          var rendered = map.queryRenderedFeatures() || [];
          for (var featureIndex = 0; featureIndex < rendered.length; featureIndex += 1) {
            if (candidates.length >= maxDispersedRouteBuildCandidates) break;
            var feature = rendered[featureIndex];
            if (!feature || !isRouteBuilderRouteableFeature(feature)) continue;
            var lines = extractFeatureLineCoordinates(feature);
            for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
              var chunks = splitDispersedRouteBuildLine(lines[lineIndex]);
              for (var chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
                if (candidates.length >= maxDispersedRouteBuildCandidates) break;
                var candidate = buildDispersedRouteBuildCandidateFeature(feature, chunks[chunkIndex]);
                if (!candidate || seen[candidate.id]) continue;
                seen[candidate.id] = true;
                candidates.push(candidate);
              }
            }
          }
        } catch (e) {}

        setGeoJson(DISPERSED_ROUTE_BUILD_SOURCE_ID, featureCollection(candidates));
        try {
          map.setLayoutProperty(DISPERSED_ROUTE_BUILD_LAYER_ID, 'visibility', 'visible');
          map.setLayoutProperty(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID, 'visibility', 'visible');
        } catch (e) {}
        promoteRouteGuidanceLayers();
      }

      function scheduleDispersedRouteBuildCandidateUpdate(reason) {
        if (!dispersedRouteBuildState.enabled) return;
        if (dispersedRouteBuildUpdateTimer) clearTimeout(dispersedRouteBuildUpdateTimer);
        dispersedRouteBuildUpdateTimer = setTimeout(function() {
          updateDispersedRouteBuildCandidates(reason || 'scheduled');
        }, 90);
      }

      function setDispersedRouteBuildEnabled(payload) {
        var enabled = !!(payload && payload.enabled);
        dispersedRouteBuildState = {
          enabled: enabled,
          selectedSegmentIds: payload && Array.isArray(payload.selectedSegmentIds) ? payload.selectedSegmentIds.map(String) : [],
          selectedSegmentIdSet: buildDispersedRouteSelectedSet(payload && payload.selectedSegmentIds),
          renderKey: payload && payload.renderKey != null ? payload.renderKey : null,
          version: dispersedRouteBuildState.version + 1
        };
        if (!enabled) {
          removeDispersedRouteBuildLayer();
          return;
        }
        updateDispersedRouteBuildCandidates('message');
      }

      function findDispersedRouteBuildFeatureAtPoint(point) {
        if (!dispersedRouteBuildState.enabled || !map) return null;
        if (!map.getLayer(DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID) && !map.getLayer(DISPERSED_ROUTE_BUILD_LAYER_ID)) return null;
        try {
          var features = map.queryRenderedFeatures(point, {
            layers: [DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID, DISPERSED_ROUTE_BUILD_LAYER_ID]
          }) || [];
          return features.length ? features[0] : null;
        } catch (e) {
          return null;
        }
      }

      function findRouteGeometrySegmentFeatureAtPoint(point) {
        if (!map) return null;
        if (!map.getLayer('route-geometry-selected-layer') && !map.getLayer('route-geometry-halo-layer')) return null;
        try {
          var features = map.queryRenderedFeatures(point, {
            layers: ['route-geometry-selected-layer', 'route-geometry-halo-layer']
          }) || [];
          return features.length ? features[0] : null;
        } catch (e) {
          return null;
        }
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
        var payload = buildDispersedCampingSelectionPayload(feature, event && event.lngLat);
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
          'route-halo-layer',
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
            minzoom: ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM},
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
            minzoom: ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM},
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

        try {
          if (map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_CAMPING_FILL_LAYER_ID, 'visibility', 'visible');
          }
          if (map.getLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID)) {
            map.setLayoutProperty(DISPERSED_CAMPING_OUTLINE_LAYER_ID, 'visibility', 'visible');
          }
        } catch (e) {}

        attachDispersedCampingLayerHandlers();
        promoteRouteGuidanceLayers();
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
          'route-halo-layer',
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
            minzoom: ${ESTABLISHED_CAMPSITES_MIN_ZOOM},
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
            minzoom: ${ESTABLISHED_CAMPSITES_MIN_ZOOM},
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

        try {
          if (map.getLayer(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID)) {
            map.setLayoutProperty(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID, 'visibility', 'visible');
          }
          if (map.getLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID)) {
            map.setLayoutProperty(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, 'visibility', 'visible');
          }
        } catch (e) {}

        attachEstablishedCampsiteLayerHandlers();
        promoteRouteGuidanceLayers();
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
          removeDispersedRouteBuildLayer();
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
          if (dispersedRouteBuildState.enabled) {
            updateDispersedRouteBuildCandidates('eligibility_layer_applied');
          }
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
              'circle-radius': 0,
              'circle-opacity': 0,
              'circle-stroke-color': '#F2C24D',
              'circle-stroke-width': 0,
              'circle-stroke-opacity': 0,
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
              snapProvider: segment.snapProvider || null,
              snapProfile: segment.snapProfile || null,
              snapMessage: segment.snapMessage || null,
              sourceSegmentId: segment.sourceSegmentId || null,
              buildSource: segment.buildSource || null,
              provisional: !!segment.provisional,
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

      function resetRouteBuilderStrokeSnapState() {
        routeBuilderFreeDrawMode = false;
        routeBuilderPreferredFeatureKey = null;
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

      function updateRouteBuilder(segments, color, anchors) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(segment) { return segment.coordinates && segment.coordinates.length > 1; })
            .map(function(segment) {
              return lineFeature(segment.id, segment.coordinates, {
                color: color || routeBuilderColor || '#65F0D4',
                provisional: !!segment.provisional
              });
            })
        );
        setGeoJson('route-builder-source', fc);

        var anchorFeatures = (anchors || routeBuilderAnchors || [])
          .filter(function(anchor) {
            return anchor && !anchor.hidden && anchor.coordinate && isFinite(anchor.coordinate.latitude) && isFinite(anchor.coordinate.longitude);
          })
          .map(function(anchor) {
            return pointFeature(anchor.id || ('route-builder-anchor-' + anchor.label), [anchor.coordinate.longitude, anchor.coordinate.latitude], {
              color: color || routeBuilderColor || '#65F0D4',
              label: anchor.label || ''
            });
          });

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
          featureCollection(anchorFeatures.length ? anchorFeatures : lastPoint ? [pointFeature('route-builder-endpoint', lastPoint, { color: color || routeBuilderColor || '#65F0D4' })] : [])
        );
      }

      function updateRouteProfileFocus(focus) {
        var point = focus && isFinite(focus.latitude) && isFinite(focus.longitude)
          ? pointFeature('route-profile-focus', [focus.longitude, focus.latitude], {
              color: '#FF4D4D',
              label: focus.label || 'Elevation',
              bearing: isFinite(focus.bearing) ? focus.bearing : 0,
              elevationFeet: isFinite(focus.elevationFeet) ? focus.elevationFeet : null,
              distanceMiles: isFinite(focus.distanceMiles) ? focus.distanceMiles : null,
              riskLevel: focus.riskLevel || null
            })
          : null;
        setGeoJson('route-profile-focus-source', featureCollection(point ? [point] : []));
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
        applyTerrainForMapStyle(activeMapStyleKey);
        ensureSource('route-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-progress-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('segment-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('trail-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('speed-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('ecs-remote-v1', { type: 'geojson', data: featureCollection([]) });
        ensureSource('ecs-remote-forecast-v1', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-builder-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-builder-endpoint-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-profile-focus-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource(DISPERSED_ROUTE_BUILD_SOURCE_ID, { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-fill-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-line-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('campsite-search-polygon-point-source', { type: 'geojson', data: featureCollection([]) });

        ensureFillLayer(
          'ecs-remote-heatmap-fill',
          'ecs-remote-v1',
          ['match', ['get', 'label'], 'A', '#C66A4A', 'B', '#F2C24D', 'C', '#65C97A', 'D', '#5FD1FF', '#5FD1FF'],
          0.42
        );
        ensureLineLayer('route-halo-layer', 'route-source', 'rgba(8,14,18,0.88)', 10.5, 0.72);
        ensureLineLayer('route-layer', 'route-source', ['get', 'color'], 5, 0.95);
        ensureLineLayer('route-progress-glow-layer', 'route-progress-source', ['get', 'color'], 14, 0.22);
        ensureLineLayer('route-progress-layer', 'route-progress-source', ['get', 'color'], 6, 0.98);
        ensureLineLayer('segment-layer', 'segment-source', ['get', 'color'], 4, 0.92);
        ensureExploreRouteHaloLayer();
        ensureRouteGeometryLayers();
        ensureCampsiteFinalAccessLayer();
        applySegmentLineStyle();
        ensureLineLayer('trail-layer', 'trail-source', ['get', 'color'], 3.5, 0.9);
        ensureLineLayer('speed-layer', 'speed-source', ['get', 'color'], 2.25, 0.85, [1, 1]);
        ensureLineLayer('ecs-remote-forecast-halo-line', 'ecs-remote-forecast-v1', 'rgba(4,7,9,0.92)', REMOTE_FORECAST_HALO_WIDTH, REMOTE_FORECAST_HALO_OPACITY);
        ensureLineLayer('ecs-remote-forecast-line', 'ecs-remote-forecast-v1', ['get', 'color'], REMOTE_FORECAST_VISIBLE_WIDTH, REMOTE_FORECAST_VISIBLE_OPACITY);
        ensureLineLayer('route-builder-halo-layer', 'route-builder-source', ['get', 'color'], 12, 0.22);
        ensureLineLayer('route-builder-layer', 'route-builder-source', ['get', 'color'], 5.25, 0.98);
        try {
          map.setPaintProperty(
            'route-builder-layer',
            'line-dasharray',
            ['case', ['get', 'provisional'], [1.2, 1.1], [1, 0]]
          );
        } catch (e) {}
        ensureCircleLayer('route-builder-endpoint-halo-layer', 'route-builder-endpoint-source', ['get', 'color'], 9, 0.18, 'rgba(8,14,18,0.92)', 2);
        ensureCircleLayer('route-builder-endpoint-layer', 'route-builder-endpoint-source', ['get', 'color'], 4.75, 0.96, 'rgba(8,14,18,0.96)', 2);
        ensureCircleLayer('route-profile-focus-halo-layer', 'route-profile-focus-source', '#FF4D4D', 12.5, 0.22, 'rgba(8,14,18,0.94)', 2);
        ensureCircleLayer('route-profile-focus-layer', 'route-profile-focus-source', '#FF4D4D', 5.75, 0.98, 'rgba(8,14,18,0.96)', 2);
        if (!map.getLayer('route-profile-focus-arrow-layer')) {
          map.addLayer({
            id: 'route-profile-focus-arrow-layer',
            type: 'symbol',
            source: 'route-profile-focus-source',
            layout: {
              'text-field': '▲',
              'text-size': 18,
              'text-rotate': ['get', 'bearing'],
              'text-offset': ['literal', [0, -1.05]],
              'text-anchor': 'center',
              'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
              'text-ignore-placement': true
            },
            paint: {
              'text-color': '#FF4D4D',
              'text-halo-color': 'rgba(8,14,18,0.9)',
              'text-halo-width': 1.15
            }
          });
        }
        if (!map.getLayer('route-profile-focus-label-layer')) {
          map.addLayer({
            id: 'route-profile-focus-label-layer',
            type: 'symbol',
            source: 'route-profile-focus-source',
            layout: {
              'text-field': ['coalesce', ['get', 'label'], 'Elevation'],
              'text-size': 11,
              'text-offset': ['literal', [0, -2.15]],
              'text-anchor': 'bottom',
              'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
              'text-max-width': 10,
              'text-allow-overlap': true,
              'text-ignore-placement': true
            },
            paint: {
              'text-color': '#F7E6A6',
              'text-halo-color': 'rgba(8,14,18,0.94)',
              'text-halo-width': 1.3
            }
          });
        }
        ensureFillLayer('campsite-search-polygon-fill-layer', 'campsite-search-polygon-fill-source', 'rgba(242,194,77,1)', 0.16);
        ensureLineLayer('campsite-search-polygon-line-layer', 'campsite-search-polygon-line-source', 'rgba(242,194,77,0.95)', 2.5, 0.86, [2, 1.4]);
        ensureCircleLayer('campsite-search-polygon-point-layer', 'campsite-search-polygon-point-source', 'rgba(242,194,77,0.92)', 4.2, 0.95, 'rgba(8,14,18,0.96)', 1.5);
        ensureCampScoutPinLayer();
        applyDispersedCampingDesiredState('style_load');
        if (dispersedRouteBuildState.enabled) {
          updateDispersedRouteBuildCandidates('style_load');
        }
        applyEstablishedCampsitesDesiredState('style_load');
        promoteRouteGuidanceLayers();
      }

      function applyRouteRenderMode(mode) {
        if (!map || !map.getLayer('route-layer')) return;
        var normalizedMode = mode || 'selected';
        try {
          if (map.getLayer('route-halo-layer')) {
            map.setPaintProperty('route-halo-layer', 'line-width', normalizedMode === 'preview' ? 8.5 : 10.5);
            map.setPaintProperty('route-halo-layer', 'line-opacity', normalizedMode === 'preview' ? 0.5 : 0.72);
            map.setPaintProperty(
              'route-halo-layer',
              'line-dasharray',
              normalizedMode === 'preview' ? [1.4, 1.2] : [1, 0]
            );
          }
          map.setPaintProperty('route-layer', 'line-width', normalizedMode === 'preview' ? 4.25 : 5);
          map.setPaintProperty('route-layer', 'line-opacity', normalizedMode === 'preview' ? 0.72 : 0.95);
          map.setPaintProperty(
            'route-layer',
            'line-dasharray',
            normalizedMode === 'preview' ? [1.4, 1.2] : [1, 0]
          );
        } catch (e) {}
      }

      function updateRoute(coords, color, mode, routeLineKey) {
        applyRouteRenderMode(mode);
        var fc = featureCollection(
          coords && coords.length > 1 ? [lineFeature('route', coords, { color: color || '#2ECC71', routeLineKey: routeLineKey || null })] : []
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
              var normalizedCoordinates = normalizeLngLatLine(seg.coordinates);
              return lineFeature(seg.id, normalizedCoordinates, {
                color: seg.color || '#2ECC71',
                kind: seg.kind || null,
                name: seg.name || null,
                category: seg.category || null,
                categoryLabel: seg.categoryLabel || null,
                routeGeometrySourceKind: seg.routeGeometrySourceKind || null,
                routeGeometryDataState: seg.routeGeometryDataState || null,
                routeGeometryConfidence: seg.routeGeometryConfidence || null,
                routeGeometryWarningsJson: seg.routeGeometryWarningsJson || null,
                routeGeometrySelected:
                  seg.kind === 'route_geometry_segment' &&
                  (seg.routeGeometrySelected === true || selectedRouteGeometrySegmentIds[String(seg.id)] === true)
              });
            })
            .filter(function(feature) { return feature.geometry.coordinates.length > 1; })
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

      function waypointMarkerClass(item) {
        if (item && item.endpointRole === 'trail_entry') return 'marker-dot marker-waypoint marker-waypoint-entry';
        if (item && item.endpointRole === 'trail_end') return 'marker-dot marker-waypoint marker-waypoint-end';
        return 'marker-dot marker-waypoint';
      }

      function replaceMarkers(list, items, className, kind) {
        safeRemoveMarkers(list);
        list.length = 0;

        (items || []).forEach(function(item) {
          var markerClass = typeof className === 'function' ? className(item) : className;
          var marker = mkMarker(markerClass, item.longitude, item.latitude, Object.assign({ kind: kind }, item));
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
          (item.pinFamily === 'campops' ? ' camp-scout-campops' : '') +
          (item.selected ? ' camp-scout-selected' : '');

        var core = document.createElement('div');
        core.className = 'camp-scout-core';
        var tent = document.createElement('span');
        tent.className = 'camp-scout-tent';
        tent.textContent = '\u26FA';
        tent.setAttribute('aria-hidden', 'true');
        core.appendChild(tent);
        root.appendChild(core);
        if (item.pinFamily === 'campops') {
          var rank = document.createElement('span');
          rank.className = 'camp-scout-rank';
          rank.textContent = String(item.rankLabel || item.rank || item.confidenceGrade || '?').slice(0, 3);
          root.appendChild(rank);
        }
        root.setAttribute('role', 'button');
        root.setAttribute('tabindex', '0');
        root.setAttribute(
          'aria-label',
          String(item.accessibilityLabel || ((item.campOpsRoleLabel || 'Camp Endpoint pin') + ': ' + (item.title || 'camp candidate')))
        );
        return root;
      }

      function pinTypeClass(type) {
        var normalized = String(type || 'poi').toLowerCase();
        if (normalized === 'camp' || normalized === 'fuel' || normalized === 'water' || normalized === 'poi') {
          return normalized;
        }
        return 'fallback';
      }

      function createDroppedPinMarkerElement(item) {
        var pinType = pinTypeClass(item && item.type);
        var el = document.createElement('div');
        el.className =
          'marker-dot marker-pin marker-pin-' +
          pinType +
          (item && item.resolved ? ' marker-pin-resolved' : '');
        if (item && item.color) el.style.background = item.color;

        var icon = document.createElement('span');
        icon.className = 'pin-type-icon pin-type-' + pinType;
        if (pinType === 'fallback') {
          icon.textContent = String((item && item.mapChar) || (item && item.type) || '?').slice(0, 2).toUpperCase();
        }
        icon.setAttribute('aria-hidden', 'true');
        el.appendChild(icon);
        return el;
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

      function normalizeWebBearing(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        var wrapped = value % 360;
        return wrapped < 0 ? wrapped + 360 : wrapped;
      }

      function resolveViewportMarkerHeadingDeg(heading, mapBearing) {
        var normalizedHeading = normalizeWebBearing(heading);
        if (normalizedHeading == null) return null;
        var normalizedMapBearing = normalizeWebBearing(mapBearing) || 0;
        return normalizeWebBearing(normalizedHeading - normalizedMapBearing);
      }

      function applyUserMarkerHeading(heading) {
        if (!userMarker) return;
        try {
          var el = userMarker.getElement();
          var rotor = el ? el.querySelector('.marker-user-rotor') : null;
          var viewportHeading = resolveViewportMarkerHeadingDeg(
            heading,
            map && typeof map.getBearing === 'function' ? map.getBearing() : 0
          );
          if (rotor && typeof viewportHeading === 'number') {
            rotor.style.transform = 'rotate(' + viewportHeading + 'deg)';
            rotor.style.transformOrigin = 'center center';
          }
        } catch (e) {}
      }

      function cancelUserMarkerAnimation() {
        if (userMarkerAnimationFrame != null) {
          try { cancelAnimationFrame(userMarkerAnimationFrame); } catch (e) {}
          userMarkerAnimationFrame = null;
        }
      }

      function animateUserMarkerTo(loc, heading) {
        if (!userMarker) return;
        if (!userMarkerLocation) {
          userMarkerLocation = { latitude: loc.latitude, longitude: loc.longitude };
          userMarker.setLngLat([loc.longitude, loc.latitude]);
          applyUserMarkerHeading(heading);
          return;
        }

        var start = userMarkerLocation;
        try {
          if (typeof userMarker.getLngLat === 'function') {
            var currentLngLat = userMarker.getLngLat();
            if (
              currentLngLat &&
              typeof currentLngLat.lat === 'number' &&
              typeof currentLngLat.lng === 'number' &&
              Number.isFinite(currentLngLat.lat) &&
              Number.isFinite(currentLngLat.lng)
            ) {
              start = { latitude: currentLngLat.lat, longitude: currentLngLat.lng };
            }
          }
        } catch (e) {}
        var end = { latitude: loc.latitude, longitude: loc.longitude };
        var duration = 950;
        var startedAt = Date.now();
        cancelUserMarkerAnimation();

        function step() {
          var elapsed = Date.now() - startedAt;
          var t = Math.max(0, Math.min(1, elapsed / duration));
          var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          var lat = start.latitude + (end.latitude - start.latitude) * eased;
          var lng = start.longitude + (end.longitude - start.longitude) * eased;
          try {
            userMarker.setLngLat([lng, lat]);
            applyUserMarkerHeading(heading);
          } catch (e) {}
          if (t < 1) {
            userMarkerAnimationFrame = requestAnimationFrame(step);
          } else {
            userMarkerAnimationFrame = null;
            userMarkerLocation = end;
          }
        }

        userMarkerAnimationFrame = requestAnimationFrame(step);
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
            cancelUserMarkerAnimation();
            try { userMarker.remove(); } catch (e) {}
            userMarker = null;
            userMarkerLocation = null;
            userMarkerHeading = null;
          }
          return;
        }

        userMarkerHeading = typeof heading === 'number' ? heading : userMarkerHeading;
        if (!userMarker) {
          userMarker = mkMarker('marker-user', loc.longitude, loc.latitude, null, heading || 0);
          userMarker.addTo(map);
          userMarkerLocation = { latitude: loc.latitude, longitude: loc.longitude };
          applyUserMarkerHeading(userMarkerHeading);
        } else {
          animateUserMarkerTo(loc, userMarkerHeading);
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
        if (!map) return null;
        var normalizedCoord = normalizeLngLatCoordinate(coord);
        if (!normalizedCoord || normalizedCoord.length < 2) return null;
        try {
          return map.project({ lng: normalizedCoord[0], lat: normalizedCoord[1] });
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

      function compactRouteablePayloadLine(coordinates) {
        var line = normalizeLngLatLine(coordinates || []);
        if (line.length <= 420) return line;
        var sampled = [];
        var step = Math.ceil(line.length / 420);
        for (var i = 0; i < line.length; i += step) {
          sampled.push(line[i]);
        }
        var last = line[line.length - 1];
        var sampledLast = sampled[sampled.length - 1];
        if (!sampledLast || sampledLast[0] !== last[0] || sampledLast[1] !== last[1]) {
          sampled.push(last);
        }
        return sampled;
      }

      function routeablePayloadLineForFeatureAtPoint(feature, point) {
        var lines = extractFeatureLineCoordinates(feature);
        var best = null;
        lines.forEach(function(line, index) {
          var normalized = normalizeLngLatLine(line || []);
          if (normalized.length < 2) return;
          var candidate = point
            ? scanLineForNearest(point, normalized, 'payload-line:' + String(index), 'payload', 80)
            : null;
          var distance = candidate ? candidate.distancePx : index;
          if (!best || distance < best.distancePx) {
            best = { coordinates: normalized, distancePx: distance };
          }
        });
        return best ? compactRouteablePayloadLine(best.coordinates) : [];
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
          segment.snapProvider = null;
          segment.snapProfile = null;
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
          segment.snapProvider = 'rendered_features';
          segment.snapProfile = null;
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
          segment.snapProvider = 'rendered_features';
          segment.snapProfile = null;
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
        segment.snapProvider = null;
        segment.snapProfile = null;
        segment.snapMessage = ambiguous
          ? 'Ambiguous route match. Kept raw line; undo and retry if needed.'
          : 'No reliable road or trail match. Kept smoothed raw line; undo and retry if needed.';
        routeBuilderLastSnapSource = segment.snapSource;
        return segment;
      }

      function startRouteBuilderDraw(event) {
        if (routeBuilderMode === 'anchor_trace') return false;
        if (!routeBuilderActive || !map || routeBuilderPointerId !== null || routeBuilderPointerCount > 1) return false;
        var point = getRouteBuilderEventPoint(event);
        if (dispersedRouteBuildState.enabled && findDispersedRouteBuildFeatureAtPoint(point)) return false;
        if (routeBuilderActive && findRouteGeometrySegmentFeatureAtPoint(point)) return false;
        var rawCoordinate = routeBuilderRawCoordinateFromPoint(point);
        resetRouteBuilderStrokeSnapState();
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
          map.getCanvasContainer().style.cursor = routeBuilderActive && routeBuilderMode !== 'anchor_trace' ? 'crosshair' : '';
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
        routeBuilderMode = payload.routeBuilderMode || routeBuilderMode || 'freehand';
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

      function replayPendingPayloadAfterStyleChange(reason, attempt) {
        attempt = attempt || 0;
        if (!map || !pendingPayload) return;
        if (styleReplayTimer) {
          clearTimeout(styleReplayTimer);
          styleReplayTimer = null;
        }
        if (!isMapStyleReady()) {
          if (attempt >= 10) {
            sendLog('style replay skipped before style ready: ' + String(reason || 'unknown'));
            return;
          }
          styleReplayTimer = setTimeout(function() { replayPendingPayloadAfterStyleChange(reason, attempt + 1); }, Math.min(320, 45 + attempt * 35));
          return;
        }
        applyPayload(pendingPayload);
      }

      function applyPayload(payload) {
        if (!map || !payload || !map.isStyleLoaded()) return;

        var nextMapStyleKey = resolvePayloadMapStyleKey(payload);
        if (nextMapStyleKey) activeMapStyleKey = nextMapStyleKey;

        if (payload.styleUrl && payload.styleUrl !== requestedStyleUrl) {
          requestedStyleUrl = payload.styleUrl;
          activeStyleUrl = payload.styleUrl;
          lastAppliedStyleUrl = payload.styleUrl;
          attemptedStyles = Object.create(null);
          attemptedStyles[payload.styleUrl] = true;
          map.setStyle(payload.styleUrl);
          replayPendingPayloadAfterStyleChange('set_style', 0);
          return;
        }

        reinitializeStyleArtifacts();
        routeBuilderMode = payload.routeBuilderMode || 'freehand';
        routeBuilderColor = payload.routeBuilderColor || routeBuilderColor || '#65F0D4';
        routeBuilderAnchors = payload.routeBuilderAnchors || [];
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
        updateRoute(payload.routeCoords || [], payload.routeColor, payload.routeRenderMode, payload.routeLineKey);
        updateRouteProgress(payload.progressRouteCoords || [], payload.progressColor);
        selectedRouteGeometrySegmentIds = buildDispersedRouteSelectedSet(payload.selectedRouteGeometrySegmentIds || []);
        updateSegments(payload.segments || []);
        updateTrail(payload.trailSegments || []);
        updateSpeedTrail(payload.speedSegments || []);
        updateRemoteOverlay(payload.remoteOverlay || null);
        updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor, routeBuilderAnchors);
        updateRouteProfileFocus(payload.routeProfileFocus || null);
        updateCampsiteSearchPolygon(payload.campsiteSearchPolygon || null);
        promoteRouteGuidanceLayers();

        if (markerPayloadChanged('waypoints', payload.waypoints || [])) {
          replaceMarkers(waypointMarkers, payload.waypoints || [], waypointMarkerClass, 'waypoint');
        }
        if (markerPayloadChanged('bailouts', payload.bailouts || [])) {
          replaceMarkers(bailoutMarkers, payload.bailouts || [], 'marker-dot marker-bailout', 'bailout');
        }
        if (markerPayloadChanged('campsites', payload.campsites || [])) {
          replaceCampIntelMarkers(campsiteMarkers, payload.campsites || []);
        }
        if (markerPayloadChanged('campScoutPins', payload.campScoutPins || [])) {
          updateCampScoutPinLayer(payload.campScoutPins || []);
          replaceCampScoutMarkers(campScoutMarkers, payload.campScoutPins || []);
        }
        if (markerPayloadChanged('tiltAlerts', payload.tiltAlerts || [])) {
          replaceMarkers(tiltMarkers, payload.tiltAlerts || [], 'marker-dot marker-tilt', 'tiltAlert');
        }

        if (markerPayloadChanged('pins', payload.pins || [])) {
          safeRemoveMarkers(pinMarkers);
          pinMarkers = [];
          (payload.pins || []).forEach(function(item) {
            var el = createDroppedPinMarkerElement(item);

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
        }

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
        var mapOptions = {
          container: 'map',
          style: activeStyleUrl,
          center: [-121.0, 38.5],
          zoom: 7,
          attributionControl: false,
          interactive: initialInteractive,
          scrollZoom: false,
          boxZoom: initialInteractive,
          dragRotate: false,
          touchPitch: false,
          keyboard: false,
          touchZoomRotate: initialInteractive,
          doubleClickZoom: initialInteractive,
          antialias: false,
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
          performanceMetricsCollection: false,
          fadeDuration: 0
        };
        if (compactTileCacheSize) {
          mapOptions.maxTileCacheSize = compactTileCacheSize;
        }
        map = new mapboxgl.Map(mapOptions);
      } catch (err) {
        var constructorMessage = String(err && err.message ? err.message : err);
        sendLog('Map constructor failed: ' + constructorMessage);
        send('mapReady', { ok: false, reason: 'constructor_failed', detail: constructorMessage });
        return;
        }

        bootstrapReadyTimer = setTimeout(function() {
          send('mapReady', { ok: true, reason: 'bootstrap_timeout' });
        }, 1200);

        map.on('load', function() {
          sendLog('map load event fired');
          replayPendingPayloadAfterStyleChange('load', 0);

          if (bootstrapReadyTimer) {
            clearTimeout(bootstrapReadyTimer);
            bootstrapReadyTimer = null;
          }

          send('mapReady', { ok: true });
          reportRoadClass();
        });

        map.on('style.load', function() {
          replayPendingPayloadAfterStyleChange('style_load', 0);
        });

        map.on('styledata', function() {
          replayPendingPayloadAfterStyleChange('styledata', 0);
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

        map.on('rotate', function() {
          applyUserMarkerHeading(userMarkerHeading);
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
            scheduleDispersedRouteBuildCandidateUpdate('moveend');
          }, 90);
        });

        function buildRenderedRouteableLongPressPayloadAtPoint(point, lngLat) {
          if (!map || !point || !lngLat) return null;
          try {
            var radius = 22;
            var features = map.queryRenderedFeatures([
              [point.x - radius, point.y - radius],
              [point.x + radius, point.y + radius]
            ]) || [];
            for (var i = 0; i < Math.min(features.length, 80); i += 1) {
              var feature = features[i];
              if (!isRouteBuilderRouteableFeature(feature)) continue;
              var snapSource = classifyRouteBuilderSnapSource(feature);
              var label = sourceLabelForDispersedRouteFeature(feature);
              return {
                kind: 'rendered_routeable_feature',
                id: feature && feature.id != null ? String(feature.id) : null,
                name: label,
                sourceLabel:
                  snapSource === 'trail'
                    ? 'Visible trail geometry'
                    : snapSource === 'road'
                      ? 'Visible road geometry'
                      : 'Visible routeable geometry',
                confidence: 'map_rendered',
                dataState: 'live',
                accessLabel: 'Unknown - verify posted rules and closures locally.',
                category: snapSource,
                categoryLabel: snapSource,
                coordinates: routeablePayloadLineForFeatureAtPoint(feature, point),
                latitude: lngLat.lat,
                longitude: lngLat.lng
              };
            }
          } catch (err) {}
          return null;
        }

        function buildRouteableFeaturePayloadAtPoint(point, lngLat) {
          try {
            var routeGeometryFeature = findRouteGeometrySegmentFeatureAtPoint(point);
            var routeGeometryProps = routeGeometryFeature && routeGeometryFeature.properties ? routeGeometryFeature.properties : {};
            if (routeGeometryFeature && routeGeometryProps.kind === 'route_geometry_segment') {
              return {
                kind: routeGeometryProps.kind || null,
                id: routeGeometryFeature.id || null,
                name: routeGeometryProps.name || null,
                category: routeGeometryProps.category || null,
                categoryLabel: routeGeometryProps.categoryLabel || null,
                color: routeGeometryProps.color || null,
                routeGeometrySourceKind: routeGeometryProps.routeGeometrySourceKind || null,
                routeGeometryDataState: routeGeometryProps.routeGeometryDataState || null,
                routeGeometryConfidence: routeGeometryProps.routeGeometryConfidence || null,
                routeGeometryWarningsJson: routeGeometryProps.routeGeometryWarningsJson || null,
                coordinates: routeablePayloadLineForFeatureAtPoint(routeGeometryFeature, point),
                latitude: lngLat.lat,
                longitude: lngLat.lng
              };
            }
          } catch (err) {}
          try {
            var segmentFeatures = map.queryRenderedFeatures(point, { layers: ['segment-layer'] }) || [];
            for (var i = 0; i < segmentFeatures.length; i += 1) {
              var props = segmentFeatures[i] && segmentFeatures[i].properties ? segmentFeatures[i].properties : {};
              if (props.kind === 'explore_route') {
                return {
                  kind: props.kind || null,
                  id: segmentFeatures[i].id || null,
                  name: props.name || null,
                  category: props.category || null,
                  categoryLabel: props.categoryLabel || null,
                  color: props.color || null,
                  coordinates: routeablePayloadLineForFeatureAtPoint(segmentFeatures[i], point),
                  latitude: lngLat.lat,
                  longitude: lngLat.lng
                };
              }
            }
          } catch (err) {}
          return buildRenderedRouteableLongPressPayloadAtPoint(point, lngLat);
        }

        function sendLongPressPayload(point, lngLat) {
          if (!point || !lngLat) return;
          var now = Date.now();
          if (now - longPressLastSentAt < 300) return;
          longPressLastSentAt = now;
          send('longPress', {
            latitude: lngLat.lat,
            longitude: lngLat.lng,
            routeableFeature: buildRouteableFeaturePayloadAtPoint(point, lngLat)
          });
        }

        function clearTouchLongPressTimer() {
          if (longPressTouchTimer) {
            clearTimeout(longPressTouchTimer);
            longPressTouchTimer = null;
          }
        }

        function clearPointerLongPressTimer() {
          if (longPressPointerTimer) {
            clearTimeout(longPressPointerTimer);
            longPressPointerTimer = null;
          }
        }

        function getLongPressEventTargets() {
          var canvas = map && map.getCanvas ? map.getCanvas() : null;
          var container = map && map.getCanvasContainer ? map.getCanvasContainer() : null;
          var targets = [];
          function addTarget(target) {
            if (target && target.addEventListener && targets.indexOf(target) === -1) {
              targets.push(target);
            }
          }
          addTarget(container);
          addTarget(canvas);
          addTarget(document);
          return targets;
        }

        function addLongPressEventListener(target, type, handler) {
          try {
            target.addEventListener(type, handler, { passive: true, capture: true });
          } catch (err) {
            target.addEventListener(type, handler, true);
          }
        }

        function pointerPointFromEvent(event) {
          var canvas = map && map.getCanvas ? map.getCanvas() : null;
          if (!event || !canvas || !canvas.getBoundingClientRect) return null;
          var rect = canvas.getBoundingClientRect();
          return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          };
        }

        function installPointerLongPressMenuHandler() {
          var targets = getLongPressEventTargets();
          if (!targets.length || typeof window.PointerEvent === 'undefined') return;

          var onPointerDown = function(event) {
            if (routeBuilderActive) return;
            if (event && event.pointerType === 'mouse' && event.button !== 0) return;
            clearPointerLongPressTimer();
            longPressPointerId = event ? event.pointerId : null;
            var point = pointerPointFromEvent(event);
            if (!point) {
              longPressPointerStartPoint = null;
              return;
            }
            longPressPointerStartPoint = point;
            longPressPointerTimer = setTimeout(function() {
              longPressPointerTimer = null;
              if (!longPressPointerStartPoint || !map || !map.unproject || routeBuilderActive) return;
              var lngLat = map.unproject(longPressPointerStartPoint);
              longPressSuppressClickUntil = Date.now() + 650;
              sendLongPressPayload(longPressPointerStartPoint, lngLat);
            }, LONG_PRESS_TOUCH_DELAY_MS);
          };

          var onPointerMove = function(event) {
            if (!longPressPointerStartPoint) return;
            if (longPressPointerId !== null && event && event.pointerId !== longPressPointerId) return;
            var point = pointerPointFromEvent(event);
            if (!point) {
              clearPointerLongPressTimer();
              longPressPointerStartPoint = null;
              longPressPointerId = null;
              return;
            }
            var dx = point.x - longPressPointerStartPoint.x;
            var dy = point.y - longPressPointerStartPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_TOUCH_MOVE_CANCEL_PX) {
              clearPointerLongPressTimer();
              longPressPointerStartPoint = null;
              longPressPointerId = null;
            }
          };

          var onPointerUp = function(event) {
            if (longPressPointerId !== null && event && event.pointerId !== longPressPointerId) return;
            clearPointerLongPressTimer();
            longPressPointerStartPoint = null;
            longPressPointerId = null;
          };

          var onPointerCancel = function(event) {
            if (longPressPointerId !== null && event && event.pointerId !== longPressPointerId) return;
            clearPointerLongPressTimer();
            longPressPointerStartPoint = null;
            longPressPointerId = null;
          };

          for (var i = 0; i < targets.length; i += 1) {
            addLongPressEventListener(targets[i], 'pointerdown', onPointerDown);
            addLongPressEventListener(targets[i], 'pointermove', onPointerMove);
            addLongPressEventListener(targets[i], 'pointerup', onPointerUp);
            addLongPressEventListener(targets[i], 'pointercancel', onPointerCancel);
          }
        }

        function touchPointFromEvent(event) {
          if (!event || !event.touches || event.touches.length !== 1) return null;
          var touch = event.touches[0];
          var canvas = map && map.getCanvas ? map.getCanvas() : null;
          if (!touch || !canvas || !canvas.getBoundingClientRect) return null;
          var rect = canvas.getBoundingClientRect();
          return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
          };
        }

        function installTouchLongPressMenuHandler() {
          var targets = getLongPressEventTargets();
          if (!targets.length) return;

          var onTouchStart = function(event) {
            clearTouchLongPressTimer();
            var point = touchPointFromEvent(event);
            if (!point) {
              longPressTouchStartPoint = null;
              return;
            }
            longPressTouchStartPoint = point;
            longPressTouchTimer = setTimeout(function() {
              longPressTouchTimer = null;
              if (!longPressTouchStartPoint || !map || !map.unproject) return;
              var lngLat = map.unproject(longPressTouchStartPoint);
              longPressSuppressClickUntil = Date.now() + 650;
              sendLongPressPayload(longPressTouchStartPoint, lngLat);
            }, LONG_PRESS_TOUCH_DELAY_MS);
          };

          var onTouchMove = function(event) {
            if (!longPressTouchStartPoint) return;
            var point = touchPointFromEvent(event);
            if (!point) {
              clearTouchLongPressTimer();
              longPressTouchStartPoint = null;
              return;
            }
            var dx = point.x - longPressTouchStartPoint.x;
            var dy = point.y - longPressTouchStartPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_TOUCH_MOVE_CANCEL_PX) {
              clearTouchLongPressTimer();
              longPressTouchStartPoint = null;
            }
          };

          var onTouchEnd = function() {
            clearTouchLongPressTimer();
            longPressTouchStartPoint = null;
          };

          var onTouchCancel = function() {
            clearTouchLongPressTimer();
            longPressTouchStartPoint = null;
          };

          for (var i = 0; i < targets.length; i += 1) {
            addLongPressEventListener(targets[i], 'touchstart', onTouchStart);
            addLongPressEventListener(targets[i], 'touchmove', onTouchMove);
            addLongPressEventListener(targets[i], 'touchend', onTouchEnd);
            addLongPressEventListener(targets[i], 'touchcancel', onTouchCancel);
          }
        }

        map.on('contextmenu', function(e) {
          longPressSuppressClickUntil = Date.now() + 650;
          sendLongPressPayload(e.point, e.lngLat);
        });
        installPointerLongPressMenuHandler();
        installTouchLongPressMenuHandler();

        map.on('click', function(e) {
          if (Date.now() < longPressSuppressClickUntil) return;
          if (routeBuilderActive && Date.now() < routeBuilderSuppressClickUntil) return;
          if (Date.now() < dispersedCampingMapTapSuppressUntil) return;
          if (routeBuilderMode === 'anchor_trace') {
            send('mapTap', {
              latitude: e.lngLat.lat,
              longitude: e.lngLat.lng,
              routeableFeature: buildRouteableFeaturePayloadAtPoint(e.point, e.lngLat)
            });
            return;
          }
          try {
            var dispersedLegFeature = findDispersedRouteBuildFeatureAtPoint(e.point);
            var dispersedLegPayload = buildDispersedRouteBuildPayloadFromFeature(dispersedLegFeature);
            if (dispersedLegPayload) {
              send('dispersedRouteLegTap', dispersedLegPayload);
              return;
            }
          } catch (err) {}
          try {
            var routeGeometryFeature = findRouteGeometrySegmentFeatureAtPoint(e.point);
            var routeGeometryProps = routeGeometryFeature && routeGeometryFeature.properties ? routeGeometryFeature.properties : {};
            if (routeGeometryFeature && routeGeometryProps.kind === 'route_geometry_segment') {
              send('segmentTap', {
                kind: routeGeometryProps.kind || null,
                id: routeGeometryFeature.id || null,
                name: routeGeometryProps.name || null,
                category: routeGeometryProps.category || null,
                categoryLabel: routeGeometryProps.categoryLabel || null,
                color: routeGeometryProps.color || null,
                routeGeometrySourceKind: routeGeometryProps.routeGeometrySourceKind || null,
                routeGeometryDataState: routeGeometryProps.routeGeometryDataState || null,
                routeGeometryConfidence: routeGeometryProps.routeGeometryConfidence || null,
                routeGeometryWarningsJson: routeGeometryProps.routeGeometryWarningsJson || null,
                latitude: e.lngLat.lat,
                longitude: e.lngLat.lng
              });
              return;
            }
          } catch (err) {}
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

        if (msg.type === DISPERSED_ROUTE_BUILD_MESSAGE_TYPE) {
          setDispersedRouteBuildEnabled(msg.payload || null);
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
  routeLineKey = null,
  showTrailEntryEndpointMarker = false,
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
  onBailoutTap,
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
  motionPriority = 'hot',
  isLoading = false,
  hasToken = true,
  onRetry,
  onReadyStateChange,
  campsites = [],
  tiltAlerts = [],
  campsiteMarkers = [],
  campIntelMarkers = [],
  onCampIntelTap,
  campEndpointMarkers = [],
  onCampEndpointTap,
  campScoutMarkers = [],
  onCampScoutTap,
  tiltAlertMarkers = [],
  cameraMode,
  cameraCommand = null,
  cameraCommandTrigger,
  routeBuilderActive = false,
  routeBuilderMode = 'freehand',
  routeBuilderSegments = [],
  routeBuilderAnchors = [],
  routeBuilderColor = '#65F0D4',
  routeProfileFocus = null,
  onRouteBuilderUpdate,
  onRouteBuilderGestureStateChange,
  remoteOverlay = null,
  dispersedCampingEligibility = null,
  dispersedRouteBuild = null,
  onDispersedCampingRegionTap,
  onDispersedRouteLegTap,
  establishedCampsites = null,
  onEstablishedCampsiteTap,
  campsiteSearchPolygon = null,
  surfaceMode = 'full',
  style,
}: MapRendererProps) {
  const webViewRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);
  const [webBootTimedOut, setWebBootTimedOut] = useState(false);
  const [webBootIssue, setWebBootIssue] = useState<string | null>(null);
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const bootstrapSentRef = useRef(false);
  const lastPayloadHashRef = useRef('');
  const lastDynamicPayloadHashRef = useRef('');
  const failSafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactRetryCountRef = useRef(0);
  const constructorRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constructorRetryCountRef = useRef(0);
  const lastCameraCommandHashRef = useRef('');
  const lastLegacyFollowHashRef = useRef('');
  const previousHtmlHashRef = useRef<string>('');
  const activeWebViewInstanceKeyRef = useRef(0);
  const activeFailSafeInstanceKeyRef = useRef<number | null>(null);
  const failSafeArmedInstanceKeyRef = useRef<number | null>(null);
  const bootstrapAcknowledgedInstanceKeyRef = useRef<number | null>(null);
  const loadStartedInstanceKeyRef = useRef<number | null>(null);
  const startupSettledRef = useRef(false);
  const definitiveReadyInstanceKeyRef = useRef<number | null>(null);
  const hasEverReachedReadyRef = useRef(false);

  const shouldLoadMap = !!hasToken && !!mapboxToken;
  const isCompactSurface = surfaceMode === 'compact';

  useEffect(() => {
    onReadyStateChange?.(shouldLoadMap && (webReady || hasEverReachedReadyRef.current));
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
        ? makeMapHtml(
            mapboxToken,
            bootStyleUrl,
            MAP_STYLE_FALLBACK_CHAIN,
            webViewInstanceKey,
            surfaceMode,
            interactive !== false,
          )
        : '',
    [shouldLoadMap, mapboxToken, bootStyleUrl, webViewInstanceKey, surfaceMode, interactive],
  );
  const htmlHash = useMemo(() => stableStringify({
    shouldLoadMap,
    instanceKey: webViewInstanceKey,
    tokenPrefix: mapboxToken ? mapboxToken.slice(0, 8) : '',
    initialStyleUrl: bootStyleUrl,
  }), [shouldLoadMap, webViewInstanceKey, mapboxToken, bootStyleUrl]);

  const webViewKey = `ecs-map-webview-${webViewInstanceKey}`;
  const webViewSource = useMemo(
    () => ({ html, baseUrl: 'https://api.mapbox.com/' }),
    [html],
  );
  const hasHandledInitialCenterTriggerRef = useRef(false);
  const hasHandledInitialBoundsTriggerRef = useRef(false);

  const clearFailSafeTimer = useCallback(() => {
    if (failSafeTimerRef.current) {
      clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
    activeFailSafeInstanceKeyRef.current = null;
  }, []);

  const clearHardFailureTimer = useCallback(() => {
    if (hardFailureTimerRef.current) {
      clearTimeout(hardFailureTimerRef.current);
      hardFailureTimerRef.current = null;
    }
  }, []);

  const clearCompactRetryTimer = useCallback(() => {
    if (compactRetryTimerRef.current) {
      clearTimeout(compactRetryTimerRef.current);
      compactRetryTimerRef.current = null;
    }
  }, []);

  const clearConstructorRetryTimer = useCallback(() => {
    if (constructorRetryTimerRef.current) {
      clearTimeout(constructorRetryTimerRef.current);
      constructorRetryTimerRef.current = null;
    }
  }, []);

  const resetRuntimeState = useCallback(() => {
    setWebReady(false);
    setWebBootTimedOut(false);
    setWebBootIssue(null);
    hasEverReachedReadyRef.current = false;
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
    clearFailSafeTimer();
    clearHardFailureTimer();
    clearCompactRetryTimer();
    clearConstructorRetryTimer();
  }, [clearCompactRetryTimer, clearConstructorRetryTimer, clearFailSafeTimer, clearHardFailureTimer]);

  const remountWebView = useCallback((reason: string) => {
    debugLog('[MapRenderer] Remounting WebView', {
      reason,
      instanceKey: activeWebViewInstanceKeyRef.current,
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
        routeLineKey,
        showTrailEntryEndpointMarker,
        mapStyle,
        mapboxToken,
        showUserLocation,
        userLocation,
        motionPriority,
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
        campEndpointMarkers,
        campScoutMarkers,
        tiltAlertMarkers,
        routeBuilderActive,
        routeBuilderMode,
        routeBuilderSegments,
        routeBuilderAnchors,
        routeBuilderColor,
        routeProfileFocus,
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
      routeLineKey,
      showTrailEntryEndpointMarker,
      mapStyle,
      mapboxToken,
      showUserLocation,
      userLocation,
      motionPriority,
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
      campEndpointMarkers,
      campScoutMarkers,
      tiltAlertMarkers,
      routeBuilderActive,
      routeBuilderMode,
      routeBuilderSegments,
      routeBuilderAnchors,
      routeBuilderColor,
      routeProfileFocus,
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
        motionPriority,
        cameraMode,
        interactive,
        routeBuilderActive,
        routeBuilderMode,
      }),
    [replayMarker, userLocation, showUserLocation, vehicleHeading, motionPriority, cameraMode, interactive, routeBuilderActive, routeBuilderMode],
  );

  const payloadHash = useMemo(() => buildMapOverlayPayloadHash(payload), [payload]);
  const dynamicPayloadHash = useMemo(() => stableStringify(dynamicPayload), [dynamicPayload]);
  const fallbackMarkers = useMemo(
    () => [
      ...(payload.waypoints || []).map((marker) => ({ ...marker, color: '#F2C24D', type: 'waypoint' })),
      ...(payload.bailouts || []).map((marker) => ({ ...marker, color: '#FFCF5A', type: 'bailout' })),
      ...(payload.pins || []),
      ...(payload.campScoutPins || []).map((marker) => ({ ...marker, color: '#5EE1A0', type: 'camp' })),
    ],
    [payload.bailouts, payload.campScoutPins, payload.pins, payload.waypoints],
  );
  const fallbackSegments = useMemo(
    () => [
      ...(payload.segments || []),
      ...(payload.trailSegments || []),
      ...(payload.speedSegments || []),
    ],
    [payload.segments, payload.speedSegments, payload.trailSegments],
  );
  const hasFallbackGeometry = useMemo(
    () =>
      payload.routeCoords.length > 1 ||
      payload.progressRouteCoords.length > 1 ||
      fallbackSegments.some((segment) => Array.isArray(segment.coordinates) && segment.coordinates.length > 1) ||
      fallbackMarkers.length > 0 ||
      !!dynamicPayload.userLocation,
    [dynamicPayload.userLocation, fallbackMarkers.length, fallbackSegments, payload.progressRouteCoords.length, payload.routeCoords.length],
  );
  const fallbackVisible =
    hasFallbackGeometry &&
    (!shouldLoadMap || (!webReady && (webBootTimedOut || !!webBootIssue || !hasEverReachedReadyRef.current)));
  const dispersedCampingEligibilityRef = useRef(dispersedCampingEligibility);
  dispersedCampingEligibilityRef.current = dispersedCampingEligibility;
  const dispersedRouteBuildRef = useRef(dispersedRouteBuild);
  dispersedRouteBuildRef.current = dispersedRouteBuild;
  const establishedCampsitesRef = useRef(establishedCampsites);
  establishedCampsitesRef.current = establishedCampsites;
  const dispersedCampingEligibilityHash = useMemo(
    () => buildCampLayerHash(dispersedCampingEligibility),
    [dispersedCampingEligibility],
  );
  const dispersedRouteBuildHash = useMemo(
    () => buildDispersedRouteBuildHash(dispersedRouteBuild),
    [dispersedRouteBuild],
  );
  const establishedCampsitesHash = useMemo(
    () => buildCampLayerHash(establishedCampsites),
    [establishedCampsites],
  );

  useEffect(() => {
    if (!shouldLoadMap) {
      compactRetryCountRef.current = 0;
      constructorRetryCountRef.current = 0;
      resetRuntimeState();
    }
  }, [resetRuntimeState, shouldLoadMap]);

  useEffect(() => {
    if (!isCompactSurface || !shouldLoadMap || !webBootTimedOut || webReady) return;
    if (compactRetryCountRef.current >= 2) return;

    clearCompactRetryTimer();
    compactRetryTimerRef.current = setTimeout(() => {
      compactRetryCountRef.current += 1;
      remountWebView('compact_surface_boot_retry');
    }, 1200);

    return clearCompactRetryTimer;
  }, [
    clearCompactRetryTimer,
    isCompactSurface,
    remountWebView,
    shouldLoadMap,
    webBootTimedOut,
    webReady,
  ]);

  useEffect(() => {
    activeWebViewInstanceKeyRef.current = webViewInstanceKey;
    loadStartedInstanceKeyRef.current = null;
    failSafeArmedInstanceKeyRef.current = null;
    bootstrapAcknowledgedInstanceKeyRef.current = null;
    startupSettledRef.current = false;
    definitiveReadyInstanceKeyRef.current = null;
  }, [webViewInstanceKey]);

  const scheduleConstructorRetry = useCallback((reason: string) => {
    if (constructorRetryCountRef.current >= MAP_CONSTRUCTOR_RETRY_LIMIT) {
      return false;
    }

    clearConstructorRetryTimer();
    const nextAttempt = constructorRetryCountRef.current + 1;
    const delayMs = MAP_CONSTRUCTOR_RETRY_BASE_MS * nextAttempt;
    constructorRetryTimerRef.current = setTimeout(() => {
      constructorRetryCountRef.current = nextAttempt;
      remountWebView(`map_constructor_retry:${reason}:${nextAttempt}`);
    }, delayMs);

    return true;
  }, [clearConstructorRetryTimer, remountWebView]);

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
        setWebBootIssue(phase === 'bootstrap_progress' ? 'map_load_timeout' : 'webview_startup_timeout');
        if (isCompactSurface) {
          setWebBootTimedOut(true);
        }
      }, timeoutMs);
    },
    [clearFailSafeTimer, isCompactSurface],
  );

  const armHardFailureTimer = useCallback(
    (instanceKeyAtSchedule: number) => {
      clearHardFailureTimer();

      hardFailureTimerRef.current = setTimeout(() => {
        const isCurrentInstance =
          activeWebViewInstanceKeyRef.current === instanceKeyAtSchedule &&
          definitiveReadyInstanceKeyRef.current !== instanceKeyAtSchedule &&
          !startupSettledRef.current;

        if (!isCurrentInstance) {
          debugLog('[MapRenderer] Ignoring stale hard-failure timer', {
            scheduledFor: instanceKeyAtSchedule,
            current: activeWebViewInstanceKeyRef.current,
          });
          return;
        }

        debugLog('[MapRenderer] HARD FAILURE TIMER TRIGGERED', {
          instanceKey: instanceKeyAtSchedule,
        });
        clearFailSafeTimer();
        failSafeArmedInstanceKeyRef.current = null;
        startupSettledRef.current = true;
        setWebReady(false);
        setWebBootTimedOut(true);
        setWebBootIssue((current) => current ?? 'map_boot_unrecovered');
      }, WEBVIEW_HARD_FAILURE_TIMEOUT_MS);
    },
    [clearFailSafeTimer, clearHardFailureTimer],
  );

  useEffect(() => {
    if (!shouldLoadMap) return;
    if (startupSettledRef.current) return;
    if (definitiveReadyInstanceKeyRef.current === webViewInstanceKey) return;
    if (failSafeArmedInstanceKeyRef.current === webViewInstanceKey) return;

    setWebBootTimedOut(false);
    const instanceKeyAtSchedule = webViewInstanceKey;
    armFailSafeTimer(instanceKeyAtSchedule, WEBVIEW_FAILSAFE_TIMEOUT_MS, 'initial');
    armHardFailureTimer(instanceKeyAtSchedule);

    return () => {
      if (failSafeArmedInstanceKeyRef.current === instanceKeyAtSchedule) {
        failSafeArmedInstanceKeyRef.current = null;
      }
      if (activeFailSafeInstanceKeyRef.current === instanceKeyAtSchedule) {
        activeFailSafeInstanceKeyRef.current = null;
      }
      clearFailSafeTimer();
      clearHardFailureTimer();
    };
  }, [armFailSafeTimer, armHardFailureTimer, clearFailSafeTimer, clearHardFailureTimer, shouldLoadMap, webViewInstanceKey]);

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

    const state = dispersedCampingEligibilityRef.current;
    const enabled = !!state?.enabled;
    postToMap({
      type: SET_DISPERSED_CAMPING_LAYER_ENABLED,
      payload: {
        enabled,
        geojson: enabled ? state?.geojson : undefined,
      },
    });
  }, [
    shouldLoadMap,
    webReady,
    postToMap,
    dispersedCampingEligibilityHash,
  ]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const state = dispersedRouteBuildRef.current;
    postToMap({
      type: SET_DISPERSED_ROUTE_BUILD_ENABLED,
      payload: {
        enabled: !!state?.enabled,
        selectedSegmentIds: state?.selectedSegmentIds ?? [],
        renderKey: state?.renderKey,
      },
    });
  }, [
    shouldLoadMap,
    webReady,
    postToMap,
    dispersedRouteBuildHash,
  ]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const state = establishedCampsitesRef.current;
    const enabled = !!state?.enabled;
    postToMap({
      type: SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED,
      payload: {
        enabled,
        geojson: enabled ? state?.geojson : undefined,
      },
    });
  }, [
    shouldLoadMap,
    webReady,
    postToMap,
    establishedCampsitesHash,
  ]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (motionPriority === 'cold') return;
    if (!cameraCommand) return;

    const commandHash = buildCameraCommandHash(cameraCommand, cameraCommandTrigger);
    if (!commandHash || commandHash === lastCameraCommandHashRef.current) return;

    postToMap({ type: 'cameraCommand', payload: cameraCommand });
    lastCameraCommandHashRef.current = commandHash;
  }, [shouldLoadMap, webReady, motionPriority, cameraCommand, cameraCommandTrigger, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (motionPriority === 'cold') return;

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
  }, [shouldLoadMap, webReady, motionPriority, cameraCommand, followReplay, replayMarker, followUser, userLocation, postToMap]);

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
          if (
            definitiveReadyInstanceKeyRef.current === activeWebViewInstanceKeyRef.current ||
            hasEverReachedReadyRef.current
          ) {
            debugLog('[MapRenderer] Ignoring late mapReady failure after definitive ready', payload);
            return;
          }

          clearFailSafeTimer();
          clearHardFailureTimer();
          failSafeArmedInstanceKeyRef.current = null;
          if (payload?.reason === 'constructor_failed') {
            const retryScheduled = scheduleConstructorRetry(payload.reason);
            if (retryScheduled) {
              setWebReady(false);
              setWebBootTimedOut(false);
              setWebBootIssue(`map_constructor_retry_${constructorRetryCountRef.current + 1}`);
              return;
            }
          }
          startupSettledRef.current = true;
          setWebReady(false);
          setWebBootTimedOut(true);
          setWebBootIssue(
            typeof payload?.reason === 'string'
              ? `${payload.reason}${typeof payload?.detail === 'string' && payload.detail.length > 0 ? `: ${payload.detail.slice(0, 72)}` : ''}`
              : 'map_boot_failed',
          );
          return;
        }

        if (payload?.reason === 'bootstrap_timeout') {
          debugLog('[MapRenderer] Provisional bootstrap timeout received; showing initialized map shell');
          if (
            bootstrapAcknowledgedInstanceKeyRef.current !== activeWebViewInstanceKeyRef.current &&
            definitiveReadyInstanceKeyRef.current !== activeWebViewInstanceKeyRef.current
          ) {
            bootstrapAcknowledgedInstanceKeyRef.current = activeWebViewInstanceKeyRef.current;
            clearFailSafeTimer();
            clearHardFailureTimer();
            failSafeArmedInstanceKeyRef.current = null;
            startupSettledRef.current = true;
            hasEverReachedReadyRef.current = true;
            setWebBootTimedOut(false);
            setWebBootIssue(null);
            setWebReady(true);
          }
          return;
        }

        clearFailSafeTimer();
        clearHardFailureTimer();
        failSafeArmedInstanceKeyRef.current = null;
        startupSettledRef.current = true;
        definitiveReadyInstanceKeyRef.current = activeWebViewInstanceKeyRef.current;
        hasEverReachedReadyRef.current = true;
        compactRetryCountRef.current = 0;
        constructorRetryCountRef.current = 0;
        setWebBootTimedOut(false);
        setWebBootIssue(null);
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

      case 'dispersedRouteLegTap':
        onDispersedRouteLegTap?.(payload);
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
        if (payload?.kind === 'bailout') {
          onBailoutTap?.(payload);
          return;
        }
        if (payload?.kind === 'campIntel') {
          onCampIntelTap?.(payload);
          return;
        }
        if (payload?.kind === 'campScout') {
          if (payload?.pinFamily === 'campops' && onCampEndpointTap) {
            onCampEndpointTap(payload);
          } else {
            onCampScoutTap?.(payload);
          }
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
    clearFailSafeTimer,
    clearHardFailureTimer,
    onLongPress,
    onMapTap,
    onSegmentTap,
    onDispersedCampingRegionTap,
    onDispersedRouteLegTap,
    onEstablishedCampsiteTap,
    onBailoutTap,
    onPinTap,
    onMapCenterReply,
    onMapBoundsReply,
    onTiltAlertTap,
    onCampIntelTap,
    onCampEndpointTap,
    onCampScoutTap,
    onUserDrag,
    onRouteBuilderUpdate,
    onRouteBuilderGestureStateChange,
    onRoadClassification,
    scheduleConstructorRetry,
  ]);

  const showBootOverlay = !isCompactSurface && !webReady && shouldLoadMap && !hasEverReachedReadyRef.current;

  return (
    <View style={[styles.container, isCompactSurface && styles.compactContainer, style]}>
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
          mixedContentMode="always"
          thirdPartyCookiesEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          cacheEnabled
          onLoadStart={() => {
            const isFirstLoadForInstance = loadStartedInstanceKeyRef.current !== webViewInstanceKey;
            const isDefinitivelyReady =
              definitiveReadyInstanceKeyRef.current === webViewInstanceKey;
            debugLog('[MapRenderer] WebView load start', {
              key: webViewKey,
              firstLoadForInstance: isFirstLoadForInstance,
              startupSettled: startupSettledRef.current,
              definitivelyReady: isDefinitivelyReady,
              readyLatched: hasEverReachedReadyRef.current,
            });
            loadStartedInstanceKeyRef.current = webViewInstanceKey;
            if (!startupSettledRef.current && !isDefinitivelyReady && isFirstLoadForInstance) {
              if (!hasEverReachedReadyRef.current) {
                setWebReady(false);
              }
              setWebBootTimedOut(false);
              setWebBootIssue(null);
            }
            activeFailSafeInstanceKeyRef.current = webViewInstanceKey;
          }}
          onLoadEnd={() => {
            debugLog('[MapRenderer] WebView load end');
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (
              definitiveReadyInstanceKeyRef.current === webViewInstanceKey ||
              hasEverReachedReadyRef.current
            ) {
              console.warn('[MapRenderer] Ignoring WebView error after map reached ready', nativeEvent);
              return;
            }
            console.warn('[MapRenderer] WebView error', nativeEvent);
            setWebBootIssue(
              typeof nativeEvent?.description === 'string'
                ? nativeEvent.description
                : 'webview_error',
            );
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('[MapRenderer] WebView HTTP error', nativeEvent);
            if (
              definitiveReadyInstanceKeyRef.current === webViewInstanceKey ||
              hasEverReachedReadyRef.current
            ) {
              return;
            }
            setWebBootIssue(
              typeof nativeEvent?.description === 'string' && nativeEvent.description.length > 0
                ? nativeEvent.description
                : `http_${nativeEvent?.statusCode ?? 'error'}`,
            );
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
        <View style={[styles.placeholder, fallbackVisible && styles.transparentPlaceholder]}>
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

      {fallbackVisible ? (
        <MapFallbackSurface
          routeCoords={payload.routeCoords}
          progressRouteCoords={payload.progressRouteCoords}
          segments={fallbackSegments}
          markers={fallbackMarkers}
          userLocation={dynamicPayload.userLocation}
          bootIssue={webBootIssue}
          compact={isCompactSurface}
        />
      ) : null}

      {showBootOverlay && !fallbackVisible && (
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
                {webBootIssue
                  ? `Map boot status: ${webBootIssue}. Retry after checking connectivity.`
                  : 'Tactical surface is taking longer than expected to boot.'}
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
  compactContainer: {
    backgroundColor: 'transparent',
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
  transparentPlaceholder: {
    backgroundColor: 'transparent',
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
