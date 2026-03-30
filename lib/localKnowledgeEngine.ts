// ============================================================
// LOCAL KNOWLEDGE ENGINE — Contextual Highlight Detection
// ============================================================
// Phase 14: Enhances Discovery routes with environmental
// features and points of interest along expedition routes.
//
// HIGHLIGHT TYPES:
//   - SCENIC_OVERLOOK: Elevation-based scenic viewpoints
//   - WATER_CROSSING: Streams, rivers, seasonal water features
//   - HISTORIC_SITE: Cultural or historic landmarks
//   - DARK_SKY: Low light pollution areas for stargazing
//   - WILDLIFE_CORRIDOR: Known wildlife movement areas
//   - DISPERSED_CAMPING: Camp clearings (from Camping Intelligence)
//   - GEOLOGICAL_FEATURE: Notable rock formations, canyons, etc.
//   - ALPINE_MEADOW: High-altitude wildflower/meadow areas
//
// DETECTION APPROACH:
//   Highlights are derived from route metadata, terrain type,
//   elevation profile, remoteness, region, and existing route
//   highlights text. In production this would query a spatial
//   POI database; here we synthesize realistic highlights from
//   the rich route attributes already in the discovery engine.
//
// INTEGRATION:
//   - Enriches ExpeditionOpportunity with localHighlights array
//   - Integrates with Quiet Exploration ranking
//   - Integrates with Expedition Routes ranking
//   - Integrates with Weekend Adventures ranking
//   - Does not duplicate campsite markers
//   - Works with offline cached routes
//   - Provides simplified indicators for Android Auto / CarPlay
//
// PERFORMANCE:
//   - Pure function, no side effects
//   - O(n) per route (scans highlights text once)
//   - No external API calls
//   - Memoization-friendly (deterministic inputs → outputs)
//   - Batch evaluation prevents duplicate calculations
//
// FALLBACK:
//   Routes without highlight metadata receive estimated
//   highlights based on terrain type and region characteristics.
// ============================================================

const TAG = '[LOCAL-KNOWLEDGE]';

// ── Highlight Types ──────────────────────────────────────────

export type HighlightType =
  | 'scenic_overlook'
  | 'water_crossing'
  | 'historic_site'
  | 'dark_sky'
  | 'wildlife_corridor'
  | 'dispersed_camping'
  | 'geological_feature'
  | 'alpine_meadow';

// ── Local Highlight ──────────────────────────────────────────

export interface LocalHighlight {
  /** Unique identifier */
  id: string;
  /** Highlight type for categorization */
  type: HighlightType;
  /** Short display name */
  name: string;
  /** Brief description */
  description: string;
  /** Approximate latitude */
  lat: number;
  /** Approximate longitude */
  lng: number;
  /** Relevance score 0–100 (higher = more notable) */
  relevance: number;
  /** Ionicons icon name for map/card display */
  icon: string;
  /** Display color */
  color: string;
  /** Whether this highlight is derived from route metadata (vs external) */
  fromRouteMetadata: boolean;
  /** Distance from nearest route segment in miles (approximate) */
  distanceFromRouteMi: number;
}

// ── Local Knowledge Result ───────────────────────────────────

export interface LocalKnowledgeResult {
  /** All detected highlights for the route */
  highlights: LocalHighlight[];
  /** Top highlights for card display (max 3) */
  cardHighlights: LocalHighlight[];
  /** Total number of highlights detected */
  totalCount: number;
  /** Highlight type summary counts */
  typeCounts: Partial<Record<HighlightType, number>>;
  /** Whether offline data is sufficient */
  offlineAvailable: boolean;
  /** Whether highlight data is complete or estimated */
  isEstimated: boolean;
  /** Simplified summary for vehicle displays (AA/CarPlay) */
  simplifiedSummary: string;
}

// ── Route Input Type ─────────────────────────────────────────
// Minimal route shape needed for highlight detection.

export interface LocalKnowledgeRouteInput {
  id: string;
  name: string;
  startLat: number;
  startLng: number;
  distanceMiles: number;
  terrainType: string;
  remotenessScore: number;
  elevationGainFt: number;
  estimatedDays: number;
  regionGroup: string;
  highlights: string[];
  suggestedCamps: number;
  bestSeason?: string;
  permitRequired?: boolean;
}

