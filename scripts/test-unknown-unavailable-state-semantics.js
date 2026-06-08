const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
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

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} should exist`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} should exist after ${startMarker}`);
  return source.slice(start, end);
}

const weatherStore = read('lib/weatherStore.ts');
const weatherTypes = read('lib/weatherTypes.ts');
const trailConditionsCard = read('components/weather/TrailConditionsCard.tsx');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const vehicleDisplayStore = read('lib/vehicleDisplayStore.ts');
const unifiedDeviceConnections = read('lib/useUnifiedDeviceConnections.ts');
const exploreRouteAuthority = read('lib/exploreRouteAuthority.ts');
const discoverEngine = read('lib/discoverEngine.ts');

assert.ok(
  exists('lib/fallbackStateLabels.ts'),
  'Shared fallback label constants should exist for unknown/unavailable/stale/demo/mock/partial/live/verified.',
);
const fallbackLabels = exists('lib/fallbackStateLabels.ts')
  ? read('lib/fallbackStateLabels.ts')
  : '';
for (const key of ['unknown', 'unavailable', 'stale', 'demo', 'mock', 'partial', 'live', 'verified']) {
  assertContains(fallbackLabels, key, `Shared fallback labels should include ${key}.`);
}

const weatherFallback = functionSource(
  weatherStore,
  'function generateFallbackWeather(',
  'async function callWeatherEdgeFunction(',
);
assertMatches(
  weatherTypes,
  /export type TrailFactorStatus =[\s\S]*'unavailable'/,
  'Weather trail factor status should allow an unavailable state.',
);
assertMatches(
  weatherTypes,
  /export type TrailOverall =[\s\S]*'unavailable'/,
  'Weather trail overall status should allow an unavailable state.',
);
assertContains(
  weatherFallback,
  "overall: 'unavailable'",
  'Weather fallback trail conditions should be unavailable, not fair.',
);
assertNotContains(
  weatherFallback,
  "overall: 'fair'",
  'Weather fallback must not make unavailable conditions read as fair.',
);
assertContains(
  weatherFallback,
  "status: 'unavailable'",
  'Weather fallback factors should be explicitly unavailable.',
);
assertContains(
  trailConditionsCard,
  "case 'unavailable': return 'UNAVAILABLE';",
  'Trail condition card should display unavailable factor states explicitly.',
);
assertContains(
  trailConditionsCard,
  "case 'unavailable': return 'CONDITIONS UNAVAILABLE';",
  'Trail condition card should display unavailable overall states explicitly.',
);

assertContains(
  widgetRenderers,
  'const remotenessIndexOutput = remotenessStore.getIndex();',
  'Dashboard remoteness display should use the enhanced remoteness index availability, not GPS presence alone.',
);
assertNotContains(
  widgetRenderers,
  'const hasRemotenessContext = (options?.gpsHasFix ?? false) || remotenessOutput.score > 0;',
  'GPS presence alone must not make remoteness display as known/low risk.',
);
assertContains(
  widgetRenderers,
  "value: hasRemotenessContext ? remotenessOutput.tier : ECS_FALLBACK_LABELS.unknown",
  'Missing remoteness should display Unknown rather than Waiting or a low-risk tier.',
);
assertNotContains(
  vehicleDisplayStore,
  "remotenessIndex ? 'Exit plan available' : 'No remoteness context available'",
  'Exit plan fallback copy should not imply an exit plan exists when remoteness data is incomplete.',
);
assertContains(
  vehicleDisplayStore,
  'Not enough remoteness data',
  'Remoteness fallback copy should say when there is not enough data.',
);

assertNotContains(
  unifiedDeviceConnections,
  "return isLive ? 'Telemetry Active' : 'Live Data';",
  'Connected power devices without live telemetry should not be labeled Live Data.',
);
assertNotContains(
  unifiedDeviceConnections,
  "return isLive ? 'Connected' : 'Live Telemetry';",
  'Connected telemetry devices without live telemetry should not be labeled Live Telemetry.',
);
assertContains(
  unifiedDeviceConnections,
  "return isLive ? 'Telemetry Active' : 'Telemetry Pending';",
  'Power state labels should distinguish connected/pending from live.',
);
assertContains(
  unifiedDeviceConnections,
  "return isLive ? 'Connected' : 'Telemetry Pending';",
  'Telemetry state labels should distinguish connected/pending from live.',
);

assertContains(
  exploreRouteAuthority,
  'demo_fixture',
  'Explore route authority should retain demo fixture semantics.',
);
assertContains(
  exploreRouteAuthority,
  'Preview geometry is renderable but not verified trail geometry.',
  'Explore route authority should retain preview geometry warning copy.',
);
assertContains(
  discoverEngine,
  "distanceFromUserSource?: 'live_gps' | 'default_location' | 'unknown'",
  'Discover default-location distances should remain labeled separately from live GPS.',
);
assertContains(
  discoverEngine,
  'ecs_demo_full_route_fixture',
  'Discover demo route geometry should remain explicitly labeled as a demo fixture.',
);

console.log('Unknown/unavailable state semantic checks passed.');
