// ============================================================
// DISCOVERY INTELLIGENCE ENGINE
// ============================================================
// Combines hidden gems logic, diversity rotation, risk preview,
// vehicle capability matching, and route label assignment for
// the ECS Discovery AI Route Suggestions system.
//
// Features:
//   - Hidden Gem scoring with weighted multi-factor model
//   - Route label assignment (Known Route, AI Suggested, etc.)
//   - Diversity rotation to prevent repetitive feeds
//   - Pre-trip risk preview for discovery routes
//   - Vehicle capability matching for route suitability
//   - Integration with Remoteness, Risk, and Vehicle systems
//   - Route confidence evaluation for AI suggestions
//   - Mixed feed builder for unified discovery experience
//   - Route comparison for side-by-side evaluation
//   - Saved routes management
// ============================================================

import type { ExpeditionOpportunity } from './discoverEngine';
import type { AIGeneratedRoute, AIRouteConfidence } from './aiRouteTypes';
import type { CompatibilityResult, VehicleProfile } from './rigCompatibilityEngine';

const TAG = '[DiscoveryIntel]';

// ══════════════════════════════════════════════════════════
// ROUTE LABELS
// ══════════════════════════════════════════════════════════

export type RouteLabel =
  | 'Known Route'
  | 'AI Suggested'
  | 'Hidden Gem'
  | 'Remote Option'
  | 'Good Candidate'
  | 'Expedition Idea'
  | 'Local Favorite';

export interface RouteLabelConfig {
  label: RouteLabel;
  color: string;
  icon: string;
  priority: number;
}

export const ROUTE_LABEL_CONFIGS: Record<RouteLabel, RouteLabelConfig> = {
  'Known Route':     { label: 'Known Route',     color: '#4CAF50', icon: 'checkmark-circle-outline', priority: 5 },
  'AI Suggested':    { label: 'AI Suggested',    color: '#5AC8FA', icon: 'sparkles-outline',         priority: 3 },
  'Hidden Gem':      { label: 'Hidden Gem',      color: '#E67E22', icon: 'diamond-outline',          priority: 1 },
  'Remote Option':   { label: 'Remote Option',   color: '#C0392B', icon: 'radio-outline',            priority: 2 },
  'Good Candidate':  { label: 'Good Candidate',  color: '#66BB6A', icon: 'thumbs-up-outline',        priority: 4 },
  'Expedition Idea': { label: 'Expedition Idea', color: '#D4A017', icon: 'compass-outline',          priority: 3 },
  'Local Favorite':  { label: 'Local Favorite',  color: '#8B6FC0', icon: 'heart-outline',            priority: 6 },
};

export function getRouteLabelConfig(label: RouteLabel): RouteLabelConfig {
  return ROUTE_LABEL_CONFIGS[label] ?? ROUTE_LABEL_CONFIGS['Known Route'];
}

// ══════════════════════════════════════════════════════════
// HIDDEN GEM SCORING MODEL
// ══════════════════════════════════════════════════════════

export interface HiddenGemScore {
  score: number;
  isGem: boolean;
  factors: {
    lowPopularity: number;
    scenicValue: number;
    remoteness: number;
    terrainVariety: number;
    explorationValue: number;
    freshness: number;
  };
}

const GEM_W_POPULARITY  = 0.30;
const GEM_W_SCENIC      = 0.20;
const GEM_W_REMOTENESS  = 0.20;
const GEM_W_TERRAIN     = 0.10;
const GEM_W_EXPLORATION = 0.10;
const GEM_W_FRESHNESS   = 0.10;
const HIDDEN_GEM_THRESHOLD = 60;

