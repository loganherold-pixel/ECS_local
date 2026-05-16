/**
 * ECS Remoteness Index Engine v1.0
 *
 * Calculates a dynamic remoteness score using multiple weighted factors:
 *   1. Service Distance — estimated distance to fuel, emergency, services
 *   2. Infrastructure Distance — estimated distance to paved roads, towns
 *   3. Signal Availability — cellular/wifi connectivity state
 *   4. Route Isolation — how isolated the current route segment is
 *   5. Population Density — estimated population proximity
 *   6. Terrain Complexity — elevation, grade, backcountry context
 *   7. Elevation Factor — altitude-based isolation
 *
 * Also provides:
 *   - Forward Remoteness Forecast (next 5-20 miles)
 *   - Infrastructure proximity estimates
 *   - Expedition intelligence advisories
 *   - Route remoteness classification
 *
 * Performance:
 *   - Recalculates on ~12s timer (not every GPS tick)
 *   - Smoothing: prev*0.82 + new*0.18 (slightly faster response than v1)
 *   - Hysteresis: level changes require sustained 25s or crossing by >= 10 pts
 *   - Efficient: no heavy computation, no external API calls
 */

import type {
  RemotenessLevel,
  RemotenessIndexOutput,
  RemotenessFactor,
  InfrastructureProximity,
  ProximityEstimate,
  ConnectivityAssessment,
  ConnectivitySignal,
  TerrainContext,
  ForwardRemotenessForcast,
  ForwardForecastSegment,
  RemotenessAdvisory,
  AdvisorySeverity,
  ScoringWeights,
  RouteRemotenessProfile,
  RouteRemotenessClass,
} from './remotenessTypes';
import { REMOTENESS_LEVELS, DEFAULT_SCORING_WEIGHTS } from './remotenessTypes';
import { assessRemotenessConfidence } from './ai/confidenceEngine';
import { assessRemotenessPriority } from './ai/priorityEngine';
import { explainRecommendation } from './ai/recommendationExplanationEngine';

// ══════════════════════════════════════════════════════════
// LEVEL RESOLUTION
// ══════════════════════════════════════════════════════════

export function scoreToLevel(score: number): { level: RemotenessLevel; color: string } {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const tier of REMOTENESS_LEVELS) {
    if (clamped <= tier.max) return { level: tier.level, color: tier.color };
  }
  return { level: 'Extreme', color: '#C0392B' };
}

export function getLevelDescription(level: RemotenessLevel): string {
  const entry = REMOTENESS_LEVELS.find(t => t.level === level);
  return entry?.description ?? '';
}

// ══════════════════════════════════════════════════════════
// INFRASTRUCTURE PROXIMITY ESTIMATION
// ══════════════════════════════════════════════════════════
// Uses heuristics from available signals (speed, connectivity,
// elevation, route data) to estimate distances to services.
// These are approximations — not GPS-verified distances.

