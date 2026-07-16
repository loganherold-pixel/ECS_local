const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const trailPacks = read(path.join('lib', 'explore', 'trailPacks.ts'));

assert(
  trailPacks.includes('export function isPublicSuggestedTrailheadTrailPack') &&
    trailPacks.includes('export function isPublicSuggestedTrailheadRoute') &&
    trailPacks.includes("dataState === 'fixture'") &&
    trailPacks.includes("geometrySource === 'ecs_demo_full_route_fixture'") &&
    trailPacks.includes("metadataString(metadata, 'source') !== 'trail_pack'"),
  'Trail Pack domain should expose a shared production guard that rejects fixture/demo/non-catalog routes from public Suggested Trailheads.',
);

assert(
  discover.includes('isPublicSuggestedTrailheadTrailPack') &&
    discover.includes('isPublicSuggestedTrailheadRoute') &&
    discover.includes('guardGuidanceReadyRouteHandoff') &&
    discover.includes('defaultExploreReadyRouteEligibility(route)') &&
    !discover.includes('guardPublicSuggestedTrailheadHandoff') &&
    discover.includes('.filter(isPublicSuggestedTrailheadTrailPack)') &&
    discover.includes('.filter(isPublicSuggestedTrailheadRoute)'),
  'Explore should keep the Trail-Pack-only public discovery guard while all canonical READY source lanes use the shared safety/readiness handoff guard.',
);

assert(
    discover.includes('const publicRefinedAIRoutes') &&
    discover.includes('const canonicalExplorePlanningRoutes') &&
    discover.includes('const mapInventory = buildExploreGuidanceReadyInventory') &&
    discover.includes('suggested_routes: canonicalExplorePlanningRoutes.length') &&
    discover.includes('saveExplorePlanningRouteContext({') &&
    discover.includes('routes: canonicalExplorePlanningRoutes as any'),
  'Suggested Trailheads planning context and badges should count only production-safe source-backed routes.',
);

console.log('Explore Suggested Trailheads production guard checks passed');
