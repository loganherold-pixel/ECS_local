import type { ExpeditionForecast } from '../expeditionForecastEngine';
import {
  CAMPSITE_UI_NOTICE_BROADER,
  CAMPSITE_UI_NOTICE_LOWER_CONFIDENCE,
} from '../campsites/campsiteThresholds';
import {
  campsiteRatingFromScore,
  campsiteRatingImpactFromScore,
  type CampsiteRatingFactor,
} from '../campsites/campsiteRatingTypes';
import type {
  CampIntelAssessmentRow,
  CampIntelCategory,
  CampIntelConfidence,
  CampIntelConfidenceBreakdown,
  CampIntelEngineResult,
  CampIntelEvidenceSummary,
  CampIntelFeedbackCode,
  CampIntelMarkerPayload,
  CampIntelMicroBadge,
  CampIntelOfflineAssessment,
  CampIntelPreferenceState,
  CampIntelRankedCandidate,
  CampIntelReasonChip,
  CampIntelRouteWeatherSnapshot,
  CampIntelSite,
  CampIntelStructuredSummary,
  CampIntelStructuredSummaryCandidate,
  CampIntelTone,
  CampIntelVehicleSummary,
  CampIntelWeatherSummary,
} from './campIntelTypes';

function round(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}

function scoreToTone(score: number): CampIntelTone {
  if (score >= 76) return 'positive';
  if (score >= 58) return 'neutral';
  if (score >= 42) return 'caution';
  return 'warning';
}

function formatRatingFactorScore(score: number | null | undefined): string | undefined {
  return score == null || !Number.isFinite(score) ? undefined : `${Math.round(score)}/100`;
}

function toneToRatingImpact(tone: CampIntelTone | undefined): CampsiteRatingFactor['impact'] {
  if (tone === 'positive') return 'positive';
  if (tone === 'warning') return 'negative';
  return 'neutral';
}

function buildCampIntelRatingFactors(ranked: CampIntelRankedCandidate): CampsiteRatingFactor[] {
  const detourDistance = ranked.point.routeRelation.detourDistanceMiles;
  const routeProximityScore =
    detourDistance == null
      ? 100
      : Math.max(0, Math.min(100, Math.round(100 - Math.min(detourDistance, 5) * 16)));

  return [
    {
      label: 'Camping suitability',
      value: formatRatingFactorScore(ranked.scores.overnightSuitabilityScore),
      impact: campsiteRatingImpactFromScore(ranked.scores.overnightSuitabilityScore),
      description: ranked.overnightAssessment.summary || ranked.overnightAssessment.label,
    },
    {
      label: 'Terrain suitability',
      value: formatRatingFactorScore(ranked.scores.campabilityScore.raw),
      impact: campsiteRatingImpactFromScore(ranked.scores.campabilityScore.raw),
      description:
        ranked.scores.campabilityScore.reasons[0]?.label ??
        'Terrain appears suitable for dispersed camping.',
    },
    {
      label: 'Access confidence',
      value: formatRatingFactorScore(ranked.scores.accessScore.raw),
      impact: campsiteRatingImpactFromScore(ranked.scores.accessScore.raw),
      description:
        ranked.scores.accessScore.reasons[0]?.label ??
        'Access confidence is based on route-access signals.',
    },
    {
      label: 'Land-Use Confidence',
      value: formatRatingFactorScore(ranked.scores.complianceScore.raw),
      impact: campsiteRatingImpactFromScore(ranked.scores.complianceScore.raw),
      description:
        ranked.scores.complianceScore.reasons[0]?.label ??
        'Land-use confidence reflects available public-land and restriction signals.',
    },
    {
      label: 'Route proximity',
      value: detourDistance == null ? 'On corridor' : `${detourDistance.toFixed(1)} mi detour`,
      impact: campsiteRatingImpactFromScore(routeProximityScore),
      description: 'Route proximity is treated as an eligibility and usability signal for the campsite.',
    },
    {
      label: 'Cell coverage',
      value: `${Math.round((1 - ranked.enrichment.safety.commsDeadZoneRisk) * 100)}/100`,
      impact: toneToRatingImpact(ranked.enrichment.safety.commsDeadZoneRisk >= 0.55 ? 'warning' : 'positive'),
      description: 'Communication confidence is based on the current comms dead-zone risk estimate.',
    },
  ].slice(0, 5);
}

function confidenceLabel(confidence: CampIntelConfidence): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    default:
      return 'Low confidence';
  }
}

function confidenceFromScore(score: number): CampIntelConfidence {
  if (score >= 74) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function confidenceTitle(label: CampIntelConfidence): CampIntelEvidenceSummary['intelConfidence'] {
  switch (label) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    default:
      return 'Low';
  }
}