export function estimateInfrastructureProximity(
  speedMph: number | null,
  connectivityState: string,
  elevationFt: number | null,
  hasActiveRoute: boolean,
  terrainComplexity: string | null,
  cacheReady: boolean,
): InfrastructureProximity {
  // Base estimates derived from connectivity + speed heuristics
  const isOnline = connectivityState === 'online';
  const isDegraded = connectivityState === 'degraded';
  const isOffline = connectivityState === 'offline';
  const isSlowSpeed = speedMph != null && speedMph < 15;
  const isHighElevation = elevationFt != null && elevationFt > 6000;
  const isVeryHighElevation = elevationFt != null && elevationFt > 8500;
  const isComplexTerrain = terrainComplexity === 'high';
  const isMediumTerrain = terrainComplexity === 'medium';

  // Paved road estimate
  let pavedRoadMi: number | null = null;
  if (isOnline && !isSlowSpeed) pavedRoadMi = 0.5;
  else if (isOnline && isSlowSpeed) pavedRoadMi = 3;
  else if (isDegraded) pavedRoadMi = 8;
  else if (isOffline && isComplexTerrain) pavedRoadMi = 25;
  else if (isOffline) pavedRoadMi = 15;
  else pavedRoadMi = 5;

  // Town estimate
  let townMi: number | null = null;
  if (isOnline && !isSlowSpeed) townMi = 5;
  else if (isOnline) townMi = 12;
  else if (isDegraded) townMi = 20;
  else if (isOffline && isComplexTerrain) townMi = 50;
  else if (isOffline) townMi = 35;
  else townMi = 15;

  // Fuel station estimate
  let fuelMi: number | null = null;
  if (isOnline && !isSlowSpeed) fuelMi = 8;
  else if (isOnline) fuelMi = 18;
  else if (isDegraded) fuelMi = 30;
  else if (isOffline) fuelMi = 55;
  else fuelMi = 20;

  // Emergency services estimate
  let emergencyMi: number | null = null;
  if (isOnline && !isSlowSpeed) emergencyMi = 10;
  else if (isOnline) emergencyMi = 20;
  else if (isDegraded) emergencyMi = 35;
  else if (isOffline && isComplexTerrain) emergencyMi = 65;
  else if (isOffline) emergencyMi = 45;
  else emergencyMi = 25;

  // General services estimate
  let servicesMi: number | null = null;
  if (isOnline && !isSlowSpeed) servicesMi = 3;
  else if (isOnline) servicesMi = 10;
  else if (isDegraded) servicesMi = 18;
  else if (isOffline) servicesMi = 40;
  else servicesMi = 12;

  // Elevation adjustments
  if (isHighElevation) {
    if (pavedRoadMi != null) pavedRoadMi *= 1.3;
    if (townMi != null) townMi *= 1.4;
    if (fuelMi != null) fuelMi *= 1.3;
    if (emergencyMi != null) emergencyMi *= 1.5;
    if (servicesMi != null) servicesMi *= 1.3;
  }
  if (isVeryHighElevation) {
    if (pavedRoadMi != null) pavedRoadMi *= 1.2;
    if (townMi != null) townMi *= 1.3;
    if (emergencyMi != null) emergencyMi *= 1.3;
  }

  // Terrain complexity adjustments
  if (isComplexTerrain) {
    if (pavedRoadMi != null) pavedRoadMi *= 1.4;
    if (emergencyMi != null) emergencyMi *= 1.3;
  }

  const confidence = isOnline ? 'medium' as const : 'estimated' as const;
  const source = isOnline ? 'connectivity + speed heuristic' : 'offline heuristic';

  const mkEstimate = (dist: number | null): ProximityEstimate => ({
    distanceMi: dist != null ? Math.round(dist) : null,
    confidence,
    source,
  });

  return {
    nearestPavedRoad: mkEstimate(pavedRoadMi),
    nearestTown: mkEstimate(townMi),
    nearestFuelStation: mkEstimate(fuelMi),
    nearestEmergencyServices: mkEstimate(emergencyMi),
    nearestServices: mkEstimate(servicesMi),
  };
}

// ══════════════════════════════════════════════════════════
// CONNECTIVITY ASSESSMENT
// ══════════════════════════════════════════════════════════

export function assessConnectivity(
  connectivityState: string,
  cacheReady: boolean,
): ConnectivityAssessment {
  let signal: ConnectivitySignal = 'unknown';
  let qualityScore = 50;
  let hasCellular = false;
  let hasWifi = false;
  let isOffline = false;

  switch (connectivityState) {
    case 'online':
      signal = 'strong';
      qualityScore = 90;
      hasCellular = true;
      break;
    case 'degraded':
      signal = 'weak';
      qualityScore = 35;
      hasCellular = true;
      break;
    case 'offline':
      signal = 'no_signal';
      qualityScore = 0;
      isOffline = true;
      break;
    default:
      signal = 'unknown';
      qualityScore = 25;
      break;
  }

  return { signal, hasCellular, hasWifi, isOffline, qualityScore };
}

// ══════════════════════════════════════════════════════════
// TERRAIN CONTEXT
// ══════════════════════════════════════════════════════════

