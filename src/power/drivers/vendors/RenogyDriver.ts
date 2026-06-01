/**
 * RenogyDriver — active driver for Renogy power systems.
 *
 * Phase 6A: Promoted to active driver with BLE device matching and
 *           full PowerTelemetry normalization for Renogy systems.
 *
 * Supports BLE parsing for:
 *   Smart Lithium batteries (50Ah, 100Ah, 200Ah, 300Ah)
 *   Core Series LiFePO4 batteries
 *   Rover MPPT charge controllers (20A–100A)
 *   Wanderer/Adventurer/Commander controllers
 *   DCC DC-DC chargers (DCC30S, DCC50S)
 *   Phoenix inverters
 *   Lycan power box
 *   Renogy ONE / ONE Core monitors
 *   BT-1 / BT-2 Bluetooth modules
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  isRenogyDeviceName,
  lookupRenogyModel,
  extractRenogyModelFromName,
} from "../../../../lib/RenogyConstants";

const RENOGY_CAPABILITIES: PowerCapabilities = {
  hasSOC: true,
  hasWattsIn: true,
  hasWattsOut: true,
  hasSolar: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

const NULL_CAPABILITIES: PowerCapabilities = {
  hasSOC: false,
  hasWattsIn: false,
  hasWattsOut: false,
  hasSolar: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

export class RenogyDriver implements IPowerDriver {
  readonly id = "renogy.ble.v1";
  readonly vendor = "renogy";

  /**
   * Check if the given device info matches a Renogy device.
   * Accepts device info objects with a `name` or `deviceName` field,
   * or a plain string representing the BLE device name.
   */
  supports(deviceInfo: unknown): boolean {
    if (!deviceInfo) return false;

    // String check
    if (typeof deviceInfo === 'string') {
      return isRenogyDeviceName(deviceInfo);
    }

    // Object check — look for name/deviceName fields
    if (typeof deviceInfo === 'object') {
      const info = deviceInfo as Record<string, unknown>;
      const name = (info.name ?? info.deviceName ?? info.device_name) as string | undefined;
      if (name && isRenogyDeviceName(name)) return true;

      // Check vendor field
      const vendor = (info.vendor ?? info.provider ?? info.brand) as string | undefined;
      if (vendor && vendor.toLowerCase().includes('renogy')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse raw Renogy telemetry data into the ECS PowerTelemetry format.
   *
   * Accepts raw BLE telemetry objects with Renogy-specific fields
   * and normalizes them into the shared ECS power data model.
   */
  parse(raw: unknown): Partial<PowerTelemetry> {
    if (!raw || typeof raw !== 'object') return {};

    const data = raw as Record<string, unknown>;

    // Extract device info
    const deviceName = (data.name ?? data.deviceName ?? data.device_name ?? '') as string;
    const modelName = extractRenogyModelFromName(deviceName) || (data.model as string) || undefined;
    const modelSpec = modelName ? lookupRenogyModel(modelName) : undefined;

    // Extract telemetry values with safe number coercion
    const num = (key: string): number | undefined => {
      const val = data[key];
      if (val === undefined || val === null) return undefined;
      const n = Number(val);
      return isFinite(n) ? n : undefined;
    };

    const bool = (key: string): boolean | undefined => {
      const val = data[key];
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val !== 0;
      if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
      return undefined;
    };

    // Core telemetry fields
    const socPct = num('battery_percent') ?? num('batteryPercent') ?? num('soc') ?? num('battery_soc');
    const solarWatts = num('solar_watts') ?? num('solarWatts') ?? num('solar_input_watts') ?? num('solar_power');
    const loadWatts = num('load_watts') ?? num('loadWatts') ?? num('output_watts') ?? num('load_power');
    const batteryVolts = num('battery_volts') ?? num('batteryVoltage') ?? num('battery_voltage');
    const batteryCurrent = num('battery_current') ?? num('batteryCurrent');
    const tempC = num('temperature_celsius') ?? num('temperatureC') ?? num('battery_temp');
    const runtimeMin = num('estimated_runtime_minutes') ?? num('estimatedRuntime');

    // Determine charging state
    const isCharging = (solarWatts !== undefined && solarWatts > 0) ||
      (batteryCurrent !== undefined && batteryCurrent > 0);

    // Build the normalized telemetry object
    const result: Partial<PowerTelemetry> = {
      source: 'ble',
      timestamp: Date.now(),
      device: {
        id: (data.device_id ?? data.deviceId ?? 'renogy-unknown') as string,
        vendor: 'Renogy',
        model: modelSpec?.displayName || modelName || 'Renogy Device',
      },
      battery: {
        socPct,
        wattsIn: solarWatts,
        wattsOut: loadWatts,
        volts: batteryVolts,
        tempC,
        estRuntimeMin: runtimeMin,
      },
      solar: solarWatts !== undefined ? {
        watts: solarWatts,
      } : undefined,
      flags: {
        charging: isCharging,
        lowBattery: socPct !== undefined ? socPct < 10 : undefined,
        stale: false,
      },
    };

    return result;
  }

  /**
   * Return the capabilities of Renogy devices.
   */
  getCapabilities(): PowerCapabilities {
    return { ...RENOGY_CAPABILITIES };
  }
}
