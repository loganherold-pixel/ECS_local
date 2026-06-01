/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD-II PID POLLER — Phase 2C
 * ═══════════════════════════════════════════════════════════
 *
 * Handles sending OBD-II PID requests over BLE, parsing
 * responses, and normalizing data into the Vehicle Telemetry
 * normalized schema.
 *
 * OBD-II PID Reference (Mode 01 — Show Current Data):
 *   PID 0x0C — Engine RPM
 *   PID 0x0D — Vehicle Speed
 *   PID 0x04 — Engine Load
 *   PID 0x05 — Coolant Temperature
 *   PID 0x0F — Intake Air Temperature
 *   PID 0x2F — Fuel Level
 *   PID 0x5E — Fuel Rate
 *   PID 0x1F — Engine Runtime
 *   PID 0x11 — Throttle Position
 *   PID 0x10 — MAF Rate
 *   PID 0x42 — Battery Voltage (Control Module)
 *
 * ELM327 AT Commands:
 *   ATZ   — Reset
 *   ATE0  — Echo off
 *   ATL0  — Linefeeds off
 *   ATS0  — Spaces off
 *   ATH0  — Headers off
 *   ATSP0 — Auto-detect protocol
 *   ATRV  — Read battery voltage
 *
 * Data flow:
 *   BLE characteristic write → ELM327 → vehicle ECU → response
 *   → parse hex → normalize → VT store
 *
 * The poller cycles through supported PIDs in a round-robin
 * fashion, skipping PIDs that return "NO DATA" or "?" after
 * the first attempt (unsupported by the vehicle).
 */

import { Platform, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { NormalizedVehicleTelemetry, OBD2TelemetryValue } from './VehicleTelemetryTypes';
import { ecsLog } from '../../lib/ecsLogger';
import {
  bluLog,
  bluLogThrottled,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
} from '../../lib/bluDiagnosticsLog';

const TAG = '[OBD2-PIDPoller]';

function logTelemetryDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('TELEMETRY', `${TAG} ${message}`, details);
}

function logTelemetryWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('TELEMETRY', `${TAG} ${message}`, details);
}

function isBluTimeoutMessage(message: string | null | undefined): boolean {
  return /timeout|timed out|no live|no data|did not receive|stall|unavailable/i.test(String(message ?? ''));
}

// ═══════════════════════════════════════════════════════════
// OBD-II PID DEFINITIONS
// ═══════════════════════════════════════════════════════════

export interface OBD2PIDDefinition {
  /** PID hex code (e.g., '0C' for RPM) */
  pid: string;
  /** Human-readable name */
  name: string;
  /** OBD-II command string (e.g., '010C') */
  command: string;
  /** Number of response bytes expected */
  bytes: number;
  /** Parse raw bytes into a numeric value */
  parse: (bytes: number[]) => number;
  /** Unit of the parsed value */
  unit: string;
  /** Field name in NormalizedVehicleTelemetry */
  telemetryField: keyof NormalizedVehicleTelemetry;
  /** Whether this PID is essential (always polled) vs optional */
  essential: boolean;
}

/**
 * Core OBD-II PIDs for vehicle telemetry.
 * Ordered by priority — essential PIDs first.
 */
