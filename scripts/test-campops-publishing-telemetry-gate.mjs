import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCampOpsPublishingTelemetryApprovalResult,
  runCampOpsPublishingTelemetryApprovalCli,
} from './check-campops-publishing-telemetry-approval.mjs';

const fixedNow = new Date('2026-05-01T12:00:00.000Z');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'campops-publishing-telemetry-gate-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function privacyDoc(overrides = {}) {
  return [
    '# CampOps Privacy Storage Review',
    '',
    '## Approval Packet',
    '',
    '- Approval status: approved for guarded closed-field private/local use only',
    `- Telemetry posture: ${overrides.telemetryPosture ?? 'disabled unless separately approved'}`,
    `- Telemetry sink: ${overrides.telemetrySink ?? 'not approved'}`,
    `- Community publishing: ${overrides.communityPublishing ?? 'disabled'}`,
    '- Remaining issues: Broader rollout still requires a separate review for telemetry sinks, community publishing, encryption-backed storage, and public-safe export workflow.',
    '',
  ].join('\n');
}

function observabilityDoc() {
  return [
    '# CampOps Observability',
    '',
    'Telemetry is disabled by default and has no default sink, so no event is emitted unless a caller opts in.',
    'A caller must configure `campopsTelemetryEnabled: true`, provide a sink, and set `campopsTelemetrySinkApproved: true` after the sink has been approved.',
    'Only sink-approved aggregate payloads are allowed.',
    '',
  ].join('\n');
}

function debriefDoc() {
  return [
    '# CampOps Debrief',
    '',
    'Community-visible publishing requires explicit consent and `campopsDebriefCommunityPublishingEnabled`.',
    'Public-safe output is allowed only when the publishing state is `approved_anonymized`.',
    'Rejected, removed, draft, and pending-review debriefs must not produce community-visible output.',
    '',
  ].join('\n');
}

function configSource(options = {}) {
  return [
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG = {',
    `  campopsTelemetryEnabled: ${options.telemetryDefault ?? 'false'},`,
    `  campopsDebriefCommunityPublishingEnabled: ${options.communityDefault ?? 'false'},`,
    '};',
    'safeRequested.campopsTelemetryEnabled =',
    "  input.telemetrySinkPrivacyApproved === true &&",
    "  requestedFlag(requested, 'campopsTelemetryEnabled');",
    'safeRequested.campopsDebriefCommunityPublishingEnabled =',
    "  input.communityPublishingApproved === true &&",
    "  requestedFlag(requested, 'campopsDebriefCommunityPublishingEnabled');",
    'const restricted = {',
    '  campopsTelemetryEnabled:',
    "    input.telemetrySinkPrivacyApproved === true && requestedFlag(requested, 'campopsTelemetryEnabled'),",
    '  campopsDebriefCommunityPublishingEnabled:',
    "    input.communityPublishingApprovedForExactGovernance === true && requestedFlag(requested, 'campopsDebriefCommunityPublishingEnabled'),",
    '};',
    '',
  ].join('\n');
}

function telemetrySource(options = {}) {
  if (options.missingRuntimeGuard) return 'const DEFAULT_CONFIG = { campopsTelemetryEnabled: true };\n';
  return [
    'const DEFAULT_CONFIG = {',
    '  campopsTelemetryEnabled: false,',
    '  campopsTelemetrySinkApproved: false,',
    '  sink: null,',
    '};',
    'const FORBIDDEN_TELEMETRY_KEYS = new Set([]);',
    'function validateCampOpsTelemetryRawPayload() {}',
    'function emitCampOpsTelemetryEvent() {',
    '  if (!telemetryEnabled || !telemetryConfig.sink || !sinkApproved) return null;',
    '}',
    '',
  ].join('\n');
}

function debriefSource(options = {}) {
  if (options.missingCommunityGuard) return 'export function buildCampOpsCommunitySafeDebrief() { return {}; }\n';
  return [
    'export function buildCampOpsCommunitySafeDebrief(record, options = {}) {',
    '  if (!isCampOpsDebriefCommunityPublishingFeatureEnabled(options.rolloutConfig ?? {})) return null;',
    "  if (record.publishingState !== 'approved_anonymized') return null;",
    '  if (!record.privacy.publishingConsent) return null;',
    '  return { sourceVisibility: record.visibility, publishingState: \'approved_anonymized\' };',
    '}',
    '',
  ].join('\n');
}

function writeFixtureRepo(root, options = {}) {
  writeFile(root, 'docs/campops/privacy_storage_review.md', privacyDoc(options.privacy));
  writeFile(root, 'docs/campops/observability.md', observabilityDoc());
  writeFile(root, 'docs/campops/debrief.md', debriefDoc());
  writeFile(root, 'docs/campops/rollout.md', 'Telemetry and community publishing remain disabled unless separately approved.\n');
  writeFile(root, 'lib/campops/campOpsRecommendationConfig.ts', configSource(options.config));
  writeFile(root, 'lib/campops/campOpsTelemetry.ts', telemetrySource(options.telemetry));
  writeFile(root, 'lib/campops/campOpsDebrief.ts', debriefSource(options.debriefCode));
}

test('disabled telemetry and community publishing pass with guarded posture', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root);

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'disabled_restricted_pass');
  assert.equal(result.posture.telemetryEnabled, false);
  assert.equal(result.posture.communityPublishingEnabled, false);
});

test('telemetry enabled without sink approval fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    privacy: {
      telemetryPosture: 'enabled',
      telemetrySink: 'not approved',
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'enabled_unapproved_blocked');
  assert.ok(result.blockers.includes('campops_telemetry_enabled_without_sink_privacy_approval'));
});

test('community publishing enabled without approval fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    privacy: {
      communityPublishing: 'enabled',
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'enabled_unapproved_blocked');
  assert.ok(result.blockers.includes('campops_community_publishing_enabled_without_privacy_product_moderation_approval'));
});

test('approved telemetry and community publishing can pass', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    privacy: {
      telemetryPosture: 'enabled',
      telemetrySink: 'approved by privacy/product owner',
      communityPublishing: 'approved by privacy/product/moderation owner',
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'enabled_approved');
  assert.equal(result.posture.telemetrySinkApproved, true);
  assert.equal(result.posture.communityPublishingApproved, true);
});

test('missing runtime telemetry guard fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    telemetry: {
      missingRuntimeGuard: true,
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('campops_telemetry_runtime_sink_or_payload_guard_missing'));
});

test('missing community public-safe guard fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    debriefCode: {
      missingCommunityGuard: true,
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('campops_community_public_safe_runtime_guard_missing'));
});

test('non-false defaults fail', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    config: {
      telemetryDefault: 'true',
      communityDefault: 'true',
    },
  });

  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('campops_telemetry_default_not_false'));
  assert.ok(result.blockers.includes('campops_community_publishing_default_not_false'));
});

test('--json emits parseable JSON and writes result artifact', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root);

  let stdout = '';
  const exitCode = runCampOpsPublishingTelemetryApprovalCli({
    rootDir: root,
    args: ['--json'],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout, /CampOps telemetry\/community publishing approval:/);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'disabled_restricted_pass');
  assert.equal(parsed.passed, true);
  assert.ok(fs.existsSync(path.join(root, '.smoke', 'campops-publishing-telemetry-approval-result.json')));
});
