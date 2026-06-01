/**
 * BleConnector — generic BLE transport connector for ECS power telemetry.
 *
 * Implements IPowerConnector with BLE scan, connect, disconnect, and a
 * heartbeat-based telemetry stream. No vendor-specific parsing — that is
 * handled by IPowerDriver instances wired through PowerTelemetryManager.
 *
 * Phase 2B — no vendor UUIDs, no characteristic subscriptions yet.
 *
 * IMPORTANT: This module lazily initialises the BleManager from
 * react-native-ble-plx so the import is safe on web (where BLE is
 * unavailable). Calling any method on web will throw or no-op gracefully.
 */

import { Platform } from "react-native";

import type {
  IPowerConnector,
  DiscoveredPowerDevice,
} from "./IPowerConnector";
import type {
  PowerTelemetry,
  PowerConnectionState,
  PowerCapabilities,
} from "../types/PowerTelemetry";
import { normalizePowerTelemetryTruth } from "../types/PowerTelemetry";
import type {
  BleInternalState,
  BleDiscoveredDevice,
  BleScanOptions,
} from "../ble/BleTypes";
import {
  DEFAULT_SCAN_OPTIONS,
  DEFAULT_HEARTBEAT_CONFIG,
} from "../ble/BleTypes";
import {
  getBleRuntimeUnsupportedMessage,
  isBleNativeModuleUnavailableError,
} from "../ble/BleScanReadiness";
import { createBackoff } from "../ble/backoff";
import type { Backoff } from "../ble/backoff";
import { ecsLog } from "../../../lib/ecsLogger";

// ── Lazy BLE manager ────────────────────────────────────────────────────

/**
 * We lazily require react-native-ble-plx so the module can be safely
 * imported on web without crashing at parse time.
 */
let _bleManagerInstance: any | null = null;

function getBleManager(): any {
  if (_bleManagerInstance) return _bleManagerInstance;

  if (Platform.OS === "web") {
    throw new Error("[BleConnector] BLE is not supported on web.");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require("react-native-ble-plx");
    _bleManagerInstance = new BleManager();
    return _bleManagerInstance;
  } catch (err) {
    if (isBleNativeModuleUnavailableError(err)) {
      throw new Error(getBleRuntimeUnsupportedMessage());
    }
    throw new Error(
      `[BleConnector] Failed to initialize Bluetooth manager: ${String((err as any)?.message ?? err ?? "unknown error")}`,
    );
  }
}

// ── Constants ───────────────────────────────────────────────────────────

const TAG = "[BleConnector]";

function logPowerDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug("POWER", `${TAG} ${message}`, details);
}

function logPowerWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn("POWER", `${TAG} ${message}`, details);
}

