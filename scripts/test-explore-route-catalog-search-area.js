/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const liveCatalog = read(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'));

assert(
  discover.includes('ROUTE_CATALOG_PRESET_SEARCH_AREAS') &&
    discover.includes('ROUTE_CATALOG_COVERAGE_AREAS') &&
    discover.includes('useState<RouteCatalogPresetSearchAreaKey | null>(null)') &&
    discover.includes("useState<'none' | 'gps' | 'preset'>('gps')") &&
    discover.includes('setRouteCatalogSearchAreaKey') &&
    discover.includes('setRouteCatalogLocationSelection') &&
    !discover.includes('buildManualRouteCatalogSearchArea') &&
    !discover.includes('routeCatalogManualSearchArea'),
  'Explore should expose approved preset areas and GPS without accepting unreviewed manual coordinates.',
);

assert(
    discover.includes('routeCatalogEffectiveSearchArea') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes("if (routeCatalogLocationSelection === 'preset') return routeCatalogSelectedSearchArea") &&
    discover.includes("if (routeCatalogLocationSelection !== 'gps' || !hasGPSFix) return null") &&
    discover.includes('routeCatalogSearchCoordinate') &&
    discover.includes('routeCatalogEffectiveSearchArea.latitude') &&
    discover.includes('routeCatalogEffectiveSearchArea.longitude') &&
    discover.includes('radiusMiles: activeDistanceRadius') &&
    discover.includes("locationSource: routeCatalogEffectiveSearchArea?.source ?? 'search_area_required'"),
  'Route catalog criteria should use an explicitly approved area or live GPS, never the default fallback coordinate.',
);

assert(
    discover.includes('if (!routeCatalogHasSearchArea) {') &&
    discover.includes('setLiveTrailPackCatalogDisabled({') &&
    discover.includes('refreshLiveTrailPackCatalog(routeCatalogSearchCriteria, {') &&
    discover.includes("cancellationReason: 'unmount'") &&
    discover.includes('routeCatalogHasSearchArea && suggestedRoutesFeatureEnabled') &&
    discover.includes('? discoverableTrailPacks.filter(isPublicSuggestedTrailheadTrailPack)') &&
    discover.includes('Trail Packs need GPS or an approved search area to filter verified routes by radius.'),
  'Suggested Trailheads should terminate disabled without an eligible GPS or approved-area search input.',
);

assert(
  (discover.match(/error\.name === 'AbortError'/g) ?? []).length >= 2 &&
    discover.includes("signature: 'explore_route_catalog_refresh_rejected'") &&
    discover.includes("signature: 'explore_route_catalog_retry_rejected'") &&
    discover.includes("safeErrorCode: 'EXPLORE_ROUTE_CATALOG_REFRESH_REJECTED'") &&
    discover.includes("safeErrorCode: 'EXPLORE_ROUTE_CATALOG_RETRY_REJECTED'") &&
    discover.includes('.finally(() => {'),
  'Mounted automatic and manual route-catalog requests should consume expected cancellation rejections and safely diagnose unexpected promise rejection.',
);

assert(
  discover.includes('testID="explore-route-search-area-control"') &&
    discover.includes('testID="explore-route-search-area-picker"') &&
    discover.includes('ROUTE SEARCH AREA') &&
    discover.includes('CHOOSE ROUTE SEARCH AREA') &&
    discover.includes('APPROVED SEARCH AREAS') &&
    discover.includes('routeCatalogSearchAreaPickerVisible ? ROUTE_CATALOG_PRESET_SEARCH_AREAS.map') &&
    discover.includes('Choose GPS or an approved area before ECS requests approved route summaries.') &&
    discover.includes('Approved route summaries will be evaluated inside') &&
    discover.includes('Loading Trail Source') &&
    discover.includes('Trail Source Unavailable') &&
    discover.includes('Live Route Catalog Unavailable') &&
    discover.includes('This provider failure is not an empty search result.') &&
    discover.includes('routeCatalogEffectiveSearchArea') &&
    discover.includes('routeCatalogHasSearchArea'),
  'Explore should make the truthful GPS/approved-area choice actionable on the mounted surface.',
);

assert(
  discover.includes('const prepareExploreGuidanceRoutes = useCallback(') &&
    discover.includes('routeCatalogEffectiveSearchArea.latitude') &&
    discover.includes('routeCatalogEffectiveSearchArea.longitude') &&
    discover.includes("const distanceSource = routeCatalogLocationSelection === 'gps' ? 'live_gps' : 'unknown'") &&
    discover.includes("routeCatalogLocationSelection === 'preset'") &&
    discover.includes('Distance from approved search area:') &&
    discover.includes('withinRadius') &&
    !discover.includes('computeDistancesFromUser(exploreWizardLocalRouteAssets.savedBuiltRoutes, userLat, userLng)') &&
    !discover.includes('computeDistancesFromUser(exploreWizardLocalRouteAssets.importedStitchedRoutes, userLat, userLng)'),
  'Guidance-ready saved, imported, favorite, and hidden-gem inputs should use the same approved preset coordinate or an actual GPS fix, never the legacy default coordinate.',
);

assert(
  discover.includes("reason: 'feature_disabled'") &&
    discover.includes("safeErrorCode: 'EXPLORE_SUGGESTED_ROUTES_DISABLED'") &&
    discover.includes('if (!suggestedRoutesFeatureEnabled) {') &&
    discover.includes('testID="explore-suggested-routes-disabled"') &&
    discover.includes('No route provider request was issued.'),
  'The canonical Suggested Routes rollout state should suppress provider work and render an explicit disabled state.',
);

assert(
    discover.includes('const routeCatalogProviderValidEmpty =') &&
    discover.includes('const routeCatalogValidEmpty =') &&
    discover.includes('routeCatalogProviderValidEmpty && exploreGuidanceEvaluatedCount === 0') &&
    discover.includes('const routeCatalogEmptyWithoutGuidance =') &&
    discover.includes('routeCatalogValidEmpty && exploreGuidanceEvaluatedCount === 0') &&
    discover.includes('testID="explore-route-catalog-empty-state"') &&
    discover.includes('testID="explore-guidance-ready-provider-empty-with-exclusions"') &&
    discover.includes('No Routes in This Area') &&
    discover.includes("? 'EMPTY'") &&
    !discover.includes('const showTrailPackSectionLoading =\n    showSectionLoading ||') &&
    discover.includes('routeCatalogCancelledWithData') &&
    discover.includes("? 'CANCELLED'") &&
    discover.includes('testID="explore-guidance-ready-cancelled-notice"'),
  'Valid empty and cancelled-with-data catalog results should render explicit terminal states without falling through to READY or an indefinite spinner.',
);

assert(
  discover.includes('deriveExploreGuidanceProviderAvailability({') &&
    discover.includes('providerStatus: liveTrailPackCatalogSnapshot.status') &&
    discover.includes('evaluatedCount: exploreGuidanceEvaluatedCount') &&
    discover.includes('readyCount: exploreGuidanceReadyCount') &&
    discover.includes('testID="explore-guidance-ready-provider-unavailable-local-ready"') &&
    discover.includes('exploreGuidanceEvaluatedCount > 0 ||') &&
    discover.includes('routeCatalogValidEmpty'),
  'Provider empty/error state must stay distinct from the overall inventory so eligible saved or imported routes remain rendered.',
);

assert(
  discover.includes('const handleLoadNextRouteCatalogPage = useCallback') &&
    discover.includes('testID="explore-guidance-ready-load-next-provider-page"') &&
    discover.includes('testID="explore-guidance-ready-pagination-error"') &&
    discover.includes('testID="explore-route-catalog-pagination-progress"') &&
    discover.includes('buildRouteCatalogPaginationProgress({') &&
    discover.includes('visibleCatalogCardCount: visibleRouteCatalogCardCount') &&
    discover.includes('visibleCandidateCount: visibleExploreWizardCandidates.length') &&
    discover.includes('LOAD MORE VERIFIED ROUTES') &&
    discover.includes('SHOW MORE LOADED ROUTES') &&
    liveCatalog.includes('mergeLiveTrailPackCatalogPageSnapshots(') &&
    liveCatalog.includes("paginationWarning: 'no_progress'"),
  'Mounted Explore should distinguish the rendered window from loaded routes, expose accessible continuation, and stop a no-progress loop.',
);

assert(
  discover.includes('guidanceDiagnosticTrailPacks') &&
    discover.includes('guidanceDiagnosticRecords') &&
    discover.includes('routeCatalogProviderNotReadyCount') &&
    discover.includes('Math.max(routeCatalogSafeDiagnosticRecords.length, routeCatalogCurationCandidateCount)') &&
    discover.includes('!routeCatalogHasNonReadyProviderResults') &&
    discover.includes('testID="explore-route-catalog-not-guidance-ready-state"') &&
    discover.includes('testID="explore-guidance-ready-provider-not-ready"') &&
    discover.includes('Some Route Records Are Blocked') &&
    discover.includes('remain blocked from discovery by access, moderation, source, condition, vehicle, identity, invalid-data, or supported-format requirements.'),
  'A successful provider response containing only legitimately blocked records must render typed blocked diagnostics instead of a false no-routes empty state.',
);

assert(
  discover.includes('const hasRouteCatalogDiagnosticData =') &&
    discover.includes('const hasRouteCatalogAnyData = hasRouteCatalogRenderableData || hasRouteCatalogDiagnosticData') &&
    discover.includes('const routeCatalogCancelledWithData =') &&
    discover.includes('const routeCatalogStaleWithData =') &&
    discover.includes('route summary remains') &&
    discover.includes('visible from last-good data. Source and freshness labels remain visible while live refresh is degraded.') &&
    discover.includes('Route refresh cancelled. Last-good rows remain visible'),
  'Diagnostic-only last-good data must preserve cancelled/cached/degraded source state instead of being relabeled as a fresh provider result.',
);

assert(
  discover.includes("liveTrailPackCatalogSnapshot.source === 'trail_packs_fallback'") &&
    discover.includes('Showing degraded legacy fallback summaries locally filtered to this area and radius.') &&
    discover.includes('not authoritative catalog-verified') &&
    discover.includes("? 'DEGRADED'") &&
    discover.includes('routeCatalogCachedWithData') &&
    discover.includes("? 'CACHED'") &&
    !discover.includes('degraded global legacy fallback'),
  'Legacy fallback rows should remain degraded and locally scoped without being mislabeled as authoritative verified or cached data.',
);

console.log('Explore route catalog search-area checks passed');
