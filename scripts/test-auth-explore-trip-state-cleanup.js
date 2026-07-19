const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = process.cwd();
const originalLoad = Module._load;
const localValues = new Map();

global.localStorage = {
  getItem(key) {
    return localValues.has(key) ? localValues.get(key) : null;
  },
  setItem(key, value) {
    localValues.set(key, String(value));
  },
  removeItem(key) {
    localValues.delete(key);
  },
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  clearAuthenticatedExploreTripState,
  shouldClearAuthenticatedExploreTripState,
} = require(path.join(root, 'lib', 'auth', 'authExploreTripStateCleanup.ts'));
const {
  loadExplorePlanningRouteContext,
  saveExplorePlanningRouteContext,
} = require(path.join(root, 'lib', 'explore', 'explorePlanningRouteContextStore.ts'));
const {
  loadTripBuilderRouteHandoff,
  saveTripBuilderRouteHandoff,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderRouteHandoffStore.ts'));
const {
  loadTripBuilderPlanState,
  resolveTripBuilderPlanRuntimeState,
  saveTripBuilderPlanState,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderPlanStore.ts'));
const {
  EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogSummaryCache.ts'));

const ACCOUNT_BOUND_KEYS = [
  'ecs_explore_planning_route_context',
  'ecs_trip_builder_route_handoff',
  'ecs_trip_builder_plan_v1',
];

async function run() {
  assert.equal(
    shouldClearAuthenticatedExploreTripState({
      reason: 'explicit_sign_out',
      hasAuthenticatedActor: false,
    }),
    false,
    'A no-session guest exit must preserve local planning state.',
  );
  assert.equal(
    shouldClearAuthenticatedExploreTripState({
      reason: 'provider_signed_out',
      hasAuthenticatedActor: false,
    }),
    false,
    'A provider signed-out event without an authenticated actor must preserve guest planning state.',
  );

  for (const reason of ['explicit_sign_out', 'provider_signed_out']) {
    assert.equal(
      shouldClearAuthenticatedExploreTripState({ reason, hasAuthenticatedActor: true }),
      true,
      `${reason} must clear account-bound state for an authenticated actor.`,
    );
  }
  for (const reason of ['session_expired', 'account_suspended']) {
    assert.equal(
      shouldClearAuthenticatedExploreTripState({ reason, hasAuthenticatedActor: false }),
      true,
      `${reason} is an authoritative account boundary.`,
    );
  }

  const route = { id: 'public-route-fixture', name: 'Public Route Fixture' };
  saveExplorePlanningRouteContext({
    routes: [route],
    radiusMiles: 500,
    refinementLabel: 'Privacy-safe acceptance area',
  });
  saveTripBuilderRouteHandoff(route, { deferItineraryBuild: true });
  await saveTripBuilderPlanState({
    selectedRouteId: route.id,
    plan: { id: 'synthetic-plan' },
    visible: true,
    itinerarySaved: false,
    itineraryEditSession: null,
  });

  const publicCatalogSentinel = JSON.stringify({ contract: 'public-route-catalog-cache' });
  localStorage.setItem(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, publicCatalogSentinel);

  assert.equal(loadExplorePlanningRouteContext().routes.length, 1);
  assert.equal(loadTripBuilderRouteHandoff().route.id, route.id);
  const persistedBeforeClear = await loadTripBuilderPlanState();
  assert.equal(resolveTripBuilderPlanRuntimeState(persistedBeforeClear).visible, true);
  ACCOUNT_BOUND_KEYS.forEach((key) => assert.notEqual(localStorage.getItem(key), null));

  await clearAuthenticatedExploreTripState();

  assert.equal(loadExplorePlanningRouteContext(), null);
  assert.equal(loadTripBuilderRouteHandoff(), null);
  const persistedAfterClear = await loadTripBuilderPlanState();
  assert.equal(persistedAfterClear, null);
  assert.deepEqual(resolveTripBuilderPlanRuntimeState(persistedAfterClear), {
    selectedRouteId: null,
    plan: null,
    visible: false,
    itinerarySaved: false,
    itineraryEditSession: null,
  });
  ACCOUNT_BOUND_KEYS.forEach((key) => assert.equal(localStorage.getItem(key), null));
  assert.equal(
    localStorage.getItem(EXPLORE_CATALOG_SUMMARY_CACHE_KEY),
    publicCatalogSentinel,
    'The public route-catalog cache must survive an auth boundary.',
  );

  await clearAuthenticatedExploreTripState();
  ACCOUNT_BOUND_KEYS.forEach((key) => assert.equal(localStorage.getItem(key), null));
  assert.equal(localStorage.getItem(EXPLORE_CATALOG_SUMMARY_CACHE_KEY), publicCatalogSentinel);

  console.log('Auth Explore/Trip Builder account-bound cleanup checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
