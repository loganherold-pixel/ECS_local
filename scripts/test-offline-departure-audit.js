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
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const {
  buildExpeditionReadiness,
} = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));
const {
  evaluateCampCandidateViability,
} = require(path.join(root, 'lib', 'readiness', 'campCandidateViability.ts'));

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

const noRouteDayTripAudit = buildExpeditionReadiness({
  ...base,
  tripIntent: 'dayTrip',
  tripIntentSource: 'selected',
  readinessProfile: 'dayTrip',
  route: null,
  campCandidates: [],
  recovery: null,
  offline: {
    packageStatus: 'missing',
    campCandidatesCached: false,
    bailoutPointsCached: false,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: true,
    emergencyPacketAvailable: true,
    currentRoutePackageFresh: null,
    isOnline: true,
    source: 'cached',
    updatedAt: now,
  },
});
assert.ok(
  !noRouteDayTripAudit.departureAudit.some((item) => item.itemId === 'camp-candidates'),
  'Day trip Departure Audit should omit Camp candidates because camp planning is not part of the selected intent.',
);
['offline-map-package', 'bailout-points'].forEach((itemId) => {
  const auditItem = noRouteDayTripAudit.departureAudit.find((item) => item.itemId === itemId);
  assert.ok(auditItem, `${itemId} should still be visible as a route-dependent audit item.`);
  assert.strictEqual(
    auditItem.disabledActionReason,
    'You must first have an active route or build a trip.',
    `${itemId} should explain why its route-dependent action is unavailable without a route.`,
  );
});
assert.ok(
  !noRouteDayTripAudit.departureAudit.some((item) => item.itemId === 'recovery-plan'),
  'Departure Audit should not duplicate Recovery plan when Bailout points already covers route recovery review.',
);

const noRouteOvernightAudit = buildExpeditionReadiness({
  ...noRouteDayTripAudit,
  tripIntent: 'overnightCamp',
  tripIntentSource: 'selected',
  readinessProfile: 'overnight',
});
const noRouteOvernightCampItem = noRouteOvernightAudit.departureAudit.find((item) => item.itemId === 'camp-candidates');
assert.strictEqual(
  noRouteOvernightCampItem?.disabledActionReason,
  null,
  'Camp candidate audit should stay informational instead of route-gating a CampOps action when no route exists yet.',
);
assert.strictEqual(noRouteOvernightCampItem?.actionLabel, null, 'Camp candidate audit should not expose a CampOps action.');

const endpointCampViableAudit = buildExpeditionReadiness({
  ...base,
  tripIntent: 'overnightCamp',
  tripIntentSource: 'selected',
  readinessProfile: 'overnight',
  route: {
    ...base.route,
    endpointCoordinate: { latitude: 38.5000, longitude: -109.5000 },
    waypointCoordinates: [
      { latitude: 38.4500, longitude: -109.5300, label: 'Trail camp waypoint' },
    ],
  },
  campCandidates: [{
    id: 'endpoint-camp',
    name: 'Endpoint established camp',
    coordinates: { latitude: 38.5050, longitude: -109.5050 },
    legalAccessConfidence: 'medium',
    officialConfirmation: false,
    source: 'cached',
    updatedAt: now,
  }],
  offline: {
    ...base.offline,
    packageStatus: 'ready',
    campCandidatesCached: false,
    campIntelDownloaded: false,
    source: 'cached',
    updatedAt: now,
  },
});
const endpointCampAuditItem = endpointCampViableAudit.departureAudit.find((item) => item.itemId === 'camp-candidates');
assert.strictEqual(endpointCampAuditItem?.status, 'complete', 'Camp candidate audit should complete when a viable camp is within five miles of the trail endpoint.');
assert.strictEqual(endpointCampAuditItem?.actionLabel, null, 'Viable endpoint camp candidates should not ask the user to open CampOps.');
assert.strictEqual(endpointCampAuditItem?.actionTarget, null, 'Camp candidates should be informational in Departure Audit, not an Open CampOps handoff.');
assert.ok(
  /within 5 mi/i.test(endpointCampAuditItem?.summary ?? ''),
  'Camp candidate audit should explain the five-mile endpoint or waypoint radius.',
);

