const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hubSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');

function includes(fragment, message) {
  assert.ok(hubSource.includes(fragment), message);
}

function notIncludes(fragment, message) {
  assert.ok(!hubSource.includes(fragment), message);
}

[
  'ExpeditionArchiveView',
  'showArchiveView',
  'Expedition Archive',
  'Open Expedition Archive',
  'A chronological logbook of completed expeditions.',
  'sortTripsChronologically(trips)',
  'buildArchiveLifetimeStats(trips, badges)',
  'buildArchiveRecordHighlights(trips)',
].forEach((snippet) => {
  includes(snippet, `Archive storyline should include ${snippet}.`);
});

[
  'Total Completed Expeditions',
  'Total Miles',
  'Total Hours',
  'Highest Elevation',
  'Total Badges Earned',
  'Total Notable Moments',
  'Personal Records',
  'Longest Expedition',
  'Highest Route',
  'Longest Duration',
  'Most Badges Earned on One Trip',
  'Most Notable Moments on One Trip',
  'Storyline',
].forEach((label) => {
  includes(label, `Archive should render real lifetime stats or records: ${label}.`);
});

[
  'formatCompletedDate(trip.completedAt)',
  'formatDistance(trip.totalDistanceMiles)',
  'formatDuration(trip.totalDurationSeconds)',
  'formatNullableElevation(trip.maxElevationFt)',
  'trip.badgesUnlockedCount',
  'trip.notableMomentsCount',
  'onOpenTrip(trip.id)',
].forEach((snippet) => {
  includes(snippet, `Archive trip row should display saved trip summary data: ${snippet}.`);
});

[
  'No completed expeditions yet.',
  'Completed journeys will build your expedition history here.',
].forEach((copy) => {
  includes(copy, `Archive empty state should include ${copy}.`);
});

[
  'regional map of all completed expeditions',
  'year/month filters and seasonal history',
  'exported archive report',
  'personal best comparisons and route replay',
].forEach((todo) => {
  includes(todo, `Archive future hook should mention ${todo}.`);
});

[
  'getCompletedTrips',
  'getUnlockedBadges',
  'getTripById(tripId)',
].forEach((snippet) => {
  includes(snippet, `Archive should reuse existing expedition data access path: ${snippet}.`);
});

for (const forbidden of [
  'SafetyChecklist',
  'fake timeline',
  'social feed',
  'placeholder widget',
  'EXPEDITION_BADGE_DEFINITIONS.map',
]) {
  notIncludes(forbidden, `Archive should avoid forbidden behavior: ${forbidden}.`);
}

console.log('Expedition archive storyline checks passed.');
