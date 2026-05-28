import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

export type BluetoothAccessoryOwner = 'sensor' | 'generic';

export type BluetoothAccessoryConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export interface BluetoothAccessoryRecord {
  deviceId: string;
  displayName: string;
  providerLabel: string;
  providerId: string;
  categoryHint: string;
  owner: BluetoothAccessoryOwner;
  connectionState: BluetoothAccessoryConnectionState;
  supportLabel: string;
  supportNote: string | null;
  signalStrength: number | null;
  serviceUuids?: string[];
  manufacturerData?: string | null;
  localName?: string | null;
  utilitySensorTelemetry?: {
    levelPercent: number | null;
    parserStatus: 'live' | 'awaiting_level' | 'unsupported';
    decodedAt: number | null;
    source: string | null;
  } | null;
  lastSeenAt: string;
  connectedAt: string | null;
  lastError: string | null;
}

type BluetoothAccessoryUpsertInput = Omit<
  BluetoothAccessoryRecord,
  'lastSeenAt' | 'connectedAt'
> & {
  lastSeenAt?: string;
  connectedAt?: string | null;
};

type ChangeListener = (devices: BluetoothAccessoryRecord[]) => void;

const STORAGE_KEY = 'ecs.bluetooth.accessories.v1';
const accessoryPersistenceCache = createPersistedKeyValueCache('ecs_bluetooth_accessories');
const listeners = new Set<ChangeListener>();

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return accessoryPersistenceCache.get(key);
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  accessoryPersistenceCache.set(key, value);
}

async function ensureStorageHydrated(): Promise<void> {
  await accessoryPersistenceCache.waitForHydration();
}

async function flushStorage(): Promise<void> {
  await accessoryPersistenceCache.flush();
}

function notifyListeners(devices: BluetoothAccessoryRecord[]) {
  listeners.forEach((listener) => {
    try {
      listener(devices);
    } catch {}
  });
}

class BluetoothAccessoryRegistryImpl {
  private cache: BluetoothAccessoryRecord[] | null = null;
  private hydrationPromise: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.hydrationPromise = ensureStorageHydrated()
      .then(() => {
        this.cache = null;
        notifyListeners(this.getAll());
      })
      .catch((error) => {
        console.warn('[BluetoothAccessoryRegistry] Hydration failed:', error);
      });
  }

  private load(): BluetoothAccessoryRecord[] {
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
    await flushStorage();
  }

  private enqueue(fn: () => Promise<void> | void): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => Promise.resolve(fn()));
    return this.writeQueue;
  }

  async waitForHydration(): Promise<void> {
    await this.hydrationPromise;
  }

  subscribe(listener: ChangeListener): () => void {
    listeners.add(listener);
    listener(this.getAll());
    return () => {
      listeners.delete(listener);
    };
  }

  getAll(): BluetoothAccessoryRecord[] {
    return [...this.load()].sort((left, right) => {
      if (left.connectionState === 'connected' && right.connectionState !== 'connected') return -1;
      if (right.connectionState === 'connected' && left.connectionState !== 'connected') return 1;
      return left.displayName.localeCompare(right.displayName);
    });
  }

  getByDeviceId(deviceId: string): BluetoothAccessoryRecord | null {
    return this.load().find((entry) => entry.deviceId === deviceId) ?? null;
  }

  async upsert(input: BluetoothAccessoryUpsertInput): Promise<BluetoothAccessoryRecord> {
    await this.waitForHydration();

    const now = new Date().toISOString();
    let nextRecord: BluetoothAccessoryRecord = {
      ...input,
      lastSeenAt: input.lastSeenAt ?? now,
      connectedAt:
        input.connectionState === 'connected'
          ? input.connectedAt ?? now
          : input.connectedAt ?? null,
    };

    await this.enqueue(async () => {
      const devices = this.load();
      const index = devices.findIndex((entry) => entry.deviceId === input.deviceId);
      const existing = index >= 0 ? devices[index] : null;
      nextRecord = {
        deviceId: input.deviceId,
        displayName: input.displayName,
        providerLabel: input.providerLabel,
        providerId: input.providerId,
        categoryHint: input.categoryHint,
        owner: input.owner,
        connectionState: input.connectionState,
        supportLabel: input.supportLabel,
        supportNote: input.supportNote,
        signalStrength: input.signalStrength,
        serviceUuids: input.serviceUuids ?? existing?.serviceUuids ?? [],
        manufacturerData: input.manufacturerData ?? existing?.manufacturerData ?? null,
        localName: input.localName ?? existing?.localName ?? null,
        utilitySensorTelemetry: input.utilitySensorTelemetry ?? existing?.utilitySensorTelemetry ?? null,
        lastSeenAt: input.lastSeenAt ?? now,
        connectedAt:
          input.connectionState === 'connected'
            ? existing?.connectedAt ?? input.connectedAt ?? now
            : existing?.connectedAt ?? input.connectedAt ?? null,
        lastError: input.lastError,
      };

      if (index >= 0) {
        devices[index] = nextRecord;
      } else {
        devices.push(nextRecord);
      }

      this.cache = devices;
      await this.persist();
    });

    notifyListeners(this.getAll());
    return nextRecord;
  }
}

export const bluetoothAccessoryRegistry = new BluetoothAccessoryRegistryImpl();
