/**
 * GoalZeroDriver — active driver for Goal Zero Yeti power stations.
 *
 * Phase 1B: skeleton only.
 * Phase 5A: Promoted to active driver with BLE device matching and
 *           full PowerTelemetry normalization for Goal Zero Yeti series.
 *
 * Supports BLE parsing for:
 *   Yeti X series (200X, 500X, 700, 1000X, 1500X)
 *   Yeti Core series (1000 Core)
 *   Yeti Pro series (2000X, 3000X, 4000, 6000X)
 *   Alta series (50, 80)
 *   Link / Tank expansion modules
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  isGoalZeroDeviceName,
  lookupGoalZeroModel,
  extractGoalZeroModelFromName,
} from "../../blu/GoalZeroConstants";

const GOAL_ZERO_CAPABILITIES: PowerCapabilities = {
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

export class GoalZeroDriver implements IPowerDriver {
  readonly id = "goalzero.ble.v1";
  readonly vendor = "goalzero";

  /**
   * Check if the given device info matches a Goal Zero device.
   * Accepts device info objects with a `name` or `deviceName` field,
   * or a plain string representing the BLE device name.
   */
  supports(deviceInfo: unknown): boolean {
    if (!deviceInfo) return false;

    // String check
    if (typeof deviceInfo === 'string') {
      return isGoalZeroDeviceName(deviceInfo);
    }

    // Object check — look for name/deviceName fields
    if (typeof deviceInfo === 'object') {
      const info = deviceInfo as Record<string, unknown>;
      const name = (info.name ?? info.deviceName ?? info.device_name) as string | undefined;
      if (name && isGoalZeroDeviceName(name)) return true;

      // Check vendor field
      const vendor = (info.vendor ?? info.provider ?? info.brand) as string | undefined;
      if (vendor && vendor.toLowerCase().includes('goal') && vendor.toLowerCase().includes('zero')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse raw Goal Zero telemetry data into the ECS PowerTelemetry format.
   *
   * Accepts raw BLE telemetry objects with Goal Zero-specific fields
   * and normalizes them into the shared ECS power data model.
   */
  parse(raw: unknown): Partial<PowerTelemetry> {
    if (!raw || typeof raw !== 'object') return {};

    const data = raw as Record<string, unknown>;

    // Extract device info
    const deviceName = (data.name ?? data.deviceName ?? data.device_name ?? '') as string;
    const modelName = extractGoalZeroModelFromName(deviceName) || (data.model as string) || undefined;
    const modelSpec = modelName ? lookupGoalZeroModel(modelName) : undefined;

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
    const inputWatts = num('input_watts') ?? num('inputWatts') ?? num('wattsIn') ?? num('total_input_power');
    const outputWatts = num('output_watts') ?? num('outputWatts') ?? num('wattsOut') ?? num('total_output_power');
    const solarWatts = num('solar_watts') ?? num('solarWatts') ?? num('solar_input_watts') ?? num('solar_input_power');
    const tempC = num('temperature_celsius') ?? num('temperatureC') ?? num('battery_temp');
    const volts = num('battery_volts') ?? num('batteryVolts') ?? num('battery_voltage');
    const runtimeMin = num('estimated_runtime_minutes') ?? num('estimatedRuntime') ?? num('estimated_runtime');
    const acOutputWatts = num('ac_output_watts') ?? num('acOutputWatts');
    const dcOutputWatts = num('dc_output_watts') ?? num('dcOutputWatts');
    const inverterOn = bool('inverter_on') ?? bool('inverterOn');
    const chargeCycles = num('charge_cycles') ?? num('chargeCycles');

    // Determine charging state
    const isCharging = inputWatts !== undefined && inputWatts > 0;

    // Build the normalized telemetry object
    const result: Partial<PowerTelemetry> = {
      source: 'ble',
      timestamp: Date.now(),
      device: {
        id: (data.device_id ?? data.deviceId ?? 'goal-zero-unknown') as string,
        vendor: 'Goal Zero',
        model: modelSpec?.displayName || modelName || 'Yeti',
      },
      battery: {
        socPct,
        wattsIn: inputWatts,
        wattsOut: outputWatts,
        volts,
        tempC,
        estRuntimeMin: runtimeMin,
      },
      solar: solarWatts !== undefined ? {
        watts: solarWatts,
        available: solarWatts > 0,
      } : undefined,
      flags: {
        charging: isCharging,
        inverterOn,
        lowBattery: socPct !== undefined ? socPct < 10 : undefined,
        stale: false,
      },
    };

    return result;
  }

  /**
   * Return the capabilities of Goal Zero devices.
   */
  getCapabilities(): PowerCapabilities {
    return { ...GOAL_ZERO_CAPABILITIES };
  }
}

