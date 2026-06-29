const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const workflowPath = path.join(root, '.github', 'workflows', 'release-smoke-readiness.yml');

const packageJson = fs.readFileSync(packageJsonPath, 'utf8');

assert(
  packageJson.includes('"test:release-smoke-ci-workflow"'),
  'package.json should expose the release/smoke CI workflow contract test.',
);
assert(fs.existsSync(workflowPath), 'Release smoke/readiness workflow should exist.');

const workflow = fs.readFileSync(workflowPath, 'utf8');

[
  'name: Release Smoke Readiness',
  'pull_request:',
  'push:',
  'permissions:',
  'contents: read',
  'concurrency:',
  'cancel-in-progress: true',
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'cache: npm',
  'npm ci',
  'npm run smoke',
  'npm run test:release-readiness',
  'npm run gate:closed-field-test:json',
  'npm run gate:provider-readiness',
  'npm run test:pre-closed-field-gate',
  'npm run gate:pre-closed-field-test',
  'npm run gate:release-approval-overrides',
  'npm run gate:no-runtime-mocks',
].forEach((required) => {
  assert(workflow.includes(required), `Release smoke/readiness workflow should include ${required}`);
});

assert(
  workflow.indexOf('npm run smoke') < workflow.indexOf('npm run test:release-readiness'),
  'Workflow should run smoke before release readiness so hidden smoke regressions fail early.',
);
assert(
  workflow.indexOf('npm run test:pre-closed-field-gate') < workflow.indexOf('npm run gate:pre-closed-field-test'),
  'Workflow should run the pre-closed-field gate contract before the aggregate gate.',
);
assert(
  !workflow.includes('MAPBOX_ACCESS_TOKEN') &&
    !workflow.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !workflow.includes('ECS_SERVICE_ROLE_KEY'),
  'Release smoke/readiness workflow should not require live provider or service-role secrets.',
);

console.log('Release smoke/readiness CI workflow checks passed.');
