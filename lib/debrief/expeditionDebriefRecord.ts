import type {
  ExpeditionRecapNotableMoment,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
} from '../expedition/expeditionTripRecordTypes';

export type DebriefRecordStatus = 'complete' | 'partial' | 'source_limited' | 'unavailable';

export type DebriefChapterType =
  | 'departure_readiness_baseline'
  | 'route_confidence_changes'
  | 'offline_stale_data_gaps'
  | 'weather_snapshots'
  | 'cad_checkin_incident_moments'
  | 'camp_endpoint_decisions'
  | 'loadout_vehicle_issues'
  | 'recovery_actions'
  | 'next_expedition_recommendations';

export type DebriefSourceSystem =
  | 'readiness'
  | 'route_confidence'
  | 'offline_honesty'
  | 'weather'
  | 'campops'
  | 'fleet'
  | 'loadout'
  | 'incident_recovery'
  | 'convoy_checkin'
  | 'cad'
  | 'route_progress'
  | 'user_entry'
  | 'task_system'
  | 'unknown';

export type DebriefValueState = 'observed' | 'inferred' | 'stale' | 'unavailable';
export type DebriefConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type DebriefFreshness = 'current' | 'stale' | 'expired' | 'unavailable' | 'user_entered';

export type DebriefEvidence = {
  evidenceId: string;
  sourceSystem: DebriefSourceSystem;
  sourceId?: string;
  sourceVersion?: string;
  eventTime: string;
  knownAt: string;
  generatedAt?: string;
  observedAt?: string;
  valueState: DebriefValueState;
  confidence: DebriefConfidence;
  freshness: DebriefFreshness;
  label: string;
  value?: string | number | boolean | null;
  detail?: string;
  privacy?: 'public' | 'permission_limited' | 'restricted';
};

export type DebriefLocationRef = {
  latitude?: number;
  longitude?: number;
  routeId?: string;
  routeGeometryVersion?: string;
  startMeasure?: number;
  endMeasure?: number;
  label?: string;
};

export type DebriefEvent = {
  eventId: string;
  chapterId: DebriefChapterType;
  title: string;
  summary: string;
  eventTime: string;
  knownAt: string;
  location?: DebriefLocationRef;
  evidenceIds: string[];
  relatedSystemIds?: string[];
  severity?: 'info' | 'notice' | 'warning' | 'critical';
};

export type DebriefChapter = {
  chapterId: DebriefChapterType;
  type: DebriefChapterType;
  title: string;
  summary: string;
  order: number;
  eventIds: string[];
  evidenceIds: string[];
  mapOverlayIds: string[];
  recommendationIds: string[];
};

export type DebriefMapOverlayType =
  | 'route_segment'
  | 'event_marker'
  | 'offline_gap'
  | 'stale_span'
  | 'confidence_segment'
  | 'camp_endpoint'
  | 'weather_overlay'
  | 'loadout_issue'
  | 'recovery_action';

export type DebriefMapOverlay = {
  overlayId: string;
  type: DebriefMapOverlayType;
  routeId?: string;
  routeGeometryVersion?: string;
  startMeasure?: number;
  endMeasure?: number;
  latitude?: number;
  longitude?: number;
  label: string;
  confidence?: DebriefConfidence;
  valueState?: DebriefValueState;
  freshness?: DebriefFreshness;
  eventIds: string[];
  evidenceIds: string[];
};

export type DebriefRecommendationTargetArea =
  | 'readiness'
  | 'fleet'
  | 'loadout'
  | 'route_planning'
  | 'check_in_cadence'
  | 'offline_readiness'
  | 'campops'
  | 'weather'
  | 'recovery';

export type DebriefRecommendationState = 'open' | 'accepted' | 'dismissed' | 'converted_to_task';

export type DebriefPrepTaskPayload = {
  title: string;
  description: string;
  targetArea: DebriefRecommendationTargetArea;
  sourceDebriefId: string;
  sourceRecommendationId: string;
  linkedEvidenceIds: string[];
  linkedEventIds: string[];
};

export type DebriefRecommendation = {
  recommendationId: string;
  title: string;
  rationale: string;
  targetArea: DebriefRecommendationTargetArea;
  linkedEvidenceIds: string[];
  linkedEventIds: string[];
  state: DebriefRecommendationState;
  taskPayload: DebriefPrepTaskPayload;
  createdTaskId?: string;
};

export type DebriefSourceCoverageStatus = 'complete' | 'partial' | 'missing' | 'stale' | 'unavailable';

export type DebriefSourceCoverage = {
  sourceSystem: DebriefSourceSystem;
  status: DebriefSourceCoverageStatus;
  availableEvidenceIds: string[];
  missingReason?: string;
  notes?: string[];
};

export type DebriefTripSummary = {
  completionStatus: 'completed' | 'partial' | 'aborted' | 'unknown';
  readinessDelta?: string;
  incidentCount: number;
  offlineGapCount: number;
  topRecommendationIds: string[];
};

export type DebriefRecord = {
  debriefId: string;
  tripId: string;
  routeId?: string;
  routeGeometryVersion?: string;
  status: DebriefRecordStatus;
  generatedAt: string;
  maturityLabel: 'Internal beta';
  tripSummary: DebriefTripSummary;
  chapters: DebriefChapter[];
  events: DebriefEvent[];
  evidence: DebriefEvidence[];
  mapOverlays: DebriefMapOverlay[];
  recommendations: DebriefRecommendation[];
  sourceCoverage: DebriefSourceCoverage[];
  warnings: string[];
};

export type DebriefSelectionState = {
  selectedChapterId?: string;
  selectedEventId?: string;
  selectedMapOverlayId?: string;
  selectedRecommendationId?: string;
  activeTime?: string;
};

export type ExpeditionReplayDebriefFeatureFlags = {
  expeditionReplayDebrief?: boolean | null;
  expeditionReplayDebriefMapEnabled?: boolean | null;
};

type DebriefEvidenceInput = Partial<DebriefEvidence> & {
  evidenceId: string;
  sourceSystem?: DebriefSourceSystem | string;
  restricted?: boolean | null;
};

type DebriefEventInput = Partial<DebriefEvent> & {
  eventId: string;
  chapterId: DebriefChapterType | string;
};

type DebriefMapOverlayInput = Partial<DebriefMapOverlay> & {
  overlayId: string;
  type: DebriefMapOverlayType | string;
};

type DebriefRecommendationInput = Partial<Omit<DebriefRecommendation, 'taskPayload'>> & {
  recommendationId: string;
  title: string;
  rationale: string;
  targetArea: DebriefRecommendationTargetArea | string;
};

export type ExpeditionDebriefRecordInput = {
  debriefId?: string | null;
  tripId: string;
  routeId?: string | null;
  routeGeometryVersion?: string | null;
  generatedAt?: string | null;
  tripSummary?: Partial<DebriefTripSummary> | null;
  evidence?: DebriefEvidenceInput[] | null;
  events?: DebriefEventInput[] | null;
  mapOverlays?: DebriefMapOverlayInput[] | null;
  recommendations?: DebriefRecommendationInput[] | null;
  sourceCoverage?: Array<Partial<DebriefSourceCoverage> & { sourceSystem: DebriefSourceSystem | string }> | null;
  missingSources?: Array<{ sourceSystem: DebriefSourceSystem | string; reason: string }> | null;
  viewerCanSeeRestrictedEvidence?: boolean | null;
};

export const DEBRIEF_CHAPTER_ORDER: DebriefChapterType[] = [
  'departure_readiness_baseline',
  'route_confidence_changes',
  'offline_stale_data_gaps',
  'weather_snapshots',
  'cad_checkin_incident_moments',
  'camp_endpoint_decisions',
  'loadout_vehicle_issues',
  'recovery_actions',
  'next_expedition_recommendations',
];

