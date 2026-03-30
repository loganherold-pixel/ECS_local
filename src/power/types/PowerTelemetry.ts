/**
 * PowerTelemetry — canonical contract for all ECS power-system data.
 *
 * Every power connector (BLE, cloud, Wi-Fi, gateway, SIM) normalises its
 * vendor-specific payload into this shape before it enters the app.
 *
 * Phase 1A — structure only, no runtime consumers yet.
 */

// ── Source transport that produced this reading ──────────────────────────
export type PowerSource = "ble" | "cloud" | "wifi" | "gateway" | "sim";

// ── Connection lifecycle state ──────────────────────────────────────────
export type PowerConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

// ── Device identity ─────────────────────────────────────────────────────
export interface PowerDevice {
  /** Unique device identifier (MAC, serial, UUID — vendor-dependent) */
  id: string;
  /** Vendor / manufacturer key, e.g. "renogy", "victron", "bluetti" */
  vendor: string;
  /** Human-readable model name */
  model?: string;
  /** Hardware serial number */
  serial?: string;
  /** Firmware version string */
  firmware?: string;
}

// ── Battery bank readings ───────────────────────────────────────────────
export interface PowerBattery {
  /** State-of-charge percentage (0–100) */
  socPct?: number;
  /** Terminal voltage */
  volts?: number;
  /** Instantaneous current (positive = charging) */
  amps?: number;
  /** Power flowing into the battery (W) */
  wattsIn?: number;
  /** Power flowing out of the battery (W) */
  wattsOut?: number;
  /** Battery temperature in °C */
  tempC?: number;
  /** Charge-cycle count */
  cycles?: number;
  /** Battery health / state-of-health percentage */
  healthPct?: number;
  /** Estimated remaining runtime in minutes at current draw */
  estRuntimeMin?: number;
}

// ── Solar input readings ────────────────────────────────────────────────
export interface PowerSolar {
  /** Instantaneous solar power (W) */
  watts?: number;
  /** Panel voltage */
  volts?: number;
  /** Panel current */
  amps?: number;
}

// ── Boolean flags for quick UI gating ───────────────────────────────────
export interface PowerFlags {
  /** Battery is currently accepting charge */
  charging?: boolean;
  /** AC inverter is energised */
  inverterOn?: boolean;
  /** Battery below vendor low-threshold */
  lowBattery?: boolean;
  /** Reading is older than the freshness window */
  stale?: boolean;
}

// ── Declared capabilities (set once per device, not per packet) ─────────
export interface PowerCapabilities {
  /** Device reports state-of-charge */
  hasSOC: boolean;
  /** Device reports watts-in */
  hasWattsIn: boolean;
  /** Device reports watts-out */
  hasWattsOut: boolean;
  /** Device reports solar input */
  hasSolar: boolean;
  /** Device can estimate remaining runtime */
  hasRuntimeEstimate: boolean;
  /** Device accepts remote commands (relay toggle, etc.) */
  controllable: boolean;
}

// ── Link-quality metadata ───────────────────────────────────────────────
export interface PowerQuality {
  /** Received signal strength indicator (dBm, BLE/Wi-Fi) */
  rssi?: number;
  /** Monotonic packet sequence number */
  seq?: number;
  /** Epoch-ms of the last raw packet received */
  lastPacketAt?: number;
  /** Current connection lifecycle state */
  connection?: PowerConnectionState;
}

// ── Top-level telemetry envelope ────────────────────────────────────────
export interface PowerTelemetry {
  /** Epoch-ms when this reading was created / received */
  timestamp: number;

  /** Transport that delivered the reading */
  source: PowerSource;

  /** Identity of the physical device */
  device: PowerDevice;

  /** Battery bank data (optional — not all devices are battery monitors) */
  battery?: PowerBattery;

  /** Solar input data (optional) */
  solar?: PowerSolar;

  /** Quick boolean flags for UI gating */
  flags?: PowerFlags;

  /** What this device is capable of reporting */
  capabilities: PowerCapabilities;

  /** Link-quality / connection metadata */
  quality?: PowerQuality;
}

