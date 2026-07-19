import {
  getHiddenGemRecommendations,
  getPopularTrailRecommendations,
} from './discoverCategoryEngine';
import type { ExpeditionOpportunity } from './discoverEngine';
import type { CompatibilityResult } from './rigCompatibilityEngine';
import { buildExploreNavigationPayload } from './navigationHandoffStore';
import { getExploreRoutePreviewRoutePoints } from './exploreRoutePreview';
import type { AIGeneratedRoute } from './aiRouteTypes';
import { simplifyRouteGeometryForPreview } from './explore/exploreMapPreviewOptimization';
import {
  normalizeExploreDiscoveryItems,
  routeWithExploreDiscoveryProvenance,
  type ExploreDiscoverySourceKind,
} from './explore/exploreDiscoveryItem';
import { normalizeRouteSearchResultLimit } from './explore/routeSearchResultPolicy';

export const EXPLORE_ROUTES_AI_CATEGORY = 'all-drivable-trails';

export type ExploreRouteOverlayCategory =
  | 'hidden_gem'
  | 'popular_trail'
  | 'trail_pack'
  | 'favorite'
  | 'ecs_route_idea';

export type ExploreRouteOverlayCoordinate = {
  latitude: number;
  longitude: number;
};

export type ExploreRouteOverlaySegment = {
  id: string;
  name: string;
  category: ExploreRouteOverlayCategory;
  categoryLabel: string;
  kind: 'explore_route';
  coordinates: ExploreRouteOverlayCoordinate[];
  color: string;
  route: ExpeditionOpportunity;
  compatResult?: CompatibilityResult | null;
};

export type ExploreRouteOverlayBuildResult = {
  segments: ExploreRouteOverlaySegment[];
  candidateCount: number;
  skippedMissingGeometryCount: number;
  cappedCount: number;
};

type ExploreRouteCandidate = {
  route: ExpeditionOpportunity;
  category: ExploreRouteOverlayCategory;
  compatResult?: CompatibilityResult | null;
};

const CATEGORY_COLORS: Record<ExploreRouteOverlayCategory, string> = {
  hidden_gem: '#F2C24D',
  popular_trail: '#66BB6A',
  trail_pack: '#A48CFF',
  favorite: '#F6A35D',
  ecs_route_idea: '#65D4FF',
};

const CATEGORY_LABELS: Record<ExploreRouteOverlayCategory, string> = {
  hidden_gem: 'Hidden Gem',
  popular_trail: 'Popular Trail',
  trail_pack: 'Trail Pack',
  favorite: 'Favorite',
  ecs_route_idea: 'ECS Route Idea',
};

const EXPLORE_ROUTE_OVERLAY_PREVIEW_MAX_POINTS = 48;

function routeIdentity(route: ExpeditionOpportunity): string {
  const routeWithSource = route as ExpeditionOpportunity & {
    sourceMetadata?: { identityKey?: unknown };
  };
  const sourceIdentity =
    route.routeMetadata && typeof route.routeMetadata === 'object'
      ? (route.routeMetadata as Record<string, unknown>).identityKey
      : null;
  const candidate =
    sourceIdentity ??
    routeWithSource.sourceMetadata?.identityKey ??
    route.id ??
    `${route.name}:${route.region}`;

  return String(candidate).trim().toLowerCase();
}

function routeMetric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compareExploreRouteCandidates(
  left: ExploreRouteCandidate,
  right: ExploreRouteCandidate,
): number {
  const leftMetadata = left.route.routeMetadata && typeof left.route.routeMetadata === 'object'
    ? left.route.routeMetadata as Record<string, unknown>
    : {};
  const rightMetadata = right.route.routeMetadata && typeof right.route.routeMetadata === 'object'
    ? right.route.routeMetadata as Record<string, unknown>
    : {};
  const featuredDelta =
    routeMetric(rightMetadata.featuredRouteScore, 0) -
    routeMetric(leftMetadata.featuredRouteScore, 0);
  if (featuredDelta !== 0) return featuredDelta;
  const matchDelta =
    routeMetric(right.route.matchScore, 0) - routeMetric(left.route.matchScore, 0);
  if (matchDelta !== 0) return matchDelta;
  const compatibilityDelta =
    routeMetric(right.route.rigCompatibility, 0) - routeMetric(left.route.rigCompatibility, 0);
  if (compatibilityDelta !== 0) return compatibilityDelta;
  const distanceDelta =
    routeMetric(left.route.distanceFromUserMiles, Number.MAX_SAFE_INTEGER) -
    routeMetric(right.route.distanceFromUserMiles, Number.MAX_SAFE_INTEGER);
  if (distanceDelta !== 0) return distanceDelta;
  return routeIdentity(left.route).localeCompare(routeIdentity(right.route));
}

function toOverlaySegment(candidate: ExploreRouteCandidate): ExploreRouteOverlaySegment | null {
  const payload = buildExploreNavigationPayload(candidate.route);
  const coordinates = simplifyRouteGeometryForPreview(
    getExploreRoutePreviewRoutePoints(payload)
      .map((point) => ({
        latitude: Number(point.lat),
        longitude: Number(point.lng),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          Math.abs(point.latitude) <= 90 &&
          Math.abs(point.longitude) <= 180,
      ),
    { maxPoints: EXPLORE_ROUTE_OVERLAY_PREVIEW_MAX_POINTS },
  )
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));

  if (coordinates.length < 2) return null;

  return {
    id: `explore-route:${candidate.category}:${routeIdentity(candidate.route)}`,
    name: candidate.route.name || payload.title || 'Explore route',
    category: candidate.category,
    categoryLabel: CATEGORY_LABELS[candidate.category],
    kind: 'explore_route',
    coordinates,
    color: CATEGORY_COLORS[candidate.category],
    route: candidate.route,
    compatResult: candidate.compatResult ?? null,
  };
}

