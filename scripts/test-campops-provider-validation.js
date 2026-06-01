const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');
const fixtures = require(path.join(root, 'fixtures', 'campops', 'providerFixtures.js'));

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
  CampOpsLegalAccessSourceProvider,
  CampOpsClosureSourceProvider,
  CampOpsFireRestrictionSourceProvider,
  CampOpsWeatherSourceProvider,
  CampOpsServiceSourceProvider,
  runCampOpsProviderValidation,
} = require(campopsPath);

function failingProvider() {
  return {
    id: 'campops.fixture_validation_failure',
    displayName: 'Fixture validation failure',
    sourceCategory: 'closure',
    sourceConfidence: 'medium',
    collectSignals() {
      throw new Error('fixture provider unavailable');
    },
  };
}

(async () => {
  const context = fixtures.context({
    id: 'provider-validation-fixture',
    offlineMode: 'online',
  });
  const candidates = [
    fixtures.candidates.publicLegal,
    fixtures.candidates.conflictCamp,
    fixtures.candidates.closedCamp,
    fixtures.candidates.fireBan,
    fixtures.candidates.staleCamp,
    fixtures.candidates.ridge,
    fixtures.candidates.fuelClose,
  ];
  const providers = [
    new CampOpsLegalAccessSourceProvider({
      id: 'fixture.official_legal',
      displayName: 'Fixture official legal',
      sourceConfidence: 'high',
      records: [
        ...fixtures.legalAccessSources.filter((record) =>
          ['provider-public-legal', 'provider-conflict-camp'].includes(record.candidateId),
        ),
      ],
    }),
    new CampOpsLegalAccessSourceProvider({
      id: 'fixture.community_legal_conflict',
      displayName: 'Fixture community legal conflict',
      sourceConfidence: 'medium',
      records: [
        {
          candidateId: 'provider-conflict-camp',
          source: 'community',
          campingAllowed: 'no',
          accessAllowed: 'restricted',
          landStatus: 'mixed',
          legalConfidence: 'medium',
          restrictionType: 'community_reported_restriction',
          observedAtIso: '2026-04-30T17:55:00.000Z',
          sourceSummary: 'Fixture community report says access is restricted.',
        },
      ],
    }),
    new CampOpsClosureSourceProvider({
      id: 'fixture.closure',
      displayName: 'Fixture closure',
      records: fixtures.closureSources,
    }),
    new CampOpsFireRestrictionSourceProvider({
      id: 'fixture.fire',
      displayName: 'Fixture fire restriction',
      records: fixtures.fireRestrictionSources,
    }),
    new CampOpsWeatherSourceProvider({
      id: 'fixture.weather',
      displayName: 'Fixture weather',
      records: fixtures.weatherSources,
    }),
    new CampOpsServiceSourceProvider({
      id: 'fixture.service',
      displayName: 'Fixture service',
      records: fixtures.serviceResupplySources,
    }),
    failingProvider(),
  ];

  const disabled = await runCampOpsProviderValidation({
    mode: 'shadow',
    regionLabel: 'Northern Nevada fixture cell',
    context,
    candidates,
    providers,
    rolloutConfig: {
      campopsProviderValidationShadowModeEnabled: false,
    },
  });
  assert.strictEqual(disabled.enabled, false);
  assert.strictEqual(disabled.providerOutputAppliedToRecommendations, false);
  assert.ok(disabled.warnings.some((warning) => warning.includes('flag is disabled')));

  const summary = await runCampOpsProviderValidation({
    mode: 'shadow',
    regionLabel: 'Northern Nevada fixture cell',
    context,
    candidates,
    providers,
    rolloutConfig: {
      campopsProviderValidationShadowModeEnabled: true,
    },
  });

  assert.strictEqual(summary.enabled, true);
  assert.strictEqual(summary.shadowMode, true);
  assert.strictEqual(summary.providerOutputAppliedToRecommendations, false);
  assert.strictEqual(summary.productionImpactAllowed, false);
  assert.strictEqual(summary.providerCount, providers.length);
  assert.ok(summary.providerResultCount > 0);
  assert.ok(summary.legalAccessSourceAvailability.resultCount > 0, 'Legal/access availability should be summarized.');
  assert.ok(summary.closureSourceAvailability.resultCount > 0, 'Closure availability should be summarized.');
  assert.ok(summary.fireRestrictionSourceAvailability.resultCount > 0, 'Fire availability should be summarized.');
  assert.ok(summary.weatherSourceFreshness.resultCount > 0, 'Weather freshness should be summarized.');
  assert.ok(summary.serviceResupplyCoverage.resultCount > 0, 'Service coverage should be summarized.');
  assert.ok(summary.conflictFrequency > 0, 'Conflicting legal source signals should be counted.');
  assert.ok(summary.unknownRate > 0, 'Unknown expected fields should be counted.');
  assert.ok(summary.staleRate > 0, 'Stale fixture data should be counted.');
  assert.ok(summary.missingDataRate > 0, 'Missing provider coverage should be counted.');
  assert.ok(summary.errors.some((error) => error.includes('fixture provider unavailable')));

  const legalReport = summary.providerReports.find((report) => report.providerId === 'fixture.official_legal');
  assert.ok(legalReport, 'Provider readiness report should include provider id.');
  assert.strictEqual(legalReport.regionLabel, 'Northern Nevada fixture cell');
  assert.strictEqual(legalReport.sourceCategory, 'legal');
  assert.ok(['low', 'medium', 'high', 'none'].includes(legalReport.coverageBand));
  assert.ok(legalReport.recommendationImpactSummary.includes('shadow mode'));

  const productionAllowedSummary = await runCampOpsProviderValidation({
    mode: 'shadow',
    regionLabel: 'Production-gated fixture cell',
    context,
    candidates,
    providers: [providers[0]],
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsProviderAdaptersEnabled: true,
      campopsProviderValidationShadowModeEnabled: true,
    },
  });
  assert.strictEqual(productionAllowedSummary.productionImpactAllowed, true);
  assert.strictEqual(productionAllowedSummary.providerOutputAppliedToRecommendations, false);

  const noProviderSummary = await runCampOpsProviderValidation({
    mode: 'shadow',
    regionLabel: 'No provider fixture cell',
    context,
    candidates,
    providers: [],
    rolloutConfig: {
      campopsProviderValidationShadowModeEnabled: true,
    },
  });
  assert.strictEqual(noProviderSummary.enabled, true);
  assert.strictEqual(noProviderSummary.providerCount, 0);
  assert.ok(noProviderSummary.warnings.some((warning) => warning.includes('No CampOps source providers configured')));

  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('latitude'));
  assert.ok(!serialized.includes('longitude'));
  assert.ok(!serialized.includes('39.1'));
  assert.ok(!serialized.includes('-119.9'));

  console.log('CampOps provider validation checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
