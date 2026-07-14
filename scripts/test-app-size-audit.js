const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function writeFile(filePath, sizeOrText) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (typeof sizeOrText === 'number') {
    fs.writeFileSync(filePath, Buffer.alloc(sizeOrText, 1));
    return;
  }
  fs.writeFileSync(filePath, sizeOrText);
}

function makeFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-app-size-audit-'));
  writeFile(path.join(tempRoot, 'app', 'index.tsx'), "import '../assets/runtime/icon.png';\n");
  writeFile(path.join(tempRoot, 'assets', 'runtime', 'icon.png'), 1024);
  writeFile(path.join(tempRoot, 'assets', 'runtime', 'hero.mp4'), 4096);
  writeFile(path.join(tempRoot, 'assets', 'runtime', 'index.ts'), "export const winch = require('../images/protocols/recovery/winch.png');\n");
  writeFile(path.join(tempRoot, 'assets', 'docs', 'spec.md'), '# accidentally bundled spec\n');
  writeFile(path.join(tempRoot, 'assets', 'fixtures', 'cache.json'), '{"fixture":true}\n');
  writeFile(path.join(tempRoot, 'assets', 'images', 'protocols', 'recovery', 'winch.png'), 2048);
  writeFile(path.join(tempRoot, 'assets', 'images', 'recovery-protocols', 'winch_recovery.png'), 2048);
  writeFile(path.join(tempRoot, 'android', 'app', 'src', 'main', 'res', 'drawable', 'native_icon.png'), 512);
  writeFile(path.join(tempRoot, 'docs', 'product-spec.md'), '# spec\n');
  writeFile(path.join(tempRoot, 'fixtures', 'offline', 'cache.json'), '{"offline":true}\n');
  writeFile(path.join(tempRoot, 'scripts', 'test-example.js'), 'console.log("test");\n');
  writeFile(path.join(tempRoot, 'artifacts', 'evidence', 'old.apk'), 8192);
  writeFile(path.join(tempRoot, 'dist', '_expo', 'static', 'js', 'web', 'entry.js'), 2048);
  writeFile(path.join(tempRoot, 'dist', 'assets', 'icon.png'), 1024);
  writeFile(path.join(tempRoot, 'dist', 'assets', 'node_modules', 'runtime-font.ttf'), 4096);
  writeFile(path.join(tempRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), 16384);
  writeFile(path.join(tempRoot, 'android', 'app', 'build', 'intermediates', 'merged_native_libs', 'release', 'mergeReleaseNativeLibs', 'out', 'lib', 'arm64-v8a', 'libdemo.so'), 4096);
  writeFile(path.join(tempRoot, 'android', 'app', 'build', 'intermediates', 'stripped_native_libs', 'release', 'out', 'lib', 'x86', 'libdemo.so'), 2048);
  writeFile(path.join(tempRoot, '.easignore'), [
    'docs/',
    'fixtures/',
    'qa-evidence/',
    'artifacts/',
    'dist/',
    '.smoke/',
    'scripts/test-*.js',
    'assets/images/recovery-protocols/',
  ].join('\n'));
  writeFile(path.join(tempRoot, 'metro.config.js'), [
    '// production-asset-exclusion:assets/images/recovery-protocols/',
    'module.exports = {};',
  ].join('\n'));
  writeFile(path.join(tempRoot, 'config', 'production-asset-policy.json'), JSON.stringify({
    schemaVersion: 1,
    productionExclusions: [{
      pathPrefix: 'assets/images/recovery-protocols/',
      classification: 'generated',
      reason: 'Fixture staging duplicate.',
      easIgnorePattern: 'assets/images/recovery-protocols/',
      metroBlockMarker: 'production-asset-exclusion:assets/images/recovery-protocols/',
    }],
    offlineRequiredPrefixes: ['assets/images/protocols/'],
    requiredRuntimePrefixes: [],
  }, null, 2));
  writeFile(path.join(tempRoot, 'app.json'), JSON.stringify({
    expo: {
      icon: './assets/runtime/icon.png',
      web: { favicon: './assets/runtime/icon.png' },
    },
  }, null, 2));
  return tempRoot;
}

