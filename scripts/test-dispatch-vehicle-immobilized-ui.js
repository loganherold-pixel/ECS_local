const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;
const originalLoad = Module._load;
Module._load = function loadWithNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const root = process.cwd();
const runtime = require(path.join(root, 'lib', 'dispatchVehicleImmobilizedRuntimeAdapter.ts'));

const NOW = '2026-07-14T18:00:00.000Z';
const actor = { id: 'operator-one', label: 'Lead', role: 'owner' };
const vehicleState = {
  status: 'incomplete',
  identity: {
    activeVehicleId: 'vehicle-one',
    vehicleId: 'vehicle-one',
    hasVehicle: true,
    displayName: 'Trail Truck',
    year: 2022,
    make: 'Toyota',
    model: 'Tacoma',
    trim: null,
    vehicleType: 'truck',
    updatedAt: NOW,
  },
  vehicle: { id: 'vehicle-one', owner_user_id: actor.id, name: 'Trail Truck', avg_mpg: 17 },
  canonicalFleetState: { accessories: [], loadoutItems: [], fleetVehicle: { buildProfile: {} } },
  specs: null,
  modifications: { accessoryCount: 0, accessoryWeightLbs: 0, containerZoneCount: 0, tireSizeInches: null, suspensionLiftInches: null, isLeveled: false, frontLevelInches: null },
  loadout: { activeLoadoutId: null, activeLoadoutName: null, itemCount: 0, cargoLoadoutWeightLbs: 0 },
  weight: {
    gvwrLbs: null, estimatedOperatingWeightLbs: null, payloadUsedPct: null, remainingPayloadLbs: null,
    payloadCapacityLbs: null, accessoryWeightLbs: 0, cargoLoadoutWeightLbs: 0, warnings: [], isPartial: true,
  },
  capability: { suspensionLiftInches: null, tireSizeInches: null, fuelTankCapacityGal: null, currentFuelGallons: 0, waterCapacityGal: null, batteryUsableWh: null },
  centerOfGravity: { topHeavyRisk: 'watch' },
  intelligence: {
    classification: { classId: 'midsize_truck', label: 'Midsize Truck', traits: { trailManeuverability: 'medium', payloadProfile: 'medium', clearanceBias: 'medium' } },
    suggestions: [],
  },
  confidence: { score: 64, label: 'low', reasons: ['Fleet profile partial'] },
  updatedAt: NOW,
  signature: 'vehicle-one-fixture',
};

const convoy = {
  convoyId: null,
  rawMembers: [],
  rawLocations: [],
  members: [],
  activeCount: 0,
  staleCount: 0,
  assistanceCount: 0,
  lead: null,
  sweep: null,
  lastUpdated: null,
  connectionStatus: 'idle',
  loading: false,
  error: null,
};

const result = runtime.buildVehicleImmobilizedRuntimeInput({
  expeditionId: 'expedition-one',
  actor,
  soloMode: true,
  online: false,
  affectedVehicleState: vehicleState,
  vehicleStates: [vehicleState],
  members: [],
  initialStatus: {
    vehicleStopped: 'confirmed_stopped',
    peopleAccounted: 'unknown',
    immediateHazard: 'unknown',
    communication: 'available',
    routeObstruction: 'blocked',
  },
  currentMemberId: actor.id,
  currentLocationContext: {
    id: 'current-location',
    type: 'pin',
    title: 'Current location',
    coordinates: { latitude: 39.7, longitude: -105.0 },
    observedAt: NOW,
    sourceTruthPolicyKey: 'convoy_member_location',
    sourceTruth: {
      id: 'device-gps', origin: 'live', role: 'primary', policyKey: 'convoy_member_location',
      authority: 'Device GPS', authorityKind: 'device', observedAt: NOW, confidence: 'high',
      coverage: 'complete', availability: 'usable', conflictState: 'none', warningCodes: [],
    },
  },
  memberLocationPermissionAllowed: true,
  positionSharingEnabled: false,
  convoy,
  routeContext: {
    id: 'route-one', type: 'route', title: 'North Ridge', sourceTruthPolicyKey: 'manual_user_state',
  },
  routeSegmentContext: null,
  terrain: null,
  weather: null,
  campCandidate: {
    id: 'camp-one', name: 'Backup Camp', coordinate: { lat: 39.8, lng: -105.1 },
    routeMileMarker: 21, distanceFromRouteMiles: 1.5, source: 'offline_cache', legalStatus: null,
    legalConfidence: 'unknown', accessConfidence: 'unknown', score: 63, notes: [],
  },
  approvedRecoveryProtocols: [{ id: 'winch-recovery', title: 'Winch Recovery' }],
  now: NOW,
});

