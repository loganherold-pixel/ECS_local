/**
 * Accessory Framework — Persistence + Container Zone Generation
 *
 * Converts AccessoryConfigStep selections into:
 *   1. AccessoryFramework — structured record of enabled/disabled accessories
 *   2. ContainerZone[]    — dynamically generated zones from enabled accessories
 *
 * The Accessory Framework is the single source of truth for container generation.
 * No separate container or loadout wizard step is required in the setup flow.
 *

 *
 * PHASE 4: Extended with system classification for:
 *   - Vehicle Systems Widget Integration (weight, water, power)
 *   - Remoteness / Bailout expansion structure
 *   - Fleet screen zone summary pills
 *
 * PHASE 5B: Extended with spatial bias metadata for:
 *   - Vertical / longitudinal / lateral load bias awareness
 *   - Center-of-gravity estimation from zone metadata
 *   - Proportional weight distribution scoring
 *
 * RULES:
 *   - Only enabled accessories generate zones
 *   - Zones are dynamically derived via generateContainerZonesFromAccessories()
 *   - No hardcoded zone lists in Loadout screens
 *   - Future-scalable: add new categories to ZONE_DEFINITIONS and they auto-propagate
 */


import type { AccessorySelections, AccessoryStatus } from '../components/vehicle-wizard/AccessoryConfigStep';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Single accessory entry in the framework.
 * Matches the Phase 2 spec:
 *   { enabled: true, status: "installed" }
 */
export interface AccessoryFrameworkEntry {
  enabled: boolean;
  status?: AccessoryStatus;
}

/**
 * The full accessory framework stored on the vehicle.
 * Keys use camelCase for the persisted data model.
 *
 * Example:
 *   {
 *     cabRack: { enabled: true, status: "installed" },
 *     rtt: { enabled: false },
 *     ...
 *   }
 */
export interface AccessoryFramework {
  cabRack: AccessoryFrameworkEntry;
  bedDrawerStorage: AccessoryFrameworkEntry;
  roofRackCrossbars: AccessoryFrameworkEntry;
  rtt: AccessoryFrameworkEntry;
  interiorStorage: AccessoryFrameworkEntry;
  recoveryMountSystem: AccessoryFrameworkEntry;
  shellSystem: AccessoryFrameworkEntry;
  truckBed: AccessoryFrameworkEntry;
  waterStorage: AccessoryFrameworkEntry;
  powerSystemBattery: AccessoryFrameworkEntry;
}

const ALL_FRAMEWORK_KEYS: (keyof AccessoryFramework)[] = [
  'cabRack',
  'bedDrawerStorage',
  'roofRackCrossbars',
  'rtt',
  'interiorStorage',
  'recoveryMountSystem',
  'shellSystem',
  'truckBed',
  'waterStorage',
  'powerSystemBattery',
];


// ═══════════════════════════════════════════════════════════════
// PHASE 5B — Spatial Bias Types
// ═══════════════════════════════════════════════════════════════

/**
 * Vertical mounting position classification.
 *   high — roof-level or above cab (RTT, cab rack, roof rack)
 *   mid  — bed-level or interior height (fridge, interior storage)
 *   low  — below bed floor or undercarriage (drawers, water tank, battery)
 */
export type VerticalBias = 'high' | 'mid' | 'low';

/**
 * Longitudinal mounting position classification.
 *   front — cab area or forward of bed (cab rack, interior storage)
 *   mid   — center of vehicle (roof rack spanning cab+bed)
 *   rear  — bed area or behind cab (RTT, bed storage, recovery mount)
 */
export type LongitudinalBias = 'front' | 'mid' | 'rear';

/**
 * Lateral mounting position classification.
 *   left   — driver side (left-hand drive) or port side
 *   right  — passenger side or starboard side
 *   center — centered on vehicle (most accessories)
 */
export type LateralBias = 'left' | 'right' | 'center';


