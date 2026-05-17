/**
 * AnkerSolixConstants — BLE service/characteristic UUIDs, model database,
 * and advertisement parsing for Anker SOLIX power stations.
 *
 * Anker SOLIX devices advertise via BLE with device names containing
 * "Solix", "SOLIX", or model identifiers like "C1000", "F2000", "C800".
 *
 * BLE Communication:
 *   Anker SOLIX uses a proprietary BLE service with encrypted payloads.
 *   This adapter abstracts the BLE layer and provides a clean interface
 *   identical to the EcoFlow and Bluetti adapters.
 *
 * Phase 3A: Full BLE constants and model database for Anker SOLIX.
 */

// ── BLE Service & Characteristic UUIDs ──────────────────────────────────

/**
 * Primary Anker SOLIX BLE service UUID.
 * Anker SOLIX devices advertise this custom service for power telemetry.
 */
export const ANKER_SOLIX_SERVICE_UUID = '0000ffc0-0000-1000-8000-00805f9b34fb';

/**
 * Write characteristic — send commands to the device.
 */
export const ANKER_SOLIX_WRITE_CHAR_UUID = '0000ffc1-0000-1000-8000-00805f9b34fb';

/**
 * Notify characteristic — receive telemetry responses from the device.
 */
export const ANKER_SOLIX_NOTIFY_CHAR_UUID = '0000ffc2-0000-1000-8000-00805f9b34fb';

// ── Device Name Prefixes / Patterns ─────────────────────────────────────

/**
 * Known Anker SOLIX device name patterns in BLE advertisements.
 * Used for device discovery filtering.
 */
export const ANKER_SOLIX_NAME_PATTERNS = [
  'SOLIX',
  'Solix',
  'A17',  // Anker model prefix (e.g. A1770, A1771)
  'C800',
  'C1000',
  'C300',
  'F1200',
  'F1500',
  'F2000',
  'F2600',
  'F3800',
  'BP1000',
  'BP2000',
] as const;

/**
 * Check if a BLE device name matches an Anker SOLIX device pattern.
 */
export function isAnkerSolixDeviceName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return ANKER_SOLIX_NAME_PATTERNS.some((pattern) =>
    upper.includes(pattern.toUpperCase()),
  );
}

// ── Model Database ──────────────────────────────────────────────────────

export interface AnkerSolixModelSpec {
  /** Model identifier (e.g. "C1000") */
  model: string;
  /** Display name (e.g. "SOLIX C1000") */
  displayName: string;
  /** Series: C (compact), F (flagship), BP (expansion) */
  series: 'C' | 'F' | 'BP';
  /** Total battery capacity in Wh */
  capacityWh: number;
  /** Maximum AC output in watts */
  maxAcOutputW: number;
  /** Maximum solar input in watts */
  maxSolarInputW: number;
  /** Whether the device supports expansion batteries */
  supportsExpansion: boolean;
  /** Whether the device has a built-in MPPT controller */
  hasMppt: boolean;
  /** Battery chemistry */
  chemistry: 'LiFePO4' | 'NMC';
}

/**
 * Known Anker SOLIX models with specifications.
 * Used for capacity estimation and capability detection.
 */
