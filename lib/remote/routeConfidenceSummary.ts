import { computeRouteConfidence } from './remoteEngine';
import type { RemoteRoutePoint, RemoteSegmentFeatureInput } from './mapOverlay';
import type { RouteConfidenceStatus } from './types';

export type NavigateRouteConfidenceSummary = {
  confidence: number;
  status: RouteConfidenceStatus;
  statusColor: string;
  chipLabel: string;
  headline: string;
  subtext: string | null;
  avgRemote: number;
  nextSignalMi?: number;
};

export type BuildNavigateRouteConfidenceSummaryInput = {
  routePoints?: RemoteRoutePoint[];
  segmentFeatures?: RemoteSegmentFeatureInput[] | null;
  remotenessScore?: number | null;
  cacheReady: boolean;
  powerHours?: number | null;
  weatherRisk?: number | null;
  teamCount?: number | null;
};

const STATUS_COLORS: Record<RouteConfidenceStatus, string> = {
  green: '#66BB6A',
  amber: '#F2C24D',
  red: '#C66A4A',
};

const REMOTE_LEVEL_SCORES: Record<string, number> = {
  red: 88,
  extreme: 88,
  wilderness: 88,
  yellow: 64,
  remote: 64,
  backcountry: 64,
  moderate: 42,
  rural: 42,
  green: 18,
  low: 18,
  urban: 18,
  suburban: 18,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function scoreForSegment(segment: RemoteSegmentFeatureInput, fallbackScore: number): number {
  const level = String(segment.remoteness_level ?? segment.risk_level ?? '').toLowerCase();
  if (level && REMOTE_LEVEL_SCORES[level] != null) return REMOTE_LEVEL_SCORES[level];
  return clamp(isFiniteNumber(segment.risk_score) ? segment.risk_score : fallbackScore);
}

function haversineMiles(a: [number, number], b: [number, number]): number {
  const earthRadiusMiles = 3958.7613;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function segmentMiles(coordinates?: [number, number][]): number {
  const coords = coordinates ?? [];
  let miles = 0;
  for (let index = 1; index < coords.length; index += 1) {
    miles += haversineMiles(coords[index - 1], coords[index]);
  }
  return miles;
}

function routeMiles(points?: RemoteRoutePoint[]): number {
  const coords = (points ?? [])
    .filter((point) => isFiniteNumber(point.lat) && isFiniteNumber(point.lng))
    .map((point): [number, number] => [point.lng, point.lat]);
  return segmentMiles(coords);
}

function buildRemoteProfile(input: BuildNavigateRouteConfidenceSummaryInput): {
  avgRemote: number;
  deadZoneLengthMi: number;
  distanceToDeadZoneMi: number | null;
} {
  const fallbackScore = clamp(isFiniteNumber(input.remotenessScore) ? input.remotenessScore : 35);
  const features = (input.segmentFeatures ?? []).filter(
    (segment) => (segment.coordinates ?? []).length > 1,
  );

  if (features.length === 0) {
    const miles = routeMiles(input.routePoints);
    const inferredDeadZoneLengthMi = fallbackScore >= 76 && miles > 0 ? miles * 0.35 : 0;
    return {
      avgRemote: fallbackScore,
      deadZoneLengthMi: inferredDeadZoneLengthMi,
      distanceToDeadZoneMi: inferredDeadZoneLengthMi > 0 ? 0 : null,
    };
  }

  let weightedScore = 0;
  let totalMiles = 0;
  let distanceBeforeDead = 0;
  let deadZoneLength = 0;
  let hasEnteredDeadZone = false;
  let hasExitedDeadZone = false;

  for (const feature of features) {
    const miles = Math.max(segmentMiles(feature.coordinates), 0.05);
    const score = scoreForSegment(feature, fallbackScore);
    weightedScore += score * miles;
    totalMiles += miles;

    if (score >= 76 && !hasExitedDeadZone) {
      hasEnteredDeadZone = true;
      deadZoneLength += miles;
    } else if (!hasEnteredDeadZone) {
      distanceBeforeDead += miles;
    } else {
      hasExitedDeadZone = true;
    }
  }

  return {
    avgRemote: totalMiles > 0 ? clamp(weightedScore / totalMiles) : fallbackScore,
    deadZoneLengthMi: deadZoneLength,
    distanceToDeadZoneMi: hasEnteredDeadZone ? distanceBeforeDead : null,
  };
}

function formatMiles(value: number): string {
  if (value < 1) return '<1 mi';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function headlineForStatus(status: RouteConfidenceStatus, avgRemote: number): string {
  if (status === 'red' || avgRemote >= 76) return 'High Remoteness - Prepare';
  if (status === 'amber' || avgRemote >= 51) return 'Remoteness Watch';
  return 'Route Confidence Ready';
}

function subtextForSignal(args: {
  status: RouteConfidenceStatus;
  distanceToDeadZoneMi: number | null;
  deadZoneLengthMi: number;
  avgRemote: number;
}): string | null {
  if (args.deadZoneLengthMi > 0 && (args.distanceToDeadZoneMi ?? 0) <= 0.2) {
    return `No signal expected for ${formatMiles(args.deadZoneLengthMi)}`;
  }
  if (args.deadZoneLengthMi > 0 && args.distanceToDeadZoneMi != null) {
    return `Signal in ~${formatMiles(args.distanceToDeadZoneMi)}`;
  }
  if (args.status === 'red' || args.avgRemote >= 76) {
    return 'Prepare offline maps and power before departure';
  }
  return null;
}

export function buildNavigateRouteConfidenceSummary(
  input: BuildNavigateRouteConfidenceSummaryInput,
): NavigateRouteConfidenceSummary {
  const remoteProfile = buildRemoteProfile(input);
  const nextSignalMi =
    remoteProfile.deadZoneLengthMi > 0
      ? remoteProfile.distanceToDeadZoneMi != null && remoteProfile.distanceToDeadZoneMi > 0.2
        ? remoteProfile.distanceToDeadZoneMi
        : remoteProfile.deadZoneLengthMi
      : undefined;
  const result = computeRouteConfidence({
    avgRemote: remoteProfile.avgRemote,
    cacheReady: input.cacheReady,
    powerHours: isFiniteNumber(input.powerHours) ? input.powerHours : 0,
    weatherRisk: isFiniteNumber(input.weatherRisk) ? clamp(input.weatherRisk, 0, 1) : 0,
    teamCount: isFiniteNumber(input.teamCount) ? input.teamCount : 1,
    nextSignalMi,
  });

  return {
    confidence: result.confidence,
    status: result.status,
    statusColor: STATUS_COLORS[result.status],
    chipLabel: `Route Confidence: ${result.confidence}%`,
    headline: headlineForStatus(result.status, remoteProfile.avgRemote),
    subtext: subtextForSignal({
      status: result.status,
      distanceToDeadZoneMi: remoteProfile.distanceToDeadZoneMi,
      deadZoneLengthMi: remoteProfile.deadZoneLengthMi,
      avgRemote: remoteProfile.avgRemote,
    }),
    avgRemote: Math.round(remoteProfile.avgRemote),
    nextSignalMi: result.nextSignalMi,
  };
}
