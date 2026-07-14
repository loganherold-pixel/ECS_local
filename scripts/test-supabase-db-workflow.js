const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'supabase-db-tests.yml');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const executor = fs.readFileSync(
  path.join(root, 'scripts', 'verification', 'run-pgtap-rls-workflow.mjs'),
  'utf8',
);
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'verification-policy.json'), 'utf8'));

assert(workflow.includes('supabase/setup-cli@v1'), 'Supabase DB workflow should install the Supabase CLI');
assert(
  workflow.includes('version: 2.75.0'),
  'Supabase DB workflow should pin a CLI version new enough to parse the current supabase/config.toml',
);
assert(
  !workflow.includes('version: 2.20.3'),
  'Supabase DB workflow should not fall back to the old setup-cli default that rejects current config keys',
);
assert(workflow.includes('workflow_call:'), 'Supabase DB tests must be reusable by release-candidate verification.');
assert(workflow.includes('run-pgtap-rls-workflow.mjs'), 'Supabase DB tests must execute through the bound pgTAP runner.');
assert(workflow.includes('steps.database-tests.outputs.result'), 'Reusable output must come from actual database execution.');
assert(workflow.includes("steps.database-tests.outcome != 'success'"), 'A failed pgTAP process must fail the reusable job.');
assert(!workflow.includes('echo \'result={'), 'The workflow must not manufacture a passing result envelope.');
assert(executor.includes("['test', 'db', '--local', ...requiredSuiteIds]"), 'The runner must invoke real local pgTAP suites.');

const pgtapCheck = policy.checks.find((check) => check.id === 'supabase-pgtap-rls');
assert(pgtapCheck?.workflowEvidence, 'pgTAP check must define commit-bound workflow evidence policy.');
assert.strictEqual(pgtapCheck.workflowEvidence.resultContract, 'ecs-pgtap-workflow-evidence-v1');
assert.strictEqual(pgtapCheck.workflowEvidence.schemaTestConfigVersion, 'ecs-supabase-rls-v1');
assert.deepStrictEqual(
  [...pgtapCheck.workflowEvidence.requiredSuiteIds].sort(),
  fs.readdirSync(path.join(root, 'supabase', 'tests', 'database'))
    .filter((name) => /\.(?:sql|pg)$/i.test(name))
    .map((name) => `supabase/tests/database/${name}`)
    .sort(),
  'Every database test suite must be explicitly bound into release evidence.',
);

const migrationVersions = fs
  .readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .reduce((versions, name) => {
    const [version] = name.split('_');
    versions.set(version, [...(versions.get(version) ?? []), name]);
    return versions;
  }, new Map());
const duplicateVersions = [...migrationVersions.entries()].filter(([, names]) => names.length > 1);
assert.deepStrictEqual(
  duplicateVersions,
  [],
  `Supabase migrations must use unique numeric versions. Duplicates: ${JSON.stringify(duplicateVersions)}`,
);

console.log('Supabase DB workflow checks passed');
