import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildProductionAssetInventory } from './production-asset-inventory.mjs';

const DEFAULT_REPORT_DIR = path.join('artifacts', 'app-size');
const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
]);

const TRANSIENT_FILE_PATTERNS = [
  /(^|[/\\])Thumbs\.db$/i,
  /(^|[/\\])\.DS_Store$/i,
];

const PRODUCTION_ROOTS = new Set([
  'app',
  'assets',
  'components',
  'context',
  'lib',
  'packages',
  'plugins',
  'public',
  'shims',
  'src',
  'stores',
]);

const PRODUCTION_FILES = new Set([
  'app.config.js',
  'app.config.ts',
  'app.json',
  'babel.config.js',
  'metro.config.js',
  'package.json',
  'tsconfig.json',
]);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);
const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const MAP_TILE_EXTS = new Set(['.mbtiles', '.pmtiles', '.mvt', '.pbf', '.kml', '.gpx']);
const JS_BUNDLE_PATTERNS = [
  /(^|[/\\])index\.android\.bundle$/i,
  /(^|[/\\])entry-[a-f0-9]+\.js$/i,
  /(^|[/\\])main\.[a-f0-9]+\.js$/i,
];

export function toPosix(value) {
  return value.replace(/\\/g, '/');
}

export function relPath(repoRoot, fullPath) {
  return toPosix(path.relative(repoRoot, fullPath));
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function shouldSkipDir(name, fullPath, options) {
  if (options.includeNodeModules === true && name === 'node_modules') return false;
  const rel = relPath(options.repoRoot, fullPath);
  if (name === 'node_modules' && rel.startsWith('dist/')) return false;
  if ((options.skipDirs ?? DEFAULT_EXCLUDED_DIRS).has(name)) return true;
  return options.extraSkipRelPaths?.has(rel) ?? false;
}

function isTransientFile(fullPath) {
  return TRANSIENT_FILE_PATTERNS.some((pattern) => pattern.test(fullPath));
}

export function walkFiles(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const skipDirs = options.skipDirs ?? DEFAULT_EXCLUDED_DIRS;
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, fullPath, { ...options, repoRoot: root, skipDirs })) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isTransientFile(fullPath)) continue;
      const stat = safeStat(fullPath);
      if (!stat) continue;
      files.push({
        fullPath,
        path: relPath(root, fullPath),
        bytes: stat.size,
        modifiedAtMs: stat.mtimeMs,
        extension: path.extname(entry.name).toLowerCase() || '[none]',
      });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function add(map, key, bytes) {
  map.set(key, (map.get(key) ?? 0) + bytes);
}

function topLevel(rel) {
  return rel.split('/')[0] || rel;
}

function parentDirs(rel) {
  const parts = rel.split('/');
  const dirs = [];
  for (let index = 1; index < parts.length; index += 1) {
    dirs.push(parts.slice(0, index).join('/'));
  }
  return dirs;
}

function isBuildOutput(rel) {
  return (
    rel === 'dist' ||
    rel.startsWith('dist/') ||
    rel.startsWith('android/app/build/') ||
    rel.startsWith('android/build/') ||
    rel.startsWith('.expo') ||
    rel.startsWith('.gradle') ||
    rel.startsWith('web-build/') ||
    rel.startsWith('coverage/')
  );
}

function isArtifact(rel) {
  return rel === 'artifacts' || rel.startsWith('artifacts/') || rel.startsWith('.smoke/') || rel.startsWith('qa-evidence/');
}

function isDocs(rel) {
  return rel === 'docs' || rel.startsWith('docs/') || /\.(md|mdx|txt)$/i.test(rel);
}

function isFixture(rel) {
  return rel === 'fixtures' || rel.startsWith('fixtures/') || rel.includes('/fixtures/') || rel.includes('/fixture/');
}

function isStaticAsset(rel) {
  return rel.startsWith('assets/') || rel.startsWith('public/');
}

function isProductionCandidate(file) {
  const first = topLevel(file.path);
  return PRODUCTION_ROOTS.has(first) || PRODUCTION_FILES.has(file.path);
}

