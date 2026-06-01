export type ECSLiveStatus =
  | 'live'
  | 'estimated'
  | 'degraded'
  | 'offline_capable'
  | 'waiting'
  | 'unavailable';

export type ECSLiveStatusSourceType =
  | 'live'
  | 'synced'
  | 'manual'
  | 'inferred'
  | 'none';

export type ECSLiveStatusFreshness =
  | 'current'
  | 'recent'
  | 'stale'
  | 'unknown';

export type ECSLiveStatusDomain =
  | 'overall'
  | 'route'
  | 'weather'
  | 'telemetry'
  | 'resources'
  | 'readiness'
  | 'recommendations'
  | 'remoteness';

export type ECSLiveStatusResult = {
  status: ECSLiveStatus;
  label: string;
  shortReason?: string;
  sourceType: ECSLiveStatusSourceType;
  freshness?: ECSLiveStatusFreshness;
  usable: boolean;
};

export type ECSLiveStatusMap = Record<ECSLiveStatusDomain, ECSLiveStatusResult>;
