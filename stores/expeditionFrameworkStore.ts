import type {
  ExpeditionFrameworkState,
  ExpeditionIncidentState,
  ExpeditionTopCardKey,
  ExpeditionUnreadState,
  IncidentPanelState,
  RouteLifecycleState,
} from '../lib/types/expedition';
import { isExpeditionSummaryEnabled } from '../lib/expedition/selectors';

export const EXPEDITION_TOP_CARD_KEYS: ExpeditionTopCardKey[] = [
  'overview',
  'route',
  'convoy',
  'camp',
  'logistics',
  'vehicles',
];

function createEmptyUnreadCounts(): Record<ExpeditionTopCardKey, number> {
  return {
    overview: 0,
    route: 0,
    convoy: 0,
    camp: 0,
    logistics: 0,
    vehicles: 0,
  };
}

export function createDefaultExpeditionUnreadState(): ExpeditionUnreadState {
  return {
    unreadCounts: createEmptyUnreadCounts(),
    lastViewedAtByCard: {},
  };
}

function createDefaultIncidentState(): ExpeditionIncidentState {
  return {
    panelState: 'noActiveExpedition',
  };
}

export function createDefaultExpeditionFrameworkState(): ExpeditionFrameworkState {
  const unreadState = createDefaultExpeditionUnreadState();
  const state: ExpeditionFrameworkState = {
    routeLifecycleState: 'idle',
    hasActiveExpedition: false,
    teamMemberCount: 1,
    hasRouteCamps: false,
    topCardUnreadCounts: unreadState.unreadCounts,
    topCardLastViewedAt: unreadState.lastViewedAtByCard,
    incident: createDefaultIncidentState(),
    expeditionSummaryAvailable: false,
    incidentDraftData: {},
  };

  return {
    ...state,
    expeditionSummaryAvailable: isExpeditionSummaryEnabled(state),
  };
}

let frameworkState: ExpeditionFrameworkState = createDefaultExpeditionFrameworkState();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener failures should not break dashboard state updates.
    }
  });
}

function normalizeUnreadCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

function normalizeTeamMemberCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

function normalizeIncidentForState(state: ExpeditionFrameworkState): ExpeditionIncidentState {
  if (!state.hasActiveExpedition) {
    return {
      panelState: 'noActiveExpedition',
    };
  }

  if (state.incident.panelState === 'activeIncident') {
    return {
      panelState: 'activeIncident',
      incidentLocation: state.incident.incidentLocation ?? state.incidentDraftData.incidentLocation,
      incidentSummary: state.incident.incidentSummary ?? state.incidentDraftData.incidentSummary,
      incidentStatusLabel: 'In Progress',
      incidentUpdatedAt: state.incident.incidentUpdatedAt,
    };
  }

  if (state.incident.panelState === 'incidentEnded') {
    return {
      panelState: 'incidentEnded',
      incidentLocation: state.incident.incidentLocation ?? state.incidentDraftData.incidentLocation,
      incidentSummary: state.incident.incidentSummary ?? state.incidentDraftData.incidentSummary,
      incidentStatusLabel: 'Ended',
      incidentUpdatedAt: state.incident.incidentUpdatedAt,
    };
  }

  return {
    panelState: 'clear',
  };
}

function normalizeFrameworkState(nextState: ExpeditionFrameworkState): ExpeditionFrameworkState {
  const normalized: ExpeditionFrameworkState = {
    ...nextState,
    teamMemberCount: normalizeTeamMemberCount(nextState.teamMemberCount),
    topCardUnreadCounts: {
      overview: normalizeUnreadCount(nextState.topCardUnreadCounts.overview),
      route: normalizeUnreadCount(nextState.topCardUnreadCounts.route),
      convoy: normalizeUnreadCount(nextState.topCardUnreadCounts.convoy),
      camp: normalizeUnreadCount(nextState.topCardUnreadCounts.camp),
      logistics: normalizeUnreadCount(nextState.topCardUnreadCounts.logistics),
      vehicles: normalizeUnreadCount(nextState.topCardUnreadCounts.vehicles),
    },
    incidentDraftData: {
      ...nextState.incidentDraftData,
    },
  };

  normalized.expeditionSummaryAvailable = isExpeditionSummaryEnabled(normalized);
  normalized.incident = normalizeIncidentForState(normalized);
  return normalized;
}

function updateFrameworkState(nextState: ExpeditionFrameworkState) {
  frameworkState = normalizeFrameworkState(nextState);
  emit();
}

export function getExpeditionFrameworkState(): ExpeditionFrameworkState {
  return frameworkState;
}

export function subscribeExpeditionFrameworkState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setExpeditionFrameworkPreviewState(
  nextState: Partial<Pick<
    ExpeditionFrameworkState,
    'routeLifecycleState' | 'hasActiveExpedition' | 'teamMemberCount' | 'hasRouteCamps'
  >>,
) {
  updateFrameworkState({
    ...frameworkState,
    ...nextState,
  });
}

export function setRouteLifecycleState(routeLifecycleState: RouteLifecycleState) {
  updateFrameworkState({
    ...frameworkState,
    routeLifecycleState,
    hasActiveExpedition: routeLifecycleState === 'active',
  });
}

export function setTeamMemberCount(count: number) {
  updateFrameworkState({
    ...frameworkState,
    teamMemberCount: count,
  });
}

export function setHasRouteCamps(value: boolean) {
  updateFrameworkState({
    ...frameworkState,
    hasRouteCamps: value === true,
  });
}

