// ============================================================
// EXPEDITION CACHE — Offline-First Persistence Layer
// ============================================================
// Provides:
//   1. Expedition list caching for offline display
//   2. Builder step state persistence (survives reload)
//   3. Active expedition caching
//   4. Diagnostic logging
// ============================================================

import { Platform } from 'react-native';
import type { EcsExpedition } from './expeditionTypes';

const TAG = '[EXPEDITION_CACHE]';

// ── Storage helpers ──────────────────────────────────────────
const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return memoryStore[key] || null;
  } catch (e) {
    console.warn(TAG, 'storageGet error:', e);
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    memoryStore[key] = value;
  } catch (e) {
    console.warn(TAG, 'storageSet error:', e);
  }
}

function storageRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete memoryStore[key];
  } catch {}
}

const KEYS = {
  expeditionList: 'ecs_exp_cached_list',
  expeditionListTimestamp: 'ecs_exp_cached_list_ts',
  activeExpedition: 'ecs_exp_active_cached',
  lastFetchError: 'ecs_exp_last_fetch_error',
  builderState: 'ecs_exp_builder_state',
  vehicleZones: 'ecs_exp_vehicle_zones_',
  expeditionSegment: 'ecs_exp_segment',
  dispatchEnabled: 'ecs_exp_dispatch_enabled',
  dispatchEvents: 'ecs_exp_dispatch_events',
  wizardDraft: 'ecs_exp_wizard_draft',
};


// ── Expedition List Cache ────────────────────────────────────

