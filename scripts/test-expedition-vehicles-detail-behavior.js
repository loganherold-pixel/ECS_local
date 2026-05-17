const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const storePath = path.join(root, 'stores', 'expeditionAssessmentStore.ts');
const detailViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const fixtures = require(fixturesPath);
const {
  expeditionAssessmentStore,
  getExpeditionAssessmentStoreSnapshot,
} = require(storePath);
const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');

function dp(value, options = {}) {
  return {
    value,
    source: options.source || 'mock',
    updatedAt: options.updatedAt || fixtures.allSystemsNormalFixture.capturedAt,
    confidence: options.confidence || 'high',
    reliability: options.confidence || 'high',
    isStale: options.isStale,
  };
}

function vehiclesFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).vehicles;
}

function withVehicles(vehiclesPatch, routePatch = {}) {
  return {
    ...fixtures.allSystemsNormalFixture,
    route: {
      ...fixtures.allSystemsNormalFixture.route,
      ...routePatch,
    },
    vehicles: vehiclesPatch,
  };
}

async function main() {
  const normal = vehiclesFor(fixtures.allSystemsNormalFixture);
  assert.strictEqual(normal.status, 'normal', 'All vehicles ready should be normal.');
  assert.ok(normal.dataUsed.some((item) => item.id === 'vehicle-list' && String(item.value).includes('Lead Tacoma')));
  assert.ok(normal.dataUsed.some((item) => item.id === 'limiting-vehicle' && String(item.value).includes('ready')));

  const oneWatch = vehiclesFor(withVehicles([
    fixtures.allSystemsNormalFixture.vehicles[0],
    {
      ...fixtures.allSystemsNormalFixture.vehicles[1],
      engineStatus: dp('warning'),
      readinessStatus: dp('watch'),
    },
  ]));
  assert.strictEqual(oneWatch.status, 'watch', 'One watch vehicle should roll Vehicles to watch.');
  assert.ok(oneWatch.why.join(' ').toLowerCase().includes('warning') || oneWatch.why.join(' ').toLowerCase().includes('watch'));
  assert.ok(oneWatch.dataUsed.some((item) => item.id === 'limiting-vehicle' && String(item.value).includes('Sweep 4Runner')));

  const disabled = vehiclesFor(fixtures.vehicleDisabledFixture);
  assert.strictEqual(disabled.status, 'critical', 'Disabled vehicle should be critical.');
  assert.strictEqual(disabled.escalationRecommended, true);
  assert.ok(disabled.recommendedAction.toLowerCase().includes('stop movement'));

  const tireBeforeDifficultTerrain = vehiclesFor(withVehicles([
    fixtures.allSystemsNormalFixture.vehicles[0],
    {
      ...fixtures.allSystemsNormalFixture.vehicles[1],
      tirePressureStatus: dp('low'),
      readinessStatus: dp('caution'),
    },
  ], {
    upcomingDifficultTerrain: dp(true),
    upcomingDifficultTerrainLabel: dp('Rocky ledge section ahead'),
  }));
  assert.strictEqual(tireBeforeDifficultTerrain.status, 'critical', 'Low tire before difficult terrain should be critical.');
  assert.ok(tireBeforeDifficultTerrain.why.join(' ').toLowerCase().includes('difficult terrain'));

  const missing = vehiclesFor({
    ...fixtures.allSystemsNormalFixture,
    vehicles: [],
  });
  assert.strictEqual(missing.status, 'unknown', 'Missing vehicle data should produce unknown status.');
  assert.strictEqual(missing.confidence, 'low');
  assert.ok(missing.missingDataWarnings.some((item) => item.includes('Vehicle list')));

  expeditionAssessmentStore.reset();
  expeditionAssessmentStore.setContextProvider(() => withVehicles([
    {
      ...fixtures.allSystemsNormalFixture.vehicles[0],
      readinessStatus: dp('caution'),
      tirePressureStatus: dp('low'),
      manualIssueReports: dp(['slow leak']),
    },
  ]));
  await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(getExpeditionAssessmentStoreSnapshot().assessments.vehicles.status, 'caution');
  await expeditionAssessmentStore.updateManualVehicleStatus({
    vehicleId: 'vehicle-1',
    readinessStatus: 'normal',
    disabled: false,
    tirePressureStatus: 'normal',
    manualIssueReports: [],
    activeMechanicalIssue: '',
    recoveryEquipmentReady: true,
    spareTireReady: true,
  });
  const improved = getExpeditionAssessmentStoreSnapshot().assessments.vehicles;
  assert.strictEqual(improved.status, 'normal', 'Manual vehicle update should improve status.');
  assert.ok(
    improved.dataUsed.some((item) => item.id === 'vehicle-1-tires' && item.source === 'userManual'),
    'Manual tire update should be represented as userManual data.',
  );

  for (const action of [
    'Mark vehicle OK',
    'Report mechanical issue',
    'Update fuel',
    'Update tire status',
    'Inspect vehicle',
    'Start recovery workflow',
    'Open Incident & Recovery',
  ]) {
    assert.ok(normal.relatedActions.some((item) => item.label === action), `${action} related action should exist.`);
  }

  for (const text of [
    'Vehicle Readiness',
    'Vehicle list',
    'Callsign/name/driver',
    'Vehicle readiness',
    'Fuel/range per vehicle',
    'Tire status',
    'Battery/voltage',
    'Engine/temp/fault data',
    'Manual issue reports',
    'Recovery gear status',
    'Spare tire status',
    'Limiting vehicle',
    'Recommended action',
    'buildVehiclesSystemSummary',
    "category === 'vehicles'",
  ]) {
    assert.ok(detailViewSource.includes(text), `Vehicles detail view should include ${text}.`);
  }

  console.log('Expedition vehicles detail behavior checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
