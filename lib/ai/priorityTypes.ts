import type { ECSConfidenceLevel, ECSConfidenceResult } from './confidenceTypes';

export type ECSPriorityLevel =
  | 'informational'
  | 'advisory'
  | 'caution'
  | 'warning'
  | 'critical';

export type ECSPriorityHapticPattern = 'none' | 'soft' | 'medium' | 'strong';

export type ECSPriorityReason =
  | 'routine_update'
  | 'passive_recommendation'
  | 'planning_readiness'
  | 'route_risk'
  | 'bailout_relevance'
  | 'weather_exposure'
  | 'remoteness_exposure'
  | 'vehicle_fit'
  | 'resource_margin'
  | 'telemetry_degraded'
  | 'provider_disconnect'
  | 'guidance_signal_loss'
  | 'attitude_threshold'
  | 'safety_workflow'
  | 'offline_degraded'
  | 'limited_confidence'
  | 'missing_signal'
  | 'watch_condition';

export type ECSPriorityDomain =
  | 'route_risk'
  | 'route_viability'
  | 'mission_scenario'
  | 'weather'
  | 'remoteness'
  | 'vehicle_assessment'
  | 'resource'
  | 'telemetry'
  | 'ble'
  | 'gps'
  | 'attitude'
  | 'safety'
  | 'offline'
  | 'signal'
  | 'ecs_brief';

export type ECSPriorityConfidenceInput =
  | ECSConfidenceLevel
  | Pick<ECSConfidenceResult, 'level' | 'score'>
  | null
  | undefined;

export type ECSPriorityResult = {
  level: ECSPriorityLevel;
  rank: number;
  title: string;
  shortReason: string;
  interruptive: boolean;
  requiresBanner: boolean;
  requiresAlertSurface: boolean;
  hapticPattern?: ECSPriorityHapticPattern;
  domain?: ECSPriorityDomain;
  reasons?: ECSPriorityReason[];
  sourceKey?: string;
};