const noViableCampNearStopsAudit = buildExpeditionReadiness({
  ...base,
  tripIntent: 'overnightCamp',
  tripIntentSource: 'selected',
  readinessProfile: 'overnight',
  route: {
    ...base.route,
    endpointCoordinate: { latitude: 38.5000, longitude: -109.5000 },
    waypointCoordinates: [
      { latitude: 38.4500, longitude: -109.5300, label: 'Trail waypoint' },
    ],
  },
  campCandidates: [{
    id: 'far-camp',
    name: 'Far established camp',
    coordinates: { latitude: 38.6800, longitude: -109.6800 },
    legalAccessConfidence: 'medium',
    officialConfirmation: false,
    source: 'cached',
    updatedAt: now,
  }],
  offline: {
    ...base.offline,
    packageStatus: 'ready',
    campCandidatesCached: true,
    campIntelDownloaded: true,
    source: 'cached',
    updatedAt: now,
  },
});
const noViableCampAuditItem = noViableCampNearStopsAudit.departureAudit.find((item) => item.itemId === 'camp-candidates');
assert.strictEqual(noViableCampAuditItem?.status, 'complete', 'No viable camp within five miles should be informational when camp is not required to depart.');
assert.ok(/no viable camp candidates/i.test(noViableCampAuditItem?.summary ?? ''), 'Camp audit should report no viable camp candidates near route endpoints or waypoints.');
assert.strictEqual(noViableCampAuditItem?.actionLabel, null, 'No viable nearby camp candidates should not show Open CampOps as a required fix.');
assert.strictEqual(noViableCampAuditItem?.actionTarget, null, 'No viable nearby camp candidates should not route the user to CampOps as a missing action.');
const noViableCampCategory = noViableCampNearStopsAudit.categories.find((category) => category.id === 'camp_legality_confidence');
assert.strictEqual(noViableCampCategory?.status, 'ready', 'Known absence of nearby camp candidates should remain informational unless an attached camp has a real access or safety issue.');
assert.ok(
  !(noViableCampCategory?.missingInputs ?? []).includes('Camp candidate'),
  'Known absence of nearby camp candidates should not be labeled as missing CampOps data.',
);
assert.ok(
  !noViableCampNearStopsAudit.warnings.some((warning) => warning.id === 'no-viable-camp-near-route-stops'),
  'Known absence of nearby camp candidates should not surface as a key warning in ECS Intelligence.',
);

const routeSpecificBailoutAudit = buildExpeditionReadiness({
  ...base,
  offline: {
    packageStatus: 'partial',
    routeGeometryCached: true,
    mapTilesCachedForRoute: false,
    mapsDownloaded: false,
    routeDownloaded: true,
    campCandidatesCached: false,
    bailoutPointsCached: false,
    routeBailoutPointCount: 2,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: false,
    emergencyPacketAvailable: false,
    currentRoutePackageFresh: true,
    isRemoteRoute: true,
    isOnline: true,
    source: 'cached',
    updatedAt: now,
  },
});
const routeSpecificBailoutAuditItem = routeSpecificBailoutAudit.departureAudit.find((item) => item.itemId === 'bailout-points');
assert.strictEqual(
  routeSpecificBailoutAuditItem?.status,
  'complete',
  'Route-associated bailout pins should complete the Bailout points audit even when the generic cache flag is not confirmed.',
);
assert.ok(
  /2 route bailout points/i.test(routeSpecificBailoutAuditItem?.summary ?? ''),
  'Bailout points audit should name the route-specific bailout pin count.',
);
assert.strictEqual(
  routeSpecificBailoutAuditItem?.actionTarget,
  '/navigate-bailouts',
  'Completed route bailout pins should remain reviewable/editable from Departure Audit.',
);

const routeSpecificRecoveryAudit = buildExpeditionReadiness({
  ...base,
  power: {
    connectedSourceAvailable: false,
    connectionState: 'disconnected',
    dataFreshness: 'stale',
    runtimeSource: 'unavailable',
    powerRelevantForTrip: false,
    powerNeedReason: 'Day trip context does not require connected house power.',
    source: 'live',
    updatedAt: now,
    isStale: true,
  },
  recovery: {
    bailoutRoutesAvailable: true,
    routeBailoutOptionCount: 2,
    nearestExitMiles: 4,
    nearestKnownRoadMiles: 4,
    nearestBailoutSummary: 'Two route bailout pins are attached to this active guidance.',
    currentCoordinatesAvailable: true,
    currentLatitude: 38.5,
    currentLongitude: -109.5,
    emergencyCoordinatePacketReady: true,
    emergencyCoordinatePacketSummary: 'Coordinate packet can include current GPS.',
    recoveryGearReady: true,
    recoveryAccessConfidence: 'high',
    source: 'inferred',
    updatedAt: now,
    isInferred: true,
  },
  offline: {
    packageStatus: 'ready',
    routeGeometryCached: true,
    mapTilesCachedForRoute: true,
    mapsDownloaded: true,
    routeDownloaded: true,
    campCandidatesCached: true,
    bailoutPointsCached: true,
    routeBailoutPointCount: 2,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: true,
    emergencyPacketAvailable: true,
    currentRoutePackageFresh: true,
    cachedTileCount: 420,
    cachedRegionCount: 1,
    isRemoteRoute: false,
    isOnline: true,
    source: 'cached',
    updatedAt: now,
  },
});
assert.ok(
  !routeSpecificRecoveryAudit.departureAudit.some((item) => item.itemId === 'recovery-plan'),
  'Departure Audit should rely on Bailout points instead of showing a duplicate Recovery plan row.',
);
const powerRuntimeAuditItem = routeSpecificRecoveryAudit.departureAudit.find((item) => item.itemId === 'power-runtime-estimate');
assert.strictEqual(
  powerRuntimeAuditItem?.status,
  'complete',
  'Optional stale power telemetry should complete the Departure Audit power item when no reserve or drain risk is present.',
);
assert.ok(
  /optional/i.test(powerRuntimeAuditItem?.summary ?? ''),
  'Optional power audit copy should tell the user power is not a required departure blocker.',
);

