import type { ExpeditionOpportunity, RegionGroupId } from './discoverEngine';

type ExploreThumbnailState =
  | 'route_specific'
  | 'direct_route_image'
  | 'terrain_fallback'
  | 'region_fallback'
  | 'generic_fallback'
  | 'suppressed_mismatch'
  | 'none';

type ExploreThumbnailTrust = 'trusted' | 'acceptable' | 'suppressed';

type TerrainFamily = 'alpine' | 'forest' | 'desert' | 'mixed' | 'unknown';
export type ExploreLandscapeFallbackGroup =
  | 'sierra_tahoe_alpine_forest'
  | 'desert_high_desert'
  | 'coastal_ocean_redwoods'
  | 'forest_mountain_trail'
  | 'canyon_rock_terrain'
  | 'generic_overland_landscape';

export interface ExploreTrailThumbnailAssignment {
  state: ExploreThumbnailState;
  trust: ExploreThumbnailTrust;
  uri: string | null;
  sourceKey?: string;
  reason?: string;
}

interface ThumbnailRecord {
  uri: string;
  terrainFamily: TerrainFamily;
  fallbackGroup?: ExploreLandscapeFallbackGroup;
  regionGroups?: RegionGroupId[];
}

export type ExploreRouteThumbnailRoute = {
  id?: string | number | null;
  name?: string;
  region?: string;
  regionGroup?: RegionGroupId;
  imageTag?: string;
  terrainType?: string;
  description?: string;
  biome?: string;
  category?: string;
  startLat?: number;
  startLng?: number;
};

// Local Explore landscape assets do not exist yet. These stable placeholder
// names define the drop-in boundary for replacing the URL-backed fallback
// library with bundled assets later without touching route-card rendering.
export const EXPLORE_ROUTE_THUMBNAIL_ASSET_PLACEHOLDERS: Record<ExploreLandscapeFallbackGroup, string[]> = {
  sierra_tahoe_alpine_forest: [
    'assets/explore/thumbnails/sierra_tahoe_alpine_forest_01.jpg',
    'assets/explore/thumbnails/sierra_tahoe_alpine_forest_02.jpg',
  ],
  desert_high_desert: [
    'assets/explore/thumbnails/desert_high_desert_01.jpg',
    'assets/explore/thumbnails/desert_high_desert_02.jpg',
  ],
  coastal_ocean_redwoods: [
    'assets/explore/thumbnails/coastal_ocean_redwoods_01.jpg',
    'assets/explore/thumbnails/coastal_ocean_redwoods_02.jpg',
  ],
  forest_mountain_trail: [
    'assets/explore/thumbnails/forest_mountain_trail_01.jpg',
    'assets/explore/thumbnails/forest_mountain_trail_02.jpg',
  ],
  canyon_rock_terrain: [
    'assets/explore/thumbnails/canyon_rock_terrain_01.jpg',
    'assets/explore/thumbnails/canyon_rock_terrain_02.jpg',
  ],
  generic_overland_landscape: [
    'assets/explore/thumbnails/generic_overland_landscape_01.jpg',
    'assets/explore/thumbnails/generic_overland_landscape_02.jpg',
  ],
};

