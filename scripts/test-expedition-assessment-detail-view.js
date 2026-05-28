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
]) {
  assert.ok(
    viewSource.includes(expectedSection),
    `Reusable detail view should include ${expectedSection}.`,
  );
}

assert.ok(
  viewSource.includes('assessment?.missingDataWarnings'),
  'Reusable detail view should fold missing data warnings into the user-facing why section.',
);
assert.ok(
  viewSource.includes('assessment?.staleDataWarnings'),
  'Reusable detail view should fold stale data warnings into the user-facing why section.',
);
assert.ok(
  viewSource.includes('escalationRecommended') &&
    viewSource.includes('Escalation Recommended') &&
    viewSource.includes('Incident & Recovery'),
  'Reusable detail view should render escalation banner leading to Incident & Recovery.',
);
assert.ok(
  viewSource.includes('DataUsedSection') &&
    viewSource.includes('assessment?.dataUsed') &&
    viewSource.includes('formatSourceLabel') &&
    viewSource.includes('MISSING') &&
    viewSource.includes('STALE'),
  'Reusable detail view should render compact assessment data provenance, including source and stale/missing markers.',
);
assert.ok(
  !viewSource.includes('Related Actions') &&
    !viewSource.includes('assessment?.relatedActions'),
  'Reusable detail view should not render the noisy Related Actions section.',
);
assert.ok(
  viewSource.includes("assessment?.confidence === 'low'") &&
    viewSource.includes('Confidence is low'),
  'Reusable detail view should make low-confidence assessments obvious.',
);
assert.ok(
  modalSource.includes('ExpeditionAssessmentDetailView') &&
    modalSource.includes('TacticalPopupShell'),
  'Modal should wrap the reusable view in the existing tactical shell.',
);

console.log('Expedition assessment detail view checks passed.');
