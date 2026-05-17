import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'no-runtime-mock-imports-result.json');
const INVENTORY_RELATIVE_PATH = 'mock-data-inventory.md';

const RUNTIME_ROOTS = ['app', 'components', 'context', 'config', 'lib', 'src', 'stores', 'supabase/functions'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.json']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set([
  '.git',
  '.expo',
  '.smoke',
  '.cxx',
  '.gradle',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
]);
const IGNORED_FILES = new Set([
  'package-lock.json',
  'mock-data-inventory.md',
]);

const INVENTORY_TERMS = [
  'mock',
  'fake',
  'demo',
  'dummy',
  'sample',
  'placeholder',
  'hardcoded',
  'stub',
  'seed',
  'fixture',
  'simulated',
  'fallback',
  'testData',
  'exampleData',
  'DEFAULT_',
  'initialData',
  'staticRoutes',
  'sampleRoutes',
  'sampleVehicles',
  'sampleWeather',
  'sampleTelemetry',
  'sampleCamps',
  'sampleDispatch',
  'mockRoutes',
  'mockVehicles',
  'mockWeather',
  'mockTelemetry',
  'mockCamp',
  'mockDispatch',
  'mockProvider',
];

const INVENTORY_WORD_TERMS = [
  'mock',
  'fake',
  'demo',
  'dummy',
  'sample',
  'placeholder',
  'hardcoded',
  'stub',
  'seed',
  'fixture',
  'simulated',
  'fallback',
];
const INVENTORY_EXACT_TERMS = INVENTORY_TERMS.filter((term) => !INVENTORY_WORD_TERMS.includes(term));
const INVENTORY_PATTERN = new RegExp(
  [
    `\\b(${INVENTORY_WORD_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    ...INVENTORY_EXACT_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ].join('|'),
  'i',
);

const MOCK_PATH_SEGMENT_PATTERN = /(^|[\\/_.-])(mock|mocks|demo|demos|sample|samples|fixture|fixtures|stub|stubs)([\\/_.-]|$)/i;
const MOCK_NAMED_IMPORT_PATTERN = /\b(Mock[A-Z][A-Za-z0-9_]*|MOCK_[A-Z0-9_]+|mock[A-Z][A-Za-z0-9_]*)\b/;
const IMPORT_SPECIFIER_PATTERN =
  /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\))/;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isIgnoredDir(name) {
  return IGNORED_DIRS.has(name);
}

function isSourceFile(filePath) {
  return SCAN_EXTENSIONS.has(path.extname(filePath));
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

function walkFiles(root, start = root, result = []) {
  if (!fs.existsSync(start)) return result;
  const entries = fs.readdirSync(start, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!isIgnoredDir(entry.name)) walkFiles(root, path.join(start, entry.name), result);
      continue;
    }
    if (!entry.isFile()) continue;
    if (IGNORED_FILES.has(entry.name)) continue;
    const fullPath = path.join(start, entry.name);
    if (isSourceFile(fullPath)) result.push(fullPath);
  }
  return result;
}

function runtimeFiles(root) {
  const files = [];
  for (const relativeRoot of RUNTIME_ROOTS) {
    walkFiles(root, path.join(root, relativeRoot), files);
  }
  return files.filter(isCodeFile);
}

function isDevOrTestFile(root, filePath) {
  const rel = toPosix(path.relative(root, filePath));
  const base = path.basename(filePath);
  return (
    rel.startsWith('scripts/') ||
    rel.startsWith('docs/') ||
    rel.includes('/__tests__/') ||
    rel.includes('/test/') ||
    rel.includes('/tests/') ||
    rel.includes('/fixtures/') ||
    rel.includes('/dev/') ||
    rel.includes('/demo/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    /(^|[_.-])(mock|demo|fixture|sample|stub)([_.-]|$)/i.test(base) ||
    /(Mock|Demo|Fixture|Sample|Stub)/.test(base)
  );
}

function isRelativeMockSpecifier(specifier) {
  return MOCK_PATH_SEGMENT_PATTERN.test(specifier);
}

function statementHasNamedMockImport(statement) {
  return MOCK_NAMED_IMPORT_PATTERN.test(statement);
}

function lineNumberForOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function extractImportStatements(source) {
  const lines = source.split(/\r?\n/);
  const statements = [];
  let pending = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const startsImport =
      /^import\b/.test(trimmed) ||
      /^export\b.*\bfrom\b/.test(trimmed) ||
      /\brequire\(\s*['"][^'"]+['"]\s*\)/.test(trimmed) ||
      /\bimport\(\s*['"][^'"]+['"]\s*\)/.test(trimmed);

    if (!pending && !startsImport) return;

    if (!pending) {
      pending = { line: index + 1, text: line };
    } else {
      pending.text += `\n${line}`;
    }

    if (
      trimmed.endsWith(';') ||
      /\brequire\(\s*['"][^'"]+['"]\s*\)/.test(trimmed) ||
      /\bimport\(\s*['"][^'"]+['"]\s*\)/.test(trimmed)
    ) {
      statements.push(pending);
      pending = null;
    }
  });

  if (pending) statements.push(pending);
  return statements;
}

function classifyHit(root, filePath, line) {
  const rel = toPosix(path.relative(root, filePath));
  const trimmed = line.trim();
  if (rel.startsWith('scripts/') || rel.includes('/__tests__/') || rel.includes('/fixtures/') || /\.(test|spec)\./.test(rel)) {
    return {
      classification: 'KEEP_TEST_FIXTURE',
      rationale: 'Test, fixture, or release-check data is not imported by production runtime.',
    };
  }
  if (rel.startsWith('docs/') || path.basename(filePath) === 'AGENTS.md') {
    return {
      classification: 'KEEP_UI_PLACEHOLDER_LABEL_ONLY',
      rationale: 'Documentation/reference wording, not runtime operational data.',
    };
  }
  if (
    rel.includes('/dev/') ||
    rel.includes('/demo/') ||
    /(^|[_.-])(mock|demo|sample|fixture|stub)([_.-]|$)/i.test(path.basename(filePath)) ||
    /(Mock|Demo|Fixture|Sample|Stub)/.test(path.basename(filePath))
  ) {
    return {
      classification: 'MOVE_TO_DEV_ONLY',
      rationale: 'Explicit dev/demo/mock artifact; production runtime imports are blocked by guard.',
    };
  }
  if (/placeholder(TextColor)?=|placeholderTextColor|placeholder/i.test(trimmed)) {
    return {
      classification: 'KEEP_UI_PLACEHOLDER_LABEL_ONLY',
      rationale: 'Input empty-state or UI placeholder label, not operational truth.',
    };
  }
  if (/source:\s*['"]mock['"]|sourceTruth:\s*['"]simulated['"]|simulated:\s*true|mock:\s*true/i.test(trimmed)) {
    return {
      classification: 'REPLACE_WITH_EMPTY_STATE',
      rationale: 'Runtime source marker must render as unavailable/dev-only, never live operational truth.',
    };
  }
  if (/provider|weather|telemetry|route|camp|dispatch|vehicle|power|fleet|advisory|brief/i.test(rel)) {
    return {
      classification: 'REPLACE_WITH_PROVIDER_DATA',
      rationale: 'Operational runtime surface; values must come from provider, persisted user data, deterministic calculation, or unavailable state.',
    };
  }
  if (/fallback|DEFAULT_|initialData/i.test(trimmed)) {
    return {
      classification: 'KEEP_UI_PLACEHOLDER_LABEL_ONLY',
      rationale: 'Runtime default/control flow fallback; verify it does not inject fake operational values.',
    };
  }
  return {
    classification: 'REMOVE_FROM_RUNTIME',
    rationale: 'Potential production-facing mock/demo/sample data requires removal or explicit gating.',
  };
}

export function buildMockDataInventory(root = process.cwd()) {
  const files = walkFiles(root);
  const hits = [];
  for (const filePath of files) {
    const rel = toPosix(path.relative(root, filePath));
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!INVENTORY_PATTERN.test(line)) return;
      const { classification, rationale } = classifyHit(root, filePath, line);
      const term = line.match(INVENTORY_PATTERN)?.[0] ?? 'unknown';
      hits.push({
        file: rel,
        line: index + 1,
        term,
        classification,
        rationale,
        text: line.trim().replace(/\|/g, '\\|').slice(0, 180),
      });
    });
  }
  return hits;
}

export function formatMockDataInventory(hits, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const byClass = hits.reduce((map, hit) => {
    map.set(hit.classification, (map.get(hit.classification) ?? 0) + 1);
    return map;
  }, new Map());
  const lines = [
    '# Mock Data Inventory',
    '',
    `Generated: ${checkedAt}`,
    '',
    'This inventory classifies repository hits for mock/demo/sample/fallback-style terms. Classification is conservative: production runtime imports from mock/demo/sample/fixture/stub data locations are enforced by `scripts/check-no-runtime-mock-imports.mjs`, while test fixtures, docs, and explicit dev/demo artifacts may remain only when they are not imported by production runtime.',
    '',
    '## Summary',
    '',
    '| Classification | Hits |',
    '| --- | ---: |',
  ];
  for (const key of [
    'REMOVE_FROM_RUNTIME',
    'MOVE_TO_DEV_ONLY',
    'KEEP_TEST_FIXTURE',
    'KEEP_UI_PLACEHOLDER_LABEL_ONLY',
    'REPLACE_WITH_EMPTY_STATE',
    'REPLACE_WITH_PROVIDER_DATA',
  ]) {
    lines.push(`| ${key} | ${byClass.get(key) ?? 0} |`);
  }
  lines.push('', '## Hits', '', '| File | Line | Term | Classification | Rationale | Text |', '| --- | ---: | --- | --- | --- | --- |');
  for (const hit of hits) {
    lines.push(`| \`${hit.file}\` | ${hit.line} | \`${hit.term}\` | ${hit.classification} | ${hit.rationale} | ${hit.text} |`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

export function writeMockDataInventory(hits, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const outputPath = path.join(root, INVENTORY_RELATIVE_PATH);
  fs.writeFileSync(outputPath, formatMockDataInventory(hits, { checkedAt: options.checkedAt }), 'utf8');
  return outputPath;
}

export function buildNoRuntimeMockImportResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const violations = [];
  const files = runtimeFiles(root);

  for (const filePath of files) {
    if (isDevOrTestFile(root, filePath)) continue;
    const rel = toPosix(path.relative(root, filePath));
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const candidate of extractImportStatements(source)) {
      const statement = candidate.text.trim().replace(/\s+/g, ' ');
      const match = statement.match(IMPORT_SPECIFIER_PATTERN);
      const specifier = match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
      if (!specifier && !/\b(import|export|require)\b/.test(statement)) continue;
      const hasMockPath = isRelativeMockSpecifier(specifier);
      const hasMockName = statementHasNamedMockImport(statement);
      if (!hasMockPath && !hasMockName) continue;
      violations.push({
        file: rel,
        line: candidate.line,
        specifier,
        reason: hasMockPath
          ? 'runtime_imports_mock_demo_sample_fixture_or_stub_path'
          : 'runtime_imports_named_mock_symbol',
        statement,
      });
    }
  }

  return {
    passed: violations.length === 0,
    status: violations.length === 0 ? 'passed' : 'blocked',
    checkedAt: now.toISOString(),
    violations,
    blockers: violations.length === 0 ? [] : ['runtime_mock_imports_present'],
    notes: [
      'Production runtime files must not statically import mock/demo/sample/fixture/stub data.',
      'Dev/test fixtures may remain in explicit dev, demo, fixture, or test locations.',
      'Runtime unavailable states, UI placeholders, feature flags, provider interfaces, and test fixtures are not removed by this guard.',
    ],
  };
}

export function writeNoRuntimeMockImportResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatNoRuntimeMockImportResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Runtime mock import guard: ${result.passed ? 'PASS' : 'BLOCKED'}`,
    `Result file: ${path.relative(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
  ];
  if (result.violations.length > 0) {
    lines.push('', 'Violations:');
    for (const violation of result.violations) {
      lines.push(`- ${violation.file}:${violation.line} ${violation.reason} (${violation.specifier || 'named import'})`);
    }
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export function runNoRuntimeMockImportCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const jsonOnly = args.includes('--json');
  const writeInventory = args.includes('--write-inventory');
  const result = buildNoRuntimeMockImportResult({ rootDir: root });
  writeNoRuntimeMockImportResult(result, { rootDir: root });

  if (writeInventory) {
    const hits = buildMockDataInventory(root);
    const outputPath = writeMockDataInventory(hits, { rootDir: root, checkedAt: result.checkedAt });
    stderr.write(`Mock data inventory written to ${path.relative(root, outputPath)} (${hits.length} hits).\n`);
  }

  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatNoRuntimeMockImportResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = runNoRuntimeMockImportCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
