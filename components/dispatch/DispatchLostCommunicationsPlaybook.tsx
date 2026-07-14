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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { DispatchOperationalPlaybookRunner } from './DispatchOperationalPlaybookRunner';
import {
  createMissionCommandComposerFormFromPlaybookProposal,
  type MissionCommandPlaybookComposerRequest,
} from '../../lib/dispatchMissionCommandComposer';
import {
  createLostCommunicationsCommunicationAttemptInput,
  createLostCommunicationsPlaybook,
  LOST_COMMUNICATIONS_INPUT_KEYS,
  LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
  LOST_COMMUNICATIONS_PLAYBOOK_ID,
  LOST_COMMUNICATIONS_STEP_IDS,
  buildLostCommunicationsIncidentHandoff,
  selectLostCommunicationsContextReview,
  selectLostCommunicationsRecordedOutcome,
  selectNoResponseDeadlineStatus,
  validateLostCommunicationsResolutionOutcome,
  type LostCommunicationsCreateInput,
  type LostCommunicationsResolutionOutcome,
} from '../../lib/dispatchLostCommunicationsPlaybook';
import {
  collectOperationalPlaybookDeadlines,
  evaluateOperationalPlaybookReadiness,
  executeOperationalPlaybookStep,
  transitionOperationalPlaybookState,
} from '../../lib/dispatchOperationalPlaybookDomain';
import type {
  OperationalPlaybookCommandProposal,
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

export interface LostCommunicationsMemberOption {
  id: string;
  label: string;
  roleId?: string;
}

export type LostCommunicationsComposerRequest = MissionCommandPlaybookComposerRequest;

export interface DispatchLostCommunicationsPlaybookProps {
  enabled: boolean;
  visible: boolean;
  requestedInstanceId?: string | null;
  expeditionId: string;
  persistenceDefaults: DispatchPersistenceDefaults;
  actor: MissionCommandActor;
  soloMode: boolean;
  members: LostCommunicationsMemberOption[];
  runtime: OperationalPlaybookRuntimeContext;
  createInputForMember: (member: LostCommunicationsMemberOption) => LostCommunicationsCreateInput;
  onClose: () => void;
  onOpenCommandComposer: (request: LostCommunicationsComposerRequest) => void;
  onOpenContext: (instanceId: string, context: DispatchLinkedContext) => void;
  onOpenIncidentReview: (prefill: ReportIncidentInput) => void;
  onStatusMessage?: (message: string) => void;
}

const OUTCOMES: { id: LostCommunicationsResolutionOutcome; label: string }[] = [
  { id: 'member_responded', label: 'Member Responded' },
  { id: 'delayed_but_safe', label: 'Delayed But Safe' },
  { id: 'regroup_requested', label: 'Regroup Requested' },
  { id: 'assistance_requested', label: 'Assistance Requested' },
  { id: 'command_cancelled', label: 'Command Cancelled' },
  { id: 'escalate_for_operator_review', label: 'Escalate For Operator Review' },
];

export default function DispatchLostCommunicationsPlaybook({
  enabled,
  visible,
  requestedInstanceId,
  expeditionId,
  persistenceDefaults,
  actor,
  soloMode,
  members,
  runtime,
  createInputForMember,
  onClose,
  onOpenCommandComposer,
  onOpenContext,
  onOpenIncidentReview,
  onStatusMessage,
}: DispatchLostCommunicationsPlaybookProps) {
  const revision = useDispatchPersistenceRevision(expeditionId);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [attemptSummary, setAttemptSummary] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<LostCommunicationsResolutionOutcome | null>(null);
  const startingRef = useRef(false);
  const loadResult = useMemo(() => {
    void revision;
    return dispatchPersistenceAdapter.loadResult(expeditionId, persistenceDefaults);
  }, [expeditionId, persistenceDefaults, revision]);
  const instances = useMemo(() => loadResult.snapshot.operationalPlaybooks
    .filter((instance) => instance.definitionId === LOST_COMMUNICATIONS_PLAYBOOK_ID)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [loadResult.snapshot.operationalPlaybooks]);
  const resumable = instances.find((instance) => !['completed', 'cancelled'].includes(instance.state)) ?? null;
  const instance = instances.find((candidate) => candidate.id === selectedInstanceId) ?? resumable;
  const missionClockDeadlines = useMemo(
    () => instance ? collectOperationalPlaybookDeadlines(instance) : [],
    [instance],
  );
  const missionClock = useMissionClockScheduler({
    expeditionId,
    deadlines: missionClockDeadlines,
    enabled: visible && instance != null,
  });
  const readiness = useMemo(() => instance
    ? evaluateOperationalPlaybookReadiness(
        LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
        instance,
        runtime,
        missionClock.nowMs,
      )
    : null, [instance, missionClock.nowMs, runtime]);
  const review = useMemo(() => instance
    ? selectLostCommunicationsContextReview({
        instance,
        commands: loadResult.snapshot.missionCommands,
        now: missionClock.nowMs,
      })
    : null, [instance, loadResult.snapshot.missionCommands, missionClock.nowMs]);
  const recordedOutcome = useMemo(() => {
    return instance ? selectLostCommunicationsRecordedOutcome(instance) : null;
  }, [instance]);

  useEffect(() => {
    if (!visible) {
      setSelectedInstanceId(null);
      setAttemptSummary('');
      setSelectedOutcome(null);
    }
  }, [visible]);

  useEffect(() => {
    if (
      visible &&
      requestedInstanceId &&
      instances.some((candidate) => candidate.id === requestedInstanceId)
    ) {
      setSelectedInstanceId(requestedInstanceId);
    }
  }, [instances, requestedInstanceId, visible]);

  useEffect(() => {
    setAttemptSummary('');
    setSelectedOutcome(recordedOutcome);
  }, [instance?.id, recordedOutcome]);

  const persistMutation = useCallback((result: OperationalPlaybookMutationResult) => {
    if (!result.ok) {
      onStatusMessage?.(result.reason);
      return false;
    }
    if (result.changed) {
      dispatchPersistenceAdapter.applyOperationalPlaybookMutation(
        expeditionId,
        persistenceDefaults,
        result.instance,
      );
      setSelectedInstanceId(result.instance.id);
    }
    return true;
  }, [expeditionId, onStatusMessage, persistenceDefaults]);

  const startForMember = useCallback((member: LostCommunicationsMemberOption) => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      const existing = instances.find((candidate) => (
        !['completed', 'cancelled'].includes(candidate.state) &&
        candidate.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity]?.scalarValue === member.id
      ));
      if (existing) {
        setSelectedInstanceId(existing.id);
        return;
      }
      const result = createLostCommunicationsPlaybook(createInputForMember(member));
      if (!result.ok) {
        onStatusMessage?.(result.reason);
        return;
      }
      dispatchPersistenceAdapter.upsertOperationalPlaybook(expeditionId, persistenceDefaults, result.instance);
      setSelectedInstanceId(result.instance.id);
    } finally {
      startingRef.current = false;
    }
  }, [createInputForMember, expeditionId, instances, onStatusMessage, persistenceDefaults]);

  const execute = useCallback((
    current: OperationalPlaybookInstance,
    action: Parameters<typeof executeOperationalPlaybookStep>[2]['action'],
    actionId: string,
  ) => persistMutation(executeOperationalPlaybookStep(
    LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
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
    LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
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

  const openConfirmedProposal = useCallback((current: OperationalPlaybookInstance, proposal: OperationalPlaybookCommandProposal) => {
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
      'Confirm Command Proposal?',
      'This records operator approval and opens Command Composer. It does not send, deliver, or acknowledge a command.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Confirm Proposal',
          onPress: () => {
            const result = executeOperationalPlaybookStep(
              LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
              current,
              {
                actor,
                action: { kind: 'confirm_command_proposal', proposalId, confirmed: true },
                idempotencyKey: `${current.id}:confirm:${proposalId}`,
                occurredAt: new Date().toISOString(),
              },
              runtime,
            );
            if (!persistMutation(result) || !result.ok || !result.effect || result.effect.kind !== 'command_proposal_confirmed') return;
            openConfirmedProposal(result.instance, result.effect.proposal);
          },
        },
      ],
    );
  }, [actor, openConfirmedProposal, persistMutation, runtime]);

  const skipStep = useCallback((current: OperationalPlaybookInstance, reason: string) => {
    Alert.alert(
      'Skip This Step?',
      `${reason} The reason will remain in the playbook timeline.`,
      [
        { text: 'Keep Step', style: 'cancel' },
        { text: 'Skip With Reason', onPress: () => execute(current, { kind: 'skip', reason }, `skip:${current.currentStepId}:${current.version}`) },
      ],
    );
  }, [execute]);

  const continueStep = useCallback((current: OperationalPlaybookInstance) => {
    const stepId = current.currentStepId;
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.reviewContext) {
      execute(current, { kind: 'complete_review' }, `review:${current.version}`);
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.verifyFreshness) {
      Alert.alert(
        'Confirm Freshness Review?',
        'Confirm that the displayed position state was reviewed and no movement was inferred.',
        [
          { text: 'Keep Reviewing', style: 'cancel' },
          {
            text: 'Confirm Review',
            onPress: () => execute(current, {
              kind: 'confirm_action',
              confirmed: true,
              summary: 'Position freshness reviewed; member movement was not inferred.',
            }, `freshness:${current.version}`),
          },
        ],
      );
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.directCheckIn) {
      execute(current, { kind: 'prepare_command_proposal' }, `prepare-direct:${current.version}`);
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.notifyLeadSweep) {
      const lead = current.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.leadMemberId]?.scalarValue;
      const sweep = current.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.sweepMemberId]?.scalarValue;
      if (!lead && !sweep) {
        skipStep(current, 'No permitted lead or sweep target is available.');
        return;
      }
      execute(current, { kind: 'prepare_command_proposal' }, `prepare-lead-sweep:${current.version}`);
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.reviewRally) {
      const context = current.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext]?.linkedContext;
      if (!context || context.restricted) {
        skipStep(current, 'No permitted rally, bailout, or camp context is available.');
        return;
      }
      const result = executeOperationalPlaybookStep(
        LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
        current,
        {
          actor,
          action: { kind: 'open_context' },
          idempotencyKey: `${current.id}:open-context:${current.version}`,
          occurredAt: new Date().toISOString(),
        },
        runtime,
      );
      if (persistMutation(result) && result.ok && result.effect?.kind === 'open_context') {
        onOpenContext(current.id, result.effect.context);
      }
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.startDeadline) {
      const dueAt = current.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline]?.scalarValue;
      if (typeof dueAt !== 'string') {
        onStatusMessage?.('No-response deadline is unavailable.');
        return;
      }
      execute(current, {
        kind: 'start_deadline',
        dueAt,
        title: 'No-response operator review',
        reason: 'Request an operator decision if no verified response is recorded.',
      }, `deadline:${current.version}`);
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.recordAttempts) {
      const attempt = createLostCommunicationsCommunicationAttemptInput({
        summary: attemptSummary,
        actor,
      });
      if (!attempt) {
        onStatusMessage?.('Record at least one communication attempt before continuing.');
        return;
      }
      if (execute(current, { kind: 'provide_input', input: attempt }, `attempt:${current.version}`)) {
        setAttemptSummary('');
      }
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.recordOutcome) {
      if (!selectedOutcome) {
        onStatusMessage?.('Select a Lost Communications outcome.');
        return;
      }
      const validation = validateLostCommunicationsResolutionOutcome({
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
        reasonCode: 'operator_selected_lost_communications_outcome',
      }, `outcome:${selectedOutcome}:${current.version}`);
      return;
    }
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.confirmOutcome) {
      const outcome = recordedOutcome ?? selectedOutcome;
      if (!outcome) {
        onStatusMessage?.('Recorded outcome is unavailable.');
        return;
      }
      Alert.alert(
        'Confirm Lost Communications Outcome?',
        `${outcomeLabel(outcome)} will be retained in the operational timeline. No external action is automatic.`,
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
    if (stepId === LOST_COMMUNICATIONS_STEP_IDS.resolve) {
      const outcome = recordedOutcome ?? selectedOutcome;
      execute(current, {
        kind: 'resolve',
        summary: `Lost Communications resolved: ${outcome ? outcomeLabel(outcome) : 'operator review complete'}.`,
      }, `resolve:${current.version}`);
    }
  }, [
    actor,
    attemptSummary,
    execute,
    onOpenContext,
    onStatusMessage,
    persistMutation,
    recordedOutcome,
    runtime,
    selectedOutcome,
    skipStep,
  ]);

  const handleIntent = useCallback((intent: OperationalPlaybookRunnerIntent) => {
    if (!instance) return;
    if (intent.kind === 'transition') {
      transition(instance, intent.next);
      return;
    }
    if (intent.kind === 'continue_step') {
      continueStep(instance);
      return;
    }
    if (intent.kind === 'review_command_proposal') {
      confirmProposal(instance, intent.proposalId);
      return;
    }
    if (intent.kind === 'pause') {
      transition(instance, 'paused', 'Operator paused the Lost Communications playbook.');
      return;
    }
    if (intent.kind === 'cancel') {
      Alert.alert(
        'Stop Lost Communications Playbook?',
        'Progress remains in the timeline. This does not cancel or recall any separately created command.',
        [
          { text: 'Keep Playbook', style: 'cancel' },
          {
            text: 'Stop Playbook',
            style: 'destructive',
            onPress: () => transition(instance, 'cancelled', 'Operator stopped the Lost Communications playbook.'),
          },
        ],
      );
    }
  }, [confirmProposal, continueStep, instance, transition]);

  const openIncidentReview = useCallback(() => {
    if (!instance || recordedOutcome !== 'escalate_for_operator_review') return;
    Alert.alert(
      'Open Incident Review?',
      'This opens a prefilled Incident form for operator review. Nothing is declared or transmitted until the form is submitted.',
      [
        { text: 'Keep Playbook', style: 'cancel' },
        {
          text: 'Open Incident Review',
          onPress: () => {
            const result = buildLostCommunicationsIncidentHandoff({
              instance,
              outcome: recordedOutcome,
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
    return (
      <ECSModalShell
        visible={visible}
        onClose={onClose}
        title="Lost Communications"
        subtitle="Select the unreachable member or vehicle operator"
        eyebrow="MISSION COMMAND / OPERATIONAL PLAYBOOK"
        icon="radio-outline"
        overlayClass="workflow"
        stackBehavior="allow-stack"
        maxWidth={720}
        maxHeightFraction={0.9}
        scrollable
        contentContainerStyle={styles.launchContent}
        footer={(
          <ECSOverlayFooter>
            <ECSButton label="Close" icon="close-outline" variant="tertiary" size="medium" grow onPress={onClose} />
          </ECSOverlayFooter>
        )}
      >
        <View style={styles.launchRoot} accessibilityViewIsModal>
          <ECSPanel variant={soloMode ? 'warning' : 'secondary'}>
            <Text style={styles.bodyText}>
              {soloMode
                ? 'Lost Communications is not applicable in solo mode because there is no separate team member to contact.'
                : 'Select one member. ECS will snapshot only permitted source context and will not send a command automatically.'}
            </Text>
          </ECSPanel>
          {!soloMode && members.length > 0 ? (
            <View style={styles.memberList} accessibilityRole="list">
              {members.filter((member) => member.id !== actor.id).map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.memberButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Start Lost Communications review for ${member.label}`}
                  onPress={() => startForMember(member)}
                >
                  <Ionicons name="person-outline" size={18} color={TACTICAL.amber} />
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberLabel}>{member.label}</Text>
                    <Text style={styles.memberRole}>{member.roleId ?? 'Role unknown'}</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : !soloMode ? (
            <ECSPanel variant="warning">
              <Text style={styles.bodyText}>No other expedition members are available in the current roster.</Text>
            </ECSPanel>
          ) : null}
        </View>
      </ECSModalShell>
    );
  }

  const currentProposal = instance.commandProposals.find((proposal) => (
    proposal.status === 'confirmed' && !proposal.commandId
  ));
  const deadlineStatus = selectNoResponseDeadlineStatus(instance, missionClock.nowMs);

  return (
    <DispatchOperationalPlaybookRunner
      enabled
      visible={visible}
      definition={LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION}
      instance={instance}
      readiness={readiness}
      onClose={onClose}
      onIntent={handleIntent}
      scenarioContent={(
        <View style={styles.scenarioContent}>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Last Verified Context" icon="locate-outline" />
            <ContextRow label="Member" value={`${review.memberLabel} / ${review.roleLabel}`} />
            <ContextRow label="Position state" value={review.lastVerifiedStatus} warning={review.positionState === 'stale' || review.positionState === 'expired'} />
            <ContextRow label="Last position" value={review.positionText} warning={review.positionState === 'restricted'} />
            <ContextRow label="Age" value={formatAge(review.positionAgeMs)} />
            <ContextRow label="Accuracy" value={review.accuracyMeters == null ? 'Unknown' : `${Math.round(review.accuracyMeters)} m`} />
            <ContextRow label="Last check-in" value={formatTime(review.lastCheckInAt)} />
            <ContextRow label="Last acknowledgment" value={formatTime(review.lastAcknowledgmentAt)} />
            <ContextRow label="Last command receipt" value={formatTime(review.lastCommandReceiptAt)} />
            <ContextRow label="Delivery" value={`${review.directCheckIn.deliveryState} / ${review.directCheckIn.acknowledgmentState}`} />
            <ContextRow label="Route" value={review.routeLabel} />
            <ContextRow label="Rally / bailout" value={review.rallyOrBailoutLabel} />
            <Text style={styles.truthCopy}>{review.movementStatement}</Text>
            {review.missingFields.length > 0 ? (
              <View style={styles.missingRow}>
                <ECSBadge label={`${review.missingFields.length} unknown`} tone="warning" compact />
                <Text style={styles.missingText}>{review.missingFields.join(', ')}</Text>
              </View>
            ) : null}
          </ECSPanel>

          {instance.currentStepId === LOST_COMMUNICATIONS_STEP_IDS.recordAttempts ? (
            <ECSPanel variant="primary">
              <ECSSectionHeader title="Communication Attempts" icon="create-outline" />
              <TextInput
                style={styles.textInput}
                value={attemptSummary}
                onChangeText={setAttemptSummary}
                placeholder="Channel, time, and verified result"
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                maxLength={1_000}
                accessibilityLabel="Communication attempt summary"
              />
            </ECSPanel>
          ) : null}

          {instance.currentStepId === LOST_COMMUNICATIONS_STEP_IDS.recordOutcome ? (
            <ECSPanel variant="primary">
              <ECSSectionHeader title="Operator Outcome" icon="checkmark-done-outline" />
              <View style={styles.outcomeGrid} accessible accessibilityLabel="Lost Communications outcome options">
                {OUTCOMES.map((outcome) => {
                  const selected = selectedOutcome === outcome.id;
                  return (
                    <TouchableOpacity
                      key={outcome.id}
                      style={[styles.outcomeButton, selected ? styles.outcomeButtonSelected : null]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedOutcome(outcome.id)}
                    >
                      <Text style={[styles.outcomeLabel, selected ? styles.outcomeLabelSelected : null]}>{outcome.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ECSPanel>
          ) : null}

          {currentProposal ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Confirmed Proposal" icon="document-text-outline" />
              <Text style={styles.bodyText}>This proposal is confirmed but no command is linked. Command Composer still requires a separate submission.</Text>
              <ECSButton
                label="Open Command Composer"
                icon="create-outline"
                variant="secondary"
                size="compact"
                onPress={() => openConfirmedProposal(instance, currentProposal)}
              />
            </ECSPanel>
          ) : null}

          {recordedOutcome === 'escalate_for_operator_review' ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Incident Review" icon="warning-outline" />
              <Text style={styles.bodyText}>
                Deadline state: {deadlineStatus}. Opening Incident Review is explicit and still requires form submission.
              </Text>
              <ECSButton
                label="Open Incident Review"
                icon="warning-outline"
                variant="secondary"
                size="compact"
                disabled={deadlineStatus !== 'due' && deadlineStatus !== 'overdue'}
                onPress={openIncidentReview}
              />
            </ECSPanel>
          ) : null}

          <ECSPanel variant="secondary">
            <Text style={styles.safetyCopy}>
              External emergency procedures remain manual communications-plan guidance. ECS does not call, text, transmit, reroute, rally, or declare an incident automatically.
            </Text>
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

function ContextRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.contextRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={[styles.contextValue, warning ? styles.warningText : null]}>{value}</Text>
    </View>
  );
}

function outcomeLabel(outcome: LostCommunicationsResolutionOutcome): string {
  return OUTCOMES.find((candidate) => candidate.id === outcome)?.label ?? outcome.replace(/_/g, ' ');
}

function formatAge(ageMs: number | null): string {
  if (ageMs == null) return 'Unknown';
  if (ageMs < 60_000) return 'Under 1 minute';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${remaining ? ` ${remaining} min` : ''}`;
}

function formatTime(value: string | null): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'Unknown' : new Date(parsed).toLocaleString();
}

const styles = StyleSheet.create({
  launchContent: { paddingBottom: 8 },
  launchRoot: { gap: 12 },
  memberList: { gap: 8 },
  memberButton: {
    minHeight: 54,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberCopy: { flex: 1, minWidth: 0 },
  memberLabel: { color: TACTICAL.text, fontSize: 14, fontWeight: '800' },
  memberRole: { color: TACTICAL.textMuted, fontSize: 11, marginTop: 2 },
  scenarioContent: { gap: 12 },
  contextRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  contextLabel: { color: TACTICAL.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 0 },
  contextValue: { color: TACTICAL.text, fontSize: 11, fontWeight: '700', textAlign: 'right', flex: 1 },
  warningText: { color: TACTICAL.amber },
  truthCopy: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  missingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  missingText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, flex: 1 },
  textInput: {
    minHeight: 96,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.primary,
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
    textAlignVertical: 'top',
  },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outcomeButton: {
    minHeight: 44,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  outcomeButtonSelected: { borderColor: TACTICAL.amber, backgroundColor: ECS_SURFACE.background.selected },
  outcomeLabel: { color: TACTICAL.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  outcomeLabelSelected: { color: TACTICAL.amber },
  bodyText: { color: TACTICAL.textMuted, fontSize: 12, lineHeight: 18 },
  safetyCopy: { color: ECS.status.warning, fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
