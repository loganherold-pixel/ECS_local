import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import {
  buildGuardianCheckInComposerRequest,
  buildGuardianCheckInIncidentHandoff,
  collectGuardianCheckInDeadlines,
  formatGuardianTrigger,
  selectGuardianCheckInPresentation,
  type GuardianCheckInComposerRequest,
} from '../../lib/dispatchGuardianCheckInAdapter';
import {
  createGuardianCheckInPlan,
  guardianTriggerRequiresOperatorConfirmation,
  markGuardianCheckInTrigger,
  recordGuardianCheckInNoResponse,
  recordGuardianCheckInResponse,
  resolveGuardianCheckInCycle,
  transitionGuardianCheckInLifecycle,
} from '../../lib/dispatchGuardianCheckInDomain';
import type {
  GuardianCheckInMutationResult,
  GuardianCheckInPlan,
  GuardianCheckInResponseState,
  GuardianCheckInTriggerType,
} from '../../lib/dispatchGuardianCheckInTypes';
import type {
  MissionCommandComposerContextOption,
  MissionCommandComposerMemberOption,
} from '../../lib/dispatchMissionCommandComposer';
import type { MissionCommandActor, MissionCommandTarget } from '../../lib/dispatchMissionCommandTypes';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from '../../lib/dispatchPersistenceAdapter';
import type { ReportIncidentInput } from '../../lib/incidentRecoveryWorkflowStore';
import { useMissionClockScheduler } from '../../lib/useMissionClockScheduler';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';

export interface DispatchGuardianCheckInsProps {
  enabled: boolean;
  visible: boolean;
  expeditionId: string;
  persistenceDefaults: DispatchPersistenceDefaults;
  actor: MissionCommandActor;
  soloMode: boolean;
  members: MissionCommandComposerMemberOption[];
  linkedContexts: MissionCommandComposerContextOption[];
  canTargetIndividuals: boolean;
  canTargetExpedition: boolean;
  locationPermissionAllowed: boolean;
  onClose: () => void;
  onOpenCommandComposer: (request: GuardianCheckInComposerRequest) => void;
  onOpenIncidentReview: (prefill: ReportIncidentInput) => void;
  onStatusMessage?: (message: string) => void;
}

const TRIGGER_OPTIONS: { value: GuardianCheckInTriggerType; label: string }[] = [
  { value: 'fixed_time', label: 'Fixed Time' },
  { value: 'recurring_interval', label: 'Recurring' },
  { value: 'route_checkpoint', label: 'Route Checkpoint' },
  { value: 'rally_arrival', label: 'Rally Arrival' },
  { value: 'camp_arrival', label: 'Camp Arrival' },
  { value: 'remote_segment_entry', label: 'Remote Segment' },
  { value: 'operator_requested', label: 'Operator Request' },
  { value: 'post_incident_follow_up', label: 'Post-Incident' },
  { value: 'manual_one_time', label: 'Manual One-Time' },
];
const TIME_OPTIONS = [15, 30, 60, 120];
const GRACE_OPTIONS = [5, 10, 15, 30];
const INITIAL_PLAN_WINDOW = 12;

