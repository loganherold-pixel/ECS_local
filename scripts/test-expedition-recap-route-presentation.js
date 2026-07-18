const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const modelPath = path.join(root, 'lib', 'expedition', 'expeditionRecapRoutePresentation.ts');

require.extensions['.ts'] = function compileTs(module, filename) {
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
};

const { buildExpeditionRecapRoutePresentation } = require(modelPath);

const recordedRoute = [
  { lat: 39.1, lng: -122.5, elevationFt: 1_200, recordedAt: '2026-07-01T10:00:00.000Z' },
  { lat: 39.2, lng: -122.4, elevationFt: 3_400, recordedAt: '2026-07-01T11:00:00.000Z' },
  { lat: 39.3, lng: -122.2, elevationFt: 900, recordedAt: '2026-07-01T12:00:00.000Z' },
];
const plannedRoute = [
  { lat: 40.1, lng: -123.5, elevationFt: 2_000 },
  { lat: 40.2, lng: -123.4, elevationFt: 4_500 },
  { lat: 40.3, lng: -123.2, elevationFt: 1_500 },
];

const recap = {
  tripId: 'trip-42',
  generatedAt: '2026-07-01T12:01:00.000Z',
  journeySummary: {},
  routeSummary: {},
  expeditionEvents: {
    notableMoments: [
      {
        id: 'existing-high-id',
        capturedAt: '2026-07-01T11:00:00.000Z',
        type: 'highest_elevation',
        title: 'Highest elevation reached',
        coordinate: recordedRoute[1],
      },
      {
        id: 'terrain-story-id',
        capturedAt: '2026-07-01T11:30:00.000Z',
        type: 'terrain_risk_warning',
        title: 'Rock shelf crossed',
        detail: 'Caution terrain snapshot',
        coordinate: recordedRoute[1],
      },
      {
        id: 'existing-finish-id',
        capturedAt: '2026-07-01T12:00:00.000Z',
        type: 'guidance_completed',
        title: 'Guidance completed',
        coordinate: recordedRoute[2],
      },
    ],
    routeDeviations: [],
    reroutes: [],
    recoveryPanelUsage: [],
  },
  tripOutcome: {},
  generatedNarrative: {},
};

const recorded = buildExpeditionRecapRoutePresentation({
  tripId: 'trip-42',
  startedAt: '2026-07-01T10:00:00.000Z',
  completedAt: '2026-07-01T12:00:00.000Z',
  routeGeometry: recordedRoute,
  plannedRouteGeometry: plannedRoute,
  recap,
});

assert.strictEqual(recorded.status, 'ready');
assert.strictEqual(recorded.source, 'recorded', 'A drawable recorded GPS track must win over planned geometry.');
assert.deepStrictEqual(recorded.geometry, recordedRoute);
assert.deepStrictEqual(recorded.bounds, { north: 39.3, south: 39.1, east: -122.2, west: -122.5 });
assert.deepStrictEqual(recorded.startCoordinate, recordedRoute[0]);
assert.deepStrictEqual(recorded.endCoordinate, recordedRoute[2]);
assert.strictEqual(recorded.highestElevation.elevationFt, 3_400);
assert.strictEqual(recorded.highestElevation.routePointIndex, 1);
assert.strictEqual(recorded.lowestElevation.elevationFt, 900);
assert.strictEqual(recorded.lowestElevation.routePointIndex, 2);
assert.strictEqual(recorded.elevationSampleCount, 3);
assert.strictEqual(recorded.storyMoments[0].type, 'route_start');
assert.strictEqual(recorded.storyMoments.at(-1).type, 'route_finish');
assert.strictEqual(recorded.storyMoments.at(-1).id, 'existing-finish-id');
assert.strictEqual(
  recorded.storyMoments.find((moment) => moment.type === 'highest_elevation').id,
  'existing-high-id',
  'Geometry-derived high point should retain the existing recap ID used by map/timeline selection.',
);
assert.strictEqual(
  recorded.storyMoments.filter((moment) => moment.type === 'highest_elevation').length,
  1,
  'Existing recap highs must not duplicate the deterministic geometry-derived high point.',
);
assert.strictEqual(
  recorded.storyMoments.find((moment) => moment.id === 'terrain-story-id').severity,
  'caution',
  'Existing normalized recap moments should remain in the route story with their stable IDs.',
);
assert.ok(
  recorded.storyMoments.find((moment) => moment.type === 'lowest_elevation').title.includes('Recorded'),
  'Recorded elevation story wording must identify its GPS-track source.',
);

const sparseRecordedInput = [{ lat: 38, lng: -121, elevationFt: 700 }];
const plannedFallback = buildExpeditionRecapRoutePresentation({
  tripId: 'planned-fallback',
  startedAt: '2026-07-02T10:00:00.000Z',
  completedAt: '2026-07-02T12:00:00.000Z',
  routeGeometry: sparseRecordedInput,
  plannedRouteGeometry: [
    { lat: Number.NaN, lng: -123.7, elevationFt: 9_999 },
    ...plannedRoute,
  ],
  recap: { ...recap, tripId: 'planned-fallback' },
});

