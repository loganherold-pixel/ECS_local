import {
  createMissionCommandComposerForm,
  MISSION_COMMAND_COMPOSER_TYPES,
  type MissionCommandComposerAcknowledgmentMode,
  type MissionCommandComposerContextOption,
  type MissionCommandComposerForm,
  type MissionCommandComposerMemberOption,
  type MissionCommandComposerTargetKind,
  type MissionCommandComposerType,
} from './dispatchMissionCommandComposer';
import { createDispatchIdempotencyKey } from './dispatchIntegrity';
import type { DispatchLinkedContext, DispatchPriority } from './dispatchTypes';
import {
  clearNavigationFlow,
  loadNavigationFlow,
  stageNavigationFlow,
  type ECSNavigationFlow,
  type ECSNavigationSurface,
} from './ecsNavigationFlow';
import {
  assessSourceTruth,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthAvailability,
  type SourceTruthConfidence,
  type SourceTruthConflictState,
  type SourceTruthFreshness,
  type SourceTruthRef,
} from './sourceTruth';

export const MISSION_COMMAND_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type MissionCommandProposalOriginDomain =
  | 'dashboard'
  | 'ecs_brief'
  | 'fleet'
  | 'navigate'
  | 'explore'
  | 'trip_builder'
  | 'campops'
  | 'weather'
  | 'incident_recovery';

export type MissionCommandProposalIntent =
  | 'create_command'
  | 'request_check_in'
  | 'open_mission_command'
  | 'start_playbook'
  | 'open_incident_room';

export type MissionCommandProposalStatus = 'proposed' | 'confirmed' | 'cancelled';

export interface MissionCommandProposalOrigin {
  domain: MissionCommandProposalOriginDomain;
  sourceEntityType: string;
  sourceEntityId: string;
  label: string;
}

export interface MissionCommandProposalFact {
  key: string;
  label: string;
  value: string;
  sourceTruthId?: string;
}

export interface MissionCommandProposalTarget {
  kind: MissionCommandComposerTargetKind;
  memberId?: string;
  memberIds?: string[];
  roleId?: string;
  vehicleId?: string;
}

export interface MissionCommandProposalDraft {
  type: MissionCommandComposerType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  target?: MissionCommandProposalTarget;
  acknowledgmentMode?: MissionCommandComposerAcknowledgmentMode;
  acknowledgmentRoleId?: string;
  acknowledgmentCount?: number;
  deadlineAt?: string | null;
}

export interface MissionCommandProposalSourceState {
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  confidence: SourceTruthConfidence;
  conflictState: SourceTruthConflictState;
  evaluatedAt: string;
}

export interface MissionCommandProposalDecision {
  actorId: string;
  decidedAt: string;
  reason?: string;
}

export interface MissionCommandProposal {
  schemaVersion: 1;
  id: string;
  fingerprint: string;
  status: MissionCommandProposalStatus;
  origin: MissionCommandProposalOrigin;
  expeditionId: string | null;
  intent: MissionCommandProposalIntent;
  title: string;
  summary: string;
  command: MissionCommandProposalDraft | null;
  playbookId: string | null;
  incidentId: string | null;
  linkedContext: DispatchLinkedContext | null;
  facts: MissionCommandProposalFact[];
  sourceTruth: SourceTruthRef[];
  sourceState: MissionCommandProposalSourceState;
  returnRoute: string;
  offline: boolean;
  createdAt: string;
  decision: MissionCommandProposalDecision | null;
}

export interface BuildMissionCommandProposalInput {
  origin: MissionCommandProposalOrigin;
  expeditionId?: string | null;
  intent: MissionCommandProposalIntent;
  title: string;
  summary: string;
  command?: MissionCommandProposalDraft | null;
  playbookId?: string | null;
  incidentId?: string | null;
  linkedContext?: DispatchLinkedContext | null;
  requireLinkedContext?: boolean;
  facts?: MissionCommandProposalFact[];
  sourceTruth: SourceTruthRef[];
  returnRoute: string;
  offline?: boolean;
  createdAt?: string;
  now?: string | number | Date;
}

export type MissionCommandProposalBuildResult =
  | { ok: true; proposal: MissionCommandProposal }
  | { ok: false; safeCode: string; reason: string };

export interface MissionCommandProposalComposerRequest {
  proposalFingerprint: string;
  returnRoute: string;
  form: MissionCommandComposerForm;
  extraContext: MissionCommandComposerContextOption | null;
  sourceTruth: SourceTruthRef[];
}

