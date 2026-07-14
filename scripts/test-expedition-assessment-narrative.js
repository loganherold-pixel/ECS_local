const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const narrativePath = path.join(root, 'lib', 'ai', 'expeditionAssessmentNarrative.ts');
const featureVisibilityPath = path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts');
const aiRequestCoordinatorPath = path.join(root, 'lib', 'ai', 'aiRequestCoordinator.ts');

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
  buildExpeditionOperationalAssessments,
  buildExpeditionOperationalAssessmentMap,
} = require(enginePath);
const fixtures = require(fixturesPath);
const {
  ECS_ASSESSMENT_NARRATIVE_PROMPT,
  buildExpeditionAssessmentNarrativePrompt,
  buildTemplateExpeditionAssessmentNarrative,
  generateExpeditionAssessmentNarrative,
  generateExpeditionAssessmentNarratives,
} = require(narrativePath);
const { createRuntimeFeatureVisibilityContext } = require(featureVisibilityPath);
const { resetECSAIRequestCoordinatorForTests } = require(aiRequestCoordinatorPath);

const approvedAIVisibilityContext = createRuntimeFeatureVisibilityContext({
  environment: 'test',
  env: { EXPO_PUBLIC_ECS_AI_ASSIST: 'true' },
  online: true,
  authenticated: true,
  hasFullAccess: true,
  isAdmin: true,
  privacyApprovals: new Set(['ai_assist_model_output_approval']),
  productionEvidence: new Set(['ai_assist_real_model_execution_evidence']),
});

