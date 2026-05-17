import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import {
  EXPEDITION_READINESS_CATEGORY_IDS,
  type ExpeditionReadinessAssessment,
} from '../readiness/expeditionReadinessTypes';
import { selectOrchestratorTargetView } from './orchestratorSelectors';
import { ECS_RELEASE_READINESS_SCENARIOS } from './releaseScenarioMatrix';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import { buildMasterReleaseChecklist } from './masterReleaseChecklist';
import { buildReleaseRiskSummary } from './releaseRiskSummary';
import type { ECSReleaseQaSummary } from './releasePolishAuditTypes';
import {
  classifyDispersedCampingRegion,
  type DispersedCampingClassificationInput,
} from '../map/dispersedCampingEligibility';
import type {
  ECSCommandStateDiagnostics,
  ECSOrchestratorCandidate,
  ECSOrchestratorOutput,
  ECSOrchestratorUITarget,
  ECSReleaseReadinessDiagnostics,
  ECSReleaseReadinessIssue,
  ECSRootConditionFamily,
} from './orchestratorTypes';

type BuildReleaseReadinessDiagnosticsArgs = {
  output: ECSOrchestratorOutput;
  richContext: ECSAIContext | null;
  liveStatus: ECSLiveStatusMap | null | undefined;
  operatorTrustMode: ECSOperatorTrustMode;
  commandDiagnostics: ECSCommandStateDiagnostics | null;
  expeditionReadiness?: ExpeditionReadinessAssessment | null;
};

const TARGETS: ECSOrchestratorUITarget[] = [
  'dashboard',
  'navigate',
  'explore',
  'alert',
  'fleet',
  'brief',
];

const ROUTE_CRITICAL_ROOTS = new Set<ECSRootConditionFamily>([
  'weather_route_exposure',
  'gps_guidance_degradation',
  'resource_margin_decline',
  'bailout_relevance',
  'route_risk_elevation',
]);

const PLANNING_ROOTS = new Set<ECSRootConditionFamily>([
  'mission_planning_readiness',
  'planning_recommendation',
  'vehicle_readiness_gap',
  'route_fit_limitation',
  'offline_capable_operation',
]);

export const DISPERSED_CAMPING_BANNED_RELEASE_PHRASES = [
  'legal camping',
  'allowed camping',
  'safe to camp',
  'guaranteed',
  'you can camp here',
  'approved campsite',
] as const;

export const DISPERSED_CAMPING_REQUIRED_CAUTION_PHRASES = [
  'Verify local rules',
  'closures',
  'fire restrictions',
  'permits',
  'posted signs',
  'ECS-Inferred',
] as const;

type DispersedCampingOverlayLifecycleSnapshot = {
  toggleAvailable: boolean;
  canToggleOnOff: boolean;
  avoidsDuplicateMapboxLayers: boolean;
  removesSourceWhenDisabled: boolean;
  remainsBelowRouteUserAndPinLayers: boolean;
};

type DispersedCampingCandidateGenerationSnapshot = {
  requiresExplicitUserAction: boolean;
  canRunOnMapPan: boolean;
  maxCandidateCount: number;
  blocksRestrictedPrivateTribalClosedCandidates: boolean;
};

type DispersedCampingFreshnessSnapshot = {
  staleDataLabeled: boolean;
  offlineLimitedCachedOrUnavailableState: boolean;
  createsNewClaimsWithoutData: boolean;
};

type DispersedCampingBetaFlagSnapshot = {
  flagName: string;
  defaultEnabled: boolean;
  productionEnabled: boolean;
};

export type DispersedCampingReleaseReadinessSnapshot = {
  featureCopy: string;
  overlayLifecycle: DispersedCampingOverlayLifecycleSnapshot;
  candidateGeneration: DispersedCampingCandidateGenerationSnapshot;
  freshness: DispersedCampingFreshnessSnapshot;
  betaFlag: DispersedCampingBetaFlagSnapshot;
  classificationSamples?: DispersedCampingClassificationInput[];
};

