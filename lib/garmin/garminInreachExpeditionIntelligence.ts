import type { CreateEventInput, EventSeverity, EventType } from '../expeditionEventStore';

export type GarminExpeditionRuleId =
  | 'stale_location'
  | 'missed_check_in'
  | 'low_battery'
  | 'route_deviation'
  | 'no_movement'
  | 'unexpected_movement'
  | 'sos_declared'
  | 'sos_cancel_review'
  | 'device_silent_after_command'
  | 'tracking_disabled_unexpectedly';

export type GarminExpeditionRiskLevel = 'watch' | 'warning' | 'critical';

export interface GarminCoordinate {
  latitude: number;
  longitude: number;
}

export interface GarminTimedCoordinate extends GarminCoordinate {
  timestamp: string;
}

export interface GarminRouteDeviationInput {
  plannedRoute: GarminCoordinate[];
  thresholdMeters?: number;
}

export interface GarminCheckInExpectation {
  dueAt: string;
  lastCheckInAt?: string | null;
}

export interface GarminCommandExpectation {
  type: string;
  status: 'queued' | 'requested' | 'awaiting_operator_confirmation' | 'acknowledged' | 'failed';
  requestedAt: string;
  expectedResponseWindowMs?: number;
}

export interface GarminSosSignalInput {
  status: 'declared' | 'confirmed' | 'cancel_requested' | 'cancelled';
  occurredAt: string;
  coordinate?: GarminCoordinate | null;
  message?: string | null;
}

export interface GarminTrackingExpectation {
  expectedEnabled: boolean;
  enabled?: boolean | null;
  changedAt?: string | null;
}

export interface GarminInreachExpeditionIntelligenceInput {
  expeditionId?: string | null;
  deviceLabel?: string | null;
  memberLabel?: string | null;
  now: string;
  lastLocation?: GarminTimedCoordinate | null;
  previousLocation?: GarminTimedCoordinate | null;
  expectedLocationIntervalMs?: number;
  locationGraceMs?: number;
  checkIn?: GarminCheckInExpectation | null;
  lowBattery?: boolean;
  batteryPercent?: number | null;
  routeDeviation?: GarminRouteDeviationInput | null;
  movementExpected?: boolean;
  stationarySince?: string | null;
  stationaryThresholdMs?: number;
  movementThresholdMeters?: number;
  missionState?: 'moving' | 'camped' | 'recovery' | 'rest' | 'unknown';
  command?: GarminCommandExpectation | null;
  tracking?: GarminTrackingExpectation | null;
  sosSignals?: GarminSosSignalInput[];
}

export interface GarminRiskAnnotation {
  id: string;
  ruleId: GarminExpeditionRuleId;
  level: GarminExpeditionRiskLevel;
  title: string;
  summary: string;
  occurredAt: string;
  coordinate?: GarminCoordinate | null;
  recommendedOperatorAction: string;
  humanReviewRequired: boolean;
  automaticGarminCommandAllowed: false;
  evidence: string[];
  expeditionEvent: CreateEventInput;
}

export interface GarminMapAlert {
  id: string;
  source: 'garmin_inreach';
  ruleId: GarminExpeditionRuleId;
  severity: GarminExpeditionRiskLevel;
  title: string;
  message: string;
  coordinate?: GarminCoordinate | null;
}

export interface GarminAiOperatorRecommendation {
  title: string;
  priority: 'medium' | 'high' | 'critical';
  action: string;
  rationale: string;
  executesGarminCommand: false;
  requiresOperatorConfirmationForGarminCommand: true;
}

export interface GarminInreachExpeditionIntelligenceResult {
  generatedAt: string;
  annotations: GarminRiskAnnotation[];
  mapAlerts: GarminMapAlert[];
  debriefEntries: CreateEventInput[];
  recommendedOperatorActions: string[];
  aiRecommendations: GarminAiOperatorRecommendation[];
}