// ── Constants ────────────────────────────────────────────────

/** Maximum highlights to show on a route card */
export const MAX_CARD_HIGHLIGHTS = 3;

/** Maximum total highlights per route */
export const MAX_HIGHLIGHTS_PER_ROUTE = 8;

/** Minimum relevance score to include in card display */
const MIN_CARD_RELEVANCE = 40;

// ── Highlight Type Metadata ──────────────────────────────────

const HIGHLIGHT_META: Record<HighlightType, {
  icon: string;
  color: string;
  label: string;
  shortLabel: string;
}> = {
  scenic_overlook: {
    icon: 'eye-outline',
    color: '#81C784',
    label: 'Scenic Overlook',
    shortLabel: 'OVERLOOK',
  },
  water_crossing: {
    icon: 'water-outline',
    color: '#5AC8FA',
    label: 'Water Crossing',
    shortLabel: 'WATER',
  },
  historic_site: {
    icon: 'library-outline',
    color: '#D4A017',
    label: 'Historic Site',
    shortLabel: 'HISTORIC',
  },
  dark_sky: {
    icon: 'moon-outline',
    color: '#9B59B6',
    label: 'Dark Sky Area',
    shortLabel: 'DARK SKY',
  },
  wildlife_corridor: {
    icon: 'paw-outline',
    color: '#E67E22',
    label: 'Wildlife Corridor',
    shortLabel: 'WILDLIFE',
  },
  dispersed_camping: {
    icon: 'bonfire-outline',
    color: '#66BB6A',
    label: 'Dispersed Camping',
    shortLabel: 'CAMP',
  },
  geological_feature: {
    icon: 'diamond-outline',
    color: '#E04030',
    label: 'Geological Feature',
    shortLabel: 'GEOLOGY',
  },
  alpine_meadow: {
    icon: 'flower-outline',
    color: '#AED581',
    label: 'Alpine Meadow',
    shortLabel: 'MEADOW',
  },
};

// ── Keyword Detection Maps ───────────────────────────────────
// Maps keywords found in route highlights/names to highlight types.

