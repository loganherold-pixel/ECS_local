import { consumablesStore } from '../consumablesStore';
import { loadoutItemStore, loadoutStore } from '../loadoutStore';
import { tiresLiftStore } from '../tiresLiftStore';
import type { Vehicle } from '../types';
import { vehicleSetupStore } from '../vehicleSetupStore';
import { vehicleSpecStore } from '../vehicleSpecStore';
import { vehicleStore } from '../vehicleStore';
import type { FleetRiskLevel, FleetWeightConfidenceLevel, FleetWeightSource } from './fleetPremiumDomain';
import {
  selectFleetVehicleState,
  type FleetCanonicalVehicleState,
} from './fleetVehicleStateSelectors';
import {
  buildVehicleIntelligenceSuggestions,
  classifyVehicle,
  type ECSVehicleClassification,
} from './vehicleClassification';

export type ECSVehicularStateStatus =
  | 'no_active_vehicle'
  | 'missing_vehicle'
  | 'incomplete'
  | 'ready';

export type ECSVehicleConfidenceLabel =
  | 'verified'
  | 'high'
  | 'medium'
  | 'low'
  | 'unverified';

export type ECSVehicleSourceLabel = {
  field: string;
  source: FleetWeightSource | 'store' | 'manual' | 'unknown';
  label: string | null;
  confidence: number | null;
};

export type ECSVehicleIdentitySnapshot = {
  activeVehicleId: string | null;
  vehicleId: string | null;
  hasVehicle: boolean;
  displayName: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vehicleType: string | null;
  updatedAt: string | null;
};

export type ECSVehicleWeightSnapshot = {
  vehicleId: string | null;
  baseWeightLbs: number | null;
  gvwrLbs: number | null;
  accessoryWeightLbs: number;
  cargoLoadoutWeightLbs: number;
  consumablesWeightLbs: number;
  knownContributionsWeightLbs: number;
  estimatedOperatingWeightLbs: number | null;
  remainingPayloadLbs: number | null;
  payloadCapacityLbs: number | null;
  payloadUsedPct: number | null;
  gvwrOverageRisk: FleetRiskLevel;
  weightConfidence: number;
  confidenceLabel: ECSVehicleConfidenceLabel;
  confidenceLevel: FleetWeightConfidenceLevel;
  confidenceCopy: string;
  isEstimate: boolean;
  isPartial: boolean;
  sourceLabels: ECSVehicleSourceLabel[];
  partialDataReasons: string[];
  warnings: string[];
};

export type ECSVehicleModificationSnapshot = {
  accessoryCount: number;
  accessoryWeightLbs: number;
  containerZoneCount: number;
  tireSizeInches: number | null;
  suspensionLiftInches: number | null;
  isLeveled: boolean;
  frontLevelInches: number | null;
};

export type ECSVehicleLoadoutSnapshot = {
  activeLoadoutId: string | null;
  activeLoadoutName: string | null;
  itemCount: number;
  cargoLoadoutWeightLbs: number;
};

export type ECSVehicleCapabilitySnapshot = {
  vehicleId: string | null;
  hasVehicle: boolean;
  fuelTankCapacityGal: number | null;
  fuelType: string | null;
  currentFuelPercent: number | null;
  currentFuelGallons: number;
  waterCapacityGal: number | null;
  currentWaterGallons: number;
  batteryUsableWh: number | null;
  tireSizeInches: number | null;
  suspensionLiftInches: number | null;
  isLeveled: boolean;
  useCaseChips: string[];
  confidenceLabel: ECSVehicleConfidenceLabel;
};

export type ECSVehicleCenterOfGravitySnapshot = {
  riskLevel: FleetRiskLevel;
  topHeavyRisk: FleetRiskLevel;
  frontAxleRisk: FleetRiskLevel;
  rearAxleRisk: FleetRiskLevel;
  x: number | null;
  y: number | null;
  z: number | null;
  totalKnownWeightLbs: number | null;
  dataQuality: string | null;
  warnings: string[];
};

export type ECSVehicleIntelligenceSnapshot = {
  classification: ECSVehicleClassification;
  suggestions: string[];
};

