import { compareCampIntelSites } from './campIntelCompare';
import type { CampDecisionState } from './campDecisionTypes';
import type {
  CampIntelEngineResult,
  CampIntelSite,
  CampIntelStructuredSummary,
} from './campIntelTypes';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function confidenceLabel(score: number): CampDecisionState['decisionConfidenceLabel'] {
  if (score >= 76) return 'high';
  if (score >= 52) return 'medium';
  return 'low';
}

function pressureFromScore(score: number): CampDecisionState['conditionsPressureState'] {
  if (score >= 0.85) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'elevated';
  return 'low';
}

function emptyDecision(summary: CampIntelStructuredSummary): CampDecisionState {
  const offlineLimited = Boolean(summary.offlineAssessment);
  return {
    available: false,
    campRecommendationType: 'low_confidence_ahead',
    recommendedCampId: null,
    recommendedAction: offlineLimited
      ? 'Reassess soon using cached route context only.'
      : 'Reassess soon; no viable camp recommendation is currently available.',
    decisionConfidence: offlineLimited ? 38 : 28,
    decisionConfidenceLabel: offlineLimited ? 'low' : 'low',
    decisionReasons: offlineLimited
      ? ['Forward camp confidence is reduced because route or weather inputs are cached.']
      : ['No viable camp candidate currently clears ECS recommendation thresholds.'],
    alternativesSummary: [],
    timePressureState: 'daylight_normal',
    conditionsPressureState: offlineLimited ? 'elevated' : 'low',
    resourcePressureState: 'low',
    routePhase: offlineLimited ? 'low_confidence_forward_exploration' : 'active_route_travel',
    headline: offlineLimited ? 'Low-confidence camp picture ahead' : 'No strong camp recommendation available',
    summaryLine: offlineLimited
      ? 'Camp recommendation is running conservatively because route or weather confidence is reduced.'
      : 'No viable camp recommendation is currently strong enough to advise a stop.',
    recommendedCampLabel: null,
    compareContext: [],
    nextReassessmentTrigger: {
      type: offlineLimited ? 'offline_state_change' : 'route_progress',
      label: offlineLimited ? 'Reassess when connectivity improves' : 'Reassess at the next viable camp cluster',
      reason: offlineLimited
        ? 'Forward confidence should improve once weather or compliance inputs refresh.'
        : 'A stronger camp recommendation may appear after additional route progress.',
    },
    recommendationStrength: offlineLimited ? 'weakened' : 'steady',
    conservativeMode: offlineLimited,
    offlineLimited,
    sourceMissionMode: summary.missionMode,
  };
}

function sortByForwardDistance(sites: CampIntelSite[]): CampIntelSite[] {
  return [...sites].sort((a, b) => {
    const aDist = Number.isFinite(a.detourDistanceMiles ?? NaN) ? Number(a.detourDistanceMiles) : 999;
    const bDist = Number.isFinite(b.detourDistanceMiles ?? NaN) ? Number(b.detourDistanceMiles) : 999;
    return aDist - bDist || b.confidenceScore - a.confidenceScore || b.overallScore - a.overallScore;
  });
}

function routePhaseForDecision(best: CampIntelSite, summary: CampIntelStructuredSummary): CampDecisionState['routePhase'] {
  if (best.missionMode === 'emergency_stop_before_dark') return 'emergency_fallback_before_dark';
  if (best.darknessAdjustmentState === 'after_dark' || best.darknessAdjustmentState === 'last_light_caution') return 'late_day_search';
  if (summary.lowConfidenceBeyondTop || best.confidence === 'low') return 'low_confidence_forward_exploration';
  return 'active_route_travel';
}

