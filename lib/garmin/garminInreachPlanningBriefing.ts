import { generateGPX } from '../gpxExport';
import { generateKML } from '../kmlExport';
import type {
  ImportedRoute,
  RouteWaypoint,
} from '../routeStore';
import type {
  MissionBrief,
  MissionBriefLine,
  MissionBriefSection,
  MissionBriefStatus,
  MissionBriefTask,
} from '../missionBriefEngine';
import {
  shouldRunGarminInreachIntegration,
  supportsGarminMapShareKmlIngestion,
  supportsGarminOutboundCommands,
  type GarminInreachIntegrationConfig,
} from './garminInreachConfig';

export interface GarminInreachCheckInScheduleItem {
  id: string;
  label: string;
  dueAt: string;
  method: 'predefined_message' | 'free_text' | 'voice_or_radio_backup';
  expectedTemplate: string;
}

export interface GarminInreachMessageTemplate {
  id: string;
  label: string;
  text: string;
  intendedUse: string;
}

export interface GarminInreachEmergencyContact {
  name: string;
  role?: string | null;
  contactMethod?: string | null;
}

export interface GarminInreachCommsCard {
  title: string;
  deviceOwner: string;
  backupCommsPlan: string;
  emergencyContacts: GarminInreachEmergencyContact[];
  escalationThresholds: string[];
  commandRestrictions: string[];
  notRealTimeNote: string;
  sosPolicy: string;
}

export interface GarminInreachPlanningInput {
  config: GarminInreachIntegrationConfig;
  route?: ImportedRoute | null;
  deviceOwner?: string | null;
  deviceLabel?: string | null;
  checkInCadenceMinutes?: number | null;
  expeditionStartAt?: string | null;
  expeditionEndAt?: string | null;
  mapShareLink?: string | null;
  backupCommsPlan?: string | null;
  emergencyContacts?: GarminInreachEmergencyContact[];
  messageTemplates?: GarminInreachMessageTemplate[];
  checkInSchedule?: GarminInreachCheckInScheduleItem[];
}

export interface GarminInreachExportArtifact {
  id: string;
  label: string;
  filename: string;
  mimeType: string;
  content: string;
  credentialRequired: false;
  note: string;
}

export interface GarminInreachWaypointListItem {
  index: number;
  name: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number | null;
  type?: string | null;
}

export interface GarminInreachPlanningArtifacts {
  enabled: boolean;
  generatedAt: string;
  sourceMode: string;
  artifacts: GarminInreachExportArtifact[];
  waypointList: GarminInreachWaypointListItem[];
  checkInSchedule: GarminInreachCheckInScheduleItem[];
  commsCard: GarminInreachCommsCard;
  messageTemplates: GarminInreachMessageTemplate[];
  deviceSyncClaim: 'not_claimed';
  notes: string[];
}

export interface GarminInreachPreflightChecklistItem {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  category: 'subscription' | 'device' | 'contacts' | 'tracking' | 'commands' | 'policy';
}

export type GarminMissionBriefWithComms<T extends MissionBrief = MissionBrief> = T & {
  garminCommsSection?: MissionBriefSection | null;
  garminCommsPlan?: {
    deviceOwner: string;
    checkInCadence: string;
    mapShareStatus: string;
    commandRestrictions: string[];
    backupCommsPlan: string;
  } | null;
};

const DEFAULT_MESSAGE_TEMPLATES: GarminInreachMessageTemplate[] = [
  {
    id: 'check-in-ok',
    label: 'Check-in OK',
    text: 'Checking in. Status OK. Continuing as planned.',
    intendedUse: 'Routine scheduled check-in.',
  },
  {
    id: 'delayed-ok',
    label: 'Delayed OK',
    text: 'Delayed but OK. Holding or moving slowly. Will update at next check-in.',
    intendedUse: 'Delay without immediate assistance request.',
  },
  {
    id: 'need-assistance',
    label: 'Need Assistance',
    text: 'Need assistance. No immediate injury reported. Confirm location and next steps.',
    intendedUse: 'Non-SOS assistance workflow requiring operator review.',
  },
  {
    id: 'camp-established',
    label: 'Camp Established',
    text: 'Camp established. Team accounted for. Next update in the morning.',
    intendedUse: 'End-of-day status update.',
  },
];

