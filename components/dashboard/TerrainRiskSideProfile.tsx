import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { ECS, TACTICAL } from '../../lib/theme';
import {
  classifyTerrainCommandRisk,
  formatDistance,
  type DistanceUnit,
  type TerrainProfilePoint,
  type TerrainRiskLevel,
} from '../../lib/terrainRiskCommandProfile';
import { buildTerrainRiskChartSeries } from '../../lib/terrainRiskDashboardPresentation';
import {
  buildTerrainRiskReferenceEventForPoint,
  type TerrainRiskReferenceEvent,
} from '../../lib/terrainRiskReferenceEvents';
import {
  incrementTerrainMotionDiagnostic,
  recordTerrainScrubResponse,
} from '../../lib/terrainIntelligenceMotion';

const VIEWBOX_WIDTH = 340;
const VIEWBOX_HEIGHT = 154;

type ChartFrame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  baselineY: number;
};

const CHART_FRAME: ChartFrame = {
  left: 24,
  right: 16,
  top: 8,
  bottom: 24,
  width: VIEWBOX_WIDTH - 24 - 16,
  height: VIEWBOX_HEIGHT - 8 - 24,
  baselineY: VIEWBOX_HEIGHT - 24,
};

type ElevationBounds = {
  minElevationFeet: number;
  maxElevationFeet: number;
};

type ChartPoint = TerrainProfilePoint & {
  id: string;
  x: number;
  y: number;
};

type RiskSegment = {
  id: string;
  previous: ChartPoint;
  point: ChartPoint;
  riskScore: number;
  riskLevel: TerrainRiskLevel;
  color: string;
  bandOpacity: number;
  areaOpacity: number;
  strokeWidth: number;
};

type DistanceTick = {
  ratio: number;
  x: number;
  labelX: number;
  label: string;
  anchor: 'start' | 'middle' | 'end';
};

type ElevationTick = {
  value: number;
  y: number;
  label: string;
};

type ChartLayout = {
  width: number;
  height: number;
};

export type TerrainRiskReferenceAnchor = {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
};

type Props = {
  profile: TerrainProfilePoint[];
  totalDistanceMiles: number;
  unit: DistanceUnit;
  completedDistanceMiles?: number | null;
  transparentBackground?: boolean;
  interactive?: boolean;
  referenceEvents?: TerrainRiskReferenceEvent[];
  selectedReferenceEvent?: TerrainRiskReferenceEvent | null;
  onReferencePointPress?: (event: TerrainRiskReferenceEvent) => void;
  probeDistanceMiles?: number | null;
  onProbePointChange?: (point: TerrainProfilePoint | null) => void;
  selectedDistanceRange?: { startDistanceMiles: number; endDistanceMiles: number } | null;
  animationEnabled?: boolean;
  profileAnimationKey?: string | null;
  riskPulseKey?: string | null;
};

const RISK_COLORS: Record<TerrainRiskLevel, string> = {
  low: TACTICAL.amber,
  moderate: ECS.warning,
  high: TACTICAL.danger,
};

const CONTOUR_PATHS = [
  'M 18 30 C 76 12 108 42 162 24 S 252 10 324 28',
  'M 14 58 C 70 42 118 68 170 52 S 260 42 328 58',
  'M 18 89 C 86 72 126 101 184 82 S 262 77 326 93',
  'M 30 126 C 93 109 139 133 191 117 S 270 107 330 123',
];
const TERRAIN_REFERENCE_MARKER_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const TERRAIN_REFERENCE_MARKER_HALF_SIZE = 20;
const PROFILE_REVEAL_LENGTH = 1000;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTerrainCommandRiskColor(level: TerrainRiskLevel | 'neutral'): string {
  if (level === 'neutral') return TACTICAL.textMuted;
  return RISK_COLORS[level];
}

export function getTerrainCommandRiskColorForScore(score: number): string {
  return getTerrainCommandRiskColor(classifyTerrainCommandRisk(score));
}

export function scaleTerrainDistanceToX(
  distanceMiles: number,
  totalDistanceMiles: number,
  frame: ChartFrame = CHART_FRAME,
): number {
  const safeTotal = Math.max(0.1, totalDistanceMiles);
  const normalizedDistance = clampNumber(distanceMiles, 0, safeTotal);
  return frame.left + (normalizedDistance / safeTotal) * frame.width;
}

export function scaleTerrainElevationToY(
  elevationFeet: number,
  bounds: ElevationBounds,
  frame: ChartFrame = CHART_FRAME,
): number {
  const range = Math.max(100, bounds.maxElevationFeet - bounds.minElevationFeet);
  const normalizedElevation = clampNumber(
    elevationFeet,
    bounds.minElevationFeet,
    bounds.maxElevationFeet,
  );
  return frame.top + frame.height - ((normalizedElevation - bounds.minElevationFeet) / range) * frame.height;
}

function roundElevationTick(value: number): number {
  return Math.round(value / 100) * 100;
}

function formatElevationLabel(value: number): string {
  const rounded = Math.round(value);
  return Math.abs(rounded) >= 1000 ? `${(rounded / 1000).toFixed(1)}k` : String(rounded);
}

