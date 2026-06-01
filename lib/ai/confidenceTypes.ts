export type ECSConfidenceDomain =
  | 'route_intelligence'
  | 'trail_risk'
  | 'route_viability'
  | 'mission_scenario'
  | 'offline_readiness'
  | 'remoteness'
  | 'weather'
  | 'telemetry'
  | 'vehicle_assessment'
  | 'explore_recommendation'
  | 'ecs_brief';

export type ECSConfidenceLevel =
  | 'high'
  | 'moderate'
  | 'limited'
  | 'low'
  | 'unknown';

export type ECSConfidenceReason =
  | 'live_multi_source'
  | 'live_single_source'
  | 'manual_only'
  | 'estimated_partial'
  | 'stale_data'
  | 'conflicting_inputs'
  | 'offline_estimate'
  | 'missing_required_inputs'
  | 'awaiting_signal';

export type ECSConfidenceSourceOrigin = 'live' | 'manual' | 'inferred';

export type ECSConfidenceFreshness =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'unknown';

export type ECSConfidencePriority = 'critical' | 'high' | 'normal' | 'low';

export interface ECSConfidenceSourceInput {
  id: string;
  origin: ECSConfidenceSourceOrigin;
  available?: boolean;
  required?: boolean;
  freshness?: ECSConfidenceFreshness;
  priority?: ECSConfidencePriority;
  agrees?: boolean | null;
}

export interface ECSConfidenceInput {
  domain: ECSConfidenceDomain;
  sources: ECSConfidenceSourceInput[];
  offline?: boolean;
  degraded?: boolean;
  cloudDependent?: boolean;
  awaitingSignal?: boolean;
  capLevel?: ECSConfidenceLevel;
}

export type ECSConfidenceResult = {
  level: ECSConfidenceLevel;
  score: number;
  label: string;
  shortReason: string;
  reasons: ECSConfidenceReason[];
  sourceSummary: {
    live: number;
    manual: number;
    inferred: number;
    stale: number;
    missing: number;
  };
};