export default function DispatchGuardianCheckIns({
  enabled,
  visible,
  expeditionId,
  persistenceDefaults,
  actor,
  soloMode,
  members,
  linkedContexts,
  canTargetIndividuals,
  canTargetExpedition,
  locationPermissionAllowed,
  onClose,
  onOpenCommandComposer,
  onOpenIncidentReview,
  onStatusMessage,
}: DispatchGuardianCheckInsProps) {
  const revision = useDispatchPersistenceRevision(expeditionId);
  const [creating, setCreating] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<GuardianCheckInTriggerType>('manual_one_time');
  const [targetId, setTargetId] = useState(() => defaultTargetId({
    soloMode,
    actor,
    members,
    canTargetIndividuals,
    canTargetExpedition,
  }));
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [contextId, setContextId] = useState('');
  const [includeExactLocation, setIncludeExactLocation] = useState(false);
  const [planWindow, setPlanWindow] = useState(INITIAL_PLAN_WINDOW);
  const creatingRef = useRef(false);

  const loadResult = useMemo(() => {
    void revision;
    return dispatchPersistenceAdapter.loadResult(expeditionId, persistenceDefaults);
  }, [expeditionId, persistenceDefaults, revision]);
  const plans = useMemo(() => [...loadResult.snapshot.guardianCheckIns]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [loadResult.snapshot.guardianCheckIns]);
  const visiblePlans = plans.slice(0, planWindow);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const selectedPresentation = useMemo(() => selectedPlan
    ? selectGuardianCheckInPresentation({
        plan: selectedPlan,
        commands: loadResult.snapshot.missionCommands,
      })
    : null, [loadResult.snapshot.missionCommands, selectedPlan]);
  const deadlineInputs = useMemo(() => collectGuardianCheckInDeadlines(plans), [plans]);
  const missionClock = useMissionClockScheduler({
    expeditionId,
    deadlines: deadlineInputs,
    enabled: visible && plans.length > 0,
  });
  const selectedClock = selectedPlan
    ? missionClock.deadlines.find((deadline) => deadline.id === `mission-clock:guardian:${selectedPlan.id}`) ?? null
    : null;
  const contextOptions = useMemo(
    () => guardianContextOptions(triggerType, linkedContexts),
    [linkedContexts, triggerType],
  );
  const selectedContext = contextOptions.find((option) => option.id === contextId) ?? null;
  const canIncludeLocation = Boolean(
    locationPermissionAllowed &&
    selectedContext?.context.coordinates &&
    !selectedContext.context.restricted
  );

  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setSelectedPlanId(null);
      setTriggerType('manual_one_time');
      setTargetId(defaultTargetId({
        soloMode,
        actor,
        members,
        canTargetIndividuals,
        canTargetExpedition,
      }));
      setTimeMinutes(30);
      setGraceMinutes(15);
      setContextId('');
      setIncludeExactLocation(false);
      setPlanWindow(INITIAL_PLAN_WINDOW);
    }
  }, [actor, canTargetExpedition, canTargetIndividuals, members, soloMode, visible]);

  useEffect(() => {
    if (!contextOptions.some((option) => option.id === contextId)) {
      setContextId(contextOptions[0]?.id ?? '');
      setIncludeExactLocation(false);
    }
  }, [contextId, contextOptions]);

  const persistMutation = useCallback((result: GuardianCheckInMutationResult) => {
    if (!result.ok) {
      onStatusMessage?.(result.reason);
      return false;
    }
    if (result.changed) {
      dispatchPersistenceAdapter.upsertGuardianCheckIn(expeditionId, persistenceDefaults, result.plan);
      setSelectedPlanId(result.plan.id);
    }
    return true;
  }, [expeditionId, onStatusMessage, persistenceDefaults]);

  const createPlan = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const target = buildTarget({
        soloMode,
        actor,
        members,
        targetId,
        canTargetIndividuals,
        canTargetExpedition,
      });
      if (!target) {
        onStatusMessage?.('Select a valid Guardian Check-In target.');
        return;
      }
      const now = new Date().toISOString();
      const result = createGuardianCheckInPlan({
        expeditionId,
        actor,
        target,
        triggerType,
        dueAt: triggerType === 'fixed_time'
          ? new Date(Date.parse(now) + timeMinutes * 60_000).toISOString()
          : null,
        intervalMinutes: triggerType === 'recurring_interval' ? timeMinutes : null,
        linkedContext: selectedContext?.context ?? null,
        includeExactLocation: includeExactLocation && canIncludeLocation,
        locationPermissionAllowed,
        acknowledgmentRequirement: soloMode
          ? { mode: 'none', targetMemberIds: [] }
          : { mode: 'all', targetMemberIds: targetMemberIds(target) },
        gracePeriodMinutes: graceMinutes,
        sourceTruth: selectedContext?.context.sourceTruth ? [selectedContext.context.sourceTruth] : [],
        soloMode,
        now,
        idempotencyKey: `guardian:create:${expeditionId}:${actor.id}:${Date.now()}`,
      });
      if (!result.ok) {
        onStatusMessage?.(result.reason);
        return;
      }
      const existing = plans.find((plan) => plan.idempotencyKey === result.plan.idempotencyKey);
      if (existing) {
        setSelectedPlanId(existing.id);
        setCreating(false);
        return;
      }
      dispatchPersistenceAdapter.upsertGuardianCheckIn(expeditionId, persistenceDefaults, result.plan);
      setSelectedPlanId(result.plan.id);
      setCreating(false);
      onStatusMessage?.('Guardian Check-In plan created locally.');
    } finally {
      creatingRef.current = false;
    }
  }, [
    actor,
    canTargetExpedition,
    canTargetIndividuals,
    canIncludeLocation,
    expeditionId,
    graceMinutes,
    includeExactLocation,
    locationPermissionAllowed,
    members,
    onStatusMessage,
    persistenceDefaults,
    plans,
    selectedContext,
    soloMode,
    targetId,
    timeMinutes,
    triggerType,
  ]);

  const requestCheckIn = useCallback((plan: GuardianCheckInPlan) => {
    const draft = buildGuardianCheckInComposerRequest({ plan, actor, members });
    if (!draft.ok) {
      onStatusMessage?.(draft.reason);
      return;
    }
    Alert.alert(
      'Prepare Guardian Check-In?',
      plan.soloMode
        ? 'This opens a local self check-in reminder. It does not claim another person receives it.'
        : 'This opens Command Composer for review. Nothing is sent until you explicitly submit the command.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Open Composer',
          onPress: () => {
            onOpenCommandComposer(draft.request);
            onClose();
          },
        },
      ],
    );
  }, [actor, members, onClose, onOpenCommandComposer, onStatusMessage]);

  const confirmTrigger = useCallback((plan: GuardianCheckInPlan) => {
    Alert.alert(
      'Confirm Trigger Reached?',
      'This records the operator-observed trigger only. It does not send a check-in or infer arrival automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Trigger',
          onPress: () => persistMutation(markGuardianCheckInTrigger({
            plan,
            actor,
            triggerIdempotencyKey: `${plan.id}:cycle:${plan.cycle}:trigger:${plan.trigger.linkedContext?.id ?? plan.trigger.type}`,
          })),
        },
      ],
    );
  }, [actor, persistMutation]);

  const setLifecycle = useCallback((plan: GuardianCheckInPlan, next: 'active' | 'paused' | 'cancelled') => {
    const apply = () => persistMutation(transitionGuardianCheckInLifecycle({
      plan,
      actor,
      next,
      reason: next === 'cancelled' ? 'Operator cancelled Guardian Check-In.' : undefined,
    }));
    if (next !== 'cancelled') {
      apply();
      return;
    }
    Alert.alert(
      'Cancel Guardian Check-In?',
      'The plan and its audit history remain local. Existing commands are not recalled.',
      [
        { text: 'Keep Plan', style: 'cancel' },
        { text: 'Cancel Plan', style: 'destructive', onPress: apply },
      ],
    );
  }, [actor, persistMutation]);

  const recordResponse = useCallback((
    plan: GuardianCheckInPlan,
    response: 'acknowledged' | 'delayed' | 'declined' | 'resolved',
  ) => {
    const command = plan.currentCommandId
      ? loadResult.snapshot.missionCommands.find((candidate) => candidate.id === plan.currentCommandId) ?? null
      : null;
    const result = recordGuardianCheckInResponse({
      plan,
      response,
      actor,
      command,
      explicitOperatorChoice: true,
    });
    persistMutation(result);
  }, [actor, loadResult.snapshot.missionCommands, persistMutation]);

  const recordNoResponse = useCallback((plan: GuardianCheckInPlan) => {
    const command = plan.currentCommandId
      ? loadResult.snapshot.missionCommands.find((candidate) => candidate.id === plan.currentCommandId) ?? null
      : null;
    Alert.alert(
      'Record No Response?',
      'This creates a local Command Board decision item. It does not declare an emergency, contact anyone, or transmit externally.',
      [
        { text: 'Keep Waiting', style: 'cancel' },
        {
          text: 'Record No Response',
          onPress: () => {
            const result = recordGuardianCheckInNoResponse({
              plan,
              actor,
              command,
              explicitOperatorChoice: true,
            });
            if (!result.ok) {
              onStatusMessage?.(result.reason);
              return;
            }
            if (result.changed && result.decisionCommand && result.decisionEvent) {
              dispatchPersistenceAdapter.applyGuardianCheckInDecision(
                expeditionId,
                persistenceDefaults,
                result.plan,
                result.decisionCommand,
                result.decisionEvent,
              );
              setSelectedPlanId(result.plan.id);
            }
          },
        },
      ],
    );
  }, [actor, expeditionId, loadResult.snapshot.missionCommands, onStatusMessage, persistenceDefaults]);

  const resolveCycle = useCallback((plan: GuardianCheckInPlan) => {
    persistMutation(resolveGuardianCheckInCycle({
      plan,
      actor,
      explicitOperatorChoice: true,
    }));
  }, [actor, persistMutation]);

  const openSoloIncident = useCallback((plan: GuardianCheckInPlan) => {
    Alert.alert(
      'Open Local Incident Record?',
      'This opens a local Incident form. No emergency is declared and nothing is transmitted until you explicitly submit that form.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Incident Form',
          onPress: () => {
            const result = buildGuardianCheckInIncidentHandoff({ plan, explicitOperatorChoice: true });
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
  }, [onClose, onOpenIncidentReview, onStatusMessage]);

  if (!enabled) return null;

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Guardian Check-Ins"
      subtitle={soloMode ? 'Personal accountability and local decision reminders' : 'Team accountability with explicit delivery and acknowledgment state'}
      eyebrow="MISSION COMMAND / ACCOUNTABILITY"
      icon="shield-checkmark-outline"
      overlayClass="workflow"
      stackBehavior="allow-stack"
      maxWidth={860}
      maxHeightFraction={0.94}
      scrollable
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton label="Close" icon="close-outline" variant="tertiary" size="medium" grow onPress={onClose} />
          <ECSButton
            label={creating ? 'Cancel New Plan' : 'New Plan'}
            icon={creating ? 'close-circle-outline' : 'add-outline'}
            variant="secondary"
            size="medium"
            grow
            onPress={() => setCreating((current) => !current)}
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <ECSPanel variant="warning">
          <Text style={styles.safetyText}>
            Guardian Check-Ins coordinate ECS users only. No missed check-in declares an emergency, contacts external services, or proves a person received a request.
          </Text>
        </ECSPanel>

        {creating ? (
          <View style={styles.sectionStack} testID="guardian-check-in-create-form">
            <ChoiceGroup label="Trigger" value={triggerType} options={TRIGGER_OPTIONS} onChange={setTriggerType} />
            <ECSPanel variant="secondary">
              <ECSSectionHeader title="Target" icon="person-outline" />
              <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Guardian Check-In target">
                {soloMode ? (
                  <ChoiceButton label={`${actor.label} / self`} selected onPress={() => setTargetId(actor.id)} />
                ) : (
                  <>
                    {canTargetIndividuals ? members.map((member) => (
                      <ChoiceButton key={member.id} label={member.label} selected={targetId === member.id} onPress={() => setTargetId(member.id)} />
                    )) : null}
                    {canTargetExpedition && members.length > 1 ? (
                      <ChoiceButton label="Whole Expedition" selected={targetId === '__team__'} onPress={() => setTargetId('__team__')} />
                    ) : null}
                    {!canTargetIndividuals && !canTargetExpedition ? (
                      <Text style={styles.bodyText}>Current Dispatch permissions do not allow a Guardian Check-In target.</Text>
                    ) : null}
                  </>
                )}
              </View>
            </ECSPanel>
            {triggerType === 'fixed_time' || triggerType === 'recurring_interval' ? (
              <NumberChoices
                label={triggerType === 'fixed_time' ? 'Start In' : 'Repeat Every'}
                value={timeMinutes}
                values={TIME_OPTIONS}
                onChange={setTimeMinutes}
              />
            ) : null}
            <NumberChoices label="Grace Period" value={graceMinutes} values={GRACE_OPTIONS} onChange={setGraceMinutes} />
            {contextOptions.length > 0 ? (
              <ECSPanel variant="secondary">
                <ECSSectionHeader title="Linked Context" subtitle="Exact coordinates are excluded by default" icon="link-outline" />
                <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel="Guardian linked context">
                  {contextOptions.map((option) => (
                    <ChoiceButton key={option.id} label={option.label} selected={contextId === option.id} onPress={() => setContextId(option.id)} />
                  ))}
                </View>
                <ToggleButton
                  label={canIncludeLocation ? 'Include exact permitted location' : 'Exact location unavailable or restricted'}
                  selected={includeExactLocation && canIncludeLocation}
                  disabled={!canIncludeLocation}
                  onPress={() => setIncludeExactLocation((current) => !current)}
                />
              </ECSPanel>
            ) : guardianTriggerRequiresOperatorConfirmation(triggerType) ? (
              <ECSPanel variant="warning">
                <Text style={styles.bodyText}>No compatible linked context is available for this trigger.</Text>
              </ECSPanel>
            ) : null}
            <ECSButton label="Create Guardian Plan" icon="shield-checkmark-outline" variant="primary" size="medium" onPress={createPlan} />
          </View>
        ) : null}

        <ECSPanel variant="secondary">
          <ECSSectionHeader
            title="Plans"
            subtitle={`${plans.length} retained / ${plans.filter((plan) => plan.lifecycleState === 'active').length} active`}
            icon="list-outline"
          />
          {visiblePlans.length === 0 ? (
            <Text style={styles.bodyText}>No Guardian Check-In plans yet.</Text>
          ) : visiblePlans.map((plan) => {
            const presentation = selectGuardianCheckInPresentation({
              plan,
              commands: loadResult.snapshot.missionCommands,
              now: missionClock.nowMs,
            });
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planRow, selectedPlanId === plan.id ? styles.planRowSelected : null]}
                accessibilityRole="button"
                accessibilityLabel={`${presentation.title}. ${presentation.targetLabel}. ${formatValue(presentation.responseState)}. ${formatValue(presentation.deadlineStatus)}.`}
                activeOpacity={0.78}
                onPress={() => setSelectedPlanId(plan.id)}
              >
                <View style={styles.flexCopy}>
                  <Text style={styles.planTitle}>{presentation.title}</Text>
                  <Text style={styles.helperText}>{presentation.targetLabel} / {presentation.triggerLabel}</Text>
                </View>
                <View style={styles.badgeColumn}>
                  <ECSBadge label={formatValue(presentation.responseState)} tone={presentation.noResponseDecisionRequired ? 'warning' : 'info'} compact />
                  <ECSBadge label={formatValue(presentation.lifecycleState)} tone={presentation.lifecycleState === 'active' ? 'live' : 'info'} compact />
                </View>
              </TouchableOpacity>
            );
          })}
          {plans.length > visiblePlans.length ? (
            <ECSButton label="Show More Plans" icon="chevron-down-outline" variant="tertiary" size="compact" onPress={() => setPlanWindow((count) => count + INITIAL_PLAN_WINDOW)} />
          ) : null}
        </ECSPanel>

        {selectedPlan && selectedPresentation ? (
          <View style={styles.sectionStack} testID="guardian-check-in-plan-detail">
            <ECSPanel variant="primary">
              <ECSSectionHeader title={selectedPlan.title} subtitle={selectedPresentation.targetLabel} icon="shield-checkmark-outline" />
              <Fact label="Trigger" value={`${selectedPresentation.triggerLabel} / ${formatValue(selectedPresentation.triggerSupport)}`} />
              <Fact label="Response" value={formatValue(selectedPresentation.responseState)} warning={selectedPresentation.noResponseDecisionRequired} />
              <Fact label="Mission Clock" value={selectedClock ? `${formatValue(selectedClock.status)} / ${selectedClock.dueAt}` : 'Not scheduled'} warning={selectedClock?.status === 'overdue'} />
              <Fact label="Grace period" value={`${selectedPlan.gracePeriodMinutes} minutes`} />
              <Fact label="Source" value={selectedPresentation.sourceLabel} />
              <Fact label="Source age" value={selectedPresentation.sourceAgeLabel} warning={selectedPresentation.sourceAgeLabel.includes('future') || selectedPresentation.sourceAgeLabel.includes('invalid')} />
              <Fact label="Location accuracy" value={selectedPresentation.accuracyLabel} warning={selectedPresentation.accuracyLabel === 'Unavailable'} />
              <Fact label="Location" value={selectedPresentation.locationLabel} warning={selectedPlan.trigger.linkedContext?.restricted === true} />
              {selectedPresentation.soloStatement ? <Text style={styles.safetyText}>{selectedPresentation.soloStatement}</Text> : null}
            </ECSPanel>

            <ECSPanel variant="secondary">
              <ECSSectionHeader title="Available Actions" subtitle="Every transmission or conclusion remains explicit" icon="options-outline" />
              <View style={styles.actionGrid}>
                {selectedPlan.lifecycleState === 'active' ? (
                  <ECSButton label="Pause" icon="pause-outline" variant="tertiary" size="compact" onPress={() => setLifecycle(selectedPlan, 'paused')} />
                ) : selectedPlan.lifecycleState === 'paused' ? (
                  <ECSButton label="Resume" icon="play-outline" variant="secondary" size="compact" onPress={() => setLifecycle(selectedPlan, 'active')} />
                ) : null}
                {selectedPlan.lifecycleState === 'active' && guardianTriggerRequiresOperatorConfirmation(selectedPlan.trigger.type) && !selectedPlan.trigger.lastTriggeredAt ? (
                  <ECSButton label="Confirm Trigger Reached" icon="location-outline" variant="secondary" size="compact" onPress={() => confirmTrigger(selectedPlan)} />
                ) : null}
                {selectedPlan.lifecycleState === 'active' && !selectedPlan.currentCommandId ? (
                  <ECSButton label={selectedPlan.soloMode ? 'Open Self Check-In' : 'Request Check-In'} icon="checkmark-circle-outline" variant="primary" size="compact" onPress={() => requestCheckIn(selectedPlan)} />
                ) : null}
                {selectedPresentation.responseState === 'acknowledged' && selectedPlan.responseState !== 'acknowledged' ? (
                  <ECSButton label="Record Acknowledged" icon="checkmark-done-outline" variant="secondary" size="compact" onPress={() => recordResponse(selectedPlan, 'acknowledged')} />
                ) : null}
                {selectedPlan.soloMode && ['requested', 'delivered'].includes(selectedPresentation.responseState) ? (
                  <ECSButton label="Complete Self Check-In" icon="person-circle-outline" variant="secondary" size="compact" onPress={() => recordResponse(selectedPlan, 'acknowledged')} />
                ) : null}
                {!selectedPlan.soloMode && ['requested', 'delivered'].includes(selectedPresentation.responseState) ? (
                  <>
                    <ECSButton label="Record Delayed" icon="time-outline" variant="tertiary" size="compact" onPress={() => recordResponse(selectedPlan, 'delayed')} />
                    <ECSButton label="Record Declined" icon="close-circle-outline" variant="tertiary" size="compact" onPress={() => recordResponse(selectedPlan, 'declined')} />
                  </>
                ) : null}
                {selectedPresentation.noResponseDecisionRequired ? (
                  <ECSButton label="Record No Response" icon="alert-circle-outline" variant="secondary" size="compact" onPress={() => recordNoResponse(selectedPlan)} />
                ) : null}
                {['acknowledged', 'delayed', 'declined', 'no_response', 'resolved'].includes(selectedPlan.responseState) ? (
                  <ECSButton label={selectedPlan.trigger.type === 'recurring_interval' ? 'Resolve Cycle' : 'Resolve Plan'} icon="checkmark-done-outline" variant="secondary" size="compact" onPress={() => resolveCycle(selectedPlan)} />
                ) : null}
                {selectedPlan.soloMode && ['delayed', 'declined', 'no_response'].includes(selectedPlan.responseState) ? (
                  <ECSButton label="Open Local Incident Record" icon="document-text-outline" variant="secondary" size="compact" onPress={() => openSoloIncident(selectedPlan)} />
                ) : null}
                {!['completed', 'cancelled'].includes(selectedPlan.lifecycleState) ? (
                  <ECSButton label="Cancel Plan" icon="trash-outline" variant="tertiary" size="compact" onPress={() => setLifecycle(selectedPlan, 'cancelled')} />
                ) : null}
              </View>
            </ECSPanel>

            <ECSPanel variant="secondary">
              <ECSSectionHeader title="Recent Plan Events" icon="time-outline" />
              {selectedPlan.events.slice(-8).reverse().map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <Text style={styles.eventTitle}>{formatValue(event.type)}</Text>
                  <Text style={styles.helperText}>{event.summary}</Text>
                  <Text style={styles.eventTime}>{event.occurredAt}</Text>
                </View>
              ))}
            </ECSPanel>
          </View>
        ) : null}
      </View>
    </ECSModalShell>
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

