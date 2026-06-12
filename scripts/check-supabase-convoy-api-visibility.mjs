#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_TABLES = [
  'convoys',
  'convoy_invites',
  'convoy_members',
  'convoy_member_locations',
];

const CLAIM_INVITE_RPC = 'claim_convoy_invite';
const NON_MUTATING_UUID = '00000000-0000-4000-8000-000000000000';
const SCHEMA_CACHE_CODES = ['PGRST202', 'PGRST205'];

const args = new Set(process.argv.slice(2));
const outputJson = args.has('--json');
const requireRpc = args.has('--require-rpc');

function loadPublicEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }
}

function envAny(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 12) return '[redacted]';
  return `${value.slice(0, 6)}...[redacted]...${value.slice(-4)}`;
}

function baseRestUrl(rawUrl) {
  return `${rawUrl.replace(/\/+$/, '')}/rest/v1`;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function bodyText(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return [body.message, body.details, body.hint, body.code]
    .filter((part) => part != null)
    .map(String)
    .join(' ');
}

function isSchemaCacheMiss(status, body) {
  const text = bodyText(body).toLowerCase();
  return (
    status === 404 &&
    (
      text.includes('schema cache') ||
      SCHEMA_CACHE_CODES.some((code) => text.includes(code.toLowerCase())) ||
      text.includes('could not find the table') ||
      text.includes('could not find the function')
    )
  );
}

function visibleTableStatus(status) {
  return status === 200 || status === 401 || status === 403;
}

async function checkTable(restUrl, anonKey, table) {
  const response = await fetch(`${restUrl}/${table}?select=*&limit=1`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  const body = await readBody(response);
  const ok = visibleTableStatus(response.status);
  return {
    kind: 'table',
    object: `public.${table}`,
    ok,
    status: response.status,
    classification: ok
      ? 'visible_or_rls_protected'
      : isSchemaCacheMiss(response.status, body)
        ? 'schema_cache_or_missing_table'
        : 'unexpected_response',
    message: ok ? 'PostgREST can resolve the table.' : bodyText(body),
  };
}

async function checkClaimInviteRpc(restUrl, serviceRoleKey) {
  if (!serviceRoleKey) {
    return {
      kind: 'rpc',
      object: 'public.claim_convoy_invite(uuid)',
      ok: !requireRpc,
      status: null,
      classification: requireRpc ? 'service_role_required' : 'skipped_service_role_not_provided',
      message: requireRpc
        ? 'Set ECS_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY in the shell to verify the join-specific RPC.'
        : 'RPC probe skipped because no service-role key was provided in the shell environment.',
    };
  }

  const response = await fetch(`${restUrl}/rpc/${CLAIM_INVITE_RPC}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ target_invite_id: NON_MUTATING_UUID }),
  });
  const body = await readBody(response);
  const ok = response.status === 200 || response.status === 204;
  return {
    kind: 'rpc',
    object: 'public.claim_convoy_invite(uuid)',
    ok,
    status: response.status,
    classification: ok
      ? 'visible_to_service_role'
      : isSchemaCacheMiss(response.status, body)
        ? 'schema_cache_or_missing_function'
        : 'unexpected_response',
    message: ok
      ? 'PostgREST can resolve the atomic invite claim helper. The fake UUID does not match an invite, so no row is mutated.'
      : bodyText(body),
  };
}

function printHuman(result) {
  console.log(`Supabase Convoy API visibility check`);
  console.log(`Project URL: ${result.supabaseUrl}`);
  console.log(`Anon key: ${result.anonKeyPresent ? '[present]' : '[missing]'}`);
  console.log(`Service role key: ${result.serviceRoleKeyPresent ? mask(result.serviceRoleKeyMaskSource) : '[not provided]'}`);
  console.log('');

  for (const check of result.checks) {
    const marker = check.ok ? 'PASS' : check.classification.startsWith('skipped') ? 'SKIP' : 'FAIL';
    const status = check.status == null ? '' : ` HTTP ${check.status}`;
    console.log(`${marker}: ${check.object}${status} - ${check.classification}`);
    if (check.message) console.log(`  ${check.message}`);
  }

  console.log('');
  if (result.ok) {
    console.log(result.partial ? 'PASS: table visibility passed; RPC visibility was not fully verified.' : 'PASS: Convoy API surface is visible for the checked objects.');
  } else {
    console.log('FAIL: Convoy API surface is not ready for two-device join QA.');
    console.log("Recovery: apply convoy migrations, then run NOTIFY pgrst, 'reload schema'; or restart the Supabase API.");
  }
}

async function main() {
  loadPublicEnvFile();

  const supabaseUrl = envAny('ECS_SUPABASE_URL', 'SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = envAny('SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = envAny('ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error('Missing ECS/Expo Supabase URL or anon key. Provide ECS_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY/EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    process.exit(2);
  }

  const restUrl = baseRestUrl(supabaseUrl);
  const checks = [];
  for (const table of REQUIRED_TABLES) {
    checks.push(await checkTable(restUrl, anonKey, table));
  }
  checks.push(await checkClaimInviteRpc(restUrl, serviceRoleKey));

  const result = {
    ok: checks.every((check) => check.ok),
    partial: checks.some((check) => check.classification === 'skipped_service_role_not_provided'),
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    anonKeyPresent: Boolean(anonKey),
    serviceRoleKeyPresent: Boolean(serviceRoleKey),
    serviceRoleKeyMaskSource: serviceRoleKey,
    checks,
  };

  if (outputJson) {
    console.log(JSON.stringify({ ...result, serviceRoleKeyMaskSource: undefined }, null, 2));
  } else {
    printHuman(result);
  }

  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('Supabase Convoy API visibility check failed before completing:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
