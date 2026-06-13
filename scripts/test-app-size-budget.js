const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function baseAudit(overrides = {}) {
  return {
    generatedAt: '2026-06-13T18:00:00.000Z',
    repoRoot: root,
    totals: {
      repoBytes: 10_000,
      productionCandidateBytes: 6_000,
      assetsBytes: 2_000,
      docsBytes: 500,
      fixturesBytes: 400,
      artifactsBytes: 300,
      buildOutputsBytes: 200,
      expoExportBytes: 0,
      offlineStarterBytes: 0,
    },
    androidArtifacts: {
      apks: [{ path: 'android/app/build/outputs/apk/release/app-release.apk', bytes: 50_000 }],
      aabs: [],
    },
    largestFiles: [{ path: 'assets/runtime/icon.png', bytes: 1_000, category: 'assets' }],
    largestDirectories: [],
    assetBreakdownByExtension: { '.png': 2_000 },
    suspectedBundleLeaks: [],
    recommendations: [],
    ...overrides,
  };
}

function baseBundle(overrides = {}) {
  return {
    generatedAt: '2026-06-13T18:00:00.000Z',
    repoRoot: root,
    assetBundlePatterns: [],
    broadAssetBundlePatterns: [],
    forbiddenIncludedFiles: [],
    uploadExclusionGaps: [],
    runtimeReferencedAssets: [],
    knownRuntimeAssets: [],
    warnings: [],
    ...overrides,
  };
}

(async () => {
  const budgetModule = await import(pathToFileURL(path.join(root, 'scripts', 'check-app-size-budget.mjs')).href);

  const leakResult = budgetModule.evaluateAppSizeBudget({
    auditReport: baseAudit(),
    bundleReport: baseBundle({
      forbiddenIncludedFiles: [
        { path: 'assets/docs/spec.md', bytes: 1200, reason: 'docs under asset root', severity: 'block' },
      ],
    }),
    budgetConfig: {
      requireProductionArtifact: false,
      maxApkBytes: 100_000,
      warnApkBytes: 80_000,
      maxLargestAssetBytes: 10_000,
      warnLargestAssetBytes: 8_000,
      maxExpoExportBytes: 100_000,
      warnExpoExportBytes: 80_000,
      maxProductionAssetsBytes: 100_000,
      warnProductionAssetsBytes: 80_000,
      maxOfflineStarterBytes: 100_000,
      warnOfflineStarterBytes: 80_000,
    },
  });
  assert.strictEqual(leakResult.status, 'blocked');
  assert.ok(leakResult.blockers.some((item) => item.includes('forbidden bundle inclusion')));

  const thresholdResult = budgetModule.evaluateAppSizeBudget({
    auditReport: baseAudit({
      androidArtifacts: { apks: [{ path: 'app-release.apk', bytes: 120_000 }], aabs: [] },
      largestFiles: [{ path: 'assets/huge.mp4', bytes: 12_000, category: 'assets' }],
      totals: {
        ...baseAudit().totals,
        assetsBytes: 90_000,
        expoExportBytes: 85_000,
      },
    }),
    bundleReport: baseBundle(),
    budgetConfig: {
      requireProductionArtifact: false,
      maxApkBytes: 100_000,
      warnApkBytes: 80_000,
      maxLargestAssetBytes: 10_000,
      warnLargestAssetBytes: 8_000,
      maxExpoExportBytes: 100_000,
      warnExpoExportBytes: 80_000,
      maxProductionAssetsBytes: 100_000,
      warnProductionAssetsBytes: 80_000,
      maxOfflineStarterBytes: 100_000,
      warnOfflineStarterBytes: 80_000,
    },
  });
  assert.strictEqual(thresholdResult.status, 'blocked');
  assert.ok(thresholdResult.blockers.some((item) => item.includes('APK exceeds hard budget')));
  assert.ok(thresholdResult.warnings.some((item) => item.includes('Expo export exceeds warning budget')));

  const unavailableResult = budgetModule.evaluateAppSizeBudget({
    auditReport: baseAudit({
      androidArtifacts: { apks: [], aabs: [] },
      totals: { ...baseAudit().totals, expoExportBytes: 0 },
    }),
    bundleReport: baseBundle(),
    budgetConfig: {
      requireProductionArtifact: true,
      maxApkBytes: 100_000,
      warnApkBytes: 80_000,
      maxAabBytes: 100_000,
      warnAabBytes: 80_000,
      maxLargestAssetBytes: 10_000,
      warnLargestAssetBytes: 8_000,
      maxExpoExportBytes: 100_000,
      warnExpoExportBytes: 80_000,
      maxProductionAssetsBytes: 100_000,
      warnProductionAssetsBytes: 80_000,
      maxOfflineStarterBytes: 100_000,
      warnOfflineStarterBytes: 80_000,
    },
  });
  assert.strictEqual(unavailableResult.status, 'unavailable');
  assert.ok(unavailableResult.blockers.some((item) => item.includes('No measurable production APK/AAB')));

  const passWithWarnings = budgetModule.evaluateAppSizeBudget({
    auditReport: baseAudit({
      androidArtifacts: { apks: [{ path: 'app-release.apk', bytes: 85_000 }], aabs: [] },
      largestFiles: [{ path: 'assets/large.png', bytes: 9_000, category: 'assets' }],
    }),
    bundleReport: baseBundle(),
    budgetConfig: {
      requireProductionArtifact: false,
      maxApkBytes: 100_000,
      warnApkBytes: 80_000,
      maxLargestAssetBytes: 10_000,
      warnLargestAssetBytes: 8_000,
      maxExpoExportBytes: 100_000,
      warnExpoExportBytes: 80_000,
      maxProductionAssetsBytes: 100_000,
      warnProductionAssetsBytes: 80_000,
      maxOfflineStarterBytes: 100_000,
      warnOfflineStarterBytes: 80_000,
    },
  });
  assert.strictEqual(passWithWarnings.status, 'warning');
  assert.ok(passWithWarnings.warnings.some((item) => item.includes('APK exceeds warning budget')));
  assert.ok(passWithWarnings.warnings.some((item) => item.includes('largest single asset exceeds warning budget')));

  console.log('App size budget checks passed.');
})();
