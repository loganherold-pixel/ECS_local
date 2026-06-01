import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampHardGateResult,
  CampRecommendationSet,
  CampResourceDebt,
  CampSearchContext,
  CampSuitabilityScores,
} from './campOpsTypes';
import {
  isCampOpsAiAssistFeatureEnabled,
  type CampOpsRecommendationRolloutConfig,
} from './campOpsRecommendationConfig';
import { emitCampOpsAiSummaryGenerated } from './campOpsTelemetry';

export type CampOpsAiAssistMode = 'planning' | 'field';

export type CampOpsAiAssistRecommendationStatus =
  | 'recommended'
  | 'caution'
  | 'not_recommended'
  | 'unknown';

export type CampOpsAiAssistOutput = {
  headline: string;
  primaryRecommendation: {
    campId: string | null;
    status: CampOpsAiAssistRecommendationStatus;
    summary: string;
  };
  why: string[];
  tradeoffs: string[];
  risks: string[];
  requiredActions: string[];
  backupPlan: string | null;
  emergencyPlan: string | null;
  confidenceNote: string;
  sourceConfidenceNote: string;
  staleDataWarnings: string[];
  missingDataWarnings: string[];
  conflictWarnings: string[];
  decisionPointSummary: string | null;
  convoyMessage: string | null;
};

export type CampOpsAiAssistPromptInput = {
  context: CampSearchContext;
  recommendationSet: CampRecommendationSet;
  mode?: CampOpsAiAssistMode;
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
};

export type CampOpsAiAssistPayload = {
  source: 'campops_recommendation_set';
  mode: CampOpsAiAssistMode;
  contextSummary: {
    id: string;
    routeId?: string | null;
    tripId?: string | null;
    plannedCampId?: string | null;
    currentTimeIso: string;
    desiredArrivalWindow?: CampSearchContext['desiredArrivalWindow'];
    daylightInfo?: CampSearchContext['daylightInfo'];
    riskTolerance: CampSearchContext['riskTolerance'];
    offlineMode: CampSearchContext['offlineMode'];
    delayEstimateMinutes?: number | null;
    vehicleProfile?: CampOpsAiAssistVehicleSummary | null;
    convoyProfile?: CampOpsAiAssistConvoySummary | null;
    resourceState?: CampSearchContext['resourceState'];
    routeProgress?: CampSearchContext['routeProgress'];
  };
  recommendedCamp: CampOpsAiAssistCampBrief | null;
  backupCamp: CampOpsAiAssistCampBrief | null;
  emergencyCamp: CampOpsAiAssistCampBrief | null;
  rejectedCandidates: Array<{
    campId: string;
    name: string;
    reasons: string[];
    gates: CampHardGateResult[];
  }>;
  hardGateWarnings: Array<{
    campId: string;
    gateId: string;
    severity: CampHardGateResult['severity'];
    reason: string;
    missingDataFields: string[];
  }>;
  suitabilityScores: Record<string, CampSuitabilityScores>;
  resourceDebtByCandidateId: Record<string, CampResourceDebt | undefined>;
  tradeoffs: string[];
  assumptions: string[];
  missingData: string[];
  sourceConfidence: {
    level: CampRecommendationSet['confidenceSummary']['level'];
    score: CampRecommendationSet['confidenceSummary']['score'];
    reasons: string[];
    resolvedSourceConfidence: string[];
  };
  staleSourceSummaries: string[];
  sourceConflictSummaries: string[];
  missingCriticalSourceData: string[];
  resourceDebtSummary: string[];
  confidenceSummary: CampRecommendationSet['confidenceSummary'];
  plannedCampDowngradeReason?: string | null;
  decisionPoint?: CampRecommendationSet['decisionPoint'];
  decisionPointSummary?: string | null;
};

export type CampOpsAiAssistVehicleSummary = Pick<
  NonNullable<CampSearchContext['vehicleProfile']>,
  | 'vehicleType'
  | 'widthInches'
  | 'wheelbaseInches'
  | 'clearanceInches'
  | 'trailerAttached'
  | 'rooftopTent'
  | 'confidence'
>;

export type CampOpsAiAssistResourceVehicleSummary = Pick<
  NonNullable<NonNullable<CampSearchContext['convoyProfile']>['lowestFuelReserveVehicle']>,
  'fuelReserveMiles' | 'fuelPercent' | 'waterGallons' | 'waterPercent' | 'confidence'
>;

export type CampOpsAiAssistConvoySummary = Pick<
  NonNullable<CampSearchContext['convoyProfile']>,
  | 'vehicleCount'
  | 'peopleCount'
  | 'petCount'
  | 'kidCount'
  | 'kidsPresent'
  | 'trailerCount'
  | 'trailerPresent'
  | 'delayedMemberCount'
  | 'mechanicalIssueFlag'
  | 'preferredRiskTolerance'
  | 'source'
  | 'confidence'
> & {
  leastCapableVehicleProfile?: CampOpsAiAssistVehicleSummary | null;
  lowestFuelReserveVehicle?: CampOpsAiAssistResourceVehicleSummary | null;
  lowestWaterReserveVehicle?: CampOpsAiAssistResourceVehicleSummary | null;
};

export type CampOpsAiAssistCampBrief = {
  id: string;
  name: string;
  source: CampCandidate['source'];
  sourceConfidence: CampCandidate['sourceConfidence'];
  legalStatus?: CampCandidateEnrichment['legalStatus'];
  legalConfidence?: CampCandidateEnrichment['legalConfidence'];
  closureStatus?: CampCandidateEnrichment['closureStatus'];
  closureReason?: CampCandidateEnrichment['closureReason'];
  restrictionWindow?: CampCandidateEnrichment['restrictionWindow'];
  accessDifficulty?: CampCandidateEnrichment['accessDifficulty'];
  trailerSuitability?: CampCandidateEnrichment['trailerSuitability'];
  turnaroundSuitability?: CampCandidateEnrichment['turnaroundSuitability'];
  trailerTurnaroundConfidence?: CampCandidateEnrichment['trailerTurnaroundConfidence'];
  deadEndRisk?: CampCandidateEnrichment['deadEndRisk'];
  backingRequired?: CampCandidateEnrichment['backingRequired'];
  roadWidthConfidence?: CampCandidateEnrichment['roadWidthConfidence'];
  groupCapacityEstimate?: CampCandidateEnrichment['groupCapacityEstimate'];
  groupCapacityConfidence?: CampCandidateEnrichment['groupCapacityConfidence'];
  etaIso?: string | null;
  sunsetMarginMinutes?: number | null;
  lateArrivalRisk?: CampCandidateEnrichment['lateArrivalRisk'];
  fuelImpact?: CampCandidateEnrichment['fuelImpact'];
  waterImpact?: CampCandidateEnrichment['waterImpact'];
  nearestFuel?: CampCandidateEnrichment['nearestFuel'];
  nearestWater?: CampCandidateEnrichment['nearestWater'];
  nearestPropane?: CampCandidateEnrichment['nearestPropane'];
  nearestDump?: CampCandidateEnrichment['nearestDump'];
  nearestRepair?: CampCandidateEnrichment['nearestRepair'];
  nearestTownOrExit?: CampCandidateEnrichment['nearestTownOrExit'];
  weatherExposure?: CampCandidateEnrichment['weatherExposure'];
  weatherExposureLevel?: CampCandidateEnrichment['weatherExposureLevel'];
  forecastTimeWindow?: CampCandidateEnrichment['forecastTimeWindow'];
  windSpeedMph?: CampCandidateEnrichment['windSpeedMph'];
  windGustMph?: CampCandidateEnrichment['windGustMph'];
  windDirection?: CampCandidateEnrichment['windDirection'];
  precipitationRisk?: CampCandidateEnrichment['precipitationRisk'];
  stormRisk?: CampCandidateEnrichment['stormRisk'];
  temperatureLowF?: CampCandidateEnrichment['temperatureLowF'];
  temperatureHighF?: CampCandidateEnrichment['temperatureHighF'];
  heatRisk?: CampCandidateEnrichment['heatRisk'];
  coldRisk?: CampCandidateEnrichment['coldRisk'];
  fireRestrictionStatus?: CampCandidateEnrichment['fireRestrictionStatus'];
  campfireAllowed?: CampCandidateEnrichment['campfireAllowed'];
  stoveAllowed?: CampCandidateEnrichment['stoveAllowed'];
  fireRestrictionLevel?: CampCandidateEnrichment['fireRestrictionLevel'];
  redFlagRisk?: CampCandidateEnrichment['redFlagRisk'];
  smokeOrAirQualityRisk?: CampCandidateEnrichment['smokeOrAirQualityRisk'];
  privacyLikelihood?: CampCandidateEnrichment['privacyLikelihood'];
  occupancyLikelihood?: CampCandidateEnrichment['occupancyLikelihood'];
  dataConfidence?: CampCandidateEnrichment['dataConfidence'];
  sourceSignals?: CampCandidateEnrichment['sourceSignals'];
  sourceResolutions?: CampCandidateEnrichment['sourceResolutions'];
  scores?: CampSuitabilityScores;
  resourceDebt?: CampResourceDebt;
  roles?: string[];
};