export type MissionCommandProposalConfirmedAction =
  | { kind: 'open_composer'; request: MissionCommandProposalComposerRequest }
  | { kind: 'open_board'; returnRoute: string }
  | { kind: 'open_playbook'; playbookId: string; returnRoute: string }
  | { kind: 'open_incident_room'; incidentId: string; returnRoute: string };

export type MissionCommandProposalConfirmationResult =
  | {
      ok: true;
      proposal: MissionCommandProposal;
      action: MissionCommandProposalConfirmedAction;
    }
  | { ok: false; safeCode: string; reason: string };

export type MissionCommandProposalCancellationResult =
  | { ok: true; proposal: MissionCommandProposal }
  | { ok: false; safeCode: string; reason: string };

export type MissionCommandProposalHandoffStageResult =
  | { status: 'staged' | 'deduplicated'; flow: ECSNavigationFlow; proposal: MissionCommandProposal }
  | { status: 'invalid'; safeCode: string; reason: string };

export type MissionCommandProposalHandoffConsumeResult =
  | { status: 'none' }
  | { status: 'consumed'; flow: ECSNavigationFlow; proposal: MissionCommandProposal }
  | { status: 'invalid'; safeCode: string; reason: string };

export interface MissionCommandProposalHandoffDependencies {
  loadFlow: typeof loadNavigationFlow;
  stageFlow: typeof stageNavigationFlow;
  clearFlow: typeof clearNavigationFlow;
  now?: () => string;
}

const PROPOSAL_DOMAINS = new Set<MissionCommandProposalOriginDomain>([
  'dashboard',
  'ecs_brief',
  'fleet',
  'navigate',
  'explore',
  'trip_builder',
  'campops',
  'weather',
  'incident_recovery',
]);

const PROPOSAL_INTENTS = new Set<MissionCommandProposalIntent>([
  'create_command',
  'request_check_in',
  'open_mission_command',
  'start_playbook',
  'open_incident_room',
]);

const PRIORITIES = new Set<DispatchPriority>(['low', 'normal', 'high', 'critical']);
const TARGET_KINDS = new Set<MissionCommandComposerTargetKind>([
  'member',
  'role',
  'selected_members',
  'expedition',
  'vehicle',
  'self',
]);
const ACKNOWLEDGMENT_MODES = new Set<MissionCommandComposerAcknowledgmentMode>([
  'none',
  'any',
  'all',
  'role',
  'count',
]);
const RETURN_ROUTE_PREFIXES = [
  '/alert',
  '/dashboard',
  '/fleet',
  '/navigate',
  '/discover',
  '/explore-trip-builder',
  '/explore-offline-prep-pack',
  '/expedition-command',
  '/expedition-detail',
  '/safety',
];
const SAFE_CONTEXT_METADATA_KEYS = new Set([
  'source',
  'pinId',
  'waypointId',
  'routeId',
  'routeSegmentId',
  'segmentIndex',
  'campId',
  'rallyId',
  'bailoutId',
  'incidentId',
  'dispatchEventId',
  'vehicleId',
  'resourceId',
  'activeRoute',
]);
const PRECISE_COORDINATE_PAIR_PATTERN = /(^|[^\d])(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})(?=$|[^\d])/g;
const PRIVATE_CONTACT_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SENSITIVE_RETURN_QUERY_PATTERN = /[?&](?:token|key|secret|sig|auth|password|lat|lng|latitude|longitude)=/i;
const TOP_LEVEL_PROPOSAL_KEYS = new Set([
  'schemaVersion',
  'id',
  'fingerprint',
  'status',
  'origin',
  'expeditionId',
  'intent',
  'title',
  'summary',
  'command',
  'playbookId',
  'incidentId',
  'linkedContext',
  'facts',
  'sourceTruth',
  'sourceState',
  'returnRoute',
  'offline',
  'createdAt',
  'decision',
]);

