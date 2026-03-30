/**
 * CloudConnector — IPowerConnector implementation for cloud-based
 * power station APIs (EcoFlow, Bluetti, Goal Zero, etc.).
 *
 * Delegates all vendor-specific API communication to an injected
 * ICloudProvider, handling:
 *   - Token retrieval from TokenStore
 *   - Periodic polling with configurable interval
 *   - Exponential backoff on consecutive failures
 *   - Telemetry merging into canonical PowerTelemetry envelope
 *   - Connection state machine
 *   - Subscriber notification
 *
 * Phase 3A — skeleton with full polling loop, no vendor providers yet.
 */

import type { IPowerConnector } from "./IPowerConnector";
import type {
  PowerTelemetry,
  PowerConnectionState,
  PowerCapabilities,
} from "../types/PowerTelemetry";
import type {
  ICloudProvider,
  CloudConnectorConfig,
  CloudInternalState,
} from "../cloud/CloudTypes";
import { DEFAULT_CLOUD_CONFIG } from "../cloud/CloudTypes";
import type { TokenStore } from "../cloud/TokenStore";

// ── Subscriber type ─────────────────────────────────────────────────────
type TelemetryCallback = (data: PowerTelemetry) => void;

// ── Default capabilities (all false) ────────────────────────────────────
const EMPTY_CAPABILITIES: PowerCapabilities = {
  hasSOC: false,
  hasWattsIn: false,
  hasWattsOut: false,
  hasSolar: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

// ── CloudConnector class ────────────────────────────────────────────────

export class CloudConnector implements IPowerConnector {
  // ── Dependencies ────────────────────────────────────────────────────
  private readonly provider: ICloudProvider;
  private readonly tokenStore: TokenStore;
  private readonly config: Required<CloudConnectorConfig>;

  // ── Connection state ────────────────────────────────────────────────
  private internalState: CloudInternalState = "idle";
  private deviceId: string | null = null;
  private capabilities: PowerCapabilities = { ...EMPTY_CAPABILITIES };

  // ── Telemetry state ─────────────────────────────────────────────────
  private currentTelemetry: PowerTelemetry | null = null;
  private subscribers: Set<TelemetryCallback> = new Set();
  private packetSeq: number = 0;

  // ── Polling state ───────────────────────────────────────────────────
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors: number = 0;
  private currentBackoffMultiplier: number = 1;
  private lastPollAt: number = 0;
  private lastErrorMessage: string | null = null;

  // ── Constructor ─────────────────────────────────────────────────────

  constructor(
    provider: ICloudProvider,
    tokenStore: TokenStore,
    config?: CloudConnectorConfig,
  ) {
    this.provider = provider;
    this.tokenStore = tokenStore;
    this.config = { ...DEFAULT_CLOUD_CONFIG, ...config };
  }

  // ── IPowerConnector: connect ────────────────────────────────────────

  async connect(deviceId: string): Promise<void> {
    if (this.internalState === "connected" || this.internalState === "polling") {
      if (__DEV__) {
        console.log(
          `[CloudConnector:${this.provider.id}] Already connected — ignoring connect().`,
        );
      }
      return;
    }

    this.deviceId = deviceId;
    this.packetSeq = 0;
    this.consecutiveErrors = 0;
    this.currentBackoffMultiplier = 1;
    this.lastErrorMessage = null;

    // ── Step 1: Retrieve token ──────────────────────────────────────
    this.setState("authenticating");

    const token = await this.tokenStore.getToken(this.provider.id);
    if (!token) {
      this.setState("error");
      this.lastErrorMessage = `No token found for provider "${this.provider.id}". Call tokenStore.setToken() first.`;
      if (__DEV__) {
        console.error(`[CloudConnector:${this.provider.id}] ${this.lastErrorMessage}`);
      }
      throw new Error(this.lastErrorMessage);
    }

    // ── Step 2: Connect to provider ─────────────────────────────────
    this.setState("connecting");

    try {
      await this.provider.connect(deviceId, token);
    } catch (err) {
      this.setState("error");
      this.lastErrorMessage =
        err instanceof Error ? err.message : "Provider connect() failed";
      if (__DEV__) {
        console.error(
          `[CloudConnector:${this.provider.id}] Connect failed:`,
          this.lastErrorMessage,
        );
      }
      throw err;
    }

    // ── Step 3: Cache capabilities ──────────────────────────────────
    this.capabilities = this.provider.getCapabilities();
    this.setState("connected");

    if (__DEV__) {
      console.log(
        `[CloudConnector:${this.provider.id}] Connected to device "${deviceId}" — polling every ${this.config.pollIntervalMs}ms`,
      );
    }

    // ── Step 4: Start polling ───────────────────────────────────────
    if (this.config.pollImmediately) {
      // Fire first poll immediately, then start periodic timer
      await this.executePoll();
    }
    this.schedulePoll();
  }

  // ── IPowerConnector: disconnect ─────────────────────────────────────

  async disconnect(): Promise<void> {
    this.setState("disconnecting");
    this.cancelPoll();

    try {
      await this.provider.disconnect();
    } catch (err) {
      if (__DEV__) {
        console.warn(
          `[CloudConnector:${this.provider.id}] Provider disconnect() error:`,
          err,
        );
      }
    }

    this.deviceId = null;
    this.currentTelemetry = null;
    this.packetSeq = 0;
    this.consecutiveErrors = 0;
    this.currentBackoffMultiplier = 1;
    this.lastErrorMessage = null;
    this.setState("idle");

    if (__DEV__) {
      console.log(`[CloudConnector:${this.provider.id}] Disconnected.`);
    }
  }

  // ── IPowerConnector: getConnectionState ─────────────────────────────

  getConnectionState(): PowerConnectionState {
    switch (this.internalState) {
      case "idle":
      case "disconnecting":
        return "idle";
      case "authenticating":
      case "connecting":
        return "connecting";
      case "connected":
      case "polling":
      case "backoff":
        return "connected";
      case "error":
        return "error";
      default:
        return "idle";
    }
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

  // ── Public accessors ────────────────────────────────────────────────

  /** Return the internal state for diagnostics. */
  getInternalState(): CloudInternalState {
    return this.internalState;
  }

  /** Return the provider ID. */
  getProviderId(): string {
    return this.provider.id;
  }

  /** Return the connected device ID, or null. */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /** Return the last error message, or null. */
  getLastError(): string | null {
    return this.lastErrorMessage;
  }

  /** Return the number of consecutive poll errors. */
  getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }

  /** Return the epoch-ms of the last successful poll. */
  getLastPollTime(): number {
    return this.lastPollAt;
  }

  /** Destroy the connector and release all resources. */
  destroy(): void {
    this.cancelPoll();
    this.subscribers.clear();
    this.currentTelemetry = null;
    this.deviceId = null;
    this.setState("idle");
  }

  // ── Private: state machine ──────────────────────────────────────────

  private setState(state: CloudInternalState): void {
    const prev = this.internalState;
    this.internalState = state;

    if (__DEV__ && prev !== state) {
      console.log(
        `[CloudConnector:${this.provider.id}] State: ${prev} → ${state}`,
      );
    }
  }

  // ── Private: polling loop ───────────────────────────────────────────

  private schedulePoll(): void {
    this.cancelPoll();

    const interval = this.config.backoffOnError
      ? this.config.pollIntervalMs * this.currentBackoffMultiplier
      : this.config.pollIntervalMs;

    this.pollTimer = setTimeout(async () => {
      await this.executePoll();

      // Continue polling if still connected
      if (
        this.internalState === "connected" ||
        this.internalState === "polling" ||
        this.internalState === "backoff"
      ) {
        this.schedulePoll();
      }
    }, interval);
  }

  private cancelPoll(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async executePoll(): Promise<void> {
    if (
      this.internalState !== "connected" &&
      this.internalState !== "polling" &&
      this.internalState !== "backoff"
    ) {
      return;
    }

    this.setState("polling");

    try {
      const partial = await this.provider.pollOnce();
      this.onPollSuccess(partial);
    } catch (err) {
      this.onPollError(err);
    }
  }

  // ── Private: poll result handlers ───────────────────────────────────

  private onPollSuccess(partial: Partial<PowerTelemetry>): void {
    this.consecutiveErrors = 0;
    this.currentBackoffMultiplier = 1;
    this.lastPollAt = Date.now();
    this.lastErrorMessage = null;
    this.packetSeq++;

    // Build the full telemetry envelope
    const now = Date.now();

    const telemetry: PowerTelemetry = this.mergeTelemetry(partial, now);
    this.currentTelemetry = telemetry;

    this.setState("connected");
    this.notifySubscribers(telemetry);
  }

  private onPollError(err: unknown): void {
    this.consecutiveErrors++;
    this.lastErrorMessage =
      err instanceof Error ? err.message : String(err);

    if (__DEV__) {
      console.warn(
        `[CloudConnector:${this.provider.id}] Poll error #${this.consecutiveErrors}:`,
        this.lastErrorMessage,
      );
    }

    // Apply backoff
    if (this.config.backoffOnError) {
      this.currentBackoffMultiplier = Math.min(
        this.currentBackoffMultiplier * 2,
        this.config.maxBackoffMultiplier,
      );
    }

    // Check if we've exceeded the error threshold
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      this.setState("error");
      this.cancelPoll();

      if (__DEV__) {
        console.error(
          `[CloudConnector:${this.provider.id}] Max consecutive errors (${this.config.maxConsecutiveErrors}) reached — entering error state.`,
        );
      }

      // Emit a stale telemetry update so subscribers know something is wrong
      if (this.currentTelemetry) {
        const staleTelemetry: PowerTelemetry = {
          ...this.currentTelemetry,
          timestamp: Date.now(),
          flags: {
            ...this.currentTelemetry.flags,
            stale: true,
          },
          quality: {
            ...this.currentTelemetry.quality,
            connection: "error",
          },
        };
        this.currentTelemetry = staleTelemetry;
        this.notifySubscribers(staleTelemetry);
      }
    } else {
      this.setState("backoff");
    }
  }

  // ── Private: telemetry merging ──────────────────────────────────────

  /**
   * Merge a partial telemetry from the provider into a full
   * PowerTelemetry envelope with cloud-specific defaults.
   */
  private mergeTelemetry(
    partial: Partial<PowerTelemetry>,
    now: number,
  ): PowerTelemetry {
    const base: PowerTelemetry = this.currentTelemetry ?? {
      timestamp: now,
      source: "cloud",
      device: {
        id: this.deviceId ?? "unknown",
        vendor: this.provider.id,
      },
      capabilities: this.capabilities,
    };

    // Deep merge: partial overrides base for defined fields
    return {
      timestamp: partial.timestamp ?? now,
      source: partial.source ?? "cloud",

      device: {
        ...base.device,
        ...(partial.device ?? {}),
        // Ensure vendor is always set from provider
        vendor: partial.device?.vendor ?? base.device?.vendor ?? this.provider.id,
      },

      battery: partial.battery !== undefined
        ? { ...base.battery, ...partial.battery }
        : base.battery,

      solar: partial.solar !== undefined
        ? { ...base.solar, ...partial.solar }
        : base.solar,

      flags: partial.flags !== undefined
        ? { ...base.flags, ...partial.flags }
        : base.flags,

      capabilities: partial.capabilities ?? base.capabilities ?? this.capabilities,

      quality: {
        ...base.quality,
        ...(partial.quality ?? {}),
        seq: this.packetSeq,
        lastPacketAt: now,
        connection: "connected",
      },
    };
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