function categorize(file) {
  const rel = file.path;
  if (isBuildOutput(rel)) return 'build_output';
  if (isArtifact(rel)) return 'artifact_or_evidence';
  if (isStaticAsset(rel)) return 'assets';
  if (isFixture(rel)) return 'fixtures';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (isDocs(rel)) return 'docs';
  if (isProductionCandidate(file)) return 'production_source';
  if (rel.endsWith('.apk') || rel.endsWith('.aab')) return 'android_artifact';
  return 'other';
}

function sumFiles(files, predicate) {
  return files.reduce((sum, file) => sum + (predicate(file) ? file.bytes : 0), 0);
}

function directoryBreakdown(files) {
  const dirs = new Map();
  for (const file of files) {
    for (const dir of parentDirs(file.path)) {
      add(dirs, dir, file.bytes);
    }
  }
  return Array.from(dirs.entries()).map(([dir, bytes]) => ({
    path: dir,
    bytes,
    category: categorize({ path: `${dir}/__dir__`, bytes, extension: '[none]' }),
  }));
}

function topLevelBreakdown(files) {
  const dirs = new Map();
  for (const file of files) add(dirs, topLevel(file.path), file.bytes);
  return Array.from(dirs.entries())
    .map(([dir, bytes]) => ({ path: dir, bytes, category: categorize({ path: `${dir}/__dir__`, bytes, extension: '[none]' }) }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));
}

function assetBreakdown(files) {
  const byExtension = {};
  const byDirectory = new Map();
  for (const file of files.filter((item) => isStaticAsset(item.path))) {
    byExtension[file.extension] = (byExtension[file.extension] ?? 0) + file.bytes;
    add(byDirectory, parentDirs(file.path)[0] ?? topLevel(file.path), file.bytes);
  }
  return {
    byExtension,
    byDirectory: Array.from(byDirectory.entries())
      .map(([dir, bytes]) => ({ path: dir, bytes, category: 'assets' }))
      .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)),
  };
}

function mediaBreakdown(files) {
  const output = {
    imagesBytes: 0,
    fontsBytes: 0,
    videosBytes: 0,
    mapsTilesBytes: 0,
  };
  for (const file of files.filter((item) => isStaticAsset(item.path))) {
    if (IMAGE_EXTS.has(file.extension)) output.imagesBytes += file.bytes;
    if (FONT_EXTS.has(file.extension)) output.fontsBytes += file.bytes;
    if (VIDEO_EXTS.has(file.extension)) output.videosBytes += file.bytes;
    if (MAP_TILE_EXTS.has(file.extension) || /(^|\/)(tiles|maps|map-cache)(\/|$)/i.test(file.path)) {
      output.mapsTilesBytes += file.bytes;
    }
  }
  return output;
}

function androidArtifacts(files) {
  return {
    apks: files
      .filter((file) => file.extension === '.apk')
      .map(({ path: filePath, bytes, modifiedAtMs }) => ({ path: filePath, bytes, modifiedAtMs }))
      .sort((left, right) => right.bytes - left.bytes),
    aabs: files
      .filter((file) => file.extension === '.aab')
      .map(({ path: filePath, bytes, modifiedAtMs }) => ({ path: filePath, bytes, modifiedAtMs }))
      .sort((left, right) => right.bytes - left.bytes),
  };
}

