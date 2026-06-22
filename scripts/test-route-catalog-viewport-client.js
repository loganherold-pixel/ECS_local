const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'lib', 'routeCatalogViewportClient.ts');
const servicePath = path.join(root, 'lib', 'routeCatalogViewport.ts');
const supabasePath = path.join(root, 'lib', 'supabase.ts');

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
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      functions: {
        invoke: async () => {
          throw new Error('Default Supabase client should not be used by this test.');
        },
      },
    },
  },
};

assert(fs.existsSync(modulePath), 'Route catalog viewport client should exist.');

const {
  buildRouteCatalogViewportSearchBody,
  fetchRouteCatalogViewportFeatures,
} = require(modulePath);
const { buildRouteCatalogViewportQuery } = require(servicePath);

const query = buildRouteCatalogViewportQuery({
  bbox: {
    minLng: -120.72,
    minLat: 39.18,
    maxLng: -120.28,
    maxLat: 39.42,
  },
  zoom: 11,
  regionTags: ['tahoe_nf'],
  limit: 250,
});

const body = buildRouteCatalogViewportSearchBody(query);
assert.strictEqual(body.latitude, query.center.latitude);
assert.strictEqual(body.longitude, query.center.longitude);
assert.strictEqual(body.radiusMiles, query.radiusMiles);
assert.strictEqual(body.limit, 250);
assert.strictEqual(body.includeGeometry, true);
assert.strictEqual(body.includePreviewGeometry, true);
assert.strictEqual(body.includeAssessment, true);
assert.strictEqual(body.recommendationOnly, false);
assert.strictEqual(body.locationSource, 'navigate_ecs_route_geometry_viewport');

let invokedName = null;
let invokedBody = null;
const mockClient = {
  functions: {
    invoke: async (name, options) => {
      invokedName = name;
      invokedBody = options.body;
      return {
        data: {
          ok: true,
          records: [
            {
              id: 'route-a',
              public_id: 'route-a',
              name: 'Tahoe Connector',
              route_type: 'point_to_point',
              center_latitude: 39.3,
              center_longitude: -120.5,
              distance_miles: 12.4,
              official_access_coverage_pct: 100,
              unknown_access_coverage_pct: 0,
              restricted_access_coverage_pct: 0,
              active_closure_count: 0,
              seasonal_restriction_count: 0,
              verification_status: 'official_verified',
              recommendation_status: 'recommendable',
              review_status: 'approved',
              confidence_score: 92,
              tags: ['Tahoe National Forest', 'tahoe_nf'],
              source_records: [
                {
                  provider_id: 'usfs_mvum',
                  label: 'USFS MVUM',
                  source_type: 'federal_agency',
                  authority: 'USFS MVUM official agency source',
                  last_verified_at: new Date().toISOString(),
                },
              ],
              route_geometry_mode: 'full',
              route_geometry: {
                type: 'LineString',
                coordinates: [
                  [-120.66, 39.23],
                  [-120.52, 39.31],
                  [-120.34, 39.38],
                ],
              },
            },
          ],
        },
        error: null,
      };
    },
  },
};

(async () => {
  const result = await fetchRouteCatalogViewportFeatures(query, { client: mockClient });
  assert.strictEqual(invokedName, 'route-catalog-search');
  assert.deepStrictEqual(invokedBody, body);
  assert.strictEqual(result.featureCollection.features.length, 1);
  assert.strictEqual(result.featureCollection.features[0].properties.routeId, 'route-a');
  assert.strictEqual(result.featureCollection.features[0].properties.geometryStatus, 'guidance_ready');
  console.log('Route catalog viewport client checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