export type ECSVehicularState = {
  schemaVersion: 'ecs.vehicle-state.v1';
  status: ECSVehicularStateStatus;
  identity: ECSVehicleIdentitySnapshot;
  vehicle: Vehicle | null;
  canonicalFleetState: FleetCanonicalVehicleState | null;
  specs: FleetCanonicalVehicleState['spec'] | null;
  modifications: ECSVehicleModificationSnapshot;
  loadout: ECSVehicleLoadoutSnapshot;
  weight: ECSVehicleWeightSnapshot;
  capability: ECSVehicleCapabilitySnapshot;
  centerOfGravity: ECSVehicleCenterOfGravitySnapshot;
  intelligence: ECSVehicleIntelligenceSnapshot;
  confidence: {
    score: number;
    label: ECSVehicleConfidenceLabel;
    reasons: string[];
  };
  updatedAt: string | null;
  signature: string;
};

const RISK_RANK: Record<FleetRiskLevel, number> = {
  clear: 0,
  watch: 1,
  caution: 2,
  critical: 3,
};

function roundLbs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function confidenceLabel(score: number | null | undefined): ECSVehicleConfidenceLabel {
  if (score == null || !Number.isFinite(score) || score <= 0) return 'unverified';
  if (score >= 95) return 'verified';
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

function maxRisk(...levels: FleetRiskLevel[]): FleetRiskLevel {
  return levels.reduce(
    (highest, level) => (RISK_RANK[level] > RISK_RANK[highest] ? level : highest),
    'clear' as FleetRiskLevel,
  );
}

function sourceLabel(
  field: string,
  value: { source: FleetWeightSource; sourceLabel?: string | null; confidence: number } | null | undefined,
): ECSVehicleSourceLabel {
  return {
    field,
    source: value?.source ?? 'unknown',
    label: value?.sourceLabel ?? null,
    confidence: value?.confidence ?? null,
  };
}

function statusForState(
  fleetState: FleetCanonicalVehicleState | null,
  activeVehicleId: string | null,
  weight: ECSVehicleWeightSnapshot,
): ECSVehicularStateStatus {
  if (!activeVehicleId) return 'no_active_vehicle';
  if (!fleetState?.vehicle) return 'missing_vehicle';
  return weight.isPartial ? 'incomplete' : 'ready';
}

function emptyVehicleState(activeVehicleId: string | null, status: ECSVehicularStateStatus): ECSVehicularState {
  const identity: ECSVehicleIdentitySnapshot = {
    activeVehicleId,
    vehicleId: null,
    hasVehicle: false,
    displayName: activeVehicleId ? 'Vehicle unavailable' : 'No active vehicle',
    year: null,
    make: null,
    model: null,
    trim: null,
    vehicleType: null,
    updatedAt: null,
  };
  const weight: ECSVehicleWeightSnapshot = {
    vehicleId: null,
    baseWeightLbs: null,
    gvwrLbs: null,
    accessoryWeightLbs: 0,
    cargoLoadoutWeightLbs: 0,
    consumablesWeightLbs: 0,
    knownContributionsWeightLbs: 0,
    estimatedOperatingWeightLbs: null,
    remainingPayloadLbs: null,
    payloadCapacityLbs: null,
    payloadUsedPct: null,
    gvwrOverageRisk: 'watch',
    weightConfidence: 0,
    confidenceLabel: 'unverified',
    confidenceLevel: 'unknown',
    confidenceCopy: 'Weight profile needs vehicle specs before payload confidence is available.',
    isEstimate: false,
    isPartial: true,
    sourceLabels: [],
    partialDataReasons: [activeVehicleId ? 'Active vehicle record is unavailable.' : 'No active vehicle selected.'],
    warnings: [],
  };
  const capability: ECSVehicleCapabilitySnapshot = {
    vehicleId: null,
    hasVehicle: false,
    fuelTankCapacityGal: null,
    fuelType: null,
    currentFuelPercent: null,
    currentFuelGallons: 0,
    waterCapacityGal: null,
    currentWaterGallons: 0,
    batteryUsableWh: null,
    tireSizeInches: null,
    suspensionLiftInches: null,
    isLeveled: false,
    useCaseChips: [],
    confidenceLabel: 'unverified',
  };
  const classification = classifyVehicle(null);
  return {
    schemaVersion: 'ecs.vehicle-state.v1',
    status,
    identity,
    vehicle: null,
    canonicalFleetState: null,
    specs: null,
    modifications: {
      accessoryCount: 0,
      accessoryWeightLbs: 0,
      containerZoneCount: 0,
      tireSizeInches: null,
      suspensionLiftInches: null,
      isLeveled: false,
      frontLevelInches: null,
    },
    loadout: {
      activeLoadoutId: null,
      activeLoadoutName: null,
      itemCount: 0,
      cargoLoadoutWeightLbs: 0,
    },
    weight,
    capability,
    centerOfGravity: {
      riskLevel: 'watch',
      topHeavyRisk: 'watch',
      frontAxleRisk: 'watch',
      rearAxleRisk: 'watch',
      x: null,
      y: null,
      z: null,
      totalKnownWeightLbs: null,
      dataQuality: null,
      warnings: [],
    },
    intelligence: {
      classification,
      suggestions: buildVehicleIntelligenceSuggestions({
        classification,
        confidenceLevel: 'unknown',
        confidenceScore: 0,
      }),
    },
    confidence: {
      score: 0,
      label: 'unverified',
      reasons: weight.partialDataReasons,
    },
    updatedAt: null,
    signature: JSON.stringify({ activeVehicleId, status }),
  };
}

export function buildActiveVehicleStateFromFleetState(
  fleetState: FleetCanonicalVehicleState | null,
  activeVehicleId: string | null = fleetState?.vehicle.id ?? null,
): ECSVehicularState {
  if (!fleetState) {
    return emptyVehicleState(activeVehicleId, activeVehicleId ? 'missing_vehicle' : 'no_active_vehicle');
  }

  const { vehicle, fleetVehicle, operatingWeight, resourceProfile } = fleetState;
  const weightResult = operatingWeight.weightResult;
  const baseWeightLbs = weightResult.baseNetWeight.source === 'unknown'
    ? null
    : roundLbs(weightResult.baseNetWeight.lbs);
  const gvwrLbs = weightResult.gvwr ? roundLbs(weightResult.gvwr.lbs) : null;
  const accessoryWeightLbs = roundLbs(weightResult.installedAccessoryWeight.lbs) ?? 0;
  const cargoLoadoutWeightLbs = roundLbs(weightResult.activeLoadoutWeight.lbs) ?? 0;
  const consumablesWeightLbs = roundLbs(weightResult.consumablesWeight.lbs) ?? 0;
  const knownContributionsWeightLbs = roundLbs(
    (baseWeightLbs ?? 0) + accessoryWeightLbs + cargoLoadoutWeightLbs + consumablesWeightLbs,
  ) ?? 0;
  const hasCompleteWeightBasis = baseWeightLbs != null && gvwrLbs != null;
  const sourceLabels = [
    sourceLabel('baseWeight', weightResult.baseNetWeight),
    sourceLabel('accessoryWeight', weightResult.installedAccessoryWeight),
    sourceLabel('cargoLoadoutWeight', weightResult.activeLoadoutWeight),
    sourceLabel('consumablesWeight', weightResult.consumablesWeight),
    sourceLabel('gvwr', weightResult.gvwr),
  ];
  const partialDataReasons = Array.from(new Set([
    ...operatingWeight.partialDataReasons,
    ...(!baseWeightLbs ? ['Base/net vehicle weight is missing or unverified.'] : []),
    ...(!gvwrLbs ? ['GVWR is missing; payload percentage cannot be computed.'] : []),
  ]));
  const weightConfidence = weightResult.confidence;
  const weightLabel = confidenceLabel(weightConfidence);
  const weight: ECSVehicleWeightSnapshot = {
    vehicleId: vehicle.id,
    baseWeightLbs,
    gvwrLbs,
    accessoryWeightLbs,
    cargoLoadoutWeightLbs,
    consumablesWeightLbs,
    knownContributionsWeightLbs,
    estimatedOperatingWeightLbs: roundLbs(weightResult.operatingWeight.lbs),
    remainingPayloadLbs: weightResult.payloadRemaining ? roundLbs(weightResult.payloadRemaining.lbs) : null,
    payloadCapacityLbs: weightResult.payloadCapacity ? roundLbs(weightResult.payloadCapacity.lbs) : null,
    payloadUsedPct: weightResult.gvwrUsagePct,
    gvwrOverageRisk: weightResult.gvwrOverageRisk,
    weightConfidence,
    confidenceLabel: weightLabel,
    confidenceLevel: weightResult.confidenceMetadata.level,
    confidenceCopy: weightResult.confidenceMetadata.copy,
    isEstimate: sourceLabels.some((item) => item.source !== 'scale_ticket' && item.source !== 'vin_oem_match'),
    isPartial: !hasCompleteWeightBasis || weightConfidence < 70 || partialDataReasons.length > 0,
    sourceLabels,
    partialDataReasons,
    warnings: Array.from(new Set([
      ...weightResult.warnings,
      ...weightResult.confidenceMetadata.reasons,
      ...operatingWeight.centerOfGravity.warnings,
    ])),
  };
  const centerOfGravity: ECSVehicleCenterOfGravitySnapshot = {
    riskLevel: maxRisk(weightResult.topHeavyRisk, weightResult.frontAxleRisk, weightResult.rearAxleRisk),
    topHeavyRisk: weightResult.topHeavyRisk,
    frontAxleRisk: weightResult.frontAxleRisk,
    rearAxleRisk: weightResult.rearAxleRisk,
    x: operatingWeight.centerOfGravity.x,
    y: operatingWeight.centerOfGravity.y,
    z: operatingWeight.centerOfGravity.z,
    totalKnownWeightLbs: roundLbs(operatingWeight.centerOfGravity.totalKnownWeightLb),
    dataQuality: operatingWeight.centerOfGravity.dataQuality,
    warnings: operatingWeight.centerOfGravity.warnings,
  };
  const modifications: ECSVehicleModificationSnapshot = {
    accessoryCount: fleetState.accessories.length,
    accessoryWeightLbs,
    containerZoneCount: fleetState.frameworkContainerZones.length,
    tireSizeInches: resourceProfile.tireSizeInches,
    suspensionLiftInches: resourceProfile.suspensionLiftInches,
    isLeveled: resourceProfile.isLeveled,
    frontLevelInches: resourceProfile.frontLevelInches,
  };
  const loadout: ECSVehicleLoadoutSnapshot = {
    activeLoadoutId: fleetState.activeLoadout?.id ?? null,
    activeLoadoutName: fleetState.activeLoadout?.name ?? null,
    itemCount: fleetState.loadoutItems.length,
    cargoLoadoutWeightLbs,
  };
  const capability: ECSVehicleCapabilitySnapshot = {
    vehicleId: vehicle.id,
    hasVehicle: true,
    fuelTankCapacityGal: resourceProfile.fuelTankCapacityGal,
    fuelType: resourceProfile.fuelType,
    currentFuelPercent: resourceProfile.currentFuelPercent,
    currentFuelGallons: resourceProfile.currentFuelGallons,
    waterCapacityGal: resourceProfile.waterCapacityGal,
    currentWaterGallons: resourceProfile.currentWaterGallons,
    batteryUsableWh: resourceProfile.batteryUsableWh,
    tireSizeInches: resourceProfile.tireSizeInches,
    suspensionLiftInches: resourceProfile.suspensionLiftInches,
    isLeveled: resourceProfile.isLeveled,
    useCaseChips: fleetState.useCaseChips,
    confidenceLabel: weightLabel,
  };
  const classification = classifyVehicle({
    vehicleType: fleetVehicle.vehicleType,
    year: fleetVehicle.year ?? null,
    make: fleetVehicle.make ?? null,
    model: fleetVehicle.model ?? null,
    trim: fleetVehicle.trim ?? fleetVehicle.buildProfile.trim ?? null,
    engine: fleetVehicle.buildProfile.engine ?? null,
    drivetrain: fleetVehicle.buildProfile.drivetrain ?? null,
    wheelbaseInches: fleetVehicle.buildProfile.wheelbaseIn ?? null,
    gvwrLbs,
    baseWeightLbs,
    payloadCapacityLbs: weight.payloadCapacityLbs,
    tireSizeInches: resourceProfile.tireSizeInches,
    suspensionLiftInches: resourceProfile.suspensionLiftInches,
    groundClearanceInches: fleetVehicle.buildProfile.groundClearanceInches ?? null,
  });
  const intelligence: ECSVehicleIntelligenceSnapshot = {
    classification,
    suggestions: buildVehicleIntelligenceSuggestions({
      classification,
      operatingWeightLbs: weight.estimatedOperatingWeightLbs,
      payloadUsedPct: weight.payloadUsedPct,
      remainingPayloadLbs: weight.remainingPayloadLbs,
      payloadCapacityLbs: weight.payloadCapacityLbs,
      tireSizeInches: resourceProfile.tireSizeInches,
      suspensionLiftInches: resourceProfile.suspensionLiftInches,
      groundClearanceInches: fleetVehicle.buildProfile.groundClearanceInches ?? null,
      accessoryWeightLbs,
      cargoLoadoutWeightLbs,
      confidenceLevel: weight.confidenceLevel,
      confidenceScore: weight.weightConfidence,
    }),
  };
  const identity: ECSVehicleIdentitySnapshot = {
    activeVehicleId,
    vehicleId: vehicle.id,
    hasVehicle: true,
    displayName: fleetVehicle.nickname || vehicle.name || 'Fleet vehicle',
    year: fleetVehicle.year ?? null,
    make: fleetVehicle.make ?? null,
    model: fleetVehicle.model ?? null,
    trim: fleetVehicle.trim ?? null,
    vehicleType: fleetVehicle.vehicleType ?? vehicle.type ?? null,
    updatedAt: vehicle.updated_at ?? fleetVehicle.updatedAt ?? null,
  };
  const status = statusForState(fleetState, activeVehicleId, weight);
  const confidenceReasons = Array.from(new Set([
    ...partialDataReasons,
    ...weight.warnings,
    ...(weight.isEstimate ? ['Some vehicle intelligence is estimated; verify saved specs for higher confidence.'] : []),
  ]));

  return {
    schemaVersion: 'ecs.vehicle-state.v1',
    status,
    identity,
    vehicle,
    canonicalFleetState: fleetState,
    specs: fleetState.spec,
    modifications,
    loadout,
    weight,
    capability,
    centerOfGravity,
    intelligence,
    confidence: {
      score: weightConfidence,
      label: weightLabel,
      reasons: confidenceReasons,
    },
    updatedAt: identity.updatedAt,
    signature: JSON.stringify({
      status,
      activeVehicleId,
      vehicleId: vehicle.id,
      updatedAt: identity.updatedAt,
      weight,
      modifications,
      loadout,
      capability,
      centerOfGravity,
      intelligence,
    }),
  };
}

export function getActiveVehicleState(vehicleId?: string | null): ECSVehicularState {
  const resolvedVehicleId = vehicleId === undefined ? vehicleSetupStore.getActiveVehicleId() : vehicleId;
  if (!resolvedVehicleId) return emptyVehicleState(null, 'no_active_vehicle');
  return buildActiveVehicleStateFromFleetState(selectFleetVehicleState(resolvedVehicleId), resolvedVehicleId);
}

export function getVehicleWeightSnapshot(vehicleId?: string | null): ECSVehicleWeightSnapshot {
  return getActiveVehicleState(vehicleId).weight;
}

export function getVehicleCapabilitySnapshot(vehicleId?: string | null): ECSVehicleCapabilitySnapshot {
  return getActiveVehicleState(vehicleId).capability;
}

export async function waitForActiveVehicleStateHydration(): Promise<void> {
  await Promise.all([
    vehicleSetupStore.waitForHydration(),
    vehicleStore.waitForHydration(),
    vehicleSpecStore.waitForHydration(),
    consumablesStore.waitForHydration(),
    tiresLiftStore.waitForHydration(),
  ]);
}

export function subscribeActiveVehicleState(listener: () => void): () => void {
  const offSetup = vehicleSetupStore.subscribe(listener);
  const offVehicles = vehicleStore.subscribe(() => listener());
  const offSpecs = vehicleSpecStore.subscribe(listener);
  const offConsumables = consumablesStore.subscribe(listener);
  const offTiresLift = tiresLiftStore.subscribe(() => listener());
  const offLoadouts = loadoutStore.subscribe(() => listener());
  const offLoadoutItems = loadoutItemStore.subscribe(() => listener());
  return () => {
    offSetup();
    offVehicles();
    offSpecs();
    offConsumables();
    offTiresLift();
    offLoadouts();
    offLoadoutItems();
  };
}
