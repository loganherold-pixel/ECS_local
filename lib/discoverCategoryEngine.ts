// ============================================================
// DISCOVER CATEGORY ENGINE — Trip Category Tabs & Discovery Score
// ============================================================
// Phase 16: Discovery Tab Expansion & Trip Categories
//
// NEW CATEGORY TABS:
//   1. Day Trips     — Under 6 hours, under 150 miles, lower remoteness
//   2. Weekend Trips  — 1–2 days, 50–300 miles, moderate remoteness
//   3. Expeditions    — Multi-day (3+), over 200 miles, high scenic value
//   4. Remote Routes  — High remoteness (7+), limited services, off-grid
//
// DISCOVERY SCORE:
//   Scenic Value + Route Quality + Exploration Potential
//   + Remoteness Score + Distance Relevance - Overexposure Penalty
//
// HIDDEN GEMS:
//   Routes with low popularity, high scenery, high remoteness,
//   and good terrain variety are tagged and boosted.
//
// BACKWARD COMPATIBILITY:
//   Old exports (weekendAdventures, quietExploration, expeditionRoutes)
//   are still available via the legacy categorizeRoutes function.
// ============================================================

import type { ExpeditionOpportunity } from './discoverEngine';
import type { CompatibilityResult, VehicleProfile } from './rigCompatibilityEngine';
import type { ECSOperationalState } from './ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from './ai/expeditionPhaseTypes';
import { explainRecommendation } from './ai/recommendationExplanationEngine';
import type { ECSLiveStatusResult } from './status/liveStatusTypes';

const TAG = '[DISCOVER-CATEGORY]';
let lastCategorizationSummary: string | null = null;

// ── Discovery Tab IDs ────────────────────────────────────────
export type DiscoveryTabId = 'day-trips' | 'weekend-trips' | 'expeditions' | 'remote-routes';

export const DISCOVERY_TABS: { id: DiscoveryTabId; label: string; icon: string; accentColor: string; description: string }[] = [
  { id: 'day-trips',      label: 'DAY TRIPS',      icon: 'sunny-outline',     accentColor: '#66BB6A',                     description: 'Short routes under 6 hours — perfect for a day out' },
  { id: 'weekend-trips',  label: 'WEEKEND TRIPS',   icon: 'moon-outline',      accentColor: 'rgba(140, 120, 210, 0.85)',   description: '1–2 day routes for overnight exploration' },
  { id: 'expeditions',    label: 'EXPEDITIONS',     icon: 'compass-outline',   accentColor: 'rgba(200, 150, 60, 0.85)',    description: 'Multi-day backcountry routes for extended travel' },
  { id: 'remote-routes',  label: 'REMOTE ROUTES',   icon: 'radio-outline',     accentColor: '#E67E22',                     description: 'High-remoteness routes with limited services' },
];

// ── Category Thresholds ──────────────────────────────────────
const DAY_TRIP_MAX_HOURS = 6;
const DAY_TRIP_MAX_MILES = 150;
const DAY_TRIP_MAX_DAYS = 1;

const WEEKEND_MIN_MILES = 50;
const WEEKEND_MAX_MILES = 300;
const WEEKEND_MIN_DAYS = 1;
const WEEKEND_MAX_DAYS = 2;

const EXPEDITION_MIN_MILES = 200;
const EXPEDITION_MIN_DAYS = 3;

const REMOTE_MIN_REMOTENESS = 7;

// ── Hidden Gem Thresholds ────────────────────────────────────
const HIDDEN_GEM_MAX_POPULARITY = 42;
const HIDDEN_GEM_UNKNOWN_POPULARITY = 34;
const HIDDEN_GEM_MIN_REMOTENESS = 6;
const HIDDEN_GEM_MIN_SCENERY = 3; // elevation gain proxy
const HIDDEN_GEM_MIN_LENGTH_MILES = 5;
const HIDDEN_GEM_HIGH_CONFIDENCE_MIN = 70;
const HIDDEN_GEM_MEDIUM_CONFIDENCE_MIN = 54;
const HIDDEN_GEM_RECOVERY_MIN_COUNT = 6;
const POPULAR_TRAIL_MIN_POPULARITY = 50;
const POPULAR_TRAIL_KEYWORDS = [
  'iconic',
  'legendary',
  'famous',
  'bucket list',
  'bucket-list',
  'destination',
  'flagship',
  'infamous',
  'backcountry discovery route',
  ' bdr',
];
const MARQUEE_TRAIL_NAMES = [
  'rubicon',
  'white rim',
  'mojave road',
  'alpine loop',
  'black bear',
  'death valley',
  'poughkeepsie gulch',
];
const ROUTE_NAME_STOP_WORDS = new Set([
  'trail',
  'trails',
  'route',
  'routes',
  'road',
  'loop',
  'pass',
  'byway',
  'traverse',
  'corridor',
  'district',
  'section',
]);
const HIDDEN_GEM_MAX_FOOTPRINT_MILES = 260;
const HIDDEN_GEM_MAX_DURATION_DAYS = 3;
const HIKING_ROUTE_KEYWORDS = [
  'hiking',
  'hike',
  'hiker',
  'foot trail',
  'footpath',
  'backpacking',
  'wilderness trail',
];
const PEDESTRIAN_ROUTE_KEYWORDS = [
  'pedestrian',
  'walking path',
  'walkway',
  'greenway',
  'sidewalk',
  'promenade',
  'connector path',
];
const BIKE_ONLY_ROUTE_KEYWORDS = [
  'bike only',
  'bicycle only',
  'cycling route',
  'mountain bike',
  'flow trail',
  'pump track',
];
const MOTO_ONLY_ROUTE_KEYWORDS = [
  'motocross',
  'mx park',
  'dirt bike',
  'singletrack',
  'single track',
  'enduro',
  'atv only',
  'utv only',
  'ohv park',
];
const AMBIGUOUS_ARTIFACT_KEYWORDS = [
  'utility corridor',
  'drainage',
  'wash connector',
  'service spur',
  'maintenance track',
];
const OFFROAD_ROUTE_KEYWORDS = [
  '4x4',
  'overland',
  'forest service road',
  'service road',
  'two track',
  'two-track',
  'jeep trail',
  'fire road',
  'backcountry road',
  'trail road',
  'creek crossing',
  'shelf road',
  'rock garden',
];

// ── Overexposure Penalty ─────────────────────────────────────
const OVEREXPOSURE_THRESHOLD = 70; // popularity score above which penalty kicks in
const OVEREXPOSURE_PENALTY_MAX = 20; // max points deducted

// ── Category Types ───────────────────────────────────────────
export interface CategorizedRoute extends ExpeditionOpportunity {
  categoryScore: number;  // 0–100 category-specific ranking score
  discoveryScore?: number; // 0–100 discovery score with overexposure penalty
}

export interface DiscoverCategories {
  weekendAdventures: CategorizedRoute[];
  quietExploration: CategorizedRoute[];
  expeditionRoutes: CategorizedRoute[];
}

export interface ExpandedDiscoverCategories {
  dayTrips: CategorizedRoute[];
  weekendTrips: CategorizedRoute[];
  expeditions: CategorizedRoute[];
  remoteRoutes: CategorizedRoute[];
  all: CategorizedRoute[];
}

export type HiddenGemRecommendationReason =
  | 'good_full_size_truck_fit'
  | 'good_jeep_fit'
  | 'good_adventure_van_fit'
  | 'good_vehicle_fit'
  | 'low_traffic'
  | 'seasonally_open'
  | 'weather_compatible'
  | 'moderate_challenge_match'
  | 'useful_expedition_alternative'
  | 'nearby_option';

export type HiddenGemDisqualificationReason =
  | 'popular_trail'
  | 'too_short'
  | 'seasonal_closure'
  | 'weather_risk'
  | 'access_restricted'
  | 'rig_mismatch'
  | 'hazard_flagged'
  | 'radius_exceeded'
  | 'oversized_destination'
  | 'insufficient_local_distinction'
  | 'excluded_hiking'
  | 'excluded_pedestrian'
  | 'excluded_moto_only'
  | 'excluded_bike_only'
  | 'suppressed_low_confidence';

export type ExploreRouteClassification =
  | 'candidate_vehicle_trail'
  | 'candidate_hidden_gem'
  | 'accepted_hidden_gem'
  | 'suppressed_low_confidence'
  | 'excluded_hiking'
  | 'excluded_pedestrian'
  | 'excluded_moto_only'
  | 'excluded_bike_only'
  | 'excluded_popular'
  | 'excluded_duplicate'
  | 'visible_with_warning'
  | 'suppressed_not_viable';

export type HiddenGemConfidenceTier = 'high' | 'medium' | 'low' | 'excluded';

export type HiddenGemSeasonStatus = 'open' | 'limited' | 'closed' | 'unknown';
export type HiddenGemWeatherStatus = 'compatible' | 'caution' | 'blocked' | 'unknown';
export type HiddenGemAccessStatus = 'open' | 'permit' | 'restricted' | 'unknown';
export type HiddenGemHazardStatus = 'clear' | 'caution' | 'blocked' | 'unknown';

export interface ExploreRouteSourceMetadata {
  identityKey: string;
  classification: ExploreRouteClassification;
  confidenceTier: HiddenGemConfidenceTier;
  confidenceScore: number;
  sourceReliabilityScore: number;
  metadataQualityScore: number;
  geometryConfidenceScore: number;
  vehicleTrailSignalScore: number;
  popularityScore: number | null;
  remotenessScore: number | null;
  compatibilityScore: number | null;
  compatibilityRating: string | null;
  permitRequired: boolean;
  distanceFromUserMiles: number | null;
  vehicleSignals: string[];
  exclusionSignals: string[];
  baseHiddenGemScore?: number;
  popularTrailBaseScore?: number;
  confidenceWeightedScore: number;
  confidenceWeight: number;
  promotionStrength: 'highlight' | 'standard' | 'softened' | 'suppressed';
  rationaleDrivers: string[];
  rationaleText: string | null;
  refinementSuppressionReason: string | null;
  classificationConfidence?: number;
  practicalityScore?: number;
  routeQualityScore?: number;
  weatherRelevanceScore?: number;
  tripTypeFitScore?: number;
  phaseAdjustment?: number;
}

type CuratedPopularTrailRoute = CategorizedRoute & {
  sourceMetadata?: ExploreRouteSourceMetadata;
};

export interface HiddenGemResult {
  id: string;
  name: string;
  distanceMiles: number;
  isPopular: boolean;
  hiddenGemEligible: boolean;
  suitabilityScore: number;
  hiddenGemScore: number;
  seasonStatus: HiddenGemSeasonStatus;
  weatherStatus: HiddenGemWeatherStatus;
  accessStatus: HiddenGemAccessStatus;
  hazardStatus: HiddenGemHazardStatus;
  rigFitSummary: string;
  recommendationReasons: HiddenGemRecommendationReason[];
  disqualificationReasons: HiddenGemDisqualificationReason[];
  sourceMetadata?: {
    identityKey: string;
    classification: ExploreRouteClassification;
    confidenceTier: HiddenGemConfidenceTier;
    confidenceScore: number;
    sourceReliabilityScore: number;
    metadataQualityScore: number;
    geometryConfidenceScore: number;
    vehicleTrailSignalScore: number;
    popularityScore: number | null;
    remotenessScore: number | null;
    compatibilityScore: number | null;
    compatibilityRating: string | null;
    permitRequired: boolean;
    distanceFromUserMiles: number | null;
    vehicleSignals: string[];
    exclusionSignals: string[];
    baseHiddenGemScore: number;
    confidenceWeightedScore: number;
    confidenceWeight: number;
    promotionStrength: 'highlight' | 'standard' | 'softened' | 'suppressed';
    rationaleDrivers: string[];
    rationaleText: string | null;
    refinementSuppressionReason: string | null;
    tripTypeFitScore: number;
  };
  route: CategorizedRoute;
}

export interface HiddenGemPipelineDiagnostics {
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  radiusMatchedCount: number;
  tripTypeMatchedCount: number;
  hiddenGemEligibilityCount: number;
  popularTrailSuppressedCount: number;
  qualityThresholdRejectedCount: number;
  validationRejectedCount: number;
  recoveryCandidateCount: number;
  fallbackCandidateCount: number;
  finalBaselineEligibleCount: number;
  unknownPopularityCount: number;
}

export interface HiddenGemRecommendationPage {
  items: HiddenGemResult[];
  evaluatedCandidates: HiddenGemResult[];
  totalCandidates: number;
  eligibleCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
  offset: number;
  hasNextPage: boolean;
  nextPageIndex: number;
  pipelineDiagnostics: HiddenGemPipelineDiagnostics;
}

export interface HiddenGemRecommendationOptions {
  radiusMiles?: number;
  pageIndex?: number;
  pageSize?: number;
  now?: Date;
  vehicleProfile?: VehicleProfile | null;
  expeditionPhase?: ECSExpeditionPhase | null;
  operationalState?: ECSOperationalState | null;
  recommendationStatus?: ECSLiveStatusResult | null;
  discoveryTab?: DiscoveryTabId | null;
}

