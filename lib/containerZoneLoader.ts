/**
 * Container Zone Loader
 *
 * PHASE 3: Loads container zones from the active vehicle's accessory framework.
 * PHASE 5B: Backfills spatial bias metadata on persisted zones.
 *
 * Priority order:
 *   1. vehicle.containerZones (persisted from Phase 2)
 *   2. Regenerate from vehicle.accessoryFramework (if containerZones missing)
 *   3. Fall back to expedition cache zones (legacy)
 *   4. Empty array (no accessories configured)
 */

import { Platform } from 'react-native';
import type { ContainerZone, AccessoryFramework } from './accessoryFramework';
import {
  generateContainerZonesFromAccessories,
  normalizeAccessoryFramework,
  resolveZoneBias,
  sanitizeContainerZones,
} from './accessoryFramework';

const LS_KEY = 'ecs_local_vehicles';
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

/**
 * Backfill Phase 5B bias metadata on a persisted zone that may lack it.
 */
function ensureZoneBias(zone: any): ContainerZone {
  if (zone.verticalBias && zone.longitudinalBias && zone.lateralBias) {
    return zone as ContainerZone;
  }
  const bias = resolveZoneBias(zone);
  return { ...zone, ...bias } as ContainerZone;
}

/**
 * Load container zones for a specific vehicle from local storage.
 *
 * @param vehicleId - The vehicle ID to load zones for
 * @returns ContainerZone[] — ordered array of container zones, or empty if none configured
 */
export function loadContainerZonesForVehicle(vehicleId: string): ContainerZone[] {
  if (!vehicleId) return [];

  try {
    const raw = lsGet(LS_KEY);
    if (!raw) return [];

    const vehicles = JSON.parse(raw);
    if (!Array.isArray(vehicles)) return [];

    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    if (!vehicle) return [];

    // Priority 1: Pre-computed containerZones from Phase 2 (backfill bias)
    const persistedZones = sanitizeContainerZones(vehicle.containerZones);
    if (persistedZones.length > 0) {
      return persistedZones.map(ensureZoneBias);
    }

    // Priority 2: Regenerate from accessoryFramework (includes bias from Phase 5B)
    const framework = normalizeAccessoryFramework(vehicle.accessoryFramework as AccessoryFramework | null);
    if (framework) {
      const zones = generateContainerZonesFromAccessories(framework);
      if (zones.length > 0) return zones;
    }

    return [];
  } catch (e) {
    console.warn('[ContainerZoneLoader] Error loading zones:', e);
    return [];
  }
}

/**
 * Check if a vehicle has any accessories configured.
 */
export function vehicleHasAccessories(vehicleId: string): boolean {
  if (!vehicleId) return false;

  try {
    const raw = lsGet(LS_KEY);
    if (!raw) return false;

    const vehicles = JSON.parse(raw);
    if (!Array.isArray(vehicles)) return false;

    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    if (!vehicle) return false;

    if (sanitizeContainerZones(vehicle.containerZones).length > 0) {
      return true;
    }

    const fw = normalizeAccessoryFramework(vehicle.accessoryFramework as AccessoryFramework | null);
    if (fw) {
      return Object.values(fw).some((entry: any) => entry && entry.enabled);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get a zone by its ID from the container zones array.
 */
export function getContainerZoneById(zones: ContainerZone[], zoneId: string): ContainerZone | undefined {
  return zones.find(z => z.id === zoneId);
}

/**
 * Get a zone by its label (used for storage_location matching).
 */
export function getContainerZoneByLabel(zones: ContainerZone[], label: string): ContainerZone | undefined {
  return zones.find(z => z.label === label || z.id === label);
}

/**
 * Match a storage_location string to a container zone.
 */
export function matchStorageLocationToZone(
  zones: ContainerZone[],
  storageLocation: string | null
): ContainerZone | undefined {
  if (!storageLocation || zones.length === 0) return undefined;

  const loc = storageLocation.trim().toLowerCase();

  const exactLabel = zones.find(z => z.label.toLowerCase() === loc);
  if (exactLabel) return exactLabel;

  const exactId = zones.find(z => z.id.toLowerCase() === loc);
  if (exactId) return exactId;

  const partial = zones.find(z =>
    z.label.toLowerCase().includes(loc) || loc.includes(z.label.toLowerCase())
  );
  if (partial) return partial;

  return undefined;
}