const unlocatedCampCandidateViability = evaluateCampCandidateViability({
  ...base,
  route: {
    ...base.route,
    endpointCoordinate: { latitude: 38.5000, longitude: -109.5000 },
  },
  campCandidates: [{
    id: 'unlocated-camp',
    name: 'Unlocated camp candidate',
    legalAccessConfidence: 'medium',
    officialConfirmation: false,
    source: 'cached',
    updatedAt: now,
  }],
  offline: {
    ...base.offline,
    campCandidatesCached: true,
    campIntelDownloaded: true,
  },
});
assert.strictEqual(
  unlocatedCampCandidateViability.status,
  'unknown',
  'Camp candidates without coordinates should remain unknown instead of being treated as no viable camps near route stops.',
);

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
assert.strictEqual(readyOffline.departureAudit.length, 8, 'Departure Audit should include the route-actionable checklist items without duplicate recovery plan or route geometry rows.');
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
assert.ok(
  /manual/i.test(manualFuelLevelOnly.departureAudit.find((item) => item.itemId === 'fuel-range-plan').summary),
  'Manual fuel level should explain that Fuel/range plan is based on manual Fleet entry.',
);

const manualFleetTankCapacityOnly = buildExpeditionReadiness({
  ...base,
  fuel: null,
  activeVehicle: {
    ...base.activeVehicle,
    fuelCapacityGal: 32,
    fuelRangeMiles: null,
    source: 'manual',
    updatedAt: now,
  },
});
const manualFleetTankFuelAuditItem = manualFleetTankCapacityOnly.departureAudit.find((item) => item.itemId === 'fuel-range-plan');
assert.strictEqual(
  manualFleetTankFuelAuditItem?.status,
  'complete',
  'A manual Fleet tank-capacity entry should satisfy the Fuel/range plan when live OBD fuel is unavailable.',
);
assert.ok(
  /32 gal/i.test(manualFleetTankFuelAuditItem?.summary ?? '') && /manual Fleet/i.test(manualFleetTankFuelAuditItem?.summary ?? ''),
  'Manual Fleet tank-capacity fuel audit should name the manual gallons and source.',
);

const confirmedManualCommsAudit = buildExpeditionReadiness({
  ...base,
  offline: {
    ...base.offline,
    emergencyPacketAvailable: false,
    emergencyDocsAvailable: false,
  },
  communications: {
    signalConfidence: 'medium',
    satelliteCommsReady: false,
    teamCheckInPlanReady: true,
    source: 'manual',
    updatedAt: now,
  },
});
const confirmedManualCommsItem = confirmedManualCommsAudit.departureAudit.find((item) => item.itemId === 'emergency-communications-packet');
assert.strictEqual(
  confirmedManualCommsItem?.status,
  'complete',
  'A manually confirmed comms/check-in plan should complete the Emergency/communications packet without requiring offline docs.',
);
assert.strictEqual(
  confirmedManualCommsItem?.actionTarget,
  '/safety?focus=emergency-comms&returnTo=command-brief',
  'Confirm Comms Plan should route to the emergency comms reference with a Command Brief return target.',
);

