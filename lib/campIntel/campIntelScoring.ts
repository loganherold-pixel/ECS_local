import type {
  CampIntelCandidateEnrichment,
  CampIntelCandidatePoint,
  CampIntelConfidence,
  CampIntelConfidenceBreakdown,
  CampIntelConfidenceDetail,
  CampIntelConfidenceMetric,
  CampIntelDimensionScores,
  CampIntelReasonContribution,
  CampIntelScoreDimensionResult,
  CampIntelSubAssessment,
  CampIntelUnknownType,
  CampIntelViabilityResult,
  CampIntelWeightProfile,
} from './campIntelTypes';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value));
}

function confidenceLabel(score: number): CampIntelConfidence {
  if (score >= 76) return 'high';
  if (score >= 52) return 'medium';
  return 'low';
}

function toneFromRisk(score: number): CampIntelSubAssessment['tone'] {
  if (score <= 32) return 'positive';
  if (score <= 56) return 'caution';
  return 'warning';
}

function toneFromSuitability(score: number): CampIntelSubAssessment['tone'] {
  if (score >= 72) return 'positive';
  if (score >= 52) return 'caution';
  return 'warning';
}

function makeReason(
  id: string,
  dimension: CampIntelReasonContribution['dimension'],
  kind: CampIntelReasonContribution['kind'],
  label: string,
  impact: number,
  tone: CampIntelReasonContribution['tone'],
): CampIntelReasonContribution {
  return { id, dimension, kind, label, impact, tone };
}

function buildResult(raw: number, weight: number, reasons: CampIntelReasonContribution[]): CampIntelScoreDimensionResult {
  return {
    raw: roundScore(raw),
    weighted: Number((clamp(raw) * weight).toFixed(2)),
    weight,
    reasons,
  };
}

function buildConfidenceMetric(score: number): CampIntelConfidenceMetric {
  const normalized = roundScore(score);
  return {
    score: normalized,
    label: confidenceLabel(normalized),
  };
}

function scoreAccess(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.routeAccess;
  const detourMiles = ctx.detourCostMiles ?? point.routeRelation.detourDistanceMiles ?? 0;
  const darknessFactor = point.missionContext.lastLightFactor;
  const raw =
    100
    - ctx.trailRoughness * 18
    - ctx.steepness * 16
    - ctx.finalApproachComplexity * (20 + darknessFactor * 8)
    - ctx.waterCrossingRisk * 10
    - ctx.widthRestrictionRisk * 14
    - ctx.obstacleDensity * 10
    - ctx.routeAmbiguity * (12 + darknessFactor * 10)
    - ctx.darknessPenalty * (12 + darknessFactor * 12)
    - Math.min(14, detourMiles * (7 + darknessFactor * 3))
    + ctx.turnaroundViability * (12 + darknessFactor * 6);

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.turnaroundViability >= 0.7) {
    reasons.push(makeReason('access_turnaround_good', 'access', 'positive', 'Turnaround looks workable for a controlled departure.', 10, 'positive'));
  }
  if (ctx.detourCostMiles != null && ctx.detourCostMiles <= 0.35) {
    reasons.push(makeReason('access_detour_short', 'access', 'positive', 'Detour from the active route appears small.', 8, 'positive'));
  }
  if (ctx.finalApproachComplexity >= 0.6) {
    reasons.push(makeReason('access_approach_complex', 'access', 'caution', point.missionContext.darknessAdjustmentState === 'daylight_normal' ? 'Final approach may be technical for your setup.' : 'Technical final approach loses confidence late in the day.', 15, 'warning'));
  }
  if (ctx.routeAmbiguity >= 0.55) {
    reasons.push(makeReason('access_route_ambiguous', 'access', 'caution', 'Final approach confidence is limited by route ambiguity.', 11, 'caution'));
  }
  if (point.missionContext.darknessAdjustmentState !== 'daylight_normal' && ctx.darknessPenalty >= 0.45) {
    reasons.push(makeReason('access_darkness', 'access', 'caution', point.missionContext.darknessAdjustmentState === 'after_dark' ? 'This approach is not recommended after dark.' : 'Best reached before sunset while approach details remain visible.', 14, 'warning'));
  }

  return buildResult(raw, weight, reasons);
}

