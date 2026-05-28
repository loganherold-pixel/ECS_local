import type { FleetVehicle, FleetWeightResult } from './fleetPremiumDomain';

export type ECSVehicleClass =
  | 'full_size_hd_truck'
  | 'full_size_half_ton_truck'
  | 'mid_size_truck'
  | 'full_size_suv'
  | 'mid_size_suv'
  | 'compact_suv_crossover'
  | 'short_wheelbase_4x4'
  | 'van_overland_van'
  | 'unknown_custom';

export type ECSVehicleClassConfidence = 'high' | 'medium' | 'low';

export type ECSVehicleClassificationTraits = {
  wheelbase: 'short' | 'medium' | 'long' | 'unknown';
  payloadProfile: 'light' | 'moderate' | 'heavy' | 'unknown';
  trailManeuverability: 'high' | 'balanced' | 'wide_or_long' | 'unknown';
  clearanceBias: 'low' | 'moderate' | 'high' | 'unknown';
};

export type ECSVehicleClassification = {
  classId: ECSVehicleClass;
  label: string;
  confidence: ECSVehicleClassConfidence;
  reasons: string[];
  traits: ECSVehicleClassificationTraits;
};

export type ECSVehicleClassificationInput = {
  vehicleType?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  wheelbaseInches?: number | null;
  gvwrLbs?: number | null;
  baseWeightLbs?: number | null;
  payloadCapacityLbs?: number | null;
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  groundClearanceInches?: number | null;
};

export type ECSVehicleSuggestionInput = {
  classification: ECSVehicleClassification;
  operatingWeightLbs?: number | null;
  payloadUsedPct?: number | null;
  remainingPayloadLbs?: number | null;
  payloadCapacityLbs?: number | null;
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  groundClearanceInches?: number | null;
  accessoryWeightLbs?: number | null;
  cargoLoadoutWeightLbs?: number | null;
  confidenceLevel?: FleetWeightResult['confidenceMetadata']['level'] | string | null;
  confidenceScore?: number | null;
};

const CLASS_LABELS: Record<ECSVehicleClass, string> = {
  full_size_hd_truck: 'Full-size HD truck',
  full_size_half_ton_truck: 'Full-size half-ton truck',
  mid_size_truck: 'Mid-size truck',
  full_size_suv: 'Full-size SUV',
  mid_size_suv: 'Mid-size SUV',
  compact_suv_crossover: 'Compact SUV / crossover',
  short_wheelbase_4x4: 'Short-wheelbase 4x4',
  van_overland_van: 'Van / overland van',
  unknown_custom: 'Unknown / custom vehicle',
};

const HD_TRUCK_MODELS = [
  '2500',
  '3500',
  'f250',
  'f 250',
  'f-250',
  'f350',
  'f 350',
  'f-350',
  'super duty',
  'silverado 2500',
  'silverado 3500',
  'sierra 2500',
  'sierra 3500',
];

const HALF_TON_MODELS = [
  '1500',
  'f150',
  'f 150',
  'f-150',
  'silverado 1500',
  'sierra 1500',
  'tundra',
  'titan',
];

const MID_SIZE_TRUCK_MODELS = [
  'tacoma',
  'colorado',
  'canyon',
  'ranger',
  'frontier',
  'gladiator',
  'ridgeline',
  'maverick',
  'santa cruz',
];

const FULL_SIZE_SUV_MODELS = [
  'tahoe',
  'suburban',
  'yukon',
  'expedition',
  'sequoia',
  'armada',
  'land cruiser',
  'lx',
  'escalade',
];

const MID_SIZE_SUV_MODELS = [
  '4runner',
  '4 runner',
  'grand cherokee',
  'gx',
  'xterra',
  'passport',
  'pathfinder',
  'pilot',
  'highlander',
  'telluride',
  'palisade',
];

