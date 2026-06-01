/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

type ProviderId =
  | 'ridb'
  | 'nps'
  | 'campflare'
  | 'active'
  | 'reserveamerica'
  | 'aspira'
  | 'osm';

type ProviderHealthDefinition = {
  providerId: ProviderId;
  requiredSecretRefs: string[];
  attributionSecretRefs?: string[];
  fallbackEnabled: boolean;
};

type ProviderConfigRow = {
  provider_id: string;
  enabled: boolean | null;
  attribution_text: string | null;
};

type ProviderHealth = {
  providerId: ProviderId;
  enabled: boolean;
  hasRequiredSecrets: boolean;
  missingSecretRefs: string[];
  attributionConfigured: boolean;
  checkedAt: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const PROVIDERS: ProviderHealthDefinition[] = [
  {
    providerId: 'ridb',
    requiredSecretRefs: ['RIDB_API_KEY'],
    fallbackEnabled: true,
  },
  {
    providerId: 'nps',
    requiredSecretRefs: ['NPS_API_KEY'],
    fallbackEnabled: true,
  },
  {
    providerId: 'campflare',
    requiredSecretRefs: ['CAMPFLARE_API_KEY'],
    fallbackEnabled: true,
  },
  {
    providerId: 'active',
    requiredSecretRefs: ['ACTIVE_API_KEY', 'ACTIVE_API_SECRET'],
    fallbackEnabled: true,
  },
  {
    providerId: 'reserveamerica',
    requiredSecretRefs: ['RESERVEAMERICA_API_KEY'],
    fallbackEnabled: true,
  },
  {
    providerId: 'aspira',
    requiredSecretRefs: ['ASPIRA_API_KEY'],
    fallbackEnabled: true,
  },
  {
    providerId: 'osm',
    requiredSecretRefs: ['OSM_USER_AGENT', 'OSM_ATTRIBUTION'],
    attributionSecretRefs: ['OSM_ATTRIBUTION'],
    fallbackEnabled: true,
  },
];

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function hasEnv(name: string): boolean {
  const value = Deno.env.get(name);
  return typeof value === 'string' && value.trim().length > 0;
}

const admin = createClient(getEnv('ECS_SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin authorization required' }, 401) };
  }

  const { data: authUser, error: authError } = await admin.auth.getUser(token);
  if (authError || !authUser?.user?.id) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Unable to validate admin session' }, 401) };
  }

  const normalizedEmail = String(authUser.user.email ?? '').trim().toLowerCase();
  if (normalizedEmail === 'admin@expeditioncommand.com') {
    return { ok: true };
  }

  const { data: operator } = await admin
    .from('operators')
    .select('role, access_level, internal_account_type')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  const isAdmin =
    operator?.role === 'super_admin' ||
    operator?.access_level === 'super_admin' ||
    operator?.internal_account_type === 'admin_internal';

  if (!isAdmin) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin access required' }, 403) };
  }

  return { ok: true };
}

async function loadProviderConfigs(): Promise<Map<string, ProviderConfigRow>> {
  const { data, error } = await admin
    .from('campground_provider_configs')
    .select('provider_id, enabled, attribution_text');

  if (error || !Array.isArray(data)) {
    return new Map();
  }

  return new Map(
    data
      .filter((row): row is ProviderConfigRow => typeof row?.provider_id === 'string')
      .map((row) => [row.provider_id, row]),
  );
}

function buildProviderHealth(
  definition: ProviderHealthDefinition,
  config: ProviderConfigRow | undefined,
  checkedAt: string,
): ProviderHealth {
  const missingSecretRefs = definition.requiredSecretRefs.filter((secretRef) => !hasEnv(secretRef));
  const attributionConfigured = definition.attributionSecretRefs?.length
    ? definition.attributionSecretRefs.every((secretRef) => hasEnv(secretRef))
    : Boolean(config?.attribution_text && config.attribution_text.trim().length > 0);

  return {
    providerId: definition.providerId,
    enabled: typeof config?.enabled === 'boolean' ? config.enabled : definition.fallbackEnabled,
    hasRequiredSecrets: missingSecretRefs.length === 0,
    missingSecretRefs,
    attributionConfigured,
    checkedAt,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'GET required' }, 405);
  }

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const url = new URL(req.url);
  const providerId = url.searchParams.get('provider_id')?.trim().toLowerCase() ?? null;
  const checkedAt = new Date().toISOString();

  const selectedProviders = providerId
    ? PROVIDERS.filter((provider) => provider.providerId === providerId)
    : PROVIDERS;

  if (providerId && selectedProviders.length === 0) {
    return jsonResponse({ ok: false, error: 'Unknown provider_id' }, 400);
  }

  const providerConfigs = await loadProviderConfigs();
  const providers = selectedProviders.map((provider) =>
    buildProviderHealth(provider, providerConfigs.get(provider.providerId), checkedAt),
  );

  return jsonResponse({
    ok: true,
    checkedAt,
    providers,
  });
});
