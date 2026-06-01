import { createDispatchEntityId, createDispatchIdempotencyKey } from '../dispatchIntegrity';
import type {
  DispatchCadEvent,
  DispatchCadEventType,
  DispatchCadPriority,
} from '../dispatchTypes';
import type {
  DispatchEvent,
  DispatchEventSeverity,
  DispatchEventType,
} from '../dispatchLiveEvents';
import type {
  GarminInreachCommandConfirmation,
  GarminInreachCommandDraft,
  GarminInreachCommandType,
  GarminInreachInboundEvent,
  GarminInreachNormalizedDispatch,
  GarminInreachQueuedCommand,
} from './garminInreachTypes';

const FALLBACK_EXPEDITION_ID = 'expedition-unassigned';
const GARMIN_ACTOR = 'garmin-inreach-adapter';

type EventPresentation = {
  liveType: DispatchEventType;
  cadType: DispatchCadEventType;
  severity: DispatchEventSeverity;
  priority: DispatchCadPriority;
  title: string;
  message: string;
  details: string;
  humanReviewRequired: boolean;
};

export function stableHashGarminIdentifier(value: string | null | undefined): string {
  const normalized = String(value ?? 'unknown').trim().toLowerCase() || 'unknown';
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(index);
  }
  return `garmin_${(hash >>> 0).toString(36)}`;
}

export function maskGarminDeviceIdentifier(value: string | null | undefined): string {
  const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');
  if (!normalized) return 'inReach device';
  const suffix = normalized.slice(-4);
  return `inReach ***${suffix}`;
}

export function normalizeGarminInreachEventToDispatch(
  event: GarminInreachInboundEvent,
): GarminInreachNormalizedDispatch {
  const presentation = getPresentation(event);
  const occurredAt = normalizeTimestamp(event.occurredAt) ?? normalizeTimestamp(event.receivedAt) ?? new Date().toISOString();
  const expeditionId = sanitizeReference(event.expeditionId) || FALLBACK_EXPEDITION_ID;
  const sourceEntityId = sanitizeReference(event.id) || stableHashGarminIdentifier(`${event.type}:${occurredAt}`);
  const deviceIdentifier = event.device?.imei ?? event.device?.deviceIdentifier ?? null;
  const deviceRef = {
    maskedIdentifier: maskGarminDeviceIdentifier(deviceIdentifier),
    identifierHash: stableHashGarminIdentifier(deviceIdentifier),
  };
  const idempotencyKey = createDispatchIdempotencyKey({
    expeditionId,
    entityType: 'timeline_event',
    actionType: `garmin_inreach:${event.type}`,
    actorMemberId: GARMIN_ACTOR,
    sourceEntityId,
    message: `${presentation.title}:${presentation.message}`,
    priority: presentation.priority,
    metadata: {
      deviceHash: deviceRef.identifierHash,
      routeSegmentId: event.routeSegmentId ?? null,
      occurredAt,
    },
  });
  const safeSender = sanitizeText(event.sender?.callsign ?? event.sender?.displayName ?? event.device?.displayName ?? 'inReach', 48);

  const liveEvent: DispatchEvent = {
    id: createDispatchEntityId('timeline_event', `live:${idempotencyKey}`),
    type: presentation.liveType,
    severity: presentation.severity,
    title: presentation.title,
    message: presentation.message,
    details: presentation.details,
    source: 'team_member',
    createdAt: occurredAt,
    updatedAt: normalizeTimestamp(event.receivedAt) ?? occurredAt,
    status: presentation.humanReviewRequired ? 'human_review_required' : 'received',
    priority: presentation.priority,
    category: presentation.liveType === 'assistance' || presentation.liveType === 'recovery'
      ? 'recovery_assist'
      : undefined,
    hazardType: presentation.liveType === 'assistance' ? 'recovery' : undefined,
    dedupeKey: idempotencyKey,
    createdBy: {
      displayName: safeSender,
      callsign: sanitizeText(event.sender?.callsign, 24),
    },
    location: event.coordinates
      ? {
          latitude: event.coordinates.latitude,
          longitude: event.coordinates.longitude,
          accuracyMeters: normalizeNullableNumber(event.locationAccuracyM),
          timestamp: occurredAt,
          source: 'last_known_gps',
        }
      : undefined,
    teamId: sanitizeReference(event.teamId),
    routeSegmentId: sanitizeReference(event.routeSegmentId),
    syncState: 'received',
    requiresMapDrilldown: !!event.coordinates,
  };

  const cadEvent: DispatchCadEvent = {
    id: createDispatchEntityId('timeline_event', `cad:${idempotencyKey}`),
    expeditionId,
    timestamp: occurredAt,
    type: presentation.cadType,
    priority: presentation.priority,
    title: presentation.title,
    summary: presentation.message,
    details: presentation.details,
    status: 'new',
    source: 'system',
    createdBy: GARMIN_ACTOR,
    linkedContext: event.coordinates
      ? {
          id: `garmin-inreach:${sourceEntityId}`,
          type: 'current_location',
          title: 'inReach last known position',
          subtitle: deviceRef.maskedIdentifier,
          coordinates: event.coordinates,
          metadata: {
            provider: 'garmin_inreach',
            deviceHash: deviceRef.identifierHash,
          },
        }
      : null,
    metadata: {
      provider: 'garmin_inreach',
      garminEventType: event.type,
      rawEventType: sanitizeText(event.rawEventType, 64),
      deviceRef,
      humanReviewRequired: presentation.humanReviewRequired,
      sosAutomationBlocked: event.type === 'sos',
      batteryPercent: normalizeNullableNumber(event.batteryPercent),
      deliveryStatus: sanitizeText(event.deliveryStatus, 48),
      trackingEnabled: typeof event.trackingEnabled === 'boolean' ? event.trackingEnabled : null,
    },
  };

  return { liveEvent, cadEvent };
}

