/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY ADAPTER BRIDGE — Live Connection Pass
 * ═══════════════════════════════════════════════════════════
 *
 * Provider-agnostic bridge between raw hardware/provider adapters and the
 * ECS VehicleTelemetryService / VehicleTelemetryStore stack.
 *
 * Primary goals:
 *   - Normalize varying provider event shapes into one ECS lifecycle
 *   - Emit telemetry + lifecycle events the live service pass expects
 *   - Keep provider integration flexible for BLE / OBD / power vendors
 *   - Avoid hard-coupling to one adapter SDK implementation
 *
 * Expected downstream lifecycle events:
 *   telemetry / data
 *   connected / connect
 *   disconnected / disconnect
 *   reconnecting / reconnect_start
 *   reconnect_success / reconnected
 *   reconnect_failed
 */

import type { NormalizedVehicleTelemetry, VehicleTelemetryProviderId } from './VehicleTelemetryTypes';
import { ecsLog } from '../../lib/ecsLogger';

export type VehicleTelemetryBridgeLifecycleEvent =
  | 'telemetry'
  | 'data'
  | 'connected'
  | 'connect'
  | 'disconnected'
  | 'disconnect'
  | 'reconnecting'
  | 'reconnect_start'
  | 'reconnect_success'
  | 'reconnected'
  | 'reconnect_failed'
  | 'error';

export type VehicleTelemetryBridgeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface VehicleTelemetryBridgeEventMap {
  telemetry: NormalizedVehicleTelemetry;
  data: NormalizedVehicleTelemetry;
  connected: { deviceId?: string | null; provider?: string | null; at: number };
  connect: { deviceId?: string | null; provider?: string | null; at: number };
  disconnected: { reason?: string | null; at: number };
  disconnect: { reason?: string | null; at: number };
  reconnecting: { attempt?: number; reason?: string | null; at: number };
  reconnect_start: { attempt?: number; reason?: string | null; at: number };
  reconnect_success: { attempt?: number; at: number };
  reconnected: { attempt?: number; at: number };
  reconnect_failed: { attempt?: number; reason?: string | null; at: number };
  error: { message: string; cause?: unknown; at: number };
}

export type BridgeListener<K extends keyof VehicleTelemetryBridgeEventMap> = (
  payload: VehicleTelemetryBridgeEventMap[K]
) => void;

export interface RawTelemetryAdapter {
  provider?: string;
  deviceId?: string;

  connect?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
  reconnect?: () => Promise<void> | void;
  start?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
  isConnected?: () => boolean;

  on?: (event: string, listener: (payload?: any) => void) => (() => void) | void;
  off?: (event: string, listener: (payload?: any) => void) => void;
  subscribe?: (event: string, listener: (payload?: any) => void) => (() => void) | void;
  unsubscribe?: (event: string, listener: (payload?: any) => void) => void;
  addListener?: (event: string, listener: (payload?: any) => void) => { remove?: () => void } | void;
  removeListener?: (event: string, listener: (payload?: any) => void) => void;
}

export interface VehicleTelemetryAdapterBridgeOptions {
  deviceId?: string | null;
  provider?: string | null;
  staleAfterMs?: number;
  debug?: boolean;
  tag?: string;
}

const DEFAULT_STALE_AFTER_MS = 30_000;
const DEFAULT_TAG = '[VT-Bridge]';

function noop(): void {}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asNumber(value);
    if (n != null) return n;
  }
  return null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickFirstTireValues(...values: unknown[]): [number | null, number | null, number | null, number | null] | undefined {
  const source = values.find((value) => Array.isArray(value));
  if (!Array.isArray(source)) return undefined;
  const next = [0, 1, 2, 3].map((index) => {
    const n = asNumber(source[index]);
    return n != null && n >= 0 ? n : null;
  }) as [number | null, number | null, number | null, number | null];
  return next.some((entry) => entry != null) ? next : undefined;
}

function normalizeProviderId(value: string | null): VehicleTelemetryProviderId {
  switch (value) {
    case 'obd2':
    case 'tpms':
    case 'vehicle_internal':
    case 'future_sensor':
      return value;
    default:
      return 'future_sensor';
  }
}

function readPath(obj: any, path: string): unknown {
  try {
    return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  } catch {
    return undefined;
  }
}

function coerceTimestamp(value: unknown): number {
  const n = asNumber(value);
  if (n != null && n > 0) return n;
  return Date.now();
}

