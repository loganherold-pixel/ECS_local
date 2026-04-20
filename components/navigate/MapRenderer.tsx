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
import { TACTICAL } from '../../lib/theme';
import type { CampIntelMarkerPayload, CampIntelTone } from '../../lib/campIntel/campIntelTypes';

const WEBVIEW_ORIGIN_WHITELIST = ['*'];
const WEBVIEW_FAILSAFE_TIMEOUT_MS = 15000;
const WEBVIEW_PROGRESS_FAILSAFE_TIMEOUT_MS = 20000;
const WEBVIEW_AUTO_RECOVERY_LIMIT = 1;
const CAMERA_EPSILON = 0.00005;
const DEBUG_MAP_RENDERER = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
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
  selected?: boolean;
  badges?: { label: string; tone: CampIntelTone }[];
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
  tiltAlertMarkers?: MarkerLike[];
  cameraMode?: CameraMode;
  cameraCommand?: CameraCommand | null;
  cameraCommandTrigger?: number;
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
    selected?: boolean;
    badges?: { label: string; tone: CampIntelTone }[];
  }[];
  tiltAlerts: {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    type: string;
  }[];
};

type WebMapDynamicPayload = {
  replayMarker: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number } | null;
  showUserLocation: boolean;
  vehicleHeading: number | null;
  cameraMode: CameraMode | null;
};

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
  return out;
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

  return out;
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

function debugLog(...args: unknown[]) {
  if (DEBUG_MAP_RENDERER) {
    console.log(...args);
  }
}

function toMarkerId(prefix: string, value: string | number | undefined, index: number) {
  return `${prefix}-${String(value ?? index)}`;
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

function buildWebPayload(props: MapRendererProps): WebMapPayload {
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

  const campsiteInput = props.campIntelMarkers?.length
    ? props.campIntelMarkers
    : props.campsites?.length
      ? props.campsites
      : props.campsiteMarkers || [];

  const tiltAlertInput = props.tiltAlerts?.length
    ? props.tiltAlerts
    : props.tiltAlertMarkers || [];

  return {
    routeCoords,
    progressRouteCoords,
    routeColor: props.routeColor || pickRouteColor(props.healthLevel),
    progressColor: props.progressColor || '#F2C24D',
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
    })),
    waypoints: (props.waypoints || [])
      .filter((w) => isValidCoord(w.latitude, w.longitude))
      .map((w, index) => ({
        id: toMarkerId('wp', w.id, index),
        latitude: w.latitude,
        longitude: w.longitude,
        title: w.title || w.name || `Waypoint ${index + 1}`,
      })),
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
    showUserLocation: !!props.showUserLocation,
    vehicleHeading:
      typeof props.vehicleHeading === 'number' && Number.isFinite(props.vehicleHeading)
        ? props.vehicleHeading
        : null,
    showCrosshair: !!props.showCrosshair,
    interactive: props.interactive !== false,
    styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE),
    cameraMode: props.cameraMode ?? null,
    campsites: campsiteInput
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
          id: toMarkerId('camp', m.id, index),
          latitude: lat,
          longitude: lng,
          title: m.title || `Campsite ${index + 1}`,
          subtitle: typeof (m as any).subtitle === 'string' ? (m as any).subtitle : undefined,
          category: typeof (m as any).category === 'string' ? (m as any).category : undefined,
          confidence: typeof (m as any).confidence === 'string' ? (m as any).confidence : undefined,
          confidenceScore:
            typeof (m as any).confidenceScore === 'number' && Number.isFinite((m as any).confidenceScore)
              ? Number((m as any).confidenceScore)
              : undefined,
          selected: !!(m as any).selected,
          badges: Array.isArray((m as any).badges)
            ? (m as any).badges
                .filter((badge: any) => badge && typeof badge.label === 'string')
                .slice(0, 2)
                .map((badge: any) => ({
                  label: String(badge.label),
                  tone:
                    typeof badge.tone === 'string'
                      ? badge.tone
                      : 'neutral',
                }))
            : [],
        };
      }),
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
  };
}

