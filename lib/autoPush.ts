/**
 * Auto-Push Engine
 *
 * Debounced push mechanism that triggers a lightweight push (dirty rows only)
 * 3-5 seconds after any local write (tripStore.upsert, loadItemStore.upsert, etc.).
 *
 * This ensures remote users see changes faster via realtime subscriptions,
 * without waiting for manual sync or auto-sync intervals.
 *
 * Features:
 *   - Debounced push with configurable delay (default 4s)
 *   - Push-only (no pull, no conflict detection) for speed
 *   - Push pending state tracking with listener system
 *   - Coalesces rapid writes into a single push
 *   - Skips push if offline or not authenticated
 *   - Tracks push statistics (total pushes, rows pushed, errors)
 *   - Integrates with existing pushTable from sync.ts
 *   - Automatic conflict resolution: last-write-wins merge + retry
 *   - Tracks auto-resolved conflict count for UI feedback
 */
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  tripStore,
  riskScoreStore,
  loadItemStore,
  loadMapSlotStore,
  fuelWaterLogStore,
  waypointStore,
} from './storage';
import { pushTable } from './sync';
import { connectivity } from './connectivity';

// ── Types ─────────────────────────────────────────────────────

export type AutoPushStatus = 'idle' | 'pending' | 'pushing' | 'error';

export interface AutoPushStats {
  status: AutoPushStatus;
  totalPushes: number;
  totalRowsPushed: number;
  totalErrors: number;
  lastPushAt: string | null;
  lastPushRows: number;
  lastErrorMessage: string | null;
  pendingSince: string | null;
  debounceMs: number;
  /** Epoch ms when the next push is scheduled to fire (null if not pending) */
  pushScheduledAt: number | null;
  /** Total number of rows auto-resolved via last-write-wins merge across all pushes */
  autoResolvedCount: number;
  /** Whether the most recent push involved auto-resolved conflicts */
  lastPushAutoResolved: boolean;
  /** Number of rows auto-resolved in the most recent push (0 if clean) */
  lastPushAutoResolvedRows: number;
}


export type AutoPushListener = (stats: AutoPushStats) => void;

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_DEBOUNCE_MS = 4000; // 4 seconds
const MIN_DEBOUNCE_MS = 2000;
const MAX_DEBOUNCE_MS = 10000;
const AUTO_PUSH_ENABLED_KEY = 'ecs_auto_push_enabled';

/** Error substrings that indicate a conflict (vs. a hard failure) */
const CONFLICT_PATTERNS = [
  '409',
  'conflict',
  'version',
  'duplicate key',
  'unique constraint',
  'already exists',
  'row-level security',
  'modified concurrently',
  'could not serialize',
];

// ── Persistence helpers ───────────────────────────────────────

function getPersistedEnabled(): boolean {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(AUTO_PUSH_ENABLED_KEY) !== 'false'; // default ON
    }
  } catch {}
  return true;
}

function setPersistedEnabled(enabled: boolean): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTO_PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
    }
  } catch {}
}

// ── Conflict resolution helpers ───────────────────────────────

/** Fields that should never be merged (internal / metadata) */
const MERGE_SKIP_FIELDS = new Set([
  'dirty',
  'created_at',
  'user_id',
]);

/**
 * Last-write-wins field merge.
 *
 * For each field:
 *   - If local updated_at >= server updated_at → keep local value
 *   - Otherwise → keep server value
 *
 * Special handling:
 *   - `updated_at` is always set to the latest of the two (or now)
 *   - `deleted_at` uses last-write-wins (if local deleted it more recently, keep deletion)
 *   - `dirty` is always set to 1 (needs re-push)
 *   - `id` is always preserved from local
 */
