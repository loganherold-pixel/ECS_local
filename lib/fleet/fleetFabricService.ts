import {
  adaptLegacyLoadoutItemToFleetLoadoutItem,
  adaptLegacyVehicleToFleetVehicle,
  calculateFleetWeightResult,
  createFleetWeightValue,
  scoreFleetVehicle,
  toFleetLoadZone,
  type FleetAccessoryInstall,
  type FleetCompartment,
  type FleetFabricPayload,
  type FleetLoadoutItem,
  type FleetScoringResult,
  type FleetVehicle,
  type FleetWeightResult,
  type WeightVerification,
} from './fleetPremiumDomain';
import {
  readFleetBuildLoadoutState,
  toFleetAccessoryInstalls,
  toFleetCompartmentLoadoutItems,
  type FleetBuildLoadoutState,
} from './fleetBuildLoadout';
import {
  buildFleetChecklistRecommendations,
  normalizeFleetChecklistState,
  type FleetChecklistRecommendation,
  type FleetChecklistState,
} from './fleetChecklist';
import {
  buildFleetWeightSummary,
  type FleetWeightRiskFlag,
  type FleetWeightSummary,
} from './fleetWeightSummary';
import {
  buildVehicleIntelligenceSuggestions,
  classifyVehicle,
  type ECSVehicleClassification,
} from './vehicleClassification';
import type { Vehicle } from '../types';

type ContainerZone = {
  id: string;
  label: string;
  icon: string;
  status?: string | null;
};

type VehicleSpecLike = unknown;
type ConsumablesLike = unknown;
type TiresLiftLike = unknown;
type LocalLoadoutLike = { id?: string | null; name?: string | null; updated_at?: string | null; preset?: string | null } | null;
type LocalLoadoutItemLike = {
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
  weight_source?: string | null;
};

export type FleetFabricConfidenceBreakdown = {
  baseNetWeight: number;
  gvwr: number | null;
  accessoryWeight: number;
  loadoutWeight: number;
  overall: number;
  level: FleetWeightResult['confidenceMetadata']['level'];
  copy: string;
};

export type FleetFabricVehicleIntelligence = {
  classification: ECSVehicleClassification;
  suggestions: string[];
  weightConfidenceLevel: FleetWeightResult['confidenceMetadata']['level'];
  payloadUsedPct: number | null;
  operatingWeightLbs: number | null;
  remainingPayloadLbs: number | null;
};

export type FleetFabricServicePayload = Omit<FleetFabricPayload, 'schemaVersion'> & {
  schemaVersion: 'fleet.fabric.v2';
  buildMetadata: {
    useCases: string[];
    activeLoadoutPreset: string | null;
    generatedBy: 'fleet_premium_service';
  };
  activeLoadout: {
    id: string | null;
    name: string | null;
    presetId: string | null;
    items: FleetLoadoutItem[];
  };
  checklist: {
    state: FleetChecklistState;
    statuses: Array<{ id: string; status: string; updatedAt: string }>;
    recommendations: FleetChecklistRecommendation[];
  };
  weightVerifications: WeightVerification[];
  riskFlags: FleetWeightRiskFlag[];
  weightSummary: FleetWeightSummary;
  confidenceBreakdown: FleetFabricConfidenceBreakdown;
  vehicleIntelligence: FleetFabricVehicleIntelligence;
  tacticalUiState?: {
    preferredPanel?: 'profile' | 'build_loadout' | 'weight_summary' | 'readiness_score' | 'forgot' | null;
    routeTarget?: 'fleet' | null;
  };
};

export type FleetFabricSource = {
  vehicle: Vehicle | (Vehicle & { wizard_config?: Record<string, unknown> | null });
  specs?: VehicleSpecLike;
  consumables?: ConsumablesLike;
  tiresLift?: TiresLiftLike;
  useCases?: readonly string[];
  containerZones?: readonly ContainerZone[] | null;
  activeLoadout?: LocalLoadoutLike;
  loadoutItems?: readonly LocalLoadoutItemLike[] | null;
  generatedAt?: string;
  tacticalUiState?: FleetFabricServicePayload['tacticalUiState'];
};

const FORBIDDEN_FLEET_MEDIA_KEYS = [
  'photo',
  'image',
  'imageurl',
  'image_url',
  'remoteimage',
  'cdnimage',
  'manifest',
  'resolver',
  'oemsourceurl',
  'dealerimage',
  'upload',
] as const;

const CONTAINER_FRAMEWORK_BASE_WEIGHTS_LBS: Record<string, number> = {
  cab_rack: 85,
  bed_drawer: 180,
  roof_rack: 75,
  shell_system: 213,
};

