import type { Vehicle } from '../types';
import type { VehicleSpec } from '../vehicleSpecStore';
import type { ConsumablesState } from '../consumablesStore';
import type { TiresLiftConfig } from '../tiresLiftStore';
import {
  adaptLegacyVehicleToFleetVehicle,
  calculateFleetWeightResult,
  scoreFleetVehicle,
  type FleetRiskLevel,
  type FleetVehicle,
  type FleetWeightSource,
} from './fleetPremiumDomain';
import {
  buildFleetAccessoryInstall,
  buildFleetCompartmentLoadoutItem,
  createEmptyFleetBuildLoadoutState,
  normalizeFleetBuildLoadoutState,
  toFleetAccessoryInstalls,
  toFleetCompartmentLoadoutItems,
  upsertFleetAccessoryInstall,
  upsertFleetCompartmentLoadoutItem,
  type FleetAccessoryId,
  type FleetBuildCompartment,
  type FleetBuildLoadoutState,
  type FleetLoadoutPresetId,
} from './fleetBuildLoadout';
import { buildFleetWeightSummary, type FleetWeightSummary } from './fleetWeightSummary';
import { buildLoadoutConsequencePreview, type LoadoutConsequencePreview } from './loadoutConsequencePreview';
import { migrateLegacyVehicleToFleetPremium } from './fleetMigration';

export const FLEET_QA_PRELOAD_STATE_IDS = [
  'zero_vehicle',
  'two_vehicle_active_switch',
  'verified_vs_estimated_weight',
  'payload_pressure',
  'offline_restore_migration',
] as const;

export type FleetQaPreloadStateId = (typeof FLEET_QA_PRELOAD_STATE_IDS)[number];

type FleetQaVehicle = Vehicle & {
  wizard_config?: Record<string, unknown>;
};

export type FleetQaExpectedState = {
  vehicleId: string;
  label: string;
  baseWeightSource: FleetWeightSource;
  confidenceLevel: FleetWeightSummary['confidenceLevel'];
  confidenceScore: number;
  operatingWeightLb: number;
  payloadRemainingLb: number | null;
  payloadRiskLevel: FleetRiskLevel;
  topHeavyRisk: FleetRiskLevel;
};

export type FleetQaOfflineRestoreState = {
  cached: boolean;
  stale: boolean;
  sourceLabel: string;
  requiresNetwork: boolean;
  migrationVersion: string | null;
};

export type FleetQaPreloadPlan = {
  id: FleetQaPreloadStateId;
  label: string;
  activeVehicleId: string | null;
  activeSwitchSequence: string[];
  vehicles: FleetQaVehicle[];
  specs: Record<string, VehicleSpec>;
  consumables: Record<string, ConsumablesState>;
  tiresLift: Record<string, TiresLiftConfig>;
  buildLoadout: Record<string, FleetBuildLoadoutState>;
  expectedStates: FleetQaExpectedState[];
  previews: Record<string, LoadoutConsequencePreview>;
  offlineRestore: FleetQaOfflineRestoreState;
  evidenceTargets: string[];
  destructive: true;
};

export type FleetQaPreloadApplyAdapter = {
  waitForHydration?: () => Promise<unknown> | unknown;
  getExistingVehicles: () => Promise<Array<Pick<Vehicle, 'id'>>> | Array<Pick<Vehicle, 'id'>>;
  deleteVehicle: (vehicleId: string) => Promise<unknown> | unknown;
  importVehicles: (vehicles: FleetQaVehicle[]) => Promise<unknown> | unknown;
  setSpec: (vehicleId: string, spec: VehicleSpec) => Promise<unknown> | unknown;
  removeSpec?: (vehicleId: string) => Promise<unknown> | unknown;
  setConsumables: (vehicleId: string, state: ConsumablesState) => Promise<unknown> | unknown;
  removeConsumables?: (vehicleId: string) => Promise<unknown> | unknown;
  setTiresLift: (vehicleId: string, state: TiresLiftConfig) => Promise<unknown> | unknown;
  removeTiresLift?: (vehicleId: string) => Promise<unknown> | unknown;
  setActiveVehicleId: (vehicleId: string) => Promise<unknown> | unknown;
  clearActiveVehicleId: () => Promise<unknown> | unknown;
  flush?: () => Promise<unknown> | unknown;
};

