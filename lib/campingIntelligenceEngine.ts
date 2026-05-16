// ============================================================
// CAMPING INTELLIGENCE ENGINE — Dispersed Camping Evaluation
// ============================================================
// Phase 10: Identifies and surfaces dispersed camping
// opportunities along exploration routes.
//
// CAMP ZONE DETECTION
//   Evaluates terrain suitability, public land access,
//   remoteness from highways, scenic potential, and proximity
//   to route segments to identify potential camp zones.
//
// CAMPING POTENTIAL SCORE
//   Composite 0–100 score combining:
//     - Terrain suitability (25%): flat areas near trails/roads
//     - Public land access (25%): BLM, Forest Service, state land
//     - Remoteness (20%): distance from highways/populated areas
//     - Scenic potential (15%): ridge views, water proximity
//     - Route proximity (15%): reasonable distance from route
//
// CAMP ZONE TYPES
//   - DISPERSED: Public-land dispersed camping access signal
//   - ESTABLISHED: Established campground (no hookups)
//   - PRIMITIVE: Primitive/backcountry camping
//   - ROADSIDE: Pulloff/roadside camping area
//
// LAND TYPES
//   - BLM: Bureau of Land Management
//   - USFS: US Forest Service
//   - STATE: State land/forest
//   - NPS: National Park Service (restricted)
//   - PRIVATE: Private land (excluded)
//
// INTEGRATION
//   - Enriches ExpeditionOpportunity with campingPotentialScore
//   - Provides camp zone data for route detail views
//   - Integrates with Weekend Adventures ranking
//   - Supports offline cached routes
//   - Provides simplified indicators for Android Auto / CarPlay
//
// FALLBACK
//   Routes without camping metadata receive estimated scores
//   based on terrain type, remoteness, and suggested camps.
// ============================================================

const TAG = '[CAMPING-INTEL]';

// ── Camp Zone Types ──────────────────────────────────────────

export type CampZoneType = 'dispersed' | 'established' | 'primitive' | 'roadside';

export type LandType = 'blm' | 'usfs' | 'state' | 'nps' | 'private' | 'unknown';

export interface CampZone {
  id: string;
  name: string;
  type: CampZoneType;
  landType: LandType;
  lat: number;
  lng: number;
  /** Distance from nearest route segment in miles */
  distanceFromRouteMi: number;
  /** Terrain suitability 0–100 */
  terrainSuitability: number;
  /** Scenic potential 0–100 */
  scenicScore: number;
  /** Whether water is nearby */
  waterProximity: boolean;
  /** Whether the zone has ridge/overlook views */
  hasViews: boolean;
  /** Elevation in feet */
  elevationFt: number;
  /** Brief description */
  description: string;
  /** Whether the zone is restricted (NPS, private) */
  restricted: boolean;
  /** Capacity estimate (vehicles) */
  estimatedCapacity: number;
}

// ── Camping Potential Result ─────────────────────────────────

export interface CampingPotentialResult {
  /** Composite camping potential score 0–100 */
  score: number;
  /** Label for display */
  label: string;
  /** Color for display */
  color: string;
  /** Detected camp zones along the route */
  campZones: CampZone[];
  /** Number of viable camp zones (non-restricted) */
  viableCampCount: number;
  /** Average terrain suitability across zones */
  avgTerrainSuitability: number;
  /** Dominant land type */
  dominantLandType: LandType;
  /** Whether offline data is available */
  offlineAvailable: boolean;
}

// ── Terrain Suitability Factors ──────────────────────────────

interface TerrainFactors {
  /** Is terrain generally flat/suitable for camping? */
  flatness: number;         // 0–100
  /** Ground cover suitability */
  groundCover: number;      // 0–100
  /** Accessibility from road/trail */
  accessibility: number;    // 0–100
  /** Protection from elements */
  shelter: number;          // 0–100
}

// ── Scoring Weights ──────────────────────────────────────────

const W_TERRAIN     = 0.25;
const W_PUBLIC_LAND = 0.25;
const W_REMOTENESS  = 0.20;
const W_SCENIC      = 0.15;
const W_PROXIMITY   = 0.15;

// ── Terrain Type → Camping Suitability Mapping ───────────────
// Maps terrain types from the discovery engine to base camping
// suitability scores. Higher = more suitable for dispersed camping.

