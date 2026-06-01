import { bailoutStore, type BailoutPoint, type BailoutType } from '../bailoutStore';
import type {
  ExpeditionReadinessConfidence,
  ExpeditionReadinessInput,
  ExpeditionReadinessRecoveryInput,
  ExpeditionReadinessRouteInput,
  ExpeditionReadinessVehicleInput,
  ExpeditionRouteRemoteness,
  ExpeditionRecoveryDifficulty,
} from './expeditionReadinessTypes';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type MaybeCoordinate = {
  latitude?: number | null;
  longitude?: number | null;
};

function isFiniteCoordinate(value: MaybeCoordinate | null | undefined): value is Coordinate {
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  return Boolean(
    value
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude != null
    && longitude != null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180,
  );
}

function haversineMiles(a: Coordinate, b: Coordinate): number {
  const radiusMiles = 3958.7613;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function roundMiles(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function formatMiles(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} mi`;
}

function pointCoordinate(point: BailoutPoint): Coordinate {
  return { latitude: point.lat, longitude: point.lng };
}

function nearestPoint(points: BailoutPoint[], origin: Coordinate, types?: BailoutType[]): { point: BailoutPoint; miles: number } | null {
  const candidates = types?.length ? points.filter((point) => types.includes(point.type)) : points;
  let nearest: { point: BailoutPoint; miles: number } | null = null;
  candidates.forEach((point) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    const miles = haversineMiles(origin, pointCoordinate(point));
    if (!nearest || miles < nearest.miles) {
      nearest = { point, miles };
    }
  });
  return nearest;
}

function deriveRouteRemoteness(args: {
  route?: ExpeditionReadinessRouteInput | null;
  nearestExitMiles: number | null;
  communicationsSignalConfidence?: ExpeditionReadinessConfidence | null;
}): ExpeditionRouteRemoteness {
  if (args.nearestExitMiles != null) {
    if (args.nearestExitMiles > 25) return 'high';
    if (args.nearestExitMiles > 10) return 'moderate';
    return 'low';
  }
  if (
    args.route?.riskLevel === 'critical'
    || args.route?.riskLevel === 'high'
    || args.route?.difficulty === 'technical'
    || args.route?.difficulty === 'hard'
    || (typeof args.route?.distanceMiles === 'number' && args.route.distanceMiles >= 40)
    || args.communicationsSignalConfidence === 'low'
  ) {
    return 'high';
  }
  if (args.route?.difficulty === 'moderate' || args.route?.riskLevel === 'moderate') {
    return 'moderate';
  }
  return 'unknown';
}

function deriveRecoveryDifficulty(args: {
  route?: ExpeditionReadinessRouteInput | null;
  remoteness: ExpeditionRouteRemoteness;
  nearestExitMiles: number | null;
  recoveryGearReady: boolean | null;
}): ExpeditionRecoveryDifficulty {
  if (
    args.route?.riskLevel === 'critical'
    || args.route?.difficulty === 'technical'
    || args.remoteness === 'high'
    || (args.nearestExitMiles != null && args.nearestExitMiles > 25)
  ) {
    return 'high';
  }
  if (
    args.route?.riskLevel === 'high'
    || args.route?.difficulty === 'hard'
    || args.remoteness === 'moderate'
    || args.recoveryGearReady === false
  ) {
    return 'moderate';
  }
  if (args.nearestExitMiles != null && args.nearestExitMiles <= 10) return 'low';
  return 'unknown';
}

function confidenceFrom(args: {
  hasLocation: boolean;
  bailoutCount: number;
  nearestExitMiles: number | null;
  routeRemoteness: ExpeditionRouteRemoteness;
  recoveryGearReady: boolean | null;
  communicationsSignalConfidence?: ExpeditionReadinessConfidence | null;
}): ExpeditionReadinessConfidence {
  if (!args.hasLocation || args.bailoutCount === 0 || args.routeRemoteness === 'unknown') return 'low';
  if (args.nearestExitMiles == null || args.recoveryGearReady == null || args.communicationsSignalConfidence === 'low') return 'medium';
  if (args.routeRemoteness === 'high') return 'medium';
  return 'high';
}

function recoveryPrep(args: {
  hasLocation: boolean;
  bailoutCount: number;
  recoveryGearReady: boolean | null;
  routeRemoteness: ExpeditionRouteRemoteness;
  communicationsSignalConfidence?: ExpeditionReadinessConfidence | null;
}): string[] {
  return [
    args.bailoutCount === 0 ? 'Add or review bailout points for this route.' : null,
    !args.hasLocation ? 'Acquire current coordinates before departure or incident response.' : null,
    args.recoveryGearReady !== true ? 'Confirm recovery gear in Fleet before committing to remote terrain.' : null,
    args.routeRemoteness === 'high' ? 'Review last turnaround and Plan B before entering the remote segment.' : null,
    args.communicationsSignalConfidence !== 'high' ? 'Confirm communications, satellite fallback, or team check-in plan.' : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildRecoveryReadinessInput(args: {
  route?: ExpeditionReadinessRouteInput | null;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  currentLocation?: ExpeditionReadinessInput['currentLocation'] | null;
  communications?: ExpeditionReadinessInput['communications'] | null;
  routeBailouts?: BailoutPoint[] | null;
  allBailouts?: BailoutPoint[] | null;
  capturedAt?: string | null;
} = {}): ExpeditionReadinessRecoveryInput | null {
  const origin = isFiniteCoordinate(args.currentLocation)
    ? { latitude: args.currentLocation.latitude, longitude: args.currentLocation.longitude }
    : null;
  const allBailouts = args.allBailouts ?? bailoutStore.getAll();
  const routeBailouts = args.routeBailouts ?? allBailouts;
  const bailoutCount = routeBailouts.length;
  const nearestAny = origin ? nearestPoint(routeBailouts, origin) : null;
  const nearestPavement = origin ? nearestPoint(routeBailouts, origin, ['pavement', 'alternate_route', 'staging']) : null;
  const nearestRoad = nearestPavement ?? nearestAny;
  const nearestFuel = origin ? nearestPoint(routeBailouts, origin, ['fuel']) : null;
  const nearestTown = origin ? nearestPoint(routeBailouts, origin, ['town']) : null;
  const nearestTrailhead = origin ? nearestPoint(routeBailouts, origin, ['staging']) : null;
  const nearestContact = origin ? nearestPoint(routeBailouts, origin, ['ranger', 'hospital']) : null;
  const nearestExitMiles = roundMiles(nearestRoad?.miles ?? nearestAny?.miles ?? null);
  const routeRemoteness = deriveRouteRemoteness({
    route: args.route,
    nearestExitMiles,
    communicationsSignalConfidence: args.communications?.signalConfidence,
  });
  const recoveryGearReady = args.activeVehicle?.recoveryGearReady ?? null;
  const recoveryDifficulty = deriveRecoveryDifficulty({
    route: args.route,
    remoteness: routeRemoteness,
    nearestExitMiles,
    recoveryGearReady,
  });
  const recoveryAccessConfidence = confidenceFrom({
    hasLocation: Boolean(origin),
    bailoutCount,
    nearestExitMiles,
    routeRemoteness,
    recoveryGearReady,
    communicationsSignalConfidence: args.communications?.signalConfidence,
  });
  const contactSummary = nearestContact
    ? `${nearestContact.point.title} indexed as ${nearestContact.point.type}. Verify official status before relying on it.`
    : 'Official emergency or ranger contact point is not confirmed. ECS does not invent official contacts.';
  const nearestSummary = nearestAny
    ? `${nearestAny.point.title} (${nearestAny.point.type}) is ${formatMiles(nearestAny.miles)} from current coordinates.`
    : origin
      ? 'No indexed bailout point is near the current route context; confidence is limited.'
      : 'Current coordinates are unavailable; nearest bailout cannot be calculated.';

  return {
    bailoutRoutesAvailable: bailoutCount > 0 ? true : origin ? false : null,
    nearestExitMiles,
    nearestPavedRoadMiles: roundMiles(nearestPavement?.miles ?? null),
    nearestKnownRoadMiles: roundMiles(nearestRoad?.miles ?? null),
    nearestKnownRoadLabel: nearestRoad?.point.title ?? null,
    nearestTrailheadMiles: roundMiles(nearestTrailhead?.miles ?? null),
    nearestFuelMiles: roundMiles(nearestFuel?.miles ?? null),
    nearestTownMiles: roundMiles(nearestTown?.miles ?? null),
    nearestSignalAreaMiles: null,
    officialContactPointAvailable: nearestContact ? true : null,
    officialContactPointSummary: contactSummary,
    routeBailoutOptionCount: bailoutCount,
    lastSafeTurnaroundMiles: null,
    recoveryDifficulty,
    currentCoordinatesAvailable: Boolean(origin),
    currentLatitude: origin?.latitude ?? null,
    currentLongitude: origin?.longitude ?? null,
    currentAccuracyMeters: args.currentLocation?.accuracyMeters ?? null,
    routeRemoteness,
    emergencyCoordinatePacketReady: Boolean(origin),
    emergencyCoordinatePacketSummary: origin
      ? `Coordinate packet can include current GPS${args.currentLocation?.accuracyMeters != null ? ` +/- ${Math.round(args.currentLocation.accuracyMeters)}m` : ''}.`
      : 'Coordinate packet is incomplete until current GPS is available.',
    nearestBailoutSummary: nearestSummary,
    recommendedPrep: recoveryPrep({
      hasLocation: Boolean(origin),
      bailoutCount,
      recoveryGearReady,
      routeRemoteness,
      communicationsSignalConfidence: args.communications?.signalConfidence,
    }),
    recoveryGearReady,
    recoveryAccessConfidence,
    source: bailoutCount > 0 || origin ? 'inferred' : 'missing',
    updatedAt: args.capturedAt ?? new Date().toISOString(),
    isInferred: bailoutCount > 0 || Boolean(origin),
  };
}
