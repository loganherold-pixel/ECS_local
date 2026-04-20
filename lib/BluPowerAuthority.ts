import type { BluDevice, BluTelemetry, BluConnectionState } from './BluTypes';
import { bluStateStore } from './BluStateStore';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { ecoFlowBluAdapter } from './EcoFlowBluAdapter';
import { bluettiBluAdapter } from './BluettiBluAdapter';
import { ankerSolixBluAdapter } from './AnkerSolixBluAdapter';
import { goalZeroBluAdapter } from './GoalZeroBluAdapter';
import { jackeryBluAdapter } from './JackeryBluAdapter';
import { renogyBluAdapter } from './RenogyBluAdapter';
import { redarcBluAdapter } from './RedarcBluAdapter';
import { dakotaLithiumBluAdapter } from './DakotaLithiumBluAdapter';

export type BluProviderKey =
  | 'ecoflow'
  | 'bluetti'
  | 'anker_solix'
  | 'goal_zero'
  | 'jackery'
  | 'renogy'
  | 'redarc'
  | 'dakota_lithium';

export type PowerFreshnessLabel =
  | 'live'
  | 'reconnecting'
  | 'stale'
  | 'disconnected'
  | 'last_known';

export interface BluAuthorityProviderState {
  provider: BluProviderKey;
  connectionState: BluConnectionState | 'unknown';
  isReconnecting: boolean;
  hasDevices: boolean;
  deviceCount: number;
  primaryDeviceId: string | null;
  lastTelemetryAt: number | null;
  freshness: PowerFreshnessLabel;
}

export interface BluAuthoritySnapshot {
  activeProvider: BluProviderKey | null;
  providers: Record<BluProviderKey, BluAuthorityProviderState>;
  primaryDevice: BluDevice | null;
  primaryTelemetry: BluTelemetry | null;
  latestTelemetry: BluTelemetry | null;
  connectionState: BluConnectionState | 'unknown';
  freshness: PowerFreshnessLabel;
  isConnected: boolean;
  isReconnecting: boolean;
  hasPowerData: boolean;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  dcOutputWatts: number | null;
  acOutputWatts: number | null;
  batteryVolts: number | null;
  batteryAmps: number | null;
  batteryWatts: number | null;
  temperatureCelsius: number | null;
  estimatedRuntimeMinutes: number | null;
  capacityWh: number | null;
  chargeCycles: number | null;
  inverterOn: boolean | null;
  deviceLabel: string | null;
  providerLabel: string | null;
  lastUpdatedAt: number | null;
  freshnessText: string;
}

export interface BluAuthorityStatusEvent {
  type: 'status';
  snapshot: BluAuthoritySnapshot;
}

export interface BluAuthorityTelemetryEvent {
  type: 'telemetry';
  telemetry: BluTelemetry | null;
  snapshot: BluAuthoritySnapshot;
}

export interface BluAuthorityProviderEvent {
  type:
    | 'provider_changed'
    | 'connected'
    | 'disconnected'
    | 'reconnecting'
    | 'reconnect_success'
    | 'reconnect_failed';
  provider: BluProviderKey | null;
  snapshot: BluAuthoritySnapshot;
}

export type BluAuthorityEvent =
  | BluAuthorityStatusEvent
  | BluAuthorityTelemetryEvent
  | BluAuthorityProviderEvent;

export type BluAuthorityListener = (snapshot: BluAuthoritySnapshot) => void;
export type BluAuthorityEventListener = (event: BluAuthorityEvent) => void;

const FRESH_WINDOW_MS = 30_000;
const STALE_WINDOW_MS = 90_000;
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PROVIDERS: BluProviderKey[] = [
  'ecoflow',
  'bluetti',
  'anker_solix',
  'goal_zero',
  'jackery',
  'renogy',
  'redarc',
  'dakota_lithium',
];

