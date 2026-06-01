/**
 * ECS Pin Store — Offline-First Pin Persistence
 *
 * Manages waypoint + incident pins with local storage.
 * Supports filtering, sorting, expedition binding, and export.
 */
import { Platform } from 'react-native';
import type { ECSPin, PinType, PinCategory, PinSeverity, PinSortMode } from '../components/navigate/PinTypes';
import { getPinTypeMeta } from '../components/navigate/PinTypes';

const TAG = '[PIN_STORE]';
const STORAGE_KEY = 'ecs_navigate_pins';
type PinStoreListener = () => void;
const listeners = new Set<PinStoreListener>();

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

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const now = () => new Date().toISOString();

// ── Core CRUD ────────────────────────────────────────────────
function getAllPins(): ECSPin[] {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function notifyPinStoreListeners(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch (error) {
      console.warn(TAG, 'Pin store listener failed', error);
    }
  }
}

function savePins(pins: ECSPin[]): void {
  const previous = sGet(STORAGE_KEY);
  const next = JSON.stringify(pins);
  if (previous === next) return;
  sSet(STORAGE_KEY, next);
  notifyPinStoreListeners();
}

// ── Distance calculation ─────────────────────────────────────
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Pin Store API ────────────────────────────────────────────
export const pinStore = {
  subscribe: (listener: PinStoreListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getAll: (): ECSPin[] => getAllPins(),

  getById: (id: string): ECSPin | null => {
    return getAllPins().find(p => p.id === id) || null;
  },

  create: (data: {
    type: PinType;
    lat: number;
    lng: number;
    title?: string;
    notes?: string;
    expedition_id?: string | null;
    vehicle_id?: string | null;
    severity?: PinSeverity | null;
    created_by?: string;
  }): ECSPin => {
    const meta = getPinTypeMeta(data.type);
    const pin: ECSPin = {
      id: uuid(),
      type: data.type,
      category: meta.category,
      title: data.title || meta.defaultTitle,
      notes: data.notes || '',
      lat: data.lat,
      lng: data.lng,
      created_at: now(),
      created_by: data.created_by || 'local',
      expedition_id: data.expedition_id ?? null,
      vehicle_id: data.vehicle_id ?? null,
      severity: data.severity ?? (meta.category === 'incident' ? 'low' : null),
      resolved: false,
      photo_url: null,
      icon_key: meta.icon,
    };
    const all = getAllPins();
    all.push(pin);
    savePins(all);
    console.log(TAG, `Created pin: ${pin.id} (${pin.type})`);
    return pin;
  },

  update: (id: string, updates: Partial<Pick<ECSPin, 'title' | 'notes' | 'type' | 'severity' | 'resolved' | 'expedition_id'>>): ECSPin | null => {
    const all = getAllPins();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    if (updates.title !== undefined) all[idx].title = updates.title;
    if (updates.notes !== undefined) all[idx].notes = updates.notes;
    if (updates.severity !== undefined) all[idx].severity = updates.severity;
    if (updates.resolved !== undefined) all[idx].resolved = updates.resolved;
    if (updates.expedition_id !== undefined) all[idx].expedition_id = updates.expedition_id;
    if (updates.type !== undefined) {
      all[idx].type = updates.type;
      const meta = getPinTypeMeta(updates.type);
      all[idx].category = meta.category;
      all[idx].icon_key = meta.icon;
    }
    savePins(all);
    return all[idx];
  },

  resolve: (id: string): ECSPin | null => {
    return pinStore.update(id, { resolved: true });
  },

  unresolve: (id: string): ECSPin | null => {
    return pinStore.update(id, { resolved: false });
  },

  delete: (id: string): boolean => {
    const all = getAllPins();
    const filtered = all.filter(p => p.id !== id);
    if (filtered.length === all.length) return false;
    savePins(filtered);
    console.log(TAG, `Deleted pin: ${id}`);
    return true;
  },

  deleteAll: (): number => {
    const all = getAllPins();
    if (all.length === 0) return 0;
    savePins([]);
    console.log(TAG, `Deleted all pins: ${all.length}`);
    return all.length;
  },

  deleteMany: (ids: string[]): number => {
    const deleteIds = new Set(ids);
    if (deleteIds.size === 0) return 0;
    const all = getAllPins();
    const filtered = all.filter(p => !deleteIds.has(p.id));
    const deletedCount = all.length - filtered.length;
    if (deletedCount === 0) return 0;
    savePins(filtered);
    console.log(TAG, `Deleted pins: ${deletedCount}`);
    return deletedCount;
  },

  // ── Filtering ──────────────────────────────────────────────
  filter: (opts: {
    showWaypoints?: boolean;
    showIncidents?: boolean;
    types?: PinType[];
    expeditionOnly?: string | null;
    unresolvedOnly?: boolean;
    search?: string;
  }): ECSPin[] => {
    let pins = getAllPins();

    // Category filter
    if (opts.showWaypoints === false) {
      pins = pins.filter(p => p.category !== 'waypoint');
    }
    if (opts.showIncidents === false) {
      pins = pins.filter(p => p.category !== 'incident');
    }

    // Type filter
    if (opts.types && opts.types.length > 0) {
      pins = pins.filter(p => opts.types!.includes(p.type));
    }

    // Expedition filter
    if (opts.expeditionOnly) {
      pins = pins.filter(p => p.expedition_id === opts.expeditionOnly);
    }

    // Unresolved only
    if (opts.unresolvedOnly) {
      pins = pins.filter(p => p.category !== 'incident' || !p.resolved);
    }

    // Search
    if (opts.search && opts.search.trim()) {
      const q = opts.search.toLowerCase().trim();
      pins = pins.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q)
      );
    }

    return pins;
  },

  // ── Sorting ────────────────────────────────────────────────
  sort: (pins: ECSPin[], mode: PinSortMode, userLat?: number, userLng?: number): ECSPin[] => {
    const sorted = [...pins];
    switch (mode) {
      case 'nearest':
        if (userLat != null && userLng != null) {
          sorted.sort((a, b) => {
            const dA = haversineDistance(userLat, userLng, a.lat, a.lng);
            const dB = haversineDistance(userLat, userLng, b.lat, b.lng);
            return dA - dB;
          });
        }
        break;
      case 'recent':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'type':
        sorted.sort((a, b) => a.type.localeCompare(b.type));
        break;
    }
    return sorted;
  },

  // ── Distance from user ─────────────────────────────────────
  distanceFromUser: (pin: ECSPin, userLat: number, userLng: number): number => {
    return haversineDistance(userLat, userLng, pin.lat, pin.lng);
  },

  // ── Expedition helpers ─────────────────────────────────────
  getByExpedition: (expeditionId: string): ECSPin[] => {
    return getAllPins().filter(p => p.expedition_id === expeditionId);
  },

  getUnattached: (): ECSPin[] => {
    return getAllPins().filter(p => !p.expedition_id);
  },

  // ── Export ─────────────────────────────────────────────────
  exportToGPX: (pins: ECSPin[], name?: string): string => {
    const gpxName = name || 'ECS Pin Export';
    const wpts = pins.map(p => {
      const desc = [p.type.toUpperCase(), p.notes].filter(Boolean).join(' — ');
      return `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${escapeXml(p.title)}</name>
    <desc>${escapeXml(desc)}</desc>
    <type>${p.type}</type>
    <time>${p.created_at}</time>
  </wpt>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ECS Navigate"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(gpxName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
</gpx>`;
  },

  exportToJSON: (pins: ECSPin[]): string => {
    return JSON.stringify(pins, null, 2);
  },

  exportCoordinatesList: (pins: ECSPin[]): string => {
    return pins.map(p => `${p.title}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`).join('\n');
  },
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

