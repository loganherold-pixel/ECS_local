import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSPriorityResult } from './priorityTypes';

export type ECSMissionScenarioLevel =
  | 'strong'
  | 'ready_with_limitations'
  | 'watch_closely'
  | 'needs_preparation'
  | 'unknown';

export type ECSMissionScenarioDimensions = {
  vehicleReadiness?: string;
  routeSuitability?: string;
  resourceSufficiency?: string;
  weatherSupport?: string;
  offlineReadiness?: string;
  bailoutMargin?: string;
};

export type ECSMissionScenarioResult = {
  level: ECSMissionScenarioLevel;
  score: number;
  label: string;
  summary: string;
  strengths: string[];
  limitations: string[];
  requiredActions: string[];
  supportingDimensions: ECSMissionScenarioDimensions;
  confidence?: ECSConfidenceResult | null;
  priority?: ECSPriorityResult | null;
  explanation?: ECSExplanationResult | null;
};
