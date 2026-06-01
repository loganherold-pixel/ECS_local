/**
 * VCD ADAPTIVE DATA FADE — Panel State Engine
 * =============================================
 *
 * Defines the three-state system for Vehicle Command Display panels:
 *   PASSIVE  — stable conditions, reduced visual emphasis
 *   ACTIVE   — relevant condition detected, normal emphasis
 *   ALERT    — critical threshold crossed, elevated emphasis
 *
 * Evaluates expedition engine outputs (route, terrain, resource, forecast)
 * and determines the appropriate visual state for each VCD panel category.
 *
 * Panels:
 *   ROUTE    — route status / terrain proximity
 *   RESOURCE — fuel, water, power margins
 *   TERRAIN  — terrain events, mountain passes
 *   CAMPSITE — campsite suggestion relevance
 *   FORECAST — overall expedition forecast status
 *
 * Does NOT modify engine behavior — purely a presentation layer.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import { routeAnalysisEngine, type RouteIntelligence } from './routeAnalysisEngine';
import { terrainAnalysisEngine, type TerrainIntelligence } from './terrainAnalysisEngine';
import {
  resourceForecastEngine,
  type ResourceForecast,
  type ForecastStatus,
} from './resourceForecastEngine';
import {
  expeditionForecastEngine,
  type ExpeditionForecast,
  type ExpeditionForecastStatus,
} from './expeditionForecastEngine';

// ── Panel State Type ─────────────────────────────────────────

export type PanelState = 'PASSIVE' | 'ACTIVE' | 'ALERT';

// ── Panel Categories ─────────────────────────────────────────

export type VCDPanelCategory =
  | 'ROUTE'
  | 'RESOURCE'
  | 'TERRAIN'
  | 'CAMPSITE'
  | 'FORECAST';

// ── Panel State Map ──────────────────────────────────────────

export type VCDPanelStateMap = Record<VCDPanelCategory, PanelState>;

// ── Visual Constants ─────────────────────────────────────────

/** Opacity values for each panel state */
export const VCD_OPACITY: Record<PanelState, number> = {
  PASSIVE: 0.65,
  ACTIVE:  1.0,
  ALERT:   1.0,
};

/** Scale values for each panel state (subtle) */
export const VCD_SCALE: Record<PanelState, number> = {
  PASSIVE: 1.0,
  ACTIVE:  1.0,
  ALERT:   1.0,
};

/** Border color for each panel state */
export const VCD_BORDER_COLOR: Record<PanelState, string> = {
  PASSIVE: 'rgba(30,35,43,0.6)',
  ACTIVE:  'rgba(212,160,23,0.35)',
  ALERT:   'rgba(239,83,80,0.5)',
};

/** Glow shadow for ALERT state */
export const VCD_ALERT_GLOW = {
  shadowColor: 'rgba(239,83,80,0.6)',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 3,
};

/** Glow shadow for ACTIVE state */
export const VCD_ACTIVE_GLOW = {
  shadowColor: 'rgba(212,160,23,0.4)',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.25,
  shadowRadius: 6,
  elevation: 2,
};

/** Transition duration in ms */
export const VCD_TRANSITION_MS = 300;

// ── Threshold Constants ──────────────────────────────────────

/** Fuel margin in gallons — below this triggers ALERT */
const FUEL_ALERT_MARGIN_GAL = 3.3;  // ~40 miles at 12 MPG
/** Fuel margin in gallons — below this triggers ACTIVE */
const FUEL_ACTIVE_MARGIN_GAL = 8;

/** Power reserve percent — below this triggers ALERT */
const POWER_ALERT_PERCENT = 20;
/** Power reserve percent — below this triggers ACTIVE */
const POWER_ACTIVE_PERCENT = 30;

/** Terrain event proximity in miles — below this triggers ALERT */
const TERRAIN_ALERT_PROXIMITY_MI = 10;
/** Terrain event proximity in miles — below this triggers ACTIVE */
const TERRAIN_ACTIVE_PROXIMITY_MI = 20;

// ── State Computation ────────────────────────────────────────

/**
 * Compute the VCD panel state for the ROUTE category.
 */
function computeRouteState(
  routeIntel: RouteIntelligence | null,
  terrainIntel: TerrainIntelligence | null,
): PanelState {
  if (!routeIntel) return 'PASSIVE';

  // If terrain has warnings and route is loaded, at minimum ACTIVE
  if (terrainIntel && terrainIntel.terrainWarnings.length > 0) {
    // Mountain pass or severe risk → ALERT
    if (terrainIntel.mountainPassDetected || terrainIntel.overallRisk === 'SEVERE') {
      return 'ALERT';
    }
    // High risk → ACTIVE
    if (terrainIntel.overallRisk === 'HIGH' || terrainIntel.steepSegments > 2) {
      return 'ACTIVE';
    }
  }

  // Route loaded with moderate+ difficulty → ACTIVE
  if (routeIntel.overallDifficulty === 'difficult' || routeIntel.overallDifficulty === 'challenging') {
    return 'ACTIVE';
  }

  return 'PASSIVE';
}

