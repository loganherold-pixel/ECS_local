import { loadRnMapboxModule } from './rnMapboxModule';
import { getMapboxToken, getMapboxTokenSync } from '../mapConfig';

export type MapboxNativeInitReason =
  | 'ready'
  | 'missing_token'
  | 'invalid_token'
  | 'native_module_unavailable'
  | 'set_access_token_unavailable';

export interface MapboxNativeInitResult {
  initialized: boolean;
  hasMapboxToken: boolean;
  reason: MapboxNativeInitReason;
  tokenPreview: string;
}

const MAPBOX_PUBLIC_TOKEN_ENV_KEY = 'EXPO_PUBLIC_MAPBOX_TOKEN';

function getRawPublicMapboxToken(): string {
  const token = getMapboxTokenSync();
  return typeof token === 'string' ? token.trim() : '';
}

function isPlaceholderToken(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  return (
    normalized === 'your_token_here' ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized.includes('default_public_token')
  );
}

export function isValidPublicMapboxToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < 10 || isPlaceholderToken(trimmed)) return false;
  return trimmed.startsWith('pk.');
}

export function getMapboxTokenPreview(token: string = getRawPublicMapboxToken()): string {
  if (!token) return 'not-set';
  const trimmed = token.trim();
  if (trimmed.length <= 8) return `${trimmed.length}-chars`;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function getMapboxPublicTokenStatus(): {
  envKey: typeof MAPBOX_PUBLIC_TOKEN_ENV_KEY;
  hasMapboxToken: boolean;
  tokenPreview: string;
} {
  const token = getRawPublicMapboxToken();
  return {
    envKey: MAPBOX_PUBLIC_TOKEN_ENV_KEY,
    hasMapboxToken: isValidPublicMapboxToken(token),
    tokenPreview: getMapboxTokenPreview(token),
  };
}

export const hasMapboxToken = getMapboxPublicTokenStatus().hasMapboxToken;

export async function initializeMapboxAccessToken(): Promise<MapboxNativeInitResult> {
  const cachedToken = getRawPublicMapboxToken();
  const token = isValidPublicMapboxToken(cachedToken)
    ? cachedToken
    : (await getMapboxToken().catch(() => '')).trim();
  const tokenPreview = getMapboxTokenPreview(token);

  if (!token) {
    return {
      initialized: false,
      hasMapboxToken: false,
      reason: 'missing_token',
      tokenPreview,
    };
  }

  if (!isValidPublicMapboxToken(token)) {
    return {
      initialized: false,
      hasMapboxToken: false,
      reason: 'invalid_token',
      tokenPreview,
    };
  }

  try {
    const mapbox = loadRnMapboxModule();
    if (!mapbox) {
      return {
        initialized: false,
        hasMapboxToken: true,
        reason: 'native_module_unavailable',
        tokenPreview,
      };
    }

    if (typeof mapbox.setAccessToken !== 'function') {
      return {
        initialized: false,
        hasMapboxToken: true,
        reason: 'set_access_token_unavailable',
        tokenPreview,
      };
    }

    mapbox.setAccessToken(token);
    return {
      initialized: true,
      hasMapboxToken: true,
      reason: 'ready',
      tokenPreview,
    };
  } catch {
    return {
      initialized: false,
      hasMapboxToken: true,
      reason: 'native_module_unavailable',
      tokenPreview,
    };
  }
}
