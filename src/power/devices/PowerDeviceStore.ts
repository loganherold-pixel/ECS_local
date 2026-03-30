/**
 * PowerDeviceStore — persistent multi-device selection store.
 *
 * Phase 3E-1: Tracks which device IDs the user has selected for each
 * cloud power provider. Persisted locally so selections survive app
 * restarts.
 *
 * Storage strategy:
 *   - Web: localStorage (same pattern as app/lib/storage.ts)
 *   - Native: in-memory with best-effort localStorage shim
 *
 * The store is provider-agnostic: it stores string[] device IDs keyed
 * by PowerProviderId. It does not know about telemetry, polling, or
 * connector internals.
 *
 * Thread-safety: all mutations are serialised through a write queue
 * to prevent concurrent read-modify-write races on the same storage key.
 */

import { Platform } from "react-native";
import type { PowerProviderId } from "../types/PowerDevice";

// ── Public types ────────────────────────────────────────────────────────

/**
 * Map of provider → selected device IDs.
 * A missing key means "no devices selected for that provider".
 */
export type SelectedDevicesState = {
  [provider in PowerProviderId]?: string[];
};

// ── Storage key ─────────────────────────────────────────────────────────

const STORAGE_KEY = "ecs.power.selectedDevices.v1";

// ── Low-level storage helpers ───────────────────────────────────────────

/** In-memory fallback for environments without localStorage. */
const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    try {
      return localStorage.getItem(key);
    } catch {
      // localStorage may throw in private browsing / quota exceeded
    }
  }
  return memoryStore[key] ?? null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Swallow — fall through to memory store
    }
  }
  memoryStore[key] = value;
}

// ── PowerDeviceStore class ──────────────────────────────────────────────

class PowerDeviceStore {
  /**
   * In-memory cache of the full state.
   * Lazily hydrated from storage on first access.
   */
  private cache: SelectedDevicesState | null = null;

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

  /**
   * Enqueue a write operation to prevent concurrent mutations.
   */
  private enqueue(fn: () => void): Promise<void> {
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
    const state = this.load();
    return (state[provider] ?? []).includes(deviceId);
  }

  /**
   * Get the total number of selected devices across all providers.
   */
  async totalSelectedCount(): Promise<number> {
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
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const powerDeviceStore = new PowerDeviceStore();

