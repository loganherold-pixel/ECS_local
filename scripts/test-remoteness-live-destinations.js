const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const types = read('lib/remotenessTypes.ts');
assert(types.includes('export interface RemotenessDestination'), 'normalized RemotenessDestination contract must exist');
for (const field of ['type:', 'label:', 'distanceMiles?:', 'latitude:', 'longitude:', "source: 'live' | 'cache' | 'unavailable'", 'updatedAt?:']) {
  assert(types.includes(field), `RemotenessDestination must include ${field}`);
}
for (const field of ['label?:', 'latitude?:', 'longitude?:', 'sourceState?:', 'updatedAt?:']) {
  assert(types.includes(field), `ProximityEstimate must expose ${field}`);
}

const liveProximity = read('lib/remotenessLiveProximity.ts');
assert(liveProximity.includes('getFeatureLabel'), 'live proximity lookup must preserve town/fuel/road labels');
assert(liveProximity.includes("label: 'Here'"), 'road proximity must show Here when road classifier says user is already on-road');
assert(liveProximity.includes('sourceState: estimate.sourceState'), 'cached proximity must preserve truthful unavailable state');
assert(liveProximity.includes('[REMOTENESS] destination_resolved'), 'live proximity lookup must log resolved destinations');
assert(liveProximity.includes('[REMOTENESS] destination_unavailable'), 'live proximity lookup must log unavailable destinations');

const destinations = read('lib/remotenessDestinations.ts');
assert(destinations.includes('buildRemotenessDestinations'), 'shared remoteness destination selector must exist');
assert(destinations.includes('resolveRemotenessDestination'), 'destination resolver must exist');
assert(destinations.includes("paved_road: 'road'"), 'paved road navigation target must map to road destination type');

const widget = read('components/dashboard/RemotenessIndexWidget.tsx');
assert(widget.includes('buildRemotenessDestinations(index)'), 'Remoteness widget surface/detail must use shared destination records');
assert(!widget.includes('numberOfLines={1}\n        style={[\n          styles.proximityTileValue'), 'Remoteness destination labels must not be forced into single-line clipping');
assert(widget.includes("flexWrap: 'wrap'"), 'Remoteness destination labels must wrap by word');
assert(widget.includes('disabled={!hasLocation || !onNavigateToTarget || !hasTownDestination}'), 'town navigation must be disabled when destination is unavailable');
assert(widget.includes('disabled={!hasLocation || !onNavigateToTarget || !hasFuelDestination}'), 'fuel navigation must be disabled when destination is unavailable');
assert(widget.includes('disabled={!hasLocation || !onNavigateToTarget || !hasRoadDestination}'), 'road navigation must be disabled when destination is unavailable');

const dashboard = read('app/(tabs)/dashboard.tsx');
assert(dashboard.includes('resolveRemotenessDestination('), 'Dashboard remoteness navigation must resolve from shared destination record');
assert(dashboard.includes('buildRemotenessDestinationNavigationPayload'), 'Dashboard remoteness navigation must build handoff from destination record');
for (const marker of ['[REMOTENESS_NAV] start', '[REMOTENESS_NAV] route_created', '[REMOTENESS_NAV] failure']) {
  assert(dashboard.includes(marker), `Dashboard remoteness navigation must log ${marker}`);
}

const detailModal = read('components/dashboard/WidgetDetailModal.tsx');
assert(detailModal.includes('maxHeightFraction={1}'), 'Widget detail modal must use full available height');
assert(detailModal.includes('minHeightFraction={1}'), 'Widget detail modal must fill the available ECS app length');
assert(detailModal.includes('topClearanceOverride={widgetDetailTopClearance}'), 'Widget detail modal must respect top banner clearance');
assert(detailModal.includes('bottomClearanceOverride={widgetDetailBottomClearance}'), 'Widget detail modal must respect CommandDock clearance');
assert(detailModal.includes('[WIDGET_DETAIL] bounds_applied fullHeight=true'), 'Widget detail modal must log full-height bounds application');

console.log('Remoteness live destination checks passed.');