function normalizeTelemetry(
  raw: any,
  deviceId: string | null,
  provider: string | null
): NormalizedVehicleTelemetry {
  const timestamp = coerceTimestamp(
    raw?.timestamp ?? raw?.ts ?? raw?.time ?? raw?.at ?? readPath(raw, 'meta.timestamp')
  );
  const providerId = normalizeProviderId(pickFirstString(raw?.provider, provider));

  return {
    timestamp,
    device_id: pickFirstString(raw?.device_id, raw?.deviceId, deviceId) ?? 'unknown-device',
    provider: providerId,

    vehicle_speed: pickFirstNumber(
      raw?.vehicle_speed,
      raw?.vehicleSpeed,
      raw?.speed,
      readPath(raw, 'vehicle.speed'),
      readPath(raw, 'metrics.speed')
    ) ?? undefined,
    engine_rpm: pickFirstNumber(
      raw?.engine_rpm,
      raw?.engineRpm,
      raw?.rpm,
      readPath(raw, 'engine.rpm'),
      readPath(raw, 'metrics.rpm')
    ) ?? undefined,
    battery_voltage: pickFirstNumber(
      raw?.battery_voltage,
      raw?.batteryVoltage,
      raw?.voltage,
      readPath(raw, 'electrical.batteryVoltage'),
      readPath(raw, 'metrics.voltage')
    ) ?? undefined,
    fuel_level: pickFirstNumber(
      raw?.fuel_level,
      raw?.fuelLevel,
      raw?.fuel,
      readPath(raw, 'fuel.level'),
      readPath(raw, 'metrics.fuelLevel')
    ) ?? undefined,
    coolant_temp: pickFirstNumber(
      raw?.coolant_temp,
      raw?.coolantTemp,
      raw?.coolant_temperature,
      raw?.engine_coolant_temp,
      readPath(raw, 'engine.coolantTemp'),
      readPath(raw, 'metrics.coolantTemp')
    ) ?? undefined,
    engine_load: pickFirstNumber(
      raw?.engine_load,
      raw?.engineLoad,
      raw?.load,
      readPath(raw, 'engine.load'),
      readPath(raw, 'metrics.engineLoad')
    ) ?? undefined,
    tire_pressures: pickFirstTireValues(
      raw?.tire_pressures,
      raw?.tirePressures,
      raw?.tirePressurePsi,
      readPath(raw, 'tpms.pressures'),
      readPath(raw, 'metrics.tirePressures')
    ),
    tire_temps: pickFirstTireValues(
      raw?.tire_temps,
      raw?.tireTemps,
      raw?.tireTempF,
      readPath(raw, 'tpms.temps'),
      readPath(raw, 'metrics.tireTemps')
    ),
  };
}

export class VehicleTelemetryAdapterBridge {
  private adapter: RawTelemetryAdapter | null = null;
  private readonly listeners: {
    [K in keyof VehicleTelemetryBridgeEventMap]?: Set<BridgeListener<K>>;
  } = {};
  private adapterUnsubscribers: (() => void)[] = [];
  private lastTelemetryAt = 0;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionState: VehicleTelemetryBridgeConnectionState = 'idle';
  private reconnectAttempt = 0;
  private deviceId: string | null;
  private provider: VehicleTelemetryProviderId | null;
  private readonly staleAfterMs: number;
  private readonly debug: boolean;
  private readonly tag: string;

  constructor(options: VehicleTelemetryAdapterBridgeOptions = {}) {
    this.deviceId = options.deviceId ?? null;
    this.provider = normalizeProviderId(options.provider ?? null);
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.debug = !!options.debug;
    this.tag = options.tag || DEFAULT_TAG;
  }

  private log(message: string, details?: Record<string, unknown>): void {
    if (!this.debug) return;
    ecsLog.debug('TELEMETRY', `${this.tag} ${message}`, details);
  }

  private warn(message: string, details?: Record<string, unknown>): void {
    ecsLog.warn('TELEMETRY', `${this.tag} ${message}`, details);
  }