function scoreCampability(enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.terrain;
  const raw =
    ctx.levelness * 24
    + ctx.usableFootprint * 20
    + ctx.shelter * 12
    + ctx.drainage * 12
    + ctx.firmness * 10
    + ctx.parkingSpace * 12
    - ctx.floodRisk * 12
    - ctx.ridgelineExposure * 8
    + 30;

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.levelness >= 0.7) {
    reasons.push(makeReason('camp_level', 'campability', 'positive', 'Terrain appears relatively level for overnight positioning.', 12, 'positive'));
  }
  if (ctx.usableFootprint >= 0.7) {
    reasons.push(makeReason('camp_footprint', 'campability', 'positive', 'Usable footprint looks large enough for a clean camp setup.', 10, 'positive'));
  }
  if (ctx.floodRisk >= 0.55) {
    reasons.push(makeReason('camp_flood', 'campability', 'caution', 'Drainage and wash exposure reduce overnight stability.', 12, 'warning'));
  }
  if (ctx.ridgelineExposure >= 0.6) {
    reasons.push(makeReason('camp_exposed', 'campability', 'caution', 'Open exposure may make the site less comfortable overnight.', 8, 'caution'));
  }

  return buildResult(raw, weight, reasons);
}

function scoreVehicleFit(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.vehicleCompatibility;
  const darknessPenalty = point.missionContext.lastLightFactor * 8;
  const raw =
    20
    + ctx.widthFit * 18
    + ctx.clearanceFit * 22
    + ctx.wheelbaseFit * 16
    + ctx.trailerFit * 14
    - ctx.nighttimeArrivalDifficulty * (12 + darknessPenalty)
    - ctx.departureDifficulty * 10;

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.clearanceFit >= 0.72) {
    reasons.push(makeReason('vehicle_clearance_good', 'vehicle_fit', 'positive', 'Pullout appears workable for your configured clearance.', 11, 'positive'));
  }
  if (ctx.trailerFit <= 0.45 && point.vehicleContext.trailerAttached) {
    reasons.push(makeReason('vehicle_trailer_limit', 'vehicle_fit', 'caution', 'Trailer maneuver margin looks limited at this site.', 12, 'warning'));
  }
  if (ctx.wheelbaseFit <= 0.45) {
    reasons.push(makeReason('vehicle_wheelbase_limit', 'vehicle_fit', 'caution', 'Longer wheelbase vehicles may need extra care on the final approach.', 9, 'caution'));
  }
  if (ctx.nighttimeArrivalDifficulty >= 0.6) {
    reasons.push(makeReason('vehicle_night_arrival', 'vehicle_fit', 'caution', point.missionContext.darknessAdjustmentState === 'daylight_normal' ? 'Night arrival may be awkward for your current setup.' : 'Late-day arrival confidence is limited for your current setup.', 10, 'warning'));
  }

  return buildResult(raw, weight, reasons);
}

function scoreSafety(enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.safety;
  const raw =
    100
    - ctx.overnightWindRisk * 18
    - ctx.precipitationRisk * 18
    - ctx.visibilityRisk * 10
    - ctx.remotenessRisk * 10
    - ctx.bailoutDifficulty * 16
    - ctx.commsDeadZoneRisk * 10;

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.overnightWindRisk <= 0.35 && ctx.precipitationRisk <= 0.35) {
    reasons.push(makeReason('safety_weather_stable', 'safety', 'positive', 'Overnight weather exposure appears manageable.', 10, 'positive'));
  }
  if (ctx.bailoutDifficulty <= 0.35) {
    reasons.push(makeReason('safety_bailout_ok', 'safety', 'positive', 'Bailout distance remains reasonable if conditions change.', 8, 'positive'));
  }
  if (ctx.overnightWindRisk >= 0.55) {
    reasons.push(makeReason('safety_wind', 'safety', 'caution', 'Overnight wind exposure is elevated here.', 12, 'warning'));
  }
  if (ctx.commsDeadZoneRisk >= 0.6) {
    reasons.push(makeReason('safety_comms', 'safety', 'caution', 'Comms confidence is limited at this location.', 8, 'caution'));
  }

  return buildResult(raw, weight, reasons);
}

