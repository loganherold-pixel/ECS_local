const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const routeCard = read('components/discover/AIRouteCard.tsx');
const routePreview = read('components/discover/AIRoutePreviewModal.tsx');
const enrichedCard = read('components/discover/EnrichedRouteCard.tsx');
const discoveryIntel = read('lib/discoveryIntelligenceEngine.ts');
const campCard = read('components/navigate/CampIntelDetailCard.tsx');
const campSelectors = read('lib/campIntel/campIntelSelectors.ts');
const guidanceOverlay = read('components/navigate/RoadNavigationOverlay.tsx');
const offlineCard = read('components/navigate/RouteTileCacheCard.tsx');

assert(
  discoveryIntel.includes('function getRouteLabelDisplay') &&
    discoveryIntel.includes("label === 'ECS Suggested' ? 'ECS-Inferred'"),
  'Explore should derive ECS-Inferred display copy from the existing route label.',
);

assert(
  routeCard.includes('getRouteLabelDisplay') &&
    routePreview.includes('getRouteLabelDisplay') &&
    enrichedCard.includes('getRouteLabelDisplay'),
  'Explore cards and preview should use derived route-label display copy.',
);

assert(
  routePreview.includes('VEHICLE FIT:') &&
    enrichedCard.includes('Vehicle Fit') &&
    discoveryIntel.includes("label: 'Vehicle Fit'") &&
    !routePreview.includes('VEHICLE MATCH:'),
  'Explore route details should label existing vehicle assessment as Vehicle Fit.',
);

assert(
  routePreview.includes('ROUTE CONFIDENCE:') &&
    routePreview.includes('This ECS-Inferred route is based on geographic data'),
  'Route preview should surface Route Confidence and ECS-Inferred language.',
);

assert(
  guidanceOverlay.includes("'Start Guidance'") &&
    guidanceOverlay.includes('Guidance inactive until you start guidance.'),
  'Start Guidance copy should be used for preview actions.',
);

assert(
  campCard.includes('Latest Evidence') &&
    campCard.includes('Last Field Report') &&
    campCard.includes('ECS-Inferred') &&
    campCard.includes('Location / Latest Evidence') &&
    !campCard.includes('Location / Source'),
  'Camp Intel should use dispersed-candidate evidence terminology.',
);

assert(
  campSelectors.includes("'Land-Use Confidence'") &&
    campSelectors.includes('restriction signals') &&
    campSelectors.includes('Restriction signal reduced') &&
    !campSelectors.includes("'Legal access'") &&
    !campSelectors.includes('Compliance confidence reduced'),
  'Camp Intel selectors should use land-use/restriction signal terminology.',
);

assert(
  offlineCard.includes('OFFLINE READINESS') &&
    offlineCard.includes('OFFLINE READY') &&
    offlineCard.includes('PREPARE OFFLINE') &&
    offlineCard.includes('READINESS') &&
    offlineCard.includes('CLEAR READINESS'),
  'Route tile cache card should present existing cache state as Offline Readiness.',
);

console.log('explore guidance camp intel UX checks passed');