export type FleetQaPreloadApplyResult = {
  plan: FleetQaPreloadPlan;
  activeVehicleId: string | null;
  clearedVehicleCount: number;
  importedVehicleCount: number;
};

const QA_NOW = '2026-06-12T12:00:00.000Z';
const QA_OLD_CACHE = '2026-05-30T15:30:00.000Z';

const EMPTY_OFFLINE_RESTORE: FleetQaOfflineRestoreState = {
  cached: false,
  stale: false,
  sourceLabel: 'QA preload local state',
  requiresNetwork: false,
  migrationVersion: null,
};

function vehicleRecord(input: {
  id: string;
  name: string;
  type?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  fuelTankGal?: number | null;
  fuelPercent?: number | null;
  waterCapacityGal?: number | null;
  waterGal?: number | null;
  fuelType?: 'diesel' | 'gas' | null;
  baseWeightLb?: number | null;
  gvwrLb?: number | null;
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  isLeveled?: boolean | null;
  frontLevelInches?: number | null;
  wizardConfig?: Record<string, unknown>;
}): FleetQaVehicle {
  return {
    id: input.id,
    owner_user_id: 'local',
    name: input.name,
    type: input.type ?? 'truck',
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
    notes: input.notes ?? null,
    fuel_tank_capacity_gal: input.fuelTankGal ?? null,
    avg_mpg: null,
    current_fuel_percent: input.fuelPercent ?? 0,
    water_capacity_gal: input.waterCapacityGal ?? null,
    current_water_gal: input.waterGal ?? 0,
    water_updated_at: QA_NOW,
    battery_usable_wh: null,
    fuel_type: input.fuelType ?? null,
    base_weight_lb: input.baseWeightLb ?? null,
    curb_weight_lb: null,
    empty_weight_lb: null,
    gvwr_lb: input.gvwrLb ?? null,
    front_base_weight_lb: null,
    rear_base_weight_lb: null,
    front_gawr_lb: null,
    rear_gawr_lb: null,
    wheelbase_in: null,
    tire_size_inches: input.tireSizeInches ?? null,
    tire_width_inches: null,
    wheel_diameter_inches: null,
    tire_model: null,
    suspension_lift_inches: input.suspensionLiftInches ?? 0,
    is_leveled: input.isLeveled ?? false,
    front_level_inches: input.frontLevelInches ?? null,
    ground_clearance_inches: null,
    overall_length_in: null,
    overall_width_in: null,
    overall_height_in: null,
    track_width_front_in: null,
    track_width_rear_in: null,
    approach_angle_deg: null,
    breakover_angle_deg: null,
    departure_angle_deg: null,
    turning_diameter_ft: null,
    created_at: QA_NOW,
    updated_at: QA_NOW,
    ...(input.wizardConfig ? { wizard_config: input.wizardConfig } : {}),
  };
}

function spec(input: {
  gvwrLb: number;
  baseWeightLb: number;
  baseSource?: FleetWeightSource;
  baseConfidence?: number;
  gvwrSource?: FleetWeightSource;
  gvwrConfidence?: number;
  fuelTankGal?: number;
  fuelType?: 'diesel' | 'gas';
  trim?: string;
  engine?: string;
  drivetrain?: string;
  cab?: string;
  bedLength?: string;
  wheelbaseIn?: number;
}): VehicleSpec {
  return {
    gvwr_lb: input.gvwrLb,
    base_weight_lb: input.baseWeightLb,
    base_weight_source: input.baseSource ?? 'user_estimate',
    base_weight_confidence: input.baseConfidence,
    gvwr_source: input.gvwrSource ?? 'manufacturer_spec',
    gvwr_confidence: input.gvwrConfidence,
    fuel_tank_capacity_gal: input.fuelTankGal ?? 21,
    fuel_type: input.fuelType ?? 'gas',
    trim: input.trim,
    engine: input.engine,
    drivetrain: input.drivetrain,
    cab: input.cab,
    bed_length: input.bedLength,
    wheelbase_in: input.wheelbaseIn,
  };
}

