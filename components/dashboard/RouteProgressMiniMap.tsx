import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { getMapboxToken, getMapboxTokenSync } from '../../lib/mapConfig';
import MapRenderer, { type CameraCommand } from '../navigate/MapRenderer';
import {
  featureToRoutePoints,
  getCurrentPointOnRoute,
  getRouteBounds,
  getRouteCameraBearing,
  normalizeRouteFeature,
  pointsToLineStringFeature,
  projectLocationToRouteProgress,
  splitRouteAtProgress,
  type MiniMapCoordinate,
  type MiniMapRouteInput,
} from './routeGeometryUtils';

export const ROUTE_PROGRESS_MINI_MAP_STYLE_URL =
  'mapbox://styles/expeditioncommand/cmpax1px3005a01sq5doe9xml';

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
  const routeFeature = useMemo(() => normalizeRouteFeature(routeGeoJson), [routeGeoJson]);
  const inferredProgress = useMemo(
    () => projectLocationToRouteProgress(routeFeature, currentLocation),
    [currentLocation, routeFeature],
  );
  const resolvedProgress = clampProgress(progressPercent) ?? inferredProgress ?? 0;
  const markerLocation = currentLocation ?? getCurrentPointOnRoute(routeFeature, resolvedProgress);
  const hasActiveMap = Boolean(isGuidanceActive && routeFeature && mapToken);

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
  const routePoints = useMemo(
    () => featureToRoutePoints(split.remainingRouteGeoJson ?? routeFeature),
    [routeFeature, split.remainingRouteGeoJson],
  );
  const progressPoints = useMemo(
    () => featureToRoutePoints(split.completedRouteGeoJson),
    [split.completedRouteGeoJson],
  );
  const cameraCommand = useMemo<CameraCommand | null>(() => {
    if (!routeFeature) return null;
    const bounds = getRouteBounds(routeFeature, [currentLocation, originLocation, destinationLocation]);
    if (!bounds) return null;
    return {
      mode: 'route_overview',
      fitBounds: {
        ...bounds,
        padding: 34,
        maxZoom: 15.8,
      },
      bearing: getRouteCameraBearing(routeFeature),
      pitch: 0,
      durationMs: 420,
      animate: true,
      reason: 'dashboard_route_progress_minimap',
    };
  }, [currentLocation, destinationLocation, originLocation, routeFeature]);
  const overlayParts = [
    Number.isFinite(resolvedProgress) ? `${Math.round(resolvedProgress)}%` : null,
    remainingDistanceText && remainingDistanceText !== '--' ? remainingDistanceText : null,
    etaText && etaText !== '--' ? etaText : null,
    statusText ? statusText : null,
  ].filter((part): part is string => !!part);

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
      {hasActiveMap ? (
        <MapRenderer
          mapboxToken={mapToken}
          mapStyle="route-progress"
          interactive={false}
          points={routePoints}
          progressPoints={progressPoints}
          routeColor="rgba(153, 126, 66, 0.55)"
          progressColor={ecsGold}
          routeRenderMode="active"
          showUserLocation={Boolean(markerLocation)}
          userLocation={markerLocation}
          cameraCommand={cameraCommand}
          cameraCommandTrigger={Math.round(resolvedProgress)}
          style={styles.map}
        />
      ) : (
        <Image
          testID={`${testID}-placeholder`}
          source={inactivePlaceholderSource}
          resizeMode="cover"
          style={styles.placeholder}
        />
      )}

      {hasActiveMap ? (
        <>
          {overlayParts.length > 0 ? (
            <View style={styles.metricOverlay} pointerEvents="none">
              <Text style={[styles.metricText, { color: ecsGold }]} numberOfLines={1}>
                {overlayParts.join('  |  ')}
              </Text>
            </View>
          ) : null}
        </>
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
    left: 7,
    bottom: 6,
    maxWidth: '78%',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(1, 5, 7, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 77, 0.18)',
  },
  metricText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
});
