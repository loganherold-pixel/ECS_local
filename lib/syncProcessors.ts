/**
 * Sync Action Processors — Handles replaying queued actions via edge function
 *
 * Registers processors for each action type category that call the `sync-actions`
 * edge function with conflict detection, idempotency checks, and error handling.
 *
 * Error Recovery:
 * - hasLocalUserSentinel() catches 'local' user IDs before they reach the edge function
 * - isUnrecoverableUuidError() detects UUID parse errors in responses and returns true
 *   (marking the action as completed) instead of rethrowing, preventing retry loops
 * - The queue-level error recovery in syncActionQueue.ts provides a second safety net
 *
 * Categories: expedition, checklist, field_log, waypoint, loadout, route, dashboard
 */
import { supabase, isSupabaseConfigured } from './supabase';
import {
  syncActionQueue,
  type SyncAction,
  type SyncActionType,
} from './syncActionQueue';

// ── Types for edge function response ──────────────────────

interface SyncActionResult {
  actionId: string;
  status: 'completed' | 'conflict' | 'error' | 'idempotent';
  conflictType?: string;
  conflictDetail?: string;
  errorMessage?: string;
  serverEntityVersion?: number;
}

interface SyncBatchResponse {
  results: SyncActionResult[];
  summary: {
    total: number;
    completed: number;
    conflicts: number;
    errors: number;
    idempotent: number;
  };
}

// ── Edge function caller ──────────────────────────────────

/**
 * Check if a payload contains "local" as a user ID value.
 * If so, the action should NOT be sent to the edge function because
 * "local" is not a valid UUID and will cause a DB error.
 */
function hasLocalUserSentinel(action: SyncAction): boolean {
  const p = action.payload;
  if (!p) return false;

  // Check common user ID field names used across stores
  const userFields = ['userId', 'user_id', 'owner_user_id', 'ownerUserId'];
  for (const field of userFields) {
    const val = p[field];
    if (val === 'local' || val === 'anonymous' || val === 'offline') return true;
  }

  // Also check nested objects (e.g., payload.changes.owner_user_id)
  if (p.changes && typeof p.changes === 'object') {
    for (const field of userFields) {
      if ((p.changes as any)[field] === 'local') return true;
    }
  }

  // Check payload.data, payload.record, payload.item
  for (const key of ['data', 'record', 'item']) {
    const nested = p[key];
    if (nested && typeof nested === 'object') {
      for (const field of userFields) {
        if ((nested as any)[field] === 'local') return true;
      }
    }
  }

  return false;
}

/**
 * Detect error messages that indicate an invalid UUID was sent to the database.
 * These errors are deterministic — retrying will always produce the same error.
 * The processor should return `true` to mark the action as completed (skipped)
 * rather than rethrowing, which would cause the queue to retry indefinitely.
 */
const UUID_ERROR_PATTERNS = [
  'invalid input syntax for type uuid',
  'invalid input syntax for uuid',
  'not a valid uuid',
  'violates foreign key constraint',
  'violates row-level security policy',
];

function isUnrecoverableUuidError(errorMsg: string): boolean {
  if (!errorMsg) return false;
  const lower = errorMsg.toLowerCase();
  return UUID_ERROR_PATTERNS.some(pattern => lower.includes(pattern));
}

async function callSyncEdgeFunction(action: SyncAction): Promise<SyncActionResult> {
  if (!isSupabaseConfigured) {
    // No Supabase — treat as completed (local-only mode)
    return { actionId: action.id, status: 'completed' };
  }

  // Guard: skip actions with "local" user sentinel to prevent UUID parse errors
  if (hasLocalUserSentinel(action)) {
    console.warn(
      `[SyncProcessor] Skipping action ${action.id} (type: ${action.type}) — ` +
      `payload contains "local" as user ID (not a valid UUID). ` +
      `This action will be auto-completed without syncing.`
    );
    return { actionId: action.id, status: 'completed' };
  }

  const { data, error } = await supabase.functions.invoke('sync-actions', {
    body: {
      actions: [{
        id: action.id,
        type: action.type,
        payload: action.payload,
        priority: action.priority,
        createdAt: action.createdAt,
      }],
      userId: action.payload.userId || action.payload.user_id || null,
    },
  });

  if (error) {
    throw new Error(error.message || 'Edge function invocation failed');
  }

  const response = data as SyncBatchResponse;
  if (!response?.results?.length) {
    throw new Error('Empty response from sync-actions');
  }

  return response.results[0];
}


// ── Generic processor factory ─────────────────────────────

