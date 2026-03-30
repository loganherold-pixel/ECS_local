/**
 * useLoadoutWeightSync — React Hook for Loadout ↔ Weight ↔ Attitude Sync
 *
 * Provides real-time weight state to any component:
 *   - Dashboard widgets
 *   - Vehicle Twin container overlays
 *   - Attitude Monitor
 *   - Expedition Mode panels
 *   - CarPlay / Android Auto displays
 *
 * USAGE:
 *   const { state, distribution, attitudeData, recalculate } = useLoadoutWeightSync({
 *     items,
 *     containerZones,
 *     vehicleId,
 *   });
 *
 * The hook:
 *   1. Subscribes to the loadoutWeightBridge
 *   2. Triggers recalculation when items/zones/vehicleId change
 *   3. Returns the current bridge state
 *   4. Cleans up on unmount
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadoutWeightBridge,
  type BridgeState,
  type WeightDistribution,
} from './loadoutWeightBridge';
import type { ContainerZone } from './accessoryFramework';
import type { LoadoutItem } from './types';
import type { StabilityResult, LoadModule } from './stabilityEngine';
import type { LoadBiasResult, AttitudeWeightSignals } from './vehicleWeightEngine';

// ── Hook Options ────────────────────────────────────────────

export interface UseLoadoutWeightSyncOptions {
  /** Current loadout items */
  items?: LoadoutItem[];
  /** Vehicle container zones */
  containerZones?: ContainerZone[];
  /** Active vehicle ID */
  vehicleId?: string;
  /** Whether to auto-recalculate on item/zone changes (default: true) */
  autoRecalculate?: boolean;
  /** Whether to force immediate recalculation on mount (default: false) */
  forceOnMount?: boolean;
}

// ── Hook Return ─────────────────────────────────────────────

export interface UseLoadoutWeightSyncResult {
  /** Full bridge state */
  state: BridgeState;
  /** Weight distribution across vehicle regions */
  distribution: WeightDistribution;
  /** Attitude monitor data */
  attitudeData: {
    stability: StabilityResult | null;
    loadBias: LoadBiasResult | null;
    attitudeSignals: AttitudeWeightSignals | null;
    loadModules: LoadModule[];
  };
  /** Whether the bridge has been initialized */
  initialized: boolean;
  /** Total items weight (lbs) */
  totalItemsWeightLbs: number;
  /** Current vehicle weight (lbs) */
  currentVehicleWeightLbs: number;
  /** Remaining payload (lbs) */
  remainingPayloadLbs: number;
  /** Whether vehicle is over GVWR */
  isOverGvwr: boolean;
  /** Zone weight getter */
  getZoneWeight: (zoneId: string) => number;
  /** Force a recalculation */
  recalculate: () => void;
  /** Trigger recalculation (debounced) */
  onItemsChanged: () => void;
}

// ── Hook Implementation ─────────────────────────────────────

