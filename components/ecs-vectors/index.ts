/**
 * ECS Vector Pack — Public API
 * ─────────────────────────────────────────────────────────
 * Semi-realistic vehicle silhouette system + metallic icon system.
 *
 * Usage (Vehicle Compositor):
 *   import { VehicleCompositor } from './ecs-vectors';
 *
 *   <VehicleCompositor
 *     base="fullsize_truck"
 *     bed="bed_rack"
 *     roof="roof_tent"
 *     hitch="hitch_tire"
 *     width={300}
 *     height={300}
 *   />
 *
 * Usage (Metallic Icons):
 *   import { EcsIcon, CabRackIcon } from './ecs-vectors';
 *
 *   <EcsIcon icon="cab-rack" size={48} />
 *   <CabRackIcon size={48} />
 */

// ── Main compositor ─────────────────────────────────────
export { default as VehicleCompositor } from './VehicleCompositor';

// ── SVG renderer ────────────────────────────────────────
export { default as SvgRenderer, generateSvgString } from './SvgRenderer';

// ── Metallic Icon System ────────────────────────────────
export {
  default as MetallicIcon,
  EcsIcon,
  CabRackIcon,
  StorageBoxIcon,
  RttIcon,
  BedRackIcon,
  BedCoverIcon,
  SmartcapIcon,
  AlucabIcon,
  TopperIcon,
  OpenBedIcon,
  HalfBinsIcon,
  FullBinsIcon,
  KitchenSlideoutIcon,
  DrawerSingleIcon,
  DrawerDualIcon,
  DrawerKitchenIcon,
  HitchNoneIcon,
  HitchTireCarrierIcon,
  HitchCargoCarrierIcon,
  HitchBikeRackIcon,
  HitchRecoveryIcon,
  Bins1Icon,
  Bins2Icon,
  Bins3Icon,
  Bins4Icon,
} from './MetallicIcon';

export type { MetallicIconProps, EcsIconProps } from './MetallicIcon';

// ── Icon Path Data ──────────────────────────────────────
export {
  ECS_ICON_REGISTRY,
  getIconPaths,
} from './EcsIconPaths';

export type { IconPathSet, EcsIconKey } from './EcsIconPaths';

// ── Spec & types ────────────────────────────────────────
export {
  VIEWBOX,
  VB_W,
  VB_H,
  Y,
  X,
  WHEEL,
  CORNER_R,
  FILL_PRIMARY,
  FILL_CURRENT,
  HITCH_MAX_EXTENSION,
} from './spec';

export type {
  VehicleAnchors,
  VehicleBaseType,
  BedModuleType,
  RoofModuleType,
  HitchModuleType,
  SvgShape,
  VehicleDefinition,
  ModuleDefinition,
} from './spec';

// ── Base vehicles ───────────────────────────────────────
export {
  FULLSIZE_TRUCK,
  MIDSIZE_TRUCK,
  SUV_BOXY,
  OVERLAND_VAN,
  VEHICLE_BASES,
  getVehicleBase,
} from './bases';

// ── Modules ─────────────────────────────────────────────
export {
  getBedModulePaths,
  getRoofModulePaths,
  getHitchModulePaths,
  getAvailableModules,
} from './modules';



