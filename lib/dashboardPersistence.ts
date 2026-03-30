/**
 * Dashboard Persistence Layer
 *
 * Cross-platform async persistence for dashboard state using:
 * - Web: localStorage (synchronous, wrapped in async API)
 * - Native (iOS/Android): expo-file-system via fsCompat (async file I/O)
 *
 * This module provides read/write primitives consumed by dashboardStore.
 * All methods are async. The dashboardStore maintains an in-memory cache
 * for synchronous reads and calls these methods for durable persistence.
 *
 * Storage keys:
 * - Dashboard state: 'ecs_dashboard_state'
 * - Custom presets:  'ecs_custom_presets'
 *
 * File paths (native):
 * - ${documentDirectory}ecs_dashboard_state.json
 * - ${documentDirectory}ecs_custom_presets.json
 *
 * Write strategy: fire-and-forget from the store's perspective.
 * A debounced write coalesces rapid mutations into a single disk write.
 */

import { Platform } from 'react-native';
import {
  getDocumentDirectory,
  fsGetInfo,
  fsReadString,
  fsWriteString,
} from './fsCompat';

// ── Storage Keys ──────────────────────────────────────────────
const DASHBOARD_STATE_KEY = 'ecs_dashboard_state';
const CUSTOM_PRESETS_KEY = 'ecs_custom_presets';

// ── Native file paths ─────────────────────────────────────────

async function getNativeFilePath(key: string): Promise<string> {
  const dir = await getDocumentDirectory();
  return `${dir}${key}.json`;
}

// ── Low-level read/write ──────────────────────────────────────

async function readNative(key: string): Promise<string | null> {
  try {
    const path = await getNativeFilePath(key);
    const info = await fsGetInfo(path);
    if (!info.exists) return null;

    return await fsReadString(path);
  } catch (e) {
    console.warn(`[DashboardPersistence] Native read failed for "${key}":`, e);
    return null;
  }
}


async function writeNative(key: string, data: string): Promise<void> {
  try {
    const path = await getNativeFilePath(key);
    await fsWriteString(path, data);
  } catch (e) {
    console.warn(`[DashboardPersistence] Native write failed for "${key}":`, e);
  }
}

function readWeb(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {
    console.warn(`[DashboardPersistence] Web read failed for "${key}":`, e);
  }
  return null;
}

function writeWeb(key: string, data: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, data);
    }
  } catch (e) {
    console.warn(`[DashboardPersistence] Web write failed for "${key}":`, e);
  }
}

// ── Public API ────────────────────────────────────────────────

const isNative = Platform.OS !== 'web';

/**
 * Read a JSON string from persistent storage.
 * Returns null if not found or on error.
 */
export async function readPersisted(key: string): Promise<string | null> {
  if (isNative) {
    return readNative(key);
  }
  // Web: localStorage is sync, but we wrap in async for uniform API
  return readWeb(key);
}

/**
 * Write a JSON string to persistent storage.
 */
export async function writePersisted(key: string, data: string): Promise<void> {
  if (isNative) {
    return writeNative(key, data);
  }
  writeWeb(key, data);
}

// ── Debounced Writer ──────────────────────────────────────────
// Coalesces rapid mutations (e.g., dragging widgets) into a single
// disk write after a short delay.

const _pendingWrites: Map<string, { data: string; timer: ReturnType<typeof setTimeout> }> = new Map();
const DEBOUNCE_MS = 300;

/**
 * Schedule a debounced write. If another write for the same key arrives
 * within DEBOUNCE_MS, the previous timer is cancelled and the new data
 * replaces it. This prevents disk thrashing during rapid mutations.
 */
export function scheduleDebouncedWrite(key: string, data: string): void {
  const existing = _pendingWrites.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }

  // On web, also write to localStorage immediately (it's synchronous and fast)
  // so that other tabs / same-session reads see the latest data.
  if (!isNative) {
    writeWeb(key, data);
  }

  const timer = setTimeout(() => {
    _pendingWrites.delete(key);
    if (isNative) {
      writeNative(key, data).catch(() => {});
    }
    // Web already written above synchronously
  }, DEBOUNCE_MS);

  _pendingWrites.set(key, { data, timer });
}

/**
 * Flush all pending debounced writes immediately.
 * Useful before app backgrounding or shutdown.
 */
export async function flushPendingWrites(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [key, { data, timer }] of _pendingWrites.entries()) {
    clearTimeout(timer);
    promises.push(writePersisted(key, data));
  }
  _pendingWrites.clear();
  await Promise.all(promises);
}

// ── Convenience: typed read/write for dashboard state ─────────

export async function readDashboardState(): Promise<string | null> {
  return readPersisted(DASHBOARD_STATE_KEY);
}

export async function writeDashboardState(data: string): void {
  scheduleDebouncedWrite(DASHBOARD_STATE_KEY, data);
}

export async function readCustomPresets(): Promise<string | null> {
  return readPersisted(CUSTOM_PRESETS_KEY);
}

export async function writeCustomPresets(data: string): void {
  scheduleDebouncedWrite(CUSTOM_PRESETS_KEY, data);
}

// ── Hydration status tracking ─────────────────────────────────

let _hydrated = false;
let _hydrateResolve: (() => void) | null = null;
const _hydratePromise = new Promise<void>((resolve) => {
  _hydrateResolve = resolve;
});

export function markHydrated(): void {
  _hydrated = true;
  if (_hydrateResolve) {
    _hydrateResolve();
    _hydrateResolve = null;
  }
}

export function isHydrated(): boolean {
  return _hydrated;
}

/**
 * Wait for hydration to complete. Resolves immediately if already hydrated.
 */
export function waitForHydration(): Promise<void> {
  return _hydratePromise;
}

