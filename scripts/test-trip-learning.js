/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'lib', 'tripLearning', 'tripLearningEngine.ts');
const privacyPath = path.join(root, 'lib', 'tripLearning', 'tripLearningPrivacy.ts');
const configPath = path.join(root, 'lib', 'tripLearning', 'tripLearningConfig.ts');
const storePath = path.join(root, 'lib', 'tripLearning', 'tripLearningStore.ts');
const adaptersPath = path.join(root, 'lib', 'tripLearning', 'tripLearningAdapters.ts');

global.__DEV__ = false;
delete global.__ECS_TRIP_LEARNING_LOCAL__;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const engine = require(enginePath);
const privacy = require(privacyPath);
const config = require(configPath);
const storeModule = require(storePath);
const adapters = require(adaptersPath);

const BASE = Date.parse('2026-06-01T08:00:00.000Z');
const iso = (offsetMinutes) => new Date(BASE + offsetMinutes * 60_000).toISOString();

function source(id, overrides = {}) {
  return {
    id,
    origin: overrides.origin ?? 'live',
    authority: overrides.authority ?? 'Deterministic test source',
    provider: overrides.provider ?? null,
    observedAt: overrides.observedAt ?? iso(120),
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

function comparisonRecord(metric, index, ratio, overrides = {}) {
  const start = iso(index * 24 * 60);
  const end = iso(index * 24 * 60 + 120);
  const forecastValue = metric === 'camp_arrival' ? (Date.parse(end) / 60_000) - 20 : 100;
  const unit = metric === 'drive_time'
    ? 'seconds'
    : metric === 'fuel_consumption'
      ? 'gallons'
      : metric === 'power_runtime'
        ? 'hours'
        : 'epoch_minutes';
  const actualValue = metric === 'camp_arrival' ? forecastValue + ratio : forecastValue * ratio;
  return {
    schemaVersion: 'ecs.trip-learning.forecast-actual.v1',
    id: overrides.id ?? `${metric}-${index}`,
    tripId: overrides.tripId ?? `trip-${metric}-${index}`,
    expeditionId: overrides.expeditionId ?? `exp-${index}`,
    vehicleId: overrides.vehicleId ?? 'vehicle-1',
    routeClass: 'mixed',
    terrainClass: overrides.terrainClass ?? 'moderate',
    metric,
    forecast: {
      value: forecastValue,
      unit,
      observedAt: start,
      sourceTruth: source(`forecast-${index}`, {
        origin: 'estimated',
        confidence: 'medium',
        coverage: 'partial',
        observedAt: start,
        ...(overrides.forecastSource ?? {}),
      }),
      freshnessPolicyKey: 'vehicle_profile',
    },
    actual: {
      value: actualValue,
      unit,
      observedAt: end,
      sourceTruth: source(`actual-${index}`, { observedAt: end, ...(overrides.actualSource ?? {}) }),
      freshnessPolicyKey: 'vehicle_telemetry',
    },
    tripStartedAt: start,
    tripEndedAt: end,
    createdAt: end,
    qualityFlags: overrides.qualityFlags ?? [],
  };
}

async function main() {
  assert.strictEqual(config.DEFAULT_TRIP_LEARNING_PREFERENCES.enabled, false, 'Opt-in must default off.');
  assert.strictEqual(config.DEFAULT_TRIP_LEARNING_PREFERENCES.localOnly, true);
  assert.strictEqual(config.DEFAULT_TRIP_LEARNING_PREFERENCES.cloudSyncEnabled, false);
  assert.strictEqual(config.isTripLearningLocalFeatureEnabled(), false, 'Rollout must fail closed.');
  assert.strictEqual(config.isTripLearningLocalFeatureEnabled({ tripLearningLocalEnabled: true }), true);

  const driveRecords = [
    comparisonRecord('drive_time', 0, 1.2),
    comparisonRecord('drive_time', 1, 1.2),
    comparisonRecord('drive_time', 2, 1.2),
  ];
  const qualifiedDrive = engine.qualifyForecastActualRecords(driveRecords);
  assert.strictEqual(qualifiedDrive.accepted.length, 3, 'High-confidence drive-time actuals should qualify.');
  assert.strictEqual(qualifiedDrive.rejected.length, 0);

  const simulated = engine.qualifyForecastActualRecords([
    comparisonRecord('drive_time', 5, 1.2, {
      actualSource: { origin: 'simulated', confidence: 'low' },
      qualityFlags: ['simulated'],
    }),
  ]);
  assert.strictEqual(simulated.accepted.length, 0);
  assert.strictEqual(simulated.rejected[0].code, 'mocked_or_simulated');

  const defaultOnlyForecast = engine.qualifyForecastActualRecords([
    comparisonRecord('drive_time', 6, 1.2, {
      forecastSource: {
        confidence: 'low',
        coverage: 'unknown',
        availability: 'degraded',
        warningCodes: ['forecast_uses_defaults'],
      },
    }),
  ]);
  assert.strictEqual(defaultOnlyForecast.accepted.length, 0, 'Default-only forecasts must not teach calibration.');
  assert.strictEqual(defaultOnlyForecast.rejected[0].code, 'incomplete');

  const duplicate = engine.qualifyForecastActualRecords([
    driveRecords[0],
    { ...driveRecords[0], id: 'duplicate-id' },
  ]);
  assert.strictEqual(duplicate.accepted.length, 1);
  assert.strictEqual(duplicate.rejected[0].code, 'duplicate');

  const insufficient = engine.analyzeCalibrationSamples(qualifiedDrive.accepted.slice(0, 2));
  assert.strictEqual(insufficient.status, 'insufficient_samples');
  assert.strictEqual(insufficient.proposal, null);

  const driveAnalysis = engine.analyzeCalibrationSamples(qualifiedDrive.accepted);
  assert.strictEqual(driveAnalysis.status, 'ready');
  assert.strictEqual(driveAnalysis.proposal.sampleCount, 3);
  assert.strictEqual(driveAnalysis.proposal.proposedValue, 1.2);
  assert.strictEqual(driveAnalysis.proposal.canApply, true);
  assert.strictEqual(driveAnalysis.proposal.confidence, 'medium');

  const fuelRecords = [0.5, 0.8, 1.6, 1.9].map((ratio, index) =>
    comparisonRecord('fuel_consumption', index + 10, ratio));
  const fuelSamples = engine.qualifyForecastActualRecords(fuelRecords).accepted;
  const fuelAnalysis = engine.analyzeCalibrationSamples(fuelSamples);
  assert.strictEqual(fuelAnalysis.status, 'high_variance');
  assert.strictEqual(fuelAnalysis.proposal.canApply, false);
  assert.ok(fuelAnalysis.proposal.warnings.includes('high_variance'));

  const strongObservation = {
    id: 'coolant-1',
    tripId: 'trip-inspection',
    expeditionId: 'exp-inspection',
    kind: 'high_coolant_temperature',
    observedAt: iso(120),
    value: 235,
    unit: 'F',
    comparisonBaseline: null,
    severity: 'high',
    verified: true,
    evidenceLabel: 'Coolant temperature 235 F',
    sourceTruth: source('obd-coolant', { observedAt: iso(120) }),
    freshnessPolicyKey: 'vehicle_telemetry',
    qualityFlags: [],
  };
  const prompts = engine.buildPostTripInspectionPrompts([strongObservation], iso(120));
  assert.strictEqual(prompts.length, 1);
  assert.match(prompts[0].instruction, /inspect|verify|consider checking/i);
  assert.doesNotMatch(prompts[0].instruction, /diagnos|damage occurred|failure/i);
  const weakPrompts = engine.buildPostTripInspectionPrompts([{
    ...strongObservation,
    id: 'weak-coolant',
    sourceTruth: source('weak-source', { confidence: 'medium', observedAt: iso(120) }),
  }]);
  assert.strictEqual(weakPrompts.length, 0, 'Weak evidence must suppress inspection prompts.');

  const backend = new storeModule.MemoryTripLearningStorage();
  const localStore = storeModule.createTripLearningStore(backend);
  await localStore.hydrate();
  assert.strictEqual(localStore.getSnapshot().preferences.enabled, false);
  await localStore.updatePreferences({ enabled: true });
  const processResult = await localStore.processOutcome({ records: driveRecords, now: iso(3000) });
  assert.strictEqual(processResult.acceptedSamples.length, 3);
  const storedProposal = localStore.getSnapshot().proposals[0];
  assert.ok(storedProposal);

  const beforeDeniedApply = JSON.stringify(localStore.getSnapshot());
  assert.strictEqual(await localStore.applyProposal(storedProposal.id, false), null, 'Apply requires explicit confirmation.');
  assert.strictEqual(JSON.stringify(localStore.getSnapshot()), beforeDeniedApply, 'Denied apply must not mutate state.');
  const overlay = await localStore.applyProposal(storedProposal.id, true);
  assert.ok(overlay, 'Confirmed apply should create a local overlay.');
  assert.strictEqual(localStore.getSnapshot().calibrationOverlays.length, 1);

  const restoredStore = storeModule.createTripLearningStore(backend);
  await restoredStore.hydrate();
  assert.strictEqual(restoredStore.getSnapshot().preferences.enabled, true, 'Opt-in should persist offline.');
  assert.strictEqual(restoredStore.getSnapshot().calibrationOverlays.length, 1, 'Applied overlay should persist offline.');
  await restoredStore.revertProposal(storedProposal.id);
  assert.strictEqual(restoredStore.getSnapshot().calibrationOverlays.length, 0, 'Revert should restore the prior default.');
  assert.strictEqual(restoredStore.getSnapshot().proposals[0].status, 'reverted');

  const legacyBackend = new storeModule.MemoryTripLearningStorage(JSON.stringify({
    version: 0,
    preferences: { enabled: true, cloudSyncEnabled: true, localOnly: false },
    routeGeometry: [{ lat: 1, lng: 2 }],
    samples: [],
  }));
  const migratedStore = storeModule.createTripLearningStore(legacyBackend);
  await migratedStore.hydrate();
  assert.strictEqual(migratedStore.getSnapshot().preferences.cloudSyncEnabled, false);
  assert.strictEqual(migratedStore.getSnapshot().preferences.localOnly, true);
  assert.strictEqual(privacy.isTripLearningPayloadPrivacySafe(JSON.parse(legacyBackend.value)), true);
  assert.doesNotMatch(legacyBackend.value, /routeGeometry|\"lat\"|\"lng\"/);

  const unsafe = { ...driveRecords[0], rawProviderResponse: { token: 'secret-value' }, routeGeometry: [{ lat: 1, lng: 2 }] };
  assert.ok(privacy.findForbiddenTripLearningKeys(unsafe).some((key) => key.includes('rawProviderResponse')));
  assert.ok(privacy.findForbiddenTripLearningKeys(unsafe).some((key) => key.includes('routeGeometry')));
  const redacted = privacy.sanitizeForecastActualRecord(unsafe);
  assert.doesNotMatch(JSON.stringify(redacted), /rawProviderResponse|routeGeometry|secret-value/);
  const coordinateRedacted = privacy.sanitizeForecastActualRecord({
    ...driveRecords[0],
    forecast: {
      ...driveRecords[0].forecast,
      sourceTruth: source('forecast-with-coordinate', {
        authority: 'Private trace 34.12345,-117.98765',
        observedAt: driveRecords[0].forecast.observedAt,
      }),
    },
  });
  assert.doesNotMatch(JSON.stringify(coordinateRedacted), /34\.12345|-117\.98765/);

  const forecast = {
    routeMiles: 30,
    estimatedDriveHours: 2,
    routeDifficulty: 'moderate',
    routeIntelligenceId: 'route-1',
    computedAt: iso(0),
    hasRealData: true,
    fuel: { requiredGallons: 5 },
    power: { requiredHours: 4 },
  };
  const recorderTrip = {
    id: 'recorder-trip',
    expeditionId: 'exp-recorder',
    vehicleId: 'vehicle-1',
    startedAt: iso(0),
    endedAt: iso(120),
    durationSec: 7200,
    distanceMi: 30,
    totalPointsRecorded: 20,
    routePoints: Array.from({ length: 12 }, (_, index) => ({ lat: 1 + index / 100, lng: 2, timestamp: iso(index), cumulativeDistanceMi: index })),
    startResources: { fuelGal: 20 },
    endResources: { fuelGal: 15 },
    resourceSnapshots: [],
  };
  const baseline = adapters.buildTripLearningForecastBaseline(recorderTrip, forecast);
  assert.ok(baseline);
  assert.doesNotMatch(JSON.stringify(baseline), /routePoints|\"lat\"|\"lng\"/);
  const recorderRecords = adapters.buildForecastActualRecordsFromTripRecorder(recorderTrip, baseline);
  const recorderQualification = engine.qualifyForecastActualRecords(recorderRecords);
  assert.strictEqual(recorderQualification.accepted.filter((sample) => sample.metric === 'drive_time').length, 1);
  assert.ok(recorderQualification.rejected.some((item) => item.code === 'manual_actual_unverified'));
  const mismatchedRouteRecords = adapters.buildForecastActualRecordsFromTripRecorder(
    { ...recorderTrip, id: 'recorder-route-mismatch', distanceMi: 60 },
    { ...baseline, tripId: 'recorder-route-mismatch', id: 'baseline:recorder-route-mismatch' },
  );
  const mismatchedQualification = engine.qualifyForecastActualRecords(mismatchedRouteRecords);
  assert.strictEqual(
    mismatchedQualification.accepted.filter((sample) => sample.metric === 'drive_time').length,
    0,
    'A mismatched forecast route distance must fail closed.',
  );

  const expeditionObservations = adapters.buildTripExposureObservationsFromExpeditionTrip({
    id: 'expedition-trip',
    terrainRiskSnapshots: [{
      id: 'terrain-critical',
      capturedAt: iso(120),
      riskLevel: 'critical',
      summary: 'Critical terrain risk recorded',
      source: { source: 'route_terrain_analysis', quality: 'live', capturedAt: iso(120) },
    }],
    notableMoments: [],
  });
  assert.strictEqual(engine.buildPostTripInspectionPrompts(expeditionObservations).length, 1);

  const summarySource = fs.readFileSync(path.join(root, 'components', 'expedition', 'TripLearningSummaryCard.tsx'), 'utf8');
  const preferenceSource = fs.readFileSync(path.join(root, 'components', 'expedition', 'TripLearningPreferenceControl.tsx'), 'utf8');
  const profileSource = fs.readFileSync(path.join(root, 'components', 'ProfileSettingsPanel.tsx'), 'utf8');
  const expeditionTabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
  const localExportSource = fs.readFileSync(path.join(root, 'lib', 'localDataExport.ts'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(summarySource.includes('SourceTruthInspectorTrigger'));
  ['Review proposal', 'Apply', 'Dismiss', 'Revert'].forEach((copy) => assert.ok(summarySource.includes(copy)));
  assert.ok(preferenceSource.includes('<Switch'));
  assert.ok(profileSource.includes('<TripLearningPreferenceControl />'));
  assert.ok(expeditionTabSource.includes('<TripLearningSummaryCard trip={trip} />'));
  assert.ok(!localExportSource.includes('trip_learning'), 'Trip Learning must remain excluded from general local export.');
  assert.strictEqual(packageJson.scripts['test:trip-learning'], 'node ./scripts/test-trip-learning.js');

  console.log('Trip Learning local foundation checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