const TERRAIN_CAMPING_MAP: Record<string, TerrainFactors> = {
  'desert canyon':        { flatness: 55, groundCover: 40, accessibility: 60, shelter: 45 },
  'desert sand / rock':   { flatness: 70, groundCover: 35, accessibility: 65, shelter: 30 },
  'alpine / mountain pass': { flatness: 35, groundCover: 60, accessibility: 45, shelter: 55 },
  'alpine / rock':        { flatness: 30, groundCover: 50, accessibility: 40, shelter: 50 },
  'forest / mountain':    { flatness: 65, groundCover: 80, accessibility: 70, shelter: 85 },
  'forest / rock':        { flatness: 55, groundCover: 70, accessibility: 60, shelter: 75 },
  'mixed forest / gravel':{ flatness: 75, groundCover: 85, accessibility: 80, shelter: 80 },
};

// ── Land Type → Public Access Score ──────────────────────────

const LAND_ACCESS_SCORES: Record<LandType, number> = {
  blm:     95,  // Most permissive for dispersed camping
  usfs:    90,  // Generally permissive with some restrictions
  state:   70,  // Varies by state
  nps:     25,  // Highly restricted, designated sites only
  private: 0,   // Not accessible
  unknown: 40,  // Conservative estimate
};

// ── Region → Dominant Land Type Mapping ──────────────────────
// Maps region groups to likely dominant public land types.

const REGION_LAND_MAP: Record<string, LandType> = {
  'utah-canyonlands':      'blm',
  'california-desert':     'blm',
  'colorado-high-country': 'usfs',
  'southern-appalachians': 'usfs',
  'upper-midwest':         'usfs',
  'arkansas-ozarks':       'usfs',
  'sierra-nevada':         'usfs',
  'pacific-northwest':     'usfs',
  'arizona-desert':        'blm',
  'texas-hill-country':    'private',
};

// ============================================================
// CAMP ZONE GENERATION
// ============================================================
// Generates potential camp zones along a route based on
// route metadata, terrain type, and geographic characteristics.
// In a production system this would query a spatial database;
// here we synthesize realistic zones from route attributes.
// ============================================================

/**
 * Generate camp zones for a route based on its metadata.
 * Returns an array of CampZone objects distributed along
 * the route with realistic attributes.
 */