export type CampOpsAiAssistParseResult = {
  output: CampOpsAiAssistOutput;
  valid: boolean;
  issues: string[];
};

export const CAMP_OPS_AI_ASSIST_OUTPUT_SCHEMA = {
  type: 'object',
  required: [
    'headline',
    'primaryRecommendation',
    'why',
    'tradeoffs',
    'risks',
    'requiredActions',
    'backupPlan',
    'emergencyPlan',
    'confidenceNote',
    'sourceConfidenceNote',
    'staleDataWarnings',
    'missingDataWarnings',
    'conflictWarnings',
    'decisionPointSummary',
    'convoyMessage',
  ],
  properties: {
    headline: { type: 'string' },
    primaryRecommendation: {
      type: 'object',
      required: ['campId', 'status', 'summary'],
      properties: {
        campId: { type: ['string', 'null'] },
        status: {
          type: 'string',
          enum: ['recommended', 'caution', 'not_recommended', 'unknown'],
        },
        summary: { type: 'string' },
      },
    },
    why: { type: 'array', items: { type: 'string' } },
    tradeoffs: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    requiredActions: { type: 'array', items: { type: 'string' } },
    backupPlan: { type: ['string', 'null'] },
    emergencyPlan: { type: ['string', 'null'] },
    confidenceNote: { type: 'string' },
    sourceConfidenceNote: { type: 'string' },
    staleDataWarnings: { type: 'array', items: { type: 'string' } },
    missingDataWarnings: { type: 'array', items: { type: 'string' } },
    conflictWarnings: { type: 'array', items: { type: 'string' } },
    decisionPointSummary: { type: ['string', 'null'] },
    convoyMessage: { type: ['string', 'null'] },
  },
} as const;

const AI_RULES = [
  'AI is the CampOps narrator and assistant, not the decision engine.',
  'Use only the CampOps payload as source of truth.',
  'Do not invent legal status.',
  'Do not invent weather, closures, fuel, water, slope, occupancy, or road conditions.',
  'Do not promise a service is open unless the CampOps payload says it is open.',
  'If service hours or status are unknown, say they are unknown.',
  'Use source conflict summaries as resolved CampOps truth; do not override them.',
  'Do not treat stale weather as current weather.',
  'Do not treat stale closure, fire, weather, legal, or service data as current.',
  'If weather exposure is unknown, say weather exposure unknown clearly.',
  'Do not invent campfire, stove, red-flag, smoke, AQI, or fire restriction details.',
  'If the source says campfires are prohibited, say prohibited rather than merely not recommended.',
  'If campfire status is unknown, say campfire status unknown clearly.',
  'Do not override hard-gate rejections.',
  'Hard-gate warnings from CampOps must remain visible in the output.',
  'Unknown legal status must never be narrated as allowed.',
  'If legal confidence is medium, low, or unknown, say so clearly.',
  'If data is stale or missing, say so clearly.',
  'Do not soften stale, expired, cached, missing, or unavailable source warnings.',
  'For field mode, be concise and conservative.',
  'For planning mode, explain tradeoffs more fully.',
  'Never say "definitely legal", "guaranteed open", or "safe" unless that exact certainty exists in provided data.',
  'Prefer "recommended", "not recommended", "fallback only", and "unknown" language.',
  'Include a user action when the decision is time-sensitive.',
  'If a decisionPoint is present, summarize the deadline, continue option, divert option, and risk if continuing.',
];

export function isCampOpsAiAssistAvailable(input: {
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
}): boolean {
  return isCampOpsAiAssistFeatureEnabled(input.rolloutConfig ?? {});
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter((item): item is string => !!item)
    : [];
}

function candidateBrief(
  candidate: CampCandidate | null | undefined,
  recommendationSet: CampRecommendationSet,
): CampOpsAiAssistCampBrief | null {
  if (!candidate) return null;
  const enrichment = recommendationSet.enrichmentsByCandidateId?.[candidate.id];
  return {
    id: candidate.id,
    name: candidate.name,
    source: candidate.source,
    sourceConfidence: candidate.sourceConfidence,
    legalStatus: enrichment?.legalStatus,
    legalConfidence: enrichment?.legalConfidence,
    closureStatus: enrichment?.closureStatus,
    closureReason: enrichment?.closureReason,
    restrictionWindow: enrichment?.restrictionWindow,
    accessDifficulty: enrichment?.accessDifficulty,
    trailerSuitability: enrichment?.trailerSuitability,
    turnaroundSuitability: enrichment?.turnaroundSuitability,
    trailerTurnaroundConfidence: enrichment?.trailerTurnaroundConfidence,
    deadEndRisk: enrichment?.deadEndRisk,
    backingRequired: enrichment?.backingRequired,
    roadWidthConfidence: enrichment?.roadWidthConfidence,
    groupCapacityEstimate: enrichment?.groupCapacityEstimate,
    groupCapacityConfidence: enrichment?.groupCapacityConfidence,
    etaIso: enrichment?.etaIso,
    sunsetMarginMinutes: enrichment?.sunsetMarginMinutes,
    lateArrivalRisk: enrichment?.lateArrivalRisk,
    fuelImpact: enrichment?.fuelImpact,
    waterImpact: enrichment?.waterImpact,
    nearestFuel: enrichment?.nearestFuel,
    nearestWater: enrichment?.nearestWater,
    nearestPropane: enrichment?.nearestPropane,
    nearestDump: enrichment?.nearestDump,
    nearestRepair: enrichment?.nearestRepair,
    nearestTownOrExit: enrichment?.nearestTownOrExit,
    weatherExposure: enrichment?.weatherExposure,
    weatherExposureLevel: enrichment?.weatherExposureLevel,
    forecastTimeWindow: enrichment?.forecastTimeWindow,
    windSpeedMph: enrichment?.windSpeedMph,
    windGustMph: enrichment?.windGustMph,
    windDirection: enrichment?.windDirection,
    precipitationRisk: enrichment?.precipitationRisk,
    stormRisk: enrichment?.stormRisk,
    temperatureLowF: enrichment?.temperatureLowF,
    temperatureHighF: enrichment?.temperatureHighF,
    heatRisk: enrichment?.heatRisk,
    coldRisk: enrichment?.coldRisk,
    fireRestrictionStatus: enrichment?.fireRestrictionStatus,
    campfireAllowed: enrichment?.campfireAllowed,
    stoveAllowed: enrichment?.stoveAllowed,
    fireRestrictionLevel: enrichment?.fireRestrictionLevel,
    redFlagRisk: enrichment?.redFlagRisk,
    smokeOrAirQualityRisk: enrichment?.smokeOrAirQualityRisk,
    privacyLikelihood: enrichment?.privacyLikelihood,
    occupancyLikelihood: enrichment?.occupancyLikelihood,
    dataConfidence: enrichment?.dataConfidence,
    sourceSignals: enrichment?.sourceSignals,
    sourceResolutions: enrichment?.sourceResolutions,
    scores: recommendationSet.scoresByCandidateId?.[candidate.id],
    resourceDebt: enrichment?.resourceDebt,
    roles: recommendationSet.rolesByCandidateId?.[candidate.id] ?? [],
  };
}