const PREFLIGHT_ITEMS: GarminInreachPreflightChecklistItem[] = [
  checklistItem('subscription-active', 'inReach subscription active', 'Confirm the Garmin/inReach plan is active for the expedition dates.', true, 'subscription'),
  checklistItem('device-charged', 'device charged', 'Charge the inReach device and confirm field power reserve.', true, 'device'),
  checklistItem('device-registered', 'IMEI/device registered in ECS if available', 'Link the device to ECS when the device registry supports it.', false, 'device'),
  checklistItem('explore-synced', 'Garmin Explore synced', 'Sync routes, waypoints, contacts, and preset messages before departure.', true, 'device'),
  checklistItem('contacts-configured', 'contacts/messages configured', 'Confirm recipients and predefined messages are current.', true, 'contacts'),
  checklistItem('test-message-sent', 'test message sent', 'Send a non-emergency test message before entering the field.', true, 'contacts'),
  checklistItem('mapshare-configured', 'MapShare/Portal Connect configured if used', 'Verify MapShare/KML or Portal Connect status if the expedition depends on it.', false, 'tracking'),
  checklistItem('tracking-interval-selected', 'tracking interval selected', 'Choose a tracking interval that matches battery and plan limits.', true, 'tracking'),
  checklistItem('command-authority-confirmed', 'command authority confirmed', 'Confirm who may approve Garmin messages, locate requests, or tracking changes.', true, 'commands'),
  checklistItem('sos-policy-reviewed', 'Emergency/SOS policy reviewed', 'Review SOS expectations. ECS does not confirm, cancel, or close SOS automatically.', true, 'policy'),
];

export function buildGarminInreachPlanningArtifacts(
  input: GarminInreachPlanningInput,
  now: Date = new Date(),
): GarminInreachPlanningArtifacts | null {
  if (!shouldRunGarminInreachIntegration(input.config)) return null;

  const generatedAt = now.toISOString();
  const messageTemplates = input.messageTemplates?.length ? input.messageTemplates : DEFAULT_MESSAGE_TEMPLATES;
  const checkInSchedule = input.checkInSchedule?.length
    ? input.checkInSchedule
    : buildCheckInSchedule({
      startAt: input.expeditionStartAt,
      endAt: input.expeditionEndAt,
      cadenceMinutes: input.checkInCadenceMinutes ?? 120,
      templates: messageTemplates,
      now,
    });
  const waypointList = input.route ? buildWaypointList(input.route.waypoints) : [];
  const commsCard = buildCommsCard(input, checkInSchedule, messageTemplates);
  const artifacts: GarminInreachExportArtifact[] = [];

  if (input.route) {
    artifacts.push({
      id: 'garmin-gpx-route',
      label: 'GPX route',
      filename: safeFilename(input.route.name, 'gpx'),
      mimeType: 'application/gpx+xml',
      content: generateGPX(input.route, {
        creator: 'ECS Garmin/inReach Planning Export',
        description: garminExportDescription(input),
      }),
      credentialRequired: false,
      note: 'Garmin-compatible GPX artifact generated offline. ECS does not claim automatic Garmin route sync.',
    });
    artifacts.push({
      id: 'garmin-kml-route',
      label: 'KML route',
      filename: safeFilename(input.route.name, 'kml'),
      mimeType: 'application/vnd.google-earth.kml+xml',
      content: generateKML(input.route, {
        creator: 'ECS Garmin/inReach Planning Export',
        description: garminExportDescription(input),
      }),
      credentialRequired: false,
      note: 'Garmin-compatible KML artifact generated offline for supported import/export workflows.',
    });
  }

  artifacts.push(textArtifact('garmin-waypoint-list', 'Waypoint list', 'waypoints.txt', formatWaypointList(waypointList)));
  artifacts.push(textArtifact('garmin-check-in-schedule', 'Check-in schedule', 'check-in-schedule.txt', formatCheckInSchedule(checkInSchedule)));
  artifacts.push(textArtifact('garmin-comms-card', 'Emergency contact/comms card', 'garmin-comms-card.txt', formatCommsCard(commsCard)));
  artifacts.push(textArtifact('garmin-message-templates', 'Message templates', 'message-templates.txt', formatMessageTemplates(messageTemplates)));

  return {
    enabled: true,
    generatedAt,
    sourceMode: sourceModeLabel(input.config.mode),
    artifacts,
    waypointList,
    checkInSchedule,
    commsCard,
    messageTemplates,
    deviceSyncClaim: 'not_claimed',
    notes: [
      'Generated without Garmin credentials or live Garmin API access.',
      'Not all Garmin/inReach devices support route sync; use official Garmin import/sync workflows where supported.',
      'ECS does not claim automatic device sync from these artifacts.',
    ],
  };
}

