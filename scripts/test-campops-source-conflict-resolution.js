const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campopsPath);

const context = {
  id: 'source-conflict-test',
  currentTimeIso: '2026-04-30T18:00:00.000Z',
  riskTolerance: 'balanced',
  offlineMode: 'online',
};

const candidate = {
  id: 'camp-a',
  name: 'Camp A',
  location: { latitude: 39.1, longitude: -119.9 },
  source: 'route_candidate',
  sourceConfidence: 'medium',
  lastVerifiedDate: '2026-04-30',
};

function provider(id, displayName, sourceCategory, signal, overrides = {}) {
  return {
    id,
    displayName,
    sourceCategory,
    sourceConfidence: overrides.sourceConfidence ?? signal?.confidence ?? 'medium',
    staleAfterMinutes: overrides.staleAfterMinutes ?? 60,
    collectSignals: () => [
      {
        candidateId: candidate.id,
        providerId: id,
        providerDisplayName: displayName,
        sourceCategory,
        sourceConfidence: overrides.sourceConfidence ?? signal?.confidence ?? 'medium',
        sourceFreshness: overrides.sourceFreshness,
        sourceTimestampIso: signal?.observedAtIso ?? null,
        signal,
        rawProviderStatus: { status: signal ? 'ok' : 'missing' },
        warnings: [],
        errors: [],
        missingDataReason: signal ? null : `${displayName} has no coverage.`,
      },
    ],
  };
}

function baseEnrichment(overrides = {}) {
  return {
    candidateId: candidate.id,
    legalStatus: 'unknown',
    legalConfidence: 'unknown',
    closureStatus: 'unknown',
    publicAccessStatus: 'unknown',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'medium',
    dataLimitations: [],
    ...overrides,
  };
}

async function collect(providers, resolutionConfig = {}) {
  return campops.collectCampOpsSourceProviderBundle({
    providers,
    context,
    candidates: [candidate],
    config: { resolutionConfig },
  });
}

function merge(bundle, overrides = {}) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(overrides),
    signals: bundle.signalsByCandidateId[candidate.id],
    currentTimeIso: context.currentTimeIso,
  });
}

