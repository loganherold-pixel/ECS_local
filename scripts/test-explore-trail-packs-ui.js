const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const card = read(path.join('components', 'discover', 'TrailPackCard.tsx'));
const feedbackPanel = read(path.join('components', 'trailPacks', 'TrailPackFeedbackPanel.tsx'));
const previewPanel = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
const offlinePrepPack = read(path.join('app', 'explore-offline-prep-pack.tsx'));
const domain = read(path.join('lib', 'explore', 'trailPacks.ts'));

assert(
  discover.includes('ExploreTripBuilderWizardRouteCard') &&
    discover.includes('testID="explore-tripbuilder-wizard-surface"') &&
    discover.includes('buildExploreGuidanceReadyInventory') &&
    discover.includes('visibleExploreWizardCardCandidates') &&
    !discover.includes('exploreWizardHiddenNotice') &&
    !discover.includes('ECS will not save, stitch, or navigate those routes from Explore'),
  'Explore should render the route-first TripBuilder wizard using normalized guidance-ready candidates without user-facing hidden unavailable route warnings',
);
assert(
  discover.includes('EXPLORE_WIZARD_SOURCE_FILTERS') &&
    discover.includes("label: 'Trail Packs'") &&
    discover.includes("label: 'Hidden Gems'") &&
    discover.includes("label: 'ECS Ideas'") &&
    discover.includes("label: 'Saved/Built'") &&
    discover.includes("label: 'Imported/Stitched'"),
  'Explore TripBuilder wizard should expose source chips for Trail Packs, Hidden Gems, ECS Ideas, Saved/Built, and Imported/Stitched routes',
);
assert(
  discover.includes('saveExploreRouteForPlanning(candidate)') &&
    discover.includes('handleStartExploreWizardCandidate') &&
    discover.includes('autoStartNavigation: true') &&
    discover.includes('handleBuildTripFromExploreWizardCandidate'),
  'Explore TripBuilder route cards should wire Save, Start, and Build Trip through the existing planning/navigation flows',
);
assert(
  discover.includes("import TrailPackCard from '../../components/discover/TrailPackCard'"),
  'Explore should render Trail Packs through the dedicated card component',
);
assert(
  discover.includes("'trailPacks'"),
  'Explore category panel keys should include Trail Packs',
);
assert(
  discover.includes("label: 'Trail Packs'") && discover.includes("description: 'ECS-native route packs"),
  'Trail Packs should appear as a dedicated Explore category tile',
);
assert(
  discover.includes('case \'trailPacks\'') && discover.includes('<TrailPackCard'),
  'Trail Packs should render in their own category panel',
);
assert(
  discover.includes('queryTrailPackDiscoveryIndexCached(routeDiscoveryIndex') &&
    discover.includes('const trailPackDiscoveryRadius = activeDistanceRadius;') &&
    discover.includes('radiusMiles: trailPackDiscoveryRadius'),
  'Trail Packs should use the selected Explore radius',
);
assert(
  discover.includes('liveTrailPackCatalogStore') &&
    discover.includes('liveTrailPackCatalogSnapshot.trailPacks') &&
    discover.includes('routeCatalogSearchCriteria') &&
    discover.includes('refreshLiveTrailPackCatalog(routeCatalogSearchCriteria)') &&
    !discover.includes('routeCatalogRefinementCriteria') &&
    discover.includes('applyExploreRefinementFilter(publicDiscoverableTrailPackRoutes, exploreRefinement)') &&
    discover.includes('availableFuelRangeMiles: vehicleProfile?.fuel_range_miles') &&
    discover.includes('availableWaterCapacityGallons: vehicleProfile?.water_capacity_gal') &&
    !discover.includes('getDefaultECSTrailPacks'),
  'Explore Trail Packs should use live reviewed catalog content with broad radius search criteria, then apply refinement locally for fast chip changes',
);
assert(
  discover.includes('const explorePerformanceRunRef = useRef(explorePerformanceRun);') &&
    discover.includes('explorePerformanceRunRef.current = explorePerformanceRun;') &&
    discover.includes('const routeCatalogPerformanceRun = explorePerformanceRunRef.current;') &&
    discover.includes("recordExplorePerformancePhase(routeCatalogPerformanceRun, 'route_catalog_query'") &&
    discover.includes('recordExplorePerformanceCount(routeCatalogPerformanceRun, {') &&
    !discover.includes('}, [explorePerformanceRun, routeCatalogHasSearchArea, routeCatalogSearchCriteria]);'),
  'Changing Explore refinement buckets should not retrigger the live route catalog refresh or erase the loaded radius catalog.',
);
assert(
  discover.includes('DEFAULT_USER_LOCATION') &&
    discover.includes('useThrottledGPS') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes("'search_area_required'"),
  'Explore should retain the default-location fallback for legacy discovery while requiring GPS or an internal search area for source-backed recommendations',
);
assert(
  discover.includes('setTrailPackPageIndex(0);') &&
    discover.includes('trailPackFeedbackReviewStates') &&
    discover.includes('reviewStatesByTrailPackId: trailPackFeedbackReviewStates'),
  'Radius or location changes should refresh Trail Pack results and pagination',
);
assert(
  discover.includes('trailPackToExpeditionOpportunity') && discover.includes('handleStartTrailPackGuidance'),
  'Approved Trail Packs should stage into the existing Navigate handoff path',
);
assert(
  discover.includes('trailPackToOfflinePrepCatalogInput') &&
    discover.includes('handleCacheTrailPackOffline') &&
    discover.includes("saveOfflinePrepPackHandoff(offlinePrepInput, 'route_details')") &&
    discover.includes("pathname: '/explore-offline-prep-pack'"),
  'Trail Pack cache action should persist a route catalog Offline Prep handoff and open the Offline Prep Pack flow',
);
assert(
  previewPanel.includes('disabled={!canStart}') &&
    previewPanel.includes('Route geometry is unavailable for this Trail Pack.'),
  'Trail Pack preview should guard Start Guidance when geometry is missing',
);
assert(
  discover.includes('TrailPackPreviewModal') &&
    discover.includes('submitTrailPackFeedback') &&
    discover.includes("handleTrailPackFeedback(trailPack.id, 'saved')"),
  'Trail Pack detail/save flows should capture structured feedback without cluttering cards',
);
assert(
  previewPanel.includes('TrailPackFeedbackPanel') &&
    previewPanel.includes('MapRenderer') &&
    previewPanel.includes('cameraMode="route_overview"') &&
    previewPanel.includes('surfaceMode="compact"') &&
    previewPanel.includes('Offline cache unavailable for this Trail Pack.'),
  'Trail Pack preview should contain a route map snapshot, feedback controls, and disabled offline cache language',
);
assert(
  discover.includes('Scanning approved ECS Trail Packs within selected radius…') &&
    discover.includes('Trail Packs need GPS or an internal search area to filter verified routes by radius.') &&
    discover.includes('Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results.') &&
    discover.includes('No live reviewed Trail Packs found within this radius.') &&
    discover.includes('Live Trail Packs are not available from reviewed sources yet.'),
  'Trail Packs should render loading, no-location, low-confidence, and empty states',
);
assert(
  discover.includes('This Trail Pack is under ECS review and is not visible to other users.') &&
    discover.includes('trailPackSubmissionStore') &&
    discover.includes('includeOwnDrafts: ownerTrailPackIds.length > 0'),
  'Owner-visible pending Trail Packs should use explicit review warning language',
);
const hiddenGemPanelCase = discover.split("case 'hiddenGems':")[1]?.split("case 'trailPacks':")[0] ?? '';
assert(
  !/trailPack/i.test(hiddenGemPanelCase),
  'Trail Packs should not be mixed into Hidden Gems logic',
);
assert(
  card.includes('ECS confidence') &&
    card.includes('PREVIEW') &&
    card.includes('START') &&
    card.includes('star-outline'),
  'Trail Pack cards should show ECS confidence plus Preview, Start Guidance, and Save actions',
);
assert(
  card.includes('disabled={!canStartGuidance}') &&
    card.includes('Route geometry is unavailable for this Trail Pack.'),
  'Trail Pack card should disable Start Guidance when geometry is missing',
);
assert(
  card.includes('getTrailPackGuidanceReadiness') &&
    card.includes('Active guidance ready') &&
    card.includes('Preview only') &&
    card.includes('guidanceReadiness.description'),
  'Trail Pack cards should surface active-guidance readiness before users tap Navigate',
);
assert(
  previewPanel.includes('getTrailPackGuidanceReadiness') &&
    previewPanel.includes('GUIDANCE STATUS') &&
    previewPanel.includes('ROUTE ASSESSMENT') &&
    previewPanel.includes('CURRENT CONDITION') &&
    previewPanel.includes('WHAT TO WATCH') &&
    previewPanel.includes('RECOMMENDED ACTION') &&
    previewPanel.includes('OFFLINE CACHE') &&
    previewPanel.includes('detailLoading') &&
    previewPanel.includes('detailError') &&
    previewPanel.includes('guidanceReadiness.label') &&
    previewPanel.includes('guidanceReadiness.description'),
  'Trail Pack preview details should expose active-guidance readiness, route assessment, current-condition overlays, offline cache metadata, and preview-only reasons',
);
assert(
  !previewPanel.includes('detailDataUsed') &&
    previewPanel.includes('offlineCache?.sourceTimestamps') &&
    previewPanel.includes('offlineCache?.sourceAttribution') &&
    previewPanel.includes('offlineCache?.freshnessWarnings') &&
    previewPanel.includes('SOURCE TIMESTAMP') &&
    previewPanel.includes('ATTRIBUTION') &&
    previewPanel.includes('FRESHNESS WARNING'),
  'Trail Pack preview offline cache section should visibly expose server-provided source timestamps, attribution, and freshness warnings',
);
assert(
  offlinePrepPack.includes('routeCatalogSourceRows') &&
    offlinePrepPack.includes('routeCatalogAttributionRows') &&
    offlinePrepPack.includes('routeCatalogFreshnessWarnings') &&
    offlinePrepPack.includes('routeCatalogOfflineCache') &&
    offlinePrepPack.includes('routeCatalogCurrentCondition') &&
    offlinePrepPack.includes('Route Catalog Source Check') &&
    offlinePrepPack.includes('CURRENT CONDITION') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-source-check"') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-current-condition"') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-freshness-warning"'),
  'Offline Prep Pack should show route-catalog cacheability, source timestamps, attribution, current-condition posture, and freshness warnings before preparing a pack',
);
assert(
  feedbackPanel.includes('COMPLETED') &&
    feedbackPanel.includes('RECOMMEND') &&
    feedbackPanel.includes('REPORT ISSUE') &&
    feedbackPanel.includes('Blocked route') &&
    feedbackPanel.includes('Private land'),
  'Trail Pack detail feedback should expose compact operational controls and quick issue reasons',
);
assert(
  !feedbackPanel.includes('comment thread') &&
    !feedbackPanel.includes('public comments'),
  'Trail Pack feedback should avoid noisy public social-comment behavior',
);
assert(
  domain.includes("'partner_source'") &&
    domain.includes("dataState: 'fixture'") &&
    domain.includes("reviewStatus: 'draft'") &&
    !/source:\s*'partner_source'[\s\S]{0,220}reviewStatus:\s*'approved'/.test(domain),
  'Partner source and default Trail Pack seeds should remain fixture scaffolding only',
);

console.log('Explore Trail Pack UI checks passed');
