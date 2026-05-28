const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tabSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'),
  'utf8',
);
const detailViewSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx'),
  'utf8',
);
const modalSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailModal.tsx'),
  'utf8',
);
const popupLayoutSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'expeditionPopupLayout.ts'),
  'utf8',
);

assert.ok(
  tabSource.includes("import ExpeditionAssessmentDetailModal from './ExpeditionAssessmentDetailModal'"),
  'Expedition tab should use the assessment detail modal.',
);
assert.ok(
  tabSource.includes('useExpeditionAssessmentStore'),
  'Expedition tab should consume the Expedition assessment store/hook.',
);
assert.ok(
  tabSource.includes('setSelectedAssessmentCategory(card.id)'),
  'Card press should select the assessment category.',
);
assert.ok(
  !tabSource.includes('setPlaceholderTitle(card.label as ExpeditionPlaceholderTitle)'),
  'Top Expedition cards should no longer open the generic placeholder modal.',
);
assert.ok(
  tabSource.includes('markTopCardViewed(card.id)'),
  'Pressing an active card should still clear viewed/unread state.',
);

for (const [id, label] of [
  ['overview', 'Overview'],
  ['route', 'Route'],
  ['convoy', 'Convoy'],
  ['camp', 'Camp'],
  ['logistics', 'Logistics'],
  ['vehicles', 'Vehicles'],
]) {
  assert.ok(tabSource.includes(`id: '${id}'`), `${label} card should remain in Expedition tab config.`);
  assert.ok(tabSource.includes(`label: '${label}'`), `${label} card label should remain unchanged.`);
  assert.ok(tabSource.includes(`getAssessmentCardState('${id}'`), `${label} should read assessment summary/status.`);
}

assert.ok(
  tabSource.includes('assessmentStore.assessments[selectedAssessmentCategory]') &&
    tabSource.includes('assessmentStore.narratives[selectedAssessmentCategory]'),
  'Assessment modal should receive the selected category assessment and narrative.',
);
assert.ok(
  tabSource.includes('onRefresh={() =>') &&
    tabSource.includes('refreshAssessments()') &&
    tabSource.includes('onOpenIncidentRecovery={() =>'),
  'Assessment modal should receive refresh and Incident & Recovery action handlers.',
);
assert.ok(
  tabSource.includes('card.alertCount') &&
    tabSource.includes('card.assessmentStatus') &&
    tabSource.includes('card.stale'),
  'Cards should expose status, concern count, and stale state from assessments.',
);

for (const expectedText of [
  'ECS Assessment',
  'Why ECS Thinks This',
  'What To Watch',
  'Recommended Action',
  'To Improve Status',
  'Data Used',
]) {
  assert.ok(
    detailViewSource.includes(expectedText),
    `Assessment detail view should render ${expectedText}.`,
  );
}

assert.ok(
  detailViewSource.includes('DataUsedSection') &&
    detailViewSource.includes('assessment?.dataUsed') &&
    detailViewSource.includes('formatSourceLabel') &&
    detailViewSource.includes('MISSING') &&
    detailViewSource.includes('STALE'),
  'Assessment detail view should render compact Data Used provenance with source and stale/missing markers.',
);
assert.ok(
  !detailViewSource.includes('Related Actions'),
  'Assessment detail view should not render the noisy Related Actions section.',
);

assert.ok(
  detailViewSource.includes('escalationRecommended') &&
    detailViewSource.includes('Escalation Recommended'),
  'Assessment detail view should render escalation state.',
);
assert.ok(
  modalSource.includes('TacticalPopupShell'),
  'Assessment detail should use the existing tactical modal pattern.',
);
assert.ok(
  popupLayoutSource.includes('useExpeditionFullBodyPopupProps') &&
    popupLayoutSource.includes('getEcsTopBannerLayoutMetrics') &&
    popupLayoutSource.includes('topClearanceOverride') &&
    popupLayoutSource.includes('bottomClearanceOverride') &&
    popupLayoutSource.includes('maxHeightFraction: 1') &&
    popupLayoutSource.includes('minHeightFraction: 1'),
  'Expedition popups should use a banner-anchored full-body shell layout.',
);

for (const modalFile of [
  'ExpeditionPlaceholderModal.tsx',
  'ExpeditionAssessmentDetailModal.tsx',
  'ExpeditionDebriefModal.tsx',
  'ReportIncidentModal.tsx',
  'SafetyChecklistModal.tsx',
  'ECSAssessmentModal.tsx',
  'CommunicationPacketModal.tsx',
  'IncidentTimelineModal.tsx',
  'ResolveDebriefModal.tsx',
]) {
  const source = fs.readFileSync(path.join(root, 'components', 'dashboard', modalFile), 'utf8');
  assert.ok(
    source.includes('useExpeditionFullBodyPopupProps') &&
      source.includes('const fullBodyPopupProps = useExpeditionFullBodyPopupProps()') &&
      source.includes('{...fullBodyPopupProps}'),
    `${modalFile} should use the shared Expedition full-body popup layout.`,
  );
}

console.log('Expedition assessment UI wiring checks passed.');
