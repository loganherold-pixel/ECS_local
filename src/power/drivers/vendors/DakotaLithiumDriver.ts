/**
 * DakotaLithiumDriver — skeleton driver for Dakota Lithium battery systems.
 *
 * Phase 1B: structure only.
 * - supports() returns false (no false-positive matching)
 * - parse() returns empty partial
 * - getCapabilities() returns all-false
 *
 * Future phases will implement BLE parsing for
 * Dakota Lithium BMS-equipped LiFePO4 batteries.
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

export class DakotaLithiumDriver implements IPowerDriver {
  readonly id = "dakotalithium.ble.v1";
  readonly vendor = "dakotalithium";

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

