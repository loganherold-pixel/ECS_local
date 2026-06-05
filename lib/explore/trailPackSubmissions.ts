import type {
  ECSTrailPack,
  ECSTrailPackCoordinate,
  ECSTrailPackDifficulty,
  ECSTrailPackRouteType,
} from './trailPacks';
import { distanceMilesBetween } from './trailPacks';
import type { NavigationHandoffPayload } from '../navigationHandoffStore';
import type { SavedTrail } from '../trailHistoryStore';

export type ECSTrailPackSubmissionEntryPoint =
  | 'navigate_route_preview'
  | 'completed_route_summary'
  | 'imported_gpx_kml_route'
  | 'explore_saved_route';

export type ECSTrailPackSubmissionTag =
  | 'scenic'
  | 'remote'
  | 'technical'
  | 'family_friendly'
  | 'dispersed_camping_nearby'
  | 'water_crossing'
  | 'snow_risk'
  | 'recovery_risk'
  | 'high_clearance'
  | '4x4_recommended';

export type ECSTrailPackSubmissionRouteInput = {
  id: string;
  title: string;
  subtitle?: string | null;
  sourceEntryPoint: ECSTrailPackSubmissionEntryPoint;
  routeGeometry: ECSTrailPackCoordinate[];
  distanceMiles?: number | null;
  estimatedDurationMinutes?: number | null;
  routeType?: ECSTrailPackRouteType | null;
  difficulty?: ECSTrailPackDifficulty | null;
  sourceFormat?: 'gpx' | 'kml' | 'geojson' | 'json' | 'built' | 'saved' | 'unknown';
  createdAt?: string | null;
};

export type ECSTrailPackSubmissionFormValues = {
  name: string;
  description: string;
  difficulty: ECSTrailPackDifficulty;
  vehicleUsed: string;
  recommendedVehicleType: string;
  routeType: ECSTrailPackRouteType;
  seasonNotes: string;
  hazardNotes: string;
  acknowledgesPrivateLandOrClosures: boolean;
  certifiesPermissionToShare: boolean;
  tags: ECSTrailPackSubmissionTag[];
};

export type ECSTrailPackSubmission = {
  id: string;
  trailPack: ECSTrailPack;
  sourceRouteId: string;
  sourceEntryPoint: ECSTrailPackSubmissionEntryPoint;
  vehicleUsed?: string;
  recommendedVehicleType?: string;
  seasonNotes?: string;
  hazardNotes?: string;
  privacyWarnings: string[];
  sanitizedRoutePointCount: number;
  createdAt: string;
  updatedAt?: string;
  revisionCount?: number;
};

export type ECSTrailPackSubmissionResult = {
  submission: ECSTrailPackSubmission;
  warnings: string[];
};

export type TrailPackSubmissionSnapshot = {
  submissions: ECSTrailPackSubmission[];
};

type Listener = () => void;

const STORAGE_KEY = 'ecs_trail_pack_submissions_v1';
const PRIVATE_LOCATION_DISTANCE_MILES = 0.25;

export const TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY =
  'I confirm I have the right to share this route and understand ECS may review, modify, reject, or limit visibility if the route appears unsafe, restricted, duplicated, sensitive, or unsupported by available data.';

export const TRAIL_PACK_SUBMISSION_TAG_OPTIONS: Array<{
  key: ECSTrailPackSubmissionTag;
  label: string;
}> = [
  { key: 'scenic', label: 'Scenic' },
  { key: 'remote', label: 'Remote' },
  { key: 'technical', label: 'Technical' },
  { key: 'family_friendly', label: 'Family friendly' },
  { key: 'dispersed_camping_nearby', label: 'Dispersed camping nearby' },
  { key: 'water_crossing', label: 'Water crossing' },
  { key: 'snow_risk', label: 'Snow risk' },
  { key: 'recovery_risk', label: 'Recovery risk' },
  { key: 'high_clearance', label: 'High clearance' },
  { key: '4x4_recommended', label: '4x4 recommended' },
];

const listeners = new Set<Listener>();
let snapshot: TrailPackSubmissionSnapshot = { submissions: [] };
let hydrated = false;