const DISPERSED_CAMPING_RESTRICTED_CLASSIFIER_SAMPLES: DispersedCampingClassificationInput[] = [
  { landManager: 'PRIVATE' },
  { landManager: 'TRIBAL' },
  { landManager: 'MILITARY' },
  { landManager: 'BLM', knownClosure: true },
  { landManager: 'BLM', privateOrTribal: true },
  { landManager: 'USFS', militaryOrRestricted: true },
];

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function priorityRank(candidate: ECSOrchestratorCandidate | null | undefined): number {
  return candidate?.priority?.rank ?? 1;
}

function pushIssue(
  issues: ECSReleaseReadinessIssue[],
  nextIssue: ECSReleaseReadinessIssue,
): void {
  const duplicate = issues.some((issue) => {
    return issue.code === nextIssue.code
      && issue.message === nextIssue.message
      && (issue.rootKey ?? null) === (nextIssue.rootKey ?? null);
  });
  if (!duplicate) {
    issues.push(nextIssue);
  }
}

function collectReadinessAssessmentText(assessment: ExpeditionReadinessAssessment): string {
  return [
    assessment.explanation,
    ...assessment.recommendations,
    ...assessment.blockers.flatMap((issue) => [issue.label, issue.detail]),
    ...assessment.warnings.flatMap((issue) => [issue.label, issue.detail]),
    ...assessment.categories.flatMap((category) => [
      category.label,
      category.summary,
      ...category.missingInputs,
      ...category.factors.flatMap((factor) => [factor.label, factor.detail]),
    ]),
    ...assessment.departureAudit.flatMap((item) => [
      item.label,
      item.summary,
      item.actionLabel ?? '',
      item.actionTarget ?? '',
    ]),
    assessment.recoveryBrief.nearestBailoutSummary,
    assessment.recoveryBrief.communicationsSummary,
    assessment.recoveryBrief.emergencyCoordinatePacketSummary,
    assessment.recoveryBrief.officialContactSummary,
    assessment.powerBrief.statusLabel,
    assessment.powerBrief.runtimeSummary,
    assessment.powerBrief.sourceSummary,
    assessment.powerBrief.freshnessSummary,
    assessment.powerBrief.recommendation,
  ].filter(Boolean).join(' ');
}

function hasReadinessScoreIntegrityGap(assessment: ExpeditionReadinessAssessment): boolean {
  if (!Number.isFinite(assessment.overallScore) || assessment.overallScore < 0 || assessment.overallScore > 100) {
    return true;
  }
  return assessment.categories.some((category) => {
    return !Number.isFinite(category.score) || category.score < 0 || category.score > 100;
  });
}

function hasOfflinePackageEvidence(assessment: ExpeditionReadinessAssessment): boolean {
  if (assessment.sourceFreshness.offline.isMissing) return false;

  const offlineCategory = assessment.categories.find((category) => category.id === 'offline_preparedness');
  const auditEvidence = assessment.departureAudit.some((item) => {
    const label = normalizeText(`${item.itemId} ${item.label}`);
    return item.status === 'complete' && /(offline|map package|route geometry|weather snapshot|bailout)/i.test(label);
  });
  const factorEvidence = offlineCategory?.factors.some((factor) => {
    return factor.impact === 'positive'
      && factor.source !== 'missing'
      && /(package|cache|cached|download|tile|snapshot|geometry)/i.test(`${factor.label} ${factor.detail}`);
  }) ?? false;

  return auditEvidence || factorEvidence;
}

