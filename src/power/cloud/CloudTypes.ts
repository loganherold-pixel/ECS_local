/**
 * CloudTypes — shared type contracts for cloud-based power connectors.
 *
 * Defines the provider interface that vendor-specific cloud integrations
 * (EcoFlow, Bluetti Cloud, Goal Zero, etc.) must implement, plus
 * configuration and metadata types used by CloudConnector.
 *
 * Phase 3A — skeleton only, no vendor implementations yet.
 */

import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../types/PowerTelemetry";

// ── Cloud provider contract ─────────────────────────────────────────────

/**
 * A vendor-specific cloud integration must implement this interface.
 * CloudConnector delegates all API communication to the provider and
 * handles polling, telemetry merging, and subscriber notification.
 */
export interface ICloudProvider {
  /** Unique provider identifier, e.g. "ecoflow", "bluetti", "goalzero". */
  readonly id: string;

  /**
   * Establish a cloud session for the given device.
   * The `token` is retrieved from TokenStore before this call.
   * Implementations should validate the token and prepare any
   * session state needed for subsequent pollOnce() calls.
   *
   * @throws If the token is invalid, expired, or the device is unreachable.
   */
  connect(deviceId: string, token: string): Promise<void>;

  /**
   * Tear down the cloud session and release any resources
   * (WebSocket connections, refresh timers, etc.).
   */
  disconnect(): Promise<void>;

  /**
   * Perform a single poll of the device's current state.
   * Returns a partial telemetry snapshot — CloudConnector will
   * deep-merge it into the canonical PowerTelemetry envelope.
   *
   * Implementations should handle rate limiting, retries, and
   * transient errors internally. If a poll fails, throw an error
   * so CloudConnector can transition to the error state.
   */
  pollOnce(): Promise<Partial<PowerTelemetry>>;

  /**
   * Return the static capability set for this provider/device.
   * Called once after connect() succeeds and cached for the session.
   */
  getCapabilities(): PowerCapabilities;
}

// ── Cloud provider metadata ─────────────────────────────────────────────

/**
 * Static metadata about a cloud provider, used for UI display
 * and provider selection screens.
 */
export interface CloudProviderMeta {
  /** Same id as ICloudProvider.id */
  id: string;
  /** Human-readable display name, e.g. "EcoFlow Cloud" */
  displayName: string;
  /** Whether this provider requires an OAuth flow vs. API key */
  authType: "oauth" | "apikey" | "token";
  /** Optional URL for the provider's logo / icon */
  iconUrl?: string;
  /** Brief description shown in provider picker */
  description?: string;
}

// ── CloudConnector configuration ────────────────────────────────────────

/**
 * Configuration options for CloudConnector.
 * All fields have sensible defaults.
 */
export interface CloudConnectorConfig {
  /**
   * Polling interval in milliseconds.
   * How often CloudConnector calls provider.pollOnce().
   * @default 5000
   */
  pollIntervalMs?: number;

  /**
   * Maximum number of consecutive poll failures before
   * CloudConnector transitions to the "error" state.
   * @default 5
   */
  maxConsecutiveErrors?: number;

  /**
   * Whether to apply exponential backoff on poll failures.
   * When true, the poll interval doubles after each failure
   * (up to 4× the base interval) and resets on success.
   * @default true
   */
  backoffOnError?: boolean;

  /**
   * Maximum backoff multiplier applied to pollIntervalMs.
   * @default 4
   */
  maxBackoffMultiplier?: number;

  /**
   * If true, CloudConnector will attempt one immediate poll
   * right after connect() succeeds, before starting the
   * periodic timer.
   * @default true
   */
  pollImmediately?: boolean;
}

// ── Defaults ────────────────────────────────────────────────────────────

export const DEFAULT_CLOUD_CONFIG: Required<CloudConnectorConfig> = {
  pollIntervalMs: 5_000,
  maxConsecutiveErrors: 5,
  backoffOnError: true,
  maxBackoffMultiplier: 4,
  pollImmediately: true,
};

// ── Cloud connection internal state ─────────────────────────────────────

/**
 * Internal state machine states for CloudConnector.
 * Mapped to the public PowerConnectionState for consumers.
 */
export type CloudInternalState =
  | "idle"
  | "authenticating"
  | "connecting"
  | "connected"
  | "polling"
  | "backoff"
  | "error"
  | "disconnecting";