function jsBundles(files) {
  return files
    .filter((file) => (
      JS_BUNDLE_PATTERNS.some((pattern) => pattern.test(file.path)) ||
      (/^dist\/_expo\/static\/js\//.test(file.path) && file.extension === '.js')
    ))
    .map(({ path: filePath, bytes }) => ({ path: filePath, bytes }))
    .sort((left, right) => right.bytes - left.bytes);
}

function sourceMaps(files) {
  return files
    .filter((file) => file.extension === '.map')
    .map(({ path: filePath, bytes }) => ({ path: filePath, bytes }))
    .sort((left, right) => right.bytes - left.bytes);
}

function nativeLibraries(files) {
  const byAbi = {};
  const libraries = [];
  for (const file of files) {
    if (!file.path.endsWith('.so')) continue;
    const match = [
      /(?:^|\/)lib\/([^/]+)\/([^/]+\.so)$/i,
      /(?:^|\/)obj\/([^/]+)\/([^/]+\.so)$/i,
      /(?:^|\/)out\/lib\/([^/]+)\/([^/]+\.so)$/i,
      /(?:^|\/)android\.([^/]+)\/([^/]+\.so)$/i,
    ].map((pattern) => file.path.match(pattern)).find(Boolean);
    const abi = match?.[1] ?? 'unknown';
    byAbi[abi] = (byAbi[abi] ?? 0) + file.bytes;
    libraries.push({ path: file.path, abi, bytes: file.bytes });
  }
  return {
    byAbi,
    libraries: libraries.sort((left, right) => right.bytes - left.bytes).slice(0, 50),
  };
}

function reasonForLeak(file) {
  const rel = file.path.toLowerCase();
  if (!isStaticAsset(file.path)) return null;
  if (/\/(?:docs?|specs?)(?:\/|$)/.test(rel) || /\.(md|mdx|txt)$/i.test(rel)) return 'docs/spec content is under a production asset root';
  if (/\/(?:fixtures?|test-fixtures?|qa-fixtures?)(?:\/|$)/.test(rel)) return 'test fixture content is under a production asset root';
  if (/\/(?:artifacts?|evidence|screenshots?|logs?)(?:\/|$)/.test(rel)) return 'evidence or generated artifact content is under a production asset root';
  if (/\/(?:raw-cache|cache-fixtures?|tile-cache)(?:\/|$)/.test(rel)) return 'raw cache fixture content is under a production asset root';
  if (VIDEO_EXTS.has(file.extension) && file.bytes > 25 * 1024 * 1024) return 'large bundled video requires runtime/product review';
  if (IMAGE_EXTS.has(file.extension) && file.bytes > 4 * 1024 * 1024) return 'large bundled image requires optimization review';
  return null;
}

function suspectedBundleLeaks(files) {
  return files
    .map((file) => ({ file, reason: reasonForLeak(file) }))
    .filter((item) => item.reason)
    .map((item) => ({
      path: item.file.path,
      bytes: item.file.bytes,
      reason: item.reason,
    }))
    .sort((left, right) => right.bytes - left.bytes);
}

function gitSha(repoRoot) {
  try {
    return childProcess.execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function assetOptimization(files) {
  const candidates = files
    .filter((file) => isStaticAsset(file.path) && (IMAGE_EXTS.has(file.extension) || VIDEO_EXTS.has(file.extension)))
    .filter((file) => file.bytes >= 1024 * 1024)
    .map((file) => ({
      path: file.path,
      beforeBytes: file.bytes,
      afterBytes: file.bytes,
      action: 'not_modified_measurement_only',
      reason: VIDEO_EXTS.has(file.extension)
        ? 'large video asset should be compressed or deferred only after product review'
        : 'large image asset should be optimized with approved tooling',
    }))
    .sort((left, right) => right.beforeBytes - left.beforeBytes)
    .slice(0, 50);
  const beforeBytes = sumFiles(files, (file) => isStaticAsset(file.path));
  return {
    beforeBytes,
    afterBytes: beforeBytes,
    changedFiles: [],
    candidates,
  };
}

function recommendations(report) {
  const output = [];
  if (report.totals.artifactsBytes > 0) {
    output.push({
      recommendationId: 'exclude-local-artifacts',
      priority: 'critical',
      title: 'Keep generated APKs, evidence, logs, and smoke outputs out of production uploads.',
      estimatedSavingsBytes: report.totals.artifactsBytes,
      filesOrDirs: ['artifacts', '.smoke', 'qa-evidence'],
      action: 'Keep these paths ignored by EAS/Metro and clean local release workspaces before packaging.',
    });
  }
  if (report.totals.buildOutputsBytes > 0) {
    output.push({
      recommendationId: 'separate-build-output-from-installed-size',
      priority: 'high',
      title: 'Do not treat Gradle intermediates or Expo export output as installed app size.',
      estimatedSavingsBytes: report.totals.buildOutputsBytes,
      filesOrDirs: ['android/app/build', 'dist'],
      action: 'Measure APK/AAB and installed size separately from workspace build outputs.',
    });
  }
  const largestAsset = report.largestFiles.find((file) => file.category === 'assets');
  if (largestAsset && largestAsset.bytes > 20 * 1024 * 1024) {
    output.push({
      recommendationId: 'review-large-runtime-media',
      priority: 'high',
      title: 'Compress or defer the largest runtime media assets.',
      estimatedSavingsBytes: Math.round(largestAsset.bytes * 0.4),
      filesOrDirs: [largestAsset.path],
      action: 'Review whether the asset needs to ship globally or can stream/download on demand.',
    });
  }
  const releaseApk = report.androidArtifacts.apks.find((item) => item.path.includes('android/app/build/outputs/apk/release'));
  if (releaseApk) {
    output.push({
      recommendationId: 'prefer-aab-or-abi-delivery',
      priority: releaseApk.bytes > 400 * 1024 * 1024 ? 'critical' : 'medium',
      title: 'Use AAB/device delivery or ABI-specific builds for release size control.',
      estimatedSavingsBytes: undefined,
      filesOrDirs: [releaseApk.path],
      action: 'Production profile already uses AAB; compare release AAB size before judging installed size.',
    });
  }
  return output;
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '_None._';
  const header = `| ${columns.map((column) => column.label).join(' |')} |`;
  const sep = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.format ? column.format(row[column.key], row) : row[column.key] ?? '')).join(' |')} |`);
  return [header, sep, ...body].join('\n');
}

export function formatAppSizeAuditMarkdown(report) {
  return [
    '# ECS App Size Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Git SHA: ${report.gitSha ?? 'unavailable'}`,
    `Repo root: ${report.repoRoot}`,
    '',
    '## Totals',
    markdownTable([
      { label: 'Repo scanned', bytes: report.totals.repoBytes },
      { label: 'Production candidate', bytes: report.totals.productionCandidateBytes },
      { label: 'Source assets (raw)', bytes: report.totals.assetsBytes },
      { label: 'Production assets', bytes: report.totals.productionAssetsBytes },
      { label: 'Guarded production exclusions', bytes: report.totals.excludedProductionAssetsBytes },
      { label: 'Docs/specs', bytes: report.totals.docsBytes },
      { label: 'Fixtures', bytes: report.totals.fixturesBytes },
      { label: 'Artifacts/evidence', bytes: report.totals.artifactsBytes },
      { label: 'Build outputs', bytes: report.totals.buildOutputsBytes },
      { label: 'Expo export', bytes: report.totals.expoExportBytes },
      { label: 'Offline starter/cache fixtures', bytes: report.totals.offlineStarterBytes },
    ], [
      { key: 'label', label: 'Category' },
      { key: 'bytes', label: 'Size', format: formatBytes },
    ]),
    '',
    '## Production Asset Categories',
    markdownTable(report.assetInventory.byCategory, [
      { key: 'category', label: 'Category' },
      { key: 'fileCount', label: 'Files' },
      { key: 'productionSizeBytes', label: 'Production Size', format: formatBytes },
      { key: 'excludedSizeBytes', label: 'Excluded Size', format: formatBytes },
    ]),
    '',
    '## Largest Files',
    markdownTable(report.largestFiles.slice(0, 20), [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
      { key: 'category', label: 'Category' },
    ]),
    '',
    '## Largest Runtime Assets',
    markdownTable(report.largestAssets.slice(0, 20), [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
      { key: 'category', label: 'Category' },
    ]),
    '',
    '## Suspected Bundle Leaks',
    markdownTable(report.suspectedBundleLeaks.slice(0, 25), [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
      { key: 'reason', label: 'Reason' },
    ]),
    '',
    '## Recommendations',
    markdownTable(report.recommendations, [
      { key: 'recommendationId', label: 'ID' },
      { key: 'priority', label: 'Priority' },
      { key: 'title', label: 'Title' },
      { key: 'estimatedSavingsBytes', label: 'Est. Savings', format: (value) => value ? formatBytes(value) : 'TBD' },
    ]),
    '',
  ].join('\n');
}

