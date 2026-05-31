const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const timelineSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionNotableMomentsTimeline.tsx'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

includes(tabSource, "import ExpeditionNotableMomentsTimeline from './ExpeditionNotableMomentsTimeline'", 'Expedition detail should import the notable moments timeline.');
includes(tabSource, '<ExpeditionNotableMomentsTimeline', 'Expedition detail should render notable moments below the recap map.');
assert.ok(
  tabSource.indexOf('<ExpeditionRecapMap') < tabSource.indexOf('<ExpeditionNotableMomentsTimeline'),
  'Notable Moments timeline should appear below the Recap Map.',
);
includes(tabSource, 'recap={trip.recap}', 'Timeline should read stored completed-trip recap data.');
includes(tabSource, 'tripStartedAt={trip.startedAt}', 'Timeline should receive trip start time for elapsed-time labels.');

for (const snippet of [
  'Notable Moments',
  'No notable moments captured.',
  'Future expeditions will record key route, terrain, and condition events.',
  'recap?.expeditionEvents.notableMoments ?? []',
  '.sort((left, right) =>',
  'elapsedSeconds',
  'formatElapsed',
  'timestamp',
  'description',
  'categoryForMoment',
  'highest_elevation',
  'weather_change',
  'route_deviation',
  'reroute_accepted',
  'terrain_risk_warning',
  'recovery_tools_opened',
  'campsite',
  'resupply',
  'source: \'expedition_recap\'',
]) {
  includes(timelineSource, snippet, `Timeline should include required notable moment behavior: ${snippet}`);
}

for (const todo of [
  'TODO Expedition Timeline: link timeline rows to recap map callouts',
  'TODO Expedition Timeline: support exploded route annotations',
  'TODO Expedition Timeline: expose badge triggers',
  'TODO Expedition Timeline: add PDF timeline export',
  'TODO Expedition Timeline: coordinate weather/terrain overlays',
]) {
  includes(timelineSource, todo, `Timeline future hook should remain TODO-only: ${todo}`);
}

for (const forbidden of [
  'SafetyChecklist',
  'RecoveryPanel',
  'exportExpeditionDebriefPdf',
  'Export PDF',
  'badge UI',
  'fake notable',
  'mock moment',
  'useExpeditionAssessmentStore',
  'followUser',
]) {
  notIncludes(timelineSource, forbidden, `Timeline should not include forbidden behavior: ${forbidden}`);
}

includes(packageSource, 'test:expedition-notable-moments-timeline', 'package.json should expose the timeline test.');

console.log('Expedition notable moments timeline checks passed.');
