export type ExploreFeatureId =
  | 'suggested_routes'
  | 'route_filters'
  | 'trip_builder'
  | 'offline_prep_pack';

export type ExploreFeatureCategory = 'routes' | 'planning';

export type ExploreFeatureStatus = 'live' | 'placeholder';

export type ExploreFeatureFlagKey =
  | 'EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER'
  | 'EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK';

export type ExploreFeatureDefinition = {
  id: ExploreFeatureId;
  title: string;
  description: string;
  icon: string;
  category: ExploreFeatureCategory;
  order: number;
  enabledByDefault: boolean;
  enabled: boolean;
  status: ExploreFeatureStatus;
  featureFlagKey?: ExploreFeatureFlagKey;
  route?: string;
};

export type ExploreFeatureRegistryOptions = {
  env?: Record<string, string | undefined>;
};

export const EXPLORE_FEATURE_CATEGORY_STYLES: Record<
  ExploreFeatureCategory,
  { label: string; accentColor: string; description: string }
> = {
  routes: {
    label: 'Routes',
    accentColor: '#66BB6A',
    description: 'Route discovery, scoring, and filter controls.',
  },
  planning: {
    label: 'Planning',
    accentColor: '#E6B84C',
    description: 'Trip planning and offline readiness workflows for Explore.',
  },
};

const EXPLORE_FEATURE_DEFINITIONS: Omit<ExploreFeatureDefinition, 'enabled'>[] = [
  {
    id: 'suggested_routes',
    title: 'Suggested Routes',
    description: 'Open curated Explore route suggestions without changing route readiness scoring.',
    icon: 'trail-sign-outline',
    category: 'routes',
    order: 10,
    enabledByDefault: true,
    status: 'live',
  },
  {
    id: 'route_filters',
    title: 'Route Filters',
    description: 'Tune radius and route refinements for the current Explore result set.',
    icon: 'filter-outline',
    category: 'routes',
    order: 20,
    enabledByDefault: true,
    status: 'live',
  },
  {
    id: 'trip_builder',
    title: 'Trip Builder',
    description: 'Turn a selected route into a day trip, overnight route, or expedition-style plan.',
    icon: 'git-merge-outline',
    category: 'planning',
    order: 30,
    enabledByDefault: true,
    status: 'live',
    featureFlagKey: 'EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER',
    route: '/explore-trip-builder',
  },
  {
    id: 'offline_prep_pack',
    title: 'Offline Prep Pack',
    description: 'Save route essentials for low-service travel.',
    icon: 'download-outline',
    category: 'planning',
    order: 40,
    enabledByDefault: true,
    status: 'live',
    featureFlagKey: 'EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK',
    route: '/explore-offline-prep-pack',
  },
];

function getRuntimeEnv(): Record<string, string | undefined> {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  } catch {
    return {};
  }
}

function readFlagValue(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

export function resolveExploreFeatureEnabled(
  feature: Pick<ExploreFeatureDefinition, 'enabledByDefault' | 'featureFlagKey'>,
  options: ExploreFeatureRegistryOptions = {},
): boolean {
  if (!feature.featureFlagKey) return feature.enabledByDefault;
  const env = options.env ?? getRuntimeEnv();
  return readFlagValue(env[feature.featureFlagKey]) ?? feature.enabledByDefault;
}

export function getExploreFeatureRegistry(
  options: ExploreFeatureRegistryOptions = {},
): ExploreFeatureDefinition[] {
  return EXPLORE_FEATURE_DEFINITIONS
    .map((feature) => ({
      ...feature,
      enabled: resolveExploreFeatureEnabled(feature, options),
    }))
    .sort((left, right) => left.order - right.order);
}

export function getVisibleExploreFeatures(
  options: ExploreFeatureRegistryOptions = {},
): ExploreFeatureDefinition[] {
  return getExploreFeatureRegistry(options).filter((feature) => feature.enabled && feature.id !== 'route_filters');
}

export function getExploreFeatureById(
  id: ExploreFeatureId,
  options: ExploreFeatureRegistryOptions = {},
): ExploreFeatureDefinition | null {
  return getExploreFeatureRegistry(options).find((feature) => feature.id === id) ?? null;
}
