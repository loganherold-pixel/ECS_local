/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExpeditionAnalysisModal.tsx'),
  'utf8',
);
const aiPreviewSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'AIRoutePreviewModal.tsx'),
  'utf8',
);
const trailPackPreviewSource = fs.readFileSync(
  path.join(root, 'components', 'trailPacks', 'TrailPackPreviewModal.tsx'),
  'utf8',
);
const previewSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  'utf8',
);
const previewNormalizerSource = fs.readFileSync(
  path.join(root, 'lib', 'exploreRoutePreview.ts'),
  'utf8',
);
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');

assert.ok(
  !modalSource.includes('onRoutePreview?: () => void') &&
    !modalSource.includes('routePreviewDisabled?: boolean') &&
    !modalSource.includes('routePreviewDisabledReason?: string | null'),
  'Expedition analysis modal should not expose a Route Preview action from route detail cards.',
);

const closeIndex = modalSource.indexOf('<Text style={s.footerSecondaryText}>CLOSE</Text>');
const previewIndex = modalSource.indexOf('ROUTE{\'\\n\'}PREVIEW');
const buildIndex = modalSource.indexOf('BUILD{\'\\n\'}ROUTE');
assert.ok(closeIndex > 0, 'Expedition analysis footer should keep the Close button.');
assert.strictEqual(previewIndex, -1, 'Route Preview should not render in the Explorer detail footer.');
assert.ok(buildIndex > closeIndex, 'Build Route should render after Close.');

assert.ok(
  !modalSource.includes('accessibilityLabel="Route Preview"') &&
    !modalSource.includes('onRoutePreview();'),
  'Explorer detail footer should not keep Route Preview button behavior.',
);

assert.ok(
  modalSource.includes('footerSecondaryBtn: {') &&
    !modalSource.includes('footerPreviewBtn: {') &&
    modalSource.includes('footerPrimaryBtn: {') &&
    modalSource.includes('flex: 1') &&
    modalSource.includes('minWidth: 0'),
  'Two fixed footer actions should use responsive flex sizing for mobile widths.',
);

assert.ok(
  !discoverSource.includes('onRoutePreview={selectedOpportunity ? handleOpenRoutePreview : undefined}') &&
    !discoverSource.includes("import ExploreRoutePreviewModal") &&
    !discoverSource.includes('const [routePreviewVisible, setRoutePreviewVisible]') &&
    !discoverSource.includes('const [routePreviewOpportunity, setRoutePreviewOpportunity]') &&
    !discoverSource.includes('openRoutePreviewForOpportunity') &&
    !discoverSource.includes('<ExploreRoutePreviewModal') &&
    discoverSource.includes('onBuildRoute={selectedOpportunity ? () => { void handleNavigateToRoute(selectedOpportunity); } : undefined}') &&
    discoverSource.includes('buildRouteDisabled={!!selectedOpportunityBuildUnavailableReason}'),
  'Discover should remove the obsolete Explore route preview popup/state while preserving Build Route in Expedition Analysis.',
);

assert.ok(
  !discoverSource.includes('routePreviewDisabled={!!selectedOpportunityBuildUnavailableReason}'),
  'Explore Route Preview should open the local preview overlay and let the modal show unavailable route data instead of being coupled to Build Route disabled state.',
);

assert.ok(
  discoverSource.includes("flowLabel: 'Route Preview'") &&
    discoverSource.includes('Review the map overview, then start when ready.'),
  'Route Preview actions from route idea and Trail Pack detail should stage Navigate map preview instead of opening an Explore popup.',
);