/**
 * A container zone generated from an enabled accessory.
 *
 * PHASE 5B: Extended with spatial bias metadata for CG awareness.
 *
 * Example:
 *   {
 *     id: "cab_rack", label: "Cab Rack", accessoryKey: "cabRack",
 *     status: "installed",
 *     verticalBias: "high", longitudinalBias: "front", lateralBias: "center"
 *   }
 */
export interface ContainerZone {
  /** Unique zone identifier (snake_case, matches accessory category id) */
  id: string;
  /** Human-readable zone label */
  label: string;
  /** The camelCase key in AccessoryFramework this zone was derived from */
  accessoryKey: keyof AccessoryFramework;
  /** Installation status: installed or planned */
  status: AccessoryStatus;
  /** Icon name for display (Ionicons) */
  icon: string;
  /** Accent color for UI rendering */
  color: string;
  /** Sort order for consistent display */
  sortOrder: number;

  // ── Phase 5B: Spatial Bias Metadata ──
  /** Vertical mounting position: high (roof), mid (bed-level), low (undercarriage) */
  verticalBias: VerticalBias;
  /** Longitudinal mounting position: front (cab), mid (center), rear (bed/tail) */
  longitudinalBias: LongitudinalBias;
  /** Lateral mounting position: left, right, or center */
  lateralBias: LateralBias;
}



// ═══════════════════════════════════════════════════════════════
// MAPPING: AccessorySelections category IDs → AccessoryFramework keys
// ═══════════════════════════════════════════════════════════════

/**
 * Maps the AccessoryConfigStep category IDs (snake_case)
 * to the AccessoryFramework keys (camelCase).
 */
const CATEGORY_TO_FRAMEWORK_KEY: Record<string, keyof AccessoryFramework> = {
  cab_rack:          'cabRack',
  bed_drawer:        'bedDrawerStorage',
  roof_rack:         'roofRackCrossbars',
  rtt:               'rtt',
  interior_storage:  'interiorStorage',
  recovery_mount:    'recoveryMountSystem',
  water_storage:     'waterStorage',
  power_system:      'powerSystemBattery',
};

/**
 * Reverse mapping: framework key → category ID
 */
const FRAMEWORK_KEY_TO_CATEGORY: Partial<Record<keyof AccessoryFramework, string>> = {
  cabRack:              'cab_rack',
  bedDrawerStorage:     'bed_drawer',
  roofRackCrossbars:    'roof_rack',
  rtt:                  'rtt',
  interiorStorage:      'interior_storage',
  recoveryMountSystem:  'recovery_mount',
  waterStorage:         'water_storage',
  powerSystemBattery:   'power_system',
};



// ═══════════════════════════════════════════════════════════════
// SYSTEM CATEGORIES — Phase 4 classification for systems integration
// ═══════════════════════════════════════════════════════════════

/**
 * System category classification for each accessory.
 * Used by vehicleSystemsIntegration.ts to group zones by system type.
 */
export type AccessorySystemCategory =
  | 'storage'    // General storage (cab rack, bed, interior, drawers)
  | 'shelter'    // Sleep/shelter systems (RTT)
  | 'power'      // Power generation/storage (battery, solar)
  | 'water'      // Water storage/filtration
  | 'thermal'    // Temperature control (fridge)
  | 'recovery'   // Recovery equipment
  | 'mounting';  // Mounting systems (roof rack, crossbars)

/**
 * Maps each AccessoryFramework key to its system category.
 * Used by vehicleSystemsIntegration.ts for system-level queries.
 */
export const ACCESSORY_SYSTEM_CATEGORIES: Record<keyof AccessoryFramework, AccessorySystemCategory> = {
  cabRack:              'storage',
  bedDrawerStorage:     'storage',
  roofRackCrossbars:    'mounting',
  rtt:                  'shelter',
  interiorStorage:      'storage',
  recoveryMountSystem:  'recovery',
  shellSystem:          'storage',
  truckBed:             'storage',
  waterStorage:         'water',
  powerSystemBattery:   'power',
};

