/**
 * JackeryConstants — BLE service/characteristic UUIDs, model database,
 * and advertisement parsing for Jackery portable power stations.
 *
 * Jackery devices advertise via BLE with device names containing
 * "Jackery", "Explorer", or model identifiers like "E1000", "E2000".
 *
 * BLE Communication:
 *   Jackery uses a proprietary BLE service with custom payloads.
 *   This adapter abstracts the BLE layer and provides a clean interface
 *   identical to the EcoFlow, Bluetti, and Anker SOLIX adapters.
 *
 * Phase 4A: Full BLE constants and model database for Jackery.
 */

// ── BLE Service & Characteristic UUIDs ──────────────────────────────────

/**
 * Primary Jackery BLE service UUID.
 * Jackery devices advertise this custom service for power telemetry.
 */
export const JACKERY_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';

/**
 * Write characteristic — send commands to the device.
 */
export const JACKERY_WRITE_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

/**
 * Notify characteristic — receive telemetry responses from the device.
 */
export const JACKERY_NOTIFY_CHAR_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';

// ── Device Name Prefixes / Patterns ─────────────────────────────────────

/**
 * Known Jackery device name patterns in BLE advertisements.
 * Used for device discovery filtering.
 */
export const JACKERY_NAME_PATTERNS = [
  'Jackery',
  'JACKERY',
  'Explorer',
  'EXPLORER',
  'JE-',       // Jackery Explorer prefix
  'JP-',       // Jackery Plus prefix
  'E240',
  'E300',
  'E500',
  'E1000',
  'E1500',
  'E2000',
  'E3000',
] as const;

/**
 * Check if a BLE device name matches a Jackery device pattern.
 */
export function isJackeryDeviceName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return JACKERY_NAME_PATTERNS.some((pattern) =>
    upper.includes(pattern.toUpperCase()),
  );
}

// ── Model Database ──────────────────────────────────────────────────────