const COMPACT_CROSSOVER_MODELS = [
  'outback',
  'forester',
  'crosstrek',
  'rav4',
  'rav 4',
  'cr-v',
  'crv',
  'bronco sport',
  'cherokee',
  'compass',
  'escape',
  'sportage',
  'tucson',
  'cx-5',
  'cx5',
];

const SHORT_WHEELBASE_MODELS = [
  'wrangler',
  'bronco',
  'jimny',
  'samurai',
  'fj cruiser',
  'defender 90',
];

const VAN_MODELS = [
  'sprinter',
  'transit',
  'promaster',
  'pro master',
  'vanagon',
  'e-series',
  'e series',
  'econoline',
  'express',
  'savana',
  'metris',
];

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(normalize(needle)));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function traitsForClass(
  classId: ECSVehicleClass,
  input: ECSVehicleClassificationInput,
): ECSVehicleClassificationTraits {
  const wheelbase = finiteNumber(input.wheelbaseInches);
  const payload = finiteNumber(input.payloadCapacityLbs);
  const tire = finiteNumber(input.tireSizeInches);
  const lift = finiteNumber(input.suspensionLiftInches);
  const clearance = finiteNumber(input.groundClearanceInches);

  const wheelbaseTrait =
    wheelbase == null
      ? classId === 'short_wheelbase_4x4'
        ? 'short'
        : classId === 'full_size_hd_truck' || classId === 'van_overland_van'
          ? 'long'
          : 'unknown'
      : wheelbase < 112
        ? 'short'
        : wheelbase > 135
          ? 'long'
          : 'medium';

  const payloadProfile =
    payload == null
      ? classId === 'full_size_hd_truck'
        ? 'heavy'
        : classId === 'compact_suv_crossover' || classId === 'short_wheelbase_4x4'
          ? 'light'
          : 'unknown'
      : payload >= 2200
        ? 'heavy'
        : payload >= 1200
          ? 'moderate'
          : 'light';

  const clearanceBias =
    clearance != null
      ? clearance >= 10
        ? 'high'
        : clearance >= 8
          ? 'moderate'
          : 'low'
      : tire != null && tire >= 35
        ? 'high'
        : lift != null && lift >= 2
          ? 'moderate'
          : classId === 'compact_suv_crossover'
            ? 'low'
            : 'unknown';

  const trailManeuverability =
    classId === 'short_wheelbase_4x4'
      ? 'high'
      : classId === 'full_size_hd_truck' || classId === 'full_size_suv' || classId === 'van_overland_van'
        ? 'wide_or_long'
        : classId === 'unknown_custom'
          ? 'unknown'
          : 'balanced';

  return {
    wheelbase: wheelbaseTrait,
    payloadProfile,
    trailManeuverability,
    clearanceBias,
  };
}

function buildClassification(
  classId: ECSVehicleClass,
  confidence: ECSVehicleClassConfidence,
  reasons: string[],
  input: ECSVehicleClassificationInput,
): ECSVehicleClassification {
  return {
    classId,
    label: CLASS_LABELS[classId],
    confidence,
    reasons,
    traits: traitsForClass(classId, input),
  };
}

