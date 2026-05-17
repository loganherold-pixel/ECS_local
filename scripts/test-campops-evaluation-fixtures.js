const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');
const { campOpsEvaluationFixtures } = require(path.join(root, 'fixtures', 'campops', 'evaluationFixtures.js'));

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web', select: (values) => values?.web ?? values?.default } };
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

const campops = require(campOpsPath);

const CONFIDENCE_ORDER = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function buildEvaluationSet(fixture) {
  const enrichmentsByCandidateId = {};
  const hardGateEvaluationsByCandidateId = {};
  const suitabilityScoresByCandidateId = {};

  for (const candidate of fixture.candidates) {
    const enriched = campops.attachCampResourceDebt({
      context: fixture.context,
      candidate,
      enrichment: fixture.enrichments[candidate.id],
    });
    enrichmentsByCandidateId[candidate.id] = enriched;
    hardGateEvaluationsByCandidateId[candidate.id] = campops.evaluateCampCandidateHardGates({
      context: fixture.context,
      candidate,
      enrichment: enriched,
    });
    suitabilityScoresByCandidateId[candidate.id] = campops.scoreCampSuitability({
      context: fixture.context,
      candidate,
      enrichment: enriched,
      hardGateEvaluation: hardGateEvaluationsByCandidateId[candidate.id],
    });
  }

  return {
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
    recommendationSet: campops.generateCampRecommendationSet({
      context: fixture.context,
      candidates: fixture.candidates,
      enrichmentsByCandidateId,
      hardGateEvaluationsByCandidateId,
      suitabilityScoresByCandidateId,
    }),
  };
}

function assertIncludesAll(actual, expected, label) {
  for (const expectedValue of expected ?? []) {
    assert.ok(
      actual.includes(expectedValue),
      `${label} should include ${expectedValue}; got ${JSON.stringify(actual)}`,
    );
  }
}

function assertScenario(fixture) {
  const { recommendationSet, hardGateEvaluationsByCandidateId, suitabilityScoresByCandidateId } = buildEvaluationSet(fixture);
  const expected = fixture.expected;
  const rejectedIds = recommendationSet.rejectedCandidates.map((item) => item.candidate.id);
  const warnings = recommendationSet.warnings.join(' | ');

  if (expected.recommendedCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.recommendedCamp?.id ?? null,
      expected.recommendedCampId,
      `${fixture.id}: recommended camp mismatch`,
    );
  }
  if (expected.backupCampId !== undefined) {
    assert.strictEqual(recommendationSet.backupCamp?.id ?? null, expected.backupCampId, `${fixture.id}: backup camp mismatch`);
  }
  if (expected.emergencyCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.emergencyCamp?.id ?? null,
      expected.emergencyCampId,
      `${fixture.id}: emergency camp mismatch`,
    );
  }
  if (expected.weatherFallbackCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.weatherFallbackCamp?.id ?? null,
      expected.weatherFallbackCampId,
      `${fixture.id}: weather fallback mismatch`,
    );
  }
  if (expected.trailerSafeCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.trailerSafeCamp?.id ?? null,
      expected.trailerSafeCampId,
      `${fixture.id}: trailer-safe camp mismatch`,
    );
  }
  if (expected.resupplyCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.resupplyCamp?.id ?? null,
      expected.resupplyCampId,
      `${fixture.id}: resupply camp mismatch`,
    );
  }

  assertIncludesAll(rejectedIds, expected.rejectedCandidateIds, `${fixture.id}: rejected candidates`);

  for (const candidateId of expected.notRecommendedCandidateIds ?? []) {
    assert.notStrictEqual(
      recommendationSet.recommendedCamp?.id,
      candidateId,
      `${fixture.id}: ${candidateId} should not be primary recommendation`,
    );
  }

  for (const candidateId of expected.notConfidentCandidateIds ?? []) {
    const score = suitabilityScoresByCandidateId[candidateId];
    const gate = hardGateEvaluationsByCandidateId[candidateId];
    assert.ok(
      score?.hardGateStatus === 'unknown' ||
        (score?.scores.legal ?? 100) < 60 ||
        gate?.missingData.includes('legalConfidence'),
      `${fixture.id}: ${candidateId} should not be treated as confidently legal`,
    );
  }

  if (expected.primaryRoleCandidateId) {
    assert.ok(
      recommendationSet.rolesByCandidateId?.[expected.primaryRoleCandidateId]?.includes('primary'),
      `${fixture.id}: expected primary role for ${expected.primaryRoleCandidateId}`,
    );
  }

  if (expected.plannedDowngradeIncludes) {
    assert.ok(
      recommendationSet.explanations?.plannedCampDowngrade?.includes(expected.plannedDowngradeIncludes),
      `${fixture.id}: planned downgrade should mention ${expected.plannedDowngradeIncludes}`,
    );
  }

  if (expected.missingDataIncludes) {
    assert.ok(
      recommendationSet.confidenceSummary.missingDataFields.includes(expected.missingDataIncludes) ||
        Object.values(hardGateEvaluationsByCandidateId).some((gate) => gate.missingData.includes(expected.missingDataIncludes)),
      `${fixture.id}: missing data should include ${expected.missingDataIncludes}`,
    );
  }

  if (expected.warningsInclude) {
    assert.ok(warnings.includes(expected.warningsInclude), `${fixture.id}: warning should include ${expected.warningsInclude}`);
  }

  if (expected.confidenceAtMost) {
    assert.ok(
      CONFIDENCE_ORDER[recommendationSet.confidenceSummary.level] <= CONFIDENCE_ORDER[expected.confidenceAtMost],
      `${fixture.id}: confidence ${recommendationSet.confidenceSummary.level} should be at most ${expected.confidenceAtMost}`,
    );
  }

  return recommendationSet;
}

