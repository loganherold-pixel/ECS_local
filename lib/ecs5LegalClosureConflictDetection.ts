import type { ObservationGeometry } from './ecs5ObservationPipeline';
import {
  calculateECS5SourceConfidence,
  type ConfidenceEvidenceSource,
  type SourceConfidenceScore,
} from './ecs5SourceConfidence';

export type ConflictSeverity = 'blocker' | 'critical' | 'warning' | 'info';
export type SegmentLegalStatus = 'open' | 'closed' | 'seasonally_closed' | 'restricted' | 'permit_required' | 'private' | 'unknown';
export type SegmentClosureStatus = 'open' | 'active_closure' | 'expired' | 'stale' | 'unknown';
export type SegmentPassabilityStatus = 'passable' | 'impaired' | 'impassable' | 'unknown';
export type SegmentSafetyRiskStatus = 'low' | 'watch' | 'warning' | 'critical' | 'unknown';
export type RecommendedConflictAction =
  | 'proceed_with_caution'
  | 'verify_with_managing_agency'
  | 'avoid_segment'
  | 'do_not_travel'
  | 'reroute'
  | 'use_bailout'
  | 'delay_departure'
  | 'manual_review_required';

export type ConflictType =
  | 'official_closure_vs_static_open'
  | 'community_open_vs_official_closed'
  | 'community_closed_vs_official_open'
  | 'agency_a_open_agency_b_closed'
  | 'route_crosses_private_or_unknown_access'
  | 'legal_open_but_condition_impassable'
  | 'season_mismatch'
  | 'vehicle_class_mismatch'
  | 'closure_geometry_intersection'
  | 'expired_or_stale_closure'
  | 'unknown_jurisdiction'
  | 'fire_perimeter_intersects_route'
  | 'evacuation_or_emergency_notice_intersects_route'
  | 'weather_alert_intersects_route'
  | 'smoke_aqi_health_risk';

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface EvidenceRef {
  id: string;
  sourceObservationId?: string | null;
  providerId?: string | null;
  label: string;
  evidenceUrl?: string | null;
  observedAt?: string | null;
}

export interface LegalAccessRecord {
  id: string;
  sourceObservationId: string;
  agency: string;
  jurisdiction: string;
  geometry: ObservationGeometry | null;
  allowedVehicleClasses: string[];
  seasonalRules: Array<string | { start?: string; end?: string; status?: SegmentLegalStatus; label?: string }>;
  legalStatus: SegmentLegalStatus;
  effectiveStartAt?: string | null;
  effectiveEndAt?: string | null;
  confidenceScore: number;
  evidence: EvidenceRef[];
}

export interface ClosureRecord {
  id: string;
  sourceObservationId: string;
  agency: string;
  jurisdiction: string;
  geometry: ObservationGeometry | null;
  closureType: string;
  affectedModes: string[];
  effectiveStartAt: string;
  effectiveEndAt?: string | null;
  status: 'active' | 'expired' | 'stale' | 'unknown';
  reason: string;
  evidenceUrl?: string | null;
  confidenceScore: number;
}

export interface RestrictionRecord {
  id: string;
  sourceObservationId: string;
  restrictionType: string;
  vehicleClassRestrictions: string[];
  permitRequired: boolean;
  seasonalRestriction?: string | { start?: string; end?: string; label?: string } | null;
  fireRestriction?: string | null;
  geometry: ObservationGeometry | null;
  effectiveStartAt?: string | null;
  effectiveEndAt?: string | null;
}

export interface ContextRecord {
  id: string;
  sourceObservationId: string;
  providerId?: string;
  type:
    | 'agency_notice'
    | 'road_condition'
    | 'fire_perimeter'
    | 'emergency_notice'
    | 'weather_alert'
    | 'smoke_aqi'
    | 'community_report'
    | 'route_planning';
  status?: string | null;
  severity?: ConflictSeverity | 'low' | 'moderate' | 'high' | 'severe' | null;
  geometry: ObservationGeometry | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  evidenceUrl?: string | null;
  confidenceScore?: number;
  payload?: Record<string, unknown>;
}

export interface ExpeditionVehicleProfile {
  vehicleClass?: string | null;
  vehicleClasses?: string[];
}

export interface ConflictItem {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  explanation: string;
  evidence: EvidenceRef[];
  recommendedAction: RecommendedConflictAction;
}

