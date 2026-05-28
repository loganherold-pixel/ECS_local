const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mapPath = path.join(root, 'components', 'convoy', 'ConvoyCommandMap.tsx');
const fallbackPath = path.join(root, 'components', 'convoy', 'ConvoyMapFallback.tsx');
const markerPath = path.join(root, 'components', 'convoy', 'ConvoyMemberMarker.tsx');
const identityPath = path.join(root, 'lib', 'convoy', 'convoyMarkerIdentity.ts');
const packagePath = path.join(root, 'package.json');
const mapboxLoaderPath = path.join(root, 'lib', 'mapbox', 'rnMapboxModule.ts');
const mapboxConfigPath = path.join(root, 'lib', 'mapbox', 'mapboxConfig.ts');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadTsModule(filePath) {
  const source = read(filePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filePath,
  });
  const mod = new Module(filePath, module);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(output.outputText, filePath);
  return mod.exports;
}

const mapSource = read(mapPath);
const fallbackSource = read(fallbackPath);
const markerSource = read(markerPath);
const identitySource = read(identityPath);
const mapboxLoaderSource = read(mapboxLoaderPath);
const mapboxConfigSource = read(mapboxConfigPath);
const { buildConvoyMarkerIdentity, buildConvoyMarkerIdentities } = loadTsModule(identityPath);

