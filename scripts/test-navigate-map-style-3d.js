/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const mapConfig = read('lib', 'mapConfig.ts');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const mapRenderer = read('components', 'navigate', 'MapRenderer.tsx');
const offlineCacheModal = read('components', 'navigate', 'OfflineCacheModal.tsx');
const offlineReadiness = read('lib', 'offlineReadinessPresentation.ts');
const offlineRouteCacheService = read('lib', 'offlineRouteCacheService.ts');
const tileCacheStore = read('lib', 'tileCacheStore.ts');

assert(
  mapConfig.includes("export type MapStyleKey = 'ecs' | 'tactical' | 'satellite' | '3d'"),
  'MapStyleKey should include the 3D style key.',
);
assert(
  mapConfig.includes("key: '3d'") &&
    mapConfig.includes("shortLabel: '3D'") &&
    mapConfig.includes("mapbox://styles/expeditioncommand/cmonsduoz000b01spgl7bepey"),
  'MAP_STYLES should define the 3D style with the ECS Mapbox URL.',
);
assert(
  navigate.includes("type NavigateMapStyleMode = 'day' | 'tac' | 'sat' | '3d'"),
  'Navigate style mode type should include the 3D UI mode.',
);
assert(
  navigate.includes("stored === 'day' || stored === 'tac' || stored === 'sat' || stored === '3d'"),
  'Map style persistence should accept a stored 3D mode.',
);
assert(
  navigate.includes("{ key: '3d', label: '3D' }"),
  'Tools map style row should include a 3D button next to Day/Tac/Sat.',
);
assert(
  navigate.includes("if (mapStyleMode === '3d') return '3d';"),
  'Navigate should map the 3D UI mode to the canonical 3D MapStyleKey.',
);
assert(
  mapRenderer.includes('styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE)') &&
    mapRenderer.includes('() => getMapStyleUrl(mapStyle || DEFAULT_MAP_STYLE)'),
  'MapRenderer should continue resolving the active style through getMapStyleUrl.',
);
assert(
  offlineReadiness.includes('Map style ${current.mapStyle.toUpperCase()} is not cached for this route.'),
  'Offline readiness should keep style-specific cache mismatch reporting for 3D.',
);
assert(
  tileCacheStore.includes("styleKey === 'terrain' || styleKey === '3d'"),
  'Offline tile cache estimates should treat 3D as a distinct style identity.',
);
assert(
  tileCacheStore.includes('styles/v1/expeditioncommand/cmonsduoz000b01spgl7bepey/tiles/256') &&
    tileCacheStore.includes('getMapboxTokenSync()'),
  '3D offline tile downloads should use the ECS Mapbox style tile endpoint.',
);
assert(
  offlineRouteCacheService.includes("styleKey ? `style:${styleKey}` : 'style:unspecified'") &&
    offlineRouteCacheService.includes('routeMatchesCacheRequest('),
  'Route offline cache identity should include style so 3D does not overwrite Day/Tac/Sat route syncs.',
);
assert(
  offlineCacheModal.includes("{ key: '3d', label: '3D'") &&
    offlineCacheModal.includes("if (key === '3d') return '3D STYLE';") &&
    offlineCacheModal.includes('metricSecondary: styleLabel'),
  'Offline cache UI should create and display 3D style sync metadata distinctly.',
);

console.log('Navigate 3D map style checks passed.');
