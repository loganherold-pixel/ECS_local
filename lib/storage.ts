/**
 * Unified Storage Layer
 * Primary: IndexedDB via Dexie (web)
 * Fallback: localStorage (web) / in-memory (native)
 *
 * All reads come from IndexedDB first.
 * All writes go to IndexedDB immediately, set dirty=1, updated_at=now.
 * Soft deletes set deleted_at instead of removing rows.
 * UI queries always filter deleted_at === null.
 *
 * Auto-Push Integration:
 * - Every user-initiated write calls notifyLocalWrite() from autoPush.ts
 * - This triggers a debounced push (dirty rows only) 3-5 seconds later
 * - Remote users see changes faster via realtime subscriptions
 *
 * Load Map upgrades:
 * - sanitizeLoadMap(tripId): clears orphaned slot.load_item_id references to deleted/missing items
 * - loadMapSlotStore.countByTripId(tripId): lightweight count for "seed only if needed"
 */
import { Platform } from "react-native";
import { getDB } from "./db";
import type {
  LocalTrip,
  LocalRiskScore,
  LocalLoadItem,
  LocalLoadMapSlot,
  LocalFuelWaterLog,
  LocalWaypoint,
} from "./db";
import type {
  Trip,
  RiskScore,
  LoadItem,
  LoadMapSlot,
  FuelWaterLog,
  UserSettings,
  Waypoint,
} from "./types";
import { getAllSlotKeys } from "./theme";
import { notifyLocalWrite } from "./autoPush";


// ============================================================
// UUID + timestamp helpers
// ============================================================
export function generateUUID(): string {
  // crypto.randomUUID is supported in modern browsers; may be absent in some runtimes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

function isoToMs(iso: string) {
  return new Date(iso).getTime();
}

// ============================================================
// localStorage fallback (same as before, for non-web / IDB failure)
// ============================================================
const memoryStore: Record<string, string> = {};
const ls = {
  get: (k: string): string | null => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined")
      return localStorage.getItem(k);
    return memoryStore[k] || null;
  },
  set: (k: string, v: string) => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined")
      localStorage.setItem(k, v);
    memoryStore[k] = v;
  },
  del: (k: string) => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined")
      localStorage.removeItem(k);
    delete memoryStore[k];
  },
};

