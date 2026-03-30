/**
 * MockPowerConnector — simulated IPowerConnector for development & testing.
 *
 * Streams realistic battery + solar telemetry at 1 Hz without requiring
 * real BLE hardware. Useful for:
 *   - UI development against live-updating data
 *   - Verifying PowerTelemetryManager → usePowerTelemetry() pipeline
 *   - Demo / trade-show mode
 *
 * Phase 2C — no vendor parsing, no BLE dependency.
 */

import type {
  IPowerConnector,
  DiscoveredPowerDevice,
} from "./IPowerConnector";
import type {
  PowerTelemetry,
  PowerConnectionState,
  PowerCapabilities,
} from "../types/PowerTelemetry";

// ── Configuration ───────────────────────────────────────────────────────

/** How often the mock emits a telemetry update (ms). */
const TICK_INTERVAL_MS = 1_000;

/** Simulated battery capacity in Wh (e.g. a mid-size LiFePO4 station). */
const SIMULATED_CAPACITY_WH = 2_048;

/** Minimum SOC the simulation will drift down to. */
const SOC_FLOOR = 8;

/** Maximum SOC the simulation will drift up to. */
const SOC_CEILING = 100;

// ── Subscriber type ─────────────────────────────────────────────────────
type TelemetryCallback = (data: PowerTelemetry) => void;

// ── Simulation helpers ──────────────────────────────────────────────────

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Compute a solar multiplier based on the current hour of day.
 * Peaks at solar noon (~13:00 local), zero at night.
 * Returns a value in [0, 1].
 */
function solarMultiplier(): number {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  // Bell curve centred at 13:00, width ~5 hours
  if (hour < 6 || hour > 20) return 0;
  const x = (hour - 13) / 4;
  return Math.exp(-x * x) * clamp(1 - Math.abs(x) * 0.15, 0, 1);
}

// ── MockPowerConnector class ────────────────────────────────────────────

export class MockPowerConnector implements IPowerConnector {
  // ── Internal state ──────────────────────────────────────────────────
  private connectionState: PowerConnectionState = "idle";
  private subscribers: Set<TelemetryCallback> = new Set();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private currentTelemetry: PowerTelemetry | null = null;
  private deviceId: string = "mock";
  private packetSeq: number = 0;

  // ── Simulation state ───────────────────────────────────────────────
  private socPct: number = 72; // Start at a realistic mid-range SOC
  private socDrift: number = 0; // Accumulated fractional SOC change
  private wattsIn: number = 0;
  private wattsOut: number = 120;
  private solarWatts: number = 0;
  private solarVolts: number = 0;
  private solarAmps: number = 0;
  private batteryVolts: number = 25.6;
  private batteryTempC: number = 24;
  private cycleCount: number = 147;

  // ── IPowerConnector: connect ────────────────────────────────────────

  async connect(deviceId: string): Promise<void> {
    this.deviceId = deviceId || "mock";
    this.connectionState = "connecting";

    // Simulate a brief connection handshake
    await new Promise<void>((resolve) => setTimeout(resolve, 400));

    this.connectionState = "connected";
    this.packetSeq = 0;

    // Reset simulation to realistic starting values
    this.socPct = clamp(randRange(55, 85), SOC_FLOOR, SOC_CEILING);
    this.socDrift = 0;
    this.wattsIn = 0;
    this.wattsOut = randRange(80, 180);
    this.batteryVolts = 24 + (this.socPct / 100) * 4.8; // 24V–28.8V range
    this.batteryTempC = randRange(20, 30);

    // Start the telemetry tick
    this.startTick();

    if (__DEV__) {
      console.log(
        `[MockPowerConnector] Connected to "${this.deviceId}" — streaming at ${TICK_INTERVAL_MS}ms`,
      );
    }
  }

  // ── IPowerConnector: disconnect ─────────────────────────────────────

  async disconnect(): Promise<void> {
    this.stopTick();
    this.connectionState = "idle";
    this.currentTelemetry = null;
    this.packetSeq = 0;

    if (__DEV__) {
      console.log("[MockPowerConnector] Disconnected.");
    }
  }

  // ── IPowerConnector: getConnectionState ─────────────────────────────

  getConnectionState(): PowerConnectionState {
    return this.connectionState;
  }

  // ── IPowerConnector: getCurrentTelemetry ────────────────────────────

  getCurrentTelemetry(): PowerTelemetry | null {
    return this.currentTelemetry;
  }

  // ── IPowerConnector: subscribe ──────────────────────────────────────

  subscribe(cb: TelemetryCallback): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  // ── Optional scan stubs (mock returns a fake device) ────────────────

  async startScan(): Promise<void> {
    // No-op for mock — scanning is not meaningful
  }

  async stopScan(): Promise<void> {
    // No-op
  }

  async getDiscoveredDevices(): Promise<DiscoveredPowerDevice[]> {
    return [
      {
        id: "mock",
        name: "ECS Simulator",
        vendor: "ECS",
        rssi: -42,
        raw: { connectionHint: "sim", lastSeenAt: Date.now() },
      },
    ];
  }

  // ── Public helpers ──────────────────────────────────────────────────

  /** Check if the mock is currently streaming. */
  isStreaming(): boolean {
    return this.tickTimer !== null;
  }

  /** Destroy the connector and release all resources. */
  destroy(): void {
    this.stopTick();
    this.subscribers.clear();
    this.currentTelemetry = null;
    this.connectionState = "idle";
  }

  // ── Private: tick loop ──────────────────────────────────────────────