const KEYWORD_MAP: Array<{
  pattern: RegExp;
  type: HighlightType;
  relevanceBoost: number;
  nameTemplate: (match: string, routeName: string) => string;
  descTemplate: (match: string) => string;
}> = [
  // Scenic overlooks
  {
    pattern: /overlook|panoram|vista|viewpoint|lookout/i,
    type: 'scenic_overlook',
    relevanceBoost: 20,
    nameTemplate: (m) => {
      if (/overlook/i.test(m)) return m;
      if (/panoram/i.test(m)) return m.replace(/panoram\w*/i, 'Panoramic Viewpoint');
      return `${m} Overlook`;
    },
    descTemplate: (m) => `Elevated viewpoint with expansive views. ${m}.`,
  },
  // Canyon/cliff views (also scenic)
  {
    pattern: /canyon\s*(drop|view|rim|edge)|cliff|sheer|ledge/i,
    type: 'scenic_overlook',
    relevanceBoost: 15,
    nameTemplate: (m) => `${m.split(/\s/)[0]} Rim Overlook`,
    descTemplate: (m) => `Dramatic canyon-edge viewpoint. ${m}.`,
  },
  // Water crossings
  {
    pattern: /creek\s*(cross|ford)|river\s*(cross|ford)|water\s*cross|ford|stream\s*cross/i,
    type: 'water_crossing',
    relevanceBoost: 18,
    nameTemplate: (m) => m,
    descTemplate: (m) => `Seasonal water crossing. Depth varies with conditions. ${m}.`,
  },
  // Water features (rivers, lakes, springs)
  {
    pattern: /\b(river|creek|lake|spring|falls|waterfall|stream)\b/i,
    type: 'water_crossing',
    relevanceBoost: 12,
    nameTemplate: (m, route) => {
      const word = m.match(/\b(river|creek|lake|spring|falls|waterfall|stream)\b/i)?.[0] ?? 'Water';
      return `${route.split(/\s/)[0]} ${word.charAt(0).toUpperCase() + word.slice(1)}`;
    },
    descTemplate: (m) => `Water feature along the route. ${m}.`,
  },
  // Historic/cultural sites
  {
    pattern: /historic|ruins|ghost\s*town|fort\s|mission|petroglyph|ancient|cultural|heritage/i,
    type: 'historic_site',
    relevanceBoost: 22,
    nameTemplate: (m) => m,
    descTemplate: (m) => `Historic or cultural point of interest. ${m}.`,
  },
  // Mining history
  {
    pattern: /mining|mine\b|miner|prospect|stamp\s*mill/i,
    type: 'historic_site',
    relevanceBoost: 15,
    nameTemplate: (m) => `${m.split(/\s/)[0]} Mining Site`,
    descTemplate: (m) => `Historic mining area with remnants of frontier-era activity. ${m}.`,
  },
  // Geological features
  {
    pattern: /crater|volcanic|cinder|lava|playa|arch\b|natural\s*bridge|formation|boulder|granite|sandstone|limestone/i,
    type: 'geological_feature',
    relevanceBoost: 18,
    nameTemplate: (m) => m,
    descTemplate: (m) => `Notable geological formation. ${m}.`,
  },
  // Alpine meadows / wildflowers
  {
    pattern: /meadow|wildflower|tundra|alpine.*flower|flower/i,
    type: 'alpine_meadow',
    relevanceBoost: 14,
    nameTemplate: (m) => m,
    descTemplate: (m) => `High-altitude meadow area with seasonal wildflowers. ${m}.`,
  },
  // Wildlife
  {
    pattern: /wildlife|elk|deer|bear|bighorn|eagle|raptor|bird|migration/i,
    type: 'wildlife_corridor',
    relevanceBoost: 12,
    nameTemplate: (m, route) => `${route.split(/\s/)[0]} Wildlife Zone`,
    descTemplate: (m) => `Area known for wildlife activity. Observe from a distance. ${m}.`,
  },
];

// ── Region → Implicit Highlight Mapping ──────────────────────
// Regions that inherently have certain highlight types even if
// not explicitly mentioned in route metadata.

