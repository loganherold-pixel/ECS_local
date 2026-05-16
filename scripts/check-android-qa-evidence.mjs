import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'android-qa-evidence-result.json');

const REQUIRED_SECTIONS = [
  { label: 'Environment', pattern: /^##\s+Environment\b/im },
  { label: 'CampOps Visual QA Route', pattern: /^##\s+CampOps Visual QA Route\b/im },
  { label: 'Android Device QA Evidence Packet', pattern: /^##\s+Android Device QA Evidence Packet\b/im },
  { label: 'Required scenario checklist', pattern: /\bRequired scenario checklist\b/i },
  { label: 'Required visual-state checklist', pattern: /\bRequired visual-state checklist\b/i },
  { label: 'Required screenshots/evidence references', pattern: /\bRequired screenshots\/evidence references\b/i },
];

const REQUIRED_SCENARIOS = [
  'On-time normal route',
  'Two-hour delay with planned camp arriving after sunset',
  'Trailer/full-size vehicle access or turnaround scenario',
  'Low fuel margin or next-fuel uncertainty',
  'Low water margin or next-day water concern',
  'Offline cached source data',
  'Offline no-cache or missing-source state',
  'Stale closure/weather/fire/service data',
  'Legacy result list differs from CampOps endpoint recommendation',
  'Private debrief capture without community publishing',
];

const REQUIRED_VISUAL_STATES = [
  'CampOps recommendation available',
  'Endpoint recommendation available',
  'Delayed-day endpoint recommendation',
  'Decision points visible when supported',
  'Source transparency visible',
  'Provider shadow or unknown state',
  'Offline cached state',
  'Offline no-cache or missing-source state',
  'Stale source state',
  'AI assist disabled',
  'Telemetry disabled',
  'Community publishing disabled',
  'Manual feedback reminder visible or documented',
];

const REQUIRED_FIELD_LABELS = [
  'QA status',
  'tester',
  'device type',
  'Android version',
  'build identifier',
  'app version/commit',
  'execution date',
  'visual QA route/screen',
  'screenshot/evidence references',
  'scenario results',
  'issues found',
  'recommendation',
];

function pathsFor(root) {
  return {
    evidencePath: path.join(root, 'docs', 'campops', 'mobile_qa_evidence.md'),
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function statePattern(state) {
  const escaped = state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '[-\\s]+');
  return new RegExp(escaped, 'i');
}

function canonical(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractTableValue(markdown, label) {
  const wanted = canonical(label);
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2) continue;
    if (canonical(cells[0]) === wanted) return cells[1] ?? null;
  }
  return null;
}

function findLineIndex(markdown, pattern) {
  return markdown.split(/\r?\n/).findIndex((line) => pattern.test(line));
}

function extractTableAfterLabel(markdown, labelPattern) {
  const lines = markdown.split(/\r?\n/);
  const labelIndex = findLineIndex(markdown, labelPattern);
  if (labelIndex < 0) return [];
  const tableLines = [];
  let collecting = false;
  for (let index = labelIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('|')) {
      collecting = true;
      tableLines.push(line);
      continue;
    }
    if (collecting && line.trim() === '') break;
    if (collecting && !line.trim().startsWith('|')) break;
  }
  if (tableLines.length < 2) return [];
  const headers = tableLines[0].split('|').slice(1, -1).map((cell) => cell.trim());
  return tableLines.slice(2).map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function detectCompletionStatus(markdown) {
  const value = extractTableValue(markdown, 'QA status') ?? '';
  return /^(complete|pass|pass with issues)$/i.test(value.trim()) ? 'complete' : 'incomplete';
}

function fieldIsComplete(value) {
  return Boolean(value && !/\b(todo|not run|incomplete|n\/a|blank|missing)\b/i.test(value.trim()));
}

function requiredFieldIsComplete(field, value) {
  if (value == null) return false;
  const normalizedField = canonical(field);
  const trimmed = value.trim();
  if (normalizedField === 'qa status') return /^(complete|pass|pass with issues)$/i.test(trimmed);
  if (normalizedField === 'recommendation') return /^(blocked|ready with restrictions|not ready)$/i.test(trimmed);
  if (normalizedField === 'issues found') return !/\b(todo|not run|incomplete|n\/a|blank|missing)\b/i.test(trimmed);
  return fieldIsComplete(trimmed) && !/^none$/i.test(trimmed);
}

function resultIsRecorded(value) {
  return /^(pass|fail|pass with issues)$/i.test(String(value ?? '').trim());
}

function rowEvidenceIsComplete(row) {
  return fieldIsComplete(row['Evidence reference']);
}

function findRequiredRow(rows, requiredLabel, firstColumnName) {
  const wanted = canonical(requiredLabel);
  return rows.find((row) => canonical(row[firstColumnName]) === wanted) ?? null;
}

function recommendationUnsafeWithIssues(evidence) {
  const recommendation = extractTableValue(evidence, 'recommendation') ?? '';
  const issues = extractTableValue(evidence, 'issues found') ?? '';
  const recommendsClosedFieldTest = /\bready with restrictions\b/i.test(recommendation);
  const unresolvedIssues =
    fieldIsComplete(issues) &&
    !/\b(no issues|none|no unresolved issues|resolved only)\b/i.test(issues);
  return recommendsClosedFieldTest && unresolvedIssues;
}

export function buildAndroidQaEvidenceResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const { evidencePath } = pathsFor(root);
  const evidence = readIfExists(evidencePath);
  const missingFiles = evidence ? [] : [path.relative(root, evidencePath)];
  const missingSections = REQUIRED_SECTIONS
    .filter((section) => !section.pattern.test(evidence))
    .map((section) => section.label);
  const missingVisualStates = REQUIRED_VISUAL_STATES
    .filter((state) => !statePattern(state).test(evidence));
  const missingFields = REQUIRED_FIELD_LABELS.filter((field) => extractTableValue(evidence, field) == null);
  const incompleteFields = REQUIRED_FIELD_LABELS
    .filter((field) => {
      const value = extractTableValue(evidence, field);
      return value != null && !requiredFieldIsComplete(field, value);
    });
  const completionStatus = detectCompletionStatus(evidence);
  const scenarioRows = extractTableAfterLabel(evidence, /\bRequired scenario checklist\b/i);
  const visualStateRows = extractTableAfterLabel(evidence, /\bRequired visual-state checklist\b/i);
  const missingScenarioResults = [];
  const incompleteScenarioResults = [];
  for (const scenario of REQUIRED_SCENARIOS) {
    const row = findRequiredRow(scenarioRows, scenario, 'Scenario');
    if (!row) {
      missingScenarioResults.push(scenario);
      continue;
    }
    if (!resultIsRecorded(row['Pass/fail']) || !rowEvidenceIsComplete(row)) {
      incompleteScenarioResults.push(scenario);
    }
  }
  const missingVisualStateResults = [];
  const incompleteVisualStateResults = [];
  for (const state of REQUIRED_VISUAL_STATES) {
    const row = findRequiredRow(visualStateRows, state, 'Visual state');
    if (!row) {
      missingVisualStateResults.push(state);
      continue;
    }
    if (!resultIsRecorded(row['Pass/fail']) || !rowEvidenceIsComplete(row)) {
      incompleteVisualStateResults.push(state);
    }
  }
  const screenshotEvidencePresent =
    /\bScreenshot\/evidence references\b/i.test(evidence) &&
    !/\|\s*Screenshot\/evidence references\s*\|\s*(?:TODO|not run|incomplete|none|blocked)\b/i.test(evidence) &&
    /\b(?:artifact|screenshot|evidence)\s+(?:ref|reference|path|id)/i.test(evidence);
  const unsafeRecommendation = recommendationUnsafeWithIssues(evidence);

  const blockers = [];
  if (missingFiles.length > 0) blockers.push('mobile_qa_evidence_missing');
  if (completionStatus !== 'complete') blockers.push('android_device_qa_incomplete');
  if (missingSections.length > 0) blockers.push('android_qa_required_sections_missing');
  if (missingVisualStates.length > 0) blockers.push('android_qa_visual_states_missing');
  if (missingFields.length > 0) blockers.push('android_qa_required_fields_missing');
  if (incompleteFields.length > 0) blockers.push('android_qa_required_fields_incomplete');
  if (missingScenarioResults.length > 0) blockers.push('android_qa_required_scenarios_missing');
  if (incompleteScenarioResults.length > 0) blockers.push('android_qa_required_scenarios_incomplete');
  if (missingVisualStateResults.length > 0) blockers.push('android_qa_required_visual_state_results_missing');
  if (incompleteVisualStateResults.length > 0) blockers.push('android_qa_required_visual_state_results_incomplete');
  if (!screenshotEvidencePresent) blockers.push('android_qa_screenshot_or_evidence_references_missing');
  if (unsafeRecommendation) blockers.push('android_qa_unresolved_issues_recommend_closed_field_test');

  return {
    passed: blockers.length === 0,
    status: completionStatus,
    checkedAt: now.toISOString(),
    missingFiles,
    missingSections,
    missingVisualStates,
    missingFields,
    incompleteFields,
    missingScenarioResults,
    incompleteScenarioResults,
    missingVisualStateResults,
    incompleteVisualStateResults,
    screenshotEvidencePresent,
    unsafeRecommendation,
    blockers,
    notes: [
      'This gate is static and does not run adb, Expo, Expo Go, simulators, emulators, or physical devices.',
      'Android/device QA remains incomplete until real visual-state execution evidence is recorded.',
      'Passing this gate would not approve provider influence, AI assist, telemetry, or community publishing.',
    ],
  };
}

export function writeAndroidQaEvidenceResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatAndroidQaEvidenceResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps Android/device QA evidence: ${result.passed ? 'COMPLETE' : 'INCOMPLETE'}`,
    `ANDROID QA: ${result.passed ? 'COMPLETE' : 'INCOMPLETE'}`,
    ...(result.passed ? [] : ['Closed field testing remains blocked until Android/device QA evidence is complete.']),
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
  ];

  if (result.blockers.length > 0) {
    lines.push('', 'Android/device QA blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  if (result.incompleteFields.length > 0) {
    lines.push('', 'Incomplete evidence fields:');
    for (const field of result.incompleteFields) lines.push(`- ${field}`);
  }

  if (result.missingVisualStates.length > 0) {
    lines.push('', 'Missing visual-state coverage:');
    for (const state of result.missingVisualStates) lines.push(`- ${state}`);
  }

  if (result.incompleteScenarioResults.length > 0) {
    lines.push('', 'Incomplete scenario results:');
    for (const scenario of result.incompleteScenarioResults) lines.push(`- ${scenario}`);
  }

  if (result.incompleteVisualStateResults.length > 0) {
    lines.push('', 'Incomplete visual-state results:');
    for (const state of result.incompleteVisualStateResults) lines.push(`- ${state}`);
  }

  if (result.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }

  return `${lines.join('\n')}\n`;
}

export function runAndroidQaEvidenceCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildAndroidQaEvidenceResult({ rootDir: root });
  writeAndroidQaEvidenceResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatAndroidQaEvidenceResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runAndroidQaEvidenceCli();
}