function wizardConfigOf(vehicle: unknown): Record<string, unknown> {
  const raw = vehicle && typeof vehicle === 'object' ? (vehicle as any).wizard_config : null;
  return raw && typeof raw === 'object' ? raw : {};
}

function buildFrameworkAccessoryInstalls(vehicle: Vehicle, containerZones: readonly ContainerZone[] = []): FleetAccessoryInstall[] {
  return containerZones.reduce<FleetAccessoryInstall[]>((installs, zone) => {
    const weightLbs = CONTAINER_FRAMEWORK_BASE_WEIGHTS_LBS[zone.id] ?? 0;
      if (weightLbs <= 0 || zone.status === 'planned') return installs;
    const loadZone = toFleetLoadZone(`${zone.id} ${zone.label}`, 'rearLow');
    installs.push({
      id: `${vehicle.id}:${zone.id}`,
      vehicleId: vehicle.id,
      catalogItemId: zone.id,
      name: zone.label,
      installedWeight: createFleetWeightValue(weightLbs, 'ecs_default', {
        sourceLabel: `${zone.label} ECS accessory default`,
      }),
      loadZone,
      display: {
        iconKey: zone.icon,
        title: zone.label,
          subtitle: zone.status ?? null,
        classLabel: loadZone,
          chips: [zone.status ?? 'installed', loadZone],
        accentTone: 'category',
      },
    });
    return installs;
  }, []);
}

function normalizeFleetWeightVerifications(value: unknown, vehicleId: string): WeightVerification[] {
  const raw = Array.isArray(value) ? value : [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as any;
    const target = typeof record.target === 'string' ? record.target : null;
    const weightLb = Number(record.weightLb ?? record.weight_lbs ?? record.weight?.lbs);
    if (!target || !Number.isFinite(weightLb)) return [];
    return [{
      id: typeof record.id === 'string' ? record.id : `${vehicleId}:verification:${index}`,
      vehicleId,
      target,
      weight: createFleetWeightValue(weightLb, record.method ?? record.source ?? 'scale_ticket', {
        confidence: Number(record.confidence),
        sourceLabel: typeof record.sourceLabel === 'string' ? record.sourceLabel : 'Fleet weight verification',
        verifiedAt: typeof record.recordedAt === 'string' ? record.recordedAt : undefined,
      }),
      method: record.method ?? record.source ?? 'scale_ticket',
      sourceLabel: typeof record.sourceLabel === 'string' ? record.sourceLabel : 'Fleet weight verification',
      recordedAt: typeof record.recordedAt === 'string' ? record.recordedAt : new Date(0).toISOString(),
      notes: typeof record.notes === 'string' ? record.notes : null,
    } as WeightVerification];
  });
}

function buildConfidenceBreakdown(weight: FleetWeightResult): FleetFabricConfidenceBreakdown {
  return {
    baseNetWeight: weight.baseNetWeight.confidence,
    gvwr: weight.gvwr?.confidence ?? null,
    accessoryWeight: weight.installedAccessoryWeight.confidence,
    loadoutWeight: weight.activeLoadoutWeight.confidence,
    overall: weight.confidence,
    level: weight.confidenceMetadata.level,
    copy: weight.confidenceMetadata.copy,
  };
}

function buildFleetFabricVehicleIntelligence(
  vehicle: FleetVehicle,
  weight: FleetWeightResult,
): FleetFabricVehicleIntelligence {
  const classification = classifyVehicle({
    vehicleType: vehicle.vehicleType,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? vehicle.buildProfile.trim ?? null,
    engine: vehicle.buildProfile.engine ?? null,
    drivetrain: vehicle.buildProfile.drivetrain ?? null,
    wheelbaseInches: vehicle.buildProfile.wheelbaseIn ?? null,
    gvwrLbs: weight.gvwr?.lbs ?? vehicle.buildProfile.gvwr?.lbs ?? null,
    baseWeightLbs: weight.baseNetWeight.lbs,
    payloadCapacityLbs: weight.payloadCapacity?.lbs ?? null,
    tireSizeInches: vehicle.buildProfile.tireSizeInches ?? null,
    suspensionLiftInches: vehicle.buildProfile.suspensionLiftInches ?? null,
    groundClearanceInches: vehicle.buildProfile.groundClearanceInches ?? null,
  });
  return {
    classification,
    suggestions: buildVehicleIntelligenceSuggestions({
      classification,
      operatingWeightLbs: weight.operatingWeight.lbs,
      payloadUsedPct: weight.gvwrUsagePct,
      remainingPayloadLbs: weight.payloadRemaining?.lbs ?? null,
      payloadCapacityLbs: weight.payloadCapacity?.lbs ?? null,
      tireSizeInches: vehicle.buildProfile.tireSizeInches ?? null,
      suspensionLiftInches: vehicle.buildProfile.suspensionLiftInches ?? null,
      groundClearanceInches: vehicle.buildProfile.groundClearanceInches ?? null,
      accessoryWeightLbs: weight.installedAccessoryWeight.lbs,
      cargoLoadoutWeightLbs: weight.activeLoadoutWeight.lbs,
      confidenceLevel: weight.confidenceMetadata.level,
      confidenceScore: weight.confidence,
    }),
    weightConfidenceLevel: weight.confidenceMetadata.level,
    payloadUsedPct: weight.gvwrUsagePct,
    operatingWeightLbs: weight.operatingWeight.lbs,
    remainingPayloadLbs: weight.payloadRemaining?.lbs ?? null,
  };
}