function mergeRowLastWriteWins(
  localRow: Record<string, any>,
  serverRow: Record<string, any>,
): Record<string, any> {
  const localTime = new Date(localRow.updated_at || 0).getTime();
  const serverTime = new Date(serverRow.updated_at || 0).getTime();
  const localWins = localTime >= serverTime;

  // Start with the server row as the base, then overlay
  const merged: Record<string, any> = { ...serverRow };

  // Get all unique keys
  const allKeys = new Set([...Object.keys(localRow), ...Object.keys(serverRow)]);

  for (const key of allKeys) {
    if (MERGE_SKIP_FIELDS.has(key)) continue;

    if (key === 'id') {
      // Always use local id (should be the same)
      merged[key] = localRow[key];
      continue;
    }

    if (key === 'updated_at') {
      // Use the latest timestamp, or now if both are old
      merged[key] = new Date(Math.max(localTime, serverTime, Date.now())).toISOString();
      continue;
    }

    // For all other fields: last-write-wins based on updated_at
    if (localWins) {
      // Local is newer or same age — local value wins for ALL fields
      if (key in localRow) {
        merged[key] = localRow[key];
      }
    } else {
      // Server is newer — server value wins, but if local has a field
      // the server doesn't, keep the local value (non-conflicting addition)
      if (key in serverRow) {
        merged[key] = serverRow[key];
      } else if (key in localRow) {
        merged[key] = localRow[key];
      }
    }
  }

  return merged;
}

/**
 * Check if an error message looks like a conflict (vs. a hard network/auth failure).
 */
function isConflictError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return CONFLICT_PATTERNS.some(pattern => lower.includes(pattern));
}

// ── Per-table push result with conflict info ──────────────────

interface TablePushResult {
  pushed: number;
  autoResolved: number;
  error: string | null;
}

// ── Auto-Push Manager ─────────────────────────────────────────

class AutoPushManager {
  private _status: AutoPushStatus = 'idle';
  private _enabled: boolean = getPersistedEnabled();
  private _userId: string | null = null;
  private _debounceMs: number = DEFAULT_DEBOUNCE_MS;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pushInProgress = false;
  private _pendingSince: string | null = null;
  private _pushScheduledAt: number | null = null;
  private _listeners = new Set<AutoPushListener>();

  // Stats
  private _totalPushes = 0;
  private _totalRowsPushed = 0;
  private _totalErrors = 0;
  private _lastPushAt: string | null = null;
  private _lastPushRows = 0;
  private _lastErrorMessage: string | null = null;
  private _autoResolvedCount = 0;
  private _lastPushAutoResolved = false;
  private _lastPushAutoResolvedRows = 0;

  // ── Public getters ──────────────────────────────────────────

