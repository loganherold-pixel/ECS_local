const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const wizardCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreTripBuilderWizardRouteCard.tsx'),
  'utf8',
);
const trailPackCardSource = fs.readFileSync(path.join(root, 'components', 'discover', 'TrailPackCard.tsx'), 'utf8');
const overlaySource = fs.readFileSync(path.join(root, 'lib', 'navigateExploreRoutesOverlay.ts'), 'utf8');
const qaDocPath = path.join(root, 'docs', 'explore-rendering-performance-android-qa.md');
const imageResolverPath = path.join(root, 'lib', 'explore', 'routeImageResolver.ts');
const mapPreviewPath = path.join(root, 'lib', 'explore', 'exploreMapPreviewOptimization.ts');

assert(fs.existsSync(imageResolverPath), 'Explore route image resolver service should exist.');
assert(fs.existsSync(mapPreviewPath), 'Explore map preview optimization service should exist.');
assert(fs.existsSync(qaDocPath), 'Android Explore rendering performance QA notes should exist.');

const {
  ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI,
  buildRouteImagePrefetchQueue,
  createRouteImageMemoryCache,
  resolveRouteCardImage,
} = require(imageResolverPath);
const {
  EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS,
  buildExploreRoutePreviewFeatureCollection,
  estimateExploreInitialRenderWork,
  getExploreMapPreviewRenderPlan,
  simplifyRouteGeometryForPreview,
} = require(mapPreviewPath);

const imageCache = createRouteImageMemoryCache();
imageCache.markLoaded('rubicon-trail', 'https://cdn.ecs.test/rubicon-cached-thumb.jpg');
let imageResolution = resolveRouteCardImage({
  routeId: 'rubicon-trail',
  title: 'Rubicon Trail',
  remoteThumbnailUri: 'https://cdn.ecs.test/rubicon-remote-thumb.jpg',
  uploadedImageThumbnailUri: 'file:///uploads/rubicon-user-thumb.jpg',
  route: {
    id: 'rubicon-trail',
    name: 'Rubicon Trail',
    regionGroup: 'sierra-nevada',
    terrainType: 'alpine trail',
  },
  imageCache,
});
assert.strictEqual(imageResolution.source, 'cached_thumbnail');
assert.strictEqual(imageResolution.uri, 'https://cdn.ecs.test/rubicon-cached-thumb.jpg');
assert.strictEqual(imageResolution.textAndMetadataFirst, true);
assert.strictEqual(imageResolution.blocksCardRender, false);

const uncachedImages = createRouteImageMemoryCache();
imageResolution = resolveRouteCardImage({
  routeId: 'rubicon-trail',
  title: 'Rubicon Trail',
  remoteThumbnailUri: 'https://cdn.ecs.test/rubicon-remote-thumb.jpg',
  uploadedImageThumbnailUri: 'file:///uploads/rubicon-user-thumb.jpg',
  route: {
    id: 'rubicon-trail',
    name: 'Rubicon Trail',
    regionGroup: 'sierra-nevada',
    terrainType: 'alpine trail',
  },
  imageCache: uncachedImages,
});
assert.strictEqual(imageResolution.source, 'remote_thumbnail');

uncachedImages.markFailed('https://cdn.ecs.test/rubicon-remote-thumb.jpg');
imageResolution = resolveRouteCardImage({
  routeId: 'rubicon-trail',
  title: 'Rubicon Trail',
  remoteThumbnailUri: 'https://cdn.ecs.test/rubicon-remote-thumb.jpg',
  uploadedImageThumbnailUri: 'file:///uploads/rubicon-user-thumb.jpg',
  route: {
    id: 'rubicon-trail',
    name: 'Rubicon Trail',
    regionGroup: 'sierra-nevada',
    terrainType: 'alpine trail',
  },
  imageCache: uncachedImages,
});
assert.strictEqual(imageResolution.source, 'uploaded_user_image_thumbnail');
assert.strictEqual(imageResolution.blocksCardRender, false, 'Image failures must not block route card metadata.');

uncachedImages.markFailed('file:///uploads/rubicon-user-thumb.jpg');
imageResolution = resolveRouteCardImage({
  routeId: 'rubicon-trail',
  title: 'Rubicon Trail',
  remoteThumbnailUri: 'https://cdn.ecs.test/rubicon-remote-thumb.jpg',
  uploadedImageThumbnailUri: 'file:///uploads/rubicon-user-thumb.jpg',
  route: {
    id: 'rubicon-trail',
    name: 'Rubicon Trail',
    regionGroup: 'sierra-nevada',
    terrainType: 'alpine trail',
  },
  imageCache: uncachedImages,
});
assert.strictEqual(imageResolution.source, 'generated_category_fallback');
assert(imageResolution.uri && imageResolution.uri !== ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI);

imageResolution = resolveRouteCardImage({
  routeId: 'route-with-no-images',
  title: 'Route With No Images',
  imageCache: createRouteImageMemoryCache(),
  allowGeneratedFallback: false,
});
assert.strictEqual(imageResolution.source, 'neutral_ecs_fallback');
assert.strictEqual(imageResolution.uri, ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI);

const prefetchQueue = buildRouteImagePrefetchQueue(
  Array.from({ length: 16 }, (_, index) => ({
    routeId: `route-${index}`,
    title: `Route ${index}`,
    remoteThumbnailUri: `https://cdn.ecs.test/route-${index}.jpg`,
  })),
  {
    imageCache: createRouteImageMemoryCache(),
    visibleCount: 8,
    prefetchCount: 4,
  },
);
assert.deepStrictEqual(
  prefetchQueue.uris,
  [
    'https://cdn.ecs.test/route-8.jpg',
    'https://cdn.ecs.test/route-9.jpg',
    'https://cdn.ecs.test/route-10.jpg',
    'https://cdn.ecs.test/route-11.jpg',
  ],
);
assert.strictEqual(prefetchQueue.offscreenImageDeferral, true);
assert.strictEqual(prefetchQueue.textAndMetadataFirst, true);

