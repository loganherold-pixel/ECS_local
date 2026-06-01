const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'supabase-db-tests.yml');
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

console.log('Supabase DB workflow checks passed');