function sortRoutesForDiscovery(a: CategorizedRoute, b: CategorizedRoute): number {
  const scoreDiff = (b.discoveryScore ?? b.categoryScore) - (a.discoveryScore ?? a.categoryScore);
  if (scoreDiff !== 0) return scoreDiff;

  const distanceDiff = (a.distanceFromUserMiles ?? Number.POSITIVE_INFINITY) -
    (b.distanceFromUserMiles ?? Number.POSITIVE_INFINITY);
  if (distanceDiff !== 0) return distanceDiff;

  return (b.remotenessScore ?? 0) - (a.remotenessScore ?? 0);
}

// ── Category Stats ───────────────────────────────────────────
export interface CategoryStats {
  routeCount: number;
  avgRemoteness: number;
  avgDistance: number;
  totalCamps: number;
  avgVehicleMatch: number | null;
  avgEstimatedDays: number;
}

// ============================================================
// HIDDEN GEM DETECTION
// ============================================================

/**
 * Determine if a route qualifies as a Hidden Gem.
 * Hidden Gems have low traffic, high scenery, high remoteness,
 * and good terrain variety.
 */
export function isPopularTrail(op: ExpeditionOpportunity): boolean {
  const popularity = op.popularityScore ?? 0;
  if (popularity >= POPULAR_TRAIL_MIN_POPULARITY) return true;

  const searchableText = getRouteSearchableText(op);
  const marqueeTrail = MARQUEE_TRAIL_NAMES.some((name) => searchableText.includes(name));
  if (marqueeTrail) return true;

  if (POPULAR_TRAIL_KEYWORDS.some((keyword) => searchableText.includes(keyword))) return true;

  return (
    popularity >= 48 &&
    (
      (op.distanceMiles ?? 0) >= 80 ||
      (op.estimatedDays ?? 1) >= 2 ||
      (op.highlights?.length ?? 0) >= 4
    ) &&
    ((op.remotenessScore ?? 0) >= 6 || searchableText.includes('national park'))
  );
}

export function isHiddenGem(op: ExpeditionOpportunity): boolean {
  const popularity = op.popularityScore ?? HIDDEN_GEM_UNKNOWN_POPULARITY;
  const remoteness = op.remotenessScore ?? 5;
  const scenery = Math.min(op.elevationGainFt / 1000, 10); // normalize to 0-10
  const compactFootprint = (op.distanceMiles ?? 0) <= HIDDEN_GEM_MAX_FOOTPRINT_MILES && (op.estimatedDays ?? 1) <= HIDDEN_GEM_MAX_DURATION_DAYS;

  return (
    !isPopularTrail(op) &&
    popularity <= HIDDEN_GEM_MAX_POPULARITY &&
    remoteness >= HIDDEN_GEM_MIN_REMOTENESS &&
    scenery >= HIDDEN_GEM_MIN_SCENERY &&
    compactFootprint &&
    hasOffRoadEvidence(op)
  );
}

/**
 * Enrich opportunities with Hidden Gem tags.
 */
export function enrichWithHiddenGems(
  opportunities: ExpeditionOpportunity[],
): ExpeditionOpportunity[] {
  return opportunities.map(op => ({
    ...op,
    hiddenGem: isHiddenGem(op),
  }));
}

// ============================================================
// DISCOVERY SCORE ENGINE
// ============================================================

/**
 * Calculate the Discovery Score for a route.
 *
 * Discovery Score =
 *   Scenic Value (20%)
 *   + Route Quality (20%)
 *   + Exploration Potential (20%)
 *   + Remoteness Score (15%)
 *   + Distance Relevance (15%)
 *   - Overexposure Penalty (up to -20)
 *   + Hidden Gem Boost (+5 if applicable)
 *
 * @param boostLesserKnown  When true, increases the overexposure penalty
 */
export function calculateDiscoveryScore(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  maxDistance: number = 500,
  boostLesserKnown: boolean = false,
): number {
  // Scenic Value (0-100): elevation gain + terrain variety
  const elevNorm = Math.min(op.elevationGainFt / 10000, 1) * 100;
  const highlightBonus = Math.min((op.highlights?.length ?? 0) / 4, 1) * 20;
  const scenicValue = Math.min(elevNorm + highlightBonus, 100);

  // Route Quality (0-100): vehicle match + terrain difficulty balance
  const vehicleMatch = compat?.score ?? 60;
  const difficultyBalance = op.terrainDifficulty
    ? Math.max(0, 100 - Math.abs(op.terrainDifficulty - 6) * 15) // sweet spot around 5-7
    : 60;
  const routeQuality = vehicleMatch * 0.6 + difficultyBalance * 0.4;

  // Exploration Potential (0-100): camps + days + terrain diversity
  const campsNorm = Math.min((op.suggestedCamps ?? 0) / 5, 1) * 100;
  const daysNorm = Math.min((op.estimatedDays ?? 1) / 5, 1) * 80 + 20;
  const explorationPotential = campsNorm * 0.5 + daysNorm * 0.5;

  // Remoteness Score (0-100)
  const remoteness = Math.min((op.remotenessScore ?? 5) / 10, 1) * 100;

  // Distance Relevance (0-100): closer = better
  const userDist = op.distanceFromUserMiles ?? maxDistance;
  const distanceRelevance = Math.max(0, 100 * (1 - userDist / Math.max(maxDistance, 1)));

  // Composite before penalties
  let raw =
    scenicValue * 0.20 +
    routeQuality * 0.20 +
    explorationPotential * 0.20 +
    remoteness * 0.15 +
    distanceRelevance * 0.15;

  // Overexposure Penalty
  const popularity = op.popularityScore ?? 50;
  if (popularity > OVEREXPOSURE_THRESHOLD) {
    const penaltyFactor = boostLesserKnown ? 1.5 : 1.0;
    const penalty = Math.min(
      ((popularity - OVEREXPOSURE_THRESHOLD) / (100 - OVEREXPOSURE_THRESHOLD)) * OVEREXPOSURE_PENALTY_MAX * penaltyFactor,
      OVEREXPOSURE_PENALTY_MAX * penaltyFactor,
    );
    raw -= penalty;
  }

  // Hidden Gem Boost
  if (op.hiddenGem || isHiddenGem(op)) {
    raw += 5;
  }

  return clamp(Math.round(raw), 0, 100);
}

// ============================================================
// EXPANDED CATEGORIZATION ENGINE (Phase 16)
// ============================================================

/**
 * Categorize opportunities into Day Trips, Weekend Trips,
 * Expeditions, and Remote Routes.
 *
 * Each route appears in exactly one primary category.
 * Routes may also appear in Remote Routes if they meet
 * the remoteness threshold (dual categorization allowed for Remote).
 */
export function categorizeRoutesExpanded(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  userDistanceMax: number = 500,
  boostLesserKnown: boolean = false,
): ExpandedDiscoverCategories {
  const dayTrips: CategorizedRoute[] = [];
  const weekendTrips: CategorizedRoute[] = [];
  const expeditions: CategorizedRoute[] = [];
  const remoteRoutes: CategorizedRoute[] = [];
  const all: CategorizedRoute[] = [];

  // Enrich with hidden gems first
  const enriched = enrichWithHiddenGems(opportunities);

  for (const op of enriched) {
    const compat = compatResults.get(op.id) ?? null;
    const discoveryScore = calculateDiscoveryScore(op, compat, userDistanceMax, boostLesserKnown);
    const categoryScore = discoveryScore;

    const route: CategorizedRoute = { ...op, categoryScore, discoveryScore };
    all.push(route);

    // Check Remote Routes first (can overlap with other categories)
    if (op.remotenessScore >= REMOTE_MIN_REMOTENESS) {
      remoteRoutes.push({ ...route });
    }

    // Primary category assignment (mutually exclusive)
    const hours = op.estimatedTravelHours ?? (op.distanceMiles / 25); // rough estimate
    const days = op.estimatedDays ?? 1;
    const miles = op.distanceMiles ?? 0;

    if (isDayTrip(hours, miles, days)) {
      dayTrips.push(route);
    } else if (isWeekendTrip(miles, days)) {
      weekendTrips.push(route);
    } else if (isExpedition(miles, days)) {
      expeditions.push(route);
    } else {
      // Fallback: assign to closest matching category
      if (days <= 1) dayTrips.push(route);
      else if (days <= 2) weekendTrips.push(route);
      else expeditions.push(route);
    }
  }

  // Sort each category by discovery score descending
  dayTrips.sort(sortRoutesForDiscovery);
  weekendTrips.sort(sortRoutesForDiscovery);
  expeditions.sort(sortRoutesForDiscovery);
  remoteRoutes.sort(sortRoutesForDiscovery);
  all.sort(sortRoutesForDiscovery);

  if (__DEV__) {
    const summary =
      `Categorized: ${dayTrips.length} Day Trips, ${weekendTrips.length} Weekend Trips, ` +
      `${expeditions.length} Expeditions, ${remoteRoutes.length} Remote Routes`;
    if (lastCategorizationSummary !== summary) {
      lastCategorizationSummary = summary;
      console.log(TAG, summary);
    }
  }

  return { dayTrips, weekendTrips, expeditions, remoteRoutes, all };
}

function getCurrentMonthNumber(now: Date): number {
  return now.getMonth() + 1;
}

