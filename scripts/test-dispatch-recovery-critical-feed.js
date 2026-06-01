const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

assert.match(
  source,
  /function isRecoveryCriticalEvent\(event: DispatchEvent\)/,
  'Dispatch feed should have a recovery-critical event detector.',
);
assert.match(
  source,
  /function isProtectedCadEvent\(event: DispatchEvent\)/,
  'Dispatch feed should classify protected CAD events before clearing routine items.',
);
assert.match(
  source,
  /function isClearableRoutineCadEvent\(event: DispatchEvent\)/,
  'Dispatch feed should classify routine CAD items that can be cleared locally.',
);
assert.match(
  source,
  /event\.status === 'recovery_critical'/,
  'Recovery-critical detector should include recovery_critical status.',
);
assert.match(
  source,
  /event\.category === 'recovery_assist'/,
  'Recovery-critical detector should include recovery_assist category.',
);
assert.match(
  source,
  /event\.category === 'hazard_recovery'/,
  'Recovery-critical detector should include hazard_recovery category.',
);
assert.match(
  source,
  /Recovery Assist Requested from Current GPS Position/,
  'Recovery-critical feed should show the requested display copy.',
);
assert.match(
  source,
  /const severityLabel = isRecoveryCritical[\s\S]*\? 'Recovery Critical'/,
  'Recovery-critical feed rows should display Recovery Critical severity.',
);
assert.match(
  source,
  /styles\.eventRowRecoveryCritical/,
  'Recovery-critical feed rows should use a dedicated critical style.',
);
assert.match(
  source,
  /borderColor: `\$\{TACTICAL\.danger\}99`/,
  'Recovery-critical style should use the ECS danger semantic token.',
);
assert.match(
  source,
  /function getRecoveryCriticalLocationLabel[\s\S]*GPS \+\/- \$\{Math\.round\(accuracy\)\}m/,
  'Recovery-critical feed rows should expose GPS accuracy when available.',
);
assert.match(
  source,
  /Clear CAD/,
  'Running CAD feed should expose a Clear CAD button.',
);
assert.match(
  source,
  /clearableCadEventCount/,
  'Clear CAD button should be driven by clearable routine event count.',
);
assert.match(
  source,
  /handleClearCadFeed/,
  'Running CAD feed should have a Clear CAD action handler.',
);
assert.match(
  source,
  /Cleared locally from Running CAD Feed\./,
  'Clear CAD should locally dismiss routine items instead of deleting server/team CAD events.',
);
assert.match(
  source,
  /event\.type === 'team_ping'[\s\S]*event\.type === 'assistance'[\s\S]*event\.type === 'sync'[\s\S]*event\.type === 'system'[\s\S]*event\.type === 'resources'/,
  'Clear CAD should only target routine low-priority CAD event types.',
);
assert.match(
  source,
  /isRecoveryCriticalEvent\(event\)[\s\S]*isRecoveryAssistanceCadEvent\(event\)[\s\S]*event\.category === 'hazard_recovery'[\s\S]*event\.requiresMapDrilldown === true[\s\S]*event\.severity === 'warning'[\s\S]*event\.severity === 'critical'/,
  'Clear CAD should protect recovery, drilldown, warning, and critical events.',
);
assert.match(
  source,
  /function isRecoveryAssistanceCadEvent\(event: DispatchEvent\)/,
  'Dispatch should classify recovery assistance CAD events for protection and navigation handoff.',
);
assert.match(
  source,
  /normalizedTitle\.includes\('recovery'\)/,
  'Clear CAD should preserve ambiguous recovery-titled CAD entries by default.',
);
assert.match(
  source,
  /Navigate to Recovery Request/,
  'Recovery map intelligence should expose one recovery navigation action.',
);
assert.match(
  source,
  /isRecoveryAssistance \? \([\s\S]*Navigate to Recovery Request[\s\S]*\) : \(/,
  'Recovery map intelligence should replace threat actions only for recovery assistance context.',
);
assert.match(
  source,
  /onNavigateAssist\(event\)/,
  'Recovery map intelligence navigation button should use the existing recovery assist navigation handler.',
);
assert.match(
  source,
  /throw new Error\('Recovery request location unavailable\.'\)/,
  'Recovery navigation should fail clearly when recovery coordinates are missing or invalid.',
);
assert.match(
  source,
  /isProtectedCadEvent\(event\)[\s\S]*filter\(\(actionId\) => actionId !== 'dismiss'\)/,
  'Protected CAD events should not expose a dismiss action in the event detail flow.',
);
assert.match(
  source,
  /actionId === 'dismiss' && isProtectedCadEvent\(event\)/,
  'Protected CAD events should also guard against dismiss actions at the handler level.',
);
assert.match(
  source,
  /isActiveLiveDispatchEvent\(event\) && !\(/,
  'Clear CAD should be able to locally hide routine live events while preserving protected active events.',
);

const renderStart = source.indexOf('const renderEvent: ListRenderItem<DispatchEvent>');
const renderEnd = source.indexOf('return (', renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, 'renderEvent should exist before component return.');
const renderEvent = source.slice(renderStart, renderEnd);
assert.match(
  renderEvent,
  /if \(isRecoveryCriticalEvent\(event\)\) \{[\s\S]*setSelectedEventId\(event\.id\);[\s\S]*return;/,
  'Clicking a recovery-critical feed row should open event detail instead of the threat drilldown.',
);

console.log('Dispatch recovery-critical feed rendering checks passed.');
