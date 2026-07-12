export type RouteChangeImpactFeatureFlags = {
  routeChangeImpactPreviewEnabled?: boolean | null;
};

function environmentFlag(): boolean | null {
  const value = String(process.env.EXPO_PUBLIC_ECS_ROUTE_CHANGE_IMPACT_PREVIEW ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(value)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(value)) return false;
  return null;
}

/** Current user-facing extension: enabled by default, with an explicit fail-closed rollout override. */
export function isRouteChangeImpactPreviewEnabled(
  flags?: RouteChangeImpactFeatureFlags | null,
): boolean {
  if (typeof flags?.routeChangeImpactPreviewEnabled === 'boolean') {
    return flags.routeChangeImpactPreviewEnabled;
  }
  return environmentFlag() ?? true;
}