(async () => {
  const auditModule = await import(pathToFileURL(path.join(root, 'scripts', 'audit-app-size.mjs')).href);
  const bundleModule = await import(pathToFileURL(path.join(root, 'scripts', 'audit-bundle-inclusions.mjs')).href);
  const tempRoot = makeFixture();

  const report = await auditModule.buildAppSizeAuditReport({
    repoRoot: tempRoot,
    includeNodeModules: false,
    writeReports: false,
    largestLimit: 10,
  });

  assert.ok(report.generatedAt, 'Audit should include generatedAt.');
  assert.strictEqual(report.repoRoot, tempRoot);
  assert.ok(report.totals.repoBytes > 0, 'Audit should measure repo bytes.');
  assert.ok(report.topLevelDirectories.some((item) => item.path === 'assets'), 'Audit should categorize top-level assets.');
  assert.ok(report.topLevelDirectories.some((item) => item.path === 'docs'), 'Audit should categorize top-level docs.');
  assert.ok(report.largestFiles.some((item) => item.path.endsWith('old.apk')), 'Audit should identify largest files.');
  assert.ok(report.largestAssets.some((item) => item.path.endsWith('hero.mp4')), 'Audit should identify largest runtime assets independently from build artifacts.');
  assert.ok(report.largestDirectories.some((item) => item.path === 'assets'), 'Audit should identify largest directories.');
  assert.ok(report.assetBreakdownByExtension['.png'] >= 3072, 'Audit should aggregate PNG assets.');
  assert.ok(report.assetBreakdownByExtension['.mp4'] >= 4096, 'Audit should aggregate MP4 assets.');
  assert.ok(report.androidArtifacts.apks.some((item) => item.path.endsWith('app-release.apk')), 'Audit should measure APK artifacts.');
  assert.ok(report.nativeLibrariesByAbi['arm64-v8a'] >= 4096, 'Audit should measure native libraries by ABI.');
  assert.ok(report.nativeLibrariesByAbi.x86 >= 2048, 'Audit should detect native ABI paths outside merged_native_libs.');
  assert.ok(report.jsBundles.some((item) => item.path.endsWith('entry.js')), 'Audit should measure JS bundle files.');
  assert.ok(
    report.totals.expoExportBytes >= 7168,
    'Expo export measurement should include packaged assets emitted under dist/assets/node_modules.',
  );
  assert.ok(report.assetOptimization.beforeBytes >= report.assetOptimization.afterBytes, 'Asset optimization summary should include before/after bytes.');
  assert.strictEqual(report.assetInventory.schemaVersion, 1, 'Asset inventory should be schema versioned.');
  assert.strictEqual(
    report.totals.productionAssetsBytes,
    report.totals.assetsBytes - 2048,
    'Only the protected generated staging copy should be excluded from production asset bytes.',
  );
  const runtimeIcon = report.assetInventory.assets.find((item) => item.filePath === 'assets/runtime/icon.png');
  const runtimeProtocol = report.assetInventory.assets.find((item) => item.filePath === 'assets/images/protocols/recovery/winch.png');
  const stagingProtocol = report.assetInventory.assets.find((item) => item.filePath === 'assets/images/recovery-protocols/winch_recovery.png');
  const nativeResource = report.assetInventory.assets.find((item) => item.filePath.endsWith('native_icon.png'));
  assert.ok(runtimeIcon.references.includes('app/index.tsx'), 'Inventory should resolve static runtime importers.');
  assert.strictEqual(runtimeIcon.exportedSizeBytes, 1024, 'Inventory should match measurable Expo export assets by content digest.');
  assert.strictEqual(runtimeProtocol.offlineRequired, true, 'Canonical protocol artwork should remain explicitly offline-required.');
  assert.strictEqual(runtimeProtocol.safetyClassification, 'required', 'Offline protocol artwork should remain required.');
  assert.ok(runtimeProtocol.runtimeReferences.includes('assets/runtime/index.ts'), 'Dynamic asset manifests under assets should count as runtime importers.');
  assert.strictEqual(stagingProtocol.productionIncluded, false, 'Protected generated staging artwork should stay outside production.');
  assert.strictEqual(stagingProtocol.safetyClassification, 'generated');
  assert.ok(stagingProtocol.duplicateGroup, 'Exact staging copies should be assigned a duplicate group.');
  assert.strictEqual(stagingProtocol.duplicateGroup, runtimeProtocol.duplicateGroup, 'Canonical and staging copies should share the exact duplicate group.');
  assert.strictEqual(nativeResource.assetType, 'native_resource', 'Native Android resources should appear in the machine inventory.');
  assert.strictEqual(nativeResource.budgetCounted, false, 'Native resources should remain visible without changing the established source-asset budget scope.');
  assert.strictEqual(nativeResource.usage, 'runtime', 'Packaged native resources should be classified as runtime assets.');
  assert.strictEqual(nativeResource.safetyClassification, 'required', 'Packaged native resources should fail closed as required.');
  assert.ok(report.suspectedBundleLeaks.some((item) => item.path.includes('assets/docs/spec.md')), 'Audit should flag docs under asset roots.');
  assert.ok(report.suspectedBundleLeaks.some((item) => item.path.includes('assets/fixtures/cache.json')), 'Audit should flag fixtures under asset roots.');
  assert.ok(!report.suspectedBundleLeaks.some((item) => item.path.includes('assets/runtime/icon.png')), 'Audit should not flag a referenced runtime asset.');

  const bundleReport = await bundleModule.buildBundleInclusionReport({
    repoRoot: tempRoot,
    writeReports: false,
  });

  assert.ok(bundleReport.forbiddenIncludedFiles.some((item) => item.path.includes('assets/docs/spec.md')), 'Bundle audit should flag docs under assets.');
  assert.ok(bundleReport.forbiddenIncludedFiles.some((item) => item.path.includes('assets/fixtures/cache.json')), 'Bundle audit should flag fixtures under assets.');
  assert.ok(!bundleReport.forbiddenIncludedFiles.some((item) => item.path.includes('assets/runtime/icon.png')), 'Bundle audit should not flag known runtime assets.');
  assert.ok(!bundleReport.forbiddenIncludedFiles.some((item) => item.path.includes('assets/images/protocols/recovery/winch.png')), 'Bundle audit should preserve runtime recovery protocols.');
  assert.ok(bundleReport.exclusionRules.easignore.includes('docs/'), 'Bundle audit should read production exclusion rules.');

  const easignore = fs.readFileSync(path.join(root, '.easignore'), 'utf8');
  ['docs/', 'fixtures/', 'qa-evidence/', 'scripts/test-*.js', 'assets/images/recovery-protocols/'].forEach((pattern) => {
    assert.ok(easignore.includes(pattern), `.easignore should exclude ${pattern} from production uploads.`);
  });

  writeFile(path.join(tempRoot, 'metro.config.js'), 'module.exports = {};\n');
  const unprotectedReport = await auditModule.buildAppSizeAuditReport({
    repoRoot: tempRoot,
    includeNodeModules: false,
    writeReports: false,
  });
  const unprotectedStaging = unprotectedReport.assetInventory.assets.find(
    (item) => item.filePath === 'assets/images/recovery-protocols/winch_recovery.png',
  );
  assert.strictEqual(unprotectedStaging.productionIncluded, true, 'An unprotected policy exclusion must fail closed into the production total.');
  assert.ok(
    unprotectedReport.assetInventory.policy.issues.some((issue) => issue.code === 'asset_policy_exclusion_unprotected'),
    'Missing Metro protection should be visible in the machine inventory.',
  );

  const metroConfig = require(path.join(root, 'metro.config.js'));
  const blockList = Array.isArray(metroConfig.resolver.blockList)
    ? metroConfig.resolver.blockList
    : [metroConfig.resolver.blockList].filter(Boolean);
  const localStagingAsset = path.join(root, 'assets', 'images', 'recovery-protocols', 'winch_recovery.png');
  assert.ok(
    blockList.some((pattern) => pattern instanceof RegExp && pattern.test(localStagingAsset)),
    'Metro should block local recovery artwork staging files from runtime resolution.',
  );

  console.log('App size audit checks passed.');
})();
