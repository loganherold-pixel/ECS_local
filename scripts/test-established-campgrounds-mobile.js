const fs = require('fs');
const path = require('path');
const ts = require('typescript');

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

require(path.join(__dirname, '..', 'tests', 'map', 'establishedCampgroundsMobile.test.ts'));

const navigateSource = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const mapRendererSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'navigate', 'MapRenderer.tsx'), 'utf8');
const searchClientSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'map', 'establishedCampgroundSearchClient.ts'),
  'utf8',
);
const toggleEstablishedStart = navigateSource.indexOf('const toggleEstablishedCampsites = useCallback(() => {');
const toggleEstablishedEnd = navigateSource.indexOf('const retryDispersedCampingEligibility = useCallback(() => {', toggleEstablishedStart);
const toggleEstablishedBlock = navigateSource.slice(toggleEstablishedStart, toggleEstablishedEnd);
const removeEstablishedStart = mapRendererSource.indexOf('function removeEstablishedCampsitesLayer()');
const removeEstablishedEnd = mapRendererSource.indexOf('function ensureEstablishedCampsiteImages()', removeEstablishedStart);
const removeEstablishedBlock = mapRendererSource.slice(removeEstablishedStart, removeEstablishedEnd);

if (!searchClientSource.includes('logFailures?: boolean')) {
  throw new Error('Established campground search client should support suppressing handled failure logs.');
}

if (!navigateSource.includes('fetchEstablishedCampgroundsForMap({ bbox: request.bbox, logFailures: false })')) {
  throw new Error('Navigate should handle established campground fetch failures before noisy camp layer logging.');
}

if (!navigateSource.includes('readEstablishedCampgroundsOfflineCache(request.cacheKey)')) {
  throw new Error('Navigate should try established campground offline cache after online fetch failure.');
}

if (!navigateSource.includes('frontend_online_failure_cache_hit')) {
  throw new Error('Navigate should diagnose online established campground failure cache fallback.');
}

if (!navigateSource.includes('establishedCampsitesRouteNearbyResults')) {
  throw new Error('Navigate should reuse route-filtered established campgrounds for the near-route card and map layer.');
}

if (!navigateSource.includes('toEstablishedCampsiteFeatureCollection(establishedCampgroundsForMap)')) {
  throw new Error('Navigate should keep established campground map pins scoped to the active route corridor when route geometry exists.');
}

if (!navigateSource.includes('handleEstablishedCampsiteNavigate') || !navigateSource.includes('onNavigate={handleEstablishedCampsiteNavigate}')) {
  throw new Error('Established campground detail sheets should offer route preview navigation.');
}

if (
  navigateSource.includes('ESTABLISHED CAMPGROUNDS ON') ||
  navigateSource.includes('ESTABLISHED CAMPGROUNDS OFF')
) {
  throw new Error('Established campground toggle should not show transient on/off banners.');
}

if (
  !toggleEstablishedBlock.includes('setEstablishedCampgroundsUiState((current) => setCampLayerEnabled(current, next));') ||
  !toggleEstablishedBlock.includes('establishedCampgroundsFetchCoordinatorRef.current.cancel();') ||
  !toggleEstablishedBlock.includes('setSelectedEstablishedCampsite(null);')
) {
  throw new Error('Established campground toggle-off should update UI immediately, cancel pending fetch work, and clear only the selected campsite.');
}

if (
  !removeEstablishedBlock.includes("map.setLayoutProperty(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, 'visibility', 'none')") ||
  !removeEstablishedBlock.includes("map.setLayoutProperty(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID, 'visibility', 'none')") ||
  removeEstablishedBlock.includes('map.removeLayer') ||
  removeEstablishedBlock.includes('map.removeSource') ||
  !mapRendererSource.includes("map.setLayoutProperty(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID, 'visibility', 'visible')") ||
  !mapRendererSource.includes("map.setLayoutProperty(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID, 'visibility', 'visible')")
) {
  throw new Error('Established campground map layers should hide/show without removing cached Mapbox sources and layers.');
}

const routeSearchSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'map', 'establishedCampsiteRouteSearch.ts'),
  'utf8',
);

if (!routeSearchSource.includes('DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES = 5')) {
  throw new Error('Established campground route corridor should default to 5 miles.');
}

if (!routeSearchSource.includes('MAX_ESTABLISHED_CAMPSITE_ROUTE_ANALYSIS_POINTS')) {
  throw new Error('Established campground route search should thin long active-guidance route geometry.');
}

console.log('Established Campgrounds mobile integration checks passed.');