export function classifyVehicle(input: ECSVehicleClassificationInput | FleetVehicle | null | undefined): ECSVehicleClassification {
  const source = (input ?? {}) as ECSVehicleClassificationInput & Partial<FleetVehicle>;
  const vehicleType = normalize(source.vehicleType);
  const make = normalize(source.make);
  const model = normalize(source.model);
  const trim = normalize(source.trim);
  const engine = normalize(source.engine);
  const drivetrain = normalize(source.drivetrain);
  const search = normalize([source.year, make, model, trim, engine, drivetrain, vehicleType].filter(Boolean).join(' '));
  const buildProfile = (source as FleetVehicle).buildProfile;
  const classificationInput: ECSVehicleClassificationInput = {
    vehicleType: source.vehicleType,
    year: source.year,
    make: source.make,
    model: source.model,
    trim: source.trim ?? buildProfile?.trim ?? null,
    engine: source.engine ?? buildProfile?.engine ?? null,
    drivetrain: source.drivetrain ?? buildProfile?.drivetrain ?? null,
    wheelbaseInches: source.wheelbaseInches ?? buildProfile?.wheelbaseIn ?? null,
    gvwrLbs: source.gvwrLbs ?? buildProfile?.gvwr?.lbs ?? null,
    baseWeightLbs:
      source.baseWeightLbs
      ?? buildProfile?.baseNetWeight?.lbs
      ?? buildProfile?.curbWeight?.lbs
      ?? buildProfile?.emptyWeight?.lbs
      ?? null,
    payloadCapacityLbs: source.payloadCapacityLbs,
    tireSizeInches: source.tireSizeInches ?? buildProfile?.tireSizeInches ?? null,
    suspensionLiftInches: source.suspensionLiftInches ?? buildProfile?.suspensionLiftInches ?? null,
    groundClearanceInches: source.groundClearanceInches ?? buildProfile?.groundClearanceInches ?? null,
  };
  const gvwr = finiteNumber(classificationInput.gvwrLbs);
  const baseWeight = finiteNumber(classificationInput.baseWeightLbs);
  const wheelbase = finiteNumber(classificationInput.wheelbaseInches);

  if (includesAny(search, VAN_MODELS) || vehicleType.includes('van')) {
    return buildClassification('van_overland_van', 'high', ['Model/type matches van or overland van patterns.'], classificationInput);
  }
  if (includesAny(search, SHORT_WHEELBASE_MODELS) || (wheelbase != null && wheelbase < 112 && (vehicleType.includes('suv') || vehicleType.includes('4x4')))) {
    return buildClassification('short_wheelbase_4x4', includesAny(search, SHORT_WHEELBASE_MODELS) ? 'high' : 'medium', ['Model or short wheelbase indicates a short-wheelbase 4x4.'], classificationInput);
  }
  if (includesAny(search, HD_TRUCK_MODELS) || (vehicleType.includes('truck') && ((gvwr ?? 0) >= 8500 || (baseWeight ?? 0) >= 6500))) {
    return buildClassification('full_size_hd_truck', includesAny(search, HD_TRUCK_MODELS) ? 'high' : 'medium', ['Model/specs indicate a full-size HD truck.'], classificationInput);
  }
  if (includesAny(search, HALF_TON_MODELS)) {
    return buildClassification('full_size_half_ton_truck', 'high', ['Model matches full-size half-ton truck patterns.'], classificationInput);
  }
  if (includesAny(search, MID_SIZE_TRUCK_MODELS)) {
    return buildClassification('mid_size_truck', 'high', ['Model matches mid-size truck patterns.'], classificationInput);
  }
  if (includesAny(search, FULL_SIZE_SUV_MODELS)) {
    return buildClassification('full_size_suv', 'high', ['Model matches full-size SUV patterns.'], classificationInput);
  }
  if (includesAny(search, MID_SIZE_SUV_MODELS)) {
    return buildClassification('mid_size_suv', 'high', ['Model matches mid-size SUV patterns.'], classificationInput);
  }
  if (includesAny(search, COMPACT_CROSSOVER_MODELS) || vehicleType.includes('crossover') || vehicleType.includes('wagon')) {
    return buildClassification('compact_suv_crossover', includesAny(search, COMPACT_CROSSOVER_MODELS) ? 'high' : 'medium', ['Model/type matches compact SUV, crossover, or wagon patterns.'], classificationInput);
  }
  if (vehicleType.includes('suv') || vehicleType.includes('sport utility')) {
    return buildClassification('mid_size_suv', 'low', ['SUV type is available but exact class needs verification.'], classificationInput);
  }
  if (vehicleType.includes('truck') && gvwr != null && gvwr >= 6000 && gvwr < 8500) {
    return buildClassification('full_size_half_ton_truck', 'medium', ['Truck GVWR indicates a full-size half-ton truck; verify exact model.'], classificationInput);
  }
  if (vehicleType.includes('pickup') || vehicleType.includes('truck')) {
    return buildClassification('mid_size_truck', 'low', ['Truck profile does not match HD or half-ton patterns.'], classificationInput);
  }

  return buildClassification('unknown_custom', 'low', ['Vehicle make/model/class is incomplete or custom.'], classificationInput);
}

