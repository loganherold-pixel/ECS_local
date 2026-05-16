import type {
  ExpeditionAvailabilityState,
  ExpeditionIncidentSignalState,
  ExpeditionIncidentState,
  RouteLifecycleState,
} from '../types/expedition';

export type ExpeditionTopCardAvailability = {
  overviewEnabled: boolean;
  routeEnabled: boolean;
  convoyEnabled: boolean;
  campEnabled: boolean;
  logisticsEnabled: boolean;
  vehiclesEnabled: boolean;
};

export function resolveExpeditionTopCardAvailability(
  state: ExpeditionAvailabilityState,
): ExpeditionTopCardAvailability {
  const hasActiveExpedition = state.hasActiveExpedition === true;

  return {
    overviewEnabled: hasActiveExpedition,
    routeEnabled: hasActiveExpedition,
    convoyEnabled: state.teamMemberCount >= 2,
    campEnabled: hasActiveExpedition && state.hasRouteCamps === true,
    logisticsEnabled: true,
    vehiclesEnabled: true,
  };
}

export function resolveExpeditionIncidentPanelState({
  hasActiveExpedition,
  incident,
}: {
  hasActiveExpedition: boolean;
  incident: ExpeditionIncidentSignalState;
}): ExpeditionIncidentState {
  if (!hasActiveExpedition) {
    return {
      panelState: 'noActiveExpedition',
    };
  }

  if (incident.hasActiveIncident) {
    return {
      panelState: 'activeIncident',
      incidentLocation: incident.incidentLocation,
      incidentSummary: incident.incidentSummary,
      incidentStatusLabel: 'In Progress',
      incidentUpdatedAt: incident.incidentUpdatedAt,
    };
  }

  if (incident.incidentRecentlyEnded) {
    return {
      panelState: 'incidentEnded',
      incidentLocation: incident.incidentLocation,
      incidentSummary: incident.incidentSummary,
      incidentStatusLabel: 'Ended',
      incidentUpdatedAt: incident.incidentUpdatedAt,
    };
  }

  return {
    panelState: 'clear',
  };
}

export function isExpeditionSummaryEnabled(
  routeLifecycleState: RouteLifecycleState,
): boolean {
  return routeLifecycleState === 'ended' || routeLifecycleState === 'completed';
}