function conservativeContinueBlocked(args: {
  nextForward: CampIntelSite | null;
  nearest: CampIntelSite;
  timePressureState: CampDecisionState['timePressureState'];
  conditionsPressure: number;
  resourcePressure: number;
  lowConfidenceAhead: boolean;
  offlineLimited: boolean;
}): boolean {
  const {
    nextForward,
    nearest,
    timePressureState,
    conditionsPressure,
    resourcePressure,
    lowConfidenceAhead,
    offlineLimited,
  } = args;

  if (!nextForward) return true;
  if (offlineLimited || lowConfidenceAhead) return true;
  if (timePressureState !== 'daylight_normal') return true;
  if (conditionsPressure >= 0.4 || resourcePressure >= 0.4) return true;
  if (nextForward.confidence === 'low') return true;
  if (nextForward.arrivalRiskScore >= 46 || nextForward.departureRiskScore >= 52) return true;
  if (nextForward.overnightSuitabilityScore < nearest.overnightSuitabilityScore + 6) return true;
  if (nextForward.confidenceScore < nearest.confidenceScore + 6) return true;
  if ((nextForward.detourDistanceMiles ?? 0) > (nearest.detourDistanceMiles ?? 0) + 1.25) return true;
  return false;
}

function buildAlternativeSummaries(best: CampIntelSite, nearest: CampIntelSite | null, compareContext: ReturnType<typeof compareCampIntelSites>): CampDecisionState['alternativesSummary'] {
  const summaries: CampDecisionState['alternativesSummary'] = [];
  if (nearest && nearest.id !== best.id) {
    summaries.push({
      siteId: nearest.id,
      label: nearest.label,
      summary:
        nearest.arrivalRiskScore < best.arrivalRiskScore
          ? `${nearest.label} is easier to reach tonight but not the strongest overall stop.`
          : `${nearest.label} is closer, but ECS favors ${best.label} right now.`,
    });
  }

  compareContext?.compareHighlights
    .filter((highlight) => highlight.siteId !== best.id)
    .slice(0, 2)
    .forEach((highlight) => {
      summaries.push({
        siteId: highlight.siteId,
        label: highlight.label,
        summary: highlight.summary,
      });
    });

  return summaries.slice(0, 3);
}