export function buildGarminInreachPreflightChecklist(
  config: GarminInreachIntegrationConfig,
): GarminInreachPreflightChecklistItem[] {
  if (!shouldRunGarminInreachIntegration(config)) return [];
  return PREFLIGHT_ITEMS.map((item) => ({ ...item }));
}

export function appendGarminInreachPreflightChecklist<T extends { id: string }>(
  existing: T[],
  config: GarminInreachIntegrationConfig,
): Array<T | GarminInreachPreflightChecklistItem> {
  return [
    ...existing,
    ...buildGarminInreachPreflightChecklist(config),
  ];
}

export function buildGarminInreachBriefSection(
  input: GarminInreachPlanningInput,
): MissionBriefSection | null {
  if (!shouldRunGarminInreachIntegration(input.config)) return null;

  const cadence = input.checkInCadenceMinutes
    ? `${input.checkInCadenceMinutes} min`
    : 'Not set';
  const mapShareStatus = supportsGarminMapShareKmlIngestion(input.config)
    ? input.mapShareLink || input.config.kmlFeeds.length > 0
      ? 'Configured'
      : 'MapShare mode enabled, feed not configured'
    : 'Not configured';
  const commandRestriction = supportsGarminOutboundCommands(input.config)
    ? 'Commands require explicit operator confirmation. Delivery is queued/requested, not assumed.'
    : 'Command controls unavailable in this Garmin mode.';
  const lines: MissionBriefLine[] = [
    briefLine('garmin-owner', `Device owner/member: ${input.deviceOwner || 'Not assigned'}`, 'advisory', 4, 'person-circle-outline'),
    briefLine('garmin-cadence', `Check-in cadence: ${cadence}`, input.checkInCadenceMinutes ? 'standby' : 'advisory', 4, 'time-outline'),
    briefLine('garmin-templates', `Expected templates: ${templateLabels(input.messageTemplates ?? DEFAULT_MESSAGE_TEMPLATES)}`, 'standby', 5, 'chatbubble-ellipses-outline'),
    briefLine('garmin-escalation', 'Escalate stale location, missed check-in, SOS, or unexpected movement through Incident & Recovery review.', 'advisory', 2, 'warning-outline'),
    briefLine('garmin-mapshare', `MapShare/KML status: ${mapShareStatus}`, mapShareStatus === 'Configured' ? 'standby' : 'advisory', 4, 'map-outline'),
    briefLine('garmin-command-restriction', commandRestriction, 'advisory', 2, 'lock-closed-outline'),
    briefLine('garmin-not-realtime', 'Garmin/inReach is not real-time. Satellite messages, tracking, and commands may be delayed.', 'advisory', 2, 'radio-outline'),
    briefLine('garmin-backup', `Backup comms: ${input.backupCommsPlan || 'Not documented'}`, input.backupCommsPlan ? 'standby' : 'advisory', 3, 'call-outline'),
  ];

  return {
    title: 'Garmin Comms Plan',
    summary: `Garmin source mode: ${sourceModeLabel(input.config.mode)}. ${commandRestriction}`,
    status: statusFromLines(lines),
    lines,
  };
}

