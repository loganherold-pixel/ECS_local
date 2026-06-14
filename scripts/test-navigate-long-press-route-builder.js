const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const actions = require(path.join(root, 'lib', 'navigateLongPressActions.ts'));
const builder = require(path.join(root, 'lib', 'navigatePointRouteBuilder.ts'));

const routeableFeature = {
  id: 'segment-alpha',
  kind: 'route_geometry_segment',
  name: 'Alaska Mine Trail 11W01',
  sourceLabel: 'ECS Route Geometry Overlay',
  confidence: 'high',
  dataState: 'cached',
  warnings: ['Planning geometry only. Verify access locally.'],
};

const routeableContext = actions.buildNavigateLongPressContext({
  coordinate: { latitude: 38.0005, longitude: -110.0005 },
  routeableFeature,
  hasGpsFix: true,
  canBuildRoute: true,
});

assert.strictEqual(routeableContext.coordinate.latitude, 38.0005);
assert.strictEqual(routeableContext.actions.draw_route.enabled, true, 'Draw Route should be available from long press.');
assert.strictEqual(routeableContext.actions.add_waypoint.enabled, true, 'Add Waypoint should be available from long press.');
assert.strictEqual(routeableContext.actions.info.enabled, true, 'Info should be available from long press.');
assert.strictEqual(routeableContext.actions.navigate_here.enabled, true, 'Navigate Here should be enabled on viable route geometry.');
assert(
  routeableContext.infoRows.some((row) => row.label === 'Access' && /unknown/i.test(row.value)),
  'Point info must show unknown access instead of inventing legal status.',
);
assert(
  routeableContext.infoRows.some((row) => row.label === 'Confidence' && /high/i.test(row.value)),
  'Point info should preserve routeable feature confidence.',
);

const wildernessContext = actions.buildNavigateLongPressContext({
  coordinate: { latitude: 39, longitude: -111 },
  routeableFeature: null,
  hasGpsFix: true,
  canBuildRoute: true,
});

assert.strictEqual(wildernessContext.actions.navigate_here.enabled, false);
assert.match(
  wildernessContext.actions.navigate_here.disabledReason,
  /No routeable trail or road geometry/i,
  'Navigate Here should stay visible but disabled when no viable routeable context exists.',
);

const geometry = [
  { latitude: 38.0000, longitude: -110.0000 },
  { latitude: 38.0010, longitude: -110.0010 },
  { latitude: 38.0020, longitude: -110.0020 },
  { latitude: 38.0030, longitude: -110.0030 },
];

let draft = builder.createNavigateRouteDraft();
draft = builder.addAnchorToDraft(draft, {
  coordinate: { latitude: 38.0000, longitude: -110.0000 },
  availableSegments: [{ id: 'segment-alpha', name: 'Alaska Mine Trail 11W01', coordinates: geometry, confidence: 'high', dataState: 'cached' }],
}).draft;
draft = builder.addAnchorToDraft(draft, {
  coordinate: { latitude: 38.0020, longitude: -110.0020 },
  availableSegments: [{ id: 'segment-alpha', name: 'Alaska Mine Trail 11W01', coordinates: geometry, confidence: 'high', dataState: 'cached' }],
}).draft;
draft = builder.addAnchorToDraft(draft, {
  coordinate: { latitude: 38.0030, longitude: -110.0030 },
  availableSegments: [{ id: 'segment-alpha', name: 'Alaska Mine Trail 11W01', coordinates: geometry, confidence: 'high', dataState: 'cached' }],
}).draft;

assert.strictEqual(draft.anchors.length, 3, 'Pin-to-pin builder should create ordered A/B/C anchors.');
assert.strictEqual(draft.legs.length, 2, 'Each new anchor after A should create one traced leg.');
assert(draft.legs.every((leg) => leg.status === 'snapped'), 'Viable ECS geometry should produce snapped legs.');
assert(draft.legs.every((leg) => leg.provider === 'ecs_route_geometry'), 'ECS route geometry is the preferred trace provider.');
assert(draft.legs.every((leg) => leg.source !== 'freehand'), 'Pin-to-pin builder must not create freehand legs.');

const savable = builder.buildRouteBuilderSegmentsFromDraft(draft);
assert.strictEqual(savable.length, 2, 'Savable custom route segments should be produced from snapped traced legs.');
assert(savable.every((segment) => segment.snapStatus === 'snapped'), 'Savable segments should remain verified snapped geometry.');
assert(savable.every((segment) => segment.snapProvider === 'ecs_route_geometry'), 'Saved segments should preserve ECS geometry source.');

const nearest = builder.resolveNearestNavigateRouteAnchor(draft, { latitude: 38.0021, longitude: -110.0021 });
assert.strictEqual(nearest && nearest.label, 'B', 'Start should route GPS to the nearest user-dropped anchor.');

const startPlan = builder.buildRouteFromNearestAnchor(draft, { latitude: 38.0021, longitude: -110.0021 });
assert.strictEqual(startPlan.entryAnchor && startPlan.entryAnchor.label, 'B');
assert(startPlan.coordinates.length >= 2, 'Start handoff should include route geometry from the entry anchor forward.');

const undone = builder.undoLastNavigateRouteAnchor(draft);
assert.strictEqual(undone.anchors.length, 2, 'Undo should remove the last anchor.');
assert.strictEqual(undone.legs.length, 1, 'Undo should remove the last traced leg.');
assert.strictEqual(builder.clearNavigateRouteDraft(undone).anchors.length, 0, 'Clear should remove every anchor.');

const blocked = builder.addAnchorToDraft(builder.createNavigateRouteDraft(), {
  coordinate: { latitude: 40, longitude: -120 },
  availableSegments: [],
}).draft;
const blockedSecond = builder.addAnchorToDraft(blocked, {
  coordinate: { latitude: 40.1, longitude: -120.1 },
  availableSegments: [],
}).draft;
assert.strictEqual(blockedSecond.legs[0].status, 'blocked', 'Missing geometry should block tracing instead of saving raw/freehand line.');
assert.strictEqual(builder.buildRouteBuilderSegmentsFromDraft(blockedSecond).length, 0, 'Blocked legs should not become saved route segments.');

console.log('Navigate long-press and pin-to-pin route builder checks passed.');
