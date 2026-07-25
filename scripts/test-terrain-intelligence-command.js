const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const model = loadTsModule('lib/terrainIntelligenceCommandModel.ts');

const profile = Array.from({ length: 21 }, (_, index) => ({
  distanceMiles: index * 0.5,
  elevationFeet: 4000 + index * 75,
  gradePercent: index % 4 === 0 ? 10 : 3,
  riskScore: index >= 8 && index <= 10 ? 78 : 24,
  riskLevel: index >= 8 && index <= 10 ? 'high' : 'low',
  hazardKinds: index === 8 ? ['steep_grade'] : [],
}));
const snapshot = {
  expandedProfile: profile,
  currentProgressDistanceMiles: 3,
  riskSegments: [{
    id: 'risk-1',
    startDistanceMiles: 4,
    endDistanceMiles: 5,
    riskScore: 78,
    riskLevel: 'high',
    gradePercent: 10,
    reasonCodes: ['steep_grade'],
    confidence: 'high',
    signalKind: 'terrain',
  }],
};

const nextOne = model.buildTerrainCommandVisibleProfile(snapshot, 'next_1_mi');
assert.strictEqual(nextOne.startDistanceMiles, 3);
assert.strictEqual(nextOne.endDistanceMiles, 4);
assert(nextOne.profile.length >= 2);
const nextFive = model.buildTerrainCommandVisibleProfile(snapshot, 'next_5_mi');
assert.strictEqual(nextFive.endDistanceMiles, 8);
const full = model.buildTerrainCommandVisibleProfile(snapshot, 'full_route');
assert.strictEqual(full.startDistanceMiles, 0);
assert.strictEqual(full.endDistanceMiles, 10);
assert.strictEqual(
  model.buildTerrainCommandVisibleProfile({ ...snapshot, currentProgressDistanceMiles: 0 }, 'next_1_mi').startDistanceMiles,
  0,
);
assert.strictEqual(
  model.buildTerrainCommandVisibleProfile({ ...snapshot, currentProgressDistanceMiles: 10 }, 'next_1_mi').endDistanceMiles,
  10,
);

assert.strictEqual(model.selectTerrainCommandRiskSegment(snapshot.riskSegments, 4.5).id, 'risk-1');
assert.strictEqual(model.selectTerrainCommandRiskSegment(snapshot.riskSegments, 2), null);
assert.deepStrictEqual(model.resolveTerrainCommandInteractionPolicy(true), {
  autoFollowForced: true,
  scrubbingEnabled: false,
  rangeControlsEnabled: false,
  emphasizeOnlyNextEvent: true,
  reducedMotion: true,
});
assert.strictEqual(model.resolveTerrainCommandInteractionPolicy(false).scrubbingEnabled, true);

const coordinate = model.projectTerrainInspectionCoordinate([
  { lat: 39, lng: -120 },
  { lat: 39.1, lng: -120.1 },
  { lat: 39.2, lng: -120.2 },
], 5);
assert(coordinate && coordinate.lat > 39 && coordinate.lat < 39.2);

const hudSource = fs.readFileSync(path.join(root, 'components/dashboard/TerrainIntelligenceCommand.tsx'), 'utf8');
const graphSource = fs.readFileSync(path.join(root, 'components/dashboard/TerrainRiskSideProfile.tsx'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');

for (const fragment of [
  'TERRAIN INTELLIGENCE COMMAND',
  'CURRENT ELEVATION',
  'GRADE AHEAD',
  'PREDICTIVE SIDE SLOPE',
  'NEXT 1 MI',
  'NEXT 5 MI',
  'FULL ROUTE',
  'terrain-command-auto-follow',
  'terrain-command-show-on-map',
  'terrain-command-source-inspector',
  'terrain-command-collapse',
  'SURFACE TYPE',
  'ROUGHNESS INDEX',
  'WATER CROSSING',
  'CLEARANCE',
  'VEHICLE FIT CONFIDENCE',
  'TERRAIN POSTURE',
  'DRIVER-SAFE • SCRUB LOCKED',
  'useWindowDimensions',
]) {
  assert(hudSource.includes(fragment), `Terrain Command HUD must include ${fragment}.`);
}
assert(hudSource.includes("appearanceStore.resolveEffectiveTheme(null) === 'driving'"));
assert(hudSource.includes("snapshot.predictiveSideSlope.supported"));
assert(hudSource.includes("'UNKNOWN'"));
assert(hudSource.includes("snapshot.routeGeometryFingerprint, snapshot.routeId"));
assert(graphSource.includes('onProbePointChange?.(closest)'));
assert(graphSource.includes('selectedDistanceRange'));
assert(graphSource.includes('completedProfileLinePath'));
assert(graphSource.includes('chart.xTicks.map'));
assert(graphSource.includes('chart.yTicks.map'));
assert(rendererSource.includes("const TerrainIntelligenceCommand = React.lazy"));
assert(rendererSource.includes("profileDensity: detailMode ? 'expanded' : 'compact'"));
assert(rendererSource.includes('<TerrainIntelligenceCommand'));

assert(dashboardSource.includes("kind: 'terrain_inspection'"));
assert(dashboardSource.includes("preserveActiveGuidance: true"));
assert(dashboardSource.includes("returnTo: '/dashboard'"));
const terrainHandoffBlock = dashboardSource.slice(
  dashboardSource.indexOf('const handleTerrainShowOnMap'),
  dashboardSource.indexOf('const handleRemotenessNavigateFromDetail'),
);
assert(!terrainHandoffBlock.includes('saveNavigationHandoffPayload'));
assert(navigateSource.includes("flow.context?.kind === 'terrain_inspection'"));
assert(navigateSource.includes("'terrain_inspection_focus'"));
assert(navigateSource.includes('fitMapToCoordinatePreview'));

console.log('[terrain-intelligence-command] ranges, graph inspection, driver policy, source detail, and safe map focus passed');
