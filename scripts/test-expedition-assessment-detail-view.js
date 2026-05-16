const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const viewSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx'),
  'utf8',
);
const modalSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailModal.tsx'),
  'utf8',
);

for (const [category, label] of [
  ['overview', 'Overview'],
  ['route', 'Route'],
  ['convoy', 'Convoy'],
  ['camp', 'Camp'],
  ['logistics', 'Logistics'],
  ['vehicles', 'Vehicles'],
]) {
  assert.ok(
    viewSource.includes(`${category}: '${label}'`),
    `Reusable detail view should support ${label}.`,
  );
}

for (const [status, label] of [
  ['normal', 'Normal'],
  ['watch', 'Watch'],
  ['caution', 'Caution'],
  ['critical', 'Critical'],
  ['unknown', 'Unknown'],
]) {
  assert.ok(
    viewSource.includes(`${status}: {`) && viewSource.includes(`label: '${label}'`),
    `Reusable detail view should render ${label} status.`,
  );
}

for (const expectedSection of [
  'CATEGORY',
  'ECS Assessment',
  'Why ECS Thinks This',
  'What To Watch',
  'Recommended Action',
  'To Improve Status',
  'Data Used',
  'Related Actions',
]) {
  assert.ok(
    viewSource.includes(expectedSection),
    `Reusable detail view should include ${expectedSection}.`,
  );
}

assert.ok(
  viewSource.includes('assessment?.missingDataWarnings') &&
    viewSource.includes('MISSING'),
  'Reusable detail view should render missing data warnings.',
);
assert.ok(
  viewSource.includes('assessment?.staleDataWarnings') &&
    viewSource.includes('STALE'),
  'Reusable detail view should render stale data warnings.',
);
assert.ok(
  viewSource.includes('escalationRecommended') &&
    viewSource.includes('Escalation Recommended') &&
    viewSource.includes('Incident & Recovery'),
  'Reusable detail view should render escalation banner leading to Incident & Recovery.',
);
assert.ok(
  viewSource.includes('assessment?.relatedActions') &&
    viewSource.includes('refresh-assessment') &&
    viewSource.includes('open-incident-recovery'),
  'Reusable detail view should render assessment and contextual related actions.',
);
assert.ok(
  viewSource.includes("assessment?.confidence === 'low'") &&
    viewSource.includes('Confidence is low'),
  'Reusable detail view should make low-confidence assessments obvious.',
);
assert.ok(
  viewSource.includes('sourceLabel') &&
    ['GPS', 'MANUAL', 'OBD', 'SATELLITE', 'CACHED', 'MOCK', 'UNKNOWN'].every((label) =>
      viewSource.includes(`'${label}'`),
    ),
  'Reusable detail view should label data sources for the operator.',
);
assert.ok(
  modalSource.includes('ExpeditionAssessmentDetailView') &&
    modalSource.includes('TacticalPopupShell'),
  'Modal should wrap the reusable view in the existing tactical shell.',
);

console.log('Expedition assessment detail view checks passed.');