function isSupportFeedback(feedback: CampIntelFeedbackCode): boolean {
  return feedback === 'excellent_camp' || feedback === 'usable';
}

function isRestrictionFeedback(feedback: CampIntelFeedbackCode): boolean {
  return feedback === 'blocked' || feedback === 'inaccessible' || feedback === 'not_legal';
}

function isConcernFeedback(feedback: CampIntelFeedbackCode): boolean {
  return isRestrictionFeedback(feedback) || feedback === 'poor' || feedback === 'too_exposed' || feedback === 'too_small';
}

function formatEvidenceTypes(args: {
  feedback: CampIntelFeedbackCode[];
  isSaved: boolean;
  wasUsedBefore: boolean;
  sourceType: CampIntelRankedCandidate['point']['sourceType'];
  accessConfidenceScore: number;
}): string[] {
  const { feedback, isSaved, wasUsedBefore, sourceType, accessConfidenceScore } = args;
  const types: string[] = [];
  const add = (value: string) => {
    if (!types.includes(value)) types.push(value);
  };

  if (isSaved || feedback.some(isSupportFeedback)) add('user support');
  if (wasUsedBefore || sourceType === 'verified') add('field confirmation');
  if (feedback.some(isRestrictionFeedback)) add('restriction report');
  if (feedback.includes('inaccessible') || feedback.includes('blocked') || accessConfidenceScore >= 55) add('access note');
  if (feedback.includes('too_exposed') || feedback.includes('too_small') || feedback.includes('poor')) add('usability note');

  return types.slice(0, 4);
}

function deriveAccessLabel(args: {
  feedback: CampIntelFeedbackCode[];
  sourceType: CampIntelRankedCandidate['point']['sourceType'];
  accessConfidenceScore: number;
}): string {
  const { feedback, sourceType, accessConfidenceScore } = args;
  if (feedback.includes('blocked') || feedback.includes('inaccessible')) return 'Blocked';
  if (accessConfidenceScore >= 76) return 'Clear';
  if ((sourceType === 'route_candidate' || sourceType === 'inferred' || sourceType === 'fallback') && accessConfidenceScore >= 58) {
    return 'Likely reachable';
  }
  if (accessConfidenceScore >= 42) return 'Questionable';
  return 'Unknown';
}

function deriveRestrictionSignal(args: {
  feedback: CampIntelFeedbackCode[];
  complianceScore: number;
  complianceConfidence: CampIntelConfidence;
}): string {
  const { feedback, complianceScore, complianceConfidence } = args;
  if (feedback.includes('not_legal')) return 'Confirmed';
  if (feedback.includes('blocked') || feedback.includes('inaccessible')) return 'Reported';
  if (complianceScore < 55 || complianceConfidence === 'low') return 'Possible';
  if (complianceScore >= 70) return 'None known';
  return 'Unknown';
}

function deriveUsePressureLabel(privacyScore: number): string {
  if (!Number.isFinite(privacyScore)) return 'Unknown';
  if (privacyScore >= 70) return 'Light';
  if (privacyScore >= 45) return 'Moderate';
  return 'High';
}

