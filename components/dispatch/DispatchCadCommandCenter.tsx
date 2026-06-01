import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';

import ECSModalShell from '../ECSModalShell';
import ECSShellTexture from '../ECSShellTexture';
import { SafeIcon as Ionicons } from '../SafeIcon';
import DispatchReadinessContextCard from './DispatchReadinessContextCard';
import { useApp } from '../../context/AppContext';
import {
  getDispatchEventTypeLabel,
  getDispatchSeverityLabel,
  getDispatchSourceLabel,
  getTopDispatchAdvisory,
  normalizeDispatchEvent,
  sortDispatchEvents,
  type DispatchEvent,
  type DispatchEventHazardType,
  type DispatchEventSeverity,
  type DispatchEventSource,
  type DispatchEventType,
  type DispatchLiveSourceState,
} from '../../lib/dispatchLiveEvents';
import { createDispatchEventDetailPresentation } from '../../lib/dispatchEventDetailPresentation';
import { createDispatchCoordinateFingerprint } from '../../lib/dispatchEventDedupe';
import { dispatchEventStore } from '../../lib/dispatchEventStore';
import {
  buildLiveDispatchEvents,
  createLiveDispatchEventListFingerprint,
} from '../../lib/dispatchLiveAggregator';
import { publishSharedWeatherBriefAdvisories } from '../../lib/weatherBriefPublisher';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import {
  createDispatchEventFromChannelAction,
  getDispatchChannelSnapshots,
  getLiveDispatchEventInput,
  subscribeDispatchChannels,
  type DispatchChannelSnapshot,
} from '../../lib/dispatchChannelState';
import { getTeamSyncState, teamStore, type TeamStoreSnapshot } from '../../lib/teamStore';
import {
  dispatchProfileStore,
  isDispatchProfileComplete,
  type DispatchProfileSnapshot,
} from '../../lib/dispatchProfileStore';
import { routeStore, type RouteSegment } from '../../lib/routeStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import type { Vehicle } from '../../lib/types';
import { ECS, ECS_POPUP_SURFACE_DARK, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { expeditionStateStore, type ExpeditionRecord } from '../../lib/expeditionStateStore';
import { expeditionInviteLocalAdapter } from '../../lib/expeditionInviteLocalAdapter';
import { stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import {
  saveNavigationHandoffPayload,
  type NavigationHandoffPayload,
} from '../../lib/navigationHandoffStore';
import {
  recordExpeditionChannelApprovalRequiredChanged,
  recordExpeditionChannelInviteActive,
  recordExpeditionChannelInviteDisabled,
  recordExpeditionChannelInviteExpired,
  recordExpeditionChannelJoinRequestDenied,
  recordExpeditionChannelMemberJoined,
} from '../../lib/expeditionChannelCadAdapter';
import {
  isInviteExpired,
  type ExpeditionChannelInvite,
  type ExpeditionInviteStatus,
  type ExpeditionJoinRequest,
} from '../../lib/dispatchInviteDomain';
import {
  createDispatchRealtimeSession,
  type DispatchRealtimeSession,
  type DispatchRealtimeStatus,
} from '../../lib/dispatchRealtimeAdapter';
import {
  fetchDispatchCadEventsFromBackend,
  isUuid,
  upsertDispatchCadEventToBackend,
  type DispatchCadEventBackendContext,
} from '../../lib/dispatchCadEventBackendAdapter';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from '../../lib/dispatchPersistenceAdapter';
import {
  getDispatchRolloutDisabledCopy,
  isDispatchFeatureEnabled,
  resolveDispatchRolloutConfig,
  type DispatchRolloutFeature,
} from '../../lib/dispatchRolloutConfig';

function isDispatchCadDebugEnabled(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  const globalStore = globalThis as typeof globalThis & {
    ECS_DEBUG_DISPATCH?: boolean;
    __ECS_DEBUG_DISPATCH?: boolean;
  };
  return (
    globalStore.ECS_DEBUG_DISPATCH === true ||
    globalStore.__ECS_DEBUG_DISPATCH === true ||
    (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_DEBUG_DISPATCH === '1')
  );
}

function logDispatchCadDebug(...args: unknown[]) {
  if (isDispatchCadDebugEnabled()) {
    console.log(...args);
  }
}

function logDispatchCadLifecycle(message: string, details?: Record<string, unknown>, options?: {
  debugOnly?: boolean;
}): void {
  if (options?.debugOnly) {
    logDispatchCadDebug(message, details);
    return;
  }
  if (details) console.log(message, details);
  else console.log(message);
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type EventUiState = 'active' | 'acknowledged' | 'resolved' | 'queued' | 'dismissed';

type EventUiMeta = {
  state: EventUiState;
  notes: string[];
};

type EventActionId =
  | 'acknowledge'
  | 'add_note'
  | 'add_update'
  | 'send_follow_up'
  | 'mark_resolved'
  | 'broadcast_hazard'
  | 'dismiss'
  | 'request_assist';

type EventAction = {
  id: EventActionId;
  label: string;
};

type ThreatActionId = 'ping_threat' | 'mark_hazard' | 'request_assist';

type DispatchCommandType =
  | 'check_in'
  | 'ping'
  | 'assist'
  | 'rally'
  | 'hazard'
  | 'resource';

type CommandOption<T extends string> = {
  label: string;
  value: T;
};

type InvitePanelState = {
  invite: ExpeditionChannelInvite;
  pendingRequests: ExpeditionJoinRequest[];
};

type CreateExpeditionFormState = {
  expeditionName: string;
  description: string;
  leaderName: string;
  leaderCallsign: string;
  startLocation: string;
  latitude: string;
  longitude: string;
  destination: string;
  areaOfOperation: string;
  startDateTime: string;
  commsNotes: string;
  joinMode: 'approval_required' | 'open';
};

type CommandPriority = 'normal' | 'high' | 'critical';

type CommandFormState = {
  checkInStatus: 'OK' | 'Delayed' | 'Need Assistance' | 'At Rally' | 'Returning' | 'Emergency';
  pingType: 'Check-In' | 'Rally' | 'Assist' | 'Resource' | 'Hazard';
  priority: CommandPriority;
  requireAcknowledgment: boolean;
  assistType: 'Recovery' | 'Medical' | 'Navigation' | 'Fuel' | 'Water' | 'Mechanical' | 'Comms' | 'General';
  linkedContext: 'current location' | 'pin' | 'waypoint' | 'manual note';
  rallyLocation: 'current location' | 'pin' | 'waypoint' | 'manual note';
  hazardType: 'Weather' | 'Terrain' | 'Trail Blockage' | 'Water Crossing' | 'Recovery' | 'Visibility' | 'Other';
  severity: CommandPriority;
  resourceType: 'Water' | 'Fuel' | 'Food' | 'Medical' | 'Recovery Gear' | 'General Supplies';
  resourceStatus: 'OK' | 'Caution' | 'Low' | 'Critical';
  message: string;
  note: string;
};

type DispatchCommandIdentity = {
  userId?: string;
  displayName: string;
  email?: string;
  callsign?: string;
  rig?: {
    vehicleId?: string;
    label: string;
  };
};

type DispatchChannelAvailability = {
  enabled: boolean;
  reason: string | null;
};

const FALLBACK_DISPATCH_OPERATOR_NAME = 'ECS Operator';

const ACTION_LABELS: Record<EventActionId, string> = {
  acknowledge: 'Acknowledge',
  add_note: 'Add Note',
  add_update: 'Add Update',
  send_follow_up: 'Send Follow-Up',
  mark_resolved: 'Mark Resolved',
  broadcast_hazard: 'Broadcast Hazard',
  dismiss: 'Dismiss',
  request_assist: 'Request Assist',
};

const ACTIONS_BY_TYPE: Record<DispatchEventType, EventActionId[]> = {
  weather: ['broadcast_hazard', 'dismiss', 'mark_resolved'],
  route: ['add_update', 'dismiss', 'mark_resolved'],
  terrain: ['broadcast_hazard', 'dismiss', 'mark_resolved'],
  vehicle: ['add_update', 'request_assist', 'dismiss', 'mark_resolved'],
  resources: ['add_update', 'mark_resolved'],
  sync: ['dismiss'],
  system: ['dismiss'],
  team_ping: ['acknowledge', 'send_follow_up', 'mark_resolved'],
  assistance: ['acknowledge', 'add_update', 'mark_resolved'],
  recovery: ['acknowledge', 'add_update', 'mark_resolved'],
};

const COMMAND_TITLES: Record<DispatchCommandType, string> = {
  check_in: 'Check In',
  ping: 'Ping Team',
  assist: 'Assist',
  rally: 'Rally',
  hazard: 'Hazard',
  resource: 'Resource',
};

const CHECK_IN_STATUS_OPTIONS: CommandOption<CommandFormState['checkInStatus']>[] = ([
  'OK',
  'Delayed',
  'Need Assistance',
  'At Rally',
  'Returning',
  'Emergency',
] as const).map((value) => ({ label: value, value }));

const PING_TYPE_OPTIONS: CommandOption<CommandFormState['pingType']>[] = ([
  'Check-In',
  'Rally',
  'Assist',
  'Resource',
  'Hazard',
] as const).map((value) => ({ label: value, value }));

const PRIORITY_OPTIONS: CommandOption<CommandPriority>[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const ASSIST_TYPE_OPTIONS: CommandOption<CommandFormState['assistType']>[] = ([
  'Recovery',
  'Medical',
  'Navigation',
  'Fuel',
  'Water',
  'Mechanical',
  'Comms',
  'General',
] as const).map((value) => ({ label: value, value }));

const LINKED_CONTEXT_OPTIONS: CommandOption<CommandFormState['linkedContext']>[] = ([
  'current location',
  'pin',
  'waypoint',
  'manual note',
] as const).map((value) => ({ label: value, value }));

const HAZARD_TYPE_OPTIONS: CommandOption<CommandFormState['hazardType']>[] = ([
  'Weather',
  'Terrain',
  'Trail Blockage',
  'Water Crossing',
  'Recovery',
  'Visibility',
  'Other',
] as const).map((value) => ({ label: value, value }));

const RESOURCE_TYPE_OPTIONS: CommandOption<CommandFormState['resourceType']>[] = ([
  'Water',
  'Fuel',
  'Food',
  'Medical',
  'Recovery Gear',
  'General Supplies',
] as const).map((value) => ({ label: value, value }));

const RESOURCE_STATUS_OPTIONS: CommandOption<CommandFormState['resourceStatus']>[] = ([
  'OK',
  'Caution',
  'Low',
  'Critical',
] as const).map((value) => ({ label: value, value }));

const EVENT_ICON: Record<DispatchEventType, IconName> = {
  weather: 'thunderstorm-outline',
  route: 'git-branch-outline',
  terrain: 'trail-sign-outline',
  vehicle: 'car-sport-outline',
  resources: 'cube-outline',
  sync: 'sync-outline',
  system: 'information-circle-outline',
  team_ping: 'radio-outline',
  assistance: 'medkit-outline',
  recovery: 'construct-outline',
};

const SEVERITY_TONE: Record<DispatchEventSeverity, string> = {
  info: TACTICAL.textMuted,
  watch: TACTICAL.amber,
  warning: TACTICAL.amber,
  critical: TACTICAL.danger,
};

const UI_STATE_TONE: Record<EventUiState, string> = {
  active: TACTICAL.text,
  acknowledged: TACTICAL.textMuted,
  resolved: TACTICAL.textMuted,
  queued: TACTICAL.amber,
  dismissed: TACTICAL.textMuted,
};

const THREAT_ACTION_LABELS: Record<ThreatActionId, string> = {
  ping_threat: 'Ping Threat',
  mark_hazard: 'Mark Hazard',
  request_assist: 'Request Assist',
};

type ThreatCoordinate = {
  latitude: number;
  longitude: number;
};

type RecoveryAssistGpsFix = ThreatCoordinate & {
  timestamp: number;
  accuracyM: number | null;
  altitude: number | null;
  heading: number | null;
  source: 'current_gps';
};

let lastDispatchRenderedLogSignature: string | null = null;
let lastDispatchTeamSyncLogSignature: string | null = null;

function createTeamSnapshotSignature(snapshot: TeamStoreSnapshot): string {
  return JSON.stringify({
    activeTeam: snapshot.activeTeam
      ? {
          id: snapshot.activeTeam.id,
          name: snapshot.activeTeam.name,
          ownerId: snapshot.activeTeam.ownerId,
        }
      : null,
    members: snapshot.members
      .map((member) => ({
        id: member.id,
        teamId: member.teamId,
        userId: member.userId,
        role: member.role,
        lastKnownLocation: member.lastKnownLocation
          ? {
              lat: Number(member.lastKnownLocation.lat).toFixed(5),
              lng: Number(member.lastKnownLocation.lng).toFixed(5),
              updatedAt: member.lastKnownLocation.updatedAt,
            }
          : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    updatedAt: snapshot.updatedAt,
  });
}

function createDispatchChannelSnapshotSignature(channels: DispatchChannelSnapshot[]): string {
  return JSON.stringify(channels.map((channel) => ({
    id: channel.id,
    statusLabel: channel.statusLabel,
    detail: channel.detail,
    sourceState: channel.sourceState,
    severity: channel.severity,
    eventType: channel.eventType,
    eventSource: channel.eventSource,
  })));
}

type RecoveryCadEventContext = {
  teamId?: string;
  sessionId?: string;
  channelId?: string;
};

type ThreatMapGeometry = {
  center: ThreatCoordinate | null;
  marker: ThreatCoordinate | null;
  routePoints: ThreatCoordinate[];
  precisionLabel: string;
};

const RECOVERY_GPS_MAX_AGE_MS = 30_000;
const RECOVERY_CAD_RETRY_COOLDOWN_MS = 10_000;
const LOCAL_DISPATCH_PERSISTENCE_ID = 'local-dispatch-channel';

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getConnectionState({
  isOnline,
  offlineMode,
  queuedCount,
}: {
  isOnline: boolean;
  offlineMode: boolean;
  queuedCount: number;
}): { label: 'LIVE' | 'OFFLINE' | 'QUEUED'; tone: string } {
  if (!isOnline || offlineMode) {
    return { label: 'OFFLINE', tone: TACTICAL.danger };
  }

  if (queuedCount > 0) {
    return { label: 'QUEUED', tone: TACTICAL.amber };
  }

  return { label: 'LIVE', tone: TACTICAL.text };
}

function isThreatDrilldownEvent(event: DispatchEvent): boolean {
  return !!event.location || !!event.routeSegmentId;
}

function isRecoveryCriticalEvent(event: DispatchEvent): boolean {
  if (event.source === 'user_report') {
    return false;
  }

  return (
    event.status === 'recovery_critical' ||
    event.priority === 'Recovery Critical' ||
    event.category === 'recovery_assist' ||
    event.category === 'hazard_recovery'
  ) && event.severity === 'critical';
}

function isRecoveryAssistanceCadEvent(event: DispatchEvent): boolean {
  const normalizedTitle = event.title.trim().toLowerCase();
  const normalizedPriority = String(event.priority ?? '').trim().toLowerCase();
  const normalizedStatus = String(event.status ?? '').trim().toLowerCase();

  return (
    event.type === 'recovery' ||
    event.category === 'recovery_assist' ||
    event.hazardType === 'recovery' ||
    normalizedStatus === 'recovery_critical' ||
    normalizedPriority === 'recovery critical' ||
    normalizedTitle.includes('recovery assist') ||
    normalizedTitle.includes('recovery request') ||
    normalizedTitle.includes('recovery info')
  );
}

function isProtectedCadEvent(event: DispatchEvent): boolean {
  const normalizedPriority = String(event.priority ?? '').trim().toLowerCase();
  const normalizedStatus = String(event.status ?? '').trim().toLowerCase();
  const normalizedTitle = event.title.trim().toLowerCase();

  return (
    isRecoveryCriticalEvent(event) ||
    isRecoveryAssistanceCadEvent(event) ||
    event.category === 'hazard_recovery' ||
    event.requiresMapDrilldown === true ||
    event.severity === 'warning' ||
    event.severity === 'critical' ||
    normalizedTitle.includes('recovery') ||
    normalizedPriority.includes('recovery') ||
    normalizedStatus.includes('recovery') ||
    normalizedPriority === 'high' ||
    normalizedPriority === 'critical' ||
    normalizedPriority === 'recovery critical' ||
    normalizedStatus === 'recovery_critical' ||
    normalizedStatus === 'emergency' ||
    normalizedStatus === 'active_assistance'
  );
}

function isClearableRoutineCadEvent(event: DispatchEvent): boolean {
  if (!event.type || isProtectedCadEvent(event)) {
    return false;
  }

  const normalizedPriority = String(event.priority ?? 'normal').trim().toLowerCase();
  const routinePriority =
    normalizedPriority === '' ||
    normalizedPriority === 'normal' ||
    normalizedPriority === 'low' ||
    normalizedPriority === 'info' ||
    normalizedPriority === 'watch';
  const routineSeverity = event.severity === 'info' || event.severity === 'watch';
  const routineType =
    event.type === 'team_ping' ||
    event.type === 'assistance' ||
    event.type === 'sync' ||
    event.type === 'system' ||
    event.type === 'resources';

  return routineType && routineSeverity && routinePriority;
}

function isPersistableLocalDispatchEvent(event: DispatchEvent): boolean {
  if (isRecoveryCriticalEvent(event)) {
    return true;
  }

  return event.source === 'user_report' || event.source === 'team_member';
}

function getRecoveryCriticalDisplayCopy(event: DispatchEvent): string {
  if (isRecoveryCriticalEvent(event)) {
    return 'Recovery Assist Requested from Current GPS Position';
  }

  return event.message;
}

function getRecoveryCriticalLocationLabel(event: DispatchEvent): string | null {
  if (!isRecoveryCriticalEvent(event) || !event.location) {
    return null;
  }

  const accuracy = event.location.accuracyMeters;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
    return `GPS +/- ${Math.round(accuracy)}m`;
  }

  return 'GPS PIN';
}

function getRecoveryCadSyncLabel(event: DispatchEvent): string | null {
  if (!isRecoveryCriticalEvent(event)) {
    return null;
  }

  switch (event.syncState) {
    case 'queued':
      return 'SYNC QUEUED';
    case 'sending':
      return 'SENDING';
    case 'sent':
      return 'TEAM SENT';
    case 'failed':
      return 'SYNC FAILED';
    case 'received':
      return 'TEAM EVENT';
    case 'local':
      return 'LOCAL ONLY';
    default:
      return null;
  }
}

function getRecoveryCriticalSummary(event: DispatchEvent): string {
  const displayCopy = getRecoveryCriticalDisplayCopy(event);
  const messagePreview = event.message
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!messagePreview || messagePreview.toLowerCase() === displayCopy.toLowerCase()) {
    return displayCopy;
  }

  return `${displayCopy} / ${messagePreview}`;
}

function formatRecoveryLocationTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRecoveryLocationAccuracyText(event: DispatchEvent): string | null {
  const accuracy = event.location?.accuracyMeters;
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) {
    return null;
  }

  return `+/- ${Math.round(accuracy)}m`;
}

function getRecoveryHazardTypeLabel(event: DispatchEvent): string | null {
  switch (event.hazardType) {
    case 'weather':
      return 'Weather';
    case 'terrain':
      return 'Terrain';
    case 'trail_blockage':
      return 'Trail Blockage';
    case 'water_crossing':
      return 'Water Crossing';
    case 'recovery':
      return 'Recovery';
    case 'visibility':
      return 'Visibility';
    case 'other':
      return 'Other';
    default:
      return null;
  }
}

function getRecoveryLocationSourceLabel(event: DispatchEvent): string {
  switch (event.location?.source) {
    case 'current_gps':
      return 'Current GPS';
    case 'last_known_gps':
      return 'Last-known GPS';
    default:
      return 'GPS source unavailable';
  }
}

function getRecoveryCoordinateText(event: DispatchEvent): string | null {
  if (!isValidCoordinate(event.location)) {
    return null;
  }

  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}`;
}

function buildRecoveryAssistNavigationPayload(event: DispatchEvent): NavigationHandoffPayload {
  if (!isRecoveryAssistanceCadEvent(event)) {
    throw new Error('Recovery request location unavailable.');
  }

  if (!isValidCoordinate(event.location)) {
    throw new Error('Recovery request location unavailable.');
  }

  const coordinate = {
    lat: event.location.latitude,
    lng: event.location.longitude,
  };
  const hazardType = getRecoveryHazardTypeLabel(event);
  const displayCopy = getRecoveryCriticalDisplayCopy(event);

  return {
    id: `dispatch-recovery-${event.id}-${Date.now()}`,
    source: 'dispatch',
    type: 'place',
    title: event.title?.trim() || 'Recovery Assist',
    subtitle: displayCopy,
    coordinate,
    trailheadCoordinate: null,
    roadDestinationCoordinate: coordinate,
    trailGeometry: [],
    trailLengthMiles: null,
    trailCategory: hazardType,
    tripMode: 'road',
    routeSource: 'dispatch_recovery',
    requiresOnlineRouting: true,
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      navigationMode: 'recovery_assist',
      recoveryAssist: true,
      recoveryAssistEventId: event.id,
      dispatchEventId: event.id,
      cadReferenceId: event.cadReferenceId ?? null,
      hazardType: event.hazardType ?? null,
      severity: 'recovery_critical',
      locationAccuracyMeters: event.location.accuracyMeters ?? null,
      locationTimestamp: event.location.timestamp ?? null,
      overrideActiveNavigation: true,
      autoStartNavigation: true,
    },
    landmarkMetadata: null,
    raw: {
      source: 'dispatch_cad',
      eventId: event.id,
      title: event.title,
      hazardType: event.hazardType ?? null,
      severity: event.severity,
      status: event.status ?? null,
      category: event.category ?? null,
      coordinate,
      accuracyMeters: event.location.accuracyMeters ?? null,
      locationTimestamp: event.location.timestamp ?? null,
    },
    createdAt: new Date().toISOString(),
  };
}

function isValidCoordinate(value: unknown): value is ThreatCoordinate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ThreatCoordinate;
  return (
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

function validateRecoveryGpsFix(fix: RecoveryAssistGpsFix | null): RecoveryAssistGpsFix {
  if (!fix || !isValidCoordinate(fix)) {
    throw new Error('GPS fix required before Recovery Assist can be sent.');
  }

  if (fix.latitude === 0 && fix.longitude === 0) {
    throw new Error('GPS fix rejected because coordinates were 0,0.');
  }

  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0) {
    throw new Error('GPS fix rejected because it did not include a timestamp.');
  }

  if (Date.now() - fix.timestamp > RECOVERY_GPS_MAX_AGE_MS) {
    throw new Error('GPS fix is too old for Recovery Assist. Refresh location and try again.');
  }

  return fix;
}

async function getCurrentPosition(): Promise<RecoveryAssistGpsFix> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => reject(new Error(error?.message || 'GPS fix unavailable.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

    return validateRecoveryGpsFix({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: position.timestamp,
      accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
      altitude: Number.isFinite(Number(position.coords.altitude)) ? Number(position.coords.altitude) : null,
      heading: Number.isFinite(Number(position.coords.heading)) ? Number(position.coords.heading) : null,
      source: 'current_gps',
    });
  }

  if (Platform.OS !== 'web') {
    const Location = await import('expo-location');
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new Error('Location services are disabled.');
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required for Recovery Assist.');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });

    return validateRecoveryGpsFix({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: position.timestamp,
      accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
      altitude: Number.isFinite(Number(position.coords.altitude)) ? Number(position.coords.altitude) : null,
      heading: Number.isFinite(Number(position.coords.heading)) ? Number(position.coords.heading) : null,
      source: 'current_gps',
    });
  }

  throw new Error('GPS is unavailable on this platform.');
}

function parseRouteSegmentReference(routeSegmentId: string): { routeId: string; segmentIndex: number } | null {
  const [routeId, indexRaw] = routeSegmentId.split(':');
  const segmentIndex = Number(indexRaw);
  if (!routeId || !Number.isInteger(segmentIndex) || segmentIndex < 0) {
    return null;
  }

  return { routeId, segmentIndex };
}

function segmentPointsToCoordinates(segment: RouteSegment | null | undefined): ThreatCoordinate[] {
  if (!segment) {
    return [];
  }

  return segment.points
    .map((point) => ({ latitude: Number(point.lat), longitude: Number(point.lon) }))
    .filter(isValidCoordinate);
}

function resolveRouteSegmentPoints(routeSegmentId: string | undefined): ThreatCoordinate[] {
  if (!routeSegmentId) {
    return [];
  }

  const ref = parseRouteSegmentReference(routeSegmentId);
  if (!ref) {
    return [];
  }

  const route = routeStore.getAll().find((candidate) => candidate.id === ref.routeId);
  return segmentPointsToCoordinates(route?.segments?.[ref.segmentIndex]);
}

function getMidpoint(points: ThreatCoordinate[]): ThreatCoordinate | null {
  if (points.length === 0) {
    return null;
  }

  const midpoint = points[Math.floor(points.length / 2)];
  return isValidCoordinate(midpoint) ? midpoint : null;
}

function getThreatMapGeometry(event: DispatchEvent | null): ThreatMapGeometry {
  if (!event) {
    return {
      center: null,
      marker: null,
      routePoints: [],
      precisionLabel: 'No threat selected',
    };
  }

  const routePoints = resolveRouteSegmentPoints(event.routeSegmentId);
  const marker = isValidCoordinate(event.location) ? event.location : null;
  const routeCenter = getMidpoint(routePoints);
  const center = marker ?? routeCenter;

  return {
    center,
    marker,
    routePoints,
    precisionLabel: marker
      ? `${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`
      : routeCenter
        ? `Route segment ${event.routeSegmentId}`
        : 'Precise location unavailable from source',
  };
}

function canOpenThreatDrilldown(event: DispatchEvent): boolean {
  if (!isThreatDrilldownEvent(event)) {
    return false;
  }

  return !!getThreatMapGeometry(event).center;
}

function getLiveSourceState(events: DispatchEvent[]): DispatchLiveSourceState {
  if (events.some((event) => event.source !== 'cache')) {
    return 'live_systems';
  }

  if (events.length > 0) {
    return 'cached_last_known';
  }

  return 'unavailable';
}

function getEventUiMeta(uiMetaById: Record<string, EventUiMeta>, event: DispatchEvent, queued: boolean): EventUiMeta {
  return uiMetaById[event.id] ?? {
    state: queued ? 'queued' : 'active',
    notes: [],
  };
}

function isActiveLiveDispatchEvent(event: DispatchEvent): boolean {
  const status = String(event.status ?? '').toLowerCase();
  return event.id.startsWith('live-') && status !== 'resolved' && status !== 'dismissed';
}

function getSourceStateLabel(sourceState: DispatchLiveSourceState): string {
  switch (sourceState) {
    case 'live_systems':
      return 'LIVE SYSTEMS';
    case 'cached_last_known':
      return 'LAST KNOWN';
    case 'unavailable':
    default:
      return 'UNAVAILABLE';
  }
}

function getDefaultCommandForm(): CommandFormState {
  return {
    checkInStatus: 'OK',
    pingType: 'Check-In',
    priority: 'normal',
    requireAcknowledgment: true,
    assistType: 'Recovery',
    linkedContext: 'current location',
    rallyLocation: 'current location',
    hazardType: 'Weather',
    severity: 'normal',
    resourceType: 'Water',
    resourceStatus: 'OK',
    message: '',
    note: '',
  };
}

function getEmailDisplayName(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const local = email.split('@')[0]?.trim();
  if (!local) {
    return null;
  }

  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getVehicleRigLabel(vehicle: Vehicle | null): string | null {
  if (!vehicle) {
    return null;
  }

  const configuredName = typeof vehicle.name === 'string' && vehicle.name.trim()
    ? vehicle.name.trim()
    : null;
  const makeModel = [vehicle.year, vehicle.make, vehicle.model]
    .filter((part) => part !== null && part !== undefined && String(part).trim())
    .map((part) => String(part).trim())
    .join(' ');

  return configuredName ?? (makeModel || null);
}

function getActiveExpeditionRecord(): ExpeditionRecord | null {
  const record = expeditionStateStore.getCurrentExpedition();
  return record && (record.state === 'active' || record.state === 'paused') ? record : null;
}

function getExpeditionInviteLabel(expedition: ExpeditionRecord | null, teamName: string | null): string {
  if (!expedition) {
    return 'No active expedition selected';
  }

  if (expedition.expeditionName) {
    return expedition.expeditionName;
  }

  if (teamName) {
    return teamName;
  }

  return expedition.vehicleName ? `${expedition.vehicleName} Expedition` : 'Active Expedition';
}

function getDefaultCreateExpeditionForm(identity: DispatchCommandIdentity): CreateExpeditionFormState {
  return {
    expeditionName: '',
    description: '',
    leaderName: identity.displayName,
    leaderCallsign: identity.callsign ?? '',
    startLocation: '',
    latitude: '',
    longitude: '',
    destination: '',
    areaOfOperation: '',
    startDateTime: '',
    commsNotes: '',
    joinMode: 'approval_required',
  };
}

function parseOptionalCoordinate(value: string, min: number, max: number): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function validateCreateExpeditionForm(form: CreateExpeditionFormState): string | null {
  if (!form.expeditionName.trim()) {
    return 'Expedition name is required.';
  }

  const latitude = parseOptionalCoordinate(form.latitude, -90, 90);
  const longitude = parseOptionalCoordinate(form.longitude, -180, 180);
  if (latitude === null) return 'Latitude must be between -90 and 90.';
  if (longitude === null) return 'Longitude must be between -180 and 180.';
  if ((latitude === undefined) !== (longitude === undefined)) {
    return 'Enter both latitude and longitude, or leave both blank.';
  }

  if (form.startDateTime.trim() && Number.isNaN(Date.parse(form.startDateTime.trim()))) {
    return 'Start date/time is not readable.';
  }

  return null;
}

function getHazardRecoveryTitle(hazardType: CommandFormState['hazardType']): string {
  switch (hazardType) {
    case 'Weather':
      return 'Weather Hazard';
    case 'Terrain':
      return 'Terrain Hazard';
    case 'Trail Blockage':
      return 'Trail Blockage';
    case 'Water Crossing':
      return 'Water Crossing';
    case 'Recovery':
      return 'Recovery Assist';
    case 'Visibility':
      return 'Visibility Hazard';
    case 'Other':
    default:
      return 'Other Hazard';
  }
}

function getHazardTypeKey(hazardType: CommandFormState['hazardType']): DispatchEventHazardType {
  switch (hazardType) {
    case 'Weather':
      return 'weather';
    case 'Terrain':
      return 'terrain';
    case 'Trail Blockage':
      return 'trail_blockage';
    case 'Water Crossing':
      return 'water_crossing';
    case 'Recovery':
      return 'recovery';
    case 'Visibility':
      return 'visibility';
    case 'Other':
    default:
      return 'other';
  }
}

function getRecoveryCadEventContext(
  teamSnapshot: TeamStoreSnapshot,
  expedition: ExpeditionRecord | null,
): RecoveryCadEventContext {
  const teamId = teamSnapshot.activeTeam?.id;
  const sessionId = expedition?.cloudSessionId ?? expedition?.id;
  const channelId = expedition?.cloudSessionId ?? expedition?.id ?? teamId;

  return {
    teamId,
    sessionId,
    channelId,
  };
}

function getRecoveryCadSessionIds(expedition: ExpeditionRecord | null): string[] {
  return [
    expedition?.cloudSessionId,
    expedition?.id,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getLocalDispatchPersistenceId(expedition: ExpeditionRecord | null): string {
  return expedition?.cloudSessionId ?? expedition?.id ?? LOCAL_DISPATCH_PERSISTENCE_ID;
}

function getRecoveryCadPersistenceDefaults(): DispatchPersistenceDefaults {
  return {
    pings: [],
    queueItems: [],
    assignments: [],
    timelineEvents: [],
    cadEvents: [],
  };
}

function getRecoveryCadAuthorizedUserIds(
  teamSnapshot: TeamStoreSnapshot,
  identity: DispatchCommandIdentity,
): string[] {
  return [
    identity.userId,
    teamSnapshot.activeTeam?.ownerId,
    ...teamSnapshot.members
      .filter((member) => member.teamId === teamSnapshot.activeTeam?.id)
      .map((member) => member.userId),
  ].filter(isUuid);
}

function getRecoveryCadBackendContext(
  teamSnapshot: TeamStoreSnapshot,
  expedition: ExpeditionRecord | null,
  identity: DispatchCommandIdentity,
): DispatchCadEventBackendContext | null {
  const context = getRecoveryCadEventContext(teamSnapshot, expedition);
  if (!context.teamId || !context.sessionId) {
    return null;
  }

  return {
    teamId: context.teamId,
    sessionId: context.sessionId,
    channelId: context.channelId,
    authorizedUserIds: getRecoveryCadAuthorizedUserIds(teamSnapshot, identity),
  };
}

function isAuthorizedRecoveryCadMember(
  teamSnapshot: TeamStoreSnapshot,
  identity: DispatchCommandIdentity,
): boolean {
  const team = teamSnapshot.activeTeam;
  if (!team) return false;
  const actorId = identity.userId ?? identity.email ?? identity.callsign ?? null;
  if (!actorId) return false;
  if (team.ownerId === actorId) return true;
  return teamSnapshot.members.some((member) => (
    member.teamId === team.id &&
    (member.userId === actorId || member.id === actorId)
  ));
}

function isRecoveryCadEventInAuthorizedContext({
  event,
  teamSnapshot,
  expedition,
  identity,
}: {
  event: DispatchEvent;
  teamSnapshot: TeamStoreSnapshot;
  expedition: ExpeditionRecord | null;
  identity: DispatchCommandIdentity;
}): boolean {
  if (event.source === 'user_report') {
    return false;
  }

  if (!isRecoveryCriticalEvent(event) || !isValidCoordinate(event.location)) {
    return false;
  }

  const team = teamSnapshot.activeTeam;
  if (!team || event.teamId !== team.id) {
    return false;
  }

  if (!isAuthorizedRecoveryCadMember(teamSnapshot, identity)) {
    return false;
  }

  const sessionIds = getRecoveryCadSessionIds(expedition);
  if (sessionIds.length === 0) {
    return false;
  }

  return !!event.sessionId && sessionIds.includes(event.sessionId);
}

function getRecoveryCadInitialSyncState(args: {
  event: DispatchEvent;
  queued: boolean;
  canShare: boolean;
  realtimeStatus: DispatchRealtimeStatus;
}): DispatchEvent['syncState'] {
  if (!isRecoveryCriticalEvent(args.event)) {
    return args.event.syncState;
  }

  if (!args.canShare) {
    return 'local';
  }

  if (args.queued || args.realtimeStatus !== 'connected') {
    return 'queued';
  }

  return 'sending';
}

function prepareRecoveryCadEventForSync(args: {
  event: DispatchEvent;
  queued: boolean;
  canShare: boolean;
  realtimeStatus: DispatchRealtimeStatus;
}): DispatchEvent {
  if (!isRecoveryCriticalEvent(args.event)) {
    return args.event;
  }

  return {
    ...args.event,
    syncState: getRecoveryCadInitialSyncState(args),
  };
}

function getDefaultHazardRecoveryMessage(hazardType: CommandFormState['hazardType']): string {
  if (hazardType === 'Recovery') {
    return 'Recovery report created.';
  }

  return `${getHazardRecoveryTitle(hazardType)} reported.`;
}

function getHazardRecoveryForm(): CommandFormState {
  return {
    ...getDefaultCommandForm(),
    hazardType: 'Recovery',
    severity: 'normal',
    message: '',
  };
}

function normalizeOptionalFormText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getInviteDisplayStatus(invite: ExpeditionChannelInvite): ExpeditionInviteStatus {
  return isInviteExpired(invite) ? 'expired' : invite.status;
}

function getInviteStatusTone(status: ExpeditionInviteStatus): string {
  switch (status) {
    case 'active':
      return TACTICAL.success;
    case 'disabled':
      return TACTICAL.textMuted;
    case 'expired':
    default:
      return TACTICAL.danger;
  }
}

function getInviteExpirationLabel(invite: ExpeditionChannelInvite, expedition: ExpeditionRecord | null): string {
  if (expedition && !expedition.endTime && invite.expiresAt.startsWith('9999-')) {
    return 'Expires at end of expedition';
  }

  const parsed = Date.parse(invite.expiresAt);
  if (Number.isNaN(parsed)) {
    return 'Expiration unavailable';
  }

  return `Expires ${new Date(parsed).toLocaleString()}`;
}

function hasClipboardSupport(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

function formatInviteRequestTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'Time unavailable';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getDispatchSenderLabel(event: DispatchEvent): string | null {
  if (event.createdBy?.displayName) {
    return event.createdBy.callsign
      ? `${event.createdBy.displayName} / ${event.createdBy.callsign}`
      : event.createdBy.displayName;
  }

  if (event.source === 'team_member') {
    return 'Unknown team member';
  }

  return null;
}

function getDispatchChannelAvailability({
  channel,
  isOnline,
  offlineMode,
  hasActiveVehicle,
}: {
  channel: DispatchChannelSnapshot;
  isOnline: boolean;
  offlineMode: boolean;
  hasActiveVehicle: boolean;
}): DispatchChannelAvailability {
  if (channel.id === 'sync') {
    return channel.sourceState === 'unavailable'
      ? { enabled: false, reason: 'Awaiting sync' }
      : { enabled: true, reason: null };
  }

  if (!isOnline || offlineMode) {
    return { enabled: false, reason: 'Offline' };
  }

  if (channel.id === 'vehicle' && !hasActiveVehicle) {
    return { enabled: false, reason: 'No active rig' };
  }

  if (channel.sourceState === 'unavailable') {
    switch (channel.id) {
      case 'route':
        return { enabled: false, reason: 'No active route' };
      case 'terrain':
        return { enabled: false, reason: 'No terrain data' };
      case 'vehicle':
        return { enabled: false, reason: 'No vehicle data' };
      case 'resources':
        return { enabled: false, reason: 'No resource data' };
      case 'weather':
        return { enabled: false, reason: 'No live weather' };
      default:
        return { enabled: false, reason: 'Unavailable' };
    }
  }

  if (channel.sourceState === 'cached_last_known') {
    return { enabled: false, reason: 'Last known' };
  }

  return { enabled: true, reason: null };
}

function validateCommandForm(command: DispatchCommandType, form: CommandFormState): string | null {
  const message = form.message.trim();

  if (command === 'ping' && !message) {
    return 'Message is required.';
  }

  if (command === 'assist' && !message) {
    return 'Assist message is required.';
  }

  if (command === 'rally' && !message) {
    return 'Rally message is required.';
  }

  return null;
}

function severityFromPriority(priority: CommandPriority): DispatchEventSeverity {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'warning';
    case 'normal':
    default:
      return 'info';
  }
}

function getCommandPriorityLabel(priority: CommandPriority): string {
  switch (priority) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'normal':
    default:
      return 'Normal';
  }
}

function priorityFromResourceStatus(status: CommandFormState['resourceStatus']): DispatchEventSeverity {
  switch (status) {
    case 'Critical':
      return 'critical';
    case 'Caution':
    case 'Low':
      return 'warning';
    case 'OK':
    default:
      return 'info';
  }
}

function eventTypeFromCommand(command: DispatchCommandType, form: CommandFormState): DispatchEventType {
  if (command === 'assist') {
    return form.assistType === 'Recovery' || form.assistType === 'Mechanical' ? 'recovery' : 'assistance';
  }

  if (command === 'rally') {
    return 'route';
  }

  if (command === 'hazard') {
    if (form.hazardType === 'Weather') return 'weather';
    if (form.hazardType === 'Recovery') return 'recovery';
    return 'terrain';
  }

  if (command === 'resource') {
    return 'resources';
  }

  return 'team_ping';
}

function sourceFromCommand(command: DispatchCommandType): DispatchEventSource {
  if (command === 'hazard') {
    return 'user_report';
  }

  return command === 'resource' ? 'resource_store' : 'team_member';
}

function getDispatchActorDedupeId(identity: DispatchCommandIdentity): string {
  return identity.userId ?? identity.callsign ?? identity.email ?? identity.displayName;
}

function normalizeDedupeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createCommandDedupeKey(
  command: DispatchCommandType,
  form: CommandFormState,
  identity: DispatchCommandIdentity,
): string {
  const actor = getDispatchActorDedupeId(identity);
  const payload = [
    command,
    form.checkInStatus,
    form.pingType,
    form.priority,
    form.assistType,
    form.linkedContext,
    form.rallyLocation,
    form.hazardType,
    form.severity,
    form.resourceType,
    form.resourceStatus,
    normalizeDedupeText(form.message),
    normalizeDedupeText(form.note),
  ].join('|');

  return `command:${actor}:${payload}`;
}

function createTargetActionDedupeKey(
  actionType: string,
  event: DispatchEvent,
  identity: DispatchCommandIdentity,
): string {
  return [
    'target-action',
    actionType,
    event.id,
    getDispatchActorDedupeId(identity),
    event.routeSegmentId ?? 'no-segment',
    createDispatchCoordinateFingerprint(event.location),
  ].join(':');
}

function createEventFromCommand({
  command,
  form,
  identity,
  gpsFix,
  context,
  locationUnavailableReason,
}: {
  command: DispatchCommandType;
  form: CommandFormState;
  identity: DispatchCommandIdentity;
  gpsFix?: RecoveryAssistGpsFix | null;
  context?: RecoveryCadEventContext;
  locationUnavailableReason?: string | null;
}): DispatchEvent | null {
  const now = new Date().toISOString();
  const message = form.message.trim();
  const note = form.note.trim();
  const type = eventTypeFromCommand(command, form);
  const source = sourceFromCommand(command);
  const id = `dispatch-${command}-${Date.now()}`;
  const dedupeKey = createCommandDedupeKey(command, form, identity);
  const actor = {
    userId: identity.userId,
    displayName: identity.displayName,
    email: identity.email,
    callsign: identity.callsign,
  };

  if (command === 'check_in') {
    return normalizeDispatchEvent({
      id,
      timestamp: now,
      type,
      severity: severityFromPriority(
        form.checkInStatus === 'Emergency'
          ? 'critical'
          : form.checkInStatus === 'Need Assistance' || form.checkInStatus === 'Delayed'
            ? 'high'
            : 'normal',
      ),
      title: `Check In: ${form.checkInStatus}`,
      message: note || `Status reported: ${form.checkInStatus}`,
      source,
      dedupeKey,
      createdBy: actor,
      rig: identity.rig,
    });
  }

  if (command === 'ping') {
    return normalizeDispatchEvent({
      id,
      timestamp: now,
      type,
      severity: severityFromPriority(form.priority),
      title: `${form.pingType} Ping`,
      message,
      source,
      dedupeKey,
      createdBy: actor,
      rig: identity.rig,
      requiresMapDrilldown: false,
    });
  }

  if (command === 'assist') {
    return normalizeDispatchEvent({
      id,
      timestamp: now,
      type,
      severity: severityFromPriority(form.priority),
      title: `${form.assistType} Assist`,
      message: `${message}\n\nECS team coordination only. This does not contact emergency services.`,
      source,
      dedupeKey,
      createdBy: actor,
      rig: identity.rig,
      requiresMapDrilldown: form.linkedContext !== 'manual note',
    });
  }

  if (command === 'rally') {
    return normalizeDispatchEvent({
      id,
      timestamp: now,
      type,
      severity: severityFromPriority(form.priority),
      title: 'Rally Request',
      message,
      source,
      dedupeKey,
      createdBy: actor,
      rig: identity.rig,
      requiresMapDrilldown: form.rallyLocation !== 'manual note',
    });
  }

  if (command === 'hazard') {
    const title = getHazardRecoveryTitle(form.hazardType);
    const hazardType = getHazardTypeKey(form.hazardType);
    const recoveryFix = gpsFix ? validateRecoveryGpsFix(gpsFix) : null;
    const coordinateFingerprint = recoveryFix
      ? createDispatchCoordinateFingerprint(recoveryFix)
      : 'no-gps';
    const fixAgeSeconds = recoveryFix
      ? Math.max(0, Math.round((Date.now() - recoveryFix.timestamp) / 1000))
      : null;
    const severity = severityFromPriority(form.severity);
    const severityLabel = getCommandPriorityLabel(form.severity);
    const noteText = message || 'No note provided.';
    const eventMessage = message || getDefaultHazardRecoveryMessage(form.hazardType);
    const reporter = actor.callsign
      ? `${actor.displayName} / ${actor.callsign}`
      : actor.displayName;
    const locationStatus = recoveryFix
      ? `GPS captured: ${recoveryFix.latitude.toFixed(5)}, ${recoveryFix.longitude.toFixed(5)}`
      : `Location unavailable${locationUnavailableReason ? `: ${locationUnavailableReason}` : ''}`;

    return normalizeDispatchEvent({
      id,
      timestamp: now,
      type,
      category: hazardType === 'recovery' ? 'recovery_assist' : 'hazard_recovery',
      hazardType,
      severity,
      title,
      status: 'active',
      priority: severityLabel,
      note: noteText,
      locationStatus,
      cadReferenceId: `RC-${Date.now().toString(36).toUpperCase()}`,
      message: eventMessage,
      details: [
        `Category: ${form.hazardType}`,
        `Severity: ${severityLabel}`,
        `Timestamp: ${now}`,
        `Location status: ${locationStatus}`,
        recoveryFix?.accuracyM != null ? `Accuracy: ${Math.round(recoveryFix.accuracyM)}m` : null,
        fixAgeSeconds != null ? `GPS fix age: ${fixAgeSeconds}s` : null,
        `Reporter: ${reporter}`,
        identity.rig?.label ? `Vehicle: ${identity.rig.label}` : null,
        `Note: ${noteText}`,
        'Source: User Report',
        'Status: Active',
        'Local ECS Dispatch report only. This does not contact emergency services or publish externally.',
      ].filter(Boolean).join('\n'),
      source,
      dedupeKey: [
        'hazard-recovery',
        getDispatchActorDedupeId(identity),
        form.hazardType,
        form.severity,
        normalizeDedupeText(message),
        coordinateFingerprint,
      ].join(':'),
      createdBy: actor,
      rig: identity.rig,
      teamId: context?.teamId,
      sessionId: context?.sessionId,
      channelId: context?.channelId,
      location: recoveryFix
        ? {
          latitude: recoveryFix.latitude,
          longitude: recoveryFix.longitude,
          accuracyMeters: recoveryFix.accuracyM,
          altitude: recoveryFix.altitude,
          heading: recoveryFix.heading,
          timestamp: new Date(recoveryFix.timestamp).toISOString(),
          source: recoveryFix.source,
        }
        : undefined,
      recoveryNotes: recoveryFix
        ? [
          recoveryFix.accuracyM != null
            ? `GPS accuracy approximately ${Math.round(recoveryFix.accuracyM)}m.`
            : 'GPS accuracy unavailable.',
          `GPS fix age ${fixAgeSeconds ?? 0}s at creation.`,
        ]
        : [
          locationUnavailableReason
            ? `Location unavailable: ${locationUnavailableReason}.`
            : 'Location unavailable.',
          'Report saved without GPS coordinates.',
        ],
      requiresMapDrilldown: !!recoveryFix,
    });
  }

  return normalizeDispatchEvent({
    id,
    timestamp: now,
    type,
    severity: priorityFromResourceStatus(form.resourceStatus),
    title: `${form.resourceType} Resource`,
    message: note || `${form.resourceType} status: ${form.resourceStatus}`,
    source,
    dedupeKey,
    createdBy: actor,
    rig: identity.rig,
  });
}

async function createRecoveryCadEventFromCurrentGps({
  form,
  identity,
  context,
}: {
  form: CommandFormState;
  identity: DispatchCommandIdentity;
  context: RecoveryCadEventContext;
}): Promise<DispatchEvent | null> {
  let gpsFix: RecoveryAssistGpsFix | null = null;
  let locationUnavailableReason: string | null = null;

  try {
    gpsFix = await getCurrentPosition();
  } catch (error) {
    locationUnavailableReason = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'GPS unavailable';
  }

  return createEventFromCommand({
    command: 'hazard',
    form,
    identity,
    gpsFix,
    context,
    locationUnavailableReason,
  });
}

function createEventFromThreatAction(
  event: DispatchEvent,
  actionId: ThreatActionId,
  identity: DispatchCommandIdentity,
): DispatchEvent | null {
  const base = {
    timestamp: new Date().toISOString(),
    source: 'team_member' as const,
    createdBy: {
      userId: identity.userId,
      displayName: identity.displayName,
      email: identity.email,
      callsign: identity.callsign,
    },
    rig: identity.rig,
    location: event.location,
    routeSegmentId: event.routeSegmentId,
    targetEventId: event.id,
    teamId: event.teamId,
    sessionId: event.sessionId,
    channelId: event.channelId,
    dedupeKey: createTargetActionDedupeKey(actionId, event, identity),
    requiresMapDrilldown: true,
  };

  if (actionId === 'ping_threat') {
    return normalizeDispatchEvent({
      ...base,
      id: `dispatch-threat-ping-${event.id}-${Date.now()}`,
      type: 'team_ping',
      severity: event.severity === 'critical' ? 'critical' : 'warning',
      title: 'Threat Ping',
      message: `Threat ping: ${event.title}`,
    });
  }

  if (actionId === 'mark_hazard') {
    return normalizeDispatchEvent({
      ...base,
      id: `dispatch-threat-hazard-${event.id}-${Date.now()}`,
      type: event.type === 'weather' ? 'weather' : 'terrain',
      severity: event.severity === 'critical' ? 'critical' : 'warning',
      title: `Hazard Marked: ${event.title}`,
      message: event.message,
    });
  }

  return normalizeDispatchEvent({
    ...base,
    id: `dispatch-threat-assist-${event.id}-${Date.now()}`,
    type: 'assistance',
    severity: event.severity === 'critical' ? 'critical' : 'warning',
    title: `Assist Request: ${event.title}`,
    message: `Assist requested from threat drilldown: ${event.message}`,
  });
}

function createRecoveryAssistEvent(
  gpsFix: RecoveryAssistGpsFix,
  identity: DispatchCommandIdentity,
  context?: RecoveryCadEventContext,
): DispatchEvent | null {
  const createdAtMs = Date.now();
  const fixAgeSeconds = Math.max(0, Math.round((createdAtMs - gpsFix.timestamp) / 1000));

  return normalizeDispatchEvent({
    id: `dispatch-recovery-assist-${createdAtMs}`,
    timestamp: new Date(createdAtMs).toISOString(),
    type: 'recovery',
    category: 'recovery_assist',
    hazardType: 'recovery',
    severity: 'critical',
    title: 'Recovery Assist',
    status: 'recovery_critical',
    priority: 'Recovery Critical',
    cadReferenceId: `RA-${createdAtMs.toString(36).toUpperCase()}`,
    dedupeKey: [
      'recovery-assist',
      getDispatchActorDedupeId(identity),
      createDispatchCoordinateFingerprint(gpsFix),
    ].join(':'),
    message: [
      'Recovery assist requested from current GPS position.',
      `GPS: ${gpsFix.latitude.toFixed(5)}, ${gpsFix.longitude.toFixed(5)}`,
      gpsFix.accuracyM != null ? `Accuracy: ${Math.round(gpsFix.accuracyM)}m` : null,
      `Fix age: ${fixAgeSeconds}s`,
      'ECS team coordination only. This does not contact emergency services.',
    ].filter(Boolean).join('\n'),
    details: [
      'Recovery assist requested from the current GPS position.',
      'Use this event to coordinate ECS team support, recovery gear staging, and safe approach planning.',
      `Coordinates: ${gpsFix.latitude.toFixed(5)}, ${gpsFix.longitude.toFixed(5)}`,
    ].join('\n'),
    recoveryNotes: [
      gpsFix.accuracyM != null ? `GPS accuracy approximately ${Math.round(gpsFix.accuracyM)}m.` : 'GPS accuracy unavailable.',
      `GPS fix age ${fixAgeSeconds}s at creation.`,
      'ECS team coordination only; emergency services are not contacted by this action.',
    ],
    source: 'team_member',
    createdBy: {
      userId: identity.userId,
      displayName: identity.displayName,
      email: identity.email,
      callsign: identity.callsign,
    },
    rig: identity.rig,
    teamId: context?.teamId,
    sessionId: context?.sessionId,
    channelId: context?.channelId,
    location: {
      latitude: gpsFix.latitude,
      longitude: gpsFix.longitude,
      accuracyMeters: gpsFix.accuracyM,
      altitude: gpsFix.altitude,
      heading: gpsFix.heading,
      timestamp: new Date(gpsFix.timestamp).toISOString(),
      source: gpsFix.source,
    },
    requiresMapDrilldown: true,
  });
}

function getEventActions(event: DispatchEvent, meta: EventUiMeta): EventAction[] {
  const allowedActions = isProtectedCadEvent(event)
    ? ACTIONS_BY_TYPE[event.type].filter((actionId) => actionId !== 'dismiss')
    : ACTIONS_BY_TYPE[event.type];

  if (meta.state === 'resolved' || meta.state === 'dismissed') {
    return allowedActions
      .filter((actionId) => actionId === 'add_note' || actionId === 'add_update')
      .map((id) => ({ id, label: ACTION_LABELS[id] }));
  }

  return allowedActions.map((id) => ({ id, label: ACTION_LABELS[id] }));
}

function applyEventAction(meta: EventUiMeta, actionId: EventActionId): EventUiMeta {
  const nextNotes = [...meta.notes];
  let nextState = meta.state;

  switch (actionId) {
    case 'acknowledge':
      nextState = 'acknowledged';
      nextNotes.push('Acknowledged from Dispatch detail.');
      break;
    case 'add_note':
      nextNotes.push('Operator note added from Dispatch detail.');
      break;
    case 'add_update':
      nextState = meta.state === 'queued' ? 'queued' : 'active';
      nextNotes.push('Dispatch update recorded.');
      break;
    case 'send_follow_up':
      nextState = meta.state === 'queued' ? 'queued' : 'active';
      nextNotes.push('Follow-up ping prepared for Expedition Channel.');
      break;
    case 'broadcast_hazard':
      nextState = meta.state === 'queued' ? 'queued' : 'active';
      nextNotes.push('Hazard broadcast prepared for Expedition Channel.');
      break;
    case 'request_assist':
      nextState = meta.state === 'queued' ? 'queued' : 'active';
      nextNotes.push('Assist request prepared for ECS team coordination only.');
      break;
    case 'mark_resolved':
      nextState = 'resolved';
      nextNotes.push('Marked resolved from Dispatch detail.');
      break;
    case 'dismiss':
      nextState = 'dismissed';
      nextNotes.push('Dismissed from Dispatch detail.');
      break;
    default:
      break;
  }

  return {
    state: nextState,
    notes: nextNotes,
  };
}

export default function DispatchCadCommandCenter() {
  const router = useRouter();
  const {
    user,
    operatorInfo,
    isOnline,
    offlineMode,
    syncStatus,
    queueSize,
    dirtyCount,
    showToast,
  } = useApp();
  const dispatchGps = useThrottledGPS({
    enabled: true,
    highAccuracy: false,
    maxRetries: 2,
    retryIntervalMs: 10_000,
  });
  const dispatchWeatherGpsInput = useMemo(() => ({
    lat: dispatchGps.position?.latitude ?? null,
    lng: dispatchGps.position?.longitude ?? null,
    hasFix: dispatchGps.hasFix,
    permissionDenied: dispatchGps.permissionDenied,
    accuracyM: dispatchGps.position?.accuracyM ?? null,
  }), [
    dispatchGps.hasFix,
    dispatchGps.permissionDenied,
    dispatchGps.position?.accuracyM,
    dispatchGps.position?.latitude,
    dispatchGps.position?.longitude,
  ]);
  const dispatchWeather = useOperationalWeather({
    enabled: true,
    gps: dispatchWeatherGpsInput,
  });
  const [events, setEvents] = useState<DispatchEvent[]>(() => dispatchEventStore.getSnapshot());
  const [uiMetaById, setUiMetaById] = useState<Record<string, EventUiMeta>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drilldownEventId, setDrilldownEventId] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [activeCommand, setActiveCommand] = useState<DispatchCommandType | null>(null);
  const [commandForm, setCommandForm] = useState<CommandFormState>(() => getDefaultCommandForm());
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandSubmitting, setCommandSubmitting] = useState(false);
  const [dismissedAdvisoryId, setDismissedAdvisoryId] = useState<string | null>(null);
  const [channelRevision, setChannelRevision] = useState(0);
  const [recoveryAssistSubmitting, setRecoveryAssistSubmitting] = useState(false);
  const [teamSnapshot, setTeamSnapshot] = useState<TeamStoreSnapshot>(() => teamStore.getSnapshot());
  const [dispatchProfile, setDispatchProfile] = useState<DispatchProfileSnapshot>(() => dispatchProfileStore.getSnapshot());
  const [dispatchProfileHydrated, setDispatchProfileHydrated] = useState(() => dispatchProfileStore.isHydrated());
  const [profileVisible, setProfileVisible] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [currentExpedition, setCurrentExpedition] = useState<ExpeditionRecord | null>(() => getActiveExpeditionRecord());
  const [vehicleRevision, setVehicleRevision] = useState(0);
  const [submittingThreatActionKey, setSubmittingThreatActionKey] = useState<string | null>(null);
  const [navigatingAssistEventId, setNavigatingAssistEventId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<DispatchRealtimeStatus>('disabled');
  const commandSubmittingRef = useRef(false);
  const recoveryAssistSubmittingRef = useRef(false);
  const submittedEventActionKeysRef = useRef<Set<string>>(new Set());
  const realtimeSessionRef = useRef<DispatchRealtimeSession | null>(null);
  const recoveryCadPublishInFlightRef = useRef<Set<string>>(new Set());
  const recoveryCadLastRetryAtRef = useRef<Record<string, number>>({});

  const queuedCount = queueSize + dirtyCount;
  const activeTeamId = teamSnapshot.activeTeam?.id ?? null;
  const hasActiveTeam = !!activeTeamId;
  const teamMemberCount = teamSnapshot.members.length;
  const teamUpdatedAt = teamSnapshot.updatedAt;
  const teamSnapshotRef = useRef(teamSnapshot);
  const dispatchChannelContextRef = useRef({
    queuedCount,
    dirtyCount,
    syncStatus,
    isOnline,
    offlineMode,
  });
  const dispatchChannelSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    publishSharedWeatherBriefAdvisories(dispatchWeather.snapshot);
  }, [dispatchWeather.snapshot]);

  useEffect(() => {
    teamSnapshotRef.current = teamSnapshot;
  }, [teamSnapshot]);

  useEffect(() => {
    dispatchChannelContextRef.current = {
      queuedCount,
      dirtyCount,
      syncStatus,
      isOnline,
      offlineMode,
    };
  }, [dirtyCount, isOnline, offlineMode, queuedCount, syncStatus]);

  useEffect(() => dispatchEventStore.subscribe(setEvents), []);

  useEffect(() => subscribeDispatchChannels(() => {
    const nextSignature = createDispatchChannelSnapshotSignature(
      getDispatchChannelSnapshots(dispatchChannelContextRef.current),
    );
    if (dispatchChannelSignatureRef.current === nextSignature) {
      return;
    }
    dispatchChannelSignatureRef.current = nextSignature;
    setChannelRevision((currentRevision) => currentRevision + 1);
  }), []);

  useEffect(() => teamStore.subscribe((nextSnapshot) => {
    setTeamSnapshot((currentSnapshot) => (
      createTeamSnapshotSignature(currentSnapshot) === createTeamSnapshotSignature(nextSnapshot)
        ? currentSnapshot
        : nextSnapshot
    ));
  }), []);

  useEffect(() => dispatchProfileStore.subscribe(setDispatchProfile), []);

  useEffect(() => {
    let cancelled = false;
    if (dispatchProfileStore.isHydrated()) {
      setDispatchProfileHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    dispatchProfileStore.waitForHydration().then(() => {
      if (!cancelled) {
        setDispatchProfileHydrated(true);
      }
    }).catch(() => {
      if (!cancelled) {
        setDispatchProfileHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => expeditionStateStore.subscribe((state, record) => {
    setCurrentExpedition(state === 'active' || state === 'paused' ? record : null);
  }), []);

  useEffect(() => {
    const bumpVehicleRevision = () => setVehicleRevision((revision) => revision + 1);
    const unsubscribeSetup = vehicleSetupStore.subscribe(bumpVehicleRevision);
    const unsubscribeVehicles = vehicleStore.subscribe(bumpVehicleRevision);
    return () => {
      unsubscribeSetup();
      unsubscribeVehicles();
    };
  }, []);

  const activeVehicle = useMemo(() => {
    if (vehicleRevision < 0) {
      return null;
    }

    const activeVehicleId = vehicleSetupStore.getActiveVehicleId();
    return activeVehicleId ? vehicleStore.getById(activeVehicleId) : null;
  }, [vehicleRevision]);
  const activeRigLabel = getVehicleRigLabel(activeVehicle);
  const savedRigLabel = dispatchProfile.vehicleLabel?.trim() || null;
  const availableVehicleCount = vehicleStore.getLocalSnapshot().length;
  const dispatchOperatorDisplayName = useMemo(() => (
    typeof operatorInfo?.display_name === 'string' && operatorInfo.display_name.trim()
      ? operatorInfo.display_name.trim()
      : null
  ), [operatorInfo?.display_name]);
  const hasAvailableVehicle = !!activeRigLabel || !!savedRigLabel || availableVehicleCount > 0;
  const dispatchProfileCompletenessContext = useMemo(() => ({
    activeDisplayName: dispatchOperatorDisplayName,
    activeCallsign: null,
    activeVehicleLabel: activeRigLabel,
    activeVehicleId: activeVehicle?.id ?? null,
    hasAvailableVehicle,
  }), [
    activeRigLabel,
    activeVehicle?.id,
    dispatchOperatorDisplayName,
    hasAvailableVehicle,
  ]);

  const commandIdentity = useMemo<DispatchCommandIdentity>(() => {
    const email = operatorInfo?.email ?? user?.email ?? null;
    const displayName =
      dispatchProfile.displayName ??
      dispatchOperatorDisplayName ??
      getEmailDisplayName(email) ??
      FALLBACK_DISPATCH_OPERATOR_NAME;
    const rigLabel = activeRigLabel ?? savedRigLabel;

    return {
      userId: typeof user?.id === 'string' ? user.id : undefined,
      displayName,
      email: email ?? undefined,
      callsign: dispatchProfile.callsign ?? undefined,
      rig: rigLabel
        ? {
          vehicleId: activeVehicle?.id ?? dispatchProfile.vehicleId ?? undefined,
          label: rigLabel,
        }
        : undefined,
    };
  }, [
    activeVehicle,
    activeRigLabel,
    dispatchProfile.callsign,
    dispatchProfile.displayName,
    dispatchProfile.vehicleId,
    dispatchOperatorDisplayName,
    operatorInfo?.email,
    savedRigLabel,
    user?.email,
    user?.id,
  ]);
  const realtimeClientId = useMemo(
    () => [
      'dispatch-cad',
      commandIdentity.userId ?? commandIdentity.email ?? commandIdentity.callsign ?? commandIdentity.displayName,
    ].join(':'),
    [commandIdentity.callsign, commandIdentity.displayName, commandIdentity.email, commandIdentity.userId],
  );
  const recoveryCadRealtimeExpeditionId = currentExpedition?.cloudSessionId ?? currentExpedition?.id ?? null;
  const recoveryCadPersistenceDefaults = useMemo(() => getRecoveryCadPersistenceDefaults(), []);
  const recoveryCadBackendContext = useMemo(
    () => getRecoveryCadBackendContext(teamSnapshot, currentExpedition, commandIdentity),
    [commandIdentity, currentExpedition, teamSnapshot],
  );
  const dispatchRollout = useMemo(() => resolveDispatchRolloutConfig(), []);
  const teamPositionSharingEnabled = isDispatchFeatureEnabled(dispatchRollout, 'teamPositionSharing');
  const externalDispatchIntegrationEnabled = isDispatchFeatureEnabled(dispatchRollout, 'externalDispatchIntegration');
  const publicHazardPublishingEnabled = isDispatchFeatureEnabled(dispatchRollout, 'publicHazardPublishing');
  const automatedSosTransmissionEnabled = isDispatchFeatureEnabled(dispatchRollout, 'automatedSosTransmission');
  const liveRadioNetworkIntegrationsEnabled = isDispatchFeatureEnabled(dispatchRollout, 'liveRadioNetworkIntegrations');
  const agencyDataIngestionEnabled = isDispatchFeatureEnabled(dispatchRollout, 'agencyDataIngestion');
  const localDispatchPersistenceId = useMemo(
    () => getLocalDispatchPersistenceId(currentExpedition),
    [currentExpedition],
  );
  const dispatchSensitiveGateNotice = useMemo(() => {
    const disabledFeatures: DispatchRolloutFeature[] = [];
    if (!teamPositionSharingEnabled) {
      disabledFeatures.push('teamPositionSharing');
    }
    if (!agencyDataIngestionEnabled) {
      disabledFeatures.push('agencyDataIngestion');
    }
    if (!externalDispatchIntegrationEnabled) {
      disabledFeatures.push('externalDispatchIntegration');
    }
    if (!publicHazardPublishingEnabled) {
      disabledFeatures.push('publicHazardPublishing');
    }
    if (!automatedSosTransmissionEnabled) {
      disabledFeatures.push('automatedSosTransmission');
    }
    if (!liveRadioNetworkIntegrationsEnabled) {
      disabledFeatures.push('liveRadioNetworkIntegrations');
    }

    if (disabledFeatures.length === 0) {
      return null;
    }

    return `Internal beta: local CAD and Recovery reports are enabled. ${disabledFeatures
      .map((feature) => getDispatchRolloutDisabledCopy(feature))
      .join(' ')}`;
  }, [
    agencyDataIngestionEnabled,
    automatedSosTransmissionEnabled,
    externalDispatchIntegrationEnabled,
    liveRadioNetworkIntegrationsEnabled,
    publicHazardPublishingEnabled,
    teamPositionSharingEnabled,
  ]);
  const persistDispatchCadEventLocally = useCallback((event: DispatchEvent) => {
    if (!isPersistableLocalDispatchEvent(event)) {
      return;
    }

    const expeditionId = event.sessionId ?? localDispatchPersistenceId;
    if (!expeditionId) {
      return;
    }

    dispatchPersistenceAdapter.upsertCadEvent(expeditionId, recoveryCadPersistenceDefaults, event);
  }, [localDispatchPersistenceId, recoveryCadPersistenceDefaults]);

  const persistRecoveryCadEventLocally = useCallback((event: DispatchEvent) => {
    persistDispatchCadEventLocally(event);
  }, [persistDispatchCadEventLocally]);

  useEffect(() => {
    if (!localDispatchPersistenceId) {
      return undefined;
    }

    let cancelled = false;
    dispatchPersistenceAdapter.waitForHydration().then(() => {
      if (cancelled) {
        return;
      }

      const snapshot = dispatchPersistenceAdapter.load(
        localDispatchPersistenceId,
        recoveryCadPersistenceDefaults,
      );
      snapshot.cadEvents
        .filter(isPersistableLocalDispatchEvent)
        .forEach((event) => dispatchEventStore.upsertEvent(event));
    }).catch(() => {
      if (!cancelled) {
        console.warn('[DISPATCH] local_cad_store_load_failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    localDispatchPersistenceId,
    recoveryCadPersistenceDefaults,
  ]);

  useEffect(() => {
    if (!externalDispatchIntegrationEnabled || !recoveryCadBackendContext || offlineMode || !isOnline) {
      return undefined;
    }

    let cancelled = false;
    const loadBackendCadEvents = () => {
      void fetchDispatchCadEventsFromBackend(recoveryCadBackendContext).then((result) => {
        if (cancelled || !result.ok) {
          return;
        }

        result.events
          .filter((event) => isRecoveryCadEventInAuthorizedContext({
            event,
            teamSnapshot,
            expedition: currentExpedition,
            identity: commandIdentity,
          }))
          .forEach((event) => {
            const receivedEvent: DispatchEvent = {
              ...event,
              syncState: 'received',
            };
            dispatchEventStore.upsertEvent(receivedEvent);
            persistDispatchCadEventLocally(receivedEvent);
          });
      }).catch(() => {
        if (!cancelled) {
          console.warn('[DISPATCH] recovery_cad_backend_fetch_failed');
        }
      });
    };

    loadBackendCadEvents();
    const intervalId = setInterval(loadBackendCadEvents, 30_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    commandIdentity,
    currentExpedition,
    externalDispatchIntegrationEnabled,
    isOnline,
    offlineMode,
    persistDispatchCadEventLocally,
    recoveryCadBackendContext,
    teamSnapshot,
  ]);

  useEffect(() => {
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;

    if (!externalDispatchIntegrationEnabled || !recoveryCadRealtimeExpeditionId || !teamSnapshot.activeTeam) {
      setRealtimeStatus('disabled');
      return undefined;
    }

    const session = createDispatchRealtimeSession({
      expeditionId: recoveryCadRealtimeExpeditionId,
      clientId: realtimeClientId,
      onStatusChange: setRealtimeStatus,
      onEvent: (envelope) => {
        if (envelope.type !== 'cad_event_upsert') {
          return;
        }

        const incomingEvent: DispatchEvent = {
          ...envelope.cadEvent,
          syncState: 'received',
        };
        if (!isRecoveryCadEventInAuthorizedContext({
          event: incomingEvent,
          teamSnapshot,
          expedition: currentExpedition,
          identity: commandIdentity,
        })) {
          console.warn('[DISPATCH] recovery_cad_event_blocked reason=unauthorized_context');
          return;
        }

        dispatchEventStore.upsertEvent(incomingEvent);
        persistDispatchCadEventLocally(incomingEvent);
      },
    });

    realtimeSessionRef.current = session;
    return () => {
      if (realtimeSessionRef.current === session) {
        realtimeSessionRef.current = null;
      }
      session.close();
    };
  }, [
    commandIdentity,
    currentExpedition,
    externalDispatchIntegrationEnabled,
    persistDispatchCadEventLocally,
    realtimeClientId,
    recoveryCadRealtimeExpeditionId,
    teamSnapshot,
    teamSnapshot.activeTeam,
  ]);

  useEffect(() => {
    const liveEvents = buildLiveDispatchEvents(getLiveDispatchEventInput(
      { queuedCount, syncStatus, isOnline, offlineMode },
      teamPositionSharingEnabled || externalDispatchIntegrationEnabled
        ? teamSnapshotRef.current
        : null,
    ));
    dispatchEventStore.replaceLiveDispatchEvents(liveEvents);
  }, [
    activeTeamId,
    channelRevision,
    dirtyCount,
    isOnline,
    offlineMode,
    queuedCount,
    syncStatus,
    teamMemberCount,
    teamUpdatedAt,
    externalDispatchIntegrationEnabled,
    teamPositionSharingEnabled,
  ]);

  const visibleEvents = useMemo(
    () => sortDispatchEvents(events.filter((event) => (
      (isActiveLiveDispatchEvent(event) && !(
        isClearableRoutineCadEvent(event) &&
        getEventUiMeta(uiMetaById, event, false).state === 'dismissed'
      )) ||
      getEventUiMeta(uiMetaById, event, false).state !== 'dismissed'
    ))),
    [events, uiMetaById],
  );
  const clearableCadEventCount = useMemo(
    () => visibleEvents.filter(isClearableRoutineCadEvent).length,
    [visibleEvents],
  );
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const drilldownEvent = useMemo(
    () => events.find((event) => event.id === drilldownEventId) ?? null,
    [drilldownEventId, events],
  );
  const selectedEventMeta = selectedEvent
    ? getEventUiMeta(uiMetaById, selectedEvent, false)
    : null;
  const connectionState = getConnectionState({ isOnline, offlineMode, queuedCount });
  const teamSyncState = getTeamSyncState({
    isOnline,
    offlineMode,
    syncStatus,
    snapshot: teamSnapshot,
  });
  const teamStatusLabel = teamSyncState.label;
  const sourceState = getLiveSourceState(visibleEvents);
  const channelSnapshots = useMemo(
    () => {
      if (channelRevision < 0) {
        return [];
      }

      return getDispatchChannelSnapshots({ queuedCount, syncStatus, isOnline, offlineMode });
    },
    [channelRevision, isOnline, offlineMode, queuedCount, syncStatus],
  );
  const advisory = useMemo(() => {
    const topEvent = getTopDispatchAdvisory(visibleEvents);
    return topEvent?.id === dismissedAdvisoryId ? null : topEvent;
  }, [dismissedAdvisoryId, visibleEvents]);

  useEffect(() => {
    const signature = `${visibleEvents.length}:${createLiveDispatchEventListFingerprint(visibleEvents)}`;
    if (lastDispatchRenderedLogSignature === signature) {
      return;
    }
    lastDispatchRenderedLogSignature = signature;
    logDispatchCadLifecycle(
      `[DISPATCH] event_rendered count=${visibleEvents.length}`,
      undefined,
      { debugOnly: visibleEvents.length === 0 },
    );
  }, [visibleEvents]);

  useEffect(() => {
    const logPayload = {
      state: teamStatusLabel,
      hasTeam: hasActiveTeam,
      memberCount: teamMemberCount,
      isOnline,
      offlineMode,
      reason: teamSyncState.reason,
      networkOnline: teamSyncState.networkOnline,
      effectiveOfflineMode: teamSyncState.effectiveOfflineMode,
      syncAvailable: teamSyncState.syncAvailable,
    };
    const signature = JSON.stringify(logPayload);
    if (lastDispatchTeamSyncLogSignature === signature) {
      return;
    }
    lastDispatchTeamSyncLogSignature = signature;
    logDispatchCadLifecycle('[DISPATCH] team_sync_state', logPayload, {
      debugOnly: !hasActiveTeam && visibleEvents.length === 0,
    });
  }, [
    isOnline,
    offlineMode,
    activeTeamId,
    hasActiveTeam,
    teamMemberCount,
    teamStatusLabel,
    teamSyncState.effectiveOfflineMode,
    teamSyncState.networkOnline,
    teamSyncState.reason,
    teamSyncState.syncAvailable,
    visibleEvents.length,
  ]);

  const publishRecoveryCadEvent = useCallback((event: DispatchEvent) => {
    if (!externalDispatchIntegrationEnabled) {
      return;
    }

    if (!isRecoveryCriticalEvent(event)) {
      return;
    }

    if (event.syncState === 'local' || event.syncState === 'sent' || event.syncState === 'received') {
      return;
    }

    const session = realtimeSessionRef.current;
    if (!session || realtimeStatus !== 'connected' || offlineMode || !isOnline) {
      return;
    }

    if (!isRecoveryCadEventInAuthorizedContext({
      event,
      teamSnapshot,
      expedition: currentExpedition,
      identity: commandIdentity,
    })) {
      return;
    }

    const now = Date.now();
    const lastAttemptAt = recoveryCadLastRetryAtRef.current[event.id] ?? 0;
    if (event.syncState === 'failed' && now - lastAttemptAt < RECOVERY_CAD_RETRY_COOLDOWN_MS) {
      return;
    }

    if (recoveryCadPublishInFlightRef.current.has(event.id)) {
      return;
    }

    recoveryCadLastRetryAtRef.current[event.id] = now;
    recoveryCadPublishInFlightRef.current.add(event.id);

    const sendingEvent: DispatchEvent = {
      ...event,
      syncState: 'sending',
    };
    dispatchEventStore.upsertEvent(sendingEvent);
    persistRecoveryCadEventLocally(sendingEvent);

    void (async () => {
      const durableResult = recoveryCadBackendContext
        ? await upsertDispatchCadEventToBackend(sendingEvent, recoveryCadBackendContext)
        : { ok: false, error: 'Missing recovery CAD backend context.' };
      try {
        await session.publish({
          type: 'cad_event_upsert',
          cadEvent: {
            ...sendingEvent,
            syncState: 'received',
          },
        });
      } catch {
        // Durable backend storage is the delivery source of truth; backend polling
        // will hydrate teammates if the app-process broadcast misses.
      }
      const sent = durableResult.ok;
      const nextEvent: DispatchEvent = {
        ...sendingEvent,
        syncState: sent ? 'sent' : 'failed',
      };
      dispatchEventStore.upsertEvent(nextEvent);
      persistRecoveryCadEventLocally(nextEvent);
      if (!sent) {
        showToast?.('Recovery CAD team sync failed. Event remains local for retry.');
      }
    })().catch(() => {
      const failedEvent: DispatchEvent = {
        ...sendingEvent,
        syncState: 'failed',
      };
      dispatchEventStore.upsertEvent(failedEvent);
      persistRecoveryCadEventLocally(failedEvent);
      showToast?.('Recovery CAD team sync failed. Event remains local for retry.');
    }).finally(() => {
      recoveryCadPublishInFlightRef.current.delete(event.id);
    });
  }, [
    commandIdentity,
    currentExpedition,
    externalDispatchIntegrationEnabled,
    isOnline,
    offlineMode,
    persistRecoveryCadEventLocally,
    recoveryCadBackendContext,
    realtimeStatus,
    showToast,
    teamSnapshot,
  ]);

  useEffect(() => {
    if (!externalDispatchIntegrationEnabled || realtimeStatus !== 'connected' || offlineMode || !isOnline) {
      return;
    }

    events
      .filter((event) => (
        isRecoveryCriticalEvent(event) &&
        (event.syncState === 'queued' || event.syncState === 'failed')
      ))
      .forEach(publishRecoveryCadEvent);
  }, [
    events,
    externalDispatchIntegrationEnabled,
    isOnline,
    offlineMode,
    publishRecoveryCadEvent,
    realtimeStatus,
  ]);

  const openCommand = useCallback((command: DispatchCommandType) => {
    setCommandForm(command === 'hazard' ? getHazardRecoveryForm() : getDefaultCommandForm());
    setCommandError(null);
    setActiveCommand(command);
  }, []);

  const forceProfileSetup = dispatchProfileHydrated && !isDispatchProfileComplete(
    dispatchProfile,
    dispatchProfileCompletenessContext,
  );
  const profilePanelVisible = profileVisible || forceProfileSetup;
  const dispatchActorUserId = commandIdentity.userId ?? commandIdentity.email ?? commandIdentity.callsign ?? 'local-dispatch-user';

  const saveDispatchProfile = useCallback((profile: Pick<DispatchProfileSnapshot, 'displayName' | 'callsign' | 'vehicleLabel' | 'vehicleId'>) => {
    const savedProfile = dispatchProfileStore.saveProfile(profile);
    setDispatchProfile(savedProfile);
    showToast?.('Dispatch profile saved.');
    if (isDispatchProfileComplete(savedProfile, dispatchProfileCompletenessContext)) {
      setProfileVisible(false);
    }
  }, [dispatchProfileCompletenessContext, showToast]);

  const closeCommand = useCallback(() => {
    if (commandSubmittingRef.current) return;
    setActiveCommand(null);
    setCommandError(null);
  }, []);

  const appendEvent = useCallback((event: DispatchEvent, queued: boolean): DispatchEvent | null => {
    const canShareRecoveryCadEvent = externalDispatchIntegrationEnabled &&
      isRecoveryCadEventInAuthorizedContext({
        event,
        teamSnapshot,
        expedition: currentExpedition,
        identity: commandIdentity,
      });
    const eventForStore = prepareRecoveryCadEventForSync({
      event,
      queued,
      canShare: canShareRecoveryCadEvent,
      realtimeStatus,
    });
    const storedEvent = dispatchEventStore.appendEvent(eventForStore);
    if (!storedEvent) {
      return null;
    }

    persistDispatchCadEventLocally(storedEvent);

    setUiMetaById((currentMeta) => ({
      ...currentMeta,
      [storedEvent.id]: {
        state: queued ? 'queued' : 'active',
        notes: [],
      },
    }));

    if (storedEvent.syncState === 'sending') {
      publishRecoveryCadEvent(storedEvent);
    }

    return storedEvent;
  }, [
    commandIdentity,
    currentExpedition,
    externalDispatchIntegrationEnabled,
    persistDispatchCadEventLocally,
    publishRecoveryCadEvent,
    realtimeStatus,
    teamSnapshot,
  ]);

  const handleChannelAction = useCallback((channel: DispatchChannelSnapshot) => {
    const availability = getDispatchChannelAvailability({
      channel,
      isOnline,
      offlineMode,
      hasActiveVehicle: !!activeVehicle,
    });
    if (!availability.enabled) {
      return;
    }

    const event = createDispatchEventFromChannelAction(channel);
    if (!event) {
      showToast?.('Dispatch channel action failed validation.');
      return;
    }

    const storedEvent = appendEvent({
      ...event,
      dedupeKey: [
        'channel-action',
        channel.id,
        channel.actionLabel,
        getDispatchActorDedupeId(commandIdentity),
      ].join(':'),
      targetItemId: channel.id,
      createdBy: {
        userId: commandIdentity.userId,
        displayName: commandIdentity.displayName,
        email: commandIdentity.email,
        callsign: commandIdentity.callsign,
      },
      rig: commandIdentity.rig,
    }, !isOnline || offlineMode || queuedCount > 0);
    showToast?.(storedEvent ? `${channel.actionLabel} created.` : 'Already submitted.');
  }, [activeVehicle, appendEvent, commandIdentity, isOnline, offlineMode, queuedCount, showToast]);

  const submitCommand = useCallback(async () => {
    if (!activeCommand || commandSubmittingRef.current) {
      return;
    }

    const validationMessage = validateCommandForm(activeCommand, commandForm);
    if (validationMessage) {
      setCommandError(validationMessage);
      return;
    }

    commandSubmittingRef.current = true;
    setCommandSubmitting(true);

    try {
      const event = activeCommand === 'hazard'
        ? await createRecoveryCadEventFromCurrentGps({
          form: commandForm,
          identity: commandIdentity,
          context: getRecoveryCadEventContext(teamSnapshot, currentExpedition),
        })
        : createEventFromCommand({
          command: activeCommand,
          form: commandForm,
          identity: commandIdentity,
        });

      if (!event) {
        setCommandError('Dispatch event failed validation.');
        return;
      }

      const queued = !isOnline || offlineMode || queuedCount > 0;
      const storedEvent = appendEvent(event, queued);
      setActiveCommand(null);
      setCommandError(null);
      showToast?.(
        storedEvent
          ? activeCommand === 'hazard'
            ? 'Recovery report saved locally.'
            : queued ? 'Dispatch event queued for sync.' : 'Dispatch event created.'
          : 'Already submitted.',
      );
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : 'Dispatch event could not be created.');
    } finally {
      commandSubmittingRef.current = false;
      setCommandSubmitting(false);
    }
  }, [
    activeCommand,
    appendEvent,
    commandForm,
    commandIdentity,
    currentExpedition,
    isOnline,
    offlineMode,
    queuedCount,
    showToast,
    teamSnapshot,
  ]);

  const handleEventAction = useCallback((event: DispatchEvent, actionId: EventActionId) => {
    if (actionId === 'dismiss' && isProtectedCadEvent(event)) {
      showToast?.('Recovery and protected CAD items stay pinned until resolved.');
      setSelectedEventId(null);
      return;
    }

    const actionKey = `${event.id}:${actionId}:${commandIdentity.userId ?? commandIdentity.callsign ?? commandIdentity.email ?? commandIdentity.displayName}`;
    if (submittedEventActionKeysRef.current.has(actionKey)) {
      showToast?.('Already submitted.');
      setSelectedEventId(null);
      return;
    }
    submittedEventActionKeysRef.current.add(actionKey);

    setUiMetaById((currentMeta) => {
      const meta = getEventUiMeta(currentMeta, event, false);
      return {
        ...currentMeta,
        [event.id]: applyEventAction(meta, actionId),
      };
    });

    if (actionId === 'dismiss' && advisory?.id === event.id) {
      setDismissedAdvisoryId(event.id);
    }

    setSelectedEventId(null);
    showToast?.(`${ACTION_LABELS[actionId]} recorded.`);
  }, [advisory?.id, commandIdentity.callsign, commandIdentity.displayName, commandIdentity.email, commandIdentity.userId, showToast]);

  const handleClearCadFeed = useCallback(() => {
    const clearableEvents = visibleEvents.filter(isClearableRoutineCadEvent);
    if (clearableEvents.length === 0) {
      showToast?.('No routine CAD items to clear.');
      return;
    }

    const clearableIds = new Set(clearableEvents.map((event) => event.id));
    setUiMetaById((currentMeta) => {
      const nextMeta = { ...currentMeta };
      for (const event of clearableEvents) {
        const meta = getEventUiMeta(currentMeta, event, false);
        nextMeta[event.id] = {
          state: 'dismissed',
          notes: [...meta.notes, 'Cleared locally from Running CAD Feed.'],
        };
      }
      return nextMeta;
    });

    if (dismissedAdvisoryId && clearableIds.has(dismissedAdvisoryId)) {
      setDismissedAdvisoryId(null);
    }

    showToast?.(`Cleared ${clearableEvents.length} routine CAD item${clearableEvents.length === 1 ? '' : 's'} locally.`);
  }, [dismissedAdvisoryId, showToast, visibleEvents]);

  const handleThreatAction = useCallback((event: DispatchEvent, actionId: ThreatActionId) => {
    const actionKey = createTargetActionDedupeKey(actionId, event, commandIdentity);
    if (submittedEventActionKeysRef.current.has(actionKey) || submittingThreatActionKey === actionKey) {
      showToast?.('Already submitted.');
      setDrilldownEventId(null);
      return;
    }

    submittedEventActionKeysRef.current.add(actionKey);
    setSubmittingThreatActionKey(actionKey);
    const nextEvent = createEventFromThreatAction(event, actionId, commandIdentity);
    if (!nextEvent) {
      submittedEventActionKeysRef.current.delete(actionKey);
      setSubmittingThreatActionKey(null);
      showToast?.('Threat action failed validation.');
      return;
    }

    const storedEvent = appendEvent(nextEvent, !isOnline || offlineMode || queuedCount > 0);
    setSubmittingThreatActionKey(null);
    setDrilldownEventId(null);
    showToast?.(storedEvent ? `${THREAT_ACTION_LABELS[actionId]} created.` : 'Already submitted.');
  }, [appendEvent, commandIdentity, isOnline, offlineMode, queuedCount, showToast, submittingThreatActionKey]);

  const handleNavigateAssist = useCallback(async (event: DispatchEvent) => {
    if (navigatingAssistEventId != null) {
      showToast?.('Recovery assist route is already starting.');
      return;
    }

    setNavigatingAssistEventId(event.id);
    try {
      const payload = buildRecoveryAssistNavigationPayload(event);
      await saveNavigationHandoffPayload(payload);
      await stageNavigationFlow({
        source: 'alert',
        target: 'navigate',
        intent: 'route_preview',
        label: 'Recovery Assist',
        message: 'Recovery assist route starting.',
        context: {
          routeId: payload.id,
          autoStartNavigation: true,
          overrideActiveNavigation: true,
          navigationMode: 'recovery_assist',
          recoveryAssistEventId: event.id,
          dispatchEventId: event.id,
        },
      });
      setSelectedEventId(null);
      setDrilldownEventId(null);
      showToast?.('Recovery assist route starting.');
      router.push('/navigate');
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : 'Recovery assist route unavailable.');
    } finally {
      setNavigatingAssistEventId(null);
    }
  }, [navigatingAssistEventId, router, showToast]);

  const handleRecoveryAssist = useCallback(async () => {
    if (recoveryAssistSubmitting || recoveryAssistSubmittingRef.current) {
      return;
    }

    recoveryAssistSubmittingRef.current = true;
    setRecoveryAssistSubmitting(true);
    try {
      const gpsFix = await getCurrentPosition();
      const event = createRecoveryAssistEvent(
        gpsFix,
        commandIdentity,
        getRecoveryCadEventContext(teamSnapshot, currentExpedition),
      );
      if (!event) {
        showToast?.('Recovery Assist failed validation.');
        return;
      }

      const storedEvent = appendEvent(event, !isOnline || offlineMode || queuedCount > 0);
      if (storedEvent) {
        setMoreVisible(false);
        showToast?.(externalDispatchIntegrationEnabled
          ? 'Recovery Assist queued for team sync.'
          : 'Recovery Assist saved locally with GPS pin.');
      } else {
        setMoreVisible(false);
        showToast?.('Already submitted.');
      }
    } catch (error) {
      console.warn(`[DISPATCH] event_rejected reason=${error instanceof Error ? error.message : 'GPS fix required for Recovery Assist.'}`);
      showToast?.(error instanceof Error ? error.message : 'GPS fix required for Recovery Assist.');
    } finally {
      recoveryAssistSubmittingRef.current = false;
      setRecoveryAssistSubmitting(false);
    }
  }, [
    appendEvent,
    commandIdentity,
    currentExpedition,
    externalDispatchIntegrationEnabled,
    isOnline,
    offlineMode,
    queuedCount,
    recoveryAssistSubmitting,
    showToast,
    teamSnapshot,
  ]);

  const renderEvent: ListRenderItem<DispatchEvent> = ({ item }) => (
    <EventRow
      event={item}
      meta={getEventUiMeta(uiMetaById, item, false)}
      onPress={(event) => {
        if (isRecoveryCriticalEvent(event)) {
          setSelectedEventId(event.id);
          return;
        }

        if (isThreatDrilldownEvent(event)) {
          if (canOpenThreatDrilldown(event)) {
    logDispatchCadLifecycle('[DISPATCH] drilldown_open', { id: event.id, type: event.type });
            setDrilldownEventId(event.id);
          } else {
            showToast?.('Threat map unavailable: exact location or route segment required.');
            setSelectedEventId(event.id);
          }
          return;
        }

        setSelectedEventId(event.id);
      }}
    />
  );

  return (
    <View style={styles.root}>
      <ECSShellTexture />
      <View style={styles.headerStrip}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>DISPATCH</Text>
            {teamPositionSharingEnabled || externalDispatchIntegrationEnabled ? (
              <TouchableOpacity
                style={styles.profileButton}
                accessibilityRole="button"
                accessibilityLabel="Connect Team"
                onPress={() => setInviteVisible(true)}
                activeOpacity={0.82}
              >
                <Ionicons name="person-add-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.profileButtonText} numberOfLines={1}>Connect</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.channel} numberOfLines={1}>{teamStatusLabel}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.profileButton}
            accessibilityRole="button"
            accessibilityLabel="Open Dispatch Profile"
            onPress={() => setProfileVisible(true)}
            activeOpacity={0.82}
          >
            <Ionicons name="person-circle-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.profileButtonText} numberOfLines={1}>Profile</Text>
          </TouchableOpacity>
          <View style={[styles.connectionPill, { borderColor: `${connectionState.tone}66` }]}>
            <View style={[styles.connectionDot, { backgroundColor: connectionState.tone }]} />
            <Text style={styles.connectionText}>{connectionState.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.liveStrip}>
        {channelSnapshots.map((channel) => (
          <DispatchChannelButton
            key={channel.id}
            channel={channel}
            availability={getDispatchChannelAvailability({
              channel,
              isOnline,
              offlineMode,
              hasActiveVehicle: !!activeVehicle,
            })}
            onPress={handleChannelAction}
          />
        ))}
      </View>

      {dispatchSensitiveGateNotice ? (
        <View style={styles.rolloutNotice}>
          <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.rolloutNoticeText} numberOfLines={3}>
            {dispatchSensitiveGateNotice}
          </Text>
        </View>
      ) : null}

      {advisory ? (
        <View style={styles.advisoryLine}>
          <ECSShellTexture />
          <Ionicons name="pulse-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.advisoryLabel}>ECS Advisory</Text>
          <Text style={styles.advisoryText} numberOfLines={1}>{advisory.message}</Text>
          <TouchableOpacity
            style={styles.advisoryDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss ECS advisory"
            onPress={() => setDismissedAdvisoryId(advisory.id)}
          >
            <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <DispatchReadinessContextCard />

      <View style={styles.feedPanel}>
        <ECSShellTexture />
        <View style={styles.feedHeader}>
          <View>
            <Text style={styles.feedTitle}>Running CAD Feed</Text>
            <Text style={styles.feedSource}>{getSourceStateLabel(sourceState)}</Text>
          </View>
          <View style={styles.feedHeaderActions}>
            <Text style={styles.feedCount}>{visibleEvents.length} events</Text>
            <TouchableOpacity
              style={[
                styles.clearCadButton,
                clearableCadEventCount === 0 ? styles.clearCadButtonDisabled : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear routine CAD feed items"
              accessibilityState={{ disabled: clearableCadEventCount === 0 }}
              activeOpacity={clearableCadEventCount === 0 ? 1 : 0.78}
              disabled={clearableCadEventCount === 0}
              onPress={handleClearCadFeed}
            >
              <Text
                style={[
                  styles.clearCadButtonText,
                  clearableCadEventCount === 0 ? styles.clearCadButtonTextDisabled : null,
                ]}
                numberOfLines={1}
              >
                Clear CAD
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          style={styles.feedList}
          contentContainerStyle={[
            styles.feedContent,
            visibleEvents.length === 0 ? styles.feedContentEmpty : null,
          ]}
          data={visibleEvents}
          keyExtractor={(event) => event.id}
          renderItem={renderEvent}
          ItemSeparatorComponent={FeedSeparator}
          ListEmptyComponent={EmptyFeed}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <View style={styles.commandRail}>
        <ECSShellTexture />
        {[
          { label: 'Check In', command: 'check_in', requiresTeam: true },
          { label: 'Ping', command: 'ping', requiresTeam: true },
          { label: 'Assist', command: 'assist', requiresTeam: false },
          { label: 'Rally', command: 'rally', requiresTeam: true },
        ].map((item) => {
          const teamCommandInactive = item.requiresTeam && !hasActiveTeam;

          return (
            <TouchableOpacity
              key={item.command}
              style={[styles.commandButton, teamCommandInactive ? styles.commandButtonInactive : null]}
              accessibilityRole="button"
              accessibilityLabel={teamCommandInactive ? `${item.label}. Team channel inactive.` : item.label}
              accessibilityState={{ disabled: teamCommandInactive }}
              disabled={teamCommandInactive}
              activeOpacity={teamCommandInactive ? 1 : 0.78}
              onPress={() => openCommand(item.command as DispatchCommandType)}
            >
              <Text
                style={[styles.commandButtonText, teamCommandInactive ? styles.commandButtonTextInactive : null]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {teamCommandInactive ? (
                <Text style={styles.commandButtonReason} numberOfLines={1}>Team inactive</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.commandButton, styles.recoveryCommandButton]}
          accessibilityRole="button"
          accessibilityLabel="Create recovery or hazard CAD event"
          onPress={() => openCommand('hazard')}
        >
          <Text style={[styles.commandButtonText, styles.recoveryCommandButtonText]} numberOfLines={1}>
            Recovery
          </Text>
        </TouchableOpacity>
      </View>

      <EventDetailModal
        event={selectedEvent}
        meta={selectedEventMeta}
        submittingThreatActionKey={submittingThreatActionKey}
        navigatingAssistEventId={navigatingAssistEventId}
        onClose={() => setSelectedEventId(null)}
        onAction={handleEventAction}
        onOpenDrilldown={(event) => {
          setSelectedEventId(null);
          setDrilldownEventId(event.id);
        }}
        onThreatAction={handleThreatAction}
        onNavigateAssist={handleNavigateAssist}
      />
      <ThreatDrilldownModal
        event={drilldownEvent}
        submittingActionKey={submittingThreatActionKey}
        navigatingAssistEventId={navigatingAssistEventId}
        onClose={() => setDrilldownEventId(null)}
        onOpenDetails={(event) => {
          setDrilldownEventId(null);
          setSelectedEventId(event.id);
        }}
        onThreatAction={handleThreatAction}
        onNavigateAssist={handleNavigateAssist}
      />
      <MoreActionsModal
        visible={moreVisible}
        recoveryAssistSubmitting={recoveryAssistSubmitting}
        onClose={() => setMoreVisible(false)}
        onRecoveryAssist={handleRecoveryAssist}
        onSelect={(command) => {
          setMoreVisible(false);
          openCommand(command);
        }}
      />
      {activeCommand === 'hazard' ? (
        <HazardRecoveryCadEventModal
          visible
          form={commandForm}
          error={commandError}
          submitting={commandSubmitting}
          onChange={setCommandForm}
          onClose={closeCommand}
          onSubmit={submitCommand}
        />
      ) : (
        <DispatchCommandModal
          command={activeCommand}
          form={commandForm}
          error={commandError}
          submitting={commandSubmitting}
          onChange={setCommandForm}
          onClose={closeCommand}
          onSubmit={submitCommand}
        />
      )}
      <DispatchProfilePanel
        visible={profilePanelVisible}
        profile={dispatchProfile}
        identity={commandIdentity}
        activeRigLabel={activeRigLabel}
        savedRigLabel={savedRigLabel}
        activeVehicleId={activeVehicle?.id ?? null}
        vehicleRequired={hasAvailableVehicle}
        requiredSetupMode={forceProfileSetup}
        onClose={() => {
          if (!forceProfileSetup) {
            setProfileVisible(false);
          }
        }}
        onSave={saveDispatchProfile}
      />
      <ExpeditionChannelInvitePanel
        visible={inviteVisible}
        expedition={currentExpedition}
        teamName={teamSnapshot.activeTeam?.name ?? null}
        teamModeEnabled={!!teamSnapshot.activeTeam}
        identity={commandIdentity}
        canManageInvite={
          !!dispatchActorUserId &&
          (
            teamSnapshot.activeTeam?.ownerId === dispatchActorUserId ||
            teamSnapshot.members.some((member) =>
              member.userId === dispatchActorUserId && (member.role === 'owner' || member.role === 'admin')
            )
          )
        }
        showToast={showToast}
        onClose={() => setInviteVisible(false)}
      />
    </View>
  );
}

function DispatchChannelButton({
  channel,
  availability,
  onPress,
}: {
  channel: DispatchChannelSnapshot;
  availability: DispatchChannelAvailability;
  onPress: (channel: DispatchChannelSnapshot) => void;
}) {
  const disabled = !availability.enabled;
  const tone = disabled
    ? TACTICAL.textMuted
    : SEVERITY_TONE[channel.severity];
  const displayActionLabel = disabled
    ? availability.reason ?? 'Unavailable'
    : channel.actionLabel;

  return (
    <TouchableOpacity
      style={[styles.liveChip, disabled ? styles.liveChipDisabled : null]}
      accessibilityRole="button"
      accessibilityLabel={`${channel.label}. ${channel.statusLabel}. ${channel.actionLabel}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.78}
      onPress={() => {
        if (disabled) return;
        onPress(channel);
      }}
    >
      <ECSShellTexture />
      <View style={styles.channelTopRow}>
        <Text style={[styles.liveChipLabel, disabled ? styles.liveChipTextDisabled : null]} numberOfLines={1}>{channel.label}</Text>
        <View style={[styles.channelStatusDot, { backgroundColor: tone }]} />
      </View>
      <Text style={[styles.liveChipValue, { color: tone }]} numberOfLines={1}>{channel.statusLabel}</Text>
      <Text style={[styles.channelDetail, disabled ? styles.liveChipTextDisabled : null]} numberOfLines={1}>{channel.detail}</Text>
      <Text style={[styles.channelActionLabel, disabled ? styles.channelActionLabelDisabled : null]} numberOfLines={1}>
        {displayActionLabel}
      </Text>
    </TouchableOpacity>
  );
}

function FeedSeparator() {
  return <View style={styles.feedSeparator} />;
}

function EmptyFeed() {
  return (
    <View style={styles.emptyFeed}>
      <Ionicons name="radio-outline" size={18} color={TACTICAL.textMuted} />
      <Text style={styles.emptyFeedTitle}>No live dispatch events</Text>
    </View>
  );
}

function EventRow({
  event,
  meta,
  onPress,
}: {
  event: DispatchEvent;
  meta: EventUiMeta;
  onPress: (event: DispatchEvent) => void;
}) {
  const tone = SEVERITY_TONE[event.severity];
  const isRecoveryCritical = isRecoveryCriticalEvent(event);
  const stateTone = UI_STATE_TONE[meta.state];
  const statusTone = isRecoveryCritical ? TACTICAL.danger : stateTone;
  const drilldownRequired = canOpenThreatDrilldown(event);
  const senderLabel = getDispatchSenderLabel(event);
  const severityLabel = isRecoveryCritical
    ? 'Recovery Critical'
    : getDispatchSeverityLabel(event.severity);
  const summary = isRecoveryCritical
    ? getRecoveryCriticalSummary(event)
    : event.message;
  const locationLabel = getRecoveryCriticalLocationLabel(event);
  const recoverySyncLabel = getRecoveryCadSyncLabel(event);

  return (
    <TouchableOpacity
      style={[
        styles.eventRow,
        event.severity === 'critical' ? styles.eventRowCritical : null,
        isRecoveryCritical ? styles.eventRowRecoveryCritical : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}. ${getDispatchEventTypeLabel(event.type)}. ${severityLabel} severity.`}
      onPress={() => onPress(event)}
    >
      <View style={[styles.eventRail, { backgroundColor: tone }]} />
      <View style={styles.eventBody}>
        <View style={styles.eventTopRow}>
          <View style={[styles.eventIcon, { borderColor: `${tone}66` }]}>
            <Ionicons name={EVENT_ICON[event.type]} size={13} color={tone} />
          </View>
          <Text style={styles.eventType} numberOfLines={1}>{getDispatchEventTypeLabel(event.type).toUpperCase()}</Text>
          <Text style={[styles.severityLabel, { color: tone }]} numberOfLines={1}>{severityLabel.toUpperCase()}</Text>
          <View style={styles.eventTopSpacer} />
          <Text style={styles.eventTime}>{formatEventTime(event.createdAt)}</Text>
        </View>

        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text
          style={[styles.eventSummary, isRecoveryCritical ? styles.recoveryEventSummary : null]}
          numberOfLines={2}
        >
          {summary}
        </Text>

        <View style={styles.eventBottomRow}>
          {senderLabel ? (
            <View style={styles.eventIdentityPill}>
              <Ionicons name="person-circle-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={styles.eventIdentityText} numberOfLines={1}>
                {senderLabel}
                {event.rig?.label ? ` / ${event.rig.label}` : ''}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.eventStatus, { color: statusTone }]} numberOfLines={1}>
            {isRecoveryCritical ? 'Recovery Critical' : meta.state}
          </Text>
          {locationLabel ? (
            <Text style={styles.recoveryLocationLabel} numberOfLines={1}>{locationLabel}</Text>
          ) : null}
          {recoverySyncLabel ? (
            <Text
              style={[
                styles.recoverySyncLabel,
                event.syncState === 'failed' ? styles.recoverySyncFailed : null,
              ]}
              numberOfLines={1}
            >
              {recoverySyncLabel}
            </Text>
          ) : null}
          <Text style={styles.contextLabel} numberOfLines={1}>
            {event.routeSegmentId ? `Segment ${event.routeSegmentId}` : getDispatchSourceLabel(event.source)}
          </Text>
          {drilldownRequired && !isRecoveryCritical ? (
            <Text style={styles.mapLabel} numberOfLines={1}>DRILLDOWN</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EventDetailModal({
  event,
  meta,
  submittingThreatActionKey,
  navigatingAssistEventId,
  onClose,
  onAction,
  onOpenDrilldown,
  onThreatAction,
  onNavigateAssist,
}: {
  event: DispatchEvent | null;
  meta: EventUiMeta | null;
  submittingThreatActionKey: string | null;
  navigatingAssistEventId: string | null;
  onClose: () => void;
  onAction: (event: DispatchEvent, actionId: EventActionId) => void;
  onOpenDrilldown: (event: DispatchEvent) => void;
  onThreatAction: (event: DispatchEvent, actionId: ThreatActionId) => void;
  onNavigateAssist: (event: DispatchEvent) => void;
}) {
  const actions = event && meta ? getEventActions(event, meta) : [];
  const isRecoveryCritical = event ? isRecoveryCriticalEvent(event) : false;
  const navigateAssistSubmitting = !!event && navigatingAssistEventId === event.id;
  const showDrilldown = event ? isThreatDrilldownEvent(event) && !isRecoveryCritical : false;
  const senderLabel = event ? getDispatchSenderLabel(event) : null;
  const detail = event
    ? createDispatchEventDetailPresentation(event, meta?.state ?? null)
    : null;
  const detailSubtitle = detail
    ? `${detail.typeLabel} | ${isRecoveryCritical ? 'Recovery Critical' : detail.severityLabel}`
    : undefined;
  const recoverySyncLabel = event ? getRecoveryCadSyncLabel(event) : null;

  return (
    <ECSModalShell
      visible={!!event}
      onClose={onClose}
      title={detail?.title ?? 'CAD Event'}
      subtitle={detailSubtitle}
      icon={event ? EVENT_ICON[event.type] : 'radio-outline'}
      overlayClass="info"
      stackBehavior="replace"
      maxWidth={520}
    >
      {event && meta && detail ? (
        <View style={styles.modalStack}>
          <View style={styles.modalMetaGrid}>
            <ModalMetaItem label="Type" value={detail.typeLabel} />
            <ModalMetaItem
              label="Priority"
              value={isRecoveryCritical ? 'Recovery Critical' : detail.priorityLabel}
              tone={isRecoveryCritical ? TACTICAL.danger : SEVERITY_TONE[event.severity]}
            />
            <ModalMetaItem
              label="Status"
              value={isRecoveryCritical ? 'Recovery Critical' : detail.statusLabel}
              tone={isRecoveryCritical ? TACTICAL.danger : UI_STATE_TONE[meta.state]}
            />
            <ModalMetaItem label="Created" value={detail.createdTimeText} />
            {detail.updatedTimeText ? (
              <ModalMetaItem label="Updated" value={detail.updatedTimeText} />
            ) : null}
            {detail.referenceId ? (
              <ModalMetaItem label="CAD / Ref" value={detail.referenceId} />
            ) : null}
            {isRecoveryCritical && getRecoveryHazardTypeLabel(event) ? (
              <ModalMetaItem label="Hazard" value={getRecoveryHazardTypeLabel(event) ?? 'Recovery'} tone={TACTICAL.danger} />
            ) : null}
            {isRecoveryCritical && recoverySyncLabel ? (
              <ModalMetaItem
                label="Team Sync"
                value={recoverySyncLabel}
                tone={event.syncState === 'failed' ? TACTICAL.danger : TACTICAL.textMuted}
              />
            ) : null}
          </View>

          {isRecoveryCritical ? (
            <RecoveryAssistPinDetail event={event} detail={detail} />
          ) : null}

          <View style={styles.modalDetailsPanel}>
            <Text style={styles.modalSectionLabel}>Details</Text>
            <Text style={styles.modalDetails} selectable>{detail.body}</Text>
          </View>

          <View style={styles.modalFactRow}>
            <Text style={styles.modalFactLabel}>Source</Text>
            <Text style={styles.modalFactValue}>{detail.sourceLabel}</Text>
          </View>
          {senderLabel ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>Sent By</Text>
              <Text style={styles.modalFactValue}>{senderLabel}</Text>
            </View>
          ) : null}
          {event.rig ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>Rig</Text>
              <Text style={styles.modalFactValue}>{event.rig.label}</Text>
            </View>
          ) : null}
          {event.routeSegmentId ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>Route Segment</Text>
              <Text style={styles.modalFactValue}>{event.routeSegmentId}</Text>
            </View>
          ) : null}
          {detail.coordinatesText ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>Coordinates</Text>
              <Text style={[styles.modalFactValue, styles.coordinateValue]} selectable>
                {detail.coordinatesText}
              </Text>
            </View>
          ) : null}
          {isRecoveryCritical && getRecoveryLocationAccuracyText(event) ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>Accuracy</Text>
              <Text style={styles.modalFactValue}>{getRecoveryLocationAccuracyText(event)}</Text>
            </View>
          ) : null}
          {isRecoveryCritical && event.location?.timestamp ? (
            <View style={styles.modalFactRow}>
              <Text style={styles.modalFactLabel}>GPS Fix</Text>
              <Text style={styles.modalFactValue}>
                {formatRecoveryLocationTimestamp(event.location.timestamp) ?? event.location.timestamp}
              </Text>
            </View>
          ) : null}

          {detail.recoveryNotes.length > 0 ? (
            <View style={styles.notesPanel}>
              <Text style={styles.modalSectionLabel}>Recovery Assist Notes</Text>
              {detail.recoveryNotes.map((note, index) => (
                <Text key={`${event.id}-recovery-note-${index}`} style={styles.noteText}>
                  {note}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.notesPanel}>
            <Text style={styles.modalSectionLabel}>Comments / Notes</Text>
            {meta.notes.length > 0 ? (
              meta.notes.map((note, index) => (
                <Text key={`${event.id}-note-${index}`} style={styles.noteText}>
                  {note}
                </Text>
              ))
            ) : (
              <Text style={styles.emptyNoteText}>No local notes yet.</Text>
            )}
          </View>

          <View style={styles.actionsPanel}>
            <Text style={styles.modalSectionLabel}>Available Actions</Text>
            <View style={styles.actionGrid}>
              {isRecoveryCritical ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.detailActionButton,
                      styles.navigateAssistButton,
                      navigateAssistSubmitting ? styles.commandButtonDisabled : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Navigate Assist"
                    disabled={navigateAssistSubmitting}
                    onPress={() => onNavigateAssist(event)}
                  >
                    <Text style={[styles.detailActionText, styles.navigateAssistText]}>
                      {navigateAssistSubmitting ? 'Starting Assist' : 'Navigate Assist'}
                    </Text>
                  </TouchableOpacity>
                  {(['ping_threat', 'mark_hazard', 'request_assist'] as ThreatActionId[]).map((actionId) => {
                    const disabled = submittingThreatActionKey != null;
                    return (
                      <TouchableOpacity
                        key={actionId}
                        style={[styles.detailActionButton, disabled ? styles.commandButtonDisabled : null]}
                        accessibilityRole="button"
                        accessibilityLabel={THREAT_ACTION_LABELS[actionId]}
                        disabled={disabled}
                        onPress={() => onThreatAction(event, actionId)}
                      >
                        <Text style={styles.detailActionText}>
                          {disabled ? 'Submitting' : THREAT_ACTION_LABELS[actionId]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
              {showDrilldown ? (
                <TouchableOpacity
                  style={[styles.detailActionButton, styles.mapActionButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Open threat map drilldown"
                  onPress={() => onOpenDrilldown(event)}
                >
                  <Text style={styles.detailActionText}>Map Drilldown</Text>
                </TouchableOpacity>
              ) : null}
              {!isRecoveryCritical ? actions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.detailActionButton}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => onAction(event, action.id)}
                >
                  <Text style={styles.detailActionText}>{action.label}</Text>
                </TouchableOpacity>
              )) : null}
            </View>
          </View>
        </View>
      ) : null}
    </ECSModalShell>
  );
}

function ModalMetaItem({
  label,
  value,
  tone = TACTICAL.text,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.modalMetaItem}>
      <Text style={styles.modalMetaLabel}>{label}</Text>
      <Text style={[styles.modalMetaValue, { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ThreatDrilldownModal({
  event,
  submittingActionKey,
  navigatingAssistEventId,
  onClose,
  onOpenDetails,
  onThreatAction,
  onNavigateAssist,
}: {
  event: DispatchEvent | null;
  submittingActionKey: string | null;
  navigatingAssistEventId: string | null;
  onClose: () => void;
  onOpenDetails: (event: DispatchEvent) => void;
  onThreatAction: (event: DispatchEvent, actionId: ThreatActionId) => void;
  onNavigateAssist: (event: DispatchEvent) => void;
}) {
  const geometry = useMemo(() => getThreatMapGeometry(event), [event]);
  const isRecoveryAssistance = event ? isRecoveryAssistanceCadEvent(event) : false;
  const navigateAssistSubmitting = !!event && navigatingAssistEventId === event.id;
  const subtitle = event
    ? `${getDispatchEventTypeLabel(event.type)} / ${getDispatchSeverityLabel(event.severity)} / ${geometry.precisionLabel}`
    : 'No threat selected';

  return (
    <ECSModalShell
      visible={!!event}
      onClose={onClose}
      title={event?.title ?? 'Threat Drilldown'}
      icon="map-outline"
      eyebrow="MAP INTELLIGENCE"
      subtitle={subtitle}
      overlayClass="workflow"
      tier="global"
      stackBehavior="replace"
      maxWidth={980}
      maxHeightFraction={0.94}
      minHeightFraction={0.84}
      scrollable={false}
      dismissOnBackdrop={false}
      allowSwipeDismiss={false}
      bodyStyle={styles.threatModalBody}
    >
      <View style={styles.threatScreen}>
        <View style={styles.threatMapPanel}>
          <ThreatMapSurface event={event} geometry={geometry} />
        </View>

        {event ? (
          <View style={styles.threatInfoPanel}>
            <View style={styles.threatInfoRow}>
              <Text style={styles.threatInfoLabel}>Threat Marker</Text>
              <Text style={styles.threatInfoValue} numberOfLines={1}>
                {geometry.marker
                  ? `${geometry.marker.latitude.toFixed(5)}, ${geometry.marker.longitude.toFixed(5)}`
                  : 'No precise point supplied'}
              </Text>
            </View>
            <View style={styles.threatInfoRow}>
              <Text style={styles.threatInfoLabel}>Route Context</Text>
              <Text style={styles.threatInfoValue} numberOfLines={1}>
                {event.routeSegmentId
                  ? `Segment ${event.routeSegmentId}`
                  : geometry.routePoints.length > 0
                    ? 'Resolved active route segment'
                    : 'No affected segment supplied'}
              </Text>
            </View>
            <Text style={styles.threatMessage} numberOfLines={3}>{event.message}</Text>
            <View style={styles.threatActions}>
              {isRecoveryAssistance ? (
                <TouchableOpacity
                  style={[
                    styles.threatActionButton,
                    styles.navigateAssistButton,
                    navigateAssistSubmitting ? styles.commandButtonDisabled : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Navigate to Recovery Request"
                  disabled={navigateAssistSubmitting}
                  onPress={() => onNavigateAssist(event)}
                >
                  <Text style={[styles.threatActionText, styles.navigateAssistText]}>
                    {navigateAssistSubmitting ? 'Starting Navigation' : 'Navigate to Recovery Request'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  {(['ping_threat', 'mark_hazard', 'request_assist'] as ThreatActionId[]).map((actionId) => {
                    const disabled = submittingActionKey != null;
                    return (
                      <TouchableOpacity
                        key={actionId}
                        style={[styles.threatActionButton, disabled ? styles.commandButtonDisabled : null]}
                        accessibilityRole="button"
                        accessibilityLabel={THREAT_ACTION_LABELS[actionId]}
                        disabled={disabled}
                        onPress={() => onThreatAction(event, actionId)}
                      >
                        <Text style={styles.threatActionText}>{disabled ? 'Submitting' : THREAT_ACTION_LABELS[actionId]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.threatActionButton, styles.threatSecondaryButton]}
                    accessibilityRole="button"
                    accessibilityLabel="Open CAD event details"
                    onPress={() => onOpenDetails(event)}
                  >
                    <Text style={styles.threatActionText}>Event Detail</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </ECSModalShell>
  );
}

function RecoveryAssistPinDetail({
  event,
  detail,
}: {
  event: DispatchEvent;
  detail: ReturnType<typeof createDispatchEventDetailPresentation>;
}) {
  const geometry = useMemo(() => getThreatMapGeometry(event), [event]);
  const coordinateText = getRecoveryCoordinateText(event) ?? detail.coordinatesText;
  const accuracyText = getRecoveryLocationAccuracyText(event);
  const timestampText = event.location?.timestamp
    ? formatRecoveryLocationTimestamp(event.location.timestamp) ?? event.location.timestamp
    : null;
  const hazardType = getRecoveryHazardTypeLabel(event) ?? 'Recovery';

  return (
    <View style={styles.recoveryPinPanel}>
      <View style={styles.recoveryPinHeader}>
        <View style={styles.recoveryPinHeaderCopy}>
          <Text style={styles.recoveryPinEyebrow}>PIN LOCATION</Text>
          <Text style={styles.recoveryPinTitle} numberOfLines={1}>
            Recovery Assist Drop
          </Text>
        </View>
        <Text style={styles.recoveryPinStatus} numberOfLines={1}>Recovery Critical</Text>
      </View>

      {geometry.center ? (
        <View style={styles.recoveryPinMapPreview}>
          <ThreatMapSurface event={event} geometry={geometry} />
        </View>
      ) : (
        <View style={styles.recoveryPinFallback}>
          <Text style={styles.recoveryPinFallbackTitle}>Pin location unavailable</Text>
          <Text style={styles.recoveryPinFallbackCopy}>
            This recovery CAD event does not include a valid GPS coordinate.
          </Text>
        </View>
      )}

      <View style={styles.recoveryPinFactGrid}>
        <RecoveryPinFact label="Coordinates" value={coordinateText ?? 'Unavailable'} selectable />
        <RecoveryPinFact label="Accuracy" value={accuracyText ?? 'Not provided'} />
        <RecoveryPinFact label="GPS Fix" value={timestampText ?? 'Not provided'} />
        <RecoveryPinFact label="Source" value={getRecoveryLocationSourceLabel(event)} />
        <RecoveryPinFact label="Hazard Type" value={hazardType} />
      </View>
    </View>
  );
}

function RecoveryPinFact({
  label,
  value,
  selectable = false,
}: {
  label: string;
  value: string;
  selectable?: boolean;
}) {
  return (
    <View style={styles.recoveryPinFact}>
      <Text style={styles.recoveryPinFactLabel}>{label}</Text>
      <Text
        style={[styles.recoveryPinFactValue, selectable ? styles.coordinateValue : null]}
        selectable={selectable}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ThreatMapSurface({
  event,
  geometry,
}: {
  event: DispatchEvent | null;
  geometry: ThreatMapGeometry;
}) {
  const mapHtml = useMemo(() => buildThreatMapHtml(event, geometry), [event, geometry]);

  if (!mapHtml) {
    return (
      <View style={styles.threatMapUnavailable}>
        <Ionicons name="map-outline" size={34} color={TACTICAL.textMuted} />
        <Text style={styles.threatUnavailableTitle}>PRECISE MAP UNAVAILABLE</Text>
        <Text style={styles.threatUnavailableCopy}>
          This event requires exact coordinates or a resolvable route segment before ECS can render a threat marker.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <iframe
        srcDoc={mapHtml}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Dispatch Threat Map"
      />
    );
  }

  return (
    <WebView
      source={{ html: mapHtml }}
      style={styles.threatWebView}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
    />
  );
}

function escapeMapString(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ');
}

function buildThreatMapHtml(event: DispatchEvent | null, geometry: ThreatMapGeometry): string {
  if (!event || !geometry.center) {
    return '';
  }

  const routeJs = geometry.routePoints.length >= 2
    ? `
      var routeCoords = [${geometry.routePoints.map((point) => `[${point.latitude}, ${point.longitude}]`).join(',')}];
      var segmentLine = L.polyline(routeCoords, {
        color: '#F0B84A',
        weight: 5,
        opacity: 0.92,
        lineCap: 'round',
      }).addTo(map);
      map.fitBounds(segmentLine.getBounds(), { padding: [36, 36] });
    `
    : `
      map.setView([${geometry.center.latitude}, ${geometry.center.longitude}], 14);
    `;

  const marker = geometry.marker ?? geometry.center;
  const label = escapeMapString(event.title);
  const message = escapeMapString(event.message);

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background: #070B0E; }
    .leaflet-control-attribution { display: none; }
    .threat-marker {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: rgba(192,57,43,0.95);
      border: 3px solid rgba(255,255,255,0.88);
      box-shadow: 0 0 0 8px rgba(192,57,43,0.20), 0 0 22px rgba(192,57,43,0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 900;
      font-size: 18px;
      font-family: monospace;
    }
    .leaflet-popup-content-wrapper {
      background: #10161A;
      color: #E6E6E1;
      border: 1px solid rgba(196,138,44,0.45);
      border-radius: 8px;
    }
    .leaflet-popup-tip { background: #10161A; }
    .leaflet-popup-content { font-family: monospace; font-size: 12px; line-height: 1.35; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    ${routeJs}
    var threatIcon = L.divIcon({
      className: '',
      html: '<div class="threat-marker">!</div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    L.marker([${marker.latitude}, ${marker.longitude}], { icon: threatIcon })
      .addTo(map)
      .bindPopup('<strong>${label}</strong><br/>${message}<br/><span style="color:#C48A2C">${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}</span>')
      .openPopup();
  </script>
</body>
</html>`;
}

function DispatchActionPanel({
  visible,
  title,
  icon,
  children,
  footer,
  showCloseButton = true,
  onClose,
}: {
  visible: boolean;
  title: string;
  icon: IconName;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  onClose: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={title}
      icon={icon}
      eyebrow="DISPATCH ACTION"
      footer={footer}
      tier="global"
      stackBehavior="replace"
      overlayClass="editor"
      maxWidth={760}
      maxHeightFraction={0.92}
      minHeightFraction={0.74}
      scrollable
      keyboardAware
      dismissOnBackdrop={showCloseButton}
      allowSwipeDismiss={showCloseButton}
      showHandle
      bodyStyle={styles.actionPanelModalScroll}
      contentContainerStyle={styles.actionPanelModalContent}
    >
      {children}
    </ECSModalShell>
  );
}

function DispatchCommandModal({
  command,
  form,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  command: DispatchCommandType | null;
  form: CommandFormState;
  error: string | null;
  submitting: boolean;
  onChange: (form: CommandFormState) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const updateForm = <K extends keyof CommandFormState>(key: K, value: CommandFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <DispatchActionPanel
      visible={!!command}
      onClose={onClose}
      title={command ? COMMAND_TITLES[command] : 'Dispatch Command'}
      icon="radio-outline"
      footer={(
        <View style={styles.commandFooter}>
          <TouchableOpacity
            style={[styles.commandFooterButton, styles.commandCancelButton]}
            accessibilityRole="button"
            accessibilityLabel="Cancel command"
            onPress={onClose}
            disabled={submitting}
          >
            <Text style={styles.commandCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.commandFooterButton, styles.commandSubmitButton, submitting ? styles.commandButtonDisabled : null]}
            accessibilityRole="button"
            accessibilityLabel="Create CAD event"
            onPress={() => {
              void onSubmit();
            }}
            disabled={submitting}
          >
            <Text style={styles.commandSubmitText}>{submitting ? 'Saving' : 'Create CAD Event'}</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <View style={styles.commandForm}>
        {command === 'check_in' ? (
          <>
            <OptionGroup
              label="Status"
              options={CHECK_IN_STATUS_OPTIONS}
              value={form.checkInStatus}
              onSelect={(value) => updateForm('checkInStatus', value)}
            />
            <CommandTextInput
              label="Optional Note"
              value={form.note}
              onChangeText={(value) => updateForm('note', value)}
            />
          </>
        ) : null}

        {command === 'ping' ? (
          <>
            <OptionGroup
              label="Ping Type"
              options={PING_TYPE_OPTIONS}
              value={form.pingType}
              onSelect={(value) => updateForm('pingType', value)}
            />
            <OptionGroup
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onSelect={(value) => updateForm('priority', value)}
            />
            <CommandTextInput
              label="Message"
              value={form.message}
              onChangeText={(value) => updateForm('message', value)}
            />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Require Acknowledgment</Text>
              <Switch
                value={form.requireAcknowledgment}
                onValueChange={(value) => updateForm('requireAcknowledgment', value)}
                trackColor={{ false: TACTICAL.border, true: ECS.accentSoft }}
                thumbColor={form.requireAcknowledgment ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </View>
          </>
        ) : null}

        {command === 'assist' ? (
          <>
            <Text style={styles.safetyCopy}>ECS team coordination only. This does not contact emergency services.</Text>
            <OptionGroup
              label="Assist Type"
              options={ASSIST_TYPE_OPTIONS}
              value={form.assistType}
              onSelect={(value) => updateForm('assistType', value)}
            />
            <OptionGroup
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onSelect={(value) => updateForm('priority', value)}
            />
            <OptionGroup
              label="Linked Context"
              options={LINKED_CONTEXT_OPTIONS}
              value={form.linkedContext}
              onSelect={(value) => updateForm('linkedContext', value)}
            />
            <CommandTextInput
              label="Message"
              value={form.message}
              onChangeText={(value) => updateForm('message', value)}
            />
          </>
        ) : null}

        {command === 'rally' ? (
          <>
            <OptionGroup
              label="Rally Location"
              options={LINKED_CONTEXT_OPTIONS}
              value={form.rallyLocation}
              onSelect={(value) => updateForm('rallyLocation', value)}
            />
            <OptionGroup
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onSelect={(value) => updateForm('priority', value)}
            />
            <CommandTextInput
              label="Message"
              value={form.message}
              onChangeText={(value) => updateForm('message', value)}
            />
          </>
        ) : null}

        {command === 'hazard' ? (
          <>
            <OptionGroup
              label="Hazard Type"
              options={HAZARD_TYPE_OPTIONS}
              value={form.hazardType}
              onSelect={(value) => updateForm('hazardType', value)}
            />
            <OptionGroup
              label="Severity"
              options={PRIORITY_OPTIONS}
              value={form.severity}
              onSelect={(value) => updateForm('severity', value)}
            />
            <CommandTextInput
              label="Message"
              value={form.message}
              onChangeText={(value) => updateForm('message', value)}
            />
          </>
        ) : null}

        {command === 'resource' ? (
          <>
            <OptionGroup
              label="Resource Type"
              options={RESOURCE_TYPE_OPTIONS}
              value={form.resourceType}
              onSelect={(value) => updateForm('resourceType', value)}
            />
            <OptionGroup
              label="Status"
              options={RESOURCE_STATUS_OPTIONS}
              value={form.resourceStatus}
              onSelect={(value) => updateForm('resourceStatus', value)}
            />
            <CommandTextInput
              label="Note"
              value={form.note}
              onChangeText={(value) => updateForm('note', value)}
            />
          </>
        ) : null}

        {error ? (
          <Text style={styles.commandError}>{error}</Text>
        ) : null}
      </View>
    </DispatchActionPanel>
  );
}

function HazardRecoveryCadEventModal({
  visible,
  form,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  form: CommandFormState;
  error: string | null;
  submitting: boolean;
  onChange: (form: CommandFormState) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const updateForm = <K extends keyof CommandFormState>(key: K, value: CommandFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  const selectHazardType = (hazardType: CommandFormState['hazardType']) => {
    onChange({
      ...form,
      hazardType,
    });
  };

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Recovery CAD Event"
      icon="warning-outline"
      subtitle="Create a local ECS CAD report. GPS is attempted at submit."
      overlayClass="editor"
      footer={(
        <View style={styles.commandFooter}>
          <TouchableOpacity
            style={[styles.commandFooterButton, styles.commandCancelButton]}
            accessibilityRole="button"
            accessibilityLabel="Cancel recovery CAD event"
            onPress={onClose}
            disabled={submitting}
          >
            <Text style={styles.commandCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.commandFooterButton,
              styles.commandSubmitButton,
              styles.recoverySubmitButton,
              submitting ? styles.commandButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create CAD event"
            onPress={() => {
              void onSubmit();
            }}
            disabled={submitting}
          >
            <Text style={[styles.commandSubmitText, styles.recoverySubmitText]}>
              {submitting ? 'Saving' : 'Create CAD Event'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <View style={styles.commandForm}>
        <Text style={styles.safetyCopy}>
          GPS is attempted only when Create CAD Event is tapped. If GPS is unavailable, ECS saves the report as Location unavailable. This stays local to ECS Dispatch and does not contact emergency services.
        </Text>
        <OptionGroup
          label="Category"
          options={HAZARD_TYPE_OPTIONS}
          value={form.hazardType}
          onSelect={selectHazardType}
        />
        <OptionGroup
          label="Severity"
          options={PRIORITY_OPTIONS}
          value={form.severity}
          onSelect={(severity) => updateForm('severity', severity)}
        />
        <View style={styles.recoveryCriticalNotice}>
          <Text style={styles.recoveryCriticalLabel}>Status</Text>
          <Text style={styles.recoveryCriticalValue}>Active Local Report</Text>
        </View>
        <CommandTextInput
          label="Note / Description"
          value={form.message}
          onChangeText={(value) => updateForm('message', value)}
        />
        {error ? (
          <Text style={styles.commandError}>{error}</Text>
        ) : null}
      </View>
    </ECSModalShell>
  );
}

function DispatchProfilePanel({
  visible,
  profile,
  identity,
  activeRigLabel,
  savedRigLabel,
  activeVehicleId,
  vehicleRequired,
  requiredSetupMode,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: DispatchProfileSnapshot;
  identity: DispatchCommandIdentity;
  activeRigLabel: string | null;
  savedRigLabel: string | null;
  activeVehicleId: string | null;
  vehicleRequired: boolean;
  requiredSetupMode: boolean;
  onClose: () => void;
  onSave: (profile: Pick<DispatchProfileSnapshot, 'displayName' | 'callsign' | 'vehicleLabel' | 'vehicleId'>) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [callsign, setCallsign] = useState(profile.callsign ?? '');
  const [vehicleLabel, setVehicleLabel] = useState(profile.vehicleLabel ?? activeRigLabel ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(profile.displayName ?? '');
    setCallsign(profile.callsign ?? '');
    setVehicleLabel(profile.vehicleLabel ?? activeRigLabel ?? '');
    setValidationError(null);
  }, [activeRigLabel, profile.callsign, profile.displayName, profile.vehicleLabel, visible]);

  const trimmedName = displayName.trim();
  const trimmedCallsign = callsign.trim();
  const trimmedVehicleLabel = vehicleLabel.trim();
  const hasOperatorIdentity = !!(
    trimmedName ||
    trimmedCallsign ||
    identity.callsign ||
    (identity.displayName && identity.displayName !== FALLBACK_DISPATCH_OPERATOR_NAME)
  );
  const hasVehicleIdentity = !!(trimmedVehicleLabel || activeRigLabel || savedRigLabel);
  const resolvedName = trimmedName || trimmedCallsign || identity.callsign || identity.displayName;
  const resolvedRigLabel = trimmedVehicleLabel || activeRigLabel || savedRigLabel;

  const handleSave = useCallback(() => {
    if (requiredSetupMode && (!hasOperatorIdentity || (vehicleRequired && !hasVehicleIdentity))) {
      setValidationError(!hasOperatorIdentity && vehicleRequired && !hasVehicleIdentity
        ? 'Name or callsign and vehicle information are required before Dispatch can open.'
        : !hasOperatorIdentity
          ? 'Name or callsign is required before Dispatch can open.'
          : 'Vehicle information is required before Dispatch can open.');
      return;
    }

    onSave({
      displayName: trimmedName || null,
      callsign: trimmedCallsign || null,
      vehicleLabel: trimmedVehicleLabel || activeRigLabel || savedRigLabel || null,
      vehicleId: activeRigLabel && (trimmedVehicleLabel === activeRigLabel || !trimmedVehicleLabel)
        ? activeVehicleId
        : null,
    });
  }, [
    activeRigLabel,
    activeVehicleId,
    hasOperatorIdentity,
    hasVehicleIdentity,
    requiredSetupMode,
    onSave,
    savedRigLabel,
    trimmedCallsign,
    trimmedName,
    trimmedVehicleLabel,
    vehicleRequired,
  ]);

  return (
    <DispatchActionPanel
      visible={visible}
      onClose={onClose}
      title={requiredSetupMode ? 'Complete Dispatch Profile' : 'Dispatch Profile'}
      icon="person-circle-outline"
      showCloseButton={!requiredSetupMode}
      footer={(
        <View style={styles.commandFooter}>
          {!requiredSetupMode ? (
            <TouchableOpacity
              style={[styles.commandFooterButton, styles.commandCancelButton]}
              accessibilityRole="button"
              accessibilityLabel="Cancel Dispatch Profile"
              onPress={onClose}
            >
              <Text style={styles.commandCancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.commandFooterButton,
              styles.commandSubmitButton,
              requiredSetupMode ? styles.commandFooterButtonFull : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save Dispatch Profile"
            onPress={handleSave}
          >
            <Text style={styles.commandSubmitText}>Save Profile</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <View style={styles.commandForm}>
        <View style={styles.profilePreviewCard}>
          <View style={styles.profilePreviewIcon}>
            <Ionicons name="person-circle-outline" size={20} color={TACTICAL.amber} />
          </View>
          <View style={styles.profilePreviewCopy}>
            <Text style={styles.profilePreviewEyebrow}>CAD IDENTITY</Text>
            <Text style={styles.profilePreviewName} numberOfLines={1}>{resolvedName}</Text>
            <Text style={styles.profilePreviewRig} numberOfLines={2}>
              {resolvedRigLabel
                ? `Rig: ${resolvedRigLabel}`
                : vehicleRequired
                  ? 'Vehicle information required'
                  : 'No ECS vehicle selected'}
            </Text>
          </View>
        </View>

        {requiredSetupMode ? (
          <View style={styles.profileRequiredNotice}>
            <Ionicons name="lock-closed-outline" size={15} color={TACTICAL.amber} />
            <Text style={styles.profileRequiredText}>
              Enter a name or callsign{vehicleRequired ? ' and confirm the rig' : ''} before using Dispatch so CAD events identify the operator clearly.
            </Text>
          </View>
        ) : null}

        <ProfileTextInput
          label="Team Display Name"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <ProfileTextInput
          label="Callsign"
          value={callsign}
          onChangeText={setCallsign}
        />
        <ProfileTextInput
          label="Vehicle / Rig"
          value={vehicleLabel}
          onChangeText={setVehicleLabel}
        />

        {validationError ? (
          <Text style={styles.profileValidationText}>{validationError}</Text>
        ) : null}

        <View style={styles.profileRigPanel}>
          <Text style={styles.commandFieldLabel}>Active Rig</Text>
          {activeRigLabel ? (
            <View style={styles.profileRigRow}>
              <Ionicons name="car-sport-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.profileRigText}>{activeRigLabel}</Text>
            </View>
          ) : (
            <View style={styles.profileEmptyRig}>
              <Ionicons name="car-outline" size={17} color={TACTICAL.textMuted} />
              <View style={styles.profileEmptyRigCopy}>
                <Text style={styles.profileEmptyRigTitle}>No active rig selected</Text>
                <Text style={styles.profileEmptyRigText}>
                  Set an active rig in Fleet to include it in Dispatch pings.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </DispatchActionPanel>
  );
}

function ExpeditionChannelInvitePanel({
  visible,
  expedition,
  teamName,
  teamModeEnabled,
  identity,
  canManageInvite,
  showToast,
  onClose,
}: {
  visible: boolean;
  expedition: ExpeditionRecord | null;
  teamName: string | null;
  teamModeEnabled: boolean;
  identity: DispatchCommandIdentity;
  canManageInvite: boolean;
  showToast?: (message: string) => void;
  onClose: () => void;
}) {
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [inviteState, setInviteState] = useState<InvitePanelState | null>(null);
  const [reviewingRequestIds, setReviewingRequestIds] = useState<string[]>([]);
  const [createForm, setCreateForm] = useState<CreateExpeditionFormState>(() => getDefaultCreateExpeditionForm(identity));
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingExpedition, setCreatingExpedition] = useState(false);
  const canCopy = hasClipboardSupport();
  const expeditionLabel = getExpeditionInviteLabel(expedition, teamName);
  const invite = inviteState?.invite ?? null;
  const pendingRequests = inviteState?.pendingRequests ?? [];
  const status = invite ? getInviteDisplayStatus(invite) : null;
  const statusTone = status ? getInviteStatusTone(status) : TACTICAL.textMuted;
  const canReviewRequests = canManageInvite || (!!invite && invite.createdByUserId === identity.userId);
  const cadActor = useMemo(() => ({
    userId: identity.userId,
    displayName: identity.displayName,
    callsign: identity.callsign,
  }), [identity.callsign, identity.displayName, identity.userId]);

  useEffect(() => {
    if (!visible) {
      setCreateError(null);
      setCreatingExpedition(false);
      return;
    }

    setCreateForm((current) => ({
      ...current,
      leaderName: current.leaderName.trim() ? current.leaderName : identity.displayName,
      leaderCallsign: current.leaderCallsign.trim() ? current.leaderCallsign : identity.callsign ?? '',
    }));
  }, [identity.callsign, identity.displayName, visible]);

  useEffect(() => {
    if (!visible || !expedition || !teamModeEnabled) {
      setInviteState(null);
      return;
    }

    const invite = expeditionInviteLocalAdapter.getOrCreateActiveInvite({
      expedition,
      createdByUserId: identity.userId ?? 'local-dispatch-user',
      approvalRequired,
    });
    setApprovalRequired(invite.approvalRequired);
    setInviteState({
      invite,
      pendingRequests: expeditionInviteLocalAdapter.getPendingRequests(invite.id),
    });
    const inviteStatus = getInviteDisplayStatus(invite);
    if (inviteStatus === 'active') {
      recordExpeditionChannelInviteActive(invite, cadActor);
    } else if (inviteStatus === 'disabled') {
      recordExpeditionChannelInviteDisabled(invite, cadActor);
    } else {
      recordExpeditionChannelInviteExpired(invite, cadActor);
    }
  }, [approvalRequired, cadActor, expedition, identity.userId, teamModeEnabled, visible]);

  const updateApprovalRequired = useCallback((nextValue: boolean) => {
    setApprovalRequired(nextValue);
    if (!invite) {
      return;
    }

    const nextInvite = expeditionInviteLocalAdapter.updateApprovalRequired(invite.id, nextValue);
    if (nextInvite) {
      setInviteState({
        invite: nextInvite,
        pendingRequests: expeditionInviteLocalAdapter.getPendingRequests(nextInvite.id),
      });
      recordExpeditionChannelApprovalRequiredChanged(nextInvite, cadActor);
    }
  }, [cadActor, invite]);

  const updateCreateForm = useCallback(<K extends keyof CreateExpeditionFormState>(
    key: K,
    value: CreateExpeditionFormState[K],
  ) => {
    setCreateError(null);
    setCreateForm((current) => ({ ...current, [key]: value }));
  }, []);

  const createLocalTeamForExpedition = useCallback((expeditionName: string) => {
    const ownerId = identity.userId ?? identity.email ?? identity.callsign ?? 'local-dispatch-user';
    return teamStore.createLocalTeam({
      name: `${expeditionName} Team`,
      ownerId,
      ownerDisplayName: identity.displayName,
    });
  }, [identity.callsign, identity.displayName, identity.email, identity.userId]);

  const handleCreateExpedition = useCallback(() => {
    if (creatingExpedition) return;

    const validationMessage = validateCreateExpeditionForm(createForm);
    if (validationMessage) {
      setCreateError(validationMessage);
      return;
    }

    setCreatingExpedition(true);
    const latitude = parseOptionalCoordinate(createForm.latitude, -90, 90);
    const longitude = parseOptionalCoordinate(createForm.longitude, -180, 180);
    const expeditionName = createForm.expeditionName.trim();
    const startDateTime = normalizeOptionalFormText(createForm.startDateTime);
    const record = expeditionStateStore.beginExpedition({
      activeVehicleId: identity.rig?.vehicleId ?? `dispatch-${identity.userId ?? 'local'}`,
      vehicleName: identity.rig?.label ?? expeditionName,
      expeditionName,
      description: normalizeOptionalFormText(createForm.description),
      teamLeaderName: normalizeOptionalFormText(createForm.leaderName) ?? identity.displayName,
      teamLeaderCallsign: normalizeOptionalFormText(createForm.leaderCallsign),
      startLocationLabel: normalizeOptionalFormText(createForm.startLocation),
      destination: normalizeOptionalFormText(createForm.destination),
      areaOfOperation: normalizeOptionalFormText(createForm.areaOfOperation),
      commsNotes: normalizeOptionalFormText(createForm.commsNotes),
      privacyMode: createForm.joinMode === 'open' ? 'open' : 'invite_only',
      joinMode: createForm.joinMode,
      startTime: startDateTime ? new Date(startDateTime).toISOString() : undefined,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      userId: identity.userId ?? null,
    });

    createLocalTeamForExpedition(expeditionName);
    setApprovalRequired(createForm.joinMode === 'approval_required');
    setCreateError(null);
    setCreateForm(getDefaultCreateExpeditionForm(identity));
    setCreatingExpedition(false);
    showToast?.(`${record.expeditionName ?? expeditionName} created.`);
  }, [createForm, createLocalTeamForExpedition, creatingExpedition, identity, showToast]);

  const handleEnableTeamMode = useCallback(() => {
    if (!expedition) return;
    createLocalTeamForExpedition(getExpeditionInviteLabel(expedition, null));
    showToast?.('Team channel created.');
  }, [createLocalTeamForExpedition, expedition, showToast]);

  const copyText = useCallback(async (value: string, label: string) => {
    if (!hasClipboardSupport()) {
      showToast?.('Clipboard copy is unavailable on this device.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast?.(`${label} copied.`);
    } catch {
      showToast?.(`${label} copy failed.`);
    }
  }, [showToast]);

  const shareInvite = useCallback(async () => {
    if (!invite) {
      return;
    }

    try {
      await Share.share({
        message: `${expeditionLabel}\nJoin Code: ${invite.joinCode}\n${invite.inviteLink}`,
        title: 'Expedition Channel Invite',
      });
    } catch {
      showToast?.('Invite share failed.');
    }
  }, [expeditionLabel, invite, showToast]);

  const refreshPendingRequests = useCallback((inviteId: string) => {
    setInviteState((current) => current
      ? {
        ...current,
        pendingRequests: expeditionInviteLocalAdapter.getPendingRequests(inviteId),
      }
      : current);
  }, []);

  const reviewJoinRequest = useCallback((request: ExpeditionJoinRequest, action: 'approve' | 'deny') => {
    if (!invite || reviewingRequestIds.includes(request.id) || !canReviewRequests) {
      return;
    }

    setReviewingRequestIds((current) => [...current, request.id]);
    const reviewedByUserId = identity.userId ?? invite.createdByUserId;
    const result = action === 'approve'
      ? expeditionInviteLocalAdapter.approveJoinRequest(request.id, reviewedByUserId)
      : expeditionInviteLocalAdapter.denyJoinRequest(request.id, reviewedByUserId);

    if (!result.ok) {
      showToast?.(result.reason);
      setReviewingRequestIds((current) => current.filter((id) => id !== request.id));
      return;
    }

    refreshPendingRequests(invite.id);
    if (result.state === 'approved') {
      recordExpeditionChannelMemberJoined(result.member);
      showToast?.(`${result.member.displayName} approved.`);
    } else {
      recordExpeditionChannelJoinRequestDenied(result.joinRequest, cadActor);
      showToast?.(`${result.joinRequest.displayName} denied.`);
    }

    setReviewingRequestIds((current) => current.filter((id) => id !== request.id));
  }, [
    canReviewRequests,
    cadActor,
    identity.userId,
    invite,
    refreshPendingRequests,
    reviewingRequestIds,
    showToast,
  ]);

  return (
    <DispatchActionPanel
      visible={visible}
      onClose={onClose}
      title="Expedition Channel Invite"
      icon="people-circle-outline"
    >
      <View style={styles.commandForm}>
        <View style={styles.inviteIntroCard}>
          <View style={styles.profilePreviewIcon}>
            <Ionicons name="people-circle-outline" size={21} color={TACTICAL.amber} />
          </View>
          <View style={styles.profilePreviewCopy}>
            <Text style={styles.profilePreviewEyebrow}>EXPEDITION CHANNEL</Text>
            <Text style={styles.profilePreviewName} numberOfLines={1}>{expeditionLabel}</Text>
            <Text style={styles.profilePreviewRig} numberOfLines={2}>
              {invite
                ? 'Connect team members to this expedition.'
                : expedition
                  ? 'Switch this expedition to Team mode to invite members.'
                  : 'No active expedition selected.'}
            </Text>
          </View>
        </View>

        {!expedition ? (
          <View style={styles.createExpeditionPanel}>
            <Text style={styles.modalSectionLabel}>Create Expedition</Text>
            <ProfileTextInput
              label="Expedition Name"
              value={createForm.expeditionName}
              onChangeText={(value) => updateCreateForm('expeditionName', value)}
            />
            <CommandTextInput
              label="Description / Mission Notes"
              value={createForm.description}
              onChangeText={(value) => updateCreateForm('description', value)}
            />
            <View style={styles.createExpeditionGrid}>
              <View style={styles.createExpeditionGridItem}>
                <ProfileTextInput
                  label="Team Leader"
                  value={createForm.leaderName}
                  onChangeText={(value) => updateCreateForm('leaderName', value)}
                />
              </View>
              <View style={styles.createExpeditionGridItem}>
                <ProfileTextInput
                  label="Callsign"
                  value={createForm.leaderCallsign}
                  onChangeText={(value) => updateCreateForm('leaderCallsign', value)}
                />
              </View>
            </View>
            <ProfileTextInput
              label="Starting Location"
              value={createForm.startLocation}
              onChangeText={(value) => updateCreateForm('startLocation', value)}
            />
            <View style={styles.createExpeditionGrid}>
              <View style={styles.createExpeditionGridItem}>
                <ProfileTextInput
                  label="Latitude"
                  value={createForm.latitude}
                  onChangeText={(value) => updateCreateForm('latitude', value)}
                />
              </View>
              <View style={styles.createExpeditionGridItem}>
                <ProfileTextInput
                  label="Longitude"
                  value={createForm.longitude}
                  onChangeText={(value) => updateCreateForm('longitude', value)}
                />
              </View>
            </View>
            <ProfileTextInput
              label="Destination / Area"
              value={createForm.destination}
              onChangeText={(value) => updateCreateForm('destination', value)}
            />
            <ProfileTextInput
              label="Area of Operation"
              value={createForm.areaOfOperation}
              onChangeText={(value) => updateCreateForm('areaOfOperation', value)}
            />
            <ProfileTextInput
              label="Date / Time"
              value={createForm.startDateTime}
              onChangeText={(value) => updateCreateForm('startDateTime', value)}
            />
            <CommandTextInput
              label="Radio / Comms Notes"
              value={createForm.commsNotes}
              onChangeText={(value) => updateCreateForm('commsNotes', value)}
            />
            <OptionGroup
              label="Privacy / Join Mode"
              options={[
                { label: 'Approval Required', value: 'approval_required' },
                { label: 'Open Join', value: 'open' },
              ]}
              value={createForm.joinMode}
              onSelect={(value) => updateCreateForm('joinMode', value)}
            />
            {createError ? (
              <Text style={styles.commandError}>{createError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.commandFooterButton, styles.commandSubmitButton, creatingExpedition ? styles.commandButtonDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel="Create expedition"
              disabled={creatingExpedition}
              onPress={handleCreateExpedition}
            >
              <Text style={styles.commandSubmitText}>{creatingExpedition ? 'Creating' : 'Create Expedition'}</Text>
            </TouchableOpacity>
          </View>
        ) : invite && status ? (
          <>
            <View style={styles.inviteStatusRow}>
              <View>
                <Text style={styles.commandFieldLabel}>Channel Status</Text>
                <Text style={styles.inviteExpirationText}>{getInviteExpirationLabel(invite, expedition)}</Text>
              </View>
              <View style={[styles.inviteStatusPill, { borderColor: `${statusTone}88` }]}>
                <View style={[styles.connectionDot, { backgroundColor: statusTone }]} />
                <Text style={[styles.inviteStatusText, { color: statusTone }]}>{status.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.inviteValueCard}>
              <View style={styles.inviteValueHeader}>
                <Text style={styles.commandFieldLabel}>Join Code</Text>
                {canCopy ? (
                  <TouchableOpacity
                    style={styles.inviteMiniButton}
                    accessibilityRole="button"
                    accessibilityLabel="Copy join code"
                    onPress={() => copyText(invite.joinCode, 'Join code')}
                  >
                    <Ionicons name="copy-outline" size={13} color={TACTICAL.text} />
                    <Text style={styles.inviteMiniButtonText}>Copy</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.inviteJoinCode}>{invite.joinCode}</Text>
            </View>

            <View style={styles.inviteValueCard}>
              <View style={styles.inviteValueHeader}>
                <Text style={styles.commandFieldLabel}>Share Link</Text>
                <View style={styles.inviteInlineActions}>
                  {canCopy ? (
                    <TouchableOpacity
                      style={styles.inviteMiniButton}
                      accessibilityRole="button"
                      accessibilityLabel="Copy invite link"
                      onPress={() => copyText(invite.inviteLink, 'Invite link')}
                    >
                      <Ionicons name="copy-outline" size={13} color={TACTICAL.text} />
                      <Text style={styles.inviteMiniButtonText}>Copy</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.inviteMiniButton}
                    accessibilityRole="button"
                    accessibilityLabel="Share invite link"
                    onPress={shareInvite}
                  >
                    <Ionicons name="share-social-outline" size={13} color={TACTICAL.text} />
                    <Text style={styles.inviteMiniButtonText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.inviteLinkText} numberOfLines={2}>{invite.inviteLink}</Text>
            </View>

            <View style={styles.inviteQrPanel}>
              <View style={styles.invitePlaceholderIcon}>
                <Ionicons name="qr-code-outline" size={19} color={TACTICAL.textMuted} />
              </View>
              <Text style={styles.invitePlaceholderTitle}>QR Code</Text>
              <Text style={styles.invitePlaceholderText}>
                QR display unavailable until QR renderer is configured.
              </Text>
            </View>

            <View style={styles.inviteToggleRow}>
              <View style={styles.invitePlaceholderCopy}>
                <Text style={styles.invitePlaceholderTitle}>Approval Required</Text>
                <Text style={styles.invitePlaceholderText}>
                  Host approval is required before new members join this expedition.
                </Text>
              </View>
              <Switch
                value={approvalRequired}
                onValueChange={updateApprovalRequired}
                trackColor={{ false: 'rgba(138,138,133,0.35)', true: 'rgba(212,160,23,0.42)' }}
                thumbColor={approvalRequired ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </View>

            <View style={styles.inviteValueCard}>
              <Text style={styles.commandFieldLabel}>Pending Requests</Text>
              {pendingRequests.length > 0 ? (
                pendingRequests.map((request) => (
                  <View key={request.id} style={styles.inviteRequestRow}>
                    <View style={styles.invitePlaceholderIcon}>
                      <Ionicons name="person-add-outline" size={15} color={TACTICAL.amber} />
                    </View>
                    <View style={styles.invitePlaceholderCopy}>
                      <Text style={styles.invitePlaceholderTitle} numberOfLines={1}>
                        {request.displayName}
                      </Text>
                      <Text style={styles.invitePlaceholderText} numberOfLines={1}>
                        {[request.callsign, request.requestedRole.toUpperCase(), formatInviteRequestTime(request.requestedAt)].filter(Boolean).join(' / ')}
                      </Text>
                    </View>
                    {canReviewRequests ? (
                      <View style={styles.inviteReviewActions}>
                        <TouchableOpacity
                          style={[styles.inviteReviewButton, styles.inviteApproveButton, reviewingRequestIds.includes(request.id) ? styles.commandButtonDisabled : null]}
                          accessibilityRole="button"
                          accessibilityLabel={`Approve ${request.displayName}`}
                          disabled={reviewingRequestIds.includes(request.id)}
                          onPress={() => reviewJoinRequest(request, 'approve')}
                        >
                          <Text style={styles.inviteReviewButtonText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inviteReviewButton, styles.inviteDenyButton, reviewingRequestIds.includes(request.id) ? styles.commandButtonDisabled : null]}
                          accessibilityRole="button"
                          accessibilityLabel={`Deny ${request.displayName}`}
                          disabled={reviewingRequestIds.includes(request.id)}
                          onPress={() => reviewJoinRequest(request, 'deny')}
                        >
                          <Text style={[styles.inviteReviewButtonText, styles.inviteDenyButtonText]}>Deny</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.inviteDisabledPill}>
                        <Text style={styles.inviteDisabledText}>Read Only</Text>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.inviteEmptyText}>No pending join requests.</Text>
              )}
            </View>
          </>
        ) : (
          <View style={styles.invitePlaceholderRow}>
            <View style={styles.invitePlaceholderIcon}>
              <Ionicons name={expedition ? 'people-outline' : 'trail-sign-outline'} size={16} color={TACTICAL.textMuted} />
            </View>
            <View style={styles.invitePlaceholderCopy}>
              <Text style={styles.invitePlaceholderTitle}>
                {expedition ? 'Team mode required' : 'No active expedition selected'}
              </Text>
              <Text style={styles.invitePlaceholderText}>
                {expedition
                  ? 'Switch this expedition to Team mode to invite members.'
                  : 'Start or select an active expedition before creating an Expedition Channel invite.'}
              </Text>
              {expedition ? (
                <TouchableOpacity
                  style={styles.inviteMiniButton}
                  accessibilityRole="button"
                  accessibilityLabel="Create team channel"
                  onPress={handleEnableTeamMode}
                >
                  <Ionicons name="people-outline" size={13} color={TACTICAL.text} />
                  <Text style={styles.inviteMiniButtonText}>Create Team Channel</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </DispatchActionPanel>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: CommandOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.commandFieldLabel}>{label}</Text>
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, selected ? styles.optionChipSelected : null]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onSelect(option.value)}
            >
              <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CommandTextInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.commandFieldLabel}>{label}</Text>
      <TextInput
        style={styles.commandInput}
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

function ProfileTextInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.commandFieldLabel}>{label}</Text>
      <TextInput
        style={styles.profileInput}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="words"
        textAlignVertical="center"
      />
    </View>
  );
}

function MoreActionsModal({
  visible,
  recoveryAssistSubmitting,
  onClose,
  onRecoveryAssist,
  onSelect,
}: {
  visible: boolean;
  recoveryAssistSubmitting: boolean;
  onClose: () => void;
  onRecoveryAssist: () => void;
  onSelect: (command: DispatchCommandType) => void;
}) {
  return (
    <DispatchActionPanel
      visible={visible}
      onClose={onClose}
      title="Dispatch Actions"
      icon="ellipsis-horizontal-circle-outline"
    >
      <View style={styles.moreActions}>
        <TouchableOpacity
          style={[
            styles.moreActionButton,
            styles.recoveryAssistButton,
            recoveryAssistSubmitting ? styles.commandButtonDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Recovery Assist"
          disabled={recoveryAssistSubmitting}
          onPress={onRecoveryAssist}
        >
          <Ionicons name="radio-outline" size={16} color={TACTICAL.danger} />
          <Text style={[styles.moreActionText, styles.recoveryAssistText]}>
            {recoveryAssistSubmitting ? 'Getting GPS...' : 'Recovery Assist'}
          </Text>
        </TouchableOpacity>
        {[
          { label: 'Hazard', command: 'hazard' as const, icon: 'warning-outline' as const },
          { label: 'Resource', command: 'resource' as const, icon: 'cube-outline' as const },
        ].map((item) => (
          <TouchableOpacity
            key={item.command}
            style={styles.moreActionButton}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => onSelect(item.command)}
          >
            <Ionicons name={item.icon} size={16} color={TACTICAL.amber} />
            <Text style={styles.moreActionText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </DispatchActionPanel>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 7,
  },
  headerStrip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.4,
    flexShrink: 0,
  },
  channel: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  profileButton: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 7,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 8,
  },
  profileButtonText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connectionText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  liveStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  rolloutNotice: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  rolloutNoticeText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 13,
  },
  liveChip: {
    width: '32%',
    minHeight: 62,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.shellBorder,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 6,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  liveChipDisabled: {
    opacity: 0.52,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
  },
  liveChipTextDisabled: {
    color: TACTICAL.textMuted,
  },
  channelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  channelStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveChipLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  liveChipValue: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 1,
  },
  channelDetail: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 1,
  },
  channelActionLabel: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.45,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  channelActionLabelDisabled: {
    color: TACTICAL.textMuted,
  },
  advisoryLine: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.shellBorder,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
    borderRadius: 8,
    paddingLeft: 9,
    paddingRight: 5,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  advisoryLabel: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  advisoryText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
  },
  advisoryDismiss: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedPanel: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.shellBorder,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
    borderRadius: 9,
    overflow: 'hidden',
  },
  feedHeader: {
    minHeight: 38,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: ECS_POPUP_SURFACE_DARK.divider,
    backgroundColor: ECS_POPUP_SURFACE_DARK.headerBg,
  },
  feedTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  feedSource: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  feedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedCount: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  clearCadButton: {
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  clearCadButtonDisabled: {
    opacity: 0.44,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  clearCadButtonText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  clearCadButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    padding: 7,
    paddingBottom: 8,
  },
  feedContentEmpty: {
    flexGrow: 1,
  },
  emptyFeed: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyFeedTitle: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    fontWeight: '900',
  },
  feedSeparator: {
    height: 6,
  },
  commandRail: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 5,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.shellBorder,
    borderRadius: 9,
    backgroundColor: ECS_POPUP_SURFACE_DARK.footerBg,
    padding: 5,
    overflow: 'hidden',
  },
  commandButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 8,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 4,
  },
  commandButtonInactive: {
    borderColor: 'rgba(138,138,133,0.28)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    opacity: 0.68,
  },
  recoveryCommandButton: {
    borderColor: `${TACTICAL.danger}88`,
    backgroundColor: `${TACTICAL.danger}22`,
  },
  moreCommandButton: {
    borderColor: 'rgba(196,138,44,0.34)',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  commandButtonText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  commandButtonTextInactive: {
    color: TACTICAL.textMuted,
  },
  commandButtonReason: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  recoveryCommandButtonText: {
    color: TACTICAL.danger,
  },
  eventRow: {
    flexDirection: 'row',
    minHeight: 86,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 8,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    overflow: 'hidden',
  },
  eventRowCritical: {
    borderColor: 'rgba(192,57,43,0.55)',
  },
  eventRowRecoveryCritical: {
    borderColor: `${TACTICAL.danger}99`,
    backgroundColor: `${TACTICAL.danger}12`,
  },
  eventRail: {
    width: 3,
  },
  eventBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eventIcon: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
  },
  eventType: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  severityLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  eventTopSpacer: {
    flex: 1,
  },
  eventTime: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  eventTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  eventSummary: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  recoveryEventSummary: {
    color: TACTICAL.text,
    fontWeight: '800',
  },
  eventBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eventIdentityPill: {
    maxWidth: '58%',
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    borderRadius: 6,
    backgroundColor: 'rgba(212,160,23,0.06)',
    paddingHorizontal: 6,
  },
  eventIdentityText: {
    flexShrink: 1,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  eventStatus: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  recoveryLocationLabel: {
    color: TACTICAL.danger,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  recoverySyncLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  recoverySyncFailed: {
    color: TACTICAL.danger,
  },
  contextLabel: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  mapLabel: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  actionPanelModalScroll: {
    minHeight: 0,
  },
  actionPanelModalContent: {
    padding: 12,
    paddingBottom: 18,
  },
  modalStack: {
    gap: 10,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  modalMetaItem: {
    width: '48%',
    minHeight: 42,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  modalMetaLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalMetaValue: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  modalSectionLabel: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  modalDetailsPanel: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 10,
    gap: 7,
  },
  modalDetails: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  modalFactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
  },
  modalFactLabel: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalFactValue: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  coordinateValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    letterSpacing: 0.2,
  },
  notesPanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 9,
    gap: 6,
  },
  noteText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  emptyNoteText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  actionsPanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 9,
    gap: 7,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  detailActionButton: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  mapActionButton: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  detailActionText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  navigateAssistButton: {
    flexBasis: '100%',
    borderColor: `${TACTICAL.danger}99`,
    backgroundColor: `${TACTICAL.danger}24`,
  },
  navigateAssistText: {
    color: TACTICAL.danger,
  },
  recoveryPinPanel: {
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}55`,
    borderRadius: 9,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    overflow: 'hidden',
  },
  recoveryPinHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: ECS_POPUP_SURFACE_DARK.divider,
    backgroundColor: ECS_POPUP_SURFACE_DARK.headerBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recoveryPinHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  recoveryPinEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  recoveryPinTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
  },
  recoveryPinStatus: {
    color: TACTICAL.danger,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  recoveryPinMapPreview: {
    height: 188,
    minHeight: 148,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
  },
  recoveryPinFallback: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
  },
  recoveryPinFallbackTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  recoveryPinFallbackCopy: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  recoveryPinFactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: ECS_POPUP_SURFACE_DARK.divider,
    padding: 9,
  },
  recoveryPinFact: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 46,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 8,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  recoveryPinFactLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  recoveryPinFactValue: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  threatScreen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: 'transparent',
  },
  threatModalBody: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  threatHeader: {
    minHeight: 78,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(8,12,15,0.98)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  threatHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  threatEyebrow: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  threatTitle: {
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  threatSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  threatClose: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  threatMapPanel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#070B0E',
  },
  threatWebView: {
    flex: 1,
    backgroundColor: '#070B0E',
  },
  threatMapUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: '#070B0E',
  },
  threatUnavailableTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  threatUnavailableCopy: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  threatInfoPanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(8,12,15,0.98)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  threatInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  threatInfoLabel: {
    width: 110,
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  threatInfoValue: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
  },
  threatMessage: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  threatActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingTop: 2,
  },
  threatActionButton: {
    minHeight: 38,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  threatSecondaryButton: {
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  threatActionText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  commandForm: {
    gap: 12,
  },
  optionGroup: {
    gap: 6,
  },
  commandFieldLabel: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  optionChip: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  optionChipSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  optionChipText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  optionChipTextSelected: {
    color: TACTICAL.text,
  },
  commandInput: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: TACTICAL.text,
    backgroundColor: 'rgba(0,0,0,0.18)',
    fontSize: 13,
    fontWeight: '700',
  },
  profileInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TACTICAL.text,
    backgroundColor: 'rgba(0,0,0,0.18)',
    fontSize: 13,
    fontWeight: '800',
  },
  profilePreviewCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.07)',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  profilePreviewIcon: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  profilePreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  profilePreviewEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  profilePreviewName: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  profilePreviewRig: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 2,
  },
  profileRigPanel: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
  },
  profileRequiredNotice: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.34)',
    borderRadius: 9,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  profileRequiredText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  profileValidationText: {
    color: TACTICAL.danger,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
  },
  profileRigRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
  },
  profileRigText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  profileEmptyRig: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  profileEmptyRigCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileEmptyRigTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  profileEmptyRigText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  inviteIntroCard: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.07)',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  createExpeditionPanel: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
  },
  createExpeditionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  createExpeditionGridItem: {
    flex: 1,
    minWidth: 0,
  },
  inviteStatusRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  inviteStatusText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  inviteExpirationText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  inviteValueCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inviteValueHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inviteInlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inviteMiniButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
  },
  inviteMiniButtonText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  inviteJoinCode: {
    color: TACTICAL.amber,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  inviteLinkText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  inviteQrPanel: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(138,138,133,0.34)',
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inviteToggleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  invitePlaceholderStack: {
    gap: 8,
  },
  invitePlaceholderRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    opacity: 0.78,
  },
  invitePlaceholderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.22)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  invitePlaceholderCopy: {
    flex: 1,
    minWidth: 0,
  },
  invitePlaceholderTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  invitePlaceholderText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  inviteDisabledPill: {
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.3)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  inviteDisabledText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inviteRequestRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(138,138,133,0.14)',
    paddingTop: 8,
  },
  inviteReviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inviteReviewButton: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 7,
  },
  inviteApproveButton: {
    borderColor: 'rgba(212,160,23,0.68)',
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  inviteDenyButton: {
    borderColor: 'rgba(192,57,43,0.52)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  inviteReviewButtonText: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inviteDenyButtonText: {
    color: TACTICAL.danger,
  },
  inviteEmptyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  toggleRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  toggleLabel: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
  },
  safetyCopy: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  recoveryCriticalNotice: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}88`,
    borderRadius: 8,
    backgroundColor: `${TACTICAL.danger}18`,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  recoveryCriticalLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  recoveryCriticalValue: {
    color: TACTICAL.danger,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  commandError: {
    color: TACTICAL.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  commandFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  commandFooterButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  commandFooterButtonFull: {
    flex: 1,
  },
  commandCancelButton: {
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  commandSubmitButton: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  recoverySubmitButton: {
    borderColor: `${TACTICAL.danger}88`,
    backgroundColor: `${TACTICAL.danger}22`,
  },
  commandButtonDisabled: {
    opacity: 0.55,
  },
  commandCancelText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  commandSubmitText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  recoverySubmitText: {
    color: TACTICAL.danger,
  },
  moreActions: {
    gap: 8,
  },
  moreActionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
  },
  recoveryAssistButton: {
    borderColor: `${TACTICAL.danger}88`,
    backgroundColor: 'rgba(255,78,78,0.1)',
  },
  moreActionText: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  recoveryAssistText: {
    color: TACTICAL.danger,
  },
});