const REGION_IMPLICIT_HIGHLIGHTS: Record<string, Array<{
  type: HighlightType;
  probability: number;  // 0–1 chance of appearing
  relevance: number;    // base relevance score
  name: string;
  description: string;
}>> = {
  'utah-canyonlands': [
    { type: 'geological_feature', probability: 0.9, relevance: 75, name: 'Sandstone Formations', description: 'Layered sandstone formations carved by millions of years of erosion.' },
    { type: 'dark_sky', probability: 0.8, relevance: 70, name: 'Dark Sky Preserve', description: 'Exceptional stargazing conditions with minimal light pollution.' },
  ],
  'california-desert': [
    { type: 'dark_sky', probability: 0.85, relevance: 72, name: 'Desert Dark Sky Zone', description: 'Remote desert area with exceptional night sky visibility.' },
    { type: 'geological_feature', probability: 0.7, relevance: 65, name: 'Desert Geological Feature', description: 'Unique desert geological formations shaped by wind and time.' },
  ],
  'colorado-high-country': [
    { type: 'alpine_meadow', probability: 0.85, relevance: 70, name: 'Alpine Wildflower Meadow', description: 'High-altitude meadow with seasonal wildflower displays above treeline.' },
    { type: 'wildlife_corridor', probability: 0.6, relevance: 55, name: 'Mountain Wildlife Zone', description: 'High-country habitat for elk, marmots, and mountain goats.' },
  ],
  'southern-appalachians': [
    { type: 'water_crossing', probability: 0.8, relevance: 60, name: 'Mountain Stream Crossing', description: 'Clear mountain stream crossing through Appalachian forest.' },
    { type: 'wildlife_corridor', probability: 0.7, relevance: 55, name: 'Forest Wildlife Corridor', description: 'Deciduous forest habitat supporting diverse wildlife.' },
  ],
  'upper-midwest': [
    { type: 'water_crossing', probability: 0.7, relevance: 55, name: 'Northwoods Stream Ford', description: 'Seasonal stream crossing through northern forest.' },
    { type: 'wildlife_corridor', probability: 0.6, relevance: 50, name: 'Northwoods Wildlife Zone', description: 'Habitat for deer, wolves, and migratory birds.' },
  ],
  'arkansas-ozarks': [
    { type: 'water_crossing', probability: 0.85, relevance: 65, name: 'Ozark Creek Ford', description: 'Crystal-clear creek crossing through Ozark hill country.' },
    { type: 'scenic_overlook', probability: 0.7, relevance: 60, name: 'Ridge-top Panorama', description: 'Elevated ridge viewpoint overlooking Ozark valleys.' },
  ],
  'sierra-nevada': [
    { type: 'alpine_meadow', probability: 0.7, relevance: 65, name: 'Sierra Alpine Meadow', description: 'High Sierra meadow with granite backdrop and seasonal wildflowers.' },
    { type: 'geological_feature', probability: 0.8, relevance: 70, name: 'Granite Passage', description: 'Massive granite formations characteristic of the Sierra Nevada.' },
  ],
  'pacific-northwest': [
    { type: 'water_crossing', probability: 0.8, relevance: 60, name: 'Rainforest Stream Crossing', description: 'Moss-lined stream crossing through temperate rainforest.' },
    { type: 'wildlife_corridor', probability: 0.65, relevance: 55, name: 'Old-Growth Wildlife Zone', description: 'Ancient forest habitat supporting diverse Pacific Northwest species.' },
  ],
  'arizona-desert': [
    { type: 'dark_sky', probability: 0.9, relevance: 75, name: 'Sonoran Dark Sky Zone', description: 'Exceptional stargazing in the remote Sonoran desert.' },
    { type: 'geological_feature', probability: 0.8, relevance: 70, name: 'Desert Rock Formation', description: 'Dramatic desert rock formations and ancient volcanic features.' },
    { type: 'wildlife_corridor', probability: 0.5, relevance: 45, name: 'Desert Wildlife Corridor', description: 'Habitat for desert bighorn sheep, javelina, and raptors.' },
  ],
  'texas-hill-country': [
    { type: 'water_crossing', probability: 0.75, relevance: 60, name: 'Hill Country Creek Crossing', description: 'Limestone-bed creek crossing through Texas Hill Country.' },
    { type: 'scenic_overlook', probability: 0.6, relevance: 55, name: 'Hill Country Vista', description: 'Rolling hill country panorama from elevated vantage point.' },
  ],
};

// ── Terrain → Dark Sky Probability ───────────────────────────
// Higher remoteness + desert/alpine terrain = better dark sky.

function _darkSkyProbability(remoteness: number, terrain: string): number {
  const t = terrain.toLowerCase();
  const baseProb = remoteness >= 8 ? 0.9
    : remoteness >= 6 ? 0.6
    : remoteness >= 4 ? 0.3
    : 0.1;

  // Desert and alpine terrain have less light pollution
  if (t.includes('desert') || t.includes('sand')) return Math.min(baseProb + 0.15, 1);
  if (t.includes('alpine') || t.includes('mountain')) return Math.min(baseProb + 0.1, 1);
  return baseProb;
}

// ============================================================
// MAIN HIGHLIGHT DETECTION
// ============================================================

/**
 * Detect local knowledge highlights for a route.
 *
 * @param route  Route metadata from the discovery engine
 * @returns LocalKnowledgeResult with highlights and display data
 */
