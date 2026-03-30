/**
 * WizardIconMap — Maps wizard option IDs to ECS Product Icon keys
 * ─────────────────────────────────────────────────────────────
 * Provides a lookup from (stepId, optionId) → EcsProductIconKey
 * for rendering premium product images alongside wizard option cards.
 *
 * STRATEGY:
 *   1. Option-level patterns (shared across many steps)
 *   2. Step-specific overrides for unique mappings
 *   3. Returns null when no icon matches → falls back to Ionicons
 *
 * ICON MAPPING LOGIC (from spec):
 *   CAB RACK:       Yes → cab-rack, No → none
 *   CAB RACK ACCS:  Storage → storage-box, RTT → rtt, Both → storage-box
 *   BED CONFIG:     Bed Rack → bed-rack, Cover → bed-cover, RSI → smartcap,
 *                   ALU → alu-cab, Topper → other-topper, Open → open-bed
 *   RSI BINS:       Kitchen → slideout-kitchen, Half → half-bins,
 *                   Full → full-bins, None → none
 *   DRAWERS:        Single → single-drawer, Dual → dual-drawer,
 *                   Kitchen → slideout-kitchen, None → none
 *   HITCH:          None → none, Tire → tire-carrier, Bike → bike-rack,
 *                   Recovery → recovery-mount, Box → hitch-cargo-carrier
 */

import type { EcsProductIconKey } from './EcsIconRegistry';

// ════════════════════════════════════════════════════════════
// OPTION-LEVEL PATTERNS — shared across multiple steps
// ════════════════════════════════════════════════════════════

/** Hitch accessory options (shared by car, suv, truck, jeep hitch steps) */
const HITCH_OPTIONS: Record<string, EcsProductIconKey> = {
  none: 'none',
  tire_carrier: 'tire-carrier',
  hitch_box: 'hitch-cargo-carrier',
  bike_rack: 'bike-rack',
  recovery_mount: 'recovery-mount',
};

/** Rack accessory setup options (storage/rtt/both — shared across many steps) */
const RACK_SETUP_OPTIONS: Record<string, EcsProductIconKey> = {
  storage_boxes: 'storage-box',
  storage: 'storage-box',
  rtt: 'rtt',
  both: 'storage-box',
  storage_rtt: 'storage-box',
};

/** Bin count options (1–4 — reuse none icon for counts) */
const BIN_COUNT_OPTIONS: Record<string, EcsProductIconKey> = {
  '1': 'half-bins',
  '2': 'half-bins',
  '3': 'full-bins',
  '4': 'full-bins',
};

/** Drawer type options (shared by truck/jeep drawer steps) */
const DRAWER_TYPE_OPTIONS: Record<string, EcsProductIconKey> = {
  none: 'none',
  single: 'single-drawer',
  dual: 'dual-drawer',
  drawer_kitchen: 'slideout-kitchen',
};

/** RSI / rack bin type options */
const BIN_TYPE_OPTIONS: Record<string, EcsProductIconKey> = {
  kitchen: 'slideout-kitchen',
  half_bins: 'half-bins',
  full_bins: 'full-bins',
  none: 'none',
};

// ════════════════════════════════════════════════════════════
// STEP-SPECIFIC MAPPINGS — unique per wizard step
// ════════════════════════════════════════════════════════════