function consumables(input: {
  fuelPercent?: number;
  fuelGal?: number | null;
  waterGal?: number;
  observedAt?: number;
} = {}): ConsumablesState {
  const observedAt = input.observedAt ?? Date.parse(QA_NOW);
  return {
    fuel_percent_current: input.fuelPercent ?? 0,
    fuel_gal_current: input.fuelGal ?? null,
    fuel_source: 'manual',
    fuel_gal_updated_at: observedAt,
    water_gal_current: input.waterGal ?? 0,
    water_source: 'manual',
    water_updated_at: observedAt,
    alternate_fluid_label: null,
    alternate_fluid_unit: null,
    alternate_fluid_current: null,
    alternate_fluid_capacity: null,
    alternate_fluid_source: 'manual',
    alternate_fluid_updated_at: null,
  };
}

function tiresLift(input: Partial<TiresLiftConfig> = {}): TiresLiftConfig {
  return {
    tireSizeInches: input.tireSizeInches ?? 33,
    suspensionLiftInches: input.suspensionLiftInches ?? 0,
    isLeveled: input.isLeveled ?? false,
    frontLevelInches: input.frontLevelInches ?? null,
    tireWidthInches: input.tireWidthInches,
    wheelDiameterInches: input.wheelDiameterInches,
    tireModel: input.tireModel,
    updatedAt: input.updatedAt ?? QA_NOW,
  };
}

function payloadRiskLevel(payloadRemainingLb: number | null, gvwrLb: number | null): FleetRiskLevel {
  if (payloadRemainingLb == null || gvwrLb == null || gvwrLb <= 0) return 'watch';
  if (payloadRemainingLb < 0) return 'critical';
  const margin = payloadRemainingLb / gvwrLb;
  if (margin <= 0.05) return 'critical';
  if (margin <= 0.1) return 'caution';
  if (margin <= 0.15) return 'watch';
  return 'clear';
}

function addAccessory(
  state: FleetBuildLoadoutState,
  vehicleId: string,
  accessoryId: FleetAccessoryId,
  options: {
    weightLb?: number;
    source?: FleetWeightSource;
    confidence?: number;
  } = {},
): FleetBuildLoadoutState {
  const install = buildFleetAccessoryInstall({
    accessoryId,
    vehicleId,
    knowledgeMode: options.weightLb != null ? 'manual_weight' : 'estimate',
    manualWeightLb: options.weightLb,
  });
  return upsertFleetAccessoryInstall(state, {
    ...install,
    source: options.source ?? install.source,
    confidence: options.confidence ?? install.confidence,
  });
}

function activeCompartment(
  state: FleetBuildLoadoutState,
  loadZone: FleetBuildCompartment['loadZone'],
): FleetBuildCompartment {
  const compartment = state.compartments.find((item) => item.status === 'active' && item.loadZone === loadZone)
    ?? state.compartments.find((item) => item.status === 'active');
  if (!compartment) {
    throw new Error(`Fleet QA preload missing active compartment for ${loadZone}.`);
  }
  return compartment;
}

function addLoadoutItem(
  state: FleetBuildLoadoutState,
  input: {
    vehicleId: string;
    id: string;
    name: string;
    category: string;
    weightLb: number;
    quantity?: number;
    loadZone: FleetBuildCompartment['loadZone'];
    source?: FleetWeightSource;
    confidence?: number;
    presetId?: FleetLoadoutPresetId;
  },
): FleetBuildLoadoutState {
  const compartment = activeCompartment(state, input.loadZone);
  const item = buildFleetCompartmentLoadoutItem({
    vehicleId: input.vehicleId,
    name: input.name,
    category: input.category,
    typicalWeightLb: input.weightLb,
    quantity: input.quantity ?? 1,
    compartment,
    loadZone: input.loadZone,
    source: input.source ?? 'user_estimate',
    confidence: input.confidence ?? 62,
    presetId: input.presetId ?? 'custom',
  });
  return upsertFleetCompartmentLoadoutItem(state, {
    ...item,
    id: input.id,
  });
}

