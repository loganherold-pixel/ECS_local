import type { DispatchEvent, DispatchEventHazardType, DispatchEventSeverity } from './dispatchLiveEvents';
import { sortDispatchEvents } from './dispatchLiveEvents';
import type {
  IncidentCommunicationStatus,
  IncidentContext,
  IncidentCriticalDataKey,
  IncidentRecoveryContextSnapshot,
  IncidentRecoveryButtonStates,
  IncidentRecoveryContainerState,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentWorkflowStatus,
} from './types/incidentRecovery';
import { DEFAULT_INCIDENT_RECOVERY_BUTTON_STATES } from './types/incidentRecovery';

const RECENT_RESOLVED_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IncidentRecoveryLiveContext = {
  expeditionId?: string;
  routeLabel?: string;
  hasRouteContext?: boolean;
  ecsOnline?: boolean;
  checkedAt?: string;
  now?: number;
  incidents?: IncidentContext[];
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
};

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getEventExpeditionId(event: DispatchEvent): string | undefined {
  const raw = event as unknown as Record<string, unknown>;
  return cleanText(raw.expeditionId) ?? cleanText(event.sessionId);
}

function isTerminalIncidentStatus(status: string | undefined): boolean {
  const normalized = normalizeText(status);
  return (
    normalized.includes('resolved') ||
    normalized.includes('closed') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('dismissed')
  );
}

function eventMatchesContext(event: DispatchEvent, context: IncidentRecoveryLiveContext): boolean {
  if (!context.expeditionId) return true;
  const eventExpeditionId = getEventExpeditionId(event);
  return !eventExpeditionId || eventExpeditionId === context.expeditionId;
}

export function isIncidentRecoveryEvent(event: DispatchEvent): boolean {
  return (
    event.type === 'recovery' ||
    event.category === 'recovery_assist' ||
    event.category === 'hazard_recovery' ||
    event.hazardType === 'recovery'
  );
}

function mapDispatchSeverity(severity: DispatchEventSeverity | undefined): IncidentSeverity {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'high';
    case 'watch':
      return 'moderate';
    case 'info':
      return 'low';
    default:
      return 'unknown';
  }
}

function mapDispatchStatus(status: string | undefined): IncidentStatus {
  const normalized = normalizeText(status);
  if (normalized.includes('recovery_critical')) return 'active';
  if (normalized.includes('stabiliz')) return 'stabilizing';
  if (normalized.includes('await') || normalized.includes('assist')) return 'awaiting_assistance';
  if (normalized.includes('self') || normalized.includes('recover')) return 'self_recovery_in_progress';
  if (normalized.includes('evac')) return 'evacuating';
  if (normalized.includes('resolved')) return 'resolved';
  if (normalized.includes('closed')) return 'closed';
  if (normalized.includes('cancel')) return 'cancelled';
  return 'active';
}

function mapHazardIncidentType(hazardType: DispatchEventHazardType | undefined): IncidentType {
  switch (hazardType) {
    case 'weather':
      return 'weather_hazard';
    case 'terrain':
    case 'trail_blockage':
    case 'water_crossing':
      return 'route_blocked';
    case 'visibility':
      return 'environmental_hazard';
    case 'recovery':
      return 'vehicle_stuck';
    case 'other':
    default:
      return 'other';
  }
}

function mapDispatchIncidentType(event: DispatchEvent): IncidentType {
  if (event.hazardType) return mapHazardIncidentType(event.hazardType);
  if (event.type === 'vehicle') return 'vehicle_breakdown';
  if (event.type === 'resources') return 'fuel_water_supply';
  if (event.type === 'route') return 'route_blocked';
  if (event.type === 'weather') return 'weather_hazard';
  return 'other';
}

