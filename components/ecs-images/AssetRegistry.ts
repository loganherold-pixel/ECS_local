/**
 * ECS Image Asset Registry
 * ─────────────────────────────────────────────────────────
 * Central registry mapping vehicle types and accessory module
 * types to their image sources.
 *
 * All images share a 1024×1024 stacking grid:
 *   - Transparent backgrounds on accessories
 *   - Same baseline and wheel alignment
 *   - Modules overlay with per-vehicle anchor offsets
 *
 * STACKING ORDER (bottom to top):
 *   1. Base vehicle image
 *   2. Bed module (truck only)
 *   3. Roof rack (if selected, or auto-required by storage/tent)
 *   4. Roof storage OR roof tent (if selected)
 *   5. Hitch module (if selected)
 *
 * ANCHOR MAP:
 *   Each vehicle type defines anchor offsets (in 1024-space)
 *   for roof, bed, and hitch accessory groups. Accessories
 *   are pre-drawn for the truck baseline. Other vehicles
 *   apply delta offsets to snap accessories to their geometry.
 *
 * FINE-TUNED OFFSETS (v2):
 *   Derived from SVG vehicle geometry reference points:
 *     Truck:     roofY=451, roofCenterX=444, hitchX=866, hitchY=730
 *     SUV:       roofY=453, roofCenterX=570, hitchX=852, hitchY=730
 *     Jeep:      roofY=458, roofCenterX=555, hitchX=845, hitchY=728
 *     Crossover: roofY=465, roofCenterX=548, hitchX=840, hitchY=733
 */

// ── Image Vehicle Types ─────────────────────────────────
export type ImageVehicleType = 'truck' | 'suv' | 'jeep' | 'crossover';

// ── Image Module Types ──────────────────────────────────
export type ImageRoofModule = 'none' | 'rack' | 'storage' | 'tent';
export type ImageHitchModule = 'none' | 'tire' | 'box';
export type ImageBedModule = 'none' | 'rack' | 'shell';

// ── Config State Model ──────────────────────────────────
export interface ImageVehicleConfig {
  vehicleType: ImageVehicleType;
  roofModule: ImageRoofModule;
  hitchModule: ImageHitchModule;
  bedModule: ImageBedModule;
}

// ── Default config ──────────────────────────────────────
export const DEFAULT_IMAGE_CONFIG: ImageVehicleConfig = {
  vehicleType: 'truck',
  roofModule: 'none',
  hitchModule: 'none',
  bedModule: 'none',
};

// ── Base Vehicle Image Registry ─────────────────────────
// These are the bottom-most rendering layer in the stack.
export const BASE_VEHICLE_IMAGES: Record<ImageVehicleType, { uri: string }> = {
  truck: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708180978_3cf7919f.png',
  },
  suv: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708181812_ef9d20dc.png',
  },
  jeep: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708182614_13aef89c.png',
  },
  crossover: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708183232_b8077ba7.png',
  },
};

// ── Accessory Module Image Registry ─────────────────────
// All accessories use transparent backgrounds and align
// to the same 1024×1024 grid as base vehicles.

export const ROOF_MODULE_IMAGES: Record<Exclude<ImageRoofModule, 'none'>, { uri: string }> = {
  rack: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709414573_7a3660a1.png',
  },
  storage: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709414117_56f12520.png',
  },
  tent: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709413655_d66c97d6.png',
  },
};

export const HITCH_MODULE_IMAGES: Record<Exclude<ImageHitchModule, 'none'>, { uri: string }> = {
  tire: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709415030_6d485c57.png',
  },
  box: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709412625_ae152616.png',
  },
};

export const BED_MODULE_IMAGES: Record<Exclude<ImageBedModule, 'none'>, { uri: string }> = {
  rack: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709413125_8e35f8d2.png',
  },
  shell: {
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771709411486_290e9774.png',
  },
};

// ── Display Names ───────────────────────────────────────
export const VEHICLE_DISPLAY_NAMES: Record<ImageVehicleType, string> = {
  truck: 'Truck',
  suv: 'SUV',
  jeep: 'Jeep / 4x4',
  crossover: 'Crossover',
};

export const ROOF_MODULE_NAMES: Record<ImageRoofModule, string> = {
  none: 'None',
  rack: 'Roof Rack',
  storage: 'Roof Storage',
  tent: 'Roof Tent',
};

export const HITCH_MODULE_NAMES: Record<ImageHitchModule, string> = {
  none: 'None',
  tire: 'Tire Carrier',
  box: 'Hitch Box',
};

export const BED_MODULE_NAMES: Record<ImageBedModule, string> = {
  none: 'Open',
  rack: 'Bed Rack',
  shell: 'Bed Shell',
};

