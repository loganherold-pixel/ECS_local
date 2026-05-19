import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'campops-publishing-telemetry-approval-result.json');

function pathsFor(root) {
  return {
    privacyPath: path.join(root, 'docs', 'campops', 'privacy_storage_review.md'),
    observabilityPath: path.join(root, 'docs', 'campops', 'observability.md'),
    debriefPath: path.join(root, 'docs', 'campops', 'debrief.md'),
    rolloutPath: path.join(root, 'docs', 'campops', 'rollout.md'),
    configPath: path.join(root, 'lib', 'campops', 'campOpsRecommendationConfig.ts'),
    telemetryPath: path.join(root, 'lib', 'campops', 'campOpsTelemetry.ts'),
    debriefCodePath: path.join(root, 'lib', 'campops', 'campOpsDebrief.ts'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractField(markdown, label) {
  const match = markdown.match(new RegExp(`^-\\s*${escapeRegExp(label)}:[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : null;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isEnabled(value) {
  return /\b(enabled|approved|yes|true)\b/i.test(value ?? '') && !/\bnot approved\b/i.test(value ?? '');
}

function isDisabled(value) {
  return /\b(disabled|off|false|no|not approved)\b/i.test(value ?? '');
}

function detectRuntimePosture({ args, envName, fieldValue, enabledArg, disabledArg }) {
  if (args.includes(enabledArg) || process.env[envName] === '1') return true;
  if (args.includes(disabledArg) || process.env[envName] === '0') return false;
  if (fieldValue && isDisabled(fieldValue)) return false;
  if (fieldValue && isEnabled(fieldValue)) return true;
  return false;
}

function detectDefaultFalse(config, flag) {
  return new RegExp(`${escapeRegExp(flag)}\\s*:\\s*false\\b`).test(config);
}

function detectTelemetryActivationGate(config) {
  const internal = /safeRequested\.campopsTelemetryEnabled\s*=\s*[\s\S]{0,180}telemetrySinkPrivacyApproved\s*===\s*true[\s\S]{0,180}requestedFlag\(requested,\s*['"]campopsTelemetryEnabled['"]\)/.test(config);
  const restricted = /campopsTelemetryEnabled\s*:\s*[\s\S]{0,180}telemetrySinkPrivacyApproved\s*===\s*true[\s\S]{0,180}requestedFlag\(requested,\s*['"]campopsTelemetryEnabled['"]\)/.test(config);
  return internal && restricted;
}

function detectCommunityActivationGate(config) {
  const internal = /safeRequested\.campopsDebriefCommunityPublishingEnabled\s*=\s*[\s\S]{0,180}communityPublishingApproved\s*===\s*true[\s\S]{0,180}requestedFlag\(requested,\s*['"]campopsDebriefCommunityPublishingEnabled['"]\)/.test(config);
  const restricted = /campopsDebriefCommunityPublishingEnabled\s*:\s*[\s\S]{0,180}communityPublishingApprovedForExactGovernance\s*===\s*true[\s\S]{0,180}requestedFlag\(requested,\s*['"]campopsDebriefCommunityPublishingEnabled['"]\)/.test(config);
  return internal && restricted;
}

function detectTelemetryRuntimeGuard(telemetryCode) {
  return /campopsTelemetryEnabled:\s*false\b/.test(telemetryCode) &&
    /sink:\s*null\b/.test(telemetryCode) &&
    /campopsTelemetrySinkApproved:\s*false\b/.test(telemetryCode) &&
    /if\s*\(\s*!telemetryEnabled\s*\|\|\s*!telemetryConfig\.sink\s*\|\|\s*!sinkApproved\s*\)\s*return\s+null/.test(telemetryCode) &&
    /validateCampOpsTelemetryRawPayload/.test(telemetryCode) &&
    /FORBIDDEN_TELEMETRY_KEYS/.test(telemetryCode);
}

function detectCommunityRuntimeGuard(debriefCode) {
  return /isCampOpsDebriefCommunityPublishingFeatureEnabled\(options\.rolloutConfig \?\? \{\}\)/.test(debriefCode) &&
    /record\.publishingState !== ['"]approved_anonymized['"]/.test(debriefCode) &&
    /record\.privacy\.publishingConsent/.test(debriefCode) &&
    /sourceVisibility:\s*record\.visibility/.test(debriefCode) &&
    /publishingState:\s*['"]approved_anonymized['"]/.test(debriefCode);
}

function detectDocsGuardrails({ observability, debrief }) {
  return {
    telemetryNoDefaultSink: /no default sink|disabled by default|no event is emitted/i.test(observability),
    telemetryRequiresSinkApproval: /campopsTelemetrySinkApproved:\s*true|sink has been approved|sink-approved/i.test(observability),
    communityConsentRequired: /explicit consent/i.test(debrief),
    communityApprovedAnonymizedRequired: /approved_anonymized/i.test(debrief),
    communityNonPublicStatesDocumented: /Rejected, removed, draft, and pending-review|draft, pending-review, rejected, and removed/i.test(debrief),
  };
}

function detectApproval(value) {
  const text = normalize(value);
  if (!text) return false;
  if (/not approved|disabled|blocked|tbd|pending|no-go/.test(text)) return false;
  return /\bapproved\b/.test(text);
}

export function buildCampOpsPublishingTelemetryApprovalResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? [];
  const now = options.now instanceof Date ? options.now : new Date();
  const paths = pathsFor(root);

  const privacy = readIfExists(paths.privacyPath);
  const observability = readIfExists(paths.observabilityPath);
  const debrief = readIfExists(paths.debriefPath);
  const rollout = readIfExists(paths.rolloutPath);
  const config = readIfExists(paths.configPath);
  const telemetryCode = readIfExists(paths.telemetryPath);
  const debriefCode = readIfExists(paths.debriefCodePath);

  const missingFiles = Object.entries({
    privacy: paths.privacyPath,
    observability: paths.observabilityPath,
    debrief: paths.debriefPath,
    rollout: paths.rolloutPath,
    config: paths.configPath,
    telemetry: paths.telemetryPath,
    debriefCode: paths.debriefCodePath,
  })
    .filter(([, filePath]) => !readIfExists(filePath))
    .map(([, filePath]) => path.relative(root, filePath));

  const telemetryPostureField = extractField(privacy, 'Telemetry posture');
  const telemetrySinkField = extractField(privacy, 'Telemetry sink');
  const communityPublishingField = extractField(privacy, 'Community publishing');

  const telemetryEnabled = detectRuntimePosture({
    args,
    envName: 'CAMPOPS_TELEMETRY_ENABLED',
    fieldValue: telemetryPostureField,
    enabledArg: '--telemetry-enabled',
    disabledArg: '--telemetry-disabled',
  });
  const communityPublishingEnabled = detectRuntimePosture({
    args,
    envName: 'CAMPOPS_COMMUNITY_PUBLISHING_ENABLED',
    fieldValue: communityPublishingField,
    enabledArg: '--community-enabled',
    disabledArg: '--community-disabled',
  });

  const telemetrySinkApproved = detectApproval(telemetrySinkField);
  const communityPublishingApproved = detectApproval(communityPublishingField);
  const docsGuardrails = detectDocsGuardrails({ observability, debrief });

  const configGuardrails = {
    telemetryDefaultFalse: detectDefaultFalse(config, 'campopsTelemetryEnabled'),
    communityDefaultFalse: detectDefaultFalse(config, 'campopsDebriefCommunityPublishingEnabled'),
    telemetryActivationGatePresent: detectTelemetryActivationGate(config),
    communityActivationGatePresent: detectCommunityActivationGate(config),
  };
  const runtimeGuardrails = {
    telemetryGuardPresent: detectTelemetryRuntimeGuard(telemetryCode),
    communityGuardPresent: detectCommunityRuntimeGuard(debriefCode),
  };

  const blockers = [];
  if (missingFiles.length > 0) blockers.push('campops_publishing_telemetry_required_file_missing');
  if (!configGuardrails.telemetryDefaultFalse) blockers.push('campops_telemetry_default_not_false');
  if (!configGuardrails.communityDefaultFalse) blockers.push('campops_community_publishing_default_not_false');
  if (!configGuardrails.telemetryActivationGatePresent) blockers.push('campops_telemetry_activation_approval_gate_missing');
  if (!configGuardrails.communityActivationGatePresent) blockers.push('campops_community_publishing_activation_approval_gate_missing');
  if (!runtimeGuardrails.telemetryGuardPresent) blockers.push('campops_telemetry_runtime_sink_or_payload_guard_missing');
  if (!runtimeGuardrails.communityGuardPresent) blockers.push('campops_community_public_safe_runtime_guard_missing');
  if (Object.values(docsGuardrails).some((value) => !value)) blockers.push('campops_publishing_telemetry_docs_guardrail_missing');
  if (telemetryEnabled && !telemetrySinkApproved) blockers.push('campops_telemetry_enabled_without_sink_privacy_approval');
  if (communityPublishingEnabled && !communityPublishingApproved) blockers.push('campops_community_publishing_enabled_without_privacy_product_moderation_approval');

  const status = telemetryEnabled || communityPublishingEnabled
    ? blockers.length === 0 ? 'enabled_approved' : 'enabled_unapproved_blocked'
    : 'disabled_restricted_pass';

  return {
    passed: blockers.length === 0,
    status,
    checkedAt: now.toISOString(),
    missingFiles,
    blockers,
    posture: {
      telemetryEnabled,
      telemetrySinkApproved,
      telemetryPosture: telemetryPostureField ?? null,
      telemetrySink: telemetrySinkField ?? null,
      communityPublishingEnabled,
      communityPublishingApproved,
      communityPublishing: communityPublishingField ?? null,
    },
    configGuardrails,
    runtimeGuardrails,
    docsGuardrails,
    notes: [
      'Passing while disabled does not approve telemetry or community publishing for broad release.',
      'Telemetry requires an explicit approved sink, payload validation, retention, access, and privacy review before enabling.',
      'Community debrief publishing requires explicit consent, feature flag approval, moderation approval, and approved_anonymized public-safe output only.',
    ],
  };
}

export function writeCampOpsPublishingTelemetryApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatCampOpsPublishingTelemetryApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps telemetry/community publishing approval: ${result.passed ? 'PASS' : 'BLOCKED'}`,
    `Posture: ${result.status}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    '',
    'Current approval state:',
    `- Telemetry enabled: ${result.posture.telemetryEnabled ? 'yes' : 'no'}`,
    `- Telemetry sink approved: ${result.posture.telemetrySinkApproved ? 'yes' : 'no'}`,
    `- Telemetry posture: ${result.posture.telemetryPosture ?? 'missing'}`,
    `- Telemetry sink: ${result.posture.telemetrySink ?? 'missing'}`,
    `- Community publishing enabled: ${result.posture.communityPublishingEnabled ? 'yes' : 'no'}`,
    `- Community publishing approved: ${result.posture.communityPublishingApproved ? 'yes' : 'no'}`,
    `- Community publishing: ${result.posture.communityPublishing ?? 'missing'}`,
    '',
    'Guardrails:',
    `- Telemetry default false: ${result.configGuardrails.telemetryDefaultFalse ? 'yes' : 'no'}`,
    `- Community publishing default false: ${result.configGuardrails.communityDefaultFalse ? 'yes' : 'no'}`,
    `- Telemetry activation approval gate: ${result.configGuardrails.telemetryActivationGatePresent ? 'yes' : 'no'}`,
    `- Community activation approval gate: ${result.configGuardrails.communityActivationGatePresent ? 'yes' : 'no'}`,
    `- Telemetry runtime sink/payload guard: ${result.runtimeGuardrails.telemetryGuardPresent ? 'yes' : 'no'}`,
    `- Community public-safe runtime guard: ${result.runtimeGuardrails.communityGuardPresent ? 'yes' : 'no'}`,
  ];

  if (result.blockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runCampOpsPublishingTelemetryApprovalCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root, args });
  writeCampOpsPublishingTelemetryApprovalResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatCampOpsPublishingTelemetryApprovalResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCampOpsPublishingTelemetryApprovalCli();
}