const THUMBNAIL_LIBRARY: Record<string, ThumbnailRecord> = {
  'canyon-switchbacks': {
    uri: 'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'canyon_rock_terrain',
    regionGroups: ['utah-canyonlands'],
  },
  'canyon-rim-road': {
    uri: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'canyon_rock_terrain',
    regionGroups: ['utah-canyonlands', 'arizona-desert'],
  },
  'desert-monoliths': {
    uri: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'canyon_rock_terrain',
    regionGroups: ['utah-canyonlands', 'great-basin'],
  },
  'desert-playa-track': {
    uri: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'desert_high_desert',
    regionGroups: ['great-basin', 'california-desert', 'new-mexico'],
  },
  'desert-wash-road': {
    uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'desert_high_desert',
    regionGroups: ['california-desert', 'arizona-desert', 'texas-hill-country'],
  },
  'high-desert-track': {
    uri: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'desert_high_desert',
    regionGroups: ['great-basin', 'new-mexico', 'california-desert'],
  },
  'alpine-granite': {
    uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'alpine',
    fallbackGroup: 'sierra_tahoe_alpine_forest',
    regionGroups: ['sierra-nevada', 'colorado-high-country', 'idaho-montana', 'oregon-cascades'],
  },
  'alpine-pass': {
    uri: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'alpine',
    fallbackGroup: 'sierra_tahoe_alpine_forest',
    regionGroups: ['colorado-high-country', 'sierra-nevada', 'idaho-montana'],
  },
  'alpine-lake-track': {
    uri: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'alpine',
    fallbackGroup: 'sierra_tahoe_alpine_forest',
    regionGroups: ['sierra-nevada', 'oregon-cascades', 'colorado-high-country'],
  },
  'alpine-rock-shelf': {
    uri: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'alpine',
    fallbackGroup: 'sierra_tahoe_alpine_forest',
    regionGroups: ['colorado-high-country', 'sierra-nevada'],
  },
  'sierra-tahoe-forest': {
    uri: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'sierra_tahoe_alpine_forest',
    regionGroups: ['sierra-nevada'],
  },
  'forest-ridgeline': {
    uri: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'forest_mountain_trail',
    regionGroups: ['pacific-northwest', 'southern-appalachians', 'kentucky-appalachians', 'oregon-cascades'],
  },
  'forest-gravel': {
    uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'forest_mountain_trail',
    regionGroups: ['upper-midwest', 'southern-appalachians', 'arkansas-ozarks'],
  },
  'forest-coastal-track': {
    uri: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'coastal_ocean_redwoods',
    regionGroups: ['pacific-northwest', 'oregon-cascades'],
  },
  'coastal-redwoods': {
    uri: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'coastal_ocean_redwoods',
    regionGroups: ['pacific-northwest', 'oregon-cascades'],
  },
  'forest-lake-road': {
    uri: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'forest_mountain_trail',
    regionGroups: ['sierra-nevada', 'upper-midwest', 'pacific-northwest'],
  },
  'forest-mountain-creek': {
    uri: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    fallbackGroup: 'forest_mountain_trail',
    regionGroups: ['southern-appalachians', 'arkansas-ozarks', 'kentucky-appalachians'],
  },
  'desert-canyon': {
    uri: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'canyon_rock_terrain',
    regionGroups: ['utah-canyonlands', 'arizona-desert', 'new-mexico', 'great-basin'],
  },
  'desert-open': {
    uri: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    fallbackGroup: 'desert_high_desert',
    regionGroups: ['california-desert', 'great-basin', 'texas-hill-country'],
  },
  'generic-overland-landscape': {
    uri: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'mixed',
    fallbackGroup: 'generic_overland_landscape',
  },
};

const ROUTE_THUMBNAIL_BY_ID: Record<string, string> = {
  'white-rim-trail': 'canyon-rim-road',
  'mojave-road': 'desert-wash-road',
  'alpine-loop': 'alpine-pass',
  'georgia-traverse': 'forest-mountain-creek',
  'trans-wisconsin-adventure-trail': 'forest-gravel',
  'death-valley-backcountry': 'desert-playa-track',
  'ouachita-backcountry': 'forest-mountain-creek',
  'black-bear-pass': 'alpine-rock-shelf',
  'rubicon-trail': 'alpine-granite',
  'olympic-peninsula-loop': 'forest-coastal-track',
  'arizona-backcountry-discovery': 'desert-wash-road',
  'hidden-falls-network': 'forest-gravel',
  'medano-pass': 'desert-open',
  'shafer-trail': 'canyon-switchbacks',
  'poughkeepsie-gulch': 'alpine-rock-shelf',
  'hole-in-the-rock': 'desert-monoliths',
  'cathedral-valley-loop': 'desert-canyon',
  'high-lakes-ohv': 'alpine-lake-track',
  'fordyce-creek-trail': 'alpine-granite',
  'bowman-lake-road': 'forest-lake-road',
  'pine-nut-mountain-tracks': 'desert-playa-track',
  'moon-rocks-ohv': 'desert-open',
  'fort-sage-ohv': 'desert-wash-road',
  'black-rock-playa-loop': 'desert-playa-track',
  'high-rock-canyon': 'desert-canyon',
  'bald-mountain-ohv': 'alpine-granite',
  'coyote-flat-tracks': 'alpine-pass',
};

const IMAGE_TAG_TO_SOURCE_KEY: Record<string, string> = {
  'alpine-mountain': 'alpine-granite',
  'forest-mountain': 'forest-ridgeline',
  'forest-gravel': 'forest-gravel',
  'desert-canyon': 'desert-canyon',
  'desert-sand': 'desert-open',
};