function lsGetAll<T>(key: string): T[] {
  const raw = ls.get(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}
function lsSaveAll<T>(key: string, items: T[]) {
  ls.set(key, JSON.stringify(items));
}

const LS_KEYS = {
  trips: "ecs_trips",
  riskScores: "ecs_risk_scores",
  loadItems: "ecs_load_items",
  loadMapSlots: "ecs_load_map_slots",
  fuelWaterLogs: "ecs_fuel_water_logs",
  waypoints: "ecs_waypoints",
  userSettings: "ecs_user_settings",
  activeTripId: "ecs_active_trip_id",
  lastSyncAt: "ecs_last_sync_at",
};

// ============================================================
// TRIPS
// ============================================================
export const tripStore = {
  getAll: async (): Promise<Trip[]> => {
    const db = getDB();
    if (db) {
      const all = await db.trips.toArray();
      return all
        .filter((r) => !r.deleted_at)
        .sort((a, b) => isoToMs(b.updated_at) - isoToMs(a.updated_at));
    }
    const all = lsGetAll<Trip>(LS_KEYS.trips);
    return all
      .filter((t) => !t.deleted_at)
      .sort((a, b) => isoToMs(b.updated_at) - isoToMs(a.updated_at));
  },

  getAllIncludeDeleted: async (): Promise<Trip[]> => {
    const db = getDB();
    if (db) return db.trips.toArray();
    return lsGetAll<Trip>(LS_KEYS.trips);
  },

  getById: async (id: string): Promise<Trip | null> => {
    const db = getDB();
    if (db) {
      const row = await db.trips.get(id);
      return row && !row.deleted_at ? row : null;
    }
    const all = lsGetAll<Trip>(LS_KEYS.trips);
    return all.find((t) => t.id === id && !t.deleted_at) || null;
  },

  create: async (partial: Partial<Trip> = {}): Promise<Trip> => {
    const trip: LocalTrip = {
      id: generateUUID(),
      user_id: partial.user_id || "local",
      name: partial.name || "New Trip",
      start_date: partial.start_date || null,
      end_date: partial.end_date || null,
      terrain_type: partial.terrain_type || null,
      season: partial.season || null,
      team_size: partial.team_size || 1,
      primary_vehicle: partial.primary_vehicle || null,
      route_distance_miles: partial.route_distance_miles || null,
      avg_miles_per_day: partial.avg_miles_per_day || null,
      active_mode: partial.active_mode || "Trip",
      capac_fuel_gal: partial.capac_fuel_gal || null,
      capac_mpg: partial.capac_mpg || null,
      capac_water_gal: partial.capac_water_gal || null,
      water_use_per_person_day: partial.water_use_per_person_day || null,
      battery_usable_wh: partial.battery_usable_wh || null,
      solar_watts: partial.solar_watts || null,
      sun_hours_per_day: partial.sun_hours_per_day || null,
      solar_efficiency: partial.solar_efficiency ?? 0.75,
      emergency_contact: partial.emergency_contact || null,
      created_at: nowISO(),
      updated_at: nowISO(),
      deleted_at: null,
      dirty: 1,
    };

    const db = getDB();
    if (db) {
      await db.trips.put(trip);
    } else {
      const all = lsGetAll<Trip>(LS_KEYS.trips);
      all.push({ ...(trip as any), dirty: true });
      lsSaveAll(LS_KEYS.trips, all);
    }
    notifyLocalWrite();
    return trip;
  },


  update: async (id: string, changes: Partial<Trip>): Promise<Trip | null> => {
    const db = getDB();
    if (db) {
      const existing = await db.trips.get(id);
      if (!existing) return null;
      const updated = {
        ...existing,
        ...changes,
        updated_at: nowISO(),
        dirty: 1,
      } as LocalTrip;
      await db.trips.put(updated);
      notifyLocalWrite();
      return updated;
    }

    const all = lsGetAll<Trip>(LS_KEYS.trips);
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      ...changes,
      updated_at: nowISO(),
      dirty: true,
    } as any;
    lsSaveAll(LS_KEYS.trips, all);
    notifyLocalWrite();
    return all[idx];
  },

  softDelete: async (id: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      await db.trips.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
    } else {
      const all = lsGetAll<Trip>(LS_KEYS.trips);
      const idx = all.findIndex((t) => t.id === id);
      if (idx !== -1) {
        (all[idx] as any).deleted_at = now;
        (all[idx] as any).updated_at = now;
        (all[idx] as any).dirty = true;
        lsSaveAll(LS_KEYS.trips, all);
      }
    }
    notifyLocalWrite();
  },


  getDirty: async (): Promise<Trip[]> => {
    const db = getDB();
    if (db) return db.trips.where("dirty").equals(1).toArray();
    return lsGetAll<Trip>(LS_KEYS.trips).filter((t: any) => t.dirty);
  },

  bulkUpsert: async (items: Trip[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.trips, async () => {
        for (const item of items) {
          const existing = await db.trips.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.trips.put({ ...(item as any), dirty: 0 } as LocalTrip);
        }
      });
    } else {
      const all = lsGetAll<Trip>(LS_KEYS.trips);
      for (const item of items) {
        const idx = all.findIndex((t) => t.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.trips, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.trips.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.trips.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<Trip>(LS_KEYS.trips);
      all.forEach((t: any) => (t.dirty = false));
      lsSaveAll(LS_KEYS.trips, all);
    }
  },

  /**
   * Clear dirty flags ONLY for the specified row IDs.
   * Rows not in the set (including rows dirtied after the snapshot) are left untouched.
   */
  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.trips, async () => {
        for (const id of ids) {
          const row = await db.trips.get(id);
          if (row && row.dirty === 1) {
            await db.trips.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<Trip>(LS_KEYS.trips);
      let changed = false;
      all.forEach((t: any) => {
        if (idSet.has(t.id) && t.dirty) {
          t.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.trips, all);
    }
  },
};



// ============================================================
// RISK SCORES
// ============================================================
export const riskScoreStore = {
  getByTripId: async (tripId: string): Promise<RiskScore | null> => {
    const db = getDB();
    if (db) {
      const rows = await db.risk_scores
        .where("trip_id")
        .equals(tripId)
        .toArray();
      return rows.find((r) => !r.deleted_at) || null;
    }
    const all = lsGetAll<RiskScore>(LS_KEYS.riskScores);
    return all.find((r) => r.trip_id === tripId && !r.deleted_at) || null;
  },

  getAllIncludeDeleted: async (): Promise<RiskScore[]> => {
    const db = getDB();
    if (db) return db.risk_scores.toArray();
    return lsGetAll<RiskScore>(LS_KEYS.riskScores);
  },

  upsert: async (tripId: string, data: Partial<RiskScore>): Promise<RiskScore> => {
    const db = getDB();
    const now = nowISO();

    if (db) {
      const existing = await db.risk_scores
        .where("trip_id")
        .equals(tripId)
        .toArray();
      const live = existing.find((r) => !r.deleted_at);
      if (live) {
        const updated = { ...live, ...data, updated_at: now, dirty: 1 } as LocalRiskScore;
        await db.risk_scores.put(updated);
        notifyLocalWrite();
        return updated;
      }

      const rs: LocalRiskScore = {
        id: generateUUID(),
        user_id: data.user_id || "local",
        trip_id: tripId,
        terrain_complexity: data.terrain_complexity || 1,
        weather_exposure: data.weather_exposure || 1,
        remoteness: data.remoteness || 1,
        recovery_availability: data.recovery_availability || 1,
        comms_coverage: data.comms_coverage || 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        dirty: 1,
      };
      await db.risk_scores.put(rs);
      notifyLocalWrite();
      return rs;
    }

    const all = lsGetAll<RiskScore>(LS_KEYS.riskScores);
    const idx = all.findIndex((r) => r.trip_id === tripId && !r.deleted_at);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...data, updated_at: now, dirty: true } as any;
      lsSaveAll(LS_KEYS.riskScores, all);
      notifyLocalWrite();
      return all[idx];
    }

    const rs: any = {
      id: generateUUID(),
      user_id: data.user_id || "local",
      trip_id: tripId,
      terrain_complexity: data.terrain_complexity || 1,
      weather_exposure: data.weather_exposure || 1,
      remoteness: data.remoteness || 1,
      recovery_availability: data.recovery_availability || 1,
      comms_coverage: data.comms_coverage || 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: true,
    };
    all.push(rs);
    lsSaveAll(LS_KEYS.riskScores, all);
    notifyLocalWrite();
    return rs;
  },


  getDirty: async (): Promise<RiskScore[]> => {
    const db = getDB();
    if (db) return db.risk_scores.where("dirty").equals(1).toArray();
    return lsGetAll<RiskScore>(LS_KEYS.riskScores).filter((r: any) => r.dirty);
  },

  bulkUpsert: async (items: RiskScore[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.risk_scores, async () => {
        for (const item of items) {
          const existing = await db.risk_scores.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.risk_scores.put({ ...(item as any), dirty: 0 } as LocalRiskScore);
        }
      });
    } else {
      const all = lsGetAll<RiskScore>(LS_KEYS.riskScores);
      for (const item of items) {
        const idx = all.findIndex((r) => r.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.riskScores, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.risk_scores.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.risk_scores.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<RiskScore>(LS_KEYS.riskScores);
      all.forEach((r: any) => (r.dirty = false));
      lsSaveAll(LS_KEYS.riskScores, all);
    }
  },

  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.risk_scores, async () => {
        for (const id of ids) {
          const row = await db.risk_scores.get(id);
          if (row && row.dirty === 1) {
            await db.risk_scores.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<RiskScore>(LS_KEYS.riskScores);
      let changed = false;
      all.forEach((r: any) => {
        if (idSet.has(r.id) && r.dirty) {
          r.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.riskScores, all);
    }
  },
};


// ============================================================
// LOAD ITEMS
// ============================================================
export const loadItemStore = {
  getByTripId: async (tripId: string): Promise<LoadItem[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.load_items.where("trip_id").equals(tripId).toArray();
      return rows
        .filter((i) => !i.deleted_at)
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
    return all
      .filter((i) => i.trip_id === tripId && !i.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order);
  },

  getAllIncludeDeleted: async (): Promise<LoadItem[]> => {
    const db = getDB();
    if (db) return db.load_items.toArray();
    return lsGetAll<LoadItem>(LS_KEYS.loadItems);
  },

  create: async (data: Partial<LoadItem>): Promise<LoadItem> => {
    const now = nowISO();
    const db = getDB();

    // Per-trip sort order
    const sortOrder =
      data.sort_order ??
      (db
        ? await db.load_items
            .where("trip_id")
            .equals(data.trip_id || "")
            .count()
        : lsGetAll<LoadItem>(LS_KEYS.loadItems).filter(
            (i) =>
              i.trip_id === (data.trip_id || "") &&
              !(i as any).deleted_at
          ).length);

    const item: LocalLoadItem = {
      id: generateUUID(),
      user_id: data.user_id || "local",
      trip_id: data.trip_id || "",
      name: data.name || "New Item",
      zone: data.zone || "Cab",
      qty: data.qty || 1,
      packed: data.packed || false,
      mode: data.mode || "Both",
      weight_lbs: data.weight_lbs || null,
      notes: data.notes || null,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: 1,
    };

    if (db) {
      await db.load_items.put(item);
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      all.push({ ...(item as any), dirty: true });
      lsSaveAll(LS_KEYS.loadItems, all);
    }
    notifyLocalWrite();
    return item;
  },

  update: async (id: string, changes: Partial<LoadItem>): Promise<LoadItem | null> => {
    const db = getDB();
    if (db) {
      const existing = await db.load_items.get(id);
      if (!existing) return null;
      const updated = {
        ...existing,
        ...changes,
        updated_at: nowISO(),
        dirty: 1,
      } as LocalLoadItem;
      await db.load_items.put(updated);
      notifyLocalWrite();
      return updated;
    }

    const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...changes, updated_at: nowISO(), dirty: true } as any;
    lsSaveAll(LS_KEYS.loadItems, all);
    notifyLocalWrite();
    return all[idx];
  },

  softDelete: async (id: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      await db.load_items.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      const idx = all.findIndex((i) => i.id === id);
      if (idx !== -1) {
        (all[idx] as any).deleted_at = now;
        (all[idx] as any).updated_at = now;
        (all[idx] as any).dirty = true;
        lsSaveAll(LS_KEYS.loadItems, all);
      }
    }
    notifyLocalWrite();
  },


  bulkUpdatePacked: async (
    tripId: string,
    zone: string | null,
    packed: boolean,
    activeMode?: string
  ): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      const items = await db.load_items.where("trip_id").equals(tripId).toArray();
      const toUpdate: LocalLoadItem[] = [];
      for (const item of items) {
        if (item.deleted_at) continue;
        const isActive = !activeMode || item.mode === activeMode || item.mode === "Both";
        if (!isActive) continue;
        if (zone && item.zone !== zone) continue;
        toUpdate.push({ ...item, packed, updated_at: now, dirty: 1 });
      }
      if (toUpdate.length > 0) await db.load_items.bulkPut(toUpdate);
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      all.forEach((item: any) => {
        if (item.trip_id !== tripId || item.deleted_at) return;
        const isActive = !activeMode || item.mode === activeMode || item.mode === "Both";
        if (!isActive) return;
        if (zone && item.zone !== zone) return;
        item.packed = packed;
        item.updated_at = now;
        item.dirty = true;
      });
      lsSaveAll(LS_KEYS.loadItems, all);
    }
    notifyLocalWrite();
  },


  getDirty: async (): Promise<LoadItem[]> => {
    const db = getDB();
    if (db) return db.load_items.where("dirty").equals(1).toArray();
    return lsGetAll<LoadItem>(LS_KEYS.loadItems).filter((i: any) => i.dirty);
  },

  bulkUpsert: async (items: LoadItem[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.load_items, async () => {
        for (const item of items) {
          const existing = await db.load_items.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.load_items.put({ ...(item as any), dirty: 0 } as LocalLoadItem);
        }
      });
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      for (const item of items) {
        const idx = all.findIndex((i) => i.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.loadItems, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.load_items.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.load_items.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      all.forEach((i: any) => (i.dirty = false));
      lsSaveAll(LS_KEYS.loadItems, all);
    }
  },

  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.load_items, async () => {
        for (const id of ids) {
          const row = await db.load_items.get(id);
          if (row && row.dirty === 1) {
            await db.load_items.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<LoadItem>(LS_KEYS.loadItems);
      let changed = false;
      all.forEach((i: any) => {
        if (idSet.has(i.id) && i.dirty) {
          i.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.loadItems, all);
    }
  },
};


// ============================================================
// LOAD MAP SLOTS
// ============================================================
export const loadMapSlotStore = {
  getByTripId: async (tripId: string): Promise<LoadMapSlot[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.load_map_slots
        .where("trip_id")
        .equals(tripId)
        .toArray();
      return rows.filter((s) => !s.deleted_at);
    }
    const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
    return all.filter((s) => s.trip_id === tripId && !s.deleted_at);
  },

  countByTripId: async (tripId: string): Promise<number> => {
    const db = getDB();
    if (db) {
      return db.load_map_slots.where("trip_id").equals(tripId).and((s: any) => !s.deleted_at).count();
    }
    return lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots).filter(
      (s: any) => s.trip_id === tripId && !s.deleted_at
    ).length;
  },

  getAllIncludeDeleted: async (): Promise<LoadMapSlot[]> => {
    const db = getDB();
    if (db) return db.load_map_slots.toArray();
    return lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
  },

  seedForTrip: async (tripId: string, userId?: string): Promise<number> => {
    const now = nowISO();
    const db = getDB();
    const allSlotDefs = getAllSlotKeys(); // 173 entries

    if (db) {
      const existing = await db.load_map_slots
        .where("trip_id")
        .equals(tripId)
        .toArray();
      const existingKeys = new Set(
        existing.filter((s) => !s.deleted_at).map((s) => s.slot_key)
      );

      const toCreate: LocalLoadMapSlot[] = [];
      for (const { zone, slotKey } of allSlotDefs) {
        if (existingKeys.has(slotKey)) continue;
        toCreate.push({
          id: generateUUID(),
          user_id: userId || "local",
          trip_id: tripId,
          zone,
          slot_key: slotKey,
          load_item_id: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          dirty: 1,
        });
      }

      if (toCreate.length > 0) await db.load_map_slots.bulkPut(toCreate);
      return toCreate.length;
    }

    const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
    const existingKeys = new Set(
      all.filter((s) => s.trip_id === tripId && !s.deleted_at).map((s) => s.slot_key)
    );

    let created = 0;
    for (const { zone, slotKey } of allSlotDefs) {
      if (existingKeys.has(slotKey)) continue;
      all.push({
        id: generateUUID(),
        user_id: userId || "local",
        trip_id: tripId,
        zone,
        slot_key: slotKey,
        load_item_id: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        dirty: true,
      } as any);
      created++;
    }
    if (created > 0) lsSaveAll(LS_KEYS.loadMapSlots, all);
    return created;
  },

  upsert: async (
    tripId: string,
    slotKey: string,
    zone: string,
    loadItemId: string | null,
    userId?: string
  ): Promise<LoadMapSlot> => {
    const now = nowISO();
    const db = getDB();

    if (db) {
      const existing = await db.load_map_slots
        .where("[trip_id+slot_key]")
        .equals([tripId, slotKey])
        .first();

      if (existing && !existing.deleted_at) {
        const updated = {
          ...existing,
          load_item_id: loadItemId,
          updated_at: now,
          dirty: 1,
        } as LocalLoadMapSlot;
        await db.load_map_slots.put(updated);
        notifyLocalWrite();
        return updated;
      }

      const slot: LocalLoadMapSlot = {
        id: generateUUID(),
        user_id: userId || "local",
        trip_id: tripId,
        zone,
        slot_key: slotKey,
        load_item_id: loadItemId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        dirty: 1,
      };
      await db.load_map_slots.put(slot);
      notifyLocalWrite();
      return slot;
    }

    const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
    const idx = all.findIndex(
      (s) => s.trip_id === tripId && s.slot_key === slotKey && !s.deleted_at
    );
    if (idx !== -1) {
      (all[idx] as any).load_item_id = loadItemId;
      (all[idx] as any).updated_at = now;
      (all[idx] as any).dirty = true;
      lsSaveAll(LS_KEYS.loadMapSlots, all);
      notifyLocalWrite();
      return all[idx];
    }

    const slot: any = {
      id: generateUUID(),
      user_id: userId || "local",
      trip_id: tripId,
      zone,
      slot_key: slotKey,
      load_item_id: loadItemId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: true,
    };
    all.push(slot);
    lsSaveAll(LS_KEYS.loadMapSlots, all);
    notifyLocalWrite();
    return slot;
  },


  clearSlot: async (tripId: string, slotKey: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();

    if (db) {
      const existing = await db.load_map_slots
        .where("[trip_id+slot_key]")
        .equals([tripId, slotKey])
        .first();
      if (existing && !existing.deleted_at) {
        await db.load_map_slots.put({
          ...existing,
          load_item_id: null,
          updated_at: now,
          dirty: 1,
        } as LocalLoadMapSlot);
      }
    } else {
      const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
      const idx = all.findIndex(
        (s) => s.trip_id === tripId && s.slot_key === slotKey && !s.deleted_at
      );
      if (idx !== -1) {
        (all[idx] as any).load_item_id = null;
        (all[idx] as any).updated_at = now;
        (all[idx] as any).dirty = true;
        lsSaveAll(LS_KEYS.loadMapSlots, all);
      }
    }
    notifyLocalWrite();
  },


  clearZone: async (tripId: string, zone: string): Promise<number> => {
    const now = nowISO();
    const db = getDB();
    let cleared = 0;

    if (db) {
      const slots = await db.load_map_slots.where("trip_id").equals(tripId).toArray();
      const toUpdate: LocalLoadMapSlot[] = [];
      for (const slot of slots) {
        if (slot.deleted_at || slot.zone !== zone || !slot.load_item_id) continue;
        toUpdate.push({ ...slot, load_item_id: null, updated_at: now, dirty: 1 });
        cleared++;
      }
      if (toUpdate.length > 0) await db.load_map_slots.bulkPut(toUpdate);
    } else {
      const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
      all.forEach((s: any) => {
        if (
          s.trip_id === tripId &&
          s.zone === zone &&
          !s.deleted_at &&
          s.load_item_id
        ) {
          s.load_item_id = null;
          s.updated_at = now;
          s.dirty = true;
          cleared++;
        }
      });
      if (cleared > 0) lsSaveAll(LS_KEYS.loadMapSlots, all);
    }
    notifyLocalWrite();
    return cleared;
  },


  getDirty: async (): Promise<LoadMapSlot[]> => {
    const db = getDB();
    if (db) return db.load_map_slots.where("dirty").equals(1).toArray();
    return lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots).filter((s: any) => s.dirty);
  },

  bulkUpsert: async (items: LoadMapSlot[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.load_map_slots, async () => {
        for (const item of items) {
          const existing = await db.load_map_slots.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.load_map_slots.put({ ...(item as any), dirty: 0 } as LocalLoadMapSlot);
        }
      });
    } else {
      const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
      for (const item of items) {
        const idx = all.findIndex((s) => s.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.loadMapSlots, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.load_map_slots.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.load_map_slots.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
      all.forEach((s: any) => (s.dirty = false));
      lsSaveAll(LS_KEYS.loadMapSlots, all);
    }
  },

  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.load_map_slots, async () => {
        for (const id of ids) {
          const row = await db.load_map_slots.get(id);
          if (row && row.dirty === 1) {
            await db.load_map_slots.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<LoadMapSlot>(LS_KEYS.loadMapSlots);
      let changed = false;
      all.forEach((s: any) => {
        if (idSet.has(s.id) && s.dirty) {
          s.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.loadMapSlots, all);
    }
  },
};


// ============================================================
// LOAD MAP INTEGRITY: clear orphaned slot->item references
// ============================================================
/**
 * If a slot references a deleted/missing load_item_id, clear it.
 * This prevents "ghost mappings" across sync/merges.
 *
 * Returns number of slots fixed.
 */
export async function sanitizeLoadMap(tripId: string): Promise<number> {
  const now = nowISO();
  const db = getDB();

  if (db) {
    const [slots, items] = await Promise.all([
      db.load_map_slots.where("trip_id").equals(tripId).toArray(),
      db.load_items.where("trip_id").equals(tripId).toArray(),
    ]);

    const validItems = new Set(items.filter((i) => !i.deleted_at).map((i) => i.id));

    const toUpdate: LocalLoadMapSlot[] = [];
    for (const s of slots) {
      if (s.deleted_at) continue;
      if (!s.load_item_id) continue;
      if (!validItems.has(s.load_item_id)) {
        toUpdate.push({ ...(s as any), load_item_id: null, updated_at: now, dirty: 1 });
      }
    }

    if (toUpdate.length > 0) await db.load_map_slots.bulkPut(toUpdate);
    return toUpdate.length;
  }

  // Fallback: localStorage/memory
  const slots = lsGetAll<any>(LS_KEYS.loadMapSlots);
  const items = lsGetAll<any>(LS_KEYS.loadItems);

  const validItems = new Set(items.filter((i: any) => !i.deleted_at).map((i: any) => i.id));

  let fixed = 0;
  for (const s of slots) {
    if (s.trip_id !== tripId) continue;
    if (s.deleted_at) continue;
    if (!s.load_item_id) continue;
    if (!validItems.has(s.load_item_id)) {
      s.load_item_id = null;
      s.updated_at = now;
      s.dirty = true;
      fixed++;
    }
  }

  if (fixed > 0) lsSaveAll(LS_KEYS.loadMapSlots, slots);
  return fixed;
}

// ============================================================
// LOAD MAP STATS HELPER
// ============================================================
export function getLoadMapStats(
  slots: LoadMapSlot[],
  items: LoadItem[]
): { mappedItems: number; mappedNotPacked: number; totalSlots: number; emptySlots: number } {
  const itemMap = new Map<string, LoadItem>();
  for (const item of items) {
    if (!item.deleted_at) itemMap.set(item.id, item);
  }

  let mappedItems = 0;
  let mappedNotPacked = 0;
  let emptySlots = 0;

  for (const slot of slots) {
    if (slot.deleted_at) continue;
    if (slot.load_item_id) {
      const item = itemMap.get(slot.load_item_id);
      if (item) {
        mappedItems++;
        if (!item.packed) mappedNotPacked++;
      } else {
        emptySlots++;
      }
    } else {
      emptySlots++;
    }
  }

  return {
    mappedItems,
    mappedNotPacked,
    totalSlots: slots.filter((s) => !s.deleted_at).length,
    emptySlots,
  };
}

// ============================================================
// FUEL WATER LOGS
// ============================================================
export const fuelWaterLogStore = {
  getByTripId: async (tripId: string): Promise<FuelWaterLog[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.fuel_water_logs
        .where("trip_id")
        .equals(tripId)
        .toArray();
      return rows
        .filter((l) => !l.deleted_at)
        .sort(
          (a, b) =>
            new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        );
    }
    const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
    return all
      .filter((l) => l.trip_id === tripId && !l.deleted_at)
      .sort(
        (a, b) =>
          new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
      );
  },

  getAllIncludeDeleted: async (): Promise<FuelWaterLog[]> => {
    const db = getDB();
    if (db) return db.fuel_water_logs.toArray();
    return lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
  },

  create: async (data: Partial<FuelWaterLog>): Promise<FuelWaterLog> => {
    const now = nowISO();
    const log: LocalFuelWaterLog = {
      id: generateUUID(),
      user_id: data.user_id || "local",
      trip_id: data.trip_id || "",
      log_date: data.log_date || new Date().toISOString().split("T")[0],
      fuel_remaining_gal: data.fuel_remaining_gal || null,
      water_remaining_gal: data.water_remaining_gal || null,
      notes: data.notes || null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: 1,
    };

    const db = getDB();
    if (db) {
      await db.fuel_water_logs.put(log);
    } else {
      const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
      all.push({ ...(log as any), dirty: true });
      lsSaveAll(LS_KEYS.fuelWaterLogs, all);
    }
    notifyLocalWrite();
    return log;

  },

  softDelete: async (id: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      await db.fuel_water_logs.update(id, {
        deleted_at: now,
        updated_at: now,
        dirty: 1,
      });
    } else {
      const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
      const idx = all.findIndex((l) => l.id === id);
      if (idx !== -1) {
        (all[idx] as any).deleted_at = now;
        (all[idx] as any).updated_at = now;
        (all[idx] as any).dirty = true;
        lsSaveAll(LS_KEYS.fuelWaterLogs, all);
      }
    }
    notifyLocalWrite();
  },


  getDirty: async (): Promise<FuelWaterLog[]> => {
    const db = getDB();
    if (db) return db.fuel_water_logs.where("dirty").equals(1).toArray();
    return lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs).filter((l: any) => l.dirty);
  },

  bulkUpsert: async (items: FuelWaterLog[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.fuel_water_logs, async () => {
        for (const item of items) {
          const existing = await db.fuel_water_logs.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.fuel_water_logs.put({
            ...(item as any),
            dirty: 0,
          } as LocalFuelWaterLog);
        }
      });
    } else {
      const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
      for (const item of items) {
        const idx = all.findIndex((l) => l.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.fuelWaterLogs, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.fuel_water_logs.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.fuel_water_logs.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
      all.forEach((l: any) => (l.dirty = false));
      lsSaveAll(LS_KEYS.fuelWaterLogs, all);
    }
  },

  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.fuel_water_logs, async () => {
        for (const id of ids) {
          const row = await db.fuel_water_logs.get(id);
          if (row && row.dirty === 1) {
            await db.fuel_water_logs.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<FuelWaterLog>(LS_KEYS.fuelWaterLogs);
      let changed = false;
      all.forEach((l: any) => {
        if (idSet.has(l.id) && l.dirty) {
          l.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.fuelWaterLogs, all);
    }
  },
};


// ============================================================
// WAYPOINTS
// ============================================================
export const waypointStore = {
  getByTripId: async (tripId: string): Promise<Waypoint[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.waypoints.where("trip_id").equals(tripId).toArray();
      return rows
        .filter((w) => !w.deleted_at)
        .sort(
          (a, b) =>
            new Date(a.recorded_at).getTime() -
            new Date(b.recorded_at).getTime()
        );
    }
    const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
    return all
      .filter((w) => w.trip_id === tripId && !w.deleted_at)
      .sort(
        (a, b) =>
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime()
      );
  },

  getBySession: async (tripId: string, sessionId: string): Promise<Waypoint[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.waypoints.where("trip_id").equals(tripId).toArray();
      return rows
        .filter((w) => w.session_id === sessionId && !w.deleted_at)
        .sort(
          (a, b) =>
            new Date(a.recorded_at).getTime() -
            new Date(b.recorded_at).getTime()
        );
    }
    const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
    return all
      .filter(
        (w) =>
          w.trip_id === tripId &&
          w.session_id === sessionId &&
          !w.deleted_at
      )
      .sort(
        (a, b) =>
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime()
      );
  },

  getSessions: async (tripId: string): Promise<string[]> => {
    const db = getDB();
    if (db) {
      const rows = await db.waypoints.where("trip_id").equals(tripId).toArray();
      const sessions = new Set<string>();
      rows
        .filter((w) => !w.deleted_at && w.session_id)
        .forEach((w) => sessions.add(w.session_id!));
      return Array.from(sessions);
    }
    const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
    const sessions = new Set<string>();
    all
      .filter((w) => w.trip_id === tripId && !w.deleted_at && w.session_id)
      .forEach((w) => sessions.add(w.session_id!));
    return Array.from(sessions);
  },

  getAllIncludeDeleted: async (): Promise<Waypoint[]> => {
    const db = getDB();
    if (db) return db.waypoints.toArray();
    return lsGetAll<Waypoint>(LS_KEYS.waypoints);
  },

  create: async (data: Partial<Waypoint>): Promise<Waypoint> => {
    const now = nowISO();
    const wp: LocalWaypoint = {
      id: generateUUID(),
      user_id: data.user_id || "local",
      trip_id: data.trip_id || "",
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      altitude: data.altitude ?? null,
      speed: data.speed ?? null,
      heading: data.heading ?? null,
      accuracy: data.accuracy ?? null,
      recorded_at: data.recorded_at || now,
      session_id: data.session_id || null,
      notes: data.notes || null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: 1,
    };

    const db = getDB();
    if (db) {
      await db.waypoints.put(wp);
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      all.push({ ...(wp as any), dirty: true });
      lsSaveAll(LS_KEYS.waypoints, all);
    }
    notifyLocalWrite();
    return wp;

  },

  softDelete: async (id: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      await db.waypoints.update(id, { deleted_at: now, updated_at: now, dirty: 1 });
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      const idx = all.findIndex((w) => w.id === id);
      if (idx !== -1) {
        (all[idx] as any).deleted_at = now;
        (all[idx] as any).updated_at = now;
        (all[idx] as any).dirty = true;
        lsSaveAll(LS_KEYS.waypoints, all);
      }
    }
    notifyLocalWrite();
  },


  softDeleteSession: async (tripId: string, sessionId: string): Promise<void> => {
    const now = nowISO();
    const db = getDB();
    if (db) {
      const wps = await db.waypoints.where("trip_id").equals(tripId).toArray();
      const toUpdate = wps
        .filter((w) => w.session_id === sessionId && !w.deleted_at)
        .map((w) => ({ ...w, deleted_at: now, updated_at: now, dirty: 1 }));
      if (toUpdate.length > 0)
        await db.waypoints.bulkPut(toUpdate as LocalWaypoint[]);
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      all.forEach((w: any) => {
        if (w.trip_id === tripId && w.session_id === sessionId && !w.deleted_at) {
          w.deleted_at = now;
          w.updated_at = now;
          w.dirty = true;
        }
      });
      lsSaveAll(LS_KEYS.waypoints, all);
    }
    notifyLocalWrite();
  },


  getDirty: async (): Promise<Waypoint[]> => {
    const db = getDB();
    if (db) return db.waypoints.where("dirty").equals(1).toArray();
    return lsGetAll<Waypoint>(LS_KEYS.waypoints).filter((w: any) => w.dirty);
  },

  bulkUpsert: async (items: Waypoint[]): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.waypoints, async () => {
        for (const item of items) {
          const existing = await db.waypoints.get(item.id);
          if (
            existing &&
            existing.dirty === 1 &&
            new Date(existing.updated_at) > new Date(item.updated_at)
          )
            continue;
          await db.waypoints.put({ ...(item as any), dirty: 0 } as LocalWaypoint);
        }
      });
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      for (const item of items) {
        const idx = all.findIndex((w) => w.id === item.id);
        if (idx !== -1) {
          if (
            (all[idx] as any).dirty &&
            new Date(all[idx].updated_at) > new Date(item.updated_at)
          )
            continue;
          all[idx] = { ...item, dirty: false } as any;
        } else {
          all.push({ ...item, dirty: false } as any);
        }
      }
      lsSaveAll(LS_KEYS.waypoints, all);
    }
  },

  clearDirty: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      const dirty = await db.waypoints.where("dirty").equals(1).toArray();
      if (dirty.length > 0)
        await db.waypoints.bulkPut(dirty.map((d) => ({ ...d, dirty: 0 })));
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      all.forEach((w: any) => (w.dirty = false));
      lsSaveAll(LS_KEYS.waypoints, all);
    }
  },

  clearDirtyForIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const db = getDB();
    if (db) {
      await db.transaction("rw", db.waypoints, async () => {
        for (const id of ids) {
          const row = await db.waypoints.get(id);
          if (row && row.dirty === 1) {
            await db.waypoints.put({ ...row, dirty: 0 });
          }
        }
      });
    } else {
      const all = lsGetAll<Waypoint>(LS_KEYS.waypoints);
      let changed = false;
      all.forEach((w: any) => {
        if (idSet.has(w.id) && w.dirty) {
          w.dirty = false;
          changed = true;
        }
      });
      if (changed) lsSaveAll(LS_KEYS.waypoints, all);
    }
  },
};


