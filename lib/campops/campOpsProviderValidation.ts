import type { CampCandidate, CampOpsConfidence, CampSearchContext } from './campOpsTypes';
import {
  collectCampOpsSourceProviderBundle,
  type CampOpsExternalSourceSignal,
  type CampOpsSourceCategory,
  type CampOpsSourceFreshness,
  type CampOpsSourceProvider,
  type CampOpsSourceProviderConfig,
  type CampOpsSourceProviderResult,
} from './campOpsSourceAdapters';
import {
  resolveCampOpsRecommendationRolloutConfig,
  type CampOpsRecommendationRolloutConfig,
} from './campOpsRecommendationConfig';

export type CampOpsProviderValidationMode = 'disabled' | 'shadow';
export type CampOpsProviderValidationCoverageBand = 'none' | 'low' | 'medium' | 'high' | 'unknown';
export type CampOpsProviderValidationFreshnessBand = 'fresh' | 'mixed' | 'stale' | 'expired' | 'unknown';
export type CampOpsProviderReadinessStatus = 'configured' | 'missing' | 'disabled';
export type CampOpsProviderReadinessDecision = 'ready' | 'watch' | 'not_ready' | 'disabled';

export type CampOpsProviderValidationExpectedShape = Partial<Record<CampOpsSourceCategory, Array<keyof CampOpsExternalSourceSignal>>>;

export type CampOpsProviderCategoryValidationSummary = {
  sourceCategory: CampOpsSourceCategory;
  providerCount: number;
  resultCount: number;
  signalCount: number;
  coveredCandidateCount: number;
  expectedFieldCount: number;
  missingShapeCount: number;
  missingDataCount: number;
  conflictCount: number;
  availabilityRate: number;
  unknownRate: number;
  staleRate: number;
  coverageBand: CampOpsProviderValidationCoverageBand;
  freshnessBand: CampOpsProviderValidationFreshnessBand;
  confidenceDistribution: Record<CampOpsConfidence, number>;
  warnings: string[];
};

export type CampOpsProviderReadinessReport = {
  providerId: string;
  providerDisplayName: string;
  regionLabel: string;
  sourceCategory: CampOpsSourceCategory;
  coverageBand: CampOpsProviderValidationCoverageBand;
  freshnessBand: CampOpsProviderValidationFreshnessBand;
  confidenceDistribution: Record<CampOpsConfidence, number>;
  conflictCount: number;
  missingDataCount: number;
  recommendationImpactSummary: string;
  warnings: string[];
  errors: string[];
};

export type CampOpsProviderValidationSummary = {
  enabled: boolean;
  mode: CampOpsProviderValidationMode;
  shadowMode: boolean;
  productionImpactAllowed: boolean;
  providerOutputAppliedToRecommendations: false;
  regionLabel: string;
  candidateCount: number;
  providerCount: number;
  providerResultCount: number;
  overallCoverageBand: CampOpsProviderValidationCoverageBand;
  overallFreshnessBand: CampOpsProviderValidationFreshnessBand;
  conflictFrequency: number;
  unknownRate: number;
  staleRate: number;
  missingDataRate: number;
  legalAccessSourceAvailability: CampOpsProviderCategoryValidationSummary;
  closureSourceAvailability: CampOpsProviderCategoryValidationSummary;
  fireRestrictionSourceAvailability: CampOpsProviderCategoryValidationSummary;
  weatherSourceFreshness: CampOpsProviderCategoryValidationSummary;
  serviceResupplyCoverage: CampOpsProviderCategoryValidationSummary;
  categorySummaries: CampOpsProviderCategoryValidationSummary[];
  providerReports: CampOpsProviderReadinessReport[];
  recommendationImpactSummary: string;
  warnings: string[];
  errors: string[];
};

export type CampOpsProviderValidationInput = {
  mode?: CampOpsProviderValidationMode;
  regionLabel: string;
  context: CampSearchContext;
  candidates: CampCandidate[];
  providers?: CampOpsSourceProvider[] | null;
  providerConfig?: Partial<CampOpsSourceProviderConfig> | null;
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  expectedCategories?: CampOpsSourceCategory[] | null;
  expectedShape?: CampOpsProviderValidationExpectedShape | null;
};

