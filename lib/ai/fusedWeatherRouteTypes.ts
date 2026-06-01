import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSOperationalState } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSPriorityResult } from './priorityTypes';

export type ECSFusedWeatherRouteRelevance =
  | 'general_weather'
  | 'route_relevant'
  | 'route_critical';

export type ECSFusedWeatherRouteAdvisoryResult = {
  relevant: boolean;
  relevance: ECSFusedWeatherRouteRelevance;
  title: string;
  summary: string;
  drivers: string[];
  confidence: ECSConfidenceResult;
  priority: ECSPriorityResult;
  explanation?: ECSExplanationResult | null;
  weatherImpactScore: number;
  softenedByFreshness: boolean;
  phase?: ECSExpeditionPhase | null;
  degradedState?: ECSOperationalState | null;
  groupKey: 'route_weather';
};
