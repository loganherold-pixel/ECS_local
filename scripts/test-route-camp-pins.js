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

const {
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
  isCampOpsMapPinPayload,
} = require(campOpsMapPinsPath);
const {
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
} = require(mapRendererPath);

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
assert.strictEqual(
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
  'Legacy CampScout map-pin callers should remain shimmed to Camp Endpoint pins for one release.',
);

const routePins = buildCampOpsCampEndpointMapPins(recommendationSet(ranked), {
  selectedCampOpsCandidateId: 'route-camp-3',
});

assert.strictEqual(routePins.length, 0, 'ECS route candidate rendering should stay research-only and produce no map pins.');
const actionableRanked = [
  camp('manual-camp-1', 92, 1, { source: 'manual' }),
  camp('saved-camp-2', 88, 2, { source: 'user_saved' }),
  camp('route-camp-hidden', 84, 3),
];
const actionablePins = buildCampOpsCampEndpointMapPins(recommendationSet(actionableRanked), {
  selectedCampOpsCandidateId: 'saved-camp-2',
});
assert.strictEqual(actionablePins.length, 2, 'User-confirmed/imported CampOps camps should still render actionable pins.');
assert.deepStrictEqual(
  actionablePins.map((pin) => pin.title),
  ['Camp 1', 'Camp 2'],
  'Actionable camp pins should use compact generic labels.',
);
assert.deepStrictEqual(
  actionablePins.map((pin) => pin.rankLabel),
  ['1', '2'],
  'Actionable camp pins should show rank numbers.',
);
assert(actionablePins.every(isCampOpsMapPinPayload), 'Actionable camp pins should keep the CampOps behavior tag.');
assert.strictEqual(actionablePins[1].selected, true, 'Selected actionable camp pin should preserve selected state.');

assert.strictEqual(
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
  'Legacy CampScout renderer callers should remain shimmed to Camp Endpoint rendering for one release.',
);
const renderedPins = normalizeRenderedCampEndpointMarkers(actionablePins);
assert.strictEqual(renderedPins.length, 2, 'Actionable CampOps pins should pass through the shared Camp Endpoint renderer.');
assert.strictEqual(renderedPins[0].pinFamily, 'campops', 'Renderer should preserve route camp behavior metadata.');
assert.strictEqual(renderedPins[0].campOpsRoleLabel, 'Camp 1', 'Renderer should preserve camp role labels.');

const noRankedCandidates = {
  ...recommendationSet([]),
  rankedCandidates: undefined,
  recommendedCamp: camp('fallback-role-camp', 94, 1),
};
assert.strictEqual(
  buildCampOpsCampEndpointMapPins(noRankedCandidates).length,
  0,
  'Route camp rendering should not force fallback role pins when no ranked candidates qualify.',
);

assert.strictEqual(
  buildCampOpsCampEndpointMapPins(recommendationSet([camp('below-threshold', 69, 1)])).length,
  0,
  'Route camp rendering should suppress candidates below the high-confidence pin threshold.',
);

const duplicatePins = buildCampOpsCampEndpointMapPins(
  recommendationSet([actionableRanked[0], actionableRanked[0], actionableRanked[1], actionableRanked[1], actionableRanked[2]]),
);
assert.deepStrictEqual(
  duplicatePins.map((pin) => pin.campOpsCandidateId),
  ['manual-camp-1', 'saved-camp-2'],
  'Actionable camp rendering should dedupe repeated CampOps candidate ids before render and suppress route-only candidates.',
);

const structureBufferedPins = buildCampOpsCampEndpointMapPins(
  recommendationSet([
    camp('inside-structure-buffer', 96, 1, { nearestResidentialStructureDistanceMiles: 0.9 }),
    camp('outside-structure-buffer', 92, 2, { source: 'manual', nearestResidentialStructureDistanceMiles: 1.15 }),
  ]),
);
assert.deepStrictEqual(
  structureBufferedPins.map((pin) => pin.campOpsCandidateId),
  ['outside-structure-buffer'],
  'Actionable camp pins should suppress any candidate inside the one-mile residential/structure buffer.',
);

assert.deepStrictEqual(
  normalizeRenderedCampScoutMarkers([
    {
      id: 'renderer-structure-buffer',
      latitude: 39.1,
      longitude: -120.1,
      title: 'Renderer blocked pin',
      sourceType: 'ecs_inferred',
      confidenceGrade: 'A',
      confidenceScore: 95,
      nearestStructureDistanceMiles: 0.5,
    },
    {
      id: 'renderer-clear-buffer',
      latitude: 39.2,
      longitude: -120.2,
      title: 'Renderer clear pin',
      sourceType: 'ecs_inferred',
      confidenceGrade: 'A',
      confidenceScore: 95,
      nearestStructureDistanceMiles: 1.25,
    },
  ]).map((pin) => pin.id),
  ['camp-scout-renderer-clear-buffer'],
  'Shared Camp Endpoint renderer should keep a final one-mile structure-buffer safety net for all ECS camp pins.',
);

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
assert(
    mapRendererSource.includes('camp-scout-marker camp-scout-grade-') &&
    mapRendererSource.includes('camp-scout-tent') &&
    mapRendererSource.includes('camp-scout-rank') &&
    mapRendererSource.includes('root.appendChild(rank)') &&
    !mapRendererSource.includes('camp-scout-label') &&
    !mapRendererSource.includes("label.textContent = 'camp'"),
  'Actionable camp pins should reuse the remote camp scout tent style with the rank hovering above the pin.',
);
assert(
  mapRendererSource.includes("send('pinTap', Object.assign({ kind: 'campScout' }, item))"),
  'Actionable camp pins should open the existing camp scout/Camp Intel tap path.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert(
  navigateSource.includes('buildCampOpsCampEndpointMapPins(campOpsRecommendationSet') &&
    navigateSource.includes('campEndpointMarkers={sharedCampPinMapMarkers}') &&
    navigateSource.includes('onCampEndpointTap={handleCampScoutTap}') &&
    navigateSource.includes('onCampScoutTap={handleCampScoutTap}'),
  'Navigate should feed actionable CampOps pins into MapRenderer through the Camp Endpoint marker prop while retaining legacy CampScout taps.',
);
assert(
  navigateSource.includes('isCampOpsMapPinPayload(payload)') &&
    navigateSource.includes('setSelectedCampOpsEndpointId(endpointId)') &&
    navigateSource.includes('campOpsDetail={selectedCampOpsIntel}') &&
    navigateSource.includes('onDismiss={selectedCampOpsIntel ? handleCampOpsDismiss : handleCampScoutDismiss}'),
  'Tapping an actionable CampOps pin should open and dismiss the existing Camp Intel popup path.',
);
assert(
  navigateSource.includes('scheduleRouteCampsiteClear') &&
    navigateSource.includes('setSelectedCampOpsEndpointId(null)') &&
    navigateSource.includes('applyCampsiteCandidates(null)'),
  'Actionable CampOps pins should clear with route-owned campsite candidates.',
);

console.log('Route camp research-only pin rendering checks passed.');
