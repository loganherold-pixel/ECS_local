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
import { SafeIcon as Ionicons } from '../SafeIcon';
import { DispatchOperationalPlaybookRunner } from './DispatchOperationalPlaybookRunner';
import {
  createMissionCommandComposerFormFromPlaybookProposal,
  type MissionCommandPlaybookComposerRequest,
} from '../../lib/dispatchMissionCommandComposer';
import {
  buildVehicleImmobilizedIncidentHandoff,
  createVehicleImmobilizedPlaybook,
  selectVehicleImmobilizedContextReview,
  selectVehicleImmobilizedRecordedOutcome,
  validateVehicleImmobilizedOutcome,
  VEHICLE_IMMOBILIZED_INPUT_KEYS,
  VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
  VEHICLE_IMMOBILIZED_PLAYBOOK_ID,
  VEHICLE_IMMOBILIZED_STEP_IDS,
  type VehicleImmobilizedCreateInput,
  type VehicleImmobilizedOutcome,
} from '../../lib/dispatchVehicleImmobilizedPlaybook';
import {
  collectOperationalPlaybookDeadlines,
  evaluateOperationalPlaybookReadiness,
  executeOperationalPlaybookStep,
  transitionOperationalPlaybookState,
} from '../../lib/dispatchOperationalPlaybookDomain';
import type {
  OperationalPlaybookCommandProposal,
  OperationalPlaybookEvent,
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

export interface VehicleImmobilizedVehicleOption {
  id: string;
  label: string;
}

type InitialStatus = VehicleImmobilizedCreateInput['initialStatus'];

export interface DispatchVehicleImmobilizedPlaybookProps {
  enabled: boolean;
  visible: boolean;
  requestedInstanceId?: string | null;
  expeditionId: string;
  persistenceDefaults: DispatchPersistenceDefaults;
  actor: MissionCommandActor;
  soloMode: boolean;
  vehicles: VehicleImmobilizedVehicleOption[];
  members: { id: string; label: string; roleId?: string }[];
  runtime: OperationalPlaybookRuntimeContext;
  createInputForVehicle: (
    vehicle: VehicleImmobilizedVehicleOption,
    initialStatus: InitialStatus,
  ) => VehicleImmobilizedCreateInput;
  onClose: () => void;
  onOpenCommandComposer: (request: MissionCommandPlaybookComposerRequest) => void;
  onOpenContext: (instanceId: string, context: DispatchLinkedContext) => void;
  onOpenIncidentReview: (prefill: ReportIncidentInput) => void;
  onPlaybookEvent?: (event: OperationalPlaybookEvent, instance: OperationalPlaybookInstance) => void;
  onStatusMessage?: (message: string) => void;
}

const DEFAULT_STATUS: InitialStatus = {
  vehicleStopped: 'unknown',
  peopleAccounted: 'unknown',
  immediateHazard: 'unknown',
  communication: 'unknown',
  routeObstruction: 'unknown',
};

const STOPPED_OPTIONS: { value: InitialStatus['vehicleStopped']; label: string }[] = [
  { value: 'confirmed_stopped', label: 'Confirmed Stopped' },
  { value: 'not_confirmed', label: 'Not Confirmed' },
  { value: 'unknown', label: 'Unknown' },
];
const ACCOUNTED_OPTIONS: { value: InitialStatus['peopleAccounted']; label: string }[] = [
  { value: 'accounted_for', label: 'Accounted For' },
  { value: 'not_accounted_for', label: 'Not Accounted For' },
  { value: 'unknown', label: 'Unknown' },
];
const HAZARD_OPTIONS: { value: InitialStatus['immediateHazard']; label: string }[] = [
  { value: 'none_confirmed', label: 'None Confirmed' },
  { value: 'present', label: 'Hazard Present' },
  { value: 'unknown', label: 'Unknown' },
];
const COMMUNICATION_OPTIONS: { value: InitialStatus['communication']; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'unknown', label: 'Unknown' },
];
const OBSTRUCTION_OPTIONS: { value: InitialStatus['routeObstruction']; label: string }[] = [
  { value: 'clear', label: 'Route Clear' },
  { value: 'partial', label: 'Partially Obstructed' },
  { value: 'blocked', label: 'Route Blocked' },
  { value: 'unknown', label: 'Unknown' },
];

