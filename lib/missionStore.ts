// ============================================================
// ECS MISSION STORE — Offline-First Persistence
// ============================================================
// All mission data stored locally. Sync can be added later.
// Uses localStorage (web) / memory (native) pattern from app.
// ============================================================

import { Platform } from 'react-native';
import type {
  MissionExpedition,
  MissionStatus,
  ExpeditionSnapshot,
  SnapshotData,
  ExpeditionItem,
  ExpeditionItemStatus,
  ExpeditionEvent,
  ExpeditionEventType,
  ExpeditionNote,
  ExpeditionCheckpoint,
  MissionStats,
} from './missionTypes';
import type { TerrainProfile } from './terrainProfile';
import { createDefaultTerrainProfile, terrainProfileStore } from './terrainProfile';

const TAG = '[MISSION_STORE]';

// ── Storage helpers ──────────────────────────────────────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const now = () => new Date().toISOString();

// ── Storage keys ─────────────────────────────────────────────
const KEYS = {
  expeditions: 'ecs_mission_expeditions',
  snapshots: 'ecs_mission_snapshots',
  items: 'ecs_mission_items',
  events: 'ecs_mission_events',
  notes: 'ecs_mission_notes',
  checkpoints: 'ecs_mission_checkpoints',
  activeExpeditionId: 'ecs_mission_active_id',
};

