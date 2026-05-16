const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const visibilityConfigPath = path.join(repoRoot, 'lib/campsites/campsiteVisibilityMapLayers.ts');
const navigatePath = path.join(repoRoot, 'app/(tabs)/navigate.tsx');

const visibilityConfig = fs.readFileSync(visibilityConfigPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function layerBlock(source, key) {
  const match = source.match(new RegExp(`\\{\\s*key: '${key}',[\\s\\S]*?defaultVisible: (true|false),[\\s\\S]*?\\}`));
  assert(match, `Missing campsite layer toggle for ${key}`);
  return match;
}

function assertDefaultVisible(key, expected) {
  const block = layerBlock(visibilityConfig, key);
  assert(
    block[1] === String(expected),
    `Expected ${key} defaultVisible to be ${expected}, found ${block[1]}`,
  );
}

assertDefaultVisible('community', true);
assertDefaultVisible('private', true);
assertDefaultVisible('group', true);
assertDefaultVisible('pending', false);
assertDefaultVisible('reviewer_pending', false);

assert(
  visibilityConfig.includes('DEFAULT_CAMPSITE_LAYER_VISIBILITY') &&
    visibilityConfig.includes('CAMPSITE_VISIBILITY_LAYER_TOGGLES.reduce'),
  'Default campsite layer visibility must derive from the shared toggle config.',
);

assert(
  navigateSource.includes("const CAMPSITE_LAYER_VISIBILITY_STORAGE_KEY = 'ecs_campsite_layer_visibility_v1';"),
  'Navigate campsite layer preference storage key is missing.',
);
assert(
  navigateSource.includes('normalizeCampsiteLayerVisibilityPreference') &&
    navigateSource.includes('const next = { ...DEFAULT_CAMPSITE_LAYER_VISIBILITY };') &&
    navigateSource.includes('typeof saved[key] === \'boolean\''),
  'Persisted campsite layer preferences must merge saved booleans over current defaults.',
);
assert(
  navigateSource.includes('readPersistedCampsiteLayerVisibility') &&
    navigateSource.includes('persistCampsiteLayerVisibility'),
  'Navigate must read and write campsite layer visibility preferences.',
);
assert(
  navigateSource.includes('campsiteLayerVisibilityTouchedRef.current') &&
    navigateSource.includes('setCampsiteLayerVisibility((prev) => {') &&
    navigateSource.includes('void persistCampsiteLayerVisibility(next);'),
  'Layer toggles must persist the user-selected state without forcing defaults every render.',
);
assert(
  navigateSource.includes('const isActive = campsiteLayerVisibility[layer.key];') &&
    navigateSource.includes('onPress={() => handleCampsiteLayerToggle(layer.key)}'),
  'Campsite layer buttons must read and mutate the shared campsiteLayerVisibility state.',
);

for (const key of ['community', 'private', 'group']) {
  assert(
    navigateSource.includes(`campsiteLayerVisibility.${key}`),
    `Map rendering and fetch logic must read campsiteLayerVisibility.${key}.`,
  );
}

assert(
  navigateSource.includes('Campsite visibility layers are marker/data overlays, not tile-cache layers.') &&
    navigateSource.includes('Campsite layers stay outside tile readiness until their data is cache-backed.'),
  'Offline readiness/cache boundary for campsite layers should be explicit.',
);

console.log('campsite layer defaults regression passed');