export interface SegmentConflictResult {
  segmentId: string;
  geometry: RoutePoint[];
  legalStatus: SegmentLegalStatus;
  closureStatus: SegmentClosureStatus;
  passabilityStatus: SegmentPassabilityStatus;
  safetyRiskStatus: SegmentSafetyRiskStatus;
  confidence: SourceConfidenceScore;
  conflicts: ConflictItem[];
  evidence: EvidenceRef[];
  recommendedAction: RecommendedConflictAction;
}

export interface ConflictDetectionResult {
  routeId: string;
  evaluatedAt: string;
  segmentResults: SegmentConflictResult[];
  conflicts: ConflictItem[];
  blockingIssues: ConflictItem[];
  warnings: ConflictItem[];
  unknowns: string[];
  evidence: EvidenceRef[];
  confidenceSummary: SourceConfidenceScore;
}

export interface ConflictDetectionInput {
  routeId: string;
  routeGeometry: RoutePoint[];
  tripDateTime: string;
  vehicleProfile?: ExpeditionVehicleProfile;
  legalAccessRecords?: LegalAccessRecord[];
  closureRecords?: ClosureRecord[];
  restrictions?: RestrictionRecord[];
  agencyNotices?: ContextRecord[];
  dotRoadConditions?: ContextRecord[];
  emergencyRecords?: ContextRecord[];
  communityReports?: ContextRecord[];
  weatherFireSmokeContext?: ContextRecord[];
  now?: Date;
}

export function detectLegalClosureConflicts(input: ConflictDetectionInput): ConflictDetectionResult {
  const now = input.now ?? new Date();
  const segments = buildRouteSegments(input.routeGeometry);
  const segmentResults = segments.map((segment, index) => evaluateSegment(input, segment, index, now));
  const conflicts = dedupeConflicts(segmentResults.flatMap((segment) => segment.conflicts));
  const evidence = dedupeEvidence(segmentResults.flatMap((segment) => segment.evidence));
  const confidenceSummary = calculateECS5SourceConfidence({
    decisionType: 'closure',
    now,
    sources: evidence.map(evidenceToConfidenceSource),
  });

  return {
    routeId: input.routeId,
    evaluatedAt: now.toISOString(),
    segmentResults,
    conflicts,
    blockingIssues: conflicts.filter((conflict) => conflict.severity === 'blocker' || conflict.severity === 'critical'),
    warnings: conflicts.filter((conflict) => conflict.severity === 'warning'),
    unknowns: dedupe(segmentResults.flatMap((segment) =>
      segment.legalStatus === 'unknown' ? [`${segment.segmentId}: legal access unknown`] : [])),
    evidence,
    confidenceSummary,
  };
}

