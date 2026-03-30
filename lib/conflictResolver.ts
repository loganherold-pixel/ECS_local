/**
 * ConflictResolver — Offline Action Queue Conflict Detection & Resolution
 *
 * Detects when two or more queued offline mutations target the same entity
 * (e.g., two updates to the same expedition or loadout). During replay,
 * conflicting actions are intercepted and presented to the user for
 * resolution via the ConflictResolutionSheet UI.
 *
 * Architecture:
 * - Entity key extraction: maps action type + payload to a unique entity key
 * - Grouping: clusters queued actions by entity key
 * - Field-level diff: compares payload fields across conflicting actions
 * - Resolution strategies: keep-first, keep-last, auto-merge, manual merge
 * - Merged action production: creates a single action from resolved conflicts
 *
 * Integrates with:
 * - syncActionQueue.ts — hooks into processQueue to intercept conflicts
 * - ConflictResolutionSheet.tsx — UI for manual conflict resolution
 * - SyncQueueIndicator.tsx — badge count for pending conflicts
 * - conflictStore.ts — existing sync conflict infrastructure (complementary)
 */

import { Platform } from 'react-native';
import type { SyncAction, SyncActionType } from './syncActionQueue';

// ── Types ─────────────────────────────────────────────────────

/** Unique key identifying an entity across the queue */
export type EntityKey = string;

/** A single field-level difference between two action payloads */
export interface FieldDiff {
  /** Field path (e.g., 'name', 'updates.terrain_type') */
  field: string;
  /** Human-readable label */
  label: string;
  /** Value from the earlier action */
  valueA: any;
  /** Value from the later action */
  valueB: any;
  /** Which version to keep: 'a' (earlier), 'b' (later), or 'manual' */
  resolution: 'a' | 'b' | 'manual';
  /** Manually entered merged value (when resolution === 'manual') */
  manualValue?: any;
}

/** A detected conflict between two or more actions on the same entity */
export interface QueueConflict {
  /** Unique conflict ID */
  id: string;
  /** Entity key (e.g., 'expedition:abc123') */
  entityKey: EntityKey;
  /** Entity type label for display (e.g., 'Expedition', 'Loadout') */
  entityType: string;
  /** Entity display name (extracted from payload) */
  entityName: string;
  /** The earlier action (first in queue order) */
  actionA: SyncAction;
  /** The later action (second in queue order) */
  actionB: SyncAction;
  /** Field-level diffs between the two actions */
  diffs: FieldDiff[];
  /** Fields that only exist in action A (no conflict) */
  uniqueToA: string[];
  /** Fields that only exist in action B (no conflict) */
  uniqueToB: string[];
  /** Whether this conflict can be auto-merged (no overlapping fields) */
  canAutoMerge: boolean;
  /** Conflict status */
  status: 'pending' | 'resolved' | 'auto_merged' | 'discarded';
  /** Timestamp of detection */
  detectedAt: string;
}

/** Resolution result for a single conflict */
export interface ConflictResolution {
  conflictId: string;
  /** The merged action that replaces both conflicting actions */
  mergedAction: SyncAction;
  /** IDs of the original actions to remove from the queue */
  replacedActionIds: string[];
  /** Strategy used */
  strategy: 'keep_first' | 'keep_last' | 'auto_merge' | 'manual_merge';
}

/** Listener for conflict state changes */
type ConflictChangeListener = (conflicts: QueueConflict[]) => void;

// ── Entity Key Extraction ─────────────────────────────────────