assert.ok(
  mapSource.includes('loadRnMapboxModule') &&
    mapboxLoaderSource.includes("require('@rnmapbox/maps')") &&
    mapboxLoaderSource.includes('isRnMapboxNativeModuleAvailable') &&
    mapboxLoaderSource.includes('if (!isRnMapboxNativeModuleAvailable())') &&
    !mapSource.includes("import('@rnmapbox/maps')"),
  'ConvoyCommandMap should use the guarded synchronous Mapbox loader and avoid requiring native Mapbox when unavailable.',
);
assert.ok(
  mapSource.includes('initializeMapboxAccessToken'),
  'ConvoyCommandMap should initialize the Mapbox access token through the shared config helper.',
);
assert.ok(
  mapboxConfigSource.includes('getMapboxPublicTokenStatus') &&
    mapboxConfigSource.includes('getMapboxTokenSync'),
  'Native Mapbox config should expose shared Mapbox token status from the shared resolver.',
);
assert.ok(
  mapSource.includes('<ConvoyMapFallback'),
  'ConvoyCommandMap should render tactical fallback when Mapbox is unavailable.',
);
assert.ok(
  fallbackSource.includes('No live convoy locations yet.'),
  'Fallback should include the required no-live-members empty state copy.',
);
assert.ok(
  fallbackSource.includes('shared Mapbox runtime token') &&
    fallbackSource.includes('@rnmapbox/maps'),
  'Fallback should reference the shared runtime token resolver and native Mapbox build requirement.',
);
assert.ok(
  mapSource.includes('Mapbox.UserLocation'),
  'ConvoyCommandMap should render the user location puck where supported.',
);
assert.ok(
  mapSource.includes('showMapWhenEmpty') &&
    mapSource.includes('followUserLocation={shouldFollowUser}') &&
    mapSource.includes('convoy-active-route-source') &&
    mapSource.includes('Mapbox.LineLayer'),
  'ConvoyCommandMap should support the Dispatch TAC map before convoy members exist, show the active route line when supplied, and avoid automatic user-location snap.',
);
assert.ok(
  mapSource.includes('Mapbox.ShapeSource') &&
    mapSource.includes('Mapbox.CircleLayer') &&
    mapSource.includes('Mapbox.SymbolLayer'),
  'ConvoyCommandMap should render convoy members from GeoJSON with point and label layers.',
);
assert.ok(
  mapSource.includes("textField: ['get', 'label']") &&
    identitySource.includes('isUnsafePersonalLabel') &&
    identitySource.includes("return 'LEAD'") &&
    identitySource.includes("return 'SWEEP'"),
  'ConvoyCommandMap should label markers by operational callsign identity instead of raw member display names.',
);
assert.ok(
  mapSource.includes("['==', ['get', 'role'], 'lead']") &&
    mapSource.includes("['==', ['get', 'role'], 'sweep']") &&
    mapSource.includes("['==', ['get', 'role'], 'scout']") &&
    mapSource.includes("['==', ['get', 'role'], 'medic']") &&
    mapSource.includes("['==', ['get', 'role'], 'recovery']") &&
    mapSource.includes("['==', ['get', 'role'], 'support']"),
  'ConvoyCommandMap should distinguish lead, sweep, scout, medic, recovery, support, and member roles.',
);
assert.ok(
  mapSource.includes("member.movementStatus === 'needs_assistance'") &&
    mapSource.includes("['get', 'offline']") &&
    mapSource.includes("['get', 'stale']") &&
    mapSource.includes("['get', 'delayed']"),
  'ConvoyCommandMap should visually distinguish assistance, offline, and stale states.',
);
assert.ok(
  mapSource.includes('iconImage: [\'get\', \'iconKey\']') &&
    mapSource.includes("textField: ['get', 'shapeGlyph']") &&
    mapSource.includes("textField: ['get', 'statusLabel']") &&
    mapSource.includes("textRotate: ['get', 'heading']"),
  'ConvoyCommandMap should drive marker icons, labels, status badges, and heading chevrons from GeoJSON properties.',
);
assert.ok(
  mapSource.includes('fitBounds') && mapSource.includes('hasFitInitialCameraRef'),
  'ConvoyCommandMap should fit camera to the default convoy view on first load.',
);
assert.ok(
  mapSource.includes('cameraStateRef.current') &&
    mapSource.includes('const targetBounds = latestHasRouteLine ? latestRouteBounds : latestBounds') &&
    mapSource.includes('if (!latestHasRouteLine && membersLength === 1)') &&
    mapSource.includes('lastCameraResetKeyRef.current === cameraResetKey') &&
    mapSource.includes('routeCoordinateSignature') &&
    mapSource.includes('lastRouteCameraSignatureRef.current === routeSignature'),
  'ConvoyCommandMap should prefer full route bounds, allow explicit reset keys, refit when route geometry appears, and avoid refitting on routine member updates.',
);
assert.ok(
  mapSource.includes('onRecenter') &&
    mapSource.includes('compass-outline') &&
    mapSource.includes('Recenter convoy map to full route'),
  'ConvoyCommandMap should expose a manual compass recenter control that returns to the full route view.',
);
assert.ok(
  mapSource.includes('showStatusSummary = false') && mapSource.includes('showStatusSummary ?'),
  'ConvoyCommandMap should keep the redundant status summary overlay off by default while retaining an opt-in path.',
);
assert.ok(
  mapSource.includes('activeCount') &&
    mapSource.includes('staleCount') &&
    mapSource.includes('assistanceCount') &&
    mapSource.includes('formatLastUpdate'),
  'ConvoyCommandMap should include compact bottom summary card metrics.',
);
assert.ok(
  mapSource.includes('accessibilityLabel={`Convoy Command map.') &&
    fallbackSource.includes('accessibilityLabel={`Convoy map fallback.'),
  'Map and fallback should expose accessible summaries.',
);
assert.ok(
  markerSource.includes('ConvoyMemberMarker') && markerSource.includes('accessibilityLabel'),
  'ConvoyMemberMarker should be reusable and accessible.',
);
assert.ok(
  identitySource.includes('memberId: string') &&
    identitySource.includes('vehicleBadge?: string') &&
    identitySource.includes('headingDegrees?: number') &&
    identitySource.includes('speedMph?: number') &&
    identitySource.includes('lastUpdatedAt: string') &&
    identitySource.includes('iconKey: string') &&
    identitySource.includes('label: string'),
  'Convoy marker identity should expose the required UI model fields.',
);
assert.ok(
  !mapSource.includes('profile') &&
    !mapSource.includes('phone') &&
    !mapSource.includes('email') &&
    !mapSource.includes('console.log'),
  'Convoy marker rendering should avoid profile images, contact data, and coordinate logging.',
);

