import {
  calculateFleetWeightResult,
  createFleetWeightValue,
  type FleetAccessoryInstall,
  type FleetLoadZone,
  type FleetLoadoutItem,
  type FleetRiskLevel,
  type FleetVehicle,
  type FleetWeightResult,
  type FleetWeightSource,
  type FleetWeightValue,
} from './fleetPremiumDomain';

export type SourceKind = 'user_confirmed' | 'oem' | 'default' | 'estimated';

export type EvidenceValue<T> = {
  value: T;
  sourceKind: SourceKind;
  confidence: number;
  sourceLabel?: string | null;
  observedAt?: string | null;
};

export type LoadoutConsequenceAvailability = 'available' | 'partial' | 'unavailable';

export type LoadoutConsequenceRouteContext = {
  difficulty?: 'easy' | 'moderate' | 'hard' | 'unknown' | null;
  terrainRisk?: FleetRiskLevel | 'unknown' | null;
  remoteness?: 'low' | 'medium' | 'high' | 'unknown' | null;
  recoveryPosture?: 'nearby' | 'limited' | 'remote' | 'unknown' | null;
  readinessThreshold?: FleetRiskLevel | null;
};

export type LoadoutConsequenceTrailerState = {
  attached?: boolean | null;
  tongueWeightLb?: EvidenceValue<number> | number | null;
  trailerWeightLb?: EvidenceValue<number> | number | null;
};

export type LoadoutConsequenceTireLiftState = {
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  isLeveled?: boolean | null;
};

export type LoadoutConsequenceVehicleSpecEvidence = {
  gvwr?: EvidenceValue<number> | null;
  baseWeight?: EvidenceValue<number> | null;
  curbWeight?: EvidenceValue<number> | null;
  emptyWeight?: EvidenceValue<number> | null;
  netPayload?: EvidenceValue<number> | null;
};

export type LoadoutConsequenceInput = {
  vehicleId: string;
  vehicle: FleetVehicle;
  vehicleSpecEvidence?: LoadoutConsequenceVehicleSpecEvidence | null;
  currentAccessories?: readonly FleetAccessoryInstall[] | null;
  currentLoadoutItems?: readonly FleetLoadoutItem[] | null;
  proposedAccessories?: readonly FleetAccessoryInstall[] | null;
  proposedLoadoutItems?: readonly FleetLoadoutItem[] | null;
  accessoryChanges?: {
    add?: readonly FleetAccessoryInstall[] | null;
    update?: readonly FleetAccessoryInstall[] | null;
    removeIds?: readonly string[] | null;
  } | null;
  loadoutChanges?: {
    add?: readonly FleetLoadoutItem[] | null;
    update?: readonly FleetLoadoutItem[] | null;
    removeIds?: readonly string[] | null;
  } | null;
  trailerState?: LoadoutConsequenceTrailerState | null;
  routeContext?: LoadoutConsequenceRouteContext | null;
  tireLiftState?: LoadoutConsequenceTireLiftState | null;
  calculationMode?: 'preview' | 'committed';
  generatedAt?: string | null;
};

export type LoadoutConsequenceImpact = {
  level: FleetRiskLevel | 'unknown';
  before: FleetRiskLevel | 'unknown';
  after: FleetRiskLevel | 'unknown';
  delta: 'improved' | 'unchanged' | 'worsened' | 'unavailable';
  label: string;
  reasons: string[];
};

export type LoadoutConsequenceSuggestion = {
  id: string;
  action: 'relocate' | 'remove' | 'verify_weight' | 'confirm_source';
  itemId?: string | null;
  itemName: string;
  fromZone?: FleetLoadZone | null;
  targetZone?: FleetLoadZone | null;
  estimatedImpactLb: number;
  priority: number;
  reason: string;
  evidenceEvents: LoadoutConsequenceEvidenceEventName[];
};

export type LoadoutConsequenceSourceWarning = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  field?: string | null;
  sourceKind?: SourceKind | null;
  message: string;
};

export type LoadoutConsequenceEvidenceEventName =
  | 'preview_generated'
  | 'suggestion_viewed'
  | 'suggestion_accepted'
  | 'source_confirmed'
  | 'warning_acknowledged'
  | 'loadout_committed';

export type LoadoutConsequencePreview = {
  vehicleId: string;
  generatedAt: string;
  readiness: 'current_user_facing_extension';
  availability: LoadoutConsequenceAvailability;
  payloadRemainingBefore: number | null;
  payloadRemainingAfter: number | null;
  gvwrPercentBefore: number | null;
  gvwrPercentAfter: number | null;
  loadedVehicleWeightBefore: number | null;
  loadedVehicleWeightAfter: number | null;
  payloadDeltaLb: number | null;
  gvwrPercentDelta: number | null;
  topHeavyRisk: LoadoutConsequenceImpact;
  recoveryDifficultyImpact: LoadoutConsequenceImpact;
  routeSuitabilityImpact: LoadoutConsequenceImpact;
  suggestions: LoadoutConsequenceSuggestion[];
  sourceWarnings: LoadoutConsequenceSourceWarning[];
  mainRisk: string;
  evidenceEvents: LoadoutConsequenceEvidenceEventName[];
  beforeWeight: FleetWeightResult;
  afterWeight: FleetWeightResult;
};

