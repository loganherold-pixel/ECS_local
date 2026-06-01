const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(
  packageJson.includes('"test:route-catalog-env-loader"'),
  'package.json should expose the route catalog env-loader test',
);

const helperPath = path.join(root, 'scripts', 'route-catalog-env.js');
assert(fs.existsSync(helperPath), 'Route catalog env helper should exist');

const { loadRouteCatalogEnv } = require(helperPath);
assert.strictEqual(typeof loadRouteCatalogEnv, 'function', 'Route catalog env helper should export loadRouteCatalogEnv');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-route-catalog-env-'));
fs.writeFileSync(
  path.join(tempRoot, '.env'),
  [
    'EXPO_PUBLIC_SUPABASE_URL=https://from-env-file.example',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY="anon-from-env-file"',
    'ECS_ROUTE_CATALOG_SYNC_TOKEN=sync-token-from-env-file',
    'SUPABASE_SERVICE_ROLE_KEY=must-not-load',
    'UNRELATED_SECRET=must-not-load',
  ].join('\n'),
);
fs.writeFileSync(
  path.join(tempRoot, '.env.local'),
  [
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=anon-from-env-local',
    'ECS_SUPABASE_URL=https://from-env-local.example',
  ].join('\n'),
);

const env = {
  ECS_SUPABASE_URL: 'https://already-present.example',
};
const result = loadRouteCatalogEnv({ root: tempRoot, env });

assert.deepStrictEqual(
  result.filesRead.map((filePath) => path.basename(filePath)),
  ['.env', '.env.local'],
  'Route catalog env helper should read .env before .env.local without overriding existing env',
);
assert.strictEqual(env.ECS_SUPABASE_URL, 'https://already-present.example');
assert.strictEqual(env.EXPO_PUBLIC_SUPABASE_URL, 'https://from-env-file.example');
assert.strictEqual(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'anon-from-env-file');
assert.strictEqual(env.ECS_ROUTE_CATALOG_SYNC_TOKEN, 'sync-token-from-env-file');
assert.strictEqual(env.SUPABASE_SERVICE_ROLE_KEY, undefined, 'Route catalog env helper must not load service-role secrets');
assert.strictEqual(env.UNRELATED_SECRET, undefined, 'Route catalog env helper must not load unrelated secrets');
assert(
  result.loadedKeys.includes('EXPO_PUBLIC_SUPABASE_URL') &&
    result.loadedKeys.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY') &&
    result.loadedKeys.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !result.loadedKeys.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Route catalog env helper should report only loaded allowlisted keys',
);

const auditScript = fs.readFileSync(path.join(root, 'scripts', 'route-catalog-coverage-audit.js'), 'utf8');
const syncScript = fs.readFileSync(path.join(root, 'scripts', 'route-catalog-sync-invoke.js'), 'utf8');
assert(auditScript.includes('loadRouteCatalogEnv'), 'Coverage audit script should load route catalog .env keys automatically');
assert(syncScript.includes('loadRouteCatalogEnv'), 'Sync invocation script should load route catalog .env keys automatically');

console.log('Route catalog env loader checks passed');
