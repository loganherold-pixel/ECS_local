const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const commandDock = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');

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

console.log('Command dock center icon layout checks passed.');
