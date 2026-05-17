import type { ECSOperatorTrustMode } from './operatorTrustTypes';

export type ECSExplanationType =
  | 'hidden_gem'
  | 'route_risk'
  | 'route_viability'
  | 'mission_scenario'
  | 'offline_readiness'
  | 'vehicle_assessment'
  | 'remoteness'
  | 'weather'
  | 'bailout'
  | 'brief';

export type ECSExplanationContext = {
  type: ECSExplanationType;
  drivers: string[];
  confidenceLevel?: string;
  priorityLevel?: string;
  degradedState?: string;
  trustMode?: ECSOperatorTrustMode;
};

export type ECSExplanationResult = {
  text: string;
  shortText?: string;
};
