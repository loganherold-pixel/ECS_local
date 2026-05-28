export type BluestackTelemetryDomain =
  | 'power'
  | 'vehicle'
  | 'propane'
  | 'water'
  | 'utility'
  | 'generic';

export type BluestackDeviceCategory =
  | 'power_device'
  | 'obd2'
  | 'propane_monitor'
  | 'water_tank_monitor'
  | 'utility_sensor'
  | 'unknown_supported'
  | 'unsupported';

export type BluestackProvider =
  | 'ecoflow'
  | 'bluetti'
  | 'anker_solix'
  | 'anker'
  | 'jackery'
  | 'goal_zero'
  | 'goalzero'
  | 'renogy'
  | 'redarc'
  | 'dakota_lithium'
  | 'victron'
  | 'generic_obd2'
  | 'mopeka'
  | 'seelevel'
  | 'propane_monitor'
  | 'water_monitor'
  | 'unknown_power'
  | 'unknown_sensor'
  | 'unknown';

export type BluestackTransport =
  | 'ble'
  | 'classic_bluetooth'
  | 'cloud'
  | 'hybrid'
  | 'unknown';

export type BluestackConnectionCapability =
  | 'telemetry'
  | 'power'
  | 'fluid_level'
  | 'generic_link';

export interface BluestackDeviceIdentity {
  system: 'bluestack';
  provider: BluestackProvider;
  category: BluestackDeviceCategory;
  domain: BluestackTelemetryDomain;
  capabilities: BluestackConnectionCapability[];
  displayProvider: string;
  displayCategory: string;
  isReleaseVisible: boolean;
  needsUserConfirmation: boolean;
}

export interface BluestackClassifyInput {
  providerId?: string | null;
  providerLabel?: string | null;
  categoryLabel?: string | null;
  deviceCategory?: string | null;
  name?: string | null;
  model?: string | null;
  manufacturerData?: string | null;
  serviceUuids?: string[] | null;
  kind?: string | null;
  isSupported?: boolean | null;
}
