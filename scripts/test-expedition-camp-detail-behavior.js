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

function campFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).camp;
}

function withCamp(campPatch) {
  return {
    ...fixtures.allSystemsNormalFixture,
    camp: {
      ...fixtures.allSystemsNormalFixture.camp,
      ...campPatch,
    },
  };
}

const normal = campFor(fixtures.allSystemsNormalFixture);
assert.strictEqual(normal.status, 'normal', 'Camp arrival before sunset should be normal.');
assert.ok(normal.summary.toLowerCase().includes('camp plan'));
assert.ok(normal.dataUsed.some((item) => item.id === 'planned-camp-status'));
assert.ok(normal.dataUsed.some((item) => item.id === 'overnight-water-ready' && item.value === true));

const closeToSunset = campFor(withCamp({
  daylightRemainingAtArrivalMinutes: dp(70),
  alternateCampImprovesDaylightMargin: dp(false),
}));
assert.strictEqual(closeToSunset.status, 'watch', 'Arrival close to sunset should be watch.');
assert.ok(closeToSunset.why.join(' ').toLowerCase().includes('daylight'));

const afterSunset = campFor(withCamp({
  daylightRemainingAtArrivalMinutes: dp(-23),
  arrivalBeforeDark: dp(false),
  safeSetupBeforeDark: dp(true),
}));
assert.strictEqual(afterSunset.status, 'caution', 'Arrival after sunset should be caution when camp itself is not unsafe.');
assert.ok(afterSunset.why.join(' ').toLowerCase().includes('sunset') || afterSunset.why.join(' ').toLowerCase().includes('daylight'));

const unsafeCamp = campFor(withCamp({
  campSafetyStatus: dp('unsafe'),
  plannedCampStatus: dp('unsafe'),
  knownCampHazards: dp(['flooded wash']),
}));
assert.strictEqual(unsafeCamp.status, 'critical', 'Unsafe camp should be critical.');
assert.strictEqual(unsafeCamp.escalationRecommended, true);
assert.ok(unsafeCamp.recommendedAction.includes('Incident & Recovery'));

const alternateImproves = campFor(withCamp({
  daylightRemainingAtArrivalMinutes: dp(30),
  alternateCampAvailable: dp(true),
  alternateCampLabel: dp('Alternate Camp 1'),
  alternateCampImprovesDaylightMargin: dp(true),
}));
assert.strictEqual(alternateImproves.status, 'watch', 'A daylight-improving alternate should reduce tight arrival from caution to watch.');
assert.ok(alternateImproves.why.join(' ').toLowerCase().includes('alternate camp improves'));
assert.ok(alternateImproves.dataUsed.some((item) => item.id === 'alternate-camp-label' && item.value === 'Alternate Camp 1'));

const missingWeatherCampData = campFor(withCamp({
  campConfirmed: missingDp(),
  weatherExposure: missingDp(),
}));
assert.notStrictEqual(missingWeatherCampData.confidence, 'high', 'Missing weather/camp data should lower confidence.');
assert.ok(missingWeatherCampData.missingDataWarnings.some((item) => item.includes('Camp confirmed')));
assert.ok(missingWeatherCampData.missingDataWarnings.some((item) => item.includes('Camp weather exposure')));

for (const action of [
  'Confirm camp safe',
  'Evaluate alternate camp',
  'Mark camp unsafe',
  'Start camp setup checklist',
  'Notify convoy',
  'Open Incident & Recovery',
]) {
  assert.ok(normal.relatedActions.some((item) => item.label === action), `${action} related action should exist.`);
}

for (const text of [
  'Camp Readiness',
  'Planned camp status',
  'ETA to camp',
  'Sunset/daylight margin',
  'Arrival before/after dark',
  'Weather risk',
  'Wind / temperature / precipitation',
  'Route difficulty remaining before camp',
  'Convoy arrival confidence',
  'Camp confirmation status',
  'Alternate camp options',
  'Fuel/water/power readiness for overnight',
  'Recommended action',
  'buildCampSystemSummary',
  "category === 'camp'",
]) {
  assert.ok(detailViewSource.includes(text), `Camp detail view should include ${text}.`);
}

console.log('Expedition camp detail behavior checks passed.');