function evaluateSegment(
  input: ConflictDetectionInput,
  segment: RoutePoint[],
  index: number,
  now: Date,
): SegmentConflictResult {
  const segmentId = `${input.routeId}:segment:${index}`;
  const legalRecords = (input.legalAccessRecords ?? []).filter((record) => intersectsRoute(record.geometry, segment));
  const closures = (input.closureRecords ?? []).filter((record) => intersectsRoute(record.geometry, segment));
  const restrictions = (input.restrictions ?? []).filter((record) => intersectsRoute(record.geometry, segment));
  const context = [
    ...(input.agencyNotices ?? []),
    ...(input.dotRoadConditions ?? []),
    ...(input.emergencyRecords ?? []),
    ...(input.communityReports ?? []),
    ...(input.weatherFireSmokeContext ?? []),
  ].filter((record) => intersectsRoute(record.geometry, segment));

  const evidence: EvidenceRef[] = [
    ...legalRecords.flatMap((record) => record.evidence.length ? record.evidence : [recordEvidence(record)]),
    ...closures.map(closureEvidence),
    ...restrictions.map(restrictionEvidence),
    ...context.map(contextEvidence),
  ];
  const conflicts: ConflictItem[] = [];
  let legalStatus = resolveLegalStatus(legalRecords);
  let closureStatus = resolveClosureStatus(closures, now);
  let passabilityStatus: SegmentPassabilityStatus = 'unknown';
  let safetyRiskStatus: SegmentSafetyRiskStatus = 'unknown';

  const activeClosures = closures.filter((record) => closureIsActive(record, now));
  const staleOrExpired = closures.filter((record) => !closureIsActive(record, now) && (record.status === 'expired' || record.status === 'stale' || isExpired(record.effectiveEndAt, now)));
  const staticOpen = legalRecords.some((record) => record.legalStatus === 'open');

  if (activeClosures.length > 0) {
    legalStatus = activeClosures.some((record) => /private/i.test(record.closureType)) ? 'private' : legalStatus;
    closureStatus = 'active_closure';
    safetyRiskStatus = 'critical';
    conflicts.push(conflict(segmentId, 'closure_geometry_intersection', 'blocker', 'Active closure intersects route segment', 'An active official closure/order intersects this route segment.', activeClosures.map(closureEvidence), 'do_not_travel'));
    if (staticOpen) {
      conflicts.push(conflict(segmentId, 'official_closure_vs_static_open', 'blocker', 'Official closure overrides static open access', 'Static legal access remains baseline data, but the active official closure controls current route use.', [...activeClosures.map(closureEvidence), ...legalRecords.map(recordEvidence)], 'reroute'));
    }
  }
  if (staleOrExpired.length > 0) {
    closureStatus = closureStatus === 'active_closure' ? closureStatus : staleOrExpired.some((record) => record.status === 'stale') ? 'stale' : 'expired';
    conflicts.push(conflict(segmentId, 'expired_or_stale_closure', 'info', 'Expired or stale closure retained as evidence', 'Expired closures are not active blockers unless another active source confirms them.', staleOrExpired.map(closureEvidence), 'verify_with_managing_agency'));
  }

  const vehicleClasses = normalizedVehicleClasses(input.vehicleProfile);
  for (const record of legalRecords) {
    if (record.allowedVehicleClasses.length > 0 && vehicleClasses.length > 0 &&
      !vehicleClasses.some((vehicleClass) => record.allowedVehicleClasses.map(normalize).includes(vehicleClass))) {
      legalStatus = 'restricted';
      conflicts.push(conflict(segmentId, 'vehicle_class_mismatch', 'blocker', 'Vehicle class does not match legal access record', 'The expedition vehicle class is not listed in the allowed vehicle classes for this segment.', [recordEvidence(record)], 'reroute'));
    }
    if (seasonallyClosed(record, input.tripDateTime)) {
      legalStatus = 'seasonally_closed';
      closureStatus = closureStatus === 'active_closure' ? closureStatus : 'active_closure';
      conflicts.push(conflict(segmentId, 'season_mismatch', 'blocker', 'Trip date conflicts with seasonal rule', 'Seasonal access rules indicate this segment is closed or restricted for the planned trip date.', [recordEvidence(record)], 'delay_departure'));
    }
    if (record.agency.toLowerCase().includes('blm') && /non-blm|private|adjacent/i.test(JSON.stringify(record.evidence))) {
      conflicts.push(conflict(segmentId, 'route_crosses_private_or_unknown_access', 'warning', 'BLM access does not authorize non-BLM land use', 'Mapped BLM access does not grant general use across private or non-BLM lands.', [recordEvidence(record)], 'verify_with_managing_agency'));
    }
    if (record.jurisdiction === 'unknown' || !record.jurisdiction) {
      conflicts.push(conflict(segmentId, 'unknown_jurisdiction', 'warning', 'Unknown managing jurisdiction', 'Unknown jurisdiction reduces confidence and requires verification before travel.', [recordEvidence(record)], 'manual_review_required'));
    }
  }

  for (const record of restrictions) {
    if (record.permitRequired) {
      legalStatus = legalStatus === 'open' ? 'permit_required' : legalStatus;
      conflicts.push(conflict(segmentId, 'agency_a_open_agency_b_closed', 'warning', 'Permit or restriction applies', 'A restriction record applies to this route segment even if baseline legal access appears open.', [restrictionEvidence(record)], 'verify_with_managing_agency'));
    }
    if (record.vehicleClassRestrictions.map(normalize).some((restriction) => vehicleClasses.includes(restriction))) {
      legalStatus = 'restricted';
      conflicts.push(conflict(segmentId, 'vehicle_class_mismatch', 'blocker', 'Vehicle class restricted', 'A restriction record excludes the expedition vehicle class.', [restrictionEvidence(record)], 'reroute'));
    }
    if (restrictionSeasonMismatch(record, input.tripDateTime)) {
      legalStatus = 'seasonally_closed';
      conflicts.push(conflict(segmentId, 'season_mismatch', 'blocker', 'Seasonal restriction applies', 'A seasonal restriction overlaps the planned trip date.', [restrictionEvidence(record)], 'delay_departure'));
    }
  }

  const officialClosed = activeClosures.length > 0;
  for (const report of (input.communityReports ?? []).filter((record) => intersectsRoute(record.geometry, segment))) {
    if (/open|passable/i.test(report.status ?? '') && officialClosed) {
      conflicts.push(conflict(segmentId, 'community_open_vs_official_closed', 'warning', 'Community report cannot reopen official closure', 'Community reports are retained as conflict evidence but cannot legally reopen an active official closure.', [contextEvidence(report), ...activeClosures.map(closureEvidence)], 'do_not_travel'));
    }
    if (/blocked|washed out|impassable|closed/i.test(report.status ?? '')) {
      passabilityStatus = 'impassable';
      safetyRiskStatus = maxSafety([safetyRiskStatus, 'warning']);
      conflicts.push(conflict(segmentId, 'community_closed_vs_official_open', 'warning', 'Community blockage report worsens passability risk', 'Community reports can worsen current condition/passability but do not create legal closure.', [contextEvidence(report)], 'verify_with_managing_agency'));
      if (staticOpen) {
        conflicts.push(conflict(segmentId, 'legal_open_but_condition_impassable', 'warning', 'Legal open does not mean passable', 'Static legal access appears open, but current condition evidence indicates the segment may be impassable.', [contextEvidence(report), ...legalRecords.map(recordEvidence)], 'avoid_segment'));
      }
    }
  }

  for (const record of context) {
    if (record.type === 'road_condition' && /closed|closure|blocked/i.test(record.status ?? '')) {
      closureStatus = 'active_closure';
      conflicts.push(conflict(segmentId, 'closure_geometry_intersection', 'blocker', 'DOT or road condition closure intersects route', 'DOT closures apply where the route geometry intersects the affected roadway/jurisdiction.', [contextEvidence(record)], 'reroute'));
    }
    if (record.type === 'fire_perimeter') {
      safetyRiskStatus = 'critical';
      conflicts.push(conflict(segmentId, 'fire_perimeter_intersects_route', 'critical', 'Fire perimeter intersects route', 'Fire perimeter intersection is safety-critical but does not imply legal closure without closure/order data.', [contextEvidence(record)], 'do_not_travel'));
    }
    if (record.type === 'emergency_notice' && /evacuation|order|warning|closure/i.test(record.status ?? JSON.stringify(record.payload ?? {}))) {
      safetyRiskStatus = 'critical';
      conflicts.push(conflict(segmentId, 'evacuation_or_emergency_notice_intersects_route', 'critical', 'Emergency notice intersects route', 'Emergency or evacuation notice intersects this segment and requires reroute or delay.', [contextEvidence(record)], 'reroute'));
    }
    if (record.type === 'weather_alert') {
      safetyRiskStatus = maxSafety([safetyRiskStatus, 'warning']);
      conflicts.push(conflict(segmentId, 'weather_alert_intersects_route', 'warning', 'Weather alert intersects route', 'Weather alerts are safety warnings, not legal access records.', [contextEvidence(record)], 'delay_departure'));
    }
    if (record.type === 'smoke_aqi' && (/hazardous|very unhealthy/i.test(record.status ?? '') || record.severity === 'severe')) {
      safetyRiskStatus = 'critical';
      conflicts.push(conflict(segmentId, 'smoke_aqi_health_risk', 'critical', 'Hazardous AQI affects crew health risk', 'High AQI/smoke is a health and safety warning, not a legal closure.', [contextEvidence(record)], 'delay_departure'));
    }
  }

  if (legalRecords.length === 0) {
    legalStatus = 'unknown';
    conflicts.push(conflict(segmentId, 'unknown_jurisdiction', 'warning', 'Legal access unknown', 'No intersecting legal access record was available for this segment.', [], 'verify_with_managing_agency'));
  }
  if (passabilityStatus === 'unknown' && conflicts.some((item) => item.type === 'legal_open_but_condition_impassable')) {
    passabilityStatus = 'impassable';
  }
  if (passabilityStatus === 'unknown' && legalStatus === 'open') passabilityStatus = 'unknown';
  if (safetyRiskStatus === 'unknown' && conflicts.length === 0) safetyRiskStatus = legalStatus === 'open' ? 'low' : 'watch';

  const confidence = calculateECS5SourceConfidence({
    decisionType: closureStatus === 'active_closure' ? 'closure' : legalStatus === 'unknown' ? 'unknown' : 'legal_access',
    now,
    sources: evidence.map(evidenceToConfidenceSource),
  });

  return {
    segmentId,
    geometry: segment,
    legalStatus,
    closureStatus,
    passabilityStatus,
    safetyRiskStatus,
    confidence,
    conflicts,
    evidence: dedupeEvidence(evidence),
    recommendedAction: recommendedAction(conflicts, legalStatus, safetyRiskStatus),
  };
}

