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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { DispatchOperationalPlaybookRunner } from './DispatchOperationalPlaybookRunner';
import {
  createMissionCommandComposerFormFromPlaybookProposal,
  type MissionCommandPlaybookComposerRequest,
} from '../../lib/dispatchMissionCommandComposer';
import {
  buildRouteBlockageIncidentHandoff,
  createRouteBlockagePlaybook,
  ROUTE_BLOCKAGE_INPUT_KEYS,
  ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
  ROUTE_BLOCKAGE_PLAYBOOK_ID,
  ROUTE_BLOCKAGE_STEP_IDS,
  selectRouteBlockageContextReview,
  selectRouteBlockageRecordedOutcome,
  validateRouteBlockageOutcome,
  type RouteBlockageCreateInput,
  type RouteBlockageOutcome,
  type RouteBlockageReportedCondition,
  type RouteBlockageReportSourceKind,
} from '../../lib/dispatchRouteBlockagePlaybook';
import {
  collectOperationalPlaybookDeadlines,
  evaluateOperationalPlaybookReadiness,
  executeOperationalPlaybookStep,
  transitionOperationalPlaybookState,
} from '../../lib/dispatchOperationalPlaybookDomain';
import type {
  OperationalPlaybookCommandProposal,
  OperationalPlaybookEvent,
  OperationalPlaybookInputValue,
  OperationalPlaybookInstance,
  OperationalPlaybookMutationResult,
  OperationalPlaybookRuntimeContext,
} from '../../lib/dispatchOperationalPlaybookTypes';
import type { MissionCommandActor } from '../../lib/dispatchMissionCommandTypes';
import type { ReportIncidentInput } from '../../lib/incidentRecoveryWorkflowStore';
import type { DispatchLinkedContext } from '../../lib/dispatchTypes';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from '../../lib/dispatchPersistenceAdapter';
import type { OperationalPlaybookRunnerIntent } from '../../lib/dispatchOperationalPlaybookPresentation';
import { useMissionClockScheduler } from '../../lib/useMissionClockScheduler';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';

export interface RouteBlockageLaunchInput {
  reportSourceKind: RouteBlockageReportSourceKind;
  reportedCondition: RouteBlockageReportedCondition;
  reporterId: string;
  affectedMemberIds: string[];
  includePermittedLocation: boolean;
}

export interface DispatchRouteBlockagePlaybookProps {
  enabled: boolean;
  visible: boolean;
  requestedInstanceId?: string | null;
  expeditionId: string;
  persistenceDefaults: DispatchPersistenceDefaults;
  actor: MissionCommandActor;
  soloMode: boolean;
  members: { id: string; label: string; roleId?: string }[];
  hasPermittedLocation: boolean;
  runtime: OperationalPlaybookRuntimeContext;
  createInput: (launch: RouteBlockageLaunchInput) => RouteBlockageCreateInput;
  onClose: () => void;
  onOpenCommandComposer: (request: MissionCommandPlaybookComposerRequest) => void;
  onOpenContext: (instanceId: string, context: DispatchLinkedContext) => void;
  onOpenIncidentReview: (prefill: ReportIncidentInput) => void;
  onPlaybookEvent?: (event: OperationalPlaybookEvent, instance: OperationalPlaybookInstance) => void;
  onStatusMessage?: (message: string) => void;
}

const REPORT_SOURCE_OPTIONS: { value: RouteBlockageReportSourceKind; label: string }[] = [
  { value: 'member_report', label: 'Member Report' },
  { value: 'operator_report', label: 'Operator Report' },
  { value: 'community_report', label: 'Community Report' },
  { value: 'unknown', label: 'Unknown Source' },
];
const CONDITION_OPTIONS: { value: RouteBlockageReportedCondition; label: string }[] = [
  { value: 'blocked', label: 'Blocked' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'unsafe_to_continue', label: 'Unsafe To Continue' },
  { value: 'cannot_verify', label: 'Cannot Verify' },
];
const OUTCOMES: { id: RouteBlockageOutcome; label: string }[] = [
  { id: 'obstacle_cleared', label: 'Obstacle Cleared' },
  { id: 'proceed_with_caution', label: 'Proceed With Caution' },
  { id: 'turnaround', label: 'Turnaround' },
  { id: 'alternate_route_selected', label: 'Alternate Route Selected' },
  { id: 'camp_plan_changed', label: 'Camp Plan Changed' },
  { id: 'route_abandoned', label: 'Route Abandoned' },
  { id: 'incident_created', label: 'Incident Created' },
];

