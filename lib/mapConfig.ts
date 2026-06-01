/**
 * ECS Map Configuration — Phase 3 Mapbox Integration (Secure Token Persistence)
 *
 * Manages:
 *   - Mapbox public token retrieval (multi-source, reliable on device)
 *   - Secure token persistence via expo-secure-store on native (iOS/Android)
 *   - Map style definitions
 *   - Constants for map rendering
 *   - Bounds/camera utilities
 *
 * Token resolution order (fastest → slowest):
 *   1. In-memory cache
 *   2. Expo Constants (app.json extra / expoConfig)
 *   3. Environment variable (EXPO_PUBLIC_MAPBOX_TOKEN / EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN)
 *   4. SecureStore (encrypted native keychain — iOS/Android only)
 *   5. localStorage (web only)
 *   6. Supabase edge function (get-map-token, public pk token only)
 *   7. Empty string (graceful degradation)
 *
 * On native platforms (iOS/Android), tokens entered manually are stored
 * encrypted in the device keychain via expo-secure-store. This ensures
 * the token survives app restarts without being stored in plaintext.
 *
 * On web, localStorage is used as the persistence layer (SecureStore
 * is not available in browser environments).
 *
 * Runtime map rendering must use a public Mapbox token beginning with pk.
 * MAPBOX_DOWNLOADS_TOKEN / sk tokens are only for Android build-time Maven
 * dependency resolution and are intentionally rejected here.
 *
 * Token is fetched once and cached in memory.
 * Graceful degradation if token is missing.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import type { RunPoint, RunHealthLevel } from './runStore';
import { ecsLog } from './ecsLogger';
import { reportRecoverableFailure } from './ecsIssueReporter';

// ── Map Styles ──────────────────────────────────────────────
export type MapStyleKey = 'ecs' | 'tactical' | 'satellite' | '3d' | 'route-progress';

export interface MapStyleDef {
  key: MapStyleKey;
  label: string;
  shortLabel: string;
  url: string;
  icon: string; // Ionicons name
}

export const DEFAULT_MAP_STYLE: MapStyleKey = 'ecs';

export const MAP_STYLES: MapStyleDef[] = [
  {
    key: 'ecs',
    label: 'Default Day',
    shortLabel: 'DAY',
    url: 'mapbox://styles/mapbox/streets-v12',
    icon: 'navigate-outline',
  },
  {
    key: 'tactical',
    label: 'Tactical Dark',
    shortLabel: 'TAC',
    url: 'mapbox://styles/mapbox/dark-v11',
    icon: 'moon-outline',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    shortLabel: 'SAT',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    icon: 'earth-outline',
  },
  {
    key: '3d',
    label: '3D',
    shortLabel: '3D',
    url: 'mapbox://styles/expeditioncommand/cmonsduoz000b01spgl7bepey',
    icon: 'cube-outline',
  },
  {
    key: 'route-progress',
    label: 'Route Progress',
    shortLabel: 'RTE',
    url: 'mapbox://styles/mapbox/dark-v11',
    icon: 'git-branch-outline',
  },
];

export function getMapStyleDef(key?: MapStyleKey | null): MapStyleDef {
  return MAP_STYLES.find((style) => style.key === key) || MAP_STYLES[0];
}

export function getMapStyleUrl(key?: MapStyleKey | null): string {
  return getMapStyleDef(key).url;
}

// ── Health Colors ───────────────────────────────────────────
export const HEALTH_COLORS: Record<RunHealthLevel, string> = {
  green: '#66BB6A',
  yellow: '#FFB300',
  red: '#EF5350',
};

// ── Persistence Keys ────────────────────────────────────────
const MAPBOX_TOKEN_STORAGE_KEY = 'ecs_mapbox_access_token';
const SECURE_STORE_KEY = 'ecs_mapbox_token'; // shorter key for SecureStore (2048 char key limit)
const SECURE_STORE_SAFE_VALUE_BYTES = 1900;
const secureStoreSizeWarningKeys = new Set<string>();

function debugMapConfig(message: string, details?: Record<string, any>): void {
  ecsLog.debug('MAP', message, details);
}

function estimateStorageBytes(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length * 2;
  }
}

// ── SecureStore Lazy Loader ─────────────────────────────────
let _secureStoreModule: typeof import('expo-secure-store') | null = null;
let _secureStoreLoaded = false;
let _secureStoreAvailable = false;

async function loadSecureStore(): Promise<boolean> {
  if (_secureStoreLoaded) return _secureStoreAvailable;
  _secureStoreLoaded = true;

  if (Platform.OS === 'web') {
    _secureStoreAvailable = false;
    debugMapConfig('SecureStore skipped for web platform', { platform: Platform.OS });
    return false;
  }

  try {
    _secureStoreModule = await import('expo-secure-store');
    _secureStoreAvailable = true;
    debugMapConfig('SecureStore loaded successfully', { platform: Platform.OS });
    return true;
  } catch (e) {
    _secureStoreModule = null;
    _secureStoreAvailable = false;
    debugMapConfig('SecureStore unavailable', {
      error: e instanceof Error ? e.message : String(e),
      platform: Platform.OS,
    });
    return false;
  }
}

/**
 * Read a value from SecureStore (async, native only).
 * Returns null if SecureStore is unavailable or key doesn't exist.
 */