function deriveCampIntelEvidenceSummary(args: {
  ranked: CampIntelRankedCandidate;
  isSaved: boolean;
  wasUsedBefore: boolean;
  feedback: CampIntelFeedbackCode[];
}): CampIntelEvidenceSummary {
  const { ranked, isSaved, wasUsedBefore, feedback } = args;
  const hasSupport = isSaved || wasUsedBefore || feedback.some(isSupportFeedback) || ranked.point.sourceType === 'saved' || ranked.point.sourceType === 'historical' || ranked.point.sourceType === 'verified';
  const hasRestriction = feedback.some(isRestrictionFeedback);
  const hasConcern = feedback.some(isConcernFeedback);
  const disputed = hasSupport && (hasRestriction || hasConcern);
  const sourceLabel: CampIntelEvidenceSummary['sourceLabel'] = disputed
    ? 'Disputed'
    : hasRestriction || ranked.scores.complianceScore.raw < 45
      ? 'Avoid / Restricted'
      : wasUsedBefore || ranked.point.sourceType === 'verified'
        ? 'Field-Confirmed'
        : hasSupport
          ? 'User-Supported'
          : 'ECS-Inferred';
  const evidenceTypes = formatEvidenceTypes({
    feedback,
    isSaved,
    wasUsedBefore,
    sourceType: ranked.point.sourceType,
    accessConfidenceScore: ranked.confidence.breakdown.accessConfidence.score,
  });
  const latestEvidence =
    evidenceTypes.length === 0
      ? 'None'
      : sourceLabel === 'Field-Confirmed'
        ? 'Last Field Report'
        : sourceLabel === 'Avoid / Restricted'
          ? 'Restriction report'
          : sourceLabel === 'Disputed'
            ? 'Conflicting reports'
            : 'User-supported evidence';
  const restrictionSignal = deriveRestrictionSignal({
    feedback,
    complianceScore: ranked.scores.complianceScore.raw,
    complianceConfidence: ranked.confidence.breakdown.complianceConfidence.label,
  });
  const access = deriveAccessLabel({
    feedback,
    sourceType: ranked.point.sourceType,
    accessConfidenceScore: ranked.confidence.breakdown.accessConfidence.score,
  });
  const concern =
    sourceLabel === 'Disputed'
      ? 'Conflicting user/data reports'
      : sourceLabel === 'Avoid / Restricted'
        ? restrictionSignal === 'Confirmed'
          ? 'restriction confirmed'
          : access === 'Blocked'
            ? 'access blocked'
            : 'restriction reported'
        : access === 'Blocked'
          ? 'access blocked'
          : restrictionSignal === 'Possible'
            ? 'restriction signal possible'
            : null;

  return {
    sourceLabel,
    intelConfidence: confidenceTitle(ranked.confidence.label),
    latestEvidence,
    evidenceTypes,
    access,
    restrictionSignal,
    landUseConfidence: confidenceTitle(ranked.confidence.breakdown.complianceConfidence.label),
    usePressure: deriveUsePressureLabel(Math.round(ranked.enrichment.desirability.privacy * 100)),
    concern,
    photoEvidenceCount: null,
    newestPhotoAgeLabel: null,
  };
}

function classificationToCategory(
  ranked: CampIntelRankedCandidate,
  isSaved: boolean,
  wasUsedBefore: boolean,
): CampIntelCategory {
  if (isSaved) return 'saved';
  if (wasUsedBefore) return 'previously_used';
  switch (ranked.classification) {
    case 'suggested':
      return 'suggested';
    case 'backup':
      return 'backup';
    case 'emergency':
      return 'emergency';
    default:
      return 'rejected';
  }
}

function categoryLabel(category: CampIntelCategory): string {
  switch (category) {
    case 'suggested':
      return 'Suggested Camp';
    case 'backup':
      return 'Backup Camp';
    case 'emergency':
      return 'Emergency Overnight';
    case 'saved':
      return 'Saved Camp';
    case 'previously_used':
      return 'Previously Used Camp';
    case 'caution':
      return 'Caution Candidate';
    default:
      return 'Rejected / Low Confidence';
  }
}

function createRow(id: string, label: string, value: string, tone?: CampIntelTone): CampIntelAssessmentRow {
  return { id, label, value, tone };
}

function riskBadgeTone(tone: CampIntelTone): CampIntelTone {
  return tone === 'neutral' ? 'caution' : tone;
}

function toCandidateAccessReasons(ranked: CampIntelRankedCandidate): string[] {
  return (ranked.point.candidate.candidateReason ?? [])
    .filter((reason) => reason === 'Remote from major roadways' || reason === 'Near drivable trail access');
}

function toMicroBadges(ranked: CampIntelRankedCandidate): CampIntelMicroBadge[] {
  const badges: CampIntelMicroBadge[] = [];
  if (ranked.scores.vehicleFitScore.raw < 55) {
    badges.push({ id: 'vehicle_fit', type: 'vehicle_fit', label: 'Vehicle fit', tone: 'caution' });
  }
  if (ranked.scores.safetyScore.raw < 55) {
    badges.push({ id: 'weather', type: 'weather', label: 'Weather caution', tone: 'warning' });
  }
  if (ranked.scores.complianceScore.raw < 55) {
    badges.push({ id: 'legal', type: 'legal', label: 'Restriction signal', tone: 'warning' });
  }
  if (ranked.scores.arrivalRiskScore >= 56) {
    badges.push({ id: 'arrival', type: 'arrival', label: 'Night arrival', tone: 'caution' });
  }
  if (ranked.enrichment.safety.commsDeadZoneRisk >= 0.55) {
    badges.push({ id: 'comms', type: 'comms', label: 'Comms issue', tone: 'caution' });
  }
  return badges.slice(0, 2);
}

function toReasonChips(ranked: CampIntelRankedCandidate): CampIntelReasonChip[] {
  return [
    ...toCandidateAccessReasons(ranked).map((label, index) => ({
      id: `access-context-${index}`,
      label,
      tone: 'positive' as const,
    })),
    ...ranked.explanation.topPositiveReasons.slice(0, 2).map((label, index) => ({
      id: `positive-${index}`,
      label,
      tone: 'positive' as const,
    })),
    ...ranked.explanation.topCautionReasons.slice(0, 2).map((label, index) => ({
      id: `caution-${index}`,
      label,
      tone: 'caution' as const,
    })),
  ].slice(0, 4);
}

