const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const liveEventsPath = path.join(process.cwd(), 'lib/dispatchLiveEvents.ts');
const liveEventsSource = fs.readFileSync(liveEventsPath, 'utf8');

for (const hazardType of [
  'Weather',
  'Terrain',
  'Trail Blockage',
  'Water Crossing',
  'Recovery',
  'Visibility',
  'Other',
]) {
  assert.match(source, new RegExp(`'${hazardType}'`), `Hazard type ${hazardType} should be available.`);
}

assert.match(
  source,
  /function HazardRecoveryCadEventModal/,
  'Recovery action should use a dedicated hazard/recovery CAD event modal.',
);
assert.match(
  source,
  /<ECSModalShell[\s\S]*title="Recovery CAD Event"/,
  'Hazard/recovery flow should use the global ECS modal shell.',
);
assert.match(
  source,
  /label="Category"[\s\S]*options=\{HAZARD_TYPE_OPTIONS\}/,
  'Recovery panel should expose category selection.',
);
assert.match(
  source,
  /label="Severity"[\s\S]*options=\{PRIORITY_OPTIONS\}/,
  'Recovery panel should expose severity selection.',
);
assert.match(
  source,
  /label="Note \/ Description"/,
  'Recovery panel should expose an optional note field.',
);
assert.match(
  source,
  /onEmergencyPing=\{handleRecoveryAssist\}/,
  'Dispatch Convoy panel should retain the direct emergency coordinate ping action.',
);
assert.ok(!/>\s*More\s*<\/Text>/.test(source), 'Dispatch primary action row should not render a More button.');

const submitStart = source.indexOf('const submitCommand = useCallback(async () =>');
const submitEnd = source.indexOf('const handleEventAction', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, 'Async submitCommand should exist.');
const submitCommand = source.slice(submitStart, submitEnd);

assert.match(
  submitCommand,
  /activeCommand === 'hazard'[\s\S]*await createRecoveryCadEventFromCurrentGps/,
  'Recovery CAD event creation should attempt GPS only during hazard/recovery submission.',
);
assert.ok(
  !submitCommand.includes('GPS fix required before Recovery CAD event can be created.'),
  'GPS unavailable should not block Recovery report submission.',
);

const validationStart = source.indexOf('function validateCommandForm');
const validationEnd = source.indexOf('function severityFromPriority', validationStart);
assert.ok(validationStart >= 0 && validationEnd > validationStart, 'validateCommandForm should exist.');
const validationBlock = source.slice(validationStart, validationEnd);
assert.ok(!validationBlock.includes("command === 'hazard' && !message"), 'Recovery reports should allow empty notes.');

const eventFactoryStart = source.indexOf('function createEventFromCommand');
const eventFactoryEnd = source.indexOf('function createEventFromThreatAction', eventFactoryStart);
assert.ok(eventFactoryStart >= 0 && eventFactoryEnd > eventFactoryStart, 'createEventFromCommand should exist.');
const eventFactory = source.slice(eventFactoryStart, eventFactoryEnd);

assert.match(eventFactory, /sourceFromCommand\(command\)/, 'Hazard/recovery events should use centralized source policy.');
assert.match(eventFactory, /severity,/, 'Hazard/recovery events should preserve the selected severity.');
assert.match(eventFactory, /status: 'active'/, 'Hazard/recovery events should create active CAD reports.');
assert.match(eventFactory, /priority: severityLabel/, 'Hazard/recovery events should include a severity label.');
assert.match(eventFactory, /category: hazardType === 'recovery' \? 'recovery_assist' : 'hazard_recovery'/, 'Hazard/recovery events should include recovery category.');
assert.match(eventFactory, /hazardType,/, 'Hazard/recovery events should include normalized hazard type.');
assert.match(eventFactory, /Location status: \$\{locationStatus\}/, 'Hazard/recovery details should include location status.');
assert.match(eventFactory, /Note: \$\{noteText\}/, 'Hazard/recovery details should include the user note or no-note marker.');
assert.match(eventFactory, /Source: User Report/, 'Hazard/recovery details should identify source as User Report.');
assert.match(eventFactory, /Status: Active/, 'Hazard/recovery details should include active status.');
assert.match(eventFactory, /Local ECS Dispatch report only/, 'Hazard/recovery copy should not imply external transmission.');
assert.match(eventFactory, /location: recoveryFix[\s\S]*: undefined/, 'Hazard/recovery events should omit map coordinates when GPS is unavailable.');
assert.match(eventFactory, /requiresMapDrilldown: !!recoveryFix/, 'Hazard/recovery map drilldown should require a valid GPS fix.');

assert.match(
  source,
  /function createRecoveryCadEventFromCurrentGps[\s\S]*await getCurrentPosition\(\)[\s\S]*catch \(error\)[\s\S]*locationUnavailableReason/,
  'createRecoveryCadEventFromCurrentGps should fall back to Location unavailable when GPS fails.',
);
assert.match(
  source,
  /getRecoveryCadEventContext\(teamSnapshot, currentExpedition\)/,
  'Recovery CAD event creation should include available team/session context.',
);
assert.match(
  source,
  /event\.source === 'user_report'[\s\S]*return false/,
  'User reports should remain local/internal instead of being published through recovery sync.',
);
assert.match(liveEventsSource, /'user_report'/, 'Dispatch live event sources should include user_report.');
assert.match(liveEventsSource, /return 'User Report'/, 'Dispatch source labels should include User Report.');

console.log('Dispatch hazard/recovery CAD event flow checks passed.');