function rejectedIds(recommendationSet: CampRecommendationSet): Set<string> {
  return new Set(recommendationSet.rejectedCandidates.map((item) => item.candidate.id));
}

function hardGateWarnings(recommendationSet: CampRecommendationSet): CampOpsAiAssistPayload['hardGateWarnings'] {
  const warnings: CampOpsAiAssistPayload['hardGateWarnings'] = [];
  for (const rejected of recommendationSet.rejectedCandidates) {
    for (const gate of rejected.gates) {
      warnings.push({
        campId: rejected.candidate.id,
        gateId: gate.gateId,
        severity: gate.severity,
        reason: gate.reason,
        missingDataFields: gate.missingDataFields,
      });
    }
  }
  return warnings;
}

function legalConfidenceWarnings(recommendationSet: CampRecommendationSet): string[] {
  return Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) => {
    if (!enrichment) return [];
    if (
      enrichment.legalConfidence === 'medium' ||
      enrichment.legalConfidence === 'low' ||
      enrichment.legalConfidence === 'unknown'
    ) {
      return [`${enrichment.candidateId}: legal confidence is ${enrichment.legalConfidence}.`];
    }
    return [];
  });
}

function missingDataFields(recommendationSet: CampRecommendationSet): string[] {
  const confidenceMissing = recommendationSet.confidenceSummary.missingDataFields ?? [];
  const rejectedMissing = recommendationSet.rejectedCandidates.flatMap((item) =>
    item.gates.flatMap((gate) => gate.missingDataFields),
  );
  const enrichmentMissing = Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) =>
    enrichment?.dataLimitations ?? [],
  );
  return unique([
    ...confidenceMissing,
    ...rejectedMissing,
    ...enrichmentMissing,
    ...legalConfidenceWarnings(recommendationSet),
    ...operationalUnknownNotes(recommendationSet),
  ]);
}

function operationalUnknownNotes(recommendationSet: CampRecommendationSet): string[] {
  return Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) => {
    if (!enrichment) return [];
    const notes: string[] = [];
    if (!enrichment.closureStatus || enrichment.closureStatus === 'unknown') {
      notes.push(`${enrichment.candidateId}: closure status is unknown.`);
    }
    if (
      enrichment.fireRestrictionStatus === 'unknown' &&
      (enrichment.campfireAllowed == null || enrichment.campfireAllowed === 'unknown') &&
      (enrichment.stoveAllowed == null || enrichment.stoveAllowed === 'unknown')
    ) {
      notes.push(`${enrichment.candidateId}: fire restriction status is unknown.`);
    }
    if (
      (!enrichment.weatherExposure || enrichment.weatherExposure === 'unknown') &&
      (!enrichment.weatherExposureLevel || enrichment.weatherExposureLevel === 'unknown')
    ) {
      notes.push(`${enrichment.candidateId}: weather exposure is unknown.`);
    }
    if (
      enrichment.trailerTurnaroundConfidence === 'unknown' ||
      enrichment.turnaroundSuitability === 'unknown'
    ) {
      notes.push(`${enrichment.candidateId}: trailer turnaround confidence is unknown.`);
    }
    return notes;
  });
}

function staleSourceNotes(recommendationSet: CampRecommendationSet): string[] {
  const fromWarnings = recommendationSet.warnings.filter((warning) =>
    /stale|expired|cached|missing|unavailable/i.test(warning),
  );
  const fromSignals = Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) =>
    (enrichment?.sourceSignals ?? [])
      .filter((signal) => signal.isStale || signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired')
      .map((signal) => `${signal.source} source is ${signal.freshnessStatus ?? 'stale'}.`),
  );
  return unique([...fromWarnings, ...fromSignals]);
}

function sourceResolutionNotes(recommendationSet: CampRecommendationSet): {
  resolvedConfidence: string[];
  conflicts: string[];
  stale: string[];
  missing: string[];
} {
  const resolutions = Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) =>
    enrichment?.sourceResolutions ?? [],
  );
  const resolvedConfidence = resolutions.map((resolution) =>
    `${resolution.field}: ${String(resolution.resolvedValue ?? 'unknown')} (${resolution.resolvedConfidence} confidence)`,
  );
  const conflicts = resolutions
    .filter((resolution) => resolution.conflictDetected)
    .map((resolution) => resolution.conflictSummary || `${resolution.field} has conflicting source signals.`);
  const stale = resolutions.flatMap((resolution) =>
    resolution.staleSources.map((source) => `${resolution.field}: stale source ${source}.`),
  );
  const missing = resolutions.flatMap((resolution) =>
    resolution.missingSources.map((source) => `${resolution.field}: missing source ${source}.`),
  );
  return {
    resolvedConfidence: unique(resolvedConfidence),
    conflicts: unique(conflicts),
    stale: unique(stale),
    missing: unique(missing),
  };
}

function fieldMatchesAny(fields: string[], patterns: RegExp[]): boolean {
  return fields.some((field) => patterns.some((pattern) => pattern.test(field)));
}