function getRouteSearchableText(op: ExpeditionOpportunity): string {
  return `${op.name} ${op.region} ${op.description} ${(op.highlights ?? []).join(' ')}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeRouteName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\bb\.?d\.?r\.?\b/g, 'backcountry discovery route')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !ROUTE_NAME_STOP_WORDS.has(token));

  return (tokens.length > 0 ? tokens : normalized.split(/\s+/).filter(Boolean)).join(' ');
}

function getRouteIdentityKey(op: ExpeditionOpportunity): string {
  const latKey = Number.isFinite(op.startLat) ? op.startLat.toFixed(2) : 'na';
  const lngKey = Number.isFinite(op.startLng) ? op.startLng.toFixed(2) : 'na';
  return `${op.regionGroup}:${normalizeRouteName(op.name)}:${latKey}:${lngKey}`;
}

function getCanonicalRoutePreference(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  radiusMiles: number,
): number {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles;
  const proximityScore = clamp(Math.round(100 * (1 - distance / Math.max(radiusMiles, 1))), 0, 100);
  const detailScore =
    Math.min(op.description.trim().length / 12, 12) +
    Math.min((op.highlights?.length ?? 0) * 3, 18) +
    (op.bestSeason ? 6 : 0) +
    (op.popularityScore != null ? 5 : 0) +
    (op.terrainDifficulty != null ? 4 : 0) +
    (op.estimatedTravelHours != null ? 3 : 0);

  return (
    detailScore +
    proximityScore * 0.35 +
    (compat?.score ?? 50) * 0.08 +
    ((op.remotenessScore ?? 0) * 1.5)
  );
}

export function dedupeExploreRoutes(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  radiusMiles: number = 500,
): ExpeditionOpportunity[] {
  const canonical = new Map<string, ExpeditionOpportunity>();

  for (const route of opportunities) {
    const key = getRouteIdentityKey(route);
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, route);
      continue;
    }

    const existingScore = getCanonicalRoutePreference(existing, compatResults.get(existing.id) ?? null, radiusMiles);
    const nextScore = getCanonicalRoutePreference(route, compatResults.get(route.id) ?? null, radiusMiles);

    if (nextScore > existingScore || (nextScore === existingScore && route.id.localeCompare(existing.id) < 0)) {
      canonical.set(key, route);
    }
  }

  return Array.from(canonical.values());
}

function normalizeSeasonToken(token: string): string {
  return token.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSeasonMonths(token: string): number[] {
  switch (normalizeSeasonToken(token)) {
    case 'year-round':
    case 'year round':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case 'winter':
      return [12, 1, 2];
    case 'early spring':
      return [3, 4];
    case 'spring':
      return [3, 4, 5];
    case 'late spring':
      return [4, 5];
    case 'summer':
      return [6, 7, 8];
    case 'early fall':
      return [9, 10];
    case 'fall':
    case 'autumn':
      return [9, 10, 11];
    case 'late fall':
      return [10, 11];
    case 'early winter':
      return [11, 12];
    default:
      return [];
  }
}

function monthDistanceToRange(month: number, months: number[]): number {
  if (months.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...months.map((candidate) => {
      const direct = Math.abs(candidate - month);
      return Math.min(direct, 12 - direct);
    }),
  );
}

function evaluateSeasonStatus(
  op: ExpeditionOpportunity,
  now: Date,
): HiddenGemSeasonStatus {
  const rawSeason = op.bestSeason?.trim();
  if (!rawSeason) return 'unknown';

  const parts = rawSeason
    .split('/')
    .map((token) => normalizeSeasonToken(token))
    .filter(Boolean);
  const seasonMonths = Array.from(new Set(parts.flatMap((token) => getSeasonMonths(token))));
  if (seasonMonths.length === 0) return 'unknown';

  const month = getCurrentMonthNumber(now);
  if (seasonMonths.includes(month)) return 'open';
  if (monthDistanceToRange(month, seasonMonths) <= 1) return 'limited';
  return 'closed';
}

function evaluateWeatherStatus(): HiddenGemWeatherStatus {
  return 'unknown';
}

function evaluateAccessStatus(op: ExpeditionOpportunity): HiddenGemAccessStatus {
  return op.permitRequired ? 'permit' : 'open';
}

function evaluateHazardStatus(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
): HiddenGemHazardStatus {
  const terrainDifficulty = op.terrainDifficulty ?? 0;
  if (terrainDifficulty >= 9 && (compat?.score ?? 0) < 60) return 'blocked';
  if (terrainDifficulty >= 8 || (compat?.difficultyRating === 'EXTREME' && (compat?.score ?? 0) < 70)) {
    return 'caution';
  }
  return 'clear';
}

function isRouteWithinRadius(
  op: ExpeditionOpportunity,
  radiusMiles: number,
): boolean {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? Number.POSITIVE_INFINITY;
  return distance <= radiusMiles;
}

function isRigMismatch(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
): boolean {
  if (!compat) return false;
  if (compat.score < 40) return true;
  if (compat.difficultyRating === 'EXTREME' && (op.terrainDifficulty ?? 0) >= 7) return true;
  if ((compat.factors.tireSizeMatch ?? 100) < 35 && (compat.factors.suspensionLiftMatch ?? 100) < 35) return true;
  return false;
}

function getMatchedKeywords(searchableText: string, terrain: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => searchableText.includes(keyword) || terrain.includes(keyword));
}

function getExplicitExclusionClassification(
  op: ExpeditionOpportunity,
): {
  classification:
    | 'excluded_hiking'
    | 'excluded_pedestrian'
    | 'excluded_moto_only'
    | 'excluded_bike_only'
    | null;
  reason: HiddenGemDisqualificationReason | null;
  signals: string[];
} {
  const terrain = (op.terrainType ?? '').toLowerCase();
  const searchableText = getRouteSearchableText(op);
  const hikingSignals = getMatchedKeywords(searchableText, terrain, HIKING_ROUTE_KEYWORDS);
  if (hikingSignals.length > 0) {
    return { classification: 'excluded_hiking', reason: 'excluded_hiking', signals: hikingSignals };
  }

  const pedestrianSignals = getMatchedKeywords(searchableText, terrain, PEDESTRIAN_ROUTE_KEYWORDS);
  if (pedestrianSignals.length > 0) {
    return { classification: 'excluded_pedestrian', reason: 'excluded_pedestrian', signals: pedestrianSignals };
  }

  const bikeSignals = getMatchedKeywords(searchableText, terrain, BIKE_ONLY_ROUTE_KEYWORDS);
  if (bikeSignals.length > 0) {
    return { classification: 'excluded_bike_only', reason: 'excluded_bike_only', signals: bikeSignals };
  }

  const motoSignals = getMatchedKeywords(searchableText, terrain, MOTO_ONLY_ROUTE_KEYWORDS);
  if (motoSignals.length > 0) {
    return { classification: 'excluded_moto_only', reason: 'excluded_moto_only', signals: motoSignals };
  }

  return { classification: null, reason: null, signals: [] };
}

function hasOffRoadEvidence(op: ExpeditionOpportunity): boolean {
  const terrain = (op.terrainType ?? '').toLowerCase();
  const searchableText = getRouteSearchableText(op);

  return (
    (op.terrainDifficulty ?? 0) >= 4 ||
    (op.remotenessScore ?? 0) >= 5 ||
    (op.highlights?.length ?? 0) >= 2 ||
    terrain.includes('desert') ||
    terrain.includes('rock') ||
    terrain.includes('sand') ||
    terrain.includes('mountain') ||
    terrain.includes('forest') ||
    terrain.includes('canyon') ||
    terrain.includes('gravel') ||
    OFFROAD_ROUTE_KEYWORDS.some((keyword) => searchableText.includes(keyword)) ||
    searchableText.includes('creek') ||
    searchableText.includes('shelf road') ||
    searchableText.includes('two track')
  );
}

function isNonVehicleRoute(op: ExpeditionOpportunity): boolean {
  return getExplicitExclusionClassification(op).classification != null;
}

function isVehicleAppropriateRoute(op: ExpeditionOpportunity): boolean {
  return !isNonVehicleRoute(op) && hasOffRoadEvidence(op);
}

function computeMetadataQualityScore(op: ExpeditionOpportunity): number {
  let score = 22;

  if ((op.description ?? '').trim().length >= 48) score += 14;
  else if ((op.description ?? '').trim().length >= 24) score += 8;

  if ((op.highlights?.length ?? 0) >= 3) score += 12;
  else if ((op.highlights?.length ?? 0) >= 1) score += 6;

  if ((op.terrainType ?? '').trim().length > 0) score += 10;
  if (op.bestSeason?.trim()) score += 8;
  if (op.terrainDifficulty != null) score += 8;
  if (op.estimatedTravelHours != null) score += 6;
  if (op.popularityScore != null) score += 6;
  if (Number.isFinite(op.startLat) && Number.isFinite(op.startLng)) score += 6;
  if (op.imageTag?.trim()) score += 4;
  if (op.recommendedTireSize != null || op.recommendedLift != null) score += 8;

  return clamp(score, 0, 100);
}

function computeGeometryConfidenceScore(op: ExpeditionOpportunity): number {
  const distance = op.distanceMiles ?? 0;
  const hours = op.estimatedTravelHours ?? null;
  let score = 18;

  if (distance >= 5 && distance <= 180) score += 28;
  else if (distance >= 5) score += 18;
  else score -= 18;

  if (hours != null && hours > 0) {
    const avgMph = distance / Math.max(hours, 0.25);
    if (avgMph >= 6 && avgMph <= 35) score += 22;
    else if (avgMph >= 4 && avgMph <= 45) score += 12;
    else score -= 10;
  }

  if ((op.estimatedDays ?? 1) <= 3) score += 8;
  if ((op.elevationGainFt ?? 0) >= 800) score += 8;
  if ((op.highlights?.length ?? 0) >= 2) score += 8;

  const searchableText = getRouteSearchableText(op);
  if (AMBIGUOUS_ARTIFACT_KEYWORDS.some((keyword) => searchableText.includes(keyword))) {
    score -= 20;
  }

  return clamp(score, 0, 100);
}

function computeSourceReliabilityScore(op: ExpeditionOpportunity): number {
  const metadataQuality = computeMetadataQualityScore(op);
  const geometryConfidence = computeGeometryConfidenceScore(op);
  const searchableText = getRouteSearchableText(op);
  let score = 28;

  if (OFFROAD_ROUTE_KEYWORDS.some((keyword) => searchableText.includes(keyword))) score += 18;
  if ((op.terrainType ?? '').trim().length > 0) score += 10;
  if ((op.highlights?.length ?? 0) >= 2) score += 8;
  if (op.popularityScore != null) score += 6;

  score += metadataQuality * 0.18;
  score += geometryConfidence * 0.16;

  return clamp(Math.round(score), 0, 100);
}

function collectVehicleTrailSignals(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  const searchableText = getRouteSearchableText(op);
  const terrain = (op.terrainType ?? '').toLowerCase();
  let score = 10;

  const matchedVehicleKeywords = getMatchedKeywords(searchableText, terrain, OFFROAD_ROUTE_KEYWORDS);
  if (matchedVehicleKeywords.length > 0) {
    score += 22;
    signals.push(...matchedVehicleKeywords.slice(0, 3));
  }

  if ((op.terrainDifficulty ?? 0) >= 4) {
    score += 12;
    signals.push('terrain_difficulty');
  }
  if ((op.remotenessScore ?? 0) >= 5) {
    score += 10;
    signals.push('remoteness');
  }
  if ((op.recommendedTireSize ?? 0) >= 31) {
    score += 10;
    signals.push('tire_requirement');
  }
  if ((op.recommendedLift ?? 0) >= 1) {
    score += 8;
    signals.push('lift_requirement');
  }
  if ((op.highlights?.length ?? 0) >= 2) {
    score += 8;
    signals.push('trail_highlights');
  }
  if ((compat?.score ?? 0) >= 60) {
    score += 12;
    signals.push('rig_compatible');
  }

  return {
    score: clamp(score, 0, 100),
    signals: Array.from(new Set(signals)),
  };
}

function getHiddenGemConfidenceTier(
  confidenceScore: number,
  exclusionClassification: ReturnType<typeof getExplicitExclusionClassification>['classification'],
): HiddenGemConfidenceTier {
  if (exclusionClassification) return 'excluded';
  if (confidenceScore >= HIDDEN_GEM_HIGH_CONFIDENCE_MIN) return 'high';
  if (confidenceScore >= HIDDEN_GEM_MEDIUM_CONFIDENCE_MIN) return 'medium';
  return 'low';
}

function computeVehicleTrailConfidence(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
): {
  confidenceScore: number;
  confidenceTier: HiddenGemConfidenceTier;
  metadataQualityScore: number;
  geometryConfidenceScore: number;
  sourceReliabilityScore: number;
  vehicleTrailSignalScore: number;
  vehicleSignals: string[];
  exclusionSignals: string[];
  exclusionClassification: ReturnType<typeof getExplicitExclusionClassification>['classification'];
} {
  const exclusion = getExplicitExclusionClassification(op);
  const metadataQualityScore = computeMetadataQualityScore(op);
  const geometryConfidenceScore = computeGeometryConfidenceScore(op);
  const sourceReliabilityScore = computeSourceReliabilityScore(op);
  const vehicleTrailSignals = collectVehicleTrailSignals(op, compat);

  let confidenceScore = Math.round(
    metadataQualityScore * 0.22 +
    geometryConfidenceScore * 0.18 +
    sourceReliabilityScore * 0.28 +
    vehicleTrailSignals.score * 0.32,
  );

  if ((op.distanceMiles ?? 0) < HIDDEN_GEM_MIN_LENGTH_MILES) confidenceScore -= 18;
  if (compat && compat.score < 40) confidenceScore -= 12;
  if ((op.popularityScore ?? 45) > POPULAR_TRAIL_MIN_POPULARITY) confidenceScore -= 8;
  if (AMBIGUOUS_ARTIFACT_KEYWORDS.some((keyword) => getRouteSearchableText(op).includes(keyword))) {
    confidenceScore -= 14;
  }
  if (exclusion.classification) confidenceScore = 0;

  const normalizedConfidence = clamp(confidenceScore, 0, 100);
  return {
    confidenceScore: normalizedConfidence,
    confidenceTier: getHiddenGemConfidenceTier(normalizedConfidence, exclusion.classification),
    metadataQualityScore,
    geometryConfidenceScore,
    sourceReliabilityScore,
    vehicleTrailSignalScore: vehicleTrailSignals.score,
    vehicleSignals: vehicleTrailSignals.signals,
    exclusionSignals: exclusion.signals,
    exclusionClassification: exclusion.classification,
  };
}

function computeCompactRouteScore(op: ExpeditionOpportunity): number {
  const distanceScore = clamp(Math.round(100 * (1 - Math.min(op.distanceMiles ?? 0, 260) / 260)), 0, 100);
  const dayScore = clamp(Math.round(100 * (1 - Math.max((op.estimatedDays ?? 1) - 1, 0) / 4)), 0, 100);
  return clamp(Math.round(distanceScore * 0.65 + dayScore * 0.35), 0, 100);
}

function computeSeasonalOpportunityScore(
  op: ExpeditionOpportunity,
  seasonStatus: HiddenGemSeasonStatus,
): number {
  const bestSeason = normalizeSeasonToken(op.bestSeason ?? '');
  const hasSeasonWindow = bestSeason.length > 0 && !bestSeason.includes('year-round') && !bestSeason.includes('year round');

  if (seasonStatus === 'open') return hasSeasonWindow ? 95 : 72;
  if (seasonStatus === 'limited') return hasSeasonWindow ? 82 : 58;
  if (seasonStatus === 'closed') return 0;
  return hasSeasonWindow ? 62 : 48;
}

function isHiddenGemCandidate(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  radiusMiles: number,
  seasonStatus: HiddenGemSeasonStatus,
  confidence: ReturnType<typeof computeVehicleTrailConfidence>,
): boolean {
  const popularity = op.popularityScore ?? HIDDEN_GEM_UNKNOWN_POPULARITY;
  const oversizedRoute = (op.distanceMiles ?? 0) > HIDDEN_GEM_MAX_FOOTPRINT_MILES || (op.estimatedDays ?? 1) > HIDDEN_GEM_MAX_DURATION_DAYS;
  const tooShort = (op.distanceMiles ?? 0) < HIDDEN_GEM_MIN_LENGTH_MILES;

  if (!isRouteWithinRadius(op, radiusMiles)) return false;
  if (isPopularTrail(op)) return false;
  if (popularity > HIDDEN_GEM_MAX_POPULARITY) return false;
  if (tooShort) return false;
  if (seasonStatus === 'closed') return false;
  if (!isVehicleAppropriateRoute(op)) return false;
  if (confidence.confidenceTier === 'excluded' || confidence.confidenceTier === 'low') return false;
  if (
    confidence.confidenceTier === 'medium' &&
    (confidence.vehicleTrailSignalScore < 56 || confidence.metadataQualityScore < 48 || confidence.geometryConfidenceScore < 44)
  ) {
    return false;
  }
  if (oversizedRoute && popularity >= 18) return false;
  if (isRigMismatch(op, compat)) return false;

  return true;
}

function buildRigFitSummary(
  compat: CompatibilityResult | null,
  vehicleProfile?: VehicleProfile | null,
): string {
  if (!compat) return vehicleProfile ? 'Rig fit estimate unavailable' : 'Add a vehicle for rig fit';
  if (compat.score >= 85) return 'Strong fit for current rig';
  if (compat.score >= 70) return 'Good fit for current rig';
  if (compat.score >= 50) return 'Manageable with current setup';
  if (compat.score >= 35) return 'Likely to challenge current setup';
  return 'Exceeds current rig setup';
}

function getRigFitReason(
  vehicleProfile?: VehicleProfile | null,
): HiddenGemRecommendationReason {
  switch (vehicleProfile?.vehicleType) {
    case 'truck':
      return 'good_full_size_truck_fit';
    case 'jeep':
      return 'good_jeep_fit';
    case 'suv_van':
      return 'good_adventure_van_fit';
    default:
      return 'good_vehicle_fit';
  }
}

function computeSuitabilityScore(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  radiusMiles: number,
  seasonStatus: HiddenGemSeasonStatus,
  accessStatus: HiddenGemAccessStatus,
): number {
  const rigScore = compat?.score ?? 60;
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles;
  const distanceScore = clamp(Math.round(100 * (1 - distance / Math.max(radiusMiles, 1))), 0, 100);
  const seasonScore = seasonStatus === 'open' ? 100 : seasonStatus === 'limited' ? 60 : seasonStatus === 'closed' ? 0 : 55;
  const accessScore = accessStatus === 'open' ? 100 : accessStatus === 'permit' ? 72 : accessStatus === 'restricted' ? 20 : 55;
  const expeditionScore = clamp(
    Math.round(
      Math.min((op.suggestedCamps ?? 0) * 18, 40) +
      Math.min((op.estimatedDays ?? 1) * 12, 36) +
      Math.min((op.remotenessScore ?? 0) * 3, 24),
    ),
    0,
    100,
  );

  return clamp(
    Math.round(
      rigScore * 0.48 +
      distanceScore * 0.16 +
      seasonScore * 0.16 +
      accessScore * 0.08 +
      expeditionScore * 0.12,
    ),
    0,
    100,
  );
}

function computeHiddenGemRecommendationScore(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  radiusMiles: number,
  suitabilityScore: number,
  seasonStatus: HiddenGemSeasonStatus,
  accessStatus: HiddenGemAccessStatus,
): number {
  const popularity = op.popularityScore ?? 45;
  const lowTrafficScore = clamp(100 - popularity, 0, 100);
  const proximityScore = clamp(
    Math.round(100 * (1 - (op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles) / Math.max(radiusMiles, 1))),
    0,
    100,
  );
  const expeditionUsefulness = clamp(
    Math.round(
      (op.expeditionFitScore ?? 60) * 0.45 +
      Math.min((op.estimatedDays ?? 1) * 14, 28) +
      Math.min((op.suggestedCamps ?? 0) * 12, 24) +
      Math.min((op.remotenessScore ?? 0) * 4, 32),
    ),
    0,
    100,
  );
  const seasonScore = computeSeasonalOpportunityScore(op, seasonStatus);
  const accessConfidence = accessStatus === 'open' ? 100 : accessStatus === 'permit' ? 80 : accessStatus === 'restricted' ? 20 : 50;
  const compactRouteScore = computeCompactRouteScore(op);
  const offRoadEvidenceScore = hasOffRoadEvidence(op)
    ? clamp(Math.round(Math.min((op.terrainDifficulty ?? 0) * 11, 70) + Math.min((op.remotenessScore ?? 0) * 3, 30)), 0, 100)
    : 0;
  const challengeBalance = compat?.difficultyRating === 'MODERATE'
    ? 100
    : compat?.difficultyRating === 'HARD'
    ? 84
    : compat?.difficultyRating === 'EASY'
    ? 72
    : compat?.difficultyRating === 'EXTREME'
    ? 35
    : 68;

  return clamp(
    Math.round(
      suitabilityScore * 0.30 +
      lowTrafficScore * 0.24 +
      proximityScore * 0.16 +
      compactRouteScore * 0.11 +
      seasonScore * 0.08 +
      expeditionUsefulness * 0.05 +
      offRoadEvidenceScore * 0.04 +
      accessConfidence * 0.01 +
      challengeBalance * 0.01,
    ),
    0,
    100,
  );
}

function confidenceWeightFromTier(
  confidenceTier: HiddenGemConfidenceTier,
  confidenceScore: number,
): number {
  switch (confidenceTier) {
    case 'high':
      return confidenceScore >= 82 ? 1.06 : 1.02;
    case 'medium':
      return confidenceScore >= 66 ? 0.94 : 0.88;
    case 'low':
      return 0.78;
    case 'excluded':
    default:
      return 0.7;
  }
}

function computeHiddenGemPracticalityScore(
  op: ExpeditionOpportunity,
  radiusMiles: number,
): number {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles;
  const days = op.estimatedDays ?? 1;
  const remoteness = op.remotenessScore ?? 5;
  const proximityScore = clamp(
    Math.round(100 * (1 - distance / Math.max(radiusMiles, 1))),
    0,
    100,
  );
  const durationScore =
    days <= 1
      ? 96
      : days <= 2
        ? 88
        : days <= 3
          ? 68
          : 42;
  const remotenessScore =
    remoteness >= 3 && remoteness <= 7
      ? 90
      : remoteness <= 8
        ? 74
        : 48;
  const routeLengthScore = computeCompactRouteScore(op);

  return clamp(
    Math.round(
      proximityScore * 0.42 +
      durationScore * 0.24 +
      remotenessScore * 0.18 +
      routeLengthScore * 0.16,
    ),
    0,
    100,
  );
}

function computeHiddenGemUniquenessScore(
  op: ExpeditionOpportunity,
): number {
  const lowTrafficScore = clamp(100 - (op.popularityScore ?? 45), 0, 100);
  const remoteness = op.remotenessScore ?? 5;
  const terrainDifficulty = op.terrainDifficulty ?? 5;
  const highlightScore = clamp(Math.min((op.highlights?.length ?? 0) * 18, 100), 0, 100);
  const offRoadIdentity = hasOffRoadEvidence(op) ? 86 : 38;
  const remotenessBand =
    remoteness >= 5 && remoteness <= 8
      ? 92
      : remoteness >= 4
        ? 76
        : 54;
  const terrainIdentity =
    terrainDifficulty >= 4 && terrainDifficulty <= 7
      ? 84
      : terrainDifficulty >= 3
        ? 68
        : 46;

  return clamp(
    Math.round(
      lowTrafficScore * 0.42 +
      remotenessBand * 0.2 +
      terrainIdentity * 0.14 +
      highlightScore * 0.12 +
      offRoadIdentity * 0.12,
    ),
    0,
    100,
  );
}

function computeHiddenGemPhaseAdjustment(
  op: ExpeditionOpportunity,
  phase: ECSExpeditionPhase | null | undefined,
): number {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? 0;
  const days = op.estimatedDays ?? 1;
  const remoteness = op.remotenessScore ?? 0;

  switch (phase) {
    case 'vehicle_setup':
    case 'staging':
      if (distance <= 180 && days <= 2) return 8;
      if (remoteness >= 8 || days >= 4) return -10;
      return 0;
    case 'transit':
      if (distance <= 140 && days <= 2) return 8;
      if (distance >= 260 || remoteness >= 8 || days >= 3) return -12;
      return 0;
    case 'trail_entry':
    case 'active_expedition':
      if (distance <= 110 && days <= 2) return 7;
      if (distance >= 220 && remoteness >= 8) return -10;
      return 2;
    case 'camp_stationary':
      if (distance <= 90 && days <= 1) return 10;
      if (days >= 3) return -8;
      return 0;
    case 'recovery_exit':
      if (distance <= 60 && days <= 1) return -4;
      return -18;
    default:
      return 0;
  }
}

function computeHiddenGemOperationalAdjustment(
  operationalState: ECSOperationalState | null | undefined,
  recommendationStatus: ECSLiveStatusResult | null | undefined,
): number {
  let adjustment = 0;

  switch (operationalState) {
    case 'offline_capable':
      adjustment -= 4;
      break;
    case 'degraded':
      adjustment -= 8;
      break;
    case 'limited':
      adjustment -= 12;
      break;
    case 'unavailable':
      adjustment -= 16;
      break;
    default:
      break;
  }

  switch (recommendationStatus?.status) {
    case 'live':
      adjustment += 2;
      break;
    case 'offline_capable':
      adjustment -= 2;
      break;
    case 'waiting':
      adjustment -= 4;
      break;
    case 'degraded':
      adjustment -= 6;
      break;
    case 'unavailable':
      adjustment -= 10;
      break;
    default:
      break;
  }

  switch (recommendationStatus?.freshness) {
    case 'current':
      adjustment += 2;
      break;
    case 'stale':
      adjustment -= 6;
      break;
    default:
      break;
  }

  return adjustment;
}

function mapConfidenceTierToExplanationLevel(
  confidenceTier: HiddenGemConfidenceTier,
): 'high' | 'moderate' | 'limited' | 'low' | 'unknown' {
  switch (confidenceTier) {
    case 'high':
      return 'high';
    case 'medium':
      return 'moderate';
    case 'low':
      return 'limited';
    case 'excluded':
    default:
      return 'low';
  }
}

function buildHiddenGemRationaleDrivers(args: {
  op: ExpeditionOpportunity;
  compat: CompatibilityResult | null;
  confidence: ReturnType<typeof computeVehicleTrailConfidence>;
  recommendationStatus?: ECSLiveStatusResult | null;
  practicalityScore: number;
  uniquenessScore: number;
  routeQualityScore: number;
  confidenceWeightedScore: number;
  suppressionReason: string | null;
}): string[] {
  const drivers: string[] = [];
  const popularity = args.op.popularityScore ?? 45;
  const distance = args.op.distanceFromUserMiles ?? args.op.distanceMiles ?? 0;
  const remoteness = args.op.remotenessScore ?? 0;

  if (args.suppressionReason === 'classification support is partial') {
    drivers.push('classification support is partial');
  } else if (args.suppressionReason === 'route support data is weak') {
    drivers.push('route support data is weak');
  } else if (args.suppressionReason === 'discovery value is too weak') {
    drivers.push('practical discovery value is weak');
  } else if (args.suppressionReason === 'support confidence is too weak') {
    drivers.push('support confidence is too weak');
  }

  if (popularity <= 24) drivers.push('lower-profile status');
  if (distance > 0 && distance <= 140) drivers.push('practical distance');
  if (args.routeQualityScore >= 72) drivers.push('supportive route data');
  if ((args.compat?.score ?? 0) >= 72) drivers.push('strong vehicle-fit support');
  else if (args.compat == null) drivers.push('vehicle fit is estimated');
  if (remoteness >= 5 && remoteness <= 8) drivers.push('moderate remoteness');
  else if (remoteness > 8) drivers.push('interesting remoteness');
  if (args.recommendationStatus?.freshness === 'stale') drivers.push('stale support');
  if (args.confidence.confidenceTier === 'medium' && args.confidenceWeightedScore < 70) {
    drivers.push('limited-confidence support');
  }
  if (args.uniquenessScore >= 76) drivers.push('strong local discovery value');
  if (args.practicalityScore < 54) drivers.push('practicality is limited');

  return Array.from(new Set(drivers)).slice(0, 3);
}

function refineHiddenGemScore(args: {
  op: ExpeditionOpportunity;
  compat: CompatibilityResult | null;
  vehicleProfile?: VehicleProfile | null;
  confidence: ReturnType<typeof computeVehicleTrailConfidence>;
  baseHiddenGemScore: number;
  suitabilityScore: number;
  radiusMiles: number;
  seasonStatus: HiddenGemSeasonStatus;
  weatherStatus: HiddenGemWeatherStatus;
  accessStatus: HiddenGemAccessStatus;
  hazardStatus: HiddenGemHazardStatus;
  operationalState?: ECSOperationalState | null;
  expeditionPhase?: ECSExpeditionPhase | null;
  recommendationStatus?: ECSLiveStatusResult | null;
}): {
  finalScore: number;
  confidenceWeightedScore: number;
  confidenceWeight: number;
  promotionStrength: 'highlight' | 'standard' | 'softened' | 'suppressed';
  rationaleDrivers: string[];
  rationaleText: string | null;
  suppressionReason: string | null;
} {
  const popularity = args.op.popularityScore ?? 45;
  const metadataQualityScore = args.confidence.metadataQualityScore;
  const geometryConfidenceScore = args.confidence.geometryConfidenceScore;
  const routeQualityScore = clamp(
    Math.round(
      metadataQualityScore * 0.38 +
      geometryConfidenceScore * 0.24 +
      args.confidence.sourceReliabilityScore * 0.18 +
      args.suitabilityScore * 0.2,
    ),
    0,
    100,
  );
  const practicalityScore = computeHiddenGemPracticalityScore(args.op, args.radiusMiles);
  const uniquenessScore = computeHiddenGemUniquenessScore(args.op);
  const discoveryValueScore = clamp(
    Math.round(
      uniquenessScore * 0.4 +
      practicalityScore * 0.24 +
      args.baseHiddenGemScore * 0.22 +
      routeQualityScore * 0.14,
    ),
    0,
    100,
  );
  const ambiguityPenalty =
    popularity >= 40
      ? 18
      : popularity >= 34
        ? 10
        : popularity >= 28
          ? 4
          : 0;
  const vehicleFitModifier =
    args.compat == null
      ? args.vehicleProfile
        ? -2
        : -5
      : (args.compat.score ?? 0) >= 85
        ? 8
        : (args.compat.score ?? 0) >= 72
          ? 5
          : (args.compat.score ?? 0) >= 56
            ? 1
            : -8;
  const confidenceWeight = confidenceWeightFromTier(
    args.confidence.confidenceTier,
    args.confidence.confidenceScore,
  );
  const operationalAdjustment = computeHiddenGemOperationalAdjustment(
    args.operationalState,
    args.recommendationStatus,
  );
  const phaseAdjustment = computeHiddenGemPhaseAdjustment(args.op, args.expeditionPhase);

  const finalScore = clamp(
    Math.round(
      args.baseHiddenGemScore * 0.3 +
      discoveryValueScore * 0.26 +
      practicalityScore * 0.16 +
      uniquenessScore * 0.12 +
      routeQualityScore * 0.16,
    ),
    0,
    100,
  );

  let confidenceWeightedScore = clamp(
    Math.round(
      finalScore * confidenceWeight +
      vehicleFitModifier +
      operationalAdjustment +
      phaseAdjustment -
      ambiguityPenalty,
    ),
    0,
    100,
  );

  let suppressionReason: string | null = null;
  if (popularity >= 38 && args.confidence.confidenceScore < 74) {
    suppressionReason = 'classification support is partial';
  } else if (metadataQualityScore < 42 || geometryConfidenceScore < 40) {
    suppressionReason = 'route support data is weak';
  } else if (args.confidence.confidenceScore < 52) {
    suppressionReason = 'support confidence is too weak';
  } else if (practicalityScore < 46 && discoveryValueScore < 62) {
    suppressionReason = 'discovery value is too weak';
  } else if (
    args.expeditionPhase === 'recovery_exit' &&
    ((args.op.distanceFromUserMiles ?? args.op.distanceMiles ?? 0) > 120 || (args.op.estimatedDays ?? 1) > 2)
  ) {
    suppressionReason = 'recovery posture suppresses exploratory noise';
  }

  if (args.hazardStatus === 'caution') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 4, 0, 100);
  }
  if (args.weatherStatus === 'caution') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 3, 0, 100);
  }
  if (args.accessStatus === 'unknown' || args.seasonStatus === 'unknown') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 2, 0, 100);
  }

  const promotionStrength =
    suppressionReason != null
      ? 'suppressed'
      : confidenceWeightedScore >= 84
        ? 'highlight'
        : confidenceWeightedScore >= 66
          ? 'standard'
          : 'softened';

  const rationaleDrivers = buildHiddenGemRationaleDrivers({
    op: args.op,
    compat: args.compat,
    confidence: args.confidence,
    recommendationStatus: args.recommendationStatus,
    practicalityScore,
    uniquenessScore,
    routeQualityScore,
    confidenceWeightedScore,
    suppressionReason,
  });

  const rationale =
    explainRecommendation({
      type: 'hidden_gem',
      drivers: rationaleDrivers.length > 0 ? rationaleDrivers : ['local discovery value'],
      confidenceLevel: mapConfidenceTierToExplanationLevel(args.confidence.confidenceTier),
      degradedState: args.operationalState ?? undefined,
    }) ?? null;

  const rationaleText =
    promotionStrength === 'softened' && rationale?.text
      ? rationale.text.replace(/^Suggested due to /, 'Softened due to ')
      : promotionStrength === 'suppressed' && rationaleDrivers.length > 0
        ? `Held back because ${rationaleDrivers.join(', ')}.`
        : rationale?.text ?? null;

  return {
    finalScore,
    confidenceWeightedScore,
    confidenceWeight,
    promotionStrength,
    rationaleDrivers,
    rationaleText,
    suppressionReason,
  };
}

function estimateRouteTravelHours(op: ExpeditionOpportunity): number {
  if (op.estimatedTravelHours != null && op.estimatedTravelHours > 0) {
    return op.estimatedTravelHours;
  }

  const distance = op.distanceMiles ?? 0;
  const days = Math.max(op.estimatedDays ?? 1, 1);
  return Math.max(distance / 24, days * 4.5);
}

function computeTripTypeFitScore(
  op: ExpeditionOpportunity,
  discoveryTab: DiscoveryTabId | null | undefined,
): number {
  if (!discoveryTab) return 72;

  const miles = op.distanceMiles ?? 0;
  const days = op.estimatedDays ?? 1;
  const hours = estimateRouteTravelHours(op);
  const remoteness = op.remotenessScore ?? 0;

  switch (discoveryTab) {
    case 'day-trips':
      if (isDayTrip(hours, miles, days)) return 96;
      if (days <= 2 && miles <= 190) return 76;
      return 42;
    case 'weekend-trips':
      if (isWeekendTrip(miles, days)) return 96;
      if (days <= 3 && miles >= 40 && miles <= 340) return 80;
      return 50;
    case 'expeditions':
      if (isExpedition(miles, days)) return 94;
      if (days >= 2 || miles >= 160) return 74;
      return 46;
    case 'remote-routes':
      if (remoteness >= REMOTE_MIN_REMOTENESS) return 96;
      if (remoteness >= 6) return 76;
      return 48;
    default:
      return 72;
  }
}

function computePopularTrailClassificationConfidence(
  op: ExpeditionOpportunity,
): number {
  const popularity = op.popularityScore ?? 0;
  const searchableText = getRouteSearchableText(op);
  const marqueeTrail = MARQUEE_TRAIL_NAMES.some((name) => searchableText.includes(name));
  const keywordHit = POPULAR_TRAIL_KEYWORDS.some((keyword) => searchableText.includes(keyword));
  const highlightCount = op.highlights?.length ?? 0;

  let score = 40;
  if (popularity >= POPULAR_TRAIL_MIN_POPULARITY) {
    score += 26 + Math.min((popularity - POPULAR_TRAIL_MIN_POPULARITY) * 0.8, 18);
  } else if (popularity >= 42) {
    score += 14;
  }
  if (marqueeTrail) score += 18;
  if (keywordHit) score += 12;
  if ((op.distanceMiles ?? 0) >= 80) score += 6;
  if ((op.estimatedDays ?? 1) >= 2) score += 6;
  if (highlightCount >= 4) score += 6;
  if ((op.remotenessScore ?? 0) >= 6) score += 4;

  return clamp(Math.round(score), 0, 100);
}

function computePopularTrailPracticalityScore(
  op: ExpeditionOpportunity,
  radiusMiles: number,
): number {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles;
  const days = op.estimatedDays ?? 1;
  const hours = estimateRouteTravelHours(op);
  const proximityScore = clamp(
    Math.round(100 * (1 - distance / Math.max(radiusMiles, 1))),
    0,
    100,
  );
  const durationScore =
    days <= 1
      ? 90
      : days <= 2
        ? 96
        : days <= 3
          ? 82
          : days <= 4
            ? 68
            : 52;
  const travelScore =
    hours <= 6
      ? 94
      : hours <= 10
        ? 82
        : hours <= 16
          ? 68
          : 52;

  return clamp(
    Math.round(
      proximityScore * 0.46 +
      durationScore * 0.3 +
      travelScore * 0.24,
    ),
    0,
    100,
  );
}

function computePopularTrailFlagshipValue(
  op: ExpeditionOpportunity,
): number {
  const searchableText = getRouteSearchableText(op);
  const marqueeTrail = MARQUEE_TRAIL_NAMES.some((name) => searchableText.includes(name));
  const keywordHit = POPULAR_TRAIL_KEYWORDS.some((keyword) => searchableText.includes(keyword));
  const popularity = op.popularityScore ?? 42;
  const highlightScore = clamp(Math.min((op.highlights?.length ?? 0) * 14, 100), 0, 100);
  const nationalParkBoost = searchableText.includes('national park') ? 12 : 0;

  return clamp(
    Math.round(
      popularity * 0.54 +
      highlightScore * 0.18 +
      (marqueeTrail ? 100 : 56) * 0.18 +
      (keywordHit ? 86 : 52) * 0.1 +
      nationalParkBoost,
    ),
    0,
    100,
  );
}

function computePopularTrailWeatherRelevanceScore(
  op: ExpeditionOpportunity,
  expeditionPhase: ECSExpeditionPhase | null | undefined,
  recommendationStatus: ECSLiveStatusResult | null | undefined,
): number {
  let score = 24;

  if ((op.terrainDifficulty ?? 0) >= 7) score += 18;
  if ((op.remotenessScore ?? 0) >= 7) score += 18;
  if ((op.estimatedDays ?? 1) >= 2) score += 14;
  if ((op.elevationGainFt ?? 0) >= 1800) score += 10;

  switch (expeditionPhase) {
    case 'staging':
    case 'transit':
    case 'trail_entry':
    case 'active_expedition':
    case 'recovery_exit':
      score += 10;
      break;
    case 'camp_stationary':
      score += 6;
      break;
    default:
      break;
  }

  if (recommendationStatus?.freshness === 'stale') score -= 8;
  if (recommendationStatus?.status === 'unavailable') score -= 8;

  return clamp(score, 0, 100);
}

function computePopularTrailPhaseAdjustment(
  op: ExpeditionOpportunity,
  expeditionPhase: ECSExpeditionPhase | null | undefined,
  discoveryTab: DiscoveryTabId | null | undefined,
): number {
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? 0;
  const days = op.estimatedDays ?? 1;
  const remoteness = op.remotenessScore ?? 0;

  switch (expeditionPhase) {
    case 'vehicle_setup':
    case 'staging':
      if (distance <= 220 && days <= 3) return 10;
      if (discoveryTab === 'expeditions' && days >= 2) return 6;
      if (remoteness >= 8 && days >= 4) return -10;
      return 0;
    case 'transit':
      if (distance <= 160 && days <= 2) return 8;
      if (distance > 260 || days >= 4) return -8;
      return 0;
    case 'trail_entry':
    case 'active_expedition':
      if (distance <= 120 && days <= 2) return 4;
      if (remoteness >= 7 && days >= 3) return -10;
      return -4;
    case 'camp_stationary':
      if (distance <= 110 && days <= 2) return 8;
      if (days >= 4) return -8;
      return 0;
    case 'recovery_exit':
      if (distance <= 140 && remoteness <= 6) return 6;
      return -16;
    default:
      return 0;
  }
}

function computePopularTrailOperationalAdjustment(
  operationalState: ECSOperationalState | null | undefined,
  recommendationStatus: ECSLiveStatusResult | null | undefined,
): number {
  let adjustment = 0;

  switch (operationalState) {
    case 'offline_capable':
      adjustment -= 3;
      break;
    case 'degraded':
      adjustment -= 6;
      break;
    case 'limited':
      adjustment -= 10;
      break;
    case 'unavailable':
      adjustment -= 14;
      break;
    default:
      break;
  }

  switch (recommendationStatus?.status) {
    case 'live':
      adjustment += 2;
      break;
    case 'offline_capable':
      adjustment -= 2;
      break;
    case 'waiting':
      adjustment -= 4;
      break;
    case 'degraded':
      adjustment -= 5;
      break;
    case 'unavailable':
      adjustment -= 8;
      break;
    default:
      break;
  }

  switch (recommendationStatus?.freshness) {
    case 'current':
      adjustment += 2;
      break;
    case 'stale':
      adjustment -= 6;
      break;
    default:
      break;
  }

  return adjustment;
}

function buildPopularTrailRationaleDrivers(args: {
  op: ExpeditionOpportunity;
  compat: CompatibilityResult | null;
  confidence: ReturnType<typeof computeVehicleTrailConfidence>;
  discoveryTab?: DiscoveryTabId | null;
  recommendationStatus?: ECSLiveStatusResult | null;
  classificationConfidence: number;
  practicalityScore: number;
  routeQualityScore: number;
  tripTypeFitScore: number;
  weatherRelevanceScore: number;
  confidenceWeightedScore: number;
  suppressionReason: string | null;
}): string[] {
  const drivers: string[] = [];
  const distance = args.op.distanceFromUserMiles ?? args.op.distanceMiles ?? 0;

  if (args.suppressionReason === 'classification support is partial') {
    drivers.push('classification support is partial');
  } else if (args.suppressionReason === 'trip-type relevance is weak') {
    drivers.push('trip-type relevance is weak');
  } else if (args.suppressionReason === 'route support data is weak') {
    drivers.push('route support data is weak');
  } else if (args.suppressionReason === 'current practicality is weak') {
    drivers.push('current practicality is weak');
  } else if (args.suppressionReason === 'support confidence is too weak') {
    drivers.push('support confidence is too weak');
  } else if (args.suppressionReason === 'recovery posture suppresses popular-trail promotion') {
    drivers.push('recovery posture suppresses popular-trail promotion');
  }

  if (args.classificationConfidence >= 84) drivers.push('strong trail recognition');
  else if (args.classificationConfidence >= 68) drivers.push('known regional trail identity');
  if (distance > 0 && distance <= 160) drivers.push('practical distance');
  if (args.tripTypeFitScore >= 78) drivers.push('good trip-type fit');
  if (args.routeQualityScore >= 72) drivers.push('supportive route data');
  if ((args.compat?.score ?? 0) >= 72) drivers.push('strong vehicle-fit support');
  else if (args.compat == null) drivers.push('vehicle fit is estimated');
  if (args.weatherRelevanceScore >= 64 && args.recommendationStatus?.freshness !== 'stale') {
    drivers.push('route-weather relevance');
  }
  if (args.recommendationStatus?.freshness === 'stale') drivers.push('stale support');
  if (args.confidence.confidenceTier === 'medium' && args.confidenceWeightedScore < 72) {
    drivers.push('limited-confidence support');
  }
  if (args.practicalityScore < 56) drivers.push('practicality is limited');

  return Array.from(new Set(drivers)).slice(0, 3);
}

function refinePopularTrailScore(args: {
  op: ExpeditionOpportunity;
  compat: CompatibilityResult | null;
  vehicleProfile?: VehicleProfile | null;
  confidence: ReturnType<typeof computeVehicleTrailConfidence>;
  basePopularTrailScore: number;
  suitabilityScore: number;
  radiusMiles: number;
  seasonStatus: HiddenGemSeasonStatus;
  weatherStatus: HiddenGemWeatherStatus;
  accessStatus: HiddenGemAccessStatus;
  hazardStatus: HiddenGemHazardStatus;
  discoveryTab?: DiscoveryTabId | null;
  operationalState?: ECSOperationalState | null;
  expeditionPhase?: ECSExpeditionPhase | null;
  recommendationStatus?: ECSLiveStatusResult | null;
}): {
  finalScore: number;
  confidenceWeightedScore: number;
  confidenceWeight: number;
  promotionStrength: 'highlight' | 'standard' | 'softened' | 'suppressed';
  rationaleDrivers: string[];
  rationaleText: string | null;
  suppressionReason: string | null;
  classificationConfidence: number;
  practicalityScore: number;
  routeQualityScore: number;
  tripTypeFitScore: number;
  weatherRelevanceScore: number;
  phaseAdjustment: number;
} {
  const metadataQualityScore = args.confidence.metadataQualityScore;
  const geometryConfidenceScore = args.confidence.geometryConfidenceScore;
  const routeQualityScore = clamp(
    Math.round(
      metadataQualityScore * 0.34 +
      geometryConfidenceScore * 0.22 +
      args.confidence.sourceReliabilityScore * 0.2 +
      args.suitabilityScore * 0.24,
    ),
    0,
    100,
  );
  const classificationConfidence = computePopularTrailClassificationConfidence(args.op);
  const practicalityScore = computePopularTrailPracticalityScore(args.op, args.radiusMiles);
  const tripTypeFitScore = computeTripTypeFitScore(args.op, args.discoveryTab);
  const flagshipValueScore = computePopularTrailFlagshipValue(args.op);
  const weatherRelevanceScore = computePopularTrailWeatherRelevanceScore(
    args.op,
    args.expeditionPhase,
    args.recommendationStatus,
  );
  const confidenceWeight = confidenceWeightFromTier(
    args.confidence.confidenceTier,
    args.confidence.confidenceScore,
  );
  const operationalAdjustment = computePopularTrailOperationalAdjustment(
    args.operationalState,
    args.recommendationStatus,
  );
  const phaseAdjustment = computePopularTrailPhaseAdjustment(
    args.op,
    args.expeditionPhase,
    args.discoveryTab,
  );
  const vehicleFitModifier =
    args.compat == null
      ? args.vehicleProfile
        ? -2
        : -4
      : (args.compat.score ?? 0) >= 85
        ? 8
        : (args.compat.score ?? 0) >= 72
          ? 5
          : (args.compat.score ?? 0) >= 56
            ? 1
            : -6;

  const finalScore = clamp(
    Math.round(
      args.basePopularTrailScore * 0.28 +
      classificationConfidence * 0.24 +
      routeQualityScore * 0.18 +
      practicalityScore * 0.14 +
      tripTypeFitScore * 0.1 +
      flagshipValueScore * 0.06,
    ),
    0,
    100,
  );

  let confidenceWeightedScore = clamp(
    Math.round(
      finalScore * confidenceWeight +
      vehicleFitModifier +
      operationalAdjustment +
      phaseAdjustment +
      Math.round((weatherRelevanceScore - 50) * 0.08),
    ),
    0,
    100,
  );

  let suppressionReason: string | null = null;
  if (classificationConfidence < 58) {
    suppressionReason = 'classification support is partial';
  } else if (tripTypeFitScore < 46) {
    suppressionReason = 'trip-type relevance is weak';
  } else if (metadataQualityScore < 42 || geometryConfidenceScore < 40) {
    suppressionReason = 'route support data is weak';
  } else if (args.confidence.confidenceScore < 52) {
    suppressionReason = 'support confidence is too weak';
  } else if (practicalityScore < 44 && finalScore < 68) {
    suppressionReason = 'current practicality is weak';
  } else if (
    args.expeditionPhase === 'recovery_exit' &&
    ((args.op.distanceFromUserMiles ?? args.op.distanceMiles ?? 0) > 140 || (args.op.estimatedDays ?? 1) > 2)
  ) {
    suppressionReason = 'recovery posture suppresses popular-trail promotion';
  }

  if (args.hazardStatus === 'caution') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 4, 0, 100);
  }
  if (args.weatherStatus === 'caution') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 3, 0, 100);
  }
  if (args.accessStatus === 'unknown' || args.seasonStatus === 'unknown') {
    confidenceWeightedScore = clamp(confidenceWeightedScore - 2, 0, 100);
  }

  const promotionStrength =
    suppressionReason != null
      ? 'suppressed'
      : confidenceWeightedScore >= 84
        ? 'highlight'
        : confidenceWeightedScore >= 64
          ? 'standard'
          : 'softened';

  const rationaleDrivers = buildPopularTrailRationaleDrivers({
    op: args.op,
    compat: args.compat,
    confidence: args.confidence,
    discoveryTab: args.discoveryTab,
    recommendationStatus: args.recommendationStatus,
    classificationConfidence,
    practicalityScore,
    routeQualityScore,
    tripTypeFitScore,
    weatherRelevanceScore,
    confidenceWeightedScore,
    suppressionReason,
  });

  const rationale =
    explainRecommendation({
      type: 'hidden_gem',
      drivers: rationaleDrivers.length > 0 ? rationaleDrivers : ['known regional trail identity'],
      confidenceLevel: mapConfidenceTierToExplanationLevel(args.confidence.confidenceTier),
      degradedState: args.operationalState ?? undefined,
    }) ?? null;

  const baseRationaleText = rationale?.text
    ?.replace(/^Suggested due to /, 'Surfaced due to ')
    ?.replace(/^Suggested for /, 'Surfaced for ');
  const rationaleText =
    promotionStrength === 'softened' && baseRationaleText
      ? baseRationaleText.replace(/^Surfaced due to /, 'Softened by ').replace(/\.$/, '.')
      : promotionStrength === 'suppressed' && rationaleDrivers.length > 0
        ? `Held back because ${rationaleDrivers.join(', ')}.`
        : baseRationaleText ?? null;

  return {
    finalScore,
    confidenceWeightedScore,
    confidenceWeight,
    promotionStrength,
    rationaleDrivers,
    rationaleText,
    suppressionReason,
    classificationConfidence,
    practicalityScore,
    routeQualityScore,
    tripTypeFitScore,
    weatherRelevanceScore,
    phaseAdjustment,
  };
}

function buildRecommendationReasons(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  radiusMiles: number,
  seasonStatus: HiddenGemSeasonStatus,
  weatherStatus: HiddenGemWeatherStatus,
  vehicleProfile?: VehicleProfile | null,
): HiddenGemRecommendationReason[] {
  const reasons: HiddenGemRecommendationReason[] = [];
  const distance = op.distanceFromUserMiles ?? op.distanceMiles ?? radiusMiles;

  if ((compat?.score ?? 0) >= 72) reasons.push(getRigFitReason(vehicleProfile));
  if ((op.popularityScore ?? 45) <= 20) reasons.push('low_traffic');
  if (seasonStatus === 'open') reasons.push('seasonally_open');
  if (weatherStatus === 'compatible') reasons.push('weather_compatible');
  if (compat?.difficultyRating === 'MODERATE' || (compat?.difficultyRating === 'HARD' && compat.score >= 65)) {
    reasons.push('moderate_challenge_match');
  }
  if ((op.estimatedDays ?? 1) >= 2 || (op.suggestedCamps ?? 0) >= 2 || (op.remotenessScore ?? 0) >= 7) {
    reasons.push('useful_expedition_alternative');
  }
  if (distance <= radiusMiles * 0.35) reasons.push('nearby_option');

  return Array.from(new Set(reasons)).slice(0, 4);
}

function buildHiddenGemResult(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  options: HiddenGemRecommendationOptions,
): HiddenGemResult {
  const radiusMiles = options.radiusMiles ?? 500;
  const now = options.now ?? new Date();
  const isPopular = isPopularTrail(op);
  const popularity = op.popularityScore ?? HIDDEN_GEM_UNKNOWN_POPULARITY;
  const identityKey = getRouteIdentityKey(op);
  const seasonStatus = evaluateSeasonStatus(op, now);
  const weatherStatus = evaluateWeatherStatus();
  const accessStatus = evaluateAccessStatus(op);
  const hazardStatus = evaluateHazardStatus(op, compat);
  const disqualificationReasons: HiddenGemDisqualificationReason[] = [];
  const confidence = computeVehicleTrailConfidence(op, compat);
  const oversizedRoute = (op.distanceMiles ?? 0) > HIDDEN_GEM_MAX_FOOTPRINT_MILES || (op.estimatedDays ?? 1) > HIDDEN_GEM_MAX_DURATION_DAYS;
  const tooShort = (op.distanceMiles ?? 0) < HIDDEN_GEM_MIN_LENGTH_MILES;
  const lacksLocalDistinction = !isVehicleAppropriateRoute(op);

  if (!isRouteWithinRadius(op, radiusMiles)) disqualificationReasons.push('radius_exceeded');
  if (isPopular) disqualificationReasons.push('popular_trail');
  if (tooShort) disqualificationReasons.push('too_short');
  if (seasonStatus === 'closed') disqualificationReasons.push('seasonal_closure');
  if (weatherStatus === 'blocked') disqualificationReasons.push('weather_risk');
  if (accessStatus === 'restricted') disqualificationReasons.push('access_restricted');
  if (hazardStatus === 'blocked') disqualificationReasons.push('hazard_flagged');
  if (isRigMismatch(op, compat)) disqualificationReasons.push('rig_mismatch');
  if (confidence.exclusionClassification === 'excluded_hiking') disqualificationReasons.push('excluded_hiking');
  if (confidence.exclusionClassification === 'excluded_pedestrian') disqualificationReasons.push('excluded_pedestrian');
  if (confidence.exclusionClassification === 'excluded_moto_only') disqualificationReasons.push('excluded_moto_only');
  if (confidence.exclusionClassification === 'excluded_bike_only') disqualificationReasons.push('excluded_bike_only');
  if (oversizedRoute && popularity >= 18) disqualificationReasons.push('oversized_destination');
  if (lacksLocalDistinction) disqualificationReasons.push('insufficient_local_distinction');
  if (confidence.confidenceTier === 'low') disqualificationReasons.push('suppressed_low_confidence');

  const suitabilityScore = computeSuitabilityScore(op, compat, radiusMiles, seasonStatus, accessStatus);
  const tripTypeFitScore = computeTripTypeFitScore(op, options.discoveryTab);
  const baseHiddenGemScore = computeHiddenGemRecommendationScore(
    op,
    compat,
    radiusMiles,
    suitabilityScore,
    seasonStatus,
    accessStatus,
  );
  const refinedScore = refineHiddenGemScore({
    op,
    compat,
    vehicleProfile: options.vehicleProfile,
    confidence,
    baseHiddenGemScore,
    suitabilityScore,
    radiusMiles,
    seasonStatus,
    weatherStatus,
    accessStatus,
    hazardStatus,
    operationalState: options.operationalState ?? null,
    expeditionPhase: options.expeditionPhase ?? null,
    recommendationStatus: options.recommendationStatus ?? null,
  });
  const hiddenGemScore = refinedScore.confidenceWeightedScore;
  const hiddenGemEligible =
    isHiddenGemCandidate(op, compat, radiusMiles, seasonStatus, confidence) &&
    refinedScore.promotionStrength !== 'suppressed' &&
    hiddenGemScore >= 62 &&
    disqualificationReasons.length === 0;
  const recommendationReasons = hiddenGemEligible
    ? buildRecommendationReasons(op, compat, radiusMiles, seasonStatus, weatherStatus, options.vehicleProfile)
    : [];
  const discoveryScore = calculateDiscoveryScore(op, compat, radiusMiles, true);
  const classification: ExploreRouteClassification = confidence.exclusionClassification
    ? confidence.exclusionClassification
    : isPopular
    ? 'excluded_popular'
    : hiddenGemEligible
    ? (compat != null && (compat.score ?? 0) < 55 ? 'visible_with_warning' : 'accepted_hidden_gem')
    : confidence.confidenceTier === 'low'
    ? 'suppressed_low_confidence'
    : isVehicleAppropriateRoute(op)
    ? (seasonStatus === 'closed' || oversizedRoute || isRigMismatch(op, compat) ? 'candidate_vehicle_trail' : 'candidate_hidden_gem')
    : 'suppressed_not_viable';
  const route: CategorizedRoute = {
    ...op,
    hiddenGem: hiddenGemEligible,
    categoryScore: hiddenGemScore,
    discoveryScore,
  };

  return {
    id: op.id,
    name: op.name,
    distanceMiles: op.distanceFromUserMiles ?? op.distanceMiles,
    isPopular,
    hiddenGemEligible,
    suitabilityScore,
    hiddenGemScore,
    seasonStatus,
    weatherStatus,
    accessStatus,
    hazardStatus,
    rigFitSummary: buildRigFitSummary(compat, options.vehicleProfile),
    recommendationReasons,
    disqualificationReasons,
    sourceMetadata: {
      identityKey,
      classification,
      confidenceTier: confidence.confidenceTier,
      confidenceScore: confidence.confidenceScore,
      sourceReliabilityScore: confidence.sourceReliabilityScore,
      metadataQualityScore: confidence.metadataQualityScore,
      geometryConfidenceScore: confidence.geometryConfidenceScore,
      vehicleTrailSignalScore: confidence.vehicleTrailSignalScore,
      popularityScore: op.popularityScore ?? null,
      remotenessScore: op.remotenessScore ?? null,
      compatibilityScore: compat?.score ?? null,
      compatibilityRating: compat?.difficultyRating ?? null,
      permitRequired: op.permitRequired,
      distanceFromUserMiles: op.distanceFromUserMiles ?? null,
      vehicleSignals: confidence.vehicleSignals,
      exclusionSignals: confidence.exclusionSignals,
      baseHiddenGemScore,
      confidenceWeightedScore: refinedScore.confidenceWeightedScore,
      confidenceWeight: refinedScore.confidenceWeight,
      promotionStrength: refinedScore.promotionStrength,
      rationaleDrivers: refinedScore.rationaleDrivers,
      rationaleText: refinedScore.rationaleText,
      refinementSuppressionReason: refinedScore.suppressionReason,
      tripTypeFitScore,
    },
    route,
  };
}

function isHiddenGemRecoveryCandidate(
  candidate: HiddenGemResult,
  radiusMiles: number,
): boolean {
  const route = candidate.route;
  const classification = candidate.sourceMetadata?.classification;
  const confidenceTier = candidate.sourceMetadata?.confidenceTier;
  const confidenceScore = candidate.sourceMetadata?.confidenceScore ?? 0;
  const popularityScore =
    candidate.sourceMetadata?.popularityScore ??
    route.popularityScore ??
    HIDDEN_GEM_UNKNOWN_POPULARITY;
  const blockedReasons = new Set(candidate.disqualificationReasons);
  const distanceFromUserMiles =
    candidate.sourceMetadata?.distanceFromUserMiles ??
    route.distanceFromUserMiles ??
    route.distanceMiles ??
    Number.POSITIVE_INFINITY;

  if (candidate.hiddenGemEligible || candidate.isPopular) return false;
  if (distanceFromUserMiles > radiusMiles) return false;
  if (popularityScore > 48) return false;
  if (confidenceTier === 'low' || confidenceTier === 'excluded') return false;
  if (confidenceScore < 52) return false;
  if (candidate.sourceMetadata?.promotionStrength === 'suppressed') return false;
  if (
    blockedReasons.has('popular_trail') ||
    blockedReasons.has('too_short') ||
    blockedReasons.has('seasonal_closure') ||
    blockedReasons.has('weather_risk') ||
    blockedReasons.has('access_restricted') ||
    blockedReasons.has('hazard_flagged') ||
    blockedReasons.has('rig_mismatch') ||
    blockedReasons.has('radius_exceeded') ||
    blockedReasons.has('excluded_hiking') ||
    blockedReasons.has('excluded_pedestrian') ||
    blockedReasons.has('excluded_moto_only') ||
    blockedReasons.has('excluded_bike_only') ||
    blockedReasons.has('suppressed_low_confidence')
  ) {
    return false;
  }
  if (
    classification !== 'candidate_hidden_gem' &&
    classification !== 'candidate_vehicle_trail' &&
    classification !== 'visible_with_warning'
  ) {
    return false;
  }

  return candidate.hiddenGemScore >= 56 && candidate.suitabilityScore >= 58;
}

function isHiddenGemFallbackCandidate(
  candidate: HiddenGemResult,
  radiusMiles: number,
): boolean {
  const route = candidate.route;
  const confidenceTier = candidate.sourceMetadata?.confidenceTier;
  const confidenceScore = candidate.sourceMetadata?.confidenceScore ?? 0;
  const popularityScore =
    candidate.sourceMetadata?.popularityScore ??
    route.popularityScore ??
    HIDDEN_GEM_UNKNOWN_POPULARITY;
  const distanceFromUserMiles =
    candidate.sourceMetadata?.distanceFromUserMiles ??
    route.distanceFromUserMiles ??
    route.distanceMiles ??
    Number.POSITIVE_INFINITY;
  const blockedReasons = new Set(candidate.disqualificationReasons);

  if (candidate.hiddenGemEligible || candidate.isPopular) return false;
  if (distanceFromUserMiles > radiusMiles) return false;
  if (confidenceTier === 'low' || confidenceTier === 'excluded') return false;
  if (confidenceScore < 50) return false;
  if (candidate.sourceMetadata?.promotionStrength === 'suppressed') return false;
  if (
    blockedReasons.has('popular_trail') ||
    blockedReasons.has('seasonal_closure') ||
    blockedReasons.has('weather_risk') ||
    blockedReasons.has('access_restricted') ||
    blockedReasons.has('hazard_flagged') ||
    blockedReasons.has('rig_mismatch') ||
    blockedReasons.has('radius_exceeded') ||
    blockedReasons.has('excluded_hiking') ||
    blockedReasons.has('excluded_pedestrian') ||
    blockedReasons.has('excluded_moto_only') ||
    blockedReasons.has('excluded_bike_only') ||
    blockedReasons.has('insufficient_local_distinction')
  ) {
    return false;
  }

  return (
    popularityScore <= 50 &&
    candidate.hiddenGemScore >= 52 &&
    candidate.suitabilityScore >= 54
  );
}

export function getHiddenGemRecommendations(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  options: HiddenGemRecommendationOptions = {},
): HiddenGemRecommendationPage {
  const pageSize = Math.max(1, options.pageSize ?? 10);
  const radiusMiles = options.radiusMiles ?? 500;
  const dedupedOpportunities = dedupeExploreRoutes(opportunities, compatResults, radiusMiles);
  const emptyDiagnostics: HiddenGemPipelineDiagnostics = {
    rawCandidateCount: opportunities.length,
    dedupedCandidateCount: dedupedOpportunities.length,
    radiusMatchedCount: 0,
    tripTypeMatchedCount: 0,
    hiddenGemEligibilityCount: 0,
    popularTrailSuppressedCount: 0,
    qualityThresholdRejectedCount: 0,
    validationRejectedCount: 0,
    recoveryCandidateCount: 0,
    fallbackCandidateCount: 0,
    finalBaselineEligibleCount: 0,
    unknownPopularityCount: 0,
  };

  if (dedupedOpportunities.length === 0) {
    return {
      items: [],
      evaluatedCandidates: [],
      totalCandidates: 0,
      eligibleCount: 0,
      pageIndex: 0,
      pageSize,
      totalPages: 1,
      offset: 0,
      hasNextPage: false,
      nextPageIndex: 0,
      pipelineDiagnostics: emptyDiagnostics,
    };
  }

  const evaluatedCandidates = dedupedOpportunities
    .map((op) => buildHiddenGemResult(op, compatResults.get(op.id) ?? null, options))
    .sort((a, b) => {
      const scoreDiff = b.hiddenGemScore - a.hiddenGemScore;
      if (scoreDiff !== 0) return scoreDiff;

      const suitabilityDiff = b.suitabilityScore - a.suitabilityScore;
      if (suitabilityDiff !== 0) return suitabilityDiff;

      const distanceDiff = a.distanceMiles - b.distanceMiles;
      if (distanceDiff !== 0) return distanceDiff;

      return a.id.localeCompare(b.id);
    });

  const radiusMatchedCandidates = evaluatedCandidates.filter(
    (candidate) => !candidate.disqualificationReasons.includes('radius_exceeded'),
  );
  const tripTypeMatchedCandidates = radiusMatchedCandidates.filter(
    (candidate) => (candidate.sourceMetadata?.tripTypeFitScore ?? 72) >= 60,
  );
  const targetRecoveryCount = Math.max(pageSize, HIDDEN_GEM_RECOVERY_MIN_COUNT);
  const strictEligibleCandidates = evaluatedCandidates.filter((candidate) => candidate.hiddenGemEligible);
  const popularTrailSuppressedCount = radiusMatchedCandidates.filter((candidate) =>
    candidate.disqualificationReasons.includes('popular_trail'),
  ).length;
  const qualityThresholdRejectedCount = radiusMatchedCandidates.filter((candidate) =>
    candidate.disqualificationReasons.includes('suppressed_low_confidence') ||
    candidate.sourceMetadata?.promotionStrength === 'suppressed' ||
    (!candidate.hiddenGemEligible && candidate.hiddenGemScore < 62)
  ).length;
  const validationRejectedCount = radiusMatchedCandidates.filter((candidate) =>
    candidate.disqualificationReasons.some((reason) =>
      reason !== 'popular_trail' &&
      reason !== 'suppressed_low_confidence' &&
      reason !== 'radius_exceeded',
    ),
  ).length;
  const unknownPopularityCount = radiusMatchedCandidates.filter(
    (candidate) => candidate.sourceMetadata?.popularityScore == null,
  ).length;
  let surfacedCandidates = strictEligibleCandidates;
  let recoveryCandidateCount = 0;
  let fallbackCandidateCount = 0;

  if (radiusMiles >= 100 && strictEligibleCandidates.length < targetRecoveryCount) {
    const supplementalCandidates = evaluatedCandidates.filter((candidate) =>
      !strictEligibleCandidates.some((eligible) => eligible.id === candidate.id) &&
      isHiddenGemRecoveryCandidate(candidate, radiusMiles),
    );
    recoveryCandidateCount = supplementalCandidates.length;
    surfacedCandidates = [...strictEligibleCandidates, ...supplementalCandidates]
      .sort((a, b) => {
        const scoreDiff = b.hiddenGemScore - a.hiddenGemScore;
        if (scoreDiff !== 0) return scoreDiff;

        const suitabilityDiff = b.suitabilityScore - a.suitabilityScore;
        if (suitabilityDiff !== 0) return suitabilityDiff;

        const confidenceDiff =
          (b.sourceMetadata?.confidenceScore ?? 0) - (a.sourceMetadata?.confidenceScore ?? 0);
        if (confidenceDiff !== 0) return confidenceDiff;

        return a.id.localeCompare(b.id);
      })
      .slice(0, Math.max(targetRecoveryCount, strictEligibleCandidates.length));
  }

  if (surfacedCandidates.length === 0 && radiusMiles >= 100) {
    const fallbackCandidates = evaluatedCandidates
      .filter((candidate) => isHiddenGemFallbackCandidate(candidate, radiusMiles))
      .sort((a, b) => {
        const scoreDiff = b.hiddenGemScore - a.hiddenGemScore;
        if (scoreDiff !== 0) return scoreDiff;

        const suitabilityDiff = b.suitabilityScore - a.suitabilityScore;
        if (suitabilityDiff !== 0) return suitabilityDiff;

        const confidenceDiff =
          (b.sourceMetadata?.confidenceScore ?? 0) - (a.sourceMetadata?.confidenceScore ?? 0);
        if (confidenceDiff !== 0) return confidenceDiff;

        return a.id.localeCompare(b.id);
      })
      .slice(0, targetRecoveryCount);

    fallbackCandidateCount = fallbackCandidates.length;
    if (fallbackCandidates.length > 0) {
      surfacedCandidates = fallbackCandidates;
    }
  }

  const pipelineDiagnostics: HiddenGemPipelineDiagnostics = {
    rawCandidateCount: opportunities.length,
    dedupedCandidateCount: dedupedOpportunities.length,
    radiusMatchedCount: radiusMatchedCandidates.length,
    tripTypeMatchedCount: tripTypeMatchedCandidates.length,
    hiddenGemEligibilityCount: strictEligibleCandidates.length,
    popularTrailSuppressedCount,
    qualityThresholdRejectedCount,
    validationRejectedCount,
    recoveryCandidateCount,
    fallbackCandidateCount,
    finalBaselineEligibleCount: surfacedCandidates.length,
    unknownPopularityCount,
  };

  const totalPages = Math.max(1, Math.ceil(surfacedCandidates.length / pageSize));
  const normalizedPageIndex = surfacedCandidates.length === 0
    ? 0
    : ((options.pageIndex ?? 0) % totalPages + totalPages) % totalPages;
  const offset = normalizedPageIndex * pageSize;
  const items = surfacedCandidates.slice(offset, offset + pageSize);

  return {
    items,
    evaluatedCandidates,
    totalCandidates: evaluatedCandidates.length,
    eligibleCount: surfacedCandidates.length,
    pageIndex: normalizedPageIndex,
    pageSize,
    totalPages,
    offset,
    hasNextPage: surfacedCandidates.length > pageSize,
    nextPageIndex: items.length === 0 ? 0 : (normalizedPageIndex + 1) % totalPages,
    pipelineDiagnostics,
  };
}

export function getPopularTrailRecommendations(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  options: HiddenGemRecommendationOptions & { discoveryTab?: DiscoveryTabId | null } = {},
): CategorizedRoute[] {
  const radiusMiles = options.radiusMiles ?? 500;
  const dedupedOpportunities = dedupeExploreRoutes(opportunities, compatResults, radiusMiles);
  const now = options.now ?? new Date();

  const rankedCandidates = dedupedOpportunities
    .map((op) => {
      const compat = compatResults.get(op.id) ?? null;
      const seasonStatus = evaluateSeasonStatus(op, now);
      const weatherStatus = evaluateWeatherStatus();
      const accessStatus = evaluateAccessStatus(op);
      const hazardStatus = evaluateHazardStatus(op, compat);
      const confidence = computeVehicleTrailConfidence(op, compat);
      const identityKey = getRouteIdentityKey(op);

      if (!isRouteWithinRadius(op, radiusMiles) || !isPopularTrail(op) || !isVehicleAppropriateRoute(op)) {
        return null;
      }
      if (seasonStatus === 'closed') {
        return null;
      }
      if (confidence.confidenceTier === 'excluded' || confidence.confidenceTier === 'low') {
        return null;
      }

      const suitabilityScore = computeSuitabilityScore(op, compat, radiusMiles, seasonStatus, accessStatus);
      const basePopularTrailScore = clamp(
        Math.round(
          computePopularTrailClassificationConfidence(op) * 0.34 +
          suitabilityScore * 0.22 +
          computePopularTrailPracticalityScore(op, radiusMiles) * 0.18 +
          computeTripTypeFitScore(op, options.discoveryTab) * 0.14 +
          computePopularTrailFlagshipValue(op) * 0.12,
        ),
        0,
        100,
      );
      const refinedScore = refinePopularTrailScore({
        op,
        compat,
        vehicleProfile: options.vehicleProfile,
        confidence,
        basePopularTrailScore,
        suitabilityScore,
        radiusMiles,
        seasonStatus,
        weatherStatus,
        accessStatus,
        hazardStatus,
        discoveryTab: options.discoveryTab ?? null,
        operationalState: options.operationalState ?? null,
        expeditionPhase: options.expeditionPhase ?? null,
        recommendationStatus: options.recommendationStatus ?? null,
      });

      if (refinedScore.promotionStrength === 'suppressed') {
        return null;
      }
      if (refinedScore.confidenceWeightedScore < 54) {
        return null;
      }

      const classification: ExploreRouteClassification =
        refinedScore.promotionStrength === 'softened'
          ? 'visible_with_warning'
          : 'candidate_vehicle_trail';
      const discoveryScore = calculateDiscoveryScore(op, compat, radiusMiles, false);
      const route: CuratedPopularTrailRoute = {
        ...op,
        hiddenGem: false,
        categoryScore: refinedScore.confidenceWeightedScore,
        discoveryScore,
        sourceMetadata: {
          identityKey,
          classification,
          confidenceTier: confidence.confidenceTier,
          confidenceScore: confidence.confidenceScore,
          sourceReliabilityScore: confidence.sourceReliabilityScore,
          metadataQualityScore: confidence.metadataQualityScore,
          geometryConfidenceScore: confidence.geometryConfidenceScore,
          vehicleTrailSignalScore: confidence.vehicleTrailSignalScore,
          popularityScore: op.popularityScore ?? null,
          remotenessScore: op.remotenessScore ?? null,
          compatibilityScore: compat?.score ?? null,
          compatibilityRating: compat?.difficultyRating ?? null,
          permitRequired: op.permitRequired,
          distanceFromUserMiles: op.distanceFromUserMiles ?? null,
          vehicleSignals: confidence.vehicleSignals,
          exclusionSignals: confidence.exclusionSignals,
          popularTrailBaseScore: basePopularTrailScore,
          confidenceWeightedScore: refinedScore.confidenceWeightedScore,
          confidenceWeight: refinedScore.confidenceWeight,
          promotionStrength: refinedScore.promotionStrength,
          rationaleDrivers: refinedScore.rationaleDrivers,
          rationaleText: refinedScore.rationaleText,
          refinementSuppressionReason: refinedScore.suppressionReason,
          classificationConfidence: refinedScore.classificationConfidence,
          practicalityScore: refinedScore.practicalityScore,
          routeQualityScore: refinedScore.routeQualityScore,
          weatherRelevanceScore: refinedScore.weatherRelevanceScore,
          tripTypeFitScore: refinedScore.tripTypeFitScore,
          phaseAdjustment: refinedScore.phaseAdjustment,
        },
      };

      return {
        route,
        promotionStrength: refinedScore.promotionStrength,
        classificationConfidence: refinedScore.classificationConfidence,
      };
    })
    .filter((
      candidate,
    ): candidate is {
      route: CategorizedRoute;
      promotionStrength: 'highlight' | 'standard' | 'softened';
      classificationConfidence: number;
    } => !!candidate);

  return rankedCandidates
    .sort((left, right) => {
      const promotionOrder = (value: 'highlight' | 'standard' | 'softened') => {
        switch (value) {
          case 'highlight':
            return 3;
          case 'standard':
            return 2;
          case 'softened':
          default:
            return 1;
        }
      };

      const promotionDiff = promotionOrder(right.promotionStrength) - promotionOrder(left.promotionStrength);
      if (promotionDiff !== 0) return promotionDiff;

      const rightRoute = right.route as CuratedPopularTrailRoute;
      const leftRoute = left.route as CuratedPopularTrailRoute;
      const weightedDiff =
        (rightRoute.sourceMetadata?.confidenceWeightedScore ?? rightRoute.categoryScore) -
        (leftRoute.sourceMetadata?.confidenceWeightedScore ?? leftRoute.categoryScore);
      if (weightedDiff !== 0) return weightedDiff;

      const classificationDiff = right.classificationConfidence - left.classificationConfidence;
      if (classificationDiff !== 0) return classificationDiff;

      const suitabilityDiff = (compatResults.get(right.route.id)?.score ?? 0) - (compatResults.get(left.route.id)?.score ?? 0);
      if (suitabilityDiff !== 0) return suitabilityDiff;

      const distanceDiff =
        (left.route.distanceFromUserMiles ?? Number.POSITIVE_INFINITY) -
        (right.route.distanceFromUserMiles ?? Number.POSITIVE_INFINITY);
      if (distanceDiff !== 0) return distanceDiff;

      return left.route.name.localeCompare(right.route.name);
    })
    .map((candidate) => candidate.route);
}

export function selectHiddenGemRoutes(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  userDistanceMax: number = 500,
  maxCount: number = 10,
  minPreferredCount: number = 5,
): CategorizedRoute[] {
  const page = getHiddenGemRecommendations(opportunities, compatResults, {
    radiusMiles: userDistanceMax,
    pageIndex: 0,
    pageSize: Math.max(maxCount, minPreferredCount),
  });
  return page.items.slice(0, maxCount).map((item) => item.route);
}

// ============================================================
// CLASSIFICATION RULES
// ============================================================

function isDayTrip(hours: number, miles: number, days: number): boolean {
  return days <= DAY_TRIP_MAX_DAYS && (hours <= DAY_TRIP_MAX_HOURS || miles <= DAY_TRIP_MAX_MILES);
}

function isWeekendTrip(miles: number, days: number): boolean {
  return (
    days >= WEEKEND_MIN_DAYS && days <= WEEKEND_MAX_DAYS &&
    miles >= WEEKEND_MIN_MILES && miles <= WEEKEND_MAX_MILES
  );
}

function isExpedition(miles: number, days: number): boolean {
  return days >= EXPEDITION_MIN_DAYS || miles >= EXPEDITION_MIN_MILES;
}

// ============================================================
// LEGACY CATEGORIZATION (backward compatibility)
// ============================================================

const LEGACY_WEEKEND_MIN = 40;
const LEGACY_WEEKEND_MAX = 120;
const LEGACY_WEEKEND_MIN_DAYS = 1;
const LEGACY_WEEKEND_MAX_DAYS = 3;
const LEGACY_QUIET_MAX_MI = 80;
const LEGACY_QUIET_MAX_DAYS = 2;

export function categorizeRoutes(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  userDistanceMax: number = 500,
): DiscoverCategories {
  const weekend: CategorizedRoute[] = [];
  const quiet: CategorizedRoute[] = [];
  const expedition: CategorizedRoute[] = [];

  for (const op of opportunities) {
    const compat = compatResults.get(op.id) ?? null;
    const score = calculateDiscoveryScore(op, compat, userDistanceMax);

    if (op.distanceMiles >= LEGACY_WEEKEND_MIN && op.distanceMiles <= LEGACY_WEEKEND_MAX &&
        op.estimatedDays >= LEGACY_WEEKEND_MIN_DAYS && op.estimatedDays <= LEGACY_WEEKEND_MAX_DAYS) {
      weekend.push({ ...op, categoryScore: score });
    } else if ((op.distanceMiles < LEGACY_WEEKEND_MIN && op.estimatedDays <= LEGACY_QUIET_MAX_DAYS) ||
               (op.distanceMiles <= LEGACY_QUIET_MAX_MI && op.estimatedDays <= 1)) {
      quiet.push({ ...op, categoryScore: score });
    } else {
      expedition.push({ ...op, categoryScore: score });
    }
  }

  weekend.sort((a, b) => b.categoryScore - a.categoryScore);
  quiet.sort((a, b) => b.categoryScore - a.categoryScore);
  expedition.sort((a, b) => b.categoryScore - a.categoryScore);

  return { weekendAdventures: weekend, quietExploration: quiet, expeditionRoutes: expedition };
}

// ============================================================
// TAB METADATA
// ============================================================

export const WEEKEND_ADVENTURES_META = {
  title: 'WEEKEND ADVENTURES',
  subtitle: 'Overnight-capable routes for weekend exploration with high remoteness and camping potential',
  icon: 'moon-outline' as const,
  accentColor: 'rgba(140, 120, 210, 0.85)',
  emptyTitle: 'NO WEEKEND ROUTES IN RANGE',
  emptyDesc: 'No weekend-length routes (40–120 mi) found within your current search radius. Try expanding your distance filter.',
  footerText: 'Routes ranked by remoteness, camping potential, vehicle compatibility, and offline readiness.',
};

export const QUIET_EXPLORATION_META = {
  title: 'QUIET EXPLORATION',
  subtitle: 'Lesser-known routes with high solitude and dispersed camping potential',
  icon: 'leaf-outline' as const,
  accentColor: 'rgba(80, 170, 150, 0.85)',
  emptyTitle: 'NO QUIET ROUTES IN RANGE',
  emptyDesc: 'No lesser-known routes found within your current search radius. Try expanding your distance filter.',
  footerText: 'Routes ranked by remoteness, proximity, and dispersed camping potential.',
};

export const EXPEDITION_ROUTES_META = {
  title: 'EXPEDITION ROUTES',
  subtitle: 'Multi-day backcountry routes for extended overland travel',
  icon: 'compass-outline' as const,
  accentColor: 'rgba(200, 150, 60, 0.85)',
  emptyTitle: 'NO EXPEDITION ROUTES IN RANGE',
  emptyDesc: 'No expedition-length routes found within your current search radius. Try expanding your distance filter.',
  footerText: 'Routes ranked by trail quality, vehicle compatibility, remoteness, and offline readiness.',
};

// ============================================================
// CATEGORY STATISTICS
// ============================================================

export function computeCategoryStats(
  routes: CategorizedRoute[],
  compatResults: Map<string, CompatibilityResult>,
): CategoryStats {
  if (routes.length === 0) {
    return { routeCount: 0, avgRemoteness: 0, avgDistance: 0, totalCamps: 0, avgVehicleMatch: null, avgEstimatedDays: 0 };
  }

  let totalRemoteness = 0, totalDistance = 0, totalCamps = 0, totalVehicleMatch = 0, vehicleMatchCount = 0, totalDays = 0;

  for (const route of routes) {
    totalRemoteness += route.remotenessScore ?? 0;
    totalDistance += route.distanceMiles ?? 0;
    totalCamps += route.suggestedCamps ?? 0;
    totalDays += route.estimatedDays ?? 1;
    const compat = compatResults.get(route.id);
    if (compat) { totalVehicleMatch += compat.score; vehicleMatchCount++; }
  }

  return {
    routeCount: routes.length,
    avgRemoteness: parseFloat((totalRemoteness / routes.length).toFixed(1)),
    avgDistance: Math.round(totalDistance / routes.length),
    totalCamps,
    avgVehicleMatch: vehicleMatchCount > 0 ? Math.round(totalVehicleMatch / vehicleMatchCount) : null,
    avgEstimatedDays: parseFloat((totalDays / routes.length).toFixed(1)),
  };
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

export function formatTripDuration(days: number): string {
  if (days <= 1) return 'DAY TRIP';
  if (days <= 2) return 'OVERNIGHT';
  if (days <= 3) return 'WEEKEND';
  if (days <= 5) return `${days} DAYS`;
  return `${days}+ DAYS`;
}

export function getTripDurationColor(days: number): string {
  if (days <= 1) return '#66BB6A';
  if (days <= 2) return '#5AC8FA';
  if (days <= 3) return 'rgba(140, 120, 210, 0.90)';
  if (days <= 5) return '#E67E22';
  return '#E04030';
}

export function getCategoryScoreColor(score: number): string {
  if (score >= 80) return '#66BB6A';
  if (score >= 60) return '#D4A017';
  if (score >= 40) return '#E67E22';
  return '#E04030';
}

export function getCategoryScoreLabel(score: number): string {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GREAT';
  if (score >= 55) return 'GOOD';
  if (score >= 40) return 'FAIR';
  return 'LOW';
}

export function formatDistance(miles: number): string {
  if (miles >= 1000) return `${(miles / 1000).toFixed(1)}K`;
  return `${miles}`;
}

// ============================================================
// HELPERS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

