import type { CampsiteCandidate, CampsiteCandidateResult } from '../campsiteCandidateEngine';
import { evaluateCampsiteCandidateViability } from '../campsites/campsiteViabilityFilter';
import type {
  CampIntelCandidateEnrichment,
  CampIntelCandidatePoint,
  CampIntelDarknessAdjustmentState,
  CampIntelEngineInput,
  CampIntelEngineResult,
  CampIntelLegalityConfidence,
  CampIntelMissionContext,
  CampIntelMissionMode,
  CampIntelOnlineContext,
  CampIntelRankedCandidate,
  CampIntelReasonChip,
  CampIntelResourceContext,
  CampIntelRouteAccessContext,
  CampIntelRouteRelationInfo,
  CampIntelRiskFlag,
  CampIntelVehicleCompatibilityContext,
  CampIntelViabilityResult,
  CampIntelVehicleContext,
} from './campIntelTypes';
import { classifyCampIntelCandidate } from './campIntelClassification';
import { buildCampIntelExplanation } from './campIntelExplain';
import {
  buildCampIntelSubAssessments,
  evaluateCampIntelViability,
  scoreCampIntelConfidence,
  scoreCampIntelDimensions,
} from './campIntelScoring';
import { getDefaultCampIntelMissionMode, getCampIntelWeightProfile } from './campIntelWeights';