export function buildMissionCommandProposal(
  input: BuildMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  const origin = sanitizeOrigin(input.origin);
  if (!origin) return invalidBuild('mission_command_proposal_origin_invalid', 'Mission Command proposal origin is invalid.');
  if (!PROPOSAL_INTENTS.has(input.intent)) {
    return invalidBuild('mission_command_proposal_intent_invalid', 'Mission Command proposal intent is invalid.');
  }

  const title = boundedText(input.title, 120);
  const summary = boundedText(input.summary, 600);
  if (!title || !summary) {
    return invalidBuild('mission_command_proposal_copy_invalid', 'Mission Command proposal title and summary are required.');
  }

  const createdAt = validIso(input.createdAt ?? toIso(input.now) ?? new Date().toISOString());
  const evaluatedAt = validIso(toIso(input.now) ?? createdAt);
  if (!createdAt || !evaluatedAt) {
    return invalidBuild('mission_command_proposal_timestamp_invalid', 'Mission Command proposal timestamp is invalid.');
  }

  const sourceTruth = Array.isArray(input.sourceTruth)
    ? input.sourceTruth.slice(0, 12).map(sanitizeSourceTruthRef)
    : [];
  if (sourceTruth.length === 0) {
    return invalidBuild('mission_command_proposal_source_missing', 'Mission Command proposals require source-truth evidence.');
  }

  const command = input.command == null ? null : sanitizeCommand(input.command);
  if (input.command != null && !command) {
    return invalidBuild('mission_command_proposal_command_invalid', 'Mission Command proposal command draft is invalid.');
  }
  if ((input.intent === 'create_command' || input.intent === 'request_check_in') && !command) {
    return invalidBuild('mission_command_proposal_command_missing', 'This Mission Command proposal requires a command draft.');
  }
  if (input.intent === 'request_check_in' && command?.type !== 'check_in') {
    return invalidBuild('mission_command_proposal_check_in_invalid', 'Check-In proposals require a Check-In command draft.');
  }

  const playbookId = optionalToken(input.playbookId, 120);
  if (input.intent === 'start_playbook' && !playbookId) {
    return invalidBuild('mission_command_proposal_playbook_missing', 'This proposal requires a supported playbook reference.');
  }
  const incidentId = optionalToken(input.incidentId, 180);
  if (input.intent === 'open_incident_room' && !incidentId) {
    return invalidBuild('mission_command_proposal_incident_missing', 'This proposal requires an existing incident reference.');
  }

  const linkedContext = input.linkedContext ? sanitizeLinkedContext(input.linkedContext) : null;
  if (input.linkedContext && !linkedContext) {
    return invalidBuild('mission_command_proposal_context_invalid', 'Mission Command proposal linked context is invalid.');
  }
  if (input.requireLinkedContext && !linkedContext) {
    return invalidBuild('mission_command_proposal_context_missing', 'This proposal requires linked ECS context.');
  }

  const returnRoute = sanitizeReturnRoute(input.returnRoute, origin.domain);
  const facts = sanitizeFacts(input.facts);
  const expeditionId = optionalToken(input.expeditionId, 180);
  const sourceAssessment = assessSourceTruth(sourceTruth, { now: evaluatedAt });
  const sourceState: MissionCommandProposalSourceState = {
    freshness: sourceAssessment.freshness,
    availability: sourceAssessment.availability,
    confidence: sourceAssessment.confidence,
    conflictState: sourceAssessment.conflictState,
    evaluatedAt,
  };

  const fingerprint = createDispatchIdempotencyKey({
    expeditionId: expeditionId ?? 'no-expedition',
    entityType: 'mission_command',
    actionType: `proposal:${origin.domain}:${input.intent}`,
    sourceEntityId: `${origin.sourceEntityType}:${origin.sourceEntityId}`,
    linkedContextId: linkedContext?.id ?? null,
    message: `${title}|${summary}`,
    priority: command?.priority ?? null,
    targetMemberIds: command?.target?.memberIds ?? (command?.target?.memberId ? [command.target.memberId] : []),
    metadata: {
      commandType: command?.type ?? null,
      facts: [...facts]
        .sort((left, right) => lexicalCompare(left.key, right.key))
        .map((fact) => [fact.key, fact.value, fact.sourceTruthId ?? null]),
      incidentId,
      playbookId,
      sourceTruth: [...sourceTruth]
        .sort((left, right) => lexicalCompare(left.id, right.id))
        .map((source) => ({
          availability: source.availability ?? null,
          confidence: source.confidence,
          conflictState: source.conflictState ?? null,
          id: source.id,
          observedAt: source.observedAt ?? null,
          origin: source.origin,
          policyKey: source.policyKey ?? null,
        })),
      targetKind: command?.target?.kind ?? null,
    },
  });

  return {
    ok: true,
    proposal: {
      schemaVersion: MISSION_COMMAND_PROPOSAL_SCHEMA_VERSION,
      id: `mission-command-proposal:${fingerprint.slice('dispatch:mission_command:'.length)}`,
      fingerprint,
      status: 'proposed',
      origin,
      expeditionId,
      intent: input.intent,
      title,
      summary,
      command,
      playbookId,
      incidentId,
      linkedContext,
      facts,
      sourceTruth,
      sourceState,
      returnRoute,
      offline: Boolean(input.offline),
      createdAt,
      decision: null,
    },
  };
}

