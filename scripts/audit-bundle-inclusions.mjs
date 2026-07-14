import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  formatBytes,
  relPath,
  toPosix,
  walkFiles,
} from './audit-app-size.mjs';

const DEFAULT_REPORT_DIR = path.join('artifacts', 'app-size');
const SOURCE_ROOTS = ['app', 'components', 'context', 'lib', 'src', 'stores', 'packages', 'plugins'];
const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json']);
const ASSET_ROOTS = ['assets', 'public'];
const REQUIRED_EASIGNORE_PATTERNS = [
  'docs/',
  'fixtures/',
  'qa-evidence/',
  'artifacts/',
  'dist/',
  '.smoke/',
  'scripts/test-*.js',
  'assets/images/recovery-protocols/',
];

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sourceFiles(repoRoot, files) {
  return files
    .filter((file) => {
      const first = file.path.split('/')[0];
      return SOURCE_ROOTS.includes(first) || ['app.json', 'app.config.js', 'metro.config.js', 'package.json'].includes(file.path);
    })
    .filter((file) => SOURCE_EXTS.has(path.extname(file.path).toLowerCase()) || file.path.endsWith('.config.js'))
    .map((file) => ({
      ...file,
      text: readText(path.join(repoRoot, file.path)),
    }));
}

function assetFiles(files) {
  return files.filter((file) => ASSET_ROOTS.some((root) => file.path === root || file.path.startsWith(`${root}/`)));
}

function isRuntimeAllowedProtocolAsset(rel) {
  return (
    rel.startsWith('assets/images/protocols/') ||
    rel.startsWith('assets/images/safety-protocols/') ||
    rel.startsWith('assets/runtime/')
  );
}

function isForbiddenAssetPath(rel) {
  const normalized = rel.toLowerCase();
  if (isRuntimeAllowedProtocolAsset(rel)) return false;
  return (
    /\/(?:docs?|specs?)(?:\/|$)/.test(normalized) ||
    /\/(?:fixtures?|test-fixtures?|qa-fixtures?)(?:\/|$)/.test(normalized) ||
    /\/(?:artifacts?|evidence|screenshots?|logs?)(?:\/|$)/.test(normalized) ||
    /\/(?:raw-cache|cache-fixtures?|tile-cache|debug-db)(?:\/|$)/.test(normalized) ||
    /\.(md|mdx|log|sqlite|db)$/i.test(rel)
  );
}

function reasonForForbidden(rel) {
  const normalized = rel.toLowerCase();
  if (/\/(?:docs?|specs?)(?:\/|$)/.test(normalized) || /\.(md|mdx)$/i.test(rel)) return 'docs/spec content under production asset root';
  if (/\/(?:fixtures?|test-fixtures?|qa-fixtures?)(?:\/|$)/.test(normalized)) return 'test fixture under production asset root';
  if (/\/(?:artifacts?|evidence|screenshots?|logs?)(?:\/|$)/.test(normalized) || /\.(log)$/i.test(rel)) return 'evidence/log/artifact under production asset root';
  if (/\/(?:raw-cache|cache-fixtures?|tile-cache|debug-db)(?:\/|$)/.test(normalized) || /\.(sqlite|db)$/i.test(rel)) return 'raw cache/debug database under production asset root';
  return 'forbidden production asset inclusion';
}

