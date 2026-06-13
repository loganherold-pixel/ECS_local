export type RouteContextFeatureFlag =
  | 'ecs.routeContextEngine.enabled'
  | 'ecs.routeContextEngine.prefetchOnTrailSelect'
  | 'ecs.routeContextEngine.trailheadAnchoredSupplyChain'
  | 'ecs.routeContextEngine.enableCampCandidates'
  | 'ecs.routeContextEngine.enableBailoutCandidates'
  | 'ecs.routeContextEngine.routeConfidenceTimeline'
  | 'ecs.routeContextEngine.debugLogging';

export type RouteContextFeatureFlags = Record<RouteContextFeatureFlag, boolean>;

export const DEFAULT_ROUTE_CONTEXT_FEATURE_FLAGS: RouteContextFeatureFlags = {
  'ecs.routeContextEngine.enabled': false,
  'ecs.routeContextEngine.prefetchOnTrailSelect': false,
  'ecs.routeContextEngine.trailheadAnchoredSupplyChain': false,
  'ecs.routeContextEngine.enableCampCandidates': false,
  'ecs.routeContextEngine.enableBailoutCandidates': false,
  'ecs.routeContextEngine.routeConfidenceTimeline': false,
  'ecs.routeContextEngine.debugLogging': false,
};

export const ROUTE_CONTEXT_SUPPLY_SEARCH_RADIUS_TIERS_METERS = [8_000, 25_000, 60_000] as const;

export const ROUTE_CONTEXT_SUPPLY_SEARCH_LIMIT_PER_TIER = 8;

export const ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY = 5;

export const ROUTE_CONTEXT_SUPPLY_PLAN_SCORING_THRESHOLDS = {
  maxPreferredRefuelDistanceToTrailheadMeters: 8_000,
  maxPreferredResupplyDistanceToRefuelMeters: 1_500,
  maxPreferredTotalDetourMeters: 15_000,
  maxPreferredTotalDetourSeconds: 20 * 60,
  ruralFallbackExpansionEnabled: true,
  ruralFallbackMaxRadiusMeters: 60_000,
} as const;

export const ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS = {
  excellent: 250,
  strong: 500,
  acceptable: 1_500,
  excessive: 5_000,
} as const;

export const ROUTE_CONTEXT_RESUPPLY_REFUEL_SEARCH_RADIUS_TIERS_METERS = [
  ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.strong,
  ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.acceptable,
  ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.excessive,
] as const;

export const ROUTE_CONTEXT_RESUPPLY_RURAL_FALLBACK_RADIUS_TIERS_METERS = [12_000, 25_000] as const;

export const ROUTE_CONTEXT_CAMP_CANDIDATE_CORRIDOR_METERS = 8_000;

export const ROUTE_CONTEXT_CAMP_CANDIDATE_LIMIT = 8;

export const ROUTE_CONTEXT_BAILOUT_CANDIDATE_CORRIDOR_METERS = 12_000;

export const ROUTE_CONTEXT_BAILOUT_CANDIDATE_LIMIT = 10;

export const ROUTE_CONTEXT_FRESHNESS_TTLS_MS = {
  trailheadAnchor: 24 * 60 * 60 * 1000,
  supplyCandidates: 20 * 60 * 1000,
  routeGeometryWithOrigin: 30 * 60 * 1000,
  routeGeometryTrailOnly: 6 * 60 * 60 * 1000,
  providerErrorRetry: 2 * 60 * 1000,
  defaultContext: 15 * 60 * 1000,
} as const;

export type RouteContextFeatureFlagOverrides =
  Partial<RouteContextFeatureFlags> & {
    ecs?: {
      routeContextEngine?: {
        enabled?: boolean;
        prefetchOnTrailSelect?: boolean;
        trailheadAnchoredSupplyChain?: boolean;
        enableCampCandidates?: boolean;
        enableBailoutCandidates?: boolean;
        routeConfidenceTimeline?: boolean;
        debugLogging?: boolean;
      };
    };
  };

const NESTED_FLAG_TO_DOT_FLAG: Record<
  keyof NonNullable<NonNullable<RouteContextFeatureFlagOverrides['ecs']>['routeContextEngine']>,
  RouteContextFeatureFlag
> = {
  enabled: 'ecs.routeContextEngine.enabled',
  prefetchOnTrailSelect: 'ecs.routeContextEngine.prefetchOnTrailSelect',
  trailheadAnchoredSupplyChain: 'ecs.routeContextEngine.trailheadAnchoredSupplyChain',
  enableCampCandidates: 'ecs.routeContextEngine.enableCampCandidates',
  enableBailoutCandidates: 'ecs.routeContextEngine.enableBailoutCandidates',
  routeConfidenceTimeline: 'ecs.routeContextEngine.routeConfidenceTimeline',
  debugLogging: 'ecs.routeContextEngine.debugLogging',
};

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function resolveRouteContextFeatureFlags(
  overrides: RouteContextFeatureFlagOverrides = {},
): RouteContextFeatureFlags {
  const resolved: RouteContextFeatureFlags = {
    ...DEFAULT_ROUTE_CONTEXT_FEATURE_FLAGS,
  };

  (Object.keys(DEFAULT_ROUTE_CONTEXT_FEATURE_FLAGS) as RouteContextFeatureFlag[]).forEach((flag) => {
    const next = booleanOrUndefined(overrides[flag]);
    if (next !== undefined) resolved[flag] = next;
  });

  const nested = overrides.ecs?.routeContextEngine;
  if (nested) {
    (Object.keys(NESTED_FLAG_TO_DOT_FLAG) as Array<keyof typeof NESTED_FLAG_TO_DOT_FLAG>).forEach((key) => {
      const next = booleanOrUndefined(nested[key]);
      if (next !== undefined) resolved[NESTED_FLAG_TO_DOT_FLAG[key]] = next;
    });
  }

  if (!resolved['ecs.routeContextEngine.enabled']) {
    resolved['ecs.routeContextEngine.prefetchOnTrailSelect'] = false;
    resolved['ecs.routeContextEngine.trailheadAnchoredSupplyChain'] = false;
    resolved['ecs.routeContextEngine.enableCampCandidates'] = false;
    resolved['ecs.routeContextEngine.enableBailoutCandidates'] = false;
    resolved['ecs.routeContextEngine.routeConfidenceTimeline'] = false;
  }

  return resolved;
}

export function isRouteContextFeatureEnabled(
  feature: RouteContextFeatureFlag,
  overrides: RouteContextFeatureFlagOverrides = {},
): boolean {
  return resolveRouteContextFeatureFlags(overrides)[feature] === true;
}

export function isRouteContextEngineEnabled(
  overrides: RouteContextFeatureFlagOverrides = {},
): boolean {
  return isRouteContextFeatureEnabled('ecs.routeContextEngine.enabled', overrides);
}