export function buildVehicleIntelligenceSuggestions(input: ECSVehicleSuggestionInput): string[] {
  const suggestions: string[] = [];
  const {
    classification,
    payloadUsedPct,
    remainingPayloadLbs,
    tireSizeInches,
    suspensionLiftInches,
    groundClearanceInches,
    accessoryWeightLbs,
    cargoLoadoutWeightLbs,
    confidenceLevel,
    confidenceScore,
  } = input;

  switch (classification.classId) {
    case 'full_size_hd_truck':
      suggestions.push('Verify width, breakover, and turn-around space before treating truck capability as trail fit.');
      break;
    case 'full_size_half_ton_truck':
      suggestions.push('Use payload margin and rear load bias as primary checks after armor, drawers, and camp cargo.');
      break;
    case 'mid_size_truck':
      suggestions.push('Confirm payload after accessories and recovery gear; mid-size margins can tighten quickly.');
      break;
    case 'full_size_suv':
      suggestions.push('Watch rear cargo weight and approach/departure limits on tighter technical routes.');
      break;
    case 'mid_size_suv':
      suggestions.push('Balance clearance, tire size, and payload margin before increasing route difficulty.');
      break;
    case 'compact_suv_crossover':
      suggestions.push('Treat clearance, tire durability, and approach angle as limiting inputs on rough routes.');
      break;
    case 'short_wheelbase_4x4':
      suggestions.push('Short wheelbase helps maneuvering; keep roof and rear cargo weight conservative.');
      break;
    case 'van_overland_van':
      suggestions.push('Prioritize height, width, departure angle, and high-mounted load checks before narrow or off-camber routes.');
      break;
    case 'unknown_custom':
      suggestions.push('Add GVWR, curb weight, tire size, clearance, and drivetrain to improve ECS vehicle recommendations.');
      break;
    default:
      break;
  }

  if (payloadUsedPct != null) {
    if (payloadUsedPct >= 100) {
      suggestions.push('Operating estimate is above GVWR; reduce load or verify values before relying on route fit.');
    } else if (payloadUsedPct >= 85) {
      suggestions.push('Payload margin is tight; keep optional cargo low and centered.');
    }
  } else if (remainingPayloadLbs == null) {
    suggestions.push('Payload margin is unavailable until GVWR and base weight are verified.');
  }

  if ((accessoryWeightLbs ?? 0) + (cargoLoadoutWeightLbs ?? 0) > 600) {
    suggestions.push('Accessory and cargo weight are material; verify scale weight for stronger recommendations.');
  }

  if (classification.traits.clearanceBias === 'low' && (groundClearanceInches == null || groundClearanceInches < 8)) {
    suggestions.push('Clearance appears limited or unknown; verify before using high-clearance route assumptions.');
  }

  if ((tireSizeInches ?? 0) >= 35 || (suspensionLiftInches ?? 0) >= 2) {
    suggestions.push('Modified tire/lift data is included; verify spare, gearing, and loaded handling after changes.');
  }

  const confidence = String(confidenceLevel ?? '').toLowerCase();
  if (
    classification.confidence !== 'high'
    || confidence === 'incomplete'
    || confidence === 'unknown'
    || (confidenceScore != null && confidenceScore < 70)
  ) {
    suggestions.push('ECS is using estimates; enter saved base/GVWR, accessory, and loadout values for higher confidence.');
  }

  return Array.from(new Set(suggestions)).slice(0, 5);
}
