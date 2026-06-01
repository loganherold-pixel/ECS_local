const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const tripBuilder = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));

const baseRoute = {
  id: 'white-rim',
  name: 'White Rim Planning Route',
  region: 'Utah Canyonlands',
  distanceMiles: 88,
  estimatedTravelHours: 9.5,
  estimatedDays: 2,
  terrainType: 'desert shelf road',
  terrainDifficulty: 6,
  remotenessScore: 8,
  permitRequired: true,
  startLat: 38.45,
  startLng: -109.82,
  destinationCoordinate: { latitude: 38.62, longitude: -109.58 },
  waypoints: [
    { name: 'Overlook', lat: 38.5, lon: -109.75, routeMileMarker: 24 },
    { name: 'River bend', lat: 38.56, lon: -109.68, routeMileMarker: 48 },
  ],
};

const vehicleProfile = {
  id: 'ram-2500',
  label: 'RAM 2500',
  vehicleType: 'pickup',
  rangeMiles: 310,
  payloadRemainingLbs: 1220,
  confidence: 'medium',
};

const camps = [
  {
    id: 'camp-a',
    name: 'Murphy camp zone',
    location: { latitude: 38.53, longitude: -109.7 },
    routeMileMarker: 52,
    score: 74,
    legalConfidence: 'medium',
    accessConfidence: 'medium',
    source: 'route_candidate',
  },
  {
    id: 'camp-b',
    name: 'Backup wash camp',
    location: { latitude: 38.58, longitude: -109.63 },
    routeMileMarker: 62,
    score: 61,
    legalConfidence: 'low',
    accessConfidence: 'medium',
    source: 'offline_dataset',
  },
];

const exits = [
  {
    id: 'exit-a',
    name: 'Mineral Bottom exit',
    type: 'pavement',
    location: { latitude: 38.58, longitude: -109.71 },
    routeMileMarker: 35,
    distanceFromRouteMiles: 1.4,
    priority: 9,
    source: 'bailout_store',
  },
];

function build(input, overrides = {}) {
  return tripBuilder.buildTripPlan({
    route: baseRoute,
    input,
    vehicleProfile,
    campsiteCandidates: camps,
    exitPoints: exits,
    readiness: {
      status: 'caution',
      score: 72,
      topConcern: 'Remote shelf road requires preparation.',
      source: 'explore_route_readiness',
    },
    capturedAt: '2026-05-18T12:00:00.000Z',
    ...overrides,
  });
}

const dayTrip = build({
  tripType: 'day_trip',
  timeWindow: 'full_day',
  groupType: 'two_vehicle',
  priorities: ['scenic_stops'],
});
assert.strictEqual(dayTrip.tripType, 'day_trip');
assert.strictEqual(dayTrip.primaryCampCandidate, null, 'Day trips should not force a camp candidate.');
assert.ok(dayTrip.suggestedStops.some((stop) => stop.type === 'start'), 'Day trip should include a start stop.');
assert.ok(dayTrip.suggestedStops.some((stop) => stop.type === 'finish'), 'Day trip should include a finish stop.');
assert.ok(
  dayTrip.notes.some((note) => note.id === 'day_trip_completion_focus'),
  'Day trip plans should include same-day completion guidance.',
);

const overnight = build({
  tripType: 'overnight_camping',
  timeWindow: 'overnight',
  groupType: 'small_group',
  priorities: [],
});
assert.strictEqual(overnight.primaryCampCandidate?.id, 'camp-a', 'Overnight plans should select the strongest camp candidate.');
assert.ok(overnight.suggestedStops.some((stop) => stop.type === 'camp'), 'Overnight plans should include a camp stop.');
assert.ok(overnight.estimate.tripDays >= 2, 'Overnight plans should span at least two days.');

const campingPriority = build({
  tripType: 'scenic_exploration',
  timeWindow: 'full_day',
  groupType: 'solo',
  priorities: ['camping'],
});
assert.strictEqual(
  campingPriority.primaryCampCandidate?.id,
  'camp-a',
  'Camping priority should request camp planning even for scenic exploration.',
);

