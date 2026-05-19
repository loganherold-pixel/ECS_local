export const FLEET_LOAD_ZONES = [
  'frontLow',
  'rearLow',
  'bedLow',
  'bedHigh',
  'roof',
  'cab',
  'underbody',
  'hitch',
  'trailer',
] as const;

export type FleetLoadZone = (typeof FLEET_LOAD_ZONES)[number];

export const FLEET_BUILD_USE_CASES = [
  'daily',
  'work',
  'towing',
  'overland',
  'emergency',
  'winter',
  'family',
  'custom',
] as const;

export type FleetBuildUseCase = (typeof FLEET_BUILD_USE_CASES)[number];

export type FleetWeightSource =
  | 'scale_ticket'
  | 'vin_oem_match'
  | 'manufacturer_spec'
  | 'exact_build_match'
  | 'ecs_default'
  | 'user_estimate'
  | 'calculated'
  | 'unknown';

export type FleetRiskLevel = 'clear' | 'watch' | 'caution' | 'critical';

export type FleetWeightConfidenceLevel =
  | 'verified'
  | 'catalog_estimate'
  | 'ecs_estimate'
  | 'class_estimate'
  | 'incomplete'
  | 'unknown';

export type FleetWeightValidationSeverity = 'info' | 'warning' | 'critical';

export type FleetWeightValidationFlag = {
  id: string;
  severity: FleetWeightValidationSeverity;
  message: string;
};

export type FleetWeightConfidenceMetadata = {
  level: FleetWeightConfidenceLevel;
  label: string;
  copy: string;
  score: number;
  reasons: string[];
};

export type FleetChecklistCategory =
  | 'required_setup'
  | 'recovery'
  | 'safety'
  | 'maintenance'
  | 'documents'
  | 'seasonal'
  | 'custom';

export type FleetWeightVerificationTarget =
  | 'baseNetWeight'
  | 'curbWeight'
  | 'emptyWeight'
  | 'gvwr'
  | 'frontBaseWeight'
  | 'rearBaseWeight'
  | 'accessory'
  | 'loadoutItem'
  | 'operatingWeight'
  | 'payloadRemaining';

export interface FleetWeightValue {
  lbs: number;
  source: FleetWeightSource;
  confidence: number;
  sourceLabel?: string | null;
  verifiedAt?: string | null;
  verificationId?: string | null;
}

export interface FleetDisplayMetadata {
  iconKey: string;
  title: string;
  subtitle?: string | null;
  classLabel?: string | null;
  chips: string[];
  statusText?: string | null;
  accentTone?: 'active' | 'ready' | 'live' | 'warning' | 'unavailable' | 'info' | 'category' | 'selected';
}

export interface FleetPlacementMetadata {
  x: number;
  y: number;
  z: number;
  source: 'fleet_load_zone' | 'compartment_name' | 'default_unassigned' | 'legacy_adapter';
  status: 'assigned' | 'unassigned' | 'fallback';
}

export type FleetFuelType = 'diesel' | 'gas' | 'unknown';

export interface FleetResourceProfile {
  fuelTankCapacityGal: number | null;
  fuelType: FleetFuelType;
  currentFuelPercent: number | null;
  currentFuelGallons: number;
  currentFuelWeight: FleetWeightValue;
  waterCapacityGal: number | null;
  currentWaterGallons: number;
  currentWaterWeight: FleetWeightValue;
  consumablesWeight: FleetWeightValue;
}

export interface VehicleBuildProfile {
  id: string;
  vehicleId: string;
  useCases: FleetBuildUseCase[];
  baseNetWeight: FleetWeightValue | null;
  curbWeight?: FleetWeightValue | null;
  emptyWeight?: FleetWeightValue | null;
  gvwr: FleetWeightValue | null;
  frontBaseWeight?: FleetWeightValue | null;
  rearBaseWeight?: FleetWeightValue | null;
  frontGawr?: FleetWeightValue | null;
  rearGawr?: FleetWeightValue | null;
  wheelbaseIn?: number | null;
  tireSizeInches?: number | null;
  tireWidthInches?: number | null;
  wheelDiameterInches?: number | null;
  tireModel?: string | null;
  suspensionLiftInches?: number | null;
  isLeveled?: boolean | null;
  frontLevelInches?: number | null;
  groundClearanceInches?: number | null;
  resourceProfile?: FleetResourceProfile;
  drivetrain?: string | null;
  engine?: string | null;
  trim?: string | null;
  display: FleetDisplayMetadata;
  updatedAt: string;
}

