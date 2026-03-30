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
import type { CompatibilityResult } from './rigCompatibilityEngine';

const TAG = '[DISCOVER-CATEGORY]';

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
const HIDDEN_GEM_MAX_POPULARITY = 35;
const HIDDEN_GEM_MIN_REMOTENESS = 6;
const HIDDEN_GEM_MIN_SCENERY = 5; // elevation gain proxy

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
export function isHiddenGem(op: ExpeditionOpportunity): boolean {
  const popularity = op.popularityScore ?? 50; // default to medium if unknown
  const remoteness = op.remotenessScore ?? 5;
  const scenery = Math.min(op.elevationGainFt / 1000, 10); // normalize to 0-10

  return (
    popularity <= HIDDEN_GEM_MAX_POPULARITY &&
    remoteness >= HIDDEN_GEM_MIN_REMOTENESS &&
    scenery >= HIDDEN_GEM_MIN_SCENERY
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
  const sortByScore = (a: CategorizedRoute, b: CategorizedRoute) =>
    (b.discoveryScore ?? b.categoryScore) - (a.discoveryScore ?? a.categoryScore);

  dayTrips.sort(sortByScore);
  weekendTrips.sort(sortByScore);
  expeditions.sort(sortByScore);
  remoteRoutes.sort(sortByScore);
  all.sort(sortByScore);

  console.log(
    TAG,
    `Categorized: ${dayTrips.length} Day Trips, ${weekendTrips.length} Weekend Trips, ` +
    `${expeditions.length} Expeditions, ${remoteRoutes.length} Remote Routes`,
  );

  return { dayTrips, weekendTrips, expeditions, remoteRoutes, all };
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

