const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'lib', 'convoy', 'convoyMembershipService.ts');
const supabaseClientPath = path.join(root, 'lib', 'supabase.ts');
const edgeFunctionPath = path.join(root, 'supabase', 'functions', 'convoy-membership', 'index.ts');
const packagePath = path.join(root, 'package.json');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
        },
        from: () => ({
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'mock' } }) }) }),
          select: () => ({
            eq: () => ({
              is: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
        functions: {
          invoke: async () => ({ data: null, error: { message: 'mock' } }),
        },
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function makeConvoy(overrides = {}) {
  return {
    id: overrides.id || 'convoy-1',
    name: overrides.name || 'Sierra Test Convoy',
    leader_user_id: overrides.leader_user_id || 'user-1',
    status: overrides.status || 'active',
    starts_at: overrides.starts_at || null,
    expires_at: overrides.expires_at || null,
  };
}

function makeMember(overrides = {}) {
  return {
    id: overrides.id || 'member-1',
    convoy_id: overrides.convoy_id || 'convoy-1',
    user_id: overrides.user_id || 'user-1',
    vehicle_id: overrides.vehicle_id || null,
    callsign: overrides.callsign || 'Lead',
    role: overrides.role || 'lead',
    revoked_at: overrides.revoked_at || null,
  };
}

function createMockBackend(options = {}) {
  const calls = [];
  let activeContext = null;
  const functionResponses = options.functionResponses || {};

  return {
    calls,
    isAvailable: () => options.available !== false,
    getCurrentUser: async () => options.user || { id: 'user-1' },
    insertConvoy: async (row) => {
      calls.push(['insertConvoy', row]);
      if (options.insertConvoyResponse) return options.insertConvoyResponse;
      return { ok: true, data: makeConvoy({ ...row, id: 'convoy-created' }) };
    },
    insertLeaderMember: async (row) => {
      calls.push(['insertLeaderMember', row]);
      return { ok: true, data: makeMember({ ...row, id: 'member-created' }) };
    },
    listActiveMemberships: async (userId) => {
      calls.push(['listActiveMemberships', userId]);
      return { ok: true, data: [{ convoy: makeConvoy(), membership: makeMember() }] };
    },
    invokeMembershipFunction: async (action, body) => {
      calls.push(['invokeMembershipFunction', action, body]);
      const response = functionResponses[action];
      if (response) return response;
      return { ok: false, code: 'backend_error', error: 'No mock response configured.' };
    },
    saveActiveContext: async (context) => {
      calls.push(['saveActiveContext', context]);
      activeContext = context;
    },
    readActiveContext: async () => activeContext,
    clearActiveContext: async (convoyId) => {
      calls.push(['clearActiveContext', convoyId]);
      if (!convoyId || activeContext?.convoyId === convoyId) activeContext = null;
    },
  };
}

async function main() {
  const {
    ConvoyMembershipService,
  } = require(servicePath);

  const createBackend = createMockBackend();
  const createService = new ConvoyMembershipService(createBackend);
  const created = await createService.createConvoy({
    name: '  Sierra   Test Convoy  ',
    leaderCallsign: 'Lead Tacoma',
    leaderVehicleId: 'vehicle-1',
  });
  assert.strictEqual(created.ok, true, 'createConvoy should succeed with a mocked backend.');
  assert.strictEqual(created.data.convoy.name, 'Sierra Test Convoy');
  assert.strictEqual(created.data.membership.role, 'lead');
  assert.ok(
    createBackend.calls.some((call) => call[0] === 'saveActiveContext' && call[1].memberId === 'member-created'),
    'createConvoy should persist active convoy/member identifiers locally.',
  );

  const missingSchemaBackend = createMockBackend({
    insertConvoyResponse: {
      ok: false,
      code: 'backend_unavailable',
      error: 'Convoy tracking tables are not available on the connected Supabase backend yet.',
      details: [
        'Apply supabase/migrations/022_convoy_team_tracking.sql to the target Supabase project.',
        "Refresh the PostgREST schema cache after migration with NOTIFY pgrst, 'reload schema'; or restart the Supabase API.",
      ],
    },
  });
  const missingSchemaService = new ConvoyMembershipService(missingSchemaBackend);
  const missingSchemaResult = await missingSchemaService.createConvoy({
    name: 'Schema Check',
    leaderCallsign: 'Lead',
  });
  assert.strictEqual(missingSchemaResult.ok, false, 'missing convoy schema should block createConvoy.');
  assert.strictEqual(missingSchemaResult.code, 'backend_unavailable');
  assert.ok(
    missingSchemaResult.error.includes('Convoy tracking') &&
      missingSchemaResult.error.includes('backend'),
    'missing convoy schema should be translated into a deployable backend readiness message.',
  );
  assert.ok(
    !missingSchemaBackend.calls.some((call) => call[0] === 'insertLeaderMember'),
    'createConvoy should not create a leader member when the convoys table is missing.',
  );

  const validJoinBackend = createMockBackend({
    functionResponses: {
      join_with_invite: {
        ok: true,
        data: {
          convoy: makeConvoy({ id: 'convoy-joined' }),
          member: makeMember({ id: 'member-joined', convoy_id: 'convoy-joined', callsign: 'Sweep' }),
        },
      },
    },
  });
  const validJoinService = new ConvoyMembershipService(validJoinBackend);
  const joined = await validJoinService.joinConvoyWithInvite({ rawCode: 'ECS-ABCD-2345', callsign: 'Sweep' });
  assert.strictEqual(joined.ok, true, 'valid invite flow should return joined convoy data.');
  assert.ok(
    validJoinBackend.calls.some((call) => call[0] === 'saveActiveContext' && call[1].convoyId === 'convoy-joined'),
    'valid invite flow should persist active convoy context.',
  );

  for (const [label, code] of [
    ['invalid', 'invalid_invite'],
    ['expired', 'invite_expired'],
    ['revoked', 'invite_revoked'],
    ['max-used', 'invite_maxed'],
  ]) {
    const backend = createMockBackend({
      functionResponses: {
        join_with_invite: { ok: false, code, error: `Invite ${label}.` },
      },
    });
    const service = new ConvoyMembershipService(backend);
    const result = await service.joinConvoyWithInvite({ rawCode: 'ECS-TEST-0000', callsign: 'Tail' });
    assert.strictEqual(result.ok, false, `${label} invite should fail.`);
    assert.strictEqual(result.code, code, `${label} invite should preserve the server error code.`);
    assert.ok(
      !backend.calls.some((call) => call[0] === 'saveActiveContext'),
      `${label} invite should not persist active convoy context.`,
    );
  }

  const inviteBackend = createMockBackend({
    functionResponses: {
      create_invite: {
        ok: true,
        data: {
          rawCode: 'ECS-ABCD-2345',
          invite: {
            id: 'invite-1',
            convoy_id: 'convoy-1',
            role: 'member',
            max_uses: 1,
            used_count: 0,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            revoked_at: null,
            created_by: 'user-1',
          },
        },
      },
    },
  });
  const inviteService = new ConvoyMembershipService(inviteBackend);
  const invite = await inviteService.createConvoyInvite({
    convoyId: 'convoy-1',
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.strictEqual(invite.ok, true, 'createConvoyInvite should return the one-time raw code from the Edge Function.');
  assert.strictEqual(invite.data.rawCode, 'ECS-ABCD-2345');
  assert.ok(!('code_hash' in invite.data.invite), 'client invite response should not expose code_hash.');

  const endBackend = createMockBackend({
    functionResponses: {
      end_convoy: {
        ok: true,
        data: makeConvoy({ status: 'completed' }),
      },
    },
  });
  const endService = new ConvoyMembershipService(endBackend);
  const ended = await endService.endConvoy({ convoyId: 'convoy-1' });
  assert.strictEqual(ended.ok, true, 'endConvoy should return the completed convoy from the Edge Function.');
  assert.ok(
    endBackend.calls.some((call) => call[0] === 'invokeMembershipFunction' && call[1] === 'end_convoy'),
    'endConvoy should invoke the leader-only Edge Function action.',
  );
  assert.ok(
    endBackend.calls.some((call) => call[0] === 'clearActiveContext' && call[1] === 'convoy-1'),
    'endConvoy should clear the local active convoy context.',
  );

  const source = fs.readFileSync(edgeFunctionPath, 'utf8');
  assert.ok(source.includes("getEnv('CONVOY_INVITE_HASH_PEPPER')"), 'Edge Function should use a server-side invite hash pepper.');
  assert.ok(source.includes("{ name: 'HMAC', hash: 'SHA-256' }"), 'Edge Function should HMAC invite codes.');
  assert.ok(source.includes(".eq('code_hash', codeHash)"), 'Invite redemption should query by server-computed hash.');
  assert.ok(
    source.includes(".rpc('claim_convoy_invite'") &&
      !source.includes(".update({ used_count: invite.used_count + 1 })"),
    'Invite redemption should claim usage through the atomic database helper instead of a stale client-side increment.',
  );
  assert.ok(source.includes("'invite_expired'"), 'Edge Function should return an expired invite code.');
  assert.ok(source.includes("'invite_revoked'"), 'Edge Function should return a revoked invite code.');
  assert.ok(source.includes("'invite_maxed'"), 'Edge Function should return a max-used invite code.');
  assert.ok(
    source.includes('async function leaveConvoy') &&
      source.includes(".eq('member_id', data.id)") &&
      source.includes('You left the convoy, but location cleanup failed.'),
    'Leaving a convoy should remove only the departing member location row.',
  );
  assert.ok(source.includes("case 'end_convoy'"), 'Edge Function should expose a leader-only convoy termination action.');
  assert.ok(source.includes(".update({ status: 'completed' })"), 'Ending a convoy should mark it completed.');
  assert.ok(
    source.includes(".from('convoy_members')") &&
      source.includes(".update({ revoked_at: endedAt })") &&
      source.includes(".from('convoy_member_locations')") &&
      source.includes('.delete()'),
    'Ending a convoy should revoke active memberships and remove live location rows.',
  );
  assert.ok(!source.includes('console.log'), 'Edge Function should not log raw invite codes.');
  assert.ok(
    source.includes('backendReadinessFailure') &&
      source.includes('claim_convoy_invite') &&
      source.includes("NOTIFY pgrst, 'reload schema'"),
    'Edge Function should return backend_unavailable guidance for missing migrations/helpers or stale schema cache.',
  );

  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  assert.ok(!serviceSource.includes('convois'), 'Convoy service must never query the misspelled public.convois table.');
  assert.ok(
    serviceSource.includes('async endConvoy') &&
      serviceSource.includes("'end_convoy'") &&
      serviceSource.includes("stopConvoyLocationSharing('Convoy ended. Live sharing stopped.')"),
    'Convoy service should expose endConvoy and stop local live sharing after successful termination.',
  );
  assert.ok(
    serviceSource.includes('formatConvoyBackendUserMessage') &&
      serviceSource.includes('formatConvoyBackendOperatorDetails') &&
      serviceSource.includes('getConvoyBackendReadinessGuidance'),
    'Convoy service should centralize missing schema-cache/function guidance through convoy backend readiness helpers.',
  );
  assert.ok(
    !serviceSource.includes('convoy:convoys(*)'),
    'Active convoy refresh should avoid fragile embedded relationship selects that can hit stale schema cache paths.',
  );
  assert.ok(
    serviceSource.includes('from(CONVOY_MEMBERS_TABLE)') && serviceSource.includes('from(CONVOYS_TABLE)'),
    'Active convoy refresh should load memberships and convoys through explicit table queries.',
  );
  assert.ok(
    serviceSource.includes('readFunctionErrorBody') &&
      serviceSource.includes('response } = await client.functions.invoke') &&
      serviceSource.includes('data ?? await readFunctionErrorBody(error, response)'),
    'Convoy membership service should recover structured Edge Function error bodies from non-2xx Supabase responses.',
  );

  const supabaseSource = fs.readFileSync(supabaseClientPath, 'utf8');
  assert.ok(
    supabaseSource.includes('"convoy-membership"'),
    'Supabase wrapper should allow the convoy-membership Edge Function.',
  );

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.ok(
    pkg.scripts['test:convoy-membership-service'],
    'package.json should expose the convoy membership service regression test.',
  );

  console.log('convoy membership service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