const PROVIDER_LABELS: Record<BluProviderKey, string> = {
  ecoflow: 'EcoFlow',
  bluetti: 'Bluetti',
  anker_solix: 'Anker SOLIX',
  goal_zero: 'Goal Zero',
  jackery: 'Jackery',
  renogy: 'Renogy',
  redarc: 'REDARC',
  dakota_lithium: 'Dakota Lithium',
};

function nullNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function freshnessFromAge(
  ageMs: number | null,
  connectionState: BluConnectionState | 'unknown',
  isReconnecting: boolean,
  hasTelemetry: boolean,
): PowerFreshnessLabel {
  if (isReconnecting) return 'reconnecting';
  if (!hasTelemetry || ageMs == null) {
    return connectionState === 'connected' ? 'live' : 'disconnected';
  }
  if (ageMs < FRESH_WINDOW_MS && connectionState === 'connected') return 'live';
  if (ageMs <= STALE_WINDOW_MS) {
    return connectionState === 'connected' ? 'live' : 'last_known';
  }
  if (ageMs < LAST_KNOWN_MAX_AGE_MS) {
    return connectionState === 'connected' ? 'stale' : 'last_known';
  }
  return connectionState === 'connected' ? 'stale' : 'disconnected';
}

function getFreshnessText(timestamp: number | null): string {
  if (!timestamp) return '';
  const age = Date.now() - timestamp;
  if (age < 10_000) return 'just now';
  if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  return `${Math.floor(age / 3_600_000)}h ago`;
}

function adapterBridgeState(adapter: any): any | null {
  try {
    if (adapter && typeof adapter.getECSBridgeState === 'function') {
      return adapter.getECSBridgeState();
    }
  } catch {}
  return null;
}

function adapterLastTelemetry(adapter: any): BluTelemetry | null {
  try {
    if (adapter && typeof adapter.getLastTelemetry === 'function') {
      return (adapter.getLastTelemetry() ?? null) as BluTelemetry | null;
    }
  } catch {}
  return null;
}

function adapterSnapshot(adapter: any): any | null {
  try {
    if (adapter && typeof adapter.getState === 'function') {
      return adapter.getState();
    }
  } catch {}
  return null;
}

function resolveBluDevices(): BluDevice[] {
  try {
    if (typeof bluDeviceRegistry.getAll === 'function') {
      return bluDeviceRegistry.getAll();
    }
  } catch {}
  return [];
}

function resolvePrimaryBluDevice(devices: BluDevice[]): BluDevice | null {
  try {
    if (typeof bluDeviceRegistry.getPrimary === 'function') {
      return bluDeviceRegistry.getPrimary() ?? null;
    }
  } catch {}
  return devices.find((device) => (device as any)?.is_primary) ?? devices[0] ?? null;
}

class BluPowerAuthority {
  private listeners = new Set<BluAuthorityListener>();
  private eventListeners = new Set<BluAuthorityEventListener>();
  private providerUnsubs: Array<() => void> = [];
  private stateStoreUnsub: (() => void) | null = null;
  private registryUnsub: (() => void) | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeProvider: BluProviderKey | null = null;
  private lastSnapshot: BluAuthoritySnapshot = this.buildSnapshot();
  private started = false;

