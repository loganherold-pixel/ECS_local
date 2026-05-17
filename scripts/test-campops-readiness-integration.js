const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (styles) => styles } };
  }
  if (request === 'expo-router') {
    return { useRouter: () => ({ push: () => undefined }) };
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

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const campAdapter = require(path.join(root, 'lib', 'readiness', 'campReadinessAdapter.ts'));
const scoring = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));
const fixtures = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessFixtures.ts'));

function campCandidate(id, score, legalConfidence = 'high') {
  return {
    id,
    name: `Camp ${id}`,
    location: { latitude: 39.1, longitude: -105.1 },
    source: 'route_candidate',
    sourceConfidence: 'high',
    score,
    legalConfidence,
    tags: ['Good route position with usable terrain signals.'],
  };
}

const recommendationSet = {
  recommendedCamp: campCandidate('a', 91, 'high'),
  backupCamp: campCandidate('b', 82, 'medium'),
  emergencyCamp: null,
  weatherFallbackCamp: null,
  resupplyCamp: null,
  trailerSafeCamp: null,
  rankedCandidates: [campCandidate('a', 91, 'high'), campCandidate('b', 82, 'medium')],
  rejectedCandidates: [],
  warnings: ['Legal Access Confidence is ECS-inferred; verify official agency rules.'],
  assumptions: [],
  confidenceSummary: {
    level: 'medium',
    score: 82,
    reasons: [],
    missingDataFields: [],
  },
  rolesByCandidateId: { a: ['primary'], b: ['backup'] },
  scoresByCandidateId: {
    a: { overall: 91, legal: 88, access: 82, time: 80, resources: 78, terrain: 86, weather: 74, groupFit: 80, trailerFit: 70, lateArrival: 78, privacy: 72, dataConfidence: 74 },
    b: { overall: 82, legal: 70, access: 76, time: 76, resources: 70, terrain: 78, weather: 70, groupFit: 76, trailerFit: 66, lateArrival: 72, privacy: 80, dataConfidence: 70 },
  },
  enrichmentsByCandidateId: {
    a: {
      candidateId: 'a',
      legalStatus: 'likely_allowed',
      legalConfidence: 'high',
      closureStatus: 'unknown',
      accessDifficulty: 'moderate',
      vehicleFit: 'fit',
      trailerSuitability: 'limited',
      roadWidthConfidence: 'medium',
      routeDistanceToCampMiles: 3.4,
      weatherExposure: 'watch',
      weatherExposureLevel: 'medium',
      fireRestrictionStatus: 'unknown',
      privacyLikelihood: 'moderate',
      occupancyLikelihood: 'moderate',
      lateArrivalRisk: 'watch',
      dataConfidence: 'medium',
      exitDistanceMiles: 9.1,
      dataLimitations: ['Land-management layer missing official confirmation.'],
    },
    b: {
      candidateId: 'b',
      legalStatus: 'unknown',
      legalConfidence: 'medium',
      closureStatus: 'unknown',
      accessDifficulty: 'high_clearance',
      vehicleFit: 'limited',
      trailerSuitability: 'limited',
      roadWidthConfidence: 'low',
      routeDistanceToCampMiles: 6.8,
      weatherExposure: 'caution',
      weatherExposureLevel: 'high',
      fireRestrictionStatus: 'unknown',
      privacyLikelihood: 'high',
      occupancyLikelihood: 'low',
      lateArrivalRisk: 'caution',
      dataConfidence: 'medium',
    },
  },
  explanations: {
    whyRecommended: 'Best route-positioned CampOps candidate from available access, terrain, and source-confidence signals.',
    whyBackup: 'Backup candidate has higher remoteness but weaker access confidence.',
    whyEmergency: null,
    whyWeatherFallback: null,
    whyResupply: null,
    whyTrailerSafe: null,
    plannedCampDowngrade: null,
    keyTradeoffs: [],
  },
  decisionPoint: null,
};

