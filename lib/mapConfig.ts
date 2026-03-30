/**
 * ECS Map Configuration — Phase 3 Mapbox Integration (Secure Token Persistence)
 *
 * Manages:
 *   - Mapbox token retrieval (multi-source, reliable on device)
 *   - Secure token persistence via expo-secure-store on native (iOS/Android)
 *   - Map style definitions
 *   - Constants for map rendering
 *   - Bounds/camera utilities
 *
 * Token resolution order (fastest → slowest):
 *   1. In-memory cache
 *   2. SecureStore (encrypted native keychain — iOS/Android only)
 *   3. localStorage (web only)
 *   4. Expo Constants (app.json extra / expoConfig)
 *   5. Environment variable (EXPO_PUBLIC_MAPBOX_TOKEN)
 *   6. Supabase edge function (get-map-token)
 *   7. Empty string (graceful degradation)
 *
 * On native platforms (iOS/Android), tokens entered manually are stored
 * encrypted in the device keychain via expo-secure-store. This ensures
 * the token survives app restarts without being stored in plaintext.
 *
 * On web, localStorage is used as the persistence layer (SecureStore
 * is not available in browser environments).
 *
 * Token is fetched once and cached in memory.
 * Graceful degradation if token is missing.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { RunPoint, RunHealthLevel } from './runStore';

// ── Map Styles ──────────────────────────────────────────────
export type MapStyleKey = 'ecs' | 'tactical' | 'satellite';

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
    url: 'mapbox://styles/expeditioncommand/cmn2jiff200ne01rn1o3shhna',
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
  url: 'mapbox://styles/expeditioncommand/cmn2k6y89000e01r683ish0c7',
  icon: 'earth-outline',
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

// ── SecureStore Lazy Loader ─────────────────────────────────
let _secureStoreModule: typeof import('expo-secure-store') | null = null;
let _secureStoreLoaded = false;
let _secureStoreAvailable = false;

async function loadSecureStore(): Promise<boolean> {
  if (_secureStoreLoaded) return _secureStoreAvailable;
  _secureStoreLoaded = true;

  if (Platform.OS === 'web') {
    _secureStoreAvailable = false;
    console.log('[MapConfig] SecureStore: skipped (web platform — using localStorage)');
    return false;
  }

  try {
    _secureStoreModule = await import('expo-secure-store');
    _secureStoreAvailable = true;
    console.log('[MapConfig] SecureStore: loaded successfully (native keychain available)');
    return true;
  } catch (e) {
    _secureStoreModule = null;
    _secureStoreAvailable = false;
    console.log(
      '[MapConfig] SecureStore: not available —',
      e instanceof Error ? e.message : String(e),
    );
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
  try {
    await _secureStoreModule.setItemAsync(key, value);
    console.log(
      '[MapConfig] SecureStore: token persisted to native keychain (length:',
      value.length,
      ')',
    );
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
    console.log('[MapConfig] SecureStore: token deleted from native keychain');
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

/**
 * Validate that a string looks like a valid Mapbox public token.
 */
function isValidMapboxToken(token: string | undefined | null): token is string {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 10) return false;
  if (token === 'undefined' || token === 'null' || token === 'YOUR_TOKEN_HERE') return false;
  if (token.startsWith('pk.')) return true;
  if (token.startsWith('sk.')) return true;
  if (token.length > 50) return true;
  return false;
}

/**
 * Attempt to read EXPO_PUBLIC_MAPBOX_TOKEN from the environment.
 * In Expo, process.env.EXPO_PUBLIC_* variables are inlined at build time.
 */
