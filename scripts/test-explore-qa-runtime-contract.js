const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const metroPath = path.join(root, 'metro.config.js');
const activeRuntimePath = path.join(root, 'lib', 'explore', 'routeDiscoveryQaRuntime.ts');
const disabledRuntimePath = path.join(root, 'lib', 'explore', 'routeDiscoveryQaRuntime.disabled.ts');
const contractPath = path.join(root, 'lib', 'explore', 'routeDiscoveryQaRuntimeContract.ts');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');

require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function withProfileEnvironment(profile, qaTransportEnabled, callback) {
  const keys = [
    'EXPO_PUBLIC_ECS_BUILD_PROFILE',
    'EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT',
    'EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = profile;
  if (qaTransportEnabled) {
    process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT = 'true';
    process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED = 'true';
  } else {
    delete process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT;
    delete process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED;
  }

  try {
    return callback();
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

delete require.cache[require.resolve(metroPath)];
const metro = withProfileEnvironment('fieldtest', false, () => require(metroPath));

function resolveRuntimePath(profile, qaTransportEnabled) {
  return withProfileEnvironment(profile, qaTransportEnabled, () => {
    const resolution = metro.resolver.resolveRequest(
      {
        resolveRequest: () => ({
          type: 'sourceFile',
          filePath: activeRuntimePath,
        }),
      },
      '../../lib/explore/routeDiscoveryQaRuntime',
      'android',
    );
    return path.normalize(resolution.filePath);
  });
}

const contract = require(contractPath);
const activeRuntime = require(activeRuntimePath).getRouteDiscoveryQaRuntime();
const disabledRuntime = require(disabledRuntimePath).getRouteDiscoveryQaRuntime();
const fieldtestResolvedRuntimePath = resolveRuntimePath('fieldtest', false);
const qaResolvedRuntimePath = resolveRuntimePath('route-discovery-qa', true);
const fieldtestResolvedRuntime = require(fieldtestResolvedRuntimePath).getRouteDiscoveryQaRuntime();
const discoverSource = fs.readFileSync(discoverPath, 'utf8').replace(/\r\n/g, '\n');
const discoverAst = ts.createSourceFile(
  discoverPath,
  discoverSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const persistedSnapshot = {
  radiusMiles: 250,
  refinement: 'weekendTrip',
  activeCategoryPanel: 'trailPacks',
  resultSetSummary: null,
  updatedAt: '2026-07-24T00:00:00.000Z',
};
let checks = 0;

function check(label, callback) {
  callback();
  checks += 1;
  process.stdout.write(`ok ${checks} - ${label}\n`);
}

check('active runtime satisfies the shared enabled contract', () => {
  assert.strictEqual(activeRuntime.enabled, true);
  assert.strictEqual(activeRuntime.mode, 'route_discovery_qa');
  assert.strictEqual(activeRuntime.persistedFilterHydrationAllowed, false);
  assert.ok(activeRuntime.accessPartition.startsWith('route_discovery_qa:'));
});

check('disabled runtime satisfies the shared disabled contract', () => {
  assert.deepStrictEqual(disabledRuntime, {
    enabled: false,
    mode: null,
    region: null,
    fixtureVersion: null,
    accessPartition: null,
    persistedFilterHydrationAllowed: true,
  });
});

check('active runtime retains the deterministic QA region and radius', () => {
  assert.strictEqual(activeRuntime.region.regionId, 'qa_synthetic_basin_v2');
  assert.strictEqual(activeRuntime.region.defaultRadiusMiles, 100);
  assert.strictEqual(activeRuntime.region.fixtureVersion, 'route-discovery-qa-v2');
});

check('profile-safe selectors return a region only for QA', () => {
  assert.strictEqual(contract.getRouteDiscoveryQaRegion(disabledRuntime), null);
  assert.strictEqual(contract.getRouteDiscoveryQaDefaultRadiusMiles(disabledRuntime), null);
  assert.strictEqual(contract.getRouteDiscoveryQaRegion(activeRuntime), activeRuntime.region);
  assert.strictEqual(contract.getRouteDiscoveryQaDefaultRadiusMiles(activeRuntime), 100);
});

check('Metro resolves the disabled implementation for fieldtest', () => {
  assert.strictEqual(fieldtestResolvedRuntimePath, path.normalize(disabledRuntimePath));
  assert.strictEqual(fieldtestResolvedRuntime.enabled, false);
  assert.strictEqual(fieldtestResolvedRuntime.region, null);
});

check('Metro leaves the active implementation selected for route-discovery QA', () => {
  assert.strictEqual(qaResolvedRuntimePath, path.normalize(activeRuntimePath));
});

check('fieldtest Discover initialization preserves persisted radius and refinement', () => {
  assert.doesNotThrow(() => {
    const defaultRadius = contract.getRouteDiscoveryQaDefaultRadiusMiles(fieldtestResolvedRuntime);
    const initial = contract.resolveRouteDiscoveryQaExploreFilterState(
      persistedSnapshot,
      defaultRadius,
    );
    assert.strictEqual(initial.radiusMiles, 250);
    assert.strictEqual(initial.refinement, 'weekendTrip');
  });
});

check('fieldtest asynchronous hydration preserves persisted radius and refinement', () => {
  const hydrated = contract.resolveRouteDiscoveryQaExploreFilterState(
    persistedSnapshot,
    contract.getRouteDiscoveryQaDefaultRadiusMiles(fieldtestResolvedRuntime),
  );
  assert.strictEqual(hydrated.radiusMiles, 250);
  assert.strictEqual(hydrated.refinement, 'weekendTrip');
});

check('QA initialization uses the synthetic radius and clears refinement', () => {
  const qaSnapshot = contract.resolveRouteDiscoveryQaExploreFilterState(
    persistedSnapshot,
    contract.getRouteDiscoveryQaDefaultRadiusMiles(activeRuntime),
  );
  assert.strictEqual(qaSnapshot.radiusMiles, 100);
  assert.strictEqual(qaSnapshot.refinement, null);
});

check('dependency construction is safe for the disabled runtime', () => {
  assert.doesNotThrow(() => [
    fieldtestResolvedRuntime.enabled,
    contract.getRouteDiscoveryQaDefaultRadiusMiles(fieldtestResolvedRuntime),
  ]);
});

check('Discover has no direct runtime region access', () => {
  const unsafeAccesses = [];
  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'region' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'routeDiscoveryQaRuntime'
    ) {
      unsafeAccesses.push(node.getText(discoverAst));
    }
    ts.forEachChild(node, visit);
  };
  visit(discoverAst);
  assert.deepStrictEqual(unsafeAccesses, []);
});

check('Discover uses only safe primitives in the hydration dependency list', () => {
  assert.match(
    discoverSource,
    /\}, \[\n\s*routeDiscoveryQaRuntime\.enabled,\n\s*routeDiscoveryQaDefaultRadiusMiles,\n\s*\]\);/,
  );
  assert.doesNotMatch(discoverSource, /routeDiscoveryQaRuntime\.region\.defaultRadiusMiles/);
});

