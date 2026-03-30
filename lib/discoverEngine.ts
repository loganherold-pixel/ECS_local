// ============================================================
// DISCOVER ENGINE — Expedition Opportunity Explorer
// ============================================================
// Returns expedition opportunities for the Discover tab.
// Works in STANDBY state with no GPX route or telemetry data.
//
// Phase 1: Local seed dataset with static opportunities.
// Phase 2: Rig Compatibility Engine integration for vehicle-aware scoring.
// Phase 3: Distance-aware filtering with user location support.
// Phase 4: Region-aware grouping for curated browsing.
// Phase 4.5: Discovery Distance Intelligence + Trail Relevance
//   - Default radius changed from 500 → 200 miles
//   - Hard cap: trails > 500 mi never appear in default results
//   - Match Score: composite relevance combining distance, rating,
//     terrain compatibility, and vehicle capability
//   - Deduplication by trail ID
//   - Loading state support
// Phase 10: Camping Intelligence integration
//   - campingPotentialScore field on ExpeditionOpportunity
//   - Camping potential evaluated during opportunity loading
//   - Camp zone data available for route detail views
// Phase 12: Expedition Fit Indicator integration
//   - expeditionFitScore field on ExpeditionOpportunity
//   - Evaluates how well routes match user's vehicle, goals, and duration
//   - Integrates with all Discovery categories
//   - Updates when vehicle profile or filters change
// Phase 14: Local Knowledge Layer integration
//   - localHighlights field on ExpeditionOpportunity
//   - Contextual environmental highlights along routes
//   - Scenic overlooks, water crossings, historic sites, dark sky areas
//   - Integrates with all Discovery categories
//   - Works with offline cached routes
// Phase 15: Core System Stability Pass
//   - Metadata validation on all loaded routes
//   - Deduplication audit logging
//   - Safe defaults for missing fields
//   - Non-blocking loading pipeline
//   - Graceful fallback when data cannot load
// ============================================================




import {
  buildVehicleProfile,
  buildProfileFromSpecs,
  scoreAndSortOpportunities,
  type VehicleProfile,
  type CompatibilityResult,
} from './rigCompatibilityEngine';
import type { LocalHighlight } from './localKnowledgeEngine';
import {
  validateRouteMetadata,
  auditDuplicates,
  stabilityLog,
} from './ecsStabilityGuards';

const TAG = '[DiscoverEngine]';



// ── Distance Radius Presets ──────────────────────────────────
export const DISTANCE_RADIUS_OPTIONS = [50, 100, 200, 500] as const;
export type DistanceRadius = typeof DISTANCE_RADIUS_OPTIONS[number];
export const DEFAULT_DISTANCE_RADIUS: DistanceRadius = 200;

// ── Hard distance cap ────────────────────────────────────────
// Trails beyond this distance NEVER appear in default Discovery results.
// Users must manually expand the distance filter to see them.
export const HARD_CAP_DISTANCE_MILES = 500;

// ── Default user location (geographic center of contiguous US) ─
// Used when GPS is unavailable. Approx. Lebanon, Kansas.
export const DEFAULT_USER_LOCATION = {
  latitude: 39.8283,
  longitude: -98.5795,
};

// ── Haversine Distance ───────────────────────────────────────
// Duplicated here to avoid circular dependency with useGPSLocation hook.
function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Region Group Definitions ─────────────────────────────────
// Broader geographic groupings for curated Discover sections.
export const REGION_GROUPS = {
  'utah-canyonlands':     { name: 'Utah Canyonlands',           icon: 'layers-outline' as const,       color: 'rgba(200, 150, 60, 0.65)' },
  'california-desert':    { name: 'California Desert',          icon: 'sunny-outline' as const,        color: 'rgba(210, 170, 80, 0.65)' },
  'colorado-high-country':{ name: 'Colorado High Country',      icon: 'triangle-outline' as const,     color: 'rgba(100, 160, 220, 0.65)' },
  'southern-appalachians':{ name: 'Southern Appalachians',      icon: 'leaf-outline' as const,         color: 'rgba(80, 170, 120, 0.65)' },
  'upper-midwest':        { name: 'Upper Midwest',              icon: 'map-outline' as const,          color: 'rgba(140, 140, 100, 0.65)' },
  'arkansas-ozarks':      { name: 'Arkansas Ozarks',            icon: 'water-outline' as const,        color: 'rgba(80, 170, 150, 0.65)' },
  'sierra-nevada':        { name: 'Sierra Nevada',              icon: 'snow-outline' as const,         color: 'rgba(120, 180, 220, 0.65)' },
  'pacific-northwest':    { name: 'Pacific Northwest',          icon: 'rainy-outline' as const,        color: 'rgba(80, 140, 120, 0.65)' },
  'arizona-desert':       { name: 'Arizona Desert',             icon: 'flame-outline' as const,        color: 'rgba(200, 120, 80, 0.65)' },
  'texas-hill-country':   { name: 'Texas Hill Country',         icon: 'trail-sign-outline' as const,   color: 'rgba(180, 140, 80, 0.65)' },
  'idaho-montana':        { name: 'Idaho–Montana Backcountry',  icon: 'mountain-outline' as const,     color: 'rgba(100, 140, 180, 0.65)' },
  'great-basin':          { name: 'Great Basin',                icon: 'earth-outline' as const,        color: 'rgba(170, 150, 100, 0.65)' },
  'oregon-cascades':      { name: 'Oregon Cascades',            icon: 'partly-sunny-outline' as const, color: 'rgba(90, 150, 130, 0.65)' },
  'new-mexico':           { name: 'New Mexico Highlands',       icon: 'star-outline' as const,         color: 'rgba(180, 100, 100, 0.65)' },
  'kentucky-appalachians':{ name: 'Kentucky Appalachians',      icon: 'leaf-outline' as const,         color: 'rgba(100, 160, 100, 0.65)' },
} as const;

export type RegionGroupId = keyof typeof REGION_GROUPS;