const OUTCOMES: { id: VehicleImmobilizedOutcome; label: string }[] = [
  { id: 'self_recovered', label: 'Self-Recovered' },
  { id: 'team_recovery_in_progress', label: 'Team Recovery In Progress' },
  { id: 'vehicle_remains_immobilized', label: 'Vehicle Remains Immobilized' },
  { id: 'route_blocked', label: 'Route Blocked' },
  { id: 'external_assistance_planning', label: 'External Assistance Planning' },
  { id: 'camp_overnight_decision_required', label: 'Camp / Overnight Decision Required' },
  { id: 'incident_resolved', label: 'Incident Resolved' },
];

export default function DispatchVehicleImmobilizedPlaybook({
  enabled,
  visible,
  requestedInstanceId,
  expeditionId,
  persistenceDefaults,
  actor,
  soloMode,
  vehicles,
  members,
  runtime,
  createInputForVehicle,
  onClose,
  onOpenCommandComposer,
  onOpenContext,
  onOpenIncidentReview,
  onPlaybookEvent,
  onStatusMessage,
}: DispatchVehicleImmobilizedPlaybookProps) {
  const revision = useDispatchPersistenceRevision(expeditionId);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [initialStatus, setInitialStatus] = useState<InitialStatus>(DEFAULT_STATUS);
  const [selectedRecoveryLeadId, setSelectedRecoveryLeadId] = useState<string>('');
  const [selectedSpotterId, setSelectedSpotterId] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<VehicleImmobilizedOutcome | null>(null);
  const startingRef = useRef(false);

  const loadResult = useMemo(() => {
    void revision;
    return dispatchPersistenceAdapter.loadResult(expeditionId, persistenceDefaults);
  }, [expeditionId, persistenceDefaults, revision]);
  const instances = useMemo(() => loadResult.snapshot.operationalPlaybooks
    .filter((candidate) => candidate.definitionId === VEHICLE_IMMOBILIZED_PLAYBOOK_ID)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [loadResult.snapshot.operationalPlaybooks]);
  const resumable = instances.find((candidate) => !['completed', 'cancelled'].includes(candidate.state)) ?? null;
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
        VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
        instance,
        runtime,
        missionClock.nowMs,
      )
    : null, [instance, missionClock.nowMs, runtime]);
  const review = useMemo(() => instance
    ? selectVehicleImmobilizedContextReview({
        instance,
        commands: loadResult.snapshot.missionCommands,
        now: missionClock.nowMs,
      })
    : null, [instance, loadResult.snapshot.missionCommands, missionClock.nowMs]);
  const recordedOutcome = useMemo(
    () => instance ? selectVehicleImmobilizedRecordedOutcome(instance) : null,
    [instance],
  );

  useEffect(() => {
    if (!visible) {
      setSelectedInstanceId(null);
      setSelectedVehicleId('');
      setInitialStatus(DEFAULT_STATUS);
      setSelectedRecoveryLeadId('');
      setSelectedSpotterId('');
      setSelectedOutcome(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0) setSelectedVehicleId(vehicles[0].id);
  }, [selectedVehicleId, vehicles]);

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
    setSelectedRecoveryLeadId(review?.recoveryLead?.id ?? '');
    setSelectedSpotterId(review?.spotter?.id ?? '');
    setSelectedOutcome(recordedOutcome);
  }, [instance?.id, recordedOutcome, review?.recoveryLead?.id, review?.spotter?.id]);

  const publishEvent = useCallback((
    event: OperationalPlaybookEvent | null | undefined,
    nextInstance: OperationalPlaybookInstance,
  ) => {
    if (event) onPlaybookEvent?.(event, nextInstance);
  }, [onPlaybookEvent]);

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
      publishEvent(result.event, result.instance);
      setSelectedInstanceId(result.instance.id);
    }
    return true;
  }, [expeditionId, onStatusMessage, persistenceDefaults, publishEvent]);

  const startForVehicle = useCallback(() => {
    if (startingRef.current) return;
    const vehicle = vehicles.find((candidate) => candidate.id === selectedVehicleId);
    if (!vehicle) {
      onStatusMessage?.('Select an affected vehicle before starting the playbook.');
      return;
    }
    startingRef.current = true;
    try {
      const existing = instances.find((candidate) => (
        !['completed', 'cancelled'].includes(candidate.state) &&
        candidate.inputSnapshot[VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleId]?.scalarValue === vehicle.id
      ));
      if (existing) {
        setSelectedInstanceId(existing.id);
        return;
      }
      const result = createVehicleImmobilizedPlaybook(createInputForVehicle(vehicle, initialStatus));
      if (!result.ok) {
        onStatusMessage?.(result.reason);
        return;
      }
      dispatchPersistenceAdapter.upsertOperationalPlaybook(expeditionId, persistenceDefaults, result.instance);
      publishEvent(result.instance.eventHistory[0], result.instance);
      setSelectedInstanceId(result.instance.id);
    } finally {
      startingRef.current = false;
    }
  }, [
    createInputForVehicle,
    expeditionId,
    initialStatus,
    instances,
    onStatusMessage,
    persistenceDefaults,
    publishEvent,
    selectedVehicleId,
    vehicles,
  ]);

  const execute = useCallback((
    current: OperationalPlaybookInstance,
    action: Parameters<typeof executeOperationalPlaybookStep>[2]['action'],
    actionId: string,
  ) => persistMutation(executeOperationalPlaybookStep(
    VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
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
    VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
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
      'Confirm Stop / Regroup Proposal?',
      'This records operator approval and opens Command Composer. It does not send a command, stop a convoy, begin recovery, or change guidance.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Confirm Proposal',
          onPress: () => {
            const result = executeOperationalPlaybookStep(
              VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
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
      `${reason} The reason will remain in the playbook timeline.`,
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
    if (!context || context.restricted) {
      skipStep(current, unavailableReason);
      return;
    }
    const result = executeOperationalPlaybookStep(
      VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
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
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.reviewInitialStatus) {
      execute(current, { kind: 'complete_review' }, `review-status:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.confirmInitialStatus) {
      Alert.alert(
        'Confirm Initial Status?',
        'Confirm only the displayed operator observations. No mechanical diagnosis or recovery authorization is created.',
        [
          { text: 'Keep Reviewing', style: 'cancel' },
          {
            text: 'Confirm Status',
            onPress: () => execute(current, {
              kind: 'confirm_action',
              confirmed: true,
              summary: 'Operator confirmed the displayed initial vehicle status.',
            }, `confirm-status:${current.version}`),
          },
        ],
      );
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop) {
      const lead = current.inputSnapshot[VEHICLE_IMMOBILIZED_INPUT_KEYS.leadMemberId]?.scalarValue;
      const sweep = current.inputSnapshot[VEHICLE_IMMOBILIZED_INPUT_KEYS.sweepMemberId]?.scalarValue;
      if (soloMode || (!lead && !sweep)) {
        skipStep(current, soloMode
          ? 'Solo mode has no convoy stop or regroup target.'
          : 'No permitted convoy lead or sweep target is available.');
        return;
      }
      execute(current, { kind: 'prepare_command_proposal' }, `prepare-regroup:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.assignRecoveryLead) {
      if (review?.recoveryLeadCandidates.length === 0) {
        skipStep(current, 'No permitted recovery lead candidate is available.');
        return;
      }
      const candidate = review?.recoveryLeadCandidates.find((item) => item.id === selectedRecoveryLeadId);
      if (!candidate) {
        onStatusMessage?.('Select a recovery lead or explicitly skip this step.');
        return;
      }
      execute(current, {
        kind: 'assign_role',
        roleId: 'recovery_lead',
        assigneeId: candidate.id,
        label: candidate.label,
      }, `recovery-lead:${candidate.id}:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.assignSpotter) {
      if (!review?.spotterSupported) {
        skipStep(current, 'The current team structure has no permitted spotter candidate.');
        return;
      }
      const candidate = review.spotterCandidates.find((item) => item.id === selectedSpotterId);
      if (!candidate) {
        onStatusMessage?.('Select a spotter or explicitly skip this step.');
        return;
      }
      execute(current, {
        kind: 'assign_role',
        roleId: 'spotter',
        assigneeId: candidate.id,
        label: candidate.label,
      }, `spotter:${candidate.id}:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.openVehicle) {
      openContextStep(current, VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext, 'Fleet vehicle context is unavailable.');
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.reviewApprovedProtocols) {
      if (!review?.approvedRecoveryProtocols.length) {
        skipStep(current, 'No approved ECS recovery protocol references are available.');
        return;
      }
      execute(current, { kind: 'complete_review' }, `review-protocols:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.openLocation) {
      openContextStep(current, VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext, 'No permitted verified vehicle location is available.');
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.openRouteSegment) {
      openContextStep(current, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext, 'No verified active route-segment identity is available.');
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.reviewBailoutCamp) {
      openContextStep(current, VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext, 'No existing bailout or CampOps candidate is available.');
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome) {
      if (!selectedOutcome) {
        onStatusMessage?.('Select a Vehicle Immobilized outcome.');
        return;
      }
      const validation = validateVehicleImmobilizedOutcome({
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
        reasonCode: 'operator_selected_vehicle_immobilized_outcome',
      }, `outcome:${selectedOutcome}:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.startStatusDeadline) {
      const dueAt = current.inputSnapshot[VEHICLE_IMMOBILIZED_INPUT_KEYS.statusDeadline]?.scalarValue;
      if (typeof dueAt !== 'string') {
        onStatusMessage?.('Next vehicle status deadline is unavailable.');
        return;
      }
      execute(current, {
        kind: 'start_deadline',
        dueAt,
        title: 'Vehicle status review',
        reason: 'Review the immobilized vehicle status and operator-selected outcome.',
      }, `status-deadline:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.requestAcknowledgments) {
      const targetIds = acknowledgmentTargets(current);
      if (targetIds.length === 0) {
        skipStep(current, 'No coordination command or assigned team target is available for acknowledgment tracking.');
        return;
      }
      execute(current, {
        kind: 'request_acknowledgment',
        targetIds,
        requiredCount: targetIds.length,
      }, `acknowledgments:${targetIds.join(':')}:${current.version}`);
      return;
    }
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.confirmOutcome) {
      const outcome = recordedOutcome ?? selectedOutcome;
      if (!outcome) {
        onStatusMessage?.('Recorded outcome is unavailable.');
        return;
      }
      Alert.alert(
        'Confirm Vehicle Immobilized Outcome?',
        `${outcomeLabel(outcome)} will be retained in the operational timeline. No recovery, reroute, external contact, or incident declaration is automatic.`,
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
    if (stepId === VEHICLE_IMMOBILIZED_STEP_IDS.resolve) {
      const outcome = recordedOutcome ?? selectedOutcome;
      execute(current, {
        kind: 'resolve',
        summary: `Vehicle Immobilized resolved: ${outcome ? outcomeLabel(outcome) : 'operator review complete'}.`,
      }, `resolve:${current.version}`);
    }
  }, [
    execute,
    onStatusMessage,
    openContextStep,
    recordedOutcome,
    review,
    selectedOutcome,
    selectedRecoveryLeadId,
    selectedSpotterId,
    skipStep,
    soloMode,
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
      transition(instance, 'paused', 'Operator paused the Vehicle Immobilized playbook.');
      return;
    }
    if (intent.kind === 'cancel') {
      Alert.alert(
        'Stop Vehicle Immobilized Playbook?',
        'Progress remains in the timeline. This does not cancel or recall any separately created command.',
        [
          { text: 'Keep Playbook', style: 'cancel' },
          {
            text: 'Stop Playbook',
            style: 'destructive',
            onPress: () => transition(instance, 'cancelled', 'Operator stopped the Vehicle Immobilized playbook.'),
          },
        ],
      );
    }
  }, [confirmProposal, continueStep, instance, transition]);

  const openIncidentReview = useCallback(() => {
    if (!instance || !recordedOutcome) return;
    Alert.alert(
      'Open Incident Review?',
      'This opens a prefilled Incident form for operator review. Nothing is declared or transmitted until the form is submitted.',
      [
        { text: 'Keep Playbook', style: 'cancel' },
        {
          text: 'Open Incident Review',
          onPress: () => {
            const result = buildVehicleImmobilizedIncidentHandoff({
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
    const selectedVehicle = vehicles.find((candidate) => candidate.id === selectedVehicleId) ?? null;
    return (
      <ECSModalShell
        visible={visible}
        onClose={onClose}
        title="Vehicle Immobilized"
        subtitle="Confirm known status before coordinating the ECS team"
        eyebrow="MISSION COMMAND / OPERATIONAL PLAYBOOK"
        icon="car-sport-outline"
        overlayClass="workflow"
        stackBehavior="allow-stack"
        maxWidth={760}
        maxHeightFraction={0.94}
        scrollable
        contentContainerStyle={styles.launchContent}
        footer={(
          <ECSOverlayFooter>
            <ECSButton label="Close" icon="close-outline" variant="tertiary" size="medium" grow onPress={onClose} />
            <ECSButton
              label="Start Playbook"
              icon="git-branch-outline"
              variant="primary"
              size="medium"
              grow
              disabled={!selectedVehicle}
              onPress={startForVehicle}
            />
          </ECSOverlayFooter>
        )}
      >
        <View style={styles.launchRoot} accessibilityViewIsModal>
          <ECSPanel variant="warning">
            <Text style={styles.bodyText}>
              Confirm only observed facts. No mechanical diagnosis, physical recovery instruction, reroute, external contact, or incident declaration is automatic.
            </Text>
          </ECSPanel>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Affected Vehicle" icon="car-outline" />
            {vehicles.length > 0 ? (
              <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Affected vehicle">
                {vehicles.map((vehicle) => (
                  <ChoiceButton
                    key={vehicle.id}
                    label={vehicle.label}
                    selected={selectedVehicleId === vehicle.id}
                    onPress={() => setSelectedVehicleId(vehicle.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.bodyText}>No Fleet vehicle is available. Add or restore a vehicle before starting this playbook.</Text>
            )}
          </ECSPanel>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Initial Status" subtitle="Unknown remains unknown" icon="clipboard-outline" />
            <ChoiceGroup
              label="Vehicle stopped"
              value={initialStatus.vehicleStopped}
              options={STOPPED_OPTIONS}
              onChange={(vehicleStopped) => setInitialStatus((current) => ({ ...current, vehicleStopped }))}
            />
            <ChoiceGroup
              label="People accounted for"
              value={initialStatus.peopleAccounted}
              options={ACCOUNTED_OPTIONS}
              onChange={(peopleAccounted) => setInitialStatus((current) => ({ ...current, peopleAccounted }))}
            />
            <ChoiceGroup
              label="Immediate hazard"
              value={initialStatus.immediateHazard}
              options={HAZARD_OPTIONS}
              onChange={(immediateHazard) => setInitialStatus((current) => ({ ...current, immediateHazard }))}
            />
            <ChoiceGroup
              label="Communication"
              value={initialStatus.communication}
              options={COMMUNICATION_OPTIONS}
              onChange={(communication) => setInitialStatus((current) => ({ ...current, communication }))}
            />
            <ChoiceGroup
              label="Route obstruction"
              value={initialStatus.routeObstruction}
              options={OBSTRUCTION_OPTIONS}
              onChange={(routeObstruction) => setInitialStatus((current) => ({ ...current, routeObstruction }))}
            />
          </ECSPanel>
        </View>
      </ECSModalShell>
    );
  }

  const currentProposal = instance.commandProposals.find((proposal) => (
    proposal.status === 'confirmed' && !proposal.commandId
  ));
  const incidentReviewApplicable = Boolean(
    recordedOutcome && !['self_recovered', 'incident_resolved'].includes(recordedOutcome),
  );

  return (
    <DispatchOperationalPlaybookRunner
      enabled
      visible={visible}
      definition={VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION}
      instance={instance}
      readiness={readiness}
      onClose={onClose}
      onIntent={handleIntent}
      scenarioContent={(
        <View style={styles.scenarioContent}>
          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Initial Status" icon="clipboard-outline" />
            <ContextRow label="Vehicle" value={review.vehicleLabel} />
            <ContextRow
              label="Occupants"
              value={review.occupants.length > 0
                ? review.occupants.map((occupant) => occupant.label).join(', ')
                : 'No explicit occupant association'}
              warning={review.occupants.length === 0}
            />
            <ContextRow label="Stopped" value={formatValue(review.initialStatus.vehicleStopped)} warning={review.initialStatus.vehicleStopped === 'unknown'} />
            <ContextRow label="People" value={formatValue(review.initialStatus.peopleAccounted)} warning={review.initialStatus.peopleAccounted !== 'accounted_for'} />
            <ContextRow label="Immediate hazard" value={formatValue(review.initialStatus.immediateHazard)} warning={review.initialStatus.immediateHazard !== 'none_confirmed'} />
            <ContextRow label="Communication" value={formatValue(review.initialStatus.communication)} warning={review.initialStatus.communication !== 'available'} />
            <ContextRow label="Route obstruction" value={formatValue(review.initialStatus.routeObstruction)} warning={review.initialStatus.routeObstruction !== 'clear'} />
          </ECSPanel>

          <ECSPanel variant="secondary">
            <ECSSectionHeader title="Operational Evidence" subtitle="Point-in-time source states" icon="analytics-outline" />
            <ContextRow label="Location" value={`${review.locationLabel} / ${review.locationState}`} warning={review.locationState !== 'live' && review.locationState !== 'recent'} />
            <ContextRow label="Route" value={review.routeLabel} />
            <ContextRow label="Route segment" value={review.routeSegmentLabel} warning={review.routeSegmentLabel.startsWith('No ')} />
            <EvidenceRow label="Terrain" evidence={review.terrain} />
            <EvidenceRow label="Attitude" evidence={review.attitude} />
            <EvidenceRow label="Weather" evidence={review.weather} />
            <EvidenceRow label="Daylight" evidence={review.daylight} />
            <EvidenceRow label="Convoy" evidence={review.convoy} />
            <EvidenceRow label="Recovery equipment" evidence={review.recoveryEquipment} />
            <EvidenceRow label="Vehicle / loadout" evidence={review.vehicleReadiness} />
            <EvidenceRow label="Communications" evidence={review.communicationState} />
            <ContextRow
              label="Recovery-capable vehicles"
              value={review.recoveryCapableVehicles.length > 0
                ? review.recoveryCapableVehicles.map((candidate) => candidate.label).join(', ')
                : 'None verified from current Fleet data'}
              warning={review.recoveryCapableVehicles.length === 0}
            />
            <ContextRow label="Recovery lead" value={review.recoveryLead?.label ?? 'Unassigned'} warning={!review.recoveryLead} />
            <ContextRow label="Spotter" value={review.spotter?.label ?? 'Unassigned'} warning={!review.spotter} />
            <ContextRow
              label="Coordination command"
              value={`${review.coordinationCommand.deliveryState} / ${review.coordinationCommand.acknowledgmentState}`}
              warning={review.coordinationCommand.commandId == null}
            />
            <ContextRow label="Bailout / camp" value={review.bailoutOrCampLabel} warning={review.bailoutOrCampLabel.startsWith('No ')} />
            {review.missingFields.length > 0 ? (
              <View style={styles.missingRow}>
                <ECSBadge label={`${review.missingFields.length} unknown`} tone="warning" compact />
                <Text style={styles.missingText}>{review.missingFields.join(', ')}</Text>
              </View>
            ) : null}
          </ECSPanel>

          {review.approvedRecoveryProtocols.length > 0 ? (
            <ECSPanel variant="secondary">
              <ECSSectionHeader title="Approved Protocol References" icon="shield-checkmark-outline" />
              <Text style={styles.bodyText}>
                Use the existing ECS Recovery Protocol utility for approved guidance. Mission Command adds no physical recovery instructions.
              </Text>
              <View style={styles.protocolRow}>
                {review.approvedRecoveryProtocols.map((protocol) => (
                  <ECSBadge key={protocol.id} label={protocol.title} tone="info" compact />
                ))}
              </View>
            </ECSPanel>
          ) : null}

          {instance.currentStepId === VEHICLE_IMMOBILIZED_STEP_IDS.assignRecoveryLead ? (
            <AssignmentPanel
              title="Recovery Lead"
              candidates={review.recoveryLeadCandidates}
              selectedId={selectedRecoveryLeadId}
              onSelect={setSelectedRecoveryLeadId}
            />
          ) : null}

          {instance.currentStepId === VEHICLE_IMMOBILIZED_STEP_IDS.assignSpotter ? (
            <AssignmentPanel
              title="Spotter"
              candidates={review.spotterCandidates}
              selectedId={selectedSpotterId}
              onSelect={setSelectedSpotterId}
            />
          ) : null}

          {instance.currentStepId === VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome ? (
            <ECSPanel variant="primary">
              <ECSSectionHeader title="Operator Outcome" icon="checkmark-done-outline" />
              <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Vehicle Immobilized outcome options">
                {OUTCOMES.map((outcome) => (
                  <ChoiceButton
                    key={outcome.id}
                    label={outcome.label}
                    selected={selectedOutcome === outcome.id}
                    onPress={() => setSelectedOutcome(outcome.id)}
                  />
                ))}
              </View>
            </ECSPanel>
          ) : null}

          {currentProposal ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Confirmed Proposal" icon="document-text-outline" />
              <Text style={styles.bodyText}>
                The proposal is confirmed but no command is linked. Command Composer still requires a separate submission.
              </Text>
              <ECSButton
                label="Open Command Composer"
                icon="create-outline"
                variant="secondary"
                size="compact"
                onPress={() => openConfirmedProposal(instance, currentProposal)}
              />
            </ECSPanel>
          ) : null}

          {incidentReviewApplicable ? (
            <ECSPanel variant="warning">
              <ECSSectionHeader title="Incident Review" icon="warning-outline" />
              <Text style={styles.bodyText}>
                Incident creation is optional and explicit. Review all prefilled unknown, stale, and source-labeled fields before submission.
              </Text>
              <ECSButton
                label="Open Incident Review"
                icon="warning-outline"
                variant="secondary"
                size="compact"
                onPress={openIncidentReview}
              />
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
    <View style={styles.choiceGroup}>
      <Text style={styles.choiceGroupLabel}>{label}</Text>
      <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <ChoiceButton
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
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

function AssignmentPanel({
  title,
  candidates,
  selectedId,
  onSelect,
}: {
  title: string;
  candidates: { id: string; label: string; roleId?: string | null }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ECSPanel variant="primary">
      <ECSSectionHeader title={`Assign ${title}`} icon="person-add-outline" />
      {candidates.length > 0 ? (
        <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel={`${title} candidates`}>
          {candidates.map((candidate) => (
            <ChoiceButton
              key={candidate.id}
              label={`${candidate.label}${candidate.roleId ? ` / ${candidate.roleId}` : ''}`}
              selected={selectedId === candidate.id}
              onPress={() => onSelect(candidate.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.bodyText}>No permitted candidate is available. Use the runner action to record an explicit skip.</Text>
      )}
    </ECSPanel>
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
  evidence: { label: string; state: string };
}) {
  return <ContextRow label={label} value={`${evidence.label} / ${evidence.state}`} warning={evidence.state !== 'available'} />;
}

function acknowledgmentTargets(instance: OperationalPlaybookInstance): string[] {
  const proposal = [...instance.commandProposals].reverse().find((candidate) => (
    candidate.stepId === VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop
  ));
  const ids = new Set<string>();
  if (proposal?.target?.kind === 'team') proposal.target.memberIds.forEach((id) => ids.add(id));
  if (proposal?.target?.kind === 'member' || proposal?.target?.kind === 'solo') ids.add(proposal.target.memberId);
  instance.stepResults.forEach((result) => {
    if (result.data.kind === 'role_assigned' && result.data.assigneeId) ids.add(result.data.assigneeId);
  });
  return [...ids].sort();
}

function outcomeLabel(outcome: VehicleImmobilizedOutcome): string {
  return OUTCOMES.find((candidate) => candidate.id === outcome)?.label ?? formatValue(outcome);
}

function formatValue(value: string): string {
  return value.split('_').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
}

const styles = StyleSheet.create({
  launchContent: { paddingBottom: 8 },
  launchRoot: { gap: 12 },
  scenarioContent: { gap: 12 },
  choiceGroup: {
    gap: 7,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  choiceGroupLabel: { color: TACTICAL.text, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: {
    minHeight: 44,
    minWidth: 136,
    flexGrow: 1,
    flexBasis: '42%',
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  choiceButtonSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  choiceLabel: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  choiceLabelSelected: { color: TACTICAL.amber },
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
  contextValue: { color: TACTICAL.text, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'right', flex: 1 },
  warningText: { color: TACTICAL.amber },
  missingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  missingText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, flex: 1 },
  protocolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  bodyText: { color: TACTICAL.textMuted, fontSize: 12, lineHeight: 18 },
  safetyCopy: { color: ECS.status.warning, fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
