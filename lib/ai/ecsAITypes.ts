export type ECSAISourceTruth =
  | 'live'
  | 'cached'
  | 'estimated'
  | 'manual'
  | 'simulated'
  | 'unavailable';

export type ECSAIInput<T = unknown> = {
  value: T | null;
  truth: ECSAISourceTruth;
  confidence?: number;
  updatedAt?: string;
  sourceName?: string;
};

export type ECSAISeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export type ECSAIAction = {
  label: string;
  type:
    | 'open_fleet'
    | 'open_navigate'
    | 'open_weather'
    | 'open_dispatch'
    | 'open_campops'
    | 'open_power'
    | 'open_telemetry'
    | 'dismiss'
    | 'custom';
  payload?: Record<string, unknown>;
};

export type ECSAIAdvisory = {
  id: string;
  title: string;
  message: string;
  detail?: string;
  severity: ECSAISeverity;
  confidence: number;
  sourceTruth: ECSAISourceTruth[];
  sourceTypes: string[];
  suppressKey: string;
  createdAt: string;
  expiresAt?: string;
  actions?: ECSAIAction[];
};

export type ECSAIAdvisorySurface =
  | 'dashboard'
  | 'navigate'
  | 'fleet'
  | 'explore'
  | 'campops'
  | 'dispatch'
  | 'weather'
  | 'power'
  | 'telemetry'
  | 'brief';

export type ECSAIAdvisoryContext = {
  currentRoute: ECSAIInput;
  navigation: ECSAIInput;
  location: ECSAIInput;
  weather: ECSAIInput;
  vehicleProfile: ECSAIInput;
  vehicleWeight: ECSAIInput<number>;
  loadout: ECSAIInput;
  campCandidates: ECSAIInput;
  telemetry: ECSAIInput;
  power: ECSAIInput;
  offlineCache: ECSAIInput;
  appSurface: ECSAIAdvisorySurface | 'unknown';
};
