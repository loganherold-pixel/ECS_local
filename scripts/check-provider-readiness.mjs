import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'provider-readiness-result.json');
const REQUIRED_CATEGORIES = [
  'legal/access',
  'closure/seasonal restriction',
  'fire restriction',
  'weather',
  'service/resupply',
];

function pathsFor(root) {
  return {
    docsDir: path.join(root, 'docs', 'campops'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function extractBulletValue(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim().replace(/`/g, '') : null;
}

function extractRegionLabel(markdown, filePath) {
  return extractBulletValue(markdown, 'Region label') ?? path.basename(filePath, '.md');
}

function detectEvidenceMode(markdown, categoryText) {
  const text = `${markdown}\n${categoryText}`;
  if (/recommendation influence allowed:\s*yes/i.test(text) && /approval (?:status|decision):\s*approved/i.test(text)) {
    return 'approved';
  }
  if (/\bfixture[- ]backed\b/i.test(text) || /\bfixture data\b/i.test(text) || /\bfixture output\b/i.test(text)) {
    return 'fixture-backed';
  }
  if (/\breal[- ]shadow\b/i.test(text) || /\bValidation mode:\s*real[- ]shadow\b/i.test(text)) {
    return 'real-shadow';
  }
  if (/\bshadow only\b/i.test(text) || /\bshadow-validation only\b/i.test(text)) {
    return 'real-shadow';
  }
  return 'fixture-backed';
}

function extractMarkdownTableRows(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(line.trim()));
  if (start < 0) return [];
  const tableLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s+/.test(line)) break;
    if (line.startsWith('|')) tableLines.push(line);
  }
  if (tableLines.length < 3) return [];
  const splitRow = (line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells;
  };
  const headers = splitRow(tableLines[0]);
  return tableLines.slice(2).map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function categoryAlias(category) {
  const normalized = normalize(category);
  if (normalized === 'legal' || normalized === 'access') return 'legal/access';
  if (normalized === 'closure') return 'closure/seasonal restriction';
  if (normalized === 'fire') return 'fire restriction';
  if (normalized === 'service') return 'service/resupply';
  return normalized;
}

function parseCategoryStatuses(markdown) {
  const statuses = Object.fromEntries(REQUIRED_CATEGORIES.map((category) => [category, {
    category,
    status: 'not_approved',
    evidenceMode: detectEvidenceMode(markdown, ''),
    recommendationInfluenceAllowed: false,
    approver: null,
    approvalDate: null,
    reason: 'No category-specific approval recorded.',
  }]));

  for (const row of extractMarkdownTableRows(markdown, 'Category Matrix')) {
    const category = categoryAlias(row.Category);
    if (!statuses[category]) continue;
    const rowStatus = normalize(row.Status);
    const validationMode = normalize(row['Validation mode']) || detectEvidenceMode(markdown, Object.values(row).join(' '));
    const influenceAllowed = /^yes$/i.test(row['Provider influence allowed'] ?? row['Recommendation influence allowed'] ?? '');
    const approver = row.Approver || null;
    const approvalDate = row['Approval date'] || null;
    const approvalComplete =
      rowStatus === 'approved' &&
      validationMode === 'approved' &&
      influenceAllowed &&
      Boolean(approver && !/todo|tbd|not approved/i.test(approver)) &&
      Boolean(approvalDate && !/todo|tbd|not approved/i.test(approvalDate));
    statuses[category] = {
      ...statuses[category],
      status: approvalComplete ? 'approved' : (rowStatus === 'shadow_validated' ? 'shadow_validated' : 'not_approved'),
      evidenceMode: approvalComplete ? 'approved' : validationMode || statuses[category].evidenceMode,
      recommendationInfluenceAllowed: approvalComplete,
      approver,
      approvalDate,
      reason: row['Remaining issues'] || row['Coverage summary'] || statuses[category].reason,
    };
  }

  for (const row of extractMarkdownTableRows(markdown, 'Readiness by Category')) {
    const category = categoryAlias(row.Category);
    if (!statuses[category]) continue;
    const readiness = row['Current readiness'] ?? '';
    const rowText = Object.values(row).join(' ');
    const approved =
      /approved/i.test(readiness) &&
      !/not approved|not ready|shadow|fixture|unproven|only/i.test(readiness);
    statuses[category] = {
      ...statuses[category],
      status: approved ? 'approved' : 'not_approved',
      evidenceMode: detectEvidenceMode(markdown, rowText),
      recommendationInfluenceAllowed: approved,
      reason: row.Reason || readiness || statuses[category].reason,
    };
  }

  for (const row of extractMarkdownTableRows(markdown, 'Category Approval Matrix')) {
    const category = categoryAlias(row.Category);
    if (!statuses[category]) continue;
    const validationMode = normalize(row['Validation mode']);
    const influenceAllowed = /^yes$/i.test(row['Recommendation influence allowed'] ?? '');
    const approver = row.Approver || null;
    const approvalDate = row['Approval date'] || null;
    const approvalComplete =
      influenceAllowed &&
      /^approved$/i.test(row['Approval status'] ?? '') &&
      Boolean(approver && !/todo|tbd|not approved/i.test(approver)) &&
      Boolean(approvalDate && !/todo|tbd|not approved/i.test(approvalDate));
    statuses[category] = {
      ...statuses[category],
      status: approvalComplete ? 'approved' : 'not_approved',
      evidenceMode: approvalComplete ? 'approved' : validationMode || detectEvidenceMode(markdown, Object.values(row).join(' ')),
      recommendationInfluenceAllowed: approvalComplete,
      approver,
      approvalDate,
      reason: row['Remaining issues'] || statuses[category].reason,
    };
  }

  return Object.values(statuses);
}

function providerReadinessFiles(root) {
  const { docsDir } = pathsFor(root);
  if (!fs.existsSync(docsDir)) return [];
  return fs.readdirSync(docsDir)
    .filter((name) => /^provider_readiness_.*\.md$/i.test(name))
    .filter((name) => !/_template\.md$/i.test(name))
    .map((name) => path.join(docsDir, name));
}

function parseArgs(args) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const categories = valueAfter('--categories');
  return {
    jsonOnly: args.includes('--json'),
    influenceRequested: args.includes('--influence-requested') || process.env.CAMPOPS_PROVIDER_INFLUENCE_REQUESTED === '1',
    region: valueAfter('--region') ?? process.env.CAMPOPS_PROVIDER_READINESS_REGION ?? null,
    categories: categories ? categories.split(',').map((item) => categoryAlias(item)).filter(Boolean) : REQUIRED_CATEGORIES,
  };
}

export function buildProviderReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const args = parseArgs(options.args ?? []);
  const files = providerReadinessFiles(root);
  const missingFiles = files.length === 0 ? ['docs/campops/provider_readiness_*.md'] : [];
  const reports = files.map((filePath) => {
    const markdown = readIfExists(filePath);
    return {
      file: path.relative(root, filePath),
      regionLabel: extractRegionLabel(markdown, filePath),
      categories: parseCategoryStatuses(markdown),
      rawProviderPayloadsExcluded: /raw provider payloads.*excluded:\s*yes/i.test(markdown) || /does not include .*raw .*provider/i.test(markdown),
      precisePrivateCoordinatesExcluded: /precise private coordinates.*excluded:\s*yes/i.test(markdown) || /does not include precise coordinates/i.test(markdown),
      privacySafe: !/-?\d{1,3}\.\d{4,}/.test(markdown) && !/\b(user|vehicle)(?: id|Id|ID)?\s*[:=]\s*[\w-]+/i.test(markdown),
    };
  });

  const selectedReports = args.region
    ? reports.filter((report) => slug(report.regionLabel) === slug(args.region) || normalize(report.regionLabel) === normalize(args.region))
    : reports;
  const missingRegion = args.region && selectedReports.length === 0 ? args.region : null;

  const categoryStatus = {};
  for (const category of args.categories) {
    const matches = selectedReports.flatMap((report) =>
      report.categories.filter((item) => item.category === category).map((item) => ({ ...item, regionLabel: report.regionLabel, file: report.file })),
    );
    const approved = matches.some((item) => item.status === 'approved' && item.recommendationInfluenceAllowed);
    categoryStatus[category] = {
      status: approved ? 'approved' : 'not_approved',
      evidenceMode: approved ? 'approved' : (matches[0]?.evidenceMode ?? 'missing'),
      recommendationInfluenceAllowed: approved,
      shadowValidated: matches.some((item) => item.status === 'shadow_validated' || item.evidenceMode === 'real-shadow'),
      reports: matches,
    };
  }

  const notApproved = Object.entries(categoryStatus)
    .filter(([, status]) => status.status !== 'approved')
    .map(([category]) => category);
  const influenceViolations = args.influenceRequested ? notApproved : [];
  const rawPayloadViolations = reports.filter((report) => !report.rawProviderPayloadsExcluded).map((report) => report.file);
  const preciseCoordinateViolations = reports.filter((report) => !report.precisePrivateCoordinatesExcluded).map((report) => report.file);
  const privacyViolations = reports.filter((report) => !report.privacySafe).map((report) => report.file);
  const shadowOnlyAllowed =
    missingFiles.length === 0 &&
    !missingRegion &&
    rawPayloadViolations.length === 0 &&
    preciseCoordinateViolations.length === 0 &&
    privacyViolations.length === 0 &&
    !args.influenceRequested;
  const blockers = [];
  if (missingFiles.length > 0) blockers.push('provider_readiness_reports_missing');
  if (missingRegion) blockers.push('target_region_report_missing');
  if (notApproved.length > 0) blockers.push('provider_categories_not_approved');
  if (influenceViolations.length > 0) blockers.push('provider_influence_requested_for_unapproved_category');
  if (rawPayloadViolations.length > 0) blockers.push('raw_provider_payload_exclusion_not_recorded');
  if (preciseCoordinateViolations.length > 0) blockers.push('precise_private_coordinate_exclusion_not_recorded');
  if (privacyViolations.length > 0) blockers.push('provider_report_privacy_violation');

  const passed =
    missingFiles.length === 0 &&
    !missingRegion &&
    notApproved.length === 0 &&
    influenceViolations.length === 0 &&
    rawPayloadViolations.length === 0 &&
    preciseCoordinateViolations.length === 0 &&
    privacyViolations.length === 0;

  return {
    passed,
    checkedAt: now.toISOString(),
    targetRegionLabel: args.region ?? (selectedReports[0]?.regionLabel ?? null),
    influenceRequested: args.influenceRequested,
    requestedCategories: args.categories,
    missingFiles,
    missingRegion,
    blockers,
    status: notApproved.length > 0 ? 'not_approved_for_influence' : 'approved_for_influence',
    shadowOnlyAllowed,
    notApprovedCategories: notApproved,
    influenceViolations,
    rawPayloadViolations,
    preciseCoordinateViolations,
    privacyViolations,
    categoryStatus,
    reports,
    notes: [
      'Fixture-backed validation is not approval.',
      'Real-shadow validation is not approval unless approval fields and influence allowance are present.',
      'Provider output must not influence recommendations unless target region/category approval exists.',
    ],
  };
}

export function writeProviderReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatProviderReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps provider readiness: ${result.passed ? 'APPROVED FOR INFLUENCE' : 'NOT APPROVED FOR INFLUENCE'}`,
    `PROVIDER READINESS: ${result.passed ? 'APPROVED FOR INFLUENCE' : 'NOT APPROVED FOR INFLUENCE'}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    `Target region: ${result.targetRegionLabel ?? 'not found'}`,
    `Provider influence requested: ${result.influenceRequested ? 'yes' : 'no'}`,
    `Provider influence approved: ${result.passed ? 'yes' : 'no'}`,
    `Shadow posture acceptable: ${result.shadowOnlyAllowed ? 'yes' : 'no'}`,
    `Shadow-only posture allowed: ${result.shadowOnlyAllowed ? 'yes' : 'no'}`,
  ];
  if (result.blockers.length > 0) {
    lines.push('', 'Provider readiness blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.notApprovedCategories.length > 0) {
    lines.push('', 'Categories not approved for influence:');
    for (const category of result.notApprovedCategories) {
      const status = result.categoryStatus[category];
      lines.push(`- ${category}: ${status.evidenceMode}`);
    }
  }
  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runProviderReadinessCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const parsed = parseArgs(args);
  const result = buildProviderReadinessResult({ rootDir: root, args });
  writeProviderReadinessResult(result, { rootDir: root });
  if (parsed.jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatProviderReadinessResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runProviderReadinessCli();
}