export function assessTerrain(
  elevationFt: number | null,
  terrainComplexity: string | null,
  speedMph: number | null,
  connectivityState: string,
): TerrainContext {
  const isBackcountry =
    connectivityState === 'offline' ||
    (speedMph != null && speedMph < 10 && connectivityState !== 'online') ||
    (elevationFt != null && elevationFt > 7000);

  let routeIsolation = 30; // default moderate
  if (connectivityState === 'offline') routeIsolation += 30;
  if (speedMph != null && speedMph < 8) routeIsolation += 15;
  if (elevationFt != null && elevationFt > 6000) routeIsolation += 10;
  if (elevationFt != null && elevationFt > 8500) routeIsolation += 10;
  if (terrainComplexity === 'high') routeIsolation += 15;
  else if (terrainComplexity === 'medium') routeIsolation += 8;
  routeIsolation = Math.min(100, routeIsolation);

  let complexityScore = 0;
  if (terrainComplexity === 'high') complexityScore = 85;
  else if (terrainComplexity === 'medium') complexityScore = 50;
  else if (terrainComplexity === 'low') complexityScore = 15;

  return {
    elevationFt,
    complexity: terrainComplexity as 'low' | 'medium' | 'high' | null,
    isBackcountry,
    routeIsolation,
    complexityScore,
  };
}

// ══════════════════════════════════════════════════════════
// FACTOR SCORING
// ══════════════════════════════════════════════════════════

function scoreServiceDistance(proximity: InfrastructureProximity): RemotenessFactor {
  const fuelDist = proximity.nearestFuelStation.distanceMi ?? 20;
  const emergDist = proximity.nearestEmergencyServices.distanceMi ?? 25;
  const svcDist = proximity.nearestServices.distanceMi ?? 12;

  // Weighted average of service distances, normalized to 0-100
  const avgDist = (fuelDist * 0.4 + emergDist * 0.4 + svcDist * 0.2);
  // 0 mi = 0 score, 80+ mi = 100 score
  const rawScore = Math.min(100, (avgDist / 80) * 100);

  return {
    id: 'service_distance',
    label: 'Service Distance',
    rawScore: Math.round(rawScore),
    weightedScore: 0, // computed later
    weight: DEFAULT_SCORING_WEIGHTS.serviceDistance,
    available: true,
    detail: `Fuel ~${fuelDist}mi, Emergency ~${emergDist}mi`,
  };
}

function scoreInfrastructureDistance(proximity: InfrastructureProximity): RemotenessFactor {
  const roadDist = proximity.nearestPavedRoad.distanceMi ?? 5;
  const townDist = proximity.nearestTown.distanceMi ?? 15;

  const avgDist = (roadDist * 0.5 + townDist * 0.5);
  const rawScore = Math.min(100, (avgDist / 60) * 100);

  return {
    id: 'infrastructure_distance',
    label: 'Infrastructure Distance',
    rawScore: Math.round(rawScore),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.infrastructureDistance,
    available: true,
    detail: `Road ~${roadDist}mi, Town ~${townDist}mi`,
  };
}

function scoreSignalAvailability(connectivity: ConnectivityAssessment): RemotenessFactor {
  // Invert quality: no signal = high remoteness
  const rawScore = 100 - connectivity.qualityScore;

  return {
    id: 'signal_availability',
    label: 'Signal Availability',
    rawScore: Math.round(rawScore),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.signalAvailability,
    available: true,
    detail: connectivity.signal.replace('_', ' ').toUpperCase(),
  };
}

function scoreRouteIsolation(terrain: TerrainContext): RemotenessFactor {
  return {
    id: 'route_isolation',
    label: 'Route Isolation',
    rawScore: Math.round(terrain.routeIsolation),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.routeIsolation,
    available: true,
    detail: terrain.isBackcountry ? 'Backcountry conditions' : 'Standard access',
  };
}

function scorePopulationDensity(
  connectivity: ConnectivityAssessment,
  proximity: InfrastructureProximity,
): RemotenessFactor {
  // Estimate population density from town distance + connectivity
  const townDist = proximity.nearestTown.distanceMi ?? 15;
  const connBonus = connectivity.isOffline ? 25 : connectivity.signal === 'weak' ? 10 : 0;
  const rawScore = Math.min(100, (townDist / 50) * 75 + connBonus);

  return {
    id: 'population_density',
    label: 'Population Density',
    rawScore: Math.round(rawScore),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.populationDensity,
    available: true,
    detail: townDist > 30 ? 'Sparse population' : townDist > 10 ? 'Low density' : 'Near populated area',
  };
}