(async () => {
  const officialClosedBundle = await collect([
    provider('official-closure', 'Official Closure Feed', 'closure', {
      source: 'offline_dataset',
      confidence: 'high',
      observedAtIso: '2026-04-30T17:50:00.000Z',
      closureStatus: 'closed',
    }),
    provider('user-open', 'User Report', 'closure', {
      source: 'community',
      confidence: 'medium',
      observedAtIso: '2026-04-30T17:55:00.000Z',
      closureStatus: 'open',
    }),
  ], {
    providerTierById: {
      'official-closure': 'official_source',
      'user-open': 'recent_user_debrief_data',
    },
  });
  const officialClosed = merge(officialClosedBundle, { legalStatus: 'allowed', legalConfidence: 'high', publicAccessStatus: 'public' });
  assert.strictEqual(officialClosed.closureStatus, 'closed');
  assert.ok(officialClosed.sourceResolutions.some((resolution) => resolution.field === 'closureStatus' && resolution.conflictDetected));
  assert.ok(officialClosedBundle.warnings.some((warning) => warning.includes('closure status')));
  const officialClosedGate = campops.evaluateCampCandidateHardGates({
    context,
    candidate,
    enrichment: officialClosed,
  });
  assert.strictEqual(officialClosedGate.status, 'rejected');

  const freshUserBundle = await collect([
    provider('stale-low-source', 'Stale App Closure', 'closure', {
      source: 'offline_dataset',
      confidence: 'low',
      observedAtIso: '2026-04-28T10:00:00.000Z',
      staleAfterMinutes: 60,
      closureStatus: 'restricted',
    }),
    provider('fresh-user-open', 'Fresh Debrief', 'closure', {
      source: 'community',
      confidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      closureStatus: 'open',
    }),
  ], {
    providerTierById: {
      'stale-low-source': 'app_owned_data',
      'fresh-user-open': 'recent_user_debrief_data',
    },
  });
  assert.strictEqual(merge(freshUserBundle).closureStatus, 'open');

  const legalAllowedClosureRestrictedBundle = await collect([
    provider('legal-provider', 'Legal Provider', 'legal', {
      source: 'offline_dataset',
      confidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      legalStatus: 'allowed',
      publicAccessStatus: 'public',
    }),
    provider('closure-provider', 'Closure Provider', 'closure', {
      source: 'offline_dataset',
      confidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      closureStatus: 'restricted',
    }),
  ]);
  const legalAllowedClosureRestricted = merge(legalAllowedClosureRestrictedBundle);
  assert.strictEqual(legalAllowedClosureRestricted.legalStatus, 'allowed');
  assert.strictEqual(legalAllowedClosureRestricted.closureStatus, 'restricted');

  const fireBundle = await collect([
    provider('fire-open', 'Fire Open Source', 'fire', {
      source: 'community',
      confidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      campfireAllowed: 'yes',
    }),
    provider('fire-ban', 'Fire Restriction Source', 'fire', {
      source: 'offline_dataset',
      confidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      campfireAllowed: 'no',
      fireRestrictionStatus: 'fire_ban',
    }),
  ]);
  const fireResolved = merge(fireBundle, { legalStatus: 'allowed', legalConfidence: 'high', closureStatus: 'open', publicAccessStatus: 'public' });
  assert.strictEqual(fireResolved.campfireAllowed, 'no');
  assert.strictEqual(fireResolved.fireRestrictionStatus, 'fire_ban');
  assert.ok(fireResolved.sourceResolutions.some((resolution) => resolution.field === 'campfireAllowed' && resolution.conflictDetected));

  const serviceBundle = await collect([
    provider('service-open', 'Service Open', 'service', {
      source: 'offline_dataset',
      confidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      nearestFuel: {
        serviceType: 'fuel',
        name: 'Fuel A',
        routeAwareDistanceMiles: 8,
        confidence: 'medium',
        status: 'open',
      },
    }),
    provider('service-unknown', 'Service Unknown', 'service', {
      source: 'community',
      confidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      nearestFuel: {
        serviceType: 'fuel',
        name: 'Fuel A',
        routeAwareDistanceMiles: 8,
        confidence: 'medium',
        status: 'unknown',
      },
    }),
  ]);
  const serviceResolved = merge(serviceBundle);
  assert.strictEqual(serviceResolved.nearestFuel.status, 'unknown');
  assert.ok(serviceResolved.sourceResolutions.some((resolution) => resolution.field === 'nearestFuel' && resolution.conflictDetected));

  const allUnknownBundle = await collect([
    provider('unknown-legal', 'Unknown Legal', 'legal', {
      source: 'unknown',
      confidence: 'unknown',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      legalStatus: 'unknown',
      closureStatus: 'unknown',
    }),
  ]);
  const allUnknown = merge(allUnknownBundle);
  assert.strictEqual(allUnknown.legalStatus, 'unknown');
  assert.strictEqual(allUnknown.closureStatus, 'unknown');

  const recommendationSet = campops.generateCampRecommendationSet({
    context,
    candidates: [candidate],
    enrichmentsByCandidateId: { [candidate.id]: fireResolved },
    hardGateEvaluationsByCandidateId: {
      [candidate.id]: campops.evaluateCampCandidateHardGates({ context, candidate, enrichment: fireResolved }),
    },
    suitabilityScoresByCandidateId: {
      [candidate.id]: campops.scoreCampSuitability({
        context,
        candidate,
        enrichment: fireResolved,
        hardGateEvaluation: campops.evaluateCampCandidateHardGates({ context, candidate, enrichment: fireResolved }),
      }),
    },
  });
  const prompt = campops.buildCampOpsAiAssistPrompt({ context, recommendationSet });
  assert.ok(prompt.includes('"sourceResolutions"'));
  assert.ok(prompt.includes('Use source conflict summaries as resolved CampOps truth'));

  console.log('CampOps source conflict resolution checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
