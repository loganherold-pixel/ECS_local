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
import type {
  FleetBuildLoadoutState,
  FleetCompartmentLoadoutItem,
} from './fleetBuildLoadout';

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
  routeId?: string | null;
  routeGeometryVersion?: string | null;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'unknown' | null;
  terrainRisk?: FleetRiskLevel | 'unknown' | null;
  remoteness?: 'low' | 'medium' | 'high' | 'unknown' | null;
  recoveryPosture?: 'nearby' | 'limited' | 'remote' | 'unknown' | null;
  readinessThreshold?: FleetRiskLevel | null;
  freshness?: 'current' | 'stale' | 'unavailable' | 'unknown' | null;
  sourceKind?: SourceKind | null;
  observedAt?: string | null;
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
  profileId?: string | null;
  loadoutId?: string | null;
  routeId?: string | null;
  routeGeometryVersion?: string | null;
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
  actions: LoadoutSuggestionAction[];
  applicationState?: LoadoutSuggestionApplicationState;
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
  | 'suggestion_acknowledged'
  | 'suggestion_editor_opened'
  | 'suggestion_applied'
  | 'suggestion_dismissed'
  | 'suggestion_apply_failed'
  | 'source_confirmed'
  | 'warning_acknowledged'
  | 'loadout_committed'
  | 'command_brief_mirror_updated'
  | 'command_brief_mirror_invalidated';

export type LoadoutWeightContributionKind =
  | 'base_or_curb_weight'
  | 'inferred_curb_from_net_payload'
  | 'accessory_weight'
  | 'gear_weight'
  | 'fuel_weight'
  | 'water_weight'
  | 'other_fluid_weight'
  | 'trailer_tongue_weight'
  | 'estimated_unknown';

export type LoadoutWeightContribution = {
  contributionId: string;
  kind: LoadoutWeightContributionKind;
  label: string;
  weight: number | null;
  unit: 'lb' | 'kg';
  source: EvidenceValue<number> | null;
  sourceWarningIds: string[];
  itemIds?: string[];
  zoneIds?: string[];
};

export type LoadoutConsequenceCalculationTrace = {
  vehicleId: string;
  profileId?: string;
  loadoutId?: string;
  routeId?: string;
  routeGeometryVersion?: string;
  calculationMode: 'preview' | 'committed';
  gvwr: EvidenceValue<number> | null;
  curbWeight: EvidenceValue<number> | null;
  baseWeight: EvidenceValue<number> | null;
  netPayload: EvidenceValue<number> | null;
  inferredCurbWeight: EvidenceValue<number> | null;
  weightContributionsBefore: LoadoutWeightContribution[];
  weightContributionsAfter: LoadoutWeightContribution[];
  loadedWeightBefore: number | null;
  loadedWeightAfter: number | null;
  payloadRemainingBefore: number | null;
  payloadRemainingAfter: number | null;
  gvwrPercentBefore: number | null;
  gvwrPercentAfter: number | null;
  sourcePrecedenceApplied: Array<{
    fieldPath: string;
    chosenSourceKind: SourceKind;
    availableSourceKinds: SourceKind[];
    reason: string;
  }>;
  warnings: LoadoutConsequenceSourceWarning[];
  generatedAt: string;
};

export type LoadoutRiskSignalTrace = {
  signalId: 'top_heavy' | 'recovery_difficulty' | 'route_suitability';
  before: FleetRiskLevel | 'unknown';
  after: FleetRiskLevel | 'unknown';
  factors: Array<{
    factorId:
      | 'gvwr_percent'
      | 'loaded_weight'
      | 'roof_weight'
      | 'rear_weight'
      | 'heavy_item_concentration'
      | 'load_zone_height'
      | 'tire_lift_state'
      | 'route_difficulty'
      | 'terrain_risk'
      | 'trailer_state'
      | 'recovery_posture'
      | 'remoteness'
      | 'missing_source';
    impact: 'none' | 'low' | 'medium' | 'high' | 'unknown';
    reason: string;
    sourceWarningIds: string[];
    itemIds?: string[];
    zoneIds?: string[];
  }>;
};

export type LoadoutSuggestionActionKind =
  | 'relocate_item'
  | 'remove_item'
  | 'reduce_fluid'
  | 'confirm_source'
  | 'open_editor'
  | 'acknowledge'
  | 'dismiss';

export type LoadoutSuggestionApplicationState =
  | 'not_applicable'
  | 'review_only'
  | 'pending'
  | 'applied'
  | 'failed';

export type LoadoutSuggestionAction = {
  actionId: string;
  suggestionId: string;
  actionKind: LoadoutSuggestionActionKind;
  label: string;
  canApplyAutomatically: boolean;
  targetItemIds: string[];
  targetZoneId?: string;
  expectedImpact?: {
    payloadRemainingDelta?: number;
    gvwrPercentDelta?: number;
    riskSignalChanges?: string[];
  };
};

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
  calculationTrace: LoadoutConsequenceCalculationTrace;
  riskTraces: LoadoutRiskSignalTrace[];
  beforeWeight: FleetWeightResult;
  afterWeight: FleetWeightResult;
};

export type LoadoutConsequenceMirrorSource =
  | 'saved_loadout'
  | 'proposed_preview'
  | 'committed_loadout';

export type LoadoutConsequenceMirrorInvalidationReason =
  | 'vehicle_changed'
  | 'profile_changed'
  | 'loadout_changed'
  | 'route_changed'
  | 'route_geometry_changed'
  | 'preview_cancelled'
  | 'preview_committed'
  | 'source_missing'
  | 'expired';

export type LoadoutConsequenceMirror = {
  source: LoadoutConsequenceMirrorSource;
  vehicleId: string;
  profileId?: string;
  loadoutId?: string;
  routeId?: string;
  routeGeometryVersion?: string;
  previewId?: string;
  generatedAt: string;
  stale: boolean;
  invalidationReason?: LoadoutConsequenceMirrorInvalidationReason;
  aggregateImpact: {
    payloadPressure?: FleetRiskLevel | 'unknown';
    topHeavyRisk?: FleetRiskLevel | 'unknown';
    recoveryDifficulty?: FleetRiskLevel | 'unknown';
    routeSuitability?: FleetRiskLevel | 'unknown';
  };
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
  source: LoadoutConsequenceMirrorSource;
  stale: boolean;
  invalidationReason?: LoadoutConsequenceMirrorInvalidationReason;
};