function scoreTerrainComplexity(terrain: TerrainContext): RemotenessFactor {
  return {
    id: 'terrain_complexity',
    label: 'Terrain Complexity',
    rawScore: Math.round(terrain.complexityScore),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.terrainComplexity,
    available: terrain.complexity != null,
    detail: terrain.complexity
      ? `${terrain.complexity.charAt(0).toUpperCase() + terrain.complexity.slice(1)} complexity`
      : 'No terrain data',
  };
}

function scoreElevationFactor(terrain: TerrainContext): RemotenessFactor {
  let rawScore = 0;
  if (terrain.elevationFt != null) {
    // 0-2000ft = 0, 2000-5000ft = 0-30, 5000-8000ft = 30-60, 8000+ = 60-100
    if (terrain.elevationFt < 2000) rawScore = 0;
    else if (terrain.elevationFt < 5000) rawScore = ((terrain.elevationFt - 2000) / 3000) * 30;
    else if (terrain.elevationFt < 8000) rawScore = 30 + ((terrain.elevationFt - 5000) / 3000) * 30;
    else rawScore = 60 + Math.min(40, ((terrain.elevationFt - 8000) / 4000) * 40);
  }

  return {
    id: 'elevation_factor',
    label: 'Elevation Factor',
    rawScore: Math.round(rawScore),
    weightedScore: 0,
    weight: DEFAULT_SCORING_WEIGHTS.elevationFactor,
    available: terrain.elevationFt != null,
    detail: terrain.elevationFt != null ? `${Math.round(terrain.elevationFt).toLocaleString()} ft` : 'No elevation data',
  };
}

// ══════════════════════════════════════════════════════════
// COMPOSITE SCORE COMPUTATION
// ══════════════════════════════════════════════════════════

export function computeRemotenessScore(
  factors: RemotenessFactor[],
  weights?: ScoringWeights,
): { score: number; factors: RemotenessFactor[] } {
  const w = weights ?? DEFAULT_SCORING_WEIGHTS;

  // Apply weights
  let totalWeight = 0;
  let weightedSum = 0;

  for (const factor of factors) {
    if (!factor.available) continue;
    factor.weightedScore = Math.round(factor.rawScore * factor.weight * 100) / 100;
    weightedSum += factor.rawScore * factor.weight;
    totalWeight += factor.weight;
  }

  // Normalize if total weight < 1 (some factors unavailable)
  const score = totalWeight > 0 ? Math.min(100, Math.max(0, weightedSum / totalWeight)) : 0;

  return { score: Math.round(score), factors };
}

// ══════════════════════════════════════════════════════════
// FORWARD REMOTENESS FORECAST
// ══════════════════════════════════════════════════════════