const campOpsCandidates = campAdapter.buildReadinessCampCandidatesFromCampOps(recommendationSet);
assert.strictEqual(campOpsCandidates.length, 2, 'CampOps ranked candidates should become readiness candidates.');
assert.strictEqual(campOpsCandidates[0].label, 'A', 'Top CampOps candidate should receive label A.');
assert.strictEqual(campOpsCandidates[0].legalAccessConfidence, 'medium', 'ECS-inferred route candidates must not produce high legal access confidence.');
assert.strictEqual(campOpsCandidates[0].isECSInferred, true, 'Route candidate should be marked ECS-inferred.');
assert.ok(campOpsCandidates[0].whyECSPickedThis.includes('CampOps'), 'Candidate should include why ECS picked this.');
assert.ok(campOpsCandidates[0].cautionNotes.some((note) => /official agency rules|official confirmation/i.test(note)), 'Candidate should carry confidence caution notes.');

const scoutCandidates = campAdapter.buildReadinessCampCandidatesFromCampScout([
  {
    id: 'scout-a',
    coordinate: { latitude: 39.2, longitude: -105.2 },
    title: 'Dispersed candidate',
    sourceType: 'ecs_inferred',
    confidenceScore: 88,
    confidenceGrade: 'A',
    scoreBreakdown: { flatnessTerrain: 85, accessConfidence: 80, remotenessValue: 82, legalAccessConfidence: 86, safetyEnvironmentalRisk: 80, sourceSignal: 62, sourceQuality: 62, remoteness: 82, access: 80, legality: 86, terrain: 85, proximity: 75, confidence: 88, total: 88 },
    reasons: ['Terrain and remoteness signals look promising.'],
    cautions: [],
    accessConfidence: 80,
    legalityConfidence: 86,
    remotenessScore: 82,
    legalityStatus: 'likely_allowed_needs_verification',
  },
]);
assert.strictEqual(scoutCandidates[0].legalAccessConfidence, 'medium', 'ECS-inferred dispersed candidates should cap legal confidence at medium.');

const assessment = scoring.buildExpeditionReadiness({
  ...fixtures.completeReadyReadinessFixture,
  campCandidates: campOpsCandidates,
});
const campCategory = assessment.categories.find((category) => category.id === 'camp_legality_confidence');
assert.ok(campCategory, 'Readiness must include Camp Legality Confidence.');
assert.ok(campCategory.factors.some((factor) => factor.label === 'Camp Suitability'), 'Camp category should include Camp Suitability factor.');
assert.ok(campCategory.factors.some((factor) => factor.label === 'Vehicle Access Confidence'), 'Camp category should include Vehicle Access Confidence factor.');
assert.ok(assessment.warnings.some((warning) => /official confirmation|Legal Access Confidence/i.test(warning.detail)), 'Assessment should warn on limited legal confidence.');

const navigateSource = read('app', '(tabs)', 'navigate.tsx');
assert.ok(navigateSource.includes('buildReadinessCampCandidatesFromCampOps'), 'Navigate should feed CampOps recommendations into readiness.');
assert.ok(navigateSource.includes('buildReadinessCampCandidatesFromCampScout'), 'Navigate should feed dispersed Camp Scout candidates into readiness.');
assert.ok(navigateSource.includes('mergeReadinessCampCandidateSets'), 'Navigate should merge camp candidate sources for readiness.');
assert.ok(navigateSource.includes("campScoutAreaMode === 'results'"), 'Dispersed camping scan/filter state should affect readiness context.');

const briefSource = read('components', 'brief', 'CommandBriefScreen.tsx');
assert.ok(briefSource.includes('CampOpsBriefSection'), 'Command Brief should render a CampOps readiness section.');
assert.ok(briefSource.includes('Legal Access Confidence'), 'Command Brief CampOps section should show Legal Access Confidence.');
assert.ok(briefSource.includes('official agency rules'), 'Command Brief should recommend official agency verification.');

const combinedCopy = [
  read('lib', 'readiness', 'campReadinessAdapter.ts'),
  read('lib', 'readiness', 'expeditionReadinessScoring.ts'),
  briefSource,
  navigateSource,
].join('\n');
assert.ok(!new RegExp(`legal ${'camp'}site`, 'i').test(combinedCopy), 'Readiness/CampOps integration must not use forbidden campsite legality phrasing.');
assert.ok(!new RegExp(`this ${'camp'}site is legal`, 'i').test(combinedCopy), 'Readiness/CampOps integration must not guarantee legality.');
assert.ok(!new RegExp(`AI ${'says'}`, 'i').test(combinedCopy), 'Readiness/CampOps integration must not use generic AI attribution copy.');

console.log('CampOps readiness integration checks passed.');
