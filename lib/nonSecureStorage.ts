import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

type NonSecureStorageOptions = {
  logTag?: string;
};

const resolvedLegacyKeys = new Set<string>();

async function readLegacySecureStore(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (resolvedLegacyKeys.has(key)) return null;
  try {
    const SecureStore = await import('expo-secure-store');
    const value = await SecureStore.getItemAsync(key);
    if (!value) {
      resolvedLegacyKeys.add(key);
    }
    return value;
  } catch {
    resolvedLegacyKeys.add(key);
    return null;
  }
}

async function clearLegacySecureStore(key: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (resolvedLegacyKeys.has(key)) return;
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {}
  resolvedLegacyKeys.add(key);
}

export function createMigratingNonSecureStorage(
  fileKey: string,
  options: NonSecureStorageOptions = {},
) {
  const cache = createPersistedKeyValueCache(fileKey);
  const tag = options.logTag ?? 'NonSecureStorage';

  return {
    async read(key: string): Promise<string | null> {
      await cache.waitForHydration();

      const current = cache.get(key);
      if (typeof current === 'string' && current.length > 0) {
        return current;
      }

      const legacy = await readLegacySecureStore(key);
      if (typeof legacy === 'string' && legacy.length > 0) {
        cache.set(key, legacy);
        await clearLegacySecureStore(key);
        console.log(`[${tag}] Migrated legacy SecureStore value for ${key}`);
        return legacy;
      }

      return null;
    },

    async write(key: string, value: string | null): Promise<void> {
      await cache.waitForHydration();

      if (typeof value === 'string' && value.length > 0) {
        cache.set(key, value);
      } else {
        cache.delete(key);
      }

      await cache.flush();

      await clearLegacySecureStore(key);
    },

    async remove(key: string): Promise<void> {
      await cache.waitForHydration();
      cache.delete(key);
      await cache.flush();
      await clearLegacySecureStore(key);
    },
  };
}