export const ANKER_SOLIX_MODEL_DB: Record<string, AnkerSolixModelSpec> = {
  // ── C Series (Compact / Portable) ─────────────────────────
  C300: {
    model: 'C300',
    displayName: 'SOLIX C300',
    series: 'C',
    capacityWh: 288,
    maxAcOutputW: 300,
    maxSolarInputW: 100,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  C800: {
    model: 'C800',
    displayName: 'SOLIX C800',
    series: 'C',
    capacityWh: 768,
    maxAcOutputW: 1200,
    maxSolarInputW: 400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'C800+': {
    model: 'C800+',
    displayName: 'SOLIX C800 Plus',
    series: 'C',
    capacityWh: 768,
    maxAcOutputW: 1200,
    maxSolarInputW: 400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  C1000: {
    model: 'C1000',
    displayName: 'SOLIX C1000',
    series: 'C',
    capacityWh: 1056,
    maxAcOutputW: 1800,
    maxSolarInputW: 600,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── F Series (Flagship / High-Capacity) ───────────────────
  F1200: {
    model: 'F1200',
    displayName: 'SOLIX F1200',
    series: 'F',
    capacityWh: 1229,
    maxAcOutputW: 1800,
    maxSolarInputW: 800,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  F1500: {
    model: 'F1500',
    displayName: 'SOLIX F1500',
    series: 'F',
    capacityWh: 1536,
    maxAcOutputW: 1800,
    maxSolarInputW: 800,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  F2000: {
    model: 'F2000',
    displayName: 'SOLIX F2000',
    series: 'F',
    capacityWh: 2048,
    maxAcOutputW: 2400,
    maxSolarInputW: 1200,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  F2600: {
    model: 'F2600',
    displayName: 'SOLIX F2600',
    series: 'F',
    capacityWh: 2560,
    maxAcOutputW: 2400,
    maxSolarInputW: 1200,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  F3800: {
    model: 'F3800',
    displayName: 'SOLIX F3800',
    series: 'F',
    capacityWh: 3840,
    maxAcOutputW: 6000,
    maxSolarInputW: 2400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── BP Series (Expansion Batteries) ───────────────────────
  BP1000: {
    model: 'BP1000',
    displayName: 'SOLIX BP1000',
    series: 'BP',
    capacityWh: 1024,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  BP2000: {
    model: 'BP2000',
    displayName: 'SOLIX BP2000',
    series: 'BP',
    capacityWh: 2048,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  BP3800: {
    model: 'BP3800',
    displayName: 'SOLIX BP3800',
    series: 'BP',
    capacityWh: 3840,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
};

/**
 * Look up an Anker SOLIX model by name.
 * Performs a case-insensitive, whitespace-stripped match.
 */
export function lookupAnkerSolixModel(
  name: string | null | undefined,
): AnkerSolixModelSpec | undefined {
  if (!name) return undefined;
  const key = name.toUpperCase().replace(/[\s\-_]/g, '').replace('SOLIX', '');
  // Try direct match
  if (ANKER_SOLIX_MODEL_DB[key]) return ANKER_SOLIX_MODEL_DB[key];
  // Try with SOLIX prefix removed
  for (const [modelKey, spec] of Object.entries(ANKER_SOLIX_MODEL_DB)) {
    if (key.includes(modelKey.toUpperCase())) return spec;
  }
  return undefined;
}

/**
 * Extract the model identifier from a BLE device name.
 * e.g. "SOLIX C1000_XXXX" → "C1000"
 * e.g. "A1771-C1000" → "C1000"
 */
export function extractAnkerModelFromName(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct model match
  for (const model of Object.keys(ANKER_SOLIX_MODEL_DB)) {
    if (upper.includes(model.toUpperCase())) return model;
  }

  // Try pattern extraction (e.g. "C1000", "F2000", "BP1000")
  const match = upper.match(/((?:C|F|BP)\d+\+?)/);
  return match ? match[1] : undefined;
}

// ── Telemetry Register / Command Addresses ──────────────────────────────

/**
 * Key command/register addresses for Anker SOLIX telemetry.
 * These are used to construct BLE commands for telemetry retrieval.
 *
 * Anker SOLIX uses a proprietary protocol over BLE with encrypted
 * payloads. These addresses represent the logical data fields.
 */
export const ANKER_SOLIX_REGISTERS = {
  /** Device type identifier */
  DEVICE_TYPE: 0x0001,
  /** Serial number */
  SERIAL_NUMBER: 0x0002,
  /** Battery SOC percentage (0-100) */
  BATTERY_SOC: 0x0010,
  /** Total input power in watts */
  TOTAL_INPUT_POWER: 0x0020,
  /** Total output power in watts */
  TOTAL_OUTPUT_POWER: 0x0021,
  /** Solar input power in watts */
  SOLAR_INPUT_POWER: 0x0022,
  /** AC output power in watts */
  AC_OUTPUT_POWER: 0x0023,
  /** DC output power in watts */
  DC_OUTPUT_POWER: 0x0024,
  /** AC input power in watts (wall/shore) */
  AC_INPUT_POWER: 0x0025,
  /** Battery temperature in 0.1°C */
  BATTERY_TEMP: 0x0030,
  /** AC output enabled (0/1) */
  AC_OUTPUT_ON: 0x0040,
  /** DC output enabled (0/1) */
  DC_OUTPUT_ON: 0x0041,
  /** Battery voltage in 0.1V */
  BATTERY_VOLTAGE: 0x0050,
  /** Remaining capacity in Wh */
  REMAINING_CAPACITY: 0x0060,
  /** Estimated remaining runtime in minutes */
  ESTIMATED_RUNTIME: 0x0061,
  /** Charge cycles */
  CHARGE_CYCLES: 0x0070,
} as const;