export function confirmMissionCommandProposal(
  proposal: MissionCommandProposal,
  input: {
    actorId: string;
    soloMode: boolean;
    members?: MissionCommandComposerMemberOption[];
    now?: string;
  },
): MissionCommandProposalConfirmationResult {
  const parsed = parseMissionCommandProposal(proposal, input.now ?? proposal.sourceState.evaluatedAt);
  if (!parsed.ok) return parsed;
  if (parsed.proposal.status !== 'proposed') {
    return invalidConfirmation('mission_command_proposal_not_proposed', 'Only an unhandled proposal can be confirmed.');
  }
  const actorId = requiredToken(input.actorId, 180);
  const decidedAt = validIso(input.now ?? new Date().toISOString());
  if (!actorId || !decidedAt) {
    return invalidConfirmation('mission_command_proposal_confirmation_invalid', 'Proposal confirmation actor and timestamp are required.');
  }
  const confirmed: MissionCommandProposal = {
    ...parsed.proposal,
    status: 'confirmed',
    decision: { actorId, decidedAt },
  };

  if (confirmed.intent === 'open_mission_command') {
    return { ok: true, proposal: confirmed, action: { kind: 'open_board', returnRoute: confirmed.returnRoute } };
  }
  if (confirmed.intent === 'start_playbook' && confirmed.playbookId) {
    return {
      ok: true,
      proposal: confirmed,
      action: { kind: 'open_playbook', playbookId: confirmed.playbookId, returnRoute: confirmed.returnRoute },
    };
  }
  if (confirmed.intent === 'open_incident_room' && confirmed.incidentId) {
    return {
      ok: true,
      proposal: confirmed,
      action: { kind: 'open_incident_room', incidentId: confirmed.incidentId, returnRoute: confirmed.returnRoute },
    };
  }
  if (!confirmed.command) {
    return invalidConfirmation('mission_command_proposal_command_missing', 'Proposal command draft is unavailable.');
  }

  const base = createMissionCommandComposerForm({
    actorId,
    soloMode: input.soloMode,
    members: input.members,
    seedType: confirmed.command.type,
    draftId: `mission-command-proposal:${confirmed.fingerprint}`,
  });
  const extraContext = confirmed.linkedContext
    ? {
        id: `mission-command-proposal-context:${confirmed.fingerprint}`,
        label: confirmed.linkedContext.title,
        context: confirmed.linkedContext,
      }
    : null;
  const form = applyProposalDraftToComposer(base, confirmed.command, extraContext, input.soloMode);

  return {
    ok: true,
    proposal: confirmed,
    action: {
      kind: 'open_composer',
      request: {
        proposalFingerprint: confirmed.fingerprint,
        returnRoute: confirmed.returnRoute,
        form,
        extraContext,
        sourceTruth: confirmed.sourceTruth.map(sanitizeSourceTruthRef),
      },
    },
  };
}

export function cancelMissionCommandProposal(
  proposal: MissionCommandProposal,
  actorId: string,
  now = new Date().toISOString(),
): MissionCommandProposalCancellationResult {
  const parsed = parseMissionCommandProposal(proposal, now);
  if (!parsed.ok) return parsed;
  if (parsed.proposal.status !== 'proposed') {
    return { ok: false, safeCode: 'mission_command_proposal_not_proposed', reason: 'Only an unhandled proposal can be cancelled.' };
  }
  const safeActorId = requiredToken(actorId, 180);
  const decidedAt = validIso(now);
  if (!safeActorId || !decidedAt) {
    return { ok: false, safeCode: 'mission_command_proposal_cancellation_invalid', reason: 'Proposal cancellation actor and timestamp are required.' };
  }
  return {
    ok: true,
    proposal: {
      ...parsed.proposal,
      status: 'cancelled',
      decision: { actorId: safeActorId, decidedAt, reason: 'operator_cancelled' },
    },
  };
}

