// ============================================================
// EXPEDITION TEMPLATE STORE — Offline-First Template Persistence
// ============================================================
// Provides:
//   1. Template CRUD (create, read, update, delete, duplicate)
//   2. Local caching for offline access
//   3. Cloud sync via manage-templates edge function
//   4. Builder state restoration from template
//   5. Sync queue integration via templateSyncEngine
// ============================================================

import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { templateSyncEngine } from './templateSyncEngine';
import type { BuilderStepState, CachedZone } from './expeditionCache';

const TAG = '[TEMPLATE_STORE]';
const TIMEOUT_MS = 8000;

// ── Helper: check if userId is valid for cloud sync ─────
function isSyncableUserId(userId?: string | null): userId is string {
  return !!userId && userId !== 'local' && userId.length > 8;
}


// ── Types ────────────────────────────────────────────────────

export interface ExpeditionTemplate {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  vehicle_id: string | null;
  vehicle_name: string | null;
  framework_type: string | null;
  zone_count: number;
  loadout_id: string | null;
  loadout_name: string | null;
  loadout_mode: string;
  operating_profile: string | null;
  people_count: number;
  trip_length_days: number | null;
  builder_state: Partial<BuilderStepState>;
  zones_snapshot: CachedZone[];
  items_snapshot: TemplateItem[];
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateItem {
  name: string;
  category: string;
  quantity: number;
  is_critical: boolean;
  storage_location: string | null;
  notes: string | null;
  weight_lbs: number | null;
  sort_order: number;
}

export interface TemplateCreatePayload {
  name: string;
  description?: string | null;
  vehicle_id?: string | null;
  vehicle_name?: string | null;
  framework_type?: string | null;
  zone_count?: number;
  loadout_id?: string | null;
  loadout_name?: string | null;
  loadout_mode?: string;
  operating_profile?: string | null;
  people_count?: number;
  trip_length_days?: number | null;
  builder_state?: Partial<BuilderStepState>;
  zones_snapshot?: CachedZone[];
  items_snapshot?: TemplateItem[];
}

// ── Local storage helpers ────────────────────────────────────

const memoryStore: Record<string, string> = {};
const LS_KEY = 'ecs_expedition_templates';

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getLocalTemplates(): ExpeditionTemplate[] {
  try {
    const raw = lsGet(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function saveLocalTemplates(templates: ExpeditionTemplate[]): void {
  lsSet(LS_KEY, JSON.stringify(templates));
}

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), ms);
    promise
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

// ── Template Store ───────────────────────────────────────────

export const templateStore = {
  /**
   * List all templates (cloud + local fallback)
   */
  list: async (userId?: string | null): Promise<ExpeditionTemplate[]> => {
    // Try cloud first — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'list' },
          })
        );

