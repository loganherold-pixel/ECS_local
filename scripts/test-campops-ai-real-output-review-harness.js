const assert = require('assert');
require('./campops-react-native-test-shim');

const {
  SCENARIOS,
  runCampOpsAiRealOutputReview,
  renderMarkdown,
} = require('./campops-ai-real-output-review');

(async () => {
  const previousGate = process.env.CAMPOPS_AI_REAL_OUTPUT_REVIEW;
  process.env.CAMPOPS_AI_REAL_OUTPUT_REVIEW = '0';
  const review = await runCampOpsAiRealOutputReview({ forceDryRun: true });
  if (previousGate == null) {
    delete process.env.CAMPOPS_AI_REAL_OUTPUT_REVIEW;
  } else {
    process.env.CAMPOPS_AI_REAL_OUTPUT_REVIEW = previousGate;
  }

  assert.strictEqual(review.realModelExecuted, false, 'Harness must not call a model unless explicitly configured.');
  assert.strictEqual(review.readyForInternalTesters, false, 'Dry-run review must not mark AI assist ready for testers.');
  assert.strictEqual(review.scenarios.length, SCENARIOS.length, 'Harness should cover every configured adversarial scenario.');
  [
    'rejected_camp_appears_attractive',
    'unknown_legal_confidence',
    'low_legal_confidence',
    'stale_closure_source',
    'stale_weather_source',
    'fire_restriction_unknown',
    'fire_restriction_prohibits_campfires',
    'source_conflict',
    'emergency_fallback_only',
    'trailer_turnaround_unknown',
    'low_fuel',
    'low_water',
    'service_operating_hours_unknown',
    'offline_cached_stale_data',
  ].forEach((scenario) => {
    assert.ok(review.scenarios.some((row) => row.scenario === scenario), `Missing scenario ${scenario}`);
  });

  const rejected = review.scenarios.find((row) => row.scenario === 'rejected_camp_appears_attractive');
  assert.strictEqual(rejected.parsedPrimaryStatus, 'not_recommended');
  assert.ok(rejected.guardrailInterventions.some((item) => item.includes('rejected camp')));

  const staleClosure = review.scenarios.find((row) => row.scenario === 'stale_closure_source');
  assert.ok(staleClosure.softenedPhrases.includes('unsupported open'), 'Stale closure review should soften unsupported open wording.');
  assert.ok(staleClosure.guardrailInterventions.some((item) => item.includes('closure/access data as open')));

  const sourceConflict = review.scenarios.find((row) => row.scenario === 'source_conflict');
  assert.ok(sourceConflict.conflictWarningCount > 0, 'Source conflict scenario should preserve conflict warnings.');

  const fireUnknown = review.scenarios.find((row) => row.scenario === 'fire_restriction_unknown');
  assert.ok(fireUnknown.missingWarningCount > 0, 'Unknown fire restriction scenario should preserve missing warnings.');

  const markdown = renderMarkdown(review);
  assert.ok(markdown.includes('Raw model output is parsed in memory only'));
  assert.ok(markdown.includes('AI assist is not ready for internal field testers'));
  assert.ok(!/39\.\d{3,}|-119\.\d{3,}|user-private|vehicle-private|trip-private|private debrief note/i.test(markdown));

  console.log('CampOps AI real-output review harness checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
