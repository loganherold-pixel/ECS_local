/**
 * BleTypes — shared type definitions for BLE power-system connectivity.
 *
 * Phase 2B — types consumed by BleConnector and future BLE UI components.
 */

// ── Internal BLE connection state machine ───────────────────────────────
export type BleInternalState =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

// ── BLE-specific discovered device (extends the generic shape) ──────────
export interface BleDiscoveredDevice {
  /** BLE peripheral identifier (platform-dependent: UUID on iOS, MAC on Android) */
  id: string;
  /** Advertised local name */
  name?: string;
  /** Signal strength at discovery time (dBm) */
  rssi?: number;
  /** Vendor hint extracted from advertisement data or name heuristics */
  vendorHint?: string;
  /** Always "ble" for BLE-discovered devices */
  connectionHint: "ble";
  /** Epoch-ms when this device was last seen in a scan */
  lastSeenAt: number;
  /** Raw advertisement service UUIDs (if any) */
  serviceUUIDs?: string[];
  /** Manufacturer-specific advertisement data (hex string) */
  manufacturerData?: string | null;
}

// ── Scan configuration ──────────────────────────────────────────────────
export interface BleScanOptions {
  /** Maximum scan duration in milliseconds (0 = indefinite). Default: 10000 */
  timeoutMs?: number;
  /** Filter by advertised service UUIDs (empty = no filter) */
  serviceUUIDs?: string[];
  /** Allow duplicate advertisements for the same device */
  allowDuplicates?: boolean;
}

// ── Default scan config ─────────────────────────────────────────────────
export const DEFAULT_SCAN_OPTIONS: Required<BleScanOptions> = {
  timeoutMs: 10_000,
  serviceUUIDs: [],
  allowDuplicates: false,
};

// ── Heartbeat configuration ─────────────────────────────────────────────
export interface BleHeartbeatConfig {
  /** Interval in ms between heartbeat telemetry emissions. Default: 2000 */
  intervalMs: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: BleHeartbeatConfig = {
  intervalMs: 2_000,
};