function getEnvToken(): string {
  try {
    const envToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
    if (isValidMapboxToken(envToken)) {
      console.log(
        '[MapConfig] Found valid EXPO_PUBLIC_MAPBOX_TOKEN from environment (length:',
        envToken.length,
        ')',
      );
      return envToken;
    }
    if (envToken && envToken.length > 0) {
      console.warn(
        '[MapConfig] EXPO_PUBLIC_MAPBOX_TOKEN is set but does not look valid (length:',
        envToken.length,
        ', prefix:',
        envToken.substring(0, 5),
        ')',
      );
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
    const Constants = require('expo-constants').default;

    const extra = Constants?.expoConfig?.extra;
    if (extra) {
      const candidates = [
        extra.MAPBOX_ACCESS_TOKEN,
        extra.mapboxAccessToken,
        extra.mapbox_access_token,
        extra.EXPO_PUBLIC_MAPBOX_TOKEN,
      ];
      for (const candidate of candidates) {
        if (isValidMapboxToken(candidate)) {
          console.log(
            '[MapConfig] Found valid Mapbox token from Constants.expoConfig.extra (length:',
            candidate.length,
            ')',
          );
          return candidate;
        }
      }
    }

    const legacyExtra = Constants?.manifest?.extra;
    if (legacyExtra) {
      const candidates = [
        legacyExtra.MAPBOX_ACCESS_TOKEN,
        legacyExtra.mapboxAccessToken,
        legacyExtra.mapbox_access_token,
      ];
      for (const candidate of candidates) {
        if (isValidMapboxToken(candidate)) {
          console.log(
            '[MapConfig] Found valid Mapbox token from Constants.manifest.extra (length:',
            candidate.length,
            ')',
          );
          return candidate;
        }
      }
    }

    const manifest2Extra = Constants?.manifest2?.extra?.expoClient?.extra;
    if (manifest2Extra) {
      const candidates = [
        manifest2Extra.MAPBOX_ACCESS_TOKEN,
        manifest2Extra.mapboxAccessToken,
      ];
      for (const candidate of candidates) {
        if (isValidMapboxToken(candidate)) {
          console.log(
            '[MapConfig] Found valid Mapbox token from manifest2 (length:',
            candidate.length,
            ')',
          );
          return candidate;
        }
      }
    }
  } catch (e) {
    console.log('[MapConfig] expo-constants not available or failed:', e);
  }
  return '';
}

/**
 * Attempt to read a previously persisted token from web/memory storage (sync).
 */
function getWebPersistedToken(): string {
  const stored = webPersistGet(MAPBOX_TOKEN_STORAGE_KEY);
  if (isValidMapboxToken(stored)) {
    console.log('[MapConfig] Found web-persisted Mapbox token (length:', stored.length, ')');
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
    console.log(
      '[MapConfig] Found SecureStore-persisted Mapbox token (encrypted keychain, length:',
      stored.length,
      ')',
    );
    return stored;
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
  cachedToken = token;
  tokenFetched = true;
  if (isValidMapboxToken(token)) {
    persistToken(token);
    console.log('[MapConfig] Token manually set and persisted (length:', token.length, ')');
  } else {
    console.log(
      '[MapConfig] Token manually set (length:',
      token.length,
      ') — not persisted (invalid format)',
    );
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
  cachedToken = token;
  tokenFetched = true;

  if (!isValidMapboxToken(token)) {
    console.log(
      '[MapConfig] Token set (length:',
      token.length,
      ') — not persisted (invalid format)',
    );
    return { persisted: false, secureStore: false, storage: 'memory' };
  }

  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, token);

  if (Platform.OS !== 'web') {
    const secureSuccess = await secureStoreSet(SECURE_STORE_KEY, token);
    if (secureSuccess) {
      console.log('[MapConfig] Token persisted to encrypted keychain via SecureStore');
      return { persisted: true, secureStore: true, storage: 'secure-store' };
    }
    console.log('[MapConfig] SecureStore unavailable — token persisted to memory only');
    return { persisted: true, secureStore: false, storage: 'memory' };
  }

  console.log('[MapConfig] Token persisted to localStorage (web)');
  return { persisted: true, secureStore: false, storage: 'localStorage' };
}

/**
 * Retrieve the Mapbox public access token.
 */
export async function getMapboxToken(): Promise<string> {
  if (cachedToken !== null && cachedToken.length > 0) {
    return cachedToken;
  }
  if (tokenFetched && cachedToken !== null) {
    return cachedToken;
  }

  console.log('[MapConfig] Resolving Mapbox token...');
  console.log('[MapConfig] Platform:', Platform.OS);

  if (Platform.OS !== 'web') {
    const secureToken = await getSecurePersistedTokenAsync();
    if (secureToken) {
      console.log('[MapConfig] Using token from SecureStore (encrypted keychain)');
      cachedToken = secureToken;
      tokenFetched = true;
      memoryStore[MAPBOX_TOKEN_STORAGE_KEY] = secureToken;
      return secureToken;
    }
  }

  const webToken = getWebPersistedToken();
  if (webToken) {
    console.log('[MapConfig] Using web-persisted token');
    cachedToken = webToken;
    tokenFetched = true;
    if (Platform.OS !== 'web') {
      secureStoreSet(SECURE_STORE_KEY, webToken).catch(() => {});
      console.log('[MapConfig] Migrating memory token to SecureStore for encrypted persistence');
    }
    return webToken;
  }

  const constantsToken = getConstantsToken();
  if (constantsToken) {
    console.log('[MapConfig] Using token from Expo Constants');
    cachedToken = constantsToken;
    tokenFetched = true;
    persistToken(constantsToken);
    return constantsToken;
  }

  const envToken = getEnvToken();
  if (envToken) {
    console.log('[MapConfig] Using EXPO_PUBLIC_MAPBOX_TOKEN from environment');
    cachedToken = envToken;
    tokenFetched = true;
    persistToken(envToken);
    return envToken;
  }

  try {
    console.log('[MapConfig] Fetching token from edge function get-map-token...');

    const edgeFunctionPromise = supabase.functions.invoke('get-map-token', {
      body: {},
    });

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: { message: 'Edge function timeout (8s)' } }), 8000);
    });

    const { data, error } = await Promise.race([edgeFunctionPromise, timeoutPromise]);

    if (error) {
      console.warn('[MapConfig] Edge function error:', error.message || error);
    } else if (data?.token && isValidMapboxToken(data.token)) {
      console.log(
        '[MapConfig] Valid Mapbox token received from edge function (length:',
        data.token.length,
        ')',
      );
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
    }
  } catch (err) {
    console.warn('[MapConfig] Failed to invoke get-map-token edge function:', err);
  }

  console.warn(
    '[MapConfig] No Mapbox token available from any source.\n' +
      'To fix, use ONE of these methods:\n' +
      '  1. Set EXPO_PUBLIC_MAPBOX_TOKEN in your .env file\n' +
      '  2. Add extra.MAPBOX_ACCESS_TOKEN to app.json or app.config.js\n' +
      '  3. Set MAPBOX_ACCESS_TOKEN in Supabase Edge Function Secrets\n' +
      '  4. Enter the token manually in the Navigate tab',
  );
  tokenFetched = true;
  cachedToken = '';
  return '';
}

