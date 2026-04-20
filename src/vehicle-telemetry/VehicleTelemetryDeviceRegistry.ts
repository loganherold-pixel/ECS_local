/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY DEVICE REGISTRY — Phase 2D
 * ═══════════════════════════════════════════════════════════
 *
 * Manages registered vehicle telemetry devices with:
 *   - Persistence across app restarts
 *   - Multi-device support under one user account
 *   - Primary device selection with automatic fallback
 *   - Deduplication on re-registration
 *   - Provider-scoped device queries
 *
 * Phase 2D adds:
 *   - Stale device detection
 *   - Device validation on restore
 *   - Duplicate merge on rediscovery
 *   - Connection state reset on restore (all devices start disconnected)
 *   - Enhanced fallback primary selection
 *   - Device staleness check
 */

import { Platform } from 'react-native';
import type {
  VehicleTelemetryDevice,
  VehicleTelemetryProviderId,
  VehicleTelemetryConnectionState,
  VehicleTelemetryCapabilities,
} from './VehicleTelemetryTypes';
import { EMPTY_CAPABILITIES, VT_STORAGE_KEYS } from './VehicleTelemetryTypes';

const TAG = '[VT-DeviceRegistry]';

/** Devices not seen in 30 days are considered stale */
const STALE_DEVICE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ── Storage helpers ──────────────────────────────────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

// ═══════════════════════════════════════════════════════════
// DEVICE REGISTRY
// ═══════════════════════════════════════════════════════════

