const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const commandDock = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8').replace(/\r\n/g, '\n');
const globalBanner = fs.readFileSync(path.join(root, 'components', 'ECSGlobalBanner.tsx'), 'utf8').replace(/\r\n/g, '\n');
const shellLayout = fs.readFileSync(path.join(root, 'lib', 'shellLayout.ts'), 'utf8').replace(/\r\n/g, '\n');
const appLayout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8').replace(/\r\n/g, '\n');

assert(
  commandDock.includes('const SHIELD_ICON_SIZE = 70;'),
  'CommandDock center ECS dashboard icon should be slightly smaller than the dock bar so it sits inside the banner.',
);

assert(
  commandDock.includes('const centerDashboardButtonDrop = Math.round((dockBottomPadding + BOTTOM_BANNER_BACKGROUND_DROP_OFFSET) / 2);'),
  'CommandDock center ECS dashboard button should sit midway between the bottom banner top rail and the device bottom.',
);

assert(
  commandDock.includes('verticalDrop={centerDashboardButtonDrop}'),
  'CommandDock center ECS dashboard button should receive the safe-area-aware vertical drop.',
);

assert(
  commandDock.includes('styles.shieldPressable') &&
    !commandDock.includes('{ translateY: -1 }, { scale: scaleAnim }'),
  'CommandDock center ECS dashboard icon should be vertically centered without a negative pressable offset.',
);

assert(
  commandDock.includes('shieldLabelSpacer: {\n    height: 0,'),
  'CommandDock center ECS dashboard icon should not reserve a label spacer that pushes the icon out of center.',
);

assert(
  globalBanner.includes('ECS_ANDROID_BOTTOM_SAFE_PADDING_MAX = 96') &&
    globalBanner.includes('Math.min(normalizedInset, ECS_ANDROID_BOTTOM_SAFE_PADDING_MAX)') &&
    !globalBanner.includes('Math.min(bottomInset, 10)'),
  'Android bottom banner safe padding must honor tablet taskbar/nav insets instead of clamping them to 10px.',
);

assert(
  shellLayout.includes('ECS_ANDROID_COMMAND_DOCK_BOTTOM_PADDING_MAX = 96') &&
    shellLayout.includes('Math.min(normalizedBottomInset, ECS_ANDROID_COMMAND_DOCK_BOTTOM_PADDING_MAX)') &&
    !shellLayout.includes('Math.min(normalizedBottomInset, 8)'),
  'CommandDock body clearance must reserve the real Android taskbar/nav inset so dock targets stay tappable.',
);

assert(
  shellLayout.includes('ECS_ANDROID_TABLET_TASKBAR_DOCK_LIFT = 72') &&
    shellLayout.includes('getCommandDockBottomLift(bottomInset: number, isTablet: boolean)') &&
    shellLayout.includes('ECS_ANDROID_TABLET_TASKBAR_DOCK_LIFT - normalizedBottomInset') &&
    shellLayout.includes('getCommandDockTotalClearance(bottomInset: number, isTablet: boolean)'),
  'Android tablet CommandDock layout must add a taskbar lift when safe-area insets underreport the bottom gesture region.',
);

assert(
  commandDock.includes('getCommandDockBottomLift') &&
    commandDock.includes("Platform.OS === 'android' && Math.min(windowWidth, adaptive.windowHeight) >= 720") &&
    commandDock.includes('const dockBottomLift = getCommandDockBottomLift(insets.bottom, adaptive.isTablet || androidTabletWindow);') &&
    commandDock.includes('bottom: MIN_DOCK_LIFT + dockBottomLift'),
  'CommandDock must lift above Android tablet taskbar space so bottom tabs receive normal taps.',
);

assert(
  appLayout.includes('getCommandDockTotalClearance') &&
    appLayout.includes("Platform.OS === 'android' && Math.min(width, height) >= 720") &&
    appLayout.includes('getCommandDockTotalClearance(insets.bottom, commandDockTabletScale)') &&
    !appLayout.includes('getCommandDockHeight(insets.bottom)'),
  'Root shell body clearance must include the Android tablet CommandDock lift.',
);

console.log('Command dock center icon layout checks passed.');
