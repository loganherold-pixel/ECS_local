/**
 * Vehicle Configuration Wizard — Dynamic Tree Data
 *
 * Models the hand-drawn Vehicle Profile Map:
 *   CAR/CROSSOVER → Roof Rack, Trunk, Hatch, Drawers, Hitch
 *   SUV/VAN       → Roof Rack, Drawers, Hitch
 *   TRUCK         → Cab Rack, Bed, Drawers, Hitch
 *   JEEP          → Bed, Drawers, Top, Rack, RSI Smart Cap, Hitch
 *
 * Steps are conditionally shown based on vehicle type and prior selections.
 * Zone slot counts start at suggested defaults — users can override freely.
 *
 * EXPANDED: Drawer System + Trailer Hitch Accessories steps added.
 * Zone generation is now hardware-aware with position coordinates for CG.
 */

// ─── Types ───────────────────────────────────────────────────
export interface WizardOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  options: WizardOption[];
  /** Return true if this step should be visible given current selections */
  showIf: (sel: Record<string, string>) => boolean;
}

// No longer forcing a fixed total — users choose their own slot counts
export const TOTAL_SLOTS = 0; // kept for backwards compat, not used as a cap


// ─── Helper: always visible ──────────────────────────────────
const always = () => true;

// ─── Helper: visible for specific vehicle types ──────────────
const forTypes = (...types: string[]) => (sel: Record<string, string>) =>
  types.includes(sel.vehicle_type);

// ─── Helper: visible when a previous step has a specific value ─
const when = (stepId: string, ...values: string[]) => (sel: Record<string, string>) =>
  values.includes(sel[stepId]);

// ─── Helper: combine conditions (AND) ────────────────────────
const allOf = (...fns: ((sel: Record<string, string>) => boolean)[]) =>
  (sel: Record<string, string>) => fns.every(fn => fn(sel));

// ─── Helper: combine conditions (OR) ─────────────────────────
const anyOf = (...fns: ((sel: Record<string, string>) => boolean)[]) =>
  (sel: Record<string, string>) => fns.some(fn => fn(sel));

// =============================================================
// STEP 1: VEHICLE TYPE (always shown)
// =============================================================
const STEP_VEHICLE_TYPE: WizardStep = {
  id: 'vehicle_type',
  title: 'VEHICLE TYPE',
  subtitle: 'Select your base vehicle platform',
  icon: 'car-sport-outline',
  showIf: always,
  options: [
    { id: 'car_crossover', label: 'CAR / CROSSOVER', description: 'Sedan, hatchback, or crossover vehicle', icon: 'car-outline', color: '#66BB6A' },
    { id: 'suv_van', label: 'SUV / VAN', description: 'Sport utility vehicle or van with cargo space', icon: 'bus-outline', color: '#AB47BC' },
    { id: 'truck', label: 'TRUCK', description: 'Pickup truck with bed (full-size or mid-size)', icon: 'car-sport-outline', color: '#4FC3F7' },
    { id: 'jeep', label: 'JEEP / 4x4', description: 'Wrangler, Bronco, or similar off-road platform', icon: 'navigate-outline', color: '#FF7043' },
  ],
};

