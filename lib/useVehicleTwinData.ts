/**
 * useVehicleTwinData — Aggregated ECS data hook for Vehicle Twin screen.
 *
 * Reads from:
 *   - useAccelerometer → roll / pitch
 *   - usePowerTelemetry → battery SOC, solar input, output draw
 *   - Fleet canonical vehicle state selectors → weight, payload, COG, readiness
 *   - loadoutStore + saved Fleet build/loadout state → per-zone loadout weights
 *   - vehicleSetupStore → active vehicle ID
 *
 * Returns a flat data object with formatted display strings and raw values.
 * All unavailable values default to '--'.
 */

import { useState, useEffect } from 'react';
import { useAccelerometer } from './useAccelerometer';
import { usePowerTelemetry } from '../src/power/hooks/usePowerTelemetry';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleStore } from './vehicleStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { consumablesStore } from './consumablesStore';
import { tiresLiftStore } from './tiresLiftStore';
import { loadoutItemStore, loadoutStore } from './loadoutStore';
import { selectFleetVehicleState } from './fleet/fleetVehicleStateSelectors';

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

function emptyZoneWeights(): {
  leftDrawer: number;
  rightDrawer: number;
  rearContainer: number;
  roof: number;
  cab: number;
  bed: number;
} {
  return { leftDrawer: 0, rightDrawer: 0, rearContainer: 0, roof: 0, cab: 0, bed: 0 };
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
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Subscribe to vehicleSetupStore changes ──
  useEffect(() => {
    const unsub = vehicleSetupStore.subscribe(() => {
      const newId = vehicleSetupStore.getActiveVehicleId();
      setVehicleId(newId);
    });
    return unsub;
  }, []);

  // ── Subscribe to canonical vehicle state changes ──
  useEffect(() => {
    const offVehicles = vehicleStore.subscribe((event) => {
      if (!vehicleId || event.vehicleId === vehicleId) {
        setRefreshKey((key) => key + 1);
      }
    });
    const offLoadouts = loadoutStore.subscribe((_, updatedVehicleId) => {
      if (!vehicleId || updatedVehicleId === vehicleId) {
        setRefreshKey((key) => key + 1);
      }
    });
    const offItems = loadoutItemStore.subscribe(() => {
      setRefreshKey((key) => key + 1);
    });
    const offSpecs = vehicleSpecStore.subscribe(() => {
      setRefreshKey((key) => key + 1);
    });
    const offConsumables = consumablesStore.subscribe(() => {
      setRefreshKey((key) => key + 1);
    });
    const offTiresLift = tiresLiftStore.subscribe((updatedVehicleId) => {
      if (!vehicleId || updatedVehicleId === vehicleId) {
        setRefreshKey((key) => key + 1);
      }
    });
    return () => {
      offVehicles();
      offLoadouts();
      offItems();
      offSpecs();
      offConsumables();
      offTiresLift();
    };
  }, [vehicleId]);

  // ── Compute derived data ──
  void refreshKey;
  const canonicalState = selectFleetVehicleState(vehicleId);
  const weightResult = canonicalState?.operatingWeight.weightResult ?? null;
  const dashboardData = canonicalState?.operatingWeight.dashboardData ?? null;
  const cgResult = dashboardData?.cgResult ?? null;
  const zoneWeights = canonicalState
    ? {
        leftDrawer: 0,
        rightDrawer: 0,
        rearContainer:
          weightResult!.zoneWeights.rearLow.totalWeight.lbs +
          weightResult!.zoneWeights.hitch.totalWeight.lbs +
          weightResult!.zoneWeights.trailer.totalWeight.lbs,
        roof: weightResult!.zoneWeights.roof.totalWeight.lbs,
        cab:
          weightResult!.zoneWeights.cab.totalWeight.lbs +
          weightResult!.zoneWeights.frontLow.totalWeight.lbs,
        bed:
          weightResult!.zoneWeights.bedLow.totalWeight.lbs +
          weightResult!.zoneWeights.bedHigh.totalWeight.lbs +
          weightResult!.zoneWeights.rearLow.totalWeight.lbs,
      }
    : emptyZoneWeights();

  // Power data
  const batteryPct = powerTelemetry?.battery?.socPct ?? null;
  const solarWatts = powerTelemetry?.solar?.watts ?? null;
  const outputWatts = powerTelemetry?.battery?.wattsOut ?? null;

  // Axle weights in lbs
  const totalMass = weightResult?.operatingWeight.lbs ?? cgResult?.totalMass ?? null;
  const frontAxleLbs = dashboardData?.frontAxleLoad ?? (
    totalMass != null && cgResult ? Math.round(totalMass * (cgResult.frontAxlePercent / 100)) : null
  );
  const rearAxleLbs = dashboardData?.rearAxleLoad ?? (
    totalMass != null && cgResult ? Math.round(totalMass * (cgResult.rearAxlePercent / 100)) : null
  );

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
    buildWeightLbs: weightResult && weightResult.operatingWeight.lbs > 0 ? weightResult.operatingWeight.lbs : null,
    payloadMarginLbs: weightResult?.payloadRemaining?.lbs ?? null,
    itemsWeightLbs: weightResult && weightResult.activeLoadoutWeight.lbs > 0 ? weightResult.activeLoadoutWeight.lbs : null,
    buildWeightDisplay: weightResult && weightResult.operatingWeight.lbs > 0 ? fmtLbs(weightResult.operatingWeight.lbs) : '--',
    payloadMarginDisplay: weightResult?.payloadRemaining ? fmtLbs(weightResult.payloadRemaining.lbs) : '--',
    itemsWeightDisplay: weightResult && weightResult.activeLoadoutWeight.lbs > 0 ? fmtLbs(weightResult.activeLoadoutWeight.lbs) : '--',

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
    vehicleName: canonicalState?.vehicle.name ?? null,
    hasVehicle: !!vehicleId,
    hasSpecs: Boolean(weightResult?.baseNetWeight.lbs && weightResult.gvwr?.lbs),
    hasPower: powerTelemetry != null,
  };
}


