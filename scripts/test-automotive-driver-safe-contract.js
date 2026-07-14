const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  buildVehicleAutomotiveSafeProjection,
} = loadTypeScriptModule('lib/automotive/automotiveSafeProjection.ts');
const {
  selectVehicleDisplayNavigationData,
} = loadTypeScriptModule('lib/automotive/vehicleDisplayNavigationSelector.ts');
const {
  automotiveSafeMetadata,
  buildAutomotiveNativePayload,
  buildAutomotiveSemanticSignature,
  reduceAutomotiveConnectionState,
  shouldPublishAutomotiveLocation,
  shouldPublishAutomotiveState,
} = loadTypeScriptModule('lib/automotive/automotiveUpdatePolicy.ts');
const {
  resolveAutomotiveFeatureAccess,
} = loadTypeScriptModule('lib/automotive/automotiveFeatureAccess.ts');

const now = Date.parse('2026-07-13T18:00:00.000Z');
const nowIso = new Date(now).toISOString();

function baseProjectionInput() {
  return {
    navigationData: {
      mode: 'highway_drive',
      routePhase: 'route_active',
      currentLat: 39.7392,
      currentLon: -104.9903,
      headingDeg: 90,
      speedMph: 34,
      routeLine: true,
      nextManeuver: 'Turn right on Forest Road 12',
      distanceRemainingMiles: 12.4,
      etaMinutes: 31,
      nearbyFuelServices: [],
      breadcrumbTrail: false,
      importedGpxRoute: true,
      offRouteAlert: false,
      offRouteDistanceFt: null,
      elevationShading: false,
      offlineMapIndicator: true,
      offlineMapRegion: 'OFFLINE READY',
      routeName: 'Test Route',
      destinationName: 'Trailhead',
      statusLabel: 'Route active',
      progressPct: 42,
      etaLabel: '11:31 AM',
      hazardState: 'normal',
      hazardLabel: null,
      offRouteDetected: false,
      unavailableReason: null,
      guidanceUpdatedAt: nowIso,
      positionUpdatedAt: nowIso,
    },
    attitudeData: {
      status: 'live',
      rollDeg: 1.2,
      pitchDeg: 0.5,
      sideSlopeState: 'normal',
      tiltState: 'stable',
      supportLabel: 'Device attitude',
      source: 'live_telemetry',
      unavailableReason: null,
      updatedAt: nowIso,
    },
    resourceData: {
      status: 'live',
      fuelPercent: 72,
      fuelRangeMiles: 230,
      waterRemaining: 8,
      waterUnit: 'gal',
      batteryPercent: 81,
      powerInputWatts: 120,
      powerOutputWatts: 42,
      chargeState: 'charging',
      alternateFluidLabel: null,
      alternateFluidValue: null,
      alternateFluidUnit: null,
      fuelSource: 'live_telemetry',
      waterSource: 'manual',
      powerSource: 'bluetooth',
      alternateFluidSource: 'none',
      supportLabel: 'Mixed sources',
      unavailableReason: null,
      sourceUpdatedAt: {
        fuel: nowIso,
        water: nowIso,
        power: nowIso,
        alternateFluid: null,
      },
    },
    weatherHazardData: {
      status: 'live',
      condition: 'Clear',
      weatherSummary: 'Clear and dry',
      alertSummary: null,
      windMph: 9,
      precipitationChance: 5,
      temperatureF: 74,
      hazardState: 'normal',
      routeHazard: null,
      source: 'cached',
      providerLabel: 'Operational Weather cache',
      unavailableReason: null,
      observedAt: nowIso,
      fetchedAt: nowIso,
      expiresAt: new Date(now + 60 * 60_000).toISOString(),
    },
    exitPlanData: {
      status: 'fallback',
      remotenessScore: 42,
      remotenessTier: 'remote',
      nearestBailoutLabel: 'County Road 8',
      nearestBailoutDistanceMiles: 6.2,
      exitToPavementMiles: 8.1,
      exitEtaMinutes: 24,
      offlineConfidence: 'medium',
      connectivityLabel: 'Limited',
      fuelSupportLabel: 'Adequate estimate',
      supportLabel: 'Planning estimate only',
      source: 'cached',
      unavailableReason: null,
      updatedAt: nowIso,
    },
  };
}