export function parseMissionCommandProposal(
  value: unknown,
  now?: string | number | Date,
): MissionCommandProposalBuildResult {
  if (!isRecord(value) || !hasOnlyKeys(value, TOP_LEVEL_PROPOSAL_KEYS)) {
    return invalidBuild('mission_command_proposal_schema_invalid', 'Mission Command proposal envelope is malformed.');
  }
  if (value.schemaVersion !== MISSION_COMMAND_PROPOSAL_SCHEMA_VERSION) {
    return invalidBuild('mission_command_proposal_schema_invalid', 'Mission Command proposal schema version is unsupported.');
  }
  const status = value.status;
  if (status !== 'proposed' && status !== 'confirmed' && status !== 'cancelled') {
    return invalidBuild('mission_command_proposal_status_invalid', 'Mission Command proposal status is invalid.');
  }
  if (!isRecord(value.origin) || !PROPOSAL_DOMAINS.has(value.origin.domain as MissionCommandProposalOriginDomain)) {
    return invalidBuild('mission_command_proposal_origin_invalid', 'Mission Command proposal origin is invalid.');
  }
  if (!PROPOSAL_INTENTS.has(value.intent as MissionCommandProposalIntent)) {
    return invalidBuild('mission_command_proposal_intent_invalid', 'Mission Command proposal intent is invalid.');
  }
  if (!Array.isArray(value.sourceTruth) || !Array.isArray(value.facts)) {
    return invalidBuild('mission_command_proposal_schema_invalid', 'Mission Command proposal source data is malformed.');
  }

  const rebuilt = buildMissionCommandProposal({
    origin: value.origin as unknown as MissionCommandProposalOrigin,
    expeditionId: typeof value.expeditionId === 'string' ? value.expeditionId : null,
    intent: value.intent as MissionCommandProposalIntent,
    title: typeof value.title === 'string' ? value.title : '',
    summary: typeof value.summary === 'string' ? value.summary : '',
    command: value.command as MissionCommandProposalDraft | null,
    playbookId: typeof value.playbookId === 'string' ? value.playbookId : null,
    incidentId: typeof value.incidentId === 'string' ? value.incidentId : null,
    linkedContext: value.linkedContext as DispatchLinkedContext | null,
    facts: value.facts as MissionCommandProposalFact[],
    sourceTruth: value.sourceTruth as SourceTruthRef[],
    returnRoute: typeof value.returnRoute === 'string' ? value.returnRoute : '',
    offline: value.offline === true,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    now: now ?? (isRecord(value.sourceState) && typeof value.sourceState.evaluatedAt === 'string'
      ? value.sourceState.evaluatedAt
      : undefined),
  });
  if (!rebuilt.ok) return rebuilt;
  if (value.id !== rebuilt.proposal.id || value.fingerprint !== rebuilt.proposal.fingerprint) {
    return invalidBuild('mission_command_proposal_fingerprint_invalid', 'Mission Command proposal identity does not match its content.');
  }

  const decision = sanitizeDecision(value.decision, status);
  if (status !== 'proposed' && !decision) {
    return invalidBuild('mission_command_proposal_decision_invalid', 'Handled Mission Command proposals require a valid decision record.');
  }
  if (status === 'proposed' && value.decision != null) {
    return invalidBuild('mission_command_proposal_decision_invalid', 'Unconfirmed proposals cannot contain a decision record.');
  }

  return {
    ok: true,
    proposal: {
      ...rebuilt.proposal,
      status,
      decision,
    },
  };
}

