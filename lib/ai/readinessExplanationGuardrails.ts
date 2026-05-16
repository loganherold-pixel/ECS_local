import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessConfidence,
  ExpeditionReadinessFactorImpact,
  ExpeditionReadinessIssue,
  ExpeditionReadinessSourceFreshness,
  ExpeditionReadinessSourceKind,
  ExpeditionReadinessStatus,
} from '../readiness/expeditionReadinessTypes';
import { getTopReadinessConcerns } from '../readiness/expeditionReadinessScoring';

export type ECSReadinessEvidenceFactor = {
  id: string;
  label: string;
  categoryId: ExpeditionReadinessCategoryId;
  categoryLabel: string;
  impact: ExpeditionReadinessFactorImpact;
  detail: string;
  source: ExpeditionReadinessSourceKind;
  confidence: ExpeditionReadinessConfidence;
  isStale: boolean;
  isInferred: boolean;
};

export type ECSReadinessExplanationPayload = {
  assessmentId: string;
  status: ExpeditionReadinessStatus;
  score: number;
  topFactors: ECSReadinessEvidenceFactor[];
  blockers: ExpeditionReadinessIssue[];
  warnings: ExpeditionReadinessIssue[];
  missingInputs: string[];
  sourceFreshness: ExpeditionReadinessSourceFreshness;
  allowedClaims: string[];
  prohibitedClaims: string[];
  limitedConfidence: boolean;
  isECSInferred: boolean;
  generatedAt: string;
  groundedSummary: string;
  recommendedActions: string[];
  referencedCategories: ExpeditionReadinessCategoryId[];
};

export type ECSReadinessExplanationValidationIssueCode =
  | 'ai_summary_safe_while_not_ready'
  | 'ai_summary_legal_campsite_claim'
  | 'ai_summary_references_missing_source'
  | 'ai_summary_offline_complete_contradiction'
  | 'ai_summary_vehicle_fit_without_vehicle'
  | 'ai_summary_status_contradiction';

export type ECSReadinessExplanationValidationIssue = {
  code: ECSReadinessExplanationValidationIssueCode;
  severity: 'warning' | 'error';
  message: string;
  detail?: string | null;
};

type FreshnessKey = keyof ExpeditionReadinessSourceFreshness;

const SOURCE_REFERENCE_RULES: Array<{
  key: FreshnessKey;
  label: string;
  pattern: RegExp;
}> = [
  { key: 'route', label: 'route', pattern: /\b(route|trail|geometry|difficulty|closure|passability)\b/i },
  { key: 'weather', label: 'weather', pattern: /\b(weather|forecast|storm|wind|precipitation|temperature)\b/i },
  { key: 'fleet', label: 'fleet', pattern: /\b(vehicle|fleet|clearance|tire|drivetrain|payload|wheelbase)\b/i },
  { key: 'offline', label: 'offline', pattern: /\b(offline|downloaded|cached|route package|map package)\b/i },
  { key: 'camp', label: 'camp', pattern: /\b(camp|campsite|dispersed|legal access|camp legality)\b/i },
  { key: 'power', label: 'power', pattern: /\b(power|battery|runtime|solar|watts|state of charge)\b/i },
  { key: 'fuel', label: 'fuel', pattern: /\b(fuel|range|reserve)\b/i },
  { key: 'recovery', label: 'recovery', pattern: /\b(recovery|bailout|turnaround|paved road|trailhead)\b/i },
  { key: 'communications', label: 'communications', pattern: /\b(signal|communications|comms|satellite|check-in|cellular)\b/i },
  { key: 'daylight', label: 'daylight', pattern: /\b(daylight|sunset|arrival window|after dark)\b/i },
  { key: 'telemetry', label: 'telemetry', pattern: /\b(telemetry|obd|sensor|vehicle battery|engine health)\b/i },
  { key: 'currentLocation', label: 'location', pattern: /\b(current location|coordinates|gps|position)\b/i },
];

