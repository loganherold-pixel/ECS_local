import type { CreateEventInput, EventSeverity, EventType } from '../expeditionEventStore';
import type {
  IncidentCoordinate,
  IncidentSeverity,
  IncidentTimelineEvent,
  IncidentType,
} from '../types/incidentRecovery';
import type { DispatchEvent } from '../dispatchLiveEvents';
import { getGarminIpcMessageType, type GarminIpcNormalizedEvent } from './garminInreachOutboundWebhook';

export type GarminInreachDomainEventKind =
  | 'location_update'
  | 'field_message'
  | 'device_status_update'
  | 'incident_signal'
  | 'command_response'
  | 'debrief_timeline_event'
  | 'garmin_unknown_event';

export type GarminInreachDomainEventSource = 'garmin_inreach' | 'garmin_mapshare_kml';

export interface GarminInreachDomainEventBase {
  id: string;
  kind: GarminInreachDomainEventKind;
  source: GarminInreachDomainEventSource;
  sourceSchemaVersion: string;
  rawMessageCode: number | null;
  garminMessageType: string;
  garminTimestamp: string;
  ingestedAt: string;
  deviceRef: {
    maskedIdentifier: string;
    identifierHash: string;
  };
  dispatchEvent: DispatchEvent;
  userFacingSummary: string;
  metadata: {
    idempotencyKey: string;
    fullImeiSuppressed: true;
    automaticIncidentMutation: false;
    automaticReplySent: false;
  };
}

export interface GarminInreachLocationUpdateEvent extends GarminInreachDomainEventBase {
  kind: 'location_update';
  coordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  };
  locationSource: GarminInreachDomainEventSource;
}

export interface GarminInreachFieldMessageEvent extends GarminInreachDomainEventBase {
  kind: 'field_message';
  messageText: string;
  messageSource: GarminInreachDomainEventSource;
}

export interface GarminInreachDeviceStatusEvent extends GarminInreachDomainEventBase {
  kind: 'device_status_update';
  batteryPercent?: number | null;
  lowBattery: boolean;
  trackingEnabled?: boolean | null;
  radioStatus?: string | null;
}

export interface GarminInreachIncidentSignalEvent extends GarminInreachDomainEventBase {
  kind: 'incident_signal';
  incidentType: IncidentType;
  incidentSeverity: IncidentSeverity;
  reviewRequired: true;
  shouldOpenIncidentAutomatically: false;
  shouldCloseIncidentAutomatically: false;
  incidentSignal: {
    title: string;
    summary: string;
    status: 'review_required';
    location?: IncidentCoordinate | null;
  };
  incidentTimelineEvent: IncidentTimelineEvent;
}

export interface GarminInreachCommandResponseEvent extends GarminInreachDomainEventBase {
  kind: 'command_response';
  commandResponseType:
    | 'locate_response'
    | 'pingback_response'
    | 'mail_check'
    | 'alive_check'
    | 'tracking_started'
    | 'tracking_interval_changed'
    | 'tracking_stopped'
    | 'binary_media_payload';
}

export interface GarminInreachDebriefTimelineEvent extends GarminInreachDomainEventBase {
  kind: 'debrief_timeline_event';
  expeditionEvent: CreateEventInput;
}

export interface GarminInreachUnknownEvent extends GarminInreachDomainEventBase {
  kind: 'garmin_unknown_event';
}

export type GarminInreachDomainEvent =
  | GarminInreachLocationUpdateEvent
  | GarminInreachFieldMessageEvent
  | GarminInreachDeviceStatusEvent
  | GarminInreachIncidentSignalEvent
  | GarminInreachCommandResponseEvent
  | GarminInreachDebriefTimelineEvent
  | GarminInreachUnknownEvent;

export interface GarminInreachEventNormalizerResult {
  primaryEvent: GarminInreachDomainEvent;
  debriefTimelineEvent: GarminInreachDebriefTimelineEvent;
  allEvents: GarminInreachDomainEvent[];
}

export interface GarminInreachDomainEventPublisher {
  publish(event: GarminInreachDomainEvent): void | Promise<void>;
}

export const GARMIN_INREACH_EVENT_NORMALIZER_TODO = [
  'Wire normalized Garmin domain events into Dispatch/Incident/Expedition stores after product confirms persistence policy.',
  'Keep outbound commands behind explicit operator confirmation before adding a command publisher.',
  'Do not mutate active expedition or incident state directly from this normalizer.',
];

