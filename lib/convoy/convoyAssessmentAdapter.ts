import type {
  AssessmentConfidence,
  ConvoyMemberMovementStatus,
  ConvoyMemberSnapshot,
  ConvoySnapshot,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionGeoPoint,
} from '../expedition/operationalAssessmentTypes';
import {
  CONVOY_LOCATION_STALE_AFTER_MS,
  CONVOY_LOCATION_WATCH_AFTER_MS,
  classifyConvoyLocationStaleness,
} from './convoyTrackingThresholds';
import type {
  ConvoyMemberLocationRow,
  ConvoyMemberRow,
  ConvoyMovementStatus,
  ConvoyRealtimeConnectionStatus,
} from './convoyRealtimeService';

export type ConvoyAssessmentAdapterInput = {
  convoyId?: string | null;
  convoyName?: string | null;
  members: ConvoyMemberRow[];
  locations: ConvoyMemberLocationRow[];
  connectionStatus: ConvoyRealtimeConnectionStatus;
  recommendedRegroupPoint?: string | null;
  nowMs?: number;
};

const MPH_PER_MPS = 2.2369362921;
const EARTH_RADIUS_MILES = 3958.7613;

function livePoint<T>(
  value: T,
  updatedAt: string,
  options: {
    confidence?: AssessmentConfidence;
    isStale?: boolean;
    notes?: string | null;
    staleAfterMinutes?: number;
  } = {},
): ExpeditionDataPoint<T> {
  const confidence = options.confidence ?? 'high';
  return {
    value,
    source: 'liveGps',
    updatedAt,
    confidence,
    reliability: confidence,
    isStale: options.isStale,
    notes: options.notes ?? null,
    staleAfterMinutes: options.staleAfterMinutes,
  };
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function updatedTime(row: ConvoyMemberLocationRow): number {
  const captured = Date.parse(row.captured_at ?? '');
  if (Number.isFinite(captured)) return captured;
  const updated = Date.parse(row.updated_at ?? '');
  return Number.isFinite(updated) ? updated : 0;
}

function latestLocationByMember(
  members: ConvoyMemberRow[],
  locations: ConvoyMemberLocationRow[],
): Map<string, ConvoyMemberLocationRow> {
  const activeMemberIds = new Set(members.filter((member) => !member.revoked_at).map((member) => member.id));
  const latest = new Map<string, ConvoyMemberLocationRow>();

  for (const row of locations) {
    if (!activeMemberIds.has(row.member_id)) continue;
    if (!validCoordinate(row.latitude) || !validCoordinate(row.longitude)) continue;
    const existing = latest.get(row.member_id);
    if (!existing || updatedTime(row) >= updatedTime(existing)) {
      latest.set(row.member_id, row);
    }
  }

  return latest;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineMiles(a: ExpeditionGeoPoint, b: ExpeditionGeoPoint): number {
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toGeoPoint(row: ConvoyMemberLocationRow): ExpeditionGeoPoint {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: typeof row.accuracy_meters === 'number' ? row.accuracy_meters : null,
  };
}

function toMovementStatus(status: ConvoyMovementStatus | null | undefined): ConvoyMemberMovementStatus {
  return status ?? 'unknown';
}

function ageMs(row: ConvoyMemberLocationRow, nowMs: number): number {
  const timestamp = updatedTime(row);
  return timestamp > 0 ? Math.max(0, nowMs - timestamp) : Number.POSITIVE_INFINITY;
}

function locationLabel(row: ConvoyMemberLocationRow): string {
  return `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`;
}

function connectionToComms(
  connectionStatus: ConvoyRealtimeConnectionStatus,
  activeMembers: ConvoyMemberRow[],
  staleLabels: string[],
  missingLiveLocationLabels: string[],
): 'online' | 'degraded' | 'offline' | 'unknown' {
  if (activeMembers.length <= 0) return 'unknown';
  if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
    return staleLabels.length > 0 || missingLiveLocationLabels.length > 0 ? 'degraded' : 'online';
  }
  if (connectionStatus === 'loading' || connectionStatus === 'degraded') return 'degraded';
  if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
    return staleLabels.length > 0 || missingLiveLocationLabels.length > 0 ? 'degraded' : 'offline';
  }
  return 'unknown';
}