function sourceSignalNotes(recommendationSet: CampRecommendationSet): {
  staleLegal: string[];
  staleWeather: string[];
  staleClosureFireWeather: string[];
  stale: string[];
  missing: string[];
} {
  const signals = Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) =>
    enrichment?.sourceSignals ?? [],
  );
  const staleSignals = signals.filter((signal) =>
    signal.isStale || signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired',
  );
  const missingSignals = signals.filter((signal) =>
    signal.freshnessStatus === 'unknown' || signal.limitation?.match(/missing|unavailable/i),
  );
  const note = (source: string, fields: string[], freshness: string | undefined, limitation?: string | null) =>
    `${source} ${fields.join(', ') || 'source'} is ${freshness ?? 'stale'}${limitation ? `: ${limitation}` : '.'}`;
  const legalPatterns = [/legal/i, /access/i, /publicAccess/i, /campingAllowed/i, /landStatus/i];
  const weatherPatterns = [/weather/i, /forecast/i, /wind/i, /storm/i, /temperature/i, /heat/i, /cold/i, /smoke/i, /airQuality/i];
  const closureFireWeatherPatterns = [/closure/i, /restriction/i, /fire/i, /campfire/i, /stove/i, /redFlag/i, ...weatherPatterns];
  return {
    staleLegal: unique(staleSignals
      .filter((signal) => fieldMatchesAny(signal.fields, legalPatterns))
      .map((signal) => note(signal.source, signal.fields, signal.freshnessStatus, signal.limitation))),
    staleWeather: unique(staleSignals
      .filter((signal) => fieldMatchesAny(signal.fields, weatherPatterns))
      .map((signal) => note(signal.source, signal.fields, signal.freshnessStatus, signal.limitation))),
    staleClosureFireWeather: unique(staleSignals
      .filter((signal) => fieldMatchesAny(signal.fields, closureFireWeatherPatterns))
      .map((signal) => note(signal.source, signal.fields, signal.freshnessStatus, signal.limitation))),
    stale: unique(staleSignals.map((signal) => note(signal.source, signal.fields, signal.freshnessStatus, signal.limitation))),
    missing: unique(missingSignals.map((signal) => note(signal.source, signal.fields, signal.freshnessStatus, signal.limitation))),
  };
}

function unknownLegalNotes(recommendationSet: CampRecommendationSet): string[] {
  return Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap((enrichment) => {
    if (!enrichment) return [];
    if (enrichment.legalStatus === 'unknown' || enrichment.legalConfidence === 'unknown') {
      return [`${enrichment.candidateId}: legal status or legal confidence is unknown.`];
    }
    return [];
  });
}

function resourceDebtStatusLabel(status: string): string {
  return status === 'safe' ? 'adequate' : status;
}

function resourceDebtSummaries(recommendationSet: CampRecommendationSet): string[] {
  return Object.entries(recommendationSet.enrichmentsByCandidateId ?? {}).flatMap(([candidateId, enrichment]) => {
    const debt = enrichment?.resourceDebt;
    if (!debt) return [];
    return [
      `${candidateId} fuel debt: ${resourceDebtStatusLabel(debt.fuel.status)} - ${debt.fuel.reason}`,
      `${candidateId} water debt: ${resourceDebtStatusLabel(debt.water.status)} - ${debt.water.reason}`,
      `${candidateId} daylight debt: ${resourceDebtStatusLabel(debt.daylight.status)} - ${debt.daylight.reason}`,
      `${candidateId} camp uncertainty debt: ${resourceDebtStatusLabel(debt.campUncertainty.status)} - ${debt.campUncertainty.reason}`,
    ];
  });
}

function decisionPointSummary(recommendationSet: CampRecommendationSet): string | null {
  const decisionPoint = recommendationSet.decisionPoint;
  if (!decisionPoint) return null;
  const deadline = decisionPoint.decisionDeadlineIso ? ` by ${decisionPoint.decisionDeadlineIso}` : '';
  const turnoff = decisionPoint.latestRecommendedTurnoff?.label
    ? ` Latest turnoff: ${decisionPoint.latestRecommendedTurnoff.label}.`
    : '';
  return `${decisionPoint.kind}${deadline}: ${decisionPoint.recommendedAction} Continue risk: ${decisionPoint.riskIfContinues}.${turnoff}`;
}

function vehicleSummaryForAi(
  profile: CampSearchContext['vehicleProfile'],
): CampOpsAiAssistVehicleSummary | null {
  if (!profile) return null;
  return {
    vehicleType: profile.vehicleType,
    widthInches: profile.widthInches,
    wheelbaseInches: profile.wheelbaseInches,
    clearanceInches: profile.clearanceInches,
    trailerAttached: profile.trailerAttached,
    rooftopTent: profile.rooftopTent,
    confidence: profile.confidence,
  };
}

function resourceVehicleSummaryForAi(
  vehicle: NonNullable<CampSearchContext['convoyProfile']>['lowestFuelReserveVehicle'],
): CampOpsAiAssistResourceVehicleSummary | null {
  if (!vehicle) return null;
  return {
    fuelReserveMiles: vehicle.fuelReserveMiles,
    fuelPercent: vehicle.fuelPercent,
    waterGallons: vehicle.waterGallons,
    waterPercent: vehicle.waterPercent,
    confidence: vehicle.confidence,
  };
}

function convoySummaryForAi(
  profile: CampSearchContext['convoyProfile'],
): CampOpsAiAssistConvoySummary | null {
  if (!profile) return null;
  return {
    vehicleCount: profile.vehicleCount,
    peopleCount: profile.peopleCount,
    petCount: profile.petCount,
    kidCount: profile.kidCount,
    kidsPresent: profile.kidsPresent,
    trailerCount: profile.trailerCount,
    trailerPresent: profile.trailerPresent,
    delayedMemberCount: profile.delayedMemberCount,
    mechanicalIssueFlag: profile.mechanicalIssueFlag,
    preferredRiskTolerance: profile.preferredRiskTolerance,
    source: profile.source,
    confidence: profile.confidence,
    leastCapableVehicleProfile: vehicleSummaryForAi(profile.leastCapableVehicleProfile),
    lowestFuelReserveVehicle: resourceVehicleSummaryForAi(profile.lowestFuelReserveVehicle),
    lowestWaterReserveVehicle: resourceVehicleSummaryForAi(profile.lowestWaterReserveVehicle),
  };
}