function seedState(input: {
  vehicle: FleetQaVehicle;
  spec?: VehicleSpec | null;
  consumables?: ConsumablesState | null;
  tiresLift?: TiresLiftConfig | null;
  buildLoadout?: FleetBuildLoadoutState | null;
  useCases?: readonly string[];
}): {
  fleetVehicle: FleetVehicle;
  buildLoadout: FleetBuildLoadoutState;
  expected: FleetQaExpectedState;
} {
  const fleetVehicle = adaptLegacyVehicleToFleetVehicle({
    vehicle: input.vehicle,
    specs: input.spec as any,
    consumables: input.consumables as any,
    tiresLift: input.tiresLift as any,
    useCases: input.useCases ?? ['overland'],
    now: QA_NOW,
  });
  const buildLoadout = normalizeFleetBuildLoadoutState(input.buildLoadout);
  const accessories = toFleetAccessoryInstalls(buildLoadout, fleetVehicle.id);
  const loadoutItems = toFleetCompartmentLoadoutItems(buildLoadout, fleetVehicle.id);
  const weight = calculateFleetWeightResult(fleetVehicle, accessories, loadoutItems);
  const scoring = scoreFleetVehicle(fleetVehicle, weight, []);
  const summary = buildFleetWeightSummary(fleetVehicle, weight, scoring);
  return {
    fleetVehicle,
    buildLoadout,
    expected: {
      vehicleId: input.vehicle.id,
      label: input.vehicle.name,
      baseWeightSource: weight.baseNetWeight.source,
      confidenceLevel: summary.confidenceLevel,
      confidenceScore: summary.confidenceScore,
      operatingWeightLb: summary.operatingWeightLb,
      payloadRemainingLb: summary.payloadRemainingLb,
      payloadRiskLevel: payloadRiskLevel(summary.payloadRemainingLb, summary.gvwrLb),
      topHeavyRisk: weight.topHeavyRisk,
    },
  };
}

function planBase(
  id: FleetQaPreloadStateId,
  label: string,
  evidenceTargets: string[],
  overrides: Partial<FleetQaPreloadPlan>,
): FleetQaPreloadPlan {
  return {
    id,
    label,
    activeVehicleId: null,
    activeSwitchSequence: [],
    vehicles: [],
    specs: {},
    consumables: {},
    tiresLift: {},
    buildLoadout: {},
    expectedStates: [],
    previews: {},
    offlineRestore: EMPTY_OFFLINE_RESTORE,
    evidenceTargets,
    destructive: true,
    ...overrides,
  };
}

function buildTwoVehiclePlan(): FleetQaPreloadPlan {
  const ramSpec = spec({
    gvwrLb: 10190,
    baseWeightLb: 7742,
    baseSource: 'exact_build_match',
    baseConfidence: 84,
    gvwrSource: 'manufacturer_spec',
    gvwrConfidence: 91,
    fuelTankGal: 31,
    fuelType: 'diesel',
    trim: 'Cummins Crew 4x4 Short Bed',
    engine: '6.7L Cummins',
    drivetrain: '4x4',
    cab: 'Crew Cab',
    bedLength: 'Short Bed',
    wheelbaseIn: 149,
  });
  const broncoSpec = spec({
    gvwrLb: 5700,
    baseWeightLb: 4700,
    baseSource: 'manufacturer_spec',
    baseConfidence: 91,
    gvwrSource: 'manufacturer_spec',
    gvwrConfidence: 91,
    fuelTankGal: 20.8,
    fuelType: 'gas',
    trim: 'Badlands',
    engine: '2.7L',
    drivetrain: '4x4',
    wheelbaseIn: 116,
  });
  const vehicles = [
    vehicleRecord({
      id: 'fleet-qa-ram-lead',
      name: 'QA Lead RAM',
      make: 'RAM',
      model: '2500',
      year: 2024,
      fuelTankGal: 31,
      fuelPercent: 64,
      waterCapacityGal: 18,
      waterGal: 6,
      fuelType: 'diesel',
      baseWeightLb: 7742,
      gvwrLb: 10190,
      tireSizeInches: 37,
      isLeveled: true,
      frontLevelInches: 2,
    }),
    vehicleRecord({
      id: 'fleet-qa-bronco-scout',
      name: 'QA Scout Bronco',
      type: 'suv_van',
      make: 'Ford',
      model: 'Bronco',
      year: 2024,
      fuelTankGal: 20.8,
      fuelPercent: 48,
      waterCapacityGal: 8,
      waterGal: 2,
      fuelType: 'gas',
      baseWeightLb: 4700,
      gvwrLb: 5700,
      tireSizeInches: 35,
      suspensionLiftInches: 1,
    }),
  ];
  const specs: Record<string, VehicleSpec> = {
    'fleet-qa-ram-lead': ramSpec,
    'fleet-qa-bronco-scout': broncoSpec,
  };
  const consumableStates: Record<string, ConsumablesState> = {
    'fleet-qa-ram-lead': consumables({ fuelPercent: 64, waterGal: 6 }),
    'fleet-qa-bronco-scout': consumables({ fuelPercent: 48, waterGal: 2 }),
  };
  const tireStates: Record<string, TiresLiftConfig> = {
    'fleet-qa-ram-lead': tiresLift({ tireSizeInches: 37, isLeveled: true, frontLevelInches: 2 }),
    'fleet-qa-bronco-scout': tiresLift({ tireSizeInches: 35, suspensionLiftInches: 1 }),
  };
  return planBase('two_vehicle_active_switch', 'Two Vehicle Active Switch', ['multi-vehicle-switch'], {
    activeVehicleId: 'fleet-qa-ram-lead',
    activeSwitchSequence: ['fleet-qa-ram-lead', 'fleet-qa-bronco-scout'],
    vehicles,
    specs,
    consumables: consumableStates,
    tiresLift: tireStates,
    expectedStates: vehicles.map((vehicle) => seedState({
      vehicle,
      spec: specs[vehicle.id],
      consumables: consumableStates[vehicle.id],
      tiresLift: tireStates[vehicle.id],
    }).expected),
  });
}