  get status(): AutoPushStatus {
    return this._status;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get isPending(): boolean {
    return this._status === 'pending';
  }

  get isPushing(): boolean {
    return this._status === 'pushing';
  }

  get stats(): AutoPushStats {
    return {
      status: this._status,
      totalPushes: this._totalPushes,
      totalRowsPushed: this._totalRowsPushed,
      totalErrors: this._totalErrors,
      lastPushAt: this._lastPushAt,
      lastPushRows: this._lastPushRows,
      lastErrorMessage: this._lastErrorMessage,
      pendingSince: this._pendingSince,
      debounceMs: this._debounceMs,
      pushScheduledAt: this._pushScheduledAt,
      autoResolvedCount: this._autoResolvedCount,
      lastPushAutoResolved: this._lastPushAutoResolved,
      lastPushAutoResolvedRows: this._lastPushAutoResolvedRows,
    };
  }


  // ── Listener management ─────────────────────────────────────

  onChange(listener: AutoPushListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notifyListeners(): void {
    const stats = this.stats;
    this._listeners.forEach(listener => {
      try {
        listener(stats);
      } catch {}
    });
  }

  // ── Enable / Disable ────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    setPersistedEnabled(enabled);

    if (!enabled) {
      this._cancelDebounce();
      this._setStatus('idle');
    }

    this._notifyListeners();
  }

  // ── Debounce configuration ──────────────────────────────────

  setDebounceMs(ms: number): void {
    this._debounceMs = Math.max(MIN_DEBOUNCE_MS, Math.min(MAX_DEBOUNCE_MS, ms));
  }

  // ── Start / Stop ────────────────────────────────────────────

  start(userId: string): void {
    this._userId = userId;
    console.log('[AutoPush] Started for user:', userId.slice(0, 8));
  }

  stop(): void {
    this._cancelDebounce();
    this._setStatus('idle');
    this._userId = null;
    console.log('[AutoPush] Stopped');
  }

  /** Full cleanup on logout */
  destroy(): void {
    this.stop();
    this._totalPushes = 0;
    this._totalRowsPushed = 0;
    this._totalErrors = 0;
    this._lastPushAt = null;
    this._lastPushRows = 0;
    this._lastErrorMessage = null;
    this._pendingSince = null;
    this._autoResolvedCount = 0;
    this._lastPushAutoResolved = false;
    this._lastPushAutoResolvedRows = 0;
    this._notifyListeners();
  }

  // ── Notify of local write ───────────────────────────────────
  /**
   * Called by the storage layer after any write operation.
   * Starts or resets the debounce timer.
   */
  notifyWrite(): void {
    if (!this._enabled) return;
    if (!this._userId) return;
    if (!isSupabaseConfigured) return;

    // Set pending state
    if (this._status !== 'pending' && this._status !== 'pushing') {
      this._pendingSince = new Date().toISOString();
      this._setStatus('pending');
    }

    // Reset debounce timer (coalesce rapid writes)
    this._cancelDebounce();
    this._pushScheduledAt = Date.now() + this._debounceMs;
    this._debounceTimer = setTimeout(() => {
      this._pushScheduledAt = null;
      this._executePush();
    }, this._debounceMs);
    this._notifyListeners();
  }


  // ── Force push now (skip debounce) ──────────────────────────

  async pushNow(): Promise<{ pushed: number; errors: string[] }> {
    this._cancelDebounce();
    return this._executePush();
  }

  // ── Internal: Push a single table with conflict auto-resolution ──

  /**
   * Attempts to push dirty rows for a single table.
   * If the push fails with a conflict-like error:
   *   1. Re-fetches the server versions of the conflicting rows
   *   2. Merges each row using last-write-wins
   *   3. Retries the push with merged data
   *
   * Returns pushed count and auto-resolved count.
   */
  private async _pushTableWithAutoResolve(
    tableName: string,
    dirtyRows: any[],
  ): Promise<TablePushResult> {
    if (dirtyRows.length === 0) {
      return { pushed: 0, autoResolved: 0, error: null };
    }

    // First attempt: normal push
    try {
      const pushed = await pushTable(tableName, dirtyRows);
      return { pushed, autoResolved: 0, error: null };
    } catch (firstError: any) {
      const errorMsg = firstError?.message || String(firstError);

      // If it's NOT a conflict-like error, don't attempt resolution
      if (!isConflictError(errorMsg)) {
        console.warn(
          `[AutoPush] Non-conflict error pushing ${tableName}: ${errorMsg}`,
        );
        return { pushed: 0, autoResolved: 0, error: errorMsg };
      }

      console.log(
        `[AutoPush] Conflict detected pushing ${tableName} (${dirtyRows.length} rows), attempting auto-resolve...`,
      );

      // ── Conflict resolution: re-fetch, merge, retry ──────────

      try {
        // Extract IDs of the rows we tried to push
        const rowIds = dirtyRows
          .map(r => r.id)
          .filter((id): id is string => Boolean(id));

        if (rowIds.length === 0) {
          return { pushed: 0, autoResolved: 0, error: errorMsg };
        }

        // Re-fetch server versions of these rows
        const { data: serverRows, error: fetchError } = await supabase
          .from(tableName)
          .select('*')
          .in('id', rowIds);

        if (fetchError) {
          console.warn(
            `[AutoPush] Failed to fetch server rows for ${tableName}: ${fetchError.message}`,
          );
          return { pushed: 0, autoResolved: 0, error: errorMsg };
        }

        // Index server rows by ID
        const serverMap = new Map<string, Record<string, any>>();
        for (const row of (serverRows || [])) {
          serverMap.set(row.id, row);
        }

        // Merge each local row with its server counterpart
        const mergedRows: any[] = [];
        let resolvedCount = 0;

        for (const localRow of dirtyRows) {
          const serverRow = serverMap.get(localRow.id);

          if (!serverRow) {
            // No server version exists — push local as-is (it's a new row)
            mergedRows.push(localRow);
            continue;
          }

          // Merge using last-write-wins
          const merged = mergeRowLastWriteWins(localRow, serverRow);
          mergedRows.push(merged);
          resolvedCount++;

          console.log(
            `[AutoPush] Auto-resolved conflict for ${tableName}:${localRow.id.slice(0, 8)} ` +
            `(local: ${localRow.updated_at}, server: ${serverRow.updated_at})`,
          );
        }

        // Retry push with merged rows
        const pushed = await pushTable(tableName, mergedRows);

        console.log(
          `[AutoPush] Auto-resolved ${resolvedCount} conflict(s) in ${tableName}, pushed ${pushed} rows`,
        );

        return { pushed, autoResolved: resolvedCount, error: null };
      } catch (resolveError: any) {
        const resolveMsg = resolveError?.message || String(resolveError);
        console.error(
          `[AutoPush] Conflict resolution failed for ${tableName}: ${resolveMsg}`,
        );
        return { pushed: 0, autoResolved: 0, error: resolveMsg };
      }
    }
  }

  // ── Internal: Execute push ──────────────────────────────────

  private async _executePush(): Promise<{ pushed: number; errors: string[] }> {
    const result = { pushed: 0, errors: [] as string[] };

    // Guard checks
    if (!this._userId) {
      this._setStatus('idle');
      return result;
    }

    if (!isSupabaseConfigured) {
      this._setStatus('idle');
      return result;
    }

    if (!connectivity.isOnline()) {
      // Stay pending — will retry when online
      console.log('[AutoPush] Offline — deferring push');
      return result;
    }

    if (this._pushInProgress) {
      // Already pushing — schedule another push after current one completes
      console.log('[AutoPush] Push already in progress — will retry');
      this._debounceTimer = setTimeout(() => this._executePush(), this._debounceMs);
      return result;
    }

    // Check session
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        this._setStatus('idle');
        return result;
      }
    } catch {
      this._setStatus('idle');
      return result;
    }

