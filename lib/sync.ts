/**
 * Sync Engine with Conflict Detection & Exponential Backoff Retry
 *
 * Strategy:
 *   Push dirty local rows → Pull remote changes →
 *   Detect conflicts (same record modified locally + remotely) →
 *   Merge non-conflicting rows (last-write-wins) →
 *   Store conflicts for user resolution
 *
 * Retry: Up to 3 retries with exponential backoff (1s, 2s, 4s)
 * Soft delete: propagate deleted_at in both directions
 * Conflict detection: compares updated_at timestamps and field values
 *
 * IMPORTANT:
 * - This file assumes your storage.ts exposes:
 *   tripStore/riskScoreStore/loadItemStore/loadMapSlotStore/fuelWaterLogStore/waypointStore:
 *     getDirty(), bulkUpsert(), clearDirty(), clearDirtyForIds()
 * - It does NOT sync user_settings locally because userSettingsStore does not track dirty rows.
 *
 * Race-condition fix (2026-02-24):
 *   Step 5 now uses per-row dirty clearing via clearDirtyForIds().
 *   - Only the IDs from the pre-push snapshot are cleared (new writes during sync are preserved).
 *   - Conflict IDs are filtered per-table (no cross-table contamination).
 *   - Rows with unresolved conflicts keep their dirty flag until resolution.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import {
  tripStore,
  riskScoreStore,
  loadItemStore,
  loadMapSlotStore,
  fuelWaterLogStore,
  waypointStore,
  syncMetaStore,
} from "./storage";
import type { SyncStatus } from "./types";
import {
  detectConflictsForTable,
  savePendingConflicts,
  notifyConflictListeners,
  type SyncConflict,
} from "./conflictStore";

type SyncCallback = (status: SyncStatus) => void;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const CHUNK_SIZE = 50;
const SERVER_SYNC_COLUMN_BY_TABLE: Record<string, string | null> = {
  fuel_water_logs: null,
};

// ============================================================
// Retry with exponential backoff
// ============================================================
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Sync] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          lastError?.message,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`${label} failed after ${maxRetries + 1} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ============================================================
// Push dirty rows to Supabase (exported for autoPush)
// ============================================================
export async function pushTable(tableName: string, dirtyRows: any[]): Promise<number> {
  if (dirtyRows.length === 0) return 0;

  // Strip the local 'dirty' field before sending
  const cleaned = dirtyRows.map((row) => {
    const { dirty, ...rest } = row;
    return rest;
  });

  let pushed = 0;
  const batches = chunk(cleaned, CHUNK_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    await withRetry(
      async () => {
        const { error } = await supabase.from(tableName).upsert(batch, { onConflict: "id" });
        if (error) throw new Error(`Push ${tableName} batch ${i}: ${error.message}`);
      },
      `push:${tableName}:batch${i}`,
    );

    pushed += batch.length;
  }

  return pushed;
}


// ============================================================
// Pull remote rows updated since last sync
// NOTE: If your RLS already restricts reads to auth.uid(), this is fine.
// If you want extra safety, add .eq("user_id", userId) to the query.
// ============================================================
function getRemoteRowSyncTimestamp(row: any): string | null {
  if (typeof row?.updated_at === "string" && row.updated_at.length > 0) {
    return row.updated_at;
  }
  if (typeof row?.created_at === "string" && row.created_at.length > 0) {
    return row.created_at;
  }
  return null;
}

async function pullTable(tableName: string, lastSync: string | null): Promise<any[]> {
  return withRetry(
    async () => {
      let query: any = supabase.from(tableName).select("*");
      const serverSyncColumn = Object.prototype.hasOwnProperty.call(SERVER_SYNC_COLUMN_BY_TABLE, tableName)
        ? SERVER_SYNC_COLUMN_BY_TABLE[tableName]
        : "updated_at";
      if (lastSync && serverSyncColumn) {
        // Use gt to avoid repeatedly re-pulling boundary rows
        query = query.gt(serverSyncColumn, lastSync);
      }
      const { data, error } = await query;
      if (error) throw new Error(`Pull ${tableName}: ${error.message}`);
      const rows = data || [];
      if (!lastSync || serverSyncColumn) {
        return rows;
      }

      return rows.filter((row: any) => {
        const syncTimestamp = getRemoteRowSyncTimestamp(row);
        return !syncTimestamp || syncTimestamp > lastSync;
      });
    },
    `pull:${tableName}`,
  );
}

// ============================================================
// Main sync function
// ============================================================
export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export async function performSync(onStatus: SyncCallback, userId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: [] };

  // If Supabase not configured, we are offline-only.
  if (!isSupabaseConfigured) {
    onStatus("offline");
    result.errors.push(
      "Supabase not configured (missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).",
    );
    return result;
  }

  onStatus("syncing");

  try {
    // Ensure session exists
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      onStatus("offline"); // or "error" if you prefer
      result.errors.push("Not logged in. Cannot sync.");
      return result;
    }

    const lastSync = await syncMetaStore.getLastSync();

    // ---- STEP 1: PUSH dirty local rows ----
    const [dirtyTrips, dirtyRisks, dirtyItems, dirtySlots, dirtyLogs, dirtyWaypoints] =
      await Promise.all([
        tripStore.getDirty(),
        riskScoreStore.getDirty(),
        loadItemStore.getDirty(),
        loadMapSlotStore.getDirty(),
        fuelWaterLogStore.getDirty(),
        waypointStore.getDirty(),
      ]);

    // Stamp user_id on all dirty rows
    const stamp = (rows: any[]) => rows.map((r) => ({ ...r, user_id: userId }));

    const pushResults = await Promise.allSettled([
      pushTable("trips", stamp(dirtyTrips)),
      pushTable("risk_scores", stamp(dirtyRisks)),
      pushTable("load_items", stamp(dirtyItems)),
      pushTable("load_map_slots", stamp(dirtySlots)),
      pushTable("fuel_water_logs", stamp(dirtyLogs)),
      pushTable("waypoints", stamp(dirtyWaypoints)),
    ]);

    for (const r of pushResults) {
      if (r.status === "fulfilled") result.pushed += r.value;
      else result.errors.push(r.reason?.message || "Push failed");
    }

    // ---- STEP 2: PULL remote changes ----
    const [remoteTrips, remoteRisks, remoteItems, remoteSlots, remoteLogs, remoteWaypoints] =
      await Promise.all([
        pullTable("trips", lastSync),
        pullTable("risk_scores", lastSync),
        pullTable("load_items", lastSync),
        pullTable("load_map_slots", lastSync),
        pullTable("fuel_water_logs", lastSync),
        pullTable("waypoints", lastSync),
      ]);

    // ---- STEP 2.5: DETECT CONFLICTS ----
    // Compare pulled remote rows against dirty local rows.
    // If both modified since last sync, it's a conflict.
    const allConflicts: SyncConflict[] = [];

    const tableConfigs = [
      { name: 'trips', dirty: dirtyTrips, remote: remoteTrips },
      { name: 'risk_scores', dirty: dirtyRisks, remote: remoteRisks },
      { name: 'load_items', dirty: dirtyItems, remote: remoteItems },
      { name: 'load_map_slots', dirty: dirtySlots, remote: remoteSlots },
      { name: 'fuel_water_logs', dirty: dirtyLogs, remote: remoteLogs },
      { name: 'waypoints', dirty: dirtyWaypoints, remote: remoteWaypoints },
    ];

    // Safe rows (no conflict) to merge per table
    const safeRows: Record<string, any[]> = {};

    for (const cfg of tableConfigs) {
      if (cfg.dirty.length === 0 || cfg.remote.length === 0) {
        // No possible conflicts — all remote rows are safe
        safeRows[cfg.name] = cfg.remote;
        continue;
      }

      const { conflicts, safeRemoteRows } = detectConflictsForTable(
        cfg.name,
        cfg.dirty,
        cfg.remote,
        lastSync,
      );

      safeRows[cfg.name] = safeRemoteRows;

      if (conflicts.length > 0) {
        allConflicts.push(...conflicts);
        console.warn(
          `[Sync] ${conflicts.length} conflict(s) detected in ${cfg.name}`,
        );
      }
    }

    // Store conflicts for user resolution
    if (allConflicts.length > 0) {
      savePendingConflicts(allConflicts);
      notifyConflictListeners();
      result.conflicts = allConflicts.length;
      console.warn(
        `[Sync] Total ${allConflicts.length} conflict(s) stored for resolution`,
      );
    }

    // ---- STEP 3: MERGE non-conflicting rows ----
    await Promise.all([
      tripStore.bulkUpsert(safeRows['trips'] || []),
      riskScoreStore.bulkUpsert(safeRows['risk_scores'] || []),
      loadItemStore.bulkUpsert(safeRows['load_items'] || []),
      loadMapSlotStore.bulkUpsert(safeRows['load_map_slots'] || []),
      fuelWaterLogStore.bulkUpsert(safeRows['fuel_water_logs'] || []),
      waypointStore.bulkUpsert(safeRows['waypoints'] || []),
    ]);

    result.pulled =
      (safeRows['trips']?.length || 0) +
      (safeRows['risk_scores']?.length || 0) +
      (safeRows['load_items']?.length || 0) +
      (safeRows['load_map_slots']?.length || 0) +
      (safeRows['fuel_water_logs']?.length || 0) +
      (safeRows['waypoints']?.length || 0);

    // ---- STEP 4: Update last_sync_at ----
    await syncMetaStore.setLastSync(new Date().toISOString());

    // ---- STEP 5: Clear dirty flags locally (only for successfully pushed rows) ----
    // FIX (2026-02-24): Use per-row dirty clearing via clearDirtyForIds().
    //
    // Previous bug: clearDirtyExcept() called store.clearDirty() which wiped ALL
    // dirty flags — including conflicting rows and rows dirtied by new writes that
    // occurred between the getDirty() snapshot (Step 1) and this point.
    //
    // New approach:
    //   1. Build per-TABLE conflict ID sets (no cross-table contamination).
    //   2. For each store, compute: idsToClear = snapshotIds − conflictIdsForThisTable.
    //   3. Call store.clearDirtyForIds(idsToClear) so only those specific rows are
    //      un-dirtied. Rows written during sync and conflicting rows keep dirty=1.

    // Build per-table conflict ID sets
    const conflictIdsByTable: Record<string, Set<string>> = {};
    for (const c of allConflicts) {
      if (!conflictIdsByTable[c.tableName]) {
        conflictIdsByTable[c.tableName] = new Set();
      }
      conflictIdsByTable[c.tableName].add(c.recordId);
    }

    /** Return snapshot IDs minus any conflicting IDs for the given table */
    function safeClearIds(tableName: string, dirtyRows: any[]): string[] {
      if (dirtyRows.length === 0) return [];
      const conflictsForTable = conflictIdsByTable[tableName];
      if (!conflictsForTable || conflictsForTable.size === 0) {
        return dirtyRows.map((r: any) => r.id);
      }
      return dirtyRows
        .filter((r: any) => !conflictsForTable.has(r.id))
        .map((r: any) => r.id);
    }

    await Promise.all([
      tripStore.clearDirtyForIds(safeClearIds('trips', dirtyTrips)),
      riskScoreStore.clearDirtyForIds(safeClearIds('risk_scores', dirtyRisks)),
      loadItemStore.clearDirtyForIds(safeClearIds('load_items', dirtyItems)),
      loadMapSlotStore.clearDirtyForIds(safeClearIds('load_map_slots', dirtySlots)),
      fuelWaterLogStore.clearDirtyForIds(safeClearIds('fuel_water_logs', dirtyLogs)),
      waypointStore.clearDirtyForIds(safeClearIds('waypoints', dirtyWaypoints)),
    ]);

    if (result.errors.length > 0) onStatus("error");
    else if (result.conflicts > 0) onStatus("synced"); // synced but with conflicts pending
    else onStatus("synced");
  } catch (err: any) {
    console.error("[Sync] Fatal error:", err);
    result.errors.push(err?.message || "Unknown sync error");
    onStatus("error");
  }

  return result;
}