function NumberChoices({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
}) {
  return (
    <ECSPanel variant="secondary">
      <ECSSectionHeader title={label} icon="time-outline" />
      <View style={styles.choiceGrid} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {values.map((option) => (
          <ChoiceButton key={option} label={`${option} min`} selected={value === option} onPress={() => onChange(option)} />
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
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleButton, selected ? styles.choiceButtonSelected : null, disabled ? styles.disabled : null]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Fact({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.factRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, warning ? styles.warningText : null]}>{value}</Text>
    </View>
  );
}

function buildTarget(input: {
  soloMode: boolean;
  actor: MissionCommandActor;
  members: MissionCommandComposerMemberOption[];
  targetId: string;
  canTargetIndividuals: boolean;
  canTargetExpedition: boolean;
}): MissionCommandTarget | null {
  if (input.soloMode) return { kind: 'solo', memberId: input.actor.id, label: input.actor.label };
  if (input.targetId === '__team__') {
    if (!input.canTargetExpedition) return null;
    const memberIds = input.members.map((member) => member.id);
    return memberIds.length > 0 ? { kind: 'team', memberIds, label: 'Whole Expedition' } : null;
  }
  if (!input.canTargetIndividuals) return null;
  const member = input.members.find((candidate) => candidate.id === input.targetId);
  return member ? { kind: 'member', memberId: member.id, label: member.label } : null;
}

function defaultTargetId(input: {
  soloMode: boolean;
  actor: MissionCommandActor;
  members: MissionCommandComposerMemberOption[];
  canTargetIndividuals: boolean;
  canTargetExpedition: boolean;
}): string {
  if (input.soloMode) return input.actor.id;
  if (input.canTargetIndividuals && input.members[0]) return input.members[0].id;
  if (input.canTargetExpedition && input.members.length > 1) return '__team__';
  return '';
}

function targetMemberIds(target: MissionCommandTarget): string[] {
  if (target.kind === 'member' || target.kind === 'solo') return [target.memberId];
  if (target.kind === 'team') return [...target.memberIds];
  return [];
}

function guardianContextOptions(
  trigger: GuardianCheckInTriggerType,
  contexts: MissionCommandComposerContextOption[],
): MissionCommandComposerContextOption[] {
  const allowed = trigger === 'route_checkpoint'
    ? new Set(['waypoint', 'route_segment'])
    : trigger === 'rally_arrival'
      ? new Set(['rally'])
      : trigger === 'camp_arrival'
        ? new Set(['camp'])
        : trigger === 'remote_segment_entry'
          ? new Set(['route_segment'])
          : trigger === 'post_incident_follow_up'
            ? new Set(['incident'])
            : null;
  if (!allowed) return contexts.filter((option) => ['route', 'waypoint', 'rally', 'camp', 'incident'].includes(option.context.type)).slice(0, 12);
  return contexts.filter((option) => allowed.has(option.context.type)).slice(0, 12);
}

function formatValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  root: { gap: 12 },
  sectionStack: { gap: 12 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: {
    minHeight: 44,
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 145,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  toggleButton: {
    minHeight: 44,
    marginTop: 10,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  choiceButtonSelected: { borderColor: TACTICAL.amber, backgroundColor: ECS_SURFACE.background.selected },
  choiceLabel: { color: TACTICAL.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  choiceLabelSelected: { color: TACTICAL.amber },
  disabled: { opacity: 0.48 },
  bodyText: { color: TACTICAL.textMuted, fontSize: 14, lineHeight: 20 },
  safetyText: { color: ECS.status.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  helperText: { color: TACTICAL.textMuted, fontSize: 12, lineHeight: 17 },
  planRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  planRowSelected: { backgroundColor: ECS_SURFACE.background.selected },
  flexCopy: { flex: 1, gap: 3, minWidth: 0 },
  planTitle: { color: TACTICAL.text, fontSize: 14, fontWeight: '800' },
  badgeColumn: { alignItems: 'flex-end', gap: 5 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  factLabel: { color: TACTICAL.textMuted, fontSize: 12, fontWeight: '700', flexBasis: 110 },
  factValue: { color: TACTICAL.text, fontSize: 13, lineHeight: 18, flex: 1, textAlign: 'right' },
  warningText: { color: TACTICAL.amber },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  eventRow: { gap: 3, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ECS_SURFACE.border.quiet },
  eventTitle: { color: TACTICAL.text, fontSize: 13, fontWeight: '700' },
  eventTime: { color: TACTICAL.textMuted, fontSize: 11 },
});