export type LoadoutConsequencePreviewSnapshot = {
  preview: LoadoutConsequencePreview | null;
  summary: CommandBriefLoadoutConsequenceSummary | null;
  mirror: LoadoutConsequenceMirror | null;
  updatedAt: string | null;
};

export type LoadoutScaleValidationEvidence = {
  evidenceId: string;
  vehicleId: string;
  profileId?: string;
  loadoutId?: string;
  measuredAt: string;
  sourceKind: 'scale_ticket' | 'loaded_scale' | 'user_confirmed';
  predictedLoadedWeight: number;
  measuredLoadedWeight: number;
  unit: 'lb' | 'kg';
  delta: number;
  deltaPercent: number;
  ticketId?: string;
  artifactPath?: string;
  confidence: 'high' | 'medium' | 'low';
  acceptedBy?: string;
  acceptedAt?: string;
  notes: string[];
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
  'suggestion_acknowledged',
  'suggestion_editor_opened',
  'suggestion_applied',
  'suggestion_dismissed',
  'suggestion_apply_failed',
  'source_confirmed',
  'warning_acknowledged',
  'loadout_committed',
  'command_brief_mirror_updated',
  'command_brief_mirror_invalidated',
];

let snapshot: LoadoutConsequencePreviewSnapshot = {
  preview: null,
  summary: null,
  mirror: null,
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

function weightValueToEvidence(value: FleetWeightValue | null | undefined, sourceLabel: string): EvidenceValue<number> | null {
  if (!value || !Number.isFinite(value.lbs)) return null;
  return {
    value: value.lbs,
    sourceKind: fleetWeightSourceToSourceKind(value.source),
    confidence: clampConfidence(value.confidence),
    sourceLabel: value.sourceLabel ?? sourceLabel,
    observedAt: value.verifiedAt ?? null,
  };
}

function sourceKinds(values: readonly (EvidenceValue<number> | null | undefined)[]): SourceKind[] {
  return values.filter((item): item is EvidenceValue<number> => Boolean(item)).map((item) => item.sourceKind);
}

function sourcePrecedenceEntry(
  fieldPath: string,
  chosen: EvidenceValue<number> | null,
  available: readonly (EvidenceValue<number> | null | undefined)[],
  reason: string,
) {
  return chosen
    ? {
        fieldPath,
        chosenSourceKind: chosen.sourceKind,
        availableSourceKinds: sourceKinds(available),
        reason,
      }
    : null;
}

export function resolveEvidenceValue<T>(values: readonly (EvidenceValue<T> | null | undefined)[]): EvidenceValue<T> {
  const candidates = values.filter((item): item is EvidenceValue<T> => Boolean(item));
  if (candidates.length === 0) {
    throw new Error('resolveEvidenceValue requires at least one evidence value.');
  }
  return candidates.map((value, index) => ({ value, index })).sort((left, right) => {
    const sourceDelta = SOURCE_KIND_PRIORITY[right.value.sourceKind] - SOURCE_KIND_PRIORITY[left.value.sourceKind];
    if (sourceDelta !== 0) return sourceDelta;
    const confidenceDelta = clampConfidence(right.value.confidence) - clampConfidence(left.value.confidence);
    if (confidenceDelta !== 0) return confidenceDelta;
    return right.index - left.index;
  })[0].value;
}

function hasUsableWeight(value: FleetWeightValue | null | undefined): value is FleetWeightValue {
  return Boolean(value && Number.isFinite(value.lbs) && value.lbs > 0);
}

function withVehicleSpecEvidence(input: LoadoutConsequenceInput): {
  vehicle: FleetVehicle;
  warnings: LoadoutConsequenceSourceWarning[];
  coreMissing: { base: boolean; gvwr: boolean };
  traceSources: {
    gvwr: EvidenceValue<number> | null;
    baseWeight: EvidenceValue<number> | null;
    curbWeight: EvidenceValue<number> | null;
    netPayload: EvidenceValue<number> | null;
    inferredCurbWeight: EvidenceValue<number> | null;
    sourcePrecedenceApplied: LoadoutConsequenceCalculationTrace['sourcePrecedenceApplied'];
  };
} {
  const warnings: LoadoutConsequenceSourceWarning[] = [];
  const vehicle = input.vehicle;
  const spec = input.vehicleSpecEvidence ?? {};
  const buildProfile = { ...vehicle.buildProfile };
  const sourcePrecedenceApplied: LoadoutConsequenceCalculationTrace['sourcePrecedenceApplied'] = [];

  const existingGvwrEvidence = weightValueToEvidence(buildProfile.gvwr, 'Existing GVWR');
  const gvwrEvidence = normalizeEvidence(spec.gvwr, 'GVWR evidence');
  const chosenGvwr = existingGvwrEvidence || gvwrEvidence
    ? resolveEvidenceValue([existingGvwrEvidence, gvwrEvidence])
    : null;
  if (chosenGvwr) {
    buildProfile.gvwr = evidenceToWeightValue(chosenGvwr, chosenGvwr.sourceLabel ?? 'GVWR evidence');
    const entry = sourcePrecedenceEntry(
      'vehicle.buildProfile.gvwr',
      chosenGvwr,
      [existingGvwrEvidence, gvwrEvidence],
      'Highest-precedence GVWR evidence selected.',
    );
    if (entry) sourcePrecedenceApplied.push(entry);
  }

  const existingBaseEvidence = weightValueToEvidence(buildProfile.baseNetWeight, 'Existing base weight');
  const baseEvidence = normalizeEvidence(
    spec.baseWeight,
    'Base vehicle weight evidence',
  );
  const curbEvidence = normalizeEvidence(spec.curbWeight ?? spec.emptyWeight, 'Curb vehicle weight evidence');
  let chosenBase = existingBaseEvidence || baseEvidence || curbEvidence
    ? resolveEvidenceValue([existingBaseEvidence, baseEvidence, curbEvidence])
    : null;
  if (chosenBase) {
    buildProfile.baseNetWeight = evidenceToWeightValue(chosenBase, chosenBase.sourceLabel ?? 'Base vehicle weight evidence');
    const entry = sourcePrecedenceEntry(
      'vehicle.buildProfile.baseNetWeight',
      chosenBase,
      [existingBaseEvidence, baseEvidence, curbEvidence],
      'Highest-precedence base/curb weight evidence selected.',
    );
    if (entry) sourcePrecedenceApplied.push(entry);
  }

  const netPayloadEvidence = normalizeEvidence(spec.netPayload, 'Net payload evidence');
  let inferredCurbWeight: EvidenceValue<number> | null = null;
  if (!hasUsableWeight(buildProfile.baseNetWeight) && hasUsableWeight(buildProfile.gvwr) && netPayloadEvidence) {
    const inferredBase = Math.max(0, buildProfile.gvwr.lbs - Math.max(0, netPayloadEvidence.value));
    inferredCurbWeight = {
      value: inferredBase,
      sourceKind: 'estimated',
      confidence: Math.min(72, netPayloadEvidence.confidence, buildProfile.gvwr.confidence),
      sourceLabel: 'Estimated base weight from GVWR minus net payload',
      observedAt: null,
    };
    chosenBase = inferredCurbWeight;
    buildProfile.baseNetWeight = createFleetWeightValue(inferredBase, 'user_estimate', {
      confidence: Math.min(72, netPayloadEvidence.confidence, buildProfile.gvwr.confidence),
      sourceLabel: 'Estimated base weight from GVWR minus net payload',
    });
    sourcePrecedenceApplied.push({
      fieldPath: 'vehicle.buildProfile.baseNetWeight',
      chosenSourceKind: 'estimated',
      availableSourceKinds: ['estimated'],
      reason: 'Base/curb weight inferred from GVWR minus net payload.',
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
    traceSources: {
      gvwr: chosenGvwr,
      baseWeight: chosenBase,
      curbWeight: curbEvidence,
      netPayload: netPayloadEvidence,
      inferredCurbWeight,
      sourcePrecedenceApplied,
    },
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
  const capacityAdjustedHighAfter = after.highMountedCapacityAdjustedWeight?.lbs ?? highAfter;
  const dynamicRating = after.highMountedDynamicLoadRating?.lbs ?? 0;
  const heuristicRisk =
    capacityAdjustedHighAfter >= 500
      ? 'critical'
      : capacityAdjustedHighAfter >= 320
        ? 'caution'
        : capacityAdjustedHighAfter >= 180
          ? 'watch'
          : 'clear';
  const routeBump =
    routeContext?.difficulty === 'hard' && capacityAdjustedHighAfter >= 250
      ? 'caution'
      : routeContext?.difficulty === 'moderate' && capacityAdjustedHighAfter >= 320
        ? 'caution'
        : 'clear';
  const afterLevel = riskMax(after.topHeavyRisk, heuristicRisk, routeBump);
  const beforeLevel = riskMax(before.topHeavyRisk);
  const reasons = [
    highAfter > 0 ? `${Math.round(highAfter)} lb is carried in roof or high-bed zones.` : null,
    dynamicRating > 0 ? `${Math.round(dynamicRating)} lb dynamic accessory rating offsets high-mounted load risk.` : null,
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
  if (!routeContext) {
    return {
      level: 'unknown',
      before: 'unknown',
      after: 'unknown',
      delta: 'unavailable',
      label: 'Route suitability',
      reasons: ['Route context is missing; route fit remains an advisory partial result.'],
    };
  }
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
  const reviewAction = (
    suggestionId: string,
    label: string,
    actionKind: LoadoutSuggestionActionKind = 'open_editor',
    targetItemIds: string[] = [],
  ): LoadoutSuggestionAction => ({
    actionId: `${suggestionId}:${actionKind}`,
    suggestionId,
    actionKind,
    label,
    canApplyAutomatically: false,
    targetItemIds,
  });
  const automaticRelocateAction = (
    suggestionId: string,
    itemId: string,
    targetZone: FleetLoadZone,
    weightLb: number,
  ): LoadoutSuggestionAction => ({
    actionId: `${suggestionId}:relocate_item`,
    suggestionId,
    actionKind: 'relocate_item',
    label: 'Apply relocation',
    canApplyAutomatically: true,
    targetItemIds: [itemId],
    targetZoneId: targetZone,
    expectedImpact: {
      payloadRemainingDelta: 0,
      gvwrPercentDelta: 0,
      riskSignalChanges: [`Move ${Math.round(weightLb)} lb to ${targetZone}`],
    },
  });
  const automaticRemoveAction = (
    suggestionId: string,
    itemId: string,
    weightLb: number,
  ): LoadoutSuggestionAction => ({
    actionId: `${suggestionId}:remove_item`,
    suggestionId,
    actionKind: 'remove_item',
    label: 'Remove optional item',
    canApplyAutomatically: true,
    targetItemIds: [itemId],
    expectedImpact: {
      payloadRemainingDelta: roundLbs(weightLb) ?? 0,
      riskSignalChanges: [`Remove ${Math.round(weightLb)} lb optional item`],
    },
  });

  for (const item of candidates) {
    if (suggestions.length >= 5) break;
    if (item.loadZone === 'roof' || item.loadZone === 'bedHigh') {
      const suggestionId = `relocate-${item.id}`;
      suggestions.push({
        id: suggestionId,
        action: 'relocate',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: 'bedLow',
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 100 + item.weightLb,
        reason: `Move high-mounted ${item.kind} weight lower and more central before committing the loadout.`,
        evidenceEvents: ['suggestion_viewed', item.kind === 'loadout' ? 'suggestion_applied' : 'suggestion_editor_opened'],
        actions: item.kind === 'loadout'
          ? [automaticRelocateAction(suggestionId, item.id, 'bedLow', item.weightLb)]
          : [reviewAction(suggestionId, 'Open editor', 'open_editor', [item.id])],
        applicationState: item.kind === 'loadout' ? 'pending' : 'review_only',
      });
      continue;
    }
    if (item.loadZone === 'hitch' || item.loadZone === 'trailer' || item.loadZone === 'rearLow') {
      const suggestionId = `relocate-${item.id}`;
      suggestions.push({
        id: suggestionId,
        action: 'relocate',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: 'bedLow',
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 80 + item.weightLb,
        reason: `Reduce rear-biased load by moving this ${item.kind} toward a low central zone.`,
        evidenceEvents: ['suggestion_viewed', item.kind === 'loadout' ? 'suggestion_applied' : 'suggestion_editor_opened'],
        actions: item.kind === 'loadout'
          ? [automaticRelocateAction(suggestionId, item.id, 'bedLow', item.weightLb)]
          : [reviewAction(suggestionId, 'Open editor', 'open_editor', [item.id])],
        applicationState: item.kind === 'loadout' ? 'pending' : 'review_only',
      });
      continue;
    }
    if (item.sourceKind !== 'user_confirmed') {
      const suggestionId = `verify-${item.id}`;
      suggestions.push({
        id: suggestionId,
        action: 'verify_weight',
        itemId: item.id,
        itemName: item.name,
        fromZone: item.loadZone,
        targetZone: null,
        estimatedImpactLb: roundLbs(item.weightLb) ?? 0,
        priority: 20 + item.weightLb,
        reason: 'Confirm this weight source before relying on the preview.',
        evidenceEvents: ['suggestion_viewed', 'suggestion_acknowledged', 'source_confirmed'],
        actions: [reviewAction(suggestionId, 'Review suggestion', 'acknowledge', [item.id])],
        applicationState: 'review_only',
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
      const suggestionId = `remove-${removable.id}`;
      suggestions.push({
        id: suggestionId,
        action: 'remove',
        itemId: removable.id,
        itemName: removable.name,
        fromZone: removable.loadZone,
        targetZone: null,
        estimatedImpactLb: roundLbs(removable.weightLb) ?? 0,
        priority: 70 + removable.weightLb,
        reason: 'Payload margin is tight; remove optional weight before committing the loadout.',
        evidenceEvents: ['suggestion_viewed', 'suggestion_applied'],
        actions: [automaticRemoveAction(suggestionId, removable.id, removable.weightLb)],
        applicationState: 'pending',
      });
    }
  }

  return suggestions
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 5);
}

function impactFromRisk(level: FleetRiskLevel | 'unknown'): 'none' | 'low' | 'medium' | 'high' | 'unknown' {
  if (level === 'unknown') return 'unknown';
  if (level === 'critical') return 'high';
  if (level === 'caution') return 'medium';
  if (level === 'watch') return 'low';
  return 'none';
}

function buildRiskTraces(input: {
  beforeWeight: FleetWeightResult;
  afterWeight: FleetWeightResult;
  topHeavyRisk: LoadoutConsequenceImpact;
  recoveryDifficultyImpact: LoadoutConsequenceImpact;
  routeSuitabilityImpact: LoadoutConsequenceImpact;
  routeContext: LoadoutConsequenceRouteContext | null | undefined;
  tireLiftState: LoadoutConsequenceTireLiftState | null | undefined;
  trailerTongueEvidence: EvidenceValue<number> | null;
  sourceWarnings: readonly LoadoutConsequenceSourceWarning[];
}): LoadoutRiskSignalTrace[] {
  const warningIds = input.sourceWarnings.map((warning) => warning.id);
  const roofWeight = highMountedWeight(input.afterWeight);
  const capacityAdjustedRoofWeight = input.afterWeight.highMountedCapacityAdjustedWeight?.lbs ?? roofWeight;
  const rearWeight = rearBiasedWeight(input.afterWeight);
  const routeDifficulty = input.routeContext?.difficulty ?? 'unknown';
  return [
    {
      signalId: 'top_heavy',
      before: input.topHeavyRisk.before,
      after: input.topHeavyRisk.after,
      factors: [
        {
          factorId: 'roof_weight',
          impact: capacityAdjustedRoofWeight >= 500 ? 'high' : capacityAdjustedRoofWeight >= 320 ? 'medium' : capacityAdjustedRoofWeight >= 180 ? 'low' : 'none',
          reason: `${Math.round(roofWeight)} lb is mounted in roof/high-bed zones; ${Math.round(capacityAdjustedRoofWeight)} lb remains after dynamic rating credit.`,
          sourceWarningIds: [],
          zoneIds: ['roof', 'bedHigh'],
        },
        {
          factorId: 'load_zone_height',
          impact: roofWeight > 0 ? 'medium' : 'none',
          reason: 'High load zones raise center-of-gravity sensitivity.',
          sourceWarningIds: [],
          zoneIds: ['roof', 'bedHigh'],
        },
        {
          factorId: 'route_difficulty',
          impact: routeDifficulty === 'hard' ? 'medium' : routeDifficulty === 'moderate' ? 'low' : routeDifficulty === 'unknown' ? 'unknown' : 'none',
          reason: `Route difficulty input: ${routeDifficulty}.`,
          sourceWarningIds: input.routeContext ? [] : warningIds.filter((id) => id.includes('route-context')),
        },
        {
          factorId: 'gvwr_percent',
          impact: impactFromRisk(riskFromGvwrUsage(input.afterWeight.gvwrUsagePct)),
          reason: input.afterWeight.gvwrUsagePct == null
            ? 'GVWR percent unavailable.'
            : `${roundTenths(input.afterWeight.gvwrUsagePct)}% GVWR usage after proposed load.`,
          sourceWarningIds: warningIds.filter((id) => id.includes('gvwr')),
        },
      ],
    },
    {
      signalId: 'recovery_difficulty',
      before: input.recoveryDifficultyImpact.before,
      after: input.recoveryDifficultyImpact.after,
      factors: [
        {
          factorId: 'loaded_weight',
          impact: input.afterWeight.operatingWeight.lbs >= 7500 ? 'high' : input.afterWeight.operatingWeight.lbs >= 6500 ? 'medium' : 'low',
          reason: `${Math.round(input.afterWeight.operatingWeight.lbs)} lb estimated loaded vehicle weight.`,
          sourceWarningIds: [],
        },
        {
          factorId: 'rear_weight',
          impact: rearWeight >= 700 ? 'medium' : rearWeight > 0 ? 'low' : 'none',
          reason: `${Math.round(rearWeight)} lb is rear-biased or hitch/trailer load.`,
          sourceWarningIds: [],
          zoneIds: ['rearLow', 'hitch', 'trailer'],
        },
        {
          factorId: 'tire_lift_state',
          impact: ((input.tireLiftState?.tireSizeInches ?? 0) >= 35 || (input.tireLiftState?.suspensionLiftInches ?? 0) >= 3) ? 'medium' : 'none',
          reason: `Tire/lift input: ${input.tireLiftState?.tireSizeInches ?? 'unknown'} in tires, ${input.tireLiftState?.suspensionLiftInches ?? 'unknown'} in lift.`,
          sourceWarningIds: [],
        },
        {
          factorId: 'trailer_state',
          impact: (input.trailerTongueEvidence?.value ?? 0) > 0 ? 'medium' : 'none',
          reason: (input.trailerTongueEvidence?.value ?? 0) > 0
            ? `${Math.round(input.trailerTongueEvidence?.value ?? 0)} lb trailer tongue load included.`
            : 'No attached trailer tongue load included.',
          sourceWarningIds: warningIds.filter((id) => id.includes('trailer')),
        },
        {
          factorId: 'remoteness',
          impact: input.routeContext?.remoteness === 'high' ? 'high' : input.routeContext?.remoteness === 'medium' ? 'medium' : input.routeContext?.remoteness === 'unknown' ? 'unknown' : 'none',
          reason: `Remoteness input: ${input.routeContext?.remoteness ?? 'unknown'}.`,
          sourceWarningIds: input.routeContext ? [] : warningIds.filter((id) => id.includes('route-context')),
        },
        {
          factorId: 'recovery_posture',
          impact: input.routeContext?.recoveryPosture === 'remote' ? 'high' : input.routeContext?.recoveryPosture === 'limited' ? 'medium' : input.routeContext?.recoveryPosture === 'unknown' ? 'unknown' : 'none',
          reason: `Recovery posture input: ${input.routeContext?.recoveryPosture ?? 'unknown'}.`,
          sourceWarningIds: input.routeContext ? [] : warningIds.filter((id) => id.includes('route-context')),
        },
      ],
    },
    {
      signalId: 'route_suitability',
      before: input.routeSuitabilityImpact.before,
      after: input.routeSuitabilityImpact.after,
      factors: [
        {
          factorId: 'route_difficulty',
          impact: routeDifficulty === 'hard' ? 'high' : routeDifficulty === 'moderate' ? 'medium' : routeDifficulty === 'unknown' ? 'unknown' : 'none',
          reason: `Route difficulty input: ${routeDifficulty}.`,
          sourceWarningIds: input.routeContext ? [] : warningIds.filter((id) => id.includes('route-context')),
        },
        {
          factorId: 'terrain_risk',
          impact: impactFromRisk(input.routeContext?.terrainRisk ?? 'unknown'),
          reason: `Terrain risk input: ${input.routeContext?.terrainRisk ?? 'unknown'}.`,
          sourceWarningIds: input.routeContext ? [] : warningIds.filter((id) => id.includes('route-context')),
        },
        {
          factorId: 'trailer_state',
          impact: (input.trailerTongueEvidence?.value ?? 0) > 0 ? 'medium' : 'none',
          reason: (input.trailerTongueEvidence?.value ?? 0) > 0 ? 'Attached trailer affects route fit review.' : 'No trailer state impact.',
          sourceWarningIds: warningIds.filter((id) => id.includes('trailer')),
        },
        {
          factorId: 'missing_source',
          impact: !input.routeContext || input.routeContext.freshness === 'stale' || input.routeContext.freshness === 'unavailable' ? 'unknown' : 'none',
          reason: !input.routeContext
            ? 'Route context is missing.'
            : `Route context freshness: ${input.routeContext.freshness ?? 'unknown'}.`,
          sourceWarningIds: warningIds.filter((id) => id.includes('route-context')),
        },
      ],
    },
  ];
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
  routeContext: LoadoutConsequenceRouteContext | null | undefined;
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

  if (!input.routeContext) {
    addWarning(warnings, {
      id: 'missing-route-context',
      severity: 'warning',
      field: 'routeContext',
      sourceKind: null,
      message: 'Route context is missing; route suitability remains partial and advisory.',
    });
  } else if (input.routeContext.freshness === 'stale' || input.routeContext.freshness === 'unavailable') {
    addWarning(warnings, {
      id: 'stale-route-context',
      severity: 'warning',
      field: 'routeContext',
      sourceKind: input.routeContext.sourceKind ?? null,
      message: 'Cached route or terrain context is stale or unavailable; route suitability must not be treated as fresh.',
    });
  }

  return Array.from(warnings.values());
}

function contributionKindForItem(item: FleetLoadoutItem): LoadoutWeightContributionKind {
  const text = `${item.category} ${item.name}`.toLowerCase();
  if (text.includes('trailer tongue')) return 'trailer_tongue_weight';
  if (text.includes('water')) return 'water_weight';
  if (text.includes('fuel') || text.includes('gas') || text.includes('diesel')) return 'fuel_weight';
  if (text.includes('fluid') || text.includes('oil') || text.includes('coolant')) return 'other_fluid_weight';
  return 'gear_weight';
}

function contributionSourceFromWeight(weightValue: FleetWeightValue, fallbackLabel: string): EvidenceValue<number> {
  return {
    value: weightValue.lbs,
    sourceKind: fleetWeightSourceToSourceKind(weightValue.source),
    confidence: clampConfidence(weightValue.confidence),
    sourceLabel: weightValue.sourceLabel ?? fallbackLabel,
    observedAt: weightValue.verifiedAt ?? null,
  };
}

function buildWeightContributions(input: {
  vehicle: FleetVehicle;
  accessories: readonly FleetAccessoryInstall[];
  loadoutItems: readonly FleetLoadoutItem[];
  inferredCurbWeight: EvidenceValue<number> | null;
  sourceWarnings: readonly LoadoutConsequenceSourceWarning[];
}): LoadoutWeightContribution[] {
  const warningIdsFor = (sourceKind: SourceKind | null, field?: string) =>
    input.sourceWarnings
      .filter((warning) =>
        (sourceKind && warning.sourceKind === sourceKind) ||
        (field && warning.field === field))
      .map((warning) => warning.id);
  const baseSource = weightValueToEvidence(input.vehicle.buildProfile.baseNetWeight, 'Base or curb weight');
  const contributions: LoadoutWeightContribution[] = [{
    contributionId: `${input.vehicle.id}:base_or_curb_weight`,
    kind: input.inferredCurbWeight ? 'inferred_curb_from_net_payload' : 'base_or_curb_weight',
    label: input.inferredCurbWeight ? 'Inferred curb/base weight' : 'Base or curb weight',
    weight: roundLbs(input.vehicle.buildProfile.baseNetWeight?.lbs ?? null),
    unit: 'lb',
    source: input.inferredCurbWeight ?? baseSource,
    sourceWarningIds: warningIdsFor((input.inferredCurbWeight ?? baseSource)?.sourceKind ?? null, 'baseNetWeight'),
  }];

  for (const item of input.accessories) {
    const source = contributionSourceFromWeight(item.installedWeight, `${item.name} weight`);
    contributions.push({
      contributionId: `${input.vehicle.id}:accessory:${item.id}`,
      kind: 'accessory_weight',
      label: item.name,
      weight: roundLbs(item.installedWeight.lbs),
      unit: 'lb',
      source,
      sourceWarningIds: warningIdsFor(source.sourceKind, 'accessories'),
      itemIds: [item.id],
      zoneIds: [item.loadZone],
    });
  }

  for (const item of input.loadoutItems) {
    const source = contributionSourceFromWeight(item.weight, `${item.name} weight`);
    contributions.push({
      contributionId: `${input.vehicle.id}:loadout:${item.id}`,
      kind: contributionKindForItem(item),
      label: item.name,
      weight: roundLbs(item.weight.lbs * Math.max(1, item.quantity)),
      unit: 'lb',
      source,
      sourceWarningIds: warningIdsFor(source.sourceKind, 'loadoutItems'),
      itemIds: [item.id],
      zoneIds: [item.loadZone],
    });
  }

  return contributions;
}

function buildCalculationTrace(input: {
  original: LoadoutConsequenceInput;
  vehicle: FleetVehicle;
  currentAccessories: readonly FleetAccessoryInstall[];
  currentLoadoutItems: readonly FleetLoadoutItem[];
  proposedAccessories: readonly FleetAccessoryInstall[];
  proposedLoadoutItems: readonly FleetLoadoutItem[];
  beforeWeight: FleetWeightResult;
  afterWeight: FleetWeightResult;
  sourceWarnings: readonly LoadoutConsequenceSourceWarning[];
  traceSources: ReturnType<typeof withVehicleSpecEvidence>['traceSources'];
  generatedAt: string;
  payloadRemainingBefore: number | null;
  payloadRemainingAfter: number | null;
  gvwrPercentBefore: number | null;
  gvwrPercentAfter: number | null;
  loadedVehicleWeightBefore: number | null;
  loadedVehicleWeightAfter: number | null;
}): LoadoutConsequenceCalculationTrace {
  const routeId = input.original.routeId ?? input.original.routeContext?.routeId ?? undefined;
  const routeGeometryVersion = input.original.routeGeometryVersion ?? input.original.routeContext?.routeGeometryVersion ?? undefined;
  const sourcePrecedenceApplied = [...input.traceSources.sourcePrecedenceApplied];
  if (input.original.routeContext) {
    sourcePrecedenceApplied.push({
      fieldPath: 'routeContext',
      chosenSourceKind: input.original.routeContext.sourceKind ?? 'estimated',
      availableSourceKinds: [input.original.routeContext.sourceKind ?? 'estimated'],
      reason: input.original.routeContext.freshness === 'current'
        ? 'Route context marked current by caller.'
        : 'Route context is cached, stale, unavailable, or not source-verified.',
    });
  }

  return {
    vehicleId: input.original.vehicleId,
    profileId: input.original.profileId ?? undefined,
    loadoutId: input.original.loadoutId ?? input.vehicle.activeLoadoutId ?? undefined,
    routeId,
    routeGeometryVersion,
    calculationMode: input.original.calculationMode ?? 'preview',
    gvwr: input.traceSources.gvwr,
    curbWeight: input.traceSources.curbWeight,
    baseWeight: input.traceSources.baseWeight,
    netPayload: input.traceSources.netPayload,
    inferredCurbWeight: input.traceSources.inferredCurbWeight,
    weightContributionsBefore: buildWeightContributions({
      vehicle: input.vehicle,
      accessories: input.currentAccessories,
      loadoutItems: input.currentLoadoutItems,
      inferredCurbWeight: input.traceSources.inferredCurbWeight,
      sourceWarnings: input.sourceWarnings,
    }),
    weightContributionsAfter: buildWeightContributions({
      vehicle: input.vehicle,
      accessories: input.proposedAccessories,
      loadoutItems: input.proposedLoadoutItems,
      inferredCurbWeight: input.traceSources.inferredCurbWeight,
      sourceWarnings: input.sourceWarnings,
    }),
    loadedWeightBefore: input.loadedVehicleWeightBefore,
    loadedWeightAfter: input.loadedVehicleWeightAfter,
    payloadRemainingBefore: input.payloadRemainingBefore,
    payloadRemainingAfter: input.payloadRemainingAfter,
    gvwrPercentBefore: input.gvwrPercentBefore,
    gvwrPercentAfter: input.gvwrPercentAfter,
    sourcePrecedenceApplied,
    warnings: [...input.sourceWarnings],
    generatedAt: input.generatedAt,
  };
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
    routeContext: input.routeContext,
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
  const loadedVehicleWeightBefore = normalizedVehicle.coreMissing.base ? null : roundLbs(beforeWeight.operatingWeight.lbs);
  const loadedVehicleWeightAfter = normalizedVehicle.coreMissing.base ? null : roundLbs(afterWeight.operatingWeight.lbs);
  const riskTraces = buildRiskTraces({
    beforeWeight,
    afterWeight,
    topHeavyRisk,
    recoveryDifficultyImpact,
    routeSuitabilityImpact,
    routeContext: input.routeContext,
    tireLiftState: input.tireLiftState ?? {
      tireSizeInches: vehicle.buildProfile.tireSizeInches,
      suspensionLiftInches: vehicle.buildProfile.suspensionLiftInches,
      isLeveled: vehicle.buildProfile.isLeveled,
    },
    trailerTongueEvidence: trailerTongue.evidence,
    sourceWarnings,
  });
  const calculationTrace = buildCalculationTrace({
    original: input,
    vehicle,
    currentAccessories,
    currentLoadoutItems,
    proposedAccessories,
    proposedLoadoutItems,
    beforeWeight,
    afterWeight,
    sourceWarnings,
    traceSources: normalizedVehicle.traceSources,
    generatedAt,
    payloadRemainingBefore,
    payloadRemainingAfter,
    gvwrPercentBefore,
    gvwrPercentAfter,
    loadedVehicleWeightBefore,
    loadedVehicleWeightAfter,
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
    calculationTrace,
    riskTraces,
    beforeWeight,
    afterWeight,
  };
}

export type LoadoutSuggestionApplicationResult = {
  applicationState: LoadoutSuggestionApplicationState;
  telemetryEvent:
    | 'suggestion_acknowledged'
    | 'suggestion_editor_opened'
    | 'suggestion_applied'
    | 'suggestion_apply_failed'
    | 'suggestion_dismissed';
  reason: string;
  nextState: FleetBuildLoadoutState;
  appliedAction?: LoadoutSuggestionAction;
};

function activeCompartmentForZone(state: FleetBuildLoadoutState, zoneId: string | undefined) {
  if (!zoneId) return null;
  return state.compartments.find((item) => item.status !== 'removed' && item.loadZone === zoneId) ?? null;
}

function itemIsProtectedFromAutoRemove(item: FleetCompartmentLoadoutItem): boolean {
  const text = `${item.category} ${item.name}`.toLowerCase();
  return item.permanence === 'always' || text.includes('recovery') || text.includes('safety') || text.includes('first aid');
}

export function applyLoadoutSuggestionAction(input: {
  preview: LoadoutConsequencePreview;
  actionId: string;
  state: FleetBuildLoadoutState;
  currentVehicleId: string;
  currentProfileId?: string | null;
  currentLoadoutId?: string | null;
  previewStale?: boolean;
}): LoadoutSuggestionApplicationResult {
  const action = input.preview.suggestions.flatMap((suggestion) => suggestion.actions).find((item) => item.actionId === input.actionId);
  if (!action) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Suggestion action was not found for this preview.',
      nextState: input.state,
    };
  }
  if (input.previewStale) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Preview is stale; reopen the editor before applying this suggestion.',
      nextState: input.state,
      appliedAction: action,
    };
  }
  if (input.preview.vehicleId !== input.currentVehicleId) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Suggestion belongs to a different vehicle.',
      nextState: input.state,
      appliedAction: action,
    };
  }
  const trace = input.preview.calculationTrace;
  if (trace.profileId && input.currentProfileId && trace.profileId !== input.currentProfileId) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Suggestion belongs to a different vehicle profile.',
      nextState: input.state,
      appliedAction: action,
    };
  }
  if (trace.loadoutId && input.currentLoadoutId && trace.loadoutId !== input.currentLoadoutId) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Suggestion belongs to a different loadout.',
      nextState: input.state,
      appliedAction: action,
    };
  }
  if (!action.canApplyAutomatically) {
    return {
      applicationState: 'review_only',
      telemetryEvent: action.actionKind === 'open_editor' ? 'suggestion_editor_opened' : 'suggestion_acknowledged',
      reason: action.actionKind === 'open_editor'
        ? 'Suggestion requires review in the editor before changing loadout state.'
        : 'Suggestion acknowledged; no loadout state was changed.',
      nextState: input.state,
      appliedAction: action,
    };
  }

  const targetItemId = action.targetItemIds[0];
  const currentItem = (input.state.loadoutItems ?? []).find((item) => item.id === targetItemId) ?? null;
  if (!currentItem) {
    return {
      applicationState: 'failed',
      telemetryEvent: 'suggestion_apply_failed',
      reason: 'Target item no longer exists in the proposed loadout.',
      nextState: input.state,
      appliedAction: action,
    };
  }

  if (action.actionKind === 'relocate_item') {
    const targetCompartment = activeCompartmentForZone(input.state, action.targetZoneId);
    if (!targetCompartment) {
      return {
        applicationState: 'failed',
        telemetryEvent: 'suggestion_apply_failed',
        reason: 'Compatible target load zone is unavailable in the current loadout.',
        nextState: input.state,
        appliedAction: action,
      };
    }
    const nextItem: FleetCompartmentLoadoutItem = {
      ...currentItem,
      loadZone: targetCompartment.loadZone,
      compartmentId: targetCompartment.id,
      placement: targetCompartment.placement,
    };
    return {
      applicationState: 'applied',
      telemetryEvent: 'suggestion_applied',
      reason: `Moved ${currentItem.name} to ${targetCompartment.name}.`,
      nextState: {
        ...input.state,
        loadoutItems: (input.state.loadoutItems ?? []).map((item) => item.id === currentItem.id ? nextItem : item),
      },
      appliedAction: action,
    };
  }

  if (action.actionKind === 'remove_item') {
    if (itemIsProtectedFromAutoRemove(currentItem)) {
      return {
        applicationState: 'failed',
        telemetryEvent: 'suggestion_apply_failed',
        reason: 'Cannot automatically remove required recovery or safety gear.',
        nextState: input.state,
        appliedAction: action,
      };
    }
    return {
      applicationState: 'applied',
      telemetryEvent: 'suggestion_applied',
      reason: `Removed optional item ${currentItem.name}.`,
      nextState: {
        ...input.state,
        loadoutItems: (input.state.loadoutItems ?? []).filter((item) => item.id !== currentItem.id),
      },
      appliedAction: action,
    };
  }

  return {
    applicationState: 'review_only',
    telemetryEvent: 'suggestion_acknowledged',
    reason: 'This suggestion is review-only in the current beta.',
    nextState: input.state,
    appliedAction: action,
  };
}

