import type {
  RoadNavCoordinate,
  RoadNavDestination,
} from '../mapboxRoadNavigation';

export type CampsiteApproachBlockerType =
  | 'roadway'
  | 'private_property'
  | 'water'
  | 'restricted_area'
  | 'unknown';

export type CampsiteApproachBlocker = {
  type: CampsiteApproachBlockerType;
  label: string;
  confidence?: 'known' | 'likely' | 'unknown';
};

export type CampsiteApproachKind =
  | 'routable_campsite'
  | 'routable_approach_with_final_access'
  | 'blocked_final_access';

export type CampsiteFinalAccess = {
  id: string;
  campCoordinate: RoadNavCoordinate;
  approachCoordinate: RoadNavCoordinate;
  distanceM: number;
  status: 'clear' | 'blocked';
  blockers: CampsiteApproachBlocker[];
  message: string;
};

export type CampsiteApproachResolution = {
  kind: CampsiteApproachKind;
  destinationCoordinate: RoadNavCoordinate;
  campCoordinate: RoadNavCoordinate;
  finalAccess: CampsiteFinalAccess | null;
};

export type CampsiteApproachRouteIntent = {
  destination: RoadNavDestination;
  approach: CampsiteApproachResolution;
  finalAccess: CampsiteFinalAccess | null;
};

const FINAL_ACCESS_MIN_DISTANCE_M = 25;
const EARTH_RADIUS_M = 6371000;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function validCoordinate(value: RoadNavCoordinate | null | undefined): value is RoadNavCoordinate {
  return (
    !!value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

export function distanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeCampsiteApproachBlockers(value: unknown): CampsiteApproachBlocker[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CampsiteApproachBlocker | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const type = String(record.type ?? '').trim();
      const label = String(record.label ?? record.reason ?? type).trim();
      if (!label) return null;
      const normalizedType: CampsiteApproachBlockerType =
        type === 'roadway' ||
        type === 'private_property' ||
        type === 'water' ||
        type === 'restricted_area'
          ? type
          : 'unknown';
      const confidenceRaw = String(record.confidence ?? '').trim();
      const confidence =
        confidenceRaw === 'known' || confidenceRaw === 'likely' || confidenceRaw === 'unknown'
          ? confidenceRaw
          : undefined;
      return { type: normalizedType, label, confidence };
    })
    .filter((item): item is CampsiteApproachBlocker => !!item);
}

export function resolveCampsiteApproach(input: {
  campCoordinate: RoadNavCoordinate;
  approachCoordinate?: RoadNavCoordinate | null;
  actionId?: string | null;
  blockers?: CampsiteApproachBlocker[];
  finalAccessMinDistanceM?: number;
}): CampsiteApproachResolution {
  if (!validCoordinate(input.campCoordinate)) {
    throw new Error('Campsite coordinate unavailable.');
  }

  const approachCoordinate = validCoordinate(input.approachCoordinate)
    ? input.approachCoordinate
    : input.campCoordinate;
  const distanceM = distanceMeters(approachCoordinate, input.campCoordinate);
  const minDistanceM = input.finalAccessMinDistanceM ?? FINAL_ACCESS_MIN_DISTANCE_M;

  if (distanceM < minDistanceM) {
    return {
      kind: 'routable_campsite',
      destinationCoordinate: input.campCoordinate,
      campCoordinate: input.campCoordinate,
      finalAccess: null,
    };
  }

  const blockers = input.blockers ?? [];
  const status: CampsiteFinalAccess['status'] = blockers.length > 0 ? 'blocked' : 'clear';
  const finalAccess: CampsiteFinalAccess = {
    id: `${input.actionId ?? 'campsite'}-final-access`,
    campCoordinate: input.campCoordinate,
    approachCoordinate,
    distanceM,
    status,
    blockers,
    message:
      status === 'blocked'
        ? 'Final campsite access is not drawn because ECS has known blocker data between the route end and campsite pin.'
        : 'Route ends at the closest routable approach ECS can verify from the road route. Final campsite access requires field verification.',
  };

  return {
    kind: status === 'blocked' ? 'blocked_final_access' : 'routable_approach_with_final_access',
    destinationCoordinate: approachCoordinate,
    campCoordinate: input.campCoordinate,
    finalAccess,
  };
}

export function buildCampsiteApproachRouteIntent(input: {
  actionId: string;
  title: string;
  subtitle: string | null;
  campCoordinate: RoadNavCoordinate;
  approachCoordinate?: RoadNavCoordinate | null;
  blockers?: CampsiteApproachBlocker[];
  raw?: Record<string, unknown>;
}): CampsiteApproachRouteIntent {
  const approach = resolveCampsiteApproach({
    actionId: input.actionId,
    campCoordinate: input.campCoordinate,
    approachCoordinate: input.approachCoordinate,
    blockers: input.blockers,
  });

  return {
    destination: {
      id: input.actionId,
      title: input.title,
      subtitle: input.subtitle,
      coordinate: approach.destinationCoordinate,
      sourceType: 'manual_selection',
      raw: {
        ...(input.raw ?? {}),
        campCoordinate: input.campCoordinate,
        campsiteApproach: approach,
      },
    },
    approach,
    finalAccess: approach.finalAccess,
  };
}

export function buildCampsiteFinalAccessSegment(finalAccess: CampsiteFinalAccess | null | undefined) {
  if (!finalAccess || finalAccess.status !== 'clear') return null;
  return {
    id: finalAccess.id,
    kind: 'campsite_final_access',
    name: 'Final campsite access',
    category: 'final_access',
    categoryLabel: 'Final campsite access',
    color: '#F2C24D',
    coordinates: [
      [finalAccess.approachCoordinate.lng, finalAccess.approachCoordinate.lat] as [number, number],
      [finalAccess.campCoordinate.lng, finalAccess.campCoordinate.lat] as [number, number],
    ],
  };
}