export function computeHiddenGemScore(
  op: ExpeditionOpportunity,
  recentlyShownIds: Set<string> = new Set(),
): HiddenGemScore {
  const popularity = op.popularityScore ?? 50;
  const lowPopularity = Math.max(0, 100 - popularity);

  const elevNorm = Math.min(op.elevationGainFt / 8000, 1) * 70;
  const highlightBonus = Math.min((op.highlights?.length ?? 0) / 4, 1) * 30;
  const scenicValue = Math.min(Math.round(elevNorm + highlightBonus), 100);

  const remoteness = Math.min((op.remotenessScore ?? 5) * 10, 100);

  const terrainType = (op.terrainType ?? '').toLowerCase();
  let terrainVariety = 50;
  if (terrainType.includes('/')) terrainVariety += 20;
  if (terrainType.includes('canyon')) terrainVariety += 10;
  if (terrainType.includes('alpine')) terrainVariety += 10;
  if (terrainType.includes('forest')) terrainVariety += 5;
  terrainVariety = Math.min(terrainVariety, 100);

  const campsNorm = Math.min((op.suggestedCamps ?? 0) / 4, 1) * 40;
  const daysNorm = Math.min((op.estimatedDays ?? 1) / 4, 1) * 30;
  const distNorm = Math.min((op.distanceMiles ?? 50) / 200, 1) * 30;
  const explorationValue = Math.min(Math.round(campsNorm + daysNorm + distNorm), 100);

  const freshness = recentlyShownIds.has(op.id) ? 20 : 80;

  const score = Math.round(
    lowPopularity * GEM_W_POPULARITY +
    scenicValue * GEM_W_SCENIC +
    remoteness * GEM_W_REMOTENESS +
    terrainVariety * GEM_W_TERRAIN +
    explorationValue * GEM_W_EXPLORATION +
    freshness * GEM_W_FRESHNESS
  );

  return {
    score: clamp(score, 0, 100),
    isGem: score >= HIDDEN_GEM_THRESHOLD,
    factors: { lowPopularity, scenicValue, remoteness, terrainVariety, explorationValue, freshness },
  };
}

// ══════════════════════════════════════════════════════════
// ROUTE LABEL ASSIGNMENT
// ══════════════════════════════════════════════════════════

export function assignRouteLabel(
  op: ExpeditionOpportunity,
  gemScore: HiddenGemScore,
): RouteLabel {
  if (gemScore.isGem) return 'Hidden Gem';
  if ((op.remotenessScore ?? 0) >= 8) return 'Remote Option';
  if ((op.matchScore ?? 0) >= 70 || (op as any).discoveryScore >= 70) return 'Good Candidate';
  if ((op.popularityScore ?? 0) >= 65) return 'Local Favorite';
  return 'Known Route';
}

export function assignAIRouteLabel(route: AIGeneratedRoute): RouteLabel {
  if (route.confidence === 'explore') return 'Expedition Idea';
  if ((route.remotenessScore ?? 0) >= 8) return 'Remote Option';
  if (route.confidence === 'high') return 'AI Suggested';
  return 'AI Suggested';
}

// ══════════════════════════════════════════════════════════
// PRE-TRIP RISK PREVIEW
// ══════════════════════════════════════════════════════════

export type RiskPreviewLevel = 'Low' | 'Moderate' | 'Elevated' | 'High';

export interface RouteRiskPreview {
  level: RiskPreviewLevel;
  score: number;
  color: string;
  descriptor: string;
  factors: string[];
  vehicleSuitable: boolean;
  vehicleNote: string;
}

const RISK_PREVIEW_COLORS: Record<RiskPreviewLevel, string> = {
  Low: '#4CAF50',
  Moderate: '#FFB300',
  Elevated: '#E67E22',
  High: '#EF5350',
};

