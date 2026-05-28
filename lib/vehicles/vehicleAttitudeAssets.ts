import {
  VEHICLE_ATTITUDE_ASSETS,
  getVehicleAttitudeAsset,
  type VehicleAttitudeAssetRegistryEntry,
} from '../../src/features/attitude/vehicleAttitudeAssets';

export interface VehicleAttitudeAssets extends VehicleAttitudeAssetRegistryEntry {
  vehicleKey: VehicleAttitudeKey;
  fallbackUsed: boolean;
}

export interface NormalizedVehicleMakeModel {
  make: string;
  model: string;
  bodyType: string;
  searchText: string;
}

export type VehicleAttitudeProfileInput = {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  name?: string | null;
  type?: string | null;
  bodyType?: string | null;
  body_type?: string | null;
  vehicleType?: string | null;
  vehicle_type?: string | null;
  platformType?: string | null;
  platform_type?: string | null;
  trim?: string | null;
  wizard_config?: Record<string, unknown> | null;
} | null | undefined;

export type VehicleAttitudeKey = keyof typeof VEHICLE_ATTITUDE_ASSETS;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function compactText(value: string): string {
  return value.replace(/[^a-z0-9]+/g, '');
}

function readWizardValue(
  profile: VehicleAttitudeProfileInput,
  key: 'vehicleType' | 'platformType' | 'bodyType',
): string {
  const wizardConfig = profile?.wizard_config;
  return normalizeText(wizardConfig && typeof wizardConfig === 'object' ? wizardConfig[key] : null);
}

export function normalizeVehicleMakeModel(
  vehicleProfile: VehicleAttitudeProfileInput,
): NormalizedVehicleMakeModel {
  const make = normalizeText(vehicleProfile?.make);
  const model = normalizeText(vehicleProfile?.model);
  const bodyType = [
    vehicleProfile?.bodyType,
    vehicleProfile?.body_type,
    vehicleProfile?.vehicleType,
    vehicleProfile?.vehicle_type,
    vehicleProfile?.platformType,
    vehicleProfile?.platform_type,
    readWizardValue(vehicleProfile, 'bodyType'),
    readWizardValue(vehicleProfile, 'vehicleType'),
    readWizardValue(vehicleProfile, 'platformType'),
    vehicleProfile?.type,
  ]
    .map(normalizeText)
    .find(Boolean) ?? '';
  const searchText = [
    make,
    model,
    normalizeText(vehicleProfile?.name),
    normalizeText(vehicleProfile?.trim),
    bodyType,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    make,
    model,
    bodyType,
    searchText,
  };
}

function buildAssets(
  vehicleKey: VehicleAttitudeKey,
  fallbackUsed: boolean,
): VehicleAttitudeAssets | null {
  const asset = getVehicleAttitudeAsset(vehicleKey);
  if (!asset) {
    return null;
  }

  return {
    ...asset,
    vehicleKey,
    fallbackUsed,
  };
}

function includesAny(searchText: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => searchText.includes(keyword));
}

const FALLBACK_VAN_KEYWORDS = ['van', 'campervan', 'camper van', 'sprinter', 'cargo van'];
const FALLBACK_SUV_KEYWORDS = [
  'suv',
  'sport utility',
  'passport',
  '4runner',
  '4 runner',
  'land cruiser',
  'sequoia',
  'gx',
  'lx',
  'bronco',
  'xterra',
  'pathfinder',
  'pilot',
  'highlander',
  'wrangler',
  'cherokee',
  'tahoe',
  'suburban',
  'yukon',
  'expedition',
  'armada',
  'r1s',
];
const FALLBACK_TRUCK_KEYWORDS = ['pickup', 'truck'];

