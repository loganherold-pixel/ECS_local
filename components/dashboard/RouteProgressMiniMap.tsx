import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { TACTICAL } from '../../lib/theme';
import { getMapStyleUrl, getMapboxToken, getMapboxTokenSync } from '../../lib/mapConfig';
import MapFallbackSurface from '../navigate/MapFallbackSurface';
import {
  getCurrentPointOnRoute,
  getRouteCameraBearing,
  getRouteBounds,
  normalizeRouteFeature,
  pointsToLineStringFeature,
  projectLocationToRouteProgress,
  splitRouteAtProgress,
  type MiniMapCoordinate,
  type MiniMapRouteInput,
} from './routeGeometryUtils';

export const ROUTE_PROGRESS_MINI_MAP_STYLE_URL =
  'mapbox://styles/mapbox/dark-v11';

const MINI_MAP_CONSTRUCTOR_RETRY_LIMIT = 2;
const MINI_MAP_CONSTRUCTOR_RETRY_BASE_MS = 700;
const MINI_MAPBOX_GL_JS_VERSION = 'v2.15.0';
const ROUTE_PROGRESS_3D_PITCH = 56;
const ROUTE_PROGRESS_3D_MAX_ZOOM = 13.6;

export type RouteProgressMiniMapProps = {
  isGuidanceActive: boolean;
  routeGeoJson?: MiniMapRouteInput | null;
  currentLocation?: MiniMapCoordinate | null;
  progressPercent?: number | null;
  destinationLocation?: MiniMapCoordinate | null;
  originLocation?: MiniMapCoordinate | null;
  remainingDistanceText?: string | null;
  etaText?: string | null;
  height?: number;
  borderRadius?: number;
  ecsGold?: string;
  inactivePlaceholderSource: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  statusText?: string | null;
  testID?: string;
};