export function buildCampOpsAiAssistPayload({
  context,
  recommendationSet,
  mode = 'planning',
  rolloutConfig = null,
}: CampOpsAiAssistPromptInput): CampOpsAiAssistPayload {
  const resolutionNotes = sourceResolutionNotes(recommendationSet);
  const signalNotes = sourceSignalNotes(recommendationSet);
  const criticalMissing = missingDataFields(recommendationSet);
  const contextSummary: CampOpsAiAssistPayload['contextSummary'] = {
    id: context.id,
    routeId: context.routeId,
    tripId: context.tripId,
    plannedCampId: context.plannedCampId,
    currentTimeIso: context.currentTimeIso,
    desiredArrivalWindow: context.desiredArrivalWindow,
    daylightInfo: context.daylightInfo,
    riskTolerance: context.riskTolerance,
    offlineMode: context.offlineMode,
    delayEstimateMinutes: context.delayEstimateMinutes,
    vehicleProfile: vehicleSummaryForAi(context.vehicleProfile),
    convoyProfile: convoySummaryForAi(context.convoyProfile),
    resourceState: context.resourceState,
    routeProgress: context.routeProgress,
  };
  const resourceDebtByCandidateId: CampOpsAiAssistPayload['resourceDebtByCandidateId'] = {};
  for (const [candidateId, enrichment] of Object.entries(recommendationSet.enrichmentsByCandidateId ?? {})) {
    resourceDebtByCandidateId[candidateId] = enrichment?.resourceDebt;
  }

  const payload: CampOpsAiAssistPayload = {
    source: 'campops_recommendation_set',
    mode,
    contextSummary,
    recommendedCamp: candidateBrief(recommendationSet.recommendedCamp, recommendationSet),
    backupCamp: candidateBrief(recommendationSet.backupCamp, recommendationSet),
    emergencyCamp: candidateBrief(recommendationSet.emergencyCamp, recommendationSet),
    rejectedCandidates: recommendationSet.rejectedCandidates.map((item) => ({
      campId: item.candidate.id,
      name: item.candidate.name,
      reasons: item.reasons,
      gates: item.gates,
    })),
    hardGateWarnings: hardGateWarnings(recommendationSet),
    suitabilityScores: recommendationSet.scoresByCandidateId ?? {},
    resourceDebtByCandidateId,
    tradeoffs: recommendationSet.explanations?.keyTradeoffs ?? [],
    assumptions: recommendationSet.assumptions,
    missingData: criticalMissing,
    sourceConfidence: {
      level: recommendationSet.confidenceSummary.level,
      score: recommendationSet.confidenceSummary.score,
      reasons: recommendationSet.confidenceSummary.reasons,
      resolvedSourceConfidence: resolutionNotes.resolvedConfidence,
    },
    staleSourceSummaries: unique([
      ...staleSourceNotes(recommendationSet),
      ...signalNotes.stale,
      ...resolutionNotes.stale,
    ]),
    sourceConflictSummaries: resolutionNotes.conflicts,
    missingCriticalSourceData: unique([
      ...criticalMissing,
      ...signalNotes.missing,
      ...resolutionNotes.missing,
      ...unknownLegalNotes(recommendationSet),
    ]),
    resourceDebtSummary: resourceDebtSummaries(recommendationSet),
    confidenceSummary: recommendationSet.confidenceSummary,
    plannedCampDowngradeReason: recommendationSet.explanations?.plannedCampDowngrade ?? null,
    decisionPoint: recommendationSet.decisionPoint ?? null,
    decisionPointSummary: decisionPointSummary(recommendationSet),
  };
  if (isCampOpsAiAssistAvailable({ rolloutConfig })) {
    emitCampOpsAiSummaryGenerated(context, recommendationSet, mode);
  }
  return payload;
}

export function buildCampOpsAiAssistPrompt(input: CampOpsAiAssistPromptInput): string {
  const payload = buildCampOpsAiAssistPayload(input);
  const modeInstruction =
    payload.mode === 'field'
      ? 'Field mode: keep the headline, primary summary, risks, and actions short, conservative, and directly usable.'
      : 'Planning mode: explain the tradeoffs, assumptions, confidence, and missing data enough for route planning.';
  return [
    'You are the CampOps AI narrator inside ECS.',
    'CampOps deterministic outputs are the source of truth. Explain them; do not choose camps independently.',
    modeInstruction,
    'Rules:',
    ...AI_RULES.map((rule) => `- ${rule}`),
    'Return only valid JSON matching this schema:',
    JSON.stringify(CAMP_OPS_AI_ASSIST_OUTPUT_SCHEMA),
    'CampOps source-of-truth payload:',
    JSON.stringify(payload),
  ].join('\n');
}

function parseUnknownJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function status(value: unknown): CampOpsAiAssistRecommendationStatus {
  if (
    value === 'recommended' ||
    value === 'caution' ||
    value === 'not_recommended' ||
    value === 'unknown'
  ) {
    return value;
  }
  return 'unknown';
}

function fallbackOutput(recommendationSet: CampRecommendationSet): CampOpsAiAssistOutput {
  const recommended = recommendationSet.recommendedCamp;
  const backup = recommendationSet.backupCamp;
  const emergency = recommendationSet.emergencyCamp;
  const resolutionNotes = sourceResolutionNotes(recommendationSet);
  const signalNotes = sourceSignalNotes(recommendationSet);
  const staleWarnings = unique([
    ...staleSourceNotes(recommendationSet),
    ...signalNotes.stale,
    ...resolutionNotes.stale,
  ]);
  const missingWarnings = unique([
    ...missingDataFields(recommendationSet),
    ...signalNotes.missing,
    ...resolutionNotes.missing,
    ...unknownLegalNotes(recommendationSet),
  ]);
  const conflictWarnings = resolutionNotes.conflicts;
  const confidenceNotes = [
    recommendationSet.confidenceSummary.reasons.join(' '),
    ...staleWarnings.slice(0, 3),
    ...conflictWarnings.slice(0, 2),
  ].filter(Boolean);
  return {
    headline: recommended ? `${recommended.name} is the CampOps recommendation` : 'No CampOps camp recommendation',
    primaryRecommendation: {
      campId: recommended?.id ?? null,
      status: recommended ? 'recommended' : 'unknown',
      summary: recommended
        ? `${recommended.name} is recommended by deterministic CampOps scoring.`
        : 'CampOps did not select a primary camp from the available candidates.',
    },
    why: recommendationSet.explanations?.whyRecommended ? [recommendationSet.explanations.whyRecommended] : [],
    tradeoffs: recommendationSet.explanations?.keyTradeoffs ?? [],
    risks: recommendationSet.warnings,
    requiredActions: recommendationSet.confidenceSummary.missingDataFields.length > 0
      ? [`Verify ${recommendationSet.confidenceSummary.missingDataFields[0]}.`]
      : ['Review CampOps confidence and current field conditions before committing.'],
    backupPlan: backup ? `Use ${backup.name} as backup if the primary option changes.` : null,
    emergencyPlan: emergency ? `Use ${emergency.name} as the emergency endpoint if continuing increases risk.` : null,
    confidenceNote: confidenceNotes.join(' ') || 'CampOps confidence is unknown.',
    sourceConfidenceNote: recommendationSet.confidenceSummary.reasons.join(' ') || `${recommendationSet.confidenceSummary.level} CampOps confidence.`,
    staleDataWarnings: staleWarnings,
    missingDataWarnings: missingWarnings,
    conflictWarnings,
    decisionPointSummary: decisionPointSummary(recommendationSet),
    convoyMessage: null,
  };
}

function normalizeOutput(value: unknown, fallback: CampOpsAiAssistOutput): { output: CampOpsAiAssistOutput; issues: string[] } {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!record) {
    return { output: fallback, issues: ['AI output was not a JSON object.'] };
  }
  const primary = record.primaryRecommendation && typeof record.primaryRecommendation === 'object'
    ? record.primaryRecommendation as Record<string, unknown>
    : {};
  const output: CampOpsAiAssistOutput = {
    headline: text(record.headline) ?? fallback.headline,
    primaryRecommendation: {
      campId: text(primary.campId),
      status: status(primary.status),
      summary: text(primary.summary) ?? fallback.primaryRecommendation.summary,
    },
    why: textArray(record.why),
    tradeoffs: textArray(record.tradeoffs),
    risks: textArray(record.risks),
    requiredActions: textArray(record.requiredActions),
    backupPlan: text(record.backupPlan),
    emergencyPlan: text(record.emergencyPlan),
    confidenceNote: text(record.confidenceNote) ?? fallback.confidenceNote,
    sourceConfidenceNote: text(record.sourceConfidenceNote) ?? fallback.sourceConfidenceNote,
    staleDataWarnings: textArray(record.staleDataWarnings),
    missingDataWarnings: textArray(record.missingDataWarnings),
    conflictWarnings: textArray(record.conflictWarnings),
    decisionPointSummary: text(record.decisionPointSummary) ?? fallback.decisionPointSummary,
    convoyMessage: text(record.convoyMessage),
  };
  const issues = [
    output.why.length === 0 ? 'why must include at least one item.' : '',
    output.requiredActions.length === 0 ? 'requiredActions must include at least one item.' : '',
  ].filter(Boolean);
  if (output.why.length === 0) output.why = fallback.why.length ? fallback.why : ['CampOps output is the source of truth.'];
  if (output.requiredActions.length === 0) output.requiredActions = fallback.requiredActions;
  if (output.staleDataWarnings.length === 0) output.staleDataWarnings = fallback.staleDataWarnings;
  if (output.missingDataWarnings.length === 0) output.missingDataWarnings = fallback.missingDataWarnings;
  if (output.conflictWarnings.length === 0) output.conflictWarnings = fallback.conflictWarnings;
  return { output, issues };
}