export function computeRouteRiskPreview(
  op: ExpeditionOpportunity,
  vehicleProfile: VehicleProfile | null,
  compatResult: CompatibilityResult | null,
): RouteRiskPreview {
  const factors: string[] = [];
  let riskScore = 0;

  // Remoteness contribution (0–30)
  const remoteness = op.remotenessScore ?? 5;
  riskScore += Math.min(remoteness / 10, 1) * 30;
  if (remoteness >= 8) factors.push('High remoteness — limited services');
  else if (remoteness >= 6) factors.push('Moderate remoteness');

  // Terrain difficulty contribution (0–25)
  const difficulty = op.terrainDifficulty ?? 5;
  riskScore += Math.min(difficulty / 10, 1) * 25;
  if (difficulty >= 8) factors.push('Challenging terrain');
  else if (difficulty >= 6) factors.push('Moderate terrain difficulty');

  // Duration contribution (0–15)
  const days = op.estimatedDays ?? 1;
  riskScore += Math.min(days / 7, 1) * 15;
  if (days >= 4) factors.push(`${days}-day route requires planning`);

  // Vehicle capability mismatch (0–20)
  let vehicleSuitable = true;
  let vehicleNote = 'Vehicle assessment unavailable';

  if (compatResult) {
    const cScore = compatResult.score ?? 60;
    riskScore += Math.max(0, (100 - cScore) / 100) * 20;
    if (cScore >= 75) {
      vehicleNote = 'Vehicle well-suited for this route';
    } else if (cScore >= 50) {
      vehicleNote = 'Vehicle adequate — some challenges possible';
      factors.push('Vehicle capability may be tested');
    } else {
      vehicleSuitable = false;
      vehicleNote = 'Route may exceed vehicle capability';
      factors.push('Route may exceed vehicle setup');
    }
  } else if (vehicleProfile) {
    vehicleNote = 'Basic vehicle assessment available';
    vehicleSuitable = difficulty <= 6;
    if (!vehicleSuitable) {
      riskScore += 10;
      factors.push('Verify vehicle suitability for terrain');
    }
  }

  // Fuel requirement contribution (0–10)
  const fuelReq = op.estimatedFuelRequired ?? 10;
  if (fuelReq >= 20) {
    riskScore += 10;
    factors.push('High fuel requirement — plan resupply');
  } else if (fuelReq >= 14) {
    riskScore += 5;
    factors.push('Moderate fuel requirement');
  }

  riskScore = clamp(Math.round(riskScore), 0, 100);

  let level: RiskPreviewLevel;
  if (riskScore <= 25) level = 'Low';
  else if (riskScore <= 50) level = 'Moderate';
  else if (riskScore <= 75) level = 'Elevated';
  else level = 'High';

  const descriptors: Record<RiskPreviewLevel, string> = {
    Low: 'Low exposure — straightforward trip',
    Moderate: 'Moderate exposure — standard preparation',
    Elevated: 'Elevated exposure — thorough preparation recommended',
    High: 'High exposure — advanced preparation required',
  };

  const topFactors = factors.slice(0, 3);
  if (topFactors.length === 0) topFactors.push('No significant risk factors identified');

  return {
    level,
    score: riskScore,
    color: RISK_PREVIEW_COLORS[level],
    descriptor: descriptors[level],
    factors: topFactors,
    vehicleSuitable,
    vehicleNote,
  };
}

// ══════════════════════════════════════════════════════════
// VEHICLE CAPABILITY MATCH
// ══════════════════════════════════════════════════════════

export interface VehicleMatchResult {
  score: number;
  level: 'Excellent' | 'Good' | 'Adequate' | 'Challenging' | 'Exceeds Setup';
  color: string;
  note: string;
  concerns: string[];
}

export function evaluateVehicleMatch(
  op: ExpeditionOpportunity,
  vehicleProfile: VehicleProfile | null,
  compatResult: CompatibilityResult | null,
): VehicleMatchResult {
  if (!vehicleProfile) {
    return { score: 0, level: 'Adequate', color: '#8B949E', note: 'Add a vehicle to see capability match', concerns: [] };
  }

  const concerns: string[] = [];
  let score = compatResult?.score ?? 60;

  if (op.recommendedTireSize && vehicleProfile.tireSizeInches) {
    const tireDiff = vehicleProfile.tireSizeInches - op.recommendedTireSize;
    if (tireDiff < -2) {
      concerns.push(`Recommended ${op.recommendedTireSize}" tires — current setup may be undersized`);
      score = Math.max(score - 10, 0);
    }
  }

  if (op.recommendedLift != null) {
    const liftDiff = (vehicleProfile.suspensionLiftInches ?? 0) - op.recommendedLift;
    if (liftDiff < -1) {
      concerns.push(`Recommended ${op.recommendedLift}" lift — current clearance may be limited`);
      score = Math.max(score - 5, 0);
    }
  }

  let level: VehicleMatchResult['level'];
  let color: string;
  if (score >= 85) { level = 'Excellent'; color = '#4CAF50'; }
  else if (score >= 70) { level = 'Good'; color = '#66BB6A'; }
  else if (score >= 50) { level = 'Adequate'; color = '#FFB300'; }
  else if (score >= 30) { level = 'Challenging'; color = '#E67E22'; }
  else { level = 'Exceeds Setup'; color = '#EF5350'; }

  const vName = vehicleProfile.vehicleName ?? 'Your vehicle';
  const note = score >= 70
    ? `${vName} is well-matched for this route`
    : score >= 50
    ? `${vName} can handle this route with care`
    : `This route may challenge ${vName}'s current setup`;

  return { score, level, color, note, concerns };
}

