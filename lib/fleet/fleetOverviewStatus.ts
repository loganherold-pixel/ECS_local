import type {
  FleetWeightResult,
  FleetWeightSource,
  FleetWeightValue,
  FleetWeightValidationFlag,
} from './fleetPremiumDomain';

export type FleetOverviewVerificationStatus = 'Verified' | 'Needs verification' | 'Estimated';

export type FleetOverviewConfidenceInput = {
  id: string;
  name: string;
  weightResult: FleetWeightResult;
  vehicleSuggestions?: readonly string[];
};

export type FleetConfidenceNotice = {
  score: number | null;
  scoreLabel: string;
  title: string;
  summary: string;
  intelligenceSummary: string | null;
  intelligenceDetail: string | null;
  intelligenceConfidenceLabel: string | null;
  reasons: string[];
  improvements: string[];
};

export type FleetConfidenceIntelligenceInput = {
  confidenceLabel?: string | null;
  summary?: string | null;
  detail?: string | null;
  intelligenceItems?: readonly {
    summary: string;
    detail: string | null;
  }[];
  limitations?: readonly string[];
  missingCritical?: readonly string[];
  vehicleSuggestions?: readonly string[];
};

const VERIFIED_WEIGHT_SOURCES = new Set<FleetWeightSource>(['scale_ticket', 'vin_oem_match']);
const CATALOG_WEIGHT_SOURCES = new Set<FleetWeightSource>(['manufacturer_spec', 'exact_build_match']);

function sourceCopy(source: FleetWeightSource): string {
  return source.replace(/_/g, ' ');
}

function hasUsableWeightValue(value: FleetWeightValue | null | undefined): value is FleetWeightValue {
  return Boolean(value && Number.isFinite(value.lbs) && value.lbs > 0 && value.source !== 'unknown');
}

function isGenericEstimate(value: FleetWeightValue | null | undefined): boolean {
  return hasUsableWeightValue(value) && value.source === 'ecs_default';
}

function sourceIsVerifiedOrCatalog(value: FleetWeightValue | null | undefined): boolean {
  return hasUsableWeightValue(value) && (
    VERIFIED_WEIGHT_SOURCES.has(value.source) || CATALOG_WEIGHT_SOURCES.has(value.source)
  );
}

