const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const assetRoot = path.join(root, 'assets', 'expedition-badges');
const artworkIndexPath = path.join(assetRoot, 'index.ts');
const catalogPath = path.join(root, 'lib', 'expedition', 'expeditionBadgeCatalog.ts');
const artworkComponentPath = path.join(root, 'components', 'dashboard', 'ExpeditionBadgeArtwork.tsx');
const catalogViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionBadgeCatalogView.tsx');

for (const requiredPath of [
  artworkIndexPath,
  path.join(assetRoot, 'badge-manifest.json'),
  catalogPath,
  artworkComponentPath,
  catalogViewPath,
]) {
  assert(fs.existsSync(requiredPath), `Badge integration file is missing: ${path.relative(root, requiredPath)}`);
}

require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;
require.extensions['.png'] = function loadStaticImage(module, filename) {
  module.exports = { uri: filename };
};

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

function pngDimensions(filename) {
  const header = fs.readFileSync(filename).subarray(0, 24);
  assert.strictEqual(header.length, 24, `${filename} should contain a PNG header.`);
  assert.strictEqual(header.toString('hex', 0, 8), '89504e470d0a1a0a', `${filename} should be a PNG.`);
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

const artworkIndexSource = fs.readFileSync(artworkIndexPath, 'utf8');
const staticRequirePattern = /^\s*'([^']+)'\s*:\s*require\('([^']+\.png)'\) as ImageSourcePropType,?$/gm;
const artworkEntries = Array.from(artworkIndexSource.matchAll(staticRequirePattern), (match) => ({
  id: match[1],
  requirePath: match[2],
}));

assert.strictEqual(artworkEntries.length, 163, 'Artwork map should contain 163 literal PNG requires.');
assert(!artworkIndexSource.includes('require(`'), 'Artwork map must not use computed template-literal requires.');
assert(!artworkIndexSource.includes('badge-manifest.json'), 'Validation metadata must not enter the runtime bundle.');

for (const entry of artworkEntries) {
  const filename = path.resolve(assetRoot, entry.requirePath);
  assert(filename.startsWith(assetRoot), `${entry.id} should resolve inside the badge asset directory.`);
  assert(fs.existsSync(filename), `${entry.id} artwork file should exist.`);
  assert.deepStrictEqual(pngDimensions(filename), { width: 384, height: 384 }, `${entry.id} should use 384 x 384 mobile artwork.`);
}

const pngFiles = [];
for (const tier of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'hidden']) {
  for (const filename of fs.readdirSync(path.join(assetRoot, tier))) {
    if (filename.endsWith('.png')) pngFiles.push(path.join(tier, filename));
  }
}
assert.strictEqual(pngFiles.length, 163, 'Asset tiers should contain exactly 163 PNGs.');

const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'badge-manifest.json'), 'utf8'));
assert.strictEqual(manifest.length, 163, 'Validation manifest should describe all 163 mobile assets.');

const { EXPEDITION_BADGE_DEFINITIONS } = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts'));
const {
  EXPEDITION_BADGE_ARTWORK,
  hasExpeditionBadgeArtwork,
} = require(artworkIndexPath);
const {
  getExpeditionBadgeCatalogEntry,
  getExpeditionBadgeCatalogForUser,
} = require(catalogPath);

const definitionIds = EXPEDITION_BADGE_DEFINITIONS.map((definition) => definition.id);
const artworkIds = Object.keys(EXPEDITION_BADGE_ARTWORK);
const definitionsById = new Map(EXPEDITION_BADGE_DEFINITIONS.map((definition) => [definition.id, definition]));
assert.strictEqual(definitionIds.length, 163, 'Canonical registry should remain at 163 definitions.');
assert.deepStrictEqual(
  definitionIds.filter((id) => !hasExpeditionBadgeArtwork(id)),
  [],
  'Every canonical badge definition should have artwork.',
);
assert.deepStrictEqual(
  artworkIds.filter((id) => !definitionIds.includes(id)),
  [],
  'Artwork map should not contain orphan badge IDs.',
);
assert.deepStrictEqual(
  manifest.map((entry) => entry.id).sort(),
  [...artworkIds].sort(),
  'Validation manifest should have exact artwork-map coverage.',
);
for (const entry of artworkEntries) {
  const definition = definitionsById.get(entry.id);
  const tier = entry.requirePath.split('/')[1];
  assert.strictEqual(tier, definition.rarity, `${entry.id} artwork tier should match the canonical registry rarity.`);
  const metadata = manifest.find((item) => item.id === entry.id);
  assert(metadata, `${entry.id} should be represented in validation metadata.`);
  assert.strictEqual(entry.requirePath, `./${metadata.assetPath}`);
  assert.deepStrictEqual(
    { width: metadata.width, height: metadata.height, format: metadata.format, state: metadata.state },
    { width: 384, height: 384, format: 'PNG', state: 'achieved' },
  );
}

