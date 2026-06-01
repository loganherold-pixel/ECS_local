import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import { TACTICAL } from '../../lib/theme';

type LngLat = [number, number];

type FallbackMarker = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  color?: string;
  type?: string;
};

type FallbackSegment = {
  coordinates?: LngLat[] | { latitude: number; longitude: number }[];
  color?: string;
};

export type MapFallbackSurfaceProps = {
  routeCoords?: LngLat[];
  progressRouteCoords?: LngLat[];
  segments?: FallbackSegment[];
  userLocation?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
  markers?: FallbackMarker[];
  bootIssue?: string | null;
  compact?: boolean;
  statusLabel?: string;
  transparentBackground?: boolean;
};

function normalizePoint(point: unknown): LngLat | null {
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
  }

  const record = point as { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
  if (!record) return null;
  const lat = Number(record.latitude ?? record.lat);
  const lng = Number(record.longitude ?? record.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
}

function normalizeLine(points: unknown[] | undefined): LngLat[] {
  return (points ?? []).map(normalizePoint).filter((point): point is LngLat => !!point);
}

function buildBounds(lines: LngLat[][], points: LngLat[]) {
  const all = [...lines.flat(), ...points];
  if (!all.length) return null;

  let minLng = all[0][0];
  let maxLng = all[0][0];
  let minLat = all[0][1];
  let maxLat = all[0][1];

  all.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  if (Math.abs(maxLng - minLng) < 0.002) {
    minLng -= 0.001;
    maxLng += 0.001;
  }
  if (Math.abs(maxLat - minLat) < 0.002) {
    minLat -= 0.001;
    maxLat += 0.001;
  }

  return { minLng, maxLng, minLat, maxLat };
}

function makeProjector(bounds: NonNullable<ReturnType<typeof buildBounds>>, width: number, height: number) {
  const pad = 18;
  const usableWidth = Math.max(1, width - pad * 2);
  const usableHeight = Math.max(1, height - pad * 2);
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;

  return ([lng, lat]: LngLat) => {
    const x = pad + ((lng - bounds.minLng) / lngSpan) * usableWidth;
    const y = pad + (1 - (lat - bounds.minLat) / latSpan) * usableHeight;
    return [x, y] as const;
  };
}

function lineToSvgPoints(line: LngLat[], project: (point: LngLat) => readonly [number, number]) {
  return line.map((point) => project(point).join(',')).join(' ');
}

export default function MapFallbackSurface({
  bootIssue,
  compact = false,
  markers,
  progressRouteCoords,
  routeCoords,
  segments,
  statusLabel = 'Fallback map',
  transparentBackground = false,
  userLocation,
}: MapFallbackSurfaceProps) {
  const routeLine = useMemo(() => normalizeLine(routeCoords), [routeCoords]);
  const progressLine = useMemo(() => normalizeLine(progressRouteCoords), [progressRouteCoords]);
  const segmentLines = useMemo(
    () =>
      (segments ?? [])
        .map((segment) => ({
          color: segment.color || 'rgba(95, 209, 255, 0.82)',
          coordinates: normalizeLine(segment.coordinates as unknown[] | undefined),
        }))
        .filter((segment) => segment.coordinates.length > 1),
    [segments],
  );
  const markerPoints = useMemo(
    () => (markers ?? []).map((marker) => ({ marker, point: normalizePoint(marker) })).filter((item) => !!item.point),
    [markers],
  );
  const userPoint = useMemo(() => normalizePoint(userLocation), [userLocation]);
  const bounds = useMemo(
    () =>
      buildBounds(
        [routeLine, progressLine, ...segmentLines.map((segment) => segment.coordinates)],
        [...markerPoints.map((item) => item.point as LngLat), ...(userPoint ? [userPoint] : [])],
      ),
    [markerPoints, progressLine, routeLine, segmentLines, userPoint],
  );

  if (!bounds) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.empty,
          transparentBackground && styles.transparentSurface,
          compact && styles.compactEmpty,
        ]}
      >
        <Text style={styles.emptyTitle}>Map fallback ready</Text>
        <Text style={styles.emptyText}>Route geometry is not available yet.</Text>
      </View>
    );
  }

  const width = 360;
  const height = compact ? 150 : 640;
  const project = makeProjector(bounds, width, height);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.shell,
        transparentBackground && styles.transparentSurface,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={transparentBackground ? 'rgba(5,9,13,0.68)' : '#05090D'}
        />
        {Array.from({ length: 7 }).map((_, index) => (
          <Line
            key={`grid-v-${index}`}
            x1={(width / 6) * index}
            x2={(width / 6) * index}
            y1="0"
            y2={height}
            stroke="rgba(242,194,77,0.055)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 9 }).map((_, index) => (
          <Line
            key={`grid-h-${index}`}
            x1="0"
            x2={width}
            y1={(height / 8) * index}
            y2={(height / 8) * index}
            stroke="rgba(242,194,77,0.045)"
            strokeWidth="1"
          />
        ))}
        {segmentLines.map((segment, index) => (
          <Polyline
            key={`segment-${index}`}
            points={lineToSvgPoints(segment.coordinates, project)}
            fill="none"
            stroke={segment.color}
            strokeOpacity="0.42"
            strokeWidth={compact ? 8 : 10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {routeLine.length > 1 ? (
          <>
            <Polyline
              points={lineToSvgPoints(routeLine, project)}
              fill="none"
              stroke="rgba(95,209,255,0.2)"
              strokeWidth={compact ? 12 : 16}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Polyline
              points={lineToSvgPoints(routeLine, project)}
              fill="none"
              stroke="rgba(95,209,255,0.88)"
              strokeWidth={compact ? 4 : 5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        {progressLine.length > 1 ? (
          <Polyline
            points={lineToSvgPoints(progressLine, project)}
            fill="none"
            stroke={TACTICAL.amber}
            strokeWidth={compact ? 5 : 7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {markerPoints.map(({ marker, point }, index) => {
          const [x, y] = project(point as LngLat);
          return (
            <Circle
              key={`marker-${index}`}
              cx={x}
              cy={y}
              r={compact ? 3.8 : 5}
              fill={marker.color || (marker.type === 'bailout' ? '#FFCF5A' : '#65D4FF')}
              stroke="#05090D"
              strokeWidth="1.5"
            />
          );
        })}
        {userPoint ? (
          <>
            <Circle
              cx={project(userPoint)[0]}
              cy={project(userPoint)[1]}
              r={compact ? 9 : 12}
              fill="rgba(101,212,255,0.14)"
              stroke="rgba(255,255,255,0.76)"
              strokeWidth="2"
            />
            <Circle
              cx={project(userPoint)[0]}
              cy={project(userPoint)[1]}
              r={compact ? 4 : 5.5}
              fill="#65D4FF"
              stroke="#05090D"
              strokeWidth="1.5"
            />
          </>
        ) : null}
      </Svg>
      <View style={[styles.statusPill, compact && styles.compactStatusPill]}>
        <Text style={styles.statusText} numberOfLines={1}>
          {statusLabel}
        </Text>
        {!!bootIssue && !compact ? (
          <Text style={styles.issueText} numberOfLines={1}>
            {bootIssue}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#05090D',
    zIndex: 4,
    elevation: 4,
  },
  transparentSurface: {
    backgroundColor: 'transparent',
  },
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05090D',
    paddingHorizontal: 24,
  },
  compactEmpty: {
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    maxWidth: '78%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(2, 6, 8, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 77, 0.2)',
  },
  compactStatusPill: {
    left: 7,
    bottom: 7,
    maxWidth: '58%',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  issueText: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
  },
});
