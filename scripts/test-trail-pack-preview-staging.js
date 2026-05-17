const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
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

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } };
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
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

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
require.extensions['.tsx'] = compileTypescript;

const {
  buildExploreNavigationPayload,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));
const {
  canStartTrailPackGuidance,
  getDefaultECSTrailPacks,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const previewSource = fs.readFileSync(
  path.join(root, 'components', 'trailPacks', 'TrailPackPreviewModal.tsx'),
  'utf8',
);
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');

const loopTrailPack = getDefaultECSTrailPacks().find((pack) => pack.id === 'tahoe-forest-loop-pack');
assert(loopTrailPack, 'Loop Trail Pack fixture should exist');
assert.strictEqual(canStartTrailPackGuidance(loopTrailPack), true, 'Valid Trail Pack geometry should allow guidance staging');

const opportunity = trailPackToExpeditionOpportunity({
  ...loopTrailPack,
  distanceFromUserMiles: 4.2,
  evaluatedConfidence: {
    score: 90,
    band: 'verified',
    reasons: ['Route geometry is available'],
    warnings: ['Seasonal closure data unavailable'],
    blockers: [],
    lastEvaluatedAt: new Date().toISOString(),
  },
});
const payload = buildExploreNavigationPayload(opportunity);
assert.strictEqual(payload.source, 'explore');
assert.strictEqual(payload.tripMode, 'hybrid');
assert.strictEqual(payload.trailGeometry.length, 5, 'Trail Pack geometry should stage into Navigate payload');
assert.strictEqual(payload.trailheadCoordinate.lat, loopTrailPack.centerCoordinate.latitude);
assert.strictEqual(payload.routeMetadata.source, 'trail_pack', 'Trail Pack source metadata should survive staging');
assert.strictEqual(payload.routeMetadata.trailPackId, loopTrailPack.id);
assert.strictEqual(payload.routeMetadata.trailPackRouteType, 'loop');

const pointToPointPack = getDefaultECSTrailPacks().find((pack) => pack.id === 'san-juan-alpine-gpx-pack');
assert(pointToPointPack, 'Point-to-point Trail Pack fixture should exist');
const pointPayload = buildExploreNavigationPayload(trailPackToExpeditionOpportunity({
  ...pointToPointPack,
  distanceFromUserMiles: 5,
  evaluatedConfidence: {
    score: 81,
    band: 'high',
    reasons: [],
    warnings: [],
    blockers: [],
    lastEvaluatedAt: new Date().toISOString(),
  },
}));
assert.strictEqual(pointPayload.routeMetadata.trailPackRouteType, 'point_to_point');
assert.strictEqual(pointPayload.trailGeometry.length, 4, 'Point-to-point Trail Pack should stage geometry');

const missingGeometryPack = {
  ...loopTrailPack,
  id: 'missing-geometry-preview',
  routeGeometry: undefined,
};
assert.strictEqual(canStartTrailPackGuidance(missingGeometryPack), false, 'Missing geometry should disable Start Guidance');

assert(
  previewSource.includes('RouteSegment') &&
    previewSource.includes('startMarker') &&
    previewSource.includes('endMarker') &&
    previewSource.includes('LOOP ROUTE') &&
    previewSource.includes('POINT ROUTE'),
  'Trail Pack preview should display route line, start/end, and loop/point indicators',
);
assert(
  previewSource.includes('Offline cache unavailable for this Trail Pack.') &&
    previewSource.includes('offlineCacheAvailable') &&
    previewSource.includes('disabled={!offlineCacheAvailable}'),
  'Offline cache action should be disabled when Trail Pack cache support is unavailable',
);
assert(
  previewSource.includes('ECS confidence') &&
    previewSource.includes('WARNINGS') &&
    previewSource.includes('sourceLabel') &&
    previewSource.includes('communitySummary'),
  'Trail Pack preview should show difficulty, confidence, warnings, source, verification, and community summary',
);
assert(
  discoverSource.includes('Trail Pack staged. Navigate to the route start before beginning guidance.') &&
    discoverSource.includes('routeStartDistanceMiles') &&
    discoverSource.includes('TrailPackPreviewModal'),
  'Explore should stage Trail Packs into Navigate with a clear far-from-start message',
);
assert(
  discoverSource.includes("handleTrailPackFeedback(trailPackPreview.id, 'saved')"),
  'Saving a Trail Pack from preview should keep structured feedback connected',
);

console.log('Trail Pack preview and staging checks passed');