// ══════════════════════════════════════════════════════════
// DIVERSITY & ROTATION ENGINE
// ══════════════════════════════════════════════════════════

const recentlyShownRoutes: Set<string> = new Set();
const MAX_RECENTLY_SHOWN = 50;

export function recordShownRoutes(ids: string[]): void {
  for (const id of ids) recentlyShownRoutes.add(id);
  if (recentlyShownRoutes.size > MAX_RECENTLY_SHOWN) {
    const arr = Array.from(recentlyShownRoutes);
    for (const id of arr.slice(0, arr.length - MAX_RECENTLY_SHOWN)) recentlyShownRoutes.delete(id);
  }
}

export function getRecentlyShownRoutes(): Set<string> {
  return new Set(recentlyShownRoutes);
}

export function applyDiversityScoring<T extends ExpeditionOpportunity>(
  routes: T[],
  maxResults: number = 20,
): T[] {
  if (routes.length <= maxResults) return routes;

  const terrainGroups = new Map<string, T[]>();
  for (const route of routes) {
    const terrain = route.terrainType ?? 'Unknown';
    if (!terrainGroups.has(terrain)) terrainGroups.set(terrain, []);
    terrainGroups.get(terrain)!.push(route);
  }

  const result: T[] = [];
  const groupArrays = Array.from(terrainGroups.values());
  let groupIdx = 0;
  let itemIdx = 0;

  while (result.length < maxResults && result.length < routes.length) {
    const group = groupArrays[groupIdx % groupArrays.length];
    if (group && itemIdx < group.length) {
      const item = group[itemIdx];
      if (item && !result.find(r => r.id === item.id)) result.push(item);
    }
    groupIdx++;
    if (groupIdx % groupArrays.length === 0) itemIdx++;
    if (groupIdx > routes.length * 3) break;
  }

  return result;
}

// ══════════════════════════════════════════════════════════
// ENRICHED DISCOVERY ROUTE
// ══════════════════════════════════════════════════════════

export interface EnrichedDiscoveryRoute extends ExpeditionOpportunity {
  routeLabel: RouteLabel;
  routeLabelConfig: RouteLabelConfig;
  gemScore: HiddenGemScore;
  riskPreview: RouteRiskPreview;
  vehicleMatch: VehicleMatchResult;
  isAIGenerated?: boolean;
  aiConfidence?: AIRouteConfidence;
}

export function enrichKnownRoute(
  op: ExpeditionOpportunity,
  vehicleProfile: VehicleProfile | null,
  compatResult: CompatibilityResult | null,
): EnrichedDiscoveryRoute {
  const gemScore = computeHiddenGemScore(op, recentlyShownRoutes);
  const routeLabel = assignRouteLabel(op, gemScore);
  return {
    ...op,
    routeLabel,
    routeLabelConfig: getRouteLabelConfig(routeLabel),
    gemScore,
    riskPreview: computeRouteRiskPreview(op, vehicleProfile, compatResult),
    vehicleMatch: evaluateVehicleMatch(op, vehicleProfile, compatResult),
  };
}

