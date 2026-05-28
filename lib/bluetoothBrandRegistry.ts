import type { OBD2DiscoveredDevice } from '../src/vehicle-telemetry/OBD2Adapter';
import { ANKER_SOLIX_SERVICE_UUID } from './AnkerSolixConstants';
import { BLUETTI_SERVICE_UUID } from './BluettiConstants';
import { GOAL_ZERO_SERVICE_UUID } from './GoalZeroConstants';
import type { BluetoothProviderBadge } from './bluetoothDevicePresentation';

export type BluetoothBrandConnectionType = 'ble' | 'classic_bluetooth' | 'api' | 'hybrid';

export type BluetoothBrandDeviceCategory =
  | 'power_station'
  | 'fridge'
  | 'air_conditioner'
  | 'battery_monitor'
  | 'solar_controller'
  | 'dc_dc_charger'
  | 'obd2'
  | 'propane_monitor'
  | 'water_tank_monitor'
  | 'sensor'
  | 'unknown';

export interface BluetoothBrandRegistryEntry {
  id: string;
  displayName: string;
  providerBadge: BluetoothProviderBadge;
  nameFragments: RegExp[];
  manufacturerHints: RegExp[];
  serviceUUIDs: string[];
  connectionType: BluetoothBrandConnectionType;
  deviceCategory: BluetoothBrandDeviceCategory;
  categoryHint: string;
}

export interface BluetoothBrandMatch {
  brand: BluetoothBrandRegistryEntry;
  reasons: string[];
}

export interface BluetoothBrandMatchResult {
  primaryMatch: BluetoothBrandMatch | null;
  matches: BluetoothBrandMatch[];
  needsUserConfirmation: boolean;
}

export type BluetoothBrandMatchInput = Pick<
  OBD2DiscoveredDevice,
  'id' | 'isLikelyOBD' | 'name'
> & Partial<Pick<OBD2DiscoveredDevice, 'serviceUUIDs' | 'manufacturerData'>>;

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase().replace(/[^a-f0-9]/g, '');
}

function hasMatchingServiceUuid(deviceUUIDs: string[] | undefined, candidateUUIDs: string[]): boolean {
  if (!deviceUUIDs?.length) return false;
  const normalizedDeviceUUIDs = deviceUUIDs.map(normalizeUuid).filter(Boolean);
  return candidateUUIDs.some((candidate) => {
    const normalizedCandidate = normalizeUuid(candidate);
    return normalizedDeviceUUIDs.some((uuid) => (
      uuid === normalizedCandidate ||
      uuid.includes(normalizedCandidate) ||
      normalizedCandidate.includes(uuid)
    ));
  });
}

