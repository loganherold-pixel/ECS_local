import {
  expeditionStore,
  fieldLogStore,
  getCanonicalExpeditionLifecycle,
  type ExpeditionStoreTransitionResult,
} from '../expeditionCommandStore';
import {
  generateCompletionSummary,
  type CompletionSummary,
} from '../completionSummary';
import { computeReadiness } from '../expeditionTypes';
import type {
  EcsChecklistItem,
  EcsExpedition,
  EcsFieldLog,
  EcsRoute,
  EcsWaypoint,
} from '../expeditionTypes';
import type { SourceTruthRef } from '../sourceTruth';
import { stableLifecycleHash } from '../lifecycle/routeTripExpeditionLifecycle';
import {
  buildCanonicalExpeditionDebriefSnapshot,
  buildExpeditionCompletionIdempotencyKey,
  type CanonicalExpeditionDebriefSnapshot,
  type ExpeditionCompletionTransaction,
} from './expeditionLifecycle';
import {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} from './expeditionTripRecordStore';
import type {
  ExpeditionTripDataQuality,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
} from './expeditionTripRecordTypes';

const completionFlights = new Map<string, Promise<ExpeditionCompletionServiceResult>>();

export interface BeginExpeditionCompletionInput {
  expedition: EcsExpedition;
  userId: string;
  checklist: readonly EcsChecklistItem[];
  fieldLogs: readonly EcsFieldLog[];
  routes: readonly EcsRoute[];
  waypoints: readonly EcsWaypoint[];
  requestedAt?: string | null;
  undoWindowMs?: number;
}

export interface ExpeditionCompletionServiceResult {
  ok: boolean;
  idempotent: boolean;
  reason: string;
  record: EcsExpedition | null;
  transaction: ExpeditionCompletionTransaction | null;
  summary: CompletionSummary | null;
  outcome: ExpeditionTripRecord | null;
}

function nowISO(): string {
  return new Date().toISOString();
}

function uuid(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : null;
}

function sourceQuality(source: SourceTruthRef): ExpeditionTripDataQuality {
  if (source.origin === 'live') return 'live';
  if (source.origin === 'cached') return 'cached';
  if (source.origin === 'manual') return 'manual';
  if (source.origin === 'estimated' || source.origin === 'inferred') return 'estimated';
  if (source.origin === 'simulated') return 'mock';
  return 'missing';
}

function tripSource(snapshot: CanonicalExpeditionDebriefSnapshot): ExpeditionTripSourceLabel {
  const source = snapshot.sourceTruth[0] ?? snapshot.plan.sourceTruth;
  return {
    source: source.authority ?? source.provider ?? 'expedition_command_snapshot',
    quality: sourceQuality(source),
    capturedAt: source.observedAt ?? snapshot.capturedAt,
    note: snapshot.privacy.exactCoordinatesIncluded
      ? null
      : 'Completion snapshot omits exact coordinates; guidance geometry remains authoritative when available.',
  };
}

function buildSyntheticCompletionLog(
  expedition: EcsExpedition,
  userId: string,
  fieldLogId: string,
  idempotencyKey: string,
  occurredAt: string,
  readinessScore: number,
  doneCount: number,
  totalCount: number,
  finalLogCount: number,
): EcsFieldLog {
  return {
    id: fieldLogId,
    user_id: userId,
    expedition_id: expedition.id,
    type: 'note',
    title: 'Expedition Completed',
    body:
      `Expedition "${expedition.title}" marked as completed. ` +
      `Final readiness: ${readinessScore}%. ` +
      `Checklist: ${doneCount}/${totalCount}. ` +
      `Total field logs: ${finalLogCount}.`,
    lat: null,
    lng: null,
    occurred_at: occurredAt,
    meta: {
      idempotency_key: idempotencyKey,
      source: 'expedition_completion_service',
      exact_location_included: false,
    },
    created_at: occurredAt,
    updated_at: occurredAt,
    deleted_at: null,
    version: 1,
  };
}