export function createMissionCommandProposalHandoffAdapter(
  dependencies: MissionCommandProposalHandoffDependencies = {
    loadFlow: loadNavigationFlow,
    stageFlow: stageNavigationFlow,
    clearFlow: clearNavigationFlow,
    now: () => new Date().toISOString(),
  },
) {
  return {
    async stage(proposal: MissionCommandProposal): Promise<MissionCommandProposalHandoffStageResult> {
      try {
        const parsed = parseMissionCommandProposal(proposal, proposal.sourceState.evaluatedAt);
        if (!parsed.ok) return { status: 'invalid', safeCode: parsed.safeCode, reason: parsed.reason };
        if (parsed.proposal.status !== 'proposed') {
          return {
            status: 'invalid',
            safeCode: 'mission_command_proposal_not_proposed',
            reason: 'Only an unhandled proposal can be staged for Dispatch.',
          };
        }
        const current = await dependencies.loadFlow();
        if (current) {
          if (current.target !== 'alert' || current.intent !== 'mission_command_proposal') {
            return {
              status: 'invalid',
              safeCode: 'mission_command_proposal_handoff_busy',
              reason: 'Another ECS navigation handoff is pending. Complete or cancel it before opening Mission Command.',
            };
          }
          const currentProposal = readProposalFromFlow(current, dependencies.now?.());
          if (!currentProposal.ok) {
            return { status: 'invalid', safeCode: currentProposal.safeCode, reason: currentProposal.reason };
          }
          if (currentProposal.proposal.fingerprint === parsed.proposal.fingerprint) {
            return { status: 'deduplicated', flow: current, proposal: currentProposal.proposal };
          }
          return {
            status: 'invalid',
            safeCode: 'mission_command_proposal_handoff_busy',
            reason: 'Another Mission Command proposal is awaiting review.',
          };
        }

        const flow = await dependencies.stageFlow({
          source: proposalOriginSurface(parsed.proposal.origin.domain),
          target: 'alert',
          intent: 'mission_command_proposal',
          label: 'Mission Command Proposal',
          message: parsed.proposal.summary,
          context: { missionCommandProposal: parsed.proposal },
        });
        return { status: 'staged', flow, proposal: parsed.proposal };
      } catch {
        return {
          status: 'invalid',
          safeCode: 'mission_command_proposal_handoff_unavailable',
          reason: 'Mission Command proposal storage is temporarily unavailable.',
        };
      }
    },

    async consume(): Promise<MissionCommandProposalHandoffConsumeResult> {
      try {
        const flow = await dependencies.loadFlow();
        if (!flow || flow.target !== 'alert' || flow.intent !== 'mission_command_proposal') {
          return { status: 'none' };
        }
        const parsed = readProposalFromFlow(flow, dependencies.now?.());
        await dependencies.clearFlow();
        if (!parsed.ok) return { status: 'invalid', safeCode: parsed.safeCode, reason: parsed.reason };
        if (parsed.proposal.status !== 'proposed') {
          return {
            status: 'invalid',
            safeCode: 'mission_command_proposal_not_proposed',
            reason: 'Handled Mission Command proposal handoff was rejected.',
          };
        }
        return { status: 'consumed', flow, proposal: parsed.proposal };
      } catch {
        return {
          status: 'invalid',
          safeCode: 'mission_command_proposal_handoff_unavailable',
          reason: 'Mission Command proposal storage is temporarily unavailable.',
        };
      }
    },
  };
}

export const missionCommandProposalHandoffAdapter = createMissionCommandProposalHandoffAdapter();

function readProposalFromFlow(
  flow: ECSNavigationFlow | null,
  now?: string,
): MissionCommandProposalBuildResult {
  if (!flow || flow.target !== 'alert' || flow.intent !== 'mission_command_proposal') {
    return invalidBuild('mission_command_proposal_handoff_missing', 'Mission Command proposal handoff is unavailable.');
  }
  return parseMissionCommandProposal(flow.context?.missionCommandProposal, now);
}

function applyProposalDraftToComposer(
  base: MissionCommandComposerForm,
  draft: MissionCommandProposalDraft,
  extraContext: MissionCommandComposerContextOption | null,
  soloMode: boolean,
): MissionCommandComposerForm {
  const target = soloMode
    ? { targetKind: 'self' as const }
    : composerTargetPatch(draft.target);
  return {
    ...base,
    ...target,
    priority: draft.priority,
    title: draft.title,
    instructions: draft.instructions,
    acknowledgmentMode: soloMode ? 'none' : draft.acknowledgmentMode ?? 'none',
    acknowledgmentRoleId: soloMode ? '' : draft.acknowledgmentRoleId ?? '',
    acknowledgmentCount: soloMode ? '1' : String(draft.acknowledgmentCount ?? 1),
    deadlineMode: draft.deadlineAt ? 'absolute' : 'none',
    absoluteDeadlineAt: draft.deadlineAt ?? '',
    linkedContextId: extraContext?.id ?? '',
  };
}

function composerTargetPatch(target?: MissionCommandProposalTarget): Partial<MissionCommandComposerForm> {
  if (!target) return {};
  switch (target.kind) {
    case 'member':
      return { targetKind: 'member', targetMemberId: target.memberId ?? '' };
    case 'selected_members':
      return { targetKind: 'selected_members', selectedMemberIds: target.memberIds ?? [] };
    case 'role':
      return { targetKind: 'role', targetRoleId: target.roleId ?? '' };
    case 'vehicle':
      return { targetKind: 'vehicle', targetVehicleId: target.vehicleId ?? '' };
    case 'self':
      return { targetKind: 'self' };
    case 'expedition':
    default:
      return { targetKind: 'expedition' };
  }
}