  private startTick(): void {
    this.stopTick();

    // Emit immediately
    this.tick();

    this.tickTimer = setInterval(() => {
      this.tick();
    }, TICK_INTERVAL_MS);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // ── Private: simulation tick ────────────────────────────────────────

  private tick(): void {
    if (this.connectionState !== "connected") return;

    this.packetSeq++;
    this.advanceSimulation();

    const now = Date.now();
    const netWatts = this.wattsIn + this.solarWatts - this.wattsOut;
    const isCharging = netWatts > 0;

    // Estimate runtime: remaining Wh / net draw (only meaningful when discharging)
    let estRuntimeMin: number | undefined;
    if (!isCharging && this.wattsOut > 0) {
      const remainingWh = (this.socPct / 100) * SIMULATED_CAPACITY_WH;
      const netDraw = this.wattsOut - this.wattsIn - this.solarWatts;
      if (netDraw > 0) {
        estRuntimeMin = Math.round((remainingWh / netDraw) * 60);
      }
    }

    const capabilities: PowerCapabilities = {
      hasSOC: true,
      hasWattsIn: true,
      hasWattsOut: true,
      hasSolar: true,
      hasRuntimeEstimate: true,
      controllable: false,
    };

    const telemetry: PowerTelemetry = {
      timestamp: now,
      source: "sim",
      device: {
        id: this.deviceId,
        vendor: "ECS",
        model: "Simulator",
        firmware: "2.0.0-sim",
      },
      battery: {
        socPct: Math.round(this.socPct * 10) / 10,
        volts: Math.round(this.batteryVolts * 100) / 100,
        amps: Math.round((netWatts / this.batteryVolts) * 100) / 100,
        wattsIn: Math.round(this.wattsIn),
        wattsOut: Math.round(this.wattsOut),
        tempC: Math.round(this.batteryTempC * 10) / 10,
        cycles: this.cycleCount,
        healthPct: 96,
        estRuntimeMin,
      },
      solar: {
        watts: Math.round(this.solarWatts * 10) / 10,
        volts: Math.round(this.solarVolts * 10) / 10,
        amps: Math.round(this.solarAmps * 100) / 100,
      },
      flags: {
        charging: isCharging,
        inverterOn: this.wattsOut > 0,
        lowBattery: this.socPct < 15,
        stale: false,
      },
      capabilities,
      quality: {
        rssi: -42 + Math.round(randRange(-5, 5)),
        seq: this.packetSeq,
        lastPacketAt: now,
        connection: "connected",
      },
    };

    this.currentTelemetry = telemetry;
    this.notifySubscribers(telemetry);
  }

  // ── Private: advance simulation values ──────────────────────────────

  private advanceSimulation(): void {
    // ── Solar ──────────────────────────────────────────────────────
    const solarMult = solarMultiplier();
    // Peak solar output: ~400W with noise
    const peakSolar = 400;
    this.solarWatts = clamp(
      solarMult * peakSolar + randRange(-15, 15),
      0,
      peakSolar,
    );
    // Panel voltage: ~18–22V when producing, ~0V at night
    this.solarVolts = this.solarWatts > 1 ? 18 + randRange(0, 4) : 0;
    this.solarAmps =
      this.solarVolts > 0 ? this.solarWatts / this.solarVolts : 0;

    // ── Load (wattsOut) — slow random walk ─────────────────────────
    this.wattsOut = clamp(
      this.wattsOut + randRange(-8, 8),
      30, // minimum baseline draw (fridge, electronics)
      350,
    );

    // ── Charging input (wattsIn) — simulates shore/alternator ──────
    // Randomly toggle charging source on/off over long periods
    if (Math.random() < 0.005) {
      // ~0.5% chance per tick to toggle shore power
      this.wattsIn = this.wattsIn > 10 ? 0 : randRange(200, 500);
    }
    if (this.wattsIn > 0) {
      this.wattsIn = clamp(this.wattsIn + randRange(-5, 5), 0, 600);
    }

    // ── SOC drift ──────────────────────────────────────────────────
    const netWatts = this.wattsIn + this.solarWatts - this.wattsOut;
    // Convert net watts to SOC change per second:
    // netWatts (W) * (1/3600 h) / capacityWh * 100 = %/s
    const socChangePerSec = (netWatts / SIMULATED_CAPACITY_WH) * (100 / 3600);
    this.socDrift += socChangePerSec;

    // Apply drift in whole-ish increments to avoid jitter
    if (Math.abs(this.socDrift) >= 0.01) {
      this.socPct = clamp(
        this.socPct + this.socDrift,
        SOC_FLOOR,
        SOC_CEILING,
      );
      this.socDrift = 0;
    }

    // ── Battery voltage tracks SOC roughly ─────────────────────────
    // LiFePO4 24V: ~24.0V (empty) to ~28.8V (full)
    const targetVolts = 24.0 + (this.socPct / 100) * 4.8;
    this.batteryVolts += (targetVolts - this.batteryVolts) * 0.1;
    this.batteryVolts += randRange(-0.02, 0.02);

    // ── Temperature — slow drift with load correlation ─────────────
    const loadHeat = this.wattsOut / 1000; // slight warming under load
    const ambientTarget = 24 + loadHeat;
    this.batteryTempC += (ambientTarget - this.batteryTempC) * 0.02;
    this.batteryTempC += randRange(-0.1, 0.1);
    this.batteryTempC = clamp(this.batteryTempC, -10, 55);
  }

  // ── Private: subscriber notification ────────────────────────────────

  private notifySubscribers(data: PowerTelemetry): void {
    for (const cb of this.subscribers) {
      try {
        cb(data);
      } catch {
        // Subscriber errors must never crash the connector
      }
    }
  }
}

