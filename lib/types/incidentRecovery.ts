export type IncidentType =
  | 'vehicle_stuck'
  | 'vehicle_breakdown'
  | 'medical'
  | 'route_blocked'
  | 'lost_or_off_route'
  | 'separated_party'
  | 'weather_hazard'
  | 'environmental_hazard'
  | 'fuel_water_supply'
  | 'communication_failure'
  | 'camp_safety'
  | 'wildlife'
  | 'security'
  | 'other';

export type IncidentSeverity =
  | 'unknown'
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export type IncidentStatus =
  | 'active'
  | 'stabilizing'
  | 'awaiting_assistance'
  | 'self_recovery_in_progress'
  | 'evacuating'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type IncidentDisplayMode =
  | 'no_incident'
  | 'active_incident'
  | 'resolved_recent'
  | 'unknown';

export type IncidentWorkflowStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'attention_needed'
  | 'blocked';

export type IncidentEvidenceKind =
  | 'photo'
  | 'note'
  | 'location'
  | 'vehicle_telemetry'
  | 'weather'
  | 'route'
  | 'communication'
  | 'checklist'
  | 'other';

export type IncidentTimelineEventType =
  | 'reported'
  | 'status_changed'
  | 'checklist_updated'
  | 'assessment_updated'
  | 'evidence_added'
  | 'location_updated'
  | 'communication_packet_generated'
  | 'communication_packet_copied'
  | 'communication_sent'
  | 'severity_changed'
  | 'recovery_plan_updated'
  | 'recovery_attempt_logged'
  | 'assistance_requested'
  | 'resolved'
  | 'debrief_added'
  | 'note';

export type IncidentCriticalDataKey =
  | 'location'
  | 'communication'
  | 'hazard'
  | 'injury_status'
  | 'party_status'
  | 'vehicle_status'
  | 'route_status'
  | 'resource_status';

export type IncidentInjuryStatus =
  | 'unknown'
  | 'none_reported'
  | 'possible'
  | 'confirmed'
  | 'critical';

export type IncidentCommunicationStatus =
  | 'unknown'
  | 'available'
  | 'degraded'
  | 'offline'
  | 'emergency_only';

export type IncidentCoordinate = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  source?: 'gps' | 'manual' | 'dispatch' | 'route' | 'unknown';
  capturedAt?: string;
};

export interface IncidentRecoveryRouteContext {
  routeId?: string | null;
  routeLabel?: string | null;
  routeSegmentLabel?: string | null;
  routeSource?: string | null;
  hasActiveRoute: boolean;
  currentLocation?: IncidentCoordinate | null;
  statusLabel?: string | null;
}

export interface IncidentRecoveryConvoyContext {
  teamId?: string | null;
  teamName?: string | null;
  memberCount: number;
  memberLabels?: string[];
  hasConvoy: boolean;
  communicationTargetAvailable: boolean;
}

export interface IncidentRecoveryVehicleContext {
  vehicleId?: string | null;
  label?: string | null;
  makeModel?: string | null;
  drivetrain?: string | null;
  recoveryEquipment?: string[];
  fuelPercent?: number | null;
  waterGallons?: number | null;
  hasVehicleContext: boolean;
}

export interface IncidentRecoveryLogisticsContext {
  fuelPercent?: number | null;
  waterGallons?: number | null;
  foodStatus?: string | null;
  shelterStatus?: string | null;
  warmthStatus?: string | null;
  medicalKitAvailable?: boolean | null;
  suppliesSummary?: string | null;
}

export interface IncidentRecoveryConnectivityContext {
  online?: boolean | null;
  status?: string | null;
  level?: string | null;
  networkType?: string | null;
  internetReachable?: boolean | null;
  summaryLabel?: string | null;
}

export interface IncidentRecoveryContextSnapshot {
  route?: IncidentRecoveryRouteContext | null;
  convoy?: IncidentRecoveryConvoyContext | null;
  vehicle?: IncidentRecoveryVehicleContext | null;
  logistics?: IncidentRecoveryLogisticsContext | null;
  connectivity?: IncidentRecoveryConnectivityContext | null;
  debrief?: {
    routeConfidenceAdjustmentAvailable: boolean;
    communityHazardReportRequiresUserAction: boolean;
  };
  summary?: {
    routeLabel?: string | null;
    convoySummary?: string | null;
    vehicleSummary?: string | null;
    logisticsSummary?: string | null;
    connectivitySummary?: string | null;
  };
  missingContext?: string[];
  updatedAt: string;
}

export interface IncidentEvidence {
  id: string;
  kind: IncidentEvidenceKind;
  label: string;
  value?: string | number | boolean | null;
  uri?: string | null;
  capturedAt: string;
  capturedBy?: string | null;
  confidence?: 'unknown' | 'low' | 'medium' | 'high';
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StabilizationChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  state?: 'checked' | 'unchecked' | 'unknown';
  required?: boolean;
  warning?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  notes?: string | null;
}

