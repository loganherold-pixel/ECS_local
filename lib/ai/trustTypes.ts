export type ECSTrustConfidenceLabel = 'Low' | 'Medium' | 'High';

export type ECSTrustSourceBasis =
  | 'Live'
  | 'Cached'
  | 'Profile'
  | 'Inferred';

export type ECSTrustFreshnessState =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'unavailable';

export type ECSTrustModeLabel =
  | 'ECS Live'
  | 'ECS Limited'
  | 'ECS Cached'
  | 'ECS Offline Support'
  | 'ECS Syncing Context';

export type ECSTrustGateDecision = 'allow' | 'downgrade' | 'suppress';

export interface ECSTrustMetadata {
  confidence: ECSTrustConfidenceLabel;
  sourceBasis: ECSTrustSourceBasis;
  freshness: ECSTrustFreshnessState;
  freshnessLabel: string;
  mode: ECSTrustModeLabel;
  explanationSummary: string | null;
  asOfLabel: string | null;
  decision: ECSTrustGateDecision;
  suppressionReason: string | null;
}
