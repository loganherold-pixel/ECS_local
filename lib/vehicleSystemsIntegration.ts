/**
 * Vehicle Systems Integration — Phase 4
 *
 * Leverages the Accessory Framework to provide advanced ECS logic:
 *
 *   1. Weight estimation per container zone
 *   2. Water storage location tracking
 *   3. Power distribution awareness
 *
 * All zone data is dynamically derived from the vehicle's accessoryFramework
 * and containerZones — no hardcoded accessory categories.
 *
 * FUTURE EXPANSION (Phase 4.2+):
 *   - RTT sleep system status
 *   - Power redundancy scoring
 *   - Water logistics scoring
 *   These are structurally prepared but scoring logic is NOT implemented yet.
 */

import type {
  AccessoryFramework,
  AccessoryFrameworkEntry,
  ContainerZone,
} from './accessoryFramework';
import {
  generateContainerZonesFromAccessories,
  isAccessoryEnabled,
  getEnabledAccessoryCount,
} from './accessoryFramework';
import {
  zoneCapacityStore,
  getDefaultZoneCapacity,
  computeItemWeight,
  getWeightStatusColor,
  getWeightStatusLabel,
} from './weightStore';

// ═══════════════════════════════════════════════════════════════
// TYPES — Vehicle Systems Overview
// ═══════════════════════════════════════════════════════════════

/**
 * Per-zone weight estimation result.
 */
export interface ZoneWeightEstimate {
  zoneId: string;
  zoneLabel: string;
  zoneColor: string;
  zoneIcon: string;
  /** Weight capacity in lbs (from zoneCapacityStore or default) */
  capacityLbs: number;
  /** Current loaded weight in lbs (from loadout items assigned to this zone) */
  loadedWeightLbs: number;
  /** Utilization percentage (0–100+) */
  utilizationPct: number;
  /** Status color based on utilization */
  statusColor: string;
  /** Status label (GOOD, MODERATE, NEAR LIMIT, OVERWEIGHT) */
  statusLabel: string;
  /** Number of items assigned to this zone */
  itemCount: number;
}

/**
 * Water storage location tracking result.
 */
export interface WaterStorageInfo {
  /** Whether the vehicle has a dedicated water storage zone */
  hasWaterZone: boolean;
  /** The container zone for water storage (if any) */
  waterZone: ContainerZone | null;
  /** Installation status of the water storage accessory */
  waterStatus: 'installed' | 'planned' | 'none';
  /** Total water capacity in gallons (from vehicle specs, if available) */
  waterCapacityGal: number | null;
  /** Current water level in gallons (from vehicle consumables, if available) */
  currentWaterGal: number | null;
  /** Zones that could contain water-related items (water zone + interior) */
  waterRelatedZoneIds: string[];
}

/**
 * Power distribution awareness result.
 */
export interface PowerDistributionInfo {
  /** Whether the vehicle has a dedicated power system zone */
  hasPowerZone: boolean;
  /** The container zone for power system (if any) */
  powerZone: ContainerZone | null;
  /** Installation status of the power system accessory */
  powerStatus: 'installed' | 'planned' | 'none';
  /** Whether a fridge/slide zone exists (major power consumer) */
  hasFridgeZone: boolean;
  /** Fridge zone reference (if any) */
  fridgeZone: ContainerZone | null;
  /** Zones that are power-dependent (fridge, interior electronics, etc.) */
  powerDependentZoneIds: string[];
}

/**
 * Complete vehicle systems overview — combines all integration data.
 */
export interface VehicleSystemsOverview {
  /** Total number of container zones */
  totalZones: number;
  /** All container zones derived from the accessory framework */
  zones: ContainerZone[];
  /** Per-zone weight estimates */
  weightEstimates: ZoneWeightEstimate[];
  /** Total loaded weight across all zones */
  totalLoadedWeightLbs: number;
  /** Total capacity across all zones */
  totalCapacityLbs: number;
  /** Overall utilization percentage */
  overallUtilizationPct: number;
  /** Water storage tracking */
  water: WaterStorageInfo;
  /** Power distribution tracking */
  power: PowerDistributionInfo;
  /** Whether RTT (Roof Top Tent) is configured */
  hasRTT: boolean;
  /** RTT zone reference (if any) */
  rttZone: ContainerZone | null;
  /** Number of enabled accessories */
  enabledAccessoryCount: number;
  /** Compact zone labels for display (e.g., ["Cab Rack", "Bed Storage", "RTT"]) */
  zoneSummaryLabels: string[];
}


