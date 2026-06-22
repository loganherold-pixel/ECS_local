import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { getMapStyleUrl, getMapboxToken, getMapboxTokenSync } from '../../lib/mapConfig';
import type {
  ExpeditionRecap,
  ExpeditionRecapNotableMoment,
  ExpeditionTripBounds,
  ExpeditionTripCoordinate,
} from '../../lib/expedition';

type ProjectedPoint = {
  x: number;
  y: number;
  coordinate: ExpeditionTripCoordinate;
};

type RecapMapModel = {
  projectedRoute: ProjectedPoint[];
  bounds: ExpeditionTripBounds;
  start: ProjectedPoint | null;
  finish: ProjectedPoint | null;
  callouts: RecapMapCallout[];
};

type RecapMapMode = 'compact' | 'expanded';

type RecapMapPayload = {
  routeCoords: [number, number][];
  startCoord: [number, number] | null;
  finishCoord: [number, number] | null;
  bounds: [[number, number], [number, number]];
  features: {
    type: 'Feature';
    properties: {
      id: string;
      title: string;
      description: string;
      category: CalloutCategory;
      elapsedLabel: string | null;
    };
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
  }[];
};

type ExpeditionRecapMapProps = {
  routeGeometry: ExpeditionTripCoordinate[];
  routeBounds: ExpeditionTripBounds | null;
  startCoordinate: ExpeditionTripCoordinate | null;
  endCoordinate: ExpeditionTripCoordinate | null;
  recap: ExpeditionRecap | null;
  tripStartedAt?: string | null;
};

type CalloutCategory =
  | 'elevation'
  | 'weather'
  | 'route'
  | 'terrain'
  | 'recovery'
  | 'badge'
  | 'milestone';

type RecapMapCallout = {
  id: string;
  title: string;
  description: string;
  elapsedLabel: string | null;
  category: CalloutCategory;
  routePoint: ProjectedPoint;
  x: number;
  y: number;
};

const MAP_HEIGHT = 220;
const MAP_PADDING = 18;
const MAX_CALLOUTS = 5;
const MIN_CALLOUTS = 3;
const CALLOUT_WIDTH = 124;
const CALLOUT_HEIGHT = 54;
const CALLOUT_MARGIN = 8;
const RECAP_MAPBOX_GL_JS_VERSION = 'v2.15.0';
const RECAP_TERRAIN_SOURCE_ID = 'ecs-recap-map-terrain-dem';
const RECAP_MAP_3D_PITCH = 58;
const RECAP_MAP_MAX_ZOOM = 14.2;

function isValidCoordinate(point: ExpeditionTripCoordinate | null | undefined): point is ExpeditionTripCoordinate {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function computeBounds(points: ExpeditionTripCoordinate[]): ExpeditionTripBounds | null {
  const valid = points.filter(isValidCoordinate);
  if (valid.length === 0) return null;
  return valid.reduce<ExpeditionTripBounds>(
    (bounds, point) => ({
      north: Math.max(bounds.north, point.lat),
      south: Math.min(bounds.south, point.lat),
      east: Math.max(bounds.east, point.lng),
      west: Math.min(bounds.west, point.lng),
    }),
    { north: valid[0].lat, south: valid[0].lat, east: valid[0].lng, west: valid[0].lng },
  );
}

function normalizeBounds(
  routeBounds: ExpeditionTripBounds | null,
  routeGeometry: ExpeditionTripCoordinate[],
): ExpeditionTripBounds | null {
  const fallback = computeBounds(routeGeometry);
  const source = routeBounds ?? fallback;
  if (!source) return null;

  const latSpan = Math.max(source.north - source.south, 0.002);
  const lngSpan = Math.max(source.east - source.west, 0.002);
  const latPad = Math.max(latSpan * 0.14, 0.001);
  const lngPad = Math.max(lngSpan * 0.14, 0.001);

  return {
    north: source.north + latPad,
    south: source.south - latPad,
    east: source.east + lngPad,
    west: source.west - lngPad,
  };
}

function downsample<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  const result: T[] = [items[0]];
  const step = (items.length - 1) / (maxItems - 1);
  for (let index = 1; index < maxItems - 1; index += 1) {
    result.push(items[Math.round(index * step)]);
  }
  result.push(items[items.length - 1]);
  return result;
}

function escapeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatElapsed(startedAt: string | null | undefined, capturedAt: string | null | undefined): string | null {
  const startedMs = timestampMs(startedAt);
  const capturedMs = timestampMs(capturedAt);
  if (startedMs == null || capturedMs == null || capturedMs < startedMs) return null;
  const seconds = Math.round((capturedMs - startedMs) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `T+${minutes}m`;
  if (minutes <= 0) return `T+${hours}h`;
  return `T+${hours}h ${minutes}m`;
}

function calloutCategoryForMoment(type: ExpeditionRecapNotableMoment['type'] | string): CalloutCategory {
  if (type === 'highest_elevation') return 'elevation';
  if (type === 'weather_change') return 'weather';
  if (type === 'route_deviation' || type === 'reroute_accepted') return 'route';
  if (type === 'terrain_risk_warning') return 'terrain';
  if (type === 'recovery_tools_opened') return 'recovery';
  if (type === 'badge_unlocked') return 'badge';
  return 'milestone';
}

function calloutScore(moment: ExpeditionRecapNotableMoment): number {
  const typeScore: Record<string, number> = {
    terrain_risk_warning: 96,
    recovery_tools_opened: 94,
    route_deviation: 90,
    reroute_accepted: 88,
    weather_change: 84,
    highest_elevation: 82,
    badge_unlocked: 78,
    guidance_completed: 54,
    manual_note: 42,
  };
  const detailBoost = moment.detail ? 3 : 0;
  return (typeScore[moment.type] ?? 40) + detailBoost;
}

function descriptionForCallout(moment: ExpeditionRecapNotableMoment): string {
  const detail = moment.detail?.trim();
  if (!detail) {
    if (moment.type === 'highest_elevation') return 'Highest recorded point.';
    if (moment.type === 'weather_change') return 'Condition change logged.';
    if (moment.type === 'route_deviation') return 'Route deviation logged.';
    if (moment.type === 'reroute_accepted') return 'Reroute event logged.';
    if (moment.type === 'terrain_risk_warning') return 'Terrain risk logged.';
    if (moment.type === 'recovery_tools_opened') return 'Recovery tools opened.';
    if (moment.type === 'badge_unlocked') return 'Badge unlock recorded.';
    return 'Trip event recorded.';
  }
  if (detail.length <= 58) return detail;
  return `${detail.slice(0, 55).trim()}...`;
}

function iconForCalloutCategory(category: CalloutCategory): React.ComponentProps<typeof Ionicons>['name'] {
  switch (category) {
    case 'elevation':
      return 'trending-up-outline';
    case 'weather':
      return 'partly-sunny-outline';
    case 'route':
      return 'git-branch-outline';
    case 'terrain':
      return 'warning-outline';
    case 'recovery':
      return 'construct-outline';
    case 'badge':
      return 'ribbon-outline';
    default:
      return 'flag-outline';
  }
}

function nearestRoutePoint(projectedRoute: ProjectedPoint[], point: ProjectedPoint): ProjectedPoint {
  return projectedRoute.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.x - point.x) ** 2 + (nearest.y - point.y) ** 2;
    const candidateDistance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, projectedRoute[0]);
}

function rectsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width + CALLOUT_MARGIN < right.x ||
    right.x + right.width + CALLOUT_MARGIN < left.x ||
    left.y + left.height + CALLOUT_MARGIN < right.y ||
    right.y + right.height + CALLOUT_MARGIN < left.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildCallouts(
  recap: ExpeditionRecap | null,
  project: (coordinate: ExpeditionTripCoordinate) => ProjectedPoint,
  projectedRoute: ProjectedPoint[],
  width: number,
  tripStartedAt?: string | null,
): RecapMapCallout[] {
  if (!recap || width < 300 || projectedRoute.length < 2) return [];
  const candidates = (recap.expeditionEvents.notableMoments ?? [])
    .filter((moment) => isValidCoordinate(moment.coordinate))
    .map((moment) => ({
      moment,
      score: calloutScore(moment),
      projectedMoment: project(moment.coordinate as ExpeditionTripCoordinate),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.moment.id.localeCompare(right.moment.id);
    })
    .slice(0, MAX_CALLOUTS + 3);

  if (candidates.length === 0) return [];

  const placedRects: { x: number; y: number; width: number; height: number }[] = [];
  const placed: RecapMapCallout[] = [];
  const maxX = width - CALLOUT_WIDTH - CALLOUT_MARGIN;
  const maxY = MAP_HEIGHT - CALLOUT_HEIGHT - CALLOUT_MARGIN;
  const yOffsets = [-64, 28, -34, 52, -88, 8];

  for (const candidate of candidates) {
    const routePoint = nearestRoutePoint(projectedRoute, candidate.projectedMoment);
    const prefersRight = routePoint.x < width / 2;
    const xOptions = prefersRight
      ? [
          clamp(routePoint.x + 30, CALLOUT_MARGIN, maxX),
          clamp(routePoint.x - CALLOUT_WIDTH - 30, CALLOUT_MARGIN, maxX),
        ]
      : [
          clamp(routePoint.x - CALLOUT_WIDTH - 30, CALLOUT_MARGIN, maxX),
          clamp(routePoint.x + 30, CALLOUT_MARGIN, maxX),
        ];

    let placement: { x: number; y: number; width: number; height: number } | null = null;
    for (const x of xOptions) {
      for (const offset of yOffsets) {
        const rect = {
          x,
          y: clamp(routePoint.y + offset, CALLOUT_MARGIN, maxY),
          width: CALLOUT_WIDTH,
          height: CALLOUT_HEIGHT,
        };
        if (!placedRects.some((existing) => rectsOverlap(existing, rect))) {
          placement = rect;
          break;
        }
      }
      if (placement) break;
    }

    if (!placement) continue;
    placedRects.push(placement);
    placed.push({
      id: candidate.moment.id,
      title: candidate.moment.title.trim().slice(0, 34) || 'Trip moment',
      description: descriptionForCallout(candidate.moment),
      elapsedLabel: formatElapsed(tripStartedAt, candidate.moment.capturedAt),
      category: calloutCategoryForMoment(candidate.moment.type),
      routePoint,
      x: placement.x,
      y: placement.y,
    });
    if (placed.length >= MAX_CALLOUTS) break;
  }

  if (candidates.length >= MIN_CALLOUTS && placed.length < MIN_CALLOUTS) return [];
  return placed;
}

function buildRecapMapModel(
  routeGeometry: ExpeditionTripCoordinate[],
  routeBounds: ExpeditionTripBounds | null,
  startCoordinate: ExpeditionTripCoordinate | null,
  endCoordinate: ExpeditionTripCoordinate | null,
  recap: ExpeditionRecap | null,
  tripStartedAt: string | null | undefined,
  width: number,
): RecapMapModel | null {
  const validRoute = routeGeometry.filter(isValidCoordinate);
  if (validRoute.length < 2 || width <= 0) return null;

  const bounds = normalizeBounds(routeBounds, validRoute);
  if (!bounds) return null;

  const mapWidth = Math.max(width - MAP_PADDING * 2, 1);
  const mapHeight = MAP_HEIGHT - MAP_PADDING * 2;
  const lngSpan = Math.max(bounds.east - bounds.west, 0.000001);
  const latSpan = Math.max(bounds.north - bounds.south, 0.000001);

  const project = (coordinate: ExpeditionTripCoordinate): ProjectedPoint => ({
    coordinate,
    x: MAP_PADDING + ((coordinate.lng - bounds.west) / lngSpan) * mapWidth,
    y: MAP_PADDING + (1 - (coordinate.lat - bounds.south) / latSpan) * mapHeight,
  });

  const projectedRoute = downsample(validRoute, 360).map(project);
  const start = isValidCoordinate(startCoordinate)
    ? project(startCoordinate)
    : projectedRoute[0] ?? null;
  const finish = isValidCoordinate(endCoordinate)
    ? project(endCoordinate)
    : projectedRoute[projectedRoute.length - 1] ?? null;
  const callouts = buildCallouts(recap, project, projectedRoute, width, tripStartedAt);

  return {
    projectedRoute,
    bounds,
    start,
    finish,
    callouts,
  };
}

function coordinateToLngLat(coordinate: ExpeditionTripCoordinate | null | undefined): [number, number] | null {
  return isValidCoordinate(coordinate) ? [coordinate.lng, coordinate.lat] : null;
}

function buildRecapMapPayload(
  model: RecapMapModel,
  startCoordinate: ExpeditionTripCoordinate | null,
  endCoordinate: ExpeditionTripCoordinate | null,
): RecapMapPayload {
  return {
    routeCoords: model.projectedRoute
      .map((point) => coordinateToLngLat(point.coordinate))
      .filter((coordinate): coordinate is [number, number] => coordinate != null),
    startCoord: coordinateToLngLat(startCoordinate ?? model.start?.coordinate),
    finishCoord: coordinateToLngLat(endCoordinate ?? model.finish?.coordinate),
    bounds: [
      [model.bounds.west, model.bounds.south],
      [model.bounds.east, model.bounds.north],
    ],
    features: model.callouts.map((callout) => ({
      type: 'Feature' as const,
      properties: { id: callout.id,
        title: callout.title,
        description: callout.description,
        category: callout.category,
        elapsedLabel: callout.elapsedLabel,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [callout.routePoint.coordinate.lng, callout.routePoint.coordinate.lat],
      },
    })),
  };
}

function buildRecapMapHtml(mapboxToken: string, styleUrl: string, mapMode: RecapMapMode): string {
  const token = escapeInlineJson(mapboxToken);
  const style = escapeInlineJson(styleUrl);
  const interactive = mapMode === 'expanded';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=${interactive ? 'yes' : 'no'}" />
  <link href="https://api.mapbox.com/mapbox-gl-js/${RECAP_MAPBOX_GL_JS_VERSION}/mapbox-gl.css" rel="stylesheet" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #020608; overflow: hidden; }
    .mapboxgl-ctrl-top-left, .mapboxgl-ctrl-top-right { display: none !important; }
    .mapboxgl-ctrl-bottom-right { display: ${interactive ? 'block' : 'none'} !important; }
    .mapboxgl-ctrl-logo { opacity: 0.58; transform: scale(0.72); transform-origin: bottom left; }
    .mapboxgl-popup-content {
      background: rgba(11,14,18,0.94);
      color: #F4E7C5;
      border: 1px solid rgba(242,194,77,0.38);
      border-radius: 8px;
      box-shadow: 0 10px 26px rgba(0,0,0,0.38);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 10px;
    }
    .mapboxgl-popup-tip { border-top-color: rgba(11,14,18,0.94) !important; }
    .popup-title { color: #F2C24D; font-size: 11px; font-weight: 900; margin-bottom: 4px; }
    .popup-copy { color: rgba(244,231,197,0.82); font-size: 10px; font-weight: 650; line-height: 1.35; }
    .popup-meta { color: rgba(244,231,197,0.56); font-size: 8px; font-weight: 900; margin-top: 5px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://api.mapbox.com/mapbox-gl-js/${RECAP_MAPBOX_GL_JS_VERSION}/mapbox-gl.js"></script>
  <script>
    (function() {
      var RNW = window.ReactNativeWebView;
      var map = null;
      var pendingPayload = null;
      var selectedPopup = null;
      var RECAP_TERRAIN_SOURCE_ID = '${RECAP_TERRAIN_SOURCE_ID}';
      var RECAP_MAP_3D_PITCH = ${RECAP_MAP_3D_PITCH};
      var interactive = ${interactive ? 'true' : 'false'};

      function send(type, payload) {
        try {
          if (RNW && RNW.postMessage) RNW.postMessage(JSON.stringify({ type: type, payload: payload || null }));
        } catch (e) {}
      }

      function fc(features) {
        return { type: 'FeatureCollection', features: features || [] };
      }

      function feature(id, geometry, properties) {
        return { type: 'Feature', id: id, properties: properties || {}, geometry: geometry };
      }

      function ensureSource(id, data) {
        if (!map) return;
        var existing = map.getSource(id);
        if (existing && existing.setData) {
          existing.setData(data);
          return;
        }
        map.addSource(id, { type: 'geojson', data: data });
      }

      function ensureLayer(layer) {
        if (!map || map.getLayer(layer.id)) return;
        map.addLayer(layer);
      }

      function addTerrain() {
        try {
          if (!map.getSource(RECAP_TERRAIN_SOURCE_ID)) {
            map.addSource(RECAP_TERRAIN_SOURCE_ID, {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14
            });
          }
          map.setTerrain({ source: RECAP_TERRAIN_SOURCE_ID, exaggeration: 1.2 });
          if (!map.getLayer('ecs-recap-sky')) {
            map.addLayer({
              id: 'ecs-recap-sky',
              type: 'sky',
              paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun-intensity': 5
              }
            });
          }
        } catch (e) {
          send('mapLog', { level: 'warn', message: 'terrain unavailable', detail: String(e && e.message ? e.message : e) });
        }
      }

      function fitPayload(payload, animate) {
        if (!map || !payload || !payload.bounds) return;
        var options = {
          padding: interactive ? 84 : 36,
          pitch: RECAP_MAP_3D_PITCH,
          bearing: 0,
          maxZoom: ${RECAP_MAP_MAX_ZOOM},
          duration: animate ? 650 : 0
        };
        try {
          map.fitBounds(payload.bounds, options);
        } catch (e) {}
      }

      function selectCallout(id, lngLat) {
        if (!map) return;
        var source = map.getSource('ecs-recap-callouts-selected');
        var selected = null;
        var payload = pendingPayload || {};
        var features = payload.features || [];
        for (var i = 0; i < features.length; i += 1) {
          if (features[i].properties && features[i].properties.id === id) {
            selected = features[i];
            break;
          }
        }
        if (source && source.setData) {
          source.setData(fc(selected ? [selected] : []));
        }
        if (selected && interactive) {
          if (selectedPopup) selectedPopup.remove();
          var props = selected.properties || {};
          var html =
            '<div class="popup-title">' + String(props.title || 'Trip moment') + '</div>' +
            '<div class="popup-copy">' + String(props.description || 'Trip event recorded.') + '</div>' +
            '<div class="popup-meta">' + String(props.category || 'moment') + (props.elapsedLabel ? ' · ' + props.elapsedLabel : '') + '</div>';
          selectedPopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 14 })
            .setLngLat(selected.geometry.coordinates)
            .setHTML(html)
            .addTo(map);
        }
        send('calloutSelected', { id: id });
      }

      function applyPayload(payload) {
        pendingPayload = payload;
        if (!map || !map.isStyleLoaded()) return;
        addTerrain();
        var route = feature('route', { type: 'LineString', coordinates: payload.routeCoords || [] }, {});
        var start = payload.startCoord ? feature('start', { type: 'Point', coordinates: payload.startCoord }, {}) : null;
        var finish = payload.finishCoord ? feature('finish', { type: 'Point', coordinates: payload.finishCoord }, {}) : null;

        ensureSource('ecs-recap-route', route);
        ensureSource('ecs-recap-endpoints', fc([start, finish].filter(Boolean)));
        ensureSource('ecs-recap-callouts', fc(payload.features || []));
        ensureSource('ecs-recap-callouts-selected', fc([]));

        ensureLayer({
          id: 'ecs-recap-route-glow',
          type: 'line',
          source: 'ecs-recap-route',
          paint: {
            'line-color': 'rgba(242,194,77,0.26)',
            'line-width': interactive ? 9 : 7,
            'line-blur': 5
          }
        });
        ensureLayer({
          id: 'ecs-recap-route-line',
          type: 'line',
          source: 'ecs-recap-route',
          paint: {
            'line-color': '#F2C24D',
            'line-width': interactive ? 4 : 3,
            'line-opacity': 0.92
          }
        });
        ensureLayer({
          id: 'ecs-recap-endpoints',
          type: 'circle',
          source: 'ecs-recap-endpoints',
          paint: {
            'circle-radius': interactive ? 7 : 5,
            'circle-color': '#9BC9A1',
            'circle-stroke-color': '#0B0F12',
            'circle-stroke-width': 2
          }
        });
        ensureLayer({
          id: 'ecs-recap-callouts',
          type: 'circle',
          source: 'ecs-recap-callouts',
          paint: {
            'circle-radius': interactive ? 7 : 5,
            'circle-color': '#F2C24D',
            'circle-opacity': 0.94,
            'circle-stroke-color': '#0B0F12',
            'circle-stroke-width': 2
          }
        });
        ensureLayer({
          id: 'ecs-recap-callouts-selected',
          type: 'circle',
          source: 'ecs-recap-callouts-selected',
          paint: {
            'circle-radius': interactive ? 12 : 9,
            'circle-color': 'rgba(242,194,77,0.18)',
            'circle-stroke-color': '#F2C24D',
            'circle-stroke-width': 2
          }
        });
        fitPayload(payload, false);
      }

      window.__ECS_RECAP_MAP_SET__ = function(payload) {
        applyPayload(payload);
      };
      window.__ECS_RECAP_MAP_RECENTER__ = function() {
        fitPayload(pendingPayload, true);
      };

      try {
        mapboxgl.accessToken = ${token};
        mapboxgl.workerCount = 1;
        map = new mapboxgl.Map({
          container: 'map',
          style: ${style},
          center: [-98.5795, 39.8283],
          zoom: 4,
          pitch: RECAP_MAP_3D_PITCH,
          bearing: 0,
          interactive: interactive,
          antialias: false,
          failIfMajorPerformanceCaveat: false,
          scrollZoom: true,
          dragPan: true,
          attributionControl: interactive
        });
        map.on('load', function() {
          if (pendingPayload) applyPayload(pendingPayload);
          send('mapReady', { ok: true });
        });
        map.on('style.load', function() {
          if (pendingPayload) applyPayload(pendingPayload);
        });
        map.on('click', 'ecs-recap-callouts', function(event) {
          var f = event.features && event.features[0];
          if (!f || !f.properties) return;
          selectCallout(f.properties.id, event.lngLat);
        });
      } catch (e) {
        send('mapError', { message: String(e && e.message ? e.message : e) });
      }
    })();
  </script>
</body>
</html>`;
}

function formatBounds(bounds: ExpeditionTripBounds): string {
  return `${bounds.south.toFixed(3)}-${bounds.north.toFixed(3)} lat / ${bounds.west.toFixed(3)}-${bounds.east.toFixed(3)} lon`;
}

function RouteSegment({ start, end, index }: { start: ProjectedPoint; end: ProjectedPoint; index: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <React.Fragment>
      <View
        key={`recap-route-glow-${index}`}
        style={[
          styles.routeGlow,
          {
            left: midX - length / 2,
            top: midY - 3,
            width: length,
            transform: [{ rotate: `${angle}deg` }],
          },
        ]}
      />
      <View
        key={`recap-route-segment-${index}`}
        style={[
          styles.routeSegment,
          {
            left: midX - length / 2,
            top: midY - 1,
            width: length,
            transform: [{ rotate: `${angle}deg` }],
          },
        ]}
      />
    </React.Fragment>
  );
}

function LeaderLine({ from, toX, toY }: { from: ProjectedPoint; toX: number; toY: number }) {
  const dx = toX - from.x;
  const dy = toY - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 4) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = (from.x + toX) / 2;
  const midY = (from.y + toY) / 2;

  return (
    <View
      style={[
        styles.calloutLeaderLine,
        {
          left: midX - length / 2,
          top: midY,
          width: length,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

function RecapMapCalloutView({ callout, onPress }: { callout: RecapMapCallout; onPress?: () => void }) {
  const leaderEndX = callout.x + (callout.x > callout.routePoint.x ? 0 : CALLOUT_WIDTH);
  const leaderEndY = callout.y + CALLOUT_HEIGHT / 2;

  return (
    <React.Fragment>
      <LeaderLine from={callout.routePoint} toX={leaderEndX} toY={leaderEndY} />
      <View
        style={[
          styles.calloutAnchor,
          {
            left: callout.routePoint.x - 3,
            top: callout.routePoint.y - 3,
          },
        ]}
      />
      <Pressable
        onPress={onPress}
        style={[
          styles.calloutCard,
          {
            left: callout.x,
            top: callout.y,
          },
        ]}
      >
        <View style={styles.calloutTitleRow}>
          <Ionicons name={iconForCalloutCategory(callout.category)} size={11} color={TACTICAL.amber} />
          <Text style={styles.calloutTitle} numberOfLines={1}>{callout.title}</Text>
        </View>
        <Text style={styles.calloutDescription} numberOfLines={2}>{callout.description}</Text>
        {callout.elapsedLabel ? <Text style={styles.calloutElapsed}>{callout.elapsedLabel}</Text> : null}
      </Pressable>
    </React.Fragment>
  );
}

function SelectedCalloutPopover({ callout }: { callout: RecapMapCallout }) {
  return (
    <View style={styles.selectedCalloutPopover}>
      <View style={styles.calloutTitleRow}>
        <Ionicons name={iconForCalloutCategory(callout.category)} size={12} color={TACTICAL.amber} />
        <Text style={styles.selectedCalloutTitle} numberOfLines={1}>{callout.title}</Text>
      </View>
      <Text style={styles.selectedCalloutDescription} numberOfLines={3}>{callout.description}</Text>
      <Text style={styles.selectedCalloutMeta}>
        {callout.category.toUpperCase()}{callout.elapsedLabel ? ` · ${callout.elapsedLabel}` : ''}
      </Text>
    </View>
  );
}

function RecapSatelliteMapSurface({
  payload,
  mapToken,
  mapMode,
  webViewRef,
  onCalloutSelected,
  testID,
}: {
  payload: RecapMapPayload;
  mapToken: string;
  mapMode: RecapMapMode;
  webViewRef: React.RefObject<WebView | null>;
  onCalloutSelected: (id: string) => void;
  testID: string;
}) {
  const styleUrl = getMapStyleUrl('3d');
  const html = useMemo(() => buildRecapMapHtml(mapToken, styleUrl, mapMode), [mapMode, mapToken, styleUrl]);
  const payloadScript = useMemo(
    () => `window.__ECS_RECAP_MAP_SET__(${escapeInlineJson(payload)}); true;`,
    [payload],
  );

  useEffect(() => {
    webViewRef.current?.injectJavaScript(payloadScript);
  }, [payloadScript, webViewRef]);

  const handleMapMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type === 'calloutSelected') {
        const id = typeof message.payload?.id === 'string' ? message.payload.id : null;
        if (id) onCalloutSelected(id);
      }
    } catch {
      // Ignore malformed WebView messages; the native fallback remains usable.
    }
  };

  return (
    <WebView
      ref={webViewRef}
      testID={testID}
      originWhitelist={['*']}
      source={{ html }}
      style={styles.mapboxWebView}
      accessibilityLabel="Completed expedition recap satellite map"
      pointerEvents={mapMode === 'expanded' ? 'auto' : 'none'}
      scrollEnabled={mapMode === 'expanded'}
      bounces={false}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mixedContentMode="always"
      onLoadEnd={() => {
        webViewRef.current?.injectJavaScript(payloadScript);
      }}
      onMessage={handleMapMessage}
      onError={() => null}
      onHttpError={() => null}
    />
  );
}

export default function ExpeditionRecapMap({
  routeGeometry,
  routeBounds,
  startCoordinate,
  endCoordinate,
  recap,
  tripStartedAt,
}: ExpeditionRecapMapProps) {
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [selectedCalloutId, setSelectedCalloutId] = useState<string | null>(null);
  const [mapToken, setMapToken] = useState(() => getMapboxTokenSync());
  const compactWebViewRef = useRef<WebView>(null);
  const expandedWebViewRef = useRef<WebView>(null);
  const recapReference = recap?.routeSummary.routeGeometryReference ?? null;
  const model = useMemo(
    () => buildRecapMapModel(routeGeometry, routeBounds, startCoordinate, endCoordinate, recap, tripStartedAt, width),
    [endCoordinate, recap, routeBounds, routeGeometry, startCoordinate, tripStartedAt, width],
  );
  const mapPayload = useMemo(
    () => model ? buildRecapMapPayload(model, startCoordinate, endCoordinate) : null,
    [endCoordinate, model, startCoordinate],
  );
  const selectedCallout = useMemo(
    () => model?.callouts.find((callout) => callout.id === selectedCalloutId) ?? null,
    [model?.callouts, selectedCalloutId],
  );

  useEffect(() => {
    let cancelled = false;
    if (mapToken) return undefined;
    void getMapboxToken()
      .then((token) => {
        if (!cancelled) setMapToken(token);
      })
      .catch(() => {
        if (!cancelled) setMapToken('');
      });
    return () => {
      cancelled = true;
    };
  }, [mapToken]);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const recenterExpandedMap = () => {
    expandedWebViewRef.current?.injectJavaScript('window.__ECS_RECAP_MAP_RECENTER__ && window.__ECS_RECAP_MAP_RECENTER__(); true;');
  };

  return (
    <View style={styles.section} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>Recap Map</Text>
        </View>
        {model?.bounds ? (
          <Text style={styles.boundsText} numberOfLines={1}>
            {formatBounds(model.bounds)}
          </Text>
        ) : null}
      </View>

      {model ? (
        <View
          style={styles.mapSurface}
          pointerEvents="box-none"
          accessibilityRole="image"
          accessibilityLabel="Completed expedition recap map"
        >
          {mapPayload && mapToken ? (
            <RecapSatelliteMapSurface
              payload={mapPayload}
              mapToken={mapToken}
              mapMode="compact"
              webViewRef={compactWebViewRef}
              onCalloutSelected={setSelectedCalloutId}
              testID="expedition-recap-map-satellite"
            />
          ) : null}
          <View pointerEvents="none" style={styles.mapSatelliteScrim} />
          <View style={styles.gridVerticalA} />
          <View style={styles.gridVerticalB} />
          <View style={styles.gridHorizontalA} />
          <View style={styles.gridHorizontalB} />
          <TouchableOpacity
            testID="expedition-recap-map-expand"
            style={styles.expandButton}
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="Expand recap map"
          >
            <Ionicons name="expand-outline" size={15} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={styles.routeReferenceBadge}>
            <Text style={styles.routeReferenceText}>
              {mapPayload && mapToken ? 'SATELLITE RECAP' : recapReference ? 'COMPLETED ROUTE' : 'SAVED ROUTE'}
            </Text>
          </View>

          {model.projectedRoute.slice(1).map((point, index) => (
            <RouteSegment
              key={`recap-route-${index}`}
              start={model.projectedRoute[index]}
              end={point}
              index={index}
            />
          ))}

          {downsample(model.projectedRoute, 42).map((point, index) => (
            <View
              key={`recap-route-dot-${index}`}
              style={[
                styles.routeDot,
                {
                  left: point.x - 1.5,
                  top: point.y - 1.5,
                },
              ]}
            />
          ))}

          {model.start ? (
            <View
              style={[
                styles.startMarker,
                {
                  left: model.start.x - 6,
                  top: model.start.y - 6,
                },
              ]}
            >
              <View style={styles.startMarkerInner} />
            </View>
          ) : null}

          {model.finish ? (
            <View
              style={[
                styles.finishMarker,
                {
                  left: model.finish.x - 8,
                  top: model.finish.y - 8,
                },
              ]}
            >
              <Ionicons name="flag" size={10} color="#0B0F12" />
            </View>
          ) : null}

          {model.callouts.map((callout) => (
            <RecapMapCalloutView
              key={callout.id}
              callout={callout}
              onPress={() => setSelectedCalloutId(callout.id)}
            />
          ))}

          {selectedCallout ? <SelectedCalloutPopover callout={selectedCallout} /> : null}

          {/* TODO Expedition Recap Map: add exploded route annotations after route annotation contracts exist. */}
          {/* TODO Expedition Recap Map: add export-ready map rendering and printable recap map layout. */}
          {/* TODO Expedition Recap Map: add badge stamp overlays for earned expedition badges. */}
          {/* TODO Expedition Recap Map: add weather layer callouts from recap weather snapshots. */}
          {/* TODO Expedition Recap Map: add terrain risk callout styling from recap terrain events. */}
          {/* TODO Expedition Recap Map: replace WebView recenter with native Mapbox bridge when Expedition Hub adopts native maps. */}
        </View>
      ) : (
        <View style={styles.fallbackSurface}>
          <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={styles.fallbackTitle}>Route map unavailable.</Text>
          <Text style={styles.fallbackSubtext}>This expedition was saved without route geometry.</Text>
        </View>
      )}

      <Modal
        visible={expanded && Boolean(model && mapPayload)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpanded(false)}
      >
        <View testID="expedition-recap-map-fullscreen" style={styles.fullscreenMap}>
          <View style={styles.fullscreenHeader}>
            <View style={styles.fullscreenTitleWrap}>
              <Text style={styles.fullscreenEyebrow}>EXPEDITION RECAP MAP</Text>
              <Text style={styles.fullscreenTitle} numberOfLines={1}>
                {recapReference ? 'Completed Route' : 'Saved Route'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.fullscreenAction}
              onPress={recenterExpandedMap}
              accessibilityRole="button"
              accessibilityLabel="Recenter recap map"
            >
              <Ionicons name="locate-outline" size={14} color={TACTICAL.text} />
              <Text style={styles.fullscreenActionText}>RECENTER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fullscreenIconButton}
              onPress={() => setExpanded(false)}
              accessibilityRole="button"
              accessibilityLabel="Close recap map"
            >
              <Ionicons name="close" size={18} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>

          {mapPayload && mapToken ? (
            <RecapSatelliteMapSurface
              payload={mapPayload}
              mapToken={mapToken}
              mapMode="expanded"
              webViewRef={expandedWebViewRef}
              onCalloutSelected={setSelectedCalloutId}
              testID="expedition-recap-map-expanded-webview"
            />
          ) : (
            <View style={styles.fullscreenFallback}>
              <Ionicons name="map-outline" size={28} color={TACTICAL.textMuted} />
              <Text style={styles.fallbackTitle}>Satellite map unavailable.</Text>
              <Text style={styles.fallbackSubtext}>A Mapbox token is required for the interactive recap map.</Text>
            </View>
          )}

          {selectedCallout ? <SelectedCalloutPopover callout={selectedCallout} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.72)',
    padding: 10,
    gap: 9,
  },
  headerRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  boundsText: {
    flexShrink: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'right',
  },
  mapSurface: {
    height: MAP_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(7,10,13,0.96)',
  },
  mapboxWebView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020608',
  },
  mapSatelliteScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,10,0.24)',
  },
  expandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 24,
    width: 31,
    height: 31,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11,14,18,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridVerticalA: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33%',
    width: 1,
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  gridVerticalB: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66%',
    width: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  gridHorizontalA: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '35%',
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  gridHorizontalB: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '68%',
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  routeReferenceBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    zIndex: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.82)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  routeReferenceText: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
  },
  routeGlow: {
    position: 'absolute',
    zIndex: 5,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(242,194,77,0.18)',
  },
  routeSegment: {
    position: 'absolute',
    zIndex: 6,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#F2C24D',
  },
  routeDot: {
    position: 'absolute',
    zIndex: 7,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(242,194,77,0.62)',
  },
  startMarker: {
    position: 'absolute',
    zIndex: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(155,201,161,0.72)',
    backgroundColor: 'rgba(155,201,161,0.18)',
  },
  startMarkerInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#9BC9A1',
  },
  finishMarker: {
    position: 'absolute',
    zIndex: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.amber,
    borderWidth: 1,
    borderColor: ECS.accent,
  },
  calloutLeaderLine: {
    position: 'absolute',
    zIndex: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(242,194,77,0.36)',
  },
  calloutAnchor: {
    position: 'absolute',
    zIndex: 15,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(7,10,13,0.92)',
  },
  calloutCard: {
    position: 'absolute',
    zIndex: 16,
    width: CALLOUT_WIDTH,
    minHeight: CALLOUT_HEIGHT,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11,14,18,0.92)',
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 2,
  },
  calloutTitleRow: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calloutTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  calloutDescription: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
  calloutElapsed: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
  },
  selectedCalloutPopover: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11,14,18,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  selectedCalloutTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  selectedCalloutDescription: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  selectedCalloutMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  fullscreenMap: {
    flex: 1,
    backgroundColor: '#020608',
  },
  fullscreenHeader: {
    minHeight: 66,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(8,11,15,0.98)',
  },
  fullscreenTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  fullscreenEyebrow: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  fullscreenTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '900',
  },
  fullscreenAction: {
    minHeight: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.9)',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fullscreenActionText: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
  },
  fullscreenIconButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  fallbackSurface: {
    minHeight: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(7,10,13,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  fallbackTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  fallbackSubtext: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
