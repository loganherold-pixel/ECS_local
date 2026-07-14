// ============================================================
// ECS EXPEDITION COMMAND STORE — Offline-First with Cloud Sync
// + Sync Action Queue integration for offline queueing
// ============================================================
import { supabase } from './supabase';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  queueExpeditionAction,
  queueChecklistAction,
  queueFieldLogAction,
  queueWaypointAction,
} from './syncActionQueue';
import type {
  EcsExpedition,

  EcsLoadoutSnapshot,
  EcsRoute,
  EcsWaypoint,
  EcsChecklistItem,
  EcsChecklistTemplate,
  EcsFieldLog,
  EcsChecklistPriority,
  EcsFieldLogType,
  EcsWaypointKind,
  EcsExpeditionStatus,
} from './expeditionTypes';
import { computeReadiness } from './expeditionTypes';
import type { SourceTruthRef } from './sourceTruth';
import {
  beginExpeditionCompletionTransaction,
  buildCanonicalExpeditionDebriefSnapshot,
  canonicalStateFromLegacyExpeditionStatus,
  commitExpeditionCompletionTransaction,
  createCanonicalExpeditionLifecycle,
  createCanonicalExpeditionPlan,
  legacyStatusForCanonicalExpeditionState,
  readCanonicalExpeditionLifecycle,
  transitionExpeditionLifecycle,
  undoExpeditionCompletionTransaction,
  updateCanonicalExpeditionPlan,
  writeCanonicalExpeditionLifecycle,
  type CanonicalExpeditionDebriefSnapshot,
  type CanonicalExpeditionLifecycle,
  type CanonicalExpeditionState,
  type ExpeditionTransitionCause,
  type ExpeditionTransitionDecision,
} from './expedition/expeditionLifecycle';

// ── UUID generator ──────────────────────────────────────────
function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now(): string { return new Date().toISOString(); }

// ── Local cache (in-memory + localStorage fallback) ─────────
const CACHE_PREFIX = 'ecs_cmd_';
const MAX_CACHED_CHECKLIST_ITEMS = 300;
const MAX_CACHED_FIELD_LOGS = 500;
const commandPersistence = createPersistedKeyValueCache('ecs_expedition_command_store');

