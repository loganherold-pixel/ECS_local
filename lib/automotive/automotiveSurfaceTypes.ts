import type { ECSConfidenceResult } from '../ai/confidenceTypes';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import type { ECSPriorityResult } from '../ai/priorityTypes';
import type {
  ECSOrchestratorSource,
  ECSRootConditionFamily,
} from '../ai/orchestratorTypes';

export type ECSAutomotiveCommandRole =
  | 'guidance_status'
  | 'route_warning'
  | 'exit_relevance'
  | 'resource_margin'
  | 'vehicle_warning'
  | 'status';

export type ECSAutomotiveTone = 'calm' | 'watch' | 'warning' | 'critical';

export type ECSAutomotiveEligibilityReason =
  | 'route_guidance'
  | 'route_critical'
  | 'degraded_guidance'
  | 'exit_relevant'
  | 'resource_relevant'
  | 'support_only'
  | 'suppressed';

export interface ECSAutomotiveCommandItem {
  id: string;
  title: string;
  summary: string;
  role: ECSAutomotiveCommandRole;
  tone: ECSAutomotiveTone;
  source: ECSOrchestratorSource;
  rootFamily?: ECSRootConditionFamily | null;
  confidence?: ECSConfidenceResult | null;
  priority?: ECSPriorityResult | null;
  eligibilityReason: ECSAutomotiveEligibilityReason;
}

export interface ECSAutomotiveGuidanceSummary {
  routeActive: boolean;
  routeName: string | null;
  nextManeuver: string | null;
  remainingDistanceLabel: string | null;
  etaLabel: string | null;
  progressLabel: string | null;
  statusLine: string | null;
  offlineCapable: boolean;
  gpsReduced: boolean;
}

export interface ECSAutomotiveSurfaceState {
  generatedAt: string;
  activePhase: ECSExpeditionPhase | null;
  platformStatusLabel: string;
  routeFirst: boolean;
  primaryCommand: ECSAutomotiveCommandItem | null;
  secondaryCommands: ECSAutomotiveCommandItem[];
  guidance: ECSAutomotiveGuidanceSummary;
  suppressedCandidateIds: string[];
}

export function createDefaultAutomotiveSurfaceState(): ECSAutomotiveSurfaceState {
  return {
    generatedAt: new Date(0).toISOString(),
    activePhase: null,
    platformStatusLabel: 'STANDBY',
    routeFirst: true,
    primaryCommand: null,
    secondaryCommands: [],
    guidance: {
      routeActive: false,
      routeName: null,
      nextManeuver: null,
      remainingDistanceLabel: null,
      etaLabel: null,
      progressLabel: null,
      statusLine: 'No active route',
      offlineCapable: false,
      gpsReduced: false,
    },
    suppressedCandidateIds: [],
  };
}