    this._pushInProgress = true;
    this._setStatus('pushing');

    // Reset per-push conflict tracking
    let pushAutoResolved = 0;

    try {
      // Get dirty rows from all stores
      const [dirtyTrips, dirtyRisks, dirtyItems, dirtySlots, dirtyLogs, dirtyWaypoints] =
        await Promise.all([
          tripStore.getDirty().catch(() => []),
          riskScoreStore.getDirty().catch(() => []),
          loadItemStore.getDirty().catch(() => []),
          loadMapSlotStore.getDirty().catch(() => []),
          fuelWaterLogStore.getDirty().catch(() => []),
          waypointStore.getDirty().catch(() => []),
        ]);

      const totalDirty =
        dirtyTrips.length +
        dirtyRisks.length +
        dirtyItems.length +
        dirtySlots.length +
        dirtyLogs.length +
        dirtyWaypoints.length;

      if (totalDirty === 0) {
        // Nothing to push
        this._setStatus('idle');
        this._pendingSince = null;
        this._pushInProgress = false;
        this._lastPushAutoResolved = false;
        this._lastPushAutoResolvedRows = 0;
        this._notifyListeners();
        return result;
      }

      const userId = this._userId;
      const stamp = (rows: any[]) => rows.map((r) => ({ ...r, user_id: userId }));

      console.log(`[AutoPush] Pushing ${totalDirty} dirty rows...`);

      // Push all tables in parallel with conflict auto-resolution
      const pushResults = await Promise.allSettled([
        this._pushTableWithAutoResolve('trips', stamp(dirtyTrips)),
        this._pushTableWithAutoResolve('risk_scores', stamp(dirtyRisks)),
        this._pushTableWithAutoResolve('load_items', stamp(dirtyItems)),
        this._pushTableWithAutoResolve('load_map_slots', stamp(dirtySlots)),
        this._pushTableWithAutoResolve('fuel_water_logs', stamp(dirtyLogs)),
        this._pushTableWithAutoResolve('waypoints', stamp(dirtyWaypoints)),
      ]);

      for (const r of pushResults) {
        if (r.status === 'fulfilled') {
          const tableResult = r.value;
          result.pushed += tableResult.pushed;
          pushAutoResolved += tableResult.autoResolved;
          if (tableResult.error) {
            result.errors.push(tableResult.error);
          }
        } else {
          result.errors.push(r.reason?.message || 'Push failed');
        }
      }

      // Clear dirty flags for successfully pushed rows
      if (result.pushed > 0) {
        await Promise.all([
          dirtyTrips.length > 0 ? tripStore.clearDirty() : Promise.resolve(),
          dirtyRisks.length > 0 ? riskScoreStore.clearDirty() : Promise.resolve(),
          dirtyItems.length > 0 ? loadItemStore.clearDirty() : Promise.resolve(),
          dirtySlots.length > 0 ? loadMapSlotStore.clearDirty() : Promise.resolve(),
          dirtyLogs.length > 0 ? fuelWaterLogStore.clearDirty() : Promise.resolve(),
          dirtyWaypoints.length > 0 ? waypointStore.clearDirty() : Promise.resolve(),
        ]);
      }

      // Update stats
      this._totalPushes++;
      this._totalRowsPushed += result.pushed;
      this._lastPushAt = new Date().toISOString();
      this._lastPushRows = result.pushed;
      this._autoResolvedCount += pushAutoResolved;
      this._lastPushAutoResolved = pushAutoResolved > 0;
      this._lastPushAutoResolvedRows = pushAutoResolved;

      if (result.errors.length > 0 && result.pushed === 0) {
        // All tables failed — mark as error
        this._totalErrors += result.errors.length;
        this._lastErrorMessage = result.errors[0];
        this._setStatus('error');
        console.warn(`[AutoPush] Completed with ${result.errors.length} error(s), 0 rows pushed`);
      } else if (result.errors.length > 0) {
        // Partial success — some tables pushed, some failed
        // Still mark as idle (successful overall) but log warnings
        this._totalErrors += result.errors.length;
        this._lastErrorMessage = result.errors[0];
        this._setStatus('idle');
        console.warn(
          `[AutoPush] Partial success: ${result.pushed} rows pushed, ${result.errors.length} error(s)` +
          (pushAutoResolved > 0 ? `, ${pushAutoResolved} conflict(s) auto-resolved` : ''),
        );
      } else {
        this._lastErrorMessage = null;
        this._setStatus('idle');
        console.log(
          `[AutoPush] Pushed ${result.pushed} rows successfully` +
          (pushAutoResolved > 0 ? ` (${pushAutoResolved} conflict(s) auto-resolved)` : ''),
        );
      }

      this._pendingSince = null;
    } catch (err: any) {
      console.error('[AutoPush] Fatal error:', err);
      this._totalErrors++;
      this._lastErrorMessage = err?.message || 'Unknown error';
      this._lastPushAutoResolved = false;
      this._lastPushAutoResolvedRows = 0;
      this._setStatus('error');
      result.errors.push(err?.message || 'Unknown error');
    }

    this._pushInProgress = false;
    this._notifyListeners();
    return result;
  }

  // ── Internal helpers ────────────────────────────────────────

  private _cancelDebounce(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._pushScheduledAt = null;
  }


  private _setStatus(status: AutoPushStatus): void {
    if (this._status === status) return;
    this._status = status;
    this._notifyListeners();
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const autoPush = new AutoPushManager();

// ── Storage notification hook ─────────────────────────────────
/**
 * Call this after any local write operation to trigger debounced auto-push.
 * Imported by storage.ts to hook into all write methods.
 */
export function notifyLocalWrite(): void {
  autoPush.notifyWrite();
}