function assetReferenced(assetRel, sources) {
  const normalized = toPosix(assetRel);
  const bare = normalized.replace(/^assets\//, '');
  const basename = path.basename(normalized);
  return sources.some((source) => (
    source.text.includes(normalized) ||
    source.text.includes(`./${normalized}`) ||
    source.text.includes(`../${normalized}`) ||
    source.text.includes(bare) ||
    (basename.length > 8 && source.text.includes(basename))
  ));
}

function assetBundlePatterns(repoRoot) {
  const appJson = readJson(path.join(repoRoot, 'app.json'));
  const patterns = appJson?.expo?.assetBundlePatterns ?? [];
  return Array.isArray(patterns) ? patterns : [];
}

function isBroadPattern(pattern) {
  return pattern === '**/*' || pattern === './**/*' || pattern === 'assets/**/*' || pattern === './assets/**/*';
}

function easignorePatterns(repoRoot) {
  return readText(path.join(repoRoot, '.easignore'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function uploadExclusionGaps(patterns) {
  return REQUIRED_EASIGNORE_PATTERNS
    .filter((required) => !patterns.includes(required))
    .map((pattern) => ({
      pattern,
      reason: 'production upload exclusion is missing for non-runtime bulk',
      severity: pattern === 'artifacts/' || pattern === 'dist/' || pattern === '.smoke/' || pattern === 'assets/images/recovery-protocols/' ? 'block' : 'warn',
    }));
}

function knownRuntimeAssets(assets, sources) {
  return assets
    .filter((asset) => !isForbiddenAssetPath(asset.path))
    .filter((asset) => isRuntimeAllowedProtocolAsset(asset.path) || assetReferenced(asset.path, sources))
    .map((asset) => ({ path: asset.path, bytes: asset.bytes }));
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '_None._';
  const header = `| ${columns.map((column) => column.label).join(' |')} |`;
  const sep = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.format ? column.format(row[column.key], row) : row[column.key] ?? '')).join(' |')} |`);
  return [header, sep, ...body].join('\n');
}

export function formatBundleInclusionMarkdown(report) {
  return [
    '# ECS Bundle Inclusion Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Repo root: ${report.repoRoot}`,
    '',
    '## Forbidden Included Files',
    markdownTable(report.forbiddenIncludedFiles, [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
      { key: 'reason', label: 'Reason' },
    ]),
    '',
    '## Upload Exclusion Gaps',
    markdownTable(report.uploadExclusionGaps, [
      { key: 'pattern', label: 'Pattern' },
      { key: 'severity', label: 'Severity' },
      { key: 'reason', label: 'Reason' },
    ]),
    '',
    '## Runtime Referenced Assets',
    markdownTable(report.runtimeReferencedAssets.slice(0, 25), [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
    ]),
    '',
  ].join('\n');
}

function writeReports(repoRoot, report, reportDir = DEFAULT_REPORT_DIR) {
  const outDir = path.resolve(repoRoot, reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'bundle-inclusion-report.json');
  const markdownPath = path.join(outDir, 'bundle-inclusion-report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, formatBundleInclusionMarkdown(report));
  return { jsonPath, markdownPath };
}

export async function buildBundleInclusionReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const files = walkFiles(repoRoot, { includeNodeModules: false });
  const sources = sourceFiles(repoRoot, files);
  const assets = assetFiles(files);
  const patterns = assetBundlePatterns(repoRoot);
  const broadPatterns = patterns.filter(isBroadPattern);
  const runtimeReferencedAssets = assets
    .filter((asset) => assetReferenced(asset.path, sources))
    .map((asset) => ({ path: asset.path, bytes: asset.bytes }))
    .sort((left, right) => right.bytes - left.bytes);
  const forbiddenIncludedFiles = assets
    .filter((asset) => isForbiddenAssetPath(asset.path))
    .map((asset) => ({
      path: asset.path,
      bytes: asset.bytes,
      reason: reasonForForbidden(asset.path),
      runtimeReferenced: assetReferenced(asset.path, sources),
      severity: 'block',
    }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));
  const easignore = easignorePatterns(repoRoot);
  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    assetBundlePatterns: patterns,
    broadAssetBundlePatterns: broadPatterns,
    forbiddenIncludedFiles,
    uploadExclusionGaps: uploadExclusionGaps(easignore),
    runtimeReferencedAssets,
    knownRuntimeAssets: knownRuntimeAssets(assets, sources),
    exclusionRules: {
      easignore,
      requiredEasignorePatterns: REQUIRED_EASIGNORE_PATTERNS,
    },
    warnings: [
      ...broadPatterns.map((pattern) => `Broad assetBundlePatterns entry can include unintended files: ${pattern}`),
      ...forbiddenIncludedFiles
        .filter((item) => item.runtimeReferenced)
        .map((item) => `Forbidden file is runtime-referenced and needs relocation before exclusion: ${item.path}`),
    ],
  };

  if (options.writeReports !== false) {
    report.reportPaths = writeReports(repoRoot, report, options.reportDir);
  }

  return report;
}

async function main() {
  const report = await buildBundleInclusionReport({ repoRoot: process.cwd(), writeReports: true });
  console.log(`Bundle inclusion audit complete: ${report.reportPaths.jsonPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
