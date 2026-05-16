const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const navigatePath = path.join(repoRoot, 'app', '(tabs)', 'navigate.tsx');
const overlayPath = path.join(repoRoot, 'lib', 'navigateExploreRoutesOverlay.ts');
const handoffPath = path.join(repoRoot, 'lib', 'exploreRoutesMapHandoff.ts');
const filterStatePath = path.join(repoRoot, 'lib', 'exploreFilterStateStore.ts');
const discoverPath = path.join(repoRoot, 'app', '(tabs)', 'discover.tsx');
const mapRendererPath = path.join(repoRoot, 'components', 'navigate', 'MapRenderer.tsx');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const overlay = fs.readFileSync(overlayPath, 'utf8');
const handoff = fs.readFileSync(handoffPath, 'utf8');
const filterState = fs.readFileSync(filterStatePath, 'utf8');
const discover = fs.readFileSync(discoverPath, 'utf8');
const mapRenderer = fs.readFileSync(mapRendererPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  navigate.includes("EXPLORE ROUTES'") || navigate.includes('EXPLORE ROUTES'),
  'Navigate Tools must expose an Explore Routes control.',
);
assert(
  navigate.includes('const [exploreRoutesEnabled, setExploreRoutesEnabled] = useState(false)'),
  'Navigate must keep Explore Routes overlay state local to the map screen.',
);
assert(
  navigate.includes('toggleExploreRoutesOverlay'),
  'Navigate must wire the Explore Routes control to a toggle handler.',
);
assert(
  navigate.includes('segments={mapSegmentFeatures}'),
  'MapRenderer must receive merged map segments so Explore Routes can render as line overlays.',
);
assert(
  navigate.includes('onSegmentTap={handleExploreRouteSegmentTap}') &&
    navigate.includes('categoryLabel.toUpperCase()') &&
    navigate.includes("segment.category === 'hidden_gem'") &&
    navigate.includes("segment.category === 'popular_trail'") &&
    navigate.includes("segment.category === 'ecs_route_idea'"),
  'Navigate must identify tapped Explore route lines by route name and category.',
);
assert(
  navigate.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments]'),
  'Explore Routes must merge with existing segment overlays without replacing them.',
);
assert(
  navigate.includes('Explore Routes is on, but the available Explorer results do not include map geometry yet.'),
  'Navigate must provide a friendly empty state when Explorer routes lack geometry.',
);
assert(
  navigate.includes('fitMapToExploreRouteSegments'),
  'Enabling Explore Routes should fit the map to route lines when geometry exists.',
);

assert(
  overlay.includes("hidden_gem") && overlay.includes("popular_trail") && overlay.includes("ecs_route_idea"),
  'Explore route overlay builder must support Hidden Gems, Popular Trails, and ECS Route Ideas.',
);
assert(
  overlay.includes('CATEGORY_LABELS') &&
    overlay.includes('Hidden Gem') &&
    overlay.includes('Popular Trail') &&
    overlay.includes('ECS Route Idea'),
  'Explore route overlay segments must carry readable category labels.',
);
assert(
  overlay.includes("kind: 'explore_route'") && overlay.includes('categoryLabel: CATEGORY_LABELS'),
  'Explore route overlay segments must preserve tap-identifiable route kind and category metadata.',
);
assert(
  overlay.includes('getHiddenGemRecommendations') &&
    overlay.includes('getPopularTrailRecommendations') &&
    overlay.includes('aiRoutes'),
  'Explore route overlay builder must source Explorer route categories.',
);
assert(
  overlay.includes('buildExploreNavigationPayload'),
  'Explore route overlay builder must reuse the Explorer navigation payload geometry resolver.',
);
assert(
  overlay.includes('buildExploreRouteOverlaySegmentsFromRoutes'),
  'Explore route overlay builder must support explicit filtered route handoffs from Explorer.',
);
assert(
  overlay.includes('coordinates.length < 2') && overlay.includes('return null'),
  'Explore route overlay builder must skip routes without safe line geometry.',
);
assert(
  overlay.includes('seen.has(identity)'),
  'Explore route overlay builder must dedupe routes before rendering map lines.',
);
assert(
  overlay.includes('cappedCount'),
  'Explore route overlay builder must cap large result sets safely.',
);

assert(
  handoff.includes('saveExploreRoutesMapHandoff') && handoff.includes('consumeExploreRoutesMapHandoff'),
  'Explorer-to-Navigate map handoff must be persisted and consumable by Navigate.',
);
assert(
  discover.includes('Display on Map'),
  'Explorer must expose a Display on Map action near the result controls.',
);
assert(
  discover.includes('saveExploreRoutesMapHandoff') &&
    discover.includes('clearNavigationHandoffPayload') &&
    discover.includes('stageNavigationFlow') &&
    discover.includes("router.push('/navigate')"),
  'Explorer Display on Map must clear stale route handoffs, stage the filtered route handoff, and switch to Navigate.',
);
assert(
  discover.includes('routePassesExploreMapLength') &&
    discover.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explorer Display on Map must preserve the minimum five-mile route filter.',
);
assert(
  navigate.includes('consumeExploreRoutesMapHandoff') &&
    navigate.includes('setExploreRoutesEnabled(true)') &&
    navigate.includes('setExploreRoutesHandoff(handoff)'),
  'Navigate must consume Explorer filtered-route handoffs and enable Explore Routes automatically.',
);
assert(
  navigate.includes('clearExploreRoutesMapHandoff') &&
    navigate.includes('setExploreRoutesHandoff(null)') &&
    navigate.includes('EXPLORE ROUTES OFF'),
  'Navigate must clear temporary Explorer route handoff data when the Explore Routes layer is hidden.',
);
assert(
  navigate.includes('roadNavigationActive || trailNavigationActive || pendingHybridTrailTransition') &&
    navigate.includes('fitMapToExploreRouteSegments(exploreRouteOverlaySegments)'),
  'Explore route overlay camera fitting must not override active guidance map state.',
);
assert(
  discover.includes('getExploreFilterStateSnapshot') &&
    discover.includes('loadExploreFilterStateSnapshot') &&
    discover.includes('saveExploreFilterStateSnapshot') &&
    discover.includes('initialExploreFilterStateRef'),
  'Explorer must preserve radius/refinement/category filter state across Display on Map navigation.',
);
assert(
  discover.includes('resultSetSummary') &&
    discover.includes('displayedRouteCount: exploreMapHandoffBuild.segments.length'),
  'Explorer must preserve a lightweight filtered result summary without relying on large geometry for filter restore.',
);
assert(
  filterState.includes('ExploreFilterStateSnapshot') &&
    filterState.includes('radiusMiles') &&
    filterState.includes('refinement') &&
    filterState.includes('activeCategoryPanel') &&
    filterState.includes('resultSetSummary') &&
    !filterState.includes('segments:'),
  'Explorer filter state store must preserve filter context without storing route geometry.',
);
assert(
  mapRenderer.includes('onSegmentTap?: (segment: SegmentSelectionPayload) => void') &&
    mapRenderer.includes("send('segmentTap'") &&
    mapRenderer.includes("props.kind === 'explore_route'") &&
    mapRenderer.includes("map.queryRenderedFeatures(e.point, { layers: ['segment-layer'] })") &&
    mapRenderer.includes('categoryLabel: seg.categoryLabel || null'),
  'MapRenderer must preserve Explore route category metadata and report tapped Explore route lines.',
);

console.log('Navigate Explore Routes overlay regression checks passed.');