function cacheGet<T>(key: string): T | null {
  try {
    const raw = commandPersistence.get(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheSet(key: string, data: any): void {
  try { commandPersistence.set(CACHE_PREFIX + key, JSON.stringify(data)); } catch {}
}

function boundCachedFieldLogs(logs: readonly EcsFieldLog[]): EcsFieldLog[] {
  return logs.slice(0, MAX_CACHED_FIELD_LOGS);
}

function boundCachedChecklistItems(items: readonly EcsChecklistItem[]): EcsChecklistItem[] {
  return items.slice(0, MAX_CACHED_CHECKLIST_ITEMS);
}

function checklistTemplateItemKey(input: {
  sourceTemplateId?: string | null;
  category?: string | null;
  title?: string | null;
}): string | null {
  const templateId = input.sourceTemplateId?.trim().toLowerCase();
  const title = input.title?.trim().toLowerCase();
  if (!templateId || !title) return null;
  return `${templateId}|${input.category?.trim().toLowerCase() || 'general'}|${title}`;
}

function cacheExpeditionRecord(record: EcsExpedition): void {
  cacheSet(`pending_expedition_${record.id}`, record);
  const cached = cacheGet<EcsExpedition[]>(`expeditions_${record.user_id}`) || [];
  cacheSet(`expeditions_${record.user_id}`, [
    record,
    ...cached.filter((item) => item.id !== record.id),
  ]);
}

function lifecycleFallback(record: EcsExpedition) {
  const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
  const plan = meta.expedition_plan && typeof meta.expedition_plan === 'object'
    ? meta.expedition_plan as Record<string, unknown>
    : {};
  return {
    expeditionId: record.id,
    title: record.title,
    activeVehicleId: record.vehicle_id,
    routeAssetId: typeof plan.routeAssetId === 'string' ? plan.routeAssetId : null,
    tripPlanId: typeof plan.tripPlanId === 'string' ? plan.tripPlanId : null,
    offlinePackageId: typeof plan.offlinePackageId === 'string' ? plan.offlinePackageId : null,
    legacyStatus: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function getCanonicalExpeditionLifecycle(record: EcsExpedition): CanonicalExpeditionLifecycle {
  return readCanonicalExpeditionLifecycle(record.meta, lifecycleFallback(record));
}

function lifecycleUpdates(
  record: EcsExpedition,
  lifecycle: CanonicalExpeditionLifecycle,
): Partial<EcsExpedition> {
  const status = legacyStatusForCanonicalExpeditionState(lifecycle.state);
  const completedAt = lifecycle.completion?.completedAt ?? lifecycle.updatedAt;
  return {
    status,
    start_at: status === 'active' ? record.start_at ?? lifecycle.updatedAt : record.start_at,
    end_at: lifecycle.state === 'completed' || lifecycle.state === 'archived'
      ? record.end_at ?? completedAt
      : lifecycle.state === 'active' || lifecycle.state === 'paused' || lifecycle.state === 'completing'
        ? null
        : record.end_at,
    meta: writeCanonicalExpeditionLifecycle({
      ...(record.meta ?? {}),
      expedition_plan: lifecycle.plan,
    }, lifecycle),
    version: Math.max(1, Number(record.version) || 1) + 1,
  };
}

export interface ExpeditionStoreTransitionResult {
  ok: boolean;
  idempotent: boolean;
  decision: ExpeditionTransitionDecision;
  record: EcsExpedition | null;
  lifecycle: CanonicalExpeditionLifecycle | null;
}

export interface ExpeditionArchivePage {
  records: EcsExpedition[];
  nextCursor: string | null;
  hasMore: boolean;
  source: 'cloud' | 'cache';
}

export async function waitForExpeditionCommandStoreHydration(): Promise<void> {
  await commandPersistence.waitForHydration();
}

// ============================================================
// EXPEDITION OPERATIONS
// ============================================================

export const expeditionStore = {
  async list(userId: string): Promise<EcsExpedition[]> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [];
    }
    const records = data as EcsExpedition[];
    cacheSet(`expeditions_${userId}`, records);
    records.forEach(cacheExpeditionRecord);
    return records;
  },

  async listArchivePage(userId: string, input: {
    cursor?: string | null;
    limit?: number;
    status?: 'all' | 'completed' | 'archived';
    terrain?: string | null;
    completedAfter?: string | null;
    search?: string | null;
  } = {}): Promise<ExpeditionArchivePage> {
    await waitForExpeditionCommandStoreHydration();
    const offset = Math.max(0, Number.parseInt(input.cursor ?? '0', 10) || 0);
    const limit = Math.max(1, Math.min(50, Math.round(input.limit ?? 30)));
    const statuses = input.status && input.status !== 'all'
      ? [input.status]
      : ['completed', 'archived'];
    let query = supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('status', statuses)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit);
    if (input.terrain?.trim()) query = query.eq('terrain', input.terrain.trim());
    if (input.completedAfter?.trim()) query = query.gte('updated_at', input.completedAfter.trim());
    if (input.search?.trim()) query = query.ilike('title', `%${input.search.trim().replace(/[%_]/g, '')}%`);
    const { data, error } = await query;

    if (!error && data) {
      const fetched = data as EcsExpedition[];
      const records = fetched.slice(0, limit);
      const cached = cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [];
      cacheSet(`expeditions_${userId}`, [
        ...records,
        ...cached.filter((item) => !records.some((record) => record.id === item.id)),
      ]);
      records.forEach(cacheExpeditionRecord);
      const hasMore = fetched.length > limit;
      return {
        records,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
        source: 'cloud',
      };
    }

    const cutoffMs = input.completedAfter ? new Date(input.completedAfter).getTime() : null;
    const search = input.search?.trim().toLowerCase() ?? '';
    const terrain = input.terrain?.trim().toLowerCase() ?? '';
    const filtered = (cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [])
      .filter((record) => statuses.includes(record.status))
      .filter((record) => !terrain || record.terrain?.toLowerCase() === terrain)
      .filter((record) => !search || record.title.toLowerCase().includes(search))
      .filter((record) => {
        if (!Number.isFinite(cutoffMs)) return true;
        const timestamp = new Date(record.end_at || record.updated_at).getTime();
        return Number.isFinite(timestamp) && timestamp >= (cutoffMs as number);
      })
      .sort((a, b) => new Date(b.end_at || b.updated_at).getTime() - new Date(a.end_at || a.updated_at).getTime());
    const records = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;
    return {
      records,
      hasMore,
      nextCursor: hasMore ? String(offset + limit) : null,
      source: 'cache',
    };
  },

  async getById(id: string, userId?: string): Promise<EcsExpedition | null> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      const record = data as EcsExpedition;
      cacheExpeditionRecord(record);
      return record;
    }

    // Fallback: check local cache for offline-created expeditions
    const pending = cacheGet<EcsExpedition>(`pending_expedition_${id}`);
    if (pending) return pending;

    // Also check the user's cached expedition list
    if (userId) {
      const cached = cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [];
      const found = cached.find(e => e.id === id);
      if (found) return found;
    }

    return null;
  },


  async getActive(userId: string): Promise<EcsExpedition | null> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return (cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [])
        .find((record) => getCanonicalExpeditionLifecycle(record).state === 'active') ?? null;
    }
    const record = data[0] as EcsExpedition;
    cacheExpeditionRecord(record);
    return record;
  },
  async create(userId: string, params: {
    id?: string | null;
    idempotencyKey?: string | null;
    title: string;
    vehicle_id?: string | null;
    terrain?: string | null;
    duration_days?: number | null;
    distance_from_services_mi?: number | null;
    notes?: string | null;
    status?: EcsExpeditionStatus;
    start_at?: string | null;
    canonicalState?: 'draft' | 'planned' | 'ready';
    routeAssetId?: string | null;
    tripPlanId?: string | null;
    offlinePackageId?: string | null;
    campIds?: readonly string[] | null;
    waypointIds?: readonly string[] | null;
    bailoutIds?: readonly string[] | null;
    sourceTruth?: SourceTruthRef | null;
    meta?: Record<string, unknown> | null;
  }): Promise<EcsExpedition | null> {
    await waitForExpeditionCommandStoreHydration();
    const recordId = params.id?.trim() || uuid();
    const timestamp = now();
    const cachedById = cacheGet<EcsExpedition>(`pending_expedition_${recordId}`);
    if (cachedById?.user_id === userId) return cachedById;
    const requestedIdempotencyKey = params.idempotencyKey?.trim();
    if (requestedIdempotencyKey) {
      const cachedByKey = (cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || []).find((record) => (
        record.meta?.expedition_create_idempotency_key === requestedIdempotencyKey
      ));
      if (cachedByKey) return cachedByKey;
    }
    const plan = createCanonicalExpeditionPlan({
      expeditionId: recordId,
      title: params.title,
      activeVehicleId: params.vehicle_id,
      routeAssetId: params.routeAssetId,
      tripPlanId: params.tripPlanId,
      offlinePackageId: params.offlinePackageId,
      campIds: params.campIds,
      waypointIds: params.waypointIds,
      bailoutIds: params.bailoutIds,
      sourceTruth: params.sourceTruth,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const canonicalState = params.canonicalState ?? canonicalStateFromLegacyExpeditionStatus(params.status);
    const lifecycle = createCanonicalExpeditionLifecycle({
      plan,
      initialState: canonicalState,
      cause: params.canonicalState === 'planned' ? 'wizard' : 'system',
      occurredAt: timestamp,
      allowDegradedPlanning: canonicalState === 'ready',
    });
    const meta = writeCanonicalExpeditionLifecycle({
      ...(params.meta ?? {}),
      expedition_plan: plan,
      expedition_create_idempotency_key: params.idempotencyKey?.trim() || `create:${recordId}`,
    }, lifecycle);
    const record = {
      id: recordId,
      user_id: userId,
      title: params.title,
      vehicle_id: params.vehicle_id || null,
      terrain: params.terrain || null,
      duration_days: params.duration_days || null,
      distance_from_services_mi: params.distance_from_services_mi || null,
      notes: params.notes || null,
      status: legacyStatusForCanonicalExpeditionState(lifecycle.state),
      start_at: params.start_at || null,
      meta,
    };

    const { data, error } = await supabase
      .from('ecs_expeditions')
      .insert(record)
      .select()
      .single();

    if (error || !data) {
      // Offline fallback: create locally
      const local: EcsExpedition = {
        ...record,
        loadout_snapshot_id: null,
        end_at: null,
        readiness_score: null,
        readiness_breakdown: null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
        version: 1,
      };
      cacheExpeditionRecord(local);
      await commandPersistence.flush();

      // Queue for sync when back online
      queueExpeditionAction('expedition_create', {
        expeditionId: local.id,
        userId,
        title: params.title,
        vehicle_id: params.vehicle_id,
        terrain: params.terrain,
        duration_days: params.duration_days,
        notes: params.notes,
        status: local.status,
        start_at: params.start_at,
        idempotencyKey: params.idempotencyKey?.trim() || `create:${local.id}`,
        canonicalState: lifecycle.state,
        createdOffline: true,
      }, `Create expedition: ${params.title}`);

      return local;
    }

    // Online success — still queue for audit trail
    const created = data as EcsExpedition;
    cacheExpeditionRecord(created);
    queueExpeditionAction('expedition_create', {
      expeditionId: data.id,
      userId,
      title: params.title,
      vehicle_id: params.vehicle_id,
      terrain: params.terrain,
      duration_days: params.duration_days,
      notes: params.notes,
      status: created.status,
      idempotencyKey: params.idempotencyKey?.trim() || `create:${created.id}`,
      canonicalState: lifecycle.state,
      createdOffline: false,
    }, `Create expedition: ${params.title}`);

    return created;
  },

  async update(id: string, updates: Partial<EcsExpedition>): Promise<boolean> {
    await waitForExpeditionCommandStoreHydration();
    const cached = cacheGet<EcsExpedition>(`pending_expedition_${id}`);
    const updatedAt = now();
    const { error } = await supabase
      .from('ecs_expeditions')
      .update({ ...updates, updated_at: updatedAt })
      .eq('id', id);

    if (cached) {
      cacheExpeditionRecord({
        ...cached,
        ...updates,
        updated_at: updatedAt,
      });
      await commandPersistence.flush();
    }

    // Queue update for sync regardless of online/offline
    queueExpeditionAction('expedition_update', {
      expeditionId: id,
      updates,
      timestamp: updatedAt,
    }, `Update expedition ${id}`);

    return !error || Boolean(cached);
  },

  async transition(id: string, to: CanonicalExpeditionState, input: {
    idempotencyKey: string;
    cause: ExpeditionTransitionCause;
    reason?: string | null;
    userId?: string;
    allowDegradedPlanning?: boolean;
    mode?: 'normal' | 'correction';
    occurredAt?: string | null;
  }): Promise<ExpeditionStoreTransitionResult> {
    const record = await this.getById(id, input.userId);
    if (!record) {
      const from = canonicalStateFromLegacyExpeditionStatus(null);
      return {
        ok: false,
        idempotent: false,
        decision: { accepted: false, idempotent: false, from, to, reason: 'invalid_transition' },
        record: null,
        lifecycle: null,
      };
    }
    const current = getCanonicalExpeditionLifecycle(record);
    const result = transitionExpeditionLifecycle(current, to, {
      idempotencyKey: input.idempotencyKey,
      cause: input.cause,
      actor: input.cause === 'operator' ? 'operator' : input.cause === 'geofence' ? 'geofence' : 'system',
      mode: input.mode,
      reason: input.reason,
      occurredAt: input.occurredAt,
      allowDegradedPlanning: input.allowDegradedPlanning,
    });
    if (!result.decision.accepted) {
      return {
        ok: false,
        idempotent: false,
        decision: result.decision,
        record,
        lifecycle: current,
      };
    }
    if (result.decision.idempotent) {
      return {
        ok: true,
        idempotent: true,
        decision: result.decision,
        record,
        lifecycle: current,
      };
    }
    const updates = lifecycleUpdates(record, result.lifecycle);
    const ok = await this.update(id, updates);
    const nextRecord = ok
      ? { ...record, ...updates, updated_at: result.lifecycle.updatedAt } as EcsExpedition
      : record;
    if (ok) cacheExpeditionRecord(nextRecord);
    return {
      ok,
      idempotent: false,
      decision: result.decision,
      record: nextRecord,
      lifecycle: result.lifecycle,
    };
  },

  async updatePlan(id: string, patch: {
    title?: string | null;
    activeVehicleId?: string | null;
    routeAssetId?: string | null;
    tripPlanId?: string | null;
    offlinePackageId?: string | null;
    campIds?: readonly string[] | null;
    waypointIds?: readonly string[] | null;
    bailoutIds?: readonly string[] | null;
    sourceTruth?: SourceTruthRef | null;
  }, userId?: string): Promise<EcsExpedition | null> {
    const record = await this.getById(id, userId);
    if (!record) return null;
    const lifecycle = getCanonicalExpeditionLifecycle(record);
    const updated = updateCanonicalExpeditionPlan(lifecycle, patch);
    if (updated === lifecycle) return record;
    const updates = lifecycleUpdates(record, updated);
    const ok = await this.update(id, updates);
    if (!ok) return null;
    const next = { ...record, ...updates, updated_at: updated.updatedAt } as EcsExpedition;
    cacheExpeditionRecord(next);
    return next;
  },

  async activate(id: string, userId?: string): Promise<boolean> {
    const record = await this.getById(id, userId);
    if (!record) return false;
    let lifecycle = getCanonicalExpeditionLifecycle(record);
    const baseKey = `activate:${id}:${lifecycle.revision}`;
    const path: CanonicalExpeditionState[] = [];
    if (lifecycle.state === 'draft') path.push('planned');
    if (lifecycle.state === 'draft' || lifecycle.state === 'planned') path.push('ready');
    if (lifecycle.state !== 'active') path.push('active');
    for (const [index, state] of path.entries()) {
      const result = transitionExpeditionLifecycle(lifecycle, state, {
        idempotencyKey: `${baseKey}:${index}:${state}`,
        cause: 'operator',
        actor: 'operator',
        reason: state === 'active' ? 'Expedition activated.' : 'Expedition activation staging.',
        allowDegradedPlanning: true,
      });
      if (!result.decision.accepted) return false;
      lifecycle = result.lifecycle;
    }
    const updates = lifecycleUpdates(record, lifecycle);
    const result = await this.update(id, updates);
    queueExpeditionAction('expedition_activate', {
      expeditionId: id,
      activatedAt: lifecycle.updatedAt,
      idempotencyKey: baseKey,
    }, `Activate expedition ${id}`, 'critical');
    return result;
  },

  async beginCompletion(id: string, input: {
    idempotencyKey: string;
    fieldLogId: string;
    snapshot: CanonicalExpeditionDebriefSnapshot;
    requestedAt?: string | null;
    completedAt?: string | null;
    undoWindowMs?: number;
    userId?: string;
  }): Promise<ExpeditionStoreTransitionResult> {
    const record = await this.getById(id, input.userId);
    if (!record) {
      const from = canonicalStateFromLegacyExpeditionStatus(null);
      return {
        ok: false,
        idempotent: false,
        decision: { accepted: false, idempotent: false, from, to: 'completing', reason: 'invalid_transition' },
        record: null,
        lifecycle: null,
      };
    }
    const lifecycle = getCanonicalExpeditionLifecycle(record);
    const result = beginExpeditionCompletionTransaction(lifecycle, input);
    if (!result.decision.accepted) {
      return { ok: false, idempotent: false, decision: result.decision, record, lifecycle };
    }
    if (result.decision.idempotent) {
      return { ok: true, idempotent: true, decision: result.decision, record, lifecycle };
    }
    const updates = lifecycleUpdates(record, result.lifecycle);
    const ok = await this.update(id, updates);
    const nextRecord = ok ? { ...record, ...updates, updated_at: result.lifecycle.updatedAt } as EcsExpedition : record;
    if (ok) cacheExpeditionRecord(nextRecord);
    return { ok, idempotent: false, decision: result.decision, record: nextRecord, lifecycle: result.lifecycle };
  },

  async commitCompletion(id: string, input: {
    idempotencyKey: string;
    committedAt?: string | null;
    outcomeId?: string | null;
    userId?: string;
  }): Promise<ExpeditionStoreTransitionResult> {
    const record = await this.getById(id, input.userId);
    if (!record) {
      const from = canonicalStateFromLegacyExpeditionStatus(null);
      return {
        ok: false,
        idempotent: false,
        decision: { accepted: false, idempotent: false, from, to: 'completed', reason: 'invalid_transition' },
        record: null,
        lifecycle: null,
      };
    }
    const lifecycle = getCanonicalExpeditionLifecycle(record);
    const result = commitExpeditionCompletionTransaction(lifecycle, input);
    if (!result.decision.accepted) {
      return { ok: false, idempotent: false, decision: result.decision, record, lifecycle };
    }
    if (result.decision.idempotent && lifecycle.completion?.outcomeId === input.outcomeId) {
      return { ok: true, idempotent: true, decision: result.decision, record, lifecycle };
    }
    const updates = lifecycleUpdates(record, result.lifecycle);
    const ok = await this.update(id, updates);
    const nextRecord = ok ? { ...record, ...updates, updated_at: result.lifecycle.updatedAt } as EcsExpedition : record;
    if (ok) cacheExpeditionRecord(nextRecord);
    queueExpeditionAction('expedition_complete', {
      expeditionId: id,
      completedAt: result.lifecycle.completion?.completedAt ?? result.lifecycle.updatedAt,
      idempotencyKey: input.idempotencyKey,
      completionKey: result.lifecycle.completion?.completionKey,
    }, `Complete expedition ${id}`, 'critical');
    return { ok, idempotent: result.decision.idempotent, decision: result.decision, record: nextRecord, lifecycle: result.lifecycle };
  },

  async undoCompletion(id: string, input: {
    idempotencyKey: string;
    revertedAt?: string | null;
    reason?: string | null;
    userId?: string;
  }): Promise<ExpeditionStoreTransitionResult> {
    const record = await this.getById(id, input.userId);
    if (!record) {
      const from = canonicalStateFromLegacyExpeditionStatus(null);
      return {
        ok: false,
        idempotent: false,
        decision: { accepted: false, idempotent: false, from, to: 'active', reason: 'invalid_transition' },
        record: null,
        lifecycle: null,
      };
    }
    const lifecycle = getCanonicalExpeditionLifecycle(record);
    const result = undoExpeditionCompletionTransaction(lifecycle, input);
    if (!result.decision.accepted) {
      return { ok: false, idempotent: false, decision: result.decision, record, lifecycle };
    }
    if (result.decision.idempotent) {
      return { ok: true, idempotent: true, decision: result.decision, record, lifecycle };
    }
    const updates = lifecycleUpdates(record, result.lifecycle);
    const ok = await this.update(id, updates);
    const nextRecord = ok ? { ...record, ...updates, updated_at: result.lifecycle.updatedAt } as EcsExpedition : record;
    if (ok) cacheExpeditionRecord(nextRecord);
    return { ok, idempotent: false, decision: result.decision, record: nextRecord, lifecycle: result.lifecycle };
  },

  async complete(id: string, userId?: string): Promise<boolean> {
    const record = await this.getById(id, userId);
    if (!record) return false;
    const lifecycle = getCanonicalExpeditionLifecycle(record);
    const timestamp = now();
    const idempotencyKey = `complete-immediately:${id}:${lifecycle.revision}`;
    const snapshot = buildCanonicalExpeditionDebriefSnapshot({ lifecycle, capturedAt: timestamp });
    const begun = await this.beginCompletion(id, {
      idempotencyKey,
      fieldLogId: uuid(),
      snapshot,
      requestedAt: timestamp,
      completedAt: timestamp,
      undoWindowMs: 0,
      userId,
    });
    if (!begun.ok) return false;
    const committed = await this.commitCompletion(id, { idempotencyKey, committedAt: timestamp, userId });
    return committed.ok;
  },

  async markRecoveryRequired(id: string, reason: string, userId?: string): Promise<boolean> {
    const current = await this.getById(id, userId);
    if (!current) return false;
    const result = await this.transition(id, 'recovery-required', {
      idempotencyKey: `recovery-required:${id}:${getCanonicalExpeditionLifecycle(current).revision}`,
      cause: 'recovery',
      reason,
      userId,
      allowDegradedPlanning: true,
    });
    return result.ok;
  },

  async cancel(id: string, reason: string, userId?: string): Promise<boolean> {
    const current = await this.getById(id, userId);
    if (!current) return false;
    const result = await this.transition(id, 'cancelled', {
      idempotencyKey: `cancel:${id}:${getCanonicalExpeditionLifecycle(current).revision}`,
      cause: 'operator',
      reason,
      userId,
      allowDegradedPlanning: true,
    });
    return result.ok;
  },

  async archive(id: string, userId?: string): Promise<boolean> {
    const current = await this.getById(id, userId);
    if (!current) return false;
    const lifecycle = getCanonicalExpeditionLifecycle(current);
    const result = await this.transition(id, 'archived', {
      idempotencyKey: `archive:${id}:${lifecycle.revision}`,
      cause: 'archive',
      reason: 'Expedition archived.',
      userId,
      allowDegradedPlanning: true,
    });
    queueExpeditionAction('expedition_archive', {
      expeditionId: id,
      archivedAt: result.lifecycle?.updatedAt ?? now(),
      idempotencyKey: `archive:${id}:${lifecycle.revision}`,
    }, `Archive expedition ${id}`);
    return result.ok;
  },

  async updateReadiness(expeditionId: string, userId: string): Promise<number> {
    const items = await checklistStore.list(expeditionId, userId);
    const { score, breakdown } = computeReadiness(items);
    await this.update(expeditionId, {
      readiness_score: score,
      readiness_breakdown: breakdown,
    } as any);

    queueExpeditionAction('expedition_readiness_update', {
      expeditionId,
      score,
      breakdown,
      checklistItemCount: items.length,
    }, `Update readiness for expedition ${expeditionId}: ${score}%`);

    return score;
  },
};


// ============================================================
// LOADOUT SNAPSHOT OPERATIONS
// ============================================================

export const snapshotStore = {
  async create(userId: string, params: {
    vehicle_id?: string | null;
    expedition_id?: string | null;
    label?: string | null;
    snapshot: Record<string, any>;
  }): Promise<EcsLoadoutSnapshot | null> {
    await waitForExpeditionCommandStoreHydration();
    const record = {
      user_id: userId,
      vehicle_id: params.vehicle_id || null,
      expedition_id: params.expedition_id || null,
      label: params.label || null,
      snapshot: params.snapshot,
    };

    const { data, error } = await supabase
      .from('ecs_loadout_snapshots')
      .insert(record)
      .select()
      .single();

    if (error || !data) {
      const local: EcsLoadoutSnapshot = {
        id: uuid(),
        ...record,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        version: 1,
      };
      if (params.expedition_id) cacheSet(`snapshot_${params.expedition_id}`, local);
      return local;
    }

    const result = data as EcsLoadoutSnapshot;
    if (params.expedition_id) cacheSet(`snapshot_${params.expedition_id}`, result);
    return result;
  },

  async getByExpedition(expeditionId: string): Promise<EcsLoadoutSnapshot | null> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_loadout_snapshots')
      .select('*')
      .eq('expedition_id', expeditionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return cacheGet<EcsLoadoutSnapshot>(`snapshot_${expeditionId}`);
    }
    const result = data[0] as EcsLoadoutSnapshot;
    cacheSet(`snapshot_${expeditionId}`, result);
    return result;
  },
};