function scoreCompliance(enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.compliance;
  const legalityBase =
    ctx.legality === 'likely_suitable'
      ? 82
      : ctx.legality === 'uncertain'
        ? 54
        : 18;
  const raw =
    legalityBase
    - ctx.privateLandRisk * 16
    - ctx.protectedAreaRisk * 20
    - ctx.roadEdgeRestrictionRisk * 14
    + ctx.landUseConfidence * 12;

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.legality === 'likely_suitable' && ctx.landUseConfidence >= 0.6) {
    reasons.push(makeReason('compliance_likely_ok', 'compliance', 'positive', 'Land-use context looks likely suitable for dispersed overnight use.', 10, 'positive'));
  }
  if (ctx.legality === 'uncertain') {
    reasons.push(makeReason('compliance_uncertain', 'compliance', 'caution', 'Camping legality is uncertain here.', 14, 'warning'));
  }
  if (ctx.legality === 'likely_restricted' || ctx.protectedAreaRisk >= 0.65) {
    reasons.push(makeReason('compliance_restricted', 'compliance', 'caution', 'Protected or restricted land signals reduce confidence in overnight use.', 20, 'warning'));
  }

  return buildResult(raw, weight, reasons);
}

function scoreDesirability(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment, weight: number): CampIntelScoreDimensionResult {
  const ctx = enrichment.desirability;
  const darknessPenalty = point.missionContext.lastLightFactor * 18;
  const raw =
    25
    + ctx.privacy * 20
    + ctx.scenicQuality * (22 - darknessPenalty * 0.35)
    + ctx.shade * 10
    + ctx.sunriseExposure * 8
    + ctx.hiddenGemsBonus * (15 - darknessPenalty * 0.22)
    + enrichment.terrain.shelter * 8
    - enrichment.terrain.ridgelineExposure * 8;

  const reasons: CampIntelReasonContribution[] = [];
  if (ctx.privacy >= 0.7) {
    reasons.push(makeReason('desire_privacy', 'desirability', 'positive', 'The site appears to offer stronger privacy than nearby pullouts.', 10, 'positive'));
  }
  if (ctx.scenicQuality >= 0.7) {
    reasons.push(makeReason('desire_scenic', 'desirability', 'positive', 'Scenic potential is stronger than average for this corridor.', 10, 'positive'));
  }
  if (ctx.hiddenGemsBonus >= 0.55) {
    reasons.push(makeReason('desire_hidden_gem', 'desirability', 'positive', 'Nearby route context increases desirability for an overnight stop.', 8, 'info'));
  }
  if (enrichment.terrain.ridgelineExposure >= 0.65) {
    reasons.push(makeReason('desire_exposed', 'desirability', 'caution', 'Open exposure reduces comfort even if the site is usable.', 7, 'caution'));
  }
  if (point.missionContext.darknessAdjustmentState !== 'daylight_normal' && ctx.scenicQuality >= 0.65) {
    reasons.push(makeReason('desire_darkness_tradeoff', 'desirability', 'caution', 'Scenic benefit drops behind practical arrival needs late in the day.', 9, 'info'));
  }

  return buildResult(raw, weight, reasons);
}

function resolveUnknowns(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment): CampIntelUnknownType[] {
  const unknowns: CampIntelUnknownType[] = [];
  if (point.onlineContext.terrainConfidence < 0.55) unknowns.push('terrain_confidence');
  if (point.onlineContext.weatherFreshnessMinutes == null || point.onlineContext.weatherFreshnessMinutes > 180) {
    unknowns.push('weather_freshness');
  }
  if (point.onlineContext.complianceConfidence < 0.55) unknowns.push('compliance_data');
  if (point.vehicleContext.source === 'unavailable') unknowns.push('vehicle_state');
  if (point.onlineContext.routeCertainty < 0.55) unknowns.push('route_certainty');
  if (point.resourceContext.fuelRangeMiles == null && point.resourceContext.fuelPercent == null) {
    unknowns.push('resource_state');
  }
  if (enrichment.terrain.usableFootprint < 0.45) unknowns.push('site_footprint');
  if (enrichment.resources.commsConfidence < 0.45) unknowns.push('comms_context');
  return Array.from(new Set(unknowns));
}