/**
 * Get all enabled accessories for a given system category.
 */
export function getAccessoriesBySystem(
  framework: AccessoryFramework,
  category: AccessorySystemCategory,
): { key: keyof AccessoryFramework; entry: AccessoryFrameworkEntry }[] {
  const results: { key: keyof AccessoryFramework; entry: AccessoryFrameworkEntry }[] = [];
  for (const [key, cat] of Object.entries(ACCESSORY_SYSTEM_CATEGORIES)) {
    if (cat === category) {
      const entry = framework[key as keyof AccessoryFramework];
      if (entry && entry.enabled) {
        results.push({ key: key as keyof AccessoryFramework, entry });
      }
    }
  }
  return results;
}

/**
 * Get a count of enabled accessories per system category.
 */
export function getSystemCategoryCounts(
  framework: AccessoryFramework,
): Record<AccessorySystemCategory, number> {
  const counts: Record<AccessorySystemCategory, number> = {
    storage: 0,
    shelter: 0,
    power: 0,
    water: 0,
    thermal: 0,
    recovery: 0,
    mounting: 0,
  };
  for (const [key, cat] of Object.entries(ACCESSORY_SYSTEM_CATEGORIES)) {
    const entry = framework[key as keyof AccessoryFramework];
    if (entry && entry.enabled) {
      counts[cat]++;
    }
  }
  return counts;
}


// ═══════════════════════════════════════════════════════════════
// ZONE DEFINITIONS — used to generate ContainerZone[] from framework
// ═══════════════════════════════════════════════════════════════

interface ZoneDefinition {
  /** The AccessoryFramework key this zone maps to */
  frameworkKey: keyof AccessoryFramework;
  /** Zone ID (snake_case, used as unique identifier) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Ionicons icon name */
  icon: string;
  /** Accent color */
  color: string;
  /** Sort order */
  sortOrder: number;
  /** System category for Phase 4 integration */
  systemCategory: AccessorySystemCategory;

  // ── Phase 5B: Default spatial bias for this zone type ──
  /** Default vertical mounting position */
  verticalBias: VerticalBias;
  /** Default longitudinal mounting position */
  longitudinalBias: LongitudinalBias;
  /** Default lateral mounting position */
  lateralBias: LateralBias;
}

/**
 * Zone definitions — one per accessory category.
 * Add new entries here to auto-propagate new zones.
 *
 * Phase 4: Added systemCategory for vehicle systems integration.
 * Phase 5B: Added verticalBias, longitudinalBias, lateralBias for CG awareness.
 *
 * Default bias assignments:
 *   Cab Rack           → high / front / center   (mounted above cab)
 *   Cab Rack Acc       → high / front / center   (attached to cab rack)
 *   Roof Rack          → high / mid / center     (spans cab-to-bed)
 *   RTT                → high / rear / center     (mounted on bed rack)
 *   Bed / Drawer       → low / rear / center      (below bed floor)
 *   Interior Storage   → mid / front / center     (cab interior)
 *   Fridge / Slide     → mid / rear / center      (bed-level, rear of vehicle)
 *   Recovery Mount     → low / rear / center       (hitch/bumper area)
 *   Water Storage      → low / rear / center       (underbody or bed floor)
 *   Power System       → low / rear / center       (underbody or bed floor)
 */