const LIMITED_LANGUAGE_PATTERN = /\b(no|not|missing|unavailable|unknown|limited|confidence is limited|refresh|confirm|obtain|review|select|add)\b/i;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function toAssessmentId(assessment: ExpeditionReadinessAssessment): string {
  return [
    'readiness',
    assessment.updatedAt,
    assessment.status,
    assessment.overallScore,
  ].join(':');
}

function collectMissingInputs(assessment: ExpeditionReadinessAssessment): string[] {
  const categoryMissing = assessment.categories.flatMap((category) => category.missingInputs);
  const missingSources = Object.values(assessment.sourceFreshness)
    .filter((record) => record.isMissing)
    .map((record) => record.label);
  return uniqueStrings([...categoryMissing, ...missingSources]);
}

function collectTopFactors(assessment: ExpeditionReadinessAssessment): ECSReadinessEvidenceFactor[] {
  const concernCategories = getTopReadinessConcerns(assessment, 4);
  const concernFactors = concernCategories.flatMap((category) =>
    category.factors
      .filter((factor) => factor.impact === 'blocker' || factor.impact === 'warning' || factor.impact === 'missing')
      .slice(0, 2)
      .map((factor) => ({
        id: factor.id,
        label: factor.label,
        categoryId: category.id,
        categoryLabel: category.label,
        impact: factor.impact,
        detail: factor.detail,
        source: factor.source,
        confidence: factor.confidence,
        isStale: factor.isStale === true,
        isInferred: factor.isInferred === true || factor.source === 'inferred',
      })),
  );

  if (concernFactors.length > 0) {
    return concernFactors.slice(0, 6);
  }

  return assessment.categories.slice(0, 4).flatMap((category) =>
    category.factors.slice(0, 1).map((factor) => ({
      id: factor.id,
      label: factor.label,
      categoryId: category.id,
      categoryLabel: category.label,
      impact: factor.impact,
      detail: factor.detail,
      source: factor.source,
      confidence: factor.confidence,
      isStale: factor.isStale === true,
      isInferred: factor.isInferred === true || factor.source === 'inferred',
    })),
  );
}

function buildAllowedClaims(assessment: ExpeditionReadinessAssessment, missingInputs: string[]): string[] {
  const availableCategories = assessment.categories.map((category) => `${category.label}: ${category.status}`);
  const confidenceQualifier = missingInputs.length > 0 || assessment.confidence !== 'high'
    ? 'Confidence is limited where inputs are missing, stale, inferred, demo, or manually supplied.'
    : 'Available readiness inputs support high confidence.';

  return [
    `Deterministic Expedition Readiness status is ${assessment.status}.`,
    `Deterministic Expedition Readiness score is ${assessment.overallScore}/100.`,
    confidenceQualifier,
    'ECS Intelligence may summarize blockers, warnings, factors, missing inputs, freshness, and recommendations from the assessment.',
    'Camp wording must use Camp Legality Confidence or Legal Access Confidence, not guaranteed legality.',
    ...availableCategories,
  ];
}

function buildProhibitedClaims(assessment: ExpeditionReadinessAssessment): string[] {
  const prohibited = [
    'Do not claim a campsite is legal or officially approved unless an official confirmation source is present.',
    'Do not claim the trip is safe as an absolute guarantee.',
    'Do not invent trail status, official closure data, weather, vehicle specs, route difficulty, or emergency contact data.',
    'Do not replace or override the deterministic readiness score or status.',
    'Do not present missing, stale, mock, demo, manual, or ECS-inferred data as live truth.',
  ];

  if (assessment.sourceFreshness.offline.isMissing) {
    prohibited.push('Do not say the offline route package is complete.');
  }
  if (assessment.sourceFreshness.fleet.isMissing) {
    prohibited.push('Do not say vehicle fit is strong or confirmed.');
  }
  if (assessment.sourceFreshness.weather.isMissing || assessment.sourceFreshness.weather.isStale) {
    prohibited.push('Do not cite current weather as confirmed.');
  }
  return prohibited;
}

