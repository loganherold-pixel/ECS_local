import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, {
  Circle,
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
import type { TerrainRiskReferenceEvent } from '../../lib/terrainRiskReferenceEvents';

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

type Props = {
  profile: TerrainProfilePoint[];
  totalDistanceMiles: number;
  unit: DistanceUnit;
  completedDistanceMiles?: number | null;
  transparentBackground?: boolean;
  interactive?: boolean;
  referenceEvents?: TerrainRiskReferenceEvent[];
  onReferencePointPress?: (event: TerrainRiskReferenceEvent) => void;
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

function formatFullElevationLabel(value: number): string {
  return `${Math.round(value).toLocaleString()} ft`;
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

function formatTerrainReferenceDetail(point: TerrainProfilePoint, unit: DistanceUnit): string {
  const grade = Number.isFinite(point.gradePercent)
    ? ` | grade ${Math.round(point.gradePercent ?? 0)}%`
    : '';
  return `${formatDistance(point.distanceMiles, unit).toUpperCase()} | ${formatFullElevationLabel(point.elevationFeet).toUpperCase()}${grade}`;
}

function getReferenceCalloutLayout(point: ChartPoint): { x: number; y: number; width: number; height: number } {
  const width = 154;
  const height = 45;
  const x = clampNumber(point.x > VIEWBOX_WIDTH - width - 10 ? point.x - width - 8 : point.x + 8, 4, VIEWBOX_WIDTH - width - 4);
  const y = clampNumber(point.y < height + 8 ? point.y + 10 : point.y - height - 8, 4, VIEWBOX_HEIGHT - height - 18);
  return { x, y, width, height };
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

function buildCurrentPositionMarkerPath(point: ChartPoint): string {
  const x = clampNumber(point.x, CHART_FRAME.left + 6, VIEWBOX_WIDTH - CHART_FRAME.right - 6);
  const y = clampNumber(point.y, CHART_FRAME.top + 6, CHART_FRAME.baselineY - 6);
  return [
    `M ${x.toFixed(1)} ${(y - 6).toFixed(1)}`,
    `L ${(x + 6).toFixed(1)} ${y.toFixed(1)}`,
    `L ${x.toFixed(1)} ${(y + 6).toFixed(1)}`,
    `L ${(x - 6).toFixed(1)} ${y.toFixed(1)}`,
    'Z',
  ].join(' ');
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
  onReferencePointPress,
}: Props) {
  const [selectedReferencePointId, setSelectedReferencePointId] = useState<string | null>(null);
  const chart = useMemo(() => {
    if (profile.length < 2 || totalDistanceMiles <= 0) return null;

    const bounds = buildElevationBounds(profile);
    const points = profile.map((point, index) => ({
      ...point,
      id: `terrain-reference-${index}-${Math.round(point.distanceMiles * 100)}`,
      x: scaleTerrainDistanceToX(point.distanceMiles, totalDistanceMiles),
      y: scaleTerrainElevationToY(point.elevationFeet, bounds),
    }));
    const linePath = buildLinePath(points);
    const areaPath = buildAreaPath(points);
    const xTicks = buildDistanceTicks(totalDistanceMiles, unit);
    const yTicks = buildElevationTicks(bounds);
    const segments = buildRiskSegments(points);
    const peakPoint = points.reduce((peak, point) =>
      point.riskScore > peak.riskScore ? point : peak, points[0]);
    const highRiskSegments = segments.filter((segment) => segment.riskLevel === 'high');
    const referencePoints = points.filter(isTerrainProfileReferencePoint);
    const currentPositionPoint = buildCurrentRouteMarkerPoint(points, totalDistanceMiles, completedDistanceMiles);

    return {
      areaPath,
      currentPositionPoint,
      highRiskSegments,
      linePath,
      peakPoint,
      points,
      referencePoints,
      segments,
      xTicks,
      yTicks,
    };
  }, [completedDistanceMiles, profile, totalDistanceMiles, unit]);

  if (!chart) {
    return <View style={styles.emptyChart} />;
  }

  const selectedReferencePoint =
    chart.referencePoints.find((point) => point.id === selectedReferencePointId) ?? null;
  const selectedReferenceLayout = selectedReferencePoint
    ? getReferenceCalloutLayout(selectedReferencePoint)
    : null;
  const getReferenceEventForPoint = (point: ChartPoint): TerrainRiskReferenceEvent | null =>
    referenceEvents.find((event) => Math.abs(event.distanceMiles - point.distanceMiles) <= 0.05) ?? null;
  const handleReferenceMarkerPress = (point: ChartPoint) => {
    const referenceEvent = getReferenceEventForPoint(point);
    setSelectedReferencePointId((current) => current === point.id ? null : point.id);
    if (referenceEvent) {
      onReferencePointPress?.(referenceEvent);
    }
  };

  return (
    <View
      accessible={!interactive}
      accessibilityLabel={`Terrain side profile chart. Distance labels use ${unit === 'mi' ? 'miles' : 'kilometers'}. Elevation is shown in feet. High risk route sections are highlighted.`}
      accessibilityRole="image"
      style={[styles.shell, transparentBackground ? styles.shellTransparent : null]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
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

        {chart.segments.map((segment) => (
          <Rect
            key={`risk-band-${segment.id}`}
            x={Math.min(segment.previous.x, segment.point.x)}
            y={CHART_FRAME.top}
            width={Math.max(1, Math.abs(segment.point.x - segment.previous.x))}
            height={CHART_FRAME.height}
            fill={segment.color}
            opacity={segment.bandOpacity}
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
            opacity={segment.areaOpacity}
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
          />
        ))}

        <Path
          d={chart.linePath}
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {chart.points.map((point, index) => (
          <Circle
            key={`profile-point-${index}`}
            cx={point.x}
            cy={point.y}
            r={point.riskLevel === 'high' ? 2.2 : 1.55}
            fill={getTerrainCommandRiskColor(point.riskLevel)}
            opacity={point.riskLevel === 'high' ? 0.95 : 0.66}
          />
        ))}

        {chart.currentPositionPoint ? (
          <G
            accessible
            accessibilityLabel="Current GPS position on terrain profile"
            accessibilityRole="image"
          >
            <Path
              d={buildCurrentPositionMarkerPath(chart.currentPositionPoint)}
              fill={TACTICAL.amber}
              stroke="rgba(3,6,8,0.94)"
              strokeWidth={1.2}
              opacity={0.98}
            />
            <Circle
              cx={chart.currentPositionPoint.x}
              cy={chart.currentPositionPoint.y}
              r={2.4}
              fill="#FFFFFF"
              opacity={0.92}
            />
          </G>
        ) : null}

        {chart.referencePoints.map((point) => {
          const color = getTerrainCommandRiskColor(point.riskLevel);
          const selected = selectedReferencePointId === point.id;
          const referenceEvent =
            referenceEvents.find((event) => Math.abs(event.distanceMiles - point.distanceMiles) <= 0.05) ?? null;
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
        {selectedReferencePoint && selectedReferenceLayout ? (
          <G>
            <Rect
              x={selectedReferenceLayout.x}
              y={selectedReferenceLayout.y}
              width={selectedReferenceLayout.width}
              height={selectedReferenceLayout.height}
              rx={6}
              fill="rgba(6, 10, 13, 0.94)"
              stroke={getTerrainCommandRiskColor(selectedReferencePoint.riskLevel)}
              strokeWidth={1}
              opacity={0.98}
            />
            <SvgText
              x={selectedReferenceLayout.x + 8}
              y={selectedReferenceLayout.y + 12}
              fill={TACTICAL.amber}
              fontSize="6.5"
              fontWeight="900"
            >
              Why this point was referenced
            </SvgText>
            <SvgText
              x={selectedReferenceLayout.x + 8}
              y={selectedReferenceLayout.y + 26}
              fill={getTerrainCommandRiskColor(selectedReferencePoint.riskLevel)}
              fontSize="8"
              fontWeight="900"
            >
              {formatTerrainReferenceReason(selectedReferencePoint)}
            </SvgText>
            <SvgText
              x={selectedReferenceLayout.x + 8}
              y={selectedReferenceLayout.y + 38}
              fill={TACTICAL.textMuted}
              fontSize="6.6"
              fontWeight="700"
            >
              {formatTerrainReferenceDetail(selectedReferencePoint, unit)}
            </SvgText>
          </G>
        ) : null}
      </Svg>
      {interactive ? chart.referencePoints.map((point) => {
        const referenceEvent = getReferenceEventForPoint(point);
        return (
          <TouchableOpacity
            key={`terrain-risk-reference-button-${point.id}`}
            testID="terrainRiskReferenceMarkerButton"
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={referenceEvent
              ? `${referenceEvent.title} ${referenceEvent.distanceAheadMiles.toFixed(1)} miles ahead`
              : formatTerrainReferenceReason(point)}
            onPress={() => handleReferenceMarkerPress(point)}
            style={[
              styles.terrainRiskReferenceButton,
              {
                left: toViewBoxPercent(point.x, VIEWBOX_WIDTH),
                top: toViewBoxPercent(point.y, VIEWBOX_HEIGHT),
              },
            ]}
          />
        );
      }) : null}
    </View>
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
    zIndex: 8,
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    borderRadius: 16,
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