function applyChecklistScoringContext(
  scoring: FleetScoringResult,
  checklistState: FleetChecklistState,
  checklistRecommendations: readonly FleetChecklistRecommendation[],
): FleetScoringResult {
  const prepCount = checklistState.prepList.length;
  const unsureCount = Object.values(checklistState.itemStates).filter((item) => item.status === 'not_sure').length;
  const completedCount = Object.values(checklistState.itemStates).filter((item) => item.status === 'have_it').length;
  const optionalPenalty = Math.min(10, prepCount * 3 + unsureCount);
  const optionalBonus = Math.min(4, completedCount);
  const readinessScore = Math.max(0, Math.min(100, scoring.readinessScore - optionalPenalty + optionalBonus));
  const overallScore = Math.max(0, Math.min(100, scoring.overallScore - optionalPenalty * 0.5 + optionalBonus));
  const recommendationLabels = checklistRecommendations
    .filter((item) => checklistState.prepList.includes(item.id))
    .slice(0, 3)
    .map((item) => `Prep optional Fleet checklist item: ${item.label}.`);
  return {
    ...scoring,
    readinessScore,
    overallScore,
    recommendations: [...scoring.recommendations, ...recommendationLabels],
  };
}

function assertNoFleetMediaPayload(value: unknown, path = 'fleetFabric'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoFleetMediaPayload(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z_]/g, '');
    if (FORBIDDEN_FLEET_MEDIA_KEYS.some((fragment) => normalized.includes(fragment))) {
      throw new Error(`Fleet fabric payload cannot include media field: ${path}.${key}`);
    }
    assertNoFleetMediaPayload(child, `${path}.${key}`);
  }
}

export function generatePremiumFleetFabricPayload(input: {
  vehicle: FleetVehicle;
  accessories?: readonly FleetAccessoryInstall[] | null;
  compartments?: readonly FleetCompartment[] | null;
  loadoutItems?: readonly FleetLoadoutItem[] | null;
  activeLoadout?: { id?: string | null; name?: string | null; presetId?: string | null } | null;
  checklistState?: FleetChecklistState | null;
  checklistRecommendations?: readonly FleetChecklistRecommendation[] | null;
  weightVerifications?: readonly WeightVerification[] | null;
  weightResult?: FleetWeightResult | null;
  scoringResult?: FleetScoringResult | null;
  generatedAt?: string;
  tacticalUiState?: FleetFabricServicePayload['tacticalUiState'];
}): FleetFabricServicePayload {
  const accessories = [...(input.accessories ?? [])];
  const compartments = [...(input.compartments ?? [])];
  const loadoutItems = [...(input.loadoutItems ?? [])];
  const checklistState = normalizeFleetChecklistState(input.checklistState);
  const checklistRecommendations = [...(input.checklistRecommendations ?? [])];
  const weight = input.weightResult ?? calculateFleetWeightResult(input.vehicle, accessories, loadoutItems);
  const checklistItemsForScore = checklistRecommendations.map((item, index) => ({
    id: item.id,
    vehicleId: input.vehicle.id,
    label: item.label,
    category: item.category === 'winter' ? 'seasonal' as const : 'safety' as const,
    isRequired: false,
    isComplete: checklistState.itemStates[item.id]?.status === 'have_it',
    sortOrder: index,
    source: 'ecs_default' as const,
  }));
  const baseScoring = input.scoringResult ?? scoreFleetVehicle(input.vehicle, weight, checklistItemsForScore);
  const scoring = applyChecklistScoringContext(baseScoring, checklistState, checklistRecommendations);
  const weightSummary = buildFleetWeightSummary(input.vehicle, weight, scoring);
  const vehicleIntelligence = buildFleetFabricVehicleIntelligence(input.vehicle, weight);
  const payload: FleetFabricServicePayload = {
    schemaVersion: 'fleet.fabric.v2',
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
    buildMetadata: {
      useCases: input.vehicle.buildProfile.useCases,
      activeLoadoutPreset: input.activeLoadout?.presetId ?? null,
      generatedBy: 'fleet_premium_service',
    },
    accessories,
    compartments,
    activeLoadout: {
      id: input.activeLoadout?.id ?? null,
      name: input.activeLoadout?.name ?? null,
      presetId: input.activeLoadout?.presetId ?? null,
      items: loadoutItems,
    },
    loadoutItems,
    checklistItems: checklistItemsForScore,
    checklist: {
      state: checklistState,
      statuses: Object.entries(checklistState.itemStates).map(([id, state]) => ({
        id,
        status: state.status,
        updatedAt: state.updatedAt,
      })),
      recommendations: checklistRecommendations,
    },
    weightVerifications: [...(input.weightVerifications ?? [])],
    weight,
    scoring,
    riskFlags: weightSummary.riskFlags,
    weightSummary,
    confidenceBreakdown: buildConfidenceBreakdown(weight),
    vehicleIntelligence,
    tacticalUiState: input.tacticalUiState,
  };
  assertNoFleetMediaPayload(payload);
  return payload;
}

