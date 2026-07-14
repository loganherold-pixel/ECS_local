/* global __dirname */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const quickActionsSource = fs.readFileSync(path.join(root, 'components', 'QuickActionsSheet.tsx'), 'utf8');
const backgroundMapSource = fs.readFileSync(path.join(root, 'lib', 'fieldUtilityActionBackgrounds.ts'), 'utf8');

const expectedAssets = {
  'quick-note.png': {
    key: 'note',
    label: 'Quick Note',
    bytes: 1775620,
    sha256: '2be79fb82439f0b425fe9789fce73cbea9dda33f5e6311e6043e7297320e50ce',
  },
  'permits-access.png': {
    key: 'permits-access',
    label: 'Permits & Access',
    bytes: 2260024,
    sha256: '1a518d1220421874258a272e14ac9cf0861ef13d5473b223aba82b9f54503a5a',
  },
  'comms.png': {
    key: 'comms',
    label: 'Comms',
    bytes: 1798494,
    sha256: 'b9f43e51cc3cac778ec48163c7f150e82196973277d825218fa6e955fd60b33b',
  },
  'trip-summaries.png': {
    key: 'trip-summaries',
    label: 'Trip Summaries',
    bytes: 2020684,
    sha256: 'fbc9a1fd9b40a61d3fc8ca98822744af2e3daa07a7313f45fbc38cdf7534395f',
  },
  'recovery-protocol.png': {
    key: 'recovery-protocol',
    label: 'Recovery Protocol',
    bytes: 2323654,
    sha256: '6e0085a0ec5f43d1acdc3d6ed9ecf7b1f3bd4cfb9c439308f657918dff340eba',
  },
  'emergency-protocol.png': {
    key: 'protocols',
    label: 'Emergency Protocol',
    bytes: 1847250,
    sha256: '77e141c447b7be8abdeb3be6ca938c765060171a2ffa7621b3a73cb4ca79c6ee',
  },
};

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(normalize(source).includes(normalize(fragment)), message);
}

function styleBlock(source, styleName) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Expected style block ${styleName} to exist.`);
  const closeMatch = normalizedSource.slice(start).match(/\n\s*},/);
  assert.ok(closeMatch, `Expected style block ${styleName} to close.`);
  return normalizedSource.slice(start, start + closeMatch.index);
}

for (const [assetName, expected] of Object.entries(expectedAssets)) {
  const assetPath = path.join(root, 'assets', 'field-utilities', assetName);
  assert.ok(fs.existsSync(assetPath), `${expected.label} should bundle ${assetName} for offline Field Utilities use.`);

  const buffer = fs.readFileSync(assetPath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(buffer.length, expected.bytes, `${expected.label} should use the approved supplied image byte size.`);
  assert.strictEqual(hash, expected.sha256, `${expected.label} should use the approved supplied image fingerprint.`);

  const mapKey = expected.key.includes('-') ? `'${expected.key}'` : expected.key;
  assertIncludes(
    backgroundMapSource,
    `${mapKey}: require('../assets/field-utilities/${assetName}')`,
    `${expected.label} should resolve to ${assetName} in the Field Utilities background map.`,
  );
}

assertIncludes(
  quickActionsSource,
  "const tileBackground = FIELD_UTILITY_ACTION_BACKGROUNDS[item.key];",
  'Available Actions should resolve each tile background from the dedicated bundled image map.',
);
assertIncludes(quickActionsSource, '<ImageBackground', 'Available Actions should use ImageBackground for full-tile action imagery.');
assertIncludes(quickActionsSource, 'resizeMode="cover"', 'Available Actions images should fill each action container.');
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileBackground'),
  '...StyleSheet.absoluteFillObject',
  'Available Actions image backgrounds should fill the full tile bounds.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileBackgroundImage'),
  'opacity: 1',
  'Available Actions backgrounds should reveal the supplied imagery clearly inside the larger cards.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileScrim'),
  "backgroundColor: 'rgba(0,0,0,0.28)'",
  'Available Actions should balance readable copy with clearer full-bleed imagery.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileCopy'),
  "backgroundColor: 'rgba(0,0,0,0.48)'",
  'Available Actions should protect copy locally while leaving the main image field visible.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileContent'),
  'zIndex: 2',
  'Available Actions labels and controls should sit above the photo, scrim, and vignette.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileLabel'),
  "color: '#FFF7E2'",
  'Available Actions titles should use a high-contrast warm white over muted photo backgrounds.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileLabel'),
  'textShadowRadius: 3',
  'Available Actions titles should keep a strong shadow for mixed-light image areas.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'quickActionTileSubLabel'),
  "color: 'rgba(255,247,226,0.82)'",
  'Available Actions subtitles should remain readable without competing with the title.',
);

console.log('Field Utilities action background asset coverage passed.');
