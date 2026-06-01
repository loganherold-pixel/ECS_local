import type { GarminInreachCommandDraft, GarminInreachQueuedCommand } from './garminInreachTypes';
import type { GarminInreachDomainEvent } from './garminInreachEventNormalizer';
import {
  shouldRunGarminInreachIntegration,
  type GarminInreachIntegrationConfig,
  type GarminInreachMode,
} from './garminInreachConfig';
import { maskGarminDeviceIdentifier, stableHashGarminIdentifier } from './garminInreachAdapter';

export interface GarminDebriefCoordinate {
  latitude: number;
  longitude: number;
}

export interface GarminDebriefRoutePoint extends GarminDebriefCoordinate {
  label?: string | null;
}

export interface GarminDebriefTrackPoint extends GarminDebriefCoordinate {
  timestamp: string;
  ingestedAt: string;
  deviceLabel: string;
  deviceHash: string;
  accuracyMeters?: number | null;
  source: 'garmin_inreach' | 'garmin_mapshare_kml';
}

export interface GarminDebriefTimelineItem {
  id: string;
  timestamp: string;
  ingestedAt?: string | null;
  title: string;
  summary: string;
  type:
    | 'message'
    | 'check_in'
    | 'command'
    | 'locate'
    | 'tracking'
    | 'battery'
    | 'incident'
    | 'unknown';
  deviceLabel: string;
  deviceHash: string;
  rawMessageCode?: number | null;
  sourceSchemaVersion?: string | null;
}

export interface GarminCheckInExpectationForDebrief {
  id: string;
  label: string;
  dueAt: string;
  toleranceMinutes?: number;
}

export interface GarminCheckInComplianceItem {
  id: string;
  label: string;
  dueAt: string;
  status: 'met' | 'missed' | 'unknown';
  matchedMessageAt?: string | null;
  note: string;
}

export interface GarminDebriefStaleGap {
  startAt: string;
  endAt: string;
  minutes: number;
  startCoordinate: GarminDebriefCoordinate;
  endCoordinate: GarminDebriefCoordinate;
}

export interface GarminDebriefRouteComparison {
  plannedPointCount: number;
  actualPointCount: number;
  maxDeviationMeters: number | null;
  averageDeviationMeters: number | null;
  status: 'not_available' | 'on_route' | 'watch' | 'deviation';
  note: string;
}

export interface GarminDebriefDataQualityNotes {
  missingTimestamps: number;
  duplicateRetries: number;
  staleKml: boolean;
  demoSynthetic: boolean;
  unknownMessageCodes: Array<number | 'unknown'>;
  notes: string[];
}

export interface GarminInreachDebriefInput {
  config: GarminInreachIntegrationConfig;
  events?: GarminInreachDomainEvent[];
  commandRequests?: Array<GarminInreachCommandDraft | GarminInreachQueuedCommand>;
  plannedRoute?: GarminDebriefRoutePoint[];
  checkInSchedule?: GarminCheckInExpectationForDebrief[];
  duplicateRetryCount?: number;
  staleKml?: boolean;
  demoSynthetic?: boolean;
  publicOrSharedView?: boolean;
  staleGapThresholdMinutes?: number;
  routeDeviationWatchMeters?: number;
  routeDeviationCriticalMeters?: number;
}

export interface GarminInreachDebriefSection {
  source: 'garmin_inreach';
  sourceMode: GarminInreachMode;
  generatedAt: string;
  summary: string;
  trackReplay: GarminDebriefTrackPoint[];
  messageTimeline: GarminDebriefTimelineItem[];
  checkInCompliance: GarminCheckInComplianceItem[];
  staleGaps: GarminDebriefStaleGap[];
  commandTimeline: GarminDebriefTimelineItem[];
  batteryRiskEvents: GarminDebriefTimelineItem[];
  incidentChronology: GarminDebriefTimelineItem[];
  plannedRouteComparison: GarminDebriefRouteComparison;
  dataQuality: GarminDebriefDataQualityNotes;
  privacy: {
    identifiersMasked: true;
    publicOrSharedView: boolean;
    fullImeiExposed: false;
    telemetryTreatedAsGroundTruth: false;
  };
  demoSynthetic: boolean;
}

