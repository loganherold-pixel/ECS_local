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
 * Storage: localStorage (web) / in-memory (native).
 * Thread-safe via write queue serialisation.
 */

import { Platform } from 'react-native';

// ── Types ───────────────────────────────────────────────────────────────

export type PowerProviderId =
  | 'EcoFlow'
  | 'Bluetti'
  | 'AnkerSolix'
  | 'Jackery'
  | 'GoalZero'
  | 'Renogy';

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
  { label: string; color: string; icon: string; subtitle: string }
> = {
  EcoFlow: {
    label: 'EcoFlow',
    color: '#00A6FF',
    icon: 'flash',
    subtitle: 'Portable Power Station',
  },
  Bluetti: {
    label: 'Bluetti',
    color: '#2196F3',
    icon: 'cube',
    subtitle: 'Battery System',
  },
  AnkerSolix: {
    label: 'Anker SOLIX',
    color: '#00C4B4',
    icon: 'battery-charging',
    subtitle: 'Portable Power Station',
  },
  Jackery: {
    label: 'Jackery',
    color: '#FF8C00',
    icon: 'sunny',
    subtitle: 'Solar Generator',
  },
  GoalZero: {
    label: 'Goal Zero',
    color: '#4CAF50',
    icon: 'compass',
    subtitle: 'Power Station',
  },
  Renogy: {
    label: 'Renogy',
    color: '#9C27B0',
    icon: 'hardware-chip',
    subtitle: 'Battery System',
  },
};

export interface ManagedPowerDevice {
  id: string;
  provider: PowerProviderId;
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
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return memoryStore[key] ?? null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  memoryStore[key] = value;
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

  private persist(): void {
    if (this.cache === null) return;
    lsSet(STORAGE_KEY, JSON.stringify(this.cache));
  }

  private enqueue(fn: () => void): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => fn());
    return this.writeQueue;
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

  /** Add a new managed device */
  async add(
    device: Omit<
      ManagedPowerDevice,
      'id' | 'connectedAt' | 'lastSeenAt' | 'removed'
    >
  ): Promise<ManagedPowerDevice> {
    const now = new Date().toISOString();
    const newDevice: ManagedPowerDevice = {
      ...device,
      id: generateId(),
      connectedAt: now,
      lastSeenAt: now,
      removed: false,
    };

    await this.enqueue(() => {
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
      this.persist();
      notifyListeners(this.getAll());
    });

    return newDevice;
  }

  /** Update a managed device */
  async update(
    deviceId: string,
    updates: Partial<
      Omit<ManagedPowerDevice, 'id' | 'connectedAt' | 'removed'>
    >
  ): Promise<ManagedPowerDevice | null> {
    let updated: ManagedPowerDevice | null = null;

    await this.enqueue(() => {
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
      this.persist();
      notifyListeners(this.getAll());
    });

    return updated;
  }

  /** Soft-remove a device */
  async remove(deviceId: string): Promise<boolean> {
    let removed = false;

    await this.enqueue(() => {
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
      this.persist();
      notifyListeners(this.getAll());
    });

    return removed;
  }

  /** Hard-delete a device */
  async hardDelete(deviceId: string): Promise<boolean> {
    let deleted = false;

    await this.enqueue(() => {
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
      this.persist();
      notifyListeners(this.getAll());
    });

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

