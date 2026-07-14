import type { SourceTruthRef } from '../sourceTruth';
import {
  buildCompletionKey,
  canonicalJourneyEntityId,
  stableLifecycleHash,
} from '../lifecycle/routeTripExpeditionLifecycle';

export const EXPEDITION_LIFECYCLE_SCHEMA_VERSION = 1;
export const EXPEDITION_PLAN_SCHEMA_VERSION = 1;
export const EXPEDITION_DEBRIEF_SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_EXPEDITION_TRANSITIONS = 80;
export const MAX_EXPEDITION_PROPOSALS = 24;
export const MAX_EXPEDITION_CORRECTIONS = 24;
export const MAX_EXPEDITION_PLAN_REFERENCES = 100;
export const MAX_EXPEDITION_DEBRIEF_ROUTES = 20;
export const MAX_EXPEDITION_DEBRIEF_WAYPOINTS = 100;
export const EXPEDITION_LIFECYCLE_META_KEY = 'ecs_expedition_lifecycle';

export type CanonicalExpeditionState =
  | 'draft'
  | 'planned'
  | 'ready'
  | 'active'
  | 'paused'
  | 'completing'
  | 'completed'
  | 'archived'
  | 'cancelled'
  | 'recovery-required';

export type ExpeditionTransitionCause =
  | 'wizard'
  | 'operator'
  | 'navigate'
  | 'dispatch'
  | 'geofence'
  | 'offline_restore'
  | 'guidance'
  | 'recovery'
  | 'archive'
  | 'migration'
  | 'system';

export type ExpeditionTransitionActor = 'operator' | 'system' | 'geofence' | 'restore';
export type ExpeditionTransitionMode = 'normal' | 'correction';

export interface CanonicalExpeditionPlan {
  schemaVersion: number;
  id: string;
  expeditionId: string;
  title: string;
  activeVehicleId: string | null;
  routeAssetId: string | null;
  tripPlanId: string | null;
  offlinePackageId: string | null;
  campIds: string[];
  waypointIds: string[];
  bailoutIds: string[];
  createdAt: string;
  updatedAt: string;
  sourceTruth: SourceTruthRef;
}

export interface CanonicalExpeditionPlanInput {
  expeditionId: string;
  title?: string | null;
  activeVehicleId?: string | null;
  routeAssetId?: string | null;
  tripPlanId?: string | null;
  offlinePackageId?: string | null;
  campIds?: readonly string[] | null;
  waypointIds?: readonly string[] | null;
  bailoutIds?: readonly string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sourceTruth?: SourceTruthRef | null;
}

export interface ExpeditionTransitionEntry {
  id: string;
  idempotencyKey: string;
  from: CanonicalExpeditionState | null;
  to: CanonicalExpeditionState;
  cause: ExpeditionTransitionCause;
  actor: ExpeditionTransitionActor;
  mode: ExpeditionTransitionMode;
  reason: string | null;
  occurredAt: string;
  revision: number;
}

export interface ExpeditionCorrectionEntry {
  id: string;
  transitionId: string;
  from: CanonicalExpeditionState;
  to: CanonicalExpeditionState;
  reason: string;
  correctedAt: string;
}

