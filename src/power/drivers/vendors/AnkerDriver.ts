/**
 * AnkerDriver — BLE driver for Anker SOLIX power stations.
 *
 * Phase 3A: Active driver implementation.
 * - supports() matches Anker SOLIX BLE device names (C/F/BP prefixes, SOLIX pattern)
 * - parse() normalizes proprietary telemetry data into PowerTelemetry
 * - getCapabilities() returns full Anker SOLIX capability set
 *
 * This driver handles the low-level BLE data interpretation.
 * The AnkerSolixBluAdapter handles connection management and lifecycle.
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  isAnkerSolixDeviceName,
  extractAnkerModelFromName,
  lookupAnkerSolixModel,
} from "../../../../lib/AnkerSolixConstants";

const ANKER_SOLIX_CAPABILITIES: PowerCapabilities = {
  hasSOC: true,
  hasWattsIn: true,
  hasWattsOut: true,
  hasSolar: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

/**
 * Device info shape expected from BLE discovery.
 */
interface AnkerSolixDeviceInfo {
  name?: string;
  localName?: string;
  id?: string;
  serviceUUIDs?: string[];
}

/**
 * Raw telemetry data from Anker SOLIX BLE responses.
 */
interface AnkerSolixRawData {
  /** Battery SOC percentage (0-100) */
  batterySoc?: number;
  /** Total input power in watts */
  totalInputPower?: number;
  /** Total output power in watts */
  totalOutputPower?: number;
  /** Solar input power in watts */
  solarInputPower?: number;
  /** AC input power in watts */
  acInputPower?: number;
  /** AC output power in watts */
  acOutputPower?: number;
  /** DC output power in watts */
  dcOutputPower?: number;
  /** Battery temperature in 0.1°C */
  batteryTemp?: number;
  /** AC output enabled */
  acOutputOn?: boolean;
  /** DC output enabled */
  dcOutputOn?: boolean;
  /** Battery voltage in 0.1V */
  batteryVoltage?: number;
  /** Remaining capacity in Wh */
  remainingCapacityWh?: number;
  /** Estimated remaining runtime in minutes */
  estimatedRuntimeMin?: number;
  /** Charge cycle count */
  chargeCycles?: number;
  /** Device serial number */
  serialNumber?: string;
  /** Device type identifier */
  deviceType?: number;
}

export class AnkerDriver implements IPowerDriver {
  readonly id = "anker.ble.v1";
  readonly vendor = "anker";

  /**
   * Check if a discovered BLE device is an Anker SOLIX power station.
   *
   * Matches based on:
   *   1. Device name pattern (SOLIX, C/F/BP series)
   *   2. Service UUID match (0xFFC0)
   */
  supports(deviceInfo: unknown): boolean {
    if (!deviceInfo || typeof deviceInfo !== 'object') return false;

    const info = deviceInfo as AnkerSolixDeviceInfo;

    // Check device name
    const name = info.name || info.localName;
    if (name && isAnkerSolixDeviceName(name)) return true;

    // Check service UUIDs
    if (info.serviceUUIDs?.some(
      (uuid) => uuid.toLowerCase().includes('ffc0'),
    )) {
      if (name && isAnkerSolixDeviceName(name)) return true;
    }

    return false;
  }

  /**
   * Parse raw Anker SOLIX telemetry data into a partial PowerTelemetry object.
   *
   * The raw data comes from reading proprietary BLE responses.
   * Only populates fields that are present in the raw data.
   */
  parse(raw: unknown): Partial<PowerTelemetry> {
    if (!raw || typeof raw !== 'object') return {};

    const data = raw as AnkerSolixRawData;
    const now = Date.now();

    // Determine model from serial
    const modelName = data.serialNumber
      ? extractAnkerModelFromName(data.serialNumber)
      : undefined;

    const result: Partial<PowerTelemetry> = {
      timestamp: now,
      source: 'ble',
      device: {
        id: data.serialNumber || 'anker-unknown',
        vendor: 'anker',
        model: modelName || 'Anker SOLIX',
        serial: data.serialNumber,
      },
      battery: {},
      flags: {},
      capabilities: this.getCapabilities(),
    };

    // Battery SOC
    if (typeof data.batterySoc === 'number') {
      result.battery!.socPct = Math.max(0, Math.min(100, data.batterySoc));
    }

    // Power input
    if (typeof data.totalInputPower === 'number') {
      result.battery!.wattsIn = data.totalInputPower;
    } else if (typeof data.solarInputPower === 'number' && typeof data.acInputPower === 'number') {
      result.battery!.wattsIn = data.solarInputPower + data.acInputPower;
    }

    // Power output
    if (typeof data.totalOutputPower === 'number') {
      result.battery!.wattsOut = data.totalOutputPower;
    } else if (typeof data.acOutputPower === 'number' && typeof data.dcOutputPower === 'number') {
      result.battery!.wattsOut = data.acOutputPower + data.dcOutputPower;
    }

    // Solar
    if (typeof data.solarInputPower === 'number') {
      result.solar = {
        watts: data.solarInputPower,
      };
    }

    // Temperature (stored in 0.1°C units)
    if (typeof data.batteryTemp === 'number') {
      result.battery!.tempC = data.batteryTemp / 10;
    }

    // Voltage (stored in 0.1V units)
    if (typeof data.batteryVoltage === 'number') {
      result.battery!.volts = data.batteryVoltage / 10;
    }

    // Runtime estimate
    if (typeof data.estimatedRuntimeMin === 'number') {
      result.battery!.estRuntimeMin = data.estimatedRuntimeMin;
    }

    // Charge cycles
    if (typeof data.chargeCycles === 'number') {
      result.battery!.cycles = data.chargeCycles;
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
    return { ...ANKER_SOLIX_CAPABILITIES };
  }
}