function resolveLegalStatus(records: LegalAccessRecord[]): SegmentLegalStatus {
  if (records.length === 0) return 'unknown';
  if (records.some((record) => record.legalStatus === 'closed' || record.legalStatus === 'private')) return records.find((record) => record.legalStatus === 'private') ? 'private' : 'closed';
  if (records.some((record) => record.legalStatus === 'seasonally_closed')) return 'seasonally_closed';
  if (records.some((record) => record.legalStatus === 'restricted')) return 'restricted';
  if (records.some((record) => record.legalStatus === 'permit_required')) return 'permit_required';
  if (records.some((record) => record.legalStatus === 'open')) return 'open';
  return 'unknown';
}

function resolveClosureStatus(records: ClosureRecord[], now: Date): SegmentClosureStatus {
  if (records.some((record) => closureIsActive(record, now))) return 'active_closure';
  if (records.some((record) => record.status === 'stale')) return 'stale';
  if (records.some((record) => record.status === 'expired' || isExpired(record.effectiveEndAt, now))) return 'expired';
  return records.length > 0 ? 'unknown' : 'open';
}

function closureIsActive(record: ClosureRecord, now: Date): boolean {
  if (record.status !== 'active') return false;
  if (isExpired(record.effectiveEndAt, now)) return false;
  const start = Date.parse(record.effectiveStartAt);
  return !Number.isFinite(start) || start <= now.getTime();
}