export type ExpeditionTransitionProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface ExpeditionTransitionProposal {
  id: string;
  idempotencyKey: string;
  from: CanonicalExpeditionState;
  to: CanonicalExpeditionState;
  cause: ExpeditionTransitionCause;
  reason: string | null;
  status: ExpeditionTransitionProposalStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ExpeditionDebriefRouteSnapshot {
  id: string;
  name: string;
  source: string | null;
  distanceMiles: number | null;
  etaHours: number | null;
}

export interface ExpeditionDebriefWaypointSnapshot {
  id: string;
  title: string | null;
  kind: string;
  occurredAt: string | null;
}

export interface CanonicalExpeditionDebriefSnapshot {
  schemaVersion: number;
  expeditionId: string;
  capturedAt: string;
  plan: CanonicalExpeditionPlan;
  summary: Record<string, unknown> | null;
  routes: ExpeditionDebriefRouteSnapshot[];
  waypoints: ExpeditionDebriefWaypointSnapshot[];
  sourceTruth: SourceTruthRef[];
  privacy: {
    exactCoordinatesIncluded: false;
    restrictedFieldsRedacted: true;
  };
}

export type ExpeditionCompletionTransactionStatus = 'pending' | 'committed' | 'reverted' | 'failed';

export interface ExpeditionCompletionTransaction {
  id: string;
  idempotencyKey: string;
  completionKey: string;
  status: ExpeditionCompletionTransactionStatus;
  requestedAt: string;
  undoUntil: string;
  completedAt: string;
  committedAt: string | null;
  revertedAt: string | null;
  fieldLogId: string;
  outcomeId: string | null;
  failureReason: string | null;
  snapshot: CanonicalExpeditionDebriefSnapshot;
}

export interface CanonicalExpeditionLifecycle {
  schemaVersion: number;
  expeditionId: string;
  state: CanonicalExpeditionState;
  revision: number;
  plan: CanonicalExpeditionPlan;
  transitions: ExpeditionTransitionEntry[];
  proposals: ExpeditionTransitionProposal[];
  corrections: ExpeditionCorrectionEntry[];
  completion: ExpeditionCompletionTransaction | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpeditionTransitionDecision {
  accepted: boolean;
  idempotent: boolean;
  from: CanonicalExpeditionState;
  to: CanonicalExpeditionState;
  reason:
    | 'accepted'
    | 'already_applied'
    | 'invalid_transition'
    | 'idempotency_conflict'
    | 'missing_vehicle'
    | 'missing_route';
}

export interface ExpeditionTransitionResult {
  decision: ExpeditionTransitionDecision;
  lifecycle: CanonicalExpeditionLifecycle;
  transition: ExpeditionTransitionEntry | null;
}

export interface ExpeditionTransitionInput {
  idempotencyKey: string;
  cause: ExpeditionTransitionCause;
  actor?: ExpeditionTransitionActor;
  mode?: ExpeditionTransitionMode;
  reason?: string | null;
  occurredAt?: string | null;
  allowDegradedPlanning?: boolean;
}

export interface ExpeditionPlanValidation {
  ready: boolean;
  blockers: Array<'missing_vehicle' | 'missing_route'>;
}

const STATES = new Set<CanonicalExpeditionState>([
  'draft',
  'planned',
  'ready',
  'active',
  'paused',
  'completing',
  'completed',
  'archived',
  'cancelled',
  'recovery-required',
]);

const ALLOWED_TRANSITIONS: Record<CanonicalExpeditionState, readonly CanonicalExpeditionState[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['draft', 'ready', 'cancelled'],
  ready: ['planned', 'active', 'cancelled'],
  active: ['paused', 'completing', 'recovery-required', 'cancelled'],
  paused: ['active', 'completing', 'recovery-required', 'cancelled'],
  completing: ['completed', 'active', 'recovery-required'],
  completed: ['archived'],
  archived: [],
  cancelled: ['archived'],
  'recovery-required': ['active', 'paused', 'completing', 'cancelled'],
};

function nowISO(): string {
  return new Date().toISOString();
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeTimestamp(value: unknown, fallback: string): string {
  const text = safeString(value);
  if (!text) return fallback;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function safeStringList(value: unknown, limit = MAX_EXPEDITION_PLAN_REFERENCES): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(safeString).filter((item): item is string => !!item))).slice(0, limit);
}

function defaultPlanSource(expeditionId: string, observedAt: string): SourceTruthRef {
  return {
    id: `expedition-plan:${expeditionId}`,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS operator plan',
    authorityKind: 'user',
    provider: null,
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'medium',
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: [],
  };
}

function normalizeSourceTruth(value: unknown, expeditionId: string, observedAt: string): SourceTruthRef {
  const input = value as Partial<SourceTruthRef> | null | undefined;
  if (!input || typeof input !== 'object') return defaultPlanSource(expeditionId, observedAt);
  const origin = input.origin;
  const confidence = input.confidence;
  return {
    id: safeString(input.id) ?? `expedition-plan:${expeditionId}`,
    origin:
      origin === 'live' || origin === 'cached' || origin === 'manual' || origin === 'estimated' ||
      origin === 'inferred' || origin === 'simulated' || origin === 'unavailable'
        ? origin
        : 'manual',
    role: input.role === 'supporting' || input.role === 'last_good' ? input.role : 'primary',
    policyKey: input.policyKey ?? 'manual_user_state',
    authority: safeString(input.authority),
    authorityKind: input.authorityKind ?? 'unknown',
    provider: safeString(input.provider),
    observedAt: safeString(input.observedAt) ?? observedAt,
    fetchedAt: safeString(input.fetchedAt),
    expiresAt: safeString(input.expiresAt),
    confidence:
      confidence === 'high' || confidence === 'medium' || confidence === 'low' || confidence === 'unknown'
        ? confidence
        : 'unknown',
    coverage: input.coverage ?? 'unknown',
    availability: input.availability ?? 'usable',
    conflictState: input.conflictState ?? (input.conflict ? 'present' : 'none'),
    conflict: Boolean(input.conflict),
    warningCodes: safeStringList(input.warningCodes, 20),
  };
}

export function createCanonicalExpeditionPlan(input: CanonicalExpeditionPlanInput): CanonicalExpeditionPlan {
  const expeditionId = safeString(input.expeditionId) ?? 'unknown-expedition';
  const createdAt = safeTimestamp(input.createdAt, nowISO());
  const updatedAt = safeTimestamp(input.updatedAt, createdAt);
  return {
    schemaVersion: EXPEDITION_PLAN_SCHEMA_VERSION,
    id: `expedition-plan:${expeditionId}`,
    expeditionId,
    title: safeString(input.title) ?? 'Expedition plan',
    activeVehicleId: safeString(input.activeVehicleId),
    routeAssetId: safeString(input.routeAssetId),
    tripPlanId: safeString(input.tripPlanId),
    offlinePackageId: safeString(input.offlinePackageId),
    campIds: safeStringList(input.campIds),
    waypointIds: safeStringList(input.waypointIds),
    bailoutIds: safeStringList(input.bailoutIds),
    createdAt,
    updatedAt,
    sourceTruth: normalizeSourceTruth(input.sourceTruth, expeditionId, updatedAt),
  };
}

export function validateCanonicalExpeditionPlan(plan: CanonicalExpeditionPlan): ExpeditionPlanValidation {
  const blockers: ExpeditionPlanValidation['blockers'] = [];
  if (!safeString(plan.activeVehicleId)) blockers.push('missing_vehicle');
  if (!safeString(plan.routeAssetId) && !safeString(plan.tripPlanId)) blockers.push('missing_route');
  return { ready: blockers.length === 0, blockers };
}

export function updateCanonicalExpeditionPlan(
  lifecycle: CanonicalExpeditionLifecycle,
  patch: Partial<Omit<CanonicalExpeditionPlanInput, 'expeditionId' | 'createdAt'>>,
  updatedAt = nowISO(),
): CanonicalExpeditionLifecycle {
  const plan = createCanonicalExpeditionPlan({
    ...lifecycle.plan,
    ...patch,
    expeditionId: lifecycle.expeditionId,
    createdAt: lifecycle.plan.createdAt,
    updatedAt,
  });
  const previousFingerprint = stableLifecycleHash(JSON.stringify(lifecycle.plan));
  const nextFingerprint = stableLifecycleHash(JSON.stringify(plan));
  if (previousFingerprint === nextFingerprint) return lifecycle;
  return {
    ...lifecycle,
    plan,
    revision: lifecycle.revision + 1,
    updatedAt: plan.updatedAt,
  };
}

export function getAllowedExpeditionTransitions(state: CanonicalExpeditionState): readonly CanonicalExpeditionState[] {
  return ALLOWED_TRANSITIONS[state];
}

export function decideExpeditionTransition(
  from: CanonicalExpeditionState,
  to: CanonicalExpeditionState,
  mode: ExpeditionTransitionMode = 'normal',
): ExpeditionTransitionDecision {
  if (from === to) {
    return { accepted: true, idempotent: true, from, to, reason: 'already_applied' };
  }
  const correctionAllowed = mode === 'correction' && (
    (from === 'completed' && to === 'active') ||
    (from === 'cancelled' && to === 'planned')
  );
  const accepted = correctionAllowed || ALLOWED_TRANSITIONS[from].includes(to);
  return {
    accepted,
    idempotent: false,
    from,
    to,
    reason: accepted ? 'accepted' : 'invalid_transition',
  };
}

function transitionId(expeditionId: string, key: string, from: CanonicalExpeditionState | null, to: CanonicalExpeditionState): string {
  return `expedition-transition:${stableLifecycleHash(`${expeditionId}|${key}|${from ?? 'none'}|${to}`)}`;
}

function bounded<T>(items: T[], limit: number): T[] {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

export function createCanonicalExpeditionLifecycle(input: {
  plan: CanonicalExpeditionPlanInput | CanonicalExpeditionPlan;
  initialState?: CanonicalExpeditionState;
  cause?: ExpeditionTransitionCause;
  occurredAt?: string | null;
  allowDegradedPlanning?: boolean;
}): CanonicalExpeditionLifecycle {
  const plan = createCanonicalExpeditionPlan(input.plan);
  const occurredAt = safeTimestamp(input.occurredAt, plan.createdAt);
  const created: CanonicalExpeditionLifecycle = {
    schemaVersion: EXPEDITION_LIFECYCLE_SCHEMA_VERSION,
    expeditionId: plan.expeditionId,
    state: 'draft',
    revision: 0,
    plan,
    transitions: [{
      id: transitionId(plan.expeditionId, `create:${plan.expeditionId}`, null, 'draft'),
      idempotencyKey: `create:${plan.expeditionId}`,
      from: null,
      to: 'draft',
      cause: input.cause ?? 'system',
      actor: input.cause === 'wizard' ? 'operator' : 'system',
      mode: 'normal',
      reason: 'Expedition lifecycle created.',
      occurredAt,
      revision: 0,
    }],
    proposals: [],
    corrections: [],
    completion: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  const initialState = input.initialState ?? 'draft';
  if (initialState === 'draft') return created;
  const initializationPaths: Record<CanonicalExpeditionState, CanonicalExpeditionState[]> = {
    draft: [],
    planned: ['planned'],
    ready: ['planned', 'ready'],
    active: ['planned', 'ready', 'active'],
    paused: ['planned', 'ready', 'active', 'paused'],
    completing: ['planned', 'ready', 'active', 'completing'],
    completed: ['planned', 'ready', 'active', 'completing', 'completed'],
    archived: ['planned', 'ready', 'active', 'completing', 'completed', 'archived'],
    cancelled: ['cancelled'],
    'recovery-required': ['planned', 'ready', 'active', 'recovery-required'],
  };
  let lifecycle = created;
  for (const [index, state] of initializationPaths[initialState].entries()) {
    const result = transitionExpeditionLifecycle(lifecycle, state, {
      idempotencyKey: `initialize:${plan.expeditionId}:${index}:${state}`,
      cause: input.cause ?? 'system',
      actor: input.cause === 'wizard' ? 'operator' : 'system',
      reason: state === initialState ? `Initialized as ${initialState}.` : 'Lifecycle migration staging.',
      occurredAt,
      allowDegradedPlanning: input.allowDegradedPlanning,
    });
    if (!result.decision.accepted) break;
    lifecycle = result.lifecycle;
  }
  return lifecycle;
}

export function transitionExpeditionLifecycle(
  lifecycle: CanonicalExpeditionLifecycle,
  to: CanonicalExpeditionState,
  input: ExpeditionTransitionInput,
): ExpeditionTransitionResult {
  const key = safeString(input.idempotencyKey);
  if (!key) {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to, reason: 'idempotency_conflict' },
      lifecycle,
      transition: null,
    };
  }

  const previous = lifecycle.transitions.find((item) => item.idempotencyKey === key);
  if (previous) {
    const sameTarget = previous.to === to;
    return {
      decision: {
        accepted: sameTarget,
        idempotent: sameTarget,
        from: lifecycle.state,
        to,
        reason: sameTarget ? 'already_applied' : 'idempotency_conflict',
      },
      lifecycle,
      transition: sameTarget ? previous : null,
    };
  }

  const mode = input.mode ?? 'normal';
  const decision = decideExpeditionTransition(lifecycle.state, to, mode);
  if (!decision.accepted) return { decision, lifecycle, transition: null };

  if ((to === 'ready' || to === 'active') && !input.allowDegradedPlanning) {
    const validation = validateCanonicalExpeditionPlan(lifecycle.plan);
    const blocker = validation.blockers[0];
    if (blocker) {
      return {
        decision: { accepted: false, idempotent: false, from: lifecycle.state, to, reason: blocker },
        lifecycle,
        transition: null,
      };
    }
  }

  if (decision.idempotent) return { decision, lifecycle, transition: null };

  const occurredAt = safeTimestamp(input.occurredAt, nowISO());
  const revision = lifecycle.revision + 1;
  const transition: ExpeditionTransitionEntry = {
    id: transitionId(lifecycle.expeditionId, key, lifecycle.state, to),
    idempotencyKey: key,
    from: lifecycle.state,
    to,
    cause: input.cause,
    actor: input.actor ?? (input.cause === 'geofence' ? 'geofence' : 'system'),
    mode,
    reason: safeString(input.reason),
    occurredAt,
    revision,
  };
  const correction: ExpeditionCorrectionEntry | null = mode === 'correction'
    ? {
        id: `expedition-correction:${stableLifecycleHash(transition.id)}`,
        transitionId: transition.id,
        from: lifecycle.state,
        to,
        reason: safeString(input.reason) ?? 'Operator correction.',
        correctedAt: occurredAt,
      }
    : null;

  return {
    decision: { ...decision, reason: 'accepted' },
    transition,
    lifecycle: {
      ...lifecycle,
      state: to,
      revision,
      transitions: bounded([...lifecycle.transitions, transition], MAX_EXPEDITION_TRANSITIONS),
      corrections: correction
        ? bounded([...lifecycle.corrections, correction], MAX_EXPEDITION_CORRECTIONS)
        : lifecycle.corrections,
      updatedAt: occurredAt,
    },
  };
}

export function proposeExpeditionTransition(
  lifecycle: CanonicalExpeditionLifecycle,
  to: CanonicalExpeditionState,
  input: Omit<ExpeditionTransitionInput, 'mode'>,
): { lifecycle: CanonicalExpeditionLifecycle; proposal: ExpeditionTransitionProposal; idempotent: boolean } {
  const key = safeString(input.idempotencyKey) ?? `proposal:${lifecycle.expeditionId}:${to}`;
  const existing = lifecycle.proposals.find((item) => item.idempotencyKey === key);
  if (existing) return { lifecycle, proposal: existing, idempotent: true };
  const createdAt = safeTimestamp(input.occurredAt, nowISO());
  const proposal: ExpeditionTransitionProposal = {
    id: `expedition-proposal:${stableLifecycleHash(`${lifecycle.expeditionId}|${key}|${to}`)}`,
    idempotencyKey: key,
    from: lifecycle.state,
    to,
    cause: input.cause,
    reason: safeString(input.reason),
    status: 'pending',
    createdAt,
    resolvedAt: null,
  };
  return {
    proposal,
    idempotent: false,
    lifecycle: {
      ...lifecycle,
      proposals: bounded([...lifecycle.proposals, proposal], MAX_EXPEDITION_PROPOSALS),
      updatedAt: createdAt,
    },
  };
}

export function resolveExpeditionTransitionProposal(
  lifecycle: CanonicalExpeditionLifecycle,
  proposalId: string,
  accepted: boolean,
  input: Omit<ExpeditionTransitionInput, 'idempotencyKey'>,
): ExpeditionTransitionResult {
  const proposal = lifecycle.proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: lifecycle.state, reason: 'invalid_transition' },
      lifecycle,
      transition: null,
    };
  }
  if (proposal.status !== 'pending') {
    return {
      decision: { accepted: proposal.status === 'accepted', idempotent: true, from: lifecycle.state, to: proposal.to, reason: 'already_applied' },
      lifecycle,
      transition: null,
    };
  }
  const resolvedAt = safeTimestamp(input.occurredAt, nowISO());
  const withResolvedProposal: CanonicalExpeditionLifecycle = {
    ...lifecycle,
    proposals: lifecycle.proposals.map((item) => item.id === proposalId
      ? { ...item, status: accepted ? 'accepted' : 'rejected', resolvedAt }
      : item),
    updatedAt: resolvedAt,
  };
  if (!accepted) {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: proposal.to, reason: 'invalid_transition' },
      lifecycle: withResolvedProposal,
      transition: null,
    };
  }
  return transitionExpeditionLifecycle(withResolvedProposal, proposal.to, {
    ...input,
    idempotencyKey: `proposal-accept:${proposal.idempotencyKey}`,
    cause: proposal.cause,
  });
}

