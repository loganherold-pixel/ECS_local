/**
 * PowerSetupStore — Persistent store for ECS managed power devices.
 *
 * Tracks:
 *   - Device identity (id, provider, model, name)
 *   - Custom user name & role assignment
 *   - Vehicle assignment
 *   - Connection method (BLE / Cloud / Manual)
 *   - Connection state & last seen timestamp
 *   - Last known telemetry snapshot
 *
 * Storage: localStorage (web) / durable native file cache.
 * Thread-safe via write queue serialisation.
 */

import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

// ── Types ───────────────────────────────────────────────────────────────

export type PowerProviderId =
  | 'EcoFlow'
  | 'Bluetti'
  | 'AnkerSolix'
  | 'Jackery'
  | 'GoalZero'
  | 'Renogy'
  | 'Redarc'
  | 'DakotaLithium';

export type ProviderSupportLevel =
  | 'verified'
  | 'implemented_unverified'
  | 'partial'
  | 'ui_only';

export type ConnectionMethod = 'ble' | 'cloud' | 'manual';

export type ConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unavailable';

export type DeviceRole =
  | 'primary_house'
  | 'portable'
  | 'auxiliary'
  | 'solar_source'
  | 'unassigned';

export const DEVICE_ROLE_LABELS: Record<DeviceRole, string> = {
  primary_house: 'Primary House Battery',
  portable: 'Portable Power Station',
  auxiliary: 'Auxiliary Battery',
  solar_source: 'Solar Charging Source',
  unassigned: 'Unassigned',
};

export const PROVIDER_DISPLAY: Record<
  PowerProviderId,
  {
    label: string;
    color: string;
    icon: string;
    subtitle: string;
    supportLevel: ProviderSupportLevel;
    supportLabel: string;
    supportNote: string;
    connectionMethod: string;
  }
