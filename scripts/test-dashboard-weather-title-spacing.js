const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

assert(
  source.includes("isWeatherPanel ? 'Weather'") &&
    source.includes('isWeatherPanel && attitudeCommandS.commandPanelHeaderInlineIcon') &&
    source.includes('isWeatherPanel && attitudeCommandS.commandPanelHeaderTitleInlineIcon'),
  'Weather widget should render the compact one-word title with an inline icon.',
);

assert(
  source.includes("commandPanelHeaderInlineIcon: {\n    justifyContent: 'center',\n    gap: 2,") &&
    source.includes('commandPanelHeaderTitleInlineIcon: {\n    flex: 0,\n    flexShrink: 1,\n    minWidth: 44,') &&
    !source.includes('commandPanelHeaderTitleInlineIcon: {\n    flex: 0,\n    flexShrink: 1,\n    minWidth: 74,'),
  'Weather widget title spacing should keep the icon close to the word Weather and avoid a wide invisible title box.',
);

console.log('Dashboard weather title spacing checks passed.');
