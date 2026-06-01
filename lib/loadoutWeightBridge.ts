/**
 * ECS Loadout Weight Bridge — Phase 3 Stabilization
 *
 * Reactive bridge that connects:
 *   Loadout Item Changes → Container Weights → Vehicle Weight → Attitude Monitor
 *
 * RESPONSIBILITIES:
 *   1. Subscribe to loadoutWeightCache changes
 *   2. Debounce recalculations (200ms)
 *   3. Compute per-container zone weights
 *   4. Compute total vehicle cargo weight (base + hardware + consumables + items)
 *   5. Compute center-of-load approximation (front/mid/rear/roof)
 *   6. Feed weight distribution to Attitude Monitor
 *   7. Handle liquid containers (gallons/liters → weight conversion)
 *   8. Validate: no negative weights, default 1 lb for missing, numeric limits
 *   9. Persist weight state across app restarts
 *  10. Notify all subscribers (Dashboard, Vehicle Twin, Attitude Monitor)
 *
 * SYNC TARGETS:
 *   - Dashboard widgets
 *   - Vehicle Twin container overlays
 *   - Attitude Monitor pitch/balance indicators
 *   - Expedition Mode panels
 *   - CarPlay / Android Auto displays
 *
 * RULES:
 *   - No React hooks inside this module (pure store logic)
 *   - All recalculations are debounced at 200ms
 *   - Negative weights are clamped to 0
 *   - Missing item weight defaults to 1 lb
 *   - Container totals capped at MAX_CONTAINER_WEIGHT_LBS
 *   - Liquid containers enforce gallons/liters only
 */

import { Platform } from 'react-native';
import { loadoutWeightCache, computeItemsWeightLb } from './loadoutWeightCache';
import { consumablesStore, WATER_DENSITY_LB_PER_GAL } from './consumablesStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { getActiveVehicleContext } from './activeVehicleContext';
import {
  computeFullBuildWeightBreakdown,
  type BuildWeightBreakdown,
} from './weightEngine';
import {
  normalizeLoadoutItems,
  computeZoneWeightAggregation,
  computeLoadBias,
  buildStabilityModulesFromZoneWeights,
  computeAttitudeAlertSignals,
  calculateBiasProfile,
  type WeightEngineItem,
  type ZoneWeightResult,
  type LoadBiasResult,
  type AttitudeWeightSignals,
  type BiasProfile,
} from './vehicleWeightEngine';
import {
  computeStability,
  computeSimplifiedStability,
  DEFAULT_VEHICLE_BASELINE,
  type StabilityResult,
  type LoadModule,
  type VehicleBaseline,
} from './stabilityEngine';
import type { ContainerZone } from './accessoryFramework';
import type { LoadoutItem } from './types';

// ── Constants ───────────────────────────────────────────────
/** Debounce interval for recalculations (ms) */
const DEBOUNCE_MS = 200;

/** Default weight for items with missing weight_lbs (lbs) */
export const DEFAULT_ITEM_WEIGHT_LBS = 1;

/** Maximum weight per container zone (lbs) — safety cap */
export const MAX_CONTAINER_WEIGHT_LBS = 9999;

/** Maximum total vehicle weight (lbs) — numeric safety limit */
export const MAX_VEHICLE_WEIGHT_LBS = 99999;

/** Water density: lbs per gallon */
export const WATER_LBS_PER_GALLON = 8.34;

/** Water density: lbs per liter */
export const WATER_LBS_PER_LITER = 2.205;

// ── Liquid Unit Types ───────────────────────────────────────
export type LiquidUnit = 'gallons' | 'liters';

export interface LiquidContainerConfig {
  /** Container zone ID */
  zoneId: string;
  /** Whether this container is liquid-only */
  isLiquidOnly: boolean;
  /** Accepted liquid unit */
  unit: LiquidUnit;
  /** Current volume */
  volume: number;
  /** Capacity */
  capacity: number;
}

// ── Bridge State ────────────────────────────────────────────

export interface BridgeZoneWeight {
  zoneId: string;
  zoneLabel: string;
  /** Total weight in lbs for this zone */
  weightLbs: number;
  /** Number of items in this zone */
  itemCount: number;
  /** Vehicle region: front | mid | rear | roof */
  region: 'front' | 'mid' | 'rear' | 'roof';
}

