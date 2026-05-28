const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const commandBrief = fs.readFileSync(path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  'Command Brief',
  'ECS Expedition Readiness',
  'No active expedition brief.',
  'Planning Brief',
  'Active Expedition Brief',
  'Preference Influence',
  'Go / Caution / Hold Decision',
  'Route Intelligence',
  'Vehicle Fit',
  'CampOps / Camp Legality Confidence',
  'Weather + Daylight Window',
  'Offline Preparedness',
  'Fuel / Power / Range',
  'Recovery + Bailout Plan',
  'Communications / Signal Confidence',
  'Share Packet',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should render "${fragment}".`);
});

[
  'useCurrentExpeditionReadiness',
  'useReadinessDecision',
  'useCanStartExpedition',
  'useExpeditionReadinessState',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should consume readiness selector "${fragment}".`);
});

[
  'Copy packet',
  'Share packet',
  'Save locally',
  "pushRoute('/navigate')",
  "pushRoute('/discover')",
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should expose action "${fragment}".`);
});

[
  'CollapsibleBriefSection',
  'accessibilityState={{ expanded }}',
  'defaultExpanded = false',
  'expanded ? badge : null',
  "expanded ? 'chevron-up-outline' : 'chevron-down-outline'",
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief detail sections should use collapsed title-first disclosure: ${fragment}`);
});

assertNotIncludes(commandBrief, 'Expedition Readiness Summary', 'Command Brief should not duplicate the removed readiness summary card.');
assertNotIncludes(commandBrief, 'Recommended Actions', 'Command Brief should not render the removed recommended actions container.');
assertNotIncludes(commandBrief, 'Watch Items', 'Command Brief should not render the removed watch items container.');
assertNotIncludes(commandBrief, 'MissionBriefCadLog', 'Command Brief should not render the obsolete visual activity log.');
assertIncludes(
  commandBrief,
  'getCachedActiveVehicleReadinessInput',
  'Command Brief should cache active vehicle readiness snapshots for useSyncExternalStore.',
);
assertNotIncludes(
  commandBrief,
  '() => buildReadinessVehicleInputFromFleetState(getActiveVehicleState())',
  'Command Brief must not return a fresh vehicle readiness object from getSnapshot.',
);
assertIncludes(dashboard, '<CommandBriefScreen embedded />', 'Dashboard ECS Brief should mount Command Brief without the obsolete activity log.');
assertIncludes(
  packageSource,
  '"test:command-brief-readiness": "node ./scripts/test-command-brief-readiness-surface.js"',
  'package.json should expose the Command Brief readiness regression test.',
);

assertNotIncludes(commandBrief, 'AI says', 'Command Brief must not use generic AI labeling.');
assertNotIncludes(commandBrief.toLowerCase(), 'legal campsite', 'Command Brief must not guarantee legal campsite status.');
assertNotIncludes(commandBrief.toLowerCase(), 'safe as', 'Command Brief must not present safety as an absolute guarantee.');
assertNotIncludes(commandBrief.toLowerCase(), 'onx', 'Command Brief must not contain OnX comparison copy.');

console.log('Command Brief readiness surface checks passed.');
