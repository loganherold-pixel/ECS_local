const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const root = path.resolve(__dirname, '..');
const approachPath = path.join(root, 'lib', 'campsites', 'campsiteApproachRouting.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');

const {
  buildCampsiteApproachRouteIntent,
  buildCampsiteFinalAccessSegment,
  resolveCampsiteApproach,
} = require(approachPath);

const camp = { lat: 39.004, lng: -121.004 };
const approach = { lat: 39.002, lng: -121.002 };

const clearIntent = buildCampsiteApproachRouteIntent({
  actionId: 'pending-camp-1',
  title: 'Pending Camp',
  subtitle: 'Pending campsite',
  campCoordinate: camp,
  approachCoordinate: approach,
});

assert.strictEqual(clearIntent.destination.coordinate.lat, approach.lat, 'Mapbox destination should be the routable approach point.');
assert.strictEqual(clearIntent.destination.coordinate.lng, approach.lng, 'Mapbox destination should be the routable approach point.');
assert.strictEqual(clearIntent.destination.raw.campCoordinate.lat, camp.lat, 'Route metadata should retain the actual campsite pin.');
assert.strictEqual(clearIntent.destination.raw.campsiteApproach.kind, 'routable_approach_with_final_access');
assert.ok(clearIntent.finalAccess, 'Off-route campsite should include final access guidance.');
assert.strictEqual(clearIntent.finalAccess.status, 'clear');

const clearSegment = buildCampsiteFinalAccessSegment(clearIntent.finalAccess);
assert.ok(clearSegment, 'Clear final access should render a dotted map segment.');
assert.strictEqual(clearSegment.kind, 'campsite_final_access');
assert.strictEqual(clearSegment.category, 'final_access');
assert.deepStrictEqual(clearSegment.coordinates[0], [approach.lng, approach.lat]);
assert.deepStrictEqual(clearSegment.coordinates[1], [camp.lng, camp.lat]);

const blockedIntent = buildCampsiteApproachRouteIntent({
  actionId: 'blocked-camp-1',
  title: 'Blocked Camp',
  subtitle: 'Pending campsite',
  campCoordinate: camp,
  approachCoordinate: approach,
  blockers: [
    { type: 'water', label: 'Creek crossing', confidence: 'known' },
    { type: 'private_property', label: 'Private parcel', confidence: 'known' },
  ],
});

assert.ok(blockedIntent.finalAccess, 'Blocked final access should still be represented for warnings.');
assert.strictEqual(blockedIntent.finalAccess.status, 'blocked');
assert.strictEqual(
  buildCampsiteFinalAccessSegment(blockedIntent.finalAccess),
  null,
  'Blocked final access must not draw a dotted line across water, roads, or private property.',
);

const samePoint = resolveCampsiteApproach({
  campCoordinate: camp,
  approachCoordinate: { lat: camp.lat + 0.00001, lng: camp.lng + 0.00001 },
});
assert.strictEqual(samePoint.kind, 'routable_campsite', 'Tiny offsets should not create misleading final-access legs.');
assert.strictEqual(samePoint.finalAccess, null);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert.ok(
  navigateSource.includes('buildCampsiteApproachRouteIntent'),
  'Navigate campsite preview should resolve a routable approach intent.',
);
assert.ok(
  navigateSource.includes('buildCampsiteFinalAccessSegment'),
  'Navigate should build a final access segment from the resolved approach.',
);
assert.ok(
  navigateSource.includes('setCampsiteFinalAccess'),
  'Navigate should retain final campsite access state for map rendering.',
);
assert.ok(
  navigateSource.includes('campsiteFinalAccessSegment'),
  'Navigate should append final campsite access to map segments.',
);
assert.ok(
  navigateSource.includes('destination: approachIntent.destination') ||
    navigateSource.includes('approachIntent.destination'),
  'Campsite route metadata should preserve approach status.',
);

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
assert.ok(
  mapRendererSource.includes('campsite-final-access-layer'),
  'MapRenderer should render campsite final access with a dedicated dotted layer.',
);
assert.ok(
  mapRendererSource.includes("['==', ['get', 'kind'], 'campsite_final_access']"),
  'Final access layer should be filtered away from ordinary route segments.',
);
assert.ok(
  mapRendererSource.includes("'line-dasharray'"),
  'Final access layer should render as a dotted/dashed line.',
);

console.log('campsite approach routing checks passed');
