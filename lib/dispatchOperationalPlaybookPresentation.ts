import { resolveOperationalPlaybookInputState } from './dispatchOperationalPlaybookDomain';
import type {
  OperationalPlaybookCommandProposal,
  OperationalPlaybookDefinition,
  OperationalPlaybookInputState,
  OperationalPlaybookInstance,
  OperationalPlaybookReadiness,
  OperationalPlaybookState,
  OperationalPlaybookStepDefinition,
} from './dispatchOperationalPlaybookTypes';
import type { SourceTruthRef } from './sourceTruth';

export const OPERATIONAL_PLAYBOOK_SAFETY_COPY =
  'ECS team coordination only. Playbooks do not send commands, declare emergencies, reroute, select camps, or contact anyone automatically.';

export type OperationalPlaybookPresentationTone =
  | 'ready'
  | 'warning'
  | 'unavailable'
  | 'info'
  | 'category';

export type OperationalPlaybookRunnerIntent =
  | { kind: 'transition'; next: 'ready' | 'active' }
  | { kind: 'continue_step'; stepId: string }
  | { kind: 'review_command_proposal'; proposalId: string }
  | { kind: 'pause' }
  | { kind: 'cancel' };

export interface OperationalPlaybookRunnerActionModel {
  intent: OperationalPlaybookRunnerIntent;
  label: string;
  icon:
    | 'checkmark-circle-outline'
    | 'play-outline'
    | 'pause-outline'
    | 'close-circle-outline'
    | 'arrow-forward-outline'
    | 'document-text-outline';
  disabled: boolean;
  disabledReason?: string;
}

export interface OperationalPlaybookInputPresentation {
  key: string;
  label: string;
  description: string;
  required: boolean;
  state: OperationalPlaybookInputState;
  stateLabel: string;
  tone: OperationalPlaybookPresentationTone;
  sourceTruth: SourceTruthRef[];
}

export interface OperationalPlaybookStepPresentation {
  id: string;
  type: OperationalPlaybookStepDefinition['type'];
  title: string;
  instructions: string;
  position: number;
  total: number;
  skippable: boolean;
  requiredInputs: OperationalPlaybookInputPresentation[];
}

export interface OperationalPlaybookRunnerModel {
  title: string;
  description: string;
  state: OperationalPlaybookState;
  stateLabel: string;
  stateTone: OperationalPlaybookPresentationTone;
  currentSituation: string;
  progressLabel: string;
  progressPercent: number;
  completedCount: number;
  skippedCount: number;
  totalSteps: number;
  currentStep: OperationalPlaybookStepPresentation | null;
  requiredData: OperationalPlaybookInputPresentation[];
  recommendedAction: string;
  blockedReason?: string;
  commandProposals: Array<{
    id: string;
    title: string;
    statusLabel: string;
    typeLabel: string;
    tone: OperationalPlaybookPresentationTone;
    confirmed: boolean;
  }>;
  timeline: Array<{
    id: string;
    summary: string;
    occurredAt: string;
    stateLabel: string;
  }>;
  sourceTruth: SourceTruthRef[];
  primaryAction: OperationalPlaybookRunnerActionModel | null;
  secondaryActions: OperationalPlaybookRunnerActionModel[];
  accessibilitySummary: string;
  safetyCopy: string;
}