function toVehicleSummary(ranked: CampIntelRankedCandidate): CampIntelVehicleSummary {
  return {
    accessLabel:
      ranked.scores.vehicleFitScore.raw >= 75
        ? 'Great fit for your current setup'
        : ranked.scores.vehicleFitScore.raw >= 55
          ? 'Reachable with caution'
          : 'Marginal fit for this vehicle',
    clearanceConfidence:
      ranked.scores.vehicleFitScore.raw >= 72 ? 'High' : ranked.scores.vehicleFitScore.raw >= 52 ? 'Moderate' : 'Low',
    wheelbaseLabel:
      ranked.enrichment.vehicleCompatibility.wheelbaseFit >= 0.7
        ? 'Comfortable'
        : ranked.enrichment.vehicleCompatibility.wheelbaseFit >= 0.5
          ? 'Manageable'
          : 'Tight',
    trailerLabel:
      !ranked.point.vehicleContext.trailerAttached
        ? 'No trailer configured'
        : ranked.enrichment.vehicleCompatibility.trailerFit >= 0.7
          ? 'Reasonable'
          : ranked.enrichment.vehicleCompatibility.trailerFit >= 0.5
            ? 'Conditional'
            : 'Not ideal',
  };
}

function toWeatherSummary(
  routeWeather: CampIntelRouteWeatherSnapshot | null,
  expeditionForecast: ExpeditionForecast | null,
): CampIntelWeatherSummary | null {
  if (!routeWeather && !expeditionForecast) return null;
  return {
    headline: routeWeather?.headline ?? expeditionForecast?.brief ?? 'Overnight weather context available',
    detail: routeWeather?.detail ?? expeditionForecast?.alerts?.[0]?.message ?? 'Forecast synthesized from current route context.',
    lowTempF: routeWeather?.lowTempF ?? null,
    windMph: routeWeather?.windMph ?? null,
    precipLabel: routeWeather?.precipLabel ?? null,
  };
}

function buildOfflineAssessment(
  ranked: CampIntelRankedCandidate,
  routeWeather: CampIntelRouteWeatherSnapshot | null,
): CampIntelOfflineAssessment | null {
  const notes: string[] = [];
  const weatherStale =
    routeWeather?.source === 'cache_stale' ||
    routeWeather?.source === 'fallback' ||
    ranked.point.onlineContext.weatherFreshnessMinutes == null ||
    ranked.point.onlineContext.weatherFreshnessMinutes >= 240;
  const complianceReduced =
    ranked.point.onlineContext.offlineStatus !== 'online' ||
    ranked.point.onlineContext.complianceConfidence < 0.6;
  const cachedRouteContext = ranked.point.onlineContext.offlineStatus !== 'online';

  if (!weatherStale && !complianceReduced && !cachedRouteContext) {
    return null;
  }

  if (weatherStale) {
    notes.push('Weather may be stale');
  }
  if (complianceReduced) {
    notes.push('Restriction signal reduced');
  }
  if (cachedRouteContext) {
    notes.push('Recommendation based on cached route and terrain inputs');
  }

  return {
    title: 'Offline Assessment',
    notes,
    weatherStale,
    complianceConfidenceReduced: complianceReduced,
    cachedRouteContext,
  };
}

function buildTrustNotes(
  ranked: CampIntelRankedCandidate,
  offlineAssessment: CampIntelOfflineAssessment | null,
): string[] {
  const notes = [...(offlineAssessment?.notes ?? [])];
  const { candidate } = ranked.point;

  if (candidate.criteriaBroadened) {
    notes.push('Broader campsite corridor criteria were used.');
  }
  if (candidate.credibilityTier === 'possible_stop') {
    notes.push('This is a possible stop/camp candidate, not a confirmed campsite.');
  }

  if (ranked.enrichment.compliance.legality === 'uncertain') {
    notes.push('Verify signs, land-use guidance, and local conditions');
  }
  if (ranked.enrichment.terrain.slopeRisk >= 0.5) {
    notes.push('Slope confidence remains limited');
  }
  if (ranked.point.onlineContext.routeCertainty < 0.6) {
    notes.push('Approach certainty reduced');
  }

  return Array.from(new Set(notes)).slice(0, 4);
}