const projection = buildVehicleAutomotiveSafeProjection(baseProjectionInput(), now);
assert.strictEqual(projection.schemaVersion, 'ecs.automotive-safe.v1');
assert.strictEqual(projection.navigation.freshness, 'live');
assert.strictEqual(projection.navigation.source, 'ecs_guidance');
assert.strictEqual(projection.resources.values.fuel.freshness, 'live');
assert.strictEqual(projection.resources.values.water.source, 'manual');
assert.strictEqual(projection.resources.source, 'mixed');
assert.strictEqual(projection.resources.freshness, 'recent');
assert.strictEqual(projection.weatherHazard.sourceLabel, 'Operational Weather cache');
assert.notStrictEqual(
  projection.resources.values.water.freshness,
  'live',
  'manual resources must never be labeled live merely because they were recently entered',
);
assert.strictEqual(projection.weatherHazard.origin, 'cached');
assert.notStrictEqual(projection.weatherHazard.freshness, 'live');

const staleInput = baseProjectionInput();
staleInput.navigationData.guidanceUpdatedAt = new Date(now - 10 * 60_000).toISOString();
staleInput.navigationData.positionUpdatedAt = staleInput.navigationData.guidanceUpdatedAt;
staleInput.weatherHazardData.observedAt = new Date(now - 8 * 60 * 60_000).toISOString();
staleInput.weatherHazardData.fetchedAt = staleInput.weatherHazardData.observedAt;
staleInput.weatherHazardData.expiresAt = new Date(now - 7 * 60 * 60_000).toISOString();
const staleProjection = buildVehicleAutomotiveSafeProjection(staleInput, now);
assert.notStrictEqual(staleProjection.navigation.freshness, 'live');
assert.ok(
  ['watch', 'warning', 'critical', 'unavailable'].includes(staleProjection.navigation.actionableStatus),
  'stale guidance must become actionable or unavailable',
);
assert.notStrictEqual(staleProjection.weatherHazard.freshness, 'live');

const staleGpsInput = baseProjectionInput();
staleGpsInput.navigationData.guidanceUpdatedAt = nowIso;
staleGpsInput.navigationData.positionUpdatedAt = new Date(now - 90_000).toISOString();
const staleGpsProjection = buildVehicleAutomotiveSafeProjection(staleGpsInput, now);
assert.strictEqual(staleGpsProjection.navigation.position.freshness, 'stale');
assert.strictEqual(staleGpsProjection.navigation.freshness, 'stale');
assert.strictEqual(staleGpsProjection.navigation.availability, 'degraded');
assert.strictEqual(staleGpsProjection.navigation.actionableStatus, 'warning');
assert.ok(staleGpsProjection.navigation.sourceLabel.includes('GPS stale'));

const missingGpsInput = baseProjectionInput();
missingGpsInput.navigationData.currentLat = null;
missingGpsInput.navigationData.currentLon = null;
missingGpsInput.navigationData.positionUpdatedAt = null;
const missingGpsProjection = buildVehicleAutomotiveSafeProjection(missingGpsInput, now);
assert.strictEqual(missingGpsProjection.navigation.position.availability, 'unavailable');
assert.strictEqual(missingGpsProjection.navigation.availability, 'degraded');
assert.strictEqual(missingGpsProjection.navigation.actionableStatus, 'warning');

const unavailableInput = baseProjectionInput();
unavailableInput.attitudeData.status = 'unavailable';
unavailableInput.attitudeData.source = 'none';
unavailableInput.resourceData.status = 'unavailable';
unavailableInput.resourceData.fuelPercent = null;
unavailableInput.resourceData.batteryPercent = null;
unavailableInput.weatherHazardData.status = 'unavailable';
unavailableInput.weatherHazardData.source = 'none';
const unavailableProjection = buildVehicleAutomotiveSafeProjection(unavailableInput, now);
assert.strictEqual(unavailableProjection.attitude.availability, 'unavailable');
assert.strictEqual(unavailableProjection.resources.availability, 'unavailable');
assert.strictEqual(unavailableProjection.weatherHazard.availability, 'unavailable');

const nativePayload = buildAutomotiveNativePayload(
  baseProjectionInput().navigationData,
  projection.navigation,
);
assert.deepStrictEqual(
  nativePayload.automotiveSafeState,
  automotiveSafeMetadata(projection.navigation),
  'native and reduced-display source labels must come from the same canonical projection',
);

