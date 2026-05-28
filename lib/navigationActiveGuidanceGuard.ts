import type { NavigateRouteSessionSnapshot } from './navigateRouteSessionStore';
import { navigateRouteSessionStore } from './navigateRouteSessionStore';
import type { NavigationHandoffPayload } from './navigationHandoffStore';

export const ACTIVE_GUIDANCE_REPLACEMENT_CONFIRMED_AT =
  'activeGuidanceReplacementConfirmedAt';
export const ACTIVE_GUIDANCE_REPLACED_ROUTE_ID = 'activeGuidanceReplacedRouteId';
export const ACTIVE_GUIDANCE_REPLACED_ROUTE_TITLE = 'activeGuidanceReplacedRouteTitle';

export function isActiveGuidanceSnapshot(
  snapshot: NavigateRouteSessionSnapshot | null | undefined,
): snapshot is NavigateRouteSessionSnapshot {
  return snapshot?.lifecycle === 'active' && !!snapshot.routeId;
}

export async function getActiveGuidanceSnapshot(): Promise<NavigateRouteSessionSnapshot | null> {
  const snapshot = await navigateRouteSessionStore.hydrateFromPersistence();
  return isActiveGuidanceSnapshot(snapshot) ? snapshot : null;
}

export function isNavigationHandoffForActiveGuidance(
  payload: Pick<NavigationHandoffPayload, 'id'> | null | undefined,
  snapshot: NavigateRouteSessionSnapshot | null | undefined,
): boolean {
  if (!payload || !isActiveGuidanceSnapshot(snapshot)) return false;
  return payload.id === snapshot.routeId || payload.id === snapshot.sessionId;
}

export function hasActiveGuidanceReplacementConfirmation(
  payload: Pick<NavigationHandoffPayload, 'routeMetadata'> | null | undefined,
): boolean {
  const metadata = payload?.routeMetadata;
  if (!metadata || typeof metadata !== 'object') return false;
  const value = (metadata as Record<string, unknown>)[ACTIVE_GUIDANCE_REPLACEMENT_CONFIRMED_AT];
  return typeof value === 'string' && value.trim().length > 0;
}

export function markNavigationHandoffActiveGuidanceReplacementConfirmed(
  payload: NavigationHandoffPayload,
  snapshot: NavigateRouteSessionSnapshot,
): NavigationHandoffPayload {
  return {
    ...payload,
    routeMetadata: {
      ...(payload.routeMetadata ?? {}),
      [ACTIVE_GUIDANCE_REPLACEMENT_CONFIRMED_AT]: new Date().toISOString(),
      [ACTIVE_GUIDANCE_REPLACED_ROUTE_ID]: snapshot.routeId,
      [ACTIVE_GUIDANCE_REPLACED_ROUTE_TITLE]: snapshot.routeTitle,
    },
  };
}

export function shouldProtectActiveGuidanceFromHandoff(
  payload: NavigationHandoffPayload,
  snapshot: NavigateRouteSessionSnapshot | null | undefined,
): boolean {
  return (
    isActiveGuidanceSnapshot(snapshot) &&
    !isNavigationHandoffForActiveGuidance(payload, snapshot) &&
    !hasActiveGuidanceReplacementConfirmation(payload)
  );
}