function buildWeightEvidencePlan(): FleetQaPreloadPlan {
  const verifiedSpec = spec({
    gvwrLb: 10190,
    baseWeightLb: 7880,
    baseSource: 'scale_ticket',
    baseConfidence: 98,
    gvwrSource: 'vin_oem_match',
    gvwrConfidence: 95,
    fuelTankGal: 31,
    fuelType: 'diesel',
    trim: 'Cummins Crew 4x4 Short Bed',
    engine: '6.7L Cummins',
    drivetrain: '4x4',
    cab: 'Crew Cab',
    bedLength: 'Short Bed',
  });
  const estimatedSpec = spec({
    gvwrLb: 5600,
    baseWeightLb: 4380,
    baseSource: 'ecs_default',
    baseConfidence: 66,
    gvwrSource: 'ecs_default',
    gvwrConfidence: 66,
    fuelTankGal: 21.1,
    fuelType: 'gas',
    trim: 'Estimated trim',
  });
  const vehicles = [
    vehicleRecord({
      id: 'fleet-qa-scale-ticket',
      name: 'QA Scale Ticket Rig',
      make: 'RAM',
      model: '2500',
      year: 2024,
      fuelTankGal: 31,
      fuelPercent: 70,
      waterCapacityGal: 16,
      waterGal: 4,
      fuelType: 'diesel',
      baseWeightLb: 7880,
      gvwrLb: 10190,
      wizardConfig: {
        fleet_weight_verifications: [{
          id: 'qa-scale-ticket-base',
          target: 'baseNetWeight',
          weightLb: 7880,
          method: 'scale_ticket',
          sourceLabel: 'QA scale ticket base weight',
          recordedAt: QA_NOW,
          confidence: 98,
        }],
      },
    }),
    vehicleRecord({
      id: 'fleet-qa-estimated',
      name: 'QA Estimated Tacoma',
      make: 'Toyota',
      model: 'Tacoma',
      year: 2024,
      fuelTankGal: 21.1,
      fuelPercent: 55,
      waterCapacityGal: 8,
      waterGal: 0,
      fuelType: 'gas',
      baseWeightLb: 4380,
      gvwrLb: 5600,
    }),
  ];
  const specs: Record<string, VehicleSpec> = {
    'fleet-qa-scale-ticket': verifiedSpec,
    'fleet-qa-estimated': estimatedSpec,
  };
  const consumableStates: Record<string, ConsumablesState> = {
    'fleet-qa-scale-ticket': consumables({ fuelPercent: 70, waterGal: 4 }),
    'fleet-qa-estimated': consumables({ fuelPercent: 55, waterGal: 0 }),
  };
  const tireStates: Record<string, TiresLiftConfig> = {
    'fleet-qa-scale-ticket': tiresLift({ tireSizeInches: 35 }),
    'fleet-qa-estimated': tiresLift({ tireSizeInches: 33 }),
  };
  return planBase('verified_vs_estimated_weight', 'Verified vs Estimated Weight', ['profile-source-confidence', 'scale-ticket-profile'], {
    activeVehicleId: 'fleet-qa-scale-ticket',
    activeSwitchSequence: ['fleet-qa-scale-ticket', 'fleet-qa-estimated'],
    vehicles,
    specs,
    consumables: consumableStates,
    tiresLift: tireStates,
    expectedStates: vehicles.map((vehicle) => seedState({
      vehicle,
      spec: specs[vehicle.id],
      consumables: consumableStates[vehicle.id],
      tiresLift: tireStates[vehicle.id],
    }).expected),
  });
}