const canonicalRouteSession = {
  sessionId: 'nav-session-1',
  lifecycle: 'active',
  source: 'imported',
  routeId: 'route-1',
  routeTitle: 'Canonical Route',
  routeSubtitle: 'North trailhead',
  statusLabel: 'On route',
  instruction: 'Bear left on Forest Road 12',
  routePoints: [{ lat: 39.7, lng: -105 }, { lat: 39.8, lng: -104.9 }],
  progressPoints: [],
  currentLocation: {
    latitude: 39.74,
    longitude: -104.99,
    speedMph: 20,
    headingDeg: 85,
    timestamp: now,
  },
  headingDeg: 85,
  remainingDistanceM: 16_093.44,
  remainingDurationS: 1_800,
  etaIso: new Date(now + 1_800_000).toISOString(),
  progressPercent: 42,
  nextInstructionDistanceM: 250,
  isRerouting: false,
  isOffRoute: false,
  offRouteDistanceM: null,
  routeStatusKind: 'on_route',
  updatedAt: nowIso,
};
const selectedNavigation = selectVehicleDisplayNavigationData({
  mode: 'highway_drive',
  routeSession: canonicalRouteSession,
  gps: null,
  activeRoute: { name: 'Legacy route', source_format: 'gpx' },
  roadSession: {
    status: 'navigation_active',
    destination: { title: 'Legacy destination' },
    updatedAt: nowIso,
  },
  remotenessIndex: null,
  weatherData: baseProjectionInput().weatherHazardData,
  breadcrumbRecording: false,
});
assert.strictEqual(selectedNavigation.nextManeuver, canonicalRouteSession.instruction);
assert.strictEqual(selectedNavigation.progressPct, 42);
assert.strictEqual(selectedNavigation.distanceRemainingMiles, 10);
assert.strictEqual(selectedNavigation.routeName, 'Canonical Route');

const completedNavigation = selectVehicleDisplayNavigationData({
  mode: 'highway_drive',
  routeSession: { ...canonicalRouteSession, lifecycle: 'arrived' },
  gps: null,
  activeRoute: null,
  roadSession: null,
  remotenessIndex: null,
  weatherData: baseProjectionInput().weatherHazardData,
  breadcrumbRecording: false,
});
assert.strictEqual(completedNavigation.routePhase, 'completed');
assert.strictEqual(completedNavigation.progressPct, 100);

const signatureA = buildAutomotiveSemanticSignature({
  value: 1,
  generatedAt: nowIso,
  lastUpdatedAt: nowIso,
  timestamp: now,
  updatedAt: nowIso,
});
const signatureB = buildAutomotiveSemanticSignature({
  value: 1,
  generatedAt: 'later',
  lastUpdatedAt: 'later',
  timestamp: now + 1,
  updatedAt: 'later',
});
assert.strictEqual(signatureA, signatureB, 'ephemeral timestamps must not create update storms');
const publishState = { lastSignature: signatureA, lastPublishedAt: now };
assert.strictEqual(shouldPublishAutomotiveState({
  signature: signatureB,
  state: publishState,
  nowMs: now + 5_000,
  minimumIntervalMs: 1_500,
  heartbeatIntervalMs: 60_000,
}), false);
assert.strictEqual(shouldPublishAutomotiveState({
  signature: buildAutomotiveSemanticSignature({ value: 2 }),
  state: publishState,
  nowMs: now + 2_000,
  minimumIntervalMs: 1_500,
  heartbeatIntervalMs: 60_000,
}), true);

let unchangedTickState = { lastSignature: null, lastPublishedAt: 0 };
let unchangedTickPublications = 0;
for (let tick = 0; tick <= 12; tick += 1) {
  const tickAt = now + tick * 5_000;
  if (shouldPublishAutomotiveState({
    signature: signatureA,
    state: unchangedTickState,
    nowMs: tickAt,
    minimumIntervalMs: 0,
    heartbeatIntervalMs: 60_000,
  })) {
    unchangedTickState = { lastSignature: signatureA, lastPublishedAt: tickAt };
    unchangedTickPublications += 1;
  }
}
assert.strictEqual(
  unchangedTickPublications,
  2,
  'thirteen unchanged five-second ticks should publish only the initial state and one heartbeat',
);
assert.strictEqual(shouldPublishAutomotiveLocation({
  previous: { lat: 39.7, lon: -105, heading: 90, speedMph: 20, publishedAt: now },
  next: { lat: 39.700001, lon: -105, heading: 91, speedMph: 20.2 },
  nowMs: now + 2_000,
}), false);
assert.strictEqual(shouldPublishAutomotiveLocation({
  previous: { lat: 39.7, lon: -105, heading: 90, speedMph: 20, publishedAt: now },
  next: { lat: 39.701, lon: -105, heading: 90, speedMph: 20 },
  nowMs: now + 2_000,
}), true);

