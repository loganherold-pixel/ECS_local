// ============================================================
// ECS EXPEDITION COMMAND STORE — Offline-First with Cloud Sync
// + Sync Action Queue integration for offline queueing
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase';
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

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheSet(key: string, data: any): void {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); } catch {}
}

// ============================================================
// EXPEDITION OPERATIONS
// ============================================================

export const expeditionStore = {
  async list(userId: string): Promise<EcsExpedition[]> {
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [];
    }
    cacheSet(`expeditions_${userId}`, data);
    return data as EcsExpedition[];
  },

  async getById(id: string, userId?: string): Promise<EcsExpedition | null> {
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) return data as EcsExpedition;

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
    const { data, error } = await supabase
      .from('ecs_expeditions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0] as EcsExpedition;
  },
  async create(userId: string, params: {
    title: string;
    vehicle_id?: string | null;
    terrain?: string | null;
    duration_days?: number | null;
    distance_from_services_mi?: number | null;
    notes?: string | null;
    status?: EcsExpeditionStatus;
    start_at?: string | null;
  }): Promise<EcsExpedition | null> {
    const record = {
      user_id: userId,
      title: params.title,
      vehicle_id: params.vehicle_id || null,
      terrain: params.terrain || null,
      duration_days: params.duration_days || null,
      distance_from_services_mi: params.distance_from_services_mi || null,
      notes: params.notes || null,
      status: params.status || 'draft',
      start_at: params.start_at || null,
    };

    const { data, error } = await supabase
      .from('ecs_expeditions')
      .insert(record)
      .select()
      .single();

    if (error || !data) {
      // Offline fallback: create locally
      const local: EcsExpedition = {
        id: uuid(),
        ...record,
        meta: {},
        loadout_snapshot_id: null,
        end_at: null,
        readiness_score: null,
        readiness_breakdown: null,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        version: 1,
      };
      const cached = cacheGet<EcsExpedition[]>(`expeditions_${userId}`) || [];
      cached.unshift(local);
      cacheSet(`expeditions_${userId}`, cached);
      cacheSet(`pending_expedition_${local.id}`, local);

      // Queue for sync when back online
      queueExpeditionAction('expedition_create', {
        expeditionId: local.id,
        userId,
        title: params.title,
        vehicle_id: params.vehicle_id,
        terrain: params.terrain,
        duration_days: params.duration_days,
        notes: params.notes,
        status: params.status || 'draft',
        start_at: params.start_at,
        createdOffline: true,
      }, `Create expedition: ${params.title}`);

      return local;
    }

    // Online success — still queue for audit trail
    queueExpeditionAction('expedition_create', {
      expeditionId: data.id,
      userId,
      title: params.title,
      vehicle_id: params.vehicle_id,
      terrain: params.terrain,
      duration_days: params.duration_days,
      notes: params.notes,
      status: params.status || 'draft',
      createdOffline: false,
    }, `Create expedition: ${params.title}`);

    return data as EcsExpedition;
  },

  async update(id: string, updates: Partial<EcsExpedition>): Promise<boolean> {
    const { error } = await supabase
      .from('ecs_expeditions')
      .update({ ...updates, updated_at: now() })
      .eq('id', id);

    // Queue update for sync regardless of online/offline
    queueExpeditionAction('expedition_update', {
      expeditionId: id,
      updates,
      timestamp: now(),
    }, `Update expedition ${id}`);

    return !error;
  },

  async activate(id: string): Promise<boolean> {
    const result = await this.update(id, { status: 'active', start_at: now() } as any);
    queueExpeditionAction('expedition_activate', {
      expeditionId: id,
      activatedAt: now(),
    }, `Activate expedition ${id}`, 'critical');
    return result;
  },

  async complete(id: string): Promise<boolean> {
    const result = await this.update(id, { status: 'completed', end_at: now() } as any);
    queueExpeditionAction('expedition_complete', {
      expeditionId: id,
      completedAt: now(),
    }, `Complete expedition ${id}`, 'critical');
    return result;
  },

  async archive(id: string): Promise<boolean> {
    const result = await this.update(id, { status: 'archived' } as any);
    queueExpeditionAction('expedition_archive', {
      expeditionId: id,
    }, `Archive expedition ${id}`);
    return result;
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
      return local;
    }

    return data as EcsLoadoutSnapshot;
  },

  async getByExpedition(expeditionId: string): Promise<EcsLoadoutSnapshot | null> {
    const { data, error } = await supabase
      .from('ecs_loadout_snapshots')
      .select('*')
      .eq('expedition_id', expeditionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0] as EcsLoadoutSnapshot;
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
    const { data, error } = await supabase
      .from('ecs_expedition_checklist_items')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('title', { ascending: true });

    if (error || !data) {
      return cacheGet<EcsChecklistItem[]>(`checklist_${expeditionId}`) || [];
    }
    cacheSet(`checklist_${expeditionId}`, data);
    return data as EcsChecklistItem[];
  },

  async addItem(userId: string, params: {
    expedition_id: string;
    category?: string;
    title: string;
    priority?: EcsChecklistPriority;
    source_template_id?: string;
  }): Promise<EcsChecklistItem | null> {
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
    const templates = await this.getTemplates();
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
          await this.addItem(userId, {
            expedition_id: expeditionId,
            category: item.category || 'general',
            title: item.title,
            priority: item.priority || 'normal',
            source_template_id: tpl.id,
          });
          count++;
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
    const { data, error } = await supabase
      .from('ecs_field_logs')
      .select('*')
      .eq('expedition_id', expeditionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false });

    if (error || !data) {
      return cacheGet<EcsFieldLog[]>(`fieldlogs_${expeditionId}`) || [];
    }
    cacheSet(`fieldlogs_${expeditionId}`, data);
    return data as EcsFieldLog[];
  },

  async create(userId: string, params: {
    expedition_id: string;
    type: EcsFieldLogType;
    title?: string;
    body?: string;
    lat?: number | null;
    lng?: number | null;
    meta?: Record<string, any>;
  }): Promise<EcsFieldLog | null> {
    const record = {
      user_id: userId,
      expedition_id: params.expedition_id,
      type: params.type,
      title: params.title || null,
      body: params.body || null,
      lat: params.lat || null,
      lng: params.lng || null,
      occurred_at: now(),
      meta: params.meta || null,
    };

    const { data, error } = await supabase
      .from('ecs_field_logs')
      .insert(record)
      .select()
      .single();

    let result: EcsFieldLog;
    if (error || !data) {
      result = {
        id: uuid(),
        ...record,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        version: 1,
      } as EcsFieldLog;
      const cached = cacheGet<EcsFieldLog[]>(`fieldlogs_${params.expedition_id}`) || [];
      cached.unshift(result);
      cacheSet(`fieldlogs_${params.expedition_id}`, cached);
    } else {
      result = data as EcsFieldLog;
    }

    queueFieldLogAction('field_log_create', {
      logId: result.id,
      expeditionId: params.expedition_id,
      type: params.type,
      title: params.title,
      body: params.body,
      lat: params.lat,
      lng: params.lng,
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


