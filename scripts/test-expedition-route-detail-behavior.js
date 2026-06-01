const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
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
const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');

function routeFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).route;
}

const normal = routeFor(fixtures.allSystemsNormalFixture);
assert.strictEqual(normal.status, 'normal');
assert.ok(normal.summary.toLowerCase().includes('viable'));
assert.ok(normal.why.join(' ').toLowerCase().includes('on course'));
assert.ok(normal.dataUsed.some((item) => item.id === 'off-route' && item.value === false));
assert.ok(normal.dataUsed.some((item) => item.id === 'camp-eta'));

const offRoute = routeFor({
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    offRoute: {
      ...fixtures.allSystemsNormalFixture.route.offRoute,
      value: true,
    },
    alternateRouteAvailable: {
      ...fixtures.allSystemsNormalFixture.route.alternateRouteAvailable,
      value: true,
    },
    alternateRouteLabel: {
      value: 'West service bypass',
      source: 'mock',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'high',
    },
  },
});
assert.strictEqual(offRoute.status, 'caution');
assert.ok(offRoute.why.join(' ').toLowerCase().includes('off route'));

const afterSunset = routeFor({
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    daylightRemainingAtEtaMinutes: {
      ...fixtures.allSystemsNormalFixture.route.daylightRemainingAtEtaMinutes,
      value: -15,
    },
  },
});
assert.strictEqual(afterSunset.status, 'critical');
assert.strictEqual(afterSunset.escalationRecommended, true);
assert.ok(afterSunset.why.join(' ').toLowerCase().includes('daylight'));

const difficult = routeFor({
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    upcomingDifficultTerrain: {
      ...fixtures.allSystemsNormalFixture.route.upcomingDifficultTerrain,
      value: true,
    },
    upcomingDifficultTerrainLabel: {
      value: 'Slow ledge section 4.8 miles ahead',
      source: 'mock',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'high',
    },
  },
});
assert.strictEqual(difficult.status, 'watch');
assert.ok(difficult.why.join(' ').toLowerCase().includes('difficult terrain'));
assert.ok(difficult.dataUsed.some((item) => item.id === 'difficult-terrain-label'));

const staleGps = routeFor({
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    currentLocation: {
      ...fixtures.allSystemsNormalFixture.route.currentLocation,
      isStale: true,
    },
  },
});
assert.strictEqual(staleGps.confidence, 'low');
assert.ok(staleGps.staleDataWarnings.some((item) => item.includes('Current location')));

const missingEta = routeFor({
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    estimatedArrivalIso: {
      value: null,
      source: 'unknown',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'low',
    },
  },
});
assert.strictEqual(missingEta.status, 'unknown');
assert.strictEqual(missingEta.confidence, 'low');
assert.ok(missingEta.missingDataWarnings.some((item) => item.includes('Estimated arrival')));

for (const action of [
  'Report route issue',
  'Mark obstacle',
  'Evaluate alternate route',
  'Set regroup checkpoint',
]) {
  assert.ok(normal.relatedActions.some((item) => item.label === action), `${action} related action should exist.`);
}

for (const text of [
  'Route Control',
  'On-route/off-route',
  'ETA vs plan',
  'Next checkpoint',
  'Camp ETA',
  'Daylight margin',
  'Upcoming difficult terrain',
  'Known hazards / route issues',
  'Alternate route options',
  'Last safe turnaround / exit',
  'Deviation impact',
  'buildRouteSystemSummary',
  "category === 'route'",
]) {
  assert.ok(detailViewSource.includes(text), `Route detail view should include ${text}.`);
}

console.log('Expedition route detail behavior checks passed.');
