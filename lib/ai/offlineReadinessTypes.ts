import type { ECSAIContext } from '../aiContextBuilder';
import type { ConnectivitySummary } from '../connectivityIntelTypes';
import type { CacheReadinessSnapshot } from '../offlineCacheAwarenessEngine';
import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSPriorityResult } from './priorityTypes';

export type ECSOfflineReadinessLevel =
  | 'ready'
  | 'ready_with_limitations'
  | 'partial'
  | 'limited'
  | 'not_ready';

export type ECSOfflineReadinessDrivers = {
  routeRelevant: boolean;
  planningRelevant: boolean;
  isOnline: boolean;
  cacheSummary: ConnectivitySummary;
  cacheSnapshot: CacheReadinessSnapshot;
  hasMapCoverage: boolean;
  hasAnyOfflineCache: boolean;
  hasLocalRoute: boolean;
  hasCachedRouteCoverage: boolean;
  hasExpeditionData: boolean;
  hasExpeditionCoverage: boolean;
  gpsReady: boolean;
  gpsWaiting: boolean;
  gpsUnavailable: boolean;
  hasManualBaseline: boolean;
  hasWeatherSupport: boolean;
  weatherFresh: boolean;
  weatherStale: boolean;
  telemetryRequiresLiveConnection: boolean;
  syncFresh: boolean;
};

export type ECSOfflineReadinessResult = {
  level: ECSOfflineReadinessLevel;
  score: number;
  label: string;
  summary: string;
  readySystems: string[];
  limitedSystems: string[];
  missingSystems: string[];
  operatorActions: string[];
  drivers: ECSOfflineReadinessDrivers;
  confidence?: ECSConfidenceResult | null;
  priority?: ECSPriorityResult | null;
  explanation?: ECSExplanationResult | null;
};

export type ComputeOfflineReadinessArgs = {
  richContext: ECSAIContext;
};
