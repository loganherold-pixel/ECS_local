// supabase.ts
import { Platform } from "react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createPersistedKeyValueCache } from "./keyValuePersistence";

/**
 * Supabase Client Configuration
 *
 * Uses environment variables only.
 * Production builds must never silently fall back to a different backend.
 * When credentials are missing we expose a no-op client so imports stay safe,
 * but cloud-backed features are treated as unavailable.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

const DEPLOYED_EDGE_FUNCTIONS = new Set([
  "auth-handler",
  "ecoflow",
  "get-weather",
  "ai-route-suggestions",
  "issue-intelligence",
  "get-map-token",
  "campgrounds-search",
  "campground-detail",
  "dispersed-camping-eligibility",
]);
export const EDGE_FUNCTION_UNAVAILABLE_CODE = "EDGE_FUNCTION_UNAVAILABLE";
export const SUPABASE_CONFIG_UNAVAILABLE_CODE = "SUPABASE_CONFIG_UNAVAILABLE";
const EDGE_FUNCTION_WARNING_COOLDOWN_MS = 60_000;
const edgeFunctionWarningCache = new Map<string, number>();

const missingSupabaseEnv = [
  !url ? "EXPO_PUBLIC_SUPABASE_URL" : null,
  !anon ? "EXPO_PUBLIC_SUPABASE_ANON_KEY" : null,
].filter((value): value is string => typeof value === "string");

const nativeSupabaseAuthCache = createPersistedKeyValueCache("supabase_auth_state");

const nativeSupabaseStorage = {
  async getItem(key: string): Promise<string | null> {
    await nativeSupabaseAuthCache.waitForHydration();
    return nativeSupabaseAuthCache.get(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    await nativeSupabaseAuthCache.waitForHydration();
    nativeSupabaseAuthCache.set(key, value);
    await nativeSupabaseAuthCache.flush();
  },

  async removeItem(key: string): Promise<void> {
    await nativeSupabaseAuthCache.waitForHydration();
    nativeSupabaseAuthCache.delete(key);
    await nativeSupabaseAuthCache.flush();
  },
};

function shouldWarnEdgeFunction(signature: string): boolean {
  const now = Date.now();
  const last = edgeFunctionWarningCache.get(signature) ?? 0;
  if (now - last < EDGE_FUNCTION_WARNING_COOLDOWN_MS) {
    return false;
  }
  edgeFunctionWarningCache.set(signature, now);
  return true;
}

function createUnavailableInvokeResult(functionName: string) {
  const error = {
    message: `Edge Function ${functionName} is not deployed in the current ECS backend`,
    name: "FunctionUnavailableError",
    context: {
      status: 404,
      code: EDGE_FUNCTION_UNAVAILABLE_CODE,
      functionName,
    },
  };

  if (shouldWarnEdgeFunction(`missing:${functionName}`)) {
    console.warn("[Supabase] Edge function unavailable in current backend:", {
      functionName,
      code: EDGE_FUNCTION_UNAVAILABLE_CODE,
    });
  }

  return {
    data: null,
    error,
    status: 404,
    statusText: "Edge Function unavailable",
  };
}

function wrapFunctionsInvoke(client: SupabaseClient): SupabaseClient {
  const originalInvoke = client.functions.invoke.bind(client.functions);

  client.functions.invoke = (async (functionName: string, options?: any) => {
    if (typeof functionName === "string" && !DEPLOYED_EDGE_FUNCTIONS.has(functionName)) {
      return createUnavailableInvokeResult(functionName);
    }

    return originalInvoke(functionName, options);
  }) as typeof client.functions.invoke;

  return client;
}

/**
 * When env vars are missing we still need a valid SupabaseClient object so the
 * rest of the app can import it without crashing at module-load time.
 * We create a lightweight "noop" client that exposes the same shape but every
 * network call will return an error. When real credentials are provided the
 * real client is used instead.
 */