const CHAPTER_TITLES: Record<DebriefChapterType, string> = {
  departure_readiness_baseline: 'Departure and readiness baseline',
  route_confidence_changes: 'Route confidence changes',
  offline_stale_data_gaps: 'Offline or stale data gaps',
  weather_snapshots: 'Weather snapshots affecting decisions',
  cad_checkin_incident_moments: 'CAD/check-in/incident moments',
  camp_endpoint_decisions: 'Camp endpoint decisions',
  loadout_vehicle_issues: 'Loadout or vehicle issues',
  recovery_actions: 'Recovery actions',
  next_expedition_recommendations: 'Next expedition recommendations',
};

const CHAPTER_SUMMARIES: Record<DebriefChapterType, string> = {
  departure_readiness_baseline: 'Starting readiness, blockers, confidence, vehicle/loadout state, offline package state, and route/camp assumptions known at the time.',
  route_confidence_changes: 'Route confidence changes and uncertainty spans preserved from source-truth route context.',
  offline_stale_data_gaps: 'Offline and stale periods shown as gaps or stale spans, not as confident route knowledge.',
  weather_snapshots: 'Weather snapshots use values known at the time rather than later-corrected or current conditions.',
  cad_checkin_incident_moments: 'CAD, check-in, incident, and assist moments with source/time/confidence context.',
  camp_endpoint_decisions: 'CampOps endpoint decisions, confidence, and stale or source-limited context.',
  loadout_vehicle_issues: 'Fleet, loadout, payload, fuel, water, power, and recovery gear issues tied to evidence.',
  recovery_actions: 'Recovery packet, assist, bailout, repair, or coordination actions linked to supporting records.',
  next_expedition_recommendations: 'Prep recommendations tied to debrief evidence and next-expedition task payloads.',
};

const SOURCE_SYSTEMS = new Set<DebriefSourceSystem>([
  'readiness',
  'route_confidence',
  'offline_honesty',
  'weather',
  'campops',
  'fleet',
  'loadout',
  'incident_recovery',
  'convoy_checkin',
  'cad',
  'route_progress',
  'user_entry',
  'task_system',
  'unknown',
]);

const ROUTE_SPAN_OVERLAY_TYPES = new Set<DebriefMapOverlayType>([
  'route_segment',
  'offline_gap',
  'stale_span',
  'confidence_segment',
  'weather_overlay',
]);

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

function flagEnabled(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 'true' || value === 'TRUE' || value === 'enabled' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'FALSE' || value === 'disabled' || value === 'off') return false;
  return null;
}

export function isExpeditionReplayDebriefFeatureEnabled(flags?: ExpeditionReplayDebriefFeatureFlags | null): boolean {
  const explicit =
    flagEnabled(flags?.expeditionReplayDebrief) ??
    flagEnabled(flags?.expeditionReplayDebriefMapEnabled);
  if (explicit != null) return explicit;
  const globalFlag = (globalThis as { __ECS_EXPEDITION_REPLAY_DEBRIEF__?: unknown }).__ECS_EXPEDITION_REPLAY_DEBRIEF__;
  const globalEnabled = flagEnabled(globalFlag);
  if (globalEnabled != null) return globalEnabled;
  return envFlagEnabled('EXPO_PUBLIC_ECS_EXPEDITION_REPLAY_DEBRIEF') || envFlagEnabled('ECS_EXPEDITION_REPLAY_DEBRIEF');
}

function compactText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeSourceSystem(value: unknown): DebriefSourceSystem {
  const normalized = String(value ?? '').trim() as DebriefSourceSystem;
  return SOURCE_SYSTEMS.has(normalized) ? normalized : 'unknown';
}

function normalizeChapterId(value: unknown): DebriefChapterType {
  const normalized = String(value ?? '') as DebriefChapterType;
  return DEBRIEF_CHAPTER_ORDER.includes(normalized) ? normalized : 'departure_readiness_baseline';
}

function normalizeConfidence(value: unknown): DebriefConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  return 'unknown';
}

function normalizeValueState(value: unknown): DebriefValueState {
  if (value === 'observed' || value === 'inferred' || value === 'stale' || value === 'unavailable') return value;
  return 'unavailable';
}

function normalizeFreshness(value: unknown): DebriefFreshness {
  if (value === 'current' || value === 'stale' || value === 'expired' || value === 'unavailable' || value === 'user_entered') return value;
  return 'unavailable';
}

function normalizeSeverity(value: unknown): DebriefEvent['severity'] {
  if (value === 'info' || value === 'notice' || value === 'warning' || value === 'critical') return value;
  return 'info';
}

