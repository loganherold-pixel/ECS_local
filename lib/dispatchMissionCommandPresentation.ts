import { selectMissionCommandBoard } from './dispatchMissionCommandDomain';
import {
  buildMissionClockSnapshot,
  evaluateMissionClockDeadline,
  missionClockDeadlineFromCommand,
} from './dispatchMissionClock';
import type {
  MissionCommand,
  MissionCommandBoardBucket,
  MissionCommandDeliveryState,
  MissionCommandEvent,
  MissionCommandOperationalState,
  MissionCommandTarget,
  MissionCommandType,
} from './dispatchMissionCommandTypes';
import { selectSourceTruthStatusPresentation } from './sourceTruthPresentation';
import type { DispatchPriority } from './dispatchTypes';

export type MissionCommandBoardSectionId = MissionCommandBoardBucket;

export type MissionCommandBoardActionId =
  | 'stage'
  | 'activate'
  | 'start'
  | 'resume'
  | 'block'
  | 'resolve'
  | 'cancel'
  | 'reassign'
  | 'request_follow_up'
  | 'retry_delivery'
  | 'view_context';

export type MissionCommandDeadlineState = 'none' | 'upcoming' | 'due_soon' | 'overdue';

export type MissionCommandBoardDegradedState =
  | 'feature_disabled'
  | 'permission_restricted'
  | 'no_active_expedition'
  | 'solo'
  | 'offline'
  | 'realtime_unavailable'
  | 'empty';

export interface MissionCommandBoardActionModel {
  id: MissionCommandBoardActionId;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
}

export interface MissionCommandCardPresentation {
  key: string;
  commandId: string;
  bucket: MissionCommandBoardBucket;
  priority: DispatchPriority;
  priorityLabel: string;
  typeLabel: string;
  title: string;
  operationalLabel: string;
  targetLabel: string;
  assignmentLabel: string | null;
  acknowledgmentLabel: string;
  acknowledgmentComplete: number;
  acknowledgmentRequired: number;
  deadlineAt: string | null;
  deadlineLabel: string;
  deadlineState: MissionCommandDeadlineState;
  linkedContextLabel: string | null;
  linkedContextRestricted: boolean;
  sourceLabel: string;
  sourceFreshnessLabel: string;
  sourceConfidenceLabel: string;
  deliveryState: MissionCommandDeliveryState;
  deliveryLabel: string;
  recommendedActionLabel: string;
  allowedActions: MissionCommandBoardActionModel[];
  updatedAt: string;
  lastUpdateLabel: string;
  accessibilityLabel: string;
  command: MissionCommand;
}

export interface MissionCommandBoardSectionPresentation {
  id: MissionCommandBoardSectionId;
  title: string;
  emptyLabel: string;
  items: MissionCommandCardPresentation[];
  totalCount: number;
  hasMore: boolean;
}

export interface MissionCommandBoardSummaryPresentation {
  openCount: number;
  awaitingAcknowledgmentCount: number;
  decisionRequiredCount: number;
  nextDeadlineAt: string | null;
  nextDeadlineTitle: string | null;
  convoyLabel: string;
  connectionLabel: string;
}

export interface MissionCommandBoardNotice {
  kind: 'migration_recovered' | 'offline' | 'realtime_unavailable' | 'solo';
  label: string;
}

export interface MissionCommandBoardPresentation {
  summary: MissionCommandBoardSummaryPresentation;
  sections: {
    needsDecision: MissionCommandBoardSectionPresentation;
    awaitingAcknowledgment: MissionCommandBoardSectionPresentation;
    inProgress: MissionCommandBoardSectionPresentation;
    resolved: MissionCommandBoardSectionPresentation;
  };
  visibleCommandCount: number;
  degradedState: {
    kind: MissionCommandBoardDegradedState;
    title: string;
    detail: string;
  } | null;
  notices: MissionCommandBoardNotice[];
}