// ═══════════════════════════════════════════════════════════════
// ZONE CLASSIFICATION — which zones relate to which systems
// ═══════════════════════════════════════════════════════════════

/** Accessory keys that relate to water storage */
const WATER_RELATED_KEYS: (keyof AccessoryFramework)[] = [
  'waterStorage',
];

/** Accessory keys that relate to power systems */
const POWER_RELATED_KEYS: (keyof AccessoryFramework)[] = [
  'powerSystemBattery',
];

/** Accessory keys that are power-dependent (consume power) */
const POWER_DEPENDENT_KEYS: (keyof AccessoryFramework)[] = [
  'interiorStorage', // may have lighting/electronics
];

/** Accessory keys that relate to RTT / sleep systems */
const RTT_KEYS: (keyof AccessoryFramework)[] = [
  'rtt',
];

/** Short labels for compact zone summary pills */
const COMPACT_ZONE_LABELS: Record<string, string> = {
  cab_rack: 'Cab Rack',
  roof_rack: 'Roof Rack',
  rtt: 'RTT',
  bed_drawer: 'Drawers',
  interior_storage: 'Interior',
  recovery_mount: 'Recovery',
  shell_system: 'Shell',
  truck_bed: 'Bed',
  water_storage: 'Water',
  power_system: 'Power',
};


// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Compute per-zone weight estimates from container zones and loadout items.
 *
 * @param zones - Container zones from the vehicle's accessory framework
 * @param items - Loadout items (with storage_location, weight_lbs, quantity)
 * @returns ZoneWeightEstimate[] — one entry per zone
 */
export function computeZoneWeightEstimates(
  zones: ContainerZone[],
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[] = [],
): ZoneWeightEstimate[] {
  return zones.map(zone => {
    // Match items to this zone by storage_location
    const zoneItems = items.filter(item => {
      if (!item.storage_location) return false;
      const loc = item.storage_location.toLowerCase();
      return (
        loc === zone.label.toLowerCase() ||
        loc === zone.id.toLowerCase() ||
        loc.includes(zone.label.toLowerCase()) ||
        zone.label.toLowerCase().includes(loc)
      );
    });

    const loadedWeightLbs = zoneItems.reduce(
      (sum, item) => sum + computeItemWeight(item),
      0
    );
    const capacityLbs = zoneCapacityStore.getCapacity(zone.id, zone.label);
    const utilizationPct = capacityLbs > 0
      ? Math.round((loadedWeightLbs / capacityLbs) * 100)
      : 0;

    return {
      zoneId: zone.id,
      zoneLabel: zone.label,
      zoneColor: zone.color,
      zoneIcon: zone.icon,
      capacityLbs,
      loadedWeightLbs: Math.round(loadedWeightLbs * 10) / 10,
      utilizationPct,
      statusColor: getWeightStatusColor(utilizationPct),
      statusLabel: getWeightStatusLabel(utilizationPct),
      itemCount: zoneItems.length,
    };
  });
}

/**
 * Build water storage tracking info from the accessory framework.
 *
 * @param framework - The vehicle's accessory framework
 * @param zones - Container zones derived from the framework
 * @param vehicleWaterCapacity - Water capacity from vehicle specs (optional)
 * @param currentWater - Current water level (optional)
 */
export function buildWaterStorageInfo(
  framework: AccessoryFramework | null,
  zones: ContainerZone[],
  vehicleWaterCapacity?: number | null,
  currentWater?: number | null,
): WaterStorageInfo {
  if (!framework) {
    return {
      hasWaterZone: false,
      waterZone: null,
      waterStatus: 'none',
      waterCapacityGal: vehicleWaterCapacity ?? null,
      currentWaterGal: currentWater ?? null,
      waterRelatedZoneIds: [],
    };
  }

  const waterZone = zones.find(z => WATER_RELATED_KEYS.includes(z.accessoryKey));
  const waterEntry = framework.waterStorage;

  return {
    hasWaterZone: !!waterZone,
    waterZone: waterZone || null,
    waterStatus: waterEntry?.enabled
      ? (waterEntry.status || 'installed')
      : 'none',
    waterCapacityGal: vehicleWaterCapacity ?? null,
    currentWaterGal: currentWater ?? null,
    waterRelatedZoneIds: zones
      .filter(z =>
        WATER_RELATED_KEYS.includes(z.accessoryKey) ||
        z.accessoryKey === 'interiorStorage' // interior may store water containers
      )
      .map(z => z.id),
  };
}

