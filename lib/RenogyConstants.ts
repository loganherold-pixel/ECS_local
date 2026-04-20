/**
 * RenogyConstants — BLE service/characteristic UUIDs, model database,
 * and advertisement parsing for Renogy power systems.
 *
 * Renogy devices include battery monitors, solar charge controllers,
 * inverter-chargers, and LiFePO4 battery banks. Many Renogy products
 * support BLE via the Renogy BT-1/BT-2 Bluetooth module or built-in
 * Bluetooth (e.g. Smart Lithium series).
 *
 * BLE Communication:
 *   Renogy devices use Modbus RTU over BLE. The BT-1/BT-2 module
 *   bridges RS-232/RS-485 to BLE, exposing a UART-like service.
 *   This adapter abstracts the Modbus layer and provides a clean
 *   interface identical to EcoFlow, Bluetti, Anker SOLIX, Jackery,
 *   and Goal Zero adapters.
 *
 * Phase 6A: Full BLE constants and model database for Renogy.
 */

// ── BLE Service & Characteristic UUIDs ──────────────────────────────────

/**
 * Primary Renogy BLE UART service UUID.
 * Renogy BT-1/BT-2 modules and Smart Lithium batteries advertise
 * a custom UART service for Modbus RTU communication.
 */
export const RENOGY_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';

/**
 * Write characteristic — send Modbus commands to the device.
 */
export const RENOGY_WRITE_CHAR_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

/**
 * Notify characteristic — receive Modbus responses from the device.
 */
export const RENOGY_NOTIFY_CHAR_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';

// ── Device Name Prefixes / Patterns ─────────────────────────────────────

/**
 * Known Renogy device name patterns in BLE advertisements.
 * Used for device discovery filtering.
 */
export const RENOGY_NAME_PATTERNS = [
  'Renogy',
  'RENOGY',
  'RNG-',         // Renogy model prefix
  'BT-1',         // Bluetooth module
  'BT-2',         // Bluetooth module v2
  'ROVER',        // Rover charge controllers
  'WANDERER',     // Wanderer charge controllers
  'ADVENTURER',   // Adventurer charge controllers
  'COMMANDER',    // Commander charge controllers
  'SMART LITHIUM',
  'SMARTLITHIUM',
  'RBT',          // Renogy Bluetooth prefix
  'REGO',         // Rego series
  'DCC',          // DC-DC chargers
  'RBC',          // Battery charger prefix
  'LYCAN',        // Lycan power box
  'PHOENIX',      // Phoenix inverter
  'ONE',          // Renogy ONE
] as const;

/**
 * Check if a BLE device name matches a Renogy device pattern.
 */
export function isRenogyDeviceName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return RENOGY_NAME_PATTERNS.some((pattern) =>
    upper.includes(pattern.toUpperCase()),
  );
}

// ── Model Database ──────────────────────────────────────────────────────

export type RenogyDeviceCategory =
  | 'battery_monitor'
  | 'solar_controller'
  | 'battery_bank'
  | 'inverter_charger'
  | 'dc_dc_charger'
  | 'power_station'
  | 'bluetooth_module';

export interface RenogyModelSpec {
  /** Model identifier (e.g. "Smart Lithium 12V 100Ah") */
  model: string;
  /** Display name */
  displayName: string;
  /** Device category for ECS power system role assignment */
  category: RenogyDeviceCategory;
  /** Total battery capacity in Wh (0 for non-battery devices) */
  capacityWh: number;
  /** Maximum solar input in watts (for controllers) */
  maxSolarInputW: number;
  /** Maximum output in watts */
  maxOutputW: number;
  /** Nominal voltage (12V, 24V, 48V) */
  nominalVoltage: 12 | 24 | 48;
  /** Whether the device has built-in BLE (vs BT-1/BT-2 module) */
  hasBuiltInBle: boolean;
  /** Battery chemistry (for battery devices) */
  chemistry: 'LiFePO4' | 'AGM' | 'GEL' | 'Flooded' | 'N/A';
  /** Suggested ECS power system role */
  suggestedRole: 'primary_house' | 'solar_charging' | 'auxiliary' | 'monitoring' | 'inverter';
}

/**
 * Known Renogy models with specifications.
 * Used for capacity estimation, capability detection, and role assignment.
 */