function createProcessor(category: string) {
  return async (action: SyncAction): Promise<boolean> => {
    try {
      const result = await callSyncEdgeFunction(action);

      switch (result.status) {
        case 'completed':
        case 'idempotent':
          // Success — action was processed or already existed
          console.log(`[SyncProcessor:${category}] ${action.id} → ${result.status}`);
          return true;

        case 'conflict':
          // Conflict detected — log details and mark as failed with conflict info
          console.warn(
            `[SyncProcessor:${category}] CONFLICT on ${action.id}: ` +
            `${result.conflictType} — ${result.conflictDetail}`
          );
          action.lastError = `Conflict: ${result.conflictType} — ${result.conflictDetail}`;
          // Return true to remove from queue (conflict is not retryable)
          return true;

        case 'error':
          // Check if the server error is a UUID-related error (unrecoverable)
          if (result.errorMessage && isUnrecoverableUuidError(result.errorMessage)) {
            console.error(
              `[SyncProcessor:${category}] UNRECOVERABLE UUID ERROR on ${action.id}: ` +
              `${result.errorMessage}. Action auto-completed to prevent retry loop.`
            );
            action.lastError = `Auto-skipped (UUID error): ${result.errorMessage}`;
            return true; // Mark as completed — retrying will never fix a malformed UUID
          }

          console.error(
            `[SyncProcessor:${category}] ERROR on ${action.id}: ${result.errorMessage}`
          );
          throw new Error(result.errorMessage || 'Server processing error');

        default:
          return true;
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error';

      // ── Error Recovery: catch UUID errors at the processor level ──
      // If the edge function threw (or the error propagated from the 'error'
      // case above) and the error message indicates a UUID parse failure,
      // return true to mark the action as completed. This prevents the queue
      // from retrying an action that will always fail with the same error.
      if (isUnrecoverableUuidError(errorMsg)) {
        console.error(
          `[SyncProcessor:${category}] UNRECOVERABLE UUID EXCEPTION on ${action.id}: ` +
          `${errorMsg}. Action auto-completed to prevent retry loop.`
        );
        action.lastError = `Auto-skipped (UUID exception): ${errorMsg}`;
        return true;
      }

      console.error(`[SyncProcessor:${category}] Exception processing ${action.id}:`, errorMsg);
      throw err; // Let the queue handle retry logic for recoverable errors
    }
  };
}


// ── All action types grouped by category ──────────────────

const EXPEDITION_TYPES: SyncActionType[] = [
  'expedition_create', 'expedition_update', 'expedition_delete',
  'expedition_activate', 'expedition_complete', 'expedition_archive',
  'expedition_readiness_update',
];

const CHECKLIST_TYPES: SyncActionType[] = [
  'checklist_add', 'checklist_toggle', 'checklist_remove', 'checklist_generate',
];

const FIELD_LOG_TYPES: SyncActionType[] = [
  'field_log_create', 'field_log_remove',
];

const WAYPOINT_TYPES: SyncActionType[] = [
  'waypoint_create', 'waypoint_delete', 'waypoint_change',
];

const LOADOUT_TYPES: SyncActionType[] = [
  'loadout_create', 'loadout_update', 'loadout_delete', 'loadout_duplicate',
  'loadout_item_create', 'loadout_item_update', 'loadout_item_delete',
  'loadout_sync', 'loadout_change',
];

const ROUTE_TYPES: SyncActionType[] = [
  'route_command_create', 'route_command_update',
  'route_import', 'route_set_active', 'route_deactivate_all',
  'route_delete', 'route_update',
  'route_waypoint_rename', 'route_waypoint_type', 'route_waypoint_bulk_type',
  'route_waypoint_delete', 'route_waypoint_reorder', 'route_waypoint_add',
  'route_change',
];

const DASHBOARD_TYPES: SyncActionType[] = [
  'dashboard_layout_change', 'dashboard_widget_assign', 'dashboard_widget_remove',
  'dashboard_widget_resize', 'dashboard_widget_swap',
  'dashboard_preset_save', 'dashboard_preset_delete', 'dashboard_preset_apply',
  'dashboard_settings_change',
];

const OTHER_TYPES: SyncActionType[] = [
  'vehicle_config_change', 'user_settings_change', 'generic_sync',
];

// ── Register all processors ───────────────────────────────

export function initializeSyncProcessors(): void {
  const expeditionProcessor = createProcessor('expedition');
  for (const type of EXPEDITION_TYPES) {
    syncActionQueue.registerProcessor(type, expeditionProcessor);
  }

  const checklistProcessor = createProcessor('checklist');
  for (const type of CHECKLIST_TYPES) {
    syncActionQueue.registerProcessor(type, checklistProcessor);
  }

  const fieldLogProcessor = createProcessor('field_log');
  for (const type of FIELD_LOG_TYPES) {
    syncActionQueue.registerProcessor(type, fieldLogProcessor);
  }

  const waypointProcessor = createProcessor('waypoint');
  for (const type of WAYPOINT_TYPES) {
    syncActionQueue.registerProcessor(type, waypointProcessor);
  }

  const loadoutProcessor = createProcessor('loadout');
  for (const type of LOADOUT_TYPES) {
    syncActionQueue.registerProcessor(type, loadoutProcessor);
  }

  const routeProcessor = createProcessor('route');
  for (const type of ROUTE_TYPES) {
    syncActionQueue.registerProcessor(type, routeProcessor);
  }

  const dashboardProcessor = createProcessor('dashboard');
  for (const type of DASHBOARD_TYPES) {
    syncActionQueue.registerProcessor(type, dashboardProcessor);
  }

  const otherProcessor = createProcessor('other');
  for (const type of OTHER_TYPES) {
    syncActionQueue.registerProcessor(type, otherProcessor);
  }

  // Start auto-processing on connectivity changes
  syncActionQueue.startAutoProcess();

  console.log('[SyncProcessors] All processors registered and auto-process started');
}

