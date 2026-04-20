/**
 * Dexie IndexedDB Database Definition
 * Primary source of truth for all offline data.
 * Falls back gracefully if IndexedDB is unavailable.
 *
 * v2 upgrade:
 * - keeps same schema, but bumps version so existing installs upgrade cleanly
 */
import Dexie, { type Table } from "dexie";
import { Platform } from "react-native";
import type {
  Trip,
  RiskScore,
  LoadItem,
  LoadMapSlot,
  FuelWaterLog,
  Waypoint,
} from "./types";

// Extend types with dirty flag for local tracking
export interface LocalTrip extends Omit<Trip, 'dirty'> {
  dirty: number; // 0 or 1 for indexing
}
export interface LocalRiskScore extends Omit<RiskScore, 'dirty'> {
  dirty: number;
}
export interface LocalLoadItem extends Omit<LoadItem, 'dirty'> {
  dirty: number;
}
export interface LocalLoadMapSlot extends Omit<LoadMapSlot, 'dirty'> {
  dirty: number;
}
export interface LocalFuelWaterLog extends Omit<FuelWaterLog, 'dirty'> {
  dirty: number;
}
export interface LocalWaypoint extends Omit<Waypoint, 'dirty'> {
  dirty: number;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export interface LocalUserSettings {
  user_id: string;
  roof_load_threshold_lbs: number;
  roof_share_warn: number;
  roof_share_alert: number;
  created_at: string;
  updated_at: string;
}

class ECSDatabase extends Dexie {
  trips!: Table<LocalTrip, string>;
  risk_scores!: Table<LocalRiskScore, string>;
  load_items!: Table<LocalLoadItem, string>;
  load_map_slots!: Table<LocalLoadMapSlot, string>;
  fuel_water_logs!: Table<LocalFuelWaterLog, string>;
  waypoints!: Table<LocalWaypoint, string>;
  sync_meta!: Table<SyncMeta, string>;
  user_settings!: Table<LocalUserSettings, string>;

  constructor() {
    super("ExpeditionCommandSystem");

    // v1 (legacy) - keep for existing installs
    this.version(1).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v2 (current) - schema stays the same, but bump version to ensure upgrades run
    this.version(2).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      sync_meta: "&key",
      user_settings: "&user_id",
    });
  }
}

// Singleton instance - only create on web where IndexedDB is available
let _db: ECSDatabase | null = null;
let _dbAvailable: boolean | null = null;

export function getDB(): ECSDatabase | null {
  if (_dbAvailable === false) return null;

  if (_db === null) {
    if (Platform.OS === "web" && typeof indexedDB !== "undefined") {
      try {
        _db = new ECSDatabase();
        _dbAvailable = true;
      } catch (e) {
        console.warn("IndexedDB not available, falling back to localStorage", e);
        _dbAvailable = false;
        return null;
      }
    } else {
      _dbAvailable = false;
      return null;
    }
  }

  return _db;
}

export async function isDBReady(): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    await db.open();
    return true;
  } catch {
    _dbAvailable = false;
    return false;
  }
}

export { ECSDatabase };
