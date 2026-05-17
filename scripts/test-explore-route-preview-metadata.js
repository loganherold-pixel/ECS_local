/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const discoverSource = fs.readFileSync(path.join(root, 'lib', 'discoverEngine.ts'), 'utf8');
const trailPackSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'trailPacks.ts'), 'utf8');
const previewNormalizerSource = fs.readFileSync(path.join(root, 'lib', 'exploreRoutePreview.ts'), 'utf8');
const previewModalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  'utf8',
);
const handoffSource = fs.readFileSync(path.join(root, 'lib', 'navigationHandoffStore.ts'), 'utf8');

function extractBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `Missing ${startToken}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `Missing ${endToken}`);
  return source.slice(start, end);
}

function unique(values) {
  return new Set(values);
}

const seedBlock = extractBlock(
  discoverSource,
  'const SEED_OPPORTUNITIES: ExpeditionOpportunity[] = [',
  '// ── Compute Distance From User',
);
const seedIds = [...seedBlock.matchAll(/\bid:\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
assert.ok(seedIds.length > 0, 'Explore seed routes should be discoverable for audit.');
assert.strictEqual(unique(seedIds).size, seedIds.length, 'Explore seed route IDs must be stable and unique.');
assert.strictEqual(
  (seedBlock.match(/\bstartLat:/g) ?? []).length,
  seedIds.length,
  'Every seed route should have a trailhead latitude.',
);
assert.strictEqual(
  (seedBlock.match(/\bstartLng:/g) ?? []).length,
  seedIds.length,
  'Every seed route should have a trailhead longitude.',
);

assert.ok(
  discoverSource.includes('export function normalizeExploreOpportunityRoute') &&
    discoverSource.includes('previewMetadataStatus') &&
    discoverSource.includes('routePreviewUnavailableReason') &&
    discoverSource.includes('normalizeExploreOpportunityRoutes([...SEED_OPPORTUNITIES])'),
  'Explore seed routes should be normalized at read time with explicit preview metadata state.',
);

const trailPackBlock = extractBlock(
  trailPackSource,
  'const DEFAULT_ECS_TRAIL_PACKS: ECSTrailPack[] = [',
  '];',
);
const trailPackIds = [...trailPackBlock.matchAll(/\bid:\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
assert.ok(trailPackIds.length > 0, 'Trail Pack routes should be included in Explore route metadata audit.');
assert.strictEqual(unique(trailPackIds).size, trailPackIds.length, 'Trail Pack route IDs must be stable and unique.');
assert.strictEqual(
  (trailPackBlock.match(/\bcenterCoordinate:/g) ?? []).length,
  trailPackIds.length,
  'Every Trail Pack should have a center coordinate fallback.',
);

assert.ok(
  trailPackSource.includes('routeGeometry: pack.routeGeometry') &&
    trailPackSource.includes('routeMetadata:') &&
    trailPackSource.includes("source: 'trail_pack'"),
  'Trail Pack Explore records should preserve geometry and label/source metadata.',
);

assert.ok(
  handoffSource.includes('function extractFinalCoordinate') &&
    handoffSource.includes('destinationCoordinate') &&
    handoffSource.includes('endpointCoordinate') &&
    handoffSource.includes('trailGeometry.length > 0 ? trailGeometry[trailGeometry.length - 1] : null'),
  'Navigation handoff should accept explicit endpoint/destination metadata and prefer geometry endpoints.',
);

assert.ok(
  previewNormalizerSource.includes('payload.trailWaypoints') &&
    previewNormalizerSource.includes('routePoints.length >= 2') &&
    previewNormalizerSource.includes('previewUnavailableReason') &&
    previewNormalizerSource.includes('Route preview unavailable for this route until endpoint or route geometry is added.') &&
    previewNormalizerSource.includes('computeBounds') &&
    previewNormalizerSource.includes("mode: 'route_overview'"),
  'Route preview normalizer should use geometry, waypoints, endpoints, bounds, and clear unavailable state.',
);

assert.ok(
  previewModalSource.includes('previewModel.hasRouteData ?') &&
    previewModalSource.includes('Route geometry unavailable') &&
    previewModalSource.includes('Build Route will use the best existing route handoff data') &&
    previewModalSource.includes('MapRenderer'),
  'Route preview modal should render either MapRenderer preview or a clear unavailable state without crashing.',
);

console.log(`Explore route preview metadata audit passed for ${seedIds.length} seed routes and ${trailPackIds.length} Trail Packs.`);