function buildDynamicPayload(props: Pick<
  MapRendererProps,
  'replayMarker' | 'userLocation' | 'showUserLocation' | 'vehicleHeading' | 'cameraMode'
>): WebMapDynamicPayload {
  const replay = normalizeLatLng(props.replayMarker as LatLng | null);
  const user = normalizeLatLng(props.userLocation ?? null);

  return {
    replayMarker: replay,
    userLocation: user,
    showUserLocation: !!props.showUserLocation,
    vehicleHeading:
      typeof props.vehicleHeading === 'number' && Number.isFinite(props.vehicleHeading)
        ? props.vehicleHeading
        : null,
    cameraMode: props.cameraMode ?? null,
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
      transform: scale(1.08);
      border-color: rgba(255, 248, 220, 0.95);
      box-shadow:
        0 0 0 2px rgba(8, 11, 14, 0.78) inset,
        0 0 14px rgba(255, 215, 107, 0.4);
    }
    .camp-intel-conf-high .camp-intel-ring { border-color: rgba(102, 187, 106, 0.78); }
    .camp-intel-conf-medium .camp-intel-ring { border-color: rgba(255, 179, 0, 0.82); }
    .camp-intel-conf-low .camp-intel-ring { border-color: rgba(239, 83, 80, 0.82); }
    .camp-intel-cat-suggested .camp-intel-core { background: #65C97A; }
    .camp-intel-cat-backup .camp-intel-core { background: #D4A017; }
    .camp-intel-cat-emergency .camp-intel-core { background: #FF8A50; }
    .camp-intel-cat-saved .camp-intel-core { background: #5EA1FF; color: #0B1116; }
    .camp-intel-cat-previously_used .camp-intel-core { background: #9EC2B1; color: #0B1116; }
    .camp-intel-cat-caution .camp-intel-core { background: #C86E68; }
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
      min-width: 18px;
      height: 12px;
      padding: 0 3px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(8, 11, 14, 0.94);
      color: #F5F7F8;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.2px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
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

      function nearlyEqual(a, b) {
        if (typeof a !== 'number' || typeof b !== 'number') return false;
        return Math.abs(a - b) <= ${CAMERA_EPSILON};
      }

      function sameCenter(a, b) {
        if (!a || !b) return false;
        return nearlyEqual(a.latitude, b.latitude) && nearlyEqual(a.longitude, b.longitude);
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
      var tiltMarkers = [];
      var userMarker = null;
      var replayMarker = null;
      var roadClassTimer = null;
      var dragTimeout = null;
      var crosshairEl = document.getElementById('crosshair');

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
        }
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

      function setGeoJson(sourceId, data) {
        var src = map.getSource(sourceId);
        if (src && src.setData) src.setData(data);
      }

      function reinitializeStyleArtifacts() {
        ensureSource('route-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('route-progress-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('segment-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('trail-source', { type: 'geojson', data: featureCollection([]) });
        ensureSource('speed-source', { type: 'geojson', data: featureCollection([]) });

        ensureLineLayer('route-layer', 'route-source', ['get', 'color'], 5, 0.95);
        ensureLineLayer('route-progress-layer', 'route-progress-source', ['get', 'color'], 6, 0.98);
        ensureLineLayer('segment-layer', 'segment-source', ['get', 'color'], 4, 0.92);
        ensureLineLayer('trail-layer', 'trail-source', ['get', 'color'], 3.5, 0.9);
        ensureLineLayer('speed-layer', 'speed-source', ['get', 'color'], 2.25, 0.85, [1, 1]);
      }

      function updateRoute(coords, color) {
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
              return lineFeature(seg.id, seg.coordinates, { color: seg.color || '#2ECC71' });
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
          case 'previously_used':
            return 'U';
          case 'caution':
            return '!';
          case 'backup':
          default:
            return 'B';
        }
      }

      function createCampIntelMarkerElement(item) {
        var root = document.createElement('div');
        root.className =
          'camp-intel-marker ' +
          getCampCategoryClass(item.category) + ' ' +
          getCampConfidenceClass(item.confidence) +
          (item.selected ? ' camp-intel-selected' : '');

        var ring = document.createElement('div');
        ring.className = 'camp-intel-ring';

        var core = document.createElement('div');
        core.className = 'camp-intel-core';
        core.textContent = campGlyph(item.category);

        root.appendChild(ring);
        root.appendChild(core);

        if (Array.isArray(item.badges) && item.badges.length > 0) {
          var badgeWrap = document.createElement('div');
          badgeWrap.className = 'camp-intel-badges';
          item.badges.slice(0, 2).forEach(function(badge) {
            var badgeEl = document.createElement('div');
            var tone = typeof badge.tone === 'string' ? badge.tone : 'neutral';
            badgeEl.className = 'camp-intel-badge camp-intel-badge-' + tone;
            badgeEl.textContent = String(badge.label || '').slice(0, 4);
            badgeWrap.appendChild(badgeEl);
          });
          root.appendChild(badgeWrap);
        }

        return root;
      }

      function replaceCampIntelMarkers(list, items) {
        safeRemoveMarkers(list);
        list.length = 0;

        (items || []).forEach(function(item) {
          var el = createCampIntelMarkerElement(item);
          el.addEventListener('click', function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', Object.assign({ kind: 'campIntel' }, item));
          });

          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);

          list.push(marker);
        });
      }

      function setUserLocation(loc, show, heading) {
        if (!show || !loc) {
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

            if (sameAsCurrent && sameZoom) return;

            var cameraOptions = { center: nextCenter, essential: true };
            if (typeof normalized.zoom === 'number') {
              cameraOptions.zoom = normalized.zoom;
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
            if (Math.abs(map.getZoom() - normalized.zoom) <= 0.01) return;
            if (normalized.animate === false) {
              map.jumpTo({ zoom: normalized.zoom, essential: true });
            } else {
              map.easeTo({ zoom: normalized.zoom, duration: normalized.durationMs, essential: true });
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
        updateRoute(payload.routeCoords || [], payload.routeColor);
        updateRouteProgress(payload.progressRouteCoords || [], payload.progressColor);
        updateSegments(payload.segments || []);
        updateTrail(payload.trailSegments || []);
        updateSpeedTrail(payload.speedSegments || []);

        replaceMarkers(waypointMarkers, payload.waypoints || [], 'marker-dot marker-waypoint', 'waypoint');
        replaceMarkers(bailoutMarkers, payload.bailouts || [], 'marker-dot marker-bailout', 'bailout');
        replaceCampIntelMarkers(campsiteMarkers, payload.campsites || []);
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

        map.on('dragstart', function() {
          activeCameraMode = 'free_pan';
          send('userDrag', { ok: true, mode: activeCameraMode });
        });

        map.on('moveend', function() {
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
          send('mapTap', {
            latitude: e.lngLat.lat,
            longitude: e.lngLat.lng
          });
        });

        map.on('idle', function() {
          if (roadClassTimer) clearTimeout(roadClassTimer);
          roadClassTimer = setTimeout(reportRoadClass, 120);
        });
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
  tiltAlertMarkers = [],
  cameraMode,
  cameraCommand = null,
  cameraCommandTrigger,
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
        tiltAlertMarkers,
      }),
    [
      points,
      progressPoints,
      waypoints,
      healthLevel,
      routeColor,
      progressColor,
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
      tiltAlertMarkers,
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
      }),
    [replayMarker, userLocation, showUserLocation, vehicleHeading, cameraMode],
  );

  const payloadHash = useMemo(() => stableStringify(payload), [payload]);
  const dynamicPayloadHash = useMemo(() => stableStringify(dynamicPayload), [dynamicPayload]);

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
    if (!cameraCommand) return;

    const commandHash = buildCameraCommandHash(cameraCommand, cameraCommandTrigger);
    if (!commandHash || commandHash === lastCameraCommandHashRef.current) return;

    postToMap({ type: 'cameraCommand', payload: cameraCommand });
    lastCameraCommandHashRef.current = commandHash;
  }, [shouldLoadMap, webReady, cameraCommand, cameraCommandTrigger, postToMap]);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;
    if (cameraCommand) return;

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

      case 'pinTap':
        if (payload?.kind === 'tiltAlert') {
          onTiltAlertTap?.(payload);
          return;
        }
        if (payload?.kind === 'campIntel') {
          onCampIntelTap?.(payload);
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
    onPinTap,
    onMapCenterReply,
    onMapBoundsReply,
    onTiltAlertTap,
    onCampIntelTap,
    onUserDrag,
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
