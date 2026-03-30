/**
 * DriverRegistry — central registry of all known vendor power drivers.
 *
 * Phase 1B: all skeleton drivers are registered. Resolution returns the
 * first driver whose `supports()` returns true for the given device info.
 * Since all skeletons return false, `resolveDriver()` will return null
 * until real driver logic is implemented in future phases.
 *
 * Phase 6A: Renogy driver added (active).
 */

import type { IPowerDriver } from "./IPowerDriver";

import { EcoFlowDriver } from "./vendors/EcoFlowDriver";
import { AnkerDriver } from "./vendors/AnkerDriver";
import { BluettiDriver } from "./vendors/BluettiDriver";
import { JackeryDriver } from "./vendors/JackeryDriver";
import { RedArcDriver } from "./vendors/RedArcDriver";
import { GoalZeroDriver } from "./vendors/GoalZeroDriver";
import { DakotaLithiumDriver } from "./vendors/DakotaLithiumDriver";
import { RenogyDriver } from "./vendors/RenogyDriver";

// ── Registered driver instances ─────────────────────────────────────────
export const registeredDrivers: IPowerDriver[] = [
  new EcoFlowDriver(),
  new AnkerDriver(),
  new BluettiDriver(),
  new JackeryDriver(),
  new RedArcDriver(),
  new GoalZeroDriver(),
  new DakotaLithiumDriver(),
  new RenogyDriver(),
];

// ── Resolution ──────────────────────────────────────────────────────────

/**
 * Find the first driver that claims support for the given device info.
 * Returns `null` if no driver matches.
 *
 * @param deviceInfo - Transport-dependent discovery payload
 *   (BLE advertisement, mDNS record, cloud device descriptor, etc.)
 */
export function resolveDriver(deviceInfo: unknown): IPowerDriver | null {
  for (const driver of registeredDrivers) {
    if (driver.supports(deviceInfo)) {
      return driver;
    }
  }
  return null;
}

