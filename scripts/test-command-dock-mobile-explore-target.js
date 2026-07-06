const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  return fs.readFileSync(fullPath, 'utf8');
}

function extractNumber(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `Could not find ${label}.`);
  const value = Number(match[1]);
  assert.ok(Number.isFinite(value), `${label} must be numeric.`);
  return value;
}

const commandDockSource = read('components/CommandDock.tsx');
const adaptiveLayoutSource = read('lib/ui/adaptiveLayoutProfiles.ts');
const shellLayoutSource = read('lib/shellLayout.ts');
const routeManifestSource = read('lib/routeManifest.ts');

assert.ok(
  /id:\s*'explore'[\s\S]*?dockKey:\s*'discover'[\s\S]*?route:\s*'\/discover'/.test(routeManifestSource),
  'Explore must remain the Discover dock key and route to /discover.',
);
assert.ok(
  /case 'discover':\s*return innerPadding;/.test(commandDockSource),
  'Discover/Explore must use the inner dock-slot padding path.',
);

const compactDockHorizontalPadding = extractNumber(
  adaptiveLayoutSource,
  /dockHorizontalPadding:\s*tier === 'wide_tablet' \? \d+ : tier === 'standard_tablet' \? \d+ : tier === 'large_phone' \? \d+ : (\d+)/,
  'compact phone dock horizontal padding',
);
const compactInnerSlotPadding = extractNumber(
  commandDockSource,
  /const innerPadding = isTablet \? \d+ : isLargePhone \? \d+ : (\d+);/,
  'compact phone inner slot horizontal padding',
);
const edgeSlotFlex = extractNumber(
  shellLayoutSource,
  /ECS_COMMAND_DOCK_EDGE_SLOT_FLEX = ([0-9.]+);/,
  'edge dock slot flex',
);
const innerSlotFlex = extractNumber(
  shellLayoutSource,
  /ECS_COMMAND_DOCK_INNER_SLOT_FLEX = ([0-9.]+);/,
  'inner dock slot flex',
);
const centerSlotFlex = extractNumber(
  shellLayoutSource,
  /ECS_COMMAND_DOCK_CENTER_SLOT_FLEX = ([0-9.]+);/,
  'center dock slot flex',
);

const compactPhoneWidth = 320;
const totalDockSlotFlex =
  edgeSlotFlex + innerSlotFlex + centerSlotFlex + innerSlotFlex + edgeSlotFlex;
const dockContentWidth = compactPhoneWidth - compactDockHorizontalPadding * 2;
const exploreSlotWidth = (dockContentWidth / totalDockSlotFlex) * innerSlotFlex;
const exploreTouchableWidth = exploreSlotWidth - compactInnerSlotPadding * 2;

assert.ok(
  exploreTouchableWidth >= 44,
  `Explore compact-phone touch lane is ${exploreTouchableWidth.toFixed(1)}px; expected at least 44px.`,
);

console.log('Command dock mobile Explore target checks passed.');