function collectExpeditionReadinessIssues(args: {
  assessment: ExpeditionReadinessAssessment | null | undefined;
  visibleReadinessText: string;
  hasActiveRouteOrRun: boolean;
}): ECSReleaseReadinessIssue[] {
  const { assessment, visibleReadinessText, hasActiveRouteOrRun } = args;
  const issues: ECSReleaseReadinessIssue[] = [];

  if (!assessment) {
    return issues;
  }

  const categoryIds = new Set(assessment.categories.map((category) => category.id));
  const missingCategories = EXPEDITION_READINESS_CATEGORY_IDS.filter((id) => !categoryIds.has(id));
  if (assessment.categories.length !== EXPEDITION_READINESS_CATEGORY_IDS.length || missingCategories.length > 0) {
    pushIssue(issues, {
      code: 'expedition_readiness_category_gap',
      severity: 'error',
      message: `Expedition Readiness assessment must always include all ${EXPEDITION_READINESS_CATEGORY_IDS.length} categories.`,
      targets: ['brief', 'dashboard', 'navigate', 'explore'],
    });
  }

  if (hasReadinessScoreIntegrityGap(assessment)) {
    pushIssue(issues, {
      code: 'expedition_readiness_score_integrity',
      severity: 'error',
      message: 'Expedition Readiness contains an overall or category score outside 0-100.',
      targets: ['brief', 'dashboard'],
    });
  }

  const hardBlockers = assessment.blockers.length;
  const thresholds = assessment.calibration?.thresholds ?? { ready: 82, caution: 60 };
  const statusContradiction =
    (hardBlockers > 0 && assessment.status !== 'hold')
    || (assessment.status === 'ready' && assessment.overallScore < thresholds.ready)
    || (assessment.status === 'ready' && hardBlockers > 0)
    || (assessment.overallScore < thresholds.caution && assessment.status !== 'hold');

  if (statusContradiction) {
    pushIssue(issues, {
      code: 'expedition_readiness_status_contradiction',
      severity: 'error',
      message: 'Expedition Readiness status does not match score thresholds or hard blockers.',
      targets: ['brief', 'dashboard', 'navigate', 'explore', 'alert'],
    });
  }

  if (assessment.status === 'ready' && assessment.warnings.length > 0) {
    pushIssue(issues, {
      code: 'expedition_readiness_status_contradiction',
      severity: 'warning',
      message: 'Expedition Readiness is Ready while caution-level warnings remain visible.',
      targets: ['brief', 'dashboard'],
    });
  }

  const allReadinessText = normalizeText(`${collectReadinessAssessmentText(assessment)} ${visibleReadinessText}`);
  if (/\blegal campsite\b/i.test(allReadinessText) || /\bguaranteed safe\b/i.test(allReadinessText)) {
    pushIssue(issues, {
      code: 'expedition_readiness_unsafe_wording',
      severity: 'error',
      message: 'Expedition Readiness wording contains a legal or safety certainty claim.',
      targets: ['brief', 'dashboard', 'navigate', 'explore', 'alert'],
    });
  }

  if (assessment.dataIntegrity.unmarkedSyntheticData.length > 0) {
    pushIssue(issues, {
      code: 'expedition_readiness_synthetic_truth_gap',
      severity: hasActiveRouteOrRun ? 'error' : 'warning',
      message: 'Expedition Readiness uses mock/demo data without explicit demo, mock, or ECS-inferred marking.',
      targets: ['brief', 'dashboard', 'navigate', 'explore'],
    });
  }

  if (assessment.status === 'ready' && assessment.sourceFreshness.weather.isStale) {
    pushIssue(issues, {
      code: 'expedition_readiness_weather_freshness_gap',
      severity: 'error',
      message: 'Expedition Readiness is Ready while weather freshness is stale.',
      targets: ['brief', 'dashboard', 'navigate'],
    });
  }

  const vehicleFit = assessment.categories.find((category) => category.id === 'vehicle_fit');
  const vehicleFitClaimsStrong =
    vehicleFit?.status === 'ready'
    || (vehicleFit?.score ?? 0) >= 82
    || /strong/i.test(vehicleFit?.summary ?? '');
  if (assessment.sourceFreshness.fleet.isMissing && vehicleFitClaimsStrong) {
    pushIssue(issues, {
      code: 'expedition_readiness_vehicle_truth_gap',
      severity: 'error',
      message: 'Vehicle Fit claims a strong or Ready state without an active vehicle profile.',
      targets: ['brief', 'dashboard', 'navigate', 'explore', 'fleet'],
    });
  }

  const offlinePreparedness = assessment.categories.find((category) => category.id === 'offline_preparedness');
  const offlineClaimsReady =
    offlinePreparedness?.status === 'ready'
    || (offlinePreparedness?.score ?? 0) >= 82
    || /offline ready|package complete|downloaded/i.test(offlinePreparedness?.summary ?? '');
  if (offlineClaimsReady && !hasOfflinePackageEvidence(assessment)) {
    pushIssue(issues, {
      code: 'expedition_readiness_offline_truth_gap',
      severity: 'error',
      message: 'Offline Preparedness claims Ready without route package, cache, or audit evidence.',
      targets: ['brief', 'dashboard', 'navigate'],
    });
  }

  return issues;
}