export type CommandBriefLoadoutConsequenceSummary = {
  vehicleId: string;
  status: FleetRiskLevel | 'unknown';
  mainRisk: string;
  payloadRemainingAfter: number | null;
  gvwrPercentAfter: number | null;
  topHeavyRisk: FleetRiskLevel | 'unknown';
  recoveryDifficulty: FleetRiskLevel | 'unknown';
  routeSuitability: FleetRiskLevel | 'unknown';
  suggestionCount: number;
  warningCount: number;
  readiness: 'current_user_facing_extension';
  generatedAt: string;
};

export type LoadoutConsequencePreviewSnapshot = {
  preview: LoadoutConsequencePreview | null;
  summary: CommandBriefLoadoutConsequenceSummary | null;
  updatedAt: string | null;
};

const SOURCE_KIND_PRIORITY: Record<SourceKind, number> = {
  user_confirmed: 4,
  oem: 3,
  default: 2,
  estimated: 1,
};

const RISK_RANK: Record<FleetRiskLevel | 'unknown', number> = {
  unknown: -1,
  clear: 0,
  watch: 1,
  caution: 2,
  critical: 3,
};

const SUPPORTED_EVIDENCE_EVENTS: LoadoutConsequenceEvidenceEventName[] = [
  'preview_generated',
  'suggestion_viewed',
  'suggestion_accepted',
  'source_confirmed',
  'warning_acknowledged',
  'loadout_committed',
];

let snapshot: LoadoutConsequencePreviewSnapshot = {
  preview: null,
  summary: null,
  updatedAt: null,
};

const listeners = new Set<() => void>();

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundTenths(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function roundLbs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function clampConfidence(value: number | null | undefined): number {
  const numeric = finiteNumber(value);
  if (numeric == null) return 50;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function riskMax(...levels: Array<FleetRiskLevel | 'unknown' | null | undefined>): FleetRiskLevel | 'unknown' {
  let selected: FleetRiskLevel | 'unknown' = 'unknown';
  for (const level of levels) {
    if (!level) continue;
    if (RISK_RANK[level] > RISK_RANK[selected]) selected = level;
  }
  return selected;
}

function riskDelta(before: FleetRiskLevel | 'unknown', after: FleetRiskLevel | 'unknown'): LoadoutConsequenceImpact['delta'] {
  if (before === 'unknown' || after === 'unknown') return 'unavailable';
  if (RISK_RANK[after] > RISK_RANK[before]) return 'worsened';
  if (RISK_RANK[after] < RISK_RANK[before]) return 'improved';
  return 'unchanged';
}

function riskFromScore(score: number): FleetRiskLevel {
  if (score >= 5) return 'critical';
  if (score >= 3) return 'caution';
  if (score >= 1) return 'watch';
  return 'clear';
}

function riskFromGvwrUsage(gvwrUsagePct: number | null | undefined): FleetRiskLevel | 'unknown' {
  if (typeof gvwrUsagePct !== 'number' || !Number.isFinite(gvwrUsagePct)) return 'unknown';
  if (gvwrUsagePct >= 95) return 'critical';
  if (gvwrUsagePct >= 90) return 'caution';
  if (gvwrUsagePct >= 85) return 'watch';
  return 'clear';
}

function sourceKindToFleetWeightSource(sourceKind: SourceKind): FleetWeightSource {
  if (sourceKind === 'user_confirmed') return 'scale_ticket';
  if (sourceKind === 'oem') return 'manufacturer_spec';
  if (sourceKind === 'default') return 'ecs_default';
  return 'user_estimate';
}

function fleetWeightSourceToSourceKind(source: FleetWeightSource | null | undefined): SourceKind {
  if (source === 'scale_ticket') return 'user_confirmed';
  if (source === 'vin_oem_match' || source === 'manufacturer_spec' || source === 'exact_build_match') return 'oem';
  if (source === 'ecs_default') return 'default';
  return 'estimated';
}

function evidenceToWeightValue(
  evidence: EvidenceValue<number>,
  fallbackLabel: string,
  forceEstimated = false,
): FleetWeightValue {
  const sourceKind = forceEstimated ? 'estimated' : evidence.sourceKind;
  return createFleetWeightValue(evidence.value, sourceKindToFleetWeightSource(sourceKind), {
    confidence: clampConfidence(forceEstimated ? Math.min(evidence.confidence, 72) : evidence.confidence),
    sourceLabel: evidence.sourceLabel ?? fallbackLabel,
    verifiedAt: forceEstimated ? null : evidence.observedAt ?? null,
  });
}

function normalizeEvidence(value: EvidenceValue<number> | number | null | undefined, sourceLabel: string): EvidenceValue<number> | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      value,
      sourceKind: 'estimated',
      confidence: 55,
      sourceLabel,
      observedAt: null,
    };
  }
  if (!value || typeof value !== 'object') return null;
  const numeric = finiteNumber(value.value);
  if (numeric == null) return null;
  return {
    value: numeric,
    sourceKind: value.sourceKind,
    confidence: clampConfidence(value.confidence),
    sourceLabel: value.sourceLabel ?? sourceLabel,
    observedAt: value.observedAt ?? null,
  };
}

