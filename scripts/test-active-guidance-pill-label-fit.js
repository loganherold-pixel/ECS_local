const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const overlayPath = path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const source = fs.readFileSync(overlayPath, 'utf8').replace(/\r\n/g, '\n');
const navigateSource = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');

function extractStyleBlock(styleName) {
  const marker = `${styleName}: {`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${styleName} style should exist.`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n  },', bodyStart);
  assert.ok(end >= 0, `${styleName} style should be a simple StyleSheet block.`);
  return source.slice(bodyStart, end);
}

const activeCardStart = source.indexOf('function ActiveNavigationCard({');
const activeCardEnd = source.indexOf('function ArrivedCard', activeCardStart);
assert.ok(activeCardStart >= 0 && activeCardEnd > activeCardStart, 'ActiveNavigationCard should exist.');
const activeCardBlock = source.slice(activeCardStart, activeCardEnd);

assert.ok(
  activeCardBlock.includes('| \'onPrepareOffline\'') &&
    source.includes('onPrepareOffline={props.onPrepareOffline}'),
  'Active Guidance should receive the offline preparation handler.',
);
assert.ok(
  source.includes('activeGuidanceWidth={props.activeGuidanceWidth}'),
  'Active Guidance should receive the computed landscape compact width from the Navigate screen.',
);
assert.ok(
  activeCardBlock.includes('styles.activeGuidanceProtectedActionGroup'),
  'Active Guidance header actions should live in a protected action group.',
);
assert.ok(
  activeCardBlock.includes('Minimize') && !activeCardBlock.includes('>Min</Text>'),
  'Active Guidance minimize pill should show the full Minimize label.',
);
assert.ok(
  activeCardBlock.includes('Offline') &&
    activeCardBlock.includes('accessibilityLabel="Prepare active route for offline use"'),
  'Active Guidance should expose a clear Offline pill and accessibility label.',
);
assert.ok(
  (activeCardBlock.match(/numberOfLines=\{1\}/g) ?? []).length >= 3 &&
    (activeCardBlock.match(/adjustsFontSizeToFit/g) ?? []).length >= 3 &&
    (activeCardBlock.match(/minimumFontScale=\{0\.72\}/g) ?? []).length >= 3,
  'Active Guidance action labels should stay single-line and font-fit instead of wrapping or clipping.',
);

const group = extractStyleBlock('activeGuidanceProtectedActionGroup');
assert.ok(
  /flexShrink:\s*0/.test(group) && /justifyContent:\s*'flex-end'/.test(group),
  'Active Guidance action group should reserve its width instead of shrinking into clipped labels.',
);

const meta = extractStyleBlock('activeGuidanceHeaderMeta');
assert.ok(
  /flex:\s*1/.test(meta) && /minWidth:\s*0/.test(meta),
  'Active Guidance header copy should yield space to protected actions on compact screens.',
);

const basePill = extractStyleBlock('activeGuidanceTopActionPill');
assert.ok(
  /minHeight:\s*24/.test(basePill) && /minWidth:\s*64/.test(basePill),
  'Active Guidance action pills should keep a stable minimum tap and label area.',
);

const minimize = extractStyleBlock('activeGuidanceMinimizeButton');
const offline = extractStyleBlock('activeGuidanceOfflineButton');
assert.ok(/minWidth:\s*96/.test(minimize), 'Minimize pill should reserve enough width for the full label.');
assert.ok(/minWidth:\s*84/.test(offline), 'Offline pill should reserve enough width for the full label.');

assert.ok(
  navigateSource.includes('Math.min(260, Math.max(228, Math.round(adaptive.windowWidth * 0.26)))'),
  'Landscape active guidance should compact to the top-left portion of the map instead of spanning too much width.',
);

console.log('Active Guidance pill label fit checks passed.');