export const OBD2_PIDS: OBD2PIDDefinition[] = [
  {
    pid: '0C',
    name: 'Engine RPM',
    command: '010C',
    bytes: 2,
    parse: (b) => ((b[0] * 256) + b[1]) / 4,
    unit: 'rpm',
    telemetryField: 'engine_rpm',
    essential: true,
  },
  {
    pid: '0D',
    name: 'Vehicle Speed',
    command: '010D',
    bytes: 1,
    // OBD returns km/h — convert to mph
    parse: (b) => Math.round(b[0] * 0.621371),
    unit: 'mph',
    telemetryField: 'vehicle_speed',
    essential: true,
  },
  {
    pid: '05',
    name: 'Coolant Temperature',
    command: '0105',
    bytes: 1,
    // OBD returns °C offset by 40 — convert to °F
    parse: (b) => Math.round((b[0] - 40) * 9 / 5 + 32),
    unit: '°F',
    telemetryField: 'coolant_temp',
    essential: true,
  },
  {
    pid: '04',
    name: 'Engine Load',
    command: '0104',
    bytes: 1,
    parse: (b) => Math.round(b[0] * 100 / 255),
    unit: '%',
    telemetryField: 'engine_load',
    essential: true,
  },
  {
    pid: '2F',
    name: 'Fuel Level',
    command: '012F',
    bytes: 1,
    parse: (b) => Math.round(b[0] * 100 / 255),
    unit: '%',
    telemetryField: 'fuel_level',
    essential: true,
  },
  {
    pid: '0F',
    name: 'Intake Air Temperature',
    command: '010F',
    bytes: 1,
    // OBD returns °C offset by 40 — convert to °F
    parse: (b) => Math.round((b[0] - 40) * 9 / 5 + 32),
    unit: '°F',
    telemetryField: 'intake_temp',
    essential: false,
  },
  {
    pid: '1F',
    name: 'Engine Runtime',
    command: '011F',
    bytes: 2,
    parse: (b) => (b[0] * 256) + b[1],
    unit: 'sec',
    telemetryField: 'engine_runtime',
    essential: false,
  },
  {
    pid: '11',
    name: 'Throttle Position',
    command: '0111',
    bytes: 1,
    parse: (b) => Math.round(b[0] * 100 / 255),
    unit: '%',
    telemetryField: 'throttle_position',
    essential: false,
  },
  {
    pid: '5E',
    name: 'Fuel Rate',
    command: '015E',
    bytes: 2,
    // OBD returns L/h — convert to gal/h
    parse: (b) => +((((b[0] * 256) + b[1]) / 20) * 0.264172).toFixed(2),
    unit: 'gal/h',
    telemetryField: 'fuel_rate',
    essential: false,
  },
  {
    pid: '10',
    name: 'MAF Rate',
    command: '0110',
    bytes: 2,
    parse: (b) => +((((b[0] * 256) + b[1]) / 100).toFixed(2)),
    unit: 'g/s',
    telemetryField: 'mass_air_flow',
    essential: false,
  },
];

// ═══════════════════════════════════════════════════════════
// ELM327 PROTOCOL
// ═══════════════════════════════════════════════════════════

/**
 * Known BLE characteristic UUIDs for ELM327-based adapters.
 * Most adapters use FFE1 for read/write on service FFE0.
 */
const ELM327_CHARACTERISTICS = {
  SERVICE: 'ffe0',
  TX: 'ffe1', // Write to adapter
  RX: 'ffe1', // Read from adapter (notifications)
  // OBDLink MX+ uses different UUIDs
  OBDLINK_SERVICE: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  OBDLINK_TX: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  OBDLINK_RX: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
};

/**
 * ELM327 initialization commands.
 * Sent in sequence when first connecting to configure the adapter.
 */
const ELM327_INIT_COMMANDS = [
  'ATZ',    // Reset
  'ATE0',   // Echo off
  'ATL0',   // Linefeeds off
  'ATS0',   // Spaces off
  'ATH0',   // Headers off
  'ATSP0',  // Auto-detect protocol
];

const ELM327_VERIFY_COMMANDS = [
  'ATI',
  'AT@1',
];

const NO_PID_DATA_MESSAGE =
  'Adapter connected, but no live OBD-II PID responses were received. Confirm the ignition/engine is on and the adapter supports BLE ELM327 telemetry.';

// ═══════════════════════════════════════════════════════════
// RESPONSE PARSER
// ═══════════════════════════════════════════════════════════

/**
 * Parse an ELM327 response string into data bytes.
 *
 * ELM327 responses look like:
 *   "41 0C 1A F8"  (with spaces, if ATS1)
 *   "410C1AF8"     (without spaces, if ATS0)
 *   "NO DATA"      (PID not supported)
 *   "?"            (unknown command)
 *   "SEARCHING..." (protocol detection in progress)
 *   ">"            (prompt, ready for next command)
 *
 * Returns null if the response is not valid data.
 */
