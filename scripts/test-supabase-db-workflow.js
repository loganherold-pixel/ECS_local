const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'supabase-db-tests.yml');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert(workflow.includes('supabase/setup-cli@v1'), 'Supabase DB workflow should install the Supabase CLI');
assert(
  workflow.includes('version: 2.75.0'),
  'Supabase DB workflow should pin a CLI version new enough to parse the current supabase/config.toml',
);
assert(
  !workflow.includes('version: 2.20.3'),
  'Supabase DB workflow should not fall back to the old setup-cli default that rejects current config keys',
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
