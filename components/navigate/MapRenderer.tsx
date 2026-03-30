// Full optimized MapRenderer v2
// Performance-first WebView Mapbox renderer with incremental updates,
// offline tile bridge hooks, road classification polling, terrain toggles,
// tilt alerts, campsite markers, bailout viewport culling, and LOD trail rendering.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';

import {
  getMapStyleUrl,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
  HEALTH_COLORS,
  computeBounds,
  boundsToZoom,
  simplifyPoints,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../lib/mapConfig';
import { TACTICAL, TYPO } from '../../lib/theme';

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
  coordinates?: Array<[number, number]> | Array<{ latitude: number; longitude: number }>;
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
};

type TrailSegment = {
  id?: string | number;
  coordinates?: Array<[number, number]> | Array<{ latitude: number; longitude: number }>;
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
  coordinates?: Array<[number, number]> | Array<{ latitude: number; longitude: number }>;
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

export type MapRendererProps = {
  points?: RoutePoint[];
  waypoints?: Waypoint[];
  healthLevel?: 'green' | 'yellow' | 'red' | string;
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
  campsites?: MarkerLike[];
  tiltAlerts?: MarkerLike[];
  campsiteMarkers?: MarkerLike[];
  tiltAlertMarkers?: MarkerLike[];
  style?: any;
};

type WebMapPayload = {
  routeCoords: [number, number][];
  routeColor: string;
  bounds: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
  zoom: number;
  center: [number, number];
  segments: Array<{
    id: string;
    coordinates: [number, number][];
    color: string;
  }>;
  waypoints: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  bailouts: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    type: string;
  }>;
  pins: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    subtitle?: string;
    type?: string;
    color?: string;
  }>;
  trailSegments: Array<{
    id: string;
    coordinates: [number, number][];
    color: string;
  }>;
  speedSegments: Array<{
    id: string;
    coordinates: [number, number][];
    color: string;
  }>;
  trailStyle: string;
  trailActive: boolean;
  replayMarker: { latitude: number; longitude: number } | null;
  followReplay: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  showUserLocation: boolean;
  followUser: boolean;
  vehicleHeading: number | null;
  showCrosshair: boolean;
  interactive: boolean;
  styleUrl: string;
  campsites: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  tiltAlerts: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    type: string;
  }>;
};

const WEBVIEW_ORIGIN_WHITELIST = ['*'];

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
  input?: Array<[number, number]> | Array<{ latitude: number; longitude: number }>,
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

function toMarkerId(prefix: string, value: string | number | undefined, index: number) {
  return `${prefix}-${String(value ?? index)}`;
}