export function resolveEvidenceValue<T>(values: readonly (EvidenceValue<T> | null | undefined)[]): EvidenceValue<T> {
  const candidates = values.filter((item): item is EvidenceValue<T> => Boolean(item));
  if (candidates.length === 0) {
    throw new Error('resolveEvidenceValue requires at least one evidence value.');
  }
  return [...candidates].sort((left, right) => {
    const sourceDelta = SOURCE_KIND_PRIORITY[right.sourceKind] - SOURCE_KIND_PRIORITY[left.sourceKind];
    if (sourceDelta !== 0) return sourceDelta;
    return clampConfidence(right.confidence) - clampConfidence(left.confidence);
  })[0];
}

function hasUsableWeight(value: FleetWeightValue | null | undefined): value is FleetWeightValue {
  return Boolean(value && Number.isFinite(value.lbs) && value.lbs > 0);
}

function withVehicleSpecEvidence(input: LoadoutConsequenceInput): {
  vehicle: FleetVehicle;
  warnings: LoadoutConsequenceSourceWarning[];
  coreMissing: { base: boolean; gvwr: boolean };
} {
  const warnings: LoadoutConsequenceSourceWarning[] = [];
  const vehicle = input.vehicle;
  const spec = input.vehicleSpecEvidence ?? {};
  const buildProfile = { ...vehicle.buildProfile };

  const gvwrEvidence = normalizeEvidence(spec.gvwr, 'GVWR evidence');
  if (!hasUsableWeight(buildProfile.gvwr) && gvwrEvidence) {
    buildProfile.gvwr = evidenceToWeightValue(gvwrEvidence, 'GVWR evidence');
  }

  const baseEvidence = normalizeEvidence(
    spec.baseWeight ?? spec.curbWeight ?? spec.emptyWeight,
    'Base vehicle weight evidence',
  );
  if (!hasUsableWeight(buildProfile.baseNetWeight) && baseEvidence) {
    buildProfile.baseNetWeight = evidenceToWeightValue(baseEvidence, 'Base vehicle weight evidence');
  }

  const netPayloadEvidence = normalizeEvidence(spec.netPayload, 'Net payload evidence');
  if (!hasUsableWeight(buildProfile.baseNetWeight) && hasUsableWeight(buildProfile.gvwr) && netPayloadEvidence) {
    const inferredBase = Math.max(0, buildProfile.gvwr.lbs - Math.max(0, netPayloadEvidence.value));
    buildProfile.baseNetWeight = createFleetWeightValue(inferredBase, 'user_estimate', {
      confidence: Math.min(72, netPayloadEvidence.confidence, buildProfile.gvwr.confidence),
      sourceLabel: 'Estimated base weight from GVWR minus net payload',
    });
    warnings.push({
      id: 'inferred-base-from-net-payload',
      severity: 'warning',
      field: 'baseNetWeight',
      sourceKind: 'estimated',
      message: 'Base/curb weight was inferred from GVWR minus net payload and is marked estimated until confirmed.',
    });
  }

  const baseMissing = !hasUsableWeight(buildProfile.baseNetWeight);
  const gvwrMissing = !hasUsableWeight(buildProfile.gvwr);

  if (baseMissing) {
    warnings.push({
      id: 'missing-base-weight',
      severity: 'critical',
      field: 'baseNetWeight',
      sourceKind: null,
      message: 'Base or curb weight is missing; ECS can show load change but not a confident payload result.',
    });
  }
  if (gvwrMissing) {
    warnings.push({
      id: 'missing-gvwr',
      severity: 'critical',
      field: 'gvwr',
      sourceKind: null,
      message: 'Missing GVWR: ECS cannot produce a confident payload or GVWR percentage preview.',
    });
  }

  return {
    vehicle: {
      ...vehicle,
      buildProfile,
    },
    warnings,
    coreMissing: { base: baseMissing, gvwr: gvwrMissing },
  };
}

function applyListChanges<T extends { id: string }>(
  current: readonly T[],
  proposed: readonly T[] | null | undefined,
  changes: { add?: readonly T[] | null; update?: readonly T[] | null; removeIds?: readonly string[] | null } | null | undefined,
): T[] {
  if (proposed) return [...proposed];
  const removeIds = new Set(changes?.removeIds ?? []);
  const byId = new Map(current.filter((item) => !removeIds.has(item.id)).map((item) => [item.id, item]));
  for (const item of changes?.update ?? []) byId.set(item.id, item);
  for (const item of changes?.add ?? []) byId.set(item.id, item);
  return Array.from(byId.values());
}