let connection = { connected: false, lifecycle: 'unavailable' };
connection = reduceAutomotiveConnectionState(connection, { type: 'start' });
assert.deepStrictEqual(connection, { connected: false, lifecycle: 'connecting' });
connection = reduceAutomotiveConnectionState(connection, { type: 'probe_connected', foreground: true });
assert.deepStrictEqual(connection, { connected: true, lifecycle: 'connected' });
connection = reduceAutomotiveConnectionState(connection, { type: 'app_state', foreground: false });
assert.deepStrictEqual(connection, { connected: true, lifecycle: 'background_connected' });
connection = reduceAutomotiveConnectionState(connection, { type: 'push_failed' });
assert.deepStrictEqual(connection, { connected: true, lifecycle: 'degraded' });
connection = reduceAutomotiveConnectionState(connection, { type: 'push_recovered', foreground: true });
assert.deepStrictEqual(connection, { connected: true, lifecycle: 'connected' });
connection = reduceAutomotiveConnectionState(connection, { type: 'probe_failed' });
assert.deepStrictEqual(connection, { connected: false, lifecycle: 'degraded' });
connection = reduceAutomotiveConnectionState(connection, { type: 'native_unavailable' });
assert.deepStrictEqual(connection, { connected: false, lifecycle: 'unavailable' });
connection = reduceAutomotiveConnectionState(connection, { type: 'stop' });
assert.deepStrictEqual(connection, { connected: false, lifecycle: 'disconnected' });

const missingConfig = resolveAutomotiveFeatureAccess('android_auto_bridge', {
  platform: 'android',
  androidAutoNativeAvailable: true,
  carPlayNativeAvailable: false,
  baseContext: { environment: 'internal', env: {} },
});
assert.notStrictEqual(missingConfig.availability, 'available');

const enabledWithoutEvidence = resolveAutomotiveFeatureAccess('android_auto_bridge', {
  platform: 'android',
  androidAutoNativeAvailable: true,
  carPlayNativeAvailable: false,
  baseContext: {
    environment: 'internal',
    env: {
      EXPO_PUBLIC_ECS_AUTOMOTIVE_VEHICLE_DISPLAY: 'true',
      EXPO_PUBLIC_ECS_ANDROID_AUTO_BRIDGE: 'true',
    },
  },
});
assert.notStrictEqual(enabledWithoutEvidence.availability, 'available');

const approvedEnv = {
  EXPO_PUBLIC_ECS_AUTOMOTIVE_VEHICLE_DISPLAY: 'true',
  EXPO_PUBLIC_ECS_ANDROID_AUTO_BRIDGE: 'true',
  EXPO_PUBLIC_ECS_AUTOMOTIVE_REDUCED_UI_EVIDENCE_APPROVED: 'true',
  EXPO_PUBLIC_ECS_AUTOMOTIVE_DISTRACTION_REVIEW_APPROVED: 'true',
  EXPO_PUBLIC_ECS_AUTOMOTIVE_OWNER_APPROVED: 'true',
  EXPO_PUBLIC_ECS_ANDROID_AUTO_HEAD_UNIT_EVIDENCE_APPROVED: 'true',
};
const approvedAndroid = resolveAutomotiveFeatureAccess('android_auto_bridge', {
  platform: 'android',
  androidAutoNativeAvailable: true,
  carPlayNativeAvailable: false,
  baseContext: { environment: 'internal', env: approvedEnv },
});
assert.strictEqual(approvedAndroid.availability, 'available');
const missingNative = resolveAutomotiveFeatureAccess('android_auto_bridge', {
  platform: 'android',
  androidAutoNativeAvailable: false,
  carPlayNativeAvailable: false,
  baseContext: { environment: 'internal', env: approvedEnv },
});
assert.notStrictEqual(missingNative.availability, 'available');

