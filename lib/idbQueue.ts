/**
 * IndexedDB Persistence Layer for Offline Action Queues
 *
 * Provides durable, structured storage for offline action queues using
 * IndexedDB with automatic localStorage fallback for environments where
 * IndexedDB is unavailable (e.g. some SSR contexts, older browsers).
 *
 * Features:
 * - Async IndexedDB read/write with promise wrappers
 * - Automatic database versioning and schema migration
 * - localStorage fallback (transparent to callers)
 * - Object store per queue type (sync actions, offline ops, history)
 * - Timestamped entries for FIFO ordering
 * - Bulk read/write for efficient queue snapshots
 * - Storage quota awareness
 *
 * Architecture:
 * - Single database: 'ecs_offline_db'
 * - Object stores: 'sync_actions', 'offline_ops', 'sync_history'
 * - Each store keyed by action 'id' field
 * - Indexes on 'createdAt' for FIFO ordering and 'type' for filtering
 *
 * Usage:
 *   import { idbQueue } from './idbQueue';
 *   await idbQueue.ready;
 *   await idbQueue.saveAll('sync_actions', actions);
 *   const actions = await idbQueue.loadAll('sync_actions');
 *   await idbQueue.clear('sync_actions');
 */

import { Platform } from 'react-native';

// ── Constants ─────────────────────────────────────────────────

const DB_NAME = 'ecs_offline_db';
const DB_VERSION = 2; // Bump when adding/changing object stores

/** Object store names — each queue gets its own store */
export type IDBStoreName = 'sync_actions' | 'offline_ops' | 'sync_history';

const STORE_CONFIGS: Record<IDBStoreName, { keyPath: string; indexes: Array<{ name: string; keyPath: string; unique: boolean }> }> = {
  sync_actions: {
    keyPath: 'id',
    indexes: [
      { name: 'by_createdAt', keyPath: 'createdAt', unique: false },
      { name: 'by_type', keyPath: 'type', unique: false },
      { name: 'by_status', keyPath: 'status', unique: false },
      { name: 'by_priority', keyPath: 'priority', unique: false },
    ],
  },
  offline_ops: {
    keyPath: 'id',
    indexes: [
      { name: 'by_createdAt', keyPath: 'createdAt', unique: false },
      { name: 'by_type', keyPath: 'type', unique: false },
      { name: 'by_priority', keyPath: 'priority', unique: false },
    ],
  },
  sync_history: {
    keyPath: 'id',
    indexes: [
      { name: 'by_createdAt', keyPath: 'createdAt', unique: false },
      { name: 'by_type', keyPath: 'type', unique: false },
    ],
  },
};

// ── localStorage fallback keys ────────────────────────────────

const LS_FALLBACK_KEYS: Record<IDBStoreName, string> = {
  sync_actions: 'ecs_sync_action_queue',
  offline_ops: 'ecs_offline_queue',
  sync_history: 'ecs_sync_action_history',
};

// ── IDB Availability Check ────────────────────────────────────

