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
  'getHighestActiveRemoteWeatherRisk',
  'Expedition tab should consume the active remote/weather risk selector.',
);
assertIncludes(
  tabSource,
  'subscribeRemoteWeatherRiskUpdates',
  'Expedition tab should refresh status when ECS Brief receives new events.',
);
assertIncludes(
  tabSource,
  'No predictive hazards detected.',
  'Active route with no hazard should show the requested status text.',
);
assertIncludes(
  tabSource,
  'formatRemoteWeatherRiskStatusLine(remoteWeatherRisk)',
  'Active route with a hazard should show concise severity/title status text.',
);
assertIncludes(
  tabSource,
  "status: isRouteEnabled(frameworkState) ? predictiveHazardStatus : 'Start navigation to enable'",
  'Remote/weather risk should be wired into existing Route card status text only.',
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