export function computeForwardForecast(
  currentScore: number,
  speedMph: number | null,
  connectivityState: string,
  terrainComplexity: string | null,
  elevationFt: number | null,
  hasActiveRoute: boolean,
): ForwardRemotenessForcast {
  if (!hasActiveRoute && speedMph == null) {
    return {
      available: false,
      segments: [],
      peakScore: currentScore,
      peakLevel: scoreToLevel(currentScore).level,
      peakDistanceMi: 0,
      advisory: null,
      isIncreasing: false,
    };
  }

  const speed = speedMph ?? 20;
  const segments: ForwardForecastSegment[] = [];
  let peakScore = currentScore;
  let peakDistMi = 0;

  // Generate forecast segments at 5, 10, 15, 20 miles ahead
  const distances = [5, 10, 15, 20];

  for (const distMi of distances) {
    const timeMin = speed > 0 ? Math.round((distMi / speed) * 60) : 0;

    // Predict score changes based on current trajectory
    let predictedDelta = 0;

    // If offline and complex terrain, remoteness likely increases
    if (connectivityState === 'offline') predictedDelta += 3 * (distMi / 5);
    if (terrainComplexity === 'high') predictedDelta += 2 * (distMi / 5);
    else if (terrainComplexity === 'medium') predictedDelta += 1 * (distMi / 5);

    // If high elevation, remoteness tends to increase with distance
    if (elevationFt != null && elevationFt > 6000) predictedDelta += 1.5 * (distMi / 5);

    // If online and fast, remoteness likely stable or decreasing
    if (connectivityState === 'online' && speed > 30) predictedDelta -= 2 * (distMi / 5);

    const predictedScore = Math.max(0, Math.min(100, Math.round(currentScore + predictedDelta)));
    const { level, color } = scoreToLevel(predictedScore);

    let changeDescription: string | null = null;
    if (predictedScore > currentScore + 10) {
      changeDescription = `Remoteness increasing ahead`;
    } else if (predictedScore < currentScore - 10) {
      changeDescription = `Approaching services`;
    }

    segments.push({
      distanceAheadMi: distMi,
      timeAheadMin: timeMin,
      score: predictedScore,
      level,
      color,
      changeDescription,
    });

    if (predictedScore > peakScore) {
      peakScore = predictedScore;
      peakDistMi = distMi;
    }
  }

  const isIncreasing = segments.length > 1 && segments[segments.length - 1].score > currentScore + 5;
  const { level: peakLevel } = scoreToLevel(peakScore);

  let advisory: string | null = null;
  if (peakScore >= 76 && currentScore < 76) {
    advisory = `Extreme conditions expected in ${peakDistMi} miles`;
  } else if (peakScore >= 51 && currentScore < 51) {
    advisory = `Remote terrain begins in ${peakDistMi} miles`;
  } else if (isIncreasing && peakScore > currentScore + 15) {
    advisory = `Remoteness increasing ahead`;
  }

  return {
    available: true,
    segments,
    peakScore,
    peakLevel,
    peakDistanceMi: peakDistMi,
    advisory,
    isIncreasing,
  };
}

// ══════════════════════════════════════════════════════════
// INTELLIGENCE ADVISORIES
// ══════════════════════════════════════════════════════════

const ADVISORY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const _advisoryCooldowns: Record<string, number> = {};

export function generateAdvisories(
  score: number,
  level: RemotenessLevel,
  proximity: InfrastructureProximity,
  connectivity: ConnectivityAssessment,
  terrain: TerrainContext,
  forecast: ForwardRemotenessForcast,
): RemotenessAdvisory[] {
  const advisories: RemotenessAdvisory[] = [];
  const now = Date.now();

  const emit = (id: string, severity: AdvisorySeverity, message: string, factor: string) => {
    const lastEmit = _advisoryCooldowns[id] ?? 0;
    if (now - lastEmit < ADVISORY_COOLDOWN_MS) return;
    _advisoryCooldowns[id] = now;
    advisories.push({ id, severity, message, factor, timestamp: now });
  };

  // Emergency services distance
  const emergDist = proximity.nearestEmergencyServices.distanceMi;
  if (emergDist != null && emergDist > 50) {
    emit('emerg_far', 'warning', `Emergency services over ${emergDist} miles away`, 'service_distance');
  } else if (emergDist != null && emergDist > 30) {
    emit('emerg_moderate', 'caution', `Emergency services approximately ${emergDist} miles away`, 'service_distance');
  }

  // Connectivity drop
  if (connectivity.isOffline) {
    emit('offline', 'caution', 'No cellular connectivity available', 'signal_availability');
  } else if (connectivity.signal === 'weak') {
    emit('weak_signal', 'info', 'Cellular signal degraded', 'signal_availability');
  }

  // Forward forecast warnings
  if (forecast.advisory) {
    const severity: AdvisorySeverity = forecast.peakScore >= 76 ? 'warning' : 'caution';
    emit('forecast_warning', severity, forecast.advisory, 'forecast');
  }

  // Cell coverage likely to drop
  if (forecast.isIncreasing && connectivity.signal !== 'no_signal') {
    emit('signal_drop', 'info', 'Cell coverage likely to drop in upcoming segment', 'signal_availability');
  }

  // Fuel station distance
  const fuelDist = proximity.nearestFuelStation.distanceMi;
  if (fuelDist != null && fuelDist > 60) {
    emit('fuel_far', 'caution', `Nearest fuel station approximately ${fuelDist} miles away`, 'service_distance');
  }

  // Infrastructure isolation
  const roadDist = proximity.nearestPavedRoad.distanceMi;
  if (roadDist != null && roadDist > 15) {
    emit('road_far', 'info', `Nearest paved road approximately ${roadDist} miles away`, 'infrastructure_distance');
  }

  // High terrain isolation
  if (terrain.elevationFt != null && terrain.elevationFt > 9000) {
    emit('high_elev', 'info', `High elevation: ${Math.round(terrain.elevationFt).toLocaleString()} ft`, 'elevation_factor');
  }

  return advisories;
}

