/**
 * useVehicleTwinData — Aggregated ECS data hook for Vehicle Twin screen.
 *
 * Reads from:
 *   - useAccelerometer → roll / pitch
 *   - usePowerTelemetry → battery SOC, solar input, output draw
 *   - calculateCG + vehicleStore → axle load distribution
 *   - computeFullBuildWeightBreakdown → total build weight, payload margin
 *   - loadoutStore + weightStore → per-zone loadout weights
 *   - vehicleSetupStore → active vehicle ID
 *
 * Returns a flat data object with formatted display strings and raw values.
 * All unavailable values default to '--'.
 */

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAccelerometer } from './useAccelerometer';
import { usePowerTelemetry } from '../src/power/hooks/usePowerTelemetry';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { calculateCG, computeFullBuildWeightBreakdown } from './weightEngine';
import { loadoutWeightCache } from './loadoutWeightCache';
import type { CGResult } from './weightEngine';


// ── Storage helpers (read vehicle data from localStorage) ────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

// ── Types ────────────────────────────────────────────────────

export interface VehicleTwinData {
  // ── Attitude ──
  rollDeg: number | null;
  pitchDeg: number | null;
  rollDisplay: string;
  pitchDisplay: string;
  sensorStatus: string;

  // ── Axle Load ──
  frontAxlePercent: number | null;
  rearAxlePercent: number | null;
  frontAxleLbs: number | null;
  rearAxleLbs: number | null;
  frontAxleDisplay: string;
  rearAxleDisplay: string;
  distributionDisplay: string;
  totalMassLbs: number | null;

  // ── Loadout Status ──
  leftDrawerLbs: number | null;
  rightDrawerLbs: number | null;
  rearContainerLbs: number | null;
  leftDrawerDisplay: string;
  rightDrawerDisplay: string;
  rearContainerDisplay: string;

  // ── Build Weight / Payload ──
  buildWeightLbs: number | null;
  payloadMarginLbs: number | null;
  itemsWeightLbs: number | null;
  buildWeightDisplay: string;
  payloadMarginDisplay: string;
  itemsWeightDisplay: string;

  // ── Zone schematic weights ──
  roofWeightLbs: number | null;
  cabWeightLbs: number | null;
  bedWeightLbs: number | null;
  roofWeightDisplay: string;
  cabWeightDisplay: string;
  bedWeightDisplay: string;

  // ── Power System ──
  batteryPct: number | null;
  solarWatts: number | null;
  outputWatts: number | null;
  batteryDisplay: string;
  solarDisplay: string;
  outputDisplay: string;

