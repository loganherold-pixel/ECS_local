const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const preview = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
const domain = read(path.join('lib', 'explore', 'trailPacks.ts'));
const liveCatalogPath = path.join('lib', 'explore', 'liveTrailPackCatalog.ts');
const migrationPath = path.join('supabase', 'migrations', '026_live_trail_packs_catalog.sql');

assert(exists(liveCatalogPath), 'Trail Packs should have a live catalog client instead of relying on seeded fixtures');
assert(exists(migrationPath), 'Trail Packs should define a live Supabase catalog table for approved reviewed route data');

const liveCatalog = read(liveCatalogPath);
const migration = read(migrationPath);

assert(
  discover.includes('liveTrailPackCatalogStore') &&
    discover.includes('liveTrailPackCatalogSnapshot.trailPacks') &&
    discover.includes('refreshLiveTrailPackCatalog'),
  'Explore Trail Packs should hydrate from the live Trail Pack catalog store',
);
assert(
  !discover.includes('getDefaultECSTrailPacks'),
  'Explore must not merge default fixture Trail Packs into user-visible Trail Pack content',
);
assert(
  discover.includes('No live reviewed Trail Packs found within this radius.') &&
    discover.includes('Live Trail Packs are not available from the reviewed catalog yet.'),
  'Explore empty/error copy should be truthful when live reviewed Trail Packs are unavailable',
);
assert(
  liveCatalog.includes("from('trail_packs')") &&
    liveCatalog.includes("dataState: 'live'") &&
    liveCatalog.includes('normalizeLiveTrailPackRecord') &&
    !liveCatalog.includes('getDefaultECSTrailPacks'),
  'Live Trail Pack catalog should normalize Supabase rows as live data and avoid fixture fallback',
);
assert(
  domain.includes("dataState?: ECSTrailPackDataState") &&
    domain.includes("dataState: 'fixture'") &&
    domain.includes('getDefaultECSTrailPacks'),
  'Default Trail Pack seed data should remain explicit fixture data, not live catalog content',
);
assert(
  preview.includes('MapRenderer') &&
    preview.includes('DEFAULT_MAP_STYLE') &&
    preview.includes('getMapboxToken') &&
    preview.includes('surfaceMode="compact"') &&
    preview.includes('cameraMode="route_overview"') &&
    preview.includes('interactive={false}') &&
    !preview.includes('function RouteSegment') &&
    !preview.includes('projectGeometry('),
  'Trail Pack preview should render an actual Mapbox route snapshot surface, not the old diamond line diagram',
);
assert(
  migration.includes('create table if not exists public.trail_packs') &&
    migration.includes('alter table public.trail_packs enable row level security') &&
    migration.includes("review_status = 'approved'") &&
    migration.includes('route_geometry jsonb') &&
    !/insert\s+into\s+public\.trail_packs/i.test(migration),
  'Trail Pack live schema should expose approved reviewed rows without inserting mock/demo content',
);

console.log('Explore Trail Pack live catalog and route snapshot checks passed');