function textIncludesPhrase(haystack: string, phrase: string): boolean {
  return normalizeText(haystack).includes(normalizeText(phrase));
}

export function scanDispersedCampingReleaseCopyGuardrails(featureCopy: string): {
  bannedPhrasesFound: string[];
  requiredPhrasesMissing: string[];
} {
  return {
    bannedPhrasesFound: DISPERSED_CAMPING_BANNED_RELEASE_PHRASES.filter((phrase) => (
      textIncludesPhrase(featureCopy, phrase)
    )),
    requiredPhrasesMissing: DISPERSED_CAMPING_REQUIRED_CAUTION_PHRASES.filter((phrase) => (
      !textIncludesPhrase(featureCopy, phrase)
    )),
  };
}

export function verifyDispersedCampingRestrictedClassificationGuardrail(
  samples: DispersedCampingClassificationInput[] = DISPERSED_CAMPING_RESTRICTED_CLASSIFIER_SAMPLES,
): string[] {
  return samples
    .map((sample, index) => ({
      id: `${sample.landManager}:${index}`,
      confidence: classifyDispersedCampingRegion(sample),
    }))
    .filter((result) => result.confidence === 'high' || result.confidence === 'medium')
    .map((result) => result.id);
}

export function collectDispersedCampingReleaseReadinessIssues(
  snapshot: DispersedCampingReleaseReadinessSnapshot,
): ECSReleaseReadinessIssue[] {
  const issues: ECSReleaseReadinessIssue[] = [];
  const copyScan = scanDispersedCampingReleaseCopyGuardrails(snapshot.featureCopy);
  const restrictedClassifierGaps = verifyDispersedCampingRestrictedClassificationGuardrail(
    snapshot.classificationSamples,
  );

  if (copyScan.bannedPhrasesFound.length > 0 || copyScan.requiredPhrasesMissing.length > 0) {
    pushIssue(issues, {
      code: 'dispersed_camping_copy_guardrail_gap',
      severity: 'error',
      message: [
        copyScan.bannedPhrasesFound.length > 0
          ? `Banned copy found: ${copyScan.bannedPhrasesFound.join(', ')}.`
          : null,
        copyScan.requiredPhrasesMissing.length > 0
          ? `Required caution copy missing: ${copyScan.requiredPhrasesMissing.join(', ')}.`
          : null,
      ].filter(Boolean).join(' '),
      targets: ['navigate', 'explore'],
    });
  }

  if (restrictedClassifierGaps.length > 0) {
    pushIssue(issues, {
      code: 'dispersed_camping_classification_guardrail_gap',
      severity: 'error',
      message: 'Dispersed Camping Eligibility classifier returned likely eligibility for restricted land signals.',
      targets: ['navigate', 'explore'],
    });
  }

  if (
    !snapshot.overlayLifecycle.toggleAvailable ||
    !snapshot.overlayLifecycle.canToggleOnOff ||
    !snapshot.overlayLifecycle.avoidsDuplicateMapboxLayers ||
    !snapshot.overlayLifecycle.removesSourceWhenDisabled ||
    !snapshot.overlayLifecycle.remainsBelowRouteUserAndPinLayers
  ) {
    pushIssue(issues, {
      code: 'dispersed_camping_overlay_lifecycle_gap',
      severity: 'error',
      message: 'Dispersed Camping Eligibility overlay lifecycle must toggle cleanly without duplicate or stale Mapbox layers.',
      targets: ['navigate'],
    });
  }

  if (
    !snapshot.candidateGeneration.requiresExplicitUserAction ||
    snapshot.candidateGeneration.canRunOnMapPan ||
    snapshot.candidateGeneration.maxCandidateCount > 5 ||
    !snapshot.candidateGeneration.blocksRestrictedPrivateTribalClosedCandidates
  ) {
    pushIssue(issues, {
      code: 'dispersed_camping_candidate_generation_gap',
      severity: 'error',
      message: 'ECS-inferred camp candidates must require user action, stay capped, and hard-block restricted/private/tribal/closed regions.',
      targets: ['navigate', 'explore'],
    });
  }

  if (
    !snapshot.freshness.staleDataLabeled ||
    !snapshot.freshness.offlineLimitedCachedOrUnavailableState ||
    snapshot.freshness.createsNewClaimsWithoutData
  ) {
    pushIssue(issues, {
      code: 'dispersed_camping_data_freshness_gap',
      severity: 'error',
      message: 'Dispersed Camping Eligibility stale/offline states must be labeled and must not create new eligibility claims without data.',
      targets: ['navigate'],
    });
  }

  if (
    snapshot.betaFlag.flagName !== 'EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER' ||
    snapshot.betaFlag.defaultEnabled ||
    snapshot.betaFlag.productionEnabled
  ) {
    pushIssue(issues, {
      code: 'dispersed_camping_beta_flag_gap',
      severity: 'error',
      message: 'Dispersed Camping Eligibility must remain behind the internal/beta feature flag until Android data-ingestion validation is complete.',
      targets: ['navigate', 'explore'],
    });
  }

  return issues;
}

