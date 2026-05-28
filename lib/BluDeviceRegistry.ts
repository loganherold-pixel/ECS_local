/**
 * BluDeviceRegistry — persistent multi-device registry for BLU.
 *
 * Tracks one or more connected power devices per user account.
 * Supports a primary-device concept so ECS can choose a default
 * live power source for dashboard widgets.
 *
 * Persistence: localStorage (web) / in-memory fallback (native).
 * Thread-safety: all mutations serialised through a write queue.
 *
 * Phase 1A — foundation only.
 * Phase 1D — deduplication, merge on rediscovery, fallback primary logic,
 *            most-recently-seen promotion, stale device detection.
 */

import { Platform } from 'react-native';
import type {
  BluDevice,
  BluProviderId,
  BluConnectionState,
  BluDeviceCapabilities,
} from './BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from './BluTypes';
import { createPersistedKeyValueCache } from './keyValuePersistence';

// ── Storage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ecs.blu.devices.v1';
const bluDevicePersistenceCache = createPersistedKeyValueCache('ecs_blu_devices');

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      /* quota / private browsing */
    }
  }
  return bluDevicePersistenceCache.get(key);
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* swallow */
    }
  }
  bluDevicePersistenceCache.set(key, value);
}

// ── Subscriber type ─────────────────────────────────────────────────────

type RegistrySubscriber = () => void;

// ── Registry Class ──────────────────────────────────────────────────────

class BluDeviceRegistry {
  private cache: BluDevice[] | null = null;
  private hydrationPromise: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private subscribers = new Set<RegistrySubscriber>();

  constructor() {
    this.hydrationPromise = bluDevicePersistenceCache.waitForHydration()
      .then(() => {
        this.cache = null;
        this.notify();
      })
      .catch((error) => {
        console.warn('[BluDeviceRegistry] Hydration failed:', error);
      });
  }

  // ── Persistence ────────────────────────────────────────────────────