export function normalizeGarminInreachDomainEvent(
  input: GarminIpcNormalizedEvent,
): GarminInreachEventNormalizerResult {
  const base = buildBase(input);
  const primaryEvent = buildPrimaryEvent(input, base);
  const debriefTimelineEvent = buildDebriefTimelineEvent(input, base, primaryEvent);

  return {
    primaryEvent,
    debriefTimelineEvent,
    allEvents: primaryEvent.kind === 'debrief_timeline_event'
      ? [primaryEvent]
      : [primaryEvent, debriefTimelineEvent],
  };
}

export async function publishGarminInreachDomainEvents(
  events: GarminInreachDomainEvent[],
  publisher: GarminInreachDomainEventPublisher,
): Promise<void> {
  for (const event of events) {
    await publisher.publish(event);
  }
}

function buildBase(input: GarminIpcNormalizedEvent): GarminInreachDomainEventBase {
  return {
    id: input.idempotencyKey,
    kind: 'garmin_unknown_event',
    source: 'garmin_inreach',
    sourceSchemaVersion: input.sourcePayloadVersion,
    rawMessageCode: input.messageCode,
    garminMessageType: input.normalizedType,
    garminTimestamp: input.inboundEvent.occurredAt ?? input.inboundEvent.receivedAt,
    ingestedAt: input.inboundEvent.receivedAt,
    deviceRef: input.deviceRef,
    dispatchEvent: input.dispatch.liveEvent,
    userFacingSummary: input.dispatch.liveEvent.message,
    metadata: {
      idempotencyKey: input.idempotencyKey,
      fullImeiSuppressed: true,
      automaticIncidentMutation: false,
      automaticReplySent: false,
    },
  };
}

function buildPrimaryEvent(
  input: GarminIpcNormalizedEvent,
  base: GarminInreachDomainEventBase,
): GarminInreachDomainEvent {
  if (isIncidentSignal(input)) {
    return buildIncidentSignalEvent(input, base);
  }

  if (input.normalizedType === 'garmin_unknown_event') {
    return {
      ...base,
      kind: 'garmin_unknown_event',
      userFacingSummary: 'Garmin inReach event received with an unknown message code.',
    };
  }

  if (isCommandResponse(input)) {
    return {
      ...base,
      kind: 'command_response',
      commandResponseType: commandResponseType(input),
    };
  }

  if (isDeviceStatus(input)) {
    return {
      ...base,
      kind: 'device_status_update',
      batteryPercent: input.inboundEvent.batteryPercent,
      lowBattery: input.lowBattery,
      trackingEnabled: input.inboundEvent.trackingEnabled ?? null,
      radioStatus: radioStatus(input),
    };
  }

  if (input.inboundEvent.coordinates) {
    return {
      ...base,
      kind: 'location_update',
      coordinates: {
        latitude: input.inboundEvent.coordinates.latitude,
        longitude: input.inboundEvent.coordinates.longitude,
        accuracyMeters: input.inboundEvent.locationAccuracyM ?? null,
      },
      locationSource: 'garmin_inreach',
    };
  }

  return {
    ...base,
    kind: 'field_message',
    messageText: input.inboundEvent.messageText ?? input.dispatch.liveEvent.message,
    messageSource: 'garmin_inreach',
  };
}

function buildIncidentSignalEvent(
  input: GarminIpcNormalizedEvent,
  base: GarminInreachDomainEventBase,
): GarminInreachIncidentSignalEvent {
  const isCancelSignal = input.normalizedType === 'sos_cancel_signal_review';
  const title = isCancelSignal ? 'inReach SOS cancel signal received' : 'inReach SOS signal received';
  const summary = isCancelSignal
    ? 'SOS cancel signal requires operator review. ECS did not close an incident automatically.'
    : 'SOS signal requires operator review. ECS did not open an incident automatically.';
  const location = input.inboundEvent.coordinates
    ? {
        latitude: input.inboundEvent.coordinates.latitude,
        longitude: input.inboundEvent.coordinates.longitude,
        accuracyMeters: input.inboundEvent.locationAccuracyM ?? null,
        source: 'dispatch' as const,
        capturedAt: input.inboundEvent.occurredAt ?? input.inboundEvent.receivedAt,
      }
    : null;

  return {
    ...base,
    kind: 'incident_signal',
    incidentType: 'communication_failure',
    incidentSeverity: 'critical',
    reviewRequired: true,
    shouldOpenIncidentAutomatically: false,
    shouldCloseIncidentAutomatically: false,
    incidentSignal: {
      title,
      summary,
      status: 'review_required',
      location,
    },
    incidentTimelineEvent: {
      id: `${base.id}:incident-timeline`,
      type: isCancelSignal ? 'note' : 'reported',
      title,
      detail: summary,
      timestamp: base.garminTimestamp,
      summary,
      data: {
        source: 'garmin_inreach',
        rawMessageCode: input.messageCode,
        sourceSchemaVersion: input.sourcePayloadVersion,
        deviceRef: input.deviceRef,
      },
      severity: 'critical',
      occurredAt: base.garminTimestamp,
      source: 'dispatch',
      metadata: {
        ingestedAt: base.ingestedAt,
        automaticIncidentMutation: false,
      },
    },
    userFacingSummary: summary,
  };
}

