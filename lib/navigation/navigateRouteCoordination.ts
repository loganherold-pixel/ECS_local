import type {
  NavigateRouteSessionHydrationStatus,
  NavigateRouteSessionSnapshot,
} from '../navigateRouteSessionStore';

export interface NavigateRouteCoordinationControlInput {
  missionCommandEnabled: boolean;
  hydrationStatus: NavigateRouteSessionHydrationStatus;
  routeSession: Pick<NavigateRouteSessionSnapshot, 'routeId' | 'lifecycle' | 'routePoints'>;
  inFlight: boolean;
  hasActiveConvoy: boolean;
}

export interface NavigateRouteCoordinationControl {
  enabled: boolean;
  busy: boolean;
  badgeLabel: 'MISSION' | 'OPENING' | 'RESTORE' | 'ROUTE' | 'SOLO' | 'CONVOY';
  subtitle: string;
  disabledReason: string | null;
}

/**
 * Presentation-only eligibility for the Navigate Tools action. Mission Command
 * supports personal route coordination, so convoy membership changes the copy,
 * not whether a valid canonical route can be opened.
 */
export function resolveNavigateRouteCoordinationControl(
  input: NavigateRouteCoordinationControlInput,
): NavigateRouteCoordinationControl {
  if (!input.missionCommandEnabled) {
    const disabledReason = 'Mission Command is unavailable in this rollout.';
    return { enabled: false, busy: false, badgeLabel: 'MISSION', subtitle: disabledReason, disabledReason };
  }

  if (input.inFlight) {
    const disabledReason = 'Opening Route Coordination in Mission Command.';
    return { enabled: false, busy: true, badgeLabel: 'OPENING', subtitle: disabledReason, disabledReason };
  }

  if (input.hydrationStatus === 'idle' || input.hydrationStatus === 'loading') {
    const disabledReason = 'Restoring the active route session.';
    return { enabled: false, busy: false, badgeLabel: 'RESTORE', subtitle: disabledReason, disabledReason };
  }

  if (!input.routeSession.routeId || input.routeSession.lifecycle === 'inactive') {
    const disabledReason = 'Stage or start a route first.';
    return { enabled: false, busy: false, badgeLabel: 'ROUTE', subtitle: disabledReason, disabledReason };
  }

  if (input.routeSession.routePoints.length < 2) {
    const disabledReason = 'Route geometry needs at least two valid points.';
    return { enabled: false, busy: false, badgeLabel: 'ROUTE', subtitle: disabledReason, disabledReason };
  }

  return {
    enabled: true,
    busy: false,
    badgeLabel: input.hasActiveConvoy ? 'CONVOY' : 'SOLO',
    subtitle: input.hasActiveConvoy
      ? 'Coordinate the staged route with Mission Command.'
      : 'Coordinate this personal route in Mission Command.',
    disabledReason: null,
  };
}