export function generateCampZones(route: {
  id: string;
  name: string;
  startLat: number;
  startLng: number;
  distanceMiles: number;
  terrainType: string;
  remotenessScore: number;
  suggestedCamps: number;
  regionGroup: string;
  elevationGainFt: number;
  highlights?: string[];
}): CampZone[] {
  const zones: CampZone[] = [];
  const campCount = Math.max(1, route.suggestedCamps);
  const dominantLand = REGION_LAND_MAP[route.regionGroup] ?? 'unknown';
  const terrainKey = route.terrainType.toLowerCase();
  const terrainFactors = TERRAIN_CAMPING_MAP[terrainKey] ?? {
    flatness: 50, groundCover: 50, accessibility: 50, shelter: 50,
  };

  // Check highlights for water/scenic keywords
  const highlightText = (route.highlights ?? []).join(' ').toLowerCase();
  const hasWaterKeywords = /river|creek|lake|spring|water|stream|falls/.test(highlightText);
  const hasViewKeywords = /overlook|panoram|ridge|view|vista|canyon|cliff/.test(highlightText);

  const seenIds = new Set<string>();

  for (let i = 0; i < campCount; i++) {
    // Distribute zones along the route
    const fraction = campCount === 1 ? 0.5 : i / (campCount - 1);

    // Offset lat/lng to simulate zone positions along route
    const latOffset = (fraction - 0.5) * (route.distanceMiles / 69) * 0.8;
    const lngOffset = (fraction - 0.5) * (route.distanceMiles / 55) * 0.6;
    const zoneLat = route.startLat + latOffset + (Math.sin(i * 2.7) * 0.02);
    const zoneLng = route.startLng + lngOffset + (Math.cos(i * 3.1) * 0.03);

    // Determine zone type based on position and terrain
    let zoneType: CampZoneType;
    if (i === 0 && route.distanceMiles > 60) {
      zoneType = 'roadside';  // First zone near trailhead
    } else if (route.remotenessScore >= 7) {
      zoneType = 'primitive';
    } else if (dominantLand === 'blm' || dominantLand === 'usfs') {
      zoneType = 'dispersed';
    } else {
      zoneType = 'established';
    }

    // Determine land type for this zone
    let zoneLand = dominantLand;
    if (dominantLand === 'private' && i > 0) {
      // For private-dominant regions, some zones may be on public land
      zoneLand = Math.random() > 0.5 ? 'state' : 'private';
    }

    // Calculate terrain suitability for this specific zone
    const positionVariance = 1 - Math.abs(fraction - 0.5) * 0.3;
    const terrainSuit = Math.round(
      (terrainFactors.flatness * 0.35 +
       terrainFactors.groundCover * 0.25 +
       terrainFactors.accessibility * 0.25 +
       terrainFactors.shelter * 0.15) * positionVariance
    );

    // Scenic score
    const baseScenic = route.remotenessScore * 8;
    const waterBonus = hasWaterKeywords ? 15 : 0;
    const viewBonus = hasViewKeywords ? 15 : 0;
    const scenicScore = clamp(baseScenic + waterBonus + viewBonus + (i % 2 === 0 ? 5 : -5), 0, 100);

    // Water proximity (more likely near water keywords or in forest terrain)
    const waterProximity = hasWaterKeywords
      ? (i < campCount / 2)
      : terrainKey.includes('forest') && i % 2 === 0;

    // Views (more likely at higher elevations or canyon terrain)
    const hasViews = hasViewKeywords
      ? (i % 2 === 0)
      : (terrainKey.includes('alpine') || terrainKey.includes('canyon')) && fraction > 0.3;

    // Elevation estimate
    const baseElev = route.elevationGainFt > 5000 ? 8000 : 5000;
    const elevVariance = route.elevationGainFt * fraction * 0.6;
    const zoneElev = Math.round(baseElev + elevVariance);

    // Distance from route (closer for established, further for primitive)
    const distFromRoute = zoneType === 'roadside' ? 0.1
      : zoneType === 'established' ? 0.3
      : zoneType === 'dispersed' ? 0.5 + (i * 0.2)
      : 0.8 + (i * 0.3);

    // Capacity
    const capacity = zoneType === 'established' ? 8
      : zoneType === 'dispersed' ? 4
      : zoneType === 'primitive' ? 2
      : 3;

    // Zone name
    const zoneNames = _generateZoneName(route, i, zoneType, hasWaterKeywords, hasViewKeywords);

    // Zone description
    const desc = _generateZoneDescription(zoneType, zoneLand, waterProximity, hasViews);

    const zoneId = `${route.id}-camp-${i}`;
    if (seenIds.has(zoneId)) continue;
    seenIds.add(zoneId);

    zones.push({
      id: zoneId,
      name: zoneNames,
      type: zoneType,
      landType: zoneLand,
      lat: zoneLat,
      lng: zoneLng,
      distanceFromRouteMi: parseFloat(distFromRoute.toFixed(1)),
      terrainSuitability: terrainSuit,
      scenicScore,
      waterProximity,
      hasViews,
      elevationFt: zoneElev,
      description: desc,
      restricted: zoneLand === 'nps' || zoneLand === 'private',
      estimatedCapacity: capacity,
    });
  }

  // Deduplicate
  const uniqueZones = zones.filter((z, idx) => {
    return zones.findIndex(zz => zz.id === z.id) === idx;
  });

  console.log(TAG, `Generated ${uniqueZones.length} camp zones for "${route.name}"`);
  return uniqueZones;
}

// ============================================================
// CAMPING POTENTIAL SCORING
// ============================================================

/**
 * Calculate the Camping Potential Score for a route.
 *
 * @param route  Route metadata from the discovery engine
 * @returns CampingPotentialResult with score, zones, and metadata
 */