/**
 * Compute the VCD panel state for the RESOURCE category.
 * Evaluates fuel, water, and power — returns the highest severity.
 */
function computeResourceState(
  resourceForecast: ResourceForecast | null,
): PanelState {
  if (!resourceForecast) return 'PASSIVE';

  const { fuel, water, power } = resourceForecast;

  // Check for any LOW (critical) status → ALERT
  if (fuel.status === 'LOW' || water.status === 'LOW' || power.status === 'LOW') {
    return 'ALERT';
  }

  // Check fuel margin specifically
  if (fuel.marginGallons < FUEL_ALERT_MARGIN_GAL) {
    return 'ALERT';
  }

  // Check power margin specifically (estimate percent from hours)
  if (power.availableHours > 0) {
    const powerPercent = (power.marginHours / power.availableHours) * 100;
    if (powerPercent < POWER_ALERT_PERCENT) {
      return 'ALERT';
    }
    if (powerPercent < POWER_ACTIVE_PERCENT) {
      return 'ACTIVE';
    }
  }

  // Check for any CAUTION status → ACTIVE
  if (fuel.status === 'CAUTION' || water.status === 'CAUTION' || power.status === 'CAUTION') {
    return 'ACTIVE';
  }

  // Check fuel margin for ACTIVE threshold
  if (fuel.marginGallons < FUEL_ACTIVE_MARGIN_GAL) {
    return 'ACTIVE';
  }

  return 'PASSIVE';
}

/**
 * Compute the VCD panel state for the TERRAIN category.
 */
function computeTerrainState(
  terrainIntel: TerrainIntelligence | null,
): PanelState {
  if (!terrainIntel) return 'PASSIVE';

  // Mountain pass detected → ALERT
  if (terrainIntel.mountainPassDetected) {
    return 'ALERT';
  }

  // Severe terrain risk → ALERT
  if (terrainIntel.overallRisk === 'SEVERE') {
    return 'ALERT';
  }

  // High terrain risk or multiple steep segments → ACTIVE
  if (terrainIntel.overallRisk === 'HIGH' || terrainIntel.steepSegments > 2) {
    return 'ACTIVE';
  }

  // Moderate risk or any steep/high-elevation segments → ACTIVE
  if (
    terrainIntel.overallRisk === 'MODERATE' ||
    terrainIntel.steepSegments > 0 ||
    terrainIntel.highElevationSegments > 0
  ) {
    return 'ACTIVE';
  }

  return 'PASSIVE';
}

/**
 * Compute the VCD panel state for the CAMPSITE category.
 */
function computeCampsiteState(
  routeIntel: RouteIntelligence | null,
  resourceForecast: ResourceForecast | null,
): PanelState {
  if (!routeIntel) return 'PASSIVE';

  // If resources are strained, campsite info becomes more relevant
  if (resourceForecast) {
    if (resourceForecast.overallStatus === 'LOW') {
      return 'ALERT';
    }
    if (resourceForecast.overallStatus === 'CAUTION') {
      return 'ACTIVE';
    }
    // Multi-day expedition → campsite info is relevant
    if (resourceForecast.estimatedDays > 1) {
      return 'ACTIVE';
    }
  }

  return 'PASSIVE';
}

/**
 * Compute the VCD panel state for the FORECAST category.
 */
function computeForecastState(
  expeditionForecast: ExpeditionForecast | null,
): PanelState {
  if (!expeditionForecast) return 'PASSIVE';

  if (expeditionForecast.status === 'WARNING') {
    return 'ALERT';
  }

  if (expeditionForecast.status === 'CAUTION') {
    return 'ACTIVE';
  }

  return 'PASSIVE';
}

// ── Priority Resolution ──────────────────────────────────────

const STATE_PRIORITY: Record<PanelState, number> = {
  PASSIVE: 0,
  ACTIVE: 1,
  ALERT: 2,
};

/**
 * When multiple panels are in ALERT state simultaneously,
 * resolve which one gets highest visual priority.
 * Returns the panel states with at most ONE alert panel
 * (the highest priority one). Others are demoted to ACTIVE.
 *
 * Priority order: RESOURCE > TERRAIN > FORECAST > ROUTE > CAMPSITE
 */