// ============================================================
// ONE-TIME MIGRATION: old Roof zone -> new rig-aware roof zones
// Moves roof-01..roof-12 into:
//   01-04 -> cabroof-01..04
//   05-07 -> bedrack-01..03
//   08-10 -> smartcaproof-01..03
//   11    -> alucabroof-01
//   12    -> shellroof-01
//
// Then soft-deletes the old roof-* rows so totals stay at 173.
// Safe to run multiple times (idempotent-ish).
// ============================================================
export async function migrateLegacyRoofSlots(): Promise<{ migrated: number; deleted: number }> {
  const db = getDB();
  const now = nowISO();

  // If no IndexedDB, migrate localStorage fallback instead
  const migrateRows = async (rows: any[]) => {
    const byKey = new Map<string, any>();
    rows.forEach(r => {
      if (!r.deleted_at) byKey.set(r.slot_key, r);
    });

    const mapOldToNew = (oldKey: string) => {
      const n = Number(oldKey.split('-')[1]); // roof-01 -> 1
      if (!Number.isFinite(n) || n < 1 || n > 12) return null;

      if (n >= 1 && n <= 4) return { zone: 'Cab Roof', slot_key: `cabroof-${String(n).padStart(2, '0')}` };

      if (n >= 5 && n <= 7) {
        const i = n - 4; // 5->1, 7->3
        return { zone: 'Bed Rack', slot_key: `bedrack-${String(i).padStart(2, '0')}` };
      }

      if (n >= 8 && n <= 10) {
        const i = n - 7; // 8->1, 10->3
        return { zone: 'SmartCap Roof', slot_key: `smartcaproof-${String(i).padStart(2, '0')}` };
      }

      if (n === 11) return { zone: 'Alu-Cab Roof', slot_key: 'alucabroof-01' };
      if (n === 12) return { zone: 'Shell Roof', slot_key: 'shellroof-01' };

      return null;
    };

    let migrated = 0;
    let deleted = 0;

    // Only legacy rows
    const legacy = rows.filter(r => !r.deleted_at && (r.zone === 'Roof' || String(r.slot_key || '').startsWith('roof-')));

    for (const old of legacy) {
      const target = mapOldToNew(old.slot_key);
      if (!target) continue;

      const existingNew = byKey.get(target.slot_key);

      // If new slot doesn't exist OR is empty, migrate assignment over.
      const shouldWrite =
        !existingNew ||
        !existingNew.load_item_id ||
        (existingNew.load_item_id && old.load_item_id && new Date(old.updated_at) > new Date(existingNew.updated_at));

      if (shouldWrite) {
        const newRow = {
          ...old,
          id: existingNew?.id || generateUUID(),
          zone: target.zone,
          slot_key: target.slot_key,
          updated_at: now,
          // mark dirty so it syncs
          dirty: 1,
          deleted_at: null,
        };
        rows.push(newRow);
        byKey.set(target.slot_key, newRow);
        migrated++;
      }

      // Soft-delete old legacy slot row so totals don't inflate
      old.deleted_at = now;
      old.updated_at = now;
      old.dirty = 1;
      deleted++;
    }

    return { rows, migrated, deleted };
  };

  // IndexedDB path (Dexie)
  if (db) {
    const trips = await db.trips.toArray();

    let migratedTotal = 0;
    let deletedTotal = 0;

    await db.transaction('rw', db.load_map_slots, async () => {
      for (const trip of trips) {
        const rows = await db.load_map_slots.where('trip_id').equals(trip.id).toArray();

        const { rows: nextRows, migrated, deleted } = await migrateRows(rows as any[]);
        migratedTotal += migrated;
        deletedTotal += deleted;

        // Persist:
        // 1) update deleted legacy rows + updated rows
        // 2) insert/overwrite new rows
        await db.load_map_slots.bulkPut(nextRows as any);
      }
    });

    return { migrated: migratedTotal, deleted: deletedTotal };
  }

  // localStorage fallback path
  const all = lsGetAll<any>(LS_KEYS.loadMapSlots);
  const byTrip = new Map<string, any[]>();
  all.forEach(r => {
    const tid = r.trip_id || 'unknown';
    byTrip.set(tid, [...(byTrip.get(tid) || []), r]);
  });

  let migratedTotal = 0;
  let deletedTotal = 0;

  const nextAll: any[] = [];
  for (const [_tripId, rows] of byTrip) {
    const { rows: nextRows, migrated, deleted } = await migrateRows(rows);
    migratedTotal += migrated;
    deletedTotal += deleted;
    nextAll.push(...nextRows);
  }

  lsSaveAll(LS_KEYS.loadMapSlots, nextAll);
  return { migrated: migratedTotal, deleted: deletedTotal };
}