export function buildExpeditionCompletionKey(lifecycle: CanonicalExpeditionLifecycle): string {
  return buildCompletionKey({
    expeditionId: canonicalJourneyEntityId('expedition', lifecycle.expeditionId),
    completedOutcomeId: `expedition-revision:${lifecycle.revision}`,
  }) ?? `expedition-outcome:${lifecycle.expeditionId}:${lifecycle.revision}`;
}

export function buildExpeditionCompletionIdempotencyKey(lifecycle: CanonicalExpeditionLifecycle): string {
  if (lifecycle.state === 'completing' && lifecycle.completion?.status === 'pending') {
    return lifecycle.completion.idempotencyKey;
  }
  return `complete:${lifecycle.expeditionId}:${lifecycle.revision}`;
}

export function beginExpeditionCompletionTransaction(
  lifecycle: CanonicalExpeditionLifecycle,
  input: {
    idempotencyKey: string;
    fieldLogId: string;
    snapshot: CanonicalExpeditionDebriefSnapshot;
    requestedAt?: string | null;
    completedAt?: string | null;
    undoWindowMs?: number;
    cause?: ExpeditionTransitionCause;
  },
): ExpeditionTransitionResult {
  const key = safeString(input.idempotencyKey) ?? buildExpeditionCompletionIdempotencyKey(lifecycle);
  const existing = lifecycle.completion;
  if (existing?.idempotencyKey === key && (existing.status === 'pending' || existing.status === 'committed')) {
    return {
      decision: { accepted: true, idempotent: true, from: lifecycle.state, to: lifecycle.state, reason: 'already_applied' },
      lifecycle,
      transition: null,
    };
  }
  const requestedAt = safeTimestamp(input.requestedAt, nowISO());
  const completedAt = safeTimestamp(input.completedAt, requestedAt);
  const undoWindowMs = Math.max(0, Math.min(60_000, Math.round(input.undoWindowMs ?? 5_000)));
  const transitionResult = transitionExpeditionLifecycle(lifecycle, 'completing', {
    idempotencyKey: `${key}:begin`,
    cause: input.cause ?? 'operator',
    actor: 'operator',
    reason: 'Completion requested; durable undo window opened.',
    occurredAt: requestedAt,
    allowDegradedPlanning: true,
  });
  if (!transitionResult.decision.accepted) return transitionResult;
  const completionKey = buildExpeditionCompletionKey(transitionResult.lifecycle);
  const transaction: ExpeditionCompletionTransaction = {
    id: `expedition-completion:${stableLifecycleHash(`${lifecycle.expeditionId}|${key}`)}`,
    idempotencyKey: key,
    completionKey,
    status: 'pending',
    requestedAt,
    undoUntil: new Date(new Date(requestedAt).getTime() + undoWindowMs).toISOString(),
    completedAt,
    committedAt: null,
    revertedAt: null,
    fieldLogId: safeString(input.fieldLogId) ?? `field-log:${stableLifecycleHash(key)}`,
    outcomeId: null,
    failureReason: null,
    snapshot: input.snapshot,
  };
  return {
    ...transitionResult,
    lifecycle: { ...transitionResult.lifecycle, completion: transaction },
  };
}