  // ── Meta ──
  vehicleName: string | null;
  hasVehicle: boolean;
  hasSpecs: boolean;
  hasPower: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function fmt(val: number | null | undefined, suffix: string, decimals: number = 0): string {
  if (val == null || isNaN(val)) return '--';
  return `${val.toFixed(decimals)}${suffix}`;
}

function fmtLbs(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-- lbs';
  return `${Math.round(val)} lbs`;
}

function getVehicleLocal(vehicleId: string): any | null {
  try {
    const raw = lsGet('ecs_local_vehicles');
    if (!raw) return null;
    const vehicles = JSON.parse(raw);
    return vehicles.find((v: any) => v.id === vehicleId) || null;
  } catch {
    return null;
  }
}

function getLoadoutItemsLocal(): any[] {
  try {
    const raw = lsGet('ecs_local_loadout_items');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function getLoadoutsLocal(): any[] {
  try {
    const raw = lsGet('ecs_local_loadouts');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

/**
 * Compute zone-specific weights from loadout items.
 * Matches items by storage_location containing zone name patterns.
 */
function computeLoadoutZoneWeights(vehicleId: string): {
  leftDrawer: number;
  rightDrawer: number;
  rearContainer: number;
  roof: number;
  cab: number;
  bed: number;
} {
  const result = { leftDrawer: 0, rightDrawer: 0, rearContainer: 0, roof: 0, cab: 0, bed: 0 };

  try {
    // Find loadouts linked to this vehicle
    const loadouts = getLoadoutsLocal();
    const vehicleLoadoutIds = loadouts
      .filter((l: any) => l.vehicle_id === vehicleId)
      .map((l: any) => l.id);

    if (vehicleLoadoutIds.length === 0) {
      // Also check loadouts without vehicle_id (general loadouts)
      // Use all loadout items as fallback
      const allItems = getLoadoutItemsLocal();
      return computeFromItems(allItems);
    }

    const allItems = getLoadoutItemsLocal();
    const vehicleItems = allItems.filter((item: any) =>
      vehicleLoadoutIds.includes(item.loadout_id)
    );

    return computeFromItems(vehicleItems);
  } catch {
    return result;
  }
}

function computeFromItems(items: any[]): {
  leftDrawer: number;
  rightDrawer: number;
  rearContainer: number;
  roof: number;
  cab: number;
  bed: number;
} {
  const result = { leftDrawer: 0, rightDrawer: 0, rearContainer: 0, roof: 0, cab: 0, bed: 0 };

  for (const item of items) {
    const loc = (item.storage_location || '').toLowerCase();
    const weight = (item.weight_lbs || 0) * Math.max(1, item.quantity || 1);

    if (loc.includes('left') && loc.includes('drawer')) {
      result.leftDrawer += weight;
    } else if (loc.includes('right') && loc.includes('drawer')) {
      result.rightDrawer += weight;
    } else if (loc.includes('drawer')) {
      // Generic drawer — split evenly or assign to left
      result.leftDrawer += weight;
    }

    if (loc.includes('rear') && (loc.includes('container') || loc.includes('cargo'))) {
      result.rearContainer += weight;
    } else if (loc.includes('container') || loc.includes('bin') || loc.includes('box')) {
      result.rearContainer += weight;
    }

    // Zone mapping for schematic
    if (loc.includes('roof') || loc.includes('rack')) {
      result.roof += weight;
    } else if (loc.includes('cab') || loc.includes('interior') || loc.includes('front')) {
      result.cab += weight;
    } else if (
      loc.includes('bed') || loc.includes('rear') || loc.includes('drawer') ||
      loc.includes('container') || loc.includes('cargo') || loc.includes('hitch') ||
      loc.includes('topper') || loc.includes('cap') || loc.includes('alu')
    ) {
      result.bed += weight;
    } else {
      // Unassigned items go to bed zone by default
      result.bed += weight;
    }
  }

  return {
    leftDrawer: Math.round(result.leftDrawer * 10) / 10,
    rightDrawer: Math.round(result.rightDrawer * 10) / 10,
    rearContainer: Math.round(result.rearContainer * 10) / 10,
    roof: Math.round(result.roof * 10) / 10,
    cab: Math.round(result.cab * 10) / 10,
    bed: Math.round(result.bed * 10) / 10,
  };
}

// ── Hook ─────────────────────────────────────────────────────

export function useVehicleTwinData(): VehicleTwinData {
  // ── Sensor hooks ──
  const accel = useAccelerometer(true);
  const powerTelemetry = usePowerTelemetry();

  // ── Local state ──
  const [vehicleId, setVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );
  const [wizardSelections, setWizardSelections] = useState<Record<string, string>>({});
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [zoneWeights, setZoneWeights] = useState({
    leftDrawer: 0, rightDrawer: 0, rearContainer: 0,
    roof: 0, cab: 0, bed: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Subscribe to vehicleSetupStore changes ──
  useEffect(() => {
    const unsub = vehicleSetupStore.subscribe(() => {
      const newId = vehicleSetupStore.getActiveVehicleId();
      setVehicleId(newId);
    });
    return unsub;
  }, []);

  // ── Load vehicle data when vehicleId changes ──
  useEffect(() => {
    if (!vehicleId) {
      setWizardSelections({});
      setVehicleName(null);
      setZoneWeights({ leftDrawer: 0, rightDrawer: 0, rearContainer: 0, roof: 0, cab: 0, bed: 0 });
      return;
    }

    const vehicle = getVehicleLocal(vehicleId);
    if (vehicle) {
      setVehicleName(vehicle.name || null);
      setWizardSelections(vehicle.wizard_config || {});
    }

    // Compute zone weights from loadout items
    const zw = computeLoadoutZoneWeights(vehicleId);
    setZoneWeights(zw);
  }, [vehicleId, refreshKey]);

  // ── Subscribe to loadout weight cache changes ──
  useEffect(() => {
    const unsub = loadoutWeightCache.subscribe(() => {
      setRefreshKey(k => k + 1);
    });
    return unsub;
  }, []);

  // ── Subscribe to vehicle spec changes ──
  useEffect(() => {
    const unsub = vehicleSpecStore.subscribe(() => {
      setRefreshKey(k => k + 1);
    });
    return unsub;
  }, []);

  // ── Compute derived data ──

  // CG / Axle loads
  let cgResult: CGResult | null = null;
  const hasSelections = Object.keys(wizardSelections).length > 0;
  if (hasSelections) {
    cgResult = calculateCG(wizardSelections);
  }

  // Build weight breakdown
  const breakdown = computeFullBuildWeightBreakdown(vehicleId || undefined);

  // Power data
  const batteryPct = powerTelemetry?.battery?.socPct ?? null;
  const solarWatts = powerTelemetry?.solar?.watts ?? null;
  const outputWatts = powerTelemetry?.battery?.wattsOut ?? null;

  // Axle weights in lbs
  const totalMass = cgResult?.totalMass ?? null;
  const frontAxleLbs = totalMass != null && cgResult
    ? Math.round(totalMass * (cgResult.frontAxlePercent / 100))
    : null;
  const rearAxleLbs = totalMass != null && cgResult
    ? Math.round(totalMass * (cgResult.rearAxlePercent / 100))
    : null;

  // ── Build output ──
  return {
    // Attitude
    rollDeg: accel.isActive ? accel.rollDeg : null,
    pitchDeg: accel.isActive ? accel.pitchDeg : null,
    rollDisplay: accel.isActive ? `${accel.rollDeg.toFixed(1)}°` : '--',
    pitchDisplay: accel.isActive ? `${accel.pitchDeg.toFixed(1)}°` : '--',
    sensorStatus: accel.sensorStatus,

    // Axle Load
    frontAxlePercent: cgResult?.frontAxlePercent ?? null,
    rearAxlePercent: cgResult?.rearAxlePercent ?? null,
    frontAxleLbs,
    rearAxleLbs,
    frontAxleDisplay: frontAxleLbs != null ? `${frontAxleLbs} lbs` : '--',
    rearAxleDisplay: rearAxleLbs != null ? `${rearAxleLbs} lbs` : '--',
    distributionDisplay: cgResult
      ? `${cgResult.frontAxlePercent}/${cgResult.rearAxlePercent}`
      : '--/--',
    totalMassLbs: totalMass,

    // Loadout zone weights
    leftDrawerLbs: zoneWeights.leftDrawer || null,
    rightDrawerLbs: zoneWeights.rightDrawer || null,
    rearContainerLbs: zoneWeights.rearContainer || null,
    leftDrawerDisplay: zoneWeights.leftDrawer > 0 ? fmtLbs(zoneWeights.leftDrawer) : '--',
    rightDrawerDisplay: zoneWeights.rightDrawer > 0 ? fmtLbs(zoneWeights.rightDrawer) : '--',
    rearContainerDisplay: zoneWeights.rearContainer > 0 ? fmtLbs(zoneWeights.rearContainer) : '--',

    // Build weight / payload
    buildWeightLbs: breakdown.build_weight_lb > 0 ? breakdown.build_weight_lb : null,
    payloadMarginLbs: breakdown.has_specs ? breakdown.payload_margin_lb : null,
    itemsWeightLbs: breakdown.items_weight_lb > 0 ? breakdown.items_weight_lb : null,
    buildWeightDisplay: breakdown.build_weight_lb > 0 ? fmtLbs(breakdown.build_weight_lb) : '--',
    payloadMarginDisplay: breakdown.has_specs ? fmtLbs(breakdown.payload_margin_lb) : '--',
    itemsWeightDisplay: breakdown.items_weight_lb > 0 ? fmtLbs(breakdown.items_weight_lb) : '--',

    // Zone schematic weights
    roofWeightLbs: zoneWeights.roof || null,
    cabWeightLbs: zoneWeights.cab || null,
    bedWeightLbs: zoneWeights.bed || null,
    roofWeightDisplay: zoneWeights.roof > 0 ? fmtLbs(zoneWeights.roof) : '--',
    cabWeightDisplay: zoneWeights.cab > 0 ? fmtLbs(zoneWeights.cab) : '--',
    bedWeightDisplay: zoneWeights.bed > 0 ? fmtLbs(zoneWeights.bed) : '--',

    // Power System
    batteryPct,
    solarWatts,
    outputWatts,
    batteryDisplay: batteryPct != null ? `${Math.round(batteryPct)}%` : '--',
    solarDisplay: solarWatts != null ? `${Math.round(solarWatts)} W` : '--',
    outputDisplay: outputWatts != null ? `${Math.round(outputWatts)} W` : '--',

    // Meta
    vehicleName,
    hasVehicle: !!vehicleId,
    hasSpecs: breakdown.has_specs,
    hasPower: powerTelemetry != null,
  };
}


