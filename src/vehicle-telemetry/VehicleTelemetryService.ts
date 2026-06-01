/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY SERVICE — Live Connection Pass
 * ═══════════════════════════════════════════════════════════
 *
 * Purpose:
 *   - Owns adapter/session lifecycle for the active telemetry device
 *   - Normalizes raw readings into NormalizedVehicleTelemetry
 *   - Emits lifecycle + telemetry events for the store/UI
 *   - Bridges registry state with reconnect/backoff behavior
 *
 * Designed to work with:
 *   - VehicleTelemetryStore.attachToService(service)
 *   - vehicleTelemetryDeviceRegistry
 *   - Existing adapter/provider stack where possible
 *
 * Notes:
 *   - This file is intentionally defensive and shape-tolerant.
 *   - It supports adapters exposing subscribe/on/addListener patterns.
 *   - It avoids hard-coding one provider implementation.
 */

import type {
  NormalizedVehicleTelemetry,
  VehicleTelemetryCapabilities,
  VehicleTelemetryConnectionState,
  VehicleTelemetryProviderId,
} from './VehicleTelemetryTypes';
import { EMPTY_TELEMETRY } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryStore } from './VehicleTelemetryStore';

// ── Phase 15: Stability Guards ──────────────────────────────
import {
  calculateBackoff,
  MAX_TELEMETRY_RETRIES,
  RETRY_COOLDOWN_MS,
  stabilityLog,
} from '../../lib/ecsStabilityGuards';

const TAG = '[VT-Service]';
const HEARTBEAT_STALE_MS = 30_000;

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

type VTEventName =
  | 'telemetry'
  | 'data'
  | 'connected'
  | 'connect'
  | 'disconnected'
  | 'disconnect'
  | 'reconnecting'
  | 'reconnect_start'
  | 'reconnected'
  | 'reconnect_success'
  | 'reconnect_failed'
  | 'state'
  | 'error';

type VTListener = (payload?: any) => void;

type Unsubscribe = () => void;

type AdapterLike = {
  connect?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
  subscribe?: (event: string, cb: (...args: any[]) => void) => Unsubscribe | void;
  on?: (event: string, cb: (...args: any[]) => void) => Unsubscribe | void;
  addListener?: (event: string, cb: (...args: any[]) => void) => { remove?: () => void } | Unsubscribe | void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  off?: (event: string, cb: (...args: any[]) => void) => void;
  getLatestReading?: () => any;
  isConnected?: () => boolean;
  [key: string]: any;
};

type DeviceLike = {
  device_id: string;
  device_name?: string | null;
  provider?: string | null;
  connection_state?: string | null;
  [key: string]: any;
};



type VehicleTelemetryPollerStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastPollAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
};
function toNumber(v: any): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTireValues(...values: any[]): [number | null, number | null, number | null, number | null] | undefined {
  const source = values.find((value) => Array.isArray(value));
  if (!Array.isArray(source)) return undefined;
  const next = [0, 1, 2, 3].map((index) => {
    const numeric = toNumber(source[index]);
    return numeric != null && numeric >= 0 ? numeric : null;
  }) as [number | null, number | null, number | null, number | null];
  return next.some((entry) => entry != null) ? next : undefined;
}

function normalizeTelemetry(raw: any, device?: DeviceLike | null): NormalizedVehicleTelemetry {
  const timestamp = toNumber(raw?.timestamp) ?? Date.now();

  return {
    ...EMPTY_TELEMETRY,
    ...raw,
    timestamp,
    device_id:
      raw?.device_id ||
      raw?.deviceId ||
      device?.device_id ||
      'unknown-device',
    vehicle_speed:
      toNumber(raw?.vehicle_speed) ??
      toNumber(raw?.vehicleSpeed) ??
      toNumber(raw?.speed_mph) ??
      toNumber(raw?.speed) ??
      null,
    engine_rpm:
      toNumber(raw?.engine_rpm) ??
      toNumber(raw?.engineRpm) ??
      toNumber(raw?.rpm) ??
      null,
    battery_voltage:
      toNumber(raw?.battery_voltage) ??
      toNumber(raw?.batteryVoltage) ??
      toNumber(raw?.voltage) ??
      null,
    fuel_level:
      toNumber(raw?.fuel_level) ??
      toNumber(raw?.fuelLevel) ??
      null,
    coolant_temp:
      toNumber(raw?.coolant_temp) ??
      toNumber(raw?.coolantTemp) ??
      toNumber(raw?.engine_temp) ??
      null,
    engine_load:
      toNumber(raw?.engine_load) ??
      toNumber(raw?.engineLoad) ??
      null,
    tire_pressures: normalizeTireValues(
      raw?.tire_pressures,
      raw?.tirePressures,
      raw?.tirePressurePsi,
      raw?.tpms?.pressures,
      raw?.metrics?.tirePressures,
    ),
    tire_temps: normalizeTireValues(
      raw?.tire_temps,
      raw?.tireTemps,
      raw?.tireTempF,
      raw?.tpms?.temps,
      raw?.metrics?.tireTemps,
    ),
  } as NormalizedVehicleTelemetry;
}