const REGION_FALLBACK_BY_GROUP: Partial<Record<RegionGroupId, string>> = {
  'sierra-nevada': 'alpine-granite',
  'colorado-high-country': 'alpine-granite',
  'idaho-montana': 'alpine-granite',
  'oregon-cascades': 'forest-ridgeline',
  'pacific-northwest': 'forest-ridgeline',
  'southern-appalachians': 'forest-ridgeline',
  'kentucky-appalachians': 'forest-ridgeline',
  'upper-midwest': 'forest-gravel',
  'arkansas-ozarks': 'forest-gravel',
  'utah-canyonlands': 'desert-canyon',
  'arizona-desert': 'desert-canyon',
  'new-mexico': 'desert-canyon',
  'california-desert': 'desert-open',
  'great-basin': 'desert-open',
  'texas-hill-country': 'desert-open',
};

const REGION_FALLBACK_POOL_BY_GROUP: Partial<Record<RegionGroupId, string[]>> = {
  'utah-canyonlands': ['canyon-rim-road', 'canyon-switchbacks', 'desert-monoliths', 'desert-canyon', 'desert-open'],
  'california-desert': ['desert-playa-track', 'desert-wash-road', 'high-desert-track', 'desert-open'],
  'colorado-high-country': ['alpine-pass', 'alpine-rock-shelf', 'alpine-granite', 'alpine-lake-track'],
  'southern-appalachians': ['forest-mountain-creek', 'forest-ridgeline', 'forest-gravel'],
  'upper-midwest': ['forest-gravel', 'forest-lake-road', 'forest-ridgeline'],
  'arkansas-ozarks': ['forest-mountain-creek', 'forest-gravel', 'forest-ridgeline'],
  'sierra-nevada': ['sierra-tahoe-forest', 'alpine-granite', 'alpine-lake-track', 'forest-lake-road', 'alpine-pass', 'alpine-rock-shelf'],
  'pacific-northwest': ['coastal-redwoods', 'forest-coastal-track', 'forest-ridgeline', 'forest-lake-road'],
  'arizona-desert': ['desert-wash-road', 'desert-canyon', 'desert-open', 'desert-monoliths'],
  'texas-hill-country': ['forest-gravel', 'desert-wash-road', 'forest-ridgeline'],
  'idaho-montana': ['alpine-pass', 'alpine-granite', 'forest-ridgeline'],
  'great-basin': ['desert-playa-track', 'high-desert-track', 'desert-monoliths', 'desert-open'],
  'oregon-cascades': ['forest-ridgeline', 'forest-coastal-track', 'coastal-redwoods', 'alpine-lake-track'],
  'new-mexico': ['desert-canyon', 'desert-wash-road', 'desert-open'],
  'kentucky-appalachians': ['forest-mountain-creek', 'forest-ridgeline', 'forest-gravel'],
};

const LANDSCAPE_FALLBACK_POOL_BY_GROUP: Record<ExploreLandscapeFallbackGroup, string[]> = {
  sierra_tahoe_alpine_forest: ['sierra-tahoe-forest', 'alpine-lake-track', 'alpine-granite', 'forest-lake-road', 'alpine-pass'],
  desert_high_desert: ['desert-playa-track', 'desert-wash-road', 'high-desert-track', 'desert-open'],
  coastal_ocean_redwoods: ['coastal-redwoods', 'forest-coastal-track', 'forest-ridgeline', 'forest-lake-road'],
  forest_mountain_trail: ['forest-mountain-creek', 'forest-ridgeline', 'forest-gravel', 'forest-lake-road'],
  canyon_rock_terrain: ['canyon-rim-road', 'canyon-switchbacks', 'desert-canyon', 'desert-monoliths', 'alpine-rock-shelf'],
  generic_overland_landscape: ['generic-overland-landscape', 'forest-ridgeline', 'desert-open', 'alpine-granite'],
};

