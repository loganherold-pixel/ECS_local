import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildCampOpsLiveReadinessResult } from './check-campops-live-readiness.mjs';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'closed-field-test-readiness-result.json');

const requiredSections = [
  { label: 'P0 issues', pattern: /\bP0 issues\b/i },
  { label: 'P1 recommendation-trust issues', pattern: /\bP1 recommendation-trust issues\b/i },
  { label: 'Provider readiness', pattern: /\bProvider readiness\b/i },
  { label: 'CampOps live readiness gates', pattern: /^##\s+Live Readiness Gates\b/im },
  { label: 'Android/device QA', pattern: /\bAndroid\/device QA\b/i },
  { label: 'Privacy/storage review', pattern: /\bPrivacy\/storage review\b/i },
  { label: 'Community publishing', pattern: /\bCommunity publishing\b/i },
  { label: 'Telemetry', pattern: /\bTelemetry\b/i },
  { label: 'AI assist', pattern: /\bAI assist\b/i },
  { label: 'Rollback path', pattern: /\bRollback path\b/i },
  { label: 'Field-test scenarios', pattern: /\bField-test scenarios\b/i },
  { label: 'Restricted field-test posture', pattern: /##\s+Restricted Field-Test Posture/i },
  { label: 'Provider influence limits', pattern: /##\s+Provider Influence Limits/i },
  { label: 'Required scenario set', pattern: /##\s+Required Scenario Set/i },
  { label: 'Explicit closed field-test blockers', pattern: /##\s+What Blocks Closed Field Testing/i },
];

const normalizedBlockerMessages = {
  closed_field_test_status_blocked: 'Closed field testing remains blocked.',
  android_device_qa_incomplete: 'Android/device QA evidence is still incomplete.',
  provider_readiness_not_approved: 'Provider readiness is not approved for real target region/category influence.',
  campops_live_readiness_not_closed_field_ready: 'CampOps live-readiness gates are not closed-field-test ready or risk-accepted.',
  privacy_storage_owner_approval_incomplete: 'Privacy/storage owner approval remains incomplete for closed field-test data posture.',
  ai_assist_enabled_without_approval: 'AI assist is enabled without approved real-output behavior for the active model/config.',
  ai_hard_gate_override_allowed: 'AI assist is allowed to override hard gates, which is not permitted.',
};

function pathsFor(root) {
  return {
    readinessPath: path.join(root, 'docs', 'campops', 'closed_field_test_readiness.md'),
    riskAcceptancePath: path.join(root, 'docs', 'campops', 'closed_field_test_risk_acceptance.md'),
    rolloutPath: path.join(root, 'docs', 'campops', 'rollout.md'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
    evidenceFilePaths: {
      internalBetaEvidence: path.join(root, 'docs', 'campops', 'internal_beta_evidence.md'),
      providerReadinessRegion001: path.join(root, 'docs', 'campops', 'provider_readiness_region_001.md'),
      mobileQaEvidence: path.join(root, 'docs', 'campops', 'mobile_qa_evidence.md'),
      privacyStorageReview: path.join(root, 'docs', 'campops', 'privacy_storage_review.md'),
      aiRealOutputReview: path.join(root, 'docs', 'campops', 'ai_real_output_review.md'),
      closedFieldTestRiskAcceptance: path.join(root, 'docs', 'campops', 'closed_field_test_risk_acceptance.md'),
    },
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function textMatches(markdown, patterns) {
  return patterns.some((pattern) => pattern.test(markdown ?? ''));
}

export function normalizeClosedFieldTestStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'blocked' || normalized === 'not_ready') return 'blocked';
  if (normalized === 'ready_with_restrictions' || normalized === 'ready_restricted') {
    return 'ready_with_restrictions';
  }
  return 'unknown';
}

export function detectClosedFieldTestStatus(markdown) {
  if (!markdown) return 'unknown';
  const explicit = markdown.match(/Closed field-test status:\s*\*{0,2}([^*\n.]+)\*{0,2}/i);
  if (explicit) return normalizeClosedFieldTestStatus(explicit[1]);
  const outcome = markdown.match(/Current outcome:\s*\*{0,2}([^*\n.]+)\*{0,2}/i);
  if (outcome) return normalizeClosedFieldTestStatus(outcome[1]);
  return 'unknown';
}

function extractSection(markdown, heading) {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return '';
  const sectionLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    sectionLines.push(lines[index]);
  }
  return sectionLines.join('\n').trim();
}

function extractBullets(markdown, heading) {
  const section = extractSection(markdown, heading);
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);
}

function extractLabelBlock(markdown, label) {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const labelPattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`, 'i');
  const start = lines.findIndex((line) => labelPattern.test(line.trim()));
  if (start < 0) return '';
  const sectionLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s+/.test(line)) break;
    if (/^[A-Z][A-Za-z /-]+:\s*$/.test(line.trim()) && sectionLines.some((item) => item.trim())) break;
    sectionLines.push(line);
  }
  return sectionLines.join('\n').trim();
}

function extractBulletValue(markdown, label) {
  if (!markdown) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^-\\s*${escaped}:[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : null;
}

function isFilled(value) {
  return Boolean(value && !/^(todo|tbd|none|not approved|not accepted|pending|incomplete|\s*)$/i.test(value.trim()));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value ?? '');
}

function isAcceptedStatus(value) {
  return /^accepted$/i.test(value ?? '');
}

function valueAffirmsYes(markdown, label) {
  const value = extractBulletValue(markdown, label) ?? '';
  return /\byes\b/i.test(value) && !/\bno\b/i.test(value);
}

function containsLine(markdown, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^-\\s*${escaped}\\s*$`, 'im').test(markdown ?? '');
}

function containsPattern(markdown, pattern) {
  return pattern.test(markdown ?? '');
}

export function buildClosedFieldTestRiskAcceptanceResult(markdown, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const exists = Boolean(markdown);
  const topStatus = markdown?.match(/^Status:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const decisionSection = extractSection(markdown, 'Decision') || extractLabelBlock(markdown, 'Decision');
  const decisionStatus = extractBulletValue(decisionSection, 'Status');
  const signOffFields = [
    'Product owner',
    'Product approval date',
    'Safety owner',
    'Safety approval date',
    'Privacy owner',
    'Privacy approval date',
    'Engineering owner',
    'Engineering approval date',
  ];
  const scopeFields = [
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
  const riskAcceptedItems = [
    'Android/device QA evidence incomplete',
    'Android QA required fields incomplete',
    'Required Android QA scenario results incomplete',
    'Required Android QA visual-state results incomplete',
    'Screenshot/evidence references missing',
    'Provider category/region approval missing',
    'Privacy/storage approval incomplete',
    'Private debrief data owner approval incomplete',
  ];
  const restrictions = [
    { label: 'AI assist disabled', pattern: /-\s*campopsAiAssistEnabled=false\b/i },
    { label: 'Telemetry disabled', pattern: /-\s*campopsTelemetryEnabled=false\b/i },
    { label: 'Community publishing disabled', pattern: /-\s*campopsDebriefCommunityPublishingEnabled=false\b/i },
    { label: 'Provider adapters restricted', pattern: /-\s*campopsProviderAdaptersEnabled=false unless exact category\/region approval exists\b/i },
    { label: 'Provider shadow mode only', pattern: /Provider output must remain shadow-only(?:\/| or )unknown for unapproved categories/i },
    { label: 'Manual feedback required', pattern: /Manual privacy-safe feedback (?:is )?required after every session/i },
    { label: 'No public community publishing', pattern: /No public\/community publishing/i },
    { label: 'No raw provider payloads', pattern: /No raw provider payloads in shared evidence/i },
    { label: 'No raw AI prompts', pattern: /No raw AI prompts/i },
    { label: 'No private coordinates', pattern: /No private coordinates in shared evidence/i },
    { label: 'No private user IDs', pattern: /No private user IDs/i },
    { label: 'No vehicle identifiers', pattern: /No vehicle identifiers/i },
    { label: 'No private debrief notes', pattern: /No private debrief notes in shared evidence/i },
  ];

  const missingFields = [];
  const missingSignOffs = [];
  const missingScope = [];
  const missingRiskAcceptedItems = [];
  const missingRestrictions = [];

  if (!exists) {
    return {
      exists,
      accepted: false,
      status: 'missing',
      topStatus: null,
      decisionStatus: null,
      missingFields: ['docs/campops/closed_field_test_risk_acceptance.md'],
      missingSignOffs,
      missingScope,
      missingRiskAcceptedItems,
      missingRestrictions,
      blockers: ['risk_acceptance_document_missing'],
      notes: ['Risk acceptance is optional unless used to proceed with incomplete evidence gates.'],
    };
  }

  if (!/^#\s+CampOps Closed Field-Test Risk Acceptance\b/im.test(markdown)) {
    missingFields.push('title');
  }
  if (extractBulletValue(markdown, 'restricted_closed_field_test_only') == null &&
    !containsLine(markdown, 'restricted_closed_field_test_only')) {
    missingFields.push('risk acceptance mode');
  }

  for (const field of signOffFields) {
    const value = extractBulletValue(markdown, field);
    const isDate = /date$/i.test(field);
    const complete = isDate ? isIsoDate(value) : isFilled(value);
    if (!complete) missingSignOffs.push(field);
  }
  for (const field of scopeFields) {
    const value = extractBulletValue(markdown, field);
    const complete = field === 'Expiration date' ? isIsoDate(value) : isFilled(value);
    if (!complete) missingScope.push(field);
  }
  for (const item of riskAcceptedItems) {
    if (!valueAffirmsYes(markdown, item)) missingRiskAcceptedItems.push(item);
  }
  for (const restriction of restrictions) {
    if (!containsPattern(markdown, restriction.pattern)) missingRestrictions.push(restriction.label);
  }

  const expirationDate = extractBulletValue(markdown, 'Expiration date');
  const expired = isIsoDate(expirationDate) && new Date(expirationDate).getTime() < now.getTime();
  const statusAccepted = isAcceptedStatus(topStatus) && isAcceptedStatus(decisionStatus);
  const blockers = [];
  if (!statusAccepted) blockers.push('risk_acceptance_not_accepted');
  if (missingFields.length > 0) blockers.push('risk_acceptance_required_fields_missing');
  if (missingSignOffs.length > 0) blockers.push('risk_acceptance_signoffs_incomplete');
  if (missingScope.length > 0) blockers.push('risk_acceptance_scope_incomplete');
  if (missingRiskAcceptedItems.length > 0) blockers.push('risk_accepted_incomplete_items_not_explicit');
  if (missingRestrictions.length > 0) blockers.push('risk_acceptance_restrictions_incomplete');
  if (expired) blockers.push('risk_acceptance_expired');

  return {
    exists,
    accepted: blockers.length === 0,
    status: statusAccepted ? 'accepted' : 'not_accepted',
    topStatus,
    decisionStatus,
    missingFields,
    missingSignOffs,
    missingScope,
    missingRiskAcceptedItems,
    missingRestrictions,
    expired,
    expirationDate: expirationDate ?? null,
    blockers,
    notes: blockers.length === 0
      ? ['Risk acceptance is explicit and restricted; it does not convert missing evidence into approval.']
      : ['Risk acceptance is not active; closed field testing remains governed by normal readiness blockers.'],
  };
}

export function hasClosedFieldTestRolloutGateRequirement(markdown) {
  if (!markdown) return false;
  return /closed_field_test_readiness\.md/i.test(markdown) && /closed field testing must pass/i.test(markdown);
}

export function detectAndroidDeviceQaStatus(markdown) {
  if (!markdown) return 'incomplete';
  const negative = textMatches(markdown, [
    /\bnot device-run\b/i,
    /\bdevice QA was not run\b/i,
    /\bNo screenshots were captured\b/i,
    /\bevidence is still incomplete\b/i,
    /\bQA evidence is still incomplete\b/i,
    /\bincomplete\b/i,
  ]);
  const complete = textMatches(markdown, [
    /\bAndroid\/device QA execution status:\s*complete\b/i,
    /\bCampOps visual-state execution completed\b/i,
    /\bAndroid\/device QA completed\b/i,
  ]);
  return complete && !negative ? 'complete' : 'incomplete';
}

export function detectProviderReadinessStatus(markdown) {
  if (!markdown) return 'not_approved';
  const negative = textMatches(markdown, [
    /\bnot approved\b/i,
    /\bnot ready\b/i,
    /\bshadow[- ]only\b/i,
    /\bfixture-backed\b/i,
    /\breal upstream.*unproven\b/i,
    /\bprovider influence.*off\b/i,
  ]);
  const approved = textMatches(markdown, [
    /\bProvider readiness approval:\s*approved\b/i,
    /\bOverall readiness decision:\s*approved\b/i,
    /\bapproved for closed field test provider influence\b/i,
  ]);
  return approved && !negative ? 'approved' : 'not_approved';
}

export function detectPrivacyStorageApprovalStatus(markdown) {
  if (!markdown) return 'incomplete';
  const approvalSection = extractSection(markdown, 'Closed Field-Test Privacy/Storage Approval Packet') ||
    extractSection(markdown, 'Closed Field-Test Privacy/Storage Approval') ||
    extractSection(markdown, 'Closed Field-Test Data Posture Approval');
  const source = approvalSection || markdown;
  const negative = textMatches(source, [
    /^-\s*Status:\s*(?:not fully approved|not approved|incomplete|pending|tbd)\b/im,
    /^-\s*Owner approval status:\s*(?:not fully approved|not approved|incomplete|pending|tbd)\b/im,
    /^-\s*Private debrief owner approval:\s*(?:not fully approved|not approved|incomplete|pending|tbd)\b/im,
    /\bowner(?:ship)?(?: \/ decision)? status:\s*TBD\b/i,
    /\bowner decisions?[^.\n]*TBD\b/i,
    /\bowners? are still TBD\b/i,
    /\bapproval remains incomplete\b/i,
    /\bapproval remains\b/i,
  ]);
  const approved = textMatches(source, [
    /^-\s*Status:\s*approved\b/im,
    /\bPrivacy\/storage owner approval:\s*approved\b/i,
    /\bOwner approval status:\s*approved\b/i,
    /\bapproved for closed field-test data posture\b/i,
    /\bPrivate debrief owner approval:\s*approved\b/i,
  ]);
  return approved && !negative ? 'approved' : 'incomplete';
}

export function detectAiAssistStatus(markdown) {
  if (!markdown) return 'disabled';
  const overrideAllowed = textMatches(markdown, [
    /\bAI may override hard gates:\s*yes\b/i,
    /\bAI may override hard gates:\s*true\b/i,
  ]);
  if (overrideAllowed) return 'unsafe_override_allowed';
  const explicitlyEnabled = textMatches(markdown, [
    /\bcampopsAiAssistEnabled\s*=\s*true\b/i,
    /\bAI assist:\s*enabled\b/i,
    /\bAI assist mode:\s*enabled\b/i,
  ]);
  const explicitlyDisabled = textMatches(markdown, [
    /\bcampopsAiAssistEnabled\s*=\s*false\b/i,
    /\bcampopsAiAssistEnabled remains .*default-off\b/i,
    /\bAI assist .*remain off\b/i,
    /\bAI assist .*remains disabled\b/i,
    /\bAI must remain off\b/i,
  ]);
  const approved = textMatches(markdown, [
    /\bReal model executed in this report:\s*yes\b/i,
    /\bAI real-output approval:\s*approved\b/i,
    /\bapproved real-output behavior\b/i,
  ]) && !textMatches(markdown, [
    /\bReal model executed in this report:\s*no\b/i,
    /\bnot ready for internal field testers\b/i,
    /\bnot complete\b/i,
  ]);

  if (explicitlyEnabled) return approved ? 'enabled_approved' : 'enabled_unapproved';
  if (explicitlyDisabled || !explicitlyEnabled) return 'disabled';
  return approved ? 'enabled_approved' : 'enabled_unapproved';
}

export function detectClosedFieldTestEvidenceStatus(markdownByFile = {}) {
  const combinedProvider = [
    markdownByFile.readiness,
    markdownByFile.providerReadiness,
    markdownByFile.internalBetaEvidence,
  ].filter(Boolean).join('\n\n');
  const combinedPrivacy = [
    markdownByFile.readiness,
    markdownByFile.privacyStorageReview,
    markdownByFile.internalBetaEvidence,
  ].filter(Boolean).join('\n\n');
  const combinedAi = [
    markdownByFile.readiness,
    markdownByFile.aiRealOutputReview,
    markdownByFile.internalBetaEvidence,
    markdownByFile.rollout,
  ].filter(Boolean).join('\n\n');

  const status = detectClosedFieldTestStatus(markdownByFile.readiness);
  return {
    androidDeviceQa: detectAndroidDeviceQaStatus(markdownByFile.mobileQaEvidence),
    providerReadiness: detectProviderReadinessStatus(combinedProvider),
    privacyStorageApproval: detectPrivacyStorageApprovalStatus(combinedPrivacy),
    aiAssist: detectAiAssistStatus(combinedAi),
    closedFieldTesting: status === 'ready_with_restrictions' ? 'ready_with_restrictions' : 'blocked',
  };
}

export function buildNormalizedClosedFieldTestBlockers(evidenceStatus) {
  const blockers = [];
  if (evidenceStatus.closedFieldTesting === 'blocked') blockers.push('closed_field_test_status_blocked');
  if (evidenceStatus.androidDeviceQa !== 'complete') blockers.push('android_device_qa_incomplete');
  if (evidenceStatus.providerReadiness !== 'approved') blockers.push('provider_readiness_not_approved');
  if (evidenceStatus.privacyStorageApproval !== 'approved') blockers.push('privacy_storage_owner_approval_incomplete');
  if (evidenceStatus.aiAssist === 'enabled_unapproved') blockers.push('ai_assist_enabled_without_approval');
  if (evidenceStatus.aiAssist === 'unsafe_override_allowed') blockers.push('ai_hard_gate_override_allowed');
  return blockers;
}

export function buildClosedFieldTestReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const {
    readinessPath,
    rolloutPath,
    evidenceFilePaths,
  } = pathsFor(root);
  const missingFiles = [];
  const notes = [];
  const readiness = readIfExists(readinessPath);
  const rollout = readIfExists(rolloutPath);
  const internalBetaEvidence = readIfExists(evidenceFilePaths.internalBetaEvidence);
  const providerReadiness = readIfExists(evidenceFilePaths.providerReadinessRegion001);
  const mobileQaEvidence = readIfExists(evidenceFilePaths.mobileQaEvidence);
  const privacyStorageReview = readIfExists(evidenceFilePaths.privacyStorageReview);
  const aiRealOutputReview = readIfExists(evidenceFilePaths.aiRealOutputReview);
  const riskAcceptanceMarkdown = readIfExists(evidenceFilePaths.closedFieldTestRiskAcceptance);

  if (!readiness) missingFiles.push(path.relative(root, readinessPath));
  if (!rollout) missingFiles.push(path.relative(root, rolloutPath));

  const evidenceFiles = Object.fromEntries(
    Object.entries(evidenceFilePaths).map(([key, filePath]) => [key, fs.existsSync(filePath)]),
  );

  const missingSections = readiness
    ? requiredSections.filter((section) => !section.pattern.test(readiness)).map((section) => section.label)
    : requiredSections.map((section) => section.label);

  if (!hasClosedFieldTestRolloutGateRequirement(rollout)) {
    missingSections.push('rollout.md closed field-test gate requirement');
  }

  const status = detectClosedFieldTestStatus(readiness);
  const followUp = extractBullets(readiness, 'Current Required Follow-Up');
  const evidenceStatus = detectClosedFieldTestEvidenceStatus({
    readiness,
    rollout,
    internalBetaEvidence,
    providerReadiness,
    mobileQaEvidence,
    privacyStorageReview,
    aiRealOutputReview,
  });
  const riskAcceptance = buildClosedFieldTestRiskAcceptanceResult(riskAcceptanceMarkdown, { now });
  const liveReadiness = buildCampOpsLiveReadinessResult({ rootDir: root, now });
  const normalizedBlockers = buildNormalizedClosedFieldTestBlockers(evidenceStatus);
  if (!liveReadiness.closedFieldTestReady) {
    normalizedBlockers.push('campops_live_readiness_not_closed_field_ready');
  }
  const blockers = riskAcceptance.accepted
    ? normalizedBlockers.filter((blocker) => ![
      'closed_field_test_status_blocked',
      'android_device_qa_incomplete',
      'provider_readiness_not_approved',
      'privacy_storage_owner_approval_incomplete',
      'campops_live_readiness_not_closed_field_ready',
    ].includes(blocker))
    : normalizedBlockers;

  if (status === 'blocked') {
    notes.push('Closed field testing is intentionally blocked by closed_field_test_readiness.md.');
  }
  if (status === 'unknown') {
    notes.push('Readiness status could not be parsed from closed_field_test_readiness.md.');
  }
  if (!Object.values(evidenceFiles).every(Boolean)) {
    notes.push('One or more known evidence files are missing.');
  }
  if (missingSections.length > 0) {
    notes.push('One or more required readiness sections are missing.');
  }
  if (evidenceStatus.aiAssist === 'disabled') {
    notes.push('AI real-output approval is incomplete; this is a restriction satisfied only while AI assist remains disabled.');
  }
  if (riskAcceptance.exists && !riskAcceptance.accepted) {
    notes.push('Closed field-test risk acceptance is present but not accepted; it does not override incomplete evidence gates.');
  }
  if (riskAcceptance.accepted) {
    const unresolvedRiskAcceptedEvidence = [];
    if (evidenceStatus.providerReadiness !== 'approved') unresolvedRiskAcceptedEvidence.push('provider readiness remains unapproved for influence');
    if (evidenceStatus.androidDeviceQa !== 'complete') unresolvedRiskAcceptedEvidence.push('Android/device QA remains incomplete');
    if (evidenceStatus.privacyStorageApproval !== 'approved') unresolvedRiskAcceptedEvidence.push('privacy/storage approval remains incomplete');
    if (!liveReadiness.closedFieldTestReady) unresolvedRiskAcceptedEvidence.push('CampOps live-readiness is not fully approved without risk acceptance');
    notes.push(unresolvedRiskAcceptedEvidence.length > 0
      ? `Closed field testing is risk-accepted for a restricted field test; ${unresolvedRiskAcceptedEvidence.join('; ')}.`
      : 'Closed field testing is risk-accepted for a restricted field test; this does not approve broader rollout, provider influence, AI assist, telemetry, or community publishing.');
  }
  if (!liveReadiness.closedFieldTestReady) {
    notes.push(`CampOps live-readiness gate reports: ${liveReadiness.statusLabel}.`);
  }

  const standardPassed =
    status === 'ready_with_restrictions' &&
    missingFiles.length === 0 &&
    missingSections.length === 0 &&
    normalizedBlockers.length === 0 &&
    liveReadiness.closedFieldTestReady &&
    hasClosedFieldTestRolloutGateRequirement(rollout);
  const riskAcceptedPassed =
    riskAcceptance.accepted &&
    missingFiles.length === 0 &&
    missingSections.length === 0 &&
    blockers.length === 0 &&
    hasClosedFieldTestRolloutGateRequirement(rollout);
  const passed = standardPassed || riskAcceptedPassed;

  return {
    status,
    effectiveStatus: standardPassed
      ? 'ready_with_restrictions'
      : riskAcceptedPassed
        ? 'risk_accepted_restricted_closed_field_test'
        : status,
    passed,
    checkedAt: now.toISOString(),
    missingFiles,
    missingSections,
    blockers,
    followUp,
    evidenceStatus,
    liveReadiness,
    riskAcceptance,
    evidenceFiles,
    notes,
  };
}

export function writeClosedFieldTestReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatClosedFieldTestReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const label = result.passed
    ? (result.effectiveStatus === 'risk_accepted_restricted_closed_field_test'
      ? 'RISK-ACCEPTED RESTRICTED FIELD TEST'
      : 'READY WITH RESTRICTIONS')
    : result.status.toUpperCase();
  const lines = [
    `CampOps closed field-test readiness: ${label}`,
    `CLOSED FIELD TESTING: ${result.passed ? label : 'BLOCKED'}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
  ];

  if (result.missingFiles.length > 0) {
    lines.push('', 'Missing files:');
    for (const item of result.missingFiles) lines.push(`- ${item}`);
  }

  if (result.missingSections.length > 0) {
    lines.push('', 'Missing sections/checks:');
    for (const item of result.missingSections) lines.push(`- ${item}`);
  }

  if (!result.passed) {
    lines.push('', 'BLOCKED: closed field testing must not proceed.');
  }

  if (result.blockers.length > 0) {
    lines.push('', 'Remaining blockers:');
    for (const blocker of result.blockers.filter((item) => item !== 'closed_field_test_status_blocked')) {
      lines.push(`- ${normalizedBlockerMessages[blocker] ?? blocker}`);
    }
  }

  if (result.liveReadiness) {
    lines.push('', 'CampOps live readiness:');
    lines.push(`- Status: ${result.liveReadiness.statusLabel}`);
    lines.push(`- Internal beta ready: ${result.liveReadiness.internalBetaReady ? 'yes' : 'no'}`);
    lines.push(`- Closed field test ready: ${result.liveReadiness.closedFieldTestReady ? 'yes' : 'no'}`);
  }

  if (result.riskAcceptance?.exists) {
    lines.push('', 'Risk acceptance:');
    lines.push(`- Status: ${result.riskAcceptance.status}`);
    lines.push(`- Accepted: ${result.riskAcceptance.accepted ? 'yes' : 'no'}`);
    if (result.riskAcceptance.blockers?.length > 0) {
      lines.push('- Risk acceptance blockers:');
      for (const blocker of result.riskAcceptance.blockers) lines.push(`  - ${blocker}`);
    }
  }

  if (result.followUp.length > 0) {
    lines.push('', 'Current required follow-up:');
    for (const item of result.followUp) lines.push(`- ${item}`);
  }

  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }

  return `${lines.join('\n')}\n`;
}

export function runClosedFieldTestReadinessCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildClosedFieldTestReadinessResult({ rootDir: root });
  writeClosedFieldTestReadinessResult(result, { rootDir: root });

  if (jsonOnly) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatClosedFieldTestReadinessResult(result, { rootDir: root }));
  }

  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runClosedFieldTestReadinessCli();
}