function sanitizeOverconfidentText(value: string | null): { value: string | null; changed: boolean } {
  if (!value) return { value, changed: false };
  let changed = false;
  const replaced = value
    .replace(/definitely legal/gi, () => {
      changed = true;
      return 'legal confidence must be verified';
    })
    .replace(/guaranteed open/gi, () => {
      changed = true;
      return 'access must be verified';
    })
    .replace(/definitely open/gi, () => {
      changed = true;
      return 'access must be verified';
    })
    .replace(/always accessible/gi, () => {
      changed = true;
      return 'access must be verified';
    })
    .replace(/guaranteed\s+accessible/gi, () => {
      changed = true;
      return 'access must be verified';
    })
    .replace(/you can definitely camp here/gi, () => {
      changed = true;
      return 'camp eligibility must be verified';
    })
    .replace(/definitely camp here/gi, () => {
      changed = true;
      return 'camp eligibility must be verified';
    })
    .replace(/\bno risk\b/gi, () => {
      changed = true;
      return 'risk remains unresolved';
    })
    .replace(/\bsafe\b/gi, () => {
      changed = true;
      return 'recommended';
    });
  return { value: replaced, changed };
}

function mapCampOpsAiAssistOutputText(
  output: CampOpsAiAssistOutput,
  mapper: (value: string | null) => string | null,
): CampOpsAiAssistOutput {
  const mapArray = (values: string[]) => values.map((value) => mapper(value) ?? value);
  return {
    ...output,
    headline: mapper(output.headline) ?? output.headline,
    primaryRecommendation: {
      ...output.primaryRecommendation,
      summary: mapper(output.primaryRecommendation.summary) ?? output.primaryRecommendation.summary,
    },
    why: mapArray(output.why),
    tradeoffs: mapArray(output.tradeoffs),
    risks: mapArray(output.risks),
    requiredActions: mapArray(output.requiredActions),
    backupPlan: mapper(output.backupPlan),
    emergencyPlan: mapper(output.emergencyPlan),
    confidenceNote: mapper(output.confidenceNote) ?? output.confidenceNote,
    sourceConfidenceNote: mapper(output.sourceConfidenceNote) ?? output.sourceConfidenceNote,
    staleDataWarnings: mapArray(output.staleDataWarnings),
    missingDataWarnings: mapArray(output.missingDataWarnings),
    conflictWarnings: mapArray(output.conflictWarnings),
    decisionPointSummary: mapper(output.decisionPointSummary),
    convoyMessage: mapper(output.convoyMessage),
  };
}

function sanitizeOverconfidentOutput(output: CampOpsAiAssistOutput): { output: CampOpsAiAssistOutput; issues: string[] } {
  const issues: string[] = [];
  const sanitizeString = (value: string | null) => {
    const sanitized = sanitizeOverconfidentText(value);
    if (sanitized.changed) issues.push('AI output used overconfident wording; wording was softened.');
    return sanitized.value;
  };
  const sanitizeArray = (values: string[]) => values.map((value) => sanitizeString(value) ?? value);
  return {
    output: {
      ...output,
      headline: sanitizeString(output.headline) ?? output.headline,
      primaryRecommendation: {
        ...output.primaryRecommendation,
        summary: sanitizeString(output.primaryRecommendation.summary) ?? output.primaryRecommendation.summary,
      },
      why: sanitizeArray(output.why),
      tradeoffs: sanitizeArray(output.tradeoffs),
      risks: sanitizeArray(output.risks),
      requiredActions: sanitizeArray(output.requiredActions),
      backupPlan: sanitizeString(output.backupPlan),
      emergencyPlan: sanitizeString(output.emergencyPlan),
      confidenceNote: sanitizeString(output.confidenceNote) ?? output.confidenceNote,
      sourceConfidenceNote: sanitizeString(output.sourceConfidenceNote) ?? output.sourceConfidenceNote,
      staleDataWarnings: sanitizeArray(output.staleDataWarnings),
      missingDataWarnings: sanitizeArray(output.missingDataWarnings),
      conflictWarnings: sanitizeArray(output.conflictWarnings),
      decisionPointSummary: sanitizeString(output.decisionPointSummary),
      convoyMessage: sanitizeString(output.convoyMessage),
    },
    issues: Array.from(new Set(issues)),
  };
}

function sanitizeUnknownLegalAllowedText(
  output: CampOpsAiAssistOutput,
  recommendationSet: CampRecommendationSet,
): { output: CampOpsAiAssistOutput; issues: string[] } {
  const notes = unknownLegalNotes(recommendationSet);
  if (notes.length === 0) return { output, issues: [] };
  const issues: string[] = [];
  const sanitizeString = (value: string | null) => {
    if (!value) return value;
    const changed = /legal[^.]{0,80}\ballowed\b|\ballowed\b[^.]{0,80}legal/i.test(value);
    if (!changed) return value;
    issues.push('AI treated unknown legal status as allowed; wording was corrected.');
    return value.replace(/legal[^.]{0,80}\ballowed\b|\ballowed\b[^.]{0,80}legal/gi, 'legal status is unknown');
  };
  const sanitizeArray = (values: string[]) => values.map((value) => sanitizeString(value) ?? value);
  return {
    output: {
      ...output,
      headline: sanitizeString(output.headline) ?? output.headline,
      primaryRecommendation: {
        ...output.primaryRecommendation,
        summary: sanitizeString(output.primaryRecommendation.summary) ?? output.primaryRecommendation.summary,
      },
      why: sanitizeArray(output.why),
      tradeoffs: sanitizeArray(output.tradeoffs),
      risks: sanitizeArray(output.risks),
      requiredActions: sanitizeArray(output.requiredActions),
      backupPlan: sanitizeString(output.backupPlan),
      emergencyPlan: sanitizeString(output.emergencyPlan),
      confidenceNote: sanitizeString(output.confidenceNote) ?? output.confidenceNote,
      sourceConfidenceNote: sanitizeString(output.sourceConfidenceNote) ?? output.sourceConfidenceNote,
      staleDataWarnings: sanitizeArray(output.staleDataWarnings),
      missingDataWarnings: unique([...sanitizeArray(output.missingDataWarnings), ...notes]),
      conflictWarnings: sanitizeArray(output.conflictWarnings),
      decisionPointSummary: sanitizeString(output.decisionPointSummary),
      convoyMessage: sanitizeString(output.convoyMessage),
    },
    issues: unique(issues),
  };
}