export function evaluateCampingPotential(route: {
  id: string;
  name: string;
  startLat: number;
  startLng: number;
  distanceMiles: number;
  terrainType: string;
  remotenessScore: number;
  suggestedCamps: number;
  regionGroup: string;
  elevationGainFt: number;
  highlights?: string[];
}): CampingPotentialResult {
  // Generate camp zones
  const campZones = generateCampZones(route);

  // Filter to viable (non-restricted) zones
  const viableZones = campZones.filter(z => !z.restricted);

  // ── Terrain Suitability Score (0–100) ──
  const terrainKey = route.terrainType.toLowerCase();
  const factors = TERRAIN_CAMPING_MAP[terrainKey] ?? {
    flatness: 50, groundCover: 50, accessibility: 50, shelter: 50,
  };
  const terrainScore = (
    factors.flatness * 0.35 +
    factors.groundCover * 0.25 +
    factors.accessibility * 0.25 +
    factors.shelter * 0.15
  );

  // ── Public Land Access Score (0–100) ──
  const dominantLand = REGION_LAND_MAP[route.regionGroup] ?? 'unknown';
  const publicLandScore = LAND_ACCESS_SCORES[dominantLand];

  // ── Remoteness Score (0–100) ──
  // Higher remoteness = more dispersed camping opportunity
  const remotenessScore = clamp(route.remotenessScore * 10, 0, 100);

  // ── Scenic Potential Score (0–100) ──
  const highlightText = (route.highlights ?? []).join(' ').toLowerCase();
  const hasWater = /river|creek|lake|spring|water|stream|falls/.test(highlightText);
  const hasViews = /overlook|panoram|ridge|view|vista|canyon|cliff/.test(highlightText);
  let scenicScore = route.remotenessScore * 7;
  if (hasWater) scenicScore += 20;
  if (hasViews) scenicScore += 15;
  scenicScore = clamp(scenicScore, 0, 100);

  // ── Route Proximity Score (0–100) ──
  // More camps relative to route length = better proximity coverage
  const campsPerMile = route.suggestedCamps / Math.max(route.distanceMiles, 1);
  const proximityScore = clamp(campsPerMile * 2000, 0, 100);

  // ── Composite Score ──
  const raw =
    terrainScore * W_TERRAIN +
    publicLandScore * W_PUBLIC_LAND +
    remotenessScore * W_REMOTENESS +
    scenicScore * W_SCENIC +
    proximityScore * W_PROXIMITY;

  const score = clamp(Math.round(raw), 0, 100);

  // Average terrain suitability across zones
  const avgTerrain = viableZones.length > 0
    ? Math.round(viableZones.reduce((s, z) => s + z.terrainSuitability, 0) / viableZones.length)
    : Math.round(terrainScore);

  const result: CampingPotentialResult = {
    score,
    label: getCampingPotentialLabel(score),
    color: getCampingPotentialColor(score),
    campZones,
    viableCampCount: viableZones.length,
    avgTerrainSuitability: avgTerrain,
    dominantLandType: dominantLand,
    offlineAvailable: true, // Camp data is generated from route metadata
  };

  console.log(
    TAG,
    `Camping potential for "${route.name}": ${score}/100 ` +
    `(${viableZones.length} viable zones, ${dominantLand} land)`,
  );

  return result;
}

// ============================================================
// BATCH EVALUATION
// ============================================================

/**
 * Evaluate camping potential for multiple routes.
 * Returns a map of route ID → CampingPotentialResult.
 */