function buildGroundedSummary(
  assessment: ExpeditionReadinessAssessment,
  topFactors: ECSReadinessEvidenceFactor[],
  missingInputs: string[],
): string {
  const concern =
    assessment.blockers[0]?.detail
    ?? assessment.warnings[0]?.detail
    ?? topFactors[0]?.detail
    ?? assessment.explanation;
  const categoryLabels = uniqueStrings(topFactors.slice(0, 3).map((factor) => factor.categoryLabel));
  const groundedIn = categoryLabels.length > 0 ? ` Grounded in ${categoryLabels.join(', ')}.` : '';
  const limited = assessment.confidence !== 'high' || missingInputs.length > 0 || assessment.dataIntegrity.usesInferredData
    ? ' Confidence is limited where inputs are missing or ECS-inferred.'
    : '';

  if (assessment.status === 'hold') {
    return `Hold. ECS Intelligence is grounded in deterministic readiness data: ${concern}${groundedIn}${limited}`;
  }
  if (assessment.status === 'caution') {
    return `Caution. ECS Intelligence recommends review before departure: ${concern}${groundedIn}${limited}`;
  }
  return `Ready. ECS Intelligence sees no hard blockers in the deterministic assessment.${groundedIn}${limited}`;
}

export function buildReadinessExplanationPayload(
  assessment: ExpeditionReadinessAssessment,
): ECSReadinessExplanationPayload {
  const missingInputs = collectMissingInputs(assessment);
  const topFactors = collectTopFactors(assessment);
  const referencedCategories = uniqueStrings(topFactors.map((factor) => factor.categoryId)) as ExpeditionReadinessCategoryId[];
  const isECSInferred = assessment.dataIntegrity.usesInferredData
    || Object.values(assessment.sourceFreshness).some((record) => record.isInferred)
    || topFactors.some((factor) => factor.isInferred);

  return {
    assessmentId: toAssessmentId(assessment),
    status: assessment.status,
    score: assessment.overallScore,
    topFactors,
    blockers: assessment.blockers,
    warnings: assessment.warnings,
    missingInputs,
    sourceFreshness: assessment.sourceFreshness,
    allowedClaims: buildAllowedClaims(assessment, missingInputs),
    prohibitedClaims: buildProhibitedClaims(assessment),
    limitedConfidence: assessment.confidence !== 'high' || missingInputs.length > 0,
    isECSInferred,
    generatedAt: new Date().toISOString(),
    groundedSummary: buildGroundedSummary(assessment, topFactors, missingInputs),
    recommendedActions: assessment.recommendations.slice(0, 6),
    referencedCategories,
  };
}

function pushIssue(
  issues: ECSReadinessExplanationValidationIssue[],
  issue: ECSReadinessExplanationValidationIssue,
): void {
  if (!issues.some((existing) => existing.code === issue.code && existing.detail === issue.detail)) {
    issues.push(issue);
  }
}

function hasPositiveReadyClaim(text: string): boolean {
  if (/\b(not ready|not cleared|not go|do not start|recommended review before departure)\b/i.test(text)) {
    return false;
  }
  return /\b(ready to depart|ready to go|good to go|go for departure|no review needed|cleared to start)\b/i.test(text);
}

function hasSafeClaim(text: string): boolean {
  if (/\b(not safe|safety is not guaranteed|not guaranteed safe|never says safe)\b/i.test(text)) {
    return false;
  }
  return /\b(safe|safe to|safely)\b/i.test(text);
}

function hasLegalCampsiteClaim(text: string): boolean {
  return /\b(legal campsite|campsite is legal|site is legal|legally camp|legal to camp|officially legal camp)\b/i.test(text);
}