function recommendedFixForIssue(issue: ECSReleaseReadinessIssue): string {
  switch (issue.code) {
    case 'expedition_readiness_category_gap':
      return 'Ensure buildExpeditionReadiness returns all 10 required categories for every partial or complete input.';
    case 'expedition_readiness_score_integrity':
      return 'Clamp overall and category readiness scores to 0-100 and reject non-finite values before publishing.';
    case 'expedition_readiness_status_contradiction':
      return 'Reconcile readiness thresholds so blockers force Hold and warnings or uncertainty cap the result at Caution.';
    case 'expedition_readiness_unsafe_wording':
      return 'Replace legal and safety certainty copy with confidence-based ECS Intelligence wording.';
    case 'expedition_readiness_synthetic_truth_gap':
      return 'Mark mock/demo/inferred readiness sources explicitly before showing the assessment in live command surfaces.';
    case 'expedition_readiness_weather_freshness_gap':
      return 'Do not allow Ready when weather is stale; refresh weather or cap the assessment at Caution.';
    case 'expedition_readiness_vehicle_truth_gap':
      return 'Require an active Fleet vehicle before presenting strong Vehicle Fit language.';
    case 'expedition_readiness_offline_truth_gap':
      return 'Only claim Offline Preparedness is Ready when route package/cache evidence is present.';
    case 'dispersed_camping_copy_guardrail_gap':
      return 'Replace legal-certainty copy with eligibility/verification wording and keep ECS-Inferred candidate warnings visible.';
    case 'dispersed_camping_classification_guardrail_gap':
      return 'Keep private, tribal, military, closure, and restricted-access signals classified as restricted or verify-only.';
    case 'dispersed_camping_overlay_lifecycle_gap':
      return 'Verify the Navigate WebView toggle removes stale sources, avoids duplicate layers, and keeps eligibility below route/user/pin layers.';
    case 'dispersed_camping_candidate_generation_gap':
      return 'Gate CampOps candidate generation behind explicit user action, cap candidate count, and hard-block restricted regions.';
    case 'dispersed_camping_data_freshness_gap':
      return 'Label stale/cached/offline data honestly and suppress new eligibility claims when source data is unavailable.';
    case 'dispersed_camping_beta_flag_gap':
      return 'Keep EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER default-off outside internal/dev validation.';
    case 'route_lead_gap':
      return 'Route-critical blockers need Navigate and Alert/Dispatch ownership.';
    case 'offline_capable_conflict':
      return 'Tune offline-capable wording so cached operation reads as degraded-but-usable, not total failure.';
    case 'minimal_mode_noise':
      return 'Reduce passive/secondary command chatter in Minimal Advisory mode.';
    case 'planning_phase_ownership_gap':
      return 'Keep Fleet and Brief aligned around planning readiness when staging or vehicle setup is active.';
    case 'missing_lead_target':
      return 'Assign a deterministic lead target to multi-surface command conditions.';
    case 'stale_signal_churn':
      return 'Reduce stale command-state churn by tightening freshness guards at the source.';
    case 'cross_tab_blockers':
      return 'Resolve cross-tab invariant blockers before release.';
    case 'cross_tab_warning_cluster':
      return 'Review the warning cluster for repeated rationale or noisy command ownership.';
    default:
      return 'Review the release readiness issue and resolve the underlying command-state mismatch.';
  }
}