export function buildOperationalPlaybookRunnerModel(input: {
  definition: OperationalPlaybookDefinition;
  instance: OperationalPlaybookInstance;
  readiness: OperationalPlaybookReadiness;
  now?: string | number | Date;
}): OperationalPlaybookRunnerModel {
  const { definition, instance, readiness } = input;
  const requiredKeys = new Set(definition.requiredInputs.map((requirement) => requirement.key));
  const requirements = [...definition.requiredInputs, ...definition.optionalInputs];
  const requiredData = requirements.map<OperationalPlaybookInputPresentation>((requirement) => {
    const value = instance.inputSnapshot[requirement.key];
    const state = value
      ? resolveOperationalPlaybookInputState(value, requirement, input.now ?? Date.now())
      : requiredKeys.has(requirement.key) ? 'missing' : 'unavailable';
    return {
      key: requirement.key,
      label: requirement.label,
      description: requirement.description,
      required: requiredKeys.has(requirement.key),
      state,
      stateLabel: formatInputState(state),
      tone: inputStateTone(state),
      sourceTruth: value?.sourceTruth ?? [],
    };
  });
  const currentStepDefinition = definition.steps.find((step) => step.id === instance.currentStepId) ?? null;
  const currentStep = currentStepDefinition
    ? buildStepPresentation(definition, currentStepDefinition, requiredData)
    : null;
  const completedCount = instance.completedStepIds.length;
  const skippedCount = instance.skippedSteps.length;
  const completedOrSkipped = new Set([
    ...instance.completedStepIds,
    ...instance.skippedSteps.map((step) => step.stepId),
  ]).size;
  const totalSteps = definition.steps.length;
  const progressPercent = totalSteps > 0
    ? Math.max(0, Math.min(100, Math.round((completedOrSkipped / totalSteps) * 100)))
    : 0;
  const stateLabel = formatPlaybookState(instance.state);
  const primaryAction = selectPrimaryAction(instance, readiness, currentStepDefinition);
  const secondaryActions = selectSecondaryActions(instance);
  const commandProposals = instance.commandProposals
    .filter((proposal) => proposal.status !== 'cancelled')
    .slice(-8)
    .reverse()
    .map(presentProposal);
  const timeline = [...instance.eventHistory]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 30)
    .map((event) => ({
      id: event.id,
      summary: event.summary,
      occurredAt: event.occurredAt,
      stateLabel: formatPlaybookState(event.state),
    }));
  const currentSituation = selectCurrentSituation(instance, readiness, currentStepDefinition);
  const recommendedAction = primaryAction?.disabled
    ? primaryAction.disabledReason ?? 'Resolve the visible blocker before continuing.'
    : primaryAction?.label ?? terminalRecommendation(instance.state);

  return {
    title: definition.title,
    description: definition.description,
    state: instance.state,
    stateLabel,
    stateTone: playbookStateTone(instance.state),
    currentSituation,
    progressLabel: `${completedCount} completed, ${skippedCount} skipped, ${totalSteps} total`,
    progressPercent,
    completedCount,
    skippedCount,
    totalSteps,
    currentStep,
    requiredData,
    recommendedAction,
    blockedReason: instance.blockedStep?.reason,
    commandProposals,
    timeline,
    sourceTruth: instance.sourceTruth,
    primaryAction,
    secondaryActions,
    accessibilitySummary: [
      `${definition.title} Operational Playbook`,
      `${stateLabel} state`,
      `${progressPercent} percent complete`,
      currentStep ? `Current step: ${currentStep.title}` : 'No active step',
      currentSituation,
    ].join('. '),
    safetyCopy: OPERATIONAL_PLAYBOOK_SAFETY_COPY,
  };
}

export function formatPlaybookState(state: OperationalPlaybookState): string {
  return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, ' ');
}

function buildStepPresentation(
  definition: OperationalPlaybookDefinition,
  step: OperationalPlaybookStepDefinition,
  inputModels: OperationalPlaybookInputPresentation[],
): OperationalPlaybookStepPresentation {
  const byKey = new Map(inputModels.map((model) => [model.key, model]));
  return {
    id: step.id,
    type: step.type,
    title: step.title,
    instructions: step.instructions,
    position: Math.max(1, definition.steps.findIndex((candidate) => candidate.id === step.id) + 1),
    total: definition.steps.length,
    skippable: step.skippable,
    requiredInputs: step.requiredInputKeys.map((key) => byKey.get(key)).filter(isDefined),
  };
}

function selectPrimaryAction(
  instance: OperationalPlaybookInstance,
  readiness: OperationalPlaybookReadiness,
  step: OperationalPlaybookStepDefinition | null,
): OperationalPlaybookRunnerActionModel | null {
  if (instance.state === 'draft') {
    return {
      intent: { kind: 'transition', next: 'ready' },
      label: 'Mark Ready',
      icon: 'checkmark-circle-outline',
      disabled: !readiness.ready,
      disabledReason: !readiness.ready ? readinessReason(readiness) : undefined,
    };
  }
  if (instance.state === 'ready') {
    return {
      intent: { kind: 'transition', next: 'active' },
      label: 'Start Playbook',
      icon: 'play-outline',
      disabled: !readiness.ready,
      disabledReason: !readiness.ready ? readinessReason(readiness) : undefined,
    };
  }
  if (instance.state === 'paused' || instance.state === 'blocked') {
    return {
      intent: { kind: 'transition', next: 'active' },
      label: instance.state === 'blocked' ? 'Resume After Review' : 'Resume Playbook',
      icon: 'play-outline',
      disabled: !readiness.ready,
      disabledReason: !readiness.ready ? readinessReason(readiness) : undefined,
    };
  }
  if (instance.state !== 'active' || !step) return null;
  const proposal = step.type === 'create_command_proposal'
    ? instance.commandProposals.find((candidate) => candidate.stepId === step.id && candidate.status === 'proposed')
    : null;
  if (proposal) {
    return {
      intent: { kind: 'review_command_proposal', proposalId: proposal.id },
      label: 'Review Command Proposal',
      icon: 'document-text-outline',
      disabled: false,
    };
  }
  return {
    intent: { kind: 'continue_step', stepId: step.id },
    label: actionLabelForStep(step),
    icon: 'arrow-forward-outline',
    disabled: false,
  };
}