async function secureStoreGet(key: string): Promise<string | null> {
  if (!_secureStoreAvailable && _secureStoreLoaded) return null;
  if (!_secureStoreLoaded) {
    await loadSecureStore();
  }
  if (!_secureStoreModule) return null;
  try {
    const value = await _secureStoreModule.getItemAsync(key);
    return value;
  } catch (e) {
    console.warn(
      '[MapConfig] SecureStore.getItemAsync failed:',
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * Write a value to SecureStore (async, native only).
 * Silently fails on web or if SecureStore is unavailable.
 */
async function secureStoreSet(key: string, value: string): Promise<boolean> {
  if (!_secureStoreAvailable && _secureStoreLoaded) return false;
  if (!_secureStoreLoaded) {
    await loadSecureStore();
  }
  if (!_secureStoreModule) return false;

  const valueBytes = estimateStorageBytes(value);
  if (valueBytes > SECURE_STORE_SAFE_VALUE_BYTES) {
    if (!secureStoreSizeWarningKeys.has(key)) {
      secureStoreSizeWarningKeys.add(key);
      console.warn(
        '[MapConfig] SecureStore write skipped: value exceeds safe size limit',
        { key, bytes: valueBytes, limit: SECURE_STORE_SAFE_VALUE_BYTES },
      );
    }
    return false;
  }

  try {
    await _secureStoreModule.setItemAsync(key, value);
    debugMapConfig('SecureStore token persisted', { length: value.length });
    return true;
  } catch (e) {
    console.warn(
      '[MapConfig] SecureStore.setItemAsync failed:',
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

/**
 * Delete a value from SecureStore (async, native only).
 */
async function secureStoreDelete(key: string): Promise<boolean> {
  if (!_secureStoreAvailable && _secureStoreLoaded) return false;
  if (!_secureStoreLoaded) {
    await loadSecureStore();
  }
  if (!_secureStoreModule) return false;
  try {
    await _secureStoreModule.deleteItemAsync(key);
    debugMapConfig('SecureStore token deleted');
    return true;
  } catch (e) {
    console.warn(
      '[MapConfig] SecureStore.deleteItemAsync failed:',
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

// ── Web/Fallback Persistence (localStorage + in-memory) ─────
const memoryStore: Record<string, string> = {};

function webPersistGet(key: string): string {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch {}
  return memoryStore[key] || '';
}

function webPersistSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch {}

  if (value) {
    memoryStore[key] = value;
  } else {
    delete memoryStore[key];
  }
}

// ── Token Management ────────────────────────────────────────
let cachedToken: string | null = null;
let tokenFetched = false;
let tokenResolutionPromise: Promise<string> | null = null;

/**
 * Validate that a string is a Mapbox public runtime token.
 */
function isValidMapboxToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < 10) return false;
  if (trimmed === 'undefined' || trimmed === 'null' || trimmed === 'YOUR_TOKEN_HERE') return false;
  return trimmed.startsWith('pk.');
}

/**
 * Attempt to read EXPO_PUBLIC_MAPBOX_TOKEN from the environment.
 * In Expo, process.env.EXPO_PUBLIC_* variables are inlined at build time.
 */
function getEnvToken(): string {
  try {
    const candidates = [
      ['EXPO_PUBLIC_MAPBOX_TOKEN', process.env.EXPO_PUBLIC_MAPBOX_TOKEN],
      ['EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN', process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN],
    ] as const;

    for (const [key, rawToken] of candidates) {
      const envToken = String(rawToken ?? '');
      if (isValidMapboxToken(envToken)) {
        debugMapConfig(`Found ${key} from environment`, { length: envToken.length });
        return envToken;
      }
      if (envToken && envToken.length > 0) {
        console.warn(
          `[MapConfig] ${key} is set but does not look valid (length:`,
          envToken.length,
          ', prefix:',
          envToken.substring(0, 5),
          ')',
        );
      }
    }
  } catch {}
  return '';
}

/**
 * Attempt to read the Mapbox token from Expo Constants.
 * This reads from app.json > expo > extra or app.config.js/ts extra fields.
 * Works reliably on device builds.
 */
function getConstantsToken(): string {
  try {
    const extra = Constants?.expoConfig?.extra;
    if (extra) {
      const candidates = [
        extra.MAPBOX_ACCESS_TOKEN,
        extra.mapboxAccessToken,
        extra.mapbox_access_token,
        extra.EXPO_PUBLIC_MAPBOX_TOKEN,
        extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
      ];
      for (const candidate of candidates) {
        if (isValidMapboxToken(candidate)) {
          debugMapConfig('Found Mapbox token from Constants.expoConfig.extra', { length: candidate.length });
          return candidate;
        }
      }
    }

    const legacyManifest = Constants?.manifest as { extra?: Record<string, string | undefined> } | null | undefined;
    const legacyExtra = legacyManifest?.extra;
    if (legacyExtra) {
      const candidates = [
        legacyExtra.MAPBOX_ACCESS_TOKEN,
        legacyExtra.mapboxAccessToken,
        legacyExtra.mapbox_access_token,
        legacyExtra.EXPO_PUBLIC_MAPBOX_TOKEN,
        legacyExtra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && isValidMapboxToken(candidate)) {
          debugMapConfig('Found Mapbox token from Constants.manifest.extra', { length: candidate.length });
          return candidate;
        }
      }
    }

    const manifest2 = Constants?.manifest2 as { extra?: { expoClient?: { extra?: Record<string, string | undefined> } } } | null | undefined;
    const manifest2Extra = manifest2?.extra?.expoClient?.extra;
    if (manifest2Extra) {
      const candidates = [
        manifest2Extra.MAPBOX_ACCESS_TOKEN,
        manifest2Extra.mapboxAccessToken,
        manifest2Extra.EXPO_PUBLIC_MAPBOX_TOKEN,
        manifest2Extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && isValidMapboxToken(candidate)) {
          debugMapConfig('Found Mapbox token from manifest2', { length: candidate.length });
          return candidate;
        }
      }
    }
  } catch (e) {
    debugMapConfig('expo-constants token lookup failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return '';
}

/**
 * Attempt to read a previously persisted token from web/memory storage (sync).
 */
function getWebPersistedToken(): string {
  const stored = webPersistGet(MAPBOX_TOKEN_STORAGE_KEY);
  if (isValidMapboxToken(stored)) {
    debugMapConfig('Found persisted Mapbox token in web storage', { length: stored.length });
    return stored;
  }
  return '';
}

/**
 * Attempt to read a previously persisted token from SecureStore (async, native only).
 */
async function getSecurePersistedTokenAsync(): Promise<string> {
  const stored = await secureStoreGet(SECURE_STORE_KEY);
  if (isValidMapboxToken(stored)) {
    const storedToken = stored ?? '';
    debugMapConfig('Found SecureStore-persisted Mapbox token', { length: storedToken.length });
    return storedToken;
  }
  return '';
}

/**
 * Persist a token to all available storage backends.
 */
function persistToken(token: string): void {
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, token);

  if (Platform.OS !== 'web' && token) {
    secureStoreSet(SECURE_STORE_KEY, token).catch((e) => {
      console.warn('[MapConfig] Background SecureStore write failed:', e);
    });
  }
}

/**
 * Persist a token to all available storage backends (async version).
 */
async function persistTokenAsync(token: string): Promise<boolean> {
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, token);

  if (Platform.OS !== 'web' && token) {
    return await secureStoreSet(SECURE_STORE_KEY, token);
  }
  return Platform.OS === 'web';
}

/**
 * Clear token from all storage backends.
 */
async function clearPersistedToken(): Promise<void> {
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, '');
  await secureStoreDelete(SECURE_STORE_KEY);
}

/**
 * Manually set the Mapbox token.
 */
export function setMapboxToken(token: string): void {
  tokenFetched = true;
  if (isValidMapboxToken(token)) {
    const trimmedToken = token.trim();
    cachedToken = trimmedToken;
    persistToken(trimmedToken);
    debugMapConfig('Token manually set and persisted', { length: token.length });
  } else {
    cachedToken = '';
    debugMapConfig('Token manually set but not persisted because format is invalid', {
      length: token.length,
    });
  }
}

/**
 * Async version of setMapboxToken that awaits SecureStore persistence.
 */
export async function setMapboxTokenAsync(token: string): Promise<{
  persisted: boolean;
  secureStore: boolean;
  storage: 'secure-store' | 'localStorage' | 'memory';
}> {
  tokenFetched = true;

  if (!isValidMapboxToken(token)) {
    cachedToken = '';
    debugMapConfig('Async token set skipped persistence because format is invalid', {
      length: token.length,
    });
    return { persisted: false, secureStore: false, storage: 'memory' };
  }

  const trimmedToken = token.trim();
  cachedToken = trimmedToken;
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, trimmedToken);

  if (Platform.OS !== 'web') {
    const secureSuccess = await secureStoreSet(SECURE_STORE_KEY, trimmedToken);
    if (secureSuccess) {
      debugMapConfig('Token persisted to encrypted keychain via SecureStore');
      return { persisted: true, secureStore: true, storage: 'secure-store' };
    }
    debugMapConfig('SecureStore unavailable; token persisted to memory only');
    return { persisted: true, secureStore: false, storage: 'memory' };
  }

  debugMapConfig('Token persisted to localStorage');
  return { persisted: true, secureStore: false, storage: 'localStorage' };
}

/**
 * Retrieve the Mapbox public access token.
 */
async function resolveMapboxToken(): Promise<string> {
  if (cachedToken !== null && cachedToken.length > 0) {
    if (isValidMapboxToken(cachedToken)) {
      return cachedToken;
    }
    cachedToken = '';
    tokenFetched = true;
    return '';
  }
  if (tokenFetched && cachedToken !== null) {
    return cachedToken;
  }

  debugMapConfig('Resolving Mapbox token', { platform: Platform.OS });

  const constantsToken = getConstantsToken();
  if (constantsToken) {
    debugMapConfig('Using token from Expo Constants');
    cachedToken = constantsToken;
    tokenFetched = true;
    persistToken(constantsToken);
    return constantsToken;
  }

  const envToken = getEnvToken();
  if (envToken) {
    debugMapConfig('Using EXPO_PUBLIC_MAPBOX_TOKEN from environment');
    cachedToken = envToken;
    tokenFetched = true;
    persistToken(envToken);
    return envToken;
  }

  if (Platform.OS !== 'web') {
    const secureToken = await getSecurePersistedTokenAsync();
    if (secureToken) {
      debugMapConfig('Using token from SecureStore');
      cachedToken = secureToken;
      tokenFetched = true;
      memoryStore[MAPBOX_TOKEN_STORAGE_KEY] = secureToken;
      return secureToken;
    }
  }

  const webToken = getWebPersistedToken();
  if (webToken) {
    debugMapConfig('Using web-persisted token');
    cachedToken = webToken;
    tokenFetched = true;
    if (Platform.OS !== 'web') {
      secureStoreSet(SECURE_STORE_KEY, webToken).catch(() => {});
      debugMapConfig('Migrating persisted token into SecureStore');
    }
    return webToken;
  }

  try {
    debugMapConfig('Fetching token from edge function', { source: 'get-map-token' });

    const edgeFunctionPromise = supabase.functions.invoke('get-map-token', {
      body: {},
    });

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: { message: 'Edge function timeout (8s)' } }), 8000);
    });

    const { data, error } = await Promise.race([edgeFunctionPromise, timeoutPromise]);

    if (error) {
      console.warn('[MapConfig] Edge function error:', error.message || error);
      reportRecoverableFailure({
        severity: 'high',
        issueTitle: 'Map token resolution failed',
        ecsArea: 'navigate',
        message: typeof error?.message === 'string' ? error.message : 'Map token edge function error',
        signature: `map_token_error:${typeof error?.message === 'string' ? error.message : 'edge_error'}`,
        metadata: {
          source: 'get-map-token',
        },
      });
    } else if (data?.token && isValidMapboxToken(data.token)) {
      debugMapConfig('Valid Mapbox token received from edge function', { length: data.token.length });
      cachedToken = data.token;
      tokenFetched = true;
      persistToken(data.token);
      return data.token;
    } else {
      console.warn(
        '[MapConfig] Edge function returned no valid token.',
        data?.error ? `Reason: ${data.error}` : '',
        data?.diagnostics ? `Diagnostics: ${JSON.stringify(data.diagnostics)}` : '',
      );
      reportRecoverableFailure({
        severity: 'high',
        issueTitle: 'Map token unavailable',
        ecsArea: 'navigate',
        message: typeof data?.error === 'string' ? data.error : 'Map token edge function returned no valid token',
        signature: `map_token_missing:${typeof data?.error === 'string' ? data.error : 'invalid_token'}`,
        metadata: {
          diagnostics: data?.diagnostics ?? null,
        },
      });
    }
  } catch (err) {
    console.warn('[MapConfig] Failed to invoke get-map-token edge function:', err);
    reportRecoverableFailure({
      severity: 'high',
      issueTitle: 'Map token invocation failed',
      ecsArea: 'navigate',
      error: err,
      message: err instanceof Error ? err.message : 'Failed to invoke map token edge function',
      signature: `map_token_exception:${err instanceof Error ? err.message : 'unknown'}`,
    });
  }

  console.warn(
    '[MapConfig] No Mapbox token available from any source.\n' +
      'To fix, use ONE of these methods:\n' +
      '  1. Set EXPO_PUBLIC_MAPBOX_TOKEN or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file\n' +
      '  2. Add extra.MAPBOX_ACCESS_TOKEN to app.json or app.config.js\n' +
      '  3. Set MAPBOX_ACCESS_TOKEN in Supabase Edge Function Secrets\n' +
      '  4. Enter the token manually in the Navigate tab',
  );
  reportRecoverableFailure({
    severity: 'high',
    issueTitle: 'Map token missing from all sources',
    ecsArea: 'navigate',
    message: 'No Mapbox token available from any configured source',
    signature: 'map_token_missing_all_sources',
  });
  tokenFetched = true;
  cachedToken = '';
  return '';
}

