/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const originalLoad = Module._load;
Module._load = function loadWithPreviewContractStubs(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-secure-store') {
    return {
      async getItemAsync(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      async setItemAsync(key, value) {
        storage.set(key, String(value));
      },
      async deleteItemAsync(key) {
        storage.delete(key);
      },
    };
  }
  if (parent?.filename?.endsWith(path.join('lib', 'exploreRoutePreview.ts')) && request === './mapConfig') {
    return {
      computeBounds(points) {
        if (!Array.isArray(points) || points.length === 0) return null;
        const lats = points.map((point) => point.lat);
        const lngs = points.map((point) => point.lng);
        return {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
        };
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  buildExploreNavigationPayload,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));
const {
  normalizeNavigationHandoffPreview,
} = require(path.join(root, 'lib', 'exploreRoutePreview.ts'));

const representativeRoute = {
  id: 'preview-contract-route',
  name: 'Preview Contract Route',
  region: 'Synthetic Test Region',
  terrainType: 'mixed',
  startLat: 10,
  startLng: 20,
  distanceMiles: 12,
  endpointCoordinate: { lat: 11, lng: 21 },
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [20.4, 10.4],
      [20.2, 10.2],
      [20, 10],
    ],
  },
  routeMetadata: {
    previewMetadataStatus: 'summary_ready',
    source: 'synthetic_contract',
  },
};

const payload = buildExploreNavigationPayload(representativeRoute, {
  approachOriginCoordinate: { lat: 10.01, lng: 20.01 },
});
const model = normalizeNavigationHandoffPreview(payload, null);

assert.strictEqual(payload.id, representativeRoute.id, 'The public preview payload should preserve route identity.');
assert.strictEqual(payload.title, representativeRoute.name, 'The public preview payload should preserve its summary title.');
assert.strictEqual(payload.routeMetadata.previewMetadataStatus, 'summary_ready');
assert.strictEqual(payload.routeMetadata.source, 'synthetic_contract');
assert.deepStrictEqual(
  payload.trailGeometry[0],
  { lat: 10, lng: 20 },
  'Route geometry should orient from the approach-side route start.',
);
assert.deepStrictEqual(
  payload.coordinate,
  { lat: 10.4, lng: 20.4 },
  'A multi-point geometry endpoint should take precedence over optional endpoint metadata.',
);
assert.strictEqual(model.hasRouteData, true);
assert.strictEqual(model.hasFullGeometry, true);
assert.strictEqual(model.routePoints.length, 3);
assert.deepStrictEqual(model.waypoints, [], 'Summary previews must not invent waypoint pins.');
assert.strictEqual(model.cameraCommand?.mode, 'route_overview');
assert.ok(model.cameraCommand?.fitBounds, 'A representative route summary should produce overview bounds.');
assert.strictEqual(model.previewUnavailableReason, null);

const summaryOnlyPayload = buildExploreNavigationPayload({
  id: 'summary-first-route',
  name: 'Summary First Route',
  region: 'Synthetic Test Region',
  terrainType: 'forest',
  startLat: 30,
  startLng: 40,
  endpointCoordinate: { lat: 30.25, lng: 40.25 },
  routeMetadata: { previewMetadataStatus: 'summary_ready' },
});
const summaryOnlyModel = normalizeNavigationHandoffPreview(summaryOnlyPayload, null);
assert.strictEqual(summaryOnlyPayload.trailGeometry.length, 0, 'Summary-first preview should not require detail geometry.');
assert.strictEqual(summaryOnlyModel.hasFullGeometry, false);
assert.strictEqual(summaryOnlyModel.hasRouteData, true, 'Distinct summary start/end metadata should still support a preview.');
assert.deepStrictEqual(summaryOnlyModel.routePoints, [
  { lat: 30, lng: 40 },
  { lat: 30.25, lng: 40.25 },
]);
assert.deepStrictEqual(summaryOnlyModel.waypoints, []);

const missingOptionalPayload = buildExploreNavigationPayload({
  id: 'missing-optional-preview-fields',
  name: 'Missing Optional Preview Fields',
  region: 'Synthetic Test Region',
  startLat: 50,
  startLng: 60,
  routeMetadata: {
    previewMetadataStatus: 'unavailable',
    routePreviewUnavailableReason: 'Synthetic preview metadata is incomplete.',
  },
});
const missingOptionalModel = normalizeNavigationHandoffPreview(missingOptionalPayload, null);
assert.strictEqual(missingOptionalModel.hasFullGeometry, false);
assert.strictEqual(missingOptionalModel.hasRouteData, false);
assert.strictEqual(missingOptionalModel.routePoints.length, 1, 'A lone trailhead should remain a safe map fallback.');
assert.strictEqual(missingOptionalModel.previewUnavailableReason, 'Synthetic preview metadata is incomplete.');
assert.ok(missingOptionalModel.cameraCommand, 'Missing optional endpoint fields should not crash camera normalization.');
assert.deepStrictEqual(missingOptionalModel.waypoints, []);

console.log('Explore route preview metadata contract checks passed.');