export function enrichAIRoute(
  route: AIGeneratedRoute,
  vehicleProfile: VehicleProfile | null,
): EnrichedDiscoveryRoute {
  const gemScore = computeHiddenGemScore(route, recentlyShownRoutes);
  const routeLabel = assignAIRouteLabel(route);
  return {
    ...route,
    routeLabel,
    routeLabelConfig: getRouteLabelConfig(routeLabel),
    gemScore,
    riskPreview: computeRouteRiskPreview(route, vehicleProfile, null),
    vehicleMatch: evaluateVehicleMatch(route, vehicleProfile, null),
    isAIGenerated: true,
    aiConfidence: route.confidence,
  };
}

export function enrichKnownRoutes(
  routes: ExpeditionOpportunity[],
  vehicleProfile: VehicleProfile | null,
  compatResults: Map<string, CompatibilityResult>,
): EnrichedDiscoveryRoute[] {
  return routes.map(op => enrichKnownRoute(op, vehicleProfile, compatResults.get(op.id) ?? null));
}

export function enrichAIRoutes(
  routes: AIGeneratedRoute[],
  vehicleProfile: VehicleProfile | null,
): EnrichedDiscoveryRoute[] {
  return routes.map(route => enrichAIRoute(route, vehicleProfile));
}

// ══════════════════════════════════════════════════════════
// MIXED FEED BUILDER
// ══════════════════════════════════════════════════════════

export interface MixedFeedOptions {
  maxRoutes?: number;
  boostHiddenGems?: boolean;
  interleave?: boolean;
  minAIRoutes?: number;
}

export function buildMixedFeed(
  knownRoutes: EnrichedDiscoveryRoute[],
  aiRoutes: EnrichedDiscoveryRoute[],
  options: MixedFeedOptions = {},
): EnrichedDiscoveryRoute[] {
  const { maxRoutes = 20, boostHiddenGems = false, interleave = true, minAIRoutes = 2 } = options;

  if (!interleave) return [...knownRoutes, ...aiRoutes].slice(0, maxRoutes);

  const sortedKnown = [...knownRoutes].sort((a, b) => {
    if (boostHiddenGems) {
      if (a.gemScore.isGem && !b.gemScore.isGem) return -1;
      if (!a.gemScore.isGem && b.gemScore.isGem) return 1;
    }
    return ((b as any).discoveryScore ?? 0) - ((a as any).discoveryScore ?? 0);
  });

  const result: EnrichedDiscoveryRoute[] = [];
  const aiQueue = [...aiRoutes];
  const knownQueue = [...sortedKnown];
  const insertInterval = Math.max(2, Math.floor(knownQueue.length / Math.max(aiQueue.length, 1)));
  let knownCount = 0;
  let aiInserted = 0;

  while (result.length < maxRoutes && (knownQueue.length > 0 || aiQueue.length > 0)) {
    if (knownQueue.length > 0) {
      result.push(knownQueue.shift()!);
      knownCount++;
    }
    if (aiQueue.length > 0 && (knownCount % insertInterval === 0 || knownQueue.length === 0)) {
      result.push(aiQueue.shift()!);
      aiInserted++;
    }
  }

  while (aiInserted < minAIRoutes && aiQueue.length > 0 && result.length < maxRoutes) {
    result.push(aiQueue.shift()!);
    aiInserted++;
  }

  return result.slice(0, maxRoutes);
}

// ══════════════════════════════════════════════════════════
// EXPEDITION INTELLIGENCE MESSAGES
// ══════════════════════════════════════════════════════════