const ALL_FALSE_CAPABILITIES: PowerCapabilities = {
  hasSOC: false,
  hasWattsIn: false,
  hasWattsOut: false,
  hasSolar: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

// ── Subscriber type ─────────────────────────────────────────────────────
type TelemetryCallback = (data: PowerTelemetry) => void;

// ── BleConnector class ──────────────────────────────────────────────────

export class BleConnector implements IPowerConnector {
  // ── Internal state ──────────────────────────────────────────────────
  private state: BleInternalState = "idle";
  private discovered: Map<string, BleDiscoveredDevice> = new Map();
  private connectedDeviceId: string | null = null;
  private connectedDeviceRef: any | null = null; // BLE Device reference
  private disconnectSubscription: { remove?: () => void } | null = null;
  private currentTelemetry: PowerTelemetry | null = null;
  private subscribers: Set<TelemetryCallback> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff: Backoff = createBackoff();
  private lastRssi: number | undefined;
  private packetSeq: number = 0;

  // ── IPowerConnector: getConnectionState ─────────────────────────────

  getConnectionState(): PowerConnectionState {
    switch (this.state) {
      case "idle":
      case "scanning":
        return "idle";
      case "connecting":
        return "connecting";
      case "disconnecting":
        return "disconnecting";
      case "connected":
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

  // ── IPowerConnector: startScan ──────────────────────────────────────

  async startScan(options?: Partial<BleScanOptions>): Promise<void> {
    const mgr = getBleManager();
    const opts: Required<BleScanOptions> = {
      ...DEFAULT_SCAN_OPTIONS,
      ...options,
    };

    // Clear previous results
    this.discovered.clear();
    this.setState("scanning");

    const serviceFilter =
      opts.serviceUUIDs.length > 0 ? opts.serviceUUIDs : null;

    mgr.startDeviceScan(
      serviceFilter,
      { allowDuplicates: opts.allowDuplicates },
      (error: any, device: any) => {
        if (error) {
          logPowerWarn("Scan error", {
            error: error?.message ?? String(error),
          });
          // Don't transition to error for transient scan issues
          return;
        }

        if (!device?.id) return;

        const entry: BleDiscoveredDevice = {
          id: device.id,
          name: device.name ?? device.localName ?? undefined,
          rssi: device.rssi ?? undefined,
          vendorHint: inferVendorHint(device),
          connectionHint: "ble",
          lastSeenAt: Date.now(),
          serviceUUIDs: device.serviceUUIDs ?? undefined,
          manufacturerData: device.manufacturerData ?? null,
        };

        this.discovered.set(device.id, entry);
      },
    );

    // Auto-stop scan after timeout
    if (opts.timeoutMs > 0) {
      this.scanTimeoutTimer = setTimeout(() => {
        this.stopScan().catch(() => {});
      }, opts.timeoutMs);
    }
  }

  // ── IPowerConnector: stopScan ───────────────────────────────────────

  async stopScan(): Promise<void> {
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer);
      this.scanTimeoutTimer = null;
    }

    try {
      const mgr = getBleManager();
      mgr.stopDeviceScan();
    } catch {
      // Ignore — manager may not be initialised if scan was never started
    }

    if (this.state === "scanning") {
      this.setState("idle");
    }
  }

  // ── IPowerConnector: getDiscoveredDevices ───────────────────────────

  async getDiscoveredDevices(): Promise<DiscoveredPowerDevice[]> {
    const devices: DiscoveredPowerDevice[] = [];
    for (const entry of this.discovered.values()) {
      devices.push({
        id: entry.id,
        name: entry.name,
        rssi: entry.rssi,
        vendor: entry.vendorHint,
        raw: {
          connectionHint: entry.connectionHint,
          lastSeenAt: entry.lastSeenAt,
          serviceUUIDs: entry.serviceUUIDs,
          manufacturerData: entry.manufacturerData,
        },
      });
    }
    return devices;
  }

  // ── IPowerConnector: connect ────────────────────────────────────────

  async connect(deviceId: string): Promise<void> {
    // Stop any active scan first
    await this.stopScan();

    const mgr = getBleManager();
    this.setState("connecting");

    try {
      // Connect to the device
      const device = await mgr.connectToDevice(deviceId, {
        requestMTU: 512,
        timeout: 15_000,
      });

      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      // Store references
      this.connectedDeviceId = deviceId;
      this.connectedDeviceRef = device;
      this.lastRssi = undefined;
      this.packetSeq = 0;
      this.backoff.reset();

      this.setState("connected");

      // Read initial RSSI if possible
      this.readRssi();

      // Start heartbeat telemetry emission
      this.startHeartbeat();

      // Monitor disconnection
      this.monitorDisconnection(device);
    } catch (err: any) {
      logPowerWarn("Connect failed", {
        error: err?.message ?? String(err),
        deviceId,
      });
      this.setState("error");
      throw new Error(`[BleConnector] Connection failed: ${err?.message}`);
    }
  }

  // ── IPowerConnector: disconnect ─────────────────────────────────────

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.removeDisconnectionMonitor();
    this.setState("disconnecting");

    if (this.connectedDeviceRef) {
      try {
        const mgr = getBleManager();
        await mgr.cancelDeviceConnection(this.connectedDeviceId!);
        const stillConnected = await mgr.isDeviceConnected?.(this.connectedDeviceId!).catch(() => false);
        if (stillConnected) {
          throw new Error("[BleConnector] Device remained connected after disconnect request.");
        }
      } catch (error) {
        this.setState("error");
        throw error;
      }
    }

    this.connectedDeviceId = null;
    this.connectedDeviceRef = null;
    this.currentTelemetry = null;
    this.lastRssi = undefined;
    this.packetSeq = 0;

    this.setState("idle");
  }

  // ── Public helpers ──────────────────────────────────────────────────

  /** Return the raw internal BLE state (more granular than IPowerConnector). */
  getInternalState(): BleInternalState {
    return this.state;
  }

  /** Return the number of devices discovered in the current/last scan. */
  getDiscoveredCount(): number {
    return this.discovered.size;
  }

  /** Check if the connector is currently connected to a device. */
  isConnected(): boolean {
    return this.state === "connected" && this.connectedDeviceId !== null;
  }

  /** Return the ID of the currently connected device, or null. */
  getConnectedDeviceId(): string | null {
    return this.connectedDeviceId;
  }

  /**
   * Destroy the connector and release all resources.
   * Call this when the connector is no longer needed.
   */
  destroy(): void {
    this.stopHeartbeat();
    this.stopScan().catch(() => {});
    this.removeDisconnectionMonitor();

    if (this.connectedDeviceRef) {
      try {
        const mgr = getBleManager();
        mgr.cancelDeviceConnection(this.connectedDeviceId!).catch(() => {});
      } catch {
        // Ignore
      }
    }

    this.subscribers.clear();
    this.discovered.clear();
    this.connectedDeviceId = null;
    this.connectedDeviceRef = null;
    this.currentTelemetry = null;
    this.setState("idle");
  }

  // ── Private: state management ───────────────────────────────────────

  private setState(next: BleInternalState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    // Log state transitions for debugging
    logPowerDebug(`State: ${prev} -> ${next}`);
  }

  // ── Private: heartbeat telemetry ────────────────────────────────────

  /**
   * Start emitting heartbeat telemetry at a fixed interval.
   * This proves the connection is alive and provides quality metrics
   * until vendor-specific characteristic subscriptions are wired.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Emit immediately
    this.emitHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.emitHeartbeat();
    }, DEFAULT_HEARTBEAT_CONFIG.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private emitHeartbeat(): void {
    if (this.state !== "connected" || !this.connectedDeviceId) return;

    this.packetSeq++;

    // Periodically refresh RSSI
    if (this.packetSeq % 5 === 0) {
      this.readRssi();
    }

    const now = Date.now();
    const telemetry: PowerTelemetry = {
      timestamp: now,
      source: "ble",
      sourceLabel: "Detected — setup required",
      isLive: false,
      device: {
        id: this.connectedDeviceId,
        vendor: "unknown",
      },
      truth: normalizePowerTelemetryTruth({
        timestamp: now,
        source: "unavailable",
        device: {
          id: this.connectedDeviceId,
          vendor: "unknown",
        },
        truth: {
          sourceTruth: "device_detected",
          deviceId: this.connectedDeviceId,
          confidence: 0.35,
          isLive: false,
          isStale: false,
          isManual: false,
          isSimulated: false,
          reason: "BLE device connected; vendor telemetry decoder not active.",
        },
      }),
      capabilities: { ...ALL_FALSE_CAPABILITIES },
      quality: {
        rssi: this.lastRssi,
        seq: this.packetSeq,
        lastPacketAt: now,
        connection: "connected",
      },
    };

    this.currentTelemetry = telemetry;
    this.notifySubscribers(telemetry);
  }

  // ── Private: RSSI reading ───────────────────────────────────────────

  private async readRssi(): Promise<void> {
    if (!this.connectedDeviceRef) return;
    try {
      const device = await this.connectedDeviceRef.readRSSI();
      if (device?.rssi != null) {
        this.lastRssi = device.rssi;
      }
    } catch {
      // RSSI read failure is non-fatal
    }
  }

  // ── Private: disconnection monitoring ───────────────────────────────

  private monitorDisconnection(device: any): void {
    const mgr = getBleManager();
    this.removeDisconnectionMonitor();
    this.disconnectSubscription = mgr.onDeviceDisconnected(
      device.id,
      (error: any, _disconnectedDevice: any) => {
        this.disconnectSubscription = null;
        if (this.connectedDeviceId === device.id) {
          logPowerWarn("Device disconnected", {
            error: error?.message ?? "clean disconnect",
            deviceId: device.id,
          });
          this.stopHeartbeat();
          this.connectedDeviceRef = null;
          this.connectedDeviceId = null;
          this.currentTelemetry = null;
          this.setState("idle");
        }
      },
    );
  }

  private removeDisconnectionMonitor(): void {
    if (!this.disconnectSubscription) return;
    try {
      this.disconnectSubscription.remove?.();
    } catch {}
    this.disconnectSubscription = null;
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

// ── Vendor hint heuristics ──────────────────────────────────────────────

/**
 * Attempt to infer a vendor hint from BLE advertisement data.
 * This is a best-effort heuristic based on device name patterns.
 * Proper vendor identification is handled by IPowerDriver.supports().
 */
function inferVendorHint(device: any): string | undefined {
  const name: string = (
    device.name ??
    device.localName ??
    ""
  ).toLowerCase();

  if (!name) return undefined;

  // Common power-station vendor name patterns
  const patterns: [RegExp, string][] = [
    [/ecoflow|delta|river/i, "ecoflow"],
    [/bluetti|ac\d{2,3}|eb\d{2}/i, "bluetti"],
    [/jackery/i, "jackery"],
    [/goal\s*zero|yeti/i, "goalzero"],
    [/anker|solix/i, "anker"],
    [/renogy/i, "renogy"],
    [/victron|smart\s*shunt|bmv/i, "victron"],
    [/redarc|bcdc/i, "redarc"],
    [/dakota\s*lithium/i, "dakota"],
    [/battle\s*born/i, "battleborn"],
  ];

  for (const [regex, vendor] of patterns) {
    if (regex.test(name)) return vendor;
  }

  return undefined;
}