/** Maps action types to the payload field that holds the entity ID */
const ENTITY_ID_FIELDS: Record<string, string> = {
  // Expeditions
  expedition_create: 'expeditionId',
  expedition_update: 'expeditionId',
  expedition_delete: 'expeditionId',
  expedition_activate: 'expeditionId',
  expedition_complete: 'expeditionId',
  expedition_archive: 'expeditionId',
  expedition_readiness_update: 'expeditionId',
  // Checklists (belong to expeditions)
  checklist_add: 'expeditionId',
  checklist_toggle: 'expeditionId',
  checklist_remove: 'expeditionId',
  checklist_generate: 'expeditionId',
  // Field logs
  field_log_create: 'expeditionId',
  field_log_remove: 'expeditionId',
  // Waypoints
  waypoint_create: 'waypointId',
  waypoint_delete: 'waypointId',
  waypoint_change: 'waypointId',
  // Loadouts
  loadout_create: 'loadoutId',
  loadout_update: 'loadoutId',
  loadout_delete: 'loadoutId',
  loadout_duplicate: 'loadoutId',
  loadout_item_create: 'loadoutId',
  loadout_item_update: 'loadoutId',
  loadout_item_delete: 'loadoutId',
  loadout_sync: 'loadoutId',
  loadout_change: 'loadoutId',
  // Routes
  route_command_create: 'routeId',
  route_command_update: 'routeId',
  route_import: 'routeId',
  route_set_active: 'routeId',
  route_deactivate_all: '_global_routes',
  route_delete: 'routeId',
  route_update: 'routeId',
  route_waypoint_rename: 'routeId',
  route_waypoint_type: 'routeId',
  route_waypoint_bulk_type: 'routeId',
  route_waypoint_delete: 'routeId',
  route_waypoint_reorder: 'routeId',
  route_waypoint_add: 'routeId',
  route_change: 'routeId',
  // Dashboard
  dashboard_layout_change: 'presetId',
  dashboard_widget_assign: 'presetId',
  dashboard_widget_remove: 'presetId',
  dashboard_widget_resize: 'presetId',
  dashboard_widget_swap: 'presetId',
  dashboard_preset_save: 'presetId',
  dashboard_preset_delete: 'presetId',
  dashboard_preset_apply: 'presetId',
  dashboard_settings_change: '_global_dashboard_settings',
  // Other
  vehicle_config_change: 'vehicleId',
  user_settings_change: 'userId',
  generic_sync: 'entityId',
};

/** Entity type category labels */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  expedition: 'Expedition',
  checklist: 'Checklist',
  field_log: 'Field Log',
  waypoint: 'Waypoint',
  loadout: 'Loadout',
  route: 'Route',
  dashboard: 'Dashboard',
  vehicle_config: 'Vehicle Config',
  user_settings: 'User Settings',
  generic: 'General',
};

/** Action types that represent "update" operations (can conflict with each other) */
const UPDATE_ACTION_TYPES = new Set<string>([
  'expedition_update',
  'expedition_readiness_update',
  'loadout_update',
  'loadout_item_update',
  'loadout_change',
  'route_update',
  'route_command_update',
  'route_waypoint_rename',
  'route_waypoint_type',
  'route_waypoint_bulk_type',
  'route_waypoint_reorder',
  'route_change',
  'dashboard_layout_change',
  'dashboard_widget_assign',
  'dashboard_widget_remove',
  'dashboard_widget_resize',
  'dashboard_widget_swap',
  'dashboard_settings_change',
  'vehicle_config_change',
  'user_settings_change',
  'waypoint_change',
]);

/** Action types that represent "delete" operations (supersede updates) */
const DELETE_ACTION_TYPES = new Set<string>([
  'expedition_delete',
  'loadout_delete',
  'loadout_item_delete',
  'route_delete',
  'route_waypoint_delete',
  'waypoint_delete',
  'dashboard_preset_delete',
  'field_log_remove',
  'checklist_remove',
]);

/** Fields to ignore in diff comparisons (metadata, not user data) */
const DIFF_IGNORE_FIELDS = new Set([
  'userId', 'user_id', 'owner_user_id',
  'expeditionId', 'loadoutId', 'routeId', 'waypointId', 'vehicleId', 'presetId',
  'entityId', 'id', 'createdAt', 'created_at',
]);