export interface StabilizationChecklist {
  id: string;
  incidentId?: string;
  status: IncidentWorkflowStatus;
  items: StabilizationChecklistItem[];
  missingCriticalData?: IncidentCriticalDataKey[];
  updatedAt?: string;
}

export interface RecoveryAssessment {
  id: string;
  incidentId?: string;
  severity: IncidentSeverity;
  riskLevel?: IncidentSeverity;
  injuryStatus: IncidentInjuryStatus;
  communicationStatus: IncidentCommunicationStatus;
  vehicleMobile?: boolean | null;
  routePassable?: boolean | null;
  immediateHazards?: string[];
  missingCriticalData?: IncidentCriticalDataKey[];
  recommendations?: string[];
  risks?: string[];
  assumptions?: string[];
  evidence?: string[];
  nextActions?: string[];
  doNotDo?: string[];
  verificationSteps?: string[];
  debriefHooks?: string[];
  userFacingExplanation?: string;
  structuredOutput?: RecoveryIncidentAgentOutput;
  recommendedAction?: string | null;
  assessedAt?: string;
  assessedBy?: string | null;
  confidence?: 'unknown' | 'low' | 'medium' | 'high';
  notes?: string | null;
}

export interface RecoveryPlanStep {
  id: string;
  label: string;
  status: IncidentWorkflowStatus;
  ownerId?: string | null;
  dueAt?: string | null;
  notes?: string | null;
}

export interface RecoveryPlan {
  id: string;
  incidentId?: string;
  strategy?: 'self_recovery' | 'team_assist' | 'external_assist' | 'evacuation' | 'hold_position' | 'unknown';
  status: IncidentWorkflowStatus;
  steps: RecoveryPlanStep[];
  requiredEquipment?: string[];
  assistanceRequested?: boolean;
  etaLabel?: string | null;
  updatedAt?: string;
}

export interface IncidentCommunicationPacket {
  id: string;
  incidentId?: string;
  status: IncidentWorkflowStatus;
  summary: string;
  packetText?: string;
  audiencePackets?: Array<{
    audience: 'emergency_services' | 'recovery_provider' | 'convoy_members' | 'trusted_contact';
    label: string;
    text: string;
  }>;
  locationLabel?: string;
  routeLabel?: string;
  severity: IncidentSeverity;
  incidentStatus: IncidentStatus;
  recommendedAction?: string | null;
  recipients?: string[];
  channels?: Array<'dispatch' | 'sms' | 'radio' | 'satellite' | 'email' | 'clipboard' | 'other'>;
  lastSentAt?: string | null;
  missingCriticalData?: IncidentCriticalDataKey[];
}