function toVehicleAssessment(ranked: CampIntelRankedCandidate): CampIntelAssessmentRow[] {
  const summary = toVehicleSummary(ranked);
  const arrivalDifficulty =
    ranked.enrichment.vehicleCompatibility.nighttimeArrivalDifficulty >= 0.7
      ? 'High'
      : ranked.enrichment.vehicleCompatibility.nighttimeArrivalDifficulty >= 0.45
        ? 'Moderate'
        : 'Low';
  const departureDifficulty =
    ranked.enrichment.vehicleCompatibility.departureDifficulty >= 0.7
      ? 'High'
      : ranked.enrichment.vehicleCompatibility.departureDifficulty >= 0.45
        ? 'Moderate'
        : 'Low';

  return [
    createRow('access', 'Access suitability', summary.accessLabel, scoreToTone(ranked.scores.vehicleFitScore.raw)),
    createRow('clearance', 'Clearance confidence', summary.clearanceConfidence, scoreToTone(ranked.scores.vehicleFitScore.raw)),
    createRow('wheelbase', 'Wheelbase / maneuver', summary.wheelbaseLabel, scoreToTone(ranked.scores.vehicleFitScore.raw)),
    createRow('trailer', 'Trailer suitability', summary.trailerLabel, summary.trailerLabel === 'Reasonable' ? 'positive' : summary.trailerLabel === 'Conditional' ? 'caution' : 'warning'),
    createRow('night_arrival', 'Nighttime arrival', arrivalDifficulty, arrivalDifficulty === 'Low' ? 'positive' : arrivalDifficulty === 'Moderate' ? 'caution' : 'warning'),
    createRow('departure', 'Departure difficulty', departureDifficulty, departureDifficulty === 'Low' ? 'positive' : departureDifficulty === 'Moderate' ? 'caution' : 'warning'),
  ];
}

function toConfidenceBreakdown(ranked: CampIntelRankedCandidate): CampIntelConfidenceBreakdown {
  return ranked.confidence.breakdown;
}

function toOvernightOutlook(
  ranked: CampIntelRankedCandidate,
  routeWeather: CampIntelRouteWeatherSnapshot | null,
): CampIntelAssessmentRow[] {
  const wind = routeWeather?.windMph != null ? `${Math.round(routeWeather.windMph)} mph` : 'Limited';
  const lowTemp = routeWeather?.lowTempF != null ? `${Math.round(routeWeather.lowTempF)}F` : 'Unknown';
  const precip = routeWeather?.precipLabel ?? 'No clear signal';
  const floodRisk =
    ranked.enrichment.terrain.floodRisk >= 0.65
      ? 'Elevated'
      : ranked.enrichment.terrain.floodRisk >= 0.4
        ? 'Moderate'
        : 'Low';
  const remoteness =
    ranked.enrichment.safety.commsDeadZoneRisk >= 0.7
      ? 'Remote / no comms'
      : ranked.enrichment.safety.commsDeadZoneRisk >= 0.45
        ? 'Remote with weak comms'
        : 'Reachable';

  return [
    createRow('weather', 'Overnight weather', ranked.scores.safetyScore.raw >= 72 ? 'Manageable' : ranked.scores.safetyScore.raw >= 55 ? 'Watch conditions' : 'Risk elevated', scoreToTone(ranked.scores.safetyScore.raw)),
    createRow('low_temp', 'Low temperature', lowTemp, 'neutral'),
    createRow('wind', 'Wind', wind, routeWeather?.windMph != null && routeWeather.windMph >= 22 ? 'warning' : routeWeather?.windMph != null && routeWeather.windMph >= 14 ? 'caution' : 'positive'),
    createRow('precip', 'Precipitation concern', precip, precip.toLowerCase().includes('storm') || precip.toLowerCase().includes('rain') ? 'caution' : 'neutral'),
    createRow('flood', 'Flood / wash concern', floodRisk, floodRisk === 'Low' ? 'positive' : floodRisk === 'Moderate' ? 'caution' : 'warning'),
    createRow('comms', 'Remoteness / comms', remoteness, remoteness === 'Reachable' ? 'positive' : remoteness === 'Remote with weak comms' ? 'caution' : 'warning'),
  ];
}