export interface WeightDistribution {
  /** Weight in front region (lbs) */
  frontLbs: number;
  /** Weight in mid region (lbs) */
  midLbs: number;
  /** Weight in rear region (lbs) */
  rearLbs: number;
  /** Weight in roof region (lbs) */
  roofLbs: number;
  /** Total loadout weight (lbs) */
  totalLoadoutLbs: number;
  /** Front percentage */
  frontPct: number;
  /** Mid percentage */
  midPct: number;
  /** Rear percentage */
  rearPct: number;
  /** Roof percentage */
  roofPct: number;
}

export interface BridgeState {
  /** Timestamp of last recalculation */
  lastUpdated: string;
  /** Whether the bridge has been initialized */
  initialized: boolean;

  // ── Per-Zone Weights ──
  /** Container zone weights */
  zoneWeights: BridgeZoneWeight[];
  /** Total loadout items weight (lbs) */
  totalItemsWeightLbs: number;

  // ── Vehicle Weight ──
  /** Base vehicle weight from profile (lbs) */
  baseVehicleWeightLbs: number;
  /** Hardware additions weight (lbs) */
  hardwareAdditionsLbs: number;
  /** Consumables weight: fuel + water (lbs) */
  consumablesWeightLbs: number;
  /** Current total vehicle weight (lbs) */
  currentVehicleWeightLbs: number;
  /** GVWR from vehicle profile (lbs) */
  gvwrLbs: number;
  /** Remaining payload capacity (lbs) */
  remainingPayloadLbs: number;
  /** Whether vehicle is over GVWR */
  isOverGvwr: boolean;

  // ── Weight Distribution ──
  /** Weight distribution across vehicle regions */
  distribution: WeightDistribution;

  // ── Attitude Monitor Data ──
  /** Stability result for Attitude Monitor */
  stability: StabilityResult | null;
  /** Load bias analysis */
  loadBias: LoadBiasResult | null;
  /** Attitude alert signals */
  attitudeSignals: AttitudeWeightSignals | null;
  /** Load modules for CG visualization */
  loadModules: LoadModule[];

  // ── Full Build Weight Breakdown ──
  /** Complete build weight breakdown (single source of truth) */
  buildBreakdown: BuildWeightBreakdown | null;

  // ── Liquid Containers ──
  /** Liquid container configurations */
  liquidContainers: LiquidContainerConfig[];
}

// ── Storage ─────────────────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

const LS_BRIDGE_STATE = 'ecs_loadout_weight_bridge';
const LS_LIQUID_CONFIGS = 'ecs_liquid_container_configs';

