/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'node' } };
  if (request === './fsCompat') {
    return {
      getDocumentDirectory: async () => '',
      fsGetInfo: async (uri) => ({ exists: false, isDirectory: false, size: 0, uri }),
      fsEnsureDir: async () => true,
      fsWriteString: async () => undefined,
      fsReadString: async () => '',
    };
  }
  if (request === './nativeTileStorage') {
    return {
      downloadAndStoreNativeTile: async () => -1,
      hasNativeTile: async () => false,
      deleteNativeRegion: async () => 0,
      clearAllNativeTiles: async () => undefined,
      getNativeStorageStats: async () => ({ totalRegions: 0, totalTiles: 0, totalSizeBytes: 0, totalSizeMB: 0, regions: [] }),
      getDeviceStorageInfo: async () => null,
      isNativeStorageAvailable: () => false,
    };
  }
  if (request === './mapConfig') return { getMapboxTokenSync: () => '' };
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

const {
  resolveOfflineTileDownloadWithTimeout,
  resolveTileDownloadTerminalState,
} = require(path.join(root, 'lib', 'tileCacheStore.ts'));

assert.deepStrictEqual(
  resolveTileDownloadTerminalState({ totalTiles: 100, downloadedTiles: 100, failedTiles: 0, cancelled: false }),
  { status: 'complete', success: true, percent: 100, message: 'Download complete' },
);

const partialFailure = resolveTileDownloadTerminalState({
  totalTiles: 100,
  downloadedTiles: 99,
  failedTiles: 1,
  cancelled: false,
});
assert.strictEqual(partialFailure.status, 'error');
assert.strictEqual(partialFailure.success, false);
assert.strictEqual(partialFailure.percent, 99);
assert.match(partialFailure.message, /1 required tile failed/);
assert.doesNotMatch(partialFailure.message, /complete/i);

const widespreadFailure = resolveTileDownloadTerminalState({
  totalTiles: 100,
  downloadedTiles: 40,
  failedTiles: 60,
  cancelled: false,
});
assert.strictEqual(widespreadFailure.status, 'error');
assert.strictEqual(widespreadFailure.percent, 40);

const cancelled = resolveTileDownloadTerminalState({
  totalTiles: 100,
  downloadedTiles: 25,
  failedTiles: 0,
  cancelled: true,
});
assert.strictEqual(cancelled.status, 'cancelled');
assert.strictEqual(cancelled.success, false);
assert.strictEqual(cancelled.percent, 25);

const emptyRegion = resolveTileDownloadTerminalState({
  totalTiles: 0,
  downloadedTiles: 0,
  failedTiles: 0,
  cancelled: false,
});
assert.strictEqual(emptyRegion.status, 'error');
assert.strictEqual(emptyRegion.success, false);
assert.match(emptyRegion.message, /No map tiles were resolved/);

(async () => {
  assert.strictEqual(await resolveOfflineTileDownloadWithTimeout(Promise.resolve(2048), 5), 2048);
  const timeoutStartedAt = Date.now();
  assert.strictEqual(
    await resolveOfflineTileDownloadWithTimeout(new Promise(() => undefined), 5),
    -1,
    'A native tile promise that never settles must become a bounded failed tile.',
  );
  assert.ok(Date.now() - timeoutStartedAt < 500, 'Native tile timeout should settle without leaving the region spinner active.');
  console.log('Offline tile terminal-state behavior tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