export function markTopCardViewed(cardKey: ExpeditionTopCardKey, viewedAt = Date.now()) {
  updateFrameworkState({
    ...frameworkState,
    topCardUnreadCounts: {
      ...frameworkState.topCardUnreadCounts,
      [cardKey]: 0,
    },
    topCardLastViewedAt: {
      ...frameworkState.topCardLastViewedAt,
      [cardKey]: viewedAt,
    },
  });
}

export function publishExpeditionCardUpdate(
  cardKey: ExpeditionTopCardKey,
  publishedAt = Date.now(),
  incrementBy = 1,
) {
  const lastViewedAt = frameworkState.topCardLastViewedAt[cardKey] ?? 0;
  if (publishedAt <= lastViewedAt) return;

  setUnreadCount(
    cardKey,
    frameworkState.topCardUnreadCounts[cardKey] + normalizeUnreadCount(incrementBy),
  );
}

export function setUnreadCount(cardKey: ExpeditionTopCardKey, count: number) {
  updateFrameworkState({
    ...frameworkState,
    topCardUnreadCounts: {
      ...frameworkState.topCardUnreadCounts,
      [cardKey]: normalizeUnreadCount(count),
    },
  });
}

export function clearUnreadCount(cardKey: ExpeditionTopCardKey) {
  setUnreadCount(cardKey, 0);
}

export function setIncidentPanelState(panelState: IncidentPanelState) {
  updateFrameworkState({
    ...frameworkState,
    incident: {
      ...frameworkState.incident,
      panelState,
      incidentStatusLabel:
        panelState === 'activeIncident'
          ? 'In Progress'
          : panelState === 'incidentEnded'
            ? 'Ended'
            : undefined,
      incidentUpdatedAt: Date.now(),
    },
  });
}

export function setIncidentDraftData(data: Partial<Omit<ExpeditionIncidentState, 'panelState'>>) {
  updateFrameworkState({
    ...frameworkState,
    incidentDraftData: {
      ...frameworkState.incidentDraftData,
      incidentLocation: data.incidentLocation ?? frameworkState.incidentDraftData.incidentLocation,
      incidentSummary: data.incidentSummary ?? frameworkState.incidentDraftData.incidentSummary,
    },
    incident: {
      ...frameworkState.incident,
      ...data,
      incidentUpdatedAt: data.incidentUpdatedAt ?? Date.now(),
    },
  });
}

export function resetExpeditionFrameworkState() {
  updateFrameworkState(createDefaultExpeditionFrameworkState());
}

export function getExpeditionUnreadState(): ExpeditionUnreadState {
  return {
    unreadCounts: frameworkState.topCardUnreadCounts,
    lastViewedAtByCard: frameworkState.topCardLastViewedAt,
  };
}

export const subscribeExpeditionUnreadState = subscribeExpeditionFrameworkState;
export const markCardViewed = markTopCardViewed;

export function resetExpeditionUnreadState(nextState = createDefaultExpeditionUnreadState()) {
  updateFrameworkState({
    ...frameworkState,
    topCardUnreadCounts: nextState.unreadCounts,
    topCardLastViewedAt: nextState.lastViewedAtByCard,
  });
}

export function getExpeditionIncidentSignalState() {
  return {
    hasActiveIncident: frameworkState.incident.panelState === 'activeIncident',
    incidentRecentlyEnded: frameworkState.incident.panelState === 'incidentEnded',
    incidentLocation: frameworkState.incident.incidentLocation ?? frameworkState.incidentDraftData.incidentLocation,
    incidentSummary: frameworkState.incident.incidentSummary ?? frameworkState.incidentDraftData.incidentSummary,
    incidentUpdatedAt: frameworkState.incident.incidentUpdatedAt,
  };
}

export const subscribeExpeditionIncidentSignalState = subscribeExpeditionFrameworkState;

export function setExpeditionIncidentSignalState(nextState: {
  hasActiveIncident?: boolean;
  incidentRecentlyEnded?: boolean;
  incidentLocation?: string;
  incidentSummary?: string;
  incidentUpdatedAt?: number;
}) {
  const panelState: IncidentPanelState =
    nextState.hasActiveIncident
      ? 'activeIncident'
      : nextState.incidentRecentlyEnded
        ? 'incidentEnded'
        : frameworkState.hasActiveExpedition
          ? 'clear'
          : 'noActiveExpedition';

  updateFrameworkState({
    ...frameworkState,
    incidentDraftData: {
      ...frameworkState.incidentDraftData,
      incidentLocation: nextState.incidentLocation ?? frameworkState.incidentDraftData.incidentLocation,
      incidentSummary: nextState.incidentSummary ?? frameworkState.incidentDraftData.incidentSummary,
    },
    incident: {
      panelState,
      incidentLocation: nextState.incidentLocation ?? frameworkState.incident.incidentLocation,
      incidentSummary: nextState.incidentSummary ?? frameworkState.incident.incidentSummary,
      incidentStatusLabel:
        panelState === 'activeIncident'
          ? 'In Progress'
          : panelState === 'incidentEnded'
            ? 'Ended'
            : undefined,
      incidentUpdatedAt: nextState.incidentUpdatedAt ?? Date.now(),
    },
  });
}

export function publishLocalIncident(
  incidentLocation?: string,
  incidentSummary?: string,
) {
  setExpeditionIncidentSignalState({
    hasActiveIncident: true,
    incidentRecentlyEnded: false,
    incidentLocation,
    incidentSummary,
  });
}

export function endLocalIncident() {
  setExpeditionIncidentSignalState({
    hasActiveIncident: false,
    incidentRecentlyEnded: true,
  });
}

export function clearLocalIncident() {
  setExpeditionIncidentSignalState({
    hasActiveIncident: false,
    incidentRecentlyEnded: false,
  });
}