export class LoadoutConsequenceSystem {
  evaluate(input: LoadoutConsequenceInput): LoadoutConsequencePreview {
    return buildLoadoutConsequencePreview(input);
  }
}

export function buildCommandBriefLoadoutConsequenceSummary(
  preview: LoadoutConsequencePreview | null | undefined,
  mirror?: LoadoutConsequenceMirror | null,
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
    source: mirror?.source ?? 'proposed_preview',
    stale: mirror?.stale ?? false,
    invalidationReason: mirror?.invalidationReason,
  };
}

export function buildExpeditionReadinessLoadoutConsequenceSummary(
  preview: LoadoutConsequencePreview | null | undefined,
): CommandBriefLoadoutConsequenceSummary | null {
  return buildCommandBriefLoadoutConsequenceSummary(preview);
}

function buildLoadoutConsequenceMirror(
  preview: LoadoutConsequencePreview,
  options: {
    source?: LoadoutConsequenceMirrorSource;
    stale?: boolean;
    invalidationReason?: LoadoutConsequenceMirrorInvalidationReason;
  } = {},
): LoadoutConsequenceMirror {
  return {
    source: options.source ?? (preview.calculationTrace.calculationMode === 'committed' ? 'committed_loadout' : 'proposed_preview'),
    vehicleId: preview.vehicleId,
    profileId: preview.calculationTrace.profileId,
    loadoutId: preview.calculationTrace.loadoutId,
    routeId: preview.calculationTrace.routeId,
    routeGeometryVersion: preview.calculationTrace.routeGeometryVersion,
    previewId: `${preview.vehicleId}:${preview.generatedAt}`,
    generatedAt: preview.generatedAt,
    stale: options.stale ?? false,
    invalidationReason: options.invalidationReason,
    aggregateImpact: {
      payloadPressure: riskFromGvwrUsage(preview.gvwrPercentAfter),
      topHeavyRisk: preview.topHeavyRisk.level,
      recoveryDifficulty: preview.recoveryDifficultyImpact.level,
      routeSuitability: preview.routeSuitabilityImpact.level,
    },
  };
}