export function getCachedExpeditions(): EcsExpedition[] {
  try {
    const raw = storageGet(KEYS.expeditionList);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedExpeditions(expeditions: EcsExpedition[]): void {
  try {
    storageSet(KEYS.expeditionList, JSON.stringify(expeditions));
    storageSet(KEYS.expeditionListTimestamp, new Date().toISOString());
  } catch (e) {
    console.warn(TAG, 'setCachedExpeditions error:', e);
  }
}

export function getCacheTimestamp(): string | null {
  return storageGet(KEYS.expeditionListTimestamp);
}

export function getCacheAge(): string {
  const ts = storageGet(KEYS.expeditionListTimestamp);
  if (!ts) return 'never';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
  } catch {
    return 'unknown';
  }
}

// ── Active Expedition Cache ──────────────────────────────────

export function getCachedActiveExpedition(): EcsExpedition | null {
  try {
    const raw = storageGet(KEYS.activeExpedition);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedActiveExpedition(exp: EcsExpedition | null): void {
  if (exp) {
    storageSet(KEYS.activeExpedition, JSON.stringify(exp));
  } else {
    storageRemove(KEYS.activeExpedition);
  }
}

// ── Builder State Persistence ────────────────────────────────

export interface BuilderStepState {
  vehicleSelected: boolean;
  vehicleId: string | null;
  vehicleName: string | null;
  frameworkConfigured: boolean;
  frameworkType: string | null;
  zonesConfigured: boolean;
  zoneCount: number;
  loadoutBuilt: boolean;
  loadoutReady: boolean;
  loadoutId: string | null;
  expeditionId: string | null;
  lastUpdated: string;
}

const DEFAULT_BUILDER_STATE: BuilderStepState = {
  vehicleSelected: false,
  vehicleId: null,
  vehicleName: null,
  frameworkConfigured: false,
  frameworkType: null,
  zonesConfigured: false,
  zoneCount: 0,
  loadoutBuilt: false,
  loadoutReady: false,
  loadoutId: null,
  expeditionId: null,
  lastUpdated: new Date().toISOString(),
};


export function getBuilderState(): BuilderStepState {
  try {
    const raw = storageGet(KEYS.builderState);
    if (!raw) return { ...DEFAULT_BUILDER_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BUILDER_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_BUILDER_STATE };
  }
}

export function setBuilderState(state: Partial<BuilderStepState>): void {
  try {
    const current = getBuilderState();
    const updated = { ...current, ...state, lastUpdated: new Date().toISOString() };
    storageSet(KEYS.builderState, JSON.stringify(updated));
  } catch (e) {
    console.warn(TAG, 'setBuilderState error:', e);
  }
}

export function resetBuilderState(): void {
  storageSet(KEYS.builderState, JSON.stringify({ ...DEFAULT_BUILDER_STATE, lastUpdated: new Date().toISOString() }));
}

// ── Error tracking ───────────────────────────────────────────

export function setLastFetchError(error: string | null): void {
  if (error) {
    storageSet(KEYS.lastFetchError, error);
  } else {
    storageRemove(KEYS.lastFetchError);
  }
}

export function getLastFetchError(): string | null {
  return storageGet(KEYS.lastFetchError);
}


// ── Vehicle Zone Cache (for builder flow) ────────────────────
// Caches zones per vehicle so they persist through the builder
// Steps 3→4 flow (Zones & Containers → Build Loadout)

export interface CachedZone {
  id: string;
  name: string;
  zone_type: string;
  slot_count: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
}

export function setCachedVehicleZones(vehicleId: string, zones: CachedZone[]): void {
  try {
    const key = KEYS.vehicleZones + vehicleId;
    storageSet(key, JSON.stringify({
      zones,
      cachedAt: new Date().toISOString(),
    }));
    console.log(TAG, `Cached ${zones.length} zones for vehicle ${vehicleId}`);
  } catch (e) {
    console.warn(TAG, 'setCachedVehicleZones error:', e);
  }
}

export function getCachedVehicleZones(vehicleId: string): CachedZone[] {
  try {
    const key = KEYS.vehicleZones + vehicleId;
    const raw = storageGet(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.zones) ? parsed.zones : [];
  } catch {
    return [];
  }
}

/**
 * Remove cached zones for a specific vehicle.
 * Called during vehicle deletion to clean up stale data.
 */
export function clearCachedVehicleZones(vehicleId: string): void {
  try {
    const key = KEYS.vehicleZones + vehicleId;
    storageRemove(key);
    console.log(TAG, `Cleared cached zones for vehicle ${vehicleId}`);
  } catch (e) {
    console.warn(TAG, 'clearCachedVehicleZones error:', e);
  }
}


export function getVehicleZoneCacheAge(vehicleId: string): string | null {
  try {
    const key = KEYS.vehicleZones + vehicleId;
    const raw = storageGet(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.cachedAt || null;
  } catch {
    return null;
  }
}

// ── Diagnostic dump ──────────────────────────────────────────

export function getExpeditionDiagnostics(): Record<string, any> {
  const bs = getBuilderState();
  const vehicleZones = bs.vehicleId ? getCachedVehicleZones(bs.vehicleId) : [];
  return {
    cachedExpeditionCount: getCachedExpeditions().length,
    cacheAge: getCacheAge(),
    hasActiveExpedition: getCachedActiveExpedition() !== null,
    builderState: bs,
    lastFetchError: getLastFetchError(),
    vehicleZoneCount: vehicleZones.length,
    vehicleZoneCacheAge: bs.vehicleId ? getVehicleZoneCacheAge(bs.vehicleId) : null,
  };
}


// ── Wizard Draft Persistence ─────────────────────────────────
// Persists the 3-step planning wizard state so "Continue Planning"
// returns the user to their last step with all fields restored.

export interface WizardDraftState {
  step: number;                // 0, 1, or 2
  name: string;                // optional expedition name
  destination: string;         // required destination/area
  startDate: string;           // optional MM-DD-YYYY
  endDate: string;             // optional MM-DD-YYYY
  notes: string;               // optional notes
  vehicleId: string | null;
  vehicleName: string | null;
  terrain: string | null;
  systemsData: Record<string, string>;
  /** Phase 6A: Detailed terrain profile for risk-aware scoring */
  terrainProfile: Record<string, string> | null;
  lastUpdated: string;
}

const DEFAULT_WIZARD_DRAFT: WizardDraftState = {
  step: 0,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  notes: '',
  vehicleId: null,
  vehicleName: null,
  terrain: null,
  systemsData: {},
  terrainProfile: null,
  lastUpdated: '',
};


export function getWizardDraft(): WizardDraftState | null {
  try {
    const raw = storageGet(KEYS.wizardDraft);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_WIZARD_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function setWizardDraft(state: Partial<WizardDraftState>): void {
  try {
    const current = getWizardDraft() || { ...DEFAULT_WIZARD_DRAFT };
    const updated = { ...current, ...state, lastUpdated: new Date().toISOString() };
    storageSet(KEYS.wizardDraft, JSON.stringify(updated));
  } catch (e) {
    console.warn(TAG, 'setWizardDraft error:', e);
  }
}

export function clearWizardDraft(): void {
  storageRemove(KEYS.wizardDraft);
}

export function hasWizardDraft(): boolean {
  const draft = getWizardDraft();
  if (!draft) return false;
  // Consider it a draft if destination has content or step > 0
  return draft.destination.trim().length > 0 || draft.step > 0 || draft.name.trim().length > 0;
}

