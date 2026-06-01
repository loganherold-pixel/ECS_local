import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSLiveStatusResult } from '../status/liveStatusTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSPriorityResult } from './priorityTypes';

export type ECSRouteViabilityLevel =
  | 'viable'
  | 'watch_closely'
  | 'limited_margin'
  | 'exit_recommended'
  | 'unknown';

export type ECSRouteViabilityResult = {
  level: ECSRouteViabilityLevel;
  score: number;
  label: string;
  confidence?: ECSConfidenceResult | null;
  status?: ECSLiveStatusResult | null;
  priority?: ECSPriorityResult | null;
  drivers: string[];
  bailoutRelevant: boolean;
  bailoutSummary?: string;
  explanation?: ECSExplanationResult | null;
  groupKey: 'route_viability';
};
