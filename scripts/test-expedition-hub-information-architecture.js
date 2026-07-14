const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hubSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const badgeVisualsSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionBadgeVisuals.tsx'), 'utf8');

[
  'ExpeditionHubSection',
  'HubActionCard',
  'EmptyHubState',
  'recentTrips = useMemo(() => completedTrips.slice(0, 3)',
  'recentTrips.map((trip)',
  'hasUnlockedBadges',
  'limit={3}',
  'showAction={false}',
  'PersonalRecordsPreview records={personalRecords}',
  'ExpeditionInsightsSection',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Polished Expedition Hub IA should include ${snippet}.`);
});

assert(
  !hubSource.includes('IncidentRecoveryPanel') &&
    !hubSource.includes('recoverySlot'),
  'Incident & Recovery should no longer occupy Expedition Hub vertical space.',
);

assert(
  hubSource.indexOf('Recent Expeditions') < hubSource.indexOf('<BadgeUnlockSummary') &&
    hubSource.indexOf('<BadgeUnlockSummary') < hubSource.indexOf('<ExpeditionInsightsSection') &&
    hubSource.indexOf('<ExpeditionInsightsSection') < hubSource.indexOf('<PersonalRecordsPreview') &&
    hubSource.indexOf('<PersonalRecordsPreview') < hubSource.indexOf('<HubActionCard'),
  'Hub hierarchy should prioritize recent expeditions, then unlocks, insights, records, and actions.',
);

[
  'if (insights.length === 0) return null;',
  'if (records.length === 0) return null;',
  'if (recentBadges.length === 0) return null;',
].forEach((snippet) => {
  assert(
    hubSource.includes(snippet) || badgeVisualsSource.includes(snippet),
    `Empty secondary sections should be omitted via ${snippet}.`,
  );
});

[
  'No completed expeditions yet.',
  'Your completed journeys will appear here.',
].forEach((copy) => {
  assert(hubSource.includes(copy), `Primary empty state should remain simple: ${copy}.`);
});

[
  'Expedition Archive',
  'Badge Catalog',
  'Open Expedition Archive',
  'Open Badge Catalog',
  'BadgeDetailModal',
  'dismissInsight',
  'Export Expedition Report',
].forEach((snippet) => {
  assert(
    hubSource.includes(snippet) || badgeVisualsSource.includes(snippet),
    `Secondary functionality should remain accessible: ${snippet}.`,
  );
});

for (const forbidden of [
  'Earned badges will appear after completed expeditions.',
  'placeholder widget',
  'placeholder insight',
  'Lorem',
  'SafetyChecklist',
  'Plan Expedition',
  'clearWizardDraft',
  "router.push('/expedition-wizard' as any)",
  'EXPEDITION_BADGE_DEFINITIONS.map',
  'social feed',
]) {
  assert(!hubSource.includes(forbidden), `Hub should avoid overloaded or forbidden UI: ${forbidden}.`);
  assert(!badgeVisualsSource.includes(forbidden), `Badge summary should avoid empty placeholder UI: ${forbidden}.`);
}

console.log('Expedition Hub information architecture checks passed.');
