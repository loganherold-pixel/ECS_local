import type { SourceTruthRef } from './sourceTruth';
import type { MissionCommand } from './dispatchMissionCommandTypes';
import type {
  DispatchLinkedContext,
  DispatchPriority,
  DispatchQueuedOfflineAction,
} from './dispatchTypes';

export const MISSION_CLOCK_SCHEMA_VERSION = 1 as const;

const MINUTE_MS = 60_000;
const ABSOLUTE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

export type MissionClockDeadlineSource =
  | 'command_deadline'
  | 'acknowledgment_deadline'
  | 'scheduled_check_in'
  | 'no_response_review'
  | 'rally_deadline'
  | 'camp_diversion_cutoff'
  | 'safe_arrival_deadline'
  | 'sunset_deadline'
  | 'weather_recheck'
  | 'offline_retry'
  | 'expedition_milestone'
  | 'incident_review'
  | 'vehicle_status_review'
  | 'custom';

export type MissionClockDeadlineStatus =
  | 'scheduled'
  | 'due_soon'
  | 'due'
  | 'overdue'
  | 'completed'
  | 'cancelled'
  | 'unavailable';

export type MissionClockCompletionState = 'active' | 'completed' | 'cancelled';

export type MissionClockLinkedContextType =
  | DispatchLinkedContext['type']
  | 'command'
  | 'weather'
  | 'expedition_milestone'
  | 'offline_action';

export interface MissionClockLinkedContext {
  id: string;
  type: MissionClockLinkedContextType;
  label: string;
  restricted: boolean;
}

export interface MissionClockSuggestedAction {
  code: string;
  label: string;
}

export interface MissionClockDeadlineInput {
  schemaVersion: 1;
  id: string;
  expeditionId: string;
  source: MissionClockDeadlineSource;
  title: string;
  reason: string;
  dueAt: string | null;
  warningWindowMs: number;
  criticalWindowMs: number;
  priority: DispatchPriority;
  linkedCommandId?: string;
  linkedContext?: MissionClockLinkedContext;
  sourceTruth: SourceTruthRef[];
  completionState: MissionClockCompletionState;
  completedAt?: string;
  cancelledAt?: string;
  updatedAt?: string;
  suggestedAction?: MissionClockSuggestedAction;
}

export interface MissionClockDeadline extends MissionClockDeadlineInput {
  status: MissionClockDeadlineStatus;
  dueAtMs: number | null;
  deltaMs: number | null;
  nextTransitionAtMs: number | null;
  issueCodes: string[];
}

export interface MissionClockSnapshot {
  schemaVersion: 1;
  nowMs: number;
  nowIso: string;
  deadlines: MissionClockDeadline[];
  active: MissionClockDeadline[];
  completed: MissionClockDeadline[];
  cancelled: MissionClockDeadline[];
  unavailable: MissionClockDeadline[];
  overdue: MissionClockDeadline[];
  dueSoon: MissionClockDeadline[];
  decisionSoon: MissionClockDeadline[];
  next: MissionClockDeadline | null;
  nextCheckIn: MissionClockDeadline | null;
  nextOperationalCutoff: MissionClockDeadline | null;
  nextTransitionAtMs: number | null;
}

export interface CreateMissionClockDeadlineInput extends Omit<
  MissionClockDeadlineInput,
  'schemaVersion' | 'warningWindowMs' | 'criticalWindowMs' | 'completionState' | 'priority'
> {
  warningWindowMs?: number;
  criticalWindowMs?: number;
  completionState?: MissionClockCompletionState;
  priority?: DispatchPriority;
}

export interface CollectMissionClockDeadlinesInput {
  expeditionId: string;
  commands: MissionCommand[];
  offlineActions?: DispatchQueuedOfflineAction[];
  additionalDeadlines?: MissionClockDeadlineInput[];
}

export const MISSION_CLOCK_DEADLINE_WINDOWS: Record<
  MissionClockDeadlineSource,
  { warningWindowMs: number; criticalWindowMs: number }
