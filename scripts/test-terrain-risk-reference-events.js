const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const referenceEvents = loadTsModule('lib/terrainRiskReferenceEvents.ts');
const sideProfileSource = read('components/dashboard/TerrainRiskSideProfile.tsx');
const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');
const dashboardSource = read('app/(tabs)/dashboard.tsx');

const profile = [
  { distanceMiles: 1.0, elevationFeet: 6200, riskScore: 24, riskLevel: 'low', gradePercent: 2 },
  { distanceMiles: 1.6, elevationFeet: 7100, riskScore: 84, riskLevel: 'high', gradePercent: 13, hazardKinds: ['steep_grade'] },
  { distanceMiles: 2.4, elevationFeet: 7350, riskScore: 72, riskLevel: 'high', gradePercent: 7, hazardKinds: ['washout_watch'] },
];

const wetWeather = {
  status: { kind: 'live' },
  current: {
    condition: 'Rain',
    precipChance: 70,
    precipType: 'rain',
    windSpeed: 12,
  },
};

const events = referenceEvents.buildTerrainRiskReferenceEvents({
  profile,
  completedDistanceMiles: 1.0,
  totalDistanceMiles: 3,
  weatherSnapshot: wetWeather,
});

assert.strictEqual(events.length, 2, 'Only high/reference terrain points ahead of progress should become events.');
assert.strictEqual(events[0].riskType, 'steep_grade');
assert.strictEqual(events[0].distanceAheadMiles, 0.6);
assert.strictEqual(events[0].elevationFeet, 7100);
assert.strictEqual(events[0].gradePercent, 13);
assert.strictEqual(events[0].hazardKind, 'steep_grade');
assert.ok(events[0].weatherInfluence.detail.includes('wet terrain risk from route weather signal'), 'Wet route weather should contribute honest traction copy.');
assert.ok(events[0].fieldGuidance.some((line) => /slow before grade/i.test(line)), 'Steep grade guidance should be field-actionable.');

const dryMissingWeatherEvents = referenceEvents.buildTerrainRiskReferenceEvents({
  profile,
  completedDistanceMiles: 1.0,
  totalDistanceMiles: 3,
  weatherSnapshot: null,
});
assert.ok(
  dryMissingWeatherEvents[0].weatherInfluence.detail.includes('Weather unavailable'),
  'Missing weather should be explicit instead of inventing point conditions.',
);

const upcoming = referenceEvents.selectUpcomingTerrainRiskBannerEvent(events, {
  proximityMiles: 0.75,
});
assert(upcoming, 'Upcoming risk inside proximity threshold should be selected for ECS Intelligence.');
assert.strictEqual(upcoming.banner.title, 'Steep grade 0.6 mi ahead');
assert.strictEqual(upcoming.banner.detail, '13% grade | wet terrain risk from route weather signal');

const tooFar = referenceEvents.selectUpcomingTerrainRiskBannerEvent(events, {
  proximityMiles: 0.25,
});
assert.strictEqual(tooFar, null, 'Too-distant terrain events should not show in the upper banner.');

const passed = referenceEvents.selectUpcomingTerrainRiskBannerEvent(
  referenceEvents.buildTerrainRiskReferenceEvents({
    profile,
    completedDistanceMiles: 1.9,
    totalDistanceMiles: 3,
    weatherSnapshot: wetWeather,
  }),
  { proximityMiles: 1 },
);
assert.strictEqual(
  passed?.id.includes('1.6'),
  false,
  'Passed events should not keep firing after route progress moves beyond them.',
);

assert(
  sideProfileSource.includes('onReferencePointPress?:') &&
    sideProfileSource.includes('onReferencePointPress?.('),
  'TerrainRiskSideProfile should report tapped reference dots upward.',
);
assert(
  widgetRenderersSource.includes('Why ECS flagged this point') &&
    widgetRenderersSource.includes('onTerrainRiskReferenceEvent'),
  'Expanded Terrain Risk widget should show a polished explanation and report events through render options.',
);
assert(
  dashboardSource.includes('selectUpcomingTerrainRiskBannerEvent') &&
    dashboardSource.includes("source: 'terrain_risk_reference'"),
  'Dashboard ECS Intelligence lane should select upcoming terrain risk events from widget output.',
);

console.log('[terrain-risk-reference-events] event creation, weather copy, callback wiring, and banner selection checks passed');