// ── Generic CRUD helpers ─────────────────────────────────────
function getAll<T>(key: string): T[] {
  try {
    const raw = sGet(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveAll<T>(key: string, items: T[]): void {
  sSet(key, JSON.stringify(items));
}

// ============================================================
// EXPEDITION STORE
// ============================================================
export const missionExpeditionStore = {
  getAll: (): MissionExpedition[] => getAll<MissionExpedition>(KEYS.expeditions),

  getById: (id: string): MissionExpedition | null => {
    return getAll<MissionExpedition>(KEYS.expeditions).find(e => e.id === id) || null;
  },

  getActive: (): MissionExpedition | null => {
    const id = sGet(KEYS.activeExpeditionId);
    if (!id) return null;
    return getAll<MissionExpedition>(KEYS.expeditions).find(e => e.id === id && e.status === 'active') || null;
  },

  create: (data: {
    name: string;
    vehicleId: string;
    vehicleName: string;
    sourceLoadoutId: string;
    snapshotId: string;
  }): MissionExpedition => {
    const exp: MissionExpedition = {
      id: uuid(),
      name: data.name,
      status: 'active',
      vehicleId: data.vehicleId,
      vehicleName: data.vehicleName,
      sourceLoadoutId: data.sourceLoadoutId,
      snapshotId: data.snapshotId,
      startedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    const all = getAll<MissionExpedition>(KEYS.expeditions);
    all.push(exp);
    saveAll(KEYS.expeditions, all);
    sSet(KEYS.activeExpeditionId, exp.id);
    console.log(TAG, `Created expedition: ${exp.id}`);
    return exp;
  },

  updateStatus: (id: string, status: MissionStatus): MissionExpedition | null => {
    const all = getAll<MissionExpedition>(KEYS.expeditions);
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return null;
    all[idx].status = status;
    all[idx].updatedAt = now();
    if (status === 'completed' || status === 'archived') {
      all[idx].endedAt = now();
      const activeId = sGet(KEYS.activeExpeditionId);
      if (activeId === id) sRemove(KEYS.activeExpeditionId);
    }
    saveAll(KEYS.expeditions, all);
    return all[idx];
  },

  setActiveId: (id: string | null): void => {
    if (id) sSet(KEYS.activeExpeditionId, id);
    else sRemove(KEYS.activeExpeditionId);
  },

  getActiveId: (): string | null => sGet(KEYS.activeExpeditionId),
};

// ============================================================
// SNAPSHOT STORE
// ============================================================
export const missionSnapshotStore = {
  getById: (id: string): ExpeditionSnapshot | null => {
    return getAll<ExpeditionSnapshot>(KEYS.snapshots).find(s => s.id === id) || null;
  },

  create: (expeditionId: string, sourceLoadoutId: string, snapshotJson: SnapshotData): ExpeditionSnapshot => {
    const snap: ExpeditionSnapshot = {
      id: uuid(),
      expeditionId,
      sourceLoadoutId,
      snapshotVersion: 1,
      snapshotJson,
      createdAt: now(),
    };
    const all = getAll<ExpeditionSnapshot>(KEYS.snapshots);
    all.push(snap);
    saveAll(KEYS.snapshots, all);
    console.log(TAG, `Created snapshot: ${snap.id} for expedition ${expeditionId}`);
    return snap;
  },

  getByExpeditionId: (expeditionId: string): ExpeditionSnapshot | null => {
    return getAll<ExpeditionSnapshot>(KEYS.snapshots).find(s => s.expeditionId === expeditionId) || null;
  },
};

// ============================================================
// EXPEDITION ITEMS STORE
// ============================================================
export const missionItemStore = {
  getByExpeditionId: (expeditionId: string): ExpeditionItem[] => {
    return getAll<ExpeditionItem>(KEYS.items).filter(i => i.expeditionId === expeditionId);
  },

  createFromSnapshot: (expeditionId: string, snapshotItems: { id: string; name: string; category: string; quantity: number; isCritical: boolean; isPacked: boolean; storageLocation: string | null }[]): ExpeditionItem[] => {
    const all = getAll<ExpeditionItem>(KEYS.items);
    const created: ExpeditionItem[] = [];

    for (const si of snapshotItems) {
      const item: ExpeditionItem = {
        id: uuid(),
        expeditionId,
        snapshotItemId: si.id,
        name: si.name,
        categoryKey: si.category,
        zoneId: si.storageLocation || null,
        qtyPlanned: si.quantity,
        qtyPacked: si.isPacked ? si.quantity : 0,
        qtyUsed: 0,
        critical: si.isCritical,
        status: si.isPacked ? 'packed' : 'missing',
        lastChangedAt: now(),
      };
      all.push(item);
      created.push(item);
    }

    saveAll(KEYS.items, all);
    console.log(TAG, `Created ${created.length} expedition items for ${expeditionId}`);
    return created;
  },

  updateStatus: (itemId: string, status: ExpeditionItemStatus, qtyUsed?: number): ExpeditionItem | null => {
    const all = getAll<ExpeditionItem>(KEYS.items);
    const idx = all.findIndex(i => i.id === itemId);
    if (idx === -1) return null;
    all[idx].status = status;
    if (typeof qtyUsed === 'number') all[idx].qtyUsed = qtyUsed;
    all[idx].lastChangedAt = now();
    saveAll(KEYS.items, all);
    return all[idx];
  },

  useItem: (itemId: string, qty: number = 1): ExpeditionItem | null => {
    const all = getAll<ExpeditionItem>(KEYS.items);
    const idx = all.findIndex(i => i.id === itemId);
    if (idx === -1) return null;
    all[idx].qtyUsed = Math.min(all[idx].qtyUsed + qty, all[idx].qtyPlanned);
    if (all[idx].qtyUsed >= all[idx].qtyPlanned) {
      all[idx].status = 'consumed';
    } else {
      all[idx].status = 'deployed';
    }
    all[idx].lastChangedAt = now();
    saveAll(KEYS.items, all);
    return all[idx];
  },
};

// ============================================================
// EVENTS STORE (append-only)
// ============================================================
export const missionEventStore = {
  getByExpeditionId: (expeditionId: string): ExpeditionEvent[] => {
    return getAll<ExpeditionEvent>(KEYS.events)
      .filter(e => e.expeditionId === expeditionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  append: (expeditionId: string, type: ExpeditionEventType, payload: Record<string, any> = {}): ExpeditionEvent => {
    const event: ExpeditionEvent = {
      id: uuid(),
      expeditionId,
      type,
      payload,
      createdAt: now(),
    };
    const all = getAll<ExpeditionEvent>(KEYS.events);
    all.push(event);
    saveAll(KEYS.events, all);
    return event;
  },
};

// ============================================================
// NOTES STORE
// ============================================================
export const missionNoteStore = {
  getByExpeditionId: (expeditionId: string): ExpeditionNote[] => {
    return getAll<ExpeditionNote>(KEYS.notes)
      .filter(n => n.expeditionId === expeditionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  create: (expeditionId: string, text: string, tag?: string): ExpeditionNote => {
    const note: ExpeditionNote = {
      id: uuid(),
      expeditionId,
      text,
      tag: tag || null,
      createdAt: now(),
    };
    const all = getAll<ExpeditionNote>(KEYS.notes);
    all.push(note);
    saveAll(KEYS.notes, all);
    return note;
  },

  remove: (noteId: string): boolean => {
    const all = getAll<ExpeditionNote>(KEYS.notes);
    const next = all.filter((note) => note.id !== noteId);
    if (next.length === all.length) return false;
    saveAll(KEYS.notes, next);
    return true;
  },
};

// ============================================================
// CHECKPOINTS STORE
// ============================================================
export const missionCheckpointStore = {
  getByExpeditionId: (expeditionId: string): ExpeditionCheckpoint[] => {
    return getAll<ExpeditionCheckpoint>(KEYS.checkpoints)
      .filter(c => c.expeditionId === expeditionId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  create: (expeditionId: string, label: string, lat?: number, lng?: number, meta?: Record<string, any>): ExpeditionCheckpoint => {
    const cp: ExpeditionCheckpoint = {
      id: uuid(),
      expeditionId,
      label,
      lat: lat ?? null,
      lng: lng ?? null,
      timestamp: now(),
      meta: meta || null,
    };
    const all = getAll<ExpeditionCheckpoint>(KEYS.checkpoints);
    all.push(cp);
    saveAll(KEYS.checkpoints, all);
    return cp;
  },
};

// ============================================================
// COMPUTED STATS
// ============================================================
export function computeMissionStats(expeditionId: string): MissionStats {
  const items = missionItemStore.getByExpeditionId(expeditionId);
  const events = missionEventStore.getByExpeditionId(expeditionId);
  const notes = missionNoteStore.getByExpeditionId(expeditionId);
  const checkpoints = missionCheckpointStore.getByExpeditionId(expeditionId);
  const expedition = missionExpeditionStore.getById(expeditionId);

  let waterUsed = 0;
  for (const e of events) {
    if (e.type === 'WATER_USED' && typeof e.payload?.liters === 'number') {
      waterUsed += e.payload.liters;
    }
  }

  let elapsedHours = 0;
  if (expedition?.startedAt) {
    const start = new Date(expedition.startedAt).getTime();
    const end = expedition.endedAt ? new Date(expedition.endedAt).getTime() : Date.now();
    elapsedHours = Math.round((end - start) / (1000 * 60 * 60) * 10) / 10;
  }

  return {
    totalItems: items.length,
    packedItems: items.filter(i => i.status === 'packed').length,
    usedItems: items.filter(i => i.status === 'deployed').length,
    consumedItems: items.filter(i => i.status === 'consumed').length,
    lostItems: items.filter(i => i.status === 'lost').length,
    criticalItems: items.filter(i => i.critical).length,
    criticalMissing: items.filter(i => i.critical && i.status === 'missing').length,
    eventCount: events.length,
    noteCount: notes.length,
    checkpointCount: checkpoints.length,
    waterUsedLiters: waterUsed,
    elapsedHours,
  };
}

// ============================================================
// ============================================================
// LAUNCH EXPEDITION — Full orchestration
// Phase 6A: Now accepts optional terrainProfile
// ============================================================
export function launchExpedition(params: {
  name: string;
  vehicleId: string;
  vehicleName: string;
  sourceLoadoutId: string;
  snapshotData: SnapshotData;
  terrainProfile?: TerrainProfile;
}): { expedition: MissionExpedition; snapshot: ExpeditionSnapshot; items: ExpeditionItem[] } {
  // 1. Create snapshot first (we need the ID)
  const snapshotId = 'snap_' + Date.now();
  const expedition = missionExpeditionStore.create({
    name: params.name,
    vehicleId: params.vehicleId,
    vehicleName: params.vehicleName,
    sourceLoadoutId: params.sourceLoadoutId,
    snapshotId,
  });

  // Phase 6A: Attach terrain profile to expedition
  const profile = params.terrainProfile || createDefaultTerrainProfile();
  expedition.terrainProfile = profile;

  // Persist terrain profile for this expedition
  terrainProfileStore.save(expedition.id, profile);

  // Update expedition record with terrain profile
  const allExpsForProfile = getAll<MissionExpedition>(KEYS.expeditions);
  const profileIdx = allExpsForProfile.findIndex(e => e.id === expedition.id);
  if (profileIdx !== -1) {
    allExpsForProfile[profileIdx].terrainProfile = profile;
    saveAll(KEYS.expeditions, allExpsForProfile);
  }

  // 2. Create snapshot
  const snapshot = missionSnapshotStore.create(
    expedition.id,
    params.sourceLoadoutId,
    params.snapshotData
  );

  // 3. Update expedition with real snapshot ID
  const allExps = getAll<MissionExpedition>(KEYS.expeditions);
  const idx = allExps.findIndex(e => e.id === expedition.id);
  if (idx !== -1) {
    allExps[idx].snapshotId = snapshot.id;
    saveAll(KEYS.expeditions, allExps);
    expedition.snapshotId = snapshot.id;
  }

  // 4. Create expedition items from snapshot
  const items = missionItemStore.createFromSnapshot(expedition.id, params.snapshotData.items);

  // 5. Log launch event
  missionEventStore.append(expedition.id, 'EXPEDITION_LAUNCHED', {
    sourceLoadoutId: params.sourceLoadoutId,
    snapshotId: snapshot.id,
    itemCount: items.length,
    vehicleName: params.vehicleName,
    terrainProfile: profile,
  });

  console.log(TAG, `Expedition launched: ${expedition.id} with ${items.length} items, terrain: ${profile.terrainType}`);
  return { expedition, snapshot, items };
}

// ============================================================
// TERRAIN PROFILE — Runtime accessors (Phase 6A)
// ============================================================

/**
 * Get the terrain profile for an active or any expedition.
 * Checks the in-memory expedition record first, then falls back
 * to the persisted terrain profile store.
 * Guarantees a valid profile is always returned (default if none found).
 */
export function getExpeditionTerrainProfile(expeditionId: string): TerrainProfile {
  // 1. Check in-memory expedition record
  const exp = missionExpeditionStore.getById(expeditionId);
  if (exp?.terrainProfile) return exp.terrainProfile;

  // 2. Check persisted terrain profile store
  const stored = terrainProfileStore.load(expeditionId);
  if (stored) return stored;

  // 3. Default fallback
  return createDefaultTerrainProfile();
}

/**
 * Update the terrain profile for an active expedition.
 * Updates both in-memory record and persisted store.
 */
export function updateExpeditionTerrainProfile(
  expeditionId: string,
  profile: TerrainProfile
): void {
  // Update persisted store
  terrainProfileStore.save(expeditionId, profile);

  // Update in-memory expedition record
  const all = getAll<MissionExpedition>(KEYS.expeditions);
  const idx = all.findIndex(e => e.id === expeditionId);
  if (idx !== -1) {
    all[idx].terrainProfile = profile;
    all[idx].updatedAt = now();
    saveAll(KEYS.expeditions, all);
  }

  console.log(TAG, `Updated terrain profile for expedition ${expeditionId}: ${profile.terrainType}`);
}

