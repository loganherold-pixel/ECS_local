/**
 * Pure state contract for ordering Navigate map surfaces.
 * React state, dismissal policy, and visible containers remain owned by Navigate.
 */
export type NavigateTopPopup =
  | 'tools'
  | 'importRoute'
  | 'intel'
  | 'pinDrawer'
  | 'trail'
  | 'savedRoutes'
  | 'preflightPacket'
  | 'stitch'
  | 'offlineCache'
  | 'storageDashboard'
  | 'pinEditor'
  | 'campScout'
  | 'safeEndpoint'
  | 'recommendCampsite'
  | 'recommendRoute'
  | null;

export type NavigateToolsChildPopup = Exclude<
  NavigateTopPopup,
  'tools' | 'pinDrawer' | 'storageDashboard' | 'pinEditor' | null
>;

export type NavigateSurfaceLayerId =
  | 'mapSelection'
  | 'mapPointActions'
  | 'campLayers'
  | 'tools'
  | 'topPopup'
  | 'dispatchSelection';

export function raiseNavigateSurfaceLayer(
  stack: NavigateSurfaceLayerId[],
  layer: NavigateSurfaceLayerId,
): NavigateSurfaceLayerId[] {
  if (stack[stack.length - 1] === layer) return stack;
  return [...stack.filter((item) => item !== layer), layer];
}

export function removeNavigateSurfaceLayer(
  stack: NavigateSurfaceLayerId[],
  layer: NavigateSurfaceLayerId,
): NavigateSurfaceLayerId[] {
  if (!stack.includes(layer)) return stack;
  return stack.filter((item) => item !== layer);
}

export function isToolsChildPopup(popup: NavigateTopPopup): popup is NavigateToolsChildPopup {
  return (
    popup === 'importRoute' ||
    popup === 'intel' ||
    popup === 'trail' ||
    popup === 'savedRoutes' ||
    popup === 'preflightPacket' ||
    popup === 'stitch' ||
    popup === 'offlineCache' ||
    popup === 'campScout' ||
    popup === 'safeEndpoint' ||
    popup === 'recommendCampsite' ||
    popup === 'recommendRoute'
  );
}