export interface BuildMissionCommandBoardPresentationInput {
  commands: MissionCommand[];
  events: MissionCommandEvent[];
  now?: string | number | Date;
  resolvedPage?: number;
  resolvedPageSize?: number;
  enabled?: boolean;
  hasActiveExpedition: boolean;
  soloMode: boolean;
  canViewCommands: boolean;
  canManageCommands: boolean;
  canViewLinkedContext?: boolean;
  connectivity: {
    online: boolean;
    offlineMode: boolean;
    realtimeStatus: 'disabled' | 'connecting' | 'connected' | 'error' | 'closed';
    queuedCount: number;
  };
  convoy: {
    permitted: boolean;
    active: boolean;
    memberCount: number;
    staleCount: number;
  };
  persistenceStatus: 'ready' | 'recovered';
}

const DEFAULT_RESOLVED_PAGE_SIZE = 12;

export function buildMissionCommandBoardPresentation(
  input: BuildMissionCommandBoardPresentationInput,
): MissionCommandBoardPresentation {
  const nowMs = normalizeNow(input.now);
  const canExposeCommands = input.enabled !== false && input.canViewCommands;
  const commands = canExposeCommands ? input.commands : [];
  const board = selectMissionCommandBoard(commands);
  const resolvedPage = Math.max(0, Math.floor(input.resolvedPage ?? 0));
  const resolvedPageSize = clampInteger(input.resolvedPageSize, 1, 50, DEFAULT_RESOLVED_PAGE_SIZE);
  const resolvedVisibleCount = Math.min(
    board.resolved.length,
    (resolvedPage + 1) * resolvedPageSize,
  );
  const eventCounts = countEventsByCommand(input.events);
  const buildCard = (command: MissionCommand, bucket: MissionCommandBoardBucket) => (
    buildMissionCommandCardPresentation(command, {
      bucket,
      nowMs,
      canManageCommands: input.canManageCommands,
      canViewLinkedContext: input.canViewLinkedContext !== false,
      soloMode: input.soloMode,
      eventCount: eventCounts.get(command.id) ?? 0,
    })
  );
  const sections: MissionCommandBoardPresentation['sections'] = {
    needsDecision: buildSection(
      'needs_decision',
      input.soloMode ? 'Personal Decisions' : 'Needs Decision',
      board.needsDecision,
      board.needsDecision.length,
      buildCard,
      input.soloMode ? 'No personal decisions need review.' : 'No commands in this section.',
    ),
    awaitingAcknowledgment: buildSection(
      'awaiting_acknowledgment',
      input.soloMode ? 'Check-In Review' : 'Awaiting Acknowledgment',
      board.awaitingAcknowledgment,
      board.awaitingAcknowledgment.length,
      buildCard,
      input.soloMode ? 'No personal check-ins need review.' : 'No commands in this section.',
    ),
    inProgress: buildSection(
      'in_progress',
      input.soloMode ? 'Personal Actions' : 'In Progress',
      board.inProgress,
      board.inProgress.length,
      buildCard,
      input.soloMode ? 'No personal actions are in progress.' : 'No commands in this section.',
    ),
    resolved: buildSection(
      'resolved',
      input.soloMode ? 'Completed' : 'Resolved',
      board.resolved.slice(0, resolvedVisibleCount),
      board.resolved.length,
      buildCard,
      input.soloMode ? 'No completed personal actions yet.' : 'No commands in this section.',
    ),
  };
  sections.resolved.hasMore = resolvedVisibleCount < board.resolved.length;

  const openCommands = [
    ...board.needsDecision,
    ...board.awaitingAcknowledgment,
    ...board.inProgress,
  ];
  const nextDeadline = selectNextDeadline(openCommands, nowMs);
  const notices = buildNotices(input);
  const degradedState = selectDegradedState(input, commands.length);

  return {
    summary: {
      openCount: openCommands.length,
      awaitingAcknowledgmentCount: board.awaitingAcknowledgment.length,
      decisionRequiredCount: board.needsDecision.length,
      nextDeadlineAt: nextDeadline?.deadlineAt ?? null,
      nextDeadlineTitle: nextDeadline?.title ?? null,
      convoyLabel: formatConvoySummary(input.convoy, input.soloMode),
      connectionLabel: formatConnectionSummary(input.connectivity, input.soloMode),
    },
    sections,
    visibleCommandCount:
      sections.needsDecision.items.length +
      sections.awaitingAcknowledgment.items.length +
      sections.inProgress.items.length +
      sections.resolved.items.length,
    degradedState,
    notices,
  };
}

