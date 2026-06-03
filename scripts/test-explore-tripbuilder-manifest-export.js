const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const exportModule = require(path.join(root, 'lib', 'explore', 'exploreTripManifestExport.ts'));
const exportSource = fs.readFileSync(
  path.join(root, 'lib', 'explore', 'exploreTripManifestExport.ts'),
  'utf8',
);

const manifest = {
  id: 'offline-pack-test',
  generatedAt: '2026-06-03T12:00:00.000Z',
  routeId: 'route-1',
  routeName: 'Manifest Test Route',
  routeBounds: null,
  progress: {
    status: 'partially_ready',
    totalItems: 4,
    readyItems: 2,
    unavailableItems: 2,
    failedItems: 0,
    percent: 50,
  },
  errors: [
    {
      id: 'gps-missing',
      itemType: 'approach_route',
      message: 'Current location is unavailable.',
      recoverable: true,
    },
  ],
  items: [
    {
      id: 'offline-map',
      type: 'offline_map',
      label: 'Offline Map',
      status: 'ready',
      availability: 'already_cached',
      required: true,
      source: 'mapbox_tile_cache',
      summary: 'Offline map region is cached.',
    },
    {
      id: 'trip-itinerary',
      type: 'trip_itinerary',
      label: 'Trip Itinerary',
      status: 'ready',
      availability: 'available',
      required: true,
      source: 'trip_builder',
      summary: 'Itinerary waypoints are saved.',
      count: 4,
    },
    {
      id: 'approach-route',
      type: 'approach_route',
      label: 'Approach Route',
      status: 'unavailable',
      availability: 'unavailable',
      required: false,
      source: 'manual_origin_missing',
      summary: 'Current location is unavailable. Use manual origin or route-only planning.',
    },
    {
      id: 'missing-data',
      type: 'missing_data_warnings',
      label: 'Missing Data Warnings',
      status: 'unavailable',
      availability: 'unavailable',
      required: true,
      source: 'route_context',
      summary: 'Unknown legal/access status remains explicit.',
    },
  ],
};

const itinerary = {
  id: 'itinerary-1',
  routeId: 'route-1',
  routeName: 'Manifest Test Route',
  generatedAt: '2026-06-03T12:00:00.000Z',
  source: 'trip_builder',
  confidence: 72,
  phases: [
    {
      key: 'pre_trail',
      title: 'Pre-Trail Fuel/Supplies',
      items: [
        {
          id: 'fuel-1',
          label: 'Fuel near trailhead',
          source: 'mapbox_search',
          sourceState: 'manual',
          coordinate: { latitude: 38, longitude: -110 },
          summary: 'Manual origin selected by operator.',
        },
      ],
    },
    {
      key: 'trail',
      title: 'Camp/Scenic/Bailout Points',
      items: [
        {
          id: 'camp-1',
          label: 'Camp scouting window',
          source: 'campops',
          sourceState: 'missing',
          confidence: 48,
          warnings: ['Legal/access status unknown. Verify before departure.'],
          summary: 'ECS suggests scouting here based on route progress only.',
        },
      ],
    },
  ],
};

const html = exportModule.buildExploreTripManifestHtml({
  title: 'Manifest Test Route',
  manifest,
  itinerary,
  route: {
    name: 'Manifest Test Route',
    distanceMiles: 42,
    routeMetadata: {
      source: 'trail_pack',
      warnings: ['Verify current conditions before departure.'],
    },
  },
  generatedAt: '2026-06-03T12:00:00.000Z',
});

assert.ok(html.includes('EXPLORE TRIP MANIFEST'), 'Manifest HTML should identify the printable trip manifest.');
assert.ok(html.includes('Manifest Test Route'), 'Manifest HTML should include the route title.');
assert.ok(html.includes('Pre-Trail Fuel/Supplies'), 'Manifest HTML should include itinerary phase labels.');
assert.ok(html.includes('Camp/Scenic/Bailout Points'), 'Manifest HTML should include camp/bailout itinerary phase.');
assert.ok(html.includes('Manual origin selected by operator.'), 'Manual origin labels should remain visible.');
assert.ok(html.includes('Current location is unavailable'), 'Unavailable items must remain visible.');
assert.ok(html.includes('Unknown legal/access status remains explicit'), 'Legal/access unknowns must stay explicit.');
assert.ok(html.includes('Legal/access status unknown. Verify before departure.'), 'Camp warnings should not be dropped.');
assert.ok(html.includes('Offline map region is cached.'), 'Offline Prep items should flow into the printable manifest.');
assert.ok(html.includes('PARTIALLY_READY'), 'Offline Prep progress status should be printed.');

assert.ok(exportSource.includes("await import('expo-print')"), 'Manifest export should use expo-print dynamically.');
assert.ok(exportSource.includes("await import('expo-sharing')"), 'Manifest export should use expo-sharing dynamically.');
assert.ok(exportSource.includes('printToFileAsync'), 'Native export should generate a PDF file.');
assert.ok(exportSource.includes('shareAsync'), 'Native export should offer sharing.');
assert.ok(exportSource.includes('window.open'), 'Web export should support browser print fallback.');

console.log('Explore TripBuilder manifest export checks passed.');