// ============================================================
// ROUTE OPERATIONS
// ============================================================

export const routeCommandStore = {
  async list(expeditionId: string, userId: string): Promise<EcsRoute[]> {
    const { data, error } = await supabase
      .from('ecs_routes')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    return (error || !data) ? [] : data as EcsRoute[];
  },

  async create(userId: string, params: {
    expedition_id: string;
    name?: string;
    source?: string;
    gpx?: string;
    geojson?: Record<string, any>;
    distance_mi?: number;
    eta_hours?: number;
  }): Promise<EcsRoute | null> {
    const record = {
      user_id: userId,
      expedition_id: params.expedition_id,
      name: params.name || 'Primary Route',
      source: params.source || 'manual',
      gpx: params.gpx || null,
      geojson: params.geojson || null,
      distance_mi: params.distance_mi || null,
      eta_hours: params.eta_hours || null,
    };

    const { data, error } = await supabase
      .from('ecs_routes')
      .insert(record)
      .select()
      .single();

    const result = (error || !data)
      ? { id: uuid(), ...record, created_at: now(), updated_at: now(), deleted_at: null, version: 1 } as EcsRoute
      : data as EcsRoute;

    queueExpeditionAction('route_command_create', {
      routeId: result.id,
      expeditionId: params.expedition_id,
      name: params.name || 'Primary Route',
      source: params.source || 'manual',
      distance_mi: params.distance_mi,
      eta_hours: params.eta_hours,
      hasGpx: !!params.gpx,
      hasGeojson: !!params.geojson,
    }, `Create route: ${params.name || 'Primary Route'}`);

    const expedition = await expeditionStore.updatePlan(params.expedition_id, {
      routeAssetId: result.id,
      sourceTruth: {
        id: `expedition-route:${result.id}`,
        origin: params.source && params.source !== 'manual' ? 'cached' : 'manual',
        role: 'primary',
        policyKey: 'manual_user_state',
        authority: params.source || 'ECS route manager',
        authorityKind: params.source && params.source !== 'manual' ? 'provider' : 'user',
        provider: params.source || null,
        observedAt: result.updated_at,
        fetchedAt: null,
        expiresAt: null,
        confidence: params.gpx || params.geojson ? 'medium' : 'low',
        coverage: params.gpx || params.geojson ? 'complete' : 'partial',
        availability: 'usable',
        conflictState: 'none',
        conflict: false,
        warningCodes: params.gpx || params.geojson ? [] : ['route_geometry_missing'],
      },
    }, userId);
    if (expedition && getCanonicalExpeditionLifecycle(expedition).state === 'planned') {
      await expeditionStore.transition(params.expedition_id, 'ready', {
        idempotencyKey: `route-ready:${params.expedition_id}:${result.id}`,
        cause: 'operator',
        reason: 'Vehicle and route plan are available.',
        userId,
      });
    }

    return result;
  },

  async update(id: string, updates: Partial<EcsRoute>): Promise<boolean> {
    const { error } = await supabase.from('ecs_routes').update({ ...updates, updated_at: now() }).eq('id', id);

    queueExpeditionAction('route_command_update', {
      routeId: id,
      updates,
      timestamp: now(),
    }, `Update route ${id}`);

    return !error;
  },
};

