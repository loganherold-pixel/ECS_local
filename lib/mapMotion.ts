import type { GPSPosition } from './useGPSLocation';

export type MapMotionHeadingSource =
  | 'route-ahead'
  | 'course-over-ground'
  | 'gps-heading'
  | 'compass-heading'
  | 'fallback'
  | 'none';

export type MapMotionSampleRejectReason =
  | 'accepted'
  | 'invalid'
  | 'stale'
  | 'poor_accuracy'
  | 'teleport'
  | 'jitter';

export type MapMotionGpsSample = Pick<
  GPSPosition,
  'latitude' | 'longitude' | 'altitudeFt' | 'speedMph' | 'headingDeg' | 'accuracyM' | 'timestamp'
>;

export type VehicleGuidanceHeadingInput = {
  hasActiveGuidance?: boolean;
  routeAheadHeadingDeg?: number | null;
  courseOverGroundDeg?: number | null;
  gpsHeadingDeg?: number | null;
  compassHeadingDeg?: number | null;
  fallbackHeadingDeg?: number | null;
  speedMph?: number | null;
};

export type VehicleGuidanceHeading = {
  headingDeg: number | null;
  source: MapMotionHeadingSource;
};

export type GpsSampleMotionOptions = {
  maxAccuracyM?: number;
  maxTeleportSpeedMph?: number;
  jitterDistanceM?: number;
  lowSpeedJitterMph?: number;
};

export type GpsSampleMotionDecision = {
  accepted: boolean;
  reason: MapMotionSampleRejectReason;
  distanceM: number | null;
  impliedSpeedMph: number | null;
};

export type GpsMapDisplaySampleOptions = GpsSampleMotionOptions & {
  smoothingRatio?: number;
  allowTeleport?: boolean;
};

export type GpsMapDisplaySampleDecision = {
  sample: MapMotionGpsSample | null;
  accepted: boolean;
  reason: MapMotionSampleRejectReason;
  distanceM: number | null;
  impliedSpeedMph: number | null;
};

const EARTH_RADIUS_M = 6371008.8;
const MPS_TO_MPH = 2.2369362920544;
const DEFAULT_MAX_ACCURACY_M = 75;
const DEFAULT_MAX_TELEPORT_SPEED_MPH = 180;
const DEFAULT_JITTER_DISTANCE_M = 2.5;
const DEFAULT_GPS_MAP_DISPLAY_SMOOTHING_RATIO = 0.65;
const MOVING_SPEED_MPH = 3;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSample(sample: MapMotionGpsSample | null | undefined): sample is MapMotionGpsSample {
  return (
    !!sample &&
    isFiniteNumber(sample.latitude) &&
    isFiniteNumber(sample.longitude) &&
    Math.abs(sample.latitude) <= 90 &&
    Math.abs(sample.longitude) <= 180 &&
    isFiniteNumber(sample.timestamp)
  );
}

export function normalizeMotionBearingDeg(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function getMotionBearingDeltaDeg(a: number | null | undefined, b: number | null | undefined): number | null {
  const left = normalizeMotionBearingDeg(a);
  const right = normalizeMotionBearingDeg(b);
  if (left == null || right == null) return null;
  const diff = Math.abs(left - right) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function getMotionDistanceMeters(
  from: Pick<MapMotionGpsSample, 'latitude' | 'longitude'>,
  to: Pick<MapMotionGpsSample, 'latitude' | 'longitude'>,
): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const halfChord =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(halfChord), Math.sqrt(Math.max(0, 1 - halfChord)));
}

export function getMotionBearingBetweenSamples(
  from: Pick<MapMotionGpsSample, 'latitude' | 'longitude'> | null | undefined,
  to: Pick<MapMotionGpsSample, 'latitude' | 'longitude'> | null | undefined,
): number | null {
  if (!from || !to) return null;
  if (
    !isFiniteNumber(from.latitude) ||
    !isFiniteNumber(from.longitude) ||
    !isFiniteNumber(to.latitude) ||
    !isFiniteNumber(to.longitude)
  ) {
    return null;
  }
  if (getMotionDistanceMeters(from, to) < 1) return null;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeMotionBearingDeg(toDegrees(Math.atan2(y, x)));
}

export function resolveVehicleGuidanceHeading(input: VehicleGuidanceHeadingInput): VehicleGuidanceHeading {
  const routeAhead = normalizeMotionBearingDeg(input.routeAheadHeadingDeg);
  const courseOverGround = normalizeMotionBearingDeg(input.courseOverGroundDeg);
  const gpsHeading = normalizeMotionBearingDeg(input.gpsHeadingDeg);
  const compassHeading = normalizeMotionBearingDeg(input.compassHeadingDeg);
  const fallbackHeading = normalizeMotionBearingDeg(input.fallbackHeadingDeg);
  const speedMph = isFiniteNumber(input.speedMph) ? Math.max(0, input.speedMph) : null;
  const moving = speedMph == null || speedMph >= MOVING_SPEED_MPH;

  if (input.hasActiveGuidance && routeAhead != null) {
    return { headingDeg: routeAhead, source: 'route-ahead' };
  }

  if (moving && courseOverGround != null) {
    return { headingDeg: courseOverGround, source: 'course-over-ground' };
  }

  if (gpsHeading != null) {
    return { headingDeg: gpsHeading, source: 'gps-heading' };
  }

  if (compassHeading != null) {
    return { headingDeg: compassHeading, source: 'compass-heading' };
  }

  if (fallbackHeading != null) {
    return { headingDeg: fallbackHeading, source: 'fallback' };
  }

  return { headingDeg: null, source: 'none' };
}

