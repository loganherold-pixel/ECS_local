/**
 * BluettiConstants — BLE service/characteristic UUIDs, model database,
 * and advertisement parsing for Bluetti power stations.
 *
 * Bluetti devices advertise via BLE with a device name prefix of "AC", "EB",
 * or "EP" followed by the model number (e.g. "AC200MAX", "EB3A", "EP500").
 *
 * BLE Communication:
 *   Bluetti uses a custom BLE service with a write characteristic (commands)
 *   and a notify characteristic (responses). Commands are framed as Modbus-RTU
 *   packets with a 2-byte CRC16.
 *
 * Phase 2A: Full BLE constants and model database.
 */

// ── BLE Service & Characteristic UUIDs ──────────────────────────────────

/**
 * Primary Bluetti BLE service UUID.
 * All Bluetti power stations advertise this service.
 */
export const BLUETTI_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';

/**
 * Write characteristic — send Modbus-RTU commands to the device.
 */
export const BLUETTI_WRITE_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';

/**
 * Notify characteristic — receive Modbus-RTU responses from the device.
 */
export const BLUETTI_NOTIFY_CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

// ── Device Name Prefixes ────────────────────────────────────────────────

/**
 * Known Bluetti device name prefixes in BLE advertisements.
 * Used for device discovery filtering.
 */
export const BLUETTI_NAME_PREFIXES = ['AC', 'EB', 'EP', 'B2'] as const;

/**
 * Check if a BLE device name matches a Bluetti device pattern.
 */
export function isBluettiDeviceName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return BLUETTI_NAME_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

// ── Model Database ──────────────────────────────────────────────────────

