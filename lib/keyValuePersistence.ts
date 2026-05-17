import { Platform } from 'react-native';
import {
  fsGetInfo,
  fsReadString,
  fsWriteString,
  getDocumentDirectory,
} from './fsCompat';
import { ecsLog } from './ecsLogger';

interface PersistedKeyValueCache {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clear: () => void;
  flush: () => Promise<void>;
  waitForHydration: () => Promise<void>;
  isHydrated: () => boolean;
}

function createResolvedPromise() {
  return Promise.resolve();
}

const ANDROID_NATIVE_FALLBACK_DIR =
  'file:///data/user/0/com.expeditioncommand.planningofflinesync/files/';
const STARTUP_DEBUG_FILE_KEYS = new Set([
  'ecs_shell_state',
  'ecs_setup_state',
  'ecs_runtime_flags',
  'ecs_session_state',
]);
const singletonCaches = new Map<string, PersistedKeyValueCache>();
const STARTUP_HYDRATION_RETRY_COUNT = 8;
const STARTUP_HYDRATION_RETRY_DELAY_MS = 150;
const IS_DEV_ENV = typeof __DEV__ !== 'undefined' && __DEV__;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createPersistedKeyValueCache(fileKey: string): PersistedKeyValueCache {
  const existing = singletonCaches.get(fileKey);
  if (existing) {
    return existing;
  }

  const isStartupCriticalKey = STARTUP_DEBUG_FILE_KEYS.has(fileKey);
  const shouldDebug = IS_DEV_ENV && STARTUP_DEBUG_FILE_KEYS.has(fileKey);
  const isWeb = Platform.OS === 'web';
  let cache: Record<string, string> = {};
  const knownKeys = new Set<string>();
  let hydrated = isWeb;
  let pendingWrite: ReturnType<typeof setTimeout> | null = null;
  let writePromise: Promise<void> = createResolvedPromise();
  let resolveHydration: (() => void) | null = null;
  let resolvedNativePath: string | null = null;
  const hydrationPromise = isWeb
    ? createResolvedPromise()
    : new Promise<void>((resolve) => {
        resolveHydration = resolve;
      });

  function debugLog(message: string, metadata?: Record<string, unknown>) {
    if (!shouldDebug) return;
    ecsLog.debug('SYSTEM', `[KeyValuePersistence:${fileKey}] ${message}`, metadata);
  }

  function normalizeDirectoryPath(dir: string | null | undefined): string | null {
    if (!dir) return null;
    return dir.endsWith('/') ? dir : `${dir}/`;
  }

  async function resolveDocumentDirectoryWithRetry() {
    const attempts = Platform.OS === 'android' ? STARTUP_HYDRATION_RETRY_COUNT : 1;

    for (let index = 0; index < attempts; index += 1) {
      const dir = await getDocumentDirectory();
      const normalizedDir = normalizeDirectoryPath(dir);

      if (normalizedDir) {
        debugLog('documentDirectory resolved', {
          attempt: index + 1,
          dir: normalizedDir,
        });
        return normalizedDir;
      }

      if (isStartupCriticalKey || index === 0 || index === attempts - 1) {
        debugLog('documentDirectory unavailable', {
          attempt: index + 1,
        });
      }

      if (index < attempts - 1) {
        await sleep(STARTUP_HYDRATION_RETRY_DELAY_MS);
      }
    }

    if (isStartupCriticalKey) {
      ecsLog.warnOnce(
        'SYSTEM',
        `kvp:${fileKey}:document-dir-unavailable`,
        `[KeyValuePersistence:${fileKey}] documentDirectory remained unavailable during startup hydration`,
        { attempts },
      );
    }

    return null;
  }

  async function getNativePathCandidates() {
    const candidates: string[] = [];
    const normalizedDir = await resolveDocumentDirectoryWithRetry();

    if (normalizedDir) {
      candidates.push(`${normalizedDir}${fileKey}.json`);
    }

    if (Platform.OS === 'android') {
      candidates.push(`${ANDROID_NATIVE_FALLBACK_DIR}${fileKey}.json`);
      candidates.push(`${ANDROID_NATIVE_FALLBACK_DIR.replace(/^file:\/\//, '')}${fileKey}.json`);
    }

    if (candidates.length === 0) {
      candidates.push(`${fileKey}.json`);
    }

    return Array.from(new Set(candidates));
  }

  async function getPreferredNativePath() {
    if (resolvedNativePath) {
      return resolvedNativePath;
    }

    const candidates = await getNativePathCandidates();
    resolvedNativePath = candidates[0] ?? `${fileKey}.json`;
    return resolvedNativePath;
  }

  async function writeNativeSnapshot(snapshot: Record<string, string>) {
    try {
      const path = await getPreferredNativePath();
      debugLog('writing snapshot', {
        path,
        keys: Object.keys(snapshot),
      });
      await fsWriteString(path, JSON.stringify(snapshot));
    } catch (error) {
      console.warn(`[KeyValuePersistence] Failed to write "${fileKey}":`, error);
    }
  }

  async function hydrateNative() {
    try {
      const candidates = await getNativePathCandidates();
      debugLog('hydration candidates resolved', { candidates });

      for (const path of candidates) {
        const info = await fsGetInfo(path);
        debugLog('checked candidate', {
          path,
          exists: info.exists,
          isDirectory: info.isDirectory,
          size: info.size,
        });

        if (!info.exists || info.isDirectory) {
          continue;
        }

        const raw = await fsReadString(path);
        debugLog('read candidate contents', {
          path,
          rawLength: raw?.length ?? 0,
          preview: raw?.slice(0, 160) ?? '',
        });

        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cache = Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, string] => {
              return typeof entry[0] === 'string' && typeof entry[1] === 'string';
            }),
          );
          Object.keys(cache).forEach((key) => knownKeys.add(key));
          resolvedNativePath = path;
          debugLog('hydrated snapshot accepted', {
            path,
            keys: Object.keys(cache),
          });
          break;
        }
      }
    } catch (error) {
      console.warn(`[KeyValuePersistence] Failed to hydrate "${fileKey}":`, error);
    } finally {
      hydrated = true;
      if (resolveHydration) {
        resolveHydration();
        resolveHydration = null;
      }
    }
  }

  if (!isWeb) {
    hydrateNative().catch(() => {});
  }

  function scheduleNativeWrite() {
    if (isWeb) return;
    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }
    pendingWrite = setTimeout(() => {
      pendingWrite = null;
      const snapshot = { ...cache };
      writePromise = writeNativeSnapshot(snapshot);
    }, 60);
  }

  const instance: PersistedKeyValueCache = {
    get(key: string): string | null {
      if (isWeb) {
        try {
          if (typeof localStorage !== 'undefined') {
            knownKeys.add(key);
            return localStorage.getItem(key);
          }
        } catch {}
        return null;
      }

      knownKeys.add(key);
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    },

    set(key: string, value: string) {
      if (isWeb) {
        try {
          if (typeof localStorage !== 'undefined') {
            knownKeys.add(key);
            localStorage.setItem(key, value);
          }
        } catch {}
        return;
      }

      knownKeys.add(key);
      cache[key] = value;
      debugLog('set key', { key, value });
      scheduleNativeWrite();
    },

    delete(key: string) {
      if (isWeb) {
        try {
          if (typeof localStorage !== 'undefined') {
            knownKeys.delete(key);
            localStorage.removeItem(key);
          }
        } catch {}
        return;
      }

      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        knownKeys.delete(key);
        delete cache[key];
        debugLog('delete key', { key });
        scheduleNativeWrite();
      }
    },

    clear() {
      if (isWeb) {
        try {
          if (typeof localStorage !== 'undefined') {
            Array.from(knownKeys).forEach((key) => localStorage.removeItem(key));
          }
        } catch {}
        return;
      }

      if (Object.keys(cache).length > 0) {
        cache = {};
        knownKeys.clear();
        debugLog('cleared cache');
        scheduleNativeWrite();
      }
    },

    async flush() {
      if (isWeb) return;

      if (pendingWrite) {
        clearTimeout(pendingWrite);
        pendingWrite = null;
        const snapshot = { ...cache };
        writePromise = writeNativeSnapshot(snapshot);
      }

      await writePromise;
    },

    waitForHydration() {
      return hydrationPromise;
    },

    isHydrated() {
      return hydrated;
    },
  };

  singletonCaches.set(fileKey, instance);
  return instance;
}