export function evaluateCampingPotentialBatch(
  routes: Array<{
    id: string;
    name: string;
    startLat: number;
    startLng: number;
    distanceMiles: number;
    terrainType: string;
    remotenessScore: number;
    suggestedCamps: number;
    regionGroup: string;
    elevationGainFt: number;
    highlights?: string[];
  }>,
): Map<string, CampingPotentialResult> {
  const results = new Map<string, CampingPotentialResult>();

  console.log(TAG, `Batch evaluating camping potential for ${routes.length} routes`);

  for (const route of routes) {
    results.set(route.id, evaluateCampingPotential(route));
  }

  return results;
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

/** Get camping potential label for display */
export function getCampingPotentialLabel(score: number): string {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'STRONG';
  if (score >= 55) return 'GOOD';
  if (score >= 40) return 'MODERATE';
  if (score >= 25) return 'LIMITED';
  return 'MINIMAL';
}

/** Get camping potential color for display */
export function getCampingPotentialColor(score: number): string {
  if (score >= 85) return '#66BB6A';
  if (score >= 70) return '#81C784';
  if (score >= 55) return '#D4A017';
  if (score >= 40) return '#E67E22';
  if (score >= 25) return '#E04030';
  return '#8B949E';
}

/** Get camp zone type label */
export function getCampZoneTypeLabel(type: CampZoneType): string {
  switch (type) {
    case 'dispersed':   return 'DISPERSED';
    case 'established': return 'ESTABLISHED';
    case 'primitive':   return 'PRIMITIVE';
    case 'roadside':    return 'ROADSIDE';
  }
}

/** Get camp zone type color */
export function getCampZoneTypeColor(type: CampZoneType): string {
  switch (type) {
    case 'dispersed':   return '#66BB6A';
    case 'established': return '#5AC8FA';
    case 'primitive':   return '#E67E22';
    case 'roadside':    return '#D4A017';
  }
}

/** Get camp zone type icon */
export function getCampZoneTypeIcon(type: CampZoneType): string {
  switch (type) {
    case 'dispersed':   return 'bonfire-outline';
    case 'established': return 'home-outline';
    case 'primitive':   return 'trail-sign-outline';
    case 'roadside':    return 'car-outline';
  }
}

/** Get land type label */
export function getLandTypeLabel(land: LandType): string {
  switch (land) {
    case 'blm':     return 'BLM';
    case 'usfs':    return 'USFS';
    case 'state':   return 'STATE';
    case 'nps':     return 'NPS';
    case 'private': return 'PRIVATE';
    case 'unknown': return 'UNKNOWN';
  }
}

/** Get land type color */
export function getLandTypeColor(land: LandType): string {
  switch (land) {
    case 'blm':     return '#D4A017';
    case 'usfs':    return '#66BB6A';
    case 'state':   return '#5AC8FA';
    case 'nps':     return '#E67E22';
    case 'private': return '#E04030';
    case 'unknown': return '#8B949E';
  }
}

/** Format camping potential for simplified vehicle display (AA/CarPlay) */
export function getSimplifiedCampingIndicator(score: number): {
  label: string;
  icon: string;
  available: boolean;
} {
  if (score >= 55) {
    return { label: 'CAMPS AVAILABLE', icon: 'bonfire', available: true };
  }
  if (score >= 25) {
    return { label: 'LIMITED CAMPS', icon: 'bonfire-outline', available: true };
  }
  return { label: 'NO CAMPS', icon: 'close-circle-outline', available: false };
}

// ============================================================
// OFFLINE COMPATIBILITY
// ============================================================

/**
 * Check if camping data can be generated offline.
 * Camp zones are derived from route metadata, so they
 * are always available when route data is cached.
 */
export function isCampingDataAvailableOffline(routeId: string): boolean {
  // Camp data is generated from route metadata (no external API needed)
  // If the route is cached, camping data is available
  return true;
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate that a route has sufficient metadata for camping evaluation.
 * Returns true if the route can be evaluated, false if fallback needed.
 */
export function validateRouteForCamping(route: {
  distanceMiles?: number;
  terrainType?: string;
  remotenessScore?: number;
  suggestedCamps?: number;
  regionGroup?: string;
}): boolean {
  if (!route.distanceMiles || route.distanceMiles <= 0) return false;
  if (!route.terrainType) return false;
  if (route.remotenessScore == null) return false;
  if (route.suggestedCamps == null) return false;
  return true;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function _generateZoneName(
  route: { name: string; terrainType: string },
  index: number,
  type: CampZoneType,
  hasWater: boolean,
  hasViews: boolean,
): string {
  const prefixes = [
    'Lower', 'Upper', 'North', 'South', 'East', 'West',
    'Hidden', 'Quiet', 'Remote', 'Scenic',
  ];
  const suffixes = hasWater
    ? ['Creek Camp', 'Spring Camp', 'River Flat', 'Wash Camp', 'Water Camp']
    : hasViews
    ? ['Overlook Camp', 'Ridge Camp', 'Vista Camp', 'Point Camp', 'View Camp']
    : ['Flat', 'Camp', 'Pulloff', 'Clearing', 'Site'];

  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[index % suffixes.length];
  return `${prefix} ${suffix}`;
}

function _generateZoneDescription(
  type: CampZoneType,
  land: LandType,
  hasWater: boolean,
  hasViews: boolean,
): string {
  const landLabel = land === 'blm' ? 'BLM' : land === 'usfs' ? 'Forest Service' : land === 'state' ? 'state' : 'public';
  const waterNote = hasWater ? ' Water source nearby.' : '';
  const viewNote = hasViews ? ' Scenic overlook views.' : '';

  switch (type) {
    case 'dispersed':
      return `Dispersed camping area on ${landLabel} land. Flat terrain suitable for vehicle camping.${waterNote}${viewNote}`;
    case 'established':
      return `Established campground with designated sites. No hookups.${waterNote}${viewNote}`;
    case 'primitive':
      return `Primitive backcountry camping. Minimal improvements, high solitude.${waterNote}${viewNote}`;
    case 'roadside':
      return `Roadside pulloff area suitable for overnight stops. Easy access from trail.${waterNote}${viewNote}`;
  }
}

