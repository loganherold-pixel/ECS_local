/**
 * GoalZeroConstants — BLE service/characteristic UUIDs, model database,
 * and advertisement parsing for Goal Zero Yeti power stations.
 *
 * Goal Zero Yeti devices advertise via BLE with device names containing
 * "Yeti", "YETI", "GoalZero", or model identifiers like "Y1000X", "Y3000X".
 *
 * BLE Communication:
 *   Goal Zero Yeti devices use a proprietary BLE service with custom payloads.
 *   The Yeti App communicates over BLE for real-time telemetry and control.
 *   This adapter abstracts the BLE layer and provides a clean interface
 *   identical to the EcoFlow, Bluetti, Anker SOLIX, and Jackery adapters.
 *
 * Phase 5A: Full BLE constants and model database for Goal Zero.
 */

// ── BLE Service & Characteristic UUIDs ──────────────────────────────────

/**
 * Primary Goal Zero BLE service UUID.
 * Goal Zero Yeti devices advertise this custom service for power telemetry.
 */
export const GOAL_ZERO_SERVICE_UUID = '0000ffd0-0000-1000-8000-00805f9b34fb';

/**
 * Write characteristic — send commands to the device.
 */
export const GOAL_ZERO_WRITE_CHAR_UUID = '0000ffd1-0000-1000-8000-00805f9b34fb';

/**
 * Notify characteristic — receive telemetry responses from the device.
 */
export const GOAL_ZERO_NOTIFY_CHAR_UUID = '0000ffd2-0000-1000-8000-00805f9b34fb';

// ── Device Name Prefixes / Patterns ─────────────────────────────────────

/**
 * Known Goal Zero device name patterns in BLE advertisements.
 * Used for device discovery filtering.
 */
export const GOAL_ZERO_NAME_PATTERNS = [
  'Yeti',
  'YETI',
  'GoalZero',
  'GOALZERO',
  'Goal Zero',
  'GZ-',        // Goal Zero prefix
  'Y200X',
  'Y500X',
  'Y700',
  'Y1000X',
  'Y1000 CORE',
  'Y1500X',
  'Y2000X',
  'Y3000X',
  'Y4000',
  'Y6000X',
  'LINK',
  'ALTA',
] as const;

/**
 * Check if a BLE device name matches a Goal Zero device pattern.
 */
export function isGoalZeroDeviceName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return GOAL_ZERO_NAME_PATTERNS.some((pattern) =>
    upper.includes(pattern.toUpperCase()),
  );
}

// ── Model Database ──────────────────────────────────────────────────────

export interface GoalZeroModelSpec {
  /** Model identifier (e.g. "Yeti 1000X") */
  model: string;
  /** Display name (e.g. "Yeti 1000X") */
  displayName: string;
  /** Series: yeti_x, yeti_pro, yeti_core, link, alta */
  series: 'yeti_x' | 'yeti_pro' | 'yeti_core' | 'link' | 'alta';
  /** Total battery capacity in Wh */
  capacityWh: number;
  /** Maximum AC output in watts */
  maxAcOutputW: number;
  /** Maximum solar input in watts */
  maxSolarInputW: number;
  /** Whether the device supports expansion batteries (Link/Tank) */
  supportsExpansion: boolean;
  /** Whether the device has a built-in MPPT controller */
  hasMppt: boolean;
  /** Battery chemistry */
  chemistry: 'LiFePO4' | 'NMC' | 'NMC/LiFePO4';
}

/**
 * Known Goal Zero models with specifications.
 * Used for capacity estimation and capability detection.
 */
