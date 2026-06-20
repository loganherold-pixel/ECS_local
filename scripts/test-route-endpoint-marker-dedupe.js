const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const mapRendererSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const navigateSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'navigate.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

assert(
  mapRendererSource.includes('ROUTE_ENDPOINT_WAYPOINT_DEDUPE_METERS = 150'),
  'Route waypoint endpoint dedupe threshold should be explicit and field-sized.',
);

assert(
  mapRendererSource.includes('distanceMetersBetweenLngLat') &&
    mapRendererSource.includes('duplicatesRouteEndpoint') &&
    mapRendererSource.includes('continue;'),
  'Route waypoint rendering should suppress payload waypoints that duplicate rendered start/end markers.',
);

assert(
  mapRendererSource.includes("addWaypoint('route-start'") &&
    mapRendererSource.includes("addWaypoint('route-end'"),
  'MapRenderer should keep canonical start/end route markers.',
);

assert(
  mapRendererSource.includes('showTrailEntryEndpointMarker?: boolean;') &&
    mapRendererSource.includes('showTrailEntryEndpointMarker = false') &&
    mapRendererSource.includes('options: { showTrailEntryEndpointMarker?: boolean } = {}') &&
    mapRendererSource.includes('if (hasRoute && options.showTrailEntryEndpointMarker)'),
  'MapRenderer should only synthesize Trail entry when Navigate explicitly marks the route as GPS-to-trailhead approach guidance.',
);

assert(
  mapRendererSource.includes("endpointRole: 'trail_entry'") &&
    mapRendererSource.includes("endpointRole: 'trail_end'") &&
    mapRendererSource.includes("subtitle: 'The trail begins here.'") &&
    mapRendererSource.includes("subtitle: 'Route guidance end.'"),
  'Route endpoint waypoints should carry tappable trail-entry/end copy for active guidance hints.',
);

assert(
  mapRendererSource.includes('function waypointMarkerClass') &&
    mapRendererSource.includes("marker-waypoint-entry") &&
    mapRendererSource.includes("marker-waypoint-end") &&
    mapRendererSource.includes("replaceMarkers(waypointMarkers, payload.waypoints || [], waypointMarkerClass, 'waypoint')"),
  'Route endpoint waypoint markers should render with role-aware entry/end styling.',
);

assert(
  mapRendererSource.includes('.marker-waypoint-entry') &&
    mapRendererSource.includes('background: rgba(242, 194, 77, 0.16)') &&
    mapRendererSource.includes('.marker-waypoint-end'),
  'Trail entry should render as a transparent route endpoint marker while trail end stays visually anchored.',
);

assert(
  navigateSource.includes('if (roadRoutePoints.length > 1) {\n      return explorePreviewWaypoints;\n    }') &&
    !navigateSource.includes('? roadRouteWaypoints\n        : activeRunWaypointList'),
  'Navigate should not pass the road destination waypoint when route geometry already provides the canonical route endpoint marker.',
);

assert(
  navigateSource.includes('const showTrailEntryEndpointMarker = useMemo(() =>') &&
    navigateSource.includes("fullRouteGuidanceModel.startSource === 'road_approach'") &&
    navigateSource.includes('fullRouteGuidanceModel.transitionRouteIndex != null') &&
    navigateSource.includes('showTrailEntryEndpointMarker={showTrailEntryEndpointMarker}'),
  'Navigate should request the translucent Trail entry marker only for GPS-to-trailhead approach guidance.',
);

console.log('Route endpoint marker dedupe checks passed');