export default function DispatchRouteBlockagePlaybook({
  enabled,
  visible,
  requestedInstanceId,
  expeditionId,
  persistenceDefaults,
  actor,
  soloMode,
  members,
  hasPermittedLocation,
  runtime,
  createInput,
  onClose,
  onOpenCommandComposer,
  onOpenContext,
  onOpenIncidentReview,
  onPlaybookEvent,
  onStatusMessage,
}: DispatchRouteBlockagePlaybookProps) {
  const revision = useDispatchPersistenceRevision(expeditionId);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<RouteBlockageReportSourceKind>('member_report');
  const [condition, setCondition] = useState<RouteBlockageReportedCondition>('blocked');
  const [reporterId, setReporterId] = useState(actor.id);
  const [affectedMemberIds, setAffectedMemberIds] = useState<string[]>(soloMode ? [actor.id] : []);
  const [includeLocation, setIncludeLocation] = useState(hasPermittedLocation);
  const [selectedAlternateId, setSelectedAlternateId] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<RouteBlockageOutcome | null>(null);
  const startingRef = useRef(false);

  const loadResult = useMemo(() => {
    void revision;
    return dispatchPersistenceAdapter.loadResult(expeditionId, persistenceDefaults);
  }, [expeditionId, persistenceDefaults, revision]);
  const instances = useMemo(() => loadResult.snapshot.operationalPlaybooks
    .filter((candidate) => candidate.definitionId === ROUTE_BLOCKAGE_PLAYBOOK_ID)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [loadResult.snapshot.operationalPlaybooks]);
  const resumable = instances.find((candidate) => !['completed', 'cancelled'].includes(candidate.state)) ?? null;
  const instance = instances.find((candidate) => candidate.id === selectedInstanceId) ?? resumable;
  const deadlines = useMemo(() => instance ? collectOperationalPlaybookDeadlines(instance) : [], [instance]);
  const missionClock = useMissionClockScheduler({
    expeditionId,
    deadlines,
    enabled: visible && instance != null,
  });
  const readiness = useMemo(() => instance
    ? evaluateOperationalPlaybookReadiness(
        ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
        instance,
        runtime,
        missionClock.nowMs,
      )
    : null, [instance, missionClock.nowMs, runtime]);
  const review = useMemo(() => instance
    ? selectRouteBlockageContextReview({
        instance,
        commands: loadResult.snapshot.missionCommands,
        members,
        now: missionClock.nowMs,
      })
    : null, [instance, loadResult.snapshot.missionCommands, members, missionClock.nowMs]);
  const recordedOutcome = useMemo(
    () => instance ? selectRouteBlockageRecordedOutcome(instance) : null,
    [instance],
  );

  useEffect(() => {
    if (!visible) {
      setSelectedInstanceId(null);
      setSourceKind('member_report');
      setCondition('blocked');
      setReporterId(actor.id);
      setAffectedMemberIds(soloMode ? [actor.id] : []);
      setIncludeLocation(hasPermittedLocation);
      setSelectedAlternateId('');
      setSelectedOutcome(null);
    }
  }, [actor.id, hasPermittedLocation, soloMode, visible]);

  useEffect(() => {
    if (visible && requestedInstanceId && instances.some((candidate) => candidate.id === requestedInstanceId)) {
      setSelectedInstanceId(requestedInstanceId);
    }
  }, [instances, requestedInstanceId, visible]);

  useEffect(() => {
    setSelectedAlternateId(review?.selectedAlternateRouteId ?? '');
    setSelectedOutcome(recordedOutcome);
  }, [instance?.id, recordedOutcome, review?.selectedAlternateRouteId]);

  const publishEvent = useCallback((event: OperationalPlaybookEvent | null | undefined, next: OperationalPlaybookInstance) => {
    if (event) onPlaybookEvent?.(event, next);
  }, [onPlaybookEvent]);

  const persistMutation = useCallback((result: OperationalPlaybookMutationResult) => {
    if (!result.ok) {
      onStatusMessage?.(result.reason);
      return false;
    }
    if (result.changed) {
      dispatchPersistenceAdapter.applyOperationalPlaybookMutation(expeditionId, persistenceDefaults, result.instance);
      publishEvent(result.event, result.instance);
      setSelectedInstanceId(result.instance.id);
    }
    return true;
  }, [expeditionId, onStatusMessage, persistenceDefaults, publishEvent]);

  const startPlaybook = useCallback(() => {
    if (startingRef.current) return;
    const reporter = members.find((member) => member.id === reporterId)
      ?? (reporterId === actor.id ? { id: actor.id, label: actor.label, roleId: actor.role } : null);
    if (!reporter) {
      onStatusMessage?.('Select a valid reporting member before starting the playbook.');
      return;
    }
    startingRef.current = true;
    try {
      const launch: RouteBlockageLaunchInput = {
        reportSourceKind: sourceKind,
        reportedCondition: condition,
        reporterId: reporter.id,
        affectedMemberIds,
        includePermittedLocation: includeLocation && hasPermittedLocation,
      };
      const result = createRouteBlockagePlaybook(createInput(launch));
      if (!result.ok) {
        onStatusMessage?.(result.reason);
        return;
      }
      const existing = instances.find((candidate) => candidate.idempotencyKey === result.instance.idempotencyKey);
      if (existing) {
        setSelectedInstanceId(existing.id);
        return;
      }
      dispatchPersistenceAdapter.upsertOperationalPlaybook(expeditionId, persistenceDefaults, result.instance);
      publishEvent(result.instance.eventHistory[0], result.instance);
      setSelectedInstanceId(result.instance.id);
    } finally {
      startingRef.current = false;
    }
  }, [
    actor.id,
    actor.label,
    actor.role,
    affectedMemberIds,
    condition,
    createInput,
    expeditionId,
    hasPermittedLocation,
    includeLocation,
    instances,
    members,
    onStatusMessage,
    persistenceDefaults,
    publishEvent,
    reporterId,
    sourceKind,
  ]);

  const execute = useCallback((
    current: OperationalPlaybookInstance,
    action: Parameters<typeof executeOperationalPlaybookStep>[2]['action'],
    actionId: string,
  ) => persistMutation(executeOperationalPlaybookStep(
    ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
    current,
    {
      actor,
      action,
      idempotencyKey: `${current.id}:${actionId}`,
      occurredAt: new Date().toISOString(),
    },
    runtime,
  )), [actor, persistMutation, runtime]);

  const transition = useCallback((
    current: OperationalPlaybookInstance,
    next: 'ready' | 'active' | 'paused' | 'cancelled',
    reason?: string,
  ) => persistMutation(transitionOperationalPlaybookState(
    ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
    current,
    next,
    {
      actor,
      runtime,
      occurredAt: new Date().toISOString(),
      reason,
      reasonCode: reason ? 'operator_selected' : undefined,
      idempotencyKey: `${current.id}:state:${next}:${current.version}`,
    },
  )), [actor, persistMutation, runtime]);

  const openConfirmedProposal = useCallback((
    current: OperationalPlaybookInstance,
    proposal: OperationalPlaybookCommandProposal,
  ) => {
    const draft = createMissionCommandComposerFormFromPlaybookProposal({
      proposal,
      actorId: actor.id,
      soloMode,
      members,
    });
    if (!draft.ok) {
      onStatusMessage?.(draft.reason);
      return;
    }
    onOpenCommandComposer({
      instanceId: current.id,
      proposalId: proposal.id,
      form: draft.form,
      extraContext: draft.extraContext,
      sourceTruth: draft.sourceTruth,
    });
    onClose();
  }, [actor.id, members, onClose, onOpenCommandComposer, onStatusMessage, soloMode]);

  const confirmProposal = useCallback((current: OperationalPlaybookInstance, proposalId: string) => {
    Alert.alert(
      'Confirm Route Blockage Proposal?',
      'This records approval and opens Command Composer. It does not send a command, publish a hazard, reroute, or replace guidance.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Confirm Proposal',
          onPress: () => {
            const result = executeOperationalPlaybookStep(
              ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
              current,
              {
                actor,
                action: { kind: 'confirm_command_proposal', proposalId, confirmed: true },
                idempotencyKey: `${current.id}:confirm:${proposalId}`,
                occurredAt: new Date().toISOString(),
              },
              runtime,
            );
            if (!persistMutation(result) || !result.ok || result.effect?.kind !== 'command_proposal_confirmed') return;
            openConfirmedProposal(result.instance, result.effect.proposal);
          },
        },
      ],
    );
  }, [actor, openConfirmedProposal, persistMutation, runtime]);

  const skipStep = useCallback((current: OperationalPlaybookInstance, reason: string) => {
    Alert.alert(
      'Skip This Step?',
      `${reason} The reason remains in the playbook timeline.`,
      [
        { text: 'Keep Step', style: 'cancel' },
        {
          text: 'Skip With Reason',
          onPress: () => execute(current, { kind: 'skip', reason }, `skip:${current.currentStepId}:${current.version}`),
        },
      ],
    );
  }, [execute]);

  const openContextStep = useCallback((
    current: OperationalPlaybookInstance,
    inputKey: string,
    unavailableReason: string,
  ) => {
    const context = current.inputSnapshot[inputKey]?.linkedContext;
    if (!context || context.restricted || current.inputSnapshot[inputKey]?.state === 'unavailable') {
      skipStep(current, unavailableReason);
      return;
    }
    const result = executeOperationalPlaybookStep(
      ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
      current,
      {
        actor,
        action: { kind: 'open_context' },
        idempotencyKey: `${current.id}:open-context:${current.currentStepId}:${current.version}`,
        occurredAt: new Date().toISOString(),
      },
      runtime,
    );
    if (persistMutation(result) && result.ok && result.effect?.kind === 'open_context') {
      onOpenContext(current.id, result.effect.context);
    }
  }, [actor, onOpenContext, persistMutation, runtime, skipStep]);

  const continueStep = useCallback((current: OperationalPlaybookInstance) => {
    const stepId = current.currentStepId;
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewReport || stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewRouteImpact) {
      execute(current, { kind: 'complete_review' }, `review:${stepId}:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.openLocation) {
      openContextStep(current, ROUTE_BLOCKAGE_INPUT_KEYS.locationContext, 'No permitted blockage location is available.');
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.proposeHazard) {
      if (!review?.affectedMembers.length) {
        skipStep(current, 'No affected member target is available.');
        return;
      }
      execute(current, { kind: 'prepare_command_proposal' }, `prepare-command:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewComparison) {
      if (!review?.alternateCandidates.length) {
        skipStep(current, 'No deterministic alternate-route comparison is available.');
        return;
      }
      execute(current, { kind: 'complete_review' }, `review-comparison:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.selectAlternate) {
      const candidate = review?.alternateCandidates.find((item) => item.id === selectedAlternateId);
      if (!candidate) {
        skipStep(current, 'No alternate route was selected.');
        return;
      }
      const now = new Date().toISOString();
      const value: OperationalPlaybookInputValue = {
        schemaVersion: 1,
        key: ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId,
        kind: 'text',
        state: 'available',
        scalarValue: candidate.id,
        sourceTruth: candidate.sourceTruth?.length
          ? candidate.sourceTruth
          : current.inputSnapshot[ROUTE_BLOCKAGE_INPUT_KEYS.alternateCandidates]?.sourceTruth ?? current.sourceTruth,
        observedAt: now,
        capturedAt: now,
        capturedBy: actor,
        manual: true,
      };
      execute(current, { kind: 'provide_input', input: value }, `alternate:${candidate.id}:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewBailout) {
      openContextStep(current, ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext, 'No existing bailout or turnaround context is available.');
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewCampImpact) {
      if (review?.campReassessmentState === 'unknown') {
        skipStep(current, 'Camp arrival and endpoint impact are currently unknown.');
        return;
      }
      execute(current, { kind: 'complete_review' }, `review-campops:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.reviewOfflineReadiness) {
      if (review?.offlineReadinessState === 'missing' || review?.offlineReadinessState === 'unknown') {
        skipStep(current, 'No verified Offline Prep audit is available for this route.');
        return;
      }
      execute(current, { kind: 'complete_review' }, `review-offline:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.recordOutcome) {
      if (!selectedOutcome) {
        onStatusMessage?.('Select a Route Blockage outcome.');
        return;
      }
      const validation = validateRouteBlockageOutcome({
        instance: current,
        outcome: selectedOutcome,
        explicitOperatorChoice: true,
      });
      if (!validation.allowed) {
        onStatusMessage?.(validation.reason);
        return;
      }
      execute(current, {
        kind: 'record_decision',
        decision: selectedOutcome,
        reasonCode: 'operator_selected_route_blockage_outcome',
      }, `outcome:${selectedOutcome}:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.startReviewDeadline) {
      const dueAt = current.inputSnapshot[ROUTE_BLOCKAGE_INPUT_KEYS.reviewDeadline]?.scalarValue;
      if (typeof dueAt !== 'string') {
        onStatusMessage?.('Route Blockage review deadline is unavailable.');
        return;
      }
      execute(current, {
        kind: 'start_deadline',
        dueAt,
        title: 'Route blockage review',
        reason: 'Review acknowledgments, evidence changes, and the operator-selected route response.',
      }, `review-deadline:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.requestAcknowledgments) {
      const targets = review?.affectedMembers.map((member) => member.id) ?? [];
      if (targets.length === 0) {
        skipStep(current, 'No affected members are available for acknowledgment tracking.');
        return;
      }
      execute(current, {
        kind: 'request_acknowledgment',
        targetIds: targets,
        requiredCount: targets.length,
      }, `acknowledgments:${targets.join(':')}:${current.version}`);
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.confirmOutcome) {
      const outcome = recordedOutcome ?? selectedOutcome;
      if (!outcome) {
        onStatusMessage?.('Recorded Route Blockage outcome is unavailable.');
        return;
      }
      Alert.alert(
        'Confirm Route Blockage Outcome?',
        `${outcomeLabel(outcome)} will be retained in the timeline. No reroute, public publishing, incident declaration, or guidance replacement is automatic.`,
        [
          { text: 'Keep Reviewing', style: 'cancel' },
          {
            text: 'Confirm Outcome',
            onPress: () => execute(current, {
              kind: 'confirm_action',
              confirmed: true,
              summary: `Operator confirmed: ${outcomeLabel(outcome)}.`,
            }, `confirm-outcome:${outcome}:${current.version}`),
          },
        ],
      );
      return;
    }
    if (stepId === ROUTE_BLOCKAGE_STEP_IDS.resolve) {
      const outcome = recordedOutcome ?? selectedOutcome;
      execute(current, {
        kind: 'resolve',
        summary: `Route Blockage resolved: ${outcome ? outcomeLabel(outcome) : 'operator review complete'}.`,
      }, `resolve:${current.version}`);
    }
  }, [
    actor,
    execute,
    onStatusMessage,
    openContextStep,
    recordedOutcome,
    review,
    selectedAlternateId,
    selectedOutcome,
    skipStep,
  ]);

  const handleIntent = useCallback((intent: OperationalPlaybookRunnerIntent) => {
    if (!instance) return;
    if (intent.kind === 'transition') {
      transition(instance, intent.next);
    } else if (intent.kind === 'continue_step') {
      continueStep(instance);
    } else if (intent.kind === 'review_command_proposal') {
      confirmProposal(instance, intent.proposalId);
    } else if (intent.kind === 'pause') {
      transition(instance, 'paused', 'Operator paused the Route Blockage playbook.');
    } else if (intent.kind === 'cancel') {
      Alert.alert(
        'Stop Route Blockage Playbook?',
        'Progress remains in the timeline. Separately submitted commands are not recalled.',
        [
          { text: 'Keep Playbook', style: 'cancel' },
          {
            text: 'Stop Playbook',
            style: 'destructive',
            onPress: () => transition(instance, 'cancelled', 'Operator stopped the Route Blockage playbook.'),
          },
        ],
      );
    }
  }, [confirmProposal, continueStep, instance, transition]);

  const openIncidentReview = useCallback(() => {
    if (!instance || recordedOutcome !== 'incident_created') return;
    Alert.alert(
      'Open Incident Review?',
      'This opens a prefilled Incident form. Nothing is declared or transmitted until that form is explicitly submitted.',
      [
        { text: 'Keep Playbook', style: 'cancel' },
        {
          text: 'Open Incident Review',
          onPress: () => {
            const result = buildRouteBlockageIncidentHandoff({
              instance,
              explicitOperatorChoice: true,
              now: missionClock.nowMs,
            });
            if (!result.ok) {
              onStatusMessage?.(result.reason);
              return;
            }
            onOpenIncidentReview(result.prefill);
            onClose();
          },
        },
      ],
    );
  }, [instance, missionClock.nowMs, onClose, onOpenIncidentReview, onStatusMessage, recordedOutcome]);

  if (!enabled) return null;

  if (!instance || !readiness || !review) {
    const reporterOptions = members.some((member) => member.id === actor.id)
      ? members
      : [{ id: actor.id, label: actor.label, roleId: actor.role }, ...members];
    return (
      <ECSModalShell
        visible={visible}
        onClose={onClose}
        title="Route Blockage"
        subtitle="Record a source-aware report before coordinating the team"
        eyebrow="MISSION COMMAND / OPERATIONAL PLAYBOOK"
        icon="trail-sign-outline"
        overlayClass="workflow"
        stackBehavior="allow-stack"
        maxWidth={780}
        maxHeightFraction={0.94}
        scrollable
        contentContainerStyle={styles.launchContent}
        footer={(
          <ECSOverlayFooter>
            <ECSButton label="Close" icon="close-outline" variant="tertiary" size="medium" grow onPress={onClose} />
            <ECSButton label="Start Playbook" icon="git-branch-outline" variant="primary" size="medium" grow onPress={startPlaybook} />
          </ECSOverlayFooter>
        )}
      >
        <View style={styles.launchRoot} accessibilityViewIsModal>
          <ECSPanel variant="warning">
            <Text style={styles.bodyText}>
              A member or community report is not an official closure. Missing official closure evidence does not prove passability. Nothing reroutes or publishes automatically.
            </Text>
          </ECSPanel>
          <ChoiceGroup label="Reported condition" value={condition} options={CONDITION_OPTIONS} onChange={setCondition} />
          <ChoiceGroup label="Report source" value={sourceKind} options={REPORT_SOURCE_OPTIONS} onChange={setSourceKind} />
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Reporter" icon="person-outline" />
            <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Route blockage reporter">
              {reporterOptions.map((member) => (
                <ChoiceButton key={member.id} label={member.label} selected={reporterId === member.id} onPress={() => setReporterId(member.id)} />
              ))}
            </View>
          </ECSPanel>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Affected Members" subtitle="Select acknowledgment targets" icon="people-outline" />
            {reporterOptions.length > 0 ? (
              <View style={styles.choiceGrid} accessible accessibilityLabel="Affected convoy members">
                {reporterOptions.map((member) => (
                  <ToggleButton
                    key={member.id}
                    label={member.label}
                    selected={affectedMemberIds.includes(member.id)}
                    onPress={() => setAffectedMemberIds((current) => current.includes(member.id)
                      ? current.filter((id) => id !== member.id)
                      : [...current, member.id].slice(0, 6))}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.bodyText}>No team members are available. The playbook remains usable in local review mode.</Text>
            )}
          </ECSPanel>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Blockage Location" icon="location-outline" />
            <ToggleButton
              label={hasPermittedLocation ? 'Include permitted current location' : 'Current location unavailable or restricted'}
              selected={includeLocation && hasPermittedLocation}
              disabled={!hasPermittedLocation}
              onPress={() => setIncludeLocation((current) => !current)}
            />
            <Text style={styles.helperText}>No coordinate is invented or retained when permission or GPS context is unavailable.</Text>
          </ECSPanel>
        </View>
      </ECSModalShell>
    );
  }

  const currentProposal = instance.commandProposals.find((proposal) => proposal.status === 'confirmed' && !proposal.commandId);

  return (
    <DispatchOperationalPlaybookRunner
      enabled
      visible={visible}
      definition={ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION}
      instance={instance}
      readiness={readiness}
      now={missionClock.nowMs}
      onClose={onClose}
      onIntent={handleIntent}
      scenarioContent={(
        <View style={styles.scenarioContent}>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Recorded Report" icon="alert-circle-outline" />
            <ContextRow label="Condition" value={formatValue(review.reportedCondition)} warning />
            <ContextRow label="Report source" value={formatValue(review.reportSourceKind)} warning={review.reportSourceKind !== 'operator_report'} />
            <ContextRow label="Reporter" value={review.reporter.label} />
            <ContextRow label="Observed" value={review.observationTime ?? 'Unknown'} warning={!review.observationTime} />
            <ContextRow label="Report freshness" value={formatValue(review.reportFreshness)} warning={['stale', 'expired', 'unavailable'].includes(review.reportFreshness)} />
            <ContextRow label="Confidence" value={formatValue(review.confidence)} warning={review.confidence === 'low' || review.confidence === 'unknown'} />
            <ContextRow label="Location" value={`${review.locationLabel} / ${formatValue(review.locationState)}`} warning={review.locationState !== 'available'} />
          </ECSPanel>

          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Evidence Boundaries" subtitle="Legal access and current conditions remain separate" icon="documents-outline" />
            <EvidenceRow label="Legal / access" evidence={review.legalAccessEvidence} />
            <ContextRow label="Official closure" value={formatValue(review.officialClosureState)} warning={review.officialClosureState !== 'current'} />
            <EvidenceRow label="Current conditions" evidence={review.currentConditionEvidence} />
            <EvidenceRow label="Weather / fire" evidence={review.weatherFireEvidence} />
          </ECSPanel>

          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Route Operations" icon="map-outline" />
            <ContextRow label="Active route" value={review.routeLabel} warning={review.routeLabel.startsWith('No ')} />
            <ContextRow label="Route segment" value={review.routeSegmentLabel} warning={review.routeSegmentLabel.startsWith('No ')} />
            <ContextRow label="Route impact" value={`${formatValue(review.routeImpactState)} / ${review.routeImpactLabel}`} warning={review.routeImpactState !== 'affects_active_route'} />
            <ContextRow label="Bailout / turnaround" value={review.bailoutLabel} warning={review.bailoutLabel.startsWith('No ')} />
            <ContextRow label="CampOps" value={`${formatValue(review.campReassessmentState)} / ${review.campImpactLabel}`} warning={review.campReassessmentState === 'unknown'} />
            <ContextRow label="Offline Prep" value={`${formatValue(review.offlineReadinessState)} / ${review.offlineReadinessLabel}`} warning={review.offlineReadinessState !== 'ready'} />
            <ContextRow label="Public publishing" value="Disabled" />
          </ECSPanel>

          {review.alternateCandidates.length > 0 ? (
            <ECSPanel variant="secondary">
              <ECSSectionHeader title="Deterministic Route Comparisons" subtitle="Review only / no route activation" icon="git-compare-outline" />
              {review.alternateCandidates.map((candidate) => (
                <View key={candidate.id} style={styles.candidateRow}>
                  <View style={styles.flexCopy}>
                    <Text style={styles.rowLabel}>{candidate.label}</Text>
                    <Text style={styles.helperText}>{candidate.comparisonSummary}</Text>
                    {candidate.requiredUnknownCategories.length > 0 ? (
                      <Text style={styles.warningText}>Unknown: {candidate.requiredUnknownCategories.join(', ')}</Text>
                    ) : null}
                  </View>
                  <ECSBadge label={formatValue(candidate.comparisonOutcome)} tone={candidate.comparisonOutcome === 'worsens' ? 'warning' : 'info'} compact />
                </View>
              ))}
            </ECSPanel>
          ) : null}

          {instance.currentStepId === ROUTE_BLOCKAGE_STEP_IDS.selectAlternate ? (
            <ECSPanel variant="primary">
              <ECSSectionHeader title="Alternate Candidate" subtitle="Selection does not replace guidance" icon="git-branch-outline" />
              <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Alternate route candidates">
                {review.alternateCandidates.map((candidate) => (
                  <ChoiceButton key={candidate.id} label={candidate.label} selected={selectedAlternateId === candidate.id} onPress={() => setSelectedAlternateId(candidate.id)} />
                ))}
              </View>
            </ECSPanel>
          ) : null}

          {instance.currentStepId === ROUTE_BLOCKAGE_STEP_IDS.recordOutcome ? (
            <ECSPanel variant="primary">
              <ECSSectionHeader title="Operator Response" icon="checkmark-done-outline" />
              <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Route Blockage outcome options">
                {OUTCOMES.map((outcome) => (
                  <ChoiceButton key={outcome.id} label={outcome.label} selected={selectedOutcome === outcome.id} onPress={() => setSelectedOutcome(outcome.id)} />
                ))}
              </View>
            </ECSPanel>
          ) : null}

          {currentProposal ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Confirmed Proposal" icon="document-text-outline" />
              <Text style={styles.bodyText}>The proposal is confirmed, but no command has been created. Command Composer still requires a separate submission.</Text>
              <ECSButton label="Open Command Composer" icon="create-outline" variant="secondary" size="compact" onPress={() => openConfirmedProposal(instance, currentProposal)} />
            </ECSPanel>
          ) : null}

          {recordedOutcome === 'incident_created' ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Incident Review" icon="warning-outline" />
              <Text style={styles.bodyText}>Incident creation remains explicit. Review all source, stale, unknown, and restricted fields before submitting the Incident form.</Text>
              <ECSButton label="Open Incident Review" icon="warning-outline" variant="secondary" size="compact" onPress={openIncidentReview} />
            </ECSPanel>
          ) : null}

          {review.missingFields.length > 0 ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Unknown Or Unavailable" icon="help-circle-outline" />
              <Text style={styles.bodyText}>{review.missingFields.join(', ')}</Text>
            </ECSPanel>
          ) : null}

          <ECSPanel variant="secondary">
            <Text style={styles.safetyCopy}>{review.safetyStatement}</Text>
          </ECSPanel>
        </View>
      )}
    />
  );
}

function useDispatchPersistenceRevision(expeditionId: string): number {
  const subscribe = useCallback((listener: () => void) => dispatchPersistenceAdapter.subscribe((changedId) => {
    if (changedId === expeditionId) listener();
  }), [expeditionId]);
  const getSnapshot = useCallback(() => dispatchPersistenceAdapter.getRevision(expeditionId), [expeditionId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ECSPanel variant="secondary">
      <ECSSectionHeader title={label} icon="options-outline" />
      <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <ChoiceButton key={option.value} label={option.label} selected={value === option.value} onPress={() => onChange(option.value)} />
        ))}
      </View>
    </ECSPanel>
  );
}

function ChoiceButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.choiceButton, selected ? styles.choiceButtonSelected : null]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeOpacity={0.78}
      onPress={onPress}
    >
      <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToggleButton({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choiceButton, selected ? styles.choiceButtonSelected : null, disabled ? styles.disabled : null]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      activeOpacity={0.78}
      onPress={onPress}
    >
      <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>{selected ? `Selected / ${label}` : label}</Text>
    </TouchableOpacity>
  );
}

function ContextRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.contextRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={[styles.contextValue, warning ? styles.warningText : null]}>{value}</Text>
    </View>
  );
}

function EvidenceRow({
  label,
  evidence,
}: {
  label: string;
  evidence: { label: string; state: string; kind: string };
}) {
  return (
    <ContextRow
      label={label}
      value={`${evidence.label} / ${formatValue(evidence.kind)} / ${formatValue(evidence.state)}`}
      warning={evidence.state !== 'available'}
    />
  );
}

function formatValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function outcomeLabel(value: RouteBlockageOutcome): string {
  return OUTCOMES.find((outcome) => outcome.id === value)?.label ?? formatValue(value);
}

const styles = StyleSheet.create({
  launchContent: { paddingBottom: 8 },
  launchRoot: { gap: 12 },
  scenarioContent: { gap: 12 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: {
    minHeight: 44,
    minWidth: 136,
    flexGrow: 1,
    flexBasis: 150,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  choiceButtonSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  choiceLabel: { color: TACTICAL.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  choiceLabelSelected: { color: TACTICAL.amber },
  disabled: { opacity: 0.48 },
  bodyText: { color: TACTICAL.textMuted, fontSize: 14, lineHeight: 20 },
  helperText: { color: TACTICAL.textMuted, fontSize: 12, lineHeight: 17 },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  contextLabel: { color: TACTICAL.textMuted, fontSize: 12, fontWeight: '700', flexBasis: 118 },
  contextValue: { color: TACTICAL.text, fontSize: 13, lineHeight: 18, flex: 1, textAlign: 'right' },
  warningText: { color: TACTICAL.amber, fontSize: 12, lineHeight: 17 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  flexCopy: { flex: 1, gap: 4 },
  rowLabel: { color: TACTICAL.text, fontSize: 14, fontWeight: '700' },
  safetyCopy: { color: ECS.status.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
});