export function commitExpeditionCompletionTransaction(
  lifecycle: CanonicalExpeditionLifecycle,
  input: { idempotencyKey: string; committedAt?: string | null; outcomeId?: string | null },
): ExpeditionTransitionResult {
  const transaction = lifecycle.completion;
  if (!transaction || transaction.idempotencyKey !== input.idempotencyKey) {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: 'completed', reason: 'idempotency_conflict' },
      lifecycle,
      transition: null,
    };
  }
  if (transaction.status === 'committed' && lifecycle.state === 'completed') {
    const outcomeId = safeString(input.outcomeId) ?? transaction.outcomeId;
    return {
      decision: { accepted: true, idempotent: true, from: 'completed', to: 'completed', reason: 'already_applied' },
      lifecycle: outcomeId === transaction.outcomeId
        ? lifecycle
        : { ...lifecycle, completion: { ...transaction, outcomeId } },
      transition: null,
    };
  }
  if (transaction.status !== 'pending') {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: 'completed', reason: 'invalid_transition' },
      lifecycle,
      transition: null,
    };
  }
  const committedAt = safeTimestamp(input.committedAt, transaction.completedAt);
  const transitionResult = transitionExpeditionLifecycle(lifecycle, 'completed', {
    idempotencyKey: `${transaction.idempotencyKey}:commit`,
    cause: 'system',
    actor: 'system',
    reason: 'Completion undo window expired; outcome committed.',
    occurredAt: committedAt,
    allowDegradedPlanning: true,
  });
  if (!transitionResult.decision.accepted) return transitionResult;
  return {
    ...transitionResult,
    lifecycle: {
      ...transitionResult.lifecycle,
      completion: {
        ...transaction,
        status: 'committed',
        committedAt,
        outcomeId: safeString(input.outcomeId) ?? transaction.outcomeId,
      },
    },
  };
}