// ── Expedition Opportunity Model ─────────────────────────────
export interface ExpeditionOpportunity {
  id: string;
  name: string;
  region: string;
  regionGroup: RegionGroupId;         // broader geographic grouping
  distanceMiles: number;              // trail length
  terrainType: string;
  remotenessScore: number;            // 1–10 scale
  estimatedFuelRequired: number;      // gallons
  suggestedCamps: number;
  rigCompatibility?: number;          // 0–100 (filled by Rig Compatibility Engine)
  difficultyRating?: string;          // e.g. 'MODERATE', 'HARD' (filled by engine)
  // ── Extended metadata for rich UI ──
  description: string;
  highlights: string[];
  elevationGainFt: number;
  estimatedDays: number;
  bestSeason: string;
  permitRequired: boolean;
  imageTag: string;                   // identifier for themed visual
  startLat: number;                   // trailhead latitude
  startLng: number;                   // trailhead longitude
  distanceFromUserMiles?: number;     // computed distance from user
  // ── Terrain requirement fields (Phase 5: Tires/Lift integration) ──
  recommendedTireSize?: number;       // inches (e.g. 33, 35)
  recommendedLift?: number;           // inches (e.g. 2, 3)
  terrainDifficulty?: number;         // 1–10 scale
  // ── Match Score (Phase 4.5: Trail Relevance) ──

  matchScore?: number;                // 0–100 composite relevance score
  // ── Camping Intelligence (Phase 10) ──
  campingPotentialScore?: number;     // 0–100 camping potential score
  // ── Expedition Fit (Phase 12) ──
  expeditionFitScore?: number;        // 0–100 expedition fit score
  // ── Local Knowledge (Phase 14) ──
  localHighlights?: LocalHighlight[]; // contextual environmental highlights
  // ── Discovery Expansion (Phase 16) ──
  popularityScore?: number;           // 0–100 how well-known the route is (higher = more popular)
  estimatedTravelHours?: number;      // estimated driving/travel time in hours
  hiddenGem?: boolean;                // computed tag for lesser-known high-quality routes
}


// ── Region Group Result ──────────────────────────────────────
// Represents a grouped set of opportunities within a region.
export interface RegionGroupResult {
  regionGroupId: RegionGroupId;
  name: string;
  icon: string;
  color: string;
  opportunities: ExpeditionOpportunity[];
  avgDistanceFromUser: number;        // average distance of trails in this group
  minDistanceFromUser: number;        // closest trail distance
  trailCount: number;
}

// ============================================================
// MATCH SCORE ENGINE (Phase 4.5)
// ============================================================
// Composite relevance score: 0–100
//
// Factors:
//   distanceProximity   35%  — closer trails score higher
//   trailRating         20%  — remoteness + elevation + days
//   terrainCompat       25%  — rig compatibility terrain factor
//   vehicleCapability   20%  — rig compatibility overall score
//
// If no vehicle profile exists, terrainCompat and vehicleCapability
// are replaced with neutral defaults (60).
// ============================================================

const MATCH_W_DISTANCE  = 0.35;
const MATCH_W_RATING    = 0.20;
const MATCH_W_TERRAIN   = 0.25;
const MATCH_W_VEHICLE   = 0.20;

/**
 * Calculate a composite Match Score for a single trail.
 *
 * @param op             The expedition opportunity (must have distanceFromUserMiles set)
 * @param compatResult   Optional rig compatibility result
 * @param maxDistanceMi  The maximum distance in the current result set (for normalization)
 * @returns Match score 0–100
 */
export function calculateMatchScore(
  op: ExpeditionOpportunity,
  compatResult?: CompatibilityResult | null,
  maxDistanceMi: number = 500,
): number {
  // ── Distance Proximity Score (0–100) ──
  // Closer = higher. Uses inverse linear scaling against maxDistance.
  const userDist = op.distanceFromUserMiles ?? maxDistanceMi;
  const clampedDist = Math.min(userDist, maxDistanceMi);
  const distanceScore = Math.max(0, Math.round(100 * (1 - clampedDist / maxDistanceMi)));

  // ── Trail Rating Score (0–100) ──
  // Combines remoteness, elevation gain, and estimated days into a
  // quality/adventure rating. Higher remoteness and bigger adventures
  // score higher, but extremely long trips get a slight penalty.
  const remotenessNorm = Math.min(op.remotenessScore / 10, 1) * 100;
  const elevationNorm = Math.min(op.elevationGainFt / 10000, 1) * 100;
  const daysNorm = op.estimatedDays <= 5
    ? Math.min(op.estimatedDays / 5, 1) * 100
    : Math.max(60, 100 - (op.estimatedDays - 5) * 5); // slight penalty for very long trips
  const trailRating = Math.round(remotenessNorm * 0.50 + elevationNorm * 0.25 + daysNorm * 0.25);

  // ── Terrain Compatibility Score (0–100) ──
  // From rig compatibility engine terrain factor, or neutral default.
  const terrainScore = compatResult?.factors?.terrainMatch ?? 60;

  // ── Vehicle Capability Score (0–100) ──
  // Overall rig compatibility score, or neutral default.
  const vehicleScore = compatResult?.score ?? 60;

  // ── Composite ──
  const raw =
    distanceScore * MATCH_W_DISTANCE +
    trailRating * MATCH_W_RATING +
    terrainScore * MATCH_W_TERRAIN +
    vehicleScore * MATCH_W_VEHICLE;

  return clamp(Math.round(raw), 0, 100);
}

/**
 * Calculate match scores for all opportunities in a batch.
 * Also enriches each opportunity with the matchScore field.
 */
export function enrichWithMatchScores(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
): ExpeditionOpportunity[] {
  if (opportunities.length === 0) return opportunities;

  // Determine max distance for normalization
  const distances = opportunities
    .map(op => op.distanceFromUserMiles ?? Infinity)
    .filter(d => d !== Infinity);
  const maxDist = distances.length > 0 ? Math.max(...distances, 100) : 500;

  return opportunities.map(op => ({
    ...op,
    matchScore: calculateMatchScore(
      op,
      compatResults.get(op.id) ?? null,
      maxDist,
    ),
  }));
}

