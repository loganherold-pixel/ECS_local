// supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Client Configuration
 *
 * Uses environment variables when available, with hardcoded fallback
 * values from the project's edge function configuration.
 * This ensures the client works even when env vars aren't injected
 * at build time (e.g., Expo Go, development builds, EAS builds
 * without .env files).
 */

const FALLBACK_URL = "https://ppqcqigdxdofsvpiyial.databasepad.com";
const FALLBACK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImJjMGY4NDkyLTM5OWYtNGI3Yi1iNmMwLWVjM2I0Njc5YTM4ZCJ9.eyJwcm9qZWN0SWQiOiJwcHFjcWlnZHhkb2ZzdnBpeWlhbCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcxNzIzOTUxLCJleHAiOjIwODcwODM5NTEsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.8C2N_bGWoLtysBVPuuCnTcS-gFSXRLWggrpwOEhnvVM";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON;

/**
 * When env vars are missing we still need a valid SupabaseClient object so the
 * rest of the app can import it without crashing at module-load time.
 * We create a lightweight "noop" client that exposes the same shape but every
 * network call will return an error. When real credentials are provided the
 * real client is used instead.
 */

function createSafeClient(): SupabaseClient {
  if (url && anon) {
    return createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  // ---- Fallback: no credentials ----
  console.warn(
    "[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY – running in offline-only mode"
  );

  const noopError = {
    message: "Supabase not configured",
    details: "",
    hint: "",
    code: "",
  };

  // Chainable proxy (select/eq/insert/update/etc.) that never throws
  const noopQuery: any = new Proxy(
    {},
    {
      get() {
        // Every chained method returns the same proxy so chains never throw.
        return (..._args: any[]) => noopQuery;
      },
    }
  );

  // When awaited, resolve with an error result
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
        error: { message: "Supabase not configured" },
      }),
    signUp: () =>
      Promise.resolve({
        data: { user: null, session: null },
        error: { message: "Supabase not configured" },
      }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () =>
      Promise.resolve({
        data: null,
        error: { message: "Supabase not configured" },
      }),
    updateUser: () =>
      Promise.resolve({
        data: { user: null },
        error: { message: "Supabase not configured" },
      }),
  };

  // Noop functions.invoke so supabase.functions.invoke(...) doesn't crash offline
  const noopFunctions = {
    invoke: (_name: string, _opts?: any) =>
      Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
  };

  // Include rpc() and functions so offline mode never crashes
  return {
    auth: noopAuth,
    from: () => noopQuery,
    rpc: (_fn: string, _params?: Record<string, any>) => noopQuery,
    functions: noopFunctions,
  } as unknown as SupabaseClient;
}


export const isSupabaseConfigured = Boolean(url && anon);
export const supabase = createSafeClient();

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

