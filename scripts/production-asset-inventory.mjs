import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const POLICY_PATH = path.join('config', 'production-asset-policy.json');
const STATIC_ASSET_PREFIXES = ['assets/', 'public/'];
const NATIVE_RESOURCE_PREFIXES = ['android/app/src/main/res/', 'ios/'];
const RUNTIME_SOURCE_ROOTS = new Set([
  'app',
  'components',
  'context',
  'lib',
  'packages',
  'plugins',
  'shims',
  'src',
  'stores',
  'android',
  'ios',
]);
const RUNTIME_CONFIG_FILES = new Set([
  'app.config.js',
  'app.config.ts',
  'app.json',
  'babel.config.js',
  'metro.config.js',
  'package.json',
]);
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.gradle', '.js', '.json', '.jsx', '.md', '.mjs', '.properties', '.ts', '.tsx', '.xml',
]);
const IMAGE_EXTENSIONS = new Set(['.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2']);
const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.webm']);
const MAP_EXTENSIONS = new Set(['.geojson', '.gpx', '.kml', '.mbtiles', '.mvt', '.pbf', '.pmtiles']);
const VALID_EXCLUSION_CLASSES = new Set(['development-only', 'generated', 'unused']);

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

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

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function isStaticSourceAsset(filePath) {
  return STATIC_ASSET_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isNativeResource(filePath) {
  return NATIVE_RESOURCE_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isInventoryAsset(file) {
  return isStaticSourceAsset(file.path) || isNativeResource(file.path);
}

function assetType(file) {
  if (isNativeResource(file.path)) return 'native_resource';
  if (IMAGE_EXTENSIONS.has(file.extension)) return 'image';
  if (FONT_EXTENSIONS.has(file.extension)) return 'font';
  if (VIDEO_EXTENSIONS.has(file.extension)) return 'video';
  if (MAP_EXTENSIONS.has(file.extension)) return 'map_or_route_data';
  if (file.extension === '.riv') return 'rive';
  if (file.extension === '.wav' || file.extension === '.mp3') return 'audio';
  return 'other';
}

function assetCategory(filePath) {
  const parts = filePath.split('/');
  if (filePath.startsWith('android/app/src/main/res/')) return 'native/android-resources';
  if (filePath.startsWith('ios/')) return 'native/ios-resources';
  return parts.slice(0, Math.min(parts.length - 1, 2)).join('/');
}

function pngDimensions(filePath) {
  try {
    const buffer = Buffer.alloc(24);
    const descriptor = fs.openSync(filePath, 'r');
    try {
      if (fs.readSync(descriptor, buffer, 0, 24, 0) !== 24) return null;
    } finally {
      fs.closeSync(descriptor);
    }
    if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function normalizePrefix(value) {
  const normalized = toPosix(String(value ?? '')).replace(/^\.\//, '');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function validRelativePrefix(value) {
  const normalized = normalizePrefix(value);
  return (
    normalized.length > 1 &&
    !path.isAbsolute(normalized) &&
    !normalized.split('/').includes('..') &&
    STATIC_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function loadPolicy(repoRoot) {
  const policyPath = path.join(repoRoot, POLICY_PATH);
  const raw = readJson(policyPath);
  const issues = [];
  if (!raw || raw.schemaVersion !== 1) {
    issues.push({
      code: 'asset_policy_missing_or_invalid',
      path: POLICY_PATH,
      summary: 'Production asset policy is missing or does not use schema version 1; no exclusions were applied.',
    });
    return {
      schemaVersion: 1,
      productionExclusions: [],
      offlineRequiredPrefixes: [],
      requiredRuntimePrefixes: [],
      issues,
    };
  }

  const productionExclusions = [];
  for (const candidate of Array.isArray(raw.productionExclusions) ? raw.productionExclusions : []) {
    const pathPrefix = normalizePrefix(candidate?.pathPrefix);
    const valid = (
      validRelativePrefix(pathPrefix) &&
      VALID_EXCLUSION_CLASSES.has(candidate?.classification) &&
      typeof candidate?.reason === 'string' && candidate.reason.trim().length > 0 &&
      typeof candidate?.easIgnorePattern === 'string' && candidate.easIgnorePattern.trim().length > 0 &&
      typeof candidate?.metroBlockMarker === 'string' && candidate.metroBlockMarker.trim().length > 0
    );
    if (!valid) {
      issues.push({
        code: 'asset_policy_exclusion_invalid',
        path: pathPrefix,
        summary: 'Malformed production asset exclusion was ignored.',
      });
      continue;
    }
    productionExclusions.push({
      pathPrefix,
      classification: candidate.classification,
      reason: candidate.reason.trim(),
      easIgnorePattern: candidate.easIgnorePattern.trim(),
      metroBlockMarker: candidate.metroBlockMarker.trim(),
    });
  }

  const safePrefixes = (values) => (Array.isArray(values) ? values : [])
    .map(normalizePrefix)
    .filter(validRelativePrefix);

  return {
    schemaVersion: 1,
    productionExclusions,
    offlineRequiredPrefixes: safePrefixes(raw.offlineRequiredPrefixes),
    requiredRuntimePrefixes: safePrefixes(raw.requiredRuntimePrefixes),
    issues,
  };
}

function applyExclusionProtections(repoRoot, policy) {
  const easIgnore = new Set(
    readText(path.join(repoRoot, '.easignore'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );
  const metroSource = readText(path.join(repoRoot, 'metro.config.js'));
  const protectedExclusions = [];
  const issues = [...policy.issues];

  for (const exclusion of policy.productionExclusions) {
    const easProtected = easIgnore.has(exclusion.easIgnorePattern);
    const metroProtected = metroSource.includes(exclusion.metroBlockMarker);
    if (!easProtected || !metroProtected) {
      issues.push({
        code: 'asset_policy_exclusion_unprotected',
        path: exclusion.pathPrefix,
        summary: `Exclusion remains production-counted because ${[
          !easProtected ? '.easignore' : null,
          !metroProtected ? 'Metro block marker' : null,
        ].filter(Boolean).join(' and ')} protection is missing.`,
      });
      continue;
    }
    protectedExclusions.push(exclusion);
  }

  return { protectedExclusions, issues };
}

function sourceKind(filePath) {
  const first = filePath.split('/')[0];
  if (/(^|\/)(?:docs?|fixtures?|tests?|test-fixtures?)(\/|$)/i.test(filePath)) {
    return 'development_test_documentation';
  }
  if (first === 'assets' || first === 'public') return 'runtime';
  if (RUNTIME_SOURCE_ROOTS.has(first) || RUNTIME_CONFIG_FILES.has(filePath)) return 'runtime';
  return 'development_test_documentation';
}

function candidateReferenceSources(files) {
  return files.filter((file) => {
    if (file.bytes > 2 * 1024 * 1024) return false;
    if (file.path === 'package-lock.json') return false;
    return TEXT_EXTENSIONS.has(file.extension) || RUNTIME_CONFIG_FILES.has(file.path);
  });
}

function resolveReference(sourcePath, literal) {
  const cleaned = toPosix(literal.trim()).split(/[?#]/, 1)[0];
  if (!cleaned || cleaned.includes('${')) return null;
  if (cleaned.startsWith('/')) return `public${cleaned}`;
  if (cleaned.startsWith('assets/') || cleaned.startsWith('public/')) return cleaned;
  if (!cleaned.startsWith('.')) return null;
  return toPosix(path.normalize(path.join(path.dirname(sourcePath), cleaned))).replace(/^\.\//, '');
}

function collectReferences(repoRoot, files, assetPaths) {
  const references = new Map(Array.from(assetPaths, (assetPath) => [assetPath, new Set()]));
  const directPathPattern = /(?:assets|public)\/[A-Za-z0-9@._()\-/]+/g;
  const quotedLiteralPattern = /(['"`])([^'"`\r\n]{1,500})\1/g;

  for (const source of candidateReferenceSources(files)) {
    const text = readText(path.join(repoRoot, source.path));
    if (!text) continue;
    const candidates = new Set(text.match(directPathPattern) ?? []);
    for (const match of text.matchAll(quotedLiteralPattern)) {
      const resolved = resolveReference(source.path, match[2]);
      if (resolved) candidates.add(resolved);
    }
    for (const candidate of candidates) {
      const normalized = toPosix(candidate).replace(/[),.;:]+$/, '');
      if (references.has(normalized)) references.get(normalized).add(source.path);
    }
  }

  return references;
}

function exportedAssetMap(files) {
  const map = new Map();
  for (const file of files) {
    if (!file.path.startsWith('dist/')) continue;
    if (!IMAGE_EXTENSIONS.has(file.extension) && !FONT_EXTENSIONS.has(file.extension) &&
        !VIDEO_EXTENSIONS.has(file.extension) && !MAP_EXTENSIONS.has(file.extension) &&
        file.extension !== '.riv' && file.extension !== '.wav' && file.extension !== '.mp3') continue;
    const digest = sha256(file.fullPath);
    const matches = map.get(digest) ?? [];
    matches.push({ path: file.path, bytes: file.bytes });
    map.set(digest, matches);
  }
  return map;
}

function normalizedNearDuplicateStem(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/(?:@(?:2|3)x|[-_](?:copy|optimized|small|medium|large|mobile|web|native|\d+x\d+))+$/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function assignDuplicateGroups(items) {
  const exact = new Map();
  for (const item of items) {
    const group = exact.get(item.contentSha256) ?? [];
    group.push(item);
    exact.set(item.contentSha256, group);
  }

  const duplicateGroups = [];
  for (const [digest, group] of exact.entries()) {
    if (group.length < 2) continue;
    const groupId = `sha256:${digest.slice(0, 16)}`;
    group.forEach((item) => { item.duplicateGroup = groupId; });
    duplicateGroups.push({
      groupId,
      paths: group.map((item) => item.filePath).sort(),
      bytesPerCopy: group[0].rawSizeBytes,
      reclaimableBytes: group.slice(1).reduce((sum, item) => sum + item.rawSizeBytes, 0),
    });
  }

  const near = new Map();
  for (const item of items) {
    if (item.assetType !== 'image' || !item.dimensions) continue;
    const key = `${item.assetType}:${item.dimensions.width}x${item.dimensions.height}:${normalizedNearDuplicateStem(item.filePath)}`;
    const group = near.get(key) ?? [];
    group.push(item);
    near.set(key, group);
  }

  const nearDuplicateGroups = [];
  for (const [key, group] of near.entries()) {
    const uniqueDigests = new Set(group.map((item) => item.contentSha256));
    if (group.length < 2 || uniqueDigests.size < 2) continue;
    const groupId = `dimensions-and-name:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    group.forEach((item) => { item.nearDuplicateGroup = groupId; });
    nearDuplicateGroups.push({
      groupId,
      paths: group.map((item) => item.filePath).sort(),
      comparisonBasis: 'matching dimensions and normalized filename; visual equivalence not asserted',
    });
  }

  return {
    duplicateGroups: duplicateGroups.sort((left, right) => right.reclaimableBytes - left.reclaimableBytes),
    nearDuplicateGroups: nearDuplicateGroups.sort((left, right) => left.groupId.localeCompare(right.groupId)),
  };
}

function platformUsage(filePath, references) {
  const platforms = new Set();
  if (filePath.startsWith('public/')) platforms.add('web');
  if (filePath.startsWith('android/')) platforms.add('android');
  if (filePath.startsWith('ios/')) platforms.add('ios');
  for (const reference of references) {
    if (reference.includes('.web.')) {
      platforms.add('web');
    } else if (reference.includes('.native.')) {
      platforms.add('android');
      platforms.add('ios');
    } else if (sourceKind(reference) === 'runtime') {
      platforms.add('android');
      platforms.add('ios');
      platforms.add('web');
    }
  }
  return Array.from(platforms).sort();
}

function recommendationFor(item) {
  if (!item.productionIncluded) return 'Keep outside production; retain only as a local generated/development asset.';
  if (item.offlineRequired) return 'Preserve in the offline-capable runtime; optimize only with equivalent local behavior and visual verification.';
  if (item.duplicateGroup) return 'Review for canonical deduplication after confirming platform and dynamic-manifest references.';
  if (item.usage === 'unknown') return 'Manually verify dynamic and native references before removal; static absence alone is not proof.';
  if (item.assetType === 'image' && item.rawSizeBytes >= 1024 * 1024) return 'Consider pixel-identical recompression or an approved format/dimension change with visual QA.';
  if (item.assetType === 'video' && item.rawSizeBytes >= 5 * 1024 * 1024) return 'Review codec, dimensions, frame rate, and lazy delivery while preserving offline requirements.';
  return 'Retain; no automatic optimization recommended.';
}

function summarizeByCategory(items) {
  const categories = new Map();
  for (const item of items.filter((entry) => entry.budgetCounted)) {
    const current = categories.get(item.category) ?? {
      category: item.category,
      fileCount: 0,
      rawSizeBytes: 0,
      productionSizeBytes: 0,
      excludedSizeBytes: 0,
    };
    current.fileCount += 1;
    current.rawSizeBytes += item.rawSizeBytes;
    if (item.productionIncluded) current.productionSizeBytes += item.rawSizeBytes;
    else current.excludedSizeBytes += item.rawSizeBytes;
    categories.set(item.category, current);
  }
  return Array.from(categories.values())
    .sort((left, right) => right.productionSizeBytes - left.productionSizeBytes || left.category.localeCompare(right.category));
}

export function buildProductionAssetInventory({ repoRoot, files }) {
  const policy = loadPolicy(repoRoot);
  const protections = applyExclusionProtections(repoRoot, policy);
  const candidates = files.filter(isInventoryAsset);
  const candidatePaths = new Set(candidates.map((file) => file.path));
  const referencesByAsset = collectReferences(repoRoot, files, candidatePaths);
  const exportedByDigest = exportedAssetMap(files);

  const assets = candidates.map((file) => {
    const references = Array.from(referencesByAsset.get(file.path) ?? []).sort();
    const runtimeReferences = references.filter((reference) => sourceKind(reference) === 'runtime');
    const developmentReferences = references.filter((reference) => sourceKind(reference) !== 'runtime');
    const exclusion = protections.protectedExclusions.find((entry) => file.path.startsWith(entry.pathPrefix)) ?? null;
    const offlineRequired = policy.offlineRequiredPrefixes.some((prefix) => file.path.startsWith(prefix));
    const requiredByPolicy = policy.requiredRuntimePrefixes.some((prefix) => file.path.startsWith(prefix));
    const contentSha256 = sha256(file.fullPath);
    const exportMatches = exportedByDigest.get(contentSha256) ?? [];
    const budgetCounted = isStaticSourceAsset(file.path);
    const nativeResource = isNativeResource(file.path);
    const productionIncluded = !budgetCounted || exclusion == null;
    const usage = nativeResource || runtimeReferences.length > 0 || requiredByPolicy
      ? 'runtime'
      : developmentReferences.length > 0
        ? 'development_test_documentation'
        : 'unknown';
    const safetyClassification = exclusion?.classification ?? (
      nativeResource || offlineRequired || requiredByPolicy || runtimeReferences.length > 0
        ? 'required'
        : developmentReferences.length > 0
          ? 'development-only'
          : 'unknown'
    );

    return {
      filePath: file.path,
      assetType: assetType(file),
      category: assetCategory(file.path),
      rawSizeBytes: file.bytes,
      packagedSizeBytes: null,
      exportedSizeBytes: exportMatches.length > 0
        ? exportMatches.reduce((sum, match) => sum + match.bytes, 0)
        : null,
      exportedPaths: exportMatches.map((match) => match.path).sort(),
      contentSha256,
      dimensions: file.extension === '.png' ? pngDimensions(file.fullPath) : null,
      references,
      runtimeReferences,
      developmentReferences,
      usage,
      platformUsage: platformUsage(file.path, references),
      duplicateGroup: null,
      nearDuplicateGroup: null,
      optimizationRecommendation: '',
      safetyClassification,
      offlineRequired,
      budgetCounted,
      productionIncluded,
      exclusion: exclusion ? {
        pathPrefix: exclusion.pathPrefix,
        reason: exclusion.reason,
        easIgnorePattern: exclusion.easIgnorePattern,
        metroBlockMarker: exclusion.metroBlockMarker,
      } : null,
    };
  });

  const groups = assignDuplicateGroups(assets);
  assets.forEach((item) => { item.optimizationRecommendation = recommendationFor(item); });
  assets.sort((left, right) => right.rawSizeBytes - left.rawSizeBytes || left.filePath.localeCompare(right.filePath));

  const sourceAssets = assets.filter((item) => item.budgetCounted);
  const productionAssets = sourceAssets.filter((item) => item.productionIncluded);
  const excludedAssets = sourceAssets.filter((item) => !item.productionIncluded);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      path: POLICY_PATH,
      schemaVersion: policy.schemaVersion,
      protectedExclusions: protections.protectedExclusions,
      issues: protections.issues,
    },
    summary: {
      inventoryFileCount: assets.length,
      sourceAssetCount: sourceAssets.length,
      nativeResourceCount: assets.length - sourceAssets.length,
      rawSourceAssetBytes: sourceAssets.reduce((sum, item) => sum + item.rawSizeBytes, 0),
      productionAssetBytes: productionAssets.reduce((sum, item) => sum + item.rawSizeBytes, 0),
      excludedAssetBytes: excludedAssets.reduce((sum, item) => sum + item.rawSizeBytes, 0),
      excludedAssetCount: excludedAssets.length,
      offlineRequiredAssetCount: assets.filter((item) => item.offlineRequired).length,
      unknownSafetyAssetCount: assets.filter((item) => item.safetyClassification === 'unknown').length,
    },
    byCategory: summarizeByCategory(assets),
    duplicateGroups: groups.duplicateGroups,
    nearDuplicateGroups: groups.nearDuplicateGroups,
    assets,
  };
}
