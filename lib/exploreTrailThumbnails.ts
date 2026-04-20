import type { ExpeditionOpportunity, RegionGroupId } from './discoverEngine';

type ExploreThumbnailState =
  | 'direct_route_image'
  | 'terrain_fallback'
  | 'region_fallback'
  | 'suppressed_mismatch'
  | 'none';

type ExploreThumbnailTrust = 'trusted' | 'acceptable' | 'suppressed';

type TerrainFamily = 'alpine' | 'forest' | 'desert' | 'mixed' | 'unknown';

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
  regionGroups?: RegionGroupId[];
}

const THUMBNAIL_LIBRARY: Record<string, ThumbnailRecord> = {
  'alpine-granite': {
    uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'alpine',
    regionGroups: ['sierra-nevada', 'colorado-high-country', 'idaho-montana', 'oregon-cascades'],
  },
  'forest-ridgeline': {
    uri: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    regionGroups: ['pacific-northwest', 'southern-appalachians', 'kentucky-appalachians', 'oregon-cascades'],
  },
  'forest-gravel': {
    uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'forest',
    regionGroups: ['upper-midwest', 'southern-appalachians', 'arkansas-ozarks'],
  },
  'desert-canyon': {
    uri: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    regionGroups: ['utah-canyonlands', 'arizona-desert', 'new-mexico', 'great-basin'],
  },
  'desert-open': {
    uri: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=320&h=220&q=80',
    terrainFamily: 'desert',
    regionGroups: ['california-desert', 'great-basin', 'texas-hill-country'],
  },
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

const DIRECT_IMAGE_TAGS = new Set(Object.keys(IMAGE_TAG_TO_SOURCE_KEY));
const AMBIGUOUS_TERRAIN_MARKERS = ['unknown', 'mixed use', 'mixed-use', 'connector', 'utility', 'urban'];

function inferTerrainFamily(route: Pick<ExpeditionOpportunity, 'terrainType' | 'imageTag' | 'regionGroup'>): TerrainFamily {
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

function hasAmbiguousTerrain(route: Pick<ExpeditionOpportunity, 'terrainType'>): boolean {
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

function isRegionCompatible(sourceKey: string, regionGroup: RegionGroupId): boolean {
  const entry = THUMBNAIL_LIBRARY[sourceKey];
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
  route: Pick<ExpeditionOpportunity, 'imageTag' | 'terrainType' | 'regionGroup'>,
): ExploreTrailThumbnailAssignment | null {
  const terrainFamily = inferTerrainFamily(route);
  if (terrainFamily === 'unknown' || hasAmbiguousTerrain(route)) {
    return null;
  }

  const imageTag = route.imageTag?.toLowerCase().trim() ?? '';
  if (DIRECT_IMAGE_TAGS.has(imageTag)) {
    const sourceKey = IMAGE_TAG_TO_SOURCE_KEY[imageTag];
    if (isTerrainCompatible(sourceKey, terrainFamily) && isRegionCompatible(sourceKey, route.regionGroup)) {
      return buildAssignment(sourceKey, 'direct_route_image', 'trusted', 'matched_image_tag');
    }
    return {
      state: 'suppressed_mismatch',
      trust: 'suppressed',
      uri: null,
      sourceKey,
      reason: 'image_tag_mismatch',
    };
  }

  const regionalSourceKey = REGION_FALLBACK_BY_GROUP[route.regionGroup];
  if (regionalSourceKey && isTerrainCompatible(regionalSourceKey, terrainFamily)) {
    return buildAssignment(regionalSourceKey, 'region_fallback', 'acceptable', 'matched_region_fallback');
  }

  const terrainSourceKey = Object.entries(THUMBNAIL_LIBRARY).find(([, entry]) => entry.terrainFamily === terrainFamily)?.[0] ?? null;
  if (terrainSourceKey) {
    return buildAssignment(terrainSourceKey, 'terrain_fallback', 'acceptable', 'matched_terrain_fallback');
  }

  return null;
}
