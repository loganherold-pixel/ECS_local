const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const docPath = 'docs/integrations/established-campgrounds-provider-sync.md';
const doc = read(docPath);
const migration = read('supabase/migrations/020_established_campgrounds_provider_layer.sql');

const functionNames = [
  'campgrounds-sync-ridb',
  'campgrounds-sync-nps',
  'campgrounds-sync-campflare',
  'campgrounds-sync-active',
  'campgrounds-sync-reserveamerica',
  'campgrounds-sync-aspira',
  'campgrounds-sync-osm',
  'campgrounds-dedupe',
];

for (const functionName of functionNames) {
  assert.ok(doc.includes(functionName), `${docPath} should document ${functionName}.`);
  assert.ok(
    fs.existsSync(path.join(root, 'supabase', 'functions', functionName, 'index.ts')),
    `${functionName} Edge Function should exist.`,
  );
}

[
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_ATTRIBUTION',
  'ECS_SERVICE_ROLE_KEY',
].forEach((secretRef) => {
  assert.ok(doc.includes(secretRef), `${docPath} should list required secret ref ${secretRef}.`);
});

[
  'campground_provider_configs.sync_interval_minutes',
  'campground_sync_runs',
  'campground_availability.expires_at',
  'degrade to `unknown`',
  'OSM regional bbox only',
  'Never run an unbounded national/global OSM sync',
  'Provider Config Rows',
  'Production Scheduling Options',
  'Manual Sync Invocation',
  'Local Development With Mock Fixtures',
  'Troubleshooting Missing Campgrounds',
  'Attribution Requirements',
  'Known Limitations',
].forEach((token) => {
  assert.ok(doc.includes(token), `${docPath} missing scheduling/runbook token: ${token}`);
});

[
  "('ridb'",
  "('nps'",
  "('campflare'",
  "('active'",
  "('reserveamerica'",
  "('aspira'",
  "('osm'",
  'sync_interval_minutes',
  'cache_ttl_seconds',
  'secret_ref',
].forEach((token) => {
  assert.ok(migration.includes(token), `Provider config migration missing token: ${token}`);
});

const osmFunction = read('supabase/functions/campgrounds-sync-osm/index.ts');
assert.ok(
  osmFunction.includes('validateOsmBbox') &&
    osmFunction.includes('minLat') &&
    osmFunction.includes('maxLng'),
  'OSM sync should require explicit bbox inputs.',
);

const campflareFunction = read('supabase/functions/campgrounds-sync-campflare/index.ts');
const campflareAdapter = read('supabase/functions/campgrounds-sync-campflare/campflareAdapter.ts');
assert.ok(
  campflareFunction.includes('ttlSeconds') &&
    campflareAdapter.includes('expires_at') &&
    campflareAdapter.includes('expiresAt'),
  'Campflare sync should support TTL-backed availability expiry.',
);

function assertDocDoesNotContainSecretValuePatterns(source) {
  const suspiciousPatterns = [
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
    /sk_(?:live|test)_[a-zA-Z0-9]{12,}/i,
    /Bearer\s+[a-zA-Z0-9._~+/=-]{20,}/,
    /apikey\s*[:=]\s*["']?[a-zA-Z0-9._~+/=-]{20,}/i,
  ];
  for (const pattern of suspiciousPatterns) {
    assert.ok(!pattern.test(source), `${docPath} appears to include a secret-like value: ${pattern}`);
  }
}

assertDocDoesNotContainSecretValuePatterns(doc);

console.log('Established Campgrounds scheduling/runbook checks passed.');