function sanitizeCommand(input: MissionCommandProposalDraft): MissionCommandProposalDraft | null {
  if (!MISSION_COMMAND_COMPOSER_TYPES.includes(input.type) || !PRIORITIES.has(input.priority)) return null;
  const title = boundedText(input.title, 120);
  const instructions = boundedText(input.instructions, 1200);
  if (!title || !instructions) return null;
  const target = sanitizeTarget(input.target);
  if (input.target && !target) return null;
  const acknowledgmentMode = input.acknowledgmentMode ?? 'none';
  if (!ACKNOWLEDGMENT_MODES.has(acknowledgmentMode)) return null;
  const acknowledgmentCount = input.acknowledgmentCount == null
    ? undefined
    : Math.max(1, Math.min(99, Math.floor(input.acknowledgmentCount)));
  const deadlineAt = input.deadlineAt == null ? null : validIso(input.deadlineAt);
  if (input.deadlineAt != null && !deadlineAt) return null;
  return {
    type: input.type,
    priority: input.priority,
    title,
    instructions,
    target: target ?? undefined,
    acknowledgmentMode,
    acknowledgmentRoleId: optionalToken(input.acknowledgmentRoleId, 120) ?? undefined,
    acknowledgmentCount,
    deadlineAt,
  };
}

function sanitizeTarget(input: MissionCommandProposalTarget | undefined): MissionCommandProposalTarget | null {
  if (!input) return null;
  if (!TARGET_KINDS.has(input.kind)) return null;
  const target: MissionCommandProposalTarget = { kind: input.kind };
  const memberId = optionalToken(input.memberId, 180);
  const roleId = optionalToken(input.roleId, 180);
  const vehicleId = optionalToken(input.vehicleId, 180);
  const memberIds = Array.isArray(input.memberIds)
    ? Array.from(new Set(input.memberIds.map((item) => optionalToken(item, 180)).filter(Boolean) as string[])).slice(0, 100)
    : [];
  if (memberId) target.memberId = memberId;
  if (roleId) target.roleId = roleId;
  if (vehicleId) target.vehicleId = vehicleId;
  if (memberIds.length) target.memberIds = memberIds;
  if (input.kind === 'member' && !memberId) return null;
  if (input.kind === 'selected_members' && memberIds.length === 0) return null;
  if (input.kind === 'role' && !roleId) return null;
  if (input.kind === 'vehicle' && !vehicleId) return null;
  return target;
}

function sanitizeOrigin(input: MissionCommandProposalOrigin): MissionCommandProposalOrigin | null {
  if (!input || !PROPOSAL_DOMAINS.has(input.domain)) return null;
  const sourceEntityType = requiredToken(input.sourceEntityType, 120);
  const sourceEntityId = requiredToken(input.sourceEntityId, 180);
  const label = boundedText(input.label, 120);
  if (!sourceEntityType || !sourceEntityId || !label) return null;
  return { domain: input.domain, sourceEntityType, sourceEntityId, label };
}