const DEFAULT_LOCATION_INTERVAL_MS = 20 * 60 * 1000;
const DEFAULT_LOCATION_GRACE_MS = 10 * 60 * 1000;
const DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS = 250;
const DEFAULT_STATIONARY_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_MOVEMENT_THRESHOLD_METERS = 60;
const DEFAULT_COMMAND_RESPONSE_WINDOW_MS = 20 * 60 * 1000;
const EARTH_RADIUS_METERS = 6_371_000;

export function evaluateGarminInreachExpeditionRules(
  input: GarminInreachExpeditionIntelligenceInput,
): GarminInreachExpeditionIntelligenceResult {
  const annotations: GarminRiskAnnotation[] = [];

  pushIfPresent(annotations, evaluateStaleLocation(input));
  pushIfPresent(annotations, evaluateMissedCheckIn(input));
  pushIfPresent(annotations, evaluateLowBattery(input));
  pushIfPresent(annotations, evaluateRouteDeviation(input));
  pushIfPresent(annotations, evaluateNoMovement(input));
  pushIfPresent(annotations, evaluateUnexpectedMovement(input));
  for (const signal of input.sosSignals ?? []) {
    pushIfPresent(annotations, evaluateSosSignal(input, signal));
  }
  pushIfPresent(annotations, evaluateDeviceSilentAfterCommand(input));
  pushIfPresent(annotations, evaluateTrackingDisabled(input));

  return {
    generatedAt: input.now,
    annotations,
    mapAlerts: annotations.map(annotationToMapAlert),
    debriefEntries: annotations.map((annotation) => annotation.expeditionEvent),
    recommendedOperatorActions: annotations.map((annotation) => annotation.recommendedOperatorAction),
    aiRecommendations: annotations.map(annotationToAiRecommendation),
  };
}

function evaluateStaleLocation(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (!input.lastLocation?.timestamp) return null;
  const expectedMs = input.expectedLocationIntervalMs ?? DEFAULT_LOCATION_INTERVAL_MS;
  const graceMs = input.locationGraceMs ?? DEFAULT_LOCATION_GRACE_MS;
  const ageMs = Date.parse(input.now) - Date.parse(input.lastLocation.timestamp);
  if (ageMs <= expectedMs + graceMs) return null;

  return createAnnotation(input, {
    ruleId: 'stale_location',
    level: ageMs > (expectedMs + graceMs) * 2 ? 'warning' : 'watch',
    title: 'Garmin location stale',
    summary: `${deviceLabel(input)} has not reported a Garmin position within the expected update window.`,
    coordinate: input.lastLocation,
    action: 'Verify the member/device status through an existing check-in channel before relying on the last Garmin position.',
    evidence: [
      `Last Garmin location: ${input.lastLocation.timestamp}`,
      `Expected interval plus grace: ${Math.round((expectedMs + graceMs) / 60000)} min`,
    ],
  });
}

function evaluateMissedCheckIn(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (!input.checkIn?.dueAt) return null;
  const dueAtMs = Date.parse(input.checkIn.dueAt);
  if (Date.parse(input.now) <= dueAtMs) return null;
  const lastCheckInMs = input.checkIn.lastCheckInAt ? Date.parse(input.checkIn.lastCheckInAt) : 0;
  if (lastCheckInMs >= dueAtMs) return null;

  return createAnnotation(input, {
    ruleId: 'missed_check_in',
    level: 'warning',
    title: 'Garmin check-in missed',
    summary: `${memberLabel(input)} has not sent the scheduled Garmin check-in message.`,
    coordinate: input.lastLocation ?? null,
    action: 'Send a normal operator check-in request through the approved ECS workflow or hold at the next safe regroup point.',
    evidence: [
      `Scheduled check-in due: ${input.checkIn.dueAt}`,
      `Last check-in: ${input.checkIn.lastCheckInAt ?? 'none recorded'}`,
    ],
  });
}

function evaluateLowBattery(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  const lowBattery = input.lowBattery === true ||
    (typeof input.batteryPercent === 'number' && input.batteryPercent <= 20);
  if (!lowBattery) return null;

  return createAnnotation(input, {
    ruleId: 'low_battery',
    level: 'watch',
    title: 'Garmin battery low',
    summary: `${deviceLabel(input)} is reporting reduced battery margin.`,
    coordinate: input.lastLocation ?? null,
    action: 'Confirm power plan and preserve Garmin battery for essential check-ins or incident communication.',
    evidence: [`Battery: ${typeof input.batteryPercent === 'number' ? `${input.batteryPercent}%` : 'low battery signal'}`],
  });
}