export async function getMapboxToken(): Promise<string> {
  if (cachedToken !== null && cachedToken.length > 0) {
    return cachedToken;
  }
  if (tokenFetched && cachedToken !== null) {
    return cachedToken;
  }
  if (tokenResolutionPromise) {
    return tokenResolutionPromise;
  }

  const startedAt = Date.now();
  tokenResolutionPromise = resolveMapboxToken()
    .then((token) => {
      debugMapConfig('Mapbox token resolution completed', {
        resolved: token.length > 0,
        platform: Platform.OS,
        durationMs: Date.now() - startedAt,
        source: token.length > 0 ? 'resolved' : 'empty',
      });
      return token;
    })
    .catch((error) => {
      debugMapConfig('Mapbox token resolution failed', {
        platform: Platform.OS,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      tokenResolutionPromise = null;
    });

  return tokenResolutionPromise;
}

/**
 * Synchronous check: returns the cached token if available, empty string otherwise.
 */
export function getMapboxTokenSync(): string {
  if (cachedToken !== null && cachedToken.length > 0) {
    if (isValidMapboxToken(cachedToken)) {
      return cachedToken;
    }
    cachedToken = '';
    tokenFetched = true;
    return '';
  }

  const constantsToken = getConstantsToken();
  if (constantsToken) {
    cachedToken = constantsToken;
    tokenFetched = true;
    memoryStore[MAPBOX_TOKEN_STORAGE_KEY] = constantsToken;
    return constantsToken;
  }

  const envToken = getEnvToken();
  if (envToken) {
    cachedToken = envToken;
    tokenFetched = true;
    memoryStore[MAPBOX_TOKEN_STORAGE_KEY] = envToken;
    return envToken;
  }

  const persisted = getWebPersistedToken();
  if (persisted) {
    cachedToken = persisted;
    tokenFetched = true;
    return persisted;
  }
  return '';
}

export function hasMapToken(): boolean {
  return cachedToken !== null && cachedToken.length > 0;
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenFetched = false;
  tokenResolutionPromise = null;
  debugMapConfig('Token cache cleared');
}

/**
 * Clear both the in-memory cache AND all persisted tokens.
 */
export function clearTokenFully(): void {
  cachedToken = null;
  tokenFetched = false;
  tokenResolutionPromise = null;
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, '');
  secureStoreDelete(SECURE_STORE_KEY).catch(() => {});
  debugMapConfig('Token fully cleared');
}

/**
 * Async version of clearTokenFully that awaits SecureStore deletion.
 */
export async function clearTokenFullyAsync(): Promise<void> {
  cachedToken = null;
  tokenFetched = false;
  tokenResolutionPromise = null;
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, '');
  await secureStoreDelete(SECURE_STORE_KEY);
  debugMapConfig('Token fully cleared and confirmed');
}