export interface FleetVehicle {
  id: string;
  ownerUserId: string;
  nickname: string;
  vehicleType: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  notes?: string | null;
  buildProfile: VehicleBuildProfile;
  display: FleetDisplayMetadata;
  activeLoadoutId?: string | null;
  legacyVehicleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessoryCatalogItem {
  id: string;
  name: string;
  category: string;
  defaultWeight: FleetWeightValue;
  defaultLoadZone: FleetLoadZone;
  createsCompartment: boolean;
  display: FleetDisplayMetadata;
}

export interface FleetAccessoryInstall {
  id: string;
  vehicleId: string;
  catalogItemId?: string | null;
  name: string;
  installedWeight: FleetWeightValue;
  affectsPayload?: boolean;
  loadZone: FleetLoadZone;
  compartmentId?: string | null;
  placement?: FleetPlacementMetadata | null;
  installedAt?: string | null;
  notes?: string | null;
  display: FleetDisplayMetadata;
}

export interface FleetCompartment {
  id: string;
  vehicleId: string;
  name: string;
  loadZone: FleetLoadZone;
  accessoryInstallId?: string | null;
  parentCompartmentId?: string | null;
  sortOrder: number;
  capacityWeight?: FleetWeightValue | null;
  display: FleetDisplayMetadata;
}

export interface FleetLoadoutItem {
  id: string;
  vehicleId: string;
  loadoutId?: string | null;
  name: string;
  category: string;
  quantity: number;
  weight: FleetWeightValue;
  loadZone: FleetLoadZone;
  compartmentId?: string | null;
  placement?: FleetPlacementMetadata | null;
  isCritical: boolean;
  isPacked: boolean;
  notes?: string | null;
  display: FleetDisplayMetadata;
}

export interface FleetChecklistItem {
  id: string;
  vehicleId: string;
  label: string;
  category: FleetChecklistCategory;
  isRequired: boolean;
  isComplete: boolean;
  sortOrder: number;
  source?: 'ecs_default' | 'user' | 'adapter';
}

export interface WeightVerification {
  id: string;
  vehicleId: string;
  target: FleetWeightVerificationTarget;
  weight: FleetWeightValue;
  method: FleetWeightSource;
  sourceLabel: string;
  recordedAt: string;
  notes?: string | null;
}

export interface FleetZoneWeightResult {
  zone: FleetLoadZone;
  accessoryWeight: FleetWeightValue;
  loadoutWeight: FleetWeightValue;
  totalWeight: FleetWeightValue;
}

export interface FleetWeightResult {
  vehicleId: string;
  baseNetWeight: FleetWeightValue;
  installedAccessoryWeight: FleetWeightValue;
  passengerWeight: FleetWeightValue;
  activeLoadoutWeight: FleetWeightValue;
  consumablesWeight: FleetWeightValue;
  operatingWeight: FleetWeightValue;
  gvwr: FleetWeightValue | null;
  payloadRemaining: FleetWeightValue | null;
  payloadCapacity: FleetWeightValue | null;
  gvwrUsagePct: number | null;
  zoneWeights: Record<FleetLoadZone, FleetZoneWeightResult>;
  topHeavyRisk: FleetRiskLevel;
  frontAxleRisk: FleetRiskLevel;
  rearAxleRisk: FleetRiskLevel;
  gvwrOverageRisk: FleetRiskLevel;
  confidence: number;
  confidenceMetadata: FleetWeightConfidenceMetadata;
  validationFlags: FleetWeightValidationFlag[];
  warnings: string[];
}

export interface FleetScoringResult {
  vehicleId: string;
  readinessScore: number;
  payloadScore: number;
  confidenceScore: number;
  overallScore: number;
  riskLevel: FleetRiskLevel;
  blockingIssues: string[];
  recommendations: string[];
  confidence: number;
}

export interface FleetFabricPayload {
  schemaVersion: 'fleet.fabric.v1';
  generatedAt: string;
  vehicle: {
    id: string;
    ownerUserId: string;
    nickname: string;
    vehicleType: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    display: FleetDisplayMetadata;
  };
  build: VehicleBuildProfile;
  accessories: FleetAccessoryInstall[];
  compartments: FleetCompartment[];
  loadoutItems: FleetLoadoutItem[];
  checklistItems: FleetChecklistItem[];
  weight: FleetWeightResult;
  scoring: FleetScoringResult;
}

type LegacyVehicleInput = {
  id: string;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  name?: string | null;
  type?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  fuel_tank_capacity_gal?: number | null;
  current_fuel_percent?: number | null;
  water_capacity_gal?: number | null;
  current_water_gal?: number | null;
  fuel_type?: 'diesel' | 'gas' | string | null;
  wheelbase_in?: number | null;
  tire_size_inches?: number | null;
  tire_width_inches?: number | null;
  wheel_diameter_inches?: number | null;
  tire_model?: string | null;
  suspension_lift_inches?: number | null;
  is_leveled?: boolean | null;
  front_level_inches?: number | null;
  ground_clearance_inches?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LegacyVehicleSpecInput = {
  gvwr_lb?: number | null;
  base_weight_lb?: number | null;
  curb_weight_lb?: number | null;
  empty_weight_lb?: number | null;
  front_base_weight_lb?: number | null;
  rear_base_weight_lb?: number | null;
  front_gawr_lb?: number | null;
  rear_gawr_lb?: number | null;
  wheelbase_in?: number | null;
  fuel_tank_capacity_gal?: number | null;
  fuel_type?: 'diesel' | 'gas' | string | null;
  tire_size_inches?: number | null;
  tireSizeInches?: number | null;
  tire_width_inches?: number | null;
  tireWidthInches?: number | null;
  wheel_diameter_inches?: number | null;
  wheelDiameterInches?: number | null;
  tire_model?: string | null;
  tireModel?: string | null;
  suspension_lift_inches?: number | null;
  suspensionLiftInches?: number | null;
  is_leveled?: boolean | null;
  isLeveled?: boolean | null;
  front_level_inches?: number | null;
  frontLevelInches?: number | null;
  ground_clearance_inches?: number | null;
  groundClearanceInches?: number | null;
  cab?: string | null;
  bed_length?: string | null;
  trim?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
};

type LegacyConsumablesInput = {
  fuel_percent_current?: number | null;
  fuel_gal_current?: number | null;
  water_gal_current?: number | null;
};

type LegacyTiresLiftInput = {
  tireSizeInches?: number | null;
  tireWidthInches?: number | null;
  wheelDiameterInches?: number | null;
  tireModel?: string | null;
  suspensionLiftInches?: number | null;
  isLeveled?: boolean | null;
  frontLevelInches?: number | null;
};

type LegacyLoadoutItemInput = {
  id: string;
  loadout_id?: string | null;
  name?: string | null;
  category?: string | null;
  quantity?: number | null;
  is_critical?: boolean | null;
  is_packed?: boolean | null;
  storage_location?: string | null;
  notes?: string | null;
  weight_lbs?: number | null;
  weight_source?: 'manufacturer' | 'measured' | 'estimate' | string | null;
};

type LegacyZoneInput = {
  id: string;
  vehicle_id?: string | null;
  parent_zone_id?: string | null;
  name?: string | null;
  zone_type?: string | null;
  sort_order?: number | null;
  zone_weight_total?: number | null;
  notes?: string | null;
};

type LegacyFleetAdapterInput = {
  vehicle: LegacyVehicleInput;
  specs?: LegacyVehicleSpecInput | null;
  consumables?: LegacyConsumablesInput | null;
  tiresLift?: LegacyTiresLiftInput | null;
  loadoutItems?: LegacyLoadoutItemInput[] | null;
  compartments?: LegacyZoneInput[] | null;
  useCases?: FleetBuildUseCase[] | null;
  now?: string;
};

const FLEET_LOAD_ZONE_SET = new Set<string>(FLEET_LOAD_ZONES);
const FLEET_BUILD_USE_CASE_SET = new Set<string>(FLEET_BUILD_USE_CASES);

export type FleetConfidenceTier =
  | 'scale_ticket'
  | 'vin_oem_match'
  | 'manufacturer_spec'
  | 'exact_build_match'
  | 'vehicle_type_default'
  | 'user_estimate';

export const FLEET_CONFIDENCE_TIERS: Record<FleetConfidenceTier, { min: number; max: number; default: number }> = {
  scale_ticket: { min: 98, max: 98, default: 98 },
  vin_oem_match: { min: 90, max: 95, default: 93 },
  manufacturer_spec: { min: 88, max: 95, default: 91 },
  exact_build_match: { min: 80, max: 88, default: 84 },
  vehicle_type_default: { min: 60, max: 72, default: 66 },
  user_estimate: { min: 55, max: 70, default: 62 },
};

const DEFAULT_CONFIDENCE_BY_SOURCE: Record<FleetWeightSource, number> = {
  scale_ticket: FLEET_CONFIDENCE_TIERS.scale_ticket.default,
  vin_oem_match: FLEET_CONFIDENCE_TIERS.vin_oem_match.default,
  manufacturer_spec: FLEET_CONFIDENCE_TIERS.manufacturer_spec.default,
  exact_build_match: FLEET_CONFIDENCE_TIERS.exact_build_match.default,
  ecs_default: FLEET_CONFIDENCE_TIERS.vehicle_type_default.default,
  user_estimate: FLEET_CONFIDENCE_TIERS.user_estimate.default,
  calculated: 80,
  unknown: 50,
};

export interface VehicleWeightDefaultCatalogItem {
  id: string;
  make: string;
  model: string;
  series?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  cab?: string | null;
  bedLength?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  trim?: string | null;
  netEmptyWeight: FleetWeightValue;
  gvwr?: FleetWeightValue | null;
  frontBaseWeight?: FleetWeightValue | null;
  rearBaseWeight?: FleetWeightValue | null;
  frontGawr?: FleetWeightValue | null;
  rearGawr?: FleetWeightValue | null;
  confidenceTier: FleetConfidenceTier;
  confidenceLevel?: FleetWeightConfidenceLevel;
  notes?: string | null;
}

export const VEHICLE_WEIGHT_DEFAULTS_CATALOG: readonly VehicleWeightDefaultCatalogItem[] = [
  {
    id: 'ram-2500-unknown-config',
    make: 'ram',
    model: '2500',
    series: '2500',
    netEmptyWeight: createFleetWeightValue(7400, 'ecs_default', {
      sourceLabel: 'RAM 2500 unknown configuration ECS default',
      confidence: FLEET_CONFIDENCE_TIERS.vehicle_type_default.default,
    }),
    gvwr: createFleetWeightValue(10000, 'manufacturer_spec', {
      sourceLabel: 'RAM 2500 common GVWR default, verify by door placard',
      confidence: FLEET_CONFIDENCE_TIERS.manufacturer_spec.min,
    }),
    confidenceTier: 'vehicle_type_default',
    notes: 'Fallback default for RAM 2500 when engine, cab, drivetrain, or bed length are unknown.',
  },
  {
    id: 'ram-2500-gas-crew-4x4',
    make: 'ram',
    model: '2500',
    series: '2500',
    cab: 'crew',
    engine: 'gas',
    drivetrain: '4x4',
    netEmptyWeight: createFleetWeightValue(6680, 'exact_build_match', {
      sourceLabel: 'RAM 2500 gas crew 4x4 ECS configuration default',
      confidence: FLEET_CONFIDENCE_TIERS.exact_build_match.default,
    }),
    gvwr: createFleetWeightValue(10000, 'manufacturer_spec', {
      sourceLabel: 'RAM 2500 common GVWR default, verify by door placard',
      confidence: FLEET_CONFIDENCE_TIERS.manufacturer_spec.min,
    }),
    confidenceTier: 'exact_build_match',
  },
  {
    id: 'ram-2500-cummins-crew-4x4-short-bed',
    make: 'ram',
    model: '2500',
    series: '2500',
    cab: 'crew',
    bedLength: 'short',
    engine: 'cummins',
    drivetrain: '4x4',
    netEmptyWeight: createFleetWeightValue(7742, 'exact_build_match', {
      sourceLabel: 'RAM 2500 Cummins crew 4x4 short bed ECS configuration default',
      confidence: FLEET_CONFIDENCE_TIERS.exact_build_match.default,
    }),
    gvwr: createFleetWeightValue(10190, 'manufacturer_spec', {
      sourceLabel: 'RAM 2500 Cummins crew 4x4 short bed GVWR default, verify by door placard',
      confidence: FLEET_CONFIDENCE_TIERS.manufacturer_spec.min,
    }),
    confidenceTier: 'exact_build_match',
  },
  {
    id: 'ram-2500-cummins-crew-4x4-long-bed',
    make: 'ram',
    model: '2500',
    series: '2500',
    cab: 'crew',
    bedLength: 'long',
    engine: 'cummins',
    drivetrain: '4x4',
    netEmptyWeight: createFleetWeightValue(7888, 'exact_build_match', {
      sourceLabel: 'RAM 2500 Cummins crew 4x4 long bed ECS configuration default',
      confidence: FLEET_CONFIDENCE_TIERS.exact_build_match.default,
    }),
    gvwr: createFleetWeightValue(10000, 'manufacturer_spec', {
      sourceLabel: 'RAM 2500 common GVWR default, verify by door placard',
      confidence: FLEET_CONFIDENCE_TIERS.manufacturer_spec.min,
    }),
    confidenceTier: 'exact_build_match',
  },
  {
    id: 'ram-2500-cummins-mega-cab-4x4',
    make: 'ram',
    model: '2500',
    series: '2500',
    cab: 'mega',
    engine: 'cummins',
    drivetrain: '4x4',
    netEmptyWeight: createFleetWeightValue(8137, 'exact_build_match', {
      sourceLabel: 'RAM 2500 Cummins Mega Cab 4x4 ECS configuration default',
      confidence: FLEET_CONFIDENCE_TIERS.exact_build_match.default,
    }),
    gvwr: createFleetWeightValue(10000, 'manufacturer_spec', {
      sourceLabel: 'RAM 2500 common GVWR default, verify by door placard',
      confidence: FLEET_CONFIDENCE_TIERS.manufacturer_spec.min,
    }),
    confidenceTier: 'exact_build_match',
  },
  {
    id: 'toyota-tacoma-model-estimate',
    make: 'toyota',
    model: 'tacoma',
    netEmptyWeight: createFleetWeightValue(4700, 'ecs_default', {
      sourceLabel: 'Toyota Tacoma ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(5600, 'ecs_default', {
      sourceLabel: 'Toyota Tacoma ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'jeep-wrangler-model-estimate',
    make: 'jeep',
    model: 'wrangler',
    netEmptyWeight: createFleetWeightValue(4450, 'ecs_default', {
      sourceLabel: 'Jeep Wrangler ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(5400, 'ecs_default', {
      sourceLabel: 'Jeep Wrangler ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'ford-f-150-model-estimate',
    make: 'ford',
    model: 'f 150',
    netEmptyWeight: createFleetWeightValue(5200, 'ecs_default', {
      sourceLabel: 'Ford F-150 ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(7050, 'ecs_default', {
      sourceLabel: 'Ford F-150 ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'ford-bronco-model-estimate',
    make: 'ford',
    model: 'bronco',
    netEmptyWeight: createFleetWeightValue(4750, 'ecs_default', {
      sourceLabel: 'Ford Bronco ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(6100, 'ecs_default', {
      sourceLabel: 'Ford Bronco ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'chevrolet-colorado-model-estimate',
    make: 'chevrolet',
    model: 'colorado',
    netEmptyWeight: createFleetWeightValue(4550, 'ecs_default', {
      sourceLabel: 'Chevy Colorado ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(6100, 'ecs_default', {
      sourceLabel: 'Chevy Colorado ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'toyota-4runner-model-estimate',
    make: 'toyota',
    model: '4runner',
    netEmptyWeight: createFleetWeightValue(4750, 'ecs_default', {
      sourceLabel: 'Toyota 4Runner ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(6300, 'ecs_default', {
      sourceLabel: 'Toyota 4Runner ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
  {
    id: 'subaru-outback-model-estimate',
    make: 'subaru',
    model: 'outback',
    netEmptyWeight: createFleetWeightValue(3850, 'ecs_default', {
      sourceLabel: 'Subaru Outback ECS model estimate, verify by door placard',
      confidence: 72,
    }),
    gvwr: createFleetWeightValue(5026, 'ecs_default', {
      sourceLabel: 'Subaru Outback ECS GVWR estimate, verify by door placard',
      confidence: 72,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'ecs_estimate',
  },
];

const VEHICLE_CLASS_WEIGHT_DEFAULTS: Record<string, { baseWeightLb: number; gvwrLb: number; label: string }> = {
  truck: { baseWeightLb: 5200, gvwrLb: 7000, label: 'truck class' },
  pickup: { baseWeightLb: 5200, gvwrLb: 7000, label: 'pickup class' },
  suv: { baseWeightLb: 4400, gvwrLb: 5800, label: 'SUV class' },
  wagon: { baseWeightLb: 3800, gvwrLb: 5000, label: 'wagon class' },
  van: { baseWeightLb: 5600, gvwrLb: 7600, label: 'van class' },
  trailer: { baseWeightLb: 1800, gvwrLb: 3500, label: 'trailer class' },
  vehicle: { baseWeightLb: 4300, gvwrLb: 5600, label: 'vehicle class' },
};

export function clampFleetConfidence(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundLbs(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isFleetLoadZone(value: string | null | undefined): value is FleetLoadZone {
  return typeof value === 'string' && FLEET_LOAD_ZONE_SET.has(value);
}

export function toFleetLoadZone(value: string | null | undefined, fallback: FleetLoadZone = 'rearLow'): FleetLoadZone {
  if (isFleetLoadZone(value)) return value;
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('front')) return 'frontLow';
  if (normalized.includes('roof') || normalized.includes('rack')) return 'roof';
  if (normalized.includes('bed high') || normalized.includes('bed_high') || normalized.includes('upper')) return 'bedHigh';
  if (normalized.includes('bed')) return 'bedLow';
  if (normalized.includes('hitch')) return 'hitch';
  if (normalized.includes('trailer')) return 'trailer';
  if (normalized.includes('under')) return 'underbody';
  if (normalized.includes('cab') || normalized.includes('interior')) return 'cab';
  if (normalized.includes('rear')) return 'rearLow';
  return fallback;
}

export function normalizeFleetBuildUseCases(values: readonly string[] | null | undefined): FleetBuildUseCase[] {
  const normalized = (values ?? [])
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is FleetBuildUseCase => FLEET_BUILD_USE_CASE_SET.has(value));
  const unique = Array.from(new Set(normalized));
  return unique.length > 0 ? unique : ['daily'];
}

export function createFleetWeightValue(
  lbs: number | null | undefined,
  source: FleetWeightSource = 'unknown',
  options: {
    confidence?: number | null;
    sourceLabel?: string | null;
    verifiedAt?: string | null;
    verificationId?: string | null;
    allowNegative?: boolean;
  } = {},
): FleetWeightValue {
  const numeric = typeof lbs === 'number' && !Number.isNaN(lbs) ? lbs : 0;
  const weight = options.allowNegative ? numeric : Math.max(0, numeric);
  return {
    lbs: roundLbs(weight),
    source,
    confidence: clampFleetConfidence(options.confidence ?? DEFAULT_CONFIDENCE_BY_SOURCE[source]),
    sourceLabel: options.sourceLabel ?? null,
    verifiedAt: options.verifiedAt ?? null,
    verificationId: options.verificationId ?? null,
  };
}

export function mapLegacyWeightSource(source: string | null | undefined): FleetWeightSource {
  switch (source) {
    case 'measured':
      return 'scale_ticket';
    case 'manufacturer':
      return 'manufacturer_spec';
    case 'estimate':
      return 'user_estimate';
    default:
      return 'unknown';
  }
}

function normalizeConfigText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function configContains(value: string | number | null | undefined, token: string): boolean {
  return normalizeConfigText(value).split(' ').includes(token);
}

function normalizeVehicleConfig(input: {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  cab?: string | null;
  bedLength?: string | null;
  notes?: string | null;
}): {
  make: string;
  model: string;
  search: string;
  engine: string | null;
  drivetrain: string | null;
  cab: string | null;
  bedLength: string | null;
} {
  const search = normalizeConfigText([
    input.make,
    input.model,
    input.trim,
    input.engine,
    input.drivetrain,
    input.cab,
    input.bedLength,
    input.notes,
  ].filter(Boolean).join(' '));
  const engine =
    search.includes('cummins') || search.includes('diesel')
      ? 'cummins'
      : search.includes('gas') || search.includes('hemi') || search.includes('6 4')
        ? 'gas'
        : null;
  const drivetrain =
    search.includes('4x4') || search.includes('4wd') || search.includes('four wheel')
      ? '4x4'
      : search.includes('2wd') || search.includes('rwd')
        ? '2wd'
        : null;
  const cab = search.includes('mega cab') || search.includes('mega')
    ? 'mega'
    : search.includes('crew cab') || search.includes('crew')
      ? 'crew'
      : null;
  const bedLength = search.includes('short bed') || search.includes('short')
    ? 'short'
    : search.includes('long bed') || search.includes('long')
      ? 'long'
      : null;
  return {
    make: normalizeConfigText(input.make),
    model: normalizeConfigText(input.model),
    search,
    engine,
    drivetrain,
    cab,
    bedLength,
  };
}

function vehicleMakeMatches(configMake: string, search: string, itemMake: string): boolean {
  if (configMake === itemMake || search.includes(itemMake)) return true;
  const isChevy = itemMake === 'chevrolet' || itemMake === 'chevy';
  return isChevy && (configMake === 'chevy' || configMake === 'chevrolet' || search.includes('chevy') || search.includes('chevrolet'));
}

function resolveVehicleClassWeightDefault(vehicleType: string | null | undefined): VehicleWeightDefaultCatalogItem | null {
  const normalizedType = normalizeConfigText(vehicleType);
  const classKey =
    normalizedType.includes('truck') || normalizedType.includes('pickup')
      ? 'truck'
      : normalizedType.includes('suv') || normalizedType.includes('sport utility')
        ? 'suv'
        : normalizedType.includes('wagon')
          ? 'wagon'
          : normalizedType.includes('van')
            ? 'van'
            : normalizedType.includes('trailer')
              ? 'trailer'
              : normalizedType
                ? 'vehicle'
                : null;
  const classDefault = classKey ? VEHICLE_CLASS_WEIGHT_DEFAULTS[classKey] : null;
  if (!classDefault) return null;
  const resolvedClassKey = classKey ?? 'vehicle';
  return {
    id: `${resolvedClassKey}-class-estimate`,
    make: resolvedClassKey,
    model: resolvedClassKey,
    netEmptyWeight: createFleetWeightValue(classDefault.baseWeightLb, 'ecs_default', {
      sourceLabel: `${classDefault.label} ECS estimate, verify saved specs`,
      confidence: FLEET_CONFIDENCE_TIERS.vehicle_type_default.min,
    }),
    gvwr: createFleetWeightValue(classDefault.gvwrLb, 'ecs_default', {
      sourceLabel: `${classDefault.label} GVWR estimate, verify by door placard`,
      confidence: FLEET_CONFIDENCE_TIERS.vehicle_type_default.min,
    }),
    confidenceTier: 'vehicle_type_default',
    confidenceLevel: 'class_estimate',
    notes: 'Generic class estimate used only when no saved spec or model estimate is available.',
  };
}

export function resolveVehicleWeightDefault(input: {
  make?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  year?: number | null;
  trim?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  cab?: string | null;
  bedLength?: string | null;
  notes?: string | null;
}): VehicleWeightDefaultCatalogItem | null {
  const config = normalizeVehicleConfig(input);
  const scored = VEHICLE_WEIGHT_DEFAULTS_CATALOG
    .map((item) => {
      if (item.yearStart != null && input.year != null && input.year < item.yearStart) return null;
      if (item.yearEnd != null && input.year != null && input.year > item.yearEnd) return null;

      const makeMatches = vehicleMakeMatches(config.make, config.search, item.make);
      const modelMatches =
        config.model === item.model ||
        config.model.includes(item.model) ||
        config.search.includes(item.model) ||
        (item.series ? config.search.includes(item.series) : false);
      if (!makeMatches || !modelMatches) return null;

      let score = item.confidenceTier === 'vehicle_type_default' ? 10 : 20;
      const required: Array<[string | null | undefined, string | null]> = [
        [item.engine, config.engine],
        [item.drivetrain, config.drivetrain],
        [item.cab, config.cab],
        [item.bedLength, config.bedLength],
      ];
      for (const [expected, actual] of required) {
        if (!expected) continue;
        if (expected !== actual && !configContains(actual, expected)) return null;
        score += 10;
      }
      if (item.trim && !config.search.includes(normalizeConfigText(item.trim))) return null;
      if (item.trim) score += 5;
      return { item, score };
    })
    .filter((entry): entry is { item: VehicleWeightDefaultCatalogItem; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.item ?? resolveVehicleClassWeightDefault(input.vehicleType);
}

function cloneWeightValue(value: FleetWeightValue | null | undefined): FleetWeightValue | null {
  return value ? { ...value } : null;
}

const FLEET_FUEL_WEIGHT_LB_PER_GAL: Record<Exclude<FleetFuelType, 'unknown'>, number> = {
  diesel: 7.1,
  gas: 6.0,
};
const FLEET_WATER_WEIGHT_LB_PER_GAL = 8.34;

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeFuelType(value: unknown): FleetFuelType {
  return value === 'diesel' || value === 'gas' ? value : 'unknown';
}

function buildFleetResourceProfile(input: {
  vehicle: LegacyVehicleInput;
  specs?: LegacyVehicleSpecInput | null;
  consumables?: LegacyConsumablesInput | null;
  engine?: string | null;
}): FleetResourceProfile {
  const fuelTankCapacityGal = positiveNumber(input.specs?.fuel_tank_capacity_gal)
    ?? positiveNumber(input.vehicle.fuel_tank_capacity_gal);
  const fuelType =
    normalizeFuelType(input.specs?.fuel_type) !== 'unknown'
      ? normalizeFuelType(input.specs?.fuel_type)
      : normalizeFuelType(input.vehicle.fuel_type) !== 'unknown'
        ? normalizeFuelType(input.vehicle.fuel_type)
        : /diesel|cummins/i.test(input.engine ?? '')
          ? 'diesel'
          : fuelTankCapacityGal != null
            ? 'gas'
            : 'unknown';
  const directFuelGallons = nonNegativeNumber(input.consumables?.fuel_gal_current);
  const currentFuelPercent = nonNegativeNumber(input.consumables?.fuel_percent_current)
    ?? nonNegativeNumber(input.vehicle.current_fuel_percent);
  const boundedFuelPercent = currentFuelPercent == null ? null : Math.max(0, Math.min(100, currentFuelPercent));
  const currentFuelGallons =
    directFuelGallons != null
      ? directFuelGallons
      : fuelTankCapacityGal != null && boundedFuelPercent != null
      ? fuelTankCapacityGal * (boundedFuelPercent / 100)
      : 0;
  const currentFuelWeight = createFleetWeightValue(
    fuelType === 'unknown' ? 0 : currentFuelGallons * FLEET_FUEL_WEIGHT_LB_PER_GAL[fuelType],
    'calculated',
    {
      confidence: directFuelGallons != null || (fuelTankCapacityGal != null && boundedFuelPercent != null) ? 80 : 0,
      sourceLabel: directFuelGallons != null ? 'Current fuel gallons' : 'Fuel level and tank capacity',
    },
  );
  const waterCapacityGal = positiveNumber(input.vehicle.water_capacity_gal);
  const currentWaterGallons =
    nonNegativeNumber(input.consumables?.water_gal_current)
    ?? nonNegativeNumber(input.vehicle.current_water_gal)
    ?? 0;
  const currentWaterWeight = createFleetWeightValue(currentWaterGallons * FLEET_WATER_WEIGHT_LB_PER_GAL, 'calculated', {
    confidence: currentWaterGallons > 0 ? 80 : 0,
    sourceLabel: 'Current water gallons',
  });
  return {
    fuelTankCapacityGal,
    fuelType,
    currentFuelPercent: boundedFuelPercent,
    currentFuelGallons: roundLbs(currentFuelGallons),
    currentFuelWeight,
    waterCapacityGal,
    currentWaterGallons: roundLbs(currentWaterGallons),
    currentWaterWeight,
    consumablesWeight: sumFleetWeightValues(
      [currentFuelWeight, currentWaterWeight],
      'Fuel plus water consumables',
    ),
  };
}

export function sumFleetWeightValues(
  values: readonly (FleetWeightValue | null | undefined)[],
  sourceLabel: string,
): FleetWeightValue {
  const usable = values.filter((value): value is FleetWeightValue => Boolean(value));
  const lbs = usable.reduce((sum, value) => sum + Math.max(0, value.lbs), 0);
  const weightedConfidence =
    lbs > 0
      ? usable.reduce((sum, value) => sum + Math.max(0, value.lbs) * value.confidence, 0) / lbs
      : DEFAULT_CONFIDENCE_BY_SOURCE.calculated;
  return createFleetWeightValue(lbs, 'calculated', {
    confidence: weightedConfidence,
    sourceLabel,
  });
}

export function buildFleetDisplayMetadata(input: {
  title: string | null | undefined;
  subtitle?: string | null;
  vehicleType?: string | null;
  useCases?: readonly FleetBuildUseCase[] | null;
  statusText?: string | null;
  accentTone?: FleetDisplayMetadata['accentTone'];
}): FleetDisplayMetadata {
  const title = (input.title ?? 'Fleet vehicle').trim() || 'Fleet vehicle';
  const vehicleType = (input.vehicleType ?? 'vehicle').trim() || 'vehicle';
  const useCases = normalizeFleetBuildUseCases(input.useCases);
  return {
    iconKey: vehicleType.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'vehicle',
    title,
    subtitle: input.subtitle ?? null,
    classLabel: vehicleType,
    chips: [vehicleType, ...useCases].filter(Boolean),
    statusText: input.statusText ?? null,
    accentTone: input.accentTone ?? 'category',
  };
}

function emptyZoneWeightResult(zone: FleetLoadZone): FleetZoneWeightResult {
  const zero = createFleetWeightValue(0, 'calculated', { sourceLabel: `${zone} total` });
  return {
    zone,
    accessoryWeight: createFleetWeightValue(0, 'calculated', { sourceLabel: `${zone} accessories` }),
    loadoutWeight: createFleetWeightValue(0, 'calculated', { sourceLabel: `${zone} loadout` }),
    totalWeight: zero,
  };
}

function buildEmptyZoneWeights(): Record<FleetLoadZone, FleetZoneWeightResult> {
  return FLEET_LOAD_ZONES.reduce((acc, zone) => {
    acc[zone] = emptyZoneWeightResult(zone);
    return acc;
  }, {} as Record<FleetLoadZone, FleetZoneWeightResult>);
}

function riskFromShare(share: number): FleetRiskLevel {
  if (share >= 0.34) return 'critical';
  if (share >= 0.24) return 'caution';
  if (share >= 0.14) return 'watch';
  return 'clear';
}

function maxRisk(...levels: FleetRiskLevel[]): FleetRiskLevel {
  const rank: Record<FleetRiskLevel, number> = { clear: 0, watch: 1, caution: 2, critical: 3 };
  return levels.reduce((highest, level) => (rank[level] > rank[highest] ? level : highest), 'clear' as FleetRiskLevel);
}

function confidenceLevelForWeight(value: FleetWeightValue | null | undefined): FleetWeightConfidenceLevel {
  if (!value || value.lbs <= 0 || value.source === 'unknown') return 'unknown';
  if (value.source === 'scale_ticket' || value.source === 'vin_oem_match') return 'verified';
  if (value.source === 'manufacturer_spec' || value.source === 'exact_build_match') return 'catalog_estimate';
  if (value.source === 'ecs_default') {
    return normalizeConfigText(value.sourceLabel).includes('class') ? 'class_estimate' : 'ecs_estimate';
  }
  if (value.source === 'user_estimate') return 'ecs_estimate';
  return 'ecs_estimate';
}

function lowestWeightConfidenceLevel(levels: readonly FleetWeightConfidenceLevel[]): FleetWeightConfidenceLevel {
  const rank: Record<FleetWeightConfidenceLevel, number> = {
    verified: 5,
    catalog_estimate: 4,
    ecs_estimate: 3,
    class_estimate: 2,
    incomplete: 1,
    unknown: 0,
  };
  return levels.reduce((lowest, level) => (rank[level] < rank[lowest] ? level : lowest), levels[0] ?? 'unknown');
}

function copyForWeightConfidence(level: FleetWeightConfidenceLevel): Pick<FleetWeightConfidenceMetadata, 'label' | 'copy'> {
  switch (level) {
    case 'verified':
      return { label: 'Verified', copy: 'Weight profile uses verified vehicle specs.' };
    case 'catalog_estimate':
      return { label: 'Catalog estimate', copy: 'Weight profile uses catalog/spec data. Verify door placard when possible.' };
    case 'ecs_estimate':
      return { label: 'ECS estimate', copy: 'Weight profile is estimated from saved vehicle details. Confirm key specs for higher confidence.' };
    case 'class_estimate':
      return { label: 'Class estimate', copy: 'Weight profile uses generic vehicle-class values until specs are confirmed.' };
    case 'incomplete':
      return { label: 'Incomplete', copy: 'Weight profile is missing key specs. ECS will keep estimates conservative.' };
    default:
      return { label: 'Unknown', copy: 'Weight profile needs vehicle specs before payload confidence is available.' };
  }
}

function buildWeightValidationFlags(input: {
  baseNetWeight: FleetWeightValue;
  gvwr: FleetWeightValue | null;
  payloadRemaining: FleetWeightValue | null;
  payloadCapacity: FleetWeightValue | null;
  operatingWeight: FleetWeightValue;
}): FleetWeightValidationFlag[] {
  const flags: FleetWeightValidationFlag[] = [];
  if (input.baseNetWeight.lbs <= 0) {
    flags.push({ id: 'missing-base-weight', severity: 'warning', message: 'Base/curb weight is missing.' });
  }
  if (!input.gvwr || input.gvwr.lbs <= 0) {
    flags.push({ id: 'missing-gvwr', severity: 'warning', message: 'GVWR is missing.' });
  }
  if (input.gvwr && input.baseNetWeight.lbs > 0 && input.gvwr.lbs <= input.baseNetWeight.lbs) {
    flags.push({ id: 'gvwr-not-above-base-weight', severity: 'critical', message: 'GVWR must be above base/curb weight.' });
  }
  if (input.payloadCapacity && input.payloadCapacity.lbs > 10000) {
    const confirmed =
      input.gvwr?.source === 'scale_ticket' ||
      input.gvwr?.source === 'vin_oem_match' ||
      input.baseNetWeight.source === 'scale_ticket' ||
      input.baseNetWeight.source === 'vin_oem_match';
    if (!confirmed) {
      flags.push({
        id: 'payload-capacity-over-10000-unconfirmed',
        severity: 'warning',
        message: 'Payload capacity is over 10,000 lb and should be explicitly verified.',
      });
    }
  }
  if (input.payloadRemaining && input.payloadRemaining.lbs < 0) {
    flags.push({ id: 'gvwr-overage', severity: 'critical', message: 'Estimated operating weight exceeds GVWR.' });
  }
  if (input.operatingWeight.lbs <= 0) {
    flags.push({ id: 'operating-weight-unavailable', severity: 'warning', message: 'Operating weight could not be computed.' });
  }
  return flags;
}

function buildWeightConfidenceMetadata(input: {
  baseNetWeight: FleetWeightValue;
  gvwr: FleetWeightValue | null;
  installedAccessoryWeight: FleetWeightValue;
  activeLoadoutWeight: FleetWeightValue;
  consumablesWeight: FleetWeightValue;
  validationFlags: readonly FleetWeightValidationFlag[];
  confidence: number;
}): FleetWeightConfidenceMetadata {
  const hasMissingCore = input.baseNetWeight.lbs <= 0 || !input.gvwr || input.gvwr.lbs <= 0;
  const coreLevels = [
    confidenceLevelForWeight(input.baseNetWeight),
    confidenceLevelForWeight(input.gvwr),
  ];
  const level = hasMissingCore
    ? 'incomplete'
    : lowestWeightConfidenceLevel(coreLevels);
  const { label, copy } = copyForWeightConfidence(level);
  const reasons = [
    `Base weight source: ${input.baseNetWeight.sourceLabel ?? input.baseNetWeight.source}.`,
    `GVWR source: ${input.gvwr?.sourceLabel ?? input.gvwr?.source ?? 'missing'}.`,
    `Accessory confidence: ${input.installedAccessoryWeight.confidence}/100.`,
    `Loadout confidence: ${input.activeLoadoutWeight.confidence}/100.`,
    `Fuel/water confidence: ${input.consumablesWeight.confidence}/100.`,
    ...input.validationFlags.map((flag) => flag.message),
  ];
  return {
    level,
    label,
    copy,
    score: clampFleetConfidence(input.confidence),
    reasons: Array.from(new Set(reasons)),
  };
}

export function calculateFleetWeightResult(
  vehicle: FleetVehicle,
  accessories: readonly FleetAccessoryInstall[] = [],
  loadoutItems: readonly FleetLoadoutItem[] = [],
): FleetWeightResult {
  const baseNetWeight =
    vehicle.buildProfile.baseNetWeight ??
    vehicle.buildProfile.curbWeight ??
    vehicle.buildProfile.emptyWeight ??
    createFleetWeightValue(0, 'unknown', { confidence: 0, sourceLabel: 'Missing base vehicle weight' });

  const payloadAffectingAccessories = accessories.filter((accessory) => accessory.affectsPayload !== false);
  const installedAccessoryWeight = sumFleetWeightValues(
    payloadAffectingAccessories.map((accessory) => accessory.installedWeight),
    'Payload-bearing installed accessory weight',
  );
  const allInstalledAccessoryWeight = sumFleetWeightValues(
    accessories.map((accessory) => accessory.installedWeight),
    'Installed accessory weight for balance model',
  );
  const activeLoadoutWeight = sumFleetWeightValues(
    loadoutItems.map((item) =>
      createFleetWeightValue(item.weight.lbs * Math.max(1, item.quantity), item.weight.source, {
        confidence: item.weight.confidence,
        sourceLabel: item.weight.sourceLabel ?? item.name,
        verifiedAt: item.weight.verifiedAt,
        verificationId: item.weight.verificationId,
      }),
    ),
    'Active loadout weight',
  );
  const consumablesWeight =
    vehicle.buildProfile.resourceProfile?.consumablesWeight ??
    createFleetWeightValue(0, 'calculated', { confidence: 0, sourceLabel: 'Fuel plus water consumables' });
  const passengerWeight = createFleetWeightValue(0, 'unknown', {
    confidence: 0,
    sourceLabel: 'Passenger weight not modeled',
  });
  const operatingWeight = sumFleetWeightValues(
    [baseNetWeight, installedAccessoryWeight, passengerWeight, activeLoadoutWeight, consumablesWeight],
    'Base vehicle plus installed accessories plus passengers plus active loadout plus consumables',
  );
  const gvwr = vehicle.buildProfile.gvwr;
  const payloadCapacity =
    gvwr && baseNetWeight.lbs > 0
      ? createFleetWeightValue(gvwr.lbs - baseNetWeight.lbs, 'calculated', {
          allowNegative: true,
          confidence: Math.min(gvwr.confidence, baseNetWeight.confidence),
          sourceLabel: 'GVWR minus base/curb weight',
        })
      : null;
  const payloadRemaining = gvwr
    ? createFleetWeightValue(gvwr.lbs - operatingWeight.lbs, 'calculated', {
        allowNegative: true,
        confidence: Math.min(gvwr.confidence, operatingWeight.confidence),
        sourceLabel: 'GVWR minus operating weight',
      })
    : null;
  const gvwrUsagePct = gvwr && gvwr.lbs > 0 ? Math.round((operatingWeight.lbs / gvwr.lbs) * 1000) / 10 : null;

  const zoneWeights = buildEmptyZoneWeights();
  for (const zone of FLEET_LOAD_ZONES) {
    const zoneAccessories = accessories.filter((accessory) => accessory.loadZone === zone).map((accessory) => accessory.installedWeight);
    const zoneLoadout = loadoutItems
      .filter((item) => item.loadZone === zone)
      .map((item) =>
        createFleetWeightValue(item.weight.lbs * Math.max(1, item.quantity), item.weight.source, {
          confidence: item.weight.confidence,
          sourceLabel: item.weight.sourceLabel ?? item.name,
        }),
      );
    const accessoryWeight = sumFleetWeightValues(zoneAccessories, `${zone} accessories`);
    const loadoutWeight = sumFleetWeightValues(zoneLoadout, `${zone} loadout`);
    zoneWeights[zone] = {
      zone,
      accessoryWeight,
      loadoutWeight,
      totalWeight: sumFleetWeightValues([accessoryWeight, loadoutWeight], `${zone} total`),
    };
  }

  const loadedWeight = Math.max(1, allInstalledAccessoryWeight.lbs + activeLoadoutWeight.lbs);
  const topShare = (zoneWeights.roof.totalWeight.lbs + zoneWeights.bedHigh.totalWeight.lbs) / loadedWeight;
  const frontShare = zoneWeights.frontLow.totalWeight.lbs / loadedWeight;
  const rearShare =
    (zoneWeights.rearLow.totalWeight.lbs +
      zoneWeights.bedLow.totalWeight.lbs +
      zoneWeights.bedHigh.totalWeight.lbs +
      zoneWeights.hitch.totalWeight.lbs) /
    loadedWeight;

  const warnings: string[] = [];
  if (!vehicle.buildProfile.baseNetWeight) warnings.push('Base vehicle weight is missing.');
  if (!gvwr) warnings.push('GVWR is missing.');
  if (payloadRemaining && payloadRemaining.lbs < 0) warnings.push('Operating weight exceeds GVWR.');
  if (payloadCapacity && payloadCapacity.lbs > 10000) warnings.push('Payload capacity is unusually high; verify before relying on this estimate.');
  if (topShare >= 0.24) warnings.push('High-mounted load is increasing top-heavy risk.');
  if (frontShare >= 0.24) warnings.push('Front-low load may affect front axle behavior.');
  if (rearShare >= 0.24) warnings.push('Rear and hitch load may affect rear axle behavior.');
  const gvwrOverageRisk: FleetRiskLevel =
    payloadRemaining && payloadRemaining.lbs < 0
      ? 'critical'
      : gvwrUsagePct != null && gvwrUsagePct >= 95
        ? 'caution'
        : gvwrUsagePct != null && gvwrUsagePct >= 85
          ? 'watch'
          : 'clear';
  const confidence = clampFleetConfidence(
    gvwr
      ? (
          baseNetWeight.confidence +
          installedAccessoryWeight.confidence +
          activeLoadoutWeight.confidence +
          consumablesWeight.confidence +
          gvwr.confidence
        ) / 5
      : 0,
  );
  const validationFlags = buildWeightValidationFlags({
    baseNetWeight,
    gvwr,
    payloadRemaining,
    payloadCapacity,
    operatingWeight,
  });
  const confidenceMetadata = buildWeightConfidenceMetadata({
    baseNetWeight,
    gvwr,
    installedAccessoryWeight,
    activeLoadoutWeight,
    consumablesWeight,
    validationFlags,
    confidence,
  });

  return {
    vehicleId: vehicle.id,
    baseNetWeight,
    installedAccessoryWeight,
    passengerWeight,
    activeLoadoutWeight,
    consumablesWeight,
    operatingWeight,
    gvwr,
    payloadRemaining,
    payloadCapacity,
    gvwrUsagePct,
    zoneWeights,
    topHeavyRisk: riskFromShare(topShare),
    frontAxleRisk: riskFromShare(frontShare),
    rearAxleRisk: riskFromShare(rearShare),
    gvwrOverageRisk,
    confidence,
    confidenceMetadata,
    validationFlags,
    warnings: Array.from(new Set([...warnings, ...validationFlags.map((flag) => flag.message)])),
  };
}

export function scoreFleetVehicle(
  vehicle: FleetVehicle,
  weightResult: FleetWeightResult,
  checklistItems: readonly FleetChecklistItem[] = [],
): FleetScoringResult {
  const blockingIssues = [...weightResult.warnings.filter((warning) => warning.includes('missing') || warning.includes('exceeds'))];
  const incompleteRequired = checklistItems.filter((item) => item.isRequired && !item.isComplete);
  for (const item of incompleteRequired) {
    blockingIssues.push(`Required checklist incomplete: ${item.label}`);
  }

  const gvwrUsage = weightResult.gvwrUsagePct ?? 100;
  const payloadScore =
    weightResult.payloadRemaining == null
      ? 45
      : weightResult.payloadRemaining.lbs < 0
        ? 20
        : Math.max(40, Math.min(100, 120 - gvwrUsage));
  const checklistPenalty = Math.min(25, incompleteRequired.length * 8);
  const readinessScore = Math.max(0, Math.min(100, payloadScore - checklistPenalty));
  const confidenceScore = weightResult.confidence;
  const overallScore = clampFleetConfidence(readinessScore * 0.5 + payloadScore * 0.25 + confidenceScore * 0.25);
  const riskLevel = maxRisk(
    weightResult.topHeavyRisk,
    weightResult.frontAxleRisk,
    weightResult.rearAxleRisk,
    weightResult.gvwrOverageRisk,
  );
  const recommendations = [
    ...(weightResult.payloadRemaining && weightResult.payloadRemaining.lbs < 0 ? ['Reduce load before staging.'] : []),
    ...(weightResult.topHeavyRisk === 'caution' || weightResult.topHeavyRisk === 'critical'
      ? ['Move roof or bed-high weight lower when possible.']
      : []),
    ...(weightResult.confidence < 75 ? ['Verify base weight, GVWR, and major accessory weights.'] : []),
    ...(vehicle.buildProfile.useCases.includes('towing') && weightResult.zoneWeights.hitch.totalWeight.lbs > 0
      ? ['Review hitch and rear axle load before towing.']
      : []),
  ];

  return {
    vehicleId: vehicle.id,
    readinessScore,
    payloadScore: clampFleetConfidence(payloadScore),
    confidenceScore,
    overallScore,
    riskLevel,
    blockingIssues,
    recommendations,
    confidence: clampFleetConfidence((confidenceScore + overallScore) / 2),
  };
}

export function adaptLegacyVehicleToFleetVehicle(input: {
  vehicle: LegacyVehicleInput;
  specs?: LegacyVehicleSpecInput | null;
  consumables?: LegacyConsumablesInput | null;
  tiresLift?: LegacyTiresLiftInput | null;
  useCases?: readonly string[] | null;
  now?: string;
}): FleetVehicle {
  const { vehicle, specs = null } = input;
  const now = input.now ?? new Date().toISOString();
  const ownerUserId = vehicle.owner_user_id ?? vehicle.ownerUserId ?? 'local';
  const useCases = normalizeFleetBuildUseCases(input.useCases);
  const title = vehicle.name ?? ([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Fleet vehicle');
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || null;
  const weightDefault = resolveVehicleWeightDefault({
    make: vehicle.make,
    model: vehicle.model,
    vehicleType: vehicle.type,
    year: vehicle.year,
    trim: specs?.trim,
    engine: specs?.engine,
    drivetrain: specs?.drivetrain,
    cab: specs?.cab,
    bedLength: specs?.bed_length,
    notes: vehicle.notes,
  });
  const display = buildFleetDisplayMetadata({
    title,
    subtitle,
    vehicleType: vehicle.type ?? 'vehicle',
    useCases,
    accentTone: 'selected',
  });
  const tireSizeInches =
    positiveNumber(input.tiresLift?.tireSizeInches)
    ?? positiveNumber(specs?.tireSizeInches)
    ?? positiveNumber(specs?.tire_size_inches)
    ?? positiveNumber(vehicle.tire_size_inches);
  const suspensionLiftInches =
    nonNegativeNumber(input.tiresLift?.suspensionLiftInches)
    ?? nonNegativeNumber(specs?.suspensionLiftInches)
    ?? nonNegativeNumber(specs?.suspension_lift_inches)
    ?? nonNegativeNumber(vehicle.suspension_lift_inches);
  const frontLevelInches =
    positiveNumber(input.tiresLift?.frontLevelInches)
    ?? positiveNumber(specs?.frontLevelInches)
    ?? positiveNumber(specs?.front_level_inches)
    ?? positiveNumber(vehicle.front_level_inches);
  const resourceProfile = buildFleetResourceProfile({
    vehicle,
    specs,
    consumables: input.consumables,
    engine: specs?.engine,
  });
  const buildProfile: VehicleBuildProfile = {
    id: `${vehicle.id}:build`,
    vehicleId: vehicle.id,
    useCases,
    baseNetWeight:
      specs?.base_weight_lb != null
        ? createFleetWeightValue(specs.base_weight_lb, 'user_estimate', { sourceLabel: 'User-entered base weight' })
        : cloneWeightValue(weightDefault?.netEmptyWeight),
    curbWeight:
      specs?.curb_weight_lb != null
        ? createFleetWeightValue(specs.curb_weight_lb, 'user_estimate', { sourceLabel: 'User-entered curb weight' })
        : null,
    emptyWeight:
      specs?.empty_weight_lb != null
        ? createFleetWeightValue(specs.empty_weight_lb, 'user_estimate', { sourceLabel: 'User-entered empty weight' })
        : null,
    gvwr:
      specs?.gvwr_lb != null
        ? createFleetWeightValue(specs.gvwr_lb, 'user_estimate', { sourceLabel: 'User-entered GVWR' })
        : cloneWeightValue(weightDefault?.gvwr),
    frontBaseWeight:
      specs?.front_base_weight_lb != null
        ? createFleetWeightValue(specs.front_base_weight_lb, 'user_estimate', { sourceLabel: 'Legacy front base weight' })
        : cloneWeightValue(weightDefault?.frontBaseWeight),
    rearBaseWeight:
      specs?.rear_base_weight_lb != null
        ? createFleetWeightValue(specs.rear_base_weight_lb, 'user_estimate', { sourceLabel: 'Legacy rear base weight' })
        : cloneWeightValue(weightDefault?.rearBaseWeight),
    frontGawr:
      specs?.front_gawr_lb != null
        ? createFleetWeightValue(specs.front_gawr_lb, 'user_estimate', { sourceLabel: 'Legacy front GAWR' })
        : cloneWeightValue(weightDefault?.frontGawr),
    rearGawr:
      specs?.rear_gawr_lb != null
        ? createFleetWeightValue(specs.rear_gawr_lb, 'user_estimate', { sourceLabel: 'Legacy rear GAWR' })
        : cloneWeightValue(weightDefault?.rearGawr),
    wheelbaseIn: positiveNumber(specs?.wheelbase_in) ?? positiveNumber(vehicle.wheelbase_in),
    tireSizeInches,
    tireWidthInches:
      positiveNumber(input.tiresLift?.tireWidthInches)
      ?? positiveNumber(specs?.tireWidthInches)
      ?? positiveNumber(specs?.tire_width_inches)
      ?? positiveNumber(vehicle.tire_width_inches),
    wheelDiameterInches:
      positiveNumber(input.tiresLift?.wheelDiameterInches)
      ?? positiveNumber(specs?.wheelDiameterInches)
      ?? positiveNumber(specs?.wheel_diameter_inches)
      ?? positiveNumber(vehicle.wheel_diameter_inches),
    tireModel: input.tiresLift?.tireModel ?? specs?.tireModel ?? specs?.tire_model ?? vehicle.tire_model ?? null,
    suspensionLiftInches,
    isLeveled: input.tiresLift?.isLeveled ?? specs?.isLeveled ?? specs?.is_leveled ?? vehicle.is_leveled ?? null,
    frontLevelInches,
    groundClearanceInches:
      positiveNumber(specs?.groundClearanceInches)
      ?? positiveNumber(specs?.ground_clearance_inches)
      ?? positiveNumber(vehicle.ground_clearance_inches),
    resourceProfile,
    drivetrain: specs?.drivetrain ?? null,
    engine: specs?.engine ?? null,
    trim: specs?.trim ?? null,
    display,
    updatedAt: vehicle.updated_at ?? now,
  };

  return {
    id: vehicle.id,
    ownerUserId,
    nickname: title,
    vehicleType: vehicle.type ?? 'vehicle',
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: specs?.trim ?? null,
    notes: vehicle.notes ?? null,
    buildProfile,
    display,
    legacyVehicleId: vehicle.id,
    createdAt: vehicle.created_at ?? now,
    updatedAt: vehicle.updated_at ?? now,
  };
}

export function adaptLegacyLoadoutItemToFleetLoadoutItem(
  legacyItem: LegacyLoadoutItemInput,
  vehicleId: string,
): FleetLoadoutItem {
  const source = mapLegacyWeightSource(legacyItem.weight_source);
  const quantity = Math.max(1, legacyItem.quantity ?? 1);
  const loadZone = toFleetLoadZone(legacyItem.storage_location, 'rearLow');
  const name = legacyItem.name ?? 'Loadout item';
  return {
    id: legacyItem.id,
    vehicleId,
    loadoutId: legacyItem.loadout_id ?? null,
    name,
    category: legacyItem.category ?? 'general',
    quantity,
    weight: createFleetWeightValue(legacyItem.weight_lbs ?? 0, source, {
      sourceLabel: legacyItem.weight_source ?? 'Legacy loadout weight',
    }),
    loadZone,
    compartmentId: legacyItem.storage_location ?? null,
    isCritical: Boolean(legacyItem.is_critical),
    isPacked: Boolean(legacyItem.is_packed),
    notes: legacyItem.notes ?? null,
    display: buildFleetDisplayMetadata({
      title: name,
      subtitle: legacyItem.category ?? null,
      vehicleType: loadZone,
      useCases: ['daily'],
      accentTone: legacyItem.is_critical ? 'warning' : 'category',
    }),
  };
}

export function adaptLegacyCompartmentToFleetCompartment(
  legacyZone: LegacyZoneInput,
  vehicleId: string,
): FleetCompartment {
  const loadZone = toFleetLoadZone(`${legacyZone.zone_type ?? ''} ${legacyZone.name ?? ''}`, 'rearLow');
  const name = legacyZone.name ?? 'Compartment';
  return {
    id: legacyZone.id,
    vehicleId: legacyZone.vehicle_id ?? vehicleId,
    name,
    loadZone,
    parentCompartmentId: legacyZone.parent_zone_id ?? null,
    sortOrder: legacyZone.sort_order ?? 0,
    capacityWeight:
      legacyZone.zone_weight_total != null
        ? createFleetWeightValue(legacyZone.zone_weight_total, 'user_estimate', { sourceLabel: 'Legacy zone capacity' })
        : null,
    display: buildFleetDisplayMetadata({
      title: name,
      subtitle: loadZone,
      vehicleType: legacyZone.zone_type ?? loadZone,
      useCases: ['daily'],
    }),
  };
}

export function adaptLegacyFleetData(input: LegacyFleetAdapterInput): {
  vehicle: FleetVehicle;
  compartments: FleetCompartment[];
  loadoutItems: FleetLoadoutItem[];
  weightResult: FleetWeightResult;
  scoringResult: FleetScoringResult;
} {
  const vehicle = adaptLegacyVehicleToFleetVehicle({
    vehicle: input.vehicle,
    specs: input.specs,
    useCases: input.useCases,
    now: input.now,
  });
  const compartments = (input.compartments ?? []).map((zone) => adaptLegacyCompartmentToFleetCompartment(zone, vehicle.id));
  const loadoutItems = (input.loadoutItems ?? []).map((item) => adaptLegacyLoadoutItemToFleetLoadoutItem(item, vehicle.id));
  const weightResult = calculateFleetWeightResult(vehicle, [], loadoutItems);
  const scoringResult = scoreFleetVehicle(vehicle, weightResult, []);
  return {
    vehicle,
    compartments,
    loadoutItems,
    weightResult,
    scoringResult,
  };
}

export function generateFleetFabricPayload(input: {
  vehicle: FleetVehicle;
  accessories?: readonly FleetAccessoryInstall[] | null;
  compartments?: readonly FleetCompartment[] | null;
  loadoutItems?: readonly FleetLoadoutItem[] | null;
  checklistItems?: readonly FleetChecklistItem[] | null;
  weightResult?: FleetWeightResult | null;
  scoringResult?: FleetScoringResult | null;
  generatedAt?: string;
}): FleetFabricPayload {
  const accessories = [...(input.accessories ?? [])];
  const compartments = [...(input.compartments ?? [])];
  const loadoutItems = [...(input.loadoutItems ?? [])];
  const checklistItems = [...(input.checklistItems ?? [])];
  const weight = input.weightResult ?? calculateFleetWeightResult(input.vehicle, accessories, loadoutItems);
  const scoring = input.scoringResult ?? scoreFleetVehicle(input.vehicle, weight, checklistItems);
  return {
    schemaVersion: 'fleet.fabric.v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    vehicle: {
      id: input.vehicle.id,
      ownerUserId: input.vehicle.ownerUserId,
      nickname: input.vehicle.nickname,
      vehicleType: input.vehicle.vehicleType,
      year: input.vehicle.year ?? null,
      make: input.vehicle.make ?? null,
      model: input.vehicle.model ?? null,
      trim: input.vehicle.trim ?? null,
      display: input.vehicle.display,
    },
    build: input.vehicle.buildProfile,
    accessories,
    compartments,
    loadoutItems,
    checklistItems,
    weight,
    scoring,
  };
}
