import type {
  CampIntelMissionMode,
  CampIntelRecommendationClass,
  CampIntelRankedCandidate,
} from './campIntelTypes';

export function classifyCampIntelCandidate(
  candidate: Pick<
    CampIntelRankedCandidate,
    'scores' | 'confidence' | 'point' | 'viability'
  >,
  missionMode: CampIntelMissionMode,
): CampIntelRecommendationClass {
  const { scores, confidence, point, viability } = candidate;
  if (!viability.isViableCandidate) {
    return 'rejected_low_confidence';
  }
  const complianceBlocked = scores.complianceScore.raw < 28;
  const safetyBlocked = scores.safetyScore.raw < 34;
  const accessBlocked = scores.accessScore.raw < 30;
  const lowConfidence = confidence.score < 42;
  const difficultArrival = scores.arrivalRiskScore >= 72;
  const difficultDeparture = scores.departureRiskScore >= 72;
  const poorOvernight = scores.overnightSuitabilityScore < 42;
  const nightEmergencyBias =
    missionMode === 'emergency_stop_before_dark' ||
    point.missionContext.isAfterSunset ||
    point.missionContext.nearSunset;

  if (complianceBlocked || safetyBlocked || lowConfidence || poorOvernight) {
    if (
      nightEmergencyBias &&
      scores.accessScore.raw >= 45 &&
      scores.vehicleFitScore.raw >= 45 &&
      scores.safetyScore.raw >= 38 &&
      scores.complianceScore.raw >= 24 &&
      scores.arrivalRiskScore < 68
    ) {
      return 'emergency';
    }
    return 'rejected_low_confidence';
  }

  if (
    scores.overallScore >= 74 &&
    confidence.score >= 62 &&
    scores.accessScore.raw >= 55 &&
    scores.safetyScore.raw >= 55 &&
    scores.complianceScore.raw >= 52 &&
    scores.arrivalRiskScore < 58 &&
    scores.departureRiskScore < 60 &&
    scores.overnightSuitabilityScore >= 62
  ) {
    return 'suggested';
  }

  if (
    nightEmergencyBias &&
    scores.accessScore.raw >= 48 &&
    scores.vehicleFitScore.raw >= 46 &&
    scores.safetyScore.raw >= 40 &&
    !accessBlocked &&
    scores.arrivalRiskScore < 72
  ) {
    return 'emergency';
  }

  if (
    scores.overallScore >= 56 &&
    confidence.score >= 46 &&
    !accessBlocked &&
    !difficultArrival &&
    !difficultDeparture &&
    scores.overnightSuitabilityScore >= 48
  ) {
    return 'backup';
  }

  return 'rejected_low_confidence';
}
