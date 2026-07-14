const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const catalogViewSource = read('components/dashboard/ExpeditionBadgeCatalogView.tsx');
const visualsSource = read('components/dashboard/ExpeditionBadgeVisuals.tsx');
const catalogSource = read('lib/expedition/expeditionBadgeCatalog.ts');

[
  'ExpeditionBadgeCatalogView',
  'Badge Catalog',
  'getBadgeProgress',
  'badgeProgress',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Expedition Hub catalog wiring should include ${snippet}.`);
});

[
  'Total Badges Earned',
  'Rarest Badge Earned',
  'Most Recent Unlock',
  'Expeditions With Badges',
  'Recent',
  'Rarity',
  'Category',
  'Earned',
  'Available',
].forEach((label) => {
  assert(catalogViewSource.includes(label), `Badge catalog should include ${label}.`);
});

assert(
  catalogViewSource.includes('SectionList') &&
    catalogViewSource.includes('initialNumToRender={12}') &&
    catalogViewSource.includes('maxToRenderPerBatch={12}') &&
    catalogViewSource.includes('windowSize={7}') &&
    !catalogViewSource.includes('<ScrollView'),
  'The 160-plus item badge catalog should use bounded virtualized rendering.',
);

assert(
  catalogSource.includes('getExpeditionBadgeCatalogForUser') &&
    catalogSource.includes('const earnedIds = new Set(earnedBadgeIds)') &&
    catalogSource.includes('.filter((definition) => !definition.isHidden || earnedIds.has(definition.id))') &&
    catalogSource.includes('artwork: isEarned ? getExpeditionBadgeArtwork(definition.id) : null'),
  'Catalog selector should deduplicate earned IDs, hide locked hidden definitions, and gate artwork on earned state.',
);

assert(
  catalogViewSource.includes('isEarned={entry.isEarned}') &&
    catalogViewSource.includes('artwork={entry.artwork}') &&
    catalogViewSource.includes('badgeProgress') &&
    visualsSource.includes("isEarned ? 'achieved' : 'locked'") &&
    visualsSource.includes('badge.iconKey'),
  'Catalog cards should show achieved art while preserving iconKey and known progress for locked visible badges.',
);

assert(
  !hubSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !catalogViewSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !hubSource.toLowerCase().includes('mystery badge') &&
    !catalogViewSource.toLowerCase().includes('mystery badge'),
  'Registry iteration and hidden-state policy should stay in the pure catalog selector.',
);

for (const forbidden of [
  'SafetyChecklist',
  'fake badge',
  'placeholder badge',
  'Alert.alert',
]) {
  assert(!catalogViewSource.includes(forbidden), `Badge catalog should avoid forbidden behavior: ${forbidden}.`);
  assert(!visualsSource.includes(forbidden), `Badge visuals should avoid forbidden behavior: ${forbidden}.`);
}

console.log('Expedition badge collection view checks passed.');