// ════════════════════════════════════════════════════════
// ANCHOR MAP SYSTEM (v3 — Calibrated)
// ════════════════════════════════════════════════════════
//
// Each vehicle type defines anchor offsets for accessory
// groups. Offsets are in 1024-space (viewBox coordinates).
//
// Accessories are pre-drawn at positions matching the
// truck baseline. Other vehicles apply delta offsets to
// snap accessories to their specific geometry.
//
// Positive X = shift right, Positive Y = shift down.
//
// ── SVG Reference Geometry ──────────────────────────────
//   Truck:     roofY=451, roofCenterX=444, hitchX=866, hitchY=730, bedX=650
//   SUV:       roofY=453, roofCenterX=570, hitchX=852, hitchY=730
//   Jeep:      roofY=458, roofCenterX=555, hitchX=845, hitchY=728
//   Crossover: roofY=465, roofCenterX=548, hitchX=840, hitchY=733
//
// ── Delta Calculations (from truck baseline) ────────────
//   SUV:       roof(+126, +2)   hitch(-14, 0)
//   Jeep:      roof(+111, +7)   hitch(-21, -2)
//   Crossover: roof(+104, +14)  hitch(-26, +3)
//
// ── Fine-Tuning Notes (v3) ──────────────────────────────
//   - Tent sits higher than storage → slight negative Y
//   - Hitch box hangs lower than tire → slight positive Y
//   - Calibrated using debug overlay crosshairs
//   - All 5 validation cases tested and aligned
// ════════════════════════════════════════════════════════

export interface AnchorOffset {
  x: number; // horizontal offset in 1024-space
  y: number; // vertical offset in 1024-space
}

export interface VehicleAnchorMap {
  /** Offset for roof rack specifically */
  roofRack: AnchorOffset;
  /** Offset for roof storage (on top of rack) */
  roofStorage: AnchorOffset;
  /** Offset for roof tent (on top of rack) */
  roofTent: AnchorOffset;
  /** Offset for bed accessories (rack, shell) — truck only */
  bed: AnchorOffset;
  /** Offset for hitch tire carrier */
  hitchTire: AnchorOffset;
  /** Offset for hitch box */
  hitchBox: AnchorOffset;
}

/**
 * Per-vehicle anchor maps with per-accessory fine-tuning.
 *
 * Truck is the baseline (0,0 offsets) since all accessory
 * images are pre-drawn to align with the truck geometry.
 *
 * Other vehicles define delta offsets derived from SVG
 * reference geometry, then fine-tuned per accessory type.
 *
 * CALIBRATION PROCESS:
 *   1. Enable debug overlay in BuildPreview (bug icon)
 *   2. Cycle through validation tests (flask icon)
 *   3. Observe crosshair positions vs accessory placement
 *   4. Adjust offsets in ±5px increments until aligned
 *   5. Lock values after all 5 tests pass
 */
export const VEHICLE_ANCHOR_MAPS: Record<ImageVehicleType, VehicleAnchorMap> = {
  // ── Truck (baseline — all accessories designed for this) ──
  // All offsets are (0,0) since accessories are pre-aligned to truck geometry
  truck: {
    roofRack:    { x: 0, y: 0 },
    roofStorage: { x: 0, y: 0 },
    roofTent:    { x: 0, y: 0 },
    bed:         { x: 0, y: 0 },
    hitchTire:   { x: 0, y: 0 },
    hitchBox:    { x: 0, y: 0 },
  },

  // ── SUV ──
  // Roof center shifted +126px right from truck cab
  // Hitch shifted -14px left (shorter rear overhang)
  // No bed (bed accessories disabled for SUV)
  suv: {
    roofRack:    { x: 126, y: 2 },
    roofStorage: { x: 126, y: 4 },    // storage slightly lower on SUV roof
    roofTent:    { x: 126, y: -2 },   // tent sits higher (negative Y = up)
    bed:         { x: 0, y: 0 },       // unused — bed disabled for non-truck
    hitchTire:   { x: -14, y: 4 },    // tire carrier snaps to SUV hitch
    hitchBox:    { x: -14, y: 8 },    // box hangs lower than tire
  },

  // ── Jeep ──
  // Shorter wheelbase, roof shifted +111px right, +7px down
  // Hitch shifted -21px left (compact rear)
  // Higher bumper → hitch accessories shifted up
  jeep: {
    roofRack:    { x: 111, y: 7 },
    roofStorage: { x: 111, y: 9 },    // storage slightly lower
    roofTent:    { x: 111, y: 3 },    // tent sits higher
    bed:         { x: 0, y: 0 },       // unused
    hitchTire:   { x: -21, y: -4 },   // higher bumper → shift up
    hitchBox:    { x: -21, y: 0 },    // box at bumper level
  },

  // ── Crossover ──
  // Lower roofline, roof shifted +104px right, +14px down
  // Hitch shifted -26px left (shortest overhang)
  // Lower bumper → hitch accessories shifted down
  crossover: {
    roofRack:    { x: 104, y: 14 },
    roofStorage: { x: 104, y: 16 },   // storage slightly lower
    roofTent:    { x: 104, y: 10 },   // tent sits higher
    bed:         { x: 0, y: 0 },       // unused
    hitchTire:   { x: -26, y: 6 },    // lower bumper → shift down
    hitchBox:    { x: -26, y: 10 },   // box hangs lower
  },
};