function buildPayloadPressurePlan(): FleetQaPreloadPlan {
  const vehicleId = 'fleet-qa-payload-pressure';
  let buildLoadout = createEmptyFleetBuildLoadoutState();
  for (const accessoryId of ['truck_cap_smartcap', 'bed_drawers_storage', 'roof_rack_platform', 'recovery_gear_mounts', 'winch'] as FleetAccessoryId[]) {
    buildLoadout = addAccessory(buildLoadout, vehicleId, accessoryId);
  }
  buildLoadout = addLoadoutItem(buildLoadout, {
    vehicleId,
    id: `${vehicleId}:roof-tent`,
    name: 'QA roof tent',
    category: 'camp',
    weightLb: 225,
    loadZone: 'roof',
    source: 'user_estimate',
  });
  buildLoadout = addLoadoutItem(buildLoadout, {
    vehicleId,
    id: `${vehicleId}:water-cases`,
    name: 'QA water cases',
    category: 'water',
    weightLb: 100,
    quantity: 3,
    loadZone: 'bedHigh',
    source: 'ecs_default',
  });
  buildLoadout = addLoadoutItem(buildLoadout, {
    vehicleId,
    id: `${vehicleId}:tool-rolls`,
    name: 'QA tool rolls',
    category: 'tools',
    weightLb: 180,
    quantity: 2,
    loadZone: 'bedLow',
    source: 'user_estimate',
  });
  buildLoadout = addLoadoutItem(buildLoadout, {
    vehicleId,
    id: `${vehicleId}:hitch-recovery`,
    name: 'QA hitch recovery kit',
    category: 'recovery',
    weightLb: 170,
    loadZone: 'hitch',
    source: 'user_estimate',
  });

  const vehicle = vehicleRecord({
    id: vehicleId,
    name: 'QA Payload Pressure RAM',
    make: 'RAM',
    model: '2500',
    year: 2024,
    fuelTankGal: 31,
    fuelPercent: 58,
    waterCapacityGal: 18,
    waterGal: 12,
    fuelType: 'diesel',
    baseWeightLb: 7742,
    gvwrLb: 10190,
    tireSizeInches: 37,
    isLeveled: true,
    frontLevelInches: 2,
    wizardConfig: {
      fleet_build_loadout: buildLoadout,
    },
  });
  const vehicleSpec = spec({
    gvwrLb: 10190,
    baseWeightLb: 7742,
    baseSource: 'exact_build_match',
    baseConfidence: 84,
    gvwrSource: 'manufacturer_spec',
    gvwrConfidence: 91,
    fuelTankGal: 31,
    fuelType: 'diesel',
    trim: 'Cummins Crew 4x4 Short Bed',
    engine: '6.7L Cummins',
    drivetrain: '4x4',
    cab: 'Crew Cab',
    bedLength: 'Short Bed',
  });
  const consumableState = consumables({ fuelPercent: 58, waterGal: 12 });
  const tireState = tiresLift({ tireSizeInches: 37, isLeveled: true, frontLevelInches: 2 });
  const seeded = seedState({
    vehicle,
    spec: vehicleSpec,
    consumables: consumableState,
    tiresLift: tireState,
    buildLoadout,
    useCases: ['overland', 'towing'],
  });
  const accessories = toFleetAccessoryInstalls(seeded.buildLoadout, vehicleId);
  const loadoutItems = toFleetCompartmentLoadoutItems(seeded.buildLoadout, vehicleId);
  const preview = buildLoadoutConsequencePreview({
    vehicleId,
    vehicle: seeded.fleetVehicle,
    currentAccessories: accessories.slice(0, 2),
    currentLoadoutItems: loadoutItems.slice(0, 1),
    proposedAccessories: accessories,
    proposedLoadoutItems: loadoutItems,
    routeContext: {
      difficulty: 'moderate',
      terrainRisk: 'watch',
      remoteness: 'high',
      recoveryPosture: 'limited',
      freshness: 'stale',
      sourceKind: 'estimated',
      observedAt: QA_OLD_CACHE,
    },
    tireLiftState: {
      tireSizeInches: 37,
      suspensionLiftInches: 0,
      isLeveled: true,
    },
    calculationMode: 'preview',
    generatedAt: QA_NOW,
  });

  return planBase('payload_pressure', 'Accessory and Loadout Payload Pressure', ['profile-source-confidence', 'weight-summary-pressure'], {
    activeVehicleId: vehicleId,
    vehicles: [vehicle],
    specs: { [vehicleId]: vehicleSpec },
    consumables: { [vehicleId]: consumableState },
    tiresLift: { [vehicleId]: tireState },
    buildLoadout: { [vehicleId]: seeded.buildLoadout },
    expectedStates: [seeded.expected],
    previews: { [vehicleId]: preview },
  });
}