function leadSweepSpacingMinutes(
  leadLocation: ConvoyMemberLocationRow | undefined,
  sweepLocation: ConvoyMemberLocationRow | undefined,
  members: ConvoyMemberSnapshot[],
): number | null {
  if (!leadLocation || !sweepLocation) return null;
  const separationMiles = haversineMiles(toGeoPoint(leadLocation), toGeoPoint(sweepLocation));
  const speeds = members
    .map((member) => member.speedMph?.value)
    .filter((speed): speed is number => typeof speed === 'number' && speed > 1);
  if (speeds.length <= 0) return null;
  const averageSpeedMph = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  return Number((separationMiles / averageSpeedMph * 60).toFixed(1));
}

export function buildConvoySnapshotFromTracking(input: ConvoyAssessmentAdapterInput): ConvoySnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const activeMembers = input.members.filter((member) => !member.revoked_at);
  const latestByMember = latestLocationByMember(activeMembers, input.locations);
  const leadMember = activeMembers.find((member) => member.role === 'lead');
  const sweepMember = activeMembers.find((member) => member.role === 'sweep');
  const leadLocation = leadMember ? latestByMember.get(leadMember.id) : undefined;
  const sweepLocation = sweepMember ? latestByMember.get(sweepMember.id) : undefined;
  const leadGeo = leadLocation ? toGeoPoint(leadLocation) : null;

  const staleLocationMemberLabels: string[] = [];
  const overdueMemberLabels: string[] = [];
  const stoppedUnexpectedlyLabels: string[] = [];
  const assistanceNeededMemberLabels: string[] = [];
  const missedCheckpointMemberLabels: string[] = [];
  const missingLiveLocationLabels: string[] = [];

  const members: ConvoyMemberSnapshot[] = activeMembers.map((member) => {
    const row = latestByMember.get(member.id);
    const callsign = member.callsign || 'Unknown';

    if (!row) {
      missingLiveLocationLabels.push(callsign);
      overdueMemberLabels.push(callsign);
      return {
        id: member.id,
        callsign,
        role: member.role ?? 'unknown',
        locationStale: livePoint(true, nowIso, {
          confidence: 'low',
          isStale: true,
          notes: 'No live location row is available for this convoy member.',
          staleAfterMinutes: CONVOY_LOCATION_STALE_AFTER_MS / 60_000,
        }),
        movementStatus: livePoint('unknown', nowIso, { confidence: 'low' }),
      };
    }

    const movementStatus = toMovementStatus(row.movement_status);
    const stale = classifyConvoyLocationStaleness(row.captured_at ?? row.updated_at, nowMs);
    const age = ageMs(row, nowMs);
    const locationIsStale = stale.isStale || movementStatus === 'offline';
    const locationUpdatedAt = row.updated_at ?? row.captured_at ?? nowIso;

    if (age >= CONVOY_LOCATION_WATCH_AFTER_MS || movementStatus === 'delayed' || movementStatus === 'offline') {
      overdueMemberLabels.push(callsign);
    }
    if (locationIsStale) staleLocationMemberLabels.push(callsign);
    if (movementStatus === 'stopped') stoppedUnexpectedlyLabels.push(callsign);
    if (movementStatus === 'needs_assistance') assistanceNeededMemberLabels.push(callsign);
    if (movementStatus === 'delayed') missedCheckpointMemberLabels.push(callsign);

    const location = toGeoPoint(row);
    const speedMph = typeof row.speed_mps === 'number' ? Number((row.speed_mps * MPH_PER_MPS).toFixed(1)) : null;
    const distanceBehindLeadMiles =
      leadGeo && member.id !== leadMember?.id
        ? Number(haversineMiles(leadGeo, location).toFixed(1))
        : 0;

    return {
      id: member.id,
      callsign,
      role: member.role ?? 'unknown',
      lastCheckInAt: livePoint(row.captured_at, locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
        isStale: locationIsStale,
      }),
      lastKnownLocation: livePoint(location, locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
        isStale: locationIsStale,
        notes: stale.staleReason,
        staleAfterMinutes: CONVOY_LOCATION_STALE_AFTER_MS / 60_000,
      }),
      lastKnownLocationLabel: livePoint(locationLabel(row), locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
        isStale: locationIsStale,
      }),
      headingDegrees:
        typeof row.heading_degrees === 'number'
          ? livePoint(row.heading_degrees, locationUpdatedAt, { confidence: locationIsStale ? 'medium' : 'high' })
          : undefined,
      speedMph:
        typeof speedMph === 'number'
          ? livePoint(speedMph, locationUpdatedAt, { confidence: locationIsStale ? 'medium' : 'high' })
          : undefined,
      batteryPercent:
        typeof row.battery_percent === 'number'
          ? livePoint(row.battery_percent, locationUpdatedAt, { confidence: locationIsStale ? 'medium' : 'high' })
          : undefined,
      locationStale: livePoint(locationIsStale, locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
        isStale: locationIsStale,
        notes: stale.staleReason,
      }),
      movementStatus: livePoint(movementStatus, locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
        isStale: locationIsStale,
      }),
      distanceBehindLeadMiles: livePoint(distanceBehindLeadMiles, locationUpdatedAt, {
        confidence: locationIsStale ? 'medium' : 'high',
      }),
      missedCheckpoint: livePoint(movementStatus === 'delayed', locationUpdatedAt, {
        confidence: movementStatus === 'delayed' ? 'medium' : 'high',
      }),
      needsAssistance: livePoint(movementStatus === 'needs_assistance', locationUpdatedAt, {
        confidence: movementStatus === 'needs_assistance' ? 'high' : 'medium',
      }),
    };
  });

  const liveLocationMemberCount = members.filter(
    (member) => member.lastKnownLocation?.value != null && member.locationStale?.value !== true,
  ).length;
  const separationMiles =
    leadLocation && sweepLocation
      ? Number(haversineMiles(toGeoPoint(leadLocation), toGeoPoint(sweepLocation)).toFixed(1))
      : null;
  const spacingMinutes = leadSweepSpacingMinutes(leadLocation, sweepLocation, members);
  const communicationsStatus = connectionToComms(
    input.connectionStatus,
    activeMembers,
    staleLocationMemberLabels,
    missingLiveLocationLabels,
  );
  const latestCheckIn = input.locations
    .filter((row) => latestByMember.get(row.member_id) === row)
    .map((row) => row.updated_at ?? row.captured_at)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  return {
    teamId: input.convoyId ?? activeMembers[0]?.convoy_id ?? null,
    members,
    teamMemberCount: livePoint(activeMembers.length, nowIso),
    activeMemberCount: livePoint(activeMembers.length, nowIso, {
      confidence: 'high',
      notes: liveLocationMemberCount < activeMembers.length
        ? 'Some active convoy members lack fresh live coordinates.'
        : null,
    }),
    missingMemberCount: livePoint(0, nowIso, {
      notes: missingLiveLocationLabels.length > 0
        ? 'No person is marked missing; these members only lack live coordinates.'
        : null,
    }),
    overdueMemberLabels: livePoint([...new Set(overdueMemberLabels)], nowIso, {
      confidence: overdueMemberLabels.length > 0 ? 'medium' : 'high',
    }),
    stoppedUnexpectedlyLabels: livePoint([...new Set(stoppedUnexpectedlyLabels)], nowIso),
    missedCheckpointMemberLabels: livePoint([...new Set(missedCheckpointMemberLabels)], nowIso, {
      confidence: missedCheckpointMemberLabels.length > 0 ? 'medium' : 'high',
    }),
    assistanceNeededMemberLabels: livePoint([...new Set(assistanceNeededMemberLabels)], nowIso),
    lastCheckInAt: latestCheckIn ? livePoint(latestCheckIn, latestCheckIn) : undefined,
    trackingEnabled: livePoint(true, nowIso),
    liveLocationMemberCount: livePoint(liveLocationMemberCount, nowIso),
    staleLocationMemberLabels: livePoint([...new Set(staleLocationMemberLabels)], nowIso, {
      confidence: staleLocationMemberLabels.length > 0 ? 'medium' : 'high',
    }),
    convoySpacingMinutes:
      typeof spacingMinutes === 'number'
        ? livePoint(spacingMinutes, nowIso, { confidence: 'medium' })
        : undefined,
    leadSweepSeparationMiles:
      typeof separationMiles === 'number'
        ? livePoint(separationMiles, nowIso, { confidence: 'medium' })
        : undefined,
    communicationsStatus: livePoint(communicationsStatus, nowIso, {
      confidence: communicationsStatus === 'online' ? 'high' : 'medium',
    }),
    recommendedRegroupPoint: input.recommendedRegroupPoint
      ? livePoint(input.recommendedRegroupPoint, nowIso, { confidence: 'medium' })
      : undefined,
  };
}

