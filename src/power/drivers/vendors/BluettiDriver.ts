/**
 * BluettiDriver — BLE driver for Bluetti power stations.
 *
 * Phase 2A: Active driver implementation.
 * - supports() matches Bluetti BLE device names (AC/EB/EP prefixes)
 * - parse() normalizes Modbus register data into PowerTelemetry
 * - getCapabilities() returns full Bluetti capability set
 *
 * This driver handles the low-level BLE data interpretation.
 * The BluettiBluAdapter handles connection management and lifecycle.
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  isBluettiDeviceName,
  extractModelFromName,
  lookupBluettiModel,
} from "../../../../lib/BluettiConstants";

const BLUETTI_CAPABILITIES: PowerCapabilities = {
  hasSOC: true,
  hasWattsIn: true,
  hasWattsOut: true,
  hasSolar: true,
  hasRuntimeEstimate: false,
  controllable: false,
};

/**
 * Device info shape expected from BLE discovery.
 */
interface BluettiDeviceInfo {
  name?: string;
  localName?: string;
  id?: string;
  serviceUUIDs?: string[];
}

/**
 * Raw Modbus register data from Bluetti BLE responses.
 */
interface BluettiRawData {
  /** Battery SOC percentage (0-100) */
  totalBatteryPercent?: number;
  /** Total input power in watts */
  totalInputPower?: number;
  /** Total output power in watts */
  totalOutputPower?: number;
  /** DC input power in watts (includes solar) */
  dcInputPower?: number;
  /** AC input power in watts */
  acInputPower?: number;
  /** AC output power in watts */
  acOutputPower?: number;
  /** DC output power in watts */
  dcOutputPower?: number;
  /** Internal battery temperature in 0.1°C */
  internalBatteryTemp?: number;
  /** AC output enabled */
  acOutputOn?: boolean;
  /** DC output enabled */
  dcOutputOn?: boolean;
  /** Battery voltage in 0.1V */
  batteryVoltage?: number;
  /** Device serial number */
  serialNumber?: string;
  /** Device type identifier */
  deviceType?: number;
}

export class BluettiDriver implements IPowerDriver {
  readonly id = "bluetti.ble.v1";
  readonly vendor = "bluetti";

  /**
   * Check if a discovered BLE device is a Bluetti power station.
   *
   * Matches based on:
   *   1. Device name prefix (AC, EB, EP, B2)
   *   2. Service UUID match (0xFF00)
   */
  supports(deviceInfo: unknown): boolean {
    if (!deviceInfo || typeof deviceInfo !== 'object') return false;

    const info = deviceInfo as BluettiDeviceInfo;

    // Check device name
    const name = info.name || info.localName;
    if (name && isBluettiDeviceName(name)) return true;

    // Check service UUIDs
    if (info.serviceUUIDs?.some(
      (uuid) => uuid.toLowerCase().includes('ff00'),
    )) {
      // Service UUID match — but only if name also looks Bluetti-ish
      if (name && isBluettiDeviceName(name)) return true;
    }

    return false;
  }

  /**
   * Parse raw Modbus register data into a partial PowerTelemetry object.
   *
   * The raw data comes from reading Modbus registers over BLE.
   * Only populates fields that are present in the raw data.
   */
  parse(raw: unknown): Partial<PowerTelemetry> {
    if (!raw || typeof raw !== 'object') return {};

    const data = raw as BluettiRawData;
    const now = Date.now();

    // Determine model from device type or serial
    const modelName = data.serialNumber
      ? extractModelFromName(data.serialNumber)
      : undefined;

    const result: Partial<PowerTelemetry> = {
      timestamp: now,
      source: 'ble',
      device: {
        id: data.serialNumber || 'bluetti-unknown',
        vendor: 'bluetti',
        model: modelName || 'Bluetti',
        serial: data.serialNumber,
      },
      battery: {},
      flags: {},
      capabilities: this.getCapabilities(),
    };

    // Battery SOC
    if (typeof data.totalBatteryPercent === 'number') {
      result.battery!.socPct = Math.max(0, Math.min(100, data.totalBatteryPercent));
    }

    // Power input
    if (typeof data.totalInputPower === 'number') {
      result.battery!.wattsIn = data.totalInputPower;
    } else if (typeof data.dcInputPower === 'number' && typeof data.acInputPower === 'number') {
      result.battery!.wattsIn = data.dcInputPower + data.acInputPower;
    }

    // Power output
    if (typeof data.totalOutputPower === 'number') {
      result.battery!.wattsOut = data.totalOutputPower;
    } else if (typeof data.acOutputPower === 'number' && typeof data.dcOutputPower === 'number') {
      result.battery!.wattsOut = data.acOutputPower + data.dcOutputPower;
    }

    // Solar (DC input is typically solar on Bluetti devices)
    if (typeof data.dcInputPower === 'number') {
      result.solar = {
        watts: data.dcInputPower,
      };
    }

    // Temperature (stored in 0.1°C units)
    if (typeof data.internalBatteryTemp === 'number') {
      result.battery!.tempC = data.internalBatteryTemp / 10;
    }

    // Voltage (stored in 0.1V units)
    if (typeof data.batteryVoltage === 'number') {
      result.battery!.volts = data.batteryVoltage / 10;
    }

    // Flags
    if (result.battery!.wattsIn && result.battery!.wattsIn > 0) {
      result.flags!.charging = true;
    }
    if (data.acOutputOn) {
      result.flags!.inverterOn = true;
    }
    if (result.battery!.socPct !== undefined && result.battery!.socPct < 10) {
      result.flags!.lowBattery = true;
    }

    return result;
  }

  getCapabilities(): PowerCapabilities {
    return { ...BLUETTI_CAPABILITIES };
  }
}