function formatTerrainHazardKind(kind: NonNullable<TerrainProfilePoint['hazardKinds']>[number]): string {
  switch (kind) {
    case 'washout_watch':
      return 'Washout watch';
    case 'tipover_watch':
      return 'Tipover watch';
    case 'rapid_elevation_change':
      return 'Rapid elevation change';
    case 'steep_grade':
      return 'Steep grade';
    case 'high_elevation':
      return 'High elevation';
    default:
      return 'Terrain change';
  }
}

function isTerrainProfileReferencePoint(point: TerrainProfilePoint): boolean {
  return (
    point.riskLevel === 'high' ||
    point.thermalBand === 'hot' ||
    (point.hazardKinds?.length ?? 0) > 0
  );
}

function formatTerrainReferenceReason(point: TerrainProfilePoint): string {
  const hazardLabels = (point.hazardKinds ?? []).map(formatTerrainHazardKind);
  if (hazardLabels.length > 0) return hazardLabels.slice(0, 2).join(' / ');
  if (point.thermalBand === 'hot') return 'Hot terrain segment';
  if (point.riskLevel === 'high') return 'High terrain risk score';
  return 'Terrain risk change';
}

function formatReferenceMarkerAccessibilityLabel(
  referenceEvent: TerrainRiskReferenceEvent | null,
  point: TerrainProfilePoint,
): string {
  if (!referenceEvent) return formatTerrainReferenceReason(point);
  const locationLabel = referenceEvent.distanceAheadMiles > 0
    ? `${referenceEvent.distanceAheadMiles.toFixed(1)} miles ahead`
    : `at mile ${referenceEvent.distanceMiles.toFixed(1)}`;
  return `${referenceEvent.title}, ${locationLabel}. ${referenceEvent.detail}`;
}

function buildElevationBounds(profile: TerrainProfilePoint[]): ElevationBounds {
  const elevations = profile.map((point) => point.elevationFeet);
  const rawMinElevation = Math.min(...elevations);
  const rawMaxElevation = Math.max(...elevations);
  const elevationRange = Math.max(120, rawMaxElevation - rawMinElevation);
  const padding = Math.max(80, elevationRange * 0.16);
  return {
    minElevationFeet: rawMinElevation - padding,
    maxElevationFeet: rawMaxElevation + padding,
  };
}

export function getTerrainRiskReferenceAnchor(
  profile: TerrainProfilePoint[],
  totalDistanceMiles: number,
  referenceEvent: TerrainRiskReferenceEvent | null,
): TerrainRiskReferenceAnchor | null {
  if (!referenceEvent || profile.length < 2 || totalDistanceMiles <= 0) return null;
  const matchedPoint = profile.find((point) =>
    Math.abs(point.distanceMiles - referenceEvent.distanceMiles) <= 0.05);
  const distanceMiles = matchedPoint?.distanceMiles ?? referenceEvent.distanceMiles;
  const elevationFeet = matchedPoint?.elevationFeet ?? referenceEvent.elevationFeet;
  if (!Number.isFinite(distanceMiles) || !Number.isFinite(elevationFeet)) return null;

  const bounds = buildElevationBounds(profile);
  const x = scaleTerrainDistanceToX(distanceMiles, totalDistanceMiles);
  const y = scaleTerrainElevationToY(elevationFeet, bounds);

  return {
    x,
    y,
    xPercent: (x / VIEWBOX_WIDTH) * 100,
    yPercent: (y / VIEWBOX_HEIGHT) * 100,
  };
}

function buildLinePath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

function buildAreaPath(points: ChartPoint[], frame: ChartFrame = CHART_FRAME): string {
  const linePath = buildLinePath(points);
  return `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${frame.baselineY} L ${points[0].x.toFixed(1)} ${frame.baselineY} Z`;
}

function buildSegmentAreaPath(segment: RiskSegment, frame: ChartFrame = CHART_FRAME): string {
  return [
    `M ${segment.previous.x.toFixed(1)} ${frame.baselineY}`,
    `L ${segment.previous.x.toFixed(1)} ${segment.previous.y.toFixed(1)}`,
    `L ${segment.point.x.toFixed(1)} ${segment.point.y.toFixed(1)}`,
    `L ${segment.point.x.toFixed(1)} ${frame.baselineY}`,
    'Z',
  ].join(' ');
}

function buildSegmentLinePath(segment: RiskSegment): string {
  return `M ${segment.previous.x.toFixed(1)} ${segment.previous.y.toFixed(1)} L ${segment.point.x.toFixed(1)} ${segment.point.y.toFixed(1)}`;
}

function buildDistanceTicks(totalDistanceMiles: number, unit: DistanceUnit): DistanceTick[] {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const x = CHART_FRAME.left + ratio * CHART_FRAME.width;
    return {
      ratio,
      x,
      labelX: ratio === 1 ? x - 10 : ratio === 0 ? x + 2 : x,
      label: formatDistance(totalDistanceMiles * ratio, unit).replace(` ${unit}`, ''),
      anchor: ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle',
    };
  });
}