function isManualPoint(value: unknown): value is ExpeditionDataPoint<unknown> {
  return Boolean(value && typeof value === 'object' && (value as ExpeditionDataPoint<unknown>).source === 'userManual');
}

function mergeManualMember(live: ConvoyMemberSnapshot, fallback?: ConvoyMemberSnapshot): ConvoyMemberSnapshot {
  if (!fallback) return live;
  return {
    ...live,
    lastCheckInAt: isManualPoint(fallback.lastCheckInAt) ? fallback.lastCheckInAt : live.lastCheckInAt,
    lastKnownLocation: isManualPoint(fallback.lastKnownLocation) ? fallback.lastKnownLocation : live.lastKnownLocation,
    lastKnownLocationLabel: isManualPoint(fallback.lastKnownLocationLabel)
      ? fallback.lastKnownLocationLabel
      : live.lastKnownLocationLabel,
    headingDegrees: isManualPoint(fallback.headingDegrees) ? fallback.headingDegrees : live.headingDegrees,
    speedMph: isManualPoint(fallback.speedMph) ? fallback.speedMph : live.speedMph,
    batteryPercent: isManualPoint(fallback.batteryPercent) ? fallback.batteryPercent : live.batteryPercent,
    locationStale: isManualPoint(fallback.locationStale) ? fallback.locationStale : live.locationStale,
    movementStatus: isManualPoint(fallback.movementStatus) ? fallback.movementStatus : live.movementStatus,
    distanceBehindLeadMiles: isManualPoint(fallback.distanceBehindLeadMiles)
      ? fallback.distanceBehindLeadMiles
      : live.distanceBehindLeadMiles,
    missedCheckpoint: isManualPoint(fallback.missedCheckpoint) ? fallback.missedCheckpoint : live.missedCheckpoint,
    needsAssistance: isManualPoint(fallback.needsAssistance) ? fallback.needsAssistance : live.needsAssistance,
  };
}

