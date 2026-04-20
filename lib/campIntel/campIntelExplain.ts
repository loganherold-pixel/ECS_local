import type {
  CampIntelExplanation,
  CampIntelRankedCandidate,
  CampIntelReasonContribution,
} from './campIntelTypes';

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortReasons(
  reasons: CampIntelReasonContribution[],
  kind: CampIntelReasonContribution['kind'],
): CampIntelReasonContribution[] {
  return reasons
    .filter((reason) => reason.kind === kind)
    .sort((a, b) => b.impact - a.impact);
}

export function buildCampIntelExplanation(
  current: Pick<CampIntelRankedCandidate, 'scores' | 'confidence' | 'arrivalAssessment' | 'overnightAssessment' | 'departureAssessment' | 'point' | 'viability'>,
  topCandidate: Pick<CampIntelRankedCandidate, 'scores' | 'confidence' | 'arrivalAssessment' | 'overnightAssessment' | 'departureAssessment'> | null,
): CampIntelExplanation {
  const viabilityReasons = current.viability.failedViabilityReasons.map((reason, index) => ({
    id: `viability-${index}`,
    dimension: 'confidence' as const,
    kind: 'caution' as const,
    label: reason,
    impact: 18,
    tone: 'warning' as const,
  }));
  const allReasons = [
    ...current.scores.accessScore.reasons,
    ...current.scores.campabilityScore.reasons,
    ...current.scores.vehicleFitScore.reasons,
    ...current.scores.safetyScore.reasons,
    ...current.scores.complianceScore.reasons,
    ...current.scores.desirabilityScore.reasons,
    ...current.confidence.penalties,
    ...viabilityReasons,
  ];

  const positives = sortReasons(allReasons, 'positive').slice(0, 4).map((reason) => reason.label);
  const cautions = [
    ...sortReasons(allReasons, 'caution'),
    ...sortReasons(allReasons, 'unknown'),
  ]
    .slice(0, 4)
    .map((reason) => reason.label);

  const whySuggested = dedupe([
    ...positives.slice(0, 3),
    current.arrivalAssessment.score <= 38
      ? 'Arrival risk stays manageable for current timing.'
      : '',
    current.overnightAssessment.score >= 66
      ? 'Overnight suitability remains stable enough for a normal stop.'
      : '',
    current.departureAssessment.score <= 40
      ? 'Morning departure looks simpler than most nearby options.'
      : '',
    current.scores.complianceScore.raw >= 55
      ? 'The site clears ECS compliance thresholds better than most nearby candidates.'
      : '',
    current.confidence.score >= 70
      ? 'Confidence remains strong enough to recommend this site directly.'
      : '',
  ]).slice(0, 4);

  const whyNotTopRanked = !topCandidate || topCandidate === current
    ? []
    : dedupe([
        current.scores.accessScore.raw < topCandidate.scores.accessScore.raw - 6
          ? 'A higher-ranked option offers an easier final approach.'
          : '',
        current.arrivalAssessment.score > topCandidate.arrivalAssessment.score + 8
          ? 'Another site is easier to reach before dark.'
          : '',
        current.departureAssessment.score > topCandidate.departureAssessment.score + 8
          ? 'Another site offers a simpler morning departure.'
          : '',
        current.overnightAssessment.score < topCandidate.overnightAssessment.score - 8
          ? 'Another nearby option is more stable overnight.'
          : '',
        current.scores.safetyScore.raw < topCandidate.scores.safetyScore.raw - 6
          ? 'Another nearby candidate carries less overnight risk.'
          : '',
        current.confidence.score < topCandidate.confidence.score - 8
          ? 'Confidence is lower here because more route or compliance inputs remain unresolved.'
          : '',
        current.scores.desirabilityScore.raw < topCandidate.scores.desirabilityScore.raw - 8
          ? 'Another site scores better on privacy, scenery, or comfort.'
          : '',
      ]).slice(0, 3);

  return {
    topPositiveReasons: positives,
    topCautionReasons: cautions,
    whySuggested: whySuggested.length > 0 ? whySuggested : ['This site balances arrival practicality, overnight stability, and departure margin better than most nearby candidates.'],
    whyNotTopRanked,
  };
}
