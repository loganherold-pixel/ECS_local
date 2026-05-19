import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'ai-assist-approval-result.json');

const REQUIRED_REVIEW_FIELDS = [
  'Status',
  'Active model/config',
  'Approval status',
  'Approval date',
  'Approver',
  'Raw prompts excluded from shared docs',
  'Private data excluded',
  'AI assist enabled for closed field test',
  'AI may override hard gates',
];

function pathsFor(root) {
  return {
    reviewPath: path.join(root, 'docs', 'campops', 'ai_real_output_review.md'),
    rolloutPath: path.join(root, 'docs', 'campops', 'rollout.md'),
    readinessPath: path.join(root, 'docs', 'campops', 'closed_field_test_readiness.md'),
    configPath: path.join(root, 'lib', 'campops', 'campOpsRecommendationConfig.ts'),
    aiAssistPath: path.join(root, 'lib', 'campops', 'campOpsAiAssist.ts'),
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

function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'i');
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return '';
  const sectionLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    sectionLines.push(lines[index]);
  }
  return sectionLines.join('\n').trim();
}

function extractField(section, label) {
  const match = section.match(new RegExp(`^-\\s*${escapeRegExp(label)}:[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : null;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function yesNo(value) {
  const normalized = normalize(value);
  if (/^(yes|true|enabled)$/i.test(normalized)) return true;
  if (/^(no|false|disabled)$/i.test(normalized)) return false;
  return null;
}

function isFilled(value) {
  return Boolean(value && !/^(todo|tbd|none|not run|not approved|pending|incomplete)$/i.test(value.trim()));
}

function isApprovalDate(value) {
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value ?? '');
}

function isApprovalDateOnOrBefore(value, now) {
  if (!isApprovalDate(value)) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function detectFeatureFlagDefault(config) {
  if (!config) return 'unknown';
  if (/campopsAiAssistEnabled:\s*false\b/.test(config)) return false;
  if (/campopsAiAssistEnabled:\s*true\b/.test(config)) return true;
  return 'unknown';
}

function detectRuntimeApprovalGate(config) {
  return /aiAssistRealOutputReviewApproved/.test(config) &&
    /requestedFlag\(requested,\s*['"]campopsAiAssistEnabled['"]\)/.test(config) &&
    /safeRequested\.campopsAiAssistEnabled\s*=\s*true/.test(config);
}

function detectAiEnabledForClosedFieldTest({ reviewSection, readiness, rollout, args }) {
  if (args.includes('--ai-enabled') || process.env.CAMPOPS_AI_ASSIST_ENABLED === '1') return true;
  if (args.includes('--ai-disabled') || process.env.CAMPOPS_AI_ASSIST_ENABLED === '0') return false;

  const reviewValue = yesNo(extractField(reviewSection, 'AI assist enabled for closed field test'));
  if (reviewValue != null) return reviewValue;

  const combined = `${readiness}\n${rollout}`;
  if (/\bcampopsAiAssistEnabled\s*=\s*true\b/i.test(combined)) return true;
  if (/\bcampopsAiAssistEnabled\s*=\s*false\b/i.test(combined)) return false;
  if (/\bAI assist remains disabled\b|\bAI must remain off\b|\bAI assist .*disabled unless/i.test(combined)) return false;
  return false;
}

function detectRawPromptEvidence(markdown) {
  return markdown.split(/\r?\n/).some((line) =>
    /^\s*(?:raw\s+)?(?:ai\s+)?prompt\s*:/i.test(line) ||
    /BEGIN\s+(?:RAW\s+)?AI\s+PROMPT/i.test(line) ||
    /```(?:prompt|ai-prompt)/i.test(line)
  );
}

function detectPrivateEvidence(markdown) {
  return /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/.test(markdown) ||
    /\b(?:userId|vehicleId|tripId|privateUserId|rawAiPrompt|rawProviderPayload)\s*[:=]\s*[\w-]{4,}/i.test(markdown) ||
    /\b(?:private debrief notes?|raw provider payloads?)\s*[:=]\s*\S+/i.test(markdown);
}

function detectRealModelExecuted(markdown) {
  const match = markdown.match(/Real model executed in this report:\s*(yes|no|true|false)/i);
  if (!match) return false;
  return /^(yes|true)$/i.test(match[1]);
}

function detectAiHardGateGuardrails(aiAssistCode) {
  return /Do not override hard-gate rejections/i.test(aiAssistCode) &&
    /Hard-gate warnings .* must remain visible/i.test(aiAssistCode) &&
    /Unknown legal status must never be narrated as allowed/i.test(aiAssistCode);
}

function approvalComplete({ status, approvalStatus, activeModelConfig, approvalDate, approver, realModelExecuted, now }) {
  return /^completed?|run|approved$/i.test(status ?? '') &&
    /^approved$/i.test(approvalStatus ?? '') &&
    isFilled(activeModelConfig) &&
    isApprovalDateOnOrBefore(approvalDate, now) &&
    isFilled(approver) &&
    realModelExecuted === true;
}

function realOutputReviewApproved({ status, approvalStatus, approvalDate, approver, realModelExecuted, now }) {
  return /^completed?|run|approved$/i.test(status ?? '') &&
    /^approved$/i.test(approvalStatus ?? '') &&
    isApprovalDateOnOrBefore(approvalDate, now) &&
    isFilled(approver) &&
    realModelExecuted === true;
}

export function buildAiAssistApprovalResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const args = options.args ?? [];
  const {
    reviewPath,
    rolloutPath,
    readinessPath,
    configPath,
    aiAssistPath,
  } = pathsFor(root);

  const review = readIfExists(reviewPath);
  const rollout = readIfExists(rolloutPath);
  const readiness = readIfExists(readinessPath);
  const config = readIfExists(configPath);
  const aiAssistCode = readIfExists(aiAssistPath);
  const missingFiles = [];
  if (!review) missingFiles.push(path.relative(root, reviewPath));
  if (!config) missingFiles.push(path.relative(root, configPath));
  if (!aiAssistCode) missingFiles.push(path.relative(root, aiAssistPath));

  const reviewSection = extractSection(review, 'AI Real-Output Review');
  const missingReviewFields = reviewSection
    ? REQUIRED_REVIEW_FIELDS.filter((field) => extractField(reviewSection, field) == null)
    : REQUIRED_REVIEW_FIELDS;

  const reviewStatus = extractField(reviewSection, 'Status');
  const activeModelConfig = extractField(reviewSection, 'Active model/config');
  const approvalStatus = extractField(reviewSection, 'Approval status');
  const approvalDate = extractField(reviewSection, 'Approval date');
  const approver = extractField(reviewSection, 'Approver');
  const rawPromptsExcluded = yesNo(extractField(reviewSection, 'Raw prompts excluded from shared docs'));
  const privateDataExcluded = yesNo(extractField(reviewSection, 'Private data excluded'));
  const aiMayOverrideHardGates = yesNo(extractField(reviewSection, 'AI may override hard gates'));
  const realModelExecuted = detectRealModelExecuted(review);
  const aiAssistEnabledForClosedFieldTest = detectAiEnabledForClosedFieldTest({
    reviewSection,
    readiness,
    rollout,
    args,
  });

  const realOutputApproved = realOutputReviewApproved({
    status: reviewStatus,
    approvalStatus,
    approvalDate,
    approver,
    realModelExecuted,
    now,
  });
  const approvedForActiveConfig = approvalComplete({
    status: reviewStatus,
    approvalStatus,
    activeModelConfig,
    approvalDate,
    approver,
    realModelExecuted,
    now,
  });
  const featureFlagDefault = detectFeatureFlagDefault(config);
  const runtimeApprovalGatePresent = detectRuntimeApprovalGate(config);
  const hardGateGuardrailsPresent = detectAiHardGateGuardrails(aiAssistCode);
  const rawPromptEvidencePresent = detectRawPromptEvidence(review);
  const privateEvidencePresent = detectPrivateEvidence(review);

  const blockers = [];
  if (missingFiles.length > 0) blockers.push('ai_assist_required_file_missing');
  if (!reviewSection) blockers.push('ai_real_output_review_status_section_missing');
  if (missingReviewFields.length > 0) blockers.push('ai_real_output_review_required_fields_missing');
  if (featureFlagDefault !== false) blockers.push('campops_ai_assist_default_not_false');
  if (!runtimeApprovalGatePresent) blockers.push('ai_assist_runtime_approval_gate_missing');
  if (!hardGateGuardrailsPresent) blockers.push('ai_assist_hard_gate_guardrails_missing');
  if (rawPromptsExcluded !== true) blockers.push('raw_prompts_not_explicitly_excluded_from_shared_docs');
  if (privateDataExcluded !== true) blockers.push('private_data_not_explicitly_excluded_from_shared_docs');
  if (aiMayOverrideHardGates !== false) blockers.push('ai_hard_gate_override_not_explicitly_forbidden');
  if (rawPromptEvidencePresent) blockers.push('raw_ai_prompt_evidence_found_in_shared_review');
  if (privateEvidencePresent) blockers.push('private_data_evidence_found_in_shared_review');
  if (aiAssistEnabledForClosedFieldTest && !approvedForActiveConfig) {
    blockers.push('ai_assist_enabled_without_exact_model_config_real_output_approval');
  }
  if (aiAssistEnabledForClosedFieldTest && !realModelExecuted) {
    blockers.push('ai_assist_enabled_without_real_model_execution_evidence');
  }
  if (aiAssistEnabledForClosedFieldTest && !isApprovalDateOnOrBefore(approvalDate, now)) {
    blockers.push('ai_assist_enabled_without_current_or_past_approval_date');
  }

  const hardGateOverrideAllowed = aiMayOverrideHardGates !== false;
  const status = hardGateOverrideAllowed
    ? 'unsafe_override_blocked'
    : aiAssistEnabledForClosedFieldTest
      ? (approvedForActiveConfig ? 'enabled_approved' : 'enabled_unapproved_blocked')
      : 'disabled_restricted_pass';

  return {
    passed: blockers.length === 0,
    status,
    aiAssistEnabled: aiAssistEnabledForClosedFieldTest,
    realOutputReviewApproved: realOutputApproved,
    activeModelConfigApproved: approvedForActiveConfig,
    hardGateOverrideAllowed,
    checkedAt: now.toISOString(),
    missingFiles,
    missingReviewFields,
    blockers,
    approval: {
      reviewStatus: reviewStatus ?? null,
      activeModelConfig: activeModelConfig ?? null,
      approvalStatus: approvalStatus ?? null,
      approvalDate: approvalDate ?? null,
      approver: approver ?? null,
      realOutputReviewApproved: realOutputApproved,
      approvedForActiveConfig,
      realModelExecuted,
      aiAssistEnabledForClosedFieldTest,
      rawPromptsExcluded,
      privateDataExcluded,
      aiMayOverrideHardGates,
    },
    config: {
      featureFlagDefault,
      runtimeApprovalGatePresent,
      hardGateGuardrailsPresent,
    },
    evidence: {
      rawPromptEvidencePresent,
      privateEvidencePresent,
    },
    notes: [
      'Passing while AI assist is disabled does not approve AI assist for closed field testing.',
      'AI assist can be enabled only after exact active model/config real-output approval is recorded.',
      'AI output must never override CampOps hard gates, provider truth, privacy gates, or stale/missing warnings.',
    ],
  };
}

