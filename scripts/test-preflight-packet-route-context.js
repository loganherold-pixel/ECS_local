const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const {
  buildExpeditionPreflightRoutePacket,
} = require(path.join(root, 'lib', 'expeditionPreflightRoutePacket.ts'));

const routeAsset = {
  id: 'route:rubicon-import',
  kind: 'imported',
  title: 'Rubicon Trail GPX',
  subtitle: 'Imported GPX route',
  sourceLabel: 'GPX IMPORT',
  badgeLabel: 'GPX',
  distanceMiles: 22.4,
  pointCount: 3,
  segmentCount: 1,
  updatedAt: '2026-06-15T12:00:00.000Z',
  routeId: 'rubicon-import',
  runId: 'run-rubicon',
  favoriteId: null,
  sourceTrailId: null,
  planId: null,
  navigationPayload: null,
  removeLabel: 'Delete',
  duplicateCount: 1,
  duplicateIndex: 1,
  capabilities: {
    canPlan: true,
    canNavigate: true,
    canStitch: true,
    canRename: true,
    canRemove: true,
  },
};

const run = {
  id: 'run-rubicon',
  user_id: null,
  title: 'Rubicon Trail GPX',
  source: 'gpx',
  created_at: '2026-06-15T12:00:00.000Z',
  updated_at: '2026-06-15T12:00:00.000Z',
  vehicle_id: null,
  build_snapshot: {},
  stats: {
    distance_m: 36049,
    distance_miles: 22.4,
    distance_km: 36,
    point_count: 3,
    start_lat: 39.009,
    start_lng: -120.311,
    end_lat: 39.02,
    end_lng: -120.298,
    elevation_gain_ft: null,
    elevation_loss_ft: null,
    min_ele_ft: null,
    max_ele_ft: null,
  },
  points: [
    { idx: 0, lat: 39.009, lng: -120.311, ele_m: null, time: null, type: 'track' },
    { idx: 1, lat: 39.015, lng: -120.305, ele_m: null, time: null, type: 'track' },
    { idx: 2, lat: 39.02, lng: -120.298, ele_m: null, time: null, type: 'track' },
  ],
  waypoints: [],
  is_active: false,
};

const payload = {
  id: 'run-rubicon',
  source: 'import',
  type: 'hybrid_route',
  title: 'Rubicon Trail GPX',
  subtitle: '22.4 mi | Imported Trail',
  coordinate: { lat: 39.02, lng: -120.298 },
  trailheadCoordinate: { lat: 39.009, lng: -120.311 },
  roadDestinationCoordinate: { lat: 39.009, lng: -120.311 },
  trailGeometry: [
    { lat: 39.009, lng: -120.311 },
    { lat: 39.015, lng: -120.305 },
    { lat: 39.02, lng: -120.298 },
  ],
  trailLengthMiles: 22.4,
  tripMode: 'hybrid',
  routeSource: 'gpx',
  requiresOnlineRouting: true,
  trailWaypoints: [],
  trailDecisionPoints: [],
  routeMetadata: {
    previewSource: 'run_store',
    runId: 'run-rubicon',
    routeSource: 'gpx',
    geometrySource: 'stored_gpx_geometry',
  },
  landmarkMetadata: null,
  raw: { runId: 'run-rubicon', pointCount: 3 },
  createdAt: '2026-06-15T12:00:00.000Z',
};

const noRouteMissionBrief = {
  headline: 'Telemetry is partial',
  summary: 'Confirm a planned route to sharpen expedition planning and then download maps for the planned route area.',
  priorityMessage: 'Confirm a planned route to sharpen expedition planning.',
  operatorTasks: [
    { id: 'route', title: 'Confirm a planned route to sharpen expedition planning.' },
    { id: 'offline', title: 'Download maps for the planned route area.' },
  ],
};

const packet = buildExpeditionPreflightRoutePacket({
  asset: routeAsset,
  run,
  payload,
  missionBrief: noRouteMissionBrief,
  vehicleContext: {
    hasVehicleContext: true,
    hasActiveVehicleId: true,
    activeVehicleId: 'vehicle-1',
    vehicle: { name: 'Trail Rig' },
    resourceProfile: {
      currentFuelGallons: 18,
      currentWaterGallons: 8,
      tireSizeInches: 37,
      suspensionLiftInches: 2,
      isLeveled: true,
      frontLevelInches: 1,
    },
    consumables: true,
    spec: true,
    loadoutItemCount: 3,
    loadoutTotalWeightLbs: 240,
    zoneSummary: 'Weight low and centered',
  },
});

assert.ok(packet, 'Imported GPX packet should be available.');
assert.strictEqual(packet.route.sequenceLabel, 'Single route plan');
assert.ok(packet.waypoints.trailhead, 'Imported GPX packet should expose the stored route start.');
assert.ok(packet.waypoints.destination, 'Imported GPX packet should expose the stored route end.');

const advisoryText = JSON.stringify(packet.advisory);
assert.ok(
  !advisoryText.includes('Confirm a planned route to sharpen expedition planning'),
  'A GPX packet with stored route geometry should not repeat the generic no-planned-route ECS brief action.',
);
assert.ok(
  advisoryText.includes('Download maps for the planned route area.'),
  'The remaining packet action for an uncached GPX route should be downloading the route map package.',
);
assert.ok(
  /Rubicon Trail GPX/.test(packet.advisory.summary),
  'Packet advisory summary should name the GPX route that is already planned.',
);

console.log('Preflight packet route-context regression passed.');