class VehicleTelemetryService {
  private listeners = new Map<VTEventName, Set<VTListener>>();
  private adapter: AdapterLike | null = null;
  private adapterUnsubs: Unsubscribe[] = [];
  private currentDevice: DeviceLike | null = null;
  private latestTelemetry: NormalizedVehicleTelemetry = { ...EMPTY_TELEMETRY };
  private connectionState: ConnectionState = 'idle';
  private activeProvider: VehicleTelemetryProviderId | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRetryAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastTelemetryAt = 0;
  private started = false;
  private manualDisconnectRequested = false;

  private pollerEnabled = false;
  private pollerRunning = false;
  private pollIntervalMs = 15_000;
  private lastPollAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastErrorMessage: string | null = null;

  // ── Event Emitter ───────────────────────────────────────

  on(event: string, cb: VTListener): Unsubscribe {
    const typedEvent = event as VTEventName;
    if (!this.listeners.has(typedEvent)) this.listeners.set(typedEvent, new Set());
    this.listeners.get(typedEvent)!.add(cb);
    return () => {
      this.listeners.get(typedEvent)?.delete(cb);
    };
  }

  subscribe(event: string, cb: VTListener): Unsubscribe {
    return this.on(event, cb);
  }

  addListener(event: string, cb: VTListener): { remove: () => void } {
    const unsub = this.on(event, cb);
    return { remove: unsub };
  }

  private emit(event: VTEventName, payload?: any): void {
    const set = this.listeners.get(event);
    if (!set?.size) return;
    set.forEach(fn => {
      try {
        fn(payload);
      } catch (error) {
        stabilityLog('Telemetry', 'error', `${TAG} listener failure on ${event}`, error);
      }
    });
  }

  // ── Public Read API ────────────────────────────────────

