/**
 * JackeryDriver — active driver for Jackery portable power stations.
 *
 * Phase 4A: Full BLE telemetry parsing and device matching.
 * - supports() matches Jackery BLE device names
 * - parse() normalises raw BLE telemetry into PowerTelemetry
 * - getCapabilities() returns full capability set
 *
 * Supports Explorer, Explorer Plus, Explorer Pro, and Solar Generator series.
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  isJackeryDeviceName,
  lookupJackeryModel,
  extractJackeryModelFromName,
} from "../../../../lib/JackeryConstants";

const JACKERY_CAPABILITIES: PowerCapabilities = {
  hasSOC: true,
  hasWattsIn: true,
  hasWattsOut: true,
  hasSolar: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

export class JackeryDriver implements IPowerDriver {
  readonly id = "jackery.ble.v1";
  readonly vendor = "jackery";

  /**
   * Match Jackery BLE devices by advertised name.
   * Accepts device info as { name?: string; ... } or a raw string.
   */
  supports(deviceInfo: unknown): boolean {
    if (!deviceInfo) return false;

    // String form
    if (typeof deviceInfo === 'string') {
      return isJackeryDeviceName(deviceInfo);
    }

    // Object form — check .name, .deviceName, .model
    if (typeof deviceInfo === 'object') {
      const obj = deviceInfo as Record<string, unknown>;
      const name =
        (typeof obj.name === 'string' ? obj.name : null) ||
        (typeof obj.deviceName === 'string' ? obj.deviceName : null) ||
        (typeof obj.model === 'string' ? obj.model : null);
      return isJackeryDeviceName(name);
    }

    return false;
  }

  /**
   * Parse raw Jackery BLE telemetry into the ECS PowerTelemetry format.
   *
   * Accepts a partial object with Jackery-specific field names and
   * normalises them into the shared schema.
   */
  parse(raw: unknown): Partial<PowerTelemetry> {
    if (!raw || typeof raw !== 'object') return {};

    const r = raw as Record<string, unknown>;

    // Extract numeric values safely
    const num = (key: string): number | undefined => {
      const v = r[key];
      return typeof v === 'number' && isFinite(v) ? v : undefined;
    };
    const bool = (key: string): boolean | undefined => {
      const v = r[key];
      return typeof v === 'boolean' ? v : undefined;
    };
    const str = (key: string): string | undefined => {
      const v = r[key];
      return typeof v === 'string' ? v : undefined;
    };

    // SOC
    const socPct = num('battery_percent') ?? num('batteryPercent') ?? num('soc');

    // Power
    const wattsIn = num('input_watts') ?? num('inputWatts') ?? num('totalInputPower');
    const wattsOut = num('output_watts') ?? num('outputWatts') ?? num('totalOutputPower');
    const solarWatts = num('solar_input_watts') ?? num('solarWatts') ?? num('solarInputPower');
    const acOutputWatts = num('ac_output_watts') ?? num('acOutputWatts');
    const dcOutputWatts = num('dc_output_watts') ?? num('dcOutputWatts');

    // Environmental
    const tempC = num('temperature_celsius') ?? num('temperatureC') ?? num('batteryTemp');
    const volts = num('battery_volts') ?? num('batteryVolts');

    // Status
    const inverterOn = bool('inverter_on') ?? bool('acOutputOn');
    const chargeCycles = num('charge_cycles') ?? num('chargeCycles');
    const remainingCapacityWh = num('remaining_capacity_wh') ?? num('remainingCapacityWh');
    const estimatedRuntimeMin = num('estimated_runtime_minutes') ?? num('estimatedRuntime');

    // Device info
    const modelName = str('model') ?? str('deviceModel');
    const modelSpec = lookupJackeryModel(modelName);

    // Build result
    const result: Partial<PowerTelemetry> = {
      source: 'ble' as any,
      timestamp: Date.now(),
    };

    // Battery
    if (socPct !== undefined || wattsIn !== undefined || wattsOut !== undefined || volts !== undefined || tempC !== undefined) {
      result.battery = {
        socPct,
        wattsIn,
        wattsOut,
        volts,
        tempC,
        estRuntimeMin: estimatedRuntimeMin,
      };
    }

    // Solar
    if (solarWatts !== undefined) {
      result.solar = {
        watts: solarWatts,
      };
    }

    // Flags
    result.flags = {
      charging: wattsIn !== undefined && wattsOut !== undefined ? wattsIn > wattsOut : undefined,
      inverterOn,
      lowBattery: socPct !== undefined ? socPct < 15 : undefined,
      stale: false,
    };

    // Device info
    result.device = {
      id: str('device_id') ?? str('deviceId') ?? 'jackery-unknown',
      vendor: 'Jackery',
      model: modelSpec?.displayName ?? modelName ?? 'Explorer',
    };

    return result;
  }

  getCapabilities(): PowerCapabilities {
    return { ...JACKERY_CAPABILITIES };
  }
}