export function windowMissionCommandBoardSection(
  section: MissionCommandBoardSectionPresentation,
  visibleLimit: number,
): MissionCommandBoardSectionPresentation {
  const limit = clampInteger(visibleLimit, 1, 200, 1);
  const items = section.items.slice(0, limit);
  return {
    ...section,
    items,
    hasMore: items.length < section.totalCount,
  };
}

export function buildMissionCommandCardPresentation(
  command: MissionCommand,
  input: {
    bucket: MissionCommandBoardBucket;
    nowMs: number;
    canManageCommands: boolean;
    canViewLinkedContext: boolean;
    soloMode?: boolean;
    eventCount?: number;
  },
): MissionCommandCardPresentation {
  const personalAction = command.target.kind === 'solo';
  const acknowledgment = formatAcknowledgment(command, personalAction);
  const deadline = formatDeadline(command, input.nowMs);
  const contextRestricted = command.linkedContext?.restricted === true;
  const linkedContextLabel = command.linkedContext
    ? contextRestricted
      ? 'Restricted context'
      : command.linkedContext.title
    : null;
  const source = selectSourceTruthStatusPresentation({
    sources: command.sourceTruth,
    policyKey: command.sourceTruth[0]?.policyKey,
    now: input.nowMs,
  });
  const allowedActions = selectMissionCommandBoardActions(command, {
    canManageCommands: input.canManageCommands,
    canViewLinkedContext: input.canViewLinkedContext && !contextRestricted,
    personalAction,
  });
  const deliveryLabel = formatDeliveryState(command.deliveryState);
  const targetLabel = formatMissionCommandTarget(command.target);
  const operationalLabel = formatOperationalState(command.operationalState);
  const priorityLabel = formatPriority(command.priority);
  const typeLabel = formatMissionCommandType(command.type);
  const lastUpdateLabel = formatRelativeTime(command.updatedAt, input.nowMs);
  const recommendedActionLabel = allowedActions[0]?.label ?? 'Review details';

  return {
    key: command.id,
    commandId: command.id,
    bucket: input.bucket,
    priority: command.priority,
    priorityLabel,
    typeLabel,
    title: command.title,
    operationalLabel,
    targetLabel,
    assignmentLabel: command.assignment
      ? command.assignment.target.kind === 'member'
        ? command.assignment.target.label ?? command.assignment.target.memberId
        : formatMissionCommandTarget(command.assignment.target)
      : null,
    acknowledgmentLabel: acknowledgment.label,
    acknowledgmentComplete: acknowledgment.complete,
    acknowledgmentRequired: acknowledgment.required,
    deadlineAt: command.deadlineAt ?? null,
    deadlineLabel: deadline.label,
    deadlineState: deadline.state,
    linkedContextLabel,
    linkedContextRestricted: contextRestricted,
    sourceLabel: source.originLabel,
    sourceFreshnessLabel: source.freshnessLabel,
    sourceConfidenceLabel: source.confidenceLabel,
    deliveryState: command.deliveryState,
    deliveryLabel,
    recommendedActionLabel,
    allowedActions,
    updatedAt: command.updatedAt,
    lastUpdateLabel,
    accessibilityLabel: [
      `${priorityLabel} priority`,
      command.title,
      typeLabel,
      operationalLabel,
      `Target ${targetLabel}`,
      acknowledgment.label,
      deadline.label,
      linkedContextLabel ? `Linked context ${linkedContextLabel}` : null,
      `${source.originLabel} source`,
      `${source.freshnessLabel} freshness`,
      deliveryLabel,
      `Updated ${lastUpdateLabel}`,
      input.eventCount ? `${input.eventCount} history events` : null,
    ].filter(Boolean).join('. '),
    command,
  };
}

