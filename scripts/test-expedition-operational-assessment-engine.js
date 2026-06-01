const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');

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
  buildExpeditionOperationalAssessments,
  buildExpeditionOperationalAssessmentMap,
} = require(enginePath);
const {
  buildDashboardAssessmentContext,
} = require(path.join(root, 'lib', 'expedition', 'dashboardAssessmentContext.ts'));
const fixtures = require(fixturesPath);

const expectedCategories = ['overview', 'route', 'convoy', 'camp', 'logistics', 'vehicles'];

function assertAssessmentShape(context) {
  const assessments = buildExpeditionOperationalAssessments(context);
  assert.strictEqual(assessments.length, 6);
  assert.deepStrictEqual(assessments.map((item) => item.category), expectedCategories);
  for (const assessment of assessments) {
    assert.ok(assessment.id.startsWith('expedition-assessment-'));
    assert.ok(['normal', 'watch', 'caution', 'critical', 'unknown'].includes(assessment.status));
    assert.ok(['high', 'medium', 'low'].includes(assessment.confidence));
    assert.ok(assessment.title);
    assert.ok(assessment.summary);
    assert.ok(Array.isArray(assessment.why));
    assert.ok(Array.isArray(assessment.whatToWatch));
    assert.ok(assessment.recommendedAction);
    assert.ok(Array.isArray(assessment.toImproveStatus));
    assert.ok(Array.isArray(assessment.dataUsed));
    assert.ok(Array.isArray(assessment.staleDataWarnings));
    assert.ok(Array.isArray(assessment.missingDataWarnings));
    assert.ok(assessment.lastUpdated);
    if (assessment.missingDataWarnings.length > 0 || assessment.staleDataWarnings.length > 0 || assessment.status === 'unknown') {
      assert.notStrictEqual(
        assessment.confidence,
        'high',
        `${assessment.category} should not have high confidence with stale, missing, or unknown status.`,
      );
    }
  }
  return buildExpeditionOperationalAssessmentMap(context);
}

let map = assertAssessmentShape(fixtures.allSystemsNormalFixture);
for (const category of expectedCategories) {
  assert.strictEqual(map[category].status, 'normal', `${category} should be normal in all-systems-normal fixture.`);
  assert.strictEqual(map[category].confidence, 'high', `${category} should be high confidence when all key data is fresh.`);
}
assert.strictEqual(map.overview.escalationRecommended, false);

map = assertAssessmentShape(fixtures.campCloseToSunsetFixture);
assert.strictEqual(map.route.status, 'normal', 'Route should remain viable when route data is otherwise normal.');
assert.strictEqual(map.camp.status, 'caution', 'Camp should be caution when daylight at arrival is under 45 minutes.');
assert.strictEqual(map.overview.status, 'caution', 'Overview should roll camp caution upward.');
assert.ok(map.camp.why.some((item) => item.toLowerCase().includes('daylight')));

map = assertAssessmentShape(fixtures.convoyMemberOverdueFixture);
assert.strictEqual(map.convoy.status, 'critical', 'Overdue convoy member should be critical.');
assert.strictEqual(map.convoy.escalationRecommended, true);
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.overview.escalationRecommended);

map = assertAssessmentShape(fixtures.logisticsWaterLimitedFixture);
assert.strictEqual(map.logistics.status, 'caution', 'Water-limited logistics should be caution.');
assert.ok(map.logistics.why.some((item) => item.toLowerCase().includes('water')));
assert.strictEqual(map.overview.status, 'caution');

map = assertAssessmentShape(buildDashboardAssessmentContext({
  route: {
    hasActiveRoute: true,
    routeName: 'Manual fuel and water route',
    distanceRemainingMiles: 42,
    etaMinutes: 120,
  },
  vehicle: {
    vehicleId: 'manual-vehicle',
    label: 'Manual vehicle',
    readinessStatus: 'normal',
    fuelGallons: 18,
    fuelTankCapacityGal: 20,
    estimatedMpg: 15,
    fuelSource: 'userManual',
    waterGallons: 8,
    waterSource: 'userManual',
  },
  convoy: {
    teamMemberCount: 2,
    activeMemberCount: 2,
    communicationsStatus: 'online',
  },
}));
assert.strictEqual(
  map.route.status,
  'normal',
  'Dashboard active route context with ETA and no off-route signal should resolve as on-route instead of unknown.',
);
assert.notStrictEqual(
  map.logistics.status,
  'unknown',
  'Manual fuel and water should be enough for logistics even when food is not entered.',
);
assert.ok(
  !map.logistics.missingDataWarnings.some((item) => item.toLowerCase().includes('food')),
  'Food should remain optional and should not create a missing-data warning by default.',
);
assert.ok(
  map.logistics.dataUsed.some((item) => item.id === 'fuel-range' && item.source === 'userManual' && item.value !== null),
  'Manual fuel should be visible in logistics data used.',
);
assert.ok(
  map.logistics.dataUsed.some((item) => item.id === 'water-remaining' && item.source === 'userManual' && item.value !== null),
  'Manual water should be visible in logistics data used.',
);

