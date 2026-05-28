import type {
  BluestackClassifyInput,
  BluestackConnectionCapability,
  BluestackDeviceCategory,
  BluestackDeviceIdentity,
  BluestackProvider,
  BluestackTelemetryDomain,
} from './bluestackTypes';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function cleanDisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProviderId(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, '_');
}

function includesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

function getSearchText(input: BluestackClassifyInput): string {
  return [
    input.providerId,
    input.providerLabel,
    input.categoryLabel,
    input.deviceCategory,
    input.name,
    input.model,
    input.manufacturerData,
    ...(input.serviceUuids ?? []),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

export function normalizeBluestackProvider(value: unknown): BluestackProvider {
  const provider = normalizeProviderId(value);
  if (provider === 'ecoflow') return 'ecoflow';
  if (provider === 'bluetti') return 'bluetti';
  if (provider === 'anker_solix' || provider === 'solix') return 'anker_solix';
  if (provider === 'anker') return 'anker';
  if (provider === 'jackery') return 'jackery';
  if (provider === 'goal_zero') return 'goal_zero';
  if (provider === 'goalzero') return 'goalzero';
  if (provider === 'renogy' || provider === 'renology') return 'renogy';
  if (provider === 'redarc' || provider === 'red_arc') return 'redarc';
  if (provider === 'dakota_lithium' || provider === 'dakotalithium') return 'dakota_lithium';
  if (provider === 'victron' || provider === 'victron_energy') return 'victron';
  if (provider === 'obd2' || provider === 'generic_obd2') return 'generic_obd2';
  if (provider === 'mopeka') return 'mopeka';
  if (provider === 'seelevel' || provider === 'see_level' || provider === 'garnet') return 'seelevel';
  if (provider === 'propane_monitor' || provider === 'lpg_monitor') return 'propane_monitor';
  if (provider === 'water_monitor' || provider === 'water_tank_monitor') return 'water_monitor';
  if (provider === 'unknown_power') return 'unknown_power';
  if (provider === 'unknown_sensor') return 'unknown_sensor';
  return 'unknown';
}

export function classifyBluestackDevice(input: BluestackClassifyInput): BluestackDeviceIdentity {
  const searchText = getSearchText(input);
  const providerId = normalizeBluestackProvider(input.providerId);
  const kind = normalizeText(input.kind);
  const deviceCategory = normalizeText(input.deviceCategory);
  const isUnsupported = input.isSupported === false;

  let provider = providerId;
  let category: BluestackDeviceCategory = 'unknown_supported';
  let domain: BluestackTelemetryDomain = 'generic';
  let displayProvider = cleanDisplayText(input.providerLabel) ?? 'unknown';
  let displayCategory = cleanDisplayText(input.categoryLabel) ?? 'Bluetooth device';

  if (
    provider === 'ecoflow' ||
    provider === 'bluetti' ||
    provider === 'anker_solix' ||
    provider === 'anker' ||
    provider === 'jackery' ||
    provider === 'goal_zero' ||
    provider === 'goalzero' ||
    provider === 'renogy' ||
    provider === 'redarc' ||
    provider === 'dakota_lithium' ||
    provider === 'victron' ||
    provider === 'unknown_power' ||
    kind === 'power' ||
    deviceCategory === 'power'
  ) {
    category = 'power_device';
    domain = 'power';
  }

  if (provider === 'generic_obd2' || kind === 'telemetry' || deviceCategory === 'obd' || deviceCategory === 'obd2') {
    provider = 'generic_obd2';
    category = 'obd2';
    domain = 'vehicle';
  }

  if (
    provider === 'mopeka' ||
    provider === 'propane_monitor' ||
    deviceCategory === 'propane_monitor' ||
    includesAny(searchText, [
      /\bmopeka\b/,
      /\bpropane\b/,
      /\blpg\b/,
      /\btank\s*check\b/,
      /\bpro\s*check\b/,
    ])
  ) {
    provider = provider === 'unknown' ? 'propane_monitor' : provider;
    category = 'propane_monitor';
    domain = 'propane';
  }

  if (
    provider === 'seelevel' ||
    provider === 'water_monitor' ||
    deviceCategory === 'water_tank_monitor' ||
    includesAny(searchText, [
      /\bsee\s*level\b/,
      /\bseelevel\b/,
      /\bgarnet\b/,
      /\bwater\s*(tank|level|monitor|sensor)\b/,
      /\bfresh\s*water\b/,
      /\bfluid\s*(level|monitor|sensor)\b/,
    ])
  ) {
    provider = provider === 'unknown' ? 'water_monitor' : provider;
    category = 'water_tank_monitor';
    domain = 'water';
  }

  if (kind === 'sensor' && category === 'unknown_supported') {
    provider = provider === 'unknown' ? 'unknown_sensor' : provider;
    category = 'utility_sensor';
    domain = 'utility';
  }

  if (isUnsupported) {
    category = 'unsupported';
  }

  if (displayProvider === 'unknown') {
    displayProvider = getBluestackProviderLabel(provider);
  }
  if (displayCategory === 'Bluetooth device') {
    displayCategory = getBluestackCategoryLabel(category);
  }

  return {
    system: 'bluestack',
    provider,
    category,
    domain,
    capabilities: getBluestackCapabilities(category),
    displayProvider,
    displayCategory,
    isReleaseVisible:
      !isUnsupported &&
      (category === 'power_device' ||
        category === 'obd2' ||
        category === 'propane_monitor' ||
        category === 'water_tank_monitor'),
    needsUserConfirmation: false,
  };
}

export function getBluestackProviderLabel(provider: BluestackProvider): string {
  switch (provider) {
    case 'ecoflow':
      return 'EcoFlow';
    case 'bluetti':
      return 'Bluetti';
    case 'anker':
    case 'anker_solix':
      return 'Anker SOLIX';
    case 'jackery':
      return 'Jackery';
    case 'goal_zero':
    case 'goalzero':
      return 'Goal Zero';
    case 'renogy':
      return 'Renogy';
    case 'redarc':
      return 'REDARC';
    case 'dakota_lithium':
      return 'Dakota Lithium';
    case 'victron':
      return 'Victron Energy';
    case 'generic_obd2':
      return 'OBD2 Telemetry';
    case 'mopeka':
      return 'Mopeka';
    case 'seelevel':
      return 'SeeLevel';
    case 'propane_monitor':
      return 'Propane Monitor';
    case 'water_monitor':
      return 'Water Monitor';
    case 'unknown_power':
      return 'Unknown Power Device';
    case 'unknown_sensor':
      return 'Unknown Sensor';
    case 'unknown':
    default:
      return 'Unknown Device';
  }
}

export function getBluestackCategoryLabel(category: BluestackDeviceCategory): string {
  switch (category) {
    case 'power_device':
      return 'Power Device';
    case 'obd2':
      return 'OBD2 Adapter';
    case 'propane_monitor':
      return 'Propane Level Monitor';
    case 'water_tank_monitor':
      return 'Water / Fluid Level Monitor';
    case 'utility_sensor':
      return 'Utility Sensor';
    case 'unsupported':
      return 'Unsupported';
    case 'unknown_supported':
    default:
      return 'Supported Bluetooth Device';
  }
}

export function getBluestackCapabilities(category: BluestackDeviceCategory): BluestackConnectionCapability[] {
  switch (category) {
    case 'power_device':
      return ['power'];
    case 'obd2':
      return ['telemetry'];
    case 'propane_monitor':
    case 'water_tank_monitor':
      return ['fluid_level'];
    case 'utility_sensor':
    case 'unknown_supported':
      return ['generic_link'];
    case 'unsupported':
    default:
      return [];
  }
}

export function isBluestackReleaseVisibleCategory(category: BluestackDeviceCategory): boolean {
  return (
    category === 'power_device' ||
    category === 'obd2' ||
    category === 'propane_monitor' ||
    category === 'water_tank_monitor'
  );
}