export function mergeLiveConvoySnapshotWithManualFallback(
  live: ConvoySnapshot,
  fallback?: ConvoySnapshot | null,
): ConvoySnapshot {
  if (!fallback) return live;
  const fallbackMembersById = new Map((fallback.members ?? []).map((member) => [member.id, member]));
  const merged: ConvoySnapshot = {
    ...live,
    members: (live.members ?? []).map((member) => mergeManualMember(member, fallbackMembersById.get(member.id))),
  };

  for (const key of [
    'teamMemberCount',
    'activeMemberCount',
    'missingMemberCount',
    'overdueMemberLabels',
    'stoppedUnexpectedlyLabels',
    'missedCheckpointMemberLabels',
    'assistanceNeededMemberLabels',
    'lastCheckInAt',
    'trackingEnabled',
    'liveLocationMemberCount',
    'staleLocationMemberLabels',
    'convoySpacingMinutes',
    'leadSweepSeparationMiles',
    'communicationsStatus',
    'recommendedRegroupPoint',
  ] as const) {
    if (isManualPoint(fallback[key])) {
      (merged as Record<typeof key, unknown>)[key] = fallback[key];
    } else if (merged[key] === undefined && fallback[key] !== undefined) {
      (merged as Record<typeof key, unknown>)[key] = fallback[key];
    }
  }

  return merged;
}

export function applyLiveConvoyTrackingToAssessmentContext(
  context: ExpeditionContextSnapshot,
  input: ConvoyAssessmentAdapterInput | null | undefined,
): ExpeditionContextSnapshot {
  if (!input || !input.convoyId || input.members.length <= 0) return context;
  const live = buildConvoySnapshotFromTracking({
    ...input,
    recommendedRegroupPoint:
      input.recommendedRegroupPoint ?? context.convoy?.recommendedRegroupPoint?.value ?? null,
  });
  return {
    ...context,
    convoy: mergeLiveConvoySnapshotWithManualFallback(live, context.convoy),
  };
}
