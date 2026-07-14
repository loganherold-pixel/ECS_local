const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const viewModelPath = path.join(root, 'lib', 'campops', 'campOpsCampIntelViewModel.ts');
const popupPath = path.join(root, 'components', 'navigate', 'CampScoutIntelCard.tsx');
const establishedPopupPath = path.join(root, 'components', 'navigate', 'EstablishedCampsiteSheet.tsx');
const establishedScorePath = path.join(root, 'lib', 'map', 'establishedCampgroundScore.ts');
const establishedDetailRowsPath = path.join(root, 'lib', 'map', 'establishedCampgroundDetailRows.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Animated: {
        Value: function Value() {},
        timing() {
          return { start(callback) { if (callback) callback({ finished: true }); } };
        },
      },
      Platform: { OS: 'web' },
      ScrollView() { return null; },
      StyleSheet: {
        absoluteFillObject: {},
        create(styles) { return styles; },
      },
      Text() { return null; },
      TouchableOpacity() { return null; },
      View() { return null; },
    };
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const { buildCampOpsCampIntelViewModel } = require(viewModelPath);
const { buildEstablishedCampgroundDetailRows } = require(establishedDetailRowsPath);

const recommendationSet = {
  recommendedCamp: {
    id: 'camp-1',
    name: 'North Ridge Bench',
    location: { latitude: 39.25, longitude: -120.25 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
    legalConfidence: 'low',
    accessDifficulty: 'moderate',
    score: 82,
    tags: ['Good route spacing with moderate access confidence.'],
  },
  rankedCandidates: [
    {
      id: 'camp-1',
      name: 'North Ridge Bench',
      location: { latitude: 39.25, longitude: -120.25 },
      source: 'route_candidate',
      sourceConfidence: 'medium',
      legalConfidence: 'low',
      accessDifficulty: 'moderate',
      score: 82,
      tags: ['Good route spacing with moderate access confidence.'],
    },
  ],
  rejectedCandidates: [],
  warnings: ['Cached legal/source data may be stale.'],
  assumptions: [],
  confidenceSummary: {
    level: 'medium',
    score: 76,
    reasons: [],
    missingDataFields: [],
  },
  scoresByCandidateId: {
    'camp-1': {
      overall: 82,
      terrain: 78,
      access: 69,
      legal: 54,
      weather: 71,
      privacy: 73,
      lateArrival: 64,
    },
  },
  enrichmentsByCandidateId: {
    'camp-1': {
      candidateId: 'camp-1',
      legalStatus: 'unknown',
      legalConfidence: 'low',
      accessDifficulty: 'moderate',
      vehicleFit: 'fit',
      trailerSuitability: 'unknown',
      routeDistanceToCampMiles: 1.4,
      terrainSlopeEstimate: { value: 4, unit: 'degrees', label: 'Moderate slope' },
      weatherExposure: 'watch',
      weatherExposureLevel: 'medium',
      fireRestrictionStatus: 'unknown',
      privacyLikelihood: 'medium',
      occupancyLikelihood: 'unknown',
      lateArrivalRisk: 'watch',
      dataConfidence: 'medium',
      dataLimitations: ['Provider access data is incomplete.'],
    },
  },
};

const model = buildCampOpsCampIntelViewModel(recommendationSet, 'camp-1');
assert(model, 'CampOps popup view model should be created for a ranked candidate.');
assert.strictEqual(model.title, 'Camp 1', 'CampOps popup should use camp rank as the primary title.');
assert.strictEqual(
  model.statusLabel,
  'ECS-Inferred Camp Candidate',
  'CampOps popup should use ECS-Inferred copy.',
);
assert.strictEqual(model.overallScore, '82/100', 'CampOps popup should expose overall suitability score.');
assert(
  model.metrics.some((metric) => metric.label === 'Terrain suitability' && metric.value === '78/100'),
  'CampOps popup should expose terrain suitability.',
);
assert(
  model.metrics.some((metric) => metric.label === 'Legal/source confidence' && metric.value === '54/100'),
  'CampOps popup should expose legal/source confidence without claiming legality.',
);
assert(
  model.metrics.some((metric) => metric.label === 'Distance from route' && metric.value === '1.4 mi'),
  'CampOps popup should expose route distance.',
);
assert(
  model.uncertaintyNotes.some((note) => note.includes('Access not fully verified')),
  'CampOps popup should include conservative verification language.',
);

const popupSource = fs.readFileSync(popupPath, 'utf8');
const viewModelSource = fs.readFileSync(viewModelPath, 'utf8');
const establishedPopupSource = fs.readFileSync(establishedPopupPath, 'utf8');
const establishedScoreSource = fs.readFileSync(establishedScorePath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const combinedSource = `${popupSource}\n${navigateSource}`;

for (const text of [
  'CAMP ENDPOINTS',
  'candidate endpoint',
  'Overall suitability score',
  'Known uncertainty / verification note',
  'DISMISS',
  'SAVE CAMP',
  'NAVIGATE HERE',
  'COMPARE NEARBY',
  'MARK USED',
  'REPORT UNUSABLE',
]) {
  assert(popupSource.includes(text), `Popup source should include required CampOps copy/action: ${text}`);
}

assert(
  popupSource.includes('Animated.timing') && popupSource.includes('opacity'),
  'CampOps popup should fade in/out instead of flickering closed.',
);
assert(
  popupSource.includes('numberOfLines={2}') &&
    popupSource.includes('minimumFontScale={0.86}') &&
    !popupSource.includes('styles.title} numberOfLines={1}'),
  'CampOps popup title/subtitle should wrap on cramped Android screens instead of clipping long camp names.',
);
assert(
  popupSource.includes("flexBasis: '30%'") &&
    popupSource.includes('minWidth: 96') &&
    popupSource.includes('adjustsFontSizeToFit') &&
    popupSource.includes('minimumFontScale={0.7}'),
  'CampOps popup actions should stay tappable and fit labels on small screens.',
);
assert(
  popupSource.includes('Decision sources') &&
    popupSource.includes('activeCampOpsDetail.sourceDetails') &&
    viewModelSource.includes('buildCampCandidateDecisionDetails'),
  'Camp Intel should expose separate legal, condition, availability, suitability, and trust decision sources.',
);
assert(
  popupSource.includes("maxHeight: '100%'") &&
    popupSource.includes('paddingVertical: 9') &&
    popupSource.includes('minHeight: 44') &&
    !popupSource.includes('maxHeight: 340'),
  'CampOps popup should use the available map body while preserving mobile-sized actions.',
);
assert(
  navigateSource.includes('selectedCampOpsIntel') &&
    navigateSource.includes('handleCampOpsNavigateHere') &&
    navigateSource.includes('previewCampsiteDestination') &&
    navigateSource.includes('campOpsLocalReportsRef'),
  'Navigate should wire CampOps popup actions into route preview, persistence, and local reports.',
);

assert(
  establishedPopupSource.includes('resolveEstablishedCampgroundScore') &&
    establishedPopupSource.includes('ECS SCORE') &&
    establishedPopupSource.includes('camp confidence') &&
    establishedScoreSource.includes('reported campground status, source confidence, availability freshness, operator data, and provider attribution'),
  'Established campground popups should explain source-aware ECS scoring without implying that cached status is live.',
);

const sparseEstablishedCampground = {
  id: 'established-sparse-1',
  name: 'Sparse Source Campground',
  latitude: 38.78,
  longitude: -121.2,
  type: 'established_campground',
  category: 'campground',
  campsiteType: 'campground',
  source: 'RECREATION_GOV',
  feeStatus: 'unknown',
  reservationStatus: 'unknown',
  amenities: ['unknown'],
  siteCount: null,
  seasonDescription: null,
  openingHours: null,
  maxVehicleLengthFt: null,
  tentAllowed: true,
  rvAllowed: undefined,
  trailersAllowed: undefined,
  phone: null,
  requiresVerification: true,
};

const sparseRows = buildEstablishedCampgroundDetailRows(sparseEstablishedCampground);
const sparseRowLabels = sparseRows.map((row) => row.label);
assert(!sparseRowLabels.includes('Site count'), 'Established campground popups should hide missing site counts.');
assert(!sparseRowLabels.includes('Season / hours'), 'Established campground popups should hide missing season/hours.');
assert(!sparseRowLabels.includes('Max vehicle length'), 'Established campground popups should hide missing max vehicle length.');
assert(!sparseRowLabels.includes('Contact'), 'Established campground popups should hide missing contact rows.');
assert(
  sparseRows.some((row) => row.label === 'Tent / RV / trailers' && row.value === 'Yes / Unknown / Unknown'),
  'Established campground popups should keep partially supplied stay-type data such as tent allowed with RV/trailer unknown.',
);
assert(
  sparseRows.every((row) => row.value !== 'Not supplied by source'),
  'Established campground detail rows should omit missing values instead of rendering Not supplied by source.',
);

const forbiddenCopy = [
  'AI-' + 'Inferred',
  'Legal ' + 'campsite',
  'Guaranteed ' + 'accessible',
  'Safe ' + 'campsite',
  'Approved ' + 'campsite',
];

for (const forbidden of forbiddenCopy) {
  assert(!combinedSource.includes(forbidden), `CampOps popup copy should not include overconfident phrase: ${forbidden}`);
}

console.log('CampOps Camp Intel popup checks passed.');