export function generateFleetFabricPayloadFromSource(source: FleetFabricSource): FleetFabricServicePayload {
  const vehicleAny = source.vehicle as Vehicle & { wizard_config?: Record<string, unknown> | null };
  const wizardConfig = wizardConfigOf(vehicleAny);
  const useCases = source.useCases ?? [String(wizardConfig.primary_use_case ?? wizardConfig.use_case ?? 'daily')];
  const fleetVehicle = adaptLegacyVehicleToFleetVehicle({
    vehicle: vehicleAny,
    specs: source.specs as any,
    consumables: source.consumables as any,
    tiresLift: source.tiresLift as any,
    useCases: useCases as any,
  });
  const buildLoadoutState: FleetBuildLoadoutState = readFleetBuildLoadoutState(vehicleAny);
  const containerZones = source.containerZones ?? (((vehicleAny as any).containerZones ?? []) as ContainerZone[]);
  const accessories = [
    ...buildFrameworkAccessoryInstalls(vehicleAny, containerZones),
    ...toFleetAccessoryInstalls(buildLoadoutState, vehicleAny.id),
  ];
  const legacyLoadoutItems = (source.loadoutItems ?? []).map((item) =>
    adaptLegacyLoadoutItemToFleetLoadoutItem(item as any, vehicleAny.id),
  );
  const buildLoadoutItems = toFleetCompartmentLoadoutItems(buildLoadoutState, vehicleAny.id);
  const allLoadoutItems = [...legacyLoadoutItems, ...buildLoadoutItems];
  const checklistState = normalizeFleetChecklistState(wizardConfig.fleet_checklist);
  const checklistRecommendations = buildFleetChecklistRecommendations({
    vehicle: fleetVehicle,
    useCases,
    accessoryLabels: accessories.map((item) => item.name),
    loadoutItems: allLoadoutItems,
    state: checklistState,
  });
  const weightVerifications = normalizeFleetWeightVerifications(wizardConfig.fleet_weight_verifications, vehicleAny.id);
  const weight = calculateFleetWeightResult(fleetVehicle, accessories, allLoadoutItems);
  const scoring = scoreFleetVehicle(fleetVehicle, weight, []);
  return generatePremiumFleetFabricPayload({
    vehicle: fleetVehicle,
    accessories,
    compartments: buildLoadoutState.compartments.filter((item) => item.status !== 'removed'),
    loadoutItems: allLoadoutItems,
    activeLoadout: {
      id: source.activeLoadout?.id ?? null,
      name: source.activeLoadout?.name ?? null,
      presetId: buildLoadoutState.activePreset ?? source.activeLoadout?.preset ?? null,
    },
    checklistState,
    checklistRecommendations,
    weightVerifications,
    weightResult: weight,
    scoringResult: scoring,
    generatedAt: source.generatedAt,
    tacticalUiState: source.tacticalUiState,
  });
}

export function isFleetFabricPayload(value: unknown): value is FleetFabricServicePayload {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as any).schemaVersion === 'fleet.fabric.v2' &&
    (value as any).weight &&
    (value as any).scoring,
  );
}

export function extractFleetFabricPayload(value: unknown): FleetFabricServicePayload | null {
  if (isFleetFabricPayload(value)) return value;
  if (value && typeof value === 'object' && isFleetFabricPayload((value as any).fleetFabric)) {
    return (value as any).fleetFabric;
  }
  if (value && typeof value === 'object' && isFleetFabricPayload((value as any).fleet_fabric)) {
    return (value as any).fleet_fabric;
  }
  return null;
}
