const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

const navigateSource = read('app/(tabs)/navigate.tsx');
const drawerSource = read('components/navigate/PinDrawer.tsx');
const importerSource = read('lib/pinGpxImport.ts');
const packageSource = read('package.json');

assert(
  !drawerSource.includes('PinCategoryFilterBar'),
  'PinDrawer should remove the always-visible horizontal category filter bar.',
);
assert(
  drawerSource.includes('onImportPins?: () => void') &&
    drawerSource.includes('importingPins?: boolean'),
  'PinDrawer should accept an explicit GPX pin import action and loading state.',
);
assert(
  drawerSource.includes('accessibilityLabel="Import GPX pin waypoints"'),
  'PinDrawer import button should clearly import GPX pin waypoints.',
);
assert(
  drawerSource.includes('activePinTypeFilters.includes(meta.type)') &&
    drawerSource.includes('onPinTypeFilterToggle(meta.type)'),
  'PinDrawer filter panel type chips should control the shared map/list pin filter.',
);
assert(
  !drawerSource.includes('activeTypeFilters') &&
    !drawerSource.includes('toggleTypeFilter'),
  'PinDrawer should not keep a second local type filter after the category bar is removed.',
);
assert(
  drawerSource.includes('>ALL</Text>') &&
    drawerSource.includes('onPress={onPinTypeFilterReset}'),
  'PinDrawer filter panel should expose an ALL chip that resets type filters.',
);

const pinImportStart = navigateSource.indexOf('const handleImportPinGpx = useCallback');
assert(pinImportStart >= 0, 'Navigate should define a separate GPX pin import handler.');
const pinImportEnd = navigateSource.indexOf('const handleExportAction', pinImportStart);
assert(pinImportEnd > pinImportStart, 'Pin GPX import handler should live before export handling.');
const pinImportBlock = navigateSource.slice(pinImportStart, pinImportEnd);
assert(
  pinImportBlock.includes('parseGpxPinWaypoints') &&
    pinImportBlock.includes('pinStore.create') &&
    pinImportBlock.includes('fsReadFileFromPickerUri'),
  'Pin GPX import should parse file content and create pins through pinStore.',
);
assert(
  !pinImportBlock.includes('handleImportGPX'),
  'Pin GPX import must not route through the Navigate route import handler.',
);
assert(
  navigateSource.includes('onImportPins={handleImportPinGpx}') &&
    navigateSource.includes('importingPins={pinGpxImporting}'),
  'PinDrawer should be wired to the Navigate GPX pin import handler.',
);

assert(
  importerSource.includes('parseGeoFile(fileName, content)') &&
    importerSource.includes('parsed.waypoints') &&
    !importerSource.includes('runStore') &&
    !importerSource.includes('createFromParsedImport'),
  'Pin GPX importer should consume only parsed waypoints and avoid route creation APIs.',
);

const { parseGpxPinWaypoints } = require(path.join(root, 'lib', 'pinGpxImport.ts'));

const mixedGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Field App" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Remote Pin Set</name></metadata>
  <wpt lat="39.100000" lon="-105.100000">
    <name>North Camp</name>
    <desc>Tent pad near creek</desc>
    <sym>Campground</sym>
    <type>camp</type>
  </wpt>
  <wpt lat="39.200000" lon="-105.200000">
    <name>Fuel Cache</name>
    <type>gas station</type>
  </wpt>
  <wpt lat="39.300000" lon="-105.300000">
    <name>Warn Washout</name>
    <desc>Hazard at the ledge</desc>
  </wpt>
  <rte>
    <name>Do Not Import As Route</name>
    <rtept lat="39.400000" lon="-105.400000" />
    <rtept lat="39.500000" lon="-105.500000" />
  </rte>
  <trk>
    <name>Do Not Import As Track</name>
    <trkseg>
      <trkpt lat="39.600000" lon="-105.600000" />
      <trkpt lat="39.700000" lon="-105.700000" />
    </trkseg>
  </trk>
</gpx>`;

const parsedPins = parseGpxPinWaypoints('mixed-pins.gpx', mixedGpx);
assert.strictEqual(parsedPins.waypointCount, 3, 'Pin GPX import should count waypoints.');
assert.strictEqual(parsedPins.routeCount, 1, 'Pin GPX import should count ignored routes for diagnostics.');
assert.strictEqual(parsedPins.trackCount, 1, 'Pin GPX import should count ignored tracks for diagnostics.');
assert.deepStrictEqual(
  parsedPins.pins.map((pin) => pin.type),
  ['camp', 'fuel', 'hazard'],
  'Pin GPX import should infer ECS pin types from waypoint names, symbols, types, and descriptions.',
);
assert.strictEqual(parsedPins.pins[0].lng, -105.1, 'Pin GPX import should preserve GPX longitude as ECS lng.');
assert(
  parsedPins.pins.every((pin) => pin.sourceType === 'gpx_waypoint'),
  'Imported pins should be marked as GPX waypoint sourced.',
);
assert(
  parsedPins.pins[0].notes.includes('Imported from mixed-pins.gpx'),
  'Imported pin notes should retain source-file diagnostics.',
);

assert(
  packageSource.includes('"test:pin-drawer-gpx-import"'),
  'package.json should expose the pin drawer GPX import regression check.',
);

console.log('Pin drawer GPX import regression checks passed.');