function buildTrailerTongueLoadoutItem(
  vehicleId: string,
  trailerState: LoadoutConsequenceTrailerState | null | undefined,
): { item: FleetLoadoutItem | null; evidence: EvidenceValue<number> | null } {
  if (!trailerState?.attached) return { item: null, evidence: null };
  const evidence = normalizeEvidence(trailerState.tongueWeightLb, 'Trailer tongue weight');
  if (!evidence || evidence.value <= 0) return { item: null, evidence };
  const item: FleetLoadoutItem = {
    id: `${vehicleId}:loadout-consequence:trailer-tongue`,
    vehicleId,
    loadoutId: 'loadout-consequence-preview',
    name: 'Trailer tongue weight',
    category: 'trailer',
    quantity: 1,
    weight: evidenceToWeightValue(evidence, 'Trailer tongue weight'),
    loadZone: 'hitch',
    compartmentId: 'hitch',
    placement: null,
    isCritical: true,
    isPacked: true,
    notes: 'Synthetic preview item representing trailer tongue load on the vehicle.',
    display: {
      iconKey: 'trailer',
      title: 'Trailer tongue weight',
      subtitle: null,
      classLabel: null,
      chips: ['preview'],
      statusText: null,
      accentTone: 'warning',
    },
  };
  return { item, evidence };
}

function highMountedWeight(result: FleetWeightResult): number {
  return (
    result.zoneWeights.roof.totalWeight.lbs +
    result.zoneWeights.bedHigh.totalWeight.lbs
  );
}

function rearBiasedWeight(result: FleetWeightResult): number {
  return (
    result.zoneWeights.rearLow.totalWeight.lbs +
    result.zoneWeights.hitch.totalWeight.lbs +
    result.zoneWeights.trailer.totalWeight.lbs
  );
}

function deriveTopHeavyRisk(
  before: FleetWeightResult,
  after: FleetWeightResult,
  routeContext: LoadoutConsequenceRouteContext | null | undefined,
): LoadoutConsequenceImpact {
  const highAfter = highMountedWeight(after);
  const heuristicRisk =
    highAfter >= 500
      ? 'critical'
      : highAfter >= 320
        ? 'caution'
        : highAfter >= 180
          ? 'watch'
          : 'clear';
  const routeBump =
    routeContext?.difficulty === 'hard' && highAfter >= 250
      ? 'caution'
      : routeContext?.difficulty === 'moderate' && highAfter >= 320
        ? 'caution'
        : 'clear';
  const afterLevel = riskMax(after.topHeavyRisk, heuristicRisk, routeBump);
  const beforeLevel = riskMax(before.topHeavyRisk);
  const reasons = [
    highAfter > 0 ? `${Math.round(highAfter)} lb is carried in roof or high-bed zones.` : null,
    routeContext?.difficulty === 'hard' ? 'Hard route context increases sensitivity to high-mounted weight.' : null,
    after.topHeavyRisk !== 'clear' ? `Fleet center-of-gravity model reports ${after.topHeavyRisk} top-heavy risk.` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    level: afterLevel,
    before: beforeLevel,
    after: afterLevel,
    delta: riskDelta(beforeLevel, afterLevel),
    label: 'Top-heavy risk',
    reasons: reasons.length > 0 ? reasons : ['No high-mounted load issue from available inputs.'],
  };
}

function deriveRecoveryDifficultyRisk(
  before: FleetWeightResult,
  after: FleetWeightResult,
  routeContext: LoadoutConsequenceRouteContext | null | undefined,
  trailerTongueEvidence: EvidenceValue<number> | null,
  tireLiftState: LoadoutConsequenceTireLiftState | null | undefined,
): LoadoutConsequenceImpact {
  const scoreFor = (result: FleetWeightResult): number => {
    let score = 0;
    const gvwrRisk = riskFromGvwrUsage(result.gvwrUsagePct);
    if (gvwrRisk === 'critical') score += 4;
    else if (gvwrRisk === 'caution') score += 3;
    else if (gvwrRisk === 'watch') score += 1;

    if (result.operatingWeight.lbs >= 7500) score += 2;
    else if (result.operatingWeight.lbs >= 6500) score += 1;

    if ((tireLiftState?.tireSizeInches ?? 0) >= 35) score += 1;
    if ((tireLiftState?.suspensionLiftInches ?? 0) >= 3) score += 1;
    if (routeContext?.difficulty === 'hard') score += 2;
    else if (routeContext?.difficulty === 'moderate') score += 1;
    if (routeContext?.remoteness === 'high') score += 2;
    else if (routeContext?.remoteness === 'medium') score += 1;
    if (routeContext?.recoveryPosture === 'remote') score += 2;
    else if (routeContext?.recoveryPosture === 'limited') score += 1;
    if ((trailerTongueEvidence?.value ?? 0) > 0) score += 1;
    if (rearBiasedWeight(result) >= 700) score += 1;
    return score;
  };
  const beforeLevel = riskFromScore(scoreFor(before));
  const afterLevel = riskFromScore(scoreFor(after));
  const reasons = [
    after.gvwrUsagePct != null ? `${after.gvwrUsagePct}% GVWR usage after the proposed load.` : null,
    routeContext?.difficulty && routeContext.difficulty !== 'unknown' ? `${routeContext.difficulty} route difficulty is included.` : null,
    routeContext?.remoteness === 'high' ? 'High remoteness increases recovery consequence.' : null,
    routeContext?.recoveryPosture ? `Recovery posture: ${routeContext.recoveryPosture}.` : null,
    (trailerTongueEvidence?.value ?? 0) > 0 ? `${Math.round(trailerTongueEvidence?.value ?? 0)} lb trailer tongue load is included.` : null,
    (tireLiftState?.tireSizeInches ?? 0) >= 35 || (tireLiftState?.suspensionLiftInches ?? 0) >= 3
      ? 'Tire/lift setup increases stress and recovery complexity when heavily loaded.'
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    level: afterLevel,
    before: beforeLevel,
    after: afterLevel,
    delta: riskDelta(beforeLevel, afterLevel),
    label: 'Recovery difficulty',
    reasons: reasons.length > 0 ? reasons : ['Recovery difficulty is low from available load and route inputs.'],
  };
}

