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
const exploreFilterStateSource = fs.readFileSync(
  path.join(root, 'lib', 'exploreFilterStateStore.ts'),
  'utf8',
);

function countOccurrences(source, text) {
  return (source.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
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
  discoverSource.includes('routeCardGrid: {\n    gap: 4,') &&
    discoverSource.includes('hiddenGemCardWrap: {\n    marginBottom: 2,') &&
    enrichedCardSource.includes('cardCompact: {\n    marginBottom: 4,') &&
    aiCardSource.includes('cardCompact: {\n    marginBottom: 4,'),
  'Explore card spacing should be tighter in compact mode.',
);

assert.ok(
  discoverSource.includes('sectionCardViewport') &&
    discoverSource.includes('nestedScrollEnabled') &&
    discoverSource.includes('EXPLORE_CATEGORY_PAGE_SIZE = 10'),
  'Explore category panels should use internal scroll areas with up-to-10-item pages.',
);

assert.ok(
  exploreFilterStateSource.includes('export type ExplorerCategoryPanelKey =') &&
    exploreFilterStateSource.includes("'hiddenGems'") &&
    exploreFilterStateSource.includes("'popularTrails'") &&
    exploreFilterStateSource.includes("'trailPacks'") &&
    exploreFilterStateSource.includes("'ecsRouteIdeas'") &&
    exploreFilterStateSource.includes("'favorites'") &&
    discoverSource.includes('type ExplorerCategoryPanelKey') &&
    discoverSource.includes('explorerCategoryGrid') &&
    discoverSource.includes('activeExplorerCategoryPanel') &&
    discoverSource.includes('explorerPanelShell'),
  'Explorer should expose category tiles that open a full-body panel.',
);

assert.ok(
  discoverSource.includes("label: 'Hidden Gems'") &&
    discoverSource.includes("label: 'Popular Trails'") &&
    discoverSource.includes("label: 'Trail Packs'") &&
    discoverSource.includes("label: 'ECS Route Ideas'") &&
    discoverSource.includes("label: 'Favorites'") &&
    discoverSource.includes("icon: 'diamond-outline'") &&
    discoverSource.includes("icon: 'trail-sign-outline'") &&
    discoverSource.includes("icon: 'albums-outline'") &&
    discoverSource.includes("icon: 'navigate-outline'") &&
    discoverSource.includes("icon: 'star-outline'"),
  'Explorer category tiles should include the required labels and icons.',
);

assert.ok(
  trailPackCardSource.includes('compactPreview?: boolean') &&
    trailPackCardSource.includes('ECS confidence') &&
    trailPackCardSource.includes('PREVIEW') &&
    trailPackCardSource.includes('START'),
  'Trail Pack cards should use the compact Explore card pattern with Preview and guarded Start actions.',
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
    discoverSource.includes('favoriteThumbnailFrame: {\n    height: 76,') &&
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
    discoverSource.includes('explorerBody: {\n    flex: 1,\n    position: \'relative\',') &&
    discoverSource.includes('explorerPanelScroll: {\n    flex: 1,') &&
    discoverSource.includes('nestedScrollEnabled\n                keyboardShouldPersistTaps="handled"'),
  'Explorer should keep long card sections off the main page and contain scrolling inside the full-body panel.',
);

console.log('Explore compact card checks passed.');