function targetForValidationFlag(flag: FleetWeightValidationFlag): string | null {
  switch (flag.id) {
    case 'gvwr-not-above-base-weight':
      return 'weight ratings';
    case 'payload-capacity-over-10000-unconfirmed':
      return 'payload rating';
    case 'gvwr-overage':
      return 'payload margin';
    case 'operating-weight-unavailable':
      return 'operating weight';
    default:
      return flag.severity === 'critical' ? 'weight ratings' : null;
  }
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanCopy(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function withoutPrefix(value: string, prefix: string): string {
  const clean = cleanCopy(value);
  return clean.toLowerCase().startsWith(prefix.toLowerCase())
    ? clean.slice(prefix.length).replace(/^[:\s]+/, '').trim()
    : clean;
}

function normalizeSentence(value: string | null | undefined): string | null {
  const clean = cleanCopy(value);
  if (!clean) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function buildIntelligenceNoticeCopy(
  intelligence: FleetConfidenceIntelligenceInput | null | undefined,
): Pick<FleetConfidenceNotice, 'intelligenceSummary' | 'intelligenceDetail' | 'intelligenceConfidenceLabel'> {
  const firstItem = intelligence?.intelligenceItems?.[0] ?? null;
  const summary =
    normalizeSentence(withoutPrefix(firstItem?.summary ?? intelligence?.summary ?? '', 'Key concern')) ??
    null;
  const detail =
    normalizeSentence(withoutPrefix(firstItem?.detail ?? intelligence?.detail ?? '', 'Recommendation')) ??
    null;
  const label = normalizeSentence(intelligence?.confidenceLabel ?? null);

  return {
    intelligenceSummary: summary,
    intelligenceDetail: detail,
    intelligenceConfidenceLabel: label,
  };
}

export function resolveFleetVerificationTargets(weightResult: FleetWeightResult): string[] {
  const targets: string[] = [];

  if (!hasUsableWeightValue(weightResult.baseNetWeight)) {
    targets.push('base weight');
  } else if (isGenericEstimate(weightResult.baseNetWeight)) {
    targets.push('base estimate');
  }

  if (!hasUsableWeightValue(weightResult.gvwr)) {
    targets.push('GVWR');
  } else if (isGenericEstimate(weightResult.gvwr)) {
    targets.push('GVWR source');
  }

  for (const flag of weightResult.validationFlags) {
    const target = targetForValidationFlag(flag);
    if (target) targets.push(target);
  }

  return unique(targets);
}

export function resolveFleetVerificationStatus(weightResult: FleetWeightResult): FleetOverviewVerificationStatus {
  const targets = resolveFleetVerificationTargets(weightResult);
  if (targets.length > 0) return 'Needs verification';
  if (
    weightResult.confidence >= 88 &&
    sourceIsVerifiedOrCatalog(weightResult.baseNetWeight) &&
    sourceIsVerifiedOrCatalog(weightResult.gvwr)
  ) {
    return 'Verified';
  }
  return 'Estimated';
}

function describeWeightSource(label: string, value: FleetWeightValue | null | undefined): string {
  if (!hasUsableWeightValue(value)) {
    return `${label} is missing`;
  }
  const source = value.sourceLabel ?? sourceCopy(value.source);
  return `${label}: ${Math.round(value.lbs).toLocaleString()} lb from ${source} (${Math.round(value.confidence)}% confidence)`;
}

function addImprovementForSource(
  improvements: string[],
  label: 'base weight' | 'GVWR',
  value: FleetWeightValue | null | undefined,
) {
  if (!hasUsableWeightValue(value)) {
    improvements.push(`Add the ${label} from the door placard, owner manual, saved spec, or measured record.`);
    return;
  }
  if (value.source === 'ecs_default') {
    improvements.push(`Replace the generic ECS ${label} estimate with the vehicle's exact saved value.`);
  }
}

export function buildFleetConfidenceNotice(
  vehicles: readonly FleetOverviewConfidenceInput[],
  intelligence?: FleetConfidenceIntelligenceInput | null,
): FleetConfidenceNotice {
  const intelligenceCopy = buildIntelligenceNoticeCopy(intelligence);
  if (vehicles.length === 0) {
    return {
      score: null,
      scoreLabel: '--',
      title: 'Fleet confidence is waiting on a vehicle profile.',
      summary: 'Add a vehicle profile and ECS will explain the confidence score from its saved Fleet inputs.',
      ...intelligenceCopy,
      reasons: ['No active vehicle weight profile is available yet.'],
      improvements: ['Add a vehicle, confirm base/curb weight, confirm GVWR, and stage a loadout when ready.'],
    };
  }

  const average = Math.round(
    vehicles.reduce((sum, vehicle) => sum + vehicle.weightResult.confidence, 0) / vehicles.length,
  );
  const reasons: string[] = [];
  const improvements: string[] = [];
  if (vehicles.length > 1) {
    reasons.push(
      `Fleet average combines ${vehicles.length} vehicle confidence scores: ${vehicles
        .map((vehicle) => `${vehicle.name} ${Math.round(vehicle.weightResult.confidence)}%`)
        .join(', ')}.`,
    );
  }

  for (const vehicle of vehicles) {
    const { weightResult } = vehicle;
    const score = Math.round(weightResult.confidence);
    reasons.push(`${vehicle.name}: ${score}% - ${weightResult.confidenceMetadata.copy}`);
    reasons.push(`${vehicle.name}: ${describeWeightSource('base/curb weight', weightResult.baseNetWeight)}.`);
    reasons.push(`${vehicle.name}: ${describeWeightSource('GVWR', weightResult.gvwr)}.`);

    if (weightResult.installedAccessoryWeight.lbs > 0) {
      reasons.push(
        `${vehicle.name}: installed accessories add ${Math.round(weightResult.installedAccessoryWeight.lbs).toLocaleString()} lb at ${Math.round(weightResult.installedAccessoryWeight.confidence)}% confidence.`,
      );
    }

    if (weightResult.activeLoadoutWeight.lbs > 0) {
      reasons.push(
        `${vehicle.name}: active loadout adds ${Math.round(weightResult.activeLoadoutWeight.lbs).toLocaleString()} lb at ${Math.round(weightResult.activeLoadoutWeight.confidence)}% confidence.`,
      );
    }

    for (const flag of weightResult.validationFlags) {
      reasons.push(`${vehicle.name}: ${flag.message}`);
    }

    addImprovementForSource(improvements, 'base weight', weightResult.baseNetWeight);
    addImprovementForSource(improvements, 'GVWR', weightResult.gvwr);

    for (const reason of intelligence?.missingCritical ?? []) {
      improvements.push(`Complete ${reason} so ECS can use that field in vehicle guidance.`);
    }
    for (const limitation of intelligence?.limitations ?? []) {
      reasons.push(`${vehicle.name}: ECS readiness is limited because ${limitation}.`);
    }
    for (const suggestion of intelligence?.vehicleSuggestions ?? []) {
      improvements.push(suggestion);
    }
    for (const suggestion of vehicle.vehicleSuggestions ?? []) {
      improvements.push(`${vehicle.name}: ${suggestion}`);
    }

    if (weightResult.installedAccessoryWeight.lbs > 0 && weightResult.installedAccessoryWeight.confidence < 80) {
      improvements.push('Replace accessory weight estimates with measured or manufacturer-listed weights.');
    }
    if (weightResult.activeLoadoutWeight.lbs > 0 && weightResult.activeLoadoutWeight.confidence < 80) {
      improvements.push('Use measured item weights or weigh loaded bins to improve loadout confidence.');
    }
  }

  return {
    score: average,
    scoreLabel: `${average}%`,
    title: vehicles.length === 1 ? `${vehicles[0].name} confidence is ${average}%.` : `Fleet confidence is ${average}%.`,
    summary:
      average >= 88
        ? vehicles.length === 1
          ? 'ECS has enough saved data for this vehicle to support confident operating-weight guidance.'
          : 'ECS has enough saved Fleet data to support confident operating-weight guidance.'
        : vehicles.length === 1
          ? 'ECS can calculate this vehicle operating weight; confidence is limited by incomplete accessory, loadout, consumable, or validation inputs.'
          : 'ECS can calculate operating weight; confidence is limited by incomplete accessory, loadout, consumable, or validation inputs.',
    ...intelligenceCopy,
    reasons: unique(reasons).slice(0, vehicles.length > 1 ? 8 : 5),
    improvements: unique(improvements).slice(0, vehicles.length > 1 ? 8 : 5),
  };
}