export function buildExploreRouteOverlaySegments(args: {
  opportunities: ExpeditionOpportunity[];
  compatibilityResults: Map<string, CompatibilityResult>;
  aiRoutes?: AIGeneratedRoute[];
  radiusMiles: number;
  categoryLimit?: number;
}): ExploreRouteOverlayBuildResult {
  const categoryLimit = normalizeRouteSearchResultLimit(args.categoryLimit);
  const hiddenGemRoutes = getHiddenGemRecommendations(args.opportunities, args.compatibilityResults, {
    radiusMiles: args.radiusMiles,
    pageSize: categoryLimit,
  }).items.map((item) => item.route);
  const popularTrailRoutes = getPopularTrailRecommendations(args.opportunities, args.compatibilityResults, {
    radiusMiles: args.radiusMiles,
  }).slice(0, categoryLimit);
  const aiRoutes = args.aiRoutes ?? [];

  return buildExploreRouteOverlaySegmentsFromRoutes({
    hiddenGemRoutes,
    popularTrailRoutes,
    ecsRouteIdeaRoutes: aiRoutes,
    compatibilityResults: args.compatibilityResults,
    maxRenderedRoutes: categoryLimit,
  });
}

export function buildExploreRouteOverlaySegmentsFromRoutes(args: {
  hiddenGemRoutes?: ExpeditionOpportunity[];
  popularTrailRoutes?: ExpeditionOpportunity[];
  trailPackRoutes?: ExpeditionOpportunity[];
  favoriteRoutes?: ExpeditionOpportunity[];
  ecsRouteIdeaRoutes?: ExpeditionOpportunity[];
  compatibilityResults?: Map<string, CompatibilityResult>;
  maxRenderedRoutes?: number;
}): ExploreRouteOverlayBuildResult {
  const maxRenderedRoutes = normalizeRouteSearchResultLimit(args.maxRenderedRoutes);
  const toCandidate = (
    route: ExpeditionOpportunity,
    category: ExploreRouteOverlayCategory,
  ): ExploreRouteCandidate => ({
    route,
    category,
    compatResult: args.compatibilityResults?.get(route.id) ?? null,
  });
  const candidates: ExploreRouteCandidate[] = [
    ...(args.hiddenGemRoutes ?? []).map((route) => toCandidate(route, 'hidden_gem')),
    ...(args.popularTrailRoutes ?? []).map((route) => toCandidate(route, 'popular_trail')),
    ...(args.trailPackRoutes ?? []).map((route) => toCandidate(route, 'trail_pack')),
    ...(args.favoriteRoutes ?? []).map((route) => toCandidate(route, 'favorite')),
    ...(args.ecsRouteIdeaRoutes ?? []).map((route) => toCandidate(route, 'ecs_route_idea')),
  ];
  const sourceKindForCategory = (
    category: ExploreRouteOverlayCategory,
  ): ExploreDiscoverySourceKind => {
    switch (category) {
      case 'trail_pack': return 'trail_pack';
      case 'favorite': return 'saved_built';
      case 'ecs_route_idea': return 'ecs_idea';
      case 'hidden_gem':
      case 'popular_trail':
      default:
        return 'hidden_gem';
    }
  };
  const categoryForSourceKind = (
    sourceKind: ExploreDiscoverySourceKind,
    sourceId: string,
  ): ExploreRouteOverlayCategory => {
    const exactCandidate = candidates.find((candidate) =>
      candidate.route.id === sourceId && sourceKindForCategory(candidate.category) === sourceKind,
    );
    if (exactCandidate) return exactCandidate.category;
    switch (sourceKind) {
      case 'trail_pack': return 'trail_pack';
      case 'saved_built':
      case 'imported_stitched':
        return 'favorite';
      case 'ecs_idea': return 'ecs_route_idea';
      case 'hidden_gem':
      default:
        return 'hidden_gem';
    }
  };
  const normalizedCandidates = normalizeExploreDiscoveryItems(
    candidates.map((candidate) => ({
      route: candidate.route,
      sourceKind: sourceKindForCategory(candidate.category),
    })),
  ).map<ExploreRouteCandidate>((item) => ({
    route: routeWithExploreDiscoveryProvenance(item),
    category: categoryForSourceKind(item.primarySource.sourceKind, item.primarySource.sourceId),
    compatResult:
      args.compatibilityResults?.get(item.route.id) ??
      args.compatibilityResults?.get(item.primarySource.sourceId) ??
      null,
  })).sort(compareExploreRouteCandidates);
  const seen = new Set<string>();
  const segments: ExploreRouteOverlaySegment[] = [];
  let skippedMissingGeometryCount = 0;
  let cappedCount = 0;

  normalizedCandidates.forEach((candidate) => {
    const identity = routeIdentity(candidate.route);
    if (seen.has(identity)) return;
    seen.add(identity);

    const segment = toOverlaySegment(candidate);
    if (!segment) {
      skippedMissingGeometryCount += 1;
      return;
    }
    if (segments.length >= maxRenderedRoutes) {
      cappedCount += 1;
      return;
    }
    segments.push(segment);
  });

  return {
    segments,
    candidateCount: normalizedCandidates.length,
    skippedMissingGeometryCount,
    cappedCount,
  };
}

export function buildExploreRouteOverlaySignature(segments: ExploreRouteOverlaySegment[]): string {
  return segments
    .map((segment) => `${segment.id}:${segment.coordinates.length}`)
    .sort()
    .join('|');
}