function buildWebPayload(props: MapRendererProps): WebMapPayload {
  const routeCoordsRaw = normalizePointList(props.points);
  const routeCoords =
    routeCoordsRaw.length > 600
      ? simplifyPoints(routeCoordsRaw as any, 0.00003)
      : routeCoordsRaw;

  const bounds =
    routeCoords.length > 1
      ? computeBounds(
          routeCoords.map(([longitude, latitude]) => ({ latitude, longitude })) as any,
        )
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
        : [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude];

  const zoom = bounds
    ? clamp(boundsToZoom(bounds), 3, 17)
    : isValidCoord(userLat, userLng)
      ? 14
      : DEFAULT_ZOOM;

  const campsiteInput = props.campsites?.length
    ? props.campsites
    : props.campsiteMarkers || [];

  const tiltAlertInput = props.tiltAlerts?.length
    ? props.tiltAlerts
    : props.tiltAlertMarkers || [];

  return {
    routeCoords,
    routeColor: pickRouteColor(props.healthLevel),
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
    followReplay: !!props.followReplay,
    userLocation: isValidCoord(userLat, userLng)
      ? {
          latitude: userLat as number,
          longitude: userLng as number,
        }
      : null,
    showUserLocation: !!props.showUserLocation,
    followUser: !!props.followUser,
    vehicleHeading:
      typeof props.vehicleHeading === 'number' && Number.isFinite(props.vehicleHeading)
        ? props.vehicleHeading
        : null,
    showCrosshair: !!props.showCrosshair,
    interactive: props.interactive !== false,
    styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE),
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

function makeMapHtml(token: string, initialStyleUrl: string) {
  const escapedToken = JSON.stringify(token);
  const escapedInitialStyleUrl = JSON.stringify(initialStyleUrl);

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
    .marker-camp { background: #57D98D; }
    .marker-tilt { background: #FF9F43; }
    .marker-pin { background: #6EA8FF; }
    .marker-user {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #4DA3FF;
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 0 14px rgba(77,163,255,0.8);
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
      var ECS_STYLE = 'mapbox://styles/expeditioncommand/cmn20yf1k00n101rngruce5tb';
      var TACTICAL_STYLE = 'mapbox://styles/mapbox/dark-v11';
      var hasFallenBackFromBrokenStyle = false;
      function send(type, payload) {
        try {
          if (RNW && RNW.postMessage) {
            RNW.postMessage(JSON.stringify({ type: type, payload: payload || null }));
          }
        } catch (e) {}
      }

      function sendLog(msg) {
        send('log', msg);
      }

      sendLog('HTML SCRIPT STARTED');

      if (typeof mapboxgl === 'undefined') {
        sendLog('❌ mapboxgl NOT LOADED');
        return;
      } else {
        sendLog('✅ mapboxgl loaded');
      }

      mapboxgl.accessToken = ${escapedToken};
      sendLog('TOKEN LENGTH: ' + (${escapedToken} ? ${escapedToken}.length : 0));

      var map = null;
      var initialized = false;
      var bootstrapDone = false;
      var routeFitDone = false;
      var userMarker = null;
      var replayMarker = null;
      var waypointMarkers = [];
      var bailoutMarkers = [];
      var pinMarkers = [];
      var campsiteMarkers = [];
      var tiltMarkers = [];
      var roadClassTimer = null;
      var pendingPayload = null;
      var dragTimeout = null;
      var crosshairEl = document.getElementById('crosshair');
      var currentStyleUrl = ${escapedInitialStyleUrl};

      function safeRemoveMarkers(list) {
        try {
          (list || []).forEach(function(m) {
            try { m.remove(); } catch (e) {}
          });
        } catch (e) {}
      }

      function mkMarker(className, lng, lat, clickPayload, rotation) {
        var el = document.createElement('div');
        el.className = className;

        if (typeof rotation === 'number') {
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

        return new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat]);
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

      function featureCollection(features) {
        return {
          type: 'FeatureCollection',
          features: features || []
        };
      }

      function lineFeature(id, coordinates, props) {
        return {
          type: 'Feature',
          id: id,
          properties: props || {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates || []
          }
        };
      }

      function updateRoute(coords, color) {
        var fc = featureCollection(
          coords && coords.length > 1
            ? [lineFeature('route', coords, { color: color || '#2ECC71' })]
            : []
        );
        setGeoJson('route-source', fc);
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

      function updateTrail(segments, active, trailStyle) {
        var fc = featureCollection(
          (segments || [])
            .filter(function(seg) { return seg.coordinates && seg.coordinates.length > 1; })
            .map(function(seg) {
              return lineFeature(seg.id, seg.coordinates, {
                color: seg.color || '#5FD1FF',
                active: !!active,
                trailStyle: trailStyle || 'normal'
              });
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

      function replaceWaypointMarkers(items) {
        safeRemoveMarkers(waypointMarkers);
        waypointMarkers = [];
        (items || []).forEach(function(item) {
          var marker = mkMarker(
            'marker-dot marker-waypoint',
            item.longitude,
            item.latitude,
            { kind: 'waypoint', ...item }
          );
          marker.addTo(map);
          waypointMarkers.push(marker);
        });
      }

      function replaceBailoutMarkers(items) {
        safeRemoveMarkers(bailoutMarkers);
        bailoutMarkers = [];
        (items || []).forEach(function(item) {
          var marker = mkMarker(
            'marker-dot marker-bailout',
            item.longitude,
            item.latitude,
            { kind: 'bailout', ...item }
          );
          marker.addTo(map);
          bailoutMarkers.push(marker);
        });
      }

      function replacePinMarkers(items) {
        safeRemoveMarkers(pinMarkers);
        pinMarkers = [];
        (items || []).forEach(function(item) {
          var el = document.createElement('div');
          el.className = 'marker-dot marker-pin';
          if (item.color) el.style.background = item.color;

          el.addEventListener('click', function(ev) {
            try {
              if (ev && ev.stopPropagation) ev.stopPropagation();
            } catch (e) {}
            send('pinTap', { kind: 'pin', ...item });
          });

          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);

          pinMarkers.push(marker);
        });
      }

      function replaceCampsites(items) {
        safeRemoveMarkers(campsiteMarkers);
        campsiteMarkers = [];
        (items || []).forEach(function(item) {
          var marker = mkMarker(
            'marker-dot marker-camp',
            item.longitude,
            item.latitude,
            { kind: 'campsite', ...item }
          );
          marker.addTo(map);
          campsiteMarkers.push(marker);
        });
      }

      function replaceTiltMarkers(items) {
        safeRemoveMarkers(tiltMarkers);
        tiltMarkers = [];
        (items || []).forEach(function(item) {
          var marker = mkMarker(
            'marker-dot marker-tilt',
            item.longitude,
            item.latitude,
            { kind: 'tiltAlert', ...item }
          );
          marker.addTo(map);
          tiltMarkers.push(marker);
        });
      }

      function setUserLocation(loc, show, follow, heading) {
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
            if (el && typeof heading === 'number') {
              el.style.transform = 'rotate(' + heading + 'deg)';
              el.style.transformOrigin = 'center center';
            }
          } catch (e) {}
        }

        if (follow) {
          map.easeTo({
            center: [loc.longitude, loc.latitude],
            duration: 500,
            essential: true
          });
        }
      }

      function setReplayMarker(loc, follow) {
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

        if (follow) {
          map.easeTo({
            center: [loc.longitude, loc.latitude],
            duration: 450,
            essential: true
          });
        }
      }

      function fitToBoundsOnce(payload) {
        if (!payload || routeFitDone) return;

        if (payload.bounds) {
          map.fitBounds(
            [
              [payload.bounds.minLng, payload.bounds.minLat],
              [payload.bounds.maxLng, payload.bounds.maxLat]
            ],
            { padding: 48, duration: 0, maxZoom: 15 }
          );
          routeFitDone = true;
          return;
        }

        if (payload.center) {
          map.jumpTo({ center: payload.center, zoom: payload.zoom || 12 });
          routeFitDone = true;
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
        try {
          var style = map.getStyle && map.getStyle();
          var layerIds = ((style && style.layers) || [])
            .map(function(layer) { return layer.id; })
            .filter(function(id) {
              return typeof id === 'string' && id.toLowerCase().indexOf('road') !== -1;
            });

          if (!layerIds.length) {
            send('roadClassification', {
              classification: 'unknown',
              source: 'no-road-layers-in-style'
            });
            return;
          }

          var center = map.getCenter();
          var p = map.project(center);
          var features = map.queryRenderedFeatures([p.x, p.y], {
            layers: layerIds
          });

          var classification = 'unknown';
          if (features && features.length) {
            var props = features[0].properties || {};
            classification =
              props.class ||
              props.type ||
              props.structure ||
              props.name ||
              'road';
          }

          send('roadClassification', {
            classification: classification,
            source: 'mapbox-rendered-center-sample'
          });
        } catch (e) {
          sendLog('road classification skipped: ' + String(e && e.message ? e.message : e));
        }
      }

      function reinitializeStyleArtifacts() {
        ensureSource('route-source', {
          type: 'geojson',
          data: featureCollection([])
        });
        ensureSource('segment-source', {
          type: 'geojson',
          data: featureCollection([])
        });
        ensureSource('trail-source', {
          type: 'geojson',
          data: featureCollection([])
        });
        ensureSource('speed-source', {
          type: 'geojson',
          data: featureCollection([])
        });

        ensureLineLayer('route-layer', 'route-source', ['get', 'color'], 5, 0.95);
        ensureLineLayer('segment-layer', 'segment-source', ['get', 'color'], 4, 0.92);
        ensureLineLayer('trail-layer', 'trail-source', ['get', 'color'], 3.5, 0.9);
        ensureLineLayer('speed-layer', 'speed-source', ['get', 'color'], 2.25, 0.85, [1, 1]);
      }

      function applyStyleIfNeeded(styleUrl) {
        if (!map || !styleUrl || styleUrl === currentStyleUrl) return;
        sendLog('Style change detected; React will remount WebView for clean reload');
        currentStyleUrl = styleUrl;
      }

      function applyPayload(payload) {
        if (!map || !payload) return;

        applyStyleIfNeeded(payload.styleUrl);

        if (!map.isStyleLoaded()) {
          return;
        }

        reinitializeStyleArtifacts();

        updateRoute(payload.routeCoords || [], payload.routeColor);
        updateSegments(payload.segments || []);
        updateTrail(payload.trailSegments || [], payload.trailActive, payload.trailStyle);
        updateSpeedTrail(payload.speedSegments || []);
        replaceWaypointMarkers(payload.waypoints || []);
        replaceBailoutMarkers(payload.bailouts || []);
        replacePinMarkers(payload.pins || []);
        replaceCampsites(payload.campsites || []);
        replaceTiltMarkers(payload.tiltAlerts || []);
        setUserLocation(
          payload.userLocation || null,
          !!payload.showUserLocation,
          !!payload.followUser,
          payload.vehicleHeading
        );
        setReplayMarker(payload.replayMarker || null, !!payload.followReplay);

        if (crosshairEl) {
          crosshairEl.style.opacity = payload.showCrosshair ? '1' : '0';
        }

        if (!bootstrapDone) {
          fitToBoundsOnce(payload);
          bootstrapDone = true;
        }
      }

      function init() {
        if (initialized) return;
        initialized = true;

        sendLog('Creating map...');

        try {
          map = new mapboxgl.Map({
            container: 'map',
            style: ${escapedInitialStyleUrl},
            center: [-121.0, 38.5],
            zoom: 7,
            attributionControl: false,
            dragRotate: false,
            touchZoomRotate: true,
            doubleClickZoom: true
          });

          sendLog('✅ Map object created');
        } catch (err) {
          sendLog('❌ Map constructor failed: ' + String(err && err.message ? err.message : err));
          return;
        }

        currentStyleUrl = ${escapedInitialStyleUrl};

        map.on('load', function() {
          sendLog('✅ map load event fired');
          reinitializeStyleArtifacts();

          if (pendingPayload) {
            applyPayload(pendingPayload);
          }

          send('mapReady', { ok: true });
          sendLog('✅ mapReady sent');
          reportRoadClass();
        });

map.on('style.load', function() {
  sendLog('✅ style.load fired');
  reinitializeStyleArtifacts();
  if (pendingPayload) {
    applyPayload(pendingPayload);
  }
});

        map.on('error', function(e) {
  try {
    var msg =
      e && e.error && e.error.message
        ? e.error.message
        : JSON.stringify(e);

    sendLog('❌ map error: ' + msg);

    var looksLikeBrokenStyle =
      typeof msg === 'string' &&
      (
        msg.indexOf('Bare objects invalid') !== -1 ||
        msg.indexOf('Secondary image variant is not a string') !== -1
      );

    if (
  looksLikeBrokenStyle &&
  currentStyleUrl === ECS_STYLE &&
  !hasFallenBackFromBrokenStyle
) {
  hasFallenBackFromBrokenStyle = true;
  sendLog('⚠️ ECS style is broken, falling back to Tactical');
  currentStyleUrl = TACTICAL_STYLE;
  map.setStyle(TACTICAL_STYLE);
}
  } catch (err) {
    sendLog('❌ map error (unserializable)');
  }
});

        map.on('dragstart', function() {
          send('userDrag', { ok: true });
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

export default function MapRenderer({
  points = [],
  waypoints = [],
  healthLevel = 'green',
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
  campsites = [],
  tiltAlerts = [],
  campsiteMarkers = [],
  tiltAlertMarkers = [],
  style,
}: MapRendererProps) {
  const webViewRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const bootstrapSentRef = useRef(false);
  const lastPayloadHashRef = useRef('');
  const htmlRef = useRef<string>('');
  const hasHandledInitialCenterTriggerRef = useRef(false);
  const hasHandledInitialBoundsTriggerRef = useRef(false);

  const shouldLoadMap = !!hasToken && !isLoading && !!mapboxToken;

  const initialStyleUrl = useMemo(
    () => getMapStyleUrl(mapStyle || DEFAULT_MAP_STYLE),
    [mapStyle],
  );

  const webViewKey = useMemo(
    () => `map-${mapStyle || DEFAULT_MAP_STYLE}-${mapboxToken ? 'ready' : 'empty'}`,
    [mapStyle, mapboxToken],
  );

  const payload = useMemo<WebMapPayload>(
    () =>
      buildWebPayload({
        points,
        waypoints,
        healthLevel,
        mapStyle,
        mapboxToken,
        showUserLocation,
        followUser,
        userLocation,
        interactive,
        segments,
        bailoutMarkers,
        pinMarkers,
        showCrosshair,
        trailSegments,
        trailActive,
        replayMarker,
        followReplay,
        speedSegments,
        trailStyle,
        vehicleHeading,
        campsites,
        tiltAlerts,
        campsiteMarkers,
        tiltAlertMarkers,
      }),
    [
      points,
      waypoints,
      healthLevel,
      mapStyle,
      mapboxToken,
      showUserLocation,
      followUser,
      userLocation,
      interactive,
      segments,
      bailoutMarkers,
      pinMarkers,
      showCrosshair,
      trailSegments,
      trailActive,
      replayMarker,
      followReplay,
      speedSegments,
      trailStyle,
      vehicleHeading,
      campsites,
      tiltAlerts,
      campsiteMarkers,
      tiltAlertMarkers,
    ],
  );

  const payloadHash = useMemo(() => stableStringify(payload), [payload]);

  useEffect(() => {
    if (shouldLoadMap) {
      htmlRef.current = makeMapHtml(mapboxToken, initialStyleUrl);
    } else {
      htmlRef.current = '';
    }
  }, [shouldLoadMap, mapboxToken, initialStyleUrl]);

  useEffect(() => {
    setWebReady(false);
    bootstrapSentRef.current = false;
    lastPayloadHashRef.current = '';
    hasHandledInitialCenterTriggerRef.current = false;
    hasHandledInitialBoundsTriggerRef.current = false;
  }, [initialStyleUrl]);

  useEffect(() => {
    if (!shouldLoadMap) {
      setWebReady(false);
      bootstrapSentRef.current = false;
      lastPayloadHashRef.current = '';
      hasHandledInitialCenterTriggerRef.current = false;
      hasHandledInitialBoundsTriggerRef.current = false;
    }
  }, [shouldLoadMap]);

  const postToMap = useCallback((message: unknown) => {
    const json = JSON.stringify(message);
    const escaped = json.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', { data: \`${escaped}\` }));
      true;
    `);
  }, []);

  useEffect(() => {
    if (!shouldLoadMap || !webReady) return;

    const type = bootstrapSentRef.current ? 'update' : 'bootstrap';
    if (type === 'update' && payloadHash === lastPayloadHashRef.current) return;

    postToMap({ type, payload });
    bootstrapSentRef.current = true;
    lastPayloadHashRef.current = payloadHash;
  }, [shouldLoadMap, webReady, payload, payloadHash, postToMap]);

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

  const handleMessage = useCallback(
    (event: any) => {
      let message: any;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      const { type, payload } = message || {};

      switch (type) {
        case 'log':
          console.log('[WEBVIEW]', payload);
          return;

        case 'mapReady':
          setWebReady(true);
          return;

        case 'longPress':
          if (payload && onLongPress) {
            onLongPress({
              latitude: payload.latitude,
              longitude: payload.longitude,
            });
          }
          return;

        case 'mapTap':
          if (
            payload &&
            typeof payload.latitude === 'number' &&
            typeof payload.longitude === 'number'
          ) {
            onMapTap?.({
              latitude: payload.latitude,
              longitude: payload.longitude,
            });
          }
          return;

        case 'pinTap':
          if (payload?.kind === 'tiltAlert') {
            onTiltAlertTap?.(payload);
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

        default:
          return;
      }
    },
    [
      onLongPress,
      onMapTap,
      onPinTap,
      onMapCenterReply,
      onMapBoundsReply,
      onTiltAlertTap,
      onUserDrag,
      onRoadClassification,
    ],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      {shouldLoadMap ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ html: htmlRef.current || makeMapHtml(mapboxToken, initialStyleUrl) }}
          originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowingReadAccessToURL="*"
          mixedContentMode="always"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
          cacheEnabled
          incognito={false}
          style={styles.webview}
          onLoadStart={() => {
            console.log('[MapRenderer] WebView onLoadStart');
          }}
          onLoad={() => {
            console.log('[MapRenderer] WebView onLoad');
          }}
          onLoadEnd={() => {
            console.log('[MapRenderer] WebView onLoadEnd');
          }}
          onError={(e) => {
            console.log('[MapRenderer] WebView onError', e.nativeEvent);
          }}
          onHttpError={(e) => {
            console.log('[MapRenderer] WebView onHttpError', e.nativeEvent);
          }}
          renderError={(name) => {
            console.log('[MapRenderer] WebView renderError', name);
            return null;
          }}
          {...(Platform.OS === 'android'
            ? {
                setSupportMultipleWindows: false,
              }
            : {})}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Map unavailable</Text>
          <Text style={styles.placeholderText}>
            {!hasToken || !mapboxToken
              ? 'Map token not ready.'
              : 'Map is still loading.'}
          </Text>
        </View>
      )}

      {(!hasToken || isLoading || !mapboxToken) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={TACTICAL?.accent || '#FFD700'} />
          <Text style={styles.loadingTitle}>
            {!hasToken || !mapboxToken ? 'Fetching map token…' : 'Loading map…'}
          </Text>
          <Text style={styles.loadingSubtitle}>
            Persistent renderer stays mounted while services initialize.
          </Text>

          {!!onRetry && !isLoading && (
            <TouchableOpacity style={styles.retryButton} onPress={() => void onRetry()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {shouldLoadMap && !webReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={TACTICAL?.accent || '#FFD700'} />
          <Text style={styles.loadingTitle}>Initializing tactical surface…</Text>
          <Text style={styles.loadingSubtitle}>
            {containerSize.width > 0 && containerSize.height > 0
              ? `${Math.round(containerSize.width)} × ${Math.round(containerSize.height)}`
              : 'Preparing WebView map renderer'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D12',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0A0D12',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0A0D12',
  },
  placeholderTitle: {
    color: '#F3F6FA',
    fontSize: 16,
    fontFamily: TYPO?.semiBold || undefined,
    marginBottom: 8,
  },
  placeholderText: {
    color: 'rgba(243,246,250,0.72)',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: TYPO?.body || undefined,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,13,18,0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingTitle: {
    marginTop: 14,
    color: '#F3F6FA',
    fontSize: 16,
    fontFamily: TYPO?.semiBold || undefined,
  },
  loadingSubtitle: {
    marginTop: 6,
    color: 'rgba(243,246,250,0.72)',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: TYPO?.body || undefined,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: TACTICAL?.accent || '#FFD700',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#111',
    fontSize: 13,
    fontFamily: TYPO?.semiBold || undefined,
  },
});