function buildElevationTicks(bounds: ElevationBounds): ElevationTick[] {
  const top = roundElevationTick(bounds.maxElevationFeet);
  const middle = roundElevationTick((bounds.maxElevationFeet + bounds.minElevationFeet) / 2);
  const bottom = roundElevationTick(bounds.minElevationFeet);
  const values = Array.from(new Set([top, middle, bottom]));
  return values.map((value) => ({
    value,
    y: scaleTerrainElevationToY(value, bounds),
    label: formatElevationLabel(value),
  }));
}

function riskOpacity(score: number, base: number, spread: number): number {
  return base + clampNumber(score, 0, 100) / 100 * spread;
}

function buildRiskSegments(points: ChartPoint[]): RiskSegment[] {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const riskScore = Math.round((previous.riskScore + point.riskScore) / 2);
    const riskLevel = classifyTerrainCommandRisk(riskScore);
    return {
      id: `${previous.distanceMiles}-${point.distanceMiles}-${riskScore}`,
      previous,
      point,
      riskScore,
      riskLevel,
      color: getTerrainCommandRiskColorForScore(riskScore),
      bandOpacity: riskLevel === 'high'
        ? riskOpacity(riskScore, 0.12, 0.12)
        : riskLevel === 'moderate'
          ? riskOpacity(riskScore, 0.06, 0.08)
          : 0.045,
      areaOpacity: riskLevel === 'high'
        ? riskOpacity(riskScore, 0.20, 0.10)
        : riskLevel === 'moderate'
          ? riskOpacity(riskScore, 0.12, 0.08)
          : 0.09,
      strokeWidth: riskLevel === 'high' ? 3.2 : riskLevel === 'moderate' ? 2.8 : 2.4,
    };
  });
}

function buildCurrentRouteMarkerPoint(
  points: ChartPoint[],
  totalDistanceMiles: number,
  completedDistanceMiles?: number | null,
): ChartPoint | null {
  if (!Number.isFinite(completedDistanceMiles ?? NaN) || points.length < 2 || totalDistanceMiles <= 0) {
    return null;
  }

  const progressMiles = clampNumber(completedDistanceMiles ?? 0, 0, totalDistanceMiles);
  const nextIndex = points.findIndex((point) => point.distanceMiles >= progressMiles);
  if (nextIndex <= 0) {
    const first = points[0];
    return {
      ...first,
      id: 'current-route-position',
      distanceMiles: progressMiles,
    };
  }
  if (nextIndex === -1) {
    const last = points[points.length - 1];
    return {
      ...last,
      id: 'current-route-position',
      distanceMiles: progressMiles,
    };
  }

  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const segmentMiles = Math.max(0.001, next.distanceMiles - previous.distanceMiles);
  const ratio = clampNumber((progressMiles - previous.distanceMiles) / segmentMiles, 0, 1);
  const elevationFeet = previous.elevationFeet + (next.elevationFeet - previous.elevationFeet) * ratio;
  const riskScore = previous.riskScore + (next.riskScore - previous.riskScore) * ratio;
  const gradePercent = (previous.gradePercent ?? 0) + ((next.gradePercent ?? 0) - (previous.gradePercent ?? 0)) * ratio;

  return {
    ...next,
    id: 'current-route-position',
    distanceMiles: progressMiles,
    elevationFeet,
    gradePercent,
    riskScore,
    riskLevel: classifyTerrainCommandRisk(riskScore),
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio,
  };
}

function buildElevationProbePoint(
  points: ChartPoint[],
  totalDistanceMiles: number,
  distanceMiles: number | null,
): ChartPoint | null {
  if (!Number.isFinite(distanceMiles ?? NaN) || points.length < 2 || totalDistanceMiles <= 0) {
    return null;
  }

  const probeMiles = clampNumber(distanceMiles ?? 0, 0, totalDistanceMiles);
  const nextIndex = points.findIndex((point) => point.distanceMiles >= probeMiles);
  if (nextIndex <= 0) {
    const first = points[0];
    return {
      ...first,
      id: 'elevation-probe',
      distanceMiles: probeMiles,
      x: scaleTerrainDistanceToX(probeMiles, totalDistanceMiles),
    };
  }
  if (nextIndex === -1) {
    const last = points[points.length - 1];
    return {
      ...last,
      id: 'elevation-probe',
      distanceMiles: probeMiles,
      x: scaleTerrainDistanceToX(probeMiles, totalDistanceMiles),
    };
  }

  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const segmentMiles = Math.max(0.001, next.distanceMiles - previous.distanceMiles);
  const ratio = clampNumber((probeMiles - previous.distanceMiles) / segmentMiles, 0, 1);
  const elevationFeet = previous.elevationFeet + (next.elevationFeet - previous.elevationFeet) * ratio;
  const riskScore = previous.riskScore + (next.riskScore - previous.riskScore) * ratio;
  const gradePercent = (previous.gradePercent ?? 0) + ((next.gradePercent ?? 0) - (previous.gradePercent ?? 0)) * ratio;

  return {
    ...next,
    id: 'elevation-probe',
    distanceMiles: probeMiles,
    elevationFeet,
    gradePercent,
    riskScore,
    riskLevel: classifyTerrainCommandRisk(riskScore),
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio,
  };
}