  constructor() {
    this.start();
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const bind = (provider: BluProviderKey, adapter: any) => {
      if (!adapter) return;
      const offFns: Array<() => void> = [];
      const watch = (eventName: string) => {
        if (typeof adapter.on === 'function') {
          const unsub = adapter.on(eventName, () => this.handleProviderSignal(provider, eventName));
          if (typeof unsub === 'function') offFns.push(unsub);
        } else if (typeof adapter.addListener === 'function') {
          const maybeSub = adapter.addListener(eventName, () => this.handleProviderSignal(provider, eventName));
          if (maybeSub && typeof maybeSub.remove === 'function') {
            offFns.push(() => maybeSub.remove());
          }
        } else if (typeof adapter.subscribeEvent === 'function') {
          const unsub = adapter.subscribeEvent((event: any) => {
            if (event?.type === eventName) this.handleProviderSignal(provider, eventName);
          });
          if (typeof unsub === 'function') offFns.push(unsub);
        }
      };

      [
        'connected',
        'disconnected',
        'reconnecting',
        'reconnect_success',
        'reconnect_failed',
        'telemetry',
        'data',
        'status',
      ].forEach(watch);

      this.providerUnsubs.push(() => offFns.forEach((fn) => {
        try { fn(); } catch {}
      }));
    };

    bind('ecoflow', ecoFlowBluAdapter);
    bind('bluetti', bluettiBluAdapter);
    bind('anker_solix', ankerSolixBluAdapter);
    bind('goal_zero', goalZeroBluAdapter);
    bind('jackery', jackeryBluAdapter);
    bind('renogy', renogyBluAdapter);
    bind('redarc', redarcBluAdapter);
    bind('dakota_lithium', dakotaLithiumBluAdapter);

    try {
      this.stateStoreUnsub = bluStateStore.subscribe(() => {
        this.refresh('status', this.activeProvider);
      });
    } catch {}

    try {
      this.registryUnsub = bluDeviceRegistry.subscribe(() => {
        this.refresh('status', this.activeProvider);
      });
    } catch {}

    this.refresh('status', null);
  }

  stop(): void {
    for (const unsub of this.providerUnsubs) {
      try { unsub(); } catch {}
    }
    this.providerUnsubs = [];

    if (this.stateStoreUnsub) {
      try { this.stateStoreUnsub(); } catch {}
      this.stateStoreUnsub = null;
    }

    if (this.registryUnsub) {
      try { this.registryUnsub(); } catch {}
      this.registryUnsub = null;
    }

    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }

    this.started = false;
  }

  subscribe(listener: BluAuthorityListener): () => void {
    this.listeners.add(listener);
    listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  on(listener: BluAuthorityEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  addListener(listener: BluAuthorityEventListener): { remove: () => void } {
    const off = this.on(listener);
    return { remove: off };
  }

  off(listener: BluAuthorityEventListener): void {
    this.eventListeners.delete(listener);
  }

  getSnapshot(): BluAuthoritySnapshot {
    return this.lastSnapshot;
  }

  getECSBridgeState(): BluAuthoritySnapshot {
    return this.getSnapshot();
  }

  getActiveProvider(): BluProviderKey | null {
    return this.lastSnapshot.activeProvider;
  }

  getPrimaryTelemetry(): BluTelemetry | null {
    return this.lastSnapshot.primaryTelemetry;
  }

  getPrimaryDevice(): BluDevice | null {
    return this.lastSnapshot.primaryDevice;
  }

  hasLivePower(): boolean {
    return this.lastSnapshot.freshness === 'live';
  }

  private getAdapter(provider: BluProviderKey): any {
    switch (provider) {
      case 'ecoflow': return ecoFlowBluAdapter;
      case 'bluetti': return bluettiBluAdapter;
      case 'anker_solix': return ankerSolixBluAdapter;
      case 'goal_zero': return goalZeroBluAdapter;
      case 'jackery': return jackeryBluAdapter;
      case 'renogy': return renogyBluAdapter;
      case 'redarc': return redarcBluAdapter;
      case 'dakota_lithium': return dakotaLithiumBluAdapter;
    }
  }

  private handleProviderSignal(provider: BluProviderKey, eventName: string): void {
    const typeMap: Record<string, BluAuthorityProviderEvent['type'] | 'telemetry' | 'status'> = {
      connected: 'connected',
      disconnected: 'disconnected',
      reconnecting: 'reconnecting',
      reconnect_success: 'reconnect_success',
      reconnect_failed: 'reconnect_failed',
      telemetry: 'telemetry',
      data: 'telemetry',
      status: 'status',
    };

    const mapped = typeMap[eventName] ?? 'status';
    this.refresh(mapped, provider);
  }

  private refresh(
    eventType: BluAuthorityProviderEvent['type'] | 'telemetry' | 'status',
    provider: BluProviderKey | null,
  ): void {
    const previousProvider = this.activeProvider;
    const snapshot = this.buildSnapshot();
    this.lastSnapshot = snapshot;
    this.activeProvider = snapshot.activeProvider;

    this.scheduleFreshnessTick(snapshot.lastUpdatedAt);

    for (const listener of this.listeners) {
      try { listener(snapshot); } catch {}
    }

    if (previousProvider !== snapshot.activeProvider) {
      this.emitEvent({ type: 'provider_changed', provider: snapshot.activeProvider, snapshot });
    }

    if (eventType === 'telemetry') {
      this.emitEvent({ type: 'telemetry', telemetry: snapshot.primaryTelemetry, snapshot });
      return;
    }

    if (eventType === 'status') {
      this.emitEvent({ type: 'status', snapshot });
      return;
    }

    this.emitEvent({ type: eventType, provider, snapshot });
  }

  private emitEvent(event: BluAuthorityEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch {}
    }
  }

  private scheduleFreshnessTick(lastUpdatedAt: number | null): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    if (!lastUpdatedAt) return;

    const age = Date.now() - lastUpdatedAt;
    const nextBoundary = age < FRESH_WINDOW_MS
      ? FRESH_WINDOW_MS - age + 250
      : age < STALE_WINDOW_MS
        ? STALE_WINDOW_MS - age + 250
        : null;

    if (nextBoundary == null || nextBoundary <= 0) return;
    this.staleTimer = setTimeout(() => this.refresh('status', this.activeProvider), nextBoundary);
  }

  private buildSnapshot(): BluAuthoritySnapshot {
    const devices = resolveBluDevices();
    const primaryDevice = resolvePrimaryBluDevice(devices);
    const latestTelemetry = ((bluStateStore as any).getLatestTelemetry?.() ?? null) as BluTelemetry | null;

    const adapterTelemetry: Partial<Record<BluProviderKey, BluTelemetry | null>> = {
      ecoflow: adapterLastTelemetry(ecoFlowBluAdapter),
      bluetti: adapterLastTelemetry(bluettiBluAdapter),
      anker_solix: adapterLastTelemetry(ankerSolixBluAdapter),
      goal_zero: adapterLastTelemetry(goalZeroBluAdapter),
      jackery: adapterLastTelemetry(jackeryBluAdapter),
      renogy: adapterLastTelemetry(renogyBluAdapter),
      redarc: adapterLastTelemetry(redarcBluAdapter),
      dakota_lithium: adapterLastTelemetry(dakotaLithiumBluAdapter),
    };

    const providers = {} as Record<BluProviderKey, BluAuthorityProviderState>;

    for (const provider of PROVIDERS) {
      const adapter = this.getAdapter(provider);
      const bridge = adapterBridgeState(adapter);
      const snap = adapterSnapshot(adapter);
      const providerDevices = devices.filter((d) => d.provider === provider);
      const primary = providerDevices.find((d) => d.is_primary) ?? providerDevices[0] ?? null;
      const telemetry = adapterTelemetry[provider] ?? null;
      const lastTelemetryAt = telemetry?.timestamp ?? null;
      const connectionState =
        (bridge?.connectionState ??
          snap?.connectionState ??
          primary?.connection_state ??
          'unknown') as BluConnectionState | 'unknown';
      const isReconnecting = Boolean(bridge?.isReconnecting ?? snap?.isReconnecting ?? false);
      const ageMs = lastTelemetryAt ? Date.now() - lastTelemetryAt : null;
      const freshness = freshnessFromAge(ageMs, connectionState, isReconnecting, Boolean(telemetry));

      providers[provider] = {
        provider,
        connectionState,
        isReconnecting,
        hasDevices: providerDevices.length > 0,
        deviceCount: providerDevices.length,
        primaryDeviceId: primary?.device_id ?? null,
        lastTelemetryAt,
        freshness,
      };
    }

    const activeProvider = this.selectActiveProvider(primaryDevice, providers, latestTelemetry);
    const primaryTelemetry = activeProvider
      ? (adapterTelemetry[activeProvider] ?? (latestTelemetry?.provider === activeProvider ? latestTelemetry : null))
      : latestTelemetry;

    const resolvedPrimaryDevice = activeProvider
      ? (devices.find((device) => device.provider === activeProvider && device.is_primary) ??
         devices.find((device) => device.provider === activeProvider) ??
         primaryDevice)
      : primaryDevice;

    const chosenProviderState = activeProvider ? providers[activeProvider] : null;
    const lastUpdatedAt = primaryTelemetry?.timestamp ?? null;
    const freshness = chosenProviderState?.freshness ?? 'disconnected';

    return {
      activeProvider,
      providers,
      primaryDevice: resolvedPrimaryDevice ?? null,
      primaryTelemetry: primaryTelemetry ?? null,
      latestTelemetry: latestTelemetry ?? null,
      connectionState: chosenProviderState?.connectionState ?? 'unknown',
      freshness,
      isConnected: chosenProviderState?.connectionState === 'connected',
      isReconnecting: chosenProviderState?.isReconnecting ?? false,
      hasPowerData: Boolean(primaryTelemetry),
      batteryPercent: nullNumber(primaryTelemetry?.battery_percent),
      inputWatts: nullNumber(primaryTelemetry?.input_watts),
      outputWatts: nullNumber(primaryTelemetry?.output_watts),
      solarInputWatts: nullNumber(primaryTelemetry?.solar_input_watts),
      dcOutputWatts: nullNumber(primaryTelemetry?.dc_output_watts),
      acOutputWatts: nullNumber(primaryTelemetry?.ac_output_watts),
      batteryVolts: nullNumber(primaryTelemetry?.battery_volts),
      batteryAmps: nullNumber((primaryTelemetry as any)?.battery_amps),
      batteryWatts: nullNumber(primaryTelemetry?.battery_watts),
      temperatureCelsius: nullNumber(primaryTelemetry?.temperature_celsius),
      estimatedRuntimeMinutes: nullNumber(primaryTelemetry?.estimated_runtime_minutes),
      capacityWh: nullNumber(primaryTelemetry?.capacity_wh),
      chargeCycles: nullNumber((primaryTelemetry as any)?.charge_cycles),
      inverterOn: nullBool(primaryTelemetry?.inverter_on),
      deviceLabel: resolvedPrimaryDevice?.display_name ?? null,
      providerLabel: activeProvider ? PROVIDER_LABELS[activeProvider] : null,
      lastUpdatedAt,
      freshnessText: getFreshnessText(lastUpdatedAt),
    };
  }

  private selectActiveProvider(
    primaryDevice: BluDevice | null,
    providers: Record<BluProviderKey, BluAuthorityProviderState>,
    latestTelemetry: BluTelemetry | null,
  ): BluProviderKey | null {
    if (primaryDevice?.provider && PROVIDERS.includes(primaryDevice.provider as BluProviderKey)) {
      return primaryDevice.provider as BluProviderKey;
    }

    if (latestTelemetry?.provider && PROVIDERS.includes(latestTelemetry.provider as BluProviderKey)) {
      return latestTelemetry.provider as BluProviderKey;
    }

    const live = PROVIDERS.find((provider) => providers[provider].freshness === 'live');
    if (live) return live;

    const reconnecting = PROVIDERS.find((provider) => providers[provider].freshness === 'reconnecting');
    if (reconnecting) return reconnecting;

    const lastKnown = PROVIDERS.find((provider) => providers[provider].freshness === 'last_known');
    if (lastKnown) return lastKnown;

    const stale = PROVIDERS.find((provider) => providers[provider].freshness === 'stale');
    if (stale) return stale;

    const connected = PROVIDERS.find((provider) => providers[provider].connectionState === 'connected');
    if (connected) return connected;

    const withDevices = PROVIDERS.find((provider) => providers[provider].hasDevices);
    return withDevices ?? null;
  }
}

export const bluPowerAuthority = new BluPowerAuthority();

export default bluPowerAuthority;