function toResourceImplications(ranked: CampIntelRankedCandidate): CampIntelAssessmentRow[] {
  const res = ranked.enrichment.resources;
  return [
    createRow('fuel', 'Nearest fuel estimate', res.nearestFuelEstimateMiles != null ? `${Math.round(res.nearestFuelEstimateMiles)} mi` : 'Unknown', res.nearestFuelEstimateMiles != null && res.nearestFuelEstimateMiles <= 20 ? 'positive' : res.nearestFuelEstimateMiles != null && res.nearestFuelEstimateMiles <= 45 ? 'neutral' : 'caution'),
    createRow('bailout', 'Bailout / road estimate', res.bailoutRoadEstimateMiles != null ? `${Math.round(res.bailoutRoadEstimateMiles)} mi` : 'Unknown', res.bailoutRoadEstimateMiles != null && res.bailoutRoadEstimateMiles <= 6 ? 'positive' : res.bailoutRoadEstimateMiles != null && res.bailoutRoadEstimateMiles <= 15 ? 'caution' : 'warning'),
    createRow('town', 'Nearest town estimate', res.nearestTownEstimateMiles != null ? `${Math.round(res.nearestTownEstimateMiles)} mi` : 'Unknown', 'neutral'),
    createRow('comms', 'Comms confidence', `${Math.round(res.commsConfidence * 100)}%`, res.commsConfidence >= 0.7 ? 'positive' : res.commsConfidence >= 0.45 ? 'caution' : 'warning'),
    createRow('detour', 'Route detour cost', res.detourDistanceMiles != null ? `${res.detourDistanceMiles.toFixed(1)} mi` : 'On corridor', res.detourDistanceMiles != null && res.detourDistanceMiles > 1.2 ? 'caution' : 'positive'),
  ];
}

export function mapRankedCandidateToSite(args: {
  ranked: CampIntelRankedCandidate;
  preferences: CampIntelPreferenceState;
  routeWeather: CampIntelRouteWeatherSnapshot | null;
  expeditionForecast: ExpeditionForecast | null;
}): CampIntelSite {
  const { ranked, preferences, routeWeather, expeditionForecast } = args;
  const isSaved = preferences.savedCampIds.includes(ranked.point.id);
  const wasUsedBefore = preferences.usedCampIds.includes(ranked.point.id);
  const feedback = preferences.feedbackByCampId[ranked.point.id] ?? [];
  const category = classificationToCategory(ranked, isSaved, wasUsedBefore);
  const confidence = ranked.confidence.label;
  const vehicleSummary = toVehicleSummary(ranked);
  const offlineAssessment = buildOfflineAssessment(ranked, routeWeather);
  const trustNotes = buildTrustNotes(ranked, offlineAssessment);
  const confidenceBreakdown = toConfidenceBreakdown(ranked);
  const rating = campsiteRatingFromScore(ranked.scores.overallScore);
  const ratingFactors = buildCampIntelRatingFactors(ranked);
  const accessReasons = toCandidateAccessReasons(ranked);
  const topPositiveReasons = Array.from(new Set([...accessReasons, ...ranked.explanation.topPositiveReasons]));
  const evidenceSummary = deriveCampIntelEvidenceSummary({
    ranked,
    isSaved,
    wasUsedBefore,
    feedback,
  });

  return {
    id: ranked.point.id,
    label: ranked.point.label,
    coordinate: ranked.point.coordinate,
    category,
    categoryLabel: categoryLabel(category),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    confidenceScore: ranked.confidence.score,
    rating,
    ratingFactors,
    overallScore: ranked.scores.overallScore,
    scoreBreakdown: {
      access: ranked.scores.accessScore.raw,
      campability: ranked.scores.campabilityScore.raw,
      vehicleFit: ranked.scores.vehicleFitScore.raw,
      safety: ranked.scores.safetyScore.raw,
      compliance: ranked.scores.complianceScore.raw,
      desirability: ranked.scores.desirabilityScore.raw,
    },
    quickVerdict: ranked.recommendation.quickVerdict,
    explanationReasons: Array.from(new Set([...accessReasons, ...ranked.explanation.whySuggested])),
    whyNotTopRanked: ranked.explanation.whyNotTopRanked,
    riskFlags: ranked.riskFlags,
    reasonChips: toReasonChips(ranked),
    microBadges: toMicroBadges(ranked),
    vehicleAssessment: toVehicleAssessment(ranked),
    overnightOutlook: toOvernightOutlook(ranked, routeWeather),
    resourceImplications: toResourceImplications(ranked),
    weatherSummary: toWeatherSummary(routeWeather, expeditionForecast),
    vehicleSummary,
    offlineStatus: ranked.point.onlineContext.offlineStatus,
    offlineAssessment,
    sourceType: ranked.point.sourceType,
    evidenceSummary,
    detourDistanceMiles: ranked.point.routeRelation.detourDistanceMiles,
    sourceRouteId: ranked.point.routeRelation.sourceRouteId,
    sourceRouteName: ranked.point.routeRelation.sourceRouteName,
    segmentLabel: ranked.point.routeRelation.segmentRange,
    fallbackStage: ranked.point.candidate.fallbackStage,
    criteriaBroadened: ranked.point.candidate.criteriaBroadened,
    credibilityTier: ranked.point.candidate.credibilityTier,
    isSaved,
    wasUsedBefore,
    classification: ranked.classification,
    missionMode: ranked.point.missionContext.missionMode,
    viabilityGateStatus: ranked.viability.viabilityGateStatus,
    isViableCandidate: ranked.viability.isViableCandidate,
    failedViabilityReasons: ranked.viability.failedViabilityReasons,
    arrivalRiskScore: ranked.scores.arrivalRiskScore,
    overnightSuitabilityScore: ranked.scores.overnightSuitabilityScore,
    departureRiskScore: ranked.scores.departureRiskScore,
    overnightStabilityScore: ranked.scores.overnightStabilityScore,
    arrivalAssessment: ranked.arrivalAssessment,
    overnightAssessment: ranked.overnightAssessment,
    departureAssessment: ranked.departureAssessment,
    darknessAdjustmentState: ranked.point.missionContext.darknessAdjustmentState,
    confidenceBreakdown,
    unresolvedUnknowns: ranked.confidence.unknowns,
    recommendationSummary: ranked.recommendation.summaryLine,
    topPositiveReasons,
    topCautionReasons: ranked.explanation.topCautionReasons,
    trustNotes,
    feedback,
    compareMetrics: {
      arrivalRiskScore: ranked.scores.arrivalRiskScore,
      overnightSuitabilityScore: ranked.scores.overnightSuitabilityScore,
      departureRiskScore: ranked.scores.departureRiskScore,
      confidenceScore: ranked.confidence.score,
      vehicleFitScore: ranked.scores.vehicleFitScore.raw,
      windExposureScore: Math.round(ranked.enrichment.safety.overnightWindRisk * 100),
      routeDetourMiles: ranked.enrichment.resources.detourDistanceMiles,
      bailoutDistanceMiles: ranked.enrichment.resources.bailoutRoadEstimateMiles,
      fuelDistanceMiles: ranked.enrichment.resources.nearestFuelEstimateMiles,
      privacyScore: Math.round(ranked.enrichment.desirability.privacy * 100),
      shelterScore: Math.round(ranked.enrichment.terrain.shelter * 100),
      complianceCertaintyScore: ranked.confidence.breakdown.complianceConfidence.score,
    },
  };
}