const ZONE_DEFINITIONS: ZoneDefinition[] = [
  { frameworkKey: 'cabRack',             id: 'cab_rack',         label: 'Cab Rack',                          icon: 'barbell-outline',           color: '#FF6B6B', sortOrder: 0, systemCategory: 'storage',  verticalBias: 'high', longitudinalBias: 'front', lateralBias: 'center' },
  { frameworkKey: 'roofRackCrossbars',   id: 'roof_rack',        label: 'Roof Rack / Crossbars',             icon: 'resize-outline',            color: '#4FC3F7', sortOrder: 1, systemCategory: 'mounting', verticalBias: 'high', longitudinalBias: 'mid',   lateralBias: 'center' },
  { frameworkKey: 'rtt',                 id: 'rtt',              label: 'Roof Top Tent',                     icon: 'trail-sign-outline',        color: '#C77DFF', sortOrder: 2, systemCategory: 'shelter',  verticalBias: 'high', longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'bedDrawerStorage',    id: 'bed_drawer',       label: 'Drawer Storage',                    icon: 'server-outline',            color: '#96CEB4', sortOrder: 3, systemCategory: 'storage',  verticalBias: 'low',  longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'interiorStorage',     id: 'interior_storage', label: 'Interior Storage',                  icon: 'file-tray-stacked-outline', color: '#4ECDC4', sortOrder: 4, systemCategory: 'storage',  verticalBias: 'mid',  longitudinalBias: 'front', lateralBias: 'center' },
  { frameworkKey: 'recoveryMountSystem', id: 'recovery_mount',   label: 'Recovery Mount Hitch System',       icon: 'construct-outline',         color: '#AB47BC', sortOrder: 5, systemCategory: 'recovery', verticalBias: 'low',  longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'shellSystem',         id: 'shell_system',     label: 'SmartCap / AluCab / Other Shell',  icon: 'archive-outline',           color: '#7E8CE0', sortOrder: 6, systemCategory: 'storage',  verticalBias: 'mid',  longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'truckBed',            id: 'truck_bed',        label: 'Truck Bed',                         icon: 'layers-outline',            color: '#6B8F71', sortOrder: 7, systemCategory: 'storage',  verticalBias: 'low',  longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'waterStorage',        id: 'water_storage',    label: 'Water Storage',                     icon: 'water-outline',             color: '#26A69A', sortOrder: 8, systemCategory: 'water',    verticalBias: 'low',  longitudinalBias: 'rear',  lateralBias: 'center' },
  { frameworkKey: 'powerSystemBattery',  id: 'power_system',     label: 'Power System / Battery',            icon: 'flash-outline',             color: '#FFB74D', sortOrder: 9, systemCategory: 'power',    verticalBias: 'low',  longitudinalBias: 'rear',  lateralBias: 'center' },
];

/** Exported for use by vehicleSystemsIntegration.ts and other modules */
export { ZONE_DEFINITIONS };

/**
 * Default bias lookup by zone ID — Phase 5B.
 *
 * Used to backfill bias metadata on persisted ContainerZone objects
 * that were created before Phase 5B (they won't have bias fields).
 */
export const DEFAULT_ZONE_BIASES: Record<string, {
  verticalBias: VerticalBias;
  longitudinalBias: LongitudinalBias;
  lateralBias: LateralBias;
}> = {};
for (const def of ZONE_DEFINITIONS) {
  DEFAULT_ZONE_BIASES[def.id] = {
    verticalBias: def.verticalBias,
    longitudinalBias: def.longitudinalBias,
    lateralBias: def.lateralBias,
  };
}

/**
 * Resolve the spatial bias for a container zone.
 *
 * Handles backward compatibility: if a persisted zone doesn't have
 * bias fields (pre-Phase 5B), looks up defaults from ZONE_DEFINITIONS.
 * Falls back to mid/mid/center if zone is unknown.
 *
 * @param zone - A container zone (may or may not have bias fields)
 * @returns { verticalBias, longitudinalBias, lateralBias }
 */
export function resolveZoneBias(zone: ContainerZone | { id: string; verticalBias?: VerticalBias; longitudinalBias?: LongitudinalBias; lateralBias?: LateralBias }): {
  verticalBias: VerticalBias;
  longitudinalBias: LongitudinalBias;
  lateralBias: LateralBias;
} {
  // If zone already has bias metadata, use it
  if (zone.verticalBias && zone.longitudinalBias) {
    return {
      verticalBias: zone.verticalBias,
      longitudinalBias: zone.longitudinalBias,
      lateralBias: zone.lateralBias || 'center',
    };
  }

  // Look up defaults by zone ID
  const defaults = DEFAULT_ZONE_BIASES[zone.id];
  if (defaults) return { ...defaults };

  // Ultimate fallback
  return { verticalBias: 'mid', longitudinalBias: 'mid', lateralBias: 'center' };
}

