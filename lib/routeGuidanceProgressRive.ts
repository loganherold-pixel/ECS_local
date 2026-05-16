export const ROUTE_GUIDANCE_PROGRESS_STATE_MACHINE = 'RouteGuidanceState';
export const ROUTE_GUIDANCE_PROGRESS_VIEW_MODEL = 'RouteGuidanceVM';

export type RouteGuidanceProgressRiveRuntimeValues = {
  routeProgress: number;
  isActive: boolean;
  isOffline: boolean;
};

function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function resolveRouteGuidanceProgressRiveRuntime(input: {
  progressPercent: number | null | undefined;
  isActive: boolean;
  isOffline?: boolean | null;
}): RouteGuidanceProgressRiveRuntimeValues {
  const isActive = Boolean(input.isActive);

  return {
    routeProgress: isActive ? clampProgressPercent(Number(input.progressPercent ?? 0)) : 0,
    isActive,
    isOffline: Boolean(input.isOffline),
  };
}