const TERRAIN_FALLBACK_POOL_BY_FAMILY: Record<TerrainFamily, string[]> = {
  alpine: ['alpine-granite', 'alpine-pass', 'alpine-lake-track', 'alpine-rock-shelf'],
  forest: ['forest-ridgeline', 'forest-gravel', 'forest-coastal-track', 'forest-lake-road', 'forest-mountain-creek'],
  desert: ['desert-canyon', 'desert-open', 'desert-playa-track', 'desert-wash-road', 'desert-monoliths', 'canyon-switchbacks'],
  mixed: ['forest-gravel', 'desert-open', 'alpine-pass', 'forest-lake-road'],
  unknown: ['generic-overland-landscape', 'forest-ridgeline', 'desert-open', 'alpine-granite'],
};

const DIRECT_IMAGE_TAGS = new Set(Object.keys(IMAGE_TAG_TO_SOURCE_KEY));
const AMBIGUOUS_TERRAIN_MARKERS = ['unknown', 'mixed use', 'mixed-use', 'connector', 'utility', 'urban'];

function getSearchableContext(route: ExploreRouteThumbnailRoute): string {
  return [
    route.name,
    route.region,
    route.terrainType,
    route.imageTag,
    route.description,
    route.biome,
    route.category,
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferTerrainFamily(route: ExploreRouteThumbnailRoute): TerrainFamily {
  const imageTag = route.imageTag?.toLowerCase().trim() ?? '';
  if (imageTag.includes('desert')) return 'desert';
  if (imageTag.includes('forest')) return 'forest';
  if (imageTag.includes('alpine') || imageTag.includes('mountain')) return 'alpine';

  const terrain = route.terrainType?.toLowerCase() ?? '';
  if (terrain.includes('desert') || terrain.includes('sand') || terrain.includes('canyon')) return 'desert';
  if (terrain.includes('forest') || terrain.includes('gravel') || terrain.includes('wood')) return 'forest';
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('rock')) return 'alpine';
  if (terrain.includes('mixed')) return 'mixed';

  switch (route.regionGroup) {
    case 'sierra-nevada':
    case 'colorado-high-country':
    case 'idaho-montana':
      return 'alpine';
    case 'pacific-northwest':
    case 'southern-appalachians':
    case 'kentucky-appalachians':
    case 'upper-midwest':
    case 'arkansas-ozarks':
    case 'oregon-cascades':
      return 'forest';
    case 'utah-canyonlands':
    case 'arizona-desert':
    case 'new-mexico':
    case 'california-desert':
    case 'great-basin':
    case 'texas-hill-country':
      return 'desert';
    default:
      return 'unknown';
  }
}

function inferLandscapeFallbackGroup(route: ExploreRouteThumbnailRoute): ExploreLandscapeFallbackGroup {
  const searchable = getSearchableContext(route);
  if (/(coast|ocean|redwood|olympic|peninsula|shoreline|pacific)/i.test(searchable)) {
    return 'coastal_ocean_redwoods';
  }
  if (/(sierra|tahoe|rubicon|yosemite)/i.test(searchable)) {
    return 'sierra_tahoe_alpine_forest';
  }
  if (/(canyon|slickrock|moab|canyonlands|shafer|white rim|cathedral valley|rock shelf)/i.test(searchable)) {
    return 'canyon_rock_terrain';
  }
  if (/(desert|high desert|sand|dune|playa|mojave|death valley|great basin|arizona|new mexico)/i.test(searchable)) {
    return 'desert_high_desert';
  }
  if (/(forest|mountain|gravel|ridge|creek|appalach|ozark|ouachita|wisconsin|georgia)/i.test(searchable)) {
    return 'forest_mountain_trail';
  }

  switch (route.regionGroup) {
    case 'utah-canyonlands':
      return 'canyon_rock_terrain';
    case 'california-desert':
    case 'arizona-desert':
    case 'new-mexico':
    case 'great-basin':
      return 'desert_high_desert';
    case 'pacific-northwest':
    case 'oregon-cascades':
      return 'coastal_ocean_redwoods';
    case 'colorado-high-country':
    case 'idaho-montana':
      return 'sierra_tahoe_alpine_forest';
    case 'southern-appalachians':
    case 'kentucky-appalachians':
    case 'upper-midwest':
    case 'arkansas-ozarks':
    case 'texas-hill-country':
      return 'forest_mountain_trail';
    default:
      break;
  }

  const lat = route.startLat;
  const lng = route.startLng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat! >= 36 && lat! <= 41 && lng! >= -123 && lng! <= -118) return 'sierra_tahoe_alpine_forest';
    if (lat! >= 32 && lat! <= 37 && lng! >= -119 && lng! <= -114) return 'desert_high_desert';
    if (lat! >= 37 && lat! <= 49 && lng! >= -125 && lng! <= -122) return 'coastal_ocean_redwoods';
    if (lat! >= 36 && lat! <= 39.5 && lng! >= -111.5 && lng! <= -108) return 'canyon_rock_terrain';
  }

  return 'generic_overland_landscape';
}