export function useLoadoutWeightSync(
  options: UseLoadoutWeightSyncOptions = {},
): UseLoadoutWeightSyncResult {
  const {
    items,
    containerZones,
    vehicleId,
    autoRecalculate = true,
    forceOnMount = false,
  } = options;

  const [state, setState] = useState<BridgeState>(loadoutWeightBridge.getState());
  const itemsRef = useRef(items);
  const zonesRef = useRef(containerZones);
  const vehicleIdRef = useRef(vehicleId);

  // Keep refs updated
  itemsRef.current = items;
  zonesRef.current = containerZones;
  vehicleIdRef.current = vehicleId;

  // Initialize bridge on first mount
  useEffect(() => {
    loadoutWeightBridge.initialize();
  }, []);

  // Subscribe to bridge state changes
  useEffect(() => {
    const unsub = loadoutWeightBridge.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, []);

  // Force recalculation on mount if requested
  useEffect(() => {
    if (forceOnMount && items && containerZones) {
      loadoutWeightBridge.forceRecalculate(items, containerZones, vehicleId);
    }
  }, []); // Only on mount

  // Auto-recalculate when items, zones, or vehicleId change
  useEffect(() => {
    if (!autoRecalculate) return;
    if (!items || !containerZones) return;

    loadoutWeightBridge.onLoadoutChanged(items, containerZones, vehicleId);
  }, [items, containerZones, vehicleId, autoRecalculate]);

  // Force recalculate callback
  const recalculate = useCallback(() => {
    const currentItems = itemsRef.current || [];
    const currentZones = zonesRef.current || [];
    loadoutWeightBridge.forceRecalculate(currentItems, currentZones, vehicleIdRef.current);
  }, []);

  // Debounced recalculate callback
  const onItemsChanged = useCallback(() => {
    const currentItems = itemsRef.current || [];
    const currentZones = zonesRef.current || [];
    loadoutWeightBridge.onLoadoutChanged(currentItems, currentZones, vehicleIdRef.current);
  }, []);

  // Zone weight getter
  const getZoneWeight = useCallback((zoneId: string): number => {
    return loadoutWeightBridge.getZoneWeight(zoneId);
  }, [state.lastUpdated]); // Re-create when state updates

  return {
    state,
    distribution: state.distribution,
    attitudeData: {
      stability: state.stability,
      loadBias: state.loadBias,
      attitudeSignals: state.attitudeSignals,
      loadModules: state.loadModules,
    },
    initialized: state.initialized,
    totalItemsWeightLbs: state.totalItemsWeightLbs,
    currentVehicleWeightLbs: state.currentVehicleWeightLbs,
    remainingPayloadLbs: state.remainingPayloadLbs,
    isOverGvwr: state.isOverGvwr,
    getZoneWeight,
    recalculate,
    onItemsChanged,
  };
}

/**
 * Lightweight hook for components that only need weight distribution.
 * Avoids re-renders from stability/attitude changes.
 */
export function useWeightDistribution(): WeightDistribution {
  const [dist, setDist] = useState<WeightDistribution>(
    loadoutWeightBridge.getState().distribution
  );

  useEffect(() => {
    loadoutWeightBridge.initialize();
    const unsub = loadoutWeightBridge.subscribe((state) => {
      setDist(state.distribution);
    });
    return unsub;
  }, []);

  return dist;
}

/**
 * Lightweight hook for components that only need attitude data.
 * Used by the Attitude Monitor widget.
 */
export function useAttitudeMonitorData(): {
  stability: StabilityResult | null;
  loadBias: LoadBiasResult | null;
  attitudeSignals: AttitudeWeightSignals | null;
  loadModules: LoadModule[];
  hasData: boolean;
} {
  const [data, setData] = useState(() => {
    const s = loadoutWeightBridge.getState();
    return {
      stability: s.stability,
      loadBias: s.loadBias,
      attitudeSignals: s.attitudeSignals,
      loadModules: s.loadModules,
    };
  });

  useEffect(() => {
    loadoutWeightBridge.initialize();
    const unsub = loadoutWeightBridge.subscribe((state) => {
      setData({
        stability: state.stability,
        loadBias: state.loadBias,
        attitudeSignals: state.attitudeSignals,
        loadModules: state.loadModules,
      });
    });
    return unsub;
  }, []);

  return {
    ...data,
    hasData: data.attitudeSignals?.hasData ?? false,
  };
}

/**
 * Lightweight hook for components that only need zone weights.
 * Used by Vehicle Twin container overlays.
 */
export function useZoneWeights(): {
  zoneWeights: { zoneId: string; zoneLabel: string; weightLbs: number; itemCount: number; region: string }[];
  totalItemsWeightLbs: number;
  getZoneWeight: (zoneId: string) => number;
} {
  const [zoneData, setZoneData] = useState(() => {
    const s = loadoutWeightBridge.getState();
    return {
      zoneWeights: s.zoneWeights,
      totalItemsWeightLbs: s.totalItemsWeightLbs,
    };
  });

  useEffect(() => {
    loadoutWeightBridge.initialize();
    const unsub = loadoutWeightBridge.subscribe((state) => {
      setZoneData({
        zoneWeights: state.zoneWeights,
        totalItemsWeightLbs: state.totalItemsWeightLbs,
      });
    });
    return unsub;
  }, []);

  const getZoneWeight = useCallback((zoneId: string): number => {
    return zoneData.zoneWeights.find(z => z.zoneId === zoneId)?.weightLbs ?? 0;
  }, [zoneData.zoneWeights]);

  return {
    ...zoneData,
    getZoneWeight,
  };
}