// ── Anchor key mapping ──────────────────────────────────
// Maps a layer key to the specific anchor field in VehicleAnchorMap.
type AnchorKey = keyof VehicleAnchorMap;

function getAnchorKey(layerKey: string): AnchorKey | null {
  switch (layerKey) {
    case 'roof-rack':    return 'roofRack';
    case 'roof-storage': return 'roofStorage';
    case 'roof-tent':    return 'roofTent';
    case 'bed-rack':     return 'bed';
    case 'bed-shell':    return 'bed';
    case 'hitch-tire':   return 'hitchTire';
    case 'hitch-box':    return 'hitchBox';
    default:             return null;
  }
}

/**
 * Get the anchor offset for a specific accessory layer on a vehicle.
 * Returns {x: 0, y: 0} if no specific offset is defined.
 */
export function getAnchorOffset(
  vehicleType: ImageVehicleType,
  layerKey: string,
): AnchorOffset {
  const map = VEHICLE_ANCHOR_MAPS[vehicleType];
  if (!map) return { x: 0, y: 0 };
  const anchorKey = getAnchorKey(layerKey);
  if (!anchorKey) return { x: 0, y: 0 };
  return map[anchorKey] ?? { x: 0, y: 0 };
}

// ── Debug Anchor Points ─────────────────────────────────
// Export anchor point data for the debug crosshair overlay.
// Each point represents where an accessory category snaps
// on a given vehicle, shown as crosshairs in debug mode.

export interface DebugAnchorPoint {
  label: string;
  category: string;
  offset: AnchorOffset;
  color: string;
}

/**
 * Get all debug anchor points for a vehicle type.
 * Used by the ImageCompositor debug overlay to render crosshairs.
 */
export function getDebugAnchorPoints(vehicleType: ImageVehicleType): DebugAnchorPoint[] {
  const map = VEHICLE_ANCHOR_MAPS[vehicleType];
  if (!map) return [];

  const points: DebugAnchorPoint[] = [
    { label: 'Roof Rack',    category: 'roof',  offset: map.roofRack,    color: '#FF6B6B' },
    { label: 'Roof Storage', category: 'roof',  offset: map.roofStorage, color: '#FF9F43' },
    { label: 'Roof Tent',    category: 'roof',  offset: map.roofTent,    color: '#EE5A24' },
    { label: 'Hitch Tire',   category: 'hitch', offset: map.hitchTire,   color: '#4FC3F7' },
    { label: 'Hitch Box',    category: 'hitch', offset: map.hitchBox,    color: '#00D2D3' },
  ];

  // Only show bed anchors for truck
  if (vehicleType === 'truck') {
    points.push(
      { label: 'Bed', category: 'bed', offset: map.bed, color: '#A29BFE' },
    );
  }

  return points;
}

// ── Layer Resolution ────────────────────────────────────
// Given a config, return the ordered list of image layers
// to render (bottom to top).

export interface ImageLayer {
  key: string;
  source: { uri: string };
  /** Whether this is a base vehicle (no tint, no offset) or accessory */
  isBase: boolean;
  label: string;
  /** Anchor offset in 1024-space for this layer (base layers have {0,0}) */
  anchorOffset: AnchorOffset;
}

/**
 * Resolve the ordered image layers for a given vehicle config.
 *
 * MODULE LOGIC RULES:
 * - If vehicleType != 'truck': bed module is ignored
 * - If roof_storage is selected: roof_rack is auto-required beneath it
 * - If roof_tent is selected: roof_rack is auto-required beneath it
 * - roof_storage and roof_tent are mutually exclusive
 * - hitch_tire and hitch_box are mutually exclusive
 * - bed_rack and bed_shell are mutually exclusive
 * - Stacking order is always: base → bed → rack → storage/tent → hitch
 *
 * Each accessory layer includes its per-vehicle, per-accessory anchor offset.
 */
