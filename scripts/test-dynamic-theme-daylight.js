const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const themeContext = read('context', 'ThemeContext.tsx');
const appearanceStore = read('lib', 'appearanceStore.ts');
const appearanceModal = read('components', 'AppearanceSettingsModal.tsx');
const profileSettings = read('components', 'ProfileSettingsPanel.tsx');
const themeTokens = read('lib', 'theme.ts');
const modalShell = read('components', 'ECSModalShell.tsx');
const toast = read('components', 'Toast.tsx');
const globalBanner = read('components', 'ECSGlobalBanner.tsx');

assert.ok(
  appearanceStore.includes("private _mode: AppearanceMode = 'dynamic';"),
  'Appearance defaults should start in Dynamic mode.',
);

assert.ok(
  appearanceStore.includes("if (this._mode === 'dynamic') {\n      return 'dark';\n    }"),
  'Dynamic mode should resolve to dark by default outside the live ThemeContext daylight blend.',
);

assert.ok(
  themeContext.includes('const DYNAMIC_DEFAULT_EXPOSURE = 0') &&
    themeContext.includes('resolveDaylightExposureFromLux') &&
    themeContext.includes('LightSensor.setUpdateInterval(DYNAMIC_SENSOR_INTERVAL_MS)'),
  'ThemeContext should drive Dynamic mode from a smoothed ambient-light exposure signal.',
);

assert.ok(
  themeContext.includes('return dynamicDaylightExposure >= DYNAMIC_LIGHT_THEME_THRESHOLD ?') &&
    themeContext.includes('return blendPalette(dynamicDaylightExposure);') &&
    themeContext.includes('return blendColors(dynamicDaylightExposure);'),
  'Dynamic mode should switch effective light/dark status and blend the app-wide palette/colors together.',
);

assert.ok(
  themeContext.includes('setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);') &&
    !themeContext.includes("deviceColorScheme === 'light' ? 'light' : 'dark'"),
  'Dynamic mode should default to dark instead of following the OS color scheme.',
);

assert.ok(
  profileSettings.includes("{ key: 'dynamic', label: 'DYNAMIC'") &&
    appearanceModal.includes('Defaults dark, brightens app-wide in severe daylight'),
  'Command Hub and display settings should still expose Dynamic mode with daylight-oriented copy.',
);

assert.ok(
  themeTokens.includes('ECS_POPUP_SURFACE_LIGHT') &&
    themeTokens.includes('ECS_POPUP_SURFACE_DRIVING') &&
    themeTokens.includes('resolveEcsPopupSurfaceTheme'),
  'Shared theme tokens should expose light/driving popup surfaces for overlays and banners.',
);

assert.ok(
  modalShell.includes('resolveEcsPopupSurfaceTheme(effectiveTheme)') &&
    !modalShell.includes("shellBg: 'rgba(255, 251, 245, 0.97)'"),
  'ECS modal shell should consume the shared popup surface resolver instead of owning one-off light colors.',
);

assert.ok(
  toast.includes('resolveEcsPopupSurfaceTheme(effectiveTheme)') &&
    toast.includes('backgroundColor: surfaceTheme.shellBg') &&
    toast.includes('borderColor: surfaceTheme.shellBorder'),
  'Global toast banners should follow the active popup surface in light mode.',
);

assert.ok(
  globalBanner.includes('ECS_BANNER_LIGHT_BACKGROUND') &&
    globalBanner.includes('resolveEcsPopupSurfaceTheme(effectiveTheme)') &&
    globalBanner.includes('backgroundColor: bannerBackground'),
  'Global top and bottom banner plates should use theme-aware backing surfaces.',
);

console.log('dynamic daylight theme checks passed');
