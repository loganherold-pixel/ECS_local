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

function parseBounds(value) {
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(value ?? '');
  assert.ok(match, `Android bounds should be parseable: ${value}`);
  const [, left, top, right, bottom] = match;
  return {
    left: Number(left),
    top: Number(top),
    right: Number(right),
    bottom: Number(bottom),
    width: Number(right) - Number(left),
    height: Number(bottom) - Number(top),
  };
}

function parseAndroidNodes(xml) {
  return Array.from(xml.matchAll(/<node\b[^>]*>/g)).map((match) => {
    const node = match[0];
    const readAttr = (name) => {
      const attrMatch = new RegExp(` ${name}="([^"]*)"`).exec(node);
      return attrMatch?.[1] ?? '';
    };
    return {
      text: readAttr('text'),
      contentDesc: readAttr('content-desc'),
      className: readAttr('class'),
      bounds: parseBounds(readAttr('bounds')),
    };
  });
}

function findAndroidNode(nodes, predicate, label) {
  const node = nodes.find(predicate);
  assert.ok(node, `${label} should be present in the emulator evidence XML.`);
  return node;
}

function assertAndroidNodeWithinViewport(node, viewport, label) {
  assert.ok(node.bounds.left >= viewport.left, `${label} should not fall off the left edge.`);
  assert.ok(node.bounds.top >= viewport.top, `${label} should not fall off the top edge.`);
  assert.ok(node.bounds.right <= viewport.right, `${label} should not fall off the right edge.`);
  assert.ok(node.bounds.bottom <= viewport.bottom, `${label} should not fall off the bottom edge.`);
  assert.ok(node.bounds.width > 0 && node.bounds.height > 0, `${label} should have a visible touch/render area.`);
}

function assertNavigateOverlayEvidenceXml(relativePath, label) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;

  const nodes = parseAndroidNodes(fs.readFileSync(fullPath, 'utf8'));
  const viewport = nodes[0]?.bounds;
  assert.ok(viewport, `${label} should include a root viewport node.`);

  const activeGuidance = findAndroidNode(
    nodes,
    (node) => node.contentDesc.startsWith('Expand active guidance.'),
    `${label} active guidance banner`,
  );
  const instruction = findAndroidNode(
    nodes,
    (node) => node.text.includes('turn left onto Unnamed road'),
    `${label} active guidance instruction`,
  );
  const recenter = findAndroidNode(
    nodes,
    (node) => node.contentDesc === 'Recenter map on current location',
    `${label} recenter control`,
  );
  const routeGeometry = findAndroidNode(
    nodes,
    (node) => node.contentDesc === 'Route geometry overlay, off',
    `${label} route geometry control`,
  );
  const navigateDock = findAndroidNode(
    nodes,
    (node) => node.contentDesc === 'NAVIGATE, NAVIGATE',
    `${label} bottom Navigate dock item`,
  );
  const exploreDock = findAndroidNode(
    nodes,
    (node) => node.contentDesc === 'EXPLORE, EXPLORE',
    `${label} bottom Explore dock item`,
  );

  [
    [activeGuidance, 'active guidance banner'],
    [instruction, 'active guidance instruction'],
    [routeGeometry, 'route geometry control'],
    [recenter, 'recenter control'],
    [navigateDock, 'Navigate dock item'],
    [exploreDock, 'Explore dock item'],
  ].forEach(([node, nodeLabel]) => assertAndroidNodeWithinViewport(node, viewport, `${label} ${nodeLabel}`));

  assert.ok(
    activeGuidance.bounds.bottom <= routeGeometry.bounds.top,
    `${label} active guidance should stay above the right-rail route geometry control.`,
  );
  assert.ok(
    routeGeometry.bounds.bottom <= recenter.bounds.top,
    `${label} route geometry control should stay above the recenter/compass lane.`,
  );
  assert.ok(
    recenter.bounds.bottom <= navigateDock.bounds.top,
    `${label} recenter control should stay above the bottom dock.`,
  );
  assert.ok(
    exploreDock.bounds.top >= navigateDock.bounds.top,
    `${label} Explore dock item should remain reachable in the same bottom touch lane.`,
  );
}

const modalShellSource = read('components/ECSModalShell.tsx');
const exploreRoutePreviewSource = read('components/discover/ExploreRoutePreviewModal.tsx');
const navigateSource = read('app/(tabs)/navigate.tsx');
const appConfig = JSON.parse(read('app.json'));
const androidManifestSource = read('android/app/src/main/AndroidManifest.xml');
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
assert.strictEqual(
  appConfig.expo.android.softwareKeyboardLayoutMode,
  'pan',
  'Android should pan focused inputs instead of resizing the full map/WebView tree during keyboard transitions.',
);
assert.ok(
  androidManifestSource.includes('android:windowSoftInputMode="adjustPan"'),
  'Checked-in Android manifest should match Expo keyboard pan mode for release emulator builds.',
);
assert.ok(
  navigateSource.includes('idleDestinationSearchMaxHeight') &&
    navigateSource.includes('idleDestinationSearchPanelMaxHeight') &&
    navigateSource.includes('IDLE_DESTINATION_SEARCH_KEYBOARD_MAX_HEIGHT') &&
    navigateSource.includes('idleDestinationSearchResultsMaxHeight') &&
    navigateSource.includes('idleDestinationSearchRenderLimit') &&
    navigateSource.includes('IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT') &&
    navigateSource.includes('destinationSearchInputActive ? IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT : IDLE_DESTINATION_SEARCH_RENDER_LIMIT') &&
    navigateSource.includes('styles.idleDestinationSearchShell') &&
    navigateSource.includes('destinationSearchInputActive && styles.idleDestinationSearchShellKeyboardActive') &&
    navigateSource.includes('{ maxHeight: idleDestinationSearchPanelMaxHeight }') &&
    navigateSource.includes('style={[styles.idleDestinationSearchResultsScroll, { maxHeight: idleDestinationSearchResultsMaxHeight }]}'),
  'Navigate destination search must bound its shell and result scrollers so mobile content stays reachable above keyboard/bottom controls.',
);

assertNavigateOverlayEvidenceXml(
  '.smoke/emulator-fix-final-navigate-reserved-compass.xml',
  'July 6 reserved compass capture',
);
assertNavigateOverlayEvidenceXml(
  '.smoke/emulator-fix-final-directions-expanded.xml',
  'July 6 directions capture',
);

console.log('Mobile overlay bounds checks passed.');
