import type {
  SourceTruthAvailability,
  SourceTruthConfidence,
  SourceTruthFreshness,
  SourceTruthOrigin,
} from '../sourceTruth';

export type ECSAutomotiveActionableStatus =
  | 'nominal'
  | 'watch'
  | 'warning'
  | 'critical'
  | 'unavailable';

export type ECSAutomotiveSafeSource =
  | 'ecs_guidance'
  | 'gps'
  | 'weather_provider'
  | 'device_sensor'
  | 'vehicle_telemetry'
  | 'bluetooth'
  | 'manual'
  | 'cached'
  | 'mixed'
  | 'inferred'
  | 'unavailable';

export interface ECSAutomotiveSafeValue<T> {
  value: T | null;
  source: ECSAutomotiveSafeSource;
  sourceLabel: string;
  origin: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  confidence: SourceTruthConfidence;
  availability: SourceTruthAvailability;
  actionableStatus: ECSAutomotiveActionableStatus;
  lastUpdatedAt: string | null;
}

export interface ECSAutomotiveResourceValueProjection {
  fuel: ECSAutomotiveSafeValue<number>;
  water: ECSAutomotiveSafeValue<number>;
  power: ECSAutomotiveSafeValue<number>;
  alternateFluid: ECSAutomotiveSafeValue<number>;
}

export interface ECSAutomotivePositionValue {
  lat: number;
  lon: number;
  headingDeg: number | null;
  speedMph: number | null;
}

export interface ECSAutomotiveSafeProjection<
  TNavigation = unknown,
  TAttitude = unknown,
  TResources = unknown,
  TWeather = unknown,
  TExitPlan = unknown,
> {
  schemaVersion: 'ecs.automotive-safe.v1';
  generatedAt: string;
  navigation: ECSAutomotiveSafeValue<TNavigation> & {
    position: ECSAutomotiveSafeValue<ECSAutomotivePositionValue>;
  };
  attitude: ECSAutomotiveSafeValue<TAttitude>;
  resources: ECSAutomotiveSafeValue<TResources> & {
    values: ECSAutomotiveResourceValueProjection;
  };
  weatherHazard: ECSAutomotiveSafeValue<TWeather>;
  exitPlan: ECSAutomotiveSafeValue<TExitPlan>;
}