/**
 * Get diagnostic info about the current token persistence state.
 */
export async function getTokenDiagnostics(): Promise<{
  hasCachedToken: boolean;
  hasWebPersistedToken: boolean;
  hasSecureStoreToken: boolean;
  secureStoreAvailable: boolean;
  platform: string;
  tokenLength: number;
  tokenPrefix: string;
}> {
  const webToken = getWebPersistedToken();
  const secureToken = await getSecurePersistedTokenAsync();
  const currentToken = cachedToken || webToken || secureToken || '';

  return {
    hasCachedToken: cachedToken !== null && cachedToken.length > 0,
    hasWebPersistedToken: webToken.length > 0,
    hasSecureStoreToken: secureToken.length > 0,
    secureStoreAvailable: _secureStoreAvailable,
    platform: Platform.OS,
    tokenLength: currentToken.length,
    tokenPrefix: currentToken.length > 5 ? currentToken.substring(0, 5) + '...' : '',
  };
}

// ── Bounds Calculation ──────────────────────────────────────
export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

export function computeBounds(points: RunPoint[]): MapBounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

/**
 * Compute zoom level from bounds to fit a given pixel dimension.
 */
export function boundsToZoom(bounds: MapBounds, pixelWidth: number, pixelHeight: number): number {
  const WORLD_DIM = { height: 256, width: 256 };
  const ZOOM_MAX = 18;

  function latRad(lat: number) {
    const sin = Math.sin((lat * Math.PI) / 180);
    const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
    return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
  }

  function zoom(mapPx: number, worldPx: number, fraction: number) {
    return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
  }

  const latFraction = (latRad(bounds.maxLat) - latRad(bounds.minLat)) / Math.PI;
  const lngDiff = bounds.maxLng - bounds.minLng;
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;

  const latZoom = zoom(pixelHeight, WORLD_DIM.height, latFraction);
  const lngZoom = zoom(pixelWidth, WORLD_DIM.width, lngFraction);

  return Math.min(latZoom, lngZoom, ZOOM_MAX);
}