// ══════════════════════════════════════════════════════════
// ROUTE CLASSIFICATION
// ══════════════════════════════════════════════════════════

export function classifyRoute(averageScore: number, peakScore: number): RouteRemotenessProfile {
  let routeClass: RouteRemotenessClass = 'urban';
  if (averageScore >= 70) routeClass = 'wilderness';
  else if (averageScore >= 50) routeClass = 'backcountry';
  else if (averageScore >= 30) routeClass = 'rural';
  else if (averageScore >= 15) routeClass = 'suburban';

  const remotePercentage = Math.min(100, Math.round((peakScore / 100) * 100));
  const isDayTripSuitable = averageScore < 50 && peakScore < 70;
  const requiresExpeditionPrep = averageScore >= 50 || peakScore >= 75;

  return {
    routeClass,
    averageScore: Math.round(averageScore),
    peakScore: Math.round(peakScore),
    remotePercentage,
    isDayTripSuitable,
    requiresExpeditionPrep,
  };
}

// ══════════════════════════════════════════════════════════
// FULL ENGINE COMPUTATION
// ══════════════════════════════════════════════════════════

export interface RemotenessEngineInput {
  speedMph: number | null;
  connectivityState: string; // 'online' | 'offline' | 'degraded' | 'unknown'
  elevationFt: number | null;
  terrainComplexity: string | null; // 'low' | 'medium' | 'high' | null
  hasActiveRoute: boolean;
  cacheReady: boolean;
  gpsLat: number | null;
  gpsLon: number | null;
  infrastructureOverride?: Partial<InfrastructureProximity> | null;
}

function mergeInfrastructureProximity(
  base: InfrastructureProximity,
  override?: Partial<InfrastructureProximity> | null,
): InfrastructureProximity {
  if (!override) return base;

  return {
    nearestPavedRoad: override.nearestPavedRoad ?? base.nearestPavedRoad,
    nearestTown: override.nearestTown ?? base.nearestTown,
    nearestFuelStation: override.nearestFuelStation ?? base.nearestFuelStation,
    nearestEmergencyServices: override.nearestEmergencyServices ?? base.nearestEmergencyServices,
    nearestServices: override.nearestServices ?? base.nearestServices,
  };
}

