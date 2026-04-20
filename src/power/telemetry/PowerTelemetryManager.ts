/**
 * PowerTelemetryManager — singleton orchestrator for ECS power telemetry.
 *
 * Responsibilities:
 *   1. Accept an optional IPowerConnector (BLE, cloud, Wi-Fi, etc.).
 *   2. Accept an optional IPowerDriver for vendor-specific parsing.
 *   3. Deep-merge incoming partial telemetry into a canonical snapshot.
 *   4. Push every ingested reading into the PowerSampleBuffer ring buffer.
 *   5. Run periodic load detection and emit PowerEvents to the events store.
 *   6. Notify subscribers on every update.
 *
 * Designed to run safely with NO connector and NO driver attached.
 * In that state, `getCurrent()` returns `null` and
 * `getConnectionState()` returns `"idle"`.
 *
 * Phase 1C — no BLE, no UI, no navigation changes.
 * Phase 3I-1 — sample buffer integration.
 * Phase 3I-2 — load detection engine + power events store.
 */


import type { IPowerConnector } from "../connectors/IPowerConnector";
import type { IPowerDriver } from "../drivers/IPowerDriver";
import type {
  PowerTelemetry,
  PowerCapabilities,
  PowerConnectionState,
} from "../types/PowerTelemetry";
import { powerSampleBuffer } from "./PowerSampleBuffer";
import type { PowerSample } from "./PowerSampleBuffer";
import { detectLoadEvents } from "../detect/loadDetection";
import { powerEventsStore } from "../detect/powerEventsStore";


