const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  USFS_MVUM_FOREST_BATCHES,
  resolveUsfsMvumForestSelection,
  validateUsfsMvumForestBatches,
} = require('./route-catalog-usfs-mvum-batches.js');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'route-catalog-usfs-mvum-sync.yml'),
  'utf8',
);

const validation = validateUsfsMvumForestBatches();
assert.deepStrictEqual(validation.errors, [], 'USFS MVUM named batches should cover the configured forest list exactly once');
assert(validation.defaultForestCount > 100, 'USFS MVUM default forest list should include the expanded national coverage set');
assert(validation.maxBatchSize <= 20, 'USFS MVUM named batches should stay small enough for bounded manual reruns');
assert.strictEqual(validation.nonAllBatchCount, 7, 'USFS MVUM should expose seven named regional batches');

const batchKeys = USFS_MVUM_FOREST_BATCHES.map((batch) => batch.key);
assert(batchKeys.includes('all'), 'USFS MVUM batches should include an all option for scheduled/default behavior');
for (const key of batchKeys) {
  assert(workflow.includes(`          - ${key}`), `USFS MVUM workflow should expose ${key} as a forest_batch option`);
}

const inyoBatch = resolveUsfsMvumForestSelection({ forestBatch: 'california_nevada' });
assert(inyoBatch.forests.includes('inyo-national-forest'), 'California/Nevada batch should include Inyo for targeted reruns');
assert(inyoBatch.forests.length <= 20, 'California/Nevada batch should remain bounded');

const explicitSelection = resolveUsfsMvumForestSelection({
  requestedForests: 'inyo-national-forest,tahoe-national-forest',
  forestBatch: 'pacific_northwest',
});
assert.deepStrictEqual(
  explicitSelection.forests,
  ['inyo-national-forest', 'tahoe-national-forest'],
  'Explicit forest slugs should override the named batch selector',
);

assert.throws(
  () => resolveUsfsMvumForestSelection({ forestBatch: 'not_a_batch' }),
  /Unknown USFS MVUM forest batch/,
  'Unknown USFS MVUM batch names should fail before invoking live sync',
);

assert(
  workflow.includes('forest_batch:') &&
    workflow.includes('FOREST_BATCH') &&
    workflow.includes("require('./scripts/route-catalog-usfs-mvum-batches.js')") &&
    workflow.includes('resolveUsfsMvumForestSelection'),
  'USFS MVUM workflow should use the shared batch helper before building payloads',
);
assert(
  workflow.includes('validateUsfsMvumForestBatches') &&
    workflow.includes('USFS MVUM forest batch configuration is invalid'),
  'USFS MVUM workflow should fail fast on invalid batch configuration before invoking live sync',
);

console.log('USFS MVUM route catalog batch checks passed');
