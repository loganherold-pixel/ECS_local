const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      StyleSheet: {
        absoluteFillObject: {},
        create(styles) { return styles; },
      },
      Text() { return null; },
      View() { return null; },
    };
  }
  if (request === 'react-native-webview') {
    return { WebView() { return null; } };
  }
  if (request === 'react-native-svg') {
    function Svg() { return null; }
    return {
      __esModule: true,
      default: Svg,
      Circle() { return null; },
      Line() { return null; },
      Polyline() { return null; },
      Rect() { return null; },
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  if (request === './supabase' || request.endsWith('/supabase')) {
    return { supabase: null };
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

const {
  rankCampScoutCandidates,
  validateCampScoutArea,
} = require(path.join(root, 'lib', 'campScout', 'index.ts'));
const {
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
} = require(path.join(root, 'lib', 'campops', 'campOpsMapPins.ts'));
const {
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
} = require(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function scoutCandidate(id) {
  return {
    id,
    coordinate: { latitude: 39, longitude: -120 },
    title: id,
    sourceType: 'ecs_inferred',
    confidenceScore: 80,
    confidenceGrade: 'B',
    scoreBreakdown: {
      flatnessTerrain: 80,
      accessConfidence: 80,
      remotenessValue: 80,
      legalAccessConfidence: 80,
      safetyEnvironmentalRisk: 80,
      sourceSignal: 80,
      sourceQuality: 80,
      remoteness: 80,
      access: 80,
      legality: 80,
      terrain: 80,
      proximity: 80,
      confidence: 80,
      total: 80,
    },
    reasons: [],
    cautions: [],
    accessConfidence: 82,
    legalityConfidence: 82,
    remotenessScore: 82,
    terrainConfidence: 82,
    mapDataCompleteness: 90,
  };
}

const rankedCompat = rankCampScoutCandidates([scoutCandidate('compat-camp')]);
assert.strictEqual(
  rankedCompat.length,
  1,
  'CampScout domain scoring should remain available as a temporary compatibility shim.',
);
assert.strictEqual(
  validateCampScoutArea([
    { latitude: 39, longitude: -120 },
    { latitude: 39.01, longitude: -120 },
    { latitude: 39.01, longitude: -119.99 },
  ]).status,
  'valid',
  'Manual-area validation should remain callable for flagged/internal review.',
);

assert.strictEqual(
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
  'CampOps Camp Endpoint map pin builder should expose a new name while keeping the old shim alias.',
);
assert.strictEqual(
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
  'MapRenderer should expose Camp Endpoint normalization while keeping the old renderer shim.',
);

const navigate = read(path.join('app', '(tabs)', 'navigate.tsx'));
const popup = read(path.join('components', 'navigate', 'CampScoutIntelCard.tsx'));
const mapRenderer = read(path.join('components', 'navigate', 'MapRenderer.tsx'));

assert.ok(
  navigate.includes('CAMPOPS_MANUAL_AREA_REVIEW_ENABLED') &&
    navigate.includes('campopsManualAreaReviewEnabled'),
  'Navigate should gate internal/manual area review behind a CampOps manual-area feature flag.',
);
assert.ok(
  !navigate.includes('DRAW CAMP POTENTIAL AREA') &&
    !navigate.includes('accessibilityLabel="Draw camp potential area"') &&
    !navigate.includes("renderMapPopup(\n    campScoutIntroVisible,\n    'CAMP SCOUT'"),
  'Public Navigate tools should no longer expose Draw Camp Potential Area or Camp Scout popup branding.',
);
assert.ok(
  navigate.includes('CAMP ENDPOINTS') &&
    navigate.includes('Camp Endpoints') &&
    navigate.includes('candidate endpoint'),
  'Navigate should use Camp Endpoints copy for route-camp planning.',
);
assert.ok(
  popup.includes('CAMP ENDPOINTS') &&
    popup.includes('candidate endpoint') &&
    !popup.includes('CAMP SCOUT'),
  'Camp detail popup should use Camp Endpoints copy instead of public CampScout branding.',
);
assert.ok(
  mapRenderer.includes('CampOpsCampEndpointMapMarkerPayload') &&
    mapRenderer.includes('campEndpointMarkers?: CampOpsCampEndpointMapMarkerPayload[]') &&
    mapRenderer.includes('campScoutMarkers?: CampScoutMapMarkerPayload[]'),
  'MapRenderer should accept new Camp Endpoint marker props while retaining the old prop as a compatibility shim.',
);

console.log('CampScout compatibility and public retirement checks passed.');