export function undoExpeditionCompletionTransaction(
  lifecycle: CanonicalExpeditionLifecycle,
  input: { idempotencyKey: string; revertedAt?: string | null; reason?: string | null },
): ExpeditionTransitionResult {
  const transaction = lifecycle.completion;
  if (!transaction || transaction.idempotencyKey !== input.idempotencyKey) {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: 'active', reason: 'idempotency_conflict' },
      lifecycle,
      transition: null,
    };
  }
  if (transaction.status === 'reverted' && lifecycle.state === 'active') {
    return {
      decision: { accepted: true, idempotent: true, from: 'active', to: 'active', reason: 'already_applied' },
      lifecycle,
      transition: null,
    };
  }
  if (transaction.status !== 'pending') {
    return {
      decision: { accepted: false, idempotent: false, from: lifecycle.state, to: 'active', reason: 'invalid_transition' },
      lifecycle,
      transition: null,
    };
  }
  const revertedAt = safeTimestamp(input.revertedAt, nowISO());
  const transitionResult = transitionExpeditionLifecycle(lifecycle, 'active', {
    idempotencyKey: `${transaction.idempotencyKey}:undo`,
    cause: 'operator',
    actor: 'operator',
    mode: 'correction',
    reason: safeString(input.reason) ?? 'Completion reversed during the undo window.',
    occurredAt: revertedAt,
    allowDegradedPlanning: true,
  });
  if (!transitionResult.decision.accepted) return transitionResult;
  return {
    ...transitionResult,
    lifecycle: {
      ...transitionResult.lifecycle,
      completion: { ...transaction, status: 'reverted', revertedAt },
    },
  };
}