// ── Seed Expedition Dataset ──────────────────────────────────
const SEED_OPPORTUNITIES: ExpeditionOpportunity[] = [
  {
    id: 'white-rim-trail',
    name: 'White Rim Trail',
    region: 'Canyonlands, Utah',
    regionGroup: 'utah-canyonlands',
    distanceMiles: 100,
    terrainType: 'Desert Canyon',
    remotenessScore: 8,
    estimatedFuelRequired: 12,
    suggestedCamps: 3,
    description:
      'A 100-mile loop through the heart of Canyonlands National Park along the White Rim sandstone bench. Dramatic canyon views, exposed ledges, and iconic desert landscapes.',
    highlights: [
      'Sheer canyon drop-offs',
      'Musselman Arch crossing',
      'Green River overlooks',
      'Mineral Bottom descent',
    ],
    elevationGainFt: 4200,
    estimatedDays: 3,
    bestSeason: 'Spring / Fall',
    permitRequired: true,
    imageTag: 'desert-canyon',
    startLat: 38.4587,
    startLng: -109.8209,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
  },
  {
    id: 'mojave-road',
    name: 'Mojave Road',
    region: 'Mojave Desert, California',
    regionGroup: 'california-desert',
    distanceMiles: 138,
    terrainType: 'Desert Sand / Rock',
    remotenessScore: 9,
    estimatedFuelRequired: 18,
    suggestedCamps: 4,
    description:
      'An historic east-west route across the Mojave Desert following a 19th-century military and trade corridor. Remote, waterless, and steeped in frontier history.',
    highlights: [
      'Soda Dry Lake crossing',
      'Mojave National Preserve',
      'Volcanic cinder cones',
      'Historic Fort Piute ruins',
    ],
    elevationGainFt: 5800,
    estimatedDays: 4,
    bestSeason: 'Winter / Early Spring',
    permitRequired: false,
    imageTag: 'desert-sand',
    startLat: 35.1415,
    startLng: -115.5107,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 7,
  },
  {
    id: 'alpine-loop',
    name: 'Alpine Loop',
    region: 'San Juan Mountains, Colorado',
    regionGroup: 'colorado-high-country',
    distanceMiles: 65,
    terrainType: 'Alpine / Mountain Pass',
    remotenessScore: 7,
    estimatedFuelRequired: 8,
    suggestedCamps: 2,
    description:
      'A high-altitude loop connecting Ouray, Silverton, and Lake City over Engineer and Cinnamon passes. Breathtaking 12,000+ ft passes with wildflower meadows and mining ruins.',
    highlights: [
      'Engineer Pass (12,800 ft)',
      'Cinnamon Pass (12,620 ft)',
      'Animas Forks ghost town',
      'Alpine wildflower meadows',
    ],
    elevationGainFt: 8400,
    estimatedDays: 2,
    bestSeason: 'Summer',
    permitRequired: false,
    imageTag: 'alpine-mountain',
    startLat: 38.0228,
    startLng: -107.6714,
    recommendedTireSize: 33,
    recommendedLift: 3,
    terrainDifficulty: 7,
  },
  {
    id: 'georgia-traverse',
    name: 'Georgia Traverse',
    region: 'North Georgia Mountains',
    regionGroup: 'southern-appalachians',
    distanceMiles: 85,
    terrainType: 'Forest / Mountain',
    remotenessScore: 5,
    estimatedFuelRequired: 10,
    suggestedCamps: 2,
    description:
      'A scenic traverse through the Chattahoochee National Forest linking remote forest service roads, creek crossings, and ridgeline trails in the southern Appalachians.',
    highlights: [
      'Chattahoochee National Forest',
      'Multiple creek crossings',
      'Ridgeline fire roads',
      'Brasstown Bald approach',
    ],
    elevationGainFt: 6200,
    estimatedDays: 2,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 34.8698,
    startLng: -83.8107,
    recommendedTireSize: 31,
    recommendedLift: 2,
    terrainDifficulty: 5,
  },
  {
    id: 'trans-wisconsin-adventure-trail',
    name: 'Trans Wisconsin Adventure Trail',
    region: 'Wisconsin',
    regionGroup: 'upper-midwest',
    distanceMiles: 625,
    terrainType: 'Mixed Forest / Gravel',
    remotenessScore: 4,
    estimatedFuelRequired: 42,
    suggestedCamps: 8,
    description:
      'A 625-mile route spanning the full length of Wisconsin from the Illinois border to Lake Superior. Gravel roads, forest two-tracks, and small-town Americana.',
    highlights: [
      'Kettle Moraine State Forest',
      'Chequamegon-Nicolet NF',
      'Lake Superior shoreline',
      'Driftless Area bluffs',
    ],
    elevationGainFt: 12000,
    estimatedDays: 8,
    bestSeason: 'Summer / Early Fall',
    permitRequired: false,
    imageTag: 'forest-gravel',
    startLat: 42.5000,
    startLng: -89.0000,
    recommendedTireSize: 31,
    recommendedLift: 0,
    terrainDifficulty: 3,
  },
  {
    id: 'death-valley-backcountry',
    name: 'Death Valley Backcountry Loop',
    region: 'Death Valley, California',
    regionGroup: 'california-desert',
    distanceMiles: 92,
    terrainType: 'Desert Canyon',
    remotenessScore: 9,
    estimatedFuelRequired: 14,
    suggestedCamps: 3,
    description:
      'A remote backcountry loop through Titus Canyon, Racetrack Playa, and Hidden Valley. Extreme heat, no services, and some of the most alien landscapes in North America.',
    highlights: [
      'Racetrack Playa sailing stones',
      'Titus Canyon narrows',
      'Ubehebe Crater',
      'Hidden Valley petroglyphs',
    ],
    elevationGainFt: 5100,
    estimatedDays: 3,
    bestSeason: 'Winter',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 36.5054,
    startLng: -117.0794,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 7,
  },
  {
    id: 'ouachita-backcountry',
    name: 'Ouachita Backcountry Byway',
    region: 'Ouachita Mountains, Arkansas',
    regionGroup: 'arkansas-ozarks',
    distanceMiles: 72,
    terrainType: 'Forest / Mountain',
    remotenessScore: 6,
    estimatedFuelRequired: 9,
    suggestedCamps: 2,
    description:
      'A scenic forest service route through the Ouachita National Forest with creek fords, ridge-top views, and dispersed camping in the heart of Arkansas hill country.',
    highlights: [
      'Ouachita National Forest',
      'Crystal clear creek fords',
      'Ridge-top panoramas',
      'Dispersed forest camping',
    ],
    elevationGainFt: 4800,
    estimatedDays: 2,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 34.6700,
    startLng: -93.9900,
    recommendedTireSize: 31,
    recommendedLift: 2,
    terrainDifficulty: 5,
  },
  {
    id: 'black-bear-pass',
    name: 'Black Bear Pass',
    region: 'Telluride, Colorado',
    regionGroup: 'colorado-high-country',
    distanceMiles: 18,
    terrainType: 'Alpine / Mountain Pass',
    remotenessScore: 7,
    estimatedFuelRequired: 4,
    suggestedCamps: 1,
    description:
      'One of Colorado\'s most infamous 4x4 trails, descending from Imogene Pass into Telluride via a series of tight switchbacks above sheer cliffs. Short but intense.',
    highlights: [
      'Bridal Veil Falls overlook',
      'Exposed cliff-edge switchbacks',
      'Telluride box canyon views',
      'Alpine tundra wildflowers',
    ],
    elevationGainFt: 3200,
    estimatedDays: 1,
    bestSeason: 'Summer',
    permitRequired: false,
    imageTag: 'alpine-mountain',
    startLat: 37.9375,
    startLng: -107.8123,
    recommendedTireSize: 35,
    recommendedLift: 3,
    terrainDifficulty: 9,
  },
  // ── Phase 4: Additional seed trails for richer region grouping ──
  {
    id: 'rubicon-trail',
    name: 'Rubicon Trail',
    region: 'Sierra Nevada, California',
    regionGroup: 'sierra-nevada',
    distanceMiles: 22,
    terrainType: 'Alpine / Rock',
    remotenessScore: 7,
    estimatedFuelRequired: 5,
    suggestedCamps: 2,
    description:
      'The legendary Rubicon Trail from Georgetown to Lake Tahoe is one of the most challenging and iconic 4x4 routes in America. Granite boulders, steep climbs, and pristine alpine lakes.',
    highlights: [
      'Cadillac Hill rock garden',
      'Rubicon Springs campground',
      'Buck Island Lake overlook',
      'Old-growth granite passages',
    ],
    elevationGainFt: 4600,
    estimatedDays: 2,
    bestSeason: 'Summer / Early Fall',
    permitRequired: true,
    imageTag: 'alpine-mountain',
    startLat: 38.9400,
    startLng: -120.3300,
    recommendedTireSize: 35,
    recommendedLift: 4,
    terrainDifficulty: 9,
  },
  {
    id: 'olympic-peninsula-loop',
    name: 'Olympic Peninsula Backcountry',
    region: 'Olympic Peninsula, Washington',
    regionGroup: 'pacific-northwest',
    distanceMiles: 145,
    terrainType: 'Forest / Mountain',
    remotenessScore: 6,
    estimatedFuelRequired: 16,
    suggestedCamps: 3,
    description:
      'A multi-day loop through the Olympic National Forest combining coastal logging roads, temperate rainforest tracks, and mountain ridge routes with stunning Pacific views.',
    highlights: [
      'Hoh Rainforest approach',
      'Pacific coastal overlooks',
      'Old-growth cedar groves',
      'Hurricane Ridge access roads',
    ],
    elevationGainFt: 7200,
    estimatedDays: 3,
    bestSeason: 'Summer / Early Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 47.8021,
    startLng: -123.6044,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 5,
  },
  {
    id: 'arizona-backcountry-discovery',
    name: 'Arizona BDR (South Section)',
    region: 'Southern Arizona',
    regionGroup: 'arizona-desert',
    distanceMiles: 210,
    terrainType: 'Desert Sand / Rock',
    remotenessScore: 8,
    estimatedFuelRequired: 22,
    suggestedCamps: 4,
    description:
      'The southern section of the Arizona Backcountry Discovery Route traverses Sonoran desert, saguaro forests, and rugged mountain passes between the Mexican border and Phoenix.',
    highlights: [
      'Saguaro cactus forests',
      'Coronado National Forest',
      'Santa Rita Mountains',
      'Historic mining towns',
    ],
    elevationGainFt: 9200,
    estimatedDays: 4,
    bestSeason: 'Winter / Spring',
    permitRequired: false,
    imageTag: 'desert-sand',
    startLat: 31.9500,
    startLng: -110.9747,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 7,
  },
  {
    id: 'hidden-falls-network',
    name: 'Hidden Falls Adventure Park',
    region: 'Texas Hill Country',
    regionGroup: 'texas-hill-country',
    distanceMiles: 45,
    terrainType: 'Forest / Rock',
    remotenessScore: 3,
    estimatedFuelRequired: 5,
    suggestedCamps: 1,
    description:
      'A well-maintained off-road park in the Texas Hill Country with a network of trails ranging from beginner to expert. Limestone ledges, creek crossings, and wooded hillside routes.',
    highlights: [
      'Limestone shelf ledges',
      'Pedernales River crossings',
      'Hill country panoramas',
      'Rated trail difficulty system',
    ],
    elevationGainFt: 2400,
    estimatedDays: 1,
    bestSeason: 'Year-round',
    permitRequired: true,
    imageTag: 'forest-mountain',
    startLat: 30.4500,
    startLng: -98.1500,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
  },
  // ── Phase 16: Expanded Discovery Dataset ──────────────────
  // Day Trips
  { id: 'medano-pass', name: 'Medano Pass', region: 'Great Sand Dunes, Colorado', regionGroup: 'colorado-high-country', distanceMiles: 22, terrainType: 'Desert Sand / Rock', remotenessScore: 5, estimatedFuelRequired: 4, suggestedCamps: 0, description: 'A scenic sand road climbing through the Sangre de Cristo Mountains to Great Sand Dunes National Park. Deep sand sections and mountain creek crossings.', highlights: ['Great Sand Dunes views', 'Deep sand driving', 'Sangre de Cristo peaks', 'Creek ford crossings'], elevationGainFt: 2800, estimatedDays: 1, bestSeason: 'Summer / Fall', permitRequired: false, imageTag: 'desert-sand', startLat: 37.7500, startLng: -105.5100, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 5, popularityScore: 45, estimatedTravelHours: 3 },
  { id: 'shafer-trail', name: 'Shafer Trail', region: 'Canyonlands, Utah', regionGroup: 'utah-canyonlands', distanceMiles: 15, terrainType: 'Desert Canyon', remotenessScore: 7, estimatedFuelRequired: 3, suggestedCamps: 0, description: 'A dramatic switchback descent from Island in the Sky mesa to the canyon floor. Exposed cliff-edge driving with stunning views of the Colorado River.', highlights: ['Cliff-edge switchbacks', 'Colorado River views', 'Potash Road connection', 'Mesa-top panoramas'], elevationGainFt: 1400, estimatedDays: 1, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-canyon', startLat: 38.4200, startLng: -109.8600, recommendedTireSize: 31, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 55, estimatedTravelHours: 2 },
  { id: 'poughkeepsie-gulch', name: 'Poughkeepsie Gulch', region: 'Ouray, Colorado', regionGroup: 'colorado-high-country', distanceMiles: 8, terrainType: 'Alpine / Rock', remotenessScore: 6, estimatedFuelRequired: 2, suggestedCamps: 0, description: 'A short but extremely challenging alpine rock crawl near Ouray. The Wall obstacle is one of Colorado\'s most famous 4x4 challenges.', highlights: ['The Wall obstacle', 'Lake Como overlook', 'Alpine rock gardens', 'Extreme shelf roads'], elevationGainFt: 2200, estimatedDays: 1, bestSeason: 'Summer', permitRequired: false, imageTag: 'alpine-mountain', startLat: 37.9600, startLng: -107.6800, recommendedTireSize: 35, recommendedLift: 3, terrainDifficulty: 10, popularityScore: 60, estimatedTravelHours: 3 },
  { id: 'hole-in-the-rock', name: 'Hole in the Rock Road', region: 'Grand Staircase, Utah', regionGroup: 'utah-canyonlands', distanceMiles: 62, terrainType: 'Desert Sand / Rock', remotenessScore: 8, estimatedFuelRequired: 8, suggestedCamps: 1, description: 'A remote desert road through Grand Staircase-Escalante following the historic Mormon pioneer route. Slot canyons, petrified wood, and vast empty desert.', highlights: ['Devil\'s Garden hoodoos', 'Dance Hall Rock', 'Slot canyon access', 'Petrified wood fields'], elevationGainFt: 1800, estimatedDays: 1, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-sand', startLat: 37.6700, startLng: -111.4000, recommendedTireSize: 31, recommendedLift: 0, terrainDifficulty: 4, popularityScore: 30, estimatedTravelHours: 5 },
  { id: 'cathedral-valley-loop', name: 'Cathedral Valley Loop', region: 'Capitol Reef, Utah', regionGroup: 'utah-canyonlands', distanceMiles: 58, terrainType: 'Desert Canyon', remotenessScore: 8, estimatedFuelRequired: 7, suggestedCamps: 1, description: 'A remote loop through Capitol Reef\'s Cathedral Valley featuring towering monoliths, painted desert badlands, and one of Utah\'s least-visited landscapes.', highlights: ['Temple of the Sun monolith', 'Temple of the Moon', 'Bentonite Hills badlands', 'Upper Cathedral Valley overlook'], elevationGainFt: 2200, estimatedDays: 1, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-canyon', startLat: 38.3500, startLng: -111.2000, recommendedTireSize: 31, recommendedLift: 0, terrainDifficulty: 4, popularityScore: 20, estimatedTravelHours: 5 },
  // Weekend Trips
  { id: 'daniel-boone-backcountry', name: 'Daniel Boone Backcountry', region: 'Eastern Kentucky', regionGroup: 'kentucky-appalachians', distanceMiles: 95, terrainType: 'Forest / Mountain', remotenessScore: 4, estimatedFuelRequired: 11, suggestedCamps: 2, description: 'A network of forest service roads through the Daniel Boone National Forest with creek crossings, ridgeline views, and remote Appalachian hollows.', highlights: ['Red River Gorge approach', 'Natural Bridge overlook', 'Appalachian creek fords', 'Remote hollow camping'], elevationGainFt: 5400, estimatedDays: 2, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'forest-mountain', startLat: 37.8000, startLng: -83.6700, recommendedTireSize: 31, recommendedLift: 2, terrainDifficulty: 4, popularityScore: 20, estimatedTravelHours: 8 },
  { id: 'lassen-backcountry', name: 'Lassen Backcountry Loop', region: 'Northern California', regionGroup: 'sierra-nevada', distanceMiles: 78, terrainType: 'Forest / Mountain', remotenessScore: 7, estimatedFuelRequired: 10, suggestedCamps: 2, description: 'A volcanic backcountry loop through Lassen National Forest with hot springs, volcanic landscapes, and pristine alpine lakes.', highlights: ['Volcanic mud pots', 'Natural hot springs', 'Alpine lake camping', 'Old-growth forest corridors'], elevationGainFt: 5600, estimatedDays: 2, bestSeason: 'Summer / Early Fall', permitRequired: false, imageTag: 'forest-mountain', startLat: 40.4900, startLng: -121.5100, recommendedTireSize: 31, recommendedLift: 2, terrainDifficulty: 5, popularityScore: 15, estimatedTravelHours: 7 },
  { id: 'gila-river-route', name: 'Gila River Route', region: 'Gila National Forest, New Mexico', regionGroup: 'new-mexico', distanceMiles: 110, terrainType: 'Desert Canyon', remotenessScore: 8, estimatedFuelRequired: 14, suggestedCamps: 2, description: 'A remote route through the Gila National Forest following the Gila River through deep canyons, hot springs, and ancient cliff dwellings.', highlights: ['Gila Cliff Dwellings', 'Natural hot springs', 'River canyon crossings', 'Dark sky wilderness'], elevationGainFt: 6800, estimatedDays: 2, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-canyon', startLat: 33.2300, startLng: -108.2100, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 15, estimatedTravelHours: 9 },
  // Expeditions
  { id: 'oregon-bdr-south', name: 'Oregon BDR (South Section)', region: 'Southern Oregon', regionGroup: 'oregon-cascades', distanceMiles: 280, terrainType: 'Forest / Mountain', remotenessScore: 7, estimatedFuelRequired: 28, suggestedCamps: 5, description: 'The southern section of the Oregon Backcountry Discovery Route traverses Cascade volcanic landscapes, old-growth forests, and high desert plateaus.', highlights: ['Crater Lake approach', 'Cascade volcanic peaks', 'Old-growth forests', 'High desert plateaus'], elevationGainFt: 14000, estimatedDays: 5, bestSeason: 'Summer / Early Fall', permitRequired: false, imageTag: 'forest-mountain', startLat: 42.1500, startLng: -122.1500, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 5, popularityScore: 35, estimatedTravelHours: 24 },
  { id: 'nevada-bdr', name: 'Nevada BDR', region: 'Central Nevada', regionGroup: 'great-basin', distanceMiles: 350, terrainType: 'Desert Sand / Rock', remotenessScore: 9, estimatedFuelRequired: 35, suggestedCamps: 6, description: 'The Nevada Backcountry Discovery Route crosses the most remote and least-populated landscapes in the lower 48. Basin and range desert, ghost towns, and vast empty spaces.', highlights: ['Loneliest road in America', 'Historic ghost towns', 'Basin and range valleys', 'Dark sky wilderness'], elevationGainFt: 18000, estimatedDays: 6, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-sand', startLat: 39.5000, startLng: -117.5000, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 25, estimatedTravelHours: 30 },
  { id: 'montana-bdr-north', name: 'Montana BDR (North Section)', region: 'Northern Montana', regionGroup: 'idaho-montana', distanceMiles: 240, terrainType: 'Forest / Mountain', remotenessScore: 8, estimatedFuelRequired: 24, suggestedCamps: 4, description: 'The northern section of the Montana Backcountry Discovery Route through the Northern Rockies. Grizzly country, pristine rivers, and massive mountain panoramas.', highlights: ['Glacier NP approach roads', 'Bob Marshall Wilderness edge', 'Pristine mountain rivers', 'Grizzly bear country'], elevationGainFt: 16000, estimatedDays: 4, bestSeason: 'Summer', permitRequired: false, imageTag: 'alpine-mountain', startLat: 48.2000, startLng: -113.5000, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 30, estimatedTravelHours: 20 },
  // Remote Routes
  { id: 'magruder-corridor', name: 'Magruder Corridor', region: 'Idaho–Montana Border', regionGroup: 'idaho-montana', distanceMiles: 101, terrainType: 'Forest / Mountain', remotenessScore: 9, estimatedFuelRequired: 14, suggestedCamps: 2, description: 'One of the most remote roads in the lower 48, the Magruder Corridor follows the Selway-Bitterroot Wilderness boundary through pristine mountain forests with no services for 100 miles.', highlights: ['Selway-Bitterroot Wilderness', 'No services for 100 miles', 'Pristine mountain streams', 'Historic lookout towers'], elevationGainFt: 8800, estimatedDays: 2, bestSeason: 'Summer / Early Fall', permitRequired: false, imageTag: 'forest-mountain', startLat: 45.8000, startLng: -114.8000, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 10, estimatedTravelHours: 10 },
  { id: 'canyonlands-maze', name: 'Canyonlands Maze District', region: 'Maze District, Utah', regionGroup: 'utah-canyonlands', distanceMiles: 48, terrainType: 'Desert Canyon', remotenessScore: 10, estimatedFuelRequired: 8, suggestedCamps: 2, description: 'The most remote and least-visited district of Canyonlands National Park. Intricate canyon maze, ancient rock art, and absolute solitude in the heart of the Colorado Plateau.', highlights: ['Maze Overlook', 'Harvest Scene pictographs', 'Chocolate Drops formations', 'Absolute desert solitude'], elevationGainFt: 3200, estimatedDays: 2, bestSeason: 'Spring / Fall', permitRequired: true, imageTag: 'desert-canyon', startLat: 38.3200, startLng: -110.1800, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 7, popularityScore: 15, estimatedTravelHours: 8 },
  { id: 'owyhee-canyonlands', name: 'Owyhee Canyonlands', region: 'Owyhee County, Idaho', regionGroup: 'idaho-montana', distanceMiles: 180, terrainType: 'Desert Canyon', remotenessScore: 9, estimatedFuelRequired: 20, suggestedCamps: 3, description: 'A vast and empty desert canyon landscape in the Owyhee Canyonlands of southwestern Idaho. Rhyolite canyons, hot springs, and some of the lowest population density in the US.', highlights: ['Bruneau Canyon overlook', 'Natural hot springs', 'Rhyolite canyon walls', 'Zero cell coverage zones'], elevationGainFt: 7600, estimatedDays: 3, bestSeason: 'Spring / Fall', permitRequired: false, imageTag: 'desert-canyon', startLat: 42.7500, startLng: -116.1000, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 6, popularityScore: 8, estimatedTravelHours: 16 },
  { id: 'alvord-desert-loop', name: 'Alvord Desert Loop', region: 'Southeastern Oregon', regionGroup: 'oregon-cascades', distanceMiles: 120, terrainType: 'Desert Sand / Rock', remotenessScore: 9, estimatedFuelRequired: 15, suggestedCamps: 2, description: 'A remote loop through the Alvord Desert and Steens Mountain in southeastern Oregon. Playa driving, hot springs, and dramatic fault-block mountain scenery.', highlights: ['Alvord Desert playa driving', 'Steens Mountain summit', 'Wildhorse hot springs', 'Fault-block escarpment views'], elevationGainFt: 6400, estimatedDays: 2, bestSeason: 'Summer / Fall', permitRequired: false, imageTag: 'desert-sand', startLat: 42.5500, startLng: -118.5500, recommendedTireSize: 33, recommendedLift: 2, terrainDifficulty: 5, popularityScore: 12, estimatedTravelHours: 10 },
];




// ── Compute Distance From User ───────────────────────────────
// Enriches each opportunity with distanceFromUserMiles.
export function computeDistancesFromUser(
  opportunities: ExpeditionOpportunity[],
  userLat: number,
  userLng: number,
): ExpeditionOpportunity[] {
  return opportunities.map(op => ({
    ...op,
    distanceFromUserMiles: Math.round(
      haversineDistanceMiles(userLat, userLng, op.startLat, op.startLng)
    ),
  }));
}

// ── Deduplicate Opportunities ────────────────────────────────
// Prevents duplicate trail listings by ID.
export function deduplicateOpportunities(
  opportunities: ExpeditionOpportunity[],
): ExpeditionOpportunity[] {
  const seen = new Set<string>();
  return opportunities.filter(op => {
    if (seen.has(op.id)) return false;
    seen.add(op.id);
    return true;
  });
}

// ── Filter by Distance Radius ────────────────────────────────
export function filterByRadius(
  opportunities: ExpeditionOpportunity[],
  maxDistanceMiles: number,
): ExpeditionOpportunity[] {
  return opportunities.filter(
    op => (op.distanceFromUserMiles ?? Infinity) <= maxDistanceMiles
  );
}

// ── Apply Hard Cap ───────────────────────────────────────────
// Removes trails beyond HARD_CAP_DISTANCE_MILES from default results.
// This is applied BEFORE the user's radius filter.
export function applyHardCap(
  opportunities: ExpeditionOpportunity[],
): ExpeditionOpportunity[] {
  return opportunities.filter(
    op => (op.distanceFromUserMiles ?? Infinity) <= HARD_CAP_DISTANCE_MILES
  );
}

// ── Sort by Match Score (Primary) + Distance (Secondary) ─────
// Primary: highest match score first.
// Secondary: closest distance.
// Tertiary: highest remoteness score.
export function sortByMatchScore(
  opportunities: ExpeditionOpportunity[],
): ExpeditionOpportunity[] {
  return [...opportunities].sort((a, b) => {
    // Primary: match score (higher is better)
    const matchA = a.matchScore ?? 0;
    const matchB = b.matchScore ?? 0;
    if (matchB !== matchA) return matchB - matchA;

    // Secondary: distance from user (closer is better)
    const distA = a.distanceFromUserMiles ?? Infinity;
    const distB = b.distanceFromUserMiles ?? Infinity;
    if (distA !== distB) return distA - distB;

    // Tertiary: remoteness (higher is better)
    return b.remotenessScore - a.remotenessScore;
  });
}

// ── Sort by Compatibility + Distance (legacy) ────────────────
// Kept for backward compatibility with region grouping.
export function sortOpportunitiesWithDistance(
  opportunities: ExpeditionOpportunity[],
): ExpeditionOpportunity[] {
  return [...opportunities].sort((a, b) => {
    // Primary: match score if available, else compatibility
    const scoreA = a.matchScore ?? a.rigCompatibility ?? 0;
    const scoreB = b.matchScore ?? b.rigCompatibility ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;

    // Secondary: distance from user (closer is better)
    const distA = a.distanceFromUserMiles ?? Infinity;
    const distB = b.distanceFromUserMiles ?? Infinity;
    if (distA !== distB) return distA - distB;

    // Tertiary: remoteness (higher is better)
    return b.remotenessScore - a.remotenessScore;
  });
}

// ============================================================
// REGION GROUPING ENGINE (Phase 4)
// ============================================================

// Max trails to show per region group
export const MAX_TRAILS_PER_REGION = 3;

/**
 * Group filtered opportunities by regionGroup.
 * Each group is sorted internally by match score + distance.
 * Groups are sorted by minimum distance from user (closest first).
 * Excludes the featured expedition from region groups.
 */
export function groupOpportunitiesByRegion(
  opportunities: ExpeditionOpportunity[],
  excludeId?: string,
): RegionGroupResult[] {
  // Build a map of regionGroupId → opportunities
  const groupMap = new Map<RegionGroupId, ExpeditionOpportunity[]>();

  for (const op of opportunities) {
    if (excludeId && op.id === excludeId) continue;
    const group = op.regionGroup;
    if (!groupMap.has(group)) {
      groupMap.set(group, []);
    }
    groupMap.get(group)!.push(op);
  }

  // Convert to RegionGroupResult array
  const results: RegionGroupResult[] = [];

  for (const [groupId, ops] of groupMap) {
    const meta = REGION_GROUPS[groupId];
    if (!meta || ops.length === 0) continue;

    // Sort internally by match score then distance
    const sorted = sortOpportunitiesWithDistance(ops);

    // Limit to MAX_TRAILS_PER_REGION
    const limited = sorted.slice(0, MAX_TRAILS_PER_REGION);

    // Compute distance stats
    const distances = limited
      .map(op => op.distanceFromUserMiles ?? Infinity)
      .filter(d => d !== Infinity);

    const avgDist = distances.length > 0
      ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length)
      : Infinity;

    const minDist = distances.length > 0
      ? Math.min(...distances)
      : Infinity;

    results.push({
      regionGroupId: groupId,
      name: meta.name,
      icon: meta.icon,
      color: meta.color,
      opportunities: limited,
      avgDistanceFromUser: avgDist,
      minDistanceFromUser: minDist,
      trailCount: ops.length, // total before limiting
    });
  }

  // Sort groups by minimum distance (closest first)
  results.sort((a, b) => a.minDistanceFromUser - b.minDistanceFromUser);

  return results;
}

// ── Load Expedition Opportunities ────────────────────────────
// Returns opportunities from the seed dataset.
// Phase 1: No compatibility scoring.
// Phase 15: Validates metadata and audits for duplicates.
export function loadExpeditionOpportunities(): ExpeditionOpportunity[] {
  stabilityLog('Discovery', 'info', `Loading ${SEED_OPPORTUNITIES.length} expedition opportunities`);
  try {
    // Phase 15: Validate metadata on every route
    let validated = [...SEED_OPPORTUNITIES].map(op =>
      validateRouteMetadata(op, op.id) as ExpeditionOpportunity
    );

    // Phase 15: Audit for duplicates before deduplication
    const dupeCount = auditDuplicates(validated, 'loadExpeditionOpportunities');
    if (dupeCount > 0) {
      stabilityLog('Discovery', 'warn', `Found ${dupeCount} duplicate routes in seed dataset`);
    }

    // Deduplicate
    validated = deduplicateOpportunities(validated);

    stabilityLog('Discovery', 'info', `Loaded ${validated.length} validated opportunities`);
    return validated;
  } catch (e) {
    stabilityLog('Discovery', 'error', 'Failed to load expedition opportunities', e);
    // Graceful fallback: return raw seed data without validation
    return deduplicateOpportunities([...SEED_OPPORTUNITIES]);
  }
}


// ── Load Opportunities with Rig Compatibility ────────────────
// Phase 2+3+4+4.5: Scores each opportunity against the user's vehicle
// and returns them sorted by match score (highest first).
// Now also computes distance from user location and match scores.
//
// @param vehicleRecord  Optional vehicle record for richer profile building
// @param userLat        Optional user latitude (defaults to US center)
// @param userLng        Optional user longitude (defaults to US center)
// @returns { opportunities, results, profile }
export function loadOpportunitiesWithCompatibility(
  vehicleRecord?: {
    id: string;
    name: string;
    type?: string;
    make?: string | null;
    model?: string | null;
    avg_mpg?: number | null;
    water_capacity_gal?: number | null;
    fuel_tank_capacity_gal?: number | null;
  } | null,
  userLat?: number,
  userLng?: number,
): {
  opportunities: ExpeditionOpportunity[];
  results: Map<string, CompatibilityResult>;
  profile: VehicleProfile | null;
} {
  // Phase 15: Validate metadata on all routes before processing
  let raw = deduplicateOpportunities([...SEED_OPPORTUNITIES]).map(op =>
    validateRouteMetadata(op, op.id) as ExpeditionOpportunity
  );

  // Phase 15: Audit for duplicates after initial dedup
  const dupeCount = auditDuplicates(raw, 'loadOpportunitiesWithCompatibility');
  if (dupeCount > 0) {
    stabilityLog('Discovery', 'warn', `Found ${dupeCount} duplicate routes in compat loading`);
  }


  // Compute distances from user
  const lat = userLat ?? DEFAULT_USER_LOCATION.latitude;
  const lng = userLng ?? DEFAULT_USER_LOCATION.longitude;
  raw = computeDistancesFromUser(raw, lat, lng);

  // Apply hard cap — trails > 500mi never appear in default results
  raw = applyHardCap(raw);

  // Try to build vehicle profile
  const profile = vehicleRecord
    ? buildVehicleProfile(vehicleRecord)
    : buildProfileFromSpecs();

  if (!profile) {
    console.log(TAG, 'No vehicle profile — returning distance-sorted opportunities without compatibility');
    // Enrich with match scores (no compat data)
    raw = enrichWithMatchScores(raw, new Map());
    // Sort by match score (distance-dominant when no vehicle)
    raw = sortByMatchScore(raw);
    return {
      opportunities: raw,
      results: new Map(),
      profile: null,
    };
  }

  console.log(TAG, `Scoring ${raw.length} opportunities against "${profile.vehicleName}"`);
  const { opportunities: scored, results } = scoreAndSortOpportunities(profile, raw);

  // Re-enrich scored results with distance (scoring may have stripped it)
  let enriched = scored.map(op => {
    const existing = raw.find(r => r.id === op.id);
    return {
      ...op,
      distanceFromUserMiles: op.distanceFromUserMiles ?? existing?.distanceFromUserMiles,
    };
  });

  // Enrich with match scores
  enriched = enrichWithMatchScores(enriched, results);

  // Sort by match score (composite relevance)
  const sorted = sortByMatchScore(enriched);

  return {
    opportunities: sorted,
    results,
    profile,
  };
}

// ── Get single opportunity by ID ─────────────────────────────
export function getOpportunityById(id: string): ExpeditionOpportunity | null {
  return SEED_OPPORTUNITIES.find(o => o.id === id) ?? null;
}

// ── Terrain type color mapping ───────────────────────────────
// Returns a muted accent color for terrain type badges.
export function getTerrainColor(terrainType: string): string {
  const t = terrainType.toLowerCase();
  if (t.includes('desert'))  return 'rgba(200, 150, 60, 0.65)';
  if (t.includes('alpine') || t.includes('mountain')) return 'rgba(100, 160, 220, 0.65)';
  if (t.includes('forest'))  return 'rgba(80, 170, 120, 0.65)';
  if (t.includes('sand'))    return 'rgba(210, 170, 80, 0.65)';
  if (t.includes('gravel'))  return 'rgba(140, 140, 100, 0.65)';
  if (t.includes('rock'))    return 'rgba(180, 120, 80, 0.65)';
  return 'rgba(138, 138, 133, 0.50)';
}

// ── Match Score Color ────────────────────────────────────────
export function getMatchScoreColor(score: number): string {
  if (score >= 80) return '#66BB6A';
  if (score >= 60) return '#D4A017';
  if (score >= 40) return '#E67E22';
  return '#E04030';
}

// ── Match Score Label ────────────────────────────────────────
export function getMatchScoreLabel(score: number): string {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GREAT';
  if (score >= 55) return 'GOOD';
  if (score >= 40) return 'FAIR';
  return 'LOW';
}

// ── Remoteness label ─────────────────────────────────────────
export function getRemotenessLabel(score: number): string {
  if (score >= 9) return 'EXTREME';
  if (score >= 7) return 'HIGH';
  if (score >= 5) return 'MODERATE';
  if (score >= 3) return 'LOW';
  return 'MINIMAL';
}

// ── Remoteness color ─────────────────────────────────────────
export function getRemotenessColor(score: number): string {
  if (score >= 9) return '#E04030';
  if (score >= 7) return '#E67E22';
  if (score >= 5) return '#D4A017';
  if (score >= 3) return '#8B949E';
  return '#5A6370';
}

// ── Helpers ──────────────────────────────────────────────────
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

