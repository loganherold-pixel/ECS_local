/**
 * IPowerDriver — abstract contract for vendor-specific protocol drivers.
 *
 * A driver knows how to:
 *   1. Recognise whether a discovered device belongs to its vendor.
 *   2. Parse raw vendor payloads into the canonical PowerTelemetry shape.
 *   3. Declare the capabilities of devices it handles.
 *
 * Phase 1B — interface + skeleton vendor implementations.
 */

import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../types/PowerTelemetry";

export interface IPowerDriver {
  /**
   * Stable, versioned identifier for this driver.
   * Convention: "<vendor>.<transport>.<version>"
   * e.g. "ecoflow.ble.v1", "bluetti.cloud.v1"
   */
  readonly id: string;

  /**
   * Canonical vendor key (lowercase, no spaces).
   * Must match the `device.vendor` field emitted in PowerTelemetry.
   */
  readonly vendor: string;

  /**
   * Return `true` if this driver can handle the given device.
   * `deviceInfo` is transport-dependent (BLE advertisement, mDNS record, etc.).
   *
   * Skeleton drivers MUST return `false` to avoid false-positive matches.
   */
  supports(deviceInfo: unknown): boolean;

  /**
   * Transform a raw vendor payload into a partial PowerTelemetry object.
   * The connector merges the result with timestamp, source, and device
   * metadata before emitting.
   *
   * Skeleton drivers return `{}`.
   */
  parse(raw: unknown): Partial<PowerTelemetry>;

  /**
   * Declare the static capability set for devices this driver handles.
   * Called once at pairing time; the result is cached on the device record.
   */
  getCapabilities(): PowerCapabilities;
}