function buildReleaseQaSummary(issues: ECSReleaseReadinessIssue[]): ECSReleaseQaSummary {
  const blockers = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);
  const riskLevel: ECSReleaseQaSummary['riskLevel'] =
    blockers.length > 0
      ? 'critical'
      : warnings.length >= 4
        ? 'high'
        : warnings.length > 0
          ? 'medium'
          : 'low';

  return {
    passed: blockers.length === 0,
    riskLevel,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    recommendedFixes: Array.from(new Set(issues.map(recommendedFixForIssue))),
  };
}

export function buildReleaseReadinessDiagnostics(
  args: BuildReleaseReadinessDiagnosticsArgs,
): ECSReleaseReadinessDiagnostics {
  const { output, richContext, liveStatus, operatorTrustMode, commandDiagnostics } = args;
  const issues: ECSReleaseReadinessIssue[] = [];
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const expeditionReadiness = args.expeditionReadiness ?? output.expeditionReadiness ?? null;

  if (commandDiagnostics) {
    const errorCount = commandDiagnostics.invariantViolations.filter((violation) => violation.severity === 'error').length;
    const warningCount = commandDiagnostics.invariantViolations.filter((violation) => violation.severity === 'warning').length;

    if (errorCount > 0) {
      pushIssue(issues, {
        code: 'cross_tab_blockers',
        severity: 'error',
        message: `${errorCount} cross-tab invariant blocker${errorCount === 1 ? '' : 's'} remain active in the command stack.`,
      });
    }

    if (warningCount >= 3) {
      pushIssue(issues, {
        code: 'cross_tab_warning_cluster',
        severity: 'warning',
        message: `${warningCount} cross-tab warning conditions are active and may still feel noisy before release.`,
      });
    }

    if (commandDiagnostics.staleSignals.length >= 3) {
      pushIssue(issues, {
        code: 'stale_signal_churn',
        severity: 'warning',
        message: `${commandDiagnostics.staleSignals.length} stale-signal suppressions were required, suggesting refresh churn remains elevated.`,
      });
    }

    commandDiagnostics.rootSnapshots.forEach((snapshot) => {
      if (!snapshot.leadTarget && snapshot.supportTargets.length >= 2) {
        pushIssue(issues, {
          code: 'missing_lead_target',
          severity: 'warning',
          message: 'A multi-surface root condition is present without a clear lead target.',
          rootKey: snapshot.key,
          targets: snapshot.supportTargets,
        });
      }
    });
  }

  const navigateView = selectOrchestratorTargetView(output, 'navigate');
  const alertView = selectOrchestratorTargetView(output, 'alert');
  const dashboardView = selectOrchestratorTargetView(output, 'dashboard');
  const fleetView = selectOrchestratorTargetView(output, 'fleet');
  const briefView = selectOrchestratorTargetView(output, 'brief');

  const activeCandidates = [
    output.primary ?? null,
    ...output.secondary,
    ...output.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  const severeRouteCandidate = activeCandidates.find((candidate) => {
    return !!candidate.rootCondition?.family
      && ROUTE_CRITICAL_ROOTS.has(candidate.rootCondition.family)
      && priorityRank(candidate) >= 4;
  }) ?? null;

  if (routeActive && severeRouteCandidate) {
    const navigateHasRouteLead = [
      navigateView.primary,
      ...navigateView.secondary,
      ...navigateView.passive,
    ].some((candidate) => candidate?.rootCondition?.key === severeRouteCandidate.rootCondition?.key);

    if (!navigateHasRouteLead) {
      pushIssue(issues, {
        code: 'route_lead_gap',
        severity: 'error',
        message: 'A severe route-critical issue exists without a matching Navigate expression.',
        rootKey: severeRouteCandidate.rootCondition?.key ?? null,
        targets: ['navigate', 'alert', 'dashboard'],
      });
    }
  }

  if (
    output.activePhase &&
    PLANNING_ROOTS.has(dashboardView.primary?.rootCondition?.family as ECSRootConditionFamily)
    && fleetView.primary?.rootCondition?.family
    && !PLANNING_ROOTS.has(fleetView.primary.rootCondition.family)
    && (output.activePhase === 'vehicle_setup' || output.activePhase === 'staging')
  ) {
    pushIssue(issues, {
      code: 'planning_phase_ownership_gap',
      severity: 'warning',
      message: 'Planning-focused command state is present, but Fleet is not owning the readiness posture during a planning phase.',
      targets: ['fleet', 'dashboard', 'brief'],
    });
  }

  const readinessText = normalizeText([
    dashboardView.primary?.summary,
    briefView.primary?.summary,
    navigateView.primary?.summary,
  ].filter(Boolean).join(' '));

  if (
    liveStatus?.readiness?.status === 'offline_capable'
    && /(offline failure|service required|not available offline|unavailable offline)/i.test(readinessText)
  ) {
    pushIssue(issues, {
      code: 'offline_capable_conflict',
      severity: 'warning',
      message: 'Offline-capable readiness is still being phrased too much like total failure in surfaced command text.',
      targets: ['dashboard', 'navigate', 'brief'],
    });
  }

  if (
    operatorTrustMode === 'minimal_advisory'
    && output.secondary.length + output.passive.length >= 5
  ) {
    pushIssue(issues, {
      code: 'minimal_mode_noise',
      severity: 'warning',
      message: 'Minimal Advisory is still surfacing too many secondary or passive recommendation states.',
      targets: TARGETS,
    });
  }

  collectExpeditionReadinessIssues({
    assessment: expeditionReadiness,
    visibleReadinessText: readinessText,
    hasActiveRouteOrRun: routeActive,
  }).forEach((issue) => pushIssue(issues, issue));

  const highlightedScenarios = ECS_RELEASE_READINESS_SCENARIOS.filter((scenario) => {
    const phaseMatch =
      (output.activePhase == null && scenario.phase === 'none')
      || scenario.phase === output.activePhase;
    const trustMatch = scenario.trustModes.includes(operatorTrustMode);
    return phaseMatch || trustMatch;
  }).slice(0, 6).map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    phase: scenario.phase,
  }));

  const issueCounts = issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, error: 0 },
  );

  const overallStatus =
    issueCounts.error > 0
      ? 'blocker'
      : issueCounts.warning > 0
        ? 'watch'
        : 'healthy';
  const masterChecklist = buildMasterReleaseChecklist({
    issues,
    richContext,
    commandDiagnostics,
  });
  const unresolvedRiskSummary = buildReleaseRiskSummary({
    issues,
    commandDiagnostics,
  });
  const qaSummary = buildReleaseQaSummary(issues);

  return {
    generatedAt: Date.now(),
    overallStatus,
    activePhase: output.activePhase ?? null,
    operatorTrustMode,
    issueCounts,
    issues,
    activeRootCount: commandDiagnostics?.rootSnapshots.length ?? 0,
    staleSignalCount: commandDiagnostics?.staleSignals.length ?? 0,
    leadByTarget: commandDiagnostics?.leadByTarget ?? {},
    scenarioCoverage: {
      totalScenarios: ECS_RELEASE_READINESS_SCENARIOS.length,
      highlighted: highlightedScenarios,
      trustModes: ['conservative_guidance', 'balanced_command', 'minimal_advisory'],
    },
    masterChecklist,
    unresolvedRiskSummary,
    qaSummary,
  };
}
