import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'closed-field-test-risk-acceptance-result.json');

const SIGN_OFF_FIELDS = [
  'Product owner',
  'Product approval date',
  'Safety owner',
  'Safety approval date',
  'Privacy owner',
  'Privacy approval date',
  'Engineering owner',
  'Engineering approval date',
];

const SCOPE_FIELDS = [
  'Approved tester cohort',
  'Maximum tester count',
  'Approved build identifier',
  'Approved app version/commit',
  'Approved region labels',
  'Approved route labels',
  'Approved scenario labels',
  'Expiration date',
  'Incident contact',
  'Rollback owner',
  'Rollback command/path',
];

const RISK_ACCEPTED_INCOMPLETE_ITEMS = [
  'Android/device QA evidence incomplete',
  'Android QA required fields incomplete',
  'Required Android QA scenario results incomplete',
  'Required Android QA visual-state results incomplete',
  'Screenshot/evidence references missing',
  'Provider category/region approval missing',
  'Privacy/storage approval incomplete',
  'Private debrief data owner approval incomplete',
];

const REQUIRED_RESTRICTIONS = [
  { id: 'ai_assist_must_be_disabled', pattern: /-\s*campopsAiAssistEnabled=false\b/i },
  { id: 'telemetry_must_be_disabled', pattern: /-\s*campopsTelemetryEnabled=false\b/i },
  { id: 'community_publishing_flag_must_be_disabled', pattern: /-\s*campopsDebriefCommunityPublishingEnabled=false\b/i },
  {
    id: 'provider_adapters_must_be_disabled_without_exact_approval',
    pattern: /-\s*campopsProviderAdaptersEnabled=false unless exact category\/region approval exists\b/i,
  },
  {
    id: 'provider_shadow_mode_may_be_enabled_only_for_validation',
    pattern: /-\s*campopsProviderValidationShadowModeEnabled may be true\b/i,
  },
  {
    id: 'unapproved_provider_output_must_remain_shadow_or_unknown',
    pattern: /Provider output must remain shadow-only(?:\/| or )unknown for unapproved categories/i,
  },
  { id: 'manual_feedback_required', pattern: /Manual privacy-safe feedback (?:is )?required after every session/i },
  { id: 'no_public_community_publishing', pattern: /No public\/community publishing/i },
  { id: 'no_raw_provider_payloads', pattern: /No raw provider payloads in shared evidence/i },
  { id: 'no_raw_ai_prompts', pattern: /No raw AI prompts/i },
  { id: 'no_private_coordinates', pattern: /No private coordinates in shared evidence/i },
  { id: 'no_private_user_ids', pattern: /No private user IDs/i },
  { id: 'no_vehicle_identifiers', pattern: /No vehicle identifiers/i },
  { id: 'no_private_debrief_notes', pattern: /No private debrief notes in shared evidence/i },
];

