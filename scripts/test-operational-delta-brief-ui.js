/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const component = fs.readFileSync(
  path.join(root, 'components', 'brief', 'OperationalDeltaBriefCard.tsx'),
  'utf8',
);
const commandBrief = fs.readFileSync(
  path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'),
  'utf8',
);
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const readinessStore = fs.readFileSync(
  path.join(root, 'lib', 'readiness', 'expeditionReadinessStore.ts'),
  'utf8',
);
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message ?? `Expected source to include ${fragment}`);
}

[
  'WHAT CHANGED',
  'ECS OPERATIONAL DELTA',
  'Comparison Baseline',
  'Material Changes',
  'Mark Last Stop',
  'Acknowledge',
  'Dismiss',
  'No saved baseline for this route or expedition',
  'DETERMINISTIC OPERATIONAL COMPARISON',
  'SourceTruthInspectorTrigger',
  'ECSSegmentedControl',
  'ECSModalShell',
  'ECSPanel',
  'ECSBadge',
  'ECSButton',
  'buildOperationalDeltaResult',
  'operationalDeltaBriefStore',
  'suppressedFingerprints',
  'accessibilityLabel',
  'accessibilityHint',
  'testID="operational-delta-brief-card"',
  'testID="operational-delta-detail-sheet"',
].forEach((fragment) => includes(component, fragment));

assert.ok(
  !/(#[0-9a-fA-F]{3,8}|rgba?\()/.test(component),
  'Operational Delta UI should use ECS tokens instead of raw colors.',
);
assert.ok(
  !/(api[_-]?key|authorization|bearer|service[_-]?role|raw provider response)/i.test(component),
  'Operational Delta UI must not expose provider secrets or raw responses.',
);

assert.ok(
  !commandBrief.includes('<OperationalDeltaBriefCard'),
  'Compact Command Brief must not mount the additional Operational Delta card.',
);
assert.ok(
  !commandBrief.includes('buildOperationalSnapshotFromReadiness'),
  'Compact Command Brief must not calculate an unmounted Operational Delta presentation.',
);
assert.ok(
  commandBrief.includes('<DepartureAuditNarrative'),
  'Command Brief should use the requested concise Departure Audit narrative instead.',
);
assert.ok(
  dashboard.includes('<CommandBriefScreen embedded />'),
  'Dashboard should continue mounting the canonical compact Command Brief.',
);

[
  "baselineKind: 'departure'",
  "operationalDeltaBriefStore.captureBaseline('departure'",
  'overwrite: false',
  'getResolvedInput(): ExpeditionReadinessInput',
].forEach((fragment) => includes(readinessStore, fragment));

[
  '"test:operational-delta-brief"',
  '"test:operational-delta-store"',
  '"test:operational-delta-brief-ui"',
].forEach((fragment) => includes(packageSource, fragment));

console.log('Operational Delta Brief UI contract tests passed.');