const sampleUpdatedAt = new Date(Date.now() - 12 * 60 * 1000).toISOString();
const leadIdentity = buildConvoyMarkerIdentity({
  memberId: 'lead-1',
  callsign: 'Logan Smith',
  role: 'lead',
  latitude: 38,
  longitude: -121,
  accuracyMeters: null,
  headingDegrees: 42,
  speedMps: 8,
  movementStatus: 'moving',
  capturedAt: sampleUpdatedAt,
  updatedAt: sampleUpdatedAt,
  isStale: false,
  staleness: 'fresh',
  staleReason: null,
}, 0);
assert.strictEqual(leadIdentity.callsign, 'LEAD', 'Lead should render as LEAD when raw callsign looks like a real name.');
assert.strictEqual(leadIdentity.role, 'lead');
assert.strictEqual(leadIdentity.iconKey, 'convoy-lead-diamond');
assert.strictEqual(leadIdentity.shouldShowHeading, true);

const identities = buildConvoyMarkerIdentities([
  {
    memberId: 'sweep-1',
    callsign: 'Sweep',
    role: 'sweep',
    latitude: 38,
    longitude: -121,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'stopped',
    capturedAt: sampleUpdatedAt,
    updatedAt: sampleUpdatedAt,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  },
  {
    memberId: 'me',
    callsign: 'V3',
    role: 'member',
    latitude: 38,
    longitude: -121,
    accuracyMeters: null,
    headingDegrees: 90,
    speedMps: 0,
    movementStatus: 'stopped',
    capturedAt: sampleUpdatedAt,
    updatedAt: sampleUpdatedAt,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  },
  {
    memberId: 'assist',
    callsign: 'Recovery',
    role: 'support',
    latitude: 38,
    longitude: -121,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'needs_assistance',
    capturedAt: sampleUpdatedAt,
    updatedAt: sampleUpdatedAt,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  },
  {
    memberId: 'offline',
    callsign: 'Chris Doe',
    role: 'member',
    latitude: 38,
    longitude: -121,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'offline',
    capturedAt: sampleUpdatedAt,
    updatedAt: sampleUpdatedAt,
    isStale: true,
    staleness: 'stale',
    staleReason: 'Location update is stale.',
  },
], 'me');
assert.strictEqual(identities[0].callsign, 'SWEEP', 'Sweep should render as SWEEP.');
assert.strictEqual(identities[1].label, 'YOU', 'Current user should receive a single YOU identity without duplicating callsign text.');
assert.ok(
  mapSource.includes("label: identity.isCurrentUser ? '' : identity.label"),
  'Current user marker should rely on visual ring/color treatment and suppress the below-marker map label.',
);
assert.strictEqual(identities[1].shouldShowHeading, false, 'Heading arrow should hide near zero speed.');
assert.strictEqual(identities[2].status, 'needs_assistance', 'Needs assistance should receive emergency status.');
assert.strictEqual(identities[2].iconKey, 'convoy-assist', 'Needs assistance should receive emergency marker styling.');
assert.strictEqual(identities[3].status, 'offline', 'Offline markers should be distinguishable.');
assert.ok(identities[2].statusExplanation.includes('Needs assistance'), 'Assistance explanation should use user-facing copy.');
assert.ok(identities[3].statusExplanation.includes('Member offline'), 'Offline explanation should use user-facing copy.');
assert.ok(identitySource.includes('Location stale. Last known location'), 'Stale explanation should mention last known location.');
assert.ok(fallbackSource.includes('Location stale'), 'Fallback member status should say Location stale.');
assert.ok(fallbackSource.includes('Member offline'), 'Fallback member status should say Member offline.');
assert.notStrictEqual(identities[3].callsign, 'ChrisDoe', 'Real-looking names should not become default marker labels.');

const rawHexColors = [
  ...mapSource.matchAll(/#[0-9A-Fa-f]{3,8}/g),
  ...fallbackSource.matchAll(/#[0-9A-Fa-f]{3,8}/g),
  ...markerSource.matchAll(/#[0-9A-Fa-f]{3,8}/g),
];
assert.strictEqual(rawHexColors.length, 0, 'Convoy map components should use ECS theme tokens, not raw hex colors.');

const pkg = JSON.parse(read(packagePath));
assert.ok(pkg.scripts['test:convoy-command-map-component'], 'package.json should expose convoy command map component smoke test.');

console.log('convoy command map component checks passed');
