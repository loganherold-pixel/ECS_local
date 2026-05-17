export type GarminInreachMode =
  | 'off'
  | 'mapshare'
  | 'ipc_readonly'
  | 'ipc_command';

export interface GarminInreachFeatureFlags {
  garminInreachEnabled: boolean;
  garminInreachInboundEventsEnabled: boolean;
  garminInreachOutboundCommandsEnabled: boolean;
  garminInreachSosSignalsEnabled: boolean;
}

export interface GarminInreachSecretConfig {
  apiBaseUrlEnvKey?: string;
  apiTokenEnvKey?: string;
  webhookSecretEnvKey?: string;
  webhookStaticToken?: string;
  ipcBaseUrl?: string;
  ipcApiKey?: string;
}

export interface GarminInreachIntegrationConfig {
  flags: GarminInreachFeatureFlags;
  mode: GarminInreachMode;
  secrets: GarminInreachSecretConfig;
  kmlFeeds: string[];
  mapSharePollIntervalMs: number;
  mapShareStaleAfterMs: number;
  demoKmlEnabled: boolean;
  logPii: boolean;
  requireExplicitOperatorConfirmation: true;
  commandsRequireConfirmation: true;
  allowSosConfirmCancelAutomation: false;
}

export type GarminInreachEnv = Record<string, string | undefined>;

export const GARMIN_INREACH_ENV_KEYS = {
  enabled: 'GARMIN_INREACH_ENABLED',
  mode: 'GARMIN_INREACH_MODE',
  commandsRequireConfirmation: 'GARMIN_INREACH_COMMANDS_REQUIRE_CONFIRMATION',
  webhookStaticToken: 'GARMIN_INREACH_WEBHOOK_STATIC_TOKEN',
  ipcBaseUrl: 'GARMIN_INREACH_IPC_BASE_URL',
  ipcApiKey: 'GARMIN_INREACH_IPC_API_KEY',
  kmlFeeds: 'GARMIN_INREACH_KML_FEEDS',
  mapSharePollIntervalSeconds: 'GARMIN_INREACH_MAPSHARE_POLL_INTERVAL_SECONDS',
  mapShareStaleAfterMinutes: 'GARMIN_INREACH_MAPSHARE_STALE_AFTER_MINUTES',
  demoKmlEnabled: 'GARMIN_INREACH_DEMO_KML_ENABLED',
  mapSharePollIntervalMs: 'GARMIN_INREACH_MAPSHARE_POLL_INTERVAL_MS',
  mapShareStaleAfterMs: 'GARMIN_INREACH_MAPSHARE_STALE_AFTER_MS',
  logPii: 'GARMIN_INREACH_LOG_PII',
} as const;

export const GARMIN_INREACH_MIN_MAPSHARE_POLL_INTERVAL_MS = 5 * 60 * 1000;
export const GARMIN_INREACH_DEFAULT_MAPSHARE_POLL_INTERVAL_MS = 5 * 60 * 1000;
export const GARMIN_INREACH_DEFAULT_MAPSHARE_STALE_AFTER_MS = 30 * 60 * 1000;

export const DEFAULT_GARMIN_INREACH_FEATURE_FLAGS: GarminInreachFeatureFlags = {
  garminInreachEnabled: false,
  garminInreachInboundEventsEnabled: false,
  garminInreachOutboundCommandsEnabled: false,
  garminInreachSosSignalsEnabled: false,
};

export const DEFAULT_GARMIN_INREACH_CONFIG: GarminInreachIntegrationConfig = {
  flags: DEFAULT_GARMIN_INREACH_FEATURE_FLAGS,
  mode: 'off',
  secrets: {
    apiBaseUrlEnvKey: 'ECS_GARMIN_INREACH_API_BASE_URL',
    apiTokenEnvKey: 'ECS_GARMIN_INREACH_API_TOKEN',
    webhookSecretEnvKey: 'ECS_GARMIN_INREACH_WEBHOOK_SECRET',
  },
  kmlFeeds: [],
  mapSharePollIntervalMs: GARMIN_INREACH_DEFAULT_MAPSHARE_POLL_INTERVAL_MS,
  mapShareStaleAfterMs: GARMIN_INREACH_DEFAULT_MAPSHARE_STALE_AFTER_MS,
  demoKmlEnabled: false,
  logPii: false,
  requireExplicitOperatorConfirmation: true,
  commandsRequireConfirmation: true,
  allowSosConfirmCancelAutomation: false,
};