function sanitizeLegalConfidenceOverstatement(
  output: CampOpsAiAssistOutput,
  recommendationSet: CampRecommendationSet,
): { output: CampOpsAiAssistOutput; issues: string[] } {
  const warnings = legalConfidenceWarnings(recommendationSet);
  if (warnings.length === 0) return { output, issues: [] };
  const issues: string[] = [];
  const mapped = mapCampOpsAiAssistOutputText(output, (value) => {
    if (!value) return value;
    const changed = /high legal confidence|legal confidence is high|legally clear/i.test(value);
    if (!changed) return value;
    issues.push('AI overstated legal confidence; wording was corrected.');
    return value
      .replace(/high legal confidence/gi, 'limited legal confidence')
      .replace(/legal confidence is high/gi, 'legal confidence is limited')
      .replace(/legally clear/gi, 'legal status requires verification');
  });
  return {
    output: {
      ...mapped,
      missingDataWarnings: unique([...mapped.missingDataWarnings, ...warnings]),
    },
    issues: unique(issues),
  };
}

function serviceStatusUnknown(enrichment: CampCandidateEnrichment | undefined | null): boolean {
  const services = [
    enrichment?.nearestFuel,
    enrichment?.nearestWater,
    enrichment?.nearestPropane,
    enrichment?.nearestDump,
    enrichment?.nearestRepair,
    enrichment?.nearestTownOrExit,
  ].filter(Boolean);
  return services.length === 0 || services.some((service) => service?.status == null || service.status === 'unknown');
}

