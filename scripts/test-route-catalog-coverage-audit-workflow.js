const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-coverage-audit.yml');
const auditScriptPath = path.join(root, 'scripts', 'route-catalog-coverage-audit.js');

assert(
  packageJson.includes('"test:route-catalog-coverage-audit-workflow"'),
  'package.json should expose the route catalog coverage audit workflow contract test',
);
assert(
  packageJson.includes('"route-catalog:coverage:ci"'),
  'package.json should expose a CI coverage audit command that fails on mismatched expected posture',
);
assert(fs.existsSync(workflowPath), 'Route catalog coverage audit GitHub workflow should exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const required of [
  'name: Route Catalog Coverage Audit',
  'workflow_dispatch:',
  'schedule:',
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'npm run route-catalog:coverage:ci',
  'Route Catalog Coverage Audit',
  'matchesExpectedPosture',
  'concurrency:',
]) {
  assert(workflow.includes(required), `Coverage audit workflow should include ${required}`);
}
assert(
  !workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !workflow.includes('SUPABASE_ACCESS_TOKEN') &&
    !workflow.includes('ECS_SERVICE_ROLE_KEY') &&
    !workflow.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Coverage audit workflow should not require sync, deploy, or service-role secrets',
);

const auditScript = fs.readFileSync(auditScriptPath, 'utf8');
for (const required of [
  '--fail-on-mismatch',
  'mismatchedProbes',
  'matchesExpectedPosture',
  'process.exit(1)',
]) {
  assert(auditScript.includes(required), `Coverage audit script should include ${required}`);
}

console.log('Route catalog coverage audit workflow checks passed');