// ============================================================
// USER SETTINGS
// ============================================================
export const userSettingsStore = {
  get: async (): Promise<UserSettings | null> => {
    const db = getDB();
    if (db) {
      const all = await db.user_settings.toArray();
      return all[0] || null;
    }
    const raw = ls.get(LS_KEYS.userSettings);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  save: async (settings: UserSettings): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.user_settings.put(settings);
    } else {
      ls.set(LS_KEYS.userSettings, JSON.stringify(settings));
    }
  },
};

// ============================================================
// ACTIVE TRIP
// ============================================================
export const activeTripStore = {
  get: async (): Promise<string | null> => {
    const db = getDB();
    if (db) {
      const meta = await db.sync_meta.get("active_trip_id");
      return meta?.value || null;
    }
    return ls.get(LS_KEYS.activeTripId);
  },

  set: async (id: string): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.sync_meta.put({ key: "active_trip_id", value: id });
    } else {
      ls.set(LS_KEYS.activeTripId, id);
    }
  },

  clear: async (): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.sync_meta.delete("active_trip_id");
    } else {
      ls.del(LS_KEYS.activeTripId);
    }
  },
};

// ============================================================
// SYNC META
// ============================================================
export const syncMetaStore = {
  getLastSync: async (): Promise<string | null> => {
    const db = getDB();
    if (db) {
      const meta = await db.sync_meta.get("last_sync_at");
      return meta?.value || null;
    }
    return ls.get(LS_KEYS.lastSyncAt);
  },

  setLastSync: async (ts: string): Promise<void> => {
    const db = getDB();
    if (db) {
      await db.sync_meta.put({ key: "last_sync_at", value: ts });
    } else {
      ls.set(LS_KEYS.lastSyncAt, ts);
    }
  },
};

