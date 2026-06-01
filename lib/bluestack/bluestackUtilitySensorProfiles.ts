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

function hasMopekaSignature(text: string): boolean {
  return /\bmopeka\b/.test(text);
}

function hasWaterIntent(text: string): boolean {
  return (
    /\bwater\b|\bfresh\s*tank\b|\bfresh\s*water\b|\bfluid\b|\bliquid\b|\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text) ||
    /\bwater\s*(tank|level|monitor|sensor)\b/.test(text) ||
    /\bwater_monitor\b|\bwater monitor\b|\bwater_tank_monitor\b|\bwater tank monitor\b/.test(text)
  );
}

function hasPropaneIntent(text: string): boolean {
  return (
    /\bpropane\b|\blpg\b|\bbutane\b|\btank\s*check\b|\bpro\s*check\b/.test(text) ||
    /\bpropane_monitor\b|\bpropane monitor\b|\blpg_monitor\b|\blpg monitor\b/.test(text)
  );
}

export function identifyBluestackUtilitySensorProfile(
  input: UtilityProfileInput,
): BluestackUtilitySensorProfile | null {
  const text = searchableText(input);
  if (!text) return null;

  const isMopeka = hasMopekaSignature(text);

  if (hasWaterIntent(text)) {
    const isSeeLevel = /\bsee\s*level\b|\bseelevel\b|\bgarnet\b/.test(text);
    return {
      id: isMopeka ? 'mopeka_water_monitor' : isSeeLevel ? 'seelevel_water_monitor' : 'generic_water_monitor',
      label: isMopeka ? 'Mopeka Water / Fluid Monitor' : isSeeLevel ? 'SeeLevel Water Monitor' : 'Water / Fluid Monitor',
      category: 'water_tank_monitor',
      status: isMopeka || isSeeLevel ? 'identified_live_ready' : 'generic_live_ready',
      parserStatus: 'live_ready',
      detail:
        isMopeka
          ? 'Mopeka water or liquid profile identified. ECS can link over native BLE and will promote live level only after a decoded percentage is received.'
          : isSeeLevel
            ? 'SeeLevel water profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.'
            : 'Water or fluid monitor profile identified. ECS can link over native BLE and will promote live level only after a decoded percentage is received.',
    };
  }

  if (isMopeka || hasPropaneIntent(text)) {
    return {
      id: isMopeka ? 'mopeka_propane_monitor' : 'generic_propane_monitor',
      label: isMopeka ? 'Mopeka Propane Monitor' : 'Propane Monitor',
      category: 'propane_monitor',
      status: isMopeka ? 'identified_live_ready' : 'generic_live_ready',
      parserStatus: 'live_ready',
      detail:
        isMopeka
          ? 'Mopeka propane profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.'
          : 'Propane or LPG monitor profile identified. ECS can link over native BLE and will promote live tank level only after a decoded percentage is received.',
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
