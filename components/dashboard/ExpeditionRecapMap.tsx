import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
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

function RecapMapCalloutView({ callout }: { callout: RecapMapCallout }) {
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
      <View
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
      </View>
    </React.Fragment>
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
  const recapReference = recap?.routeSummary.routeGeometryReference ?? null;
  const model = useMemo(
    () => buildRecapMapModel(routeGeometry, routeBounds, startCoordinate, endCoordinate, recap, tripStartedAt, width),
    [endCoordinate, recap, routeBounds, routeGeometry, startCoordinate, tripStartedAt, width],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
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
          pointerEvents="none"
          accessibilityRole="image"
          accessibilityLabel="Completed expedition recap map"
        >
          <View style={styles.gridVerticalA} />
          <View style={styles.gridVerticalB} />
          <View style={styles.gridHorizontalA} />
          <View style={styles.gridHorizontalB} />
          <View style={styles.routeReferenceBadge}>
            <Text style={styles.routeReferenceText}>
              {recapReference ? 'COMPLETED ROUTE' : 'SAVED ROUTE'}
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
            <RecapMapCalloutView key={callout.id} callout={callout} />
          ))}

          {/* TODO Expedition Recap Map: add exploded route annotations after route annotation contracts exist. */}
          {/* TODO Expedition Recap Map: add export-ready map rendering and printable recap map layout. */}
          {/* TODO Expedition Recap Map: add badge stamp overlays for earned expedition badges. */}
          {/* TODO Expedition Recap Map: add weather layer callouts from recap weather snapshots. */}
          {/* TODO Expedition Recap Map: add terrain risk callout styling from recap terrain events. */}
        </View>
      ) : (
        <View style={styles.fallbackSurface}>
          <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={styles.fallbackTitle}>Route map unavailable.</Text>
          <Text style={styles.fallbackSubtext}>This expedition was saved without route geometry.</Text>
        </View>
      )}
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
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(242,194,77,0.18)',
  },
  routeSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#F2C24D',
  },
  routeDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(242,194,77,0.62)',
  },
  startMarker: {
    position: 'absolute',
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
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(242,194,77,0.36)',
  },
  calloutAnchor: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(7,10,13,0.92)',
  },
  calloutCard: {
    position: 'absolute',
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
