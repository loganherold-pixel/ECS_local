const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionRecapMap.tsx'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

includes(tabSource, "import ExpeditionRecapMap from './ExpeditionRecapMap'", 'Expedition detail should import the recap map component.');
includes(tabSource, '<ExpeditionRecapMap', 'Expedition detail should render a recap map section.');
includes(tabSource, 'routeGeometry={trip.routeGeometry}', 'Recap map should receive stored route geometry from getTripById().');
includes(tabSource, 'routeBounds={trip.recap?.routeSummary.routeBounds ?? trip.routeBounds}', 'Recap map should prefer recap bounds and fall back to trip bounds.');
includes(tabSource, 'startCoordinate={trip.startCoordinate}', 'Recap map should receive the trip start coordinate.');
includes(tabSource, 'endCoordinate={trip.endCoordinate}', 'Recap map should receive the trip finish coordinate.');
includes(tabSource, 'recap={trip.recap}', 'Recap map should receive ExpeditionRecap data.');
includes(tabSource, 'tripStartedAt={trip.startedAt}', 'Recap map should receive trip start time for elapsed callout labels.');

for (const snippet of [
  'Route map unavailable.',
  'This expedition was saved without route geometry.',
  'routeGeometry.filter(isValidCoordinate)',
  'validRoute.length < 2',
  'normalizeBounds(routeBounds, validRoute)',
  'routeGeometryReference',
  'pointerEvents="none"',
  'Completed expedition recap map',
  'styles.startMarker',
  'styles.finishMarker',
  'COMPLETED ROUTE',
  'SAVED ROUTE',
  '#F2C24D',
  'MAX_CALLOUTS = 5',
  'MIN_CALLOUTS = 3',
  'buildCallouts',
  'recap.expeditionEvents.notableMoments',
  'filter((moment) => isValidCoordinate(moment.coordinate))',
  'calloutScore',
  'nearestRoutePoint',
  'rectsOverlap',
  'placed.length < MIN_CALLOUTS',
  'RecapMapCalloutView',
  'LeaderLine',
  'styles.calloutLeaderLine',
  'formatElapsed(tripStartedAt',
]) {
  includes(mapSource, snippet, `Recap map should include required foundation snippet: ${snippet}`);
}

for (const todo of [
  'TODO Expedition Recap Map: add exploded route annotations',
  'TODO Expedition Recap Map: add export-ready map rendering and printable recap map layout',
  'TODO Expedition Recap Map: add badge stamp overlays',
  'TODO Expedition Recap Map: add weather layer callouts',
  'TODO Expedition Recap Map: add terrain risk callout styling',
]) {
  includes(mapSource, todo, `Recap map should keep future hook as TODO only: ${todo}`);
}

for (const forbidden of [
  'followUser',
  'showUserLocation',
  'onLongPress',
  'onMapTap',
  'onUserDrag',
  'MapOverlayControls',
  'RecoveryPanel',
  'SafetyChecklist',
  'exportExpeditionDebriefPdf',
  'badge UI',
  'fake trip',
  'fake callout',
  'mock callout',
]) {
  notIncludes(mapSource, forbidden, `Recap map should not include active/forbidden behavior: ${forbidden}`);
}

includes(packageSource, 'test:expedition-recap-map', 'package.json should expose the recap map test.');

console.log('Expedition recap map checks passed.');
