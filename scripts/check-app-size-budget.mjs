import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildAppSizeAuditReport,
  formatBytes,
} from './audit-app-size.mjs';
import { buildBundleInclusionReport } from './audit-bundle-inclusions.mjs';

const DEFAULT_REPORT_DIR = path.join('artifacts', 'app-size');
const DEFAULT_CONFIG_PATH = path.join('config', 'app-size-budget.json');

const DEFAULT_BUDGET = {
  requireProductionArtifact: true,
  maxApkBytes: 400 * 1024 * 1024,
  warnApkBytes: 350 * 1024 * 1024,
  maxAabBytes: 260 * 1024 * 1024,
  warnAabBytes: 220 * 1024 * 1024,
  maxExpoExportBytes: 300 * 1024 * 1024,
  warnExpoExportBytes: 250 * 1024 * 1024,
  maxProductionAssetsBytes: 225 * 1024 * 1024,
  warnProductionAssetsBytes: 180 * 1024 * 1024,
  maxLargestAssetBytes: 32 * 1024 * 1024,
  warnLargestAssetBytes: 25 * 1024 * 1024,
  maxOfflineStarterBytes: 50 * 1024 * 1024,
  warnOfflineStarterBytes: 30 * 1024 * 1024,
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadBudgetConfig(repoRoot, configPath = DEFAULT_CONFIG_PATH) {
  const explicit = readJson(path.resolve(repoRoot, configPath));
  return { ...DEFAULT_BUDGET, ...(explicit ?? {}) };
}

function largest(items = []) {
  return items.reduce((selected, item) => {
    if (!selected || Number(item.bytes ?? 0) > Number(selected.bytes ?? 0)) return item;
    return selected;
  }, null);
}

function currentProductionArtifact(items = []) {
  const canonical = items.filter((item) => (
    /android\/app\/build\/outputs\/(?:apk|bundle)\/release\//.test(item.path ?? '')
  ));
  const candidates = canonical.length > 0 ? canonical : items;
  return candidates.reduce((selected, item) => {
    if (!selected) return item;
    const selectedModifiedAt = Number(selected.modifiedAtMs ?? 0);
    const itemModifiedAt = Number(item.modifiedAtMs ?? 0);
    if (itemModifiedAt !== selectedModifiedAt) {
      return itemModifiedAt > selectedModifiedAt ? item : selected;
    }
    return Number(item.bytes ?? 0) > Number(selected.bytes ?? 0) ? item : selected;
  }, null);
}

function addThresholdResult(args) {
  const {
    blockers,
    warnings,
    label,
    value,
    hard,
    warn,
    hardMessage,
    warnMessage,
  } = args;
  if (typeof value !== 'number' || value <= 0) return;
  if (typeof hard === 'number' && value > hard) {
    blockers.push(`${hardMessage ?? label} exceeds hard budget: ${formatBytes(value)} > ${formatBytes(hard)}.`);
    return;
  }
  if (typeof warn === 'number' && value > warn) {
    warnings.push(`${warnMessage ?? label} exceeds warning budget: ${formatBytes(value)} > ${formatBytes(warn)}.`);
  }
}

function measuredSizes(auditReport) {
  const apk = currentProductionArtifact(auditReport.androidArtifacts?.apks ?? []);
  const aab = currentProductionArtifact(auditReport.androidArtifacts?.aabs ?? []);
  const inventoryAssets = (auditReport.assetInventory?.assets ?? [])
    .filter((item) => item.budgetCounted === true && item.productionIncluded === true)
    .map((item) => ({
      path: item.filePath,
      bytes: item.rawSizeBytes,
      category: 'assets',
    }));
  const largestAssetCandidates = inventoryAssets.length > 0 ? inventoryAssets : [
    ...(auditReport.largestAssets ?? []),
    ...(auditReport.assetOptimization?.candidates ?? []).map((item) => ({
      path: item.path,
      bytes: item.beforeBytes,
      category: 'assets',
    })),
    ...(auditReport.largestFiles ?? []).filter((item) => item.category === 'assets'),
  ];
  const largestAsset = largest(largestAssetCandidates);
  return {
    apkBytes: apk?.bytes ?? 0,
    apkPath: apk?.path ?? null,
    aabBytes: aab?.bytes ?? 0,
    aabPath: aab?.path ?? null,
    expoExportBytes: auditReport.totals?.expoExportBytes ?? 0,
    productionAssetsBytes: auditReport.totals?.productionAssetsBytes ?? auditReport.totals?.assetsBytes ?? 0,
    largestAssetBytes: largestAsset?.bytes ?? 0,
    largestAssetPath: largestAsset?.path ?? null,
    offlineStarterBytes: auditReport.totals?.offlineStarterBytes ?? 0,
  };
}

export function evaluateAppSizeBudget({
  auditReport,
  bundleReport,
  budgetConfig = DEFAULT_BUDGET,
} = {}) {
  if (!auditReport) throw new Error('auditReport is required');
  const config = { ...DEFAULT_BUDGET, ...(budgetConfig ?? {}) };
  const measured = measuredSizes(auditReport);
  const blockers = [];
  const warnings = [];
  const forbidden = bundleReport?.forbiddenIncludedFiles ?? [];
  const uploadGaps = bundleReport?.uploadExclusionGaps ?? [];

  forbidden
    .filter((item) => item.severity !== 'warn')
    .forEach((item) => blockers.push(`forbidden bundle inclusion: ${item.path} (${item.reason}).`));

  uploadGaps
    .filter((item) => item.severity === 'block')
    .forEach((item) => blockers.push(`required production exclusion missing: ${item.pattern}.`));

  uploadGaps
    .filter((item) => item.severity !== 'block')
    .forEach((item) => warnings.push(`recommended production exclusion missing: ${item.pattern}.`));

  const hasProductionArtifact = measured.apkBytes > 0 || measured.aabBytes > 0;
  if (config.requireProductionArtifact && !hasProductionArtifact) {
    blockers.push('No measurable production APK/AAB artifact is available for budget evaluation.');
    return {
      status: 'unavailable',
      passed: false,
      blockers,
      warnings,
      measured,
      budgets: config,
      largestContributors: auditReport.largestFiles ?? [],
    };
  }

  addThresholdResult({
    blockers,
    warnings,
    label: 'APK',
    value: measured.apkBytes,
    hard: config.maxApkBytes,
    warn: config.warnApkBytes,
    hardMessage: 'APK',
    warnMessage: 'APK',
  });
  addThresholdResult({
    blockers,
    warnings,
    label: 'AAB',
    value: measured.aabBytes,
    hard: config.maxAabBytes,
    warn: config.warnAabBytes,
    hardMessage: 'AAB',
    warnMessage: 'AAB',
  });
  addThresholdResult({
    blockers,
    warnings,
    label: 'Expo export',
    value: measured.expoExportBytes,
    hard: config.maxExpoExportBytes,
    warn: config.warnExpoExportBytes,
    hardMessage: 'Expo export',
    warnMessage: 'Expo export',
  });
  addThresholdResult({
    blockers,
    warnings,
    label: 'production bundled assets',
    value: measured.productionAssetsBytes,
    hard: config.maxProductionAssetsBytes,
    warn: config.warnProductionAssetsBytes,
    hardMessage: 'production bundled assets',
    warnMessage: 'production bundled assets',
  });
  addThresholdResult({
    blockers,
    warnings,
    label: 'largest single asset',
    value: measured.largestAssetBytes,
    hard: config.maxLargestAssetBytes,
    warn: config.warnLargestAssetBytes,
    hardMessage: 'largest single asset',
    warnMessage: 'largest single asset',
  });
  addThresholdResult({
    blockers,
    warnings,
    label: 'runtime offline starter content',
    value: measured.offlineStarterBytes,
    hard: config.maxOfflineStarterBytes,
    warn: config.warnOfflineStarterBytes,
    hardMessage: 'runtime offline starter content',
    warnMessage: 'runtime offline starter content',
  });

  const status = blockers.length > 0
    ? 'blocked'
    : warnings.length > 0
      ? 'warning'
      : 'passed';

  return {
    status,
    passed: status === 'passed' || status === 'warning',
    blockers,
    warnings,
    measured,
    budgets: config,
    largestContributors: auditReport.largestFiles ?? [],
  };
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '_None._';
  const header = `| ${columns.map((column) => column.label).join(' |')} |`;
  const sep = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.format ? column.format(row[column.key], row) : row[column.key] ?? '')).join(' |')} |`);
  return [header, sep, ...body].join('\n');
}

export function formatAppSizeBudgetMarkdown(result) {
  const measuredRows = Object.entries(result.measured ?? {}).map(([key, value]) => ({ key, value }));
  return [
    '# ECS App Size Budget Gate',
    '',
    `Status: ${result.status}`,
    '',
    '## Blockers',
    result.blockers.length ? result.blockers.map((item) => `- ${item}`).join('\n') : '- None',
    '',
    '## Warnings',
    result.warnings.length ? result.warnings.map((item) => `- ${item}`).join('\n') : '- None',
    '',
    '## Measured Sizes',
    markdownTable(measuredRows, [
      { key: 'key', label: 'Metric' },
      { key: 'value', label: 'Value', format: (value) => typeof value === 'number' ? formatBytes(value) : value },
    ]),
    '',
    '## Largest Contributors',
    markdownTable((result.largestContributors ?? []).slice(0, 20), [
      { key: 'path', label: 'Path' },
      { key: 'bytes', label: 'Size', format: formatBytes },
      { key: 'category', label: 'Category' },
    ]),
    '',
  ].join('\n');
}

function writeReports(repoRoot, result, reportDir = DEFAULT_REPORT_DIR) {
  const outDir = path.resolve(repoRoot, reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'app-size-budget-report.json');
  const markdownPath = path.join(outDir, 'app-size-budget-report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(markdownPath, formatAppSizeBudgetMarkdown(result));
  return { jsonPath, markdownPath };
}

async function main() {
  const repoRoot = process.cwd();
  const budgetConfig = loadBudgetConfig(repoRoot);
  const auditReport = await buildAppSizeAuditReport({ repoRoot, writeReports: true });
  const bundleReport = await buildBundleInclusionReport({ repoRoot, writeReports: true });
  const result = evaluateAppSizeBudget({ auditReport, bundleReport, budgetConfig });
  result.reportPaths = writeReports(repoRoot, result);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'blocked' || result.status === 'unavailable') process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
