import type { RemotenessWeights } from './types';

export const DEFAULT_WEIGHTS: RemotenessWeights = {
  noSignal: 0.30,
  road: 0.20,
  town: 0.20,
  elev: 0.10,
  wildland: 0.15,
  poi: 0.05,
};

export const SEGMENT_NORMALIZATION_LIMITS = {
  roadKm: 50,
  townKm: 100,
  elevRelief: 1500,
  poiDensity: 10,
} as const;

export const ROUTE_CONFIDENCE_STATUS_THRESHOLDS = {
  green: 75,
  amber: 45,
} as const;