function deriveRouteSuitabilityRisk(
  topHeavy: LoadoutConsequenceImpact,
  recovery: LoadoutConsequenceImpact,
  routeContext: LoadoutConsequenceRouteContext | null | undefined,
): LoadoutConsequenceImpact {
  const terrain = routeContext?.terrainRisk ?? 'clear';
  const difficultyRisk: FleetRiskLevel =
    routeContext?.difficulty === 'hard'
      ? 'caution'
      : routeContext?.difficulty === 'moderate'
        ? 'watch'
        : 'clear';
  const afterLevel = riskMax(topHeavy.level, recovery.level, terrain, difficultyRisk);
  const beforeLevel = riskMax(topHeavy.before, recovery.before, terrain, difficultyRisk);
  const reasons = [
    topHeavy.level !== 'clear' && topHeavy.level !== 'unknown' ? `Top-heavy risk is ${topHeavy.level}.` : null,
    recovery.level !== 'clear' && recovery.level !== 'unknown' ? `Recovery difficulty is ${recovery.level}.` : null,
    terrain && terrain !== 'clear' && terrain !== 'unknown' ? `Route terrain risk is ${terrain}.` : null,
    routeContext?.readinessThreshold ? `Readiness threshold: ${routeContext.readinessThreshold}.` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    level: afterLevel,
    before: beforeLevel,
    after: afterLevel,
    delta: riskDelta(beforeLevel, afterLevel),
    label: 'Route suitability',
    reasons: reasons.length > 0 ? reasons : ['Route suitability unchanged from available load inputs.'],
  };
}

function sortSuggestionCandidates(
  items: Array<{
    id: string;
    name: string;
    weightLb: number;
    loadZone: FleetLoadZone;
    isCritical: boolean;
    sourceKind: SourceKind;
    kind: 'accessory' | 'loadout';
  }>,
) {
  const zonePriority: Partial<Record<FleetLoadZone, number>> = {
    roof: 5,
    bedHigh: 4,
    hitch: 4,
    trailer: 4,
    rearLow: 3,
    frontLow: 2,
    cab: 1,
    bedLow: 0,
    underbody: 0,
  };
  return [...items].sort((left, right) => {
    const zoneDelta = (zonePriority[right.loadZone] ?? 0) - (zonePriority[left.loadZone] ?? 0);
    if (zoneDelta !== 0) return zoneDelta;
    return right.weightLb - left.weightLb;
  });
}

