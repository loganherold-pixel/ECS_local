export type ECSOperationalState =
  | 'fully_operational'
  | 'degraded'
  | 'limited'
  | 'offline_capable'
  | 'unavailable';

export interface ECSDegradedOperationsResult {
  state: ECSOperationalState;
  shortLabel: string;
  summary: string;
  workingSystems: string[];
  degradedSystems: string[];
  unavailableSystems: string[];
  operatorActions: string[];
}

export interface ECSDegradedOperationsInput {
  hasActiveRoute?: boolean;
  routeGuidanceRequested?: boolean;
  hasRouteGeometry?: boolean;
  hasCachedMapData?: boolean;
  offlineCacheState?: 'healthy' | 'watch' | 'warning' | 'critical' | 'unknown' | null;
  gpsStatus?: string | null;
  connectivityLevel?: 'no_service' | 'limited' | 'normal' | 'unknown' | string | null;
  connectivityOnline?: boolean | null;
  weatherAvailable?: boolean;
  weatherStaleness?: 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown' | string | null;
  telemetryAvailable?: boolean;
  telemetryState?: string | null;
  bleConnected?: boolean | null;
  manualBaselineAvailable?: boolean;
  routeIntelligenceAvailable?: boolean;
  terrainIntelligenceAvailable?: boolean;
  routeRiskAvailable?: boolean;
  remotenessAvailable?: boolean;
  forecastAvailable?: boolean;
  cloudDependentRecommendations?: boolean;
}
