const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const selector = read('components', 'offline-maps', 'RegionSelector.tsx');
const offlinePage = read('app', 'navigate-offline.tsx');

assert.ok(
  selector.includes('navigateRouteSessionStore'),
  'RegionSelector should subscribe to active Navigate guidance.',
);
assert.ok(
  selector.includes("selectionSource === 'active'"),
  'RegionSelector should treat active guidance as a route corridor source.',
);
assert.ok(
  selector.includes('activeGuidance.routePoints'),
  'RegionSelector should use active guidance route geometry for offline region bounds.',
);
assert.ok(
  selector.includes('IMPORT GPX'),
  'RegionSelector should expose a GPX import button in the route selector.',
);
assert.ok(
  selector.includes('expo-document-picker') && selector.includes('fsReadFileFromPickerUri'),
  'RegionSelector should wire native GPX file picking and reading.',
);
assert.ok(
  selector.includes('routeStore.importGPX'),
  'RegionSelector should import selected GPX files into saved route options.',
);
assert.ok(
  selector.includes('No active guidance or saved routes yet. Import a GPX file or start guidance first.'),
  'RegionSelector empty copy should name both active guidance and GPX import options.',
);
assert.ok(
  !selector.includes('No runs or routes available. Import a GPX first.'),
  'RegionSelector should not imply GPX is the only way to create route regions.',
);
assert.ok(
  offlinePage.includes('<RegionSelector'),
  'Navigate Offline should continue using the shared RegionSelector.',
);

console.log('Offline region selector active-guidance checks passed.');
