export interface UtilitySensorCharacteristicSnapshot {
  serviceUuid: string;
  characteristicUuid: string;
  valueBase64: string | null;
}

export interface UtilitySensorTelemetryInput {
  providerId?: string | null;
  providerLabel?: string | null;
  categoryHint?: string | null;
  displayName?: string | null;
  serviceUuids?: string[] | null;
  manufacturerData?: string | null;
  localName?: string | null;
  signalStrength?: number | null;
  levelPercent?: unknown;
  level_percent?: unknown;
  tankLevelPercent?: unknown;
  fluidLevelPercent?: unknown;
  propanePercent?: unknown;
  waterPercent?: unknown;
  characteristics?: UtilitySensorCharacteristicSnapshot[] | null;
}

export interface UtilitySensorLiveTelemetry {
  levelPercent: number | null;
  parserStatus: 'live' | 'awaiting_level' | 'unsupported';
  decodedAt: number | null;
  source: string | null;
}

const LEVEL_FIELD_KEYS = [
  'levelPercent',
  'level_percent',
  'tankLevelPercent',
  'tank_level_percent',
  'fluidLevelPercent',
  'fluid_level_percent',
  'propanePercent',
  'propane_percent',
  'waterPercent',
  'water_percent',
  'percent',
  'percentage',
  'level',
  'tankLevel',
  'fluidLevel',
];

const LEVEL_TEXT_PATTERN = /\b(?:tank|fluid|propane|water|lpg|level|percent|percentage)\b/i;
const BATTERY_LEVEL_UUIDS = new Set(['2a19', '00002a19-0000-1000-8000-00805f9b34fb']);

function normalizeUuid(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function finitePercent(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    value = Number(match[0]);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return Math.round(value * 10) / 10;
}

function percentFromObject(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of LEVEL_FIELD_KEYS) {
    const percent = finitePercent(record[key]);
    if (percent != null) return percent;
  }
  for (const [key, nestedValue] of Object.entries(record)) {
    if (!LEVEL_TEXT_PATTERN.test(key)) continue;
    const percent = finitePercent(nestedValue);
    if (percent != null) return percent;
    const nestedPercent = percentFromObject(nestedValue);
    if (nestedPercent != null) return nestedPercent;
  }
  return null;
}

function percentFromText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const percent = percentFromObject(parsed);
    if (percent != null) return percent;
  } catch {}

  const labeled = trimmed.match(/\b(?:tank|fluid|propane|water|lpg|level|percent|percentage)\D{0,24}(\d{1,3}(?:\.\d+)?)/i);
  if (labeled) return finitePercent(Number(labeled[1]));
  const trailingPercent = trimmed.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  return trailingPercent ? finitePercent(Number(trailingPercent[1])) : null;
}

function base64ToText(value: string): string | null {
  try {
    if (typeof atob === 'function') {
      return atob(value);
    }
  } catch {}
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
  } catch {}
  return null;
}

function hexToText(value: string): string | null {
  const compact = value.replace(/[^a-f0-9]/gi, '');
  if (compact.length < 2 || compact.length % 2 !== 0) return null;
  try {
    let output = '';
    for (let index = 0; index < compact.length; index += 2) {
      output += String.fromCharCode(parseInt(compact.slice(index, index + 2), 16));
    }
    return output;
  } catch {
    return null;
  }
}

function candidateTexts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const values = new Set<string>();
  values.add(raw);
  const decodedBase64 = base64ToText(raw);
  if (decodedBase64) values.add(decodedBase64);
  const decodedHex = hexToText(raw);
  if (decodedHex) values.add(decodedHex);
  return [...values];
}

function characteristicLooksLikeLevel(snapshot: UtilitySensorCharacteristicSnapshot): boolean {
  const characteristicUuid = normalizeUuid(snapshot.characteristicUuid);
  if (BATTERY_LEVEL_UUIDS.has(characteristicUuid)) return false;
  const text = `${snapshot.serviceUuid} ${snapshot.characteristicUuid}`;
  return LEVEL_TEXT_PATTERN.test(text);
}

function percentFromCharacteristics(
  characteristics: UtilitySensorCharacteristicSnapshot[] | null | undefined,
): { levelPercent: number; source: string } | null {
  for (const snapshot of characteristics ?? []) {
    if (!snapshot?.valueBase64 || !characteristicLooksLikeLevel(snapshot)) continue;
    for (const text of candidateTexts(snapshot.valueBase64)) {
      const percent = percentFromText(text);
      if (percent != null) {
        return { levelPercent: percent, source: 'ble_characteristic' };
      }
    }
  }
  return null;
}

export function decodeUtilitySensorLiveTelemetry(
  input: UtilitySensorTelemetryInput,
): UtilitySensorLiveTelemetry {
  const explicit = percentFromObject(input);
  if (explicit != null) {
    return {
      levelPercent: explicit,
      parserStatus: 'live',
      decodedAt: Date.now(),
      source: 'explicit_level_field',
    };
  }

  for (const text of candidateTexts(input.manufacturerData)) {
    const percent = percentFromText(text);
    if (percent != null) {
      return {
        levelPercent: percent,
        parserStatus: 'live',
        decodedAt: Date.now(),
        source: 'manufacturer_data',
      };
    }
  }

  const characteristic = percentFromCharacteristics(input.characteristics);
  if (characteristic) {
    return {
      levelPercent: characteristic.levelPercent,
      parserStatus: 'live',
      decodedAt: Date.now(),
      source: characteristic.source,
    };
  }

  return {
    levelPercent: null,
    parserStatus: 'awaiting_level',
    decodedAt: null,
    source: null,
  };
}
