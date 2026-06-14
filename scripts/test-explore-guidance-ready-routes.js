const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const catalogPath = path.join(root, 'lib', 'explore', 'routeCatalog.ts');

const discover = fs.readFileSync(discoverPath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');

assert(
  discover.includes('Guidance Ready Routes') &&
    discover.includes('guidanceReadyRouteOptions') &&
    discover.includes('routePassesExploreMapLength') &&
    discover.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explore should expose a Guidance Ready route set while preserving the 5+ mile minimum.',
);
assert(
  discover.includes('hasGuidanceReadyGeometry') &&
    discover.includes('activeGuidance') &&
    discover.includes('routeGeometryMode'),
  'Explore guidance-ready filtering should require usable stitched/full route geometry metadata.',
);
assert(
  discover.includes('source-backed') &&
    discover.includes('confidence') &&
    discover.includes('data state'),
  'Explore guidance-ready copy should keep source, confidence, and data-state visibility.',
);
assert(
  catalog.includes("activeGuidance?: ECSTrailPackActiveGuidance") &&
    catalog.includes("routeGeometryMode?: 'full' | 'preview_simplified' | 'omitted'"),
  'Route catalog types should expose active guidance and route geometry mode for guidance-ready filtering.',
);

console.log('Explore guidance-ready routes checks passed.');
