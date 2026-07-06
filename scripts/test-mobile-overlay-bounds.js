const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const modalShellSource = read('components/ECSModalShell.tsx');
const exploreRoutePreviewSource = read('components/discover/ExploreRoutePreviewModal.tsx');
const navigateSource = read('app/(tabs)/navigate.tsx');
const { resolveMobileOverlayBounds } = loadTypeScriptModule('lib/ui/mobileOverlayBounds.ts');

function assertBoundsFit(result, label) {
  assert.ok(result.shellMaxHeight >= 0, `${label} shell max height must be non-negative.`);
  assert.ok(result.shellMinHeight == null || result.shellMinHeight <= result.shellMaxHeight, `${label} shell min height must not exceed max height.`);
  assert.ok(
    result.topClearance + result.bottomClearance + result.shellMaxHeight <= result.viewportHeight,
    `${label} overlay must fit within viewport height.`,
  );
  assert.ok(
    result.sideClearance * 2 + result.shellWidth <= result.viewportWidth,
    `${label} overlay must fit within viewport width.`,
  );
}

assertBoundsFit(
  resolveMobileOverlayBounds({
    viewportWidth: 640,
    viewportHeight: 360,
    requestedTopClearance: 92,
    requestedBottomClearance: 112,
    requestedSideClearance: 20,
    maxWidth: 980,
    maxHeightFraction: 1,
    minHeightFraction: 1,
  }),
  'short Android landscape',
);

assertBoundsFit(
  resolveMobileOverlayBounds({
    viewportWidth: 320,
    viewportHeight: 568,
    requestedTopClearance: 96,
    requestedBottomClearance: 128,
    requestedSideClearance: 14,
    maxWidth: 980,
    maxHeightFraction: 0.94,
    minHeightFraction: 0.86,
  }),
  'iPhone SE portrait',
);

assertBoundsFit(
  resolveMobileOverlayBounds({
    viewportWidth: 280,
    viewportHeight: 540,
    requestedTopClearance: 80,
    requestedBottomClearance: 118,
    requestedSideClearance: 18,
    maxWidth: 980,
    maxHeightFraction: 0.82,
  }),
  'narrow Android phone',
);

assert.ok(
  modalShellSource.includes("import { resolveMobileOverlayBounds } from '../lib/ui/mobileOverlayBounds';"),
  'ECSModalShell must use the shared mobile overlay bounds resolver.',
);
assert.ok(
  modalShellSource.includes('const overlayBounds = resolveMobileOverlayBounds({'),
  'ECSModalShell must resolve bounded mobile overlay metrics before rendering.',
);
assert.ok(
  !modalShellSource.includes('Math.max(320, height - topClearance - bottomClearance)'),
  'ECSModalShell must not force a 320px body when the mobile viewport cannot fit it.',
);
for (const fragment of [
  'paddingHorizontal: overlayBounds.sideClearance',
  'paddingTop: overlayBounds.topClearance',
  'paddingBottom: overlayBounds.bottomClearance',
  'width: overlayBounds.shellWidth',
  'maxHeight: overlayBounds.shellMaxHeight',
]) {
  assert.ok(modalShellSource.includes(fragment), `ECSModalShell must render with ${fragment}.`);
}

assert.ok(
  exploreRoutePreviewSource.includes('scrollable\n      topClearanceOverride'),
  'Information-heavy Explore route previews must use the shell ScrollView on mobile.',
);
assert.ok(
  !exploreRoutePreviewSource.includes('scrollable={false}'),
  'Explore route preview must not disable scrolling for route/readiness/map detail content.',
);
assert.ok(
  navigateSource.includes('Keyboard,') &&
    navigateSource.includes("Keyboard.addListener('keyboardWillShow'") &&
    navigateSource.includes("Keyboard.addListener('keyboardDidShow'") &&
    navigateSource.includes("Keyboard.addListener('keyboardWillHide'") &&
    navigateSource.includes("Keyboard.addListener('keyboardDidHide'"),
  'Navigate mobile map search must track keyboard visibility on iOS and Android.',
);
assert.ok(
  navigateSource.includes('idleDestinationSearchMaxHeight') &&
    navigateSource.includes('idleDestinationSearchResultsMaxHeight') &&
    navigateSource.includes('idleDestinationSearchRenderLimit') &&
    navigateSource.includes('keyboardHeight > 0 ? 3 : IDLE_DESTINATION_SEARCH_RENDER_LIMIT') &&
    navigateSource.includes('style={[styles.idleDestinationSearchShell, { maxHeight: idleDestinationSearchMaxHeight }]}') &&
    navigateSource.includes('style={[styles.idleDestinationSearchResultsScroll, { maxHeight: idleDestinationSearchResultsMaxHeight }]}'),
  'Navigate destination search must bound its shell and result scrollers so mobile content stays reachable above keyboard/bottom controls.',
);

console.log('Mobile overlay bounds checks passed.');