function toSummaryCandidate(site: CampIntelSite | null | undefined): CampIntelStructuredSummaryCandidate | null {
  if (!site) return null;
  return {
    id: site.id,
    label: site.label,
    category: site.category,
    categoryLabel: site.categoryLabel,
    confidence: site.confidence,
    confidenceLabel: site.confidenceLabel,
    quickVerdict: site.quickVerdict,
    detourDistanceMiles: site.detourDistanceMiles,
    segmentLabel: site.segmentLabel,
    overallScore: site.overallScore,
  };
}

export function buildCampIntelStructuredSummary(args: {
  engineResult: CampIntelEngineResult;
  sites: CampIntelSite[];
  routeWeather: CampIntelRouteWeatherSnapshot | null;
  cached?: boolean;
}): CampIntelStructuredSummary {
  const { engineResult, sites, routeWeather, cached = false } = args;
  const viable = sites.filter((site) => site.classification !== 'rejected_low_confidence');
  const suggested = viable.filter((site) => site.classification === 'suggested');
  const backups = viable.filter((site) => site.classification === 'backup');
  const emergency = viable.filter((site) => site.classification === 'emergency');
  const best = viable[0] ?? null;
  const bestShelteredRanked =
    engineResult.rankedCandidates
      .filter((candidate) => viable.some((site) => site.id === candidate.point.id))
      .sort((a, b) =>
        b.enrichment.terrain.shelter - a.enrichment.terrain.shelter ||
        b.scores.safetyScore.raw - a.scores.safetyScore.raw ||
        b.scores.overallScore - a.scores.overallScore,
      )[0] ?? null;
  const bestSheltered =
    bestShelteredRanked != null
      ? viable.find((site) => site.id === bestShelteredRanked.point.id) ?? null
      : null;
  const stopBeforeDark = viable.some(
    (site) =>
      site.classification === 'emergency' ||
      site.arrivalRiskScore >= 64 ||
      site.quickVerdict.toLowerCase().includes('after dark'),
  );
  const lowConfidenceBeyondTop = viable.slice(1).some((site) => site.confidence === 'low');
  const criteriaBroadened = viable.some((site) => site.criteriaBroadened);
  const broadenedCriteriaNotice = viable.some((site) => site.credibilityTier === 'possible_stop')
    ? CAMPSITE_UI_NOTICE_LOWER_CONFIDENCE
    : criteriaBroadened
      ? CAMPSITE_UI_NOTICE_BROADER
      : null;
  const offlineAssessment =
    viable.find((site) => site.offlineAssessment)?.offlineAssessment ??
    (cached
      ? {
          title: 'Offline Assessment',
          notes: [
            'Recommendation based on cached route and terrain inputs',
            'Restriction signal reduced',
          ],
          weatherStale: routeWeather?.source !== 'live',
          complianceConfidenceReduced: true,
          cachedRouteContext: true,
        }
      : null);

  const routeGuidance: string[] = [];
  if (broadenedCriteriaNotice) {
    routeGuidance.push(broadenedCriteriaNotice);
  }
  if (viable.length >= 2 && best?.detourDistanceMiles != null) {
    const next = viable[1] ?? null;
    routeGuidance.push(
      `${viable.length} viable overnight camps ahead. ${best.categoryLabel} is the current top match.`,
    );
    if (next && next.id !== best?.id) {
      routeGuidance.push(
        `${next.categoryLabel} at ${next.segmentLabel ?? next.label} remains a fallback if timing or access shifts.`,
      );
    }
  } else if (best) {
    routeGuidance.push(`${best.categoryLabel} is the strongest current overnight option.`);
  } else {
    routeGuidance.push('No high-confidence camp recommendation is currently available.');
  }

  if (bestSheltered && best && bestSheltered.id !== best.id) {
    routeGuidance.push(`Best sheltered option is ${bestSheltered.label}.`);
  }
  if (stopBeforeDark) {
    routeGuidance.push('Recommend stopping before dark if the final approach tightens.');
  }
  if (lowConfidenceBeyondTop) {
    routeGuidance.push('Down-route alternatives fall off in confidence.');
  }

  const trustNotes = Array.from(new Set(viable.flatMap((site) => site.trustNotes))).slice(0, 4);
  const headline =
    best != null
      ? `${best.categoryLabel} ahead with ${best.confidenceLabel.toLowerCase()} support`
      : offlineAssessment
        ? 'Camp Intel operating from cached route context'
        : 'Camp Intel has no viable overnight recommendation';
  const summaryLine =
    best != null
      ? `${best.quickVerdict}. ${best.recommendationSummary}`
      : offlineAssessment
        ? 'Use cached route-aware camp results with reduced trust in freshness and restriction signals.'
        : 'Current route and terrain context do not support a strong camp recommendation.';

  return {
    available: viable.length > 0,
    generatedAt: engineResult.generatedAt ?? null,
    missionMode: engineResult.missionMode ?? null,
    viableCount: viable.length,
    suggestedCount: suggested.length,
    backupCount: backups.length,
    emergencyCount: emergency.length,
    headline,
    summaryLine,
    routeGuidance: routeGuidance.slice(0, 4),
    trustNotes,
    offlineAssessment,
    bestCandidate: toSummaryCandidate(best),
    bestShelteredCandidate: toSummaryCandidate(bestSheltered),
    stopBeforeDark,
    lowConfidenceBeyondTop,
    criteriaBroadened,
    broadenedCriteriaNotice,
  };
}

