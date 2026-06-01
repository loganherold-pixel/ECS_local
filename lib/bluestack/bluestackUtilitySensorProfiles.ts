import type { BluetoothAccessoryRecord } from '../bluetoothAccessoryRegistry';
import type { BluestackClassifyInput } from './bluestackTypes';

export type BluestackUtilitySensorProfileStatus =
  | 'identified_live_ready'
  | 'generic_live_ready'
  | 'identified_parser_pending'
  | 'generic_parser_pending'
  | 'unsupported';

export interface BluestackUtilitySensorProfile {
  id: string;
  label: string;
  category: 'propane_monitor' | 'water_tank_monitor';
  status: BluestackUtilitySensorProfileStatus;
  parserStatus: 'live_ready' | 'parser_pending' | 'generic_parser_pending' | 'unsupported';
  detail: string;
}

type UtilityProfileInput = BluestackClassifyInput & {
  displayName?: string | null;
  provider?: string | null;
  categoryHint?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function searchableText(input: UtilityProfileInput): string {
  return [
    input.providerId,
    input.providerLabel,
    input.provider,
    input.categoryLabel,
    input.categoryHint,
    input.deviceCategory,
    input.name,
    input.displayName,
    input.model,
    input.manufacturerData,
    ...(input.serviceUuids ?? []),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

export function identifyBluestackUtilitySensorProfile(
  input: UtilityProfileInput,
): BluestackUtilitySensorProfile | null {
  const text = searchableText(input);
  if (!text) return null;

  if (/\bmopeka\b|\btank\s*check\b|\bpro\s*check\b|\blpg\b|\bpropane\b/.test(text)) {
    return {
      id: /\bmopeka\b/.test(text) ? 'mopeka_propane_monitor' : 'generic_propane_monitor',
      label: /\bmopeka\b/.test(text) ? 'Mopeka Propane Monitor' : 'Propane Monitor',
      category: 'propane_monitor',
      status: /\bmopeka\b/.test(text) ? 'identified_live_ready' : 'generic_live_ready',
      parserStatus: 'live_ready',
      detail:
        /\bmopeka\b/.test(text)
          ? 'Mopeka propane profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.'
          : 'Propane monitor profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.',
    };
  }

  if (/\bsee\s*level\b|\bseelevel\b|\bgarnet\b|\bwater\s*(tank|level|monitor|sensor)\b|\bfresh\s*water\b|\bfluid\s*(level|monitor|sensor)\b/.test(text)) {
    return {
      id: /\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text) ? 'seelevel_water_monitor' : 'generic_water_monitor',
      label: /\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text) ? 'SeeLevel Water Monitor' : 'Water / Fluid Monitor',
      category: 'water_tank_monitor',
      status: /\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text) ? 'identified_live_ready' : 'generic_live_ready',
      parserStatus: 'live_ready',
      detail:
        /\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text)
          ? 'SeeLevel water profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.'
          : 'Water or fluid monitor profile identified. ECS can link over native BLE and will promote live level only after a decoded percentage is received.',
    };
  }

  return null;
}

export function identifyBluestackAccessorySensorProfile(
  record: BluetoothAccessoryRecord,
): BluestackUtilitySensorProfile | null {
  return identifyBluestackUtilitySensorProfile({
    providerId: record.providerId,
    providerLabel: record.providerLabel,
    categoryLabel: record.categoryHint,
    categoryHint: record.categoryHint,
    deviceCategory: record.categoryHint,
    name: record.displayName,
    displayName: record.displayName,
    manufacturerData: record.manufacturerData,
    serviceUuids: record.serviceUuids,
    model: record.localName,
    kind: record.owner,
  });
}