export function generateRouteIntelligence(route: EnrichedDiscoveryRoute): string[] {
  const messages: string[] = [];

  if (route.riskPreview.level === 'High') messages.push('High expedition exposure — thorough preparation recommended');
  else if (route.riskPreview.level === 'Elevated') messages.push('Elevated exposure — plan for limited services');

  if ((route.remotenessScore ?? 0) >= 9) messages.push('Extreme remoteness — expect no cell coverage or services');
  else if ((route.remotenessScore ?? 0) >= 7) messages.push('High remoteness — limited services along route');

  if (!route.vehicleMatch.vehicleSuitable) messages.push('Route may challenge current vehicle setup');
  if (route.vehicleMatch.concerns.length > 0) messages.push(route.vehicleMatch.concerns[0]);
  if (route.gemScore.isGem) messages.push('Lesser-known route with strong exploration potential');
  if ((route.estimatedFuelRequired ?? 0) >= 20) messages.push('Plan fuel resupply — high fuel requirement');
  if ((route.estimatedDays ?? 1) >= 4) messages.push(`${route.estimatedDays}-day route — ensure adequate supplies`);
  if (route.permitRequired) messages.push('Permit required — verify availability before departure');

  return messages.slice(0, 4);
}

// ══════════════════════════════════════════════════════════
// ROUTE COMPARISON
// ══════════════════════════════════════════════════════════

export interface RouteComparison {
  routeA: EnrichedDiscoveryRoute;
  routeB: EnrichedDiscoveryRoute;
  comparison: { field: string; label: string; valueA: string; valueB: string; advantage: 'A' | 'B' | 'equal' }[];
}

export function compareRoutes(routeA: EnrichedDiscoveryRoute, routeB: EnrichedDiscoveryRoute): RouteComparison {
  return {
    routeA,
    routeB,
    comparison: [
      { field: 'distance', label: 'Distance', valueA: `${routeA.distanceMiles} mi`, valueB: `${routeB.distanceMiles} mi`, advantage: routeA.distanceMiles < routeB.distanceMiles ? 'A' : routeA.distanceMiles > routeB.distanceMiles ? 'B' : 'equal' },
      { field: 'duration', label: 'Duration', valueA: `${routeA.estimatedDays}d`, valueB: `${routeB.estimatedDays}d`, advantage: routeA.estimatedDays < routeB.estimatedDays ? 'A' : routeA.estimatedDays > routeB.estimatedDays ? 'B' : 'equal' },
      { field: 'remoteness', label: 'Remoteness', valueA: `${routeA.remotenessScore}/10`, valueB: `${routeB.remotenessScore}/10`, advantage: 'equal' },
      { field: 'risk', label: 'Risk Preview', valueA: routeA.riskPreview.level, valueB: routeB.riskPreview.level, advantage: routeA.riskPreview.score < routeB.riskPreview.score ? 'A' : routeA.riskPreview.score > routeB.riskPreview.score ? 'B' : 'equal' },
      { field: 'vehicleMatch', label: 'Vehicle Match', valueA: routeA.vehicleMatch.level, valueB: routeB.vehicleMatch.level, advantage: routeA.vehicleMatch.score > routeB.vehicleMatch.score ? 'A' : routeA.vehicleMatch.score < routeB.vehicleMatch.score ? 'B' : 'equal' },
      { field: 'difficulty', label: 'Difficulty', valueA: `${routeA.terrainDifficulty ?? 5}/10`, valueB: `${routeB.terrainDifficulty ?? 5}/10`, advantage: 'equal' },
      { field: 'fuel', label: 'Fuel Required', valueA: `${routeA.estimatedFuelRequired} gal`, valueB: `${routeB.estimatedFuelRequired} gal`, advantage: routeA.estimatedFuelRequired < routeB.estimatedFuelRequired ? 'A' : routeA.estimatedFuelRequired > routeB.estimatedFuelRequired ? 'B' : 'equal' },
    ],
  };
}

// ══════════════════════════════════════════════════════════
// SAVED ROUTES
// ══════════════════════════════════════════════════════════

const savedRouteIds: Set<string> = new Set();

export function saveRoute(id: string): void { savedRouteIds.add(id); }
export function unsaveRoute(id: string): void { savedRouteIds.delete(id); }
export function isRouteSaved(id: string): boolean { return savedRouteIds.has(id); }
export function getSavedRouteIds(): Set<string> { return new Set(savedRouteIds); }
export function toggleSaveRoute(id: string): boolean {
  if (savedRouteIds.has(id)) { savedRouteIds.delete(id); return false; }
  savedRouteIds.add(id); return true;
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

