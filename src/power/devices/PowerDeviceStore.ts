/**
 * PowerDeviceStore — persistent multi-device selection store.
 *
 * Phase 3E-1: Tracks which device IDs the user has selected for each
 * cloud power provider. Persisted locally so selections survive app
 * restarts.
 *
 * Storage strategy:
 *   - Web: localStorage via keyValuePersistence
 *   - Native: file-backed non-secure keyValuePersistence snapshot
 *
 * The store is provider-agnostic: it stores string[] device IDs keyed
 * by PowerProviderId plus safe catalog metadata. It does not know about
 * telemetry, polling, connector internals, tokens, or credentials.
 *
 * Thread-safety: all mutations are serialised through a write queue
 * to prevent concurrent read-modify-write races on the same storage key.
 */

import { createPersistedKeyValueCache } from "../../../lib/keyValuePersistence";
import type { PowerDevice, PowerProviderId } from "../types/PowerDevice";

// ── Public types ────────────────────────────────────────────────────────

/**
 * Map of provider → selected device IDs.
 * A missing key means "no devices selected for that provider".
 */
export type SelectedDevicesState = {
  [provider in PowerProviderId]?: string[];
};

export type PowerDeviceConnectionState = "online" | "offline" | "unknown";

/**
 * Safe device catalog metadata for non-secure local persistence.
 *
 * This intentionally excludes provider tokens, credentials, auth headers,
 * cloud account identifiers, and hardware serial numbers. Cloud/API secrets
 * belong in TokenStore or another secure storage path, never here.
 */
export type PersistedPowerDeviceMetadata = {
  provider: PowerProviderId;
  deviceId: string;
  name?: string | null;
  model?: string | null;
  productType?: string | null;
  lastKnownConnectionState?: PowerDeviceConnectionState | null;
  supportedMetrics?: string[];
  lastSeenAt?: number | null;
  updatedAt: string;
};

export type KnownPowerDevicesState = {
  [provider in PowerProviderId]?: Record<string, PersistedPowerDeviceMetadata>;
};

type PowerDeviceMetadataInput =
  Partial<Omit<PersistedPowerDeviceMetadata, "provider" | "deviceId" | "updatedAt">> &
  Partial<PowerDevice> & {
    provider?: PowerProviderId;
    deviceId?: string;
    updatedAt?: string;
  };

// ── Storage key ─────────────────────────────────────────────────────────

const STORAGE_KEY = "ecs.power.selectedDevices.v1";
const KNOWN_DEVICES_STORAGE_KEY = "ecs.power.knownDevices.v1";
const powerDevicePersistence = createPersistedKeyValueCache("ecs_power_device_store");

// ── Low-level storage helpers ───────────────────────────────────────────

function storageGet(key: string): string | null {
  return powerDevicePersistence.get(key);
}