export interface BluettiModelSpec {
  /** Model identifier (e.g. "AC200MAX") */
  model: string;
  /** Display name (e.g. "AC200MAX") */
  displayName: string;
  /** Series: AC (portable), EB (compact), EP (home backup) */
  series: 'AC' | 'EB' | 'EP' | 'B2';
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
 * Known Bluetti models with specifications.
 * Used for capacity estimation and capability detection.
 */
export const BLUETTI_MODEL_DB: Record<string, BluettiModelSpec> = {
  // ── AC Series (Portable Power Stations) ───────────────────
  AC200MAX: {
    model: 'AC200MAX',
    displayName: 'AC200MAX',
    series: 'AC',
    capacityWh: 2048,
    maxAcOutputW: 2200,
    maxSolarInputW: 900,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC200P: {
    model: 'AC200P',
    displayName: 'AC200P',
    series: 'AC',
    capacityWh: 2000,
    maxAcOutputW: 2000,
    maxSolarInputW: 700,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC200L: {
    model: 'AC200L',
    displayName: 'AC200L',
    series: 'AC',
    capacityWh: 2048,
    maxAcOutputW: 2400,
    maxSolarInputW: 1200,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC300: {
    model: 'AC300',
    displayName: 'AC300',
    series: 'AC',
    capacityWh: 3072, // With B300 expansion
    maxAcOutputW: 3000,
    maxSolarInputW: 2400,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC500: {
    model: 'AC500',
    displayName: 'AC500',
    series: 'AC',
    capacityWh: 3072, // With B300S expansion
    maxAcOutputW: 5000,
    maxSolarInputW: 3000,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC60: {
    model: 'AC60',
    displayName: 'AC60',
    series: 'AC',
    capacityWh: 403,
    maxAcOutputW: 600,
    maxSolarInputW: 200,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC70: {
    model: 'AC70',
    displayName: 'AC70',
    series: 'AC',
    capacityWh: 768,
    maxAcOutputW: 1000,
    maxSolarInputW: 500,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  AC180: {
    model: 'AC180',
    displayName: 'AC180',
    series: 'AC',
    capacityWh: 1152,
    maxAcOutputW: 1800,
    maxSolarInputW: 500,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── EB Series (Compact / Portable) ────────────────────────
  EB3A: {
    model: 'EB3A',
    displayName: 'EB3A',
    series: 'EB',
    capacityWh: 268,
    maxAcOutputW: 600,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  EB55: {
    model: 'EB55',
    displayName: 'EB55',
    series: 'EB',
    capacityWh: 537,
    maxAcOutputW: 700,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  EB70: {
    model: 'EB70',
    displayName: 'EB70',
    series: 'EB',
    capacityWh: 716,
    maxAcOutputW: 700,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  EB70S: {
    model: 'EB70S',
    displayName: 'EB70S',
    series: 'EB',
    capacityWh: 716,
    maxAcOutputW: 800,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── EP Series (Home Backup) ───────────────────────────────
  EP500: {
    model: 'EP500',
    displayName: 'EP500',
    series: 'EP',
    capacityWh: 5100,
    maxAcOutputW: 2000,
    maxSolarInputW: 1200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  EP500PRO: {
    model: 'EP500PRO',
    displayName: 'EP500 Pro',
    series: 'EP',
    capacityWh: 5100,
    maxAcOutputW: 3000,
    maxSolarInputW: 2400,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  EP600: {
    model: 'EP600',
    displayName: 'EP600',
    series: 'EP',
    capacityWh: 6144, // With B500 expansion
    maxAcOutputW: 6000,
    maxSolarInputW: 6000,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── B2 Series (Expansion Batteries) ───────────────────────
  B230: {
    model: 'B230',
    displayName: 'B230',
    series: 'B2',
    capacityWh: 2048,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  B300: {
    model: 'B300',
    displayName: 'B300',
    series: 'B2',
    capacityWh: 3072,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  B300S: {
    model: 'B300S',
    displayName: 'B300S',
    series: 'B2',
    capacityWh: 3072,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
};

/**
 * Look up a Bluetti model by name.
 * Performs a case-insensitive, whitespace-stripped match.
 */
export function lookupBluettiModel(
  name: string | null | undefined,
): BluettiModelSpec | undefined {
  if (!name) return undefined;
  const key = name.toUpperCase().replace(/[\s\-_]/g, '');
  return BLUETTI_MODEL_DB[key];
}

/**
 * Extract the model identifier from a BLE device name.
 * e.g. "AC200MAX_1234" → "AC200MAX"
 */
export function extractModelFromName(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct match first
  for (const model of Object.keys(BLUETTI_MODEL_DB)) {
    if (upper.startsWith(model)) return model;
  }

  // Try prefix extraction (e.g. "AC200MAX_XXXX" → "AC200MAX")
  const match = upper.match(/^((?:AC|EB|EP|B)\d+[A-Z]*)/);
  return match ? match[1] : undefined;
}

// ── Modbus Register Addresses ───────────────────────────────────────────

/**
 * Key Modbus register addresses for Bluetti telemetry.
 * These are used to construct read commands over BLE.
 */
export const BLUETTI_REGISTERS = {
  /** Device type identifier */
  DEVICE_TYPE: 0x000A,
  /** Serial number (string register) */
  SERIAL_NUMBER: 0x000B,
  /** Battery SOC percentage (0-100) */
  TOTAL_BATTERY_PERCENT: 0x0002,
  /** DC input power in watts */
  DC_INPUT_POWER: 0x0024,
  /** AC input power in watts */
  AC_INPUT_POWER: 0x0025,
  /** AC output power in watts */
  AC_OUTPUT_POWER: 0x0026,
  /** DC output power in watts */
  DC_OUTPUT_POWER: 0x0027,
  /** Total input power in watts */
  TOTAL_INPUT_POWER: 0x0020,
  /** Total output power in watts */
  TOTAL_OUTPUT_POWER: 0x0021,
  /** Battery temperature in 0.1°C */
  INTERNAL_BATTERY_TEMP: 0x0028,
  /** AC output enabled (0/1) */
  AC_OUTPUT_ON: 0x0030,
  /** DC output enabled (0/1) */
  DC_OUTPUT_ON: 0x0031,
  /** Battery voltage in 0.1V */
  INTERNAL_DC_INPUT_VOLTAGE: 0x0056,
  /** Estimated remaining charge time in minutes */
  PACK_INPUT_POWER: 0x0036,
} as const;