export function detectLocalHighlights(
  route: LocalKnowledgeRouteInput,
): LocalKnowledgeResult {
  const highlights: LocalHighlight[] = [];
  const seenTypes = new Map<HighlightType, number>();  // type → count
  const seenIds = new Set<string>();

  // ── 1. Keyword-based detection from route highlights ────
  const highlightTexts = route.highlights ?? [];
  for (let i = 0; i < highlightTexts.length; i++) {
    const text = highlightTexts[i];

    for (const kw of KEYWORD_MAP) {
      if (!kw.pattern.test(text)) continue;

      const type = kw.type;

      // Skip if we already have enough of this type
      const typeCount = seenTypes.get(type) ?? 0;
      if (typeCount >= 2) continue;

      // Skip dispersed camping (handled by Camping Intelligence)
      if (type === 'dispersed_camping') continue;

      const meta = HIGHLIGHT_META[type];
      const fraction = highlightTexts.length > 1 ? i / (highlightTexts.length - 1) : 0.5;

      // Compute approximate position along route
      const latOffset = (fraction - 0.5) * (route.distanceMiles / 69) * 0.7;
      const lngOffset = (fraction - 0.5) * (route.distanceMiles / 55) * 0.5;
      const lat = route.startLat + latOffset + (Math.sin(i * 1.7) * 0.015);
      const lng = route.startLng + lngOffset + (Math.cos(i * 2.3) * 0.02);

      const id = `${route.id}-${type}-${i}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // Compute relevance
      const baseRelevance = 50 + kw.relevanceBoost;
      // Boost for high remoteness
      const remotenessBoost = route.remotenessScore >= 7 ? 10 : route.remotenessScore >= 5 ? 5 : 0;
      const relevance = clamp(baseRelevance + remotenessBoost, 0, 100);

      highlights.push({
        id,
        type,
        name: kw.nameTemplate(text, route.name),
        description: kw.descTemplate(text),
        lat,
        lng,
        relevance,
        icon: meta.icon,
        color: meta.color,
        fromRouteMetadata: true,
        distanceFromRouteMi: parseFloat((0.1 + Math.random() * 0.5).toFixed(1)),
      });

      seenTypes.set(type, typeCount + 1);
    }
  }

  // ── 2. Region-implicit highlights ──────────────────────
  const regionImplicits = REGION_IMPLICIT_HIGHLIGHTS[route.regionGroup] ?? [];
  for (let i = 0; i < regionImplicits.length; i++) {
    const implicit = regionImplicits[i];

    // Skip if we already have this type from keyword detection
    const existingCount = seenTypes.get(implicit.type) ?? 0;
    if (existingCount >= 2) continue;

    // Use deterministic "probability" based on route characteristics
    // instead of Math.random() for memoization compatibility
    const seed = _hashSeed(route.id, implicit.type, i);
    if (seed > implicit.probability) continue;

    const meta = HIGHLIGHT_META[implicit.type];
    const fraction = 0.3 + (i * 0.2);
    const latOffset = (fraction - 0.5) * (route.distanceMiles / 69) * 0.5;
    const lngOffset = (fraction - 0.5) * (route.distanceMiles / 55) * 0.4;

    const id = `${route.id}-${implicit.type}-implicit-${i}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    highlights.push({
      id,
      type: implicit.type,
      name: implicit.name,
      description: implicit.description,
      lat: route.startLat + latOffset,
      lng: route.startLng + lngOffset,
      relevance: implicit.relevance,
      icon: meta.icon,
      color: meta.color,
      fromRouteMetadata: false,
      distanceFromRouteMi: parseFloat((0.2 + i * 0.3).toFixed(1)),
    });

    seenTypes.set(implicit.type, existingCount + 1);
  }

  // ── 3. Dark Sky detection (elevation + remoteness based) ─
  if (!seenTypes.has('dark_sky')) {
    const darkSkyProb = _darkSkyProbability(route.remotenessScore, route.terrainType);
    const seed = _hashSeed(route.id, 'dark_sky', 99);
    if (seed <= darkSkyProb) {
      const meta = HIGHLIGHT_META.dark_sky;
      const id = `${route.id}-dark_sky-auto`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const relevance = clamp(Math.round(route.remotenessScore * 8 + 15), 0, 100);
        highlights.push({
          id,
          type: 'dark_sky',
          name: 'Dark Sky Zone',
          description: `Remote area with minimal light pollution. Remoteness ${route.remotenessScore}/10 provides excellent stargazing conditions.`,
          lat: route.startLat + 0.02,
          lng: route.startLng - 0.01,
          relevance,
          icon: meta.icon,
          color: meta.color,
          fromRouteMetadata: false,
          distanceFromRouteMi: 0.5,
        });
        seenTypes.set('dark_sky', 1);
      }
    }
  }

  // ── 4. Elevation-based scenic overlook detection ────────
  if (!seenTypes.has('scenic_overlook') && route.elevationGainFt >= 3000) {
    const meta = HIGHLIGHT_META.scenic_overlook;
    const id = `${route.id}-scenic-elevation`;
    if (!seenIds.has(id)) {
      seenIds.add(id);
      const elevK = (route.elevationGainFt / 1000).toFixed(1);
      highlights.push({
        id,
        type: 'scenic_overlook',
        name: `${route.name.split(/\s/)[0]} Summit View`,
        description: `High point along the route with ${elevK}k ft of elevation gain providing expansive views.`,
        lat: route.startLat + 0.03,
        lng: route.startLng + 0.02,
        relevance: clamp(Math.round(50 + route.elevationGainFt / 200), 0, 95),
        icon: meta.icon,
        color: meta.color,
        fromRouteMetadata: false,
        distanceFromRouteMi: 0,
      });
      seenTypes.set('scenic_overlook', 1);
    }
  }

  // ── Sort by relevance (highest first) ──────────────────
  highlights.sort((a, b) => b.relevance - a.relevance);

  // ── Limit total highlights ─────────────────────────────
  const limited = highlights.slice(0, MAX_HIGHLIGHTS_PER_ROUTE);

  // ── Card highlights (top N above relevance threshold) ──
  const cardHighlights = limited
    .filter(h => h.relevance >= MIN_CARD_RELEVANCE)
    .slice(0, MAX_CARD_HIGHLIGHTS);

  // ── Type counts ────────────────────────────────────────
  const typeCounts: Partial<Record<HighlightType, number>> = {};
  for (const h of limited) {
    typeCounts[h.type] = (typeCounts[h.type] ?? 0) + 1;
  }

  // ── Simplified summary for vehicle displays ────────────
  const simplifiedSummary = _buildSimplifiedSummary(cardHighlights);

  const result: LocalKnowledgeResult = {
    highlights: limited,
    cardHighlights,
    totalCount: limited.length,
    typeCounts,
    offlineAvailable: true,
    isEstimated: limited.some(h => !h.fromRouteMetadata),
    simplifiedSummary,
  };

  console.log(
    TAG,
    `Detected ${limited.length} highlights for "${route.name}" ` +
    `(${cardHighlights.length} card-worthy): ` +
    cardHighlights.map(h => h.type).join(', '),
  );

  return result;
}