const DEFAULT_STALE_GAP_THRESHOLD_MINUTES = 45;
const DEFAULT_ROUTE_WATCH_METERS = 250;
const DEFAULT_ROUTE_DEVIATION_METERS = 500;
const EARTH_RADIUS_METERS = 6_371_000;

export function buildGarminInreachDebriefSection(
  input: GarminInreachDebriefInput,
  now = new Date(),
): GarminInreachDebriefSection | null {
  if (!shouldRunGarminInreachIntegration(input.config)) return null;

  const primaryEvents = uniquePrimaryEvents(input.events ?? []);
  const commandRequests = input.commandRequests ?? [];
  if (primaryEvents.length === 0 && commandRequests.length === 0) return null;

  const trackReplay = buildTrackReplay(primaryEvents);
  const messageTimeline = buildMessageTimeline(primaryEvents);
  const commandTimeline = buildCommandTimeline(primaryEvents, commandRequests);
  const batteryRiskEvents = buildBatteryRiskEvents(primaryEvents);
  const incidentChronology = buildIncidentChronology(primaryEvents);
  const staleGaps = buildStaleGaps(
    trackReplay,
    input.staleGapThresholdMinutes ?? DEFAULT_STALE_GAP_THRESHOLD_MINUTES,
  );
  const checkInCompliance = buildCheckInCompliance(input.checkInSchedule ?? [], messageTimeline);
  const plannedRouteComparison = comparePlannedRouteToActualTrack(
    input.plannedRoute ?? [],
    trackReplay,
    input.routeDeviationWatchMeters ?? DEFAULT_ROUTE_WATCH_METERS,
    input.routeDeviationCriticalMeters ?? DEFAULT_ROUTE_DEVIATION_METERS,
  );
  const dataQuality = buildDataQualityNotes(primaryEvents, {
    duplicateRetryCount: input.duplicateRetryCount ?? 0,
    staleKml: input.staleKml === true,
    demoSynthetic: input.demoSynthetic === true || primaryEvents.some((event) => event.source === 'garmin_mapshare_kml' && event.metadata.idempotencyKey.includes('demo')),
  });

  return {
    source: 'garmin_inreach',
    sourceMode: input.config.mode,
    generatedAt: now.toISOString(),
    summary: buildSummary({
      trackReplay,
      messageTimeline,
      staleGaps,
      incidentChronology,
      batteryRiskEvents,
      plannedRouteComparison,
      dataQuality,
    }),
    trackReplay,
    messageTimeline,
    checkInCompliance,
    staleGaps,
    commandTimeline,
    batteryRiskEvents,
    incidentChronology,
    plannedRouteComparison,
    dataQuality,
    privacy: {
      identifiersMasked: true,
      publicOrSharedView: input.publicOrSharedView === true,
      fullImeiExposed: false,
      telemetryTreatedAsGroundTruth: false,
    },
    demoSynthetic: dataQuality.demoSynthetic,
  };
}

function uniquePrimaryEvents(events: GarminInreachDomainEvent[]): GarminInreachDomainEvent[] {
  const seen = new Set<string>();
  const filtered: GarminInreachDomainEvent[] = [];

  for (const event of events) {
    if (event.kind === 'debrief_timeline_event') continue;
    const key = event.metadata?.idempotencyKey ?? event.id;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(event);
  }

  return filtered.sort((a, b) => Date.parse(a.garminTimestamp) - Date.parse(b.garminTimestamp));
}

function buildTrackReplay(events: GarminInreachDomainEvent[]): GarminDebriefTrackPoint[] {
  return events
    .filter((event): event is Extract<GarminInreachDomainEvent, { kind: 'location_update' }> =>
      event.kind === 'location_update' && hasValidCoordinate(event.coordinates))
    .map((event) => ({
      latitude: event.coordinates.latitude,
      longitude: event.coordinates.longitude,
      accuracyMeters: event.coordinates.accuracyMeters ?? null,
      timestamp: event.garminTimestamp,
      ingestedAt: event.ingestedAt,
      deviceLabel: sanitizeDeviceLabel(event.deviceRef.maskedIdentifier),
      deviceHash: sanitizeDeviceHash(event.deviceRef.identifierHash),
      source: event.source,
    }));
}

