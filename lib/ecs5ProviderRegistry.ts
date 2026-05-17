export type ECS5ProviderStatus =
  | 'configured'
  | 'missing_config'
  | 'unavailable'
  | 'degraded'
  | 'stale'
  | 'intentionally_disabled'
  | 'unknown';

export type ECS5ProviderCategory =
  | 'weather'
  | 'smoke_aqi'
  | 'fire'
  | 'agency'
  | 'legal_access'
  | 'closure'
  | 'emergency'
  | 'manual';

export type ECS5ProviderId =
  | 'openweather_onecall'
  | 'openweather_road_risk'
  | 'openweather_air_pollution'
  | 'openweather_fire_index'
  | 'nws'
  | 'airnow'
  | 'nasa_firms'
  | 'nifc_wfigs'
  | 'inciweb'
  | 'usfs_mvum'
  | 'blm_plad'
  | 'nps'
  | 'state_dot_511'
  | 'state_fire_agency'
  | 'county_emergency'
  | 'manual_agency_ingestion';

export interface ECS5ProviderSourceAuthorityDefaults {
  official: boolean;
  authorityLabel: string;
  legallyAuthoritative: boolean;
  mayIndicateClosure: boolean;
  mayIndicateSafetyRisk: boolean;
}

export interface ProviderDefinition {
  id: ECS5ProviderId;
  displayName: string;
  category: ECS5ProviderCategory;
  enabled: boolean;
  required: boolean;
  requiresApiKey: boolean;
  requiredEnvVars: string[];
  status: ECS5ProviderStatus;
  lastCheckedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastError: string | null;
  knownLimitations: string[];
  sourceAuthorityDefaults: ECS5ProviderSourceAuthorityDefaults;
  cacheTtlSeconds: number;
  staleAfterSeconds: number;
}

export type ECS5ProviderEnv = Record<string, string | undefined>;

export interface ECS5ProviderRuntimeState {
  providerId: ECS5ProviderId;
  lastCheckedAt?: string | null;
  lastSuccessfulFetchAt?: string | null;
  lastError?: string | null;
  unavailable?: boolean;
}

export interface ECS5ProviderRegistry {
  generatedAt: string;
  providers: ProviderDefinition[];
}

export const ECS5_ACTIVE_PROVIDER_IDS: ECS5ProviderId[] = [
  'openweather_onecall',
  'nws',
  'airnow',
  'nasa_firms',
  'nifc_wfigs',
  'inciweb',
  'usfs_mvum',
  'blm_plad',
  'nps',
  'state_dot_511',
  'state_fire_agency',
  'county_emergency',
  'manual_agency_ingestion',
];

export const ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS: ECS5ProviderId[] = [
  'openweather_road_risk',
  'openweather_air_pollution',
  'openweather_fire_index',
];

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'on']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'off']);
const DEFAULT_TTL_SECONDS = 15 * 60;
const DEFAULT_STALE_AFTER_SECONDS = 2 * 60 * 60;

type ProviderTemplate = Omit<
  ProviderDefinition,
  'enabled' | 'status' | 'lastCheckedAt' | 'lastSuccessfulFetchAt' | 'lastError'