export const BLUETOOTH_BRAND_REGISTRY: BluetoothBrandRegistryEntry[] = [
  {
    id: 'ecoflow',
    displayName: 'EcoFlow',
    providerBadge: 'EcoFlow',
    nameFragments: [
      /eco\s*flow/i,
      /ecoflow/i,
      /\bglacier\b/i,
      /\bwave\b/i,
      /\bdelta\s*(mini|pro|max|2|3|3\s*1500)?\b/i,
      /\briver\s*(mini|pro|max|2)?\b/i,
      /\balternator\s*charger\b/i,
      /\b800\s*w\s*alternator\b/i,
    ],
    manufacturerHints: [/eco\s*flow/i, /ecoflow/i],
    serviceUUIDs: [],
    connectionType: 'hybrid',
    deviceCategory: 'power_station',
    categoryHint: 'Portable power station',
  },
  {
    id: 'bluetti',
    displayName: 'Blue Eddy / BLUETTI',
    providerBadge: 'Bluetti',
    nameFragments: [/blue\s*eddy/i, /bluetti/i, /\bac\d{2,4}\b/i, /\beb\d{1,3}\b/i, /\bep\d{2,4}\b/i],
    manufacturerHints: [/blue\s*eddy/i, /bluetti/i],
    serviceUUIDs: [BLUETTI_SERVICE_UUID, 'ff00'],
    connectionType: 'ble',
    deviceCategory: 'power_station',
    categoryHint: 'Portable power station',
  },
  {
    id: 'anker_solix',
    displayName: 'Anker / Solix',
    providerBadge: 'Anker SOLIX',
    nameFragments: [/anker/i, /solix/i],
    manufacturerHints: [/anker/i, /solix/i],
    serviceUUIDs: [ANKER_SOLIX_SERVICE_UUID, 'ffc0'],
    connectionType: 'ble',
    deviceCategory: 'power_station',
    categoryHint: 'Portable power station',
  },
  {
    id: 'jackery',
    displayName: 'Jackery',
    providerBadge: 'Jackery',
    nameFragments: [/jackery/i, /explorer\s*\d+/i],
    manufacturerHints: [/jackery/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'power_station',
    categoryHint: 'Portable power station',
  },
  {
    id: 'goal_zero',
    displayName: 'Goal Zero',
    providerBadge: 'Goal Zero',
    nameFragments: [/goal\s*zero/i, /yeti\s*\d+/i],
    manufacturerHints: [/goal\s*zero/i],
    serviceUUIDs: [GOAL_ZERO_SERVICE_UUID, 'ffd0'],
    connectionType: 'ble',
    deviceCategory: 'power_station',
    categoryHint: 'Portable power station',
  },
  {
    id: 'renogy',
    displayName: 'Renogy',
    providerBadge: 'Renogy',
    nameFragments: [/renogy/i, /renology/i],
    manufacturerHints: [/renogy/i, /renology/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'solar_controller',
    categoryHint: 'Power controller',
  },
  {
    id: 'redarc',
    displayName: 'Redarc',
    providerBadge: 'Redarc',
    nameFragments: [/redarc/i, /red\s*arc/i],
    manufacturerHints: [/redarc/i, /red\s*arc/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'dc_dc_charger',
    categoryHint: 'Vehicle power controller',
  },
  {
    id: 'dakota_lithium',
    displayName: 'Dakota Lithium',
    providerBadge: 'Dakota Lithium',
    nameFragments: [/dakota\s*lithium/i, /\bdakota\b/i],
    manufacturerHints: [/dakota\s*lithium/i, /\bdakota\b/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'battery_monitor',
    categoryHint: 'Lithium battery system',
  },
  {
    id: 'victron',
    displayName: 'Victron Energy',
    providerBadge: 'Victron Energy',
    nameFragments: [/victron/i, /smart\s*shunt/i, /\bbmv\b/i, /smart\s*solar/i, /blue\s*smart/i],
    manufacturerHints: [/victron/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'battery_monitor',
    categoryHint: 'Power monitor',
  },
  {
    id: 'veepeak_obd2',
    displayName: 'V Peak / Veepeak OBD2',
    providerBadge: 'OBD',
    nameFragments: [
      /vee\s*peak/i,
      /veepeak/i,
      /ve\s*peak/i,
      /v\s*peak/i,
      /\bvpake\b/i,
      /v[\-\s]*link/i,
      /vlinker/i,
      /obd\s*check/i,
      /\bvp\s*11\b/i,
      /\bvp11\b/i,
      /ios\s*v[\-\s]*link/i,
      /android\s*v[\-\s]*link/i,
      /obd\s*(2|ii)?/i,
      /elm\s*327/i,
      /elm327/i,
      /obdlink/i,
      /obd\s*link/i,
      /vgate/i,
      /\bicar\b/i,
      /bafx/i,
      /carista/i,
      /blue\s*driver/i,
      /bluedriver/i,
      /konnwei/i,
      /\bkw\s*902\b/i,
      /viecar/i,
      /panlong/i,
      /micro\s*mechanic/i,
      /car\s*scanner/i,
    ],
    manufacturerHints: [
      /vee\s*peak/i,
      /veepeak/i,
      /ve\s*peak/i,
      /\bvpake\b/i,
      /obd\s*check/i,
      /\bvp\s*11\b/i,
      /\bvp11\b/i,
      /obd\s*(2|ii)?/i,
      /elm\s*327/i,
      /obdlink/i,
      /vgate/i,
      /bafx/i,
      /carista/i,
      /blue\s*driver/i,
      /konnwei/i,
      /viecar/i,
      /panlong/i,
      /micro\s*mechanic/i,
    ],
    serviceUUIDs: ['00001101-0000-1000-8000-00805f9b34fb', '1101', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'],
    connectionType: 'hybrid',
    deviceCategory: 'obd2',
    categoryHint: 'Vehicle telemetry adapter',
  },
  {
    id: 'mopeka_propane',
    displayName: 'Mopeka / Propane Level',
    providerBadge: 'Propane',
    nameFragments: [
      /\bmopeka\b/i,
      /\bpropane\b/i,
      /\blpg\b/i,
      /\btank\s*check\b/i,
      /\bpro\s*check\b/i,
    ],
    manufacturerHints: [
      /\bmopeka\b/i,
      /\bpropane\b/i,
      /\blpg\b/i,
      /\btank\s*check\b/i,
    ],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'propane_monitor',
    categoryHint: 'Propane level monitor',
  },
  {
    id: 'water_level_monitor',
    displayName: 'Water / Fluid Level Monitor',
    providerBadge: 'Water',
    nameFragments: [
      /\bsee\s*level\b/i,
      /\bseelevel\b/i,
      /\bgarnet\b/i,
      /\bwater\s*(tank|level|monitor|sensor)\b/i,
      /\bfresh\s*water\b/i,
      /\bfluid\s*(level|monitor|sensor)\b/i,
    ],
    manufacturerHints: [
      /\bsee\s*level\b/i,
      /\bseelevel\b/i,
      /\bgarnet\b/i,
      /\bwater\s*(tank|level|monitor|sensor)\b/i,
      /\bfluid\s*(level|monitor|sensor)\b/i,
    ],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'water_tank_monitor',
    categoryHint: 'Water / fluid level monitor',
  },
  {
    id: 'sensor_accessory',
    displayName: 'Sensor Accessory',
    providerBadge: 'Sensor',
    nameFragments: [/sensor/i, /tpms/i, /beacon/i, /temp/i, /thermo/i],
    manufacturerHints: [/sensor/i, /tpms/i, /beacon/i],
    serviceUUIDs: [],
    connectionType: 'ble',
    deviceCategory: 'sensor',
    categoryHint: 'Sensor peripheral',
  },
];

export function matchBluetoothBrands(device: BluetoothBrandMatchInput): BluetoothBrandMatchResult {
  const nameText = typeof device.name === 'string' ? device.name : '';
  const manufacturerText = typeof device.manufacturerData === 'string' ? device.manufacturerData : '';
  const searchableText = `${nameText} ${manufacturerText}`.trim();
  const matches: BluetoothBrandMatch[] = [];

  for (const brand of BLUETOOTH_BRAND_REGISTRY) {
    const reasons: string[] = [];
    if (brand.serviceUUIDs.length > 0 && hasMatchingServiceUuid(device.serviceUUIDs, brand.serviceUUIDs)) {
      reasons.push('service_uuid');
    }
    if (searchableText && brand.nameFragments.some((pattern) => pattern.test(searchableText))) {
      reasons.push('name');
    }
    if (manufacturerText && brand.manufacturerHints.some((pattern) => pattern.test(manufacturerText))) {
      reasons.push('manufacturer');
    }
    if (reasons.length > 0) {
      matches.push({ brand, reasons: Array.from(new Set(reasons)) });
    }
  }

  if (matches.length === 0 && device.isLikelyOBD) {
    const obdBrand = BLUETOOTH_BRAND_REGISTRY.find((brand) => brand.id === 'veepeak_obd2');
    if (obdBrand) {
      matches.push({ brand: obdBrand, reasons: ['obd_hint'] });
    }
  }

  const specificMatches = matches.filter((match) => match.brand.id !== 'sensor_accessory');
  const resolvedMatches = specificMatches.length > 0 ? specificMatches : matches;

  return {
    primaryMatch: resolvedMatches.length === 1 ? resolvedMatches[0] : null,
    matches: resolvedMatches,
    needsUserConfirmation: resolvedMatches.length > 1,
  };
}

export function isLikelyPowerBluetoothAdvertisement(device: BluetoothBrandMatchInput): boolean {
  const brandMatch = matchBluetoothBrands(device);
  const matchedCategory = brandMatch.primaryMatch?.brand.deviceCategory;
  if (
    matchedCategory === 'power_station' ||
    matchedCategory === 'fridge' ||
    matchedCategory === 'air_conditioner' ||
    matchedCategory === 'battery_monitor' ||
    matchedCategory === 'solar_controller' ||
    matchedCategory === 'dc_dc_charger'
  ) {
    return true;
  }

  const nameText = typeof device.name === 'string' ? device.name : '';
  const manufacturerText = typeof device.manufacturerData === 'string' ? device.manufacturerData : '';
  const serviceText = Array.isArray(device.serviceUUIDs) ? device.serviceUUIDs.join(' ') : '';
  const searchableText = `${nameText} ${manufacturerText} ${serviceText}`
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (!searchableText) return false;

  return [
    /\bpower\s*(station|pack|box|bank)\b/,
    /\bsolar\s*(generator|controller|charger)\b/,
    /\bbattery\s*(monitor|management|system|pack|box)\b/,
    /\blifepo4\b/,
    /\blithium\b/,
    /\bmppt\b/,
    /\bdc\s*dc\b/,
    /\bdc\s*-\s*dc\b/,
    /\binverter\b/,
    /\bportable\s*power\b/,
    /\bsmart\s*shunt\b/,
    /\bsmart\s*solar\b/,
  ].some((pattern) => pattern.test(searchableText));
}

export function getBluetoothBrandByBadge(
  badge: BluetoothProviderBadge | null | undefined,
): BluetoothBrandRegistryEntry | null {
  if (!badge) return null;
  return BLUETOOTH_BRAND_REGISTRY.find((entry) => entry.providerBadge === badge) ?? null;
}