function writeReports(repoRoot, report, reportDir = DEFAULT_REPORT_DIR) {
  const outDir = path.resolve(repoRoot, reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'app-size-report.json');
  const markdownPath = path.join(outDir, 'app-size-report.md');
  const inventoryPath = path.join(outDir, 'production-asset-inventory.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, formatAppSizeAuditMarkdown(report));
  fs.writeFileSync(inventoryPath, `${JSON.stringify(report.assetInventory, null, 2)}\n`);
  return { jsonPath, markdownPath, inventoryPath };
}

export async function buildAppSizeAuditReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const largestLimit = options.largestLimit ?? 50;
  const files = walkFiles(repoRoot, {
    includeNodeModules: options.includeNodeModules === true,
    skipDirs: new Set(options.skipDirs ?? DEFAULT_EXCLUDED_DIRS),
  });
  const productionAssetInventory = buildProductionAssetInventory({ repoRoot, files });
  const directories = directoryBreakdown(files);
  const assets = assetBreakdown(files);
  const native = nativeLibraries(files);
  const android = androidArtifacts(files);
  const largestFiles = files
    .map((file) => ({ path: file.path, bytes: file.bytes, category: categorize(file) }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, largestLimit);
  const largestAssets = files
    .filter((file) => isStaticAsset(file.path))
    .map((file) => ({ path: file.path, bytes: file.bytes, category: 'assets' }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, largestLimit);
  const largestDirectories = directories
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, largestLimit);

  const report = {
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(repoRoot),
    repoRoot,
    excludedFromDeepScan: options.includeNodeModules === true ? [] : ['node_modules', '.git'],
    totals: {
      repoBytes: sumFiles(files, () => true),
      productionCandidateBytes: sumFiles(files, isProductionCandidate),
      assetsBytes: sumFiles(files, (file) => isStaticAsset(file.path)),
      productionAssetsBytes: productionAssetInventory.summary.productionAssetBytes,
      excludedProductionAssetsBytes: productionAssetInventory.summary.excludedAssetBytes,
      docsBytes: sumFiles(files, (file) => isDocs(file.path)),
      fixturesBytes: sumFiles(files, (file) => isFixture(file.path)),
      artifactsBytes: sumFiles(files, (file) => isArtifact(file.path)),
      buildOutputsBytes: sumFiles(files, (file) => isBuildOutput(file.path)),
      expoExportBytes: sumFiles(files, (file) => file.path.startsWith('dist/')),
      offlineStarterBytes: sumFiles(files, (file) => /(^|\/)(offline|offline-failure-drill|cache|tiles?|maps?)(\/|$)/i.test(file.path)),
    },
    topLevelDirectories: topLevelBreakdown(files),
    productionSourceBreakdown: topLevelBreakdown(files.filter(isProductionCandidate)),
    largestFiles,
    largestAssets,
    largestDirectories,
    assetBreakdownByExtension: assets.byExtension,
    assetBreakdownByDirectory: assets.byDirectory,
    assetInventory: productionAssetInventory,
    mediaBreakdown: mediaBreakdown(files),
    androidArtifacts: android,
    nativeLibrariesByAbi: native.byAbi,
    nativeLibraries: native.libraries,
    jsBundles: jsBundles(files),
    sourceMaps: sourceMaps(files),
    suspectedBundleLeaks: suspectedBundleLeaks(files),
    assetOptimization: assetOptimization(files),
    recommendations: [],
  };
  report.recommendations = recommendations(report);

  if (options.writeReports !== false) {
    report.reportPaths = writeReports(repoRoot, report, options.reportDir);
  }

  return report;
}

async function main() {
  const report = await buildAppSizeAuditReport({ repoRoot: process.cwd(), writeReports: true });
  console.log(`App size audit complete: ${report.reportPaths.jsonPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