export function applyGarminInreachBriefSection<T extends MissionBrief>(
  brief: T,
  input: GarminInreachPlanningInput,
): GarminMissionBriefWithComms<T> {
  const section = buildGarminInreachBriefSection(input);
  if (!section) {
    return {
      ...brief,
      garminCommsSection: null,
      garminCommsPlan: null,
    };
  }

  return {
    ...brief,
    garminCommsSection: section,
    garminCommsPlan: {
      deviceOwner: input.deviceOwner || 'Not assigned',
      checkInCadence: input.checkInCadenceMinutes ? `${input.checkInCadenceMinutes} min` : 'Not set',
      mapShareStatus: section.lines.find((lineItem) => lineItem.id === 'garmin-mapshare')?.text ?? 'MapShare/KML status unknown',
      commandRestrictions: section.lines
        .filter((lineItem) => lineItem.id === 'garmin-command-restriction' || lineItem.id === 'garmin-not-realtime')
        .map((lineItem) => lineItem.text),
      backupCommsPlan: input.backupCommsPlan || 'Not documented',
    },
  };
}

export function buildGarminInreachBriefTasks(
  config: GarminInreachIntegrationConfig,
): MissionBriefTask[] {
  return buildGarminInreachPreflightChecklist(config).map((item) => ({
    id: `garmin-${item.id}`,
    title: item.label,
    detail: item.detail,
    urgency: item.required ? 'next' : 'monitor',
    category: 'systems',
    icon: iconForChecklistCategory(item.category),
  }));
}

function buildCheckInSchedule(input: {
  startAt?: string | null;
  endAt?: string | null;
  cadenceMinutes: number;
  templates: GarminInreachMessageTemplate[];
  now: Date;
}): GarminInreachCheckInScheduleItem[] {
  const startMs = Date.parse(input.startAt || '') || input.now.getTime();
  const endMs = Date.parse(input.endAt || '') || startMs + 8 * 60 * 60 * 1000;
  const cadenceMs = Math.max(30, Math.round(input.cadenceMinutes || 120)) * 60 * 1000;
  const template = input.templates.find((item) => item.id === 'check-in-ok') ?? input.templates[0] ?? DEFAULT_MESSAGE_TEMPLATES[0];
  const schedule: GarminInreachCheckInScheduleItem[] = [];

  for (let dueMs = startMs + cadenceMs, index = 1; dueMs <= endMs && index <= 12; dueMs += cadenceMs, index += 1) {
    schedule.push({
      id: `check-in-${index}`,
      label: `Check-in ${index}`,
      dueAt: new Date(dueMs).toISOString(),
      method: 'predefined_message',
      expectedTemplate: template.text,
    });
  }

  return schedule;
}

function buildCommsCard(
  input: GarminInreachPlanningInput,
  schedule: GarminInreachCheckInScheduleItem[],
  templates: GarminInreachMessageTemplate[],
): GarminInreachCommsCard {
  return {
    title: 'Garmin inReach Comms Card',
    deviceOwner: input.deviceOwner || 'Not assigned',
    backupCommsPlan: input.backupCommsPlan || 'Not documented. Confirm cell, radio, satellite, and trusted contact fallback before departure.',
    emergencyContacts: input.emergencyContacts ?? [],
    escalationThresholds: [
      'Missed scheduled check-in beyond the agreed grace window.',
      'Garmin location becomes stale or conflicts with ECS route/convoy expectations.',
      'SOS declared, confirmed, or cancel signal received; human review required.',
      'Unexpected stop, movement, or route deviation during active expedition phase.',
    ],
    commandRestrictions: [
      'No automatic Garmin commands from ECS AI.',
      'No SOS confirm or cancel automation.',
      'Outbound Garmin messages, locate requests, and tracking changes require explicit operator confirmation.',
      'Treat command state as queued/requested unless explicit delivery confirmation is available.',
    ],
    notRealTimeNote: 'Garmin/inReach satellite communication is not real-time. Messages, tracking updates, and command responses may be delayed.',
    sosPolicy: 'Use Garmin SOS only according to device policy and real-world emergency need. ECS treats SOS signals as incident review evidence and does not replace emergency services.',
  };
}

function buildWaypointList(waypoints: RouteWaypoint[]): GarminInreachWaypointListItem[] {
  return waypoints.map((waypoint, index) => ({
    index: index + 1,
    name: waypoint.name || `Waypoint ${index + 1}`,
    latitude: waypoint.lat,
    longitude: waypoint.lon,
    elevationMeters: waypoint.ele,
    type: waypoint.waypointType ?? null,
  }));
}