export const RENOGY_MODEL_DB: Record<string, RenogyModelSpec> = {
  // ── Smart Lithium Batteries (Built-in BLE) ────────────────
  'SMART LITHIUM 12V 50AH': {
    model: 'Smart Lithium 12V 50Ah',
    displayName: 'Smart Lithium 50Ah',
    category: 'battery_bank',
    capacityWh: 640,
    maxSolarInputW: 0,
    maxOutputW: 640,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'auxiliary',
  },
  'SMART LITHIUM 12V 100AH': {
    model: 'Smart Lithium 12V 100Ah',
    displayName: 'Smart Lithium 100Ah',
    category: 'battery_bank',
    capacityWh: 1280,
    maxSolarInputW: 0,
    maxOutputW: 1280,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },
  'SMART LITHIUM 12V 200AH': {
    model: 'Smart Lithium 12V 200Ah',
    displayName: 'Smart Lithium 200Ah',
    category: 'battery_bank',
    capacityWh: 2560,
    maxSolarInputW: 0,
    maxOutputW: 2560,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },
  'SMART LITHIUM 12V 300AH': {
    model: 'Smart Lithium 12V 300Ah',
    displayName: 'Smart Lithium 300Ah',
    category: 'battery_bank',
    capacityWh: 3840,
    maxSolarInputW: 0,
    maxOutputW: 3840,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },
  'SMART LITHIUM 24V 100AH': {
    model: 'Smart Lithium 24V 100Ah',
    displayName: 'Smart Lithium 24V 100Ah',
    category: 'battery_bank',
    capacityWh: 2560,
    maxSolarInputW: 0,
    maxOutputW: 2560,
    nominalVoltage: 24,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },
  'SMART LITHIUM 48V 50AH': {
    model: 'Smart Lithium 48V 50Ah',
    displayName: 'Smart Lithium 48V 50Ah',
    category: 'battery_bank',
    capacityWh: 2560,
    maxSolarInputW: 0,
    maxOutputW: 2560,
    nominalVoltage: 48,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },

  // ── Core Series LiFePO4 Batteries ─────────────────────────
  'CORE SERIES 12V 100AH': {
    model: 'Core Series 12V 100Ah',
    displayName: 'Core 100Ah',
    category: 'battery_bank',
    capacityWh: 1280,
    maxSolarInputW: 0,
    maxOutputW: 1280,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },
  'CORE SERIES 12V 200AH': {
    model: 'Core Series 12V 200Ah',
    displayName: 'Core 200Ah',
    category: 'battery_bank',
    capacityWh: 2560,
    maxSolarInputW: 0,
    maxOutputW: 2560,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },

  // ── Rover Series Solar Charge Controllers ─────────────────
  'ROVER 20A': {
    model: 'Rover 20A MPPT',
    displayName: 'Rover 20A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 260,
    maxOutputW: 260,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'ROVER 30A': {
    model: 'Rover 30A MPPT',
    displayName: 'Rover 30A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 400,
    maxOutputW: 400,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'ROVER 40A': {
    model: 'Rover 40A MPPT',
    displayName: 'Rover 40A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 520,
    maxOutputW: 520,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'ROVER 60A': {
    model: 'Rover 60A MPPT',
    displayName: 'Rover 60A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 800,
    maxOutputW: 800,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'ROVER 100A': {
    model: 'Rover 100A MPPT',
    displayName: 'Rover 100A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 1300,
    maxOutputW: 1300,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },

  // ── Wanderer Series Solar Charge Controllers ──────────────
  'WANDERER 10A': {
    model: 'Wanderer 10A PWM',
    displayName: 'Wanderer 10A',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 130,
    maxOutputW: 130,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'WANDERER 30A': {
    model: 'Wanderer 30A PWM',
    displayName: 'Wanderer 30A',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 400,
    maxOutputW: 400,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },

  // ── Adventurer Series Solar Charge Controllers ────────────
  'ADVENTURER 30A': {
    model: 'Adventurer 30A PWM',
    displayName: 'Adventurer 30A',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 400,
    maxOutputW: 400,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },

  // ── Commander Series Solar Charge Controllers ─────────────
  'COMMANDER 40A': {
    model: 'Commander 40A MPPT',
    displayName: 'Commander 40A MPPT',
    category: 'solar_controller',
    capacityWh: 0,
    maxSolarInputW: 520,
    maxOutputW: 520,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },

  // ── DCC Series DC-DC Chargers ─────────────────────────────
  'DCC30S': {
    model: 'DCC30S DC-DC Charger',
    displayName: 'DCC30S 30A',
    category: 'dc_dc_charger',
    capacityWh: 0,
    maxSolarInputW: 400,
    maxOutputW: 400,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },
  'DCC50S': {
    model: 'DCC50S DC-DC Charger',
    displayName: 'DCC50S 50A',
    category: 'dc_dc_charger',
    capacityWh: 0,
    maxSolarInputW: 600,
    maxOutputW: 600,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'solar_charging',
  },

  // ── Inverter-Chargers ─────────────────────────────────────
  'PHOENIX 1000W': {
    model: 'Phoenix 1000W Inverter',
    displayName: 'Phoenix 1000W',
    category: 'inverter_charger',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 1000,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'inverter',
  },
  'PHOENIX 2000W': {
    model: 'Phoenix 2000W Inverter',
    displayName: 'Phoenix 2000W',
    category: 'inverter_charger',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 2000,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'inverter',
  },
  'PHOENIX 3000W': {
    model: 'Phoenix 3000W Inverter',
    displayName: 'Phoenix 3000W',
    category: 'inverter_charger',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 3000,
    nominalVoltage: 12,
    hasBuiltInBle: false,
    chemistry: 'N/A',
    suggestedRole: 'inverter',
  },

  // ── Lycan Power Box ───────────────────────────────────────
  'LYCAN 5000': {
    model: 'Lycan 5000 Power Box',
    displayName: 'Lycan 5000',
    category: 'power_station',
    capacityWh: 4800,
    maxSolarInputW: 1000,
    maxOutputW: 3500,
    nominalVoltage: 48,
    hasBuiltInBle: true,
    chemistry: 'LiFePO4',
    suggestedRole: 'primary_house',
  },

  // ── Renogy ONE ────────────────────────────────────────────
  'RENOGY ONE': {
    model: 'Renogy ONE',
    displayName: 'Renogy ONE Monitor',
    category: 'battery_monitor',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 0,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'N/A',
    suggestedRole: 'monitoring',
  },
  'RENOGY ONE CORE': {
    model: 'Renogy ONE Core',
    displayName: 'Renogy ONE Core',
    category: 'battery_monitor',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 0,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'N/A',
    suggestedRole: 'monitoring',
  },

  // ── BT-1 / BT-2 Bluetooth Modules ────────────────────────
  'BT-1': {
    model: 'BT-1 Bluetooth Module',
    displayName: 'BT-1 Module',
    category: 'bluetooth_module',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 0,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'N/A',
    suggestedRole: 'monitoring',
  },
  'BT-2': {
    model: 'BT-2 Bluetooth Module',
    displayName: 'BT-2 Module',
    category: 'bluetooth_module',
    capacityWh: 0,
    maxSolarInputW: 0,
    maxOutputW: 0,
    nominalVoltage: 12,
    hasBuiltInBle: true,
    chemistry: 'N/A',
    suggestedRole: 'monitoring',
  },
};

/**
 * Look up a Renogy model by name.
 * Performs a case-insensitive match against the model database.
 */
export function lookupRenogyModel(
  name: string | null | undefined,
): RenogyModelSpec | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct match
  if (RENOGY_MODEL_DB[upper]) return RENOGY_MODEL_DB[upper];

  // Try contains match (longest key first to avoid partial hits)
  const sortedKeys = Object.keys(RENOGY_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return RENOGY_MODEL_DB[key];
  }

  return undefined;
}

/**
 * Extract the model identifier from a BLE device name.
 * e.g. "Renogy Smart Lithium 12V 100Ah" → "Smart Lithium 12V 100Ah"
 * e.g. "RNG-ROVER-40A" → "Rover 40A MPPT"
 * e.g. "BT-2_ABC123" → "BT-2 Bluetooth Module"
 */
export function extractRenogyModelFromName(
  name: string | null | undefined,
): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase().trim();

  // Try direct model match (longest first)
  const sortedKeys = Object.keys(RENOGY_MODEL_DB).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) return RENOGY_MODEL_DB[key].model;
  }

  // Try Rover match (e.g. "ROVER 40A", "RNG-ROVER-40")
  const roverMatch = upper.match(/ROVER\s*(\d+)\s*A?/);
  if (roverMatch) {
    const amps = roverMatch[1];
    const candidate = `ROVER ${amps}A`;
    if (RENOGY_MODEL_DB[candidate]) return RENOGY_MODEL_DB[candidate].model;
  }

  // Try Smart Lithium match (e.g. "SMART LITHIUM 12V 100AH")
  const lithiumMatch = upper.match(/SMART\s*LITHIUM\s*(\d+)V?\s*(\d+)\s*AH?/);
  if (lithiumMatch) {
    const volts = lithiumMatch[1];
    const amps = lithiumMatch[2];
    const candidate = `SMART LITHIUM ${volts}V ${amps}AH`;
    if (RENOGY_MODEL_DB[candidate]) return RENOGY_MODEL_DB[candidate].model;
  }

  // Try DCC match
  const dccMatch = upper.match(/DCC(\d+)S?/);
  if (dccMatch) {
    const candidate = `DCC${dccMatch[1]}S`;
    if (RENOGY_MODEL_DB[candidate]) return RENOGY_MODEL_DB[candidate].model;
  }

  return undefined;
}

/**
 * Get the suggested ECS power system role for a Renogy device.
 */
export function getRenogyDeviceRole(
  name: string | null | undefined,
): RenogyModelSpec['suggestedRole'] | undefined {
  const spec = lookupRenogyModel(name);
  return spec?.suggestedRole;
}

/**
 * Get the device category for a Renogy device.
 */
export function getRenogyDeviceCategory(
  name: string | null | undefined,
): RenogyDeviceCategory | undefined {
  const spec = lookupRenogyModel(name);
  return spec?.category;
}

// ── Telemetry Register / Command Addresses ──────────────────────────────

/**
 * Modbus register addresses for Renogy telemetry.
 * These are used to construct Modbus RTU read commands for telemetry retrieval.
 *
 * Renogy uses Modbus RTU over BLE (via BT-1/BT-2 or built-in BLE).
 * Register addresses follow the Renogy Modbus protocol specification.
 */
export const RENOGY_REGISTERS = {
  // ── System Info ────────────────────────────────────────────
  /** Device type identifier */
  DEVICE_TYPE: 0x000C,
  /** Model string (multi-register) */
  MODEL_STRING: 0x000D,
  /** Serial number (multi-register) */
  SERIAL_NUMBER: 0x0018,
  /** Firmware version */
  FIRMWARE_VERSION: 0x0014,

  // ── Battery Telemetry ─────────────────────────────────────
  /** Battery SOC percentage (0-100) */
  BATTERY_SOC: 0x0100,
  /** Battery voltage in 0.1V */
  BATTERY_VOLTAGE: 0x0101,
  /** Battery current in 0.01A (signed: positive = charging) */
  BATTERY_CURRENT: 0x0102,
  /** Battery temperature in °C (with offset) */
  BATTERY_TEMP: 0x0103,
  /** Controller temperature in °C (with offset) */
  CONTROLLER_TEMP: 0x0104,

  // ── Solar / Charging ──────────────────────────────────────
  /** Solar panel voltage in 0.1V */
  SOLAR_VOLTAGE: 0x0107,
  /** Solar panel current in 0.01A */
  SOLAR_CURRENT: 0x0108,
  /** Solar charging power in watts */
  SOLAR_POWER: 0x0109,
  /** Charging status (0=off, 1=normal, 2=boost, 3=equalize, 4=float) */
  CHARGING_STATUS: 0x0120,

  // ── Load / Output ─────────────────────────────────────────
  /** Load voltage in 0.1V */
  LOAD_VOLTAGE: 0x010A,
  /** Load current in 0.01A */
  LOAD_CURRENT: 0x010B,
  /** Load power in watts */
  LOAD_POWER: 0x010C,
  /** Load on/off status */
  LOAD_STATUS: 0x010D,

  // ── Daily Statistics ──────────────────────────────────────
  /** Today's generated energy in Wh */
  DAILY_GENERATION_WH: 0x0113,
  /** Today's consumed energy in Wh */
  DAILY_CONSUMPTION_WH: 0x0114,
  /** Total generated energy in kWh (multi-register) */
  TOTAL_GENERATION_KWH: 0x0115,
  /** Total consumed energy in kWh (multi-register) */
  TOTAL_CONSUMPTION_KWH: 0x0117,

  // ── Battery Capacity ──────────────────────────────────────
  /** Rated battery capacity in Ah */
  RATED_CAPACITY_AH: 0xE002,
  /** Remaining capacity in Ah */
  REMAINING_CAPACITY_AH: 0x0120,

  // ── Alarms / Faults ───────────────────────────────────────
  /** Fault/alarm bit flags */
  FAULT_FLAGS: 0x0121,
  /** Over-discharge flag */
  OVER_DISCHARGE: 0x0122,
  /** Over-temperature flag */
  OVER_TEMPERATURE: 0x0123,
} as const;

/**
 * Renogy charging status codes.
 */
export const RENOGY_CHARGING_STATUS = {
  OFF: 0,
  NORMAL: 1,
  BOOST: 2,
  EQUALIZE: 3,
  FLOAT: 4,
} as const;

/**
 * Human-readable charging status labels.
 */
export function getChargingStatusLabel(status: number): string {
  switch (status) {
    case RENOGY_CHARGING_STATUS.OFF: return 'Off';
    case RENOGY_CHARGING_STATUS.NORMAL: return 'Charging';
    case RENOGY_CHARGING_STATUS.BOOST: return 'Boost';
    case RENOGY_CHARGING_STATUS.EQUALIZE: return 'Equalize';
    case RENOGY_CHARGING_STATUS.FLOAT: return 'Float';
    default: return 'Unknown';
  }
}