function buildOfflineRestoreMigrationPlan(): FleetQaPreloadPlan {
  const vehicleId = 'fleet-qa-offline-migrated';
  let legacyBuildLoadout = createEmptyFleetBuildLoadoutState();
  legacyBuildLoadout = addAccessory(legacyBuildLoadout, vehicleId, 'bed_drawers_storage');
  legacyBuildLoadout = addLoadoutItem(legacyBuildLoadout, {
    vehicleId,
    id: `${vehicleId}:legacy-recovery-box`,
    name: 'Legacy recovery box',
    category: 'recovery',
    weightLb: 68,
    loadZone: 'bedLow',
    source: 'user_estimate',
  });
  const legacyVehicle = {
    id: vehicleId,
    owner_user_id: 'local',
    name: 'QA Offline Migrated Rig',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2020,
    created_at: '2025-11-01T00:00:00.000Z',
    updated_at: QA_OLD_CACHE,
    wizard_config: {
      legacy_keep_me: 'preserved',
      fleet_build_loadout: legacyBuildLoadout,
      fleet_checklist: {
        itemStates: {},
        prepList: [],
        updatedAt: QA_OLD_CACHE,
      },
    },
  };
  const migrated = migrateLegacyVehicleToFleetPremium({
    now: QA_NOW,
    vehicle: legacyVehicle,
    specs: {
      base_weight_lb: 4480,
      gvwr_lb: 5600,
      engine: 'V6',
      drivetrain: '4WD',
      trim: 'TRD Off-Road',
    },
  });
  const vehicle = vehicleRecord({
    id: vehicleId,
    name: 'QA Offline Migrated Rig',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2020,
    fuelTankGal: 21.1,
    fuelPercent: 42,
    waterCapacityGal: 8,
    waterGal: 3,
    fuelType: 'gas',
    baseWeightLb: 4480,
    gvwrLb: 5600,
    tireSizeInches: 33,
    wizardConfig: {
      ...migrated.vehiclePatch.wizard_config,
      legacy_keep_me: 'preserved',
      fleet_qa_offline_restore: {
        cached: true,
        stale: true,
        sourceLabel: 'Cached local Fleet QA restore',
        observedAt: QA_OLD_CACHE,
        requiresNetwork: false,
      },
    },
  });
  const vehicleSpec = spec({
    gvwrLb: 5600,
    baseWeightLb: 4480,
    baseSource: 'user_estimate',
    baseConfidence: 70,
    gvwrSource: 'manufacturer_spec',
    gvwrConfidence: 88,
    fuelTankGal: 21.1,
    fuelType: 'gas',
    trim: 'TRD Off-Road',
    engine: 'V6',
    drivetrain: '4WD',
  });
  const consumableState = consumables({ fuelPercent: 42, waterGal: 3, observedAt: Date.parse(QA_OLD_CACHE) });
  const tireState = tiresLift({ tireSizeInches: 33, updatedAt: QA_OLD_CACHE });
  const normalizedBuildLoadout = normalizeFleetBuildLoadoutState(vehicle.wizard_config?.fleet_build_loadout);
  const seeded = seedState({
    vehicle,
    spec: vehicleSpec,
    consumables: consumableState,
    tiresLift: tireState,
    buildLoadout: normalizedBuildLoadout,
  });

  return planBase('offline_restore_migration', 'Offline Restore and Migration', ['offline-restart-restore'], {
    activeVehicleId: vehicleId,
    vehicles: [vehicle],
    specs: { [vehicleId]: vehicleSpec },
    consumables: { [vehicleId]: consumableState },
    tiresLift: { [vehicleId]: tireState },
    buildLoadout: { [vehicleId]: seeded.buildLoadout },
    expectedStates: [seeded.expected],
    offlineRestore: {
      cached: true,
      stale: true,
      sourceLabel: 'Cached local Fleet QA restore',
      requiresNetwork: false,
      migrationVersion: String(vehicle.wizard_config?.fleet_premium_migration_version ?? ''),
    },
  });
}

