import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAiAssistApprovalResult,
  runAiAssistApprovalCli,
} from './check-ai-assist-approval.mjs';

const fixedNow = new Date('2026-05-01T12:00:00.000Z');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'campops-ai-assist-gate-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function reviewDoc(overrides = {}) {
  return [
    '# CampOps AI Real-Output Review',
    '',
    '## AI Real-Output Review',
    '',
    `- Status: ${overrides.status ?? 'not run'}`,
    `- Active model/config: ${overrides.activeModelConfig ?? ''}`,
    `- Approval status: ${overrides.approvalStatus ?? 'not approved'}`,
    `- Approval date: ${overrides.approvalDate ?? ''}`,
    `- Approver: ${overrides.approver ?? ''}`,
    `- Raw prompts excluded from shared docs: ${overrides.rawPromptsExcluded ?? 'yes'}`,
    `- Private data excluded: ${overrides.privateDataExcluded ?? 'yes'}`,
    `- AI assist enabled for closed field test: ${overrides.aiEnabled ?? 'no'}`,
    `- AI may override hard gates: ${overrides.overrideHardGates ?? 'no'}`,
    '',
    '## Raw Output Storage Policy',
    '',
    overrides.extraText ?? 'Raw model output is not written to shared docs.',
    '',
  ].join('\n');
}

function configSource(defaultValue = false, approvalGate = true) {
  const gateBlock = approvalGate
    ? "if (input.aiAssistRealOutputReviewApproved === true && requestedFlag(requested, 'campopsAiAssistEnabled')) {\n  safeRequested.campopsAiAssistEnabled = true;\n}"
    : "if (requestedFlag(requested, 'campopsAiAssistEnabled')) {\n  safeRequested.campopsAiAssistEnabled = true;\n}";
  return [
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG = {',
    `  campopsAiAssistEnabled: ${defaultValue ? 'true' : 'false'},`,
    '};',
    gateBlock,
    '',
  ].join('\n');
}

function aiAssistSource(guardrails = true) {
  return guardrails
    ? [
        "const AI_RULES = [",
        "  'Do not override hard-gate rejections.',",
        "  'Hard-gate warnings from CampOps must remain visible in the output.',",
        "  'Unknown legal status must never be narrated as allowed.',",
        '];',
        '',
      ].join('\n')
    : "const AI_RULES = ['Be helpful.'];\n";
}

function writeFixtureRepo(root, options = {}) {
  writeFile(root, 'docs/campops/ai_real_output_review.md', reviewDoc(options.review));
  writeFile(root, 'docs/campops/rollout.md', 'AI assist remains disabled unless exact model/config real-output review is approved.\n');
  writeFile(root, 'docs/campops/closed_field_test_readiness.md', 'campopsAiAssistEnabled=false\n');
  writeFile(root, 'lib/campops/campOpsRecommendationConfig.ts', configSource(options.defaultEnabled, options.approvalGate !== false));
  writeFile(root, 'lib/campops/campOpsAiAssist.ts', aiAssistSource(options.guardrails !== false));
}

test('AI assist disabled passes without real-output approval', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root);

  const result = buildAiAssistApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'disabled_restricted_pass');
  assert.equal(result.aiAssistEnabled, false);
  assert.equal(result.realOutputReviewApproved, false);
  assert.equal(result.activeModelConfigApproved, false);
  assert.equal(result.approval.approvedForActiveConfig, false);
});

test('AI assist enabled without approval fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    review: {
      aiEnabled: 'yes',
    },
  });

  const result = buildAiAssistApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'enabled_unapproved_blocked');
  assert.equal(result.aiAssistEnabled, true);
  assert.ok(result.blockers.includes('ai_assist_enabled_without_exact_model_config_real_output_approval'));
});

test('AI hard-gate override permission fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    review: {
      overrideHardGates: 'yes',
    },
  });

  const result = buildAiAssistApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'unsafe_override_blocked');
  assert.equal(result.hardGateOverrideAllowed, true);
  assert.ok(result.blockers.includes('ai_hard_gate_override_not_explicitly_forbidden'));
});

test('raw prompt evidence in shared review fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    review: {
      extraText: 'Prompt: recommend the private camp.',
    },
  });

  const result = buildAiAssistApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('raw_ai_prompt_evidence_found_in_shared_review'));
});

test('approved exact model/config can pass when AI is enabled', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    review: {
      status: 'complete',
      activeModelConfig: 'campops-fixture-model-v1 / field-summary-config-v1',
      approvalStatus: 'approved',
      approvalDate: '2026-05-01',
      approver: 'Product Safety Owner',
      aiEnabled: 'yes',
    },
  });

  const result = buildAiAssistApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'enabled_approved');
  assert.equal(result.aiAssistEnabled, true);
  assert.equal(result.realOutputReviewApproved, true);
  assert.equal(result.activeModelConfigApproved, true);
});

test('--json emits parseable JSON only and writes result artifact', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root);

  let stdout = '';
  const exitCode = runAiAssistApprovalCli({
    rootDir: root,
    args: ['--json'],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout, /CampOps AI assist approval:/);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'disabled_restricted_pass');
  assert.equal(parsed.passed, true);
  assert.equal(parsed.aiAssistEnabled, false);
  assert.ok(fs.existsSync(path.join(root, '.smoke', 'ai-assist-approval-result.json')));
});