> = {
  command_deadline: { warningWindowMs: 30 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
  acknowledgment_deadline: { warningWindowMs: 15 * MINUTE_MS, criticalWindowMs: 2 * MINUTE_MS },
  scheduled_check_in: { warningWindowMs: 15 * MINUTE_MS, criticalWindowMs: 2 * MINUTE_MS },
  no_response_review: { warningWindowMs: 10 * MINUTE_MS, criticalWindowMs: 2 * MINUTE_MS },
  rally_deadline: { warningWindowMs: 20 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
  camp_diversion_cutoff: { warningWindowMs: 60 * MINUTE_MS, criticalWindowMs: 15 * MINUTE_MS },
  safe_arrival_deadline: { warningWindowMs: 60 * MINUTE_MS, criticalWindowMs: 15 * MINUTE_MS },
  sunset_deadline: { warningWindowMs: 60 * MINUTE_MS, criticalWindowMs: 15 * MINUTE_MS },
  weather_recheck: { warningWindowMs: 30 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
  offline_retry: { warningWindowMs: 5 * MINUTE_MS, criticalWindowMs: MINUTE_MS },
  expedition_milestone: { warningWindowMs: 60 * MINUTE_MS, criticalWindowMs: 15 * MINUTE_MS },
  incident_review: { warningWindowMs: 15 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
  vehicle_status_review: { warningWindowMs: 15 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
  custom: { warningWindowMs: 30 * MINUTE_MS, criticalWindowMs: 5 * MINUTE_MS },
};

const ACTIVE_STATUSES = new Set<MissionClockDeadlineStatus>([
  'scheduled',
  'due_soon',
  'due',
  'overdue',
]);

const CHECK_IN_SOURCES = new Set<MissionClockDeadlineSource>([
  'scheduled_check_in',
  'no_response_review',
  'acknowledgment_deadline',
]);

const OPERATIONAL_CUTOFF_SOURCES = new Set<MissionClockDeadlineSource>([
  'rally_deadline',
  'camp_diversion_cutoff',
  'safe_arrival_deadline',
  'sunset_deadline',
  'weather_recheck',
  'expedition_milestone',
  'incident_review',
  'vehicle_status_review',
]);

const STATUS_SORT_ORDER: Record<MissionClockDeadlineStatus, number> = {
  overdue: 0,
  due: 0,
  due_soon: 0,
  scheduled: 0,
  unavailable: 1,
  completed: 2,
  cancelled: 3,
};

export function createMissionClockDeadline(
  input: CreateMissionClockDeadlineInput,
): MissionClockDeadlineInput {
  const defaults = MISSION_CLOCK_DEADLINE_WINDOWS[input.source];
  return {
    ...input,
    schemaVersion: MISSION_CLOCK_SCHEMA_VERSION,
    warningWindowMs: input.warningWindowMs ?? defaults.warningWindowMs,
    criticalWindowMs: input.criticalWindowMs ?? defaults.criticalWindowMs,
    completionState: input.completionState ?? 'active',
    priority: input.priority ?? 'normal',
    sourceTruth: [...input.sourceTruth],
  };
}

export function evaluateMissionClockDeadline(
  input: MissionClockDeadlineInput,
  now: number | Date | string = Date.now(),
): MissionClockDeadline {
  const nowMs = normalizeNow(now);
  const dueAtMs = parseAbsoluteTimestamp(input.dueAt);
  const issueCodes: string[] = [];

  if (input.completionState === 'completed') {
    return terminalDeadline(input, 'completed', dueAtMs);
  }
  if (input.completionState === 'cancelled') {
    return terminalDeadline(input, 'cancelled', dueAtMs);
  }
  if (!input.id.trim()) issueCodes.push('mission_clock_id_missing');
  if (!input.expeditionId.trim()) issueCodes.push('mission_clock_expedition_missing');
  if (dueAtMs == null) issueCodes.push(input.dueAt ? 'mission_clock_due_at_invalid' : 'mission_clock_due_at_missing');
  if (input.sourceTruth.length === 0) issueCodes.push('mission_clock_source_missing');
  if (!isValidWindow(input.warningWindowMs, input.criticalWindowMs)) {
    issueCodes.push('mission_clock_window_invalid');
  }

  if (issueCodes.length > 0 || dueAtMs == null) {
    return {
      ...input,
      status: 'unavailable',
      dueAtMs,
      deltaMs: dueAtMs == null ? null : dueAtMs - nowMs,
      nextTransitionAtMs: null,
      issueCodes,
    };
  }

  const deltaMs = dueAtMs - nowMs;
  let status: MissionClockDeadlineStatus;
  if (deltaMs < 0) status = 'overdue';
  else if (deltaMs <= input.criticalWindowMs) status = 'due';
  else if (deltaMs <= input.warningWindowMs) status = 'due_soon';
  else status = 'scheduled';

  return {
    ...input,
    status,
    dueAtMs,
    deltaMs,
    nextTransitionAtMs: selectNextTransitionAt(input, dueAtMs, nowMs),
    issueCodes,
  };
}

export function buildMissionClockSnapshot(
  inputs: MissionClockDeadlineInput[],
  now: number | Date | string = Date.now(),
): MissionClockSnapshot {
  const nowMs = normalizeNow(now);
  const deadlines = dedupeDeadlineInputs(inputs)
    .map((deadline) => evaluateMissionClockDeadline(deadline, nowMs))
    .sort(compareDeadlines);
  const active = deadlines.filter((deadline) => ACTIVE_STATUSES.has(deadline.status));
  const completed = deadlines.filter((deadline) => deadline.status === 'completed');
  const cancelled = deadlines.filter((deadline) => deadline.status === 'cancelled');
  const unavailable = deadlines.filter((deadline) => deadline.status === 'unavailable');
  const overdue = active.filter((deadline) => deadline.status === 'overdue');
  const dueSoon = active.filter((deadline) => deadline.status === 'due_soon' || deadline.status === 'due');
  const decisionSoon = active.filter((deadline) => (
    deadline.status !== 'scheduled' && deadline.source !== 'offline_retry'
  ));
  const nextTransitionAtMs = active.reduce<number | null>((selected, deadline) => {
    if (deadline.nextTransitionAtMs == null) return selected;
    return selected == null || deadline.nextTransitionAtMs < selected
      ? deadline.nextTransitionAtMs
      : selected;
  }, null);

  return {
    schemaVersion: MISSION_CLOCK_SCHEMA_VERSION,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    deadlines,
    active,
    completed,
    cancelled,
    unavailable,
    overdue,
    dueSoon,
    decisionSoon,
    next: active[0] ?? null,
    nextCheckIn: active.find((deadline) => CHECK_IN_SOURCES.has(deadline.source)) ?? null,
    nextOperationalCutoff: active.find((deadline) => OPERATIONAL_CUTOFF_SOURCES.has(deadline.source)) ?? null,
    nextTransitionAtMs,
  };
}

export function collectMissionClockDeadlines(
  input: CollectMissionClockDeadlinesInput,
): MissionClockDeadlineInput[] {
  const commandDeadlines = input.commands
    .filter((command) => command.expeditionId === input.expeditionId)
    .map(missionClockDeadlineFromCommand)
    .filter((deadline): deadline is MissionClockDeadlineInput => deadline != null);
  const offlineDeadlines = (input.offlineActions ?? [])
    .map((action) => missionClockDeadlineFromOfflineAction(input.expeditionId, action))
    .filter((deadline): deadline is MissionClockDeadlineInput => deadline != null);
  const additionalDeadlines = (input.additionalDeadlines ?? [])
    .filter((deadline) => deadline.expeditionId === input.expeditionId);
  return dedupeDeadlineInputs([
    ...commandDeadlines,
    ...offlineDeadlines,
    ...additionalDeadlines,
  ]);
}

export function missionClockDeadlineFromCommand(
  command: MissionCommand,
): MissionClockDeadlineInput | null {
  if (!command.deadlineAt) return null;
  const source = commandDeadlineSource(command);
  const completionState = command.operationalState === 'cancelled'
    ? 'cancelled'
    : command.operationalState === 'resolved' || command.operationalState === 'expired'
      ? 'completed'
      : 'active';
  return createMissionClockDeadline({
    id: `mission-clock:command:${command.id}`,
    expeditionId: command.expeditionId,
    source,
    title: command.title,
    reason: commandDeadlineReason(command, source),
    dueAt: command.deadlineAt,
    priority: command.priority,
    linkedCommandId: command.id,
    linkedContext: command.linkedContext
      ? safeMissionClockLinkedContext(command.linkedContext)
      : { id: command.id, type: 'command', label: command.title, restricted: false },
    sourceTruth: command.sourceTruth,
    completionState,
    completedAt: completionState === 'completed'
      ? command.resolution?.occurredAt ?? command.updatedAt
      : undefined,
    cancelledAt: completionState === 'cancelled'
      ? command.resolution?.occurredAt ?? command.updatedAt
      : undefined,
    updatedAt: command.updatedAt,
    suggestedAction: {
      code: 'open_linked_command',
      label: 'Open command and review the next explicit action',
    },
  });
}

export function missionClockDeadlineFromOfflineAction(
  expeditionId: string,
  action: DispatchQueuedOfflineAction,
): MissionClockDeadlineInput | null {
  if (!action.nextAttemptAt) return null;
  const completionState = action.status === 'cancelled'
    ? 'cancelled'
    : action.status === 'replayed'
      ? 'completed'
      : 'active';
  const observedAt = action.updatedAt ?? action.createdAt;
  return createMissionClockDeadline({
    id: `mission-clock:offline:${action.id}`,
    expeditionId,
    source: 'offline_retry',
    title: `Retry ${formatEntityType(action.entityType)}`,
    reason: 'A locally queued Dispatch action has reached its next delivery retry window.',
    dueAt: action.nextAttemptAt,
    priority: action.status === 'failed' ? 'high' : 'normal',
    linkedContext: {
      id: action.sourceEntityId ?? action.id,
      type: 'offline_action',
      label: `Queued ${formatEntityType(action.entityType)}`,
      restricted: false,
    },
    sourceTruth: [offlineActionSourceTruth(action, observedAt)],
    completionState,
    completedAt: action.replayedAt,
    cancelledAt: completionState === 'cancelled' ? observedAt : undefined,
    updatedAt: observedAt,
    suggestedAction: {
      code: 'review_offline_outbox',
      label: 'Review the offline outbox and retry explicitly when connectivity permits',
    },
  });
}

export function formatMissionClockCountdown(deadline: MissionClockDeadline | null): string {
  if (!deadline) return 'NO ACTIVE';
  if (deadline.status === 'completed') return 'COMPLETED';
  if (deadline.status === 'cancelled') return 'CANCELLED';
  if (deadline.status === 'unavailable' || deadline.deltaMs == null) return 'TIME UNKNOWN';
  if (deadline.status === 'due') return 'DUE NOW';
  const duration = formatCompactDuration(Math.abs(deadline.deltaMs));
  if (deadline.status === 'overdue') return `OVERDUE ${duration}`;
  return duration;
}

export function formatMissionClockStatus(status: MissionClockDeadlineStatus): string {
  switch (status) {
    case 'scheduled': return 'Scheduled';
    case 'due_soon': return 'Due Soon';
    case 'due': return 'Due';
    case 'overdue': return 'Overdue';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'unavailable': return 'Unavailable';
  }
}

export function formatMissionClockSource(source: MissionClockDeadlineSource): string {
  switch (source) {
    case 'command_deadline': return 'Command deadline';
    case 'acknowledgment_deadline': return 'Acknowledgment deadline';
    case 'scheduled_check_in': return 'Scheduled check-in';
    case 'no_response_review': return 'No-response review';
    case 'rally_deadline': return 'Rally deadline';
    case 'camp_diversion_cutoff': return 'Camp diversion cutoff';
    case 'safe_arrival_deadline': return 'Safe-arrival deadline';
    case 'sunset_deadline': return 'Sunset deadline';
    case 'weather_recheck': return 'Weather recheck';
    case 'offline_retry': return 'Offline retry';
    case 'expedition_milestone': return 'Expedition milestone';
    case 'incident_review': return 'Incident review';
    case 'vehicle_status_review': return 'Vehicle status review';
    case 'custom': return 'Operational deadline';
  }
}

function terminalDeadline(
  input: MissionClockDeadlineInput,
  status: Extract<MissionClockDeadlineStatus, 'completed' | 'cancelled'>,
  dueAtMs: number | null,
): MissionClockDeadline {
  return {
    ...input,
    status,
    dueAtMs,
    deltaMs: null,
    nextTransitionAtMs: null,
    issueCodes: [],
  };
}

function commandDeadlineSource(command: MissionCommand): MissionClockDeadlineSource {
  if (command.type === 'check_in') {
    return command.operationalState === 'blocked' || command.acknowledgmentState === 'expired'
      ? 'no_response_review'
      : 'scheduled_check_in';
  }
  if (command.type === 'rally') return 'rally_deadline';
  if (command.acknowledgmentState === 'pending' || command.acknowledgmentState === 'partial') {
    return 'acknowledgment_deadline';
  }
  return 'command_deadline';
}

function commandDeadlineReason(
  command: MissionCommand,
  source: MissionClockDeadlineSource,
): string {
  if (source === 'scheduled_check_in') {
    return command.acknowledgmentState === 'pending' || command.acknowledgmentState === 'partial'
      ? 'The requested team check-in is awaiting required responses.'
      : 'The scheduled check-in reaches its review time.';
  }
  if (source === 'no_response_review') {
    return 'The check-in has no complete response and requires an explicit operator review.';
  }
  if (source === 'rally_deadline') return 'The rally command reaches its stated arrival or response deadline.';
  if (source === 'acknowledgment_deadline') return 'Required command acknowledgments are not yet complete.';
  return 'The Mission Command reaches its explicit operational deadline.';
}

function safeMissionClockLinkedContext(context: DispatchLinkedContext): MissionClockLinkedContext {
  return {
    id: context.id,
    type: context.type,
    label: context.restricted ? 'Restricted context' : context.title,
    restricted: context.restricted === true,
  };
}

function offlineActionSourceTruth(
  action: DispatchQueuedOfflineAction,
  observedAt: string,
): SourceTruthRef {
  return {
    id: `mission-clock-source:offline:${action.id}`,
    origin: 'cached',
    role: 'primary',
    authority: 'ECS local Dispatch outbox',
    authorityKind: 'ecs',
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['offline_delivery_pending'],
  };
}

function selectNextTransitionAt(
  input: MissionClockDeadlineInput,
  dueAtMs: number,
  nowMs: number,
): number | null {
  const candidates = [
    dueAtMs - input.warningWindowMs,
    dueAtMs - input.criticalWindowMs,
    dueAtMs,
  ].filter((candidate) => candidate > nowMs);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function compareDeadlines(left: MissionClockDeadline, right: MissionClockDeadline): number {
  const statusDelta = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
  if (statusDelta !== 0) return statusDelta;
  const leftTime = left.dueAtMs ?? Number.POSITIVE_INFINITY;
  const rightTime = right.dueAtMs ?? Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.id.localeCompare(right.id);
}

function dedupeDeadlineInputs(inputs: MissionClockDeadlineInput[]): MissionClockDeadlineInput[] {
  const byId = new Map<string, MissionClockDeadlineInput>();
  for (const input of inputs) {
    const current = byId.get(input.id);
    if (!current || compareUpdatedAt(input.updatedAt, current.updatedAt) > 0) byId.set(input.id, input);
  }
  return Array.from(byId.values());
}

function compareUpdatedAt(left: string | undefined, right: string | undefined): number {
  const leftMs = parseAbsoluteTimestamp(left) ?? Number.NEGATIVE_INFINITY;
  const rightMs = parseAbsoluteTimestamp(right) ?? Number.NEGATIVE_INFINITY;
  return leftMs - rightMs;
}

function isValidWindow(warningWindowMs: number, criticalWindowMs: number): boolean {
  return Number.isFinite(warningWindowMs)
    && Number.isFinite(criticalWindowMs)
    && warningWindowMs >= criticalWindowMs
    && criticalWindowMs >= 0;
}

function parseAbsoluteTimestamp(value: string | null | undefined): number | null {
  if (!value || !ABSOLUTE_TIMESTAMP_PATTERN.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNow(value: number | Date | string): number {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatCompactDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.ceil(durationMs / MINUTE_MS));
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder > 0 ? `${hours}H ${remainder}M` : `${hours}H`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}D ${remainingHours}H` : `${days}D`;
}

function formatEntityType(value: DispatchQueuedOfflineAction['entityType']): string {
  return value.replace(/_/g, ' ');
}