export function buildFleetQaPreloadPlan(stateId: FleetQaPreloadStateId): FleetQaPreloadPlan {
  switch (stateId) {
    case 'zero_vehicle':
      return planBase('zero_vehicle', 'Zero Vehicle', ['profile-zero-vehicle'], {
        activeVehicleId: null,
      });
    case 'two_vehicle_active_switch':
      return buildTwoVehiclePlan();
    case 'verified_vs_estimated_weight':
      return buildWeightEvidencePlan();
    case 'payload_pressure':
      return buildPayloadPressurePlan();
    case 'offline_restore_migration':
      return buildOfflineRestoreMigrationPlan();
    default: {
      const exhaustive: never = stateId;
      throw new Error(`Unsupported Fleet QA preload state: ${exhaustive}`);
    }
  }
}

export async function applyFleetQaPreloadPlan(
  stateId: FleetQaPreloadStateId,
  adapter: FleetQaPreloadApplyAdapter,
): Promise<FleetQaPreloadApplyResult> {
  const plan = buildFleetQaPreloadPlan(stateId);
  await adapter.waitForHydration?.();

  const existingVehicles = await adapter.getExistingVehicles();
  for (const existing of existingVehicles) {
    if (!existing?.id) continue;
    await adapter.deleteVehicle(existing.id);
    await adapter.removeSpec?.(existing.id);
    await adapter.removeConsumables?.(existing.id);
    await adapter.removeTiresLift?.(existing.id);
  }

  if (plan.vehicles.length > 0) {
    await adapter.importVehicles(plan.vehicles);
  }

  for (const [vehicleId, vehicleSpec] of Object.entries(plan.specs)) {
    await adapter.setSpec(vehicleId, vehicleSpec);
  }
  for (const [vehicleId, state] of Object.entries(plan.consumables)) {
    await adapter.setConsumables(vehicleId, state);
  }
  for (const [vehicleId, state] of Object.entries(plan.tiresLift)) {
    await adapter.setTiresLift(vehicleId, state);
  }

  if (plan.activeVehicleId) {
    await adapter.setActiveVehicleId(plan.activeVehicleId);
  } else {
    await adapter.clearActiveVehicleId();
  }
  await adapter.flush?.();

  return {
    plan,
    activeVehicleId: plan.activeVehicleId,
    clearedVehicleCount: existingVehicles.length,
    importedVehicleCount: plan.vehicles.length,
  };
}

export function resolveFleetQaActiveSwitchTargetId(
  vehicles: readonly Pick<Vehicle, 'id'>[],
  activeVehicleId: string | null,
): string | null {
  const availableIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const twoVehicleSequence = buildTwoVehiclePlan().activeSwitchSequence;
  if (!twoVehicleSequence.every((vehicleId) => availableIds.has(vehicleId))) return null;
  if (activeVehicleId === twoVehicleSequence[0]) return twoVehicleSequence[1];
  return twoVehicleSequence[0];
}
