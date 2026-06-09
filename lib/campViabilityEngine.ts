import type {
  ActiveTripModeSnapshot,
  ActiveTripOperationalSummary,
} from './activeTripMode';
import type { OfflineIncidentPacket } from './offlineIncidentPacket';
import type { GeoPoint } from './tripBuilder/tripBuilderTypes';

export const CAMP_VIABILITY_V1_CATEGORIES = [
  'strong_candidate',
  'reasonable_candidate',
  'caution',
  'poor_candidate',
  'unknown',
] as const;

export type CampViabilityV1Category = typeof CAMP_VIABILITY_V1_CATEGORIES[number];
export type CampViabilityV1DataState =
  | 'unknown'
  | 'unavailable'
  | 'stale'
  | 'demo'
  | 'mock'
  | 'partial'
  | 'available'
  | 'verified';
export type CampViabilityV1ReasonTone = 'positive' | 'watch' | 'caution' | 'critical';

export type CampViabilityV1Reason = {
  id: string;
  label: string;
  tone: CampViabilityV1ReasonTone;
};

export type CampViabilityV1StatusInput = {
  status?: string | null;
  label?: string | null;
  score?: number | null;
} | null | undefined;

export type CampViabilityV1Input = {
  camp?: {
    id?: string | null;
    name?: string | null;
    label?: string | null;
    coordinate?: GeoPoint | null;
    source?: string | null;
    sourceStatus?: string | null;
    legalStatus?: string | null;
    legalConfidence?: string | number | null;
    accessConfidence?: string | number | null;
    distanceFromRouteMiles?: number | null;
    distanceFromTrailheadMiles?: number | null;
    score?: number | null;
  } | null;
  route?: {
    authorityStatus?: string | null;
    authorityLabel?: string | null;
    geometryStatus?: string | null;
    geometryValid?: boolean | null;
  } | null;
  vehicle?: {
    status?: 'complete' | 'incomplete' | 'missing' | 'unknown' | string | null;
    label?: string | null;
  } | null;
  weather?: CampViabilityV1StatusInput;
  daylight?: CampViabilityV1StatusInput;
  remoteness?: CampViabilityV1StatusInput;
  terrainRisk?: {
    category?: string | null;
    label?: string | null;
    score?: number | null;
    dataState?: string | null;
  } | null;
  bailout?: {
    status?: ActiveTripOperationalSummary['status'] | string | null;
    label?: string | null;
    source?: string | null;
  } | null;
  dataState?: string | null;
  context?: {
    offlinePacketLocalOnly?: boolean;
  } | null;
};

export type CampViabilityV1Result = {
  category: CampViabilityV1Category;
  label: string;
  score: number | null;
  headline: string;
  camp: {
    id: string | null;
    name: string | null;
    source: string | null;
    sourceStatus: string;
    legalStatus: string;
    hasCoordinate: boolean;
    distanceFromRouteMiles: number | null;
  };
  route: {
    authorityStatus: string;
    authorityLabel: string;
    geometryStatus: string;
    geometryValid: boolean;
  };
  vehicle: {
    status: string;
    label: string | null;
  };
  weather: {
    status: string;
    label: string | null;
  };
  daylight: {
    status: string;
    label: string | null;
  };
  remoteness: {
    status: string;
    label: string | null;
  };
  terrainRisk: {
    category: string;
    label: string | null;
    score: number | null;
  };
  bailout: {
    status: string;
    label: string | null;
    source: string | null;
  };
  missingDataReasons: CampViabilityV1Reason[];
  cautionReasons: CampViabilityV1Reason[];
  positiveReasons: CampViabilityV1Reason[];
  recommendedAction: {
    id:
      | 'select_camp'
      | 'verify_camp_source'
      | 'confirm_camp_coordinates'
      | 'verify_trail_context'
      | 'review_conditions'
      | 'review_terrain'
      | 'use_as_candidate';
    label: string;
  };
  dataConfidence: {
    state: CampViabilityV1DataState;
    knownLimitations: string[];
  };
};