        if (!error && data?.templates) {
          const templates = data.templates as ExpeditionTemplate[];
          // Cache locally
          saveLocalTemplates(templates);
          // Mark all as synced
          templateSyncEngine.markAllSynced(templates.map(t => t.id));
          console.log(TAG, `Fetched ${templates.length} templates from cloud`);
          return templates;
        }
      } catch (e) {
        console.warn(TAG, 'Cloud list failed, using local cache:', e);
      }
    }

    // Fallback to local
    return getLocalTemplates();
  },

  /**
   * Get a single template by ID
   */
  getById: async (templateId: string, userId?: string | null): Promise<ExpeditionTemplate | null> => {
    // Check local first
    const local = getLocalTemplates().find(t => t.id === templateId);
    if (local) return local;

    // Try cloud — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'get', template_id: templateId },
          })
        );
        if (!error && data?.template) return data.template as ExpeditionTemplate;
      } catch {}
    }

    return null;
  },

  /**
   * Create a new template (saves locally + queues for cloud sync)
   */
  create: async (
    payload: TemplateCreatePayload,
    userId?: string | null
  ): Promise<ExpeditionTemplate | null> => {
    const now = new Date().toISOString();

    // Always create locally first for instant feedback
    const template: ExpeditionTemplate = {
      id: generateId(),
      owner_user_id: userId || 'local',
      name: payload.name,
      description: payload.description || null,
      vehicle_id: payload.vehicle_id || null,
      vehicle_name: payload.vehicle_name || null,
      framework_type: payload.framework_type || null,
      zone_count: payload.zone_count || 0,
      loadout_id: payload.loadout_id || null,
      loadout_name: payload.loadout_name || null,
      loadout_mode: payload.loadout_mode || 'trip',
      operating_profile: payload.operating_profile || null,
      people_count: payload.people_count || 1,
      trip_length_days: payload.trip_length_days || null,
      builder_state: payload.builder_state || {},
      zones_snapshot: payload.zones_snapshot || [],
      items_snapshot: payload.items_snapshot || [],
      use_count: 0,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };

    const locals = getLocalTemplates();
    locals.unshift(template);
    saveLocalTemplates(locals);
    console.log(TAG, `Template saved locally: ${template.name}`);

    // Queue for cloud sync — only if userId is a real syncable UUID

    if (isSyncableUserId(userId)) {
      templateSyncEngine.queueForSync(template.id, 'create', template);
    }

    // Try immediate cloud push — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'create', ...payload },
          })
        );

        if (!error && data?.template) {
          const cloudTemplate = data.template as ExpeditionTemplate;
          // Update local with cloud version (has server-generated fields)
          const idx = locals.findIndex(t => t.id === template.id);
          if (idx !== -1) {
            locals[idx] = cloudTemplate;
            saveLocalTemplates(locals);
          }
          templateSyncEngine.markSynced(cloudTemplate.id);
          console.log(TAG, `Template synced to cloud: ${cloudTemplate.name} (${cloudTemplate.id})`);
          return cloudTemplate;
        }
      } catch (e) {
        console.warn(TAG, 'Cloud create failed, queued for sync:', e);
      }
    }

    return template;
  },

  /**
   * Update (rename/edit description) — saves locally + queues for sync
   */
  update: async (
    templateId: string,
    updates: { name?: string; description?: string },
    userId?: string | null
  ): Promise<ExpeditionTemplate | null> => {
    // Update local
    const locals = getLocalTemplates();
    const idx = locals.findIndex(t => t.id === templateId);
    if (idx !== -1) {
      if (updates.name !== undefined) locals[idx].name = updates.name;
      if (updates.description !== undefined) locals[idx].description = updates.description;
      locals[idx].updated_at = new Date().toISOString();
      saveLocalTemplates(locals);

      // Queue for sync — only if userId is a real syncable UUID
      if (isSyncableUserId(userId)) {
        templateSyncEngine.queueForSync(templateId, 'update', locals[idx]);
      }
    }

    // Try cloud — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'update', template_id: templateId, updates },
          })
        );
        if (!error && data?.template) {
          // Update local cache with cloud response
          const template = data.template as ExpeditionTemplate;
          if (idx !== -1) {
            locals[idx] = template;
            saveLocalTemplates(locals);
          }
          templateSyncEngine.markSynced(templateId);
          return template;
        }
      } catch (e) {
        console.warn(TAG, 'Cloud update failed, queued for sync:', e);
      }
    }

    return idx !== -1 ? locals[idx] : null;
  },

  /**
   * Duplicate a template
   */
  duplicate: async (templateId: string, userId?: string | null): Promise<ExpeditionTemplate | null> => {
    // Try cloud — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'duplicate', template_id: templateId },
          })
        );
        if (!error && data?.template) {
          const template = data.template as ExpeditionTemplate;
          const locals = getLocalTemplates();
          locals.unshift(template);
          saveLocalTemplates(locals);
          templateSyncEngine.markSynced(template.id);
          return template;
        }
      } catch (e) {
        console.warn(TAG, 'Cloud duplicate failed:', e);
      }
    }

    // Local fallback
    const source = getLocalTemplates().find(t => t.id === templateId);
    if (!source) return null;

    const now = new Date().toISOString();
    const copy: ExpeditionTemplate = {
      ...source,
      id: generateId(),
      name: `${source.name} (Copy)`,
      use_count: 0,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };

    const locals = getLocalTemplates();
    locals.unshift(copy);
    saveLocalTemplates(locals);
    // Queue copy for sync — only if userId is a real syncable UUID
    if (isSyncableUserId(userId)) {
      templateSyncEngine.queueForSync(copy.id, 'create', copy);
    }


    return copy;
  },

  /**
   * Delete a template — removes locally + queues cloud delete
   */
  delete: async (templateId: string, userId?: string | null): Promise<boolean> => {
    // Remove locally
    const locals = getLocalTemplates().filter(t => t.id !== templateId);
    saveLocalTemplates(locals);

    // Remove from sync tracking
    templateSyncEngine.removeTracking(templateId);

    // Try cloud — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {
      try {
        await withTimeout(
          supabase.functions.invoke('manage-templates', {
            body: { action: 'delete', template_id: templateId },
          })
        );
      } catch (e) {
        console.warn(TAG, 'Cloud delete failed, queued for sync:', e);
        // Queue delete for later sync — safe because we already validated userId
        templateSyncEngine.queueForSync(templateId, 'delete');
      }
    }

    return true;

  },

  /**
   * Record template usage (increment use_count)
   */
  recordUse: async (templateId: string, userId?: string | null): Promise<void> => {
    // Update local
    const locals = getLocalTemplates();
    const idx = locals.findIndex(t => t.id === templateId);
    if (idx !== -1) {
      locals[idx].use_count = (locals[idx].use_count || 0) + 1;
      locals[idx].last_used_at = new Date().toISOString();
      saveLocalTemplates(locals);
    }

    // Try cloud — only if userId is a real syncable UUID
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        await supabase.functions.invoke('manage-templates', {
          body: { action: 'use', template_id: templateId },
        });
      } catch {}
    }
  },

  /**
   * Get all local templates (for sync engine)
   */
  getLocalTemplates,

  /**
   * Merge pulled templates from cloud into local store
   */
  mergeFromCloud: (pulledTemplates: ExpeditionTemplate[]): void => {
    if (!pulledTemplates || pulledTemplates.length === 0) return;

    const locals = getLocalTemplates();
    const localMap = new Map(locals.map(t => [t.id, t]));

    for (const cloud of pulledTemplates) {
      localMap.set(cloud.id, cloud);
    }

    const merged = Array.from(localMap.values());
    merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    saveLocalTemplates(merged);

    console.log(TAG, `Merged ${pulledTemplates.length} templates from cloud`);
  },
};