function textArtifact(id: string, label: string, filename: string, content: string): GarminInreachExportArtifact {
  return {
    id,
    label,
    filename,
    mimeType: 'text/plain',
    content,
    credentialRequired: false,
    note: 'Generated offline by ECS planning support.',
  };
}

function formatWaypointList(waypoints: GarminInreachWaypointListItem[]): string {
  if (waypoints.length === 0) return 'No route waypoints available.';
  return waypoints
    .map((waypoint) =>
      `${waypoint.index}. ${waypoint.name} / ${waypoint.latitude.toFixed(6)}, ${waypoint.longitude.toFixed(6)}${waypoint.type ? ` / ${waypoint.type}` : ''}`
    )
    .join('\n');
}

function formatCheckInSchedule(schedule: GarminInreachCheckInScheduleItem[]): string {
  if (schedule.length === 0) return 'No check-in schedule generated.';
  return schedule
    .map((item) => `${item.label} / ${item.dueAt} / ${item.method} / ${item.expectedTemplate}`)
    .join('\n');
}

function formatCommsCard(card: GarminInreachCommsCard): string {
  return [
    card.title,
    `Device owner: ${card.deviceOwner}`,
    `Backup comms: ${card.backupCommsPlan}`,
    '',
    'Emergency contacts:',
    ...(card.emergencyContacts.length
      ? card.emergencyContacts.map((contact) => `- ${contact.name}${contact.role ? ` (${contact.role})` : ''}${contact.contactMethod ? ` / ${contact.contactMethod}` : ''}`)
      : ['- None documented']),
    '',
    'Escalation thresholds:',
    ...card.escalationThresholds.map((item) => `- ${item}`),
    '',
    'Command restrictions:',
    ...card.commandRestrictions.map((item) => `- ${item}`),
    '',
    card.notRealTimeNote,
    card.sosPolicy,
  ].join('\n');
}

function formatMessageTemplates(templates: GarminInreachMessageTemplate[]): string {
  return templates
    .map((template) => `${template.label}: ${template.text}\nUse: ${template.intendedUse}`)
    .join('\n\n');
}

function garminExportDescription(input: GarminInreachPlanningInput): string {
  return [
    'Generated by ECS for Garmin-compatible import/export workflows.',
    'Not all Garmin/inReach devices support route sync.',
    'ECS does not claim automatic device sync.',
    `Source mode: ${sourceModeLabel(input.config.mode)}.`,
  ].join(' ');
}

function templateLabels(templates: GarminInreachMessageTemplate[]): string {
  return templates.slice(0, 4).map((template) => template.label).join(', ') || 'Not set';
}

function statusFromLines(lines: MissionBriefLine[]): MissionBriefStatus {
  if (lines.some((lineItem) => lineItem.mode === 'alert')) return 'red';
  if (lines.some((lineItem) => lineItem.mode === 'advisory')) return 'yellow';
  return 'green';
}

function briefLine(
  id: string,
  text: string,
  mode: MissionBriefLine['mode'],
  priority: number,
  icon?: string,
): MissionBriefLine {
  return { id, text, mode, priority, icon };
}

function checklistItem(
  id: string,
  label: string,
  detail: string,
  required: boolean,
  category: GarminInreachPreflightChecklistItem['category'],
): GarminInreachPreflightChecklistItem {
  return { id, label, detail, required, category };
}

function sourceModeLabel(mode: GarminInreachIntegrationConfig['mode']): string {
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

function iconForChecklistCategory(category: GarminInreachPreflightChecklistItem['category']): string {
  switch (category) {
    case 'subscription':
      return 'card-outline';
    case 'device':
      return 'radio-outline';
    case 'contacts':
      return 'people-outline';
    case 'tracking':
      return 'navigate-outline';
    case 'commands':
      return 'lock-closed-outline';
    case 'policy':
      return 'shield-checkmark-outline';
    default:
      return 'checkmark-circle-outline';
  }
}

function safeFilename(name: string, extension: string): string {
  const safeName = name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase() || 'ecs_route';
  return `${safeName}_garmin.${extension}`;
}
