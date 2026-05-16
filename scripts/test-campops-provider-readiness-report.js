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
  createCampOpsProviderReadinessReport,
  renderCampOpsProviderReadinessJson,
  renderCampOpsProviderReadinessMarkdown,
  runCampOpsProviderValidation,
} = require(campopsPath);

function providersFor(set) {
  const records = set.providerRecords ?? {};
  const providers = [];
  if (records.legalAccess?.length) {
    if (set.id === 'provider_readiness_conflict') {
      providers.push(
        new CampOpsLegalAccessSourceProvider({
          id: `${set.id}.legal_official`,
          displayName: 'Readiness legal official fixture',
          sourceConfidence: 'high',
          records: records.legalAccess.slice(0, 1),
        }),
        new CampOpsLegalAccessSourceProvider({
          id: `${set.id}.legal_community`,
          displayName: 'Readiness legal community fixture',
          sourceConfidence: 'medium',
          records: records.legalAccess.slice(1),
        }),
      );
    } else {
      providers.push(new CampOpsLegalAccessSourceProvider({
        id: `${set.id}.legal`,
        displayName: 'Readiness legal fixture',
        records: records.legalAccess,
      }));
    }
  }
  if (records.closure?.length) {
    providers.push(new CampOpsClosureSourceProvider({
      id: `${set.id}.closure`,
      displayName: 'Readiness closure fixture',
      records: records.closure,
    }));
  }
  if (records.fire?.length) {
    providers.push(new CampOpsFireRestrictionSourceProvider({
      id: `${set.id}.fire`,
      displayName: 'Readiness fire fixture',
      records: records.fire,
    }));
  }
  if (records.weather?.length) {
    providers.push(new CampOpsWeatherSourceProvider({
      id: `${set.id}.weather`,
      displayName: 'Readiness weather fixture',
      records: records.weather,
    }));
  }
  if (records.service?.length) {
    providers.push(new CampOpsServiceSourceProvider({
      id: `${set.id}.service`,
      displayName: 'Readiness service fixture',
      records: records.service,
    }));
  }
  return providers;
}

async function reportFor(set, overrides = {}) {
  const summary = await runCampOpsProviderValidation({
    mode: 'shadow',
    regionLabel: set.regionLabel,
    context: set.context,
    candidates: set.candidates,
    providers: providersFor(set),
    expectedCategories: overrides.expectedCategories ?? ['legal', 'closure', 'fire', 'weather', 'service'],
    expectedShape: {
      service: ['nearestFuel'],
      ...(overrides.expectedShape ?? {}),
    },
    rolloutConfig: {
      campopsProviderValidationShadowModeEnabled: true,
    },
  });
  return createCampOpsProviderReadinessReport(summary, {
    generatedAtIso: '2026-04-30T18:05:00.000Z',
    releaseCohortLabel: set.releaseCohortLabel,
  });
}

(async () => {
  const sets = fixtures.providerReadinessFixtureSets;

  const high = await reportFor(sets.highReadiness);
  assert.strictEqual(high.reportKind, 'campops_provider_readiness');
  assert.strictEqual(high.readinessDecision, 'ready');
  assert.strictEqual(high.regionLabel, 'High readiness fixture region');
  assert.strictEqual(high.overallCoverageBand, 'high');
  assert.strictEqual(high.overallFreshnessBand, 'fresh');
  assert.ok(high.rows.every((row) => row.providerStatus === 'configured'));
  assert.ok(high.rows.some((row) => row.providerCategory === 'legal' && row.coverageBand === 'high'));
  assert.ok(high.rows.some((row) => row.providerCategory === 'service' && row.unknownSignalCount === 0));

  const markdown = renderCampOpsProviderReadinessMarkdown(high);
  assert.ok(markdown.includes('# CampOps Provider Readiness Report'));
  assert.ok(markdown.includes('| Category | Status | Coverage | Freshness |'));
  assert.ok(markdown.includes('Readiness: ready'));

  const json = renderCampOpsProviderReadinessJson(high);
  assert.ok(JSON.parse(json).rows.length >= 5);
  assert.ok(!json.includes('latitude'));
  assert.ok(!json.includes('longitude'));
  assert.ok(!json.includes('39.1'));
  assert.ok(!json.includes('-119.9'));

  const low = await reportFor(sets.lowCoverage, {
    expectedCategories: ['legal', 'closure', 'weather', 'service'],
  });
  assert.strictEqual(low.readinessDecision, 'not_ready');
  assert.ok(low.rows.some((row) => row.providerCategory === 'legal' && row.coverageBand === 'low'));
  assert.ok(low.rows.some((row) => row.providerCategory === 'closure' && row.providerStatus === 'missing'));
  assert.ok(low.rows.some((row) => row.unknownSignalCount > 0));

  const stale = await reportFor(sets.staleProviders, {
    expectedCategories: ['closure', 'weather', 'service'],
  });
  assert.notStrictEqual(stale.readinessDecision, 'ready');
  assert.ok(stale.rows.some((row) => row.staleSourceCount > 0));
  assert.ok(stale.staleRate > 0);

  const conflict = await reportFor(sets.conflictingProviders, {
    expectedCategories: ['legal', 'closure'],
  });
  assert.notStrictEqual(conflict.readinessDecision, 'ready');
  assert.ok(conflict.rows.some((row) => row.conflictCount > 0));
  assert.ok(conflict.conflictFrequency > 0);

  const disabledSummary = await runCampOpsProviderValidation({
    mode: 'disabled',
    regionLabel: 'Disabled fixture 39.12345,-119.12345 user:abc vehicle:def',
    context: sets.highReadiness.context,
    candidates: sets.highReadiness.candidates,
    providers: providersFor(sets.highReadiness),
    rolloutConfig: {
      campopsProviderValidationShadowModeEnabled: true,
    },
  });
  const disabledReport = createCampOpsProviderReadinessReport(disabledSummary, {
    generatedAtIso: '2026-04-30T18:05:00.000Z',
  });
  assert.strictEqual(disabledReport.readinessDecision, 'disabled');
  assert.ok(disabledReport.rows.every((row) => row.providerStatus === 'disabled'));
  assert.ok(!renderCampOpsProviderReadinessJson(disabledReport).includes('39.12345'));
  assert.ok(!renderCampOpsProviderReadinessJson(disabledReport).includes('abc'));
  assert.ok(!renderCampOpsProviderReadinessJson(disabledReport).includes('def'));

  console.log('CampOps provider readiness report checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