/**
 * Build power distribution info from the accessory framework.
 *
 * @param framework - The vehicle's accessory framework
 * @param zones - Container zones derived from the framework
 */
export function buildPowerDistributionInfo(
  framework: AccessoryFramework | null,
  zones: ContainerZone[],
): PowerDistributionInfo {
  if (!framework) {
    return {
      hasPowerZone: false,
      powerZone: null,
      powerStatus: 'none',
      hasFridgeZone: false,
      fridgeZone: null,
      powerDependentZoneIds: [],
    };
  }

  const powerZone = zones.find(z => POWER_RELATED_KEYS.includes(z.accessoryKey));
  const powerEntry = framework.powerSystemBattery;

  return {
    hasPowerZone: !!powerZone,
    powerZone: powerZone || null,
    powerStatus: powerEntry?.enabled
      ? (powerEntry.status || 'installed')
      : 'none',
    hasFridgeZone: false,
    fridgeZone: null,
    powerDependentZoneIds: zones
      .filter(z => POWER_DEPENDENT_KEYS.includes(z.accessoryKey))
      .map(z => z.id),
  };
}


/**
 * Build a complete vehicle systems overview.
 *
 * This is the primary integration point — call this from widgets,
 * dashboard panels, and expedition planning views.
 *
 * @param framework - The vehicle's accessory framework (or null)
 * @param containerZones - Pre-computed container zones (or null to regenerate)
 * @param loadoutItems - Loadout items for weight computation (optional)
 * @param vehicleWaterCapacity - Water capacity from vehicle specs (optional)
 * @param currentWater - Current water level (optional)
 */
export function buildVehicleSystemsOverview(
  framework: AccessoryFramework | null,
  containerZones: ContainerZone[] | null,
  loadoutItems?: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  vehicleWaterCapacity?: number | null,
  currentWater?: number | null,
): VehicleSystemsOverview {
  // Derive zones from framework if not pre-computed
  const zones: ContainerZone[] = containerZones && containerZones.length > 0
    ? containerZones
    : framework
      ? generateContainerZonesFromAccessories(framework)
      : [];

  // Weight estimates
  const weightEstimates = computeZoneWeightEstimates(zones, loadoutItems || []);
  const totalLoadedWeightLbs = weightEstimates.reduce((sum, z) => sum + z.loadedWeightLbs, 0);
  const totalCapacityLbs = weightEstimates.reduce((sum, z) => sum + z.capacityLbs, 0);
  const overallUtilizationPct = totalCapacityLbs > 0
    ? Math.round((totalLoadedWeightLbs / totalCapacityLbs) * 100)
    : 0;

  // Water tracking
  const water = buildWaterStorageInfo(framework, zones, vehicleWaterCapacity, currentWater);

  // Power distribution
  const power = buildPowerDistributionInfo(framework, zones);

  // RTT detection
  const rttZone = zones.find(z => RTT_KEYS.includes(z.accessoryKey));

  // Compact zone labels for fleet card pills
  const zoneSummaryLabels = zones.map(z =>
    COMPACT_ZONE_LABELS[z.id] || z.label
  );

  return {
    totalZones: zones.length,
    zones,
    weightEstimates,
    totalLoadedWeightLbs: Math.round(totalLoadedWeightLbs * 10) / 10,
    totalCapacityLbs,
    overallUtilizationPct,
    water,
    power,
    hasRTT: !!rttZone,
    rttZone: rttZone || null,
    enabledAccessoryCount: framework ? getEnabledAccessoryCount(framework) : 0,
    zoneSummaryLabels,
  };
}


// ═══════════════════════════════════════════════════════════════
// COMPACT HELPERS — for fleet cards and quick summaries
// ═══════════════════════════════════════════════════════════════