function clampProgress(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function escapeInlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildMiniMapHtml(mapboxToken: string, styleUrl: string) {
  const token = escapeInlineJson(mapboxToken);
  const styleCandidates = Array.from(new Set([styleUrl, ROUTE_PROGRESS_MINI_MAP_STYLE_URL]));
  const styles = escapeInlineJson(styleCandidates);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/${MINI_MAPBOX_GL_JS_VERSION}/mapbox-gl.css" rel="stylesheet" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #020608; overflow: hidden; }
    .mapboxgl-ctrl-top-left, .mapboxgl-ctrl-top-right, .mapboxgl-ctrl-bottom-right { display: none !important; }
    .mapboxgl-ctrl-logo { opacity: 0.58; transform: scale(0.72); transform-origin: bottom left; }
    .mapboxgl-ctrl-attrib { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://api.mapbox.com/mapbox-gl-js/${MINI_MAPBOX_GL_JS_VERSION}/mapbox-gl.js"></script>
  <script>
    (function() {
      var RNW = window.ReactNativeWebView;
      var styleCandidates = ${styles};
      var styleIndex = 0;
      var loaded = false;
      var pendingPayload = null;
      var map = null;
      var loadTimer = null;
      var readyTimer = null;
      var readySent = false;
      var lastCameraFitKey = null;
      var ROUTE_PROGRESS_3D_TERRAIN_SOURCE_ID = 'ecs-route-progress-terrain-dem';

      function send(type, payload) {
        try {
          if (RNW && RNW.postMessage) {
            RNW.postMessage(JSON.stringify({ type: type, payload: payload || null }));
          }
        } catch (e) {}
      }

      function finishReady(reason) {
        if (readySent) return;
        readySent = true;
        clearTimeout(readyTimer);
        clearTimeout(loadTimer);
        send('mapReady', { ok: true, reason: reason || 'ready' });
      }

      function fc(features) {
        return { type: 'FeatureCollection', features: features || [] };
      }

      function lineFeature(id, coords, color) {
        return {
          type: 'Feature',
          id: id,
          properties: { color: color },
          geometry: { type: 'LineString', coordinates: coords || [] }
        };
      }

      function pointFeature(point) {
        return {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] }
        };
      }

      function ensureSource(id, data) {
        if (!map.getSource(id)) {
          map.addSource(id, { type: 'geojson', data: data });
          return;
        }
        map.getSource(id).setData(data);
      }

      function ensureLineLayer(id, sourceId, width, opacity) {
        if (map.getLayer(id)) return;
        map.addLayer({
          id: id,
          type: 'line',
          source: sourceId,
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#5FD1FF'],
            'line-width': width,
            'line-opacity': opacity
          }
        });
      }

      function ensureMarkerLayer() {
        if (map.getLayer('ecs-current-marker-ring')) return;
        map.addLayer({
          id: 'ecs-current-marker-ring',
          type: 'circle',
          source: 'ecs-current-source',
          paint: {
            'circle-radius': 8,
            'circle-color': 'rgba(77, 163, 255, 0.18)',
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.92)'
          }
        });
        map.addLayer({
          id: 'ecs-current-marker-core',
          type: 'circle',
          source: 'ecs-current-source',
          paint: {
            'circle-radius': 4,
            'circle-color': '#5FD1FF',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#020608'
          }
        });
      }

      function normalizeBearing(value) {
        if (typeof value !== 'number' || !isFinite(value)) return 0;
        return ((value % 360) + 360) % 360;
      }

      function getSurfacePadding(payloadPadding) {
        if (typeof payloadPadding === 'number') {
          var compactPad = Math.max(12, Math.min(28, payloadPadding));
          return { top: compactPad + 6, right: compactPad, bottom: compactPad, left: compactPad };
        }
        if (payloadPadding && typeof payloadPadding === 'object') return payloadPadding;
        return { top: 24, right: 18, bottom: 18, left: 18 };
      }

      function getBoundsFromCoordinates(coords) {
        if (!Array.isArray(coords) || coords.length < 2) return null;
        var first = coords[0];
        var west = first[0];
        var east = first[0];
        var south = first[1];
        var north = first[1];
        for (var index = 1; index < coords.length; index += 1) {
          var coord = coords[index];
          if (!Array.isArray(coord) || coord.length < 2) continue;
          var lng = Number(coord[0]);
          var lat = Number(coord[1]);
          if (!isFinite(lng) || !isFinite(lat)) continue;
          west = Math.min(west, lng);
          east = Math.max(east, lng);
          south = Math.min(south, lat);
          north = Math.max(north, lat);
        }
        return { west: west, east: east, south: south, north: north };
      }

      function expandThinBounds(bounds) {
        if (!bounds) return null;
        var longitudeSpan = Math.abs(bounds.east - bounds.west);
        var latitudeSpan = Math.abs(bounds.north - bounds.south);
        var minSpan = 0.006;
        if (longitudeSpan < minSpan) {
          var lngPad = (minSpan - longitudeSpan) / 2;
          bounds.west -= lngPad;
          bounds.east += lngPad;
        }
        if (latitudeSpan < minSpan) {
          var latPad = (minSpan - latitudeSpan) / 2;
          bounds.south -= latPad;
          bounds.north += latPad;
        }
        return bounds;
      }

      function getBoundsKey(bounds, bearing, pitch) {
        return [
          bounds.west,
          bounds.south,
          bounds.east,
          bounds.north,
          bearing,
          pitch
        ].map(function(value) {
          return typeof value === 'number' && isFinite(value) ? value.toFixed(5) : 'x';
        }).join('|');
      }

      function enableRouteProgress3dTerrain() {
        try {
          if (!map.getSource(ROUTE_PROGRESS_3D_TERRAIN_SOURCE_ID)) {
            map.addSource(ROUTE_PROGRESS_3D_TERRAIN_SOURCE_ID, {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14
            });
          }
          if (map.setTerrain) {
            map.setTerrain({ source: ROUTE_PROGRESS_3D_TERRAIN_SOURCE_ID, exaggeration: 1.18 });
          }
          if (map.setFog) {
            map.setFog({
              color: 'rgba(3, 7, 10, 0.92)',
              'high-color': 'rgba(31, 51, 65, 0.45)',
              'horizon-blend': 0.08,
              'space-color': '#020608',
              'star-intensity': 0
            });
          }
        } catch (e) {}
      }

      function fitFullRouteBounds(payload) {
        var rawBounds = payload.bounds || getBoundsFromCoordinates(payload.routeCoords);
        var bounds = expandThinBounds(rawBounds);
        if (!bounds) return false;
        var pitch = typeof payload.pitch === 'number' ? payload.pitch : ${ROUTE_PROGRESS_3D_PITCH};
        var bearing = normalizeBearing(payload.bearing);
        var cameraKey = getBoundsKey(bounds, bearing, pitch);
        if (cameraKey === lastCameraFitKey) return true;
        lastCameraFitKey = cameraKey;
        try {
          map.fitBounds(
            [[bounds.west, bounds.south], [bounds.east, bounds.north]],
            {
              padding: getSurfacePadding(payload.padding),
              maxZoom: payload.maxZoom || ${ROUTE_PROGRESS_3D_MAX_ZOOM},
              pitch: pitch,
              bearing: bearing,
              duration: payload.animate ? 360 : 0,
              essential: true
            }
          );
          return true;
        } catch (e) {
          return false;
        }
      }

      function applyPayload(payload) {
        if (!map || !map.isStyleLoaded()) {
          pendingPayload = payload;
          return;
        }
        pendingPayload = payload;
        var routeCoords = payload.routeCoords || [];
        var progressCoords = payload.progressCoords || [];
        ensureSource('ecs-route-source', fc(routeCoords.length > 1 ? [lineFeature('route', routeCoords, payload.routeColor)] : []));
        ensureSource('ecs-progress-source', fc(progressCoords.length > 1 ? [lineFeature('progress', progressCoords, payload.progressColor)] : []));
        ensureSource('ecs-current-source', fc(payload.marker ? [pointFeature(payload.marker)] : []));
        ensureLineLayer('ecs-route-glow', 'ecs-route-source', 11, 0.18);
        ensureLineLayer('ecs-route-line', 'ecs-route-source', 4, 0.92);
        ensureLineLayer('ecs-progress-glow', 'ecs-progress-source', 13, 0.24);
        ensureLineLayer('ecs-progress-line', 'ecs-progress-source', 5, 0.96);
        ensureMarkerLayer();
        enableRouteProgress3dTerrain();
        if (!fitFullRouteBounds(payload) && payload.marker) {
          map.jumpTo({
            center: [payload.marker.longitude, payload.marker.latitude],
            zoom: 12.2,
            pitch: ${ROUTE_PROGRESS_3D_PITCH},
            bearing: normalizeBearing(payload.bearing)
          });
        }
      }

      function scheduleStyleFallback() {
        clearTimeout(loadTimer);
        loadTimer = setTimeout(function() {
          if (loaded) return;
          if (styleIndex < styleCandidates.length - 1) {
            styleIndex += 1;
            try {
              map.setStyle(styleCandidates[styleIndex]);
            } catch (e) {
              send('mapError', { reason: 'style_fallback_failed' });
            }
            scheduleStyleFallback();
          } else {
            send('mapError', { reason: 'style_load_timeout' });
          }
        }, 5200);
      }

      window.__ECS_ROUTE_MINI_MAP_SET__ = applyPayload;

      try {
        try {
          mapboxgl.workerCount = 1;
        } catch (workerError) {}
        mapboxgl.accessToken = ${token};
        map = new mapboxgl.Map({
          container: 'map',
          style: styleCandidates[styleIndex],
          center: [-98.5795, 39.8283],
          zoom: 3,
          pitch: ${ROUTE_PROGRESS_3D_PITCH},
          bearing: 0,
          attributionControl: false,
          logoPosition: 'bottom-left',
          interactive: false,
          antialias: false,
          failIfMajorPerformanceCaveat: false,
          fadeDuration: 0,
          preserveDrawingBuffer: false
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: false }), 'top-left');
        readyTimer = setTimeout(function() {
          finishReady('bootstrap_timeout');
        }, 1400);
        scheduleStyleFallback();
        map.on('load', function() {
          loaded = true;
          finishReady('load');
          if (pendingPayload) applyPayload(pendingPayload);
        });
        map.on('style.load', function() {
          finishReady('style_load');
          if (pendingPayload) applyPayload(pendingPayload);
        });
        map.on('idle', function() {
          finishReady('idle');
        });
        map.on('error', function(event) {
          if (!loaded && styleIndex < styleCandidates.length - 1) {
            styleIndex += 1;
            try {
              map.setStyle(styleCandidates[styleIndex]);
            } catch (e) {}
          }
        });
      } catch (e) {
        send('mapError', {
          reason: 'constructor_failed',
          detail: e && e.message ? String(e.message) : String(e)
        });
      }
    })();
  </script>
