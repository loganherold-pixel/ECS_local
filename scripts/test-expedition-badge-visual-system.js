const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const visualsSource = read('components/dashboard/ExpeditionBadgeVisuals.tsx');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const celebrationSource = read('components/badges/BadgeUnlockCelebration.tsx');
const hostSource = read('components/badges/BadgeUnlockCelebrationHost.tsx');

[
  'export function ExpeditionBadge',
  'export function ExpeditionBadgeCard',
  'export function BadgeRarityFrame',
  'export function BadgeIcon',
  'export function BadgeUnlockSummary',
  'export function BadgeGrid',
  'export function BadgeDetailModal',
].forEach((snippet) => {
  assert(visualsSource.includes(snippet), `Badge visual system should include ${snippet}.`);
});

[
  'common:',
  'uncommon:',
  'rare:',
  'epic:',
  'legendary:',
  'hidden:',
  'RARITY_STYLES',
  'shadowOpacity',
  'frameAccent',
].forEach((snippet) => {
  assert(visualsSource.includes(snippet), `Badge rarity frame should support ${snippet}.`);
});

[
  'title',
  'description',
  'rarity',
  'category',
  'iconKey',
  'unlockedAt',
  'unlockedTripId',
  'progressCurrent',
  'progressTarget',
].forEach((field) => {
  assert(visualsSource.includes(`badge.${field}`) || visualsSource.includes(field), `Badge visuals should support ${field}.`);
});

[
  'Modal',
  'formatUnlockDate',
  'relatedTripTitle',
  'Expedition unavailable',
  'Close Badge Detail',
  'onPress={() => setSelectedBadge(badge)}',
].forEach((snippet) => {
  assert(visualsSource.includes(snippet), `Badge detail sheet should include ${snippet}.`);
});

[
  'stamp earned badges onto PDF expedition reports',
  'badge location markers to recap maps',
  'seasonal badge themes',
].forEach((todo) => {
  assert(visualsSource.includes(todo), `Badge visual future hook should mention ${todo}.`);
});

assert(
  celebrationSource.includes('getExpeditionBadgeArtwork') &&
    hostSource.includes('BadgeUnlockCelebration'),
  'The root badge celebration should use canonical earned artwork and a single reusable host.',
);

assert(
  visualsSource.includes('ExpeditionBadgeArtwork') &&
    visualsSource.includes('isEarned && artwork') &&
    visualsSource.includes('badge.iconKey'),
  'Badge visuals should use achieved artwork only for earned badges and retain iconKey fallback rendering.',
);

assert(
  visualsSource.includes('badges.filter((badge) => !!badge.unlockedAt)'),
  'Badge visuals should render unlocked badges only.',
);
assert(
  visualsSource.includes('unlockedBadges = badges') &&
    visualsSource.includes('.filter((badge) => !!badge.unlockedAt)') &&
    visualsSource.includes('recentBadges = unlockedBadges.slice(0, limit)') &&
    visualsSource.includes('.slice(0, limit)'),
  'Recent badge summary should be compact and limited.',
);
[
  'Badge Achievements',
  'badgeAchievementList',
  'badgeAchievementRow',
  'badgeAchievementDescription',
  'formatUnlockDate(badge.unlockedAt)',
].forEach((snippet) => {
  assert(visualsSource.includes(snippet), `Badge achievements should render as a compact reflective list: ${snippet}.`);
});
assert(
  visualsSource.includes('Animated.timing') && visualsSource.includes('duration: 260'),
  'Badge summary should use a subtle enter animation only inside review surfaces.',
);

assert(
  hubSource.includes('BadgeGrid') &&
    hubSource.includes('BadgeUnlockSummary') &&
    hubSource.includes("from './ExpeditionBadgeVisuals';"),
  'Expedition Hub should use reusable badge visual components.',
);
assert(
  hubSource.includes('<BadgeUnlockSummary') &&
    hubSource.includes('<BadgeGrid') &&
    hubSource.includes('relatedTripTitle={tripTitle}'),
  'Expedition Hub and Detail should render badges through the premium components.',
);
assert(
  !hubSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !visualsSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !hubSource.includes('Locked Badge') &&
    !visualsSource.includes('Locked Badge'),
  'Badge UI must not expose a complete locked badge catalog.',
);

for (const forbidden of [
  'SafetyChecklist',
  'fake badge',
  'placeholder badge',
  'unlock popup',
  'Alert.alert',
]) {
  assert(!visualsSource.includes(forbidden), `Badge visual system should avoid forbidden behavior: ${forbidden}`);
}

console.log('Expedition badge visual system checks passed.');
