import type {
  CampIntelConfidence,
  CampIntelDarknessAdjustmentState,
  CampIntelMissionMode,
} from './campIntelTypes';

export type CampRecommendationType =
  | 'stop_now'
  | 'safe_to_continue'
  | 'continue_to_better_camp'
  | 'take_backup_camp'
  | 'use_emergency_overnight_option'
  | 'do_not_pass_current_high_confidence_camp'
  | 'reassess_soon'
  | 'low_confidence_ahead';

export type CampDecisionPressureState = 'low' | 'elevated' | 'high' | 'critical';

export type CampDecisionRoutePhase =
  | 'pre_departure_planning'
  | 'active_route_travel'
  | 'late_day_search'
  | 'post_obstacle_recovery'
  | 'low_confidence_forward_exploration'
  | 'emergency_fallback_before_dark';

export type CampDecisionReassessmentType =
  | 'time_window'
  | 'route_progress'
  | 'next_viable_cluster'
  | 'conditions_change'
  | 'route_change'
  | 'offline_state_change';

export interface CampDecisionAlternativeSummary {
  siteId: string;
  label: string;
  summary: string;
}

export interface CampDecisionReassessmentTrigger {
  type: CampDecisionReassessmentType;
  label: string;
  reason: string;
}

export interface CampDecisionState {
  available: boolean;
  campRecommendationType: CampRecommendationType;
  recommendedCampId: string | null;
  recommendedAction: string;
  decisionConfidence: number;
  decisionConfidenceLabel: CampIntelConfidence;
  decisionReasons: string[];
  alternativesSummary: CampDecisionAlternativeSummary[];
  timePressureState: CampIntelDarknessAdjustmentState;
  conditionsPressureState: CampDecisionPressureState;
  resourcePressureState: CampDecisionPressureState;
  routePhase: CampDecisionRoutePhase;
  headline: string | null;
  summaryLine: string | null;
  recommendedCampLabel: string | null;
  compareContext: string[];
  nextReassessmentTrigger: CampDecisionReassessmentTrigger | null;
  recommendationStrength: 'strengthened' | 'steady' | 'weakened';
  conservativeMode: boolean;
  offlineLimited: boolean;
  sourceMissionMode: CampIntelMissionMode | null;
}
