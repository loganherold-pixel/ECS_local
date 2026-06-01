export type ExpeditionLifecyclePhase =
  | 'plan'
  | 'prepare'
  | 'brief'
  | 'navigate'
  | 'adapt'
  | 'recover'
  | 'debrief'
  | 'learn';

export type ExpeditionIntelligenceAgentId =
  | 'expedition_planner'
  | 'route_risk'
  | 'camp_logistics'
  | 'convoy_command'
  | 'recovery_incident'
  | 'debrief_intelligence'
  | 'community_qa';

export type ExpeditionIntelligenceRiskLevel =
  | 'normal'
  | 'watch'
  | 'caution'
  | 'critical'
  | 'unknown';

export type ExpeditionIntelligenceConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown';

export const CONFIDENCE_BANDS = ['high', 'moderate', 'low', 'unknown'] as const;

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const RISK_LEVELS = ['low', 'moderate', 'elevated', 'high', 'severe'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const EVIDENCE_SOURCE_TYPES = [
  'route',
  'weather',
  'legal_access',
  'vehicle_profile',
  'driver_profile',
  'community_report',
  'debrief',
  'manual_user_input',
  'unknown',
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_FRESHNESS_VALUES = ['current', 'recent', 'stale', 'unknown'] as const;

export type EvidenceFreshness = (typeof EVIDENCE_FRESHNESS_VALUES)[number];

export const AGENT_RECOMMENDATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type AgentRecommendationPriority = (typeof AGENT_RECOMMENDATION_PRIORITIES)[number];

export type ExpeditionEvidenceField = {
  id: string;
  label: string;
  value?: string | number | boolean | null;
  source:
    | 'live'
    | 'manual'
    | 'cached'
    | 'community'
    | 'weather'
    | 'vehicle'
    | 'route'
    | 'incident'
    | 'inferred'
    | 'unknown';
  updatedAt?: string | null;
  stale?: boolean;
  missing?: boolean;
  confidence?: ExpeditionIntelligenceConfidence;
};

export type ExpeditionContextField<T> = {
  value: T | null;
  available: boolean;
  source: ExpeditionEvidenceField['source'];
  sourceRef?: string | null;
  updatedAt?: string | null;
  stale?: boolean;
  confidence?: ExpeditionIntelligenceConfidence;
};

export type ExpeditionContextVehicle = {
  id?: string | null;
  label?: string | null;
  makeModel?: string | null;
  modifications?: string[];
  tires?: string | null;
  clearance?: string | number | null;
  drivetrain?: string | null;
  recoveryGear?: string[];
  capability?: string | null;
};

export type ExpeditionContextCommunityReport = {
  id: string;
  summary: string;
  sentiment?: string | null;
  sourceRef?: string | null;
  updatedAt?: string | null;
  freshness?: string | null;
};

export type ExpeditionContextDebrief = {
  id?: string | null;
  summary?: string | null;
  lessons?: string[];
  routeId?: string | null;
  updatedAt?: string | null;
};

export type ExpeditionContext = {
  tripIntent: {
    expeditionId?: string | null;
    purpose: ExpeditionContextField<string>;
    startDate: ExpeditionContextField<string>;
    endDate: ExpeditionContextField<string>;
    lifecyclePhase: ExpeditionLifecyclePhase;
    learnedPreferences: ExpeditionContextField<string[]>;
  };
  routeContext: {
    routeId?: string | null;
    routeName: ExpeditionContextField<string>;
    routeDifficulty: ExpeditionContextField<string>;
    currentSegment: ExpeditionContextField<string>;
    knownHazards: ExpeditionContextField<string[]>;
    tripDates: ExpeditionContextField<string>;
  };
  vehicleContext: {
    primaryVehicle: ExpeditionContextField<string>;
    vehicles: ExpeditionContextVehicle[];
    modifications: ExpeditionContextField<string[]>;
    tires: ExpeditionContextField<string>;
    clearance: ExpeditionContextField<string | number>;
    drivetrain: ExpeditionContextField<string>;
    recoveryGear: ExpeditionContextField<string[]>;
    capability: ExpeditionContextField<string>;
  };
  driverContext: {
    userId?: string | null;
    displayName: ExpeditionContextField<string>;
    driverSkill: ExpeditionContextField<string>;
    experience: ExpeditionContextField<string>;
  };
  environmentalContext: {
    weatherRisk: ExpeditionContextField<string>;
    weatherSummary: ExpeditionContextField<string>;
    seasonalityRisk: ExpeditionContextField<string>;
    remoteness: ExpeditionContextField<string>;
  };
  legalAccessContext: {
    status: ExpeditionContextField<string>;
    freshness: ExpeditionContextField<string>;
    notes: ExpeditionContextField<string>;
  };
  logisticsContext: {
    campsiteAvailability: ExpeditionContextField<string>;
    resupplyAvailability: ExpeditionContextField<string>;
    fuel: ExpeditionContextField<string | number>;
    water: ExpeditionContextField<string | number>;
    food: ExpeditionContextField<string | number>;
    power: ExpeditionContextField<string | number>;
    convoyParticipants: ExpeditionContextField<number>;
  };
  communityReportContext: {
    reports: ExpeditionContextCommunityReport[];
    freshnessSummary: ExpeditionContextField<string>;
    conflictingReports: ExpeditionContextField<string[]>;
  };
  priorDebriefs: ExpeditionContextDebrief[];
  evidence: ExpeditionEvidenceField[];
  missingData: string[];
  generatedAt: string;
};

export type ExpeditionAgentContextInput = {
  builtAt: string;
  lifecyclePhase: ExpeditionLifecyclePhase;
  expeditionId?: string | null;
  evidence: ExpeditionEvidenceField[];
  missingData: string[];
  staleData: string[];
  tripIntent?: ExpeditionContext['tripIntent'];
  routeContext?: ExpeditionContext['routeContext'];
  vehicleContext?: ExpeditionContext['vehicleContext'];
  driverContext?: ExpeditionContext['driverContext'];
  environmentalContext?: ExpeditionContext['environmentalContext'];
  legalAccessContext?: ExpeditionContext['legalAccessContext'];
  logisticsContext?: ExpeditionContext['logisticsContext'];
  communityReportContext?: ExpeditionContext['communityReportContext'];
  priorDebriefs?: ExpeditionContextDebrief[];
  generatedAt?: string;
  route?: unknown;
  operationalSnapshot?: unknown;
  incident?: unknown;
};

export type ExpeditionAgentResponse = {
  agentId: ExpeditionIntelligenceAgentId;
  lifecyclePhase: ExpeditionLifecyclePhase;
  status: ExpeditionIntelligenceRiskLevel;
  confidence: ExpeditionIntelligenceConfidence;
  summary: string;
  recommendations: string[];
  risks: string[];
  why: string[];
  evidence: ExpeditionEvidenceField[];
  uncertainty: string[];
  recommendedAction: string;
  nextActions: string[];
  escalationRecommended: boolean;
  escalationReason?: string | null;
  dataLimitations: string[];
  safetyNotes: string[];
  doNotDo: string[];
};

export interface EvidenceItem {
  sourceType: EvidenceSourceType;
  sourceId?: string;
  label: string;
  observedAt?: string;
  freshness?: EvidenceFreshness;
  reliability?: ConfidenceBand;
}

export interface AgentRisk {
  title: string;
  level: RiskLevel;
  explanation: string;
  evidence?: EvidenceItem[];
}

export interface AgentRecommendation {
  title: string;
  priority: AgentRecommendationPriority;
  rationale: string;
  action?: string;
}

export interface AgentResponse {
  agent: ExpeditionIntelligenceAgentId;
  summary: string;
  confidence: ConfidenceBand;
  riskLevel: RiskLevel;
  recommendations: AgentRecommendation[];
  risks: AgentRisk[];
  missingData: string[];
  assumptions: string[];
  evidence: EvidenceItem[];
  nextActions: AgentRecommendation[];
  userFacingExplanation: string;
}

export type ExpeditionAgentDefinition = {
  id: ExpeditionIntelligenceAgentId;
  label: string;
  lifecyclePhase: ExpeditionLifecyclePhase;
  description: string;
  defaultEnabled: boolean;
  requiredEvidenceIds: string[];
};

export type ExpeditionAgentProviderInput = {
  agent: ExpeditionAgentDefinition;
  prompt: string;
  context: ExpeditionAgentContextInput;
  contextJson: string;
};

export type ExpeditionAgentProvider = {
  generateAgentResponse(input: ExpeditionAgentProviderInput): Promise<unknown>;
};

export type ExpeditionAgentRunResult = {
  agent: ExpeditionAgentDefinition;
  response: ExpeditionAgentResponse;
  validation: ExpeditionAgentValidationResult;
  source: 'provider' | 'fallback';
};

export type ExpeditionIntelligenceRunResult = {
  generatedAt: string;
  context: ExpeditionAgentContextInput;
  results: ExpeditionAgentRunResult[];
};

export type ExpeditionAgentValidationIssue = {
  code:
    | 'missing_required_field'
    | 'invalid_agent'
    | 'invalid_phase'
    | 'invalid_status'
    | 'invalid_confidence'
    | 'missing_evidence'
    | 'missing_uncertainty'
    | 'unsafe_certainty'
    | 'unsafe_recovery_instruction'
    | 'emergency_service_replacement'
    | 'unsupported_safety_claim'
    | 'missing_emergency_escalation'
    | 'missing_verification_action'
    | 'missing_high_risk_reassessment'
    | 'insufficient_data_overconfidence';
  severity: 'error' | 'warning';
  message: string;
};

export type ExpeditionAgentValidationResult = {
  valid: boolean;
  issues: ExpeditionAgentValidationIssue[];
};

export const EXPEDITION_INTELLIGENCE_AGENT_IDS: ExpeditionIntelligenceAgentId[] = [
  'expedition_planner',
  'route_risk',
  'camp_logistics',
  'convoy_command',
  'recovery_incident',
  'debrief_intelligence',
  'community_qa',
];

export const EXPEDITION_LIFECYCLE_PHASES: ExpeditionLifecyclePhase[] = [
  'plan',
  'prepare',
  'brief',
  'navigate',
  'adapt',
  'recover',
  'debrief',
  'learn',
];

export const EXPEDITION_INTELLIGENCE_RISK_LEVELS: ExpeditionIntelligenceRiskLevel[] = [
  'normal',
  'watch',
  'caution',
  'critical',
  'unknown',
];

export const EXPEDITION_INTELLIGENCE_CONFIDENCE_LEVELS: ExpeditionIntelligenceConfidence[] = [
  'high',
  'medium',
  'low',
  'unknown',
];
