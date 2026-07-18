const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
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

const generatedAt = '2026-06-03T12:00:00.000Z';
const manifest = {
  id: 'offline-pack-test',
  generatedAt,
  routeId: 'route-1',
  routeName: 'Family Ridge Route',
  routeBounds: null,
  progress: {
    status: 'partially_ready',
    totalItems: 4,
    readyItems: 2,
    unavailableItems: 2,
    failedItems: 0,
    percent: 50,
  },
  errors: [{
    id: 'turns-missing',
    itemType: 'road_turn_guidance',
    message: 'Detailed road turns are not cached.',
    recoverable: true,
  }],
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
      id: 'route-line',
      type: 'route_line',
      label: 'Route Line',
      status: 'ready',
      availability: 'available',
      required: true,
      source: 'trip_builder',
      summary: 'Canonical route line is saved.',
    },
    {
      id: 'road-turns',
      type: 'road_turn_guidance',
      label: 'Road Turns',
      status: 'unavailable',
      availability: 'unavailable',
      required: true,
      source: 'provider_unavailable',
      summary: 'Detailed road turns are not cached.',
    },
  ],
};

// This is the canonical TripItinerary shape: phases are keys and ordered data
// lives in stops/waypoints, not in obsolete phase objects with nested items.
const itinerary = {
  id: 'itinerary-1',
  title: 'Family Ridge Route',
  status: 'ready',
  createdAt: generatedAt,
  updatedAt: generatedAt,
  userStart: { latitude: 38.1, longitude: -122.1 },
  trailheadStart: {
    id: 'trailhead-1',
    title: 'West Ridge Trailhead',
    type: 'trailhead',
    phase: 'trailhead',
    coordinate: { latitude: 38.3, longitude: -122.3 },
    source: { provider: 'operator_selected', state: 'manual' },
    confidence: 'high',
  },
  trailEnd: {
    id: 'end-1',
    title: 'North Fork Exit',
    type: 'route_end',
    phase: 'trail_exit',
    coordinate: { latitude: 38.5, longitude: -122.5 },
    source: { provider: 'gpx_import', state: 'cached' },
    confidence: 'high',
  },
  phases: ['user_start', 'pre_trail', 'trailhead', 'trail_navigation', 'trail_exit'],
  stops: [
    {
      id: 'origin',
      title: 'Home departure',
      type: 'start',
      stopRole: 'origin',
      phase: 'user_start',
      sequence: 1,
      coordinate: { latitude: 38.1, longitude: -122.1 },
      source: { provider: 'operator', state: 'manual' },
      confidence: 'high',
    },
    {
      id: 'fuel',
      title: 'Fuel & Family Market <West>',
      type: 'fuel',
      stopRole: 'pre_trail_resupply',
      phase: 'pre_trail',
      sequence: 2,
      etaOffsetHours: 1.2,
      coordinate: { latitude: 38.2, longitude: -122.2 },
      source: { provider: 'saved_search', state: 'cached' },
      confidence: 'medium',
      notes: ['Opening hours were not provided.'],
    },
    {
      id: 'trailhead',
      title: 'West Ridge Trailhead',
      type: 'trailhead',
      stopRole: 'trailhead',
      phase: 'trailhead',
      sequence: 3,
      coordinate: { latitude: 38.3, longitude: -122.3 },
      source: { provider: 'operator_selected', state: 'manual' },
      confidence: 'high',
    },
    {
      id: 'destination',
      title: 'North Fork Exit',
      type: 'finish',
      stopRole: 'exit',
      phase: 'trail_exit',
      sequence: 4,
      coordinate: { latitude: 38.5, longitude: -122.5 },
      source: { provider: 'gpx_import', state: 'cached' },
      confidence: 'high',
    },
  ],
  waypoints: [],
  segments: [],
  routeGeometryStatus: 'ready',
  confidence: { overall: 'medium', score: 74 },
  dataUsed: [],
};