function scoreWeatherConfidence(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment): number {
  const freshnessMinutes = point.onlineContext.weatherFreshnessMinutes;
  const freshnessBase =
    freshnessMinutes == null
      ? 34
      : freshnessMinutes <= 45
        ? 92
        : freshnessMinutes <= 120
          ? 78
          : freshnessMinutes <= 240
            ? 58
            : 38;
  return roundScore(freshnessBase - enrichment.safety.precipitationRisk * 8);
}

export function scoreCampIntelConfidence(
  point: CampIntelCandidatePoint,
  enrichment: CampIntelCandidateEnrichment,
  weightProfile: CampIntelWeightProfile,
): CampIntelConfidenceDetail {
  const unknowns = resolveUnknowns(point, enrichment);
  const penalties: CampIntelReasonContribution[] = [];

  const terrainConfidence = buildConfidenceMetric(
    point.onlineContext.terrainConfidence * 100 - enrichment.terrain.slopeRisk * 10,
  );
  const accessConfidence = buildConfidenceMetric(
    ((point.onlineContext.routeCertainty * 0.5) +
      ((1 - enrichment.routeAccess.routeAmbiguity) * 0.3) +
      ((1 - enrichment.routeAccess.finalApproachComplexity) * 0.2)) * 100
      - point.missionContext.lastLightFactor * 8,
  );
  const complianceConfidence = buildConfidenceMetric(
    point.onlineContext.complianceConfidence * 100 - enrichment.compliance.privateLandRisk * 12,
  );
  const weatherConfidence = buildConfidenceMetric(scoreWeatherConfidence(point, enrichment));
  const vehicleSourcePenalty =
    point.vehicleContext.source === 'live'
      ? 0
      : point.vehicleContext.source === 'profile'
        ? 8
        : point.vehicleContext.source === 'manual' || point.vehicleContext.source === 'derived'
          ? 14
          : 24;
  const vehicleFitConfidence = buildConfidenceMetric(
    92 - vehicleSourcePenalty - enrichment.vehicleCompatibility.nighttimeArrivalDifficulty * 10,
  );
  const routeConfidence = buildConfidenceMetric(
    ((point.onlineContext.routeCertainty * 0.72) +
      ((point.routeRelation.detourCostScore != null ? 1 - point.routeRelation.detourCostScore : 0.6) * 0.12) +
      ((point.routeRelation.segmentIndex != null ? 1 : 0.55) * 0.16)) * 100,
  );

  let score =
    terrainConfidence.score * 0.16 +
    accessConfidence.score * 0.18 +
    complianceConfidence.score * 0.18 +
    weatherConfidence.score * 0.14 +
    vehicleFitConfidence.score * 0.16 +
    routeConfidence.score * 0.18;

  const candidateConfidencePenalty =
    point.candidate.confidence === 'HIGH' ? 0 : point.candidate.confidence === 'MEDIUM' ? 10 : 22;
  score -= candidateConfidencePenalty;
  if (candidateConfidencePenalty > 0) {
    penalties.push(
      makeReason(
        'confidence_candidate',
        'confidence',
        'unknown',
        point.candidate.confidence === 'LOW'
          ? 'Base campsite confidence is low for this route segment.'
          : 'Base campsite confidence is moderate rather than fully confirmed.',
        candidateConfidencePenalty,
        point.candidate.confidence === 'LOW' ? 'warning' : 'caution',
      ),
    );
  }

  if (terrainConfidence.score < 60) {
    penalties.push(makeReason('confidence_terrain', 'confidence', 'unknown', 'Terrain confidence is limited for this candidate.', 12, 'caution'));
  }
  if (accessConfidence.score < 62) {
    penalties.push(makeReason('confidence_access', 'confidence', 'unknown', 'Access confidence is reduced by approach ambiguity or fading light.', 12, 'caution'));
  }
  if (complianceConfidence.score < 60) {
    penalties.push(makeReason('confidence_compliance', 'confidence', 'unknown', 'Compliance confidence is reduced for this location.', 14, 'warning'));
  }
  if (weatherConfidence.score < 60) {
    penalties.push(makeReason('confidence_weather', 'confidence', 'unknown', 'Weather data may be stale for an overnight recommendation.', 14, 'warning'));
  }
  if (vehicleFitConfidence.score < 60) {
    penalties.push(makeReason('confidence_vehicle', 'confidence', 'unknown', 'Vehicle-fit confidence is limited by incomplete or non-live vehicle context.', 12, 'caution'));
  }
  if (routeConfidence.score < 60) {
    penalties.push(makeReason('confidence_route', 'confidence', 'unknown', 'Route-context confidence is reduced near the final approach.', 11, 'caution'));
  }

  if (!point.onlineContext.isOnline) {
    score -= 8;
    penalties.push(makeReason('confidence_offline', 'confidence', 'unknown', 'Offline context reduces route, weather, and compliance confidence.', 10, 'warning'));
  }
  if (weightProfile.scenarioFlags.includes('bad_weather')) score -= 4;
  if (weightProfile.scenarioFlags.includes('night_arrival')) score -= 5 + weightProfile.darknessAdjustmentFactor * 4;

  const normalized = roundScore(score - unknowns.length * 3.5);
  const summaryNotes = Array.from(
    new Set([
      terrainConfidence.score >= 72 ? 'terrain confidence high' : '',
      complianceConfidence.score < 60 ? 'compliance confidence reduced' : '',
      weatherConfidence.score < 60 ? 'weather data may be stale' : '',
      vehicleFitConfidence.score < 60 ? 'vehicle-fit confidence limited by incomplete live data' : '',
      routeConfidence.score < 60 ? 'route-context confidence remains incomplete' : '',
    ].filter(Boolean)),
  ).slice(0, 4);

  const breakdown: CampIntelConfidenceBreakdown = {
    overallConfidence: normalized,
    overallLabel: confidenceLabel(normalized),
    terrainConfidence,
    accessConfidence,
    complianceConfidence,
    weatherConfidence,
    vehicleFitConfidence,
    routeConfidence,
    unresolvedUnknowns: unknowns,
    summaryNotes,
  };

  return {
    score: normalized,
    label: confidenceLabel(normalized),
    breakdown,
    penalties,
    unknowns,
    scenarioFlags: [
      ...weightProfile.scenarioFlags,
      ...(point.vehicleContext.trailerAttached ? (['trailer_attached'] as const) : []),
      ...(!point.onlineContext.isOnline ? (['offline_limited'] as const) : []),
    ],
  };
}

