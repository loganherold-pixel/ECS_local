const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const visualsSource = read('components/dashboard/ExpeditionBadgeVisuals.tsx');

[
  'UnlockedBadgesView',
  'Unlocked Badges',
  'Earned Badges',
  'getBadgeProgress',
  'badgeProgress',
  'BadgeMilestoneList',
  'BadgeCollectionMode',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Badge collection view should include ${snippet}.`);
});

[
  'Total Badges Earned',
  'Rarest Badge Earned',
  'Most Recent Unlock',
  'Expeditions With Badges',
  'Recent',
  'Rarity',
  'Category',
].forEach((label) => {
  assert(hubSource.includes(label), `Badge collection summary/organization should include ${label}.`);
});

[
  'No badges earned yet.',
  'Complete expeditions to begin earning field accomplishments.',
].forEach((copy) => {
  assert(hubSource.includes(copy), `Badge collection empty state should include ${copy}.`);
});

[
  'badge search',
  'badge artwork upgrade',
  'badge sharing',
  'badge export stamps',
  'seasonal badge collections',
  'rare badge showcase',
].forEach((todo) => {
  assert(hubSource.includes(todo), `Badge collection future hook should mention ${todo}.`);
});

assert(
  visualsSource.includes('export function BadgeMilestoneList') &&
    visualsSource.includes('!badge.unlockedAt && !badge.isHidden && badge.progressTarget != null') &&
    visualsSource.includes('Next Known Milestones'),
  'Next known milestones should use visible progressive locked badges only.',
);

assert(
  hubSource.includes('buildBadgeCollectionSections') &&
    hubSource.includes("mode === 'recent'") &&
    hubSource.includes("mode === 'rarity'") &&
    hubSource.includes('formatCategory(category)'),
  'Badge collection should organize unlocked badges by Recent, Rarity, and Category.',
);

assert(
  !hubSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !visualsSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !hubSource.includes('mystery badge') &&
    !visualsSource.includes('mystery badge') &&
    !hubSource.includes('Locked Badge') &&
    !visualsSource.includes('Locked Badge'),
  'Badge collection must not expose a locked badge catalog or hidden locked badges.',
);

for (const forbidden of [
  'SafetyChecklist',
  'fake badge',
  'placeholder badge',
  'Alert.alert',
]) {
  assert(!hubSource.includes(forbidden), `Badge collection should avoid forbidden behavior: ${forbidden}.`);
  assert(!visualsSource.includes(forbidden), `Badge visuals should avoid forbidden behavior: ${forbidden}.`);
}

console.log('Expedition badge collection view checks passed.');