const tripPlan = {
  id: 'trip-plan-1',
  generatedAt,
  groupType: 'solo',
  timeWindow: 'multi_day',
  recommendedDeparture: '2026-06-04T14:00:00.000Z',
  estimate: { tripDays: 3, driveTimeHours: 7.5 },
  route: {
    routeId: 'route-1',
    name: 'Family Ridge Route',
    region: 'North Test Forest',
    source: 'operator_imported_gpx',
    distanceMiles: 82.4,
    terrainType: 'mixed forest road',
  },
  suggestedStops: [
    ...itinerary.stops,
    {
      id: 'bailout-reference',
      title: 'Ranger station reference',
      type: 'exit',
      sequence: 5,
      plannedDay: 2,
      coordinate: { latitude: 38.42, longitude: -122.41 },
      source: 'operator_saved_reference',
      confidence: 'medium',
      guidanceRole: 'reference_only',
      referenceType: 'bailout',
    },
  ],
  warnings: [{ message: 'Verify seasonal access before departure.' }],
};

const readiness = {
  status: 'caution',
  score: 82,
  summary: {
    decisionLabel: 'Caution - verify the unresolved route items',
    concern: 'Seasonal access has not been confirmed.',
  },
  source: 'explore_route_readiness',
  updatedAt: '2026-06-03T11:45:00.000Z',
};

const offlinePresentation = {
  kind: 'degraded',
  headline: 'Offline navigation ready with limits',
  summary: 'The map and route are cached, but detailed road turns are unavailable.',
  routeName: 'Family Ridge Route',
  navigationReady: true,
  mapReady: true,
  mapStatus: 'complete',
  routeGeometryReady: true,
  turnGuidanceState: 'unavailable',
  requiredReadyCount: 2,
  requiredCount: 3,
  optionalGapCount: 0,
  estimatedSizeMB: 125,
  groups: [],
  attentionItems: [{
    id: 'turns',
    severity: 'warning',
    title: 'Road turns are not included',
    message: 'Line-only guidance remains available.',
    recommendedAction: null,
    itemType: 'road_turn_guidance',
    source: 'presentation',
  }],
  primaryActionKind: 'degraded',
  primaryActionLabel: 'Review Offline Limits',
  primaryActionEnabled: true,
};

const input = {
  title: 'Family Ridge Route Family Emergency Trip Manifest',
  manifest,
  itinerary,
  tripPlan,
  readiness,
  vehicleProfile: {
    label: 'Trail Rig',
    vehicleType: '4x4 SUV',
    source: 'fleet_profile',
    confidence: 'medium',
    updatedAt: generatedAt,
  },
  emergencyPoints: [{
    id: 'medical-reference',
    name: 'County clinic reference',
    category: 'medical',
    location: { latitude: 38.25, longitude: -122.22 },
    source: 'operator_saved_reference',
    reliability: 'medium',
  }],
  emergencyNotes: [
    'Satellite messenger is carried; registration and battery state must be verified.',
    { message: 'Family should provide this packet to local authorities if the agreed overdue threshold is reached.' },
  ],
  offlinePresentation,
  route: {
    name: 'Family Ridge Route',
    distanceMiles: 82.4,
    region: 'North Test Forest',
    terrainType: 'mixed forest road',
    routeMetadata: { warnings: ['Verify current closures before departure.'] },
  },
  routeCoordinates: [
    { latitude: 38.1, longitude: -122.1 },
    { latitude: 38.2, longitude: -122.2 },
    { latitude: 38.3, longitude: -122.3 },
    { latitude: 38.4, longitude: -122.4 },
    { latitude: 38.5, longitude: -122.5 },
  ],
  generatedAt,
};

const packet = exportModule.buildExploreFamilyEmergencyManifestPresentation(input);
assert.strictEqual(packet.readiness.score, 82, 'Route-readiness score should come from the linked readiness snapshot.');
assert.strictEqual(packet.readiness.status, 'Caution', 'Readiness status should remain distinct from offline-pack status.');
assert.strictEqual(packet.offline.requiredReadyCount, 2, 'Offline required-asset count should come from its presentation model.');
assert.strictEqual(packet.offline.requiredCount, 3, 'Offline completion must not be mislabeled as readiness score.');
assert.deepStrictEqual(
  packet.itinerary.map((stop) => stop.label),
  ['Home departure', 'Fuel & Family Market <West>', 'West Ridge Trailhead', 'North Fork Exit'],
  'Canonical TripItinerary stops should remain ordered from origin through destination.',
);
assert.strictEqual(packet.trip.expectedReturn, null, 'Missing return time must remain missing.');
assert.strictEqual(packet.trip.trustedContact, null, 'An unrelated global contact must not be attached.');
assert.strictEqual(packet.supportPoints.length, 2, 'Saved reference and emergency points should remain separate from guidance stops.');

