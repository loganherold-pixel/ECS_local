/**
 * IPowerConnector — abstract contract for power-system transport connectors.
 *
 * Each transport (BLE, cloud API, Wi-Fi, gateway, SIM) implements this
 * interface so the telemetry layer can treat them uniformly.
 *
 * Phase 1B — interface only, no concrete implementations yet.
 */

import type {
  PowerTelemetry,
  PowerConnectionState,
} from "../types/PowerTelemetry";

// ── Core connector contract ─────────────────────────────────────────────
export interface IPowerConnector {
  /**
   * Establish a connection to the device identified by `deviceId`.
   * Resolves when the link is ready to stream telemetry.
   */
  connect(deviceId: string): Promise<void>;

  /**
   * Tear down the active connection and release resources.
   */
  disconnect(): Promise<void>;

  /**
   * Return the current lifecycle state of the connection.
   */
  getConnectionState(): PowerConnectionState;

  /**
   * Return the most-recent telemetry snapshot, or `null` if none has
   * been received since the last connect().
   */
  getCurrentTelemetry(): PowerTelemetry | null;

  /**
   * Subscribe to incoming telemetry packets.
   * Returns an unsubscribe function.
   */
  subscribe(cb: (data: PowerTelemetry) => void): () => void;

  // ── Optional scan helpers (BLE / Wi-Fi discovery) ───────────────────

  /** Begin scanning for nearby devices (BLE / mDNS). */
  startScan?(): Promise<void>;

  /** Stop an active scan. */
  stopScan?(): Promise<void>;

  /** Return a snapshot of devices discovered during the current scan. */
  getDiscoveredDevices?(): Promise<DiscoveredPowerDevice[]>;
}

// ── Discovered-device descriptor (used by scan helpers) ─────────────────
export interface DiscoveredPowerDevice {
  /** Transport-level identifier (MAC address, IP, etc.) */
  id: string;
  /** Human-readable name advertised by the device */
  name?: string;
  /** Vendor hint extracted from advertisement data */
  vendor?: string;
  /** Signal strength at discovery time (dBm) */
  rssi?: number;
  /** Raw advertisement / discovery payload for driver matching */
  raw?: unknown;
}