map = assertAssessmentShape(buildDashboardAssessmentContext({
  route: {
    hasActiveRoute: true,
    routeName: 'Manual gallons route',
    distanceRemainingMiles: 42,
    etaMinutes: 120,
  },
  vehicle: {
    vehicleId: 'manual-gallons-vehicle',
    label: 'Manual gallons vehicle',
    readinessStatus: 'normal',
    fuelGallons: 32,
    fuelTankCapacityGal: 32,
    fuelSource: 'userManual',
    waterGallons: 14,
    waterSource: 'userManual',
  },
  convoy: {
    teamMemberCount: 1,
    activeMemberCount: 1,
    communicationsStatus: 'online',
  },
}));
assert.strictEqual(
  map.camp.status,
  'caution',
  'Active route with ETA but no confirmed camp should keep Camp review available as caution instead of unknown.',
);
assert.ok(
  !map.camp.why.some((item) => /missing camp availability or eta/i.test(item)),
  'Camp review should not claim availability or ETA is missing when active guidance supplies route timing.',
);
assert.notStrictEqual(
  map.logistics.status,
  'unknown',
  'Manual fuel gallons and water gallons should satisfy logistics fuel/water data even without MPG-derived range.',
);
assert.ok(
  !map.logistics.why.some((item) => /missing fuel|missing water|missing fuel and water/i.test(item)),
  'Manual gallons should not produce missing fuel or water assessment copy.',
);
assert.ok(
  !map.logistics.missingDataWarnings.some((item) => /fuel|water/i.test(item)),
  'Manual gallons should not produce missing fuel or water data warnings.',
);
assert.ok(
  map.logistics.dataUsed.some((item) => item.id === 'fuel-remaining' && item.source === 'userManual' && item.value === 32),
  'Manual fuel gallons should be visible in logistics data used.',
);
assert.ok(
  map.logistics.dataUsed.some((item) => item.id === 'water-remaining' && item.source === 'userManual' && item.value === 53),
  'Manual 14 gallons of water should be converted to about 53 liters in logistics data used.',
);

map = assertAssessmentShape(buildDashboardAssessmentContext({
  route: {
    hasActiveRoute: true,
    routeName: 'Live fuel and water route',
    distanceRemainingMiles: 42,
    etaMinutes: 120,
  },
  vehicle: {
    vehicleId: 'live-resource-vehicle',
    label: 'Live resource vehicle',
    readinessStatus: 'normal',
    fuelLevelPercent: 64,
    fuelTankCapacityGal: 32,
    fuelSource: 'vehicleObd',
    waterGallons: 14,
    waterSource: 'vehicleObd',
  },
  convoy: {
    teamMemberCount: 1,
    activeMemberCount: 1,
    communicationsStatus: 'online',
  },
}));
assert.notStrictEqual(
  map.logistics.status,
  'unknown',
  'Live OBD2 fuel level and connected water sensor data should satisfy logistics fuel/water data.',
);
assert.ok(
  map.logistics.dataUsed.some((item) => item.id === 'fuel-level-percent' && item.source === 'vehicleObd' && item.value === 64),
  'Live OBD2 fuel percent should be visible in logistics data used.',
);
assert.ok(
  !map.logistics.why.some((item) => /missing fuel|missing water|missing fuel and water/i.test(item)),
  'Live fuel/water sources should not produce missing fuel or water assessment copy.',
);

map = assertAssessmentShape(fixtures.vehicleDisabledFixture);
assert.strictEqual(map.vehicles.status, 'critical', 'Disabled vehicle should be critical.');
assert.strictEqual(map.vehicles.escalationRecommended, true);
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.vehicles.why.some((item) => item.toLowerCase().includes('disabled')));

map = assertAssessmentShape(fixtures.multipleDegradedSystemsFixture);
assert.ok(['caution', 'critical'].includes(map.overview.status));
assert.strictEqual(map.route.status, 'caution');
assert.strictEqual(map.convoy.status, 'caution');
assert.strictEqual(map.logistics.status, 'critical');
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.overview.why[0].includes('Top concern'));

map = assertAssessmentShape(fixtures.missingDataFixture);
for (const category of expectedCategories) {
  assert.strictEqual(map[category].confidence, 'low', `${category} should be low confidence with missing critical data.`);
}
assert.strictEqual(map.route.status, 'unknown');
assert.strictEqual(map.convoy.status, 'unknown');
assert.strictEqual(map.camp.status, 'unknown');
assert.strictEqual(map.logistics.status, 'unknown');
assert.strictEqual(map.vehicles.status, 'unknown');
assert.strictEqual(map.overview.status, 'unknown');
assert.ok(map.route.missingDataWarnings.length > 0);
assert.ok(map.route.staleDataWarnings.length > 0);
assert.ok(map.route.dataUsed.some((item) => item.isMissing));
assert.ok(map.route.dataUsed.some((item) => item.isStale));

console.log('Expedition operational assessment engine checks passed.');
