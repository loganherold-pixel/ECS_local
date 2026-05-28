const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const topBannerBackground = fs
  .readFileSync(path.join(root, 'components', 'TopBannerBackground.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const header = fs
  .readFileSync(path.join(root, 'components', 'Header.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const dashboardHeader = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'DashboardHeader.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const bluetoothNavigation = fs
  .readFileSync(path.join(root, 'lib', 'bluetoothCommandNavigation.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const shellLayout = fs
  .readFileSync(path.join(root, 'lib', 'shellLayout.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const bottomNav = fs
  .readFileSync(path.join(root, 'components', 'ecs', 'ECSBottomNav.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const commandDock = fs
  .readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const chromeAssets = fs
  .readFileSync(path.join(root, 'lib', 'chromeAssets.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const globalBanner = fs
  .readFileSync(path.join(root, 'components', 'ECSGlobalBanner.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const tabsLayout = fs
  .readFileSync(path.join(root, 'app', '(tabs)', '_layout.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

const topBannerAssets = [
  'Expedition-Command_Banner.png',
  'Fleet_Banner.png',
  'Navigate_Banner.png',
  'Explore_Banner.png',
  'Dispatch_Banner.png',
];
const namedTopBannerAssets = topBannerAssets.filter((assetName) => assetName !== 'Expedition-Command_Banner.png');
const bottomBannerAsset = 'ECS_Bottom_Banner.png';
const viewportCases = [
  { label: 'phone portrait', width: 390, height: 844 },
  { label: 'phone landscape', width: 844, height: 390 },
  { label: 'tablet portrait', width: 834, height: 1194 },
  { label: 'tablet landscape', width: 1194, height: 834 },
];

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertConnectionControls(source, label) {
  const leftSlotIndex = source.indexOf('styles.edgeSlotStart');
  const connectionIndex = source.indexOf('styles.connectionWordmark', leftSlotIndex);
  const rightClusterIndex = source.indexOf('<View style={styles.rightControlCluster}>');
  const bluetoothIndex = source.indexOf('accessibilityHint="Opens device connections and Bluetooth controls"', rightClusterIndex);
  const themeToggleIndex = source.indexOf('<ThemeToggle', rightClusterIndex);

  assert.ok(leftSlotIndex >= 0, `${label} should render a left-side control slot.`);
  assert.ok(connectionIndex > leftSlotIndex, `${label} should seat the online/offline wordmark in the left slot.`);
  assert.ok(rightClusterIndex >= 0, `${label} should render a right-side control cluster.`);
  assert.ok(bluetoothIndex > rightClusterIndex, `${label} should seat Bluetooth in the right control cluster.`);
  assert.ok(
    themeToggleIndex > bluetoothIndex,
    `${label} should place Bluetooth adjacent to the eye/profile control group.`,
  );
}

function readPngSize(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function assertThreeToOneBanner(relativePath) {
  const size = readPngSize(relativePath);
  assert.strictEqual(
    Number((size.width / size.height).toFixed(3)),
    3,
    `${relativePath} should remain a 3:1 panoramic banner asset.`,
  );
}

function assertWideBottomBanner(relativePath) {
  const size = readPngSize(relativePath);
  assert.ok(
    size.width / size.height >= 3,
    `${relativePath} should remain a wide bottom-dock banner asset.`,
  );
}

topBannerAssets.forEach((assetName) => {
  assertIncludes(
    topBannerBackground,
    assetName,
    `${assetName} should be registered as a production top-banner asset.`,
  );
  assertThreeToOneBanner(path.join('assets', 'chrome', 'banners', assetName));
});
assertWideBottomBanner(path.join('assets', 'chrome', 'banners', bottomBannerAsset));

viewportCases.forEach(({ label }) => {
  assertIncludes(
    globalBanner,
    "resizeMode ?? (placement === 'top' ? 'contain' : 'cover')",
    `Expedition Command banner should use contain on ${label} so title and motto render fully.`,
  );
});

namedTopBannerAssets.forEach((assetName) => {
  assertIncludes(
    topBannerBackground,
    assetName,
    `${assetName} should display its centered title through the contain-based top banner plate.`,
  );
});

assertIncludes(
  topBannerBackground,
  'export function resolveTopBannerVariant',
  'Top banner background should expose a title-to-banner resolver.',
);
assertIncludes(
  topBannerBackground,
  "normalized.includes('fleet')",
  'Fleet titles should resolve to the Fleet banner.',
);
assertIncludes(
  topBannerBackground,
  "normalized.includes('navigation')",
  'Navigation titles should resolve to the Navigate banner.',
);
assertIncludes(
  topBannerBackground,
  "normalized.includes('discover')",
  'Discover/Explore titles should resolve to the Explore banner.',
);
assertIncludes(
  topBannerBackground,
  "normalized.includes('dispatch')",
  'Dispatch titles should resolve to the Dispatch banner.',
);
assertIncludes(
  globalBanner,
  "resizeMode ?? (placement === 'top' ? 'contain' : 'cover')",
  'Top title banners should use contain while the bottom banner may use cover.',
);
assertIncludes(
  globalBanner,
  "ECS_BANNER_DARK_BACKGROUND = '#020304'",
  'Shared banner plate should provide a dark fallback background behind image assets.',
);
assertIncludes(
  globalBanner,
  "ECS_BANNER_LIGHT_BACKGROUND = '#F7F1E8'",
  'Shared banner plate should provide a light fallback background behind image assets.',
);
assertIncludes(
  globalBanner,
  'backgroundColor: bannerBackground',
  'Every banner plate should have theme-aware backing so the app body cannot bleed through at edges.',
);
assertIncludes(
  globalBanner,
  'resolveEcsPopupSurfaceTheme(effectiveTheme)',
  'Every banner plate should resolve dark, light, and driving surface backing from the shared theme.',
);
assertIncludes(
  globalBanner,
  'export function resolveEcsTopBannerHeight',
  'Top banner height should be resolved through a shared responsive clamp.',
);
assertIncludes(
  globalBanner,
  'export function resolveEcsBottomBannerHeight',
  'Bottom banner height should be resolved through a shared responsive clamp.',
);
assertIncludes(
  globalBanner,
  'overflow: \'hidden\'',
  'Banner plates should clip their own image surface instead of exposing body bleed-through.',
);
assertIncludes(
  globalBanner,
  'ECS_GLOBAL_BANNER_ASPECT_RATIO = 3',
  'Shared banner math should preserve the 3:1 banner asset ratio.',
);
assertIncludes(
  globalBanner,
  'const maxHeight = isTablet ? (isLandscape ? 148 : 158) : isLandscape ? 112 : 136',
  'Tablet landscape should be height-clamped so the top banner neither balloons nor collapses too short.',
);
assertNotIncludes(
  topBannerBackground,
  'resizeMode="cover"',
  'Top title banners should not use cover because it can crop title/motto content.',
);

assertIncludes(
  header,
  'resolveTopBannerVariant(titleText)',
  'Shared headers should choose the banner from the current screen title.',
);
assertIncludes(
  header,
  'variant={topBannerVariant}',
  'Shared headers should pass the resolved top-banner variant.',
);
assertIncludes(
  header,
  'useEcsTopBannerHeight()',
  'Shared headers should size top banner shells from the shared banner clamp.',
);
assertIncludes(
  shellLayout,
  'export function getEcsTopBannerLayoutMetrics',
  'Top tab banners should share the Dashboard compact banner layout metrics.',
);
assertIncludes(
  header,
  'getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight',
  'Shared tab headers should use the same compact top banner layout metrics as Dashboard.',
);
assertIncludes(
  dashboardHeader,
  'getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight',
  'Dashboard should also use the shared compact top banner layout metrics.',
);
assertIncludes(
  header,
  'Math.max(adaptive.shell.headerMinHeight, topBannerHeight)',
  'Shared headers should preserve a predictable top banner height across devices.',
);
assertIncludes(
  header,
  "case 'fleet':\n      return 'Fleet';",
  'Fleet tab should render Fleet as centered native banner text.',
);
assertIncludes(
  header,
  "case 'navigate':\n      return 'Navigate';",
  'Navigate tab should render Navigate as centered native banner text.',
);
assertIncludes(
  header,
  "case 'explore':\n      return 'Explore';",
  'Explore tab should render Explore as centered native banner text.',
);
assertIncludes(
  header,
  "case 'dispatch':\n      return 'Dispatch';",
  'Dispatch tab should render Dispatch as centered native banner text.',
);
assertIncludes(
  header,
  'styles.bannerTitle',
  'Shared tab headers should render centered native subject text over the banner.',
);
assertIncludes(
  header,
  "android: 'sans-serif-condensed'",
  'Shared tab banner titles should use a polished condensed system title font.',
);
assertIncludes(
  header,
  'letterSpacing: 0',
  'Shared tab banner titles should avoid loose tracking so the titles read as deliberate headings.',
);
assertIncludes(
  header,
  "resizeMode={useBannerTitleLayout ? 'cover' : undefined}",
  'Shared tab headers should use the Dashboard edge-to-edge cover treatment for the five main tab banners.',
);
assertNotIncludes(
  header,
  '<TabHeaderTitleImage',
  'Shared headers should not render duplicate title text over image banners.',
);
assertNotIncludes(
  header,
  '<View style={[styles.barBottomEdge',
  'Shared headers should not render the old bottom edge over image banners.',
);
assertIncludes(
  header,
  'style={[styles.goldRailLine, { backgroundColor: shellChrome.goldRail }]}',
  'Shared headers should render the global gold separator rail under image banners.',
);
assertConnectionControls(header, 'Shared tab headers');
assertIncludes(
  shellLayout,
  'ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH = 144',
  'Top banner left title slot should mirror the right slot so tab titles stay centered.',
);
assertIncludes(
  shellLayout,
  'ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH = 144',
  'Top banner right title slot should mirror the left slot so tab titles stay centered.',
);
assertIncludes(
  header,
  'width: 30,\n    height: 30,\n    minHeight: 30',
  'Bluetooth should use the same 30px square footprint as the eye/profile controls.',
);
assertIncludes(
  dashboardHeader,
  'width: 30,\n    height: 30,\n    minHeight: 30',
  'Dashboard Bluetooth should use the same 30px square footprint as the eye/profile controls.',
);
assertIncludes(
  bluetoothNavigation,
  "UNIFIED_BLUETOOTH_COMMAND_ROUTE = '/power/blu'",
  'Bluetooth controls should share the canonical Device Connections route.',
);
assertIncludes(
  header,
  'openUnifiedBluetoothCommand(router',
  'Shared tab header Bluetooth control should use the canonical launcher.',
);
assertIncludes(
  dashboardHeader,
  'openUnifiedBluetoothCommand(router',
  'Dashboard header Bluetooth control should use the canonical launcher.',
);
assertNotIncludes(
  header,
  "router.push('/power')",
  'Shared tab header Bluetooth control should not fall back to the old Power screen.',
);
assertNotIncludes(
  dashboardHeader,
  "router.push('/power')",
  'Dashboard header Bluetooth control should not fall back to the old Power screen.',
);

assertIncludes(
  dashboardHeader,
  'variant="dashboard"',
  'Dashboard should use the Expedition Command banner.',
);
assertIncludes(
  dashboardHeader,
  'useEcsTopBannerHeight()',
  'Dashboard should size top banner shells from the shared banner clamp.',
);
assertIncludes(
  dashboardHeader,
  'dashboardHeaderVisibleHeight',
  'Dashboard should reserve a compact clipped top banner height.',
);
assertIncludes(
  dashboardHeader,
  'resizeMode="cover"',
  'Dashboard should use a cover banner so the background spans edge-to-edge.',
);
assertIncludes(
  dashboardHeader,
  'verticalOffset={dashboardBannerOffset}',
  'Dashboard should move the banner art upward to reclaim body height.',
);
assertIncludes(
  dashboardHeader,
  'expedition command',
  'Dashboard top banner should render the Expedition Command title as native text.',
);
assertIncludes(
  dashboardHeader,
  'explore with confidence',
  'Dashboard top banner should render the centered motto as native text.',
);
assertIncludes(
  dashboardHeader,
  "android: 'sans-serif-condensed'",
  'Dashboard banner title should use the same polished condensed system title font.',
);
assertIncludes(
  dashboardHeader,
  "android: 'sans-serif-medium'",
  'Dashboard motto should use a refined companion system font.',
);
assertIncludes(
  dashboardHeader,
  'adjustsFontSizeToFit',
  'Dashboard banner text should avoid wrapping and clipping on phone widths.',
);
assertNotIncludes(
  dashboardHeader,
  '<TabHeaderTitleImage',
  'Dashboard should not render duplicate image-based Expedition Command title text.',
);
assertNotIncludes(
  dashboardHeader,
  '<View style={[styles.barBottomEdge',
  'Dashboard should not render the old bottom edge over image banners.',
);
assertIncludes(
  dashboardHeader,
  'style={[styles.goldRailLine, { backgroundColor: shellChrome.goldRail }]}',
  'Dashboard should render the global gold separator rail under the Expedition Command banner.',
);
assertConnectionControls(dashboardHeader, 'Dashboard header');
assertNotIncludes(
  dashboardHeader,
  'styles.expeditionGoldUnderline',
  'Dashboard should not render the old animated underline over image banners.',
);

assertIncludes(
  bottomNav,
  'ECS_Bottom_Banner.png',
  'Bottom navigation should use the new ECS bottom banner asset.',
);
assertIncludes(
  bottomNav,
  'ECSGlobalBanner',
  'Legacy bottom navigation should render the banner through the shared image plate.',
);
assertIncludes(
  commandDock,
  'ECSGlobalBanner',
  'Active CommandDock should render the bottom banner through the shared image plate.',
);
assertIncludes(
  commandDock,
  'ECS_COMMAND_DOCK_BAR_HEIGHT + dockBottomPadding',
  'Active CommandDock should size layout from the visible button stack plus safe-area padding.',
);
assertIncludes(
  commandDock,
  'dockBackgroundDrop',
  'Active CommandDock should move the bottom banner background lower behind the button stack.',
);
assertIncludes(
  commandDock,
  'BOTTOM_BANNER_BACKGROUND_DROP_OFFSET = 3',
  'Active CommandDock should drop the bottom banner background by three pixels.',
);
assertIncludes(
  commandDock,
  'const SHIELD_ICON_SIZE = 72',
  'Dashboard center dock button should be roughly 10% smaller than the previous oversized 80px crest.',
);
assertIncludes(
  commandDock,
  'const CENTER_DASHBOARD_BUTTON_DROP = OUTER_DOCK_ITEM_VERTICAL_OFFSET + 9',
  'Dashboard center dock button should sit centered inside the lower banner without riding the top rail.',
);
assertIncludes(
  commandDock,
  'bottom: -(dockBackgroundDrop + dockBackgroundTopOffset)',
  'Active CommandDock should position the banner image lower without changing icon layout.',
);
assertIncludes(
  commandDock,
  'styles.bannerTopRail',
  'Active CommandDock should render a single full-width top rail at the banner edge.',
);
assertNotIncludes(
  commandDock,
  'hardenedTopLine',
  'Active CommandDock should not render the old segmented rail over the dock icons.',
);
assertIncludes(
  commandDock,
  'getEcsBottomSafePadding(insets.bottom)',
  'Active CommandDock should keep safe-area padding separate from the banner image.',
);
assertIncludes(
  chromeAssets,
  'ECS_Bottom_Banner.png',
  'Shared chrome assets should point the active CommandDock at the ECS bottom banner image.',
);
assertNotIncludes(
  commandDock,
  'bottomBannerWash',
  'Dynamic mode should not wash, brighten, or recolor the bottom banner asset.',
);
assertNotIncludes(
  commandDock,
  'tintColor',
  'Dynamic mode should not tint the bottom banner asset.',
);
assertNotIncludes(
  topBannerBackground,
  'tintColor',
  'Dynamic mode should not tint top banner assets.',
);
assertNotIncludes(
  globalBanner,
  'tintColor',
  'Shared banner plate should not tint, invert, or recolor banner images.',
);
assertNotIncludes(
  globalBanner,
  'invert',
  'Shared banner plate should not invert banner images in dynamic or light mode.',
);
assertIncludes(
  globalBanner,
  "resizeMode ?? (placement === 'top' ? 'contain' : 'cover')",
  'Bottom navigation background should fill without side gaps.',
);
assertIncludes(
  bottomNav,
  'useEcsBottomBannerHeight()',
  'Bottom navigation should use a predictable responsive banner height.',
);
assertIncludes(
  bottomNav,
  'getEcsBottomSafePadding(insets.bottom)',
  'Bottom navigation should keep safe-area padding separate from the banner image.',
);
assertIncludes(
  bottomNav,
  "label: 'FLEET'",
  'Bottom tab Fleet label should remain a native UI overlay.',
);
assertIncludes(
  bottomNav,
  "label: 'NAVIGATE'",
  'Bottom tab Navigate label should remain a native UI overlay.',
);
assertIncludes(
  bottomNav,
  "label: 'DISCOVER'",
  'Bottom tab Explore/Discover label should remain a native UI overlay.',
);
assertIncludes(
  bottomNav,
  "label: 'ALERT'",
  'Bottom tab Dispatch/Alert label should remain a native UI overlay.',
);
assertIncludes(
  commandDock,
  '<Text',
  'Active bottom tab labels should remain native UI overlays, not baked into the banner image.',
);
assertIncludes(
  commandDock,
  '<Image',
  'Active bottom tab icons should remain native UI overlays, not baked into the banner image.',
);
assertNotIncludes(
  bottomNav,
  'borderTopWidth',
  'Bottom navigation should not render the old platform border.',
);
assertNotIncludes(
  bottomNav,
  'styles.topLine',
  'Bottom navigation should not render the old top-line ornament.',
);
assertIncludes(
  tabsLayout,
  '<Slot />',
  'Shell route layout should render the active child route directly.',
);
assertIncludes(
  commandDock,
  "label: 'FLEET'",
  'Fleet command dock navigation label should remain Fleet.',
);
assertIncludes(
  commandDock,
  "label: 'NAVIGATE'",
  'Navigate command dock navigation label should remain Navigate.',
);
assertIncludes(
  commandDock,
  "label: 'EXPLORE'",
  'Explore command dock navigation label should remain Explore.',
);
assertIncludes(
  commandDock,
  "label: 'DISPATCH'",
  'Dispatch command dock navigation label should remain Dispatch for the legacy alert route.',
);

console.log('global banner image shell acceptance checks passed');