const html = exportModule.buildExploreTripManifestHtml(input);
assert.ok(html.includes('ECS Family Emergency Trip Manifest'), 'PDF should identify its family emergency purpose.');
assert.ok(html.includes('For family, trusted contacts, and responding authorities'), 'First-page emergency use context should be explicit.');
assert.ok(html.includes('82'), 'The linked route-readiness score should be visible.');
assert.ok(html.includes('Caution'), 'The route-readiness decision should be visible.');
assert.ok(html.includes('Explore Route Readiness'), 'Readiness source should remain visible in family-readable language.');
assert.ok(html.includes('Home departure'), 'Canonical itinerary origin should be visible.');
assert.ok(html.includes('West Ridge Trailhead'), 'Canonical trailhead should be visible.');
assert.ok(html.includes('North Fork Exit'), 'Canonical destination should be visible.');
assert.ok(html.includes('38.10000, -122.10000'), 'Approved planned itinerary coordinates should be formatted for responders.');
assert.ok(html.includes('Fuel &amp; Family Market &lt;West&gt;'), 'User-provided labels must be HTML escaped.');
assert.ok(!html.includes('Fuel & Family Market <West>'), 'Unescaped user-provided HTML must never enter the document.');
assert.ok(html.includes('Not provided for this trip'), 'Missing contacts, check-ins, and return time should remain explicit.');
assert.ok(html.includes('not live tracking'), 'Manifest must not imply live location.');
assert.ok(html.includes('not a distress signal'), 'Manifest must not imply an emergency was declared.');
assert.ok(html.includes('not automatically sent'), 'Manifest must not imply ECS contacted authorities.');
assert.ok(html.includes('Private emergency-planning document'), 'Sensitive-coordinate privacy should be visible.');
assert.ok(html.includes('2/3 required assets ready'), 'Offline state should be printed independently of readiness.');
assert.ok(!html.includes('>50%</'), 'Download percent must not appear as a readiness score.');
assert.ok(!html.includes('[object Object]'), 'Typed readiness/source fields should never render as raw objects.');
assert.ok(html.includes('<svg'), 'Saved canonical geometry should produce a simple planned-route overview.');

const missingPacket = exportModule.buildExploreFamilyEmergencyManifestPresentation({
  title: 'Missing Data Route',
  manifest: { ...manifest, routeName: 'Missing Data Route' },
  route: { name: 'Missing Data Route' },
  routeCoordinates: [],
  generatedAt,
});
const missingHtml = exportModule.buildExploreTripManifestHtml({
  title: 'Missing Data Route',
  manifest: { ...manifest, routeName: 'Missing Data Route' },
  route: { name: 'Missing Data Route' },
  routeCoordinates: [],
  generatedAt,
});
assert.strictEqual(missingPacket.readiness.score, null, 'Missing readiness must stay unknown rather than becoming zero.');
assert.ok(missingHtml.includes('Planned route shape unavailable'), 'Missing geometry should have an explicit terminal presentation.');
assert.ok(missingHtml.includes('N/A'), 'Missing readiness should be labeled unavailable.');

assert.ok(exportSource.includes("await import('expo-print')"), 'Manifest export should use expo-print dynamically.');
assert.ok(exportSource.includes("await import('expo-sharing')"), 'Manifest export should use expo-sharing dynamically.');
assert.ok(exportSource.includes('printToFileAsync'), 'Native export should generate a PDF file.');
assert.ok(exportSource.includes('shareAsync'), 'Native export should offer sharing.');
assert.ok(exportSource.includes('window.open'), 'Web export should support browser print fallback.');

const htmlOutArg = process.argv.find((argument) => argument.startsWith('--html-out='));
if (htmlOutArg) {
  const outputPath = path.resolve(root, htmlOutArg.slice('--html-out='.length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Sanitized family manifest fixture written to ${outputPath}`);
}

console.log('Explore family emergency trip manifest behavioral checks passed.');