function isExpired(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now.getTime();
}

function seasonallyClosed(record: LegalAccessRecord, tripDateTime: string): boolean {
  return record.seasonalRules.some((rule) => {
    if (typeof rule === 'string') return /closed|seasonally_closed/i.test(rule) && !/open/i.test(rule);
    return rule.status === 'seasonally_closed' && dateInMonthDayWindow(tripDateTime, rule.start, rule.end);
  });
}

function restrictionSeasonMismatch(record: RestrictionRecord, tripDateTime: string): boolean {
  const rule = record.seasonalRestriction;
  if (!rule) return false;
  if (typeof rule === 'string') return /closed|restricted/i.test(rule);
  return dateInMonthDayWindow(tripDateTime, rule.start, rule.end);
}

function dateInMonthDayWindow(tripDateTime: string, start?: string, end?: string): boolean {
  const trip = new Date(tripDateTime);
  if (!Number.isFinite(trip.getTime()) || !start || !end) return false;
  const key = `${String(trip.getUTCMonth() + 1).padStart(2, '0')}-${String(trip.getUTCDate()).padStart(2, '0')}`;
  return start <= end ? key >= start && key <= end : key >= start || key <= end;
}

function recommendedAction(conflicts: ConflictItem[], legalStatus: SegmentLegalStatus, safetyRisk: SegmentSafetyRiskStatus): RecommendedConflictAction {
  if (conflicts.some((item) => item.recommendedAction === 'do_not_travel')) return 'do_not_travel';
  if (conflicts.some((item) => item.severity === 'blocker')) return 'reroute';
  if (safetyRisk === 'critical') return 'avoid_segment';
  if (legalStatus === 'unknown') return 'verify_with_managing_agency';
  if (conflicts.some((item) => item.recommendedAction === 'delay_departure')) return 'delay_departure';
  if (conflicts.length > 0) return 'verify_with_managing_agency';
  return 'proceed_with_caution';
}

function conflict(
  segmentId: string,
  type: ConflictType,
  severity: ConflictSeverity,
  title: string,
  explanation: string,
  evidence: EvidenceRef[],
  action: RecommendedConflictAction,
): ConflictItem {
  return {
    id: `${segmentId}:${type}:${evidence.map((item) => item.id).join('|')}`,
    type,
    severity,
    title,
    explanation,
    evidence: dedupeEvidence(evidence),
    recommendedAction: action,
  };
}