function hasOfflineCompleteClaim(text: string): boolean {
  return /\b(offline|route package|map package|cache|cached|downloaded)\b.{0,40}\b(complete|ready|downloaded|available|fully cached)\b/i.test(text);
}

function hasStrongVehicleFitClaim(text: string): boolean {
  return /\b(vehicle fit|active vehicle|fleet profile)\b.{0,40}\b(strong|ready|confirmed|excellent|cleared)\b/i.test(text);
}

function hasStatusContradiction(payload: ECSReadinessExplanationPayload, text: string): boolean {
  if (payload.status === 'hold') {
    return hasPositiveReadyClaim(text) || /\b(no blockers|no concerns)\b/i.test(text);
  }
  if (payload.status === 'caution') {
    return /\b(ready to depart|good to go|cleared to start|no review needed)\b/i.test(text);
  }
  return /\b(hold|do not depart|blocked)\b/i.test(text);
}

export function validateReadinessExplanationOutput(
  payload: ECSReadinessExplanationPayload,
  outputText: string | null | undefined,
): ECSReadinessExplanationValidationIssue[] {
  const text = String(outputText ?? '').trim();
  const issues: ECSReadinessExplanationValidationIssue[] = [];

  if (!text) {
    return issues;
  }

  if (payload.status !== 'ready' && hasSafeClaim(text)) {
    pushIssue(issues, {
      code: 'ai_summary_safe_while_not_ready',
      severity: 'error',
      message: 'ECS Intelligence summary uses safe language while readiness is not Ready.',
    });
  }

  if (hasLegalCampsiteClaim(text)) {
    pushIssue(issues, {
      code: 'ai_summary_legal_campsite_claim',
      severity: 'error',
      message: 'ECS Intelligence summary claims campsite legality instead of confidence.',
    });
  }

  if (hasOfflineCompleteClaim(text)) {
    const offlineCategory = payload.topFactors.find((factor) => factor.categoryId === 'offline_preparedness');
    const offlineIncomplete = payload.sourceFreshness.offline.isMissing
      || payload.sourceFreshness.offline.isStale
      || payload.missingInputs.some((input) => /\b(offline|route package|map tiles|route geometry|cache|cached|download)\b/i.test(input))
      || payload.blockers.some((issue) => issue.categoryId === 'offline_preparedness')
      || payload.warnings.some((issue) => issue.categoryId === 'offline_preparedness')
      || offlineCategory?.impact === 'missing'
      || offlineCategory?.impact === 'warning'
      || offlineCategory?.impact === 'blocker';
    if (offlineIncomplete) {
      pushIssue(issues, {
        code: 'ai_summary_offline_complete_contradiction',
        severity: 'error',
        message: 'ECS Intelligence summary says the offline package is complete while offline readiness is missing or incomplete.',
      });
    }
  }

  if (hasStrongVehicleFitClaim(text) && payload.sourceFreshness.fleet.isMissing) {
    pushIssue(issues, {
      code: 'ai_summary_vehicle_fit_without_vehicle',
      severity: 'error',
      message: 'ECS Intelligence summary claims strong vehicle fit without an active vehicle profile.',
    });
  }

  if (hasStatusContradiction(payload, text)) {
    pushIssue(issues, {
      code: 'ai_summary_status_contradiction',
      severity: 'error',
      message: 'ECS Intelligence summary contradicts the deterministic readiness status.',
      detail: payload.status,
    });
  }

  for (const rule of SOURCE_REFERENCE_RULES) {
    const record = payload.sourceFreshness[rule.key];
    if (!record?.isMissing) continue;
    if (!rule.pattern.test(text)) continue;
    if (LIMITED_LANGUAGE_PATTERN.test(text)) continue;
    pushIssue(issues, {
      code: 'ai_summary_references_missing_source',
      severity: 'warning',
      message: 'ECS Intelligence summary references a data source that is not present.',
      detail: rule.label,
    });
  }

  return issues;
}
