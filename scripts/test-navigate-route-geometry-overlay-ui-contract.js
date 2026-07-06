const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes("from '../../lib/navigateRouteGeometryOverlay'") &&
    !source.includes('buildRouteGeometryOverlaySegments') &&
    source.includes('routeGeometrySegmentToRouteBuilderSegment'),
  'Navigate should use route geometry for route-builder adapters without building a local Explorer/Favorite overlay inventory.',
);

assert(
  source.includes('const [routeGeometryOverlayEnabled, setRouteGeometryOverlayEnabled] = useState(false);') &&
    source.includes('const [selectedRouteGeometrySegmentIds, setSelectedRouteGeometrySegmentIds] = useState<string[]>([])'),
  'Navigate should keep route geometry overlay toggle and selected segment ids in local state.',
);

assert(
  source.includes('const routeGeometryOverlayBuild = useMemo') &&
    source.includes('const routeGeometryOverlaySegments = useMemo') &&
    !source.includes('routeGeometryOverlaySourceSummary') &&
    !source.includes('loaded from ${routeGeometryOverlaySourceSummary}'),
  'Navigate should memoize viewport ECS route geometry without showing Explorer/Favorite source-count copy.',
);

assert(
  source.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments, ...routeGeometryOverlaySegments]'),
  'Route geometry overlay segments should merge into MapRenderer segments alongside existing Explore route overlays.',
);

const railStart = source.indexOf('styles.rightFloatingRail');
const routeGeometryButton = source.indexOf('accessibilityLabel="Route geometry overlay"', railStart);
const remotenessButton = source.indexOf('accessibilityLabel="Remoteness map overlay"', railStart);
assert(railStart >= 0, 'Navigate right floating rail should exist.');
assert(routeGeometryButton > railStart, 'Route geometry overlay switch should live in the right floating rail.');
assert(remotenessButton > routeGeometryButton, 'Route geometry overlay switch should sit above Remoteness.');
assert(
  source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes("name=\"git-branch-outline\"") &&
    source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes('accessibilityRole="switch"') &&
    source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes('checked: routeGeometryOverlayEnabled') &&
    source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes('testID="navigate-route-geometry-overlay-toggle"') &&
    source.slice(routeGeometryButton - 900, routeGeometryButton + 900).includes("accessibilityValue={{ text: routeGeometryOverlayEnabled ? 'on' : 'off' }}"),
  'Route geometry switch should use the git-branch icon and switch accessibility state.',
);

assert(
  source.includes('const handleMapSegmentTap = useCallback') &&
    source.includes("segment?.kind === 'route_geometry_segment'") &&
    source.includes("segment?.kind === 'explore_route'") &&
    source.includes('handleRouteGeometrySegmentTap(segment)') &&
    source.includes('handleExploreRouteSegmentTap(segment)'),
  'Navigate should dispatch route geometry and Explore route segment taps through a shared map segment handler.',
);

assert(
  source.includes('END ACTIVE NAVIGATION TO BUILD FROM ROUTE GEOMETRY') &&
    source.includes('routeGeometrySegmentToRouteBuilderSegment(match)') &&
    source.includes('setSelectedRouteGeometrySegmentIds') &&
    source.includes('ECS TRAIL SEGMENT ADDED') &&
    source.includes('ECS TRAIL SEGMENT REMOVED'),
  'Route geometry taps should toggle Build Route trail segments with simple source-free user copy.',
);

assert(
  source.includes('routeGeometryOverlayLegend') &&
    source.includes('ECS ROUTE GEOMETRY') &&
    source.includes('ECS trail segment') &&
    source.includes('planning/reference geometry') &&
    source.includes('Verify access, closures, and posted rules before travel.'),
  'Navigate should render a compact viewport trail-segment legend/status strip with safety copy.',
);

assert(
  source.includes('const handlePlanRouteBuilderDraft = useCallback') &&
    source.includes("sourceApp: 'ecs_route_geometry_overlay'") &&
    source.includes('saveTripBuilderRouteHandoff') &&
    source.includes("router.push({\n      pathname: '/explore-trip-builder'") &&
    source.includes('>PLAN</Text>'),
  'Build Route status actions should expose a PLAN action that saves ECS geometry routes into Trip Builder.',
);

assert(
  !source.includes("sourceKind: 'mapbox_base'") &&
    !source.includes("sourceKind: 'rendered_feature'"),
  'Navigate should not create route geometry overlay sources from raw Mapbox/rendered base features.',
);

console.log('Navigate route geometry overlay UI contract checks passed.');
