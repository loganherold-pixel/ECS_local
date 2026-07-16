const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypescriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output.outputText, filename);
  return loaded.exports;
}

const {
  resolveMapSurfaceInitializationState,
  shouldUseMapSurfaceStandby,
} = loadTypescriptModule('lib/mapSurfaceCoordinator.ts');

const baseStandbyInput = {
  hasMapConfiguration: true,
  surfaceMode: 'compact',
  motionPriority: 'warm',
  interactive: true,
  standbyDisabled: false,
  hasLiveLocation: false,
  hasOperationalOverlay: false,
};

assert.strictEqual(
  shouldUseMapSurfaceStandby(baseStandbyInput),
  true,
  'Secondary warm compact surfaces may retain the existing bounded standby optimization.',
);
assert.strictEqual(
  shouldUseMapSurfaceStandby({ ...baseStandbyInput, standbyDisabled: true }),
  false,
  'The canonical Navigate base map must mount even while permission and live location are unknown.',
);
assert.strictEqual(
  shouldUseMapSurfaceStandby({ ...baseStandbyInput, standbyDisabled: true, hasLiveLocation: true }),
  false,
  'Granting location must not replace or remount the already-live primary base map.',
);

const baseInitialization = {
  configurationLoading: false,
  hasMapConfiguration: true,
  liveMapDisabled: false,
  standbyActive: false,
  motionPriority: 'warm',
  rendererReady: false,
  rendererWasReady: false,
  rendererFailed: false,
  hasFallbackSurface: false,
  retryAvailable: true,
};

const initializationCases = [
  [{ ...baseInitialization, configurationLoading: true, hasMapConfiguration: false }, 'initializing'],
  [{ ...baseInitialization, hasMapConfiguration: false }, 'configuration_error'],
  [{ ...baseInitialization, rendererReady: true }, 'ready'],
  [{ ...baseInitialization, rendererWasReady: true }, 'ready'],
  [{ ...baseInitialization, rendererFailed: true }, 'retryable_error'],
  [{ ...baseInitialization, rendererFailed: true, retryAvailable: false }, 'unavailable'],
  [{ ...baseInitialization, rendererFailed: true, hasFallbackSurface: true }, 'degraded'],
  [{ ...baseInitialization, liveMapDisabled: true }, 'disabled'],
];

for (const [input, expected] of initializationCases) {
  assert.strictEqual(resolveMapSurfaceInitializationState(input), expected);
}

assert.strictEqual(
  resolveMapSurfaceInitializationState(baseInitialization),
  'initializing',
  'An active renderer attempt is the only nonterminal initialization state.',
);
assert.strictEqual(
  resolveMapSurfaceInitializationState({ ...baseInitialization, rendererReady: true }),
  'ready',
  'A definitive style/base-map load reaches ready.',
);
assert.strictEqual(
  resolveMapSurfaceInitializationState({ ...baseInitialization, rendererReady: false }),
  'initializing',
  'A style reload can re-enter bounded initialization without putting primary Navigate in standby.',
);

const mapRenderer = fs.readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8');
const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const gpsOverlay = fs.readFileSync(path.join(root, 'components', 'navigate', 'GPSStatusOverlay.tsx'), 'utf8');

assert.match(mapRenderer, /resolveMapSurfaceInitializationState\(\{/);
assert.match(mapRenderer, /shouldUseMapSurfaceStandby\(\{/);
assert.match(mapRenderer, /onBootStateChange\?\.\(bootPresentationState\)/);
assert.match(
  mapRenderer,
  /performanceSurface === 'navigate' \|\|[\s\S]*?compactRetryCountRef\.current >= 2/,
  'Primary Navigate must remain in its terminal error state until the user activates Retry map.',
);
assert.match(mapRenderer, /label="Retry live map"/);
assert.match(mapRenderer, /label="Retry map"/);
assert.match(navigate, /standbyMapDisabled=\{true\}/);
assert.match(
  navigate,
  /gps\.rawGPS\.permissionState !== 'granted' \|\| !gps\.rawGPS\.isAvailable/,
  'A retained coordinate must not be presented as a live map location after permission or service loss.',
);
assert.doesNotMatch(
  navigate,
  /const stableMapSurface = useMemo\(\(\) => \{\s*if \(!hasToken\)/,
  'Missing configuration must reach MapRenderer configuration_error instead of a parent spinner.',
);
assert.match(navigate, /mapBootState === 'configuration_error'/);
assert.match(navigate, /mapBootState === 'retryable_error'/);
assert.match(gpsOverlay, /label=\{canOpenNativeSettings \? 'OPEN SETTINGS' : 'RETRY PERMISSION'\}/);
assert.doesNotMatch(gpsOverlay, /accessibilityViewIsModal/);
assert.match(gpsOverlay, /Platform\.OS === 'web' \? 'web' : 'native'/);

console.log('Navigate map surface behavior and terminal presentation checks passed');