const fullGeometry = Array.from({ length: 100 }, (_, index) => ({
  latitude: 38.8 + index * 0.001,
  longitude: -120.8 + Math.sin(index / 3) * 0.01,
}));
const simplified = simplifyRouteGeometryForPreview(fullGeometry, { maxPoints: 25 });
assert(simplified.length <= 25, 'Preview simplification should cap dense route geometry.');
assert(simplified.length < fullGeometry.length, 'Preview simplification should reduce dense geometry.');
assert.deepStrictEqual(simplified[0], fullGeometry[0], 'Preview simplification must preserve the route start.');
assert.deepStrictEqual(
  simplified[simplified.length - 1],
  fullGeometry[fullGeometry.length - 1],
  'Preview simplification must preserve the route end.',
);

const previewCollection = buildExploreRoutePreviewFeatureCollection(
  Array.from({ length: 75 }, (_, index) => ({
    routeId: `route-${index}`,
    title: `Route ${index}`,
    category: 'trail_pack',
    geometry: fullGeometry.map((point) => ({
      latitude: point.latitude + index * 0.0001,
      longitude: point.longitude,
    })),
    guidanceReady: true,
  })),
  {
    zoom: 11,
    maxPointsPerRoute: EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS,
  },
);
assert.strictEqual(previewCollection.type, 'FeatureCollection');
assert.strictEqual(previewCollection.features.length, 75);
assert.strictEqual(previewCollection.metadata.combinedSourceCount, 1);
assert(previewCollection.metadata.lineLayerCount <= 2, 'Map preview should use shared line layers, not one layer per route.');
assert.strictEqual(previewCollection.metadata.fullGeometryLoadedForInitialCards, false);
assert(
  previewCollection.features.every((feature) => feature.geometry.coordinates.length <= EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS),
  'Preview features should use simplified geometry.',
);

const lowZoomPlan = getExploreMapPreviewRenderPlan({
  zoom: 8,
  candidateCount: 180,
  focusedRouteId: null,
});
assert.strictEqual(lowZoomPlan.mode, 'clustered_markers');
assert.strictEqual(lowZoomPlan.useCombinedFeatureCollection, true);
assert.strictEqual(lowZoomPlan.lazyLoadFullGeometry, true);

const focusedPlan = getExploreMapPreviewRenderPlan({
  zoom: 14,
  candidateCount: 12,
  focusedRouteId: 'route-7',
});
assert.strictEqual(focusedPlan.mode, 'focused_detail');
assert.strictEqual(focusedPlan.lazyLoadFullGeometry, true);

const firstVisibleWork = estimateExploreInitialRenderWork({
  candidateCount: 250,
  cachedResultCount: 100,
  visibleCardCount: 12,
  pendingRefresh: true,
});
assert.strictEqual(firstVisibleWork.firstVisibleCanRenderBeforeRefresh, true);
assert.strictEqual(firstVisibleWork.fullGeometryRequiredForInitialCards, false);
assert(firstVisibleWork.estimatedInitialCardRenderCount <= 12);

[
  'FlatList',
  'EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT',
  'EXPLORE_ROUTE_CARD_BATCH_SIZE',
  'EXPLORE_ROUTE_CARD_WINDOW_SIZE',
  'ExploreWizardRouteCardListItem = React.memo',
  'exploreWizardCandidateKeyExtractor',
  'renderExploreWizardCandidateCard',
  'initialNumToRender={EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT}',
  'maxToRenderPerBatch={EXPLORE_ROUTE_CARD_BATCH_SIZE}',
  'windowSize={EXPLORE_ROUTE_CARD_WINDOW_SIZE}',
  'updateCellsBatchingPeriod={EXPLORE_ROUTE_CARD_BATCHING_PERIOD_MS}',
  'removeClippedSubviews',
  'ListFooterComponent={exploreWizardRouteListFooter}',
].forEach((needle) => {
  assert(discoverSource.includes(needle), `Explore route list should use virtualized rendering wiring: ${needle}.`);
});
assert(
  !discoverSource.includes('visibleExploreWizardCardCandidates.map((candidate) => ('),
  'Guidance-ready Explore cards should not be eagerly mapped in the page ScrollView.',
);

[
  'React.memo',
  'deferThumbnail',
  'deferEnrichment',
  'resolveRouteCardImage',
  'thumbnailFailed',
  'onError',
].forEach((needle) => {
  assert(wizardCardSource.includes(needle), `Wizard route card should progressively render thumbnails/enrichment: ${needle}.`);
});
[
  'React.memo',
  'deferThumbnail',
  'deferEnrichment',
  'thumbnailPlaceholder',
  'onError',
].forEach((needle) => {
  assert(trailPackCardSource.includes(needle), `Trail Pack card should keep progressive image behavior: ${needle}.`);
});
assert(overlaySource.includes('simplifyRouteGeometryForPreview'), 'Explore route map handoff should simplify preview geometry.');

const qaDoc = fs.readFileSync(qaDocPath, 'utf8');
[
  'EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG=true',
  'npm run test:explore-rendering-performance',
  'Android QA Path',
  '100 nearby route cards',
  '250 indexed route candidates',
  'Route images failing does not block cards',
  'Full geometry is not loaded for every nearby card',
].forEach((needle) => {
  assert(qaDoc.includes(needle), `Android QA doc should include: ${needle}.`);
});

console.log('Explore rendering performance checks passed.');