// ============================================================
// WAYPOINT OPERATIONS
// ============================================================

export const waypointCommandStore = {
  async list(expeditionId: string, userId: string): Promise<EcsWaypoint[]> {
    const { data, error } = await supabase
      .from('ecs_waypoints')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: true });

    return (error || !data) ? [] : data as EcsWaypoint[];
  },

  async create(userId: string, params: {
    expedition_id: string;
    route_id?: string | null;
    title?: string;
    kind: EcsWaypointKind;
    lat?: number;
    lng?: number;
    meta?: Record<string, any>;
  }): Promise<EcsWaypoint | null> {
    const record = {
      user_id: userId,
      expedition_id: params.expedition_id,
      route_id: params.route_id || null,
      title: params.title || null,
      kind: params.kind,
      lat: params.lat || null,
      lng: params.lng || null,
      occurred_at: now(),
      meta: params.meta || null,
    };

    const { data, error } = await supabase
      .from('ecs_waypoints')
      .insert(record)
      .select()
      .single();

    const result = (error || !data)
      ? { id: uuid(), ...record, created_at: now(), updated_at: now(), deleted_at: null, version: 1 } as EcsWaypoint
      : data as EcsWaypoint;

    queueWaypointAction('waypoint_create', {
      waypointId: result.id,
      expeditionId: params.expedition_id,
      title: params.title,
      kind: params.kind,
      lat: params.lat,
      lng: params.lng,
      meta: params.meta,
    }, `Create waypoint: ${params.title || params.kind}`);

    const expedition = await expeditionStore.getById(params.expedition_id, userId);
    if (expedition) {
      const plan = getCanonicalExpeditionLifecycle(expedition).plan;
      await expeditionStore.updatePlan(params.expedition_id, {
        waypointIds: [...plan.waypointIds, result.id],
        campIds: params.kind === 'camp' ? [...plan.campIds, result.id] : plan.campIds,
      }, userId);
    }

    return result;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from('ecs_waypoints').update({ deleted_at: now() }).eq('id', id);

    queueWaypointAction('waypoint_delete', {
      waypointId: id,
      timestamp: now(),
    }, `Delete waypoint ${id}`);

    return !error;
  },
};