function evaluateRouteDeviation(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (!input.lastLocation || !input.routeDeviation?.plannedRoute?.length) return null;
  const threshold = input.routeDeviation.thresholdMeters ?? DEFAULT_ROUTE_DEVIATION_THRESHOLD_METERS;
  const distance = distanceToRouteMeters(input.lastLocation, input.routeDeviation.plannedRoute);
  if (distance <= threshold) return null;

  return createAnnotation(input, {
    ruleId: 'route_deviation',
    level: distance > threshold * 2 ? 'warning' : 'watch',
    title: 'Garmin route deviation',
    summary: `${memberLabel(input)} is beyond the configured distance from the ECS planned route.`,
    coordinate: input.lastLocation,
    action: 'Confirm whether the deviation is intentional before updating route status or dispatching assistance.',
    evidence: [
      `Route distance: ${Math.round(distance)} m`,
      `Threshold: ${Math.round(threshold)} m`,
    ],
  });
}

function evaluateNoMovement(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (input.movementExpected !== true) return null;
  const thresholdMs = input.stationaryThresholdMs ?? DEFAULT_STATIONARY_THRESHOLD_MS;
  const thresholdMeters = input.movementThresholdMeters ?? DEFAULT_MOVEMENT_THRESHOLD_METERS;
  const stationarySinceAge = input.stationarySince
    ? Date.parse(input.now) - Date.parse(input.stationarySince)
    : null;
  const pointDelta =
    input.lastLocation && input.previousLocation
      ? distanceMeters(input.previousLocation, input.lastLocation)
      : null;
  const timeDelta =
    input.lastLocation && input.previousLocation
      ? Date.parse(input.lastLocation.timestamp) - Date.parse(input.previousLocation.timestamp)
      : null;
  const stationaryBySince = typeof stationarySinceAge === 'number' && stationarySinceAge > thresholdMs;
  const stationaryByPoints =
    typeof pointDelta === 'number' &&
    typeof timeDelta === 'number' &&
    pointDelta <= thresholdMeters &&
    timeDelta >= thresholdMs;
  if (!stationaryBySince && !stationaryByPoints) return null;

  return createAnnotation(input, {
    ruleId: 'no_movement',
    level: 'watch',
    title: 'Garmin no movement',
    summary: `${memberLabel(input)} appears stationary while ECS expects movement.`,
    coordinate: input.lastLocation ?? input.previousLocation ?? null,
    action: 'Verify the stop is planned and confirm whether the member needs assistance before changing expedition status.',
    evidence: [
      `Stationary threshold: ${Math.round(thresholdMs / 60000)} min`,
      pointDelta == null ? 'Point movement unavailable' : `Point movement: ${Math.round(pointDelta)} m`,
    ],
  });
}

function evaluateUnexpectedMovement(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (!input.lastLocation || !input.previousLocation) return null;
  if (input.missionState !== 'camped' && input.missionState !== 'recovery' && input.missionState !== 'rest') return null;
  const thresholdMeters = input.movementThresholdMeters ?? DEFAULT_MOVEMENT_THRESHOLD_METERS;
  const movedMeters = distanceMeters(input.previousLocation, input.lastLocation);
  if (movedMeters <= thresholdMeters) return null;

  return createAnnotation(input, {
    ruleId: 'unexpected_movement',
    level: 'warning',
    title: 'Garmin movement unexpected',
    summary: `${memberLabel(input)} moved while ECS state is ${input.missionState}.`,
    coordinate: input.lastLocation,
    action: 'Confirm whether movement is intentional and update camp, recovery, or rest status if conditions changed.',
    evidence: [
      `Movement: ${Math.round(movedMeters)} m`,
      `Mission state: ${input.missionState}`,
    ],
  });
}