function isIDBAvailable(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

// ── IDB Queue Manager ─────────────────────────────────────────

class IDBQueueManager {
  private _db: IDBDatabase | null = null;
  private _useIDB: boolean;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _initialized = false;

  constructor() {
    this._useIDB = isIDBAvailable();
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    // Auto-initialize
    this._init();
  }

  /** Resolves when the database is ready for operations */
  get ready(): Promise<void> {
    return this._readyPromise;
  }

  /** Whether IndexedDB is being used (vs localStorage fallback) */
  get isUsingIDB(): boolean {
    return this._useIDB && this._db !== null;
  }

  // ── Initialization ──────────────────────────────────────────

  private _init(): void {
    if (this._initialized) return;
    this._initialized = true;

    if (!this._useIDB) {
      // No IndexedDB — resolve immediately, will use localStorage fallback
      console.log('[IDBQueue] IndexedDB unavailable — using localStorage fallback');
      this._readyResolve();
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create/update object stores
        for (const [storeName, config] of Object.entries(STORE_CONFIGS)) {
          let store: IDBObjectStore;

          if (!db.objectStoreNames.contains(storeName)) {
            store = db.createObjectStore(storeName, { keyPath: config.keyPath });
          } else {
            // Store exists — get it from the transaction for index updates
            store = (event.target as IDBOpenDBRequest).transaction!.objectStore(storeName);
          }

          // Create indexes that don't exist yet
          for (const idx of config.indexes) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
            }
          }
        }
      };

      request.onsuccess = (event) => {
        this._db = (event.target as IDBOpenDBRequest).result;

        // Handle unexpected close (e.g. browser clearing data)
        this._db.onclose = () => {
          console.warn('[IDBQueue] Database closed unexpectedly');
          this._db = null;
        };

        // Migrate data from localStorage to IndexedDB on first use
        this._migrateFromLocalStorage();

        console.log('[IDBQueue] IndexedDB ready');
        this._readyResolve();
      };

      request.onerror = (event) => {
        console.warn('[IDBQueue] IndexedDB open failed:', (event.target as IDBOpenDBRequest).error);
        this._useIDB = false;
        this._readyResolve(); // Resolve anyway — will use localStorage fallback
      };

      request.onblocked = () => {
        console.warn('[IDBQueue] IndexedDB blocked — another tab may have an older version open');
        this._useIDB = false;
        this._readyResolve();
      };
    } catch (e) {
      console.warn('[IDBQueue] IndexedDB init error:', e);
      this._useIDB = false;
      this._readyResolve();
    }
  }

  // ── Data Migration ──────────────────────────────────────────

  /**
   * One-time migration: copy data from localStorage to IndexedDB.
   * After successful migration, localStorage keys are preserved as
   * a backup but IDB becomes the primary source of truth.
   */
  private async _migrateFromLocalStorage(): Promise<void> {
    if (!this._db) return;

    const MIGRATION_KEY = 'ecs_idb_migrated';
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_KEY)) {
        return; // Already migrated
      }
    } catch {
      return;
    }

    for (const [storeName, lsKey] of Object.entries(LS_FALLBACK_KEYS)) {
      try {
        if (typeof localStorage === 'undefined') continue;
        const raw = localStorage.getItem(lsKey);
        if (!raw) continue;

        const items = JSON.parse(raw);
        if (!Array.isArray(items) || items.length === 0) continue;

        // Check if IDB store already has data
        const existing = await this._idbLoadAll(storeName as IDBStoreName);
        if (existing.length > 0) continue; // Don't overwrite existing IDB data

        await this._idbSaveAll(storeName as IDBStoreName, items);
        console.log(`[IDBQueue] Migrated ${items.length} items from localStorage (${lsKey}) → IDB (${storeName})`);
      } catch (e) {
        console.warn(`[IDBQueue] Migration failed for ${storeName}:`, e);
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
      }
    } catch {}
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Load all items from a store, ordered by createdAt (FIFO).
   */
  async loadAll<T = any>(storeName: IDBStoreName): Promise<T[]> {
    if (this._db) {
      try {
        return await this._idbLoadAll<T>(storeName);
      } catch (e) {
        console.warn(`[IDBQueue] IDB loadAll failed for ${storeName}, falling back to localStorage:`, e);
      }
    }
    return this._lsLoad<T>(storeName);
  }

  /**
   * Save all items to a store (replaces entire contents).
   */
  async saveAll<T = any>(storeName: IDBStoreName, items: T[]): Promise<void> {
    // Always write to localStorage as backup
    this._lsSave(storeName, items);

    if (this._db) {
      try {
        await this._idbSaveAll<T>(storeName, items);
        return;
      } catch (e) {
        console.warn(`[IDBQueue] IDB saveAll failed for ${storeName}, localStorage backup preserved:`, e);
      }
    }
  }

  /**
   * Add a single item to a store.
   */
  async add<T = any>(storeName: IDBStoreName, item: T): Promise<void> {
    if (this._db) {
      try {
        await this._idbAdd<T>(storeName, item);
        // Also update localStorage backup
        const all = await this._idbLoadAll<T>(storeName);
        this._lsSave(storeName, all);
        return;
      } catch (e) {
        console.warn(`[IDBQueue] IDB add failed for ${storeName}:`, e);
      }
    }

    // Fallback: add to localStorage array
    const items = this._lsLoad<T>(storeName);
    items.push(item);
    this._lsSave(storeName, items);
  }

  /**
   * Remove a single item by ID from a store.
   */
  async remove(storeName: IDBStoreName, id: string): Promise<void> {
    if (this._db) {
      try {
        await this._idbRemove(storeName, id);
        // Update localStorage backup
        const all = await this._idbLoadAll(storeName);
        this._lsSave(storeName, all);
        return;
      } catch (e) {
        console.warn(`[IDBQueue] IDB remove failed for ${storeName}:`, e);
      }
    }

    // Fallback: remove from localStorage array
    const items = this._lsLoad(storeName);
    const filtered = items.filter((item: any) => item.id !== id);
    this._lsSave(storeName, filtered);
  }

  /**
   * Clear all items from a store.
   */
  async clear(storeName: IDBStoreName): Promise<void> {
    if (this._db) {
      try {
        await this._idbClear(storeName);
      } catch (e) {
        console.warn(`[IDBQueue] IDB clear failed for ${storeName}:`, e);
      }
    }
    this._lsSave(storeName, []);
  }

  /**
   * Get the count of items in a store.
   */
  async count(storeName: IDBStoreName): Promise<number> {
    if (this._db) {
      try {
        return await this._idbCount(storeName);
      } catch {
        // fall through to localStorage
      }
    }
    return this._lsLoad(storeName).length;
  }

  /**
   * Get estimated storage usage (bytes) — web only.
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
    if (Platform.OS !== 'web') return null;
    try {
      if (navigator?.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage || 0, quota: est.quota || 0 };
      }
    } catch {}
    return null;
  }

  // ── IndexedDB Internal Methods ──────────────────────────────

  private _idbLoadAll<T>(storeName: IDBStoreName): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve([]); return; }
      try {
        const tx = this._db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        // Use createdAt index for FIFO ordering if available
        let request: IDBRequest;
        if (store.indexNames.contains('by_createdAt')) {
          request = store.index('by_createdAt').getAll();
        } else {
          request = store.getAll();
        }

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private _idbSaveAll<T>(storeName: IDBStoreName, items: T[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve(); return; }
      try {
        const tx = this._db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        // Clear existing data first
        store.clear();

        // Add all items
        for (const item of items) {
          store.put(item);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      } catch (e) {
        reject(e);
      }
    });
  }

  private _idbAdd<T>(storeName: IDBStoreName, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve(); return; }
      try {
        const tx = this._db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(item); // put = upsert

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private _idbRemove(storeName: IDBStoreName, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve(); return; }
      try {
        const tx = this._db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private _idbClear(storeName: IDBStoreName): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve(); return; }
      try {
        const tx = this._db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private _idbCount(storeName: IDBStoreName): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this._db) { resolve(0); return; }
      try {
        const tx = this._db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── localStorage Fallback Methods ───────────────────────────

  private _lsLoad<T>(storeName: IDBStoreName): T[] {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const key = LS_FALLBACK_KEYS[storeName];
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (e) {
      console.warn(`[IDBQueue] localStorage load failed for ${storeName}:`, e);
    }
    return [];
  }

  private _lsSave<T>(storeName: IDBStoreName, items: T[]): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const key = LS_FALLBACK_KEYS[storeName];
        localStorage.setItem(key, JSON.stringify(items));
      }
    } catch (e) {
      console.warn(`[IDBQueue] localStorage save failed for ${storeName}:`, e);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────

  /**
   * Close the database connection. Call on app shutdown if needed.
   */
  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  /**
   * Delete the entire database. Use for full reset/logout.
   */
  async deleteDatabase(): Promise<void> {
    this.close();

    if (!isIDBAvailable()) return;

    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => {
          console.log('[IDBQueue] Database deleted');
          resolve();
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.warn('[IDBQueue] Database delete blocked');
          resolve(); // Don't block app flow
        };
      } catch (e) {
        reject(e);
      }
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const idbQueue = new IDBQueueManager();