export function buildCampDecisionState(args: {
  engineResult: CampIntelEngineResult;
  visibleSites: CampIntelSite[];
  summary: CampIntelStructuredSummary;
}): CampDecisionState {
  const { engineResult, visibleSites, summary } = args;
  if (!visibleSites.length) {
    return emptyDecision(summary);
  }

  const best = visibleSites[0];
  const forwardSites = sortByForwardDistance(visibleSites);
  const nearest = forwardSites[0] ?? best;
  const nextForward = forwardSites.find((site) => site.id !== nearest.id) ?? null;
  const compareContext = compareCampIntelSites([best, ...(nextForward ? [nextForward] : []), ...(nearest && nearest.id !== best.id ? [nearest] : [])].slice(0, 3));

  const timePressureState = best.darknessAdjustmentState;
  const conditionsPressure = clamp01(
    ((100 - best.overnightSuitabilityScore) / 100) * 0.34 +
    (best.compareMetrics.windExposureScore / 100) * 0.18 +
    (summary.offlineAssessment ? 0.14 : 0) +
    (best.topCautionReasons.length > 0 ? 0.1 : 0) +
    (timePressureState === 'after_dark' ? 0.18 : timePressureState === 'last_light_caution' ? 0.1 : 0),
  );
  const resourcePressure = clamp01(
    (best.compareMetrics.routeDetourMiles != null && best.compareMetrics.routeDetourMiles > 1.1 ? 0.14 : 0) +
    (best.compareMetrics.fuelDistanceMiles != null && best.compareMetrics.fuelDistanceMiles > 35 ? 0.24 : 0) +
    (best.compareMetrics.bailoutDistanceMiles != null && best.compareMetrics.bailoutDistanceMiles > 14 ? 0.22 : 0) +
    (best.feedback.includes('blocked') ? 0.08 : 0) +
    (best.topCautionReasons.some((reason) => /resource|fuel/i.test(reason)) ? 0.12 : 0),
  );

  const lowConfidenceAhead = summary.lowConfidenceBeyondTop || (nextForward?.confidence === 'low');
  const currentHighConfidenceStop =
    nearest.confidence !== 'low' &&
    nearest.isViableCandidate &&
    nearest.arrivalRiskScore <= 52 &&
    nearest.overnightSuitabilityScore >= 58;
  const fartherCampStronger =
    !!nextForward &&
    nextForward.classification === 'suggested' &&
    nextForward.overallScore >= nearest.overallScore + 10 &&
    nextForward.confidenceScore >= nearest.confidenceScore + 4 &&
    nextForward.arrivalRiskScore <= 44 &&
    nextForward.departureRiskScore <= 50 &&
    nextForward.overnightSuitabilityScore >= nearest.overnightSuitabilityScore + 6;
  const conditionsNeedConservative =
    timePressureState !== 'daylight_normal' ||
    pressureFromScore(conditionsPressure) !== 'low' ||
    pressureFromScore(resourcePressure) !== 'low' ||
    Boolean(summary.offlineAssessment) ||
    lowConfidenceAhead;

  let campRecommendationType: CampDecisionState['campRecommendationType'] = 'safe_to_continue';
  let recommendedCamp = best;
  let recommendedAction = `Continue to ${best.label}; it is the best tactical overnight choice right now.`;
  let recommendationStrength: CampDecisionState['recommendationStrength'] = 'steady';

  if (best.classification === 'emergency' && (timePressureState !== 'daylight_normal' || pressureFromScore(conditionsPressure) === 'critical')) {
    campRecommendationType = 'use_emergency_overnight_option';
    recommendedAction = `Use ${best.label} as an emergency overnight stop rather than pressing deeper into uncertainty.`;
    recommendationStrength = 'strengthened';
  } else if (timePressureState === 'after_dark' && currentHighConfidenceStop) {
    campRecommendationType = 'stop_now';
    recommendedCamp = nearest;
    recommendedAction = `Stop at ${nearest.label} now; arrival margin is stronger than continuing after dark.`;
    recommendationStrength = 'strengthened';
  } else if (timePressureState === 'last_light_caution' && currentHighConfidenceStop && lowConfidenceAhead) {
    campRecommendationType = 'do_not_pass_current_high_confidence_camp';
    recommendedCamp = nearest;
    recommendedAction = `Do not pass ${nearest.label}; forward camp confidence drops in the last-light window.`;
    recommendationStrength = 'strengthened';
  } else if (currentHighConfidenceStop && lowConfidenceAhead) {
    campRecommendationType = 'do_not_pass_current_high_confidence_camp';
    recommendedCamp = nearest;
    recommendedAction = `Do not pass ${nearest.label}; stronger alternatives ahead are too uncertain to justify skipping it.`;
    recommendationStrength = 'strengthened';
  } else if (
    fartherCampStronger &&
    !conditionsNeedConservative &&
    !conservativeContinueBlocked({
      nextForward,
      nearest,
      timePressureState,
      conditionsPressure,
      resourcePressure,
      lowConfidenceAhead,
      offlineLimited: Boolean(summary.offlineAssessment),
    })
  ) {
    campRecommendationType = 'continue_to_better_camp';
    recommendedCamp = nextForward;
    recommendedAction = `Continue to ${nextForward.label}; it is stronger than the nearest stop and timing remains acceptable.`;
    recommendationStrength = 'steady';
  } else if (nearest.classification === 'backup' && conditionsNeedConservative) {
    campRecommendationType = 'take_backup_camp';
    recommendedCamp = nearest;
    recommendedAction = `Take ${nearest.label} as a tactical backup camp rather than continuing into lower-confidence terrain.`;
    recommendationStrength = 'strengthened';
  } else if (summary.offlineAssessment || lowConfidenceAhead) {
    campRecommendationType = 'reassess_soon';
    recommendedCamp = nearest ?? best;
    recommendedAction = `Reassess soon; forward camp confidence is weakening and ECS is operating conservatively.`;
    recommendationStrength = 'weakened';
  } else {
    campRecommendationType = 'safe_to_continue';
    recommendedCamp = best;
    recommendedAction = `Safe to continue toward ${best.label}; it remains the best current overnight choice.`;
  }

  const reasons = [
    campRecommendationType === 'stop_now' || campRecommendationType === 'do_not_pass_current_high_confidence_camp'
      ? `${recommendedCamp.label} keeps arrival risk lower than pushing farther under current timing.`
      : '',
    recommendedCamp.overnightSuitabilityScore >= 66
      ? `${recommendedCamp.label} carries stronger overnight stability than most nearby options.`
      : '',
    recommendedCamp.departureRiskScore <= 42
      ? `${recommendedCamp.label} preserves a simpler morning departure.`
      : '',
    pressureFromScore(resourcePressure) !== 'low'
      ? 'Resource pressure favors a route-practical overnight stop.'
      : '',
    pressureFromScore(conditionsPressure) !== 'low'
      ? 'Current weather, exposure, or confidence pressures support a more conservative recommendation.'
      : '',
    summary.offlineAssessment
      ? 'Offline or stale inputs reduce confidence in farther-ahead camp guidance.'
      : '',
    campRecommendationType === 'continue_to_better_camp' && nextForward
      ? `${nextForward.label} is materially stronger than the nearest stop on confidence, overnight stability, and departure margin.`
      : '',
  ].filter(Boolean).slice(0, 5);

  const decisionConfidence = Math.round(
    clamp01(
      recommendedCamp.confidenceScore / 100 * 0.56 +
      (recommendedCamp.overallScore / 100) * 0.24 +
      ((campRecommendationType === 'stop_now' || campRecommendationType === 'do_not_pass_current_high_confidence_camp') ? 0.08 : 0) -
      conditionsPressure * 0.12 -
      resourcePressure * 0.08,
    ) * 100,
  );

  const nextReassessmentTrigger: CampDecisionState['nextReassessmentTrigger'] =
    timePressureState === 'last_light_caution'
      ? {
          type: 'time_window',
          label: 'Reassess within the next 15 minutes',
          reason: 'Arrival margin changes quickly in the last-light window.',
        }
      : timePressureState === 'after_dark'
        ? {
            type: 'next_viable_cluster',
            label: 'Reassess at the next viable camp cluster',
            reason: 'After-dark continuation should stay conservative between viable stops.',
          }
        : summary.offlineAssessment
          ? {
              type: 'offline_state_change',
              label: 'Reassess when route or weather confidence refreshes',
              reason: 'Forward guidance is intentionally conservative while offline or stale.',
            }
          : {
              type: 'route_progress',
              label: 'Reassess after the next viable camp cluster',
              reason: 'Camp recommendation should update after meaningful route progress.',
            };

  return {
    available: true,
    campRecommendationType,
    recommendedCampId: recommendedCamp.id,
    recommendedAction,
    decisionConfidence,
    decisionConfidenceLabel: confidenceLabel(decisionConfidence),
    decisionReasons: reasons,
    alternativesSummary: buildAlternativeSummaries(recommendedCamp, nearest, compareContext),
    timePressureState,
    conditionsPressureState: pressureFromScore(conditionsPressure),
    resourcePressureState: pressureFromScore(resourcePressure),
    routePhase: routePhaseForDecision(recommendedCamp, summary),
    headline:
      campRecommendationType === 'stop_now'
        ? 'Best to stop now'
        : campRecommendationType === 'continue_to_better_camp'
          ? 'Safe to continue to a better camp'
          : campRecommendationType === 'do_not_pass_current_high_confidence_camp'
            ? 'Do not pass the current high-confidence camp'
            : campRecommendationType === 'take_backup_camp'
              ? 'Backup camp is the tactical choice'
              : campRecommendationType === 'use_emergency_overnight_option'
                ? 'Emergency overnight option advised'
                : campRecommendationType === 'reassess_soon'
                  ? 'Camp guidance requires near-term reassessment'
                  : 'Safe to continue',
    summaryLine: recommendedAction,
    recommendedCampLabel: recommendedCamp.label,
    compareContext: compareContext?.comparisonSummary ?? [],
    nextReassessmentTrigger,
    recommendationStrength,
    conservativeMode: conditionsNeedConservative,
    offlineLimited: Boolean(summary.offlineAssessment),
    sourceMissionMode: summary.missionMode,
  };
}