  getState(): ConnectionState {
    return this.connectionState;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getLatestTelemetry(): NormalizedVehicleTelemetry {
    return { ...this.latestTelemetry };
  }

  getCurrentDevice(): DeviceLike | null {
    return this.currentDevice ? { ...this.currentDevice } : null;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getSnapshot() {
    return this.getServiceStateSnapshot();
  }

  getPollerStatus(): VehicleTelemetryPollerStatus {
    return {
      enabled: this.pollerEnabled,
      running: this.pollerRunning,
      intervalMs: this.pollIntervalMs,
      lastPollAt: this.lastPollAt,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorMessage: this.lastErrorMessage,
    };
  }

  changePrimaryDevice(deviceId: string): boolean {
    const device = vehicleTelemetryDeviceRegistry.getById(deviceId);
    if (!device) return false;

    const changed = vehicleTelemetryDeviceRegistry.setPrimary(deviceId);
    this.setPrimaryDevice(device);
    return changed;
  }

  stopPolling(): void {
    if (!this.pollerEnabled && !this.pollerRunning) return;
    this.pollerEnabled = false;
    this.pollerRunning = false;
    this.emit('state', this.getServiceStateSnapshot());
  }

  setActiveProvider(provider: VehicleTelemetryProviderId | null): void {
    if (this.activeProvider === provider) return;
    this.activeProvider = provider;
    this.emit('state', this.getServiceStateSnapshot());
  }

  clearActiveProvider(): void {
    this.setActiveProvider(null);
  }

  registerDevice(
    provider: VehicleTelemetryProviderId,
    deviceId: string,
    deviceName: string,
    capabilities: VehicleTelemetryCapabilities,
    extras?: { firmware_version?: string; protocol?: string },
  ) {
    const device = vehicleTelemetryDeviceRegistry.registerDevice({
      provider,
      device_id: deviceId,
      device_name: deviceName,
      connection_state: 'connecting',
      last_seen: null,
      capabilities,
      firmware_version: extras?.firmware_version,
      protocol: extras?.protocol,
    });

    this.activeProvider = provider;
    if (device.is_primary || this.currentDevice?.device_id === deviceId) {
      this.setPrimaryDevice(device);
    } else {
      this.emit('state', this.getServiceStateSnapshot());
    }

    return device;
  }

  updateDeviceConnectionState(
    deviceId: string,
    state: VehicleTelemetryConnectionState,
  ): void {
    const existing = vehicleTelemetryDeviceRegistry.getById(deviceId);
    if (!existing) return;

    const updated = vehicleTelemetryDeviceRegistry.registerDevice({
      provider: existing.provider,
      device_id: existing.device_id,
      device_name: existing.device_name,
      connection_state: state,
      last_seen: state === 'connected' ? new Date().toISOString() : existing.last_seen,
      capabilities: existing.capabilities,
      firmware_version: existing.firmware_version,
      protocol: existing.protocol,
    });

    if (updated.is_primary || this.currentDevice?.device_id === deviceId) {
      this.setPrimaryDevice(updated);
    } else {
      this.emit('state', this.getServiceStateSnapshot());
    }
  }

  removeDevice(deviceId: string): void {
    vehicleTelemetryDeviceRegistry.removeDevice(deviceId);
    if (this.currentDevice?.device_id === deviceId) {
      this.setPrimaryDevice(vehicleTelemetryDeviceRegistry.getPrimary());
    } else {
      this.emit('state', this.getServiceStateSnapshot());
    }
  }

  signalReconnecting(reconnecting: boolean): void {
    vehicleTelemetryStore.setReconnecting(reconnecting);
    if (reconnecting) {
      this.setConnectionState('reconnecting');
      return;
    }
    if (this.connectionState === 'reconnecting') {
      this.setConnectionState(this.currentDevice ? 'connected' : 'disconnected');
    }
  }

  signalReconnected(deviceId?: string): void {
    vehicleTelemetryStore.setReconnecting(false);
    if (deviceId) {
      this.updateDeviceConnectionState(deviceId, 'connected');
    }
    this.setConnectionState('connected');
  }

  signalReconnectFailed(deviceId?: string): void {
    vehicleTelemetryStore.setReconnecting(false);
    if (deviceId) {
      this.updateDeviceConnectionState(deviceId, 'error');
    }
    this.setConnectionState('error');
  }

  // ── Lifecycle ──────────────────────────────────────────

  async start(adapter?: AdapterLike | null): Promise<void> {
    if (adapter) {
      this.adapter = adapter;
    }

    if (!this.adapter) {
      throw new Error('VehicleTelemetryService.start requires an adapter');
    }

    this.started = true;
    this.pollerEnabled = true;
    this.pollerRunning = true;
    this.lastErrorAt = null;
    this.lastErrorMessage = null;
    this.bindAdapter(this.adapter);
    await this.connect();
    this.startHeartbeat();
  }

  async connect(): Promise<void> {
    if (!this.adapter) throw new Error('No adapter attached');

    this.setConnectionState(this.retryCount > 0 ? 'reconnecting' : 'connecting');
    if (this.retryCount > 0) {
      this.emit('reconnecting');
      this.emit('reconnect_start');
    }

    try {
      this.lastPollAt = Date.now();
      await this.adapter.connect?.();
      this.retryCount = 0;
      this.clearRetryTimer();
      this.lastSuccessAt = Date.now();
      this.lastErrorAt = null;
      this.lastErrorMessage = null;

      this.resolveCurrentDevice();
      this.markRegistryState('connected');
      this.setConnectionState('connected');
      this.emit('connected', { device: this.currentDevice });
      this.emit('connect', { device: this.currentDevice });

      if (this.latestTelemetry.timestamp > 0) {
        this.emit('reconnected', { device: this.currentDevice });
        this.emit('reconnect_success', { device: this.currentDevice });
      }

      const seed = this.adapter.getLatestReading?.();
      if (seed) {
        this.handleTelemetry(seed);
      }
    } catch (error) {
      this.handleReconnectFailure(error);
      throw error;
    }
  }

  async disconnect(options: { manualDisconnectRequested?: boolean } = {}): Promise<void> {
    const manualDisconnectRequested = options.manualDisconnectRequested === true;
    if (manualDisconnectRequested) {
      this.manualDisconnectRequested = true;
      this.started = false;
      this.pollerEnabled = false;
    }

    this.clearRetryTimer();
    this.stopHeartbeat();
    this.pollerRunning = false;
    vehicleTelemetryStore.setReconnecting(false);

    let disconnectError: unknown = null;
    try {
      await this.adapter?.disconnect?.();
    } catch (error) {
      disconnectError = error;
      stabilityLog('Telemetry', 'warn', `${TAG} adapter disconnect failed`, error);
    }

    this.unbindAdapter();
    const nextState = manualDisconnectRequested && disconnectError ? 'error' : 'disconnected';
    this.markRegistryState(nextState);
    this.setConnectionState(nextState);
    this.emit('disconnected', {
      device: this.currentDevice,
      requested: manualDisconnectRequested,
      manualDisconnectRequested,
      reason: manualDisconnectRequested ? 'user_disconnect' : 'disconnect',
    });
    this.emit('disconnect', {
      device: this.currentDevice,
      requested: manualDisconnectRequested,
      manualDisconnectRequested,
      reason: manualDisconnectRequested ? 'user_disconnect' : 'disconnect',
    });

    if (manualDisconnectRequested) {
      this.manualDisconnectRequested = false;
    }
    if (manualDisconnectRequested && disconnectError) {
      this.emit('error', disconnectError);
      throw disconnectError;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    await this.disconnect();

    try {
      await this.adapter?.destroy?.();
    } catch (error) {
      stabilityLog('Telemetry', 'warn', `${TAG} adapter destroy failed`, error);
    }

    this.adapter = null;
    this.currentDevice = null;
    this.connectionState = 'idle';
    this.pollerEnabled = false;
    this.pollerRunning = false;
  }

  async reconnect(): Promise<void> {
    if (!this.started || !this.adapter) return;

    this.setConnectionState('reconnecting');
    this.emit('reconnecting', { device: this.currentDevice });
    this.emit('reconnect_start', { device: this.currentDevice });
    await this.connect();
  }

  // ── External Integration Helpers ───────────────────────

  attachAdapter(adapter: AdapterLike): void {
    if (this.adapter === adapter) return;
    this.unbindAdapter();
    this.adapter = adapter;
    this.started = true;
    this.pollerEnabled = true;
    this.pollerRunning = !!adapter.isConnected?.();
    this.bindAdapter(adapter);
    this.resolveCurrentDevice();
    this.emit('state', this.getServiceStateSnapshot());
  }

  setPrimaryDevice(device: DeviceLike | null): void {
    this.currentDevice = device;
    this.activeProvider = (device?.provider as VehicleTelemetryProviderId | null) ?? null;
    if (device) {
      try {
        const registryAny = vehicleTelemetryDeviceRegistry as any;
        if (typeof registryAny.setPrimary === 'function') {
          registryAny.setPrimary(device.device_id);
        }
      } catch {}
    }
    this.emit('state', this.getServiceStateSnapshot());
  }

  ingestRawTelemetry(raw: any): void {
    this.handleTelemetry(raw);
  }

  // ── Adapter Binding ────────────────────────────────────

  private bindAdapter(adapter: AdapterLike): void {
    this.unbindAdapter();

    const bindOne = (event: string, handler: (...args: any[]) => void) => {
      let unsub: Unsubscribe | null = null;

      if (typeof adapter.subscribe === 'function') {
        const maybe = adapter.subscribe(event, handler);
        if (typeof maybe === 'function') unsub = maybe;
      } else if (typeof adapter.on === 'function') {
        const maybe = adapter.on(event, handler);
        if (typeof maybe === 'function') unsub = maybe;
      } else if (typeof adapter.addListener === 'function') {
        const maybe = adapter.addListener(event, handler);
        if (typeof maybe === 'function') {
          unsub = maybe;
        } else if (maybe && typeof maybe.remove === 'function') {
          unsub = () => maybe.remove?.();
        }
      }

      if (!unsub) {
        unsub = () => {
          try { adapter.off?.(event, handler); } catch {}
          try { adapter.removeListener?.(event, handler); } catch {}
        };
      }

      this.adapterUnsubs.push(unsub);
    };

    bindOne('telemetry', this.handleTelemetry);
    bindOne('data', this.handleTelemetry);
    bindOne('connected', this.handleConnected);
    bindOne('connect', this.handleConnected);
    bindOne('disconnected', this.handleDisconnected);
    bindOne('disconnect', this.handleDisconnected);
    bindOne('reconnecting', this.handleReconnectStarted);
    bindOne('reconnect_start', this.handleReconnectStarted);
    bindOne('reconnected', this.handleReconnectSucceeded);
    bindOne('reconnect_success', this.handleReconnectSucceeded);
    bindOne('reconnect_failed', this.handleReconnectFailure);
    bindOne('error', this.handleAdapterError);
  }

  private unbindAdapter(): void {
    this.adapterUnsubs.forEach(fn => {
      try { fn(); } catch {}
    });
    this.adapterUnsubs = [];
  }

  // ── Adapter Event Handlers ─────────────────────────────

  private handleTelemetry = (raw: any): void => {
    this.lastPollAt = Date.now();
    const normalized = normalizeTelemetry(raw, this.currentDevice);
    this.latestTelemetry = normalized;
    this.lastTelemetryAt = normalized.timestamp || Date.now();
    this.lastSuccessAt = Date.now();
    this.lastErrorAt = null;
    this.lastErrorMessage = null;
    this.pollerRunning = true;

    if (this.connectionState !== 'connected') {
      this.setConnectionState('connected');
      this.markRegistryState('connected');
      if (this.retryCount > 0) {
        this.retryCount = 0;
        this.clearRetryTimer();
        this.emit('reconnected', { device: this.currentDevice });
        this.emit('reconnect_success', { device: this.currentDevice });
      }
    }

    if (normalized.device_id) {
      try {
        vehicleTelemetryDeviceRegistry.touchDevice(normalized.device_id);
      } catch {}
    }

    this.emit('telemetry', normalized);
    this.emit('data', normalized);
  };

  private handleConnected = (_payload?: any): void => {
    this.started = true;
    this.resolveCurrentDevice();
    this.markRegistryState('connected');
    this.pollerEnabled = true;
    this.setConnectionState('connected');
    this.retryCount = 0;
    this.clearRetryTimer();
    this.emit('connected', { device: this.currentDevice });
    this.emit('connect', { device: this.currentDevice });
  };

  private handleDisconnected = (payload?: any): void => {
    this.markRegistryState('disconnected');
    this.pollerRunning = false;
    this.setConnectionState('disconnected');
    this.emit('disconnected', { device: this.currentDevice });
    this.emit('disconnect', { device: this.currentDevice });

    const requested =
      this.manualDisconnectRequested ||
      payload?.manualDisconnectRequested === true ||
      payload?.requested === true ||
      payload?.reason === 'user_disconnect';
    if (requested) {
      this.started = false;
      this.pollerEnabled = false;
      this.clearRetryTimer();
      vehicleTelemetryStore.setReconnecting(false);
      return;
    }

    if (this.started) {
      this.scheduleReconnect();
    }
  };

  private handleReconnectStarted = (_payload?: any): void => {
    this.started = true;
    this.markRegistryState('reconnecting');
    this.pollerRunning = false;
    this.setConnectionState('reconnecting');
    this.emit('reconnecting', { device: this.currentDevice });
    this.emit('reconnect_start', { device: this.currentDevice });
  };

  private handleReconnectSucceeded = (_payload?: any): void => {
    this.resolveCurrentDevice();
    this.markRegistryState('connected');
    this.setConnectionState('connected');
    this.retryCount = 0;
    this.clearRetryTimer();
    this.emit('reconnected', { device: this.currentDevice });
    this.emit('reconnect_success', { device: this.currentDevice });
    this.emit('connected', { device: this.currentDevice });
  };

  private handleReconnectFailure = (error?: any): void => {
    this.lastErrorAt = Date.now();
    this.lastErrorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown telemetry poll error');
    this.pollerRunning = false;
    stabilityLog('Telemetry', 'warn', `${TAG} reconnect failed`, error);
    this.markRegistryState('disconnected');
    this.setConnectionState('error');
    this.emit('reconnect_failed', { error, device: this.currentDevice });
    this.emit('error', error);

    if (this.started && !this.manualDisconnectRequested) {
      this.scheduleReconnect();
    }
  };

  private handleAdapterError = (error?: any): void => {
    this.lastErrorAt = Date.now();
    this.lastErrorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown telemetry adapter error');
    this.pollerRunning = false;
    stabilityLog('Telemetry', 'warn', `${TAG} adapter error`, error);
    this.emit('error', error);
  };

  // ── Reconnect / Health ─────────────────────────────────

  private scheduleReconnect(): void {
    if (this.manualDisconnectRequested) return;
    if (!this.adapter) return;
    if (this.retryCount >= MAX_TELEMETRY_RETRIES) {
      stabilityLog('Telemetry', 'warn', `${TAG} max reconnect retries reached`);
      return;
    }

    const now = Date.now();
    if (now - this.lastRetryAt < RETRY_COOLDOWN_MS) {
      stabilityLog('Telemetry', 'info', `${TAG} retry cooldown active`);
      return;
    }

    this.setConnectionState('reconnecting');
    this.emit('reconnecting', { device: this.currentDevice });
    this.emit('reconnect_start', { device: this.currentDevice });

    const delay = calculateBackoff(this.retryCount);
    this.clearRetryTimer();
    this.retryTimer = setTimeout(async () => {
      if (!this.started || this.manualDisconnectRequested) return;
      this.lastRetryAt = Date.now();
      this.retryCount += 1;
      try {
        await this.connect();
      } catch {
        // connect() already routes failure through handleReconnectFailure
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.started) return;
      if (!this.adapter) return;

      const adapterSaysConnected = this.adapter.isConnected?.();
      const now = Date.now();
      const telemetryAge = this.lastTelemetryAt ? now - this.lastTelemetryAt : Infinity;

      if (adapterSaysConnected === false) {
        this.handleDisconnected();
        return;
      }

      if (this.connectionState === 'connected' && telemetryAge > HEARTBEAT_STALE_MS) {
        stabilityLog('Telemetry', 'warn', `${TAG} heartbeat detected telemetry silence`);
        this.handleReconnectStarted();
        this.scheduleReconnect();
      }
    }, 5_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // ── Registry / State Helpers ───────────────────────────

  private resolveCurrentDevice(): void {
    if (this.currentDevice?.device_id) return;

    try {
      const primary = (vehicleTelemetryDeviceRegistry as any).getPrimary?.();
      if (primary) {
        this.currentDevice = primary;
      }
    } catch {}
  }

  private markRegistryState(state: string): void {
    const deviceId = this.currentDevice?.device_id;
    if (!deviceId) return;

    try {
      const registryAny = vehicleTelemetryDeviceRegistry as any;
      if (typeof registryAny.updateDevice === 'function') {
        registryAny.updateDevice(deviceId, { connection_state: state, last_seen: Date.now() });
        return;
      }
      if (typeof registryAny.patchDevice === 'function') {
        registryAny.patchDevice(deviceId, { connection_state: state, last_seen: Date.now() });
        return;
      }
      if (typeof registryAny.touchDevice === 'function') {
        registryAny.touchDevice(deviceId);
      }
    } catch (error) {
      stabilityLog('Telemetry', 'warn', `${TAG} failed registry state update`, error);
    }
  }

  private setConnectionState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    this.emit('state', this.getServiceStateSnapshot());
  }

  private getServiceStateSnapshot() {
    return {
      connectionState: this.connectionState,
      activeProvider: this.activeProvider,
      latestTelemetry: { ...this.latestTelemetry },
      currentDevice: this.currentDevice ? { ...this.currentDevice } : null,
      retryCount: this.retryCount,
      lastTelemetryAt: this.lastTelemetryAt,
      started: this.started,
      pollerStatus: this.getPollerStatus(),
    };
  }
}

export const vehicleTelemetryService = new VehicleTelemetryService();
vehicleTelemetryStore.attachToService(vehicleTelemetryService);
export default vehicleTelemetryService;
export type {
  AdapterLike as VehicleTelemetryAdapterLike,
  DeviceLike as VehicleTelemetryDeviceLike,
  VehicleTelemetryPollerStatus,
};