  private errorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        errorName: error.name,
        errorMessage: error.message,
      };
    }
    return { errorMessage: String(error) };
  }

  private setConnectionState(state: VehicleTelemetryBridgeConnectionState): void {
    this.connectionState = state;
  }

  private emit<K extends keyof VehicleTelemetryBridgeEventMap>(
    event: K,
    payload: VehicleTelemetryBridgeEventMap[K]
  ): void {
    const set = this.listeners[event] as Set<BridgeListener<K>> | undefined;
    if (!set?.size) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (error) {
        this.warn(`Listener failure for ${String(event)}`, this.errorDetails(error));
      }
    }
  }

  on<K extends keyof VehicleTelemetryBridgeEventMap>(
    event: K,
    listener: BridgeListener<K>
  ): () => void {
    const existing = (this.listeners[event] as Set<BridgeListener<K>> | undefined) ?? new Set();
    existing.add(listener);
    this.listeners[event] = existing as any;
    return () => {
      existing.delete(listener);
    };
  }

  subscribe<K extends keyof VehicleTelemetryBridgeEventMap>(
    event: K,
    listener: BridgeListener<K>
  ): () => void {
    return this.on(event, listener);
  }

  getConnectionState(): VehicleTelemetryBridgeConnectionState {
    return this.connectionState;
  }

  getLastTelemetryAt(): number {
    return this.lastTelemetryAt;
  }

  getProviderMeta(): { deviceId: string | null; provider: string | null } {
    return {
      deviceId: this.deviceId ?? this.adapter?.deviceId ?? null,
      provider: this.provider ?? this.adapter?.provider ?? null,
    };
  }

  bindAdapter(adapter: RawTelemetryAdapter): void {
    this.unbindAdapter();
    this.adapter = adapter;
    this.deviceId = this.deviceId ?? adapter.deviceId ?? null;
    this.provider = this.provider ?? normalizeProviderId(adapter.provider ?? null);
    this.setConnectionState('disconnected');
    this.log('Binding adapter', { deviceId: this.deviceId, provider: this.provider });
    this.attachAdapterListeners(adapter);
  }

  unbindAdapter(): void {
    this.clearStaleTimer();
    for (const unsub of this.adapterUnsubscribers.splice(0)) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.adapter = null;
    this.setConnectionState('idle');
  }

  private attachAdapterListeners(adapter: RawTelemetryAdapter): void {
    const wire = (eventNames: string[], handler: (payload?: any) => void) => {
      for (const eventName of eventNames) {
        const unsub = this.attachAdapterListener(adapter, eventName, handler);
        if (unsub) this.adapterUnsubscribers.push(unsub);
      }
    };

    wire(['telemetry', 'data', 'reading', 'update', 'message'], payload => {
      this.handleTelemetry(payload);
    });

    wire(['connected', 'connect', 'ready', 'session_open'], () => {
      this.handleConnected();
    });

    wire(['disconnected', 'disconnect', 'session_closed'], payload => {
      this.handleDisconnected(payload);
    });

    wire(['reconnecting', 'reconnect_start', 'reconnect'], payload => {
      this.handleReconnectStart(payload);
    });

    wire(['reconnect_success', 'reconnected'], payload => {
      this.handleReconnectSuccess(payload);
    });

    wire(['reconnect_failed'], payload => {
      this.handleReconnectFailed(payload);
    });

    wire(['error', 'adapter_error'], payload => {
      this.handleError(payload);
    });
  }

  private attachAdapterListener(
    adapter: RawTelemetryAdapter,
    eventName: string,
    handler: (payload?: any) => void
  ): (() => void) | null {
    try {
      if (typeof adapter.subscribe === 'function') {
        const unsub = adapter.subscribe(eventName, handler);
        if (typeof unsub === 'function') return unsub;
        return () => {
          try {
            adapter.unsubscribe?.(eventName, handler);
          } catch {
            // ignore
          }
        };
      }

      if (typeof adapter.on === 'function') {
        const unsub = adapter.on(eventName, handler);
        if (typeof unsub === 'function') return unsub;
        return () => {
          try {
            adapter.off?.(eventName, handler);
          } catch {
            // ignore
          }
        };
      }

      if (typeof adapter.addListener === 'function') {
        const sub = adapter.addListener(eventName, handler);
        return () => {
          try {
            if (sub && typeof sub === 'object' && typeof sub.remove === 'function') sub.remove();
            else adapter.removeListener?.(eventName, handler);
          } catch {
            // ignore
          }
        };
      }
    } catch (error) {
      this.warn(`Failed attaching adapter listener for ${eventName}`, this.errorDetails(error));
    }
    return null;
  }

  async connect(): Promise<void> {
    if (!this.adapter) throw new Error('No telemetry adapter bound');
    this.setConnectionState('connecting');
    this.log('Connecting adapter');

    if (typeof this.adapter.connect === 'function') {
      await this.adapter.connect();
      return;
    }

    if (typeof this.adapter.start === 'function') {
      await this.adapter.start();
      return;
    }

    this.handleConnected();
  }

  async disconnect(reason = 'manual_disconnect'): Promise<void> {
    this.clearStaleTimer();

    if (this.adapter) {
      if (typeof this.adapter.disconnect === 'function') {
        await this.adapter.disconnect();
      } else if (typeof this.adapter.stop === 'function') {
        await this.adapter.stop();
      }
    }

    this.handleDisconnected({ reason });
  }

  async reconnect(reason = 'bridge_reconnect'): Promise<void> {
    if (!this.adapter) throw new Error('No telemetry adapter bound');
    this.handleReconnectStart({ attempt: this.reconnectAttempt + 1, reason });

    if (typeof this.adapter.reconnect === 'function') {
      await this.adapter.reconnect();
      return;
    }

    if (typeof this.adapter.disconnect === 'function') {
      try {
        await this.adapter.disconnect();
      } catch {
        // ignore disconnect failures during forced reconnect
      }
    }

    if (typeof this.adapter.connect === 'function') {
      await this.adapter.connect();
      return;
    }

    this.handleReconnectSuccess({ attempt: this.reconnectAttempt });
  }

  private handleTelemetry(rawPayload?: any): void {
    const telemetry = normalizeTelemetry(rawPayload ?? {}, this.deviceId, this.provider);
    this.lastTelemetryAt = telemetry.timestamp || Date.now();
    this.deviceId = telemetry.device_id ?? this.deviceId;
    this.provider = telemetry.provider ?? this.provider;

    if (this.connectionState !== 'connected') {
      this.handleConnected();
    }

    this.armStaleTimer();
    this.emit('telemetry', telemetry);
    this.emit('data', telemetry);
  }

  private handleConnected(): void {
    this.clearStaleTimer();
    this.setConnectionState('connected');
    this.reconnectAttempt = 0;
    const payload = {
      deviceId: this.deviceId,
      provider: this.provider,
      at: Date.now(),
    };
    this.emit('connected', payload);
    this.emit('connect', payload);
  }

  private handleDisconnected(rawPayload?: any): void {
    this.clearStaleTimer();
    this.setConnectionState('disconnected');
    const payload = {
      reason: pickFirstString(rawPayload?.reason, rawPayload?.message, 'adapter_disconnected'),
      at: Date.now(),
    };
    this.emit('disconnected', payload);
    this.emit('disconnect', payload);
  }

  private handleReconnectStart(rawPayload?: any): void {
    this.clearStaleTimer();
    this.reconnectAttempt = Math.max(
      this.reconnectAttempt + 1,
      asNumber(rawPayload?.attempt) ?? 1
    );
    this.setConnectionState('reconnecting');
    const payload = {
      attempt: this.reconnectAttempt,
      reason: pickFirstString(rawPayload?.reason, rawPayload?.message, 'adapter_reconnecting'),
      at: Date.now(),
    };
    this.emit('reconnecting', payload);
    this.emit('reconnect_start', payload);
  }

  private handleReconnectSuccess(rawPayload?: any): void {
    this.setConnectionState('connected');
    const payload = {
      attempt: asNumber(rawPayload?.attempt) ?? this.reconnectAttempt,
      at: Date.now(),
    };
    this.reconnectAttempt = 0;
    this.emit('reconnect_success', payload);
    this.emit('reconnected', payload);
    this.emit('connected', {
      deviceId: this.deviceId,
      provider: this.provider,
      at: Date.now(),
    });
  }

  private handleReconnectFailed(rawPayload?: any): void {
    this.clearStaleTimer();
    this.setConnectionState('error');
    const payload = {
      attempt: asNumber(rawPayload?.attempt) ?? this.reconnectAttempt,
      reason: pickFirstString(rawPayload?.reason, rawPayload?.message, 'adapter_reconnect_failed'),
      at: Date.now(),
    };
    this.emit('reconnect_failed', payload);
  }

  private handleError(rawPayload?: any): void {
    this.setConnectionState('error');
    this.emit('error', {
      message: pickFirstString(rawPayload?.message, rawPayload?.reason, 'Telemetry adapter error') || 'Telemetry adapter error',
      cause: rawPayload,
      at: Date.now(),
    });
  }

  private armStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      if (this.connectionState === 'connected') {
        this.handleReconnectStart({ reason: 'telemetry_silence_timeout' });
      }
    }, this.staleAfterMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  destroy(): void {
    this.clearStaleTimer();
    this.unbindAdapter();
    (Object.keys(this.listeners) as (keyof VehicleTelemetryBridgeEventMap)[]).forEach(event => {
      const set = this.listeners[event];
      set?.clear();
    });
    this.setConnectionState('idle');
  }
}

export const vehicleTelemetryAdapterBridge = new VehicleTelemetryAdapterBridge();

export function createVehicleTelemetryAdapterBridge(
  options?: VehicleTelemetryAdapterBridgeOptions
): VehicleTelemetryAdapterBridge {
  return new VehicleTelemetryAdapterBridge(options);
}

export default vehicleTelemetryAdapterBridge;
