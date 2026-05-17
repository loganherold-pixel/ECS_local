const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const moduleCache = new Map();

function loadTsModule(relPath) {
  const filename = path.join(root, relPath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);

  function localRequire(request) {
    if (request.startsWith('.')) {
      const resolved = path.join(path.dirname(filename), `${request}.ts`);
      return loadTsModule(path.relative(root, resolved));
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

const {
  REMOTE_CACHE_GROUP_ID,
  buildOfflineRemoteCacheManifest,
  estimateRemoteCacheBytes,
  formatRemoteCacheLastVerified,
  getRemoteCacheFallbackScore,
} = loadTsModule('lib/remote/offlineRemoteCache.ts');

assert(REMOTE_CACHE_GROUP_ID === 'ecs-remote-v1', 'Remote cache group id should be ecs-remote-v1.');

const manifest = buildOfflineRemoteCacheManifest({
  routeGeometry: [
    { latitude: 38.1, longitude: -121.1 },
    { latitude: 38.2, longitude: -121.2 },
    { latitude: 38.3, longitude: -121.3 },
  ],
  routeBounds: { minLat: 38.1, maxLat: 38.3, minLng: -121.3, maxLng: -121.1 },
  segmentRiskAnalysis: {
    segments: [
      { remoteness_score: 80, remoteness_level: 'wilderness' },
      { risk_score: 40, risk_level: 'yellow' },
    ],
  },
  lastUpdated: '2026-04-28T10:00:00.000Z',
});

assert(manifest.cacheGroupId === 'ecs-remote-v1', 'Manifest should persist the cache group id.');
assert(manifest.enabled === true, 'Manifest should be enabled.');
assert(manifest.lastUpdated === '2026-04-28T10:00:00.000Z', 'Manifest should persist lastUpdated.');
assert(manifest.tileCoverage.routePointCount === 3, 'Manifest should persist route point coverage.');
assert(manifest.tileCoverage.segmentCount === 2, 'Manifest should persist segment coverage.');
assert(manifest.estimatedBytes > 0, 'Manifest should include a size estimate.');
assert(manifest.connectivitySummary.avgRemoteScore === 60, 'Manifest should average available remoteness scores.');
assert(manifest.connectivitySummary.maxRemoteScore === 80, 'Manifest should track the maximum remoteness score.');
assert(getRemoteCacheFallbackScore(manifest) === 60, 'Cached manifest should provide map overlay fallback score.');
assert(
  estimateRemoteCacheBytes({ routePointCount: 3, segmentCount: 2 }) === manifest.estimatedBytes,
  'Size estimate should be stable for equivalent route coverage.',
);
assert(
  formatRemoteCacheLastVerified('2026-04-28T08:00:00.000Z', Date.parse('2026-04-28T10:30:00.000Z')) ===
    'Last verified 2 hrs ago',
  'Remote cache freshness copy should use the requested Last verified X hrs ago language.',
);

const runStore = read('lib/runStore.ts');
assert(runStore.includes('remote_cache?: OfflineRemoteCacheManifest | null'), 'Run manifest should persist remote_cache.');
assert(runStore.includes('cache_groups?: string[]'), 'Run manifest should persist cache_groups.');

const service = read('lib/offlineRouteCacheService.ts');
assert(service.includes("REMOTE_CACHE_GROUP_ID"), 'Offline route cache should use the remote cache group constant.');
assert(service.includes('buildOfflineRemoteCacheManifest'), 'Offline route cache should build the remote cache manifest.');
assert(service.includes('includeRemoteConnectivityCache'), 'Offline route cache input should support the remote cache option.');
assert(service.includes('remote_cache: cachedRoute.remoteCache'), 'Run cache manifest should include cached remote data.');

const routeTileCacheEngine = read('lib/routeTileCacheEngine.ts');
assert(
  routeTileCacheEngine.includes('additionalCacheSizeMB') &&
    routeTileCacheEngine.includes('analysis.estimatedSizeMB + safeAdditionalSizeMB'),
  'Route tile cache quota checks should include remote/connectivity cache size.',
);

const routeTileCacheCard = read('components/navigate/RouteTileCacheCard.tsx');
assert(
  routeTileCacheCard.includes('Cache Remoteness & Connectivity'),
  'Route cache UI should expose the Cache Remoteness & Connectivity option.',
);
assert(
  routeTileCacheCard.includes('includeRemoteConnectivityCache') &&
    routeTileCacheCard.includes('formatRemoteCacheLastVerified'),
  'Route cache UI should pass the remote option and show Last verified copy.',
);

const navigateRun = read('app/navigate-run.tsx');
assert(
  navigateRun.includes('includeRemoteConnectivityCache: options?.includeRemoteConnectivityCache ?? true'),
  'Navigate run cache flow should default to including remoteness/connectivity cache.',
);

const offlineModal = read('components/navigate/OfflineCacheModal.tsx');
assert(
  offlineModal.includes('formatRemoteCacheLastVerified') && offlineModal.includes('REMOTE {formatRemoteCacheSize'),
  'Offline cache library should show cached remote metadata and freshness.',
);

const offlineReadiness = read('lib/offlineReadinessPresentation.ts');
assert(
  offlineReadiness.includes('remoteness / connectivity forecast'),
  'Offline readiness should account for remoteness/connectivity forecast assets.',
);

const navigate = read('app/(tabs)/navigate.tsx');
assert(
  navigate.includes('getRemoteCacheFallbackScore') &&
    navigate.includes('remotenessIndex?.score ?? cachedRemoteRemotenessScore'),
  'Navigate remoteness overlay should fall back to cached remoteness score offline.',
);

console.log('offline remote cache checks passed');