function createSafeClient(): SupabaseClient {
  if (url && anon) {
    const client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(Platform.OS === "web" ? {} : { storage: nativeSupabaseStorage }),
      },
    });
    return wrapFunctionsInvoke(client);
  }

  console.warn(
    "[Supabase] Missing required environment variables; cloud-backed ECS features are unavailable",
    { missing: missingSupabaseEnv }
  );

  const noopError = {
    message: "Supabase not configured",
    details: "",
    hint: "",
    code: SUPABASE_CONFIG_UNAVAILABLE_CODE,
  };

  const noopQuery: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => noopQuery;
      },
    }
  );

  noopQuery.then = (resolve: any) =>
    resolve({
      data: null,
      error: noopError,
      count: null,
      status: 500,
      statusText: "Supabase not configured",
    });

  const noopAuth = {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: (_cb: any) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithPassword: () =>
      Promise.resolve({
        data: { user: null, session: null },
        error: noopError,
      }),
    signUp: () =>
      Promise.resolve({
        data: { user: null, session: null },
        error: noopError,
      }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () =>
      Promise.resolve({
        data: null,
        error: noopError,
      }),
    updateUser: () =>
      Promise.resolve({
        data: { user: null },
        error: noopError,
      }),
  };

  const noopFunctions = {
    invoke: (_name: string, _opts?: any) =>
      Promise.resolve({
        data: null,
        error: {
          message: "Supabase not configured",
          code: SUPABASE_CONFIG_UNAVAILABLE_CODE,
          missing: missingSupabaseEnv,
        },
      }),
  };

  return {
    auth: noopAuth,
    from: () => noopQuery,
    rpc: (_fn: string, _params?: Record<string, any>) => noopQuery,
    functions: noopFunctions,
  } as unknown as SupabaseClient;
}

export const isSupabaseConfigured = Boolean(url && anon);
export const supabase = createSafeClient();

export async function clearPersistedSupabaseAuthState(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof localStorage !== "undefined") {
        const keysToRemove: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }
    } catch {}
    return;
  }

  await nativeSupabaseAuthCache.waitForHydration();
  nativeSupabaseAuthCache.clear();
  await nativeSupabaseAuthCache.flush();
}

export function getSupabaseConfigurationDiagnostics() {
  return {
    configured: isSupabaseConfigured,
    urlPresent: Boolean(url),
    anonKeyPresent: Boolean(anon),
    missingEnvironmentVariables: [...missingSupabaseEnv],
  };
}

export function isDeployedEdgeFunction(functionName: string): boolean {
  return DEPLOYED_EDGE_FUNCTIONS.has(functionName);
}

export function isEdgeFunctionUnavailableError(error: unknown): boolean {
  const maybeError = error as
    | { name?: string; context?: { code?: string } }
    | undefined;

  return (
    maybeError?.name === "FunctionUnavailableError" ||
    maybeError?.context?.code === EDGE_FUNCTION_UNAVAILABLE_CODE
  );
}

export function isSupabaseConfigurationError(error: unknown): boolean {
  const maybeError = error as
    | { code?: string; context?: { code?: string } }
    | undefined;

  return (
    maybeError?.code === SUPABASE_CONFIG_UNAVAILABLE_CODE ||
    maybeError?.context?.code === SUPABASE_CONFIG_UNAVAILABLE_CODE
  );
}

/**
 * Optional helper to normalize different RPC response shapes:
 * - returns json/jsonb: { tree_json, zones_flat }
 * - returns table(payload jsonb): [{ payload: { tree_json, zones_flat } }]
 * - returns table(tree_json jsonb, zones_flat jsonb): [{ tree_json, zones_flat }]
 */
export function unpackZonesRpcResult(data: any): { tree_json: any; zones_flat: any } | null {
  if (data && !Array.isArray(data) && (data.tree_json || data.zones_flat)) return data;

  if (Array.isArray(data) && data[0]?.payload) return data[0].payload;

  if (Array.isArray(data) && (data[0]?.tree_json || data[0]?.zones_flat)) return data[0];

  return null;
}