const androidBridge = read('lib/androidAutoBridge.ts');
const carPlayBridge = read('lib/carPlayBridge.ts');
const coordinator = read('lib/automotive/automotiveRuntimeCoordinator.ts');
const modeEngine = read('lib/vehicleDisplayModeEngine.ts');
const vehicleStore = read('lib/vehicleDisplayStore.ts');
const vehicleRoute = read('app/vehicle-display.tsx');
const exitPlanScreen = read('components/vehicle-display/VehicleExitPlanScreen.tsx');
const rootLayout = read('app/_layout.tsx');
for (const bridgeSource of [androidBridge, carPlayBridge]) {
  assert.ok(bridgeSource.includes('AppState.addEventListener'));
  assert.ok(bridgeSource.includes('shouldPublishAutomotiveState'));
  assert.ok(bridgeSource.includes('shouldPublishAutomotiveLocation'));
  assert.ok(bridgeSource.includes('automotivePositionState'));
  assert.ok(bridgeSource.includes('automotiveProjection.navigation.position'));
  assert.ok(bridgeSource.includes('MINIMUM_DATA_PUSH_INTERVAL_MS = 5_000'));
  assert.ok(bridgeSource.includes('_schedulePendingDataPush'));
  assert.ok(bridgeSource.includes("emergency_comms: false"));
  assert.ok(bridgeSource.includes('ECS does not contact emergency services'));
}
assert.ok(coordinator.includes("owners.has('vehicle_display_route')"));
assert.ok(coordinator.includes("owners.set(owner, (owners.get(owner) ?? 0) + 1)"));
assert.ok(coordinator.includes('if (released) return;'));
assert.ok(coordinator.includes('getStatus().isConnected'));
assert.ok(coordinator.includes('async clearNativeState()'));
assert.ok(coordinator.includes('androidAutoBridge.clearAll()'));
assert.ok(coordinator.includes('carPlayBridge.clearAll()'));
assert.ok(vehicleRoute.includes("automotiveRuntimeCoordinator.acquire('vehicle_display_route')"));
assert.ok(rootLayout.includes("automotiveRuntimeCoordinator.acquire('shell')"));
assert.ok(rootLayout.includes('if (!hasShellIdentity) return undefined;'));
assert.ok(rootLayout.includes('automotiveRuntimeCoordinator.clearNativeState()'));
assert.ok(rootLayout.includes('!startupSessionRestored || isLoading || hasShellIdentity'));
assert.ok(modeEngine.includes('vehicleDisplayStore.getModeOverride()'));
assert.ok(exitPlanScreen.includes('No confirmed exit target'));
assert.ok(!exitPlanScreen.includes('No bailout target'));
assert.ok(vehicleStore.includes('AUTOMOTIVE_SUPPORT_MIN_REFRESH_MS = 30_000'));
assert.ok(vehicleStore.includes('AUTOMOTIVE_SUPPORT_HEARTBEAT_MS = 120_000'));
assert.ok(vehicleStore.includes('payload === _lastPersistedPayload'));
assert.ok(vehicleStore.includes("safeRequire('./gpsUIState')?.gpsUIState"));
assert.ok(vehicleStore.includes('_gpsUIConsumer?.stop?.()'));
assert.ok(vehicleStore.includes("navigateRouteSessionStore.getSnapshot().lifecycle !== 'inactive'"));

const nativeAutomotiveFiles = [
  'plugins/android-auto/src/ECSVehicleMapScreen.kt',
  'plugins/android-auto/src/ECSVehicleStatusScreen.kt',
  'plugins/android-auto/src/ECSVehicleWeatherScreen.kt',
  'plugins/android-auto/src/ECSVehicleActionsScreen.kt',
  'plugins/carplay/src/ECSCarPlayMapScreen.swift',
  'plugins/carplay/src/ECSCarPlayStatusScreen.swift',
  'plugins/carplay/src/ECSCarPlayWeatherScreen.swift',
  'plugins/carplay/src/ECSCarPlayActionsScreen.swift',
];
for (const file of nativeAutomotiveFiles) {
  const source = read(file);
  assert.ok(!source.includes('Send emergency signal'), `${file} must not promise emergency transmission`);
}
assert.ok(read('plugins/android-auto/src/ECSVehicleActionsScreen.kt').includes('ECS does not contact emergency services'));
assert.ok(read('plugins/carplay/src/ECSCarPlayActionsScreen.swift').includes('emergencyItem.isEnabled = false'));
assert.ok(read('plugins/carplay/src/ECSCarPlayInterfaceController.swift').includes('guard nextSignature != lastPayloadSignature'));
assert.ok(read('plugins/android-auto/src/ECSVehicleMapScreen.kt').includes('nextSignature != lastPayloadSignature'));
for (const file of [
  'plugins/android-auto/src/ECSVehicleMapScreen.kt',
  'plugins/android-auto/src/ECSVehicleStatusScreen.kt',
  'plugins/android-auto/src/ECSVehicleWeatherScreen.kt',
  'plugins/carplay/src/ECSCarPlayMapScreen.swift',
  'plugins/carplay/src/ECSCarPlayStatusScreen.swift',
  'plugins/carplay/src/ECSCarPlayWeatherScreen.swift',
]) {
  assert.ok(read(file).includes('automotiveSafeState'), `${file} must read canonical source metadata`);
}
assert.ok(read('plugins/android-auto/src/ECSVehicleWeatherScreen.kt').includes('Last known'));
assert.ok(read('plugins/carplay/src/ECSCarPlayWeatherScreen.swift').includes('Last known'));

console.log('Automotive driver-safe projection and lifecycle contract checks passed.');
