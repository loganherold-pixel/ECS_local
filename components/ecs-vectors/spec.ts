/**
 * ECS Silhouette Specification
 * ─────────────────────────────────────────────────────────
 * Coordinate system, anchor positions, vertical limits,
 * and module alignment constants.
 *
 * ViewBox: 0 0 1024 1024
 * All vehicles share identical baseline and wheel alignment.
 * All modules overlay without adjustment.
 */

// ── ViewBox ─────────────────────────────────────────────
export const VIEWBOX = '0 0 1024 1024';
export const VB_W = 1024;
export const VB_H = 1024;

// ── Global vertical anchors ─────────────────────────────
export const Y = {
  /** Safe padding top */
  SAFE_TOP: 128,
  /** Maximum cargo height (rooftop tent, tall rack loads) */
  CARGO_MAX: 360,
  /** Maximum roofline height for any vehicle */
  ROOF_MAX: 460,
  /** Wheel center Y for all vehicles */
  WHEEL_CENTER: 780,
  /** Vehicle ground contact / baseline */
  GROUND: 820,
  /** Safe padding bottom */
  SAFE_BOTTOM: 896,
} as const;

// ── Global horizontal anchors ───────────────────────────
export const X = {
  /** Safe padding left */
  SAFE_LEFT: 128,
  /** Safe padding right */
  SAFE_RIGHT: 896,
} as const;

// ── Wheel spec ──────────────────────────────────────────
export const WHEEL = {
  /** Outer tire radius */
  TIRE_R: 44,
  /** Inner rim radius */
  RIM_R: 28,
  /** Hub center radius */
  HUB_R: 10,
  /** Wheel arch clearance radius (body cutout) */
  ARCH_R: 54,
  /** Y center (same as Y.WHEEL_CENTER) */
  CY: 780,
} as const;

// ── Corner radius (body panels) ─────────────────────────
export const CORNER_R = 7;

// ── Module alignment anchors ────────────────────────────
// These define where modules attach to base vehicles.
// Each base vehicle exports its own anchor set that conforms
// to this interface.
export interface VehicleAnchors {
  /** Vehicle type identifier */
  id: string;
  /** Front bumper X */
  frontX: number;
  /** Rear bumper X */
  rearX: number;
  /** Roofline Y */
  roofY: number;
  /** Roof front X */
  roofFrontX: number;
  /** Roof rear X */
  roofRearX: number;
  /** Bed/cargo area start X (trucks only) */
  bedStartX?: number;
  /** Bed/cargo area end X (trucks only) */
  bedEndX?: number;
  /** Bed wall top Y (trucks only) */
  bedTopY?: number;
  /** Bed floor Y (trucks only) */
  bedFloorY?: number;
  /** Rear cargo door X (vans/SUVs) */
  cargoDoorX?: number;
  /** Front wheel center X */
  frontWheelX: number;
  /** Rear wheel center X */
  rearWheelX: number;
  /** Undercarriage Y */
  undercarriageY: number;
  /** Hitch mount X (rear-most body point) */
  hitchX: number;
  /** Hitch mount Y */
  hitchY: number;
  /** Has truck bed */
  hasBed: boolean;
}

// ── Fill color ──────────────────────────────────────────
export const FILL_PRIMARY = '#D4AF37';
export const FILL_CURRENT = 'currentColor';

// ── Vehicle type keys ───────────────────────────────────
export type VehicleBaseType =
  | 'fullsize_truck'
  | 'midsize_truck'
  | 'suv_boxy'
  | 'overland_van';

// ── Module type keys ────────────────────────────────────
export type BedModuleType = 'bed_open' | 'bed_rack' | 'bed_shell';
export type RoofModuleType = 'roof_none' | 'roof_rack' | 'roof_storage' | 'roof_tent';
export type HitchModuleType = 'hitch_none' | 'hitch_tire' | 'hitch_box';


// ── SVG shape definition ────────────────────────────────
export interface SvgShape {
  /** SVG path d attribute */
  d: string;
  /** Fill rule: evenodd for compound paths with cutouts */
  fillRule?: 'evenodd' | 'nonzero';
}

// ── Vehicle definition ──────────────────────────────────
export interface VehicleDefinition {
  /** Vehicle type */
  type: VehicleBaseType;
  /** Display name */
  name: string;
  /** Anchor coordinates for module attachment */
  anchors: VehicleAnchors;
  /** Body silhouette (solid fill, includes wheel arch cutouts) */
  body: SvgShape;
  /** Window cutouts (rendered as negative space) */
  windows: SvgShape[];
  /** Wheel definitions: [cx, cy, tireR, rimR, hubR] */
  wheels: [number, number, number, number, number][];
}

// ── Module definition ───────────────────────────────────
export interface ModuleDefinition {
  /** Module type */
  type: BedModuleType | RoofModuleType | HitchModuleType;
  /** Display name */
  name: string;
  /** Category */
  category: 'bed' | 'roof' | 'hitch';
  /** SVG shapes (rendered as solid fill) */
  shapes: SvgShape[];
  /** Whether this module is empty (no visual) */
  isEmpty?: boolean;
}

// ── Max rear extension for hitch modules ────────────────
// 8% of typical vehicle width (~704px) = ~56px
export const HITCH_MAX_EXTENSION = 56;



