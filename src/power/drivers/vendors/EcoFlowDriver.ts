/**
 * EcoFlowDriver — skeleton driver for EcoFlow power stations.
 *
 * Phase 1B: structure only.
 * - supports() returns false (no false-positive matching)
 * - parse() returns empty partial
 * - getCapabilities() returns all-false
 *
 * Future phases will implement BLE GATT characteristic parsing
 * for DELTA / RIVER series devices.
 */

import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";

const NULL_CAPABILITIES: PowerCapabilities = {
  hasSOC: false,
  hasWattsIn: false,
  hasWattsOut: false,
  hasSolar: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

export class EcoFlowDriver implements IPowerDriver {
  readonly id = "ecoflow.ble.v1";
  readonly vendor = "ecoflow";

  supports(_deviceInfo: unknown): boolean {
    return false;
  }

  parse(_raw: unknown): Partial<PowerTelemetry> {
    return {};
  }

  getCapabilities(): PowerCapabilities {
    return { ...NULL_CAPABILITIES };
  }
}

