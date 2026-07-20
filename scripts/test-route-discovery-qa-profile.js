const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const appConfig = require(path.join(root, 'app.config.js'));
const eas = require(path.join(root, 'eas.json'));

assert.deepStrictEqual(appConfig.resolveRouteDiscoveryQa('production', {}), {
  enabled: false, label: null, transportId: null, remoteActivation: false,
});
assert.deepStrictEqual(appConfig.resolveRouteDiscoveryQa('fieldtest', {}), {
  enabled: false, label: null, transportId: null, remoteActivation: false,
});
assert.throws(
  () => appConfig.resolveRouteDiscoveryQa('production', { EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true' }),
  /requires the route-discovery-qa build profile/,
);
assert.strictEqual(
  appConfig.resolveRouteDiscoveryQa('route-discovery-qa', {
    EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true',
  }).enabled,
  true,
);

const qa = eas.build['route-discovery-qa'];
assert.strictEqual(qa.distribution, 'internal');
assert.strictEqual(qa.android.buildType, 'apk');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_BUILD_PROFILE, 'route-discovery-qa');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, 'true');
assert.strictEqual(qa.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD, 'false');
assert.strictEqual(eas.build.production.env?.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, undefined);
assert.strictEqual(eas.build.fieldtest.env?.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, undefined);
assert.strictEqual(JSON.stringify(qa).includes('SERVICE_ROLE'), false);
assert.strictEqual(JSON.stringify(qa).includes('SUPABASE_URL'), false);
assert.strictEqual(JSON.stringify(qa).includes('SUPABASE_ANON_KEY'), false);

console.log('Route-discovery QA build-profile isolation checks passed.');