// ============================================================
// CHECKLIST OPERATIONS
// ============================================================

export const checklistStore = {
  async list(expeditionId: string, userId: string): Promise<EcsChecklistItem[]> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_expedition_checklist_items')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('title', { ascending: true })
      .limit(MAX_CACHED_CHECKLIST_ITEMS);

    if (error || !data) {
      return boundCachedChecklistItems(cacheGet<EcsChecklistItem[]>(`checklist_${expeditionId}`) || []);
    }
    const records = boundCachedChecklistItems(data as EcsChecklistItem[]);
    cacheSet(`checklist_${expeditionId}`, records);
    return records;
  },

  async addItem(userId: string, params: {
    expedition_id: string;
    category?: string;
    title: string;
    priority?: EcsChecklistPriority;
    source_template_id?: string;
  }): Promise<EcsChecklistItem | null> {
    await waitForExpeditionCommandStoreHydration();
    const cached = cacheGet<EcsChecklistItem[]>(`checklist_${params.expedition_id}`) || [];
    const requestedTemplateKey = checklistTemplateItemKey({
      sourceTemplateId: params.source_template_id,
      category: params.category,
      title: params.title,
    });
    const existing = requestedTemplateKey
      ? cached.find((item) => checklistTemplateItemKey({
          sourceTemplateId: item.source_template_id,
          category: item.category,
          title: item.title,
        }) === requestedTemplateKey)
      : null;
    if (existing) return existing;
    const record = {
      user_id: userId,
      expedition_id: params.expedition_id,
      category: params.category || 'general',
      title: params.title,
      priority: params.priority || 'normal',
      is_done: false,
      source_template_id: params.source_template_id || null,
    };

    const { data, error } = await supabase
      .from('ecs_expedition_checklist_items')
      .insert(record)
      .select()
      .single();

    const result = (error || !data)
      ? { id: uuid(), ...record, done_at: null, created_at: now(), updated_at: now(), deleted_at: null, version: 1 } as EcsChecklistItem
      : data as EcsChecklistItem;
    cacheSet(`checklist_${params.expedition_id}`, boundCachedChecklistItems([
      ...cached.filter((item) => item.id !== result.id),
      result,
    ]));
    await commandPersistence.flush();

    queueChecklistAction('checklist_add', {
      itemId: result.id,
      expeditionId: params.expedition_id,
      title: params.title,
      category: params.category || 'general',
      priority: params.priority || 'normal',
      sourceTemplateId: params.source_template_id,
    }, `Add checklist item: ${params.title}`);

    return result;
  },

  async toggleItem(id: string, isDone: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('ecs_expedition_checklist_items')
      .update({
        is_done: isDone,
        done_at: isDone ? now() : null,
        updated_at: now(),
      })
      .eq('id', id);

    queueChecklistAction('checklist_toggle', {
      itemId: id,
      isDone,
      timestamp: now(),
    }, `${isDone ? 'Check' : 'Uncheck'} checklist item ${id}`);

    return !error;
  },

  async removeItem(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('ecs_expedition_checklist_items')
      .update({ deleted_at: now() })
      .eq('id', id);

    queueChecklistAction('checklist_remove', {
      itemId: id,
      timestamp: now(),
    }, `Remove checklist item ${id}`);

    return !error;
  },

  async getTemplates(): Promise<EcsChecklistTemplate[]> {
    const { data, error } = await supabase
      .from('ecs_checklist_templates')
      .select('*')
      .is('deleted_at', null);

    return (error || !data) ? [] : data as EcsChecklistTemplate[];
  },

  async generateFromTemplates(userId: string, expeditionId: string, terrain: string | null, durationDays: number | null): Promise<number> {
    const [templates, existingItems] = await Promise.all([
      this.getTemplates(),
      this.list(expeditionId, userId),
    ]);
    const existingTemplateItems = new Set(existingItems
      .map((item) => checklistTemplateItemKey({
        sourceTemplateId: item.source_template_id,
        category: item.category,
        title: item.title,
      }))
      .filter((key): key is string => Boolean(key)));
    let count = 0;

    for (const tpl of templates) {
      const rules = tpl.rules || {};
      let matches = true;

      if (rules.terrain && terrain && rules.terrain !== terrain) matches = false;
      if (rules.duration_days_min && durationDays && durationDays < rules.duration_days_min) matches = false;

      // If no terrain/duration specified, include multi-day template if duration >= 3
      if (!terrain && rules.terrain) matches = false;

      if (matches) {
        const items = tpl.items || [];
        for (const item of items) {
          const itemKey = checklistTemplateItemKey({
            sourceTemplateId: tpl.id,
            category: item.category,
            title: item.title,
          });
          if (itemKey && existingTemplateItems.has(itemKey)) continue;
          const created = await this.addItem(userId, {
            expedition_id: expeditionId,
            category: item.category || 'general',
            title: item.title,
            priority: item.priority || 'normal',
            source_template_id: tpl.id,
          });
          if (created) {
            count++;
            if (itemKey) existingTemplateItems.add(itemKey);
          }
        }
      }
    }

    // Queue a single summary action for the batch generation
    if (count > 0) {
      queueChecklistAction('checklist_generate', {
        expeditionId,
        terrain,
        durationDays,
        itemsGenerated: count,
        templateCount: templates.length,
      }, `Generate ${count} checklist items from templates`);
    }

    return count;
  },
};