> & {
  enableEnvVar: string;
  defaultEnabled: boolean;
  intentionallyDisabled?: boolean;
};

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openweather_onecall',
    displayName: 'OpenWeather One Call',
    category: 'weather',
    enableEnvVar: 'ENABLE_OPENWEATHER_ONECALL',
    defaultEnabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['OPENWEATHER_API_KEY'],
    knownLimitations: ['Weather provider only; does not establish route legality or passability.'],
    sourceAuthorityDefaults: authority('OpenWeather', false, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'openweather_road_risk',
    displayName: 'OpenWeather Road Risk API',
    category: 'weather',
    enableEnvVar: 'ENABLE_OPENWEATHER_ROAD_RISK',
    defaultEnabled: false,
    intentionallyDisabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['OPENWEATHER_API_KEY'],
    knownLimitations: ['Intentionally disabled for current ECS 5.0 scope.'],
    sourceAuthorityDefaults: authority('OpenWeather Road Risk', false, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'openweather_air_pollution',
    displayName: 'OpenWeather Air Pollution API',
    category: 'smoke_aqi',
    enableEnvVar: 'ENABLE_OPENWEATHER_AIR_POLLUTION',
    defaultEnabled: false,
    intentionallyDisabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['OPENWEATHER_API_KEY'],
    knownLimitations: ['Intentionally disabled for current ECS 5.0 scope.'],
    sourceAuthorityDefaults: authority('OpenWeather Air Pollution', false, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'openweather_fire_index',
    displayName: 'OpenWeather Fire Weather Index API',
    category: 'fire',
    enableEnvVar: 'ENABLE_OPENWEATHER_FIRE_INDEX',
    defaultEnabled: false,
    intentionallyDisabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['OPENWEATHER_API_KEY'],
    knownLimitations: ['Intentionally disabled for current ECS 5.0 scope.'],
    sourceAuthorityDefaults: authority('OpenWeather Fire Weather Index', false, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'nws',
    displayName: 'National Weather Service API',
    category: 'weather',
    enableEnvVar: 'ENABLE_NWS',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: ['NWS_USER_AGENT'],
    knownLimitations: [
      'us_only_or_us_territories',
      'weather_only',
      'not_legal_access_authority',
      'not_closure_authority',
    ],
    sourceAuthorityDefaults: authority('National Weather Service', true, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'airnow',
    displayName: 'AirNow API',
    category: 'smoke_aqi',
    enableEnvVar: 'ENABLE_AIRNOW',
    defaultEnabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['AIRNOW_API_KEY'],
    knownLimitations: [
      'preliminary_air_quality_data',
      'not_regulatory_data',
      'not_legal_authority',
      'not_closure_authority',
      'may_have_delayed_updates',
    ],
    sourceAuthorityDefaults: authority('AirNow', true, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'nasa_firms',
    displayName: 'NASA FIRMS',
    category: 'fire',
    enableEnvVar: 'ENABLE_NASA_FIRMS',
    defaultEnabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['NASA_FIRMS_MAP_KEY'],
    knownLimitations: [
      'satellite_detection_not_ground_confirmation',
      'not_legal_closure_order',
      'false_positives_possible',
      'detection_time_depends_on_satellite_pass',
    ],
    sourceAuthorityDefaults: authority('NASA FIRMS', true, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'nifc_wfigs',
    displayName: 'NIFC / WFIGS',
    category: 'fire',
    enableEnvVar: 'ENABLE_NIFC_WFIGS',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: [],
    knownLimitations: [
      'perimeter_not_legal_closure_by_itself',
      'update_frequency_varies',
      'use_active_current_layers_for_current_route_decisions',
    ],
    sourceAuthorityDefaults: authority('NIFC / WFIGS', true, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'inciweb',
    displayName: 'InciWeb',
    category: 'fire',
    enableEnvVar: 'ENABLE_INCIWEB',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: [],
    knownLimitations: [
      'webpage_or_feed_structure_may_change',
      'incident_context_not_always_geometry',
      'closure_language_requires_careful_parsing',
    ],
    sourceAuthorityDefaults: authority('InciWeb', true, false, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'usfs_mvum',
    displayName: 'USFS MVUM',
    category: 'legal_access',
    enableEnvVar: 'ENABLE_USFS_MVUM',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: [],
    knownLimitations: ['Static legal access data must be checked against active closure orders.'],
    sourceAuthorityDefaults: authority('USFS MVUM', true, true, false),
    cacheTtlSeconds: 24 * 60 * 60,
    staleAfterSeconds: 30 * 24 * 60 * 60,
  },
  {
    id: 'blm_plad',
    displayName: 'BLM PLAD',
    category: 'legal_access',
    enableEnvVar: 'ENABLE_BLM_PLAD',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: [],
    knownLimitations: ['Static legal/access data must be checked against active closures and local notices.'],
    sourceAuthorityDefaults: authority('BLM PLAD', true, true, false),
    cacheTtlSeconds: 24 * 60 * 60,
    staleAfterSeconds: 30 * 24 * 60 * 60,
  },
  {
    id: 'nps',
    displayName: 'National Park Service API',
    category: 'agency',
    enableEnvVar: 'ENABLE_NPS',
    defaultEnabled: true,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['NPS_API_KEY'],
    knownLimitations: ['Agency information must be checked for site-specific closures and alerts.'],
    sourceAuthorityDefaults: authority('National Park Service', true, true, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'state_dot_511',
    displayName: 'State DOT / 511',
    category: 'closure',
    enableEnvVar: 'ENABLE_STATE_DOT_511',
    defaultEnabled: false,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['STATE_DOT_511_PROVIDER', 'STATE_DOT_511_API_KEY', 'STATE_DOT_511_BASE_URL'],
    knownLimitations: ['Provider coverage and event semantics vary by state.'],
    sourceAuthorityDefaults: authority('State DOT / 511', true, true, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'state_fire_agency',
    displayName: 'State Fire Agency',
    category: 'fire',
    enableEnvVar: 'ENABLE_STATE_FIRE_AGENCY',
    defaultEnabled: false,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['STATE_FIRE_AGENCY_PROVIDER', 'STATE_FIRE_AGENCY_BASE_URL'],
    knownLimitations: ['Provider coverage and data contract vary by state.'],
    sourceAuthorityDefaults: authority('State Fire Agency', true, true, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'county_emergency',
    displayName: 'County / Local Emergency Feeds',
    category: 'emergency',
    enableEnvVar: 'ENABLE_COUNTY_EMERGENCY_FEEDS',
    defaultEnabled: false,
    required: false,
    requiresApiKey: true,
    requiredEnvVars: ['COUNTY_EMERGENCY_PROVIDER', 'COUNTY_EMERGENCY_BASE_URL'],
    knownLimitations: ['Local feed availability, accuracy, and update cadence vary by county.'],
    sourceAuthorityDefaults: authority('County / Local Emergency', true, true, true),
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
  },
  {
    id: 'manual_agency_ingestion',
    displayName: 'Manual Agency Ingestion',
    category: 'manual',
    enableEnvVar: 'ENABLE_MANUAL_AGENCY_INGESTION',
    defaultEnabled: true,
    required: false,
    requiresApiKey: false,
    requiredEnvVars: [],
    knownLimitations: ['Manual source quality depends on operator verification and timestamp discipline.'],
    sourceAuthorityDefaults: authority('Manual Agency Ingestion', true, true, true),
    cacheTtlSeconds: 0,
    staleAfterSeconds: 7 * 24 * 60 * 60,
  },
];

export function createECS5ProviderRegistry(
  env: ECS5ProviderEnv = getProcessEnv(),
  runtimeStates: ECS5ProviderRuntimeState[] = [],
  now = new Date(),
): ECS5ProviderRegistry {
  const runtimeByProvider = new Map(runtimeStates.map((state) => [state.providerId, state]));
  return {
    generatedAt: now.toISOString(),
    providers: PROVIDER_TEMPLATES.map((template) => {
      const { enableEnvVar: _enableEnvVar, defaultEnabled: _defaultEnabled, intentionallyDisabled: _intentionallyDisabled, ...definition } = template;
      const enabled = resolveProviderEnabled(template, env);
      const runtime: Partial<ECS5ProviderRuntimeState> = runtimeByProvider.get(template.id) ?? {};
      const status = resolveProviderStatus(template, enabled, env, runtime, now);
      return {
        ...definition,
        enabled,
        status,
        lastCheckedAt: runtime.lastCheckedAt ?? null,
        lastSuccessfulFetchAt: runtime.lastSuccessfulFetchAt ?? null,
        lastError: sanitizeError(runtime.lastError),
      };
    }),
  };
}

export function getProviderConfig(
  providerId: ECS5ProviderId,
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): ProviderDefinition | null {
  return registry.providers.find((provider) => provider.id === providerId) ?? null;
}

export function getProviderHealth(
  providerId: ECS5ProviderId,
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): ProviderDefinition | null {
  return getProviderConfig(providerId, registry);
}

export function listProviderHealth(
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): ProviderDefinition[] {
  return registry.providers.map((provider) => ({ ...provider }));
}

export function assertProviderConfigured(
  providerId: ECS5ProviderId,
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): ProviderDefinition {
  const provider = getProviderConfig(providerId, registry);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (provider.status !== 'configured') {
    throw new Error(`${provider.displayName} is ${provider.status}.`);
  }
  return provider;
}

export function isProviderEnabled(
  providerId: ECS5ProviderId,
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): boolean {
  return getProviderConfig(providerId, registry)?.enabled === true;
}

export function isProviderIntentionallyDisabled(
  providerId: ECS5ProviderId,
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): boolean {
  return getProviderConfig(providerId, registry)?.status === 'intentionally_disabled';
}

export function providerHealthSnapshotForAdmin(
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
): Array<Omit<ProviderDefinition, 'requiredEnvVars'> & { requiredEnvVars: string[] }> {
  return registry.providers.map((provider) => ({
    ...provider,
    requiredEnvVars: [...provider.requiredEnvVars],
    lastError: sanitizeError(provider.lastError),
  }));
}

function resolveProviderEnabled(template: ProviderTemplate, env: ECS5ProviderEnv): boolean {
  if (template.intentionallyDisabled) return false;
  if (template.id === 'openweather_onecall' && parseBoolean(env.ENABLE_OPENWEATHER, true) === false) {
    return false;
  }
  return parseBoolean(env[template.enableEnvVar], template.defaultEnabled);
}

function resolveProviderStatus(
  template: ProviderTemplate,
  enabled: boolean,
  env: ECS5ProviderEnv,
  runtime: Partial<ECS5ProviderRuntimeState>,
  now: Date,
): ECS5ProviderStatus {
  if (template.intentionallyDisabled || !enabled) return 'intentionally_disabled';
  if (missingRequiredEnvVars(template, env).length > 0) return 'missing_config';
  if (runtime.unavailable) return 'unavailable';
  if (runtime.lastSuccessfulFetchAt && isStale(runtime.lastSuccessfulFetchAt, template.staleAfterSeconds, now)) return 'stale';
  if (runtime.lastError) return runtime.lastSuccessfulFetchAt ? 'degraded' : 'unavailable';
  return 'configured';
}

function missingRequiredEnvVars(template: ProviderTemplate, env: ECS5ProviderEnv): string[] {
  if (template.intentionallyDisabled) return [];
  return template.requiredEnvVars.filter((key) => !hasValue(env[key]));
}

function authority(
  authorityLabel: string,
  official: boolean,
  mayIndicateClosure: boolean,
  mayIndicateSafetyRisk: boolean,
): ECS5ProviderSourceAuthorityDefaults {
  return {
    authorityLabel,
    official,
    legallyAuthoritative: official && mayIndicateClosure,
    mayIndicateClosure,
    mayIndicateSafetyRisk,
  };
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  return fallback;
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() !== '""';
}

function sanitizeError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .slice(0, 240);
}

function isStale(value: string, staleAfterSeconds: number, now: Date): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return now.getTime() - parsed > staleAfterSeconds * 1000;
}

function getProcessEnv(): ECS5ProviderEnv {
  return typeof process !== 'undefined' ? process.env as ECS5ProviderEnv : {};
}
