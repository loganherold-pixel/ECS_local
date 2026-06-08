export interface UtilitySensorCharacteristicSnapshot {
  serviceUuid: string;
  characteristicUuid: string;
  valueBase64: string | null;
}

export type UtilitySensorTankProfileSource =
  | 'manual'
  | 'vehicle_profile'
  | 'manufacturer_spec'
  | 'field_calibration';

export interface UtilitySensorTankProfile {
  id?: string | null;
  label?: string | null;
  source?: UtilitySensorTankProfileSource | string | null;
  emptyDistanceMm?: unknown;
  fullDistanceMm?: unknown;
}

export interface UtilitySensorTelemetryInput {
  providerId?: string | null;
  providerLabel?: string | null;
  categoryHint?: string | null;
  displayName?: string | null;
  serviceUuids?: string[] | null;
  manufacturerData?: string | null;
  serviceData?: Record<string, string | null | undefined> | null;
  localName?: string | null;
  signalStrength?: number | null;
  levelPercent?: unknown;
  level_percent?: unknown;
  tankLevelPercent?: unknown;
  fluidLevelPercent?: unknown;
  propanePercent?: unknown;
  waterPercent?: unknown;
  tankProfile?: UtilitySensorTankProfile | null;
  characteristics?: UtilitySensorCharacteristicSnapshot[] | null;
}