function buildDebriefTimelineEvent(
  input: GarminIpcNormalizedEvent,
  base: GarminInreachDomainEventBase,
  primaryEvent: GarminInreachDomainEvent,
): GarminInreachDebriefTimelineEvent {
  return {
    ...base,
    id: `${base.id}:debrief`,
    kind: 'debrief_timeline_event',
    userFacingSummary: `Garmin inReach ${primaryEvent.kind.replace(/_/g, ' ')} recorded for debrief.`,
    expeditionEvent: {
      expedition_id: input.inboundEvent.expeditionId ?? 'expedition-unassigned',
      created_by: 'garmin_inreach',
      event_type: debriefEventType(primaryEvent),
      severity: debriefSeverity(primaryEvent),
      details: buildDebriefDetails(input, primaryEvent),
      title: 'Garmin inReach event',
      lat: input.inboundEvent.coordinates?.latitude ?? null,
      lon: input.inboundEvent.coordinates?.longitude ?? null,
      attachments: [{
        source: 'garmin_inreach',
        rawMessageCode: input.messageCode,
        sourceSchemaVersion: input.sourcePayloadVersion,
        garminTimestamp: base.garminTimestamp,
        ingestedAt: base.ingestedAt,
        deviceRef: input.deviceRef,
      }],
    },
  };
}

function isIncidentSignal(input: GarminIpcNormalizedEvent): boolean {
  return input.normalizedType === 'sos_declared_incident_signal' ||
    input.normalizedType === 'sos_confirmed_signal' ||
    input.normalizedType === 'sos_cancel_signal_review';
}

function isDeviceStatus(input: GarminIpcNormalizedEvent): boolean {
  return input.lowBattery ||
    input.normalizedType === 'alive_check' ||
    input.normalizedType === 'mail_check';
}

function isCommandResponse(input: GarminIpcNormalizedEvent): boolean {
  return input.normalizedType === 'locate_response' ||
    input.normalizedType === 'pingback_response' ||
    input.normalizedType === 'tracking_started' ||
    input.normalizedType === 'tracking_interval_changed' ||
    input.normalizedType === 'tracking_stopped' ||
    input.normalizedType === 'binary_media_payload';
}

function commandResponseType(input: GarminIpcNormalizedEvent): GarminInreachCommandResponseEvent['commandResponseType'] {
  const normalized = input.normalizedType;
  if (normalized === 'locate_response' ||
    normalized === 'pingback_response' ||
    normalized === 'tracking_started' ||
    normalized === 'tracking_interval_changed' ||
    normalized === 'tracking_stopped' ||
    normalized === 'binary_media_payload') {
    return normalized;
  }
  return getGarminIpcMessageType(input.messageCode) === 'mail_check' ? 'mail_check' : 'alive_check';
}

function radioStatus(input: GarminIpcNormalizedEvent): string | null {
  if (input.lowBattery) return 'low_battery';
  if (input.normalizedType === 'alive_check') return 'alive';
  if (input.normalizedType === 'mail_check') return 'mail_check';
  return null;
}

function debriefEventType(event: GarminInreachDomainEvent): EventType {
  if (event.kind === 'incident_signal') return 'COMMS';
  if (event.kind === 'location_update') return 'CHECKPOINT';
  if (event.kind === 'field_message') return 'COMMS';
  if (event.kind === 'device_status_update') return 'COMMS';
  if (event.kind === 'command_response') return 'COMMS';
  return 'NOTE';
}

function debriefSeverity(event: GarminInreachDomainEvent): EventSeverity {
  if (event.kind === 'incident_signal') return 'CRITICAL';
  if (event.kind === 'device_status_update' && event.lowBattery) return 'MED';
  if (event.kind === 'garmin_unknown_event') return 'LOW';
  return 'LOW';
}

function buildDebriefDetails(
  input: GarminIpcNormalizedEvent,
  primaryEvent: GarminInreachDomainEvent,
): string {
  return [
    primaryEvent.userFacingSummary,
    `Garmin timestamp: ${primaryEvent.garminTimestamp}.`,
    `Ingested at: ${primaryEvent.ingestedAt}.`,
    `Schema: ${input.sourcePayloadVersion}.`,
    `Message code: ${String(input.messageCode ?? 'unknown')}.`,
  ].join(' ');
}