/**
 * Get compact zone summary pills for a vehicle.
 * Returns an array of { label, color, icon } for display on fleet cards.
 *
 * @param framework - The vehicle's accessory framework (or null)
 * @param containerZones - Pre-computed container zones (or null)
 * @param maxPills - Maximum number of pills to return (default: 5)
 */
export function getZoneSummaryPills(
  framework: AccessoryFramework | null,
  containerZones: ContainerZone[] | null,
  maxPills: number = 5,
): { label: string; color: string; icon: string; id: string }[] {
  const zones: ContainerZone[] = containerZones && containerZones.length > 0
    ? containerZones
    : framework
      ? generateContainerZonesFromAccessories(framework)
      : [];

  return zones.slice(0, maxPills).map(z => ({
    label: COMPACT_ZONE_LABELS[z.id] || z.label,
    color: z.color,
    icon: z.icon,
    id: z.id,
  }));
}

/**
 * Get a one-line summary string for a vehicle's zone configuration.
 * Example: "Cab Rack · Bed Storage · RTT · Power"
 */
export function getZoneSummaryString(
  framework: AccessoryFramework | null,
  containerZones: ContainerZone[] | null,
  maxItems: number = 4,
  separator: string = ' · ',
): string {
  const pills = getZoneSummaryPills(framework, containerZones, maxItems);
  if (pills.length === 0) return '';
  const labels = pills.map(p => p.label);
  const zones = framework
    ? (containerZones || generateContainerZonesFromAccessories(framework))
    : (containerZones || []);
  if (zones.length > maxItems) {
    labels.push(`+${zones.length - maxItems}`);
  }
  return labels.join(separator);
}


// ═══════════════════════════════════════════════════════════════
// FUTURE EXPANSION STRUCTURES — Phase 4.2+
//
// These interfaces define the DATA SHAPE for future scoring logic.
// No scoring algorithms are implemented yet — these are structural
// placeholders that ensure the accessory framework is expandable.
// ═══════════════════════════════════════════════════════════════

/**
 * RTT Sleep System Status — future expansion.
 *
 * When scoring is implemented, this will track:
 *   - Whether RTT is installed and functional
 *   - Sleep capacity (number of people)
 *   - Weather protection rating
 *   - Setup/teardown time estimate
 */
export interface RTTSleepSystemStatus {
  /** Whether RTT is configured on this vehicle */
  isConfigured: boolean;
  /** Installation status */
  installStatus: 'installed' | 'planned' | 'none';
  /** Zone where RTT is mounted */
  mountZoneId: string | null;
  /** Sleep capacity (number of people) — user-configurable */
  sleepCapacity: number | null;
  /** Weather protection tier — future scoring input */
  weatherProtectionTier: 'basic' | 'standard' | 'expedition' | null;
  /** Estimated setup time in minutes — future scoring input */
  setupTimeMinutes: number | null;
}

/**
 * Power Redundancy Scoring Structure — future expansion.
 *
 * When scoring is implemented, this will evaluate:
 *   - Primary power source (battery capacity)
 *   - Solar recharge capability
 *   - Power-dependent systems count
 *   - Estimated runtime without recharge
 */
export interface PowerRedundancyProfile {
  /** Whether a power system is configured */
  isConfigured: boolean;
  /** Installation status */
  installStatus: 'installed' | 'planned' | 'none';
  /** Battery capacity in Wh — from vehicle systems planning */
  batteryCapacityWh: number | null;
  /** Solar panel wattage — from vehicle systems planning */
  solarWatts: number | null;
  /** Number of power-dependent zones/systems */
  dependentSystemCount: number;
  /** Estimated hours of runtime without recharge — future scoring output */
  estimatedRuntimeHours: number | null;
  /** Redundancy score (0–100) — future scoring output */
  redundancyScore: number | null;
  /** Redundancy tier — future scoring output */
  redundancyTier: 'critical' | 'limited' | 'adequate' | 'robust' | null;
}

/**
 * Water Logistics Scoring Structure — future expansion.
 *
 * When scoring is implemented, this will evaluate:
 *   - Total water capacity
 *   - Per-person daily allocation
 *   - Days of water autonomy
 *   - Resupply proximity
 */