/** Human-readable field labels */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  status: 'Status',
  start_date: 'Start Date',
  end_date: 'End Date',
  terrain_type: 'Terrain Type',
  season: 'Season',
  team_size: 'Team Size',
  primary_vehicle: 'Primary Vehicle',
  route_distance_miles: 'Route Distance',
  avg_miles_per_day: 'Avg Miles/Day',
  active_mode: 'Active Mode',
  capac_fuel_gal: 'Fuel Capacity',
  capac_mpg: 'MPG',
  capac_water_gal: 'Water Capacity',
  water_use_per_person_day: 'Water Use/Day',
  battery_usable_wh: 'Battery (Wh)',
  solar_watts: 'Solar (W)',
  sun_hours_per_day: 'Sun Hours/Day',
  solar_efficiency: 'Solar Efficiency',
  emergency_contact: 'Emergency Contact',
  weight_lbs: 'Weight (lbs)',
  qty: 'Quantity',
  packed: 'Packed',
  zone: 'Zone',
  notes: 'Notes',
  sort_order: 'Sort Order',
  score: 'Score',
  terrain_complexity: 'Terrain Complexity',
  weather_exposure: 'Weather Exposure',
  remoteness: 'Remoteness',
  recovery_availability: 'Recovery Availability',
  comms_coverage: 'Comms Coverage',
  activatedAt: 'Activated At',
  completedAt: 'Completed At',
  changes: 'Changes',
  updates: 'Updates',
};

// ── Utility Functions ─────────────────────────────────────────

