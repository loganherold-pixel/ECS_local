import { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { getActiveVehicleContext, type ActiveVehicleContext } from './activeVehicleContext';
import {
  getAttitudeMonitorHeroAssetDefinition,
  getAttitudeMonitorHeroSource as getHeroSourceFromAssets,
} from './attitudeMonitorAssets';
import {
  getVehicleAttitudeAssets,
  resolveVehicleAttitudeAssetId,
  type VehicleAttitudeAssets,
  type VehicleAttitudeKey,
  type VehicleAttitudeProfileInput,
} from './vehicles/vehicleAttitudeAssets';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { vehicleStore } from './vehicleStore';

export type AttitudeMonitorVehicleVisualFamilyId =
  | 'default-truck'
  | 'midsize-truck'
  | 'heavy-duty-truck'
  | 'suv'
  | 'van'
  | 'crossover';

export interface AttitudeMonitorHeroInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AttitudeMonitorHeroPoint {
  x: number;
  y: number;
}

export interface AttitudeMonitorHeroFitProfile {
  aspectRatio: number;
  widthCoverage: number;
  heightCoverage: number;
  compactWidthCoverage: number;
  scaleBias: number;
  neutralOffset: AttitudeMonitorHeroPoint;
  anchorPoint: AttitudeMonitorHeroPoint;
  motionPivot: AttitudeMonitorHeroPoint;
  cropSafeInsets: AttitudeMonitorHeroInsets;
  shadowWidthRatio: number;
  shadowBottomRatio: number;
  shadowOpacity: number;
}

export interface AttitudeMonitorVehicleVisualFamilyDefinition {
  id: AttitudeMonitorVehicleVisualFamilyId;
  displayName: string;
  assetSource: ImageSourcePropType;
  compactAssetSource?: ImageSourcePropType | null;
  fit: AttitudeMonitorHeroFitProfile;
}

export interface AttitudeMonitorVehicleVisualDescriptor {
  familyId: AttitudeMonitorVehicleVisualFamilyId;
  displayName: string;
  assetSource: ImageSourcePropType;
  rearAssetSource: ImageSourcePropType;
  compactAssetSource?: ImageSourcePropType | null;
  fit: AttitudeMonitorHeroFitProfile;
  attitudeAssets: VehicleAttitudeAssets | null;
  attitudeVehicleId: string;
  missingVehicleId: string | null;
  usesFallbackFamily: boolean;
  usesFallbackAsset: boolean;
  matchedVehicleId: string | null;
}

export interface VehicleAttitudeBackdropResolution {
  attitudeVehicleId: VehicleAttitudeKey;
  backdropSrc: string | undefined;
  backdropSource: ImageSourcePropType | null;
  isFallback: boolean;
}

export const DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID: AttitudeMonitorVehicleVisualFamilyId =
  'default-truck';

const BASE_TRUCK_FIT: AttitudeMonitorHeroFitProfile = {
  aspectRatio: 1.47,
  widthCoverage: 0.96,
  heightCoverage: 0.86,
  compactWidthCoverage: 0.95,
  scaleBias: 1.01,
  neutralOffset: { x: 0, y: 0.004 },
  anchorPoint: { x: 0.5, y: 0.74 },
  motionPivot: { x: 0.5, y: 0.68 },
  cropSafeInsets: { top: 0.08, right: 0.06, bottom: 0.05, left: 0.06 },
  shadowWidthRatio: 0.56,
  shadowBottomRatio: 0.235,
  shadowOpacity: 0.46,
};

function createFit(overrides: Partial<AttitudeMonitorHeroFitProfile>): AttitudeMonitorHeroFitProfile {
  return {
    ...BASE_TRUCK_FIT,
    ...overrides,
    neutralOffset: { ...BASE_TRUCK_FIT.neutralOffset, ...overrides.neutralOffset },
    anchorPoint: { ...BASE_TRUCK_FIT.anchorPoint, ...overrides.anchorPoint },
    motionPivot: { ...BASE_TRUCK_FIT.motionPivot, ...overrides.motionPivot },
    cropSafeInsets: { ...BASE_TRUCK_FIT.cropSafeInsets, ...overrides.cropSafeInsets },
  };
}

// Family slots are centralized here so future approved hero art can land
// without reopening the Attitude Monitor layout or motion system.
export const ATTITUDE_MONITOR_VEHICLE_VISUAL_FAMILIES: Record<
  AttitudeMonitorVehicleVisualFamilyId,
  AttitudeMonitorVehicleVisualFamilyDefinition
> = {
  'default-truck': {
    id: 'default-truck',
    displayName: 'Full-size truck',
    assetSource: getAttitudeMonitorHeroAssetDefinition('default-truck').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('default-truck').compactSource,
    fit: createFit({}),
  },
  'midsize-truck': {
    id: 'midsize-truck',
    displayName: 'Midsize truck',
    assetSource: getAttitudeMonitorHeroAssetDefinition('midsize-truck').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('midsize-truck').compactSource,
    fit: createFit({
      scaleBias: 1.02,
      neutralOffset: { x: 0, y: 0.002 },
      shadowWidthRatio: 0.55,
    }),
  },
  'heavy-duty-truck': {
    id: 'heavy-duty-truck',
    displayName: 'Heavy-duty truck',
    assetSource: getAttitudeMonitorHeroAssetDefinition('heavy-duty-truck').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('heavy-duty-truck').compactSource,
    fit: createFit({
      scaleBias: 0.94,
      widthCoverage: 0.95,
      compactWidthCoverage: 0.93,
      neutralOffset: { x: 0, y: 0.012 },
      cropSafeInsets: { top: 0.09, right: 0.07, bottom: 0.04, left: 0.07 },
      shadowWidthRatio: 0.61,
      shadowOpacity: 0.48,
    }),
  },
  suv: {
    id: 'suv',
    displayName: 'Overland SUV',
    assetSource: getAttitudeMonitorHeroAssetDefinition('suv').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('suv').compactSource,
    fit: createFit({
      aspectRatio: 1.4,
      widthCoverage: 0.95,
      compactWidthCoverage: 0.93,
      scaleBias: 0.98,
      neutralOffset: { x: 0, y: 0.004 },
      cropSafeInsets: { top: 0.08, right: 0.08, bottom: 0.05, left: 0.08 },
      shadowWidthRatio: 0.52,
    }),
  },
  van: {
    id: 'van',
    displayName: 'Expedition van',
    assetSource: getAttitudeMonitorHeroAssetDefinition('van').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('van').compactSource,
    fit: createFit({
      aspectRatio: 1.55,
      widthCoverage: 0.94,
      compactWidthCoverage: 0.92,
      scaleBias: 0.92,
      neutralOffset: { x: 0, y: 0.015 },
      cropSafeInsets: { top: 0.1, right: 0.09, bottom: 0.04, left: 0.09 },
      shadowWidthRatio: 0.6,
      shadowBottomRatio: 0.215,
      shadowOpacity: 0.48,
    }),
  },
  crossover: {
    id: 'crossover',
    displayName: 'Crossover / wagon',
    assetSource: getAttitudeMonitorHeroAssetDefinition('crossover').primarySource,
    compactAssetSource: getAttitudeMonitorHeroAssetDefinition('crossover').compactSource,
    fit: createFit({
      aspectRatio: 1.38,
      widthCoverage: 0.93,
      compactWidthCoverage: 0.91,
      scaleBias: 0.97,
      neutralOffset: { x: 0, y: 0.003 },
      cropSafeInsets: { top: 0.08, right: 0.09, bottom: 0.05, left: 0.09 },
      shadowWidthRatio: 0.5,
    }),
  },
};

const HEAVY_DUTY_KEYWORDS = [
  '2500',
  '3500',
  '350',
  '450',
  '550',
  'f-250',
  'f250',
  'f-350',
  'f350',
  'super duty',
  'hd',
  'heavy duty',
  'dually',
  'cummins',
  'power wagon',
];

const MIDSIZE_TRUCK_KEYWORDS = [
  'tacoma',
  'frontier',
  'ranger',
  'colorado',
  'canyon',
  'gladiator',
  'santa cruz',
  'ridgeline',
  'maverick',
];

const VAN_KEYWORDS = [
  'sprinter',
  'transit',
  'promaster',
  'van',
  'campervan',
  'camper van',
  'econoline',
  'express',
  'savana',
];

const SUV_KEYWORDS = [
  '4runner',
  'sequoia',
  'land cruiser',
  'landcruiser',
  'gx',
  'lx',
  'bronco',
  'tahoe',
  'suburban',
  'yukon',
  'armada',
  'grenadier',
  'wrangler',
  'cherokee',
  'passport',
  'rav4',
  'r1s',
  'expedition',
  'suv',
];

const CROSSOVER_KEYWORDS = [
  'forester',
  'outback',
  'crosstrek',
  'wagon',
  'crossover',
];

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function resolveFamilyId(
  context?: Pick<ActiveVehicleContext, 'vehicle' | 'spec' | 'wizardConfig'> | null,
): AttitudeMonitorVehicleVisualFamilyId {
  if (!context?.vehicle) {
    return DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID;
  }

  const vehicle = context.vehicle;
  const vehicleType = normalize(vehicle.type);
  const make = normalize(vehicle.make);
  const model = normalize(vehicle.model);
  const name = normalize(vehicle.name);
  const wizardType = normalize(
    typeof context.wizardConfig?.vehicleType === 'string'
      ? context.wizardConfig.vehicleType
      : typeof context.wizardConfig?.platformType === 'string'
        ? context.wizardConfig.platformType
        : null,
  );
  const combined = [vehicleType, wizardType, make, model, name].filter(Boolean).join(' ');
  const gvwr = context.spec?.gvwr_lb ?? null;
  const baseWeight = context.spec?.base_weight_lb ?? null;
  const heavyByWeight =
    (gvwr != null && gvwr >= 8500) ||
    (baseWeight != null && baseWeight >= 6400);

  if (includesAny(combined, VAN_KEYWORDS)) {
    return 'van';
  }

  if (includesAny(combined, CROSSOVER_KEYWORDS) || vehicleType === 'car_crossover') {
    return includesAny(combined, MIDSIZE_TRUCK_KEYWORDS) ? 'midsize-truck' : 'crossover';
  }

  if (includesAny(combined, SUV_KEYWORDS)) {
    return 'suv';
  }

  if (vehicleType === 'jeep') {
    return model.includes('gladiator') ? 'midsize-truck' : 'suv';
  }

  if (heavyByWeight || includesAny(combined, HEAVY_DUTY_KEYWORDS)) {
    return 'heavy-duty-truck';
  }

  if (vehicleType === 'truck' || includesAny(combined, MIDSIZE_TRUCK_KEYWORDS)) {
    return includesAny(combined, MIDSIZE_TRUCK_KEYWORDS) ? 'midsize-truck' : 'default-truck';
  }

  return DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID;
}

export function getAttitudeMonitorVehicleDescriptor(
  familyId?: AttitudeMonitorVehicleVisualFamilyId | null,
): AttitudeMonitorVehicleVisualFamilyDefinition {
  if (!familyId) {
    return ATTITUDE_MONITOR_VEHICLE_VISUAL_FAMILIES[DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID];
  }
  return (
    ATTITUDE_MONITOR_VEHICLE_VISUAL_FAMILIES[familyId] ??
    ATTITUDE_MONITOR_VEHICLE_VISUAL_FAMILIES[DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID]
  );
}

function createVehicleAttitudeProfileInput(
  context?: Pick<ActiveVehicleContext, 'vehicle' | 'wizardConfig'> | null,
): VehicleAttitudeProfileInput {
  if (!context?.vehicle && !context?.wizardConfig) {
    return null;
  }

  return {
    ...(context.vehicle ?? {}),
    wizard_config: context.wizardConfig ?? context.vehicle?.wizard_config ?? null,
  };
}

export function resolveAttitudeMonitorVehicleVisual(
  context?: Pick<ActiveVehicleContext, 'activeVehicleId' | 'vehicle' | 'spec' | 'wizardConfig'> | null,
): AttitudeMonitorVehicleVisualDescriptor {
  // Presentation surfaces consume this normalized descriptor so Fleet matching,
  // hero fallback, and per-family fit metadata stay centralized here.
  const requestedFamilyId = resolveFamilyId(context ?? null);
  const family = getAttitudeMonitorVehicleDescriptor(requestedFamilyId);
  const fallbackFamily = getAttitudeMonitorVehicleDescriptor(DEFAULT_ATTITUDE_MONITOR_VEHICLE_FAMILY_ID);
  const attitudeProfile = createVehicleAttitudeProfileInput(context ?? null);
  const attitudeVehicleId = resolveVehicleAttitudeAssetId(attitudeProfile);
  const attitudeAssets = getVehicleAttitudeAssets(attitudeProfile);
  const assetSource = attitudeAssets?.attitudeImageSource ?? family.assetSource ?? fallbackFamily.assetSource;
  const compactAssetSource = attitudeAssets?.attitudeImageSource ?? family.compactAssetSource ?? family.assetSource ?? fallbackFamily.assetSource;
  const usesFallbackFamily = family.id !== requestedFamilyId;
  const usesFallbackAsset = attitudeAssets?.fallbackUsed ?? false;
  const fit = family.fit;

  return {
    familyId: family.id,
    displayName: family.displayName,
    assetSource,
    rearAssetSource: assetSource,
    compactAssetSource,
    fit,
    attitudeAssets,
    attitudeVehicleId,
    missingVehicleId: attitudeAssets ? null : attitudeVehicleId,
    usesFallbackFamily,
    usesFallbackAsset,
    matchedVehicleId: context?.activeVehicleId ?? context?.vehicle?.id ?? null,
  };
}

export function resolveAttitudeMonitorVehicleId(
  context?: Pick<ActiveVehicleContext, 'vehicle' | 'wizardConfig'> | null,
): VehicleAttitudeKey {
  return resolveVehicleAttitudeAssetId(createVehicleAttitudeProfileInput(context ?? null));
}

function isVehicleContextInput(
  value: Pick<ActiveVehicleContext, 'vehicle' | 'wizardConfig'> | VehicleAttitudeProfileInput | null | undefined,
): value is Pick<ActiveVehicleContext, 'vehicle' | 'wizardConfig'> {
  return Boolean(value && ('vehicle' in value || 'wizardConfig' in value));
}

export function resolveVehicleAttitudeBackdrop(
  context?: Pick<ActiveVehicleContext, 'vehicle' | 'wizardConfig'> | VehicleAttitudeProfileInput | null,
): VehicleAttitudeBackdropResolution {
  const vehicleProfile = isVehicleContextInput(context)
    ? createVehicleAttitudeProfileInput(context)
    : ((context ?? null) as VehicleAttitudeProfileInput | null);
  const attitudeVehicleId = resolveVehicleAttitudeAssetId(vehicleProfile);
  const attitudeAssets = getVehicleAttitudeAssets(vehicleProfile);

  return {
    attitudeVehicleId,
    backdropSrc: attitudeAssets?.attitudeImageSrc,
    backdropSource: attitudeAssets?.attitudeImageSource ?? null,
    isFallback: attitudeAssets?.fallbackUsed ?? true,
  };
}

export function getVehicleAttitudeBackdropSrc(
  vehicleProfile?: VehicleAttitudeProfileInput | null,
): string | undefined {
  return resolveVehicleAttitudeBackdrop(vehicleProfile ?? null).backdropSrc;
}

export function getAttitudeMonitorHeroSource(
  descriptor: Pick<AttitudeMonitorVehicleVisualDescriptor, 'assetSource' | 'compactAssetSource'>,
  options?: { compact?: boolean; automotive?: boolean },
): ImageSourcePropType {
  return getHeroSourceFromAssets(
    {
      primarySource: descriptor.assetSource,
      compactSource: descriptor.compactAssetSource,
      automotiveSource: null,
    },
    options,
  );
}

export function useActiveAttitudeMonitorVehicleVisual(
  context?: ActiveVehicleContext | null,
): AttitudeMonitorVehicleVisualDescriptor {
  const [activeContext, setActiveContext] = useState<ActiveVehicleContext>(() => context ?? getActiveVehicleContext());

  useEffect(() => {
    if (context) {
      setActiveContext(context);
      return undefined;
    }

    const sync = () => {
      setActiveContext(getActiveVehicleContext());
    };

    sync();

    const unsubscribers = [
      vehicleSetupStore.subscribe(sync),
      vehicleSpecStore.subscribe(sync),
      vehicleStore.subscribe(() => sync()),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [context]);

  return useMemo(
    () => resolveAttitudeMonitorVehicleVisual(context ?? activeContext),
    [context, activeContext],
  );
}

export function useActiveAttitudeMonitorVehicleId(
  context?: ActiveVehicleContext | null,
): string {
  return useActiveAttitudeMonitorVehicleVisual(context).attitudeVehicleId;
}

export function useActiveVehicleAttitudeBackdrop(
  context?: ActiveVehicleContext | null,
): VehicleAttitudeBackdropResolution {
  const visual = useActiveAttitudeMonitorVehicleVisual(context);

  return useMemo(
    () => ({
      attitudeVehicleId: visual.attitudeVehicleId as VehicleAttitudeKey,
      backdropSrc: visual.attitudeAssets?.attitudeImageSrc,
      backdropSource: visual.attitudeAssets?.attitudeImageSource ?? null,
      isFallback: visual.usesFallbackAsset,
    }),
    [visual],
  );
}
