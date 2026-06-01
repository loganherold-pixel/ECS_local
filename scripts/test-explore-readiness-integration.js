const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key';

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native' || String(request).includes(`${path.sep}react-native${path.sep}`)) {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy') {
    return {};
  }
  if (request === 'expo-secure-store') {
    return {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: {}, manifest: null } };
  }
  if (request === 'expo-modules-core' || String(request).includes('expo-modules-core')) {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

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

const readiness = require(path.join(root, 'lib', 'readiness', 'exploreRouteReadiness.ts'));

const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const enrichedCard = fs.readFileSync(path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'), 'utf8');
const aiCard = fs.readFileSync(path.join(root, 'components', 'discover', 'AIRouteCard.tsx'), 'utf8');
const trailPackCard = fs.readFileSync(path.join(root, 'components', 'discover', 'TrailPackCard.tsx'), 'utf8');
const analysisModal = fs.readFileSync(path.join(root, 'components', 'discover', 'ExpeditionAnalysisModal.tsx'), 'utf8');
const routePreviewModal = fs.readFileSync(path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'), 'utf8');
const aiPreviewModal = fs.readFileSync(path.join(root, 'components', 'discover', 'AIRoutePreviewModal.tsx'), 'utf8');
const summaryComponent = fs.readFileSync(path.join(root, 'components', 'discover', 'ExploreReadinessSummary.tsx'), 'utf8');
const readinessCard = fs.readFileSync(path.join(root, 'components', 'readiness', 'ExpeditionReadinessCard.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const route = {
  id: 'white-rim-explore',
  name: 'White Rim Planning Route',
  region: 'Utah Canyonlands',
  regionGroup: 'utah-canyonlands',
  distanceMiles: 88,
  terrainType: 'desert shelf road',
  remotenessScore: 8,
  estimatedFuelRequired: 11,
  suggestedCamps: 2,
  description: 'Long desert route with remote sections.',
  highlights: ['Remote shelf roads'],
  elevationGainFt: 3200,
  estimatedDays: 2,
  bestSeason: 'spring',
  permitRequired: true,
  imageTag: 'utah',
  startLat: 38.45,
  startLng: -109.82,
  terrainDifficulty: 6,
  campingPotentialScore: 66,
  trailGeometry: [
    { lat: 38.45, lng: -109.82 },
    { lat: 38.51, lng: -109.73 },
  ],
};

const assessment = readiness.buildExploreRouteReadinessAssessment(route, { hasVehicle: false });
assert.strictEqual(assessment.categories.length, 10, 'Explore route readiness should return all 10 categories.');
assert.notStrictEqual(assessment.status, 'ready', 'Missing vehicle/weather/offline data should prevent a ready route card.');

const summary = readiness.getExploreRouteReadinessSummary(assessment, route, { hasVehicle: false });
assert.strictEqual(summary.vehicleFitLabel, 'Select vehicle for personalized readiness');
assert.ok(summary.campConfidenceLabel, 'Camping-relevant routes should expose camp confidence.');
assert.ok(summary.concern.includes('Select vehicle'), 'Missing vehicle should be visible as the compact concern.');

const highConfidenceRoute = {
  ...route,
  id: 'high-confidence-complete',
  name: 'High Confidence Complete Geometry',
  distanceMiles: 24,
  remotenessScore: 4,
  terrainDifficulty: 3,
  permitRequired: false,
  suggestedCamps: 0,
  campingPotentialScore: 0,
  routeLabel: 'Hidden Gem',
  recommendationConfidence: { level: 'high', score: 89, label: 'High confidence', shortReason: 'complete route support', reasons: [] },
  riskPreview: { level: 'Low', score: 18, factors: [] },
  vehicleMatch: { score: 88, rating: 'Strong', note: 'Strong vehicle fit.', concerns: [] },
  trailGeometry: [
    { lat: 38.45, lng: -109.82 },
    { lat: 38.51, lng: -109.73 },
  ],
};
const highConfidenceAssessment = readiness.buildExploreRouteReadinessAssessment(highConfidenceRoute, { hasVehicle: true });
const highConfidenceSummary = readiness.getExploreRouteReadinessSummary(highConfidenceAssessment, highConfidenceRoute, { hasVehicle: true });
assert.strictEqual(highConfidenceSummary.routeConfidenceLabel, 'High', 'High recommendation confidence should render as High route confidence.');
assert.ok(
  !String(highConfidenceSummary.concern ?? '').toLowerCase().includes('limited confidence'),
  'High-confidence routes with complete geometry should not show conflicting Limited confidence concern copy.',
);
assert.strictEqual(
  highConfidenceSummary.hasLimitedRouteData,
  false,
  'Complete-geometry routes should not carry the limited route data badge.',
);

const highConfidenceEndpointRoute = {
  ...highConfidenceRoute,
  id: 'high-confidence-endpoints',
  name: 'High Confidence Endpoint Route',
  trailGeometry: undefined,
  destinationCoordinate: { lat: 38.51, lng: -109.73 },
};
const highEndpointAssessment = readiness.buildExploreRouteReadinessAssessment(highConfidenceEndpointRoute, { hasVehicle: true });
const highEndpointSummary = readiness.getExploreRouteReadinessSummary(highEndpointAssessment, highConfidenceEndpointRoute, { hasVehicle: true });
assert.ok(
  !String(highEndpointSummary.concern ?? '').toLowerCase().includes('limited confidence'),
  'High-confidence routes with endpoint route data should use non-conflicting data-quality concern copy or no concern.',
);
assert.ok(
  String(highEndpointSummary.concern ?? '').includes('Route line is based on available endpoints or waypoints'),
  'High-confidence endpoint-only routes should use accurate data-quality concern copy.',
);

const missingGeometryRoute = {
  ...highConfidenceRoute,
  id: 'missing-geometry-low-confidence',
  name: 'Missing Geometry Low Confidence',
  recommendationConfidence: { level: 'low', score: 42, label: 'Low confidence', shortReason: 'missing route support', reasons: [] },
  trailGeometry: undefined,
  destinationCoordinate: undefined,
};
const missingGeometryAssessment = readiness.buildExploreRouteReadinessAssessment(missingGeometryRoute, { hasVehicle: true });
const missingGeometrySummary = readiness.getExploreRouteReadinessSummary(missingGeometryAssessment, missingGeometryRoute, { hasVehicle: true });
assert.ok(
  String(missingGeometrySummary.concern ?? '').includes('Route geometry unavailable'),
  'Routes with missing geometry and low confidence should show an accurate geometry concern.',
);

const patch = readiness.buildExploreRouteReadinessStorePatch(route, { hasVehicle: false });
assert.ok(patch.route, 'Explore route selection should patch route readiness input.');
assert.ok(!Object.prototype.hasOwnProperty.call(patch, 'activeVehicle'), 'Explore patch should not replace live Fleet source data.');
assert.ok(!Object.prototype.hasOwnProperty.call(patch, 'weather'), 'Explore patch should not invent weather data.');
assert.ok(!Object.prototype.hasOwnProperty.call(patch, 'offline'), 'Explore patch should not invent offline package data.');

assertIncludes(enrichedCard, 'ExploreReadinessSummary', 'Known, Hidden Gem, and Popular Trail cards should render compact readiness.');
assertIncludes(aiCard, 'ExploreReadinessSummary', 'ECS Route Idea cards should render compact readiness.');
assertIncludes(trailPackCard, 'ExploreReadinessSummary', 'Trail Pack route cards should render compact readiness.');
assertNotIncludes(analysisModal, 'ExpeditionReadinessCard', 'Route detail analysis should not duplicate route readiness preview.');
assertIncludes(routePreviewModal, 'ExpeditionReadinessCard', 'Route preview should include expanded readiness.');
assertIncludes(aiPreviewModal, 'ExpeditionReadinessCard', 'ECS Route Idea preview should include expanded readiness.');
assertIncludes(
  readinessCard,
  'interactive?: boolean',
  'Shared readiness card should expose an explicit non-interactive mode.',
);
assertNotIncludes(
  analysisModal,
  'interactive={false}',
  'Explorer detail modal should no longer render the redundant readiness preview.',
);
assertIncludes(
  readinessCard,
  'const hasCardInteraction = interactive && (Boolean(onPress) || canOpenDetail);',
  'Non-interactive readiness cards should not expose button behavior.',
);
assertIncludes(
  readinessCard,
  'onPress={interactive ? handleCategoryPress : undefined}',
  'Non-interactive readiness cards should not expose clickable category rows.',
);

const descriptionIndex = analysisModal.indexOf('<Text style={s.description}>{opportunity.description}</Text>');
const highlightsIndex = analysisModal.indexOf('HIGHLIGHTS');
const rigCompatibilityIndex = analysisModal.indexOf('RIG COMPATIBILITY');
const rigUpgradeIndex = analysisModal.indexOf('RIG UPGRADE SUGGESTIONS', rigCompatibilityIndex);
const readinessIndex = analysisModal.indexOf('title="Explore Readiness Preview"');
const expeditionDataIndex = analysisModal.indexOf('EXPEDITION DATA');
assert.ok(
  descriptionIndex === -1 &&
    highlightsIndex === -1 &&
    readinessIndex === -1 &&
    expeditionDataIndex > -1 &&
    rigCompatibilityIndex > expeditionDataIndex &&
    rigUpgradeIndex > rigCompatibilityIndex,
  'Explorer detail modal should start with Expedition Data, then Rig Compatibility and Rig Upgrade Suggestions without description, highlights, or readiness preview sections.',
);
assert.ok(
  analysisModal.includes('label="TERRAIN"') &&
    analysisModal.includes('value={terrainValue}') &&
    analysisModal.includes('label="REMOTE"') &&
    analysisModal.includes('value={remotenessValue}'),
  'Explorer Expedition Data should include compact Terrain and Remoteness boxes.',
);
assert.ok(
  !analysisModal.includes('TERRAIN & REMOTENESS') &&
    !analysisModal.includes('terrainRow') &&
    !analysisModal.includes('remotenessBar'),
  'Explorer detail should not keep the old bulky Terrain & Remoteness section after merging it into Expedition Data.',
);
assert.ok(
  analysisModal.includes("flexBasis: '23.5%'") &&
    analysisModal.includes('minWidth: 118') &&
    analysisModal.includes('paddingVertical: 9'),
  'Explorer Expedition Data boxes should use a compact responsive grid.',
);

assertIncludes(discover, 'stageExploreReadinessPreview', 'Explore route selection should stage readiness context.');
assertIncludes(discover, 'buildExploreRouteReadinessStorePatch', 'Explore should patch the canonical readiness store.');
assertIncludes(discover, 'hasVehicle={!!activeVehicleId}', 'Route idea cards and previews should receive active vehicle state.');
assertIncludes(summaryComponent, 'Concern:', 'Compact cards should show one short concern line.');
assertIncludes(
  packageSource,
  '"test:explore-readiness": "node ./scripts/test-explore-readiness-integration.js"',
  'package.json should expose the Explore readiness integration regression test.',
);

for (const source of [enrichedCard, aiCard, trailPackCard, analysisModal, routePreviewModal, aiPreviewModal, summaryComponent]) {
  assertNotIncludes(source, 'AI says', 'Explore readiness UI must not use generic AI labeling.');
  assertNotIncludes(source.toLowerCase(), 'legal campsite', 'Explore readiness UI must not guarantee legal campsite status.');
  assertNotIncludes(source.toLowerCase(), 'onx', 'Explore readiness UI must not contain OnX comparison copy.');
}

console.log('Explore readiness integration checks passed.');
