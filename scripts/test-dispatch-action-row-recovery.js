const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

const headerStart = source.indexOf('<View style={[styles.headerActions');
assert.ok(headerStart >= 0, 'Dispatch header actions should render.');

const headerEnd = source.indexOf('</View>', source.indexOf('connectionPill', headerStart));
assert.ok(headerEnd > headerStart, 'Dispatch header actions should include the connection status.');

const recoveryPanel = source.slice(headerStart, headerEnd);
assert.match(
  recoveryPanel,
  /accessibilityLabel="Create recovery report"/,
  'Recovery report button should expose the required accessibility label from the header actions.',
);
assert.match(
  recoveryPanel,
  /onPress=\{\(\) => openCommand\('hazard'\)\}/,
  'Recovery report button should open the hazard/recovery CAD event flow directly from the header.',
);
assert.match(
  recoveryPanel,
  /accessibilityLabel=\{emergencyPingButtonAccessibilityLabel\}/,
  'Ping GPS should be a compact header action with dynamic cancel/clear accessibility.',
);
assert.match(
  recoveryPanel,
  /onPress=\{handleEmergencyPingButtonPress\}/,
  'Ping GPS should route through the cancel/clear aware handler.',
);
assert.match(
  source,
  /emergencyPingButtonMode === 'cancel'[\s\S]*\? 'Cancel'[\s\S]*emergencyPingButtonMode === 'clear'[\s\S]*\? 'Clear GPS'/,
  'Ping GPS header action should switch to Cancel for own pings and Clear GPS for received pings.',
);
assert.doesNotMatch(source, /function DispatchRecoveryCommandPanel/, 'Dispatch should not render the old lower recovery command panel.');
assert.doesNotMatch(recoveryPanel, />\s*More\s*</, 'Dispatch header actions should not render the old More button.');
assert.doesNotMatch(
  recoveryPanel,
  /setMoreVisible\(true\)/,
  'Dispatch header actions should not open the old More actions menu.',
);

const recoveryButtonStart = recoveryPanel.indexOf('accessibilityLabel="Create recovery report"');
const recoveryButtonEnd = recoveryPanel.indexOf('</TouchableOpacity>', recoveryButtonStart);
assert.ok(recoveryButtonStart >= 0 && recoveryButtonEnd > recoveryButtonStart, 'Recovery report button markup should exist.');

const recoveryButton = recoveryPanel.slice(recoveryButtonStart, recoveryButtonEnd);
assert.match(recoveryButton, /warning-outline/, 'Recovery report button should render the warning icon.');
assert.match(recoveryButton, /styles\.headerUtilityButton/, 'Recovery report button should use compact header utility styling.');

console.log('Dispatch recovery header action checks passed.');