export type CampOpsProviderReadinessReportRow = {
  providerCategory: CampOpsSourceCategory;
  providerStatus: CampOpsProviderReadinessStatus;
  coverageBand: CampOpsProviderValidationCoverageBand;
  freshnessBand: CampOpsProviderValidationFreshnessBand;
  staleSourceCount: number;
  conflictCount: number;
  unknownSignalCount: number;
  missingDataCount: number;
  sourceConfidenceDistribution: Record<CampOpsConfidence, number>;
  userFacingRecommendationImpact: string;
};

export type CampOpsDeveloperProviderReadinessReport = {
  reportKind: 'campops_provider_readiness';
  generatedAtIso: string;
  regionLabel: string;
  releaseCohortLabel: string | null;
  validationEnabled: boolean;
  readinessDecision: CampOpsProviderReadinessDecision;
  candidateCount: number;
  providerCount: number;
  providerResultCount: number;
  overallCoverageBand: CampOpsProviderValidationCoverageBand;
  overallFreshnessBand: CampOpsProviderValidationFreshnessBand;
  conflictFrequency: number;
  unknownRate: number;
  staleRate: number;
  missingDataRate: number;
  rows: CampOpsProviderReadinessReportRow[];
  providerReports: CampOpsProviderReadinessReport[];
  warnings: string[];
  errors: string[];
  privacyNote: string;
};

export type CampOpsProviderReadinessReportOptions = {
  generatedAtIso?: string | null;
  releaseCohortLabel?: string | null;
};

const DEFAULT_EXPECTED_CATEGORIES: CampOpsSourceCategory[] = [
  'legal',
  'access',
  'closure',
  'fire',
  'weather',
  'service',
];

const DEFAULT_EXPECTED_SHAPE: CampOpsProviderValidationExpectedShape = {
  legal: ['legalStatus', 'legalConfidence', 'publicAccessStatus'],
  access: ['publicAccessStatus', 'accessDifficulty', 'vehicleFit', 'trailerSuitability'],
  closure: ['closureStatus'],
  fire: ['fireRestrictionStatus', 'campfireAllowed', 'stoveAllowed', 'redFlagRisk'],
  weather: ['weatherExposureLevel', 'weatherExposure', 'stormRisk', 'heatRisk', 'coldRisk'],
  service: ['nearestFuel', 'nearestWater', 'nearestPropane', 'nearestDump', 'nearestRepair', 'nearestTownOrExit'],
  freshness: ['freshnessStatus', 'sourceGeneratedAt', 'retrievedAt', 'cachedAt'],
};

const EMPTY_CONFIDENCE_DISTRIBUTION: Record<CampOpsConfidence, number> = {
  high: 0,
  medium: 0,
  low: 0,
  unknown: 0,
};

function confidenceDistribution(results: CampOpsSourceProviderResult[]): Record<CampOpsConfidence, number> {
  return results.reduce<Record<CampOpsConfidence, number>>((counts, result) => {
    counts[result.sourceConfidence] += 1;
    return counts;
  }, { ...EMPTY_CONFIDENCE_DISTRIBUTION });
}

