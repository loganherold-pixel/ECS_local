import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildAiAssistApprovalResult } from './check-ai-assist-approval.mjs';
import { buildCampOpsPublishingTelemetryApprovalResult } from './check-campops-publishing-telemetry-approval.mjs';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'release-approval-overrides-result.json');

function pathsFor(root) {
  return {
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function includesBlocker(result, blocker) {
  return Array.isArray(result.blockers) && result.blockers.includes(blocker);
}

export function buildReleaseApprovalOverrideGuardResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();

  const aiDisabled = buildAiAssistApprovalResult({ rootDir: root, now });
  const aiForced = buildAiAssistApprovalResult({ rootDir: root, now, args: ['--ai-enabled'] });
  const publishingDisabled = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now });
  const telemetryForced = buildCampOpsPublishingTelemetryApprovalResult({
    rootDir: root,
    now,
    args: ['--telemetry-enabled'],
  });
  const communityForced = buildCampOpsPublishingTelemetryApprovalResult({
    rootDir: root,
    now,
    args: ['--community-enabled'],
  });

  const checks = [
    {
      id: 'ai_assist_disabled_current_posture',
      passed: aiDisabled.passed && aiDisabled.status === 'disabled_restricted_pass' && aiDisabled.aiAssistEnabled === false,
    },
    {
      id: 'ai_assist_forced_enable_blocks',
      passed: !aiForced.passed &&
        aiForced.status === 'enabled_unapproved_blocked' &&
        includesBlocker(aiForced, 'ai_assist_enabled_without_exact_model_config_real_output_approval'),
    },
    {
      id: 'telemetry_community_disabled_current_posture',
      passed: publishingDisabled.passed &&
        publishingDisabled.status === 'disabled_restricted_pass' &&
        publishingDisabled.posture.telemetryEnabled === false &&
        publishingDisabled.posture.communityPublishingEnabled === false,
    },
    {
      id: 'telemetry_forced_enable_blocks',
      passed: !telemetryForced.passed &&
        telemetryForced.status === 'enabled_unapproved_blocked' &&
        includesBlocker(telemetryForced, 'campops_telemetry_enabled_without_sink_privacy_approval'),
    },
    {
      id: 'community_forced_enable_blocks',
      passed: !communityForced.passed &&
        communityForced.status === 'enabled_unapproved_blocked' &&
        includesBlocker(communityForced, 'campops_community_publishing_enabled_without_privacy_product_moderation_approval'),
    },
  ];

  const blockers = checks
    .filter((check) => !check.passed)
    .map((check) => `release_approval_override_guard_failed:${check.id}`);

  return {
    passed: blockers.length === 0,
    status: blockers.length === 0 ? 'override_guards_enforced' : 'override_guard_failed',
    checkedAt: now.toISOString(),
    blockers,
    checks,
    forcedResults: {
      aiAssist: {
        passed: aiForced.passed,
        status: aiForced.status,
        blockers: aiForced.blockers,
      },
      telemetry: {
        passed: telemetryForced.passed,
        status: telemetryForced.status,
        blockers: telemetryForced.blockers,
      },
      communityPublishing: {
        passed: communityForced.passed,
        status: communityForced.status,
        blockers: communityForced.blockers,
      },
    },
    notes: [
      'This guard verifies disabled systems fail closed when force-enabled without approval evidence.',
      'Passing this guard does not approve AI assist, telemetry, or community publishing.',
    ],
  };
}

export function writeReleaseApprovalOverrideGuardResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatReleaseApprovalOverrideGuardResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Release approval override guard: ${result.passed ? 'PASS' : 'BLOCKED'}`,
    `Posture: ${result.status}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    '',
    'Override checks:',
  ];
  for (const check of result.checks) lines.push(`- ${check.id}: ${check.passed ? 'passed' : 'failed'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export function runReleaseApprovalOverrideGuardCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildReleaseApprovalOverrideGuardResult({ rootDir: root });
  writeReleaseApprovalOverrideGuardResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatReleaseApprovalOverrideGuardResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runReleaseApprovalOverrideGuardCli();
}