export function canonicalStateFromLegacyExpeditionStatus(value: unknown): CanonicalExpeditionState {
  if (value === 'active') return 'active';
  if (value === 'completed') return 'completed';
  if (value === 'archived') return 'archived';
  if (value === 'cancelled') return 'cancelled';
  return 'draft';
}

export function legacyStatusForCanonicalExpeditionState(
  state: CanonicalExpeditionState,
): 'draft' | 'active' | 'completed' | 'archived' | 'cancelled' {
  if (state === 'active' || state === 'paused' || state === 'completing' || state === 'recovery-required') return 'active';
  if (state === 'completed') return 'completed';
  if (state === 'archived') return 'archived';
  if (state === 'cancelled') return 'cancelled';
  return 'draft';
}

function normalizeTransition(value: unknown): ExpeditionTransitionEntry | null {
  const input = value as Partial<ExpeditionTransitionEntry> | null | undefined;
  if (!input || !STATES.has(input.to as CanonicalExpeditionState)) return null;
  const occurredAt = safeTimestamp(input.occurredAt, nowISO());
  return {
    id: safeString(input.id) ?? `expedition-transition:${stableLifecycleHash(JSON.stringify(input))}`,
    idempotencyKey: safeString(input.idempotencyKey) ?? safeString(input.id) ?? `legacy:${stableLifecycleHash(JSON.stringify(input))}`,
    from: input.from && STATES.has(input.from) ? input.from : null,
    to: input.to as CanonicalExpeditionState,
    cause: input.cause ?? 'migration',
    actor: input.actor ?? 'system',
    mode: input.mode === 'correction' ? 'correction' : 'normal',
    reason: safeString(input.reason),
    occurredAt,
    revision: Number.isFinite(input.revision) ? Math.max(0, Math.round(input.revision as number)) : 0,
  };
}