function storageSet(key: string, value: string): void {
  powerDevicePersistence.set(key, value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return normalizeString(value);
}

function normalizeTimestamp(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function normalizeSupportedMetrics(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeConnectionState(
  value: unknown,
  online: unknown,
): PowerDeviceConnectionState | null | undefined {
  if (value === null) return null;
  if (value === "online" || value === "offline" || value === "unknown") {
    return value;
  }
  if (online === true) return "online";
  if (online === false) return "offline";
  return undefined;
}

function copyKnownDevice(
  device: PersistedPowerDeviceMetadata,
): PersistedPowerDeviceMetadata {
  return {
    ...device,
    supportedMetrics: device.supportedMetrics
      ? [...device.supportedMetrics]
      : undefined,
  };
}

function pickSafePowerDeviceMetadata(
  input: PowerDeviceMetadataInput,
): PersistedPowerDeviceMetadata | null {
  const provider = input.provider;
  const deviceId = normalizeString(input.deviceId);
  if (!provider || !deviceId) return null;

  const metadata: PersistedPowerDeviceMetadata = {
    provider,
    deviceId,
    updatedAt: normalizeString(input.updatedAt) ?? new Date().toISOString(),
  };

  const name = normalizeNullableString(input.name);
  if (name !== undefined) metadata.name = name;

  const model = normalizeNullableString(input.model);
  if (model !== undefined) metadata.model = model;

  const productType = normalizeNullableString(input.productType);
  if (productType !== undefined) metadata.productType = productType;

  const lastKnownConnectionState = normalizeConnectionState(
    input.lastKnownConnectionState,
    input.online,
  );
  if (lastKnownConnectionState !== undefined) {
    metadata.lastKnownConnectionState = lastKnownConnectionState;
  }

  const supportedMetrics = normalizeSupportedMetrics(input.supportedMetrics);
  if (supportedMetrics !== undefined) {
    metadata.supportedMetrics = supportedMetrics;
  }

  const lastSeenAt = normalizeTimestamp(input.lastSeenAt);
  if (lastSeenAt !== undefined) {
    metadata.lastSeenAt = lastSeenAt;
  }

  return metadata;
}

// ── PowerDeviceStore class ──────────────────────────────────────────────

class PowerDeviceStore {
  /**
   * In-memory cache of the full state.
   * Lazily hydrated from storage on first access.
   */
  private cache: SelectedDevicesState | null = null;

  /**
   * In-memory cache of safe provider catalog metadata.
   * Lazily hydrated from storage on first access.
   */
  private metadataCache: KnownPowerDevicesState | null = null;

  /**
   * Write-serialisation queue.
   * Ensures that concurrent async callers don't clobber each other.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  // ── Read helpers ────────────────────────────────────────────────────

  /**
   * Load the full state from storage (or return the cached copy).
   */
  private load(): SelectedDevicesState {
    if (this.cache !== null) return this.cache;

    const raw = storageGet(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          this.cache = parsed as SelectedDevicesState;
          return this.cache;
        }
      } catch {
        // Corrupted data — start fresh
      }
    }

    this.cache = {};
    return this.cache;
  }

  /**
   * Persist the current cache to storage.
   */
  private persist(): void {
    if (this.cache === null) return;
    storageSet(STORAGE_KEY, JSON.stringify(this.cache));
  }

  private loadKnownDevices(): KnownPowerDevicesState {
    if (this.metadataCache !== null) return this.metadataCache;

    const raw = storageGet(KNOWN_DEVICES_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          this.metadataCache = parsed as KnownPowerDevicesState;
          return this.metadataCache;
        }
      } catch {
        // Corrupted data — start fresh
      }
    }

    this.metadataCache = {};
    return this.metadataCache;
  }

  private persistKnownDevices(): void {
    if (this.metadataCache === null) return;
    storageSet(KNOWN_DEVICES_STORAGE_KEY, JSON.stringify(this.metadataCache));
  }

  /**
   * Enqueue a write operation to prevent concurrent mutations.
   */
  private async enqueue(fn: () => void): Promise<void> {
    await this.waitForHydration();
    this.writeQueue = this.writeQueue.then(() => {
      fn();
    });
    return this.writeQueue;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Get the selected device IDs for a given provider.
   * Returns an empty array if nothing is selected.
   */
  async getSelected(provider: PowerProviderId): Promise<string[]> {
    await this.waitForHydration();
    const state = this.load();
    return [...(state[provider] ?? [])];
  }

  /**
   * Replace the selected device IDs for a given provider.
   * Duplicates are automatically removed.
   */
  async setSelected(
    provider: PowerProviderId,
    deviceIds: string[],
  ): Promise<void> {
    return this.enqueue(() => {
      const state = this.load();
      const unique = [...new Set(deviceIds)];
      if (unique.length === 0) {
        delete state[provider];
      } else {
        state[provider] = unique;
      }
      this.persist();
    });
  }

  /**
   * Add a single device ID to the selected set for a provider.
   * No-op if the device is already selected.
   */
  async addSelected(
    provider: PowerProviderId,
    deviceId: string,
  ): Promise<void> {
    return this.enqueue(() => {
      const state = this.load();
      const current = state[provider] ?? [];
      if (current.includes(deviceId)) return; // already selected
      state[provider] = [...current, deviceId];
      this.persist();
    });
  }

  /**
   * Remove a single device ID from the selected set for a provider.
   * No-op if the device is not currently selected.
   */
  async removeSelected(
    provider: PowerProviderId,
    deviceId: string,
  ): Promise<void> {
    return this.enqueue(() => {
      const state = this.load();
      const current = state[provider] ?? [];
      const next = current.filter((id) => id !== deviceId);
      if (next.length === current.length) return; // nothing changed
      if (next.length === 0) {
        delete state[provider];
      } else {
        state[provider] = next;
      }
      this.persist();
    });
  }

  /**
   * Clear all selected devices for a given provider.
   */
  async clearSelected(provider: PowerProviderId): Promise<void> {
    return this.enqueue(() => {
      const state = this.load();
      if (!(provider in state)) return; // nothing to clear
      delete state[provider];
      this.persist();
    });
  }

  /**
   * Get the full selection state across all providers.
   * Returns a deep copy to prevent external mutation.
   */
  async getAll(): Promise<SelectedDevicesState> {
    await this.waitForHydration();
    const state = this.load();
    const copy: SelectedDevicesState = {};
    for (const [key, value] of Object.entries(state)) {
      if (value && value.length > 0) {
        copy[key as PowerProviderId] = [...value];
      }
    }
    return copy;
  }

  /**
   * Persist non-sensitive provider catalog metadata for a known power device.
   * Tokens, credentials, auth headers, account IDs, and serial numbers are
   * intentionally ignored by pickSafePowerDeviceMetadata().
   */
  async upsertKnownDevice(
    device: PowerDeviceMetadataInput,
  ): Promise<PersistedPowerDeviceMetadata | null> {
    let saved: PersistedPowerDeviceMetadata | null = null;

    await this.enqueue(() => {
      const next = pickSafePowerDeviceMetadata(device);
      if (!next) return;

      const state = this.loadKnownDevices();
      const providerDevices = state[next.provider] ?? {};
      const current = providerDevices[next.deviceId];
      const merged: PersistedPowerDeviceMetadata = {
        ...current,
        ...next,
        supportedMetrics: next.supportedMetrics
          ? [...next.supportedMetrics]
          : current?.supportedMetrics
            ? [...current.supportedMetrics]
            : undefined,
        updatedAt: next.updatedAt,
      };

      providerDevices[next.deviceId] = merged;
      state[next.provider] = providerDevices;
      this.persistKnownDevices();
      saved = copyKnownDevice(merged);
    });

    return saved;
  }

  /**
   * Persist a batch of non-sensitive provider catalog metadata.
   */
  async upsertKnownDevices(
    devices: PowerDeviceMetadataInput[],
  ): Promise<PersistedPowerDeviceMetadata[]> {
    const saved: PersistedPowerDeviceMetadata[] = [];

    await this.enqueue(() => {
      const state = this.loadKnownDevices();

      for (const device of devices) {
        const next = pickSafePowerDeviceMetadata(device);
        if (!next) continue;

        const providerDevices = state[next.provider] ?? {};
        const current = providerDevices[next.deviceId];
        const merged: PersistedPowerDeviceMetadata = {
          ...current,
          ...next,
          supportedMetrics: next.supportedMetrics
            ? [...next.supportedMetrics]
            : current?.supportedMetrics
              ? [...current.supportedMetrics]
              : undefined,
          updatedAt: next.updatedAt,
        };

        providerDevices[next.deviceId] = merged;
        state[next.provider] = providerDevices;
        saved.push(copyKnownDevice(merged));
      }

      if (saved.length > 0) {
        this.persistKnownDevices();
      }
    });

    return saved;
  }

  /**
   * Get safe known-device metadata for a provider/device pair.
   */
  async getKnownDevice(
    provider: PowerProviderId,
    deviceId: string,
  ): Promise<PersistedPowerDeviceMetadata | null> {
    await this.waitForHydration();
    const normalizedDeviceId = normalizeString(deviceId);
    if (!normalizedDeviceId) return null;

    const state = this.loadKnownDevices();
    const device = state[provider]?.[normalizedDeviceId];
    return device ? copyKnownDevice(device) : null;
  }

  /**
   * Get all safe known-device metadata, optionally scoped to one provider.
   */
  async getKnownDevices(
    provider?: PowerProviderId,
  ): Promise<PersistedPowerDeviceMetadata[]> {
    await this.waitForHydration();
    const state = this.loadKnownDevices();
    const buckets = provider ? [state[provider] ?? {}] : Object.values(state);
    return buckets.flatMap((bucket) =>
      Object.values(bucket ?? {}).map(copyKnownDevice),
    );
  }

  /**
   * Clear safe known-device metadata. Selection state is not changed.
   */
  async clearKnownDevices(provider?: PowerProviderId): Promise<void> {
    return this.enqueue(() => {
      const state = this.loadKnownDevices();
      if (provider) {
        if (!(provider in state)) return;
        delete state[provider];
      } else {
        this.metadataCache = {};
      }
      this.persistKnownDevices();
    });
  }

  /**
   * Clear all selections across all providers.
   */
  async clearAll(): Promise<void> {
    return this.enqueue(() => {
      this.cache = {};
      this.persist();
    });
  }

  /**
   * Check whether a specific device is selected for a provider.
   */
  async isSelected(
    provider: PowerProviderId,
    deviceId: string,
  ): Promise<boolean> {
    await this.waitForHydration();
    const state = this.load();
    return (state[provider] ?? []).includes(deviceId);
  }

  /**
   * Get the total number of selected devices across all providers.
   */
  async totalSelectedCount(): Promise<number> {
    await this.waitForHydration();
    const state = this.load();
    let count = 0;
    for (const ids of Object.values(state)) {
      if (ids) count += ids.length;
    }
    return count;
  }

  /**
   * Force a reload from storage on next access.
   * Useful after external storage changes (e.g. sync).
   */
  invalidateCache(): void {
    this.cache = null;
    this.metadataCache = null;
  }

  /**
   * Wait for native file-backed hydration before reading during startup/tests.
   */
  waitForHydration(): Promise<void> {
    return powerDevicePersistence.waitForHydration();
  }

  /**
   * Flush pending native file writes. Web writes are already synchronous.
   */
  flush(): Promise<void> {
    return powerDevicePersistence.flush();
  }

  isHydrated(): boolean {
    return powerDevicePersistence.isHydrated();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const powerDeviceStore = new PowerDeviceStore();

