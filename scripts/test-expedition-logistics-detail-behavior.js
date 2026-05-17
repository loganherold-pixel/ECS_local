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

function missingDp() {
  return {
    value: null,
    source: 'unknown',
    updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
    confidence: 'low',
    reliability: 'low',
  };
}

function logisticsFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).logistics;
}

function withLogistics(logisticsPatch, vehiclePatch) {
  return {
    ...fixtures.allSystemsNormalFixture,
    logistics: {
      ...fixtures.allSystemsNormalFixture.logistics,
      ...logisticsPatch,
    },
    vehicles: vehiclePatch ?? fixtures.allSystemsNormalFixture.vehicles,
  };
}

async function main() {
  const normal = logisticsFor(fixtures.allSystemsNormalFixture);
  assert.strictEqual(normal.status, 'normal', 'All resources normal should be normal.');
  assert.ok(normal.summary.toLowerCase().includes('reserves'));
  assert.ok(normal.dataUsed.some((item) => item.id === 'fuel-status-by-vehicle' && String(item.value).includes('Lead Tacoma')));
  assert.ok(normal.dataUsed.some((item) => item.id === 'lowest-fuel-range-vehicle' && String(item.value).includes('Sweep 4Runner')));
  assert.ok(normal.dataUsed.some((item) => item.id === 'water-per-person'));

  const waterWatch = logisticsFor(withLogistics({
    waterRemainingLiters: dp(16),
    waterEnduranceDays: dp(1.4),
    groupSize: dp(3),
    limitingResource: dp('water'),
  }));
  assert.strictEqual(waterWatch.status, 'watch', 'Water-limited but usable state should be watch.');
  assert.ok(waterWatch.why.join(' ').toLowerCase().includes('water'));
  assert.ok(waterWatch.dataUsed.some((item) => item.id === 'limiting-resource' && item.value === 'water'));

  const fuelCaution = logisticsFor(withLogistics({
    fuelRangeMiles: dp(50),
    distanceRemainingMiles: dp(45),
    fuelReserveToNextCheckpointMiles: dp(12),
    limitingResource: dp('fuel'),
  }));
  assert.strictEqual(fuelCaution.status, 'caution', 'Low fuel reserve should be caution.');
  assert.ok(fuelCaution.why.join(' ').toLowerCase().includes('fuel'));

  const powerCritical = logisticsFor(withLogistics({
    powerHoursRemaining: dp(1),
    batteryPowerStatus: dp('critical'),
    limitingResource: dp('power'),
  }));
  assert.strictEqual(powerCritical.status, 'critical', 'Power below two hours should be critical.');
  assert.strictEqual(powerCritical.escalationRecommended, true);

  const missingManual = logisticsFor(withLogistics({
    fuelRangeMiles: missingDp(),
    waterRemainingLiters: missingDp(),
    foodDaysRemaining: missingDp(),
  }));
  assert.strictEqual(missingManual.status, 'unknown', 'Missing manual logistics data should produce unknown status.');
  assert.strictEqual(missingManual.confidence, 'low');
  assert.ok(missingManual.missingDataWarnings.some((item) => item.includes('Fuel range miles')));
  assert.ok(missingManual.missingDataWarnings.some((item) => item.includes('Water remaining liters')));

  expeditionAssessmentStore.reset();
  expeditionAssessmentStore.setContextProvider(() => withLogistics({
    waterRemainingLiters: dp(7),
    waterEnduranceDays: dp(0.4),
    groupSize: dp(3),
    limitingResource: dp('water'),
  }));
  await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(getExpeditionAssessmentStoreSnapshot().assessments.logistics.status, 'critical');
  await expeditionAssessmentStore.updateManualLogisticsData({
    fuelRangeMiles: 280,
    distanceRemainingMiles: 42,
    waterRemainingLiters: 42,
    waterEnduranceDays: 3.5,
    foodDaysRemaining: 5,
    powerHoursRemaining: 40,
    limitingResource: 'none',
    lastResupplyCompletedAt: '2026-04-28T18:10:00.000Z',
    criticalSupplyWarnings: [],
    supplyStatus: 'normal',
  });
  const resupplied = getExpeditionAssessmentStoreSnapshot().assessments.logistics;
  assert.strictEqual(resupplied.status, 'normal', 'Resupply update should improve logistics status.');
  assert.ok(
    resupplied.dataUsed.some((item) => item.id === 'last-resupply-completed' && item.source === 'userManual'),
    'Manual resupply update should be represented as userManual data.',
  );

  for (const action of [
    'Update fuel',
    'Update water',
    'Update food',
    'Update battery/power',
    'Rebalance supplies between vehicles',
    'Mark resupply complete',
    'Generate resupply plan',
    'Open Incident & Recovery',
  ]) {
    assert.ok(normal.relatedActions.some((item) => item.label === action), `${action} related action should exist.`);
  }

  for (const text of [
    'Logistics Endurance',
    'Fuel status by vehicle',
    'Lowest fuel/range vehicle',
    'Fuel reserve to next checkpoint/camp/resupply',
    'Water remaining',
    'Water per person',
    'Water endurance',
    'Food endurance',
    'Power/battery endurance',
    'Critical equipment status',
    'Distance/time to next resupply',
    'Limiting resource',
    'Recommended action',
    'buildLogisticsSystemSummary',
    "category === 'logistics'",
  ]) {
    assert.ok(detailViewSource.includes(text), `Logistics detail view should include ${text}.`);
  }

  console.log('Expedition logistics detail behavior checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