export function writeAiAssistApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatAiAssistApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps AI assist approval: ${result.passed ? 'PASS' : 'BLOCKED'}`,
    `AI assist posture: ${result.status}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    '',
    'Review state:',
    `- Status: ${result.approval.reviewStatus ?? 'missing'}`,
    `- Active model/config: ${result.approval.activeModelConfig || 'not approved'}`,
    `- Approval status: ${result.approval.approvalStatus ?? 'missing'}`,
    `- AI assist enabled for closed field test: ${result.approval.aiAssistEnabledForClosedFieldTest ? 'yes' : 'no'}`,
    `- Real model executed in this report: ${result.approval.realModelExecuted ? 'yes' : 'no'}`,
    `- Real-output review approved: ${result.realOutputReviewApproved ? 'yes' : 'no'}`,
    `- Active model/config approved: ${result.activeModelConfigApproved ? 'yes' : 'no'}`,
    `- AI may override hard gates: ${result.hardGateOverrideAllowed ? 'yes' : 'no'}`,
  ];

  if (result.blockers.length > 0) {
    lines.push('', 'AI assist blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  lines.push('', 'Guardrails:');
  lines.push(`- campopsAiAssistEnabled default false: ${result.config.featureFlagDefault === false ? 'yes' : 'no'}`);
  lines.push(`- Runtime approval gate present: ${result.config.runtimeApprovalGatePresent ? 'yes' : 'no'}`);
  lines.push(`- Hard-gate guardrails present: ${result.config.hardGateGuardrailsPresent ? 'yes' : 'no'}`);
  lines.push(`- Raw prompt evidence found: ${result.evidence.rawPromptEvidencePresent ? 'yes' : 'no'}`);
  lines.push(`- Private data evidence found: ${result.evidence.privateEvidencePresent ? 'yes' : 'no'}`);

  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runAiAssistApprovalCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildAiAssistApprovalResult({ rootDir: root, args });
  writeAiAssistApprovalResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatAiAssistApprovalResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runAiAssistApprovalCli();
}
