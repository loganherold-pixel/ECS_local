import {
  getExploreFavoritesSnapshot,
  type FavoriteTrailPlan,
  type FavoriteTrailRecord,
} from './exploreFavoritesStore';
import type { NavigationHandoffPayload } from './navigationHandoffStore';
import { routeStore, type ImportedRoute } from './routeStore';
import { runStore, type ECSRun } from './runStore';

export type SavedRouteAssetKind =
  | 'imported'
  | 'custom'
  | 'stitched'
  | 'bookmarked'
  | 'recorded'
  | 'other';

export type SavedRouteAssetFilter = 'all' | 'imported' | 'custom' | 'stitched' | 'bookmarked';

export type SavedRouteAssetAction = 'open' | 'navigate' | 'stitch';

export interface SavedRouteAssetCapabilities {
  canOpen: boolean;
  canNavigate: boolean;
  canStitch: boolean;
  canRename: boolean;
  canRemove: boolean;
}

export interface SavedRouteAsset {
  id: string;
  kind: SavedRouteAssetKind;
  title: string;
  subtitle: string | null;
  sourceLabel: string;
  badgeLabel: string;
  distanceMiles: number | null;
  pointCount: number | null;
  segmentCount: number | null;
  updatedAt: string;
  routeId: string | null;
  runId: string | null;
  favoriteId: string | null;
  sourceTrailId: string | null;
  planId: string | null;
  navigationPayload: NavigationHandoffPayload | null;
  removeLabel: string;
  duplicateCount: number;
  duplicateIndex: number;
  capabilities: SavedRouteAssetCapabilities;
}

export interface SavedRouteAssetCounts {
  all: number;
  imported: number;
  custom: number;
  stitched: number;
  bookmarked: number;
}

function formatSourceLabel(source: string | null | undefined): string {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized === 'custom') return 'CUSTOM BUILT';
  if (normalized === 'stitch') return 'STITCHED';
  if (normalized === 'gpx') return 'GPX IMPORT';
  if (normalized === 'kml' || normalized === 'kmz') return 'KML IMPORT';
  if (normalized === 'geojson' || normalized === 'json') return 'GEOJSON IMPORT';
  if (normalized === 'fit') return 'FIT IMPORT';
  if (normalized === 'explore') return 'SAVED TRAIL';
  if (normalized === 'trail') return 'TRAIL RUN';
  if (normalized === 'recorded') return 'RECORDED';
  return 'ROUTE ASSET';
}

function countRoutePoints(route: ImportedRoute): number {
  return route.segments.reduce((sum, segment) => sum + segment.points.length, 0);
}

function createRouteAsset(route: ImportedRoute): SavedRouteAsset {
  const isCustom = route.route_category === 'custom' || route.source_format === 'custom';
  return {
    id: `route:${route.id}`,
    kind: isCustom ? 'custom' : 'imported',
    title: route.name || (isCustom ? 'Custom Route' : 'Imported Route'),
    subtitle: route.description,
    sourceLabel: isCustom ? 'CUSTOM BUILT' : formatSourceLabel(route.source_format),
    badgeLabel: isCustom ? 'CUSTOM' : route.source_format.toUpperCase(),
    distanceMiles: route.total_distance_miles,
    pointCount: countRoutePoints(route),
    segmentCount: route.segment_count,
    updatedAt: route.updated_at,
    routeId: route.id,
    runId: route.linked_run_id ?? null,
    favoriteId: null,
    sourceTrailId: null,
    planId: null,
    navigationPayload: null,
    removeLabel: 'Delete',
    duplicateCount: 1,
    duplicateIndex: 1,
    capabilities: {
      canOpen: true,
      canNavigate: true,
      canStitch: true,
      canRename: true,
      canRemove: true,
    },
  };
}

