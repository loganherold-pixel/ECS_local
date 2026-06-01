export type SegmentInputs = {
  noSignalIdx: number;
  roadKm: number;
  townKm: number;
  elevRelief: number;
  wildland: number;
  poiDensity: number;
};

export type SegmentScore = {
  score: number;
  label: 'A' | 'B' | 'C' | 'D';
};

export type RouteConfidenceStatus = 'green' | 'amber' | 'red';

export type RouteConfidence = {
  confidence: number;
  nextSignalMi?: number;
  status: RouteConfidenceStatus;
};

export type RouteConfidenceInputs = {
  avgRemote: number;
  cacheReady: boolean;
  powerHours: number;
  weatherRisk: number;
  teamCount: number;
  nextSignalMi?: number;
};

export type RemotenessWeights = {
  noSignal: number;
  road: number;
  town: number;
  elev: number;
  wildland: number;
  poi: number;
};
