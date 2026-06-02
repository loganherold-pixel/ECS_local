const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    const easing = () => 0;
    return {
      Easing: {
        bezier: () => easing,
        out: () => easing,
        in: () => easing,
        cubic: easing,
        quad: easing,
        exp: easing,
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const root = process.cwd();
const loginLogoPath = path.join(root, 'assets', 'images', 'Expedition Command System Logo.png');
const loginSource = fs.readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
const authInfoSource = fs.readFileSync(path.join(root, 'app', 'auth-info.tsx'), 'utf8');
const loginHeroSource = fs.readFileSync(path.join(root, 'components', 'login', 'LoginHeroBackground.tsx'), 'utf8');
const loginLayoutSource = fs.readFileSync(path.join(root, 'lib', 'auth', 'loginScreenLayout.ts'), 'utf8');
const {
  LOGIN_LOGO_ASPECT_RATIO,
  LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO,
  resolveLoginScreenLayout,
} = require(path.join(root, 'lib', 'auth', 'loginScreenLayout.ts'));

function readPngDimensions(filePath) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.subarray(0, 8).equals(signature), 'Login logo should be a PNG asset.');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const loginLogoDimensions = readPngDimensions(loginLogoPath);
const loginLogoActualAspectRatio = loginLogoDimensions.width / loginLogoDimensions.height;
const headerIndex = loginSource.indexOf('<LoginHeaderBlock');
const formIndex = loginSource.indexOf('<View style={[styles.formColumn');
const statusIndex = loginSource.indexOf('<LoginConnectionStatus');
const loginCardIndex = loginSource.indexOf('<LoginCard');
const forgotCardIndex = loginSource.indexOf('<ForgotPasswordCard');

assert.ok(
    loginSource.includes('headerHeight={loginHeaderHeight}') &&
    loginSource.includes('logoWidth={loginLogoWidth}') &&
    loginSource.includes('logoHeight={loginLogoHeight}') &&
    loginSource.includes('frameWidth={isLandscape') &&
    loginSource.includes('headerHeight: number') &&
    loginSource.includes('logoWidth: number') &&
    loginSource.includes('logoHeight: number') &&
    loginSource.includes('heroGlobalTint') &&
    loginSource.includes('resolveLoginScreenLayout') &&
    loginSource.includes("layoutMode === 'landscape_split'") &&
    loginSource.includes('contentShellLandscape') &&
    loginSource.includes('formColumn') &&
    loginSource.includes('LoginConnectionStatus') &&
    loginSource.includes('formStatusSlot') &&
    loginSource.includes('formStatusSlotLandscape') &&
    loginSource.includes('cardMaxHeight') &&
    loginSource.includes('cardScrollEnabled') &&
    loginSource.includes('cardScrollContent') &&
    loginSource.includes('const { width, height } = useWindowDimensions();') &&
    loginSource.includes('authViewportHeight') &&
    loginSource.includes('aspectRatio: LOGIN_LOGO_ASPECT_RATIO') &&
    loginSource.includes('style={[styles.logoImage, { width: logoWidth, height: logoHeight }]}') &&
    loginSource.includes('minHeight: LOGIN_STATUS_INDICATOR_HEIGHT') &&
    loginSource.includes('cardCompactLandscape') &&
    loginSource.includes('inputShellCompactLandscape') &&
    loginSource.includes('primaryButtonCompactLandscape') &&
    loginSource.includes('<ScrollView') &&
    loginSource.includes('screenTopContentLandscape') &&
    loginSource.includes("justifyContent: 'center'") &&
    !loginSource.includes("Dimensions.get('screen')") &&
    !loginSource.includes('scale: 1.78'),
  'Login logo/status/card should use live orientation sizing, stay fixed without overlap in portrait, and switch to a constrained split layout in landscape.',
);

assert.ok(
  headerIndex >= 0 &&
    formIndex > headerIndex &&
    statusIndex > formIndex &&
    loginCardIndex > statusIndex &&
    forgotCardIndex > statusIndex,
  'Login online/offline status should be rendered in the form stack above the auth card, not under the logo rail.',
);

assert.ok(
  loginLayoutSource.includes('LOGIN_LOGO_WIDTH_RATIO = 0.72') &&
    loginLayoutSource.includes('LOGIN_LOGO_MAX_WIDTH = 260') &&
    loginLayoutSource.includes('LOGIN_LOGO_LANDSCAPE_SCALE = 1.2') &&
    loginLayoutSource.includes('LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO = 0.336') &&
    loginLayoutSource.includes('LOGIN_LOGO_LANDSCAPE_MAX_WIDTH') &&
    loginLayoutSource.includes('LOGIN_LOGO_COMPACT_PORTRAIT_HEIGHT_RATIO = 0.22') &&
    loginLayoutSource.includes('LOGIN_STATUS_INDICATOR_HEIGHT = 24') &&
    loginLayoutSource.includes('LOGIN_STATUS_SLOT_HEIGHT') &&
    loginLayoutSource.includes('statusSlotHeight: number') &&
    loginLayoutSource.includes('logoHeight: number') &&
    loginLayoutSource.includes("layoutMode: 'landscape_split'") &&
    loginLayoutSource.includes('authViewportHeight * LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO') &&
    loginLayoutSource.includes('authViewportHeight - LOGIN_STATUS_SLOT_HEIGHT') &&
    loginLayoutSource.includes('cardScrollEnabled: authViewportHeight < 520') &&
    loginLayoutSource.includes('minimumBrandRailWidth'),
  'Login responsive layout helper should own the shared sizing constants and landscape clipping guard.',
);

assert.ok(
  Math.abs(LOGIN_LOGO_ASPECT_RATIO - loginLogoActualAspectRatio) < 0.001,
  `Login logo layout aspect ratio should match the PNG asset (${loginLogoDimensions.width}x${loginLogoDimensions.height}).`,
);

const portrait = resolveLoginScreenLayout({ width: 390, height: 844, safeAreaTop: 47, safeAreaBottom: 34 });
assert.equal(portrait.layoutMode, 'portrait_stack');
assert.ok(portrait.headerHeight > portrait.logoWidth / LOGIN_LOGO_ASPECT_RATIO);
assert.equal(portrait.statusSlotHeight, 32);
assert.ok(portrait.formMaxHeight == null);

const landscape = resolveLoginScreenLayout({ width: 844, height: 390, safeAreaTop: 0, safeAreaBottom: 0 });
assert.equal(landscape.layoutMode, 'landscape_split');
assert.equal(landscape.compactLayout, true);
assert.ok(landscape.headerHeight <= landscape.authViewportHeight);
assert.ok(landscape.formMaxHeight <= landscape.authViewportHeight);
assert.ok(landscape.formMaxHeight <= landscape.authViewportHeight - landscape.statusSlotHeight);
assert.ok(landscape.contentMaxWidth <= 844 - landscape.layoutMetrics.horizontalPadding * 2);
assert.ok(landscape.logoWidth <= landscape.contentMaxWidth - landscape.formWidth - landscape.contentGap);
assert.ok(
  landscape.logoWidth / LOGIN_LOGO_ASPECT_RATIO <= landscape.authViewportHeight * LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO,
  'Landscape logo height should respect the vertical clipping guard.',
);

const shortLandscape = resolveLoginScreenLayout({ width: 568, height: 320, safeAreaTop: 0, safeAreaBottom: 0 });
assert.equal(shortLandscape.layoutMode, 'landscape_split');
assert.equal(shortLandscape.cardScrollEnabled, true);
assert.ok(shortLandscape.formMaxHeight <= shortLandscape.authViewportHeight);
assert.ok(shortLandscape.formMaxHeight <= shortLandscape.authViewportHeight - shortLandscape.statusSlotHeight);
assert.ok(shortLandscape.contentMaxWidth <= 568 - shortLandscape.layoutMetrics.horizontalPadding * 2);

const narrowLandscape = resolveLoginScreenLayout({ width: 430, height: 300, safeAreaTop: 0, safeAreaBottom: 0 });
assert.equal(narrowLandscape.layoutMode, 'landscape_split');
assert.ok(narrowLandscape.formWidth >= 220);
assert.ok(narrowLandscape.contentMaxWidth <= 430 - narrowLandscape.layoutMetrics.horizontalPadding * 2);

assert.ok(
  loginHeroSource.includes('<View pointerEvents="none" style={styles.screenTint} />') &&
    loginHeroSource.includes('screenTint: {') &&
    loginHeroSource.includes('...StyleSheet.absoluteFillObject') &&
    !loginHeroSource.includes('bottomGradient') &&
    !loginHeroSource.includes("height: '36%'"),
  'Login video tint should cover the full screen behind the login content instead of only darkening the bottom third.',
);

assert.ok(
  authInfoSource.includes("import ECSShellTexture from '../components/ECSShellTexture';") &&
    authInfoSource.includes('<ECSShellTexture />') &&
    authInfoSource.includes('maxHeight: sheetMaxHeight') &&
    authInfoSource.includes('maxHeight: bodyMaxHeight') &&
    authInfoSource.includes('flexGrow: 0'),
  'Auth info sheets should use the ECS popup texture and content-capped scroll sizing.',
);

assert.ok(
  authInfoSource.includes('sheetMaxWidth') &&
    authInfoSource.includes('logoHeight = sheetMaxWidth / LOGIN_LOGO_ASPECT_RATIO') &&
    authInfoSource.includes('style={[styles.logo, { maxWidth: sheetMaxWidth }]}') &&
    authInfoSource.includes('aspectRatio: LOGIN_LOGO_ASPECT_RATIO'),
  'Auth info logo should expand to the legal/support container width without distortion.',
);

console.log('login visual polish checks passed.');
