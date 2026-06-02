const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const workflowRoot = path.join(root, '.github', 'workflows');

const DATA_PLANE_WORKFLOWS = [
  'route-catalog-usfs-mvum-sync.yml',
  'route-catalog-blm-gtlf-sync.yml',
  'route-catalog-michigan-orv-sync.yml',
  'route-catalog-minnesota-ohv-sync.yml',
  'route-catalog-oregon-odf-ohv-sync.yml',
  'route-catalog-usgs-trails-sync.yml',
  'route-catalog-nps-trails-sync.yml',
  'route-catalog-summary-report.yml',
  'route-catalog-coverage-audit.yml',
];

const SHARED_GROUP = 'group: route-catalog-data-plane-${{ github.repository }}';

assert(
  packageJson.includes('"test:route-catalog-workflow-queue"'),
  'package.json should expose the route catalog workflow queue contract test',
);

for (const workflowName of DATA_PLANE_WORKFLOWS) {
  const workflowPath = path.join(workflowRoot, workflowName);
  assert(fs.existsSync(workflowPath), `${workflowName} should exist`);
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert(workflow.includes('concurrency:'), `${workflowName} should declare concurrency`);
  assert(
    workflow.includes(SHARED_GROUP),
    `${workflowName} should join the shared route catalog data-plane queue`,
  );
  assert(
    workflow.includes('cancel-in-progress: false'),
    `${workflowName} should queue instead of canceling route catalog data-plane jobs`,
  );
}

const deployWorkflow = fs.readFileSync(path.join(workflowRoot, 'route-catalog-edge-functions-deploy.yml'), 'utf8');
assert(
  !deployWorkflow.includes(SHARED_GROUP),
  'Edge Function deploy should not be blocked by the route catalog data-plane queue',
);

console.log('Route catalog workflow queue checks passed');
