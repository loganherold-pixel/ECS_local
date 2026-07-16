const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assertContains(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotContains(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertMatches(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function runtimeSources() {
  return ['app', 'components', 'lib', 'src']
    .flatMap((dir) => walk(path.join(root, dir)))
    .map((filePath) => ({
      absolute: filePath,
      relative: path.relative(root, filePath).replace(/\\/g, '/'),
      source: fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'),
    }));
}

const packageJson = JSON.parse(read('package.json'));
const discoverEngine = read('lib/discoverEngine.ts');
const exploreAuthority = read('lib/exploreRouteAuthority.ts');
const discoverScreen = read('app/(tabs)/discover.tsx');
const tripBuilder = read('app/explore-trip-builder.tsx');
const mockPowerConnector = read('src/power/connectors/MockPowerConnector.ts');
const dispatchInviteDomain = read('lib/dispatchInviteDomain.ts');
const expeditionInviteLocalAdapter = read('lib/expeditionInviteLocalAdapter.ts');
const dispatchDemoScenarios = read('lib/dispatchDemoScenarios.ts');
const dispatchCommandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');
const vehicleTelemetryStore = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const unifiedTelemetryStore = read('src/telemetry/ECSTelemetryStore.ts');
const telemetrySourceState = read('lib/telemetrySourceState.ts');
const bluetoothLiveTelemetry = read('lib/bluetoothLiveTelemetry.ts');
const unifiedConnections = read('lib/useUnifiedDeviceConnections.ts');
const bluestackPolicy = read('lib/bluestack/bluestackConnectionPolicy.ts');
const bluettiAdapter = read('lib/BluettiBluAdapter.ts');
const ankerAdapter = read('lib/AnkerSolixBluAdapter.ts');
const renogyAdapter = read('lib/RenogyBluAdapter.ts');

assert.strictEqual(
  packageJson.scripts['test:mock-demo-leakage-guards'],
  'node ./scripts/test-mock-demo-leakage-guards.js',
  'package script should expose the mock/demo leakage guard.',
);

assertContains(
  discoverEngine,
  "distanceFromUserSource?: 'live_gps' | 'default_location' | 'unknown'",
  'Explore route distances must keep default-location provenance separate from live GPS.',
);
assertContains(
  discoverEngine,
  "hasExplicitUserLocation ? 'live_gps' : 'default_location'",
  'Discover engine should label seed/default distances as default_location when GPS is unavailable.',
);
assertContains(
  discoverEngine,
  "geometrySource: 'ecs_demo_full_route_fixture'",
  'Demo suggested-route geometry must keep an explicit fixture source.',
);
assertContains(
  discoverEngine,
  "sourceLabel: 'ECS demo suggested-route geometry'",
  'Demo suggested-route geometry must have visible demo source copy.',
);
assertContains(
  discoverScreen,
  "hasGPSFix ? 'live_gps' : 'default_location'",
  'Explore screen should preserve default-location labeling when GPS is unavailable.',
);
assertContains(
  discoverScreen,
  "'seed_catalog_default_location'",
  'Explore seed catalog fallback should remain labeled as seed/default, not GPS-confirmed.',
);
assertContains(
  exploreAuthority,
  "return 'demo_fixture';",
  'Explore route authority should classify demo evidence as demo_fixture.',
);
assertContains(
  exploreAuthority,
  "notice: 'Demo fixture geometry supports ECS flow testing only and is not verified trail authority.'",
  'Demo fixture copy should not imply verified trail authority.',
);
assertContains(
  tripBuilder,
  'if (!routeAuthority.canUseForTrailItinerary) return false;',
  'Trip Builder must not promote preview/demo/approach geometry into trail itinerary authority.',
);

assertContains(
  mockPowerConnector,
  'simulated IPowerConnector for development & testing',
  'MockPowerConnector should remain explicitly development/test scoped.',
);

const mockPowerImportPattern = /(?:import\s+[^;]*from\s+['"][^'"]*MockPowerConnector['"]|require\(['"][^'"]*MockPowerConnector['"]\))/;
const simulatedAdapterImportPattern = /(?:import\s+[^;]*from\s+['"][^'"]*createSimulatedBluAdapter['"]|require\(['"][^'"]*createSimulatedBluAdapter['"]\))/;
const demoInviteUiImportPattern = /import\s+[^;]*DEMO_EXPEDITION_CHANNEL_INVITE[^;]*from\s+['"][^'"]*dispatchInviteDomain['"]/;
const mockRouteContextPattern = /\bmock-(?:routing|bailout-adapter|camp-adapter)\b|providerMetadata:\s*{\s*source:\s*['"]mock/i;

for (const file of runtimeSources()) {
  if (file.relative === 'src/power/connectors/MockPowerConnector.ts') continue;
  assert.ok(!mockPowerImportPattern.test(file.source), `${file.relative} must not statically import MockPowerConnector.`);
  assert.ok(!simulatedAdapterImportPattern.test(file.source), `${file.relative} must not statically import simulated BLU adapters.`);
  assert.ok(!mockRouteContextPattern.test(file.source), `${file.relative} must not contain mock route-context inputs.`);
  if (file.relative.startsWith('app/') || file.relative.startsWith('components/')) {
    assert.ok(!demoInviteUiImportPattern.test(file.source), `${file.relative} must not import demo dispatch invite fixtures directly.`);
  }
}

assertContains(
  dispatchInviteDomain,
  "id: 'demo-invite-ruby-ridge-active'",
  'Dispatch demo invite should remain visibly demo-scoped.',
);
assertContains(
  dispatchInviteDomain,
  "inviteLinkBaseUrl: 'https://ecs.local'",
  'Dispatch demo invite should not use a production invite link base URL.',
);
assertContains(
  expeditionInviteLocalAdapter,
  "return 'Demo Ruby Ridge Field Loop';",
  'Local invite adapter should label the demo invite as demo.',
);
assertContains(
  expeditionInviteLocalAdapter,
  "return 'Demo Command';",
  'Local invite adapter should label the demo invite host as demo.',
);
assertContains(
  dispatchDemoScenarios,
  'demoOnly: true',
  'Dispatch demo scenarios must carry a demoOnly marker.',
);
assertContains(
  dispatchDemoScenarios,
  'externalCommunication: false',
  'Dispatch demo scenarios must not be external-communication capable.',
);
assertNotContains(
  dispatchCommandCenter,
  'dispatchMockData',
  'The canonical Dispatch command center must not import runtime mock data.',
);

assertContains(
  vehicleTelemetryStore,
  "inputSource === 'mock_dev' && !isDevMockTelemetryAllowed()",
  'Vehicle telemetry store must reject mock_dev telemetry unless the dev mock flag is enabled.',
);
assertContains(
  vehicleTelemetryStore,
  "if (sourceType === 'simulated') return 'unverified';",
  'Simulated vehicle telemetry must be unverified.',
);
assertContains(
  vehicleTelemetryStore,
  "const sourceType = 'simulated';",
  'Mock vehicle telemetry should be normalized as simulated.',
);
assertContains(
  vehicleTelemetryStore,
  'isLive: false',
  'Mock/simulated vehicle telemetry should not be marked live.',
);
assertContains(
  unifiedTelemetryStore,
  'function shouldRejectProductionMock(event: ECSTelemetryEvent): boolean',
  'Unified telemetry store should keep an explicit production mock rejection guard.',
);
assertContains(
  unifiedTelemetryStore,
  "if (shouldRejectProductionMock(event)) return;",
  'Unified telemetry store should reject mock events on single ingest.',
);
assertContains(
  unifiedTelemetryStore,
  "if (shouldRejectProductionMock(event)) continue;",
  'Unified telemetry store should reject mock events on batch ingest.',
);
assertContains(
  telemetrySourceState,
  "return buildState('Simulation', 'Simulation', 'unknown', 'warning'",
  'Telemetry source state should label simulated readings as simulation, not live.',
);
assertContains(
  bluetoothLiveTelemetry,
  "normalizeBluetoothTelemetrySource(source) !== 'mock_dev' || isDevMockTelemetryAllowed()",
  'Bluetooth telemetry should only accept mock_dev when the explicit dev flag is enabled.',
);

for (const [name, source] of [
  ['Bluetti', bluettiAdapter],
  ['Anker SOLIX', ankerAdapter],
  ['Renogy', renogyAdapter],
]) {
  assertContains(source, "source: 'mock_dev'", `${name} simulated adapter telemetry must be marked mock_dev.`);
  assertContains(source, 'isLive: false', `${name} simulated adapter telemetry must not be live.`);
  assertMatches(source, /raw:\s*{\s*simulated:\s*true,\s*mock:\s*true,/s, `${name} simulated adapter raw payload must carry simulated/mock markers.`);
}

assertContains(
  unifiedConnections,
  "if (input.telemetrySource === 'mock_dev') return 'Mock';",
  'Unified device connection labels should show mock telemetry as Mock.',
);
assertContains(
  unifiedConnections,
  "case 'implemented':",
  'Power support descriptor should keep implemented-but-unverified providers separate from verified providers.',
);
assertContains(
  unifiedConnections,
  "supportLevel: 'implemented_unverified'",
  'Implemented-but-unverified providers should not be classified as verified.',
);
assertContains(
  unifiedConnections,
  "supportLevel: 'partial'",
  'Limited vendor integrations should remain partial.',
);
assertContains(
  bluestackPolicy,
  "if (supportLevel === 'partial' || supportLevel === 'implemented_unverified')",
  'Bluestack policy should route partial/unverified integrations through pending protocol state.',
);
assertContains(
  bluestackPolicy,
  'field verification is still required before it is treated as live telemetry',
  'Partial vendor copy should not read as verified/live.',
);

assertNotContains(
  `${vehicleTelemetryStore}\n${unifiedTelemetryStore}\n${telemetrySourceState}`,
  "sourceType: 'simulated',\n        sourceLabel: 'Live",
  'Simulated telemetry must never be labeled live.',
);

console.log('Mock/demo leakage guard checks passed.');
