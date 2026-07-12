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

const renderedRoadContext = actions.buildNavigateLongPressContext({
  coordinate: { latitude: 38.0007, longitude: -110.0007 },
  routeableFeature: {
    kind: 'road',
    name: 'Rendered Forest Road',
    sourceLabel: 'Visible road geometry',
    confidence: 'map_rendered',
    dataState: 'live',
  },
  hasGpsFix: true,
  canBuildRoute: true,
});
assert.strictEqual(
  renderedRoadContext.actions.navigate_here.enabled,
  true,
  'Navigate Here should be enabled on explicit rendered road/trail long-press context.',
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

const sparseGeometry = [
  { latitude: 38.0000, longitude: -110.0000 },
  { latitude: 38.0000, longitude: -109.9600 },
];
let sparseDraft = builder.createNavigateRouteDraft();
sparseDraft = builder.addAnchorToDraft(sparseDraft, {
  coordinate: { latitude: 38.00008, longitude: -109.9900 },
  availableSegments: [{ id: 'sparse-forest-road', name: 'Sparse Forest Road', coordinates: sparseGeometry, confidence: 'medium', dataState: 'cached' }],
}).draft;
sparseDraft = builder.addAnchorToDraft(sparseDraft, {
  coordinate: { latitude: 37.99994, longitude: -109.9750 },
  availableSegments: [{ id: 'sparse-forest-road', name: 'Sparse Forest Road', coordinates: sparseGeometry, confidence: 'medium', dataState: 'cached' }],
}).draft;
sparseDraft = builder.addAnchorToDraft(sparseDraft, {
  coordinate: { latitude: 38.00005, longitude: -109.9660 },
  availableSegments: [{ id: 'sparse-forest-road', name: 'Sparse Forest Road', coordinates: sparseGeometry, confidence: 'medium', dataState: 'cached' }],
}).draft;

assert(
  sparseDraft.legs.every((leg) => leg.status === 'snapped'),
  'Sparse loaded route geometry should snap taps to the route spine instead of failing between distant vertices.',
);
assert(
  sparseDraft.legs.every((leg) => Math.abs(leg.coordinates[0].latitude - 38) < 0.00002),
  'Off-center taps should be projected onto the road/trail centerline before building the leg.',
);
assert.strictEqual(
  builder.buildRouteBuilderSegmentsFromDraft(sparseDraft).length,
  2,
  'Projected sparse route legs should be saveable/startable geometry.',
);

let renderedDraft = builder.createNavigateRouteDraft();
renderedDraft = builder.addAnchorToDraft(renderedDraft, {
  coordinate: { latitude: 38.00005, longitude: -109.9900 },
  routeableSegment: {
    id: 'rendered-road:visible-spine',
    name: 'Rendered Road Spine',
    sourceLabel: 'Visible road geometry',
    confidence: 'map_rendered',
    dataState: 'live',
    coordinates: sparseGeometry,
  },
}).draft;
renderedDraft = builder.addAnchorToDraft(renderedDraft, {
  coordinate: { latitude: 37.99998, longitude: -109.9720 },
  availableSegments: [],
}).draft;
assert.strictEqual(
  renderedDraft.legs[0].status,
  'snapped',
  'A routeable line captured from the previous tap should be reused so the next point can trace the same visible road.',
);
assert.strictEqual(
  builder.buildRouteBuilderSegmentsFromDraft(renderedDraft).length,
  1,
  'Rendered routeable line traces should become save/start-capable planning geometry.',
);

const connectedRenderedSegments = [
  {
    id: 'rendered-road-west',
    name: 'Split Forest Road',
    sourceLabel: 'Visible road geometry',
    confidence: 'medium',
    dataState: 'live',
    provider: 'rendered_features',
    coordinates: [
      { latitude: 38, longitude: -110 },
      { latitude: 38, longitude: -109.99 },
    ],
  },
  {
    id: 'rendered-road-center',
    name: 'Split Forest Road',
    sourceLabel: 'Visible road geometry',
    confidence: 'medium',
    dataState: 'live',
    provider: 'rendered_features',
    coordinates: [
      { latitude: 38, longitude: -109.99 },
      { latitude: 38, longitude: -109.98 },
    ],
  },
  {
    id: 'rendered-road-east',
    name: 'Split Forest Road',
    sourceLabel: 'Visible road geometry',
    confidence: 'medium',
    dataState: 'live',
    provider: 'rendered_features',
    coordinates: [
      { latitude: 38, longitude: -109.98 },
      { latitude: 38, longitude: -109.97 },
    ],
  },
];
let connectedDraft = builder.createNavigateRouteDraft();
connectedDraft = builder.addAnchorToDraft(connectedDraft, {
  coordinate: { latitude: 38.00004, longitude: -109.998 },
  routeableSegment: connectedRenderedSegments[0],
  availableSegments: connectedRenderedSegments,
}).draft;
connectedDraft = builder.addAnchorToDraft(connectedDraft, {
  coordinate: { latitude: 37.99996, longitude: -109.972 },
  routeableSegment: connectedRenderedSegments[2],
  availableSegments: connectedRenderedSegments,
}).draft;
assert.strictEqual(
  connectedDraft.legs[0].status,
  'snapped',
  'Pins on adjacent rendered road features should trace through their connected geometry.',
);
assert.strictEqual(
  connectedDraft.legs[0].provider,
  'rendered_features',
  'A connected rendered road path should preserve its visible-geometry provider.',
);
assert(
  connectedDraft.legs[0].coordinates.some((point) => Math.abs(point.longitude + 109.99) < 0.000001) &&
    connectedDraft.legs[0].coordinates.some((point) => Math.abs(point.longitude + 109.98) < 0.000001),
  'The snapped leg should include both feature junctions instead of drawing a straight fallback.',
);
const connectedSavable = builder.buildRouteBuilderSegmentsFromDraft(connectedDraft);
assert.strictEqual(connectedSavable.length, 1, 'A connected multi-feature leg should remain one stable rendered segment.');
assert.strictEqual(connectedSavable[0].snapProvider, 'rendered_features');
assert.strictEqual(connectedSavable[0].snapStatus, 'snapped');

const closeSplitSegments = [
  {
    ...connectedRenderedSegments[0],
    id: 'close-split-west',
    coordinates: [
      { latitude: 38, longitude: -110 },
      { latitude: 38, longitude: -109.997 },
    ],
  },
  {
    ...connectedRenderedSegments[1],
    id: 'close-split-east',
    coordinates: [
      { latitude: 38, longitude: -109.997 },
      { latitude: 38, longitude: -109.994 },
    ],
  },
];
let closeSplitDraft = builder.createNavigateRouteDraft();
closeSplitDraft = builder.addAnchorToDraft(closeSplitDraft, {
  coordinate: { latitude: 38, longitude: -109.9995 },
  routeableSegment: closeSplitSegments[0],
  availableSegments: closeSplitSegments,
}).draft;
closeSplitDraft = builder.addAnchorToDraft(closeSplitDraft, {
  coordinate: { latitude: 38, longitude: -109.9945 },
  routeableSegment: closeSplitSegments[1],
  availableSegments: closeSplitSegments,
}).draft;
assert(
  closeSplitDraft.legs[0].coordinates.some((point) => Math.abs(point.longitude + 109.9945) < 0.000001),
  'Different tapped feature IDs should prefer the connected path instead of truncating to a nearby first feature.',
);

const activeGuidanceEnd = { latitude: 38.0040, longitude: -110.0040 };
const futureSegment = {
  id: 'future-trail-spine',
  name: 'Continuation Trail',
  sourceLabel: 'Visible road geometry',
  confidence: 'medium',
  dataState: 'live',
  provider: 'rendered_features',
  coordinates: [
    activeGuidanceEnd,
    { latitude: 38.0050, longitude: -110.0050 },
    { latitude: 38.0060, longitude: -110.0060 },
  ],
};
const activeExtensionResult = builder.addActiveGuidanceExtensionAnchor(builder.createNavigateRouteDraft(), {
  activeRouteEnd: activeGuidanceEnd,
  coordinate: { latitude: 38.00585, longitude: -110.00585 },
  routeableSegment: futureSegment,
  availableSegments: [futureSegment],
});
assert.strictEqual(
  activeExtensionResult.seededFromActiveGuidanceEnd,
  true,
  'Active guidance extension should seed the draft from the current route end.',
);
assert.strictEqual(activeExtensionResult.draft.anchors.length, 2, 'Active extension should include the hidden route-end base plus the user point.');
assert.strictEqual(activeExtensionResult.draft.anchors[0].role, 'active_guidance_end', 'The seed anchor should be marked as the active guidance end.');
assert.strictEqual(activeExtensionResult.draft.anchors[0].hidden, true, 'The active route-end seed should not draw a second visible route-builder pin.');
assert.strictEqual(activeExtensionResult.draft.anchors[1].label, 'A', 'The first user-dropped extension point should still read as point A.');
assert.strictEqual(activeExtensionResult.leg.status, 'snapped', 'The extension leg should stitch from route end to the selected future trail segment.');
const extensionSegments = builder.buildRouteBuilderSegmentsFromDraft(activeExtensionResult.draft);
assert.strictEqual(extensionSegments.length, 1, 'Active extension should create one savable stitched leg.');
assert.strictEqual(extensionSegments[0].buildSource.kind, 'active_guidance_extension', 'Saved metadata should distinguish active guidance extension legs.');
assert.strictEqual(extensionSegments[0].snapProvider, 'rendered_features', 'Visible continuation trails should remain provisional until provider verification.');

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