// ── Default capabilities (all false) ────────────────────────────────────
const DEFAULT_CAPABILITIES: PowerCapabilities = {
  hasSOC: false,
  hasWattsIn: false,
  hasWattsOut: false,
  hasSolar: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

// ── Deep-merge helper ───────────────────────────────────────────────────

/**
 * Shallow-merge two plain objects one level deep.
 * For each key in `patch`, if the value is not `undefined` it overwrites
 * the corresponding key in `base`. Returns a new object — neither
 * argument is mutated.
 */
function mergeObject<T extends object>(
  base: T | undefined,
  patch: T | undefined,
): T | undefined {
  if (!patch) return base;
  if (!base) return { ...patch };
  const out = { ...(base as object) } as Record<string, unknown>;
  for (const key of Object.keys(patch as object)) {
    const val = (patch as Record<string, unknown>)[key];
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out as T;
}

/**
 * Deep-merge a `Partial<PowerTelemetry>` into an existing snapshot.
 * Nested objects (device, battery, solar, flags, quality, capabilities)
 * are merged one level deep. Primitive top-level fields are overwritten
 * when the partial provides a defined value.
 */
function deepMergeTelemetry(
  current: PowerTelemetry,
  partial: Partial<PowerTelemetry>,
): PowerTelemetry {
  return {
    // Primitives — partial overrides current if defined
    timestamp:
      partial.timestamp !== undefined ? partial.timestamp : current.timestamp,
    source: partial.source !== undefined ? partial.source : current.source,

    // Nested objects — merge one level deep
    device: mergeObject(current.device, partial.device)!,
    battery: mergeObject(current.battery, partial.battery),
    solar: mergeObject(current.solar, partial.solar),
    flags: mergeObject(current.flags, partial.flags),
    quality: mergeObject(current.quality, partial.quality),

    // Capabilities — preserve existing if partial is missing
    capabilities: partial.capabilities
      ? mergeObject(current.capabilities, partial.capabilities)!
      : current.capabilities,
  };
}

// ── Subscriber callback type ────────────────────────────────────────────
type TelemetrySubscriber = (telemetry: PowerTelemetry | null) => void;

// ── Detection interval (Phase 3I-2) ────────────────────────────────────
const DETECTION_INTERVAL_MS = 10_000; // run detector every 10 s
const DETECTION_WINDOW_MS = 10 * 60_000; // analyse last 10 min of samples

// ── Manager class ───────────────────────────────────────────────────────

class PowerTelemetryManager {
  // ── Private state ───────────────────────────────────────────────────
  private connector: IPowerConnector | undefined;
  private connectorUnsub: (() => void) | undefined;
  private driver: IPowerDriver | null = null;
  private current: PowerTelemetry | null = null;
  private subscribers: Set<TelemetrySubscriber> = new Set();

  // ── Phase 3I-2: load detection interval ─────────────────────────────
  private detectionTimer: ReturnType<typeof setInterval> | null = null;

  // ── Connector lifecycle ─────────────────────────────────────────────

  /**
   * Attach a transport connector. If a connector is already attached it
   * is detached first. The manager subscribes to the connector's
   * telemetry stream automatically.
   */
  attachConnector(connector: IPowerConnector): void {
    // Detach any existing connector first
    this.detachConnector();

    this.connector = connector;

    // Subscribe to raw telemetry from the connector
    this.connectorUnsub = connector.subscribe((data: PowerTelemetry) => {
      this.ingestTelemetry(data);
    });
  }

  /**
   * Detach the current connector and clean up the subscription.
   */
  detachConnector(): void {
    if (this.connectorUnsub) {
      this.connectorUnsub();
      this.connectorUnsub = undefined;
    }
    this.connector = undefined;
  }

  // ── Driver lifecycle ────────────────────────────────────────────────

  /**
   * Set (or clear) the active vendor driver used by `ingestRaw()`.
   */
  setDriver(driver: IPowerDriver | null): void {
    this.driver = driver;
  }

  // ── Ingestion ───────────────────────────────────────────────────────

  /**
   * Feed a raw vendor payload through the active driver, then ingest
   * the parsed partial. If no driver is set this is a no-op.
   */
  ingestRaw(raw: unknown): void {
    if (!this.driver) return;
    const partial = this.driver.parse(raw);
    this.ingestTelemetry(partial);
  }

  /**
   * Merge a partial telemetry reading into the current snapshot and
   * notify all subscribers.
   *
   * If `current` is `null` (first reading), a default skeleton is
   * created and the partial is merged on top.
   */
  ingestTelemetry(partial: Partial<PowerTelemetry>): void {
    // Ensure timestamp is present
    if (partial.timestamp === undefined) {
      partial.timestamp = Date.now();
    }

    if (this.current === null) {
      // First reading — initialise with safe defaults, then merge
      const skeleton: PowerTelemetry = {
        timestamp: Date.now(),
        source: "sim",
        device: { id: "unpaired", vendor: "unknown" },
        capabilities: { ...DEFAULT_CAPABILITIES },
        quality: { connection: "idle" },
      };
      this.current = deepMergeTelemetry(skeleton, partial);
    } else {
      this.current = deepMergeTelemetry(this.current, partial);
    }
    // ── Phase 3I-1: push sample into ring buffer ──────────────────────
    this.pushSample();

    // ── Phase 3I-2: start detection loop on first ingestion ───────────
    this.ensureDetectionRunning();

    // Notify subscribers
    this.notifySubscribers();
  }



  // ── Subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to telemetry updates. The callback is invoked immediately
   * with the current snapshot (which may be `null`), and again on every
   * subsequent update.
   *
   * @returns An unsubscribe function.
   */
  subscribe(cb: TelemetrySubscriber): () => void {
    this.subscribers.add(cb);

    // Immediately deliver current state
    cb(this.current);

    return () => {
      this.subscribers.delete(cb);
    };
  }

  // ── Accessors ───────────────────────────────────────────────────────

  /**
   * Return the latest merged telemetry snapshot, or `null` if no
   * telemetry has been ingested yet.
   */
  getCurrent(): PowerTelemetry | null {
    return this.current;
  }

  /**
   * Return the connection state from the attached connector, or
   * `"idle"` if no connector is attached.
   */
  getConnectionState(): PowerConnectionState {
    if (this.connector) {
      return this.connector.getConnectionState();
    }
    return "idle";
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Extract key fields from the current merged snapshot and push a
   * compact PowerSample into the singleton ring buffer.
   *
   * Called once per `ingestTelemetry()` invocation.
   * Safe to call when `this.current` is non-null (always true at call site).
   */
  private pushSample(): void {
    const t = this.current?.timestamp;
    if (t === undefined) return; // guard — should never happen

    const sample: PowerSample = {
      t,
      wattsIn: this.current?.battery?.wattsIn,
      wattsOut: this.current?.battery?.wattsOut,
      solarWatts: this.current?.solar?.watts,
      socPct: this.current?.battery?.socPct,
      stale: this.current?.flags?.stale,
    };

    powerSampleBuffer.push(sample);
  }

  private notifySubscribers(): void {
    const snapshot = this.current;
    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch {
        // Subscriber errors must never crash the manager
      }
    }
  }

  // ── Phase 3I-2: load detection integration ────────────────────────────

  /**
   * Lazily start the detection interval on first telemetry ingestion.
   * Idempotent — calling multiple times has no effect once the timer
   * is running.
   */
  private ensureDetectionRunning(): void {
    if (this.detectionTimer !== null) return;

    this.detectionTimer = setInterval(() => {
      this.runDetection();
    }, DETECTION_INTERVAL_MS);
  }

  /**
   * Pull the last 10 minutes of samples from the ring buffer, run the
   * load-detection engine, and push any new events into the store.
   *
   * Skips detection entirely if the most recent sample is flagged stale.
   */
  private runDetection(): void {
    // Guard: skip if latest sample is stale
    const latest = powerSampleBuffer.latest();
    if (!latest || latest.stale) return;

    const samples = powerSampleBuffer.getWindow(DETECTION_WINDOW_MS);
    if (samples.length < 5) return; // not enough data

    try {
      const events = detectLoadEvents(samples);
      if (events.length > 0) {
        powerEventsStore.add(events);
      }
    } catch {
      // Detection errors must never crash the manager
    }
  }

  /**
   * Stop the detection interval. Useful for cleanup / testing.
   */
  stopDetection(): void {
    if (this.detectionTimer !== null) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
  }

}

// ── Singleton export ────────────────────────────────────────────────────
export const powerTelemetryManager = new PowerTelemetryManager();

