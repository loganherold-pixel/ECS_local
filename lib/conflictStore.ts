/**
 * Sync Conflict Store
 *
 * Detects, stores, and resolves sync conflicts when the same record
 * has been modified both locally and remotely.
 *
 * Storage: localStorage-based (no Dexie upgrade needed).
 * Conflict detection compares dirty local rows against pulled remote rows
 * by checking updated_at timestamps.
 */
import { Platform } from 'react-native';

// ── Types ─────────────────────────────────────────────────────

export type FieldResolution = 'local' | 'remote' | 'merged';

export interface ConflictField {
  field: string;
  localValue: any;
  remoteValue: any;
  resolution: FieldResolution;
  mergedValue?: any;
}

export interface SyncConflict {
  id: string;
  tableName: string;
  recordId: string;
  localRow: Record<string, any>;
  remoteRow: Record<string, any>;
  conflictingFields: ConflictField[];
  detectedAt: string;
  status: 'pending' | 'resolved' | 'discarded';
}

export interface ConflictLogEntry {
  id: string;
  conflictId: string;
  tableName: string;
  recordId: string;
  fieldResolutions: ConflictField[];
  resolvedAt: string;
  strategy: 'keep_local' | 'keep_remote' | 'field_merge';
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

// ── Storage Keys ──────────────────────────────────────────────

const PENDING_KEY = 'ecs_sync_conflicts_pending';
const LOG_KEY = 'ecs_sync_conflict_log';

// ── localStorage helpers ──────────────────────────────────────

function lsGet<T>(key: string): T | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {}
  return null;
}

function lsSet(key: string, value: any): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

// ── Fields to ignore during conflict comparison ───────────────

const IGNORE_FIELDS = new Set([
  'dirty',
  'created_at',
  'user_id',
]);

// Fields that are metadata (show but don't require resolution)
const METADATA_FIELDS = new Set([
  'id',
  'updated_at',
  'created_at',
  'user_id',
  'dirty',
]);

// ── Human-readable field labels ───────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  start_date: 'Start Date',
  end_date: 'End Date',
  terrain_type: 'Terrain Type',
  season: 'Season',
  team_size: 'Team Size',
  primary_vehicle: 'Primary Vehicle',
  route_distance_miles: 'Route Distance (mi)',
  avg_miles_per_day: 'Avg Miles/Day',
  active_mode: 'Active Mode',
  capac_fuel_gal: 'Fuel Capacity (gal)',
  capac_mpg: 'MPG',
  capac_water_gal: 'Water Capacity (gal)',
  water_use_per_person_day: 'Water Use/Person/Day',
  battery_usable_wh: 'Battery (Wh)',
  solar_watts: 'Solar (W)',
  sun_hours_per_day: 'Sun Hours/Day',
  solar_efficiency: 'Solar Efficiency',
  emergency_contact: 'Emergency Contact',
  deleted_at: 'Deleted',
  // Risk scores
  terrain_complexity: 'Terrain Complexity',
  weather_exposure: 'Weather Exposure',
  remoteness: 'Remoteness',
  recovery_availability: 'Recovery Availability',
  comms_coverage: 'Comms Coverage',
  // Load items
  zone: 'Zone',
  qty: 'Quantity',
  packed: 'Packed',
  mode: 'Mode',
  weight_lbs: 'Weight (lbs)',
  notes: 'Notes',
  sort_order: 'Sort Order',
  // Load map slots
  slot_key: 'Slot Key',
  load_item_id: 'Assigned Item',
  // Fuel water logs
  log_date: 'Log Date',
  fuel_remaining_gal: 'Fuel Remaining (gal)',
  water_remaining_gal: 'Water Remaining (gal)',
  // Waypoints
  latitude: 'Latitude',
  longitude: 'Longitude',
  altitude: 'Altitude',
  speed: 'Speed',
  heading: 'Heading',
  accuracy: 'Accuracy',
  recorded_at: 'Recorded At',
  session_id: 'Session ID',
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Conflict Detection ────────────────────────────────────────

/**
 * Compare a local dirty row against a remote row.
 * Returns conflicting fields if both have been modified differently.
 */
function compareRows(
  localRow: Record<string, any>,
  remoteRow: Record<string, any>,
): ConflictField[] {
  const conflicts: ConflictField[] = [];

  // Get all unique keys from both rows
  const allKeys = new Set([...Object.keys(localRow), ...Object.keys(remoteRow)]);

  for (const key of allKeys) {
    if (IGNORE_FIELDS.has(key)) continue;
    if (METADATA_FIELDS.has(key)) continue;

    const localVal = localRow[key];
    const remoteVal = remoteRow[key];

    // Normalize for comparison
    const localNorm = normalizeValue(localVal);
    const remoteNorm = normalizeValue(remoteVal);

    if (localNorm !== remoteNorm) {
      conflicts.push({
        field: key,
        localValue: localVal,
        remoteValue: remoteVal,
        resolution: 'local', // default to local
      });
    }
  }

  return conflicts;
}

function normalizeValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  return String(val);
}

/**
 * Detect conflicts between dirty local rows and pulled remote rows for a single table.
 * Returns: { conflicts: SyncConflict[], nonConflicting: remoteRows that can be safely merged }
 */