assert.strictEqual(plannedFallback.status, 'ready');
assert.strictEqual(plannedFallback.source, 'planned');
assert.deepStrictEqual(plannedFallback.geometry, plannedRoute, 'Invalid planned coordinates should not block valid route geometry.');
assert.strictEqual(sparseRecordedInput.length, 1, 'Selecting planned geometry must not rewrite the recorded GPS trace.');
assert.strictEqual(plannedFallback.sourceLabel, 'Planned route fallback');
assert.ok(/does not represent confirmed travel/i.test(plannedFallback.sourceDetail));
assert.strictEqual(
  plannedFallback.storyMoments.find((moment) => moment.type === 'route_start').timestamp,
  null,
  'A planned-route fallback must not assign the expedition start time to an unconfirmed route endpoint.',
);
assert.strictEqual(
  plannedFallback.storyMoments.find((moment) => moment.type === 'route_finish').timestamp,
  null,
  'A planned-route fallback must not assign the expedition completion time to an unconfirmed route endpoint.',
);
assert.ok(
  plannedFallback.storyMoments.find((moment) => moment.type === 'highest_elevation').title.includes('Planned-route'),
  'Planned elevation story wording must not claim a recorded high point.',
);
assert.ok(
  plannedFallback.storyMoments.find((moment) => moment.type === 'highest_elevation').description.includes('does not confirm'),
  'Planned elevation descriptions must not claim the route point was traveled.',
);
assert.strictEqual(
  plannedFallback.storyMoments.find((moment) => moment.type === 'highest_elevation').timestamp,
  null,
  'Planned elevation samples must not be assigned a fabricated expedition timestamp.',
);
assert.notStrictEqual(
  plannedFallback.storyMoments.find((moment) => moment.type === 'highest_elevation').id,
  'existing-high-id',
  'A synthesized planned-route high must not reuse the identity of an observed elevation event.',
);
assert.notStrictEqual(
  plannedFallback.storyMoments.find((moment) => moment.type === 'route_finish').id,
  'existing-finish-id',
  'An unconfirmed planned endpoint must not reuse the identity of an observed completion event.',
);

const noElevation = buildExpeditionRecapRoutePresentation({
  tripId: 'no-elevation',
  routeGeometry: [
    { lat: 34.1, lng: -118.2 },
    { lat: 34.2, lng: -118.1, elevationFt: null },
  ],
});
assert.strictEqual(noElevation.elevationSampleCount, 0);
assert.strictEqual(noElevation.highestElevation, null);
assert.strictEqual(noElevation.lowestElevation, null);
assert.ok(
  !noElevation.storyMoments.some((moment) => moment.category === 'elevation'),
  'Missing elevation samples must not produce fabricated high or low story moments.',
);

const flatRoute = buildExpeditionRecapRoutePresentation({
  tripId: 'flat-route',
  routeGeometry: [
    { lat: 34.1, lng: -118.2, elevationFt: 1_000 },
    { lat: 34.2, lng: -118.1, elevationFt: 1_000 },
  ],
});
assert.strictEqual(
  flatRoute.storyMoments.filter((moment) => moment.category === 'elevation').length,
  1,
  'A flat route should not create duplicate high and low callouts at the same sample.',
);
assert.strictEqual(
  flatRoute.storyMoments.find((moment) => moment.category === 'elevation').type,
  'flat_elevation_profile',
  'Equal samples should be labeled as a flat profile rather than a meaningful high point.',
);

const singleElevationSample = buildExpeditionRecapRoutePresentation({
  tripId: 'single-elevation-sample',
  routeGeometry: [
    { lat: 34.1, lng: -118.2, elevationFt: 1_000 },
    { lat: 34.2, lng: -118.1 },
  ],
});
assert.strictEqual(
  singleElevationSample.storyMoments.find((moment) => moment.category === 'elevation').type,
  'elevation_sample',
  'One elevation sample must be presented as limited coverage rather than a route high or low.',
);

const unavailable = buildExpeditionRecapRoutePresentation({
  routeGeometry: [{ lat: 95, lng: 20 }],
  plannedRouteGeometry: [{ lat: 35, lng: -118 }],
});
assert.strictEqual(unavailable.status, 'unavailable');
assert.strictEqual(unavailable.source, 'unavailable');
assert.deepStrictEqual(unavailable.geometry, []);
assert.strictEqual(unavailable.bounds, null);
assert.strictEqual(unavailable.startCoordinate, null);
assert.strictEqual(unavailable.endCoordinate, null);
assert.deepStrictEqual(unavailable.storyMoments, []);

console.log('Expedition recap route presentation checks passed.');