function buildMessageTimeline(events: GarminInreachDomainEvent[]): GarminDebriefTimelineItem[] {
  return events
    .filter((event) => event.kind === 'field_message')
    .map((event) => ({
      id: event.id,
      timestamp: event.garminTimestamp,
      ingestedAt: event.ingestedAt,
      title: event.garminMessageType === 'puck_check_in_message' ? 'Garmin check-in' : 'Garmin message',
      summary: event.kind === 'field_message' ? event.messageText : event.userFacingSummary,
      type: event.garminMessageType === 'puck_check_in_message' ? 'check_in' : 'message',
      deviceLabel: sanitizeDeviceLabel(event.deviceRef.maskedIdentifier),
      deviceHash: sanitizeDeviceHash(event.deviceRef.identifierHash),
      rawMessageCode: event.rawMessageCode,
      sourceSchemaVersion: event.sourceSchemaVersion,
    }));
}

function buildCommandTimeline(
  events: GarminInreachDomainEvent[],
  commandRequests: Array<GarminInreachCommandDraft | GarminInreachQueuedCommand>,
): GarminDebriefTimelineItem[] {
  const responses = events
    .filter((event) => event.kind === 'command_response')
    .map((event) => ({
      id: event.id,
      timestamp: event.garminTimestamp,
      ingestedAt: event.ingestedAt,
      title: commandTitle(event.kind === 'command_response' ? event.commandResponseType : 'command'),
      summary: event.userFacingSummary,
      type: event.garminMessageType === 'locate_response' ? 'locate' as const : 'command' as const,
      deviceLabel: sanitizeDeviceLabel(event.deviceRef.maskedIdentifier),
      deviceHash: sanitizeDeviceHash(event.deviceRef.identifierHash),
      rawMessageCode: event.rawMessageCode,
      sourceSchemaVersion: event.sourceSchemaVersion,
    }));

  const requests = commandRequests.map((request) => ({
    id: request.id,
    timestamp: request.status === 'queued' && 'confirmedAt' in request ? request.confirmedAt : request.createdAt,
    ingestedAt: null,
    title: `Garmin command ${request.status}`,
    summary: `${request.type} request recorded. Delivery is not assumed without explicit response data.`,
    type: request.type === 'request_location' ? 'locate' as const : 'command' as const,
    deviceLabel: sanitizeDeviceLabel(request.deviceRef.maskedIdentifier),
    deviceHash: sanitizeDeviceHash(request.deviceRef.identifierHash),
    rawMessageCode: null,
    sourceSchemaVersion: null,
  }));

  return [...responses, ...requests]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function buildBatteryRiskEvents(events: GarminInreachDomainEvent[]): GarminDebriefTimelineItem[] {
  return events
    .filter((event): event is Extract<GarminInreachDomainEvent, { kind: 'device_status_update' }> =>
      event.kind === 'device_status_update' && event.lowBattery)
    .map((event) => ({
      id: event.id,
      timestamp: event.garminTimestamp,
      ingestedAt: event.ingestedAt,
      title: 'Garmin battery risk',
      summary: typeof event.batteryPercent === 'number'
        ? `Battery reported at ${event.batteryPercent}%.`
        : 'Low battery signal reported.',
      type: 'battery',
      deviceLabel: sanitizeDeviceLabel(event.deviceRef.maskedIdentifier),
      deviceHash: sanitizeDeviceHash(event.deviceRef.identifierHash),
      rawMessageCode: event.rawMessageCode,
      sourceSchemaVersion: event.sourceSchemaVersion,
    }));
}

function buildIncidentChronology(events: GarminInreachDomainEvent[]): GarminDebriefTimelineItem[] {
  return events
    .filter((event) => event.kind === 'incident_signal')
    .map((event) => ({
      id: event.id,
      timestamp: event.garminTimestamp,
      ingestedAt: event.ingestedAt,
      title: event.incidentSignal.title,
      summary: event.incidentSignal.summary,
      type: 'incident',
      deviceLabel: sanitizeDeviceLabel(event.deviceRef.maskedIdentifier),
      deviceHash: sanitizeDeviceHash(event.deviceRef.identifierHash),
      rawMessageCode: event.rawMessageCode,
      sourceSchemaVersion: event.sourceSchemaVersion,
    }));
}

function buildStaleGaps(track: GarminDebriefTrackPoint[], thresholdMinutes: number): GarminDebriefStaleGap[] {
  const gaps: GarminDebriefStaleGap[] = [];
  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const current = track[index];
    const minutes = Math.round((Date.parse(current.timestamp) - Date.parse(previous.timestamp)) / 60000);
    if (minutes >= thresholdMinutes) {
      gaps.push({
        startAt: previous.timestamp,
        endAt: current.timestamp,
        minutes,
        startCoordinate: { latitude: previous.latitude, longitude: previous.longitude },
        endCoordinate: { latitude: current.latitude, longitude: current.longitude },
      });
    }
  }
  return gaps;
}