function hasUncertainClosureOrAccess(enrichments: CampCandidateEnrichment[]): boolean {
  return enrichments.some((enrichment) => {
    const closureUnknown = !enrichment.closureStatus || enrichment.closureStatus === 'unknown';
    const accessUnknown = !enrichment.publicAccessStatus || enrichment.publicAccessStatus === 'unknown';
    const staleClosureOrAccess = (enrichment.sourceSignals ?? []).some((signal) =>
      (signal.isStale || signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired') &&
      signal.fields.some((field) => /closure|access|publicAccess/i.test(field)),
    );
    const conflictingClosureOrAccess = (enrichment.sourceResolutions ?? []).some((resolution) =>
      resolution.conflictDetected && /closure|access|publicAccess/i.test(resolution.field),
    );
    return closureUnknown || accessUnknown || staleClosureOrAccess || conflictingClosureOrAccess;
  });
}

function hasLimitedOperationalConfidence(enrichments: CampCandidateEnrichment[]): boolean {
  return enrichments.some((enrichment) =>
    enrichment.legalConfidence !== 'high' ||
    enrichment.dataConfidence !== 'high' ||
    (enrichment.sourceResolutions ?? []).some((resolution) => resolution.conflictDetected),
  );
}

function sanitizeUnsupportedOperationalClaims(
  output: CampOpsAiAssistOutput,
  recommendationSet: CampRecommendationSet,
): { output: CampOpsAiAssistOutput; issues: string[] } {
  const issues: string[] = [];
  const recommendedId = recommendationSet.recommendedCamp?.id ?? null;
  const recommendedEnrichment = recommendedId ? recommendationSet.enrichmentsByCandidateId?.[recommendedId] : null;
  const allEnrichments = Object.values(recommendationSet.enrichmentsByCandidateId ?? {}).filter(
    (item): item is CampCandidateEnrichment => Boolean(item),
  );
  const campfireProhibited = allEnrichments.some((enrichment) => enrichment.campfireAllowed === 'no');
  const campfireUnknown = allEnrichments.some((enrichment) =>
    enrichment.fireRestrictionStatus === 'unknown' &&
    (enrichment.campfireAllowed == null || enrichment.campfireAllowed === 'unknown'),
  );
  const trailerTurnaroundUnknown =
    recommendedEnrichment?.trailerTurnaroundConfidence === 'unknown' ||
    recommendedEnrichment?.turnaroundSuitability === 'unknown';
  const servicesUnknown = serviceStatusUnknown(recommendedEnrichment);
  const noFuelService = allEnrichments.every((enrichment) => !enrichment.nearestFuel);
  const noWaterService = allEnrichments.every((enrichment) => !enrichment.nearestWater);
  const closureOrAccessUncertain = hasUncertainClosureOrAccess(allEnrichments);
  const limitedOperationalConfidence = hasLimitedOperationalConfidence(allEnrichments);
  const emergencyId = recommendationSet.emergencyCamp?.id ?? null;

  const mapped = mapCampOpsAiAssistOutputText(output, (value) => {
    if (!value) return value;
    let next = value;
    if (
      closureOrAccessUncertain &&
      /\b(?:confirmed\s+open|open\s+and\s+accessible|closure\s+(?:status\s+)?(?:is\s+)?open|access\s+(?:is\s+)?open)\b/i.test(next)
    ) {
      issues.push('AI described uncertain closure/access data as open; wording was corrected.');
      next = next
        .replace(/\bconfirmed\s+open\b/gi, 'closure/access status is unresolved')
        .replace(/\bopen\s+and\s+accessible\b/gi, 'closure/access status is unresolved')
        .replace(/\bclosure\s+(?:status\s+)?(?:is\s+)?open\b/gi, 'closure status is unresolved')
        .replace(/\baccess\s+(?:is\s+)?open\b/gi, 'access status is unresolved');
    }
    if (
      limitedOperationalConfidence &&
      /\bconfirmed\b(?=[^.]{0,80}\b(?:legal|access|open|available|service|fuel|water|turnaround|road width)\b)/i.test(next)
    ) {
      issues.push('AI used confirmed wording without sufficient CampOps confidence; wording was corrected.');
      next = next.replace(/\bconfirmed\b(?=[^.]{0,80}\b(?:legal|access|open|available|service|fuel|water|turnaround|road width)\b)/gi, 'not confirmed');
    }
    if (campfireProhibited && /campfires?\s+(?:are\s+)?(?:not recommended|discouraged|should be avoided)/i.test(next)) {
      issues.push('AI softened prohibited campfire status; wording was corrected.');
      next = next.replace(/campfires?\s+(?:are\s+)?(?:not recommended|discouraged|should be avoided)/gi, 'Campfires are prohibited');
    }
    if (campfireUnknown && /campfires?\s+(?:are\s+)?(?:allowed|permitted|fine|okay)/i.test(next)) {
      issues.push('AI invented campfire permission; wording was corrected.');
      next = next.replace(/campfires?\s+(?:are\s+)?(?:allowed|permitted|fine|okay)/gi, 'Campfire status is unknown');
    }
    if (servicesUnknown && /\b(?:open now|24\/7|operating hours are known|service hours are known|known operating hours)\b/i.test(next)) {
      issues.push('AI invented service operating status; wording was corrected.');
      next = next.replace(/\b(?:open now|24\/7|operating hours are known|service hours are known|known operating hours)\b/gi, 'operating status is unknown');
    }
    if (noFuelService && /\bfuel\s+(?:is\s+)?(?:available|open|confirmed|nearby)\b/i.test(next)) {
      issues.push('AI invented fuel service availability; wording was corrected.');
      next = next.replace(/\bfuel\s+(?:is\s+)?(?:available|open|confirmed|nearby)\b/gi, 'fuel service status is unknown');
    }
    if (noWaterService && /\bwater\s+(?:refill\s+)?(?:is\s+)?(?:available|open|confirmed|nearby)\b/i.test(next)) {
      issues.push('AI invented water service availability; wording was corrected.');
      next = next.replace(/\bwater\s+(?:refill\s+)?(?:is\s+)?(?:available|open|confirmed|nearby)\b/gi, 'water refill status is unknown');
    }
    if (trailerTurnaroundUnknown && /(?:turnaround|trailer turnaround)\s+(?:is\s+)?(?:confirmed|guaranteed|easy|known|adequate)/i.test(next)) {
      issues.push('AI invented trailer turnaround confidence; wording was corrected.');
      next = next.replace(/(?:turnaround|trailer turnaround)\s+(?:is\s+)?(?:confirmed|guaranteed|easy|known|adequate)/gi, 'trailer turnaround confidence is unknown');
    }
    if (emergencyId && output.primaryRecommendation.campId === emergencyId && /comfortable primary recommendation/i.test(next)) {
      issues.push('AI described an emergency fallback as a comfortable primary recommendation; wording was corrected.');
      next = next.replace(/comfortable primary recommendation/gi, 'emergency fallback');
    }
    return next;
  });
  return { output: mapped, issues: unique(issues) };
}

function enforceSourceTransparency(
  output: CampOpsAiAssistOutput,
  recommendationSet: CampRecommendationSet,
): { output: CampOpsAiAssistOutput; issues: string[] } {
  const resolutionNotes = sourceResolutionNotes(recommendationSet);
  const signalNotes = sourceSignalNotes(recommendationSet);
  const hardGateReasons = hardGateWarnings(recommendationSet).map((gate) => gate.reason);
  const staleWarnings = unique([
    ...staleSourceNotes(recommendationSet),
    ...signalNotes.stale,
    ...resolutionNotes.stale,
  ]);
  const missingWarnings = unique([
    ...missingDataFields(recommendationSet),
    ...signalNotes.missing,
    ...resolutionNotes.missing,
    ...unknownLegalNotes(recommendationSet),
  ]);
  const conflictWarnings = resolutionNotes.conflicts;
  const decisionSummary = decisionPointSummary(recommendationSet);
  const issues: string[] = [];

  const requiredRisks = unique([...hardGateReasons, ...staleWarnings, ...conflictWarnings]);
  const risks = unique([...output.risks, ...requiredRisks]);
  if (requiredRisks.some((risk) => !output.risks.includes(risk))) {
    issues.push('CampOps hard-gate or source warnings were restored to AI risks.');
  }

  if (signalNotes.staleClosureFireWeather.length > 0) {
    const combined = JSON.stringify(output);
    if (/\bcurrent\b/i.test(combined)) {
      issues.push('AI output referenced current data while stale closure/fire/weather data exists.');
    }
  }
  const staleAwareOutput = signalNotes.staleClosureFireWeather.length > 0
    ? mapCampOpsAiAssistOutputText(output, (value) => {
        if (!value) return value;
        return value.replace(/\bcurrent\b/gi, 'stale or unresolved');
      })
    : output;

  return {
    output: {
      ...staleAwareOutput,
      risks: unique([...staleAwareOutput.risks, ...requiredRisks]),
      sourceConfidenceNote: staleAwareOutput.sourceConfidenceNote || recommendationSet.confidenceSummary.reasons.join(' ') || `${recommendationSet.confidenceSummary.level} CampOps confidence.`,
      staleDataWarnings: unique([...staleAwareOutput.staleDataWarnings, ...staleWarnings]),
      missingDataWarnings: unique([...staleAwareOutput.missingDataWarnings, ...missingWarnings]),
      conflictWarnings: unique([...staleAwareOutput.conflictWarnings, ...conflictWarnings]),
      decisionPointSummary: staleAwareOutput.decisionPointSummary ?? decisionSummary,
      requiredActions: decisionSummary
        ? unique([...staleAwareOutput.requiredActions, 'Review the CampOps decision point before continuing.'])
        : staleAwareOutput.requiredActions,
    },
    issues: unique(issues),
  };
}

function enforceCampOpsTruth(
  output: CampOpsAiAssistOutput,
  recommendationSet: CampRecommendationSet,
): { output: CampOpsAiAssistOutput; issues: string[] } {
  const issues: string[] = [];
  const rejected = rejectedIds(recommendationSet);
  const recommendedId = recommendationSet.recommendedCamp?.id ?? null;
  const campId = output.primaryRecommendation.campId;

  if (campId && rejected.has(campId)) {
    issues.push('AI attempted to recommend a rejected camp; primary recommendation was downgraded.');
    return {
      output: {
        ...output,
        primaryRecommendation: {
          campId,
          status: 'not_recommended',
          summary: 'This camp is rejected by CampOps hard gates and cannot be recommended.',
        },
        risks: unique([
          ...output.risks,
          'A rejected CampOps candidate cannot be resurrected by AI.',
        ]),
      },
      issues,
    };
  }

  if (campId && recommendedId && campId !== recommendedId && output.primaryRecommendation.status === 'recommended') {
    issues.push('AI selected a different primary camp than CampOps; status was downgraded to caution.');
    return {
      output: {
        ...output,
        primaryRecommendation: {
          ...output.primaryRecommendation,
          status: 'caution',
        },
      },
      issues,
    };
  }

  if (!recommendedId && output.primaryRecommendation.status === 'recommended') {
    issues.push('AI recommended a primary camp when CampOps has no primary recommendation; status was downgraded.');
    return {
      output: {
        ...output,
        primaryRecommendation: {
          ...output.primaryRecommendation,
          status: 'unknown',
        },
      },
      issues,
    };
  }

  return { output, issues };
}

export function parseCampOpsAiAssistOutput(
  value: unknown,
  input: CampOpsAiAssistPromptInput,
): CampOpsAiAssistParseResult {
  const fallback = fallbackOutput(input.recommendationSet);
  const { output, issues } = normalizeOutput(parseUnknownJson(value), fallback);
  const sanitized = sanitizeOverconfidentOutput(output);
  const legalConfidenceSanitized = sanitizeLegalConfidenceOverstatement(sanitized.output, input.recommendationSet);
  const legalSanitized = sanitizeUnknownLegalAllowedText(legalConfidenceSanitized.output, input.recommendationSet);
  const operationalSanitized = sanitizeUnsupportedOperationalClaims(legalSanitized.output, input.recommendationSet);
  const sourceEnforced = enforceSourceTransparency(operationalSanitized.output, input.recommendationSet);
  const enforced = enforceCampOpsTruth(sourceEnforced.output, input.recommendationSet);
  const finalSanitized = sanitizeOverconfidentOutput(enforced.output);
  return {
    output: finalSanitized.output,
    valid: [
      ...issues,
      ...sanitized.issues,
      ...legalConfidenceSanitized.issues,
      ...legalSanitized.issues,
      ...operationalSanitized.issues,
      ...sourceEnforced.issues,
      ...enforced.issues,
      ...finalSanitized.issues,
    ].length === 0,
    issues: [
      ...issues,
      ...sanitized.issues,
      ...legalConfidenceSanitized.issues,
      ...legalSanitized.issues,
      ...operationalSanitized.issues,
      ...sourceEnforced.issues,
      ...enforced.issues,
      ...finalSanitized.issues,
    ],
  };
}