// =============================================================
// CAR / CROSSOVER STEPS
// =============================================================
const STEP_CAR_ROOF_RACK: WizardStep = {
  id: 'car_roof_rack',
  title: 'ROOF RACK',
  subtitle: 'Does your vehicle have a roof rack?',
  icon: 'barbell-outline',
  showIf: forTypes('car_crossover'),
  options: [
    { id: 'yes', label: 'YES — ROOF RACK', description: 'Crossbars, basket, or platform rack installed', icon: 'barbell-outline', color: '#FF6B6B' },
    { id: 'none', label: 'NO ROOF RACK', description: 'No roof-mounted cargo system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_CAR_ROOF_RACK_SETUP: WizardStep = {
  id: 'car_roof_rack_setup',
  title: 'ROOF RACK ACCESSORIES',
  subtitle: 'What is mounted on your roof rack?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('car_crossover'), when('car_roof_rack', 'yes')),
  options: [
    { id: 'storage_boxes', label: 'STORAGE BOXES', description: 'Cargo boxes or cases on the rack', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Roof-mounted tent system', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_CAR_CARGO: WizardStep = {
  id: 'car_cargo',
  title: 'CARGO AREA',
  subtitle: 'Select your primary cargo area type',
  icon: 'file-tray-stacked-outline',
  showIf: forTypes('car_crossover'),
  options: [
    { id: 'trunk', label: 'TRUNK', description: 'Standard enclosed trunk', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'hatch', label: 'HATCH', description: 'Hatchback or liftgate cargo area', icon: 'albums-outline', color: '#66BB6A' },
    { id: 'both', label: 'TRUNK + HATCH', description: 'Both trunk and hatch cargo areas', icon: 'copy-outline', color: '#FFB74D' },
    { id: 'none', label: 'NONE', description: 'No significant cargo area', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_CAR_DRAWERS: WizardStep = {
  id: 'car_drawers',
  title: 'DRAWER SYSTEM',
  subtitle: 'Do you have a drawer storage system?',
  icon: 'file-tray-stacked-outline',
  showIf: forTypes('car_crossover'),
  options: [
    { id: 'none', label: 'NO DRAWERS', description: 'No drawer system installed', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'yes', label: 'YES — DRAWERS', description: 'Pull-out drawer storage system', icon: 'server-outline', color: '#96CEB4' },
  ],
};

const STEP_CAR_DRAWER_COUNT: WizardStep = {
  id: 'car_drawer_count',
  title: 'NUMBER OF DRAWERS',
  subtitle: 'How many drawer units are installed?',
  icon: 'grid-outline',
  showIf: allOf(forTypes('car_crossover'), when('car_drawers', 'yes')),
  options: [
    { id: '1', label: '1 DRAWER', description: 'Single pull-out drawer', icon: 'remove-outline', color: '#90A4AE' },
    { id: '2', label: '2 DRAWERS', description: 'Dual drawer system', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: '3', label: '3 DRAWERS', description: 'Triple drawer system', icon: 'reorder-three-outline', color: '#FFB74D' },
    { id: '4', label: '4 DRAWERS', description: 'Full four-drawer system', icon: 'reorder-four-outline', color: '#FF7043' },
  ],
};

// Car Hitch
const STEP_CAR_HITCH: WizardStep = {
  id: 'car_hitch',
  title: 'TRAILER HITCH ACCESSORIES',
  subtitle: 'What is mounted on your trailer hitch?',
  icon: 'link-outline',
  showIf: forTypes('car_crossover'),
  options: [
    { id: 'none', label: 'NONE', description: 'No hitch accessories', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'tire_carrier', label: 'TIRE CARRIER', description: 'Spare tire carrier on hitch', icon: 'ellipse-outline', color: '#FF7043' },
    { id: 'hitch_box', label: 'HITCH BOX / CARGO CARRIER', description: 'Cargo carrier or hitch box', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'bike_rack', label: 'BIKE RACK', description: 'Bicycle rack on hitch', icon: 'bicycle-outline', color: '#66BB6A' },
    { id: 'recovery_mount', label: 'RECOVERY MOUNT', description: 'Recovery equipment mount', icon: 'construct-outline', color: '#AB47BC' },
  ],
};

// =============================================================
// SUV / VAN STEPS
// =============================================================
const STEP_SUV_ROOF_RACK: WizardStep = {
  id: 'suv_roof_rack',
  title: 'ROOF RACK',
  subtitle: 'Does your vehicle have a roof rack?',
  icon: 'barbell-outline',
  showIf: forTypes('suv_van'),
  options: [
    { id: 'yes', label: 'YES — ROOF RACK', description: 'Crossbars, basket, or platform rack installed', icon: 'barbell-outline', color: '#FF6B6B' },
    { id: 'none', label: 'NO ROOF RACK', description: 'No roof-mounted cargo system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_SUV_ROOF_RACK_SETUP: WizardStep = {
  id: 'suv_roof_rack_setup',
  title: 'ROOF RACK ACCESSORIES',
  subtitle: 'What is mounted on your roof rack?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('suv_van'), when('suv_roof_rack', 'yes')),
  options: [
    { id: 'storage_boxes', label: 'STORAGE BOXES', description: 'Cargo boxes or cases on the rack', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Roof-mounted tent system', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_SUV_DRAWERS: WizardStep = {
  id: 'suv_drawers',
  title: 'DRAWER SYSTEM',
  subtitle: 'Do you have a drawer storage system?',
  icon: 'file-tray-stacked-outline',
  showIf: forTypes('suv_van'),
  options: [
    { id: 'none', label: 'NO DRAWERS', description: 'No drawer system installed', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'yes', label: 'YES — DRAWERS', description: 'Pull-out drawer storage system', icon: 'server-outline', color: '#96CEB4' },
  ],
};

const STEP_SUV_DRAWER_COUNT: WizardStep = {
  id: 'suv_drawer_count',
  title: 'NUMBER OF DRAWERS',
  subtitle: 'How many drawer units are installed?',
  icon: 'grid-outline',
  showIf: allOf(forTypes('suv_van'), when('suv_drawers', 'yes')),
  options: [
    { id: '1', label: '1 DRAWER', description: 'Single pull-out drawer', icon: 'remove-outline', color: '#90A4AE' },
    { id: '2', label: '2 DRAWERS', description: 'Dual drawer system', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: '3', label: '3 DRAWERS', description: 'Triple drawer system', icon: 'reorder-three-outline', color: '#FFB74D' },
    { id: '4', label: '4 DRAWERS', description: 'Full four-drawer system', icon: 'reorder-four-outline', color: '#FF7043' },
  ],
};

// SUV Hitch
const STEP_SUV_HITCH: WizardStep = {
  id: 'suv_hitch',
  title: 'TRAILER HITCH ACCESSORIES',
  subtitle: 'What is mounted on your trailer hitch?',
  icon: 'link-outline',
  showIf: forTypes('suv_van'),
  options: [
    { id: 'none', label: 'NONE', description: 'No hitch accessories', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'tire_carrier', label: 'TIRE CARRIER', description: 'Spare tire carrier on hitch', icon: 'ellipse-outline', color: '#FF7043' },
    { id: 'hitch_box', label: 'HITCH BOX / CARGO CARRIER', description: 'Cargo carrier or hitch box', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'bike_rack', label: 'BIKE RACK', description: 'Bicycle rack on hitch', icon: 'bicycle-outline', color: '#66BB6A' },
    { id: 'recovery_mount', label: 'RECOVERY MOUNT', description: 'Recovery equipment mount', icon: 'construct-outline', color: '#AB47BC' },
  ],
};

// =============================================================
// TRUCK STEPS
// =============================================================
const STEP_TRUCK_CAB_RACK: WizardStep = {
  id: 'truck_cab_rack',
  title: 'CAB RACK',
  subtitle: 'Does your truck have a cab rack?',
  icon: 'barbell-outline',
  showIf: forTypes('truck'),
  options: [
    { id: 'yes', label: 'YES — CAB RACK', description: 'Rack system mounted above the cab', icon: 'barbell-outline', color: '#FF6B6B' },
    { id: 'none', label: 'NO CAB RACK', description: 'No cab-mounted rack system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_TRUCK_CAB_RACK_SETUP: WizardStep = {
  id: 'truck_cab_rack_setup',
  title: 'CAB RACK ACCESSORIES',
  subtitle: 'What is mounted on your cab rack?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_cab_rack', 'yes')),
  options: [
    { id: 'storage_boxes', label: 'STORAGE BOXES', description: 'Cargo boxes or cases on the cab rack', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Roof-mounted tent on cab rack', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_TRUCK_BED: WizardStep = {
  id: 'truck_bed',
  title: 'BED CONFIGURATION',
  subtitle: 'Select your truck bed setup',
  icon: 'cube-outline',
  showIf: forTypes('truck'),
  options: [
    { id: 'rack', label: 'BED RACK', description: 'Rack system in the truck bed', icon: 'barbell-outline', color: '#4FC3F7' },
    { id: 'cover', label: 'BED COVER', description: 'Tonneau or bed cover installed', icon: 'albums-outline', color: '#26A69A' },
    { id: 'rsi_smart_cap', label: 'RSI SMART CAP', description: 'RSI SmartCap or similar enclosed system', icon: 'home-outline', color: '#FF7043' },
    { id: 'alu_cab', label: 'ALU CAB', description: 'Aluminum canopy/cab system', icon: 'business-outline', color: '#AB47BC' },
    { id: 'other_topper', label: 'OTHER TOPPER', description: 'Camper shell, cap, or other topper', icon: 'layers-outline', color: '#8D6E63' },
    { id: 'open_bed', label: 'OPEN BED (NO TOPPER)', description: 'Standard open truck bed', icon: 'resize-outline', color: '#90A4AE' },
  ],
};

// Bed Rack sub-options
const STEP_TRUCK_BED_RACK_SETUP: WizardStep = {
  id: 'truck_bed_rack_setup',
  title: 'BED RACK ACCESSORIES',
  subtitle: 'What is mounted on your bed rack?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'rack')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Cargo storage on the bed rack', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent mounted on bed rack', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

// Bed Cover sub-options
const STEP_TRUCK_BED_COVER_SETUP: WizardStep = {
  id: 'truck_bed_cover_setup',
  title: 'BED COVER ACCESSORIES',
  subtitle: 'What accessories with your bed cover?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'cover')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Storage on or under the cover', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent mounted above the cover', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

// RSI Smart Cap sub-options
const STEP_TRUCK_RSI_SETUP: WizardStep = {
  id: 'truck_rsi_setup',
  title: 'RSI SMART CAP ACCESSORIES',
  subtitle: 'What is mounted on your RSI Smart Cap?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'rsi_smart_cap')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Storage on the Smart Cap', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent on the Smart Cap roof', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_TRUCK_RSI_BINS: WizardStep = {
  id: 'truck_rsi_bins',
  title: 'RSI BIN SYSTEM',
  subtitle: 'Select your RSI Smart Cap bin configuration',
  icon: 'file-tray-stacked-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'rsi_smart_cap')),
  options: [
    { id: 'kitchen', label: 'KITCHEN', description: 'Slide-out kitchen module', icon: 'restaurant-outline', color: '#FF6B6B' },
    { id: 'half_bins', label: 'HALF BINS', description: 'Half-size storage bins', icon: 'file-tray-outline', color: '#FFEAA7' },
    { id: 'full_bins', label: 'FULL BINS', description: 'Full-size storage bins', icon: 'file-tray-stacked-outline', color: '#96CEB4' },
    { id: 'none', label: 'NO BINS', description: 'No bin system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_TRUCK_RSI_BIN_COUNT: WizardStep = {
  id: 'truck_rsi_bin_count',
  title: 'NUMBER OF BINS',
  subtitle: 'How many bins are installed?',
  icon: 'grid-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'rsi_smart_cap'), when('truck_rsi_bins', 'half_bins', 'full_bins')),
  options: [
    { id: '1', label: '1 BIN', description: 'Single bin', icon: 'remove-outline', color: '#90A4AE' },
    { id: '2', label: '2 BINS', description: 'Two bins', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: '3', label: '3 BINS', description: 'Three bins', icon: 'reorder-three-outline', color: '#FFB74D' },
    { id: '4', label: '4 BINS', description: 'Four bins', icon: 'reorder-four-outline', color: '#FF7043' },
  ],
};

// ALU Cab sub-options
const STEP_TRUCK_ALU_SETUP: WizardStep = {
  id: 'truck_alu_setup',
  title: 'ALU CAB ACCESSORIES',
  subtitle: 'What is configured on your ALU Cab?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'alu_cab')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Internal storage configuration', icon: 'briefcase-outline', color: '#64DFDF' },

  ],
};

// Other Topper sub-options
const STEP_TRUCK_TOPPER_SETUP: WizardStep = {
  id: 'truck_topper_setup',
  title: 'TOPPER ACCESSORIES',
  subtitle: 'What is configured on your topper?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('truck'), when('truck_bed', 'other_topper')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Storage inside or on top', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent mounted on the topper', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

// ── NEW: Truck Drawer System ────────────────────────────────
const STEP_TRUCK_DRAWERS: WizardStep = {
  id: 'truck_drawers',
  title: 'DRAWER SYSTEM',
  subtitle: 'Do you have a drawer system in the bed?',
  icon: 'file-tray-stacked-outline',
  showIf: forTypes('truck'),
  options: [
    { id: 'none', label: 'NO DRAWER SYSTEM', description: 'No drawer system installed', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'single', label: 'SINGLE DRAWER', description: 'One pull-out drawer unit', icon: 'remove-outline', color: '#90A4AE' },
    { id: 'dual', label: 'DUAL DRAWER', description: 'Two-drawer system (left + right)', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: 'drawer_kitchen', label: 'DRAWER + SLIDE-OUT KITCHEN', description: 'Drawer with integrated slide-out kitchen module', icon: 'restaurant-outline', color: '#FF6B6B' },
  ],
};

// ── NEW: Truck Trailer Hitch Accessories ────────────────────
const STEP_TRUCK_HITCH: WizardStep = {
  id: 'truck_hitch',
  title: 'TRAILER HITCH ACCESSORIES',
  subtitle: 'What is mounted on your trailer hitch?',
  icon: 'link-outline',
  showIf: forTypes('truck'),
  options: [
    { id: 'none', label: 'NONE', description: 'No hitch accessories', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'tire_carrier', label: 'TIRE CARRIER', description: 'Spare tire carrier on hitch receiver', icon: 'ellipse-outline', color: '#FF7043' },
    { id: 'hitch_box', label: 'HITCH BOX / CARGO CARRIER', description: 'Cargo carrier or hitch-mounted box', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'bike_rack', label: 'BIKE RACK', description: 'Bicycle rack on hitch receiver', icon: 'bicycle-outline', color: '#66BB6A' },
    { id: 'recovery_mount', label: 'RECOVERY MOUNT', description: 'Recovery equipment mount on hitch', icon: 'construct-outline', color: '#AB47BC' },
  ],
};

// =============================================================
// JEEP STEPS
// =============================================================
const STEP_JEEP_BED: WizardStep = {
  id: 'jeep_bed',
  title: 'REAR CARGO / BED',
  subtitle: 'Do you use the rear cargo area for gear?',
  icon: 'cube-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'yes', label: 'YES — CARGO AREA', description: 'Rear cargo area used for expedition gear', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'none', label: 'NO', description: 'Rear cargo not used for loadout', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_DRAWERS: WizardStep = {
  id: 'jeep_drawers',
  title: 'DRAWER SYSTEM',
  subtitle: 'Do you have a drawer system installed?',
  icon: 'file-tray-stacked-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'none', label: 'NO DRAWERS', description: 'No drawer system', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'single', label: 'SINGLE DRAWER', description: 'One pull-out drawer unit', icon: 'remove-outline', color: '#90A4AE' },
    { id: 'dual', label: 'DUAL DRAWER', description: 'Two-drawer system (left + right)', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: 'drawer_kitchen', label: 'DRAWER + SLIDE-OUT KITCHEN', description: 'Drawer with integrated slide-out kitchen', icon: 'restaurant-outline', color: '#FF6B6B' },
  ],
};

const STEP_JEEP_TOP: WizardStep = {
  id: 'jeep_top',
  title: 'TOP TYPE',
  subtitle: 'What type of top does your Jeep have?',
  icon: 'home-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'hard_top', label: 'HARD TOP', description: 'Factory or aftermarket hard top', icon: 'home-outline', color: '#4FC3F7' },
    { id: 'other', label: 'OTHER TOP', description: 'Soft top, bikini top, or other', icon: 'umbrella-outline', color: '#AB47BC' },
    { id: 'none', label: 'NO TOP', description: 'Topless / no top installed', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_HARDTOP_SETUP: WizardStep = {
  id: 'jeep_hardtop_setup',
  title: 'HARD TOP ACCESSORIES',
  subtitle: 'What is mounted on your hard top?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_top', 'hard_top')),
  options: [
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent mounted on the hard top', icon: 'trail-sign-outline', color: '#C77DFF' },
    { id: 'storage', label: 'STORAGE', description: 'Storage rack or boxes on hard top', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'both', label: 'RTT + STORAGE', description: 'Both tent and storage', icon: 'apps-outline', color: '#FFB74D' },
    { id: 'none', label: 'NONE', description: 'No hard top accessories', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_OTHER_TOP_SETUP: WizardStep = {
  id: 'jeep_other_top_setup',
  title: 'TOP ACCESSORIES',
  subtitle: 'What is mounted on your top?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_top', 'other')),
  options: [
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent mounted on the top', icon: 'trail-sign-outline', color: '#C77DFF' },
    { id: 'storage', label: 'STORAGE', description: 'Storage on the top', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'both', label: 'RTT + STORAGE', description: 'Both tent and storage', icon: 'apps-outline', color: '#FFB74D' },
    { id: 'none', label: 'NONE', description: 'No top accessories', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_RACK: WizardStep = {
  id: 'jeep_rack',
  title: 'RACK SYSTEM',
  subtitle: 'Do you have a rack system?',
  icon: 'barbell-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'yes', label: 'YES — RACK', description: 'Rack system installed', icon: 'barbell-outline', color: '#FF6B6B' },
    { id: 'none', label: 'NO RACK', description: 'No rack system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_RACK_SETUP: WizardStep = {
  id: 'jeep_rack_setup',
  title: 'RACK ACCESSORIES',
  subtitle: 'What is mounted on your rack?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rack', 'yes')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Cargo storage on the rack', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent on the rack', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_JEEP_RACK_BINS: WizardStep = {
  id: 'jeep_rack_bins',
  title: 'RACK BINS',
  subtitle: 'Do you have bins on the rack?',
  icon: 'file-tray-stacked-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rack', 'yes')),
  options: [
    { id: 'full_bins', label: 'FULL BINS', description: 'Full-size storage bins on rack', icon: 'file-tray-stacked-outline', color: '#96CEB4' },
    { id: 'none', label: 'NO BINS', description: 'No bins on the rack', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_RACK_BIN_COUNT: WizardStep = {
  id: 'jeep_rack_bin_count',
  title: 'NUMBER OF RACK BINS',
  subtitle: 'How many bins on the rack?',
  icon: 'grid-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rack', 'yes'), when('jeep_rack_bins', 'full_bins')),
  options: [
    { id: '1', label: '1 BIN', description: 'Single bin', icon: 'remove-outline', color: '#90A4AE' },
    { id: '2', label: '2 BINS', description: 'Two bins', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: '3', label: '3 BINS', description: 'Three bins', icon: 'reorder-three-outline', color: '#FFB74D' },
    { id: '4', label: '4 BINS', description: 'Four bins', icon: 'reorder-four-outline', color: '#FF7043' },
  ],
};

const STEP_JEEP_RSI: WizardStep = {
  id: 'jeep_rsi',
  title: 'RSI SMART CAP',
  subtitle: 'Do you have an RSI Smart Cap?',
  icon: 'home-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'yes', label: 'YES — RSI SMART CAP', description: 'RSI SmartCap system installed', icon: 'home-outline', color: '#FF7043' },
    { id: 'none', label: 'NO RSI', description: 'No RSI Smart Cap', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_RSI_SETUP: WizardStep = {
  id: 'jeep_rsi_setup',
  title: 'RSI SMART CAP ACCESSORIES',
  subtitle: 'What is on your RSI Smart Cap?',
  icon: 'layers-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rsi', 'yes')),
  options: [
    { id: 'storage', label: 'STORAGE', description: 'Storage on the Smart Cap', icon: 'briefcase-outline', color: '#64DFDF' },
    { id: 'rtt', label: 'ROOF TOP TENT (RTT)', description: 'Tent on the Smart Cap', icon: 'trail-sign-outline', color: '#C77DFF' },

  ],
};

const STEP_JEEP_RSI_BINS: WizardStep = {
  id: 'jeep_rsi_bins',
  title: 'RSI BIN SYSTEM',
  subtitle: 'Do you have bins in the RSI Smart Cap?',
  icon: 'file-tray-stacked-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rsi', 'yes')),
  options: [
    { id: 'half_bins', label: 'HALF BINS', description: 'Half-size storage bins', icon: 'file-tray-outline', color: '#FFEAA7' },
    { id: 'none', label: 'NO BINS', description: 'No bin system', icon: 'close-circle-outline', color: '#78909C' },
  ],
};

const STEP_JEEP_RSI_BIN_COUNT: WizardStep = {
  id: 'jeep_rsi_bin_count',
  title: 'NUMBER OF RSI BINS',
  subtitle: 'How many bins in the RSI Smart Cap?',
  icon: 'grid-outline',
  showIf: allOf(forTypes('jeep'), when('jeep_rsi', 'yes'), when('jeep_rsi_bins', 'half_bins')),
  options: [
    { id: '1', label: '1 BIN', description: 'Single bin', icon: 'remove-outline', color: '#90A4AE' },
    { id: '2', label: '2 BINS', description: 'Two bins', icon: 'reorder-two-outline', color: '#4DB6AC' },
    { id: '3', label: '3 BINS', description: 'Three bins', icon: 'reorder-three-outline', color: '#FFB74D' },
    { id: '4', label: '4 BINS', description: 'Four bins', icon: 'reorder-four-outline', color: '#FF7043' },
  ],
};

// ── NEW: Jeep Trailer Hitch Accessories ─────────────────────
const STEP_JEEP_HITCH: WizardStep = {
  id: 'jeep_hitch',
  title: 'TRAILER HITCH ACCESSORIES',
  subtitle: 'What is mounted on your trailer hitch?',
  icon: 'link-outline',
  showIf: forTypes('jeep'),
  options: [
    { id: 'none', label: 'NONE', description: 'No hitch accessories', icon: 'close-circle-outline', color: '#78909C' },
    { id: 'tire_carrier', label: 'TIRE CARRIER', description: 'Spare tire carrier on hitch', icon: 'ellipse-outline', color: '#FF7043' },
    { id: 'hitch_box', label: 'HITCH BOX / CARGO CARRIER', description: 'Cargo carrier or hitch box', icon: 'cube-outline', color: '#4FC3F7' },
    { id: 'bike_rack', label: 'BIKE RACK', description: 'Bicycle rack on hitch', icon: 'bicycle-outline', color: '#66BB6A' },
    { id: 'recovery_mount', label: 'RECOVERY MOUNT', description: 'Recovery equipment mount', icon: 'construct-outline', color: '#AB47BC' },
  ],
};

// =============================================================
// ALL STEPS (ordered by flow)
// NOTE: STEP_VEHICLE_TYPE is intentionally excluded.
// Vehicle type is pulled from the existing vehicle configurator
// state (wizard_config.vehicle_type) before the wizard starts.
// =============================================================
export const ALL_WIZARD_STEPS: WizardStep[] = [
  // Car/Crossover branch
  STEP_CAR_ROOF_RACK,
  STEP_CAR_ROOF_RACK_SETUP,
  STEP_CAR_CARGO,
  STEP_CAR_DRAWERS,
  STEP_CAR_DRAWER_COUNT,
  STEP_CAR_HITCH,

  // SUV/Van branch
  STEP_SUV_ROOF_RACK,
  STEP_SUV_ROOF_RACK_SETUP,
  STEP_SUV_DRAWERS,
  STEP_SUV_DRAWER_COUNT,
  STEP_SUV_HITCH,

  // Truck branch
  STEP_TRUCK_CAB_RACK,
  STEP_TRUCK_CAB_RACK_SETUP,
  STEP_TRUCK_BED,
  STEP_TRUCK_BED_RACK_SETUP,
  STEP_TRUCK_BED_COVER_SETUP,
  STEP_TRUCK_RSI_SETUP,
  STEP_TRUCK_RSI_BINS,
  STEP_TRUCK_RSI_BIN_COUNT,
  STEP_TRUCK_ALU_SETUP,
  STEP_TRUCK_TOPPER_SETUP,
  STEP_TRUCK_DRAWERS,
  STEP_TRUCK_HITCH,

  // Jeep branch
  STEP_JEEP_BED,
  STEP_JEEP_DRAWERS,
  STEP_JEEP_TOP,
  STEP_JEEP_HARDTOP_SETUP,
  STEP_JEEP_OTHER_TOP_SETUP,
  STEP_JEEP_RACK,
  STEP_JEEP_RACK_SETUP,
  STEP_JEEP_RACK_BINS,
  STEP_JEEP_RACK_BIN_COUNT,
  STEP_JEEP_RSI,
  STEP_JEEP_RSI_SETUP,
  STEP_JEEP_RSI_BINS,
  STEP_JEEP_RSI_BIN_COUNT,
  STEP_JEEP_HITCH,
];

/**
 * The vehicle type step definition — exported for reference
 * (e.g., to show vehicle type options in a compact selector)
 * but NOT included in the wizard flow.
 */
export const VEHICLE_TYPE_STEP = STEP_VEHICLE_TYPE;

/** Valid vehicle type IDs */
export const VALID_VEHICLE_TYPES = ['car_crossover', 'suv_van', 'truck', 'jeep'] as const;

// =============================================================
// WIZARD PHASE STRUCTURE — The 3 High-Level Steps
// =============================================================
/**
 * The wizard is structurally defined as exactly 3 phases:
 *   1. vehicleType           — Select base vehicle platform
 *   2. resourceProfile       — Configure hardware (rack, bed, drawers, hitch sub-steps)
 *   3. accessoryConfiguration — Define accessory framework (final step before review)
 *
 * COMPLETION RULE:
 *   The vehicle build can ONLY be completed after accessoryConfiguration.
 *   Resource Profile CANNOT finish the wizard — it always advances to Step 3.
 */
export const WIZARD_PHASES = [
  'vehicleType',
  'resourceProfile',
  'accessoryConfiguration',
] as const;

export type WizardPhase = typeof WIZARD_PHASES[number];

/**
 * Determine which high-level phase a given step belongs to.
 */
export function getPhaseForStep(stepId: string): WizardPhase {
  if (stepId === 'vehicle_type') return 'vehicleType';
  // All other wizard steps are resource profile sub-steps
  return 'resourceProfile';
}

/**
 * Get the 1-based phase number for a given phase.
 */
export function getPhaseNumber(phase: WizardPhase): number {
  return WIZARD_PHASES.indexOf(phase) + 1;
}



// =============================================================
// DYNAMIC STEP COMPUTATION
// =============================================================

/**
 * Given current selections, return only the visible wizard steps.
 */
export function getVisibleSteps(selections: Record<string, string>): WizardStep[] {
  return ALL_WIZARD_STEPS.filter(step => step.showIf(selections));
}

/**
 * When a selection changes, clear any downstream selections that are
 * no longer visible (because their showIf condition is now false).
 * Always preserves `vehicle_type` since it's set externally (not a wizard step).
 */
export function pruneSelections(selections: Record<string, string>): Record<string, string> {
  const pruned = { ...selections };
  const visible = ALL_WIZARD_STEPS.filter(step => step.showIf(pruned));
  const visibleIds = new Set(visible.map(s => s.id));

  // Remove selections for steps that are no longer visible
  // BUT always preserve vehicle_type (it's set externally, not a wizard step)
  for (const key of Object.keys(pruned)) {
    if (key === 'vehicle_type') continue; // Never prune vehicle_type
    if (!visibleIds.has(key)) {
      delete pruned[key];
    }
  }
  return pruned;
}


// =============================================================
// ZONE ALLOCATION — Hardware-aware, deterministic generation
// =============================================================

export interface ZoneAllocation {
  zoneId: string;
  zoneName: string;
  zoneType: string;
  slotCount: number;
  color: string;
  icon: string;
  sortOrder: number;
  /** Default position X (relative to wheelbase center, normalized 0–1) */
  defaultPositionX: number;
  /** Default position Y (relative to vehicle centerline, normalized -1 to 1) */
  defaultPositionY: number;
  /** Default position Z (height estimate, normalized 0–1) */
  defaultPositionZ: number;
  /** Suggested default slot count */
  defaultSlotCount: number;
  /** Optional weight total (lbs) — user-settable */
  weightTotal: number;
}

interface ZoneDefinition {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  /** Complexity weight: higher = more slots */
  weight: number;
  /** Default slot suggestion */
  defaultSlots: number;
  /** Position coordinates for CG computation */
  posX: number;
  posY: number;
  posZ: number;
}

// ─── Default position constants by zone type ────────────────
const POS = {
  // Truck positions (normalized 0–1, where 0=front, 1=rear)
  cabInterior:    { x: 0.35, y: 0, z: 0.35 },
  cabRack:        { x: 0.30, y: 0, z: 0.90 },
  cabRackStorage: { x: 0.30, y: 0, z: 0.92 },
  cabRackRTT:     { x: 0.32, y: 0, z: 0.95 },
  bedArea:        { x: 0.72, y: 0, z: 0.30 },
  bedRack:        { x: 0.72, y: 0, z: 0.65 },
  bedRackStorage: { x: 0.72, y: 0, z: 0.72 },
  bedRackRTT:     { x: 0.72, y: 0, z: 0.80 },
  bedCover:       { x: 0.72, y: 0, z: 0.42 },
  smartcap:       { x: 0.72, y: 0, z: 0.50 },
  shellInterior:  { x: 0.72, y: 0, z: 0.40 },
  binLeft:        { x: 0.76, y: -0.5, z: 0.30 },
  binRight:       { x: 0.76, y: 0.5, z: 0.30 },
  aluCab:         { x: 0.72, y: 0, z: 0.55 },
  topper:         { x: 0.72, y: 0, z: 0.50 },
  drawerSingle:   { x: 0.72, y: 0, z: 0.22 },
  drawerLeft:     { x: 0.72, y: -0.4, z: 0.22 },
  drawerRight:    { x: 0.72, y: 0.4, z: 0.22 },
  kitchenModule:  { x: 0.78, y: 0, z: 0.25 },
  hitch:          { x: 0.98, y: 0, z: 0.28 },
  // SUV/Van
  rearCargo:      { x: 0.68, y: 0, z: 0.30 },
  roofRack:       { x: 0.42, y: 0, z: 0.90 },
  // Jeep
  jeepCargo:      { x: 0.68, y: 0, z: 0.30 },
};

/**
 * Build zone definitions from the user's selections.
 * Each zone is deterministically generated from hardware configuration.
 */
function buildZoneDefinitions(sel: Record<string, string>): ZoneDefinition[] {
  const zones: ZoneDefinition[] = [];
  const vt = sel.vehicle_type;

  // ── Always: Cab Interior ──────────────────────────────
  zones.push({
    id: 'cab_interior',
    name: 'Cab Interior',
    type: 'CAB',
    icon: 'car-outline',
    color: '#4ECDC4',
    weight: 2,
    defaultSlots: 6,
    ...POS.cabInterior,
    posX: POS.cabInterior.x, posY: POS.cabInterior.y, posZ: POS.cabInterior.z,
  });

  // ── CAR / CROSSOVER ───────────────────────────────────
  if (vt === 'car_crossover') {
    if (sel.car_roof_rack === 'yes') {
      zones.push({ id: 'roof_rack', name: 'Roof Rack', type: 'RACK', icon: 'barbell-outline', color: '#FF6B6B', weight: 3, defaultSlots: 4, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: POS.roofRack.z });
      if (sel.car_roof_rack_setup === 'rtt' || sel.car_roof_rack_setup === 'both') {
        zones.push({ id: 'roof_rack_rtt', name: 'Roof Rack RTT', type: 'RACK', icon: 'trail-sign-outline', color: '#C77DFF', weight: 2, defaultSlots: 2, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: 0.95 });
      }
      if (sel.car_roof_rack_setup === 'storage_boxes' || sel.car_roof_rack_setup === 'both') {
        zones.push({ id: 'roof_rack_storage', name: 'Roof Rack Storage', type: 'RACK', icon: 'briefcase-outline', color: '#64DFDF', weight: 2, defaultSlots: 4, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: 0.92 });
      }
    }
    if (sel.car_cargo === 'trunk' || sel.car_cargo === 'both') {
      zones.push({ id: 'trunk', name: 'Trunk', type: 'AREA', icon: 'cube-outline', color: '#4FC3F7', weight: 2, defaultSlots: 4, posX: 0.80, posY: 0, posZ: 0.25 });
    }
    if (sel.car_cargo === 'hatch' || sel.car_cargo === 'both') {
      zones.push({ id: 'hatch', name: 'Hatch', type: 'AREA', icon: 'albums-outline', color: '#66BB6A', weight: 2, defaultSlots: 4, posX: 0.78, posY: 0, posZ: 0.30 });
    }
    if (sel.car_drawers === 'yes') {
      const count = parseInt(sel.car_drawer_count || '1', 10);
      if (count >= 2) {
        zones.push({ id: 'drawer_left', name: 'Drawer Left', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 5, posX: POS.drawerLeft.x, posY: POS.drawerLeft.y, posZ: POS.drawerLeft.z });
        zones.push({ id: 'drawer_right', name: 'Drawer Right', type: 'DRAWER', icon: 'server-outline', color: '#81C784', weight: 2, defaultSlots: 5, posX: POS.drawerRight.x, posY: POS.drawerRight.y, posZ: POS.drawerRight.z });
      } else {
        zones.push({ id: 'drawer_system', name: 'Drawer System', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 10, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
      }
    }
    if (sel.car_hitch && sel.car_hitch !== 'none') {
      const hitchLabel = sel.car_hitch === 'tire_carrier' ? 'Tire Carrier' : sel.car_hitch === 'hitch_box' ? 'Hitch Box' : sel.car_hitch === 'bike_rack' ? 'Bike Rack' : 'Recovery Mount';
      zones.push({ id: 'hitch_accessories', name: `Hitch: ${hitchLabel}`, type: 'HITCH', icon: 'link-outline', color: '#E57373', weight: 1, defaultSlots: 2, posX: POS.hitch.x, posY: POS.hitch.y, posZ: POS.hitch.z });
    }
  }

  // ── SUV / VAN ─────────────────────────────────────────
  if (vt === 'suv_van') {
    // Always has cargo area
    zones.push({ id: 'rear_cargo', name: 'Rear Cargo', type: 'AREA', icon: 'file-tray-stacked-outline', color: '#7E57C2', weight: 3, defaultSlots: 8, posX: POS.rearCargo.x, posY: POS.rearCargo.y, posZ: POS.rearCargo.z });

    if (sel.suv_roof_rack === 'yes') {
      zones.push({ id: 'roof_rack', name: 'Roof Rack', type: 'RACK', icon: 'barbell-outline', color: '#FF6B6B', weight: 3, defaultSlots: 4, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: POS.roofRack.z });
      if (sel.suv_roof_rack_setup === 'rtt' || sel.suv_roof_rack_setup === 'both') {
        zones.push({ id: 'roof_rack_rtt', name: 'Roof Rack RTT', type: 'RACK', icon: 'trail-sign-outline', color: '#C77DFF', weight: 2, defaultSlots: 2, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: 0.95 });
      }
      if (sel.suv_roof_rack_setup === 'storage_boxes' || sel.suv_roof_rack_setup === 'both') {
        zones.push({ id: 'roof_rack_storage', name: 'Roof Rack Storage', type: 'RACK', icon: 'briefcase-outline', color: '#64DFDF', weight: 2, defaultSlots: 4, posX: POS.roofRack.x, posY: POS.roofRack.y, posZ: 0.92 });
      }
    }
    if (sel.suv_drawers === 'yes') {
      const count = parseInt(sel.suv_drawer_count || '1', 10);
      if (count >= 2) {
        zones.push({ id: 'drawer_left', name: 'Drawer Left', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 5, posX: POS.drawerLeft.x, posY: POS.drawerLeft.y, posZ: POS.drawerLeft.z });
        zones.push({ id: 'drawer_right', name: 'Drawer Right', type: 'DRAWER', icon: 'server-outline', color: '#81C784', weight: 2, defaultSlots: 5, posX: POS.drawerRight.x, posY: POS.drawerRight.y, posZ: POS.drawerRight.z });
      } else {
        zones.push({ id: 'drawer_system', name: 'Drawer System', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 10, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
      }
    }
    if (sel.suv_hitch && sel.suv_hitch !== 'none') {
      const hitchLabel = sel.suv_hitch === 'tire_carrier' ? 'Tire Carrier' : sel.suv_hitch === 'hitch_box' ? 'Hitch Box' : sel.suv_hitch === 'bike_rack' ? 'Bike Rack' : 'Recovery Mount';
      zones.push({ id: 'hitch_accessories', name: `Hitch: ${hitchLabel}`, type: 'HITCH', icon: 'link-outline', color: '#E57373', weight: 1, defaultSlots: 2, posX: POS.hitch.x, posY: POS.hitch.y, posZ: POS.hitch.z });
    }
  }

  // ── TRUCK ─────────────────────────────────────────────
  if (vt === 'truck') {
    // Bed Area (always present for trucks)
    zones.push({ id: 'bed_area', name: 'Bed Area', type: 'BED', icon: 'resize-outline', color: '#90A4AE', weight: 3, defaultSlots: 8, posX: POS.bedArea.x, posY: POS.bedArea.y, posZ: POS.bedArea.z });

    if (sel.truck_cab_rack === 'yes') {
      zones.push({ id: 'cab_rack', name: 'Cab Rack', type: 'RACK', icon: 'barbell-outline', color: '#FF6B6B', weight: 2, defaultSlots: 4, posX: POS.cabRack.x, posY: POS.cabRack.y, posZ: POS.cabRack.z });
      if (sel.truck_cab_rack_setup === 'storage_boxes' || sel.truck_cab_rack_setup === 'both') {
        zones.push({ id: 'cab_rack_storage', name: 'Cab Rack Storage', type: 'RACK', icon: 'briefcase-outline', color: '#64DFDF', weight: 2, defaultSlots: 4, posX: POS.cabRackStorage.x, posY: POS.cabRackStorage.y, posZ: POS.cabRackStorage.z });
      }
      if (sel.truck_cab_rack_setup === 'rtt' || sel.truck_cab_rack_setup === 'both') {
        zones.push({ id: 'cab_rack_rtt', name: 'Cab Rack RTT', type: 'RACK', icon: 'trail-sign-outline', color: '#C77DFF', weight: 2, defaultSlots: 2, posX: POS.cabRackRTT.x, posY: POS.cabRackRTT.y, posZ: POS.cabRackRTT.z });
      }
    }

    const bed = sel.truck_bed;
    if (bed === 'rack') {
      zones.push({ id: 'bed_rack', name: 'Bed Rack', type: 'RACK', icon: 'barbell-outline', color: '#4FC3F7', weight: 3, defaultSlots: 4, posX: POS.bedRack.x, posY: POS.bedRack.y, posZ: POS.bedRack.z });
      if (sel.truck_bed_rack_setup === 'storage' || sel.truck_bed_rack_setup === 'both') {
        zones.push({ id: 'bed_rack_storage', name: 'Bed Rack Storage', type: 'RACK', icon: 'briefcase-outline', color: '#64DFDF', weight: 2, defaultSlots: 4, posX: POS.bedRackStorage.x, posY: POS.bedRackStorage.y, posZ: POS.bedRackStorage.z });
      }
      if (sel.truck_bed_rack_setup === 'rtt' || sel.truck_bed_rack_setup === 'both') {
        zones.push({ id: 'bed_rack_rtt', name: 'Bed Rack RTT', type: 'RACK', icon: 'trail-sign-outline', color: '#C77DFF', weight: 2, defaultSlots: 2, posX: POS.bedRackRTT.x, posY: POS.bedRackRTT.y, posZ: POS.bedRackRTT.z });
      }
    } else if (bed === 'rsi_smart_cap') {
      zones.push({ id: 'shell_interior', name: 'Shell Interior', type: 'BED', icon: 'home-outline', color: '#FF7043', weight: 3, defaultSlots: 6, posX: POS.shellInterior.x, posY: POS.shellInterior.y, posZ: POS.shellInterior.z });
      if (sel.truck_rsi_bins === 'kitchen') {
        zones.push({ id: 'kitchen_module', name: 'Kitchen Module', type: 'BED', icon: 'restaurant-outline', color: '#FF6B6B', weight: 2, defaultSlots: 4, posX: POS.kitchenModule.x, posY: POS.kitchenModule.y, posZ: POS.kitchenModule.z });
      }
      if (sel.truck_rsi_bins === 'half_bins' || sel.truck_rsi_bins === 'full_bins') {
        zones.push({ id: 'bin_left', name: 'Bin Left', type: 'BED', icon: 'file-tray-outline', color: '#FFEAA7', weight: 2, defaultSlots: 6, posX: POS.binLeft.x, posY: POS.binLeft.y, posZ: POS.binLeft.z });
        zones.push({ id: 'bin_right', name: 'Bin Right', type: 'BED', icon: 'file-tray-outline', color: '#FFD54F', weight: 2, defaultSlots: 6, posX: POS.binRight.x, posY: POS.binRight.y, posZ: POS.binRight.z });
      }
    } else if (bed === 'alu_cab') {
      zones.push({ id: 'alu_cab_interior', name: 'ALU Cab Interior', type: 'BED', icon: 'business-outline', color: '#AB47BC', weight: 3, defaultSlots: 6, posX: POS.aluCab.x, posY: POS.aluCab.y, posZ: POS.aluCab.z });
    } else if (bed === 'other_topper') {
      zones.push({ id: 'topper_interior', name: 'Topper Interior', type: 'BED', icon: 'layers-outline', color: '#8D6E63', weight: 3, defaultSlots: 6, posX: POS.topper.x, posY: POS.topper.y, posZ: POS.topper.z });
    }

    // ── Truck Drawer System (NEW) ───────────────────────
    if (sel.truck_drawers && sel.truck_drawers !== 'none') {
      if (sel.truck_drawers === 'single') {
        zones.push({ id: 'drawer_system', name: 'Drawer System', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 10, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
      } else if (sel.truck_drawers === 'dual') {
        zones.push({ id: 'drawer_left', name: 'Drawer Left', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 10, posX: POS.drawerLeft.x, posY: POS.drawerLeft.y, posZ: POS.drawerLeft.z });
        zones.push({ id: 'drawer_right', name: 'Drawer Right', type: 'DRAWER', icon: 'server-outline', color: '#81C784', weight: 2, defaultSlots: 10, posX: POS.drawerRight.x, posY: POS.drawerRight.y, posZ: POS.drawerRight.z });
      } else if (sel.truck_drawers === 'drawer_kitchen') {
        zones.push({ id: 'drawer_main', name: 'Drawer', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 8, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
        zones.push({ id: 'kitchen_module', name: 'Kitchen Module', type: 'DRAWER', icon: 'restaurant-outline', color: '#FF6B6B', weight: 2, defaultSlots: 4, posX: POS.kitchenModule.x, posY: POS.kitchenModule.y, posZ: POS.kitchenModule.z });
      }
    }

    // ── Truck Trailer Hitch (NEW) ───────────────────────
    if (sel.truck_hitch && sel.truck_hitch !== 'none') {
      const hitchLabel = sel.truck_hitch === 'tire_carrier' ? 'Tire Carrier' : sel.truck_hitch === 'hitch_box' ? 'Hitch Box' : sel.truck_hitch === 'bike_rack' ? 'Bike Rack' : 'Recovery Mount';
      zones.push({ id: 'hitch_accessories', name: `Hitch: ${hitchLabel}`, type: 'HITCH', icon: 'link-outline', color: '#E57373', weight: 1, defaultSlots: 2, posX: POS.hitch.x, posY: POS.hitch.y, posZ: POS.hitch.z });
    }
  }

  // ── JEEP ──────────────────────────────────────────────
  if (vt === 'jeep') {
    // Rear Cargo
    if (sel.jeep_bed === 'yes') {
      zones.push({ id: 'jeep_cargo', name: 'Rear Cargo', type: 'AREA', icon: 'cube-outline', color: '#4FC3F7', weight: 2, defaultSlots: 6, posX: POS.jeepCargo.x, posY: POS.jeepCargo.y, posZ: POS.jeepCargo.z });
    }

    // Drawer System (UPDATED: single/dual/kitchen)
    if (sel.jeep_drawers && sel.jeep_drawers !== 'none') {
      if (sel.jeep_drawers === 'single') {
        zones.push({ id: 'drawer_system', name: 'Drawer System', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 3, defaultSlots: 10, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
      } else if (sel.jeep_drawers === 'dual') {
        zones.push({ id: 'drawer_left', name: 'Drawer Left', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 10, posX: POS.drawerLeft.x, posY: POS.drawerLeft.y, posZ: POS.drawerLeft.z });
        zones.push({ id: 'drawer_right', name: 'Drawer Right', type: 'DRAWER', icon: 'server-outline', color: '#81C784', weight: 2, defaultSlots: 10, posX: POS.drawerRight.x, posY: POS.drawerRight.y, posZ: POS.drawerRight.z });
      } else if (sel.jeep_drawers === 'drawer_kitchen') {
        zones.push({ id: 'drawer_main', name: 'Drawer', type: 'DRAWER', icon: 'server-outline', color: '#96CEB4', weight: 2, defaultSlots: 8, posX: POS.drawerSingle.x, posY: POS.drawerSingle.y, posZ: POS.drawerSingle.z });
        zones.push({ id: 'kitchen_module', name: 'Kitchen Module', type: 'DRAWER', icon: 'restaurant-outline', color: '#FF6B6B', weight: 2, defaultSlots: 4, posX: POS.kitchenModule.x, posY: POS.kitchenModule.y, posZ: POS.kitchenModule.z });
      }
    }

    const top = sel.jeep_top;
    if (top === 'hard_top') {
      const sub = sel.jeep_hardtop_setup;
      if (sub && sub !== 'none') {
        zones.push({ id: 'hard_top', name: 'Hard Top', type: 'RACK', icon: 'home-outline', color: '#4FC3F7', weight: 2, defaultSlots: 4, posX: 0.40, posY: 0, posZ: 0.85 });
      }
    } else if (top === 'other') {
      const sub = sel.jeep_other_top_setup;
      if (sub && sub !== 'none') {
        zones.push({ id: 'other_top', name: 'Top Storage', type: 'RACK', icon: 'umbrella-outline', color: '#AB47BC', weight: 2, defaultSlots: 4, posX: 0.40, posY: 0, posZ: 0.85 });
      }
    }

    if (sel.jeep_rack === 'yes') {
      zones.push({ id: 'jeep_rack', name: 'Rack System', type: 'RACK', icon: 'barbell-outline', color: '#FF6B6B', weight: 3, defaultSlots: 4, posX: 0.50, posY: 0, posZ: 0.85 });
      if (sel.jeep_rack_bins === 'full_bins') {
        zones.push({ id: 'jeep_rack_bins', name: 'Rack Bins', type: 'RACK', icon: 'file-tray-stacked-outline', color: '#96CEB4', weight: 2, defaultSlots: 4, posX: 0.50, posY: 0, posZ: 0.80 });
      }
    }

    if (sel.jeep_rsi === 'yes') {
      zones.push({ id: 'jeep_rsi', name: 'RSI Smart Cap', type: 'BED', icon: 'home-outline', color: '#FF7043', weight: 3, defaultSlots: 6, posX: 0.68, posY: 0, posZ: 0.50 });
      if (sel.jeep_rsi_bins === 'half_bins') {
        zones.push({ id: 'jeep_rsi_bin_left', name: 'RSI Bin Left', type: 'BED', icon: 'file-tray-outline', color: '#FFEAA7', weight: 2, defaultSlots: 6, posX: 0.68, posY: -0.5, posZ: 0.30 });
        zones.push({ id: 'jeep_rsi_bin_right', name: 'RSI Bin Right', type: 'BED', icon: 'file-tray-outline', color: '#FFD54F', weight: 2, defaultSlots: 6, posX: 0.68, posY: 0.5, posZ: 0.30 });
      }
    }

    // ── Jeep Trailer Hitch (NEW) ────────────────────────
    if (sel.jeep_hitch && sel.jeep_hitch !== 'none') {
      const hitchLabel = sel.jeep_hitch === 'tire_carrier' ? 'Tire Carrier' : sel.jeep_hitch === 'hitch_box' ? 'Hitch Box' : sel.jeep_hitch === 'bike_rack' ? 'Bike Rack' : 'Recovery Mount';
      zones.push({ id: 'hitch_accessories', name: `Hitch: ${hitchLabel}`, type: 'HITCH', icon: 'link-outline', color: '#E57373', weight: 1, defaultSlots: 2, posX: POS.hitch.x, posY: POS.hitch.y, posZ: POS.hitch.z });
    }
  }

  return zones;
}

/**
 * Calculate zone allocations from wizard selections.
 * Each zone starts with its suggested default slot count.
 * User can override freely.
 */
export function calculateZoneAllocations(
  selections: Record<string, string>,
  /** Previous allocations to preserve slot counts for unchanged zones */
  previousAllocations?: ZoneAllocation[],
): ZoneAllocation[] {
  const zoneDefs = buildZoneDefinitions(selections);
  if (zoneDefs.length === 0) return [];

  // Build lookup of previous slot counts by zoneId
  const prevSlotMap = new Map<string, { slotCount: number; weightTotal: number }>();
  if (previousAllocations) {
    for (const prev of previousAllocations) {
      prevSlotMap.set(prev.zoneId, { slotCount: prev.slotCount, weightTotal: prev.weightTotal });
    }
  }

  const zones: ZoneAllocation[] = zoneDefs.map((z, idx) => {
    const prev = prevSlotMap.get(z.id);
    return {
      zoneId: z.id,
      zoneName: z.name,
      zoneType: z.type,
      slotCount: prev ? prev.slotCount : z.defaultSlots,
      color: z.color,
      icon: z.icon,
      sortOrder: idx,
      defaultPositionX: z.posX,
      defaultPositionY: z.posY,
      defaultPositionZ: z.posZ,
      defaultSlotCount: z.defaultSlots,
      weightTotal: prev ? prev.weightTotal : 0,
    };
  });

  return zones;
}


/**
 * Get a human-readable summary of the configuration.
 */
export function getConfigSummary(
  selections: Record<string, string>
): { label: string; value: string }[] {
  const visible = getVisibleSteps(selections);
  const summary: { label: string; value: string }[] = [];

  for (const step of visible) {
    const selectedId = selections[step.id];
    if (!selectedId) {
      summary.push({ label: step.title, value: 'Not Selected' });
      continue;
    }
    const option = step.options.find(o => o.id === selectedId);
    summary.push({
      label: step.title,
      value: option?.label || selectedId,
    });
  }

  return summary;
}