function buildRouteSegments(points: RoutePoint[]): RoutePoint[][] {
  const valid = points.filter(validPoint);
  if (valid.length <= 1) return valid.length === 1 ? [[valid[0]]] : [];
  const segments: RoutePoint[][] = [];
  for (let index = 1; index < valid.length; index += 1) {
    segments.push([valid[index - 1], valid[index]]);
  }
  return segments;
}

function intersectsRoute(geometry: ObservationGeometry | null, route: RoutePoint[]): boolean {
  if (!geometry) return true;
  const bbox = geometryBbox(geometry);
  if (!bbox) return true;
  return route.some((point) => point.lat >= bbox.minLat && point.lat <= bbox.maxLat && point.lon >= bbox.minLon && point.lon <= bbox.maxLon) ||
    routeBbox(route) != null && boxesIntersect(bbox, routeBbox(route)!);
}

function geometryBbox(geometry: ObservationGeometry): { minLat: number; minLon: number; maxLat: number; maxLon: number } | null {
  const pairs: number[][] = [];
  collectPairs(geometry.coordinates, pairs);
  if (pairs.length === 0) return null;
  const lons = pairs.map((pair) => pair[0]);
  const lats = pairs.map((pair) => pair[1]);
  return { minLat: Math.min(...lats), minLon: Math.min(...lons), maxLat: Math.max(...lats), maxLon: Math.max(...lons) };
}

function routeBbox(route: RoutePoint[]) {
  if (route.length === 0) return null;
  return {
    minLat: Math.min(...route.map((point) => point.lat)),
    minLon: Math.min(...route.map((point) => point.lon)),
    maxLat: Math.max(...route.map((point) => point.lat)),
    maxLon: Math.max(...route.map((point) => point.lon)),
  };
}

function boxesIntersect(a: { minLat: number; minLon: number; maxLat: number; maxLon: number }, b: { minLat: number; minLon: number; maxLat: number; maxLon: number }): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

function collectPairs(value: unknown, output: number[][]): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((entry) => collectPairs(entry, output));
}

function recordEvidence(record: LegalAccessRecord): EvidenceRef {
  return {
    id: record.id,
    sourceObservationId: record.sourceObservationId,
    label: `${record.agency} ${record.legalStatus}`,
    observedAt: record.effectiveStartAt ?? null,
  };
}

function closureEvidence(record: ClosureRecord): EvidenceRef {
  return {
    id: record.id,
    sourceObservationId: record.sourceObservationId,
    label: `${record.agency} ${record.closureType}`,
    evidenceUrl: record.evidenceUrl ?? null,
    observedAt: record.effectiveStartAt,
  };
}

function restrictionEvidence(record: RestrictionRecord): EvidenceRef {
  return {
    id: record.id,
    sourceObservationId: record.sourceObservationId,
    label: record.restrictionType,
  };
}

function contextEvidence(record: ContextRecord): EvidenceRef {
  return {
    id: record.id,
    sourceObservationId: record.sourceObservationId,
    providerId: record.providerId ?? null,
    label: `${record.type} ${record.status ?? ''}`.trim(),
    evidenceUrl: record.evidenceUrl ?? null,
    observedAt: record.observedAt ?? null,
  };
}

function evidenceToConfidenceSource(evidence: EvidenceRef): ConfidenceEvidenceSource {
  return {
    id: evidence.sourceObservationId ?? evidence.id,
    sourceName: evidence.label,
    providerId: evidence.providerId ?? null,
    observedAt: evidence.observedAt ?? null,
    evidenceUrl: evidence.evidenceUrl ?? null,
  };
}

function normalizedVehicleClasses(profile?: ExpeditionVehicleProfile): string[] {
  return dedupe([
    profile?.vehicleClass,
    ...(profile?.vehicleClasses ?? []),
  ].map(normalize));
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function maxSafety(values: SegmentSafetyRiskStatus[]): SegmentSafetyRiskStatus {
  const order: SegmentSafetyRiskStatus[] = ['unknown', 'low', 'watch', 'warning', 'critical'];
  return values.reduce((max, value) => order.indexOf(value) > order.indexOf(max) ? value : max, 'unknown');
}

function validPoint(point: RoutePoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function dedupeConflicts(conflicts: ConflictItem[]): ConflictItem[] {
  const seen = new Set<string>();
  return conflicts.filter((item) => {
    const key = `${item.type}:${item.title}:${item.evidence.map((entry) => entry.id).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = item.sourceObservationId ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}