assert.equal(result.affectedVehicle.id, 'vehicle-one');
assert.equal(result.locationContext.coordinates.latitude, 39.7);
assert.equal(result.routeSegmentContext, null, 'Missing route-segment identity must stay missing.');
assert.equal(result.recoveryEquipment.state, 'missing');
assert.match(result.recoveryEquipment.label, /not visible|unknown/i);
assert.equal(result.attitude.state, 'unavailable');
assert.equal(result.convoy.state, 'unavailable');
assert.equal(result.bailoutOrCampContext.type, 'camp');
assert.equal(result.initialStatus.routeObstruction, 'blocked');
assert.equal(result.online, false);
assert.deepEqual(result.recoveryLeadCandidates, []);
assert.deepEqual(result.spotterCandidates, []);

const remoteVehicle = {
  ...vehicleState,
  identity: { ...vehicleState.identity, activeVehicleId: null, vehicleId: 'vehicle-remote', displayName: 'Sweep Rig' },
  vehicle: { ...vehicleState.vehicle, id: 'vehicle-remote', owner_user_id: 'remote-member', name: 'Sweep Rig' },
  signature: 'vehicle-remote-fixture',
};
const restricted = runtime.buildVehicleImmobilizedRuntimeInput({
  ...result,
  affectedVehicleState: remoteVehicle,
  vehicleStates: [vehicleState, remoteVehicle],
  members: [{ id: 'remote-member', label: 'Sweep', roleId: 'member' }],
  currentMemberId: actor.id,
  memberLocationPermissionAllowed: false,
  positionSharingEnabled: true,
  convoy: {
    ...convoy,
    convoyId: 'convoy-one',
    rawMembers: [{ id: 'row-remote', convoy_id: 'convoy-one', user_id: 'remote-member', vehicle_id: 'vehicle-remote', callsign: 'SWEEP', role: 'sweep' }],
    rawLocations: [{ id: 'loc-remote', convoy_id: 'convoy-one', member_id: 'row-remote', latitude: 38.1, longitude: -106.2, captured_at: NOW }],
  },
});
assert.equal(restricted.locationContext.restricted, true);
assert.equal(restricted.locationContext.coordinates, undefined);
assert.doesNotMatch(JSON.stringify(restricted), /38\.1|-106\.2/);

const adapterSource = fs.readFileSync(path.join(root, 'lib', 'dispatchVehicleImmobilizedRuntimeAdapter.ts'), 'utf8');
const componentSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchVehicleImmobilizedPlaybook.tsx'), 'utf8');
const boardSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionCommandBoard.tsx'), 'utf8');
const cadSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'), 'utf8');
const rolloutSource = fs.readFileSync(path.join(root, 'lib', 'dispatchRolloutConfig.ts'), 'utf8');

assert.match(componentSource, /DispatchOperationalPlaybookRunner/);
assert.match(componentSource, /Vehicle Immobilized/);
assert.match(componentSource, /No mechanical diagnosis|does not diagnose/i);
assert.match(componentSource, /Nothing is declared or transmitted until the form is submitted/i);
assert.match(componentSource, /accessibilityRole="radio"/);
assert.match(componentSource, /stackBehavior="allow-stack"/);
assert.doesNotMatch(componentSource, /contactEmergencyServices|sendSms|placePhoneCall|setInterval/);
assert.match(boardSource, /onOpenVehicleImmobilized/);
assert.match(cadSource, /DispatchVehicleImmobilizedPlaybook/);
assert.match(cadSource, /requestedOperationalPlaybook === 'vehicle_immobilized'/);
assert.match(cadSource, /missionCommandEnabled && vehicleImmobilizedVisible/);
assert.match(rolloutSource, /missionCommand: false/);
assert.doesNotMatch(adapterSource, /contactEmergencyServices|sendSms|placePhoneCall|automatic(?:ally)? begin/i);

console.log('Dispatch Vehicle Immobilized runtime and UI checks passed.');