export function publishLoadoutConsequencePreview(
  preview: LoadoutConsequencePreview | null,
  options: {
    source?: LoadoutConsequenceMirrorSource;
    invalidationReason?: LoadoutConsequenceMirrorInvalidationReason;
  } = {},
): LoadoutConsequencePreviewSnapshot {
  const mirror = preview ? buildLoadoutConsequenceMirror(preview, options) : null;
  snapshot = {
    preview,
    summary: buildCommandBriefLoadoutConsequenceSummary(preview, mirror),
    mirror,
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

export function invalidateLoadoutConsequenceMirror(
  reason: LoadoutConsequenceMirrorInvalidationReason,
  context: {
    vehicleId?: string | null;
    profileId?: string | null;
    loadoutId?: string | null;
    routeId?: string | null;
    routeGeometryVersion?: string | null;
  } = {},
): LoadoutConsequencePreviewSnapshot {
  const currentMirror = snapshot.mirror;
  const generatedAt = new Date().toISOString();
  const mirror: LoadoutConsequenceMirror = currentMirror
    ? {
        ...currentMirror,
        stale: true,
        invalidationReason: reason,
        generatedAt,
      }
    : {
        source: 'proposed_preview',
        vehicleId: context.vehicleId ?? 'unknown',
        profileId: context.profileId ?? undefined,
        loadoutId: context.loadoutId ?? undefined,
        routeId: context.routeId ?? undefined,
        routeGeometryVersion: context.routeGeometryVersion ?? undefined,
        generatedAt,
        stale: true,
        invalidationReason: reason,
        aggregateImpact: {},
      };
  snapshot = {
    preview: snapshot.preview,
    summary: snapshot.summary ? {
      ...snapshot.summary,
      stale: true,
      invalidationReason: reason,
    } : null,
    mirror,
    updatedAt: generatedAt,
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

export function isLoadoutConsequenceMirrorValid(
  mirror: LoadoutConsequenceMirror | null | undefined,
  context: {
    vehicleId?: string | null;
    profileId?: string | null;
    loadoutId?: string | null;
    routeId?: string | null;
    routeGeometryVersion?: string | null;
    now?: string;
    maxAgeMinutes?: number;
  },
): { valid: boolean; invalidationReason?: LoadoutConsequenceMirrorInvalidationReason } {
  if (!mirror) return { valid: false, invalidationReason: 'source_missing' };
  if (mirror.stale) return { valid: false, invalidationReason: mirror.invalidationReason ?? 'expired' };
  if (context.vehicleId && mirror.vehicleId !== context.vehicleId) return { valid: false, invalidationReason: 'vehicle_changed' };
  if (context.profileId && mirror.profileId && mirror.profileId !== context.profileId) return { valid: false, invalidationReason: 'profile_changed' };
  if (context.loadoutId && mirror.loadoutId && mirror.loadoutId !== context.loadoutId) return { valid: false, invalidationReason: 'loadout_changed' };
  if (context.routeId && mirror.routeId && mirror.routeId !== context.routeId) return { valid: false, invalidationReason: 'route_changed' };
  if (context.routeGeometryVersion && mirror.routeGeometryVersion && mirror.routeGeometryVersion !== context.routeGeometryVersion) {
    return { valid: false, invalidationReason: 'route_geometry_changed' };
  }
  if (context.now && context.maxAgeMinutes) {
    const ageMs = Date.parse(context.now) - Date.parse(mirror.generatedAt);
    if (Number.isFinite(ageMs) && ageMs > context.maxAgeMinutes * 60 * 1000) {
      return { valid: false, invalidationReason: 'expired' };
    }
  }
  return { valid: true };
}

export function validateLoadoutScaleValidationEvidence(
  evidence: Partial<LoadoutScaleValidationEvidence> | null | undefined,
  options: { maxDeltaPercent?: number } = {},
): { valid: boolean; blocked: boolean; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const maxDeltaPercent = options.maxDeltaPercent ?? 5;
  if (!evidence || typeof evidence !== 'object') {
    return {
      valid: false,
      blocked: true,
      blockers: ['scale_validation_evidence_missing'],
      warnings,
    };
  }
  if (!evidence.evidenceId) blockers.push('scale_evidence_id_missing');
  if (!evidence.vehicleId) blockers.push('scale_vehicle_id_missing');
  if (!evidence.measuredAt) blockers.push('scale_measured_at_missing');
  if (!['scale_ticket', 'loaded_scale', 'user_confirmed'].includes(String(evidence.sourceKind))) {
    blockers.push('scale_source_kind_invalid');
  }
  if (typeof evidence.predictedLoadedWeight !== 'number' || !Number.isFinite(evidence.predictedLoadedWeight)) {
    blockers.push('scale_predicted_weight_missing');
  }
  if (typeof evidence.measuredLoadedWeight !== 'number' || !Number.isFinite(evidence.measuredLoadedWeight)) {
    blockers.push('scale_measured_weight_missing');
  }
  if (evidence.unit !== 'lb' && evidence.unit !== 'kg') blockers.push('scale_unit_invalid');
  if (!evidence.acceptedBy || !evidence.acceptedAt) blockers.push('scale_owner_acceptance_missing');
  if (typeof evidence.deltaPercent === 'number' && evidence.deltaPercent > maxDeltaPercent) {
    blockers.push('loaded_scale_delta_exceeds_policy');
  }
  if (!evidence.artifactPath) warnings.push('scale_artifact_path_missing');
  return {
    valid: blockers.length === 0,
    blocked: blockers.length > 0,
    blockers,
    warnings,
  };
}

export function getLoadoutConsequencePreviewSnapshot(): LoadoutConsequencePreviewSnapshot {
  return snapshot;
}

export function subscribeLoadoutConsequencePreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