for (const fixture of campOpsEvaluationFixtures) {
  assertScenario(fixture);
}

const byId = new Map(campOpsEvaluationFixtures.map((fixture) => [fixture.id, fixture]));
const delaySet = assertScenario(byId.get('two_hour_delay'));
const aiRejected = campops.parseCampOpsAiAssistOutput(
  {
    headline: 'Use original camp',
    primaryRecommendation: {
      campId: 'original-scenic',
      status: 'recommended',
      summary: 'Use the original scenic camp.',
    },
    why: ['It is scenic.'],
    tradeoffs: [],
    risks: [],
    requiredActions: ['Continue.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'High.',
    convoyMessage: null,
  },
  {
    context: byId.get('two_hour_delay').context,
    recommendationSet: delaySet,
    mode: 'planning',
  },
);
assert.strictEqual(aiRejected.output.primaryRecommendation.status, 'not_recommended');
assert.ok(aiRejected.issues.some((issue) => issue.includes('rejected camp')));

const legalSet = assertScenario(byId.get('legal_uncertainty'));
const legalPayload = campops.buildCampOpsAiAssistPayload({
  context: byId.get('legal_uncertainty').context,
  recommendationSet: legalSet,
  mode: 'planning',
});
assert.ok(
  legalPayload.missingData.some((item) => item.includes('legal confidence is unknown')),
  'AI payload should mention unknown legal confidence.',
);

const windSet = assertScenario(byId.get('high_wind_exposed_ridge'));
const tradeoffSet = {
  ...windSet,
  explanations: {
    ...windSet.explanations,
    keyTradeoffs: ['Sheltered Draw trades ridge views for stronger weather margin.'],
  },
};
const windPrompt = campops.buildCampOpsAiAssistPrompt({
  context: byId.get('high_wind_exposed_ridge').context,
  recommendationSet: tradeoffSet,
  mode: 'planning',
});
assert.ok(windPrompt.includes('"tradeoffs"'), 'AI prompt payload should include top tradeoffs.');
assert.ok(windPrompt.includes('Sheltered Draw'), 'AI prompt should include selected camp tradeoff context.');

const fieldPrompt = campops.buildCampOpsAiAssistPrompt({
  context: byId.get('two_hour_delay').context,
  recommendationSet: delaySet,
  mode: 'field',
});
assert.ok(fieldPrompt.includes('Field mode: keep the headline'), 'Field-mode prompt should require concise output.');
assert.ok(fieldPrompt.includes('concise and conservative'), 'Field-mode prompt should be concise and conservative.');

console.log('CampOps evaluation fixture checks passed.');