export const GOAL_ZERO_MODEL_DB: Record<string, GoalZeroModelSpec> = {
  // ── Yeti X Series (NMC) ───────────────────────────────────
  'YETI 200X': {
    model: 'Yeti 200X',
    displayName: 'Yeti 200X',
    series: 'yeti_x',
    capacityWh: 187,
    maxAcOutputW: 200,
    maxSolarInputW: 100,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'YETI 500X': {
    model: 'Yeti 500X',
    displayName: 'Yeti 500X',
    series: 'yeti_x',
    capacityWh: 505,
    maxAcOutputW: 300,
    maxSolarInputW: 150,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'YETI 700': {
    model: 'Yeti 700',
    displayName: 'Yeti 700',
    series: 'yeti_x',
    capacityWh: 677,
    maxAcOutputW: 600,
    maxSolarInputW: 200,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'YETI 1000X': {
    model: 'Yeti 1000X',
    displayName: 'Yeti 1000X',
    series: 'yeti_x',
    capacityWh: 983,
    maxAcOutputW: 1500,
    maxSolarInputW: 300,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'NMC',
  },
  'YETI 1500X': {
    model: 'Yeti 1500X',
    displayName: 'Yeti 1500X',
    series: 'yeti_x',
    capacityWh: 1516,
    maxAcOutputW: 2000,
    maxSolarInputW: 600,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'NMC',
  },

  // ── Yeti Core Series (LiFePO4) ────────────────────────────
  'YETI 1000 CORE': {
    model: 'Yeti 1000 Core',
    displayName: 'Yeti 1000 Core',
    series: 'yeti_core',
    capacityWh: 983,
    maxAcOutputW: 1500,
    maxSolarInputW: 300,
    supportsExpansion: false,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── Yeti Pro Series (LiFePO4, high-capacity) ──────────────
  'YETI 2000X': {
    model: 'Yeti 2000X',
    displayName: 'Yeti 2000X',
    series: 'yeti_pro',
    capacityWh: 2045,
    maxAcOutputW: 2000,
    maxSolarInputW: 600,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'YETI 3000X': {
    model: 'Yeti 3000X',
    displayName: 'Yeti 3000X',
    series: 'yeti_pro',
    capacityWh: 3032,
    maxAcOutputW: 3000,
    maxSolarInputW: 600,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'YETI 4000': {
    model: 'Yeti 4000',
    displayName: 'Yeti 4000',
    series: 'yeti_pro',
    capacityWh: 3968,
    maxAcOutputW: 3500,
    maxSolarInputW: 800,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },
  'YETI 6000X': {
    model: 'Yeti 6000X',
    displayName: 'Yeti 6000X',
    series: 'yeti_pro',
    capacityWh: 6071,
    maxAcOutputW: 3500,
    maxSolarInputW: 1200,
    supportsExpansion: true,
    hasMppt: true,
    chemistry: 'LiFePO4',
  },

  // ── Yeti LINK Expansion Modules ───────────────────────────
  'YETI LINK EXPANSION MODULE': {
    model: 'Yeti Link Expansion Module',
    displayName: 'Yeti Link Expansion',
    series: 'link',
    capacityWh: 0,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'NMC',
  },

  // ── Tank Expansion Batteries ──────────────────────────────
  'YETI TANK EXPANSION': {
    model: 'Yeti Tank Expansion',
    displayName: 'Yeti Tank Expansion',
    series: 'link',
    capacityWh: 2045,
    maxAcOutputW: 0,
    maxSolarInputW: 0,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },

  // ── Alta Series (Portable Solar + Battery) ────────────────
  'ALTA 50': {
    model: 'Alta 50',
    displayName: 'Alta 50',
    series: 'alta',
    capacityWh: 50,
    maxAcOutputW: 0,
    maxSolarInputW: 50,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
  'ALTA 80': {
    model: 'Alta 80',
    displayName: 'Alta 80',
    series: 'alta',
    capacityWh: 80,
    maxAcOutputW: 0,
    maxSolarInputW: 80,
    supportsExpansion: false,
    hasMppt: false,
    chemistry: 'LiFePO4',
  },
};

/**
 * Look up a Goal Zero model by name.
 * Performs a case-insensitive match against the model database.
 */
export function lookupGoalZeroModel(
  name: string | null | undefined,
): GoalZeroModelSpec | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct match
  if (GOAL_ZERO_MODEL_DB[upper]) return GOAL_ZERO_MODEL_DB[upper];

  // Try contains match (longest key first to avoid partial hits)
  const sortedKeys = Object.keys(GOAL_ZERO_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return GOAL_ZERO_MODEL_DB[key];
  }

  return undefined;
}

/**
 * Extract the model identifier from a BLE device name.
 * e.g. "Goal Zero Yeti 1000X" → "Yeti 1000X"
 * e.g. "GZ-Y1000X" → "Yeti 1000X"
 * e.g. "YETI 3000X_ABC123" → "Yeti 3000X"
 */
export function extractGoalZeroModelFromName(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct model match (longest first)
  const sortedKeys = Object.keys(GOAL_ZERO_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return GOAL_ZERO_MODEL_DB[key].model;
  }

  // Try numeric extraction (e.g. "Y1000X", "Y3000X", "Y6000X")
  const yetiMatch = upper.match(/Y(\d{3,4})(X|CORE)?/i);
  if (yetiMatch) {
    const wattage = yetiMatch[1];
    const suffix = yetiMatch[2]?.toUpperCase() || '';
    const isCore = suffix === 'CORE';
    const isX = suffix === 'X';
    const candidate = `YETI ${wattage}${isCore ? ' CORE' : isX ? 'X' : ''}`;
    if (GOAL_ZERO_MODEL_DB[candidate]) return GOAL_ZERO_MODEL_DB[candidate].model;
    // Try without suffix
    const base = `YETI ${wattage}`;
    if (GOAL_ZERO_MODEL_DB[base]) return GOAL_ZERO_MODEL_DB[base].model;
  }

  // Try Alta match
  const altaMatch = upper.match(/ALTA\s*(\d+)/);
  if (altaMatch) {
    const candidate = `ALTA ${altaMatch[1]}`;
    if (GOAL_ZERO_MODEL_DB[candidate]) return GOAL_ZERO_MODEL_DB[candidate].model;
  }

  return undefined;
}

// ── Telemetry Register / Command Addresses ──────────────────────────────

/**
 * Key command/register addresses for Goal Zero telemetry.
 * These are used to construct BLE commands for telemetry retrieval.
 *
 * Goal Zero Yeti uses a proprietary protocol over BLE with custom payloads.
 * These addresses represent the logical data fields.
 */
export const GOAL_ZERO_REGISTERS = {
  /** Device type identifier */
  DEVICE_TYPE: 0x0001,
  /** Serial number */
  SERIAL_NUMBER: 0x0002,
  /** Firmware version */
  FIRMWARE_VERSION: 0x0003,
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
  /** DC output power in watts (12V / USB) */
  DC_OUTPUT_POWER: 0x0024,
  /** USB-C output power in watts */
  USB_C_OUTPUT_POWER: 0x0025,
  /** AC input power in watts (wall charging) */
  AC_INPUT_POWER: 0x0026,
  /** Car input power in watts (8mm / Anderson) */
  CAR_INPUT_POWER: 0x0027,
  /** Battery temperature in 0.1°C */
  BATTERY_TEMP: 0x0030,
  /** Inverter enabled (0/1) */
  INVERTER_ON: 0x0040,
  /** 12V output enabled (0/1) */
  DC_12V_ON: 0x0041,
  /** USB output enabled (0/1) */
  USB_ON: 0x0042,
  /** Battery voltage in 0.1V */
  BATTERY_VOLTAGE: 0x0050,
  /** Remaining capacity in Wh */
  REMAINING_CAPACITY: 0x0060,
  /** Estimated remaining runtime in minutes */
  ESTIMATED_RUNTIME: 0x0061,
  /** Estimated time to full charge in minutes */
  TIME_TO_FULL: 0x0062,
  /** Charge cycles */
  CHARGE_CYCLES: 0x0070,
  /** WiFi enabled (0/1) */
  WIFI_ON: 0x0080,
  /** Bluetooth enabled (0/1) */
  BLUETOOTH_ON: 0x0081,
} as const;

