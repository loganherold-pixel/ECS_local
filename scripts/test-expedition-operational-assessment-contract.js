const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const contractPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentTypes.ts');
const expeditionTypesPath = path.join(root, 'lib', 'types', 'expedition.ts');

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

const contractSource = fs.readFileSync(contractPath, 'utf8');
const expeditionTypesSource = fs.readFileSync(expeditionTypesPath, 'utf8');
const contract = require(contractPath);

assert.deepStrictEqual(contract.ASSESSMENT_CATEGORIES, [
  'overview',
  'route',
  'convoy',
  'camp',
  'logistics',
  'vehicles',
]);

for (const category of contract.ASSESSMENT_CATEGORIES) {
  assert.strictEqual(contract.isAssessmentCategory(category), true, `${category} should be a supported category.`);
}
assert.strictEqual(contract.isAssessmentCategory('highway'), false);

assert.deepStrictEqual(contract.ASSESSMENT_STATUSES, [
  'normal',
  'watch',
  'caution',
  'critical',
  'unknown',
]);

for (const status of contract.ASSESSMENT_STATUSES) {
  assert.strictEqual(contract.isAssessmentStatus(status), true, `${status} should be a supported status.`);
}
assert.strictEqual(contract.isAssessmentStatus('clear'), false);

assert.deepStrictEqual(contract.ASSESSMENT_CONFIDENCE_LEVELS, ['high', 'medium', 'low']);
assert.ok(contract.EXPEDITION_DATA_SOURCES.includes('userManual'), 'Manual data source must be supported.');
assert.strictEqual(contract.isManualExpeditionDataSource('userManual'), true);
assert.strictEqual(contract.isManualExpeditionDataSource('liveGps'), false);

const missingDataAssessment = {
  id: 'assessment-route-missing-location',
  category: 'route',
  status: 'unknown',
  title: 'Route status unknown',
  summary: 'ECS needs a current location before route confidence can be assessed.',
  why: ['Current location is missing.'],
  whatToWatch: ['Route drift and stale navigation context.'],
  recommendedAction: 'Capture current location or enter it manually.',
  toImproveStatus: ['Enable GPS or add a manual location note.'],
  confidence: 'low',
  dataUsed: [
    {
      id: 'current-location',
      label: 'Current location',
      value: null,
      source: 'unknown',
      confidence: 'low',
      reliability: 'unknown',
      isMissing: true,
    },
  ],
  staleDataWarnings: [],
  missingDataWarnings: ['Current location is unavailable.'],
  lastUpdated: '2026-04-28T12:00:00.000Z',
  escalationRecommended: false,
  escalationReason: null,
  relatedActions: [],
};

assert.strictEqual(missingDataAssessment.status, 'unknown');
assert.ok(missingDataAssessment.dataUsed.some((item) => item.isMissing));
assert.ok(missingDataAssessment.missingDataWarnings.length > 0);

const staleDataAssessment = {
  ...missingDataAssessment,
  id: 'assessment-vehicles-stale-obd',
  category: 'vehicles',
  status: 'watch',
  title: 'Vehicle data is stale',
  dataUsed: [
    {
      id: 'last-telemetry',
      label: 'Last OBD telemetry',
      value: '2026-04-28T09:00:00.000Z',
      source: 'vehicleObd',
      updatedAt: '2026-04-28T09:00:00.000Z',
      confidence: 'medium',
      reliability: 'medium',
      isStale: true,
    },
  ],
  staleDataWarnings: ['Vehicle telemetry is older than the expected freshness window.'],
  missingDataWarnings: [],
};

assert.strictEqual(staleDataAssessment.category, 'vehicles');
assert.ok(staleDataAssessment.dataUsed.some((item) => item.isStale));
assert.ok(staleDataAssessment.staleDataWarnings.length > 0);

const manualRouteSnapshot = {
  routeName: {
    value: 'Manual desert bypass',
    source: 'userManual',
    updatedAt: '2026-04-28T12:05:00.000Z',
    confidence: 'medium',
    reliability: 'medium',
  },
  currentLocation: {
    value: {
      latitude: 35.1,
      longitude: -115.2,
      accuracyMeters: null,
    },
    source: 'userManual',
    updatedAt: '2026-04-28T12:05:00.000Z',
    confidence: 'medium',
    reliability: 'medium',
  },
};

const contextSnapshot = {
  expeditionId: 'expedition-1',
  capturedAt: '2026-04-28T12:05:00.000Z',
  offlineMode: true,
  manualInputAvailable: true,
  route: manualRouteSnapshot,
  convoy: {
    teamMemberCount: {
      value: 1,
      source: 'userManual',
      updatedAt: '2026-04-28T12:05:00.000Z',
      confidence: 'medium',
    },
  },
};

assert.strictEqual(contextSnapshot.route.routeName.source, 'userManual');
assert.strictEqual(contextSnapshot.manualInputAvailable, true);
assert.strictEqual(contextSnapshot.offlineMode, true);

for (const exportedName of [
  'AssessmentCategory',
  'AssessmentStatus',
  'AssessmentConfidence',
  'ExpeditionAssessment',
  'ExpeditionRouteSnapshot',
  'ConvoySnapshot',
  'CampSnapshot',
  'LogisticsSnapshot',
  'VehicleSnapshot',
  'ExpeditionContextSnapshot',
]) {
  assert.ok(
    expeditionTypesSource.includes(exportedName),
    `Expedition type entry point should re-export ${exportedName}.`,
  );
}

assert.ok(
  contractSource.includes('Deterministic assessment logic owns the safety/status decision') &&
    contractSource.includes('AI or narrative') &&
    contractSource.includes('must stay grounded') &&
    contractSource.includes('dataUsed'),
  'Contract must document deterministic status ownership and grounded AI narrative behavior.',
);

console.log('Expedition operational assessment contract checks passed.');
