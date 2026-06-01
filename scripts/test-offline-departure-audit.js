const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const {
  buildExpeditionReadiness,
} = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));

const now = '2026-05-14T12:00:00.000Z';
const route = {
  routeId: 'remote-route',
  name: 'Remote shelf route',
  distanceMiles: 74,
  difficulty: 'hard',
  riskLevel: 'high',
  routeConfidence: 'medium',
  source: 'cached',
  updatedAt: now,
};

const base = {
  capturedAt: now,
  route,
  activeVehicle: {
    vehicleId: 'veh-1',
    label: 'Jeep Wrangler Rubicon',
    drivetrain: '4x4',
    tireSizeInches: 35,
    suspensionLiftInches: 2,
    groundClearanceInches: 11,
    recoveryGearReady: true,
    vehicleFitConfidence: 'high',
    source: 'manual',
    updatedAt: now,
  },
  weather: { riskLevel: 'low', confidence: 'high', source: 'live', updatedAt: now },
  daylight: { minutesRemainingAtArrival: 180, arrivalAfterDark: false, confidence: 'high', source: 'live', updatedAt: now },
  campCandidates: [{ id: 'camp-a', legalAccessConfidence: 'medium', officialConfirmation: false, source: 'inferred', isInferred: true, updatedAt: now }],
  fuel: { rangeRemainingMiles: 210, routeDistanceRemainingMiles: 74, reserveMiles: 80, source: 'manual', updatedAt: now },
  power: { runtimeHoursRemaining: 16, requiredRuntimeHours: 8, source: 'manual', updatedAt: now },
  recovery: { bailoutRoutesAvailable: true, nearestExitMiles: 10, recoveryGearReady: true, recoveryAccessConfidence: 'high', source: 'manual', updatedAt: now },
  communications: { signalConfidence: 'low', satelliteCommsReady: true, teamCheckInPlanReady: true, source: 'manual', updatedAt: now },
};

const missingRemoteOffline = buildExpeditionReadiness({
  ...base,
  offline: {
    packageStatus: 'missing',
    routeGeometryCached: false,
    mapTilesCachedForRoute: false,
    mapsDownloaded: false,
    routeDownloaded: false,
    campCandidatesCached: false,
    bailoutPointsCached: false,
    weatherSnapshotAvailable: false,
    fuelTownRoadReferencesCached: false,
    emergencyPacketAvailable: false,
    currentRoutePackageFresh: true,
    isRemoteRoute: true,
    isOnline: false,
    source: 'cached',
    updatedAt: now,
  },
});
const missingOfflineCategory = missingRemoteOffline.categories.find((category) => category.id === 'offline_preparedness');
assert.strictEqual(missingOfflineCategory.status, 'hold', 'Remote missing offline package should hold offline preparedness.');
assert.ok(missingRemoteOffline.blockers.some((issue) => issue.id === 'offline-package-missing'), 'Remote missing offline package should create a blocker.');

const readyOffline = buildExpeditionReadiness({
  ...base,
  offline: {
    packageStatus: 'ready',
    routeGeometryCached: true,
    mapTilesCachedForRoute: true,
    mapsDownloaded: true,
    routeDownloaded: true,
    campCandidatesCached: true,
    bailoutPointsCached: true,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: true,
    emergencyPacketAvailable: true,
    currentRoutePackageFresh: true,
    cachedTileCount: 420,
    cachedRegionCount: 1,
    isRemoteRoute: true,
    isOnline: true,
    source: 'cached',
    updatedAt: now,
  },
});
assert.strictEqual(readyOffline.departureAudit.length, 10, 'Departure Audit should always include the initial 10 checklist items.');
assert.ok(readyOffline.departureAudit.every((item) => ['complete', 'caution', 'missing', 'unavailable'].includes(item.status)), 'Audit statuses should use the accepted status set.');
assert.strictEqual(readyOffline.departureAudit.find((item) => item.itemId === 'offline-map-package').status, 'complete', 'Ready offline package should complete the map package audit item.');
assert.strictEqual(readyOffline.departureAudit.find((item) => item.itemId === 'route-geometry').status, 'complete', 'Cached route geometry should complete the route geometry audit item.');

const commandBrief = read('components', 'brief', 'CommandBriefScreen.tsx');
assert.ok(commandBrief.includes('Departure Audit'), 'Command Brief should render Departure Audit.');
assert.ok(commandBrief.includes('DepartureAuditChecklist'), 'Command Brief should use the reusable DepartureAuditChecklist.');

const navigateStrip = read('components', 'navigate', 'NavigateReadinessStrip.tsx');
assert.ok(navigateStrip.includes('Offline: {offlineStatus}'), 'Navigate strip should show compact offline readiness.');
assert.ok(navigateStrip.includes('Download Route Package'), 'Navigate strip should expose the route package CTA when wired.');

const navigate = read('app', '(tabs)', 'navigate.tsx');
assert.ok(navigate.includes('onPrepareOffline={handlePrepareOfflineFromRoadPreview}'), 'Navigate should wire Download Route Package to the existing offline route prep flow.');

console.log('Offline preparedness and departure audit checks passed.');
