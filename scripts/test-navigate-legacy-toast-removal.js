const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function excludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const navigate = read(path.join('app', '(tabs)', 'navigate.tsx'));

excludes(
  navigate,
  "import Toast from '../../components/Toast';",
  'Navigate should not import the legacy shared Toast surface for map-centered status banners.',
);
excludes(
  navigate,
  '<Toast',
  'Navigate should not render the legacy centered map Toast surface.',
);
excludes(
  navigate,
  'mapToastAttachedToGuidance',
  'Navigate should not keep legacy toast placement state after removing map toasts.',
);
excludes(
  navigate,
  'mapToastTopOffset',
  'Navigate should not keep legacy top toast offsets.',
);
excludes(
  navigate,
  'mapToastBottomOffset',
  'Navigate should not keep legacy bottom toast offsets.',
);

includes(
  navigate,
  "import OfflineSyncStatusChip from '../../components/navigate/OfflineSyncStatusChip';",
  'Navigate should keep the compact offline sync status chip in the banner.',
);
includes(
  navigate,
  'connectionAccessory={<OfflineSyncStatusChip placement="banner" />}',
  'Navigate should keep the offline sync banner placement under the online/offline indicator.',
);
includes(
  navigate,
  "title: 'Offline cache complete'",
  'Navigate should keep the dismissible offline cache completion notice.',
);
includes(
  navigate,
  'offlineSyncCompletionNotice',
  'Navigate should keep the offline cache completion notice state.',
);
includes(
  navigate,
  'accessibilityLabel="Dismiss offline cache complete notice"',
  'Navigate should keep the explicit dismiss action for offline cache completion.',
);

console.log('Navigate legacy toast removal checks passed.');