export function resolveGarminInreachConfig(
  overrides: Omit<Partial<GarminInreachIntegrationConfig>, 'commandsRequireConfirmation'> & {
    commandsRequireConfirmation?: boolean;
    flags?: Partial<GarminInreachFeatureFlags>;
    secrets?: Partial<GarminInreachSecretConfig>;
  } = {},
): GarminInreachIntegrationConfig {
  return {
    ...DEFAULT_GARMIN_INREACH_CONFIG,
    ...overrides,
    flags: {
      ...DEFAULT_GARMIN_INREACH_FEATURE_FLAGS,
      ...(overrides.flags ?? {}),
    },
    secrets: {
      ...DEFAULT_GARMIN_INREACH_CONFIG.secrets,
      ...(overrides.secrets ?? {}),
    },
    mode: normalizeGarminInreachMode(overrides.mode) ?? DEFAULT_GARMIN_INREACH_CONFIG.mode,
    kmlFeeds: normalizeKmlFeeds(overrides.kmlFeeds),
    mapSharePollIntervalMs: normalizeMapSharePollInterval(overrides.mapSharePollIntervalMs),
    mapShareStaleAfterMs: normalizePositiveMs(
      overrides.mapShareStaleAfterMs,
      GARMIN_INREACH_DEFAULT_MAPSHARE_STALE_AFTER_MS,
    ),
    demoKmlEnabled: overrides.demoKmlEnabled === true,
    logPii: overrides.logPii === true,
    requireExplicitOperatorConfirmation: true,
    commandsRequireConfirmation: true,
    allowSosConfirmCancelAutomation: false,
  };
}

export function isGarminInreachFeatureEnabled(
  config: GarminInreachIntegrationConfig,
  feature: keyof GarminInreachFeatureFlags,
): boolean {
  return config.flags.garminInreachEnabled && config.flags[feature] === true;
}

export function resolveGarminInreachConfigFromEnv(env: GarminInreachEnv = getProcessEnv()): GarminInreachIntegrationConfig {
  const enabled = parseBoolean(env[GARMIN_INREACH_ENV_KEYS.enabled], false);
  const mode = enabled
    ? normalizeGarminInreachMode(env[GARMIN_INREACH_ENV_KEYS.mode]) ?? 'off'
    : 'off';
  const commandsRequireConfirmation = parseBoolean(
    env[GARMIN_INREACH_ENV_KEYS.commandsRequireConfirmation],
    true,
  );

  return resolveGarminInreachConfig({
    flags: {
      garminInreachEnabled: enabled,
      garminInreachInboundEventsEnabled: enabled && (mode === 'ipc_readonly' || mode === 'ipc_command'),
      garminInreachOutboundCommandsEnabled: enabled && mode === 'ipc_command',
      garminInreachSosSignalsEnabled: enabled && (mode === 'ipc_readonly' || mode === 'ipc_command'),
    },
    mode,
    secrets: {
      webhookStaticToken: normalizeOptionalSecret(env[GARMIN_INREACH_ENV_KEYS.webhookStaticToken]),
      ipcBaseUrl: normalizeOptionalUrl(env[GARMIN_INREACH_ENV_KEYS.ipcBaseUrl]),
      ipcApiKey: normalizeOptionalSecret(env[GARMIN_INREACH_ENV_KEYS.ipcApiKey]),
    },
    commandsRequireConfirmation,
    kmlFeeds: normalizeKmlFeeds(env[GARMIN_INREACH_ENV_KEYS.kmlFeeds]),
    mapSharePollIntervalMs: normalizeMapSharePollInterval(
      env[GARMIN_INREACH_ENV_KEYS.mapSharePollIntervalSeconds] != null
        ? Number(env[GARMIN_INREACH_ENV_KEYS.mapSharePollIntervalSeconds]) * 1000
        : env[GARMIN_INREACH_ENV_KEYS.mapSharePollIntervalMs],
    ),
    mapShareStaleAfterMs: normalizePositiveMs(
      env[GARMIN_INREACH_ENV_KEYS.mapShareStaleAfterMinutes] != null
        ? Number(env[GARMIN_INREACH_ENV_KEYS.mapShareStaleAfterMinutes]) * 60 * 1000
        : env[GARMIN_INREACH_ENV_KEYS.mapShareStaleAfterMs],
      GARMIN_INREACH_DEFAULT_MAPSHARE_STALE_AFTER_MS,
    ),
    demoKmlEnabled: parseBoolean(env[GARMIN_INREACH_ENV_KEYS.demoKmlEnabled], false),
    logPii: parseBoolean(env[GARMIN_INREACH_ENV_KEYS.logPii], false),
  });
}

