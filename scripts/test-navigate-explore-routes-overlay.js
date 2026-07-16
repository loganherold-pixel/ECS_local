const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const navigatePath = path.join(repoRoot, 'app', '(tabs)', 'navigate.tsx');
const overlayPath = path.join(repoRoot, 'lib', 'navigateExploreRoutesOverlay.ts');
const handoffPath = path.join(repoRoot, 'lib', 'exploreRoutesMapHandoff.ts');
const filterStatePath = path.join(repoRoot, 'lib', 'exploreFilterStateStore.ts');
const discoverPath = path.join(repoRoot, 'app', '(tabs)', 'discover.tsx');
const readyInventoryPath = path.join(repoRoot, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts');
const mapRendererPath = path.join(repoRoot, 'components', 'navigate', 'MapRenderer.tsx');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const overlay = fs.readFileSync(overlayPath, 'utf8');
const handoff = fs.readFileSync(handoffPath, 'utf8');
const filterState = fs.readFileSync(filterStatePath, 'utf8');
const discover = fs.readFileSync(discoverPath, 'utf8');
const readyInventory = fs.readFileSync(readyInventoryPath, 'utf8');
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
  navigate.includes('onSegmentTap={handleMapSegmentTap}') &&
    /const handleMapSegmentTap[\s\S]*?segment\?\.kind === 'explore_route'[\s\S]*?handleExploreRouteSegmentTap\(segment\)/.test(navigate) &&
    navigate.includes('<ExpeditionAnalysisModal') &&
    navigate.includes('selectedExploreRouteOpportunity') &&
    navigate.includes('handleBuildRouteFromExploreOverlay') &&
    navigate.includes('handleBuildTripFromExploreOverlay') &&
    navigate.includes('handlePrepareOfflineFromExploreOverlay'),
  'Navigate must open the shared Expedition Analysis modal when an Explore route line is tapped.',
);
assert(
  navigate.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments, ...routeGeometryOverlaySegments]') ||
    navigate.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments]'),
  'Explore Routes must merge with existing segment overlays without replacing them.',
);
assert(
  navigate.includes("showToast('NO EXPLORE ROUTES WITH MAP GEOMETRY AVAILABLE')"),
  'Navigate must provide a friendly empty state when Explorer routes lack geometry.',
);
assert(
  discover.includes("label: 'Hidden Gems'") &&
    discover.includes("label: 'Trail Packs'") &&
    discover.includes("label: 'ECS Ideas'") &&
    discover.includes("label: 'Favorites'") &&
    !navigate.includes('loaded from Hidden Gems, Popular Trails, and ECS Route Ideas.'),
  'Navigate Explore Routes status copy should match the active Explorer route buckets.',
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
  !discover.includes('Map Active Trails') &&
    !discover.includes('Display on Map'),
  'Explorer should replace the old Map Active Trails / Display on Map container.',
);
assert(
  discover.includes('Guidance Ready Routes') &&
    discover.includes('canonicalExplorePlanningRoutes') &&
    discover.includes('const mapInventory = buildExploreGuidanceReadyInventory') &&
    discover.includes('mapInventory.candidateSet.candidates') &&
    discover.includes('exploreMapPreviewRouteCounts') &&
    discover.includes('Hidden Gems') &&
    discover.includes('Trail Packs') &&
    discover.includes('ECS Ideas') &&
    discover.includes('source-backed route') &&
    discover.includes('with usable geometry match') &&
    discover.includes('confidence') &&
    discover.includes('source and freshness labels remain visible') &&
    !discover.includes("label: 'Popular Trails'") &&
    !discover.includes('popularTrailRoutes: exploreMapPreviewRouteSets.popularTrailRoutes'),
  'Explorer guidance-ready route set should summarize source-backed Hidden Gems, Trail Packs, Favorites, and ECS Ideas without the Popular Trails container.',
);
assert(
  discover.includes('exploreMapPreviewRouteSets') &&
    discover.includes('trailPackRoutes') &&
    discover.includes('favoriteRoutes') &&
    discover.includes('favoritesSnapshot.favorites') &&
    discover.includes('importedStitchedRoutes') &&
    discover.includes('compatibilityResults: compatResults'),
  'Explorer Display on Map should use the current canonical READY universe, including Trail Packs, saved routes, and imported routes.',
);
assert(
  discover.includes('saveExploreRoutesMapHandoff') &&
    discover.includes('clearNavigationHandoffPayload') &&
    discover.includes('stageNavigationFlow') &&
    (
      discover.includes("pushSingleFlight('/navigate')") ||
      discover.includes("router.push('/navigate')")
    ),
  'Explorer route map preview must clear stale route handoffs, stage the filtered route handoff, and switch to Navigate.',
);
assert(
  discover.includes('maxRenderedRoutes: Math.max(EXPLORE_MAP_HANDOFF_MAX_ROUTES, exploreMapPreviewRouteCounts.total)'),
  'Explorer route map preview should include every filtered route in normal sets instead of capping below the filtered total.',
);
assert(
  discover.includes('buildExploreGuidanceReadyInventory({') &&
    readyInventory.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explorer Display on Map must preserve the shared minimum five-mile route filter.',
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
  /const handleBuildRouteFromExploreOverlay[\s\S]*?setExploreRoutesEnabled\(false\);[\s\S]*?setExploreRoutesHandoff\(null\);[\s\S]*?clearExploreRoutesMapHandoff\(\);[\s\S]*?applyExploreNavigationPayload\(payload\);/.test(navigate),
  'Starting a selected Explore map route should remove the multi-route preview before staging that one route.',
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
  mapRenderer.includes('onDispersedRouteLegTap?: (payload: DispersedRouteLegSelectionPayload) => void') &&
    mapRenderer.includes('DISPERSED_ROUTE_BUILD_SOURCE_ID') &&
    mapRenderer.includes('DISPERSED_ROUTE_BUILD_LAYER_ID') &&
    mapRenderer.includes('DISPERSED_ROUTE_BUILD_SELECTED_LAYER_ID') &&
    mapRenderer.includes("send('dispersedRouteLegTap'") &&
    mapRenderer.includes('findDispersedRouteBuildFeatureAtPoint'),
  'MapRenderer must render yellow dispersed route build legs and report their taps before generic map/segment taps.',
);
assert(
  mapRenderer.includes('SET_DISPERSED_ROUTE_BUILD_ENABLED') &&
    mapRenderer.includes('updateDispersedRouteBuildCandidates') &&
    mapRenderer.includes('queryEligibleDispersedCampingRegionsAtPoint') &&
    mapRenderer.includes('isRouteBuilderRouteableFeature(feature)') &&
    mapRenderer.includes('maxDispersedRouteBuildCandidates'),
  'MapRenderer should derive capped routeable yellow build candidates from rendered roads/trails inside eligible dispersed polygons.',
);
assert(
  mapRenderer.includes('if (dispersedRouteBuildState.enabled && findDispersedRouteBuildFeatureAtPoint(point)) return false;'),
  'A simple tap on a yellow dispersed build leg should not accidentally create a freehand Build Route stroke.',
);
assert(
  mapRenderer.includes('function normalizeLngLatCoordinate') &&
    mapRenderer.includes('return [lng, lat]') &&
    mapRenderer.includes('normalizeLngLatLine(seg.coordinates)'),
  'MapRenderer must normalize Explorer latitude/longitude route coordinates into Mapbox LineString coordinates.',
);
assert(
  mapRenderer.includes("ensureExploreRouteHaloLayer") &&
    mapRenderer.includes("EXPLORE_PREVIEW_ROUTE_HALO_LAYER_ID = 'explore-preview-route-halo-layer'") &&
    mapRenderer.includes("EXPLORE_PREVIEW_ROUTE_SOURCE_ID = 'explore-preview-route-source'") &&
    mapRenderer.includes("type: 'line'") &&
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
