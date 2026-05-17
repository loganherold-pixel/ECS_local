const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dashboardPath = path.join(root, 'app', '(tabs)', 'dashboard.tsx');
const storePath = path.join(root, 'lib', 'expeditionStateStore.ts');
const oldSheetPath = path.join(root, 'components', 'expedition', 'ExpeditionSummarySheet.tsx');

const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const store = fs.readFileSync(storePath, 'utf8');

assert.ok(!fs.existsSync(oldSheetPath), 'Legacy ExpeditionSummarySheet component should be deleted.');
assert.ok(
  !dashboard.includes("import ExpeditionSummarySheet from '../../components/expedition/ExpeditionSummarySheet'"),
  'Dashboard must not import the legacy completion popup.',
);
assert.ok(
  !dashboard.includes('<ExpeditionSummarySheet'),
  'Dashboard must not render the legacy completion popup.',
);
assert.ok(
  !dashboard.includes('setShowExpeditionSummary'),
  'Dashboard must not set popup visibility state.',
);
assert.ok(
  !dashboard.includes('showExpeditionSummary={'),
  'Dashboard modal layer must not receive legacy popup visibility.',
);
assert.ok(
  !store.includes('dismissExpedition():'),
  'The deprecated completion dismiss flow should not clear completed expedition data.',
);
assert.ok(
  dashboard.includes('completedExpeditionRecord={completedExpeditionSummaryRecord}'),
  'Completed expedition data should still be passed into the modern Expedition Summary flow.',
);
assert.ok(
  store.includes("this.logTimelineEvent('expedition_ended'"),
  'Expedition end timeline logging must remain intact.',
);

console.log('Expedition completion popup removal checks passed.');