class VehicleTelemetryDeviceRegistry {
  private devices: VehicleTelemetryDevice[] = [];
  private primaryDeviceId: string | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    this.restore();
  }

  // ── Persistence ────────────────────────────────────────

  private restore(): void {
    try {
      const raw = sGet(VT_STORAGE_KEYS.DEVICES);
      if (raw) {
        const parsed = JSON.parse(raw) as VehicleTelemetryDevice[];

        // Phase 2D: Validate and sanitize restored devices
        this.devices = parsed
          .filter(d => d && d.device_id && d.provider && d.device_name)
          .map(d => ({
            ...d,
            // Reset connection state on restore — actual state determined by adapter
            connection_state: 'disconnected' as VehicleTelemetryConnectionState,
            // Ensure capabilities object is complete
            capabilities: { ...EMPTY_CAPABILITIES, ...d.capabilities },
          }));

        // Phase 2D: Remove stale devices (not seen in 30 days)
        const before = this.devices.length;
        this.devices = this.devices.filter(d => {
          if (!d.last_seen) return true; // Keep devices never seen (just registered)
          const age = Date.now() - new Date(d.last_seen).getTime();
          return age < STALE_DEVICE_AGE_MS;
        });
        const removed = before - this.devices.length;
        if (removed > 0) {
          console.log(TAG, `Pruned ${removed} stale device(s)`);
        }

        console.log(TAG, `Restored ${this.devices.length} device(s)`);
      }
      const primaryId = sGet(VT_STORAGE_KEYS.PRIMARY_DEVICE);
      if (primaryId) {
        this.primaryDeviceId = primaryId;
        console.log(TAG, `Restored primary device: ${primaryId}`);
      }
    } catch (e) {
      console.warn(TAG, 'Failed to restore devices:', e);
      this.devices = [];
      this.primaryDeviceId = null;
    }
  }

  private persist(): void {
    try {
      sSet(VT_STORAGE_KEYS.DEVICES, JSON.stringify(this.devices));
      if (this.primaryDeviceId) {
        sSet(VT_STORAGE_KEYS.PRIMARY_DEVICE, this.primaryDeviceId);
      } else {
        sRemove(VT_STORAGE_KEYS.PRIMARY_DEVICE);
      }
    } catch (e) {
      console.warn(TAG, 'Failed to persist devices:', e);
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  // ── Subscriptions ──────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  // ── Device Registration ────────────────────────────────

  /**
   * Register a new telemetry device or merge if already exists.
   * Prevents duplicates by matching on device_id.
   */
  registerDevice(device: Omit<VehicleTelemetryDevice, 'registered_at' | 'is_primary'>): VehicleTelemetryDevice {
    const existing = this.devices.find(d => d.device_id === device.device_id);

    if (existing) {
      // Phase 2D: Merge — update fields but preserve registration date and primary flag
      existing.device_name = device.device_name || existing.device_name;
      existing.connection_state = device.connection_state;
      existing.last_seen = device.last_seen || existing.last_seen;
      existing.capabilities = { ...existing.capabilities, ...device.capabilities };
      existing.firmware_version = device.firmware_version || existing.firmware_version;
      existing.protocol = device.protocol || existing.protocol;
      console.log(TAG, `Merged device: ${device.device_id} (${device.device_name})`);
      this.persist();
      this.notify();
      return existing;
    }

    const newDevice: VehicleTelemetryDevice = {
      ...device,
      is_primary: false,
      registered_at: new Date().toISOString(),
    };

    this.devices.push(newDevice);
    console.log(TAG, `Registered device: ${device.device_id} (${device.device_name})`);

    // Auto-assign primary if this is the only device
    if (this.devices.length === 1) {
      this.setPrimary(newDevice.device_id);
    }

    this.persist();
    this.notify();
    return newDevice;
  }

  /**
   * Remove a device from the registry.
   */
  removeDevice(deviceId: string): void {
    const idx = this.devices.findIndex(d => d.device_id === deviceId);
    if (idx === -1) return;

    const removed = this.devices[idx];
    this.devices.splice(idx, 1);
    console.log(TAG, `Removed device: ${deviceId}`);

    // If the removed device was primary, find a fallback
    if (removed.is_primary || this.primaryDeviceId === deviceId) {
      this.primaryDeviceId = null;
      this.findFallbackPrimary();
    }

    this.persist();
    this.notify();
  }

  /**
   * Clear all devices for a specific provider.
   */
  clearProvider(provider: VehicleTelemetryProviderId): void {
    const before = this.devices.length;
    this.devices = this.devices.filter(d => d.provider !== provider);
    const removed = before - this.devices.length;

    if (removed > 0) {
      console.log(TAG, `Cleared ${removed} device(s) for provider: ${provider}`);

      // Check if primary was among cleared devices
      if (this.primaryDeviceId && !this.devices.find(d => d.device_id === this.primaryDeviceId)) {
        this.primaryDeviceId = null;
        this.findFallbackPrimary();
      }

      this.persist();
      this.notify();
    }
  }

  /**
   * Clear all devices from the registry.
   */
  clearAll(): void {
    this.devices = [];
    this.primaryDeviceId = null;
    console.log(TAG, 'Cleared all devices');
    this.persist();
    this.notify();
  }

  // ── Primary Device Management ──────────────────────────

  /**
   * Set a device as the primary telemetry source.
   */
  setPrimary(deviceId: string): boolean {
    const device = this.devices.find(d => d.device_id === deviceId);
    if (!device) {
      console.warn(TAG, `Cannot set primary — device not found: ${deviceId}`);
      return false;
    }

    // Clear previous primary
    this.devices.forEach(d => { d.is_primary = false; });

    device.is_primary = true;
    this.primaryDeviceId = deviceId;
    console.log(TAG, `Primary device set: ${deviceId} (${device.device_name})`);

    this.persist();
    this.notify();
    return true;
  }

  /**
   * Get the current primary device, or null if none.
   */
  getPrimary(): VehicleTelemetryDevice | null {
    if (this.primaryDeviceId) {
      const device = this.devices.find(d => d.device_id === this.primaryDeviceId);
      if (device) return device;
    }
    // Fallback: find any device marked as primary
    return this.devices.find(d => d.is_primary) || null;
  }

  /**
   * Get the primary device ID.
   */
  getPrimaryId(): string | null {
    return this.primaryDeviceId;
  }

  /**
   * Find and assign a fallback primary device.
   *
   * Phase 2D priority:
   *   1. If only one device → assign it
   *   2. Most recently seen connected device
   *   3. Most recently seen device (any state)
   *   4. First device in list
   */
  findFallbackPrimary(): VehicleTelemetryDevice | null {
    if (this.devices.length === 0) {
      this.primaryDeviceId = null;
      return null;
    }

    // If only one device, assign it
    if (this.devices.length === 1) {
      this.setPrimary(this.devices[0].device_id);
      return this.devices[0];
    }

    // Multiple devices — prefer connected, then most recently seen
    const sorted = [...this.devices]
      .filter(d => d.connection_state !== 'unsupported')
      .sort((a, b) => {
        // Connected devices first
        const aConn = a.connection_state === 'connected' ? 1 : 0;
        const bConn = b.connection_state === 'connected' ? 1 : 0;
        if (aConn !== bConn) return bConn - aConn;

        // Then by most recently seen
        const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bTime - aTime;
      });

    if (sorted.length > 0) {
      this.setPrimary(sorted[0].device_id);
      console.log(TAG, `Fallback primary: ${sorted[0].device_id} (${sorted[0].device_name})`);
      return sorted[0];
    }

    // Last resort: first device
    this.setPrimary(this.devices[0].device_id);
    return this.devices[0];
  }

  /**
   * Restore primary device on app launch.
   * If the previous primary still exists, reassign it.
   * Otherwise, find a fallback.
   */
  restorePrimary(): VehicleTelemetryDevice | null {
    if (this.primaryDeviceId) {
      const device = this.devices.find(d => d.device_id === this.primaryDeviceId);
      if (device) {
        device.is_primary = true;
        console.log(TAG, `Restored primary: ${device.device_id} (${device.device_name})`);
        return device;
      }
      console.log(TAG, `Previous primary ${this.primaryDeviceId} no longer exists — finding fallback`);
    }
    return this.findFallbackPrimary();
  }

  /**
   * Ensure a primary device is assigned.
   * If no primary exists and devices are available, auto-assign.
   */
  ensurePrimary(): VehicleTelemetryDevice | null {
    const current = this.getPrimary();
    if (current) return current;
    return this.findFallbackPrimary();
  }

  // ── Device Queries ─────────────────────────────────────

  /**
   * Get all registered devices.
   */
  getAll(): VehicleTelemetryDevice[] {
    return [...this.devices];
  }

  /**
   * Get devices for a specific provider.
   */
  getByProvider(provider: VehicleTelemetryProviderId): VehicleTelemetryDevice[] {
    return this.devices.filter(d => d.provider === provider);
  }

  /**
   * Get a device by ID.
   */
  getById(deviceId: string): VehicleTelemetryDevice | null {
    return this.devices.find(d => d.device_id === deviceId) || null;
  }

  /**
   * Get the total number of registered devices.
   */
  getCount(): number {
    return this.devices.length;
  }

  /**
   * Check if any devices are registered.
   */
  hasDevices(): boolean {
    return this.devices.length > 0;
  }

  // ── Connection State Updates ───────────────────────────

  /**
   * Update the connection state of a device.
   */
  updateConnectionState(deviceId: string, state: VehicleTelemetryConnectionState): void {
    const device = this.devices.find(d => d.device_id === deviceId);
    if (!device) return;

    device.connection_state = state;
    if (state === 'connected') {
      device.last_seen = new Date().toISOString();
    }

    this.persist();
    this.notify();
  }

  /**
   * Update the last_seen timestamp for a device.
   */
  touchDevice(deviceId: string): void {
    const device = this.devices.find(d => d.device_id === deviceId);
    if (!device) return;

    device.last_seen = new Date().toISOString();
    this.persist();
    // Don't notify for touch-only updates (too frequent)
  }

  /**
   * Update device capabilities.
   */
  updateCapabilities(deviceId: string, capabilities: Partial<VehicleTelemetryCapabilities>): void {
    const device = this.devices.find(d => d.device_id === deviceId);
    if (!device) return;

    device.capabilities = { ...device.capabilities, ...capabilities };
    this.persist();
    this.notify();
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: STALE DEVICE DETECTION
  // ═══════════════════════════════════════════════════════

  /**
   * Check if a device is stale (not seen in 30 days).
   */
  isDeviceStale(deviceId: string): boolean {
    const device = this.devices.find(d => d.device_id === deviceId);
    if (!device || !device.last_seen) return false;
    const age = Date.now() - new Date(device.last_seen).getTime();
    return age > STALE_DEVICE_AGE_MS;
  }

  /**
   * Get all stale devices.
   */
  getStaleDevices(): VehicleTelemetryDevice[] {
    return this.devices.filter(d => {
      if (!d.last_seen) return false;
      const age = Date.now() - new Date(d.last_seen).getTime();
      return age > STALE_DEVICE_AGE_MS;
    });
  }

  /**
   * Prune stale devices from the registry.
   */
  pruneStaleDevices(): number {
    const before = this.devices.length;
    this.devices = this.devices.filter(d => {
      if (!d.last_seen) return true;
      const age = Date.now() - new Date(d.last_seen).getTime();
      return age < STALE_DEVICE_AGE_MS;
    });
    const removed = before - this.devices.length;

    if (removed > 0) {
      console.log(TAG, `Pruned ${removed} stale device(s)`);

      // Check if primary was pruned
      if (this.primaryDeviceId && !this.devices.find(d => d.device_id === this.primaryDeviceId)) {
        this.primaryDeviceId = null;
        this.findFallbackPrimary();
      }

      this.persist();
      this.notify();
    }

    return removed;
  }

  /**
   * Phase 2D: Reset all device connection states to disconnected.
   * Called on app launch before adapter reconnect attempts.
   */
  resetAllConnectionStates(): void {
    let changed = false;
    for (const device of this.devices) {
      if (device.connection_state !== 'disconnected') {
        device.connection_state = 'disconnected';
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
  }
}

// ── Singleton export ─────────────────────────────────────
export const vehicleTelemetryDeviceRegistry = new VehicleTelemetryDeviceRegistry();