export interface IncidentTimelineEvent {
  id: string;
  incidentId?: string;
  type: IncidentTimelineEventType;
  title: string;
  detail?: string | null;
  timestamp?: string;
  actor?: string | null;
  summary?: string;
  data?: Record<string, unknown>;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  occurredAt: string;
  actorId?: string | null;
  source?: 'operator' | 'dispatch' | 'ecs' | 'navigation' | 'vehicle' | 'system';
  evidenceIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface IncidentDebrief {
  id: string;
  incidentId?: string;
  status: IncidentWorkflowStatus;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionSummary?: string | null;
  resolutionStatus?: IncidentStatus;
  anyoneInjured?: boolean | null;
  vehicleDamaged?: boolean | null;
  outsideAssistanceUsed?: boolean | null;
  emergencyServicesContacted?: boolean | null;
  finalNotes?: string | null;
  outcome?: string | null;
  injuries?: string | null;
  vehicleDamage?: string | null;
  equipmentUsed?: string[];
  whatWorked?: string | null;
  whatFailed?: string | null;
  planningGaps?: string | null;
  routeHazards?: string | null;
  communicationIssues?: string | null;
  weatherTerrainMismatch?: string | null;
  futureRecommendations?: string | null;
  communityHazardReportRequested?: boolean;
  communityHazardPublicationStatus?: 'not_requested' | 'requested_review';
  communityHazardRequiresManualReview?: boolean;
  communityHazardPublished?: false;
  routeConfidenceAdjustmentRequested?: boolean;
  routeConfidenceReviewStatus?: 'not_requested' | 'requested_review';
  routeConfidenceChanged?: false;
  intelligenceHandoff?: IncidentDebriefIntelligenceHandoff;
  rootCause?: string | null;
  lessonsLearned?: string[];
  followUpActions?: RecoveryPlanStep[];
  includedEvidenceIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IncidentDebriefIntelligenceHandoff {
  id: string;
  incidentId: string;
  expeditionId?: string;
  debriefId: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  routeLabel?: string;
  locationLabel?: string;
  outcome?: string | null;
  injuries?: string | null;
  vehicleDamage?: string | null;
  equipmentUsed?: string[];
  routeHazards?: string | null;
  communicationIssues?: string | null;
  weatherTerrainMismatch?: string | null;
  planningGaps?: string | null;
  futureRecommendations?: string | null;
  communityHazardReportRequested: boolean;
  communityHazardPublicationStatus: 'not_requested' | 'requested_review';
  communityHazardRequiresManualReview: boolean;
  communityHazardPublished: false;
  routeConfidenceAdjustmentRequested: boolean;
  routeConfidenceReviewStatus: 'not_requested' | 'requested_review';
  routeConfidenceChanged: false;
  createdAt: string;
}

export interface RecoveryIncidentCommunicationPacketDraft {
  summary: string;
  recipients: string[];
  channels: Array<'dispatch' | 'sms' | 'radio' | 'satellite' | 'email' | 'clipboard' | 'other'>;
  missingData: IncidentCriticalDataKey[];
}

export interface RecoveryIncidentAgentOutput {
  summary: string;
  riskLevel: IncidentSeverity;
  confidence: 'unknown' | 'low' | 'medium' | 'high';
  recommendations: string[];
  risks: string[];
  missingData: IncidentCriticalDataKey[];
  assumptions: string[];
  evidence: string[];
  nextActions: string[];
  userFacingExplanation: string;
  immediateSafetyAssessment: string;
  stabilizationChecklist: string[];
  escalationTriggers: string[];
  communicationPacket?: RecoveryIncidentCommunicationPacketDraft;
  doNotDo: string[];
  verificationSteps: string[];
  debriefHooks: string[];
}

export interface IncidentContext {
  id: string;
  expeditionId?: string;
  routeId?: string | null;
  dispatchEventId?: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  summary?: string | null;
  location?: IncidentCoordinate | null;
  locationLabel?: string;
  routeLabel?: string;
  reportedAt: string;
  updatedAt?: string;
  reportedBy?: string | null;
  injuryStatus?: IncidentInjuryStatus;
  communicationStatus?: IncidentCommunicationStatus;
  missingCriticalData?: IncidentCriticalDataKey[];
  evidence?: IncidentEvidence[];
  stabilizationChecklist?: StabilizationChecklist;
  recoveryAssessment?: RecoveryAssessment;
  recoveryPlan?: RecoveryPlan;
  communicationPacket?: IncidentCommunicationPacket;
  timeline?: IncidentTimelineEvent[];
  debrief?: IncidentDebrief;
  metadata?: Record<string, unknown>;
}

export interface IncidentWorkflowButtonState {
  enabled: boolean;
  status?: IncidentWorkflowStatus;
  badgeCount?: number;
  warning?: boolean;
  label?: string;
  description?: string;
}

export interface IncidentRecoveryButtonStates {
  reportIncident: IncidentWorkflowButtonState;
  safetyChecklist: IncidentWorkflowButtonState;
  ecsAssessment: IncidentWorkflowButtonState;
  communicationPacket: IncidentWorkflowButtonState;
  timeline: IncidentWorkflowButtonState;
  resolveDebrief: IncidentWorkflowButtonState;
}

export interface IncidentRecoveryContainerState {
  expeditionId?: string;
  activeIncident?: IncidentContext | null;
  hasActiveIncident: boolean;
  displayMode: IncidentDisplayMode;
  headline: string;
  subheadline?: string;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  locationLabel?: string;
  routeLabel?: string;
  lastUpdated?: string;
  nextRecommendedAction?: string;
  missingCriticalData?: IncidentCriticalDataKey[];
  buttonStates?: IncidentRecoveryButtonStates;
}

export const INCIDENT_TYPES: readonly IncidentType[] = [
  'vehicle_stuck',
  'vehicle_breakdown',
  'medical',
  'route_blocked',
  'lost_or_off_route',
  'separated_party',
  'weather_hazard',
  'environmental_hazard',
  'fuel_water_supply',
  'communication_failure',
  'camp_safety',
  'wildlife',
  'security',
  'other',
] as const;

export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'active',
  'stabilizing',
  'awaiting_assistance',
  'self_recovery_in_progress',
  'evacuating',
  'resolved',
  'closed',
  'cancelled',
] as const;

export const DEFAULT_INCIDENT_RECOVERY_BUTTON_STATES: IncidentRecoveryButtonStates = {
  reportIncident: { enabled: true, status: 'not_started', label: 'Report Incident' },
  safetyChecklist: { enabled: true, status: 'not_started', label: 'Safety Checklist' },
  ecsAssessment: { enabled: true, status: 'not_started', label: 'ECS Assessment' },
  communicationPacket: { enabled: true, status: 'not_started', label: 'Communication Packet' },
  timeline: { enabled: true, status: 'not_started', label: 'Timeline' },
  resolveDebrief: { enabled: true, status: 'not_started', label: 'Resolve / Debrief' },
};

export const NO_ACTIVE_INCIDENT_RECOVERY_CONTAINER_STATE: IncidentRecoveryContainerState = {
  activeIncident: null,
  hasActiveIncident: false,
  displayMode: 'no_incident',
  headline: 'No active incident',
  severity: 'unknown',
  missingCriticalData: [],
  buttonStates: DEFAULT_INCIDENT_RECOVERY_BUTTON_STATES,
};
