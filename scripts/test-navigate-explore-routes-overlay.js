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
  !navigate.includes('accessibilityLabel="Explore Routes map overlay"') &&
    !navigate.includes("{exploreRoutesEnabled ? 'EXPLORE ROUTES ON' : 'EXPLORE ROUTES'}"),
  'Navigate Tools should not expose a manual Explore Routes button.',
);
assert(
  navigate.includes('const [exploreRoutesEnabled, setExploreRoutesEnabled] = useState(false)'),
  'Navigate must keep Explore Routes overlay state local to the map screen.',
);
assert(
  navigate.includes('toggleExploreRoutesOverlay'),
  'Navigate must keep the Explore Routes toggle handler for map-level clearing and handoff cleanup.',
);
assert(
  navigate.includes('segments={mapSegmentFeatures}'),
  'MapRenderer must receive merged map segments so Explore Routes can render as line overlays.',
);
assert(
  navigate.includes('onSegmentTap={handleExploreRouteSegmentTap}') &&
    navigate.includes('<ExpeditionAnalysisModal') &&
    navigate.includes('selectedExploreRouteOpportunity') &&
    navigate.includes('handleBuildRouteFromExploreOverlay') &&
    navigate.includes('handleBuildTripFromExploreOverlay') &&
    navigate.includes('handlePrepareOfflineFromExploreOverlay'),
  'Navigate must open the shared Expedition Analysis modal when an Explore route line is tapped.',
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
  overlay.includes("hidden_gem") &&
    overlay.includes("popular_trail") &&
    overlay.includes("trail_pack") &&
    overlay.includes("favorite") &&
    overlay.includes("ecs_route_idea"),
  'Explore route overlay builder must support Hidden Gems, Popular Trails, Trail Packs, Favorites, and ECS Route Ideas.',
);
assert(
  overlay.includes('CATEGORY_LABELS') &&
    overlay.includes('Hidden Gem') &&
    overlay.includes('Popular Trail') &&
    overlay.includes('Trail Pack') &&
    overlay.includes('Favorite') &&
    overlay.includes('ECS Route Idea'),
  'Explore route overlay segments must carry readable category labels.',
);
assert(
  overlay.includes("hidden_gem: '#F2C24D'") &&
    overlay.includes("popular_trail: '#66BB6A'") &&
    overlay.includes("ecs_route_idea: '#65D4FF'"),
  'Mapped active Explorer trails should use category colors: Hidden Gems yellow, Popular Trails green, and ECS Route Ideas blue.',
);
assert(
  overlay.includes("kind: 'explore_route'") &&
    overlay.includes('categoryLabel: CATEGORY_LABELS') &&
    overlay.includes('route: candidate.route') &&
    overlay.includes('compatResult: candidate.compatResult'),
  'Explore route overlay segments must preserve tap-identifiable route, category, and compatibility metadata.',
);
assert(
  overlay.includes('getHiddenGemRecommendations') &&
    overlay.includes('getPopularTrailRecommendations') &&
    overlay.includes('aiRoutes'),
  'Explore route overlay builder must source Explorer route categories.',
);
assert(
  overlay.includes('buildExploreNavigationPayload') &&
    overlay.includes('getExploreRoutePreviewRoutePoints(payload)'),
  'Explore route overlay builder must reuse the Explorer preview resolver so endpoint-backed routes render too.',
);
assert(
  overlay.includes('buildExploreRouteOverlaySegmentsFromRoutes'),
  'Explore route overlay builder must support explicit filtered route handoffs from Explorer.',
);
assert(
  overlay.includes('coordinates.length < 2') && overlay.includes('return null'),
  'Explore route overlay builder must skip routes without enough safe preview coordinates for a line.',
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
  discover.includes('Map Active Trails') &&
    discover.includes('filtered trail line') &&
    discover.includes('Suggested Routes') &&
    discover.includes('Open Matching Explorer.'),
  'Explorer map handoff copy should use the production Map Active Trails labels.',
);
assert(
  discover.includes('exploreSuggestedRouteOptions') &&
    discover.includes('trailPackRoutes') &&
    discover.includes('favoriteRoutes') &&
    discover.includes('favoritesSnapshot.favorites') &&
    discover.includes('compatibilityResults: compatResults'),
  'Explorer Display on Map should use the current filtered Suggested Routes universe, including Trail Packs and Favorites.',
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
    !navigate.includes("showToast('EXPLORE ROUTES OFF')") &&
    !navigate.includes('`EXPLORE ROUTES ON:'),
  'Navigate must clear temporary Explorer route handoff data when the Explore Routes layer is hidden without showing legacy on/off banners.',
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
assert(
  mapRenderer.includes('function normalizeLngLatCoordinate') &&
    mapRenderer.includes('return [lng, lat]') &&
    mapRenderer.includes('normalizeLngLatLine(seg.coordinates)'),
  'MapRenderer must normalize Explorer latitude/longitude route coordinates into Mapbox LineString coordinates.',
);
assert(
  mapRenderer.includes("ensureExploreRouteHaloLayer") &&
    mapRenderer.includes("'explore-route-halo-layer'") &&
    mapRenderer.includes("['==', ['get', 'kind'], 'explore_route']") &&
    mapRenderer.includes('applySegmentLineStyle'),
  'Mapped Explorer trails must render as category-colored route lines with a dedicated halo, not point/diamond markers.',
);
assert(
  !mapRenderer.includes("} catch (e) {}\n        }\n      }\n\n      function ensureCircleLayer"),
  'MapRenderer WebView script must not close applySegmentLineStyle with an extra brace before ensureCircleLayer.',
);
assert(
  navigate.includes('CLEAR EXPLORE ROUTES') &&
    navigate.includes('styles.exploreRoutesClearControl') &&
    navigate.includes('accessibilityLabel="Clear mapped Explorer trails"'),
  'Navigate must expose a map-level clear control for mapped Explorer trails.',
);

console.log('Navigate Explore Routes overlay regression checks passed.');
