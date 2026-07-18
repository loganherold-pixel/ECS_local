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
  'storyMoments.map((moment) =>',
  'recap?.expeditionEvents.notableMoments',
  'filter((moment) => isValidCoordinate(moment.coordinate))',
  "moment.routeSource !== 'planned' || moment.routePointIndex != null",
  'buildRecapMapPayload',
  'features: model.focusCallouts.map',
  'properties: { id: callout.id',
  'onPress={() => selectCallout(callout.id)}',
  'controlledSelectedCalloutId',
  'onCalloutSelected?.(calloutId)',
  'selectedCalloutId',
  'selectedCallout',
  'selectedCalloutPopover',
  "message?.type === 'calloutSelected'",
  'window.__ECS_RECAP_MAP_SELECT__',
  'selectedCalloutId={selectedCalloutId}',
  '.setDOMContent(popupContent)',
  'LeaderLine',
  'calloutLeaderLine',
  'calloutAnchor',
  'calloutCard',
  'placed.length < MIN_CALLOUTS',
  "if ((!recap && !storyMoments?.length) || projectedRoute.length < 2) return []",
  'if (width < 300 || focusCallouts.length === 0) return []',
].forEach((snippet) => {
  includes(mapSource, snippet, `Recap map callout foundation should include ${snippet}.`);
});

assert(
  mapSource.lastIndexOf('model.callouts.map') > mapSource.indexOf('styles.finishMarker'),
  'Callouts should render after the completed route markers without modifying active navigation maps.',
);
assert(
  mapSource.includes('Modal') &&
    mapSource.includes('testID="expedition-recap-map-fullscreen"') &&
    mapSource.includes('mapMode="expanded"'),
  'Recap callout map should support an expanded interactive full-screen map.',
);
assert(
  mapSource.includes('scrollEnabled={mapMode === \'expanded\'}') &&
    mapSource.includes('bounces={false}') &&
    mapSource.includes('onMessage={handleMapMessage}'),
  'Expanded recap map WebView should be interactive and feed selected callouts back to React Native.',
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
  'onUserDrag',
  'SafetyChecklist',
  'exportExpeditionDebriefPdf',
  'fake callout',
  'placeholder callout',
  '.setHTML(',
]) {
  notIncludes(mapSource, forbidden, `Callout map must avoid forbidden behavior: ${forbidden}`);
}

console.log('Expedition recap map callout checks passed.');