function normalizeScalar(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (value == null) return null;
  return String(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  values.forEach((value) => {
    const text = compactText(value);
    if (text && !output.includes(text)) output.push(text);
  });
  return output;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return uniqueStrings(values);
}

function sourceFromTripSource(source: ExpeditionTripSourceLabel | null | undefined): DebriefSourceSystem {
  const raw = String(source?.source ?? '').toLowerCase();
  if (raw.includes('weather')) return 'weather';
  if (raw.includes('recovery')) return 'incident_recovery';
  if (raw.includes('camp')) return 'campops';
  if (raw.includes('route') || raw.includes('navigate') || raw.includes('guidance')) return 'route_progress';
  if (raw.includes('manual')) return 'user_entry';
  return 'unknown';
}

function freshnessFromTripSource(source: ExpeditionTripSourceLabel | null | undefined): DebriefFreshness {
  if (!source) return 'unavailable';
  if (source.quality === 'live') return 'current';
  if (source.quality === 'manual') return 'user_entered';
  if (source.quality === 'stale' || source.quality === 'cached') return 'stale';
  if (source.quality === 'missing') return 'unavailable';
  return 'current';
}

function valueStateFromTripSource(source: ExpeditionTripSourceLabel | null | undefined): DebriefValueState {
  if (!source) return 'unavailable';
  if (source.quality === 'stale' || source.quality === 'cached') return 'stale';
  if (source.quality === 'missing') return 'unavailable';
  if (source.quality === 'estimated' || source.quality === 'mock') return 'inferred';
  return 'observed';
}

function confidenceFromTripSource(source: ExpeditionTripSourceLabel | null | undefined): DebriefConfidence {
  if (!source) return 'unknown';
  if (source.quality === 'live' || source.quality === 'manual') return 'high';
  if (source.quality === 'cached' || source.quality === 'estimated') return 'medium';
  if (source.quality === 'stale' || source.quality === 'mock') return 'low';
  return 'unknown';
}

function locationFromCoordinate(
  coordinate: { lat?: number; lng?: number } | null | undefined,
  routeId?: string | null,
  routeGeometryVersion?: string | null,
  label?: string | null,
): DebriefLocationRef | undefined {
  const latitude = Number(coordinate?.lat);
  const longitude = Number(coordinate?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return {
    latitude,
    longitude,
    ...(routeId ? { routeId } : {}),
    ...(routeGeometryVersion ? { routeGeometryVersion } : {}),
    ...(label ? { label } : {}),
  };
}

function normalizeLocation(
  location: DebriefEventInput['location'] | undefined,
  restricted: boolean,
): DebriefLocationRef | undefined {
  if (!location) return undefined;
  if (restricted) {
    return {
      ...(location.routeId ? { routeId: location.routeId } : {}),
      ...(location.routeGeometryVersion ? { routeGeometryVersion: location.routeGeometryVersion } : {}),
      ...(location.label ? { label: 'Permission-limited location' } : {}),
    };
  }
  return {
    ...(Number.isFinite(Number(location.latitude)) ? { latitude: Number(location.latitude) } : {}),
    ...(Number.isFinite(Number(location.longitude)) ? { longitude: Number(location.longitude) } : {}),
    ...(location.routeId ? { routeId: location.routeId } : {}),
    ...(location.routeGeometryVersion ? { routeGeometryVersion: location.routeGeometryVersion } : {}),
    ...(Number.isFinite(Number(location.startMeasure)) ? { startMeasure: Number(location.startMeasure) } : {}),
    ...(Number.isFinite(Number(location.endMeasure)) ? { endMeasure: Number(location.endMeasure) } : {}),
    ...(location.label ? { label: location.label } : {}),
  };
}

function normalizeEvidence(
  input: DebriefEvidenceInput,
  generatedAt: string,
  viewerCanSeeRestrictedEvidence: boolean,
): { evidence: DebriefEvidence; redacted: boolean } {
  const restricted = input.restricted === true || input.privacy === 'restricted' || input.privacy === 'permission_limited';
  const redacted = restricted && !viewerCanSeeRestrictedEvidence;
  const eventTime = validIso(input.eventTime) ?? generatedAt;
  const knownAt = validIso(input.knownAt) ?? eventTime;
  const label = compactText(input.label) ?? 'Unavailable source evidence';
  if (redacted) {
    return {
      redacted,
      evidence: {
        evidenceId: input.evidenceId,
        sourceSystem: normalizeSourceSystem(input.sourceSystem),
        ...(compactText(input.sourceId) ? { sourceId: compactText(input.sourceId) as string } : {}),
        ...(compactText(input.sourceVersion) ? { sourceVersion: compactText(input.sourceVersion) as string } : {}),
        eventTime,
        knownAt,
        ...(validIso(input.generatedAt) ? { generatedAt: validIso(input.generatedAt) as string } : {}),
        ...(validIso(input.observedAt) ? { observedAt: validIso(input.observedAt) as string } : {}),
        valueState: 'unavailable',
        confidence: 'unknown',
        freshness: 'unavailable',
        label: 'Permission-limited evidence',
        value: null,
        detail: 'Source-limited: this evidence is unavailable for the current viewer.',
        privacy: 'permission_limited',
      },
    };
  }
  return {
    redacted: false,
    evidence: {
      evidenceId: input.evidenceId,
      sourceSystem: normalizeSourceSystem(input.sourceSystem),
      ...(compactText(input.sourceId) ? { sourceId: compactText(input.sourceId) as string } : {}),
      ...(compactText(input.sourceVersion) ? { sourceVersion: compactText(input.sourceVersion) as string } : {}),
      eventTime,
      knownAt,
      ...(validIso(input.generatedAt) ? { generatedAt: validIso(input.generatedAt) as string } : {}),
      ...(validIso(input.observedAt) ? { observedAt: validIso(input.observedAt) as string } : {}),
      valueState: normalizeValueState(input.valueState),
      confidence: normalizeConfidence(input.confidence),
      freshness: normalizeFreshness(input.freshness),
      label,
      value: normalizeScalar(input.value),
      ...(compactText(input.detail) ? { detail: compactText(input.detail) as string } : {}),
      ...(input.privacy ? { privacy: input.privacy } : restricted ? { privacy: 'restricted' as const } : {}),
    },
  };
}

function fallbackEvidenceForEvent(event: DebriefEventInput, generatedAt: string): DebriefEvidence {
  const chapterId = normalizeChapterId(event.chapterId);
  return {
    evidenceId: `missing-evidence:${event.eventId}`,
    sourceSystem: 'unknown',
    eventTime: validIso(event.eventTime) ?? generatedAt,
    knownAt: validIso(event.knownAt) ?? validIso(event.eventTime) ?? generatedAt,
    valueState: 'unavailable',
    confidence: 'unknown',
    freshness: 'unavailable',
    label: `${CHAPTER_TITLES[chapterId]} source evidence unavailable`,
    value: null,
    detail: 'Source-limited: no timestamped evidence was available for this displayed event.',
  };
}

function overlayType(value: unknown): DebriefMapOverlayType {
  const normalized = String(value ?? '') as DebriefMapOverlayType;
  if (
    normalized === 'route_segment' ||
    normalized === 'event_marker' ||
    normalized === 'offline_gap' ||
    normalized === 'stale_span' ||
    normalized === 'confidence_segment' ||
    normalized === 'camp_endpoint' ||
    normalized === 'weather_overlay' ||
    normalized === 'loadout_issue' ||
    normalized === 'recovery_action'
  ) {
    return normalized;
  }
  return 'event_marker';
}

function overlayHasRestrictedEvidence(overlay: DebriefMapOverlayInput, restrictedEvidenceIds: Set<string>): boolean {
  return (overlay.evidenceIds ?? []).some((id) => restrictedEvidenceIds.has(id));
}

function normalizeOverlay(
  input: DebriefMapOverlayInput,
  restrictedEvidenceIds: Set<string>,
): DebriefMapOverlay {
  const type = overlayType(input.type);
  const restricted = overlayHasRestrictedEvidence(input, restrictedEvidenceIds);
  return {
    overlayId: input.overlayId,
    type,
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.routeGeometryVersion ? { routeGeometryVersion: input.routeGeometryVersion } : {}),
    ...(Number.isFinite(Number(input.startMeasure)) && !restricted ? { startMeasure: Number(input.startMeasure) } : {}),
    ...(Number.isFinite(Number(input.endMeasure)) && !restricted ? { endMeasure: Number(input.endMeasure) } : {}),
    ...(Number.isFinite(Number(input.latitude)) && !restricted ? { latitude: Number(input.latitude) } : {}),
    ...(Number.isFinite(Number(input.longitude)) && !restricted ? { longitude: Number(input.longitude) } : {}),
    label: restricted ? 'Permission-limited map detail' : compactText(input.label) ?? 'Debrief map overlay',
    confidence: restricted ? 'unknown' : normalizeConfidence(input.confidence),
    valueState: restricted ? 'unavailable' : normalizeValueState(input.valueState),
    freshness: restricted ? 'unavailable' : normalizeFreshness(input.freshness),
    eventIds: uniqueIds(input.eventIds ?? []),
    evidenceIds: uniqueIds(input.evidenceIds ?? []),
  };
}

function isRouteLinkedOverlay(overlay: DebriefMapOverlay): boolean {
  return ROUTE_SPAN_OVERLAY_TYPES.has(overlay.type) ||
    overlay.routeId != null ||
    overlay.routeGeometryVersion != null ||
    overlay.startMeasure != null ||
    overlay.endMeasure != null;
}

function overlayMatchesRecord(record: Pick<DebriefRecord, 'routeId' | 'routeGeometryVersion'>, overlay: DebriefMapOverlay): boolean {
  if (!isRouteLinkedOverlay(overlay)) return true;
  if (overlay.routeId && record.routeId && overlay.routeId !== record.routeId) return false;
  if (overlay.routeId && !record.routeId) return false;
  if (overlay.routeGeometryVersion && record.routeGeometryVersion && overlay.routeGeometryVersion !== record.routeGeometryVersion) return false;
  if (overlay.routeGeometryVersion && !record.routeGeometryVersion) return false;
  if ((overlay.startMeasure != null || overlay.endMeasure != null) && (!record.routeId || !record.routeGeometryVersion)) return false;
  return true;
}

export function filterDebriefMapOverlaysForRecord(record: Pick<DebriefRecord, 'routeId' | 'routeGeometryVersion' | 'mapOverlays'>): DebriefMapOverlay[] {
  return record.mapOverlays.filter((overlay) => overlayMatchesRecord(record, overlay));
}

function normalizeEvent(
  input: DebriefEventInput,
  generatedAt: string,
  evidenceById: Map<string, DebriefEvidence>,
  restrictedEvidenceIds: Set<string>,
  addedEvidence: DebriefEvidence[],
): DebriefEvent {
  const chapterId = normalizeChapterId(input.chapterId);
  const eventTime = validIso(input.eventTime) ?? generatedAt;
  const knownAt = validIso(input.knownAt) ?? eventTime;
  let evidenceIds = uniqueIds(input.evidenceIds ?? []).filter((id) => evidenceById.has(id));
  if (evidenceIds.length === 0) {
    const fallback = fallbackEvidenceForEvent(input, generatedAt);
    addedEvidence.push(fallback);
    evidenceById.set(fallback.evidenceId, fallback);
    evidenceIds = [fallback.evidenceId];
  }
  const restricted = evidenceIds.some((id) => restrictedEvidenceIds.has(id));
  return {
    eventId: input.eventId,
    chapterId,
    title: compactText(input.title) ?? CHAPTER_TITLES[chapterId],
    summary: compactText(input.summary) ?? CHAPTER_SUMMARIES[chapterId],
    eventTime,
    knownAt,
    ...(input.location ? { location: normalizeLocation(input.location, restricted) } : {}),
    evidenceIds,
    relatedSystemIds: uniqueIds(input.relatedSystemIds ?? [chapterId]),
    severity: normalizeSeverity(input.severity),
  };
}

function normalizeRecommendation(
  input: DebriefRecommendationInput,
  debriefId: string,
): DebriefRecommendation {
  const linkedEvidenceIds = uniqueIds(input.linkedEvidenceIds ?? []);
  const linkedEventIds = uniqueIds(input.linkedEventIds ?? []);
  const targetArea = normalizeTargetArea(input.targetArea);
  const title = compactText(input.title) ?? 'Review debrief recommendation';
  const rationale = compactText(input.rationale) ?? 'Recommendation was generated from deterministic debrief evidence.';
  return {
    recommendationId: input.recommendationId,
    title,
    rationale,
    targetArea,
    linkedEvidenceIds,
    linkedEventIds,
    state: normalizeRecommendationState(input.state),
    taskPayload: {
      title,
      description: rationale,
      targetArea,
      sourceDebriefId: debriefId,
      sourceRecommendationId: input.recommendationId,
      linkedEvidenceIds,
      linkedEventIds,
    },
    ...(compactText(input.createdTaskId) ? { createdTaskId: compactText(input.createdTaskId) as string } : {}),
  };
}

function normalizeTargetArea(value: unknown): DebriefRecommendationTargetArea {
  if (
    value === 'readiness' ||
    value === 'fleet' ||
    value === 'loadout' ||
    value === 'route_planning' ||
    value === 'check_in_cadence' ||
    value === 'offline_readiness' ||
    value === 'campops' ||
    value === 'weather' ||
    value === 'recovery'
  ) {
    return value;
  }
  return 'readiness';
}

function normalizeRecommendationState(value: unknown): DebriefRecommendationState {
  if (value === 'accepted' || value === 'dismissed' || value === 'converted_to_task') return value;
  return 'open';
}

function normalizeCoverageStatus(value: unknown): DebriefSourceCoverageStatus {
  if (value === 'complete' || value === 'partial' || value === 'missing' || value === 'stale' || value === 'unavailable') return value;
  return 'unavailable';
}

function buildSourceCoverage(
  input: ExpeditionDebriefRecordInput,
  evidence: readonly DebriefEvidence[],
): DebriefSourceCoverage[] {
  const coverageBySource = new Map<DebriefSourceSystem, DebriefSourceCoverage>();
  input.sourceCoverage?.forEach((coverage) => {
    const sourceSystem = normalizeSourceSystem(coverage.sourceSystem);
    coverageBySource.set(sourceSystem, {
      sourceSystem,
      status: normalizeCoverageStatus(coverage.status),
      availableEvidenceIds: uniqueIds(coverage.availableEvidenceIds ?? []),
      ...(compactText(coverage.missingReason) ? { missingReason: compactText(coverage.missingReason) as string } : {}),
      ...(coverage.notes?.length ? { notes: uniqueStrings(coverage.notes) } : {}),
    });
  });

  evidence.forEach((item) => {
    if (coverageBySource.has(item.sourceSystem)) {
      const existing = coverageBySource.get(item.sourceSystem);
      if (existing) {
        existing.availableEvidenceIds = uniqueIds([...existing.availableEvidenceIds, item.evidenceId]);
      }
      return;
    }
    coverageBySource.set(item.sourceSystem, {
      sourceSystem: item.sourceSystem,
      status:
        item.valueState === 'unavailable' || item.freshness === 'unavailable'
          ? 'unavailable'
          : item.freshness === 'stale' || item.freshness === 'expired'
            ? 'stale'
            : 'complete',
      availableEvidenceIds: [item.evidenceId],
    });
  });

  input.missingSources?.forEach((missing) => {
    const sourceSystem = normalizeSourceSystem(missing.sourceSystem);
    coverageBySource.set(sourceSystem, {
      sourceSystem,
      status: 'missing',
      availableEvidenceIds: coverageBySource.get(sourceSystem)?.availableEvidenceIds ?? [],
      missingReason: compactText(missing.reason) ?? 'Source history is unavailable.',
    });
  });

  return Array.from(coverageBySource.values()).sort((left, right) => {
    const leftIndex = Array.from(SOURCE_SYSTEMS).indexOf(left.sourceSystem);
    const rightIndex = Array.from(SOURCE_SYSTEMS).indexOf(right.sourceSystem);
    return leftIndex - rightIndex || left.sourceSystem.localeCompare(right.sourceSystem);
  });
}

function chapterHasSourceGap(chapterType: DebriefChapterType, coverage: readonly DebriefSourceCoverage[]): boolean {
  const sourceByChapter: Partial<Record<DebriefChapterType, DebriefSourceSystem[]>> = {
    departure_readiness_baseline: ['readiness'],
    route_confidence_changes: ['route_confidence', 'route_progress'],
    offline_stale_data_gaps: ['offline_honesty'],
    weather_snapshots: ['weather'],
    cad_checkin_incident_moments: ['cad', 'convoy_checkin', 'incident_recovery'],
    camp_endpoint_decisions: ['campops'],
    loadout_vehicle_issues: ['fleet', 'loadout'],
    recovery_actions: ['incident_recovery'],
    next_expedition_recommendations: ['task_system'],
  };
  const sources = sourceByChapter[chapterType] ?? [];
  return sources.some((source) => coverage.some((item) => item.sourceSystem === source && item.status !== 'complete'));
}

function buildChapters(args: {
  events: DebriefEvent[];
  evidence: DebriefEvidence[];
  overlays: DebriefMapOverlay[];
  recommendations: DebriefRecommendation[];
  coverage: DebriefSourceCoverage[];
}): DebriefChapter[] {
  return DEBRIEF_CHAPTER_ORDER.map((type, index) => {
    const events = args.events.filter((event) => event.chapterId === type);
    const eventIds = events.map((event) => event.eventId);
    const evidenceIds = uniqueIds([
      ...events.flatMap((event) => event.evidenceIds),
      ...args.recommendations
        .filter((recommendation) => recommendation.linkedEventIds.some((eventId) => eventIds.includes(eventId)))
        .flatMap((recommendation) => recommendation.linkedEvidenceIds),
    ]);
    const mapOverlayIds = args.overlays
      .filter((overlay) => overlay.eventIds.some((eventId) => eventIds.includes(eventId)) || overlay.evidenceIds.some((id) => evidenceIds.includes(id)))
      .map((overlay) => overlay.overlayId);
    const recommendationIds = args.recommendations
      .filter((recommendation) => (
        recommendation.linkedEventIds.some((eventId) => eventIds.includes(eventId)) ||
        recommendation.linkedEvidenceIds.some((id) => evidenceIds.includes(id)) ||
        (type === 'next_expedition_recommendations' && recommendation.state !== 'dismissed')
      ))
      .map((recommendation) => recommendation.recommendationId);
    const emptyOrLimited = events.length === 0 || chapterHasSourceGap(type, args.coverage);
    return {
      chapterId: type,
      type,
      title: CHAPTER_TITLES[type],
      summary: emptyOrLimited
        ? `${CHAPTER_SUMMARIES[type]} Source-limited or unavailable records are labeled in the detail view.`
        : CHAPTER_SUMMARIES[type],
      order: index + 1,
      eventIds,
      evidenceIds,
      mapOverlayIds,
      recommendationIds,
    };
  });
}

function buildWarnings(args: {
  coverage: DebriefSourceCoverage[];
  suppressedOverlayIds: string[];
  redactedEvidenceIds: string[];
}): string[] {
  return uniqueStrings([
    ...args.coverage
      .filter((coverage) => coverage.status === 'missing' || coverage.status === 'unavailable' || coverage.status === 'partial' || coverage.status === 'stale')
      .map((coverage) => coverage.missingReason ?? `${coverage.sourceSystem.replace(/_/g, ' ')} source coverage is ${coverage.status}.`),
    ...args.suppressedOverlayIds.map((overlayId) => `Map overlay ${overlayId} was suppressed because route geometry did not match the DebriefRecord.`),
    ...args.redactedEvidenceIds.map((evidenceId) => `Source-limited: ${evidenceId} is permission-limited for this viewer.`),
  ]);
}

function computeStatus(args: {
  tripId: string;
  evidence: readonly DebriefEvidence[];
  events: readonly DebriefEvent[];
  coverage: readonly DebriefSourceCoverage[];
  warnings: readonly string[];
  redactedEvidenceIds: readonly string[];
}): DebriefRecordStatus {
  if (!compactText(args.tripId)) return 'unavailable';
  if (args.events.length === 0 && args.evidence.length === 0) return 'source_limited';
  if (
    args.redactedEvidenceIds.length > 0 ||
    args.coverage.some((coverage) => coverage.status === 'missing' || coverage.status === 'unavailable') ||
    args.evidence.some((item) => item.valueState === 'unavailable' || item.freshness === 'unavailable')
  ) {
    return 'source_limited';
  }
  if (
    args.warnings.length > 0 ||
    args.coverage.some((coverage) => coverage.status === 'partial' || coverage.status === 'stale') ||
    args.evidence.some((item) => item.valueState === 'stale' || item.freshness === 'stale' || item.freshness === 'expired')
  ) {
    return 'partial';
  }
  return 'complete';
}

function defaultTripSummary(input?: Partial<DebriefTripSummary> | null): DebriefTripSummary {
  return {
    completionStatus: input?.completionStatus ?? 'unknown',
    ...(compactText(input?.readinessDelta) ? { readinessDelta: compactText(input?.readinessDelta) as string } : {}),
    incidentCount: Math.max(0, Math.round(Number(input?.incidentCount ?? 0))),
    offlineGapCount: Math.max(0, Math.round(Number(input?.offlineGapCount ?? 0))),
    topRecommendationIds: uniqueIds(input?.topRecommendationIds ?? []),
  };
}

export function buildExpeditionDebriefRecord(input: ExpeditionDebriefRecordInput): DebriefRecord {
  const generatedAt = validIso(input.generatedAt) ?? new Date().toISOString();
  const debriefId = compactText(input.debriefId) ?? `debrief:${input.tripId}`;
  const viewerCanSeeRestrictedEvidence = input.viewerCanSeeRestrictedEvidence === true;
  const normalizedEvidence: DebriefEvidence[] = [];
  const evidenceById = new Map<string, DebriefEvidence>();
  const redactedEvidenceIds = new Set<string>();
  const originallyRestrictedEvidenceIds = new Set<string>();

  input.evidence?.forEach((item) => {
    if (item.restricted === true || item.privacy === 'restricted' || item.privacy === 'permission_limited') {
      originallyRestrictedEvidenceIds.add(item.evidenceId);
    }
    const normalized = normalizeEvidence(item, generatedAt, viewerCanSeeRestrictedEvidence);
    normalizedEvidence.push(normalized.evidence);
    evidenceById.set(normalized.evidence.evidenceId, normalized.evidence);
    if (normalized.redacted) redactedEvidenceIds.add(normalized.evidence.evidenceId);
  });

  const addedEvidence: DebriefEvidence[] = [];
  const events = (input.events ?? [])
    .map((eventInput) => normalizeEvent(eventInput, generatedAt, evidenceById, redactedEvidenceIds, addedEvidence))
    .sort((left, right) => Date.parse(left.eventTime) - Date.parse(right.eventTime) || left.eventId.localeCompare(right.eventId));
  const evidence = [...normalizedEvidence, ...addedEvidence];
  const overlaysBeforeFilter = (input.mapOverlays ?? []).map((overlay) => normalizeOverlay(overlay, redactedEvidenceIds));
  const routeIdentity = {
    routeId: compactText(input.routeId) ?? undefined,
    routeGeometryVersion: compactText(input.routeGeometryVersion) ?? undefined,
  };
  const mapOverlays = overlaysBeforeFilter.filter((overlay) => overlayMatchesRecord(routeIdentity, overlay));
  const suppressedOverlayIds = overlaysBeforeFilter
    .filter((overlay) => !overlayMatchesRecord(routeIdentity, overlay))
    .map((overlay) => overlay.overlayId);
  const recommendations = (input.recommendations ?? []).map((recommendation) => normalizeRecommendation(recommendation, debriefId));
  const sourceCoverage = buildSourceCoverage(input, evidence);
  const warnings = buildWarnings({
    coverage: sourceCoverage,
    suppressedOverlayIds,
    redactedEvidenceIds: Array.from(redactedEvidenceIds),
  });
  const chapters = buildChapters({ events, evidence, overlays: mapOverlays, recommendations, coverage: sourceCoverage });
  const status = computeStatus({
    tripId: input.tripId,
    evidence,
    events,
    coverage: sourceCoverage,
    warnings,
    redactedEvidenceIds: Array.from(redactedEvidenceIds),
  });

  return {
    debriefId,
    tripId: input.tripId,
    ...(routeIdentity.routeId ? { routeId: routeIdentity.routeId } : {}),
    ...(routeIdentity.routeGeometryVersion ? { routeGeometryVersion: routeIdentity.routeGeometryVersion } : {}),
    status,
    generatedAt,
    maturityLabel: 'Internal beta',
    tripSummary: defaultTripSummary(input.tripSummary),
    chapters,
    events,
    evidence,
    mapOverlays,
    recommendations,
    sourceCoverage,
    warnings,
  };
}

export function createDebriefPrepTaskPayload(
  record: Pick<DebriefRecord, 'recommendations'>,
  recommendationId: string,
): DebriefPrepTaskPayload | null {
  const recommendation = record.recommendations.find((item) => item.recommendationId === recommendationId);
  if (!recommendation) return null;
  if (recommendation.state === 'converted_to_task' || recommendation.createdTaskId) return null;
  return {
    ...recommendation.taskPayload,
    linkedEvidenceIds: [...recommendation.linkedEvidenceIds],
    linkedEventIds: [...recommendation.linkedEventIds],
  };
}

export function getInitialDebriefSelectionState(record: DebriefRecord): DebriefSelectionState {
  const firstChapter = record.chapters[0];
  const firstEvent = firstChapter ? record.events.find((event) => firstChapter.eventIds.includes(event.eventId)) : null;
  return {
    selectedChapterId: firstChapter?.chapterId,
    selectedEventId: firstEvent?.eventId,
    selectedMapOverlayId: firstEvent
      ? record.mapOverlays.find((overlay) => overlay.eventIds.includes(firstEvent.eventId))?.overlayId
      : undefined,
    activeTime: firstEvent?.eventTime,
  };
}

export function selectDebriefChapter(
  record: DebriefRecord,
  state: DebriefSelectionState,
  chapterId: string,
): DebriefSelectionState {
  const chapter = record.chapters.find((item) => item.chapterId === chapterId);
  if (!chapter) return state;
  const event = record.events.find((item) => chapter.eventIds.includes(item.eventId));
  const overlay = event
    ? record.mapOverlays.find((item) => item.eventIds.includes(event.eventId))
    : record.mapOverlays.find((item) => chapter.mapOverlayIds.includes(item.overlayId));
  return {
    selectedChapterId: chapter.chapterId,
    selectedEventId: event?.eventId,
    selectedMapOverlayId: overlay?.overlayId,
    selectedRecommendationId: chapter.recommendationIds[0],
    activeTime: event?.eventTime ?? state.activeTime,
  };
}

export function selectDebriefEvent(
  record: DebriefRecord,
  state: DebriefSelectionState,
  eventId: string,
): DebriefSelectionState {
  const event = record.events.find((item) => item.eventId === eventId);
  if (!event) return state;
  const overlay = record.mapOverlays.find((item) => item.eventIds.includes(event.eventId));
  const recommendation = record.recommendations.find((item) => item.linkedEventIds.includes(event.eventId));
  return {
    selectedChapterId: event.chapterId,
    selectedEventId: event.eventId,
    selectedMapOverlayId: overlay?.overlayId,
    selectedRecommendationId: recommendation?.recommendationId,
    activeTime: event.eventTime,
  };
}

export function selectDebriefMapOverlay(
  record: DebriefRecord,
  state: DebriefSelectionState,
  overlayId: string,
): DebriefSelectionState {
  const overlay = record.mapOverlays.find((item) => item.overlayId === overlayId);
  if (!overlay) return state;
  const event = record.events.find((item) => overlay.eventIds.includes(item.eventId));
  const chapterId = event?.chapterId ?? record.chapters.find((item) => item.mapOverlayIds.includes(overlay.overlayId))?.chapterId;
  return {
    selectedChapterId: chapterId,
    selectedEventId: event?.eventId,
    selectedMapOverlayId: overlay.overlayId,
    selectedRecommendationId: event
      ? record.recommendations.find((item) => item.linkedEventIds.includes(event.eventId))?.recommendationId
      : state.selectedRecommendationId,
    activeTime: event?.eventTime ?? state.activeTime,
  };
}

export function selectDebriefRecommendation(
  record: DebriefRecord,
  state: DebriefSelectionState,
  recommendationId: string,
): DebriefSelectionState {
  const recommendation = record.recommendations.find((item) => item.recommendationId === recommendationId);
  if (!recommendation) return state;
  const event = record.events.find((item) => recommendation.linkedEventIds.includes(item.eventId));
  const chapter = event
    ? record.chapters.find((item) => item.chapterId === event.chapterId)
    : record.chapters.find((item) => item.recommendationIds.includes(recommendation.recommendationId));
  const overlay = event
    ? record.mapOverlays.find((item) => item.eventIds.includes(event.eventId))
    : record.mapOverlays.find((item) => item.evidenceIds.some((id) => recommendation.linkedEvidenceIds.includes(id)));
  return {
    selectedChapterId: chapter?.chapterId ?? state.selectedChapterId,
    selectedEventId: event?.eventId ?? state.selectedEventId,
    selectedMapOverlayId: overlay?.overlayId ?? state.selectedMapOverlayId,
    selectedRecommendationId: recommendation.recommendationId,
    activeTime: event?.eventTime ?? state.activeTime,
  };
}

function sourceEvidence(
  evidenceId: string,
  sourceSystem: DebriefSourceSystem,
  eventTime: string,
  label: string,
  value: string | number | boolean | null,
  source?: ExpeditionTripSourceLabel | null,
  options: Partial<DebriefEvidence> = {},
): DebriefEvidenceInput {
  return {
    evidenceId,
    sourceSystem: sourceSystem ?? sourceFromTripSource(source),
    sourceId: source?.source,
    sourceVersion: source?.quality,
    eventTime,
    knownAt: source?.capturedAt ?? eventTime,
    generatedAt: source?.capturedAt ?? eventTime,
    valueState: options.valueState ?? valueStateFromTripSource(source),
    confidence: options.confidence ?? confidenceFromTripSource(source),
    freshness: options.freshness ?? freshnessFromTripSource(source),
    label,
    value,
    detail: options.detail ?? `${label} known at the time from ${source?.source ?? sourceSystem}.`,
  };
}

function eventFromEvidence(
  eventId: string,
  chapterId: DebriefChapterType,
  title: string,
  summary: string,
  evidenceIds: string[],
  eventTime: string,
  knownAt: string,
  location?: DebriefLocationRef,
): DebriefEventInput {
  return {
    eventId,
    chapterId,
    title,
    summary,
    eventTime,
    knownAt,
    ...(location ? { location } : {}),
    evidenceIds,
    relatedSystemIds: [chapterId],
    severity: 'notice',
  };
}

function sourceLimitedChapterEvidence(chapterId: DebriefChapterType, trip: ExpeditionTripRecord): DebriefEvidenceInput {
  const timestamp = trip.completedAt ?? trip.updatedAt ?? trip.startedAt;
  return {
    evidenceId: `source-limited:${trip.id}:${chapterId}`,
    sourceSystem: 'unknown',
    eventTime: timestamp,
    knownAt: timestamp,
    valueState: 'unavailable',
    confidence: 'unknown',
    freshness: 'unavailable',
    label: `${CHAPTER_TITLES[chapterId]} unavailable`,
    value: null,
    detail: 'Source-limited: ECS did not preserve timestamped evidence for this chapter.',
  };
}

function sourceLimitedChapterEvent(chapterId: DebriefChapterType, trip: ExpeditionTripRecord): DebriefEventInput {
  const timestamp = trip.completedAt ?? trip.updatedAt ?? trip.startedAt;
  return eventFromEvidence(
    `source-limited:${trip.id}:${chapterId}`,
    chapterId,
    CHAPTER_TITLES[chapterId],
    `${CHAPTER_TITLES[chapterId]} is source-limited for this trip record; ECS will not infer missing historical facts.`,
    [`source-limited:${trip.id}:${chapterId}`],
    timestamp,
    timestamp,
  );
}

function momentSourceSystem(moment: ExpeditionRecapNotableMoment): DebriefSourceSystem {
  if (moment.type === 'weather_change') return 'weather';
  if (moment.type === 'terrain_risk_warning' || moment.type === 'route_deviation' || moment.type === 'reroute_accepted') return 'route_confidence';
  if (moment.type === 'recovery_tools_opened') return 'incident_recovery';
  return 'route_progress';
}

export function buildExpeditionDebriefRecordFromTripRecord(
  trip: ExpeditionTripRecord,
  options: { viewerCanSeeRestrictedEvidence?: boolean | null } = {},
): DebriefRecord {
  const generatedAt = new Date().toISOString();
  const routeGeometryVersion = trip.recap?.routeSummary.routeGeometryReference ?? `trip-record:${trip.id}:routeGeometry:${trip.schemaVersion}`;
  const routeId = trip.routeId ?? trip.guidanceSessionId ?? trip.id;
  const evidence: DebriefEvidenceInput[] = [];
  const events: DebriefEventInput[] = [];
  const overlays: DebriefMapOverlayInput[] = [];

  const addSourceLimited = (chapterId: DebriefChapterType) => {
    evidence.push(sourceLimitedChapterEvidence(chapterId, trip));
    events.push(sourceLimitedChapterEvent(chapterId, trip));
  };

  evidence.push(sourceEvidence(
    `readiness:${trip.id}:baseline`,
    'readiness',
    trip.startedAt,
    'Departure readiness baseline',
    trip.status === 'completed' ? 'completed trip record available' : trip.status,
    trip.dataUsed[0] ?? null,
    { confidence: trip.status === 'completed' ? 'medium' : 'unknown' },
  ));
  events.push(eventFromEvidence(
    `event:${trip.id}:readiness-baseline`,
    'departure_readiness_baseline',
    'Departure readiness baseline',
    'Completed trip context is preserved as the historical readiness baseline for replay.',
    [`readiness:${trip.id}:baseline`],
    trip.startedAt,
    trip.dataUsed[0]?.capturedAt ?? trip.startedAt,
    locationFromCoordinate(trip.startCoordinate, routeId, routeGeometryVersion, 'Start'),
  ));

  if (trip.routeGeometry.length > 1 || trip.terrainRiskSnapshots.length > 0 || (trip.recap?.expeditionEvents.notableMoments ?? []).some((moment) => momentSourceSystem(moment) === 'route_confidence')) {
    const routeTime = trip.terrainRiskSnapshots[0]?.capturedAt ?? trip.startedAt;
    evidence.push(sourceEvidence(
      `route-confidence:${trip.id}:summary`,
      'route_confidence',
      routeTime,
      'Route confidence and condition timeline',
      trip.terrainRiskSnapshots.length > 0 ? `${trip.terrainRiskSnapshots.length} terrain or confidence event(s)` : 'route geometry preserved',
      trip.terrainRiskSnapshots[0]?.source ?? trip.dataUsed[0] ?? null,
      { confidence: trip.terrainRiskSnapshots.length > 0 ? 'medium' : 'unknown' },
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:route-confidence`,
      'route_confidence_changes',
      'Route confidence review',
      'Route confidence spans are shown as historical context and do not rerank the completed route.',
      [`route-confidence:${trip.id}:summary`],
      routeTime,
      trip.terrainRiskSnapshots[0]?.source?.capturedAt ?? routeTime,
      locationFromCoordinate(trip.terrainRiskSnapshots[0]?.coordinate ?? trip.startCoordinate, routeId, routeGeometryVersion, 'Route confidence span'),
    ));
    overlays.push({
      overlayId: `overlay:${trip.id}:route-confidence`,
      type: 'confidence_segment',
      routeId,
      routeGeometryVersion,
      startMeasure: 0,
      endMeasure: Math.max(1, trip.totalDistanceMiles ?? trip.routeGeometry.length),
      label: 'Route confidence context',
      confidence: trip.terrainRiskSnapshots.length > 0 ? 'medium' : 'unknown',
      valueState: trip.terrainRiskSnapshots.length > 0 ? 'observed' : 'inferred',
      freshness: 'current',
      eventIds: [`event:${trip.id}:route-confidence`],
      evidenceIds: [`route-confidence:${trip.id}:summary`],
    });
  } else {
    addSourceLimited('route_confidence_changes');
  }

  const offlineSources = trip.dataUsed.filter((source) => source.quality === 'cached' || source.quality === 'stale' || source.quality === 'missing');
  if (offlineSources.length > 0) {
    const first = offlineSources[0];
    evidence.push(sourceEvidence(
      `offline:${trip.id}:gaps`,
      'offline_honesty',
      first.capturedAt,
      'Offline or stale data gap',
      `${offlineSources.length} cached/stale/missing source(s) in the trip record`,
      first,
      { valueState: first.quality === 'missing' ? 'unavailable' : 'stale', confidence: 'low', freshness: first.quality === 'missing' ? 'unavailable' : 'stale' },
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:offline-gap`,
      'offline_stale_data_gaps',
      'Offline or stale data gap',
      'Offline/stale replay spans are preserved as gaps, not confident route knowledge.',
      [`offline:${trip.id}:gaps`],
      first.capturedAt,
      first.capturedAt,
    ));
    overlays.push({
      overlayId: `overlay:${trip.id}:offline-gap`,
      type: 'offline_gap',
      routeId,
      routeGeometryVersion,
      startMeasure: 0,
      endMeasure: Math.max(1, (trip.totalDistanceMiles ?? 1) * 0.25),
      label: 'Offline or stale gap',
      confidence: 'low',
      valueState: first.quality === 'missing' ? 'unavailable' : 'stale',
      freshness: first.quality === 'missing' ? 'unavailable' : 'stale',
      eventIds: [`event:${trip.id}:offline-gap`],
      evidenceIds: [`offline:${trip.id}:gaps`],
    });
  } else {
    addSourceLimited('offline_stale_data_gaps');
  }

  if (trip.weatherSnapshots.length > 0) {
    trip.weatherSnapshots.slice(0, 3).forEach((snapshot, index) => {
      const evidenceId = `weather:${trip.id}:${snapshot.id}`;
      evidence.push(sourceEvidence(
        evidenceId,
        'weather',
        snapshot.capturedAt,
        'Weather snapshot',
        [snapshot.summary, snapshot.temperatureF != null ? `${snapshot.temperatureF} F` : null, snapshot.windMph != null ? `${snapshot.windMph} mph wind` : null].filter(Boolean).join(' / ') || 'Weather snapshot',
        snapshot.source,
      ));
      events.push(eventFromEvidence(
        `event:${trip.id}:weather:${index}`,
        'weather_snapshots',
        'Weather known at the time',
        'Weather value is the historical snapshot ECS had at the event time.',
        [evidenceId],
        snapshot.capturedAt,
        snapshot.source.capturedAt,
        locationFromCoordinate(snapshot.coordinate, routeId, routeGeometryVersion, 'Weather snapshot'),
      ));
      if (snapshot.coordinate) {
        overlays.push({
          overlayId: `overlay:${trip.id}:weather:${index}`,
          type: 'weather_overlay',
          routeId,
          routeGeometryVersion,
          label: snapshot.summary ?? 'Weather snapshot',
          confidence: confidenceFromTripSource(snapshot.source),
          valueState: valueStateFromTripSource(snapshot.source),
          freshness: freshnessFromTripSource(snapshot.source),
          eventIds: [`event:${trip.id}:weather:${index}`],
          evidenceIds: [evidenceId],
        });
      }
    });
  } else {
    addSourceLimited('weather_snapshots');
  }

  const incidentMoments = [
    ...trip.notableMoments.filter((moment) => moment.type === 'recovery_used' || moment.type === 'route_deviation'),
    ...trip.deviations,
  ];
  if (incidentMoments.length > 0) {
    const item = incidentMoments[0] as any;
    const capturedAt = item.capturedAt ?? trip.updatedAt;
    const source = item.source ?? trip.dataUsed[0] ?? null;
    evidence.push(sourceEvidence(
      `cad:${trip.id}:incident`,
      sourceFromTripSource(source) === 'incident_recovery' ? 'incident_recovery' : 'cad',
      capturedAt,
      'CAD/check-in/incident moment',
      item.title ?? item.statusLabel ?? 'Trip event recorded',
      source,
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:incident`,
      'cad_checkin_incident_moments',
      'CAD/check-in/incident moment',
      'Incident and check-in context is shown from preserved source records only.',
      [`cad:${trip.id}:incident`],
      capturedAt,
      source?.capturedAt ?? capturedAt,
      locationFromCoordinate(item.coordinate, routeId, routeGeometryVersion, 'Incident moment'),
    ));
  } else {
    addSourceLimited('cad_checkin_incident_moments');
  }

  if (trip.campCandidatesViewed.length > 0) {
    const camp = trip.campCandidatesViewed[0];
    evidence.push(sourceEvidence(
      `campops:${trip.id}:decision`,
      'campops',
      camp.viewedAt,
      'Camp endpoint decision context',
      camp.title ?? 'Camp candidate viewed',
      camp.source,
      { confidence: confidenceFromTripSource(camp.source) === 'high' ? 'medium' : confidenceFromTripSource(camp.source) },
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:camp`,
      'camp_endpoint_decisions',
      'Camp endpoint decision',
      'Camp endpoint context is informational and retains its source confidence.',
      [`campops:${trip.id}:decision`],
      camp.viewedAt,
      camp.source.capturedAt,
      locationFromCoordinate(camp.coordinate, routeId, routeGeometryVersion, camp.title),
    ));
    overlays.push({
      overlayId: `overlay:${trip.id}:camp`,
      type: 'camp_endpoint',
      ...(locationFromCoordinate(camp.coordinate, routeId, routeGeometryVersion, camp.title) ?? {}),
      label: camp.title ?? 'Camp endpoint',
      confidence: confidenceFromTripSource(camp.source),
      valueState: valueStateFromTripSource(camp.source),
      freshness: freshnessFromTripSource(camp.source),
      eventIds: [`event:${trip.id}:camp`],
      evidenceIds: [`campops:${trip.id}:decision`],
    });
  } else {
    addSourceLimited('camp_endpoint_decisions');
  }

  if (trip.generatedSummary || trip.totalDistanceMiles != null || trip.totalElevationGainFt != null) {
    const timestamp = trip.generatedSummary?.generatedAt ?? trip.completedAt ?? trip.updatedAt;
    const source = trip.generatedSummary?.source ?? trip.dataUsed[0] ?? null;
    evidence.push(sourceEvidence(
      `loadout:${trip.id}:vehicle-context`,
      'loadout',
      timestamp,
      'Loadout or vehicle context',
      trip.generatedSummary?.text ?? 'Completed trip metrics available for loadout review',
      source,
      { confidence: 'medium', valueState: 'inferred' },
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:loadout`,
      'loadout_vehicle_issues',
      'Loadout or vehicle context',
      'Loadout/vehicle implications are limited to saved trip context unless explicit source records exist.',
      [`loadout:${trip.id}:vehicle-context`],
      timestamp,
      source?.capturedAt ?? timestamp,
    ));
  } else {
    addSourceLimited('loadout_vehicle_issues');
  }

  if (trip.recoveryPanelUsed.length > 0) {
    const recovery = trip.recoveryPanelUsed[0];
    evidence.push(sourceEvidence(
      `recovery:${trip.id}:action`,
      'incident_recovery',
      recovery.usedAt,
      'Recovery action',
      recovery.context ?? 'Recovery panel opened',
      recovery.source,
    ));
    events.push(eventFromEvidence(
      `event:${trip.id}:recovery`,
      'recovery_actions',
      'Recovery action',
      'Recovery actions are shown as preserved review context, not as emergency dispatch claims.',
      [`recovery:${trip.id}:action`],
      recovery.usedAt,
      recovery.source.capturedAt,
    ));
    overlays.push({
      overlayId: `overlay:${trip.id}:recovery`,
      type: 'recovery_action',
      label: recovery.context ?? 'Recovery action',
      confidence: confidenceFromTripSource(recovery.source),
      valueState: valueStateFromTripSource(recovery.source),
      freshness: freshnessFromTripSource(recovery.source),
      eventIds: [`event:${trip.id}:recovery`],
      evidenceIds: [`recovery:${trip.id}:action`],
    });
  } else {
    addSourceLimited('recovery_actions');
  }

  const recommendations: DebriefRecommendationInput[] = [];
  if (offlineSources.length > 0) {
    recommendations.push({
      recommendationId: `recommendation:${trip.id}:offline-refresh`,
      title: 'Refresh offline route package before the next expedition',
      rationale: 'The replay includes cached, stale, missing, or source-limited offline evidence.',
      targetArea: 'offline_readiness',
      linkedEvidenceIds: [`offline:${trip.id}:gaps`],
      linkedEventIds: [`event:${trip.id}:offline-gap`],
      state: 'open',
    });
  }
  if (trip.recoveryPanelUsed.length > 0) {
    recommendations.push({
      recommendationId: `recommendation:${trip.id}:recovery-review`,
      title: 'Review recovery actions before the next route',
      rationale: 'Recovery context was part of this trip replay and should be converted into preparation work if it represents a real fix.',
      targetArea: 'recovery',
      linkedEvidenceIds: [`recovery:${trip.id}:action`],
      linkedEventIds: [`event:${trip.id}:recovery`],
      state: 'open',
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      recommendationId: `recommendation:${trip.id}:route-review`,
      title: 'Review route evidence before reusing this trip plan',
      rationale: 'Replay evidence is source-limited in one or more chapters, so next-trip prep should verify route, weather, and offline data again.',
      targetArea: 'route_planning',
      linkedEvidenceIds: [`readiness:${trip.id}:baseline`],
      linkedEventIds: [`event:${trip.id}:readiness-baseline`],
      state: 'open',
    });
  }
  evidence.push({
    evidenceId: `task:${trip.id}:recommendations`,
    sourceSystem: 'task_system',
    eventTime: trip.completedAt ?? trip.updatedAt,
    knownAt: trip.completedAt ?? trip.updatedAt,
    valueState: 'inferred',
    confidence: 'medium',
    freshness: 'current',
    label: 'Next expedition recommendations',
    value: `${recommendations.length} recommendation(s)`,
    detail: 'Recommendations are generated from deterministic debrief record fields.',
  });
  events.push(eventFromEvidence(
    `event:${trip.id}:recommendations`,
    'next_expedition_recommendations',
    'Next expedition recommendations',
    'Recommendations preserve linked events and evidence for prep-task creation.',
    [`task:${trip.id}:recommendations`, ...(recommendations[0]?.linkedEvidenceIds ?? [])],
    trip.completedAt ?? trip.updatedAt,
    trip.completedAt ?? trip.updatedAt,
  ));

  const incidentCount = trip.recoveryPanelUsed.length + trip.deviations.length + trip.notableMoments.filter((moment) => moment.type === 'recovery_used').length;
  const offlineGapCount = offlineSources.length;
  return buildExpeditionDebriefRecord({
    debriefId: `debrief:${trip.id}:replay`,
    tripId: trip.id,
    routeId,
    routeGeometryVersion,
    generatedAt,
    tripSummary: {
      completionStatus: trip.status === 'completed' ? 'completed' : trip.status === 'cancelled' ? 'aborted' : 'partial',
      readinessDelta: trip.status === 'completed' ? 'completed trip record' : undefined,
      incidentCount,
      offlineGapCount,
      topRecommendationIds: recommendations.slice(0, 3).map((recommendation) => recommendation.recommendationId),
    },
    evidence,
    events,
    mapOverlays: overlays,
    recommendations,
    missingSources: [
      ...(trip.weatherSnapshots.length === 0 ? [{ sourceSystem: 'weather', reason: 'Weather history is unavailable; ECS will not use current weather as historical weather.' }] : []),
      ...(offlineSources.length === 0 ? [{ sourceSystem: 'offline_honesty', reason: 'Offline replay metadata is unavailable; ECS will not infer that no offline gaps occurred.' }] : []),
      ...(trip.campCandidatesViewed.length === 0 ? [{ sourceSystem: 'campops', reason: 'Camp endpoint decision history is unavailable for this trip.' }] : []),
    ],
    viewerCanSeeRestrictedEvidence: options.viewerCanSeeRestrictedEvidence,
  });
}
