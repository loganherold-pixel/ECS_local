import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  DispatchMissionClockPanel,
  MissionClockHeaderMetric,
} from './DispatchMissionClockPanel';
import {
  ECSFreshnessBadge,
  ECSSourceBadge,
} from '../source-truth/SourceTruthIndicators';
import { SourceTruthInspectorTrigger } from '../source-truth/SourceTruthInspector';
import {
  projectDispatchSnapshotToMissionCommandState,
  type MissionCommandSnapshotProjection,
} from '../../lib/dispatchMissionCommandAdapters';
import {
  selectMissionCommandBoard,
  transitionMissionCommandDeliveryState,
  transitionMissionCommandOperationalState,
} from '../../lib/dispatchMissionCommandDomain';
import {
  buildMissionCommandBoardPresentation,
  windowMissionCommandBoardSection,
  type MissionCommandBoardActionId,
  type MissionCommandBoardActionModel,
  type MissionCommandBoardSectionPresentation,
  type MissionCommandCardPresentation,
} from '../../lib/dispatchMissionCommandPresentation';
import { collectMissionClockDeadlines } from '../../lib/dispatchMissionClock';
import { collectGuardianCheckInDeadlines } from '../../lib/dispatchGuardianCheckInAdapter';
import { collectOperationalPlaybookDeadlines } from '../../lib/dispatchOperationalPlaybookDomain';
import { getMissionCommandIncidentId } from '../../lib/dispatchIncidentRoom';
import type {
  MissionCommand,
  MissionCommandActor,
  MissionCommandEvent,
  MissionCommandMutationResult,
} from '../../lib/dispatchMissionCommandTypes';
import {
  getMissionCommandContextPrimaryActionLabel,
  type MissionCommandContextInspection,
} from '../../lib/dispatchMissionCommandContext';
import { useMissionClockScheduler } from '../../lib/useMissionClockScheduler';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from '../../lib/dispatchPersistenceAdapter';
import type { DispatchRealtimeStatus } from '../../lib/dispatchRealtimeAdapter';
import { getDispatchContextTypeLabel } from '../../lib/dispatchContextAdapter';
import {
  incrementECSPerformanceCounter,
  startECSPerformanceSpan,
} from '../../lib/performance/ecsPerformanceDiagnostics';
import { convoyTrackingStore } from '../../stores/convoyTrackingStore';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';

export type MissionCommandDispatchView = 'board' | 'team' | 'timeline';

export interface DispatchMissionCommandBoardProps {
  expeditionId: string;
  persistenceDefaults: DispatchPersistenceDefaults;
  hydrated: boolean;
  hasActiveExpedition: boolean;
  soloMode: boolean;
  canViewCommands: boolean;
  canCreateCommands: boolean;
  canManageCommands: boolean;
  canViewLinkedContext: boolean;
  actor: MissionCommandActor;
  isOnline: boolean;
  offlineMode: boolean;
  realtimeStatus: DispatchRealtimeStatus;
  queuedCount: number;
  convoyId: string | null;
  convoyMemberCount: number;
  convoyStatusPermitted: boolean;
  requestedCommandId?: string | null;
  inspectLinkedContext?: (
    context: NonNullable<MissionCommand['linkedContext']>,
  ) => MissionCommandContextInspection;
  onViewLinkedContext?: (command: MissionCommand) => void;
  onCreateCommand?: () => void;
  onOpenLostCommunications?: () => void;
  onOpenVehicleImmobilized?: () => void;
  onOpenRouteBlockage?: () => void;
  onOpenGuardianCheckIns?: () => void;
  onOpenSmartRally?: () => void;
  onOpenCommsPlan?: () => void;
  onOpenIncidentRoom?: () => void;
  onOpenIncidentRoomForCommand?: (command: MissionCommand) => void;
  onPrepareSoloCommandForTeam?: (command: MissionCommand) => void;
  onReassignCommand?: (command: MissionCommand) => void;
  onRequestFollowUp?: (command: MissionCommand) => void;
  onCommandMutation?: (result: MissionCommandMutationResult) => void;
  onStatusMessage?: (message: string) => void;
  testID?: string;
}

const RESOLVED_PAGE_SIZE = 12;
const OPEN_SECTION_WINDOW_SIZE = 24;
const COMMAND_EVENT_DETAIL_LIMIT = 50;

type OpenMissionCommandSectionId = Exclude<MissionCommandBoardSectionPresentation['id'], 'resolved'>;

function createOpenSectionLimits(): Record<OpenMissionCommandSectionId, number> {
  return {
    needs_decision: OPEN_SECTION_WINDOW_SIZE,
    awaiting_acknowledgment: OPEN_SECTION_WINDOW_SIZE,
    in_progress: OPEN_SECTION_WINDOW_SIZE,
  };
}