/**
 * Synchronous check: returns the cached token if available, empty string otherwise.
 */
export function getMapboxTokenSync(): string {
  if (cachedToken !== null && cachedToken.length > 0) {
    return cachedToken;
  }
  const persisted = getWebPersistedToken();
  if (persisted) {
    cachedToken = persisted;
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
  console.log('[MapConfig] Token cache cleared — next call will re-fetch from all sources');
}

/**
 * Clear both the in-memory cache AND all persisted tokens.
 */
export function clearTokenFully(): void {
  cachedToken = null;
  tokenFetched = false;
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, '');
  secureStoreDelete(SECURE_STORE_KEY).catch(() => {});
  console.log('[MapConfig] Token fully cleared (cache + localStorage + SecureStore)');
}

/**
 * Async version of clearTokenFully that awaits SecureStore deletion.
 */
export async function clearTokenFullyAsync(): Promise<void> {
  cachedToken = null;
  tokenFetched = false;
  webPersistSet(MAPBOX_TOKEN_STORAGE_KEY, '');
  await secureStoreDelete(SECURE_STORE_KEY);
  console.log('[MapConfig] Token fully cleared (cache + localStorage + SecureStore) — confirmed');
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
  waypoints: Array<{ lat: number; lon: number; name?: string }>,
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