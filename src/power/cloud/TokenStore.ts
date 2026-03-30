/**
 * TokenStore — secure token persistence for cloud power providers.
 *
 * Provides a simple key-value API for storing authentication tokens
 * (API keys, OAuth tokens, refresh tokens) keyed by provider ID.
 *
 * Storage backend priority:
 *   1. expo-secure-store (encrypted, native keychain) — if available
 *   2. In-memory Map (volatile, cleared on app restart) — fallback
 *
 * The backend is resolved lazily on first access, so the import
 * never throws even if expo-secure-store is not installed.
 *
 * Phase 3A — skeleton with real persistence support.
 */

// ── Storage backend interface ───────────────────────────────────────────

/**
 * Minimal key-value backend contract.
 * Implementations must handle string keys and string values.
 */
export interface ITokenBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ── In-memory fallback backend ──────────────────────────────────────────

class MemoryTokenBackend implements ITokenBackend {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// ── SecureStore backend (lazy-loaded) ───────────────────────────────────

class SecureStoreBackend implements ITokenBackend {
  private secureStore: typeof import("expo-secure-store") | null = null;
  private loaded = false;

  private async ensureLoaded(): Promise<boolean> {
    if (this.loaded) return this.secureStore !== null;
    this.loaded = true;
    try {
      // Dynamic import — will fail gracefully if not installed
      this.secureStore = await import("expo-secure-store");
      return true;
    } catch {
      this.secureStore = null;
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!(await this.ensureLoaded())) return null;
    try {
      const value = await this.secureStore!.getItemAsync(key);
      return value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!(await this.ensureLoaded())) return;
    try {
      await this.secureStore!.setItemAsync(key, value);
    } catch {
      // Silently fail — caller can check via get()
    }
  }

  async remove(key: string): Promise<void> {
    if (!(await this.ensureLoaded())) return;
    try {
      await this.secureStore!.deleteItemAsync(key);
    } catch {
      // Silently fail
    }
  }
}

// ── Token key namespace ─────────────────────────────────────────────────

const TOKEN_PREFIX = "ecs_power_token_";

function tokenKey(providerId: string): string {
  return `${TOKEN_PREFIX}${providerId}`;
}

function refreshTokenKey(providerId: string): string {
  return `${TOKEN_PREFIX}${providerId}_refresh`;
}

function tokenMetaKey(providerId: string): string {
  return `${TOKEN_PREFIX}${providerId}_meta`;
}

// ── Token metadata ──────────────────────────────────────────────────────

/**
 * Optional metadata stored alongside a token.
 */
export interface TokenMeta {
  /** When the token was stored (epoch ms) */
  storedAt: number;
  /** When the token expires (epoch ms), if known */
  expiresAt?: number;
  /** Provider-specific scope or audience */
  scope?: string;
}

// ── TokenStore class ────────────────────────────────────────────────────

export class TokenStore {
  private backend: ITokenBackend;
  private backendResolved = false;
  private secureBackend: SecureStoreBackend;
  private memoryFallback: MemoryTokenBackend;

  constructor(backend?: ITokenBackend) {
    this.secureBackend = new SecureStoreBackend();
    this.memoryFallback = new MemoryTokenBackend();

    if (backend) {
      // Explicit backend injection (useful for testing)
      this.backend = backend;
      this.backendResolved = true;
    } else {
      // Will be resolved lazily
      this.backend = this.memoryFallback;
    }
  }

  // ── Lazy backend resolution ─────────────────────────────────────────

  /**
   * Attempt to upgrade to SecureStore on first real access.
   * If SecureStore is unavailable, stick with memory backend.
   */
  private async resolveBackend(): Promise<void> {
    if (this.backendResolved) return;
    this.backendResolved = true;

    // Try SecureStore first
    const testKey = `${TOKEN_PREFIX}__probe__`;
    try {
      await this.secureBackend.set(testKey, "1");
      const val = await this.secureBackend.get(testKey);
      if (val === "1") {
        await this.secureBackend.remove(testKey);
        this.backend = this.secureBackend;
        if (__DEV__) {
          console.log("[TokenStore] Using expo-secure-store backend.");
        }
        return;
      }
    } catch {
      // SecureStore not available
    }

    // Fall back to memory
    this.backend = this.memoryFallback;
    if (__DEV__) {
      console.log(
        "[TokenStore] expo-secure-store unavailable — using in-memory fallback.",
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Retrieve the stored token for a provider.
   * Returns `null` if no token is stored or if it has expired.
   */
  async getToken(providerId: string): Promise<string | null> {
    await this.resolveBackend();

    // Check expiry if metadata exists
    const meta = await this.getTokenMeta(providerId);
    if (meta?.expiresAt && Date.now() > meta.expiresAt) {
      // Token has expired — clean up
      if (__DEV__) {
        console.log(
          `[TokenStore] Token for "${providerId}" has expired — clearing.`,
        );
      }
      await this.clearToken(providerId);
      return null;
    }

    return this.backend.get(tokenKey(providerId));
  }

  /**
   * Store a token for a provider, with optional metadata.
   */
  async setToken(
    providerId: string,
    token: string,
    meta?: Partial<TokenMeta>,
  ): Promise<void> {
    await this.resolveBackend();

    await this.backend.set(tokenKey(providerId), token);

    // Store metadata
    const fullMeta: TokenMeta = {
      storedAt: Date.now(),
      ...meta,
    };
    await this.backend.set(tokenMetaKey(providerId), JSON.stringify(fullMeta));
  }

  /**
   * Store a refresh token for a provider (separate from the access token).
   */
  async setRefreshToken(
    providerId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.resolveBackend();
    await this.backend.set(refreshTokenKey(providerId), refreshToken);
  }

  /**
   * Retrieve the refresh token for a provider.
   */
  async getRefreshToken(providerId: string): Promise<string | null> {
    await this.resolveBackend();
    return this.backend.get(refreshTokenKey(providerId));
  }

  /**
   * Clear all stored tokens and metadata for a provider.
   */
  async clearToken(providerId: string): Promise<void> {
    await this.resolveBackend();
    await Promise.all([
      this.backend.remove(tokenKey(providerId)),
      this.backend.remove(refreshTokenKey(providerId)),
      this.backend.remove(tokenMetaKey(providerId)),
    ]);
  }

  /**
   * Check whether a non-expired token exists for a provider.
   */
  async hasToken(providerId: string): Promise<boolean> {
    const token = await this.getToken(providerId);
    return token !== null && token.length > 0;
  }

  /**
   * Retrieve token metadata (storage time, expiry, scope).
   */
  async getTokenMeta(providerId: string): Promise<TokenMeta | null> {
    await this.resolveBackend();
    const raw = await this.backend.get(tokenMetaKey(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TokenMeta;
    } catch {
      return null;
    }
  }

  /**
   * Return the name of the active storage backend for diagnostics.
   */
  getBackendType(): "secure-store" | "memory" | "custom" {
    if (this.backend === this.secureBackend) return "secure-store";
    if (this.backend === this.memoryFallback) return "memory";
    return "custom";
  }
}

// ── Default singleton ───────────────────────────────────────────────────

/**
 * Shared TokenStore instance used by CloudConnector and provider
 * configuration screens. Uses the best available backend.
 */
export const tokenStore = new TokenStore();

