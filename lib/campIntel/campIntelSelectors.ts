import type { ExpeditionForecast } from '../expeditionForecastEngine';
import type {
  CampIntelAssessmentRow,
  CampIntelCategory,
  CampIntelConfidence,
  CampIntelConfidenceBreakdown,
  CampIntelEngineResult,
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

function toMicroBadges(ranked: CampIntelRankedCandidate): CampIntelMicroBadge[] {
  const badges: CampIntelMicroBadge[] = [];
  if (ranked.scores.vehicleFitScore.raw < 55) {
    badges.push({ id: 'vehicle_fit', type: 'vehicle_fit', label: 'Vehicle fit', tone: 'caution' });
  }
  if (ranked.scores.safetyScore.raw < 55) {
    badges.push({ id: 'weather', type: 'weather', label: 'Weather caution', tone: 'warning' });
  }
  if (ranked.scores.complianceScore.raw < 55) {
    badges.push({ id: 'legal', type: 'legal', label: 'Legal uncertainty', tone: 'warning' });
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
    notes.push('Compliance confidence reduced');
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

  if (ranked.enrichment.compliance.legality === 'uncertain') {
    notes.push('Verify signs and local conditions');
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

  return {
    id: ranked.point.id,
    label: ranked.point.label,
    coordinate: ranked.point.coordinate,
    category,
    categoryLabel: categoryLabel(category),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    confidenceScore: ranked.confidence.score,
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
    explanationReasons: ranked.explanation.whySuggested,
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
    detourDistanceMiles: ranked.point.routeRelation.detourDistanceMiles,
    sourceRouteId: ranked.point.routeRelation.sourceRouteId,
    sourceRouteName: ranked.point.routeRelation.sourceRouteName,
    segmentLabel: ranked.point.routeRelation.segmentRange,
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
    topPositiveReasons: ranked.explanation.topPositiveReasons,
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
  const offlineAssessment =
    viable.find((site) => site.offlineAssessment)?.offlineAssessment ??
    (cached
      ? {
          title: 'Offline Assessment',
          notes: [
            'Recommendation based on cached route and terrain inputs',
            'Compliance confidence reduced',
          ],
          weatherStale: routeWeather?.source !== 'live',
          complianceConfidenceReduced: true,
          cachedRouteContext: true,
        }
      : null);

  const routeGuidance: string[] = [];
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
        ? 'Use cached route-aware camp results with reduced trust in freshness and compliance.'
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
        'Compliance confidence reduced',
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
    selected,
    badges: site.microBadges.map((badge) => ({
      label: badge.label,
      tone: riskBadgeTone(badge.tone),
    })),
  };
}
