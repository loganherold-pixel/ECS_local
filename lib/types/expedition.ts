export type RouteLifecycleState = 'idle' | 'active' | 'ended' | 'completed';

export type ExpeditionAvailabilityState = {
  routeLifecycleState: RouteLifecycleState;
  hasActiveExpedition: boolean;
  teamMemberCount: number;
  hasRouteCamps: boolean;
};

export type ExpeditionTopCardKey =
  | 'overview'
  | 'route'
  | 'convoy'
  | 'camp'
  | 'logistics'
  | 'vehicles';

export type ExpeditionUnreadState = {
  unreadCounts: Record<ExpeditionTopCardKey, number>;
  lastViewedAtByCard: Partial<Record<ExpeditionTopCardKey, number>>;
};

export type IncidentPanelState =
  | 'noActiveExpedition'
  | 'clear'
  | 'activeIncident'
  | 'incidentEnded';

export type ExpeditionIncidentState = {
  panelState: IncidentPanelState;
  incidentLocation?: string;
  incidentSummary?: string;
  incidentStatusLabel?: 'In Progress' | 'Ended';
  incidentUpdatedAt?: number;
};

export type ExpeditionIncidentSignalState = {
  hasActiveIncident: boolean;
  incidentRecentlyEnded: boolean;
  incidentLocation?: string;
  incidentSummary?: string;
  incidentUpdatedAt?: number;
};

export type ExpeditionFrameworkState = {
  routeLifecycleState: RouteLifecycleState;
  hasActiveExpedition: boolean;
  teamMemberCount: number;
  hasRouteCamps: boolean;
  topCardUnreadCounts: Record<ExpeditionTopCardKey, number>;
  topCardLastViewedAt: Partial<Record<ExpeditionTopCardKey, number>>;
  incident: ExpeditionIncidentState;
  expeditionSummaryAvailable: boolean;
  incidentDraftData: {
    incidentLocation?: string;
    incidentSummary?: string;
  };
};

export type {
  AssessmentCategory,
  AssessmentStatus,
  AssessmentConfidence,
  ExpeditionDataSource,
  ExpeditionDataReliability,
  ExpeditionGeoPoint,
  ExpeditionDataPoint,
  ExpeditionAssessmentDataUsed,
  ExpeditionAssessmentRelatedAction,
  ExpeditionAssessment,
  ExpeditionRouteSnapshot,
  ConvoyMemberMovementStatus,
  ConvoyMemberSnapshot,
  ConvoySnapshot,
  CampSnapshot,
  LogisticsSnapshot,
  VehicleSnapshot,
  ExpeditionContextSnapshot,
} from '../expedition/operationalAssessmentTypes';

export {
  ASSESSMENT_CATEGORIES,
  ASSESSMENT_STATUSES,
  ASSESSMENT_CONFIDENCE_LEVELS,
  EXPEDITION_DATA_SOURCES,
  isAssessmentCategory,
  isAssessmentStatus,
  isManualExpeditionDataSource,
} from '../expedition/operationalAssessmentTypes';

export type {
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  IncidentContext,
  IncidentEvidence,
  StabilizationChecklist,
  RecoveryAssessment,
  RecoveryPlan,
  IncidentCommunicationPacket,
  IncidentRecoveryContextSnapshot,
  IncidentRecoveryRouteContext,
  IncidentRecoveryConvoyContext,
  IncidentRecoveryVehicleContext,
  IncidentRecoveryLogisticsContext,
  IncidentRecoveryConnectivityContext,
  IncidentTimelineEvent,
  IncidentDebrief,
  IncidentDebriefIntelligenceHandoff,
  IncidentRecoveryContainerState,
  IncidentRecoveryButtonStates,
  IncidentWorkflowButtonState,
} from './incidentRecovery';
