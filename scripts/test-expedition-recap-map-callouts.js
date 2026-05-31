const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionRecapMap.tsx'), 'utf8');
const typeSource = fs.readFileSync(path.join(root, 'lib', 'expedition', 'expeditionTripRecordTypes.ts'), 'utf8');
const recapEngineSource = fs.readFileSync(path.join(root, 'lib', 'expedition', 'expeditionRecapEngine.ts'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  'type RecapMapCallout',
  'type CalloutCategory',
  'MAX_CALLOUTS = 5',
  'MIN_CALLOUTS = 3',
  'CALLOUT_WIDTH',
  'CALLOUT_HEIGHT',
  'calloutScore',
  'terrain_risk_warning: 96',
  'recovery_tools_opened: 94',
  'route_deviation: 90',
  'weather_change: 84',
  'highest_elevation: 82',
  'badge_unlocked: 78',
  'recap.expeditionEvents.notableMoments',
  'filter((moment) => isValidCoordinate(moment.coordinate))',
  'nearestRoutePoint',
  'LeaderLine',
  'calloutLeaderLine',
  'calloutAnchor',
  'calloutCard',
  'placed.length < MIN_CALLOUTS',
  'if (!recap || width < 300 || projectedRoute.length < 2) return []',
].forEach((snippet) => {
  includes(mapSource, snippet, `Recap map callout foundation should include ${snippet}.`);
});

assert(
  mapSource.indexOf('model.callouts.map') > mapSource.indexOf('styles.finishMarker'),
  'Callouts should render after the completed route markers without modifying active navigation maps.',
);
assert(
  tabSource.includes('tripStartedAt={trip.startedAt}'),
  'Expedition Detail should pass trip start time to recap map for optional elapsed callout labels.',
);
assert(
  typeSource.includes("'badge_unlocked'") &&
    recapEngineSource.includes("moment.type === 'badge_unlocked'"),
  'Recap moments should preserve badge unlock moments for future badge-location callouts.',
);

for (const todo of [
  'export-ready map rendering',
  'printable recap map layout',
  'badge stamp overlays',
  'weather layer callouts',
  'terrain risk callout styling',
]) {
  includes(mapSource, todo, `Future hook should mention ${todo}.`);
}

for (const forbidden of [
  'followUser',
  'showUserLocation',
  'MapOverlayControls',
  'onMapTap',
  'onUserDrag',
  'SafetyChecklist',
  'exportExpeditionDebriefPdf',
  'fake callout',
  'placeholder callout',
]) {
  notIncludes(mapSource, forbidden, `Callout map must avoid forbidden behavior: ${forbidden}`);
}

console.log('Expedition recap map callout checks passed.');
