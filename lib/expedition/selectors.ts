import type {
  ExpeditionFrameworkState,
  ExpeditionIncidentState,
  ExpeditionTopCardKey,
} from '../types/expedition';

export function isOverviewEnabled(state: ExpeditionFrameworkState): boolean {
  return state.hasActiveExpedition;
}

export function isRouteEnabled(state: ExpeditionFrameworkState): boolean {
  return state.hasActiveExpedition;
}

export function isConvoyEnabled(state: ExpeditionFrameworkState): boolean {
  return state.teamMemberCount >= 2;
}

export function isCampEnabled(state: ExpeditionFrameworkState): boolean {
  return state.hasActiveExpedition && state.hasRouteCamps;
}

export function isLogisticsEnabled(_state: ExpeditionFrameworkState): boolean {
  return true;
}

export function isVehiclesEnabled(_state: ExpeditionFrameworkState): boolean {
  return true;
}

export function isExpeditionSummaryEnabled(state: ExpeditionFrameworkState): boolean {
  return state.routeLifecycleState === 'ended' || state.routeLifecycleState === 'completed';
}

export function getIncidentPanelState(state: ExpeditionFrameworkState): ExpeditionIncidentState {
  if (!state.hasActiveExpedition) {
    return {
      panelState: 'noActiveExpedition',
    };
  }

  return state.incident;
}

export function isTopCardEnabled(
  state: ExpeditionFrameworkState,
  cardKey: ExpeditionTopCardKey,
): boolean {
  switch (cardKey) {
    case 'overview':
      return isOverviewEnabled(state);
    case 'route':
      return isRouteEnabled(state);
    case 'convoy':
      return isConvoyEnabled(state);
    case 'camp':
      return isCampEnabled(state);
    case 'logistics':
      return isLogisticsEnabled(state);
    case 'vehicles':
      return isVehiclesEnabled(state);
    default:
      return false;
  }
}

export function getVisibleUnreadCount(
  state: ExpeditionFrameworkState,
  cardKey: ExpeditionTopCardKey,
): number {
  const unreadCount = state.topCardUnreadCounts[cardKey] ?? 0;
  return isTopCardEnabled(state, cardKey) && unreadCount > 0 ? unreadCount : 0;
}