export function parseELM327Response(raw: string): number[] | null {
  if (!raw || typeof raw !== 'string') return null;

  // Clean up response
  const cleaned = raw
    .replace(/[\r\n>]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();

  // Check for error responses
  if (
    cleaned === '' ||
    cleaned.includes('NODATA') ||
    cleaned.includes('ERROR') ||
    cleaned.includes('UNABLE') ||
    cleaned.includes('SEARCHING') ||
    cleaned.includes('BUSERROR') ||
    cleaned.includes('CANERROR') ||
    cleaned.includes('STOPPED') ||
    cleaned === '?'
  ) {
    return null;
  }

  // Extract hex bytes from response
  // Response format: "41 XX YY ZZ" where 41 = Mode 01 response
  // Remove the mode+PID prefix (first 4 hex chars = "41XX")
  const hexStr = cleaned.replace(/\s/g, '');

  // Must start with '41' (Mode 01 response)
  if (!hexStr.startsWith('41') || hexStr.length < 6) {
    // Try parsing ATRV response (battery voltage)
    const voltMatch = cleaned.match(/(\d+\.?\d*)V?/);
    if (voltMatch) {
      const volts = parseFloat(voltMatch[1]);
      if (volts > 0 && volts < 20) {
        // Return as a special marker — handled separately
        return [Math.round(volts * 10)]; // Store as tenths of volts
      }
    }
    return null;
  }

  // Skip "41" + PID byte(s) — extract data bytes
  // For Mode 01, response is: 41 [PID] [DATA...]
  const dataStart = 4; // Skip "41XX"
  const dataHex = hexStr.substring(dataStart);

  if (dataHex.length === 0 || dataHex.length % 2 !== 0) return null;

  const bytes: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    const byte = parseInt(dataHex.substring(i, i + 2), 16);
    if (isNaN(byte)) return null;
    bytes.push(byte);
  }

  return bytes;
}

/**
 * Parse ATRV (battery voltage) response.
 * Returns voltage as a number, or null if unparseable.
 */
