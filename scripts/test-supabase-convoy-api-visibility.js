const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const checkScriptPath = path.join(root, 'scripts', 'check-supabase-convoy-api-visibility.mjs');
assert.ok(fs.existsSync(checkScriptPath), 'Supabase Convoy API visibility check script should exist.');

const checkScript = read('scripts/check-supabase-convoy-api-visibility.mjs');
const docs = read('docs/dispatch/CONVOY_TRACKING_RLS.md');
const qaDocs = read('docs/qa/supabase-convoy-api-visibility.md');
const migration = read('supabase/migrations/022_convoy_team_tracking.sql');
const identityMigration = read('supabase/migrations/030_convoy_member_identity_titles.sql');
const repairMigration = read('supabase/migrations/036_convoy_invite_claim_helper_api_visibility.sql');
const edgeFunction = read('supabase/functions/convoy-membership/index.ts');
const readiness = read('lib/convoy/convoyBackendReadiness.ts');
const packageJson = JSON.parse(read('package.json'));

for (const table of ['convoys', 'convoy_invites', 'convoy_members', 'convoy_member_locations']) {
  assert.ok(
    checkScript.includes(table),
    `API visibility check should probe public.${table} through PostgREST.`,
  );
  assert.ok(
    qaDocs.includes(`public.${table}`),
    `QA API visibility doc should inventory public.${table}.`,
  );
}

assert.ok(
  checkScript.includes('claim_convoy_invite') &&
    checkScript.includes('00000000-0000-4000-8000-000000000000') &&
    checkScript.includes('--require-rpc'),
  'API visibility check should support a non-mutating service-role RPC probe for claim_convoy_invite.',
);
assert.ok(
  checkScript.includes('PGRST202') &&
    checkScript.includes('PGRST205') &&
    checkScript.includes('schema cache'),
  'API visibility check should classify PostgREST function/table schema-cache misses.',
);
assert.ok(
  checkScript.includes('loadPublicEnvFile') &&
    checkScript.includes('EXPO_PUBLIC_SUPABASE_URL') &&
    checkScript.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY') &&
    !checkScript.includes('SUPABASE_SERVICE_ROLE_KEY='),
  'API visibility check may load public env values, but must not encourage storing service-role keys in .env files.',
);
assert.ok(
  checkScript.includes('redact') || checkScript.includes('mask'),
  'API visibility check should avoid printing raw backend keys or sensitive values.',
);

assert.ok(
  migration.includes('create or replace function public.claim_convoy_invite(target_invite_id uuid)') &&
    migration.includes('grant execute on function public.claim_convoy_invite(uuid) to service_role') &&
    migration.includes('revoke execute on function public.claim_convoy_invite(uuid) from public, anon, authenticated'),
  'Convoy join helper should remain service-role-only and atomically claim invite usage.',
);
assert.ok(
  repairMigration.includes('create or replace function public.claim_convoy_invite(target_invite_id uuid)') &&
    repairMigration.includes('public.convoy_invites is missing') &&
    repairMigration.includes('revoke execute on function public.claim_convoy_invite(uuid) from public, anon, authenticated') &&
    repairMigration.includes('grant execute on function public.claim_convoy_invite(uuid) to service_role') &&
    repairMigration.includes("notify pgrst, 'reload schema'"),
  'Repair migration should narrowly recreate the invite claim helper, preserve service-role-only grants, and reload PostgREST schema.',
);
assert.ok(
  identityMigration.includes('expedition_badge_title') &&
    identityMigration.includes('display_name'),
  'Convoy identity presentation columns should remain part of the API inventory.',
);
assert.ok(
  edgeFunction.includes(".rpc('claim_convoy_invite'") &&
    edgeFunction.includes('backendReadinessFailure') &&
    edgeFunction.includes('Convoy tracking tables or helpers are not visible through the Supabase API yet.'),
  'Convoy Edge Function should expose join-specific schema-cache readiness failures.',
);
assert.ok(
  readiness.includes('claim_convoy_invite') &&
    readiness.includes('The migration may be applied, but the API schema cache still needs a reload.'),
  'Client readiness copy should classify claim_convoy_invite schema-cache failures as stale API cache.',
);

for (const token of [
  'join-specific dependency',
  'public.claim_convoy_invite(uuid)',
  'create/invite can work while join is blocked',
  '036_convoy_invite_claim_helper_api_visibility.sql',
  'PGRST202',
  "NOTIFY pgrst, 'reload schema'",
  'npm run check:supabase-convoy-api-visibility:rpc',
]) {
  assert.ok(qaDocs.includes(token), `Supabase Convoy API visibility QA doc missing: ${token}`);
}

for (const token of [
  'public.claim_convoy_invite(uuid)',
  'create/invite can succeed while join remains blocked',
  'check:supabase-convoy-api-visibility',
]) {
  assert.ok(docs.includes(token), `Convoy tracking runbook missing join-specific API visibility guidance: ${token}`);
}

assert.strictEqual(
  packageJson.scripts['check:supabase-convoy-api-visibility'],
  'node scripts/check-supabase-convoy-api-visibility.mjs',
  'package.json should expose the live Supabase Convoy API visibility check.',
);
assert.strictEqual(
  packageJson.scripts['check:supabase-convoy-api-visibility:rpc'],
  'node scripts/check-supabase-convoy-api-visibility.mjs --require-rpc',
  'package.json should expose a strict service-role RPC visibility check for two-device QA.',
);
assert.strictEqual(
  packageJson.scripts['test:supabase-convoy-api-visibility'],
  'node ./scripts/test-supabase-convoy-api-visibility.js',
  'package.json should expose the Supabase Convoy API visibility contract test.',
);

console.log('Supabase Convoy API visibility contract checks passed.');
