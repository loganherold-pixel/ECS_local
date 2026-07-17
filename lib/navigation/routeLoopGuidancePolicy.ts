function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function token(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function booleanDeclaration(value: unknown): boolean | null {
  if (value === true || token(value) === 'true') return true;
  if (value === false || token(value) === 'false') return false;
  return null;
}

/**
 * Canonical ECS loop-gating policy. A denial or conflicting non-loop route
 * declaration always wins; a loop requires an explicit loop route type or an
 * affirmative allow declaration from route/catalog metadata.
 */
export function routeAllowsLoopGuidance(value: unknown): boolean {
  const route = record(value);
  const routeMetadata = record(route.routeMetadata ?? route.route_metadata ?? route.metadata);
  const catalogVerifications = [
    record(route.catalogVerification ?? route.catalog_verification),
    record(routeMetadata.catalogVerification ?? routeMetadata.catalog_verification),
  ];
  const routeTypes = [
    route.routeType,
    route.route_type,
    routeMetadata.routeType,
    routeMetadata.route_type,
    routeMetadata.trailPackRouteType,
    routeMetadata.trail_pack_route_type,
    routeMetadata.routeShape,
    routeMetadata.route_shape,
    routeMetadata.guidanceRouteShape,
    routeMetadata.guidance_route_shape,
    ...catalogVerifications.flatMap((verification) => [verification.routeType, verification.route_type]),
  ].map(token).filter(Boolean);
  const allowDeclarations = [
    route.allowLoopGuidance,
    route.allow_loop_guidance,
    routeMetadata.allowLoopGuidance,
    routeMetadata.allow_loop_guidance,
    ...catalogVerifications.flatMap((verification) => [
      verification.allowLoopGuidance,
      verification.allow_loop_guidance,
    ]),
  ].map(booleanDeclaration).filter((entry): entry is boolean => entry != null);
  const isLoopType = (routeType: string) => (
    routeType === 'loop' || routeType === 'closed_loop' || routeType === 'loop_route'
  );

  if (allowDeclarations.includes(false)) return false;
  if (routeTypes.some((routeType) => !isLoopType(routeType))) return false;
  return routeTypes.some(isLoopType) || allowDeclarations.includes(true);
}