function uuid(prefix = 'trail-pack-submission'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random}`;
}

function readStorage(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
  } catch {}
  return null;
}

function writeStorage(value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {}
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const raw = readStorage();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<TrailPackSubmissionSnapshot>;
    snapshot = {
      submissions: Array.isArray(parsed.submissions)
        ? parsed.submissions.filter(isSubmissionLike)
        : [],
    };
  } catch {
    snapshot = { submissions: [] };
  }
}

function persist() {
  writeStorage(JSON.stringify(snapshot));
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function isSubmissionLike(value: unknown): value is ECSTrailPackSubmission {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ECSTrailPackSubmission>;
  return !!record.id && !!record.trailPack && record.trailPack.reviewStatus === 'pending_review';
}

function compact(value: string | undefined | null): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCoordinate(value: unknown): ECSTrailPackCoordinate | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude ?? record.lat);
  const longitude = Number(record.longitude ?? record.lng ?? record.lon);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return { latitude, longitude };
  }
  return null;
}

function estimateDurationMinutes(distanceMiles: number | null | undefined): number | null {
  if (!Number.isFinite(Number(distanceMiles)) || Number(distanceMiles) <= 0) return null;
  return Math.max(20, Math.round((Number(distanceMiles) / 12) * 60));
}

function computeCenterCoordinate(points: ECSTrailPackCoordinate[]): ECSTrailPackCoordinate {
  if (points.length === 0) return { latitude: 0, longitude: 0 };
  const total = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}

function inferSourceFormat(payload: NavigationHandoffPayload): ECSTrailPackSubmissionRouteInput['sourceFormat'] {
  if (payload.routeSource === 'gpx' || payload.routeSource === 'cached_gpx') return 'gpx';
  if (payload.routeSource === 'built' || payload.routeSource === 'drawn') return 'built';
  if (payload.routeSource === 'saved' || payload.source === 'saved') return 'saved';
  const rawFormat = String(payload.routeMetadata?.format ?? payload.routeMetadata?.sourceFormat ?? '').toLowerCase();
  if (rawFormat.includes('kml')) return 'kml';
  if (rawFormat.includes('geojson')) return 'geojson';
  if (rawFormat.includes('json')) return 'json';
  return 'unknown';
}

function inferDifficulty(value: string | null | undefined): ECSTrailPackDifficulty {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('easy')) return 'easy';
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'moderate';
  if (normalized.includes('technical') || normalized.includes('hard')) return 'technical';
  if (normalized.includes('extreme')) return 'extreme';
  return 'unknown';
}

function getTrailPackSubmissionGeometry(trailPack: ECSTrailPack): ECSTrailPackCoordinate[] {
  const geometry = trailPack.routeGeometry;
  if (!geometry) return [];
  const coordinates =
    geometry.type === 'MultiLineString'
      ? (geometry.coordinates as number[][][]).flat()
      : geometry.coordinates as number[][];
  return coordinates
    .map((coordinate) => normalizeCoordinate({ longitude: coordinate[0], latitude: coordinate[1] }))
    .filter((point): point is ECSTrailPackCoordinate => !!point);
}

export function trailPackRouteInputFromNavigationPayload(
  payload: NavigationHandoffPayload | null | undefined,
  sourceEntryPoint: ECSTrailPackSubmissionEntryPoint,
): ECSTrailPackSubmissionRouteInput | null {
  if (!payload) return null;
  const routeGeometry = (payload.trailGeometry ?? [])
    .map(normalizeCoordinate)
    .filter((point): point is ECSTrailPackCoordinate => !!point);
  return {
    id: payload.id,
    title: payload.title || 'Untitled route',
    subtitle: payload.subtitle,
    sourceEntryPoint,
    routeGeometry,
    distanceMiles: payload.trailLengthMiles,
    estimatedDurationMinutes: estimateDurationMinutes(payload.trailLengthMiles),
    routeType: 'unknown',
    difficulty: inferDifficulty(payload.trailCategory),
    sourceFormat: inferSourceFormat(payload),
    createdAt: payload.createdAt,
  };
}

export function trailPackRouteInputFromSavedTrail(
  trail: SavedTrail | null | undefined,
): ECSTrailPackSubmissionRouteInput | null {
  if (!trail) return null;
  const routeGeometry = trail.points
    .map((point) => normalizeCoordinate(point))
    .filter((point): point is ECSTrailPackCoordinate => !!point);
  return {
    id: trail.id,
    title: trail.name || 'Completed route',
    subtitle: trail.expedition_name,
    sourceEntryPoint: 'completed_route_summary',
    routeGeometry,
    distanceMiles: trail.distance_miles,
    estimatedDurationMinutes: Math.round(trail.elapsed_seconds / 60),
    routeType: 'unknown',
    difficulty: 'unknown',
    sourceFormat: 'saved',
    createdAt: trail.saved_at,
  };
}

export function trailPackRouteInputFromSubmission(
  submission: ECSTrailPackSubmission | null | undefined,
): ECSTrailPackSubmissionRouteInput | null {
  if (!submission) return null;
  const routeGeometry = getTrailPackSubmissionGeometry(submission.trailPack);
  return {
    id: submission.sourceRouteId,
    title: submission.trailPack.name || 'Pending Trail Pack',
    subtitle: submission.trailPack.description ?? null,
    sourceEntryPoint: submission.sourceEntryPoint,
    routeGeometry,
    distanceMiles: submission.trailPack.distanceMiles,
    estimatedDurationMinutes: submission.trailPack.estimatedDurationMinutes,
    routeType: submission.trailPack.routeType,
    difficulty: submission.trailPack.difficulty ?? 'unknown',
    sourceFormat: 'saved',
    createdAt: submission.trailPack.createdAt,
  };
}

export function trailPackFormValuesFromSubmission(
  submission: ECSTrailPackSubmission | null | undefined,
): ECSTrailPackSubmissionFormValues | null {
  if (!submission) return null;
  return {
    name: submission.trailPack.name,
    description: submission.trailPack.description ?? '',
    difficulty: submission.trailPack.difficulty ?? 'unknown',
    vehicleUsed: submission.vehicleUsed ?? '',
    recommendedVehicleType: submission.recommendedVehicleType ?? submission.trailPack.vehicleFit?.[0] ?? '',
    routeType: submission.trailPack.routeType,
    seasonNotes: submission.seasonNotes ?? '',
    hazardNotes: submission.hazardNotes ?? '',
    acknowledgesPrivateLandOrClosures: true,
    certifiesPermissionToShare: true,
    tags: (submission.trailPack.tags ?? []).filter((tag): tag is ECSTrailPackSubmissionTag =>
      TRAIL_PACK_SUBMISSION_TAG_OPTIONS.some((option) => option.key === tag),
    ),
  };
}

export function validateTrailPackSubmission(
  routeInput: ECSTrailPackSubmissionRouteInput | null,
  values: ECSTrailPackSubmissionFormValues,
): string[] {
  const errors: string[] = [];
  if (!routeInput) {
    errors.push('Route unavailable.');
  } else if (routeInput.routeGeometry.length < 2) {
    errors.push('Route geometry is required before submitting a Trail Pack.');
  }
  if (!compact(values.name)) errors.push('Trail Pack name is required.');
  if (!compact(values.description)) errors.push('Short description is required.');
  if (!values.difficulty || values.difficulty === 'unknown') errors.push('Difficulty is required.');
  if (!values.routeType || values.routeType === 'unknown') errors.push('Route type is required.');
  if (!values.acknowledgesPrivateLandOrClosures) {
    errors.push('Private land and closure awareness is required.');
  }
  if (!values.certifiesPermissionToShare) {
    errors.push('Certification is required before submission.');
  }
  return errors;
}

export function detectTrailPackPrivacyWarnings(
  routeInput: ECSTrailPackSubmissionRouteInput | null,
  currentLocation?: ECSTrailPackCoordinate | null,
): string[] {
  if (!routeInput || routeInput.routeGeometry.length === 0) return ['Route geometry is unavailable.'];
  const warnings: string[] = [];
  if (!currentLocation) {
    warnings.push('Location unavailable. ECS cannot check whether the route starts or ends near a private/frequent location.');
    return warnings;
  }
  const first = routeInput.routeGeometry[0];
  const last = routeInput.routeGeometry[routeInput.routeGeometry.length - 1];
  if (distanceMilesBetween(first, currentLocation) <= PRIVATE_LOCATION_DISTANCE_MILES) {
    warnings.push('Route start is near your current location. ECS will trim the first point before review.');
  }
  if (distanceMilesBetween(last, currentLocation) <= PRIVATE_LOCATION_DISTANCE_MILES) {
    warnings.push('Route end is near your current location. ECS will trim the last point before review.');
  }
  return warnings;
}

export function sanitizeTrailPackSubmissionGeometry(
  routeInput: ECSTrailPackSubmissionRouteInput,
  currentLocation?: ECSTrailPackCoordinate | null,
): ECSTrailPackCoordinate[] {
  let points = [...routeInput.routeGeometry];
  if (!currentLocation || points.length < 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  if (distanceMilesBetween(first, currentLocation) <= PRIVATE_LOCATION_DISTANCE_MILES) {
    points = points.slice(1);
  }
  if (points.length > 2 && distanceMilesBetween(last, currentLocation) <= PRIVATE_LOCATION_DISTANCE_MILES) {
    points = points.slice(0, -1);
  }
  return points;
}

function buildPendingTrailPackSubmission(
  routeInput: ECSTrailPackSubmissionRouteInput,
  values: ECSTrailPackSubmissionFormValues,
  options: { currentLocation?: ECSTrailPackCoordinate | null; nowIso?: string } = {},
  existing?: { submissionId: string; trailPackId: string; createdAt: string; revisionCount?: number },
): ECSTrailPackSubmissionResult {
  const errors = validateTrailPackSubmission(routeInput, values);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const updatedAt = options.nowIso ?? new Date().toISOString();
  const createdAt = existing?.createdAt ?? updatedAt;
  const privacyWarnings = detectTrailPackPrivacyWarnings(routeInput, options.currentLocation);
  const sanitizedGeometry = sanitizeTrailPackSubmissionGeometry(routeInput, options.currentLocation);
  const centerCoordinate = computeCenterCoordinate(sanitizedGeometry);
  const submissionId = existing?.submissionId ?? uuid();
  const trailPackId = existing?.trailPackId ?? `pending-${routeInput.id}-${submissionId}`;
  const revisionCount = existing ? (existing.revisionCount ?? 0) + 1 : 0;
  const vehicleFit = compact(values.recommendedVehicleType)
    ? [compact(values.recommendedVehicleType) as string]
    : [];
  const notes = [
    compact(values.seasonNotes) ? `Season notes: ${compact(values.seasonNotes)}` : null,
    compact(values.hazardNotes) ? `Hazard notes: ${compact(values.hazardNotes)}` : null,
  ].filter((item): item is string => !!item);

  const trailPack: ECSTrailPack = {
    id: trailPackId,
    name: compact(values.name) as string,
    description: compact(values.description),
    source: 'ecs_submitted',
    dataState: 'local_review',
    routeType: values.routeType,
    centerCoordinate,
    routeGeometry: {
      type: 'LineString',
      coordinates: sanitizedGeometry.map((point) => [point.longitude, point.latitude]),
    },
    distanceMiles: routeInput.distanceMiles ?? undefined,
    estimatedDurationMinutes: routeInput.estimatedDurationMinutes ?? undefined,
    difficulty: values.difficulty,
    vehicleFit,
    confidenceScore: 0,
    confidenceReasons: [
      existing ? 'Updated by the submitter for ECS review.' : 'Submitted by an ECS user for review.',
      ...notes,
    ],
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    completionCount: 0,
    reviewStatus: 'pending_review',
    tags: values.tags,
    createdAt,
    updatedAt,
  };

  return {
    submission: {
      id: submissionId,
      trailPack,
      sourceRouteId: routeInput.id,
      sourceEntryPoint: routeInput.sourceEntryPoint,
      vehicleUsed: compact(values.vehicleUsed),
      recommendedVehicleType: compact(values.recommendedVehicleType),
      seasonNotes: compact(values.seasonNotes),
      hazardNotes: compact(values.hazardNotes),
      privacyWarnings,
      sanitizedRoutePointCount: sanitizedGeometry.length,
      createdAt,
      updatedAt,
      revisionCount,
    },
    warnings: privacyWarnings,
  };
}

export function createPendingTrailPackSubmission(
  routeInput: ECSTrailPackSubmissionRouteInput,
  values: ECSTrailPackSubmissionFormValues,
  options: { currentLocation?: ECSTrailPackCoordinate | null; nowIso?: string } = {},
): ECSTrailPackSubmissionResult {
  return buildPendingTrailPackSubmission(routeInput, values, options);
}

export const trailPackSubmissionStore = {
  getSnapshot(): TrailPackSubmissionSnapshot {
    hydrate();
    return { submissions: [...snapshot.submissions] };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  submit(
    routeInput: ECSTrailPackSubmissionRouteInput,
    values: ECSTrailPackSubmissionFormValues,
    options: { currentLocation?: ECSTrailPackCoordinate | null } = {},
  ): ECSTrailPackSubmissionResult {
    hydrate();
    const result = createPendingTrailPackSubmission(routeInput, values, options);
    snapshot = {
      submissions: [result.submission, ...snapshot.submissions],
    };
    persist();
    emit();
    return result;
  },

  update(
    submissionId: string,
    routeInput: ECSTrailPackSubmissionRouteInput,
    values: ECSTrailPackSubmissionFormValues,
    options: { currentLocation?: ECSTrailPackCoordinate | null } = {},
  ): ECSTrailPackSubmissionResult {
    hydrate();
    const existing = snapshot.submissions.find((submission) => submission.id === submissionId);
    if (!existing) throw new Error('Trail Pack submission unavailable.');
    const result = buildPendingTrailPackSubmission(routeInput, values, options, {
      submissionId: existing.id,
      trailPackId: existing.trailPack.id,
      createdAt: existing.createdAt,
      revisionCount: existing.revisionCount,
    });
    snapshot = {
      submissions: snapshot.submissions.map((submission) =>
        submission.id === submissionId ? result.submission : submission,
      ),
    };
    persist();
    emit();
    return result;
  },

  withdraw(submissionId: string): ECSTrailPackSubmission | null {
    hydrate();
    const existing = snapshot.submissions.find((submission) => submission.id === submissionId) ?? null;
    if (!existing) return null;
    snapshot = {
      submissions: snapshot.submissions.filter((submission) => submission.id !== submissionId),
    };
    persist();
    emit();
    return existing;
  },

  clearForTests(): void {
    snapshot = { submissions: [] };
    hydrated = true;
    persist();
    emit();
  },
};
