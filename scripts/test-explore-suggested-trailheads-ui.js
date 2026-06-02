const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const planningTabs = fs.readFileSync(path.join(root, 'components', 'discover', 'ExplorePlanningTabs.tsx'), 'utf8');
const featureRegistry = fs.readFileSync(path.join(root, 'lib', 'explore', 'exploreFeatureRegistry.ts'), 'utf8');
const tripBuilder = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
const offlinePrep = fs.readFileSync(path.join(root, 'app', 'explore-offline-prep-pack.tsx'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  planningTabs,
  "label: 'Suggested Trailheads'",
  'Explorer planning tabs should label the discovery surface as Suggested Trailheads.',
);
assertIncludes(
  featureRegistry,
  "title: 'Suggested Trailheads'",
  'Explore feature registry should expose Suggested Trailheads as the user-facing title.',
);
assertIncludes(
  featureRegistry,
  'Open curated Explore trailhead suggestions',
  'Explore feature registry should describe trailhead suggestions instead of implying complete route coverage.',
);

assertIncludes(
  discover,
  'const EXPLORE_CATEGORY_PAGE_SIZE = 10;',
  'Explorer category panels should keep compact 10-item trailhead pages per filtered criteria.',
);
assertIncludes(
  discover,
  '`${hiddenGemPage.pageIndex + 1 >= hiddenGemPageCount ? \'RESTART\' : \'NEXT\'} ${hiddenGemPage.pageSize}`',
  'Hidden Gems pager should reflect the configured page size.',
);
assertNotIncludes(discover, "case 'popularTrails'", 'Explorer should not expose a Popular Trails category panel.');
assertIncludes(
  discover,
  '`${aiRouteIdeaPage.pageIndex + 1 >= aiRouteIdeaPageCount ? \'RESTART\' : \'NEXT\'} ${aiRouteIdeaPage.pageSize}`',
  'ECS Route Ideas pager should reflect the configured page size.',
);
assertIncludes(
  discover,
  "activeExplorerCategoryPanel === 'favorites' ? 'ITEM' : 'TRAILHEAD'",
  'Explorer category panel should call filtered Explore options trailheads while preserving Favorites item language.',
);
assertIncludes(
  discover,
  '{activeExplorerPanelItemLabel}{activeExplorerPanelPage.totalItems === 1 ? \'\' : \'S\'}',
  'Explorer category panel count badge should use the dynamic trailhead/item label.',
);
assertIncludes(
  discover,
  'filtered Suggested Trailheads have map-ready route lines',
  'Map preview helper copy should use Suggested Trailheads language.',
);
assertIncludes(
  discover,
  'No Suggested Trailheads match the active filters yet.',
  'Planning empty state should direct users back to Suggested Trailheads.',
);
assertNotIncludes(discover, 'ready from Suggested Routes', 'Explorer copy should no longer say Suggested Routes in the map helper.');

assertIncludes(
  tripBuilder,
  'Open Suggested Trailheads',
  'Trip Builder empty state should send users back to Suggested Trailheads.',
);
assertIncludes(
  offlinePrep,
  'Suggested Trailheads',
  'Offline Prep empty state should send users back to Suggested Trailheads.',
);

console.log('Explore suggested trailheads UI checks passed.');