const commandBrief = read('components', 'brief', 'CommandBriefScreen.tsx');
const safetyTab = read('app', '(tabs)', 'safety.tsx');
const editCommsModal = read('components', 'emergency', 'EditCommsModal.tsx');
assert.ok(commandBrief.includes('Departure Audit'), 'Command Brief should render Departure Audit.');
assert.ok(commandBrief.includes('DepartureAuditChecklist'), 'Command Brief should use the reusable DepartureAuditChecklist.');
assert.ok(commandBrief.includes('disabledActionReason'), 'Command Brief should surface disabled route-dependent audit action reasons.');
assert.ok(commandBrief.includes("intent: 'prepare_offline_route_package'"), 'Command Brief offline package action should stage route-specific offline prep.');
assert.ok(commandBrief.includes("sourceSurface: 'command_brief_departure_audit'"), 'Command Brief offline package action should identify the departure audit source.');
assert.ok(commandBrief.includes('buildOfflineFailureDrillEvidenceCaptureBundle'), 'Command Brief should be able to export a QA evidence capture bundle.');
assert.ok(commandBrief.includes('readinessAssessment: assessment'), 'Command Brief evidence capture should include the current Departure Audit readiness assessment.');
assert.ok(commandBrief.includes('share-offline-drill-evidence-capture'), 'Command Brief should expose the focused Offline Failure Drill evidence capture action.');
assert.ok(
  commandBrief.includes("item.actionTarget === '/safety?focus=emergency-comms&returnTo=command-brief'"),
  'Command Brief should special-case Confirm Comms Plan so the comms reference can return to Command Brief after confirmation.',
);
assert.ok(
  commandBrief.includes("pushRoute('/safety?focus=emergency-comms&returnTo=command-brief')"),
  'Command Brief Confirm Comms Plan should deep-link to emergency comms reference instead of a generic Safety tab.',
);
assert.ok(safetyTab.includes("params.focus === 'emergency-comms'"), 'Safety tab should focus the emergency comms reference from the Command Brief handoff.');
assert.ok(safetyTab.includes('commsStore.confirmPlan()'), 'Safety tab should persist a user-controlled comms plan confirmation.');
assert.ok(safetyTab.includes("router.replace('/dashboard?focus=command-brief'"), 'Safety tab should return to Command Brief after a Command Brief comms confirmation.');
assert.ok(safetyTab.includes("saveLabel={returningToCommandBrief ? 'Save and Confirm' : undefined}"), 'Safety tab editor should show Save and Confirm for Command Brief handoffs.');
assert.ok(editCommsModal.includes('onAfterSave?.()'), 'Comms editor should support save-and-confirm callbacks without separate placeholder flows.');

const departureAuditChecklist = read('components', 'readiness', 'DepartureAuditChecklist.tsx');
assert.ok(departureAuditChecklist.includes('statusBadgeComplete'), 'Departure Audit should use a stronger stoplight-green Complete badge style.');
assert.ok(departureAuditChecklist.includes('actionDisabled'), 'Departure Audit should render unavailable route actions in a disabled state.');
assert.ok(
  !departureAuditChecklist.includes('style={styles.actionText} numberOfLines={1}'),
  'Departure Audit action buttons should allow wrapped labels instead of truncating full words.',
);
const departureAuditSource = read('lib', 'readiness', 'departureAudit.ts');
assert.ok(!departureAuditSource.includes("'Open CampOps'"), 'Departure Audit should not expose an Open CampOps action.');
assert.ok(!departureAuditSource.includes("'recovery-plan'"), 'Departure Audit should not emit a duplicate Recovery plan item.');

const navigateStrip = read('components', 'navigate', 'NavigateReadinessStrip.tsx');
assert.ok(navigateStrip.includes('Offline: {offlineStatus}'), 'Navigate strip should show compact offline readiness.');
assert.ok(navigateStrip.includes('Download Route Package'), 'Navigate strip should expose the route package CTA when wired.');

const navigate = read('app', '(tabs)', 'navigate.tsx');
assert.ok(navigate.includes('onPrepareOffline={handlePrepareOfflineFromRoadPreview}'), 'Navigate should wire Download Route Package to the existing offline route prep flow.');
assert.ok(navigate.includes("flow?.intent === 'prepare_offline_route_package'"), 'Navigate should consume the ECS Brief offline package handoff.');
assert.ok(navigate.includes('handlePrepareOfflineFromRoadPreview()'), 'Navigate should route ECS Brief handoff through the existing route-aware offline package flow.');
assert.ok(
  !navigate.includes("setRequestBoundsTrigger((prev) => prev + 1);\n        openTopPopup('offlineCache');"),
  'Command Brief route package handoff should not reopen the generic Offline Cache sheet after starting the route-aware package.',
);

console.log('Offline preparedness and departure audit checks passed.');
