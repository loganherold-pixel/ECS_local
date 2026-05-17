/**
 * DevCloudToken — developer-only helpers for managing cloud provider tokens.
 *
 * These functions are intended to be called from a dev console, Expo dev
 * tools, or a temporary debug UI. They provide a safe, typed interface
 * to the TokenStore singleton so developers can seed API keys without
 * building a full settings screen.
 *
 * Usage (from Expo dev console or a __DEV__ bootstrap):
 *
 *   import { setEcoFlowToken } from 'src/power/cloud/dev/DevCloudToken';
 *   await setEcoFlowToken('your-ecoflow-api-key');
 *
 * The token is stored via TokenStore, which prefers expo-secure-store
 * (encrypted native keychain) and falls back to in-memory storage.
 * Tokens are NEVER written to plain AsyncStorage.
 *
 * Phase 3C — minimal dev link helper.
 */

import { tokenStore } from "../TokenStore";
import { ecsLog } from "../../../../lib/ecsLogger";

// ── Constants ───────────────────────────────────────────────────────────

/**
 * The provider ID used by EcoFlowCloudProvider.
 * Must match EcoFlowCloudProvider.id ("ecoflow").
 */
const ECOFLOW_PROVIDER_ID = "ecoflow";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Store an EcoFlow API token (or access key) into the secure TokenStore.
 *
 * @param token  The EcoFlow Developer API key or OAuth access token.
 * @param opts   Optional metadata — expiresAt (epoch ms), scope string.
 *
 * @example
 *   await setEcoFlowToken('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
 *
 * @example With expiry:
 *   await setEcoFlowToken('my-key', { expiresAt: Date.now() + 86_400_000 });
 */
export async function setEcoFlowToken(
  token: string,
  opts?: { expiresAt?: number; scope?: string },
): Promise<void> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    console.error(
      "[DevCloudToken] setEcoFlowToken() requires a non-empty string token.",
    );
    return;
  }

  await tokenStore.setToken(ECOFLOW_PROVIDER_ID, token.trim(), {
    expiresAt: opts?.expiresAt,
    scope: opts?.scope ?? "ecoflow-dev",
  });

  const backend = tokenStore.getBackendType();

  ecsLog.debug(
    'POWER',
    `[DevCloudToken] EcoFlow token stored (${backend} backend, ${token.trim().length} chars).`,
  );
}

/**
 * Remove the stored EcoFlow token (access token, refresh token, and metadata).
 *
 * @example
 *   await clearEcoFlowToken();
 */
export async function clearEcoFlowToken(): Promise<void> {
  await tokenStore.clearToken(ECOFLOW_PROVIDER_ID);

  ecsLog.debug('POWER', '[DevCloudToken] EcoFlow token cleared.');
}

/**
 * Check whether a valid (non-expired) EcoFlow token is stored.
 *
 * @returns `true` if a token exists and has not expired.
 *
 * @example
 *   const ready = await hasEcoFlowToken();
 *   console.log('EcoFlow token present:', ready);
 */
export async function hasEcoFlowToken(): Promise<boolean> {
  return tokenStore.hasToken(ECOFLOW_PROVIDER_ID);
}

/**
 * Retrieve diagnostic info about the stored EcoFlow token.
 * Returns null if no token is stored.
 *
 * The actual token value is NOT returned — only metadata.
 * This is safe to log in dev without leaking secrets.
 *
 * @example
 *   const info = await inspectEcoFlowToken();
 *   console.log(info);
 *   // { exists: true, backend: 'secure-store', storedAt: 1709..., expiresAt: undefined, scope: 'ecoflow-dev', tokenLength: 36 }
 */
export async function inspectEcoFlowToken(): Promise<{
  exists: boolean;
  backend: "secure-store" | "memory" | "custom";
  storedAt?: number;
  expiresAt?: number;
  scope?: string;
  tokenLength?: number;
} | null> {
  const exists = await tokenStore.hasToken(ECOFLOW_PROVIDER_ID);
  if (!exists) {
    return {
      exists: false,
      backend: tokenStore.getBackendType(),
    };
  }

  const meta = await tokenStore.getTokenMeta(ECOFLOW_PROVIDER_ID);
  const token = await tokenStore.getToken(ECOFLOW_PROVIDER_ID);

  return {
    exists: true,
    backend: tokenStore.getBackendType(),
    storedAt: meta?.storedAt,
    expiresAt: meta?.expiresAt,
    scope: meta?.scope,
    tokenLength: token?.length,
  };
}

// ── Dev console log hint ────────────────────────────────────────────────

/**
 * Print a one-time instructional message to the console.
 * Called from RootLayout's __DEV__ bootstrap to remind developers
 * how to seed a cloud token.
 */
export function logDevTokenInstructions(): void {
  if (!__DEV__) return;

  ecsLog.debug(
    'POWER',
    '[DevCloudToken] Cloud token helper instructions available',
    {
      helper: "Use setEcoFlowToken('your-api-key-here') from src/power/cloud/dev/DevCloudToken",
    },
  );
  ecsLog.debug(
    'POWER',
    "\n" +
      "┌─────────────────────────────────────────────────────────────┐\n" +
      "│  ECS Power — Cloud Token Helper                            │\n" +
      "├─────────────────────────────────────────────────────────────┤\n" +
      "│                                                             │\n" +
      "│  To store an EcoFlow API key for cloud telemetry:           │\n" +
      "│                                                             │\n" +
      '│    import { setEcoFlowToken }                               │\n' +
      "│      from 'src/power/cloud/dev/DevCloudToken';              │\n" +
      "│    await setEcoFlowToken('your-api-key-here');              │\n" +
      "│                                                             │\n" +
      "│  Other helpers:                                             │\n" +
      "│    clearEcoFlowToken()    — remove stored token             │\n" +
      "│    hasEcoFlowToken()      — check if token exists           │\n" +
      "│    inspectEcoFlowToken()  — view token metadata             │\n" +
      "│                                                             │\n" +
      "│  Token is stored in expo-secure-store (encrypted) if        │\n" +
      "│  available, otherwise in-memory (volatile).                 │\n" +
      "│                                                             │\n" +
      "└─────────────────────────────────────────────────────────────┘\n",
  );
}