function buildCheckInCompliance(
  schedule: GarminCheckInExpectationForDebrief[],
  messages: GarminDebriefTimelineItem[],
): GarminCheckInComplianceItem[] {
  return schedule.map((item) => {
    const toleranceMs = (item.toleranceMinutes ?? 15) * 60 * 1000;
    const dueAt = Date.parse(item.dueAt);
    if (!Number.isFinite(dueAt)) {
      return {
        id: item.id,
        label: item.label,
        dueAt: item.dueAt,
        status: 'unknown',
        matchedMessageAt: null,
        note: 'Check-in due time is missing or invalid.',
      };
    }

    const match = messages.find((message) => {
      const timestamp = Date.parse(message.timestamp);
      if (!Number.isFinite(timestamp)) return false;
      return Math.abs(timestamp - dueAt) <= toleranceMs &&
        (message.type === 'check_in' || /ok|check|camp|delayed/i.test(message.summary));
    });

    return {
      id: item.id,
      label: item.label,
      dueAt: item.dueAt,
      status: match ? 'met' : 'missed',
      matchedMessageAt: match?.timestamp ?? null,
      note: match
        ? `Matched Garmin message at ${match.timestamp}.`
        : 'No Garmin check-in message matched the scheduled window.',
    };
  });
}

function comparePlannedRouteToActualTrack(
  plannedRoute: GarminDebriefRoutePoint[],
  track: GarminDebriefTrackPoint[],
  watchMeters: number,
  deviationMeters: number,
): GarminDebriefRouteComparison {
  if (plannedRoute.length === 0 || track.length === 0) {
    return {
      plannedPointCount: plannedRoute.length,
      actualPointCount: track.length,
      maxDeviationMeters: null,
      averageDeviationMeters: null,
      status: 'not_available',
      note: 'Planned route or Garmin track data was not available for comparison.',
    };
  }

  const deviations = track.map((point) => distanceToRouteMeters(point, plannedRoute));
  const maxDeviationMeters = Math.round(Math.max(...deviations));
  const averageDeviationMeters = Math.round(deviations.reduce((sum, value) => sum + value, 0) / deviations.length);
  const status = maxDeviationMeters >= deviationMeters
    ? 'deviation'
    : maxDeviationMeters >= watchMeters
      ? 'watch'
      : 'on_route';

  return {
    plannedPointCount: plannedRoute.length,
    actualPointCount: track.length,
    maxDeviationMeters,
    averageDeviationMeters,
    status,
    note: status === 'on_route'
      ? 'Garmin track stayed within the configured route comparison margin. Treat as supporting evidence, not perfect ground truth.'
      : 'Garmin track diverged from the planned route comparison margin. Verify against ECS route data and field notes.',
  };
}