export function evaluateCampIntelViability(
  point: CampIntelCandidatePoint,
  enrichment: CampIntelCandidateEnrichment,
): CampIntelViabilityResult {
  const reasons: string[] = [];
  let viabilityGateStatus: CampIntelViabilityResult['viabilityGateStatus'] = 'viable';

  if (enrichment.terrain.usableFootprint < 0.34 || enrichment.terrain.parkingSpace < 0.32) {
    reasons.push('Insufficient usable footprint for an overnight stop.');
    viabilityGateStatus = 'rejected_terrain';
  }
  if (enrichment.terrain.slopeRisk >= 0.84 || enrichment.terrain.levelness < 0.26) {
    reasons.push('Site geometry appears too sloped for a stable overnight setup.');
    viabilityGateStatus = 'rejected_terrain';
  }
  if (enrichment.terrain.floodRisk >= 0.82) {
    reasons.push('Wash or drainage exposure appears too high.');
    viabilityGateStatus = 'rejected_safety';
  }
  if (
    enrichment.routeAccess.finalApproachComplexity >= 0.94 ||
    (enrichment.routeAccess.widthRestrictionRisk >= 0.86 && enrichment.vehicleCompatibility.widthFit < 0.34)
  ) {
    reasons.push('Final approach appears too constrained for a reliable arrival.');
    viabilityGateStatus = 'rejected_access';
  }
  if (enrichment.routeAccess.turnaroundViability <= 0.14) {
    reasons.push('Turnaround or stopping geometry appears unusable.');
    viabilityGateStatus = 'rejected_vehicle';
  }
  if (
    point.vehicleContext.trailerAttached &&
    (enrichment.vehicleCompatibility.trailerFit < 0.28 || enrichment.vehicleCompatibility.departureDifficulty >= 0.9)
  ) {
    reasons.push('Current trailer configuration makes this site impractical.');
    viabilityGateStatus = 'rejected_vehicle';
  }
  if (
    enrichment.compliance.legality === 'likely_restricted' &&
    point.onlineContext.complianceConfidence >= 0.68
  ) {
    reasons.push('High-confidence compliance signals indicate likely camping restrictions.');
    viabilityGateStatus = 'rejected_compliance';
  }
  if (
    point.routeRelation.detourDistanceMiles != null &&
    point.routeRelation.detourDistanceMiles <= 0.12 &&
    enrichment.compliance.roadEdgeRestrictionRisk >= 0.68
  ) {
    reasons.push('Road-edge turnout geometry does not look campable enough for recommendation.');
    viabilityGateStatus = 'rejected_compliance';
  }

  return {
    isViableCandidate: reasons.length === 0,
    failedViabilityReasons: Array.from(new Set(reasons)),
    viabilityGateStatus,
  };
}