assert.ok(
  previewSource.includes('stackBehavior="allow-stack"') &&
    previewSource.includes('title="Route Preview"') &&
    previewSource.includes('MapRenderer') &&
    previewSource.includes('normalizeNavigationHandoffPreview(payload, userLocation)') &&
    previewSource.includes('normalizeExploreRoutePreview(opportunity, userLocation)') &&
    previewSource.includes('getMapboxToken') &&
    previewSource.includes('DEFAULT_MAP_STYLE') &&
    previewSource.includes('cameraCommand={previewModel.cameraCommand as CameraCommand | null}') &&
    previewSource.includes('Current GPS') &&
    previewSource.includes('GPS is unavailable') &&
    previewSource.includes('Route geometry unavailable') &&
    previewSource.includes('Map rendering unavailable') &&
    previewSource.includes('markerLegend') &&
    previewSource.includes('Opening this preview does not start navigation') &&
    previewSource.includes('START GUIDANCE') &&
    previewSource.includes('SAVE ROUTE') &&
    previewSource.includes('CLOSE PREVIEW'),
  'Explore route preview should render as a stacked analysis overlay using Navigate map utilities, GPS-aware preview copy, metadata, and explicit actions.',
);

assert.ok(
  previewNormalizerSource.includes('buildExploreNavigationPayload(opportunity)') &&
    previewNormalizerSource.includes('getRoadDestinationCoordinate(payload)') &&
    previewNormalizerSource.includes('payload.trailGeometry') &&
    previewNormalizerSource.includes('payload.trailheadCoordinate') &&
    previewNormalizerSource.includes('payload.coordinate') &&
    previewNormalizerSource.includes('computeBounds') &&
    previewNormalizerSource.includes("mode: 'route_overview'") &&
    previewNormalizerSource.includes('fitBounds:'),
  'Explore route preview should normalize selected route geometry/start/end metadata into MapRenderer bounds and camera commands.',
);

assert.ok(
  navigateSource.includes('const fitMapToNavigateRoutePreview = useCallback') &&
    navigateSource.includes('getExploreRoutePreviewRoutePoints(payload)') &&
    navigateSource.includes('buildExploreRoutePreviewCameraCommand(routePoints, 84)') &&
    navigateSource.includes("reason: 'navigate_route_preview_overview'") &&
    navigateSource.includes('if (fitMapToNavigateRoutePreview(navigateRoutePreviewPayload))'),
  'Navigate route preview should fit the map to the staged route instead of relying on a popup.',
);

assert.ok(
  discoverSource.includes('activeExplorerCategoryPanel') &&
    discoverSource.includes('visibleHiddenGemRoutes.map') &&
    discoverSource.includes('visiblePopularTrails.map') &&
    discoverSource.includes('enrichedKnown.map') &&
    discoverSource.includes('onSelect={() => handleSelectOpportunity(route)}'),
  'All Explore route categories should continue opening the shared expedition analysis modal from route cards.',
);

assert.ok(
  aiPreviewSource.includes('onRoutePreview?: () => void') &&
    aiPreviewSource.includes('accessibilityLabel="Route Preview"') &&
    aiPreviewSource.includes("name=\"map-outline\"") &&
    aiPreviewSource.includes("ROUTE{'\\n'}PREVIEW"),
  'ECS route idea preview modal should expose the shared Route Preview action.',
);

assert.ok(
    trailPackPreviewSource.includes('onRoutePreview?: () => void') &&
    trailPackPreviewSource.includes('accessibilityLabel="Route Preview"') &&
    trailPackPreviewSource.includes("name=\"map-outline\"") &&
    trailPackPreviewSource.includes("ROUTE{'\\n'}PREVIEW"),
  'Trail Pack preview modal should expose the shared Route Preview action.',
);

assert.ok(
  discoverSource.includes('onRoutePreview={') &&
    discoverSource.includes('void handleNavigateToRoute(aiPreviewRoute, {') &&
    discoverSource.includes('void handleNavigateToRoute(trailPackToExpeditionOpportunity(trailPackPreview), {'),
  'Separate ECS route idea and Trail Pack analysis paths should hand off to Navigate map preview.',
);

assert.ok(
  !discoverSource.includes('<ExploreRoutePreviewModal'),
  'Discover should not render the obsolete Explore route preview popup.',
);

console.log('Explore analysis Route Preview action checks passed.');
