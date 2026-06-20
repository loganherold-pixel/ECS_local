const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const navigate = read('app/(tabs)/navigate.tsx');
const header = read('components/Header.tsx');
const rootLayout = read('app/_layout.tsx');
const chip = read('components/navigate/OfflineSyncStatusChip.tsx');

assertIncludes(
  navigate,
  "import OfflineSyncStatusChip from '../../components/navigate/OfflineSyncStatusChip';",
  'Navigate should own the offline sync banner placement.',
);
assertIncludes(
  navigate,
  'connectionAccessory={<OfflineSyncStatusChip placement="banner" />}',
  'Navigate should place the compact sync bar inside the top banner connection stack.',
);
assertIncludes(
  header,
  'connectionAccessory?: React.ReactNode;',
  'Shared Header should accept an optional left-side connection accessory.',
);
assertIncludes(
  header,
  '{connectionAccessory ? (',
  'Header should render the optional accessory under the online/offline indicator.',
);
assertIncludes(
  header,
  'styles.connectionStack',
  'Header should stack the online/offline indicator and accessory vertically.',
);
assertNotIncludes(
  rootLayout,
  "import OfflineSyncStatusChip from '../components/navigate/OfflineSyncStatusChip';",
  'Root shell should not keep the old global offline sync bar mounted.',
);
assertNotIncludes(
  rootLayout,
  '<OfflineSyncStatusChip bottomOffset={shellBodyBottomInset + 10} />',
  'Root shell should no longer float the offline sync bar over app content.',
);

assertIncludes(
  chip,
  "placement?: 'floating' | 'banner';",
  'OfflineSyncStatusChip should support a compact banner placement.',
);
assertIncludes(
  chip,
  "if (placement === 'banner') return snapshot.activeJobs[0] ?? null;",
  'Banner placement should show only active sync work, not terminal history.',
);
assertIncludes(
  chip,
  '<Text style={styles.bannerTitle} numberOfLines={1}>OFFLINE SYNC</Text>',
  'Compact banner should label the work as OFFLINE SYNC.',
);
assertIncludes(
  chip,
  '<Text style={styles.bannerPercent}>{percent}%</Text>',
  'Compact banner should show the sync percentage.',
);
assertIncludes(
  chip,
  '<Text style={styles.bannerCancelText}>CANCEL</Text>',
  'Compact banner should expose only the cancel action text.',
);
assertNotIncludes(
  chip,
  'styles.bannerDetail',
  'Compact banner should not add a route/detail line.',
);

console.log('Navigate offline sync banner regression passed.');