> = {
  EcoFlow: {
    label: 'EcoFlow',
    color: '#00A6FF',
    icon: 'flash',
    subtitle: 'Portable Power Station',
    supportLevel: 'verified',
    supportLabel: 'Verified',
    supportNote: 'Cloud metadata and local scanner support are tracked separately.',
    connectionMethod: 'Cloud API / local scanner',
  },
  Bluetti: {
    label: 'Bluetti',
    color: '#2196F3',
    icon: 'cube',
    subtitle: 'Battery System',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  AnkerSolix: {
    label: 'Anker SOLIX',
    color: '#00C4B4',
    icon: 'battery-charging',
    subtitle: 'Portable Power Station',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  Jackery: {
    label: 'Jackery',
    color: '#FF8C00',
    icon: 'sunny',
    subtitle: 'Solar Generator',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  GoalZero: {
    label: 'Goal Zero',
    color: '#4CAF50',
    icon: 'compass',
    subtitle: 'Power Station',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  Renogy: {
    label: 'Renogy',
    color: '#9C27B0',
    icon: 'hardware-chip',
    subtitle: 'Battery System',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  Redarc: {
    label: 'REDARC',
    color: '#C62828',
    icon: 'car',
    subtitle: 'Direct Bluetooth Telemetry',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
  DakotaLithium: {
    label: 'Dakota Lithium',
    color: '#6FBF4B',
    icon: 'shield',
    subtitle: 'Bluetooth Battery Monitor',
    supportLevel: 'ui_only',
    supportLabel: 'Parser pending',
    supportNote: 'Recognized by Bluestack; native BLE telemetry parser still needs field validation before live readings are promoted.',
    connectionMethod: 'Native BLE pending',
  },
};

export interface ManagedPowerDevice {
  id: string;
  provider: PowerProviderId;
  providerDeviceId?: string | null;
  connectionMethod: ConnectionMethod;
  /** Original device name from provider */
  originalName: string;
  /** User-assigned custom name */
  customName: string;
  /** Device model (e.g. "DELTA 3 Plus") */
  model: string;
  /** Assigned role */
  role: DeviceRole;
  /** Assigned vehicle ID (null = global) */
  vehicleId: string | null;
  /** Whether this is the primary power system */
  isPrimary: boolean;
  /** Connection state */
  connectionState: ConnectionState;
  /** Last known battery SOC */
  lastSocPct: number | null;
  /** Last known input watts */
  lastWattsIn: number | null;
  /** Last known output watts */
  lastWattsOut: number | null;
  /** BLE signal strength (if BLE) */
  signalStrength: number | null;
  /** Timestamp of first connection */
  connectedAt: string;
  /** Timestamp of last telemetry update */
  lastSeenAt: string;
  /** Whether device was explicitly removed (soft delete) */
  removed: boolean;
}

// ── Storage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ecs.power.managedDevices.v1';
const powerSetupPersistenceCache = createPersistedKeyValueCache('ecs_power_setup_store');

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return powerSetupPersistenceCache.get(key);
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  powerSetupPersistenceCache.set(key, value);
}

async function ensurePowerSetupStorageHydrated(): Promise<void> {
  await powerSetupPersistenceCache.waitForHydration();
}

async function flushPowerSetupStorage(): Promise<void> {
  await powerSetupPersistenceCache.flush();
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Change listeners ────────────────────────────────────────────────────

type ChangeListener = (devices: ManagedPowerDevice[]) => void;
const listeners: Set<ChangeListener> = new Set();

function notifyListeners(devices: ManagedPowerDevice[]) {
  listeners.forEach((fn) => {
    try {
      fn(devices);
    } catch {}
  });
}

// ── Store ───────────────────────────────────────────────────────────────

class PowerSetupStoreImpl {
  private cache: ManagedPowerDevice[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private hydrationPromise: Promise<void>;

  constructor() {
    this.hydrationPromise = ensurePowerSetupStorageHydrated()
      .then(() => {
        this.cache = null;
        notifyListeners(this.getAll());
      })
      .catch((error) => {
        console.warn('[PowerSetupStore] Native hydration failed:', error);
      });
  }

  private load(): ManagedPowerDevice[] {
    if (this.cache !== null) return this.cache;
    const raw = lsGet(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.cache = parsed;
          return this.cache;
        }
      } catch {}
    }
    this.cache = [];
    return this.cache;
  }

  private async persist(): Promise<void> {
    if (this.cache === null) return;
    lsSet(STORAGE_KEY, JSON.stringify(this.cache));
    await flushPowerSetupStorage();
  }

  private enqueue(fn: () => Promise<void> | void): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => Promise.resolve(fn()));
    return this.writeQueue;
  }

  async waitForHydration(): Promise<void> {
    await this.hydrationPromise;
  }

  /** Subscribe to device list changes */
  subscribe(fn: ChangeListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  /** Get all active (non-removed) managed devices */
  getAll(): ManagedPowerDevice[] {
    return this.load().filter((d) => !d.removed);
  }

  /** Get a single device by ID */
  getById(deviceId: string): ManagedPowerDevice | null {
    return this.load().find((d) => d.id === deviceId && !d.removed) ?? null;
  }

  /** Get the primary device */
  getPrimary(): ManagedPowerDevice | null {
    const devices = this.getAll();
    return devices.find((d) => d.isPrimary) ?? devices[0] ?? null;
  }

  /** Get devices for a specific vehicle */
  getByVehicle(vehicleId: string): ManagedPowerDevice[] {
    return this.getAll().filter((d) => d.vehicleId === vehicleId);
  }

  /** Get devices by provider */
  getByProvider(provider: PowerProviderId): ManagedPowerDevice[] {
    return this.getAll().filter((d) => d.provider === provider);
  }

  /** Get a device by stable provider-owned device identifier */
  getByProviderDevice(
    provider: PowerProviderId,
    providerDeviceId: string,
  ): ManagedPowerDevice | null {
    return this.getAll().find((d) => (
      d.provider === provider && d.providerDeviceId === providerDeviceId
    )) ?? null;
  }

  /** Add a new managed device */
  async add(
    device: Omit<
      ManagedPowerDevice,
      'id' | 'connectedAt' | 'lastSeenAt' | 'removed'
    >
  ): Promise<ManagedPowerDevice> {
    await this.waitForHydration();
    const now = new Date().toISOString();
    const newDevice: ManagedPowerDevice = {
      ...device,
      id: generateId(),
      connectedAt: now,
      lastSeenAt: now,
      removed: false,
    };

    await this.enqueue(async () => {
      const devices = this.load();
      // If this is primary, unset other primaries
      if (newDevice.isPrimary) {
        devices.forEach((d) => {
          d.isPrimary = false;
        });
      }
      // If this is the first device, make it primary
      const activeDevices = devices.filter((d) => !d.removed);
      if (activeDevices.length === 0) {
        newDevice.isPrimary = true;
      }
      devices.push(newDevice);
      await this.persist();
    });

    notifyListeners(this.getAll());
    return newDevice;
  }

  /** Update a managed device */
  async update(
    deviceId: string,
    updates: Partial<
      Omit<ManagedPowerDevice, 'id' | 'connectedAt' | 'removed'>
    >
  ): Promise<ManagedPowerDevice | null> {
    await this.waitForHydration();
    let updated: ManagedPowerDevice | null = null;

    await this.enqueue(async () => {
      const devices = this.load();
      const idx = devices.findIndex((d) => d.id === deviceId);
      if (idx === -1) return;

      // If setting as primary, unset others
      if (updates.isPrimary) {
        devices.forEach((d) => {
          d.isPrimary = false;
        });
      }

      devices[idx] = {
        ...devices[idx],
        ...updates,
        lastSeenAt: new Date().toISOString(),
      };
      updated = devices[idx];
      await this.persist();
    });

    notifyListeners(this.getAll());
    return updated;
  }

  /** Soft-remove a device */
  async remove(deviceId: string): Promise<boolean> {
    await this.waitForHydration();
    let removed = false;

    await this.enqueue(async () => {
      const devices = this.load();
      const idx = devices.findIndex((d) => d.id === deviceId);
      if (idx === -1) return;

      const wasPrimary = devices[idx].isPrimary;
      devices[idx].removed = true;
      devices[idx].isPrimary = false;

      // If removed device was primary, assign next available
      if (wasPrimary) {
        const active = devices.filter((d) => !d.removed);
        if (active.length > 0) {
          active[0].isPrimary = true;
        }
      }

      removed = true;
      await this.persist();
    });

    notifyListeners(this.getAll());
    return removed;
  }

  /** Hard-delete a device */
  async hardDelete(deviceId: string): Promise<boolean> {
    await this.waitForHydration();
    let deleted = false;

    await this.enqueue(async () => {
      const devices = this.load();
      const idx = devices.findIndex((d) => d.id === deviceId);
      if (idx === -1) return;

      const wasPrimary = devices[idx].isPrimary;
      devices.splice(idx, 1);

      if (wasPrimary) {
        const active = devices.filter((d) => !d.removed);
        if (active.length > 0) {
          active[0].isPrimary = true;
        }
      }

      deleted = true;
      this.cache = devices;
      await this.persist();
    });

    notifyListeners(this.getAll());
    return deleted;
  }

  /** Set a device as primary */
  async setPrimary(deviceId: string): Promise<void> {
    await this.update(deviceId, { isPrimary: true });
  }

  /** Update connection state for a device */
  async setConnectionState(
    deviceId: string,
    state: ConnectionState
  ): Promise<void> {
    await this.update(deviceId, { connectionState: state });
  }

  /** Update telemetry snapshot */
  async updateTelemetry(
    deviceId: string,
    telemetry: {
      socPct?: number | null;
      wattsIn?: number | null;
      wattsOut?: number | null;
    }
  ): Promise<void> {
    await this.update(deviceId, {
      lastSocPct: telemetry.socPct ?? null,
      lastWattsIn: telemetry.wattsIn ?? null,
      lastWattsOut: telemetry.wattsOut ?? null,
    });
  }

  /** Get total count of active devices */
  count(): number {
    return this.getAll().length;
  }

  /** Check if any devices are connected */
  hasConnected(): boolean {
    return this.getAll().some((d) => d.connectionState === 'connected');
  }

  /** Invalidate cache */
  invalidate(): void {
    this.cache = null;
  }
}

export const powerSetupStore = new PowerSetupStoreImpl();