function buildSuggestions(input: {
  afterWeight: FleetWeightResult;
  proposedAccessories: readonly FleetAccessoryInstall[];
  proposedLoadoutItems: readonly FleetLoadoutItem[];
  topHeavy: LoadoutConsequenceImpact;
  recovery: LoadoutConsequenceImpact;
}): LoadoutConsequenceSuggestion[] {
  const candidates = sortSuggestionCandidates([
    ...input.proposedLoadoutItems.map((item) => ({
      id: item.id,
      name: item.name,
      weightLb: item.weight.lbs * Math.max(1, item.quantity),
      loadZone: item.loadZone,
      isCritical: item.isCritical,
      sourceKind: fleetWeightSourceToSourceKind(item.weight.source),
      kind: 'loadout' as const,
    })),
    ...input.proposedAccessories.map((item) => ({
      id: item.id,
      name: item.name,
      weightLb: item.installedWeight.lbs,
      loadZone: item.loadZone,
      isCritical: item.affectsPayload === false,
      sourceKind: fleetWeightSourceToSourceKind(item.installedWeight.source),
      kind: 'accessory' as const,
    })),
  ]).filter((item) => item.weightLb > 0);

  const suggestions: LoadoutConsequenceSuggestion[] = [];
  for (const item of candidates) {
    if (suggestions.length >= 5) break;
    if (item.loadZone === 'roof' || item.loadZone === 'bedHigh') {
      suggestions.push({
        id: `relocate-${item.id}`,
        action: 'relocate',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: 'bedLow',
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 100 + item.weightLb,
        reason: `Move high-mounted ${item.kind} weight lower and more central before committing the loadout.`,
        evidenceEvents: ['suggestion_viewed', 'suggestion_accepted'],
      });
      continue;
    }
    if (item.loadZone === 'hitch' || item.loadZone === 'trailer' || item.loadZone === 'rearLow') {
      suggestions.push({
        id: `relocate-${item.id}`,
        action: 'relocate',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: 'bedLow',
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 80 + item.weightLb,
        reason: `Reduce rear-biased load by moving this ${item.kind} toward a low central zone.`,
        evidenceEvents: ['suggestion_viewed', 'suggestion_accepted'],
      });
      continue;
    }
    if (item.sourceKind !== 'user_confirmed') {
      suggestions.push({
        id: `verify-${item.id}`,
        action: 'verify_weight',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: null,
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 20 + item.weightLb,
        reason: 'Confirm this weight source before relying on the preview.',
        evidenceEvents: ['source_confirmed'],
      });
    }
  }

  if (
    input.afterWeight.payloadRemaining &&
    input.afterWeight.payloadRemaining.lbs <= 300 &&
    input.afterWeight.gvwrUsagePct != null
  ) {
    const removable = candidates.find((item) => !item.isCritical && item.kind === 'loadout');
    if (removable && !suggestions.some((item) => item.itemId === removable.id && item.action === 'remove')) {
      suggestions.push({
        id: `remove-${removable.id}`,
        action: 'remove',
        itemId: removable.id,
        itemName: removable.name,
        fromZone: removable.loadZone,
        targetZone: null,
        estimatedImpactLb: roundLbs(removable.weightLb) ?? 0,
        priority: 70 + removable.weightLb,
        reason: 'Payload margin is tight; remove optional weight before committing the loadout.',
        evidenceEvents: ['suggestion_viewed', 'suggestion_accepted'],
      });
    }
  }

  return suggestions
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 5);
}

function addWarning(
  warnings: Map<string, LoadoutConsequenceSourceWarning>,
  warning: LoadoutConsequenceSourceWarning,
) {
  if (!warnings.has(warning.id)) warnings.set(warning.id, warning);
}

function collectSourceWarnings(input: {
  vehicle: FleetVehicle;
  currentAccessories: readonly FleetAccessoryInstall[];
  currentLoadoutItems: readonly FleetLoadoutItem[];
  proposedAccessories: readonly FleetAccessoryInstall[];
  proposedLoadoutItems: readonly FleetLoadoutItem[];
  trailerTongueEvidence: EvidenceValue<number> | null;
  initialWarnings: readonly LoadoutConsequenceSourceWarning[];
}) {
  const warnings = new Map<string, LoadoutConsequenceSourceWarning>();
  for (const warning of input.initialWarnings) addWarning(warnings, warning);

  const coreWeights = [
    { id: 'base-weight', label: 'base weight', field: 'baseNetWeight', value: input.vehicle.buildProfile.baseNetWeight },
    { id: 'gvwr', label: 'GVWR', field: 'gvwr', value: input.vehicle.buildProfile.gvwr },
  ];
  for (const core of coreWeights) {
    const sourceKind = fleetWeightSourceToSourceKind(core.value?.source);
    if (!core.value) continue;
    if (sourceKind === 'oem') {
      addWarning(warnings, {
        id: `source-oem-${core.id}`,
        severity: 'info',
        field: core.field,
        sourceKind,
        message: `${core.label} is OEM-sourced; confirm against the vehicle placard or scale evidence when payload margin is tight.`,
      });
    } else if (sourceKind === 'default' || sourceKind === 'estimated') {
      addWarning(warnings, {
        id: `source-${sourceKind}-${core.id}`,
        severity: 'warning',
        field: core.field,
        sourceKind,
        message: `${core.label} uses ${sourceKind} data; confirm before treating this preview as field-ready.`,
      });
    }
  }

  const allAccessories = [...input.currentAccessories, ...input.proposedAccessories];
  if (allAccessories.some((item) => fleetWeightSourceToSourceKind(item.installedWeight.source) === 'estimated')) {
    addWarning(warnings, {
      id: 'source-estimated-accessory',
      severity: 'warning',
      field: 'accessories',
      sourceKind: 'estimated',
      message: 'One or more accessory weights are estimated; confirm installed weight for higher confidence.',
    });
  }
  if (allAccessories.some((item) => fleetWeightSourceToSourceKind(item.installedWeight.source) === 'default')) {
    addWarning(warnings, {
      id: 'source-default-accessory',
      severity: 'warning',
      field: 'accessories',
      sourceKind: 'default',
      message: 'One or more accessory weights use ECS defaults; confirm brand/model or measured weight.',
    });
  }

  const allLoadout = [...input.currentLoadoutItems, ...input.proposedLoadoutItems];
  if (allLoadout.some((item) => fleetWeightSourceToSourceKind(item.weight.source) === 'estimated')) {
    addWarning(warnings, {
      id: 'source-estimated-loadout',
      severity: 'warning',
      field: 'loadoutItems',
      sourceKind: 'estimated',
      message: 'One or more loadout item weights are estimated; weigh packed bins or confirm item weights.',
    });
  }
  if (allLoadout.some((item) => fleetWeightSourceToSourceKind(item.weight.source) === 'default')) {
    addWarning(warnings, {
      id: 'source-default-loadout',
      severity: 'warning',
      field: 'loadoutItems',
      sourceKind: 'default',
      message: 'One or more loadout item weights use ECS defaults; confirm before committing a tight payload.',
    });
  }

  if (input.trailerTongueEvidence && input.trailerTongueEvidence.sourceKind !== 'user_confirmed') {
    addWarning(warnings, {
      id: `source-${input.trailerTongueEvidence.sourceKind}-trailer-tongue`,
      severity: input.trailerTongueEvidence.sourceKind === 'estimated' ? 'warning' : 'info',
      field: 'trailerTongueWeight',
      sourceKind: input.trailerTongueEvidence.sourceKind,
      message: `Trailer tongue weight uses ${input.trailerTongueEvidence.sourceKind} data; confirm before relying on recovery or route suitability impact.`,
    });
  }

  return Array.from(warnings.values());
}