export function MissionCommandDispatchNavigation({
  activeView,
  soloMode = false,
  onChange,
}: {
  activeView: MissionCommandDispatchView;
  soloMode?: boolean;
  onChange: (view: MissionCommandDispatchView) => void;
}) {
  const items: {
    id: MissionCommandDispatchView;
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
  }[] = [
    { id: 'board', label: soloMode ? 'Personal Board' : 'Command Board', icon: 'grid-outline' },
    { id: 'team', label: soloMode ? 'Local Status' : 'Team / Convoy', icon: soloMode ? 'person-outline' : 'people-outline' },
    { id: 'timeline', label: soloMode ? 'Personal Log' : 'Timeline / Events', icon: 'time-outline' },
  ];

  return (
    <View style={styles.navigationShell}>
      <View style={styles.navigationHeading}>
        <View>
          <Text style={styles.navigationEyebrow}>DISPATCH</Text>
          <Text style={styles.navigationTitle}>MISSION COMMAND</Text>
        </View>
        <Text style={styles.navigationActiveLabel} numberOfLines={1}>
          {items.find((item) => item.id === activeView)?.label}
        </Text>
      </View>
      <View style={styles.navigation} accessibilityLabel="Mission Command sections">
        {items.map((item) => {
          const selected = activeView === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              testID={`dispatch-mission-navigation-${item.id}`}
              style={[styles.navigationTab, selected ? styles.navigationTabSelected : null]}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              activeOpacity={0.78}
              onPress={() => onChange(item.id)}
            >
              <Ionicons
                name={item.icon}
                size={14}
                color={selected ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text
                style={[styles.navigationLabel, selected ? styles.navigationLabelSelected : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DispatchMissionCommandBoard({
  expeditionId,
  persistenceDefaults,
  hydrated,
  hasActiveExpedition,
  soloMode,
  canViewCommands,
  canCreateCommands,
  canManageCommands,
  canViewLinkedContext,
  actor,
  isOnline,
  offlineMode,
  realtimeStatus,
  queuedCount,
  convoyId,
  convoyMemberCount,
  convoyStatusPermitted,
  requestedCommandId,
  inspectLinkedContext,
  onViewLinkedContext,
  onCreateCommand,
  onOpenLostCommunications,
  onOpenVehicleImmobilized,
  onOpenRouteBlockage,
  onOpenGuardianCheckIns,
  onOpenSmartRally,
  onOpenCommsPlan,
  onOpenIncidentRoom,
  onOpenIncidentRoomForCommand,
  onPrepareSoloCommandForTeam,
  onReassignCommand,
  onRequestFollowUp,
  onCommandMutation,
  onStatusMessage,
  testID = 'dispatch-mission-command-board',
}: DispatchMissionCommandBoardProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const outerShellOwnsScrolling = !isLandscape && height < 820;
  const [resolvedPage, setResolvedPage] = useState(0);
  const [openSectionLimits, setOpenSectionLimits] = useState(createOpenSectionLimits);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const handledRequestedCommandIdRef = useRef<string | null>(null);
  const [initialRenderSpan] = useState(() => startECSPerformanceSpan(
    'dispatch_ready',
    'mission_command_board_initial_render',
    { trackOutstanding: true },
  ));
  const persistenceRevision = useDispatchPersistenceRevision(expeditionId);
  const convoy = useMissionCommandConvoySummary({
    convoyId,
    fallbackMemberCount: convoyMemberCount,
    permitted: convoyStatusPermitted,
  });
  const loadResult = useMemo(() => {
    // The revision is a narrow invalidation token for this expedition snapshot.
    void persistenceRevision;
    return dispatchPersistenceAdapter.loadResult(expeditionId, persistenceDefaults);
  }, [expeditionId, persistenceDefaults, persistenceRevision]);
  const projection = useMemo(
    () => projectDispatchSnapshotToMissionCommandState(loadResult.snapshot, {
      expeditionId,
      creatorLabel: actor.label,
      soloMode,
    }),
    [actor.label, expeditionId, loadResult.snapshot, soloMode],
  );
  const missionClockDeadlines = useMemo(() => {
    if ((!hasActiveExpedition && !soloMode) || !canViewCommands) return [];
    return collectMissionClockDeadlines({
      expeditionId,
      commands: projection.commands,
      offlineActions: loadResult.snapshot.offlineActions,
      additionalDeadlines: [
        ...loadResult.snapshot.operationalPlaybooks.flatMap(collectOperationalPlaybookDeadlines),
        ...collectGuardianCheckInDeadlines(loadResult.snapshot.guardianCheckIns),
      ],
    });
  }, [
    canViewCommands,
    expeditionId,
    hasActiveExpedition,
    loadResult.snapshot.offlineActions,
    loadResult.snapshot.guardianCheckIns,
    loadResult.snapshot.operationalPlaybooks,
    projection.commands,
    soloMode,
  ]);
  const missionClock = useMissionClockScheduler({
    expeditionId,
    deadlines: missionClockDeadlines,
    enabled: hydrated && (hasActiveExpedition || soloMode) && canViewCommands,
  });
  const presentationNow = useMemo(() => {
    void expeditionId;
    void persistenceRevision;
    return Date.now();
  }, [expeditionId, persistenceRevision]);
  const model = useMemo(() => buildMissionCommandBoardPresentation({
    commands: projection.commands,
    events: projection.events,
    now: presentationNow,
    resolvedPage,
    resolvedPageSize: RESOLVED_PAGE_SIZE,
    enabled: true,
    hasActiveExpedition,
    soloMode,
    canViewCommands,
    canManageCommands,
    canViewLinkedContext,
    connectivity: {
      online: isOnline,
      offlineMode,
      realtimeStatus,
      queuedCount,
    },
    convoy,
    persistenceStatus: loadResult.status,
  }), [
    canManageCommands,
    canViewCommands,
    canViewLinkedContext,
    convoy,
    hasActiveExpedition,
    isOnline,
    loadResult.status,
    offlineMode,
    presentationNow,
    projection.commands,
    projection.events,
    queuedCount,
    realtimeStatus,
    resolvedPage,
    soloMode,
  ]);
  const visibleSections = useMemo(() => ({
    needsDecision: windowMissionCommandBoardSection(
      model.sections.needsDecision,
      openSectionLimits.needs_decision,
    ),
    awaitingAcknowledgment: windowMissionCommandBoardSection(
      model.sections.awaitingAcknowledgment,
      openSectionLimits.awaiting_acknowledgment,
    ),
    inProgress: windowMissionCommandBoardSection(
      model.sections.inProgress,
      openSectionLimits.in_progress,
    ),
    resolved: model.sections.resolved,
  }), [model.sections, openSectionLimits]);
  const allVisibleCards = useMemo(() => [
    ...visibleSections.needsDecision.items,
    ...visibleSections.awaitingAcknowledgment.items,
    ...visibleSections.inProgress.items,
    ...visibleSections.resolved.items,
  ], [visibleSections]);
  const selectableCards = useMemo(() => [
    ...model.sections.needsDecision.items,
    ...model.sections.awaitingAcknowledgment.items,
    ...model.sections.inProgress.items,
    ...model.sections.resolved.items,
  ], [model.sections]);
  const visibleCardCount = allVisibleCards.length;
  const selectedCard = selectableCards.find((card) => card.commandId === selectedCommandId) ?? null;
  const selectedContextInspection = useMemo(() => {
    const context = selectedCard?.command.linkedContext;
    return context && inspectLinkedContext ? inspectLinkedContext(context) : null;
  }, [inspectLinkedContext, selectedCard]);
  const selectedEvents = useMemo(
    () => selectedCard
      ? projection.events
        .filter((event) => event.commandId === selectedCard.commandId)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
        .slice(0, COMMAND_EVENT_DETAIL_LIMIT)
      : [],
    [projection.events, selectedCard],
  );

  useEffect(() => {
    setResolvedPage(0);
    setOpenSectionLimits(createOpenSectionLimits());
    setSelectedCommandId(null);
    handledRequestedCommandIdRef.current = null;
  }, [expeditionId]);

  useEffect(() => {
    if (!requestedCommandId) {
      handledRequestedCommandIdRef.current = null;
      return;
    }
    if (!hydrated || handledRequestedCommandIdRef.current === requestedCommandId) return;
    if (!selectableCards.some((card) => card.commandId === requestedCommandId)) {
      const resolvedIndex = selectMissionCommandBoard(projection.commands).resolved
        .findIndex((command) => command.id === requestedCommandId);
      if (resolvedIndex >= 0) {
        const requestedPage = Math.floor(resolvedIndex / RESOLVED_PAGE_SIZE);
        if (requestedPage !== resolvedPage) setResolvedPage(requestedPage);
      }
      return;
    }
    handledRequestedCommandIdRef.current = requestedCommandId;
    setSelectedCommandId(requestedCommandId);
  }, [hydrated, projection.commands, requestedCommandId, resolvedPage, selectableCards]);

  useEffect(() => {
    if (!hydrated) return;
    initialRenderSpan.end('completed', {
      commandCount: projection.commands.length,
      visibleCount: visibleCardCount,
      landscape: isLandscape,
    });
  }, [hydrated, initialRenderSpan, isLandscape, projection.commands.length, visibleCardCount]);

  useEffect(() => () => initialRenderSpan.cancel({ unmounted: true }), [initialRenderSpan]);

  useEffect(() => {
    incrementECSPerformanceCounter('dispatch_ready', 'mission_command_board_model_updates');
  }, [persistenceRevision, resolvedPage]);

  const applyAction = useCallback((actionId: MissionCommandBoardActionId, command: MissionCommand) => {
    const personalAction = command.target.kind === 'solo';
    if (actionId === 'view_context') {
      if (!canViewLinkedContext || command.linkedContext?.restricted) {
        onStatusMessage?.('Linked command context is restricted.');
        return;
      }
      onViewLinkedContext?.(command);
      return;
    }
    if (actionId === 'reassign') {
      if (!canManageCommands) {
        onStatusMessage?.('You do not have permission to reassign this Mission Command.');
        return;
      }
      setSelectedCommandId(null);
      onReassignCommand?.(command);
      return;
    }
    if (actionId === 'request_follow_up') {
      if (!canManageCommands) {
        onStatusMessage?.(personalAction
          ? 'You do not have permission to add a personal status note.'
          : 'You do not have permission to request command follow-up.');
        return;
      }
      setSelectedCommandId(null);
      onRequestFollowUp?.(command);
      return;
    }
    if (!canManageCommands) {
      onStatusMessage?.(personalAction
        ? 'You do not have permission to update this personal action.'
        : 'You do not have permission to update this Mission Command.');
      return;
    }

    const commit = () => {
      const result = transitionForBoardAction(actionId, command, actor);
      if (!result) {
        onStatusMessage?.('This action is not available for the current command state.');
        return;
      }
      if (!result.ok) {
        onStatusMessage?.(result.reason);
        return;
      }
      if (!result.changed) {
        onStatusMessage?.(personalAction
          ? 'Personal action is already in that state.'
          : 'Mission Command is already in that state.');
        return;
      }
      dispatchPersistenceAdapter.applyMissionCommandMutation(
        expeditionId,
        persistenceDefaults,
        result.command,
        result.event,
      );
      onCommandMutation?.(result);
      onStatusMessage?.(`${result.command.title}: ${actionResultLabel(actionId)}.`);
    };

    if (actionId === 'cancel') {
      Alert.alert(
        personalAction ? 'Cancel Personal Action?' : 'Cancel Mission Command?',
        personalAction
          ? 'This records a local cancellation. It does not contact, notify, or transmit to anyone.'
          : 'This records an explicit cancellation in the command history. It does not contact or notify emergency services.',
        [
          { text: personalAction ? 'Keep Action' : 'Keep Command', style: 'cancel' },
          { text: personalAction ? 'Cancel Action' : 'Cancel Command', style: 'destructive', onPress: commit },
        ],
      );
      return;
    }
    commit();
  }, [
    actor,
    canManageCommands,
    canViewLinkedContext,
    expeditionId,
    onCommandMutation,
    onStatusMessage,
    onReassignCommand,
    onRequestFollowUp,
    onViewLinkedContext,
    persistenceDefaults,
  ]);

  const openCommand = useCallback((commandId: string) => {
    setSelectedCommandId(commandId);
  }, []);

  const showMoreOpenCommands = useCallback((sectionId: OpenMissionCommandSectionId) => {
    setOpenSectionLimits((current) => ({
      ...current,
      [sectionId]: current[sectionId] + OPEN_SECTION_WINDOW_SIZE,
    }));
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.loadingState} testID={`${testID}-loading`}>
        <Ionicons name="sync-outline" size={20} color={TACTICAL.amber} />
        <Text style={styles.loadingTitle}>Loading Mission Command</Text>
        <Text style={styles.loadingDetail}>Restoring local command state.</Text>
      </View>
    );
  }

  const content = (
    <View style={[styles.content, isLandscape ? styles.contentLandscape : null]}>
      <MissionCommandBoardHeader
        summary={model.summary}
        missionClock={missionClock}
        isLandscape={isLandscape}
        soloMode={soloMode}
        canCreateCommands={canCreateCommands}
        onCreateCommand={onCreateCommand}
        onOpenLostCommunications={onOpenLostCommunications}
        onOpenVehicleImmobilized={onOpenVehicleImmobilized}
        onOpenRouteBlockage={onOpenRouteBlockage}
        onOpenGuardianCheckIns={onOpenGuardianCheckIns}
        onOpenSmartRally={onOpenSmartRally}
        onOpenCommsPlan={onOpenCommsPlan}
        onOpenIncidentRoom={onOpenIncidentRoom}
      />

      <DispatchMissionClockPanel
        snapshot={missionClock}
        onOpenCommand={openCommand}
      />

      {model.notices.map((notice) => (
        <View
          key={notice.kind}
          style={styles.notice}
          accessibilityRole="alert"
          accessibilityLabel={notice.label}
        >
          <Ionicons
            name={notice.kind === 'migration_recovered' ? 'warning-outline' : 'information-circle-outline'}
            size={14}
            color={notice.kind === 'migration_recovered' ? TACTICAL.danger : TACTICAL.amber}
          />
          <Text style={styles.noticeText}>{notice.label}</Text>
        </View>
      ))}

      {model.degradedState ? (
        <View
          style={styles.degradedState}
          accessibilityRole="summary"
          accessibilityLabel={`${model.degradedState.title}. ${model.degradedState.detail}`}
        >
          <Ionicons
            name={degradedStateIcon(model.degradedState.kind)}
            size={18}
            color={model.degradedState.kind === 'permission_restricted' ? TACTICAL.danger : TACTICAL.amber}
          />
          <View style={styles.degradedCopy}>
            <Text style={styles.degradedTitle}>{model.degradedState.title}</Text>
            <Text style={styles.degradedDetail}>{model.degradedState.detail}</Text>
          </View>
        </View>
      ) : null}

      {canViewCommands && model.visibleCommandCount > 0 ? (
        <View style={[styles.sections, isLandscape ? styles.sectionsLandscape : null]}>
          <MissionCommandBoardSection
            section={visibleSections.needsDecision}
            sourceTruthNow={presentationNow}
            onOpenCommand={openCommand}
            onShowMore={visibleSections.needsDecision.hasMore
              ? () => showMoreOpenCommands('needs_decision')
              : undefined}
          />
          <MissionCommandBoardSection
            section={visibleSections.awaitingAcknowledgment}
            sourceTruthNow={presentationNow}
            onOpenCommand={openCommand}
            onShowMore={visibleSections.awaitingAcknowledgment.hasMore
              ? () => showMoreOpenCommands('awaiting_acknowledgment')
              : undefined}
          />
          <MissionCommandBoardSection
            section={visibleSections.inProgress}
            sourceTruthNow={presentationNow}
            onOpenCommand={openCommand}
            onShowMore={visibleSections.inProgress.hasMore
              ? () => showMoreOpenCommands('in_progress')
              : undefined}
          />
          <MissionCommandBoardSection
            section={visibleSections.resolved}
            sourceTruthNow={presentationNow}
            onOpenCommand={openCommand}
            onShowMore={visibleSections.resolved.hasMore
              ? () => setResolvedPage((page) => page + 1)
              : undefined}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root} testID={testID}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!outerShellOwnsScrolling}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
      <MissionCommandDetailSheet
        card={selectedCard}
        contextInspection={selectedContextInspection}
        events={selectedEvents}
        sourceTruthNow={presentationNow}
        onClose={() => setSelectedCommandId(null)}
        onAction={applyAction}
        onOpenIncidentRoom={onOpenIncidentRoomForCommand}
        onPrepareSoloCommandForTeam={onPrepareSoloCommandForTeam}
      />
    </View>
  );
}

export default React.memo(DispatchMissionCommandBoard);

function MissionCommandBoardHeader({
  summary,
  missionClock,
  isLandscape,
  soloMode,
  canCreateCommands,
  onCreateCommand,
  onOpenLostCommunications,
  onOpenVehicleImmobilized,
  onOpenRouteBlockage,
  onOpenGuardianCheckIns,
  onOpenSmartRally,
  onOpenCommsPlan,
  onOpenIncidentRoom,
}: {
  summary: ReturnType<typeof buildMissionCommandBoardPresentation>['summary'];
  missionClock: ReturnType<typeof useMissionClockScheduler>;
  isLandscape: boolean;
  soloMode: boolean;
  canCreateCommands: boolean;
  onCreateCommand?: () => void;
  onOpenLostCommunications?: () => void;
  onOpenVehicleImmobilized?: () => void;
  onOpenRouteBlockage?: () => void;
  onOpenGuardianCheckIns?: () => void;
  onOpenSmartRally?: () => void;
  onOpenCommsPlan?: () => void;
  onOpenIncidentRoom?: () => void;
}) {
  return (
    <View
      style={[styles.header, isLandscape ? styles.headerLandscape : null]}
      accessibilityRole="summary"
      accessibilityLabel={[
        soloMode ? 'Personal Mission Command Board' : 'Mission Command Command Board',
        `${summary.openCount} ${soloMode ? 'open personal actions' : 'open commands'}`,
        `${summary.awaitingAcknowledgmentCount} ${soloMode ? 'check-ins requiring review' : 'awaiting acknowledgment'}`,
        `${summary.decisionRequiredCount} need a decision`,
        summary.convoyLabel,
        summary.connectionLabel,
      ].join('. ')}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{soloMode ? 'SOLO OPERATIONS' : 'DISPATCH OPERATIONS'}</Text>
          <Text style={styles.missionTitle}>{soloMode ? 'PERSONAL COMMAND BOARD' : 'COMMAND BOARD'}</Text>
          <Text style={styles.boardTitle}>{soloMode ? 'LOCAL FIELD CONTROL' : 'ACTIVE EXPEDITION CONTROL'}</Text>
        </View>
        <View style={styles.headerState}>
          <ECSBadge
            label={summary.connectionLabel}
            tone={summary.connectionLabel.includes('unavailable') || summary.connectionLabel.includes('Offline')
              ? 'warning'
              : 'live'}
            icon="radio-outline"
            compact
          />
          <Text style={styles.convoySummary} numberOfLines={2}>{summary.convoyLabel}</Text>
          {canCreateCommands && onCreateCommand ? (
            <ECSButton
              label={soloMode ? 'New Personal Action' : 'New Command'}
              icon={soloMode ? 'add-circle-outline' : 'add-outline'}
              variant="primary"
              size="compact"
              onPress={onCreateCommand}
              accessibilityLabel={soloMode ? 'Create personal Mission Command action' : 'Create Mission Command'}
            />
          ) : null}
          {!soloMode && canCreateCommands && onOpenLostCommunications ? (
            <ECSButton
              label="Lost Comms"
              icon="radio-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenLostCommunications}
              accessibilityLabel="Open Lost Communications operational playbook"
            />
          ) : null}
          {canCreateCommands && onOpenVehicleImmobilized ? (
            <ECSButton
              label="Vehicle Immobilized"
              icon="car-sport-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenVehicleImmobilized}
              accessibilityLabel="Open Vehicle Immobilized operational playbook"
            />
          ) : null}
          {canCreateCommands && onOpenRouteBlockage ? (
            <ECSButton
              label="Route Blockage"
              icon="trail-sign-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenRouteBlockage}
              accessibilityLabel="Open Route Blockage operational playbook"
            />
          ) : null}
          {canCreateCommands && onOpenGuardianCheckIns ? (
            <ECSButton
              label="Guardian Check-Ins"
              icon="shield-checkmark-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenGuardianCheckIns}
              accessibilityLabel="Open Guardian Check-Ins"
            />
          ) : null}
          {!soloMode && canCreateCommands && onOpenSmartRally ? (
            <ECSButton
              label="Smart Rally"
              icon="git-merge-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenSmartRally}
              accessibilityLabel="Open Smart Rally convoy workflow"
            />
          ) : null}
          {soloMode && onOpenCommsPlan ? (
            <ECSButton
              label="Comms Plan"
              icon="radio-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenCommsPlan}
              accessibilityLabel="Open saved manual communication procedures"
            />
          ) : null}
          {onOpenIncidentRoom ? (
            <ECSButton
              label="Incident Room"
              icon="warning-outline"
              variant="secondary"
              size="compact"
              onPress={onOpenIncidentRoom}
              accessibilityLabel="Open the active Mission Command Incident Room"
            />
          ) : null}
        </View>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryMetric label={soloMode ? 'Open Actions' : 'Open'} value={summary.openCount} />
        <SummaryMetric label={soloMode ? 'Check-In Review' : 'Awaiting Ack'} value={summary.awaitingAcknowledgmentCount} />
        <SummaryMetric label={soloMode ? 'Decisions' : 'Needs Decision'} value={summary.decisionRequiredCount} />
        <MissionClockHeaderMetric snapshot={missionClock} />
      </View>
    </View>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
      <Text style={styles.summaryMetricValue}>{value}</Text>
    </View>
  );
}

function MissionCommandBoardSection({
  section,
  sourceTruthNow,
  onOpenCommand,
  onShowMore,
}: {
  section: MissionCommandBoardSectionPresentation;
  sourceTruthNow: number;
  onOpenCommand: (commandId: string) => void;
  onShowMore?: () => void;
}) {
  return (
    <View style={styles.section} testID={`dispatch-mission-section-${section.id}`}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionMarker, { backgroundColor: sectionTone(section.id) }]} />
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
        <Text style={styles.sectionCount}>{section.totalCount}</Text>
      </View>
      {section.items.length === 0 ? (
        <Text style={styles.sectionEmpty}>{section.emptyLabel}</Text>
      ) : (
        <View style={styles.cardStack}>
          {section.items.map((card) => (
            <MissionCommandCard
              key={card.key}
              card={card}
              sourceTruthNow={sourceTruthNow}
              onOpenCommand={onOpenCommand}
            />
          ))}
        </View>
      )}
      {onShowMore ? (
        <ECSButton
          label={`Show More ${section.title} (${section.totalCount - section.items.length})`}
          icon="chevron-down-outline"
          variant="tertiary"
          size="compact"
          onPress={onShowMore}
          accessibilityHint={`Adds the next bounded page of ${section.title.toLowerCase()} commands to the board.`}
        />
      ) : null}
    </View>
  );
}

const MissionCommandCard = React.memo(function MissionCommandCard({
  card,
  sourceTruthNow,
  onOpenCommand,
}: {
  card: MissionCommandCardPresentation;
  sourceTruthNow: number;
  onOpenCommand: (commandId: string) => void;
}) {
  const sourcePolicy = card.command.sourceTruth[0]?.policyKey;
  return (
    <TouchableOpacity
      style={[
        styles.commandCard,
        card.priority === 'critical' ? styles.commandCardCritical : null,
        card.deadlineState === 'overdue' ? styles.commandCardOverdue : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={card.accessibilityLabel}
      accessibilityHint="Opens command details, history, source truth, and available actions."
      activeOpacity={0.8}
      onPress={() => onOpenCommand(card.commandId)}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardBadgeRow}>
          <ECSBadge
            label={`${card.priorityLabel} priority`}
            tone={priorityTone(card.priority)}
            icon={card.priority === 'critical' ? 'alert-circle-outline' : 'flag-outline'}
            compact
          />
          <ECSBadge label={card.typeLabel} tone="category" compact />
          <ECSBadge label={card.operationalLabel} tone={operationalTone(card.command.operationalState)} compact />
        </View>
        <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
      </View>
      <Text style={styles.commandTitle} numberOfLines={2}>{card.title}</Text>
      <View style={styles.cardFacts}>
        <CardFact icon="locate-outline" label={card.targetLabel} />
        <CardFact icon="checkmark-done-outline" label={card.acknowledgmentLabel} />
        <CardFact
          icon={card.deadlineState === 'overdue' ? 'alert-circle-outline' : 'time-outline'}
          label={card.deadlineLabel}
          danger={card.deadlineState === 'overdue'}
        />
        {card.linkedContextLabel ? (
          <CardFact
            icon={card.linkedContextRestricted ? 'lock-closed-outline' : 'map-outline'}
            label={card.linkedContextLabel}
          />
        ) : null}
      </View>
      <View style={styles.cardSourceRow}>
        <View style={styles.sourceBadges}>
          <ECSSourceBadge
            sources={card.command.sourceTruth}
            policyKey={sourcePolicy}
            now={sourceTruthNow}
          />
          <ECSFreshnessBadge
            sources={card.command.sourceTruth}
            policyKey={sourcePolicy}
            now={sourceTruthNow}
          />
        </View>
        <View style={styles.deliveryBlock}>
          <Text style={[
            styles.deliveryLabel,
            card.deliveryState === 'failed' || card.deliveryState === 'queued'
              ? styles.deliveryLabelAttention
              : null,
          ]} numberOfLines={1}>
            {card.deliveryLabel}
          </Text>
          <Text style={styles.updatedLabel} numberOfLines={1}>{card.lastUpdateLabel}</Text>
        </View>
      </View>
      <View style={styles.cardActionRow}>
        <Text style={styles.recommendedLabel}>NEXT</Text>
        <Text style={styles.recommendedAction} numberOfLines={1}>{card.recommendedActionLabel}</Text>
      </View>
    </TouchableOpacity>
  );
});

function CardFact({
  icon,
  label,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.cardFact}>
      <Ionicons name={icon} size={12} color={danger ? TACTICAL.danger : TACTICAL.textMuted} />
      <Text style={[styles.cardFactText, danger ? styles.cardFactDanger : null]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function MissionCommandDetailSheet({
  card,
  contextInspection,
  events,
  sourceTruthNow,
  onClose,
  onAction,
  onOpenIncidentRoom,
  onPrepareSoloCommandForTeam,
}: {
  card: MissionCommandCardPresentation | null;
  contextInspection: MissionCommandContextInspection | null;
  events: MissionCommandEvent[];
  sourceTruthNow: number;
  onClose: () => void;
  onAction: (actionId: MissionCommandBoardActionId, command: MissionCommand) => void;
  onOpenIncidentRoom?: (command: MissionCommand) => void;
  onPrepareSoloCommandForTeam?: (command: MissionCommand) => void;
}) {
  if (!card) return null;
  const command = card.command;
  const policyKey = command.sourceTruth[0]?.policyKey;

  return (
    <ECSModalShell
      visible
      onClose={onClose}
      title={command.title}
      subtitle={`${card.typeLabel} / ${card.operationalLabel}`}
      eyebrow={command.target.kind === 'solo' ? 'PERSONAL ACTION DETAIL' : 'MISSION COMMAND DETAIL'}
      icon="clipboard-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={900}
      maxHeightFraction={0.9}
      minHeightFraction={0.72}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.detailContent}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Close"
            icon="close-outline"
            variant="tertiary"
            size="medium"
            grow
            onPress={onClose}
          />
          {command.target.kind === 'solo' && onPrepareSoloCommandForTeam ? (
            <ECSButton
              label="Prepare Team Draft"
              icon="people-outline"
              variant="secondary"
              size="medium"
              onPress={() => onPrepareSoloCommandForTeam(command)}
              accessibilityLabel="Prepare this personal action as a local team command draft"
            />
          ) : null}
          {card.allowedActions[0] ? (
            <DetailActionButton
              action={card.allowedActions[0]}
              onPress={() => onAction(card.allowedActions[0].id, command)}
              grow
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.detailRoot} accessibilityViewIsModal>
        <View style={styles.detailBadgeRow}>
          <ECSBadge
            label={`${card.priorityLabel} priority`}
            tone={priorityTone(card.priority)}
            icon="flag-outline"
            compact
          />
          <ECSBadge label={card.operationalLabel} tone={operationalTone(command.operationalState)} compact />
          <ECSBadge label={card.deliveryLabel} tone={deliveryTone(command.deliveryState)} compact />
        </View>

        <DetailSection title="Instructions" icon="document-text-outline">
          <Text style={styles.instructions}>{command.instructions}</Text>
        </DetailSection>

        <View style={styles.detailGrid}>
          <DetailSection title={command.target.kind === 'solo' ? 'Local Ownership' : 'Participants'} icon="people-outline" compact>
            <DetailRow label="Created by" value={command.creator.label} />
            <DetailRow label="Target" value={card.targetLabel} />
            <DetailRow label="Acknowledgment" value={card.acknowledgmentLabel} />
            {command.acknowledgments.map((acknowledgment) => (
              <DetailRow
                key={acknowledgment.id}
                label={acknowledgment.memberId}
                value={`${acknowledgment.response} / ${formatTimestamp(acknowledgment.respondedAt)}`}
              />
            ))}
          </DetailSection>

          <DetailSection title={command.target.kind === 'solo' ? 'Personal Action And Clock' : 'Assignment And Clock'} icon="time-outline" compact>
            <DetailRow label="Assignment" value={card.assignmentLabel ?? 'No named assignee'} />
            <DetailRow label="Deadline" value={card.deadlineLabel} danger={card.deadlineState === 'overdue'} />
            <DetailRow label="Last update" value={formatTimestamp(command.updatedAt)} />
          </DetailSection>
        </View>

        <DetailSection title="Linked Context" icon="map-outline">
          {command.linkedContext ? (
            <>
              <DetailRow
                label="Type"
                value={getDispatchContextTypeLabel(command.linkedContext.type)}
              />
              <DetailRow
                label="Context"
                value={command.linkedContext.restricted ? 'Restricted context' : command.linkedContext.title}
              />
              {command.linkedContext.subtitle && !command.linkedContext.restricted ? (
                <Text style={styles.contextDetail}>{command.linkedContext.subtitle}</Text>
              ) : null}
              <DetailRow
                label="State"
                value={contextInspection?.stateLabel ?? (command.linkedContext.restricted
                  ? 'Restricted'
                  : command.linkedContext.stale
                    ? 'Stale'
                    : command.linkedContext.sourceTruth?.availability === 'unavailable'
                      ? 'Unavailable'
                      : command.linkedContext.sourceTruth
                        ? 'Available'
                        : 'Source unknown')}
              />
              <DetailRow
                label="Observed"
                value={contextInspection?.observedAt
                  ? formatTimestamp(contextInspection.observedAt)
                  : command.linkedContext.observedAt
                  ? formatTimestamp(command.linkedContext.observedAt)
                  : command.linkedContext.sourceTruth?.observedAt
                    ? formatTimestamp(command.linkedContext.sourceTruth.observedAt)
                    : 'Unknown'}
              />
              {(contextInspection?.sourceTruth ?? command.linkedContext.sourceTruth) &&
              contextInspection?.state !== 'restricted' &&
              !command.linkedContext.restricted ? (
                <View style={styles.detailSourceRow}>
                  <ECSSourceBadge
                    sources={[contextInspection?.sourceTruth ?? command.linkedContext.sourceTruth!]}
                    policyKey={contextInspection?.sourceTruthPolicyKey ?? command.linkedContext.sourceTruthPolicyKey}
                    now={sourceTruthNow}
                  />
                  <ECSFreshnessBadge
                    sources={[contextInspection?.sourceTruth ?? command.linkedContext.sourceTruth!]}
                    policyKey={contextInspection?.sourceTruthPolicyKey ?? command.linkedContext.sourceTruthPolicyKey}
                    now={sourceTruthNow}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyDetail}>No linked route, pin, vehicle, camp, or resource context.</Text>
          )}
        </DetailSection>

        <DetailSection title="Source Truth" icon="shield-checkmark-outline">
          <View style={styles.detailSourceRow}>
            <ECSSourceBadge sources={command.sourceTruth} policyKey={policyKey} now={sourceTruthNow} />
            <ECSFreshnessBadge sources={command.sourceTruth} policyKey={policyKey} now={sourceTruthNow} />
            <SourceTruthInspectorTrigger
              sources={command.sourceTruth}
              policyKey={policyKey}
              now={sourceTruthNow}
              dependencies={['Mission Command state', 'Dispatch acknowledgment state', 'Command Board placement']}
              label="Source details"
              testID="dispatch-mission-command-source-details"
            />
          </View>
        </DetailSection>

        <DetailSection title="Command History" icon="time-outline">
          {events.length === 0 ? (
            <Text style={styles.emptyDetail}>No command events recorded yet.</Text>
          ) : events.map((event) => (
            <View key={event.id} style={styles.historyRow}>
              <View style={styles.historyDot} />
              <View style={styles.historyCopy}>
                <Text style={styles.historyTitle}>{formatEventType(event.type)}</Text>
                <Text style={styles.historySummary}>{event.summary}</Text>
              </View>
              <Text style={styles.historyTime}>{formatTimestamp(event.occurredAt)}</Text>
            </View>
          ))}
        </DetailSection>

        {command.resolution ? (
          <DetailSection title="Resolution" icon="checkmark-circle-outline">
            <Text style={styles.instructions}>{command.resolution.summary}</Text>
            <DetailRow label="Recorded" value={formatTimestamp(command.resolution.occurredAt)} />
          </DetailSection>
        ) : null}

        <DetailSection title="Allowed Actions" icon="flash-outline">
          {card.allowedActions.length === 0 ? (
            <Text style={styles.emptyDetail}>No state changes are available for this command.</Text>
          ) : (
            <View style={styles.detailActions}>
              {card.allowedActions.map((action) => (
                <DetailActionButton
                  key={action.id}
                  action={action.id === 'view_context' && command.linkedContext
                    ? {
                        ...action,
                        label: getMissionCommandContextPrimaryActionLabel(command.linkedContext),
                      }
                    : action}
                  onPress={() => onAction(action.id, command)}
                />
              ))}
            </View>
          )}
          {onOpenIncidentRoom ? (
            <ECSButton
              label={getMissionCommandIncidentId(command) ? 'Open Incident Room' : 'Create Incident Room'}
              icon="warning-outline"
              variant="secondary"
              size="compact"
              onPress={() => onOpenIncidentRoom(command)}
              accessibilityHint={getMissionCommandIncidentId(command)
                ? 'Opens the canonical Incident and Recovery record linked to this command.'
                : 'Requests explicit confirmation before creating a canonical Incident and Recovery record.'}
            />
          ) : null}
          <Text style={styles.safetyCopy}>
            Mission Command coordinates the ECS expedition team only. It does not contact emergency services.
          </Text>
        </DetailSection>
      </View>
    </ECSModalShell>
  );
}

function DetailSection({
  title,
  icon,
  compact = false,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.detailSection, compact ? styles.detailSectionCompact : null]}>
      <View style={styles.detailSectionHeader}>
        <Ionicons name={icon} size={14} color={TACTICAL.amber} />
        <Text style={styles.detailSectionTitle}>{title}</Text>
      </View>
      <View style={styles.detailSectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={[styles.detailRowValue, danger ? styles.detailRowDanger : null]}>{value}</Text>
    </View>
  );
}

function DetailActionButton({
  action,
  onPress,
  grow = false,
}: {
  action: MissionCommandBoardActionModel;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <ECSButton
      label={action.label}
      icon={actionIcon(action.id)}
      variant={action.tone === 'danger' ? 'destructive' : action.tone === 'primary' ? 'primary' : 'secondary'}
      size="medium"
      grow={grow}
      onPress={onPress}
    />
  );
}

function useDispatchPersistenceRevision(expeditionId: string): number {
  const subscribe = useCallback((listener: () => void) => (
    dispatchPersistenceAdapter.subscribe((changedExpeditionId) => {
      if (changedExpeditionId === expeditionId) listener();
    })
  ), [expeditionId]);
  const getSnapshot = useCallback(
    () => dispatchPersistenceAdapter.getRevision(expeditionId),
    [expeditionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useMissionCommandConvoySummary({
  convoyId,
  fallbackMemberCount,
  permitted,
}: {
  convoyId: string | null;
  fallbackMemberCount: number;
  permitted: boolean;
}) {
  const getFingerprint = useCallback(() => {
    const snapshot = convoyTrackingStore.getSnapshot();
    if (!convoyId || snapshot.convoyId !== convoyId) {
      return `${convoyId ?? 'none'}:${fallbackMemberCount}:0`;
    }
    return `${snapshot.convoyId}:${snapshot.members.length}:${snapshot.staleCount}`;
  }, [convoyId, fallbackMemberCount]);
  const fingerprint = useSyncExternalStore(
    convoyTrackingStore.subscribe,
    getFingerprint,
    getFingerprint,
  );
  return useMemo(() => {
    const [, memberToken, staleToken] = fingerprint.split(':');
    return {
      permitted,
      active: Boolean(convoyId),
      memberCount: Number.parseInt(memberToken ?? '', 10) || Math.max(0, fallbackMemberCount),
      staleCount: Number.parseInt(staleToken ?? '', 10) || 0,
    };
  }, [convoyId, fallbackMemberCount, fingerprint, permitted]);
}

function transitionForBoardAction(
  actionId: MissionCommandBoardActionId,
  command: MissionCommand,
  actor: MissionCommandActor,
): MissionCommandMutationResult | null {
  const occurredAt = new Date().toISOString();
  if (actionId === 'retry_delivery') {
    return transitionMissionCommandDeliveryState(command, 'queued', {
      actor,
      occurredAt,
      reasonCode: 'manual_board_retry',
    });
  }
  const targetState = {
    stage: 'ready',
    activate: 'active',
    start: 'in_progress',
    resume: 'in_progress',
    block: 'blocked',
    resolve: 'resolved',
    cancel: 'cancelled',
  } as const;
  if (!(actionId in targetState)) return null;
  return transitionMissionCommandOperationalState(command, targetState[actionId as keyof typeof targetState], {
    actor,
    occurredAt,
    reasonCode: `manual_board_${actionId}`,
    resolutionSummary: actionId === 'resolve'
      ? 'Resolved from the Mission Command Board.'
      : actionId === 'cancel'
        ? 'Cancelled from the Mission Command Board.'
        : undefined,
  });
}

function actionResultLabel(actionId: MissionCommandBoardActionId): string {
  switch (actionId) {
    case 'stage': return 'staged';
    case 'activate': return 'activated';
    case 'start': return 'marked in progress';
    case 'resume': return 'resumed';
    case 'block': return 'marked blocked';
    case 'resolve': return 'resolved';
    case 'cancel': return 'cancelled';
    case 'reassign': return 'reassigned';
    case 'request_follow_up': return 'follow-up requested';
    case 'retry_delivery': return 'queued for delivery retry';
    case 'view_context': return 'context opened';
  }
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEventType(type: MissionCommandEvent['type']): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function priorityTone(priority: MissionCommand['priority']): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (priority === 'critical') return 'unavailable';
  if (priority === 'high') return 'warning';
  if (priority === 'low') return 'category';
  return 'info';
}

function operationalTone(
  state: MissionCommand['operationalState'],
): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (state === 'blocked' || state === 'expired') return 'warning';
  if (state === 'cancelled') return 'unavailable';
  if (state === 'active' || state === 'in_progress') return 'active';
  if (state === 'resolved') return 'ready';
  return 'info';
}

function deliveryTone(
  state: MissionCommand['deliveryState'],
): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (state === 'failed' || state === 'cancelled') return 'unavailable';
  if (state === 'queued' || state === 'retrying') return 'warning';
  if (state === 'delivered') return 'ready';
  return 'info';
}

function sectionTone(section: MissionCommandBoardSectionPresentation['id']): string {
  if (section === 'needs_decision') return TACTICAL.danger;
  if (section === 'awaiting_acknowledgment') return TACTICAL.amber;
  if (section === 'in_progress') return TACTICAL.text;
  return TACTICAL.textMuted;
}

function degradedStateIcon(
  kind: NonNullable<ReturnType<typeof buildMissionCommandBoardPresentation>['degradedState']>['kind'],
): React.ComponentProps<typeof Ionicons>['name'] {
  switch (kind) {
    case 'permission_restricted': return 'lock-closed-outline';
    case 'no_active_expedition': return 'flag-outline';
    case 'offline': return 'cloud-offline-outline';
    case 'realtime_unavailable': return 'radio-outline';
    case 'solo': return 'person-outline';
    case 'feature_disabled': return 'pause-circle-outline';
    case 'empty': return 'clipboard-outline';
  }
}

function actionIcon(
  id: MissionCommandBoardActionId,
): React.ComponentProps<typeof Ionicons>['name'] {
  switch (id) {
    case 'stage': return 'layers-outline';
    case 'activate': return 'radio-outline';
    case 'start': return 'play-outline';
    case 'resume': return 'play-forward-outline';
    case 'block': return 'pause-circle-outline';
    case 'resolve': return 'checkmark-circle-outline';
    case 'cancel': return 'close-circle-outline';
    case 'reassign': return 'people-outline';
    case 'request_follow_up': return 'return-up-forward-outline';
    case 'retry_delivery': return 'refresh-outline';
    case 'view_context': return 'map-outline';
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingVertical: 7,
    gap: 8,
  },
  contentLandscape: {
    paddingTop: 4,
  },
  navigation: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  navigationShell: {
    gap: 4,
  },
  navigationHeading: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 4,
  },
  navigationEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
  },
  navigationTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  navigationActiveLabel: {
    maxWidth: '46%',
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
  },
  navigationTab: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  navigationTabSelected: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  navigationLabel: {
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  navigationLabelSelected: {
    color: TACTICAL.text,
  },
  header: {
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.primary,
  },
  headerLandscape: {
    paddingVertical: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  missionTitle: {
    marginTop: 2,
    color: TACTICAL.text,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  boardTitle: {
    marginTop: 1,
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerState: {
    maxWidth: '48%',
    alignItems: 'flex-end',
    gap: 5,
  },
  convoySummary: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryMetric: {
    minHeight: 48,
    flexGrow: 1,
    flexBasis: 78,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  summaryMetricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryMetricValue: {
    marginTop: 2,
    color: TACTICAL.text,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  notice: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  noticeText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  degradedState: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  degradedCopy: {
    flex: 1,
    minWidth: 0,
  },
  degradedTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  degradedDetail: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  sections: {
    gap: 10,
  },
  sectionsLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  section: {
    flexGrow: 1,
    flexBasis: 340,
    minWidth: 0,
    gap: 6,
  },
  sectionHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionMarker: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  sectionCount: {
    minWidth: 24,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'right',
    fontFamily: 'Courier',
  },
  sectionEmpty: {
    paddingVertical: 9,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
  },
  cardStack: {
    gap: 7,
  },
  commandCard: {
    minHeight: 150,
    padding: 10,
    gap: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  commandCardCritical: {
    borderColor: ECS_SURFACE.border.warning,
  },
  commandCardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardBadgeRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  commandTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  cardFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  cardFact: {
    minHeight: 27,
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 5,
  },
  cardFactText: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
  },
  cardFactDanger: {
    color: TACTICAL.danger,
    fontWeight: '900',
  },
  cardSourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceBadges: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  deliveryBlock: {
    maxWidth: '44%',
    alignItems: 'flex-end',
  },
  deliveryLabel: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
  },
  deliveryLabelAttention: {
    color: TACTICAL.amber,
  },
  updatedLabel: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    textAlign: 'right',
  },
  cardActionRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: 6,
  },
  recommendedLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
  },
  recommendedAction: {
    flex: 1,
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  loadingState: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  loadingTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  loadingDetail: {
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  detailContent: {
    paddingBottom: 12,
  },
  detailRoot: {
    gap: 10,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailSection: {
    gap: 7,
    padding: 10,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  detailSectionCompact: {
    flexGrow: 1,
    flexBasis: 280,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  detailSectionTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  detailSectionBody: {
    gap: 6,
  },
  instructions: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 18,
  },
  detailRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailRowLabel: {
    flexBasis: '36%',
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  detailRowValue: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
  },
  detailRowDanger: {
    color: TACTICAL.danger,
    fontWeight: '900',
  },
  contextDetail: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  detailSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  historyRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  historyDot: {
    width: 7,
    height: 7,
    marginTop: 4,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  historySummary: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  historyTime: {
    maxWidth: 94,
    color: TACTICAL.textMuted,
    fontSize: 8,
    textAlign: 'right',
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  safetyCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontStyle: 'italic',
  },
  emptyDetail: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
});
