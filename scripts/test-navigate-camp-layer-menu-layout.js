const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

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
  resolveNavigateRouteOverlayToggle,
  resolveCampLayerMenuLayout,
  resolveCampLayerMenuToggles,
  userCanSeeCommunityCampLayerTools,
} = loadTsModule('lib/navigation/campLayerMenuPresentation.ts');

assert.deepStrictEqual(
  resolveNavigateRouteOverlayToggle(
    { mvumEnabled: false, routeGeometryEnabled: false },
    'mvum',
  ),
  { mvumEnabled: true, routeGeometryEnabled: false },
  'Selecting MVUM should enable only the MVUM route-building overlay.',
);
assert.deepStrictEqual(
  resolveNavigateRouteOverlayToggle(
    { mvumEnabled: true, routeGeometryEnabled: false },
    'route_geometry',
  ),
  { mvumEnabled: false, routeGeometryEnabled: true },
  'Selecting ECS Route Geometry should atomically supersede MVUM.',
);
assert.deepStrictEqual(
  resolveNavigateRouteOverlayToggle(
    { mvumEnabled: false, routeGeometryEnabled: true },
    'mvum',
  ),
  { mvumEnabled: true, routeGeometryEnabled: false },
  'Selecting MVUM should atomically supersede ECS Route Geometry.',
);
assert.deepStrictEqual(
  resolveNavigateRouteOverlayToggle(
    { mvumEnabled: true, routeGeometryEnabled: false },
    'mvum',
  ),
  { mvumEnabled: false, routeGeometryEnabled: false },
  'Selecting the active route overlay should turn it off without enabling its peer.',
);

const nonAdminToggles = resolveCampLayerMenuToggles({
  communityCampsitesEnabled: true,
  campsiteCommunityReviewEnabled: true,
  operatorInfo: { is_admin: false, role: 'user' },
});

assert.deepStrictEqual(
  nonAdminToggles.map((toggle) => toggle.key),
  [],
  'Normal users should not see community/private/group/pending/reviewer campsite tooling in the map camp-layer menu.',
);
assert.strictEqual(
  userCanSeeCommunityCampLayerTools({ is_admin: false, role: 'user' }),
  false,
  'Normal operator profiles should not unlock community campsite tooling.',
);

const adminToggles = resolveCampLayerMenuToggles({
  communityCampsitesEnabled: true,
  campsiteCommunityReviewEnabled: true,
  operatorInfo: { is_admin: true, role: 'super_admin' },
});

assert.deepStrictEqual(
  adminToggles.map((toggle) => toggle.key),
  ['community', 'private', 'group', 'pending', 'reviewer_pending'],
  'Admin operators should retain the full community campsite tooling set.',
);
assert.strictEqual(
  userCanSeeCommunityCampLayerTools({ is_admin: true, role: 'super_admin' }),
  true,
  'Admin operator profiles should unlock community campsite tooling.',
);

const compactLayout = resolveCampLayerMenuLayout({
  mapHeight: 520,
  topInset: 0,
  bottomOffset: 118,
  overlayEdge: 12,
  triggerSize: 40,
});

assert(compactLayout.maxHeight > 0, 'Camp layer menu should always compute a positive max height.');
assert(
  compactLayout.maxHeight <= 520 - 118 - 12,
  'Camp layer menu max height should fit between the map top and the bottom-right tool rail.',
);
assert.strictEqual(compactLayout.width, 276);
assert.strictEqual(compactLayout.maxWidth, 520 - 24);

