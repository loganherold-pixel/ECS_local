import {
  adaptLegacyLoadoutItemToFleetLoadoutItem,
  calculateFleetWeightResult,
  createFleetWeightValue,
  type FleetAccessoryInstall,
  type FleetLoadoutItem,
  type FleetVehicle,
  type FleetWeightResult,
} from './fleetPremiumDomain';
import {
  normalizeFleetBuildLoadoutState,
  toFleetAccessoryInstalls,
  toFleetCompartmentLoadoutItems,
  type FleetBuildLoadoutState,
} from './fleetBuildLoadout';
import {
  getContainerFrameworkWeightLbs,
  resolveZoneBias,
  type ContainerZone,
} from '../accessoryFramework';
import {
  computeWeightDashboardFromFleetWeightResult,
  type FleetDashboardCenterOfGravity,
  type WeightDashboardData,
} from '../weightDashboardStore';
import { DEFAULT_VEHICLE_BASELINE, type VehicleBaseline } from '../stabilityEngine';

type LegacyLoadoutLike = {
  id: string;
  loadout_id?: string;
  name: string;
  category?: string | null;
  quantity?: number | null;
  weight_lbs?: number | null;
  weight_source?: string | null;
  storage_location?: string | null;
  is_critical?: boolean | null;
  is_packed?: boolean | null;
};

export type FleetOperatingWeightInput = {
  vehicle: FleetVehicle;
  buildState?: FleetBuildLoadoutState | null;
  loadoutItems?: readonly FleetLoadoutItem[];
  legacyLoadoutItems?: readonly LegacyLoadoutLike[];
  accessories?: readonly FleetAccessoryInstall[];
  frameworkContainerZones?: readonly ContainerZone[];
};

export type FleetOperatingWeightOutput = {
  accessories: FleetAccessoryInstall[];
  loadoutItems: FleetLoadoutItem[];
  weightResult: FleetWeightResult;
  vehicleBaseline: VehicleBaseline;
  centerOfGravity: FleetDashboardCenterOfGravity;
  dashboardData: WeightDashboardData;
  partialDataReasons: string[];
};

type CogPlacement = {
  x: number;
  y: number;
  z: number;
  hasExplicitZone: boolean;
};

const COG_ZONE_COORDINATES: Record<string, Omit<CogPlacement, 'hasExplicitZone'>> = {
  frontLow: { x: 0.26, y: 0.50, z: 0.20 },
  rearLow: { x: 0.78, y: 0.50, z: 0.22 },
  bedLow: { x: 0.70, y: 0.50, z: 0.25 },
  bedHigh: { x: 0.70, y: 0.50, z: 0.62 },
  roof: { x: 0.48, y: 0.50, z: 0.86 },
  cab: { x: 0.36, y: 0.50, z: 0.42 },
  underbody: { x: 0.50, y: 0.50, z: 0.16 },
  hitch: { x: 0.94, y: 0.50, z: 0.22 },
  trailer: { x: 0.98, y: 0.50, z: 0.32 },
};

function clampUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function createVehicleBaseline(vehicle: FleetVehicle): VehicleBaseline {
  const baseWeight =
    vehicle.buildProfile.baseNetWeight?.lbs ??
    vehicle.buildProfile.curbWeight?.lbs ??
    vehicle.buildProfile.emptyWeight?.lbs ??
    DEFAULT_VEHICLE_BASELINE.curbWeightLbs;
  const wheelbaseIn = vehicle.buildProfile.wheelbaseIn ?? DEFAULT_VEHICLE_BASELINE.wheelbaseIn;
  const frontBase = vehicle.buildProfile.frontBaseWeight?.lbs ?? null;
  const rearBase = vehicle.buildProfile.rearBaseWeight?.lbs ?? null;
  const measuredBaseTotal = (frontBase ?? 0) + (rearBase ?? 0);
  const baseCgXIn =
    measuredBaseTotal > 0 && wheelbaseIn > 0
      ? Math.max(0, Math.min(wheelbaseIn, ((frontBase ?? 0) / measuredBaseTotal) * wheelbaseIn))
      : DEFAULT_VEHICLE_BASELINE.baseCgXIn;

  return {
    ...DEFAULT_VEHICLE_BASELINE,
    curbWeightLbs: Math.max(0, baseWeight),
    wheelbaseIn,
    baseCgXIn,
  };
}

