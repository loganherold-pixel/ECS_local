import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import DispatchAssistRequestComposer, {
  type DispatchAssistRequestSubmit,
} from './DispatchAssistRequestComposer';
import DispatchTeamPingComposer, {
  type DispatchPingComposerSeed,
  type DispatchPingComposerSubmit,
} from './DispatchTeamPingComposer';
import DispatchQueueSection from './DispatchQueueSection';
import DispatchTeamRosterSection from './DispatchTeamRosterSection';
import DispatchTimelineSection from './DispatchTimelineSection';
import { buildDispatchAuditEvent } from '../../lib/dispatchAuditAdapter';
import {
  getDispatchContextActions,
  getDispatchContextTypeLabel,
  getPrimaryContextPingAction,
  type DispatchContextAction,
} from '../../lib/dispatchContextAdapter';
import {
  cancelQueuedDispatchPing,
  cancelQueuedDispatchQueueItem,
  resolvePingDispatchReliability,
  isCancellableQueuedDispatchPing,
  isCancellableQueuedDispatchQueueItem,
  isRetryableDispatchPing,
  isRetryableDispatchQueueItem,
  markDispatchPingDeliveryResult,
  markDispatchQueueItemDeliveryResult,
  markDispatchTimelineEventDeliveryResult,
  prepareDispatchPingRetry,
  prepareDispatchQueueItemRetry,
  prepareDispatchTimelineEventRetry,
  type DispatchSyncSnapshot,
} from '../../lib/dispatchSyncAdapter';
import {
  applyEscalationTransition,
  getEscalationStateLabel,
  isTerminalEscalationState,
  shouldSuggestEscalation,
} from '../../lib/dispatchEscalationAdapter';
import {
  resolveDispatchRecipients,
  type DispatchRecipientMode,
  type DispatchRoutingRole,
} from '../../lib/dispatchRoutingAdapter';
import {
  calculateDispatchMetrics,
  getDispatchReadinessSummary,
  type DispatchMetrics,
  type DispatchReadinessSummary,
} from '../../lib/dispatchMetricsAdapter';
import { notifyDispatchEvent } from '../../lib/dispatchNotificationAdapter';
import {
  DISPATCH_CHECK_IN_RESPONSE_OPTIONS,
  DISPATCH_CHECK_IN_SCHEDULE_OPTIONS,
  applyCheckInResponse,
  buildCheckInResponseTimelineEvent,
  getCheckInQueuePatch,
  getCheckInResponseProgress,
  getCheckInSuggestionLabel,
  getStaleCheckInTargets,
  getTeamMemberStatusForCheckInResponse,
  inferCheckInType,
  shouldEscalateCheckInResponse,
} from '../../lib/dispatchCheckInAdapter';
import {
  createDispatchEntityId,
  createDispatchIdempotencyKey,
  getIncomingDispatchConflictNotice,
  mergeDispatchAssignment,
  mergeDispatchPing,
  mergeDispatchQueueItem,
  mergeDispatchTimelineEvent,
  rememberDispatchAction,
  shouldApplyIncomingDispatchEvent,
} from '../../lib/dispatchIntegrity';
import {
  canMutateDispatchQueueItem,
  canSubmitAssistRequest,
  canSubmitDispatchPing,
  DISPATCH_EMERGENCY_SAFETY_COPY,
  DISPATCH_PERMISSION_DENIED_COPY,
  getActionPermissionSet,
  getComposerPermissionSet,
  getQueuePermissionSet,
  getRosterPermissionSet,
  getTimelinePermissionSet,
  resolveCurrentDispatchMember,
  resolveDispatchPermissions,
  type DispatchActionPermissionSet,
  type DispatchPermissionResult,
} from '../../lib/dispatchPermissionAdapter';
import { replayQueuedDispatchActions } from '../../lib/dispatchOfflineReplayAdapter';
import { dispatchPersistenceAdapter } from '../../lib/dispatchPersistenceAdapter';
import {
  getDispatchRolloutDisabledCopy,
  resolveDispatchRolloutConfig,
  type DispatchRolloutConfig,
} from '../../lib/dispatchRolloutConfig';
import {
  createDispatchRealtimeSession,
  type DispatchRealtimeEnvelope,
  type DispatchRealtimeEventDraft,
  type DispatchRealtimeSession,
  type DispatchRealtimeStatus,
} from '../../lib/dispatchRealtimeAdapter';
import {
  defaultDispatchAdapters,
  getDispatchPersistenceDefaults,
} from '../../lib/dispatchServiceAdapters';
import {
  type DispatchDeliveryState,
  type DispatchAssignment,
  type DispatchAssistRequestType,
  type DispatchCheckInResponseStatus,
  type DispatchCheckInSchedule,
  type DispatchLinkedContext,
  type DispatchPing,
  type DispatchEscalationState,
  getCheckInResponseLabel,
  getCheckInScheduleLabel,
  getCheckInTypeLabel,
  getDispatchReliabilityLabel,
  getPingStatusLabel,
  getPriorityWeight,
  type DispatchPingType,
  type DispatchPriority,
  type DispatchQueueItemStatus,
  type DispatchQueueItem,
  type DispatchTeamMember,
  type DispatchTimelineEvent,
} from '../../lib/dispatchTypes';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const DISPATCH_DEV_DIAGNOSTICS_ENABLED =
  typeof __DEV__ !== 'undefined' && __DEV__;

function logDispatchDev(...args: unknown[]) {
  if (DISPATCH_DEV_DIAGNOSTICS_ENABLED) {
    console.log(...args);
  }
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  return items.some((item) => item.id === nextItem.id)
    ? items.map((item) => item.id === nextItem.id ? nextItem : item)
    : [nextItem, ...items];
}

