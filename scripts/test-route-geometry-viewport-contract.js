const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migrationPath = path.join('supabase', 'migrations', '036_route_geometry_viewport_segments.sql');
const functionPath = path.join('supabase', 'functions', 'route-geometry-segments', 'index.ts');
const supabasePath = path.join('lib', 'supabase.ts');
const envExamplePath = '.env.example';

assert(fs.existsSync(path.join(root, migrationPath)), 'Route geometry viewport migration should exist.');
assert(fs.existsSync(path.join(root, functionPath)), 'route-geometry-segments Edge Function should exist.');

const migration = read(migrationPath);
const edgeFunction = read(functionPath);
const supabaseClient = read(supabasePath);
const envExample = read(envExamplePath);

assert(
  migration.includes('search_route_geometry_segments_for_viewport') &&
    migration.includes('ST_MakeEnvelope') &&
    migration.includes('ST_Intersects') &&
    migration.includes('ST_AsGeoJSON') &&
    migration.includes('route_segments') &&
    migration.includes("legality_status <> 'closed_or_prohibited'") &&
    migration.includes("public_access_status <> 'closed'"),
  'Migration should expose a bounded PostGIS viewport RPC that excludes closed/prohibited segments.',
);
assert(
  migration.includes('grant execute on function public.search_route_geometry_segments_for_viewport') &&
    migration.includes('to service_role') &&
    !migration.includes('to anon') &&
    !migration.includes('to authenticated'),
  'Viewport RPC should be callable by service_role only.',
);

for (const required of [
  'ECS_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'route_segments',
  "rpc('search_route_geometry_segments_for_viewport'",
  'cleanBbox',
  'cleanZoom',
  'includeReferenceGeometry',
  'maxLimit',
  'cappedCount',
  'skippedMissingGeometryCount',
  'source_records',
]) {
  assert(edgeFunction.includes(required), `route-geometry-segments should include ${required}.`);
}
assert(
  !edgeFunction.includes('RIDB_API_KEY') &&
    !edgeFunction.includes('NPS_API_KEY') &&
    !edgeFunction.includes('CAMPFLARE_API_KEY') &&
    !edgeFunction.includes('ACTIVE_API_KEY') &&
    !edgeFunction.includes('RESERVEAMERICA_API_KEY'),
  'Route geometry viewport function must not expose campground/provider secrets.',
);

assert(
  supabaseClient.includes('"route-geometry-segments"'),
  'Supabase client allowlist should include the route-geometry-segments Edge Function.',
);
assert(
  envExample.includes('EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY=false'),
  '.env.example should document the route geometry viewport overlay feature flag as default-off.',
);

console.log('Route geometry viewport server contract checks passed.');