check('fieldtest search-area resolution remains nullable before live or persisted input', () => {
  const qaRegion = contract.getRouteDiscoveryQaRegion(fieldtestResolvedRuntime);
  const selectedArea = null;
  const liveArea = null;
  assert.strictEqual(qaRegion ?? selectedArea ?? liveArea, null);
  assert.match(discoverSource, /if \(routeDiscoveryQaRegion\) return routeDiscoveryQaRegion;/);
  assert.match(discoverSource, /if \(!hasGPSFix\) return null;/);
});

check('QA search-area resolution remains synthetic', () => {
  const qaRegion = contract.getRouteDiscoveryQaRegion(activeRuntime);
  assert.strictEqual(qaRegion.regionId, 'qa_synthetic_basin_v2');
  assert.strictEqual(qaRegion.source, 'qa_synthetic_region');
});

check('Trip Builder uses synthetic coordinates only when QA is enabled', () => {
  const qaRegion = contract.getRouteDiscoveryQaRegion(activeRuntime);
  assert.deepStrictEqual(
    { latitude: qaRegion.latitude, longitude: qaRegion.longitude },
    { latitude: 38.5, longitude: -115.5 },
  );
  assert.match(discoverSource, /\(\) => routeDiscoveryQaRegion\n\s*\? \{/);
});

check('Trip Builder retains live GPS fallback for fieldtest', () => {
  assert.strictEqual(contract.getRouteDiscoveryQaRegion(fieldtestResolvedRuntime), null);
  assert.match(discoverSource, /: hasGPSFix\n\s*\? \{/);
  assert.match(discoverSource, /source: 'explore_live_gps'/);
});

check('strict route result cap remains twenty', () => {
  const policy = require(path.join(root, 'lib', 'explore', 'routeSearchResultPolicy.ts'));
  assert.strictEqual(policy.ECS_ROUTE_SEARCH_RESULT_LIMIT, 20);
});

check('canonical runtime-contract command is registered', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.strictEqual(
    packageJson.scripts['test:explore-qa-runtime-contract'],
    'node ./scripts/test-explore-qa-runtime-contract.js',
  );
});

console.log(`Explore QA runtime contract checks passed (${checks} requirements).`);