export function selectMissionCommandBoardActions(
  command: MissionCommand,
  input: { canManageCommands: boolean; canViewLinkedContext: boolean; personalAction?: boolean },
): MissionCommandBoardActionModel[] {
  const actions: MissionCommandBoardActionModel[] = [];
  const personalAction = input.personalAction === true || command.target.kind === 'solo';
  if (input.canManageCommands) {
    switch (command.operationalState) {
      case 'proposed':
        actions.push(action('stage', personalAction ? 'Review Personal Action' : 'Stage Command', 'primary'));
        break;
      case 'ready':
        actions.push(action('activate', personalAction ? 'Start Personal Action' : 'Activate Command', 'primary'));
        break;
      case 'active':
        actions.push(action('start', personalAction ? 'Start Personal Action' : 'Mark In Progress', 'primary'));
        actions.push(action('block', personalAction ? 'Mark Deferred' : 'Mark Blocked', 'secondary'));
        actions.push(action('resolve', personalAction ? 'Complete' : 'Resolve', 'secondary'));
        break;
      case 'in_progress':
        actions.push(action('resolve', personalAction ? 'Complete' : 'Resolve', 'primary'));
        actions.push(action('block', personalAction ? 'Mark Deferred' : 'Mark Blocked', 'secondary'));
        break;
      case 'blocked':
        actions.push(action('resume', personalAction ? 'Resume Personal Action' : 'Resume', 'primary'));
        actions.push(action('resolve', personalAction ? 'Complete' : 'Resolve', 'secondary'));
        break;
      case 'resolved':
      case 'cancelled':
      case 'expired':
        break;
    }
    if (!isTerminal(command.operationalState)) {
      actions.push(action('request_follow_up', personalAction ? 'Add Status Note' : 'Request Follow-Up', 'secondary'));
      if (!personalAction) actions.push(action('reassign', 'Reassign', 'secondary'));
      actions.push(action('cancel', personalAction ? 'Cancel Personal Action' : 'Cancel Command', 'danger'));
    }
    if (command.deliveryState === 'failed') {
      actions.unshift(action('retry_delivery', 'Retry Delivery', 'primary'));
    }
  }
  if (command.linkedContext && input.canViewLinkedContext && !command.linkedContext.restricted) {
    actions.push(action('view_context', 'View Context', 'secondary'));
  }
  return actions;
}

export function formatMissionCommandTarget(target: MissionCommandTarget): string {
  switch (target.kind) {
    case 'member': return target.label?.trim() || target.memberId;
    case 'role': return target.label?.trim() || target.roleId;
    case 'vehicle': return target.label?.trim() || target.vehicleId;
    case 'team':
      return target.label?.trim() || (target.memberIds.length > 0
        ? `${target.memberIds.length} team members`
        : 'Expedition team');
    case 'solo': return target.label?.trim() ? `${target.label.trim()} (you)` : 'You';
  }
}

export function formatMissionCommandType(type: MissionCommandType): string {
  switch (type) {
    case 'check_in': return 'Check-In';
    case 'rally': return 'Rally';
    case 'assist': return 'Assist';
    case 'hazard': return 'Hazard';
    case 'resource': return 'Resource';
    case 'route': return 'Route';
    case 'recovery': return 'Recovery';
    case 'emergency': return 'Emergency Ping';
    case 'general': return 'General';
  }
}

export function formatOperationalState(state: MissionCommandOperationalState): string {
  switch (state) {
    case 'proposed': return 'Proposed';
    case 'ready': return 'Ready';
    case 'active': return 'Active';
    case 'in_progress': return 'In Progress';
    case 'blocked': return 'Blocked';
    case 'resolved': return 'Resolved';
    case 'cancelled': return 'Cancelled';
    case 'expired': return 'Expired';
  }
}

export function formatDeliveryState(state: MissionCommandDeliveryState): string {
  switch (state) {
    case 'local': return 'Local device only';
    case 'queued': return 'Queued offline';
    case 'sending': return 'Sending';
    case 'sent': return 'Sent';
    case 'delivered': return 'Delivered';
    case 'failed': return 'Delivery failed';
    case 'retrying': return 'Retrying delivery';
    case 'cancelled': return 'Delivery cancelled';
  }
}

function buildSection(
  id: MissionCommandBoardSectionId,
  title: string,
  commands: MissionCommand[],
  totalCount: number,
  buildCard: (command: MissionCommand, bucket: MissionCommandBoardBucket) => MissionCommandCardPresentation,
  emptyLabel = 'No commands in this section.',
): MissionCommandBoardSectionPresentation {
  return {
    id,
    title,
    emptyLabel,
    items: commands.map((command) => buildCard(command, id)),
    totalCount,
    hasMore: false,
  };
}

