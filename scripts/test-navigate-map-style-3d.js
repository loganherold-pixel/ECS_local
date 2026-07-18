/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const mapConfig = read('lib', 'mapConfig.ts');
const mapStyleIdentity = read('lib', 'mapStyleIdentity.ts');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const mapRenderer = read('components', 'navigate', 'MapRenderer.tsx');
const offlineCacheModal = read('components', 'navigate', 'OfflineCacheModal.tsx');
const offlineReadiness = read('lib', 'offlineReadinessPresentation.ts');
const offlineRouteCacheService = read('lib', 'offlineRouteCacheService.ts');
const tileCacheStore = read('lib', 'tileCacheStore.ts');

assert(
  mapStyleIdentity.includes("export type MapStyleKey = 'ecs' | 'tactical' | 'satellite' | '3d'"),
  'MapStyleKey should include the 3D style key.',
);
assert(
  mapConfig.includes("key: '3d'") &&
    mapConfig.includes("shortLabel: '3D'") &&
    mapConfig.includes("mapbox://styles/expeditioncommand/cmonsduoz000b01spgl7bepey"),
  'MAP_STYLES should define the 3D style with the ECS Mapbox URL.',
);
assert(
  mapConfig.includes("export const MAPBOX_3D_STYLE_URL =") &&
    mapConfig.includes("export const MAPBOX_3D_RENDER_BASE_STYLE_URL = 'mapbox://styles/mapbox/satellite-streets-v12'") &&
    mapConfig.includes('renderUrl: MAPBOX_3D_RENDER_BASE_STYLE_URL') &&
    mapConfig.includes('return def.renderUrl || def.url;'),
  'Live 3D rendering should resolve to a stable Mapbox base style while preserving the ECS 3D style identity.',
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
  mapRenderer.includes('MAPBOX_3D_RENDER_BASE_STYLE_URL') &&
    mapRenderer.includes('const MAPBOX_3D_TERRAIN_SOURCE_ID') &&
    mapRenderer.includes('mapStyleKey: MapStyleKey') &&
    mapRenderer.includes('mapStyleKey: props.mapStyle || DEFAULT_MAP_STYLE') &&
    mapRenderer.includes("payload.mapStyleKey === '3d'") &&
    mapRenderer.includes('map.addSource(terrainSourceId') &&
    mapRenderer.includes('map.setTerrain({ source: terrainSourceId') &&
    mapRenderer.includes('map.setTerrain(null)') &&
    mapRenderer.includes('applyTerrainForMapStyle(activeMapStyleKey)'),
  'MapRenderer should render 3D on a stable base map and layer Mapbox terrain additively.',
);
assert(
  mapRenderer.includes('function replayPendingPayloadAfterStyleChange(reason, attempt)') &&
    mapRenderer.includes("mapListenerRegistry.attach('style.load'") &&
    mapRenderer.includes("replayPendingPayloadAfterStyleChange('style_load', 0)") &&
    mapRenderer.includes("mapListenerRegistry.attach('styledata'") &&
    mapRenderer.includes("replayPendingPayloadAfterStyleChange('styledata', 0)") &&
    mapRenderer.includes('lastReplayedStyleGeneration === styleGeneration') &&
    !mapRenderer.includes("replayPendingPayloadAfterStyleChange('set_style', 0)"),
  'MapRenderer should replay active route payloads once after the definitive Day/Tac/Sat/3D style generation loads.',
);
assert(
  mapRenderer.includes('setTimeout(function() { replayPendingPayloadAfterStyleChange(reason, attempt + 1); },') &&
    mapRenderer.includes('applyPayload(pendingPayload);') &&
    mapRenderer.includes('applyRouteOverlayPayload(payload);'),
  'MapRenderer style replay should retry until style readiness and then restore every current payload source through the canonical payload adapter.',
);
assert(
  offlineReadiness.includes('Map style ${mapStyleLabel(current.mapStyle') &&
    offlineReadiness.includes('is not cached for this route.'),
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