</body>
</html>`;
}

export default function RouteProgressMiniMap({
  borderRadius = 12,
  currentLocation,
  destinationLocation,
  ecsGold = TACTICAL.amber,
  etaText,
  height,
  inactivePlaceholderSource,
  isGuidanceActive,
  originLocation,
  progressPercent,
  remainingDistanceText,
  routeGeoJson,
  style,
  statusText,
  testID = 'route-progress-mini-map',
}: RouteProgressMiniMapProps) {
  const [mapToken, setMapToken] = useState(() => getMapboxTokenSync());
  const [mapReady, setMapReady] = useState(false);
  const [mapBootIssue, setMapBootIssue] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constructorRetryCountRef = useRef(0);
  const [webViewRevision, setWebViewRevision] = useState(0);
  const routeFeature = useMemo(() => normalizeRouteFeature(routeGeoJson), [routeGeoJson]);
  const inferredProgress = useMemo(
    () => projectLocationToRouteProgress(routeFeature, currentLocation),
    [currentLocation, routeFeature],
  );
  const explicitProgress = clampProgress(progressPercent);
  const resolvedProgress =
    explicitProgress != null && (explicitProgress > 0 || inferredProgress == null)
      ? explicitProgress
      : inferredProgress ?? explicitProgress ?? 0;
  const markerLocation = currentLocation ?? getCurrentPointOnRoute(routeFeature, resolvedProgress);
  const hasRenderableMap = Boolean(routeFeature && mapToken);
  const styleUrl = useMemo(() => getMapStyleUrl('route-progress'), []);
  const miniMapHtml = useMemo(
    () => (mapToken ? buildMiniMapHtml(mapToken, styleUrl) : ''),
    [mapToken, styleUrl],
  );

  useEffect(() => {
    setMapReady(false);
    setMapBootIssue(null);
  }, [miniMapHtml]);

  useEffect(() => () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (mapToken) {
      return () => {
        mounted = false;
      };
    }
    void getMapboxToken()
      .then((token) => {
        if (mounted && token) setMapToken(token);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [mapToken]);

  const split = useMemo(
    () => splitRouteAtProgress(routeFeature, resolvedProgress),
    [resolvedProgress, routeFeature],
  );
  const cameraBearing = useMemo(() => getRouteCameraBearing(routeFeature), [routeFeature]);
  const miniMapPayload = useMemo(() => {
    if (!routeFeature) return null;
    const bounds = getRouteBounds(routeFeature, [currentLocation, originLocation, destinationLocation]);
    return {
      routeCoords: routeFeature.geometry.coordinates,
      progressCoords: split.completedRouteGeoJson?.geometry.coordinates ?? [],
      marker: markerLocation,
      bounds,
      routeColor: 'rgba(95, 209, 255, 0.86)',
      progressColor: ecsGold,
      padding: 18,
      maxZoom: ROUTE_PROGRESS_3D_MAX_ZOOM,
      pitch: ROUTE_PROGRESS_3D_PITCH,
      bearing: cameraBearing,
      animate: true,
    };
  }, [cameraBearing, currentLocation, destinationLocation, ecsGold, markerLocation, originLocation, routeFeature, split.completedRouteGeoJson]);
  const miniMapPayloadHash = useMemo(() => JSON.stringify(miniMapPayload), [miniMapPayload]);
  const showFallbackMap = Boolean(hasRenderableMap && !mapReady && miniMapPayload);

  useEffect(() => {
    if (!hasRenderableMap || !mapReady || !miniMapPayload) return;
    const json = escapeInlineJson(miniMapPayload);
    webViewRef.current?.injectJavaScript(`
      try {
        if (window.__ECS_ROUTE_MINI_MAP_SET__) {
          window.__ECS_ROUTE_MINI_MAP_SET__(${json});
        }
      } catch (e) {}
      true;
    `);
  }, [hasRenderableMap, mapReady, miniMapPayload, miniMapPayloadHash]);
  const compactStatusText = isGuidanceActive
    ? 'Active'
    : 'No active route';
  const overlayParts = isGuidanceActive
    ? [
        Number.isFinite(resolvedProgress) ? `${Math.round(resolvedProgress)}%` : null,
        remainingDistanceText && remainingDistanceText !== '--' ? remainingDistanceText : null,
        etaText && etaText !== '--' ? etaText : null,
        compactStatusText,
      ].filter((part): part is string => !!part)
    : [compactStatusText];
  const showMetricOverlay = overlayParts.length > 0;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.shell,
        {
          borderRadius,
          height,
        },
        style,
      ]}
    >
      {showFallbackMap && miniMapPayload ? (
        <>
          <Image
            testID={`${testID}-fallback-background`}
            source={inactivePlaceholderSource}
            resizeMode="cover"
            style={styles.placeholder}
          />
          <MapFallbackSurface
            compact
            transparentBackground
            routeCoords={miniMapPayload.routeCoords}
            progressRouteCoords={miniMapPayload.progressCoords}
            userLocation={miniMapPayload.marker}
            bootIssue={mapBootIssue}
            statusLabel="Fallback map"
          />
        </>
      ) : !hasRenderableMap || !mapReady ? (
        <Image
          testID={`${testID}-placeholder`}
          source={inactivePlaceholderSource}
          resizeMode="cover"
          style={styles.placeholder}
        />
      ) : null}

      {hasRenderableMap && miniMapHtml ? (
        <WebView
          ref={webViewRef}
          source={{ html: miniMapHtml, baseUrl: 'https://api.mapbox.com/' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          androidLayerType="hardware"
          mixedContentMode="always"
          cacheEnabled
          key={`route-progress-mini-map-${webViewRevision}`}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data || '{}');
              if (message?.type === 'mapReady') {
                constructorRetryCountRef.current = 0;
                setMapReady(true);
                setMapBootIssue(null);
              } else if (message?.type === 'mapError') {
                const reason = message?.payload?.reason ?? 'map_error';
                const detail =
                  typeof message?.payload?.detail === 'string' && message.payload.detail.length > 0
                    ? message.payload.detail.slice(0, 72)
                    : null;
                if (
                  String(reason).includes('constructor') &&
                  constructorRetryCountRef.current < MINI_MAP_CONSTRUCTOR_RETRY_LIMIT
                ) {
                  if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                  const nextAttempt = constructorRetryCountRef.current + 1;
                  retryTimerRef.current = setTimeout(() => {
                    constructorRetryCountRef.current = nextAttempt;
                    setMapReady(false);
                    setMapBootIssue(`constructor_retry_${nextAttempt}`);
                    setWebViewRevision((revision) => revision + 1);
                  }, MINI_MAP_CONSTRUCTOR_RETRY_BASE_MS * nextAttempt);
                  return;
                }
                setMapBootIssue(detail ? `${reason}: ${detail}` : reason);
              }
            } catch {}
          }}
          onLoadStart={() => {
            setMapReady(false);
            setMapBootIssue(null);
          }}
          onError={(event) => {
            setMapBootIssue(event.nativeEvent.description || 'webview_error');
          }}
          onHttpError={(event) => {
            setMapBootIssue(`http_${event.nativeEvent.statusCode ?? 'error'}`);
          }}
          style={styles.map}
        />
      ) : null}

      {hasRenderableMap && mapBootIssue && !mapReady ? (
        <View style={styles.bootStatus} pointerEvents="none">
          <Text style={styles.bootStatusText} numberOfLines={1}>
            Map standby
          </Text>
        </View>
      ) : null}

      {showMetricOverlay ? (
        <View style={styles.metricOverlay} pointerEvents="none">
          <Text style={[styles.metricText, { color: ecsGold }]} numberOfLines={1}>
            {overlayParts.join('  |  ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function buildRouteProgressFeatureFromPoints(points: MiniMapCoordinate[]) {
  return pointsToLineStringFeature(points);
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    width: '100%',
    minHeight: 92,
    overflow: 'hidden',
    backgroundColor: 'rgba(2, 6, 8, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 77, 0.16)',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  metricOverlay: {
    position: 'absolute',
    top: 6,
    right: 7,
    zIndex: 12,
    elevation: 12,
    maxWidth: '76%',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(1, 5, 7, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 77, 0.18)',
  },
  bootStatus: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(1, 5, 7, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 77, 0.12)',
  },
  bootStatusText: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metricText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
});
