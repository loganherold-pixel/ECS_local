const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'lib', 'convoy', 'convoyBackendReadiness.ts');
const screenPath = path.join(root, 'app', 'convoy-command.tsx');
const storePath = path.join(root, 'stores', 'convoyTrackingStore.ts');
const docsPath = path.join(root, 'docs', 'dispatch', 'CONVOY_TRACKING_RLS.md');
const packagePath = path.join(root, 'package.json');

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

const {
  classifyConvoyBackendReadinessIssue,
  formatConvoyBackendUserMessage,
  getConvoyBackendReadinessGuidance,
} = require(helperPath);

const cases = [
  [
    'schema_cache_stale',
    { message: "Could not find the table 'public.convoys' in the schema cache", code: 'PGRST205' },
  ],
  [
    'missing_migration',
    { message: 'relation "public.convoy_members" does not exist', code: '42P01' },
  ],
  [
    'edge_function_missing',
    {
      name: 'FunctionUnavailableError',
      message: 'Edge Function convoy-membership is not deployed in the current ECS backend',
      context: { status: 404, code: 'EDGE_FUNCTION_UNAVAILABLE', functionName: 'convoy-membership' },
    },
  ],
  [
    'edge_function_secret_missing',
    'Convoy invite hashing secret is not configured.',
  ],
  [
    'realtime_unavailable',
    'convoy_member_locations is not in supabase_realtime publication',
  ],
  [
    'supabase_unconfigured',
    { message: 'Supabase not configured', code: 'SUPABASE_CONFIG_UNAVAILABLE' },
  ],
];

for (const [expected, input] of cases) {
  assert.strictEqual(
    classifyConvoyBackendReadinessIssue(input),
    expected,
    `Expected ${expected} for ${JSON.stringify(input)}`,
  );
  assert.ok(formatConvoyBackendUserMessage(input), `${expected} should have user-facing recovery copy.`);
  assert.ok(
    getConvoyBackendReadinessGuidance(expected).operatorSteps.length > 0,
    `${expected} should have operator recovery steps.`,
  );
}

assert.ok(
  getConvoyBackendReadinessGuidance('schema_cache_stale').operatorSteps.some((step) =>
    step.includes("NOTIFY pgrst, 'reload schema'"),
  ),
  'Schema-cache guidance should include the exact PostgREST reload command.',
);
assert.ok(
  getConvoyBackendReadinessGuidance('edge_function_missing').operatorSteps.some((step) =>
    step.includes('supabase/functions/convoy-membership'),
  ),
  'Function guidance should name the convoy-membership Edge Function.',
);
assert.ok(
  getConvoyBackendReadinessGuidance('realtime_unavailable').operatorSteps.some((step) =>
    step.includes('public.convoy_member_locations'),
  ),
  'Realtime guidance should name the convoy member locations table.',
);

const screen = fs.readFileSync(screenPath, 'utf8');
assert.ok(
  screen.includes('formatConvoyBackendUserMessage(error)') &&
    !screen.includes('Apply migration 022_convoy_team_tracking.sql, deploy the convoy-membership Edge Function'),
  'Convoy credentials UI should use centralized backend readiness copy instead of hard-coded deployment instructions.',
);

const store = fs.readFileSync(storePath, 'utf8');
assert.ok(
  store.includes("getConvoyBackendReadinessGuidance('realtime_unavailable').userMessage"),
  'Convoy realtime store should surface Realtime-specific degraded recovery copy.',
);

const docs = fs.readFileSync(docsPath, 'utf8');
for (const token of [
  'Backend Runbook',
  'supabase functions deploy convoy-membership',
  'CONVOY_INVITE_HASH_PEPPER',
  "NOTIFY pgrst, 'reload schema'",
  'alter publication supabase_realtime add table public.convoy_member_locations',
  'Missing Edge Function',
  'Missing Realtime publication',
]) {
  assert.ok(docs.includes(token), `Convoy backend runbook missing: ${token}`);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
assert.ok(pkg.scripts['test:convoy-backend-readiness'], 'package.json should expose convoy backend readiness tests.');

console.log('convoy backend readiness tests passed');