const CATEGORY_PRIORITY: VCDPanelCategory[] = [
  'RESOURCE',
  'TERRAIN',
  'FORECAST',
  'ROUTE',
  'CAMPSITE',
];

export function resolveAlertPriority(states: VCDPanelStateMap): VCDPanelStateMap {
  const alertPanels = CATEGORY_PRIORITY.filter(cat => states[cat] === 'ALERT');

  // 0 or 1 alert — no conflict
  if (alertPanels.length <= 1) return states;

  // Keep only the highest-priority alert; demote others to ACTIVE
  const resolved = { ...states };
  const primaryAlert = alertPanels[0]; // highest priority

  for (let i = 1; i < alertPanels.length; i++) {
    resolved[alertPanels[i]] = 'ACTIVE';
  }

  return resolved;
}

// ── Main Computation ─────────────────────────────────────────

/**
 * Compute all VCD panel states from current engine outputs.
 * Returns a resolved state map with alert priority applied.
 */
export function computeVCDPanelStates(
  routeIntel: RouteIntelligence | null,
  terrainIntel: TerrainIntelligence | null,
  resourceForecast: ResourceForecast | null,
  expeditionForecast: ExpeditionForecast | null,
): VCDPanelStateMap {
  const raw: VCDPanelStateMap = {
    ROUTE: computeRouteState(routeIntel, terrainIntel),
    RESOURCE: computeResourceState(resourceForecast),
    TERRAIN: computeTerrainState(terrainIntel),
    CAMPSITE: computeCampsiteState(routeIntel, resourceForecast),
    FORECAST: computeForecastState(expeditionForecast),
  };

  return resolveAlertPriority(raw);
}

// ── Default State ────────────────────────────────────────────

export const DEFAULT_VCD_STATES: VCDPanelStateMap = {
  ROUTE: 'PASSIVE',
  RESOURCE: 'PASSIVE',
  TERRAIN: 'PASSIVE',
  CAMPSITE: 'PASSIVE',
  FORECAST: 'PASSIVE',
};

// ══════════════════════════════════════════════════════════════
// REACT HOOK — useVCDPanelStates
// ══════════════════════════════════════════════════════════════

/**
 * React hook that subscribes to all ECS intelligence engines
 * and returns computed VCD panel states.
 *
 * Updates automatically when any engine emits new data.
 * Debounces rapid state changes to prevent visual noise.
 */
export function useVCDPanelStates(): VCDPanelStateMap {
  const [states, setStates] = useState<VCDPanelStateMap>(DEFAULT_VCD_STATES);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = useCallback(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce by 150ms to batch rapid engine updates
    debounceRef.current = setTimeout(() => {
      const routeIntel = routeAnalysisEngine.getCurrent();
      const terrainIntel = terrainAnalysisEngine.getCurrent();
      const resourceFC = resourceForecastEngine.getCurrent();
      const expeditionFC = expeditionForecastEngine.getCurrent();

      const newStates = computeVCDPanelStates(
        routeIntel,
        terrainIntel,
        resourceFC,
        expeditionFC,
      );

      setStates(newStates);
    }, 150);
  }, []);

  useEffect(() => {
    // Initial computation
    recompute();

    // Subscribe to all engines
    const unsubs = [
      routeAnalysisEngine.subscribe(() => recompute()),
      terrainAnalysisEngine.subscribe(() => recompute()),
      resourceForecastEngine.subscribe(() => recompute()),
      expeditionForecastEngine.subscribe(() => recompute()),
    ];

    return () => {
      unsubs.forEach(fn => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [recompute]);

  return states;
}

// ══════════════════════════════════════════════════════════════
// ANIMATED VALUE HOOK — useVCDAnimatedState
// ══════════════════════════════════════════════════════════════

/**
 * Returns an Animated.Value for opacity and border color string
 * that smoothly transitions when the panel state changes.
 */
export function useVCDAnimatedState(panelState: PanelState) {
  const opacityAnim = useRef(new Animated.Value(VCD_OPACITY[panelState])).current;
  const prevState = useRef(panelState);

  useEffect(() => {
    if (prevState.current !== panelState) {
      prevState.current = panelState;

      Animated.timing(opacityAnim, {
        toValue: VCD_OPACITY[panelState],
        duration: VCD_TRANSITION_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [panelState, opacityAnim]);

  return {
    opacity: opacityAnim,
    borderColor: VCD_BORDER_COLOR[panelState],
    glow: panelState === 'ALERT'
      ? VCD_ALERT_GLOW
      : panelState === 'ACTIVE'
        ? VCD_ACTIVE_GLOW
        : null,
    state: panelState,
  };
}

