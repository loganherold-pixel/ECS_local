const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy' || request === 'expo-modules-core') {
    return {};
  }
  if (request === 'expo-secure-store') {
    return {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: {}, manifest: null } };
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

const scoring = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));
const fixtures = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessFixtures.ts'));
const preferences = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessPreferences.ts'));

const standard = scoring.buildExpeditionReadiness(fixtures.completeReadyReadinessFixture);
const fieldConservative = scoring.buildExpeditionReadiness({
  ...fixtures.completeReadyReadinessFixture,
  readinessPreferences: { readinessSensitivity: 'fieldConservative' },
});

assert.strictEqual(standard.status, 'ready', 'Fixture should be Ready with standard preferences.');
assert.strictEqual(fieldConservative.status, 'caution', 'Field Conservative sensitivity can turn a marginal Ready into Caution.');
assert.ok(
  fieldConservative.calibration.thresholds.ready > standard.calibration.thresholds.ready,
  'Conservative preferences should tighten Ready threshold.',
);
assert.ok(
  fieldConservative.preferenceEffects.some((effect) => effect.id === 'readiness-sensitivity-field-conservative'),
  'Assessment should explain sensitivity preference influence.',
);

const campPreferred = scoring.buildExpeditionReadiness({
  ...fixtures.lowCampLegalAccessConfidenceFixture,
  readinessPreferences: { campConfidenceRequirement: 'highConfidencePreferred' },
});
assert.ok(
  campPreferred.warnings.some((warning) => warning.id === 'preference-camp-high-confidence'),
  'High camp confidence preference should add a visible warning.',
);
assert.ok(
  campPreferred.warnings.some((warning) => /camp/i.test(warning.label) || warning.categoryId === 'camp_legality_confidence'),
  'Camp confidence warnings must remain visible.',
);
assert.ok(!/legal campsite/i.test(campPreferred.explanation), 'Preference copy must not claim legal campsite certainty.');

const strictOfflineRemote = scoring.buildExpeditionReadiness({
  ...fixtures.completeReadyReadinessFixture,
  tripIntent: 'remoteExpedition',
  tripIntentSource: 'selected',
  readinessProfile: 'remoteExpedition',
  route: {
    ...(fixtures.completeReadyReadinessFixture.route ?? {}),
    distanceMiles: 120,
    difficulty: 'hard',
  },
  offline: {
    ...(fixtures.completeReadyReadinessFixture.offline ?? {}),
    packageStatus: 'partial',
    routeDownloaded: true,
    mapsDownloaded: false,
    mapTilesCachedForRoute: false,
    isRemoteRoute: true,
  },
  readinessPreferences: { offlineRequirement: 'strictForRemoteTrips' },
});
assert.strictEqual(strictOfflineRemote.status, 'hold', 'Strict remote offline preference should force Hold when offline package is incomplete.');
assert.ok(
  strictOfflineRemote.blockers.some((blocker) => blocker.id === 'preference-strict-offline-remote'),
  'Strict offline preference should produce an explicit blocker.',
);

const tuningLow = preferences.getReadinessAlertTuning({ ...preferences.DEFAULT_EXPEDITION_READINESS_PREFERENCES, alertSensitivity: 'low' });
const tuningHigh = preferences.getReadinessAlertTuning({ ...preferences.DEFAULT_EXPEDITION_READINESS_PREFERENCES, alertSensitivity: 'high' });
assert.ok(tuningHigh.categoryDropThreshold < tuningLow.categoryDropThreshold, 'High alert sensitivity should alert on smaller category drops.');
assert.ok(tuningHigh.cooldownMs < tuningLow.cooldownMs, 'High alert sensitivity should use a shorter cooldown.');

const normalized = preferences.normalizeExpeditionReadinessPreferences({
  readinessSensitivity: 'bad-value',
  alertSensitivity: 'bad-value',
});
assert.strictEqual(normalized.readinessSensitivity, 'standard', 'Invalid readiness preference should fall back safely.');
assert.strictEqual(normalized.alertSensitivity, 'standard', 'Invalid alert preference should fall back safely.');

console.log('Expedition readiness preference checks passed.');
