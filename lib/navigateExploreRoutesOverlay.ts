import {
  getHiddenGemRecommendations,
  getPopularTrailRecommendations,
} from './discoverCategoryEngine';
import type { ExpeditionOpportunity } from './discoverEngine';
import type { CompatibilityResult } from './rigCompatibilityEngine';
import { buildExploreNavigationPayload } from './navigationHandoffStore';
import type { AIGeneratedRoute } from './aiRouteTypes';

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
};

const CATEGORY_COLORS: Record<ExploreRouteOverlayCategory, string> = {
  hidden_gem: '#65D4FF',
  popular_trail: '#65D4FF',
  trail_pack: '#65D4FF',
  favorite: '#65D4FF',
  ecs_route_idea: '#65D4FF',
};

const CATEGORY_LABELS: Record<ExploreRouteOverlayCategory, string> = {
  hidden_gem: 'Hidden Gem',
  popular_trail: 'Popular Trail',
  trail_pack: 'Trail Pack',
  favorite: 'Favorite',
  ecs_route_idea: 'ECS Route Idea',
};

const DEFAULT_CATEGORY_LIMIT = 8;
const DEFAULT_TOTAL_LIMIT = 60;

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

function toOverlaySegment(candidate: ExploreRouteCandidate): ExploreRouteOverlaySegment | null {
  const payload = buildExploreNavigationPayload(candidate.route);
  const coordinates = payload.trailGeometry
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
    );

  if (coordinates.length < 2) return null;

  return {
    id: `explore-route:${candidate.category}:${routeIdentity(candidate.route)}`,
    name: candidate.route.name || payload.title || 'Explore route',
    category: candidate.category,
    categoryLabel: CATEGORY_LABELS[candidate.category],
    kind: 'explore_route',
    coordinates,
    color: CATEGORY_COLORS[candidate.category],
  };
}

export function buildExploreRouteOverlaySegments(args: {
  opportunities: ExpeditionOpportunity[];
  compatibilityResults: Map<string, CompatibilityResult>;
  aiRoutes?: AIGeneratedRoute[];
  radiusMiles: number;
  categoryLimit?: number;
}): ExploreRouteOverlayBuildResult {
  const categoryLimit = Math.max(1, args.categoryLimit ?? DEFAULT_CATEGORY_LIMIT);
  const hiddenGemRoutes = getHiddenGemRecommendations(args.opportunities, args.compatibilityResults, {
    radiusMiles: args.radiusMiles,
    pageSize: categoryLimit,
  }).items.map((item) => item.route);
  const popularTrailRoutes = getPopularTrailRecommendations(args.opportunities, args.compatibilityResults, {
    radiusMiles: args.radiusMiles,
  }).slice(0, categoryLimit);
  const aiRoutes = (args.aiRoutes ?? []).slice(0, categoryLimit);

  return buildExploreRouteOverlaySegmentsFromRoutes({
    hiddenGemRoutes,
    popularTrailRoutes,
    ecsRouteIdeaRoutes: aiRoutes,
    maxRenderedRoutes: categoryLimit * 3,
  });
}

export function buildExploreRouteOverlaySegmentsFromRoutes(args: {
  hiddenGemRoutes?: ExpeditionOpportunity[];
  popularTrailRoutes?: ExpeditionOpportunity[];
  trailPackRoutes?: ExpeditionOpportunity[];
  favoriteRoutes?: ExpeditionOpportunity[];
  ecsRouteIdeaRoutes?: ExpeditionOpportunity[];
  maxRenderedRoutes?: number;
}): ExploreRouteOverlayBuildResult {
  const maxRenderedRoutes = Math.max(1, args.maxRenderedRoutes ?? DEFAULT_TOTAL_LIMIT);
  const candidates: ExploreRouteCandidate[] = [
    ...(args.hiddenGemRoutes ?? []).map((route) => ({ route, category: 'hidden_gem' as const })),
    ...(args.popularTrailRoutes ?? []).map((route) => ({ route, category: 'popular_trail' as const })),
    ...(args.trailPackRoutes ?? []).map((route) => ({ route, category: 'trail_pack' as const })),
    ...(args.favoriteRoutes ?? []).map((route) => ({ route, category: 'favorite' as const })),
    ...(args.ecsRouteIdeaRoutes ?? []).map((route) => ({ route, category: 'ecs_route_idea' as const })),
  ];
  const seen = new Set<string>();
  const segments: ExploreRouteOverlaySegment[] = [];
  let skippedMissingGeometryCount = 0;
  let cappedCount = 0;

  candidates.forEach((candidate) => {
    if (segments.length >= maxRenderedRoutes) {
      cappedCount += 1;
      return;
    }

    const identity = routeIdentity(candidate.route);
    if (seen.has(identity)) return;
    seen.add(identity);

    const segment = toOverlaySegment(candidate);
    if (!segment) {
      skippedMissingGeometryCount += 1;
      return;
    }
    segments.push(segment);
  });

  return {
    segments,
    candidateCount: candidates.length,
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