export function computeFullRemoteness(input: RemotenessEngineInput): {
  score: number;
  factors: RemotenessFactor[];
  proximity: InfrastructureProximity;
  connectivity: ConnectivityAssessment;
  terrain: TerrainContext;
  forecast: ForwardRemotenessForcast;
  advisories: RemotenessAdvisory[];
  reason: string;
  description: string;
  confidence: RemotenessIndexOutput['confidence'];
  priority: RemotenessIndexOutput['priority'];
} {
  // 1. Estimate infrastructure proximity, then overlay any live GPS-derived
  // lookups so road / town / fuel can stay truthful without rewriting the
  // rest of the remoteness model.
  const estimatedProximity = estimateInfrastructureProximity(
    input.speedMph,
    input.connectivityState,
    input.elevationFt,
    input.hasActiveRoute,
    input.terrainComplexity,
    input.cacheReady,
  );
  const proximity = mergeInfrastructureProximity(
    estimatedProximity,
    input.infrastructureOverride,
  );

  // 2. Assess connectivity
  const connectivity = assessConnectivity(input.connectivityState, input.cacheReady);

  // 3. Assess terrain
  const terrain = assessTerrain(
    input.elevationFt,
    input.terrainComplexity,
    input.speedMph,
    input.connectivityState,
  );

  // 4. Compute individual factors
  const factors: RemotenessFactor[] = [
    scoreServiceDistance(proximity),
    scoreInfrastructureDistance(proximity),
    scoreSignalAvailability(connectivity),
    scoreRouteIsolation(terrain),
    scorePopulationDensity(connectivity, proximity),
    scoreTerrainComplexity(terrain),
    scoreElevationFactor(terrain),
  ];

  // 5. Compute composite score
  const { score } = computeRemotenessScore(factors);
  const { level } = scoreToLevel(score);

  // 6. Compute forward forecast
  const forecast = computeForwardForecast(
    score,
    input.speedMph,
    input.connectivityState,
    input.terrainComplexity,
    input.elevationFt,
    input.hasActiveRoute,
  );

  // 7. Generate advisories
  const advisories = generateAdvisories(score, level, proximity, connectivity, terrain, forecast);

  // 8. Generate reason and description
  const reason = generateReason(score, connectivity, terrain, proximity);
  const description = getLevelDescription(level);
  const confidence = assessRemotenessConfidence({
    hasGpsFix: typeof input.gpsLat === 'number' && typeof input.gpsLon === 'number',
    hasSpeedSignal: typeof input.speedMph === 'number',
    hasElevationSignal: typeof input.elevationFt === 'number',
    hasRouteContext: !!input.hasActiveRoute,
    connectivityFreshness:
      input.connectivityState === 'online'
        ? 'fresh'
        : input.connectivityState === 'degraded'
          ? 'aging'
          : input.connectivityState === 'offline'
            ? 'aging'
            : 'unknown',
    availableFactors: factors.filter((factor) => factor.available).length,
    totalFactors: factors.length,
    offline: input.connectivityState === 'offline',
  });
  const priority = assessRemotenessPriority({
    score,
    level,
    routeActive: input.hasActiveRoute,
    noSignal: connectivity.isOffline || connectivity.signal === 'no_signal',
    forecastIncreasing: forecast.isIncreasing,
    confidence,
  });
  const explanation = explainRecommendation({
    type: 'remoteness',
    drivers: [
      factors.find((factor) => factor.available)?.label ?? '',
      proximity.nearestEmergencyServices.distanceMi != null
        ? `emergency services ~${proximity.nearestEmergencyServices.distanceMi}mi`
        : '',
      connectivity.signal === 'no_signal' ? 'weak signal' : terrain.isBackcountry ? 'route isolation' : '',
    ],
    confidenceLevel: confidence.level,
    priorityLevel: priority.level,
  });

  return {
    score,
    factors,
    proximity,
    connectivity,
    terrain,
    forecast,
    advisories,
    reason,
    description,
    confidence,
    priority,
  };
}

function generateReason(
  score: number,
  connectivity: ConnectivityAssessment,
  terrain: TerrainContext,
  proximity: InfrastructureProximity,
): string {
  if (connectivity.isOffline && terrain.isBackcountry) {
    return 'Offline backcountry conditions';
  }
  if (connectivity.isOffline) {
    return 'No connectivity — limited infrastructure';
  }
  if (connectivity.signal === 'weak' && terrain.complexityScore > 50) {
    return 'Degraded signal with complex terrain';
  }
  if (terrain.isBackcountry) {
    return 'Backcountry terrain conditions';
  }
  const emergDist = proximity.nearestEmergencyServices.distanceMi;
  if (emergDist != null && emergDist > 40) {
    return `Emergency services ~${emergDist} mi away`;
  }
  if (terrain.complexityScore > 60) {
    return 'High terrain complexity';
  }
  if (score < 20) {
    return 'Near services and infrastructure';
  }
  if (terrain.elevationFt != null && terrain.elevationFt > 7000) {
    return `High elevation: ${Math.round(terrain.elevationFt).toLocaleString()} ft`;
  }
  return 'Moderate conditions';
}