function buildDataQualityNotes(
  events: GarminInreachDomainEvent[],
  input: { duplicateRetryCount: number; staleKml: boolean; demoSynthetic: boolean },
): GarminDebriefDataQualityNotes {
  const missingTimestamps = events.filter((event) => !validTimestamp(event.garminTimestamp)).length;
  const unknownMessageCodes = events
    .filter((event) => event.kind === 'garmin_unknown_event' || event.rawMessageCode == null)
    .map((event) => event.rawMessageCode ?? 'unknown');
  const notes: string[] = [
    'Garmin/inReach telemetry is supporting evidence and should not be treated as perfect ground truth.',
  ];

  if (missingTimestamps > 0) notes.push(`${missingTimestamps} Garmin event(s) had missing or invalid source timestamps.`);
  if (input.duplicateRetryCount > 0) notes.push(`${input.duplicateRetryCount} duplicate Garmin retry event(s) were detected or suppressed.`);
  if (input.staleKml) notes.push('MapShare/KML feed was stale during part of the expedition.');
  if (input.demoSynthetic) notes.push('Garmin MapShare data was demo/synthetic and not production device telemetry.');
  if (unknownMessageCodes.length > 0) notes.push('One or more Garmin events used an unknown message code.');

  return {
    missingTimestamps,
    duplicateRetries: input.duplicateRetryCount,
    staleKml: input.staleKml,
    demoSynthetic: input.demoSynthetic,
    unknownMessageCodes,
    notes,
  };
}

function buildSummary(input: {
  trackReplay: GarminDebriefTrackPoint[];
  messageTimeline: GarminDebriefTimelineItem[];
  staleGaps: GarminDebriefStaleGap[];
  incidentChronology: GarminDebriefTimelineItem[];
  batteryRiskEvents: GarminDebriefTimelineItem[];
  plannedRouteComparison: GarminDebriefRouteComparison;
  dataQuality: GarminDebriefDataQualityNotes;
}): string {
  const parts = [
    `${input.trackReplay.length} Garmin track point(s)`,
    `${input.messageTimeline.length} message/check-in event(s)`,
  ];
  if (input.staleGaps.length > 0) parts.push(`${input.staleGaps.length} stale gap(s)`);
  if (input.batteryRiskEvents.length > 0) parts.push(`${input.batteryRiskEvents.length} battery risk event(s)`);
  if (input.incidentChronology.length > 0) parts.push(`${input.incidentChronology.length} SOS/incident signal(s)`);
  if (input.plannedRouteComparison.status !== 'not_available') {
    parts.push(`route comparison: ${input.plannedRouteComparison.status}`);
  }
  if (input.dataQuality.unknownMessageCodes.length > 0 || input.dataQuality.staleKml) {
    parts.push('data quality notes present');
  }
  return `Garmin/inReach debrief: ${parts.join(', ')}.`;
}

function commandTitle(type: string): string {
  if (type === 'locate_response') return 'Garmin locate response';
  if (type === 'tracking_started') return 'Garmin tracking started';
  if (type === 'tracking_interval_changed') return 'Garmin tracking interval changed';
  if (type === 'tracking_stopped') return 'Garmin tracking stopped';
  if (type === 'pingback_response') return 'Garmin pingback response';
  return 'Garmin command response';
}

function sanitizeDeviceLabel(value: string | null | undefined): string {
  if (!value) return 'inReach device';
  if (/^\d{8,}$/.test(value.replace(/\D/g, ''))) return maskGarminDeviceIdentifier(value);
  return String(value).slice(0, 64);
}

function sanitizeDeviceHash(value: string | null | undefined): string {
  return value?.startsWith('garmin_') ? value : stableHashGarminIdentifier(value);
}

function validTimestamp(value: string | null | undefined): boolean {
  return !!value && Number.isFinite(Date.parse(value));
}

function hasValidCoordinate(value: GarminDebriefCoordinate | null | undefined): value is GarminDebriefCoordinate {
  return !!value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180;
}

function distanceToRouteMeters(point: GarminDebriefCoordinate, route: GarminDebriefCoordinate[]): number {
  if (route.length === 0) return 0;
  return Math.min(...route.map((routePoint) => distanceMeters(point, routePoint)));
}

function distanceMeters(a: GarminDebriefCoordinate, b: GarminDebriefCoordinate): number {
  const dLat = degToRad(b.latitude - a.latitude);
  const dLon = degToRad(b.longitude - a.longitude);
  const lat1 = degToRad(a.latitude);
  const lat2 = degToRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}