function cleanCampText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function campToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function campNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addReason(
  list: CampViabilityV1Reason[],
  id: string,
  label: string,
  tone: CampViabilityV1ReasonTone,
): void {
  if (list.some((reason) => reason.id === id)) return;
  list.push({ id, label, tone });
}

function normalizeState(value: unknown): string {
  const token = campToken(value);
  if (!token) return 'unknown';
  if (token === 'mocked') return 'mock';
  if (token === 'cached') return 'stale';
  return token;
}

function campViabilityCategoryFromScore(score: number): CampViabilityV1Category {
  if (score >= 82) return 'strong_candidate';
  if (score >= 62) return 'reasonable_candidate';
  if (score >= 36) return 'caution';
  return 'poor_candidate';
}

export function campViabilityV1Label(category: CampViabilityV1Category): string {
  switch (category) {
    case 'strong_candidate':
      return 'Strong Candidate';
    case 'reasonable_candidate':
      return 'Reasonable Candidate';
    case 'caution':
      return 'Caution';
    case 'poor_candidate':
      return 'Poor Candidate';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function normalizedStatus(input: CampViabilityV1StatusInput): { status: string; label: string | null; score: number | null } {
  return {
    status: normalizeState(input?.status),
    label: cleanCampText(input?.label),
    score: campNumber(input?.score),
  };
}

function normalizeCamp(input: CampViabilityV1Input['camp']): CampViabilityV1Result['camp'] {
  return {
    id: cleanCampText(input?.id),
    name: cleanCampText(input?.name ?? input?.label),
    source: cleanCampText(input?.source),
    sourceStatus: normalizeState(input?.sourceStatus ?? input?.source),
    legalStatus: normalizeState(input?.legalStatus),
    hasCoordinate: isValidCoordinate(input?.coordinate),
    distanceFromRouteMiles: campNumber(input?.distanceFromRouteMiles) ?? campNumber(input?.distanceFromTrailheadMiles),
  };
}

function normalizeRoute(input: CampViabilityV1Input['route']): CampViabilityV1Result['route'] {
  return {
    authorityStatus: normalizeState(input?.authorityStatus),
    authorityLabel: cleanCampText(input?.authorityLabel) ?? 'Unknown Route Authority',
    geometryStatus: normalizeState(input?.geometryStatus),
    geometryValid: input?.geometryValid === true,
  };
}

function isValidCoordinate(coordinate: GeoPoint | null | undefined): boolean {
  return (
    !!coordinate &&
    typeof coordinate.latitude === 'number' &&
    Number.isFinite(coordinate.latitude) &&
    typeof coordinate.longitude === 'number' &&
    Number.isFinite(coordinate.longitude)
  );
}

function vehicleStatus(input: CampViabilityV1Input['vehicle']): string {
  const explicit = normalizeState(input?.status);
  if (['complete', 'incomplete', 'missing', 'unknown'].includes(explicit)) return explicit;
  return input ? 'incomplete' : 'missing';
}

function isSourceFixture(camp: CampViabilityV1Result['camp']): boolean {
  const source = normalizeState(camp.source);
  return ['demo', 'mock', 'preview', 'fixture', 'demo_fixture'].includes(camp.sourceStatus) ||
    /demo|mock|preview|fixture/.test(source);
}

function hasSupportedCampSource(input: CampViabilityV1Input, camp: CampViabilityV1Result['camp']): boolean {
  const legalConfidence = normalizeState(input.camp?.legalConfidence);
  const accessConfidence = normalizeState(input.camp?.accessConfidence);
  const sourceStatus = camp.sourceStatus;
  const legalStatus = camp.legalStatus;
  return (
    ['allowed', 'open', 'available'].includes(legalStatus) &&
    ['high', 'verified', 'available', 'confirmed'].includes(legalConfidence) &&
    ['high', 'verified', 'available', 'confirmed', 'medium'].includes(accessConfidence) &&
    !['unknown', 'unavailable', 'demo', 'mock', 'preview'].includes(sourceStatus)
  );
}

function hasRestrictiveCampStatus(camp: CampViabilityV1Result['camp']): boolean {
  return ['closed', 'prohibited', 'restricted', 'not_allowed', 'private'].includes(camp.legalStatus);
}

function isTrailContextLimited(route: CampViabilityV1Result['route']): boolean {
  return (
    route.geometryStatus === 'approach_only' ||
    route.authorityStatus === 'trailhead_guidance' ||
    route.geometryStatus === 'trailhead_only'
  );
}

function hasVerifiedTrailRoute(route: CampViabilityV1Result['route']): boolean {
  return route.geometryValid && ['trail_route', 'trail_available', 'live_verified_geometry', 'imported_geometry', 'verified'].includes(route.geometryStatus);
}

function recommendedActionFor(
  category: CampViabilityV1Category,
  missing: CampViabilityV1Reason[],
  caution: CampViabilityV1Reason[],
): CampViabilityV1Result['recommendedAction'] {
  const ids = new Set([...missing, ...caution].map((reason) => reason.id));
  if (ids.has('no_camp_selected')) return { id: 'select_camp', label: 'Select a camp candidate' };
  if (ids.has('camp_coordinates_missing')) return { id: 'confirm_camp_coordinates', label: 'Confirm camp coordinates' };
  if (ids.has('camp_source_legal_unknown') || ids.has('camp_candidate_not_verified')) return { id: 'verify_camp_source', label: 'Verify camp source and rules' };
  if (ids.has('trail_context_limited') || ids.has('route_geometry_missing')) return { id: 'verify_trail_context', label: 'Verify route and trail context' };
  if (ids.has('terrain_risk_unknown') || ids.has('terrain_risk_elevated')) return { id: 'review_terrain', label: 'Review terrain before committing' };
  if (ids.has('weather_unavailable') || ids.has('daylight_limited') || ids.has('daylight_unknown') || ids.has('remoteness_unknown')) return { id: 'review_conditions', label: 'Review camp conditions' };
  return { id: 'use_as_candidate', label: category === 'strong_candidate' ? 'Use as a strong candidate' : 'Use as a candidate with caution' };
}

function dataConfidenceFor(
  input: CampViabilityV1Input,
  camp: CampViabilityV1Result['camp'],
  missing: CampViabilityV1Reason[],
  caution: CampViabilityV1Reason[],
): CampViabilityV1DataState {
  const explicit = normalizeState(input.dataState);
  if (explicit === 'stale' || explicit === 'demo' || explicit === 'mock') return explicit;
  if (camp.sourceStatus === 'demo') return 'demo';
  if (camp.sourceStatus === 'mock') return 'mock';
  if (missing.length > 0 || caution.some((reason) => reason.tone === 'critical' || reason.tone === 'caution')) return 'partial';
  if (hasSupportedCampSource(input, camp)) return 'available';
  return 'unknown';
}

function unknownResult(input: CampViabilityV1Input, missing: CampViabilityV1Reason[], caution: CampViabilityV1Reason[] = [], positive: CampViabilityV1Reason[] = []): CampViabilityV1Result {
  const camp = normalizeCamp(input.camp);
  const route = normalizeRoute(input.route);
  const weather = normalizedStatus(input.weather);
  const daylight = normalizedStatus(input.daylight);
  const remoteness = normalizedStatus(input.remoteness);
  const terrainRisk = {
    category: normalizeState(input.terrainRisk?.category),
    label: cleanCampText(input.terrainRisk?.label),
    score: campNumber(input.terrainRisk?.score),
  };
  const bailout = {
    status: normalizeState(input.bailout?.status),
    label: cleanCampText(input.bailout?.label),
    source: cleanCampText(input.bailout?.source),
  };
  const recommendedAction = recommendedActionFor('unknown', missing, caution);
  return {
    category: 'unknown',
    label: campViabilityV1Label('unknown'),
    score: null,
    headline: `${campViabilityV1Label('unknown')} - ${recommendedAction.label}`,
    camp,
    route,
    vehicle: {
      status: vehicleStatus(input.vehicle),
      label: cleanCampText(input.vehicle?.label),
    },
    weather,
    daylight,
    remoteness,
    terrainRisk,
    bailout,
    missingDataReasons: missing,
    cautionReasons: caution,
    positiveReasons: positive,
    recommendedAction,
    dataConfidence: {
      state: dataConfidenceFor(input, camp, missing, caution),
      knownLimitations: Array.from(new Set([...missing, ...caution].map((reason) => reason.label))),
    },
  };
}

export function evaluateCampViabilityV1(input: CampViabilityV1Input): CampViabilityV1Result {
  const missing: CampViabilityV1Reason[] = [];
  const caution: CampViabilityV1Reason[] = [];
  const positive: CampViabilityV1Reason[] = [];
  const camp = normalizeCamp(input.camp);
  const route = normalizeRoute(input.route);
  const weather = normalizedStatus(input.weather);
  const daylight = normalizedStatus(input.daylight);
  const remoteness = normalizedStatus(input.remoteness);
  const terrainRisk = {
    category: normalizeState(input.terrainRisk?.category),
    label: cleanCampText(input.terrainRisk?.label),
    score: campNumber(input.terrainRisk?.score),
  };
  const bailout = {
    status: normalizeState(input.bailout?.status),
    label: cleanCampText(input.bailout?.label),
    source: cleanCampText(input.bailout?.source),
  };

  if (!input.camp) {
    addReason(missing, 'no_camp_selected', 'No camp selected.', 'critical');
    return unknownResult(input, missing, caution, positive);
  }

  let score = 45;
  addReason(positive, 'camp_selected', 'Camp candidate selected.', 'positive');
  score += 8;

  if (!camp.hasCoordinate) {
    addReason(missing, 'camp_coordinates_missing', 'Camp coordinates unavailable.', 'critical');
    return unknownResult(input, missing, caution, positive);
  }
  addReason(positive, 'camp_coordinates_available', 'Camp coordinates available.', 'positive');
  score += 10;

  const supportedCampSource = hasSupportedCampSource(input, camp);
  const fixtureCamp = isSourceFixture(camp);
  const restrictiveCamp = hasRestrictiveCampStatus(camp);
  if (restrictiveCamp) {
    score -= 35;
    addReason(caution, 'camp_restrictive_status', 'Camp source indicates a restrictive status.', 'critical');
  } else if (fixtureCamp) {
    score -= 24;
    addReason(caution, 'camp_candidate_not_verified', 'Camp candidate not verified.', 'critical');
  } else if (!supportedCampSource) {
    score -= 18;
    addReason(missing, 'camp_source_legal_unknown', 'Camp source/legal status unknown.', 'critical');
  } else {
    score += 18;
    addReason(positive, 'camp_source_supported', 'Camp source/legal status supported by existing metadata.', 'positive');
  }

  if (camp.distanceFromRouteMiles != null) {
    if (camp.distanceFromRouteMiles <= 1) {
      score += 8;
      addReason(positive, 'camp_near_route', 'Camp proximity to route available.', 'positive');
    } else if (camp.distanceFromRouteMiles <= 5) {
      score += 4;
      addReason(caution, 'camp_route_detour', 'Camp requires a route detour.', 'watch');
    } else {
      score -= 7;
      addReason(caution, 'camp_far_from_route', 'Camp distance from route may add exposure.', 'watch');
    }
  }

  if (isTrailContextLimited(route)) {
    score -= 15;
    addReason(caution, 'trail_context_limited', 'Trail context limited.', 'caution');
  } else if (!hasVerifiedTrailRoute(route)) {
    score -= 14;
    addReason(missing, 'route_geometry_missing', 'Route geometry missing.', 'critical');
  } else {
    score += 8;
    addReason(positive, 'trail_context_available', 'Trail route context available.', 'positive');
  }

  const vStatus = vehicleStatus(input.vehicle);
  if (vStatus === 'missing') {
    score -= 8;
    addReason(missing, 'vehicle_missing', 'Vehicle profile missing.', 'caution');
  } else if (vStatus === 'incomplete' || vStatus === 'unknown') {
    score -= 5;
    addReason(missing, 'vehicle_incomplete', 'Vehicle profile incomplete.', 'watch');
  } else {
    score += 4;
    addReason(positive, 'vehicle_available', 'Vehicle profile available.', 'positive');
  }

  if (weather.status === 'unavailable') {
    score -= 12;
    addReason(missing, 'weather_unavailable', 'Weather unavailable.', 'caution');
  } else if (weather.status === 'unknown') {
    score -= 8;
    addReason(missing, 'weather_unknown', 'Weather unknown.', 'watch');
  } else if (['elevated', 'caution', 'warning', 'severe'].includes(weather.status)) {
    score -= weather.status === 'severe' ? 20 : 12;
    addReason(caution, 'weather_elevated', 'Weather may reduce camp viability.', 'caution');
  } else {
    score += 5;
    addReason(positive, 'weather_available', 'Weather input available.', 'positive');
  }

  if (daylight.status === 'limited') {
    score -= 8;
    addReason(caution, 'daylight_limited', 'Daylight limited.', 'caution');
  } else if (daylight.status === 'unknown' || daylight.status === 'unavailable') {
    score -= 6;
    addReason(missing, 'daylight_unknown', 'Daylight unknown.', 'watch');
  } else {
    score += 5;
    addReason(positive, 'daylight_available', 'Daylight input available.', 'positive');
  }

  if (remoteness.status === 'unknown' || remoteness.status === 'unavailable') {
    score -= 5;
    addReason(missing, 'remoteness_unknown', 'Remoteness unknown.', 'watch');
  } else if ((remoteness.score ?? 0) >= 70) {
    score -= 8;
    addReason(caution, 'remoteness_high', 'High remoteness increases camp recovery exposure.', 'caution');
  } else {
    score += 4;
    addReason(positive, 'remoteness_available', 'Remoteness input available.', 'positive');
  }

  if (terrainRisk.category === 'unknown' || terrainRisk.category === 'insufficient_data') {
    score -= 12;
    addReason(missing, 'terrain_risk_unknown', 'Terrain risk unknown.', 'caution');
  } else if (terrainRisk.category === 'elevated' || terrainRisk.category === 'severe') {
    score -= terrainRisk.category === 'severe' ? 25 : 14;
    addReason(caution, 'terrain_risk_elevated', 'Terrain risk elevated.', 'caution');
  } else if (terrainRisk.category === 'low') {
    score += 6;
    addReason(positive, 'terrain_risk_available', 'Terrain risk input available.', 'positive');
  } else {
    score += 2;
    addReason(positive, 'terrain_risk_available', 'Terrain risk input available.', 'positive');
  }

  if (bailout.status === 'available' || bailout.status === 'selected' || bailout.status === 'ranked') {
    score += 4;
    addReason(positive, 'bailout_available', 'Bailout context available.', 'positive');
  } else if (bailout.status === 'provider_unavailable' || bailout.status === 'no_results' || bailout.status === 'missing') {
    score -= 8;
    addReason(caution, 'bailout_unavailable', 'Bailout context unavailable.', 'watch');
  } else {
    score -= 4;
    addReason(missing, 'bailout_unknown', 'Bailout context unknown.', 'watch');
  }

  if (input.context?.offlinePacketLocalOnly) {
    addReason(caution, 'offline_packet_local_only', 'Offline packet is local-only.', 'watch');
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  let category = campViabilityCategoryFromScore(finalScore);

  if (restrictiveCamp && category !== 'poor_candidate') category = 'poor_candidate';
  const strongBlocked = (
    !supportedCampSource ||
    fixtureCamp ||
    isTrailContextLimited(route) ||
    !hasVerifiedTrailRoute(route) ||
    weather.status === 'unknown' ||
    weather.status === 'unavailable' ||
    daylight.status === 'unknown' ||
    daylight.status === 'unavailable' ||
    daylight.status === 'limited' ||
    remoteness.status === 'unknown' ||
    remoteness.status === 'unavailable' ||
    terrainRisk.category === 'unknown' ||
    terrainRisk.category === 'elevated' ||
    terrainRisk.category === 'severe'
  );
  if (category === 'strong_candidate' && strongBlocked) category = 'caution';
  if (category === 'poor_candidate' && !restrictiveCamp && !caution.some((reason) => reason.tone === 'critical')) category = 'caution';

  const recommendedAction = recommendedActionFor(category, missing, caution);
  return {
    category,
    label: campViabilityV1Label(category),
    score: finalScore,
    headline: `${campViabilityV1Label(category)} - ${recommendedAction.label}`,
    camp,
    route,
    vehicle: {
      status: vStatus,
      label: cleanCampText(input.vehicle?.label),
    },
    weather,
    daylight,
    remoteness,
    terrainRisk,
    bailout,
    missingDataReasons: missing,
    cautionReasons: caution,
    positiveReasons: positive,
    recommendedAction,
    dataConfidence: {
      state: dataConfidenceFor(input, camp, missing, caution),
      knownLimitations: Array.from(new Set([...missing, ...caution].map((reason) => reason.label))),
    },
  };
}

function campFromSnapshot(snapshot: Pick<ActiveTripModeSnapshot, 'campCandidate'> | null | undefined): CampViabilityV1Input['camp'] {
  return snapshot?.campCandidate ?? null;
}

function vehicleFromSnapshot(snapshot: Pick<ActiveTripModeSnapshot, 'vehicle'> | null | undefined): CampViabilityV1Input['vehicle'] {
  if (!snapshot?.vehicle) return { status: 'missing', label: null };
  const complete = !!snapshot.vehicle.id && !!snapshot.vehicle.label && !!snapshot.vehicle.vehicleType && snapshot.vehicle.rangeMiles != null;
  return {
    status: complete ? 'complete' : 'incomplete',
    label: snapshot.vehicle.label,
  };
}

function terrainRiskInput(terrainRisk: unknown): CampViabilityV1Input['terrainRisk'] {
  const risk = terrainRisk as { category?: string | null; label?: string | null; score?: number | null } | null | undefined;
  return {
    category: risk?.category ?? 'unknown',
    label: risk?.label ?? null,
    score: risk?.score ?? null,
  };
}

function statusFromTerrain(terrainRisk: unknown, key: 'weather' | 'daylight' | 'remoteness'): CampViabilityV1StatusInput {
  const risk = terrainRisk as Record<string, { status?: string | null; label?: string | null; score?: number | null } | null | undefined> | null | undefined;
  return {
    status: risk?.[key]?.status ?? 'unknown',
    label: risk?.[key]?.label ?? null,
    score: risk?.[key]?.score ?? null,
  };
}

export function evaluateCampViabilityForActiveTrip(
  snapshot: Partial<ActiveTripModeSnapshot> | null | undefined,
  terrainRisk?: unknown,
): CampViabilityV1Result {
  return evaluateCampViabilityV1({
    camp: campFromSnapshot(snapshot as Pick<ActiveTripModeSnapshot, 'campCandidate'> | null | undefined),
    route: snapshot?.route,
    vehicle: vehicleFromSnapshot(snapshot as Pick<ActiveTripModeSnapshot, 'vehicle'> | null | undefined),
    weather: statusFromTerrain(terrainRisk, 'weather'),
    daylight: statusFromTerrain(terrainRisk, 'daylight'),
    remoteness: statusFromTerrain(terrainRisk, 'remoteness'),
    terrainRisk: terrainRiskInput(terrainRisk),
    bailout: snapshot?.logistics?.bailout,
    dataState: snapshot?.freshness?.state,
  });
}

export function evaluateCampViabilityForOfflineIncidentPacket(
  packet: Partial<OfflineIncidentPacket> | null | undefined,
  terrainRisk?: unknown,
): CampViabilityV1Result {
  return evaluateCampViabilityV1({
    camp: packet?.campCandidate ?? null,
    route: packet?.route,
    vehicle: vehicleFromSnapshot(packet as unknown as Pick<ActiveTripModeSnapshot, 'vehicle'> | null | undefined),
    weather: statusFromTerrain(terrainRisk, 'weather'),
    daylight: statusFromTerrain(terrainRisk, 'daylight'),
    remoteness: statusFromTerrain(terrainRisk, 'remoteness'),
    terrainRisk: terrainRiskInput(terrainRisk),
    bailout: packet?.logistics?.bailout,
    dataState: packet?.dataFreshness?.state,
    context: { offlinePacketLocalOnly: true },
  });
}