export function resolveViewportMarkerHeadingDeg(input: {
  headingDeg: number | null | undefined;
  mapBearingDeg: number | null | undefined;
}): number | null {
  const heading = normalizeMotionBearingDeg(input.headingDeg);
  if (heading == null) return null;
  const mapBearing = normalizeMotionBearingDeg(input.mapBearingDeg) ?? 0;
  return normalizeMotionBearingDeg(heading - mapBearing);
}

export function classifyGpsSampleForMotion(
  previous: MapMotionGpsSample | null | undefined,
  next: MapMotionGpsSample | null | undefined,
  options: GpsSampleMotionOptions = {},
): GpsSampleMotionDecision {
  if (!isValidSample(next)) {
    return { accepted: false, reason: 'invalid', distanceM: null, impliedSpeedMph: null };
  }

  const maxAccuracyM = options.maxAccuracyM ?? DEFAULT_MAX_ACCURACY_M;
  if (isFiniteNumber(next.accuracyM) && next.accuracyM > maxAccuracyM) {
    return { accepted: false, reason: 'poor_accuracy', distanceM: null, impliedSpeedMph: null };
  }

  if (!isValidSample(previous)) {
    return { accepted: true, reason: 'accepted', distanceM: null, impliedSpeedMph: null };
  }

  if (next.timestamp <= previous.timestamp) {
    return { accepted: false, reason: 'stale', distanceM: null, impliedSpeedMph: null };
  }

  const distanceM = getMotionDistanceMeters(previous, next);
  const elapsedSeconds = Math.max(0.001, (next.timestamp - previous.timestamp) / 1000);
  const impliedSpeedMph = (distanceM / elapsedSeconds) * MPS_TO_MPH;
  const maxTeleportSpeedMph = options.maxTeleportSpeedMph ?? DEFAULT_MAX_TELEPORT_SPEED_MPH;
  if (impliedSpeedMph > maxTeleportSpeedMph) {
    return { accepted: false, reason: 'teleport', distanceM, impliedSpeedMph };
  }

  const jitterDistanceM = options.jitterDistanceM ?? DEFAULT_JITTER_DISTANCE_M;
  if (distanceM < jitterDistanceM) {
    return { accepted: false, reason: 'jitter', distanceM, impliedSpeedMph };
  }

  return { accepted: true, reason: 'accepted', distanceM, impliedSpeedMph };
}

export function smoothGpsSample(
  previous: MapMotionGpsSample,
  next: MapMotionGpsSample,
  ratio: number,
): MapMotionGpsSample {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const mix = (a: number, b: number) => a + (b - a) * clampedRatio;
  const altitudeFt =
    isFiniteNumber(previous.altitudeFt) && isFiniteNumber(next.altitudeFt)
      ? mix(previous.altitudeFt, next.altitudeFt)
      : next.altitudeFt ?? previous.altitudeFt ?? null;

  return {
    latitude: mix(previous.latitude, next.latitude),
    longitude: mix(previous.longitude, next.longitude),
    altitudeFt: altitudeFt == null ? null : Math.round(altitudeFt),
    speedMph: next.speedMph ?? previous.speedMph ?? null,
    headingDeg: next.headingDeg ?? previous.headingDeg ?? null,
    accuracyM: next.accuracyM ?? previous.accuracyM ?? null,
    timestamp: Math.round(mix(previous.timestamp, next.timestamp)),
  };
}

export function resolveGpsMapDisplaySample(
  previous: MapMotionGpsSample | null | undefined,
  next: MapMotionGpsSample | null | undefined,
  options: GpsMapDisplaySampleOptions = {},
): GpsMapDisplaySampleDecision {
  const decision = classifyGpsSampleForMotion(previous, next, options);
  if (!decision.accepted && decision.reason === 'teleport' && options.allowTeleport && isValidSample(next)) {
    return {
      sample: next,
      accepted: true,
      reason: 'accepted',
      distanceM: decision.distanceM,
      impliedSpeedMph: decision.impliedSpeedMph,
    };
  }

  if (!decision.accepted || !next) {
    return {
      sample: previous ?? null,
      accepted: false,
      reason: decision.reason,
      distanceM: decision.distanceM,
      impliedSpeedMph: decision.impliedSpeedMph,
    };
  }

  const sample = previous
    ? smoothGpsSample(previous, next, options.smoothingRatio ?? DEFAULT_GPS_MAP_DISPLAY_SMOOTHING_RATIO)
    : next;

  return {
    sample,
    accepted: true,
    reason: 'accepted',
    distanceM: decision.distanceM,
    impliedSpeedMph: decision.impliedSpeedMph,
  };
}