function pathsFor(root) {
  return {
    riskAcceptancePath: path.join(root, 'docs', 'campops', 'closed_field_test_risk_acceptance.md'),
    configPath: path.join(root, 'lib', 'campops', 'campOpsRecommendationConfig.ts'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function extractBulletValue(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^-\\s*${escaped}:[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : null;
}

function isFilled(value) {
  return Boolean(value && !/^(todo|tbd|n\/a|na|none|not applicable|not approved|not accepted|pending|incomplete|\s*)$/i.test(value.trim()));
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value ?? '');
}

function isNumeric(value) {
  return /^\d+$/.test(value ?? '') && Number(value) > 0;
}

function topLevelStatus(markdown) {
  return markdown.match(/^Status:\s*(.+)$/im)?.[1]?.trim() ?? null;
}

function decisionStatus(markdown) {
  const decisionStart = markdown.search(/^(?:##\s+)?Decision\s*:?\s*$/im);
  if (decisionStart < 0) return null;
  return extractBulletValue(markdown.slice(decisionStart), 'Status');
}

function valueAffirmsYes(markdown, label) {
  const value = extractBulletValue(markdown, label) ?? '';
  return /\byes\b/i.test(value) && !/\bno\b/i.test(value);
}

function detectConfigDefaultViolation(config) {
  const violations = [];
  for (const flag of [
    'campopsProviderAdaptersEnabled',
    'campopsAiAssistEnabled',
    'campopsDebriefCommunityPublishingEnabled',
    'campopsTelemetryEnabled',
  ]) {
    if (new RegExp(`${flag}:\\s*true\\b`).test(config)) {
      violations.push(`${flag}_default_true`);
    }
  }
  return violations;
}

export function buildClosedFieldTestRiskAcceptanceResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const { riskAcceptancePath, configPath } = pathsFor(root);
  const markdown = readIfExists(riskAcceptancePath);
  const config = readIfExists(configPath);
  const missingFiles = [];
  if (!markdown) missingFiles.push(path.relative(root, riskAcceptancePath));
  if (!config) missingFiles.push(path.relative(root, configPath));

  const status = topLevelStatus(markdown) ?? 'missing';
  const decision = decisionStatus(markdown) ?? 'missing';
  const missingFields = [];
  const hardRestrictionViolations = [];
  const riskAcceptedIncompleteItems = [];

  if (!/^accepted$/i.test(status)) missingFields.push('Status');
  if (!/^accepted$/i.test(decision)) missingFields.push('Decision Status');

  for (const field of SIGN_OFF_FIELDS) {
    const value = extractBulletValue(markdown, field);
    const complete = /date$/i.test(field) ? isDate(value) : isFilled(value);
    if (!complete) missingFields.push(field);
  }

  for (const field of SCOPE_FIELDS) {
    const value = extractBulletValue(markdown, field);
    let complete = isFilled(value);
    if (field === 'Maximum tester count') complete = isNumeric(value);
    if (field === 'Expiration date') complete = isDate(value);
    if (!complete) missingFields.push(field);
  }

  for (const item of RISK_ACCEPTED_INCOMPLETE_ITEMS) {
    if (valueAffirmsYes(markdown, item)) {
      riskAcceptedIncompleteItems.push(item);
    } else {
      missingFields.push(item);
    }
  }

  for (const restriction of REQUIRED_RESTRICTIONS) {
    if (!restriction.pattern.test(markdown)) hardRestrictionViolations.push(restriction.id);
  }

  hardRestrictionViolations.push(...detectConfigDefaultViolation(config));

  if (/campopsProviderAdaptersEnabled=true/i.test(markdown) && !/exact category\/region approval/i.test(markdown)) {
    hardRestrictionViolations.push('provider_adapters_enabled_without_exact_category_region_approval');
  }
  if (/campopsAiAssistEnabled=true/i.test(markdown) && !/exact .*model\/config .*approval/i.test(markdown)) {
    hardRestrictionViolations.push('ai_assist_enabled_without_exact_real_output_approval');
  }
  if (/campopsTelemetryEnabled=true/i.test(markdown) && !/sink\/privacy approval|sink.*approved/i.test(markdown)) {
    hardRestrictionViolations.push('telemetry_enabled_without_sink_privacy_approval');
  }
  if (/campopsDebriefCommunityPublishingEnabled=true/i.test(markdown)) {
    hardRestrictionViolations.push('community_publishing_enabled');
  }

  const acceptedBy = {
    productOwner: extractBulletValue(markdown, 'Product owner'),
    productApprovalDate: extractBulletValue(markdown, 'Product approval date'),
    safetyOwner: extractBulletValue(markdown, 'Safety owner'),
    safetyApprovalDate: extractBulletValue(markdown, 'Safety approval date'),
    privacyOwner: extractBulletValue(markdown, 'Privacy owner'),
    privacyApprovalDate: extractBulletValue(markdown, 'Privacy approval date'),
    engineeringOwner: extractBulletValue(markdown, 'Engineering owner'),
    engineeringApprovalDate: extractBulletValue(markdown, 'Engineering approval date'),
  };

  const passed =
    missingFiles.length === 0 &&
    missingFields.length === 0 &&
    hardRestrictionViolations.length === 0;

  return {
    passed,
    status: passed ? 'accepted' : 'not_accepted',
    documentStatus: status,
    decisionStatus: decision,
    acceptedBy,
    missingFiles,
    missingFields,
    hardRestrictionViolations: Array.from(new Set(hardRestrictionViolations)),
    riskAcceptedIncompleteItems,
    checkedAt: now.toISOString(),
    notes: [
      'Risk acceptance does not mark Android/device QA, provider readiness, or privacy/storage approval complete.',
      'Provider influence, AI assist, telemetry, and community publishing remain disabled unless separately approved.',
    ],
  };
}

export function writeClosedFieldTestRiskAcceptanceResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatClosedFieldTestRiskAcceptanceResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps closed field-test risk acceptance: ${result.passed ? 'ACCEPTED' : 'NOT ACCEPTED'}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
  ];
  if (result.missingFiles.length > 0) {
    lines.push('', 'Missing files:');
    for (const file of result.missingFiles) lines.push(`- ${file}`);
  }
  if (result.missingFields.length > 0) {
    lines.push('', 'Missing or incomplete required fields:');
    for (const field of result.missingFields) lines.push(`- ${field}`);
  }
  if (result.hardRestrictionViolations.length > 0) {
    lines.push('', 'Hard restriction violations:');
    for (const violation of result.hardRestrictionViolations) lines.push(`- ${violation}`);
  }
  if (result.riskAcceptedIncompleteItems.length > 0) {
    lines.push('', 'Risk-accepted incomplete items recorded:');
    for (const item of result.riskAcceptedIncompleteItems) lines.push(`- ${item}`);
  }
  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runClosedFieldTestRiskAcceptanceCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildClosedFieldTestRiskAcceptanceResult({ rootDir: root });
  writeClosedFieldTestRiskAcceptanceResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatClosedFieldTestRiskAcceptanceResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runClosedFieldTestRiskAcceptanceCli();
}
