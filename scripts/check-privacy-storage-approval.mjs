import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'privacy-storage-approval-result.json');
const REQUIRED_FIELDS = [
  'Status',
  'Owner',
  'Approval date',
  'Approved data categories',
  'Retention period',
  'Deletion path',
  'Storage location',
  'Encryption status',
  'Access controls',
  'Private debrief data posture',
  'Private debrief owner approval',
  'Telemetry posture',
  'Telemetry sink',
  'Community publishing',
  'Raw provider payloads stored',
  'Raw AI prompts stored',
  'Private coordinates in shared evidence',
  'Remaining issues',
];

const REQUIRED_TERMS = [
  { label: 'data categories', pattern: /\bData category\b|\bApproved (?:tester )?data categories\b/i },
  { label: 'retention', pattern: /\bRetention\b|\bretention period\b/i },
  { label: 'deletion path', pattern: /\bDeletion path\b|\bdeleteStoredCampOpsDebrief\b|\bclearStoredCampOpsDebriefs\b/i },
  { label: 'storage location', pattern: /\bStorage location\b|\bCurrent storage location\b/i },
  { label: 'encryption status', pattern: /\bencryption\b|\bEncryption status\b|\bstorage\/encryption status\b/i },
  { label: 'access controls', pattern: /\bAccess controls\b|\bprivacy owner\b|\bowner \/ decision status\b/i },
  { label: 'private debrief data posture', pattern: /\bPrivate debrief data posture\b|\bPrivate debrief notes\b|\bDebriefs\b/i },
  { label: 'private debrief owner approval', pattern: /\bPrivate debrief owner approval\b/i },
  { label: 'telemetry posture', pattern: /\bTelemetry\b/i },
  { label: 'community publishing posture', pattern: /\bCommunity publishing\b|\bCommunity-visible\b/i },
];