function buildDebriefSource(expedition: EcsExpedition, capturedAt: string): SourceTruthRef {
  return {
    id: `expedition-completion:${expedition.id}`,
    origin: 'manual',
    role: 'supporting',
    policyKey: 'manual_user_state',
    authority: 'ECS expedition command record',
    authorityKind: 'ecs',
    provider: null,
    observedAt: capturedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'medium',
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: ['exact_coordinates_redacted_from_completion_snapshot'],
  };
}

function buildDebriefSnapshot(
  expedition: EcsExpedition,
  summary: CompletionSummary,
  routes: readonly EcsRoute[],
  waypoints: readonly EcsWaypoint[],
  capturedAt: string,
): CanonicalExpeditionDebriefSnapshot {
  const lifecycle = getCanonicalExpeditionLifecycle(expedition);
  return buildCanonicalExpeditionDebriefSnapshot({
    lifecycle,
    capturedAt,
    summary: summary as unknown as Record<string, unknown>,
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      source: route.source,
      distanceMiles: finiteNumber(route.distance_mi),
      etaHours: finiteNumber(route.eta_hours),
    })),
    waypoints: waypoints.map((waypoint) => ({
      id: waypoint.id,
      title: waypoint.title,
      kind: waypoint.kind,
      occurredAt: waypoint.occurred_at,
    })),
    sourceTruth: [lifecycle.plan.sourceTruth, buildDebriefSource(expedition, capturedAt)],
  });
}

function serviceResult(
  transition: ExpeditionStoreTransitionResult,
  reason: string,
  outcome: ExpeditionTripRecord | null = null,
): ExpeditionCompletionServiceResult {
  return {
    ok: transition.ok,
    idempotent: transition.idempotent,
    reason,
    record: transition.record,
    transaction: transition.lifecycle?.completion ?? null,
    summary: (transition.lifecycle?.completion?.snapshot.summary ?? null) as CompletionSummary | null,
    outcome,
  };
}

export async function beginExpeditionCompletion(
  input: BeginExpeditionCompletionInput,
): Promise<ExpeditionCompletionServiceResult> {
  const lifecycle = getCanonicalExpeditionLifecycle(input.expedition);
  const existing = lifecycle.completion;
  if (lifecycle.state === 'completing' && existing?.status === 'pending') {
    return {
      ok: true,
      idempotent: true,
      reason: 'completion_already_pending',
      record: input.expedition,
      transaction: existing,
      summary: existing.snapshot.summary as unknown as CompletionSummary,
      outcome: null,
    };
  }
  if (lifecycle.state !== 'active' && lifecycle.state !== 'paused' && lifecycle.state !== 'recovery-required') {
    return {
      ok: false,
      idempotent: false,
      reason: `completion_requires_active_expedition:${lifecycle.state}`,
      record: input.expedition,
      transaction: null,
      summary: null,
      outcome: null,
    };
  }

  const requestedAt = input.requestedAt ?? nowISO();
  const idempotencyKey = buildExpeditionCompletionIdempotencyKey(lifecycle);
  const fieldLogId = uuid();
  const readiness = computeReadiness([...input.checklist]);
  const doneCount = input.checklist.filter((item) => item.is_done).length;
  const completionLog = buildSyntheticCompletionLog(
    input.expedition,
    input.userId,
    fieldLogId,
    idempotencyKey,
    requestedAt,
    readiness.score,
    doneCount,
    input.checklist.length,
    input.fieldLogs.length + 1,
  );
  const completedExpedition: EcsExpedition = {
    ...input.expedition,
    status: 'completed',
    end_at: requestedAt,
  };
  const summary = generateCompletionSummary(
    completedExpedition,
    [...input.checklist],
    [completionLog, ...input.fieldLogs],
    [...input.routes],
    [...input.waypoints],
  );
  const snapshot = buildDebriefSnapshot(input.expedition, summary, input.routes, input.waypoints, requestedAt);
  const transition = await expeditionStore.beginCompletion(input.expedition.id, {
    idempotencyKey,
    fieldLogId,
    snapshot,
    requestedAt,
    completedAt: requestedAt,
    undoWindowMs: input.undoWindowMs,
    userId: input.userId,
  });
  if (transition.ok) {
    await expeditionStore.update(input.expedition.id, {
      readiness_score: readiness.score,
      readiness_breakdown: readiness.breakdown,
    });
  }
  return serviceResult(transition, transition.ok ? 'completion_pending' : transition.decision.reason);
}