function loadPersistedState(): Partial<BridgeState> | null {
  const raw = lsGet(LS_BRIDGE_STATE);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function persistState(state: BridgeState): void {
  try {
    // Persist only serializable fields (exclude stability/loadBias/attitudeSignals)
    const serializable = {
      lastUpdated: state.lastUpdated,
      initialized: state.initialized,
      zoneWeights: state.zoneWeights,
      totalItemsWeightLbs: state.totalItemsWeightLbs,
      baseVehicleWeightLbs: state.baseVehicleWeightLbs,
      hardwareAdditionsLbs: state.hardwareAdditionsLbs,
      consumablesWeightLbs: state.consumablesWeightLbs,
      currentVehicleWeightLbs: state.currentVehicleWeightLbs,
      gvwrLbs: state.gvwrLbs,
      remainingPayloadLbs: state.remainingPayloadLbs,
      isOverGvwr: state.isOverGvwr,
      distribution: state.distribution,
      liquidContainers: state.liquidContainers,
    };
    lsSet(LS_BRIDGE_STATE, JSON.stringify(serializable));
  } catch (e) {
    console.warn('[WeightBridge] Failed to persist state:', e);
  }
}

function loadLiquidConfigs(): LiquidContainerConfig[] {
  const raw = lsGet(LS_LIQUID_CONFIGS);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function saveLiquidConfigs(configs: LiquidContainerConfig[]): void {
  lsSet(LS_LIQUID_CONFIGS, JSON.stringify(configs));
}

// ── Default State ───────────────────────────────────────────
function createDefaultState(): BridgeState {
  return {
    lastUpdated: new Date().toISOString(),
    initialized: false,
    zoneWeights: [],
    totalItemsWeightLbs: 0,
    baseVehicleWeightLbs: 0,
    hardwareAdditionsLbs: 0,
    consumablesWeightLbs: 0,
    currentVehicleWeightLbs: 0,
    gvwrLbs: 0,
    remainingPayloadLbs: 0,
    isOverGvwr: false,
    distribution: {
      frontLbs: 0, midLbs: 0, rearLbs: 0, roofLbs: 0,
      totalLoadoutLbs: 0,
      frontPct: 0, midPct: 0, rearPct: 0, roofPct: 0,
    },
    stability: null,
    loadBias: null,
    attitudeSignals: null,
    loadModules: [],
    buildBreakdown: null,
    liquidContainers: [],
  };
}

// ── Validation Helpers ──────────────────────────────────────

/**
 * Sanitize item weight: clamp negatives to 0, apply default for missing.
 * Returns weight in lbs.
 */
export function sanitizeItemWeight(weightLbs: number | null | undefined): number {
  if (weightLbs == null || typeof weightLbs !== 'number' || isNaN(weightLbs)) {
    return DEFAULT_ITEM_WEIGHT_LBS;
  }
  return Math.max(0, weightLbs);
}

/**
 * Clamp container total to safe numeric limits.
 */
export function clampContainerWeight(weightLbs: number): number {
  return Math.max(0, Math.min(MAX_CONTAINER_WEIGHT_LBS, weightLbs));
}

/**
 * Clamp vehicle total to safe numeric limits.
 */
export function clampVehicleWeight(weightLbs: number): number {
  return Math.max(0, Math.min(MAX_VEHICLE_WEIGHT_LBS, weightLbs));
}

/**
 * Convert liquid volume to weight in lbs.
 */
export function liquidToWeight(volume: number, unit: LiquidUnit): number {
  if (volume <= 0) return 0;
  switch (unit) {
    case 'gallons': return volume * WATER_LBS_PER_GALLON;
    case 'liters': return volume * WATER_LBS_PER_LITER;
    default: return 0;
  }
}

/**
 * Convert weight in lbs to liquid volume.
 */
export function weightToLiquid(weightLbs: number, unit: LiquidUnit): number {
  if (weightLbs <= 0) return 0;
  switch (unit) {
    case 'gallons': return weightLbs / WATER_LBS_PER_GALLON;
    case 'liters': return weightLbs / WATER_LBS_PER_LITER;
    default: return 0;
  }
}

/**
 * Check if an item category is liquid-compatible.
 */
export function isLiquidCategory(category: string): boolean {
  return category === 'water';
}

/**
 * Validate that a non-liquid item is not being added to a liquid-only container.
 * Returns true if the item is allowed in the container.
 */
export function validateContainerItemCompatibility(
  itemCategory: string,
  containerZoneId: string,
  liquidConfigs: LiquidContainerConfig[],
): boolean {
  const config = liquidConfigs.find(c => c.zoneId === containerZoneId);
  if (!config || !config.isLiquidOnly) return true; // Not a liquid container, allow anything
  return isLiquidCategory(itemCategory); // Only allow liquid items
}

// ── Region Classification ───────────────────────────────────

/**
 * Map a container zone to a vehicle region based on its bias metadata.
 */
function classifyZoneRegion(zone: ContainerZone): 'front' | 'mid' | 'rear' | 'roof' {
  // Roof-level zones
  if (zone.verticalBias === 'high') {
    // Distinguish between roof-mounted and front-high (cab rack)
    if (zone.longitudinalBias === 'front') return 'front';
    return 'roof';
  }
  // Longitudinal classification for non-roof zones
  if (zone.longitudinalBias === 'front') return 'front';
  if (zone.longitudinalBias === 'rear') return 'rear';
  return 'mid';
}

/**
 * Compute weight distribution across vehicle regions.
 */
function computeDistribution(zoneWeights: BridgeZoneWeight[]): WeightDistribution {
  let frontLbs = 0, midLbs = 0, rearLbs = 0, roofLbs = 0;

  for (const zw of zoneWeights) {
    switch (zw.region) {
      case 'front': frontLbs += zw.weightLbs; break;
      case 'mid': midLbs += zw.weightLbs; break;
      case 'rear': rearLbs += zw.weightLbs; break;
      case 'roof': roofLbs += zw.weightLbs; break;
    }
  }

  const totalLoadoutLbs = frontLbs + midLbs + rearLbs + roofLbs;
  const pct = (v: number) => totalLoadoutLbs > 0
    ? Math.round((v / totalLoadoutLbs) * 100)
    : 0;

  return {
    frontLbs: Math.round(frontLbs * 10) / 10,
    midLbs: Math.round(midLbs * 10) / 10,
    rearLbs: Math.round(rearLbs * 10) / 10,
    roofLbs: Math.round(roofLbs * 10) / 10,
    totalLoadoutLbs: Math.round(totalLoadoutLbs * 10) / 10,
    frontPct: pct(frontLbs),
    midPct: pct(midLbs),
    rearPct: pct(rearLbs),
    roofPct: pct(roofLbs),
  };
}

// ── Bridge Singleton ────────────────────────────────────────

type BridgeListener = (state: BridgeState) => void;

let _state: BridgeState = createDefaultState();
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners: Set<BridgeListener> = new Set();
let _unsubWeightCache: (() => void) | null = null;
let _unsubConsumables: (() => void) | null = null;

// Restore persisted state on module load
const persisted = loadPersistedState();
if (persisted) {
  _state = { ...createDefaultState(), ...persisted };
}

function notifyListeners(): void {
  const snapshot = { ..._state };
  _listeners.forEach(fn => {
    try { fn(snapshot); } catch (e) {
      console.warn('[WeightBridge] Listener error:', e);
    }
  });
}

/**
 * Core recalculation function.
 * Called after debounce when loadout items, consumables, or vehicle specs change.
 */
function recalculate(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
  vehicleId?: string,
): void {
  try {
    // ── 1. Normalize items with weight sanitization ──
    const sanitizedItems = items.map(item => ({
      ...item,
      weight_lbs: sanitizeItemWeight(item.weight_lbs),
    }));

    const engineItems: WeightEngineItem[] = normalizeLoadoutItems(
      sanitizedItems.map(item => ({
        id: item.id,
        name: item.name,
        weight_lbs: item.weight_lbs,
        quantity: item.quantity,
        storage_location: item.storage_location,
        is_critical: item.is_critical,
      })),
      containerZones,
    );

    // ── 2. Compute zone weights ──
    const activeVehicleContext = getActiveVehicleContext();
    const resolvedVehicleId = vehicleId || activeVehicleContext.activeVehicleId || '';
    const specEntry = vehicleId
      ? vehicleSpecStore.get(vehicleId)
      : activeVehicleContext.spec ?? null;

    const baseWeight = specEntry?.base_weight_lb ?? 0;
    const gvwr = specEntry?.gvwr_lb ?? 0;

    const zoneAggregation: ZoneWeightResult = computeZoneWeightAggregation(
      engineItems,
      containerZones,
      baseWeight,
      gvwr,
    );

    // ── 3. Build bridge zone weights with region classification ──
    const bridgeZoneWeights: BridgeZoneWeight[] = containerZones.map(zone => ({
      zoneId: zone.id,
      zoneLabel: zone.label,
      weightLbs: clampContainerWeight(zoneAggregation.zoneWeights[zone.id] || 0),
      itemCount: zoneAggregation.zoneDetails.find(d => d.zoneId === zone.id)?.itemCount ?? 0,
      region: classifyZoneRegion(zone),
    }));

    // ── 4. Add liquid container weights ──
    const liquidConfigs = loadLiquidConfigs();
    for (const lc of liquidConfigs) {
      if (lc.volume > 0) {
        const liquidWeight = liquidToWeight(lc.volume, lc.unit);
        const existing = bridgeZoneWeights.find(z => z.zoneId === lc.zoneId);
        if (existing) {
          existing.weightLbs = clampContainerWeight(existing.weightLbs + liquidWeight);
        }
      }
    }

    // ── 5. Compute total items weight ──
    const totalItemsWeightLbs = Math.round(
      engineItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0) * 10
    ) / 10;

    // ── 6. Compute weight distribution ──
    const distribution = computeDistribution(bridgeZoneWeights);

    // ── 7. Get full build weight breakdown (single source of truth) ──
    const buildBreakdown = computeFullBuildWeightBreakdown(resolvedVehicleId, {
      items_weight_lb: totalItemsWeightLbs,
    });

    // ── 8. Compute stability for Attitude Monitor ──
    const baseline: VehicleBaseline = {
      ...DEFAULT_VEHICLE_BASELINE,
      curbWeightLbs: baseWeight || DEFAULT_VEHICLE_BASELINE.curbWeightLbs,
    };

    const loadModules: LoadModule[] = buildStabilityModulesFromZoneWeights(
      zoneAggregation,
      containerZones,
    );

    const stability: StabilityResult = loadModules.length >= 2
      ? computeStability(baseline, loadModules, 0)
      : computeSimplifiedStability(0);

    // ── 9. Compute load bias ──
    const loadBias: LoadBiasResult = computeLoadBias(
      zoneAggregation,
      containerZones,
      baseline,
    );

    // ── 10. Compute attitude alert signals ──
    const biasProfile: BiasProfile = calculateBiasProfile(
      zoneAggregation.zoneWeights,
      containerZones,
    );

    const attitudeSignals: AttitudeWeightSignals = computeAttitudeAlertSignals(
      biasProfile,
      zoneAggregation.gvwrPercent,
      zoneAggregation.totalLoadoutWeight,
      zoneAggregation.vehicleTotalWeight,
    );

    // ── 11. Compute vehicle weight totals ──
    const currentVehicleWeightLbs = clampVehicleWeight(
      buildBreakdown.build_weight_lb
    );
    const remainingPayloadLbs = gvwr > 0
      ? Math.max(0, gvwr - currentVehicleWeightLbs)
      : 0;

    // ── 12. Update state ──
    _state = {
      lastUpdated: new Date().toISOString(),
      initialized: true,
      zoneWeights: bridgeZoneWeights,
      totalItemsWeightLbs,
      baseVehicleWeightLbs: baseWeight,
      hardwareAdditionsLbs: buildBreakdown.hardware_additions_lb,
      consumablesWeightLbs: buildBreakdown.consumables_weight_lb,
      currentVehicleWeightLbs,
      gvwrLbs: gvwr,
      remainingPayloadLbs,
      isOverGvwr: gvwr > 0 && currentVehicleWeightLbs > gvwr,
      distribution,
      stability,
      loadBias,
      attitudeSignals,
      loadModules,
      buildBreakdown,
      liquidContainers: liquidConfigs,
    };

    // ── 13. Persist and notify ──
    persistState(_state);
    notifyListeners();

    console.log(
      '[WeightBridge] Recalculated:',
      `items=${totalItemsWeightLbs}lbs`,
      `vehicle=${currentVehicleWeightLbs}lbs`,
      `zones=${bridgeZoneWeights.length}`,
      `distribution=F${distribution.frontPct}%/M${distribution.midPct}%/R${distribution.rearPct}%/Roof${distribution.roofPct}%`,
    );
  } catch (e) {
    console.warn('[WeightBridge] Recalculation error:', e);
  }
}

/**
 * Schedule a debounced recalculation.
 */
function scheduleRecalculation(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
  vehicleId?: string,
): void {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    recalculate(items, containerZones, vehicleId);
  }, DEBOUNCE_MS);
}