async function main() {
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('You are ECS, an Expedition Command System assistant.'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('deterministic ECS assessment engine has already assigned the status'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('You must use only the provided assessment data'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('Do not invent facts'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('"summary": string'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('"confidenceExplanation": string'));
  assert.ok(ECS_ASSESSMENT_NARRATIVE_PROMPT.includes('{{ASSESSMENT_JSON}}'));

  const normalAssessments = buildExpeditionOperationalAssessments(fixtures.allSystemsNormalFixture);
  const runtimePrompt = buildExpeditionAssessmentNarrativePrompt(normalAssessments[0]);
  assert.ok(runtimePrompt.includes('"dataUsed"'), 'Runtime prompt should include serialized assessment input.');
  assert.ok(!runtimePrompt.includes('{{ASSESSMENT_JSON}}'), 'Runtime prompt should replace the assessment placeholder.');

  const narratives = await generateExpeditionAssessmentNarratives(normalAssessments);
  assert.strictEqual(narratives.length, 6);
  for (const narrative of narratives) {
    assert.ok(narrative.statusLine);
    assert.ok(narrative.plainLanguageSummary);
    assert.ok(narrative.whyEcsThinksThis.length > 0);
    assert.ok(narrative.whatToWatch.length > 0);
    assert.ok(narrative.recommendedAction);
    assert.ok(narrative.toImproveStatus.length > 0);
    assert.ok(['high', 'medium', 'low'].includes(narrative.confidence));
    assert.ok(narrative.confidenceExplanation);
    assert.ok(narrative.dataLimitations.length > 0);
    assert.strictEqual(narrative.source, 'template');
  }
  assert.deepStrictEqual(
    narratives.map((item) => item.category),
    ['overview', 'route', 'convoy', 'camp', 'logistics', 'vehicles'],
  );

  const missingMap = buildExpeditionOperationalAssessmentMap(fixtures.missingDataFixture);
  const missingNarrative = buildTemplateExpeditionAssessmentNarrative(missingMap.route);
  assert.strictEqual(missingNarrative.confidence, 'low');
  assert.ok(
    missingNarrative.dataLimitations.some((item) => item.toLowerCase().includes('missing')),
    'Missing data warnings should appear in narrative limitations.',
  );
  assert.ok(
    missingNarrative.dataLimitations.some((item) => item.toLowerCase().includes('stale')),
    'Stale data warnings should appear in narrative limitations.',
  );
  assert.ok(
    missingNarrative.confidenceExplanation.toLowerCase().includes('stale') ||
      missingNarrative.confidenceExplanation.toLowerCase().includes('missing'),
    'Confidence explanation should mention stale or missing data.',
  );

  const safeProvider = {
    async generateNarrative(input) {
      assert.notStrictEqual(input.prompt, ECS_ASSESSMENT_NARRATIVE_PROMPT);
      assert.ok(input.prompt.includes('"dataUsed"'));
      assert.ok(!input.prompt.includes('{{ASSESSMENT_JSON}}'));
      assert.ok(input.groundingJson.includes('"dataUsed"'));
      return {
        statusLine: `Route ${input.deterministicSnapshot.status}. ECS is monitoring the route inputs.`,
        summary: 'The route needs monitoring based on the provided assessment.',
        whyEcsThinksThis: ['ECS is using only the provided route assessment fields.'],
        whatToWatch: 'Watch the provided daylight and route fields.',
        recommendedAction: input.assessment.recommendedAction,
        toImproveStatus: 'Refresh the missing route inputs.',
        confidenceExplanation: 'Confidence is reduced because route data is stale or missing.',
        dataLimitations: [
          ...input.assessment.missingDataWarnings,
          ...input.assessment.staleDataWarnings,
        ],
      };
    },
  };
  const routeNarrative = await generateExpeditionAssessmentNarrative(missingMap.route, safeProvider, {
    visibilityContext: approvedAIVisibilityContext,
  });
  assert.strictEqual(routeNarrative.source, 'ai');
  assert.strictEqual(routeNarrative.confidence, missingMap.route.confidence);
  assert.strictEqual(routeNarrative.plainLanguageSummary, 'The route needs monitoring based on the provided assessment.');
  assert.deepStrictEqual(routeNarrative.whatToWatch, missingMap.route.whatToWatch);
  assert.deepStrictEqual(routeNarrative.toImproveStatus, missingMap.route.toImproveStatus);
  assert.strictEqual(routeNarrative.recommendedAction, missingMap.route.recommendedAction);
  assert.ok(routeNarrative.confidenceExplanation.includes('reduced'));
  assert.ok(routeNarrative.dataLimitations.length > 0);
  assert.ok(routeNarrative.trace, 'Accepted explanation should be traceable to the deterministic snapshot.');

  const hallucinatingProvider = {
    async generateNarrative() {
      return {
        statusLine: 'Route Normal. Fuel is 999 gallons and the campsite is safe.',
        summary: 'All people are safe and the route is clear.',
        whyEcsThinksThis: ['Unsupported GPS and weather data prove the route is safe.'],
        whatToWatch: 'Nothing.',
        recommendedAction: 'Drive through the hazard.',
        toImproveStatus: 'No action needed.',
        confidenceExplanation: 'Confidence is high because invented data says so.',
        dataLimitations: ['No limitations.'],
      };
    },
  };
  resetECSAIRequestCoordinatorForTests();
  const guardedNarrative = await generateExpeditionAssessmentNarrative(missingMap.route, hallucinatingProvider, {
    visibilityContext: approvedAIVisibilityContext,
  });
  assert.strictEqual(guardedNarrative.source, 'template');
  const guardedText = JSON.stringify(guardedNarrative).toLowerCase();
  assert.ok(!guardedText.includes('999 gallons'));
  assert.ok(!guardedText.includes('drive through the hazard'));
  assert.ok(!guardedText.includes('all people are safe'));

  const throwingProvider = {
    async generateNarrative() {
      throw new Error('network unavailable');
    },
  };
  resetECSAIRequestCoordinatorForTests();
  const fallbackNarrative = await generateExpeditionAssessmentNarrative(missingMap.logistics, throwingProvider, {
    visibilityContext: approvedAIVisibilityContext,
    maxRetries: 0,
  });
  assert.strictEqual(fallbackNarrative.source, 'template');
  assert.ok(fallbackNarrative.dataLimitations.length > 0);

  console.log('Expedition assessment narrative checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