const navigateSource = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');
assert(
  !navigateSource.includes('resolveCampLayerMenuLayout') &&
    navigateSource.includes('resolveCampLayerMenuToggles'),
  'Navigate should use the shared camp-layer visibility resolver while popup sizing is owned by the map-body popup shell.',
);
assert(
  navigateSource.includes('operatorInfo') &&
    navigateSource.includes('canUseCommunityCampsiteLayers'),
  'Navigate should gate community campsite layer tooling with operator role state.',
);
assert(
  navigateSource.includes('<ScrollView') &&
    navigateSource.includes('styles.campLayerMenuScroll') &&
    navigateSource.includes('styles.campLayerMenuScrollContent'),
  'Camp layer menu content should scroll inside a bounded panel instead of falling off the map body.',
);
const campLayerPopupTitle = navigateSource.indexOf("'MAP LAYERS'");
const campLayerPopupStart = navigateSource.lastIndexOf('renderMapPopup(', campLayerPopupTitle);
const campLayerPopupEnd = navigateSource.indexOf('<CompassRose', campLayerPopupStart);
assert(
  campLayerPopupStart >= 0 && campLayerPopupEnd > campLayerPopupStart,
  'Navigate should render a dedicated Map Layers popup inside the map surface before the compass overlay.',
);
const campLayerPopupSource = navigateSource.slice(campLayerPopupStart, campLayerPopupEnd);
assert(
  navigateSource.includes('const campLayerMenuContent = campLayerMenuOpen ? (') &&
    campLayerPopupSource.includes('campLayerMenuOpen,') &&
    campLayerPopupSource.includes('styles.campLayerMenuPopupContent') &&
    campLayerPopupSource.includes('CAMP_LAYER_POPUP_WIDTH') &&
    campLayerPopupSource.includes("{ placement: 'center', backdropTint: 'transparent', fullBody: false, layerId: 'campLayers' }"),
  'Camp layer menu should render as a larger centered map-body popup instead of expanding from the right-side rail trigger.',
);
[
  'MVUM Trail Segments',
  'ECS Route Geometry',
  'Remoteness',
  'Established Campgrounds',
  'Dispersed Camping Eligibility',
].forEach((label) => {
  assert(
    navigateSource.includes(label),
    `The consolidated Map Layers popup should expose ${label}.`,
  );
});
const floatingRailStart = navigateSource.indexOf('{floatingToolsVisible ? (');
const floatingRailEnd = navigateSource.indexOf('{campsiteDrawControlsVisible ? (', floatingRailStart);
const floatingRailSource = navigateSource.slice(floatingRailStart, floatingRailEnd);
const mapLayersTriggerIndex = floatingRailSource.indexOf('testID="navigate-map-layer-menu-toggle"');
const toolsTriggerIndex = floatingRailSource.indexOf('testID="navigate-tools-menu-toggle"');
assert(
  mapLayersTriggerIndex >= 0 && toolsTriggerIndex > mapLayersTriggerIndex,
  'The single Map Layers trigger should be mounted immediately above the Tools trigger.',
);
assert(
  !floatingRailSource.includes('onPress={toggleMvumOverlay}') &&
    !floatingRailSource.includes('onPress={toggleRouteGeometryOverlay}') &&
    !floatingRailSource.includes('onPress={toggleRemotenessOverlay}'),
  'MVUM, ECS Route Geometry, and Remoteness should live inside the consolidated menu, not as duplicate rail buttons.',
);
assert(
  navigateSource.includes("resolveNavigateRouteOverlayToggle(") &&
    navigateSource.includes("'exclusive_overlay_switch'"),
  'Navigate should use the tested exclusive route-overlay transition and cancel superseded work.',
);
assert(
  !/dispersedCampingToggleTitle\} numberOfLines=\{[12]\}/.test(navigateSource) &&
    !/dispersedCampingToggleSubtitle\} numberOfLines=\{[12]\}/.test(navigateSource),
  'Camp layer menu title and subtitle text should wrap instead of truncating with ellipses.',
);
assert(
  !/campLayerDiagnosticText\} numberOfLines=\{[12]\}/.test(navigateSource),
  'Camp layer diagnostics should wrap inside the menu instead of truncating with ellipses.',
);

console.log('[navigate-camp-layer-menu-layout] camp layer menu layout and visibility checks passed');
