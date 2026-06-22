const assert = require('assert');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
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

const responses = [];
const invocations = [];
const mockSupabase = {
  functions: {
    async invoke(name, options) {
      invocations.push({ name, body: options?.body ?? null });
      const next = responses.shift();
      if (!next) {
        throw new Error(`Unexpected Supabase invocation: ${name}`);
      }
      return next;
    },
  },
  from() {
    throw new Error('Legacy trail_packs fallback should not be used by this regression.');
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '../supabase' && parent?.filename.endsWith(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'))) {
    return { supabase: mockSupabase };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  createLiveTrailPackCatalogRefreshKey,
  refreshLiveTrailPackCatalog,
} = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));

function routeRecord(id = 'preserved-tahoe-route') {
  return {
    id,
    public_id: id,
    name: 'Preserved Tahoe Route',
    description: 'A public source-backed route used to verify refresh stability.',
    route_type: 'loop',
    center_latitude: 38.92,
    center_longitude: -120.78,
    route_geometry_mode: 'full',
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.78, 38.92],
        [-120.76, 38.94],
        [-120.73, 38.95],
      ],
    },
    distance_miles: 12.5,
    estimated_duration_minutes: 210,
    difficulty: 'moderate',
    official_access_coverage_pct: 96,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    verification_status: 'verified',
    review_status: 'approved',
    recommendation_status: 'recommended',
    source_records: [
      {
        provider_id: 'usfs-mvum',
        label: 'USFS MVUM',
        source_type: 'official',
        authority: 'official',
        last_verified_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    route_intelligence: {
      tripType: 'day_trip',
      aliases: ['preserved tahoe route'],
      bounds: {
        minLatitude: 38.92,
        minLongitude: -120.78,
        maxLatitude: 38.95,
        maxLongitude: -120.73,
      },
      trailheadCoordinate: { latitude: 38.92, longitude: -120.78 },
    },
    tags: ['Tahoe National Forest', 'day trip'],
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-02T00:00:00.000Z',
  };
}

function searchResponse(records, coverageState) {
  return {
    data: {
      records,
      coverageState,
      meta: {
        candidateCount: records.length,
        radiusMatchedCount: records.length,
        geometryMatchedCount: records.length,
        trailheadMatchedCount: records.length,
        centerMatchedCount: records.length,
        curationCandidateCount: 0,
        anySourceBackedCandidateCount: records.length,
        radiusFilterApplied: true,
      },
    },
    error: null,
  };
}

(async () => {
  const criteria = {
    latitude: 38.9,
    longitude: -120.8,
    radiusMiles: 100,
    locationSource: 'live_gps',
  };
  const refreshKey = createLiveTrailPackCatalogRefreshKey(criteria);

  responses.push(searchResponse([routeRecord()], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'Source-backed ECS route catalog records match the current criteria.',
  }));

  const first = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(first.status, 'ready');
  assert.strictEqual(first.source, 'route_catalog');
  assert.strictEqual(first.refreshKey, refreshKey);
  assert.strictEqual(first.trailPacks.length, 1);
  assert.strictEqual(first.preservedFromEmptyRefresh, false);

  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'Transient empty response should not erase the current same-query list.',
  }));

  const preserved = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(preserved.status, 'ready');
  assert.strictEqual(preserved.source, 'route_catalog');
  assert.strictEqual(preserved.refreshKey, refreshKey);
  assert.strictEqual(preserved.trailPacks.length, 1);
  assert.strictEqual(preserved.trailPacks[0].id, first.trailPacks[0].id);
  assert.strictEqual(preserved.preservedFromEmptyRefresh, true);
  assert.strictEqual(preserved.preservedReason, 'same_query_route_catalog_empty');
  assert.match(String(preserved.error), /Transient empty response/);

  const differentCriteria = { ...criteria, radiusMiles: 25 };
  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'A different radius may truthfully have no matches.',
  }));

  const emptyDifferentSearch = await refreshLiveTrailPackCatalog(differentCriteria);
  assert.strictEqual(emptyDifferentSearch.status, 'ready');
  assert.strictEqual(emptyDifferentSearch.trailPacks.length, 0);
  assert.strictEqual(emptyDifferentSearch.preservedFromEmptyRefresh, false);
  assert.notStrictEqual(emptyDifferentSearch.refreshKey, refreshKey);

  assert.deepStrictEqual(
    invocations.map((entry) => entry.name),
    ['route-catalog-search', 'route-catalog-search', 'route-catalog-search'],
  );

  console.log('Explore live Trail Pack catalog refresh stability checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