export interface WaterLogisticsProfile {
  /** Whether water storage is configured */
  isConfigured: boolean;
  /** Installation status */
  installStatus: 'installed' | 'planned' | 'none';
  /** Total water capacity in gallons */
  totalCapacityGal: number | null;
  /** Current water level in gallons */
  currentLevelGal: number | null;
  /** Number of people consuming water */
  peopleCount: number | null;
  /** Daily water usage per person (gallons) */
  dailyUsagePerPersonGal: number | null;
  /** Estimated days of water autonomy — future scoring output */
  estimatedAutonomyDays: number | null;
  /** Water logistics score (0–100) — future scoring output */
  logisticsScore: number | null;
  /** Water logistics tier — future scoring output */
  logisticsTier: 'critical' | 'limited' | 'adequate' | 'robust' | null;
}

/**
 * Combined tactical readiness profile — future expansion.
 *
 * Aggregates RTT, power, and water profiles into a single
 * readiness assessment. Scoring logic will be implemented in
 * a future phase.
 */
export interface TacticalReadinessProfile {
  rtt: RTTSleepSystemStatus;
  power: PowerRedundancyProfile;
  water: WaterLogisticsProfile;
  /** Overall readiness score (0–100) — future scoring output */
  overallScore: number | null;
  /** Overall readiness tier — future scoring output */
  overallTier: 'not_ready' | 'minimal' | 'prepared' | 'expedition_ready' | null;
}


/**
 * Build a tactical readiness profile STRUCTURE from the accessory framework.
 *
 * NOTE: This populates the data shape only. Scoring fields are null.
 * Scoring logic will be implemented in Phase 4.2+.
 *
 * @param framework - The vehicle's accessory framework
 * @param zones - Container zones
 * @param vehicleData - Optional vehicle data for water/power specs
 */
export function buildTacticalReadinessProfile(
  framework: AccessoryFramework | null,
  zones: ContainerZone[],
  vehicleData?: {
    waterCapacityGal?: number | null;
    currentWaterGal?: number | null;
    batteryCapacityWh?: number | null;
    solarWatts?: number | null;
    peopleCount?: number | null;
  },
): TacticalReadinessProfile {
  const rttZone = zones.find(z => RTT_KEYS.includes(z.accessoryKey));
  const powerZone = zones.find(z => POWER_RELATED_KEYS.includes(z.accessoryKey));
  const waterZone = zones.find(z => WATER_RELATED_KEYS.includes(z.accessoryKey));
  const powerDependentCount = zones.filter(z =>
    POWER_DEPENDENT_KEYS.includes(z.accessoryKey)
  ).length;

  const rtt: RTTSleepSystemStatus = {
    isConfigured: !!rttZone,
    installStatus: rttZone ? rttZone.status : 'none',
    mountZoneId: rttZone?.id || null,
    sleepCapacity: null,        // User-configurable in future
    weatherProtectionTier: null, // Scoring in future
    setupTimeMinutes: null,      // Scoring in future
  };

  const power: PowerRedundancyProfile = {
    isConfigured: !!powerZone,
    installStatus: powerZone ? powerZone.status : 'none',
    batteryCapacityWh: vehicleData?.batteryCapacityWh ?? null,
    solarWatts: vehicleData?.solarWatts ?? null,
    dependentSystemCount: powerDependentCount,
    estimatedRuntimeHours: null, // Scoring in future
    redundancyScore: null,       // Scoring in future
    redundancyTier: null,        // Scoring in future
  };

  const water: WaterLogisticsProfile = {
    isConfigured: !!waterZone,
    installStatus: waterZone ? waterZone.status : 'none',
    totalCapacityGal: vehicleData?.waterCapacityGal ?? null,
    currentLevelGal: vehicleData?.currentWaterGal ?? null,
    peopleCount: vehicleData?.peopleCount ?? null,
    dailyUsagePerPersonGal: null, // Scoring in future
    estimatedAutonomyDays: null,  // Scoring in future
    logisticsScore: null,         // Scoring in future
    logisticsTier: null,          // Scoring in future
  };

  return {
    rtt,
    power,
    water,
    overallScore: null,  // Scoring in future
    overallTier: null,   // Scoring in future
  };
}