export function parseBatteryVoltageResponse(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\r\n>]/g, '').trim();
  const match = cleaned.match(/(\d+\.?\d*)\s*V?/i);
  if (match) {
    const volts = parseFloat(match[1]);
    if (volts > 0 && volts < 20) return +volts.toFixed(1);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PID POLLER CLASS
// ═══════════════════════════════════════════════════════════

export type PollerState =
  | 'idle'
  | 'initializing'
  | 'polling'
  | 'paused'
  | 'error'
  | 'stopped';

export interface PollerStatus {
  state: PollerState;
  /** Number of successful poll cycles completed */
  cycleCount: number;
  /** PIDs that are supported by the connected vehicle */
  supportedPids: string[];
  /** PIDs that returned NO DATA (unsupported) */
  unsupportedPids: string[];
  /** Last error message */
  lastError: string | null;
  /** Whether the poller is currently in a poll cycle */
  inCycle: boolean;
  /** Epoch-ms of last successful data reception */
  lastDataAt: number;
  /** Current battery voltage from ATRV */
  batteryVoltage: number | null;
}

export interface PollerCallbacks {
  /** Called when new normalized telemetry is available */
  onTelemetry: (telemetry: NormalizedVehicleTelemetry) => void;
  /** Called to send a command to the BLE adapter */
  sendCommand: (command: string) => Promise<string>;
  /** Called when the poller encounters a fatal error */
  onError: (error: string) => void;
  /** Called when PID capabilities are discovered */
  onCapabilitiesDiscovered: (supported: string[], unsupported: string[]) => void;
}

/**
 * OBD-II PID Poller.
 *
 * Manages the polling lifecycle:
 *   1. Initialize ELM327 adapter (AT commands)
 *   2. Discover supported PIDs
 *   3. Poll supported PIDs in round-robin
 *   4. Normalize responses into VT schema
 *   5. Deliver normalized telemetry to callbacks
 *
 * Polling interval: 2.5s per full cycle (responsive but battery-friendly).
 * Individual PID requests: ~200ms each.
 */
export class OBD2PIDPoller {
  private state: PollerState = 'idle';
  private cycleCount = 0;
  private supportedPids: Set<string> = new Set();
  private unsupportedPids: Set<string> = new Set();
  private lastError: string | null = null;
  private inCycle = false;
  private lastDataAt = 0;
  private batteryVoltage: number | null = null;
  private currentObd2Values: OBD2TelemetryValue[] = [];

  private callbacks: PollerCallbacks;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private initialized = false;

  /** Accumulated telemetry values from the current cycle */
  private currentReading: Partial<NormalizedVehicleTelemetry> = {};

  /** Polling interval in ms (full cycle) */
  private intervalMs: number;

  /** Device ID for telemetry tagging */
  private deviceId: string;

  /** App state listener for pause/resume */
  private appStateSubscription: any = null;

  constructor(
    deviceId: string,
    callbacks: PollerCallbacks,
    intervalMs: number = 2500,
  ) {
    this.deviceId = deviceId;
    this.callbacks = callbacks;
    this.intervalMs = intervalMs;
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): PollerStatus {
    return {
      state: this.state,
      cycleCount: this.cycleCount,
      supportedPids: Array.from(this.supportedPids),
      unsupportedPids: Array.from(this.unsupportedPids),
      lastError: this.lastError,
      inCycle: this.inCycle,
      lastDataAt: this.lastDataAt,
      batteryVoltage: this.batteryVoltage,
    };
  }

  getState(): PollerState {
    return this.state;
  }

  isPolling(): boolean {
    return this.state === 'polling';
  }

  // ═══════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════

  /**
   * Initialize the ELM327 adapter and start polling.
   */
  async start(): Promise<boolean> {
    if (this.isDestroyed) return false;
    if (this.state === 'polling') return true;

    this.state = 'initializing';
    logTelemetryDebug('Initializing ELM327 adapter...');
    bluLog('[BLU_HANDSHAKE]', 'obd2_pid_poller_initializing', {
      deviceId: this.deviceId,
      vendor: 'obd2',
      phase: 'elm327_init',
      streamMode: 'ble_notifications_pid_poll',
    });

    try {
      let successfulInitResponses = 0;

      // Send initialization commands
      for (const cmd of ELM327_INIT_COMMANDS) {
        try {
          const response = await this.callbacks.sendCommand(cmd + '\r');
          logTelemetryDebug(`Init ${cmd}`, { responsePreview: response.substring(0, 40) });
          if (this.isPositiveAdapterResponse(response)) {
            successfulInitResponses += 1;
          }
          // Small delay between init commands
          await this.delay(150);
        } catch (err: any) {
          logTelemetryDebug(`Init command ${cmd} failed`, {
            error: err?.message ?? 'unknown',
          });
          // Continue — some commands may fail on certain adapters
        }
      }

      const adapterVerified = await this.verifyAdapterReady(successfulInitResponses);
      if (!adapterVerified) {
        throw new Error('Bluetooth transport connected, but the ELM327 adapter did not complete initialization.');
      }

      this.initialized = true;
      logTelemetryDebug('ELM327 initialized');
      bluLog('[BLU_HANDSHAKE]', 'obd2_elm327_initialized', {
        deviceId: this.deviceId,
        vendor: 'obd2',
        phase: 'elm327_init',
        successfulInitResponses,
      });

      // Read battery voltage first
      await this.readBatteryVoltage();

      // Discover supported PIDs
      await this.discoverPIDs();

      if (this.supportedPids.size === 0 && this.batteryVoltage == null) {
        throw new Error(NO_PID_DATA_MESSAGE);
      }

      // Start polling loop
      this.state = 'polling';
      logTelemetryDebug('Polling started', {
        intervalMs: this.intervalMs,
        supportedPidCount: this.supportedPids.size,
      });
      bluLog('[BLU_STREAM]', 'obd2_pid_polling_started', {
        deviceId: this.deviceId,
        vendor: 'obd2',
        phase: 'pid_polling',
        streamMode: 'ble_notifications_pid_poll',
        intervalMs: this.intervalMs,
        supportedPidCount: this.supportedPids.size,
      });
      this.setupAppStateListener();
      await this.executePollCycle();
      if (this.lastDataAt <= 0) {
        throw new Error(NO_PID_DATA_MESSAGE);
      }
      this.schedulePollCycle();

      return true;
    } catch (err: any) {
      const msg = err?.message ?? 'Initialization failed';
      bluLog(isBluTimeoutMessage(msg) ? '[BLU_TIMEOUT]' : '[BLU_OBD2]', 'obd2_pid_poller_initialization_failed', isBluTimeoutMessage(msg)
        ? buildBluTimeoutLogDetails({
            deviceId: this.deviceId,
            vendor: 'obd2',
            phase: 'pid_poller_initialization',
            timeoutMs: 5_000,
            lastSuccessfulPhase: this.initialized ? 'elm327_init' : null,
            lastPacketAt: this.lastDataAt || null,
            errorCode: 'PID_POLLER_INIT_FAILED',
            message: msg,
          })
        : {
            deviceId: this.deviceId,
            vendor: 'obd2',
            phase: 'pid_poller_initialization',
            errorCode: 'PID_POLLER_INIT_FAILED',
            message: msg,
          });
      logTelemetryWarn('Init failed', { error: msg });
      this.lastError = msg;
      this.state = 'error';
      this.callbacks.onError(msg);
      return false;
    }
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.state = 'stopped';
    this.inCycle = false;
    this.removeAppStateListener();
    bluLog('[BLU_DISCONNECT]', 'obd2_pid_polling_stopped', {
      deviceId: this.deviceId,
      vendor: 'obd2',
      streamMode: 'ble_notifications_pid_poll',
      cycleCount: this.cycleCount,
    });
    logTelemetryDebug('Polling stopped', { cycleCount: this.cycleCount });
  }

  /**
   * Pause polling (e.g., when app is backgrounded).
   */
  pause(): void {
    if (this.state !== 'polling') return;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.state = 'paused';
    bluLog('[BLU_STREAM]', 'obd2_pid_polling_paused', {
      deviceId: this.deviceId,
      vendor: 'obd2',
      streamMode: 'ble_notifications_pid_poll',
    });
    logTelemetryDebug('Polling paused');
  }

  /**
   * Resume polling after pause.
   */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'polling';
    bluLog('[BLU_RECONNECT]', 'obd2_pid_polling_resumed', {
      deviceId: this.deviceId,
      vendor: 'obd2',
      streamMode: 'ble_notifications_pid_poll',
    });
    logTelemetryDebug('Polling resumed');
    this.schedulePollCycle();
  }

  /**
   * Destroy the poller and release all resources.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stop();
    this.supportedPids.clear();
    this.unsupportedPids.clear();
    this.currentReading = {};
    this.currentObd2Values = [];
  }

  // ═══════════════════════════════════════════════════════
  // PID DISCOVERY
  // ═══════════════════════════════════════════════════════

  /**
   * Discover which PIDs are supported by the connected vehicle.
   * Sends each essential PID once and checks for valid response.
   */
  private async discoverPIDs(): Promise<void> {
    logTelemetryDebug('Discovering supported PIDs...');

    for (const pidDef of OBD2_PIDS) {
      if (this.isDestroyed) return;

      try {
        const response = await this.callbacks.sendCommand(pidDef.command + '\r');
        const bytes = parseELM327Response(response);

        if (bytes && bytes.length >= pidDef.bytes) {
          this.supportedPids.add(pidDef.pid);
          logTelemetryDebug(`PID ${pidDef.pid} supported`, { pidName: pidDef.name });
        } else {
          this.unsupportedPids.add(pidDef.pid);
          logTelemetryDebug(`PID ${pidDef.pid} unsupported`, { pidName: pidDef.name });
        }
      } catch {
        this.unsupportedPids.add(pidDef.pid);
        logTelemetryDebug(`PID ${pidDef.pid} errored during discovery`, { pidName: pidDef.name });
      }

      await this.delay(100);
    }

    logTelemetryDebug('PID discovery complete', {
      supportedPidCount: this.supportedPids.size,
      unsupportedPidCount: this.unsupportedPids.size,
    });
    bluLog('[BLU_HANDSHAKE]', 'obd2_pid_capabilities_discovered', {
      deviceId: this.deviceId,
      vendor: 'obd2',
      phase: 'pid_capability_discovery',
      supportedPidCount: this.supportedPids.size,
      unsupportedPidCount: this.unsupportedPids.size,
      supportedPids: Array.from(this.supportedPids),
      unsupportedPids: Array.from(this.unsupportedPids),
    });

    // Notify callbacks about discovered capabilities
    this.callbacks.onCapabilitiesDiscovered(
      Array.from(this.supportedPids),
      Array.from(this.unsupportedPids),
    );
  }

  // ═══════════════════════════════════════════════════════
  // POLLING LOOP
  // ═══════════════════════════════════════════════════════

  private schedulePollCycle(): void {
    if (this.isDestroyed || this.state !== 'polling') return;

    this.pollTimer = setTimeout(async () => {
      if (this.isDestroyed || this.state !== 'polling') return;
      await this.executePollCycle();
      this.schedulePollCycle();
    }, this.intervalMs);
  }

  /**
   * Execute one full poll cycle — request all supported PIDs.
   */
  private async executePollCycle(): Promise<void> {
    if (this.inCycle || this.isDestroyed) return;
    this.inCycle = true;

    try {
      this.currentReading = {};
      this.currentObd2Values = [];
      let anyData = false;
      const timestamp = Date.now();

      // Poll each supported PID
      for (const pidDef of OBD2_PIDS) {
        if (this.isDestroyed || this.state !== 'polling') break;
        if (!this.supportedPids.has(pidDef.pid)) continue;

        try {
          const response = await this.callbacks.sendCommand(pidDef.command + '\r');
          const bytes = parseELM327Response(response);

          if (bytes && bytes.length >= pidDef.bytes) {
            const value = pidDef.parse(bytes);
            (this.currentReading as any)[pidDef.telemetryField] = value;
            this.currentObd2Values.push({
              pid: pidDef.pid,
              label: pidDef.name,
              value,
              unit: pidDef.unit,
              timestamp,
              sourceDeviceId: this.deviceId,
              quality: 'live',
            });
            anyData = true;
          }
        } catch (err: any) {
          // Individual PID failure — skip and continue
          logTelemetryDebug(`PID ${pidDef.pid} poll failed`, {
            error: err?.message ?? 'unknown',
          });
        }

        // Small delay between PID requests to avoid overwhelming the adapter
        await this.delay(50);
      }

      // Read battery voltage every 5th cycle (less frequent — uses AT command)
      if (this.cycleCount % 5 === 0) {
        await this.readBatteryVoltage();
      }

      // Include battery voltage in reading
      if (this.batteryVoltage != null) {
        this.currentReading.battery_voltage = this.batteryVoltage;
        this.currentObd2Values.push({
          pid: 'ATRV',
          label: 'Adapter Voltage',
          value: this.batteryVoltage,
          unit: 'V',
          timestamp,
          sourceDeviceId: this.deviceId,
          quality: 'live',
        });
      }

      // Emit normalized telemetry if we got any data
      if (anyData || this.batteryVoltage != null) {
        const telemetry: NormalizedVehicleTelemetry = {
          timestamp: Date.now(),
          provider: 'obd2',
          device_id: this.deviceId,
          source: 'bluetooth_obd_live',
          obd2_values: this.currentObd2Values,
          ...this.currentReading,
        };

        this.lastDataAt = Date.now();
        bluLogThrottled('[BLU_TELEMETRY]', `pid-poller:${this.deviceId}`, 'obd2_pid_poll_telemetry', buildBluTelemetryLogDetails({
          deviceId: this.deviceId,
          vendor: 'obd2',
          telemetry,
          streamMode: 'ble_notifications_pid_poll',
          lastPacketAt: this.lastDataAt,
        }), 5_000);
        this.callbacks.onTelemetry(telemetry);
      }

      this.cycleCount++;

      // Periodic logging (every 20 cycles)
      if (this.cycleCount % 20 === 0) {
        logTelemetryDebug('Poll cycle complete', {
          cycleCount: this.cycleCount,
          supportedPidCount: this.supportedPids.size,
        });
      }
    } catch (err: any) {
      const message = err?.message ?? 'Poll cycle failed';
      bluLog(isBluTimeoutMessage(message) ? '[BLU_TIMEOUT]' : '[BLU_OBD2]', 'obd2_pid_poll_cycle_error', isBluTimeoutMessage(message)
        ? buildBluTimeoutLogDetails({
            deviceId: this.deviceId,
            vendor: 'obd2',
            phase: 'pid_poll_cycle',
            timeoutMs: 5_000,
            lastSuccessfulPhase: this.lastDataAt > 0 ? 'telemetry_packet' : 'pid_polling_started',
            lastPacketAt: this.lastDataAt || null,
            errorCode: 'PID_POLL_CYCLE_ERROR',
            message,
          })
        : {
            deviceId: this.deviceId,
            vendor: 'obd2',
            phase: 'pid_poll_cycle',
            errorCode: 'PID_POLL_CYCLE_ERROR',
            message,
          });
      logTelemetryWarn(`Poll cycle ${this.cycleCount} error`, {
        error: message,
      });
      this.lastError = message;
    } finally {
      this.inCycle = false;
    }
  }

  // ═══════════════════════════════════════════════════════
  // BATTERY VOLTAGE (ATRV)
  // ═══════════════════════════════════════════════════════

  /**
   * Read battery voltage using the ELM327 ATRV command.
   * This reads the OBD port voltage (vehicle 12V system).
   */
  private async readBatteryVoltage(): Promise<void> {
    try {
      const response = await this.callbacks.sendCommand('ATRV\r');
      const voltage = parseBatteryVoltageResponse(response);
      if (voltage != null) {
        this.batteryVoltage = voltage;
      }
    } catch {
      // ATRV may not be supported on all adapters
    }
  }

  private async verifyAdapterReady(successfulInitResponses: number): Promise<boolean> {
    if (successfulInitResponses >= 2) return true;

    for (const command of ELM327_VERIFY_COMMANDS) {
      try {
        const response = await this.callbacks.sendCommand(command + '\r');
        if (this.isPositiveAdapterResponse(response)) {
          return true;
        }
      } catch (err: any) {
        logTelemetryDebug(`Verify command ${command} failed`, {
          error: err?.message ?? 'unknown',
        });
      }
      await this.delay(100);
    }

    return false;
  }

  private isPositiveAdapterResponse(raw: string | null | undefined): boolean {
    const cleaned = String(raw ?? '')
      .replace(/[\r\n>]/g, '')
      .trim()
      .toUpperCase();

    if (!cleaned) return false;
    if (
      cleaned.includes('NO DATA') ||
      cleaned.includes('ERROR') ||
      cleaned.includes('UNABLE') ||
      cleaned.includes('BUS ERROR') ||
      cleaned.includes('CAN ERROR') ||
      cleaned === '?'
    ) {
      return false;
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════
  // APP STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════

  private setupAppStateListener(): void {
    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (this.isDestroyed) return;

          if (nextState === 'background' || nextState === 'inactive') {
            if (this.state === 'polling') {
              logTelemetryDebug('App backgrounded — pausing polling');
              this.pause();
            }
          } else if (nextState === 'active') {
            if (this.state === 'paused') {
              logTelemetryDebug('App foregrounded — resuming polling');
              this.resume();
            }
          }
        },
      );
    } catch {
      // AppState may not be available in all environments
    }
  }

  private removeAppStateListener(): void {
    if (this.appStateSubscription) {
      try { this.appStateSubscription.remove(); } catch {}
      this.appStateSubscription = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

