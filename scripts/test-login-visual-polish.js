const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const loginSource = fs.readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
const authInfoSource = fs.readFileSync(path.join(root, 'app', 'auth-info.tsx'), 'utf8');
const loginHeroSource = fs.readFileSync(path.join(root, 'components', 'login', 'LoginHeroBackground.tsx'), 'utf8');

assert.ok(
    loginSource.includes('headerHeight={loginHeaderHeight}') &&
    loginSource.includes('logoWidth={loginLogoWidth}') &&
    loginSource.includes('headerHeight: number') &&
    loginSource.includes('logoWidth: number') &&
    loginSource.includes('heroGlobalTint') &&
    loginSource.includes('LOGIN_LOGO_WIDTH_RATIO = 0.72') &&
    loginSource.includes('LOGIN_LOGO_MAX_WIDTH = 260') &&
    loginSource.includes('LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO = 0.16') &&
    loginSource.includes('LOGIN_LOGO_COMPACT_PORTRAIT_HEIGHT_RATIO = 0.22') &&
    loginSource.includes('LOGIN_STATUS_INDICATOR_HEIGHT = 24') &&
    loginSource.includes('authFormInnerWidth') &&
    loginSource.includes('landscapeFormWidth') &&
    loginSource.includes('const { width, height } = useWindowDimensions();') &&
    loginSource.includes('resolveAuthLayoutMetrics(width, height)') &&
    loginSource.includes('authViewportHeight') &&
    loginSource.includes('logoHeightBudget') &&
    loginSource.includes('LOGIN_LOGO_ASPECT_RATIO = 1536 / 1024') &&
    loginSource.includes('aspectRatio: LOGIN_LOGO_ASPECT_RATIO') &&
    loginSource.includes('style={[styles.logoImage, { width: logoWidth }]}') &&
    loginSource.includes("position: 'absolute'") &&
    loginSource.includes("bottom: 3") &&
    loginSource.includes('cardCompactLandscape') &&
    loginSource.includes('inputShellCompactLandscape') &&
    loginSource.includes('primaryButtonCompactLandscape') &&
    loginSource.includes('<ScrollView') &&
    loginSource.includes('contentContainerStyle={[styles.screenTopContent, { minHeight: authViewportHeight }]}') &&
    loginSource.includes("justifyContent: 'center'") &&
    loginSource.includes('cardTopTarget = height * 0.5') &&
    !loginSource.includes("Dimensions.get('screen')") &&
    !loginSource.includes('scale: 1.78'),
  'Login logo should use live orientation sizing, stay inside the auth form width without distortion, center between the top and card in portrait, and remain scroll-safe in landscape.',
);

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
