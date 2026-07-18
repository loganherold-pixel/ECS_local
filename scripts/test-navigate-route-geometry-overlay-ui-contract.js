const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');

assert(
  source.includes('const [routeGeometryOverlayEnabled, setRouteGeometryOverlayEnabled] = useState(false);') &&
    source.includes('const [selectedRouteCatalogViewportFeatureId, setSelectedRouteCatalogViewportFeatureId]') &&
    source.includes('const [mvumOverlayEnabled, setMvumOverlayEnabled]'),
  'Navigate must keep ECS whole-route selection separate from MVUM overlay state.',
);

assert(
  source.includes('const routeCatalogViewportSelection = useMemo') &&
    source.includes('resolveRouteCatalogViewportSelection(') &&
    source.includes('routeCatalogViewportSelection?.overlaySegmentIds ?? []') &&
    source.includes('routeCatalogViewportFeaturesToRouteGeometrySegments('),
  'The ECS overlay presentation must derive every selected line part from one stable route selection.',
);

assert(
  source.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments, ...routeGeometryOverlaySegments]') &&
    source.includes('mvumOverlay={navigateMvumMapOverlay}'),
  'ECS routes and MVUM segments must reach MapRenderer through distinct mounted payloads.',
);

const routeGeometryButton = source.indexOf('testID="navigate-map-layer-route-geometry-toggle"');
const mvumButton = source.indexOf('testID="navigate-map-layer-mvum-toggle"');
assert(routeGeometryButton >= 0, 'ECS Route Geometry switch should live in the mounted Map Layers menu.');
assert(mvumButton >= 0, 'MVUM switch should remain independently selectable in the Map Layers menu.');
assert(
  source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes('checked: routeGeometryOverlayEnabled') &&
    source.slice(mvumButton - 900, mvumButton + 900).includes('checked: mvumOverlayEnabled') &&
    source.includes('resolveNavigateRouteOverlayToggle(') &&
    source.includes("'exclusive_overlay_switch'"),
  'Each overlay switch must expose its own accessible checked state.',
);

const routeTapStart = source.indexOf('const handleRouteGeometrySegmentTap = useCallback');
const mvumBuildStart = source.indexOf('const handleBuildMvumStitchedRoute = useCallback', routeTapStart);
const routeTapHandler = source.slice(routeTapStart, mvumBuildStart);
assert(
  routeTapStart >= 0 &&
    routeTapHandler.includes('resolveRouteCatalogViewportSelection(') &&
    routeTapHandler.includes('setSelectedRouteCatalogViewportFeatureId(selection.routeId)') &&
    routeTapHandler.includes('ECS SUGGESTED ROUTE SELECTED') &&
    !routeTapHandler.includes('setSelectedMvumSegmentIds') &&
    !routeTapHandler.includes('routeGeometrySegmentToRouteBuilderSegment'),
  'A route tap must replace the whole ECS route selection without toggling MVUM/custom builder segments.',
);

assert(
  source.includes('selectedRouteCatalogViewportFeature ? (') &&
    source.includes('testID="navigate-ecs-route-save"') &&
    source.includes('testID="navigate-ecs-route-start-guidance"') &&
    source.includes('SAVE ROUTE') &&
    source.includes('NAVIGATE TO ROUTE'),
  'Selecting an ECS route must expose the requested Save and GPS Navigate actions.',
);
assert(
  source.includes('disabled={\n                  !selectedRouteCatalogViewportFeature.properties.guidanceReady') &&
    source.includes('!safeUserLocation') &&
    source.includes('accessibilityLabel="Navigate from GPS to selected ECS route"'),
  'Guidance readiness and GPS availability must truthfully gate actions without hiding the route.',
);

assert(
  source.includes('<Text style={styles.routeGeometryOverlayLegendTitle}>ECS ROUTE GEOMETRY</Text>') &&
    source.includes('<Text style={styles.routeGeometryOverlayLegendTitle}>MVUM SEGMENTS</Text>') &&
    source.includes('ECS geometry is planning/reference geometry.') &&
    source.includes('MVUM geometry is planning/reference data.'),
  'The two overlays must retain distinct status and safety language.',
);

assert(
  source.includes(`showToast(\`ZOOM TO \${ROUTE_CATALOG_VIEWPORT_MIN_ZOOM}+ TO SHOW ECS CATALOG ROUTES\`)`) &&
    source.includes(`showToast(\`ZOOM TO \${MVUM_OVERLAY_MIN_ZOOM}+ TO SHOW MVUM SEGMENTS\`)`),
  'Each overlay should explain its independent zoom eligibility.',
);

assert(
  !source.includes("sourceKind: 'mapbox_base'") &&
    !source.includes("sourceKind: 'rendered_feature'"),
  'Navigate must not synthesize authoritative ECS routes from rendered basemap features.',
);

console.log('Navigate ECS route geometry overlay UI contract checks passed.');