function createRunAsset(run: ECSRun): SavedRouteAsset {
  const isStitched = String(run.source).toLowerCase() === 'stitch';
  const hasRouteGeometry = run.points.length > 1;
  return {
    id: `run:${run.id}`,
    kind: isStitched ? 'stitched' : String(run.source).toLowerCase() === 'custom' ? 'custom' : 'recorded',
    title: run.title || (isStitched ? 'Stitched Expedition' : 'Saved Run'),
    subtitle: isStitched
      ? 'Multi-route expedition chain'
      : run.source
        ? `${formatSourceLabel(run.source)} route asset`
        : null,
    sourceLabel: isStitched ? 'STITCHED ROUTE' : formatSourceLabel(run.source),
    badgeLabel: isStitched ? 'STITCH' : String(run.source || 'RUN').toUpperCase(),
    distanceMiles: Number.isFinite(run.stats.distance_miles) ? run.stats.distance_miles : null,
    pointCount: run.points.length,
    segmentCount: null,
    updatedAt: run.updated_at,
    routeId: null,
    runId: run.id,
    favoriteId: null,
    sourceTrailId: null,
    planId: null,
    navigationPayload: null,
    removeLabel: 'Delete',
    duplicateCount: 1,
    duplicateIndex: 1,
    capabilities: {
      canOpen: hasRouteGeometry,
      canNavigate: hasRouteGeometry,
      canStitch: hasRouteGeometry,
      canRename: true,
      canRemove: true,
    },
  };
}

function createFavoriteAsset(favorite: FavoriteTrailRecord): SavedRouteAsset {
  return {
    id: `favorite:${favorite.favoriteId}`,
    kind: 'bookmarked',
    title: favorite.title || 'Saved Trail',
    subtitle: favorite.subtitle || favorite.summary,
    sourceLabel: 'SAVED TRAIL',
    badgeLabel: 'SAVED',
    distanceMiles: favorite.trailLengthMiles,
    pointCount: favorite.trailGeometry?.length ?? null,
    segmentCount: null,
    updatedAt: favorite.savedAt,
    routeId: null,
    runId: null,
    favoriteId: favorite.favoriteId,
    sourceTrailId: favorite.sourceTrailId,
    planId: null,
    navigationPayload: favorite.navigationPayload,
    removeLabel: 'Remove',
    duplicateCount: 1,
    duplicateIndex: 1,
    capabilities: {
      canOpen: true,
      canNavigate: true,
      canStitch: false,
      canRename: false,
      canRemove: true,
    },
  };
}

function createPlanAsset(plan: FavoriteTrailPlan): SavedRouteAsset {
  const firstItem = plan.items[0] ?? null;
  return {
    id: `favorite-plan:${plan.planId}`,
    kind: 'bookmarked',
    title: plan.title || 'Saved Trail Stack',
    subtitle: `${plan.items.length} saved trail${plan.items.length === 1 ? '' : 's'} in sequence`,
    sourceLabel: 'SAVED TRAIL STACK',
    badgeLabel: 'STACK',
    distanceMiles: null,
    pointCount: plan.items.length,
    segmentCount: plan.items.length,
    updatedAt: plan.updatedAt,
    routeId: null,
    runId: null,
    favoriteId: null,
    sourceTrailId: null,
    planId: plan.planId,
    navigationPayload: firstItem?.navigationPayload ?? null,
    removeLabel: 'Remove',
    duplicateCount: 1,
    duplicateIndex: 1,
    capabilities: {
      canOpen: !!firstItem?.navigationPayload,
      canNavigate: !!firstItem?.navigationPayload,
      canStitch: false,
      canRename: true,
      canRemove: true,
    },
  };
}

function shouldShowRunAsSeparateAsset(run: ECSRun, linkedRunIds: Set<string>): boolean {
  if (linkedRunIds.has(run.id)) return false;
  return run.points.length > 1;
}