export default function DispatchCommandCenter() {
  const {
    isOnline,
    offlineMode,
    syncStatus,
    connectivityStatus,
    queueSize,
    dirtyCount,
    user,
    operatorInfo,
    showToast,
  } = useApp();
  const activeExpedition = useMemo(
    () => defaultDispatchAdapters.activeExpedition.getActiveExpedition(),
    [],
  );
  const rollout = useMemo(() => resolveDispatchRolloutConfig(), []);
  const persistenceDefaults = useMemo(() => getDispatchPersistenceDefaults(), []);
  const realtimeClientId = useMemo(
    () => `dispatch-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );
  const realtimeSessionRef = useRef<DispatchRealtimeSession | null>(null);
  const replayInFlightRef = useRef(false);
  const recentActionKeysRef = useRef(new Map<string, number>());
  const [teamMembers, setTeamMembers] = useState<DispatchTeamMember[]>(() =>
    defaultDispatchAdapters.teamRoster.listTeamMembers(activeExpedition),
  );
  const [teamRosterLoading, setTeamRosterLoading] = useState(false);
  const [assignments, setAssignments] = useState<DispatchAssignment[]>(() =>
    defaultDispatchAdapters.teamRoster.listAssignments(activeExpedition),
  );
  const fallbackContext = useMemo(
    () => defaultDispatchAdapters.linkedContext.getFallbackContext(activeExpedition),
    [activeExpedition],
  );
  const [pings, setPings] = useState<DispatchPing[]>(() =>
    defaultDispatchAdapters.pings.listPings(activeExpedition),
  );
  const [queueItems, setQueueItems] = useState<DispatchQueueItem[]>(() =>
    defaultDispatchAdapters.queue.listQueueItems(activeExpedition),
  );
  const [timelineEvents, setTimelineEvents] = useState<DispatchTimelineEvent[]>(() =>
    defaultDispatchAdapters.timeline.listTimelineEvents(activeExpedition),
  );
  const [realtimeStatus, setRealtimeStatus] = useState<DispatchRealtimeStatus>('disabled');
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(null);
  const [lastOfflineReplayAt, setLastOfflineReplayAt] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerSeed, setComposerSeed] = useState<DispatchPingComposerSeed | null>(null);
  const [assistComposerVisible, setAssistComposerVisible] = useState(false);
  const [checkInSchedule, setCheckInSchedule] = useState<DispatchCheckInSchedule>('off');
  const teamMembersRef = useRef(teamMembers);
  const assignmentsRef = useRef(assignments);
  const pingsRef = useRef(pings);
  const queueItemsRef = useRef(queueItems);
  const timelineEventsRef = useRef(timelineEvents);

  useEffect(() => {
    teamMembersRef.current = teamMembers;
  }, [teamMembers]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    pingsRef.current = pings;
  }, [pings]);

  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  useEffect(() => {
    timelineEventsRef.current = timelineEvents;
  }, [timelineEvents]);

  useEffect(() => {
    let cancelled = false;

    dispatchPersistenceAdapter.waitForHydration().then(() => {
      if (cancelled) return;
      const snapshot = dispatchPersistenceAdapter.load(activeExpedition.id, persistenceDefaults);
      pingsRef.current = snapshot.pings;
      queueItemsRef.current = snapshot.queueItems;
      assignmentsRef.current = snapshot.assignments;
      timelineEventsRef.current = snapshot.timelineEvents;
      setPings(snapshot.pings);
      setQueueItems(snapshot.queueItems);
      setAssignments(snapshot.assignments);
      setTimelineEvents(snapshot.timelineEvents);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeExpedition.id, persistenceDefaults]);

  useEffect(() => {
    let cancelled = false;

    if (!rollout.liveTeamRoster) {
      const fallbackMembers = defaultDispatchAdapters.teamRoster.listTeamMembers(activeExpedition);
      teamMembersRef.current = fallbackMembers;
      setTeamMembers(fallbackMembers);
      setTeamRosterLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTeamRosterLoading(true);
    defaultDispatchAdapters.teamRoster.loadTeamMembers(activeExpedition, {
      currentUserId: user?.id ?? null,
      currentUserDisplayName: operatorInfo?.display_name ?? null,
      allowMockFallback: false,
    }).then((result) => {
      if (!cancelled) {
        teamMembersRef.current = result.members;
        setTeamMembers(result.members);
      }
    }).catch(() => {
      if (!cancelled) {
        teamMembersRef.current = [];
        setTeamMembers([]);
      }
    }).finally(() => {
      if (!cancelled) {
        setTeamRosterLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeExpedition, operatorInfo?.display_name, rollout.liveTeamRoster, user?.id]);

  const applyRealtimeEvent = useCallback((event: DispatchRealtimeEnvelope) => {
    setLastRealtimeEventAt(event.occurredAt);

    const currentState = {
      pings: pingsRef.current,
      queueItems: queueItemsRef.current,
      assignments: assignmentsRef.current,
      timelineEvents: timelineEventsRef.current,
    };
    const conflictNotice = getIncomingDispatchConflictNotice(event, currentState);

    if (!shouldApplyIncomingDispatchEvent(event, currentState)) {
      return;
    }

    if (conflictNotice) {
      showToast(conflictNotice);
    }

    if (rollout.notifications) {
      notifyDispatchEvent({
        event,
        currentUserId: user?.id ?? null,
        teamMembers: teamMembersRef.current,
        expeditionSource: activeExpedition.source,
        showToast,
      });
    }

    switch (event.type) {
      case 'ping_upsert':
        setPings((current) => {
          const next = mergeDispatchPing(current, event.ping);
          pingsRef.current = next;
          return next;
        });
        dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, event.ping);
        break;
      case 'queue_item_upsert':
        setQueueItems((current) => {
          const next = mergeDispatchQueueItem(current, event.queueItem);
          queueItemsRef.current = next;
          return next;
        });
        dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, event.queueItem);
        break;
      case 'assignment_upsert':
        setAssignments((current) => {
          const next = mergeDispatchAssignment(current, event.assignment);
          assignmentsRef.current = next;
          return next;
        });
        dispatchPersistenceAdapter.upsertAssignment(activeExpedition.id, persistenceDefaults, event.assignment);
        break;
      case 'team_member_upsert':
        setTeamMembers((current) => {
          const next = upsertById(current, event.teamMember);
          teamMembersRef.current = next;
          return next;
        });
        break;
      case 'timeline_event_added':
        setTimelineEvents((current) => {
          const next = mergeDispatchTimelineEvent(current, event.timelineEvent);
          timelineEventsRef.current = next;
          return next;
        });
        dispatchPersistenceAdapter.appendTimelineEvent(activeExpedition.id, persistenceDefaults, event.timelineEvent);
        break;
      default:
        break;
    }
  }, [activeExpedition.id, activeExpedition.source, persistenceDefaults, rollout.notifications, showToast, user?.id]);

  useEffect(() => {
    if (!rollout.realtimeSync) {
      setRealtimeStatus('disabled');
      return undefined;
    }

    if (activeExpedition.source === 'local') {
      setRealtimeStatus('disabled');
      logDispatchDev('[DISPATCH_REALTIME] realtime_paused_no_active_team', {
        expeditionId: activeExpedition.id,
        reason: 'no_active_team',
      });
      return undefined;
    }

    const session = createDispatchRealtimeSession({
      expeditionId: activeExpedition.id,
      clientId: realtimeClientId,
      onEvent: applyRealtimeEvent,
      onStatusChange: setRealtimeStatus,
    });
    realtimeSessionRef.current = session;

    return () => {
      session.close();
      if (realtimeSessionRef.current === session) {
        realtimeSessionRef.current = null;
      }
    };
  }, [activeExpedition.id, activeExpedition.source, applyRealtimeEvent, realtimeClientId, rollout.realtimeSync]);

  const publishRealtimeEvent = useCallback((event: DispatchRealtimeEventDraft): Promise<boolean> => {
    if (!rollout.realtimeSync) return Promise.resolve(false);
    return realtimeSessionRef.current?.publish(event) ?? Promise.resolve(false);
  }, [rollout.realtimeSync]);

  const publishRealtimeEventLater = useCallback((event: DispatchRealtimeEventDraft) => {
    void publishRealtimeEvent(event);
  }, [publishRealtimeEvent]);

  const linkedContexts = useMemo(
    (): DispatchLinkedContext[] =>
      rollout.mapContextIntegration
        ? defaultDispatchAdapters.linkedContext.listLinkedContexts(activeExpedition)
        : [fallbackContext],
    [activeExpedition, fallbackContext, rollout.mapContextIntegration],
  );

  const syncSnapshot = useMemo(
    () =>
      defaultDispatchAdapters.sync.resolveSnapshot({
        isOnline,
        offlineMode,
        syncStatus,
        connectivityStatus,
        queueSize,
        dirtyCount,
      }),
    [connectivityStatus, dirtyCount, isOnline, offlineMode, queueSize, syncStatus],
  );

  const metrics = useMemo(() => {
    return calculateDispatchMetrics({
      pings,
      queueItems,
      teamMembers,
      timelineEvents,
    });
  }, [pings, queueItems, teamMembers, timelineEvents]);
  const readinessSummary = useMemo(
    () => getDispatchReadinessSummary(metrics),
    [metrics],
  );

  const connectionLabel = useMemo(() => {
    if (offlineMode || !isOnline) return 'Offline';
    if (metrics.failedDeliveries > 0 || metrics.queuedDeliveries > 0 || metrics.retryingDeliveries > 0 || metrics.offlineStaleMembers > 0) return 'Queued';
    return 'Live';
  }, [isOnline, metrics.failedDeliveries, metrics.offlineStaleMembers, metrics.queuedDeliveries, metrics.retryingDeliveries, offlineMode]);

  useEffect(() => {
    if (
      !rollout.offlineReplay ||
      !syncSnapshot.isDeliverable ||
      realtimeStatus !== 'connected' ||
      replayInFlightRef.current
    ) {
      return;
    }

    replayInFlightRef.current = true;
    replayQueuedDispatchActions({
      expeditionId: activeExpedition.id,
      defaults: persistenceDefaults,
      publish: publishRealtimeEvent,
    }).then((result) => {
      if (result.attempted === 0) return;
      setLastOfflineReplayAt(new Date().toISOString());
      pingsRef.current = result.snapshot.pings;
      queueItemsRef.current = result.snapshot.queueItems;
      assignmentsRef.current = result.snapshot.assignments;
      timelineEventsRef.current = result.snapshot.timelineEvents;
      setPings(result.snapshot.pings);
      setQueueItems(result.snapshot.queueItems);
      setAssignments(result.snapshot.assignments);
      setTimelineEvents(result.snapshot.timelineEvents);
    }).finally(() => {
      replayInFlightRef.current = false;
    });
  }, [
    activeExpedition.id,
    persistenceDefaults,
    publishRealtimeEvent,
    realtimeStatus,
    rollout.offlineReplay,
    syncSnapshot.isDeliverable,
  ]);

  const currentDispatchMember = useMemo(
    () => resolveCurrentDispatchMember(teamMembers, user?.id ?? null),
    [teamMembers, user?.id],
  );
  const currentDispatchMemberId = currentDispatchMember?.id ?? 'member-local';
  const permissionSnapshot = useMemo(
    () =>
      resolveDispatchPermissions({
        activeExpeditionStatus: activeExpedition.status,
        currentMember: currentDispatchMember,
        operatorInfo,
        soloMode: activeExpedition.source === 'local' || teamMembers.length <= 1,
      }),
    [activeExpedition.source, activeExpedition.status, currentDispatchMember, operatorInfo, teamMembers.length],
  );
  const queuePermissions = useMemo(
    () => {
      const permissions = getQueuePermissionSet(permissionSnapshot);
      return {
        ...permissions,
        canPing: permissions.canPing && rollout.teamPing,
      };
    },
    [permissionSnapshot, rollout.teamPing],
  );
  const rosterPermissions = useMemo(
    () => {
      const permissions = getRosterPermissionSet(permissionSnapshot);
      return {
        ...permissions,
        canPingMembers: permissions.canPingMembers && rollout.teamPing,
      };
    },
    [permissionSnapshot, rollout.teamPing],
  );
  const actionPermissions = useMemo(
    () => getActionPermissionSet(permissionSnapshot),
    [permissionSnapshot],
  );
  const composerPermissions = useMemo(
    () => {
      const permissions = getComposerPermissionSet(permissionSnapshot);
      return {
        ...permissions,
        canSendIndividual: permissions.canSendIndividual && rollout.teamPing,
        canSendTeamWide: permissions.canSendTeamWide && rollout.teamPing,
        canSendEmergency: permissions.canSendEmergency && rollout.teamPing && rollout.emergencyPing,
        canTargetRoles: permissions.canTargetRoles && rollout.teamPing,
      };
    },
    [permissionSnapshot, rollout.emergencyPing, rollout.teamPing],
  );
  const timelinePermissions = useMemo(
    () => getTimelinePermissionSet(permissionSnapshot),
    [permissionSnapshot],
  );
  const formatTarget = useCallback(
    (memberIds: string[]) => formatTimelineTarget(memberIds, teamMembers),
    [teamMembers],
  );
  const staleCheckInTargets = useMemo(
    () => getStaleCheckInTargets(teamMembers),
    [teamMembers],
  );
  const checkInSuggestionLabel = useMemo(
    () => getCheckInSuggestionLabel(teamMembers),
    [teamMembers],
  );
  const diagnosticsSnapshot = useMemo(
    () => buildDispatchDiagnosticsSnapshot({
      activeExpeditionId: activeExpedition.id,
      expeditionMode: activeExpedition.source,
      currentUserId: user?.id ?? null,
      currentRole: permissionSnapshot.roleLabel,
      teamMembers,
      pings,
      queueItems,
      timelineEvents,
      metrics,
      realtimeStatus,
      lastRealtimeEventAt,
      lastOfflineReplayAt,
      notificationsEnabled: rollout.notifications,
      notificationAdapterStatus: getNotificationAdapterStatus(rollout.notifications, activeExpedition.source),
      permissionAdapterStatus: getPermissionAdapterStatus(permissionSnapshot, rosterPermissions),
      rollout,
    }),
    [
      activeExpedition.id,
      activeExpedition.source,
      lastOfflineReplayAt,
      lastRealtimeEventAt,
      metrics,
      permissionSnapshot,
      pings,
      queueItems,
      realtimeStatus,
      rollout,
      rosterPermissions,
      teamMembers,
      timelineEvents,
      user?.id,
    ],
  );

  const reportDenied = useCallback((result?: DispatchPermissionResult) => {
    const reason = result?.reason ?? DISPATCH_PERMISSION_DENIED_COPY;
    showToast(reason);

    const occurredAt = new Date().toISOString();
    const idempotencyKey = createDispatchIdempotencyKey({
      expeditionId: activeExpedition.id,
      entityType: 'timeline_event',
      actionType: 'permission_denied_attempt',
      actorMemberId: currentDispatchMemberId,
      message: reason,
      timeBucket: occurredAt.slice(0, 16),
    });
    const deniedEvent: DispatchTimelineEvent = {
      id: createDispatchEntityId('timeline_event', idempotencyKey),
      idempotencyKey,
      version: 1,
      type: 'log',
      title: 'Permission denied attempt',
      detail: 'A Dispatch action was blocked by expedition permissions.',
      occurredAt,
      priority: 'normal',
      memberIds: [currentDispatchMemberId],
      actor: currentDispatchMember?.displayName ?? 'Dispatch Operator',
      target: 'Dispatch controls',
      auditEvent: buildDispatchAuditEvent({
        expeditionId: activeExpedition.id,
        actor: {
          memberId: currentDispatchMemberId,
          displayName: currentDispatchMember?.displayName ?? 'Dispatch Operator',
          role: currentDispatchMember?.role,
        },
        timelineEvent: {
          id: createDispatchEntityId('timeline_event', idempotencyKey),
          idempotencyKey,
          version: 1,
          type: 'log',
          title: 'Permission denied attempt',
          detail: 'A Dispatch action was blocked by expedition permissions.',
          occurredAt,
          priority: 'normal',
          memberIds: [currentDispatchMemberId],
        },
      }),
    };

    if (rollout.expeditionLogIntegration) {
      defaultDispatchAdapters.timeline.stageForExpeditionLog(deniedEvent);
    }
    dispatchPersistenceAdapter.appendTimelineEvent(activeExpedition.id, persistenceDefaults, deniedEvent);
    setTimelineEvents((current) => mergeDispatchTimelineEvent(current, deniedEvent));
  }, [activeExpedition.id, currentDispatchMember?.displayName, currentDispatchMember?.role, currentDispatchMemberId, persistenceDefaults, rollout.expeditionLogIntegration, showToast]);

  const openComposer = useCallback((seed?: DispatchPingComposerSeed) => {
    if (!rollout.teamPing) {
      showToast(getDispatchRolloutDisabledCopy('teamPing'));
      return;
    }
    if ((seed?.pingType === 'emergency' || seed?.priority === 'critical') && !rollout.emergencyPing) {
      showToast(getDispatchRolloutDisabledCopy('emergencyPing'));
      return;
    }

    const result = canSubmitDispatchPing({
      recipientMode: seed?.recipientMode ?? 'all',
      pingType: seed?.pingType ?? 'general',
      priority: seed?.priority ?? 'normal',
      linkedContext: seed?.linkedContext,
    }, permissionSnapshot);
    if (!result.allowed) {
      reportDenied(result);
      return;
    }

    setComposerSeed(seed ?? null);
    setComposerVisible(true);
  }, [permissionSnapshot, reportDenied, rollout.emergencyPing, rollout.teamPing, showToast]);

  const openContextComposer = useCallback((context: DispatchLinkedContext, action?: DispatchContextAction) => {
    if (!rollout.mapContextIntegration) {
      showToast(getDispatchRolloutDisabledCopy('mapContextIntegration'));
      return;
    }
    const contextAction = action ?? getPrimaryContextPingAction(context);
    openComposer({
      recipientMode: 'all',
      pingType: contextAction.pingType ?? 'general',
      priority: contextAction.priority ?? 'normal',
      linkedContext: context,
      message: contextAction.message,
    });
  }, [openComposer, rollout.mapContextIntegration, showToast]);

  const openStaleCheckInComposer = useCallback(() => {
    if (!rollout.automatedCheckIns) {
      showToast(getDispatchRolloutDisabledCopy('automatedCheckIns'));
      return;
    }

    const singleTarget = staleCheckInTargets.length === 1 ? staleCheckInTargets[0] : null;
    openComposer({
      recipientMode: singleTarget ? 'member' : 'all',
      recipientId: singleTarget?.id,
      pingType: 'check_in',
      priority: staleCheckInTargets.length > 0 ? 'high' : 'normal',
      linkedContext: singleTarget?.currentContext,
      message: 'Safety check-in requested. Confirm your current status.',
    });
  }, [openComposer, rollout.automatedCheckIns, showToast, staleCheckInTargets]);

  const appendTimelineEvent = useCallback((event: DispatchTimelineEvent | Omit<DispatchTimelineEvent, 'id' | 'occurredAt'>) => {
    const now = new Date().toISOString();
    setTimelineEvents((current) => {
      const existingEvent = 'id' in event && 'occurredAt' in event ? event : null;
      const idempotencyKey = existingEvent?.idempotencyKey ?? createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'timeline_event',
        actionType: event.type,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds: event.memberIds,
        linkedContextId: event.linkedContext?.id,
        sourceEntityId: event.queueItemId ?? event.pingId,
        message: `${event.title}:${event.detail}`,
        priority: event.priority,
        timeBucket: event.queueItemId ?? event.pingId ? undefined : now.slice(0, 16),
      });
      const nextEvent: DispatchTimelineEvent = 'id' in event && 'occurredAt' in event
        ? {
          ...event,
          idempotencyKey,
          version: event.version ?? 1,
          deliveryState: event.deliveryState ?? (syncSnapshot.isDeliverable ? event.deliveryState : 'queued'),
        }
        : {
          ...event,
          id: createDispatchEntityId('timeline_event', idempotencyKey),
          idempotencyKey,
          version: 1,
          occurredAt: now,
          deliveryState: event.deliveryState ?? (syncSnapshot.isDeliverable ? undefined : 'queued'),
        };
      const auditEvent = nextEvent.auditEvent ?? buildDispatchAuditEvent({
        expeditionId: activeExpedition.id,
        actor: {
          memberId: currentDispatchMemberId,
          displayName: currentDispatchMember?.displayName ?? 'Dispatch Operator',
          role: currentDispatchMember?.role,
        },
        timelineEvent: nextEvent,
      });
      const auditedEvent: DispatchTimelineEvent = {
        ...nextEvent,
        auditEvent,
      };

      if (rollout.expeditionLogIntegration) {
        defaultDispatchAdapters.timeline.stageForExpeditionLog(auditedEvent);
      }
      dispatchPersistenceAdapter.appendTimelineEvent(activeExpedition.id, persistenceDefaults, auditedEvent);
      publishRealtimeEventLater({ type: 'timeline_event_added', timelineEvent: auditedEvent });
      return mergeDispatchTimelineEvent(current, auditedEvent);
    });
  }, [activeExpedition.id, currentDispatchMember?.displayName, currentDispatchMember?.role, currentDispatchMemberId, persistenceDefaults, publishRealtimeEventLater, rollout.expeditionLogIntegration, syncSnapshot.isDeliverable]);

  const handleComposerSubmit = useCallback(
    (payload: DispatchPingComposerSubmit) => {
      if (!rollout.teamPing) {
        showToast(getDispatchRolloutDisabledCopy('teamPing'));
        return;
      }
      if ((payload.pingType === 'emergency' || payload.priority === 'critical') && !rollout.emergencyPing) {
        showToast(getDispatchRolloutDisabledCopy('emergencyPing'));
        return;
      }
      if (payload.linkedContext && payload.linkedContext.type !== 'expedition' && !rollout.mapContextIntegration) {
        showToast(getDispatchRolloutDisabledCopy('mapContextIntegration'));
        return;
      }

      const permission = canSubmitDispatchPing(payload, permissionSnapshot);
      if (!permission.allowed) {
        reportDenied(permission);
        return;
      }
      if (payload.pingType === 'emergency' || payload.priority === 'critical') {
        showToast(DISPATCH_EMERGENCY_SAFETY_COPY);
      }

      const deliveryState: DispatchDeliveryState = defaultDispatchAdapters.pings.getInitialDeliveryStatus(syncSnapshot);
      const now = new Date().toISOString();
      const targetMemberIds = resolveRecipientMemberIds(payload, teamMembers);
      if (targetMemberIds.length === 0) {
        const resolution = resolveRecipientSelection(payload, teamMembers);
        showToast(resolution.warning ?? 'No available recipients match this Dispatch target.');
        return;
      }
      const linkedContext = payload.linkedContext ?? fallbackContext;
      const pingIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'ping',
        actionType: `ping:${payload.pingType}`,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        message: payload.message,
        priority: payload.priority,
        timeBucket: now.slice(0, 16),
      });
      if (!rememberDispatchAction({
        idempotencyKey: pingIdempotencyKey,
        recentActions: recentActionKeysRef.current,
      })) {
        showToast('Dispatch action already staged.');
        return;
      }
      const escalationState =
        payload.priority === 'critical' || payload.escalationTimer !== 'none'
          ? 'recommended'
          : 'none';
      const pingId = createDispatchEntityId('ping', pingIdempotencyKey);
      const isCheckInPing = payload.pingType === 'check_in';
      const checkInType = isCheckInPing
        ? inferCheckInType({
          linkedContext,
          schedule: checkInSchedule,
          hasStaleTargets: targetMemberIds.some((memberId) =>
            staleCheckInTargets.some((member) => member.id === memberId),
          ),
        })
        : undefined;

      const nextPing: DispatchPing = {
        id: pingId,
        idempotencyKey: pingIdempotencyKey,
        version: 1,
        type: payload.pingType,
        priority: payload.priority,
        status: deliveryState,
        message: payload.message,
        createdAt: now,
        updatedAt: now,
        createdByMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContext,
        escalationState,
        responseDueAt: getResponseDueAt(now, payload.escalationTimer),
        acknowledgedByMemberIds: [],
        requiresAcknowledgment: payload.requireAcknowledgment,
        checkInType,
        checkInSchedule: isCheckInPing && checkInSchedule !== 'off' ? checkInSchedule : undefined,
        checkInResponses: isCheckInPing ? [] : undefined,
        reliabilityState: syncSnapshot.state,
      };

      const queueIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'queue_item',
        actionType: `queue-for-ping:${payload.pingType}`,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        sourceEntityId: pingId,
        message: payload.message,
        priority: payload.priority,
      });
      const linkedQueueItemId = createDispatchEntityId('queue_item', queueIdempotencyKey);
      const nextQueueItem: DispatchQueueItem = {
        id: linkedQueueItemId,
        idempotencyKey: queueIdempotencyKey,
        version: 1,
        title: getQueueTitleForPing(payload.pingType),
        detail: payload.message,
        status: getQueueStatusForSubmittedPing(payload.pingType, payload.priority, payload.requireAcknowledgment),
        priority: payload.priority,
        createdAt: now,
        updatedAt: now,
        createdByMemberId: currentDispatchMemberId,
        assignedMemberIds: targetMemberIds,
        linkedContext,
        escalationState,
        deliveryState,
        dueAt: getResponseDueAt(now, payload.escalationTimer),
        tags: ['team-ping', payload.pingType],
        sourcePingId: pingId,
        reliabilityState: syncSnapshot.state,
      };
      setQueueItems((current) => mergeDispatchQueueItem(current, nextQueueItem));

      const timelineIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'timeline_event',
        actionType: getTimelineTypeForPing(payload.pingType),
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        sourceEntityId: pingId,
        message: payload.message,
        priority: payload.priority,
      });
      const nextTimelineEvent: DispatchTimelineEvent = {
        id: createDispatchEntityId('timeline_event', timelineIdempotencyKey),
        idempotencyKey: timelineIdempotencyKey,
        version: 1,
        type: getTimelineTypeForPing(payload.pingType),
        title: `${getPingTypeLabel(payload.pingType)} ping ${deliveryState}`,
        detail: payload.message,
        occurredAt: now,
        priority: payload.priority,
        memberIds: targetMemberIds,
        actor: 'Dispatch',
        target: formatTarget(targetMemberIds),
        linkedContext,
        queueItemId: linkedQueueItemId,
        pingId,
        deliveryState,
        escalationState,
      };

      setPings((current) => mergeDispatchPing(current, nextPing));
      dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, nextPing);
      dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, nextQueueItem);
      publishRealtimeEventLater({ type: 'ping_upsert', ping: nextPing });
      publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: nextQueueItem });
      appendTimelineEvent(nextTimelineEvent);
      setComposerVisible(false);
      setComposerSeed(null);
    },
    [activeExpedition.id, appendTimelineEvent, checkInSchedule, currentDispatchMemberId, fallbackContext, formatTarget, permissionSnapshot, persistenceDefaults, publishRealtimeEventLater, reportDenied, rollout.emergencyPing, rollout.mapContextIntegration, rollout.teamPing, showToast, staleCheckInTargets, syncSnapshot, teamMembers],
  );

  const handleAssistRequestSubmit = useCallback(
    (payload: DispatchAssistRequestSubmit) => {
      if (!rollout.assistRequest) {
        showToast(getDispatchRolloutDisabledCopy('assistRequest'));
        return;
      }
      if (payload.priority === 'critical' && !rollout.emergencyPing) {
        showToast(getDispatchRolloutDisabledCopy('emergencyPing'));
        return;
      }
      if (payload.linkedContext && payload.linkedContext.type !== 'expedition' && !rollout.mapContextIntegration) {
        showToast(getDispatchRolloutDisabledCopy('mapContextIntegration'));
        return;
      }

      const permission = canSubmitAssistRequest(payload, permissionSnapshot);
      if (!permission.allowed) {
        reportDenied(permission);
        return;
      }
      if (permission.safetyCopy) {
        showToast(permission.safetyCopy);
      }

      const deliveryState: DispatchDeliveryState = defaultDispatchAdapters.pings.getInitialDeliveryStatus(syncSnapshot);
      const now = new Date().toISOString();
      const targetMemberIds = resolveRecipientMemberIdsFromSelection(payload, teamMembers);
      if (targetMemberIds.length === 0) {
        const resolution = resolveRecipientSelection(payload, teamMembers);
        showToast(resolution.warning ?? 'No available recipients match this Dispatch target.');
        return;
      }
      const linkedContext = payload.linkedContext ?? fallbackContext;
      const assistLabel = getAssistRequestTypeLabel(payload.assistType);
      const message = `[${assistLabel}] ${payload.message}`;
      const assistIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'assist_request',
        actionType: `assist:${payload.assistType}`,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        message: payload.message,
        priority: payload.priority,
        timeBucket: now.slice(0, 16),
      });
      if (!rememberDispatchAction({
        idempotencyKey: assistIdempotencyKey,
        recentActions: recentActionKeysRef.current,
      })) {
        showToast('Dispatch action already staged.');
        return;
      }
      const pingIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'ping',
        actionType: `assist-ping:${payload.assistType}`,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        sourceEntityId: assistIdempotencyKey,
        message,
        priority: payload.priority,
      });
      const pingId = createDispatchEntityId('ping', pingIdempotencyKey);
      const queueIdempotencyKey = createDispatchIdempotencyKey({
        expeditionId: activeExpedition.id,
        entityType: 'queue_item',
        actionType: `assist-queue:${payload.assistType}`,
        actorMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContextId: linkedContext.id,
        sourceEntityId: pingId,
        message: payload.message,
        priority: payload.priority,
      });
      const queueItemId = createDispatchEntityId('queue_item', queueIdempotencyKey);
      const escalationState = getAssistEscalationState(
        payload.priority,
        payload.escalationTimer,
        payload.requireAcknowledgment,
      );
      const dueAt = payload.requireAcknowledgment
        ? getResponseDueAt(now, payload.escalationTimer)
        : undefined;

      const nextPing: DispatchPing = {
        id: pingId,
        idempotencyKey: pingIdempotencyKey,
        version: 1,
        type: payload.priority === 'critical' ? 'emergency' : 'assist',
        priority: payload.priority,
        status: deliveryState,
        message,
        createdAt: now,
        updatedAt: now,
        createdByMemberId: currentDispatchMemberId,
        targetMemberIds,
        linkedContext,
        escalationState,
        responseDueAt: dueAt,
        acknowledgedByMemberIds: [],
        reliabilityState: syncSnapshot.state,
      };

      const nextQueueItem: DispatchQueueItem = {
        id: queueItemId,
        idempotencyKey: queueIdempotencyKey,
        version: 1,
        title: `${assistLabel} assist request`,
        detail: payload.message,
        status: payload.status,
        priority: payload.priority,
        createdAt: now,
        updatedAt: now,
        createdByMemberId: currentDispatchMemberId,
        assignedMemberIds: targetMemberIds,
        linkedContext,
        escalationState,
        deliveryState,
        dueAt,
        tags: ['assist', payload.assistType, payload.priority === 'critical' ? 'emergency' : 'support'],
        sourcePingId: pingId,
        reliabilityState: syncSnapshot.state,
      };

      setPings((current) => mergeDispatchPing(current, nextPing));
      setQueueItems((current) => mergeDispatchQueueItem(current, nextQueueItem));
      dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, nextPing);
      dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, nextQueueItem);
      publishRealtimeEventLater({ type: 'ping_upsert', ping: nextPing });
      publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: nextQueueItem });
      appendTimelineEvent({
        type: 'assist_request_created',
        title: `${assistLabel} assist request created`,
        detail: `${payload.message} ECS team coordination only.`,
        priority: payload.priority,
        memberIds: targetMemberIds,
        actor: 'Dispatch',
        target: formatTarget(targetMemberIds),
        linkedContext,
        queueItemId,
        pingId,
        deliveryState,
        escalationState,
      });
      setAssistComposerVisible(false);
    },
    [activeExpedition.id, appendTimelineEvent, currentDispatchMemberId, fallbackContext, formatTarget, permissionSnapshot, persistenceDefaults, publishRealtimeEventLater, reportDenied, rollout.assistRequest, rollout.emergencyPing, rollout.mapContextIntegration, showToast, syncSnapshot, teamMembers],
  );

  const updateQueueItem = useCallback((itemId: string, updates: Partial<DispatchQueueItem>) => {
    const updatedAt = new Date().toISOString();
    const existingItem = queueItems.find((item) => item.id === itemId);
    const nextItem = existingItem
      ? {
        ...existingItem,
        ...updates,
        version: (updates.version ?? existingItem.version ?? 1) + 1,
        deliveryState: updates.deliveryState ?? (syncSnapshot.isDeliverable ? existingItem.deliveryState : 'queued'),
        reliabilityState: updates.reliabilityState ?? (syncSnapshot.isDeliverable ? existingItem.reliabilityState : 'queued'),
        updatedAt,
      }
      : null;

    setQueueItems((current) => (nextItem ? mergeDispatchQueueItem(current, nextItem) : current));
    if (nextItem) {
      dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, nextItem);
      publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: nextItem });
    }
  }, [activeExpedition.id, persistenceDefaults, publishRealtimeEventLater, queueItems, syncSnapshot.isDeliverable]);

  const handleCheckInResponse = useCallback((ping: DispatchPing, responseStatus: DispatchCheckInResponseStatus) => {
    const permission = permissionSnapshot.can('respond_check_in');
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (!ping.targetMemberIds.includes(currentDispatchMemberId)) {
      showToast('This check-in is not assigned to your member.');
      return;
    }

    const currentMember = teamMembers.find((member) => member.id === currentDispatchMemberId);
    if (!currentMember) {
      showToast('Dispatch member is not loaded yet.');
      return;
    }

    const respondedAt = new Date().toISOString();
    const nextPing = applyCheckInResponse({
      ping,
      memberId: currentDispatchMemberId,
      responseStatus,
      respondedAt,
    });
    const linkedQueueItem = queueItems.find((item) => item.sourcePingId === ping.id);
    const nextQueueItem = linkedQueueItem
      ? {
        ...linkedQueueItem,
        ...getCheckInQueuePatch({
          queueItem: linkedQueueItem,
          ping: nextPing,
          responseStatus,
          respondedAt,
        }),
        version: (linkedQueueItem.version ?? 1) + 1,
      }
      : null;
    const nextMember = {
      ...currentMember,
      status: getTeamMemberStatusForCheckInResponse(responseStatus),
      lastSeenAt: respondedAt,
      syncState: shouldEscalateCheckInResponse(responseStatus) ? 'escalated' as const : 'acknowledged' as const,
    };

    if (shouldEscalateCheckInResponse(responseStatus)) {
      showToast('Check-in response escalated inside ECS. ECS team coordination only.');
    }

    setPings((current) => mergeDispatchPing(current, nextPing));
    setTeamMembers((current) => upsertById(current, nextMember));
    dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, nextPing);
    publishRealtimeEventLater({ type: 'ping_upsert', ping: nextPing });
    publishRealtimeEventLater({ type: 'team_member_upsert', teamMember: nextMember });

    if (nextQueueItem) {
      setQueueItems((current) => mergeDispatchQueueItem(current, nextQueueItem));
      dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, nextQueueItem);
      publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: nextQueueItem });
    }

    appendTimelineEvent(buildCheckInResponseTimelineEvent({
      ping: nextPing,
      queueItem: nextQueueItem ?? linkedQueueItem,
      member: nextMember,
      responseStatus,
      occurredAt: respondedAt,
      deliveryState: nextPing.status,
    }));
  }, [
    activeExpedition.id,
    appendTimelineEvent,
    currentDispatchMemberId,
    permissionSnapshot,
    persistenceDefaults,
    publishRealtimeEventLater,
    queueItems,
    reportDenied,
    showToast,
    teamMembers,
  ]);

  const handleAssignQueueItem = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'assign_member', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }

    const assignedMemberIds = item.assignedMemberIds.length > 0 ? item.assignedMemberIds : [currentDispatchMemberId];
    const assignmentIdempotencyKey = createDispatchIdempotencyKey({
      expeditionId: activeExpedition.id,
      entityType: 'assignment',
      actionType: 'assign-queue-item',
      actorMemberId: currentDispatchMemberId,
      targetMemberIds: assignedMemberIds,
      linkedContextId: item.linkedContext.id,
      sourceEntityId: item.id,
    });
    const assignment: DispatchAssignment = {
      id: createDispatchEntityId('assignment', assignmentIdempotencyKey),
      idempotencyKey: assignmentIdempotencyKey,
      version: 1,
      queueItemId: item.id,
      assigneeMemberId: assignedMemberIds[0] ?? currentDispatchMemberId,
      status: 'offered',
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: 'Assignment staged from Dispatch Queue.',
    };
    updateQueueItem(item.id, {
      status: 'assigned',
      assignedMemberIds,
    });
    setAssignments((current) => mergeDispatchAssignment(current, assignment));
    dispatchPersistenceAdapter.upsertAssignment(activeExpedition.id, persistenceDefaults, assignment);
    publishRealtimeEventLater({ type: 'assignment_upsert', assignment });
    appendTimelineEvent({
      type: 'assignment_created',
      title: `${item.title} assigned`,
      detail: 'Dispatch assignment staged locally from the queue.',
      priority: item.priority,
      memberIds: assignedMemberIds,
      actor: 'Dispatch',
      target: formatTarget(assignedMemberIds),
      linkedContext: item.linkedContext,
      queueItemId: item.id,
      deliveryState: item.deliveryState,
      escalationState: item.escalationState,
    });
  }, [activeExpedition.id, appendTimelineEvent, currentDispatchMemberId, formatTarget, permissionSnapshot, persistenceDefaults, publishRealtimeEventLater, reportDenied, updateQueueItem]);

  const handleMarkInProgress = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'reassign_queue_item', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }

    updateQueueItem(item.id, { status: 'in_progress' });
  }, [permissionSnapshot, reportDenied, updateQueueItem]);

  const handleMarkResolved = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'resolve_queue_item', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }

    updateQueueItem(item.id, {
      status: 'resolved',
      escalationState: 'recovered',
      deliveryState: item.deliveryState === 'queued' ? 'sent' : item.deliveryState,
    });
    appendTimelineEvent({
      type: 'queue_resolved',
      title: `${item.title} resolved`,
      detail: 'Dispatch queue item marked resolved locally.',
      priority: item.priority,
      memberIds: item.assignedMemberIds,
      actor: 'Dispatch',
      target: formatTarget(item.assignedMemberIds),
      linkedContext: item.linkedContext,
      queueItemId: item.id,
      deliveryState: item.deliveryState === 'queued' ? 'sent' : item.deliveryState,
      escalationState: 'recovered',
    });
  }, [appendTimelineEvent, formatTarget, permissionSnapshot, reportDenied, updateQueueItem]);

  const handleEscalateQueueItem = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'escalate_queue_item', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }

    if (isTerminalEscalationState(item.escalationState)) {
      showToast('Dispatch escalation is already at the final ladder state.');
      return;
    }

    const now = new Date().toISOString();
    const sourcePing = item.sourcePingId
      ? pings.find((ping) => ping.id === item.sourcePingId)
      : undefined;
    const decision = shouldSuggestEscalation({
      queueItem: item,
      ping: sourcePing,
      now,
    });
    const nextState = decision.nextState;
    const escalationKey = createDispatchIdempotencyKey({
      expeditionId: activeExpedition.id,
      entityType: 'queue_item',
      actionType: `manual-escalate:${nextState}`,
      actorMemberId: currentDispatchMemberId,
      targetMemberIds: item.assignedMemberIds,
      linkedContextId: item.linkedContext.id,
      sourceEntityId: item.id,
      priority: item.priority,
    });
    if (!rememberDispatchAction({
      idempotencyKey: escalationKey,
      recentActions: recentActionKeysRef.current,
    })) {
      showToast('Dispatch escalation already staged.');
      return;
    }

    const transition = applyEscalationTransition({
      queueItem: item,
      ping: sourcePing,
      now,
      actor: 'Dispatch',
      target: formatTarget(item.assignedMemberIds),
      manual: true,
    });
    showToast(`${getEscalationStateLabel(transition.decision.nextState)}. ECS team coordination only.`);
    setQueueItems((current) => mergeDispatchQueueItem(current, transition.queueItem));
    dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, transition.queueItem);
    publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: transition.queueItem });

    if (transition.ping) {
      setPings((current) => mergeDispatchPing(current, transition.ping!));
      dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, transition.ping);
      publishRealtimeEventLater({ type: 'ping_upsert', ping: transition.ping });
    }
    appendTimelineEvent(transition.timelineEvent);
  }, [
    activeExpedition.id,
    appendTimelineEvent,
    currentDispatchMemberId,
    formatTarget,
    permissionSnapshot,
    persistenceDefaults,
    pings,
    publishRealtimeEventLater,
    reportDenied,
    showToast,
  ]);

  const handleRetryPingDelivery = useCallback((ping: DispatchPing) => {
    const permission = permissionSnapshot.can('send_individual_ping');
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (!isRetryableDispatchPing(ping)) {
      showToast('Dispatch ping is not in a failed delivery state.');
      return;
    }

    const retryingPing = prepareDispatchPingRetry(ping, { isDeliverable: syncSnapshot.isDeliverable });
    setPings((current) => mergeDispatchPing(current, retryingPing));
    dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, retryingPing);

    if (!syncSnapshot.isDeliverable) {
      showToast('Dispatch ping queued for delivery.');
      return;
    }

    publishRealtimeEvent({ type: 'ping_upsert', ping: retryingPing }).then((ok) => {
      const resultPing = markDispatchPingDeliveryResult(retryingPing, ok);
      setPings((current) => mergeDispatchPing(current, resultPing));
      dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, resultPing);
      publishRealtimeEventLater({ type: 'ping_upsert', ping: resultPing });
      appendTimelineEvent({
        type: 'sync',
        title: ok ? 'Ping delivery recovered' : 'Ping delivery failed',
        detail: ok ? 'Recovered after reconnect.' : 'Delivery failed. Retry remains available.',
        priority: ping.priority,
        memberIds: ping.targetMemberIds,
        actor: 'Dispatch',
        target: formatTarget(ping.targetMemberIds),
        linkedContext: ping.linkedContext,
        pingId: ping.id,
        deliveryState: ok ? 'recovered' : 'failed',
        escalationState: ping.escalationState,
      });
    });
  }, [activeExpedition.id, appendTimelineEvent, formatTarget, permissionSnapshot, persistenceDefaults, publishRealtimeEvent, publishRealtimeEventLater, reportDenied, showToast, syncSnapshot.isDeliverable]);

  const handleCancelPingDelivery = useCallback((ping: DispatchPing) => {
    const permission = permissionSnapshot.can('send_individual_ping');
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (!isCancellableQueuedDispatchPing(ping)) {
      showToast('Only queued Dispatch pings can be cancelled before delivery.');
      return;
    }

    const cancelledPing = cancelQueuedDispatchPing(ping);
    setPings((current) => mergeDispatchPing(current, cancelledPing));
    dispatchPersistenceAdapter.upsertPing(activeExpedition.id, persistenceDefaults, cancelledPing);
    appendTimelineEvent({
      type: 'sync',
      title: 'Queued ping cancelled',
      detail: 'Cancelled before delivery.',
      priority: ping.priority,
      memberIds: ping.targetMemberIds,
      actor: 'Dispatch',
      target: formatTarget(ping.targetMemberIds),
      linkedContext: ping.linkedContext,
      pingId: ping.id,
      deliveryState: 'cancelled',
      escalationState: ping.escalationState,
    });
  }, [activeExpedition.id, appendTimelineEvent, formatTarget, permissionSnapshot, persistenceDefaults, reportDenied, showToast]);

  const handleRetryQueueItemDelivery = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'cancel_queue_item', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (!isRetryableDispatchQueueItem(item)) {
      showToast('Dispatch queue item is not in a failed delivery state.');
      return;
    }

    const retryingItem = prepareDispatchQueueItemRetry(item, { isDeliverable: syncSnapshot.isDeliverable });
    setQueueItems((current) => mergeDispatchQueueItem(current, retryingItem));
    dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, retryingItem);

    if (!syncSnapshot.isDeliverable) {
      showToast('Dispatch queue update queued for delivery.');
      return;
    }

    publishRealtimeEvent({ type: 'queue_item_upsert', queueItem: retryingItem }).then((ok) => {
      const resultItem = markDispatchQueueItemDeliveryResult(retryingItem, ok);
      setQueueItems((current) => mergeDispatchQueueItem(current, resultItem));
      dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, resultItem);
      publishRealtimeEventLater({ type: 'queue_item_upsert', queueItem: resultItem });
      appendTimelineEvent({
        type: 'sync',
        title: ok ? 'Queue delivery recovered' : 'Queue delivery failed',
        detail: ok ? 'Recovered after reconnect.' : 'Delivery failed. Retry remains available.',
        priority: item.priority,
        memberIds: item.assignedMemberIds,
        actor: 'Dispatch',
        target: formatTarget(item.assignedMemberIds),
        linkedContext: item.linkedContext,
        queueItemId: item.id,
        pingId: item.sourcePingId,
        deliveryState: ok ? 'recovered' : 'failed',
        escalationState: item.escalationState,
      });
    });
  }, [activeExpedition.id, appendTimelineEvent, formatTarget, permissionSnapshot, persistenceDefaults, publishRealtimeEvent, publishRealtimeEventLater, reportDenied, showToast, syncSnapshot.isDeliverable]);

  const handleCancelQueueItemDelivery = useCallback((item: DispatchQueueItem) => {
    const permission = canMutateDispatchQueueItem(item, 'cancel_queue_item', permissionSnapshot);
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (!isCancellableQueuedDispatchQueueItem(item)) {
      showToast('Only queued Dispatch queue items can be cancelled before delivery.');
      return;
    }

    const cancelledItem = cancelQueuedDispatchQueueItem(item);
    setQueueItems((current) => mergeDispatchQueueItem(current, cancelledItem));
    dispatchPersistenceAdapter.upsertQueueItem(activeExpedition.id, persistenceDefaults, cancelledItem);
    appendTimelineEvent({
      type: 'sync',
      title: 'Queued queue item cancelled',
      detail: 'Cancelled before delivery.',
      priority: item.priority,
      memberIds: item.assignedMemberIds,
      actor: 'Dispatch',
      target: formatTarget(item.assignedMemberIds),
      linkedContext: item.linkedContext,
      queueItemId: item.id,
      pingId: item.sourcePingId,
      deliveryState: 'cancelled',
      escalationState: item.escalationState,
    });
  }, [activeExpedition.id, appendTimelineEvent, formatTarget, permissionSnapshot, persistenceDefaults, reportDenied, showToast]);

  const handleRetryTimelineDelivery = useCallback((event: DispatchTimelineEvent) => {
    const permission = permissionSnapshot.can('modify_timeline');
    if (!permission.allowed) {
      reportDenied(permission);
      return;
    }
    if (event.deliveryState !== 'failed') {
      showToast('Dispatch timeline event is not in a failed delivery state.');
      return;
    }

    const retryingEvent = prepareDispatchTimelineEventRetry(event, { isDeliverable: syncSnapshot.isDeliverable });
    setTimelineEvents((current) => mergeDispatchTimelineEvent(current, retryingEvent));
    dispatchPersistenceAdapter.appendTimelineEvent(activeExpedition.id, persistenceDefaults, retryingEvent);

    if (!syncSnapshot.isDeliverable) {
      showToast('Dispatch timeline event queued for delivery.');
      return;
    }

    publishRealtimeEvent({ type: 'timeline_event_added', timelineEvent: retryingEvent }).then((ok) => {
      const resultEvent = markDispatchTimelineEventDeliveryResult(retryingEvent, ok);
      setTimelineEvents((current) => mergeDispatchTimelineEvent(current, resultEvent));
      dispatchPersistenceAdapter.appendTimelineEvent(activeExpedition.id, persistenceDefaults, resultEvent);
      publishRealtimeEventLater({ type: 'timeline_event_added', timelineEvent: resultEvent });
    });
  }, [activeExpedition.id, permissionSnapshot, persistenceDefaults, publishRealtimeEvent, publishRealtimeEventLater, reportDenied, showToast, syncSnapshot.isDeliverable]);

  if (!rollout.dispatchTabVisibility) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <RolloutDisabledCard
          title="Dispatch rollout paused"
          detail={getDispatchRolloutDisabledCopy('dispatchTabVisibility')}
          icon="pause-circle-outline"
        />
      </ScrollView>
    );
  }

  if (!actionPermissions.canViewDispatch) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.emptyCard}>
          <Ionicons name="lock-closed-outline" size={20} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>Dispatch restricted</Text>
          <Text style={styles.emptyDetail}>{actionPermissions.disabledReason}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <DispatchHeader
          connectionLabel={connectionLabel}
          syncSnapshot={syncSnapshot}
          teamCount={teamMembers.length}
        />
        <DispatchIntelStrip
          metrics={metrics}
          readinessSummary={readinessSummary}
          syncSnapshot={syncSnapshot}
        />
        <DispatchActionGrid
          permissions={actionPermissions}
          rollout={rollout}
          onOpenComposer={openComposer}
          onOpenAssistRequest={() => {
            if (!rollout.assistRequest) {
              showToast(getDispatchRolloutDisabledCopy('assistRequest'));
              return;
            }
            if (!actionPermissions.canCreateAssistRequest) {
              reportDenied({ allowed: false, reason: actionPermissions.disabledReason });
              return;
            }
            setAssistComposerVisible(true);
          }}
        />
        {rollout.automatedCheckIns ? (
          <DispatchCheckInPanel
            schedule={checkInSchedule}
            staleTargetCount={staleCheckInTargets.length}
            suggestionLabel={checkInSuggestionLabel}
            canRequestCheckIn={actionPermissions.canRequestCheckIn && rollout.teamPing}
            disabledReason={actionPermissions.disabledReason}
            onScheduleChange={setCheckInSchedule}
            onOpenManualCheckIn={() => openComposer({
              recipientMode: 'all',
              pingType: 'check_in',
              priority: 'normal',
              message: 'Confirm your current status.',
            })}
            onOpenStaleCheckIn={openStaleCheckInComposer}
          />
        ) : (
          <RolloutDisabledCard
            title="Check-ins paused"
            detail={getDispatchRolloutDisabledCopy('automatedCheckIns')}
            icon="checkmark-done-outline"
          />
        )}
        {rollout.dispatchQueue ? (
          <DispatchQueueSection
            items={queueItems}
            pings={pings}
            members={teamMembers}
            syncSnapshot={syncSnapshot}
            permissions={queuePermissions}
            smartSuggestionsEnabled={rollout.smartSuggestions}
            onPingItem={(item) => openComposer(createQueueFollowUpSeed(item))}
            onContextPing={openContextComposer}
            onAssignItem={handleAssignQueueItem}
            onMarkInProgress={handleMarkInProgress}
            onMarkResolved={handleMarkResolved}
            onEscalateItem={handleEscalateQueueItem}
            onRetryDelivery={handleRetryQueueItemDelivery}
            onCancelDelivery={handleCancelQueueItemDelivery}
          />
        ) : (
          <RolloutDisabledCard
            title="Dispatch Queue paused"
            detail={getDispatchRolloutDisabledCopy('dispatchQueue')}
            icon="git-branch-outline"
          />
        )}
        {rollout.teamPing ? (
          <DispatchRecentPings
            pings={pings.slice(0, 4)}
            members={teamMembers}
            currentMemberId={currentDispatchMemberId}
            syncSnapshot={syncSnapshot}
            onContextPing={openContextComposer}
            timelineCount={timelineEvents.length}
            onRetryPing={handleRetryPingDelivery}
            onCancelPing={handleCancelPingDelivery}
            onCheckInResponse={handleCheckInResponse}
          />
        ) : (
          <RolloutDisabledCard
            title="Team Ping paused"
            detail={getDispatchRolloutDisabledCopy('teamPing')}
            icon="radio-outline"
          />
        )}
        <DispatchTimelineSection
          events={timelineEvents}
          permissions={timelinePermissions}
          onRetryEvent={timelinePermissions.canModifyTimeline ? handleRetryTimelineDelivery : undefined}
        />
        <DispatchTeamRosterSection
          members={teamMembers}
          queueItems={queueItems}
          pings={pings}
          assignments={assignments}
          syncSnapshot={syncSnapshot}
          loading={teamRosterLoading}
          permissions={rosterPermissions}
          onPingMember={(member) => openComposer(createMemberPingSeed(member))}
        />
        {rollout.developerDiagnostics && DISPATCH_DEV_DIAGNOSTICS_ENABLED ? (
          <DispatchDiagnosticsPanel snapshot={diagnosticsSnapshot} />
        ) : null}
      </ScrollView>
      <DispatchTeamPingComposer
        visible={composerVisible}
        members={teamMembers}
        contexts={linkedContexts}
        seed={composerSeed}
        permissions={composerPermissions}
        onClose={() => {
          setComposerVisible(false);
          setComposerSeed(null);
        }}
        onSubmit={handleComposerSubmit}
      />
      <DispatchAssistRequestComposer
        visible={assistComposerVisible}
        members={teamMembers}
        contexts={linkedContexts}
        permissions={composerPermissions}
        onClose={() => setAssistComposerVisible(false)}
        onSubmit={handleAssistRequestSubmit}
      />
    </>
  );
}

function DispatchHeader({
  connectionLabel,
  syncSnapshot,
  teamCount,
}: {
  connectionLabel: 'Live' | 'Offline' | 'Queued';
  syncSnapshot: DispatchSyncSnapshot;
  teamCount: number;
}) {
  const connectionTone =
    connectionLabel === 'Offline'
      ? TACTICAL.danger
      : connectionLabel === 'Queued'
        ? TACTICAL.amber
        : '#7F9D7A';

  return (
    <View style={styles.headerPanel}>
      <View style={[styles.headerRail, { backgroundColor: connectionTone }]} />
      <View style={styles.headerTopRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>EXPEDITION CHANNEL</Text>
          <Text style={styles.screenTitle}>DISPATCH</Text>
          <Text style={styles.headerSubtitle}>Team status, queue control, and field escalation.</Text>
        </View>
        <View style={[styles.connectionPill, { borderColor: `${connectionTone}66` }]}>
          <View style={[styles.connectionDot, { backgroundColor: connectionTone }]} />
          <Text style={[styles.connectionText, { color: connectionTone }]}>{connectionLabel}</Text>
        </View>
      </View>

      <View style={styles.headerDivider} />

      <View style={styles.headerMetaRow}>
        <View style={styles.headerMetaCell}>
          <Text style={styles.metaLabel}>TEAM COUNT</Text>
          <Text style={styles.metaValue}>{teamCount}</Text>
        </View>
        <View style={styles.headerMetaCell}>
          <Text style={styles.metaLabel}>DELIVERY</Text>
          <Text style={styles.metaValueSmall}>{syncSnapshot.label}</Text>
        </View>
        <Text style={styles.headerCopy}>
          {syncSnapshot.detail}
        </Text>
      </View>
    </View>
  );
}

function DispatchIntelStrip({
  metrics,
  readinessSummary,
  syncSnapshot,
}: {
  metrics: DispatchMetrics;
  readinessSummary: DispatchReadinessSummary;
  syncSnapshot: DispatchSyncSnapshot;
}) {
  return (
    <View style={styles.intelBlock}>
      <View style={styles.metricGrid}>
        <DispatchMetricCard label="Available" value={metrics.availableMembers} icon="people-outline" detail={`${metrics.teamReadiness}% ready`} />
        <DispatchMetricCard label="Awaiting" value={metrics.awaitingResponses} icon="radio-outline" detail={formatAverageAck(metrics.averageAcknowledgmentMinutes)} />
        <DispatchMetricCard label="Queue" value={metrics.activeQueueItems} icon="list-outline" detail={`${metrics.resolvedQueueItems} resolved`} />
        <DispatchMetricCard label="Critical" value={metrics.criticalOpenItems} icon="alert-circle-outline" tone={metrics.criticalOpenItems > 0 ? 'danger' : 'default'} />
        <DispatchMetricCard label="Escalate" value={metrics.escalations} icon="warning-outline" tone={metrics.escalations > 0 ? 'danger' : 'default'} />
        <DispatchMetricCard
          label="Delivery"
          value={metrics.failedQueuedDeliveries}
          icon="cloud-offline-outline"
          detail={`${metrics.failedDeliveries} failed / ${metrics.queuedDeliveries} queued`}
          tone={metrics.failedDeliveries > 0 ? 'danger' : 'default'}
        />
        <DispatchMetricCard label="Assist" value={metrics.unresolvedAssistRequests} icon="medkit-outline" />
        <DispatchMetricCard label="Route" value={metrics.routeCheckRequests} icon="git-branch-outline" detail={`${metrics.resourceCheckRequests} resource`} />
        <DispatchMetricCard
          label="Sync"
          value={syncSnapshot.queuedCount + syncSnapshot.dirtyCount}
          icon="sync-outline"
          detail={syncSnapshot.label}
        />
      </View>
      <View style={styles.readinessGrid}>
        <ReadinessChip label="Team" value={readinessSummary.teamReadinessLabel} score={metrics.teamReadiness} />
        <ReadinessChip label="Load" value={readinessSummary.dispatchLoadLabel} score={100 - metrics.dispatchLoad} inverse />
        <ReadinessChip label="Comms" value={readinessSummary.communicationHealthLabel} score={metrics.communicationHealth} />
        <ReadinessChip label="Offline" value={readinessSummary.offlineRiskLabel} score={100 - metrics.offlineRisk} inverse />
        <ReadinessChip label="Escalation" value={readinessSummary.escalationPressureLabel} score={100 - metrics.escalationPressure} inverse />
      </View>
    </View>
  );
}

function DispatchMetricCard({
  label,
  value,
  icon,
  detail,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: IconName;
  detail?: string;
  tone?: 'default' | 'danger';
}) {
  const hasSignal = value > 0;
  const accent = tone === 'danger' && hasSignal
    ? TACTICAL.danger
    : hasSignal
      ? TACTICAL.goldStrong
      : TACTICAL.textMuted;
  const borderColor = hasSignal
    ? `${accent}44`
    : ECS.strokeMuted;

  return (
    <View style={[styles.metricCard, { borderColor }]}>
      <View style={styles.metricTopRow}>
        <Ionicons name={icon} size={13} color={accent} />
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      {detail ? <Text style={styles.metricDetail} numberOfLines={1}>{detail}</Text> : null}
    </View>
  );
}

function ReadinessChip({
  label,
  value,
  score,
  inverse,
}: {
  label: string;
  value: string;
  score: number;
  inverse?: boolean;
}) {
  const tone = score >= 65 ? TACTICAL.goldMedium : inverse ? '#D9903D' : TACTICAL.danger;

  return (
    <View style={[styles.readinessChip, { borderColor: `${tone}44` }]}>
      <Text style={styles.readinessLabel}>{label}</Text>
      <Text style={[styles.readinessValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function formatAverageAck(minutes: number | null): string {
  if (minutes == null) return 'Ack n/a';
  return `Avg ${minutes} min ack`;
}

function DispatchCheckInPanel({
  schedule,
  staleTargetCount,
  suggestionLabel,
  canRequestCheckIn,
  disabledReason,
  onScheduleChange,
  onOpenManualCheckIn,
  onOpenStaleCheckIn,
}: {
  schedule: DispatchCheckInSchedule;
  staleTargetCount: number;
  suggestionLabel: string | null;
  canRequestCheckIn: boolean;
  disabledReason: string;
  onScheduleChange: (schedule: DispatchCheckInSchedule) => void;
  onOpenManualCheckIn: () => void;
  onOpenStaleCheckIn: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="CHECK-IN CONTROL" title="Automated Check-Ins" icon="checkmark-done-outline" />
      <View style={styles.checkInPanel}>
        <View style={styles.checkInPanelHeader}>
          <View style={styles.checkInPanelCopy}>
            <Text style={styles.checkInPanelTitle}>Manual + safety check-ins</Text>
            <Text style={styles.checkInPanelDetail}>
              {suggestionLabel ?? 'No stale-member safety check-in is currently suggested.'}
            </Text>
          </View>
          <StatusBadge label={`${staleTargetCount} stale`} danger={staleTargetCount > 0} muted={staleTargetCount === 0} />
        </View>

        <View style={styles.checkInScheduleRow}>
          {DISPATCH_CHECK_IN_SCHEDULE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.schedulePill,
                schedule === option.value ? styles.schedulePillSelected : null,
              ]}
              onPress={() => onScheduleChange(option.value)}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityState={{ selected: schedule === option.value }}
            >
              <Text style={[
                styles.schedulePillText,
                schedule === option.value ? styles.schedulePillTextSelected : null,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.checkInPanelFooter}>
          <StatusBadge label={`Schedule ${getCheckInScheduleLabel(schedule)}`} muted={schedule === 'off'} />
          <TouchableOpacity
            style={[styles.followUpButton, !canRequestCheckIn ? styles.actionButtonDisabled : null]}
            onPress={onOpenManualCheckIn}
            activeOpacity={canRequestCheckIn ? 0.76 : 1}
            disabled={!canRequestCheckIn}
          >
            <Ionicons name="radio-outline" size={12} color={canRequestCheckIn ? TACTICAL.amber : TACTICAL.textMuted} />
            <Text style={styles.followUpText}>{canRequestCheckIn ? 'Request Check-In' : disabledReason}</Text>
          </TouchableOpacity>
          {staleTargetCount > 0 ? (
            <TouchableOpacity
              style={[styles.followUpButton, styles.staleCheckInButton, !canRequestCheckIn ? styles.actionButtonDisabled : null]}
              onPress={onOpenStaleCheckIn}
              activeOpacity={canRequestCheckIn ? 0.76 : 1}
              disabled={!canRequestCheckIn}
            >
              <Ionicons name="warning-outline" size={12} color={canRequestCheckIn ? TACTICAL.danger : TACTICAL.textMuted} />
              <Text style={styles.followUpText}>Safety Check-In</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function DispatchRecentPings({
  pings,
  members,
  currentMemberId,
  syncSnapshot,
  onContextPing,
  timelineCount,
  onRetryPing,
  onCancelPing,
  onCheckInResponse,
}: {
  pings: DispatchPing[];
  members: DispatchTeamMember[];
  currentMemberId: string;
  syncSnapshot: DispatchSyncSnapshot;
  onContextPing: (context: DispatchLinkedContext, action?: DispatchContextAction) => void;
  timelineCount: number;
  onRetryPing: (ping: DispatchPing) => void;
  onCancelPing: (ping: DispatchPing) => void;
  onCheckInResponse: (ping: DispatchPing, responseStatus: DispatchCheckInResponseStatus) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader eyebrow={`${timelineCount} TIMELINE EVENTS`} title="Recent Pings" icon="radio-outline" />
      {pings.length === 0 ? (
        <EmptyState
          icon="radio-outline"
          title="No pings staged"
          detail="Team pings and assist requests will appear here after they are created."
        />
      ) : (
        <View style={styles.cardStack}>
          {pings.map((ping) => {
            const reliabilityState = resolvePingDispatchReliability(ping, syncSnapshot, members);
            const responseProgress = ping.type === 'check_in' ? getCheckInResponseProgress(ping) : null;
            const currentMemberResponse = ping.checkInResponses?.find(
              (response) => response.memberId === currentMemberId,
            );
            const canRespondToCheckIn =
              ping.type === 'check_in' &&
              ping.targetMemberIds.includes(currentMemberId) &&
              !currentMemberResponse &&
              ping.status !== 'cancelled' &&
              ping.status !== 'failed';
            return (
              <View
                key={ping.id}
                style={[
                  styles.pingCard,
                  ping.priority === 'critical' ? styles.criticalCard : null,
                  reliabilityState === 'queued' ? styles.queuedCard : null,
                  reliabilityState === 'offline_risk' ? styles.riskCard : null,
                  reliabilityState === 'failed' ? styles.riskCard : null,
                  reliabilityState === 'retrying' ? styles.queuedCard : null,
                  ping.conflictState === 'needs_review' ? styles.reviewCard : null,
                ]}
              >
                <View style={styles.pingHeaderRow}>
                  <View style={styles.queueTitleBlock}>
                    <Text style={styles.pingTitle}>{getPingTypeLabel(ping.type)}</Text>
                    <Text style={styles.pingContext} numberOfLines={1}>
                      {ping.linkedContext
                        ? `${getDispatchContextTypeLabel(ping.linkedContext.type)} / ${ping.linkedContext.title}`
                        : 'Expedition Channel'}
                    </Text>
                  </View>
                  <StatusBadge label={getPingStatusLabel(ping.status)} danger={ping.status === 'escalated'} />
                </View>
                <Text style={styles.queueDetail} numberOfLines={2}>{ping.message}</Text>
                <View style={styles.badgeRow}>
                  <PriorityBadge priority={ping.priority} />
                  <StatusBadge
                    label={getDispatchReliabilityLabel(reliabilityState)}
                    muted={reliabilityState !== 'offline_risk' && reliabilityState !== 'failed'}
                    danger={reliabilityState === 'failed' || reliabilityState === 'offline_risk'}
                  />
                  <StatusBadge label={`${ping.targetMemberIds.length} target${ping.targetMemberIds.length === 1 ? '' : 's'}`} muted />
                  {ping.type === 'check_in' && ping.checkInType ? (
                    <StatusBadge label={getCheckInTypeLabel(ping.checkInType)} muted />
                  ) : null}
                  {responseProgress ? (
                    <StatusBadge label={`${responseProgress.acknowledged}/${responseProgress.total} responses`} />
                  ) : null}
                  {currentMemberResponse ? (
                    <StatusBadge label={getCheckInResponseLabel(currentMemberResponse.status)} />
                  ) : null}
                  {ping.responseDueAt ? <StatusBadge label="Ack timer" /> : null}
                  {ping.conflictState && ping.conflictState !== 'none' ? (
                    <StatusBadge
                      label={ping.conflictState === 'needs_review' ? 'Needs Review' : 'Updated During Sync'}
                      danger={ping.conflictState === 'needs_review'}
                    />
                  ) : null}
                </View>
                {ping.conflictReason ? (
                  <Text style={styles.conflictCopy}>{ping.conflictReason}</Text>
                ) : null}
                {reliabilityState === 'failed' || reliabilityState === 'queued' || reliabilityState === 'retrying' ? (
                  <View style={styles.deliveryActionRow}>
                    {reliabilityState === 'failed' ? (
                      <TouchableOpacity
                        style={styles.deliveryActionButton}
                        onPress={() => onRetryPing(ping)}
                        activeOpacity={0.76}
                      >
                        <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                        <Text style={styles.deliveryActionText}>Retry</Text>
                      </TouchableOpacity>
                    ) : null}
                    {reliabilityState === 'queued' || reliabilityState === 'retrying' ? (
                      <TouchableOpacity
                        style={styles.deliveryActionButton}
                        onPress={() => onCancelPing(ping)}
                        activeOpacity={0.76}
                      >
                        <Ionicons name="close-circle-outline" size={12} color={TACTICAL.textMuted} />
                        <Text style={styles.deliveryActionText}>Cancel</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
                {canRespondToCheckIn ? (
                  <View style={styles.checkInResponsePanel}>
                    <Text style={styles.checkInResponseLabel}>CHECK-IN RESPONSE</Text>
                    <View style={styles.checkInResponseGrid}>
                      {DISPATCH_CHECK_IN_RESPONSE_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.checkInResponseButton,
                            option.priority === 'critical' ? styles.checkInResponseCritical : null,
                            option.priority === 'high' ? styles.checkInResponseHigh : null,
                          ]}
                          onPress={() => onCheckInResponse(ping, option.value)}
                          activeOpacity={0.76}
                          accessibilityRole="button"
                          accessibilityLabel={`Respond ${option.label}`}
                        >
                          <Text
                            style={[
                              styles.checkInResponseText,
                              option.priority === 'critical' ? styles.checkInResponseCriticalText : null,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
                {ping.linkedContext ? (
                  <ContextActionStrip
                    context={ping.linkedContext}
                    onContextPing={onContextPing}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={18} color={TACTICAL.amber} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function RolloutDisabledCard({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon: IconName;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={18} color={TACTICAL.amber} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

interface DispatchDiagnosticsSnapshot {
  activeExpeditionId: string;
  expeditionMode: string;
  currentUserId: string;
  currentRole: string;
  teamMemberCount: number;
  activePingCount: number;
  activeQueueCount: number;
  awaitingAcknowledgmentCount: number;
  escalationCount: number;
  queuedOfflineActionCount: number;
  failedDeliveryCount: number;
  realtimeSubscriptionState: string;
  lastRealtimeEventTimestamp: string;
  lastOfflineReplayTimestamp: string;
  notificationAdapterStatus: string;
  permissionAdapterStatus: string;
  featureFlagState: string;
}

function DispatchDiagnosticsPanel({ snapshot }: { snapshot: DispatchDiagnosticsSnapshot }) {
  const rows = [
    ['Expedition', snapshot.activeExpeditionId],
    ['Mode', snapshot.expeditionMode],
    ['User', snapshot.currentUserId],
    ['Role', snapshot.currentRole],
    ['Team', String(snapshot.teamMemberCount)],
    ['Pings', String(snapshot.activePingCount)],
    ['Queue', String(snapshot.activeQueueCount)],
    ['Awaiting Ack', String(snapshot.awaitingAcknowledgmentCount)],
    ['Escalations', String(snapshot.escalationCount)],
    ['Queued Offline', String(snapshot.queuedOfflineActionCount)],
    ['Failed Delivery', String(snapshot.failedDeliveryCount)],
    ['Realtime', snapshot.realtimeSubscriptionState],
    ['Last RT Event', snapshot.lastRealtimeEventTimestamp],
    ['Last Replay', snapshot.lastOfflineReplayTimestamp],
    ['Notifications', snapshot.notificationAdapterStatus],
    ['Permissions', snapshot.permissionAdapterStatus],
    ['Flags', snapshot.featureFlagState],
  ];

  return (
    <View style={styles.diagnosticsPanel}>
      <View style={styles.diagnosticsHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="bug-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.diagnosticsTitle}>Dispatch Diagnostics</Text>
        </View>
        <StatusBadge label="DEV ONLY" muted />
      </View>
      <Text style={styles.diagnosticsCopy}>
        Aggregate Dispatch state for QA and field debugging. Member location and contact details are intentionally omitted.
      </Text>
      <View style={styles.diagnosticsGrid}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.diagnosticsCell}>
            <Text style={styles.diagnosticsLabel}>{label}</Text>
            <Text style={styles.diagnosticsValue} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ContextActionStrip({
  context,
  onContextPing,
}: {
  context: DispatchLinkedContext;
  onContextPing: (context: DispatchLinkedContext, action?: DispatchContextAction) => void;
}) {
  const actions = getDispatchContextActions(context).slice(0, 3);

  return (
    <View style={styles.contextActionStrip}>
      <View style={styles.contextPreviewRow}>
        <Ionicons name={getContextIcon(context.type)} size={12} color={TACTICAL.amber} />
        <Text style={styles.contextPreviewText}>
          {getDispatchContextTypeLabel(context.type)} / {context.title}
        </Text>
      </View>
      <View style={styles.contextActionRow}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.contextActionPill}
            onPress={() => onContextPing(context, action)}
            activeOpacity={0.76}
          >
            <Text style={styles.contextActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function buildDispatchDiagnosticsSnapshot(input: {
  activeExpeditionId: string;
  expeditionMode: string;
  currentUserId?: string | null;
  currentRole: string;
  teamMembers: DispatchTeamMember[];
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  timelineEvents: DispatchTimelineEvent[];
  metrics: DispatchMetrics;
  realtimeStatus: DispatchRealtimeStatus;
  lastRealtimeEventAt: string | null;
  lastOfflineReplayAt: string | null;
  notificationsEnabled: boolean;
  notificationAdapterStatus: string;
  permissionAdapterStatus: string;
  rollout: DispatchRolloutConfig;
}): DispatchDiagnosticsSnapshot {
  return {
    activeExpeditionId: input.activeExpeditionId,
    expeditionMode: input.expeditionMode,
    currentUserId: input.currentUserId ? redactIdentifier(input.currentUserId) : 'local',
    currentRole: input.currentRole,
    teamMemberCount: input.teamMembers.length,
    activePingCount: countActivePings(input.pings),
    activeQueueCount: input.metrics.activeQueueItems,
    awaitingAcknowledgmentCount: countAwaitingAcknowledgment(input.pings),
    escalationCount: input.metrics.escalations,
    queuedOfflineActionCount: countQueuedOfflineActions(input.pings, input.queueItems, input.timelineEvents),
    failedDeliveryCount: input.metrics.failedDeliveries,
    realtimeSubscriptionState: input.realtimeStatus,
    lastRealtimeEventTimestamp: input.lastRealtimeEventAt ?? 'none',
    lastOfflineReplayTimestamp: input.lastOfflineReplayAt ?? 'none',
    notificationAdapterStatus: input.notificationAdapterStatus,
    permissionAdapterStatus: input.permissionAdapterStatus,
    featureFlagState: summarizeDispatchFeatureFlags(input.rollout),
  };
}

function countActivePings(pings: DispatchPing[]): number {
  return pings.filter((ping) => ping.status !== 'cancelled').length;
}

function countAwaitingAcknowledgment(pings: DispatchPing[]): number {
  return pings.filter((ping) => {
    if (!ping.requiresAcknowledgment && !ping.responseDueAt) return false;
    if (ping.status === 'acknowledged' || ping.status === 'accepted' || ping.status === 'declined') {
      return false;
    }
    const acknowledged = ping.acknowledgedByMemberIds?.length ?? 0;
    return acknowledged < ping.targetMemberIds.length;
  }).length;
}

function countQueuedOfflineActions(
  pings: DispatchPing[],
  queueItems: DispatchQueueItem[],
  timelineEvents: DispatchTimelineEvent[],
): number {
  return (
    pings.filter((ping) =>
      ping.status === 'queued' ||
      ping.status === 'retrying' ||
      ping.reliabilityState === 'queued' ||
      ping.reliabilityState === 'retrying',
    ).length +
    queueItems.filter((item) =>
      item.deliveryState === 'queued' ||
      item.deliveryState === 'retrying' ||
      item.reliabilityState === 'queued' ||
      item.reliabilityState === 'retrying',
    ).length +
    timelineEvents.filter((event) =>
      event.deliveryState === 'queued' ||
      event.deliveryState === 'retrying',
    ).length
  );
}

function getNotificationAdapterStatus(enabled: boolean, expeditionSource: string): string {
  if (!enabled) return 'Disabled by rollout';
  if (expeditionSource === 'mock') return 'Enabled / dev data suppressed';
  return 'Enabled';
}

function getPermissionAdapterStatus(
  snapshot: { roleLabel: string },
  rosterPermissions: {
    canViewMemberLocation: boolean;
    canViewMemberContact: boolean;
  },
): string {
  const privacy = [
    rosterPermissions.canViewMemberLocation ? 'location allowed' : 'location restricted',
    rosterPermissions.canViewMemberContact ? 'contact allowed' : 'contact restricted',
  ].join(', ');
  return `${snapshot.roleLabel} / ${privacy}`;
}

function summarizeDispatchFeatureFlags(rollout: DispatchRolloutConfig): string {
  const disabled = Object.entries(rollout)
    .filter(([, enabled]) => !enabled)
    .map(([feature]) => feature);

  if (disabled.length === 0) return 'All enabled';
  return `${disabled.length} disabled: ${disabled.slice(0, 4).join(', ')}${disabled.length > 4 ? '...' : ''}`;
}

function redactIdentifier(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function DispatchActionGrid({
  permissions,
  rollout,
  onOpenComposer,
  onOpenAssistRequest,
}: {
  permissions: DispatchActionPermissionSet;
  rollout: DispatchRolloutConfig;
  onOpenComposer: (seed?: DispatchPingComposerSeed) => void;
  onOpenAssistRequest: () => void;
}) {
  const actions = useMemo<{
    label: string;
    icon: IconName;
    detail: string;
    primary?: boolean;
    danger?: boolean;
    disabled?: boolean;
    seed?: DispatchPingComposerSeed;
    onPress?: () => void;
  }[]>(() => [
      {
        label: 'New Team Ping',
        icon: 'radio-outline',
        primary: true,
        detail: !rollout.teamPing
          ? getDispatchRolloutDisabledCopy('teamPing')
          : permissions.canOpenTeamPing
          ? 'Broadcast a structured field ping.'
          : permissions.disabledReason,
        disabled: !rollout.teamPing || !permissions.canOpenTeamPing,
        seed: { recipientMode: 'all', pingType: 'general', priority: 'normal' },
      },
      {
        label: 'Request Check-In',
        icon: 'checkmark-done-outline',
        detail: !rollout.automatedCheckIns
          ? getDispatchRolloutDisabledCopy('automatedCheckIns')
          : permissions.canRequestCheckIn
          ? 'Ask selected members to confirm status.'
          : permissions.disabledReason,
        disabled: !rollout.automatedCheckIns || !rollout.teamPing || !permissions.canRequestCheckIn,
        seed: { recipientMode: 'all', pingType: 'check_in', priority: 'normal' },
      },
      {
        label: 'Create Assignment',
        icon: 'clipboard-outline',
        detail: !rollout.dispatchQueue
          ? getDispatchRolloutDisabledCopy('dispatchQueue')
          : permissions.canCreateAssignment
          ? 'Stage a dispatch queue task.'
          : permissions.disabledReason,
        disabled: !rollout.dispatchQueue || !permissions.canCreateAssignment,
        seed: { recipientMode: 'role', role: 'member', pingType: 'route', priority: 'normal' },
      },
      {
        label: 'Assist Request',
        icon: 'medkit-outline',
        danger: true,
        detail: !rollout.assistRequest
          ? getDispatchRolloutDisabledCopy('assistRequest')
          : permissions.canCreateAssistRequest
          ? 'Prepare relay or recovery support. ECS team coordination only.'
          : permissions.disabledReason,
        disabled: !rollout.assistRequest || !permissions.canCreateAssistRequest,
        onPress: onOpenAssistRequest,
      },
    ],
    [onOpenAssistRequest, permissions, rollout],
  );

  return (
    <View style={[styles.section, styles.actionSection]}>
      <SectionHeader eyebrow="ACTIONS" title="Command Actions" icon="flash-outline" />
      <View style={styles.actionGrid}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[
              styles.actionButton,
              action.primary ? styles.actionButtonPrimary : null,
              action.danger ? styles.actionButtonDanger : null,
              action.disabled ? styles.actionButtonDisabled : null,
            ]}
            onPress={() => action.onPress ? action.onPress() : onOpenComposer(action.seed)}
            activeOpacity={action.disabled ? 1 : 0.75}
            disabled={action.disabled}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.disabled ? permissions.disabledReason : undefined}
            accessibilityState={{ disabled: Boolean(action.disabled) }}
          >
            <Ionicons
              name={action.icon}
              size={16}
              color={action.disabled ? TACTICAL.textMuted : TACTICAL.amber}
            />
            <View style={styles.actionTextBlock}>
              <Text style={[styles.actionLabel, action.disabled ? styles.actionLabelDisabled : null]}>
                {action.label}
              </Text>
              <Text style={styles.actionDetail}>{action.detail}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: IconName;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={15} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
    </View>
  );
}

function PriorityBadge({ priority }: { priority: DispatchPriority }) {
  const tone = getPriorityTone(priority);

  return (
    <View style={[styles.priorityBadge, { borderColor: `${tone}66`, backgroundColor: `${tone}12` }]}>
      <Text style={[styles.priorityText, { color: tone }]}>
        {priority.toUpperCase()} {getPriorityWeight(priority)}
      </Text>
    </View>
  );
}

function StatusBadge({
  label,
  muted,
  danger,
}: {
  label: string;
  muted?: boolean;
  danger?: boolean;
}) {
  const tone = danger ? TACTICAL.danger : muted ? TACTICAL.textMuted : TACTICAL.amber;

  return (
    <View style={[styles.statusBadge, { borderColor: `${tone}44` }]}>
      <Text style={[styles.statusText, { color: tone }]}>{label}</Text>
    </View>
  );
}

function getPriorityTone(priority: DispatchPriority): string {
  switch (priority) {
    case 'critical':
      return TACTICAL.danger;
    case 'high':
      return '#D9903D';
    case 'normal':
      return TACTICAL.amber;
    case 'low':
      return TACTICAL.textMuted;
    default:
      return TACTICAL.amber;
  }
}

function resolveRecipientMemberIds(
  payload: DispatchPingComposerSubmit,
  members: DispatchTeamMember[],
): string[] {
  return resolveRecipientSelection(payload, members).recipientIds;
}

function resolveRecipientMemberIdsFromSelection(
  payload: {
    recipientMode: DispatchRecipientMode;
    recipientId?: string;
    role?: DispatchRoutingRole;
    priority?: DispatchPriority;
    pingType?: DispatchPingType;
  },
  members: DispatchTeamMember[],
): string[] {
  return resolveRecipientSelection(payload, members).recipientIds;
}

function resolveRecipientSelection(
  payload: {
    recipientMode: DispatchRecipientMode;
    recipientId?: string;
    role?: DispatchRoutingRole;
    priority?: DispatchPriority;
    pingType?: DispatchPingType;
  },
  members: DispatchTeamMember[],
) {
  return resolveDispatchRecipients({
    selection: {
      recipientMode: payload.recipientMode,
      recipientId: payload.recipientId,
      role: payload.role,
    },
    members,
    excludeSender: false,
    includeUnavailable: payload.priority === 'critical' || payload.pingType === 'emergency',
    priority: payload.priority,
    pingType: payload.pingType,
  });
}

function getAssistEscalationState(
  priority: DispatchPriority,
  timer: DispatchAssistRequestSubmit['escalationTimer'],
  requireAcknowledgment: boolean,
): DispatchEscalationState {
  if (priority === 'critical') return 'monitor';
  if (!requireAcknowledgment || timer === 'none') return 'none';
  if (priority === 'high') return 'follow_up';
  return 'monitor';
}

function getAssistRequestTypeLabel(type: DispatchAssistRequestType): string {
  switch (type) {
    case 'vehicle':
      return 'Vehicle';
    case 'medical':
      return 'Medical';
    case 'navigation':
      return 'Navigation';
    case 'fuel':
      return 'Fuel';
    case 'water':
      return 'Water';
    case 'mechanical':
      return 'Mechanical';
    case 'comms':
      return 'Comms';
    case 'recovery':
      return 'Recovery';
    default:
      return 'General Support';
  }
}

function getResponseDueAt(createdAt: string, timer: DispatchPingComposerSubmit['escalationTimer']): string | undefined {
  if (timer === 'none') return undefined;
  const minutes = Number(timer);
  return new Date(Date.parse(createdAt) + minutes * 60 * 1000).toISOString();
}

function getQueueTitleForPing(type: DispatchPingType): string {
  switch (type) {
    case 'assist':
      return 'Assist request follow-up';
    case 'hazard':
      return 'Hazard confirmation follow-up';
    case 'emergency':
      return 'Emergency response follow-up';
    case 'route':
      return 'Route condition follow-up';
    case 'resource':
      return 'Resource status follow-up';
    case 'rally':
      return 'Rally acknowledgement follow-up';
    case 'check_in':
      return 'Team check-in follow-up';
    default:
      return 'Dispatch ping follow-up';
  }
}

function getQueueStatusForSubmittedPing(
  type: DispatchPingType,
  priority: DispatchPriority,
  requireAcknowledgment = false,
): DispatchQueueItemStatus {
  if (priority === 'critical' || type === 'emergency') return 'escalated';
  if (type === 'assist' || type === 'hazard' || type === 'check_in' || requireAcknowledgment) return 'pending_response';
  return 'new';
}

function getPingTypeLabel(type: DispatchPingType): string {
  switch (type) {
    case 'check_in':
      return 'Check-In';
    case 'rally':
      return 'Rally';
    case 'assist':
      return 'Assist';
    case 'route':
      return 'Route';
    case 'resource':
      return 'Resource';
    case 'hazard':
      return 'Hazard';
    case 'emergency':
      return 'Emergency';
    default:
      return 'General';
  }
}

function getTimelineTypeForPing(type: DispatchPingType): DispatchTimelineEvent['type'] {
  switch (type) {
    case 'assist':
      return 'assist_request_created';
    case 'hazard':
      return 'hazard_broadcast_sent';
    case 'resource':
      return 'resource_check_requested';
    default:
      return 'ping_created';
  }
}

function formatTimelineTarget(memberIds: string[], members: DispatchTeamMember[]): string {
  if (memberIds.length === 0) return 'Team';
  if (memberIds.length === 1) {
    const member = members.find((candidate) => candidate.id === memberIds[0]);
    return member?.callSign ?? '1 member';
  }
  return `${memberIds.length} members`;
}

function createMemberPingSeed(member: DispatchTeamMember): DispatchPingComposerSeed {
  return {
    recipientMode: 'member',
    recipientId: member.id,
    pingType: member.status === 'needs_check_in' || member.status === 'offline' ? 'check_in' : 'general',
    priority: member.status === 'offline' ? 'high' : 'normal',
    linkedContext: member.currentContext,
  };
}

function createQueueFollowUpSeed(item: DispatchQueueItem): DispatchPingComposerSeed {
  return {
    recipientMode: item.assignedMemberIds.length === 1 ? 'member' : 'all',
    recipientId: item.assignedMemberIds.length === 1 ? item.assignedMemberIds[0] : undefined,
    pingType: resolvePingTypeForQueueItem(item),
    priority: item.priority,
    linkedContext: item.linkedContext,
    message: `Follow up on ${item.title}. Confirm current status and next action.`,
  };
}

function resolvePingTypeForQueueItem(item: DispatchQueueItem): DispatchPingType {
  if (item.tags?.includes('hazard')) return 'hazard';
  if (item.tags?.includes('assist')) return 'assist';
  if (item.tags?.includes('resource') || item.tags?.includes('power')) return 'resource';
  if (item.tags?.includes('route')) return 'route';
  if (item.tags?.includes('rally')) return 'rally';
  return 'general';
}

function getContextIcon(type: DispatchLinkedContext['type']): IconName {
  switch (type) {
    case 'pin':
      return 'location-outline';
    case 'waypoint':
      return 'flag-outline';
    case 'route_segment':
      return 'git-branch-outline';
    case 'resource':
      return 'cube-outline';
    case 'vehicle':
      return 'car-outline';
    case 'power':
      return 'battery-charging-outline';
    case 'manual':
      return 'create-outline';
    default:
      return 'compass-outline';
  }
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 96,
    gap: 16,
  },
  headerPanel: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(8,12,15,0.62)',
    borderRadius: 12,
    padding: 13,
    gap: 10,
    overflow: 'hidden',
  },
  headerRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },
  screenTitle: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.1,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: TACTICAL.textMuted,
  },
  connectionPill: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerDivider: {
    height: 1,
    backgroundColor: GOLD_RAIL.internal,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerMetaCell: {
    minWidth: 84,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.3,
  },
  metaValue: {
    marginTop: 1,
    fontSize: 22,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  metaValueSmall: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  headerCopy: {
    flexGrow: 1,
    flexBasis: 180,
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  intelBlock: {
    gap: 7,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  metricDetail: {
    marginTop: 2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  readinessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  readinessChip: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: '18%',
    minWidth: 86,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  readinessLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  readinessValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  checkInPanel: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    padding: 11,
    gap: 10,
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  checkInPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  checkInPanelCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkInPanelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  checkInPanelDetail: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  checkInScheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  schedulePill: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  schedulePillSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  schedulePillText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  schedulePillTextSelected: {
    color: TACTICAL.amber,
  },
  checkInPanelFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  section: {
    gap: 9,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.8,
  },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textAlign: 'right',
    flexShrink: 1,
  },
  cardStack: {
    gap: 10,
  },
  emptyCard: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    backgroundColor: 'rgba(12,16,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  emptyDetail: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  diagnosticsPanel: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 10,
    padding: 11,
    gap: 9,
    backgroundColor: 'rgba(12,16,20,0.58)',
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  diagnosticsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.7,
  },
  diagnosticsCopy: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  diagnosticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  diagnosticsCell: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  diagnosticsLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  diagnosticsValue: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  queueCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  priorityRail: {
    width: 4,
  },
  queueBody: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  queueTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  queueContext: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.amber,
    fontWeight: '700',
  },
  queueDetail: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  conflictCopy: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.text,
    fontWeight: '800',
  },
  deliveryActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  deliveryActionButton: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ECS.accentSoft,
  },
  deliveryActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  recommendation: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  followUpButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ECS.accentSoft,
  },
  staleCheckInButton: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  followUpText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pingCard: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  criticalCard: {
    borderColor: 'rgba(192,57,43,0.44)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  queuedCard: {
    borderColor: 'rgba(212,160,23,0.34)',
    backgroundColor: 'rgba(212,160,23,0.07)',
  },
  riskCard: {
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.07)',
  },
  reviewCard: {
    borderColor: 'rgba(217,144,61,0.5)',
    backgroundColor: 'rgba(217,144,61,0.08)',
  },
  pingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  pingTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  pingContext: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.amber,
    fontWeight: '700',
  },
  checkInResponsePanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 7,
  },
  checkInResponseLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  checkInResponseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  checkInResponseButton: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  checkInResponseHigh: {
    borderColor: 'rgba(217,144,61,0.46)',
    backgroundColor: 'rgba(217,144,61,0.08)',
  },
  checkInResponseCritical: {
    borderColor: 'rgba(192,57,43,0.5)',
    backgroundColor: 'rgba(192,57,43,0.1)',
  },
  checkInResponseText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
  },
  checkInResponseCriticalText: {
    color: TACTICAL.danger,
  },
  contextActionStrip: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 7,
  },
  contextPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextPreviewText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontWeight: '800',
  },
  contextActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contextActionPill: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  contextActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionSection: {
    marginTop: 0,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 76,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(12,16,20,0.54)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  actionButtonPrimary: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.13)',
  },
  actionButtonDanger: {
    borderColor: 'rgba(192,57,43,0.36)',
    backgroundColor: 'rgba(192,57,43,0.07)',
  },
  actionButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    opacity: 0.68,
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  actionLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  actionLabelDisabled: {
    color: TACTICAL.textMuted,
  },
  actionDetail: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
});
