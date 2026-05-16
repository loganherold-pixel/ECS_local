const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function requireTs(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('./') || request.startsWith('../')) {
      return requireTs(path.join(path.dirname(relativePath), request).replace(/\\/g, '/'));
    }
    return require(request);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const {
  buildPrivateSaveInputFromCommunityCampsite,
  createCommunityCampsiteBoundsQuery,
  fetchApprovedCommunityCampsitesForViewport,
  filterRenderableCommunityCampSites,
  toCommunityCampsiteMarkerPayload,
} = requireTs('lib/campsites/communityCampsiteMapLayer.ts');

function site(overrides = {}) {
  return {
    id: 'site-approved',
    canonical_name: 'Ridge Pullout',
    latitude: 38.78,
    longitude: -121.2,
    status: 'approved',
    visibility: 'community',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck', 'van'],
    trailer_friendly: true,
    max_rig_length_ft: 22,
    max_group_size: 3,
    amenities: { fire_ring: true, toilet: false },
    conditions: { cell_signal: 'weak', seasonal_notes: 'Muddy after rain.' },
    trust_score: 72,
    legal_confidence: 'medium',
    last_confirmed_at: '2026-04-20T12:00:00.000Z',
    confirmation_count: 4,
    flag_count: 0,
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

const bounds = {
  minLat: 38,
  minLng: -122,
  maxLat: 39,
  maxLng: -120,
};

const query = createCommunityCampsiteBoundsQuery(bounds, {
  access_difficulty: 'high_clearance',
  trailer_friendly: true,
});
assert.deepStrictEqual(
  {
    minLat: query.minLat,
    minLng: query.minLng,
    maxLat: query.maxLat,
    maxLng: query.maxLng,
    access_difficulty: query.access_difficulty,
    trailer_friendly: query.trailer_friendly,
  },
  {
    ...bounds,
    access_difficulty: 'high_clearance',
    trailer_friendly: true,
  },
  'Layer query should preserve viewport bounds and filters.',
);

const filtered = filterRenderableCommunityCampSites([
  site(),
  site({ id: 'hidden-site', status: 'hidden' }),
  site({ id: 'private-site', visibility: 'private' }),
]);
assert.deepStrictEqual(
  filtered.map((item) => item.id),
  ['site-approved'],
  'Only approved community camp_sites should be renderable.',
);

let recordedParams = null;
const fakeService = {
  async listApprovedCommunityCampsitesByBounds(params) {
    recordedParams = params;
    return {
      ok: true,
      data: [site(), site({ id: 'archived-site', status: 'archived' })],
    };
  },
};

fetchApprovedCommunityCampsitesForViewport(fakeService, bounds).then((result) => {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.length, 1, 'Fetch helper should filter non-renderable records defensively.');
  assert.strictEqual(recordedParams.minLat, bounds.minLat);
  assert.strictEqual(recordedParams.maxLng, bounds.maxLng);
  assert.strictEqual(recordedParams.limit, 100);

  const marker = toCommunityCampsiteMarkerPayload(result.data[0], true);
  assert.strictEqual(marker.markerKind, 'community_campsite');
  assert.strictEqual(marker.communityCampSiteId, 'site-approved');
  assert.strictEqual(marker.selected, true);
  assert.strictEqual(marker.category, 'community');
  assert.strictEqual(marker.rankLabel, 'CM');

  const saveInput = buildPrivateSaveInputFromCommunityCampsite(result.data[0]);
  assert.strictEqual(saveInput.visibility_requested, 'private');
  assert.strictEqual(saveInput.source_type, 'manual');
  assert.deepStrictEqual(saveInput.vehicle_fit, ['full_size_truck', 'van']);

  const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
  const detailSource = fs.readFileSync(
    path.join(root, 'components', 'navigate', 'CommunityCampsiteDetailCard.tsx'),
    'utf8',
  );
  const serviceSource = fs.readFileSync(
    path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
    'utf8',
  );

  assert.ok(
    serviceSource.includes(".eq('status', 'approved')") &&
      serviceSource.includes(".eq('visibility', 'community')"),
    'Public campsite service query must request only approved community sites.',
  );

  assert.ok(
    navigateSource.includes('fetchApprovedCommunityCampsitesForViewport') &&
      navigateSource.includes('combinedCampMarkers') &&
      navigateSource.includes("payload?.markerKind === 'community_campsite'") &&
      navigateSource.includes('<CommunityCampsiteDetailCard'),
    'Navigate should fetch, render, and open detail UI for community campsite markers.',
  );

  assert.ok(
    navigateSource.includes('confirmCampsite({') &&
      navigateSource.includes('flagCampsite({') &&
      navigateSource.includes('buildPrivateSaveInputFromCommunityCampsite'),
    'Community campsite detail actions should call save, confirm, and flag services.',
  );

  assert.ok(
    detailSource.includes('Site Type') &&
      detailSource.includes('Access') &&
      detailSource.includes('Vehicle Fit') &&
      detailSource.includes('Confirm still available') &&
      detailSource.includes('Flag problem'),
    'Community detail card should expose the requested campsite metadata and actions.',
  );

  console.log('Community campsite map layer checks passed.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