export function normalizeCanonicalExpeditionLifecycle(
  value: unknown,
  fallback: CanonicalExpeditionPlanInput & { legacyStatus?: unknown },
): CanonicalExpeditionLifecycle {
  const input = value as Partial<CanonicalExpeditionLifecycle> | null | undefined;
  const plan = createCanonicalExpeditionPlan({
    ...fallback,
    ...(input?.plan && typeof input.plan === 'object' ? input.plan : null),
    expeditionId: safeString(input?.expeditionId) ?? fallback.expeditionId,
  });
  const fallbackState = canonicalStateFromLegacyExpeditionStatus(fallback.legacyStatus);
  const state = input?.state && STATES.has(input.state) ? input.state : fallbackState;
  const createdAt = safeTimestamp(input?.createdAt, plan.createdAt);
  const updatedAt = safeTimestamp(input?.updatedAt, plan.updatedAt);
  const transitions = Array.isArray(input?.transitions)
    ? input.transitions.map(normalizeTransition).filter((item): item is ExpeditionTransitionEntry => !!item)
    : [];
  const normalized = createCanonicalExpeditionLifecycle({
    plan,
    initialState: state,
    cause: 'migration',
    occurredAt: createdAt,
    allowDegradedPlanning: true,
  });
  return {
    ...normalized,
    schemaVersion: EXPEDITION_LIFECYCLE_SCHEMA_VERSION,
    state,
    revision: Number.isFinite(input?.revision)
      ? Math.max(0, Math.round(input?.revision as number))
      : Math.max(0, ...transitions.map((item) => item.revision)),
    transitions: bounded(transitions.length > 0 ? transitions : normalized.transitions, MAX_EXPEDITION_TRANSITIONS),
    proposals: Array.isArray(input?.proposals)
      ? (input.proposals as ExpeditionTransitionProposal[]).slice(-MAX_EXPEDITION_PROPOSALS)
      : [],
    corrections: Array.isArray(input?.corrections)
      ? (input.corrections as ExpeditionCorrectionEntry[]).slice(-MAX_EXPEDITION_CORRECTIONS)
      : [],
    completion: input?.completion && typeof input.completion === 'object'
      ? input.completion as ExpeditionCompletionTransaction
      : null,
    createdAt,
    updatedAt,
  };
}

