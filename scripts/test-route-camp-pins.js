const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const campOpsMapPinsPath = path.join(root, 'lib', 'campops', 'campOpsMapPins.ts');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator() { return null; },
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
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  if (request.endsWith('/ecsIssueReporter') || request === './ecsIssueReporter') {
    return { reportRecoverableFailure() {} };
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

const { buildCampOpsCampScoutMapPins, isCampOpsMapPinPayload } = require(campOpsMapPinsPath);
const { normalizeRenderedCampScoutMarkers } = require(mapRendererPath);

function camp(id, score, index, overrides = {}) {
  return {
    id,
    name: `Viable Route Camp ${index}`,
    source: 'route_candidate',
    sourceConfidence: score >= 85 ? 'high' : 'medium',
    location: {
      latitude: 39 + index * 0.01,
      longitude: -120 - index * 0.01,
    },
    score,
    ...overrides,
  };
}

function recommendationSet(rankedCandidates, overrides = {}) {
  return {
    recommendedCamp: rankedCandidates[0] ?? null,
    backupCamp: rankedCandidates[1] ?? null,
    emergencyCamp: rankedCandidates[2] ?? null,
    weatherFallbackCamp: rankedCandidates[3] ?? null,
    resupplyCamp: rankedCandidates[4] ?? null,
    trailerSafeCamp: rankedCandidates[5] ?? null,
    rankedCandidates,
    rejectedCandidates: [],
    warnings: [],
    assumptions: [],
    confidenceSummary: {
      level: 'medium',
      score: 78,
      reasons: [],
      missingDataFields: [],
    },
    scoresByCandidateId: Object.fromEntries(
      rankedCandidates.map((candidate) => [candidate.id, { overall: candidate.score }]),
    ),
    ...overrides,
  };
}

const ranked = [92, 88, 84, 79, 73, 71].map((score, index) => camp(`route-camp-${index + 1}`, score, index + 1));
const routePins = buildCampOpsCampScoutMapPins(recommendationSet(ranked), {
  selectedCampOpsCandidateId: 'route-camp-3',
});

assert.strictEqual(routePins.length, 5, 'Route camp rendering should cap visible CampOps pins at five.');
assert.deepStrictEqual(
  routePins.map((pin) => pin.title),
  ['Camp 1', 'Camp 2', 'Camp 3', 'Camp 4', 'Camp 5'],
  'Route camp pins should use Camp 1 through Camp 5 labels.',
);
assert.deepStrictEqual(
  routePins.map((pin) => pin.rankLabel),
  ['1', '2', '3', '4', '5'],
  'Route camp pins should show rank numbers.',
);
assert(routePins.every(isCampOpsMapPinPayload), 'Route camp pins should keep the CampOps behavior tag.');
assert.strictEqual(routePins[2].selected, true, 'Selected route camp pin should preserve selected state.');

const renderedPins = normalizeRenderedCampScoutMarkers(routePins);
assert.strictEqual(renderedPins.length, 5, 'Route CampOps pins should pass through the shared camp scout renderer.');
assert.strictEqual(renderedPins[0].pinFamily, 'campops', 'Renderer should preserve route camp behavior metadata.');
assert.strictEqual(renderedPins[0].campOpsRoleLabel, 'Camp 1', 'Renderer should preserve camp role labels.');

const noRankedCandidates = {
  ...recommendationSet([]),
  rankedCandidates: undefined,
  recommendedCamp: camp('fallback-role-camp', 94, 1),
};
assert.strictEqual(
  buildCampOpsCampScoutMapPins(noRankedCandidates).length,
  0,
  'Route camp rendering should not force fallback role pins when no ranked candidates qualify.',
);

assert.strictEqual(
  buildCampOpsCampScoutMapPins(recommendationSet([camp('below-threshold', 69, 1)])).length,
  0,
  'Route camp rendering should suppress candidates below the high-confidence pin threshold.',
);

const duplicatePins = buildCampOpsCampScoutMapPins(
  recommendationSet([ranked[0], ranked[0], ranked[1], ranked[1], ranked[2]]),
);
assert.deepStrictEqual(
  duplicatePins.map((pin) => pin.campOpsCandidateId),
  ['route-camp-1', 'route-camp-2', 'route-camp-3'],
  'Route camp rendering should dedupe repeated CampOps candidate ids before render.',
);

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
assert(
    mapRendererSource.includes('camp-scout-marker camp-scout-grade-') &&
    mapRendererSource.includes('camp-scout-tent') &&
    mapRendererSource.includes('camp-scout-rank') &&
    mapRendererSource.includes('root.appendChild(rank)') &&
    !mapRendererSource.includes('camp-scout-label') &&
    !mapRendererSource.includes("label.textContent = 'camp'"),
  'Route camp pins should reuse the remote camp scout tent style with the rank hovering above the pin.',
);
assert(
  mapRendererSource.includes("send('pinTap', Object.assign({ kind: 'campScout' }, item))"),
  'Route camp pins should open the existing camp scout/Camp Intel tap path.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert(
  navigateSource.includes('buildCampOpsCampScoutMapPins(campOpsRecommendationSet') &&
    navigateSource.includes('campScoutMarkers={sharedCampPinMapMarkers}') &&
    navigateSource.includes('onCampScoutTap={handleCampScoutTap}'),
  'Navigate should feed route CampOps pins into MapRenderer through the shared camp scout marker prop.',
);
assert(
  navigateSource.includes('isCampOpsMapPinPayload(payload)') &&
    navigateSource.includes('setSelectedCampOpsEndpointId(endpointId)') &&
    navigateSource.includes('campOpsDetail={selectedCampOpsIntel}') &&
    navigateSource.includes('onDismiss={selectedCampOpsIntel ? handleCampOpsDismiss : handleCampScoutDismiss}'),
  'Tapping a route camp pin should open and dismiss the existing Camp Intel popup path.',
);
assert(
  navigateSource.includes('scheduleRouteCampsiteClear') &&
    navigateSource.includes('setSelectedCampOpsEndpointId(null)') &&
    navigateSource.includes('applyCampsiteCandidates(null)'),
  'Route camp pins should clear with route-owned campsite candidates.',
);

console.log('Route camp pin rendering checks passed.');
