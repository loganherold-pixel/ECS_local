import type {
  BluConnectionState,
  BluDevice,
  BluDeviceCapabilities,
  BluProviderId,
  BluTelemetry,
} from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluSessionStore } from './BluSessionStore';
import { bluStateStore } from './BluStateStore';

export interface SimulatedBluModelSpec {
  id: string;
  name: string;
  model: string;
  capacityWh: number;
  voltageNominal: number;
  inputRange: [number, number];
  outputRange: [number, number];
  solarRange?: [number, number];
  temperatureRange?: [number, number];
  rssi: number;
}

export interface SimulatedDiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  model?: string;
  modelSpec?: SimulatedBluModelSpec;
}

export interface SimulatedConnectResult {
  success: boolean;
  device: BluDevice | null;
  devices?: BluDevice[];
  error: string | null;
  errorCode?: string | null;
}

export interface SimulatedPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

export interface SimulatedAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: SimulatedDiscoveredDevice[];
  connectedDevices: BluDevice[];
  lastError: string | null;
  lastErrorCode: string | null;
  pollCount: number;
  lastPollAt: number | null;
  isPaused: boolean;
  isScanning: boolean;
  consecutiveFailures: number;
  isReconnecting: boolean;
  reconnectAttempts: number;
}

type AdapterSubscriber = (state: SimulatedAdapterState) => void;
type AdapterEventName =
  | 'connect'
  | 'connected'
  | 'disconnect'
  | 'disconnected'
  | 'reconnecting'
  | 'reconnect_start'
  | 'reconnect_success'
  | 'reconnected'
  | 'reconnect_failed'
  | 'telemetry'
  | 'data'
  | 'error'
  | 'status';

interface AdapterEventPayload {
  type: AdapterEventName;
  provider: BluProviderId;
  timestamp: number;
  state: SimulatedAdapterState;
  telemetry?: BluTelemetry | null;
  device?: BluDevice | null;
  devices?: BluDevice[];
  error?: string | null;
  errorCode?: string | null;
  meta?: Record<string, unknown>;
}

type AdapterEventListener = (payload: AdapterEventPayload) => void;

interface SimulatedRuntimeState {
  batteryPercent: number;
  inputWatts: number;
  outputWatts: number;
  solarWatts: number;
  temperatureC: number;
  batteryVolts: number;
  chargeCycles: number;
}