export function readCanonicalExpeditionLifecycle(
  meta: unknown,
  fallback: CanonicalExpeditionPlanInput & { legacyStatus?: unknown },
): CanonicalExpeditionLifecycle {
  const input = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)[EXPEDITION_LIFECYCLE_META_KEY]
    : null;
  return normalizeCanonicalExpeditionLifecycle(input, fallback);
}

export function writeCanonicalExpeditionLifecycle(
  meta: unknown,
  lifecycle: CanonicalExpeditionLifecycle,
): Record<string, unknown> {
  const base = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {};
  return { ...base, [EXPEDITION_LIFECYCLE_META_KEY]: lifecycle };
}

export function buildCanonicalExpeditionDebriefSnapshot(input: {
  lifecycle: CanonicalExpeditionLifecycle;
  capturedAt?: string | null;
  summary?: Record<string, unknown> | null;
  routes?: readonly ExpeditionDebriefRouteSnapshot[] | null;
  waypoints?: readonly ExpeditionDebriefWaypointSnapshot[] | null;
  sourceTruth?: readonly SourceTruthRef[] | null;
}): CanonicalExpeditionDebriefSnapshot {
  const capturedAt = safeTimestamp(input.capturedAt, nowISO());
  return {
    schemaVersion: EXPEDITION_DEBRIEF_SNAPSHOT_SCHEMA_VERSION,
    expeditionId: input.lifecycle.expeditionId,
    capturedAt,
    plan: input.lifecycle.plan,
    summary: input.summary ? { ...input.summary } : null,
    routes: Array.isArray(input.routes) ? input.routes.slice(0, MAX_EXPEDITION_DEBRIEF_ROUTES) : [],
    waypoints: Array.isArray(input.waypoints) ? input.waypoints.slice(0, MAX_EXPEDITION_DEBRIEF_WAYPOINTS) : [],
    sourceTruth: Array.isArray(input.sourceTruth)
      ? input.sourceTruth.slice(0, 20).map((source) => normalizeSourceTruth(source, input.lifecycle.expeditionId, capturedAt))
      : [input.lifecycle.plan.sourceTruth],
    privacy: {
      exactCoordinatesIncluded: false,
      restrictedFieldsRedacted: true,
    },
  };
}
