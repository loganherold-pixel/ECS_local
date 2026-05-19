import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseApprovalOverrideGuardResult,
  runReleaseApprovalOverrideGuardCli,
} from './check-release-approval-overrides.mjs';

const rootDir = process.cwd();
const fixedNow = new Date('2026-05-17T12:00:00.000Z');

test('current repo release approval override guard passes', () => {
  const result = buildReleaseApprovalOverrideGuardResult({ rootDir, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'override_guards_enforced');
  assert.deepEqual(result.blockers, []);
});

test('current repo blocks forced AI assist without exact real-output approval', () => {
  const result = buildReleaseApprovalOverrideGuardResult({ rootDir, now: fixedNow });

  assert.equal(result.forcedResults.aiAssist.passed, false);
  assert.equal(result.forcedResults.aiAssist.status, 'enabled_unapproved_blocked');
  assert.ok(result.forcedResults.aiAssist.blockers.includes('ai_assist_enabled_without_exact_model_config_real_output_approval'));
  assert.ok(result.forcedResults.aiAssist.blockers.includes('ai_assist_enabled_without_real_model_execution_evidence'));
});

test('current repo blocks forced telemetry without sink/privacy approval', () => {
  const result = buildReleaseApprovalOverrideGuardResult({ rootDir, now: fixedNow });

  assert.equal(result.forcedResults.telemetry.passed, false);
  assert.equal(result.forcedResults.telemetry.status, 'enabled_unapproved_blocked');
  assert.ok(result.forcedResults.telemetry.blockers.includes('campops_telemetry_enabled_without_sink_privacy_approval'));
});

test('current repo blocks forced community publishing without privacy/product/moderation approval', () => {
  const result = buildReleaseApprovalOverrideGuardResult({ rootDir, now: fixedNow });

  assert.equal(result.forcedResults.communityPublishing.passed, false);
  assert.equal(result.forcedResults.communityPublishing.status, 'enabled_unapproved_blocked');
  assert.ok(result.forcedResults.communityPublishing.blockers.includes('campops_community_publishing_enabled_without_privacy_product_moderation_approval'));
});

test('override guard CLI emits JSON and writes result artifact', () => {
  let stdout = '';
  const exitCode = runReleaseApprovalOverrideGuardCli({
    rootDir,
    args: ['--json'],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout, /Release approval override guard:/);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'override_guards_enforced');
});
