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
  mapRenderer.includes("'ecs-remote-forecast-line'") && mapRenderer.includes('[1.4, 1.2]'),
  'MapRenderer should add a dashed forecast line layer.',
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
  navigate.includes('toggleRemotenessOverlay') && navigate.includes('REMOTENESS'),
  'Navigate Tools should expose a Remoteness toggle.',
);
assert(
  navigate.includes('buildRemoteMapOverlay') && navigate.includes('remoteOverlay={remotenessMapOverlay}'),
  'Navigate should build and pass the remoteness map overlay payload.',
);
assert(
  navigate.includes('remotenessOverlayHasVisibleLayer') &&
    navigate.includes('REMOTENESS CORRIDOR') &&
    navigate.includes('REMOTENESS OVERLAY UNAVAILABLE'),
  'Navigate should only report the remoteness overlay active when a visible layer can render.',
);
assert(
  overlayBuilder.includes('MAX_HEATMAP_AREAS = 48') &&
    overlayBuilder.includes('MAX_FORECAST_SEGMENTS = 12'),
  'Remoteness map overlay builder should bound generated features for WebView performance.',
);
assert(
  overlayBuilder.includes("export function remoteLabelForScore") &&
    overlayBuilder.includes("export function forecastSignalForLabel"),
  'Remoteness map overlay builder should expose deterministic label and forecast mapping.',
);

console.log('Navigate remoteness map layer checks passed.');