function pathsFor(root) {
  return {
    reviewPath: path.join(root, 'docs', 'campops', 'privacy_storage_review.md'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function extractSection(markdown, heading) {
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

function extractFirstSection(markdown, headings) {
  for (const heading of headings) {
    const section = extractSection(markdown, heading);
    if (section) return section;
  }
  return '';
}

function extractField(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`^-\\s*${escaped}:[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : null;
}

function isFilled(value) {
  return Boolean(value && !/^(todo|tbd|none|not approved|incomplete|pending|\s*)$/i.test(value.trim()));
}

function isApprovedStatus(value) {
  return /^approved$/i.test(value ?? '');
}

function isApprovalDate(value) {
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value ?? '');
}

function telemetryStatus(section) {
  const value = extractField(section, 'Telemetry posture') ?? extractField(section, 'Telemetry') ?? '';
  const sink = extractField(section, 'Telemetry sink') ?? '';
  if (/disabled/i.test(value)) return 'disabled';
  if (/enabled/i.test(value) || /approved/i.test(sink)) {
    const approved =
      /sink.*approved/i.test(`${value} ${sink}`) &&
      /retention.*approved/i.test(`${value} ${sink}`) &&
      /access.*approved/i.test(`${value} ${sink}`) &&
      /privacy.*approved/i.test(`${value} ${sink}`) &&
      !/not approved/i.test(sink);
    return approved ? 'enabled_approved' : 'enabled_unapproved';
  }
  return 'unknown';
}

function communityPublishingStatus(section) {
  const value = extractField(section, 'Community publishing') ?? '';
  if (/disabled/i.test(value)) return 'disabled';
  if (/enabled/i.test(value)) return 'enabled';
  return 'unknown';
}

function debriefDataStatus(section, approved) {
  const value = extractField(section, 'Private debrief data posture') ?? extractField(section, 'Debrief data use') ?? '';
  if (/\bno\s+(?:community|public)\b/i.test(value) || /\bcommunity\/public use\b.*\bno\b/i.test(value)) {
    return approved ? 'owner_approved_private' : 'private_pending_owner_approval';
  }
  if (/private/i.test(value) && !/community/i.test(value)) return approved ? 'owner_approved_private' : 'private_pending_owner_approval';
  if (/community|public/i.test(value)) return 'community_or_public_requested';
  if (/disabled|none/i.test(value)) return 'disabled';
  return 'unknown';
}

function privateDebriefOwnerApprovalStatus(section) {
  const value = extractField(section, 'Private debrief owner approval') ?? '';
  if (/^approved\b/i.test(value)) return 'approved';
  if (/incomplete|not approved|pending|todo|tbd|^$/i.test(value)) return 'incomplete';
  return isFilled(value) ? 'present_unapproved' : 'incomplete';
}

function valueAffirmsNo(section, label) {
  const value = extractField(section, label) ?? '';
  return /\bno\b/i.test(value) && !/\byes\b/i.test(value);
}

export function buildPrivacyStorageApprovalResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const { reviewPath } = pathsFor(root);
  const review = readIfExists(reviewPath);
  const missingFiles = review ? [] : [path.relative(root, reviewPath)];
  const approvalSection = extractFirstSection(review, [
    'Closed Field-Test Privacy/Storage Approval Packet',
    'Closed Field-Test Privacy/Storage Approval',
    'Closed Field-Test Data Posture Approval',
  ]);
  const missingFields = approvalSection
    ? REQUIRED_FIELDS.filter((field) => extractField(approvalSection, field) == null)
    : REQUIRED_FIELDS;
  const missingRequiredTerms = REQUIRED_TERMS.filter((term) => !term.pattern.test(review)).map((term) => term.label);

  const status = extractField(approvalSection, 'Status');
  const owner = extractField(approvalSection, 'Owner');
  const approvalDate = extractField(approvalSection, 'Approval date');
  const approvedDataCategories = extractField(approvalSection, 'Approved data categories') ?? extractField(approvalSection, 'Approved tester data categories');
  const retention = extractField(approvalSection, 'Retention period') ?? extractField(approvalSection, 'Retention');
  const deletionPath = extractField(approvalSection, 'Deletion path');
  const storageLocation = extractField(approvalSection, 'Storage location');
  const encryptionStatus = extractField(approvalSection, 'Encryption status') ?? extractField(approvalSection, 'Storage/encryption status');
  const accessControls = extractField(approvalSection, 'Access controls');
  const privateDebriefOwnerApproval = privateDebriefOwnerApprovalStatus(approvalSection);
  const approved = isApprovedStatus(status) && isFilled(owner) && isApprovalDate(approvalDate);
  const telemetry = telemetryStatus(approvalSection);
  const communityPublishing = communityPublishingStatus(approvalSection);
  const debriefData = debriefDataStatus(approvalSection, approved);

  const blockers = [];
  if (missingFiles.length > 0) blockers.push('privacy_storage_review_missing');
  if (!approvalSection) blockers.push('closed_field_test_privacy_storage_approval_section_missing');
  if (missingFields.length > 0) blockers.push('approval_required_fields_missing');
  if (!isApprovedStatus(status)) blockers.push('privacy_storage_owner_approval_incomplete');
  if (!isFilled(owner)) blockers.push('approval_owner_missing');
  if (!isApprovalDate(approvalDate)) blockers.push('approval_date_missing');
  if (!isFilled(approvedDataCategories)) blockers.push('approved_data_categories_missing');
  if (!isFilled(retention)) blockers.push('retention_period_missing');
  if (!isFilled(deletionPath)) blockers.push('deletion_path_missing');
  if (!isFilled(storageLocation)) blockers.push('storage_location_missing');
  if (!isFilled(encryptionStatus)) blockers.push('encryption_status_missing');
  if (!isFilled(accessControls)) blockers.push('access_controls_missing');
  if (privateDebriefOwnerApproval !== 'approved') blockers.push('private_debrief_data_owner_approval_incomplete');
  if (missingRequiredTerms.length > 0) blockers.push('privacy_storage_required_terms_missing');
  if (telemetry !== 'disabled' && telemetry !== 'enabled_approved') blockers.push('telemetry_posture_missing_or_ambiguous');
  if (telemetry === 'enabled_unapproved') blockers.push('telemetry_enabled_without_sink_retention_access_privacy_approval');
  if (communityPublishing === 'enabled') blockers.push('community_publishing_enabled');
  if (debriefData === 'community_or_public_requested') blockers.push('community_or_public_debrief_data_requested');
  if (debriefData === 'private_pending_owner_approval') blockers.push('private_debrief_data_owner_approval_incomplete');
  if (!valueAffirmsNo(approvalSection, 'Raw provider payloads stored')) blockers.push('raw_provider_payload_storage_not_confirmed_disabled');
  if (!valueAffirmsNo(approvalSection, 'Raw AI prompts stored')) blockers.push('raw_ai_prompt_storage_not_confirmed_disabled');
  if (!valueAffirmsNo(approvalSection, 'Private coordinates in shared evidence')) blockers.push('private_coordinates_in_shared_evidence_not_confirmed_disabled');

  const uniqueBlockers = Array.from(new Set(blockers));

  return {
    passed: uniqueBlockers.length === 0,
    status: approved ? 'approved' : 'incomplete',
    checkedAt: now.toISOString(),
    missingFiles,
    missingFields,
    missingRequiredTerms,
    blockers: uniqueBlockers,
    approval: {
      status: status ?? null,
      owner: owner ?? null,
      approvalDate: approvalDate ?? null,
      approvedDataCategories,
      retention,
      deletionPath,
      storageLocation,
      encryptionStatus,
      accessControls,
      privateDebriefDataPosture: extractField(approvalSection, 'Private debrief data posture'),
      privateDebriefOwnerApproval,
      telemetry,
      telemetrySink: extractField(approvalSection, 'Telemetry sink'),
      communityPublishing,
      debriefData,
      rawProviderPayloadsStored: extractField(approvalSection, 'Raw provider payloads stored'),
      rawAiPromptsStored: extractField(approvalSection, 'Raw AI prompts stored'),
      privateCoordinatesInSharedEvidence: extractField(approvalSection, 'Private coordinates in shared evidence'),
    },
    notes: [
      'Privacy/storage approval must be explicit for closed field-test data posture.',
      'Telemetry must remain disabled unless sink, retention, access, and privacy approvals are recorded.',
      'Community publishing must remain disabled for this gate.',
    ],
  };
}

export function writePrivacyStorageApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatPrivacyStorageApprovalResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps privacy/storage approval: ${result.passed ? 'APPROVED' : 'INCOMPLETE'}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
  ];
  if (result.blockers.length > 0) {
    lines.push('', 'Privacy/storage blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.missingFields.length > 0) {
    lines.push('', 'Missing approval fields:');
    for (const field of result.missingFields) lines.push(`- ${field}`);
  }
  lines.push('', 'Posture:');
  lines.push(`- Telemetry: ${result.approval.telemetry}`);
  lines.push(`- Community publishing: ${result.approval.communityPublishing}`);
  lines.push(`- Debrief data: ${result.approval.debriefData}`);
  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runPrivacyStorageApprovalCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildPrivacyStorageApprovalResult({ rootDir: root });
  writePrivacyStorageApprovalResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatPrivacyStorageApprovalResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runPrivacyStorageApprovalCli();
}
