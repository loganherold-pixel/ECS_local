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
    operatingWeightLbs: 5200,
    gvwrUsagePct: 72,
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
const missingOfflineAuditItem = missingRemoteOffline.departureAudit.find((item) => item.itemId === 'offline-map-package');
assert.strictEqual(missingOfflineAuditItem.actionTarget, '/navigate', 'Missing offline package should route to Navigate for route-specific package prep.');

const readyPackageWithoutRouteAssetCache = buildExpeditionReadiness({
  ...base,
  offline: {
    packageStatus: 'ready',
    routeGeometryCached: false,
    mapTilesCachedForRoute: false,
    mapsDownloaded: false,
    routeDownloaded: false,
    campCandidatesCached: true,
    bailoutPointsCached: true,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: true,
    emergencyPacketAvailable: true,
    currentRoutePackageFresh: true,
    cachedTileCount: 0,
    cachedRegionCount: 0,
    isRemoteRoute: true,
    isOnline: true,
    source: 'cached',
    updatedAt: now,
  },
});
const routeAssetCategory = readyPackageWithoutRouteAssetCache.categories.find((category) => category.id === 'offline_preparedness');
assert.notStrictEqual(routeAssetCategory.status, 'hold', 'Missing route geometry or corridor tiles should not hold offline preparedness when the route package is ready.');
assert.ok(
  !readyPackageWithoutRouteAssetCache.blockers.some((issue) => issue.id === 'missing-route-geometry' || issue.id === 'missing-route-corridor-tiles'),
  'Route geometry and corridor tile cache should not be ECS readiness blockers.',
);
assert.ok(
  !readyPackageWithoutRouteAssetCache.departureAudit.some((item) => item.itemId === 'route-geometry'),
  'Route geometry should not appear in Departure Audit while route geometry wiring is still being stabilized.',
);

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
assert.strictEqual(readyOffline.departureAudit.length, 9, 'Departure Audit should include the route-actionable checklist items without route geometry.');
assert.ok(readyOffline.departureAudit.every((item) => ['complete', 'caution', 'missing', 'unavailable'].includes(item.status)), 'Audit statuses should use the accepted status set.');
assert.strictEqual(readyOffline.departureAudit.find((item) => item.itemId === 'offline-map-package').status, 'complete', 'Ready offline package should complete the map package audit item.');
assert.ok(!readyOffline.departureAudit.some((item) => item.itemId === 'route-geometry'), 'Cached route geometry should not create a separate audit item.');
assert.strictEqual(readyOffline.departureAudit.find((item) => item.itemId === 'fuel-range-plan').status, 'complete', 'Manual or live fuel range should complete the fuel/range audit item.');
assert.strictEqual(readyOffline.departureAudit.find((item) => item.itemId === 'vehicle-profile').status, 'complete', 'An active vehicle with weight context should complete the vehicle profile audit item.');

const staleTimestampVehicle = buildExpeditionReadiness({
  ...base,
  capturedAt: '2026-05-14T20:00:00.000Z',
  activeVehicle: {
    ...base.activeVehicle,
    updatedAt: '2026-05-13T12:00:00.000Z',
    isStale: false,
  },
});
assert.strictEqual(staleTimestampVehicle.sourceFreshness.fleet.isStale, false, 'Explicit current Fleet state should not be marked stale solely because the saved profile timestamp is old.');

const manualFuelLevelOnly = buildExpeditionReadiness({
  ...base,
  fuel: { rangeRemainingMiles: null, routeDistanceRemainingMiles: 74, fuelPercent: 68, source: 'manual', updatedAt: now },
});
assert.strictEqual(manualFuelLevelOnly.departureAudit.find((item) => item.itemId === 'fuel-range-plan').status, 'complete', 'Manual fuel level should satisfy the fuel/range audit instead of reading missing.');

const commandBrief = read('components', 'brief', 'CommandBriefScreen.tsx');
assert.ok(commandBrief.includes('Departure Audit'), 'Command Brief should render Departure Audit.');
assert.ok(commandBrief.includes('DepartureAuditChecklist'), 'Command Brief should use the reusable DepartureAuditChecklist.');
assert.ok(commandBrief.includes("intent: 'prepare_offline_route_package'"), 'Command Brief offline package action should stage route-specific offline prep.');
assert.ok(commandBrief.includes("sourceSurface: 'command_brief_departure_audit'"), 'Command Brief offline package action should identify the departure audit source.');

const navigateStrip = read('components', 'navigate', 'NavigateReadinessStrip.tsx');
assert.ok(navigateStrip.includes('Offline: {offlineStatus}'), 'Navigate strip should show compact offline readiness.');
assert.ok(navigateStrip.includes('Download Route Package'), 'Navigate strip should expose the route package CTA when wired.');

const navigate = read('app', '(tabs)', 'navigate.tsx');
assert.ok(navigate.includes('onPrepareOffline={handlePrepareOfflineFromRoadPreview}'), 'Navigate should wire Download Route Package to the existing offline route prep flow.');
assert.ok(navigate.includes("flow?.intent === 'prepare_offline_route_package'"), 'Navigate should consume the ECS Brief offline package handoff.');
assert.ok(navigate.includes('handlePrepareOfflineFromRoadPreview()'), 'Navigate should route ECS Brief handoff through the existing route-aware offline package flow.');
assert.ok(navigate.includes("openTopPopup('offlineCache')"), 'Navigate should reopen the offline cache sheet after the ECS Brief route package handoff.');

console.log('Offline preparedness and departure audit checks passed.');