function formatElevationProbeLabel(elevationFeet: number): string {
  return `${Math.round(elevationFeet).toLocaleString('en-US')} ft`;
}

function toViewBoxPercent(value: number, total: number): `${number}%` {
  return `${(value / total) * 100}%`;
}

export default function TerrainRiskSideProfile({
  profile,
  totalDistanceMiles,
  unit,
  completedDistanceMiles = null,
  transparentBackground = false,
  interactive = false,
  referenceEvents = [],
  selectedReferenceEvent = null,
  onReferencePointPress,
  probeDistanceMiles = null,
  onProbePointChange,
  selectedDistanceRange = null,
  animationEnabled = false,
  profileAnimationKey = null,
  riskPulseKey = null,
}: Props) {
  const [chartLayout, setChartLayout] = useState<ChartLayout | null>(null);
  const [selectedProbeDistanceMiles, setSelectedProbeDistanceMiles] = useState<number | null>(null);
  const chart = useMemo(() => {
    if (profile.length < 2 || totalDistanceMiles <= 0) return null;
    incrementTerrainMotionDiagnostic('profileComputations');

    const chartSeries = buildTerrainRiskChartSeries(profile);
    const bounds = buildElevationBounds(chartSeries);
    const points = chartSeries.map((point, index) => ({
      ...point,
      id: `terrain-reference-${index}-${Math.round(point.distanceMiles * 100)}`,
      x: scaleTerrainDistanceToX(point.distanceMiles, totalDistanceMiles),
      y: scaleTerrainElevationToY(point.elevationFeet, bounds),
    }));
    const linePath = buildLinePath(points);
    const areaPath = buildAreaPath(points);
    incrementTerrainMotionDiagnostic('pathGenerations');
    const xTicks = buildDistanceTicks(totalDistanceMiles, unit);
    const yTicks = buildElevationTicks(bounds);
    const segments = buildRiskSegments(points);
    const peakPoint = points.reduce((peak, point) =>
      point.riskScore > peak.riskScore ? point : peak, points[0]);
    const highRiskSegments = segments.filter((segment) => segment.riskLevel === 'high');
    const referencePoints = points.filter(isTerrainProfileReferencePoint);
    return {
      areaPath,
      highRiskSegments,
      linePath,
      peakPoint,
      points,
      referencePoints,
      segments,
      xTicks,
      yTicks,
    };
  }, [profile, totalDistanceMiles, unit]);

  const revealProgress = useSharedValue(animationEnabled ? 0 : 1);
  const progressX = useSharedValue(CHART_FRAME.left);
  const progressY = useSharedValue(CHART_FRAME.baselineY);
  const probeX = useSharedValue(CHART_FRAME.left);
  const probeY = useSharedValue(CHART_FRAME.baselineY);
  const riskPulseOpacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(revealProgress);
    if (!animationEnabled || !profileAnimationKey) {
      revealProgress.value = 1;
      return;
    }
    revealProgress.value = 0;
    revealProgress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [animationEnabled, profileAnimationKey, revealProgress]);

  useEffect(() => {
    cancelAnimation(riskPulseOpacity);
    if (!animationEnabled || !riskPulseKey) {
      riskPulseOpacity.value = 0;
      return;
    }
    riskPulseOpacity.value = withSequence(
      withTiming(0.18, { duration: 140 }),
      withTiming(0, { duration: 300 }),
    );
  }, [animationEnabled, riskPulseKey, riskPulseOpacity]);

  const revealAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PROFILE_REVEAL_LENGTH * (1 - revealProgress.value),
  }));
  const revealClipAnimatedProps = useAnimatedProps(() => ({
    width: CHART_FRAME.width * revealProgress.value,
  }));
  const progressMarkerAnimatedProps = useAnimatedProps(() => ({
    cx: progressX.value,
    cy: progressY.value,
  }));
  const progressMarkerPathAnimatedProps = useAnimatedProps(() => {
    const x = Math.max(CHART_FRAME.left + 6, Math.min(VIEWBOX_WIDTH - CHART_FRAME.right - 6, progressX.value));
    const y = Math.max(CHART_FRAME.top + 6, Math.min(CHART_FRAME.baselineY - 6, progressY.value));
    return {
      d: `M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`,
    };
  });
  const probeLineAnimatedProps = useAnimatedProps(() => ({
    x1: probeX.value,
    x2: probeX.value,
  }));
  const probeMarkerAnimatedProps = useAnimatedProps(() => ({
    cx: probeX.value,
    cy: probeY.value,
  }));
  const riskPulseAnimatedProps = useAnimatedProps(() => ({
    opacity: riskPulseOpacity.value,
  }));

  const currentPositionPoint = useMemo(
    () => chart ? buildCurrentRouteMarkerPoint(chart.points, totalDistanceMiles, completedDistanceMiles) : null,
    [chart, completedDistanceMiles, totalDistanceMiles],
  );
  useEffect(() => {
    if (!currentPositionPoint) return;
    progressX.value = animationEnabled
      ? withTiming(currentPositionPoint.x, { duration: 220, easing: Easing.out(Easing.cubic) })
      : currentPositionPoint.x;
    progressY.value = animationEnabled
      ? withTiming(currentPositionPoint.y, { duration: 220, easing: Easing.out(Easing.cubic) })
      : currentPositionPoint.y;
  }, [animationEnabled, currentPositionPoint, progressX, progressY]);
  const completedProfileLinePath = useMemo(() => {
    if (!chart || !currentPositionPoint || completedDistanceMiles == null) return null;
    const completedPoints = chart.points.filter((point) => point.distanceMiles < completedDistanceMiles);
    completedPoints.push(currentPositionPoint);
    return completedPoints.length >= 2 ? buildLinePath(completedPoints) : null;
  }, [chart, completedDistanceMiles, currentPositionPoint]);

  const effectiveProbeDistanceMiles = probeDistanceMiles ?? selectedProbeDistanceMiles;
  const selectedProbePoint = useMemo(
    () => chart
      ? buildElevationProbePoint(chart.points, totalDistanceMiles, effectiveProbeDistanceMiles)
      : null,
    [chart, effectiveProbeDistanceMiles, totalDistanceMiles],
  );
  useEffect(() => {
    if (!selectedProbePoint) return;
    probeX.value = animationEnabled
      ? withTiming(selectedProbePoint.x, { duration: 100, easing: Easing.out(Easing.cubic) })
      : selectedProbePoint.x;
    probeY.value = animationEnabled
      ? withTiming(selectedProbePoint.y, { duration: 100, easing: Easing.out(Easing.cubic) })
      : selectedProbePoint.y;
  }, [animationEnabled, probeX, probeY, selectedProbePoint]);

  const updateElevationProbeFromLocation = useCallback((locationX: number) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!interactive || !chartLayout || chartLayout.width <= 0 || totalDistanceMiles <= 0) return;
    const viewBoxX = (locationX / chartLayout.width) * VIEWBOX_WIDTH;
    const ratio = clampNumber((viewBoxX - CHART_FRAME.left) / CHART_FRAME.width, 0, 1);
    const requestedDistance = ratio * totalDistanceMiles;
    const closest = profile.reduce<TerrainProfilePoint | null>(
      (best, point) => !best ||
        Math.abs(point.distanceMiles - requestedDistance) < Math.abs(best.distanceMiles - requestedDistance)
        ? point
        : best,
      null,
    );
    const snappedDistance = closest?.distanceMiles ?? requestedDistance;
    setSelectedProbeDistanceMiles(snappedDistance);
    onProbePointChange?.(closest);
    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordTerrainScrubResponse(finishedAt - startedAt);
  }, [chartLayout, interactive, onProbePointChange, profile, totalDistanceMiles]);

  const elevationProbeGesture = useMemo(
    () => Gesture.Pan()
      .enabled(interactive && Boolean(chartLayout?.width))
      .minDistance(0)
      .onBegin((event) => {
        runOnJS(updateElevationProbeFromLocation)(event.x);
      })
      .onUpdate((event) => {
        runOnJS(updateElevationProbeFromLocation)(event.x);
      }),
    [chartLayout?.width, interactive, updateElevationProbeFromLocation],
  );

  if (!chart) {
    return <View style={styles.emptyChart} />;
  }

  const getReferenceEventForPoint = (point: ChartPoint): TerrainRiskReferenceEvent | null => {
    const matchedEvent = referenceEvents.find((event) => Math.abs(event.distanceMiles - point.distanceMiles) <= 0.05);
    if (matchedEvent) return matchedEvent;
    const pointIndex = chart.points.findIndex((candidate) => candidate.id === point.id);
    return buildTerrainRiskReferenceEventForPoint({
      point,
      pointIndex: pointIndex >= 0 ? pointIndex : 0,
      completedDistanceMiles,
      includePassed: true,
    });
  };
  const handleReferenceMarkerPress = (point: ChartPoint) => {
    const referenceEvent = getReferenceEventForPoint(point);
    if (referenceEvent) {
      onReferencePointPress?.(referenceEvent);
    }
  };

  return (
    <GestureDetector gesture={elevationProbeGesture}>
    <View
      accessible={!interactive}
      accessibilityLabel={`Terrain side profile chart. Distance labels use ${unit === 'mi' ? 'miles' : 'kilometers'}. Elevation is shown in feet. Completed route is dimmed, remaining route is emphasized, and high risk route sections are highlighted.`}
      accessibilityRole="image"
      style={[styles.shell, transparentBackground ? styles.shellTransparent : null]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setChartLayout((current) =>
          current?.width === width && current?.height === height ? current : { width, height });
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio={interactive ? 'none' : 'xMidYMid meet'}
      >
        <Defs>
          <LinearGradient id="terrain-risk-area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TACTICAL.amber} stopOpacity="0.22" />
            <Stop offset="0.58" stopColor={ECS.warning} stopOpacity="0.10" />
            <Stop offset="1" stopColor={TACTICAL.danger} stopOpacity="0.02" />
          </LinearGradient>
          <LinearGradient id="terrain-risk-panel-glow" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={TACTICAL.amber} stopOpacity="0.00" />
            <Stop offset="0.48" stopColor={ECS.warning} stopOpacity="0.10" />
            <Stop offset="0.66" stopColor={TACTICAL.danger} stopOpacity="0.18" />
            <Stop offset="1" stopColor={TACTICAL.amber} stopOpacity="0.00" />
          </LinearGradient>
          <ClipPath id="terrain-profile-reveal-clip">
            <AnimatedRect
              animatedProps={revealClipAnimatedProps}
              x={CHART_FRAME.left}
              y={CHART_FRAME.top}
              height={CHART_FRAME.height}
            />
          </ClipPath>
        </Defs>

        {!transparentBackground ? (
          <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="rgba(0,0,0,0.96)" />
        ) : null}
        <Rect
          x={CHART_FRAME.left}
          y={CHART_FRAME.top}
          width={CHART_FRAME.width}
          height={CHART_FRAME.height}
          fill="url(#terrain-risk-panel-glow)"
        />

        {CONTOUR_PATHS.map((path, index) => (
          <Path
            key={`terrain-contour-${index}`}
            d={path}
            fill="none"
            stroke="rgba(212,160,23,0.08)"
            strokeWidth={0.8}
            strokeDasharray={index % 2 === 0 ? '5 7' : '3 8'}
          />
        ))}

        {chart.xTicks.map((tick) => (
          <Line
            key={`x-grid-${tick.ratio}`}
            x1={tick.x}
            y1={CHART_FRAME.top}
            x2={tick.x}
            y2={CHART_FRAME.baselineY}
            stroke="rgba(230,237,243,0.13)"
            strokeWidth={1}
          />
        ))}

        {chart.yTicks.map((tick) => (
          <Line
            key={`y-grid-${tick.value}`}
            x1={CHART_FRAME.left}
            y1={tick.y}
            x2={CHART_FRAME.left + CHART_FRAME.width}
            y2={tick.y}
            stroke="rgba(230,237,243,0.08)"
            strokeWidth={1}
          />
        ))}

        <G clipPath="url(#terrain-profile-reveal-clip)">
        {chart.segments.map((segment) => (
          <Rect
            key={`risk-band-${segment.id}`}
            x={Math.min(segment.previous.x, segment.point.x)}
            y={CHART_FRAME.top}
            width={Math.max(1, Math.abs(segment.point.x - segment.previous.x))}
            height={CHART_FRAME.height}
            fill={segment.color}
            opacity={segment.point.distanceMiles <= (completedDistanceMiles ?? -1) ? segment.bandOpacity * 0.36 : segment.bandOpacity}
          />
        ))}

        {chart.highRiskSegments.map((segment) => (
          <Rect
            key={`high-risk-glow-${segment.id}`}
            x={Math.min(segment.previous.x, segment.point.x) - 2}
            y={CHART_FRAME.top}
            width={Math.max(5, Math.abs(segment.point.x - segment.previous.x) + 4)}
            height={CHART_FRAME.height}
            fill={segment.color}
            opacity={0.12}
          />
        ))}

        <Path d={chart.areaPath} fill="url(#terrain-risk-area)" />

        {chart.segments.map((segment) => (
          <Path
            key={`segment-area-${segment.id}`}
            d={buildSegmentAreaPath(segment)}
            fill={segment.color}
            opacity={segment.point.distanceMiles <= (completedDistanceMiles ?? -1) ? segment.areaOpacity * 0.34 : segment.areaOpacity}
          />
        ))}

        {chart.highRiskSegments.map((segment) => (
          <Path
            key={`profile-glow-${segment.id}`}
            d={buildSegmentLinePath(segment)}
            stroke={segment.color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.18}
          />
        ))}

        {chart.segments.map((segment) => (
          <Path
            key={`profile-line-${segment.id}`}
            d={buildSegmentLinePath(segment)}
            stroke={segment.color}
            strokeWidth={segment.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={segment.point.distanceMiles <= (completedDistanceMiles ?? -1) ? 0.28 : 1}
          />
        ))}

        <AnimatedRect
          animatedProps={riskPulseAnimatedProps}
          x={CHART_FRAME.left}
          y={CHART_FRAME.top}
          width={CHART_FRAME.width}
          height={CHART_FRAME.height}
          fill={TACTICAL.danger}
          pointerEvents="none"
        />

        <Path
          d={chart.linePath}
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={revealAnimatedProps}
          d={chart.linePath}
          fill="none"
          stroke={TACTICAL.amber}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${PROFILE_REVEAL_LENGTH} ${PROFILE_REVEAL_LENGTH}`}
        />
        </G>

        {selectedDistanceRange ? (
          <Rect
            x={scaleTerrainDistanceToX(selectedDistanceRange.startDistanceMiles, totalDistanceMiles)}
            y={CHART_FRAME.top}
            width={Math.max(
              2,
              scaleTerrainDistanceToX(selectedDistanceRange.endDistanceMiles, totalDistanceMiles) -
                scaleTerrainDistanceToX(selectedDistanceRange.startDistanceMiles, totalDistanceMiles),
            )}
            height={CHART_FRAME.height}
            fill={TACTICAL.amber}
            opacity={0.16}
            stroke={TACTICAL.amber}
            strokeWidth={1.2}
          />
        ) : null}

        {completedProfileLinePath ? (
          <Path
            d={completedProfileLinePath}
            fill="none"
            stroke="rgba(141,151,158,0.78)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {chart.points.map((point, index) => (
          <Circle
            key={`profile-point-${index}`}
            cx={point.x}
            cy={point.y}
            r={point.riskLevel === 'high' ? 2.2 : 1.55}
            fill={getTerrainCommandRiskColor(point.riskLevel)}
            opacity={point.distanceMiles <= (completedDistanceMiles ?? -1)
              ? 0.28
              : point.riskLevel === 'high' ? 0.95 : 0.66}
          />
        ))}

        {currentPositionPoint ? (
          <G
            accessible
            accessibilityLabel="Current GPS position on terrain profile"
            accessibilityRole="image"
          >
            <AnimatedPath
              animatedProps={progressMarkerPathAnimatedProps}
              fill={TACTICAL.amber}
              stroke="rgba(3,6,8,0.94)"
              strokeWidth={1.2}
              opacity={0.98}
            />
            <AnimatedCircle
              animatedProps={progressMarkerAnimatedProps}
              r={2.4}
              fill="#FFFFFF"
              opacity={0.92}
            />
          </G>
        ) : null}

        {interactive && selectedProbePoint ? (
          <G
            testID="terrainRiskElevationProbe"
            accessible
            accessibilityLabel={`Elevation probe ${formatElevationProbeLabel(selectedProbePoint.elevationFeet)} at ${formatDistance(selectedProbePoint.distanceMiles, unit)}`}
            accessibilityRole="image"
          >
            <AnimatedLine
              animatedProps={probeLineAnimatedProps}
              y1={CHART_FRAME.top}
              y2={CHART_FRAME.baselineY}
              stroke={TACTICAL.amber}
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.72}
            />
            <AnimatedCircle
              animatedProps={probeMarkerAnimatedProps}
              r={8.4}
              fill={TACTICAL.amber}
              opacity={0.16}
            />
            <AnimatedCircle
              animatedProps={probeMarkerAnimatedProps}
              r={3.8}
              fill="#FFFFFF"
              stroke={TACTICAL.amber}
              strokeWidth={1.2}
            />
            <Rect
              x={clampNumber(selectedProbePoint.x - 36, CHART_FRAME.left, VIEWBOX_WIDTH - CHART_FRAME.right - 72)}
              y={clampNumber(selectedProbePoint.y - 34, CHART_FRAME.top + 2, CHART_FRAME.baselineY - 34)}
              width={72}
              height={25}
              rx={6}
              fill="rgba(2,5,7,0.92)"
              stroke="rgba(212,160,23,0.54)"
              strokeWidth={1}
            />
            <SvgText
              x={clampNumber(selectedProbePoint.x, CHART_FRAME.left + 36, VIEWBOX_WIDTH - CHART_FRAME.right - 36)}
              y={clampNumber(selectedProbePoint.y - 22, CHART_FRAME.top + 14, CHART_FRAME.baselineY - 22)}
              fill={TACTICAL.amber}
              fontSize="8"
              fontWeight="900"
              textAnchor="middle"
            >
              {formatElevationProbeLabel(selectedProbePoint.elevationFeet)}
            </SvgText>
            <SvgText
              x={clampNumber(selectedProbePoint.x, CHART_FRAME.left + 36, VIEWBOX_WIDTH - CHART_FRAME.right - 36)}
              y={clampNumber(selectedProbePoint.y - 11, CHART_FRAME.top + 25, CHART_FRAME.baselineY - 11)}
              fill={TACTICAL.textMuted}
              fontSize="7"
              fontWeight="800"
              textAnchor="middle"
            >
              {formatDistance(selectedProbePoint.distanceMiles, unit)}
            </SvgText>
          </G>
        ) : null}

        {chart.referencePoints.map((point) => {
          const color = getTerrainCommandRiskColor(point.riskLevel);
          const referenceEvent =
            referenceEvents.find((event) => Math.abs(event.distanceMiles - point.distanceMiles) <= 0.05) ?? null;
          const selected = referenceEvent?.id === selectedReferenceEvent?.id;
          return (
            <G key={`terrain-risk-reference-${point.id}`}>
              <Circle
                cx={point.x}
                cy={point.y}
                r={selected ? 7.4 : 5.2}
                fill={color}
                opacity={selected ? 0.28 : 0.16}
              />
              <Circle
                cx={point.x}
                cy={point.y}
                r={selected ? 3.9 : 3.1}
                fill={color}
                stroke="rgba(255,255,255,0.74)"
                strokeWidth={selected ? 1.3 : 0.9}
                opacity={0.98}
              />
              <Circle
                testID="terrainRiskReferenceMarker"
                accessible={interactive}
                accessibilityLabel={referenceEvent
                  ? `${referenceEvent.title} ${referenceEvent.distanceAheadMiles.toFixed(1)} miles ahead`
                  : formatTerrainReferenceReason(point)}
                cx={point.x}
                cy={point.y}
                r={interactive ? 12 : 0}
                fill="transparent"
              />
            </G>
          );
        })}

        <Circle
          cx={chart.peakPoint.x}
          cy={chart.peakPoint.y}
          r={5}
          fill={getTerrainCommandRiskColor(chart.peakPoint.riskLevel)}
          stroke="rgba(255,255,255,0.62)"
          strokeWidth={1}
        />
        <Circle
          cx={chart.peakPoint.x}
          cy={chart.peakPoint.y}
          r={9}
          fill={getTerrainCommandRiskColor(chart.peakPoint.riskLevel)}
          opacity={0.14}
        />

        <Line
          x1={CHART_FRAME.left}
          y1={CHART_FRAME.baselineY}
          x2={CHART_FRAME.left + CHART_FRAME.width}
          y2={CHART_FRAME.baselineY}
          stroke="rgba(212,160,23,0.38)"
          strokeWidth={1.2}
        />
        <Line
          x1={CHART_FRAME.left}
          y1={CHART_FRAME.top}
          x2={CHART_FRAME.left}
          y2={CHART_FRAME.baselineY}
          stroke="rgba(212,160,23,0.24)"
          strokeWidth={1}
        />

        {chart.yTicks.map((tick) => (
          <SvgText
            key={`y-label-${tick.value}`}
            x={2}
            y={tick.y + 3}
            fill={TACTICAL.textMuted}
            fontSize="8"
            fontWeight="700"
            textAnchor="start"
          >
            {tick.label}
          </SvgText>
        ))}

        {chart.xTicks.map((tick) => (
          <SvgText
            key={`x-label-${tick.ratio}`}
            x={tick.labelX}
            y={CHART_FRAME.baselineY + 13}
            fill={TACTICAL.textMuted}
            fontSize="8"
            fontWeight="700"
            textAnchor={tick.anchor}
          >
            {tick.label}
          </SvgText>
        ))}

        <SvgText
          x={VIEWBOX_WIDTH - 5}
          y={CHART_FRAME.baselineY + 13}
          fill={TACTICAL.amber}
          fontSize="8"
          fontWeight="900"
          textAnchor="end"
        >
          {unit.toUpperCase()}
        </SvgText>
        <SvgText
          x={CHART_FRAME.left + 2}
          y={CHART_FRAME.top + 8}
          fill={TACTICAL.amber}
          fontSize="8"
          fontWeight="900"
          textAnchor="start"
        >
          FT
        </SvgText>
      </Svg>
      {interactive ? (
        <View
          pointerEvents="none"
          testID="terrainRiskElevationProbeTouchLayer"
          style={styles.elevationProbeTouchLayer}
        />
      ) : null}
      {interactive ? chart.referencePoints.map((point) => {
        const referenceEvent = getReferenceEventForPoint(point);
        return (
          <TouchableOpacity
            key={`terrain-risk-reference-button-${point.id}`}
            testID="terrainRiskReferenceMarkerButton"
            activeOpacity={0.82}
            hitSlop={TERRAIN_REFERENCE_MARKER_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={formatReferenceMarkerAccessibilityLabel(referenceEvent, point)}
            onPress={() => handleReferenceMarkerPress(point)}
            style={[
              styles.terrainRiskReferenceButton,
              {
                left: chartLayout
                  ? clampNumber(
                      (point.x / VIEWBOX_WIDTH) * chartLayout.width,
                      TERRAIN_REFERENCE_MARKER_HALF_SIZE,
                      chartLayout.width - TERRAIN_REFERENCE_MARKER_HALF_SIZE,
                    )
                  : toViewBoxPercent(point.x, VIEWBOX_WIDTH),
                top: chartLayout
                  ? clampNumber(
                      (point.y / VIEWBOX_HEIGHT) * chartLayout.height,
                      TERRAIN_REFERENCE_MARKER_HALF_SIZE,
                      chartLayout.height - TERRAIN_REFERENCE_MARKER_HALF_SIZE,
                    )
                  : toViewBoxPercent(point.y, VIEWBOX_HEIGHT),
              },
            ]}
          />
        );
      }) : null}
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 92,
    alignSelf: 'stretch',
    position: 'relative',
    borderRadius: 9,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    backgroundColor: 'rgba(0,0,0,0.96)',
    shadowColor: TACTICAL.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  shellTransparent: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  terrainRiskReferenceButton: {
    position: 'absolute',
    zIndex: 12,
    elevation: 12,
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  elevationProbeTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    backgroundColor: 'transparent',
  },
  emptyChart: {
    flex: 1,
    minHeight: 92,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
});