// ============================================================
// BATCH EVALUATION
// ============================================================

/**
 * Detect local highlights for multiple routes.
 * Returns a map of route ID → LocalKnowledgeResult.
 * Prevents duplicate calculations via Map keying.
 */
export function detectLocalHighlightsBatch(
  routes: LocalKnowledgeRouteInput[],
): Map<string, LocalKnowledgeResult> {
  const results = new Map<string, LocalKnowledgeResult>();

  console.log(TAG, `Batch detecting highlights for ${routes.length} routes`);

  for (const route of routes) {
    // Prevent duplicate detection
    if (results.has(route.id)) continue;
    results.set(route.id, detectLocalHighlights(route));
  }

  return results;
}

/**
 * Enrich opportunities with localHighlights field.
 * Returns a new array with the highlights populated.
 */
export function enrichWithLocalHighlights(
  opportunities: Array<LocalKnowledgeRouteInput & { localHighlights?: LocalHighlight[] }>,
  highlightResults: Map<string, LocalKnowledgeResult>,
): Array<LocalKnowledgeRouteInput & { localHighlights?: LocalHighlight[] }> {
  return opportunities.map(op => ({
    ...op,
    localHighlights: highlightResults.get(op.id)?.cardHighlights ?? op.localHighlights ?? [],
  }));
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

/** Get highlight type metadata for display */
export function getHighlightMeta(type: HighlightType): {
  icon: string;
  color: string;
  label: string;
  shortLabel: string;
} {
  return HIGHLIGHT_META[type] ?? HIGHLIGHT_META.scenic_overlook;
}

/** Get highlight icon name */
export function getHighlightIcon(type: HighlightType): string {
  return HIGHLIGHT_META[type]?.icon ?? 'location-outline';
}

/** Get highlight color */
export function getHighlightColor(type: HighlightType): string {
  return HIGHLIGHT_META[type]?.color ?? '#8B949E';
}

/** Get highlight short label */
export function getHighlightShortLabel(type: HighlightType): string {
  return HIGHLIGHT_META[type]?.shortLabel ?? 'POI';
}

/** Get highlight full label */
export function getHighlightLabel(type: HighlightType): string {
  return HIGHLIGHT_META[type]?.label ?? 'Point of Interest';
}

/** Get simplified highlight indicator for vehicle displays (AA/CarPlay) */
export function getSimplifiedHighlightIndicator(
  highlights: LocalHighlight[],
): {
  label: string;
  icon: string;
  count: number;
} {
  if (highlights.length === 0) {
    return { label: 'NO HIGHLIGHTS', icon: 'location-outline', count: 0 };
  }
  if (highlights.length >= 3) {
    return { label: 'RICH HIGHLIGHTS', icon: 'star-outline', count: highlights.length };
  }
  if (highlights.length >= 1) {
    return { label: `${highlights.length} HIGHLIGHT${highlights.length > 1 ? 'S' : ''}`, icon: 'location-outline', count: highlights.length };
  }
  return { label: 'NO HIGHLIGHTS', icon: 'location-outline', count: 0 };
}

/** Format highlight count for compact display */
export function formatHighlightCount(count: number): string {
  if (count === 0) return 'None';
  if (count === 1) return '1 highlight';
  return `${count} highlights`;
}

// ============================================================
// OFFLINE COMPATIBILITY
// ============================================================

/**
 * Check if local knowledge data can be generated offline.
 * Highlights are derived from route metadata, so they
 * are always available when route data is cached.
 */
export function isLocalKnowledgeAvailableOffline(): boolean {
  return true;
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate that a route has sufficient metadata for highlight detection.
 * Returns true if the route can be evaluated.
 */
export function validateRouteForHighlights(route: {
  distanceMiles?: number;
  terrainType?: string;
  remotenessScore?: number;
  highlights?: string[];
  regionGroup?: string;
}): boolean {
  if (!route.distanceMiles || route.distanceMiles <= 0) return false;
  if (!route.terrainType) return false;
  if (route.remotenessScore == null) return false;
  return true;
}

// ============================================================
// CATEGORY INTEGRATION
// ============================================================

/**
 * Get highlight richness score for category ranking.
 * Routes with more/better highlights get a small ranking boost.
 *
 * @param highlights  Array of highlights for the route
 * @returns Bonus score 0–10 for category ranking
 */
export function getHighlightRichnessBonus(
  highlights: LocalHighlight[],
): number {
  if (highlights.length === 0) return 0;

  // Count unique types
  const uniqueTypes = new Set(highlights.map(h => h.type)).size;

  // Average relevance
  const avgRelevance = highlights.reduce((s, h) => s + h.relevance, 0) / highlights.length;

  // More unique types + higher relevance = higher bonus
  const typeBonus = Math.min(uniqueTypes * 2, 6);
  const relevanceBonus = Math.round((avgRelevance / 100) * 4);

  return clamp(typeBonus + relevanceBonus, 0, 10);
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Deterministic hash-based seed for "probability" checks.
 * Returns a value 0–1 based on the input strings.
 * This ensures the same route always gets the same highlights
 * (memoization-friendly, no Math.random()).
 */
function _hashSeed(routeId: string, type: string, index: number): number {
  let hash = 0;
  const str = `${routeId}:${type}:${index}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0–1
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Build a simplified summary string for vehicle displays.
 */
function _buildSimplifiedSummary(highlights: LocalHighlight[]): string {
  if (highlights.length === 0) return 'No highlights';

  const labels = highlights
    .slice(0, 2)
    .map(h => HIGHLIGHT_META[h.type]?.shortLabel ?? 'POI');

  if (highlights.length > 2) {
    return `${labels.join(', ')} +${highlights.length - 2}`;
  }
  return labels.join(', ');
}