function evaluateSosSignal(
  input: GarminInreachExpeditionIntelligenceInput,
  signal: GarminSosSignalInput,
): GarminRiskAnnotation | null {
  if (signal.status === 'declared' || signal.status === 'confirmed') {
    return createAnnotation(input, {
      ruleId: 'sos_declared',
      level: 'critical',
      title: 'Garmin SOS signal',
      summary: signal.message || 'Garmin SOS signal received. ECS requires human incident review.',
      occurredAt: signal.occurredAt,
      coordinate: signal.coordinate ?? input.lastLocation ?? null,
      action: 'Open Incident & Recovery, verify location and party status, and contact emergency services or appropriate authorities when life safety may be at risk.',
      evidence: [`SOS status: ${signal.status}`, `Signal time: ${signal.occurredAt}`],
      humanReviewRequired: true,
    });
  }

  if (signal.status === 'cancel_requested' || signal.status === 'cancelled') {
    return createAnnotation(input, {
      ruleId: 'sos_cancel_review',
      level: 'warning',
      title: 'Garmin SOS cancel review',
      summary: 'Garmin SOS cancel signal received. ECS will not close an incident automatically.',
      occurredAt: signal.occurredAt,
      coordinate: signal.coordinate ?? input.lastLocation ?? null,
      action: 'Review the active incident with the operator before changing incident status.',
      evidence: [`SOS status: ${signal.status}`, `Signal time: ${signal.occurredAt}`],
      humanReviewRequired: true,
    });
  }

  return null;
}

function evaluateDeviceSilentAfterCommand(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  const command = input.command;
  if (!command) return null;
  if (command.status !== 'queued' && command.status !== 'requested' && command.status !== 'awaiting_operator_confirmation') return null;
  const windowMs = command.expectedResponseWindowMs ?? DEFAULT_COMMAND_RESPONSE_WINDOW_MS;
  const ageMs = Date.parse(input.now) - Date.parse(command.requestedAt);
  if (ageMs <= windowMs) return null;

  return createAnnotation(input, {
    ruleId: 'device_silent_after_command',
    level: 'watch',
    title: 'Garmin command still pending',
    summary: `${deviceLabel(input)} has not produced a response inside the expected Garmin command window.`,
    coordinate: input.lastLocation ?? null,
    action: 'Treat the command as pending or unknown; use alternate communication before assuming delivery.',
    evidence: [
      `Command: ${command.type}`,
      `Requested: ${command.requestedAt}`,
      `Expected response window: ${Math.round(windowMs / 60000)} min`,
    ],
  });
}

function evaluateTrackingDisabled(input: GarminInreachExpeditionIntelligenceInput): GarminRiskAnnotation | null {
  if (!input.tracking?.expectedEnabled || input.tracking.enabled !== false) return null;

  return createAnnotation(input, {
    ruleId: 'tracking_disabled_unexpectedly',
    level: 'warning',
    title: 'Garmin tracking disabled',
    summary: `${deviceLabel(input)} tracking is disabled while the mission expects active tracking.`,
    coordinate: input.lastLocation ?? null,
    action: 'Confirm tracking state with the operator and update the expedition communication plan before relying on Garmin tracking.',
    evidence: [
      'Tracking expected: true',
      `Tracking enabled: ${String(input.tracking.enabled)}`,
      `Changed at: ${input.tracking.changedAt ?? 'unknown'}`,
    ],
  });
}

function createAnnotation(
  input: GarminInreachExpeditionIntelligenceInput,
  detail: {
    ruleId: GarminExpeditionRuleId;
    level: GarminExpeditionRiskLevel;
    title: string;
    summary: string;
    action: string;
    evidence: string[];
    coordinate?: GarminCoordinate | null;
    occurredAt?: string;
    humanReviewRequired?: boolean;
  },
): GarminRiskAnnotation {
  const occurredAt = detail.occurredAt ?? input.now;
  const expeditionEvent = annotationEvent(input, detail, occurredAt);
  return {
    id: `garmin-${detail.ruleId}-${hashStable(`${input.expeditionId ?? 'none'}:${detail.title}:${occurredAt}`)}`,
    ruleId: detail.ruleId,
    level: detail.level,
    title: detail.title,
    summary: detail.summary,
    occurredAt,
    coordinate: detail.coordinate ?? null,
    recommendedOperatorAction: detail.action,
    humanReviewRequired: detail.humanReviewRequired ?? detail.level === 'critical',
    automaticGarminCommandAllowed: false,
    evidence: detail.evidence,
    expeditionEvent,
  };
}