// ============================================================
// FIELD LOG OPERATIONS
// ============================================================

export const fieldLogStore = {
  async list(expeditionId: string, userId: string): Promise<EcsFieldLog[]> {
    await waitForExpeditionCommandStoreHydration();
    const { data, error } = await supabase
      .from('ecs_field_logs')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false })
      .limit(MAX_CACHED_FIELD_LOGS);

    if (error || !data) {
      return boundCachedFieldLogs(cacheGet<EcsFieldLog[]>(`fieldlogs_${expeditionId}`) || []);
    }
    const records = boundCachedFieldLogs(data as EcsFieldLog[]);
    cacheSet(`fieldlogs_${expeditionId}`, records);
    return records;
  },

  async create(userId: string, params: {
    id?: string | null;
    idempotencyKey?: string | null;
    expedition_id: string;
    type: EcsFieldLogType;
    title?: string;
    body?: string;
    lat?: number | null;
    lng?: number | null;
    meta?: Record<string, any>;
    occurred_at?: string | null;
  }): Promise<EcsFieldLog | null> {
    await waitForExpeditionCommandStoreHydration();
    const cached = cacheGet<EcsFieldLog[]>(`fieldlogs_${params.expedition_id}`) || [];
    const existing = cached.find((item) => (
      (params.id && item.id === params.id) ||
      (params.idempotencyKey && item.meta?.idempotency_key === params.idempotencyKey)
    ));
    if (existing) return existing;
    const occurredAt = params.occurred_at || now();
    const record = {
      ...(params.id ? { id: params.id } : null),
      user_id: userId,
      expedition_id: params.expedition_id,
      type: params.type,
      title: params.title || null,
      body: params.body || null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      occurred_at: occurredAt,
      meta: params.idempotencyKey
        ? { ...(params.meta || {}), idempotency_key: params.idempotencyKey }
        : params.meta || null,
    };

    const { data, error } = await supabase
      .from('ecs_field_logs')
      .insert(record)
      .select()
      .single();

    let result: EcsFieldLog;
    if (error || !data) {
      result = {
        id: params.id || uuid(),
        ...record,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        version: 1,
      } as EcsFieldLog;
      cacheSet(`fieldlogs_${params.expedition_id}`, boundCachedFieldLogs([result, ...cached]));
    } else {
      result = data as EcsFieldLog;
      cacheSet(`fieldlogs_${params.expedition_id}`, boundCachedFieldLogs([
        result,
        ...cached.filter((item) => item.id !== result.id),
      ]));
    }
    await commandPersistence.flush();

    queueFieldLogAction('field_log_create', {
      logId: result.id,
      expeditionId: params.expedition_id,
      type: params.type,
      title: params.title,
      body: params.body,
      lat: params.lat,
      lng: params.lng,
      idempotencyKey: params.idempotencyKey,
    }, `Create field log: ${params.title || params.type}`);

    return result;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('ecs_field_logs')
      .update({ deleted_at: now() })
      .eq('id', id);

    queueFieldLogAction('field_log_remove', {
      logId: id,
      timestamp: now(),
    }, `Remove field log ${id}`);

    return !error;
  },
};