function buildArrivalAssessment(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment, scores: CampIntelDimensionScores): CampIntelSubAssessment {
  const score = scores.arrivalRiskScore;
  let label = 'easy arrival';
  let summary = 'Approach appears straightforward for current route conditions.';

  if (score >= 72) {
    label = point.missionContext.darknessAdjustmentState === 'after_dark' ? 'difficult after-dark approach' : 'high arrival risk';
    summary = point.missionContext.darknessAdjustmentState === 'daylight_normal'
      ? 'Final approach complexity, ambiguity, or vehicle constraints raise arrival risk.'
      : 'Late-day or after-dark conditions materially reduce arrival confidence here.';
  } else if (score >= 52) {
    label = 'moderate arrival caution';
    summary = point.missionContext.darknessAdjustmentState === 'daylight_normal'
      ? 'Arrival looks possible, but final maneuvering may need extra care.'
      : 'Approach remains possible, but fading light reduces arrival margin.';
  } else if (point.missionContext.darknessAdjustmentState !== 'daylight_normal' && score >= 38) {
    label = 'easy low-light arrival';
    summary = 'Approach remains practical even with reduced visibility.';
  }

  return {
    score,
    label,
    summary,
    tone: toneFromRisk(score),
  };
}

function buildOvernightAssessment(enrichment: CampIntelCandidateEnrichment, scores: CampIntelDimensionScores): CampIntelSubAssessment {
  const score = scores.overnightSuitabilityScore;
  let label = 'stable overnight site';
  let summary = 'Levelness, footprint, and overnight exposure support a stable stop.';

  if (score < 48) {
    label = 'exposed overnight';
    summary = 'Overnight suitability is limited by slope, weather exposure, or weak footing.';
  } else if (score < 66) {
    label = 'usable overnight with caution';
    summary = enrichment.terrain.floodRisk >= 0.55
      ? 'Overnight use looks possible, but drainage or wash concerns reduce confidence.'
      : 'Overnight use looks workable, but conditions are not especially forgiving.';
  }

  return {
    score,
    label,
    summary,
    tone: toneFromSuitability(score),
  };
}

function buildDepartureAssessment(point: CampIntelCandidatePoint, enrichment: CampIntelCandidateEnrichment, scores: CampIntelDimensionScores): CampIntelSubAssessment {
  const score = scores.departureRiskScore;
  let label = 'simple morning departure';
  let summary = 'Turnaround and exit geometry look manageable for the morning.';

  if (score >= 70) {
    label = 'difficult turnaround on departure';
    summary = point.vehicleContext.trailerAttached
      ? 'Trailer or long-wheelbase constraints make departure look awkward here.'
      : 'Turnaround or constrained egress increases departure risk.';
  } else if (score >= 50) {
    label = 'moderate departure caution';
    summary = 'Morning departure looks possible, but maneuvering room may be limited.';
  }

  return {
    score,
    label,
    summary,
    tone: toneFromRisk(score),
  };
}