export function createGarminInreachCommandDraft(input: {
  id: string;
  type: GarminInreachCommandType;
  expeditionId: string;
  deviceIdentifier: string;
  message?: string;
  trackingEnabled?: boolean;
  reason?: string;
  createdAt?: string;
}): GarminInreachCommandDraft {
  if (isSosAutomationCommand(input.type)) {
    throw new Error('Garmin inReach SOS confirm/cancel automation is blocked. Route SOS signals to human review.');
  }

  const safeMessage = sanitizeText(input.message, 280);
  const id = sanitizeReference(input.id) || stableHashGarminIdentifier(`${input.type}:${input.createdAt ?? ''}`);

  return {
    id,
    type: input.type,
    status: 'awaiting_operator_confirmation',
    expeditionId: sanitizeReference(input.expeditionId) || FALLBACK_EXPEDITION_ID,
    deviceRef: {
      maskedIdentifier: maskGarminDeviceIdentifier(input.deviceIdentifier),
      identifierHash: stableHashGarminIdentifier(input.deviceIdentifier),
    },
    message: safeMessage,
    trackingEnabled: typeof input.trackingEnabled === 'boolean' ? input.trackingEnabled : undefined,
    reason: sanitizeText(input.reason, 160) || 'Operator confirmation required before sending an inReach command.',
    chargeable: true,
    requiresExplicitOperatorConfirmation: true,
    emergencyAutomationAllowed: false,
    createdAt: normalizeTimestamp(input.createdAt) ?? new Date().toISOString(),
  };
}

export function confirmGarminInreachCommandDraft(
  draft: GarminInreachCommandDraft,
  confirmation: GarminInreachCommandConfirmation,
): GarminInreachQueuedCommand {
  if (isSosAutomationCommand(draft.type)) {
    throw new Error('Garmin inReach SOS confirm/cancel automation is blocked. Route SOS signals to human review.');
  }
  if (!confirmation.confirmed || !sanitizeReference(confirmation.operatorUserId)) {
    throw new Error('Explicit operator confirmation is required before queueing an inReach command.');
  }

  return {
    ...draft,
    status: 'queued',
    operatorUserId: sanitizeReference(confirmation.operatorUserId),
    confirmedAt: normalizeTimestamp(confirmation.confirmedAt) ?? new Date().toISOString(),
  };
}

export function isSosAutomationCommand(type: GarminInreachCommandType): boolean {
  return type === 'sos_confirm' || type === 'sos_cancel';
}

function getPresentation(event: GarminInreachInboundEvent): EventPresentation {
  const message = sanitizeText(event.messageText, 180);
  const deviceLabel = maskGarminDeviceIdentifier(event.device?.imei ?? event.device?.deviceIdentifier);

  switch (event.type) {
    case 'sos':
      return {
        liveType: 'assistance',
        cadType: 'assist',
        severity: 'critical',
        priority: 'critical',
        title: 'inReach SOS signal received',
        message: 'inReach SOS signal requires operator review. ECS will not confirm or cancel SOS automatically.',
        details: `Treat this as an incident signal from ${deviceLabel}. Verify status with the party and appropriate emergency channels before taking action.`,
        humanReviewRequired: true,
      };
    case 'message':
      return {
        liveType: 'team_ping',
        cadType: 'ping',
        severity: message.toLowerCase().includes('help') ? 'warning' : 'info',
        priority: message.toLowerCase().includes('help') ? 'high' : 'normal',
        title: 'inReach message received',
        message: message || 'Message received from inReach device.',
        details: `Inbound satellite message received from ${deviceLabel}. Operator should review before replying.`,
        humanReviewRequired: false,
      };
    case 'location':
      return {
        liveType: 'team_ping',
        cadType: 'check_in',
        severity: 'info',
        priority: 'normal',
        title: 'inReach location update',
        message: 'Satellite location update received.',
        details: `Last known inReach position received from ${deviceLabel}. Location precision depends on source data.`,
        humanReviewRequired: false,
      };
    case 'tracking':
      return {
        liveType: 'route',
        cadType: 'route',
        severity: 'info',
        priority: 'normal',
        title: 'inReach tracking update',
        message: event.trackingEnabled === false ? 'inReach tracking appears stopped.' : 'inReach tracking update received.',
        details: `Tracking state update received from ${deviceLabel}. Verify before changing active guidance or incident status.`,
        humanReviewRequired: false,
      };
    case 'delivery_status':
      return {
        liveType: 'sync',
        cadType: 'system',
        severity: event.deliveryStatus?.toLowerCase().includes('fail') ? 'watch' : 'info',
        priority: event.deliveryStatus?.toLowerCase().includes('fail') ? 'high' : 'normal',
        title: 'inReach delivery status',
        message: sanitizeText(event.deliveryStatus, 120) || 'inReach delivery status received.',
        details: `Delivery status update received from ${deviceLabel}. Chargeable message actions still require operator confirmation.`,
        humanReviewRequired: false,
      };
    case 'device_status':
    default:
      return {
        liveType: 'system',
        cadType: 'system',
        severity: typeof event.batteryPercent === 'number' && event.batteryPercent <= 20 ? 'watch' : 'info',
        priority: typeof event.batteryPercent === 'number' && event.batteryPercent <= 20 ? 'high' : 'normal',
        title: 'inReach device status',
        message: typeof event.batteryPercent === 'number'
          ? `inReach battery reported at ${Math.round(event.batteryPercent)}%.`
          : 'inReach device status received.',
        details: `Device status update received from ${deviceLabel}.`,
        humanReviewRequired: false,
      };
  }
}

function sanitizeReference(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96)
    : '';
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength).trim();
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}