export interface JackeryModelSpec {
  /** Model identifier (e.g. "Explorer 1000 Plus") */
  model: string;
  /** Display name (e.g. "Explorer 1000 Plus") */
  displayName: string;
  /** Series: explorer, explorer_plus, explorer_pro, solar_generator */
  series: 'explorer' | 'explorer_plus' | 'explorer_pro' | 'solar_generator';
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
 * Known Jackery models with specifications.
 * Used for capacity estimation and capability detection.
 */
export const JACKERY_MODEL_DB: Record<string, JackeryModelSpec> = {
  // ── Explorer Series (Standard) ────────────────────────────
  'EXPLORER 100': {
    model: 'Explorer 100',
    displayName: 'Explorer 100',
    series: 'explorer',
    capacityWh: 98,
    maxAcOutputW: 100,
    maxSolarInputW: 65,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'NMC',
  },
  'EXPLORER 240': {
    model: 'Explorer 240',
    displayName: 'Explorer 240',
    series: 'explorer',
    capacityWh: 240,
    maxAcOutputW: 200,
    maxSolarInputW: 65,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'NMC',
  },
  'EXPLORER 300': {
    model: 'Explorer 300',
    displayName: 'Explorer 300',
    series: 'explorer',
    capacityWh: 293,
    maxAcOutputW: 300,
    maxSolarInputW: 100,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'EXPLORER 500': {
    model: 'Explorer 500',
    displayName: 'Explorer 500',
    series: 'explorer',
    capacityWh: 518,
    maxAcOutputW: 500,
    maxSolarInputW: 100,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'EXPLORER 1000': {
    model: 'Explorer 1000',
    displayName: 'Explorer 1000',
    series: 'explorer',
    capacityWh: 1002,
    maxAcOutputW: 1000,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'EXPLORER 1500': {
    model: 'Explorer 1500',
    displayName: 'Explorer 1500',
    series: 'explorer',
    capacityWh: 1534,
    maxAcOutputW: 1800,
    maxSolarInputW: 400,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },

  // ── Explorer Plus Series (LiFePO4) ────────────────────────
  'EXPLORER 100 PLUS': {
    model: 'Explorer 100 Plus',
    displayName: 'Explorer 100 Plus',
    series: 'explorer_plus',
    capacityWh: 99,
    maxAcOutputW: 128,
    maxSolarInputW: 65,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  'EXPLORER 300 PLUS': {
    model: 'Explorer 300 Plus',
    displayName: 'Explorer 300 Plus',
    series: 'explorer_plus',
    capacityWh: 288,
    maxAcOutputW: 300,
    maxSolarInputW: 100,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'EXPLORER 600 PLUS': {
    model: 'Explorer 600 Plus',
    displayName: 'Explorer 600 Plus',
    series: 'explorer_plus',
    capacityWh: 632,
    maxAcOutputW: 800,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'EXPLORER 1000 PLUS': {
    model: 'Explorer 1000 Plus',
    displayName: 'Explorer 1000 Plus',
    series: 'explorer_plus',
    capacityWh: 1264,
    maxAcOutputW: 2000,
    maxSolarInputW: 800,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'EXPLORER 2000 PLUS': {
    model: 'Explorer 2000 Plus',
    displayName: 'Explorer 2000 Plus',
    series: 'explorer_plus',
    capacityWh: 2042,
    maxAcOutputW: 3000,
    maxSolarInputW: 1400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'EXPLORER 3000 PRO': {
    model: 'Explorer 3000 Pro',
    displayName: 'Explorer 3000 Pro',
    series: 'explorer_pro',
    capacityWh: 3024,
    maxAcOutputW: 3000,
    maxSolarInputW: 1400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── Solar Generator Kits ──────────────────────────────────
  'SOLAR GENERATOR 1000': {
    model: 'Solar Generator 1000',
    displayName: 'Solar Generator 1000',
    series: 'solar_generator',
    capacityWh: 1002,
    maxAcOutputW: 1000,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'SOLAR GENERATOR 2000 PLUS': {
    model: 'Solar Generator 2000 Plus',
    displayName: 'Solar Generator 2000 Plus',
    series: 'solar_generator',
    capacityWh: 2042,
    maxAcOutputW: 3000,
    maxSolarInputW: 1400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── Expansion Battery Packs ───────────────────────────────
  'BATTERY PACK 1000 PLUS': {
    model: 'Battery Pack 1000 Plus',
    displayName: 'Battery Pack 1000 Plus',
    series: 'explorer_plus',
    capacityWh: 1264,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  'BATTERY PACK 2000 PLUS': {
    model: 'Battery Pack 2000 Plus',
    displayName: 'Battery Pack 2000 Plus',
    series: 'explorer_plus',
    capacityWh: 2042,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
};

/**
 * Look up a Jackery model by name.
 * Performs a case-insensitive match against the model database.
 */
export function lookupJackeryModel(
  name: string | null | undefined,
): JackeryModelSpec | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct match
  if (JACKERY_MODEL_DB[upper]) return JACKERY_MODEL_DB[upper];

  // Try contains match (longest key first to avoid partial hits)
  const sortedKeys = Object.keys(JACKERY_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return JACKERY_MODEL_DB[key];
  }

  return undefined;
}

/**
 * Extract the model identifier from a BLE device name.
 * e.g. "Jackery Explorer 1000 Plus" → "Explorer 1000 Plus"
 * e.g. "JE-E1000P" → "Explorer 1000 Plus"
 */
export function extractJackeryModelFromName(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct model match (longest first)
  const sortedKeys = Object.keys(JACKERY_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return JACKERY_MODEL_DB[key].model;
  }

  // Try numeric extraction (e.g. "E1000", "E2000")
  const numericMatch = upper.match(/E(\d{3,4})/);
  if (numericMatch) {
    const wattage = numericMatch[1];
    // Check if it's a Plus variant
    const isPlus = upper.includes('PLUS') || upper.includes('+') || upper.includes('P');
    const isPro = upper.includes('PRO');
    const suffix = isPro ? ' Pro' : isPlus ? ' Plus' : '';
    const candidate = `EXPLORER ${wattage}${suffix ? suffix.toUpperCase() : ''}`;
    if (JACKERY_MODEL_DB[candidate]) return JACKERY_MODEL_DB[candidate].model;
    // Try without suffix
    const base = `EXPLORER ${wattage}`;
    if (JACKERY_MODEL_DB[base]) return JACKERY_MODEL_DB[base].model;
  }

  return undefined;
}

// ── Telemetry Register / Command Addresses ──────────────────────────────

/**
 * Key command/register addresses for Jackery telemetry.
 * These are used to construct BLE commands for telemetry retrieval.
 *
 * Jackery uses a proprietary protocol over BLE with custom payloads.
 * These addresses represent the logical data fields.
 */
export const JACKERY_REGISTERS = {
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
  /** USB output power in watts */
  USB_OUTPUT_POWER: 0x0025,
  /** AC input power in watts (wall charging) */
  AC_INPUT_POWER: 0x0026,
  /** Car input power in watts (12V charging) */
  CAR_INPUT_POWER: 0x0027,
  /** Battery temperature in 0.1°C */
  BATTERY_TEMP: 0x0030,
  /** AC output enabled (0/1) */
  AC_OUTPUT_ON: 0x0040,
  /** DC output enabled (0/1) */
  DC_OUTPUT_ON: 0x0041,
  /** USB output enabled (0/1) */
  USB_OUTPUT_ON: 0x0042,
  /** Battery voltage in 0.1V */
  BATTERY_VOLTAGE: 0x0050,
  /** Remaining capacity in Wh */
  REMAINING_CAPACITY: 0x0060,
  /** Estimated remaining runtime in minutes */
  ESTIMATED_RUNTIME: 0x0061,
  /** Charge cycles */
  CHARGE_CYCLES: 0x0070,
  /** Firmware version */
  FIRMWARE_VERSION: 0x0080,
} as const;

