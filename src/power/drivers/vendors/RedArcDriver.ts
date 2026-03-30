/**
 * RedArcDriver — skeleton driver for REDARC RedVision / Manager30 systems.
 *
 * Phase 1B: structure only.
 * - supports() returns false (no false-positive matching)
 * - parse() returns empty partial
 * - getCapabilities() returns all-false
 *
 * Future phases will implement BLE parsing for
 * RedVision-compatible BCDC and Manager30 units.
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

export class RedArcDriver implements IPowerDriver {
  readonly id = "redarc.ble.v1";
  readonly vendor = "redarc";

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

