const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cadLog = fs.readFileSync(path.join(root, 'components', 'dashboard', 'MissionBriefCadLog.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  cadLog,
  "entry.source === 'ecs-remote-weather'",
  'Mission Brief CAD log should detect remote/weather events by source.',
);
assertIncludes(
  cadLog,
  'function getRemoteWeatherSeverityAccent',
  'Remote/weather rows should resolve a severity accent.',
);
assertIncludes(cadLog, "case 'info':", 'Info severity should be handled.');
assertIncludes(cadLog, "case 'watch':", 'Watch severity should be handled.');
assertIncludes(cadLog, "case 'warning':", 'Warning severity should be handled.');
assertIncludes(cadLog, "case 'critical':", 'Critical severity should be handled.');
assertIncludes(cadLog, 'return TACTICAL.amber;', 'Watch severity should use tactical gold accent.');
assertIncludes(cadLog, 'return ECS.warning;', 'Warning severity should use amber warning accent.');
assertIncludes(cadLog, 'return TACTICAL.danger;', 'Critical severity should use red danger accent.');
assertIncludes(cadLog, 'styles.remoteWeatherHeaderRow', 'Remote/weather rows should render a CAD-style header row.');
assertIncludes(cadLog, 'styles.remoteWeatherSeverityText', 'Remote/weather rows should show a severity label.');
assertIncludes(cadLog, 'styles.remoteWeatherTitleText', 'Remote/weather rows should show a title.');
assertIncludes(cadLog, 'Action: ', 'Remote/weather recommended action should be explicitly labeled.');
assertIncludes(cadLog, 'isRemoteWeather && styles.remoteWeatherRow', 'Remote/weather rows should get source-specific row treatment.');
assertIncludes(cadLog, 'borderLeftWidth: 3', 'Remote/weather rows should have a clear severity rail.');

assertIncludes(
  dashboard,
  '<CommandBriefScreen embedded />',
  'ECS Brief should render the Command Brief surface without the obsolete visual activity log.',
);
assertIncludes(
  dashboard,
  "import { CommandBriefScreen } from '../../components/brief';",
  'Dashboard ECS Brief should mount through the reusable Command Brief component.',
);
assertNotIncludes(cadLog, 'RemoteWeatherPanel', 'Remote/weather alerts should not create a separate panel.');
assertNotIncludes(cadLog, 'floating', 'Remote/weather alerts should not create floating UI.');
assertNotIncludes(cadLog, 'topBanner', 'Remote/weather alerts should not create a top banner.');
assertNotIncludes(cadLog, 'Alert.alert', 'Remote/weather alerts should not create native alert popups.');
assertIncludes(
  packageSource,
  '"test:ecs-brief-remote-weather-rendering": "node ./scripts/test-ecs-brief-remote-weather-rendering.js"',
  'package.json should expose the ECS Brief remote/weather rendering regression test.',
);

console.log('ECS Brief remote/weather rendering checks passed.');