  private load(): BluDevice[] {
    if (this.cache !== null) return this.cache;

    const raw = storageGet(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.cache = parsed as BluDevice[];
          return this.cache;
        }
      } catch {
        /* corrupted — start fresh */
      }
    }

    this.cache = [];
    return this.cache;
  }

  private persist(): void {
    if (this.cache === null) return;
    storageSet(STORAGE_KEY, JSON.stringify(this.cache));
    void bluDevicePersistenceCache.flush();
  }

  private enqueue(fn: () => void): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => {
      fn();
      this.notify();
    });
    return this.writeQueue;
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  subscribe(cb: RegistrySubscriber): () => void {
    this.subscribers.add(cb);
    cb();
    return () => {
      this.subscribers.delete(cb);
    };
  }

  async waitForHydration(): Promise<void> {
    await this.hydrationPromise;
  }

  private notify(): void {
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch {
        /* subscriber errors must never crash the registry */
      }
    }
  }

  // ── Read API ───────────────────────────────────────────────────────

  /**
   * Get all registered devices.
   */
  getAll(): BluDevice[] {
    return [...this.load()];
  }

  /**
   * Get devices for a specific provider.
   */
  getByProvider(provider: BluProviderId): BluDevice[] {
    return this.load().filter((d) => d.provider === provider);
  }

  /**
   * Get a specific device by provider + device_id.
   */
  getDevice(provider: BluProviderId, deviceId: string): BluDevice | undefined {
    return this.load().find(
      (d) => d.provider === provider && d.device_id === deviceId,
    );
  }

  /**
   * Get the primary device (the default live power source).
   * Returns undefined if no primary is set.
   */
  getPrimary(): BluDevice | undefined {
    return this.load().find((d) => d.is_primary);
  }

  /**
   * Get the total number of registered devices.
   */
  getCount(): number {
    return this.load().length;
  }

  /**
   * Phase 1D: Check if a device exists in the registry.
   */
  hasDevice(provider: BluProviderId, deviceId: string): boolean {
    return this.load().some(
      (d) => d.provider === provider && d.device_id === deviceId,
    );
  }

  /**
   * Phase 1D: Find the most recently seen device for a provider.
   * Useful as a fallback when the previous primary is no longer available.
   */
  getMostRecentDevice(provider?: BluProviderId): BluDevice | undefined {
    const devices = provider
      ? this.load().filter((d) => d.provider === provider)
      : this.load();

    if (devices.length === 0) return undefined;

    return devices.reduce((best, d) =>
      d.last_seen > best.last_seen ? d : best,
    );
  }

  /**
   * Phase 1D: Find a valid fallback primary device.
   *
   * Priority:
   *   1. If only one device exists, return it.
   *   2. Most recently seen device for the given provider.
   *   3. Most recently seen device across all providers.
   */
  findFallbackPrimary(preferredProvider?: BluProviderId): BluDevice | undefined {
    const devices = this.load();
    if (devices.length === 0) return undefined;
    if (devices.length === 1) return devices[0];

    // Prefer the given provider
    if (preferredProvider) {
      const providerDevice = this.getMostRecentDevice(preferredProvider);
      if (providerDevice) return providerDevice;
    }

    // Fall back to any most-recently-seen device
    return this.getMostRecentDevice();
  }

  // ── Write API ──────────────────────────────────────────────────────

  /**
   * Register a new device or merge with an existing one.
   *
   * Phase 1D: Deduplication — if the same provider+device_id already exists,
   * merge the incoming data (update display_name, model, last_seen, capabilities)
   * instead of creating a duplicate. Preserves the existing is_primary flag.
   *
   * If this is the only device, it is automatically set as primary.
   */
  async registerDevice(device: Omit<BluDevice, 'is_primary'>): Promise<void> {
    return this.enqueue(() => {
      const devices = this.load();
      const existingIdx = devices.findIndex(
        (d) => d.provider === device.provider && d.device_id === device.device_id,
      );

      if (existingIdx >= 0) {
        // Phase 1D: Merge — update mutable fields, preserve primary flag
        const existing = devices[existingIdx];
        devices[existingIdx] = {
          ...existing,
          display_name: device.display_name || existing.display_name,
          model: device.model || existing.model,
          product_type: device.product_type ?? existing.product_type,
          telemetry_capable: device.telemetry_capable ?? existing.telemetry_capable,
          connection_state: device.connection_state,
          last_seen: Math.max(device.last_seen, existing.last_seen),
          capabilities: {
            ...existing.capabilities,
            ...device.capabilities,
          },
          // Preserve primary flag
          is_primary: existing.is_primary,
        };

        console.log(
          `[BluDeviceRegistry] Merged device: ${device.provider}:${device.device_id}` +
          ` (primary=${existing.is_primary})`,
        );
      } else {
        // New device — auto-primary if first device
        const isPrimary = devices.length === 0;
        devices.push({
          ...device,
          is_primary: isPrimary,
        });

        console.log(
          `[BluDeviceRegistry] Registered new device: ${device.provider}:${device.device_id}` +
          ` (primary=${isPrimary}, total=${devices.length})`,
        );
      }

      this.persist();
    });
  }

  /**
   * Remove a device from the registry.
   * If the removed device was primary, promote a fallback device.
   *
   * Phase 1D: Uses findFallbackPrimary for smarter promotion.
   */
  async removeDevice(provider: BluProviderId, deviceId: string): Promise<void> {
    return this.enqueue(() => {
      const devices = this.load();
      const idx = devices.findIndex(
        (d) => d.provider === provider && d.device_id === deviceId,
      );
      if (idx < 0) return;

      const wasPrimary = devices[idx].is_primary;
      devices.splice(idx, 1);

      // Phase 1D: Smart fallback primary promotion
      if (wasPrimary && devices.length > 0) {
        const fallback = this.findFallbackPrimary(provider);
        if (fallback) {
          const fbIdx = devices.findIndex(
            (d) => d.provider === fallback.provider && d.device_id === fallback.device_id,
          );
          if (fbIdx >= 0) {
            devices[fbIdx].is_primary = true;
            console.log(
              `[BluDeviceRegistry] Promoted fallback primary: ${fallback.provider}:${fallback.device_id}`,
            );
          }
        } else {
          // Last resort: first device
          devices[0].is_primary = true;
        }
      }

      this.persist();
    });
  }

  /**
   * Set a device as the primary power source.
   * Clears primary from all other devices.
   */
  async setPrimary(provider: BluProviderId, deviceId: string): Promise<void> {
    return this.enqueue(() => {
      const devices = this.load();
      let found = false;
      for (const d of devices) {
        d.is_primary =
          d.provider === provider && d.device_id === deviceId;
        if (d.is_primary) found = true;
      }

      if (found) {
        console.log(`[BluDeviceRegistry] Primary set: ${provider}:${deviceId}`);
      }

      this.persist();
    });
  }

  async clearPrimary(provider?: BluProviderId): Promise<void> {
    return this.enqueue(() => {
      const devices = this.load();
      let changed = false;
      for (const d of devices) {
        if ((provider == null || d.provider === provider) && d.is_primary) {
          d.is_primary = false;
          changed = true;
        }
      }

      if (changed) {
        this.persist();
        console.log(
          `[BluDeviceRegistry] Cleared primary${provider ? ` for provider: ${provider}` : ''}`,
        );
      }
    });
  }

  /**
   * Phase 1D: Restore primary device by ID.
   * If the device exists, set it as primary.
   * If it doesn't exist, find a fallback.
   * Returns the device ID that was actually set as primary (or null).
   */
  async restorePrimary(
    provider: BluProviderId,
    deviceId: string,
  ): Promise<string | null> {
    const devices = this.load();

    // Check if the previous primary still exists
    const exists = devices.some(
      (d) => d.provider === provider && d.device_id === deviceId,
    );

    if (exists) {
      await this.setPrimary(provider, deviceId);
      console.log(
        `[BluDeviceRegistry] Restored previous primary: ${provider}:${deviceId}`,
      );
      return deviceId;
    }

    // Previous primary no longer exists — find fallback
    console.log(
      `[BluDeviceRegistry] Previous primary ${provider}:${deviceId} not found. Finding fallback...`,
    );

    const fallback = this.findFallbackPrimary(provider);
    if (fallback) {
      await this.setPrimary(fallback.provider, fallback.device_id);
      console.log(
        `[BluDeviceRegistry] Fallback primary assigned: ${fallback.provider}:${fallback.device_id}`,
      );
      return fallback.device_id;
    }

    console.log('[BluDeviceRegistry] No fallback primary available.');
    return null;
  }

  /**
   * Phase 1D: Ensure a primary device is set.
   * If no primary exists but devices are registered, auto-assign one.
   */
  async ensurePrimary(preferredProvider?: BluProviderId): Promise<string | null> {
    const devices = this.load();
    const currentPrimary = devices.find((d) => d.is_primary);

    if (currentPrimary) return currentPrimary.device_id;
    if (devices.length === 0) return null;

    // Auto-assign: single device or most recently seen
    const fallback = this.findFallbackPrimary(preferredProvider);
    if (fallback) {
      await this.setPrimary(fallback.provider, fallback.device_id);
      console.log(
        `[BluDeviceRegistry] Auto-assigned primary: ${fallback.provider}:${fallback.device_id}`,
      );
      return fallback.device_id;
    }

    return null;
  }

  /**
   * Update the connection state of a device.
   */
  async updateConnectionState(
    provider: BluProviderId,
    deviceId: string,
    state: BluConnectionState,
  ): Promise<void> {
    return this.enqueue(() => {
      const device = this.load().find(
        (d) => d.provider === provider && d.device_id === deviceId,
      );
      if (device) {
        device.connection_state = state;
        device.last_seen = Date.now();
        this.persist();
      }
    });
  }

  /**
   * Update the capabilities of a device.
   */
  async updateCapabilities(
    provider: BluProviderId,
    deviceId: string,
    capabilities: Partial<BluDeviceCapabilities>,
  ): Promise<void> {
    return this.enqueue(() => {
      const device = this.load().find(
        (d) => d.provider === provider && d.device_id === deviceId,
      );
      if (device) {
        device.capabilities = { ...device.capabilities, ...capabilities };
        this.persist();
      }
    });
  }

  /**
   * Phase 1D: Remove all devices for a specific provider.
   */
  async clearProvider(provider: BluProviderId): Promise<void> {
    return this.enqueue(() => {
      const devices = this.load();
      const remaining = devices.filter((d) => d.provider !== provider);
      const removed = devices.length - remaining.length;

      if (removed > 0) {
        this.cache = remaining;

        // Ensure a primary still exists
        if (remaining.length > 0 && !remaining.some((d) => d.is_primary)) {
          remaining[0].is_primary = true;
        }

        this.persist();
        console.log(`[BluDeviceRegistry] Cleared ${removed} device(s) for provider: ${provider}`);
      }
    });
  }

  /**
   * Clear all devices from the registry.
   */
  async clearAll(): Promise<void> {
    return this.enqueue(() => {
      this.cache = [];
      this.persist();
    });
  }

  /**
   * Force a reload from storage on next access.
   */
  invalidateCache(): void {
    this.cache = null;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const bluDeviceRegistry = new BluDeviceRegistry();

