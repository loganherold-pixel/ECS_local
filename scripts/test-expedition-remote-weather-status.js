const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const selectorSource = fs.readFileSync(path.join(root, 'lib', 'expedition', 'expeditionStatusSelectors.ts'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  selectorSource,
  'export function getHighestActiveRemoteWeatherRisk',
  'Expedition status selectors should expose getHighestActiveRemoteWeatherRisk().',
);
assertIncludes(
  selectorSource,
  "entry.source === 'ecs-remote-weather'",
  'Selector should only read source-tagged ECS remote/weather events.',
);
assertIncludes(
  selectorSource,
  '!Number.isFinite(entry.expiresAt) || Number(entry.expiresAt) > now',
  'Selector should ignore expired remote/weather events.',
);
assertIncludes(
  selectorSource,
  'SEVERITY_RANK',
  'Selector should rank active risks by severity.',
);
assertIncludes(
  selectorSource,
  'return right.timestamp - left.timestamp',
  'Selector should use newest event as tie-breaker for equal severity.',
);
assertIncludes(
  selectorSource,
  'severity: entry.severity ?? \'info\'',
  'Selector should return severity in the requested shape.',
);
assertIncludes(
  selectorSource,
  'recommendedAction: entry.recommendedAction',
  'Selector should return recommendedAction in the requested shape.',
);
assertIncludes(
  selectorSource,
  'formatRemoteWeatherRiskStatusLine',
  'Selector module should format concise Expedition status text.',
);

assertIncludes(
  tabSource,
  'Expedition Hub',
  'Expedition tab should now render the completed-trip Expedition Hub.',
);
assertNotIncludes(
  tabSource,
  'getHighestActiveRemoteWeatherRisk',
  'Expedition Hub should not consume active guidance remote/weather selector state.',
);
assertNotIncludes(
  tabSource,
  'subscribeRemoteWeatherRiskUpdates',
  'Expedition Hub should not subscribe to live remote/weather events.',
);
assertNotIncludes(
  tabSource,
  'No predictive hazards detected.',
  'Expedition Hub should not show active-route predictive hazard status text.',
);
assertNotIncludes(
  tabSource,
  'formatRemoteWeatherRiskStatusLine(remoteWeatherRisk)',
  'Expedition Hub should not render concise active-route hazard text.',
);
assertNotIncludes(
  tabSource,
  'recordRemoteWeatherBriefEvent',
  'Expedition tab should not duplicate ECS Brief entries.',
);
assertNotIncludes(
  tabSource,
  'RemoteWeatherRiskPanel',
  'Expedition tab should not add a new risk panel.',
);
assertIncludes(
  packageSource,
  '"test:expedition-remote-weather-status": "node ./scripts/test-expedition-remote-weather-status.js"',
  'package.json should expose the Expedition remote/weather status regression test.',
);

console.log('Expedition remote/weather status checks passed.');