const lowRisk = build({
  tripType: 'weekend_overland',
  timeWindow: 'weekend',
  groupType: 'convoy',
  priorities: ['low_risk'],
});
assert.strictEqual(lowRisk.primaryExitPoint?.id, 'exit-a', 'Low-risk plans should preserve the primary exit point.');
assert.ok(lowRisk.suggestedStops.some((stop) => stop.type === 'exit'), 'Low-risk plans should add an exit stop.');
assert.ok(lowRisk.notes.some((note) => note.id === 'low_risk_exit_priority'), 'Low-risk plans should explain exit priority.');
assert.ok(lowRisk.segments.some((segment) => segment.notes.length > 0), 'Low-risk segments should carry verification notes.');

const remoteTravel = build({
  tripType: 'multi_day_expedition',
  timeWindow: 'custom',
  groupType: 'convoy',
  priorities: ['remote_travel'],
});
assert.ok(
  remoteTravel.warnings.some((warning) => warning.id === 'remote_travel_preparation'),
  'Remote travel priority should surface preparation warnings.',
);

const sixDayRoute = {
  id: 'nevada-bdr-test',
  name: 'Nevada BDR Test Route',
  region: 'Nevada',
  distanceMiles: 720,
  estimatedTravelHours: 42,
  estimatedDays: 6,
  remotenessScore: 9,
  terrainType: 'Desert / mountain',
  startLat: 35.6,
  startLng: -114.8,
  destinationCoordinate: { latitude: 42.0, longitude: -117.0 },
  waypoints: [
    { id: 'fuel-0', name: 'Known fuel before trailhead', waypointType: 'fuel', routeMileMarker: 0, distanceFromStartMiles: 4, reliability: 'medium' },
    { id: 'ranger-1', name: 'Known ranger station', waypointType: 'ranger_station', routeMileMarker: 96, reliability: 'medium' },
    { id: 'exit-3', name: 'Known paved bailout', waypointType: 'bailout', routeMileMarker: 360, distanceFromRouteMiles: 3, reliability: 'medium' },
  ],
};
const sixDayPlan = tripBuilder.buildTripPlan({
  route: sixDayRoute,
  input: {
    tripType: 'multi_day_expedition',
    timeWindow: 'custom',
    groupType: 'solo',
    priorities: ['remote_travel'],
  },
  vehicleProfile,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.ok(
  sixDayPlan.suggestedStops.some((stop) => stop.type === 'fuel' && /Known fuel before trailhead/.test(stop.title)),
  'Multi-day plans should surface known fuel support points from route waypoint data.',
);
assert.ok(
  sixDayPlan.suggestedStops.some((stop) => stop.type === 'ranger_station'),
  'Multi-day plans should surface ranger/agency support points when route data supplies them.',
);
assert.ok(
  sixDayPlan.suggestedStops.filter((stop) => stop.type === 'camp').length >= 5,
  'Six-day plans without named camp data should create day-by-day ECS camp candidate windows.',
);
assert.strictEqual(
  sixDayPlan.primaryCampCandidate?.source,
  'ecs_route_inferred_camp_window',
  'Trip Builder should convert route-progress camp windows into camp candidate data.',
);
assert.ok(
  sixDayPlan.notes.some((note) => note.id === 'camp_candidate_inferred'),
  'Inferred camp candidates should be clearly labeled as scouting targets.',
);
assert.ok(
  sixDayPlan.suggestedStops.findIndex((stop) => stop.type === 'finish') > 3,
  'Multi-day plans should not collapse to start and finish as the only itinerary.',
);
assert.ok(
  sixDayPlan.smartResupplyPlan.fuel.keyPoint?.name === 'Known fuel before trailhead',
  'Smart Resupply should use selected route support waypoints as live route context.',
);

const missingCamp = build(
  {
    tripType: 'overnight_camping',
    timeWindow: 'overnight',
    groupType: 'solo',
    priorities: [],
  },
  { campsiteCandidates: [] },
);
assert.strictEqual(missingCamp.primaryCampCandidate?.source, 'ecs_route_inferred_camp_window');
assert.ok(
  missingCamp.notes.some((note) => note.id === 'camp_candidate_inferred'),
  'Missing named campsite data should become honest ECS-inferred camp planning data when route distance is available.',
);

const missingVehicle = build(
  {
    tripType: 'day_trip',
    timeWindow: 'morning',
    groupType: 'solo',
    priorities: [],
  },
  { vehicleProfile: null },
);
assert.ok(
  missingVehicle.notes.some((note) => note.id === 'vehicle_profile_missing'),
  'Missing vehicle profile should reduce confidence honestly.',
);

const missingExit = build(
  {
    tripType: 'weekend_overland',
    timeWindow: 'weekend',
    groupType: 'small_group',
    priorities: ['low_risk'],
  },
  { exitPoints: [] },
);
assert.strictEqual(missingExit.primaryExitPoint?.source, 'ecs_midroute_bailout_inference');
assert.strictEqual(missingExit.primaryExitPoint?.type, 'emergency_road_access');
assert.notStrictEqual(
  missingExit.primaryExitPoint?.routeMileMarker,
  missingExit.route.distanceMiles,
  'Missing dedicated bailout data must not clone the route finish as the bailout point.',
);
assert.ok(
  missingExit.warnings.some((warning) => warning.id === 'exit_points_emergency_bailout_inferred' && warning.severity === 'caution'),
  'Missing dedicated bailout data should infer an emergency bailout target while warning the user to verify it.',
);
assert.ok(
  missingExit.suggestedStops.some((stop) => stop.type === 'exit' && stop.source === 'ecs_midroute_bailout_inference'),
  'Suggested itinerary should include the inferred mid-route emergency bailout stop.',
);
assert.strictEqual(
  missingExit.suggestedStops.filter((stop) => stop.type === 'finish').length,
  1,
  'Suggested itinerary should keep one route finish stop.',
);
assert.ok(
  !missingExit.suggestedStops.some((stop) => stop.type === 'exit' && stop.routeMileMarker === missingExit.route.distanceMiles),
  'Suggested itinerary should not duplicate the finish as an exit stop.',
);

const forkBailoutRoute = {
  ...baseRoute,
  id: 'fork-bailout-route',
  waypoints: [
    ...baseRoute.waypoints,
    {
      id: 'forest-road-fork',
      name: 'Forest Road 19 fork to paved county road',
      waypointType: 'junction',
      lat: 38.54,
      lon: -109.69,
      routeMileMarker: 43,
      distanceFromRouteMiles: 0.6,
      reliability: 'medium',
    },
  ],
};
const forkBailoutPlan = tripBuilder.buildTripPlan({
  route: forkBailoutRoute,
  input: {
    tripType: 'weekend_overland',
    timeWindow: 'weekend',
    groupType: 'small_group',
    priorities: ['low_risk'],
  },
  vehicleProfile,
  exitPoints: [],
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(
  forkBailoutPlan.primaryExitPoint?.id,
  'forest-road-fork',
  'Route fork or junction data should become the preferred bailout point before midpoint inference.',
);
assert.ok(
  forkBailoutPlan.suggestedStops.some((stop) => stop.type === 'exit' && /Forest Road 19/.test(stop.title)),
  'Suggested itinerary should surface route fork bailout points.',
);

const immutableRoute = JSON.parse(JSON.stringify(baseRoute));
const routeBefore = JSON.stringify(immutableRoute);
tripBuilder.buildTripPlan({
  route: immutableRoute,
  input: {
    tripType: 'overnight_camping',
    timeWindow: 'overnight',
    groupType: 'solo',
    priorities: ['camping'],
  },
  campsiteCandidates: camps,
  exitPoints: exits,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(JSON.stringify(immutableRoute), routeBefore, 'Trip Builder must not mutate input route objects.');

assert.ok(dayTrip.route.distanceMiles === 88, 'Trip Builder should use existing route distance metadata.');
assert.ok(dayTrip.route.estimatedDriveTimeHours === 9.5, 'Trip Builder should use existing route travel-time metadata.');
assert.ok(dayTrip.readinessReference, 'Trip Builder should attach readiness reference when supplied.');
assert.ok(dayTrip.smartResupplyPlan, 'Trip Builder should attach Smart Resupply Plan output.');
assert.strictEqual(
  dayTrip.smartResupplyPlan.fuel.vehicleRangeMiles,
  vehicleProfile.rangeMiles,
  'Smart Resupply Plan should use the active vehicle range when supplied.',
);
assert.strictEqual(
  dayTrip.smartResupplyPlan.fuel.status,
  'good',
  'Manual vehicle range that exceeds route demand should produce a positive fuel status even without a known fuel POI.',
);
assert.ok(
  /Manual vehicle range covers estimated route demand/.test(dayTrip.smartResupplyPlan.fuel.primaryRecommendation),
  'Fuel recommendation should explain that manual vehicle fuel/range makes the route viable when margin is positive.',
);

const preRouteResupplyPlan = build({
  tripType: 'day_trip',
  timeWindow: 'full_day',
  groupType: 'two_vehicle',
  priorities: ['scenic_stops'],
}, {
  resupplyPoints: [
    {
      id: 'operator-fuel-a',
      name: 'Trailhead Fuel',
      category: 'fuel',
      location: { latitude: 38.44, longitude: -109.83 },
      routeMileMarker: 0,
      distanceFromStartMiles: 1.2,
      reliability: 'medium',
      source: 'operator_selected_pre_route_resupply',
    },
    {
      id: 'operator-supply-b',
      name: 'Trailhead Grocery',
      category: 'food_supplies',
      location: { latitude: 38.43, longitude: -109.84 },
      routeMileMarker: 0,
      distanceFromStartMiles: 1.8,
      reliability: 'medium',
      source: 'operator_selected_pre_route_resupply',
    },
  ],
});
assert.strictEqual(preRouteResupplyPlan.suggestedStops[0].type, 'fuel');
assert.strictEqual(preRouteResupplyPlan.suggestedStops[1].type, 'supply');
assert.strictEqual(preRouteResupplyPlan.suggestedStops[2].type, 'start');
assert.ok(
  /Trailhead Fuel/.test(preRouteResupplyPlan.suggestedStops[0].title),
  'Selected pre-route fuel should become itinerary stop A.',
);
assert.ok(
  /Trailhead Grocery/.test(preRouteResupplyPlan.suggestedStops[1].title),
  'Selected pre-route groceries should become itinerary stop B before route start.',
);

const manualSupportPlan = build(
  {
    tripType: 'weekend_overland',
    timeWindow: 'weekend',
    groupType: 'solo',
    priorities: ['low_risk'],
  },
  {
    vehicleProfile: {
      ...vehicleProfile,
      waterCapacityGal: 12,
      currentWaterGallons: 12,
      waterSource: 'manual',
      supportReadiness: {
        water: true,
        foodSupplies: true,
        repair: true,
        medical: true,
        recovery: true,
        source: 'active loadout: Weekend',
        labels: ['Water jugs', 'Tire repair kit', 'First aid kit'],
      },
    },
    resupplyPoints: [],
    availablePoiData: [],
  },
);
assert.strictEqual(manualSupportPlan.smartResupplyPlan.water.status, 'good');
assert.strictEqual(manualSupportPlan.smartResupplyPlan.repair.status, 'good');
assert.strictEqual(manualSupportPlan.smartResupplyPlan.medical.status, 'good');
assert.ok(
  /Manual vehicle water capacity/.test(manualSupportPlan.smartResupplyPlan.water.primaryRecommendation),
  'Manual water capacity should be reflected in the water plan.',
);
assert.ok(
  /repair or recovery support/.test(manualSupportPlan.smartResupplyPlan.repair.primaryRecommendation),
  'Repair/recovery loadout items should satisfy repair support.',
);
assert.ok(
  /medical support/.test(manualSupportPlan.smartResupplyPlan.medical.primaryRecommendation),
  'Medical loadout items should satisfy medical support.',
);

console.log('Trip Builder core planning checks passed.');