async function ensureCompletionFieldLog(
  expedition: EcsExpedition,
  userId: string,
  transaction: ExpeditionCompletionTransaction,
): Promise<EcsFieldLog | null> {
  const summary = transaction.snapshot.summary;
  const checklist = nestedRecord(summary, 'checklist');
  const readiness = nestedRecord(summary, 'readiness');
  const fieldLogs = nestedRecord(summary, 'field_logs');
  const log = buildSyntheticCompletionLog(
    expedition,
    userId,
    transaction.fieldLogId,
    transaction.idempotencyKey,
    transaction.completedAt,
    Math.round(finiteNumber(readiness?.final_score) ?? 0),
    Math.round(finiteNumber(checklist?.completed_items) ?? 0),
    Math.round(finiteNumber(checklist?.total_items) ?? 0),
    Math.round(finiteNumber(fieldLogs?.total_entries) ?? 1),
  );
  return fieldLogStore.create(userId, {
    id: log.id,
    idempotencyKey: transaction.idempotencyKey,
    expedition_id: expedition.id,
    type: log.type,
    title: log.title ?? undefined,
    body: log.body ?? undefined,
    meta: log.meta ?? undefined,
    occurred_at: log.occurred_at,
  });
}

async function ensureCompletedTripOutcome(
  expedition: EcsExpedition,
  userId: string,
  transaction: ExpeditionCompletionTransaction,
): Promise<ExpeditionTripRecord | null> {
  const records = await expeditionTripRecordStore.getAll();
  const existing = records.find((record) => record.completionKey === transaction.completionKey) ?? null;
  if (existing?.status === 'completed' || existing?.status === 'archived') return existing;

  const summary = transaction.snapshot.summary;
  const duration = nestedRecord(summary, 'duration');
  const routeSummary = nestedRecord(summary, 'routes');
  const source = tripSource(transaction.snapshot);
  const startedAt = typeof duration?.start_at === 'string'
    ? duration.start_at
    : expedition.start_at ?? expedition.created_at;
  const primaryRoute = transaction.snapshot.routes[0] ?? null;
  const base = existing ?? createNewActiveTripRecord({
    id: `expedition-trip-${stableLifecycleHash(transaction.completionKey)}`,
    completionKey: transaction.completionKey,
    expeditionId: expedition.id,
    routeAssetId: transaction.snapshot.plan.routeAssetId,
    tripPlanId: transaction.snapshot.plan.tripPlanId,
    offlinePackageId: transaction.snapshot.plan.offlinePackageId,
    userId,
    title: expedition.title,
    startedAt,
    routeId: primaryRoute?.id ?? null,
    routeTitle: primaryRoute?.name ?? expedition.title,
    guidanceSource: 'unknown',
    dataSource: source,
  });
  const generatedSummaryText = `Completed ${expedition.title}. ` +
    `This outcome uses the persisted Expedition command snapshot; exact route geometry is included only when Navigate guidance recorded it.`;
  const completed = finalizeCompletedTrip(base, {
    completedAt: transaction.completedAt,
    totalDistanceMiles: finiteNumber(routeSummary?.total_distance_mi),
    totalDurationSeconds: finiteNumber(duration?.total_hours) != null
      ? Math.round((finiteNumber(duration?.total_hours) as number) * 3600)
      : null,
    generatedSummary: {
      text: generatedSummaryText,
      generatedAt: transaction.completedAt,
      source,
    },
    dataSource: source,
    statusLabel: 'Expedition command completion',
  });
  return expeditionTripRecordStore.save(completed);
}