function hasAmbiguousTerrain(route: Pick<ExploreRouteThumbnailRoute, 'terrainType'>): boolean {
  const terrain = route.terrainType?.toLowerCase() ?? '';
  return AMBIGUOUS_TERRAIN_MARKERS.some((marker) => terrain.includes(marker));
}

function buildAssignment(
  sourceKey: string,
  state: ExploreThumbnailState,
  trust: ExploreThumbnailTrust,
  reason: string,
): ExploreTrailThumbnailAssignment {
  const entry = THUMBNAIL_LIBRARY[sourceKey];
  if (!entry) {
    return { state: 'none', trust: 'suppressed', uri: null, reason: 'missing_thumbnail_record' };
  }
  return {
    state,
    trust,
    uri: entry.uri,
    sourceKey,
    reason,
  };
}

function isRegionCompatible(sourceKey: string, regionGroup?: RegionGroupId): boolean {
  const entry = THUMBNAIL_LIBRARY[sourceKey];
  if (!regionGroup) return true;
  if (!entry?.regionGroups || entry.regionGroups.length === 0) return true;
  return entry.regionGroups.includes(regionGroup);
}

function isTerrainCompatible(sourceKey: string, terrainFamily: TerrainFamily): boolean {
  const entry = THUMBNAIL_LIBRARY[sourceKey];
  if (!entry) return false;
  if (terrainFamily === 'unknown') return false;
  if (terrainFamily === 'mixed') return true;
  return entry.terrainFamily === terrainFamily;
}

export function getExploreTrailThumbnail(
  route: Pick<ExpeditionOpportunity, 'imageTag' | 'terrainType' | 'regionGroup'> & Partial<ExploreRouteThumbnailRoute>,
): ExploreTrailThumbnailAssignment {
  const terrainFamily = inferTerrainFamily(route);
  const candidates = buildCandidateSourceKeys(route);

  const imageTag = route.imageTag?.toLowerCase().trim() ?? '';
  if (DIRECT_IMAGE_TAGS.has(imageTag)) {
    const sourceKey = IMAGE_TAG_TO_SOURCE_KEY[imageTag];
    if (isTerrainCompatible(sourceKey, terrainFamily) && isRegionCompatible(sourceKey, route.regionGroup)) {
      return buildAssignment(sourceKey, 'direct_route_image', 'trusted', 'matched_image_tag');
    }
    const fallbackSourceKey = candidates.find((candidate) => candidate !== sourceKey) ?? 'generic-overland-landscape';
    return buildAssignment(fallbackSourceKey, 'region_fallback', 'acceptable', 'image_tag_mismatch_context_fallback');
  }

  if (terrainFamily === 'unknown' || hasAmbiguousTerrain(route)) {
    const fallbackSourceKey = candidates[0] ?? 'generic-overland-landscape';
    return buildAssignment(fallbackSourceKey, 'generic_fallback', 'acceptable', 'ambiguous_context_fallback');
  }

  const regionalSourceKey = route.regionGroup ? REGION_FALLBACK_BY_GROUP[route.regionGroup] : null;
  if (regionalSourceKey && isTerrainCompatible(regionalSourceKey, terrainFamily)) {
    return buildAssignment(regionalSourceKey, 'region_fallback', 'acceptable', 'matched_region_fallback');
  }

  const terrainSourceKey = candidates.find((candidate) => THUMBNAIL_LIBRARY[candidate]?.terrainFamily === terrainFamily) ?? null;
  if (terrainSourceKey) {
    return buildAssignment(terrainSourceKey, 'terrain_fallback', 'acceptable', 'matched_terrain_fallback');
  }

  return buildAssignment(candidates[0] ?? 'generic-overland-landscape', 'generic_fallback', 'acceptable', 'last_resort_context_fallback');
}

export type ExploreThumbnailCategoryContext =
  | 'hiddenGems'
  | 'popularTrails'
  | 'knownRoutes'
  | 'favorites'
  | 'trailPacks'
  | 'ecsRouteIdeas'
  | string;