/**
 * Simplify points using nth-point sampling for performance.
 */
export function simplifyPoints(points: RunPoint[], maxPoints: number = 2000): RunPoint[] {
  if (points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  const simplified: RunPoint[] = [];

  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }

  if (simplified[simplified.length - 1] !== points[points.length - 1]) {
    simplified.push(points[points.length - 1]);
  }

  return simplified;
}

// ── GeoJSON Helpers ─────────────────────────────────────────
export function pointsToGeoJSON(points: RunPoint[]): any {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

export function waypointsToGeoJSON(
  waypoints: { lat: number; lon: number; name?: string }[],
): any {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((wp, i) => ({
      type: 'Feature',
      properties: { name: wp.name || `WP ${i + 1}`, index: i },
      geometry: {
        type: 'Point',
        coordinates: [wp.lon, wp.lat],
      },
    })),
  };
}

// ── Offline Pack Types ──────────────────────────────────────
export interface OfflinePack {
  id: string;
  name: string;
  bounds: MapBounds;
  corridorMiles: number;
  styles: MapStyleKey[];
  zoomRange: [number, number];
  status: 'pending' | 'downloading' | 'complete' | 'error';
  progress: number;
  sizeMB: number;
  createdAt: string;
  runId?: string;
}

// ── Default Map Center (CONUS) ──────────────────────────────
export const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
export const DEFAULT_ZOOM = 4;
