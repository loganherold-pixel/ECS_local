import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSLiveStatusResult } from '../status/liveStatusTypes';

export type ECSVehicleFitLevel =
  | 'strong_fit'
  | 'good_fit'
  | 'limited_fit'
  | 'poor_fit'
  | 'unknown_fit';

export type ECSVehicleFitResult = {
  level: ECSVehicleFitLevel;
  score: number;
  label: string;
  confidence?: ECSConfidenceResult | null;
  status?: ECSLiveStatusResult | null;
  drivers: string[];
  limitingFactors: string[];
  explanation?: ECSExplanationResult | null;
};