export function shouldRunGarminInreachIntegration(config: GarminInreachIntegrationConfig): boolean {
  return config.flags.garminInreachEnabled && config.mode !== 'off';
}

export function supportsGarminMapShareKmlIngestion(config: GarminInreachIntegrationConfig): boolean {
  return shouldRunGarminInreachIntegration(config) && config.mode === 'mapshare';
}

export function supportsGarminInboundData(config: GarminInreachIntegrationConfig): boolean {
  return shouldRunGarminInreachIntegration(config) && (
    config.mode === 'ipc_readonly' ||
    config.mode === 'ipc_command'
  );
}

export function supportsGarminOutboundCommands(config: GarminInreachIntegrationConfig): boolean {
  return shouldRunGarminInreachIntegration(config) &&
    config.mode === 'ipc_command' &&
    config.commandsRequireConfirmation === true;
}

export function shouldLogGarminPii(config: GarminInreachIntegrationConfig): boolean {
  return shouldRunGarminInreachIntegration(config) && config.logPii === true;
}

export function createGarminInreachSafeConfigSnapshot(
  config: GarminInreachIntegrationConfig,
): Record<string, unknown> {
  return {
    enabled: config.flags.garminInreachEnabled,
    mode: config.mode,
    commandsRequireConfirmation: config.commandsRequireConfirmation,
    hasWebhookStaticToken: !!config.secrets.webhookStaticToken,
    hasIpcBaseUrl: !!config.secrets.ipcBaseUrl,
    hasIpcApiKey: !!config.secrets.ipcApiKey,
    kmlFeedCount: config.kmlFeeds.length,
    mapSharePollIntervalMs: config.mapSharePollIntervalMs,
    mapShareStaleAfterMs: config.mapShareStaleAfterMs,
    demoKmlEnabled: config.demoKmlEnabled,
    logPii: config.logPii,
  };
}

function normalizeGarminInreachMode(value: unknown): GarminInreachMode | null {
  return value === 'off' ||
    value === 'mapshare' ||
    value === 'ipc_readonly' ||
    value === 'ipc_command'
    ? value
    : null;
}

function normalizeKmlFeeds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((feed) => normalizeOptionalUrl(feed))
      .filter((feed): feed is string => !!feed);
  }

  if (typeof value !== 'string') return [];

  return value
    .split(/[\n,;]/)
    .map((feed) => normalizeOptionalUrl(feed))
    .filter((feed): feed is string => !!feed);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function normalizeOptionalSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

function normalizeMapSharePollInterval(value: unknown): number {
  return Math.max(
    GARMIN_INREACH_MIN_MAPSHARE_POLL_INTERVAL_MS,
    normalizePositiveMs(value, GARMIN_INREACH_DEFAULT_MAPSHARE_POLL_INTERVAL_MS),
  );
}

function normalizePositiveMs(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.round(next) : fallback;
}

function getProcessEnv(): GarminInreachEnv {
  return typeof process !== 'undefined' ? process.env as GarminInreachEnv : {};
}
