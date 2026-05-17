import {
  shouldRunGarminInreachIntegration,
  supportsGarminOutboundCommands,
  type GarminInreachIntegrationConfig,
} from './garminInreachConfig';
import type { GarminInreachCommandType } from './garminInreachTypes';

export type GarminInreachTrackingStatus = 'tracking' | 'stopped' | 'unknown';

export type GarminInreachUiCommandType =
  | 'send_message'
  | 'request_location'
  | 'start_tracking'
  | 'stop_tracking';

export interface GarminInreachPositionSnapshot {
  latitude: number;
  longitude: number;
  sourceTimestamp?: string | null;
  polledAt?: string | null;
}

export interface GarminInreachMessageSnapshot {
  text: string;
  occurredAt?: string | null;
}

export interface GarminInreachOutboundCommandSnapshot {
  type: GarminInreachCommandType | GarminInreachUiCommandType;
  status: 'draft' | 'awaiting_operator_confirmation' | 'queued' | 'requested' | 'acknowledged' | 'failed';
  requestedAt?: string | null;
}

export interface GarminInreachSosSignalSnapshot {
  status: 'declared' | 'confirmed' | 'cancel_requested' | 'cancelled' | 'unknown';
  message?: string | null;
  occurredAt?: string | null;
  humanReviewRequired?: boolean;
}

export interface GarminInreachVisibilitySnapshot {
  feedName?: string | null;
  sourceLabel?: string | null;
  demoSynthetic?: boolean;
  deviceLabel?: string | null;
  memberLabel?: string | null;
  lastPosition?: GarminInreachPositionSnapshot | null;
  lastSuccessfulPollAt?: string | null;
  trackingStatus?: GarminInreachTrackingStatus | null;
  batteryPercent?: number | null;
  lastInboundMessage?: GarminInreachMessageSnapshot | null;
  lastOutboundCommandRequest?: GarminInreachOutboundCommandSnapshot | null;
  commandPending?: boolean;
  sosSignal?: GarminInreachSosSignalSnapshot | null;
}

export interface GarminInreachCommandControlModel {
  type: GarminInreachUiCommandType;
  label: string;
  enabled: boolean;
  confirmationTitle: string;
  confirmationBody: string;
}

export interface GarminInreachVisibilityModel {
  visible: boolean;
  sourceMode: string;
  readOnlyStatusLabel: string;
  feedNameLabel: string;
  lastSuccessfulPollLabel: string;
  demoSynthetic: boolean;
  deviceLabel: string;
  memberLabel: string;
  lastPositionLabel: string;
  positionAgeLabel: string;
  stale: boolean;
  trackingStatusLabel: string;
  batteryLabel: string;
  lowBattery: boolean;
  lastInboundMessageLabel: string;
  lastOutboundCommandLabel: string;
  commandPending: boolean;
  canShowCommandControls: boolean;
  commandHelperText: string | null;
  chargeWarning: string | null;
  commandControls: GarminInreachCommandControlModel[];
  sosBanner: {
    title: string;
    message: string;
    humanReviewRequired: boolean;
  } | null;
}

