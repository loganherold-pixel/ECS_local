import { clearExplorePlanningRouteContext } from '../explore/explorePlanningRouteContextStore';
import { clearTripBuilderPlanState } from '../tripBuilder/tripBuilderPlanStore';
import { clearTripBuilderRouteHandoff } from '../tripBuilder/tripBuilderRouteHandoffStore';

export type AuthExploreTripStateCleanupReason =
  | 'explicit_sign_out'
  | 'provider_signed_out'
  | 'session_expired'
  | 'account_suspended';

export function shouldClearAuthenticatedExploreTripState(args: {
  reason: AuthExploreTripStateCleanupReason;
  hasAuthenticatedActor: boolean;
}): boolean {
  if (args.reason === 'session_expired' || args.reason === 'account_suspended') {
    return true;
  }

  return args.hasAuthenticatedActor;
}

/**
 * Clear route-selection state that can contain account-bound inventory.
 * Public route-catalog caches intentionally remain available across auth changes.
 */
export async function clearAuthenticatedExploreTripState(): Promise<void> {
  await Promise.all([
    clearExplorePlanningRouteContext(),
    clearTripBuilderRouteHandoff(),
    clearTripBuilderPlanState(),
  ]);
}