function uniqueSourceKeys(keys: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    if (!key || seen.has(key) || !THUMBNAIL_LIBRARY[key]) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function buildCandidateSourceKeys(route: ExploreRouteThumbnailRoute): string[] {
  const terrainFamily = inferTerrainFamily(route);
  const landscapeGroup = inferLandscapeFallbackGroup(route);
  const routeId = route.id == null ? '' : String(route.id);
  const routeSpecific = routeId ? ROUTE_THUMBNAIL_BY_ID[routeId] ?? null : null;
  const imageTagKey = IMAGE_TAG_TO_SOURCE_KEY[route.imageTag?.toLowerCase().trim() ?? ''] ?? null;
  const regionPool = route.regionGroup ? REGION_FALLBACK_POOL_BY_GROUP[route.regionGroup] ?? [] : [];
  const legacyRegionFallback = route.regionGroup ? REGION_FALLBACK_BY_GROUP[route.regionGroup] ?? null : null;
  const landscapePool = LANDSCAPE_FALLBACK_POOL_BY_GROUP[landscapeGroup] ?? [];
  const terrainPool = TERRAIN_FALLBACK_POOL_BY_FAMILY[terrainFamily] ?? TERRAIN_FALLBACK_POOL_BY_FAMILY.unknown;

  return uniqueSourceKeys([
    routeSpecific,
    ...landscapePool,
    ...regionPool,
    imageTagKey,
    legacyRegionFallback,
    ...terrainPool,
    ...LANDSCAPE_FALLBACK_POOL_BY_GROUP.generic_overland_landscape,
  ]);
}

function assignmentFromSourceKey(
  sourceKey: string,
  state: ExploreThumbnailState,
  trust: ExploreThumbnailTrust,
  reason: string,
): ExploreTrailThumbnailAssignment {
  return buildAssignment(sourceKey, state, trust, reason);
}

export function getExploreRouteThumbnail(
  route: ExploreRouteThumbnailRoute,
  usedImageUris: Set<string> = new Set(),
): ExploreTrailThumbnailAssignment {
  const candidates = buildCandidateSourceKeys(route);
  if (candidates.length === 0) {
    const assignment = buildAssignment(
      'generic-overland-landscape',
      'generic_fallback',
      'acceptable',
      'empty_context_generic_fallback',
    );
    if (assignment.uri) usedImageUris.add(assignment.uri);
    return assignment;
  }

  const routeId = route.id == null ? '' : String(route.id);
  const routeSpecific = routeId ? ROUTE_THUMBNAIL_BY_ID[routeId] ?? null : null;
  const routeSpecificUri = routeSpecific ? THUMBNAIL_LIBRARY[routeSpecific]?.uri : null;
  if (routeSpecific && routeSpecificUri && !usedImageUris.has(routeSpecificUri)) {
    usedImageUris.add(routeSpecificUri);
    return assignmentFromSourceKey(routeSpecific, 'route_specific', 'trusted', 'matched_route_id');
  }

  const unused = candidates.find((candidate) => {
    const uri = THUMBNAIL_LIBRARY[candidate]?.uri;
    return !!uri && !usedImageUris.has(uri);
  });
  if (unused) {
    usedImageUris.add(THUMBNAIL_LIBRARY[unused].uri);
    return assignmentFromSourceKey(unused, unused === routeSpecific ? 'route_specific' : 'region_fallback', 'acceptable', 'unique_list_candidate');
  }

  // The fallback image pools are finite. Once every suitable source has been
  // used in the visible list, cycle deterministically by route ID so thumbnails
  // stay stable across renders instead of changing randomly.
  const cycled = candidates[stableHash(String(route.id)) % candidates.length];
  return assignmentFromSourceKey(cycled, 'region_fallback', 'acceptable', 'finite_pool_cycled');
}

export function getExploreRouteThumbnailAssignments(
  routes: ExploreRouteThumbnailRoute[],
  _categoryContext?: ExploreThumbnailCategoryContext,
): Map<string, ExploreTrailThumbnailAssignment> {
  const usedImageUris = new Set<string>();
  const assignments = new Map<string, ExploreTrailThumbnailAssignment>();

  for (const route of routes) {
    assignments.set(String(route.id), getExploreRouteThumbnail(route, usedImageUris));
  }

  return assignments;
}