export function downgradeCampIntelSiteForOffline(site: CampIntelSite): CampIntelSite {
  const downgradedScore = Math.max(24, Math.round(site.confidenceScore - 18));
  const downgradedConfidence = confidenceFromScore(downgradedScore);
  const offlineAssessment: CampIntelOfflineAssessment = {
    title: 'Offline Assessment',
    notes: Array.from(
      new Set([
        'Recommendation based on cached route and terrain inputs',
        'Restriction signal reduced',
        ...(site.weatherSummary ? ['Weather may be stale'] : []),
      ]),
    ),
    weatherStale: !!site.weatherSummary,
    complianceConfidenceReduced: true,
    cachedRouteContext: true,
  };

  return {
    ...site,
    confidence: downgradedConfidence,
    confidenceLabel: confidenceLabel(downgradedConfidence),
    confidenceScore: downgradedScore,
    offlineStatus: 'offline_estimated',
    offlineAssessment,
    trustNotes: Array.from(new Set([...(site.trustNotes ?? []), ...offlineAssessment.notes])).slice(0, 4),
  };
}

export function toCampIntelMarkerPayload(site: CampIntelSite, selected = false): CampIntelMarkerPayload {
  return {
    id: site.id,
    latitude: site.coordinate.latitude,
    longitude: site.coordinate.longitude,
    title: site.label,
    subtitle: site.quickVerdict,
    category: site.category,
    confidence: site.confidence,
    confidenceScore: site.confidenceScore,
    rating: site.rating ?? campsiteRatingFromScore(site.overallScore),
    score: site.overallScore,
    ratingFactors: site.ratingFactors ?? [],
    selected,
    badges: site.microBadges.map((badge) => ({
      label: badge.label,
      tone: riskBadgeTone(badge.tone),
    })),
  };
}