function generateConflictId(): string {
  return `qc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Extract the entity key from a sync action.
 * Returns a string like "expedition:abc123" or "loadout:xyz789".
 */
function extractEntityKey(action: SyncAction): EntityKey | null {
  const idField = ENTITY_ID_FIELDS[action.type];
  if (!idField) return null;

  // Special global keys
  if (idField.startsWith('_global_')) {
    return idField;
  }

  const entityId = action.payload?.[idField];
  if (!entityId) return null;

  // Derive entity type from action type prefix
  const typePrefix = action.type.split('_')[0];
  return `${typePrefix}:${entityId}`;
}

/**
 * Get the entity type label from an entity key.
 */
function getEntityTypeFromKey(entityKey: EntityKey): string {
  if (entityKey.startsWith('_global_')) {
    return entityKey.replace('_global_', '').replace(/_/g, ' ');
  }
  const prefix = entityKey.split(':')[0];
  return ENTITY_TYPE_LABELS[prefix] || prefix;
}

/**
 * Extract a display name for the entity from the action payload.
 */
function extractEntityName(action: SyncAction): string {
  const p = action.payload;
  if (!p) return 'Unknown';

  // Try common name fields
  if (p.name) return p.name;
  if (p.updates?.name) return p.updates.name;
  if (p.changes?.name) return p.changes.name;

  // Try entity ID fields
  for (const field of ['expeditionId', 'loadoutId', 'routeId', 'waypointId', 'vehicleId', 'presetId']) {
    if (p[field]) return String(p[field]).slice(0, 12) + '...';
  }

  return action.description?.slice(0, 30) || 'Unknown';
}

/**
 * Extract the "changes" or "updates" object from an action payload.
 * This is the object that contains the actual field mutations.
 */
function extractMutableFields(action: SyncAction): Record<string, any> {
  const p = action.payload;
  if (!p) return {};

  // Most actions use 'updates' or 'changes' for the mutation payload
  if (p.updates && typeof p.updates === 'object') return { ...p.updates };
  if (p.changes && typeof p.changes === 'object') return { ...p.changes };

  // For some actions, the payload itself contains the fields
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(p)) {
    if (!DIFF_IGNORE_FIELDS.has(key) && typeof value !== 'object') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Get a human-readable label for a field name.
 */
function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normalize a value for comparison.
 */
function normalizeForCompare(val: any): string {
  if (val === null || val === undefined) return '<null>';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── localStorage Persistence ──────────────────────────────────

const CONFLICTS_STORAGE_KEY = 'ecs_queue_conflicts';

function loadConflictsFromStorage(): QueueConflict[] {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CONFLICTS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function saveConflictsToStorage(conflicts: QueueConflict[]): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(CONFLICTS_STORAGE_KEY, JSON.stringify(conflicts));
    }
  } catch {}
}

// ── ConflictResolver Class ────────────────────────────────────

class ConflictResolver {
  private _conflicts: QueueConflict[] = [];
  private _listeners = new Set<ConflictChangeListener>();

  constructor() {
    this._conflicts = loadConflictsFromStorage();
  }

  // ── Public Getters ──────────────────────────────────────────

  /** All detected conflicts */
  get conflicts(): QueueConflict[] {
    return [...this._conflicts];
  }

  /** Only pending (unresolved) conflicts */
  get pendingConflicts(): QueueConflict[] {
    return this._conflicts.filter(c => c.status === 'pending');
  }

  /** Number of pending conflicts */
  get pendingCount(): number {
    return this._conflicts.filter(c => c.status === 'pending').length;
  }

  /** Whether there are any pending conflicts blocking replay */
  get hasBlockingConflicts(): boolean {
    return this.pendingCount > 0;
  }

  // ── Conflict Detection ──────────────────────────────────────

  /**
   * Scan a list of queued actions and detect conflicts.
   * Groups actions by entity key, then compares update-type actions
   * within each group for field-level overlaps.
   *
   * @param actions - The current sync action queue
   * @returns Array of newly detected conflicts
   */
  detectConflicts(actions: SyncAction[]): QueueConflict[] {
    // Only look at pending/retrying actions
    const pending = actions.filter(
      a => a.status === 'pending' || a.status === 'retrying'
    );

    // Group by entity key
    const groups = new Map<EntityKey, SyncAction[]>();
    for (const action of pending) {
      const key = extractEntityKey(action);
      if (!key) continue;

      const group = groups.get(key) || [];
      group.push(action);
      groups.set(key, group);
    }

    const newConflicts: QueueConflict[] = [];

    // For each entity group, detect conflicts between update-type actions
    for (const [entityKey, group] of groups) {
      if (group.length < 2) continue;

      // Filter to update-type actions only
      const updates = group.filter(a => UPDATE_ACTION_TYPES.has(a.type));
      if (updates.length < 2) continue;

      // Check if a delete action exists — if so, it supersedes all updates
      const hasDelete = group.some(a => DELETE_ACTION_TYPES.has(a.type));
      if (hasDelete) continue; // Delete wins, no conflict to resolve

      // Skip if we already have a pending conflict for this entity key
      const existingConflict = this._conflicts.find(
        c => c.entityKey === entityKey && c.status === 'pending'
      );
      if (existingConflict) continue;

      // Compare consecutive pairs of update actions
      for (let i = 0; i < updates.length - 1; i++) {
        const actionA = updates[i];
        const actionB = updates[i + 1];

        // Already have a conflict for this pair?
        const pairExists = this._conflicts.some(
          c => c.status === 'pending' &&
               ((c.actionA.id === actionA.id && c.actionB.id === actionB.id) ||
                (c.actionA.id === actionB.id && c.actionB.id === actionA.id))
        );
        if (pairExists) continue;

        const conflict = this._compareActions(entityKey, actionA, actionB);
        if (conflict) {
          newConflicts.push(conflict);
        }
      }
    }

    if (newConflicts.length > 0) {
      this._conflicts.push(...newConflicts);
      this._save();
      this._notify();
    }

    return newConflicts;
  }

  /**
   * Compare two actions targeting the same entity and produce a conflict
   * if they have overlapping field changes with different values.
   */
  private _compareActions(
    entityKey: EntityKey,
    actionA: SyncAction,
    actionB: SyncAction,
  ): QueueConflict | null {
    const fieldsA = extractMutableFields(actionA);
    const fieldsB = extractMutableFields(actionB);

    const allKeys = new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)]);
    const diffs: FieldDiff[] = [];
    const uniqueToA: string[] = [];
    const uniqueToB: string[] = [];

    for (const key of allKeys) {
      if (DIFF_IGNORE_FIELDS.has(key)) continue;

      const hasA = key in fieldsA;
      const hasB = key in fieldsB;

      if (hasA && !hasB) {
        uniqueToA.push(key);
        continue;
      }
      if (!hasA && hasB) {
        uniqueToB.push(key);
        continue;
      }

      // Both have this field — check if values differ
      const normA = normalizeForCompare(fieldsA[key]);
      const normB = normalizeForCompare(fieldsB[key]);

      if (normA !== normB) {
        diffs.push({
          field: key,
          label: getFieldLabel(key),
          valueA: fieldsA[key],
          valueB: fieldsB[key],
          resolution: 'b', // Default: keep later version
        });
      }
    }

    // No overlapping field differences — can auto-merge
    if (diffs.length === 0) {
      return null; // No conflict: either identical or non-overlapping
    }

    const canAutoMerge = false; // Has overlapping diffs, needs resolution

    return {
      id: generateConflictId(),
      entityKey,
      entityType: getEntityTypeFromKey(entityKey),
      entityName: extractEntityName(actionA) || extractEntityName(actionB),
      actionA,
      actionB,
      diffs,
      uniqueToA,
      uniqueToB,
      canAutoMerge,
      status: 'pending',
      detectedAt: new Date().toISOString(),
    };
  }

  // ── Resolution ──────────────────────────────────────────────

  /**
   * Resolve a conflict by merging the two actions into one.
   * Uses the per-field resolutions set by the user.
   *
   * @param conflictId - The conflict to resolve
   * @returns The resolution result, or null if conflict not found
   */
  resolveConflict(conflictId: string): ConflictResolution | null {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return null;

    const mergedPayload = this._buildMergedPayload(conflict);
    const strategy = this._determineStrategy(conflict);

    // Create merged action based on the later action (B) as the base
    const mergedAction: SyncAction = {
      ...conflict.actionB,
      id: `merged_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      payload: mergedPayload,
      description: `[Merged] ${conflict.actionB.description}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      lastError: undefined,
    };

    conflict.status = 'resolved';
    this._save();
    this._notify();

    return {
      conflictId,
      mergedAction,
      replacedActionIds: [conflict.actionA.id, conflict.actionB.id],
      strategy,
    };
  }

  /**
   * Resolve a conflict by keeping only the first (earlier) action.
   */
  resolveKeepFirst(conflictId: string): ConflictResolution | null {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return null;

    conflict.status = 'resolved';
    this._save();
    this._notify();

    return {
      conflictId,
      mergedAction: { ...conflict.actionA },
      replacedActionIds: [conflict.actionA.id, conflict.actionB.id],
      strategy: 'keep_first',
    };
  }

  /**
   * Resolve a conflict by keeping only the last (later) action.
   */
  resolveKeepLast(conflictId: string): ConflictResolution | null {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return null;

    conflict.status = 'resolved';
    this._save();
    this._notify();

    return {
      conflictId,
      mergedAction: { ...conflict.actionB },
      replacedActionIds: [conflict.actionA.id, conflict.actionB.id],
      strategy: 'keep_last',
    };
  }

  /**
   * Auto-merge a conflict where fields don't overlap (combine both).
   */
  autoMerge(conflictId: string): ConflictResolution | null {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return null;

    // Set all diffs to keep B (later) by default for auto-merge
    for (const diff of conflict.diffs) {
      diff.resolution = 'b';
    }

    const mergedPayload = this._buildMergedPayload(conflict);

    const mergedAction: SyncAction = {
      ...conflict.actionB,
      id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      payload: mergedPayload,
      description: `[Auto-merged] ${conflict.actionB.description}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      lastError: undefined,
    };

    conflict.status = 'auto_merged';
    this._save();
    this._notify();

    return {
      conflictId,
      mergedAction,
      replacedActionIds: [conflict.actionA.id, conflict.actionB.id],
      strategy: 'auto_merge',
    };
  }

  /**
   * Discard a conflict (keep both actions as-is, replay sequentially).
   */
  discardConflict(conflictId: string): void {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    conflict.status = 'discarded';
    this._save();
    this._notify();
  }

  /**
   * Update the resolution for a specific field in a conflict.
   */
  setFieldResolution(
    conflictId: string,
    fieldName: string,
    resolution: 'a' | 'b' | 'manual',
    manualValue?: any,
  ): void {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    const diff = conflict.diffs.find(d => d.field === fieldName);
    if (!diff) return;

    diff.resolution = resolution;
    if (resolution === 'manual' && manualValue !== undefined) {
      diff.manualValue = manualValue;
    }

    this._save();
    this._notify();
  }

  /**
   * Set all fields in a conflict to the same resolution.
   */
  setAllFieldResolutions(conflictId: string, resolution: 'a' | 'b'): void {
    const conflict = this._conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    for (const diff of conflict.diffs) {
      diff.resolution = resolution;
    }

    this._save();
    this._notify();
  }

  // ── Cleanup ─────────────────────────────────────────────────

  /**
   * Remove resolved/discarded conflicts older than the given age.
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    this._conflicts = this._conflicts.filter(c => {
      if (c.status === 'pending') return true; // Never auto-remove pending
      return new Date(c.detectedAt).getTime() > cutoff;
    });
    this._save();
    this._notify();
  }

  /**
   * Clear all conflicts.
   */
  clearAll(): void {
    this._conflicts = [];
    this._save();
    this._notify();
  }

  /**
   * Remove conflicts that reference action IDs no longer in the queue.
   * Called after queue processing to clean up stale conflicts.
   */
  pruneStaleConflicts(currentActionIds: Set<string>): number {
    const before = this._conflicts.length;
    this._conflicts = this._conflicts.filter(c => {
      if (c.status !== 'pending') return true; // Keep resolved for history
      // Remove if neither action exists in the queue anymore
      return currentActionIds.has(c.actionA.id) || currentActionIds.has(c.actionB.id);
    });
    const pruned = before - this._conflicts.length;
    if (pruned > 0) {
      this._save();
      this._notify();
    }
    return pruned;
  }

  // ── Listeners ───────────────────────────────────────────────

  /** Subscribe to conflict changes */
  onChange(listener: ConflictChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Private Methods ─────────────────────────────────────────

  /**
   * Build a merged payload from a conflict's field resolutions.
   */
  private _buildMergedPayload(conflict: QueueConflict): Record<string, any> {
    const payloadA = { ...conflict.actionA.payload };
    const payloadB = { ...conflict.actionB.payload };

    // Start with B (later action) as base
    const merged = { ...payloadB };

    // Get the mutable fields containers
    const updatesKeyA = payloadA.updates ? 'updates' : payloadA.changes ? 'changes' : null;
    const updatesKeyB = payloadB.updates ? 'updates' : payloadB.changes ? 'changes' : null;

    if (updatesKeyA || updatesKeyB) {
      const key = updatesKeyB || updatesKeyA || 'updates';
      const fieldsA = updatesKeyA ? { ...payloadA[updatesKeyA] } : {};
      const fieldsB = updatesKeyB ? { ...payloadB[updatesKeyB] } : {};

      // Start with all fields from both
      const mergedFields = { ...fieldsA, ...fieldsB };

      // Apply per-field resolutions
      for (const diff of conflict.diffs) {
        if (diff.resolution === 'a') {
          mergedFields[diff.field] = diff.valueA;
        } else if (diff.resolution === 'b') {
          mergedFields[diff.field] = diff.valueB;
        } else if (diff.resolution === 'manual' && diff.manualValue !== undefined) {
          mergedFields[diff.field] = diff.manualValue;
        }
      }

      // Include unique fields from A
      for (const field of conflict.uniqueToA) {
        if (!(field in mergedFields) && field in fieldsA) {
          mergedFields[field] = fieldsA[field];
        }
      }

      merged[key] = mergedFields;
    } else {
      // Flat payload — apply resolutions directly
      for (const diff of conflict.diffs) {
        if (diff.resolution === 'a') {
          merged[diff.field] = diff.valueA;
        } else if (diff.resolution === 'b') {
          merged[diff.field] = diff.valueB;
        } else if (diff.resolution === 'manual' && diff.manualValue !== undefined) {
          merged[diff.field] = diff.manualValue;
        }
      }
    }

    return merged;
  }

  /**
   * Determine the overall merge strategy from field resolutions.
   */
  private _determineStrategy(
    conflict: QueueConflict,
  ): 'keep_first' | 'keep_last' | 'auto_merge' | 'manual_merge' {
    const allA = conflict.diffs.every(d => d.resolution === 'a');
    const allB = conflict.diffs.every(d => d.resolution === 'b');
    if (allA) return 'keep_first';
    if (allB) return 'keep_last';
    return 'manual_merge';
  }

  private _save(): void {
    saveConflictsToStorage(this._conflicts);
  }

  private _notify(): void {
    const snapshot = [...this._conflicts];
    this._listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (e) {
        console.warn('[ConflictResolver] Listener error:', e);
      }
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const conflictResolver = new ConflictResolver();

