import {
  DEFAULT_WEIGHTS,
  ROUTE_CONFIDENCE_STATUS_THRESHOLDS,
  SEGMENT_NORMALIZATION_LIMITS,
} from './constants';
import type {
  RouteConfidence,
  RouteConfidenceInputs,
  RouteConfidenceStatus,
  SegmentInputs,
  SegmentScore,
} from './types';

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalize01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeByLimit(value: number, limit: number): number {
  if (!Number.isFinite(value) || limit <= 0) return 0;
  return clamp(value / limit, 0, 1);
}

export function labelForSegmentScore(score: number): SegmentScore['label'] {
  const clamped = clamp(score);
  if (clamped <= 25) return 'D';
  if (clamped <= 50) return 'C';
  if (clamped <= 75) return 'B';
  return 'A';
}

function statusForRouteConfidence(confidence: number): RouteConfidenceStatus {
  if (confidence >= ROUTE_CONFIDENCE_STATUS_THRESHOLDS.green) return 'green';
  if (confidence >= ROUTE_CONFIDENCE_STATUS_THRESHOLDS.amber) return 'amber';
  return 'red';
}

export function scoreSegment(inputs: SegmentInputs): SegmentScore {
  const noSignal = normalize01(inputs.noSignalIdx);
  const road = normalizeByLimit(inputs.roadKm, SEGMENT_NORMALIZATION_LIMITS.roadKm);
  const town = normalizeByLimit(inputs.townKm, SEGMENT_NORMALIZATION_LIMITS.townKm);
  const elev = normalizeByLimit(inputs.elevRelief, SEGMENT_NORMALIZATION_LIMITS.elevRelief);
  const wildland = normalize01(inputs.wildland);
  const poi = 1 - normalizeByLimit(inputs.poiDensity, SEGMENT_NORMALIZATION_LIMITS.poiDensity);

  const weighted =
    noSignal * DEFAULT_WEIGHTS.noSignal +
    road * DEFAULT_WEIGHTS.road +
    town * DEFAULT_WEIGHTS.town +
    elev * DEFAULT_WEIGHTS.elev +
    wildland * DEFAULT_WEIGHTS.wildland +
    poi * DEFAULT_WEIGHTS.poi;

  const score = Math.round(clamp(weighted * 100));
  return {
    score,
    label: labelForSegmentScore(score),
  };
}

export function computeRouteConfidence({
  avgRemote,
  cacheReady,
  powerHours,
  weatherRisk,
  teamCount,
  nextSignalMi,
}: RouteConfidenceInputs): RouteConfidence {
  const normalizedRemote = clamp(avgRemote);
  const normalizedWeatherRisk = normalize01(weatherRisk);

  let confidence = 100;
  confidence -= normalizedRemote * 0.4;
  confidence -= normalizedWeatherRisk * 30;

  if (cacheReady) confidence += 10;
  if (Number.isFinite(powerHours) && powerHours > 8) confidence += 10;
  if (Number.isFinite(teamCount) && teamCount > 1) confidence += 5;

  const rounded = Math.round(clamp(confidence));
  return {
    confidence: rounded,
    nextSignalMi: Number.isFinite(nextSignalMi) ? nextSignalMi : undefined,
    status: statusForRouteConfidence(rounded),
  };
}