function buildNotices(input: BuildMissionCommandBoardPresentationInput): MissionCommandBoardNotice[] {
  const notices: MissionCommandBoardNotice[] = [];
  if (input.persistenceStatus === 'recovered') {
    notices.push({
      kind: 'migration_recovered',
      label: 'Some Mission Command records could not be restored. Valid local Dispatch records remain available.',
    });
  }
  if (!input.connectivity.online || input.connectivity.offlineMode) {
    notices.push({
      kind: 'offline',
      label: 'Offline. Commands remain local and queued delivery is shown explicitly.',
    });
  } else if (!input.soloMode && ['error', 'closed', 'disabled'].includes(input.connectivity.realtimeStatus)) {
    notices.push({
      kind: 'realtime_unavailable',
      label: 'Realtime unavailable. Local command state remains usable; delivery is not confirmed.',
    });
  }
  if (input.soloMode) {
    notices.push({
      kind: 'solo',
      label: 'Personal Mission Command is stored on this device. No other person is monitoring or receiving these actions.',
    });
  }
  return notices;
}

function selectDegradedState(
  input: BuildMissionCommandBoardPresentationInput,
  commandCount: number,
): MissionCommandBoardPresentation['degradedState'] {
  if (input.enabled === false) {
    return {
      kind: 'feature_disabled',
      title: 'Mission Command unavailable',
      detail: 'The approved Mission Command rollout is not enabled for this build or account.',
    };
  }
  if (!input.canViewCommands) {
    return {
      kind: 'permission_restricted',
      title: 'Command Board restricted',
      detail: 'Your current expedition role cannot view Mission Command records.',
    };
  }
  if (input.soloMode) {
    return {
      kind: 'solo',
      title: 'Personal Mission Command',
      detail: input.hasActiveExpedition
        ? 'Use local actions, decision reminders, check-ins, and incident records. Nothing is transmitted to another person.'
        : 'No active expedition is required for local actions, reminders, check-ins, or incident records. Nothing is transmitted to another person.',
    };
  }
  if (!input.hasActiveExpedition) {
    return {
      kind: 'no_active_expedition',
      title: 'No active expedition',
      detail: 'Start or resume an expedition to coordinate team commands. Existing local records remain preserved.',
    };
  }
  if (!input.connectivity.online || input.connectivity.offlineMode) {
    return {
      kind: 'offline',
      title: 'Mission Command offline',
      detail: 'Local command actions remain available. Queued delivery will require a verified connection.',
    };
  }
  if (!input.soloMode && ['error', 'closed', 'disabled'].includes(input.connectivity.realtimeStatus)) {
    return {
      kind: 'realtime_unavailable',
      title: 'Realtime unavailable',
      detail: 'The board is showing local state. Team delivery and acknowledgments are not currently verified.',
    };
  }
  if (commandCount === 0) {
    return {
      kind: 'empty',
      title: 'No Mission Commands',
      detail: 'New check-ins, rally instructions, route actions, and recovery coordination will appear here.',
    };
  }
  return null;
}

function formatConvoySummary(
  input: BuildMissionCommandBoardPresentationInput['convoy'],
  soloMode: boolean,
): string {
  if (soloMode) return 'Personal workspace';
  if (!input.permitted) return 'Convoy status restricted';
  if (!input.active) return 'No active convoy';
  const count = Math.max(0, Math.floor(input.memberCount));
  const staleCount = Math.min(count, Math.max(0, Math.floor(input.staleCount)));
  return staleCount > 0
    ? `${count} ${count === 1 ? 'member' : 'members'} / ${staleCount} stale`
    : `${count} ${count === 1 ? 'member' : 'members'} / all current`;
}

function formatConnectionSummary(
  input: BuildMissionCommandBoardPresentationInput['connectivity'],
  soloMode: boolean,
): string {
  const queuedCount = Math.max(0, Math.floor(input.queuedCount));
  if (soloMode) return !input.online || input.offlineMode ? 'Offline / local only' : 'Local only';
  if (!input.online || input.offlineMode) {
    return queuedCount > 0 ? `Offline / ${queuedCount} queued` : 'Offline / local only';
  }
  switch (input.realtimeStatus) {
    case 'connected': return queuedCount > 0 ? `Realtime / ${queuedCount} queued` : 'Realtime connected';
    case 'connecting': return 'Realtime connecting';
    case 'error':
    case 'closed':
    case 'disabled':
      return 'Realtime unavailable';
  }
}