function deriveAvailability(coreMissing: { base: boolean; gvwr: boolean }, warnings: readonly LoadoutConsequenceSourceWarning[]): LoadoutConsequenceAvailability {
  if (warnings.some((warning) => warning.id === 'missing-gvwr' || warning.id === 'missing-base-weight')) return 'partial';
  if (coreMissing.base || coreMissing.gvwr) return 'partial';
  return 'available';
}

function deriveMainRisk(input: {
  sourceWarnings: readonly LoadoutConsequenceSourceWarning[];
  topHeavy: LoadoutConsequenceImpact;
  recovery: LoadoutConsequenceImpact;
  routeSuitability: LoadoutConsequenceImpact;
  afterWeight: FleetWeightResult;
}): string {
  const missingCritical = input.sourceWarnings.find((warning) => warning.severity === 'critical');
  if (missingCritical) return missingCritical.message;
  const highest = [
    input.routeSuitability,
    input.recovery,
    input.topHeavy,
  ].sort((left, right) => RISK_RANK[right.level] - RISK_RANK[left.level])[0];
  if (highest && highest.level !== 'clear' && highest.level !== 'unknown') {
    return `${highest.label}: ${highest.reasons[0] ?? 'review proposed load before committing.'}`;
  }
  if (input.afterWeight.payloadRemaining && input.afterWeight.payloadRemaining.lbs <= 500) {
    return `${Math.round(input.afterWeight.payloadRemaining.lbs)} lb payload margin remains after proposed load.`;
  }
  return 'No major loadout consequence from available inputs.';
}

