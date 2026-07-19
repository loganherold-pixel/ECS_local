const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const enrichedCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'),
  'utf8',
);
const aiCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'AIRouteCard.tsx'),
  'utf8',
);
const trailPackCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'TrailPackCard.tsx'),
  'utf8',
);
const tripBuilderCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreTripBuilderWizardRouteCard.tsx'),
  'utf8',
);
const routeCardSummaryPath = path.join(root, 'lib', 'explore', 'exploreRouteCardSummary.ts');
const routeCardSummarySource = fs.existsSync(routeCardSummaryPath)
  ? fs.readFileSync(routeCardSummaryPath, 'utf8')
  : '';
const exploreFilterStateSource = fs.readFileSync(
  path.join(root, 'lib', 'exploreFilterStateStore.ts'),
  'utf8',
);

function countOccurrences(source, text) {
  return (source.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

function hasStyleValue(source, styleName, property, value) {
  return new RegExp(`${styleName}:\\s*{[\\s\\S]*?${property}:\\s*${value},`).test(source);
}

assert.ok(
  enrichedCardSource.includes('compactPreview?: boolean') &&
    aiCardSource.includes('compactPreview?: boolean'),
  'Explore route cards should expose a compact preview mode.',
);

assert.ok(
  countOccurrences(discoverSource, 'compactPreview') >= 5,
  'Every Explore trail-card list should render compact previews.',
);

assert.ok(
  !discoverSource.includes('hiddenGemContextRow') &&
    !discoverSource.includes('GOOD FIT FOR YOUR RIG') &&
    !discoverSource.includes('LOWER TRAFFIC') &&
    !discoverSource.includes('OPEN THIS SEASON'),
  'Collapsed Explore cards should not render redundant hidden-gem context chips.',
);

assert.ok(
  /!\s*compactPreview\s*\?\s*\([\s\S]*Preview Route[\s\S]*Open in Navigate[\s\S]*\)\s*:\s*null/.test(enrichedCardSource),
  'Known route Preview/Open in Navigate actions should only render outside compact preview mode.',
);

assert.ok(
  /!\s*compactPreview\s*\?\s*\([\s\S]*NAVIGATE[\s\S]*BUILD[\s\S]*\)\s*:\s*null/.test(aiCardSource),
  'AI route Navigate/Build actions should only render outside compact preview mode.',
);

assert.ok(
    enrichedCardSource.includes('<Text style={s.statUnit}>MI AWAY</Text>') &&
    enrichedCardSource.includes("<Text style={s.statUnit}>{route.estimatedDays === 1 ? 'DAY' : 'DAYS'}</Text>") &&
    enrichedCardSource.includes('<Text style={s.statUnit}>FIT</Text>'),
  'Known compact cards should preserve distance, duration, and Vehicle Fit metrics.',
);

assert.ok(
    aiCardSource.includes('<Text style={s.statUnit}>MI AWAY</Text>') &&
    aiCardSource.includes("<Text style={s.statUnit}>{route.estimatedDays === 1 ? 'DAY' : 'DAYS'}</Text>") &&
    aiCardSource.includes('<Text style={s.statUnit}>FIT</Text>'),
  'AI compact cards should preserve distance, duration, and Vehicle Fit metrics.',
);

assert.ok(
  discoverSource.includes('setAnalysisVisible(true)') &&
    discoverSource.includes('setAiPreviewVisible(true)') &&
    enrichedCardSource.includes('onPress={() => { hapticMicro(); onSelect(); }}') &&
    aiCardSource.includes('onPress={() => { hapticMicro(); onPreview(); }}'),
  'Tapping a compact card should still open the existing detail/action view.',
);

assert.ok(
  hasStyleValue(discoverSource, 'routeCardGrid', 'gap', '4') &&
    hasStyleValue(discoverSource, 'hiddenGemCardWrap', 'marginBottom', '2') &&
    hasStyleValue(enrichedCardSource, 'cardCompact', 'marginBottom', '4') &&
    hasStyleValue(aiCardSource, 'cardCompact', 'marginBottom', '4'),
  'Explore card spacing should be tighter in compact mode.',
);

assert.ok(
  discoverSource.includes('sectionCardViewport') &&
    discoverSource.includes('nestedScrollEnabled') &&
    discoverSource.includes('EXPLORE_CATEGORY_PAGE_SIZE = 10'),
  'Explore category panels should use internal scroll areas with up-to-10-item pages.',
);

assert.ok(
  discoverSource.includes('useState<ExpeditionOpportunity[]>([])') &&
    discoverSource.includes('opportunityLoadTask: ShellInteractionTask') &&
    discoverSource.includes('runAfterShellInteractions(() => {') &&
    discoverSource.includes('loadExpeditionOpportunities(),') &&
    discoverSource.includes("showInitialLoading = isLoading && !hasLoadedExplorer && opportunities.length === 0") &&
    discoverSource.includes('showSectionLoading = isLoading && (hasLoadedExplorer || opportunities.length > 0)'),
  'Explore should defer seed processing until shell interactions settle and reserve full-screen loading for an empty initial route set.',
);

assert.ok(
  discoverSource.includes('EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT = ECS_ROUTE_SEARCH_RESULT_LIMIT') &&
    discoverSource.includes('exploreGuidanceReadyVisibleLimit') &&
    discoverSource.includes('visibleExploreWizardCardCandidates') &&
    discoverSource.includes('visibleExploreWizardCandidates.slice(0, exploreGuidanceReadyVisibleLimit)') &&
    !discoverSource.includes('SHOW MORE ROUTES') &&
    discoverSource.includes('testID="explore-route-search-cap-notice"') &&
    discoverSource.includes('setExploreGuidanceReadyVisibleLimit(EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT)') &&
    discoverSource.includes('liveTrailPackCatalogSnapshot.routeCatalogSummaries.length === 0') &&
    discoverSource.includes('Math.max(\n      current,\n      exploreWizardCandidateSet.candidates.length') &&
    discoverSource.includes('initialNumToRender={EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT}') &&
    discoverSource.includes('maxToRenderPerBatch={EXPLORE_ROUTE_CARD_BATCH_SIZE}'),
  'Guidance Ready should virtualize the single capped result set and expose no user-facing continuation.',
);

assert.ok(
  exploreFilterStateSource.includes('export type ExplorerCategoryPanelKey =') &&
    exploreFilterStateSource.includes("'hiddenGems'") &&
    !exploreFilterStateSource.includes("'popularTrails'") &&
    exploreFilterStateSource.includes("'trailPacks'") &&
    exploreFilterStateSource.includes("'ecsRouteIdeas'") &&
    exploreFilterStateSource.includes("'favorites'") &&
    discoverSource.includes('type ExplorerCategoryPanelKey') &&
    discoverSource.includes('explorerCategoryGrid') &&
    discoverSource.includes('activeExplorerCategoryPanel') &&
    discoverSource.includes('explorerPanelShell'),
  'Explorer should expose only the active category tiles that open a full-body panel.',
);

assert.ok(
  discoverSource.includes("label: 'Hidden Gems'") &&
    !discoverSource.includes("label: 'Popular Trails'") &&
    !discoverSource.includes("case 'popularTrails'") &&
    !discoverSource.includes('collectionLabel="Popular Trails"') &&
    discoverSource.includes("label: 'Trail Packs'") &&
    discoverSource.includes("label: 'ECS Route Ideas'") &&
    discoverSource.includes("label: 'Favorites'") &&
    discoverSource.includes("icon: 'diamond-outline'") &&
    discoverSource.includes("icon: 'albums-outline'") &&
    discoverSource.includes("icon: 'navigate-outline'") &&
    discoverSource.includes("icon: 'star-outline'"),
  'Explorer category tiles should include Hidden Gems, Trail Packs, ECS Route Ideas, and Favorites without Popular Trails.',
);

assert.ok(
  discoverSource.includes("import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'") &&
    discoverSource.includes('explorerCategoryTileGold') &&
    discoverSource.includes('borderColor: ECS_SURFACE.border.selected') &&
    discoverSource.includes('backgroundColor: ECS_SURFACE.background.selected') &&
    countOccurrences(discoverSource, 'accentColor: TACTICAL.amber') >= 4 &&
    !discoverSource.includes("accentColor: '#5AC8FA'") &&
    !discoverSource.includes("accentColor: '#E6B84C'"),
  'Explorer category tiles should use the Fleet vehicle-card selected gold surface and a shared amber accent.',
);

assert.ok(
  !discoverSource.includes('style={s.footerNote}') &&
    !discoverSource.includes('Showing ${hiddenGemPage.eligibleCount} Explore picks') &&
    !discoverSource.includes('ECS filters out trails under ${MIN_DISCOVERY_ROUTE_MILES} miles'),
  'Explorer should remove the small route-count and minimum-length disclaimer text below the category containers.',
);

assert.ok(
  trailPackCardSource.includes('compactPreview?: boolean') &&
    trailPackCardSource.includes('ECS confidence') &&
    trailPackCardSource.includes('PREVIEW') &&
    trailPackCardSource.includes('START'),
  'Trail Pack cards should use the compact Explore card pattern with Preview and guarded Start actions.',
);

assert.ok(
  tripBuilderCardSource.includes('styles.headerThumbnail') &&
    !tripBuilderCardSource.includes('buildExploreRouteCardSummary(candidate)') &&
    !tripBuilderCardSource.includes("label: 'Status'") &&
    !tripBuilderCardSource.includes("label: 'Current Condition'") &&
    !tripBuilderCardSource.includes("label: 'Why'") &&
    !tripBuilderCardSource.includes("label: 'What to Watch'") &&
    !tripBuilderCardSource.includes("label: 'Recommended Action'") &&
    !tripBuilderCardSource.includes("label: 'To Improve Status'") &&
    !tripBuilderCardSource.includes('styles.summaryList') &&
    !tripBuilderCardSource.includes('thumbnailWrap') &&
    !tripBuilderCardSource.includes('thumbnailOverlay') &&
    !tripBuilderCardSource.includes('candidate.dataUsed.length') &&
    !tripBuilderCardSource.includes('SOURCES'),
  'TripBuilder route cards should use a compact side thumbnail and keep readiness assessment detail out of the card face.',
);

assert.ok(
  hasStyleValue(tripBuilderCardSource, 'headerThumbnail', 'width', '72') &&
    hasStyleValue(tripBuilderCardSource, 'headerThumbnail', 'height', '54') &&
    hasStyleValue(trailPackCardSource, 'thumbnailFrame', 'width', '70') &&
    hasStyleValue(aiCardSource, 'thumbnailFrame', 'width', '70'),
  'Explorer route visuals should be small thumbnails, not full-width top-half banners.',
);

assert.ok(
  routeCardSummarySource.includes('export type ExploreRouteCardSummary') &&
    routeCardSummarySource.includes('currentCondition') &&
    routeCardSummarySource.includes('recommendedAction') &&
    routeCardSummarySource.includes('toImproveStatus') &&
    !routeCardSummarySource.includes('dataUsed'),
  'Explore compact cards should use a six-field summary model with no Data Used field.',
);

assert.ok(
  discoverSource.includes('filteredExploreRouteIds') &&
    discoverSource.includes('filteredFavoriteTrails') &&
    discoverSource.includes('filteredFavoritePlans') &&
    discoverSource.includes('favoritesTotal = filteredFavoriteTrails.length + filteredFavoritePlans.length'),
  'Favorites counts should derive from the active Explore route context.',
);

assert.ok(
  discoverSource.includes('style={s.favoriteThumbnailImage}') &&
    discoverSource.includes('resizeMode="contain"') &&
    hasStyleValue(discoverSource, 'favoriteThumbnailFrame', 'height', '76') &&
    discoverSource.includes("backgroundColor: 'rgba(5,7,9,0.92)'"),
  'Favorites card thumbnails should use a contained, readable frame instead of severe full-bleed cropping.',
);

assert.ok(
  !discoverSource.includes('NEXT 5') &&
    discoverSource.includes('activeExplorerPanelPage.pageIndex > 0 ?') &&
    discoverSource.includes('activeExplorerPanelPage.pageIndex + 1 < activeExplorerPanelPage.totalPages ?') &&
    discoverSource.includes('explorerPanelPagerSlot'),
  'Explore category panel pagination should use 10-card pages and only show directional controls when movement is available.',
);

assert.ok(
  discoverSource.includes('{false && (!showInitialLoading && !showRefinementEmptyState') &&
    hasStyleValue(discoverSource, 'explorerBody', 'flex', '1') &&
    hasStyleValue(discoverSource, 'explorerPanelScroll', 'flex', '1') &&
    /nestedScrollEnabled\s+keyboardShouldPersistTaps="handled"/.test(discoverSource),
  'Explorer should keep long card sections off the main page and contain scrolling inside the full-body panel.',
);

console.log('Explore compact card checks passed.');