export function detectConflictsForTable(
  tableName: string,
  dirtyLocalRows: Record<string, any>[],
  pulledRemoteRows: Record<string, any>[],
  lastSync: string | null,
): { conflicts: SyncConflict[]; safeRemoteRows: Record<string, any>[] } {
  const conflicts: SyncConflict[] = [];
  const safeRemoteRows: Record<string, any>[] = [];

  // Index dirty local rows by ID for fast lookup
  const dirtyMap = new Map<string, Record<string, any>>();
  for (const row of dirtyLocalRows) {
    if (row.id) dirtyMap.set(row.id, row);
  }

  for (const remoteRow of pulledRemoteRows) {
    const localDirty = dirtyMap.get(remoteRow.id);

    if (!localDirty) {
      // No local dirty version — safe to merge
      safeRemoteRows.push(remoteRow);
      continue;
    }

    // Both local and remote have been modified
    // Check if they actually differ in meaningful fields
    const conflictingFields = compareRows(localDirty, remoteRow);

    if (conflictingFields.length === 0) {
      // Same values despite both being "modified" — safe to merge
      safeRemoteRows.push(remoteRow);
      continue;
    }

    // Real conflict detected
    const conflict: SyncConflict = {
      id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tableName,
      recordId: remoteRow.id,
      localRow: { ...localDirty },
      remoteRow: { ...remoteRow },
      conflictingFields,
      detectedAt: new Date().toISOString(),
      status: 'pending',
    };

    conflicts.push(conflict);
  }

  return { conflicts, safeRemoteRows };
}

// ── Pending Conflicts CRUD ────────────────────────────────────

export function getPendingConflicts(): SyncConflict[] {
  return lsGet<SyncConflict[]>(PENDING_KEY) || [];
}

export function savePendingConflicts(conflicts: SyncConflict[]): void {
  const existing = getPendingConflicts();
  // Merge: replace existing by recordId+tableName, add new
  const map = new Map<string, SyncConflict>();
  for (const c of existing) {
    if (c.status === 'pending') {
      map.set(`${c.tableName}:${c.recordId}`, c);
    }
  }
  for (const c of conflicts) {
    map.set(`${c.tableName}:${c.recordId}`, c);
  }
  lsSet(PENDING_KEY, Array.from(map.values()));
}

export function removePendingConflict(conflictId: string): void {
  const existing = getPendingConflicts();
  lsSet(PENDING_KEY, existing.filter(c => c.id !== conflictId));
}

export function clearPendingConflicts(): void {
  lsSet(PENDING_KEY, []);
}

export function getPendingConflictCount(): number {
  return getPendingConflicts().filter(c => c.status === 'pending').length;
}

// ── Conflict Resolution ───────────────────────────────────────

/**
 * Build a merged row from a conflict based on per-field resolutions.
 */
export function buildMergedRow(conflict: SyncConflict): Record<string, any> {
  // Start with the remote row as base
  const merged = { ...conflict.remoteRow };

  for (const field of conflict.conflictingFields) {
    if (field.resolution === 'local') {
      merged[field.field] = field.localValue;
    } else if (field.resolution === 'remote') {
      merged[field.field] = field.remoteValue;
    } else if (field.resolution === 'merged' && field.mergedValue !== undefined) {
      merged[field.field] = field.mergedValue;
    }
  }

  // Always use current timestamp
  merged.updated_at = new Date().toISOString();
  // Mark as dirty so it syncs back
  merged.dirty = 1;

  return merged;
}

/**
 * Determine the overall strategy based on field resolutions.
 */
export function determineStrategy(fields: ConflictField[]): 'keep_local' | 'keep_remote' | 'field_merge' {
  const allLocal = fields.every(f => f.resolution === 'local');
  const allRemote = fields.every(f => f.resolution === 'remote');
  if (allLocal) return 'keep_local';
  if (allRemote) return 'keep_remote';
  return 'field_merge';
}

// ── Conflict Log (History) ────────────────────────────────────

export function getConflictLog(): ConflictLogEntry[] {
  return lsGet<ConflictLogEntry[]>(LOG_KEY) || [];
}

export function addConflictLogEntry(entry: ConflictLogEntry): void {
  const log = getConflictLog();
  log.unshift(entry); // newest first
  // Keep max 100 entries
  if (log.length > 100) log.length = 100;
  lsSet(LOG_KEY, log);
}

export function clearConflictLog(): void {
  lsSet(LOG_KEY, []);
}

// ── Table name labels ─────────────────────────────────────────

const TABLE_LABELS: Record<string, string> = {
  trips: 'Expedition',
  risk_scores: 'Risk Assessment',
  load_items: 'Loadout Item',
  load_map_slots: 'Load Map Slot',
  fuel_water_logs: 'Fuel/Water Log',
  waypoints: 'Waypoint',
};

export function getTableLabel(tableName: string): string {
  return TABLE_LABELS[tableName] || tableName;
}

// ── Record display name helper ────────────────────────────────

export function getRecordDisplayName(row: Record<string, any>, tableName: string): string {
  if (row.name) return row.name;
  if (tableName === 'risk_scores') return `Risk: ${(row.trip_id || '').slice(0, 8)}`;
  if (tableName === 'load_map_slots') return `Slot: ${row.slot_key || (row.id || '').slice(0, 8)}`;
  if (tableName === 'fuel_water_logs') return `Log: ${row.log_date || (row.id || '').slice(0, 8)}`;
  if (tableName === 'waypoints') {
    const lat = row.latitude?.toFixed(4) || '?';
    const lon = row.longitude?.toFixed(4) || '?';
    return `WP: ${lat}, ${lon}`;
  }
  return (row.id || 'Unknown').slice(0, 12);
}

// ── Change listeners ──────────────────────────────────────────

type ConflictChangeListener = (count: number) => void;
const _listeners = new Set<ConflictChangeListener>();

export function onConflictChange(listener: ConflictChangeListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function notifyConflictListeners(): void {
  const count = getPendingConflictCount();
  _listeners.forEach(l => {
    try { l(count); } catch {}
  });
}