export function buildLoadoutConsequencePreview(input: LoadoutConsequenceInput): LoadoutConsequencePreview {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const normalizedVehicle = withVehicleSpecEvidence(input);
  const vehicle = normalizedVehicle.vehicle;
  const currentAccessories = [...(input.currentAccessories ?? [])];
  const currentLoadoutItems = [...(input.currentLoadoutItems ?? [])];
  const proposedAccessories = applyListChanges(currentAccessories, input.proposedAccessories, input.accessoryChanges);
  const proposedLoadoutItemsBase = applyListChanges(currentLoadoutItems, input.proposedLoadoutItems, input.loadoutChanges);
  const trailerTongue = buildTrailerTongueLoadoutItem(vehicle.id, input.trailerState);
  const proposedLoadoutItems = trailerTongue.item
    ? [...proposedLoadoutItemsBase, trailerTongue.item]
    : proposedLoadoutItemsBase;

  const beforeWeight = calculateFleetWeightResult(vehicle, currentAccessories, currentLoadoutItems);
  const afterWeight = calculateFleetWeightResult(vehicle, proposedAccessories, proposedLoadoutItems);
  const topHeavyRisk = deriveTopHeavyRisk(beforeWeight, afterWeight, input.routeContext);
  const recoveryDifficultyImpact = deriveRecoveryDifficultyRisk(
    beforeWeight,
    afterWeight,
    input.routeContext,
    trailerTongue.evidence,
    input.tireLiftState ?? {
      tireSizeInches: vehicle.buildProfile.tireSizeInches,
      suspensionLiftInches: vehicle.buildProfile.suspensionLiftInches,
      isLeveled: vehicle.buildProfile.isLeveled,
    },
  );
  const routeSuitabilityImpact = deriveRouteSuitabilityRisk(
    topHeavyRisk,
    recoveryDifficultyImpact,
    input.routeContext,
  );
  const sourceWarnings = collectSourceWarnings({
    vehicle,
    currentAccessories,
    currentLoadoutItems,
    proposedAccessories,
    proposedLoadoutItems,
    trailerTongueEvidence: trailerTongue.evidence,
    initialWarnings: normalizedVehicle.warnings,
  });
  const availability = deriveAvailability(normalizedVehicle.coreMissing, sourceWarnings);
  const coreMissing = normalizedVehicle.coreMissing.base || normalizedVehicle.coreMissing.gvwr;
  const payloadRemainingBefore = coreMissing ? null : roundLbs(beforeWeight.payloadRemaining?.lbs);
  const payloadRemainingAfter = coreMissing ? null : roundLbs(afterWeight.payloadRemaining?.lbs);
  const gvwrPercentBefore = coreMissing ? null : roundTenths(beforeWeight.gvwrUsagePct);
  const gvwrPercentAfter = coreMissing ? null : roundTenths(afterWeight.gvwrUsagePct);
  const suggestions = buildSuggestions({
    afterWeight,
    proposedAccessories,
    proposedLoadoutItems,
    topHeavy: topHeavyRisk,
    recovery: recoveryDifficultyImpact,
  });
  const mainRisk = deriveMainRisk({
    sourceWarnings,
    topHeavy: topHeavyRisk,
    recovery: recoveryDifficultyImpact,
    routeSuitability: routeSuitabilityImpact,
    afterWeight,
  });

  return {
    vehicleId: input.vehicleId,
    generatedAt,
    readiness: 'current_user_facing_extension',
    availability,
    payloadRemainingBefore,
    payloadRemainingAfter,
    gvwrPercentBefore,
    gvwrPercentAfter,
    loadedVehicleWeightBefore: normalizedVehicle.coreMissing.base ? null : roundLbs(beforeWeight.operatingWeight.lbs),
    loadedVehicleWeightAfter: normalizedVehicle.coreMissing.base ? null : roundLbs(afterWeight.operatingWeight.lbs),
    payloadDeltaLb:
      payloadRemainingBefore != null && payloadRemainingAfter != null
        ? roundLbs(payloadRemainingAfter - payloadRemainingBefore)
        : null,
    gvwrPercentDelta:
      gvwrPercentBefore != null && gvwrPercentAfter != null
        ? roundTenths(gvwrPercentAfter - gvwrPercentBefore)
        : null,
    topHeavyRisk,
    recoveryDifficultyImpact,
    routeSuitabilityImpact,
    suggestions,
    sourceWarnings,
    mainRisk,
    evidenceEvents: [...SUPPORTED_EVIDENCE_EVENTS],
    beforeWeight,
    afterWeight,
  };
}

export class LoadoutConsequenceSystem {
  evaluate(input: LoadoutConsequenceInput): LoadoutConsequencePreview {
    return buildLoadoutConsequencePreview(input);
  }
}

export function buildCommandBriefLoadoutConsequenceSummary(
  preview: LoadoutConsequencePreview | null | undefined,
): CommandBriefLoadoutConsequenceSummary | null {
  if (!preview) return null;
  return {
    vehicleId: preview.vehicleId,
    status: riskMax(
      preview.routeSuitabilityImpact.level,
      preview.recoveryDifficultyImpact.level,
      preview.topHeavyRisk.level,
    ),
    mainRisk: preview.mainRisk,
    payloadRemainingAfter: preview.payloadRemainingAfter,
    gvwrPercentAfter: preview.gvwrPercentAfter,
    topHeavyRisk: preview.topHeavyRisk.level,
    recoveryDifficulty: preview.recoveryDifficultyImpact.level,
    routeSuitability: preview.routeSuitabilityImpact.level,
    suggestionCount: preview.suggestions.length,
    warningCount: preview.sourceWarnings.length,
    readiness: preview.readiness,
    generatedAt: preview.generatedAt,
  };
}

export function buildExpeditionReadinessLoadoutConsequenceSummary(
  preview: LoadoutConsequencePreview | null | undefined,
): CommandBriefLoadoutConsequenceSummary | null {
  return buildCommandBriefLoadoutConsequenceSummary(preview);
}

export function publishLoadoutConsequencePreview(preview: LoadoutConsequencePreview | null): LoadoutConsequencePreviewSnapshot {
  snapshot = {
    preview,
    summary: buildCommandBriefLoadoutConsequenceSummary(preview),
    updatedAt: preview?.generatedAt ?? new Date().toISOString(),
  };
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // Preview mirroring is advisory and must not block Fleet edits.
    }
  }
  return getLoadoutConsequencePreviewSnapshot();
}

export function getLoadoutConsequencePreviewSnapshot(): LoadoutConsequencePreviewSnapshot {
  return {
    preview: snapshot.preview,
    summary: snapshot.summary ? { ...snapshot.summary } : null,
    updatedAt: snapshot.updatedAt,
  };
}

export function subscribeLoadoutConsequencePreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