// ── Public API ──────────────────────────────────────────────

export const loadoutWeightBridge = {
  /**
   * Get current bridge state.
   */
  getState: (): BridgeState => ({ ..._state }),

  /**
   * Subscribe to bridge state changes.
   * Returns unsubscribe function.
   */
  subscribe: (listener: BridgeListener): (() => void) => {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Trigger a full recalculation with the given data.
   * Debounced at 200ms to prevent excessive recalculations.
   *
   * Call this after any loadout item create/update/delete.
   */
  onLoadoutChanged: (
    items: LoadoutItem[],
    containerZones: ContainerZone[],
    vehicleId?: string,
  ): void => {
    scheduleRecalculation(items, containerZones, vehicleId);
  },

  /**
   * Force an immediate recalculation (bypasses debounce).
   * Use for initial load or when user explicitly requests refresh.
   */
  forceRecalculate: (
    items: LoadoutItem[],
    containerZones: ContainerZone[],
    vehicleId?: string,
  ): void => {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    recalculate(items, containerZones, vehicleId);
  },

  /**
   * Update a liquid container configuration.
   * Triggers recalculation.
   */
  setLiquidContainer: (config: LiquidContainerConfig): void => {
    const configs = loadLiquidConfigs();
    const idx = configs.findIndex(c => c.zoneId === config.zoneId);
    if (idx !== -1) {
      configs[idx] = config;
    } else {
      configs.push(config);
    }
    saveLiquidConfigs(configs);
    _state.liquidContainers = configs;
    // Notify listeners — a full recalculation should be triggered by the caller
    notifyListeners();
  },

  /**
   * Remove a liquid container configuration.
   */
  removeLiquidContainer: (zoneId: string): void => {
    const configs = loadLiquidConfigs().filter(c => c.zoneId !== zoneId);
    saveLiquidConfigs(configs);
    _state.liquidContainers = configs;
    notifyListeners();
  },

  /**
   * Get liquid container configs.
   */
  getLiquidContainers: (): LiquidContainerConfig[] => {
    return loadLiquidConfigs();
  },

  /**
   * Validate whether an item can be added to a container.
   * Returns { valid: boolean, reason?: string }.
   */
  validateItemForContainer: (
    itemCategory: string,
    containerZoneId: string,
  ): { valid: boolean; reason?: string } => {
    const configs = loadLiquidConfigs();
    const isValid = validateContainerItemCompatibility(itemCategory, containerZoneId, configs);
    if (!isValid) {
      return {
        valid: false,
        reason: 'This container only accepts liquid items (water category).',
      };
    }
    return { valid: true };
  },

  /**
   * Get the weight for a specific zone.
   */
  getZoneWeight: (zoneId: string): number => {
    const zone = _state.zoneWeights.find(z => z.zoneId === zoneId);
    return zone?.weightLbs ?? 0;
  },

  /**
   * Get weight distribution across vehicle regions.
   */
  getDistribution: (): WeightDistribution => {
    return { ..._state.distribution };
  },

  /**
   * Get attitude monitor data.
   */
  getAttitudeData: (): {
    stability: StabilityResult | null;
    loadBias: LoadBiasResult | null;
    attitudeSignals: AttitudeWeightSignals | null;
    loadModules: LoadModule[];
  } => ({
    stability: _state.stability,
    loadBias: _state.loadBias,
    attitudeSignals: _state.attitudeSignals,
    loadModules: [..._state.loadModules],
  }),

  /**
   * Initialize the bridge by subscribing to upstream stores.
   * Call once at app startup.
   */
  initialize: (): void => {
    if (_state.initialized && _unsubWeightCache) return;

    // Subscribe to loadout weight cache changes
    _unsubWeightCache = loadoutWeightCache.subscribe(() => {
      // Weight cache changed — notify listeners so UI can re-fetch
      notifyListeners();
    });

    // Subscribe to consumables changes
    _unsubConsumables = consumablesStore.subscribe(() => {
      // Consumables changed — notify listeners
      notifyListeners();
    });

    _state.initialized = true;
    console.log('[WeightBridge] Initialized — listening to loadoutWeightCache + consumablesStore');
  },

  /**
   * Tear down subscriptions.
   */
  destroy: (): void => {
    if (_unsubWeightCache) {
      _unsubWeightCache();
      _unsubWeightCache = null;
    }
    if (_unsubConsumables) {
      _unsubConsumables();
      _unsubConsumables = null;
    }
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _listeners.clear();
  },

  /**
   * Reset bridge state to defaults.
   */
  reset: (): void => {
    _state = createDefaultState();
    persistState(_state);
    notifyListeners();
  },
};

