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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const {
  getRouteCatalogSourceRestriction,
  isRouteCatalogSourcePublishable,
  assertRouteCatalogSourcePublishable,
  routeCatalogRestrictedSourceUpserts,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogSourceRestrictions.ts'));

const bdr = getRouteCatalogSourceRestriction('bdr_partner_restricted');
assert(bdr, 'BDR restricted partner source should be registered');
assert.strictEqual(bdr.sourceType, 'partner_restricted');
assert.strictEqual(bdr.status, 'disabled');
assert.strictEqual(bdr.usePermission, 'not_granted');
assert.strictEqual(bdr.publishable, false);
assert(
  /license|permission|publishing/i.test(bdr.blocker),
  'BDR blocker should explain that permission is required before publishing',
);

const californiaStateParks = getRouteCatalogSourceRestriction(
  'california_state_parks_roads_trails_restricted',
);
assert(californiaStateParks, 'California State Parks restricted route source should be registered');
assert.strictEqual(californiaStateParks.sourceType, 'partner_restricted');
assert.strictEqual(californiaStateParks.authority, 'partner_restricted');
assert.strictEqual(californiaStateParks.status, 'disabled');
assert.strictEqual(californiaStateParks.usePermission, 'not_granted');
assert.strictEqual(californiaStateParks.publishable, false);
assert.strictEqual(californiaStateParks.sourceUri, 'https://www.parks.ca.gov/?page_id=29682');
assert(
  /commercial use requires advance approval/i.test(californiaStateParks.blocker),
  'California State Parks blocker should preserve the commercial-use approval requirement',
);

assert.strictEqual(
  isRouteCatalogSourcePublishable({
    providerId: 'california_state_parks_roads_trails_restricted',
    sourceType: 'partner_restricted',
    usePermission: 'not_granted',
  }),
  false,
  'Registered restricted sources should not be publishable',
);
assert.strictEqual(
  isRouteCatalogSourcePublishable({
    providerId: 'usfs_mvum_tahoe_nf',
    sourceType: 'official',
    usePermission: 'granted',
  }),
  true,
  'Official sources with granted use permission should remain publishable candidates',
);
assert.throws(
  () =>
    assertRouteCatalogSourcePublishable({
      providerId: 'california_state_parks_roads_trails_restricted',
      sourceType: 'partner_restricted',
      usePermission: 'not_granted',
    }),
  /commercial use requires advance approval/i,
  'Publishing assertion should hard-block California State Parks data until approval exists',
);

const sourceUpserts = routeCatalogRestrictedSourceUpserts();
const californiaUpsert = sourceUpserts.find(
  (source) => source.provider_id === 'california_state_parks_roads_trails_restricted',
);
assert(californiaUpsert, 'Restricted-source seed upserts should include California State Parks');
assert.strictEqual(californiaUpsert.source_type, 'partner_restricted');
assert.strictEqual(californiaUpsert.authority, 'partner_restricted');
assert.strictEqual(californiaUpsert.status, 'disabled');
assert.strictEqual(californiaUpsert.source_uri, 'https://www.parks.ca.gov/?page_id=29682');
assert(
  /commercial use requires advance approval/i.test(californiaUpsert.license),
  'Restricted-source seed should keep commercial-use approval language visible in the license field',
);

const restrictedMigration = read(path.join('supabase', 'migrations', '029_route_catalog_restricted_sources.sql'));
assert(
  restrictedMigration.includes('california_state_parks_roads_trails_restricted') &&
    restrictedMigration.includes('partner_restricted') &&
    restrictedMigration.includes('commercial use requires advance approval') &&
    restrictedMigration.includes("'disabled'"),
  'Restricted source migration should seed California State Parks as disabled partner-restricted metadata only',
);

assert(
  !fs.existsSync(path.join(root, 'supabase', 'functions', 'route-catalog-sync-california-state-parks')),
  'California State Parks sync function should not exist until commercial approval/licensing is granted',
);
assert(
  !fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-california-state-parks-sync.yml')),
  'California State Parks sync workflow should not exist until commercial approval/licensing is granted',
);

const architecture = read(path.join('docs', 'architecture.md'));
assert(
  architecture.includes('California State Parks') &&
    architecture.includes('commercial use requires advance approval') &&
    architecture.includes('disabled') &&
    architecture.includes('Do not ingest, sync, rehost, or recommend'),
  'Architecture docs should document the California State Parks commercial-use restriction and disabled posture',
);

console.log('Route catalog source restriction checks passed');