function resolveExactVehicleKey(normalized: NormalizedVehicleMakeModel): VehicleAttitudeKey | null {
  const search = normalized.searchText;
  const compact = compactText(search);
  const make = normalized.make;
  const model = normalized.model;
  const compactModel = compactText(model);
  const isToyota = make.includes('toyota') || search.includes('toyota');
  const isFord = make.includes('ford') || search.includes('ford');
  const isRam = make.includes('ram') || search.includes('ram');
  const isJeep = make.includes('jeep') || search.includes('jeep');
  const isNissan = make.includes('nissan') || search.includes('nissan');
  const isChevrolet = make.includes('chevrolet') || make.includes('chevy') || search.includes('chevrolet') || search.includes('chevy');

  if (isJeep && search.includes('wrangler')) return 'jeep_wrangler';
  if (isJeep && search.includes('gladiator')) return 'jeep_gladiator';
  if (search.includes('wrangler')) return 'jeep_wrangler';
  if (search.includes('gladiator')) return 'jeep_gladiator';
  if ((isToyota || search.includes('tacoma')) && search.includes('tacoma')) return 'toyota_tacoma';
  if ((isToyota || compact.includes('4runner')) && (search.includes('4runner') || search.includes('4 runner') || compact.includes('4runner'))) return 'toyota_4runner';
  if ((isToyota || compact.includes('landcruiser')) && (search.includes('land cruiser') || compact.includes('landcruiser'))) return 'toyota_land_cruiser';
  if ((isFord || search.includes('bronco')) && search.includes('bronco')) return 'ford_bronco';
  if ((isFord || compactModel.includes('f150')) && (search.includes('f-150') || search.includes('f 150') || compactModel.includes('f150') || compact.includes('fordf150'))) return 'ford_f150';
  if ((isChevrolet || search.includes('colorado')) && search.includes('colorado')) return 'chevy_colorado';
  if ((make.includes('subaru') || search.includes('subaru') || search.includes('outback')) && search.includes('outback')) return 'subaru_outback';
  if (isRam && search.includes('1500')) return 'ram_1500';
  if ((isToyota || search.includes('sequoia')) && search.includes('sequoia')) return 'toyota_sequoia';
  if ((make.includes('lexus') || search.includes('lexus')) && (search.includes('lx') || compactModel === 'lx')) return 'lexus_lx';
  if (isRam && (search.includes('2500') || search.includes('3500') || search.includes('2500 3500'))) return 'ram_2500_3500';
  if (
    isFord &&
    (
      search.includes('super duty') ||
      search.includes('f-250') ||
      search.includes('f 250') ||
      search.includes('f-350') ||
      search.includes('f 350') ||
      compactModel.includes('f250') ||
      compactModel.includes('f350')
    )
  ) {
    return 'ford_super_duty';
  }
  if ((isNissan || search.includes('frontier')) && search.includes('frontier')) return 'nissan_frontier';
  if ((isNissan || search.includes('xterra')) && search.includes('xterra')) return 'nissan_xterra';
  if ((make.includes('mercedes') || search.includes('mercedes') || search.includes('sprinter')) && search.includes('sprinter')) return 'mercedes_benz_sprinter';
  if ((isToyota || search.includes('tundra')) && search.includes('tundra')) return 'toyota_tundra';
  if (search.includes('generic suv')) return 'generic_suv';
  if (search.includes('generic pickup') || search.includes('generic truck')) return 'generic_pickup';
  if (search.includes('generic van')) return 'generic_van';

  return null;
}

export function getFallbackAttitudeVehicleId(bodyType?: string | null): VehicleAttitudeKey {
  const normalizedBodyType = normalizeText(bodyType);
  const compact = compactText(normalizedBodyType);

  if (
    includesAny(normalizedBodyType, FALLBACK_VAN_KEYWORDS) ||
    compact.includes('campervan') ||
    compact.includes('cargovan')
  ) {
    return 'generic_van';
  }

  if (
    includesAny(normalizedBodyType, FALLBACK_SUV_KEYWORDS) ||
    compact.includes('sportutility') ||
    compact.includes('landcruiser')
  ) {
    return 'generic_suv';
  }

  if (
    includesAny(normalizedBodyType, FALLBACK_TRUCK_KEYWORDS) ||
    compact.includes('pickup') ||
    compact.includes('truck')
  ) {
    return 'generic_pickup';
  }

  return 'generic_suv';
}

export function getFallbackAttitudeAssets(bodyType?: string | null): VehicleAttitudeAssets | null {
  return buildAssets(getFallbackAttitudeVehicleId(bodyType), true);
}

export function resolveVehicleAttitudeAssetId(
  vehicleProfile: VehicleAttitudeProfileInput,
): VehicleAttitudeKey {
  const normalized = normalizeVehicleMakeModel(vehicleProfile);
  return resolveExactVehicleKey(normalized) ?? getFallbackAttitudeVehicleId(normalized.searchText || normalized.bodyType);
}

export function getVehicleAttitudeAssets(
  vehicleProfile: VehicleAttitudeProfileInput,
): VehicleAttitudeAssets | null {
  const normalized = normalizeVehicleMakeModel(vehicleProfile);
  const exactKey = resolveExactVehicleKey(normalized);

  if (exactKey) {
    return buildAssets(exactKey, false);
  }

  return getFallbackAttitudeAssets(normalized.searchText || normalized.bodyType);
}