async function commitExpeditionCompletionNow(
  expeditionId: string,
  userId: string,
): Promise<ExpeditionCompletionServiceResult> {
  const expedition = await expeditionStore.getById(expeditionId, userId);
  if (!expedition) {
    return { ok: false, idempotent: false, reason: 'expedition_not_found', record: null, transaction: null, summary: null, outcome: null };
  }
  const lifecycle = getCanonicalExpeditionLifecycle(expedition);
  const transaction = lifecycle.completion;
  if (!transaction || (transaction.status !== 'pending' && transaction.status !== 'committed')) {
    return { ok: false, idempotent: false, reason: 'completion_not_pending', record: expedition, transaction, summary: null, outcome: null };
  }

  if (transaction.status === 'pending') {
    await ensureCompletionFieldLog(expedition, userId, transaction);
  }
  const committed = await expeditionStore.commitCompletion(expeditionId, {
    idempotencyKey: transaction.idempotencyKey,
    committedAt: transaction.completedAt,
    userId,
  });
  if (!committed.ok || !committed.record || !committed.lifecycle?.completion) {
    return serviceResult(committed, committed.decision.reason);
  }

  const outcome = await ensureCompletedTripOutcome(committed.record, userId, committed.lifecycle.completion);
  const finalized = await expeditionStore.commitCompletion(expeditionId, {
    idempotencyKey: transaction.idempotencyKey,
    committedAt: transaction.completedAt,
    outcomeId: outcome?.id ?? null,
    userId,
  });
  return serviceResult(finalized, finalized.ok ? 'completion_committed' : finalized.decision.reason, outcome);
}

export function commitExpeditionCompletion(
  expeditionId: string,
  userId: string,
): Promise<ExpeditionCompletionServiceResult> {
  const existing = completionFlights.get(expeditionId);
  if (existing) return existing;
  const flight = commitExpeditionCompletionNow(expeditionId, userId).finally(() => {
    completionFlights.delete(expeditionId);
  });
  completionFlights.set(expeditionId, flight);
  return flight;
}

export async function undoPendingExpeditionCompletion(
  expeditionId: string,
  userId: string,
  reason = 'Operator reversed completion during the undo window.',
): Promise<ExpeditionCompletionServiceResult> {
  const expedition = await expeditionStore.getById(expeditionId, userId);
  if (!expedition) {
    return { ok: false, idempotent: false, reason: 'expedition_not_found', record: null, transaction: null, summary: null, outcome: null };
  }
  const lifecycle = getCanonicalExpeditionLifecycle(expedition);
  const transaction = lifecycle.completion;
  if (!transaction) {
    return { ok: false, idempotent: false, reason: 'completion_not_pending', record: expedition, transaction: null, summary: null, outcome: null };
  }
  const transition = await expeditionStore.undoCompletion(expeditionId, {
    idempotencyKey: transaction.idempotencyKey,
    reason,
    userId,
  });
  return serviceResult(transition, transition.ok ? 'completion_reverted' : transition.decision.reason);
}

export async function resumeExpeditionCompletion(
  expedition: EcsExpedition,
  userId: string,
  nowMs = Date.now(),
): Promise<ExpeditionCompletionServiceResult | null> {
  const lifecycle = getCanonicalExpeditionLifecycle(expedition);
  const transaction = lifecycle.completion;
  if (!transaction) return null;
  if (transaction.status === 'pending') {
    const undoUntilMs = new Date(transaction.undoUntil).getTime();
    if (Number.isFinite(undoUntilMs) && undoUntilMs > nowMs) {
      return {
        ok: true,
        idempotent: true,
        reason: 'completion_pending',
        record: expedition,
        transaction,
        summary: transaction.snapshot.summary as unknown as CompletionSummary,
        outcome: null,
      };
    }
    return commitExpeditionCompletion(expedition.id, userId);
  }
  if (transaction.status === 'committed' && !transaction.outcomeId) {
    return commitExpeditionCompletion(expedition.id, userId);
  }
  return {
    ok: true,
    idempotent: true,
    reason: transaction.status,
    record: expedition,
    transaction,
    summary: transaction.snapshot.summary as unknown as CompletionSummary,
    outcome: null,
  };
}

export function getPendingExpeditionCompletion(expedition: EcsExpedition): ExpeditionCompletionTransaction | null {
  const transaction = getCanonicalExpeditionLifecycle(expedition).completion;
  return transaction?.status === 'pending' ? transaction : null;
}

export function getExpeditionCompletionFlightCountForTests(): number {
  return completionFlights.size;
}