function sanitizeLinkedContext(input: DispatchLinkedContext): DispatchLinkedContext | null {
  const id = requiredToken(input.id, 180);
  const title = boundedText(input.title, 160);
  if (!id || !title || typeof input.type !== 'string') return null;
  const restricted = Boolean(input.restricted || readBoolean(input.metadata?.restricted));
  const coordinates = restricted ? undefined : sanitizeCoordinates(input.coordinates);
  if (input.coordinates && !restricted && !coordinates) return null;
  const metadata = sanitizeContextMetadata(input.metadata, restricted);
  return {
    id,
    type: input.type,
    title,
    ...(boundedText(input.subtitle, 240) ? { subtitle: boundedText(input.subtitle, 240)! } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(Number.isFinite(input.accuracyMeters) && !restricted
      ? { accuracyMeters: Math.max(0, Number(input.accuracyMeters)) }
      : {}),
    ...(optionalToken(input.routeSegmentId, 180) ? { routeSegmentId: optionalToken(input.routeSegmentId, 180)! } : {}),
    ...(input.sourceTruth ? { sourceTruth: sanitizeSourceTruthRef(input.sourceTruth) } : {}),
    ...(input.sourceTruthPolicyKey ? { sourceTruthPolicyKey: input.sourceTruthPolicyKey } : {}),
    ...(validIso(input.observedAt) ? { observedAt: validIso(input.observedAt)! } : {}),
    ...(input.stale ? { stale: true } : {}),
    ...(restricted ? { restricted: true } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

function sanitizeContextMetadata(
  input: Record<string, unknown> | undefined,
  restricted: boolean,
): Record<string, unknown> {
  if (!input) return {};
  const output: Record<string, unknown> = {};
  Object.keys(input).sort().forEach((key) => {
    if (!SAFE_CONTEXT_METADATA_KEYS.has(key)) return;
    if (restricted && (key === 'pinId' || key === 'waypointId')) return;
    const value = input[key];
    if (typeof value === 'boolean') {
      output[key] = value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
      return;
    }
    if (typeof value === 'string') {
      const safe = boundedText(value, 180);
      if (safe) output[key] = safe;
    }
  });
  return output;
}

function sanitizeFacts(input: MissionCommandProposalFact[] | undefined): MissionCommandProposalFact[] {
  if (!Array.isArray(input)) return [];
  const byKey = new Map<string, MissionCommandProposalFact>();
  input.slice(0, 12).forEach((fact) => {
    if (!fact || typeof fact !== 'object') return;
    const key = requiredToken(fact.key, 80);
    const label = boundedText(fact.label, 100);
    const value = boundedText(fact.value, 240);
    if (!key || !label || !value) return;
    byKey.set(key, {
      key,
      label,
      value,
      ...(optionalToken(fact.sourceTruthId, 180) ? { sourceTruthId: optionalToken(fact.sourceTruthId, 180)! } : {}),
    });
  });
  return Array.from(byKey.values()).slice(0, 8);
}

function sanitizeDecision(value: unknown, status: MissionCommandProposalStatus): MissionCommandProposalDecision | null {
  if (status === 'proposed') return null;
  if (!isRecord(value)) return null;
  const actorId = requiredToken(value.actorId, 180);
  const decidedAt = typeof value.decidedAt === 'string' ? validIso(value.decidedAt) : null;
  if (!actorId || !decidedAt) return null;
  const reason = typeof value.reason === 'string' ? optionalToken(value.reason, 120) : null;
  return { actorId, decidedAt, ...(reason ? { reason } : {}) };
}

function sanitizeReturnRoute(route: string, domain: MissionCommandProposalOriginDomain): string {
  const trimmed = typeof route === 'string' ? route.trim() : '';
  if (
    trimmed.length <= 320 &&
    !/[\u0000-\u001f\u007f]/.test(trimmed) &&
    !SENSITIVE_RETURN_QUERY_PATTERN.test(trimmed) &&
    RETURN_ROUTE_PREFIXES.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}?`))
  ) {
    return trimmed;
  }
  return defaultReturnRoute(domain);
}

function defaultReturnRoute(domain: MissionCommandProposalOriginDomain): string {
  if (domain === 'fleet') return '/fleet';
  if (domain === 'navigate') return '/navigate';
  if (domain === 'explore') return '/discover';
  if (domain === 'trip_builder') return '/explore-trip-builder';
  if (domain === 'incident_recovery') return '/safety';
  return '/dashboard';
}

function proposalOriginSurface(domain: MissionCommandProposalOriginDomain): ECSNavigationSurface {
  if (domain === 'fleet') return 'fleet';
  if (domain === 'navigate') return 'navigate';
  if (domain === 'explore' || domain === 'trip_builder') return 'explore';
  if (domain === 'incident_recovery') return 'alert';
  return 'dashboard';
}

function sanitizeCoordinates(value: DispatchLinkedContext['coordinates']) {
  if (!value) return undefined;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const safe = sanitizeSourceTruthDisplayText(value, maxLength);
  if (!safe) return null;
  return safe
    .replace(PRECISE_COORDINATE_PAIR_PATTERN, '$1[redacted precise coordinates]')
    .replace(PRIVATE_CONTACT_PATTERN, '[redacted contact]')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function requiredToken(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function optionalToken(value: unknown, maxLength: number): string | null {
  if (value == null || value === '') return null;
  return requiredToken(value, maxLength);
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toIso(value: string | number | Date | undefined): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function lexicalCompare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function invalidBuild(safeCode: string, reason: string): MissionCommandProposalBuildResult {
  return { ok: false, safeCode, reason };
}

function invalidConfirmation(safeCode: string, reason: string): MissionCommandProposalConfirmationResult {
  return { ok: false, safeCode, reason };
}
