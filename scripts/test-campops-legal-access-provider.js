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
  id: 'legal-access-provider-test',
  currentTimeIso: '2026-04-30T18:00:00.000Z',
  riskTolerance: 'balanced',
  offlineMode: 'online',
};

function candidate(id) {
  return {
    id,
    name: id,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
  };
}

function baseEnrichment(candidateId = 'camp-public', overrides = {}) {
  return {
    candidateId,
    legalStatus: 'unknown',
    legalConfidence: 'unknown',
    closureStatus: 'unknown',
    publicAccessStatus: 'unknown',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'unknown',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'unknown',
    ...overrides,
  };
}

async function legalBundle(records, ids) {
  const candidates = ids.map(candidate);
  const provider = new campops.CampOpsLegalAccessSourceProvider({
    records,
    staleAfterMinutes: 60,
  });
  return campops.collectCampOpsSourceProviderBundle({
    providers: [provider],
    context,
    candidates,
  });
}

function mergeFor(candidateId, bundle, enrichmentOverrides = {}) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(candidateId, enrichmentOverrides),
    signals: bundle.signalsByCandidateId[candidateId],
    currentTimeIso: context.currentTimeIso,
  });
}

function evaluate(candidateId, enrichment, ctx = context) {
  return campops.evaluateCampCandidateHardGates({
    context: ctx,
    candidate: candidate(candidateId),
    enrichment,
  });
}