function roundRate(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function coverageBand(rate: number, denominator: number): CampOpsProviderValidationCoverageBand {
  if (denominator === 0) return 'unknown';
  if (rate <= 0) return 'none';
  if (rate < 0.5) return 'low';
  if (rate < 0.8) return 'medium';
  return 'high';
}

function freshnessBand(results: CampOpsSourceProviderResult[]): CampOpsProviderValidationFreshnessBand {
  if (results.length === 0) return 'unknown';
  const staleCount = results.filter((result) => result.sourceFreshness === 'stale').length;
  const expiredCount = results.filter((result) => result.sourceFreshness === 'expired').length;
  const freshCount = results.filter((result) => result.sourceFreshness === 'fresh').length;
  if (expiredCount / results.length >= 0.5) return 'expired';
  if ((staleCount + expiredCount) === results.length) return 'stale';
  if (freshCount / results.length >= 0.8) return 'fresh';
  if (staleCount > 0 || expiredCount > 0 || freshCount > 0) return 'mixed';
  return 'unknown';
}

function isUnknownValue(value: unknown): boolean {
  return value == null || value === 'unknown';
}

function signalFieldValue(signal: CampOpsExternalSourceSignal | null, field: keyof CampOpsExternalSourceSignal): unknown {
  return signal ? signal[field] : null;
}

function expectedFieldsFor(
  category: CampOpsSourceCategory,
  expectedShape: CampOpsProviderValidationExpectedShape,
): Array<keyof CampOpsExternalSourceSignal> {
  return expectedShape[category] ?? [];
}

function resultHasExpectedShape(
  result: CampOpsSourceProviderResult,
  expectedFields: Array<keyof CampOpsExternalSourceSignal>,
): boolean {
  if (expectedFields.length === 0) return Boolean(result.signal);
  if (!result.signal) return false;
  return expectedFields.some((field) => !isUnknownValue(signalFieldValue(result.signal, field)));
}

function sourceResolutionCategory(field: string): CampOpsSourceCategory {
  if (field === 'legalStatus' || field === 'publicAccessStatus') return 'legal';
  if (field === 'closureStatus') return 'closure';
  if (field === 'fireRestrictionStatus' || field === 'campfireAllowed' || field === 'stoveAllowed' || field === 'redFlagRisk') return 'fire';
  if (
    field === 'weatherExposure' ||
    field === 'weatherExposureLevel' ||
    field === 'stormRisk' ||
    field === 'heatRisk' ||
    field === 'coldRisk' ||
    field === 'smokeOrAirQualityRisk'
  ) return 'weather';
  if (field.startsWith('nearest')) return 'service';
  return 'unknown';
}

function recommendationImpactSummaryForCategory(summary: CampOpsProviderCategoryValidationSummary): string {
  if (summary.resultCount === 0) return 'No provider output observed; recommendations would rely on existing inferred or unknown data.';
  const concerns: string[] = [];
  if (summary.conflictCount > 0) concerns.push(`${summary.conflictCount} conflict(s)`);
  if (summary.missingDataCount > 0) concerns.push(`${summary.missingDataCount} missing-data result(s)`);
  if (summary.staleRate > 0) concerns.push(`${Math.round(summary.staleRate * 100)}% stale or expired`);
  if (summary.unknownRate > 0) concerns.push(`${Math.round(summary.unknownRate * 100)}% unknown expected fields`);
  if (concerns.length === 0) {
    return 'Provider output is shape-valid for shadow validation and would not change recommendations in validation mode.';
  }
  return `Provider output has ${concerns.join(', ')}; validation mode records this without changing recommendations.`;
}

function sanitizeReportText(value: string | null | undefined): string {
  if (!value) return 'Unspecified region';
  return value
    .replace(/-?\d{1,3}\.\d{3,}/g, '[redacted-coordinate]')
    .replace(/\b(user|vehicle|token|secret|password|api[_-]?key):?\s*[\w.-]+/gi, '$1:[redacted]');
}

function buildCategorySummary({
  category,
  providers,
  results,
  candidateCount,
  expectedFields,
  conflictCount,
}: {
  category: CampOpsSourceCategory;
  providers: CampOpsSourceProvider[];
  results: CampOpsSourceProviderResult[];
  candidateCount: number;
  expectedFields: Array<keyof CampOpsExternalSourceSignal>;
  conflictCount: number;
}): CampOpsProviderCategoryValidationSummary {
  const signalResults = results.filter((result) => result.signal);
  const coveredCandidateCount = new Set(signalResults.map((result) => result.candidateId).filter(Boolean)).size;
  const missingShapeCount = results.filter((result) => !resultHasExpectedShape(result, expectedFields)).length;
  const missingDataCount = results.filter((result) => result.missingDataReason || !result.signal || result.sourceFreshness === 'missing').length + missingShapeCount;
  const staleCount = results.filter((result) => result.sourceFreshness === 'stale' || result.sourceFreshness === 'expired').length;
  const expectedValueCount = results.length * Math.max(expectedFields.length, 1);
  const unknownValueCount = expectedFields.length === 0
    ? results.filter((result) => !result.signal).length
    : results.reduce((count, result) => {
        return count + expectedFields.filter((field) => isUnknownValue(signalFieldValue(result.signal, field))).length;
      }, 0);
  const availabilityRate = candidateCount === 0 ? 0 : coveredCandidateCount / candidateCount;
  const summary: CampOpsProviderCategoryValidationSummary = {
    sourceCategory: category,
    providerCount: providers.length,
    resultCount: results.length,
    signalCount: signalResults.length,
    coveredCandidateCount,
    expectedFieldCount: expectedFields.length,
    missingShapeCount,
    missingDataCount,
    conflictCount,
    availabilityRate: roundRate(availabilityRate),
    unknownRate: roundRate(expectedValueCount === 0 ? 0 : unknownValueCount / expectedValueCount),
    staleRate: roundRate(results.length === 0 ? 0 : staleCount / results.length),
    coverageBand: coverageBand(availabilityRate, candidateCount),
    freshnessBand: freshnessBand(results),
    confidenceDistribution: confidenceDistribution(results),
    warnings: [],
  };
  if (missingShapeCount > 0) {
    summary.warnings.push(`${missingShapeCount} ${category} provider result(s) did not include expected normalized signal fields.`);
  }
  if (conflictCount > 0) {
    summary.warnings.push(`${conflictCount} ${category} source conflict(s) detected.`);
  }
  if (summary.staleRate > 0) {
    summary.warnings.push(`${category} source data includes stale or expired results.`);
  }
  return summary;
}

function buildProviderReports({
  providers,
  results,
  regionLabel,
  candidateCount,
  conflictsByCategory,
}: {
  providers: CampOpsSourceProvider[];
  results: CampOpsSourceProviderResult[];
  regionLabel: string;
  candidateCount: number;
  conflictsByCategory: Partial<Record<CampOpsSourceCategory, number>>;
}): CampOpsProviderReadinessReport[] {
  return providers.map((provider) => {
    const providerResults = results.filter((result) => result.providerId === provider.id);
    const coveredCandidateCount = new Set(
      providerResults
        .filter((result) => result.signal)
        .map((result) => result.candidateId)
        .filter(Boolean),
    ).size;
    const availabilityRate = candidateCount === 0 ? 0 : coveredCandidateCount / candidateCount;
    const missingDataCount = providerResults.filter((result) => result.missingDataReason || !result.signal || result.sourceFreshness === 'missing').length;
    const report: CampOpsProviderReadinessReport = {
      providerId: provider.id,
      providerDisplayName: provider.displayName,
      regionLabel,
      sourceCategory: provider.sourceCategory,
      coverageBand: coverageBand(availabilityRate, candidateCount),
      freshnessBand: freshnessBand(providerResults),
      confidenceDistribution: confidenceDistribution(providerResults),
      conflictCount: conflictsByCategory[provider.sourceCategory] ?? 0,
      missingDataCount,
      recommendationImpactSummary: providerResults.length === 0
        ? 'Provider did not return results in shadow validation.'
        : 'Provider output was observed in shadow mode and was not applied to production recommendations.',
      warnings: Array.from(new Set(providerResults.flatMap((result) => result.warnings))),
      errors: Array.from(new Set(providerResults.flatMap((result) => result.errors))),
    };
    if (missingDataCount > 0) {
      report.warnings.push(`${missingDataCount} result(s) missing normalized source data.`);
    }
    return report;
  });
}

function disabledSummary(input: CampOpsProviderValidationInput, reason: string): CampOpsProviderValidationSummary {
  const expectedCategories = input.expectedCategories?.length ? input.expectedCategories : DEFAULT_EXPECTED_CATEGORIES;
  const emptyCategory = (category: CampOpsSourceCategory): CampOpsProviderCategoryValidationSummary => ({
    sourceCategory: category,
    providerCount: 0,
    resultCount: 0,
    signalCount: 0,
    coveredCandidateCount: 0,
    expectedFieldCount: expectedFieldsFor(category, { ...DEFAULT_EXPECTED_SHAPE, ...(input.expectedShape ?? {}) }).length,
    missingShapeCount: 0,
    missingDataCount: 0,
    conflictCount: 0,
    availabilityRate: 0,
    unknownRate: 0,
    staleRate: 0,
    coverageBand: 'unknown',
    freshnessBand: 'unknown',
    confidenceDistribution: { ...EMPTY_CONFIDENCE_DISTRIBUTION },
    warnings: [reason],
  });
  const categorySummaries = expectedCategories.map(emptyCategory);
  const byCategory = Object.fromEntries(categorySummaries.map((summary) => [summary.sourceCategory, summary])) as Record<string, CampOpsProviderCategoryValidationSummary>;
  return {
    enabled: false,
    mode: input.mode ?? 'disabled',
    shadowMode: false,
    productionImpactAllowed: false,
    providerOutputAppliedToRecommendations: false,
    regionLabel: input.regionLabel,
    candidateCount: input.candidates.length,
    providerCount: input.providers?.length ?? 0,
    providerResultCount: 0,
    overallCoverageBand: 'unknown',
    overallFreshnessBand: 'unknown',
    conflictFrequency: 0,
    unknownRate: 0,
    staleRate: 0,
    missingDataRate: 0,
    legalAccessSourceAvailability: byCategory.legal ?? emptyCategory('legal'),
    closureSourceAvailability: byCategory.closure ?? emptyCategory('closure'),
    fireRestrictionSourceAvailability: byCategory.fire ?? emptyCategory('fire'),
    weatherSourceFreshness: byCategory.weather ?? emptyCategory('weather'),
    serviceResupplyCoverage: byCategory.service ?? emptyCategory('service'),
    categorySummaries,
    providerReports: [],
    recommendationImpactSummary: 'Provider validation did not run and did not affect recommendations.',
    warnings: [reason],
    errors: [],
  };
}

export async function runCampOpsProviderValidation(
  input: CampOpsProviderValidationInput,
): Promise<CampOpsProviderValidationSummary> {
  const rollout = resolveCampOpsRecommendationRolloutConfig(input.rolloutConfig ?? {});
  const mode = input.mode ?? 'disabled';
  if (mode !== 'shadow') {
    return disabledSummary(input, 'CampOps provider validation mode is disabled.');
  }
  if (!rollout.campopsProviderValidationShadowModeEnabled) {
    return disabledSummary(input, 'CampOps provider validation shadow mode flag is disabled.');
  }

  const providers = input.providers ?? [];
  const expectedCategories = input.expectedCategories?.length ? input.expectedCategories : DEFAULT_EXPECTED_CATEGORIES;
  const expectedShape = { ...DEFAULT_EXPECTED_SHAPE, ...(input.expectedShape ?? {}) };
  const bundle = await collectCampOpsSourceProviderBundle({
    providers,
    context: input.context,
    candidates: input.candidates,
    config: {
      providersEnabled: true,
      ...(input.providerConfig ?? {}),
    },
  });
  const resolutions = Object.values(bundle.resolutionsByCandidateId).flat();
  const conflictsByCategory = resolutions.reduce<Partial<Record<CampOpsSourceCategory, number>>>((counts, resolution) => {
    if (!resolution.conflictDetected) return counts;
    const category = sourceResolutionCategory(resolution.field);
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});

  const categorySummaries = expectedCategories.map((category) => {
    const categoryProviders = providers.filter((provider) => provider.sourceCategory === category);
    const categoryResults = bundle.providerResults.filter((result) => result.sourceCategory === category);
    return buildCategorySummary({
      category,
      providers: categoryProviders,
      results: categoryResults,
      candidateCount: input.candidates.length,
      expectedFields: expectedFieldsFor(category, expectedShape),
      conflictCount: conflictsByCategory[category] ?? 0,
    });
  });
  const providerReports = buildProviderReports({
    providers,
    results: bundle.providerResults,
    regionLabel: input.regionLabel,
    candidateCount: input.candidates.length,
    conflictsByCategory,
  });
  const resultCount = bundle.providerResults.length;
  const coveredCandidateIds = new Set(
    bundle.providerResults
      .filter((result) => result.signal)
      .map((result) => result.candidateId)
      .filter(Boolean),
  );
  const overallAvailabilityRate = input.candidates.length === 0 ? 0 : coveredCandidateIds.size / input.candidates.length;
  const staleCount = bundle.providerResults.filter((result) => result.sourceFreshness === 'stale' || result.sourceFreshness === 'expired').length;
  const missingCount = bundle.providerResults.filter((result) => result.missingDataReason || !result.signal || result.sourceFreshness === 'missing').length;
  const unknownNumerator = categorySummaries.reduce((sum, summary) => sum + summary.unknownRate * Math.max(summary.resultCount, 1), 0);
  const unknownDenominator = categorySummaries.reduce((sum, summary) => sum + Math.max(summary.resultCount, 1), 0);
  const conflictCount = Object.values(conflictsByCategory).reduce((sum, count) => sum + (count ?? 0), 0);
  const productionImpactAllowed = rollout.campopsRecommendationsEnabled && rollout.campopsProviderAdaptersEnabled;
  const warnings = Array.from(new Set([
    ...bundle.warnings,
    ...categorySummaries.flatMap((summary) => summary.warnings),
    ...(providers.length === 0 ? ['No CampOps source providers configured for validation.'] : []),
  ]));

  return {
    enabled: true,
    mode: 'shadow',
    shadowMode: true,
    productionImpactAllowed,
    providerOutputAppliedToRecommendations: false,
    regionLabel: input.regionLabel,
    candidateCount: input.candidates.length,
    providerCount: providers.length,
    providerResultCount: resultCount,
    overallCoverageBand: coverageBand(overallAvailabilityRate, input.candidates.length),
    overallFreshnessBand: freshnessBand(bundle.providerResults),
    conflictFrequency: roundRate(resultCount === 0 ? 0 : conflictCount / resultCount),
    unknownRate: roundRate(unknownDenominator === 0 ? 0 : unknownNumerator / unknownDenominator),
    staleRate: roundRate(resultCount === 0 ? 0 : staleCount / resultCount),
    missingDataRate: roundRate(resultCount === 0 ? 0 : missingCount / resultCount),
    legalAccessSourceAvailability: categorySummaries.find((summary) => summary.sourceCategory === 'legal') ?? categorySummaries[0],
    closureSourceAvailability: categorySummaries.find((summary) => summary.sourceCategory === 'closure') ?? categorySummaries[0],
    fireRestrictionSourceAvailability: categorySummaries.find((summary) => summary.sourceCategory === 'fire') ?? categorySummaries[0],
    weatherSourceFreshness: categorySummaries.find((summary) => summary.sourceCategory === 'weather') ?? categorySummaries[0],
    serviceResupplyCoverage: categorySummaries.find((summary) => summary.sourceCategory === 'service') ?? categorySummaries[0],
    categorySummaries,
    providerReports,
    recommendationImpactSummary: 'Provider validation ran in shadow mode; normalized outputs were summarized but not applied to recommendations.',
    warnings,
    errors: bundle.errors,
  };
}

function readinessStatusFor(summary: CampOpsProviderCategoryValidationSummary, validationEnabled: boolean): CampOpsProviderReadinessStatus {
  if (!validationEnabled) return 'disabled';
  if (summary.providerCount === 0) return 'missing';
  return 'configured';
}

function unknownSignalCount(summary: CampOpsProviderCategoryValidationSummary): number {
  return Math.round(summary.unknownRate * summary.resultCount * Math.max(summary.expectedFieldCount, 1));
}

function staleSourceCount(summary: CampOpsProviderCategoryValidationSummary): number {
  return Math.round(summary.staleRate * summary.resultCount);
}

function readinessDecisionFor(summary: CampOpsProviderValidationSummary): CampOpsProviderReadinessDecision {
  if (!summary.enabled) return 'disabled';
  if (
    summary.categorySummaries.some((category) => category.providerCount === 0) ||
    summary.overallCoverageBand === 'none' ||
    summary.overallCoverageBand === 'low' ||
    summary.overallFreshnessBand === 'stale' ||
    summary.overallFreshnessBand === 'expired' ||
    summary.conflictFrequency >= 0.2 ||
    summary.missingDataRate >= 0.4
  ) return 'not_ready';
  if (
    summary.overallCoverageBand === 'medium' ||
    summary.overallFreshnessBand === 'mixed' ||
    summary.unknownRate >= 0.25 ||
    summary.staleRate > 0 ||
    summary.conflictFrequency > 0 ||
    summary.missingDataRate > 0
  ) return 'watch';
  return 'ready';
}

export function createCampOpsProviderReadinessReport(
  summary: CampOpsProviderValidationSummary,
  options: CampOpsProviderReadinessReportOptions = {},
): CampOpsDeveloperProviderReadinessReport {
  const rows = summary.categorySummaries.map<CampOpsProviderReadinessReportRow>((categorySummary) => ({
    providerCategory: categorySummary.sourceCategory,
    providerStatus: readinessStatusFor(categorySummary, summary.enabled),
    coverageBand: categorySummary.coverageBand,
    freshnessBand: categorySummary.freshnessBand,
    staleSourceCount: staleSourceCount(categorySummary),
    conflictCount: categorySummary.conflictCount,
    unknownSignalCount: unknownSignalCount(categorySummary),
    missingDataCount: categorySummary.missingDataCount,
    sourceConfidenceDistribution: categorySummary.confidenceDistribution,
    userFacingRecommendationImpact: recommendationImpactSummaryForCategory(categorySummary),
  }));

  return {
    reportKind: 'campops_provider_readiness',
    generatedAtIso: options.generatedAtIso ?? new Date().toISOString(),
    regionLabel: sanitizeReportText(summary.regionLabel),
    releaseCohortLabel: options.releaseCohortLabel ? sanitizeReportText(options.releaseCohortLabel) : null,
    validationEnabled: summary.enabled,
    readinessDecision: readinessDecisionFor(summary),
    candidateCount: summary.candidateCount,
    providerCount: summary.providerCount,
    providerResultCount: summary.providerResultCount,
    overallCoverageBand: summary.overallCoverageBand,
    overallFreshnessBand: summary.overallFreshnessBand,
    conflictFrequency: summary.conflictFrequency,
    unknownRate: summary.unknownRate,
    staleRate: summary.staleRate,
    missingDataRate: summary.missingDataRate,
    rows,
    providerReports: summary.providerReports.map((providerReport) => ({
      ...providerReport,
      regionLabel: sanitizeReportText(providerReport.regionLabel),
      warnings: providerReport.warnings.map(sanitizeReportText),
      errors: providerReport.errors.map(sanitizeReportText),
    })),
    warnings: summary.warnings.map(sanitizeReportText),
    errors: summary.errors.map(sanitizeReportText),
    privacyNote: 'Developer report omits precise coordinates, raw user ids, vehicle ids, private debriefs, and raw AI prompts.',
  };
}

function confidenceText(distribution: Record<CampOpsConfidence, number>): string {
  return `high ${distribution.high}, medium ${distribution.medium}, low ${distribution.low}, unknown ${distribution.unknown}`;
}

export function renderCampOpsProviderReadinessMarkdown(
  report: CampOpsDeveloperProviderReadinessReport,
): string {
  const cohort = report.releaseCohortLabel ? `\nRelease cohort: ${report.releaseCohortLabel}` : '';
  const rows = report.rows.map((row) => (
    `| ${row.providerCategory} | ${row.providerStatus} | ${row.coverageBand} | ${row.freshnessBand} | ${row.staleSourceCount} | ${row.conflictCount} | ${row.unknownSignalCount} | ${row.missingDataCount} | ${confidenceText(row.sourceConfidenceDistribution)} | ${row.userFacingRecommendationImpact} |`
  ));
  const warnings = report.warnings.length
    ? `\n\n## Warnings\n${report.warnings.map((warning) => `- ${warning}`).join('\n')}`
    : '';
  const errors = report.errors.length
    ? `\n\n## Errors\n${report.errors.map((error) => `- ${error}`).join('\n')}`
    : '';
  return [
    '# CampOps Provider Readiness Report',
    '',
    `Generated: ${report.generatedAtIso}`,
    `Region: ${report.regionLabel}${cohort}`,
    `Readiness: ${report.readinessDecision}`,
    '',
    `Coverage: ${report.overallCoverageBand}`,
    `Freshness: ${report.overallFreshnessBand}`,
    `Conflict frequency: ${report.conflictFrequency}`,
    `Unknown rate: ${report.unknownRate}`,
    `Stale rate: ${report.staleRate}`,
    `Missing-data rate: ${report.missingDataRate}`,
    '',
    '| Category | Status | Coverage | Freshness | Stale Sources | Conflicts | Unknown Signals | Missing Data | Confidence Distribution | User-Facing Impact |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...rows,
    warnings,
    errors,
    '',
    `Privacy: ${report.privacyNote}`,
  ].filter((line) => line !== '').join('\n');
}

export function renderCampOpsProviderReadinessJson(
  report: CampOpsDeveloperProviderReadinessReport,
): string {
  return JSON.stringify(report, null, 2);
}