export function buildGarminInreachVisibilityModel(input: {
  config: GarminInreachIntegrationConfig;
  snapshot?: GarminInreachVisibilitySnapshot | null;
  now?: Date;
}): GarminInreachVisibilityModel | null {
  if (!shouldRunGarminInreachIntegration(input.config)) return null;

  const snapshot = input.snapshot ?? {};
  const now = input.now ?? new Date();
  const lastPosition = snapshot.lastPosition ?? null;
  const sourceTimestamp = lastPosition?.sourceTimestamp ?? lastPosition?.polledAt ?? null;
  const ageMs = sourceTimestamp ? now.getTime() - Date.parse(sourceTimestamp) : null;
  const stale = typeof ageMs === 'number' && ageMs > input.config.mapShareStaleAfterMs;
  const trackingStatus = snapshot.trackingStatus ?? 'unknown';
  const commandPending =
    snapshot.commandPending === true ||
    snapshot.lastOutboundCommandRequest?.status === 'queued' ||
    snapshot.lastOutboundCommandRequest?.status === 'requested' ||
    snapshot.lastOutboundCommandRequest?.status === 'awaiting_operator_confirmation';
  const canShowCommandControls = supportsGarminOutboundCommands(input.config);

  return {
    visible: true,
    sourceMode: getSourceModeLabel(input.config.mode),
    readOnlyStatusLabel: canShowCommandControls ? 'Command mode' : 'Read-only',
    feedNameLabel: snapshot.feedName || snapshot.sourceLabel || 'Garmin MapShare source',
    lastSuccessfulPollLabel: snapshot.lastSuccessfulPollAt
      ? formatRelativeAge(now.getTime() - Date.parse(snapshot.lastSuccessfulPollAt))
      : 'Poll status unknown',
    demoSynthetic: snapshot.demoSynthetic === true,
    deviceLabel: snapshot.deviceLabel || 'Garmin inReach',
    memberLabel: snapshot.memberLabel || 'Unassigned field device',
    lastPositionLabel: lastPosition
      ? `${lastPosition.latitude.toFixed(5)}, ${lastPosition.longitude.toFixed(5)}`
      : 'No Garmin position received',
    positionAgeLabel: sourceTimestamp ? formatRelativeAge(ageMs) : 'Age unknown',
    stale,
    trackingStatusLabel: getTrackingStatusLabel(trackingStatus),
    batteryLabel: typeof snapshot.batteryPercent === 'number'
      ? `${Math.max(0, Math.min(100, Math.round(snapshot.batteryPercent)))}%`
      : 'Unknown',
    lowBattery: typeof snapshot.batteryPercent === 'number' && snapshot.batteryPercent <= 20,
    lastInboundMessageLabel: snapshot.lastInboundMessage?.text || 'No inbound Garmin message',
    lastOutboundCommandLabel: formatOutboundCommand(snapshot.lastOutboundCommandRequest),
    commandPending,
    canShowCommandControls,
    commandHelperText: canShowCommandControls ? 'May take up to 20 minutes.' : null,
    chargeWarning: canShowCommandControls ? 'Charges may apply.' : null,
    commandControls: canShowCommandControls ? buildCommandControls(trackingStatus, commandPending) : [],
    sosBanner: buildSosBanner(snapshot.sosSignal ?? null),
  };
}

function buildCommandControls(
  trackingStatus: GarminInreachTrackingStatus,
  commandPending: boolean,
): GarminInreachCommandControlModel[] {
  const disabled = commandPending;
  return [
    {
      type: 'send_message',
      label: 'Message',
      enabled: !disabled,
      confirmationTitle: 'Confirm Garmin Message',
      confirmationBody: 'Queue this Garmin message request for operator-approved satellite delivery. Charges may apply.',
    },
    {
      type: 'request_location',
      label: 'Locate',
      enabled: !disabled,
      confirmationTitle: 'Confirm Locate Request',
      confirmationBody: 'Request a current Garmin position. Delivery is queued, not guaranteed, and charges may apply.',
    },
    {
      type: trackingStatus === 'tracking' ? 'stop_tracking' : 'start_tracking',
      label: trackingStatus === 'tracking' ? 'Stop Track' : 'Start Track',
      enabled: !disabled,
      confirmationTitle: trackingStatus === 'tracking' ? 'Confirm Stop Tracking' : 'Confirm Start Tracking',
      confirmationBody: 'Change Garmin tracking only after operator confirmation. Satellite commands may take up to 20 minutes.',
    },
  ];
}

function buildSosBanner(signal: GarminInreachSosSignalSnapshot | null): GarminInreachVisibilityModel['sosBanner'] {
  if (!signal) return null;
  const humanReviewRequired = signal.humanReviewRequired !== false;
  if (signal.status === 'cancel_requested' || signal.status === 'cancelled') {
    return {
      title: 'SOS signal requires review',
      message: 'Garmin SOS cancel or confirm signals are review-only in ECS. Do not close an incident automatically.',
      humanReviewRequired,
    };
  }
  return {
    title: 'Garmin SOS signal received',
    message: signal.message || 'Review the incident context and confirm status with the field team or authorities.',
    humanReviewRequired,
  };
}

function getSourceModeLabel(mode: GarminInreachIntegrationConfig['mode']): string {
  switch (mode) {
    case 'mapshare':
      return 'MapShare';
    case 'ipc_readonly':
      return 'IPC read-only';
    case 'ipc_command':
      return 'IPC command';
    default:
      return 'Off';
  }
}

function getTrackingStatusLabel(status: GarminInreachTrackingStatus): string {
  switch (status) {
    case 'tracking':
      return 'Tracking';
    case 'stopped':
      return 'Tracking stopped';
    default:
      return 'Tracking unknown';
  }
}

function formatOutboundCommand(command: GarminInreachOutboundCommandSnapshot | null | undefined): string {
  if (!command) return 'No outbound Garmin command requested';
  const label = String(command.type).replace(/_/g, ' ');
  const status = String(command.status).replace(/_/g, ' ');
  return `${capitalize(label)}: ${capitalize(status)}`;
}

function formatRelativeAge(ageMs: number | null): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'Age unknown';
  if (ageMs < 0) return 'Just now';
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