export interface SimulatedBluAdapterConfig {
  provider: BluProviderId;
  displayName: string;
  capabilities: BluDeviceCapabilities;
  models: SimulatedBluModelSpec[];
  defaultPollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function between(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

function drift(value: number, magnitude: number, min: number, max: number): number {
  return clamp(value + (Math.random() - 0.5) * magnitude, min, max);
}

export function createSimulatedBluAdapter(config: SimulatedBluAdapterConfig) {
  const pollIntervalMs = config.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  class SimulatedBluAdapter {
    private connectionState: BluConnectionState = 'disconnected';
    private discoveredDevices: SimulatedDiscoveredDevice[] = [];
    private connectedDevices: BluDevice[] = [];
    private lastError: string | null = null;
    private lastErrorCode: string | null = null;
    private pollCount = 0;
    private lastPollAt: number | null = null;
    private isPaused = false;
    private isScanning = false;
    private isPolling = false;
    private consecutiveFailures = 0;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private subscribers = new Set<AdapterSubscriber>();
    private eventSubscribers = new Map<AdapterEventName, Set<AdapterEventListener>>();
    private simulatedStates = new Map<string, SimulatedRuntimeState>();
    private telemetryByDeviceId = new Map<string, BluTelemetry>();
    private lastTelemetry: BluTelemetry | null = null;

    subscribe(cb: AdapterSubscriber): () => void {
      this.subscribers.add(cb);
      cb(this.getState());
      return () => {
        this.subscribers.delete(cb);
      };
    }

    on(event: AdapterEventName, listener: AdapterEventListener): () => void {
      const listeners = this.eventSubscribers.get(event) ?? new Set<AdapterEventListener>();
      listeners.add(listener);
      this.eventSubscribers.set(event, listeners);
      return () => this.off(event, listener);
    }

    off(event: AdapterEventName, listener: AdapterEventListener): void {
      const listeners = this.eventSubscribers.get(event);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventSubscribers.delete(event);
      }
    }

    addListener(event: AdapterEventName, listener: AdapterEventListener): () => void {
      return this.on(event, listener);
    }

    removeListener(event: AdapterEventName, listener: AdapterEventListener): void {
      this.off(event, listener);
    }

    subscribeEvent(event: AdapterEventName, listener: AdapterEventListener): () => void {
      return this.on(event, listener);
    }

    getState(): SimulatedAdapterState {
      return {
        connectionState: this.connectionState,
        discoveredDevices: [...this.discoveredDevices],
        connectedDevices: [...this.connectedDevices],
        lastError: this.lastError,
        lastErrorCode: this.lastErrorCode,
        pollCount: this.pollCount,
        lastPollAt: this.lastPollAt,
        isPaused: this.isPaused,
        isScanning: this.isScanning,
        consecutiveFailures: this.consecutiveFailures,
        isReconnecting: this.isReconnecting,
        reconnectAttempts: this.reconnectAttempts,
      };
    }

    getLastTelemetry(): BluTelemetry | null {
      return this.lastTelemetry ? { ...this.lastTelemetry } : null;
    }

    getAllTelemetry(): BluTelemetry[] {
      return Array.from(this.telemetryByDeviceId.values()).map((telemetry) => ({ ...telemetry }));
    }

    getECSBridgeState(): {
      provider: BluProviderId;
      connectionState: BluConnectionState;
      isConnected: boolean;
      isReconnecting: boolean;
      isPaused: boolean;
      isScanning: boolean;
      lastError: string | null;
      lastErrorCode: string | null;
      pollCount: number;
      lastPollAt: number | null;
      primaryDeviceId: string | null;
      primaryDevice: BluDevice | null;
      connectedDevices: BluDevice[];
      discoveredDevices: SimulatedDiscoveredDevice[];
      telemetry: BluTelemetry | null;
    } {
      const primaryDeviceId = this.getPrimaryDeviceId();
      const primaryDevice = primaryDeviceId
        ? bluDeviceRegistry.getDevice(config.provider, primaryDeviceId) ?? null
        : null;

      return {
        provider: config.provider,
        connectionState: this.connectionState,
        isConnected: this.connectionState === 'connected',
        isReconnecting: this.isReconnecting,
        isPaused: this.isPaused,
        isScanning: this.isScanning,
        lastError: this.lastError,
        lastErrorCode: this.lastErrorCode,
        pollCount: this.pollCount,
        lastPollAt: this.lastPollAt,
        primaryDeviceId,
        primaryDevice,
        connectedDevices: [...this.connectedDevices],
        discoveredDevices: [...this.discoveredDevices],
        telemetry: this.getLastTelemetry(),
      };
    }

    async scanForDevices(): Promise<SimulatedDiscoveredDevice[]> {
      if (this.isScanning) {
        return this.discoveredDevices;
      }

      this.isScanning = true;
      this.lastError = null;
      this.lastErrorCode = null;
      this.notify();

      await this.simulateDelay(900);

      this.discoveredDevices = config.models.map((model) => ({
        id: `${config.provider}-${model.id}`,
        name: model.name,
        rssi: model.rssi,
        model: model.model,
        modelSpec: model,
      }));

      this.isScanning = false;
      this.notify();
      this.emitEvent('status', { meta: { phase: 'scan_complete', discoveredCount: this.discoveredDevices.length } });
      return this.discoveredDevices;
    }

    async connect(deviceId?: string): Promise<SimulatedConnectResult> {
      this.connectionState = 'connecting';
      this.lastError = null;
      this.lastErrorCode = null;
      this.notify();
      this.emitEvent('connect', { meta: { deviceId: deviceId ?? null } });

      if (this.discoveredDevices.length === 0) {
        await this.scanForDevices();
      }

      const discovered =
        this.discoveredDevices.find((item) => item.id === deviceId) ??
        this.discoveredDevices[0] ??
        null;

      if (!discovered) {
        return this.handleConnectError('No devices discovered.', 'NO_DISCOVERED_DEVICE');
      }

      const device = this.normalizeDevice(discovered);
      await bluDeviceRegistry.registerDevice({
        provider: device.provider,
        device_id: device.device_id,
        display_name: device.display_name,
        model: device.model,
        connection_state: 'connected',
        last_seen: Date.now(),
        capabilities: device.capabilities,
      });

      await bluDeviceRegistry.ensurePrimary(config.provider);
      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
      this.connectionState = 'connected';
      this.consecutiveFailures = 0;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection(
        config.provider,
        primary?.provider === config.provider ? primary.device_id : device.device_id,
      );

      await this.pollTelemetry(device.device_id);

      this.notify();
      this.emitEvent('connected', { device, devices: [...this.connectedDevices] });
      this.emitEvent('status', { meta: { phase: 'connected', deviceId: device.device_id } });

      return {
        success: true,
        device,
        devices: [...this.connectedDevices],
        error: null,
      };
    }

    async connectAll(): Promise<SimulatedConnectResult[]> {
      if (this.discoveredDevices.length === 0) {
        await this.scanForDevices();
      }

      const results: SimulatedConnectResult[] = [];
      for (const discovered of this.discoveredDevices) {
        const alreadyConnected = this.connectedDevices.some((device) => device.device_id === discovered.id);
        if (alreadyConnected) {
          const current = this.connectedDevices.find((device) => device.device_id === discovered.id) ?? null;
          results.push({ success: true, device: current, error: null });
          continue;
        }

        const result = await this.connect(discovered.id);
        results.push(result);
      }

      return results;
    }

    async disconnect(): Promise<void> {
      this.stopPolling();
      await bluDeviceRegistry.clearProvider(config.provider);
      this.connectionState = 'disconnected';
      this.connectedDevices = [];
      this.discoveredDevices = [];
      this.telemetryByDeviceId.clear();
      this.simulatedStates.clear();
      this.lastTelemetry = null;
      this.lastError = null;
      this.lastErrorCode = null;
      this.pollCount = 0;
      this.lastPollAt = null;
      this.isPaused = false;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      bluStateStore.setReconnecting(false);
      bluSessionStore.recordDisconnection();
      this.notify();
      this.emitEvent('disconnected', { meta: { requested: true } });
      this.emitEvent('status', { meta: { phase: 'disconnected', requested: true } });
    }

    async refreshDevices(): Promise<SimulatedConnectResult> {
      await this.scanForDevices();
      return {
        success: true,
        device: this.connectedDevices[0] ?? null,
        devices: [...this.connectedDevices],
        error: null,
      };
    }

    async restoreSession(): Promise<boolean> {
      if (!bluSessionStore.hasPreviousSession()) return false;
      const session = bluSessionStore.getSession();
      if (session.provider !== config.provider) return false;

      await this.scanForDevices();
      const result = await this.connect(session.primaryDeviceId ?? undefined);
      if (!result.success) return false;

      if (session.primaryDeviceId) {
        await this.setPrimaryDevice(session.primaryDeviceId);
      }

      if (session.wasPolling) {
        this.startPolling(pollIntervalMs);
      }

      return true;
    }

    async setPrimaryDevice(deviceId: string): Promise<void> {
      await bluDeviceRegistry.setPrimary(config.provider, deviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
      bluSessionStore.recordPrimaryDeviceChange(deviceId);
      await this.pollTelemetry(deviceId);
      this.notify();
    }

    startPolling(intervalMs: number = pollIntervalMs): void {
      this.stopPolling();
      this.isPaused = false;
      const tick = async () => {
        if (this.connectionState !== 'connected' && !this.isReconnecting) return;
        if (this.isPaused) {
          this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
          return;
        }

        await this.pollConnectedDevices();
        this.pollTimer = setTimeout(tick, intervalMs);
      };

      void tick();
      bluSessionStore.recordPollingStarted();
    }

    stopPolling(): void {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      bluSessionStore.recordPollingStopped();
    }

    async renameDevice(deviceId: string, newName: string): Promise<void> {
      const current = bluDeviceRegistry.getDevice(config.provider, deviceId);
      if (!current) return;

      await bluDeviceRegistry.registerDevice({
        provider: config.provider,
        device_id: deviceId,
        display_name: newName,
        model: current.model,
        connection_state: current.connection_state,
        last_seen: Date.now(),
        capabilities: current.capabilities,
      });

      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
      this.notify();
    }

    private async pollConnectedDevices(): Promise<void> {
      const deviceIds = this.connectedDevices.map((device) => device.device_id);
      const targets = deviceIds.length > 0 ? deviceIds : [this.getPrimaryDeviceId()].filter(Boolean) as string[];
      for (const deviceId of targets) {
        await this.pollTelemetry(deviceId);
      }
    }

    async pollTelemetry(deviceId?: string): Promise<SimulatedPollResult> {
      const targetDeviceId = deviceId ?? this.getPrimaryDeviceId();
      if (!targetDeviceId) {
        return { success: false, telemetry: null, error: 'No device available to poll.' };
      }

      const device = bluDeviceRegistry.getDevice(config.provider, targetDeviceId);
      const modelSpec =
        config.models.find((model) => `${config.provider}-${model.id}` === targetDeviceId) ??
        config.models[0];

      if (!device || !modelSpec) {
        return { success: false, telemetry: null, error: 'Unknown device.' };
      }

      const currentState = this.simulatedStates.get(targetDeviceId) ?? this.createSimulatedState(modelSpec);
      const nextState = this.driftState(currentState, modelSpec);
      this.simulatedStates.set(targetDeviceId, nextState);

      const telemetry = this.normalizeTelemetry(targetDeviceId, nextState, modelSpec);
      this.telemetryByDeviceId.set(targetDeviceId, telemetry);
      this.lastTelemetry = telemetry;
      this.pollCount += 1;
      this.lastPollAt = telemetry.timestamp;
      this.consecutiveFailures = 0;

      bluStateStore.ingestTelemetry(telemetry);
      await bluDeviceRegistry.updateConnectionState(config.provider, targetDeviceId, 'connected');
      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);

      this.notify();
      this.emitEvent('telemetry', { telemetry, meta: { deviceId: targetDeviceId, pollCount: this.pollCount } });
      this.emitEvent('data', { telemetry, meta: { deviceId: targetDeviceId, pollCount: this.pollCount } });
      return { success: true, telemetry, error: null };
    }

    private createSimulatedState(modelSpec: SimulatedBluModelSpec): SimulatedRuntimeState {
      const solarRange = modelSpec.solarRange ?? [0, 0];
      const temperatureRange = modelSpec.temperatureRange ?? [18, 36];
      return {
        batteryPercent: between([45, 92]),
        inputWatts: between(modelSpec.inputRange),
        outputWatts: between(modelSpec.outputRange),
        solarWatts: between(solarRange),
        temperatureC: between(temperatureRange),
        batteryVolts: between([modelSpec.voltageNominal - 1.2, modelSpec.voltageNominal + 1.6]),
        chargeCycles: Math.floor(25 + Math.random() * 350),
      };
    }

    private driftState(state: SimulatedRuntimeState, modelSpec: SimulatedBluModelSpec): SimulatedRuntimeState {
      const solarRange = modelSpec.solarRange ?? [0, 0];
      const temperatureRange = modelSpec.temperatureRange ?? [18, 36];
      return {
        batteryPercent: drift(state.batteryPercent, 1.4, 0, 100),
        inputWatts: drift(state.inputWatts, 30, modelSpec.inputRange[0], modelSpec.inputRange[1]),
        outputWatts: drift(state.outputWatts, 28, modelSpec.outputRange[0], modelSpec.outputRange[1]),
        solarWatts: drift(state.solarWatts, 22, solarRange[0], solarRange[1]),
        temperatureC: drift(state.temperatureC, 1.2, temperatureRange[0], temperatureRange[1]),
        batteryVolts: drift(
          state.batteryVolts,
          0.5,
          modelSpec.voltageNominal - 2,
          modelSpec.voltageNominal + 2,
        ),
        chargeCycles: state.chargeCycles,
      };
    }

    private normalizeDevice(discovered: SimulatedDiscoveredDevice): BluDevice {
      const modelSpec = discovered.modelSpec ?? config.models[0];
      return {
        provider: config.provider,
        device_id: discovered.id,
        display_name: discovered.name,
        model: discovered.model || modelSpec?.model || config.displayName,
        connection_state: 'connected',
        last_seen: Date.now(),
        capabilities: { ...config.capabilities },
        is_primary: false,
      };
    }

    private normalizeTelemetry(
      deviceId: string,
      state: SimulatedRuntimeState,
      modelSpec: SimulatedBluModelSpec,
    ): BluTelemetry {
      const batteryPercent = Math.round(state.batteryPercent * 10) / 10;
      const inputWatts = Math.round(state.inputWatts);
      const outputWatts = Math.round(state.outputWatts);
      const solarWatts = Math.round(state.solarWatts);
      const remainingWh = (modelSpec.capacityWh * batteryPercent) / 100;
      const estimatedRuntimeMinutes =
        outputWatts > 0 ? Math.round((remainingWh / outputWatts) * 60) : undefined;

      return {
        timestamp: Date.now(),
        provider: config.provider,
        device_id: deviceId,
        battery_percent: batteryPercent,
        input_watts: inputWatts,
        output_watts: outputWatts,
        battery_watts: inputWatts - outputWatts,
        estimated_runtime_minutes: estimatedRuntimeMinutes,
        solar_input_watts: solarWatts,
        ac_output_watts: Math.round(outputWatts * 0.72),
        dc_output_watts: Math.round(outputWatts * 0.28),
        temperature_celsius: Math.round(state.temperatureC * 10) / 10,
        battery_volts: Math.round(state.batteryVolts * 10) / 10,
        capacity_wh: modelSpec.capacityWh,
        charge_cycles: state.chargeCycles,
      };
    }

    private getPrimaryDeviceId(): string | null {
      const primary = bluDeviceRegistry.getPrimary();
      if (primary?.provider === config.provider) {
        return primary.device_id;
      }
      return this.connectedDevices[0]?.device_id ?? this.discoveredDevices[0]?.id ?? null;
    }

    private handleConnectError(message: string, code: string): SimulatedConnectResult {
      this.connectionState = 'error';
      this.lastError = message;
      this.lastErrorCode = code;
      this.notify();
      this.emitEvent('error', { error: message, errorCode: code, meta: { phase: 'connect' } });
      return { success: false, device: null, error: message, errorCode: code };
    }

    private notify(): void {
      const state = this.getState();
      for (const cb of this.subscribers) {
        try {
          cb(state);
        } catch {}
      }
    }

    private emitEvent(
      type: AdapterEventName,
      extras: Omit<Partial<AdapterEventPayload>, 'type' | 'provider' | 'timestamp' | 'state'> = {},
    ): void {
      const listeners = this.eventSubscribers.get(type);
      if (!listeners || listeners.size === 0) return;

      const payload: AdapterEventPayload = {
        type,
        provider: config.provider,
        timestamp: Date.now(),
        state: this.getState(),
        telemetry: extras.telemetry ?? undefined,
        device: extras.device ?? undefined,
        devices: extras.devices ?? undefined,
        error: extras.error ?? undefined,
        errorCode: extras.errorCode ?? undefined,
        meta: extras.meta ?? undefined,
      };

      for (const listener of listeners) {
        try {
          listener(payload);
        } catch {}
      }
    }

    private async simulateDelay(ms: number): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  return new SimulatedBluAdapter();
}

