import type { DispatchCadEvent, DispatchCoordinates } from '../dispatchTypes';
import type { DispatchEvent } from '../dispatchLiveEvents';

export type GarminInreachInboundEventType =
  | 'location'
  | 'message'
  | 'sos'
  | 'tracking'
  | 'delivery_status'
  | 'device_status';

export type GarminInreachSosStatus =
  | 'triggered'
  | 'active'
  | 'cancelled'
  | 'resolved'
  | 'unknown';

export type GarminInreachCommandType =
  | 'send_message'
  | 'request_location'
  | 'set_tracking'
  | 'incident_note'
  | 'sos_confirm'
  | 'sos_cancel';

export type GarminInreachCommandStatus =
  | 'draft'
  | 'awaiting_operator_confirmation'
  | 'queued';

export interface GarminInreachDeviceRef {
  deviceIdentifier?: string | null;
  imei?: string | null;
  displayName?: string | null;
}

export interface GarminInreachActorRef {
  displayName?: string | null;
  callsign?: string | null;
  userId?: string | null;
}

export interface GarminInreachInboundEvent {
  id: string;
  type: GarminInreachInboundEventType;
  receivedAt: string;
  occurredAt?: string | null;
  expeditionId?: string | null;
  teamId?: string | null;
  routeSegmentId?: string | null;
  device?: GarminInreachDeviceRef | null;
  sender?: GarminInreachActorRef | null;
  messageText?: string | null;
  coordinates?: DispatchCoordinates | null;
  locationAccuracyM?: number | null;
  batteryPercent?: number | null;
  sosStatus?: GarminInreachSosStatus | null;
  deliveryStatus?: string | null;
  trackingEnabled?: boolean | null;
  rawEventType?: string | null;
}

export interface GarminInreachNormalizedDispatch {
  liveEvent: DispatchEvent;
  cadEvent: DispatchCadEvent;
}

export interface GarminInreachCommandDraft {
  id: string;
  type: GarminInreachCommandType;
  status: GarminInreachCommandStatus;
  expeditionId: string;
  operatorUserId?: string | null;
  deviceRef: {
    maskedIdentifier: string;
    identifierHash: string;
  };
  message?: string;
  trackingEnabled?: boolean;
  reason: string;
  chargeable: boolean;
  requiresExplicitOperatorConfirmation: true;
  emergencyAutomationAllowed: false;
  createdAt: string;
}

export interface GarminInreachCommandConfirmation {
  confirmed: boolean;
  operatorUserId: string;
  confirmedAt: string;
  confirmationText?: string | null;
}

export interface GarminInreachQueuedCommand extends GarminInreachCommandDraft {
  status: 'queued';
  operatorUserId: string;
  confirmedAt: string;
}

export interface GarminInreachWorkflowFixture {
  name: string;
  event: GarminInreachInboundEvent;
  expectedLiveType: DispatchEvent['type'];
  expectedSeverity: DispatchEvent['severity'];
  expectsHumanReview: boolean;
}
