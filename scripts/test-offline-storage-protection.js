const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (request === './fsCompat' && parent?.filename.endsWith('tileCacheStore.ts')) {
    return {
      getDocumentDirectory: async () => null,
      fsGetInfo: async () => ({ exists: false }),
      fsEnsureDir: async () => undefined,
      fsWriteString: async () => undefined,
      fsReadString: async () => null,
    };
  }
  if (request === './nativeTileStorage' && parent?.filename.endsWith('tileCacheStore.ts')) {
    return {
      downloadAndStoreNativeTile: async () => ({ success: false, sizeBytes: 0 }),
      hasNativeTile: async () => false,
      deleteNativeRegion: async () => undefined,
      clearAllNativeTiles: async () => undefined,
      getNativeStorageStats: async () => ({ totalSizeMB: 0, tileCount: 0 }),
      getDeviceStorageInfo: async () => null,
      isNativeStorageAvailable: () => false,
    };
  }
  if (request === './mapConfig' && parent?.filename.endsWith('tileCacheStore.ts')) {
    return { getMapboxTokenSync: () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

async function main() {
  const { tileCacheStore } = require(path.join(root, 'lib', 'tileCacheStore.ts'));
  tileCacheStore.clearAll({ force: true });

  const protectedRegion = tileCacheStore.createFromBounds(
    'Active expedition region',
    { minLat: 35, maxLat: 35.1, minLng: -119.2, maxLng: -119.1 },
    8,
    9,
    'tactical',
  );
  const staleRegion = tileCacheStore.createFromBounds(
    'Old optional region',
    { minLat: 36, maxLat: 36.1, minLng: -120.2, maxLng: -120.1 },
    8,
    9,
    'tactical',
  );
  tileCacheStore.updateRegion(protectedRegion.id, {
    status: 'complete',
    downloadedAt: '2020-01-01T00:00:00.000Z',
    completedAt: '2020-01-01T00:00:00.000Z',
  });
  tileCacheStore.updateRegion(staleRegion.id, {
    status: 'complete',
    downloadedAt: '2020-01-01T00:00:00.000Z',
    completedAt: '2020-01-01T00:00:00.000Z',
  });
  tileCacheStore.setProtectionResolver((region) => (
    region.id === protectedRegion.id ? 'Required by active expedition' : null
  ));

  assert.strictEqual(tileCacheStore.clearAll(), false, 'Clear-all should fail closed while an active asset is protected.');
  await assert.rejects(
    tileCacheStore.deleteRegion(protectedRegion.id),
    /Required by active expedition/,
    'Manual deletion should reject protected active-expedition assets.',
  );

  const merge = await tileCacheStore.mergeRegions([protectedRegion.id, staleRegion.id]);
  assert.strictEqual(merge.success, false);
  assert.match(merge.message, /Cannot merge protected region/);

  const purge = await tileCacheStore.purgeStaleRegions(1);
  assert.strictEqual(purge.purged, 1, 'Stale cleanup should remove only the unprotected region.');
  assert.ok(tileCacheStore.getRegion(protectedRegion.id), 'Protected active region must survive stale cleanup.');
  assert.strictEqual(tileCacheStore.getRegion(staleRegion.id), undefined);
  assert.ok(!tileCacheStore.getQuotaStatus().purgeOrder.includes(protectedRegion.id));

  tileCacheStore.setProtectionResolver(null);
  tileCacheStore.clearAll({ force: true });
  console.log('Offline storage protection tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
