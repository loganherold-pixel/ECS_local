const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const mapRendererSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
  'utf8',
);
const navigateSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'navigate.tsx'),
  'utf8',
);

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
  navigateSource.includes('if (roadRoutePoints.length > 1) {\n      return explorePreviewWaypoints;\n    }') &&
    !navigateSource.includes('? roadRouteWaypoints\n        : activeRunWaypointList'),
  'Navigate should not pass the road destination waypoint when route geometry already provides the canonical route endpoint marker.',
);

console.log('Route endpoint marker dedupe checks passed');
