const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const {
  resolveDispersedCampingRegionPanelLayout,
  resolveDispersedCampingRouteSummaryWidth,
} = loadTsModule('lib/navigation/dispersedCampingOverlayLayout.ts');

const tabletLayout = resolveDispersedCampingRegionPanelLayout({
  windowWidth: 820,
  overlayEdge: 12,
  overlayGap: 12,
  routeSummaryVisible: true,
  routeSummaryLeft: 12,
  defaultBottomOffset: 248,
  compactBottomOffset: 90,
  rightControlInset: 94,
});

assert.strictEqual(
  tabletLayout.mode,
  'right_of_route_summary',
  'Wide map layouts should move the map region menu to the right of the dispersed camping near-route card.',
);
assert.strictEqual(tabletLayout.left, 310);
assert.strictEqual(tabletLayout.right, 94);
assert.strictEqual(tabletLayout.bottomOffset, 90);
assert(tabletLayout.maxWidth <= 430, 'Adjacent map region menu should preserve the tactical max width.');
assert(
  tabletLayout.left >= 12 + resolveDispersedCampingRouteSummaryWidth(820) + 12,
  'Adjacent map region menu must start after the near-route card plus a gap.',
);

const phoneLayout = resolveDispersedCampingRegionPanelLayout({
  windowWidth: 390,
  overlayEdge: 12,
  overlayGap: 10,
  routeSummaryVisible: true,
  routeSummaryLeft: 12,
  defaultBottomOffset: 248,
  compactBottomOffset: 90,
  rightControlInset: 88,
});

assert.strictEqual(
  phoneLayout.mode,
  'stacked_above_route_summary',
  'Narrow map layouts should stack the map region menu above the near-route card instead of squeezing it beside controls.',
);
assert.strictEqual(phoneLayout.left, 12);
assert.strictEqual(phoneLayout.right, 12);
assert.strictEqual(phoneLayout.bottomOffset, 248);

const idleLayout = resolveDispersedCampingRegionPanelLayout({
  windowWidth: 820,
  overlayEdge: 12,
  overlayGap: 12,
  routeSummaryVisible: false,
  routeSummaryLeft: 12,
  defaultBottomOffset: 140,
  compactBottomOffset: 90,
  rightControlInset: 94,
});

assert.strictEqual(
  idleLayout.mode,
  'centered',
  'Without a route summary, the map region menu should keep the existing centered sheet behavior.',
);
assert.strictEqual(idleLayout.left, 12);
assert.strictEqual(idleLayout.right, 12);

const regionSheetSource = fs.readFileSync(
  path.join(root, 'components/navigate/DispersedCampingRegionSheet.tsx'),
  'utf8',
);

assert(
  regionSheetSource.includes('pointerEvents="box-none"') &&
    regionSheetSource.includes('styles.shell'),
  'The map region shell should use box-none so its empty overlay space never blocks the near-route card.',
);
assert(
  regionSheetSource.includes('leftOffset') &&
    regionSheetSource.includes('rightOffset') &&
    regionSheetSource.includes('cardAlignSelf'),
  'The map region sheet should accept computed horizontal placement from the Navigate layout resolver.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');
assert(
  navigateSource.includes('resolveDispersedCampingRegionPanelLayout'),
  'Navigate should resolve dispersed camping region sheet placement with the shared layout helper.',
);
assert(
  navigateSource.includes('dispersedCampingRegionSheetLayout.left') &&
    navigateSource.includes('dispersedCampingRegionSheetLayout.right') &&
    navigateSource.includes('dispersedCampingRegionSheetLayout.bottomOffset'),
  'Navigate should pass computed left/right/bottom offsets into the map region sheet.',
);

console.log('[navigate-dispersed-camping-layout] overlay placement checks passed');
