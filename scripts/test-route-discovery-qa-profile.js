const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appConfig = require(path.join(root, 'app.config.js'));
const eas = require(path.join(root, 'eas.json'));
const metro = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
const {
  applyRouteDiscoveryQaNetworkIsolation,
} = require(path.join(root, 'lib/explore/routeDiscoveryQaNetworkIsolation.js'));

assert.deepStrictEqual(appConfig.resolveRouteDiscoveryQa('production', {}), {
  enabled: false, label: null, transportId: null, regionId: null, fixtureVersion: null, remoteActivation: false,
});
assert.deepStrictEqual(appConfig.resolveRouteDiscoveryQa('fieldtest', {}), {
  enabled: false, label: null, transportId: null, regionId: null, fixtureVersion: null, remoteActivation: false,
});
assert.throws(
  () => appConfig.resolveRouteDiscoveryQa('production', { EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true' }),
  /requires the route-discovery-qa build profile/,
);
const qaConfig = appConfig.resolveRouteDiscoveryQa('route-discovery-qa', {
    EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true',
  });
assert.strictEqual(qaConfig.enabled, true);
assert.strictEqual(qaConfig.regionId, 'qa_synthetic_basin_v2');
assert.strictEqual(qaConfig.fixtureVersion, 'route-discovery-qa-v2');

const qa = eas.build['route-discovery-qa'];
assert.strictEqual(qa.distribution, 'internal');
assert.strictEqual(qa.android.buildType, 'apk');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_BUILD_PROFILE, 'route-discovery-qa');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, 'true');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED, 'true');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD, 'false');
assert.strictEqual(eas.build.production.env?.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, undefined);
assert.strictEqual(eas.build.fieldtest.env?.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, undefined);
assert.strictEqual(JSON.stringify(qa).includes('SERVICE_ROLE'), false);
assert.strictEqual(JSON.stringify(qa).includes('SUPABASE_URL'), false);
assert.strictEqual(JSON.stringify(qa).includes('SUPABASE_ANON_KEY'), false);
assert.match(metro, /routeDiscoveryQaTransport\.disabled\.ts/);
assert.match(metro, /moduleName === '\.\/routeDiscoveryQaTransport'/);
assert.match(metro, /routeDiscoveryQaRuntime\.disabled\.ts/);
assert.match(metro, /RouteDiscoveryQaIdentity\.disabled\.tsx/);
assert.match(metro, /routeDiscoveryQaVehicleBootstrap\.disabled\.ts/);
assert.match(metro, /RouteDiscoveryQaVehicleBootstrapGate\.disabled\.tsx/);

const isolatedEnv = {
  EXPO_PUBLIC_ECS_BUILD_PROFILE: 'route-discovery-qa',
  EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true',
  EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED: 'true',
  EXPO_PUBLIC_SUPABASE_URL: 'https://production.example.invalid',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-production-placeholder',
};
assert.strictEqual(applyRouteDiscoveryQaNetworkIsolation(isolatedEnv), true);
assert.strictEqual(isolatedEnv.EXPO_PUBLIC_SUPABASE_URL, undefined);
assert.strictEqual(isolatedEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, undefined);
assert.throws(
  () => applyRouteDiscoveryQaNetworkIsolation({
    EXPO_PUBLIC_ECS_BUILD_PROFILE: 'production',
    EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED: 'true',
  }),
  /restricted to the route-discovery-qa build profile/,
);

const fieldtestEnv = {
  EXPO_PUBLIC_ECS_BUILD_PROFILE: 'fieldtest',
  EXPO_PUBLIC_SUPABASE_URL: 'https://fieldtest.supabase.invalid',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fieldtest-public-key-sentinel',
};
assert.strictEqual(applyRouteDiscoveryQaNetworkIsolation(fieldtestEnv), false);
assert.strictEqual(fieldtestEnv.EXPO_PUBLIC_SUPABASE_URL, 'https://fieldtest.supabase.invalid');
assert.strictEqual(fieldtestEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'fieldtest-public-key-sentinel');

console.log('Route-discovery QA build-profile isolation checks passed.');