const STEP_OPTION_MAP: Record<string, Record<string, EcsProductIconKey>> = {
  // ── Truck Bed Configuration ───────────────────────────
  truck_bed: {
    rack: 'bed-rack',
    cover: 'bed-cover',
    rsi_smart_cap: 'smartcap',
    alu_cab: 'alu-cab',
    other_topper: 'other-topper',
    open_bed: 'open-bed',
  },

  // ── Truck Cab Rack ────────────────────────────────────
  truck_cab_rack: {
    yes: 'cab-rack',
    none: 'none',
  },

  // ── Truck Drawers ─────────────────────────────────────
  truck_drawers: DRAWER_TYPE_OPTIONS,

  // ── Truck Hitch ───────────────────────────────────────
  truck_hitch: HITCH_OPTIONS,

  // ── Truck Cab Rack Setup ──────────────────────────────
  truck_cab_rack_setup: RACK_SETUP_OPTIONS,

  // ── Truck Bed Rack Setup ──────────────────────────────
  truck_bed_rack_setup: RACK_SETUP_OPTIONS,

  // ── Truck Bed Cover Setup ─────────────────────────────
  truck_bed_cover_setup: RACK_SETUP_OPTIONS,

  // ── Truck RSI Setup ───────────────────────────────────
  truck_rsi_setup: RACK_SETUP_OPTIONS,

  // ── Truck RSI Bins ────────────────────────────────────
  truck_rsi_bins: BIN_TYPE_OPTIONS,

  // ── Truck RSI Bin Count ───────────────────────────────
  truck_rsi_bin_count: BIN_COUNT_OPTIONS,

  // ── Truck ALU Setup ───────────────────────────────────
  truck_alu_setup: RACK_SETUP_OPTIONS,

  // ── Truck Topper Setup ────────────────────────────────
  truck_topper_setup: RACK_SETUP_OPTIONS,

  // ── Car / Crossover ───────────────────────────────────
  car_roof_rack: {
    yes: 'bed-rack',
    none: 'none',
  },
  car_roof_rack_setup: RACK_SETUP_OPTIONS,
  car_cargo: {
    trunk: 'storage-box',
    hatch: 'open-bed',
    both: 'storage-box',
    none: 'none',
  },
  car_drawers: {
    yes: 'single-drawer',
    none: 'none',
  },
  car_drawer_count: BIN_COUNT_OPTIONS,
  car_hitch: HITCH_OPTIONS,

  // ── SUV / Van ─────────────────────────────────────────
  suv_roof_rack: {
    yes: 'bed-rack',
    none: 'none',
  },
  suv_roof_rack_setup: RACK_SETUP_OPTIONS,
  suv_drawers: {
    yes: 'single-drawer',
    none: 'none',
  },
  suv_drawer_count: BIN_COUNT_OPTIONS,
  suv_hitch: HITCH_OPTIONS,

  // ── Jeep ──────────────────────────────────────────────
  jeep_bed: {
    yes: 'open-bed',
    none: 'none',
  },
  jeep_drawers: DRAWER_TYPE_OPTIONS,
  jeep_top: {
    hard_top: 'smartcap',
    other: 'other-topper',
    none: 'none',
  },
  jeep_hardtop_setup: RACK_SETUP_OPTIONS,
  jeep_other_top_setup: RACK_SETUP_OPTIONS,
  jeep_rack: {
    yes: 'bed-rack',
    none: 'none',
  },
  jeep_rack_setup: RACK_SETUP_OPTIONS,
  jeep_rack_bins: {
    full_bins: 'full-bins',
    none: 'none',
  },
  jeep_rack_bin_count: BIN_COUNT_OPTIONS,
  jeep_rsi: {
    yes: 'smartcap',
    none: 'none',
  },
  jeep_rsi_setup: RACK_SETUP_OPTIONS,
  jeep_rsi_bins: {
    half_bins: 'half-bins',
    none: 'none',
  },
  jeep_rsi_bin_count: BIN_COUNT_OPTIONS,
  jeep_hitch: HITCH_OPTIONS,
};

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * Resolve the EcsProductIconKey for a given wizard step + option combination.
 *
 * @param stepId   — The wizard step ID (e.g., 'truck_bed', 'car_hitch')
 * @param optionId — The selected option ID (e.g., 'smartcap', 'tire_carrier')
 * @returns The matching EcsProductIconKey, or null if no icon exists
 */
export function resolveWizardIconKey(
  stepId: string,
  optionId: string,
): EcsProductIconKey | null {
  const stepMap = STEP_OPTION_MAP[stepId];
  if (stepMap && stepMap[optionId]) {
    return stepMap[optionId];
  }
  return null;
}

/**
 * Check if a given step has ANY product icon mappings.
 * Used to determine if the step should render ECS product icons at all.
 */
export function stepHasEcsIcons(stepId: string): boolean {
  return stepId in STEP_OPTION_MAP;
}