function getLocationLabel(event: DispatchEvent): string | undefined {
  if (!event.location) return undefined;
  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}`;
}

function getCommunicationStatus(event: DispatchEvent): IncidentCommunicationStatus {
  if (event.syncState === 'failed') return 'degraded';
  if (event.syncState === 'queued' || event.syncState === 'sending') return 'degraded';
  if (event.channelId || event.teamId || event.syncState === 'sent' || event.syncState === 'received') {
    return 'available';
  }
  return 'unknown';
}

function getMissingCriticalData(event: DispatchEvent): IncidentCriticalDataKey[] {
  const missing: IncidentCriticalDataKey[] = [];
  if (!event.location) missing.push('location');
  if (!event.channelId && !event.teamId && !event.syncState) missing.push('communication');
  if (!event.hazardType && !event.category) missing.push('hazard');
  return missing;
}

function getNextRecommendedAction(event: DispatchEvent, missingCriticalData: IncidentCriticalDataKey[]): string {
  if (missingCriticalData.includes('location')) return 'Confirm incident location.';
  if (missingCriticalData.includes('communication')) return 'Confirm communication channel.';
  if (event.severity === 'critical') return 'Stabilize scene and coordinate recovery.';
  return 'Review safety checklist.';
}

function getWorkflowStatusForMissingData(
  missingCriticalData: IncidentCriticalDataKey[],
  active: boolean,
): IncidentWorkflowStatus {
  if (!active) return 'complete';
  return missingCriticalData.length > 0 ? 'attention_needed' : 'in_progress';
}

function getRecommendedActionForIncidentStatus(
  status: IncidentStatus,
  missingCriticalData: IncidentCriticalDataKey[],
): string {
  switch (status) {
    case 'active':
      return 'Complete safety checklist';
    case 'stabilizing':
      if (missingCriticalData.length > 0) return 'Resolve missing critical data';
      return 'Complete safety checklist';
    case 'awaiting_assistance':
      return 'Prepare Communication Packet and keep Timeline current';
    case 'self_recovery_in_progress':
      return 'Log conservative status updates only';
    case 'evacuating':
      return 'Confirm location, communication, and Timeline';
    case 'resolved':
      return 'Complete debrief when ready.';
    case 'closed':
      return 'Incident closed';
    case 'cancelled':
      return 'Incident cancelled';
    default:
      return 'Review incident status.';
  }
}

function buildButtonStates(args: {
  activeIncident: boolean;
  resolved: boolean;
  missingCriticalData: IncidentCriticalDataKey[];
  timelineCount: number;
  incidentStatus?: IncidentStatus;
  safetyChecklistStatus?: IncidentWorkflowStatus;
  assessmentGenerated?: boolean;
  communicationPacketGenerated?: boolean;
  debriefStatus?: IncidentWorkflowStatus;
}): IncidentRecoveryButtonStates {
  if (!args.activeIncident && !args.resolved) {
    return {
      ...DEFAULT_INCIDENT_RECOVERY_BUTTON_STATES,
      safetyChecklist: {
        enabled: true,
        status: 'not_started',
        label: 'Safety Checklist',
        description: 'Available before or during an incident.',
      },
      ecsAssessment: {
        enabled: true,
        status: 'not_started',
        label: 'ECS Assessment',
        description: 'Starts once incident context is captured.',
      },
      communicationPacket: {
        enabled: true,
        status: 'not_started',
        label: 'Communication Packet',
        description: 'Empty until incident details exist.',
      },
      timeline: {
        enabled: true,
        status: 'not_started',
        label: 'Timeline',
        badgeCount: 0,
      },
      resolveDebrief: {
        enabled: true,
        status: 'not_started',
        label: 'Resolve / Debrief',
        description: 'Available when an incident is ready to close.',
      },
    };
  }

  const attentionStatus = getWorkflowStatusForMissingData(args.missingCriticalData, args.activeIncident);
  const safetyChecklistStatus = args.safetyChecklistStatus ?? (args.resolved ? 'complete' : 'in_progress');
  const awaitingAssistance = args.incidentStatus === 'awaiting_assistance';
  const selfRecovery = args.incidentStatus === 'self_recovery_in_progress';
  const evacuating = args.incidentStatus === 'evacuating';
  const stabilizing = args.incidentStatus === 'stabilizing';
  return {
    reportIncident: {
      enabled: true,
      status: 'complete',
      label: 'Report Incident',
    },
    safetyChecklist: {
      enabled: true,
      status: safetyChecklistStatus,
      warning: args.activeIncident && (safetyChecklistStatus === 'attention_needed' || stabilizing),
      label: 'Safety Checklist',
    },
    ecsAssessment: {
      enabled: true,
      status: args.assessmentGenerated ? 'complete' : selfRecovery ? 'attention_needed' : safetyChecklistStatus === 'not_started' ? 'not_started' : attentionStatus,
      warning: !args.assessmentGenerated && args.missingCriticalData.length > 0,
      label: 'ECS Assessment',
    },
    communicationPacket: {
      enabled: true,
      status: args.communicationPacketGenerated
        ? 'complete'
        : awaitingAssistance || evacuating ? 'attention_needed' : args.assessmentGenerated ? 'in_progress' : args.missingCriticalData.length > 0 ? 'attention_needed' : 'in_progress',
      warning: awaitingAssistance || evacuating || (!args.assessmentGenerated && args.missingCriticalData.length > 0),
      label: 'Communication Packet',
    },
    timeline: {
      enabled: true,
      status: awaitingAssistance || selfRecovery || evacuating ? 'attention_needed' : args.timelineCount > 0 ? 'in_progress' : 'not_started',
      badgeCount: args.timelineCount,
      warning: awaitingAssistance || selfRecovery || evacuating,
      label: 'Timeline',
    },
    resolveDebrief: {
      enabled: true,
      status: args.resolved ? args.debriefStatus ?? 'complete' : 'in_progress',
      label: 'Resolve / Debrief',
    },
  };
}

function buildIncidentContextFromDispatchEvent(
  event: DispatchEvent,
  context: IncidentRecoveryLiveContext,
): IncidentContext {
  const missingCriticalData = getMissingCriticalData(event);
  const incidentStatus = mapDispatchStatus(event.status);
  const updatedAt = event.updatedAt ?? event.location?.timestamp ?? event.createdAt;
  return {
    id: event.id,
    expeditionId: getEventExpeditionId(event) ?? context.expeditionId,
    routeId: event.routeSegmentId ?? null,
    dispatchEventId: event.id,
    type: mapDispatchIncidentType(event),
    severity: mapDispatchSeverity(event.severity),
    status: incidentStatus,
    title: event.title,
    summary: cleanText(event.message) ?? cleanText(event.details) ?? null,
    location: event.location
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          accuracyMeters: event.location.accuracyMeters ?? null,
          source: event.location.source === 'current_gps' ? 'gps' : 'dispatch',
          capturedAt: event.location.timestamp,
        }
      : null,
    locationLabel: getLocationLabel(event),
    routeLabel: context.routeLabel ?? event.routeSegmentId,
    reportedAt: event.createdAt,
    updatedAt,
    reportedBy: event.createdBy?.displayName ?? null,
    injuryStatus: 'unknown',
    communicationStatus: getCommunicationStatus(event),
    missingCriticalData,
    evidence: [],
    recoveryAssessment: {
      id: `${event.id}-assessment`,
      incidentId: event.id,
      severity: mapDispatchSeverity(event.severity),
      injuryStatus: 'unknown',
      communicationStatus: getCommunicationStatus(event),
      vehicleMobile: null,
      routePassable: null,
      immediateHazards: event.hazardType ? [titleCase(event.hazardType)] : [],
      missingCriticalData,
      recommendedAction: getNextRecommendedAction(event, missingCriticalData),
      assessedAt: updatedAt,
      confidence: 'unknown',
    },
    timeline: [
      {
        id: `${event.id}-reported`,
        incidentId: event.id,
        type: 'reported',
        title: event.title,
        detail: event.message,
        status: incidentStatus,
        severity: mapDispatchSeverity(event.severity),
        occurredAt: event.createdAt,
        source: 'dispatch',
      },
    ],
  };
}

function getRecentResolvedIncident(
  events: DispatchEvent[],
  context: IncidentRecoveryLiveContext,
): DispatchEvent | null {
  const now = context.now ?? Date.now();
  return sortDispatchEvents(events)
    .find((event) => {
      if (!isIncidentRecoveryEvent(event) || !eventMatchesContext(event, context)) return false;
      if (!isTerminalIncidentStatus(event.status)) return false;
      const updatedAt = Date.parse(event.updatedAt ?? event.createdAt);
      return Number.isFinite(updatedAt) && now - updatedAt <= RECENT_RESOLVED_WINDOW_MS;
    }) ?? null;
}

function isTerminalIncidentContext(incident: IncidentContext): boolean {
  return incident.status === 'resolved' || incident.status === 'closed' || incident.status === 'cancelled';
}

function incidentMatchesContext(incident: IncidentContext, context: IncidentRecoveryLiveContext): boolean {
  return !context.expeditionId || !incident.expeditionId || incident.expeditionId === context.expeditionId;
}

function getActiveIncidentContext(context: IncidentRecoveryLiveContext): IncidentContext | null {
  return (context.incidents ?? [])
    .filter((incident) => incidentMatchesContext(incident, context) && !isTerminalIncidentContext(incident))
    .sort((left, right) => Date.parse(right.updatedAt ?? right.reportedAt) - Date.parse(left.updatedAt ?? left.reportedAt))[0] ?? null;
}

function getRecentResolvedIncidentContext(context: IncidentRecoveryLiveContext): IncidentContext | null {
  const now = context.now ?? Date.now();
  return (context.incidents ?? [])
    .filter((incident) => {
      if (!incidentMatchesContext(incident, context) || !isTerminalIncidentContext(incident)) return false;
      const updatedAt = Date.parse(incident.updatedAt ?? incident.reportedAt);
      return Number.isFinite(updatedAt) && now - updatedAt <= RECENT_RESOLVED_WINDOW_MS;
    })
    .sort((left, right) => Date.parse(right.updatedAt ?? right.reportedAt) - Date.parse(left.updatedAt ?? left.reportedAt))[0] ?? null;
}

function buildContainerStateFromIncidentContext(
  activeIncident: IncidentContext,
  context: IncidentRecoveryLiveContext,
): IncidentRecoveryContainerState {
  const missingCriticalData = activeIncident.missingCriticalData ?? [];
  const resolved = isTerminalIncidentContext(activeIncident);
  return {
    expeditionId: activeIncident.expeditionId ?? context.expeditionId,
    activeIncident,
    hasActiveIncident: !resolved,
    displayMode: resolved ? 'resolved_recent' : 'active_incident',
    headline: resolved ? 'Incident Resolved' : 'Active Incident',
    subheadline: titleCase(activeIncident.type),
    severity: activeIncident.severity,
    status: activeIncident.status,
    locationLabel: activeIncident.locationLabel,
    routeLabel: activeIncident.routeLabel ?? context.routeLabel,
    lastUpdated: activeIncident.updatedAt ?? activeIncident.reportedAt,
    nextRecommendedAction: resolved
      ? 'Complete debrief when ready.'
      : activeIncident.recoveryAssessment?.recommendedAction ??
        getRecommendedActionForIncidentStatus(activeIncident.status, missingCriticalData),
    missingCriticalData,
      buttonStates: buildButtonStates({
        activeIncident: !resolved,
        resolved,
        missingCriticalData,
        timelineCount: activeIncident.timeline?.length ?? 0,
        incidentStatus: activeIncident.status,
        safetyChecklistStatus: activeIncident.stabilizationChecklist?.status,
        assessmentGenerated: !!activeIncident.recoveryAssessment?.structuredOutput,
        communicationPacketGenerated: !!activeIncident.communicationPacket,
        debriefStatus: activeIncident.debrief?.status,
      }),
  };
}

function getActiveIncident(events: DispatchEvent[], context: IncidentRecoveryLiveContext): DispatchEvent | null {
  return sortDispatchEvents(events)
    .find((event) => (
      isIncidentRecoveryEvent(event) &&
      eventMatchesContext(event, context) &&
      !isTerminalIncidentStatus(event.status)
    )) ?? null;
}

function buildNoActiveIncidentState(context: IncidentRecoveryLiveContext): IncidentRecoveryContainerState {
  const checkedAt = context.checkedAt ?? new Date(context.now ?? Date.now()).toISOString();
  const routeLabel = context.routeLabel ?? context.contextSnapshot?.summary?.routeLabel ?? undefined;
  const connectivityLabel = context.contextSnapshot?.summary?.connectivitySummary;
  return {
    expeditionId: context.expeditionId,
    activeIncident: null,
    hasActiveIncident: false,
    displayMode: 'no_incident',
    headline: 'No active incident',
    subheadline: context.hasRouteContext || context.contextSnapshot?.route?.hasActiveRoute
      ? `Route monitoring active${connectivityLabel ? ` / ${connectivityLabel}` : ''}`
      : connectivityLabel ?? 'Ready to report incident',
    severity: 'unknown',
    routeLabel,
    lastUpdated: checkedAt,
    nextRecommendedAction: 'Ready to report incident',
    missingCriticalData: [],
    buttonStates: buildButtonStates({
      activeIncident: false,
      resolved: false,
      missingCriticalData: [],
      timelineCount: 0,
    }),
  };
}

export function buildIncidentRecoveryContainerState(
  events: DispatchEvent[],
  context: IncidentRecoveryLiveContext = {},
): IncidentRecoveryContainerState {
  const workflowActiveIncident = getActiveIncidentContext(context);
  if (workflowActiveIncident) {
    return buildContainerStateFromIncidentContext(workflowActiveIncident, context);
  }

  const activeEvent = getActiveIncident(events, context);
  if (activeEvent) {
    const activeIncident = buildIncidentContextFromDispatchEvent(activeEvent, context);
    const missingCriticalData = activeIncident.missingCriticalData ?? [];
    return {
      expeditionId: activeIncident.expeditionId ?? context.expeditionId,
      activeIncident,
      hasActiveIncident: true,
      displayMode: 'active_incident',
      headline: 'Active Incident',
      subheadline: titleCase(activeIncident.type),
      severity: activeIncident.severity,
      status: activeIncident.status,
      locationLabel: activeIncident.locationLabel,
      routeLabel: activeIncident.routeLabel,
      lastUpdated: activeIncident.updatedAt,
      nextRecommendedAction: activeIncident.recoveryAssessment?.recommendedAction ??
        getRecommendedActionForIncidentStatus(activeIncident.status, missingCriticalData),
      missingCriticalData,
      buttonStates: buildButtonStates({
        activeIncident: true,
        resolved: false,
        missingCriticalData,
        timelineCount: activeIncident.timeline?.length ?? 0,
        incidentStatus: activeIncident.status,
        safetyChecklistStatus: activeIncident.stabilizationChecklist?.status,
        assessmentGenerated: !!activeIncident.recoveryAssessment?.structuredOutput,
        communicationPacketGenerated: !!activeIncident.communicationPacket,
      }),
    };
  }

  const workflowResolvedIncident = getRecentResolvedIncidentContext(context);
  if (workflowResolvedIncident) {
    return buildContainerStateFromIncidentContext(workflowResolvedIncident, context);
  }

  const resolvedEvent = getRecentResolvedIncident(events, context);
  if (resolvedEvent) {
    const activeIncident = buildIncidentContextFromDispatchEvent(resolvedEvent, context);
    const missingCriticalData = activeIncident.missingCriticalData ?? [];
    return {
      expeditionId: activeIncident.expeditionId ?? context.expeditionId,
      activeIncident,
      hasActiveIncident: false,
      displayMode: 'resolved_recent',
      headline: 'Incident Resolved',
      subheadline: titleCase(activeIncident.type),
      severity: activeIncident.severity,
      status: activeIncident.status,
      locationLabel: activeIncident.locationLabel,
      routeLabel: activeIncident.routeLabel,
      lastUpdated: activeIncident.updatedAt,
      nextRecommendedAction: 'Complete debrief when ready.',
      missingCriticalData,
      buttonStates: buildButtonStates({
        activeIncident: false,
        resolved: true,
        missingCriticalData,
        timelineCount: activeIncident.timeline?.length ?? 0,
        incidentStatus: activeIncident.status,
        safetyChecklistStatus: activeIncident.stabilizationChecklist?.status,
        assessmentGenerated: !!activeIncident.recoveryAssessment?.structuredOutput,
        communicationPacketGenerated: !!activeIncident.communicationPacket,
      }),
    };
  }

  return buildNoActiveIncidentState(context);
}
