const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const {
  DISPERSED_ROUTE_LEG_PLANNING_WARNING,
  buildDispersedRouteLegSegments,
  dispersedRouteLegToRouteBuilderSegment,
  normalizeDispersedRouteLegCoordinates,
} = require(path.join(root, 'lib', 'map', 'dispersedCampingSegmentBuild.ts'));

const routeStoreSource = fs.readFileSync(path.join(root, 'lib', 'routeStore.ts'), 'utf8');

const routeableLine = {
  id: 'fs-road-88',
  sourceLayer: 'road',
  properties: {
    class: 'track',
    surface: 'dirt',
    name: 'FS 88',
    regionId: 'blm-moab-01',
    landManager: 'BLM',
    eligibilityConfidence: 'high',
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-109.62, 38.55],
      [-109.61, 38.551],
      [-109.6, 38.552],
      [-109.59, 38.553],
    ],
  },
};

const repeatedLine = {
  ...routeableLine,
  id: 'fs-road-88-repeat',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-109.62, 38.55],
      [-109.62, 38.55],
      [-109.61, 38.551],
      [-109.6, 38.552],
    ],
  },
};

assert.deepStrictEqual(
  normalizeDispersedRouteLegCoordinates(repeatedLine.geometry.coordinates),
  [
    [-109.62, 38.55],
    [-109.61, 38.551],
    [-109.6, 38.552],
  ],
  'Coordinate normalization should remove invalid and duplicate consecutive coordinates without flipping lng/lat order.',
);

const [firstSegment] = buildDispersedRouteLegSegments([routeableLine]);
const [secondSegment] = buildDispersedRouteLegSegments([{ ...routeableLine, id: 'different-render-id' }]);

assert.ok(firstSegment, 'Routeable rendered road/trail/path features should produce a selectable leg segment.');
assert.strictEqual(
  firstSegment.id,
  secondSegment.id,
  'Leg segment IDs should be stable coordinate hashes instead of volatile rendered feature IDs.',
);
assert.strictEqual(firstSegment.sourceLabel, 'FS 88');
assert.strictEqual(firstSegment.confidence, 'planning_geometry');
assert.deepStrictEqual(firstSegment.regionIds, ['blm-moab-01']);
assert.strictEqual(firstSegment.landManager, 'BLM');
assert.deepStrictEqual(firstSegment.warnings, [DISPERSED_ROUTE_LEG_PLANNING_WARNING]);

const blockedSegments = buildDispersedRouteLegSegments([
  { ...routeableLine, properties: { ...routeableLine.properties, access: 'private' } },
  { ...routeableLine, properties: { ...routeableLine.properties, seasonal: 'closed' } },
  { ...routeableLine, properties: { ...routeableLine.properties, eligibilityConfidence: 'restricted' } },
  { ...routeableLine, properties: { ...routeableLine.properties, camping: 'prohibited' } },
  { ...routeableLine, properties: { ...routeableLine.properties, access: 'no_access' } },
]);
assert.strictEqual(
  blockedSegments.length,
  0,
  'Private, closed, prohibited, no-access, and restricted features should not become yellow build legs.',
);

const multilineSegments = buildDispersedRouteLegSegments([
  {
    id: 'multi',
    properties: { class: 'path', regionIds: ['usfs-01'], landManager: 'USFS' },
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-109.7, 38.57],
          [-109.69, 38.571],
        ],
        [
          [-109.68, 38.572],
          [-109.67, 38.573],
        ],
      ],
    },
  },
]);

assert.strictEqual(multilineSegments.length, 2, 'MultiLineString routeable features should split into one selectable leg per line.');
assert.ok(
  multilineSegments.every((segment) => segment.regionIds.includes('usfs-01')),
  'Split MultiLineString legs should preserve eligibility region metadata.',
);

const routeBuilderSegment = dispersedRouteLegToRouteBuilderSegment(firstSegment);
assert.strictEqual(routeBuilderSegment.sourceSegmentId, firstSegment.id);
assert.strictEqual(routeBuilderSegment.snapSource, 'dispersed-route-leg');
assert.strictEqual(routeBuilderSegment.snapStatus, 'snapped');
assert.strictEqual(routeBuilderSegment.snapMessage, DISPERSED_ROUTE_LEG_PLANNING_WARNING);
assert.deepStrictEqual(routeBuilderSegment.buildSource, {
  kind: 'dispersed_route_leg',
  sourceLabel: 'FS 88',
  confidence: 'planning_geometry',
  regionIds: ['blm-moab-01'],
  landManager: 'BLM',
});

assert.ok(
  routeStoreSource.includes('source_metadata?: RouteSegmentSourceMetadata | null;') &&
    routeStoreSource.includes('sourceMetadata?: RouteSegmentSourceMetadata | null;') &&
    routeStoreSource.includes('source_metadata: input.source_metadata ?? input.sourceMetadata ?? null,'),
  'routeStore custom route persistence should preserve optional segment source metadata.',
);

console.log('Dispersed camping segment build checks passed.');