function formatAcknowledgment(command: MissionCommand, personalAction = false): {
  label: string;
  complete: number;
  required: number;
} {
  if (command.acknowledgmentPolicy.mode === 'none') {
    return { label: personalAction ? 'Local completion' : 'No acknowledgment required', complete: 0, required: 0 };
  }
  const targetCount = new Set(command.acknowledgmentPolicy.targetMemberIds).size;
  const required = command.acknowledgmentPolicy.mode === 'any'
    ? 1
    : command.acknowledgmentPolicy.mode === 'count'
      ? Math.max(1, Math.min(targetCount || 1, command.acknowledgmentPolicy.requiredCount ?? 1))
      : Math.max(1, targetCount);
  const acceptedMembers = new Set(
    command.acknowledgments
      .filter((item) => item.response === 'acknowledged')
      .map((item) => item.memberId),
  );
  const complete = Math.min(required, acceptedMembers.size);
  const suffix = command.acknowledgmentState === 'declined'
    ? ' / declined'
    : command.acknowledgmentState === 'expired'
      ? ' / expired'
      : '';
  return {
    label: `${complete} of ${required} acknowledged${suffix}`,
    complete,
    required,
  };
}

function formatDeadline(command: MissionCommand, nowMs: number): {
  label: string;
  state: MissionCommandDeadlineState;
} {
  const input = missionClockDeadlineFromCommand(command);
  if (!input) return { label: 'No deadline', state: 'none' };
  const deadline = evaluateMissionClockDeadline(input, nowMs);
  if (deadline.status === 'completed') return { label: 'Deadline completed', state: 'none' };
  if (deadline.status === 'cancelled') return { label: 'Deadline cancelled', state: 'none' };
  if (deadline.status === 'unavailable' || deadline.deltaMs == null) {
    return { label: 'Deadline unavailable', state: 'none' };
  }
  if (deadline.status === 'overdue') {
    return { label: `Overdue by ${formatDuration(Math.abs(deadline.deltaMs))}`, state: 'overdue' };
  }
  if (deadline.status === 'due') return { label: 'Due now', state: 'due_soon' };
  return {
    label: `Due in ${formatDuration(deadline.deltaMs)}`,
    state: deadline.status === 'due_soon' ? 'due_soon' : 'upcoming',
  };
}

function formatRelativeTime(value: string, nowMs: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const delta = nowMs - timestamp;
  if (delta < 0) return 'timestamp pending verification';
  if (delta < 60_000) return 'less than 1 min ago';
  return `${formatDuration(delta)} ago`;
}

function formatDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.ceil(durationMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} day ${remainingHours} hr` : `${days} day`;
}

function formatPriority(priority: DispatchPriority): string {
  switch (priority) {
    case 'critical': return 'Critical';
    case 'high': return 'High';
    case 'normal': return 'Normal';
    case 'low': return 'Low';
  }
}

function selectNextDeadline(commands: MissionCommand[], nowMs: number): MissionCommand | null {
  const inputs = commands
    .map(missionClockDeadlineFromCommand)
    .filter((deadline): deadline is NonNullable<typeof deadline> => deadline != null);
  const selectedId = buildMissionClockSnapshot(inputs, nowMs).next?.linkedCommandId;
  return selectedId ? commands.find((command) => command.id === selectedId) ?? null : null;
}

function countEventsByCommand(events: MissionCommandEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.commandId, (counts.get(event.commandId) ?? 0) + 1);
  }
  return counts;
}

function normalizeNow(value: string | number | Date | undefined): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : Date.now();
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }
  return Date.now();
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value ?? fallback)));
}

function action(
  id: MissionCommandBoardActionId,
  label: string,
  tone: MissionCommandBoardActionModel['tone'],
): MissionCommandBoardActionModel {
  return { id, label, tone };
}

function isTerminal(state: MissionCommandOperationalState): boolean {
  return state === 'resolved' || state === 'cancelled' || state === 'expired';
}
