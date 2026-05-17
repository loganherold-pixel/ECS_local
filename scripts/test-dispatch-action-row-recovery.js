const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

const railStart = source.indexOf('<View style={styles.commandRail}>');
assert.ok(railStart >= 0, 'Dispatch command rail should render.');

const railEnd = source.indexOf('<EventDetailModal', railStart);
assert.ok(railEnd > railStart, 'Dispatch command rail should appear before event detail modal.');

const commandRail = source.slice(railStart, railEnd);
assert.match(commandRail, />\s*Recovery\s*</, 'Dispatch command rail should render a Recovery button.');
assert.match(
  commandRail,
  /accessibilityLabel="Create recovery or hazard CAD event"/,
  'Recovery button should expose the required accessibility label.',
);
assert.match(
  commandRail,
  /onPress=\{\(\) => openCommand\('hazard'\)\}/,
  'Recovery button should open the hazard/recovery CAD event flow directly.',
);
assert.doesNotMatch(commandRail, />\s*More\s*</, 'Dispatch command rail should not render the old More button.');
assert.doesNotMatch(
  commandRail,
  /setMoreVisible\(true\)/,
  'Dispatch command rail should not open the old More actions menu.',
);

const recoveryButtonStart = commandRail.indexOf('accessibilityLabel="Create recovery or hazard CAD event"');
const recoveryButtonEnd = commandRail.indexOf('</TouchableOpacity>', recoveryButtonStart);
assert.ok(recoveryButtonStart >= 0 && recoveryButtonEnd > recoveryButtonStart, 'Recovery button markup should exist.');

const recoveryButton = commandRail.slice(recoveryButtonStart, recoveryButtonEnd);
assert.doesNotMatch(recoveryButton, /<Ionicons\b/, 'Recovery button should not render an icon.');
assert.match(recoveryButton, /styles\.recoveryCommandButton/, 'Recovery button should use critical/recovery styling.');

console.log('Dispatch action row Recovery button checks passed.');