function mergeCoreScoreViability(args: {
  candidate: CampsiteCandidate;
  result: CampsiteCandidateResult;
  scores: {
    overnightSuitabilityScore: number;
    campabilityScore: { raw: number };
    accessScore: { raw: number };
    complianceScore: { raw: number };
  };
  baseViability: CampIntelViabilityResult;
}): CampIntelViabilityResult {
  const { candidate, result, scores, baseViability } = args;
  const coreEvaluation = evaluateCampsiteCandidateViability(
    {
      ...candidate,
      campSuitability: scores.overnightSuitabilityScore,
      campsiteSuitability: scores.overnightSuitabilityScore,
      terrainSuitability: scores.campabilityScore.raw,
      accessConfidence: scores.accessScore.raw,
      legalAccess: scores.complianceScore.raw,
    },
    {
      source: result.source ?? result.analysisSource ?? 'route',
      generationId: result.id,
      routeIntelligenceId: result.routeIntelligenceId,
      polygonId: result.polygonId,
      analysisLayer: 'camp_intel',
    },
  );

  if (coreEvaluation.isViable) return baseViability;

  const failedCoreReasons = coreEvaluation.failingScoreNames.map(
    (name) => `Required campsite core score below 70 or unavailable: ${name}.`,
  );

  return {
    isViableCandidate: false,
    failedViabilityReasons: Array.from(new Set([
      ...baseViability.failedViabilityReasons,
      ...failedCoreReasons,
    ])),
    viabilityGateStatus:
      coreEvaluation.failingScoreNames.includes('legalAccess')
        ? 'rejected_compliance'
        : coreEvaluation.failingScoreNames.includes('accessConfidence')
          ? 'rejected_access'
          : 'rejected_terrain',
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function percentUnknown(values: (number | null | undefined)[]): number {
  if (values.length === 0) return 0;
  const unknown = values.filter((value) => value == null || !Number.isFinite(value as number)).length;
  return unknown / values.length;
}

function difficultyScalar(difficulty: CampsiteCandidate['difficulty']): number {
  switch (difficulty) {
    case 'easy':
      return 0.18;
    case 'moderate':
      return 0.38;
    case 'challenging':
      return 0.66;
    default:
      return 0.84;
  }
}

function routeWeatherAge(source: CampIntelEngineInput['routeWeather']): number | null {
  switch (source?.source) {
    case 'live':
      return 12;
    case 'cache_fresh':
      return 70;
    case 'cache_stale':
      return 240;
    case 'fallback':
      return 420;
    default:
      return null;
  }
}

function determineMissionMode(input: CampIntelEngineInput): CampIntelMissionMode {
  if (input.missionMode) return input.missionMode;
  const routeMiles = input.routeIntelligence?.totalDistanceMiles ?? 0;
  const weatherConcern =
    input.expeditionForecast?.status === 'WARNING' ||
    (input.routeWeather?.windMph ?? 0) >= 24 ||
    (input.routeWeather?.precipLabel ?? '').toLowerCase().includes('storm');
  const remote = (input.remotenessIndex?.score ?? 0) >= 70;
  const constrained =
    (input.resourceContext?.fuelPercent ?? 100) <= 25 ||
    (input.resourceContext?.powerPercent ?? 100) <= 25 ||
    (input.resourceContext?.waterPercent ?? 100) <= 25;

  if (weatherConcern) return 'weather_shelter';
  if (constrained) return 'fast_transit_overnight';
  if (remote && routeMiles >= 120) return 'remote_solitude';
  if (routeMiles >= 180) return 'basecamp';
  return getDefaultCampIntelMissionMode();
}

function deriveDarknessAdjustment(hour: number | null | undefined): {
  darknessAdjustmentState: CampIntelDarknessAdjustmentState;
  lastLightFactor: number;
} {
  if (hour == null || !Number.isFinite(hour)) {
    return {
      darknessAdjustmentState: 'daylight_normal',
      lastLightFactor: 0,
    };
  }
  if (hour >= 19) {
    return {
      darknessAdjustmentState: 'after_dark',
      lastLightFactor: 1,
    };
  }
  if (hour >= 17.25) {
    return {
      darknessAdjustmentState: 'last_light_caution',
      lastLightFactor: clamp01((hour - 17.25) / 1.75),
    };
  }
  return {
    darknessAdjustmentState: 'daylight_normal',
    lastLightFactor: 0,
  };
}

function computeMissionContext(input: CampIntelEngineInput, candidate: CampsiteCandidate, nowIso: string): CampIntelMissionContext {
  const routeMiles = input.routeIntelligence?.totalDistanceMiles ?? null;
  const routeHours = input.routeIntelligence?.estimatedDriveTimeHours ?? null;
  const now = new Date(nowIso);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const arrivalHour = candidate.estimatedArrivalHour;
  const effectiveArrivalHour = arrivalHour != null ? arrivalHour : currentHour;
  const darknessContext = deriveDarknessAdjustment(effectiveArrivalHour);
  const nearSunset = darknessContext.darknessAdjustmentState === 'last_light_caution';
  const isAfterSunset = darknessContext.darknessAdjustmentState === 'after_dark';
  const degradedWeather =
    input.expeditionForecast?.status === 'WARNING' ||
    input.expeditionForecast?.status === 'CAUTION' ||
    (input.routeWeather?.windMph ?? 0) >= 18 ||
    /rain|storm|snow|thunder/i.test(input.routeWeather?.precipLabel ?? '');
  const constrainedResources =
    (input.resourceContext?.fuelPercent ?? 100) <= 25 ||
    (input.resourceContext?.powerPercent ?? 100) <= 25 ||
    (input.resourceContext?.waterPercent ?? 100) <= 25 ||
    (input.resourceContext?.fuelRangeMiles ?? 999) <= 90;

  return {
    missionMode: determineMissionMode(input),
    activeRouteId: input.routeIntelligence?.id ?? null,
    activeRouteName: input.routeIntelligence?.routeName ?? null,
    totalRouteDistanceMiles: routeMiles,
    totalDriveTimeHours: routeHours,
    activeLegRemainingMiles:
      routeMiles != null && candidate.distanceMiles != null ? Math.max(0, routeMiles - candidate.distanceMiles) : null,
    activeLegRemainingHours:
      routeHours != null && routeMiles != null && candidate.distanceMiles != null
        ? Math.max(0, routeHours - (routeHours * (candidate.distanceMiles / Math.max(routeMiles, 1))))
        : null,
    isAfterSunset,
    nearSunset,
    darknessAdjustmentState: darknessContext.darknessAdjustmentState,
    lastLightFactor: darknessContext.lastLightFactor,
    plannedArrivalHour: arrivalHour,
    degradedWeather,
    constrainedResources,
    currentTimeIso: nowIso,
  };
}

function labelCandidate(candidate: CampsiteCandidate, index: number): string {
  if (candidate.segmentRange) return `Camp ${candidate.segmentRange}`;
  if (Number.isFinite(candidate.distanceMiles)) return `Camp ${Math.round(candidate.distanceMiles)} mi`;
  return `Camp ${index + 1}`;
}

function computeOnlineContext(input: CampIntelEngineInput, candidate: CampsiteCandidate): CampIntelOnlineContext {
  const routeCertainty =
    candidate.confidence === 'HIGH' ? 0.86 : candidate.confidence === 'MEDIUM' ? 0.66 : 0.42;
  const terrainConfidence = clamp01(
    0.82
    - percentUnknown([
      input.routeIntelligence?.highestElevationFeet,
      input.terrainIntelligence?.highestElevationFeet,
      candidate.elevationGain,
    ]) * 0.22,
  );
  const complianceConfidence = clamp01(
    0.72
    - (candidate.confidence === 'LOW' ? 0.20 : candidate.confidence === 'MEDIUM' ? 0.08 : 0)
    - (input.remotenessIndex == null ? 0.08 : 0)
    - (input.online === false ? 0.12 : 0),
  );
  return {
    isOnline: input.online ?? true,
    offlineStatus:
      input.online === false || input.routeWeather?.source === 'fallback'
        ? 'offline_estimated'
        : input.routeWeather == null
          ? 'unavailable'
          : 'online',
    routeCertainty,
    weatherFreshnessMinutes: routeWeatherAge(input.routeWeather),
    terrainConfidence,
    complianceConfidence,
    vehicleStateFreshnessMinutes:
      input.vehicleContext?.source === 'live' ? 10 : input.vehicleContext?.source === 'profile' ? 120 : null,
  };
}

function computeRouteRelationInfo(
  candidate: CampsiteCandidate,
  result: CampsiteCandidateResult,
  input: CampIntelEngineInput,
): CampIntelRouteRelationInfo {
  const segment = input.routeIntelligence?.segments?.find((item) => item.segmentIndex === candidate.segmentIndex) ?? null;
  const difficulty = difficultyScalar(candidate.difficulty);
  const detourDistance =
    candidate.difficulty === 'easy'
      ? 0.2
      : candidate.difficulty === 'moderate'
        ? 0.45
        : candidate.difficulty === 'challenging'
          ? 0.9
          : 1.4;
  const turnaroundViability = clamp01((candidate.qualityScore / 100) * 0.55 + (1 - difficulty) * 0.45);
  const routeAmbiguity = clamp01((candidate.confidence === 'LOW' ? 0.72 : candidate.confidence === 'MEDIUM' ? 0.42 : 0.2) + difficulty * 0.2);
  const darknessPenalty = clamp01((candidate.estimatedArrivalHour != null && candidate.estimatedArrivalHour >= 18.5 ? 0.72 : 0.15) + difficulty * 0.2);

  return {
    segmentIndex: candidate.segmentIndex,
    segmentRange: candidate.segmentRange ?? null,
    distanceMilesFromStart: candidate.distanceMiles ?? null,
    detourDistanceMiles: detourDistance,
    detourCostScore: clamp01(detourDistance / 1.6),
    finalApproachComplexity: clamp01(difficulty * 0.75 + (segment?.maxGradePercent ?? 0) / 22),
    turnaroundViability,
    routeAmbiguity,
    darknessPenalty,
    sourceRouteId: result.routeIntelligenceId ?? input.routeIntelligence?.id ?? null,
    sourceRouteName: result.routeName ?? input.routeIntelligence?.routeName ?? null,
  };
}

function deriveVehicleContext(input: CampIntelEngineInput): CampIntelVehicleContext {
  return input.vehicleContext ?? {
    vehicleId: null,
    label: null,
    source: 'unavailable',
    widthInches: null,
    wheelbaseInches: null,
    clearanceInches: null,
    tireSizeInches: null,
    suspensionLiftInches: null,
    trailerAttached: false,
    rooftopTent: false,
    loadoutWeightLbs: null,
    peopleCount: null,
  };
}

function deriveResourceContext(input: CampIntelEngineInput): CampIntelResourceContext {
  if (input.resourceContext) return input.resourceContext;
  return {
    fuelPercent: null,
    fuelRangeMiles: null,
    waterPercent: null,
    powerPercent: null,
    resourceStress: 0.5,
  };
}

function buildRouteAccess(candidate: CampsiteCandidate, point: CampIntelCandidatePoint, input: CampIntelEngineInput): CampIntelRouteAccessContext {
  const segment = input.routeIntelligence?.segments?.find((item) => item.segmentIndex === candidate.segmentIndex) ?? null;
  const difficulty = difficultyScalar(candidate.difficulty);
  const maxGrade = segment?.maxGradePercent ?? 0;
  const avgGrade = segment?.avgGradePercent ?? 0;
  const waterCrossing = /water|ford|creek|wash/i.test(candidate.candidateReason.join(' ')) ? 0.5 : 0.08;
  const widthRisk = clamp01(difficulty * 0.55 + ((point.vehicleContext.widthInches ?? 78) > 82 ? 0.18 : 0));
  return {
    routeClass: candidate.difficulty,
    trailRoughness: clamp01(difficulty + (candidate.avgElevation >= 7000 ? 0.08 : 0)),
    steepness: clamp01((Math.max(avgGrade, maxGrade) / 14) + difficulty * 0.12),
    finalApproachComplexity: point.routeRelation.finalApproachComplexity ?? difficulty,
    waterCrossingRisk: waterCrossing,
    widthRestrictionRisk: widthRisk,
    turnaroundViability: point.routeRelation.turnaroundViability ?? clamp01(1 - difficulty),
    obstacleDensity: clamp01(difficulty * 0.75 + (candidate.elevationGain > 140 ? 0.12 : 0)),
    routeAmbiguity: point.routeRelation.routeAmbiguity ?? difficulty * 0.5,
    darknessPenalty: point.routeRelation.darknessPenalty ?? 0.12,
    detourCostMiles: point.routeRelation.detourDistanceMiles,
  };
}

function buildVehicleCompatibility(point: CampIntelCandidatePoint, routeAccess: CampIntelRouteAccessContext): CampIntelVehicleCompatibilityContext {
  const vehicle = point.vehicleContext;
  const widthFit = clamp01(1 - routeAccess.widthRestrictionRisk + ((vehicle.widthInches ?? 80) <= 78 ? 0.08 : 0));
  const clearanceFit = clamp01(
    0.62
    + (((vehicle.clearanceInches ?? 9) - 9) * 0.06)
    + (((vehicle.suspensionLiftInches ?? 0) * 0.04))
    - routeAccess.steepness * 0.32
    - routeAccess.obstacleDensity * 0.28,
  );
  const wheelbasePenalty = vehicle.wheelbaseInches != null && vehicle.wheelbaseInches > 145 ? 0.16 : vehicle.wheelbaseInches != null && vehicle.wheelbaseInches > 130 ? 0.08 : 0;
  const wheelbaseFit = clamp01(0.78 - routeAccess.finalApproachComplexity * 0.28 - wheelbasePenalty);
  const trailerFit = clamp01(
    vehicle.trailerAttached
      ? 0.64 - routeAccess.finalApproachComplexity * 0.3 - (1 - routeAccess.turnaroundViability) * 0.24
      : 0.84 - routeAccess.finalApproachComplexity * 0.12,
  );
  const nighttimeArrivalDifficulty = clamp01(routeAccess.finalApproachComplexity * 0.6 + routeAccess.darknessPenalty * 0.4);
  const departureDifficulty = clamp01((1 - routeAccess.turnaroundViability) * 0.62 + routeAccess.routeAmbiguity * 0.2 + (vehicle.trailerAttached ? 0.14 : 0));
  return {
    widthFit,
    clearanceFit,
    wheelbaseFit,
    trailerFit,
    nighttimeArrivalDifficulty,
    departureDifficulty,
  };
}

function buildTerrainContext(candidate: CampsiteCandidate, point: CampIntelCandidatePoint, input: CampIntelEngineInput) {
  const segment = input.routeIntelligence?.segments?.find((item) => item.segmentIndex === candidate.segmentIndex) ?? null;
  const qualityNorm = clamp01(candidate.qualityScore / 100);
  const suitabilityNorm = clamp01(candidate.suitabilityScore / 15);
  const steepness = clamp01(((segment?.avgGradePercent ?? 0) / 10) + difficultyScalar(candidate.difficulty) * 0.15);
  const precipRisk = /rain|storm|snow|thunder/i.test(input.routeWeather?.precipLabel ?? '') ? 0.22 : 0;
  const floodRisk = clamp01(precipRisk + (candidate.avgElevation < 4500 ? 0.1 : 0) + (difficultyScalar(candidate.difficulty) * 0.14));
  const ridgelineExposure = clamp01(((input.routeWeather?.windMph ?? 0) / 30) + (candidate.avgElevation >= 7000 ? 0.18 : 0));
  return {
    levelness: clamp01(0.88 - steepness * 0.7),
    slopeRisk: steepness,
    usableFootprint: clamp01(0.38 + qualityNorm * 0.42 + suitabilityNorm * 0.18),
    firmness: clamp01(0.52 + qualityNorm * 0.24 - precipRisk * 0.24),
    drainage: clamp01(0.68 - floodRisk * 0.5),
    floodRisk,
    ridgelineExposure,
    parkingSpace: clamp01(0.44 + suitabilityNorm * 0.36 + qualityNorm * 0.2),
    shelter: clamp01(0.62 - ridgelineExposure * 0.45 + ((input.routeWeather?.windMph ?? 0) < 12 ? 0.08 : 0)),
  };
}

function buildSafetyContext(point: CampIntelCandidatePoint, routeAccess: CampIntelRouteAccessContext, terrain: ReturnType<typeof buildTerrainContext>, input: CampIntelEngineInput) {
  const windRisk = clamp01((input.routeWeather?.windMph ?? 0) / 28 + terrain.ridgelineExposure * 0.35);
  const precipRisk = clamp01(/rain|storm|snow|thunder/i.test(input.routeWeather?.precipLabel ?? '') ? 0.6 : input.expeditionForecast?.status === 'WARNING' ? 0.52 : input.expeditionForecast?.status === 'CAUTION' ? 0.32 : 0.12);
  const remotenessRisk = clamp01((input.remotenessIndex?.score ?? 40) / 100);
  const bailoutDistance = input.remotenessIndex?.proximity?.nearestPavedRoad?.distanceMi ?? input.remotenessIndex?.proximity?.nearestTown?.distanceMi ?? 12;
  const connectivityRisk =
    input.remotenessIndex?.connectivity?.signal === 'no_signal'
      ? 0.82
      : input.remotenessIndex?.connectivity?.signal === 'weak' || input.remotenessIndex?.connectivity?.signal === 'intermittent'
        ? 0.58
        : input.remotenessIndex?.connectivity?.signal === 'moderate'
          ? 0.32
          : 0.18;

  return {
    overnightWindRisk: windRisk,
    precipitationRisk: precipRisk,
    visibilityRisk: clamp01(routeAccess.darknessPenalty * 0.7 + routeAccess.routeAmbiguity * 0.2),
    remotenessRisk,
    bailoutDifficulty: clamp01((bailoutDistance ?? 12) / 28 + remotenessRisk * 0.2),
    commsDeadZoneRisk: connectivityRisk,
  };
}

function buildComplianceContext(candidate: CampsiteCandidate, point: CampIntelCandidatePoint, routeAccess: CampIntelRouteAccessContext, input: CampIntelEngineInput) {
  const privateLandRisk = clamp01((candidate.confidence === 'LOW' ? 0.36 : candidate.confidence === 'MEDIUM' ? 0.22 : 0.12) + (point.onlineContext.isOnline ? 0 : 0.1));
  const protectedAreaRisk = clamp01((input.terrainIntelligence?.mountainPassDetected ? 0.1 : 0) + (candidate.avgElevation >= 8500 ? 0.12 : 0));
  const roadEdgeRestrictionRisk = clamp01((routeAccess.detourCostMiles != null && routeAccess.detourCostMiles <= 0.25 ? 0.44 : 0.18) + routeAccess.routeAmbiguity * 0.14);
  const landUseConfidence = clamp01(0.78 - privateLandRisk * 0.2 - protectedAreaRisk * 0.18 - roadEdgeRestrictionRisk * 0.12);
  const legalityScore = landUseConfidence - privateLandRisk * 0.55 - protectedAreaRisk * 0.65 - roadEdgeRestrictionRisk * 0.45;
  const legality: CampIntelLegalityConfidence =
    legalityScore >= 0.42 ? 'likely_suitable' : legalityScore >= 0.16 ? 'uncertain' : 'likely_restricted';

  return {
    landUseConfidence,
    privateLandRisk,
    protectedAreaRisk,
    roadEdgeRestrictionRisk,
    legality,
  };
}

function buildDesirabilityContext(candidate: CampsiteCandidate, terrain: ReturnType<typeof buildTerrainContext>, input: CampIntelEngineInput) {
  const qualityNorm = clamp01(candidate.qualityScore / 100);
  const remotenessNorm = clamp01((input.remotenessIndex?.score ?? 45) / 100);
  const scenicBase = clamp01((candidate.avgElevation >= 6500 ? 0.18 : 0.08) + qualityNorm * 0.42 + remotenessNorm * 0.16);
  const hiddenGemsSignal = input.supportSignals?.hiddenGems;
  const hiddenGemsBonus = clamp01(
    qualityNorm * 0.22 +
    (candidate.candidateReason.length >= 3 ? 0.08 : 0) +
    (hiddenGemsSignal?.scenicSupportScore ?? 0) * 0.5 +
    Math.min((hiddenGemsSignal?.nearbyGemCount ?? 0) * 0.06, 0.18),
  );

  return {
    privacy: clamp01(0.34 + remotenessNorm * 0.4 + (candidate.difficulty !== 'easy' ? 0.08 : 0)),
    scenicQuality: scenicBase,
    shade: clamp01(terrain.shelter * 0.82),
    sunriseExposure: clamp01(terrain.ridgelineExposure * 0.6 + scenicBase * 0.2),
    hiddenGemsBonus,
  };
}

function buildResourceImplications(point: CampIntelCandidatePoint, input: CampIntelEngineInput) {
  const proximity = input.remotenessIndex?.proximity;
  return {
    nearestFuelEstimateMiles: proximity?.nearestFuelStation?.distanceMi ?? null,
    bailoutRoadEstimateMiles: proximity?.nearestPavedRoad?.distanceMi ?? null,
    nearestTownEstimateMiles: proximity?.nearestTown?.distanceMi ?? null,
    commsConfidence: clamp01((input.remotenessIndex?.connectivity?.qualityScore ?? 45) / 100),
    detourDistanceMiles:
      point.resourceContext.resourceStress >= 0.6 && point.routeRelation.detourDistanceMiles != null
        ? Number((point.routeRelation.detourDistanceMiles * 0.85).toFixed(1))
        : point.routeRelation.detourDistanceMiles,
  };
}

function buildRiskFlags(
  ranked: Pick<
    CampIntelRankedCandidate,
    | 'point'
    | 'enrichment'
    | 'scores'
    | 'confidence'
    | 'viability'
    | 'arrivalAssessment'
    | 'overnightAssessment'
    | 'departureAssessment'
  >,
): CampIntelRiskFlag[] {
  const flags: CampIntelRiskFlag[] = [];
  if (ranked.scores.vehicleFitScore.raw < 55) flags.push({ id: 'vehicle', type: 'vehicle', label: 'Vehicle fit caution', tone: 'caution' });
  if (ranked.scores.safetyScore.raw < 55) flags.push({ id: 'weather', type: 'weather', label: 'Overnight risk elevated', tone: 'warning' });
  if (ranked.enrichment.terrain.slopeRisk >= 0.55) flags.push({ id: 'slope', type: 'slope', label: 'Slope caution', tone: 'caution' });
  if (ranked.scores.complianceScore.raw < 55) flags.push({ id: 'legal', type: 'legal', label: 'Legal uncertainty', tone: 'warning' });
  if (ranked.enrichment.safety.commsDeadZoneRisk >= 0.55) flags.push({ id: 'comms', type: 'comms', label: 'Comms issue', tone: 'caution' });
  if (ranked.scores.arrivalRiskScore >= 58) flags.push({ id: 'arrival', type: 'arrival', label: 'Arrival caution', tone: 'warning' });
  if (ranked.scores.departureRiskScore >= 58) flags.push({ id: 'departure', type: 'departure', label: 'Departure caution', tone: 'caution' });
  if (ranked.point.missionContext.darknessAdjustmentState !== 'daylight_normal' && ranked.scores.arrivalRiskScore >= 48) {
    flags.push({ id: 'darkness', type: 'darkness', label: 'Low-light arrival', tone: 'warning' });
  }
  if (ranked.point.missionContext.constrainedResources) flags.push({ id: 'resource', type: 'resource', label: 'Resource constrained', tone: 'caution' });
  return flags.slice(0, 5);
}

function buildRecommendation(
  ranked: Pick<
    CampIntelRankedCandidate,
    | 'point'
    | 'enrichment'
    | 'scores'
    | 'confidence'
    | 'viability'
    | 'arrivalAssessment'
    | 'overnightAssessment'
    | 'departureAssessment'
  >,
  classification: CampIntelRankedCandidate['classification'],
) {
  const vehicleFit = ranked.scores.vehicleFitScore.raw;
  const access = ranked.scores.accessScore.raw;
  const safety = ranked.scores.safetyScore.raw;
  const compliance = ranked.scores.complianceScore.raw;
  const arrival = ranked.scores.arrivalRiskScore;
  const departure = ranked.scores.departureRiskScore;
  const overnight = ranked.scores.overnightSuitabilityScore;
  const quickVerdict =
    classification === 'suggested'
      ? arrival <= 38 && departure <= 42 && overnight >= 68
        ? 'Strong arrival, stable overnight, easy departure'
        : vehicleFit >= 72
          ? 'Great fit for your vehicle'
          : 'Strong overnight option'
      : classification === 'backup'
        ? arrival >= 56
          ? 'Better as a backup camp'
          : 'Reachable with caution'
        : classification === 'emergency'
          ? 'Good emergency stop option'
          : ranked.point.missionContext.darknessAdjustmentState === 'after_dark'
            ? 'Not recommended after dark'
            : 'Low-confidence overnight option';

  const summaryLine =
    classification === 'suggested'
      ? arrival <= 42 && departure <= 46
        ? 'Arrival, overnight stability, and morning departure all rate stronger than nearby options.'
        : 'Balanced access, safety, and overnight stability make this the strongest current camp option.'
      : classification === 'backup'
        ? arrival >= 56 || departure >= 56
          ? 'Useful fallback if the top site closes or a more practical arrival is needed.'
          : 'Useful fallback if the top option closes or arrival timing shifts.'
        : classification === 'emergency'
          ? ranked.point.missionContext.darknessAdjustmentState !== 'daylight_normal'
            ? 'Best treated as a stop-before-dark or late-day safety option rather than a preferred camp.'
            : 'Best treated as a safe-enough stop rather than a preferred overnight camp.'
          : !ranked.viability.isViableCandidate
            ? ranked.viability.failedViabilityReasons[0] ?? 'Viability gate removed this site from normal recommendations.'
            : compliance < 45
            ? 'Compliance and confidence do not support a normal recommendation here.'
            : safety < 45 || overnight < 42
              ? 'Overnight safety signals are too weak to elevate this site.'
              : 'Confidence remains too limited to promote this candidate.';

  const reasonChips: CampIntelReasonChip[] = [];
  if (access >= 70) reasonChips.push({ id: 'access', label: 'easy access', tone: 'positive' });
  if (ranked.enrichment.terrain.levelness >= 0.7) reasonChips.push({ id: 'level', label: 'level terrain', tone: 'positive' });
  if (ranked.enrichment.terrain.shelter >= 0.7) reasonChips.push({ id: 'shelter', label: 'weather shelter', tone: 'positive' });
  if (ranked.enrichment.safety.overnightWindRisk >= 0.55) reasonChips.push({ id: 'wind', label: 'wind exposed', tone: 'caution' });
  if (ranked.enrichment.routeAccess.finalApproachComplexity >= 0.6) reasonChips.push({ id: 'approach', label: 'narrow final approach', tone: 'warning' });
  if (ranked.enrichment.compliance.legality === 'uncertain') reasonChips.push({ id: 'legal', label: 'legal uncertainty', tone: 'warning' });

  return { quickVerdict, summaryLine, reasonChips: reasonChips.slice(0, 4) };
}

function buildCandidatePoint(
  candidate: CampsiteCandidate,
  index: number,
  result: CampsiteCandidateResult,
  input: CampIntelEngineInput,
  nowIso: string,
): CampIntelCandidatePoint {
  const missionContext = computeMissionContext(input, candidate, nowIso);
  return {
    id: `${result.id}:${candidate.segmentIndex}:${index}`,
    coordinate: {
      latitude: candidate.coordinates[0],
      longitude: candidate.coordinates[1],
    },
    label: labelCandidate(candidate, index),
    generatedLabel: true,
    sourceType: 'route_candidate',
    candidate,
    createdAt: result.analyzedAt,
    lastComputedAt: nowIso,
    routeRelation: computeRouteRelationInfo(candidate, result, input),
    missionContext,
    onlineContext: computeOnlineContext(input, candidate),
    vehicleContext: deriveVehicleContext(input),
    resourceContext: deriveResourceContext(input),
  };
}

function buildEnrichment(point: CampIntelCandidatePoint, input: CampIntelEngineInput): CampIntelCandidateEnrichment {
  const routeAccess = buildRouteAccess(point.candidate, point, input);
  const terrain = buildTerrainContext(point.candidate, point, input);
  const vehicleCompatibility = buildVehicleCompatibility(point, routeAccess);
  return {
    routeAccess,
    terrain,
    vehicleCompatibility,
    safety: buildSafetyContext(point, routeAccess, terrain, input),
    compliance: buildComplianceContext(point.candidate, point, routeAccess, input),
    desirability: buildDesirabilityContext(point.candidate, terrain, input),
    resources: buildResourceImplications(point, input),
  };
}

export function buildCampIntelEngine(
  result: CampsiteCandidateResult | null,
  input: CampIntelEngineInput,
): CampIntelEngineResult {
  const nowIso = input.currentTimeIso ?? new Date().toISOString();
  const missionMode = determineMissionMode(input);
  const referenceHour = new Date(nowIso).getHours() + new Date(nowIso).getMinutes() / 60;
  const referenceDarkness = deriveDarknessAdjustment(referenceHour);
  const weightProfile = getCampIntelWeightProfile(missionMode, {
    isAfterSunset: referenceDarkness.darknessAdjustmentState === 'after_dark',
    nearSunset: referenceDarkness.darknessAdjustmentState === 'last_light_caution',
    darknessAdjustmentState: referenceDarkness.darknessAdjustmentState,
    lastLightFactor: referenceDarkness.lastLightFactor,
    degradedWeather:
      input.expeditionForecast?.status === 'WARNING' ||
      input.expeditionForecast?.status === 'CAUTION' ||
      (input.routeWeather?.windMph ?? 0) >= 18 ||
      /rain|storm|snow|thunder/i.test(input.routeWeather?.precipLabel ?? ''),
    constrainedResources:
      (input.resourceContext?.fuelPercent ?? 100) <= 25 ||
      (input.resourceContext?.powerPercent ?? 100) <= 25 ||
      (input.resourceContext?.waterPercent ?? 100) <= 25 ||
      (input.resourceContext?.fuelRangeMiles ?? 999) <= 90,
  });

  if (!result || result.candidates.length === 0) {
    return {
      missionMode,
      weightProfile,
      rankedCandidates: [],
      viabilityRejected: [],
      suggested: [],
      backups: [],
      emergency: [],
      rejected: [],
      generatedAt: nowIso,
    };
  }

  const provisional = result.candidates
    .map((candidate, index) => {
      const point = buildCandidatePoint(candidate, index, result, input, nowIso);
      const appliedWeightProfile = getCampIntelWeightProfile(point.missionContext.missionMode, point.missionContext);
      const enrichment = buildEnrichment(point, input);
      const confidence = scoreCampIntelConfidence(point, enrichment, appliedWeightProfile);
      const scores = scoreCampIntelDimensions(point, enrichment, appliedWeightProfile, confidence);
      const viability = mergeCoreScoreViability({
        candidate,
        result,
        scores,
        baseViability: evaluateCampIntelViability(point, enrichment),
      });
      const assessments = buildCampIntelSubAssessments(point, enrichment, scores);
      return { point, enrichment, confidence, scores, viability, ...assessments };
    });

  const viableCandidates = provisional
    .filter((candidate) => candidate.viability.isViableCandidate)
    .sort((a, b) =>
      b.scores.overallScore - a.scores.overallScore ||
      b.confidence.score - a.confidence.score ||
      b.scores.safetyScore.raw - a.scores.safetyScore.raw ||
      a.point.candidate.segmentIndex - b.point.candidate.segmentIndex,
    );

  const top = viableCandidates[0] ?? null;

  const rankedCandidates: CampIntelRankedCandidate[] = viableCandidates.map((candidate, index) => {
    const classification = classifyCampIntelCandidate(candidate, candidate.point.missionContext.missionMode);
    const riskFlags = buildRiskFlags(candidate);
    const explanation = buildCampIntelExplanation(candidate, top);
    const recommendation = buildRecommendation(candidate, classification);
    return {
      ...candidate,
      classification,
      riskFlags,
      explanation,
      recommendation,
      overallRank: index + 1,
    };
  });

  const viabilityRejected: CampIntelRankedCandidate[] = provisional
    .filter((candidate) => !candidate.viability.isViableCandidate)
    .map((candidate) => {
      const riskFlags = buildRiskFlags(candidate);
      const explanation = buildCampIntelExplanation(candidate, top);
      const recommendation = buildRecommendation(candidate, 'rejected_low_confidence');
      return {
        ...candidate,
        classification: 'rejected_low_confidence' as const,
        riskFlags,
        explanation,
        recommendation,
        overallRank: 0,
      };
    });

  const classifiedRejected = rankedCandidates.filter((candidate) => candidate.classification === 'rejected_low_confidence');

  return {
    missionMode,
    weightProfile,
    rankedCandidates,
    viabilityRejected,
    suggested: rankedCandidates.filter((candidate) => candidate.classification === 'suggested'),
    backups: rankedCandidates.filter((candidate) => candidate.classification === 'backup'),
    emergency: rankedCandidates.filter((candidate) => candidate.classification === 'emergency'),
    rejected: [...viabilityRejected, ...classifiedRejected],
    generatedAt: nowIso,
  };
}
