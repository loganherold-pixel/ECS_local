const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mapRenderer = read('components/navigate/MapRenderer.tsx');
const navigate = read('app/(tabs)/navigate.tsx');
const overlayBuilder = read('lib/remote/mapOverlay.ts');

assert(
  mapRenderer.includes("ensureSource('ecs-remote-v1'"),
  'MapRenderer should register the ecs-remote-v1 remoteness source.',
);
assert(
  mapRenderer.includes("ensureSource('ecs-remote-forecast-v1'"),
  'MapRenderer should register a separate forecast line source.',
);
assert(
  mapRenderer.includes("'ecs-remote-heatmap-fill'"),
  'MapRenderer should add the remoteness heatmap fill layer.',
);
assert(
  mapRenderer.includes("'ecs-remote-forecast-line'") &&
    mapRenderer.includes("ensureLineLayer('ecs-remote-forecast-halo-line', 'ecs-remote-forecast-v1'") &&
    mapRenderer.includes('REMOTE_FORECAST_VISIBLE_WIDTH') &&
    mapRenderer.includes('REMOTE_FORECAST_HALO_WIDTH'),
  'MapRenderer should add zoom-visible route-snapped remoteness forecast and halo layers.',
);
assert(
  mapRenderer.includes("ensureLineLayer('ecs-remote-forecast-line', 'ecs-remote-forecast-v1', ['get', 'color'], REMOTE_FORECAST_VISIBLE_WIDTH") &&
    overlayBuilder.includes('const BUFFER_DEGREES = 0.00125'),
  'Remoteness route corridor should render as a wider, readable corridor at full-route zoom.',
);
assert(
  overlayBuilder.includes('function remoteColorForLabel') &&
    overlayBuilder.includes("color: remoteColorForLabel(label)") &&
    overlayBuilder.includes("'D': '#5FD1FF'") &&
    overlayBuilder.includes("'C': '#65C97A'") &&
    overlayBuilder.includes("'B': '#F2C24D'") &&
    overlayBuilder.includes("'A': '#C66A4A'"),
  'Remoteness overlay forecast lines should preserve four visible colors for low, moderate, remote, and high remoteness.',
);
['#C66A4A', '#F2C24D', '#65C97A', '#5FD1FF'].forEach((color) => {
  assert(mapRenderer.includes(color), `MapRenderer should include heatmap color stop ${color}.`);
});
assert(
  mapRenderer.includes('updateRemoteOverlay(payload.remoteOverlay || null)'),
  'MapRenderer should update remoteness data through the existing payload path.',
);
assert(
  navigate.includes('const [showRemotenessOverlay, setShowRemotenessOverlay] = useState(false)'),
  'Navigate remoteness overlay toggle should default OFF.',
);
assert(
  navigate.includes('toggleRemotenessOverlay') &&
    navigate.includes('testID="navigate-map-layer-remoteness-toggle"') &&
    navigate.includes('accessibilityLabel="Remoteness"') &&
    navigate.includes('accessibilityLabel="Map layers"'),
  'Navigate should expose Remoteness through the consolidated Map Layers control.',
);
assert(
  navigate.includes('buildRemoteMapOverlay') && navigate.includes('remoteOverlay={remotenessMapOverlay}'),
  'Navigate should build and pass the remoteness map overlay payload.',
);
const remotenessPayloadStart = navigate.indexOf('const remotenessMapOverlay = useMemo');
const remotenessPayloadEnd = navigate.indexOf('const remotenessOverlayAvailable', remotenessPayloadStart);
const remotenessPayloadSelector = navigate.slice(remotenessPayloadStart, remotenessPayloadEnd);
assert(
  navigate.includes('const DISABLED_REMOTENESS_MAP_OVERLAY: RemoteMapOverlayPayload') &&
    remotenessPayloadSelector.includes('if (!showRemotenessOverlay || !remotenessOverlayDataAvailable)') &&
    remotenessPayloadSelector.includes('return DISABLED_REMOTENESS_MAP_OVERLAY;') &&
    remotenessPayloadSelector.indexOf('return DISABLED_REMOTENESS_MAP_OVERLAY;') <
      remotenessPayloadSelector.indexOf('return buildRemoteMapOverlay({'),
  'A hidden remoteness layer must reuse one disabled payload and skip polygon generation entirely.',
);
assert(
  navigate.includes('const remotenessOverlayRouteAvailable = displayedRoutePoints.length > 1;') &&
    navigate.includes('remotenessOverlayRouteAvailable ||') &&
    navigate.includes('REMOTENESS CORRIDOR') &&
    navigate.includes('Remoteness needs an active or selected route'),
  'Navigate should enable the remoteness overlay for active route geometry and report when a visible layer can render.',
);
assert(
  navigate.includes('presentRemotenessLegendDisclosure') &&
    navigate.includes('activeGuidanceMeasuredHeight') &&
    navigate.includes('const activeGuidanceRenderedHeight =') &&
    navigate.includes('remotenessLegendTopOffset') &&
    navigate.includes('activeGuidanceRenderedHeight +') &&
    navigate.includes('onActiveGuidanceLayout={handleActiveGuidanceLayout}') &&
    navigate.includes('top: remotenessLegendTopOffset') &&
    navigate.includes('remotenessLegendDisclosureOpacity') &&
    navigate.includes('ECS is shading the active route corridor by expected signal confidence and isolation') &&
    navigate.includes('Remoteness corridor is turning off'),
  'Navigate should place the Remoteness Corridor key below active navigation and use it for the soft on/off explanation.',
);
assert(
  overlayBuilder.includes('MAX_HEATMAP_AREAS = 48') &&
    overlayBuilder.includes('MAX_FORECAST_SEGMENTS = 12') &&
    overlayBuilder.includes('remote-forecast-segment'),
  'Remoteness map overlay builder should bound generated features for WebView performance.',
);
assert(
  overlayBuilder.includes("export function remoteLabelForScore") &&
    overlayBuilder.includes("export function forecastSignalForLabel"),
  'Remoteness map overlay builder should expose deterministic label and forecast mapping.',
);

console.log('Navigate remoteness map layer checks passed.');