(async () => {
  const publicBundle = await legalBundle([
    {
      candidateId: 'camp-public',
      source: 'offline_dataset',
      campingAllowed: 'yes',
      accessAllowed: 'yes',
      landStatus: 'public',
      legalConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'Public agency layer indicates public access and no known camping prohibition.',
    },
  ], ['camp-public']);
  const publicEnrichment = mergeFor('camp-public', publicBundle);
  assert.strictEqual(publicEnrichment.legalStatus, 'allowed');
  assert.strictEqual(publicEnrichment.legalConfidence, 'high');
  assert.strictEqual(publicEnrichment.publicAccessStatus, 'public');
  assert.strictEqual(publicEnrichment.closureStatus, 'open');
  assert.strictEqual(evaluate('camp-public', publicEnrichment).status, 'allowed');
  assert.ok(!JSON.stringify(publicBundle).includes('definitely legal'), 'Provider output must avoid overconfident legal wording.');

  const privateBundle = await legalBundle([
    {
      candidateId: 'camp-private',
      source: 'offline_dataset',
      campingAllowed: 'unknown',
      accessAllowed: 'unknown',
      landStatus: 'private',
      legalConfidence: 'high',
      observedAtIso: '2026-04-30T17:50:00.000Z',
      restrictionType: 'private_land',
      sourceSummary: 'Parcel fixture marks this location private; no permission record is present.',
    },
  ], ['camp-private']);
  const privateEnrichment = mergeFor('camp-private', privateBundle);
  const privateEvaluation = evaluate('camp-private', privateEnrichment);
  assert.strictEqual(privateEnrichment.publicAccessStatus, 'private');
  assert.strictEqual(privateEvaluation.status, 'rejected');
  assert.ok(privateEvaluation.failedGates.some((gate) => gate.gateId === 'campops.access.private_land'));

  const restrictedBundle = await legalBundle([
    {
      candidateId: 'camp-restricted',
      source: 'offline_dataset',
      campingAllowed: 'likely',
      accessAllowed: 'restricted',
      landStatus: 'public',
      legalConfidence: 'medium',
      observedAtIso: '2026-04-30T17:40:00.000Z',
      restrictionType: 'seasonal_access_restriction',
    },
    {
      candidateId: 'camp-permit',
      source: 'offline_dataset',
      campingAllowed: 'likely',
      accessAllowed: 'restricted',
      landStatus: 'public',
      legalConfidence: 'medium',
      observedAtIso: '2026-04-30T17:40:00.000Z',
      restrictionType: 'permit_required',
    },
  ], ['camp-restricted', 'camp-permit']);
  const restrictedEvaluation = evaluate('camp-restricted', mergeFor('camp-restricted', restrictedBundle));
  assert.strictEqual(restrictedEvaluation.status, 'rejected');
  assert.ok(restrictedEvaluation.failedGates.some((gate) => gate.gateId === 'campops.access.restricted'));
  const permitEvaluation = evaluate('camp-permit', mergeFor('camp-permit', restrictedBundle));
  assert.strictEqual(permitEvaluation.status, 'caution');
  assert.ok(permitEvaluation.cautionGates.some((gate) => gate.gateId === 'campops.access.permit_required'));

  const unknownBundle = await legalBundle([
    {
      candidateId: 'camp-unknown',
      source: 'offline_dataset',
      campingAllowed: 'unknown',
      accessAllowed: 'unknown',
      landStatus: 'unknown',
      legalConfidence: 'unknown',
      observedAtIso: '2026-04-30T17:35:00.000Z',
      missingDataReason: 'No parcel, MVUM, or agency access fixture covers this point.',
    },
  ], ['camp-unknown']);
  const unknownEnrichment = mergeFor('camp-unknown', unknownBundle);
  const unknownEvaluation = evaluate('camp-unknown', unknownEnrichment);
  assert.strictEqual(unknownEvaluation.status, 'unknown');
  assert.ok(unknownEvaluation.unknownGates.some((gate) => gate.gateId === 'campops.access.public_access_unconfirmed'));

  const staleBundle = await legalBundle([
    {
      candidateId: 'camp-stale',
      source: 'offline_dataset',
      campingAllowed: 'yes',
      accessAllowed: 'yes',
      landStatus: 'public',
      legalConfidence: 'medium',
      observedAtIso: '2026-04-30T15:00:00.000Z',
      staleAfterMinutes: 30,
      sourceSummary: 'Stale public access fixture.',
    },
  ], ['camp-stale']);
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  const staleEnrichment = mergeFor('camp-stale', staleBundle);
  assert.strictEqual(staleEnrichment.legalStatus, 'unknown', 'Stale medium-confidence allowed data should not upgrade legal status.');
  assert.ok(staleEnrichment.dataLimitations.some((item) => item.includes('stale')));

  const allowedProvider = new campops.CampOpsLegalAccessSourceProvider({
    id: 'official-open',
    displayName: 'Official Open Fixture',
    records: [
      {
        candidateId: 'camp-conflict-official',
        source: 'offline_dataset',
        campingAllowed: 'yes',
        accessAllowed: 'yes',
        landStatus: 'public',
        legalConfidence: 'high',
        observedAtIso: '2026-04-30T17:50:00.000Z',
      },
    ],
  });
  const lowRestrictionProvider = new campops.CampOpsLegalAccessSourceProvider({
    id: 'community-low-restriction',
    displayName: 'Community Low Restriction Fixture',
    sourceConfidence: 'low',
    records: [
      {
        candidateId: 'camp-conflict-official',
        source: 'community',
        campingAllowed: 'no',
        accessAllowed: 'restricted',
        landStatus: 'public',
        legalConfidence: 'low',
        observedAtIso: '2026-04-30T17:55:00.000Z',
      },
    ],
  });
  const officialConflictBundle = await campops.collectCampOpsSourceProviderBundle({
    providers: [allowedProvider, lowRestrictionProvider],
    context,
    candidates: [candidate('camp-conflict-official')],
  });
  assert.ok(officialConflictBundle.warnings.some((warning) => warning.includes('Conflicting legalStatus')));
  const officialConflictEnrichment = mergeFor('camp-conflict-official', officialConflictBundle);
  assert.strictEqual(
    officialConflictEnrichment.legalStatus,
    'allowed',
    'Low-confidence restrictive community signal should not override high-confidence official open signal.',
  );

  const staleOpenProvider = new campops.CampOpsLegalAccessSourceProvider({
    id: 'stale-open',
    displayName: 'Stale Open Fixture',
    records: [
      {
        candidateId: 'camp-conflict-stale',
        source: 'offline_dataset',
        campingAllowed: 'yes',
        accessAllowed: 'yes',
        landStatus: 'public',
        legalConfidence: 'high',
        observedAtIso: '2026-04-30T15:00:00.000Z',
        staleAfterMinutes: 30,
      },
    ],
  });
  const freshRestrictedProvider = new campops.CampOpsLegalAccessSourceProvider({
    id: 'fresh-restricted',
    displayName: 'Fresh Restricted Fixture',
    records: [
      {
        candidateId: 'camp-conflict-stale',
        source: 'offline_dataset',
        campingAllowed: 'unknown',
        accessAllowed: 'restricted',
        landStatus: 'public',
        legalConfidence: 'medium',
        observedAtIso: '2026-04-30T17:55:00.000Z',
        restrictionType: 'active_access_restriction',
      },
    ],
  });
  const staleConflictBundle = await campops.collectCampOpsSourceProviderBundle({
    providers: [staleOpenProvider, freshRestrictedProvider],
    context,
    candidates: [candidate('camp-conflict-stale')],
  });
  const staleConflictEnrichment = mergeFor('camp-conflict-stale', staleConflictBundle);
  assert.strictEqual(staleConflictEnrichment.closureStatus, 'restricted');
  assert.strictEqual(evaluate('camp-conflict-stale', staleConflictEnrichment).status, 'rejected');

  console.log('CampOps legal/access provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