function selectSecondaryActions(instance: OperationalPlaybookInstance): OperationalPlaybookRunnerActionModel[] {
  if (instance.state === 'completed' || instance.state === 'cancelled') return [];
  const actions: OperationalPlaybookRunnerActionModel[] = [];
  if (instance.state === 'active') {
    actions.push({ intent: { kind: 'pause' }, label: 'Pause', icon: 'pause-outline', disabled: false });
  }
  actions.push({ intent: { kind: 'cancel' }, label: 'Stop Playbook', icon: 'close-circle-outline', disabled: false });
  return actions;
}

function selectCurrentSituation(
  instance: OperationalPlaybookInstance,
  readiness: OperationalPlaybookReadiness,
  step: OperationalPlaybookStepDefinition | null,
): string {
  if (instance.state === 'blocked') return instance.blockedStep?.reason ?? 'The current step is blocked.';
  if (!readiness.ready && (instance.state === 'draft' || instance.state === 'ready')) return readinessReason(readiness);
  if (instance.state === 'completed') return 'All deterministic completion rules are satisfied.';
  if (instance.state === 'cancelled') return instance.cancellationReason ?? 'The playbook was stopped.';
  if (instance.state === 'paused') return 'Execution is paused. Recorded inputs and progress remain available offline.';
  if (step) return `${step.title} is the next guided coordination step.`;
  return 'No executable step is currently available.';
}

function readinessReason(readiness: OperationalPlaybookReadiness): string {
  if (readiness.deniedPermissions.length > 0) return 'Required permission is unavailable.';
  if (readiness.restrictedInputKeys.length > 0) return 'Required context is restricted.';
  if (readiness.missingInputKeys.length > 0) return 'Required data is missing.';
  if (readiness.staleInputKeys.length > 0) return 'Required data is stale and must be reviewed.';
  if (readiness.unavailableInputKeys.length > 0) return 'Required data is unavailable or conflicting.';
  if (readiness.missingCapabilities.length > 0) return 'A required capability is unavailable.';
  return 'The playbook is ready.';
}

function terminalRecommendation(state: OperationalPlaybookState): string {
  if (state === 'completed') return 'Review the recorded decision and timeline.';
  if (state === 'cancelled') return 'Review the stop reason and retained timeline.';
  return 'Review the current situation before continuing.';
}

function actionLabelForStep(step: OperationalPlaybookStepDefinition): string {
  const labels: Record<OperationalPlaybookStepDefinition['type'], string> = {
    review_context: 'Review Context',
    request_input: 'Record Required Data',
    create_command_proposal: 'Prepare Command Proposal',
    assign_role: 'Assign Role',
    request_acknowledgment: 'Request Acknowledgment',
    open_context: 'Open Linked Context',
    start_deadline: 'Set Deadline',
    record_decision: 'Record Decision',
    confirm_action: 'Review Confirmation',
    resolve: 'Review Resolution',
  };
  return labels[step.type];
}

function presentProposal(proposal: OperationalPlaybookCommandProposal) {
  const statusLabel = proposal.status === 'command_created'
    ? 'Command created'
    : proposal.status === 'confirmed' ? 'Confirmed, not sent' : 'Proposed, confirmation required';
  return {
    id: proposal.id,
    title: proposal.title,
    statusLabel,
    typeLabel: proposal.type.replace(/_/g, ' '),
    tone: proposal.status === 'command_created' ? 'ready' as const : 'warning' as const,
    confirmed: proposal.status === 'confirmed' || proposal.status === 'command_created',
  };
}

function formatInputState(state: OperationalPlaybookInputState): string {
  const labels: Record<OperationalPlaybookInputState, string> = {
    available: 'Available',
    stale: 'Stale',
    missing: 'Missing',
    restricted: 'Restricted',
    unavailable: 'Unavailable',
    conflicting: 'Conflicting',
  };
  return labels[state];
}

function inputStateTone(state: OperationalPlaybookInputState): OperationalPlaybookPresentationTone {
  if (state === 'available') return 'ready';
  if (state === 'stale' || state === 'conflicting') return 'warning';
  return 'unavailable';
}

function playbookStateTone(state: OperationalPlaybookState): OperationalPlaybookPresentationTone {
  if (state === 'completed') return 'ready';
  if (state === 'active') return 'info';
  if (state === 'blocked' || state === 'cancelled') return 'unavailable';
  if (state === 'paused') return 'warning';
  return 'category';
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}