// ============================================================
// DATA MIGRATION: localStorage -> IndexedDB (one-time)
// ============================================================
export async function migrateLocalStorageToIndexedDB(): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  const migrated = await db.sync_meta.get("ls_migrated");
  if (migrated) return false;

  let didMigrate = false;

  const tripData = lsGetAll<any>(LS_KEYS.trips);
  if (tripData.length > 0) {
    await db.trips.bulkPut(tripData.map((t: any) => ({ ...t, dirty: t.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const riskData = lsGetAll<any>(LS_KEYS.riskScores);
  if (riskData.length > 0) {
    await db.risk_scores.bulkPut(riskData.map((r: any) => ({ ...r, dirty: r.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const itemData = lsGetAll<any>(LS_KEYS.loadItems);
  if (itemData.length > 0) {
    await db.load_items.bulkPut(itemData.map((i: any) => ({ ...i, dirty: i.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const slotData = lsGetAll<any>(LS_KEYS.loadMapSlots);
  if (slotData.length > 0) {
    await db.load_map_slots.bulkPut(slotData.map((s: any) => ({ ...s, dirty: s.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const logData = lsGetAll<any>(LS_KEYS.fuelWaterLogs);
  if (logData.length > 0) {
    await db.fuel_water_logs.bulkPut(logData.map((l: any) => ({ ...l, dirty: l.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const wpData = lsGetAll<any>(LS_KEYS.waypoints);
  if (wpData.length > 0) {
    await db.waypoints.bulkPut(wpData.map((w: any) => ({ ...w, dirty: w.dirty ? 1 : 0 })));
    didMigrate = true;
  }

  const activeId = ls.get(LS_KEYS.activeTripId);
  if (activeId) await db.sync_meta.put({ key: "active_trip_id", value: activeId });

  const lastSync = ls.get(LS_KEYS.lastSyncAt);
  if (lastSync) await db.sync_meta.put({ key: "last_sync_at", value: lastSync });

  const settingsRaw = ls.get(LS_KEYS.userSettings);
  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw);
      await db.user_settings.put(settings);
    } catch {
      // ignore parse errors
    }
  }

  await db.sync_meta.put({ key: "ls_migrated", value: new Date().toISOString() });

  return didMigrate;
}

// ============================================================
// DIRTY COUNT (for sync badge)
// ============================================================
export async function getDirtyCount(): Promise<number> {
  const db = getDB();
  if (db) {
    const counts = await Promise.all([
      db.trips.where("dirty").equals(1).count(),
      db.risk_scores.where("dirty").equals(1).count(),
      db.load_items.where("dirty").equals(1).count(),
      db.load_map_slots.where("dirty").equals(1).count(),
      db.fuel_water_logs.where("dirty").equals(1).count(),
      db.waypoints.where("dirty").equals(1).count(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  }

  const tables = [
    LS_KEYS.trips,
    LS_KEYS.riskScores,
    LS_KEYS.loadItems,
    LS_KEYS.loadMapSlots,
    LS_KEYS.fuelWaterLogs,
    LS_KEYS.waypoints,
  ];

  let count = 0;
  for (const key of tables) {
    count += lsGetAll<any>(key).filter((r: any) => r.dirty).length;
  }
  return count;
}
