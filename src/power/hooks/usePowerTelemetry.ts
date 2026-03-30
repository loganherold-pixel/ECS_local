/**
 * usePowerTelemetry — read-only React hook for ECS power telemetry.
 *
 * Subscribes to the `powerTelemetryManager` singleton and re-renders the
 * consuming component whenever a new telemetry snapshot is ingested.
 *
 * Returns `PowerTelemetry | null`:
 *   - `null` while no telemetry has been received.
 *   - A full `PowerTelemetry` object once at least one reading exists.
 *
 * Automatically unsubscribes on unmount.
 *
 * Phase 1C — no UI components consume this yet.
 */

import { useState, useEffect } from "react";
import type { PowerTelemetry } from "../types/PowerTelemetry";
import { powerTelemetryManager } from "../telemetry/PowerTelemetryManager";

export function usePowerTelemetry(): PowerTelemetry | null {
  const [telemetry, setTelemetry] = useState<PowerTelemetry | null>(
    () => powerTelemetryManager.getCurrent(),
  );

  useEffect(() => {
    // subscribe() immediately invokes the callback with the current value,
    // so `telemetry` is synchronised even if a reading arrived between
    // the initial useState and this effect running.
    const unsub = powerTelemetryManager.subscribe((snapshot) => {
      setTelemetry(snapshot);
    });

    return unsub;
  }, []);

  return telemetry;
}