function normalizedBaseXFromBaseline(baseline: VehicleBaseline): number {
  if (baseline.wheelbaseIn <= 0) return 0.42;
  const frontAxleX = 0.22;
  const rearAxleX = 0.72;
  return clampUnit(rearAxleX - (baseline.baseCgXIn / baseline.wheelbaseIn) * (rearAxleX - frontAxleX), 0.42);
}

function normalizedBaseZFromBaseline(baseline: VehicleBaseline): number {
  return clampUnit(baseline.baseCgHeightIn / 84, 0.25);
}

function resolveLateralPlacement(text: string, fallback: number): number {
  const normalized = text.toLowerCase();
  if (/\b(driver|left|lhs|port)\b/.test(normalized)) return 0.28;
  if (/\b(passenger|right|rhs|starboard)\b/.test(normalized)) return 0.72;
  return fallback;
}

function resolveCogPlacement(loadZone: string | null | undefined, descriptor: string): CogPlacement {
  const zone = loadZone ? COG_ZONE_COORDINATES[loadZone] : null;
  const fallback = zone ?? COG_ZONE_COORDINATES.rearLow;
  return {
    ...fallback,
    y: resolveLateralPlacement(descriptor, fallback.y),
    hasExplicitZone: Boolean(zone),
  };
}

function placementFromContainerZone(zone: ContainerZone): { x: number; y: number; z: number; source: 'fleet_load_zone' | 'compartment_name'; status: 'assigned' } {
  const bias = resolveZoneBias(zone);
  const x = bias.longitudinalBias === 'front' ? 0.30 : bias.longitudinalBias === 'rear' ? 0.72 : 0.50;
  const y = bias.lateralBias === 'left' ? 0.28 : bias.lateralBias === 'right' ? 0.72 : 0.50;
  const z = bias.verticalBias === 'high' ? 0.85 : bias.verticalBias === 'low' ? 0.22 : 0.45;
  return {
    x,
    y,
    z,
    source: bias.lateralBias === 'center' ? 'fleet_load_zone' : 'compartment_name',
    status: 'assigned',
  };
}

export function buildFleetFrameworkAccessoryInstalls(
  vehicleId: string,
  containerZones: readonly ContainerZone[] = [],
): FleetAccessoryInstall[] {
  return containerZones.reduce<FleetAccessoryInstall[]>((installs, zone) => {
    const weightLbs = getContainerFrameworkWeightLbs(zone.id);
    if (weightLbs <= 0 || zone.status === 'planned') return installs;
    const placement = placementFromContainerZone(zone);
    const loadZone = Object.entries(COG_ZONE_COORDINATES)
      .sort(([, a], [, b]) => {
        const distanceA = Math.abs(a.x - placement.x) + Math.abs(a.y - placement.y) + Math.abs(a.z - placement.z);
        const distanceB = Math.abs(b.x - placement.x) + Math.abs(b.y - placement.y) + Math.abs(b.z - placement.z);
        return distanceA - distanceB;
      })[0]?.[0] as FleetAccessoryInstall['loadZone'] | undefined;
    installs.push({
      id: `${vehicleId}:${zone.id}`,
      vehicleId,
      catalogItemId: zone.id,
      name: zone.label,
      installedWeight: createFleetWeightValue(weightLbs, 'ecs_default', {
        sourceLabel: `${zone.label} ECS accessory default`,
      }),
      loadZone: loadZone ?? 'rearLow',
      placement,
      display: {
        iconKey: zone.icon,
        title: zone.label,
        subtitle: zone.status,
        classLabel: loadZone ?? 'rearLow',
        chips: [zone.status, loadZone ?? 'rearLow'],
        accentTone: 'category',
      },
    });
    return installs;
  }, []);
}

