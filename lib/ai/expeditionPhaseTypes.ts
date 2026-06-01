export type ECSExpeditionPhase =
  | 'vehicle_setup'
  | 'staging'
  | 'transit'
  | 'trail_entry'
  | 'active_expedition'
  | 'camp_stationary'
  | 'recovery_exit'
  | 'unknown';

export interface ECSExpeditionPhaseResult {
  phase: ECSExpeditionPhase;
  label: string;
  summary: string;
  reasons: string[];
}

export interface ECSExpeditionPhaseInput {
  setupComplete?: boolean;
  hasActiveVehicle?: boolean;
  hasActiveExpedition?: boolean;
  expeditionState?: 'standby' | 'active' | 'paused' | 'complete' | string | null;
  hasSelectedRoute?: boolean;
  hasActiveGuidance?: boolean;
  routeStatus?: 'not_started' | 'in_progress' | 'near_completion' | 'off_route' | 'paused' | 'unknown' | string | null;
  progressPercent?: number | null;
  speedMph?: number | null;
  remotenessScore?: number | null;
  bailoutAvailable?: boolean | null;
  campRecommended?: boolean;
  stationaryMinutes?: number | null;
  previousPhase?: ECSExpeditionPhase | null;
}