export function buildCampIntelSubAssessments(
  point: CampIntelCandidatePoint,
  enrichment: CampIntelCandidateEnrichment,
  scores: CampIntelDimensionScores,
): {
  arrivalAssessment: CampIntelSubAssessment;
  overnightAssessment: CampIntelSubAssessment;
  departureAssessment: CampIntelSubAssessment;
} {
  return {
    arrivalAssessment: buildArrivalAssessment(point, enrichment, scores),
    overnightAssessment: buildOvernightAssessment(enrichment, scores),
    departureAssessment: buildDepartureAssessment(point, enrichment, scores),
  };
}

export function scoreCampIntelDimensions(
  point: CampIntelCandidatePoint,
  enrichment: CampIntelCandidateEnrichment,
  weightProfile: CampIntelWeightProfile,
  confidence: CampIntelConfidenceDetail,
): CampIntelDimensionScores {
  const accessScore = scoreAccess(point, enrichment, weightProfile.applied.access);
  const campabilityScore = scoreCampability(enrichment, weightProfile.applied.campability);
  const vehicleFitScore = scoreVehicleFit(point, enrichment, weightProfile.applied.vehicleFit);
  const safetyScore = scoreSafety(enrichment, weightProfile.applied.safety);
  const complianceScore = scoreCompliance(enrichment, weightProfile.applied.compliance);
  const desirabilityScore = scoreDesirability(point, enrichment, weightProfile.applied.desirability);

  const arrivalRiskScore = roundScore(
    100 - clamp(
      accessScore.raw * 0.48 +
      vehicleFitScore.raw * 0.26 +
      (1 - enrichment.routeAccess.routeAmbiguity) * 18 +
      (1 - enrichment.routeAccess.finalApproachComplexity) * 18 -
      weightProfile.darknessAdjustmentFactor * 10,
    ),
  );

  const overnightSuitabilityScore = roundScore(
    campabilityScore.raw * 0.42 +
    safetyScore.raw * 0.33 +
    complianceScore.raw * 0.10 +
    desirabilityScore.raw * 0.10 +
    (1 - enrichment.terrain.floodRisk) * 5,
  );

  const departureRiskScore = roundScore(
    100 - clamp(
      enrichment.routeAccess.turnaroundViability * 34 +
      (1 - enrichment.vehicleCompatibility.departureDifficulty) * 28 +
      accessScore.raw * 0.18 +
      vehicleFitScore.raw * 0.14 +
      (1 - enrichment.safety.precipitationRisk) * 6,
    ),
  );

  const rawWeighted =
    accessScore.weighted +
    campabilityScore.weighted +
    vehicleFitScore.weighted +
    safetyScore.weighted +
    complianceScore.weighted +
    desirabilityScore.weighted;

  const confidenceMultiplier = 0.42 + (confidence.score / 100) * 0.50;
  const subAssessmentContribution =
    (100 - arrivalRiskScore) * 0.18 +
    overnightSuitabilityScore * 0.20 +
    (100 - departureRiskScore) * 0.14;
  const guardrailPenalty =
    (Math.max(0, 46 - safetyScore.raw) * 0.8) +
    (Math.max(0, 42 - complianceScore.raw) * 0.9) +
    (Math.max(0, arrivalRiskScore - 62) * 0.35) +
    (Math.max(0, departureRiskScore - 60) * 0.28) +
    (Math.max(0, 48 - overnightSuitabilityScore) * 0.45) +
    (confidence.unknowns.length * 1.8);
  const overallScore = roundScore(rawWeighted * confidenceMultiplier + subAssessmentContribution * 0.48 - guardrailPenalty);

  return {
    accessScore,
    campabilityScore,
    vehicleFitScore,
    safetyScore,
    complianceScore,
    desirabilityScore,
    overallScore,
    confidenceScore: confidence.score,
    arrivalRiskScore,
    overnightSuitabilityScore,
    departureRiskScore,
    overnightStabilityScore: overnightSuitabilityScore,
  };
}