function resolvePlacementFromItem(
  placement: { x?: number; y?: number; z?: number; status?: string } | null | undefined,
  loadZone: string | null | undefined,
  descriptor: string,
): CogPlacement {
  const fallback = resolveCogPlacement(loadZone, descriptor);
  if (!placement || placement.status === 'unassigned') return { ...fallback, hasExplicitZone: false };
  return {
    x: clampUnit(Number(placement.x), fallback.x),
    y: clampUnit(Number(placement.y), fallback.y),
    z: clampUnit(Number(placement.z), fallback.z),
    hasExplicitZone: placement.status === 'assigned' || fallback.hasExplicitZone,
  };
}

export function calculateVehicleCenterOfGravity(input: {
  vehicle: FleetVehicle;
  accessories?: readonly FleetAccessoryInstall[];
  loadoutItems?: readonly FleetLoadoutItem[];
  vehicleBaseline?: VehicleBaseline | null;
}): FleetDashboardCenterOfGravity {
  const baseline = input.vehicleBaseline ?? createVehicleBaseline(input.vehicle);
  const baseWeight =
    input.vehicle.buildProfile.baseNetWeight?.lbs ??
    input.vehicle.buildProfile.curbWeight?.lbs ??
    input.vehicle.buildProfile.emptyWeight?.lbs ??
    baseline.curbWeightLbs;
  let totalKnownWeight = Math.max(0, baseWeight);
  let weightedX = totalKnownWeight * normalizedBaseXFromBaseline(baseline);
  let weightedY = totalKnownWeight * 0.5;
  let weightedZ = totalKnownWeight * normalizedBaseZFromBaseline(baseline);
  let missingWeightCount = baseWeight > 0 ? 0 : 1;
  let missingZoneMetadataCount = 0;
  let highMountedWeight = 0;

  const addWeightedItem = (weightLb: number, placement: CogPlacement) => {
    if (weightLb <= 0) {
      missingWeightCount += 1;
      return;
    }
    if (!placement.hasExplicitZone) {
      missingZoneMetadataCount += 1;
    }
    totalKnownWeight += weightLb;
    weightedX += weightLb * placement.x;
    weightedY += weightLb * placement.y;
    weightedZ += weightLb * placement.z;
    if (placement.z >= 0.62) {
      highMountedWeight += weightLb;
    }
  };

  for (const accessory of input.accessories ?? []) {
    const placement = resolvePlacementFromItem(
      accessory.placement,
      accessory.loadZone,
      `${accessory.name} ${accessory.compartmentId ?? ''} ${accessory.display?.classLabel ?? ''}`,
    );
    addWeightedItem(Math.max(0, accessory.installedWeight.lbs), placement);
  }

  for (const item of input.loadoutItems ?? []) {
    const placement = resolvePlacementFromItem(
      item.placement,
      item.loadZone,
      `${item.name} ${item.compartmentId ?? ''} ${item.category} ${item.display?.classLabel ?? ''}`,
    );
    addWeightedItem(Math.max(0, item.weight.lbs) * Math.max(1, item.quantity), placement);
  }

  const x = totalKnownWeight > 0 ? clampUnit(weightedX / totalKnownWeight, 0.42) : 0.42;
  const y = totalKnownWeight > 0 ? clampUnit(weightedY / totalKnownWeight, 0.5) : 0.5;
  const z = totalKnownWeight > 0 ? clampUnit(weightedZ / totalKnownWeight, 0.25) : 0.25;
  const warnings: string[] = [];
  if (highMountedWeight >= 150) warnings.push('High-mounted load is raising the center of gravity.');
  if (x >= 0.64) warnings.push('Rear-biased load placement is moving COG aft.');
  if (Math.abs(y - 0.5) >= 0.04) {
    warnings.push(y < 0.5 ? 'Driver-side load imbalance detected.' : 'Passenger-side load imbalance detected.');
  }
  if (missingWeightCount > 0) warnings.push(`${missingWeightCount} item${missingWeightCount === 1 ? '' : 's'} excluded from COG because weight is missing.`);
  if (missingZoneMetadataCount > 0) warnings.push(`${missingZoneMetadataCount} item${missingZoneMetadataCount === 1 ? '' : 's'} used fallback placement metadata.`);

  const dataQuality: FleetDashboardCenterOfGravity['dataQuality'] =
    missingWeightCount > 0
      ? 'missing_item_weights'
      : missingZoneMetadataCount > 0
        ? 'missing_zone_metadata'
        : input.vehicle.buildProfile.baseNetWeight?.confidence != null && input.vehicle.buildProfile.baseNetWeight.confidence >= 80
          ? 'complete'
          : 'partial';

  return {
    x,
    y,
    z,
    totalKnownWeightLb: Math.round(totalKnownWeight * 10) / 10,
    dataQuality,
    warnings: Array.from(new Set(warnings)),
    missingWeightCount,
    missingZoneMetadataCount,
  };
}