const visibleId = EXPEDITION_BADGE_DEFINITIONS.find((definition) => !definition.isHidden).id;
const hiddenId = EXPEDITION_BADGE_DEFINITIONS.find((definition) => definition.isHidden).id;
const repeatableId = EXPEDITION_BADGE_DEFINITIONS.find((definition) => definition.isRepeatable).id;
const earnedIds = [visibleId, visibleId, hiddenId, repeatableId, repeatableId];
const earnedIdsBefore = [...earnedIds];
const catalog = getExpeditionBadgeCatalogForUser(earnedIds);

const earnedVisible = catalog.find((entry) => entry.definition.id === visibleId);
assert(earnedVisible?.isEarned, 'Earned visible badge should be included and marked earned.');
assert(earnedVisible?.artwork, 'Earned visible badge should receive achieved artwork.');

const lockedVisible = catalog.find(
  (entry) => !entry.definition.isHidden && !earnedIds.includes(entry.definition.id),
);
assert(lockedVisible, 'Locked visible badge should remain in the catalog.');
assert.strictEqual(lockedVisible.isEarned, false);
assert.strictEqual(lockedVisible.artwork, null, 'Locked visible badge must not receive achieved artwork.');

const earnedHidden = catalog.find((entry) => entry.definition.id === hiddenId);
assert(earnedHidden?.isEarned, 'Earned hidden badge should be revealed and marked earned.');
assert(earnedHidden?.artwork, 'Earned hidden badge should receive achieved artwork.');

const hiddenLockedCatalog = getExpeditionBadgeCatalogForUser([]);
assert(
  hiddenLockedCatalog.every((entry) => !entry.definition.isHidden),
  'Locked hidden badges must be absent without exposing metadata.',
);
assert.strictEqual(
  catalog.filter((entry) => entry.definition.id === repeatableId).length,
  1,
  'Repeatable unlock records should deduplicate only for catalog membership.',
);
assert.deepStrictEqual(earnedIds, earnedIdsBefore, 'Catalog derivation must not mutate earned history.');
assert.strictEqual(getExpeditionBadgeCatalogEntry('unknown-badge', new Set()), null);
assert.strictEqual(getExpeditionBadgeCatalogEntry(hiddenId, new Set()), null);
assert(getExpeditionBadgeCatalogEntry(hiddenId, new Set([hiddenId]))?.artwork);

const originalLoad = Module._load;
Module._load = function loadBadgeComponentDependency(request, parent, isMain) {
  if (request === 'react-native') return { Image: 'Image' };
  return originalLoad(request, parent, isMain);
};
let ExpeditionBadgeArtwork;
try {
  ({ ExpeditionBadgeArtwork } = require(artworkComponentPath));
} finally {
  Module._load = originalLoad;
}
const artworkElement = ExpeditionBadgeArtwork({ badgeId: visibleId, title: 'First Expedition', size: 112 });
assert(artworkElement, 'Known earned badge artwork component should render an image element.');
assert.strictEqual(artworkElement.props.resizeMode, 'contain');
assert.strictEqual(artworkElement.props.accessibilityRole, 'image');
assert.strictEqual(artworkElement.props.accessibilityLabel, 'First Expedition, achieved badge');
assert.deepStrictEqual(artworkElement.props.style[0], { width: 112, height: 112 });
assert.strictEqual(ExpeditionBadgeArtwork({ badgeId: 'unknown-badge', title: 'Unknown' }), null);

const artworkComponentSource = fs.readFileSync(artworkComponentPath, 'utf8');
assert(artworkComponentSource.includes('resizeMode="contain"'));
assert(artworkComponentSource.includes('accessibilityRole="image"'));
assert(artworkComponentSource.includes('`${title}, achieved badge`'));

const catalogViewSource = fs.readFileSync(catalogViewPath, 'utf8');
assert(catalogViewSource.includes('SectionList'), 'Large badge catalog should use a virtualized list.');
assert(catalogViewSource.includes('buildExpeditionBadgeCatalogPresentation'));
assert(catalogViewSource.includes('isEarned={entry.isEarned}'));
assert(catalogViewSource.includes('badgeProgress'), 'Locked catalog entries should preserve known progress.');

const visualsSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionBadgeVisuals.tsx'), 'utf8');
assert(visualsSource.includes('ExpeditionBadgeArtwork'));
assert(visualsSource.includes('isEarned && artwork'), 'Achieved artwork must be gated by earned state.');
assert(visualsSource.includes('badge.iconKey'), 'Locked visible badges should retain iconKey rendering.');

console.log('Expedition badge artwork integration checks passed.');