export interface UtilitySensorLiveTelemetry {
  levelPercent: number | null;
  levelDistanceMm: number | null;
  temperatureCelsius: number | null;
  batteryPercent: number | null;
  readQuality: number | null;
  parserStatus: 'live' | 'calibration_pending' | 'awaiting_level' | 'unsupported';
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
const MOPEKA_PRO_SERVICE_UUID = 'fee5';
const MOPEKA_PRO_MANUFACTURER_ID = 0x0059;
const MOPEKA_PRO_PAYLOAD_LENGTH = 10;
const MOPEKA_PRO_SENSOR_TYPES = new Set([0x03, 0x04, 0x05, 0x06, 0x08, 0x0c]);
const MOPEKA_LPG_COEFFICIENTS = [0.573045, -0.002822, -0.00000535] as const;

function normalizeUuid(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function compactUuid(value: unknown): string {
  return normalizeUuid(value).replace(/[^a-f0-9]/g, '');
}

function hasMatchingServiceUuid(deviceUUIDs: string[] | null | undefined, candidateUUID: string): boolean {
  const normalizedCandidate = compactUuid(candidateUUID);
  if (!normalizedCandidate) return false;
  return (deviceUUIDs ?? []).some((uuid) => {
    const normalizedUuid = compactUuid(uuid);
    return normalizedUuid === normalizedCandidate ||
      normalizedUuid.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedUuid);
  });
}

function parseHexBytes(value: string): number[] | null {
  const trimmed = value.trim();
  if (!trimmed || !/^(?:0x)?[0-9a-f\s:._-]+$/i.test(trimmed)) return null;
  const compact = trimmed.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (compact.length < 2 || compact.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 2) {
    bytes.push(parseInt(compact.slice(index, index + 2), 16));
  }
  return bytes;
}

function decodeBase64Bytes(value: string): number[] | null {
  try {
    if (typeof Buffer !== 'undefined') {
      const buffer = Buffer.from(value.trim(), 'base64');
      return buffer.length > 0 ? Array.from(buffer) : null;
    }
  } catch {}
  try {
    if (typeof atob === 'function') {
      return Array.from(atob(value.trim()), (char) => char.charCodeAt(0));
    }
  } catch {}
  return null;
}

function decodeBinaryBytes(value: string | null | undefined): number[] {
  if (!value) return [];
  return parseHexBytes(value) ?? decodeBase64Bytes(value) ?? [];
}

function extractMopekaProPayload(bytes: number[]): number[] | null {
  if (bytes.length === MOPEKA_PRO_PAYLOAD_LENGTH) return bytes;

  const low = MOPEKA_PRO_MANUFACTURER_ID & 0xff;
  const high = (MOPEKA_PRO_MANUFACTURER_ID >> 8) & 0xff;
  if (
    bytes.length === MOPEKA_PRO_PAYLOAD_LENGTH + 2 &&
    bytes[0] === low &&
    bytes[1] === high
  ) {
    return bytes.slice(2);
  }

  return null;
}

function getMopekaPayloadCandidates(input: UtilitySensorTelemetryInput): number[][] {
  const candidates: number[][] = [];
  const manufacturerPayload = extractMopekaProPayload(decodeBinaryBytes(input.manufacturerData));
  if (manufacturerPayload) candidates.push(manufacturerPayload);

  const serviceData = input.serviceData;
  if (serviceData && typeof serviceData === 'object') {
    for (const [uuid, value] of Object.entries(serviceData)) {
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      if (!hasMatchingServiceUuid([uuid], MOPEKA_PRO_SERVICE_UUID)) continue;
      const payload = extractMopekaProPayload(decodeBinaryBytes(value));
      if (payload) candidates.push(payload);
    }
  }

  return candidates;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function finiteDistanceMm(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    value = Number(match[0]);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

function percentFromTankProfileDistance(
  distanceMm: number,
  tankProfile: UtilitySensorTankProfile | null | undefined,
): number | null {
  const emptyDistanceMm = finiteDistanceMm(tankProfile?.emptyDistanceMm);
  const fullDistanceMm = finiteDistanceMm(tankProfile?.fullDistanceMm);
  if (emptyDistanceMm == null || fullDistanceMm == null) return null;

  const usableRangeMm = fullDistanceMm - emptyDistanceMm;
  if (Math.abs(usableRangeMm) < 1) return null;

  return clampPercent(((distanceMm - emptyDistanceMm) / usableRangeMm) * 100);
}

function decodeMopekaProPayload(
  payload: number[],
  tankProfile?: UtilitySensorTankProfile | null,
): UtilitySensorLiveTelemetry | null {
  if (payload.length !== MOPEKA_PRO_PAYLOAD_LENGTH) return null;
  if (!MOPEKA_PRO_SENSOR_TYPES.has(payload[0])) return null;

  const calibrationTemperature = payload[2] & 0x7f;
  const rawDistance = ((payload[4] * 256) + payload[3]) & 0x3fff;
  const distanceCoefficient =
    MOPEKA_LPG_COEFFICIENTS[0] +
    MOPEKA_LPG_COEFFICIENTS[1] * calibrationTemperature +
    MOPEKA_LPG_COEFFICIENTS[2] * calibrationTemperature * calibrationTemperature;
  const distanceMm = Math.max(0, Math.round(rawDistance * distanceCoefficient));
  const voltage = (payload[1] & 0x7f) / 32;
  const batteryPercent = clampPercent(((voltage - 2.2) / 0.65) * 100);
  const levelPercent = percentFromTankProfileDistance(distanceMm, tankProfile);

  return {
    levelPercent,
    levelDistanceMm: distanceMm,
    temperatureCelsius: (payload[2] & 0x7f) - 40,
    batteryPercent,
    readQuality: Math.max(0, Math.min(3, payload[4] >> 6)),
    parserStatus: levelPercent == null ? 'calibration_pending' : 'live',
    decodedAt: Date.now(),
    source: 'mopeka_advertisement',
  };
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
      levelDistanceMm: null,
      temperatureCelsius: null,
      batteryPercent: null,
      readQuality: null,
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
        levelDistanceMm: null,
        temperatureCelsius: null,
        batteryPercent: null,
        readQuality: null,
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
      levelDistanceMm: null,
      temperatureCelsius: null,
      batteryPercent: null,
      readQuality: null,
      parserStatus: 'live',
      decodedAt: Date.now(),
      source: characteristic.source,
    };
  }

  if (
    /mopeka/i.test(`${input.providerId ?? ''} ${input.providerLabel ?? ''} ${input.displayName ?? ''}`) ||
    hasMatchingServiceUuid(input.serviceUuids, MOPEKA_PRO_SERVICE_UUID) ||
    input.manufacturerData != null ||
    input.serviceData != null
  ) {
    for (const payload of getMopekaPayloadCandidates(input)) {
      const decoded = decodeMopekaProPayload(payload, input.tankProfile);
      if (decoded) return decoded;
    }
  }

  return {
    levelPercent: null,
    levelDistanceMm: null,
    temperatureCelsius: null,
    batteryPercent: null,
    readQuality: null,
    parserStatus: 'awaiting_level',
    decodedAt: null,
    source: null,
  };
}