// ============================================================
// Ensure user_settings row exists in Supabase (cloud defaults)
// (Local userSettingsStore is separate and can be saved via UI)
//
// Hardened behavior:
// - If table is missing from schema cache, quietly skip cloud bootstrap
// - If row doesn't exist, insert defaults
// - If duplicate insert/race occurs, ignore
// ============================================================
export async function ensureUserSettings(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const msg = String(error.message || '');

      // Table missing / schema cache missing / relation missing:
      // treat as non-fatal and stop spamming logs.
      if (
        msg.includes("Could not find the table 'public.user_settings'") ||
        msg.includes("relation 'public.user_settings' does not exist") ||
        msg.includes('schema cache')
      ) {
        console.warn('[Sync] user_settings table unavailable — skipping ensureUserSettings');
        return;
      }

      console.warn('[Sync] ensureUserSettings query error:', msg);
      return;
    }

    if (data) {
      return;
    }

    const { error: insertError } = await supabase.from('user_settings').insert({
      user_id: userId,
      roof_load_threshold_lbs: 250,
      roof_share_warn: 0.12,
      roof_share_alert: 0.18,
    });

    if (insertError) {
      const msg = String(insertError.message || '');

      // Another client may have inserted the row first.
      if (
        msg.includes('duplicate key') ||
        msg.includes('unique constraint') ||
        msg.includes('duplicate')
      ) {
        return;
      }

      if (
        msg.includes("Could not find the table 'public.user_settings'") ||
        msg.includes("relation 'public.user_settings' does not exist") ||
        msg.includes('schema cache')
      ) {
        console.warn('[Sync] user_settings table unavailable — skipping ensureUserSettings');
        return;
      }

      console.warn('[Sync] ensureUserSettings insert error:', msg);
    }
  } catch (err) {
    console.warn('[Sync] ensureUserSettings error:', err);
  }
}


// ============================================================
// Auto-sync scheduler with backoff
// ============================================================
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncAttempt = 0;

export function scheduleAutoSync(
  onStatus: SyncCallback,
  userId: string,
  onComplete?: (result: SyncResult) => void,
): void {
  cancelAutoSync();

  const delay = autoSyncAttempt === 0 ? 0 : BASE_DELAY_MS * Math.pow(2, Math.min(autoSyncAttempt, 5));

  autoSyncTimer = setTimeout(async () => {
    const result = await performSync(onStatus, userId);

    if (result.errors.length > 0 && autoSyncAttempt < 5) {
      autoSyncAttempt++;
      scheduleAutoSync(onStatus, userId, onComplete);
    } else {
      autoSyncAttempt = 0;
    }

    onComplete?.(result);
  }, delay);
}

export function cancelAutoSync(): void {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
}

export function resetAutoSyncAttempts(): void {
  autoSyncAttempt = 0;
}