const SUPPORTED_ZONE_IDS = new Set(ZONE_DEFINITIONS.map((definition) => definition.id));

function createEmptyAccessoryFramework(): AccessoryFramework {
  return Object.fromEntries(
    ALL_FRAMEWORK_KEYS.map((frameworkKey) => [frameworkKey, { enabled: false }]),
  ) as unknown as AccessoryFramework;
}

export function normalizeAccessoryFramework(
  raw: Record<string, AccessoryFrameworkEntry> | AccessoryFramework | null | undefined,
): AccessoryFramework | null {
  if (!raw || typeof raw !== 'object') return null;

  const normalized = createEmptyAccessoryFramework();
  for (const frameworkKey of ALL_FRAMEWORK_KEYS) {
    const entry = raw[frameworkKey];
    if (!entry || typeof entry !== 'object') continue;
    normalized[frameworkKey] = {
      enabled: Boolean(entry.enabled),
      status: entry.enabled ? (entry.status === 'planned' ? 'planned' : 'installed') : undefined,
    };
  }

  return normalized;
}

export function sanitizeContainerZones(rawZones: unknown): ContainerZone[] {
  if (!Array.isArray(rawZones)) return [];

  return rawZones
    .filter(
      (zone): zone is Partial<ContainerZone> & { id: string; label: string } =>
        Boolean(zone) &&
        typeof zone === 'object' &&
        typeof (zone as ContainerZone).id === 'string' &&
        typeof (zone as ContainerZone).label === 'string' &&
        SUPPORTED_ZONE_IDS.has((zone as ContainerZone).id),
    )
    .map((zone) => {
      const definition = ZONE_DEFINITIONS.find((candidate) => candidate.id === zone.id);
      const bias = resolveZoneBias(zone as ContainerZone);
      return {
        id: zone.id,
        label: definition?.label || zone.label,
        accessoryKey: definition?.frameworkKey || (zone.accessoryKey as keyof AccessoryFramework),
        status: (zone.status === 'planned' ? 'planned' : 'installed') as AccessoryStatus,
        icon: typeof zone.icon === 'string' ? zone.icon : definition?.icon || 'cube-outline',
        color: typeof zone.color === 'string' ? zone.color : definition?.color || '#8A8A85',
        sortOrder: typeof zone.sortOrder === 'number' ? zone.sortOrder : definition?.sortOrder || 0,
        ...bias,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

const LOADOUT_FRAMEWORK_BASE_WEIGHTS_LBS: Record<string, number> = {
  cab_rack: 85,
  bed_drawer: 180,
  roof_rack: 75,
  shell_system: 213,
};

const SHELL_TRUCK_BED_VALUES = new Set(['rsi_smart_cap', 'alu_cab', 'other_topper']);
const TRUCK_BED_VALUES = new Set([
  'open_bed',
  'cover',
  'rack',
  'rsi_smart_cap',
  'alu_cab',
  'other_topper',
]);

function readWizardConfig(wizardConfig: unknown): Record<string, any> | null {
  return wizardConfig && typeof wizardConfig === 'object'
    ? (wizardConfig as Record<string, any>)
    : null;
}

function inferTruckBedSelection(
  wizardConfig: Record<string, any> | null,
  vehicleType: unknown,
): string | null {
  const directSelection =
    typeof wizardConfig?.truck_bed === 'string'
      ? wizardConfig.truck_bed.trim().toLowerCase()
      : null;
  if (directSelection) return directSelection;

  if (typeof vehicleType === 'string') {
    const normalizedType = vehicleType.trim().toLowerCase();
    if (normalizedType.includes('truck') || normalizedType.includes('pickup')) {
      return 'open_bed';
    }
  }

  return null;
}

function applyVehicleLoadoutInferences(
  framework: AccessoryFramework,
  wizardConfig: Record<string, any> | null,
  vehicleType?: unknown,
): AccessoryFramework {
  const truckBedSelection = inferTruckBedSelection(wizardConfig, vehicleType);
  if (truckBedSelection && TRUCK_BED_VALUES.has(truckBedSelection)) {
    framework.truckBed = { enabled: true, status: 'installed' };
  }

  if (truckBedSelection && SHELL_TRUCK_BED_VALUES.has(truckBedSelection)) {
    framework.shellSystem = { enabled: true, status: 'installed' };
  }

  return framework;
}

export function resolveVehicleAccessoryFramework(vehicleLike: any): AccessoryFramework | null {
  const wizardConfig = readWizardConfig(vehicleLike?.wizard_config);
  const rawFramework =
    vehicleLike?.accessoryFramework && typeof vehicleLike.accessoryFramework === 'object'
      ? normalizeAccessoryFramework(vehicleLike.accessoryFramework as AccessoryFramework)
      : null;

  const framework = rawFramework || createEmptyAccessoryFramework();
  applyVehicleLoadoutInferences(
    framework,
    wizardConfig,
    vehicleLike?.vehicle_type ?? wizardConfig?.vehicle_type,
  );

  const hasEnabledZone = ALL_FRAMEWORK_KEYS.some((frameworkKey) => framework[frameworkKey]?.enabled);
  return hasEnabledZone ? framework : null;
}

export function resolveVehicleContainerZones(vehicleLike: any): ContainerZone[] {
  const rawZones = Array.isArray(vehicleLike?.containerZones)
    ? vehicleLike.containerZones
    : Array.isArray(vehicleLike?.zones)
      ? vehicleLike.zones
      : [];

  const sanitizedZones = sanitizeContainerZones(rawZones);
  const framework = resolveVehicleAccessoryFramework(vehicleLike);
  const generatedZones = framework ? generateContainerZonesFromAccessories(framework) : [];

  if (sanitizedZones.length === 0) return generatedZones;
  if (generatedZones.length === 0) return sanitizedZones;

  const merged = new Map<string, ContainerZone>();
  for (const zone of sanitizedZones) merged.set(zone.id, zone);
  for (const zone of generatedZones) {
    if (!merged.has(zone.id)) {
      merged.set(zone.id, zone);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getContainerFrameworkWeightLbs(zoneId: string): number {
  return LOADOUT_FRAMEWORK_BASE_WEIGHTS_LBS[zoneId] ?? 0;
}





// ═══════════════════════════════════════════════════════════════
// CONVERSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Convert AccessorySelections (from AccessoryConfigStep UI)
 * into the structured AccessoryFramework for persistence.
 *
 * @param selections - The raw accessory selections from the UI
 * @returns AccessoryFramework ready for storage on the vehicle
 */
export function buildAccessoryFramework(
  selections: AccessorySelections
): AccessoryFramework {
  const framework = createEmptyAccessoryFramework();

  for (const [categoryId, frameworkKey] of Object.entries(CATEGORY_TO_FRAMEWORK_KEY)) {
    const sel = selections[categoryId];
    if (sel) {
      framework[frameworkKey] = {
        enabled: sel.enabled,
        status: sel.enabled ? sel.status : undefined,
      };
    } else {
      framework[frameworkKey] = { enabled: false };
    }
  }

  return framework;
}

/**
 * Convert an AccessoryFramework back into AccessorySelections
 * (for re-hydrating the UI when editing an existing vehicle).
 *
 * @param framework - The persisted accessory framework
 * @returns AccessorySelections for the AccessoryConfigStep component
 */
export function frameworkToSelections(
  framework: AccessoryFramework | null | undefined
): AccessorySelections {
  const selections: AccessorySelections = {};

  if (!framework) {
    // Return all disabled
    for (const categoryId of Object.keys(CATEGORY_TO_FRAMEWORK_KEY)) {
      selections[categoryId] = { enabled: false, status: 'installed' };
    }
    return selections;
  }

  for (const [frameworkKey, categoryId] of Object.entries(FRAMEWORK_KEY_TO_CATEGORY)) {
    if (!categoryId) continue;
    const entry = framework[frameworkKey as keyof AccessoryFramework];
    if (entry) {
      selections[categoryId] = {
        enabled: entry.enabled,
        status: entry.status || 'installed',
      };
    } else {
      selections[categoryId] = { enabled: false, status: 'installed' };
    }
  }

  return selections;
}


// ═══════════════════════════════════════════════════════════════
// CORE UTILITY: generateContainerZonesFromAccessories()
// ═══════════════════════════════════════════════════════════════

/**
 * Generate container zones from an AccessoryFramework.
 *
 * RULES:
 *   - Only enabled accessories generate zones
 *   - Zones are dynamically derived from ZONE_DEFINITIONS
 *   - No hardcoded zone lists — add to ZONE_DEFINITIONS to extend
 *   - Phase 5B: Includes spatial bias metadata on every zone
 *
 * @param framework - The structured accessory framework
 * @returns ContainerZone[] — ordered array of active container zones with bias metadata
 */
export function generateContainerZonesFromAccessories(
  framework: AccessoryFramework
): ContainerZone[] {
  const zones: ContainerZone[] = [];

  for (const def of ZONE_DEFINITIONS) {
    const entry = framework[def.frameworkKey];
    if (entry && entry.enabled) {
      zones.push({
        id: def.id,
        label: def.label,
        accessoryKey: def.frameworkKey,
        status: entry.status || 'installed',
        icon: def.icon,
        color: def.color,
        sortOrder: def.sortOrder,
        // Phase 5B: Spatial bias metadata from zone definitions
        verticalBias: def.verticalBias,
        longitudinalBias: def.longitudinalBias,
        lateralBias: def.lateralBias,
      });
    }
  }

  // Sort by sortOrder for consistent display
  zones.sort((a, b) => a.sortOrder - b.sortOrder);

  return zones;
}


/**
 * Convenience overload: generate container zones directly from
 * AccessorySelections (UI state) without intermediate framework.
 *
 * @param selections - Raw accessory selections from the UI
 * @returns ContainerZone[] — ordered array of active container zones
 */
export function generateContainerZonesFromSelections(
  selections: AccessorySelections
): ContainerZone[] {
  const framework = buildAccessoryFramework(selections);
  return generateContainerZonesFromAccessories(framework);
}


// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the count of enabled accessories in a framework.
 */
export function getEnabledAccessoryCount(framework: AccessoryFramework): number {
  return Object.values(framework).filter(e => e.enabled).length;
}

/**
 * Get the count of installed (vs planned) accessories.
 */
export function getInstalledAccessoryCount(framework: AccessoryFramework): number {
  return Object.values(framework).filter(e => e.enabled && e.status === 'installed').length;
}

/**
 * Get the count of planned accessories.
 */
export function getPlannedAccessoryCount(framework: AccessoryFramework): number {
  return Object.values(framework).filter(e => e.enabled && e.status === 'planned').length;
}

/**
 * Check if a specific accessory is enabled in the framework.
 */
export function isAccessoryEnabled(
  framework: AccessoryFramework,
  key: keyof AccessoryFramework
): boolean {
  return framework[key]?.enabled ?? false;
}

/**
 * Get a human-readable summary of the accessory framework.
 * Returns an array of { label, status } for enabled accessories.
 */
export function getAccessoryFrameworkSummary(
  framework: AccessoryFramework
): { label: string; status: AccessoryStatus; color: string }[] {
  const summary: { label: string; status: AccessoryStatus; color: string }[] = [];

  for (const def of ZONE_DEFINITIONS) {
    const entry = framework[def.frameworkKey];
    if (entry && entry.enabled) {
      summary.push({
        label: def.label,
        status: entry.status || 'installed',
        color: def.color,
      });
    }
  }

  return summary;
}