function buildPartialDataReasons(
  weightResult: FleetWeightResult,
  accessories: readonly FleetAccessoryInstall[],
  loadoutItems: readonly FleetLoadoutItem[],
): string[] {
  const reasons = [...weightResult.warnings];
  const missingAccessories = accessories.filter((accessory) => accessory.installedWeight.lbs <= 0);
  const missingLoadout = loadoutItems.filter((item) => item.weight.lbs <= 0);

  if (missingAccessories.length > 0) {
    reasons.push(`${missingAccessories.length} build accessory weight${missingAccessories.length === 1 ? ' is' : 's are'} missing.`);
  }
  if (missingLoadout.length > 0) {
    reasons.push(`${missingLoadout.length} loadout item weight${missingLoadout.length === 1 ? ' is' : 's are'} missing.`);
  }
  if (weightResult.confidence < 75) {
    reasons.push('Operating weight confidence is partial; verify estimated weights where possible.');
  }

  return Array.from(new Set(reasons));
}

export function calculateVehicleOperatingWeight(
  input: FleetOperatingWeightInput,
): FleetOperatingWeightOutput {
  const buildState = normalizeFleetBuildLoadoutState(input.buildState);
  const buildAccessories = toFleetAccessoryInstalls(buildState, input.vehicle.id);
  const frameworkAccessories = buildFleetFrameworkAccessoryInstalls(input.vehicle.id, input.frameworkContainerZones);
  const compartmentLoadoutItems = toFleetCompartmentLoadoutItems(buildState, input.vehicle.id);
  const legacyLoadoutItems = (input.legacyLoadoutItems ?? []).map((item) =>
    adaptLegacyLoadoutItemToFleetLoadoutItem(item, input.vehicle.id),
  );
  const accessories = [...frameworkAccessories, ...buildAccessories, ...(input.accessories ?? [])];
  const loadoutItems = [
    ...compartmentLoadoutItems,
    ...legacyLoadoutItems,
    ...(input.loadoutItems ?? []),
  ];
  const weightResult = calculateFleetWeightResult(input.vehicle, accessories, loadoutItems);
  const vehicleBaseline = createVehicleBaseline(input.vehicle);
  const centerOfGravity = calculateVehicleCenterOfGravity({
    vehicle: input.vehicle,
    accessories,
    loadoutItems,
    vehicleBaseline,
  });
  const dashboardData = computeWeightDashboardFromFleetWeightResult(weightResult, vehicleBaseline, centerOfGravity);
  const partialDataReasons = buildPartialDataReasons(weightResult, accessories, loadoutItems);

  return {
    accessories,
    loadoutItems,
    weightResult,
    vehicleBaseline,
    centerOfGravity,
    dashboardData: {
      ...dashboardData,
      vehicleType: input.vehicle.vehicleType,
      operatingWeightMeta: dashboardData.operatingWeightMeta
        ? {
            ...dashboardData.operatingWeightMeta,
            partialDataReasons: Array.from(new Set([...partialDataReasons, ...centerOfGravity.warnings])),
          }
        : undefined,
    },
    partialDataReasons: Array.from(new Set([...partialDataReasons, ...centerOfGravity.warnings])),
  };
}