export function resolveImageLayers(config: ImageVehicleConfig): ImageLayer[] {
  const layers: ImageLayer[] = [];
  const noOffset: AnchorOffset = { x: 0, y: 0 };

  // 1. Base vehicle (always present, no offset)
  const baseSource = BASE_VEHICLE_IMAGES[config.vehicleType];
  if (baseSource) {
    layers.push({
      key: `base-${config.vehicleType}`,
      source: baseSource,
      isBase: true,
      label: VEHICLE_DISPLAY_NAMES[config.vehicleType],
      anchorOffset: noOffset,
    });
  }

  // 2. Bed module (truck only)
  if (config.vehicleType === 'truck' && config.bedModule !== 'none') {
    const bedKey = `bed-${config.bedModule}`;
    const bedSource = BED_MODULE_IMAGES[config.bedModule];
    if (bedSource) {
      layers.push({
        key: bedKey,
        source: bedSource,
        isBase: false,
        label: BED_MODULE_NAMES[config.bedModule],
        anchorOffset: getAnchorOffset(config.vehicleType, bedKey),
      });
    }
  }

  // 3. Roof rack (explicit or auto-required by storage/tent)
  const needsRack =
    config.roofModule === 'rack' ||
    config.roofModule === 'storage' ||
    config.roofModule === 'tent';

  if (needsRack) {
    layers.push({
      key: 'roof-rack',
      source: ROOF_MODULE_IMAGES.rack,
      isBase: false,
      label: ROOF_MODULE_NAMES.rack,
      anchorOffset: getAnchorOffset(config.vehicleType, 'roof-rack'),
    });
  }

  // 4. Roof storage OR roof tent (on top of rack, mutually exclusive)
  if (config.roofModule === 'storage') {
    layers.push({
      key: 'roof-storage',
      source: ROOF_MODULE_IMAGES.storage,
      isBase: false,
      label: ROOF_MODULE_NAMES.storage,
      anchorOffset: getAnchorOffset(config.vehicleType, 'roof-storage'),
    });
  } else if (config.roofModule === 'tent') {
    layers.push({
      key: 'roof-tent',
      source: ROOF_MODULE_IMAGES.tent,
      isBase: false,
      label: ROOF_MODULE_NAMES.tent,
      anchorOffset: getAnchorOffset(config.vehicleType, 'roof-tent'),
    });
  }

  // 5. Hitch module (mutually exclusive: tire OR box)
  if (config.hitchModule !== 'none') {
    const hitchKey = `hitch-${config.hitchModule}`;
    const hitchSource = HITCH_MODULE_IMAGES[config.hitchModule];
    if (hitchSource) {
      layers.push({
        key: hitchKey,
        source: hitchSource,
        isBase: false,
        label: HITCH_MODULE_NAMES[config.hitchModule],
        anchorOffset: getAnchorOffset(config.vehicleType, hitchKey),
      });
    }
  }

  return layers;
}

// ── Truck check helper ──────────────────────────────────
export function isTruckType(vehicleType: ImageVehicleType): boolean {
  return vehicleType === 'truck';
}

// ── Random config generator (for demo) ──────────────────
const ALL_VEHICLE_TYPES: ImageVehicleType[] = ['truck', 'suv', 'jeep', 'crossover'];
const ALL_ROOF_MODULES: ImageRoofModule[] = ['none', 'rack', 'storage', 'tent'];
const ALL_HITCH_MODULES: ImageHitchModule[] = ['none', 'tire', 'box'];
const ALL_BED_MODULES: ImageBedModule[] = ['none', 'rack', 'shell'];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomImageConfig(): ImageVehicleConfig {
  const vehicleType = randomPick(ALL_VEHICLE_TYPES);
  return {
    vehicleType,
    roofModule: randomPick(ALL_ROOF_MODULES),
    hitchModule: randomPick(ALL_HITCH_MODULES),
    bedModule: vehicleType === 'truck' ? randomPick(ALL_BED_MODULES) : 'none',
  };
}

// ── Validation Test Configs ─────────────────────────────
// Pre-defined configs for the 5 required validation cases.
export const VALIDATION_CONFIGS: { label: string; config: ImageVehicleConfig }[] = [
  {
    label: 'Truck + rack + tent + tire',
    config: { vehicleType: 'truck', roofModule: 'tent', hitchModule: 'tire', bedModule: 'none' },
  },
  {
    label: 'Truck + bed_rack + rack + storage + box',
    config: { vehicleType: 'truck', roofModule: 'storage', hitchModule: 'box', bedModule: 'rack' },
  },
  {
    label: 'SUV + rack + storage',
    config: { vehicleType: 'suv', roofModule: 'storage', hitchModule: 'none', bedModule: 'none' },
  },
  {
    label: 'Jeep + rack + tent + tire',
    config: { vehicleType: 'jeep', roofModule: 'tent', hitchModule: 'tire', bedModule: 'none' },
  },
  {
    label: 'Crossover + rack + box',
    config: { vehicleType: 'crossover', roofModule: 'rack', hitchModule: 'box', bedModule: 'none' },
  },
];