export function getSavedRouteAssets(): SavedRouteAsset[] {
  const routes = routeStore.getAll();
  const linkedRunIds = new Set(
    routes
      .map((route) => route.linked_run_id)
      .filter((runId): runId is string => !!runId),
  );
  const routeAssets = routes.map(createRouteAsset);
  const runAssets = runStore
    .getAll()
    .filter((run) => shouldShowRunAsSeparateAsset(run, linkedRunIds))
    .map(createRunAsset);
  const favoritesSnapshot = getExploreFavoritesSnapshot();
  const favoriteAssets = favoritesSnapshot.favorites.map(createFavoriteAsset);
  const planAssets = favoritesSnapshot.plans.map(createPlanAsset);

  return annotateDuplicateAssets([...routeAssets, ...runAssets, ...favoriteAssets, ...planAssets]).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function normalizeDuplicateTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+\(\d+\)$/g, '')
    .replace(/\s+copy$/g, '');
}

function duplicateSignature(asset: SavedRouteAsset): string {
  const distance = asset.distanceMiles == null ? 'unknown' : asset.distanceMiles.toFixed(2);
  return `${asset.kind}:${normalizeDuplicateTitle(asset.title)}:${distance}:${asset.pointCount ?? 'na'}`;
}

function annotateDuplicateAssets(assets: SavedRouteAsset[]): SavedRouteAsset[] {
  const groups = new Map<string, SavedRouteAsset[]>();
  for (const asset of assets) {
    const signature = duplicateSignature(asset);
    const group = groups.get(signature) ?? [];
    group.push(asset);
    groups.set(signature, group);
  }

  return assets.map((asset) => {
    const group = groups.get(duplicateSignature(asset)) ?? [asset];
    if (group.length < 2) return asset;
    const ordered = [...group].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    return {
      ...asset,
      duplicateCount: group.length,
      duplicateIndex: ordered.findIndex((entry) => entry.id === asset.id) + 1,
    };
  });
}

export function calculateSavedRouteAssetCounts(assets: SavedRouteAsset[]): SavedRouteAssetCounts {
  return assets.reduce<SavedRouteAssetCounts>(
    (counts, asset) => {
      counts.all += 1;
      if (asset.kind === 'imported') counts.imported += 1;
      if (asset.kind === 'custom') counts.custom += 1;
      if (asset.kind === 'stitched') counts.stitched += 1;
      if (asset.kind === 'bookmarked') counts.bookmarked += 1;
      return counts;
    },
    { all: 0, imported: 0, custom: 0, stitched: 0, bookmarked: 0 },
  );
}

function matchesFilter(asset: SavedRouteAsset, filter: SavedRouteAssetFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'bookmarked') return asset.kind === 'bookmarked';
  return asset.kind === filter;
}

export function filterSavedRouteAssets(
  assets: SavedRouteAsset[],
  filter: SavedRouteAssetFilter,
  query: string,
): SavedRouteAsset[] {
  const normalizedQuery = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!matchesFilter(asset, filter)) return false;
    if (!normalizedQuery) return true;
    return [asset.title, asset.subtitle, asset.sourceLabel, asset.badgeLabel]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function getSavedRouteAssetEmptyState(filter: SavedRouteAssetFilter): {
  title: string;
  message: string;
} {
  switch (filter) {
    case 'imported':
      return {
        title: 'No imported routes',
        message: 'Import a GPX, KML, or GeoJSON route to stage it from Saved Routes.',
      };
    case 'custom':
      return {
        title: 'No custom routes',
        message: 'Use Build Route on the map to trace and save your first user-built route.',
      };
    case 'stitched':
      return {
        title: 'No stitched routes',
        message: 'Use Stitch to combine saved route assets into an expedition chain.',
      };
    case 'bookmarked':
      return {
        title: 'No saved trails',
        message: 'Bookmark trails from Explore to bring them into this command center.',
      };
    default:
      return {
        title: 'No saved routes',
        message: 'Build, import, stitch, or bookmark a route to begin planning from here.',
      };
  }
}