function annotationEvent(
  input: GarminInreachExpeditionIntelligenceInput,
  detail: {
    ruleId: GarminExpeditionRuleId;
    level: GarminExpeditionRiskLevel;
    title: string;
    summary: string;
    action: string;
    evidence: string[];
    coordinate?: GarminCoordinate | null;
    humanReviewRequired?: boolean;
  },
  occurredAt: string,
): CreateEventInput {
  return {
    expedition_id: input.expeditionId ?? 'expedition-unassigned',
    created_by: 'garmin_inreach',
    event_type: eventTypeForRule(detail.ruleId),
    severity: severityForLevel(detail.level),
    title: detail.title,
    details: `${detail.summary} Action: ${detail.action}`,
    lat: detail.coordinate?.latitude ?? null,
    lon: detail.coordinate?.longitude ?? null,
    attachments: [{
      source: 'garmin_inreach',
      ruleId: detail.ruleId,
      occurredAt,
      evidence: detail.evidence,
      humanReviewRequired: detail.humanReviewRequired ?? detail.level === 'critical',
      automaticGarminCommandAllowed: false,
    }],
  };
}

function annotationToMapAlert(annotation: GarminRiskAnnotation): GarminMapAlert {
  return {
    id: `${annotation.id}:map-alert`,
    source: 'garmin_inreach',
    ruleId: annotation.ruleId,
    severity: annotation.level,
    title: annotation.title,
    message: annotation.summary,
    coordinate: annotation.coordinate ?? undefined,
  };
}

function annotationToAiRecommendation(annotation: GarminRiskAnnotation): GarminAiOperatorRecommendation {
  return {
    title: annotation.title,
    priority: annotation.level === 'critical' ? 'critical' : annotation.level === 'warning' ? 'high' : 'medium',
    action: annotation.recommendedOperatorAction,
    rationale: annotation.summary,
    executesGarminCommand: false,
    requiresOperatorConfirmationForGarminCommand: true,
  };
}

function eventTypeForRule(ruleId: GarminExpeditionRuleId): EventType {
  if (ruleId === 'sos_declared' || ruleId === 'sos_cancel_review') return 'COMMS';
  if (ruleId === 'route_deviation') return 'NAV';
  if (ruleId === 'low_battery' || ruleId === 'tracking_disabled_unexpectedly') return 'COMMS';
  return 'COMMS';
}

function severityForLevel(level: GarminExpeditionRiskLevel): EventSeverity {
  if (level === 'critical') return 'CRITICAL';
  if (level === 'warning') return 'HIGH';
  return 'MED';
}

function deviceLabel(input: GarminInreachExpeditionIntelligenceInput): string {
  return input.deviceLabel || 'Garmin inReach device';
}

function memberLabel(input: GarminInreachExpeditionIntelligenceInput): string {
  return input.memberLabel || deviceLabel(input);
}

function pushIfPresent<T>(items: T[], item: T | null): void {
  if (item) items.push(item);
}

function distanceToRouteMeters(point: GarminCoordinate, route: GarminCoordinate[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return distanceMeters(point, route[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    best = Math.min(best, distanceToSegmentMeters(point, route[index], route[index + 1]));
  }
  return best;
}

function distanceToSegmentMeters(point: GarminCoordinate, start: GarminCoordinate, end: GarminCoordinate): number {
  const averageLat = toRadians((point.latitude + start.latitude + end.latitude) / 3);
  const toXY = (coord: GarminCoordinate) => ({
    x: toRadians(coord.longitude) * Math.cos(averageLat) * EARTH_RADIUS_METERS,
    y: toRadians(coord.latitude) * EARTH_RADIUS_METERS,
  });
  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceMeters(a: GarminCoordinate, b: GarminCoordinate): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function hashStable(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
